# Hướng dẫn Debug vấn đề Current Arrow

## Vấn đề báo cáo:
1. ✅ Hiển thị tên dòng điện (label)
2. ❌ Khoảng cách nhãn rất xa với linh kiện mặc dù distance = 0
3. ❌ Không hiển thị mũi tên chiều dòng điện

## Các bước kiểm tra:

### Bước 1: Kiểm tra trong Browser Console
1. Mở http://localhost:43523
2. Nhấn F12 để mở Developer Tools
3. Chọn tab Console
4. Thêm một resistor và current label
5. Kiểm tra xem có lỗi JavaScript nào không

### Bước 2: Kiểm tra SVG Elements
1. Trong Developer Tools, chọn tab Elements/Inspector
2. Tìm element có class hoặc id liên quan đến current arrow
3. Kiểm tra xem có element `<use xlink:href="#currarrow">` không
4. Kiểm tra transform của element đó

### Bước 3: Kiểm tra giá trị properties
Thêm code debug vào `generateCurrentArrow`:

```typescript
protected generateCurrentArrow(...) {
    console.log("=== DEBUG Current Arrow ===");
    console.log("distance:", distance);
    console.log("arrowThickness:", arrowThickness);
    console.log("arrowShift:", arrowShift);
    console.log("arrowScale:", arrowScale);
    console.log("arrowPos:", arrowPos);
    console.log("labPos:", labPos);
    // ... rest of code
}
```

### Bước 4: Kiểm tra symbol currarrow
1. Trong Elements tab, tìm `<symbol id="currarrow">`
2. Đảm bảo nó tồn tại trong `<defs>`
3. Path should be: `M0 0 1.7.8 0 1.6Z`

### Bước 5: Kiểm tra transform matrix
Mũi tên có thể bị scale quá nhỏ hoặc translate ra ngoài viewport.

Kiểm tra giá trị:
- `arrowScale` - nên là số dương (ví dụ: 5-20)
- `arrowPos` - nên nằm trong khoảng tọa độ của component
- `arrowTipTransform` - matrix transform

## Các nguyên nhân có thể:

### Nguyên nhân 1: arrowScale quá nhỏ
Nếu `arrowScale` < 1, mũi tên sẽ rất nhỏ và không nhìn thấy.

**Giải pháp**: Tăng giá trị mặc định của `arrowThickness` hoặc điều chỉnh công thức tính `arrowScale`.

### Nguyên nhân 2: Symbol không được load
Nếu `<symbol id="currarrow">` không tồn tại, `use` element sẽ không hiển thị gì.

**Giải pháp**: Kiểm tra file `src/pages/canvas.svg` có chứa symbol không.

### Nguyên nhân 3: Transform sai
Matrix transform có thể đặt mũi tên ở vị trí sai hoặc scale = 0.

**Giải pháp**: Kiểm tra các giá trị trong `arrowTipTransform`.

### Nguyên nhân 4: Fill color
Mũi tên có thể có fill="none" hoặc fill="transparent".

**Giải pháp**: Đảm bảo `.fill(defaultStroke)` được gọi.

### Nguyên nhân 5: Distance calculation sai
Nếu `distance = 0` nhưng vẫn xa, có thể do:
- `interpolate()` function sai
- `compStart` hoặc `compEnd` tính sai
- `northwestDelta` hoặc `southeastDelta` sai

## Quick Fix để test:

### Fix 1: Tăng arrow thickness mặc định
Trong constructor, thay đổi:
```typescript
new SVG.Number(1.0, "")  // old
new SVG.Number(2.0, "")  // new - thử tăng lên 2.0
```

### Fix 2: Thêm console.log
Thêm vào đầu `generateCurrentArrow`:
```typescript
console.log("Current Arrow Debug:", {
    distance,
    arrowThickness,
    arrowShift,
    start,
    end,
    arrowScale,
    arrowPos,
    labPos
});
```

### Fix 3: Kiểm tra symbol
Trong browser console:
```javascript
document.querySelector('#currarrow')
// Should return the symbol element
```

### Fix 4: Kiểm tra use elements
```javascript
document.querySelectorAll('use[href="#currarrow"]')
// Should return array of use elements
```

## Thông tin bổ sung:

### Constants được sử dụng:
```typescript
const arrowStrokeWidth = 0.5
const currentArrowScale = 16
const defaultRlen = 1.4
const cmtopx = 4800 / 127  // ≈ 37.8
```

### Công thức tính arrowScale:
```typescript
const arrowScale = ((cmtopx * defaultRlen) / (currentArrowScale / scaleFactor) + 2 * arrowStrokeWidth) * arrowThickness
```

Với giá trị mặc định:
- cmtopx ≈ 37.8
- defaultRlen = 1.4
- currentArrowScale = 16
- scaleFactor = 1 (thường)
- arrowStrokeWidth = 0.5
- arrowThickness = 1.0

→ arrowScale ≈ ((37.8 * 1.4) / 16 + 2 * 0.5) * 1.0 ≈ 4.3

### Transform matrix:
```typescript
{
    translate: [-0.85, -0.8],  // Center the arrow
    scale: arrowScale,          // Scale to correct size
    rotate: (180 * arrowAngle) / Math.PI,  // Rotate to correct direction
    translate: arrowPos         // Move to correct position
}
```

## Các bước tiếp theo:

1. **Reload trang**: Nhấn Ctrl+Shift+R để hard reload
2. **Clear cache**: Xóa cache của browser
3. **Kiểm tra console**: Xem có lỗi JavaScript không
4. **Thêm debug logs**: Thêm console.log vào code
5. **Kiểm tra SVG**: Xem elements trong DOM
6. **Test với giá trị khác**: Thử thickness = 3.0, shift = 0.5

## Liên hệ:
Nếu vẫn không giải quyết được, cung cấp:
1. Screenshot của vấn đề
2. Console errors (nếu có)
3. SVG elements trong DOM (copy HTML)
4. Giá trị của các biến debug

