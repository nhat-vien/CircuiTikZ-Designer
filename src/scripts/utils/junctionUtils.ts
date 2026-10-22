import * as SVG from "@svgdotjs/svg.js"
import { closestPointOnLine } from "./impSVGNumber"

/**
 * Pure wire-topology analysis for automatic junction dots (no controllers/DOM).
 *
 * A junction dot is required at a point when three or more wire segments are
 * incident to it (standard circuitikz convention). Two wires simply continuing
 * into each other (degree 2) need no dot; interior–interior wire crossings are
 * deliberately left undotted (whether they connect is ambiguous by nature).
 * Component pins never count towards the degree.
 */
export const JUNCTION_TOL = 0.5 // canvas px (one minor grid step is 3.79px)

export function junctionDist(a: SVG.Point, b: SVG.Point): number {
	const dx = a.x - b.x
	const dy = a.y - b.y
	return Math.sqrt(dx * dx + dy * dy)
}

/**
 * How many wire segments of one polyline are incident to point p (capped
 * implicitly at two per wire, since a straight-through pass counts as its two
 * halves). Interior vertices count 2, polyline endpoints 1; a foreign wire
 * endpoint landing on a segment interior also counts 2 (T-connection).
 */
export function pointIncidence(pts: SVG.Point[], p: SVG.Point): number {
	for (let i = 0; i < pts.length; i++) {
		if (junctionDist(pts[i], p) <= JUNCTION_TOL) {
			return i === 0 || i === pts.length - 1 ? 1 : 2
		}
	}
	for (let i = 0; i + 1 < pts.length; i++) {
		const a = pts[i]
		const b = pts[i + 1]
		if (junctionDist(p, a) <= JUNCTION_TOL || junctionDist(p, b) <= JUNCTION_TOL) continue
		const [proj, t] = closestPointOnLine(p, a, b)
		if (t <= 0 || t >= 1) continue
		if (junctionDist(proj, p) <= JUNCTION_TOL) return 2
	}
	return 0
}

/**
 * Classifies junction points purely from wire polylines (world px).
 * Candidates are the polyline endpoints; points already returned are merged
 * within the tolerance so coinciding endpoints of several wires yield one dot.
 */
export function computeJunctionPoints(polylines: SVG.Point[][]): SVG.Point[] {
	const endpoints: SVG.Point[] = []
	for (const pts of polylines) {
		endpoints.push(pts[0], pts[pts.length - 1])
	}

	const junctions: SVG.Point[] = []
	for (const p of endpoints) {
		if (junctions.some((q) => junctionDist(p, q) <= JUNCTION_TOL)) continue
		let degree = 0
		for (const pts of polylines) {
			degree += pointIncidence(pts, p)
			if (degree >= 3) break
		}
		if (degree >= 3) junctions.push(p)
	}
	return junctions
}
