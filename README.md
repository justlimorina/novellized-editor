# Novellized Prose Editor

WYSIWYG Live Markdown Editor built specifically for authors, novelists, and creative writers on VS Code and VSCodium.

---

## Key Features

* **WYSIWYG Live View**:
  * Powered by **TipTap (ProseMirror)**: Markdown is seamlessly rendered into a book-like typesetting experience as you type, without altering raw markdown syntax.
  * Instant input rules: `# `, `## `, `**bold**`, `*italic*`, `> quote`, and `---` (auto-transformed into literary scene break `⁂`).
* **Literary Typography**:
  * Carefully balanced font stack designed for reading and prose writing:
    ```css
    font-family: 'Lora', 'Merriweather', 'Book Antiqua', 'Times New Roman', 'Liberation Sans', serif;
    ```
  * Automatic paragraph indents (`text-indent: 1.8rem`), comfortable line-height (`1.85`), publishing-standard unindented first paragraphs after headings, and optimal reading width constraint.
* **Instant Dual-Engine Switching**:
  * Click the **"Raw Markdown"** button in the toolbar or editor title icon to switch back to traditional Monaco Editor.
  * Click **"Open in Live View"** anytime to return to TipTap without buffer desync or data loss.
* **Real-Time Word & Character Counter**:
  * Live statistics tracking words and characters in the top toolbar.
* **Automated Project Initializer Wizard**:
  * Command `Novellized: ✨ Create New Novel Project...` guides writers through a quick 4-step setup.
  * Automatically scaffolds character bibles, worldbuilding guides, and a 3-act master outline.
* **AI Agent Context-Optimized Architecture**:
  ```text
  [Novel_Title]/
  ├── part_01/
  │   └── chapter_01/
  │       ├── scene_01.md            <-- Opening scene (Auto-opened in Live View)
  │       └── scene_02.md
  ├── docs/                          <-- Context for both human and AI agents
  │   ├── characters.md              <-- Character bible (Psychology, appearance, motivations)
  │   ├── worldbuilding.md           <-- World lore, magic/tech systems, societal rules
  │   └── outline.md                 <-- Master narrative arc (3-Act structure)
  └── .novel/                        <-- Machine metadata & system instructions for AI
      ├── project.json               <-- Novel metadata, word count targets, timestamps
      └── ai_rules.json              <-- Rules for AI: Point of view, tone, voice, taboos
  ```

---

## Development & Testing Guide

### 1. Install Dependencies
```bash
npm.cmd install
```

### 2. Build Extension
```bash
npm.cmd run build
```

Or run watch mode:
```bash
npm.cmd run watch
```

### 3. Debug with VS Code / VSCodium
1. Open the `novellized-editor` directory in VS Code or VSCodium.
2. Press **`F5`** (or go to Run & Debug and select **"Launch Novellized (Extension)"**).
3. A clean **Extension Development Host** window will open.
4. Press `Ctrl+Shift+P` and choose **"Novellized: ✨ Create New Novel Project..."** (or click the button in File Explorer) to test!
