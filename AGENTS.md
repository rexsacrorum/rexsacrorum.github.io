# Agent Notes

Static site for https://novosad.xyz. The landing page and the CV are hand-written HTML; articles are Markdown rendered by `build.py`.

- `python build.py` copies `site/` to `dist/` and renders `content/writing/*.md` into `dist/writing/<slug>/`. It also writes the writing index, `sitemap.xml` and `feed.xml`, and fills two markers on the landing page: `<!-- writing:latest -->` with the newest articles and `<!-- writing:issue -->` with the month of the newest article (the "issue 2026.11" in the top strip). `dist/` is not committed.
- `.github/workflows/pages.yml` runs the tests and the build on push to `main` and deploys `dist/`.
- `python build.py --serve` builds and serves `dist/` on http://localhost:8137. Run it again after an edit.
- `site/index.html` is the landing page, `site/cv/index.html` the CV (keep the `/cv/` URL; LinkedIn links to it).
- `site/assets/style.css` holds all styling, including the A4 print rules for the CV and the chart styles. Pages caches assets for 10 minutes, so bump the `?v=` on its link in every page and in `templates/base.html` when it changes. The same goes for `charts.js`, `theme.js` and `term.js`.
- The design is a terminal look: monospace headings, a shell prompt in the header, no rounded corners, and few rules or frames. Dark is the default for every visitor. The second theme is called `light` in the code and on the button, and it is the blue file-manager palette, not a white page. The choice is stored under the `scheme` key.
- `site/assets/term.js` adds the key bar at the bottom, the keyboard shortcuts, the console commands and the hidden CRT mode (type `noisia`). Arrow keys move a cursor over links only on pages that are lists of links; on an article and on the CV they scroll. The pages must keep working without this script.
- The print rules at the end of `style.css` reset every colour token and pin the CV's fonts, so the CV PDF does not follow the screen design. Theme overrides sit inside `@media screen` for the same reason.
- The custom domain is set in the repository's Pages settings, not via a CNAME file.
- PDFs and images are in Git LFS (see `.gitattributes`); the workflow checks out with `lfs: true`. Charts are inline SVG and HTML, so they are not LFS files.

## Writing an article

Add `content/writing/<name>.md`. The front matter needs `title`, `slug`, `date` (ISO) and `summary`; `heading`, `dek` and `kicker` are optional, and `draft: true` keeps the article out of the build.

The body is a deliberately small Markdown subset: `##` and `###` headings, paragraphs, `-` and `1.` lists (one level), pipe tables, fenced code, `> ` asides, raw HTML blocks, and inline code, links, bold and italic. Unsupported block syntax (other headings, nested lists, indented text, ragged tables, unclosed code or `**`) stops the build with the file and line, so that a typo fails the build and does not ship as broken HTML. Two limits are not caught: a URL containing a parenthesis must be percent-encoded, and a raw HTML block must start with a block tag such as `<div>` or `<figure>`.

A chart is a fenced `chart` block holding JSON. The types are `stats`, `bars` (with optional `panels`), `dots`, `line`, `stack` and `segments`; `build.py` has one function per type and the article in `content/writing/` shows each. Rules for charts:

- Give every `dots`, `line`, `stack` and `segments` chart an `alt` that states the finding in words. The build adds a "Show the data" table to `dots`, `line` and `stack`, so no value exists only in a tooltip; state the finding itself in the text or the note.
- Marks use `--series-1` to `--series-3` from `style.css`. A chart is always a dark panel (`--chart-surface`) in both themes, so the series colours meet one surface; all three are above 4.5:1 against it. They were checked for colour-blind separation. The site accent is a separate token and must not be used for marks. `stack` refuses a fourth series. Fold extra series into "Other" or use small multiples.
- One hue for a single series. Never two y-axes. Text wears the text colours, never a series colour.

Sources are linked where the claim is made. Do not quote more than a short phrase from a source; paraphrase and link.

## Regenerating the CV PDF

After changing the CV page, build and serve the site locally and print the CV with headless Edge, then check it is still two A4 pages:

    python build.py --serve
    msedge --headless --disable-gpu --no-pdf-header-footer --print-to-pdf=site/Bogdan_Novosad_CV.pdf http://localhost:8137/cv/

## Content rules

- Keep the CV ATS-friendly: real text, plain headings, single-column body.
- Never mention the employer's product or client names; describe it as a learning management platform used by schools across Europe.
- Describe what the GliderMCP tools do, not productivity gains.
- The site's identity is the name Bogdan Novosad and the domain novosad.xyz. Do not use the nickname "sacrorum" in visible text, ASCII art, HTML comments or console messages. Two exceptions: the shell prompt in the header (`sacrorum:~$`), and the `rexsacrorum` handle inside the GitHub and Telegram URLs.
