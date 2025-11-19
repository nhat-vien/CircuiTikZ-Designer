# Hướng Dẫn Test Component Cung Mũi Tên (Arc Arrow)

## ✅ Các thay đổi đã hoàn tất

### 1. **Export Image Button - ĐÃ XÓA KHỎI TOOLBAR**
- File: `src/pages/index.html`
- Nút Export Image đã được comment out hoàn toàn
- ✅ Không còn hiển thị trên toolbar

### 2. **Icon Cung Mũi Tên - ĐÃ CẢI THIỆN**
- Icon mới: Cung ellipse 3/4 với mũi tên rõ ràng
- Tỷ lệ ellipse: 7x5.5 (rõ ràng hơn circle)
- Mũi tên stroke thay vì fill (sắc nét hơn)

### 3. **Component Vẽ Cung - ĐÃ SỬA LẠI HOÀN TOÀN**
- **Kế thừa từ ShapeComponent** thay vì PathComponent
- **Cách vẽ giống Ellipse**: Click điểm 1 → Di chuột → Click điểm 2
- Vẽ cung ellipse 3/4 (270°) qua 2 điểm đã chọn
- Mũi tên mặc định theo chiều kim đồng hồ
- Có thể flip để đổi chiều

## 🎯 Cách Test

### Bước 1: Mở ứng dụng
```
http://localhost:1234
```

### Bước 2: Hard Refresh
- Windows: `Ctrl + Shift + R` hoặc `Ctrl + F5`
- Mac: `Cmd + Shift + R`

### Bước 3: Kiểm tra Toolbar
✅ Nút "Export Image" không còn trên toolbar

### Bước 4: Mở Menu Add Component
- Click nút "+" (Add Component)
- Mở phần "Basic"
- Tìm icon cung ellipse với mũi tên

### Bước 5: Vẽ Cung Mũi Tên
1. Click vào icon "Arc Arrow (AC Current)"
2. Click điểm đầu tiên trên canvas
3. Di chuột để xem preview
4. Click điểm thứ hai để hoàn tất
5. Cung ellipse 3/4 với mũi tên sẽ xuất hiện

### Bước 6: Thao tác với Component
- **Flip ngang** (Shift + X): Đổi chiều mũi tên
- **Flip dọc** (Shift + Y): Đổi chiều mũi tên
- **Rotate** (Ctrl/Cmd + R): Xoay component
- **Resize**: Click vào component → Kéo các điểm resize

## 📝 Chi tiết kỹ thuật

### Cách vẽ
- Component kế thừa từ `ShapeComponent`
- Sử dụng logic vẽ giống `EllipseComponent`
- 2 điểm click tạo thành hình chữ nhật bao quanh ellipse
- Cung vẽ 3/4 ellipse (270°) từ dưới lên trái

### Công thức ellipse
```typescript
rx = width / 2   // Bán kính ngang
ry = height / 2  // Bán kính dọc
startAngle = 90°  // Bắt đầu từ dưới
endAngle = -180°  // Kết thúc ở bên trái (270° clockwise)
```

### Export TikZ
```latex
\draw[-{Stealth[length=2mm]}] (x,y) ++(90:rx and ry) arc (90:-180:rx and ry);
```

## 🐛 Troubleshooting

### Icon không hiển thị
- Hard refresh browser (Ctrl+Shift+R)
- Xóa cache browser
- Kiểm tra Console (F12) xem có lỗi không

### Không vẽ được
- Đảm bảo đã click vào icon Arc Arrow
- Click 2 điểm khác nhau (không trùng nhau)
- Kiểm tra mode đang ở COMPONENT mode

### Cung không đẹp
- Thử vẽ với 2 điểm cách xa hơn
- Tỷ lệ ellipse tự động tính theo khoảng cách 2 điểm
- Có thể resize sau khi vẽ xong

## 📂 Files đã thay đổi

1. `src/pages/index.html` - Comment out Export Image button
2. `src/scripts/components/arcArrowComponent.ts` - Viết lại hoàn toàn (kế thừa ShapeComponent)
3. `src/scripts/controllers/mainController.ts` - Icon mới đẹp hơn
4. `src/scripts/internal.ts` - Export component

## ✨ Tính năng

- ✅ Vẽ cung ellipse 3/4 với mũi tên
- ✅ Mũi tên theo chiều kim đồng hồ (mặc định)
- ✅ Flip để đổi chiều
- ✅ Resize được
- ✅ Rotate được
- ✅ Export sang TikZ với arrow style
- ✅ Snap points ở các góc và cạnh
- ✅ Icon rõ ràng trong menu

---

**Server đang chạy tại:** http://localhost:1234

**Nhớ hard refresh để thấy thay đổi!**
