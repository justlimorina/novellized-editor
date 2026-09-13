import * as vscode from 'vscode';
import * as path from 'path';
import { getChapterMetadata, saveChapterMetadata, SceneStatus } from './sceneMetadata';
import { countWords } from './wordCount';

interface CardData {
    filename: string;
    index: number;
    title: string;
    words: number;
    status: SceneStatus;
    pov: string;
    synopsis: string;
}

export class CorkboardManager {
    public static async openCorkboard(chapterFolderUri: vscode.Uri, extensionUri: vscode.Uri): Promise<void> {
        const chapterName = path.basename(chapterFolderUri.fsPath).replace(/^chapter[-_]/i, 'Chapter ').replace(/[-_]/g, ' ');
        const panel = vscode.window.createWebviewPanel(
            'novellized.corkboard',
            `Corkboard: ${chapterName}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        const refreshBoard = async () => {
            const cards = await CorkboardManager.loadChapterCards(chapterFolderUri);
            panel.webview.postMessage({
                type: 'setCards',
                chapterName,
                cards
            });
        };

        panel.webview.html = CorkboardManager.getHtml();

        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready': {
                    await refreshBoard();
                    break;
                }
                case 'openScene': {
                    const sceneUri = vscode.Uri.joinPath(chapterFolderUri, message.filename);
                    await vscode.commands.executeCommand('vscode.openWith', sceneUri, 'novellized.editor');
                    break;
                }
                case 'updateCard': {
                    const chapMeta = await getChapterMetadata(chapterFolderUri);
                    if (!chapMeta.scenes) chapMeta.scenes = {};
                    chapMeta.scenes[message.filename] = {
                        ...chapMeta.scenes[message.filename],
                        ...message.patch
                    };
                    await saveChapterMetadata(chapterFolderUri, chapMeta);
                    break;
                }
                case 'addScene': {
                    const entries = await vscode.workspace.fs.readDirectory(chapterFolderUri);
                    const sceneNumbers = entries
                        .filter(([name]) => /^scene[-_]\d+/i.test(name))
                        .map(([name]) => {
                            const match = name.match(/^scene[-_](\d+)/i);
                            return match ? parseInt(match[1], 10) : 0;
                        });
                    const nextIdx = (sceneNumbers.length > 0 ? Math.max(...sceneNumbers) : 0) + 1;
                    const newFilename = `scene_${String(nextIdx).padStart(2, '0')}.md`;
                    const sceneUri = vscode.Uri.joinPath(chapterFolderUri, newFilename);

                    const defaultTitle = message.title || `Scene ${nextIdx}`;
                    const initialContent = `### ${defaultTitle}\n\n`;
                    await vscode.workspace.fs.writeFile(sceneUri, new TextEncoder().encode(initialContent));

                    // Save initial synopsis if provided
                    const chapMeta = await getChapterMetadata(chapterFolderUri);
                    if (!chapMeta.scenes) chapMeta.scenes = {};
                    chapMeta.scenes[newFilename] = {
                        title: defaultTitle,
                        status: 'draft',
                        synopsis: message.synopsis || ''
                    };
                    await saveChapterMetadata(chapterFolderUri, chapMeta);

                    await vscode.commands.executeCommand('novellized.refreshManuscript');
                    await refreshBoard();
                    break;
                }
                case 'reorderScenes': {
                    // message.newOrder is an array of filenames in desired order e.g. ["scene_03.md", "scene_01.md", ...]
                    await CorkboardManager.reorderScenes(chapterFolderUri, message.newOrder);
                    await vscode.commands.executeCommand('novellized.refreshManuscript');
                    await refreshBoard();
                    break;
                }
            }
        });
    }

    private static async loadChapterCards(chapterFolderUri: vscode.Uri): Promise<CardData[]> {
        const entries = await vscode.workspace.fs.readDirectory(chapterFolderUri);
        const sceneFiles = entries.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'));
        sceneFiles.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));

        const chapMeta = await getChapterMetadata(chapterFolderUri);
        const scenesMeta = chapMeta.scenes || {};

        const cards: CardData[] = [];
        let index = 1;

        for (const [filename] of sceneFiles) {
            const sceneUri = vscode.Uri.joinPath(chapterFolderUri, filename);
            const m = scenesMeta[filename] || {};

            let words = 0;
            let title = m.title || '';
            try {
                const raw = await vscode.workspace.fs.readFile(sceneUri);
                const text = Buffer.from(raw).toString('utf8');
                words = countWords(text);

                if (!title) {
                    const matchH3 = text.match(/###\s+([^\n]+)/);
                    if (matchH3) {
                        title = matchH3[1].trim();
                    } else {
                        title = filename.replace(/\.md$/i, '').replace(/^scene[-_]/i, 'Scene ');
                    }
                }
            } catch { }

            cards.push({
                filename,
                index,
                title: title || `Scene ${index}`,
                words,
                status: m.status || 'draft',
                pov: m.pov || '',
                synopsis: m.synopsis || ''
            });

            index++;
        }

        return cards;
    }

    private static async reorderScenes(chapterFolderUri: vscode.Uri, orderedFilenames: string[]): Promise<void> {
        if (!orderedFilenames || orderedFilenames.length === 0) return;

        // Step 1: Read all scene contents and metadata into memory
        const chapMeta = await getChapterMetadata(chapterFolderUri);
        const scenesMeta = chapMeta.scenes || {};
        const oldSceneData: Array<{ filename: string; content: Uint8Array; meta: any }> = [];

        for (const fn of orderedFilenames) {
            const fileUri = vscode.Uri.joinPath(chapterFolderUri, fn);
            try {
                const content = await vscode.workspace.fs.readFile(fileUri);
                oldSceneData.push({
                    filename: fn,
                    content,
                    meta: scenesMeta[fn] || {}
                });
            } catch { }
        }

        // Step 2: Delete old files
        for (const item of oldSceneData) {
            const fileUri = vscode.Uri.joinPath(chapterFolderUri, item.filename);
            try {
                await vscode.workspace.fs.delete(fileUri);
            } catch { }
        }

        // Step 3: Write files with sequential names: scene_01.md, scene_02.md...
        const newScenesMeta: Record<string, any> = {};
        for (let i = 0; i < oldSceneData.length; i++) {
            const newFilename = `scene_${String(i + 1).padStart(2, '0')}.md`;
            const newUri = vscode.Uri.joinPath(chapterFolderUri, newFilename);
            await vscode.workspace.fs.writeFile(newUri, oldSceneData[i].content);
            newScenesMeta[newFilename] = oldSceneData[i].meta;
        }

        chapMeta.scenes = newScenesMeta;
        await saveChapterMetadata(chapterFolderUri, chapMeta);
    }

    private static getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Novellized Corkboard</title>
    <style>
        :root {
            --font-serif: 'Lora', 'Merriweather', 'Book Antiqua', Georgia, serif;
            --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--font-sans);
            background: #2b2724;
            background-image: 
                radial-gradient(#3a342f 15%, transparent 16%),
                radial-gradient(#3a342f 15%, transparent 16%);
            background-size: 30px 30px;
            background-position: 0 0, 15px 15px;
            color: #dcd6cd;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            user-select: none;
        }
        .board-header {
            position: sticky;
            top: 0;
            z-index: 100;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 28px;
            background: rgba(30, 27, 25, 0.94);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }
        .board-title {
            font-family: var(--font-serif);
            font-size: 18px;
            font-weight: 600;
            color: #f3efe9;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .board-actions {
            display: flex;
            gap: 10px;
        }
        .btn-board {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            background: #7d4e2d;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.15s ease;
        }
        .btn-board:hover {
            background: #965f37;
            transform: translateY(-1px);
        }
        .cards-grid {
            flex: 1;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 24px;
            padding: 28px;
            max-width: 1600px;
            margin: 0 auto;
            width: 100%;
        }
        /* Index Card Aesthetic */
        .index-card {
            background: #faf6ee;
            color: #2c2523;
            border-radius: 6px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            height: 250px;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            position: relative;
            cursor: grab;
            border-top: 4px solid #b8977e;
        }
        .index-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 22px rgba(0,0,0,0.45);
        }
        .index-card.dragging {
            opacity: 0.4;
            transform: scale(0.96);
            cursor: grabbing;
        }
        .index-card.drag-over {
            border: 2px dashed #7d4e2d;
            transform: scale(1.02);
        }
        .card-header {
            padding: 10px 14px 6px 14px;
            border-bottom: 1px solid rgba(0,0,0,0.08);
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }
        .card-num {
            font-size: 11px;
            font-weight: 700;
            color: #8c5a3c;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .card-title {
            font-family: var(--font-serif);
            font-size: 14px;
            font-weight: 700;
            color: #1f1a18;
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 180px;
        }
        .card-status {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            padding: 2px 6px;
            border-radius: 3px;
        }
        .status-draft { background: #e0ded9; color: #5a5752; }
        .status-in_progress { background: #d0e4ff; color: #0052cc; }
        .status-revised { background: #fff0b3; color: #974f00; }
        .status-done { background: #d3f9d8; color: #1f7a28; }

        .card-body {
            flex: 1;
            padding: 10px 14px;
            display: flex;
            flex-direction: column;
        }
        .card-synopsis {
            flex: 1;
            width: 100%;
            background: transparent;
            border: none;
            outline: none;
            resize: none;
            font-family: var(--font-serif);
            font-size: 12.5px;
            line-height: 1.5;
            color: #3b322f;
            cursor: text;
        }
        .card-synopsis::placeholder {
            color: #a89f97;
            font-style: italic;
        }
        .card-footer {
            padding: 8px 14px;
            border-top: 1px solid rgba(0,0,0,0.06);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #796f68;
            background: rgba(0,0,0,0.02);
            border-bottom-left-radius: 6px;
            border-bottom-right-radius: 6px;
        }
        .card-meta-tags {
            display: flex;
            gap: 6px;
            align-items: center;
        }
        .badge-pov {
            background: #ede6d8;
            padding: 1px 5px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 500;
        }
        .btn-open-card {
            background: transparent;
            border: 1px solid rgba(0,0,0,0.15);
            padding: 3px 8px;
            border-radius: 3px;
            font-size: 10.5px;
            font-weight: 500;
            color: #4a3e38;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .btn-open-card:hover {
            background: #7d4e2d;
            color: #fff;
            border-color: #7d4e2d;
        }
    </style>
</head>
<body>
    <div class="board-header">
        <div class="board-title">
            <span id="board-title-text">Corkboard</span>
        </div>
        <div class="board-actions">
            <button id="btn-add-card" class="btn-board">Add Scene</button>
        </div>
    </div>

    <div id="cards-grid" class="cards-grid"></div>

    <script>
        const vscode = acquireVsCodeApi();
        const gridEl = document.getElementById('cards-grid');
        const titleTextEl = document.getElementById('board-title-text');
        const btnAddCard = document.getElementById('btn-add-card');

        let currentCards = [];
        let draggedIndex = null;

        btnAddCard.addEventListener('click', () => {
            const sceneTitle = prompt('Enter new scene title:');
            if (sceneTitle !== null) {
                vscode.postMessage({
                    type: 'addScene',
                    title: sceneTitle.trim() || 'New Scene'
                });
            }
        });

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'setCards') {
                titleTextEl.textContent = \`Corkboard: \${msg.chapterName} (\${msg.cards.length} scenes)\`;
                currentCards = msg.cards;
                renderCards(currentCards);
            }
        });

        function renderCards(cards) {
            gridEl.innerHTML = '';
            cards.forEach((c, idx) => {
                const card = document.createElement('div');
                card.className = 'index-card';
                card.draggable = true;
                card.dataset.index = String(idx);
                card.dataset.filename = c.filename;

                const statusClass = 'status-' + (c.status || 'draft');
                const statusLabel = (c.status || 'draft').replace('_', ' ');

                card.innerHTML = \`
                    <div class="card-header">
                        <div>
                            <div class="card-num">Scene #\${c.index}</div>
                            <div class="card-title" title="\${c.title}">\${c.title}</div>
                        </div>
                        <span class="card-status \${statusClass}">\${statusLabel}</span>
                    </div>
                    <div class="card-body">
                        <textarea class="card-synopsis" placeholder="Write scene synopsis / beat goal here...">\${c.synopsis || ''}</textarea>
                    </div>
                    <div class="card-footer">
                        <div class="card-meta-tags">
                            <span>\${c.words.toLocaleString()} words</span>
                            \${c.pov ? \`<span class="badge-pov">POV: \${c.pov}</span>\` : ''}
                        </div>
                        <button class="btn-open-card">Open Scene</button>
                    </div>
                \`;

                // Events
                const synopsisArea = card.querySelector('.card-synopsis');
                synopsisArea.addEventListener('blur', () => {
                    const newSyn = synopsisArea.value.trim();
                    if (newSyn !== c.synopsis) {
                        c.synopsis = newSyn;
                        vscode.postMessage({
                            type: 'updateCard',
                            filename: c.filename,
                            patch: { synopsis: newSyn }
                        });
                    }
                });

                card.querySelector('.btn-open-card').addEventListener('click', (e) => {
                    e.stopPropagation();
                    vscode.postMessage({
                        type: 'openScene',
                        filename: c.filename
                    });
                });

                card.addEventListener('dblclick', () => {
                    vscode.postMessage({
                        type: 'openScene',
                        filename: c.filename
                    });
                });

                // Drag and Drop
                card.addEventListener('dragstart', (e) => {
                    draggedIndex = idx;
                    card.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });

                card.addEventListener('dragend', () => {
                    card.classList.remove('dragging');
                    document.querySelectorAll('.index-card').forEach(el => el.classList.remove('drag-over'));
                });

                card.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    card.classList.add('drag-over');
                });

                card.addEventListener('dragleave', () => {
                    card.classList.remove('drag-over');
                });

                card.addEventListener('drop', (e) => {
                    e.preventDefault();
                    card.classList.remove('drag-over');
                    if (draggedIndex === null || draggedIndex === idx) return;

                    // Reorder local array
                    const movedCard = currentCards.splice(draggedIndex, 1)[0];
                    currentCards.splice(idx, 0, movedCard);

                    // Send new filenames order
                    const newOrder = currentCards.map(x => x.filename);
                    vscode.postMessage({
                        type: 'reorderScenes',
                        newOrder
                    });
                });

                gridEl.appendChild(card);
            });
        }

        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
