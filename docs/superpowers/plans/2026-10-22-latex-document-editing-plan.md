# Kế hoạch triển khai: Lớp Document LaTeX

Spec: `docs/superpowers/specs/2026-10-22-latex-document-editing-design.md`

Mốc triển khai — mỗi giai đoạn 1–3 commit, giữ `npm run build` xanh sau mỗi giai đoạn.

## Phase 1 — Core `TikzDocument` (utils thuần, không đụng UI)
- Thêm dev-dep `vitest`, script `npm test`.
- `src/scripts/utils/tikzDocument.ts`: `TikzDocument` (fromExportString / getFullSource / setFullSource-diff / replaceComponentLines / insertStatement / removeComponent / getComponentLines), quy tắc splice giữ indent.
- Không serialize comment ra ngoài — giữ raw lines.
- Tests: splice/diff/routing-log helpers (`tests/tikzDocument.test.ts`).

## Phase 2 — DocumentController + CodeMirror panel
- Deps: `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/lang-tex`, `@codemirror/language`, `@lezer/common` (cần cho lang-tex), `style-mod` (transitive).
- `documentController.ts`: upsertFromCanvas / deleteFromCanvas / applyFullSource; hook `Undo.addState` (qua mainController); bỏ `updateLiveCode()` cũ.
- `index.html` + styles: thay `#liveCodePanel`, commit 500ms/blur/line-change, status line parse errors.
- Click canvas → highlight statement range trong editor (chỉ 1 chiều, rẻ).

## Phase 3 — Compile LaTeX thật
- `src/scripts/latex/latexRenderer.mjs` (main): IPC `latex:render`, `latex:availability`; tectonic/pdflatex + pdftocairo/pdf2svg; trích tx/ty + dòng lỗi; sanitizer.
- `src/scripts/preload.js` + `main.js` bật contextIsolation.
- `latexPreviewController.ts` + `#latexPreviewLayer` + toggle SVG/LaTeX mode + banner lỗi + badge trạng thái engine.
- Web fallback: đọc `renderServerUrl` từ localStorage, POST protocol TikAD.

## Phase 4 — Tool vẽ nâng cao
- Auto routing `-|`/`|-` trong đặt wire (ComponentPlacer/WireComponent), Shift ép thẳng, setting "horizontal-first".
- Split: context menu → 2 statement; Merge: snap-extend vào endpoint statement có sẵn → re-emit statement.
- Symbolic endpoint: `createAnchorResolver` dùng chung cho mọi insert/replace.

## Phase 5 — Hoàn thiện
- Checklist thủ công theo DoD §5 của spec, CHANGELOG, README feature list.
