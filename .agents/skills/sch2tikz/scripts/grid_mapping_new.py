import json
from pathlib import Path

def main():
    json_path = Path("sch2tikz-out/2026-0630-2258-upload_components.json")
    with open(json_path, "r", encoding="utf-8") as f:
        boxes = json.load(f)

    # Sort boxes by center_x
    boxes.sort(key=lambda b: b["center_x"])

    print(f"Total detected elements: {len(boxes)}")
    print("Listing sorted by center_x:")
    for b in boxes:
        print(f"x={b['center_x']:.1f}, y={b['center_y']:.1f}, w={b['width']}, h={b['height']}, ID={b['id']}")

if __name__ == "__main__":
    main()
