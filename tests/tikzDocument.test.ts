import { describe, expect, it } from "vitest"
import {
	assembleBody,
	classifySpans,
	defaultPreamble,
	newEntryId,
	normalizeStatement,
	splitFullSource,
	splitStatementSpans,
} from "../src/scripts/utils/tikzDocument"
import { TikzParser } from "../src/scripts/utils/tikzParser"

describe("splitFullSource", () => {
	it("splits preamble and body of a full document", () => {
		const source = [
			"% my preamble",
			"\\documentclass{article}",
			"",
			"\\begin{circuitikz}",
			"\t\\draw (0,0) -- (1,0);",
			"\\end{circuitikz}",
		].join("\n")

		const { preamble, body } = splitFullSource(source)
		expect(preamble).toContain("\\documentclass{article}")
		expect(body).toContain("\\draw (0,0) -- (1,0);")
		expect(body).not.toContain("documentclass")
	})

	it("treats bare code without environment as pure body", () => {
		const { preamble, body } = splitFullSource("\\draw (0,0) to[R] (1,0);")
		expect(preamble).toBe("")
		expect(body.trim()).toBe("\\draw (0,0) to[R] (1,0);")
	})
})

describe("splitStatementSpans", () => {
	it("finds single-line statements with correct spans", () => {
		const body = ["", "\t\\ctikzset{bipoles/length=1.4cm};", "\t\\draw (0,0) -- (1,0);", ""].join("\n")
		const spans = splitStatementSpans(body)
		expect(spans.length).toBe(2)
		// leading blank lines are absorbed as prefix lines of the first statement
		expect(spans[0].startLine).toBe(0)
		expect(spans[0].prefixLines).toEqual([""])
		expect(spans[0].stripped).toContain("\\ctikzset")
		expect(spans[1].startLine).toBe(2)
	})

	it("merges statements without semicolon into the following one (parser parity)", () => {
		const body = "\\ctikzset{bipoles/length=1.4cm}\n\\draw (0,0) -- (1,0);"
		const spans = splitStatementSpans(body)
		expect(spans.length).toBe(1)
		expect(spans[0].startLine).toBe(0)
		expect(spans[0].stripped).toContain("\\ctikzset")
		expect(spans[0].stripped).toContain("\\draw")
	})

	it("keeps comments in raw but strips them from stripped", () => {
		const body = "\\draw (0,0) -- (1,0); % bottom rail\n% a lonely comment line\n"
		const spans = splitStatementSpans(body)
		expect(spans.length).toBe(1)
		expect(spans[0].raw).toContain("% bottom rail")
		expect(spans[0].stripped).toBe("\\draw (0,0) -- (1,0);")
	})

	it("handles multi-line statements", () => {
		const body = "\\draw\n (0,0)\n -- (1,1);"
		const spans = splitStatementSpans(body)
		expect(spans.length).toBe(1)
		expect(spans[0].startLine).toBe(0)
		expect(spans[0].lineCount).toBe(3)
	})

	it("handles several statements on one line", () => {
		const spans = splitStatementSpans("\\draw (0,0); \\node at (1,1) {x};")
		expect(spans.length).toBe(2)
		expect(spans[0].stripped).toBe("\\draw (0,0);")
		expect(spans[1].stripped).toBe("\\node at (1,1) {x};")
	})

	it("does not split inside braces", () => {
		const spans = splitStatementSpans("\\node at (0,0) {a;b};")
		expect(spans.length).toBe(1)
	})

	it("does not split inside math with $", () => {
		// braces защит inside math mode must be balanced
		const spans = splitStatementSpans("\\node at (0,0) {l=$V_{1}$ value};")
		expect(spans.length).toBe(1)
		expect(spans[0].stripped).toContain("l=$V_{1}$ value")
	})

	it("counts multiple statements per line with lineCount", () => {
		const spans = splitStatementSpans("\\draw (0,0); \\draw (1,0);")
		expect(spans[0].startLine).toBe(0)
		expect(spans[0].lineCount).toBe(1)
		expect(spans[1].lineCount).toBe(1)
	})

	it("keeps trailing statement without semicolon", () => {
		const spans = splitStatementSpans("\\draw (0,0) -- (1,0);\n\\draw (2,0) -- (3,0)")
		expect(spans.length).toBe(2)
		expect(spans[1].stripped).toBe("\\draw (2,0) -- (3,0)")
	})
})

describe("assembleBody", () => {
	it("indents code entries and keeps free lines verbatim", () => {
		const idA = newEntryId()
		const idFree = newEntryId()
		const idC = newEntryId()
		const body = assembleBody(
			[
				{ id: idA, kind: "code" },
				{ id: idFree, kind: "free", lines: ["\\coordinate (A) at (0,0); % mine"] },
				{ id: idC, kind: "code" },
			],
			{
				resolveCodeEntry: (e) => (e.id === idA ? ["\\draw (0,0) -- (1,0);"] : ["\\draw (2,0) -- (3,0);"]),
			}
		)
		const lines = body.split("\n")
		expect(lines[0]).toBe("\t\\draw (0,0) -- (1,0);")
		expect(lines).toContain("\\coordinate (A) at (0,0); % mine")
		expect(body).toContain("\t\\draw (2,0) -- (3,0);")
	})

	it("drops code entries that resolve to nothing", () => {
		const idA = newEntryId()
		const idB = newEntryId()
		const body = assembleBody(
			[
				{ id: idA, kind: "code" },
				{ id: idB, kind: "code" },
			],
			{ resolveCodeEntry: (e) => (e.id === idB ? ["\\draw (1,1) -- (2,1);"] : []) }
		)
		expect(body).toBe("\t\\draw (1,1) -- (2,1);")
	})
})

describe("normalizeStatement", () => {
	it("collapses whitespace and removes comments", () => {
		expect(normalizeStatement("\\draw  (0,0) -- (1,0); % x")).toBe("\\draw (0,0) -- (1,0);")
	})
})

describe("defaultPreamble", () => {
	it("contains documentclass and circuitikz", () => {
		const p = defaultPreamble()
		expect(p).toContain("\\documentclass")
		expect(p).toContain("circuitikz")
	})
})

describe("splitStatementSpans prefix conservation", () => {
	it("attaches standalone comment lines above a statement as prefixLines", () => {
		const body = ["% my custom header comment", "", "\t\\draw (0,0) -- (1,0);"].join("\n")
		const spans = splitStatementSpans(body)
		expect(spans.length).toBe(1)
		expect(spans[0].prefixLines).toEqual(["% my custom header comment", ""])
		expect(spans[0].raw).toContain("% my custom header comment")
	})

	it("does not steal the previous statement or the environment header", () => {
		const body = [
			"\\begin{circuitikz}",
			"\t\\draw (0,0) -- (1,0);",
			"% between",
			"x; % not a line comment",
		].join("\n")
		const spans = splitStatementSpans(body)
		// env header is skipped entirely, first statement has no prefix
		expect(spans[0].prefixLines).toEqual([])
		// the following span absorbs only contiguous comment lines
		expect(spans[1].prefixLines).toEqual(["% between"])
	})
})

describe("classifySpans", () => {
	const g = (key: string, indices: number[]) => ({ key, indices })

	it("pairs spans with owner groups and preserves document order", () => {
		const body = "\\draw (0,0) -- (1,0);\n% note\n\\draw (2,0) -- (3,0);\n\\coordinate (A) at (9,9);"
		const spans = splitStatementSpans(body)
		const groups = [g("\\draw (0,0) -- (1,0)", [0]), g("\\draw (2,0) -- (3,0)", [1]), g("\\coordinate (A) at (9,9)", [])]
		const result = classifySpans(spans, groups)
		expect(result).toEqual([[0], [1], []])
	})

	it("keeps compound statements and their components together", () => {
		const body = "\\draw (0,0) to[R] (1,0) to[C] (2,0);\n\\draw (5,0) -- (6,0);"
		const spans = splitStatementSpans(body)
		const groups = [g("\\draw (0,0) to[R] (1,0) to[C] (2,0)", [0, 1, 2]), g("\\draw (5,0) -- (6,0)", [3])]
		const result = classifySpans(spans, groups)
		expect(result).toEqual([[0, 1, 2], [3]])
	})

	it("pairs duplicated identical statements one by one, in document order", () => {
		const spans = splitStatementSpans("\\draw (0,0) -- (1,0);\n\\draw (0,0) -- (1,0);\n% following statement\n\\draw (4,0) -- (5,0);")
		const groups = [g("\\draw (0,0) -- (1,0)", [0]), g("\\draw (0,0) -- (1,0)", [1]), g("\\draw (4,0) -- (5,0)", [2])]
		const result = classifySpans(spans, groups)
		expect(result).toEqual([[0], [1], [2]])
	})

	it("matches groups regardless of whitespace/comment differences", () => {
		const spans = splitStatementSpans("\\draw\t(0,0) -- (1,0); % tube")
		const result = classifySpans(spans, [g("\\draw (0,0) -- (1,0)", [0])])
		expect(result).toEqual([[0]])
	})

	it("recovers quarantine-style when alignment drifts (key-guarded cursor)", () => {
		const spans = splitStatementSpans("\\coordinate (A) at (9,9);\n\\draw (0,0) -- (1,0);")
		// parser produced NO group for the coordinate line; the next span still pairs
		const result = classifySpans(spans, [g("\\draw (0,0) -- (1,0)", [0])])
		expect(result).toEqual([[], [0]])
	})
})

describe("TikzParser ownership groups", () => {
	it("groups parsed save objects per statement, in statement order", () => {
		const code = [
			"\\begin{circuitikz}",
			"\t\\ctikzset{bipoles/length=1.4cm}",
			"\t% Component nodes:",
			"\t\\draw (0,0) node[circ] {} -- (1,1);",
			"% Paths, bipoles and wires:",
			"\t\\draw (0,0) to[R] (1,0);",
			"\\coordinate (X) at (7,7);",
			"\\end{circuitikz}",
		].join("\n")
		const result = TikzParser.parse(code) as unknown as {
			components: unknown[]
			ownerGroups?: Array<{ key: string; indices: number[] }>
		}
		const groups = result.ownerGroups!
		expect(groups.length).toBe(3)
		expect(groups[0].key).toContain("node[circ]")
		expect(groups[0].indices.length).toBeGreaterThan(0)
		expect(groups[1].indices.length).toBeGreaterThan(0)
		// \coordinate produced no save objects but still consumed its position
		expect(groups[2].key).toContain("\\coordinate")
		expect(groups[2].indices).toEqual([])

		// a compound statement keeps all of its save objects in one group
		const compound = TikzParser.parse("\\draw (0,0) to[R] (1,0) to[C] (2,0);") as unknown as {
			components: unknown[]
			ownerGroups?: Array<{ key: string; indices: number[] }>
		}
		expect(compound.ownerGroups!.length).toBe(1)
		expect(compound.ownerGroups![0].indices.length).toBe(compound.components.length)
	})
})

describe("document layer DoD scenarios (pure)", () => {
	const CANON = (s: string) => normalizeStatement(s).replace(/;+\s*$/, "").trim()

	it("comments and \\coordinate survive 12 re-derivation cycles with canvas growth", () => {
		// Simulates the applyFullSource → assembleBody cycle: the document layer is
		// re-derived from the (canvas-mutated) body after every canvas operation.
		let body = [
			"% intro remark",
			"\\coordinate (A) at (3,3); % user anchor",
			"\\draw (0,0) -- (1,0);",
			"% mid remark",
			"\\draw (1,0) -- (2,0);",
			"\\draw (2,0) -- (3,0);",
		].join("\n")

		for (let op = 1; op <= 12; op++) {
			// canvas op: a new wire component appears, its statement is appended
			body += `\n\\draw (${op},5) -- (${op + 1},5);`

			// --- start of DocumentController.applyFullSource equivalent ---
			const spans = splitStatementSpans(body)
			const groups: Array<{ key: string; indices: number[] }> = []
			let nextIdx = 0
			for (const span of spans) {
				// the parser creates components only for recognized statements
				if (/^(\\draw|\\path)/.test(CANON(span.stripped)) && !span.stripped.includes("\\coordinate")) {
					groups.push({ key: span.stripped, indices: [nextIdx++] })
				} else {
					groups.push({ key: span.stripped, indices: [] })
				}
			}
			const classification = classifySpans(spans, groups)

			// --- start of assembleBody equivalent ---
			const rebuiltLines: string[] = []
			spans.forEach((span, i) => {
				if (classification[i].length > 0) {
					rebuiltLines.push(...span.prefixLines)
					rebuiltLines.push("\t" + CANON(span.stripped) + ";")
				} else {
					rebuiltLines.push(span.raw)
				}
			})
			body = rebuiltLines.join("\n")
			// --- end of cycle ---
		}

		expect(body).toContain("\\coordinate (A) at (3,3); % user anchor")
		expect(body).toContain("% intro remark")
		expect(body).toContain("% mid remark")
		// document order: coordinate first, wires next, remark between wire1 and wire2
		const coords = body.indexOf("\\coordinate (A)")
		const wire1 = body.indexOf("(0,0) -- (1,0)")
		const remark = body.indexOf("% mid remark")
		const wire2 = body.indexOf("(1,0) -- (2,0)")
		expect([coords, wire1, remark, wire2].every((v) => v >= 0)).toBe(true)
		expect(coords).toBeLessThan(wire1)
		expect(wire1).toBeLessThan(remark)
		expect(remark).toBeLessThan(wire2)
	})
})
