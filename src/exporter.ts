import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import JSZip from 'jszip';
import { marked } from 'marked';

export interface NovelMetadata {
    title: string;
    author: string;
    language: string;
    description: string;
    version?: string;
}

export interface CompiledChapter {
    id: string;
    title: string;
    html: string;
    words: number;
}

export interface CompiledManuscript {
    metadata: NovelMetadata;
    chapters: CompiledChapter[];
    totalWords: number;
}

/**
 * Loads metadata from .novel/project.json or workspace defaults
 */
export async function loadNovelMetadata(rootUri: vscode.Uri): Promise<NovelMetadata> {
    const projectJsonUri = vscode.Uri.joinPath(rootUri, '.novel', 'project.json');
    try {
        const raw = await vscode.workspace.fs.readFile(projectJsonUri);
        const data = JSON.parse(Buffer.from(raw).toString('utf8'));
        return {
            title: data.title || path.basename(rootUri.fsPath),
            author: data.author || 'Anonymous',
            language: data.language || 'vi',
            description: data.description || '',
            version: data.version || '1.0.0'
        };
    } catch {
        return {
            title: path.basename(rootUri.fsPath),
            author: 'Anonymous',
            language: 'vi',
            description: ''
        };
    }
}

/**
 * Reads directory entries safely
 */
async function readDirSafe(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    try {
        return await vscode.workspace.fs.readDirectory(uri);
    } catch {
        return [];
    }
}

/**
 * Extracts chapter title from chapter.json or scene markdown
 */
async function getChapterTitle(chapUri: vscode.Uri, defaultName: string): Promise<string> {
    // 1. Check chapter.json
    const metaUri = vscode.Uri.joinPath(chapUri, 'chapter.json');
    try {
        const raw = await vscode.workspace.fs.readFile(metaUri);
        const meta = JSON.parse(Buffer.from(raw).toString('utf8'));
        if (meta && typeof meta.title === 'string' && meta.title.trim().length > 0) {
            return meta.title.trim();
        }
    } catch {
        // Continue
    }

    // 2. Check first scene markdown
    const entries = await readDirSafe(chapUri);
    const sceneFiles = entries.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'));
    if (sceneFiles.length > 0) {
        sceneFiles.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
        try {
            const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(chapUri, sceneFiles[0][0]));
            const lines = Buffer.from(raw).toString('utf8').split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (/^#+\s*(?:chapter|chương|hồi|act)\b/i.test(trimmed)) {
                    return trimmed.replace(/^#+\s*/, '').trim();
                }
            }
        } catch {
            // Ignore
        }
    }

    return defaultName.replace(/^chapter[-_]/i, 'Chapter ').replace(/[-_]/g, ' ');
}

/**
 * Compiles the entire manuscript in logical order
 */
export async function compileManuscript(rootUri: vscode.Uri): Promise<CompiledManuscript> {
    const metadata = await loadNovelMetadata(rootUri);
    const entries = await readDirSafe(rootUri);
    const chapters: CompiledChapter[] = [];
    let totalWords = 0;

    // Check for Part directories first
    const partDirs = entries.filter(([name, type]) => type === vscode.FileType.Directory && /^part[-_]/i.test(name));
    partDirs.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));

    const chapterDirsToProcess: Array<{ uri: vscode.Uri; dirName: string; partPrefix?: string }> = [];

    if (partDirs.length > 0) {
        for (const [partName] of partDirs) {
            const partUri = vscode.Uri.joinPath(rootUri, partName);
            const subEntries = await readDirSafe(partUri);
            const partChapters = subEntries.filter(([name, type]) => type === vscode.FileType.Directory && /^chapter[-_]/i.test(name));
            partChapters.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
            const partFormatted = partName.replace(/^part[-_]/i, 'Part ').replace(/[-_]/g, ' ');
            for (const [chapName] of partChapters) {
                chapterDirsToProcess.push({
                    uri: vscode.Uri.joinPath(partUri, chapName),
                    dirName: chapName,
                    partPrefix: partFormatted
                });
            }
        }
    } else {
        const topChapters = entries.filter(([name, type]) => type === vscode.FileType.Directory && /^chapter[-_]/i.test(name));
        topChapters.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
        for (const [chapName] of topChapters) {
            chapterDirsToProcess.push({
                uri: vscode.Uri.joinPath(rootUri, chapName),
                dirName: chapName
            });
        }
    }

    // Process each chapter
    let chapIndex = 1;
    for (const chapInfo of chapterDirsToProcess) {
        const chapTitle = await getChapterTitle(chapInfo.uri, chapInfo.dirName);
        const subEntries = await readDirSafe(chapInfo.uri);
        const sceneFiles = subEntries.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'));
        sceneFiles.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));

        const sceneHtmlParts: string[] = [];
        let chapterWordCount = 0;

        for (let sIdx = 0; sIdx < sceneFiles.length; sIdx++) {
            const sceneUri = vscode.Uri.joinPath(chapInfo.uri, sceneFiles[sIdx][0]);
            try {
                const raw = await vscode.workspace.fs.readFile(sceneUri);
                let text = Buffer.from(raw).toString('utf8');

                // Compute words
                const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
                chapterWordCount += words;

                // Strip leading Chapter heading from the first scene so it's not rendered twice
                if (sIdx === 0) {
                    text = text.replace(/^#+\s*(?:chapter|chương|hồi|act)\b[^\n]*\n+/i, '');
                }

                // If not first scene, prepend a clean literary scene divider
                if (sIdx > 0) {
                    sceneHtmlParts.push('<div class="scene-divider">✦ ✦ ✦</div>');
                }

                const sceneHtml = await marked.parse(text);
                sceneHtmlParts.push(sceneHtml);
            } catch {
                // Ignore missing scene
            }
        }

        const fullChapterHtml = sceneHtmlParts.join('\n');
        totalWords += chapterWordCount;

        chapters.push({
            id: `chapter_${String(chapIndex).padStart(2, '0')}`,
            title: chapTitle,
            html: fullChapterHtml,
            words: chapterWordCount
        });
        chapIndex++;
    }

    // Fallback: If no chapters found, look for standalone .md files in workspace root
    if (chapters.length === 0) {
        const rootScenes = entries.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md') && !name.toLowerCase().startsWith('readme'));
        rootScenes.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
        let idx = 1;
        for (const [name] of rootScenes) {
            const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(rootUri, name));
            const text = Buffer.from(raw).toString('utf8');
            const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
            totalWords += words;
            const html = await marked.parse(text);
            const title = name.replace(/\.md$/i, '').replace(/^scene[-_]/i, 'Scene ').replace(/[-_]/g, ' ');
            chapters.push({
                id: `chapter_${String(idx).padStart(2, '0')}`,
                title,
                html,
                words
            });
            idx++;
        }
    }

    return {
        metadata,
        chapters,
        totalWords
    };
}

/**
 * Exports the entire manuscript to an EPUB 3 (.epub) file
 */
export async function exportToEpub(workspaceUri?: vscode.Uri): Promise<void> {
    const rootUri = workspaceUri || vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!rootUri) {
        vscode.window.showErrorMessage('No active workspace found to export.');
        return;
    }

    const manuscript = await compileManuscript(rootUri);
    if (manuscript.chapters.length === 0) {
        vscode.window.showWarningMessage('No chapters or scenes found in manuscript to export.');
        return;
    }

    // Suggest default save filename
    const safeTitle = manuscript.metadata.title.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'novel';
    const defaultUri = vscode.Uri.joinPath(rootUri, `${safeTitle}.epub`);

    const targetUri = await vscode.window.showSaveDialog({
        defaultUri,
        saveLabel: 'Export EPUB',
        filters: { 'EPUB eBook (*.epub)': ['epub'] }
    });
    if (!targetUri) return;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Exporting "${manuscript.metadata.title}" to EPUB...`,
        cancellable: false
    }, async () => {
        const zip = new JSZip();
        const uuid = `urn:uuid:novellized-${Date.now()}`;
        const dateStr = new Date().toISOString().split('T')[0];

        // 1. mimetype (Must be first, uncompressed)
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

        // 2. META-INF/container.xml
        zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

        // 3. OEBPS/style.css
        const cssContent = `
body {
  font-family: Georgia, "Times New Roman", "Palatino Linotype", serif;
  line-height: 1.75;
  color: #1a1a1a;
  margin: 5% 8%;
  text-align: justify;
}
h1, h2, h3 {
  font-weight: bold;
  text-align: center;
  line-height: 1.3;
}
h1.chapter-title {
  font-size: 2em;
  margin-top: 2.2em;
  margin-bottom: 1.2em;
  page-break-before: always;
}
p {
  text-indent: 1.5em;
  margin-top: 0;
  margin-bottom: 0;
  padding: 0;
}
h1 + p, h2 + p, h3 + p, .scene-divider + p, hr + p, blockquote + p {
  text-indent: 0;
}
.scene-divider {
  text-align: center;
  letter-spacing: 0.5em;
  margin: 2em 0;
  color: #666;
  font-size: 0.9em;
  text-indent: 0;
}
.title-page {
  text-align: center;
  padding-top: 22vh;
}
.book-title {
  font-size: 2.5em;
  letter-spacing: 0.04em;
  margin-bottom: 0.2em;
}
.book-author {
  font-size: 1.3em;
  font-style: italic;
  color: #555;
  text-indent: 0;
  margin-bottom: 2em;
}
.divider {
  margin: 2.5em 0;
  color: #888;
  letter-spacing: 0.5em;
  text-indent: 0;
}
.publisher-meta {
  font-size: 0.85em;
  color: #888;
  text-indent: 0;
}
`;
        zip.file('OEBPS/style.css', cssContent);

        // 4. OEBPS/title.xhtml
        const titleXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${manuscript.metadata.language}" xml:lang="${manuscript.metadata.language}">
<head>
  <title>${escapeXml(manuscript.metadata.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body class="title-page">
  <div class="title-wrap">
    <h1 class="book-title">${escapeXml(manuscript.metadata.title)}</h1>
    <p class="book-author">bởi ${escapeXml(manuscript.metadata.author)}</p>
    <div class="divider">✦ ✦ ✦</div>
    <p class="publisher-meta">Tác phẩm gồm ${manuscript.chapters.length} chương · ${manuscript.totalWords.toLocaleString()} từ</p>
    <p class="publisher-meta">Biên soạn bởi Novellized Prose Editor</p>
  </div>
</body>
</html>`;
        zip.file('OEBPS/title.xhtml', titleXhtml);

        // 5. Individual chapter XHTML files
        const manifestItems: string[] = [
            '<item id="toc" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
            '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
            '<item id="style" href="style.css" media-type="text/css"/>',
            '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>'
        ];
        const spineItems: string[] = [
            '<itemref idref="title"/>'
        ];
        const navListItems: string[] = [
            '<li><a href="title.xhtml">Trang Tiêu Đề</a></li>'
        ];
        const ncxNavPoints: string[] = [
            `<navPoint id="navpoint-1" playOrder="1">
        <navLabel><text>Trang Tiêu Đề</text></navLabel>
        <content src="title.xhtml"/>
      </navPoint>`
        ];

        let playOrder = 2;
        for (const chap of manuscript.chapters) {
            const filename = `${chap.id}.xhtml`;
            const cleanXmlHtml = toXhtml(chap.html);
            const chapterContent = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${manuscript.metadata.language}" xml:lang="${manuscript.metadata.language}">
<head>
  <title>${escapeXml(chap.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1 class="chapter-title">${escapeXml(chap.title)}</h1>
  ${cleanXmlHtml}
</body>
</html>`;

            zip.file(`OEBPS/${filename}`, chapterContent);
            manifestItems.push(`<item id="${chap.id}" href="${filename}" media-type="application/xhtml+xml"/>`);
            spineItems.push(`<itemref idref="${chap.id}"/>`);
            navListItems.push(`<li><a href="${filename}">${escapeXml(chap.title)}</a></li>`);
            ncxNavPoints.push(`      <navPoint id="navpoint-${playOrder}" playOrder="${playOrder}">
        <navLabel><text>${escapeXml(chap.title)}</text></navLabel>
        <content src="${filename}"/>
      </navPoint>`);
            playOrder++;
        }

        // 6. OEBPS/nav.xhtml (EPUB 3 Table of Contents)
        const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${manuscript.metadata.language}" xml:lang="${manuscript.metadata.language}">
<head>
  <title>Mục Lục</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Mục Lục</h1>
    <ol>
      ${navListItems.join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
        zip.file('OEBPS/nav.xhtml', navXhtml);

        // 7. OEBPS/toc.ncx (EPUB 2 / Kindle backward compatibility)
        const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(manuscript.metadata.title)}</text></docTitle>
  <docAuthor><text>${escapeXml(manuscript.metadata.author)}</text></docAuthor>
  <navMap>
${ncxNavPoints.join('\n')}
  </navMap>
</ncx>`;
        zip.file('OEBPS/toc.ncx', ncxXml);

        // 8. OEBPS/content.opf (Master Package Document)
        const opfXml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${uuid}</dc:identifier>
    <dc:title>${escapeXml(manuscript.metadata.title)}</dc:title>
    <dc:creator>${escapeXml(manuscript.metadata.author)}</dc:creator>
    <dc:language>${manuscript.metadata.language}</dc:language>
    <dc:date>${dateStr}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
        zip.file('OEBPS/content.opf', opfXml);

        // Generate buffer and write to target
        const buffer = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
        await vscode.workspace.fs.writeFile(targetUri, buffer);
    });

    const action = await vscode.window.showInformationMessage(
        `✓ Exported EPUB successfully: "${path.basename(targetUri.fsPath)}" (${manuscript.chapters.length} chapters, ${manuscript.totalWords.toLocaleString()} words)`,
        'Open File',
        'Reveal in Explorer'
    );
    if (action === 'Open File') {
        vscode.env.openExternal(targetUri);
    } else if (action === 'Reveal in Explorer') {
        vscode.commands.executeCommand('revealFileInOS', targetUri);
    }
}

/**
 * Finds Google Chrome or Microsoft Edge executable for headless PDF printing
 */
function findBrowserExecutable(): string | null {
    if (process.platform === 'win32') {
        const paths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
    } else if (process.platform === 'darwin') {
        const paths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
    } else {
        const paths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/usr/bin/microsoft-edge',
            '/usr/bin/microsoft-edge-stable'
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
    }
    return null;
}

/**
 * Generates the full printable book HTML
 */
export function generatePrintableBookHtml(manuscript: CompiledManuscript): string {
    const chaptersHtml = manuscript.chapters.map(c => `
    <section class="chapter-wrapper">
      <h1 class="chapter-title">${escapeXml(c.title)}</h1>
      <div class="chapter-content">
        ${c.html}
      </div>
    </section>
  `).join('\n');

    return `<!DOCTYPE html>
<html lang="${manuscript.metadata.language}">
<head>
  <meta charset="utf-8">
  <title>${escapeXml(manuscript.metadata.title)} - Bản In / PDF</title>
  <style>
    @page {
      size: A5; /* Standard trade paperback / novel size (148 x 210 mm) */
      margin: 22mm 18mm 22mm 18mm;
      @top-center {
        content: "${escapeXml(manuscript.metadata.title)}";
        font-family: Georgia, serif;
        font-size: 8.5pt;
        font-style: italic;
        color: #666;
      }
      @bottom-center {
        content: counter(page);
        font-family: Georgia, serif;
        font-size: 9pt;
        color: #444;
      }
    }

    @page :first {
      @top-center { content: none; }
      @bottom-center { content: none; }
    }

    @media print {
      body {
        background: #ffffff !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .no-print {
        display: none !important;
      }
      .chapter-wrapper {
        break-before: page;
        page-break-before: always;
      }
    }

    body {
      font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.7;
      color: #1a1a1a;
      text-align: justify;
      hyphens: auto;
      background: #fdfbf7;
      margin: 0;
      padding: 0;
    }

    .book-container {
      max-width: 650px;
      margin: 0 auto;
      background: #ffffff;
      padding: 40px 60px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      min-height: 100vh;
    }

    .title-page-wrapper {
      min-height: 70vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      break-after: page;
      page-break-after: always;
      border-bottom: 1px solid #eee;
      padding-bottom: 40px;
      margin-bottom: 40px;
    }

    .title-page-wrapper h1 {
      font-size: 28pt;
      font-weight: bold;
      letter-spacing: 0.05em;
      margin-bottom: 10pt;
      line-height: 1.2;
    }

    .title-page-wrapper .author {
      font-size: 14pt;
      font-style: italic;
      color: #555;
      margin-bottom: 24pt;
    }

    .title-page-wrapper .divider {
      letter-spacing: 0.6em;
      color: #999;
      margin: 20pt 0;
    }

    .title-page-wrapper .meta {
      font-size: 9.5pt;
      color: #888;
      line-height: 1.6;
    }

    .chapter-wrapper {
      margin-top: 50px;
      padding-top: 30px;
    }

    h1.chapter-title {
      font-size: 20pt;
      text-align: center;
      margin-top: 0;
      margin-bottom: 24pt;
      font-weight: bold;
      line-height: 1.3;
    }

    p {
      text-indent: 1.5em;
      margin-top: 0;
      margin-bottom: 0;
      padding: 0;
    }

    h1 + p, h2 + p, h3 + p, .scene-divider + p, hr + p, blockquote + p {
      text-indent: 0;
    }

    .scene-divider {
      text-align: center;
      letter-spacing: 0.5em;
      margin: 24pt 0;
      color: #777;
      font-size: 9.5pt;
      text-indent: 0;
    }

    blockquote {
      margin: 16pt 24pt;
      font-style: italic;
      color: #444;
      border-left: 3px solid #ddd;
      padding-left: 12pt;
    }

    .print-bar {
      position: sticky;
      top: 0;
      background: #1e1e1e;
      color: #fff;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
    }

    .print-btn {
      background: #007acc;
      color: #fff;
      border: none;
      padding: 7px 18px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .print-btn:hover {
      background: #0062a3;
    }
  </style>
</head>
<body>
  <div class="print-bar no-print">
    <div><strong>Novellized Book Preview:</strong> ${escapeXml(manuscript.metadata.title)} (${manuscript.chapters.length} chapters · ${manuscript.totalWords.toLocaleString()} words)</div>
    <button class="print-btn" onclick="window.print()">
      🖨️ In / Lưu file PDF (Print to PDF)
    </button>
  </div>

  <div class="book-container">
    <div class="title-page-wrapper">
      <h1>${escapeXml(manuscript.metadata.title)}</h1>
      <div class="author">bởi ${escapeXml(manuscript.metadata.author)}</div>
      <div class="divider">✦ ✦ ✦</div>
      <div class="meta">
        ${manuscript.chapters.length} Chương · ${manuscript.totalWords.toLocaleString()} Từ<br>
        Tạo bằng Novellized Prose Editor
      </div>
    </div>

    ${chaptersHtml}
  </div>
</body>
</html>`;
}

/**
 * Exports the entire manuscript to a PDF (.pdf) file
 */
export async function exportToPdf(workspaceUri?: vscode.Uri): Promise<void> {
    const rootUri = workspaceUri || vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!rootUri) {
        vscode.window.showErrorMessage('No active workspace found to export.');
        return;
    }

    const manuscript = await compileManuscript(rootUri);
    if (manuscript.chapters.length === 0) {
        vscode.window.showWarningMessage('No chapters or scenes found in manuscript to export.');
        return;
    }

    const safeTitle = manuscript.metadata.title.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'novel';
    const defaultUri = vscode.Uri.joinPath(rootUri, `${safeTitle}.pdf`);

    const targetUri = await vscode.window.showSaveDialog({
        defaultUri,
        saveLabel: 'Export PDF',
        filters: { 'PDF Document (*.pdf)': ['pdf'] }
    });
    if (!targetUri) return;

    const browserExecutable = findBrowserExecutable();
    const htmlContent = generatePrintableBookHtml(manuscript);

    if (browserExecutable) {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Exporting "${manuscript.metadata.title}" to PDF...`,
            cancellable: false
        }, async () => {
            const novelDirUri = vscode.Uri.joinPath(rootUri, '.novel');
            await vscode.workspace.fs.createDirectory(novelDirUri);
            const tempHtmlUri = vscode.Uri.joinPath(novelDirUri, '_temp_print.html');
            await vscode.workspace.fs.writeFile(tempHtmlUri, new TextEncoder().encode(htmlContent));

            const cmd = `"${browserExecutable}" --headless=new --disable-gpu --print-to-pdf="${targetUri.fsPath}" --no-pdf-header-footer "${tempHtmlUri.fsPath}"`;
            
            await new Promise<void>((resolve, reject) => {
                exec(cmd, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            // Clean up temporary HTML file
            try {
                await vscode.workspace.fs.delete(tempHtmlUri);
            } catch {
                // Ignore cleanup error
            }
        });

        const action = await vscode.window.showInformationMessage(
            `✓ Exported PDF successfully: "${path.basename(targetUri.fsPath)}" (${manuscript.chapters.length} chapters, ${manuscript.totalWords.toLocaleString()} words)`,
            'Open PDF',
            'Reveal in Explorer'
        );
        if (action === 'Open PDF') {
            vscode.env.openExternal(targetUri);
        } else if (action === 'Reveal in Explorer') {
            vscode.commands.executeCommand('revealFileInOS', targetUri);
        }
    } else {
        // Fallback when no headless browser is detected: Open printable book view directly
        openPrintableBookView(rootUri);
        vscode.window.showInformationMessage(
            'Print preview opened! Press "In / Lưu file PDF" (Ctrl+P) and choose "Save as PDF" to generate your book.',
            'OK'
        );
    }
}

/**
 * Opens an interactive printable preview of the entire manuscript in a VS Code Webview
 */
export async function openPrintableBookView(workspaceUri?: vscode.Uri): Promise<void> {
    const rootUri = workspaceUri || vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!rootUri) {
        vscode.window.showErrorMessage('No active workspace found to preview.');
        return;
    }

    const manuscript = await compileManuscript(rootUri);
    if (manuscript.chapters.length === 0) {
        vscode.window.showWarningMessage('No chapters or scenes found in manuscript to preview.');
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'novellized.printableBook',
        `Book Preview: ${manuscript.metadata.title}`,
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = generatePrintableBookHtml(manuscript);
}

/**
 * Escapes XML/HTML characters
 */
function escapeXml(unsafe: string): string {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Ensures HTML output from marked is valid XHTML for EPUB3
 */
function toXhtml(html: string): string {
    return html
        .replace(/<hr\b([^>]*?)>/gi, '<hr$1/>')
        .replace(/<br\b([^>]*?)>/gi, '<br$1/>')
        .replace(/<img\b([^>]*?)>/gi, '<img$1/>');
}

