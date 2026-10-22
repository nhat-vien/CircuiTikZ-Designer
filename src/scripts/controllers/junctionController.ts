import * as SVG from "@svgdotjs/svg.js"
import { MainController, NodeSymbolComponent, SaveController, WireComponent } from "../internal"
import { computeJunctionPoints, junctionDist, JUNCTION_TOL } from "../utils/junctionUtils"

/**
 * Maintains junction dots (`\draw (x,y) node[circ] {}`) automatically wherever
 * wires meet so connections are visible in the compiled output.
 *
 * reconcile() runs before every undo snapshot: dots created/removed here become
 * part of the captured state and are picked up by the document layer's canvas
 * -> code sync automatically. Every dot it creates carries the `autoJunction`
 * flag (persisted) so it can be removed again when the wiring no longer merits
 * it, while manually placed `circ` nodes are never touched. The junction rule
 * itself (degree >= 3 wire segments) lives in utils/junctionUtils.
 */
export class JunctionController {
	public static reconcile(): void {
		const comps = MainController.instance?.circuitComponents
		if (!comps) return
		const wires = comps.filter((c): c is WireComponent => c instanceof WireComponent)
		const junctionPoints = computeJunctionPoints(
			wires.map((w) => w.getWireVertices()).filter((pts) => pts && pts.length >= 2)
		)

		const circNodes = comps.filter(
			(c): c is NodeSymbolComponent => c instanceof NodeSymbolComponent && c.referenceSymbol?.tikzName === "circ"
		)

		const near = (a: SVG.Point, b: SVG.Point) => junctionDist(a, b) <= JUNCTION_TOL

		// remove auto dots whose point no longer merits a junction (manual ones keep)
		for (const node of circNodes) {
			if (!node.position || node.autoJunction !== true) continue
			const atJunction = junctionPoints.some((p) => near(p, node.position))
			if (!atJunction) MainController.instance.removeComponent(node)
		}

		// create dots for junction points that have no circ node yet
		for (const point of junctionPoints) {
			if (circNodes.some((node) => node.position && near(point, node.position))) continue
			try {
				const json = {
					type: "node",
					id: "circ",
					position: point.simplifyForJson(),
					autoJunction: true,
				} as never
				const node = SaveController.fromJson(json) as NodeSymbolComponent | null
				if (node) node.autoJunction = true
			} catch (err) {
				console.error("[CTD-J] node creation failed:", err)
				/* junction automation must never break a placement/undo step */
			}
		}
	}
}
