#!/usr/bin/env node
/**
 * Standalone web render server for the CircuiTikZ-Designer LaTeX preview.
 *
 * Serves the same compile pipeline as the Electron desktop bridge over HTTP so the
 * static web build (GitHub Pages / Vercel) can offer the true LaTeX compile preview:
 *
 *   GET  /health    -> { ok, tectonic, pdflatex, converter }
 *   POST /compile   { "latex": "...source..." } -> { ok, svg?, bbox?, error?, errors? }
 *
 * Configuration (environment):
 *   PORT          listen port (default 8088)
 *   ALLOW_ORIGIN  Access-Control-Allow-Origin value (default "*"; set it to the
 *                 GitHub Pages origin in production if you prefer)
 *
 * Run:  node server/renderServer.js
 * Docker: see Dockerfile ("docker run -p 8088:8088 ...").
 */
const http = require("http")
const core = require("../src/scripts/latex/latexCompileCore")

const PORT = Number(process.env.PORT || 8088)
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*"
const MAX_BODY_BYTES = 300000

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": ALLOW_ORIGIN,
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Max-Age": "86400",
}

function sendJson(res, status, payload) {
	res.writeHead(status, { ...CORS_HEADERS, "Content-Type": "application/json" })
	res.end(JSON.stringify(payload))
}

const server = http.createServer((req, res) => {
	if (req.method === "OPTIONS") {
		res.writeHead(204, CORS_HEADERS)
		return res.end()
	}

	if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
		return core.detectAvailability(false).then((availability) => {
			sendJson(res, 200, { ok: true, ...availability })
		})
	}

	if (req.method === "POST" && req.url === "/compile") {
		let body = ""
		let size = 0
		let aborted = false
		req.on("data", (chunk) => {
			size += chunk.length
			if (size > MAX_BODY_BYTES) {
				aborted = true
				req.destroy()
			}
			if (!aborted) body += chunk
		})
		req.on("end", () => {
			if (aborted) return
			let latex = ""
			try {
				const payload = JSON.parse(body || "{}")
				latex = String(payload.latex ?? "")
			} catch (err) {
				return sendJson(res, 400, { ok: false, error: `invalid JSON body: ${String(err?.message ?? err)}` })
			}
			return core
				.renderSource(latex)
				.then((reply) => sendJson(res, 200, reply))
				.catch((err) => sendJson(res, 500, { ok: false, error: String(err?.message ?? err) }))
		})
		return
	}

	sendJson(res, 404, { ok: false, error: "not found (use GET /health or POST /compile)" })
})

server.listen(PORT, "0.0.0.0", () => {
	console.log(`[ctd-render-server] listening on http://0.0.0.0:${PORT} (ALLOW_ORIGIN=${ALLOW_ORIGIN})`)
})
