<div align="center">
  <img src="resources/icon.png" width="96" height="96" alt="Novellized Logo" />
  <h1>Novellized Prose Editor</h1>
  <p><strong>Không Gian Soạn Thảo Tiểu Thuyết WYSIWYG Chuẩn Trang Sách, Tập Trung Tuyệt Đối trên VS Code & VSCodium</strong></p>

  <p>
    <a href="https://github.com/novellized/novellized-editor/actions"><img src="https://img.shields.io/github/actions/workflow/status/novellized/novellized-editor/ci.yml?branch=master&label=CI%20Build&logo=github&style=flat-square" alt="CI Build"></a>
    <a href="https://github.com/novellized/novellized-editor/releases"><img src="https://img.shields.io/github/package-json/v/novellized/novellized-editor?style=flat-square&logo=git" alt="Phiên bản phát hành"></a>
    <a href="https://marketplace.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%5E1.80.0-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white" alt="Phiên bản VS Code"></a>
    <a href="test/"><img src="https://img.shields.io/badge/tests-7%2F7%20passing-brightgreen?style=flat-square&logo=node.js&logoColor=white" alt="Kiểm thử tự động"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="Giấy phép"></a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Engine-TipTap%20%2F%20ProseMirror-000000?style=flat-square&logo=markdown&logoColor=white" alt="ProseMirror TipTap Engine">
    <img src="https://img.shields.io/badge/Format-CommonMark%20%2F%20GFM-6e5494?style=flat-square&logo=markdown&logoColor=white" alt="CommonMark GFM">
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Đa nền tảng">
    <a href="https://github.com/novellized/novellized-editor/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="Hoan nghênh đóng góp"></a>
  </p>

  <p>
    <a href="#-tại-sao-nên-dùng-novellized">Tại sao là Novellized?</a> •
    <a href="#-tính-năng-nổi-bật">Tính năng</a> •
    <a href="#-cấu-trúc-tác-phẩm">Cấu trúc Dự án</a> •
    <a href="#-phím-tắt-tiện-dụng">Phím tắt</a> •
    <a href="#-danh-sách-lệnh">Lệnh thao tác</a> •
    <a href="#-hướng-dẫn-cài-đặt--phát-triển">Cài đặt & Phát triển</a> •
    <a href="README.md">English</a>
  </p>
</div>

---

## 📖 Tại sao nên dùng Novellized?

Hầu hết các trình biên tập Markdown hiện nay đều được thiết kế cho lập trình viên và tài liệu kỹ thuật, buộc nhà văn phải nhìn vào cú pháp thô (`#`, `**`, `*`, `>`), font chữ đơn cách (monospace) và các thanh panel rối mắt. Ngược lại, các phần mềm chuyên viết truyện đóng kín (như Scrivener, Ulysses) lại dùng định dạng dữ liệu độc quyền, khiến tác giả bị khóa chặt vào hệ sinh thái của họ.

**Novellized Prose Editor** kết hợp hoàn hảo ưu điểm của cả hai thế giới:
- **100% Thuần Markdown**: Tác phẩm của bạn luôn là các tệp `.md` độc lập, an toàn lưu trữ trên máy cá nhân, dễ dàng đồng bộ qua Git, mở trên Obsidian hay bất kỳ công cụ nào.
- **Trải Nghiệm Dàn Trang Sách In Thực Thụ**: Gõ văn bản mượt mà với thụt đầu dòng tự động, khoảng cách dòng thoáng đãng, phân cảnh hoa văn, không lộ cú pháp mã nguồn.
- **Studio Viết Truyện Đầy Đủ Công Cụ**: Cây bản thảo trực quan, bảng thẻ cảnh (corkboard), chế độ tập trung (Focus mode), cuộn máy đánh chữ (Typewriter scroll), Story Bible và đo streak viết mỗi ngày.
- **Tối Ưu Hóa Tuyệt Đối Cho AI Agent**: Trích xuất ngữ cảnh phân cảnh, hồ sơ nhân vật và luật thế giới chỉ với 1-click để đưa vào Claude, ChatGPT, Gemini hay Local LLMs.

---

## ✨ Tính Năng Nổi Bật

### 🖋️ 1. Soạn Thảo Trực Tiếp WYSIWYG Chuẩn Văn Học (TipTap & ProseMirror)
* **Hiển thị thời gian thực**: Gõ tới đâu hiển thị dạng trang sách in tới đó mà không làm thay đổi hay hỏng cú pháp Markdown gốc.
* **Quy tắc gõ thông minh (Input Rules)**:
  * `# `, `## `, `### ` cho tiêu đề Hồi, Chương và Cảnh.
  * `**đậm**`, `*nghiêng*`, `~~gạch ngang~~`, `> trích dẫn suy nghĩ`.
  * `---` tự động chuyển đổi thành ký hiệu ngắt cảnh văn học (`⁂`).
  * Em-Dash tự động: Gõ `-- ` tự biến thành gạch ngang dài (`— `).
* **Chuyển đổi 2 chế độ linh hoạt (Dual Engine)**:
  * Bấm **"Raw Markdown"** để xem và sửa mã nguồn trên Monaco Editor bất kỳ lúc nào.
  * Bấm **"Open in Live View"** để quay về TipTap tức thì, không bao giờ lo mất dữ liệu hay xung đột buffer.

### 👓 2. Công Cụ Đắm Chìm & Tập Trung Tuyệt Đối
* **Focus Mode**: Tự động làm sáng đoạn văn bạn đang viết dở và làm mờ các đoạn xung quanh, giữ tâm trí hoàn toàn vào dòng chảy câu chữ.
* **Typewriter Scrolling (Cuộn máy đánh chữ)**: Giữ dòng chữ đang gõ luôn nằm ở tầm mắt tự nhiên (~42% chiều cao màn hình).
* **Dialogue vs. Narrative Highlighter (Soi tỷ lệ thoại)**:
  * Nút **"Dialogue: ON/OFF"** trên thanh công cụ.
  * Tô màu vàng hổ phách nổi bật các câu thoại nằm trong ngoặc kép (`"..."`, `“...”`, `「...」`), giúp tác giả dễ dàng quan sát tỷ lệ giữa thoại và miêu tả để cân bằng nhịp độ truyện.
* **Zen Writing Mode**: Phím tắt `Ctrl+Alt+Z` giúp ẩn mọi thanh công cụ, mở ra không gian toàn màn hình tĩnh lặng.

### 🔍 3. Tìm Kiếm & Thay Thế Trực Quan Trong Cảnh (TipTap Native)
* **Thanh tìm kiếm nổi chuyên dụng**: Bật nhanh bằng `Ctrl+F` (Tìm) hoặc `Ctrl+H` (Tìm & Thay thế).
* **Đánh dấu thời gian thực**: Các từ khớp được highlight nổi bật trực tiếp trong văn bản.
* **Đầy đủ tính năng biên tập**:
  * Đếm số kết quả (`1/12`).
  * Phân biệt hoa thường (`Aa`).
  * Điều hướng bằng phím `Enter` (tiếp theo) / `Shift+Enter` (lùi lại).
  * Thay thế từ hiện tại hoặc **Replace All** (thay thế toàn bộ).
  * Phím `Escape` đóng nhanh thanh tìm kiếm.

### 🎨 4. Tùy Biến Typography & Giao Diện Đọc (`Aa` Popover)
* Nhấn nút **Aa** trên thanh công cụ để chỉnh nhanh:
  * **Cỡ chữ (Font Size)**: `15px`, `17px`, `18px`, `20px`, `22px`.
  * **Độ rộng trang (Width)**: Compact (`680px`), Standard (`780px`), Wide (`920px`), Full (`100%`).
  * **Giãn dòng (Line Height)**: `1.6`, `1.85`, `2.1`.
  * **Bộ font (Font Style)**: Font Serif văn học (*Lora, Merriweather, Book Antiqua*), Sans-serif hiện đại, hoặc Monospace.
* Tự động lưu thiết lập cho các phiên viết tiếp theo.

### 📑 5. Cây Bản Thảo Chuyên Nghiệp & Kéo Thả (Drag-and-Drop)
* **Thanh Activity Bar riêng biệt**: Sắp xếp thứ bậc khoa học chuẩn Scrivener:
  $$\text{Hồi (Part)} \longrightarrow \text{Chương (Chapter)} \longrightarrow \text{Phân cảnh (Scene)}$$
* **Số từ thời gian thực**: Tự động hiển thị tiêu đề và số từ của từng phân cảnh trên cây thư mục.
* **Kéo thả sắp xếp phân cảnh**: Kéo thả scene giữa các chương cực kỳ mượt mà, tự động cập nhật số thứ tự tiền tố tệp (`01_scene.md`, `02_scene.md`).
* **Thao tác nhanh**: Thêm cảnh (`+ Scene`), thêm chương (`+ Chapter`), đổi tên hoặc xóa trực tiếp.

### 📌 6. Bảng Thẻ Cảnh Trực Quan (Chapter Corkboard)
* Hiển thị toàn bộ các phân cảnh trong một chương dưới dạng các tấm thẻ index card.
* Xem nhanh tiêu đề, tóm tắt tóm lược, nhân vật góc nhìn (POV) và số từ.
* Kéo thả thẻ để sắp xếp lại nhịp độ cốt truyện một cách trực quan.

### 🌐 7. Bộ Đếm Từ Chuẩn Xác Đa Ngôn Ngữ & CJK
* Hỗ trợ đếm chính xác tiếng Latinh, **tiếng Việt có dấu** và từng ký tự tượng hình CJK (tiếng Trung, tiếng Nhật Kanji/Kana, tiếng Hàn Hangul).
* Tự động bóc tách YAML frontmatter (`--- ... ---`), chú thích HTML (`<!-- ... -->`) và khối code trước khi tính từ.
* Ước tính thời gian đọc thực tế theo tốc độ trung bình (~200 từ/phút).

### 🧠 8. Story Bible & Trích Xuất Ngữ Cảnh AI 1-Click
* **Story Bible Mô-đun hóa**: Quản lý hồ sơ nhân vật và bối cảnh thế giới theo từng tệp trong `docs/characters/` và `docs/worldbuilding/` (hoặc tệp tổng hợp).
* **Gợi ý tự động qua phím `@`**: Gõ ký tự `@` trong lúc viết để tự động gợi ý tên nhân vật và địa danh.
* **Thẻ Tooltip khi rê chuột**: Rê chuột qua tên nhân vật để xem tóm tắt thông tin nhanh.
* **Trích xuất Ngữ Cảnh AI 1-Click (`novellized.copyAiSceneContext`)**:
  * Chỉ với một cú nhấp, hệ thống sẽ gom nội dung cảnh hiện tại, hồ sơ các nhân vật xuất hiện, luật thế giới và quy tắc văn phong vào clipboard để bạn dán ngay vào Claude, ChatGPT, Gemini hay Local LLMs.

### 🎯 9. Mục Tiêu Viết, Chuỗi Ngày (Streak) & Sprint Pomodoro
* **Theo dõi mục tiêu hằng ngày**: Hiển thị trên thanh trạng thái (Status Bar):
  ```text
  $(edit) Today: +850 / 1,000 w
  ```
  Đặt mục tiêu mỗi ngày linh hoạt bằng lệnh `novellized.setDailyWordGoal`.
* **Mục tiêu tổng số từ**: Thiết lập số từ cho toàn bộ tác phẩm kèm thanh tiến độ trực quan.
* **Writing Sprint**: Bộ đếm giờ Pomodoro tăng tốc viết (`novellized.startWritingSprint`).

### 📷 10. Chụp Checkpoint Bản Thảo Tức Thì (Snapshots)
* Nhấn nút **"Snapshot"** trên thanh công cụ để lưu một bản sao lưu (checkpoint) tức thì được bảo vệ bởi Git cục bộ mà không cần phải gõ dòng lệnh nào.
* So sánh các bản thảo và hoàn tác thay đổi dễ dàng.

### 📦 11. Xuất Bản & Nhập Bản Thảo
* **Xuất sách**: Xuất toàn bộ bản thảo thành file **EPUB (`.epub`)**, **PDF (`.pdf`)**, hoặc mở trang **Xem trước Bản in (Printable HTML)**.
* **Nhập file Word**: Nhập bản thảo có sẵn từ Microsoft Word (`.docx`), tự động chia tách thành các phân cảnh Markdown gọn gàng.

---

## 📂 Cấu Trúc Dự Án Tác Phẩm Chuẩn

Khi khởi tạo tác phẩm bằng lệnh `Novellized: ✨ Create New Novel Project...`, cấu trúc thư mục tối ưu cho cả nhà văn lẫn AI sẽ được sinh ra:

```text
[Ten_Tac_Pham]/
├── part_01/                          <-- Hồi 1
│   ├── chapter_01/                   <-- Chương 1
│   │   ├── 01_scene_01.md            <-- Cảnh 1 (Mở sẵn trong Live View)
│   │   └── 02_scene_02.md
│   └── chapter_02/
│       └── 01_scene_01.md
├── docs/                             <-- Story Bible dùng chung cho Tác giả & AI
│   ├── characters/                   <-- Hồ sơ nhân vật (Tâm lý, động lực, ngoại hình)
│   │   ├── nhan_vat_chinh.md
│   │   └── nhan_vat_phu.md
│   ├── worldbuilding/                <-- Lore thế giới, hệ thống sức mạnh, bản đồ
│   │   └── he_thong_ma_phap.md
│   ├── characters.md                 <-- (Hoặc tệp nhân vật tổng hợp)
│   ├── worldbuilding.md              <-- (Hoặc tệp bối cảnh tổng hợp)
│   └── outline.md                    <-- Dàn ý cốt truyện (Cấu trúc 3 Hồi)
└── .novel/                           <-- Cấu hình tác phẩm & Chỉ dẫn cho AI
    ├── project.json                  <-- Tên sách, tác giả, mục tiêu số từ, ngày tạo
    └── ai_rules.json                 <-- Quy tắc AI: Ngôi kể, giọng văn, tone, điều cấm kỵ
```

---

## ⌨️ Phím Tắt Tiện Dụng

| Phím tắt | Hành động | Phạm vi |
| :--- | :--- | :--- |
| **`Ctrl+F`** / **`Cmd+F`** | Mở thanh Tìm kiếm trong cảnh | Live View |
| **`Ctrl+H`** / **`Cmd+H`** | Mở thanh Tìm kiếm & Thay thế | Live View |
| **`Enter`** / **`Shift+Enter`** | Chuyển đến kết quả tìm kiếm Tiếp theo / Trước đó | Thanh Tìm kiếm |
| **`Escape`** | Đóng thanh Tìm kiếm, menu Typography hoặc gợi ý `@` | Live View |
| **`Ctrl+S`** / **`Cmd+S`** | Lưu tệp cảnh hiện tại | Live View & Monaco |
| **`Ctrl+B`** / **`Cmd+B`** | In đậm vùng chọn | Live View |
| **`Ctrl+I`** / **`Cmd+I`** | In nghiêng vùng chọn | Live View |
| **`-- + Space`** | Tự động đổi thành gạch ngang dài (`— `) | Live View |
| **`@`** | Gọi danh sách gợi ý Nhân vật / Địa danh | Live View |
| **`Ctrl+Alt+Z`** | Bật / Tắt chế độ Zen toàn màn hình | Toàn cục |

---

## 🛠️ Danh Sách Lệnh (Command Palette)

Bấm **`Ctrl+Shift+P`** / **`Cmd+Shift+P`** để gọi nhanh các lệnh:

| Lệnh | Mô tả |
| :--- | :--- |
| `Novellized: ✨ Create New Novel Project...` | Wizard khởi tạo tác phẩm nhanh qua 4 câu hỏi. |
| `Novellized: Open in Live View` | Mở tệp Markdown hiện tại trong Live View chuẩn sách. |
| `Novellized: Open as Raw Markdown` | Chuyển tệp hiện tại về trình soạn Monaco mặc định. |
| `Novellized: Add New Scene...` | Tạo một phân cảnh mới trong chương hiện tại. |
| `Novellized: Add New Chapter...` | Tạo một thư mục chương mới. |
| `Novellized: Open Chapter Corkboard` | Mở bảng thẻ cảnh trực quan cho chương đã chọn. |
| `Novellized: Copy AI Scene Context & Bible Prompt` | Sao chép 1-click ngữ cảnh cảnh hiện tại + Story Bible cho AI. |
| `Novellized: Set Daily Word Target` | Đặt mục tiêu số từ viết mỗi ngày để duy trì streak. |
| `Novellized: Set Target Word Count` | Đặt mục tiêu số từ cho toàn bộ cuốn tiểu thuyết. |
| `Novellized: Start Writing Sprint / Pomodoro...` | Bắt đầu phiên sprint chạy đua với thời gian. |
| `Novellized: Take Scene Snapshot...` | Lưu một checkpoint sao lưu nhanh cho cảnh hiện tại. |
| `Novellized: Export Manuscript as EPUB (.epub)...` | Đóng gói toàn bộ bản thảo thành file sách điện tử EPUB. |
| `Novellized: Export Manuscript as PDF (.pdf)...` | Xuất bản thảo thành file PDF định dạng in ấn. |
| `Novellized: Open Printable Book Preview` | Mở trang HTML xem trước bản in hoàn chỉnh. |
| `Novellized: Import Manuscript from Word (.docx)...` | Nhập bản thảo từ file Word và tự động chia tách cảnh. |

---

## 💻 Hướng Dẫn Cài Đặt & Phát Triển

### 1. Yêu cầu môi trường
- Node.js `^20.0.0` trở lên
- npm `^9.0.0` trở lên

### 2. Cài đặt mã nguồn
```bash
# Clone repository
git clone https://github.com/novellized/novellized-editor.git
cd novellized-editor

# Cài đặt thư viện phụ thuộc
npm install
```

### 3. Biên dịch dự án
```bash
# Kiểm tra kiểu dữ liệu TypeScript (0 lỗi)
npm run compile

# Build bundle extension và webview bằng esbuild
npm run build

# Chế độ theo dõi thay đổi (Watch mode)
npm run watch
```

### 4. Chạy kiểm thử tự động (Unit Tests)
```bash
# Chạy bộ test gốc của Node.js (7/7 tests)
npm test
```

### 5. Đóng gói Extension (.vsix)
```bash
npm run package:vsix
# Cài trực tiếp vào VS Code / VSCodium:
code --install-extension novellized-editor-0.1.1-alpha.vsix
```

### 6. Đóng gói Novellized Studio Độc Lập (Bản phân phối riêng)
```bash
npm run package:ide
npm run package:installer
```

### 7. Debug trong VS Code
1. Mở thư mục dự án trong VS Code.
2. Bấm phím **`F5`** (hoặc chọn **Run and Debug** -> **"Launch Novellized (Extension)"**).
3. Một cửa sổ **Extension Development Host** sẽ tự động mở lên để bạn trải nghiệm trực tiếp!

---

## 📄 Giấy Phép (License)

Dự án được phân phối dưới giấy phép **MIT License**. Xem chi tiết tại tệp [`LICENSE`](LICENSE).
