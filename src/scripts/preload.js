/**
 * Electron preload script: exposes the LaTeX renderer IPC bridge to the renderer
 * process under window.latexRenderer. Web builds do not load a preload, so the
 * absence of window.latexRenderer identifies web mode.
 */
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("latexRenderer", {
	render: (latex) => ipcRenderer.invoke("latex:render", { latex }),
	availability: (force) => ipcRenderer.invoke("latex:availability", force),
})
