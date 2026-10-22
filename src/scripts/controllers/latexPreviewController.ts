import { DocumentController } from "../internal"
import { collectErrorLines, describeCompileStatus, type CompilePhase } from "../utils/latexCompileStatus"

const PT_PER_CM = 28.3465 // 1cm in pt (svg native unit after PDF->SVG conversion)
const PX_PER_CM = 4800 / 127 // canvas px per cm
const SCALE = PX_PER_CM / PT_PER_CM // canvas px per svg pt

/** Web compile budget: the render server engine caps at 90s, plus a free-plan cold start. */
const COMPILE_TIMEOUT_MS = 150000

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

	private phase: CompilePhase = "idle"
	private manualCompile = false
	private elapsedMs = 0
	private lastErrors: string[] = []
	private startedAt = 0
	private tickTimer: any = null
	private revertTimer: any = null
	private statusEl: HTMLSpanElement | null = null
	private spinnerEl: HTMLSpanElement | null = null
	private iconEl: HTMLElement | null = null
	private availabilityTitle = "Toggle compiled LaTeX preview"

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
		this.initStatusUI()
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
			this.setAvailabilityTitle(`Compiled LaTeX preview via render server ${this.getServerUrl()}`)
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
			this.setAvailabilityTitle("Compiled LaTeX preview available")
			return true
		} catch {
			this.unavailable = true
			return false
		}
	}

	private setUnavailable(reason: string): void {
		this.button?.classList.add("disabled")
		this.setAvailabilityTitle(`${reason} — install Tectonic + pdftocairo for true LaTeX preview`)
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
			this.resetStatus()
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
		this.manualCompile = force
		this.beginCompile()
		try {
			const bridge = (window as any).latexRenderer
			let reply: RenderReply
			if (bridge?.render) {
				reply = await bridge.render(source)
			} else {
				const url = this.getServerUrl()
				if (!url) {
					this.reportFailure(["No render server configured (General settings)"])
					return
				}
				reply = await this.postCompile(url, source)
			}
			if (reply.ok && reply.svg) {
				this.lastGoodSvg = reply.svg
				this.lastGoodBBox = reply.bbox ?? null
				this.project(reply.svg, reply.bbox ?? null)
				this.reportSuccess()
			} else {
				this.reportFailure(collectErrorLines(reply))
				// keep the last good preview on screen (never leave a blank canvas)
			}
		} catch (err: any) {
			this.reportFailure([String(err?.message ?? err)])
		} finally {
			this.inFlight = false
			if (this.pending) {
				this.pending = false
				this.scheduleRender()
			}
		}
	}

	/** POSTs the source to the web render server under a client-side deadline. */
	private async postCompile(serverUrl: string, source: string): Promise<RenderReply> {
		const abort = new AbortController()
		const deadline = setTimeout(() => abort.abort(), COMPILE_TIMEOUT_MS)
		try {
			const res = await fetch(`${serverUrl}/compile`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ latex: source }),
				signal: abort.signal,
			})
			return (await res.json()) as RenderReply
		} catch (err: any) {
			if (err?.name === "AbortError") {
				throw new Error(`render server did not respond in ${COMPILE_TIMEOUT_MS / 1000}s (cold start? try again)`)
			}
			throw err
		} finally {
			clearTimeout(deadline)
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
		this.errorBanner.textContent = message
		this.errorBanner.classList.remove("d-none")
	}

	private hideBanner(): void {
		this.errorBanner?.classList.add("d-none")
	}

	/** Adds the spinner and status badge children to the preview button. */
	private initStatusUI(): void {
		if (!this.button) return
		this.availabilityTitle = this.button.getAttribute("title") || this.availabilityTitle
		this.iconEl = this.button.querySelector(".material-symbols-outlined")

		this.spinnerEl = document.createElement("span")
		this.spinnerEl.className = "spinner-border spinner-border-sm latex-btn-spinner d-none"
		this.spinnerEl.setAttribute("role", "status")
		if (this.iconEl) this.iconEl.insertAdjacentElement("afterend", this.spinnerEl)
		else this.button.prepend(this.spinnerEl)

		this.statusEl = document.createElement("span")
		this.statusEl.className = "latex-btn-status d-none"
		this.button.appendChild(this.statusEl)
	}

	private setAvailabilityTitle(title: string): void {
		this.availabilityTitle = title
		if (this.phase !== "error") this.button?.setAttribute("title", title)
	}

	private setPhase(phase: CompilePhase): void {
		this.phase = phase
		this.applyStatus()
	}

	private beginCompile(): void {
		this.clearTick()
		this.startedAt = performance.now()
		this.setPhase("compiling")
		if (this.manualCompile) this.tickTimer = setInterval(() => this.applyStatus(), 1000)
	}

	private reportSuccess(): void {
		this.lastErrors = []
		this.elapsedMs = performance.now() - this.startedAt
		this.clearTick()
		this.setPhase("ok")
		if (this.manualCompile) {
			clearTimeout(this.revertTimer)
			this.revertTimer = setTimeout(() => {
				if (this.phase === "ok") this.setPhase("idle")
			}, 4000)
		}
	}

	private reportFailure(errors: string[]): void {
		this.lastErrors = errors.filter((line) => line.length > 0)
		this.clearTick()
		this.setPhase("error")
	}

	private resetStatus(): void {
		this.clearTick()
		clearTimeout(this.revertTimer)
		this.revertTimer = null
		this.phase = "idle"
		this.manualCompile = false
		this.elapsedMs = 0
		this.lastErrors = []
		this.applyStatus()
	}

	private clearTick(): void {
		if (this.tickTimer) {
			clearInterval(this.tickTimer)
			this.tickTimer = null
		}
	}

	/** Paints the current compile phase onto the button, the banner and the tooltip. */
	private applyStatus(): void {
		if (!this.button || !this.statusEl || !this.spinnerEl || !this.iconEl) return
		const view = describeCompileStatus({
			phase: this.phase,
			manual: this.manualCompile,
			elapsedMs: this.phase === "compiling" ? performance.now() - this.startedAt : this.elapsedMs,
			errors: this.lastErrors,
		})
		this.spinnerEl.classList.toggle("d-none", !view.spinner)
		this.iconEl.classList.toggle("d-none", view.spinner)
		this.button.classList.toggle("is-compiling", view.buttonClasses.includes("is-compiling"))
		this.statusEl.textContent = view.label
		this.statusEl.className = view.label
			? `latex-btn-status ${view.badgeClasses.join(" ")}`
			: "latex-btn-status d-none"
		if (view.hideBanner) this.hideBanner()
		else if (view.bannerText !== null) this.showBanner(view.bannerText)
		// the banner cannot be hovered (pointer-events: none), so the full log goes on the button
		this.button.setAttribute(
			"title",
			this.phase === "error" && this.lastErrors.length > 0 ? this.lastErrors.join("\n") : this.availabilityTitle
		)
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
		const dot = document.createElement("span")
		dot.className = "settings-status-dot"
		const statusText = document.createElement("span")
		status.append(dot, statusText)
		section.appendChild(status)

		const updateStatus = async () => {
			const url = this.getServerUrl()
			if (!url) {
				dot.className = "settings-status-dot"
				statusText.innerText = "Empty = LaTeX preview off in web mode"
				return
			}
			dot.className = "settings-status-dot is-probing"
			statusText.innerText = "Probing…"
			const probe = await this.probeServer()
			dot.className = `settings-status-dot ${probe.ok ? "is-ok" : "is-error"}`
			statusText.innerText = `Server ${url} — ${probe.message}`
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
