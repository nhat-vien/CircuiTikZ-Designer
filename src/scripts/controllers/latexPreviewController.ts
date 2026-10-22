import { DocumentController } from "../internal"

const PT_PER_CM = 28.3465 // 1cm in pt (svg native unit after PDF->SVG conversion)
const PX_PER_CM = 4800 / 127 // canvas px per cm
const SCALE = PX_PER_CM / PT_PER_CM // canvas px per svg pt

export interface CompiledBBox {
	picMinX: number
	picMaxX: number
	picMinY: number
	picMaxY: number
}

export interface RenderReply {
	ok: boolean
	svg?: string
	bbox?: CompiledBBox
	error?: string
	errors?: string[]
}

/**
 * Renders the current LaTeX document through a real LaTeX engine (Electron IPC
 * bridge) and projects the compiled SVG onto the canvas as a true-fidelity
 * preview layer, aligned over the interactive component graphics.
 * @class
 */
export class LaTeXPreviewController {
	private static _instance: LaTeXPreviewController
	public static get instance(): LaTeXPreviewController {
		if (!LaTeXPreviewController._instance) {
			LaTeXPreviewController._instance = new LaTeXPreviewController()
		}
		return LaTeXPreviewController._instance
	}

	private button: HTMLButtonElement | null = null
	private errorBanner: HTMLDivElement | null = null
	private layer: SVGGElement | null = null
	private active = false
	private unavailable = false

	private renderTimer: any = null
	private inFlight = false
	private pending = false
	private cacheKey = ""
	private lastGoodSvg: string | null = null
	private lastGoodBBox: CompiledBBox | null = null

	private constructor() {
		this.button = document.getElementById("latexPreviewBtn") as HTMLButtonElement
		this.errorBanner = document.getElementById("latexPreviewError") as HTMLDivElement
		this.button?.addEventListener("click", () => this.toggle())
		window.addEventListener("document-changed", () => {
			if (this.active) this.scheduleRender()
		})
		void this.refreshAvailability()
	}

	/** Probes the Electron main process for available LaTeX engines. */
	public async refreshAvailability(): Promise<boolean> {
		const bridge = (window as any).latexRenderer
		if (!bridge?.availability) {
			// web build without render server: feature unavailable
			this.setUnavailable("No LaTeX engine (web mode)")
			this.unavailable = true
			return false
		}
		try {
			const availability = await bridge.availability(false)
			if (!availability?.tectonic && !availability?.pdflatex) {
				this.setUnavailable("No LaTeX engine")
				this.unavailable = true
				return false
			}
			if (!availability.converter) {
				this.setUnavailable("No PDF→SVG converter")
				this.unavailable = true
				return false
			}
			this.unavailable = false
			this.button?.classList.remove("disabled")
			this.button?.setAttribute("title", "Compiled LaTeX preview available")
			return true
		} catch {
			this.unavailable = true
			return false
		}
	}

	private setUnavailable(reason: string): void {
		this.button?.classList.add("disabled")
		this.button?.setAttribute("title", `${reason} — install Tectonic + pdftocairo for true LaTeX preview`)
	}

	public isActive(): boolean {
		return this.active
	}

	public toggle(force?: boolean): void {
		const shouldActivate = force !== undefined ? force : !this.active
		if (shouldActivate === this.active) return
		if (shouldActivate && this.unavailable) return

		this.active = shouldActivate
		this.button?.classList.toggle("selected", this.active)
		if (this.active) {
			this.ensureLayer()
			this.scheduleRender(true)
		} else {
			this.hideBanner()
			this.layer?.remove()
			this.layer = null
		}
	}

	private ensureLayer(): void {
		if (this.layer) return
		const canvasSvg = document.getElementById("canvas") as unknown as SVGSVGElement
		if (!canvasSvg) return
		this.layer = document.createElementNS("http://www.w3.org/2000/svg", "g")
		this.layer.setAttribute("id", "latexPreviewLayer")
		this.layer.setAttribute("pointer-events", "none")
		// draw below the interactive components: insert right after the defs block
		const defs = canvasSvg.querySelector("#backgroundDefs")
		if (defs && defs.parentElement === canvasSvg) {
			defs.insertAdjacentElement("afterend", this.layer)
		} else {
			canvasSvg.prepend(this.layer)
		}
	}

	private scheduleRender(force = false): void {
		if (this.renderTimer) clearTimeout(this.renderTimer)
		this.renderTimer = setTimeout(() => void this.doRender(force), 400)
	}

	private async doRender(force = false): Promise<void> {
		if (!this.active) return
		if (this.inFlight) {
			this.pending = true
			return
		}
		const source = DocumentController.instance?.buildCompilableSource()
		if (!source) return
		const key = source
		if (!force && key === this.cacheKey && this.lastGoodSvg) return
		this.cacheKey = key

		this.inFlight = true
		try {
			const bridge = (window as any).latexRenderer
			if (!bridge?.render) {
				this.showBanner("No LaTeX render bridge (start the desktop app)")
				return
			}
			const reply: RenderReply = await bridge.render(source)
			if (reply.ok && reply.svg) {
				this.lastGoodSvg = reply.svg
				this.lastGoodBBox = reply.bbox ?? null
				this.project(reply.svg, reply.bbox ?? null)
				this.hideBanner()
			} else {
				this.showBanner(reply.error ?? (reply.errors?.[0] ?? "compilation failed"))
				// keep the last good preview on screen (never leave a blank canvas)
			}
		} catch (err: any) {
			this.showBanner(String(err?.message ?? err))
		} finally {
			this.inFlight = false
			if (this.pending) {
				this.pending = false
				this.scheduleRender()
			}
		}
	}

	/**
	 * Projects the compiled SVG inner content onto the canvas layer using the
	 * measured tikzpicture bounding box (pt) reported by the CTDBBOX probe.
	 */
	private project(svgText: string, bbox: CompiledBBox | null): void {
		if (!this.layer) return
		try {
			const doc = new DOMParser().parseFromString(svgText, "image/svg+xml")
			const root = doc.documentElement
			if (root.tagName.toLowerCase() !== "svg") return

			// pdf2svg wraps content in <g transform="matrix(1 0 0 -1 tx ty)">; read tx/ty
			let tx = 0
			let ty = 0
			const firstGroup = root.querySelector("g")
			const matrixMatch = firstGroup?.getAttribute("transform")?.match(/matrix\([^,)]*,[^,)]*,[^,)]*,[^,)]*,([^,)]*),([^)]*)\)/)
			if (matrixMatch) {
				tx = parseFloat(matrixMatch[1]) || 0
				ty = parseFloat(matrixMatch[2]) || 0
			}

			// world origin (0,0) in displayed svg coordinates:
			// u0 = tx - picMinX ; v0 = picMinY + ty (y already flipped inside the svg content)
			const u0 = bbox ? tx - bbox.picMinX : 0
			const v0 = bbox ? bbox.picMinY + ty : 0
			const ox = -SCALE * u0
			const oy = -SCALE * v0

			this.layer.innerHTML = ""
			// canvas y already matches svg display direction (both flipped y-down),
			// so this is a pure translation+scale of the pdf2svg display coordinates
			this.layer.setAttribute(
				"transform",
				`matrix(${SCALE},0,0,${SCALE},${ox},${oy})`
			)
			for (const child of Array.from(root.childNodes)) {
				if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName.toLowerCase() !== "title") {
					this.layer.appendChild(document.importNode(child, true))
				}
			}
		} catch (err) {
			console.warn("LaTeX preview projection failed", err)
		}
	}

	private showBanner(message: string): void {
		if (!this.errorBanner) return
		this.errorBanner.textContent = message.length > 140 ? message.slice(0, 140) + "…" : message
		this.errorBanner.classList.remove("d-none")
	}

	private hideBanner(): void {
		this.errorBanner?.classList.add("d-none")
	}
}
