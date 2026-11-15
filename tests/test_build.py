import importlib.util
from pathlib import Path
import tempfile
import unittest
from xml.etree import ElementTree

SPEC = importlib.util.spec_from_file_location('build', Path(__file__).resolve().parents[1] / 'build.py')
build = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build)


class MarkdownTests(unittest.TestCase):
    def test_blocks_and_inline(self):
        html = build.markdown('## A title\n\nText with `a<b` and **bold** and a [link](https://example.com/?a=1&b=2).\n\n- one\n  more\n- two\n\n1. first\n2. second\n')
        self.assertIn('<h2 id="a-title">A title</h2>', html)
        self.assertIn('<code>a&lt;b</code>', html)
        self.assertIn('<strong>bold</strong>', html)
        self.assertIn('<a href="https://example.com/?a=1&amp;b=2">link</a>', html)
        self.assertIn('<ul><li>one more</li><li>two</li></ul>', html)
        self.assertIn('<ol><li>first</li><li>second</li></ol>', html)

    def test_table_and_code(self):
        html = build.markdown('| A | B |\n| --- | --- |\n| 1 | `x` |\n\n```\na < b\n```\n')
        self.assertIn('<th>A</th><th>B</th>', html)
        self.assertIn('<td>1</td><td><code>x</code></td>', html)
        self.assertIn('<pre><code>a &lt; b</code></pre>', html)

    def test_text_is_escaped(self):
        self.assertIn('&lt;script&gt;', build.markdown('A paragraph with <script> in the middle.'))

    def test_unsupported_markdown_stops_the_build(self):
        for text in ('# Top heading', '```\nnever closed', '    indented', 'an `unclosed span', '| a |\n| b |',
                     'an **unclosed bold', '- a\n  - nested', '| a | b |\n| --- | --- |\n| only one |',
                     '## Same\n\n## Same', '## !!!',
                     '```chart\nnot json\n```', '```chart\n{"type": "pie"}\n```', '```chart\n{"type": "dots", "values": [1]}\n```',
                     '```chart\n{"type": "stats", "items": [{"value": "1"}]}\n```',
                     '```chart\n{"type": "line", "values": [5], "y_ticks": [0, 10], "alt": "x"}\n```',
                     '```chart\n{"type": "line", "values": [5, 50], "y_ticks": [0, 10], "alt": "x"}\n```',
                     '```chart\n{"type": "stack", "series": ["a", "b"], "rows": [[60, 60]], "alt": "x"}\n```',
                     '```chart\n{"type": "dots", "values": [150], "alt": "x"}\n```'):
            with self.assertRaises(build.BuildError, msg=text):
                build.markdown(text)

    def test_text_that_only_looks_like_markup_stays_text(self):
        html = build.markdown('Costs are 5 * 3 * 2 here.\n\n<5% of cost is a paragraph.\n\n2026. was a year.')
        self.assertNotIn('<em>', html)
        self.assertIn('<p>&lt;5% of cost is a paragraph.</p>', html)
        self.assertIn('<p>2026. was a year.</p>', html)
        self.assertIn('<em>word</em>', build.markdown('One *word* in italics.'))

    def test_front_matter(self):
        meta, body = build.front_matter('---\ntitle: A: b\nslug: a\ndate: 2026-01-02\nsummary: s\n---\nBody', 'x.md')
        self.assertEqual((meta['title'], body), ('A: b', 'Body'))
        for text in ('---\ntitle: A\n---\nBody', '---\ntitle: A\nslug: a\ndate: 2026-01-02\nsummary: s\nBody',
                     '---\ntitle: A\nslug: a\ndate: yesterday\nsummary: s\n---\nBody',
                     '---\ntitle: A\nslug: a\ndate: 2026-01-02\nsummary: s\ndraft: maybe\n---\nBody'):
            with self.assertRaises(build.BuildError, msg=text):
                build.front_matter(text, 'x.md')
        meta, _ = build.front_matter('---\ntitle: A\nslug: a\ndate: 2026-01-02\nsummary: s\ndraft: True\n---\nBody', 'x.md')
        self.assertEqual(meta['draft'], 'true')


class ChartTests(unittest.TestCase):
    def test_bars_scale_to_the_largest_row(self):
        html = build.chart({'type': 'bars', 'title': 'T', 'rows': [['a', 50, '50%'], ['b', 25, '25%']]})
        self.assertIn('width:100.0%', html)
        self.assertIn('width:50.0%', html)
        self.assertIn('data-tip="b: 25%"', html)

    def test_dots_place_every_value_and_the_median(self):
        html = build.chart({'type': 'dots', 'values': [10, 10, 30], 'alt': 'three dots', 'median': True, 'unit': '%'})
        self.assertEqual(html.count('<circle'), 3)
        self.assertIn('median 10%', html)
        self.assertIn('aria-label="three dots"', html)

    def test_stack_refuses_more_series_than_the_palette_has(self):
        with self.assertRaises(build.BuildError):
            build.chart({'type': 'stack', 'series': ['a', 'b', 'c', 'd'], 'rows': [[1, 1, 1, 1]], 'alt': 'x'})

    def test_charts_with_hover_only_values_carry_a_data_table(self):
        dots = build.chart({'type': 'dots', 'values': [10, 30], 'alt': 'x', 'unit': '%'})
        self.assertIn('<details class="data">', dots)
        self.assertIn('10%, 30%', dots)
        stack = build.chart({'type': 'stack', 'series': ['a', 'b'], 'rows': [[60, 40]], 'alt': 'x'})
        self.assertIn('<td>60%</td><td>40%</td>', stack)
        line = build.chart({'type': 'line', 'values': [1, 9], 'y_ticks': [0, 10], 'alt': 'x'})
        self.assertIn('<details class="data">', line)

    def test_segments_show_each_rounded_share_once(self):
        html = build.chart({'type': 'segments', 'parts': [['big', 60, 'a'], ['small', 5, 'b'], ['rest', 35, 'c']], 'alt': 'x'})
        self.assertIn('>60%</span>', html)
        self.assertIn('small <span class="share">5%</span>', html)
        self.assertIn('rest <span class="share">35%</span>', html)

    def test_labels_are_escaped(self):
        html = build.chart({'type': 'segments', 'parts': [['<b>x</b>', 1, 'a']], 'alt': 'x'})
        self.assertNotIn('<b>x</b>', html)


class SiteTests(unittest.TestCase):
    def test_the_site_builds_with_working_links(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / 'dist'
            articles = build.build(out)
            self.assertTrue((out / 'index.html').is_file())
            landing = (out / 'index.html').read_text(encoding='utf-8')
            self.assertNotIn(build.LATEST, landing)
            for article in articles:
                self.assertTrue((out / 'writing' / article['slug'] / 'index.html').is_file())
            for name in ('feed.xml', 'sitemap.xml'):
                ElementTree.parse(out / name)

    def test_reading_time_counts_prose_and_not_chart_data(self):
        with tempfile.TemporaryDirectory() as directory:
            articles = build.build(Path(directory) / 'dist')
        for article in articles:
            prose = build.re.sub(r'<(figure|pre)\b.*?</\1>', ' ', article['html'], flags=build.re.S)
            words = len(build.re.sub(r'<[^>]+>', ' ', prose).split())
            self.assertNotIn('<details', prose)
            self.assertEqual(article['minutes'], str(max(1, round(words / 230))))

    def test_source_files_hold_no_control_characters(self):
        root = Path(__file__).resolve().parents[1]
        for path in [root / 'build.py', *root.glob('templates/*.html'), *root.glob('content/writing/*.md')]:
            text = path.read_text(encoding='utf-8')
            self.assertTrue(all(ch in '\n\t' or ord(ch) >= 32 for ch in text), path.name)

    def test_a_broken_link_stops_the_build(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            (out / 'index.html').write_text('<a href="/missing/">x</a>', encoding='utf-8')
            with self.assertRaises(build.BuildError):
                build.check_links(out)


if __name__ == '__main__':
    unittest.main()
