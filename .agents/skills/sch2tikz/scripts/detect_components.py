import cv2
import numpy as np
import json
import sys
from pathlib import Path

def main():
    if len(sys.argv) < 2:
        print("Usage: python detect_components.py <input_image_path> [output_image_path]")
        sys.exit(1)

    img_path = Path(sys.argv[1])
    if not img_path.exists():
        print(f"Error: File {img_path} not found.")
        sys.exit(1)

    # 1. Load image in grayscale
    img = cv2.imread(str(img_path))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 2. Binarize (black drawings on white background -> invert to white on black)
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

    # 3. Detect and remove horizontal lines
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 1))
    detect_horizontal = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horizontal_kernel, iterations=2)
    
    # 4. Detect and remove vertical lines
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 25))
    detect_vertical = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, vertical_kernel, iterations=2)

    # 5. Combine line masks and subtract from original thresholded image
    lines_mask = cv2.add(detect_horizontal, detect_vertical)
    no_lines = cv2.subtract(thresh, lines_mask)

    # Clean up the subtracted image using morphological closing to reconnect parts of components
    cleanup_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    cleaned = cv2.morphologyEx(no_lines, cv2.MORPH_CLOSE, cleanup_kernel, iterations=1)

    # 6. Find contours of the remaining elements (components + text)
    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # 7. Filter contours by size to exclude noise/text and huge background shapes
    detected_boxes = []
    output_img = img.copy()

    for idx, c in enumerate(contours):
        x, y, w, h = cv2.boundingRect(c)
        area = cv2.contourArea(c)
        
        # We expect components to be at least 10x10 pixels, but not huge (like > 200)
        # These thresholds might need tuning depending on image resolution.
        if 10 < w < 200 and 10 < h < 200 and w * h > 100:
            detected_boxes.append({
                "id": idx,
                "x": int(x),
                "y": int(y),
                "width": int(w),
                "height": int(h),
                "center_x": float(x + w / 2),
                "center_y": float(y + h / 2)
            })
            # Draw on output image for visualization
            cv2.rectangle(output_img, (x, y), (x + w, y + h), (0, 0, 255), 2)
            cv2.putText(output_img, str(idx), (x, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)

    # Sort boxes by center_x first, to categorize into columns
    detected_boxes.sort(key=lambda b: b["center_x"])

    # Output JSON file
    json_path = img_path.with_name(f"{img_path.stem}_components.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(detected_boxes, f, indent=2)
    print(f"Component coordinates saved to: {json_path}")

    # Output visualized image
    if len(sys.argv) >= 3:
        out_img_path = Path(sys.argv[2])
    else:
        out_img_path = img_path.with_name(f"{img_path.stem}_detected.png")
        
    cv2.imwrite(str(out_img_path), output_img)
    print(f"Visualization image saved to: {out_img_path}")

if __name__ == "__main__":
    main()
