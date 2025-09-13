import { ChoiceEntry, EditableProperty, Undo } from "../internal"

export type RadioButtonOption = ChoiceEntry & { isMaterialSymbol: boolean }

export class RadioButtonProperty<T extends RadioButtonOption> extends EditableProperty<T> {
	private buttons: HTMLInputElement[] = []
	private label: string
	public options: T[]

	constructor(label: string, options: T[], initialValue: T, tooltip = "", id: string = "") {
		super(initialValue, tooltip, id)
		this.options = options
		this.label = label
	}

	public eq(first: T, second: T): boolean {
		if (second == null || first == null) {
			return false
		}
		return first.key === second.key
	}
	protected buildHTML(): HTMLElement {
		let row = this.getRow()

		let col = document.createElement("div") as HTMLDivElement
		col.classList.add("col-12", "input-group", "my-0")
		{
			let labelElement = document.createElement("span") as HTMLSpanElement
			labelElement.classList.add("col-4", "input-group-text")
			labelElement.innerText = this.label
			col.appendChild(labelElement)

			const btnLabelClasses = [
				"btn",
				"btn-outline-secondary",
				"fs-5",
				"d-flex",
				"align-items-center",
				"justify-content-center",
				"px-1",
				"flex-grow-1",
			]

			for (const option of this.options) {
				const id = this.id + "-" + option.key

				let input = document.createElement("input") as HTMLInputElement
				input.classList.add("btn-check")
				input.type = "radio"
				input.name = this.id
				input.checked = this.value != null ? this.value.key === option.key : false
				input.id = id
				input.addEventListener("change", (ev) => {
					this.updateValue(option as T)
					Undo.addState()
				})
				col.appendChild(input)
				this.buttons.push(input)

				let labelElement = document.createElement("label") as HTMLLabelElement
				labelElement.classList.add(...btnLabelClasses)
				labelElement.innerText = option.name
				if (option.isMaterialSymbol) {
					labelElement.classList.add("material-symbols-outlined")
				}
				labelElement.setAttribute("for", id)
				col.appendChild(labelElement)
			}
		}
		row.appendChild(col)
		return row
	}

	protected disable(disabled?: boolean): void {
		for (const element of this.buttons) {
			element.disabled = disabled ?? true
		}
	}

	public updateHTML(): void {
		for (const button of this.buttons) {
			button.checked = this.value != null ? button.name === this.value.key : false
		}
	}

	public getMultiEditVersion(properties: RadioButtonProperty<T>[]): RadioButtonProperty<T> {
		let allEqual = this.equivalent(properties)

		const result = new RadioButtonProperty<T>(
			this.label,
			this.options as T[],
			allEqual ? (properties[0].value as T) : null,
			this.tooltip,
			this.id
		)
		result.addChangeListener((ev) => {
			for (const property of properties) {
				property.updateValue(ev.value as T, true, true)
			}
		})
		result.getHTMLElement()
		return result
	}
}
