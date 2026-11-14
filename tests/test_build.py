import importlib.util
from pathlib import Path
import tempfile
import unittest

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
                     '```chart\nnot json\n```', '```chart\n{"type": "pie"}\n```', '```chart\n{"type": "dots", "values": [1]}\n```'):
            with self.assertRaises(build.BuildError, msg=text):
                build.markdown(text)

    def test_front_matter(self):
        meta, body = build.front_matter('---\ntitle: A: b\nslug: a\ndate: 2026-01-02\nsummary: s\n---\nBody', 'x.md')
        self.assertEqual((meta['title'], body), ('A: b', 'Body'))
        with self.assertRaises(build.BuildError):
            build.front_matter('---\ntitle: A\n---\nBody', 'x.md')


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

    def test_labels_are_escaped(self):
        html = build.chart({'type': 'segments', 'parts': [['<b>x</b>', 1, 'a']], 'alt': 'x'})
        self.assertNotIn('<b>x</b>', html)


class SiteTests(unittest.TestCase):
    def test_the_site_builds_with_working_links(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / 'dist'
            articles = build.build(out)
            self.assertTrue((out / 'index.html').is_file())
            self.assertNotIn(build.LATEST, (out / 'index.html').read_text(encoding='utf-8'))
            for article in articles:
                self.assertTrue((out / 'writing' / article['slug'] / 'index.html').is_file())
            self.assertIn('<feed', (out / 'feed.xml').read_text(encoding='utf-8'))

    def test_a_broken_link_stops_the_build(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            (out / 'index.html').write_text('<a href="/missing/">x</a>', encoding='utf-8')
            with self.assertRaises(build.BuildError):
                build.check_links(out)


if __name__ == '__main__':
    unittest.main()
