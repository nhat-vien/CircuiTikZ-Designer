import sys
import urllib.request
import urllib.parse
import os
import re
import subprocess
import shutil

def compile_local(file_path, output_svg_path):
    local_render_dir = os.path.join(os.path.dirname(file_path), "local-render")
    os.makedirs(local_render_dir, exist_ok=True)
    
    # Check if pdflatex and dvisvgm are available on PATH
    if not shutil.which("pdflatex") or not shutil.which("dvisvgm"):
        print("Local compilation tools (pdflatex or dvisvgm) not found on PATH.")
        return False
        
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    has_preamble = "\\documentclass" in content and "\\begin{document}" in content
    
    temp_tex_path = file_path
    if not has_preamble:
        temp_tex_path = os.path.join(local_render_dir, "temp_render.tex")
        match = re.search(r'\\begin{circuitikz}.*?\\end{circuitikz}', content, re.DOTALL)
        circuit_content = match.group(0) if match else content
        
        wrapper = f"""\\documentclass{{standalone}}
\\usepackage[siunitx, american]{{circuitikz}}
\\usepackage{{tikz}}
\\usetikzlibrary{{calc}}
\\begin{{document}}
{circuit_content}
\\end{{document}}"""
        with open(temp_tex_path, 'w', encoding='utf-8') as f:
            f.write(wrapper)

    base_name = os.path.splitext(os.path.basename(temp_tex_path))[0]
    print(f"Running local pdflatex on {temp_tex_path}...")
    try:
        res = subprocess.run([
            "pdflatex",
            "-disable-installer",
            "-interaction=nonstopmode",
            "-halt-on-error",
            f"-output-directory={local_render_dir}",
            temp_tex_path
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
        
        pdf_path = os.path.join(local_render_dir, f"{base_name}.pdf")
        if res.returncode != 0:
            print("Local pdflatex returned a non-zero exit code.")
            log_path = os.path.join(local_render_dir, f"{base_name}.log")
            if os.path.exists(log_path):
                with open(log_path, 'r', encoding='utf-8', errors='ignore') as log_f:
                    log_lines = log_f.readlines()
                    print("--- pdflatex Error Log Snippet ---")
                    for line in log_lines[-30:]:
                        print(line.strip())
            if not os.path.exists(pdf_path):
                print("Local pdflatex did not produce PDF.")
                return False
            print("PDF was produced; continuing to SVG conversion.")
            
        if not os.path.exists(pdf_path):
            print("Local pdflatex did not produce PDF.")
            return False
            
        print(f"Converting {pdf_path} to SVG using dvisvgm...")
        res_svg = subprocess.run([
            "dvisvgm",
            "--pdf",
            "--no-fonts",
            f"--output={output_svg_path}",
            pdf_path
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
        
        if res_svg.returncode != 0:
            print("Local dvisvgm conversion failed.")
            print(res_svg.stderr)
            return False
            
        print(f"Local compilation successful! SVG saved to {output_svg_path}")
        return True
        
    except subprocess.TimeoutExpired:
        print("Local compilation timed out.")
        return False
    except Exception as e:
        print(f"Local compilation encountered exception: {e}")
        return False

def verify_tikz(file_path):
    if not os.path.exists(file_path):
        print(f"Error: File '{file_path}' not found.")
        return False

    output_filename = os.path.splitext(file_path)[0] + "_rendered.svg"

    # Try local compilation first
    print("Attempting local LaTeX compilation...")
    if compile_local(file_path, output_filename):
        print(f"Agent Action: You can now view this image or embed it in an artifact using: ![Rendered TikZ](file:///{os.path.abspath(output_filename).replace(os.sep, '/')})")
        return True

    print("Local compilation failed or unavailable. Falling back to QuickLaTeX API...")

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    match = re.search(r'\\begin{circuitikz}.*?\\end{circuitikz}', content, re.DOTALL)
    if match:
        formula = match.group(0)
    else:
        formula = f"\\begin{{circuitikz}}\n{content}\n\\end{{circuitikz}}"

    url = 'https://www.quicklatex.com/latex3.f'

    preamble = '''\\usepackage{amsmath}
\\usepackage{amsfonts}
\\usepackage{amssymb}
\\usepackage{circuitikz}
\\usetikzlibrary{calc}
\\tikzset{
    terminal/.style={draw, thick, minimum width=0.2cm, minimum height=0.15cm, fill=white, inner sep=0pt},
    comparator/.style={op amp}
}'''

    data = {
        'formula': formula,
        'fsize': '20px',
        'fcolor': '000000',
        'mode': '0',
        'out': '1',
        'remhost': 'quicklatex.com',
        'preamble': preamble,
    }

    data_encoded = urllib.parse.urlencode(data, quote_via=urllib.parse.quote).encode('utf-8')
    print(f"Submitting to QuickLaTeX...")

    try:
        req = urllib.request.Request(url, data=data_encoded)
        with urllib.request.urlopen(req) as response:
            result = response.read().decode('utf-8')
            
            lines = result.strip().replace('\r', '').split('\n')
            if lines[0] == '0':
                image_url = lines[1].split()[0]
                print(f"Success! Image generated at: {image_url}")
                
                svg_url = image_url.replace('.png', '.svg')
                print(f"Requesting SVG from: {svg_url}")
                
                urllib.request.urlretrieve(svg_url, output_filename)
                print(f"Image downloaded and saved to: {os.path.abspath(output_filename)}")
                print(f"Agent Action: You can now view this image or embed it in an artifact using: ![Rendered TikZ](file:///{os.path.abspath(output_filename).replace(os.sep, '/')})")
                return True
            else:
                print("Compilation Failed!")
                print("Error Details:")
                print('\n'.join(lines[1:]))
                return False
    except Exception as e:
        print("Network/API Error:", e)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python verify_tikz.py <path_to_tikz_file.tikz>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    verify_tikz(file_path)
