---
name: sch2tikz
description: Convert schematic circuit images into editor-compatible CircuiTikZ code, lookup pin coordinates, and compile/verify rendered output locally or via QuickLaTeX fallback.
---

# Schematic to TikZ (sch2tikz) Skill

This skill converts schematic circuit diagrams into clean, editor-compatible CircuiTikZ LaTeX code and verifies the output iteratively. Prefer local LaTeX rendering when available; if local `pdflatex` is unavailable, use the QuickLaTeX API fallback.

## Process

1. **Save Uploaded Image (Blocking First Step)**: Before analysis, drafting, linting, or verification, save the user's uploaded circuit image to the output directory. Do not move on until the original upload is preserved:
   ```bash
   # Copy the uploaded image from temp media storage
   cp <temp_media_path> sch2tikz-out/YYYY-MMDD-HHMM-upload.png
   ```
2. **Analyze Schematic**: Inspect the schematic diagram to identify all components, terminals, loops, and wire routes.
3. **Lookup Pin Offsets**: For multi-pin components (op amps, logic gates, transistors), run the lookup script to get exact pin coordinates relative to the component center:
   ```bash
   python .agents/skills/sch2tikz/scripts/lookup_pin_offset.py "op amp"
   ```
4. **Draft TikZ Code**: Write clean TikZ code using the **Editor Compatibility Rules** below.
5. **Topological Grid Spacing**: To prevent overlapping components (like a resistor shorting through a capacitor's body), mathematically enforce bounding box clearance by stretching the base grid lines while preserving component pin offsets. Run the topological alignment script:
   ```bash
   python .agents/skills/sch2tikz/scripts/align_topology.py sch2tikz-out/YYYY-MMDD-HHMM.tikz --output sch2tikz-out/YYYY-MMDD-HHMM_aligned.tikz --x_stretch 1.5 --y_stretch 1.4
   ```
   Then proceed with `YYYY-MMDD-HHMM_aligned.tikz` for compilation.
6. **Compile and Verify**: Save to a `.tikz` file and compile/render it before handoff.
   - First check for local LaTeX tooling (`pdflatex`, `lualatex`, or `tectonic`) and use the local renderer if available.
   - If local `pdflatex`/LaTeX rendering is not available, use the QuickLaTeX verification script as the fallback:
   ```bash
   python .agents/skills/sch2tikz/scripts/verify_tikz.py sch2tikz-out/YYYY-MMDD-HHMM_aligned.tikz
   ```
   - QuickLaTeX sends the generated TikZ content to an external service; this is the expected fallback path for this skill when local rendering is unavailable.
   - If `inkscape`, `magick`, or `rsvg-convert` is available on PATH, also generate a raster preview for visual inspection:
   ```bash
   python .agents/skills/sch2tikz/scripts/svg_to_png.py sch2tikz-out/YYYY-MMDD-HHMM_rendered.svg
   ```
7. **Editor Compatibility Lint**: Run the local lint script before handing off generated code:
   ```bash
   python .agents/skills/sch2tikz/scripts/lint_editor_compat.py sch2tikz-out/YYYY-MMDD-HHMM.tikz --report sch2tikz-out/YYYY-MMDD-HHMM_lint-report.md
   ```
7. **Geometry Overlap QA**: This is the primary and only gate for overlap detection. It estimates component, terminal, and label bounding boxes from the TikZ source and fails when boxes overlap:
   ```bash
   python .agents/skills/sch2tikz/scripts/lint_geometry_overlap.py sch2tikz-out/YYYY-MMDD-HHMM.tikz --report sch2tikz-out/YYYY-MMDD-HHMM_geometry-report.md
   ```
   Fix any component/label overlap reported here before delivery.
8. **Visual Overlay QA (Deprecated)**: Do not use rendered-image overlay comparison (`overlay_diff.py`) to adjust component positions, as it is overly sensitive to hand-drawn reference variations, font metrics, and scale factors. Rely solely on the geometry linter instead.
9. **Iterate**: Inspect the compiled SVG and geometry report. Prioritize topology, pin alignment, missing symbols, wire routing, connection dots, and geometry-lint overlaps. Do not present the result as overlap-clean unless `lint_geometry_overlap.py` passes.
10. **Upload Corpus Maintenance**: Keep root-level `sch2tikz-out/YYYY-MMDD-HHMM-upload.png` files in place for existing artifact pairing, and copy them into `sch2tikz-out/uploads/` as a reusable verification corpus. Do not move or rename the originals unless the user explicitly asks.

## Output Formatting & Storage

Save the resulting files in the following format:
- `sch2tikz-out/YYYY-MMDD-HHMM-upload.png` (the original uploaded schematic image)
- `sch2tikz-out/uploads/YYYY-MMDD-HHMM-upload.png` (corpus copy for future verification)
- `sch2tikz-out/YYYY-MMDD-HHMM.tikz` (the CircuiTikZ LaTeX source file)
- `sch2tikz-out/YYYY-MMDD-HHMM_rendered.svg` (the compiled output image, compiled locally with a 60-second timeout)
- `sch2tikz-out/YYYY-MMDD-HHMM_rendered.png` (optional raster preview generated from SVG when a converter is installed)
- `sch2tikz-out/YYYY-MMDD-HHMM_lint-report.md` (optional editor compatibility lint report)
- `sch2tikz-out/YYYY-MMDD-HHMM_geometry-report.md` (component/label bbox overlap report)

These scripts are manual agent/developer QA tools. Do not wire them into the production frontend bundle, Vercel build command, or `build:demo` unless a separate deployment decision is made.

---

## Editor Compatibility Rules

All generated TikZ code must be compatible with the visual editor's parser. Follow these rules strictly:

### 1. Absolute Coordinates Only
All wire and drawing coordinates must use absolute numerical values (e.g. `(2.5, 4.0)`). Relative coordinates (such as `++(1.0, 0)` or `+(0, 2)`) are strictly forbidden.

### 2. Node Pin References
For wires connecting to multi-pin components (like op amps or logic gates), use `(NODE_NAME.PIN_NAME)` references *after* the node is defined (e.g. `\draw (0.2, 6.01) -- (OP4.+);`).

### 3. Use osquarepole for Terminals
Do not use custom node styles (such as `[terminal]`) or manually draw rectangles for input/output terminals.
Instead, use standard CircuiTikZ `osquarepole` nodes for terminal boxes and place the text label nearby:
```tikz
% V_A Terminal
\node[osquarepole] at (0.1, 6.01) {};
\draw (0.05, 6.01) node[left] {$V_A$};
```

### 4. Switch Components
Use `opening switch` for standard open switches (e.g. `to[opening switch, l=seln]`). Do not use unrecognized switch names like `spst`, as they are not mapped in the editor library and will be discarded.

### 5. Flipped Op Amps (Swapped Inputs)
If an op amp has swapped inputs (e.g., `+` on top and `-` on bottom):
1. Apply `yscale=-1` to the op amp node.
2. To prevent the op amp's label text (e.g., `OP5`) from rendering upside down, do not write text inside the node. Instead, draw the label as a separate un-mirrored text node:
   ```tikz
   \node[op amp, yscale=-1] (OP5) at (2, 3.5) {};
   \node at (2.2, 3.5) {OP5};
   ```

### 6. No Complex Drawing Options
Do not use complex styling options like `[dashed]` or `[->]` inside draw commands as they may not render correctly in the visual workspace. Keep drawing syntax as plain as possible.

### 7. Unified Document Structure
Every `.tikz` file must use the following standard LaTeX standalone wrapper:
```latex
\documentclass{standalone}
\usepackage[siunitx, american]{circuitikz}
\usepackage{tikz}
\usetikzlibrary{calc}
\begin{document}
\begin{circuitikz}[american, scale=1.0, every node/.style={transform shape}]
    % your tikz code 

\end{circuitikz}
\end{document}
```
### 8. Proportional Spacing and Text Box Widths
- Allocate horizontal and vertical coordinates based on component sizes (resistors/capacitors are ~0.8cm, transistors/comparators are ~1.5cm).
- Maintain a minimum clearing gap of 1.2cm between adjacent logic blocks.
- Set explicit alignment, text width, and anchors for text label nodes to prevent overlaps, using the `\small` font style by default:
  ```tikz
  \node[anchor=north east, align=right, text width=1.077cm, inner sep=6pt] at (3.2, 3.3) {\small $M_L$};
  ```
- Leave at least 2.0cm of vertical separation between horizontal rails and separate illustrative waveform sub-drawings.

### 9. Connection Dots Must Use `circ`
Do not emit filled circles such as:
```tikz
\fill (3.5, 3) circle (2pt);
```
Emit connection dots as editor-native `circ` nodes instead:
```tikz
\node[circ] at (3.5, 3){};
```
This keeps `Apply` round-trips stable and avoids the parser converting dots into generic circle shapes.

### 8. Proportional Spacing and Bounding Box Budgets
To prevent overlaps, text truncation, and crowded components, you MUST calculate and allocate coordinates using the following virtual Bounding Box (including clearance envelop) budgets (in cm):
- `op amp` / `comparator`: Width 2.4cm, Height 1.2cm
- Multi-pin logic ports (`nand`, `and`, `or`): Width 1.6cm, Height 1.0cm
- Single-pin logic ports (`not`): Width 1.4cm, Height 0.6cm
- Passive component / switch (`R`, `C`, `L`, `opening switch`): Width 1.0cm, Height 0.6cm
- Text Label: Width 1.5cm, Height 0.5cm (with explicit anchors e.g., [anchor=east])
- Timing Waveform Sketch: Width 4.5cm, Height 2.5cm

**Label-to-Body Clearance Rule**:
When components are placed in parallel, a component's label (offset by $\approx 0.3$cm to $0.4$cm from the wire) must not overlap with the physical body or wire of neighboring components. To guarantee this, the minimum center-to-center vertical/horizontal spacing between any parallel components must be at least **1.0cm** (derived as: Component A label top limit $y_A + 0.55$cm vs. Component B body bottom limit $y_B - 0.3$cm + safety margin of $0.15$cm $\implies y_B - y_A \ge 1.0$cm).

### 9. Clearance and Routing Rules
1. **Orthogonal Routing**: Unless the source schematic explicitly contains diagonal connections (e.g. cross-coupled latch feedback paths, bridge rectifiers, wheatstone bridges), all wiring MUST be strictly orthogonal (horizontal or vertical only) and aligned precisely with component pins.
2. **Intentional Diagonals**: If the source diagram intentionally uses diagonal paths, render them faithfully as diagonal lines using absolute coordinates. Do not attempt to force them into straight orthogonal lines.
3. **Wire Clearance**: Maintain at least 0.6cm clearance between any wire and adjacent parallel component bounding box edges.
4. **Block Isolation**: Maintain a minimum clearance gap of 1.5cm between independent logical stages (e.g., buffer block to comparator block).
5. **Connection Dots**: Use `\node[circ] at (x, y) {};` for T-junctions or cross connections. Do not use filled circles `\fill`.

### 10. Horizontal Transistor Flipping
To flip a MOS transistor horizontally (gate pointing to the right instead of the left):
- Use `xscale=-1` on the node option (e.g. `\node[pmos, xscale=-1] (M2) at (x, y) {};`).
- Remember that when `xscale=-1` is applied, the gate pin (e.g. `M2.G`) flips coordinates to the right side: `dx = +0.98` instead of `-0.98` (i.e. x-coordinate is at `x + 0.98`). All wiring connecting to the gate must align horizontally to this flipped position.

### 11. PMOS Bubble Style
Emit PMOS nodes with the CircuiTikZ `emptycircle` option by default:
```tikz
\node[pmos, emptycircle] (M1) at (3, 5.5) {};
\node[pmos, emptycircle, xscale=-1] (M2) at (3, 4.0) {};
```
### 12. Netlist Connectivity Self-Check
To systematically avoid and correct wire routing errors, you MUST perform a virtual Netlist Connectivity Self-Check before delivering final TikZ code:
1. **Trace Inputs to Outputs**: For every node/junction, list which components and pins are electrically connected.
2. **Verify Loop Polarity**: For every feedback loop (direct or cross-coupled), verify the sign (positive vs. negative). Specifically, check whether a feedback wire connects to the inverting input (`-`) or non-inverting input (`+`), and matching it against the schematic output polarity.
3. **Check Crossings**: Verify that intersecting lines that are NOT electrically connected do not have `circ` node connection dots, and that they cross cleanly using orthogonal layout offsets.

---

## Computer Vision Assisted Visual Mapping (A1 Workflow)

When converting schematics with complex routing or symmetrical structures (such as fully differential filters), you can use the computer vision pipeline to extract precise layout coordinates:

1. **Component Bounding Box Detection**: Run the CV detection script to find coordinates of components:
   ```bash
   python .agents/skills/sch2tikz/scripts/detect_components.py sch2tikz-out/YYYY-MMDD-HHMM-upload.png
   ```
2. **Grid Alignment and Clustering**: Cluster coordinates on X and Y axes to find the grid lines, and map them to standard absolute TikZ coordinates:
   ```bash
   python .agents/skills/sch2tikz/scripts/grid_mapping_new.py sch2tikz-out/YYYY-MMDD-HHMM-upload.png
   ```
3. **Manual Override for Symmetry**: When the CV mapping outputs slightly asymmetric coordinates for symmetric components (e.g., $y = 0.52$ and $y = -0.48$), round them to symmetric integers or fractions (e.g., $y = \pm0.5$) to ensure a balanced drawing.

---

## Pin Offset Table (Reference)

| Component | Pin | dx (cm) | dy (cm) |
|---|---|---|---|
| `op amp` | `-` | -1.19 | +0.49 |
| `op amp` | `+` | -1.19 | -0.49 |
| `op amp` | `out` | +1.19 | 0 |
| `american nand port` | `in 1` | -1.386 | +0.28 |
| `american nand port` | `in 2` | -1.386 | -0.28 |
| `american nand port` | `out` | +0.154 | 0 |
| `american not port` | `in 1` | -0.7 | 0 |
| `american not port` | `out` | +0.7 | 0 |
| `nmos` | `G` | -0.98 | 0 |
| `nmos` | `D` | 0 | +0.77 |
| `nmos` | `S` | 0 | -0.77 |
| `pmos` | `G` | -0.98 | 0 |
| `pmos` | `D` | 0 | -0.77 |
| `pmos` | `S` | 0 | +0.77 |

---

## Local LaTeX Rendering Setup

To achieve extremely fast rendering verification (under 1 second compared to 8+ seconds via the remote QuickLaTeX API), it is highly recommended to configure a local LaTeX compilation environment.

### 1. Install local TeX Distribution
- **Windows**: Install [MiKTeX](https://miktex.org/download) or TeX Live. Ensure the bin directory containing `pdflatex.exe` is added to your Windows user or system PATH environment variable.
- **macOS / Linux**: Install MacTeX or TeX Live via your package manager.

### 2. Install SVG Conversion Tools
- `dvisvgm` is required to convert Compiled PDF outputs into vector SVG format. It is bundled by default in most MiKTeX and TeX Live installations.
- Ensure `pdflatex` and `dvisvgm` are discoverable by running `pdflatex --version` and `dvisvgm --version` in your terminal.

For SVG-to-PNG visual QA, install at least one raster converter and make sure its CLI is on PATH:
- Inkscape: `winget install --id Inkscape.Inkscape`
- ImageMagick: `winget install --id ImageMagick.ImageMagick`
- librsvg: provide `rsvg-convert`

Verify with `inkscape --version`, `magick -version`, or `rsvg-convert --version`, then run:
```bash
python .agents/skills/sch2tikz/scripts/svg_to_png.py sch2tikz-out/YYYY-MMDD-HHMM_rendered.svg
```

### 3. Required MiKTeX/LaTeX Packages
Ensure the following LaTeX packages and their dependencies are installed in your TeX manager (e.g. MiKTeX Console):
- **Core packages**:
  - `standalone` (Document class/package for cropping figures)
  - `circuitikz` (v1.8.0+ for circuit design symbols)
  - `pgf` (TikZ backend drawing engine)
- **Math & Units**:
  - `amsmath`, `amsfonts`, `amssymb` (For mathematical labeling)
  - `siunitx` (For SI unit formatting in circuit components)
- **Dependencies & Helpers** (highly recommended to prevent compilation failures):
  - `l3kernel`, `l3backend` (LaTeX3 programming layer, required by `siunitx` and `standalone`)
  - `xkeyval` (Key-value option processing)
  - `xstring` (String processing, required by `circuitikz`)
  - `graphics`, `graphicx`, `trig` (Graphics processing)
  - `epstopdf-pkg` (EPS graphic conversion)

If package auto-installation is not globally enabled in your MiKTeX settings, you can install them manually using the MiKTeX Console or via CLI:
```bash
mpm --install=standalone
mpm --install=circuitikz
mpm --install=siunitx
mpm --install=xstring
mpm --install=l3kernel
```
The verification script automatically runs `pdflatex` with `-disable-installer` to avoid background execution hangs due to interactive package installer prompts, falling back cleanly to the remote QuickLaTeX API if any package is missing.
