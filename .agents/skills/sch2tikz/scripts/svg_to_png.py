import argparse
import shutil
import subprocess
from pathlib import Path


def default_output_path(svg_path: Path) -> Path:
    return svg_path.with_suffix(".png")


def candidate_commands(svg_path: Path, png_path: Path) -> list[tuple[str, list[str]]]:
    return [
        (
            "inkscape",
            [
                "inkscape",
                str(svg_path),
                "--export-type=png",
                f"--export-filename={png_path}",
            ],
        ),
        (
            "magick",
            [
                "magick",
                str(svg_path),
                str(png_path),
            ],
        ),
        (
            "rsvg-convert",
            [
                "rsvg-convert",
                "--format",
                "png",
                "--output",
                str(png_path),
                str(svg_path),
            ],
        ),
    ]


def convert_svg_to_png(svg_path: Path, png_path: Path) -> tuple[bool, str]:
    for tool_name, command in candidate_commands(svg_path, png_path):
        if not shutil.which(tool_name):
            continue

        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0 and png_path.exists():
            return True, f"Converted with {tool_name}: {png_path}"

        details = (result.stderr or result.stdout).strip()
        return False, f"{tool_name} failed with exit code {result.returncode}: {details}"

    return (
        False,
        "No SVG-to-PNG CLI found. Install Inkscape, ImageMagick, or librsvg "
        "and make sure `inkscape`, `magick`, or `rsvg-convert` is on PATH.",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert rendered sch2tikz SVG previews to PNG for visual QA.")
    parser.add_argument("svg_file", type=Path, help="Path to a *_rendered.svg file.")
    parser.add_argument("--output", type=Path, help="PNG output path. Defaults to the SVG basename with .png.")
    args = parser.parse_args()

    svg_path = args.svg_file
    if not svg_path.exists():
        print(f"Error: SVG file not found: {svg_path}")
        return 1

    png_path = args.output or default_output_path(svg_path)
    png_path.parent.mkdir(parents=True, exist_ok=True)

    ok, message = convert_svg_to_png(svg_path, png_path)
    print(message)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
