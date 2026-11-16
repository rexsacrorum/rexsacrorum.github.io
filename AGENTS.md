# Agent Notes

Static site for https://novosad.xyz. The landing page and the CV are hand-written HTML; articles are Markdown rendered by `build.py`.

- `python build.py` copies `site/` to `dist/` and renders `content/writing/*.md` into `dist/writing/<slug>/`. It also writes the writing index, `sitemap.xml` and `feed.xml`, and fills the `<!-- writing:latest -->` marker on the landing page with the newest articles. `dist/` is not committed.
- The site is served by Cloudflare Workers (static assets); a push to `main` deploys it through `.github/workflows/cloudflare.yml`. See "Deployment" below.
- `python build.py --serve` builds and serves `dist/` on http://localhost:8137. Run it again after an edit.
- `site/index.html` is the landing page, `site/cv/index.html` the CV (keep the `/cv/` URL; LinkedIn links to it).
- `site/assets/style.css` holds all styling, including the A4 print rules for the CV and the chart styles. Browsers keep files under `/assets/` for a day (`site/_headers`), so bump the `?v=` on its link in every page and in `templates/base.html` when it changes. The same goes for `charts.js`, `theme.js`, `term.js` and `shell.js`. A test checks that the four page shells carry the same versions.
- The design is a terminal look: monospace headings, a shell prompt in the header, no rounded corners, and few rules or frames. Dark is the default for every visitor. The second theme is called `light` in the code and on the button, and it is the blue file-manager palette, not a white page. The choice is stored under the `scheme` key.
- `site/assets/term.js` adds the key bar at the bottom, the keyboard shortcuts, the console commands, the uptime counter in the footer (it counts from `data-since`; without the script the footer reads "up since 1989") and the hidden CRT mode (type `noisia`). Arrow keys move a cursor over links only on pages that are lists of links; on an article and on the CV they scroll. The pages must keep working without this script.
- `site/assets/shell.js` is the terminal behind the `>_` button in the header; see "The terminal" below.
- The print rules at the end of `style.css` reset every colour token and pin the CV's fonts, so the CV PDF does not follow the screen design. Theme overrides sit inside `@media screen` for the same reason.
- The custom domain is attached to the Worker in the Cloudflare dashboard, not in `wrangler.jsonc`. The zone's "Always Use HTTPS" setting redirects `http://` to `https://`.
- PDFs and images are in Git LFS (see `.gitattributes`); the workflow checks out with `lfs: true`. Charts are inline SVG and HTML, so they are not LFS files.

## Deployment

`.github/workflows/cloudflare.yml` runs the tests and the build on push to `main`, then `wrangler deploy` uploads `dist/` to the Worker `novosad-xyz`. `wrangler.jsonc` is its whole configuration.

- The script in `worker/` runs only for `/tg/*` (`run_worker_first` in `wrangler.jsonc`). Every other request is a static file, free and outside the Workers request quota. Keep that list narrow.
- The workflow needs two repository secrets, `CLOUDFLARE_API_TOKEN` (made from the "Edit Cloudflare Workers" template, limited to the one account) and `CLOUDFLARE_ACCOUNT_ID`. Neither value belongs in the repository.
- Do not add `routes` or a custom domain to `wrangler.jsonc`: a deploy would then create DNS records by itself. The owner makes every DNS change by hand.
- `site/_headers` sets the response headers of static files: the cache time of `/assets/*`, `nosniff`, the referrer policy, and `noindex` on the `workers.dev` address. It does not apply to responses a function produces. `build.py --serve` ignores it.
- An unknown path gets `404.html` with status 404 (`not_found_handling`). `/cv` redirects to `/cv/`, and a path ending in `.html` or `index.html` redirects to the short form.
- Cloudflare does not answer `Range` requests for static files with a part; it sends the whole file.
- To look at a build before it is live: `python build.py`, then `npx wrangler versions upload`, which prints a preview address and does not change what visitors get.

## The terminal

The header prompt (`.mark`) at the top left is the link to the home page, with or without scripts; keep it so. `site/assets/shell.js` adds a `>_` button to the navigation, before the theme switch, that drops a terminal from the top over the whole screen. The key under Esc opens the panel too. The panel opens empty, with no greeting; an unknown command names `help`. The header cursor blinks for every visitor, also with `prefers-reduced-motion`; that is the owner's choice.

- The way out is `exit` (also `quit`, `logout`, `:q`, `:wq`, `ZZ`). There is no close button and Esc does not close. The plain hint is printed to the browser console when the panel opens, the panel's `aria-label` tells a screen reader, and three presses of Esc print a hint. Do not add a close control.
- The terminal does not reopen after a reload or on another page.
- While the panel is open the rest of the page is `inert`, and `term.js` ignores keys (it checks the `term-open` class on `<html>`), so the single-key shortcuts and `noisia` do not fire.
- Commands are entries in the `commands` table: `about` puts a command into `help`, and one without it is hidden. `usage` is what `help <command>` prints; `help ls` is where the `-a` flag is named, which leads to the hidden files. A command that needs several lines of input sets a mode, `{ prompt, input(line), stop() }`; the game, `mail` and `tg` are modes, and a later `ask` command would be one more. `shutdown` (hidden, also `poweroff`) takes the machine down line by line and leaves a black screen until a key or a tap; `shutdown -r` (also `reboot`) brings it back by itself. Both boot into Omarchy and end at an empty prompt: boot lines, then the Omarchy logo with one pass of its sheen. The lines are `DOWN` and `BOOT` in `shell.js`; the logo and the sheen are copied from the Omarchy repository under its MIT licence, and the comment above `LOGO` carries the notice, so keep it. The files shown by `ls` and `cat` are the `files` table at the top; the content rules below apply to them. The panel's own prompt is `guest:~$`, not the nickname.
- In the `light` theme the panel is a black shell under the blue panels. It follows the CRT mode through the colour tokens, and is hidden in print.
- The panel fills the visible height (`visualViewport`, so on a phone what the touch keyboard leaves). On a phone its text is 16px so that iOS does not zoom into the input.

### The story

`review` (not in `help`; `ls -a` shows `.last_review`, which names it, next to `.plan`, a line about current work) starts a text game. The story is data: `site/assets/story.json`, fetched on first use. The engine in `shell.js` only walks it, so the text can be edited without touching code.

- A scene has `text` (a list of paragraphs) and exactly one of `choices`, `next` and `end`. A choice is `{ "label", "to" }`. `next` is a list of routes `{ "to" }` taken without asking, first match wins, so the last one needs no condition. `end` is the title of an ending.
- Every scene is a screen of its own. Starting the game wipes the terminal, and each choice wipes the last scene and prints the chosen label on the first line. The paragraphs appear one by one (`PACE` in `shell.js`), the choices last; a key, a tap or Enter prints the rest at once, and with `prefers-reduced-motion` nothing is paced. A mode that prints in steps has a `skip()` for this.
- `"set": ["name"]` on a scene or a choice adds one to a counter. `"when": [...]` on a choice or a route lists conditions that must all hold: `"name"`, `"!name"`, `"name>=2"` or `"name<2"`.
- `build.py` (`check_story`) stops the build when a target does not exist, when some state leaves the player with no choice, or when a scene or an ending cannot be reached.
- After editing the story, bump `?v=` in `STORY_URL` in `shell.js`, and then the version of `shell.js` in the page shells.
- The story is original. Do not retell or quote an existing book or game in it.

### Chat

`tg` is a chat with the owner through his Telegram bot. It asks for a nick, then every line goes to the bot's chat with the owner as `nick #id` and the text. The owner answers by replying to that message in Telegram, and the answer is printed in the terminal as `bogdan> ...`.

- The other end is `worker/index.js`: `POST /tg/send`, `/tg/poll` and `/tg/hook` (Telegram's webhook). The tables are in `worker/schema.sql`, in the D1 database `novosad-tg`. `node --test worker/test.mjs` runs its tests against SQLite and a fake Telegram; the workflow runs them before a deploy.
- An answer must be a reply to a visitor's message. That is the only routing, so an answer cannot reach another visitor. A message that is not a reply goes nowhere and the bot says so. A reply with `/ban` closes that chat.
- The nick is a label and is not verified. A visitor's lines are not stored on the server; the owner's answers are kept until the chat is seven days idle. The chat's token is in `localStorage` under `tg`, so `tg` returns to the chat later; `/forget` drops it.
- The page asks for answers only while the chat is open, the tab is visible and the last message is recent: every 3 seconds for two minutes, then every 10, then every 30, and not at all after half an hour until the next line. Keep it that way: each poll is a Worker request.
- Limits: per address in `wrangler.jsonc` (`ratelimits`), plus a daily ceiling of new chats and a ceiling of messages per chat in `worker/index.js`. Requests must be JSON `POST`s whose `Origin` is the site's own.
- The secrets are `TG_TOKEN` (the bot's token), `TG_SECRET` (the webhook's `secret_token`) and `TG_CHAT` (the owner's Telegram user id). They are set with `npx wrangler secret put <NAME>` and never written into the repository, the page or a chat. An unset secret matches nothing, so without them the hook refuses everything and `tg` answers "not sent".
- To run it locally: put test values and `TG_API=http://127.0.0.1:<port>` of a stand-in server into `.dev.vars` (ignored by git), create the tables with `npx wrangler d1 execute novosad-tg --local --file worker/schema.sql`, then `python build.py` and `npx wrangler dev`.

### Mail

`mail` takes a one-line message of up to 1000 characters. `MAIL_ENDPOINT` at the top of `shell.js` is empty, so today it opens the visitor's mail client with a `mailto:` link to bogdan@novosad.xyz. When a backend exists, put its URL there: the script then also asks for an optional reply address and sends `POST` with JSON `{"message": "...", "reply": "..."}`, expects a 2xx answer, and falls back to `mailto:` on any failure. The backend must fix the recipient on its side, limit the length and the rate, allow only the site's origin, and keep its secrets out of this repository and out of the page.

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
