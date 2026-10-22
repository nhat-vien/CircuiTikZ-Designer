/**
 * Shared LaTeX compile pipeline, usable from both the Electron main process and
 * a standalone web render server (see server/renderServer.js).
 *
 * Compiles a full LaTeX source with Tectonic (preferred) or pdflatex, converts the
 * resulting PDF to SVG with pdftocairo/pdf2svg, and extracts:
 *   - the SVG content,
 *   - the TikZ picture bounding box (in pt, relative to the picture origin) that was
 *     reported by the injected "\\typeout{CTDBBOX|...}" line,
 *   - the first LaTeX error lines from the .log file.
 *
 * The bounding box must be measured inside the tikzpicture. The latex source is
 * prepared by the renderer process, which wraps \\begin{circuitikz}...\\end{circuitikz}
 * with a \\makeatletter \\typeout{CTDBBOX|...} hook.
 */
const fs = require("fs")
const os = require("os")
const path = require("path")
const crypto = require("crypto")
const { execFile } = require("child_process")

let availabilityCache = null
let activeCount = 0

function run(cmd, args, cwd, timeoutMs = 90000) {
	return new Promise((resolve) => {
		const child = execFile(
			cmd,
			args,
			{ cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
			(err, stdout, stderr) => {
				resolve({ ok: !err, code: err ? err.code : 0, stdout: String(stdout || ""), stderr: String(stderr || "") })
			}
		)
		child.on("error", () => resolve({ ok: false, code: -1, stdout: "", stderr: "" }))
	})
}

async function detectAvailability(force = false) {
	if (availabilityCache && !force) return availabilityCache

	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctd-probe-"))
	const results = {}
	try {
		const tectonic = await run("tectonic", ["--version"], root, 15000)
		results.tectonic = tectonic.ok
		const pdflatex = await run("pdflatex", ["--version"], root, 15000)
		results.pdflatex = pdflatex.ok
		const pdftocairo = await run("pdftocairo", ["-v"], root, 15000)
		const pdf2svg = await run("pdf2svg", [], root, 15000)
		results.converter = pdftocairo.ok ? "pdftocairo" : pdf2svg.ok ? "pdf2svg" : null
	} finally {
		try {
			fs.rmSync(root, { recursive: true, force: true })
		} catch {}
	}
	availabilityCache = results
	return results
}

/** Extracts the first LaTeX error lines ("! ...") plus some context from the log. */
function extractErrors(logText) {
	if (!logText) return []
	const lines = logText.split(/\r?\n/)
	const errors = []
	for (const line of lines) {
		if (line.startsWith("!")) {
			errors.push(line.trim().slice(0, 160))
			if (errors.length >= 3) break
		}
	}
	return errors
}

/** Extracts the CTDBBOX picture extents reported via \typeout (values carry "pt"). */
function extractBBox(logText) {
	if (!logText) return null
	const matches = logText.match(/CTDBBOX\|(-?[\d.]+)pt\|(-?[\d.]+)pt\|(-?[\d.]+)pt\|(-?[\d.]+)pt/)
	if (!matches) return null
	return {
		picMinX: parseFloat(matches[1]),
		picMaxX: parseFloat(matches[2]),
		picMinY: parseFloat(matches[3]),
		picMaxY: parseFloat(matches[4]),
	}
}

function sanitizeSvg(svgText) {
	return svgText
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
		.replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
		.replace(/\son\w+\s*=\s*'[^']*'/gi, "")
}

function emptyReply(error) {
	return { ok: false, error, svg: null, bbox: null, errors: [] }
}

/**
 * Compiles one LaTeX source and returns the standard RenderReply object
 * { ok, svg?, bbox?, error?, errors? } used by the preview controller.
 */
async function renderSource(latex) {
	latex = String(latex ?? "")
	if (!latex.trim() || latex.length > 200000) {
		return emptyReply("empty or oversized LaTeX source")
	}
	if (activeCount >= 2) {
		return emptyReply("renderer busy")
	}
	activeCount++
	const dir = path.join(os.tmpdir(), "ctd-latex", crypto.randomBytes(6).toString("hex"))
	try {
		fs.mkdirSync(dir, { recursive: true })
		const texFile = path.join(dir, "compile.tex")
		fs.writeFileSync(texFile, latex, "utf8")

		const availability = await detectAvailability()
		let compileResult = null
		if (availability.tectonic) {
			compileResult = await run("tectonic", ["--outfmt", "pdf", "--keep-logs", "-o", dir, texFile], dir)
		} else if (availability.pdflatex) {
			compileResult = await run("pdflatex", ["-interaction=nonstopmode", "-output-directory", dir, texFile], dir)
		} else {
			return emptyReply("no LaTeX engine available (install Tectonic)")
		}

		const logPath = path.join(dir, "compile.log")
		let logText = ""
		try {
			logText = fs.readFileSync(logPath, "utf8")
		} catch {
			try {
				logText = fs.readFileSync(path.join(dir, "compile.tex.log"), "utf8")
			} catch {}
		}
		const errors = extractErrors(logText)
		const bbox = extractBBox(logText)

		const pdfPath = path.join(dir, "compile.pdf")
		if (!fs.existsSync(pdfPath)) {
			return { ok: false, error: errors[0] ?? "compile failed (no PDF produced)", svg: null, bbox, errors }
		}

		const svgOut = path.join(dir, "compile.svg")
		if (availability.converter === "pdftocairo") {
			await run("pdftocairo", ["-svg", "-nocrop", "compile.pdf", "compile.svg"], dir)
		} else if (availability.converter === "pdf2svg") {
			await run("pdf2svg", ["compile.pdf", "compile.svg"], dir)
		} else {
			return { ok: false, error: "no PDF->SVG converter available (install poppler-utils)", svg: null, bbox, errors }
		}

		if (!fs.existsSync(svgOut)) {
			return { ok: false, error: errors[0] ?? "PDF->SVG conversion failed", svg: null, bbox, errors }
		}
		const svg = sanitizeSvg(fs.readFileSync(svgOut, "utf8"))
		return { ok: true, svg, bbox, errors, compileWarnings: [] }
	} catch (err) {
		return emptyReply(String(err?.message ?? err))
	} finally {
		activeCount--
		try {
			fs.rmSync(dir, { recursive: true, force: true })
		} catch {}
	}
}

module.exports = { detectAvailability, renderSource }
