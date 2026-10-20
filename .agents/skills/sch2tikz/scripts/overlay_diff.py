import argparse
import html
import mimetypes
from pathlib import Path


def image_tag(path: Path, alt: str, href: str, opacity: float = 1.0, blend: str | None = None) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    is_svg = mime == "image/svg+xml"
    href = html.escape(href)
    style = f"opacity: {opacity:.2f};"
    if blend:
        style += f" mix-blend-mode: {blend};"
    if is_svg:
        return f'<img class="panel-image" src="{href}" alt="{html.escape(alt)}" style="{style}">'
    return f'<img class="panel-image raster" src="{href}" alt="{html.escape(alt)}" style="{style}">'


def relative_href(path: Path, base_dir: Path) -> str:
    try:
        return path.resolve().relative_to(base_dir.resolve()).as_posix()
    except ValueError:
        return path.resolve().as_uri()


def build_overlay_html(original: Path, rendered: Path, out_dir: Path, title: str, original_opacity: float, rendered_opacity: float) -> str:
    original_href = relative_href(original, out_dir)
    rendered_href = relative_href(rendered, out_dir)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
body {{
  margin: 0;
  font-family: Arial, sans-serif;
  color: #1f2933;
  background: #f4f7f9;
}}
header {{
  padding: 16px 20px;
  background: #ffffff;
  border-bottom: 1px solid #d9e2ec;
}}
h1 {{
  margin: 0;
  font-size: 18px;
}}
main {{
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  padding: 14px;
}}
.panel {{
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 6px;
  min-height: 320px;
  overflow: hidden;
}}
.panel h2 {{
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  border-bottom: 1px solid #d9e2ec;
}}
.image-wrap {{
  position: relative;
  height: 70vh;
  min-height: 320px;
  background:
    linear-gradient(45deg, #e6edf3 25%, transparent 25%),
    linear-gradient(-45deg, #e6edf3 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e6edf3 75%),
    linear-gradient(-45deg, transparent 75%, #e6edf3 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
}}
.panel-image {{
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}}
.side-by-side {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 70vh;
  min-height: 320px;
}}
.side-by-side > div {{
  position: relative;
  min-width: 0;
  border-right: 1px solid #d9e2ec;
}}
.side-by-side > div:last-child {{
  border-right: 0;
}}
.note {{
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  color: #52616b;
  border-top: 1px solid #d9e2ec;
}}
@media (max-width: 900px) {{
  main {{
    grid-template-columns: 1fr;
  }}
}}
</style>
</head>
<body>
<header>
  <h1>{html.escape(title)}</h1>
</header>
<main>
  <section class="panel">
    <h2>Overlay</h2>
    <div class="image-wrap">
      {image_tag(original, "Original schematic", original_href, original_opacity)}
      {image_tag(rendered, "Rendered TikZ", rendered_href, rendered_opacity, "multiply")}
    </div>
    <div class="note">Use this as a visual QA aid. Label size, font metrics, and hand-drawn wobble should be treated as low-priority differences; topology and pin alignment matter most.</div>
  </section>
  <section class="panel">
    <h2>Side by Side</h2>
    <div class="side-by-side">
      <div>{image_tag(original, "Original schematic", original_href)}</div>
      <div>{image_tag(rendered, "Rendered TikZ", rendered_href)}</div>
    </div>
    <div class="note">Original: {html.escape(str(original))}<br>Rendered: {html.escape(str(rendered))}</div>
  </section>
</main>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a visual overlay comparison for sch2tikz QA.")
    parser.add_argument("original_image", type=Path, help="Original uploaded schematic image")
    parser.add_argument("rendered_image", type=Path, help="Rendered TikZ SVG/PNG")
    parser.add_argument("--out", type=Path, help="Output HTML path")
    parser.add_argument("--original-opacity", type=float, default=0.55)
    parser.add_argument("--rendered-opacity", type=float, default=0.70)
    args = parser.parse_args()

    if not args.original_image.exists():
        raise SystemExit(f"Error: original image not found: {args.original_image}")
    if not args.rendered_image.exists():
        raise SystemExit(f"Error: rendered image not found: {args.rendered_image}")

    out = args.out
    if out is None:
        out = args.rendered_image.with_name(f"{args.rendered_image.stem}_overlay.html")

    html_text = build_overlay_html(
        args.original_image,
        args.rendered_image,
        out.parent,
        "sch2tikz Render Overlay QA",
        args.original_opacity,
        args.rendered_opacity,
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    print(f"Overlay report written to: {out.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
