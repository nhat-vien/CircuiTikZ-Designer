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

The image ships TeX Live (pdflatex, `circuitikz`, `standalone` included) and
poppler-utils (pdftocairo) — fully offline after the build.

## Deploy

The server needs real binaries, so it must run on a platform that executes
arbitrary containers (not Vercel static/edge):

- **Fly.io**: `fly launch` using the Dockerfile, then `fly deploy`
- **Render**: new *Web Service* → Docker runtime → build from the repo
- **Railway**: deploy the Dockerfile
- **Any VPS**: `node server/renderServer.js` behind nginx/caddy TLS

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
