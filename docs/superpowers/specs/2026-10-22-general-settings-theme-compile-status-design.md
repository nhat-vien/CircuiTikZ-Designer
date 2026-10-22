# Spec: Đồng nhất màu General Settings theo Symbols + tín hiệu khi compile LaTeX

- Ngày: 2026-10-22
- Trạng thái: Đã duyệt bằng hội thoại (chưa implement)
- Phạm vi: giao diện (CSS + `LaTeXPreviewController`), không đổi pipeline compile

## 1. Mục tiêu

Hai việc, dùng chung một bảng màu:

1. **Đồng nhất theme**: panel General Settings (cột Properties) đang dùng màu bão hoà
   (xanh đặc `btn-primary`, đỏ `btn-outline-danger`, khối `bg-info-subtle`) trong khi panel
   Symbols dùng ngôn ngữ trung tính (trắng/đen nhạt + light-blue nhấn khi hover). Chuyển
   General Settings **theo** Symbols, không ngược lại.
2. **Tín hiệu compile**: hiện khi bấm nút LaTeX không có phản hồi nào về trạng thái
   (chỉ bật/tắt bằng class `disabled`/`selected`), nên người dùng không phân biệt được
   "đang compile", "xong", "lỗi", hay "server cold-start đang treo". Thêm badge/spinner
   ngay trên nút, và làm lỗi hiển thị đầy đủ hơn.

Động lực thực tế: lỗi `File 'siunitx.sty' not found` trên render server chỉ hiện qua một
banner đỏ bị cắt 140 ký tự, các lỗi còn lại trong `errors[]` bị bỏ.

## 2. Hiện trạng (ràng buộc)

### 2.1 Bảng màu

- Token app định nghĩa tại `src/styles/styles.scss:14-66`: `--primary`, `--primary-light`,
  `--success`, `--danger`, `--warning`, `--bg-app`, `--bg-panel`, `--bg-editor`,
  `--text-main`, `--text-muted`, `--border-color`, `--border-focus`, `--shadow-*`.
  Theme bật/tắt bằng `data-bs-theme` trên `<html>` (`mainController.ts:132-138, 239-249`).
- Bootstrap preset `$primary/$danger/$success/$warning` tại `styles.scss:7-11` — **không đổi**
  (đổi ở đây ảnh hưởng toàn app).
- Ngôn ngữ của Symbols (`src/styles/symbolDB.scss`): item `--bg-app` + viền `--border-color`
  + chữ `--text-main`; accent `--primary-light` + `--primary` **chỉ** ở hover/open
  (`div.libComponent:hover` dòng 130-140, `.accordion-button:not(.collapsed)` dòng 83-86).
- General Settings: `#view-properties` (`src/pages/index.html:404-475`) + các block sinh bởi
  JS (`propertiesController.ts:342-364`, `latexPreviewController.ts:322-373`) — tất cả nằm
  trong `#properties-content`, vốn đã được scope hoá trong `src/styles/properties.scss`.

### 2.2 Luồng compile (`src/scripts/controllers/latexPreviewController.ts`)

- Bấm nút: `toggle()` dòng 139-154. Auto: event `document-changed` dòng 80-82 → `scheduleRender()`
  debounce 400ms (dòng 172-175), coalescing `inFlight`/`pending` (dòng 179-182, 221-224),
  bỏ trùng theo `cacheKey` (dòng 186).
- `doRender()` dòng 177-226: Electron bridge hoặc `POST ${url}/compile` (dòng 201-206,
  **không có timeout/AbortController**), thành công → `project()` + `hideBanner()`, lỗi →
  `showBanner(reply.error ?? errors[0] ?? "compilation failed")` (dòng 214).
- `showBanner()` dòng 308-312: cắt 140 ký tự; `errors[1..]`, `compileWarnings` và `error` đầy đủ
  **không** được đưa ra UI. Preview tốt gần nhất được giữ khi lỗi (dòng 215).
- Server: timeout compile 90s (`src/scripts/latex/latexCompileCore.js:25`, áp dụng ở dòng
  122/124), tràn
  concurrency → `"renderer busy"` (dòng 109-111). Render.com free plan cold-start ~60s
  (`docs/latex-render-server.md`).

### 2.3 Pattern UI đã có sẵn để dùng lại

- Badge có auto-revert: `documentController.ts:357-377` (`setBadge(text, class)` + `#liveCodeDocBadge`).
- Spinner: `#loadingSpinner` `.spinner-border` (`index.html:389-393`).
- Text status dạng "Probing…": `latexPreviewController.ts:354-364`.

## 3. Thiết kế

### 3.1 Token trạng thái mới (`src/styles/styles.scss`)

Chỉ dùng cho **trạng thái** (không dùng cho nút/decoration). Bản nhạt, bão hoà thấp, cùng
tinh thần `--primary-light`:

```
:root {
  --state-ok:     hsl(142, 45%, 32%);   --state-ok-bg:  hsl(142, 60%, 95%);
  --state-err:    hsl(350, 65%, 42%);   --state-err-bg: hsl(350, 80%, 96%);
}
[data-bs-theme="dark"] {
  --state-ok:     hsl(142, 50%, 70%);   --state-ok-bg:  hsl(142, 40%, 14%);
  --state-err:    hsl(350, 70%, 72%);   --state-err-bg: hsl(350, 45%, 18%);
}
```

### 3.2 General Settings theo Symbols

Mechanism: **override CSS scoped** trong `src/styles/properties.scss` (theo đúng pattern file
này đang dùng, selector gốc `#properties-content`). Không sửa markup, nên các block sinh bằng
JS (env vars, LaTeX render server) tự được phủ.

| Element | Hiện tại | Sau |
| --- | --- | --- |
| `#resetViewButton`, `#fitViewButton` | `btn-primary` (xanh đặc) | nền `--bg-app`, viền `--border-color`, chữ `--text-main`; hover/focus: `--primary-light` + `--primary` |
| `#centerOriginViewButton`, nút Save của render server | `btn-outline-primary` | như trên (bỏ fill xanh, giữ nguyên padding/radius 8px) |
| `#clearCanvasViewButton` | `btn-outline-danger` đỏ | mặc định trung tính; **chỉ hover**: viền + chữ `--state-err`, nền `--state-err-bg` |
| Hộp "Current grid spacing" (`index.html:471-475`) | `bg-info-subtle text-info-emphasis border-info-subtle` | card Symbols (`--bg-app` + `--border-color` + `--text-main`); giá trị `#gridInfo` mono `--primary` như chip `#majorLabel` (`properties.scss:67-75`) |
| `#latexServerStatus` | chữ thường, không màu | chấm tròn 8px prefix: `--primary` (Probing) / `--state-ok` (available) / `--state-err` (lỗi) |
| `.latex-preview-error` (`styles.scss:148-149`) | `--bs-danger-bg-subtle` / `--bs-danger-emphasis` | `--state-err-bg` + `--state-err` |

Không đổi: `.form-check-input:checked` (đã là `--primary`), `.form-range`, `.form-control`,
`#liveCodeDocBadge`, các nút trong document panel — chúng nằm ngoài `#properties-content`.

### 3.3 Trạng thái compile trên nút LaTeX

Controller giữ thêm `phase: "idle" | "compiling" | "ok" | "error"` và `manualCompile: boolean`
(`true` khi `doRender` được khởi phát từ `toggle()`, `false` khi từ `document-changed`).

| phase | Manual (bấm nút) | Auto (document changed) |
| --- | --- | --- |
| compiling | icon `auto_awesome` → `.spinner-border.spinner-border-sm`, badge `3s` đếm giây thật (interval 1000ms) | không spinner, không đổi chữ; class `.is-compiling` = viền `--primary` + nền `--primary-light` |
| ok | badge `ok · 1.2s` (`--state-ok`/`--state-ok-bg`), tự revert sau 4s; banner ẩn | im lặng (không badge) |
| error | badge `error` (`--state-err`/`--state-err-bg`) **giữ nguyên** tới lần compile thành công kế tiếp + banner | badge `error` + banner (lỗi thì phải thấy dù tự động) |

- **Timeout client**: `AbortController` signal **150s** cho `POST /compile` (lớn hơn timeout
  90s của engine, đủ cho cold-start). `AbortError` → banner
  `render server did not respond in 150s (cold start? retry)`.
- **Nội dung lỗi**: bỏ cắt 140 → cắt 300 ký tự; nếu `errors.length > 1` nối ` (+N)`; đặt
  `errorBanner.title` = toàn bộ `errors.join("\n")` (hover để xem đầy đủ). Vẫn giữ preview tốt
  gần nhất khi lỗi.
- **Busy/unreachable**: `"renderer busy"` và các message của `probeServer()` đi cùng nhánh
  error, không có state riêng.
- Thứ tự DOM nút: giữ nguyên markup `index.html:362-365`, controller thêm/bớt child element
  (`span#latexBtnStatus`) và class — không sửa HTML.

### 3.4 Đơn vị thuần để test

Extract khỏi controller:

```ts
export interface CompileStatusInput {
  phase: "idle" | "compiling" | "ok" | "error"
  manual: boolean
  elapsedMs: number
  errors: string[]
}
export function describeCompileStatus(i: CompileStatusInput): {
  spinner: boolean
  label: string            // "" | "3s" | "ok · 1.2s" | "error"
  buttonClasses: string[]  // [] | ["is-compiling"]
  badgeClasses: string[]   // ["latex-status-ok"] | ["latex-status-error"]
  bannerText: string | null
}
export function formatElapsed(ms: number): string // <1000 → "820ms", ≥1000 → "1.2s"
```

## 4. Xử lý lỗi / edge case

- `this.button` null (chưa mount) → mọi thao tác state là no-op (đã dùng `?.`).
- Compile thủ công liên tiếp: `pending` coalesging giữ nguyên; badge không được để 2 interval
  đếm giây cùng chạy → luôn `clearInterval` khi rời phase `compiling`.
- Người dùng tắt preview (`toggle()` off) khi đang compile: huỷ hiệu ứng, ẩn banner, xoá badge
  (kết quả đến sau đó bị bỏ vì `this.active === false` ở `doRender` đầu hàm).
- Electron bridge không timeout: cùng dùng `describeCompileStatus`, nhưng không đặt
  `AbortController` (compile local nhanh); phase `compiling` vẫn hiện spinner tới khi bridge trả.

## 5. Test

- Mới: `tests/latexPreviewStatus.test.ts` (vitest, dùng `tests/setup.ts` hiện có) — unit test
  `describeCompileStatus` cho 6 case: compiling-manual, compiling-auto, ok-manual, ok-auto,
  error-1, error-many; và `formatElapsed` (0.8s / 1.2s / 12s).
- Không thêm test DOM-heavy cho `project()` (giữ nguyên như hiện tại).
- Verify thủ công: `npm start`, chuyển light ↔ dark, mở Symbols cạnh General Settings để so;
  đặt `\usepackage{nosuchpkg}` vào preamble để xem badge `error` + banner + tooltip `title`;
  dùng render server thật để xem đếm giây lúc cold-start.

## 6. Ngoài phạm vi (YAGNI)

- Không remap `$primary/$danger/$success` toàn cục, không đổi màu cột Properties khi chọn linh
  kiện, không đổi toast/modal/menu.
- Không overlay phủ mờ khung preview, không progress bar phần trăm, không âm thanh.
- Không đổi debounce 400ms, không đổi concurrency cap của server, không đổi SVG projection.
