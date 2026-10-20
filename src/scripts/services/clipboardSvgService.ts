import * as SVG from "@svgdotjs/svg.js"
import type { CircuitComponent } from "../components/circuitComponent"
import { defaultFill, defaultStroke } from "../utils/themeDefaults"

function cleanupSvg(svgObj: SVG.Svg): void {
	for (const removeElement of svgObj.find(
		':is([fill-opacity="0"],[fill="none"],[fill="transparent"]):is([stroke-opacity="0"],[stroke="none"],[stroke-width="0"],[stroke="transparent"])'
	)) {
		removeElement.remove()
	}
	for (const removeClass of svgObj.find(".draggable")) {
		removeClass.removeClass("draggable")
	}
}

export function createComponentsSvgText(components: CircuitComponent[]): string {
	const svgObj = new SVG.Svg()
	svgObj.node.style.fontSize = "10pt"
	svgObj.node.style.overflow = "visible"

	const defsMap: Map<string, SVG.Element> = new Map<string, SVG.Element>()
	const exportedComponents: SVG.Element[] = []
	for (const component of components) {
		exportedComponents.push(component.toSVG(defsMap))
	}

	if (defsMap.size > 0) {
		const defs = new SVG.Defs()
		for (const element of defsMap) {
			defs.add(element[1])
		}
		svgObj.add(defs)
	}

	for (const component of exportedComponents) {
		svgObj.add(component)
	}

	cleanupSvg(svgObj)

	const bbox = svgObj.bbox()
	if (bbox) {
		bbox.x -= 2
		bbox.y -= 2
		bbox.width += 4
		bbox.height += 4
		svgObj.viewbox(bbox)
		svgObj.attr({ width: bbox.width, height: bbox.height })
	}

	const tempDiv = document.createElement("div")
	tempDiv.appendChild(svgObj.node)
	const svgText = tempDiv.innerHTML.replaceAll(defaultStroke, "#000").replaceAll(defaultFill, "#fff")
	tempDiv.remove()
	return svgText
}

function svgTextToHtml(svgText: string): string {
	return `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}">`
}

function rasterizeSvgViaImage(svgText: string): Promise<HTMLCanvasElement> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" })
		const url = URL.createObjectURL(svgBlob)

		img.onload = () => {
			URL.revokeObjectURL(url)
			const width = img.naturalWidth || img.width || 300
			const height = img.naturalHeight || img.height || 150
			const canvas = document.createElement("canvas")
			const scale = 2
			canvas.width = Math.ceil(width * scale)
			canvas.height = Math.ceil(height * scale)
			const ctx = canvas.getContext("2d")
			if (!ctx) {
				reject(new Error("Could not create canvas context for clipboard image."))
				return
			}
			ctx.fillStyle = "#ffffff"
			ctx.fillRect(0, 0, canvas.width, canvas.height)
			ctx.scale(scale, scale)
			ctx.drawImage(img, 0, 0, width, height)
			resolve(canvas)
		}

		img.onerror = () => {
			URL.revokeObjectURL(url)
			reject(new Error("Failed to load SVG image for PNG conversion."))
		}

		img.src = url
	})
}

async function svgTextToPngBlob(svgText: string): Promise<Blob> {
	let canvas: HTMLCanvasElement

	try {
		canvas = await rasterizeSvgViaImage(svgText)
	} catch {
		if (typeof createImageBitmap === "function") {
			const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" })
			const bitmap = await createImageBitmap(svgBlob)
			canvas = document.createElement("canvas")
			const width = bitmap.width || 300
			const height = bitmap.height || 150
			const scale = 2
			canvas.width = Math.ceil(width * scale)
			canvas.height = Math.ceil(height * scale)
			const context = canvas.getContext("2d")
			if (!context) {
				throw new Error("Could not create canvas context for clipboard image.")
			}
			context.fillStyle = "#ffffff"
			context.fillRect(0, 0, canvas.width, canvas.height)
			context.scale(scale, scale)
			context.drawImage(bitmap, 0, 0, width, height)
			bitmap.close?.()
		} else {
			throw new Error("Could not rasterize SVG to PNG.")
		}
	}

	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) {
				resolve(blob)
			} else {
				reject(new Error("Could not create PNG clipboard image."))
			}
		}, "image/png")
	})
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result)
			} else {
				reject(new Error("Failed to convert blob to base64"))
			}
		}
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

export async function writeSvgTextToClipboard(svgText: string): Promise<void> {
	const clipboard = navigator.clipboard
	if (!clipboard) {
		return
	}

	if (typeof ClipboardItem !== "undefined" && clipboard.write) {
		const pngPromise = svgTextToPngBlob(svgText)
		const htmlBlobPromise = (async () => {
			const pngBlob = await pngPromise
			const base64DataUrl = await blobToBase64(pngBlob)
			return new Blob([`<img src="${base64DataUrl}">`], { type: "text/html" })
		})()

		try {
			await clipboard.write([
				new ClipboardItem({
					"image/png": pngPromise,
					"text/html": htmlBlobPromise,
				}),
			])
			return
		} catch {
			try {
				await clipboard.write([
					new ClipboardItem({
						"image/png": pngPromise,
					}),
				])
				return
			} catch (e) {
				console.warn("Could not write image selection to system clipboard.", e)
			}
		}
	}
}
