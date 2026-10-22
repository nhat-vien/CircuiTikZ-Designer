import { describe, expect, it } from "vitest"
import * as SVG from "@svgdotjs/svg.js"
import { computeJunctionPoints, JUNCTION_TOL, pointIncidence } from "../src/scripts/utils/junctionUtils"

const P = (x: number, y: number) => new SVG.Point(x, y)

describe("pointIncidence", () => {
	const horizontal = [P(0, 0), P(10, 0)]

	it("counts a polyline endpoint as 1", () => {
		expect(pointIncidence(horizontal, P(0, 0))).toBe(1)
		expect(pointIncidence(horizontal, P(10, 0))).toBe(1)
	})

	it("counts a shared interior vertex as 2", () => {
		const poly = [P(0, 0), P(5, 0), P(5, 5)]
		expect(pointIncidence(poly, P(5, 0))).toBe(2)
	})

	it("counts a T-onto-segment-interior as 2", () => {
		expect(pointIncidence(horizontal, P(5, 0.3))).toBe(2)
		expect(pointIncidence(horizontal, P(5, -0.3))).toBe(2)
	})

	it("gives 0 for far points and for interior interior crossings away from vertices", () => {
		expect(pointIncidence(horizontal, P(50, 50))).toBe(0)
	})
})

describe("computeJunctionPoints", () => {
	it("no dot when two wires continue into each other (degree 2)", () => {
		const points = computeJunctionPoints([[P(0, 0), P(5, 0)], [P(5, 0), P(10, 0)]])
		expect(points).toEqual([])
	})

	it("dots when three wires end at the same point", () => {
		const points = computeJunctionPoints([[P(0, 0), P(5, 0)], [P(5, 0), P(10, 0)], [P(5, 5), P(5, 0)]])
		expect(points.length).toBe(1)
		expect(Math.abs(points[0].x - 5)).toBeLessThanOrEqual(JUNCTION_TOL)
		expect(Math.abs(points[0].y - 0)).toBeLessThanOrEqual(JUNCTION_TOL)
	})

	it("dots at a T-junction (wire ending on another wire's interior)", () => {
		const points = computeJunctionPoints([[P(0, 0), P(10, 0)], [P(5, 5), P(5, 0)]])
		expect(points.length).toBe(1)
		expect(Math.abs(points[0].x - 5)).toBeLessThanOrEqual(JUNCTION_TOL)
		expect(Math.abs(points[0].y - 0)).toBeLessThanOrEqual(JUNCTION_TOL)
	})

	it("does not dot interior interior X crossings", () => {
		const points = computeJunctionPoints([[P(0, 5), P(10, 5)], [P(5, 0), P(5, 10)]])
		expect(points).toEqual([])
	})

	it("merges several endpoints near the same junction into one dot", () => {
		const points = computeJunctionPoints([
			[P(0, 0), P(5, 0.2)],
			[P(5, 0), P(10, 0)],
			[P(5.1, 5), P(5.1, 0.1)],
		])
		expect(points.length).toBe(1)
	})

	it("no false positive for a single wire", () => {
		expect(computeJunctionPoints([[P(0, 0), P(1, 0), P(2, 0), P(2, 2)]])).toEqual([])
	})

	it("tolerates float noise from snapping/moves", () => {
		const points = computeJunctionPoints([[P(0, 0), P(5, 0)], [P(5, 0), P(10, 0)], [P(5.05 - JUNCTION_TOL, 5), P(5.05 - JUNCTION_TOL, 0.05)]])
		expect(points.length).toBe(1)
	})
})
