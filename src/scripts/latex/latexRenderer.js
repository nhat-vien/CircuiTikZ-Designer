/**
 * Electron main-process LaTeX renderer (IPC adapter).
 *
 * The actual compile pipeline lives in latexCompileCore.js so the same logic
 * can power a standalone web render server. Registers the ipcMain channels:
 *   latex:render { latex: string } -> { ok, svg?, bboxPt?, error?, logTail? }
 *   latex:availability -> { tectonic: boolean, pdflatex: boolean, converter: string|null }
 */
const { ipcMain } = require("electron")
const core = require("./latexCompileCore")

function register() {
	ipcMain.handle("latex:render", (_event, payload) => core.renderSource(String(payload?.latex ?? "")))
	ipcMain.handle("latex:availability", (_event, force) => core.detectAvailability(Boolean(force)))
}

module.exports = { register }
