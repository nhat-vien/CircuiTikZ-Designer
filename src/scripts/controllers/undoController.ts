import {
	MainController,
	SelectionController,
	SaveController,
	SelectionMode,
	SaveFileFormat,
	currentSaveVersion,
	GlobalTikzSettings,
	EnvironmentVariableController,
	DocumentController,
} from "../internal"

/**
 * Class handling undo and redo via save states
 * @class
 */
export class Undo {
	private static states: SaveFileFormat[] = []

	private static currentIndex = -1

	//TODO discuss if selections should be remembered or not???
	public static addState() {
		// reconcile the document layer first so its state is part of this snapshot
		try {
			DocumentController.instance?.syncFromCanvas()
		} catch {
			/* the document layer must never break undo */
		}

		// get json object
		let components = []
		for (const component of MainController.instance.circuitComponents) {
			let componentObject = component.toJson()
			componentObject.selected = component.isSelected
			components.push(componentObject)
		}

		let currentState: SaveFileFormat = {
			version: currentSaveVersion,
			tikzSettings: EnvironmentVariableController.instance.toJson(),
			components: components,
		}

		try {
			currentState.documentState = DocumentController.instance!.captureState(
				MainController.instance.circuitComponents as never
			)
		} catch {
			/* ignore */
		}

		let shouldAddState = true
		if (Undo.states.length > 0) {
			let compareState = Undo.states.at(Undo.currentIndex)
			if (JSON.stringify(compareState) == JSON.stringify(currentState)) {
				// This and the last state are identical -> no new state
				// sometimes needed for more complicated scenarios
				shouldAddState = false
			}
		}

		// push state on stack
		if (shouldAddState) {
			Undo.states = Undo.states.slice(0, Undo.currentIndex + 1)
			Undo.states.push(currentState)
			Undo.currentIndex = Undo.states.length - 1
			MainController.instance?.updateLiveCode()
		}
	}

	public static getCurrentState() {
		return Undo.states[Undo.currentIndex]
	}

	public static undo() {
		Undo.currentIndex -= 1
		if (Undo.currentIndex < 0) {
			Undo.currentIndex = 0
			return
		}
		Undo.loadState()
	}

	public static redo() {
		Undo.currentIndex += 1
		if (Undo.currentIndex >= Undo.states.length) {
			Undo.currentIndex = Undo.states.length - 1
			return
		}
		Undo.loadState()
	}

	private static loadState() {
		// remove all components
		while (MainController.instance.circuitComponents.length > 0) {
			MainController.instance.removeComponent(MainController.instance.circuitComponents[0])
		}

		// load state
		let state = Undo.states[Undo.currentIndex].components

		EnvironmentVariableController.instance.fromJson(Undo.states[Undo.currentIndex].tikzSettings)
		let components = []
		let selectedComponents = []

		for (const component of state) {
			let initalializedComponenent = SaveController.fromJson(component)
			if (initalializedComponenent) {
				if (component.selected && initalializedComponenent) {
					selectedComponents.push(initalializedComponenent)
				}
				components.push(initalializedComponenent)
			}
		}

		// restore the LaTeX document layer together with its attachments
		try {
			DocumentController.instance?.restoreState(
				Undo.states[Undo.currentIndex].documentState,
				components
			)
		} catch {
			/* document layer must never break undo */
		}

		if (selectedComponents.length > 0) {
			SelectionController.instance.selectComponents(selectedComponents, SelectionMode.RESET)
		}

		MainController.instance?.updateLiveCode()
	}
}
