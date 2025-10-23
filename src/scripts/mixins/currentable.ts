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
	thickness?: number
	shift?: number
}

let currentDirectionBackward = false
let currentPositionStart = false
let currentLabelBelow = false

const arrowStrokeWidth = 1.5  // Increased from 0.5 for better visibility
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
	currentArrowThickness: SliderProperty
	currentArrowShift: SliderProperty
	currentLabelDistance: SliderProperty
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
		protected currentArrowThickness: SliderProperty
		protected currentArrowShift: SliderProperty
		protected currentLabelDistance: SliderProperty

		constructor(...args: any[]) {
			super(...args)
			this.properties.add(
				PropertyCategories.current,
				new SectionHeaderProperty("Current label", undefined, "current:header")
			)

			this.currentLabel = new MathJaxProperty(undefined, undefined, "current:label")
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

			this.currentArrowThickness = new SliderProperty(
				"Arrow thickness",
				0.1,
				3.0,
				0.1,
				new SVG.Number(0.5, ""),
				false,
				"Thickness of the current arrow.",
				"current:thickness"
			)
			this.currentArrowThickness.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentArrowThickness)

			this.currentArrowShift = new SliderProperty(
				"Arrow shift",
				-1.0,
				1.0,
				0.05,
				new SVG.Number(0, ""),
				false,
				"Shift the current arrow position along the component.",
				"current:shift"
			)
			this.currentArrowShift.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentArrowShift)

			this.currentLabelDistance = new SliderProperty(
				"Label distance",
				-1.0,
				1.0,
				0.05,
				new SVG.Number(0.12, ""),
				false,
				"Distance between the current arrow and its label (negative values move label closer to component).",
				"current:labeldistance"
			)
			this.currentLabelDistance.addChangeListener((ev) => this.updateCurrentRender())
			this.properties.add(PropertyCategories.current, this.currentLabelDistance)
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
			let arrowThickness = this.currentArrowThickness.value.value
			let arrowShift = this.currentArrowShift.value.value
			let labelDistance = this.currentLabelDistance.value.value

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

			// Apply arrow thickness to the scale calculation
			const arrowScale = ((cmtopx * defaultRlen) / (currentArrowScale / scaleFactor) + 2 * arrowStrokeWidth) * arrowThickness

			// Calculate base arrow position along the component
			const baseArrowPositionTrans =
				positionStart ? interpolate(start, compStart, distance) : interpolate(compEnd, endTrans, distance)

			// Arrow shift should move perpendicular to the component (like voltage arrows)
			// In transformed space, perpendicular is the Y direction
			const shiftAmount = arrowShift * cmtopx * defaultRlen * scaleFactor

			// Calculate line: it should be a small horizontal line (parallel to component) at the shifted position
			// Line length is a small fraction of the component length
			const lineLength = 0.25 * cmtopx * defaultRlen * scaleFactor
			const lineFromTrans = baseArrowPositionTrans.add(new SVG.Point(-lineLength / 2, shiftAmount))
			const lineToTrans = baseArrowPositionTrans.add(new SVG.Point(lineLength / 2, shiftAmount))

			// Arrow position is at the end of the line (in the direction of current)
			const arrowPositionTrans = directionBackwards ? lineFromTrans : lineToTrans
			const arrowPos = arrowPositionTrans.rotate(-angle, start, true)

			// Rotate line points back to world space
			const lineFrom = lineFromTrans.rotate(-angle, start, true)
			const lineTo = lineToTrans.rotate(-angle, start, true)

			// Use the slider value for label distance
			// Label should be positioned perpendicular to the component line (in transformed space)
			// In transformed space, perpendicular is the Y direction
			const labelOffsetTrans = new SVG.Point(0, -labelBelow * labelDistance * cmtopx)
			const labelPosTrans = arrowPositionTrans.add(labelOffsetTrans)
			let labPos: SVG.Point = labelPosTrans.rotate(-angle, start, true)

			// Draw the line parallel to component at the shifted position
			const lineStrokeWidth = arrowStrokeWidth * arrowThickness
			console.log("=== Line Stroke Debug ===", {
				arrowStrokeWidth,
				arrowThickness,
				lineStrokeWidth,
				lineFrom: { x: lineFrom.x, y: lineFrom.y },
				lineTo: { x: lineTo.x, y: lineTo.y }
			})
			const d = `M${lineFrom.toSVGPathString()}L${lineTo.toSVGPathString()}`
			const path = new SVG.Path()
			path.plot(d)
			// Apply arrow thickness to the line stroke width
			path.fill("none")
			path.stroke({ color: defaultStroke, width: lineStrokeWidth, linecap: "round", linejoin: "round" })
			group.add(path)

			const arrowTip = CanvasController.instance.canvas.use("currarrow").fill(defaultStroke)
			const arrowAngle = angle + (directionBackwards ? Math.PI : 0)
			const arrowTipTransform = new SVG.Matrix({
				translate: [-0.85, -0.8],
			}).lmultiply({
				scale: arrowScale,
				rotate: (180 * arrowAngle) / Math.PI,
				translate: arrowPos,
			})

			arrowTip.transform(arrowTipTransform)
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
				currentLabel.thickness =
					this.currentArrowThickness.value.value != 1.0 ? this.currentArrowThickness.value.value : undefined
				currentLabel.shift =
					this.currentArrowShift.value.value != 0 ? this.currentArrowShift.value.value : undefined
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
				if (saveObject.current.thickness) {
					this.currentArrowThickness.value = new SVG.Number(saveObject.current.thickness, "")
				}
				if (saveObject.current.shift) {
					this.currentArrowShift.value = new SVG.Number(saveObject.current.shift, "")
				}
				this.generateCurrentRender()
			}
		}

		protected buildTikzCurrent(to: CircuitikzTo): void {
			if (this.currentLabel.value != "") {
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

				currentString += "=$" + this.currentLabel.value + "$"
				options.push(currentString)

				if (this.currentDistance.value.value != 0.5) {
					options.push("current/distance=" + this.currentDistance.value.value.toString())
				}

				// Convert thickness to CircuiTikZ's current arrow scale
				// CircuiTikZ uses inverse scale: higher number = smaller arrow
				// Our thickness: 1.0 = default, >1.0 = thicker, <1.0 = thinner
				// CircuiTikZ scale: 16 = default, <16 = larger, >16 = smaller
				if (this.currentArrowThickness.value.value != 1.0) {
					const circuitikzScale = 16 / this.currentArrowThickness.value.value
					options.push("current arrow scale=" + circuitikzScale.toFixed(2))
				}

				// Note: CircuiTikZ does not support arrow shift natively
				// The shift is only applied in the visual editor, not in TikZ export
				// If shift != 0, we adjust the distance to approximate the effect
				if (this.currentArrowShift.value.value != 0) {
					// Shift affects the position along the wire
					// We can approximate this by adjusting the distance
					const adjustedDistance = this.currentDistance.value.value + this.currentArrowShift.value.value * 0.1
					// Clamp between 0 and 1
					const clampedDistance = Math.max(0, Math.min(1, adjustedDistance))
					if (clampedDistance != 0.5) {
						// Update the distance option if it was already added
						const distIndex = options.findIndex(opt => opt.startsWith("current/distance="))
						if (distIndex >= 0) {
							options[distIndex] = "current/distance=" + clampedDistance.toFixed(2)
						} else {
							options.push("current/distance=" + clampedDistance.toFixed(2))
						}
					}
				}
			}
		}
	}
	return Currentable
}
