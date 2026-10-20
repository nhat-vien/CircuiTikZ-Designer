"""
CircuiTikZ Pin Offset Lookup Tool
===================================
Agent skill CLI: look up pin coordinate offsets for CircuiTikZ node-style components.

Usage:
    python lookup_pin_offset.py <tikzName>
    python lookup_pin_offset.py <tikzName> <pinName>
    python lookup_pin_offset.py --list

Examples:
    python lookup_pin_offset.py "op amp"
    python lookup_pin_offset.py "op amp" "-"
    python lookup_pin_offset.py "american-and-port" "in 1"
    python lookup_pin_offset.py --list

Output (JSON):
    { "dx": <cm>, "dy": <cm> }   -- when pinName given
    { "<pinName>": {"dx": ..., "dy": ...}, ... }  -- when only tikzName
    {"error": "not found", "available_pins": [...]}  -- if pin not found

Coordinate convention:
    dx = horizontal offset from component center (cm, positive = right)
    dy = vertical offset from component center (cm, positive = up)

Fallback:
    If not in pin_offsets_compact.json, falls back to pin_offsets_full.json,
    then falls back to parsing symbols.svg directly.
"""

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SCALE = 127 / 4800


def load_json(path: Path) -> dict:
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def find_in_svg(svg_path: Path, tikz_name: str) -> dict | None:
    """Parse symbols.svg directly to find pin offsets for tikz_name."""
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
        ns = ""
        if root.tag.startswith("{"):
            ns = root.tag.split("}")[0] + "}"

        def tag(name):
            return f"{ns}{name}"

        for component in root.iter(tag("component")):
            if component.get("tikz", "").strip() != tikz_name:
                continue
            variants = component.findall(tag("variant"))
            if not variants:
                return None
            pins = variants[0].findall(tag("pin"))
            if not pins:
                return None
            result = {}
            for pin in pins:
                name = pin.get("name", "").strip()
                if not name:
                    continue
                x_px = float(pin.get("x", "0") or "0")
                y_px = float(pin.get("y", "0") or "0")
                result[name] = {
                    "dx": round(x_px * SCALE, 4),
                    "dy": round(-y_px * SCALE, 4),
                }
            return result if result else None
    except Exception as e:
        return None


def find_component(data: dict, tikz_name: str) -> dict | None:
    """Case-insensitive lookup; also tries hyphen→space normalization."""
    if tikz_name in data:
        return data[tikz_name]
    # Try with hyphens replaced by spaces (e.g. 'american-and-port' → 'american and port')
    normalized = tikz_name.replace("-", " ")
    if normalized in data:
        return data[normalized]
    # Full case-insensitive + normalization
    lower = normalized.lower()
    for key, val in data.items():
        if key.lower() == lower or key.replace("-", " ").lower() == lower:
            return val
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Look up CircuiTikZ component pin offsets (in cm from center)"
    )
    parser.add_argument("tikz_name", nargs="?", help="TikZ component name, e.g. 'op amp'")
    parser.add_argument("pin_name", nargs="?", help="Pin name, e.g. '-' or 'in 1'")
    parser.add_argument("--list", action="store_true", help="List all known components")
    parser.add_argument("--json-dir", type=Path, help="Override directory for JSON files")
    args = parser.parse_args()

    # Resolve paths
    script_dir = Path(__file__).parent
    skill_root = script_dir.parent
    data_dir = args.json_dir or (skill_root / "resources")
    compact_path = data_dir / "pin_offsets_compact.json"
    full_path = data_dir / "pin_offsets_full.json"
    svg_path = skill_root / "resources" / "symbols.svg"

    compact = load_json(compact_path)
    full = load_json(full_path)

    if args.list:
        known = sorted(set(list(compact.keys()) + list(full.keys())))
        print(json.dumps({"components": known}, indent=2))
        return

    if not args.tikz_name:
        parser.print_help()
        sys.exit(1)

    tikz_name = args.tikz_name.strip()

    # Lookup: compact → full → SVG fallback
    pins = find_component(compact, tikz_name)
    source = "compact_json"

    if pins is None:
        pins = find_component(full, tikz_name)
        source = "full_json"

    if pins is None and svg_path.exists():
        pins = find_in_svg(svg_path, tikz_name)
        source = "svg_parsed"

    if pins is None:
        result = {
            "error": f"Component '{tikz_name}' not found",
            "tip": "Run extract_pin_offsets.py first, or check the tikz name spelling.",
            "source": "not_found"
        }
        print(json.dumps(result, indent=2))
        sys.exit(1)

    if args.pin_name:
        pin_name = args.pin_name.strip()
        # Exact match first, then case-insensitive
        offset = pins.get(pin_name)
        if offset is None:
            lower = pin_name.lower()
            for k, v in pins.items():
                if k.lower() == lower:
                    offset = v
                    break
        if offset is None:
            result = {
                "error": f"Pin '{pin_name}' not found on '{tikz_name}'",
                "available_pins": sorted(pins.keys()),
                "source": source
            }
            print(json.dumps(result, indent=2))
            sys.exit(1)

        result = {
            "tikz_name": tikz_name,
            "pin": pin_name,
            "dx_cm": offset["dx"],
            "dy_cm": offset["dy"],
            "note": "dx>0 = right of center, dy>0 = above center",
            "source": source
        }
    else:
        result = {
            "tikz_name": tikz_name,
            "pins": pins,
            "note": "dx>0 = right, dy>0 = up (from component center, in cm)",
            "source": source
        }

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
