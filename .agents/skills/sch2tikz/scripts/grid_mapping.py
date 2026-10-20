import json
from pathlib import Path
import numpy as np

def group_1d(values, threshold=40):
    """Group 1D values that are within threshold of each other."""
    sorted_indices = np.argsort(values)
    groups = []
    current_group = []
    
    for idx in sorted_indices:
        val = values[idx]
        if not current_group:
            current_group.append(idx)
        else:
            prev_val = values[current_group[-1]]
            if abs(val - prev_val) <= threshold:
                current_group.append(idx)
            else:
                groups.append(current_group)
                current_group = [idx]
    if current_group:
        groups.append(current_group)
    return groups

def main():
    json_path = Path("sch2tikz-out/2026-0630-0720-upload_components.json")
    with open(json_path, "r", encoding="utf-8") as f:
        boxes = json.load(f)

    # Extract x and y coordinates
    xs = np.array([b["center_x"] for b in boxes])
    ys = np.array([b["center_y"] for b in boxes])

    # Group into columns based on x coordinates
    col_groups = group_1d(xs, threshold=50)
    
    print(f"Detected {len(col_groups)} columns of elements:")
    columns = []
    for col_idx, group in enumerate(col_groups):
        col_boxes = [boxes[idx] for idx in group]
        col_boxes.sort(key=lambda b: b["center_y"]) # Sort top-to-bottom within column
        avg_x = np.mean([b["center_x"] for b in col_boxes])
        columns.append({
            "col_idx": col_idx,
            "avg_x": avg_x,
            "boxes": col_boxes
        })
        print(f"  Column {col_idx} (avg x = {avg_x:.1f}, {len(col_boxes)} elements):")
        for b in col_boxes:
            print(f"    - ID {b['id']}: y={b['center_y']:.1f}, w={b['width']}, h={b['height']}")

    # Let's map these to TikZ coordinates (cm)
    # We want:
    # - Horizontal center of stage 1 stack (approx x=205) mapped to TikZ x = 2.5
    # - Horizontal center of inverters (approx x=380) mapped to TikZ x = 4.8
    # - Horizontal center of output stack (approx x=440) mapped to TikZ x = 10.0
    # Wait, the x coordinates are:
    # Col 1: avg_x around 27 (Input terminal) -> TikZ x = 0.5
    # Col 2: avg_x around 175-209 (Stage 1 stack) -> TikZ x = 2.5
    # Col 3: avg_x around 380 (Inverters) -> TikZ x = 4.8
    # Col 4: avg_x around 440 (Output stage) -> TikZ x = 10.0
    # Col 5: avg_x around 510-525 (Delay boxes / waveforms) -> TikZ x = 7.5 (Delay), x = 12.5 (Waveforms)
    
    # Let's define the Y-mapping scale:
    # Center of diagram is y = 231 (since image height is 462).
    # scale = 0.0245 cm/pixel
    y_center = 231.0
    y_scale = 0.0245

    print("\n--- Proposed TikZ Coordinates Mapping ---")
    for col in columns:
        print(f"\nColumn {col['col_idx']} (avg x = {col['avg_x']:.1f}):")
        for b in col["boxes"]:
            # Y mapping: TikZ Y increases going UP, SVG Y increases going DOWN
            y_tikz = (y_center - b["center_y"]) * y_scale
            # Round to 2 decimal places for clean TikZ coords
            y_tikz = round(y_tikz, 2)
            
            # Estimate what this component is based on position and dimensions
            est_type = "Unknown"
            if col["avg_x"] < 50:
                est_type = "Input Terminal / Waveform text"
            elif 150 < col["avg_x"] < 250:
                est_type = f"Stage 1 Transistor (M_stage1)"
            elif 350 < col["avg_x"] < 400:
                est_type = "Inverter (INVT/INVB)"
            elif 420 < col["avg_x"] < 460:
                est_type = "Stage 3 Output Transistor (M_OUT)"
            elif col["avg_x"] > 500:
                est_type = "Delay Box / Waveform / Output Terminal"

            print(f"  Box {b['id']} (y={b['center_y']:.1f}) -> TikZ Y = {y_tikz:+.2f} ({est_type})")

if __name__ == "__main__":
    main()
