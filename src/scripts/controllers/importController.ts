import { Modal } from "bootstrap"
import {
	MainController,
	SelectionController,
	SelectionMode,
	CanvasController,
	Undo,
	SaveController,
	TikzParser,
	EnvironmentVariableController,
	CircuitComponent,
} from "../internal"

export class ImportController {
	private static _instance: ImportController
	public static get instance(): ImportController {
		if (!ImportController._instance) {
			ImportController._instance = new ImportController()
		}
		return ImportController._instance
	}

	private modalElement: HTMLDivElement
	private modal: Modal
	private codeTextarea: HTMLTextAreaElement
	private pasteClipboardBtn: HTMLButtonElement
	private loadCurrentBtn: HTMLButtonElement
	private fileInput: HTMLInputElement
	private clearBtn: HTMLButtonElement
	private checkRemove: HTMLInputElement
	private checkFitView: HTMLInputElement
	private feedbackAlert: HTMLDivElement
	private submitBtn: HTMLButtonElement

	private constructor() {
		this.modalElement = document.getElementById("importTikzModal") as HTMLDivElement
		if (this.modalElement) {
			this.modal = new Modal(this.modalElement)
		}
		this.codeTextarea = document.getElementById("importTikzContent") as HTMLTextAreaElement
		this.pasteClipboardBtn = document.getElementById("importTikzPasteClipboard") as HTMLButtonElement
		this.loadCurrentBtn = document.getElementById("importTikzLoadCurrent") as HTMLButtonElement
		this.fileInput = document.getElementById("importTikzFileInput") as HTMLInputElement
		this.clearBtn = document.getElementById("importTikzClear") as HTMLButtonElement
		this.checkRemove = document.getElementById("importTikzCheckRemove") as HTMLInputElement
		this.checkFitView = document.getElementById("importTikzCheckFitView") as HTMLInputElement
		this.feedbackAlert = document.getElementById("importTikzFeedback") as HTMLDivElement
		this.submitBtn = document.getElementById("importTikzSubmitButton") as HTMLButtonElement

		this.initEventListeners()
	}

	private initEventListeners(): void {
		// Import navbar button
		const importBtn = document.getElementById("importTikzButton")
		if (importBtn) {
			importBtn.addEventListener("click", () => this.showModal())
		}

		// Paste from clipboard
		if (this.pasteClipboardBtn) {
			this.pasteClipboardBtn.addEventListener("click", async () => {
				try {
					const text = await navigator.clipboard.readText()
					if (text) {
						this.codeTextarea.value = text
						this.showFeedback("Code pasted from clipboard!", "info")
					}
				} catch (e) {
					this.showFeedback("Clipboard access denied. Please paste manually using Ctrl+V.", "warning")
				}
			})
		}

		// Load current circuit
		if (this.loadCurrentBtn) {
			this.loadCurrentBtn.addEventListener("click", () => {
				const currentCode = this.getCurrentCircuiTikZCode()
				if (currentCode) {
					this.codeTextarea.value = currentCode
					this.showFeedback("Current circuit TikZ code loaded into editor.", "info")
				} else {
					this.showFeedback("The canvas is currently empty.", "warning")
				}
			})
		}

		// Clear button
		if (this.clearBtn) {
			this.clearBtn.addEventListener("click", () => {
				this.codeTextarea.value = ""
				this.hideFeedback()
			})
		}

		// File open input
		if (this.fileInput) {
			this.fileInput.addEventListener("change", () => {
				const file = this.fileInput.files?.[0]
				if (file) {
					const reader = new FileReader()
					reader.readAsText(file, "UTF-8")
					reader.onload = (evt) => {
						const content = typeof evt.target?.result === "string" ? evt.target.result : ""
						this.codeTextarea.value = content
						this.showFeedback(`Loaded file "${file.name}" (${content.split("\n").length} lines).`, "info")
					}
					reader.onerror = () => {
						this.showFeedback("Error reading file.", "danger")
					}
				}
			})
		}

		// Submit button
		if (this.submitBtn) {
			this.submitBtn.addEventListener("click", () => {
				const code = this.codeTextarea.value
				const removeExisting = this.checkRemove ? this.checkRemove.checked : true
				const fitView = this.checkFitView ? this.checkFitView.checked : true
				const success = this.importFromCode(code, removeExisting, fitView)
				if (success) {
					// Hide modal on successful import
					setTimeout(() => {
						if (this.modal) this.modal.hide()
					}, 600)
				}
			})
		}

		// Export modal Apply to Canvas button
		const exportApplyBtn = document.getElementById("exportModalApplyToCanvas")
		if (exportApplyBtn) {
			exportApplyBtn.addEventListener("click", () => {
				const exportedTextarea = document.getElementById("exportedContent") as HTMLTextAreaElement
				if (exportedTextarea) {
					const code = exportedTextarea.value
					const success = this.importFromCode(code, true, true)
					if (success) {
						const exportModalElement = document.getElementById("exportModal")
						if (exportModalElement) {
							Modal.getInstance(exportModalElement)?.hide()
						}
					}
				}
			})
		}
	}

	/**
	 * Shows the import modal dialog.
	 */
	public showModal(prefillCode?: string): void {
		if (prefillCode !== undefined) {
			this.codeTextarea.value = prefillCode
		} else if (!this.codeTextarea.value.trim() && MainController.instance.circuitComponents.length > 0) {
			// If textarea is empty and canvas has elements, optionally preload current code
			this.codeTextarea.value = this.getCurrentCircuiTikZCode()
		}
		this.hideFeedback()
		if (this.modal) {
			this.modal.show()
		}
	}

	/**
	 * Generates the full CircuiTikZ code representing the current canvas components.
	 */
	public getCurrentCircuiTikZCode(): string {
		const circuitElements: string[] = []
		const requiredTikzLibraries: Set<string> = new Set<string>()

		for (const circuitElement of MainController.instance.circuitComponents) {
			circuitElement.requiredTikzLibraries().forEach((item) => requiredTikzLibraries.add(item))
			circuitElements.push("\t" + circuitElement.toTikzString())
		}

		if (circuitElements.length === 0) {
			return ""
		}

		const libraryStr =
			requiredTikzLibraries.size > 0
				? "\\usetikzlibrary{" + Array.from(requiredTikzLibraries).join(", ") + "}"
				: ""

		const tikzSettings = EnvironmentVariableController.instance.getTikzSettings()
		const arr = [
			"\\begin{tikzpicture}[" + ["transform shape"].concat(tikzSettings.environment).join(", ") + "]",
			...tikzSettings.ctikzset.map((setting) => "\t\\ctikzset{" + setting + "}"),
			"\t% Paths, nodes and wires:",
			...circuitElements,
			"\\end{tikzpicture}",
		]
		if (libraryStr) {
			arr.unshift(libraryStr)
		}
		return arr.join("\n")
	}

	/**
	 * Parses TikZ code and renders it onto the canvas as interactive editable components.
	 */
	public importFromCode(code: string, removeExisting: boolean = true, fitView: boolean = true): boolean {
		if (!code || !code.trim()) {
			this.showFeedback("Please paste or enter some TikZ code first.", "warning")
			return false
		}

		const parseResult = TikzParser.parse(code)

		if (parseResult.errors.length > 0 && parseResult.components.length === 0) {
			this.showFeedback("Error parsing TikZ code: " + parseResult.errors.join("; "), "danger")
			return false
		}

		if (parseResult.components.length === 0) {
			this.showFeedback("No supported components or wires could be parsed from the TikZ code.", "warning")
			return false
		}

		// Remove existing components if requested
		if (removeExisting) {
			SelectionController.instance.selectAll()
			SelectionController.instance.removeSelection()
		}

		// Instantiate all components
		const loadedComponents: CircuitComponent[] = []
		for (const saveObj of parseResult.components) {
			try {
				const comp = SaveController.fromJson(saveObj)
				if (comp) {
					loadedComponents.push(comp)
				}
			} catch (err: any) {
				console.warn("Could not create component from save object:", saveObj, err)
			}
		}

		if (loadedComponents.length === 0) {
			this.showFeedback("Failed to instantiate parsed components.", "danger")
			return false
		}

		// Select newly added components
		SelectionController.instance.deactivateSelection()
		SelectionController.instance.activateSelection()
		SelectionController.instance.selectComponents(loadedComponents, SelectionMode.RESET)

		// Record undo state
		Undo.addState()

		// Adjust view to fit all components
		if (fitView) {
			CanvasController.instance.fitView()
		}

		const parts: string[] = []
		if (parseResult.stats.bipoles > 0) parts.push(`${parseResult.stats.bipoles} bipole(s)`)
		if (parseResult.stats.wires > 0) parts.push(`${parseResult.stats.wires} wire(s)`)
		if (parseResult.stats.nodes > 0) parts.push(`${parseResult.stats.nodes} node(s)`)
		if (parseResult.stats.shapes > 0) parts.push(`${parseResult.stats.shapes} shape(s)`)

		const summaryMsg = `Successfully imported ${loadedComponents.length} component(s): ${parts.join(", ")}!`
		this.showFeedback(summaryMsg, "success")

		return true
	}

	private showFeedback(message: string, type: "success" | "info" | "warning" | "danger"): void {
		if (!this.feedbackAlert) return
		this.feedbackAlert.className = `alert alert-${type} py-2 px-3 mb-0 d-block`
		this.feedbackAlert.textContent = message
	}

	private hideFeedback(): void {
		if (!this.feedbackAlert) return
		this.feedbackAlert.className = "alert alert-info py-2 px-3 mb-0 d-none"
		this.feedbackAlert.textContent = ""
	}
}
