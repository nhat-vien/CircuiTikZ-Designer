import * as SVG from "@svgdotjs/svg.js"
import { CircuitComponent, GroupComponent, type GroupSaveObject, MainController } from "../internal"

export type SubcircuitSaveObject = {
	type: string
	displayName: string
	components: any[]
	position: { x: number; y: number }
}

export class SubcircuitComponent extends GroupComponent {
	private static jsonID = "subcircuit"
	static {
		CircuitComponent.jsonSaveMap.set(SubcircuitComponent.jsonID, SubcircuitComponent)
	}

	constructor(displayName: string, components: CircuitComponent[]) {
		super(components)
		this.displayName = displayName
	}

	public copyForPlacement(): SubcircuitComponent {
		const clonedComponents = this.groupedComponents.map((c) => {
			const json = c.toJson()
			return CircuitComponent.fromJson(json)
		}).filter(Boolean) as CircuitComponent[]
		const sub = new SubcircuitComponent(this.displayName, clonedComponents)
		return sub
	}

	public placeMove(pos: SVG.Point, ev?: Event): void {
		this.moveTo(pos)
	}

	public placeStep(pos: SVG.Point, ev?: Event): boolean {
		return true
	}

	public placeFinish(): void {
		this.update()
	}

	public toJson(): SubcircuitSaveObject {
		const componentsJson = this.groupedComponents.map((component) => component.toJson())
		const center = this.position
		const convertToRelative = (objs: any[]) => {
			for (const obj of objs) {
				if (obj.type === "subcircuit") {
					if (obj.position) {
						obj.position.x = obj.position.x - center.x
						obj.position.y = obj.position.y - center.y
					}
				} else if (obj.type === "group") {
					if (obj.components) {
						convertToRelative(obj.components)
					}
				} else {
					if (obj.position) {
						obj.position.x = obj.position.x - center.x
						obj.position.y = obj.position.y - center.y
					}
					if (obj.points) {
						for (const pt of obj.points) {
							pt.x = pt.x - center.x
							pt.y = pt.y - center.y
						}
					}
					if (obj.components) {
						convertToRelative(obj.components)
					}
				}
			}
		}
		convertToRelative(componentsJson)
		return {
			type: SubcircuitComponent.jsonID,
			displayName: this.displayName,
			components: componentsJson,
			position: this.position.simplifyForJson(),
		}
	}

	public static fromJson(saveObject: SubcircuitSaveObject): SubcircuitComponent {
		let innerComponents = saveObject.components
		if ((!innerComponents || innerComponents.length === 0) && MainController.instance) {
			const symbolId = "subcircuit-" + saveObject.displayName
			const customSymbols = (MainController.instance as any).customSymbols
			const customSymbol = customSymbols?.find((s: any) => s.id === symbolId)
			if (customSymbol && customSymbol.subcircuitData) {
				innerComponents = customSymbol.subcircuitData.components
			}
		}
		const components: CircuitComponent[] = []
		for (const saveObj of innerComponents || []) {
			const comp = CircuitComponent.fromJson(saveObj)
			if (comp) components.push(comp)
		}
		const sub = new SubcircuitComponent(saveObject.displayName, components)
		if (saveObject.position) {
			const pos = new SVG.Point(saveObject.position.x, saveObject.position.y)
			sub.moveTo(pos)
		}
		return sub
	}

	public toTikzString(): string {
		let outStr = []
		for (const component of this.groupedComponents) {
			outStr.push(component.toTikzString())
		}
		return outStr.join("\n\t")
	}
}
