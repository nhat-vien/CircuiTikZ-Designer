import { EditableProperty, Undo } from "../internal"

export class BooleanProperty extends EditableProperty<boolean> {
	private checkBox: HTMLInputElement
	private label: string

	public constructor(label: string, initialValue?: boolean, tooltip = "", id: string = "") {
		super(initialValue, tooltip, id)
		this.label = label
	}
	public eq(first: boolean, second: boolean): boolean {
		if (first == null || second == null) {
			return false
		}
		return first == second
	}

	public buildHTML(): HTMLElement {
		let row = this.getRow()
		let col = document.createElement("div") as HTMLDivElement
		col.classList.add("col-12", "input-group", "my-0")
		{
			let labelElement = document.createElement("label") as HTMLLabelElement
			labelElement.classList.add("input-group-text", "flex-grow-1")
			labelElement.innerHTML = this.label || "CheckBox"
			col.appendChild(labelElement)

			let checkBoxContainer = document.createElement("div") as HTMLDivElement
			checkBoxContainer.classList.add("input-group-text", "form-switch")
			{
				this.checkBox = document.createElement("input") as HTMLInputElement
				this.checkBox.classList.add("form-check-input", "m-0")
				this.checkBox.setAttribute("type", "checkbox")
				this.checkBox.setAttribute("role", "switch")
				if (this.value != null) {
					this.checkBox.checked = this.value
				} else {
					this.checkBox.indeterminate = true
				}

				this.checkBox.addEventListener("change", (ev) => {
					this.updateValue(this.checkBox.checked)
					Undo.addState()
				})
				checkBoxContainer.appendChild(this.checkBox)
			}
			col.appendChild(checkBoxContainer)
		}
		row.appendChild(col)
		return row
	}

	protected disable(disabled = true): void {
		this.checkBox.disabled = disabled
	}

	public updateHTML(): void {
		if (this.checkBox) {
			this.checkBox.checked = this.value
		}
	}

	public getMultiEditVersion(properties: BooleanProperty[]): BooleanProperty {
		let allEqual = this.equivalent(properties)

		const result = new BooleanProperty(this.label, allEqual ? this.value : null, this.tooltip, this.id)
		result.addChangeListener((ev) => {
			for (const property of properties) {
				property.updateValue(ev.value, true, true)
			}
		})
		result.getHTMLElement()
		return result
	}
}
