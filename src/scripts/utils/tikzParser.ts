import * as SVG from "@svgdotjs/svg.js"
import {
	ComponentSaveObject,
	MainController,
	WireDirection,
	GlobalTikzSettings,
} from "../internal"

export interface TikzParseResult {
	components: ComponentSaveObject[]
	tikzSettings?: GlobalTikzSettings
	stats: {
		bipoles: number
		wires: number
		nodes: number
		shapes: number
		total: number
	}
	warnings: string[]
	errors: string[]
}

const CM_TO_PX = 4800 / 127 // 96 DPI / 2.54 cm = 37.79527559055118

const bipoleAliases: Record<string, string> = {
	// Resistors
	"r": "american resistor",
	"resistor": "american resistor",
	"american resistor": "american resistor",
	"european resistor": "european resistor",
	"vr": "variable american resistor",
	"variable resistor": "variable american resistor",
	"pr": "american potentiometer",
	"potentiometer": "american potentiometer",
	"generic": "generic",
	"xgeneric": "xgeneric",
	"ageneric": "ageneric",
	"sgeneric": "sgeneric",
	"tgeneric": "tgeneric",
	"memristor": "memristor",

	// Capacitors
	"c": "capacitor",
	"capacitor": "capacitor",
	"ec": "ecapacitor",
	"ecapacitor": "ecapacitor",
	"pc": "curved capacitor",
	"curved capacitor": "curved capacitor",
	"variable capacitor": "variable capacitor",
	"vc": "variable capacitor",
	"capacitive sensor": "capacitive sensor",

	// Inductors
	"l": "cute inductor",
	"inductor": "cute inductor",
	"cute inductor": "cute inductor",
	"american inductor": "american inductor",
	"european inductor": "european inductor",
	"cute choke": "cute choke",
	"vl": "variable cute inductor",
	"variable inductor": "variable cute inductor",

	// Diodes
	"d": "full diode",
	"diode": "full diode",
	"full diode": "full diode",
	"empty diode": "empty diode",
	"stroke diode": "stroke diode",
	"sd": "full Schottky diode",
	"schottky diode": "full Schottky diode",
	"zd": "full Zener diode",
	"zener diode": "full Zener diode",
	"zzd": "full ZZener diode",
	"td": "full tunnel diode",
	"tunnel diode": "full tunnel diode",
	"pd": "full photodiode",
	"photodiode": "full photodiode",
	"led": "full led",
	"full led": "full led",
	"empty led": "empty led",
	"varcap": "full varcap",
	"thyristor": "full thyristor",
	"triac": "full triac",

	// Sources
	"v": "american voltage source",
	"vsource": "american voltage source",
	"voltage source": "american voltage source",
	"american voltage source": "american voltage source",
	"european voltage source": "european voltage source",
	"cute european voltage source": "cute european voltage source",
	"sinusoidal voltage source": "sinusoidal voltage source",
	"sv": "sinusoidal voltage source",
	"square voltage source": "square voltage source",
	"dcvsource": "dcvsource",
	"battery": "battery",
	"battery1": "battery1",
	"battery2": "battery2",
	"i": "american current source",
	"isource": "american current source",
	"current source": "american current source",
	"american current source": "american current source",
	"european current source": "european current source",
	"cute european current source": "cute european current source",
	"sinusoidal current source": "sinusoidal current source",
	"si": "sinusoidal current source",
	"dcisource": "dcisource",
	"esource": "esource",
	"pvsource": "pvsource",

	// Switches
	"switch": "switch",
	"closing switch": "closing switch",
	"opening switch": "opening switch",
	"normal open switch": "normal open switch",
	"normal closed switch": "normal closed switch",
	"push button": "push button",
	"spdt": "spdt",
	"cspdt": "cute spdt mid",
	"cute spdt": "cute spdt mid",
	"cute spdt mid": "cute spdt mid",
	"cute spdt up": "cute spdt up",
	"cute spdt down": "cute spdt down",

	// Meters & indicators
	"rmeter": "rmeter",
	"rmeterwa": "rmeterwa",
	"voltmeter": "rmeter",
	"ammeter": "rmeterwa",
	"ohmmeter": "ohmmeter",
	"oscope": "oscope",
	"lamp": "lamp",
	"bulb": "bulb",
	"buzzer": "buzzer",
	"fuse": "fuse",

	// Transmission lines
	"tline": "tline",
	"transmission line": "transmission line",
	"mstline": "mstline",

	// Special
	"short": "short",
	"open": "open",
}

const nodeAliases: Record<string, string> = {
	"ground": "ground",
	"tlground": "tlground",
	"rground": "rground",
	"sground": "sground",
	"tground": "tground",
	"nground": "nground",
	"pground": "pground",
	"cground": "cground",
	"eground": "eground",
	"eground2": "eground2",
	"vcc": "vcc",
	"vee": "vee",
	"circ": "circ",
	"ocirc": "ocirc",
	"diamondpole": "diamondpole",
	"odiamondpole": "odiamondpole",
	"squarepole": "squarepole",
	"osquarepole": "osquarepole",
	"npn": "npn",
	"pnp": "pnp",
	"nmos": "nmos",
	"pmos": "pmos",
	"njfet": "njfet",
	"pjfet": "pjfet",
	"nigbt": "nigbt",
	"pigbt": "pigbt",
	"op amp": "op amp",
	"fd op amp": "fd op amp",
	"inst amp": "inst amp",
	"antenna": "antenna",
	"rxantenna": "rxantenna",
	"txantenna": "txantenna",
	"mixer": "mixer",
	"adder": "adder",
	"oscillator": "oscillator",
	"and port": "american and port",
	"or port": "american or port",
	"nand port": "american nand port",
	"nor port": "american nor port",
	"not port": "american not port",
	"xor port": "american xor port",
	"xnor port": "american xnor port",
	"buffer port": "american buffer port",
}

const reservedOptionKeys = new Set([
	"l",
	"l_",
	"l^",
	"v",
	"v<",
	"v>",
	"v^",
	"v_",
	"i",
	"i<",
	"i>",
	"i^",
	"i_",
	"name",
	"n",
	"label",
	"scale",
	"t",
	"color",
	"rotate",
	"bipoles/length",
	"/tikz/circuitikz/bipoles/length",
	"anchor",
	"draw",
	"fill",
	"thick",
	"thin",
	"line width",
	"dashed",
	"dotted",
	"inner sep",
	"text width",
	"minimum width",
	"minimum height",
])

export class TikzParser {
	/**
	 * Main entry point: Parses any TikZ or CircuiTikZ code into component save objects.
	 */
	public static parse(code: string): TikzParseResult {
		const result: TikzParseResult = {
			components: [],
			stats: {
				bipoles: 0,
				wires: 0,
				nodes: 0,
				shapes: 0,
				total: 0,
			},
			warnings: [],
			errors: [],
		}

		if (!code || typeof code !== "string" || code.trim().length === 0) {
			result.warnings.push("No code provided to parse.")
			return result
		}

		try {
			const statements = this.splitStatements(code)
			const namedCoords = new Map<string, { x: number; y: number }>()

			for (const stmt of statements) {
				const trimmed = stmt.trim()
				if (!trimmed) continue

				try {
					if (trimmed.startsWith("\\coordinate")) {
						this.parseCoordinateStatement(trimmed, namedCoords)
					} else if (trimmed.startsWith("\\draw") || trimmed.startsWith("\\path")) {
						const objs = this.parsePathStatement(trimmed, namedCoords, result)
						result.components.push(...objs)
					} else if (trimmed.startsWith("\\node")) {
						// Convert \node ... to \path node ...
						const asPath = "\\path " + trimmed.substring(1)
						const objs = this.parsePathStatement(asPath, namedCoords, result)
						result.components.push(...objs)
					} else if (trimmed.startsWith("\\fill") || trimmed.startsWith("\\filldraw")) {
						// Junction dots like \fill (0,0) circle (2pt);
						const dotObj = this.parseFillCircleStatement(trimmed, namedCoords)
						if (dotObj) {
							result.components.push(dotObj)
							result.stats.nodes++
						}
					} else if (trimmed.startsWith("\\ctikzset")) {
						// Handled or logged
					} else {
						// Unhandled statement
					}
				} catch (stmtErr: any) {
					result.warnings.push(`Warning while parsing "${trimmed.substring(0, 40)}...": ${stmtErr.message}`)
				}
			}

			// Update stats
			for (const c of result.components) {
				if (c.type === "pathSymbol" || c.type === "short" || c.type === "open") {
					result.stats.bipoles++
				} else if (c.type === "wire") {
					result.stats.wires++
				} else if (c.type === "nodeSymbol") {
					result.stats.nodes++
				} else if (c.type === "rect" || c.type === "ellipse" || c.type === "arcArrow") {
					result.stats.shapes++
				}
			}
			result.stats.total = result.components.length
		} catch (err: any) {
			result.errors.push(`Parse error: ${err.message}`)
		}

		return result
	}

	/**
	 * Preprocesses code and splits it into discrete TikZ statements ending in ';'
	 */
	public static splitStatements(code: string): string[] {
		// Strip comments (% outside of \%)
		let cleanCode = code.replace(/\\%/g, "__ESCAPED_PERCENT__")
		cleanCode = cleanCode.replace(/%[^\n]*/g, "")
		cleanCode = cleanCode.replace(/__ESCAPED_PERCENT__/g, "\\%")

		// Strip environment wrappers
		cleanCode = cleanCode.replace(/\\begin\s*\{(?:tikzpicture|circuitikz|figure)\}(?:\[[^\]]*\])?/gi, "")
		cleanCode = cleanCode.replace(/\\end\s*\{(?:tikzpicture|circuitikz|figure)\}/gi, "")
		cleanCode = cleanCode.replace(/\\usetikzlibrary\{[^}]*\}/gi, "")

		const statements: string[] = []
		let current = ""
		let braceLevel = 0
		let bracketLevel = 0

		for (let i = 0; i < cleanCode.length; i++) {
			const ch = cleanCode[i]
			const prev = i > 0 ? cleanCode[i - 1] : ""

			if (ch === "{" && prev !== "\\") braceLevel++
			else if (ch === "}" && prev !== "\\") {
				if (braceLevel > 0) braceLevel--
			} else if (ch === "[" && prev !== "\\") bracketLevel++
			else if (ch === "]" && prev !== "\\") {
				if (bracketLevel > 0) bracketLevel--
			} else if (ch === ";" && braceLevel === 0 && bracketLevel === 0) {
				const stmt = current.trim()
				if (stmt.length > 0) {
					statements.push(stmt)
				}
				current = ""
				continue
			}
			current += ch
		}
		const last = current.trim()
		if (last.length > 0) {
			statements.push(last)
		}
		return statements
	}

	/**
	 * Parses a length string (e.g., "2", "2cm", "20mm", "1in", "72pt", "38px") into cm.
	 */
	public static parseLengthCm(valStr: string): number {
		valStr = valStr.trim()
		if (valStr.endsWith("cm")) return parseFloat(valStr) || 0
		if (valStr.endsWith("mm")) return (parseFloat(valStr) || 0) * 0.1
		if (valStr.endsWith("in")) return (parseFloat(valStr) || 0) * 2.54
		if (valStr.endsWith("pt")) return (parseFloat(valStr) || 0) * (2.54 / 72.27)
		if (valStr.endsWith("px")) return (parseFloat(valStr) || 0) * (127 / 4800)
		return parseFloat(valStr) || 0
	}

	/**
	 * Parses a coordinate expression and returns an SVG pixel point { x, y }
	 */
	public static parseCoordinate(
		coordStr: string,
		currentPoint: { x: number; y: number } | null = null,
		namedCoords: Map<string, { x: number; y: number }> = new Map(),
		globalScale: number = 1
	): { point: { x: number; y: number } | null; isRelUpdate: boolean; isRelNoUpdate: boolean } {
		coordStr = coordStr.trim()
		let isRelUpdate = false
		let isRelNoUpdate = false

		if (coordStr.startsWith("++")) {
			isRelUpdate = true
			coordStr = coordStr.substring(2).trim()
		} else if (coordStr.startsWith("+")) {
			isRelNoUpdate = true
			coordStr = coordStr.substring(1).trim()
		}

		if (coordStr.startsWith("(") && coordStr.endsWith(")")) {
			coordStr = coordStr.substring(1, coordStr.length - 1).trim()
		}

		let pt: { x: number; y: number } | null = null

		if (coordStr.includes(":")) {
			// Polar coordinate: (angle:radius)
			const [angleStr, rStr] = coordStr.split(":")
			const angleDeg = parseFloat(angleStr) || 0
			const rCm = this.parseLengthCm(rStr)
			const xCm = rCm * Math.cos((angleDeg * Math.PI) / 180)
			const yCm = rCm * Math.sin((angleDeg * Math.PI) / 180)
			pt = {
				x: xCm * CM_TO_PX * globalScale,
				y: -yCm * CM_TO_PX * globalScale,
			}
		} else if (coordStr.includes(",")) {
			// Cartesian coordinate: (x, y)
			const [xStr, yStr] = coordStr.split(",")
			const xCm = this.parseLengthCm(xStr)
			const yCm = this.parseLengthCm(yStr)
			pt = {
				x: xCm * CM_TO_PX * globalScale,
				y: -yCm * CM_TO_PX * globalScale,
			}
		} else {
			// Named coordinate/node
			const baseName = coordStr.split(".")[0]
			if (namedCoords.has(baseName)) {
				pt = { ...namedCoords.get(baseName)! }
			} else if (namedCoords.has(coordStr)) {
				pt = { ...namedCoords.get(coordStr)! }
			}
		}

		if (!pt) {
			return { point: null, isRelUpdate, isRelNoUpdate }
		}

		if ((isRelUpdate || isRelNoUpdate) && currentPoint) {
			pt = { x: currentPoint.x + pt.x, y: currentPoint.y + pt.y }
		}

		return { point: pt, isRelUpdate, isRelNoUpdate }
	}

	/**
	 * Parses bracket options like "[R, l={$R_1$}, *-*, mirror]"
	 */
	public static parseBracketOptions(optionsStr: string): { flags: string[]; kv: Map<string, string> } {
		if (!optionsStr) return { flags: [], kv: new Map() }
		let inner = optionsStr.trim()
		if (inner.startsWith("[") && inner.endsWith("]")) {
			inner = inner.substring(1, inner.length - 1).trim()
		}

		const items: string[] = []
		let current = ""
		let braceLevel = 0
		let bracketLevel = 0
		let inMath = false

		for (let i = 0; i < inner.length; i++) {
			const ch = inner[i]
			const prev = i > 0 ? inner[i - 1] : ""

			if (ch === "$" && prev !== "\\") {
				inMath = !inMath
			} else if (ch === "{" && !inMath && prev !== "\\") {
				braceLevel++
			} else if (ch === "}" && !inMath && prev !== "\\") {
				if (braceLevel > 0) braceLevel--
			} else if (ch === "[" && !inMath && prev !== "\\") {
				bracketLevel++
			} else if (ch === "]" && !inMath && prev !== "\\") {
				if (bracketLevel > 0) bracketLevel--
			} else if (ch === "," && braceLevel === 0 && bracketLevel === 0 && !inMath && prev !== "\\") {
				const item = current.trim()
				if (item) items.push(item)
				current = ""
				continue
			}
			current += ch
		}
		if (current.trim()) items.push(current.trim())

		const flags: string[] = []
		const kv = new Map<string, string>()

		for (const item of items) {
			const eqIdx = item.indexOf("=")
			if (eqIdx >= 0) {
				const key = item.substring(0, eqIdx).trim()
				const val = item.substring(eqIdx + 1).trim()
				kv.set(key, val)
			} else {
				flags.push(item.trim())
			}
		}

		return { flags, kv }
	}

	/**
	 * Strips wrapping outer { } and $ $ from LaTeX strings.
	 */
	public static stripBracesAndDollars(str: string): string {
		if (!str) return ""
		str = str.trim()
		while (
			(str.startsWith("{") && str.endsWith("}")) ||
			(str.startsWith("$") && str.endsWith("$"))
		) {
			if (str.startsWith("{") && str.endsWith("}")) {
				str = str.substring(1, str.length - 1).trim()
			} else if (str.startsWith("$") && str.endsWith("$")) {
				str = str.substring(1, str.length - 1).trim()
			}
		}
		return str
	}

	/**
	 * Extracts balanced opening and closing delimiters from a string starting at startIndex.
	 */
	public static extractBalanced(
		str: string,
		openChar: string,
		closeChar: string,
		startIndex: number = 0
	): { content: string; full: string; startIndex: number; endIndex: number } | null {
		const start = str.indexOf(openChar, startIndex)
		if (start === -1) return null
		let level = 1
		for (let i = start + 1; i < str.length; i++) {
			const ch = str[i]
			const prev = i > 0 ? str[i - 1] : ""
			if (prev === "\\") continue

			if (ch === openChar) level++
			else if (ch === closeChar) {
				level--
				if (level === 0) {
					return {
						content: str.substring(start + 1, i),
						full: str.substring(start, i + 1),
						startIndex: start,
						endIndex: i + 1,
					}
				}
			}
		}
		return null
	}

	/**
	 * Resolves a symbol name against aliases or the active MainController symbols list.
	 */
	public static resolveSymbol(name: string, isNode = false): string | null {
		if (!name) return null
		const lower = name.toLowerCase().trim()

		if (isNode) {
			if (nodeAliases[lower]) return nodeAliases[lower]
		} else {
			if (bipoleAliases[lower]) return bipoleAliases[lower]
		}

		// Check against registered symbols in MainController if initialized
		if (MainController.instance && MainController.instance.symbols) {
			const matched = MainController.instance.symbols.find((s) => {
				const sTikz = s.tikzName.toLowerCase()
				const sDisp = s.displayName ? s.displayName.toLowerCase() : ""
				return sTikz === lower || sDisp === lower || sTikz.replace(/\s+/g, "") === lower.replace(/\s+/g, "")
			})
			if (matched) return matched.tikzName
		}

		return null
	}

	/**
	 * Parses a standalone \coordinate (A) at (x, y); statement.
	 */
	private static parseCoordinateStatement(
		stmt: string,
		namedCoords: Map<string, { x: number; y: number }>
	): void {
		const match = stmt.match(/\\coordinate(?:\s*\[[^\]]*\])?\s*\(([^)]+)\)\s*at\s*(\([^)]+\))/)
		if (match) {
			const name = match[1].trim()
			const coordStr = match[2].trim()
			const res = this.parseCoordinate(coordStr, null, namedCoords)
			if (res.point) {
				namedCoords.set(name, res.point)
			}
		}
	}

	/**
	 * Parses a \fill (x, y) circle (2pt); junction dot statement.
	 */
	private static parseFillCircleStatement(
		stmt: string,
		namedCoords: Map<string, { x: number; y: number }>
	): ComponentSaveObject | null {
		const match = stmt.match(/\\(?:fill|filldraw)(?:\[[^\]]*\])?\s*(\([^)]+\))\s*circle/)
		if (match) {
			const coordStr = match[1].trim()
			const res = this.parseCoordinate(coordStr, null, namedCoords)
			if (res.point) {
				return {
					type: "nodeSymbol",
					id: "circ",
					position: res.point,
				}
			}
		}
		return null
	}

	/**
	 * Parses a \draw or \path statement into component save objects.
	 */
	public static parsePathStatement(
		stmt: string,
		namedCoords: Map<string, { x: number; y: number }>,
		result: TikzParseResult
	): ComponentSaveObject[] {
		let rest = stmt.replace(/^\\(?:draw|path|fill|filldraw)\s*/, "").trim()
		let drawOptions: { flags: string[]; kv: Map<string, string> } | null = null

		if (rest.startsWith("[")) {
			const bracketRes = this.extractBalanced(rest, "[", "]")
			if (bracketRes) {
				drawOptions = this.parseBracketOptions(bracketRes.full)
				rest = rest.substring(bracketRes.endIndex).trim()
			}
		}

		// Extract arrow tips from draw options (e.g. \draw[->] or \draw[-latex])
		let drawStartArrow: string | undefined = undefined
		let drawEndArrow: string | undefined = undefined
		if (drawOptions) {
			for (const f of drawOptions.flags) {
				if (f === "->") drawEndArrow = "stealth"
				else if (f === "<-") drawStartArrow = "stealth"
				else if (f === "<->") {
					drawStartArrow = "stealth"
					drawEndArrow = "stealth"
				} else if (f.startsWith("-") && f.length > 1) {
					const tip = f.substring(1).replace(/[{}]/g, "").toLowerCase()
					if (tip === "latex") drawEndArrow = "latex"
					else if (tip.includes("stealth")) drawEndArrow = "stealth"
					else drawEndArrow = "stealth"
				}
			}
		}

		const saveObjects: ComponentSaveObject[] = []
		let currentPoint: { x: number; y: number } | null = null

		while (rest.length > 0) {
			rest = rest.trim()
			if (rest.length === 0) break

			// 1. Initial or next Coordinate: ( ... ) with possible ++ or +
			const coordMatch = rest.match(/^(\+{0,2}\s*\([^)]+\))/)
			if (coordMatch) {
				const coordStr = coordMatch[1]
				const res = this.parseCoordinate(coordStr, currentPoint, namedCoords)
				if (res.point) {
					currentPoint = res.point
				}
				rest = rest.substring(coordMatch[0].length).trim()
				continue
			}

			// 2. Coordinate declaration: coordinate(A) or coordinate (A) at (x, y)
			if (rest.startsWith("coordinate")) {
				const coordDeclMatch = rest.match(/^coordinate(?:\s*\[[^\]]*\])?(?:\s*\(([^)]+)\))?(?:\s*at\s*(\([^)]+\)))?/)
				if (coordDeclMatch) {
					const name = coordDeclMatch[1]?.trim()
					const atStr = coordDeclMatch[2]?.trim()
					let pos = currentPoint
					if (atStr) {
						const parsed = this.parseCoordinate(atStr, currentPoint, namedCoords)
						if (parsed.point) pos = parsed.point
					}
					if (name && pos) {
						namedCoords.set(name, pos)
					}
					rest = rest.substring(coordDeclMatch[0].length).trim()
					continue
				}
			}

			// 3. Node specification: node[...] (name) at (...) {content}
			if (rest.startsWith("node")) {
				let nodeRest = rest.substring(4).trim()
				let nodeOptStr = ""
				if (nodeRest.startsWith("[")) {
					const bRes = this.extractBalanced(nodeRest, "[", "]")
					if (bRes) {
						nodeOptStr = bRes.content
						nodeRest = nodeRest.substring(bRes.endIndex).trim()
					}
				}

				let nodeName = ""
				if (nodeRest.startsWith("(")) {
					const parenRes = this.extractBalanced(nodeRest, "(", ")")
					if (parenRes) {
						nodeName = parenRes.content.trim()
						nodeRest = nodeRest.substring(parenRes.endIndex).trim()
					}
				}

				let nodePos = currentPoint
				if (nodeRest.startsWith("at")) {
					nodeRest = nodeRest.substring(2).trim()
					const atParenRes = this.extractBalanced(nodeRest, "(", ")")
					if (atParenRes) {
						const parsed = this.parseCoordinate(atParenRes.full, currentPoint, namedCoords)
						if (parsed.point) nodePos = parsed.point
						nodeRest = nodeRest.substring(atParenRes.endIndex).trim()
					}
				}

				let nodeContent = ""
				if (nodeRest.startsWith("{")) {
					const braceRes = this.extractBalanced(nodeRest, "{", "}")
					if (braceRes) {
						nodeContent = this.stripBracesAndDollars(braceRes.content)
						nodeRest = nodeRest.substring(braceRes.endIndex).trim()
					}
				}

				// Check what this node represents
				const opt = this.parseBracketOptions("[" + nodeOptStr + "]")
				let symbolId: string | null = null

				for (const f of opt.flags) {
					symbolId = this.resolveSymbol(f, true)
					if (symbolId) break
				}

				// Check rotation & scale
				let rotationDeg: number | undefined = undefined
				if (opt.kv.has("rotate")) {
					rotationDeg = parseFloat(opt.kv.get("rotate")!) || 0
				}
				let scaleState: { x: number; y: number } | undefined = undefined
				if (opt.kv.has("scale") || opt.kv.has("xscale") || opt.kv.has("yscale")) {
					const s = parseFloat(opt.kv.get("scale") || "1") || 1
					const sx = parseFloat(opt.kv.get("xscale") || "1") || 1
					const sy = parseFloat(opt.kv.get("yscale") || "1") || 1
					scaleState = { x: s * sx, y: s * sy }
				}

				const isRectShape = opt.flags.includes("rectangle") || opt.kv.get("shape") === "rectangle"
				const isCircleShape = opt.flags.includes("circle") || opt.kv.get("shape") === "circle"
				const isEllipseShape = opt.flags.includes("ellipse") || opt.kv.get("shape") === "ellipse"

				if (symbolId && nodePos) {
					saveObjects.push({
						type: "nodeSymbol",
						id: symbolId,
						position: nodePos,
						name: nodeName || undefined,
						label: nodeContent ? { value: nodeContent } : undefined,
						rotationDeg,
						scale: scaleState,
					} as any)
					if (nodeName) namedCoords.set(nodeName, nodePos)
				} else if (isRectShape && nodePos) {
					const wCm = this.parseLengthCm(opt.kv.get("minimum width") || "2cm")
					const hCm = this.parseLengthCm(opt.kv.get("minimum height") || "1.5cm")
					saveObjects.push({
						type: "rect",
						position: nodePos,
						size: { x: wCm * CM_TO_PX, y: hCm * CM_TO_PX },
						text: nodeContent ? { text: nodeContent } : undefined,
					} as any)
					if (nodeName) namedCoords.set(nodeName, nodePos)
				} else if ((isCircleShape || isEllipseShape) && nodePos) {
					const wCm = this.parseLengthCm(opt.kv.get("minimum width") || "2cm")
					const hCm = isCircleShape ? wCm : this.parseLengthCm(opt.kv.get("minimum height") || "1.5cm")
					saveObjects.push({
						type: "ellipse",
						position: nodePos,
						size: { x: wCm * CM_TO_PX, y: hCm * CM_TO_PX },
						isCircle: isCircleShape,
					} as any)
					if (nodeName) namedCoords.set(nodeName, nodePos)
				} else if (nodeContent && nodePos) {
					// Standalone text label node
					saveObjects.push({
						type: "rect",
						position: nodePos,
						size: { x: 80, y: 30 },
						text: {
							text: nodeContent,
							showPlaceholderText: true,
						},
					} as any)
					if (nodeName) namedCoords.set(nodeName, nodePos)
				}

				rest = nodeRest
				continue
			}

			// 4. Bipole connector: to[...] or to
			if (rest.startsWith("to")) {
				let toRest = rest.substring(2).trim()
				let toOptStr = ""
				if (toRest.startsWith("[")) {
					const bRes = this.extractBalanced(toRest, "[", "]")
					if (bRes) {
						toOptStr = bRes.content
						toRest = toRest.substring(bRes.endIndex).trim()
					}
				}

				const targetCoordMatch = toRest.match(/^(\+{0,2}\s*\([^)]+\))/)
				if (targetCoordMatch) {
					const targetCoordStr = targetCoordMatch[1]
					const res = this.parseCoordinate(targetCoordStr, currentPoint, namedCoords)
					const nextPoint = res.point

					if (currentPoint && nextPoint) {
						const opt = this.parseBracketOptions("[" + toOptStr + "]")
						let symName: string | null = null
						let labelVal: string | null = null

						// 1. Check flags for symbol name
						for (const f of opt.flags) {
							symName = this.resolveSymbol(f, false)
							if (symName) break
						}

						// 2. Check if a non-reserved key is a shorthand (e.g. R=$10\Omega$, C=10uF)
						if (!symName) {
							for (const [k, v] of opt.kv) {
								const lowerK = k.toLowerCase()
								if (!reservedOptionKeys.has(lowerK)) {
									symName = this.resolveSymbol(lowerK, false)
									if (symName) {
										labelVal = this.stripBracesAndDollars(v)
										break
									}
								}
							}
						}

						// 3. Extract label if not already extracted
						if (!labelVal) {
							const lKey = ["l", "label", "l_", "l^"].find((k) => opt.kv.has(k))
							if (lKey) {
								labelVal = this.stripBracesAndDollars(opt.kv.get(lKey)!)
							}
						}

						const otherSide = opt.kv.has("l_")

						// 4. Extract voltage
						let voltageObj: any = undefined
						const vKey = Array.from(opt.kv.keys()).find((k) => k.startsWith("v"))
						if (vKey) {
							const vVal = this.stripBracesAndDollars(opt.kv.get(vKey)!)
							let pos = ""
							let dir = ""
							if (vKey.includes("^")) pos = "^"
							else if (vKey.includes("_")) pos = "_"
							if (vKey.includes(">")) dir = ">"
							else if (vKey.includes("<")) dir = "<"
							voltageObj = {
								label: vVal,
								pos: pos || undefined,
								dir: dir || undefined,
							}
						}

						// 5. Extract current
						let currentObj: any = undefined
						const iKey = Array.from(opt.kv.keys()).find((k) => k.startsWith("i"))
						if (iKey) {
							const iVal = this.stripBracesAndDollars(opt.kv.get(iKey)!)
							currentObj = {
								label: iVal,
								backwards: iKey.includes("<"),
								below: iKey.includes("_"),
							}
						}

						// 6. Extract poles (e.g. *-*, *-o, bipole nodes={circ}{ocirc})
						let poles: { start?: string; end?: string } | undefined = undefined
						const poleFlag = opt.flags.find((f) => /^[o\*ds]-[o\*ds]$/.test(f))
						if (poleFlag) {
							const [s, e] = poleFlag.split("-")
							poles = {
								start: s === "*" ? "circ" : s === "o" ? "ocirc" : undefined,
								end: e === "*" ? "circ" : e === "o" ? "ocirc" : undefined,
							}
						} else if (opt.kv.has("bipole nodes")) {
							const rawNodes = opt.kv.get("bipole nodes")!
							const bMatches = rawNodes.match(/\{([^}]+)\}\{([^}]+)\}/)
							if (bMatches) {
								poles = { start: bMatches[1], end: bMatches[2] }
							}
						}

						// 7. Scale factor
						let scaleFactor: number | undefined = undefined
						if (opt.kv.has("/tikz/circuitikz/bipoles/length")) {
							const lenCm = this.parseLengthCm(opt.kv.get("/tikz/circuitikz/bipoles/length")!)
							if (lenCm > 0) scaleFactor = lenCm / 1.4
						}

						const componentName = opt.kv.get("name") || opt.kv.get("n")

						if (symName === "short") {
							saveObjects.push({
								type: "short",
								points: [currentPoint, nextPoint],
								poles,
								current: currentObj,
								scale: scaleFactor,
							} as any)
						} else if (symName === "open") {
							saveObjects.push({
								type: "open",
								points: [currentPoint, nextPoint],
								poles,
								voltage: voltageObj,
								scale: scaleFactor,
							} as any)
						} else if (symName) {
							saveObjects.push({
								type: "pathSymbol",
								id: symName,
								points: [currentPoint, nextPoint],
								name: componentName || undefined,
								label: labelVal ? { value: labelVal, otherSide } : undefined,
								voltage: voltageObj,
								current: currentObj,
								mirror: opt.flags.includes("mirror") || undefined,
								invert: opt.flags.includes("invert") || undefined,
								poles,
								scale: scaleFactor,
							} as any)
						} else {
							// Unrecognized or plain wire with options
							saveObjects.push({
								type: "wire",
								points: [currentPoint, nextPoint],
								directions: [WireDirection.Straight],
								current: currentObj,
							} as any)
						}

						currentPoint = nextPoint
					}

					toRest = toRest.substring(targetCoordMatch[0].length).trim()
					rest = toRest
					continue
				}
			}

			// 5. Wire connector: --, -|, |-
			const wireMatch = rest.match(/^(--|-\||\|-)\s*(\+{0,2}\s*\([^)]+\))/)
			if (wireMatch) {
				const dirStr = wireMatch[1]
				const targetCoordStr = wireMatch[2]
				const res = this.parseCoordinate(targetCoordStr, currentPoint, namedCoords)
				const nextPoint = res.point

				if (currentPoint && nextPoint) {
					let wireDir = WireDirection.Straight
					if (dirStr === "-|") wireDir = WireDirection.HV
					else if (dirStr === "|-") wireDir = WireDirection.VH

					saveObjects.push({
						type: "wire",
						points: [currentPoint, nextPoint],
						directions: [wireDir],
						startArrow: drawStartArrow,
						endArrow: drawEndArrow,
					} as any)
					currentPoint = nextPoint
				}

				rest = rest.substring(wireMatch[0].length).trim()
				continue
			}

			// 6. Rectangle connector: rectangle (p2)
			const rectMatch = rest.match(/^rectangle(?:\s*\[([^\]]*)\])?\s*(\+{0,2}\s*\([^)]+\))/)
			if (rectMatch) {
				const targetCoordStr = rectMatch[2]
				const res = this.parseCoordinate(targetCoordStr, currentPoint, namedCoords)
				const p2 = res.point

				if (currentPoint && p2) {
					const minX = Math.min(currentPoint.x, p2.x)
					const maxX = Math.max(currentPoint.x, p2.x)
					const minY = Math.min(currentPoint.y, p2.y)
					const maxY = Math.max(currentPoint.y, p2.y)
					saveObjects.push({
						type: "rect",
						position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
						size: { x: maxX - minX, y: maxY - minY },
					} as any)
					currentPoint = p2
				}

				rest = rest.substring(rectMatch[0].length).trim()
				continue
			}

			// 7. Circle connector: circle (r) or circle [radius=r]
			const circleMatch = rest.match(/^circle(?:\s*\(([^)]+)\)|\s*\[radius=([^\]]+)\])/)
			if (circleMatch && currentPoint) {
				const rStr = circleMatch[1] || circleMatch[2] || "1cm"
				const rCm = this.parseLengthCm(rStr)
				const diameterPx = rCm * 2 * CM_TO_PX
				saveObjects.push({
					type: "ellipse",
					position: currentPoint,
					size: { x: diameterPx, y: diameterPx },
					isCircle: true,
				} as any)
				rest = rest.substring(circleMatch[0].length).trim()
				continue
			}

			// 8. Ellipse connector: ellipse (rx and ry)
			const ellipseMatch = rest.match(/^ellipse\s*\(([^)]+)\)/)
			if (ellipseMatch && currentPoint) {
				const inner = ellipseMatch[1]
				const [rxStr, ryStr] = inner.split("and")
				const rxCm = this.parseLengthCm(rxStr || "1cm")
				const ryCm = this.parseLengthCm(ryStr || "1cm")
				saveObjects.push({
					type: "ellipse",
					position: currentPoint,
					size: { x: rxCm * 2 * CM_TO_PX, y: ryCm * 2 * CM_TO_PX },
					isCircle: false,
				} as any)
				rest = rest.substring(ellipseMatch[0].length).trim()
				continue
			}

			// 9. Arc connector: arc (start:end:radius)
			const arcMatch = rest.match(/^arc\s*\(([^:]+):([^:]+):([^)]+)\)/)
			if (arcMatch && currentPoint) {
				const startAngle = parseFloat(arcMatch[1]) || 0
				const endAngle = parseFloat(arcMatch[2]) || 0
				const rCm = this.parseLengthCm(arcMatch[3] || "1cm")
				const sizePx = rCm * 2 * CM_TO_PX
				const clockwise = startAngle > endAngle
				saveObjects.push({
					type: "arcArrow",
					position: currentPoint,
					size: { x: sizePx, y: sizePx },
					clockwise,
				} as any)
				rest = rest.substring(arcMatch[0].length).trim()
				continue
			}

			// Advance by 1 character if unrecognized token to prevent infinite loop
			rest = rest.substring(1).trim()
		}

		return saveObjects
	}
}
