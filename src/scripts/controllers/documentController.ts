import { EditorState } from "@codemirror/state"
import { EditorView, lineNumbers, keymap } from "@codemirror/view"
import { history, historyKeymap } from "@codemirror/commands"
import { StreamLanguage } from "@codemirror/language"
import { stex } from "@codemirror/legacy-modes/mode/stex"

import {
	CircuitComponent,
	MainController,
	ExportController,
	SaveController,
	SelectionController,
	SelectionMode,
	Undo,
	TikzParser,
} from "../internal"
import {
	CodeEntry,
	assembleBody,
	defaultPreamble,
	newEntryId,
	normalizeStatement,
	splitFullSource,
	splitStatementSpans,
} from "../utils/tikzDocument"

/**
 * Controls the editable LaTeX document (code panel).
 *
 * Entry-based document model:
 *  - "code" entries: statements regenerated live from the canvas components attached
 *    to that entry (the attachment map lives here and persists via
 *    SaveFileFormat.documentState through undo states, file saves and tab storage).
 *  - "free" entries: verbatim user text (comments, \coordinate declarations,
 *    unparsed statements) that survives every canvas operation untouched.
 *
 * Canvas -> code: canvas mutations end in Undo.addState -> syncFromCanvas() which
 * attaches new components and re-assembles the body text.
 * Code  -> canvas: the editor commits on idle/blur via applyFullSource(), which
 * parses, rebuilds the canvas and conserves all unparsed statements verbatim.
 * @class
 */
export class DocumentController {
	private static _instance: DocumentController
	public static get instance(): DocumentController {
		if (!DocumentController._instance) {
			DocumentController._instance = new DocumentController()
		}
		return DocumentController._instance
	}

	private entries: CodeEntry[] = []
	private attachments: Map<CircuitComponent, string> = new Map()
	public preamble: string = defaultPreamble()

	private view: EditorView | null = null
	private suppressEditorUpdate = false
	private dirtyFromEdit = false
	private commitTimer: any = null
	private statusTimer: any = null
	private syncTimer: any = null

	private constructor() {
		this.initEditor()
	}

	/* ------------------------------------------------------------------ */
	/* Model                                                               */
	/* ------------------------------------------------------------------ */

	private componentsOf(entryId: string): CircuitComponent[] {
		return MainController.instance.circuitComponents.filter((c) => this.attachments.get(c) === entryId)
	}

	/* ------------------------------------------------------------------ */
	/* Persistence (undo states / file save / tab storage)                 */
	/* ------------------------------------------------------------------ */

	/**
	 * Serializes the current document state. `componentOrder` must be the exact
	 * component array that is stored into the same save state — the captured
	 * compIndices refer into it.
	 */
	public captureState(componentOrder: CircuitComponent[]): any {
		return {
			version: 1,
			preamble: this.preamble,
			entries: this.entries.map((entry) =>
				entry.kind === "free"
					? { id: entry.id, kind: "free", lines: [...entry.lines] }
					: {
							id: entry.id,
							kind: "code",
							compIndices: componentOrder
								.map((c, i) => (this.attachments.get(c) === entry.id ? i : -1))
								.filter((i) => i >= 0),
						}
			),
		}
	}

	/** Restores a previously captured document state. */
	public restoreState(state: any, componentOrder: CircuitComponent[]): void {
		if (!state || !Array.isArray(state.entries)) return
		this.preamble = state.preamble ?? defaultPreamble()
		this.entries = []
		this.attachments.clear()
		for (const serialized of state.entries) {
			if (serialized.kind === "free") {
				this.entries.push({ id: serialized.id ?? newEntryId(), kind: "free", lines: [...(serialized.lines ?? [])] })
			} else {
				const entry: CodeEntry = { id: serialized.id ?? newEntryId(), kind: "code" }
				this.entries.push(entry)
				for (const idx of serialized.compIndices ?? []) {
					const comp = componentOrder[idx]
					if (comp) this.attachments.set(comp, entry.id)
				}
			}
		}
	}

	/* ------------------------------------------------------------------ */
	/* Full source                                                         */
	/* ------------------------------------------------------------------ */

	/** Assembles the complete LaTeX document (preamble + environment + statements). */
	public getFullSource(): string {
		const header = ExportController.instance.buildEnvHeader()
		const footer = ExportController.instance.buildEnvFooter()
		const body = assembleBody(this.entries, {
			resolveCodeEntry: (entry) => this.resolveStatementLines(entry),
		})

		const parts: string[] = []
		if (this.preamble && this.preamble.trim()) parts.push(this.preamble.trim())
		parts.push(header.join("\n"))
		parts.push(body || "% (empty circuit)")
		parts.push(footer)
		return parts.join("\n\n")
	}

	/** Current statement lines of a code entry, re-emitted live from the canvas. */
	private resolveStatementLines(entry: CodeEntry): string[] {
		const comps = this.componentsOf(entry.id)
		if (comps.length === 0) return []
		const resolver = ExportController.instance.createAnchorResolver()
		const out: string[] = []
		for (const comp of comps) {
			const stmt = comp.toTikzString?.(resolver)
			if (stmt && stmt.trim()) out.push(stmt.trim())
		}
		return out
	}

	/* ------------------------------------------------------------------ */
	/* Canvas -> document                                                  */
	/* ------------------------------------------------------------------ */

	/**
	 * Reconciles attachments with the current canvas state, then refreshes the
	 * editor content. Called after every Undo.addState.
	 */
	public syncFromCanvas(): void {
		if (!MainController.instance) return
		const comps = MainController.instance.circuitComponents

		for (const comp of comps) {
			if (!this.attachments.has(comp)) {
				this.attachments.set(comp, this.createCodeEntry().id)
			}
		}

		const alive = new Set(comps)
		for (const comp of [...this.attachments.keys()]) {
			if (!alive.has(comp)) this.attachments.delete(comp)
		}
		this.entries = this.entries.filter((e) => e.kind === "free" || this.componentsOf(e.id).length > 0)

		void this.pushToEditor()
		this.notifyDocumentChanged()
	}

	/** Debounced variant used by frequent canvas events (drag moves etc.). */
	public scheduleCanvasSync(): void {
		if (this.syncTimer) clearTimeout(this.syncTimer)
		this.syncTimer = setTimeout(() => this.syncFromCanvas(), 120)
	}

	private notifyDocumentChanged(): void {
		window.dispatchEvent(new CustomEvent("document-changed"))
	}

	/* ------------------------------------------------------------------ */
	/* Code -> canvas                                                      */
	/* ------------------------------------------------------------------ */

	/**
	 * Applies an edited full LaTeX source: parses the body, rebuilds the canvas
	 * and conserves every statement that could not be parsed as a verbatim free
	 * entry (comments, \coordinate, unknown statements).
	 */
	public applyFullSource(source: string): { ok: boolean; messages: string[] } {
		const messages: string[] = []
		const { preamble, body } = splitFullSource(source)
		this.preamble = preamble

		SaveController.instance.currentlyLoadedSaveVersion = "1.0.0"
		const parseBody = body || source
		const parseResult = TikzParser.parse(parseBody)
		messages.push(...parseResult.warnings, ...parseResult.errors)

		SelectionController.instance.deactivateSelection()
		while (MainController.instance.circuitComponents.length > 0) {
			MainController.instance.removeComponent(MainController.instance.circuitComponents[0])
		}

		this.entries = []
		this.attachments.clear()

		const loaded: CircuitComponent[] = []
		for (const saveObj of parseResult.components) {
			try {
				const comp = SaveController.fromJson(saveObj)
				if (comp) loaded.push(comp)
			} catch {
				/* instantiation failures drop the corresponding statement */
			}
		}

		// Attach loaded components each to a fresh code entry, but reuse statement
		// spans that map 1:1 to re-emissions. Spans without a matching re-emission
		// become verbatim free entries (user code conservation).
		const spans = splitStatementSpans(parseBody)
		const resolver = ExportController.instance.createAnchorResolver()
		// strips trailing semicolons so our statements match TikzParser.splitStatements text
		const canon = (s: string) => normalizeStatement(s).replace(/;+\s*$/, "").trim()
		const normReEmissions: string[] = loaded.map((c) => canon(c.toTikzString?.(resolver) ?? ""))
		const normSet = new Set(normReEmissions)
		let matchCursor = 0

		for (const span of spans) {
			const normalizedSpan = canon(span.stripped)
			if (!normalizedSpan) continue

			let consumed = false
			while (matchCursor < normReEmissions.length && normReEmissions[matchCursor] === normalizedSpan) {
				consumed = true
				matchCursor++
			}
			if (consumed) continue
			if (normSet.has(normalizedSpan)) continue // re-emission exists elsewhere in order

			this.entries.push({ id: newEntryId(), kind: "free", lines: span.raw.split("\n") })
		}

		for (const comp of loaded) {
			this.attachments.set(comp, this.createCodeEntry().id)
		}

		SelectionController.instance.activateSelection()
		Undo.addState()
		this.dirtyFromEdit = false

		return { ok: true, messages }
	}

	/* ------------------------------------------------------------------ */
	/* Editor                                                              */
	/* ------------------------------------------------------------------ */

	private initEditor(): void {
		const host = document.getElementById("liveCodeEditorHost")
		if (!host) return

		const extensions = [
			lineNumbers(),
			history(),
			keymap.of(historyKeymap),
			StreamLanguage.define(stex as any),
			EditorView.lineWrapping,
			EditorView.theme({
				"&": { height: "100%", fontSize: "12px" },
				".cm-scroller": {
					overflow: "auto",
					fontFamily: "var(--bs-font-monospace, monospace)",
				},
				"&.cm-focused": { outline: "none" },
			}),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					if (this.suppressEditorUpdate) return
					this.dirtyFromEdit = true
					this.scheduleCommit()
				}
				if (update.focusChanged && !update.view.hasFocus && this.dirtyFromEdit) {
					this.commit()
				}
			}),
		]

		this.view = new EditorView({
			state: EditorState.create({ doc: "", extensions }),
			parent: host,
		})
		this.view.dom.style.height = "100%"
	}

	private createCodeEntry(): CodeEntry {
		const entry: CodeEntry = { id: newEntryId(), kind: "code" }
		this.entries.push(entry)
		return entry
	}

	private scheduleCommit(): void {
		if (this.commitTimer) clearTimeout(this.commitTimer)
		this.commitTimer = setTimeout(() => this.commit(), 500)
	}

	private commit(): void {
		if (this.commitTimer) {
			clearTimeout(this.commitTimer)
			this.commitTimer = null
		}
		if (!this.view || !this.dirtyFromEdit) return
		const source = this.view.state.doc.toString()
		const outcome = this.applyFullSource(source)
		this.showStatus(outcome)
	}

	public showStatus(outcome: { ok: boolean; messages: string[] }): void {
		const badge = document.getElementById("liveCodeDocBadge")
		if (!badge) return
		if (outcome.ok && outcome.messages.length === 0) {
			this.setBadge("synced", "text-bg-secondary")
		} else {
			const first = outcome.messages[0] ?? "unparsed statements kept verbatim"
			this.setBadge(first.length > 42 ? first.slice(0, 42) + "…" : first, "text-bg-danger")
			if (this.statusTimer) clearTimeout(this.statusTimer)
			this.statusTimer = setTimeout(() => {
				this.setBadge("synced", "text-bg-secondary")
			}, 6000)
		}
	}

	private setBadge(text: string, className: string): void {
		const badge = document.getElementById("liveCodeDocBadge")
		if (!badge) return
		badge.textContent = text
		badge.className = `badge ${className}`
	}

	/** Replaces the editor content with the current document source. */
	public async pushToEditor(): Promise<void> {
		if (!this.view) {
			this.initEditor()
			if (!this.view) return
		}
		const source = this.getFullSource()
		const current = this.view.state.doc.toString()
		if (current === source) return
		this.suppressEditorUpdate = true
		this.view.dispatch({
			changes: { from: 0, to: current.length, insert: source },
		})
		this.suppressEditorUpdate = false
		this.dirtyFromEdit = false
	}
}