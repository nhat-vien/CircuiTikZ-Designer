import { describe, expect, it } from "vitest"
import {
	assembleBody,
	defaultPreamble,
	newEntryId,
	normalizeStatement,
	splitFullSource,
	splitStatementSpans,
} from "../src/scripts/utils/tikzDocument"

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
		expect(spans[0].startLine).toBe(1)
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
