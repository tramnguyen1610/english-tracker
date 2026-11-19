# Tự học tiếng Anh (IELTS + TOEIC)

Web theo dõi tiến độ tự học, HTML/CSS/JS thuần, không cần backend.

## Mở
- Bấm đúp `index.html` (Chrome, Edge, Firefox đều được).
- Dữ liệu lưu trong trình duyệt (localStorage). Mở bằng trình duyệt khác hoặc đưa lên web là một kho dữ liệu khác, nên hãy dùng **Cài đặt → Xuất file JSON** để sao lưu và **Nhập file JSON** để chuyển dữ liệu.

## Đưa lên GitHub Pages
1. Tạo repo mới trên GitHub, đẩy toàn bộ thư mục này lên (có `index.html` ở gốc).
2. Repo → Settings → Pages → Source: *Deploy from a branch*, chọn nhánh `main`, thư mục `/ (root)`.
3. Vài phút sau web có ở `https://<tên-tài-khoản>.github.io/<tên-repo>/`.

## Sửa thời khóa biểu
Sửa file CSV "Thời khóa biểu" rồi chạy:

```
node tools/build-schedule.js
```

Script sẽ sinh lại `data/schedule.js` (đã tự sửa lỗi đảo ô 20:00 Thứ 4 / Thứ 6 và gắn link trang con của từng app).

## Thử ở thời điểm khác
Thêm `?now=` vào địa chỉ, ví dụ `index.html?now=2026-11-21T10:15`, để xem trang Hôm nay như vào giờ đó.
