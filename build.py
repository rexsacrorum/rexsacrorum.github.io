"""Build the site: copy `site/` to `dist/` and render the articles in `content/writing/`.

Python 3.11+, standard library only.

    python build.py            build into dist/
    python build.py --serve    build, then serve dist/ on http://localhost:8137

Articles are Markdown files with a small front matter block. Only the subset of Markdown
described in AGENTS.md is supported, and anything else stops the build, so that a typo
never ships as broken HTML. Charts are fenced `chart` blocks holding JSON.
"""

import argparse
from datetime import date
import functools
import html
import http.server
import json
from pathlib import Path
import re
import shutil
import statistics

ROOT = Path(__file__).resolve().parent
SITE = ROOT / 'site'
CONTENT = ROOT / 'content' / 'writing'
TEMPLATES = ROOT / 'templates'
BASE_URL = 'https://novosad.xyz'
STATIC_PAGES = ('/', '/cv/')
LATEST = '<!-- writing:latest -->'


class BuildError(Exception):
    pass


def esc(text):
    return html.escape(str(text), quote=True)


# --- Markdown subset

INLINE = re.compile(r'\*\*(\S(?:.*?\S)?)\*\*|(?<![\w*])\*(\S(?:[^*]*?\S)?)\*(?![\w*])|\[([^\]]+)\]\(([^)\s]+)\)')


def inline(text, where='text'):
    """Code spans, links, bold and italic. Everything else is escaped."""
    parts = text.split('`')
    if len(parts) % 2 == 0:
        raise BuildError(f'{where}: unclosed code span: {text[:60]}')
    out = []
    for index, part in enumerate(parts):
        if index % 2:
            out.append(f'<code>{esc(part)}</code>')
            continue

        def replace(match):
            bold, italic, label, url = match.groups()
            if bold:
                return f'<strong>{bold}</strong>'
            if italic:
                return f'<em>{italic}</em>'
            return f'<a href="{url}">{label}</a>'

        rendered = INLINE.sub(replace, esc(part))
        if '**' in re.sub(r'<[^>]+>', '', rendered):
            raise BuildError(f'{where}: unclosed ** in: {text[:60]}')
        out.append(rendered)
    return ''.join(out)


RAW_HTML = re.compile(r'<(div|figure|details|aside|section|table|ul|ol|p|blockquote|svg|img|iframe|video|hr)\b')


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def front_matter(text, path):
    if not text.startswith('---\n'):
        raise BuildError(f'{path}: missing front matter')
    head, closed, body = text[4:].partition('\n---\n')
    if not closed:
        raise BuildError(f'{path}: front matter has no closing --- line')
    meta = {}
    for line in head.splitlines():
        key, sep, value = line.partition(':')
        if not sep:
            raise BuildError(f'{path}: bad front matter line: {line}')
        meta[key.strip()] = value.strip()
    for key in ('title', 'slug', 'date', 'summary'):
        if not meta.get(key):
            raise BuildError(f'{path}: front matter needs "{key}"')
    try:
        date.fromisoformat(meta['date'])
    except ValueError:
        raise BuildError(f'{path}: "date" must be an ISO date such as 2026-11-14') from None
    meta['draft'] = meta.get('draft', 'false').lower()
    if meta['draft'] not in ('true', 'false'):
        raise BuildError(f'{path}: "draft" must be true or false')
    return meta, body


def table(lines, where):
    rows = [[cell.strip() for cell in line.strip().strip('|').split('|')] for line in lines]
    if len(rows) < 3 or not all(re.fullmatch(r':?-+:?', cell) for cell in rows[1]):
        raise BuildError(f'{where}: a table needs a header, a separator line and at least one row')
    if any(len(row) != len(rows[0]) for row in rows):
        raise BuildError(f'{where}: every table row needs {len(rows[0])} cells')
    head = ''.join(f'<th>{inline(cell, where)}</th>' for cell in rows[0])
    body = ''.join('<tr>' + ''.join(f'<td>{inline(cell, where)}</td>' for cell in row) + '</tr>' for row in rows[2:])
    return f'<div class="table"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


def markdown(text, path='article'):
    lines = text.replace('\r\n', '\n').split('\n')
    out = []
    ids = set()
    index = 0

    def take(predicate):
        nonlocal index
        taken = []
        while index < len(lines) and predicate(lines[index]):
            taken.append(lines[index])
            index += 1
        return taken

    while index < len(lines):
        line = lines[index]
        where = f'{path}:{index + 1}'
        if not line.strip():
            index += 1
        elif line.startswith('```'):
            language = line[3:].strip()
            index += 1
            block = take(lambda l: not l.startswith('```'))
            if index >= len(lines):
                raise BuildError(f'{where}: unclosed code block')
            index += 1
            if language == 'chart':
                try:
                    spec = json.loads('\n'.join(block))
                except json.JSONDecodeError as error:
                    raise BuildError(f'{where}: chart block is not JSON: {error}') from None
                out.append(chart(spec, where))
            else:
                out.append(f'<pre><code>{esc(chr(10).join(block))}</code></pre>')
        elif line.startswith('## ') or line.startswith('### '):
            level = 2 if line.startswith('## ') else 3
            title = line[level + 1:].strip()
            anchor = slug(title)
            if not anchor or anchor in ids:
                raise BuildError(f'{where}: heading "{title}" needs a unique id; reword it')
            ids.add(anchor)
            out.append(f'<h{level} id="{anchor}">{inline(title, where)}</h{level}>')
            index += 1
        elif line.startswith('#'):
            raise BuildError(f'{where}: only ## and ### headings are supported; the title comes from the front matter')
        elif line.startswith('- ') or line.startswith('1. '):
            ordered = not line.startswith('- ')
            marker = re.compile(r'\d+\. ' if ordered else r'- ')
            items = []
            while index < len(lines) and (marker.match(lines[index]) or (items and lines[index].startswith('  ') and lines[index].strip())):
                if marker.match(lines[index]):
                    items.append(marker.sub('', lines[index], count=1))
                elif re.match(r'\s+(- |\d+\. )', lines[index]):
                    raise BuildError(f'{path}:{index + 1}: nested lists are not supported')
                else:
                    items[-1] += ' ' + lines[index].strip()
                index += 1
            tag = 'ol' if ordered else 'ul'
            out.append(f'<{tag}>' + ''.join(f'<li>{inline(item, where)}</li>' for item in items) + f'</{tag}>')
        elif line.startswith('|'):
            out.append(table(take(lambda l: l.startswith('|')), where))
        elif line.startswith('> '):
            quote = ' '.join(l[2:].strip() for l in take(lambda l: l.startswith('> ')))
            out.append(f'<p class="aside">{inline(quote, where)}</p>')
        elif RAW_HTML.match(line):
            out.append('\n'.join(take(lambda l: l.strip())))
        elif line.startswith(' '):
            raise BuildError(f'{where}: indented text outside a list is not supported')
        else:
            first = index
            paragraph = take(lambda l: l.strip() and (index == first or not (re.match(r'(```|#|- |1\. |\||> )', l) or RAW_HTML.match(l))))
            out.append(f'<p>{inline(" ".join(l.strip() for l in paragraph), where)}</p>')
    return '\n'.join(out)


# --- charts
#
# Every chart is a <figure>. Colors come from CSS custom properties in site/assets/style.css
# (--series-1..3), which were checked for the light and the dark surface. Marks carry
# data-tip for the hover layer in site/assets/charts.js; every value is also in a visible
# label or in the figure's data table, so the tooltip never gates information.

def figure(spec, inner, extra_class='', data=''):
    caption = f'<b>{esc(spec["title"])}</b>' if spec.get('title') else ''
    if spec.get('caption'):
        caption += esc(spec['caption'])
    note = f'<p class="note">{inline(spec["note"])}</p>' if spec.get('note') else ''
    head = f'<figcaption>{caption}</figcaption>' if caption else ''
    classes = ('fig ' + extra_class).strip()
    return f'<figure class="{classes}">{head}{inner}{note}{data}</figure>'


def data_table(header, rows):
    """The values behind a chart, for readers without hover: touch, keyboard, no script."""
    head = ''.join(f'<th>{esc(cell)}</th>' for cell in header)
    body = ''.join('<tr>' + ''.join(f'<td>{esc(cell)}</td>' for cell in row) + '</tr>' for row in rows)
    return f'<details class="data"><summary>Show the data</summary><div class="table"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div></details>'


def need(spec, where, *keys):
    for key in keys:
        if key not in spec:
            raise BuildError(f'{where}: chart "{spec.get("type")}" needs "{key}"')


def chart_stats(spec, where):
    need(spec, where, 'items')
    tiles = ''.join(f'<div class="stat"><b>{esc(item["value"])}</b><span>{esc(item["label"])}</span></div>' for item in spec['items'])
    return f'<div class="stats">{tiles}</div>'


def bar_rows(rows, top):
    cells = []
    for name, value, label in rows:
        width = 0 if not top else max(value / top * 100, 0)
        cells.append(f'<span class="name">{esc(name)}</span>'
                     f'<span class="track" data-tip="{esc(name)}: {esc(label)}"><span class="fill" style="width:{width:.1f}%"></span></span>'
                     f'<span class="val">{esc(label)}</span>')
    return f'<div class="bars">{"".join(cells)}</div>'


def chart_bars(spec, where):
    if 'panels' in spec:
        panels = ''.join(
            f'<div class="panel"><p class="panel-title">{esc(panel["title"])}</p>{bar_rows(panel["rows"], max(row[1] for row in panel["rows"]))}</div>'
            for panel in spec['panels'])
        return figure(spec, f'<div class="panels">{panels}</div>')
    need(spec, where, 'rows')
    top = spec.get('max') or max(row[1] for row in spec['rows'])
    if any(row[1] > top for row in spec['rows']):
        raise BuildError(f'{where}: a bar is larger than "max"')
    return figure(spec, bar_rows(spec['rows'], top))


def chart_dots(spec, where):
    need(spec, where, 'values', 'alt')
    values = sorted(spec['values'])
    low, high = spec.get('min', 0), spec.get('max', 100)
    if values[0] < low or values[-1] > high:
        raise BuildError(f'{where}: a value is outside {low} to {high}')
    unit = spec.get('unit', '')
    width, left, right, radius, step = 480, 22, 22, 6, 13

    def x(value):
        return left + (value - low) * (width - left - right) / (high - low)

    placed = []
    for value in values:
        level = 0
        while any(other == level and abs(px - x(value)) < 2 * radius + 1 for px, other in placed):
            level += 1
        placed.append((x(value), level))
    top = max(level for _, level in placed)
    base = 38 + top * step + radius
    tip = spec.get('tip', '{v}' + unit)
    marks = ''.join(f'<circle class="dot" cx="{px:.1f}" cy="{base - radius - 4 - level * step}" r="{radius}" data-tip="{esc(tip.format(v=value))}"/>'
                    for (px, level), value in zip(placed, values))
    ticks = ''.join(f'<line class="axis" x1="{x(t):.1f}" y1="{base}" x2="{x(t):.1f}" y2="{base + 5}"/>'
                    f'<text x="{x(t):.1f}" y="{base + 20}" text-anchor="middle">{t}{esc(unit)}</text>' for t in spec.get('ticks', (low, high)))
    middle = ''
    if spec.get('median'):
        median = statistics.median(values)
        middle = (f'<line class="median" x1="{x(median):.1f}" y1="20" x2="{x(median):.1f}" y2="{base}"/>'
                  f'<text class="strong" x="{x(median) + 6:.1f}" y="16">median {median:g}{esc(unit)}</text>')
    svg = (f'<svg viewBox="0 0 {width} {base + 28}" role="img" aria-label="{esc(spec["alt"])}">'
           f'<line class="axis" x1="{left}" y1="{base}" x2="{width - right}" y2="{base}"/>{ticks}{middle}{marks}</svg>')
    listed = ', '.join(f'{value:g}{unit}' for value in values)
    return figure(spec, svg, data=data_table(['Values, sorted'], [[listed]]))


def chart_line(spec, where):
    need(spec, where, 'values', 'y_ticks', 'alt')
    values = spec['values']
    step = spec.get('x_step', 1)
    width, height, left, right, top, bottom = 640, 260, 46, 14, 14, 34
    y_max = max(spec['y_ticks'])
    if len(values) < 2 or max(values) > y_max or min(values) < 0:
        raise BuildError(f'{where}: a line needs at least two values, all between 0 and the largest y tick')
    x_max = (len(values) - 1) * step

    def x(index):
        return left + index * (width - left - right) / (len(values) - 1)

    def y(value):
        return top + (1 - value / y_max) * (height - top - bottom)

    grid = ''.join(f'<line class="grid" x1="{left}" y1="{y(t):.1f}" x2="{width - right}" y2="{y(t):.1f}"/>'
                   f'<text x="{left - 8}" y="{y(t) + 4:.1f}" text-anchor="end">{esc(spec.get("y_format", "{v}").format(v=t))}</text>'
                   for t in spec['y_ticks'])
    x_ticks = spec.get('x_ticks', [0, x_max])
    xs = ''.join(f'<text x="{left + t / x_max * (width - left - right):.1f}" y="{height - 12}" text-anchor="middle">{t:,}</text>' for t in x_ticks)
    points = ' '.join(f'{x(i):.1f},{y(v):.1f}' for i, v in enumerate(values))
    area = f'{left},{y(0):.1f} {points} {x(len(values) - 1):.1f},{y(0):.1f}'
    data = esc(json.dumps({'left': left, 'right': width - right, 'top': top, 'bottom': height - bottom, 'yMax': y_max,
                           'values': values, 'step': step, 'tip': spec.get('tip', '{x}: {v}')}))
    x_label = f'<text x="{width - right}" y="{height - 12}" text-anchor="end">{esc(spec["x_label"])}</text>' if spec.get('x_label') else ''
    svg = (f'<svg class="line-chart" viewBox="0 0 {width} {height}" role="img" aria-label="{esc(spec["alt"])}" data-line="{data}">'
           f'{grid}{xs}{x_label}<polygon class="area" points="{area}"/><polyline class="line" points="{points}"/>'
           f'<line class="cross" x1="0" y1="{top}" x2="0" y2="{height - bottom}"/><circle class="cross-dot" r="4"/>'
           f'<rect class="hit" x="{left}" y="{top}" width="{width - left - right}" height="{height - top - bottom}"/></svg>')
    listed = ', '.join(f'{value:g}' for value in values)
    return figure(spec, svg, 'wide', data_table([f'Values in order, one per {step} on the x axis'], [[listed]]))


def legend(names):
    return '<ul class="legend">' + ''.join(f'<li><i class="key s{index + 1}"></i>{esc(name)}</li>' for index, name in enumerate(names)) + '</ul>'


def chart_stack(spec, where):
    need(spec, where, 'series', 'rows', 'alt')
    if len(spec['series']) > 3:
        raise BuildError(f'{where}: the palette has three validated series; fold the rest into "Other"')
    rows = []
    for row in spec['rows']:
        if len(row) != len(spec['series']) or abs(sum(row) - 100) > 0.5:
            raise BuildError(f'{where}: every stack row needs one share per series, adding up to 100')
        label = ', '.join(f'{name} {value:g}%' for name, value in zip(spec['series'], row))
        segments = ''.join(f'<i class="s{index + 1}" style="flex-grow:{value}"></i>' for index, value in enumerate(row) if value > 0)
        rows.append(f'<div class="row" data-tip="{esc(label)}">{segments}</div>')
    body = f'{legend(spec["series"])}<div class="stack" role="img" aria-label="{esc(spec["alt"])}">{"".join(rows)}</div>'
    table_rows = [[str(number)] + [f'{value:g}%' for value in row] for number, row in enumerate(spec['rows'], 1)]
    return figure(spec, body, data=data_table(['Row'] + spec['series'], table_rows))


def chart_segments(spec, where):
    need(spec, where, 'parts', 'alt')
    total = sum(part[1] for part in spec['parts'])
    blocks = []
    keys = []
    for name, value, tone in spec['parts']:
        if tone not in ('a', 'b', 'c', 'd'):
            raise BuildError(f'{where}: a segment tone is one of a, b, c, d')
        share = value / total * 100
        # Only the two series tones carry a label inside; on the neutrals the contrast is too low.
        text = f'{share:.0f}%' if share >= 9 and tone in ('a', 'b') else ''
        blocks.append(f'<span class="seg {tone}" style="flex-grow:{value}" data-tip="{esc(name)}: {share:.0f}%">{text}</span>')
        keys.append(f'<li><i class="key {tone}"></i>{esc(name)}' + ('' if text else f' <span class="share">{share:.0f}%</span>') + '</li>')
    body = f'<div class="segs" role="img" aria-label="{esc(spec["alt"])}">{"".join(blocks)}</div><ul class="legend">{"".join(keys)}</ul>'
    return figure(spec, body)


def chart_xy(spec, where):
    """Up to three series of [x, y, label] points on shared axes that need not start at zero."""
    need(spec, where, 'series', 'x_ticks', 'y_ticks', 'alt')
    series = spec['series']
    if not 1 <= len(series) <= 3:
        raise BuildError(f'{where}: the palette has three validated series; fold the rest into "Other"')
    width, height, left, right, top, bottom = 640, 300, 52, 16, 14, 50
    x_low, x_high = min(spec['x_ticks']), max(spec['x_ticks'])
    y_low, y_high = min(spec['y_ticks']), max(spec['y_ticks'])
    if any(len(s['points']) < 2 or any(not (x_low <= p[0] <= x_high and y_low <= p[1] <= y_high) for p in s['points']) for s in series):
        raise BuildError(f'{where}: every series needs at least two points, all inside the ticks')

    def x(value):
        return left + (value - x_low) / (x_high - x_low) * (width - left - right)

    def y(value):
        return top + (1 - (value - y_low) / (y_high - y_low)) * (height - top - bottom)

    x_format, y_format = spec.get('x_format', '{v}'), spec.get('y_format', '{v}')
    y_tick = spec.get('y_tick_format', y_format)
    grid = ''.join(f'<line class="grid" x1="{left}" y1="{y(t):.1f}" x2="{width - right}" y2="{y(t):.1f}"/>'
                   f'<text x="{left - 8}" y="{y(t) + 4:.1f}" text-anchor="end">{esc(y_tick.format(v=t))}</text>' for t in spec['y_ticks'])
    grid += ''.join(f'<text x="{x(t):.1f}" y="{height - bottom + 18}" text-anchor="middle">{esc(x_format.format(v=t))}</text>' for t in spec['x_ticks'])
    if spec.get('x_label'):
        grid += f'<text x="{width - right}" y="{height - 8}" text-anchor="end">{esc(spec["x_label"])}</text>'
    if 'mark' in spec:
        level = y(spec['mark']['y'])
        grid += (f'<line class="median" x1="{left}" y1="{level:.1f}" x2="{width - right}" y2="{level:.1f}"/>'
                 f'<text class="strong" x="{width - right}" y="{level - 6:.1f}" text-anchor="end">{esc(spec["mark"]["label"])}</text>')
    tip = spec.get('tip', '{name} {label}: {x}, {y}')
    marks, rows = '', []
    for number, s in enumerate(series, 1):
        points = sorted(s['points'], key=lambda p: p[0])
        path = ' '.join(f'{x(p[0]):.1f},{y(p[1]):.1f}' for p in points)
        marks += f'<polyline class="xy-line c{number}" points="{path}"/>'
        for px, py, label in points:
            text = tip.format(name=s['name'], label=label, x=x_format.format(v=px), y=y_format.format(v=py))
            marks += f'<circle class="xy-dot c{number}" cx="{x(px):.1f}" cy="{y(py):.1f}" r="4" data-tip="{esc(text)}"/>'
            rows.append([s['name'], label, x_format.format(v=px), y_format.format(v=py)])
    svg = f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{esc(spec["alt"])}">{grid}{marks}</svg>'
    header = ['Series', spec.get('label_name', 'Point'), spec.get('x_label', 'x'), spec.get('y_label', 'y')]
    return figure(spec, legend([s['name'] for s in series]) + svg, 'wide', data_table(header, rows))


CHARTS = {'stats': chart_stats, 'bars': chart_bars, 'dots': chart_dots, 'line': chart_line, 'xy': chart_xy, 'stack': chart_stack,
          'segments': chart_segments}


def chart(spec, where='chart'):
    if not isinstance(spec, dict) or spec.get('type') not in CHARTS:
        raise BuildError(f'{where}: chart "type" must be one of {", ".join(CHARTS)}')
    try:
        return CHARTS[spec['type']](spec, where)
    except (KeyError, IndexError, TypeError, ValueError, ZeroDivisionError) as error:
        raise BuildError(f'{where}: chart "{spec["type"]}" has a missing or malformed field: {error!r}') from None


# --- pages

def fill(template, **values):
    def replace(match):
        key = match.group(1)
        if key not in values:
            raise BuildError(f'Template uses unknown value "{key}"')
        return values[key]

    return re.sub(r'\{\{\s*(\w+)\s*\}\}', replace, template)


def long_date(iso):
    day = date.fromisoformat(iso)
    return f'{day.day} {day.strftime("%B %Y")}'


def load_articles():
    articles = []
    for path in sorted(CONTENT.glob('*.md')):
        meta, body = front_matter(path.read_text(encoding='utf-8'), path.name)
        if meta['draft'] == 'true':
            continue
        meta['html'] = markdown(body, path.name)
        prose = re.sub(r'<(figure|pre)\b.*?</\1>', ' ', meta['html'], flags=re.S)
        words = len(re.sub(r'<[^>]+>', ' ', prose).split())
        meta['minutes'] = str(max(1, round(words / 230)))
        meta['url'] = f'/writing/{meta["slug"]}/'
        articles.append(meta)
    return sorted(articles, key=lambda article: article['date'], reverse=True)


def listing(articles):
    return '\n'.join(
        f'<li><span class="when">{date.fromisoformat(a["date"]).strftime("%b %Y")}</span><div>'
        f'<h3><a href="{a["url"]}">{esc(a["title"])}</a></h3><p>{esc(a["summary"])}</p></div></li>' for a in articles)


def build(out):
    out = Path(out)
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(SITE, out)
    base = (TEMPLATES / 'base.html').read_text(encoding='utf-8')
    articles = load_articles()

    for a in articles:
        main = fill((TEMPLATES / 'article.html').read_text(encoding='utf-8'),
                    kicker=esc(a.get('kicker', 'Writing')), heading=esc(a.get('heading', a['title'])), dek=esc(a.get('dek', a['summary'])),
                    date=a['date'], long_date=long_date(a['date']), minutes=a['minutes'], body=a['html'])
        schema = json.dumps({'@context': 'https://schema.org', '@type': 'Article', 'headline': a['title'], 'datePublished': a['date'],
                             'author': {'@type': 'Person', 'name': 'Bogdan Novosad', 'url': BASE_URL + '/'},
                             'mainEntityOfPage': BASE_URL + a['url']})
        page = fill(base, title=esc(a['title']), description=esc(a['summary']), canonical=BASE_URL + a['url'], og_type='article',
                    head=f'<meta property="article:published_time" content="{a["date"]}">\n  <script type="application/ld+json">{schema}</script>',
                    main=main)
        target = out / 'writing' / a['slug'] / 'index.html'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(page, encoding='utf-8', newline='\n')

    index = fill((TEMPLATES / 'writing.html').read_text(encoding='utf-8'), items=listing(articles))
    page = fill(base, title='Writing', description='Articles by Bogdan Novosad on software engineering, with the measurements behind them.', canonical=BASE_URL + '/writing/',
                og_type='website', head='', main=index)
    (out / 'writing').mkdir(exist_ok=True)
    (out / 'writing' / 'index.html').write_text(page, encoding='utf-8', newline='\n')

    landing = (out / 'index.html').read_text(encoding='utf-8')
    if landing.count(LATEST) != 1:
        raise BuildError(f'site/index.html must contain {LATEST} exactly once')
    landing = landing.replace(LATEST, listing(articles[:5]))
    (out / 'index.html').write_text(landing, encoding='utf-8', newline='\n')

    urls = [BASE_URL + page for page in STATIC_PAGES] + [BASE_URL + '/writing/'] + [BASE_URL + a['url'] for a in articles]
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sitemap += ''.join(f'  <url><loc>{url}</loc></url>\n' for url in urls) + '</urlset>\n'
    (out / 'sitemap.xml').write_text(sitemap, encoding='utf-8', newline='\n')

    updated = (articles[0]['date'] if articles else '2026-01-01') + 'T00:00:00Z'
    entries = ''.join(
        f'  <entry>\n    <title>{esc(a["title"])}</title>\n    <link href="{BASE_URL}{a["url"]}"/>\n    <id>{BASE_URL}{a["url"]}</id>\n'
        f'    <updated>{a["date"]}T00:00:00Z</updated>\n    <summary>{esc(a["summary"])}</summary>\n  </entry>\n' for a in articles)
    feed = (f'<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <title>Bogdan Novosad — Writing</title>\n'
            f'  <link href="{BASE_URL}/feed.xml" rel="self"/>\n  <link href="{BASE_URL}/writing/"/>\n  <id>{BASE_URL}/writing/</id>\n'
            f'  <updated>{updated}</updated>\n  <author><name>Bogdan Novosad</name></author>\n{entries}</feed>\n')
    (out / 'feed.xml').write_text(feed, encoding='utf-8', newline='\n')

    check_links(out)
    check_story(out / 'assets' / 'story.json')
    return articles


def check_links(out):
    """Every local href and src in the output must resolve to a file, and every #anchor to an id."""
    for page in out.rglob('*.html'):
        text = page.read_text(encoding='utf-8')
        ids = set(re.findall(r'\bid="([^"]+)"', text))
        for target in re.findall(r'\b(?:href|src)="([^"]+)"', text):
            if re.match(r'(https?:|mailto:|data:)', target):
                continue
            path, _, anchor = target.partition('#')
            path = path.split('?', 1)[0]
            if not path:
                if anchor and anchor not in ids:
                    raise BuildError(f'{page.relative_to(out)}: no element with id "{anchor}"')
                continue
            if not path.startswith('/'):
                raise BuildError(f'{page.relative_to(out)}: use root-relative links, found "{target}"')
            file = out / path.lstrip('/')
            if file.is_dir():
                file = file / 'index.html'
            if not file.is_file():
                raise BuildError(f'{page.relative_to(out)}: broken link "{target}"')
            if anchor and f'id="{anchor}"' not in file.read_text(encoding='utf-8'):
                raise BuildError(f'{page.relative_to(out)}: "{target}" has no such anchor')


CONDITION = re.compile(r'(!?)(\w+)(?:(>=|<)(\d+))?')


def holds(conditions, state):
    """The same rule as in site/assets/shell.js: "flag", "!flag", "count>=2" or "count<2"."""
    for condition in conditions:
        negate, name, op, number = CONDITION.fullmatch(condition).groups()
        value = state.get(name, 0)
        yes = value > 0 if not op else value < int(number) if op == '<' else value >= int(number)
        if yes == bool(negate):
            return False
    return True


def check_story(path):
    """The text game is a scene graph. Every target must exist, no state may be a dead end,
    and every scene and every ending must be reachable. Returns the titles of the endings."""
    def fail(message):
        raise BuildError(f'{path.name}: {message}')

    def names(value, where):
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            fail(f'{where} must be a list of strings')
        return value

    try:
        story = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        fail(error)
    scenes = story.get('scenes') if isinstance(story, dict) else None
    if not isinstance(scenes, dict) or not isinstance(story.get('title'), str) or story.get('start') not in scenes:
        fail('needs "title", "scenes" and a "start" that names a scene')
    for key, scene in scenes.items():
        where = f'scene "{key}"'
        if not isinstance(scene, dict) or not names(scene.get('text'), f'{where}: "text"') or not all(scene['text']):
            fail(f'{where} needs "text", a list of paragraphs')
        if sum(name in scene for name in ('choices', 'next', 'end')) != 1:
            fail(f'{where} needs exactly one of "choices", "next" and "end"')
        if 'end' in scene and not (isinstance(scene['end'], str) and scene['end']):
            fail(f'{where}: "end" is the title of the ending')
        if not all(re.fullmatch(r'\w+', name) for name in names(scene.get('set', []), f'{where}: "set"')):
            fail(f'{where}: "set" holds plain names')
        exits = scene.get('choices', scene.get('next', []))
        if not isinstance(exits, list) or ('end' not in scene and not exits):
            fail(f'{where} has no way out')
        for exit in exits:
            if not isinstance(exit, dict) or exit.get('to') not in scenes:
                fail(f'{where} leads to an unknown scene')
            if 'choices' in scene and not (isinstance(exit.get('label'), str) and exit['label']):
                fail(f'{where}: every choice needs a "label"')
            for condition in names(exit.get('when', []), f'{where}: "when"'):
                if not CONDITION.fullmatch(condition):
                    fail(f'{where}: cannot read the condition "{condition}"')
            if not all(re.fullmatch(r'\w+', name) for name in names(exit.get('set', []), f'{where}: "set"')):
                fail(f'{where}: "set" holds plain names')

    def bump(state, keys):
        state = dict(state)
        for key in keys:
            state[key] = min(state.get(key, 0) + 1, 9)
        return state

    # Walk every (scene, state) pair the player can get into.
    first = (story['start'], ())
    seen, queue = {first}, [first]
    while queue:
        key, frozen = queue.pop()
        scene = scenes[key]
        state = bump(dict(frozen), scene.get('set', []))
        if 'end' in scene:
            continue
        exits = [exit for exit in scene.get('choices', scene.get('next')) if holds(exit.get('when', []), state)]
        if not exits:
            fail(f'scene "{key}" can leave the player with no way out')
        for exit in exits[:1] if 'next' in scene else exits:
            step = (exit['to'], tuple(sorted(bump(state, exit.get('set', [])).items())))
            if step not in seen:
                seen.add(step)
                queue.append(step)
    lost = sorted(set(scenes) - {key for key, _ in seen})
    if lost:
        fail(f'no path leads to: {", ".join(lost)}')
    return sorted({scene['end'] for scene in scenes.values() if 'end' in scene})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', type=Path, default=ROOT / 'dist', help='output directory (default: dist)')
    parser.add_argument('--serve', nargs='?', const=8137, type=int, metavar='PORT', help='serve the output after building')
    args = parser.parse_args()
    try:
        articles = build(args.out)
    except BuildError as error:
        parser.exit(1, f'build failed: {error}\n')
    print(f'Built {len(articles)} article(s) into {args.out}.')
    if args.serve:
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(args.out))
        print(f'Serving on http://localhost:{args.serve}')
        http.server.ThreadingHTTPServer(('127.0.0.1', args.serve), handler).serve_forever()


if __name__ == '__main__':
    main()
