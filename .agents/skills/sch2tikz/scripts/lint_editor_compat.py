import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Finding:
    severity: str
    line: int
    rule: str
    message: str


REQUIRED_SNIPPETS = [
    r"\documentclass{standalone}",
    r"\usepackage[siunitx, american]{circuitikz}",
    r"\usepackage{tikz}",
    r"\usetikzlibrary{calc}",
    r"\begin{document}",
    r"\begin{circuitikz}[american, scale=1.0, every node/.style={transform shape}]",
    r"\end{circuitikz}",
    r"\end{document}",
]


def line_number(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def add_regex_findings(findings: list[Finding], text: str, pattern: str, rule: str, message: str, severity: str = "error") -> None:
    for match in re.finditer(pattern, text, re.MULTILINE):
        findings.append(Finding(severity, line_number(text, match.start()), rule, message))


def lint_content(text: str, require_wrapper: bool = True) -> list[Finding]:
    findings: list[Finding] = []

    if require_wrapper:
        for snippet in REQUIRED_SNIPPETS:
            if snippet not in text:
                findings.append(
                    Finding(
                        "warning",
                        1,
                        "standard-wrapper",
                        f"Missing standard wrapper snippet: {snippet}",
                    )
                )

    add_regex_findings(
        findings,
        text,
        r"(?<!\+)\+\+\s*\(",
        "absolute-coordinates",
        "Relative coordinate '++(...)' is not editor-compatible; use absolute numeric coordinates.",
    )
    add_regex_findings(
        findings,
        text,
        r"(?<![A-Za-z0-9_.+])\+\s*\(",
        "absolute-coordinates",
        "Relative coordinate '+(...)' is not editor-compatible; use absolute numeric coordinates.",
    )
    add_regex_findings(
        findings,
        text,
        r"\\node\s*\[[^\]]*\bterminal\b[^\]]*\]",
        "manual-terminals",
        "Do not use custom [terminal] nodes; draw terminal rectangles manually.",
    )
    add_regex_findings(
        findings,
        text,
        r"\\fill\s*(?:\[[^\]]*\]\s*)?\([^)]+\)\s*circle\s*\([^)]*\)",
        "connection-dots",
        "Use editor-native '\\node[circ] at (...){};' instead of filled circle dots.",
    )
    add_regex_findings(
        findings,
        text,
        r"\\draw\s*\[[^\]]*(?:dashed|->|<-|<->)[^\]]*\]",
        "simple-draw-options",
        "Avoid complex draw options such as dashed/arrows in generated editor-compatible TikZ.",
        severity="warning",
    )
    add_regex_findings(
        findings,
        text,
        r"to\s*\[[^\]]*\bspst\b[^\]]*\]",
        "known-switches",
        "Use 'opening switch' instead of unsupported 'spst'.",
    )

    for match in re.finditer(r"\\node\s*\[([^\]]*\bop amp\b[^\]]*\byscale\s*=\s*-1[^\]]*)\]\s*\([^)]+\)\s*at\s*\([^)]+\)\s*\{([^}]*)\}", text):
        if match.group(2).strip():
            findings.append(
                Finding(
                    "warning",
                    line_number(text, match.start()),
                    "flipped-opamp-label",
                    "Flipped op amp nodes should keep node text empty and place the visible label separately.",
                )
            )

    for match in re.finditer(r"\\draw\s*\[([^\]]+)\]", text):
        options = match.group(1)
        allowed_fragments = ("line width", "thick", "thin", "color", "black", "gray", "white")
        if any(fragment in options for fragment in ("to path", "decorate", "rounded corners")):
            findings.append(
                Finding(
                    "warning",
                    line_number(text, match.start()),
                    "simple-draw-options",
                    "Complex TikZ draw options may not render or round-trip in the visual workspace.",
                )
            )
        elif options.strip() and not any(fragment in options for fragment in allowed_fragments):
            findings.append(
                Finding(
                    "info",
                    line_number(text, match.start()),
                    "draw-options-review",
                    f"Review draw options for editor compatibility: [{options}]",
                )
            )

    findings.sort(key=lambda item: (item.line, item.severity, item.rule))
    return findings


def format_markdown(path: Path, findings: list[Finding]) -> str:
    status = "PASS" if not any(f.severity == "error" for f in findings) else "FAIL"
    lines = [
        f"# Editor Compatibility Lint Report",
        "",
        f"- File: `{path}`",
        f"- Status: `{status}`",
        f"- Findings: {len(findings)}",
        "",
    ]
    if findings:
        lines.extend(["| Severity | Line | Rule | Message |", "|---|---:|---|---|"])
        for finding in findings:
            message = finding.message.replace("|", "\\|")
            lines.append(f"| {finding.severity} | {finding.line} | `{finding.rule}` | {message} |")
    else:
        lines.append("No editor compatibility issues found.")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Lint sch2tikz output for VisioCirkit editor compatibility.")
    parser.add_argument("tikz_file", type=Path, help="Path to a .tikz file")
    parser.add_argument("--report", type=Path, help="Optional markdown report path")
    parser.add_argument("--no-wrapper", action="store_true", help="Do not warn about missing standard standalone wrapper")
    args = parser.parse_args()

    if not args.tikz_file.exists():
        print(f"Error: file not found: {args.tikz_file}", file=sys.stderr)
        return 2

    text = args.tikz_file.read_text(encoding="utf-8")
    findings = lint_content(text, require_wrapper=not args.no_wrapper)
    report = format_markdown(args.tikz_file, findings)

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(report, encoding="utf-8")

    print(report)
    return 1 if any(f.severity == "error" for f in findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
