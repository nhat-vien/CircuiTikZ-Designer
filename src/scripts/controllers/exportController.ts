import { Modal, Tooltip } from "bootstrap"
import {
	SelectionController,
	MainController,
	TextProperty,
	EnvironmentVariableController,
	createComponentsSvgText,
	NodeComponent,
} from "../internal"
import FileSaver from "file-saver"
import * as prettier from "prettier"
import * as SVG from "@svgdotjs/svg.js"
const parserXML = require("@prettier/plugin-xml").default

/**
 * Contains export functions and controls the "exportModal" (~dialog).
 * @class
 */
export class ExportController {
	private static _instance: ExportController
	public static get instance(): ExportController {
		if (!ExportController._instance) {
			ExportController._instance = new ExportController()
		}
		return ExportController._instance
	}

	private modalElement: HTMLDivElement
	private modal: Modal
	private heading: HTMLHeadingElement
	private exportedContent: HTMLTextAreaElement
	private fileBasename: HTMLInputElement
	private fileExtension: HTMLInputElement
	private fileExtensionDropdown: HTMLUListElement
	private copyButton: HTMLDivElement
	private saveButton: HTMLButtonElement

	private copyTooltip: Tooltip

	private defaultDisplay: string

	private usedIDs: Map<string, number>

	public exportEnvironment: "circuitikz" | "tikzpicture" =
		(localStorage.getItem("circutikz_export_env") as any) || "circuitikz"
	public exportTransformShape: boolean =
		localStorage.getItem("circutikz_export_transform_shape") !== "false"
	public exportBipolesLength: string =
		localStorage.getItem("circutikz_export_bipoles_length") || "1.4cm"

	public createExportID(prefix = "N"): string {
		let currentID: number
		if (this.usedIDs.has(prefix)) {
			currentID = this.usedIDs.get(prefix)
			currentID++
		} else {
			currentID = 1
		}
		while (this.isIDUsed(prefix + currentID)) currentID++
		this.usedIDs.set(prefix, currentID)
		return prefix + currentID
	}

	private isIDUsed(id: string): boolean {
		for (const component of MainController.instance.circuitComponents) {
			// check if another component with the same name already exists
			if ("name" in component) {
				let name = component.name as TextProperty
				if (name.value == id) {
					return true
				}
			}
		}
		return false
	}

	/**
	 * Init the ExportController
	 */
	private constructor() {
		this.modalElement = document.getElementById("exportModal") as HTMLDivElement
		this.modal = new Modal(this.modalElement)
		this.heading = document.getElementById("exportModalLabel") as HTMLHeadingElement
		this.exportedContent = document.getElementById("exportedContent") as HTMLTextAreaElement
		this.fileBasename = document.getElementById("exportModalFileBasename") as HTMLInputElement
		this.fileExtension = document.getElementById("exportModalFileExtension") as HTMLInputElement
		this.fileExtensionDropdown = document.getElementById("exportModalFileExtensionDropdown") as HTMLUListElement
		this.copyButton = document.getElementById("copyExportedContent") as HTMLDivElement
		this.saveButton = document.getElementById("exportModalSave") as HTMLButtonElement

		this.defaultDisplay = this.exportedContent.parentElement.style.display

		let copyButtonDefaultTooltipText = "Copy to clipboard!"
		this.copyButton.addEventListener("hidden.bs.tooltip", (evt) => {
			this.copyButton.setAttribute("data-bs-title", copyButtonDefaultTooltipText)
			this.copyTooltip.dispose()
			this.copyTooltip = new Tooltip(this.copyButton)
		})
		this.copyButton.setAttribute("data-bs-toggle", "tooltip")
		this.copyButton.setAttribute("data-bs-title", copyButtonDefaultTooltipText)
		this.copyTooltip = new Tooltip(this.copyButton)

		this.usedIDs = new Map<string, number>()

		// Initialize Environment Selection listeners
		const circRadio = document.getElementById("exportEnvCircuitikz") as HTMLInputElement
		const tikzRadio = document.getElementById("exportEnvTikzpicture") as HTMLInputElement
		const transformCheck = document.getElementById("exportTransformShapeCheck") as HTMLInputElement
		const lengthSelect = document.getElementById("exportBipolesLengthSelect") as HTMLSelectElement
		const liveCircRadio = document.getElementById("liveEnvCircuitikz") as HTMLInputElement
		const liveTikzRadio = document.getElementById("liveEnvTikzpicture") as HTMLInputElement

		circRadio?.addEventListener("change", () => {
			if (circRadio.checked) this.setExportEnvironment("circuitikz")
		})
		tikzRadio?.addEventListener("change", () => {
			if (tikzRadio.checked) this.setExportEnvironment("tikzpicture")
		})
		transformCheck?.addEventListener("change", () => {
			this.setExportEnvironment(this.exportEnvironment, transformCheck.checked)
		})
		lengthSelect?.addEventListener("change", () => {
			this.setExportBipolesLength(lengthSelect.value)
		})
		liveCircRadio?.addEventListener("change", () => {
			if (liveCircRadio.checked) this.setExportEnvironment("circuitikz")
		})
		liveTikzRadio?.addEventListener("change", () => {
			if (liveTikzRadio.checked) this.setExportEnvironment("tikzpicture")
		})

		this.syncEnvironmentUI()
	}

	exportJSON(text: string) {
		this.heading.textContent = "Save JSON"
		const envBar = document.getElementById("exportEnvBar")
		if (envBar) envBar.classList.add("d-none")

		// create extension select list
		const extensions = [".json", ".txt"]

		this.exportedContent.rows = Math.max(text.split("\n").length, 2)
		this.exportedContent.value = text

		this.export(extensions)
	}

	/**
	 * Creates an anchor resolver mapping endpoints to node pin anchors (e.g. Q1.B, OA1.out)
	 */
	public createAnchorResolver(): (pt: SVG.Point) => string | null {
		const pinEntries: { anchorStr: string; x: number; y: number }[] = []
		const excludedAnchors = new Set([
			"center", "default", "north", "south", "east", "west",
			"north east", "north west", "south east", "south west",
			"text", "mid", "mid east", "mid west", "base east", "base west"
		])

		for (const comp of MainController.instance.circuitComponents) {
			// Only multi-terminal circuit symbols (transistors, opamps, gates, etc.) have pin anchors
			if ((comp as any).referenceSymbol || (comp as any).componentVariant?.pins) {
				const pins = comp.snappingPoints
				if (pins && pins.length > 0) {
					const meaningfulPins = pins.filter(
						(p) => p.anchorName && !excludedAnchors.has(p.anchorName.toLowerCase())
					)
					if (meaningfulPins.length > 0) {
						let nodeName = comp.name?.value
						if (!nodeName && typeof (comp as any).getTikzExportName === "function") {
							nodeName = (comp as any).getTikzExportName()
						}
						if (nodeName) {
							for (const pin of meaningfulPins) {
								pinEntries.push({
									anchorStr: `(${nodeName}.${pin.anchorName})`,
									x: pin.x,
									y: pin.y,
								})
							}
						}
					}
				}
			}
		}

		if (pinEntries.length === 0) {
			return () => null
		}

		const toleranceSq = 2.5 * 2.5 // ~0.66mm snap tolerance (prevents snapping distinct adjacent coordinates)

		return (pt: SVG.Point): string | null => {
			if (!pt) return null
			let closestEntry: string | null = null
			let minDistSq = toleranceSq

			for (const entry of pinEntries) {
				const dx = pt.x - entry.x
				const dy = pt.y - entry.y
				const distSq = dx * dx + dy * dy
				if (distSq <= minDistSq) {
					minDistSq = distSq
					closestEntry = entry.anchorStr
				}
			}

			return closestEntry
		}
	}

	/**
	 * Returns the formatted CircuiTikZ or TikZ code for the current circuit.
	 */
	public getCircuiTikzString(env?: "circuitikz" | "tikzpicture", transformShape?: boolean): string {
		const targetEnv = env || this.exportEnvironment || "circuitikz"
		const withTransform = transformShape !== undefined ? transformShape : this.exportTransformShape

		this.usedIDs.clear()
		const anchorResolver = this.createAnchorResolver()

		const nodeElements: string[] = []
		const pathElements: string[] = []
		let requiredTikzLibraries: Set<string> = new Set<string>()

		for (const circuitElement of MainController.instance.circuitComponents) {
			circuitElement.requiredTikzLibraries().forEach((item) => requiredTikzLibraries.add(item))
			const elStr = circuitElement.toTikzString(anchorResolver)
			if (elStr && elStr.trim()) {
				const trimmed = elStr.trim()
				if (trimmed.startsWith("\\node")) {
					nodeElements.push("\t" + elStr)
				} else {
					pathElements.push("\t" + elStr)
				}
			}
		}
		let libraryStr =
			requiredTikzLibraries.size > 0
				? "\\usetikzlibrary{" + Array.from(requiredTikzLibraries.values()).join(", ") + "}"
				: ""

		const tikzSettings = EnvironmentVariableController.instance.getTikzSettings()
		const envOptions: string[] = []
		if (withTransform) {
			envOptions.push("transform shape")
		}
		if (tikzSettings.environment.length > 0) {
			envOptions.push(...tikzSettings.environment)
		}

		const optString = envOptions.length > 0 ? "[" + envOptions.join(", ") + "]" : ""

		const ctikzSettings = [...tikzSettings.ctikzset.map((setting) => "\t\\ctikzset{" + setting + "}")]
		if (this.exportBipolesLength && this.exportBipolesLength !== "none") {
			ctikzSettings.unshift(`\t\\ctikzset{bipoles/length=${this.exportBipolesLength}}`)
		}

		let arr = [
			`\\begin{${targetEnv}}${optString}`,
			...ctikzSettings,
			...(nodeElements.length > 0 ? ["\t% Component nodes:", ...nodeElements] : []),
			...(pathElements.length > 0 ? ["\t% Paths, bipoles and wires:", ...pathElements] : []),
			`\\end{${targetEnv}}`,
		]
		if (libraryStr) {
			arr = [libraryStr].concat(arr)
		}
		return arr.join("\n")
	}

	public setExportBipolesLength(lengthStr: string): void {
		this.exportBipolesLength = lengthStr
		try {
			localStorage.setItem("circutikz_export_bipoles_length", lengthStr)
		} catch (e) {}

		this.syncEnvironmentUI()

		if (this.exportedContent && this.modalElement.classList.contains("show")) {
			const updatedCode = this.getCircuiTikzString()
			this.exportedContent.rows = updatedCode.split("\n").length
			this.exportedContent.value = updatedCode
		}

		MainController.instance?.updateLiveCode()
	}

	public setExportEnvironment(env: "circuitikz" | "tikzpicture", transformShape?: boolean): void {
		this.exportEnvironment = env
		if (transformShape !== undefined) {
			this.exportTransformShape = transformShape
		}
		try {
			localStorage.setItem("circutikz_export_env", env)
			localStorage.setItem("circutikz_export_transform_shape", String(this.exportTransformShape))
		} catch (e) {}

		this.syncEnvironmentUI()

		if (this.exportedContent && this.modalElement.classList.contains("show")) {
			const updatedCode = this.getCircuiTikzString()
			this.exportedContent.rows = updatedCode.split("\n").length
			this.exportedContent.value = updatedCode
		}

		MainController.instance?.updateLiveCode()
	}

	public setExportTransformShape(transformShape: boolean): void {
		this.exportTransformShape = transformShape
		try {
			localStorage.setItem("circutikz_export_transform_shape", String(this.exportTransformShape))
		} catch (e) {}

		this.syncEnvironmentUI()

		if (this.exportedContent && this.modalElement.classList.contains("show")) {
			const updatedCode = this.getCircuiTikzString()
			this.exportedContent.rows = updatedCode.split("\n").length
			this.exportedContent.value = updatedCode
		}

		MainController.instance?.updateLiveCode()
	}

	public syncEnvironmentUI(): void {
		const isCirc = this.exportEnvironment === "circuitikz"
		const circRadio = document.getElementById("exportEnvCircuitikz") as HTMLInputElement
		const tikzRadio = document.getElementById("exportEnvTikzpicture") as HTMLInputElement
		const transformCheck = document.getElementById("exportTransformShapeCheck") as HTMLInputElement
		const liveCircRadio = document.getElementById("liveEnvCircuitikz") as HTMLInputElement
		const liveTikzRadio = document.getElementById("liveEnvTikzpicture") as HTMLInputElement
		const lengthSelect = document.getElementById("exportBipolesLengthSelect") as HTMLSelectElement

		if (circRadio) circRadio.checked = isCirc
		if (tikzRadio) tikzRadio.checked = !isCirc
		if (transformCheck) transformCheck.checked = this.exportTransformShape
		if (lengthSelect) lengthSelect.value = this.exportBipolesLength
		if (liveCircRadio) liveCircRadio.checked = isCirc
		if (liveTikzRadio) liveTikzRadio.checked = !isCirc
	}

	exportCircuiTikZ() {
		this.heading.innerHTML =
			this.exportEnvironment === "circuitikz"
				? "Export CircuiTi<i>k</i>Z code"
				: "Export Ti<i>k</i>Z code"
		this.exportedContent.parentElement.style.display = this.defaultDisplay
		const envBar = document.getElementById("exportEnvBar")
		if (envBar) envBar.classList.remove("d-none")

		this.syncEnvironmentUI()

		// create extension select list
		const extensions = [".tikz", ".tex", ".pgf"]

		const tikzCode = this.getCircuiTikzString()
		this.exportedContent.rows = tikzCode.split("\n").length
		this.exportedContent.value = tikzCode
		this.usedIDs.clear()
		this.export(extensions)
	}

	/**
	 * Shows the exportModal with the SVG code.
	 */
	exportSVG() {
		this.heading.textContent = "Export SVG"
		this.exportedContent.parentElement.style.display = this.defaultDisplay
		const envBar = document.getElementById("exportEnvBar")
		if (envBar) envBar.classList.add("d-none")

		// prepare selection and bounding box
		SelectionController.instance.selectAll()
		SelectionController.instance.deactivateSelection()

		let colorTheme = MainController.instance.darkMode
		MainController.instance.darkMode = false
		MainController.instance.updateTheme()

		const svgText = createComponentsSvgText(MainController.instance.circuitComponents)
		prettier
			.format(svgText.replaceAll("<br>", "<br/>"), {
				parser: "xml",
				plugins: [parserXML],
				tabWidth: 4,
				singleAttributePerLine: true,
				xmlWhitespaceSensitivity: "preserve",
			})
			.then((textContent) => {
				this.exportedContent.rows = textContent.split("\n").length
				this.exportedContent.value = textContent
				const extensions = [".svg", ".txt"]
				this.export(extensions)
				SelectionController.instance.activateSelection()
			})
		MainController.instance.darkMode = colorTheme
		MainController.instance.updateTheme()
	}

	private export(extensions: string[]) {
		// copy text and adjust tooltip for feedback
		const copyText = () => {
			navigator.clipboard.writeText(this.exportedContent.value).then(() => {
				this.copyButton.setAttribute("data-bs-title", "Copied!")
				this.copyTooltip.dispose()
				this.copyTooltip = new Tooltip(this.copyButton)
				this.copyTooltip.show()
			})
		}
		// create listeners
		const saveFile = (() => {
			const filename =
				(this.fileBasename.value.trim() || MainController.instance.designName.value).replace(
					/[^a-z0-9]/gi,
					"_"
				) || "Circuit"
			FileSaver.saveAs(
				new Blob([this.exportedContent.value], { type: "text/x-tex;charset=utf-8" }),
				filename + this.fileExtension.value
			)
		}).bind(this)
		const hideListener = (() => {
			this.exportedContent.value = "" // free memory
			this.copyButton.removeEventListener("click", copyText)
			this.saveButton.removeEventListener("click", saveFile)
			this.fileExtensionDropdown.replaceChildren()
			// "once" is not always supported:
			this.modalElement.removeEventListener("hidden.bs.modal", hideListener)
		}).bind(this)

		this.modalElement.addEventListener("hidden.bs.modal", hideListener, {
			passive: true,
			once: true,
		})

		// create extension select list
		this.fileExtension.value = extensions[0]
		this.fileExtensionDropdown.replaceChildren(
			...extensions.map((ext) => {
				const link = document.createElement("a")
				link.textContent = ext
				link.classList.add("dropdown-item")
				link.addEventListener("click", () => (this.fileExtension.value = ext), {
					passive: true,
				})
				const listElement = document.createElement("li")
				listElement.appendChild(link)
				return listElement
			})
		)

		// add listeners & show modal
		this.copyButton.addEventListener("click", copyText, { passive: true })
		this.saveButton.addEventListener("click", saveFile, { passive: true })

		this.modal.show()
	}
}
