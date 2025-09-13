import { EditableProperty, Undo } from "../internal"

export type ChoiceEntry = {
	key: string
	name: string
}

const indeterminateChoice: ChoiceEntry = { key: "undetermined", name: "choose one" }

export class ChoiceProperty<T extends ChoiceEntry> extends EditableProperty<T> {
	private label: string
	private selectElement: HTMLSelectElement
	private choiceOptions: T[]

	public get entries(): T[] {
		return this.choiceOptions
	}

	public constructor(label: string, choiceOptions: T[], initialValue?: T, tooltip = "", id: string = "") {
		super(initialValue, tooltip, id)
		this.label = label
		this.choiceOptions = choiceOptions
	}
	public eq(first: T, second: T): boolean {
		return first.key == second.key
	}
	public buildHTML(): HTMLElement {
		let row = this.getRow()

		let col = document.createElement("div") as HTMLDivElement
		col.classList.add("col-12", "input-group", "my-0")
		{
			let anchorLabel = document.createElement("label") as HTMLLabelElement
			anchorLabel.classList.add("input-group-text")
			anchorLabel.innerHTML = this.label
			col.appendChild(anchorLabel)

			this.selectElement = document.createElement("select") as HTMLSelectElement
			this.selectElement.classList.add("form-select")
			this.selectElement.name = "anchor"
			for (let index = 0; index < this.choiceOptions.length; index++) {
				const labelKey = this.choiceOptions[index].key
				const labelName = this.choiceOptions[index].name

				let optionElement = document.createElement("option") as HTMLOptionElement
				optionElement.value = labelKey
				optionElement.innerHTML = labelName
				optionElement.selected = this.value ? labelKey == this.value.key : false
				this.selectElement.appendChild(optionElement)
			}

			this.selectElement.addEventListener("change", (ev) => {
				this.updateValue(this.choiceOptions.find((el) => el.key == this.selectElement.value))
				Undo.addState()
			})
			col.appendChild(this.selectElement)
		}
		row.appendChild(col)
		return row
	}

	protected disable(disabled = true): void {
		this.selectElement.disabled = disabled
	}
	public updateHTML(): void {
		if (this.selectElement) {
			for (const optionElement of this.selectElement.children) {
				;(optionElement as HTMLOptionElement).selected =
					(optionElement as HTMLOptionElement).value == this.value.key
			}
		}
	}

	public getMultiEditVersion(properties: ChoiceProperty<T>[]): ChoiceProperty<T> {
		let allEqual = this.equivalent(properties)

		const options: ChoiceEntry[] = allEqual ? [indeterminateChoice] : []
		options.push(...this.choiceOptions)

		const result = new ChoiceProperty<T>(
			this.label,
			this.choiceOptions,
			allEqual ? properties[0].value : (indeterminateChoice as T),
			this.tooltip,
			this.id
		)

		let removedUndeterminedChoice = false
		result.addChangeListener((ev) => {
			if (!removedUndeterminedChoice && ev.previousValue.key == "undetermined") {
				removedUndeterminedChoice = true
				this.selectElement.removeChild(this.selectElement.firstChild)
			}
			for (const property of properties) {
				property.updateValue(ev.value, true, true)
			}
		})
		result.getHTMLElement()
		return result
	}
}
