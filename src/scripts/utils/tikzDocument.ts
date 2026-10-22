/**
 * TikzDocument — pure document model for the editable LaTeX document layer.
 *
 * The document is a list of entries:
 *  - "code" entries: statements regenerated from the canvas components that are attached
 *    to that entry (the component -> entry attachment lives in DocumentController).
 *  - "free" entries: raw user-owned text lines (comments, \coordinate, unrecognized
 *    statements) that must survive every canvas operation untouched.
 *
 * This module is deliberately free of DOM / canvas / component dependencies so it can
 * be unit tested in isolation with vitest.
 */

export interface CodeEntry {
	id: string
	kind: "code"
	/** Optional label, not part of the emitted code. */
	label?: string
}

export interface FreeEntry {
	id: string
	kind: "free"
	/** Raw lines, kept verbatim including comments and indentation. */
	lines: string[]
}

export type DocEntry = CodeEntry | FreeEntry

let idCounter = 0
export function newEntryId(): string {
	idCounter++
	return `doc-e${idCounter}`
}

/* ------------------------------------------------------------------ */
/* Preamble                                                            */
/* ------------------------------------------------------------------ */

export function defaultPreamble(): string {
	return [
		"% Editable preamble for the CircuiTikZ-Designer export",
		"\\documentclass[border=5pt]{standalone}",
		"\\usepackage{tikz}",
		"\\usepackage[siunitx, RPvoltages]{circuitikz}",
	].join("\n")
}

/**
 * Splits a full LaTeX source into preamble (before the first tikzpicture/circuitikz
 * environment) and the body (all statements between begin/end). Everything before the
 * first \begin{...} is preamble; the statement lines keep their raw form.
 */
export function splitFullSource(source: string): { preamble: string; body: string } {
	const lines = (source ?? "").replace(/\r\n/g, "\n").split("\n")

	let firstEnvLine = -1
	let lastEnvLine = -1
	for (let i = 0; i < lines.length; i++) {
		if (/^\s*\\begin\s*\{(tikzpicture|circuitikz)\}/i.test(lines[i])) {
			firstEnvLine = i
			break
		}
	}
	if (firstEnvLine === -1) {
		// No environment wrapper: everything is treated as body statements.
		return { preamble: "", body: source ?? "" }
	}
	for (let i = lines.length - 1; i >= 0; i--) {
		if (/^\s*\\end\s*\{(tikzpicture|circuitikz)\}/i.test(lines[i])) {
			lastEnvLine = i
			break
		}
	}
	const bodyEnd = lastEnvLine === -1 ? lines.length : lastEnvLine
	const preamble = lines
		.slice(0, firstEnvLine)
		.join("\n")
		// drop a trailing \usetikzlibrary that belongs to the env header, if the
		// document came without preamble at all
		.replace(/^\s*\\usetikzlibrary\{[^}]*\}\s*$/gm, "")
		.trim()
	const body = lines.slice(firstEnvLine + 1, bodyEnd).join("\n")
	return { preamble, body }
}

/* ------------------------------------------------------------------ */
/* Statement scanning (raw body -> statement spans)                    */
/* ------------------------------------------------------------------ */

export interface StatementSpan {
	/** 0-based start line of the statement inside the body. */
	startLine: number
	/** Number of lines the statement spans. */
	lineCount: number
	/** Raw text of the statement lines (comments included). */
	raw: string
	/** Text with line comments stripped and whitespace collapsed — for matching/parsing. */
	stripped: string
}

/**
 * Splits a raw body into statement spans, mirroring TikzParser.splitStatements
 * semantics exactly: environment wrappers and \usetikzlibrary lines are skipped,
 * comments (% not escaped) are ignored while scanning but preserved in `raw`,
 * statements end at `;` outside any {} / [] group.
 */
export function splitStatementSpans(body: string): StatementSpan[] {
	const text = (body ?? "").replace(/\r\n/g, "\n")
	if (!text.trim()) return []

	const lines = text.split("\n")
	const spans: StatementSpan[] = []

	// per character: its physical line index. Environment/usetikzlibrary lines do not
	// participate in scanning at all (mirrors the parser's preprocessing step).
	const charLines: number[] = []
	const charText: string[] = []

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx]
		if (/^\s*\\(begin|end)\s*\{(tikzpicture|circuitikz|figure)\}/i.test(line)) continue
		if (/^\s*\\usetikzlibrary\{/.test(line)) continue

		let commentFree = ""
		for (let i = 0; i < line.length; i++) {
			const ch = line[i]
			if (ch === "%" && line[i - 1] !== "\\") break
			commentFree += ch
		}

		for (let i = 0; i < commentFree.length; i++) {
			charLines.push(lineIdx)
			charText.push(commentFree[i])
		}
		// newline separator (mapped to the physical line it terminates)
		charLines.push(lineIdx)
		charText.push("\n")
	}

	const textStr = charText.join("")

	let braceLevel = 0
	let bracketLevel = 0
	let active = false
	let startLine = -1
	let lastLine = -1
	let buffer = ""

	const flush = (endCharLine: number) => {
		const stripped = buffer.replace(/\s+/g, " ").trim()
		if (stripped.length > 0) {
			const raw = lines.slice(startLine, endCharLine + 1).join("\n")
			spans.push({
				startLine,
				lineCount: endCharLine - startLine + 1,
				raw,
				stripped,
			})
		}
		active = false
		startLine = -1
		buffer = ""
	}

	for (let i = 0; i < textStr.length; i++) {
		const ch = textStr[i]
		const chLine = charLines[i]
		const prev = i > 0 ? textStr[i - 1] : ""

		if (!active) {
			if (!/\S/.test(ch)) continue
			active = true
			startLine = chLine
			lastLine = chLine
			buffer = ""
		}

		if (ch !== "\n") lastLine = chLine
		buffer += ch

		if (ch === "{" && prev !== "\\") braceLevel++
		else if (ch === "}" && prev !== "\\") {
			if (braceLevel > 0) braceLevel--
		} else if (ch === "[" && prev !== "\\") bracketLevel++
		else if (ch === "]" && prev !== "\\") {
			if (bracketLevel > 0) bracketLevel--
		} else if (ch === ";" && braceLevel === 0 && bracketLevel === 0) {
			flush(chLine)
		}
	}

	// trailing statement without semicolon: keep as final span so user text is not
	// silently dropped
	if (active) flush(lastLine)

	return spans
}

/* ------------------------------------------------------------------ */
/* Body assembly (entries -> body text)                                */
/* ------------------------------------------------------------------ */

/**
 * Options for assembling a body from entries.
 */
export interface AssembleBodyOptions {
	/**
	 * Resolve a "code" entry into its current statement lines. If the resolver
	 * returns empty lines, the entry is dropped (attachments deleted).
	 */
	resolveCodeEntry: (entry: CodeEntry) => string[]
}

/**
 * Assembles the body text from the ordered entry list. Code entries are indented
 * with a single tab (matching the existing export format); free entries keep their
 * raw lines.
 */
export function assembleBody(entries: DocEntry[], options: AssembleBodyOptions): string {
	const outLines: string[] = []
	let isAfterFree = false

	for (const entry of entries) {
		if (entry.kind === "free") {
			for (const line of entry.lines) outLines.push(line)
			isAfterFree = true
			continue
		}

		const stmtLines = options.resolveCodeEntry(entry)
		const joined = stmtLines.join("\n").trim()
		if (!joined) continue

		if (isAfterFree) {
			// keep a visual break after user-owned blocks
			outLines.push("")
			isAfterFree = false
		}
		for (const line of joined.split("\n")) {
			outLines.push(line ? "\t" + line : "")
		}
	}

	// collapse leading empty lines
	while (outLines.length > 0 && outLines[0] === "") outLines.shift()
	// collapse trailing empty lines
	while (outLines.length > 0 && outLines.at(-1) === "") outLines.pop()

	return outLines.join("\n")
}

/* ------------------------------------------------------------------ */
/* Matching helper                                                     */
/* ------------------------------------------------------------------ */

export function normalizeStatement(stmt: string): string {
	return (stmt ?? "")
		.replace(/\\%/g, "__ESCAPED_PERCENT__")
		.replace(/%[^\n]*/g, "")
		.replace(/__ESCAPED_PERCENT__/g, "\\%")
		.replace(/\s+/g, " ")
		.trim()
}
