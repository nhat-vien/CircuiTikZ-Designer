"""
Extract CircuiTikZ component pin offsets from symbols.svg.

Coordinate system:
  - SVG pin attributes (x, y) are in px, relative to variant.mid
  - scale = 127 / 4800  →  1 px = scale cm
  - In world space: dx_cm = pin_x_px * scale,  dy_cm = -pin_y_px * scale
    (Y is negated because SVG Y goes down, circuit Y goes up)

Output: JSON mapping  tikzName → { pinName: { dx, dy } }
"""

import xml.etree.ElementTree as ET
import json
import sys
from pathlib import Path

SCALE = 127 / 4800  # px → cm

# Only output these common multi-pin components in the "compact" mode.
# Variants of these will be merged under the base tikzName.
COMMON_COMPONENTS = {
    "op amp", "en amp", "fd op amp", "gm amp", "inst amp",
    "american and port", "american or port", "american not port",
    "american nand port", "american nor port", "american xor port", "american xnor port",
    "american buffer port",
    "european and port", "european or port", "european not port",
    "european nand port", "european nor port", "european xor port", "european xnor port",
    "nmos", "pmos", "npn", "pnp",
    "nmosd", "pmosd", "njfet", "pjfet",
    "transformer", "transformer core",
    "spdt", "cute spdt up", "cute spdt mid", "cute spdt down",
    "gyrator", "buffer",
}


def px_to_cm(x_px: float, y_px: float) -> dict:
    """Convert SVG px offsets to cm offsets (with Y negation)."""
    return {
        "dx": round(x_px * SCALE, 4),
        "dy": round(-y_px * SCALE, 4),
    }


def extract_pins(svg_path: Path, compact: bool = True) -> dict:
    """
    Parse symbols.svg and extract pin offsets.

    Args:
        svg_path: Path to symbols.svg
        compact:  If True, only output COMMON_COMPONENTS;
                  if False, output ALL components that have pins.

    Returns:
        dict: { tikzName: { pinName: { dx_cm, dy_cm } } }
    """
    tree = ET.parse(svg_path)
    root = tree.getroot()

    # Strip XML namespace from tags for easier access
    ns = ""
    if root.tag.startswith("{"):
        ns = root.tag.split("}")[0] + "}"

    def tag(name):
        return f"{ns}{name}"

    result = {}

    for component in root.iter(tag("component")):
        tikz_name = component.get("tikz", "").strip()
        if not tikz_name:
            continue

        if compact and tikz_name not in COMMON_COMPONENTS:
            continue

        variants = component.findall(tag("variant"))
        if not variants:
            continue

        # Use the first (default) variant's pins as the representative
        first_variant = variants[0]
        pins = first_variant.findall(tag("pin"))

        if not pins:
            continue  # Skip symbols with no pins

        pin_map = {}
        for pin in pins:
            name = pin.get("name", "").strip()
            if not name:
                continue
            x_px = float(pin.get("x", "0") or "0")
            y_px = float(pin.get("y", "0") or "0")
            pin_map[name] = px_to_cm(x_px, y_px)

        if pin_map:
            result[tikz_name] = pin_map

    return result


def main():
    script_dir = Path(__file__).parent
    skill_root = script_dir.parent
    svg_path = skill_root / "resources" / "symbols.svg"

    if not svg_path.exists():
        print(f"ERROR: {svg_path} not found", file=sys.stderr)
        sys.exit(1)

    # Generate compact version (common components only)
    compact_data = extract_pins(svg_path, compact=True)
    compact_out = skill_root / "resources" / "pin_offsets_compact.json"
    with open(compact_out, "w", encoding="utf-8") as f:
        json.dump(compact_data, f, indent=2, ensure_ascii=False)
    print(f"Compact JSON written to: {compact_out}")
    print(f"  Components: {len(compact_data)}")

    # Generate full version (all components with pins)
    full_data = extract_pins(svg_path, compact=False)
    full_out = skill_root / "resources" / "pin_offsets_full.json"
    with open(full_out, "w", encoding="utf-8") as f:
        json.dump(full_data, f, indent=2, ensure_ascii=False)
    print(f"Full JSON written to: {full_out}")
    print(f"  Components: {len(full_data)}")


if __name__ == "__main__":
    main()
