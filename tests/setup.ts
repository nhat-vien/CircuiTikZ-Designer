// Global setup for vitest: some modules in the app barrel expect the svg.js global
import * as SVG from "@svgdotjs/svg.js"
;(globalThis as any).SVG = SVG
;(globalThis as any).window = window

// bootstrap polyfills for jsdom
if (!window.matchMedia) {
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener() {},
		removeListener() {},
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent() {
			return false
		},
	})) as unknown as typeof window.matchMedia
}
if (!(globalThis as any).ResizeObserver) {
	;(globalThis as any).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
}
if (!(globalThis as any).requestAnimationFrame) {
	;(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16)
}
