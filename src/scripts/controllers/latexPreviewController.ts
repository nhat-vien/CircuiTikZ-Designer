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

	/** Web render server base URL (localStorage config, empty = not configured). */
	private static readonly SERVER_KEY = "ctd-latex-server"

	private getServerUrl(): string {
		return (localStorage.getItem(LaTeXPreviewController.SERVER_KEY) || "").trim().replace(/\/+$/, "")
	}

	public setServerUrl(url: string): void {
		localStorage.setItem(LaTeXPreviewController.SERVER_KEY, url.trim())
	}

	private async probeServer(): Promise<{ ok: boolean; message: string }> {
		const url = this.getServerUrl()
		if (!url) return { ok: false, message: "not configured" }
		try {
			const res = await fetch(`${url}/health`, { method: "GET" })
			const status = await res.json()
			if (!status?.ok) return { ok: false, message: "server reports no pipeline" }
			if (!status.tectonic && !status.pdflatex) return { ok: false, message: "server has no LaTeX engine" }
			if (!status.converter) return { ok: false, message: "server has no PDF→SVG converter" }
			return { ok: true, message: "available" }
		} catch (err) {
			return { ok: false, message: `unreachable (${String(err?.message ?? err).slice(0, 80)})` }
		}
	}

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

	/**
	 * Probes the Electron main process (desktop) or the configured web render server.
	 */
	public async refreshAvailability(): Promise<boolean> {
		const bridge = (window as any).latexRenderer
		if (!bridge?.availability) {
			// web build: feature available only when a render server is configured
			const probe = await this.probeServer()
			if (!probe.ok) {
				this.setUnavailable(
					this.getServerUrl()
						? `Render server ${probe.message} — check General settings`
						: "No LaTeX engine (web mode) — configure a render server in General settings"
				)
				this.unavailable = true
				return false
			}
			this.unavailable = false
			this.button?.classList.remove("disabled")
			this.button?.setAttribute("title", `Compiled LaTeX preview via render server ${this.getServerUrl()}`)
			return true
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
			let reply: RenderReply
			if (bridge?.render) {
				reply = await bridge.render(source)
			} else {
				const url = this.getServerUrl()
				if (!url) {
					this.showBanner("No render server configured (General settings)")
					return
				}
				const res = await fetch(`${url}/compile`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ latex: source }),
				})
				reply = (await res.json()) as RenderReply
			}
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
	 *
	 * pdftocairo output: no global matrix, viewBox == MediaBox (standalone page =
	 * picture content + border margins). pdf2svg output: a global
	 * matrix(1 0 0 -1 tx ty) flip group and a cropped page.
	 */
	private project(svgText: string, bbox: CompiledBBox | null): void {
		if (!this.layer) return
		try {
			const doc = new DOMParser().parseFromString(svgText, "image/svg+xml")
			const root = doc.documentElement
			if (root.tagName.toLowerCase() !== "svg") return

			// pdf2svg wraps content in <g transform="matrix(1 0 0 -1 tx ty)">; read tx/ty
			let flipTx = 0
			let flipTy = 0
			let hasFlip = false
			const firstGroup = root.querySelector("g")
			const matrixMatch = firstGroup?.getAttribute("transform")?.match(
				/matrix\(\s*1\s*,?\s+0\s*,?\s+0\s*,?\s+-1\s*,?\s+([^,)]*)\s*,?\s+([^)]*)\)/
			)
			if (matrixMatch) {
				hasFlip = true
				flipTx = parseFloat(matrixMatch[1]) || 0
				flipTy = parseFloat(matrixMatch[2]) || 0
			}

			// world origin (0,0) in displayed svg coordinates (y-down):
			let u0 = 0
			let v0 = 0
			let scale = SCALE
			if (hasFlip) {
				u0 = flipTx - (bbox?.picMinX ?? 0)
				v0 = (bbox?.picMinY ?? 0) + flipTy
			} else if (bbox) {
				// pdftocairo: displayed page size includes standalone margins; poppler
				// additionally wraps every path in a per-path matrix (s, 0, 0, -s, ..., ...)
				// which shrinks the display by 1/s — compensate by measuring s from the
				// first transformed path.
				let s0 = 1
				const pathEl = root.querySelector("path[transform]")
				const pathMat = pathEl?.getAttribute("transform")?.match(
					/matrix\(\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\)/
				)
				if (pathMat) {
					const a = parseFloat(pathMat[1])
					const d = parseFloat(pathMat[4])
					if (a > 0 && d < 0) s0 = a
				}
				scale = SCALE / s0

				const parseLen = (v: string | null) => (v ? parseFloat(v) || 0 : 0)
				const mediaW = parseLen(root.getAttribute("width"))
				const marginX = (mediaW - (bbox.picMaxX - bbox.picMinX)) / 2
				// vertical: content height derived from the picture extents
				const mediaH = parseLen(root.getAttribute("height"))
				const marginY = (mediaH - (bbox.picMaxY - bbox.picMinY)) / 2
				u0 = marginX - bbox.picMinX
				v0 = marginY + bbox.picMaxY
			}

			this.layer.innerHTML = ""
			// canvas y already matches svg display direction (both flipped y-down),
			// so this is a pure translation+scale of the display coordinates
			this.layer.setAttribute(
				"transform",
				`matrix(${scale},0,0,${scale},${-scale * u0},${-scale * v0})`
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

	/**
	 * Builds the "LaTeX render server" configuration block for the General
	 * settings view (web mode only — desktop uses the Electron bridge).
	 */
	public getSettingsSectionHTML(): HTMLElement {
		const section = document.createElement("div")
		section.id = "latexServerConfig"
		section.className = "pt-2"

		const title = document.createElement("div")
		title.className = "fw-semibold small mb-1"
		title.innerText = "LaTeX render server (web)"
		section.appendChild(title)

		const row = document.createElement("div")
		row.className = "d-flex gap-1"
		const input = document.createElement("input")
		input.type = "text"
		input.className = "form-control form-control-sm"
		input.id = "latexServerUrlInput"
		input.placeholder = "https://my-render-server:8088"
		input.value = this.getServerUrl()
		row.appendChild(input)

		const saveBtn = document.createElement("button")
		saveBtn.type = "button"
		saveBtn.className = "btn btn-sm btn-outline-primary flex-shrink-0"
		saveBtn.innerText = "Save"
		row.appendChild(saveBtn)
		section.appendChild(row)

		const status = document.createElement("div")
		status.id = "latexServerStatus"
		status.className = "form-text mb-0"
		section.appendChild(status)

		const updateStatus = async () => {
			const url = this.getServerUrl()
			if (!url) {
				status.innerText = "Empty = LaTeX preview off in web mode"
				return
			}
			status.innerText = "Probing…"
			const probe = await this.probeServer()
			status.innerHTML = ""
			status.appendChild(document.createTextNode(`Server ${url} — ${probe.message}`))
		}

		saveBtn.addEventListener("click", () => {
			this.setServerUrl(input.value)
			void updateStatus()
			void Promise.resolve(this.refreshAvailability())
		})
		void updateStatus()
		return section
	}
}
