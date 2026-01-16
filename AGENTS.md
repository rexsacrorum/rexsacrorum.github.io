# Agent Notes (Codex)

This repo is a Hugo site (PaperMod theme via Hugo Modules).

## Quick commands

- Dev server: `hugo server -D`
- Production build: `hugo --minify --gc`

## Theme + styling

- Theme is imported in `hugo.yml` via `module.imports` (no checked-in `themes/` content).
- Prefer PaperMod variables and patterns; avoid adding heavy JS or external CSS frameworks for site pages.
- Put site-specific styling overrides in `assets/css/extended/*.css` (PaperMod auto-includes it).

## CV page

The CV is a first-class Hugo page at `/cv/`:

- Content stub: `content/cv/index.md`
- Template: `layouts/cv/single.html`
- Data source (edit this for content updates): `data/cv.yaml`
- Styling: `assets/css/extended/cv.css`

Legacy standalone HTML is kept at `static/cv-standalone/index.html` (served at `/cv-standalone/`); avoid using `static/cv/` for the CV URL to prevent conflicts with the Hugo page.

## Content hygiene

- Keep CV content ATS-friendly (plain text, consistent headings, minimal icons).
- Prefer ASCII punctuation (avoid “smart quotes”) unless there’s a specific reason; it helps prevent encoding issues in downstream tools.
