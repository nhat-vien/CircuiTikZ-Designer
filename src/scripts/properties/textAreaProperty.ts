import { CanvasController, EditableProperty, Undo } from "../internal"

export class TextAreaProperty extends EditableProperty<string> {
	private input: HTMLTextAreaElement

	public constructor(initalValue?: string, tooltip = "", id: string = "") {
		super(initalValue, tooltip, id)
	}

	public buildHTML(): HTMLElement {
		let rowTextArea = this.getRow()

		let inputDiv = document.createElement("div") as HTMLDivElement
		inputDiv.classList.add("col-12", "mt-0")
		{
			this.input = document.createElement("textArea") as HTMLTextAreaElement
			this.input.classList.add("form-control")
			this.input.value = this.value ?? ""
			this.input.placeholder = "text component"
			inputDiv.appendChild(this.input)
		}
		rowTextArea.appendChild(inputDiv)

		let previousState: string
		this.input.addEventListener("focusin", (ev) => {
			previousState = this.value
		})
		this.input.addEventListener("input", (ev) => {
			this.updateValue(this.input.value)
		})

		this.input.addEventListener("focusout", (ev) => {
			if (this.value && previousState !== this.value) {
				Undo.addState()
			}
		})
		this.input.addEventListener("mousedown", (ev) => {
			CanvasController.instance.draggingFromInput = this.input
		})

		return rowTextArea
	}

	protected disable(disabled = true): void {
		this.input.disabled = disabled
	}

	public updateHTML(): void {
		if (this.input) {
			this.input.value = this.value
		}
	}

	public eq(first: string, second: string): boolean {
		return first == second
	}

	public getMultiEditVersion(properties: TextAreaProperty[]): TextAreaProperty {
		let allEqual = this.equivalent(properties)

		const result = new TextAreaProperty(allEqual ? this.value : "*", this.tooltip, this.id)

		result.addChangeListener((ev) => {
			for (const property of properties) {
				property.updateValue(ev.value, true, true)
			}
		})
		return result
	}
}
