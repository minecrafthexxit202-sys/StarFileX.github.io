# ★ STAR FILE X ★
### Nền Tảng Chia Sẻ Tệp Ẩn Danh, Tuyệt Mật & Tự Động Xóa Dấu Vết

**Star File X** được thiết kế dựa trên triết lý bảo mật và quyền riêng tư tối thượng:
- **Star**: Đại diện cho sự khởi đầu, kết nối ánh sao giữa các thiết bị.
- **File**: Chia sẻ tệp trực tiếp giữa người với người (P2P / RAM streaming).
- **X**: Ẩn danh tuyệt đối, an toàn, không để lại bất kỳ dấu vết hay rò rỉ thông tin cá nhân / IP.

---

## 🛡️ Đặc Tính Bảo Mật Cốt Lõi

1. **Hoạt Động Hoàn Hảo Trên Tab Ẩn Danh (Incognito Mode)**:
   - Tương thích 100% với Chrome, Cốc Cốc, Opera, Edge, Firefox, Samsung Internet.
   - Không bắt buộc đăng nhập tài khoản.
   - Không lưu trữ vào `localStorage` hay `IndexedDB` dài hạn, loại bỏ triệt để dấu vết duyệt web.

2. **Không Lưu Vết Trên Máy Chủ (Zero-Log & In-Memory Only)**:
   - Server Node.js hoàn toàn vô hiệu hóa việc ghi log địa chỉ IP, User-Agent và lịch sử truy cập.
   - Không sử dụng Database. Toàn bộ phiên chỉ tồn tại tạm thời trong RAM của máy chủ và tự hủy ngay khi truyền xong hoặc hết hạn.
   - Tệp tin không bao giờ được ghi xuống ổ cứng của máy chủ.

3. **Quy Trình Handshake 2 Lớp Bằng Mã 9 Chữ Số**:
   - **Mã Gửi Tệp (9 số)**: Có hiệu lực ban đầu trong **15 phút**. Cho phép gửi đồng thời tới **1 đến 5 người nhận**.
   - **Mã Xác Minh Tạm Thời Bên Nhận (9 số)**: Tự động sinh ngẫu nhiên khi người nhận mở trang. Mã này độc nhất theo phiên và **tự động biến mất vĩnh viễn khi đóng tab hoặc tải lại trang**.
   - Khi người nhận nhập mã gửi và bấm **"Tiếp tục nhận"**:
     - Mã xác minh 9 số của bên nhận sẽ được gửi tới màn hình bên gửi.
     - Thời gian hiệu lực của phiên được **tự động gia hạn thêm 3 phút (tổng cộng 18 phút)**.
     - Người gửi chủ động bấm **"Chấp nhận"** để truyền tệp, ngăn ngừa tuyệt đối trường hợp người lạ tình cờ đoán trúng mã.

4. **Tẩy Siêu Dữ Liệu Nguồn (Metadata / EXIF Stripping)**:
   - Khi nhận tệp, hệ thống tự động lọc sạch các phân đoạn dữ liệu nhạy cảm (như EXIF, vị trí GPS, thông tin máy ảnh, định danh thiết bị nguồn). Người nhận tải về file nguyên vẹn nội dung nhưng hoàn toàn sạch dấu vết nguồn gốc.

5. **Hỗ Trợ Đa Thiết Bị & Nền Tảng (Android ↔ Windows)**:
   - Android gửi cho Android.
   - Android gửi cho Windows.
   - Windows gửi cho Android.
   - Windows gửi cho Windows.
   - Có tích hợp sẵn **Mã QR** để quét nhanh bằng điện thoại mà không cần gõ thủ công 9 chữ số.

---

## 🚀 Hướng Dẫn Khởi Chạy

### 1. Khởi động Máy Chủ
Mở Terminal / PowerShell tại thư mục dự án và chạy:
```bash
npm start
```

### 2. Truy cập
- **Trên máy tính Windows**: Mở trình duyệt (tab thường hoặc tab ẩn danh) vào địa chỉ:
  ```
  http://localhost:3000
  ```
- **Trên điện thoại Android (hoặc thiết bị cùng mạng Wi-Fi)**:
  - Xem địa chỉ IP mạng nội bộ hiển thị trên giao diện hoặc terminal (Ví dụ: `http://192.168.1.8:3000`).
  - Mở Chrome / Opera / Cốc Cốc trên Android và truy cập địa chỉ đó, hoặc quét mã QR hiển thị trên màn hình người gửi!

---

## 📁 Cấu Trúc Thư Mục
```
star-file-x/
├── package.json          # Cấu hình dự án & thư viện express, ws
├── server.js             # Máy chủ WebSocket tín hiệu & RAM chunk relay (Zero-Logs)
├── test_transfer.js      # Kịch bản kiểm thử tự động quy trình bắt tay 9 số
├── README.md             # Hướng dẫn chi tiết
└── public/
    ├── index.html        # Giao diện chính (Gửi, Nhận, QR modal, tiến trình)
    ├── css/
    │   └── style.css     # Giao diện Cyber Space Dark, hiệu ứng vũ trụ bí ẩn
    └── js/
        ├── stars.js      # Hiệu ứng chòm sao chuyển động Canvas
        ├── qrcode.min.js # Bộ sinh mã QR nội bộ offline
        ├── transfer.js   # Bộ điều phối P2P/RAM chunk & metadata stripping
        └── app.js        # Điều khiển tương tác UI và định dạng mã 9 số
```
