import * as SVG from "@svgdotjs/svg.js"
import {
	AbstractConstructor,
	CanvasController,
	defaultStroke,
	generateLabelRender,
	MathJaxProperty,
	PathComponent,
	PathSaveObject,
	PropertyCategories,
	SectionHeaderProperty,
	SliderProperty,
	CircuitikzTo,
	approxCompare,
	interpolate,
	BooleanProperty,
} from "../internal"

export type CurrentLabel = {
	label: string
	dist?: number
	start?: boolean
	below?: boolean
	backwards?: boolean
	shift?: number
	arrowWidth?: number
}

let currentDirectionBackward = false
let currentPositionStart = false
let currentLabelBelow = false

const arrowStrokeWidth = 0.5
const currentArrowScale = 16
const defaultRlen = 1.4
const cmtopx = 4800 / 127 // 96px/2.54

export interface Currentable {
	currentLabel: MathJaxProperty
	currentLabelRendering: SVG.Element
	currentArrowRendering: SVG.Element
	currentRendering: SVG.Element

	currentDistance: SliderProperty
	currentPosition: BooleanProperty
	currentDirection: BooleanProperty
	currentLabelPosition: BooleanProperty
	currentShift: SliderProperty
	currentArrowWidth: SliderProperty
	currentShow: BooleanProperty
}

export function Currentable<TBase extends AbstractConstructor<PathComponent>>(Base: TBase) {
	abstract class Currentable extends Base {
		protected currentLabel: MathJaxProperty
		protected currentLabelRendering: SVG.Element
		protected currentArrowRendering: SVG.Element
		protected currentRendering: SVG.Element

		protected currentDistance: SliderProperty
		protected currentPosition: BooleanProperty
		protected currentDirection: BooleanProperty
		protected currentLabelPosition: BooleanProperty
		protected currentShift: SliderProperty
		protected currentArrowWidth: SliderProperty
		protected currentShow: BooleanProperty

		constructor(...args: any[]) {
			super(...args)
			this.properties.add(
				PropertyCategories.current,
				new SectionHeaderProperty("Current label", undefined, "current:header")
			)

			this.currentLabel = new MathJaxProperty(undefined, undefined, "current:label")

			this.currentShow = new BooleanProperty("Show current", false, undefined, "current:show")
			this.currentShow.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentShow)

			this.currentLabel.addChangeListener((ev) => this.generateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentLabel)

			this.currentDirection = new BooleanProperty(
				"Backwards",
				currentDirectionBackward,
				undefined,
				"current:backwards"
			)
			this.currentDirection.addChangeListener((ev) => {
				this.updateCurrentRender()
			})
			this.properties.add(PropertyCategories.current, this.currentDirection)

			this.currentLabelPosition = new BooleanProperty(
				"Label below",
				currentLabelBelow,
				undefined,
				"current:below"
			)
			this.currentLabelPosition.addChangeListener((ev) => {
				this.updateCurrentRender()
			})
			this.properties.add(PropertyCategories.current, this.currentLabelPosition)

			this.currentPosition = new BooleanProperty("At start", currentPositionStart, undefined, "current:start")
			this.currentPosition.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentPosition)

			this.currentDistance = new SliderProperty(
				"Distance",
				0,
				1,
				0.1,
				new SVG.Number(0.5, ""),
				true,
				"How far along the line the current arrow is.",
				"current:distance"
			)
			this.currentDistance.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentDistance)

			this.currentShift = new SliderProperty(
				"Shift",
				-2,
				2,
				0.1,
				new SVG.Number(0, ""),
				false,
				"How much the current arrow should shift perpendicular to the component",
				"current:shift"
			)
			this.currentShift.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentShift)

			this.currentArrowWidth = new SliderProperty(
				"Current width",
				0.5,
				20,
				0.5,
				new SVG.Number(10, ""),
				false,
				"Width of the current arrow shaft in pixels",
				"current:arrowwidth"
			)
			this.currentArrowWidth.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentArrowWidth)
		}

		protected generateCurrentRender(): void {
			this.currentLabelRendering = generateLabelRender(this.currentLabelRendering, this.currentLabel)
			this.currentLabelRendering.fill(defaultStroke)

			this.currentRendering = new SVG.G()
			this.currentRendering.add(this.currentLabelRendering)
			this.visualization.add(this.currentRendering)
			this.update()
			this.updateTheme()
		}

		protected abstract updateCurrentRender(): void

		protected generateCurrentArrow(
			start: SVG.Point,
			end: SVG.Point,
			northwestDelta: SVG.Point,
			southeastDelta: SVG.Point,
			scale: SVG.Point
		): { arrow: SVG.Element; labelPos: SVG.Point; labelAnchorDir: SVG.Point } {
			const group = new SVG.G()

			const scaleFactor = Math.abs(scale.x)

			let distance = this.currentDistance.value.value
			let shift = this.currentShift.value.value

			let directionBackwards = this.currentDirection.value
			let positionStart = this.currentPosition.value
			let labelPositionBelow = this.currentLabelPosition.value

			let labelBelow = labelPositionBelow ? -1 : 1

			let diff = end.sub(start)
			let angle = Math.atan2(diff.y, diff.x)
			let endTrans = end.rotate(angle, start, true)

			// in which direction the the anchor of the current label should point
			const sin4 = 0.06976 // the sin of 4 degrees
			let labelAnchor = new SVG.Point(
				approxCompare(Math.sin(angle), 0, sin4),
				-approxCompare(Math.cos(angle), 0, sin4)
			).mul(-labelBelow)

			const midTrans = start.add(endTrans).div(2)
			const compStart = midTrans.add(new SVG.Point(northwestDelta.x * scaleFactor, 0))
			const compEnd = midTrans.add(new SVG.Point(southeastDelta.x * scaleFactor, 0))

			const arrowScale = (cmtopx * defaultRlen) / (currentArrowScale / scaleFactor) + 2 * arrowStrokeWidth

			const arrowPositionTrans =
				positionStart ? interpolate(start, compStart, distance) : interpolate(compEnd, endTrans, distance)

			// Apply shift perpendicular to the component
			const shiftOffset = new SVG.Point(0, shift * cmtopx)
			const arrowPos = arrowPositionTrans.add(shiftOffset).rotate(-angle, start, true)

			const labelOffset = new SVG.Point(0, -labelBelow * 0.12 * cmtopx)
			let labPos: SVG.Point = arrowPos.add(labelOffset.rotate(-angle, undefined, true))

			// Draw the arrow line (shaft)
			const arrowLength = 15 // Length of the arrow shaft in pixels
			const arrowAngle = angle + (directionBackwards ? Math.PI : 0)

			// Calculate line start and end positions along the component direction
			const lineStart = arrowPos.add(new SVG.Point(-arrowLength / 2, 0).rotate(angle, undefined, true))
			const lineEnd = arrowPos.add(new SVG.Point(arrowLength / 2, 0).rotate(angle, undefined, true))

			// Create the arrow line using Path (more reliable than Line)
			const pathData = `M ${lineStart.x} ${lineStart.y} L ${lineEnd.x} ${lineEnd.y}`
			const arrowLine = new SVG.Path({ d: pathData })
			arrowLine.fill("none").stroke({ color: defaultStroke, width: this.currentArrowWidth.value.value })

			// Draw the arrow tip
			const arrowTip = CanvasController.instance.canvas.use("currarrow").fill(defaultStroke)
			const arrowTipTransform = new SVG.Matrix({
				translate: [-0.85, -0.8],
			}).lmultiply({
				scale: arrowScale,
				rotate: (180 * arrowAngle) / Math.PI,
				translate: arrowPos,
			})
			arrowTip.transform(arrowTipTransform)

			// Add to group in correct order
			group.add(arrowLine)
			group.add(arrowTip)

			return {
				arrow: group,
				labelPos: labPos,
				labelAnchorDir: labelAnchor,
			}
		}

		public toJson(): PathSaveObject {
			const data = super.toJson() as PathSaveObject & { current?: CurrentLabel }

			if (this.currentLabel.value != "") {
				const currentLabel: CurrentLabel = { label: this.currentLabel.value }
				currentLabel.dist =
					this.currentDistance.value.value != 0.5 ? this.currentDistance.value.value : undefined
				currentLabel.backwards = this.currentDirection.value ? true : undefined
				currentLabel.start = this.currentPosition.value ? true : undefined
				currentLabel.below = this.currentLabelPosition.value ? true : undefined
				currentLabel.shift = this.currentShift.value.value != 0 ? this.currentShift.value.value : undefined
				currentLabel.arrowWidth =
					this.currentArrowWidth.value.value != 10 ? this.currentArrowWidth.value.value : undefined
				data.current = currentLabel
			}

			return data
		}

		protected applyJson(saveObject: PathSaveObject & { current?: CurrentLabel }): void {
			super.applyJson(saveObject)

			if (saveObject.current) {
				this.currentLabel.value = saveObject.current.label
				if (saveObject.current.dist) {
					this.currentDistance.value = new SVG.Number(saveObject.current.dist, "")
				}
				if (saveObject.current.backwards) {
					this.currentDirection.value = true
				}
				if (saveObject.current.start) {
					this.currentPosition.value = true
				}
				if (saveObject.current.below) {
					this.currentLabelPosition.value = true
				}
				if (saveObject.current.shift !== undefined) {
					this.currentShift.value = new SVG.Number(saveObject.current.shift, "")
				}
				if (saveObject.current.arrowWidth !== undefined) {
					this.currentArrowWidth.value = new SVG.Number(saveObject.current.arrowWidth, "")
				}
				this.generateCurrentRender()
			}
		}

		protected buildTikzCurrent(to: CircuitikzTo): void {
			// Only export current if show property is enabled
			if (this.currentShow.value && this.currentLabel.value != "") {
				const options = to.options

				let currentString = "i"
				let labelPosString = this.currentLabelPosition.value ? "_" : "^"
				let dirString = this.currentDirection.value ? "<" : ">"

				if (this.currentPosition.value) {
					// if position is start, the label position comes after the direction and both are required, exept:
					if (this.currentLabelPosition.value == false && this.currentDirection.value == true) {
						// if direction is backward and the label position is default above, the label position is not required
						labelPosString = ""
					}
					currentString += dirString + labelPosString
				} else {
					// if position is end, the label position comes before the direction
					if (this.currentDirection.value == false) {
						// if direction is forward the label position is not required
						dirString = ""
						if (this.currentLabelPosition.value == false) {
							// if the label position is default above and the direction is forward, the label position is also not required
							labelPosString = ""
						}
					}
					currentString += labelPosString + dirString
				}

				currentString += "={$" + this.currentLabel.value + "$}"
				options.push(currentString)

				if (this.currentDistance.value.value != 0.5) {
					options.push("current/distance=" + this.currentDistance.value.value.toString())
				}
				// Note: CircuiTikZ does not support current/label/shift parameter
				// The shift feature is only for visual display in the designer
			}
		}
	}
	return Currentable
}
