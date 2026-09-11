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
  * Click nút **"Raw Markdown"** trên thanh công cụ hoặc icon trên thanh tiêu đề để chuyển về Monaco Editor truyền thống.
  * Bấm nút **"Open in Live View"** để quay trở lại TipTap bất kỳ lúc nào mà không lo mất dữ liệu hay xung đột buffer.
* **Bộ đếm Từ & Ký tự Trực tiếp**:
  * Tự động tính toán số từ và tổng số ký tự theo thời gian thực trên thanh công cụ.
* **Khởi Tạo Tác Phẩm Tự Động (Project Wizard)**:
  * Lệnh `Novellized: ✨ Create New Novel Project...` giúp nhà văn thiết lập cấu trúc tác phẩm chỉ sau 4 câu hỏi.
  * Tự động sinh sẵn hồ sơ nhân vật, bối cảnh thế giới và dàn ý 3 Hồi.
* **Cấu trúc Thư mục Chuẩn Tác phẩm Tối ưu cho AI Agent**:
  ```text
  [Tên_Tác_Phẩm]/
  ├── part_01/
  │   └── chapter_01/
  │       ├── scene_01.md            <-- Cảnh mở đầu
  │       └── scene_02.md
  ├── docs/                          <-- Tài liệu bối cảnh (Người và AI cùng đọc/viết)
  │   ├── characters.md              <-- Hồ sơ nhân vật (Tâm lý, ngoại hình, động lực)
  │   ├── worldbuilding.md           <-- Bản đồ thế giới, quy luật, bối cảnh
  │   └── outline.md                 <-- Dàn ý cốt truyện (Cấu trúc 3 Hồi)
  └── .novel/                        <-- Chỉ dẫn kỹ thuật & Cấu hình cho AI
      ├── project.json               <-- Tên tác phẩm, tác giả, mục tiêu số từ, ngày tạo
      └── ai_rules.json              <-- System instructions cho AI (Ngôi kể, Tone & Voice, cấm kỵ)
  ```

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
2. Bấm phím **`F5`** (hoặc vào tab Run & Debug chọn **"Launch Novellized (Extension)"**).
3. Một cửa sổ **Extension Development Host** sẽ tự động mở ra.
4. Bấm `Ctrl+Shift+P` và chọn **"Novellized: ✨ Create New Novel Project..."** (hoặc bấm nút trên thanh File Explorer) để bắt đầu!

