import * as SVG from "@svgdotjs/svg.js"
import { closestBasicDirection } from "../utils/utils"
import { CanvasController } from "../controllers/canvasController"
import { CircuitComponent } from "./circuitComponent"
import { EllipseComponent, type EllipseSaveObject } from "./ellipseComponent"
import { RectangleComponent, type RectangleSaveObject } from "./rectangleComponent"
import { type TikzNodeCommand } from "../utils/tikzBuilder"

export type FlowchartComponentKind =
	| "terminator"
	| "process"
	| "decision"
	| "inputOutput"
	| "document"
	| "database"
	| "subprocess"
	| "connector"
	| "offPageConnector"
	| "flowArrow"

function replaceNodeShape(command: TikzNodeCommand, shapeOption: string) {
	const shapeIndex = command.options.findIndex((option) => option.startsWith("shape="))
	if (shapeIndex >= 0) {
		command.options[shapeIndex] = shapeOption
	} else {
		command.options.unshift(shapeOption)
	}
}

function applyNormalizedPolygonGeometry(
	component: RectangleComponent,
	points: Array<[number, number]>
) {
	const target = component.componentVisualization as unknown as SVG.Polygon
	const strokeWidth = (component as any).strokeInfo.width.convertToUnit("px").value
	const size = (component as any).size as SVG.Point
	const renderWidth = Math.max(size.x - strokeWidth, 0)
	const renderHeight = Math.max(size.y - strokeWidth, 0)
	const offset = strokeWidth / 2

	target.plot(
		points.map(([x, y]) => [offset + x * renderWidth, offset + y * renderHeight] as [number, number])
	)
	target.transform((component as any).getTransformMatrix())
}

function applyPathGeometry(component: RectangleComponent, builder: (width: number, height: number, offset: number) => string) {
	const target = component.componentVisualization as unknown as SVG.Path
	const strokeWidth = (component as any).strokeInfo.width.convertToUnit("px").value
	const size = (component as any).size as SVG.Point
	const renderWidth = Math.max(size.x - strokeWidth, 0)
	const renderHeight = Math.max(size.y - strokeWidth, 0)
	const offset = strokeWidth / 2
	const pathData = builder(renderWidth, renderHeight, offset)

	target.plot(pathData)
	target.transform((component as any).getTransformMatrix())
}

function updateCustomRectangleShape(component: RectangleComponent, geometry: () => void) {
	const internal = component as any
	const transformMatrix = internal.getTransformMatrix()
	const halfSize = internal.size.div(2)

	internal.dragElement.size(internal.size.x, internal.size.y)
	internal.dragElement.transform(transformMatrix)

	internal.defaultTextPosition = halfSize
	internal._bbox = internal.dragElement.bbox().transform(transformMatrix)

	if (internal.isResizing) {
		for (const [direction, viz] of internal.resizeVisualizations.entries()) {
			const directionTransformed = direction.direction.transform(
				new SVG.Matrix({
					rotate: -internal.rotationDeg,
					scaleX: internal.scaleState.x,
					scaleY: internal.scaleState.y,
				})
			)
			viz.node.style.cursor = closestBasicDirection(directionTransformed).pointer
		}
	}

	geometry()
	internal.recalculateSelectionVisuals()
	internal.recalculateSnappingPoints()
	internal.recalculateResizePoints()
	internal.updatePositionedLabel()
	internal.updateText()
}

export class FlowchartTerminatorComponent extends RectangleComponent {
	private static jsonID = "flowTerminator"
	static {
		CircuitComponent.jsonSaveMap.set(FlowchartTerminatorComponent.jsonID, FlowchartTerminatorComponent)
	}

	public constructor() {
		super(false)
		this.displayName = "Start / End"
	}

	public override update(): void {
		super.update()
		const halfHeight = ((this as any).size?.y ?? 0) / 2
		const radius = Math.max(8, Math.min(halfHeight, 18))
		this.componentVisualization.attr({ rx: radius, ry: radius })
	}

	public override toJson(): RectangleSaveObject {
		const data = super.toJson()
		data.type = FlowchartTerminatorComponent.jsonID
		return data
	}

	public static override fromJson(_saveObject: RectangleSaveObject): FlowchartTerminatorComponent {
		return new FlowchartTerminatorComponent()
	}

	protected override buildTikzCommand(command: TikzNodeCommand): void {
		super.buildTikzCommand(command)
		if (!command.options.includes("rounded corners=8pt")) {
			command.options.push("rounded corners=8pt")
		}
	}

	public override copyForPlacement(): CircuitComponent {
		return new FlowchartTerminatorComponent()
	}
}

export class FlowchartDecisionComponent extends RectangleComponent {
	private static jsonID = "flowDecision"
	static {
		CircuitComponent.jsonSaveMap.set(FlowchartDecisionComponent.jsonID, FlowchartDecisionComponent)
	}

	public constructor() {
		super(false)
		this.displayName = "Decision"
		this.componentVisualization.remove()
		this.componentVisualization = CanvasController.instance.canvas
			.polygon([
				[0.5, 0],
				[1, 0.5],
				[0.5, 1],
				[0, 0.5],
			])
			.hide()
		this.visualization.add(this.componentVisualization)
	}

	public override toJson(): RectangleSaveObject {
		const data = super.toJson()
		data.type = FlowchartDecisionComponent.jsonID
		return data
	}

	public static override fromJson(_saveObject: RectangleSaveObject): FlowchartDecisionComponent {
		return new FlowchartDecisionComponent()
	}

	public override update(): void {
		updateCustomRectangleShape(this, () =>
			applyNormalizedPolygonGeometry(this, [
				[0.5, 0],
				[1, 0.5],
				[0.5, 1],
				[0, 0.5],
			])
		)
	}

	protected override buildTikzCommand(command: TikzNodeCommand): void {
		super.buildTikzCommand(command)
		replaceNodeShape(command, "shape=diamond")
		if (!command.options.includes("aspect=1.6")) {
			command.options.push("aspect=1.6")
		}
	}

	public override requiredTikzLibraries(): string[] {
		return ["shapes.geometric"]
	}

	public override copyForPlacement(): CircuitComponent {
		return new FlowchartDecisionComponent()
	}
}

export class FlowchartInputOutputComponent extends RectangleComponent {
	private static jsonID = "flowInputOutput"
	static {
		CircuitComponent.jsonSaveMap.set(FlowchartInputOutputComponent.jsonID, FlowchartInputOutputComponent)
	}

	public constructor() {
		super(false)
		this.displayName = "Input / Output"
		this.componentVisualization.remove()
		this.componentVisualization = CanvasController.instance.canvas
			.polygon([
				[0.18, 0],
				[1, 0],
				[0.82, 1],
				[0, 1],
			])
			.hide()
		this.visualization.add(this.componentVisualization)
	}

	public override toJson(): RectangleSaveObject {
		const data = super.toJson()
		data.type = FlowchartInputOutputComponent.jsonID
		return data
	}

	public static override fromJson(_saveObject: RectangleSaveObject): FlowchartInputOutputComponent {
		return new FlowchartInputOutputComponent()
	}

	public override update(): void {
		updateCustomRectangleShape(this, () =>
			applyNormalizedPolygonGeometry(this, [
				[0.18, 0],
				[1, 0],
				[0.82, 1],
				[0, 1],
			])
		)
	}

	protected override buildTikzCommand(command: TikzNodeCommand): void {
		super.buildTikzCommand(command)
		replaceNodeShape(command, "shape=trapezium")
		if (!command.options.includes("trapezium left angle=70")) {
			command.options.push("trapezium left angle=70")
		}
		if (!command.options.includes("trapezium right angle=110")) {
			command.options.push("trapezium right angle=110")
		}
	}

	public override requiredTikzLibraries(): string[] {
		return ["shapes.geometric"]
	}

	public override copyForPlacement(): CircuitComponent {
		return new FlowchartInputOutputComponent()
	}
}

export class FlowchartDocumentComponent extends RectangleComponent {
	private static jsonID = "flowDocument"
	static {
		CircuitComponent.jsonSaveMap.set(FlowchartDocumentComponent.jsonID, FlowchartDocumentComponent)
	}

	public constructor() {
		super(false)
		this.displayName = "Document"
		this.componentVisualization.remove()
		this.componentVisualization = CanvasController.instance.canvas
			.path("M 0 0 L 1 0 L 1 0.82 C 0.88 0.94, 0.72 1, 0.5 0.92 C 0.3 0.84, 0.14 0.9, 0 1 Z")
			.hide()
		this.visualization.add(this.componentVisualization)
	}

	public override toJson(): RectangleSaveObject {
		const data = super.toJson()
		data.type = FlowchartDocumentComponent.jsonID
		return data
	}

	public static override fromJson(_saveObject: RectangleSaveObject): FlowchartDocumentComponent {
		return new FlowchartDocumentComponent()
	}

	public override update(): void {
		updateCustomRectangleShape(this, () =>
			applyPathGeometry(
				this,
				(width, height, offset) =>
					`M ${offset} ${offset} L ${offset + width} ${offset} L ${offset + width} ${offset + height * 0.82} ` +
					`C ${offset + width * 0.88} ${offset + height * 0.94}, ${offset + width * 0.72} ${offset + height}, ${offset + width * 0.5} ${offset + height * 0.92} ` +
					`C ${offset + width * 0.3} ${offset + height * 0.84}, ${offset + width * 0.14} ${offset + height * 0.9}, ${offset} ${offset + height} Z`
			)
		)
	}

	protected override buildTikzCommand(command: TikzNodeCommand): void {
		super.buildTikzCommand(command)
		replaceNodeShape(command, "shape=document")
	}

	public override requiredTikzLibraries(): string[] {
		return ["shapes.symbols"]
	}

	public override copyForPlacement(): CircuitComponent {
		return new FlowchartDocumentComponent()
	}
}

export class FlowchartDatabaseComponent extends RectangleComponent {
	private static jsonID = "flowDatabase"
	static {
		CircuitComponent.jsonSaveMap.set(FlowchartDatabaseComponent.jsonID, FlowchartDatabaseComponent)
	}

	public constructor() {
		super(false)
		this.displayName = "Database"
		this.componentVisualization.remove()
		this.componentVisualization = CanvasController.instance.canvas
			.path(
				"M 0.16 0 C 0.07 0, 0 0.06, 0 0.14 L 0 0.86 C 0 0.94, 0.07 1, 0.16 1 L 0.84 1 C 0.93 1, 1 0.94, 1 0.86 L 1 0.14 C 1 0.06, 0.93 0, 0.84 0 Z M 0 0.14 C 0 0.06, 0.22 0, 0.5 0 C 0.78 0, 1 0.06, 1 0.14 C 1 0.22, 0.78 0.28, 0.5 0.28 C 0.22 0.28, 0 0.22, 0 0.14 M 0 0.86 C 0 0.78, 0.22 0.72, 0.5 0.72 C 0.78 0.72, 1 0.78, 1 0.86 C 1 0.94, 0.78 1, 0.5 1 C 0.22 1, 0 0.94, 0 0.86"
			)
			.hide()
		this.visualization.add(this.componentVisualization)
	}

	public override toJson(): RectangleSaveObject {
		const data = super.toJson()
		data.type = FlowchartDatabaseComponent.jsonID
		return data
	}

	public static override fromJson(_saveObject: RectangleSaveObject): FlowchartDatabaseComponent {
		return new FlowchartDatabaseComponent()
	}

	public override update(): void {
		updateCustomRectangleShape(this, () =>
			applyPathGeometry(
				this,
				(width, height, offset) => {
					const left = offset
					const top = offset
					const right = offset + width
					const bottom = offset + height
					const ellipseHeight = Math.min(height * 0.28, height / 2)
					const midTop = top + ellipseHeight / 2
					const midBottom = bottom - ellipseHeight / 2
					return [
						`M ${left} ${midTop}`,
						`C ${left} ${top}, ${right} ${top}, ${right} ${midTop}`,
						`L ${right} ${midBottom}`,
						`C ${right} ${bottom}, ${left} ${bottom}, ${left} ${midBottom}`,
						"Z",
						`M ${left} ${midTop}`,
						`C ${left} ${top + ellipseHeight}, ${right} ${top + ellipseHeight}, ${right} ${midTop}`,
						`M ${left} ${midBottom}`,
						`C ${left} ${bottom - ellipseHeight}, ${right} ${bottom - ellipseHeight}, ${right} ${midBottom}`,
					].join(" ")
				}
			)
		)
	}

	protected override buildTikzCommand(command: TikzNodeCommand): void {
		super.buildTikzCommand(command)
		replaceNodeShape(command, "shape=cylinder")
	}

	public override requiredTikzLibraries(): string[] {
		return ["shapes.geometric"]
	}

	public override copyForPlacement(): CircuitComponent {
		return new FlowchartDatabaseComponent()
	}
}

export class FlowchartSubprocessComponent extends RectangleComponent {
	private static jsonID = "flowSubprocess"
	static {
		CircuitComponent.jsonSaveMap.set(FlowchartSubprocessComponent.jsonID, FlowchartSubprocessComponent)
	}

	public constructor() {
		super(false)
		this.displayName = "Subprocess"
		this.componentVisualization.remove()
		this.componentVisualization = CanvasController.instance.canvas
			.path("M 0 0 L 1 0 L 1 1 L 0 1 Z M 0.12 0.08 L 0.12 0.92 M 0.88 0.08 L 0.88 0.92")
			.hide()
		this.visualization.add(this.componentVisualization)
	}

	public override toJson(): RectangleSaveObject {
		const data = super.toJson()
		data.type = FlowchartSubprocessComponent.jsonID
		return data
	}

	public static override fromJson(_saveObject: RectangleSaveObject): FlowchartSubprocessComponent {
		return new FlowchartSubprocessComponent()
	}

	public override update(): void {
		updateCustomRectangleShape(this, () =>
			applyPathGeometry(
				this,
				(width, height, offset) => {
					const inset = Math.min(width * 0.12, 18)
					return [
						`M ${offset} ${offset}`,
						`L ${offset + width} ${offset}`,
						`L ${offset + width} ${offset + height}`,
						`L ${offset} ${offset + height} Z`,
						`M ${offset + inset} ${offset + Math.min(8, height * 0.08)}`,
						`L ${offset + inset} ${offset + height - Math.min(8, height * 0.08)}`,
						`M ${offset + width - inset} ${offset + Math.min(8, height * 0.08)}`,
						`L ${offset + width - inset} ${offset + height - Math.min(8, height * 0.08)}`,
					].join(" ")
				}
			)
		)
	}

	protected override buildTikzCommand(command: TikzNodeCommand): void {
		super.buildTikzCommand(command)
		if (!command.options.includes("double")) {
			command.options.push("double")
		}
		if (!command.options.includes("double distance=1.6mm")) {
			command.options.push("double distance=1.6mm")
		}
	}

	public override copyForPlacement(): CircuitComponent {
		return new FlowchartSubprocessComponent()
	}
}

export class FlowchartConnectorComponent extends EllipseComponent {
	private static jsonID = "flowConnector"
	static {
		CircuitComponent.jsonSaveMap.set(FlowchartConnectorComponent.jsonID, FlowchartConnectorComponent)
	}

	public constructor() {
		super()
		this.displayName = "Connector"
	}

	public override toJson(): EllipseSaveObject {
		const data = super.toJson()
		data.type = FlowchartConnectorComponent.jsonID
		return data
	}

	public static override fromJson(_saveObject: EllipseSaveObject): FlowchartConnectorComponent {
		return new FlowchartConnectorComponent()
	}

	public override copyForPlacement(): CircuitComponent {
		return new FlowchartConnectorComponent()
	}
}

export class FlowchartOffPageConnectorComponent extends RectangleComponent {
	private static jsonID = "flowOffPageConnector"
	static {
		CircuitComponent.jsonSaveMap.set(
			FlowchartOffPageConnectorComponent.jsonID,
			FlowchartOffPageConnectorComponent
		)
	}

	public constructor() {
		super(false)
		this.displayName = "Off-page Connector"
		this.componentVisualization.remove()
		this.componentVisualization = CanvasController.instance.canvas
			.polygon([
				[0.12, 0],
				[0.88, 0],
				[1, 0.58],
				[0.5, 1],
				[0, 0.58],
			])
			.hide()
		this.visualization.add(this.componentVisualization)
	}

	public override toJson(): RectangleSaveObject {
		const data = super.toJson()
		data.type = FlowchartOffPageConnectorComponent.jsonID
		return data
	}

	public static override fromJson(
		_saveObject: RectangleSaveObject
	): FlowchartOffPageConnectorComponent {
		return new FlowchartOffPageConnectorComponent()
	}

	public override update(): void {
		updateCustomRectangleShape(this, () =>
			applyNormalizedPolygonGeometry(this, [
				[0.12, 0],
				[0.88, 0],
				[1, 0.58],
				[0.5, 1],
				[0, 0.58],
			])
		)
	}

	protected override buildTikzCommand(command: TikzNodeCommand): void {
		super.buildTikzCommand(command)
		replaceNodeShape(command, "shape=regular polygon")
		if (!command.options.includes("regular polygon sides=5")) {
			command.options.push("regular polygon sides=5")
		}
		if (!command.options.includes("shape border rotate=270")) {
			command.options.push("shape border rotate=270")
		}
	}

	public override requiredTikzLibraries(): string[] {
		return ["shapes.geometric"]
	}

	public override copyForPlacement(): CircuitComponent {
		return new FlowchartOffPageConnectorComponent()
	}
}
