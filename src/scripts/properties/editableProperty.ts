import { MainController, Modes } from "../internal"

type ChangeEvent<T> = {
	previousValue: T
	value: T
}

export abstract class EditableProperty<T> {
	private tooltip: string
	protected element: HTMLElement

	private _disabled: boolean
	public get disabled(): boolean {
		return this._disabled
	}
	public set disabled(value: boolean) {
		this.getHTMLElement() // build component if not already done, otherwise disabling might not work sometimes
		this._disabled = value
		this.disable(value)
	}

	private _id: string
	public get id(): string {
		return this._id
	}

	private _value: T
	public get value(): T {
		return this._value
	}
	public set value(newVal: T) {
		this._value = newVal
		if (!this.element) {
			this.element = this.buildHTML()
		}
		this.updateHTML()
	}

	private changeListeners: { (event: ChangeEvent<T>): void }[]

	public constructor(initialValue?: T, tooltip: string = "", id: string = "") {
		// make sure to be in drag_pan mode when changing any value
		this.changeListeners = [
			(ev) => {
				MainController.instance.switchMode(Modes.DRAG_PAN)
			},
		]
		if (initialValue !== undefined) {
			this._value = initialValue
		}
		this._id = id
		this.tooltip = tooltip
	}

	/**
	 * Evaluate if two values of type T are equal
	 */
	public abstract eq(first: T, second: T): boolean

	/**
	 * override this to implement how this component can be disabled
	 * @param disabled
	 */
	protected abstract disable(disabled?: boolean): void

	public getHTMLElement(): HTMLElement {
		if (!this.element) {
			this.element = this.buildHTML()

			if (this.tooltip && this.element) {
				this.element.setAttribute("data-bs-title", this.tooltip)
				this.element.setAttribute("data-bs-toggle", "tooltip")
			}
		}
		return this.element
	}

	public removeHTMLElement(): void {
		if (this.element) {
			this.element.remove()
			this.element = null
		}
	}

	/**
	 * Override/use this
	 */
	protected abstract buildHTML(): HTMLElement
	protected getRow(): HTMLDivElement {
		let row = document.createElement("div") as HTMLDivElement
		row.classList.add("row", "g-2", "my-2")
		return row
	}
	public abstract updateHTML(): void

	public addChangeListener(changeListener: (ev: ChangeEvent<T>) => void) {
		this.changeListeners.push(changeListener)
	}
	public removeChangeListener(changeListener: (ev: ChangeEvent<T>) => void): boolean {
		let idx = this.changeListeners.findIndex((val) => val == changeListener)
		if (idx >= 0) {
			this.changeListeners.splice(idx, 1)
			return true
		}
		return false
	}

	public updateValue(newVal: T, updateHTML = false, notifyEventListeners = true) {
		if (this.eq(newVal, this.value)) {
			return
		}
		let lastValue = this.value
		this._value = newVal
		let changeEvent: ChangeEvent<T> = {
			previousValue: lastValue,
			value: this._value,
		}
		if (updateHTML) {
			if (!this.element) {
				this.element = this.buildHTML()
			}
			this.updateHTML()
		}
		if (notifyEventListeners) {
			for (const element of this.changeListeners) {
				element(changeEvent)
			}
		}
	}
}
