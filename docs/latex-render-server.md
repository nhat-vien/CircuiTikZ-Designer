# LaTeX preview on the web (render server)

The static web build (GitHub Pages / Vercel) cannot run TeX inside the browser —
compilation needs real binaries (`pdflatex`/`tectonic` + `pdftocairo`). The desktop
(Electron) app solves this with a local IPC bridge. For the web build, the same
pipeline is exposed as a tiny standalone HTTP render server:

```
GET  /health    -> { ok, tectonic, pdflatex, converter }
POST /compile   body: { "latex": "<full LaTeX source>" }
                reply: { ok, svg?, bbox?, error?, errors? }
```

The pipeline is shared between desktop and web via `src/scripts/latex/latexCompileCore.js`
(used by both `src/scripts/latex/latexRenderer.js` and `server/renderServer.js`).

## Configure in the app

In the **web build**, open *General settings* (⚙ in the navbar) and fill in
**LaTeX render server (web)** with the server base URL (e.g. `https://render.example.com`),
press **Save** — the probe result is shown underneath. The LaTeX button in the
document panel becomes enabled when the probe succeeds.
The value is stored per-browser in `localStorage` (`ctd-latex-server`).

In the **desktop build** the Electron bridge (`window.latexRenderer`) is used
automatically; the settings section is not shown.

## Run locally

```bash
node server/renderServer.js                 # listens on :8088
# in the app, set render server to http://localhost:8088 and Save
```

## Run with Docker

```bash
docker build -f Dockerfile -t ctd-render-server .
# restrict CORS to your GitHub Pages origin in production:
docker run -d -p 8088:8088 \
  -e ALLOW_ORIGIN="https://<user>.github.io" \
  ctd-render-server
```

The image ships TeX Live (pdflatex, `circuitikz`, `standalone`, `siunitx` included) and
poppler-utils (pdftocairo) — fully offline after the build.

`siunitx` comes from the Debian package `texlive-science`, which is a separate package
from `texlive-latex-extra`. Without it every compile fails with
`File `siunitx.sty' not found`, because the exported preamble uses
`\usepackage[siunitx, RPvoltages]{circuitikz}`.

### Missing .sty when running without Docker

Install the package the same way on the host that runs `server/renderServer.js`:

```bash
apt-get install -y texlive-science       # Debian/Ubuntu: siunitx.sty
# or, for a TeX Live from TUG:
tlmgr install siunitx
```

## Deploy

- **Render.com (free plan, no credit card)** — one-click blueprint:
  1. Push this repo to GitHub
  2. render.com → **New → Blueprint** → select the repo (reads `render.yaml`)
  3. Copy the service URL (`https://ctd-render-server.onrender.com`) into the app's
     *General settings → LaTeX render server (web)*
  
  The free plan sleeps after 15 minutes without traffic; the first request after a
  wake-up takes ~1 minute (the in-app Save probe is a handy way to wait for it).

Other options:

- **Google Cloud Run** (always-free tier needs a card): deploy the Dockerfile,
  scale-to-zero, effectively $0 for personal usage
- **Fly.io / Railway / Koyeb / a VPS**: paid plans, deploy the Dockerfile
- **Local machine + Cloudflare Tunnel (free)**: `node server/renderServer.js` on your
  own PC exposed as a public URL — no sleeping, full control

The server needs real binaries, so it must NOT run on static hosts
(GitHub Pages / Vercel static / Netlify).

Environment:

| Variable       | Default | Meaning                                        |
| -------------- | ------- | ---------------------------------------------- |
| `PORT`         | `8088`  | listen port                                    |
| `ALLOW_ORIGIN` | `*`     | CORS `Access-Control-Allow-Origin` value       |

## Security notes

- The server compiles arbitrary LaTeX — run it in a container, limit concurrency
  (the pipeline caps at 2 concurrent jobs), and keep it private or rate-limited if
  exposed to the public internet.
- Mixins such as `--shell-escape` are intentionally NOT enabled: the pipeline
  never passes `-shell-escape` to pdflatex.
- The returned SVG is sanitized (script/foreignObject/inline-handler stripping)
  before it reaches the browser.
