# Agent Notes

Hand-written static site for https://novosad.xyz. No generator, no build step.

- `site/` is deployed as-is to GitHub Pages by `.github/workflows/pages.yml` on push to `main`.
- `site/index.html` is the landing page, `site/cv/index.html` the CV (keep the `/cv/` URL; LinkedIn links to it).
- `site/assets/style.css` holds all styling, including the A4 print rules for the CV. Pages caches assets for 10 minutes, so bump the `?v=` on its link in every page when it changes.
- The custom domain is set in the repository's Pages settings, not via a CNAME file.
- PDFs and images are in Git LFS (see `.gitattributes`); the workflow checks out with `lfs: true`.

## Regenerating the CV PDF

After changing the CV page, serve `site/` locally and print it with headless Edge, then check it is still two A4 pages:

    python -m http.server 8137 --directory site
    msedge --headless --disable-gpu --no-pdf-header-footer --print-to-pdf=site/Bogdan_Novosad_CV.pdf http://localhost:8137/cv/

## Content rules

- Keep the CV ATS-friendly: real text, plain headings, single-column body.
- Never mention the employer's product or client names; describe it as a learning management platform used by schools across Europe.
- Describe what the GliderMCP tools do, not productivity gains.
