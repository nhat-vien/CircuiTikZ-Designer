export type CompilePhase = "idle" | "compiling" | "ok" | "error"

export interface CompileStatusInput {
	phase: CompilePhase
	/** true when the compile was started by clicking the preview button. */
	manual: boolean
	elapsedMs: number
	/** Error lines, primary message first. */
	errors: string[]
}

export interface CompileStatusView {
	spinner: boolean
	label: string
	buttonClasses: string[]
	badgeClasses: string[]
	/** null = leave the error banner untouched. */
	bannerText: string | null
	hideBanner: boolean
}

const BANNER_MAX_CHARS = 300

export function formatElapsed(ms: number): string {
	if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
	return `${(ms / 1000).toFixed(1)}s`
}

/** Maps the compile phase to the preview button / error banner presentation. */
export function describeCompileStatus(input: CompileStatusInput): CompileStatusView {
	const base: CompileStatusView = {
		spinner: false,
		label: "",
		buttonClasses: [],
		badgeClasses: [],
		bannerText: null,
		hideBanner: false,
	}
	switch (input.phase) {
		case "compiling":
			// auto compiles stay quiet: only the border tint changes
			return {
				...base,
				spinner: input.manual,
				label: input.manual ? `${Math.max(1, Math.floor(input.elapsedMs / 1000))}s` : "",
				buttonClasses: ["is-compiling"],
			}
		case "ok":
			return {
				...base,
				label: input.manual ? `ok · ${formatElapsed(input.elapsedMs)}` : "",
				badgeClasses: ["latex-status-ok"],
				hideBanner: true,
			}
		case "error": {
			const [first, ...rest] = input.errors.filter((line) => line.length > 0)
			const message = first ?? "compilation failed"
			const cut = message.length > BANNER_MAX_CHARS ? message.slice(0, BANNER_MAX_CHARS) + "…" : message
			return {
				...base,
				label: "error",
				badgeClasses: ["latex-status-error"],
				bannerText: rest.length > 0 ? `${cut} (+${rest.length})` : cut,
			}
		}
		default:
			return base
	}
}

/** Normalizes a render reply into error lines, primary message first. */
export function collectErrorLines(reply: { error?: string; errors?: string[] }): string[] {
	const primary = reply.error ?? reply.errors?.[0] ?? "compilation failed"
	const rest = reply.error ? reply.errors ?? [] : reply.errors?.slice(1) ?? []
	return [primary, ...rest.filter((line) => line && line !== primary)]
}
