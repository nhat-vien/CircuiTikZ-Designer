import argparse
import math
import re
from dataclasses import dataclass
from pathlib import Path


NODE_RE = re.compile(
    r"\\node(?:\[(?P<opts>[^\]]*)\])?\s*(?:\((?P<name>[^)]+)\))?\s*at\s*"
    r"\((?P<x>-?\d+(?:\.\d+)?),\s*(?P<y>-?\d+(?:\.\d+)?)\)\s*\{(?P<body>.*?)\};"
)
TO_RE = re.compile(
    r"\\draw\s*\((?P<x1>-?\d+(?:\.\d+)?),\s*(?P<y1>-?\d+(?:\.\d+)?)\)\s*"
    r"to\[(?P<opts>[^\]]+)\]\s*"
    r"\((?P<x2>-?\d+(?:\.\d+)?),\s*(?P<y2>-?\d+(?:\.\d+)?)\)"
)


@dataclass
class Box:
    kind: str
    label: str
    line: int
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    def intersects(self, other: "Box", clearance: float) -> bool:
        return not (
            self.x2 + clearance <= other.x1
            or other.x2 + clearance <= self.x1
            or self.y2 + clearance <= other.y1
            or other.y2 + clearance <= self.y1
        )


def centered_box(kind: str, label: str, line: int, x: float, y: float, width: float, height: float) -> Box:
    return Box(kind, label, line, x - width / 2, y - height / 2, x + width / 2, y + height / 2)


def anchored_text_box(label: str, line: int, x: float, y: float, body: str, opts: str) -> Box:
    text = re.sub(r"\\[a-zA-Z]+\*?(?:\{([^{}]*)\})?", r"\1", body)
    text = re.sub(r"[${}\\_^\s]+", "", text)
    width = max(0.55, min(2.4, 0.16 * len(text) + 0.28))
    height = 0.46
    anchor = "center"
    for candidate in ("north west", "north east", "south west", "south east", "west", "east", "north", "south"):
        if f"anchor={candidate}" in opts:
            anchor = candidate
            break
    if "left" in opts and "anchor=" not in opts:
        anchor = "east"
    elif "right" in opts and "anchor=" not in opts:
        anchor = "west"
    elif "above" in opts and "anchor=" not in opts:
        anchor = "south"
    elif "below" in opts and "anchor=" not in opts:
        anchor = "north"

    if "west" in anchor:
        x1, x2 = x, x + width
    elif "east" in anchor:
        x1, x2 = x - width, x
    else:
        x1, x2 = x - width / 2, x + width / 2

    if "north" in anchor:
        y1, y2 = y - height, y
    elif "south" in anchor:
        y1, y2 = y, y + height
    else:
        y1, y2 = y - height / 2, y + height / 2

    return Box("label", label, line, x1, y1, x2, y2)


def node_size(opts: str) -> tuple[str, float, float] | None:
    if "osquarepole" in opts:
        return ("terminal", 0.38, 0.38)
    if "ground" in opts:
        return ("ground", 0.42, 0.36)
    if "pmos" in opts or "nmos" in opts:
        return ("component", 1.28, 1.32)
    if "op amp" in opts or "comparator" in opts:
        return ("component", 2.4, 1.2)
    if "american nand" in opts or "american and" in opts or "american or" in opts:
        return ("component", 1.6, 1.0)
    if "american not" in opts:
        return ("component", 1.4, 0.6)
    if "circ" in opts:
        return ("junction", 0.16, 0.16)
    return None


def passive_box(opts: str, line: int, x1: float, y1: float, x2: float, y2: float) -> Box | None:
    kind = None
    if re.search(r"(^|,)\s*(R|C|L|I)(=|,|$)", opts):
        kind = "component"
    elif "opening switch" in opts:
        kind = "component"
    if not kind:
        return None

    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    horizontal = abs(x2 - x1) >= abs(y2 - y1)
    width, height = (1.0, 0.62) if horizontal else (0.62, 1.0)
    label = opts.split(",")[0].strip() or "passive"
    return centered_box(kind, label, line, cx, cy, width, height)


def collect_boxes(path: Path) -> list[Box]:
    boxes: list[Box] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        node_match = NODE_RE.search(line)
        if node_match:
            opts = node_match.group("opts") or ""
            name = node_match.group("name") or "text"
            x = float(node_match.group("x"))
            y = float(node_match.group("y"))
            body = node_match.group("body") or ""
            size = node_size(opts)
            if size:
                kind, width, height = size
                boxes.append(centered_box(kind, name, line_number, x, y, width, height))
            elif body.strip():
                boxes.append(anchored_text_box(body, line_number, x, y, body, opts))

        to_match = TO_RE.search(line)
        if to_match:
            box = passive_box(
                to_match.group("opts"),
                line_number,
                float(to_match.group("x1")),
                float(to_match.group("y1")),
                float(to_match.group("x2")),
                float(to_match.group("y2")),
            )
            if box:
                boxes.append(box)
    return boxes


def should_check_pair(a: Box, b: Box) -> bool:
    ignored = {"junction", "ground"}
    if a.kind in ignored or b.kind in ignored:
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Lint TikZ component and label bounding-box overlaps.")
    parser.add_argument("tikz_file", type=Path)
    parser.add_argument("--clearance", type=float, default=0.08, help="Minimum bbox clearance in cm.")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    boxes = collect_boxes(args.tikz_file)
    issues: list[str] = []
    for index, left in enumerate(boxes):
        for right in boxes[index + 1 :]:
            if not should_check_pair(left, right):
                continue
            if left.intersects(right, args.clearance):
                issues.append(
                    f"line {left.line} {left.kind} `{left.label}` overlaps "
                    f"line {right.line} {right.kind} `{right.label}`"
                )

    lines = [
        f"# Geometry overlap report: {args.tikz_file.name}",
        "",
        f"- Boxes checked: {len(boxes)}",
        f"- Clearance: {args.clearance:.2f} cm",
        f"- Issues: {len(issues)}",
        "",
    ]
    if issues:
        lines.append("## Issues")
        lines.extend(f"- {issue}" for issue in issues)
    else:
        lines.append("No component/label bounding-box overlaps found.")

    output = "\n".join(lines) + "\n"
    if args.report:
        args.report.write_text(output, encoding="utf-8")
    print(output)
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
