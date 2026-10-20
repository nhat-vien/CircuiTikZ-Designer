import { Point } from "@svgdotjs/svg.js"
import { Toast } from "bootstrap"
import {
	CircuitComponent,
	ComponentSaveObject,
	MainController,
	MessageData,
	SaveController,
	SelectionController,
	SelectionMode,
	Undo,
} from "../internal"
import { createComponentsSvgText, writeSvgTextToClipboard } from "../services/clipboardSvgService"

type Clipboard = {
	components: ComponentSaveObject[]
	selectionPos: Point
}

/**
 * Class handling copy, paste and cut
 * @class
 */
export class CopyPaste {
	private static clipboard: Clipboard | null = null

	public static copy() {
		if (SelectionController.instance.hasSelection()) {
			let components: ComponentSaveObject[] = []
			for (const component of SelectionController.instance.currentlySelectedComponents) {
				let componentObject = component.toJson()
				if ("name" in componentObject) {
					componentObject.name = ""
				}

				components.push(componentObject)
			}

			let bbox = SelectionController.instance.getOverallBoundingBox()
			if (!bbox) return

			CopyPaste.clipboard = {
				components: components,
				selectionPos: new Point(bbox.cx, bbox.cy),
			}

			MainController.instance.sendBroadcastMessage("clipboard", CopyPaste.clipboard)

			const svgText = createComponentsSvgText(SelectionController.instance.currentlySelectedComponents)
			writeSvgTextToClipboard(svgText)
				.then(() => {
					CopyPaste.showToast("Copied selection to clipboard as PNG image!")
				})
				.catch((error) => {
					console.warn("Could not write SVG selection to the system clipboard.", error)
				})
		}
	}

	public static async copyAsPngImage(): Promise<boolean> {
		const components: CircuitComponent[] =
			SelectionController.instance.hasSelection()
				? SelectionController.instance.currentlySelectedComponents
				: MainController.instance.circuitComponents

		if (!components || components.length === 0) {
			CopyPaste.showToast("No components to copy!")
			return false
		}

		try {
			const svgText = createComponentsSvgText(components)
			await writeSvgTextToClipboard(svgText)
			CopyPaste.showToast(
				SelectionController.instance.hasSelection()
					? "Copied selection as PNG image to clipboard!"
					: "Copied diagram as PNG image to clipboard!"
			)
			return true
		} catch (error) {
			console.warn("Could not copy diagram as PNG image.", error)
			return false
		}
	}

	public static showToast(message: string): void {
		let toastEl = document.getElementById("clipboardToast")
		if (!toastEl) {
			toastEl = document.createElement("div")
			toastEl.id = "clipboardToast"
			toastEl.className = "toast align-items-center text-bg-primary border-0 position-fixed bottom-0 end-0 m-3 shadow"
			toastEl.setAttribute("role", "alert")
			toastEl.setAttribute("aria-live", "assertive")
			toastEl.setAttribute("aria-atomic", "true")
			toastEl.style.zIndex = "1090"
			toastEl.innerHTML = `
				<div class="d-flex">
					<div class="toast-body d-flex align-items-center gap-2">
						<span class="material-symbols-outlined fs-5">content_copy</span>
						<span id="clipboardToastMessage"></span>
					</div>
					<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
				</div>
			`
			document.body.appendChild(toastEl)
		}
		const msgEl = document.getElementById("clipboardToastMessage")
		if (msgEl) msgEl.textContent = message
		try {
			const toast = Toast.getOrCreateInstance(toastEl, { delay: 2500 })
			toast.show()
		} catch {
			// Ignore if bootstrap toast failed
		}
	}

	public static setClipboard(clipboard: Clipboard) {
		this.clipboard = clipboard
	}

	public static paste() {
		if (CopyPaste.clipboard && Object.keys(CopyPaste.clipboard).length === 0) {
			return
		}

		if (!CopyPaste.clipboard) {
			return
		}

		SelectionController.instance.deactivateSelection()
		SelectionController.instance.activateSelection()

		let allComponents = []

		for (const component of CopyPaste.clipboard.components) {
			allComponents.push(SaveController.fromJson(component))
		}

		if (allComponents.length > 0) {
			SelectionController.instance.selectComponents(allComponents, SelectionMode.RESET)
		}
		SelectionController.instance.moveSelectionTo(new Point(CopyPaste.clipboard.selectionPos).add(new Point(20, 20)))
		Undo.addState()
	}

	public static cut() {
		if (SelectionController.instance.hasSelection()) {
			CopyPaste.copy()

			for (const component of SelectionController.instance.currentlySelectedComponents) {
				MainController.instance.removeComponent(component)
			}
			Undo.addState()
		}
	}
}
