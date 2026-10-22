import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LaTeXPreviewController } from "../src/scripts/controllers/latexPreviewController"

/**
 * Covers the preview-button status wiring (spinner, badges, banner, tooltip, timers).
 * The compile loop itself is exercised through the private phase methods: importing the
 * controller in this harness resolves the `../internal` barrel cyclically, so doRender's
 * `DocumentController.instance` lookup only works under Parcel. The phase mapping itself is
 * covered by tests/latexPreviewStatus.test.ts.
 */
function openController(): LaTeXPreviewController {
	;(LaTeXPreviewController as any)._instance = null
	document.body.innerHTML = `
		<button id="latexPreviewBtn" title="Toggle compiled LaTeX preview">
			<span class="material-symbols-outlined">auto_awesome</span>
			<span class="align-middle">LaTeX</span>
		</button>
		<div id="latexPreviewError" class="latex-preview-error d-none"></div>
	`
	;(window as any).latexRenderer = {
		availability: async () => ({ tectonic: true, pdflatex: false, converter: "pdftocairo" }),
		render: async () => ({ ok: true, svg: "<svg></svg>" }),
	}
	return LaTeXPreviewController.instance
}

const any = (controller: LaTeXPreviewController) => controller as any

const button = () => document.getElementById("latexPreviewBtn") as HTMLElement
const status = () => button().querySelector(".latex-btn-status") as HTMLElement
const spinner = () => button().querySelector(".latex-btn-spinner") as HTMLElement
const banner = () => document.getElementById("latexPreviewError") as HTMLElement

describe("LaTeXPreviewController compile status", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		localStorage.clear()
	})
	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
		;(window as any).latexRenderer = undefined
		;(LaTeXPreviewController as any)._instance = null
		document.body.innerHTML = ""
	})

	it("spins and counts seconds for a manual compile, then reports the duration", async () => {
		let now = 0
		vi.spyOn(performance, "now").mockImplementation(() => now)
		const controller = openController()
		await vi.advanceTimersByTimeAsync(1) // let the availability probe settle

		any(controller).manualCompile = true
		any(controller).beginCompile()

		expect(button().classList.contains("is-compiling")).toBe(true)
		expect(spinner().classList.contains("d-none")).toBe(false)
		expect(status().textContent).toBe("1s")

		now = 2500
		await vi.advanceTimersByTimeAsync(1000) // the one-second tick repaints
		expect(status().textContent).toBe("2s")

		any(controller).reportSuccess()
		expect(status().textContent).toBe("ok · 2.5s")
		expect(status().className).toContain("latex-status-ok")
		expect(spinner().classList.contains("d-none")).toBe(true)

		await vi.advanceTimersByTimeAsync(4000)
		expect(status().classList.contains("d-none")).toBe(true)
	})

	it("only tints the button border for an automatic compile", async () => {
		const controller = openController()
		any(controller).beginCompile()

		expect(button().classList.contains("is-compiling")).toBe(true)
		expect(spinner().classList.contains("d-none")).toBe(true)
		expect(status().classList.contains("d-none")).toBe(true)

		await vi.advanceTimersByTimeAsync(3000)
		expect(status().classList.contains("d-none")).toBe(true)

		any(controller).reportSuccess()
		expect(button().classList.contains("is-compiling")).toBe(false)
	})

	it("keeps an error badge, the full banner text and the log in the tooltip", async () => {
		const controller = openController()
		any(controller).beginCompile()
		any(controller).reportFailure(["renderer busy", "! LaTeX Error: File `siunitx.sty' not found.", "l.51 \\usepackage"])

		expect(status().textContent).toBe("error")
		expect(status().className).toContain("latex-status-error")
		expect(banner().textContent).toBe("renderer busy (+2)")
		expect(banner().classList.contains("d-none")).toBe(false)
		expect(button().getAttribute("title")).toBe(
			"renderer busy\n! LaTeX Error: File `siunitx.sty' not found.\nl.51 \\usepackage"
		)

		// the error state survives until the next successful compile
		await vi.advanceTimersByTimeAsync(60000)
		expect(status().textContent).toBe("error")
		expect(button().classList.contains("is-compiling")).toBe(false)
	})

	it("clears the status and restores the availability tooltip when switched off", async () => {
		const controller = openController()
		await vi.advanceTimersByTimeAsync(1)
		any(controller).active = true
		any(controller).beginCompile()
		any(controller).reportFailure(["boom"])
		expect(banner().classList.contains("d-none")).toBe(false)

		controller.toggle(false)

		expect(status().classList.contains("d-none")).toBe(true)
		expect(button().classList.contains("is-compiling")).toBe(false)
		expect(banner().classList.contains("d-none")).toBe(true)
		expect(button().getAttribute("title")).toBe("Compiled LaTeX preview available")
	})

	it("gives up on a render server that never answers", async () => {
		const controller = openController()
		vi.stubGlobal(
			"fetch",
			(_url: any, options: any) =>
				new Promise((_resolve, reject) => {
					options.signal.addEventListener("abort", () => {
						const err = new Error("The operation was aborted")
						err.name = "AbortError"
						reject(err)
					})
				})
		)

		// attach the rejection handler before the timer fires, or Node reports it unhandled
		const settled = any(controller)
			.postCompile("https://srv.example", "\\begin{document}\\end{document}")
			.catch((err: Error) => err)
		await vi.advanceTimersByTimeAsync(149000)
		expect(status().textContent).not.toBe("error") // nothing failed yet

		await vi.advanceTimersByTimeAsync(2000)
		expect(((await settled) as Error).message).toMatch(/did not respond in 150s/)
	})
})
