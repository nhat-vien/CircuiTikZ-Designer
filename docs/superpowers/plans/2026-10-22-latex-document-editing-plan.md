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

---

## Ghi chú triển khai (deviation notes — 2026-10-22)

**Mô hình document: entry-based thay vì raw-line splice.** Thay vì splice theo dòng
(spec §3), DocumentController giữ một danh sách entry:
- `code` entry: statement được re-emit **trực tiếp** từ các component gắn vào entry
  (attachment `Map<CircuitComponent, entryId>`); không cần splice chuỗi.
- `free` entry: text thô của user (comment, `\coordinate`, statement không parse được),
  giữ nguyên verbatim qua mọi thao tác canvas.
State serialize qua `SaveFileFormat.documentState` (compIndices → undo/file save/tab).

**Danh sách thay đổi so với plan ban đầu:**
- `@codemirror/lang-tex` không tồn tại trên npm → dùng `@codemirror/legacy-modes/mode/stex`.
- LaTeX alignment: dùng `\typeout{CTDBBOX|\the\pgf@picminx|...}` probe thay tx/ty skeleton.
- Compile chạy trong Electron main (`src/scripts/latex/latexRenderer.js`), không dùng render server.
- Auto routing `-|`/`|-` + Shift ép thẳng + symbolic endpoint `(Q1.B)`: **đã có sẵn**
  trong codebase (WireDirection + createAnchorResolver) — chỉ wire lại DocumentController.
- Route render-server web fallback: **hoãn** (chỉ client-side availability check).
- Merge/extend wire qua statement: bỏ (entry model tách statement riêng nên không cần).
- Pre-existing parser bug đã sửa: `\ctikzset{...}` không có `;` khiến statement sau nó bị dropped.

**Trạng thái:** Phase 1–4 đã commit; Phase 5 = docs + checklist thủ công.
