# Schematic-to-TikZ (sch2tikz) Agent Skill

This is a standalone, self-contained Agent Skill designed to convert schematic circuit images into editor-compatible CircuiTikZ code. It includes rules for parser-compatibility, a database of component pin coordinate offsets, a command-line lookup utility, and an iterative LaTeX-to-SVG compilation verification script.

By packaging this skill, AI coding assistants and developers can easily generate perfect, clean `.tikz` files that import seamlessly into the **VisioCirkit / CircuiTikZ-Designer** graphical workspace without manual code adjustments.

> [!IMPORTANT]
> **Security Notice**: Since shared custom agent skills can contain executable code (such as the Python scripts included in this package), you should always inspect the code and verify its integrity before loading or running it to avoid executing malicious or unverified scripts.

---

## 📁 Directory Structure

- **`SKILL.md`**: The main prompt instructions containing compatibility rules, workflows, and lookup references for the AI agent.
- **`scripts/`**
  - **`verify_tikz.py`**: Compiles TikZ code using the QuickLaTeX API, downloads the compiled output as a vector **SVG**, and checks for LaTeX compilation warnings or syntax errors.
  - **`lint_editor_compat.py`**: Performs local, offline checks for VisioCirkit editor compatibility rules such as absolute coordinates, manual terminals, known switch names, and `circ` connection dots.
  - **`overlay_diff.py`**: Generates a browser-viewable visual overlay and side-by-side QA report for the original schematic image and rendered TikZ output.
  - **`svg_to_png.py`**: Converts rendered SVG previews to PNG using `inkscape`, `magick`, or `rsvg-convert` when one of those CLIs is installed.
  - **`lookup_pin_offset.py`**: Command-line lookup utility to query exact (dx, dy) coordinate offsets in centimeters for component pins.
  - **`extract_pin_offsets.py`**: Script to rebuild the pin offset databases directly from `symbols.svg`.
- **`resources/`**
  - **`symbols.svg`**: The master component vector library defining all pins, variants, and dimensions.
  - **`pin_offsets_compact.json`**: Compact JSON mapping of common multi-pin component offsets (for prompt context optimization).
  - **`pin_offsets_full.json`**: Complete JSON database of all component pin coordinates.

---

## 🚀 CLI Usage

### 1. Lookup Pin Offsets
To align wires perfectly to component pins (such as op amps or logic gates), use the lookup utility:

```bash
# List all available pins of a component
python scripts/lookup_pin_offset.py "op amp"

# Query coordinate offset of a specific pin
python scripts/lookup_pin_offset.py "op amp" "-"
python scripts/lookup_pin_offset.py "american nand port" "in 1"

# List all known multi-pin components
python scripts/lookup_pin_offset.py --list
```

### 2. Verify TikZ Compilation (to Vector SVG)
To compile a TikZ file to check for syntax errors and generate a visual preview:

```bash
python scripts/verify_tikz.py path/to/your_circuit.tikz
```

The script will query the QuickLaTeX API and download the rendered vector file to `path/to/your_circuit_rendered.svg`.

### 3. Convert Rendered SVG to PNG
For manual visual QA, install one of these CLI tools and ensure it is on PATH:

```bash
winget install --id Inkscape.Inkscape
winget install --id ImageMagick.ImageMagick
```

Then convert a rendered SVG preview:

```bash
python scripts/svg_to_png.py path/to/your_circuit_rendered.svg
```

### 4. Lint Editor Compatibility
To catch syntax that compiles in LaTeX but does not round-trip cleanly through VisioCirkit:

```bash
python scripts/lint_editor_compat.py path/to/your_circuit.tikz --report path/to/your_circuit_lint-report.md
```

### 5. Create a Visual Overlay QA Report
To compare the original schematic image against the rendered SVG/PNG without adding image-processing dependencies:

```bash
python scripts/overlay_diff.py path/to/original-upload.png path/to/your_circuit_rendered.svg
```

The overlay report is an HTML file written next to the rendered image. It is a visual QA aid, not a strict pixel score: label size, font metrics, and hand-drawn wobble should be reviewed manually and treated as lower-priority than topology, pin alignment, missing symbols, and wire routing.

These QA scripts are intended for manual agent/developer workflows only. They are not part of the frontend runtime, Vercel deployment, or `build:demo` flow.

### 6. Upload Corpus
Keep each root-level `sch2tikz-out/YYYY-MMDD-HHMM-upload.png` next to its generated artifacts for pairing with `overlay_diff.py`. Also copy those uploads into `sch2tikz-out/uploads/` to build a reusable verification corpus for future sch2tikz work.

---

## 💡 Editor Compatibility Rules Summary

When generating TikZ code, the agent adheres to these strict guidelines to ensure visual editor compatibility:
1. **Absolute Coordinates**: Always use absolute numerical values (e.g. `(2,4)`) for paths, never relative coordinates (`++(1,0)`).
2. **Standard Components**: Use standard naming conventions mapped in `symbols.svg` (such as `opening switch` instead of `spst`).
3. **Manual Terminals**: Draw terminal boxes manually using `\draw rectangle` commands rather than using custom node styles, ensuring clean rendering in the editor.
4. **Flipped Nodes**: Prevent upside-down text on flipped op-amps (`yscale=-1`) by separating the labels into standard un-mirrored text nodes.

---

## ☕ Support Development

If this skill saves you time and makes your TikZ workflow easier, please consider supporting the project by buying me a coffee! Your support helps keep this tool maintained and updated. Thank you! ❤️

[![Buy Me a Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=☕&slug=stockcurves&button_colour=FFDD00&font_colour=000000&font_family=Arial&outline_colour=000000&coffee_colour=FF8F00)](https://buymeacoffee.com/stockcurves)
