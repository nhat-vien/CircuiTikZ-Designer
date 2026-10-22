# Web render server for the CircuiTikZ-Designer LaTeX preview.
#
# Build:  docker build -f Dockerfile -t ctd-render-server .
# Run:    docker run -d -p 8088:8088 -e ALLOW_ORIGIN="https://<user>.github.io" ctd-render-server
# Test:   curl http://localhost:8088/health
#
# Uses TeX Live (pdflatex) + poppler-utils (pdftocairo). The image is large
# (~1.5 GB) because TeX Live ships every package offline — Tectonic's first-run
# package downloads would need a persistent cache volume instead.
FROM node:20-slim

# siunitx.sty (loaded by circuitikz's `siunitx` option) lives in texlive-science,
# not in texlive-latex-extra.
RUN apt-get update && apt-get install -y --no-install-recommends \
		texlive-latex-extra \
		texlive-pictures \
		texlive-science \
		poppler-utils \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY src/scripts/latex/latexCompileCore.js ./src/scripts/latex/latexCompileCore.js
COPY server/renderServer.js ./server/renderServer.js

ENV PORT=8088
EXPOSE 8088

CMD ["node", "server/renderServer.js"]
