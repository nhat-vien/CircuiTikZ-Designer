import { describe, expect, it } from "vitest"
import { collectErrorLines, describeCompileStatus, formatElapsed } from "../src/scripts/utils/latexCompileStatus"

describe("describeCompileStatus", () => {
	it("shows a spinner and a seconds counter for a manual compile", () => {
		const view = describeCompileStatus({ phase: "compiling", manual: true, elapsedMs: 3200, errors: [] })
		expect(view.spinner).toBe(true)
		expect(view.label).toBe("3s")
		expect(view.buttonClasses).toEqual(["is-compiling"])
		expect(view.bannerText).toBeNull()
		expect(view.hideBanner).toBe(false)
	})

	it("keeps auto compiles quiet: border tint only", () => {
		const view = describeCompileStatus({ phase: "compiling", manual: false, elapsedMs: 5400, errors: [] })
		expect(view.spinner).toBe(false)
		expect(view.label).toBe("")
		expect(view.buttonClasses).toEqual(["is-compiling"])
	})

	it("never labels the counter below one second", () => {
		expect(describeCompileStatus({ phase: "compiling", manual: true, elapsedMs: 0, errors: [] }).label).toBe("1s")
	})

	it("reports the duration on success and clears the banner", () => {
		const view = describeCompileStatus({ phase: "ok", manual: true, elapsedMs: 1200, errors: [] })
		expect(view.label).toBe("ok · 1.2s")
		expect(view.badgeClasses).toEqual(["latex-status-ok"])
		expect(view.hideBanner).toBe(true)
		expect(view.spinner).toBe(false)
	})

	it("stays silent on a successful auto compile", () => {
		const view = describeCompileStatus({ phase: "ok", manual: false, elapsedMs: 900, errors: [] })
		expect(view.label).toBe("")
		expect(view.hideBanner).toBe(true)
	})

	it("labels the first error line and counts the rest", () => {
		const view = describeCompileStatus({
			phase: "error",
			manual: true,
			elapsedMs: 400,
			errors: ["! LaTeX Error: File `siunitx.sty' not found.", "l.51 \\usepackage", "!  ==> Fatal error occurred"],
		})
		expect(view.label).toBe("error")
		expect(view.badgeClasses).toEqual(["latex-status-error"])
		expect(view.bannerText).toBe("! LaTeX Error: File `siunitx.sty' not found. (+2)")
	})

	it("truncates a single very long error line", () => {
		const view = describeCompileStatus({ phase: "error", manual: false, elapsedMs: 0, errors: ["x".repeat(400)] })
		expect(view.bannerText).toBe("x".repeat(300) + "…")
	})

	it("falls back to a generic message when no error line is available", () => {
		expect(describeCompileStatus({ phase: "error", manual: false, elapsedMs: 0, errors: [] }).bannerText).toBe(
			"compilation failed"
		)
	})

	it("idle resets everything", () => {
		expect(describeCompileStatus({ phase: "idle", manual: false, elapsedMs: 0, errors: [] })).toEqual({
			spinner: false,
			label: "",
			buttonClasses: [],
			badgeClasses: [],
			bannerText: null,
			hideBanner: false,
		})
	})
})

describe("formatElapsed", () => {
	it.each([
		[820, "820ms"],
		[0, "0ms"],
		[1000, "1.0s"],
		[1200, "1.2s"],
		[12000, "12.0s"],
	])("%i ms formats as %s", (ms, expected) => {
		expect(formatElapsed(ms)).toBe(expected)
	})
})

describe("collectErrorLines", () => {
	it("prefers the transport error and keeps the log lines behind it", () => {
		expect(collectErrorLines({ error: "renderer busy", errors: ["! foo", "! bar"] })).toEqual([
			"renderer busy",
			"! foo",
			"! bar",
		])
	})

	it("takes the first log line as primary when there is no transport error", () => {
		expect(collectErrorLines({ errors: ["! a", "! b"] })).toEqual(["! a", "! b"])
	})

	it("always returns at least one line", () => {
		expect(collectErrorLines({})).toEqual(["compilation failed"])
	})

	it("drops log lines that repeat the primary message", () => {
		expect(collectErrorLines({ error: "boom", errors: ["boom"] })).toEqual(["boom"])
	})
})
