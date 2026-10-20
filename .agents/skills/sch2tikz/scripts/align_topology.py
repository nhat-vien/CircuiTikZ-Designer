import os
import re
import argparse

KNOWN_X_OFFSETS = [0.0, 0.98, -0.98, 1.19, -1.19, 0.7, -0.7, 1.386, -1.386, 0.154, -0.154, 0.8, -0.8, 0.9, -0.9, 0.3, -0.3, 0.4, -0.4, 0.5, -0.5]
KNOWN_Y_OFFSETS = [0.0, 0.77, -0.77, 0.49, -0.49, 0.28, -0.28, 0.8, -0.8, 0.9, -0.9, 0.3, -0.3, 0.4, -0.4, 0.5, -0.5]

def get_base_and_offset(val, known_offsets):
    for base_int in range(-200, 400):
        for sub in [0.0, 0.5]:
            base = base_int + sub
            for offset in known_offsets:
                if abs(val - (base + offset)) < 0.01:
                    return base, offset
    return val, 0.0

def process_tikz(input_path, output_path, x_stretch=1.5, y_stretch=1.4):
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()

    def replacer(match):
        x = float(match.group(1))
        y = float(match.group(2))
        
        base_x, off_x = get_base_and_offset(x, KNOWN_X_OFFSETS)
        base_y, off_y = get_base_and_offset(y, KNOWN_Y_OFFSETS)
        
        new_x = base_x * x_stretch + off_x
        new_y = base_y * y_stretch + off_y
        
        return f"({new_x:.3f}, {new_y:.3f})"

    # Match absolute coordinates like (12.5, 8.5)
    new_content = re.sub(r'\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)', replacer, content)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"Topologically aligned TikZ saved to {output_path}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Align and stretch topological grids in TikZ')
    parser.add_argument('input', help='Input TikZ file')
    parser.add_argument('--output', help='Output TikZ file (default: input_aligned.tikz)')
    parser.add_argument('--x_stretch', type=float, default=1.5, help='Multiplier for base X grids')
    parser.add_argument('--y_stretch', type=float, default=1.4, help='Multiplier for base Y grids')
    
    args = parser.parse_args()
    output = args.output if args.output else args.input.replace('.tikz', '_aligned.tikz')
    process_tikz(args.input, output, args.x_stretch, args.y_stretch)
