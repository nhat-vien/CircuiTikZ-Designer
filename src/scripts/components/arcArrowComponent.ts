import * as SVG from "@svgdotjs/svg.js"
import {
	CanvasController,
	CircuitComponent,
	ShapeComponent,
	ShapeSaveObject,
	TikzNodeCommand,
	SnapPoint,
	SnappingInfo,
	basicDirections,
	defaultBasicDirection,
} from "../internal"
import { roundTikz } from "../utils/selectionHelper"

export type ArcArrowSaveObject = ShapeSaveObject & {
	clockwise: boolean
}

/**
 * Component for drawing a 3/4 ellipse arc with arrow (for AC current symbol)
 */
export class ArcArrowComponent extends ShapeComponent {
	private static jsonID = "arcArrow"
	static {
		CircuitComponent.jsonSaveMap.set(ArcArrowComponent.jsonID, ArcArrowComponent)
	}

	private clockwise: boolean = true
	
	declare public componentVisualization: SVG.Path
	declare protected dragElement: SVG.Rect

	public constructor() {
		super()
		this.displayName = "Arc Arrow (AC)"

		this.componentVisualization = CanvasController.instance.canvas.path("")
		this.componentVisualization.attr({
			fill: "none",
			stroke: "var(--stroke-color)",
			"stroke-width": 2,
		})
		this.componentVisualization.hide()

		// Invisible rect for dragging
		this.dragElement = CanvasController.instance.canvas.rect(0, 0)
		this.dragElement.attr({
			fill: "transparent",
			stroke: "none",
		})

		this.visualization.add(this.componentVisualization)
		this.visualization.add(this.dragElement)
	}

	protected update(): void {
		// Don't call super.update() because it tries to use .size() and .center() which Path doesn't have
		// Instead, manually do what we need
		
		let strokeWidth = this.strokeInfo.width.convertToUnit("px").value
		let transformMatrix = this.getTransformMatrix()
		const halfSize = this.size.div(2)
		
		this.defaultTextPosition = halfSize
		
		if (this.size.x > 0 && this.size.y > 0) {
			// Use full size for ellipse radii
			const rx = this.size.x / 2
			const ry = this.size.y / 2
			const cx = rx
			const cy = ry

			// Draw a 3/5 arc (216°) from top to bottom-right
			// Start from top (90°), go 216° clockwise to bottom-right (-54°)
			const startAngle = this.clockwise ? 90 : -90
			const endAngle = this.clockwise ? -54 : 126  // 90° - 216° = -126° = -54° (normalized)
			
			// Calculate points in local coordinates
			const startX = cx + rx * Math.cos((startAngle * Math.PI) / 180)
			const startY = cy + ry * Math.sin((startAngle * Math.PI) / 180)
			const endX = cx + rx * Math.cos((endAngle * Math.PI) / 180)
			const endY = cy + ry * Math.sin((endAngle * Math.PI) / 180)

			// SVG elliptical arc path - 3/4 arc (270°)
			const largeArcFlag = 1  // 270° > 180°
			const sweepFlag = this.clockwise ? 1 : 0
			
			const pathData = `M ${startX} ${startY} A ${rx} ${ry} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`
			
			// Add arrowhead - tangent direction at end point
			// At -54° (bottom-right), tangent for clockwise arc is perpendicular
			// Tangent = angle + 90° for clockwise = -54° + 90° = 36°
			// Flip 180° to show arc direction = 36° + 180° = 216°
			// Adjust up by 30° to make arrow point more horizontal = 216° - 30° = 186°
			const arrowSize = Math.min(rx, ry) * 0.3
			const tangentAngle = this.clockwise ? 195 : 15  // Adjusted for better look
			const arrowAngle = tangentAngle * Math.PI / 180
			
			// Use 25° angle (0.44 radian) for arrowhead
			const arrowSpread = 0.44  // 25 degrees
			const arrow1X = endX + arrowSize * Math.cos(arrowAngle - arrowSpread)
			const arrow1Y = endY + arrowSize * Math.sin(arrowAngle - arrowSpread)
			const arrow2X = endX + arrowSize * Math.cos(arrowAngle + arrowSpread)
			const arrow2Y = endY + arrowSize * Math.sin(arrowAngle + arrowSpread)
			
			const fullPath = `${pathData} M ${arrow1X} ${arrow1Y} L ${endX} ${endY} L ${arrow2X} ${arrow2Y}`
			
			this.componentVisualization.plot(fullPath)
			this.componentVisualization.transform(transformMatrix)
			
			// Use dragElement bbox (full size) for consistent behavior
			if (this.dragElement) {
				this.dragElement.size(this.size.x, this.size.y)
				this.dragElement.transform(transformMatrix)
				this._bbox = this.dragElement.bbox()
			} else {
				this._bbox = new SVG.Box()
			}
		} else {
			this._bbox = new SVG.Box()
		}
		
		// Update resize pointers if resizing
		if (this.isResizing) {
			this.recalculateResizePoints()
		}
		
		this.recalculateSnappingPoints()
	}

	public recalculateSnappingPoints(matrix?: SVG.Matrix): void {
		let relPositions: { anchorname: string; relPos: SVG.Point }[] = []
		let halfSize = this.size.div(2)
		for (const anchor of basicDirections) {
			if (anchor.key == defaultBasicDirection.key) {
				continue
			}
			let dirLength = anchor.direction.abs()
			dirLength = dirLength == 0 ? 1 : dirLength
			relPositions.push({ relPos: halfSize.mul(anchor.direction.div(dirLength)), anchorname: anchor.name })
			if (dirLength > 1) {
				relPositions.push({ relPos: halfSize.mul(anchor.direction), anchorname: "" })
			}
		}

		if (!this.snappingPoints || this.snappingPoints.length == 0) {
			for (const element of relPositions) {
				this.snappingPoints.push(new SnapPoint(this, element.anchorname, element.relPos.add(halfSize)))
			}
		} else {
			for (let index = 0; index < relPositions.length; index++) {
				const relPos = relPositions[index].relPos
				const snappingPoint = this.snappingPoints[index]
				snappingPoint.updateRelPosition(relPos.add(halfSize))
				snappingPoint.recalculate()
			}
		}
	}

	public getSnappingInfo(): SnappingInfo {
		return {
			trackedSnappingPoints: this.snappingPoints,
			additionalSnappingPoints: [],
		}
	}

	public toJson(): ArcArrowSaveObject {
		const data = super.toJson() as ArcArrowSaveObject
		data.type = ArcArrowComponent.jsonID
		data.clockwise = this.clockwise
		return data
	}

	public applyJson(saveObject: ArcArrowSaveObject) {
		super.applyJson(saveObject)
		this.clockwise = saveObject.clockwise ?? true
		this.update()
		this.componentVisualization.show()
		this.updateTheme()
	}

	public static fromJson(saveObject: ArcArrowSaveObject): ArcArrowComponent {
		return new ArcArrowComponent()
	}

	protected buildTikzCommand(command: TikzNodeCommand): void {
		super.buildTikzCommand(command)
		
		const rx = new SVG.Number(this.size.x / 2, "px").convertToUnit("cm").value
		const ry = new SVG.Number(this.size.y / 2, "px").convertToUnit("cm").value
		
		// Use a custom TikZ command for arc with arrow
		// Match the visual: 3/5 arc from top (90°) to bottom-right (-54°)
		const startAngle = this.clockwise ? 90 : -90
		const endAngle = this.clockwise ? -54 : 126
		
		// Add to options to draw the arc
		command.options.push("draw")
		command.options.push("-{Stealth[length=2mm]}")
		command.content = ""
		
		// Add custom arc drawing as additional node
		const arcCommand: TikzNodeCommand = {
			options: [],
			additionalNodes: [],
			content: `++(${ startAngle}:${roundTikz(rx)}cm and ${roundTikz(ry)}cm) arc (${startAngle}:${endAngle}:${roundTikz(rx)}cm and ${roundTikz(ry)}cm)`,
		}
		command.additionalNodes.push(arcCommand)
	}

	public requiredTikzLibraries(): string[] {
		return ["arrows.meta"]
	}

	public flip(horizontalAxis: boolean): void {
		super.flip(horizontalAxis)
		this.clockwise = !this.clockwise
		this.update()
	}

	public copyForPlacement(): CircuitComponent {
		return new ArcArrowComponent()
	}

	public updateTheme(): void {
		super.updateTheme()
	}
}
