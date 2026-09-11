# Novellized Prose Editor

Trình soạn thảo trực tiếp (WYSIWYG Live Markdown Editor) dành riêng cho tác giả, nhà văn và biên kịch trên nền tảng VS Code / VSCodium.

---

## Tính năng Nổi bật

* **Soạn thảo trực tiếp (Live View)**: 
  * Tích hợp khối động cơ **TipTap (ProseMirror)**, gõ Markdown đến đâu tự động hiển thị dạng trang sách in đến đó mà không làm hỏng cú pháp gốc.
  * Hỗ trợ gõ nhanh Input Rules: gõ `# `, `## `, `**chữ**`, `*nghiêng*`, `> trích dẫn`, `---` phân cảnh tự động biến đổi tức thì.
* **Typography Văn học Chuẩn xác**:
  * Font stack tối ưu cho việc đọc và viết truyện:
    ```css
    font-family: 'Lora', 'Merriweather', 'Book Antiqua', 'Times New Roman', 'Liberation Sans', serif;
    ```
  * Thụt đầu dòng đoạn văn tự động (`text-indent: 1.8rem`), giãn dòng thông thoáng (`line-height: 1.85`), căn lề đẹp mắt, giới hạn độ rộng đọc dễ chịu cho mắt.
* **Hoán đổi Chế độ Xem Tức thì (Dual Engine)**:
  * Click nút **"Markdown Thô"** trên thanh công cụ hoặc icon trên thanh tiêu đề để chuyển về Monaco Editor truyền thống.
  * Bấm nút **"Chế độ Soạn thảo Trực tiếp"** để quay trở lại TipTap bất kỳ lúc nào mà không lo mất dữ liệu hay xung đột buffer.
* **Bộ đếm Từ & Ký tự Trực tiếp**:
  * Tự động tính toán số từ tiếng Việt và tổng số ký tự theo thời gian thực trên thanh công cụ.
* **Cấu trúc Thư mục Chuẩn Tác phẩm cho AI Agent**:
  * Thư mục cấp 1: `01_Hoi_1_...`
  * Thư mục cấp 2: `Chuong_01_...`
  * File `.md`: `01_canh_...md`
  * Thư mục ẩn `.novel/`: Chứa `characters.json` lưu trữ hồ sơ nhân vật và bối cảnh để AI Agent hỗ trợ rà soát mạch truyện.

---

## Hướng dẫn Chạy Thử và Phát triển

### 1. Cài đặt Dependencies
```bash
npm.cmd install
```

### 2. Build Extension
```bash
npm.cmd run build
```

Hoặc chạy chế độ theo dõi thay đổi (Watch Mode):
```bash
npm.cmd run watch
```

### 3. Debug trên VS Code / VSCodium
1. Mở thư mục `new-vscode` trong VS Code hoặc VSCodium.
2. Bấm phím `F5` (hoặc vào tab Run & Debug chọn **"Chạy Thử Novellized (Extension)"**).
3. Một cửa sổ **Extension Development Host** sẽ tự động mở ra cùng thư mục mẫu `sample-novel`.
4. Nhấp chuột vào file `01_canh_quan_tro.md` để trải nghiệm!

