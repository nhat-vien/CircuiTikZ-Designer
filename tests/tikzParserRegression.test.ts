import { describe, expect, it } from "vitest"
import { TikzParser } from "../src/scripts/utils/tikzParser"

describe("TikzParser regression: ctikzset merged statements", () => {
	it("parses a statement merged behind a \\ctikzset line (exporter output round-trip)", () => {
		const code = [
			"\\begin{circuitikz}[transform shape]",
			"\t\\ctikzset{bipoles/length=1.4cm}",
			"\t% Component nodes:",
			"\t\\draw (0,0) node[circ] {} -- (1,1);",
			"\t% Paths, bipoles and wires:",
			"\t\\draw (0,0) to[R] (1,0);",
			"\\end{circuitikz}",
		].join("\n")
		const result = TikzParser.parse(code)
		expect(result.components.length).toBeGreaterThanOrEqual(2)
	})
})
