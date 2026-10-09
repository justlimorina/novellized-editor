<div align="center">
  <img src="resources/icon.png" width="96" height="96" alt="Novellized Logo" />
  <h1>Novellized Prose Editor</h1>
  <p><strong>The Distraction-Free, Book-Grade WYSIWYG Prose Studio for Authors and Novelists in VS Code & VSCodium</strong></p>

  <p>
    <a href="https://github.com/novellized/novellized-editor/actions"><img src="https://img.shields.io/github/actions/workflow/status/novellized/novellized-editor/ci.yml?branch=master&label=CI%20Build&logo=github&style=flat-square" alt="CI Build"></a>
    <a href="https://github.com/novellized/novellized-editor/releases"><img src="https://img.shields.io/github/package-json/v/novellized/novellized-editor?style=flat-square&logo=git" alt="Release Version"></a>
    <a href="https://marketplace.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%5E1.80.0-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white" alt="VS Code Version"></a>
    <a href="test/"><img src="https://img.shields.io/badge/tests-7%2F7%20passing-brightgreen?style=flat-square&logo=node.js&logoColor=white" alt="Unit Tests"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"></a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Engine-TipTap%20%2F%20ProseMirror-000000?style=flat-square&logo=markdown&logoColor=white" alt="ProseMirror TipTap Engine">
    <img src="https://img.shields.io/badge/Format-CommonMark%20%2F%20GFM-6e5494?style=flat-square&logo=markdown&logoColor=white" alt="CommonMark GFM">
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Cross Platform">
    <a href="https://github.com/novellized/novellized-editor/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome"></a>
  </p>

  <p>
    <a href="#-why-novellized">Why Novellized?</a> •
    <a href="#-key-features">Key Features</a> •
    <a href="#-novel-project-architecture">Project Structure</a> •
    <a href="#-keyboard-shortcuts">Shortcuts</a> •
    <a href="#-available-commands">Commands</a> •
    <a href="#-development--testing">Development</a> •
    <a href="README_vi.md">Tiếng Việt</a>
  </p>
</div>

---

## 📖 Why Novellized?

Most markdown editors are designed for developers and technical documentation, forcing novelists to stare at raw markup syntax (`#`, `**`, `*`, `>`), monospaced code fonts, and terminal panes. Meanwhile, traditional novel-writing suites (like Scrivener or Ulysses) rely on proprietary file formats, locking your work inside closed ecosystems.

**Novellized Prose Editor** combines the best of both worlds:
- **100% Plain-Text Markdown**: Your chapters and scenes remain clean `.md` files on your local drive—future-proof, git-friendly, and open.
- **Publishing-Grade Book Typesetting**: Write directly in an elegant, book-like environment with real-time typography, paragraph indents, and scene dividers.
- **Scrivener-Grade Writer Studio**: Features a hierarchical manuscript binder, visual chapter corkboard, focus mode, typewriter scrolling, story bible, and daily word streak tracking.
- **Deep AI Agent Synergy**: 1-click aggregation of scene context, character sheets, and lore rules formatted for Claude, ChatGPT, Gemini, or local LLMs.

---

## ✨ Key Features

### 🖋️ 1. WYSIWYG Live Book Typography (TipTap & ProseMirror)
* **Real-Time Prose Rendering**: Instant formatting as you type without breaking standard Markdown syntax.
* **Literary Input Rules**:
  * `# `, `## `, `### ` for chapter and scene titles.
  * `**bold**`, `*italic*`, `~~strike~~`, and `> quotes`.
  * `---` automatically transforms into standard literary scene break ornament (`⁂`).
  * Smart Em-Dash: Typing `-- ` automatically converts into em-dash `— `.
* **Instant Dual-Engine Switching**:
  * Click **"Raw Markdown"** anytime to switch to Monaco Editor.
  * Click **"Open in Live View"** to return to TipTap with zero buffer lag or data loss.

### 👓 2. Distraction-Free Immersion Tools
* **Focus Mode**: Dynamically dims all surrounding paragraphs, highlighting only the current active paragraph under your cursor to keep you in the flow.
* **Typewriter Scrolling**: Conforms to the golden reading ratio (~42% from the viewport top), smoothly centering your active writing line as you type.
* **Dialogue vs. Narrative Highlighter**:
  * Toggle **"Dialogue: ON/OFF"** in the toolbar.
  * Scans and highlights speech quotes (`"..."`, `“...”`, `「...」`) in soft gold/amber, making it effortless to evaluate dialogue-to-exposition pacing across chapters.
* **Zen Writing Mode**: One-click distraction-free workspace hiding sidebars, panels, and status bars (`Ctrl+Alt+Z`).

### 🔍 3. In-Editor Find & Replace (TipTap Native)
* **Dedicated Floating Search Bar**: Trigger with `Ctrl+F` (Find) or `Ctrl+H` (Find & Replace).
* **Live ProseMirror Decorations**: Matches are highlighted across the scene in real time.
* **Comprehensive Search Actions**:
  * Live match counter (`1/12`).
  * Case-sensitive matching toggle (`Aa`).
  * Match navigation: `Enter` (Next) / `Shift+Enter` (Previous).
  * In-place replacement: **Replace** active match or **Replace All**.
  * Press `Escape` to close the bar cleanly.

### 🎨 4. Typography & Reading View Controls (`Aa` Popover)
* Click the **Aa** button in the toolbar to adjust reading preferences on the fly:
  * **Font Size**: `15px`, `17px`, `18px`, `20px`, `22px`.
  * **Canvas Width**: Compact (`680px`), Standard (`780px`), Wide (`920px`), Full (`100%`).
  * **Line Height**: `1.6`, `1.85`, `2.1`.
  * **Font Stack**: Literary Serif (*Lora, Merriweather, Book Antiqua*), Modern Sans (*system-ui*), or Clean Monospace.
* Preferences persist automatically across editor reloads and sessions.

### 📑 5. Manuscript Binder & Drag-and-Drop Tree
* **Dedicated Activity Bar View**: Clean Scrivener-style hierarchy in the sidebar:
  $$\text{Parts} \longrightarrow \text{Chapters} \longrightarrow \text{Scenes}$$
* **Live Word Counts**: Real-time scene word counts and title extraction directly in the tree.
* **Native Drag & Drop Reordering**: Drag scenes between or within chapters. Automatically updates file numerical prefixes (`01_scene.md`, `02_scene.md`).
* **Quick Binder Actions**: Add scenes (`+ Scene`), add chapters (`+ Chapter`), rename, or delete directly from the tree view.

### 📌 6. Interactive Chapter Corkboard
* View all scenes of any chapter as visual index cards.
* Displays scene title, synopsis summary, POV character, and word count.
* Drag-and-drop index cards visually to reorganize plot beats and chapter flow.

### 🌐 7. High-Precision Multilingual & CJK Word Count Engine
* Accurately counts Latin, accented Vietnamese words, and individual CJK ideographs (Chinese Hanzi, Japanese Kanji/Kana, Korean Hangul).
* Automatically filters out YAML frontmatter (`--- ... ---`), HTML comments (`<!-- ... -->`), and code blocks before calculating stats.
* Live reading duration calculation based on average reading speed (~200 wpm).

### 🧠 8. Story Bible & 1-Click AI Scene Context Generator
* **Modular Story Bible**: Store character sheets and worldbuilding lore in `docs/characters/` and `docs/worldbuilding/` (or single `characters.md` / `worldbuilding.md` files).
* **`@` Mention Auto-Suggest**: Type `@` anywhere in the scene editor to invoke instant character and lore auto-completion.
* **Entity Hover Cards**: Hover over any recognized character or world element to view quick entity summary tooltips.
* **1-Click AI Context Generation (`novellized.copyAiSceneContext`)**:
  * One click packages the current scene text, active character sheets, world lore, and tone rules into a structured clipboard prompt ready for Claude, ChatGPT, Gemini, or local LLMs.

### 🎯 9. Writing Goals, Daily Streaks & Word Sprints
* **Daily Writing Goal**: Track daily word count progress in the status bar:
  ```text
  $(edit) Today: +850 / 1,000 w
  ```
  Set custom daily targets with `novellized.setDailyWordGoal`.
* **Project Master Word Goal**: Configure overall manuscript target with visual progress bar.
* **Word Sprints / Pomodoro Timer**: Built-in sprint timer (`novellized.startWritingSprint`) to write against the clock.

### 📷 10. Scene Snapshots & Version Checkpoints
* Click the **"Snapshot"** button in the toolbar to take instant, lightweight scene revision checkpoints backed by local Git without needing terminal commands.
* Compare scene drafts and roll back edits directly within VS Code.

### 📦 11. Publishing & Exporting
* **Export Formats**: Export full manuscript to **EPUB (`.epub`)**, **PDF (`.pdf`)**, or open a **Printable Book Preview (HTML)**.
* **Word Import**: Import existing manuscripts from Word (`.docx`) with auto-conversion into clean scene files.

---

## 📂 Novel Project Architecture

When running `Novellized: ✨ Create New Novel Project...`, the wizard scaffolds an AI-ready, human-readable structure:

```text
[My_Novel]/
├── part_01/
│   ├── chapter_01/
│   │   ├── 01_scene_01.md            <-- Scene 1 (Auto-opened in Live View)
│   │   └── 02_scene_02.md
│   └── chapter_02/
│       └── 01_scene_01.md
├── docs/                             <-- Human & AI Shared Story Bible
│   ├── characters/                   <-- Character dossiers (Psychology, motivations, appearance)
│   │   ├── protagonist.md
│   │   └── antagonist.md
│   ├── worldbuilding/                <-- Lore, magic/tech systems, factions, geography
│   │   └── magic_system.md
│   ├── characters.md                 <-- (Optional unified characters file)
│   ├── worldbuilding.md              <-- (Optional unified lore file)
│   └── outline.md                    <-- Master narrative arc (3-Act structure)
└── .novel/                           <-- Project metadata & AI system constraints
    ├── project.json                  <-- Novel title, author, target words, timestamps
    └── ai_rules.json                 <-- AI writing directives: POV, voice, tone, taboos
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| **`Ctrl+F`** / **`Cmd+F`** | Open Find in Scene | Live View |
| **`Ctrl+H`** / **`Cmd+H`** | Open Find & Replace in Scene | Live View |
| **`Enter`** / **`Shift+Enter`** | Navigate Next / Previous search match | Search Bar |
| **`Escape`** | Close Find bar, Typography popover, or Mention dropdown | Live View |
| **`Ctrl+S`** / **`Cmd+S`** | Save Scene Document | Live View & Monaco |
| **`Ctrl+B`** / **`Cmd+B`** | Bold text selection | Live View |
| **`Ctrl+I`** / **`Cmd+I`** | Italic text selection | Live View |
| **`-- + Space`** | Smart em-dash replacement (`— `) | Live View |
| **`@`** | Trigger Story Bible Entity Autocomplete | Live View |
| **`Ctrl+Alt+Z`** | Toggle Zen Writing Mode | Global |

---

## 🛠️ Available Commands

Access these commands anytime via the Command Palette (**`Ctrl+Shift+P`** / **`Cmd+Shift+P`**):

| Command | Description |
| :--- | :--- |
| `Novellized: ✨ Create New Novel Project...` | Scaffolds a complete novel project with 4 quick questions. |
| `Novellized: Open in Live View` | Opens current Markdown file in the WYSIWYG book editor. |
| `Novellized: Open as Raw Markdown` | Switches current file back to the native Monaco code editor. |
| `Novellized: Add New Scene...` | Creates a new scene file inside the active chapter. |
| `Novellized: Add New Chapter...` | Creates a new chapter directory. |
| `Novellized: Open Chapter Corkboard` | Opens visual index card corkboard for the selected chapter. |
| `Novellized: Copy AI Scene Context & Bible Prompt` | Copies 1-click contextual prompt with current scene + bible lore. |
| `Novellized: Set Daily Word Target` | Sets your daily writing goal for streak tracking. |
| `Novellized: Set Target Word Count` | Sets the master manuscript word target. |
| `Novellized: Start Writing Sprint / Pomodoro...` | Starts a focused writing sprint against the clock. |
| `Novellized: Take Scene Snapshot...` | Saves an instant checkpoint snapshot of the current scene. |
| `Novellized: Export Manuscript as EPUB (.epub)...` | Compiles chapters into an e-reader ready `.epub`. |
| `Novellized: Export Manuscript as PDF (.pdf)...` | Compiles chapters into printable formatted PDF. |
| `Novellized: Open Printable Book Preview` | Renders a styled HTML preview for proofreading. |
| `Novellized: Import Manuscript from Word (.docx)...` | Imports `.docx` files and divides them into scenes. |

---

## 💻 Development & Testing

### 1. Prerequisites
- Node.js `^20.0.0` or higher
- npm `^9.0.0` or higher

### 2. Setup & Installation
```bash
# Clone the repository
git clone https://github.com/novellized/novellized-editor.git
cd novellized-editor

# Install dependencies
npm install
```

### 3. Build & Compile
```bash
# Check TypeScript types
npm run compile

# Build extension and webview bundle (esbuild)
npm run build

# Watch mode for active development
npm run watch
```

### 4. Run Automated Unit Tests
```bash
# Runs native node test suite (7/7 tests)
npm test
```

### 5. Package Extension (.vsix)
```bash
npm run package:vsix
# Install into your local VS Code / VSCodium:
code --install-extension novellized-editor-0.1.1-alpha.vsix
```

### 6. Package Standalone Novellized Studio (Codium-based IDE)
```bash
npm run package:ide
npm run package:installer
```

### 7. Debugging in VS Code
1. Open this workspace in VS Code.
2. Press **`F5`** (or go to **Run and Debug** -> **"Launch Novellized (Extension)"**).
3. In the new **Extension Development Host** window, press `Ctrl+Shift+P` and execute **`Novellized: ✨ Create New Novel Project...`**.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
