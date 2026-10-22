# Spec: Lớp Document LaTeX — chỉnh sửa trên văn bản LaTeX + compile thật + tool vẽ nâng cao

- Ngày: 2026-10-22
- Trạng thái: Đã duyệt (bằng hội thoại với user)
- Nguồn cảm hứng: [TikAD](https://github.com/nt-phd/TikAD) (MIT)

## 1. Mục tiêu

Bổ sung cho CircuiTikZ-Designer bộ tính năng "edit trên document (LaTeX)" theo hướng **hybrid**: giữ nguyên mô hình object-first hiện tại (các `CircuitComponent` trên canvas là nguồn sự thật), đồng thời thêm **lớp document** thể hiện file `.tex` đầy đủ, chỉnh sửa được, đồng bộ 2 chiều với canvas mà không regenerate toàn bộ văn bản (giữ comment/indent/code tự viết).

Ba nhóm tính năng:

1. **Document layer**: panel code LaTeX (CodeMirror 6) thay thế `#liveCodePanel` chỉ đọc; sửa code ↔ sửa canvas 2 chiều với splice từng dòng.
2. **Compile LaTeX thật**: Electron tự chạy Tectonic/pdflatex + pdftocairo; hiển thị kết quả đúng chữ trên canvas (LaTeX mode), không có engine thì fallback về SVG mode.
3. **Tool vẽ nâng cao**: auto routing `-|`/`|-`, split/merge `\draw`, symbolic endpoint `(Q1.B)`.

Ngoài phạm vi đợt này: history snapshot file `.tex`, auto-draft crash recovery, đồng bộ caret↔selection hai chiều đầy đủ (chỉ giữ mức "click code → highlight canvas" tối thiểu nếu chi phí rẻ).

## 2. Bối cảnh kiến trúc hiện tại (ràng buộc)

- App: TypeScript thuần + SVG.js + Bootstrap 5, build Parcel, đóng gói Electron Forge. Electron là "vỏ mỏng" (`src/scripts/main.js`), **chưa có IPC/preload nào**.
- Xuất code hiện tại: `ExportController.getCircuiTikzString()` (trong `src/scripts/controllers/exportController.ts`) — sinh `\usetikzlibrary`, `\begin{circuitikz}`, `\ctikzset`; dùng `createAnchorResolver` để thay đầu dây trùng chân component bằng tên anchor `(Q1.B)` — hiện chỉ áp dụng lúc xuất modal.
- Import code → canvas: `TikzParser.parse` (`src/scripts/utils/tikzParser.ts`, trả về `TikzParseResult { components, tikzSettings, stats, warnings, errors }`), đi qua `ImportController` (`#importTikzModal`, có sẵn nút "Apply to Canvas").
- Live code panel chỉ đọc: `#liveCodePanel` (trong `src/pages/index.html`), `MainController.updateLiveCode()` debounce từ `Undo.addState` và các thay đổi canvas.
- Serialize từng component: `component.toTikzString(anchorResolver)` + `requiredTikzLibraries()` — mỗi component tự mô tả bằng chính đoạn lệnh TikZ của mình.
- Undo: `Undo.addState` lưu snapshot JSON toàn circuit + tikz settings (`src/scripts/controllers/undoController.ts`).
- UI tĩnh trong `src/pages/index.html`, các controller wire bằng `getElementById`.

**Triết lý thiết kế bắt buộc**: đoạn lệnh TikZ của mỗi component là "chính tả" của component đó trong document; khi object thay đổi chỉ re-emit **đoạn lệnh của chính nó** rồi splice vào body — các dòng khác không bị đụng tới.

## 3. Thiết kế chi tiết

### 3.1 Module Document (`src/scripts/utils/tikzDocument.ts`)

```ts
export interface StatementRange {
  startLine: number;   // chỉ số dòng 0-based trong body
  lineCount: number;
}

export class TikzDocument {
  // salary Map: componentId (chính là name từ Nameable) -> các dòng statement của nó
  private componentLines: Map<string, StatementRange>;

  static fromExportString(full: string): TikzDocument;
  // sinh preamble/body và componentLines map từ output của ExportController.getCircuiTikzString()

  getFullSource(): string;              // preamble + env-opening (\begin{circuitikz}) + body + env-closing
  setFullSource(source: string): void;  // người dùng sửa: tách preamble/body, đánh dấu full-reparse

  replaceComponentLines(compId: string, statementText: string): void;
  // splice giữ indent của dòng đầu tiên bị thay; thanh chỉ đụng dòng thuộc component đó

  getComponentLines(compId: string): StatementRange | undefined;
  // phục vụ "click canvas -> highlight đúng range trong editor"

  insertStatement(statementText: string, afterCompId?: string): void;
  removeComponent(compId: string): void;

  getAllUnmappedLines(): string[]; // các dòng tự do (comment, \coordinate...) - đọc qua cho full-reparse
}
```

Quy tắc splice:

- `replaceComponentLines` **giữ lại indent của dòng đầu tiên bị thay** cho toàn bộ các dòng mới (theo cách `updateBodyLinePreservingStructure` của TikAD).
- Các dòng **không** thuộc `componentLines` của component đang sửa là bất khả xâm phạm (comment, `\coordinate` người dùng tự viết, lệnh lạ...).
- Diff khi full-reparse (sau code edit) theo **component name** (TikzParser gán name qua mixin `Nameable`): trùng tên cùng type → update; trùng tên khác type → remove + add; tên mới → add; tên mất → remove.

### 3.2 DocumentController (`src/scripts/controllers/documentController.ts`)

- Sở hữu một `TikzDocument` (mỗi tab một instance, gắn với hệ tab hiện tại).
- API cho các module khác gọi: `upsertFromCanvas(component)`, `deleteFromCanvas(compId)`, `applyFullSource(source)`. Mỗi lần gọi:
  1. ghi thay đổi vào document (splice, hoặc reparse nếu nguồn từ code),
  2. cập nhật nội dung CodeMirror (nếu thay đổi không xuất phát từ editor, tránh feedback loop bằng flag `isApplyingToEditor`),
  3. `Undo.addState()` (giữ cơ chế hiện tại) + dispatch CustomEvent `document-changed`.

Luồng **canvas → code**:

1. Thao tác canvas (move/drag/properties/undo-redo/...) → hook vào `Undo.addState` như hiện tại → gọi `upsertFromCanvas`.
2. `upsertFromCanvas(component)`: chạy `toTikzString(createAnchorResolver(...))` cho riêng component đó → chưa có trong map thì `insertStatement`, đã có thì `replaceComponentLines`.
3. Mỗi component = một statement (có thể nhiều dòng); vị trí chèn mặc định: sau statement của component cuối.
4. Bỏ luồng `updateLiveCode()` đọc-only cũ — CodeMirror luôn chứa nội dung mới nhất.

Luồng **code → canvas**:

1. CodeMirror `onChange` → bật chuột đánh dấu dirty; **không** parse mỗi lần gõ phím.
2. Commit khi: (a) idle 500 ms, (b) editor mất focus, (c) dòng active thay đổi.
3. Commit → `applyFullSource` → `TikzParser.parse(body)` → diff theo tên → dựng component qua `SaveController.fromJson` (bat registry `CircuitComponent.jsonSaveMap` có sẵn) → thêm/xóa/cập nhật trên canvas.
4. Parse có warning/error tại statement nào → status line của editor ("Line 12: cannot parse `to[D]`"); phần lỗi **không bị xóa** cả trong code lẫn canvas (object cũ giữ nguyên).
5. Commit thành công → `Undo.addState()` để Ctrl+Z quay lại được cả thay đổi từ code.
6. Alias/sổ `tikzSettings` global (voltage style, label align, `\ctikzset`) diff từ phần `\ctikzset` trong body về `EnvironmentVariableController`.

### 3.3 Panel code (UI)

- Thay `#liveCodePanel` trong `src/pages/index.html` bằng container mới:
  - **CodeMirror 6** + `@codemirror/lang-tex` (chọn CodeMirror thay vì Monaco — nhẹ gấp nhiều lần, LaTeX mode có sẵn);
  - Header nhỏ: nút collapse/expand, badge parse/compile, nút "click để highlight statement đang chọn trên canvas";
  - Resizable (kéo mép đáy), theme tự theo `data-bs-theme` (dark/light hiện có).
- Giữ hotkey Alt+C bật/tắt panel.
- Phím tắt trong editor: Ctrl+S mở modal save file `.tex` hiện có; copy/dán dùng mặc định CodeMirror.

### 3.4 Compile LaTeX thật

#### 3.4.1 Main-process module (Electron)

`src/scripts/latex/latexRenderer.mjs` (chạy trong main process, Electron chỉ được import module CommonJS/ESM Node thuần):

- IPC handlers (`ipcMain.handle`):
  - `latex:render { body, preamble, settings }` → `{ svg, tx, ty, errorLine?, warnings[] }`
  - `latex:availability` → `{ tectonicPath?, pdflatexPath?, converter: 'pdftocairo' | 'pdf2svg' | null }`
- Quy trình compile (rút gọn từ TikAD):
  1. Ghi temp dir (mỗi render một subdir, xóa cũ khi vượt quota) file `compile.tex` đầy đủ (preamble + `standalone`).
  2. Ưu tiên Tectonic: `tectonic -X compile compile.tex` (Tectonic tự tải package circuitikz lần đầu rồi cache). Không có Tectonic → `pdflatex -interaction=nonstopmode compile.tex`.
  3. Convert `compile.pdf` → SVG bằng `pdftocairo -svg` (ưu tiên) hoặc `pdf2svg`.
  4. Trích `tx`, `ty` từ transform đầu tiên dạng `matrix(1,0,0,-1,tx,ty)` trong SVG (cách TikAD `LatexCanvas.injectSvg` dịch về hệ 1 unit = 1 cm).
  5. Trích lỗi từ `compile.log`: dòng đầu tiên bắt đầu bằng `!` (tối đa 120 ký tự) + các dòng warning.
  6. Sanitizer nhẹ ở main process: strip `<script>`, `foreignObject`, attribute `on*` và `href` trừ `#` trước khi trả về.
- Thêm preload `src/scripts/preload.js` (`contextBridge.exposeInMainWorld('latexRenderer', ...)`) và bật `contextIsolation: true` trong `src/scripts/main.js` (hiện đang `nodeIntegration: true`).
- Phân biệt môi trường ở renderer: `window.latexRenderer?` — gọi được => chạy bản Electron; `undefined` => chạy bản web.

#### 3.4.2 Web fallback

- Khi chạy web: nếu localStorage `renderServerUrl` được cấu hình → POST `{ latex, purpose }` theo protocol TikAD (`{ svg, tx, ty, measuredPoints? }`), tương thích luôn với render server của TikAD nếu user nhập URL đó. Không cấu hình → ẩn tính năng compile, chỉ dùng SVG mode.

#### 3.4.3 LaTeXPreviewController (`src/scripts/controllers/latexPreviewController.ts`)

- Nút toggle toolbar: **SVG mode** (hiện trạng) ⇄ **LaTeX mode**.
- Ứng xử:
  - Lắng nghe `document-changed` → `scheduleRender` (debounce 400 ms, coalesce in-flight + pending, cache theo hash của fullSource — cách TikAD tránh render dồn).
  - Render thành công → nhúng SVG vào layer `<g id="latexPreviewLayer">` **dưới** layer component; dịch theo `tx,ty` vào hệ tọa độ canvas (1 unit = 1 cm).
  - Render lỗi → banner nhỏ hiển thị dòng `!` đầu tiên; **giữ kết quả SVG tốt trước đó** (đừng xóa màn hình).
  - Engine thiếu → tự về SVG mode, badge trên nút toggle báo unavailable + tooltip hướng dẫn tải Tectonic.
- Trong LaTeX mode có toggle riêng "Hide generated outlines" để tạm ẩn component SVG chỉ xem kết quả compile thật.

### 3.5 Tool vẽ nâng cao

#### 3.5.1 Auto routing `-|`/`|-`

- Áp dụng lúc đặt wire (`ComponentPlacer.placeStep` + `WireComponent.toTikzString`): mỗi segment mới, tính từ điểm trước tới điểm snap:
  - dx=0 hoặc dy=0 → dùng `--`.
  - Cả hai khác 0 → dùng `-|` (ngang trước) hoặc `|-` (dọc trước) tùy lựa chọn trong Grid/Settings ("horizontal-first" mặc định, có setting).
  - Giữ **Shift** → luôn `--` (xiên tự do), thống nhất với hành vi Shift bypass snap hiện tại.
- Ghost preview trên canvas khi chưa thả cuối (SVG.js preview như các component đặt khác).
- Mọi statement sinh ra đi qua `DocumentController.upsertFromCanvas`.

#### 3.5.2 Split path & Merge path

- **Split**: context menu trên `PathComponent` đang chọn → "Split at vertex" → component cũ bị thay bởi 2 `WireComponent` mới; document splice = remove statement cũ + insert 2 statement mới (dòng dưới giữ nguyên).
- **Merge**: khi bắt đầu vẽ wire snapped vào **endpoint cuối** của một statement `\draw` hiện có → thay vì tạo statement mới, re-emit statement cũ có thêm segment mới (tương tự `mergeSnappedDrawStatement` của TikAD). Nếu snapped vào điểm giữa/trong chân component → vẫn tạo statement mới với endpoint họ tên là `(Name.anchor)`.

#### 3.5.3 Symbolic endpoint xuyên suốt document

- Endpoint của wire trùng `SnapPoint` có `anchorName` của một component có tên → document lưu dạng `(Name.anchor)`, không dùng toa độ số.
- Thực hiện: gọi `createAnchorResolver` tại **mọi lượt** `insertStatement`/`replaceComponentLines`, không chỉ ở modal export như hiện tại.
- Lợi ích trực tiếp: kéo component `Q1` → chỉ re-emit statement của Q1; các statement khác trỏ `(Q1.B)` **không cần splice** — dây tự "bám" theo khi regenerate preview.

### 3.6 Xử lý lỗi — tổng hợp

| Tình huống | Xử lý |
|---|---|
| Parse lỗi 1 statement từ code | Statement giữ nguyên trong code; component tương ứng không tạo/xóa vội; status line editor hiển thị "line N: ..." |
| Compile lỗi | Banner lỗi (dòng `!` đầu tiên); giữ SVG compiled tốt trước đó |
| Engine không có | Fallback SVG mode + hướng dẫn tải Tectonic (badge trên nút toggle) |
| Trùng tên component sau code edit | Trùng tên khác type → remove+add; trùng tên cùng type → update |
| componentLines map lệch sau full-reparse | Map được rebuild hoàn toàn sau mỗi lần parse (id bền vững = component name) |
| Render đang chạy khi body đổi | Cancel/in-flight bỏ qua kết quả cũ (pending flag như TikAD) |

### 3.7 Kiểm thử

- Thêm **vitest** (dev dependency) + unit tests cho `tikzDocument.ts`:
  - splice giữ indent/comment; insert/remove không đụng dòng khác;
  - `setFullSource` diff tên đúng (add/update/remove/khác type);
  - routing operator inference (`--`/`-|`/`|-`) từ hai điểm;
  - trích dòng lỗi từ `compile.log`.
- Smoke test main-process renderer với spawn được mock.
- Checklist thủ công (máy có Tectonic): đặt component → sửa label trong properties → CodeMirror splice đúng dòng; sửa code → canvas cập nhật; comment tự viết giữa body còn nguyên sau ≥ 10 thao tác canvas; compile mode hiển thị đúng; kéo Q1 thì dây `(Q1.B)` bám theo; Ctrl+Z quay lại được cả thay đổi từ code.

## 4. Thay đổi file dự kiến

| Hành động | File |
|---|---|
| Thêm | `src/scripts/utils/tikzDocument.ts` |
| Thêm | `src/scripts/controllers/documentController.ts` |
| Thêm | `src/scripts/controllers/latexPreviewController.ts` |
| Thêm | `src/scripts/latex/latexRenderer.mjs` (main process) |
| Thêm | `src/scripts/preload.js` |
| Thêm | `tests/*.test.ts` (vitest) |
| Sửa | `src/scripts/main.js` (IPC, contextIsolation, preload) |
| Sửa | `src/pages/index.html` (thay `#liveCodePanel` thành container CodeMirror + toggle LaTeX mode + context-menu items) |
| Sửa | `src/scripts/controllers/`: `exportController.ts` (serialize dùng chung với `createAnchorResolver` re-usable), `mainController.ts` (hook `document-changed`, bỏ `updateLiveCode` cũ), `undoController.ts` (hook splice), `contextMenu.ts` (split/merge) |
| Sửa | `src/scripts/snapDrag/snapController.ts` và `wireComponent.ts` (routing operator, merge-extend) |
| Sửa | `src/styles/*` (panel, banner, badge) |
| Sửa | `package.json` (deps `@codemirror/state|view|...`, `@codemirror/lang-tex`; dev `vitest`) |

## 5. Định nghĩa hoàn thành (Definition of Done)

1. Panel code LaTeX chỉnh sửa được, sync ~500 ms, và comment tự viết **không mất** sau ≥ 10 thao tác canvas liên tiếp.
2. Sửa một dòng code → canvas cập nhật đúng component tương ứng; statement lỗi trong code được giữ nguyên + báo status line.
3. `latex:render` hoạt động khi máy có (Tectonic hoặc pdflatex) + (pdftocairo hoặc pdf2svg); LaTeX mode hiển thị đúng chữ; thiếu engine → fallback SVG mode êm + badge hướng dẫn.
4. Wire lệch hai trục sinh `-|`/`|-` gọn; split/merge hoạt động qua context menu và snap-extend; ký hiệu endpoint có name giữ dạng `(Name.anchor)`.
5. `npm run build` xanh; unit test vitest xanh; bản Electron chạy được với contextIsolation bật + IPC latex:render.


---

## 6. Ghi chú triển khai (2026-10-22) — khác biệt thực tế so với thiết kế

**Mô hình document:** triển khai theo **entry-based model** thay vì raw-line splice (§3):
- DocumentController giữ entries: (CodeEntry | FreeEntry)[]; code entry re-emit statement
  trực tiếp từ các component gắn vào nó (attachment map CircuitComponent → entryId, serialize
  qua SaveFileFormat.documentState với compIndices); free entry giữ văn bản user verbatim
  (comment, \\coordinate, statement không parse được) và sống sót qua mọi thao tác canvas.
- Code → canvas (pplyFullSource): parse body, dựng lại canvas; span↔component match
  KHÔNG dựa vào so khớp text re-emission mà dựa vào **statement ownership**: TikzParser
  trả về thêm ownerGroups (save objects nhóm theo statement, đúng thứ tự statement —
  nhóm rỗng = parser nhận ra nhưng không biểu diễn được, ví dụ \\coordinate);
  classifySpans() (pure, trong tikzDocument.ts) ghép span↔group 1:1 theo canonical key
  với cursor khóa theo key. Cách này giữ trật tự document qua các lần parse và không nhân
  đôi nội dung khi statement compound (nhiều bipole trong một \\draw) re-emit thành nhiều
  statement riêng.
- Comment / dòng trắng ngay phía trên một statement được giữ làm prefixLines của span →
  CodeEntry.prefix, re-emit trước statement (comment gắn vào component sống sót qua rebuild).
  Giới hạn: comment đứng CUỐI body (không có statement theo sau) sẽ rơi; prefix
  \\ctikzset{...} gộp chung statement sẽ mất phần tiền tố khi re-emit (deferred).
- Lý do: splice theo dòng phức tạp và dễ hỏng khi component có nhiều statement; entry model
  đạt cùng DoD với độ phức tạp thấp hơn.

**Pipeline compile (đã verify end-to-end trên máy có pdflatex + pdftocairo):**
- pdflatex + \typeout{CTDBBOX|...} probe hoạt động; bbox trích được dạng ...pt.
- pdftocairo SVG **không có** matrix(1 0 0 -1) toàn cục: viewBox = MediaBox (content +
  standalone margins), mỗi path có per-path matrix (s, 0, 0, -s, cx, cy) với s≈0.9895.
  Mapping đã verify bằng số liệu thật: world(0,0)→canvas(0.10,0.09)px, world(2cm,0)→
  canvas(75.69px) so với target (0,0)/(75.59px) — sai < 0.15px.
- Công thức căn: marginX=(mediaW−(picMaxX−picMinX))/2; u0=marginX−picMinX;
  marginY=(mediaH−(picMaxY−picMinY))/2; v0=marginY+picMaxY;
  scale = (4800/127)/28.3465 / s0 (s0 đo runtime từ path đầu tiên).

**Đã có sẵn, chỉ nối dây:** auto routing -|/|- (WireDirection.HV/VH), Shift ép thẳng,
symbolic endpoint (Q1.B) qua createAnchorResolver.

**Hoãn / bỏ:** render-server web fallback (chỉ check client-side); merge/extend wire vào
statement có sẵn (entry model không cần); parser cho standalone \node ... at (bug có sẵn,
ngoài scope).

**Parser bug đã sửa:** \ctikzset{...} không có ; làm statement phía sau bị dropped —
tách prefix \ctikzset rồi dispatch phần còn lại (parseSingleStatement).
