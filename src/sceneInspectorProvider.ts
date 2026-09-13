import * as vscode from 'vscode';
import * as path from 'path';
import { getSceneMetadata, updateSceneMetadata, extractCharactersFromBible, SceneStatus } from './sceneMetadata';
import { SnapshotManager, SnapshotItem } from './snapshotManager';
import { countWords } from './wordCount';

export class SceneInspectorProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'novellized.sceneInspectorView';

    private view?: vscode.WebviewView;
    private activeSceneUri: vscode.Uri | null = null;
    private debounceSaveTimer: NodeJS.Timeout | null = null;

    constructor(private readonly extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (!this.activeSceneUri) return;

            switch (message.type) {
                case 'updateMetadata': {
                    if (this.debounceSaveTimer) clearTimeout(this.debounceSaveTimer);
                    this.debounceSaveTimer = setTimeout(async () => {
                        if (this.activeSceneUri) {
                            await updateSceneMetadata(this.activeSceneUri, message.data);
                        }
                    }, 400);
                    break;
                }
                case 'takeSnapshot': {
                    const label = await vscode.window.showInputBox({
                        title: 'Take Scene Snapshot',
                        prompt: 'Enter label for this snapshot (e.g., Before Climax Rewrite)',
                        placeHolder: 'Draft checkpoint'
                    });
                    if (label === undefined) return;

                    const item = await SnapshotManager.takeSnapshot(this.activeSceneUri, label);
                    if (item) {
                        vscode.window.showInformationMessage(`📸 Snapshot "${item.label}" created!`);
                        await this.refreshInspector();
                    }
                    break;
                }
                case 'compareSnapshot': {
                    await SnapshotManager.compareWithSnapshot(this.activeSceneUri, message.snapshotId, message.label);
                    break;
                }
                case 'restoreSnapshot': {
                    const confirm = await vscode.window.showWarningMessage(
                        `Restore scene to snapshot "${message.label}"? An automatic safety checkpoint will be saved before restoring.`,
                        { modal: true },
                        'Restore'
                    );
                    if (confirm === 'Restore') {
                        await SnapshotManager.restoreSnapshot(this.activeSceneUri, message.snapshotId);
                        vscode.window.showInformationMessage(`✓ Restored scene to snapshot "${message.label}".`);
                        await this.refreshInspector();
                    }
                    break;
                }
                case 'ready': {
                    await this.refreshInspector();
                    break;
                }
            }
        });

        // Initial refresh
        this.refreshInspector();
    }

    /**
     * Sets active scene and updates webview
     */
    public async setActiveScene(uri: vscode.Uri | null): Promise<void> {
        if (uri && uri.fsPath.endsWith('.md')) {
            this.activeSceneUri = uri;
        } else {
            this.activeSceneUri = null;
        }
        await this.refreshInspector();
    }

    /**
     * Sends active scene state to webview
     */
    public async refreshInspector(): Promise<void> {
        if (!this.view) return;

        if (!this.activeSceneUri) {
            this.view.webview.postMessage({
                type: 'setEmptyState'
            });
            return;
        }

        const sceneUri = this.activeSceneUri;
        const meta = await getSceneMetadata(sceneUri);
        const snapshots = await SnapshotManager.listSnapshots(sceneUri);

        const rootUri = vscode.workspace.getWorkspaceFolder(sceneUri)?.uri || vscode.workspace.workspaceFolders?.[0]?.uri;
        let knownCharacters: string[] = [];
        if (rootUri) {
            const chars = await extractCharactersFromBible(rootUri);
            knownCharacters = chars.map(c => c.name);
        }

        // Calculate word count
        let words = 0;
        try {
            const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === sceneUri.toString());
            let text = '';
            if (openDoc) {
                text = openDoc.getText();
            } else {
                const raw = await vscode.workspace.fs.readFile(sceneUri);
                text = Buffer.from(raw).toString('utf8');
            }
            words = countWords(text);
        } catch { }

        this.view.webview.postMessage({
            type: 'setSceneData',
            data: {
                fileName: path.basename(sceneUri.fsPath),
                title: meta.title || path.basename(sceneUri.fsPath, '.md').replace(/^scene[-_]/i, 'Scene '),
                words,
                status: meta.status || 'draft',
                pov: meta.pov || '',
                synopsis: meta.synopsis || '',
                notes: meta.notes || '',
                knownCharacters,
                snapshots
            }
        });
    }

    private getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            --font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--font-family);
            font-size: 12px;
            color: var(--vscode-foreground, #cccccc);
            background: var(--vscode-sideBar-background, #181818);
            padding: 12px 14px;
            user-select: none;
        }
        .empty-state {
            text-align: center;
            padding: 30px 10px;
            color: var(--vscode-descriptionForeground, #888);
            line-height: 1.6;
        }
        .empty-icon {
            font-size: 28px;
            margin-bottom: 8px;
            opacity: 0.6;
        }
        .scene-header {
            border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
            padding-bottom: 8px;
            margin-bottom: 12px;
        }
        .scene-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--vscode-foreground, #fff);
            margin-bottom: 2px;
            word-break: break-word;
        }
        .scene-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground, #888);
        }
        .form-group {
            margin-bottom: 12px;
        }
        label {
            display: block;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground, #888);
            margin-bottom: 4px;
        }
        select, input[type="text"], textarea {
            width: 100%;
            background: var(--vscode-input-background, #252526);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.25));
            border-radius: 4px;
            padding: 6px 8px;
            font-family: inherit;
            font-size: 12px;
            outline: none;
            transition: border-color 0.15s ease;
        }
        select:focus, input[type="text"]:focus, textarea:focus {
            border-color: var(--vscode-focusBorder, #007acc);
        }
        textarea {
            resize: vertical;
            min-height: 56px;
            line-height: 1.45;
        }
        .status-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .status-draft { background: rgba(140, 140, 140, 0.2); color: #aaa; }
        .status-in_progress { background: rgba(55, 148, 255, 0.25); color: #4da3ff; }
        .status-revised { background: rgba(220, 160, 40, 0.25); color: #e6b800; }
        .status-done { background: rgba(75, 180, 80, 0.25); color: #4cd964; }

        .btn-action {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            width: 100%;
            padding: 6px 10px;
            background: var(--vscode-button-secondaryBackground, #3a3d41);
            color: var(--vscode-button-secondaryForeground, #ffffff);
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            margin-bottom: 8px;
            transition: background-color 0.15s ease;
        }
        .btn-action:hover {
            background: var(--vscode-button-secondaryHoverBackground, #45494e);
        }
        .btn-action.btn-primary {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
        }
        .btn-action.btn-primary:hover {
            background: var(--vscode-button-hoverBackground, #1177bb);
        }

        .snapshot-list {
            margin-top: 6px;
            max-height: 150px;
            overflow-y: auto;
        }
        .snapshot-card {
            background: var(--vscode-editorWidget-background, rgba(255,255,255,0.03));
            border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
            border-radius: 4px;
            padding: 6px 8px;
            margin-bottom: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .snapshot-info {
            flex: 1;
            overflow: hidden;
        }
        .snapshot-label {
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--vscode-foreground, #ddd);
        }
        .snapshot-date {
            font-size: 10px;
            color: var(--vscode-descriptionForeground, #777);
        }
        .snapshot-actions {
            display: flex;
            gap: 4px;
        }
        .btn-mini {
            background: transparent;
            border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));
            color: var(--vscode-foreground, #ccc);
            border-radius: 3px;
            padding: 2px 6px;
            font-size: 10px;
            cursor: pointer;
        }
        .btn-mini:hover {
            background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2));
            color: #fff;
        }
    </style>
</head>
<body>
    <div id="empty-state" class="empty-state">
        <div class="empty-icon">📖</div>
        <div><strong>No Scene Selected</strong></div>
        <div>Open or select a scene in the Manuscript tree to view its Inspector.</div>
    </div>

    <div id="inspector-content" style="display: none;">
        <div class="scene-header">
            <div id="display-title" class="scene-title">Scene 1</div>
            <div id="display-meta" class="scene-meta">0 words</div>
        </div>

        <div class="form-group">
            <label for="input-status">Scene Status</label>
            <select id="input-status">
                <option value="draft">Draft (Bản thô)</option>
                <option value="in_progress">In Progress (Đang viết)</option>
                <option value="revised">Revised (Đã trau chuốt)</option>
                <option value="done">Done (Hoàn thành)</option>
            </select>
        </div>

        <div class="form-group">
            <label for="input-pov">POV Character (Góc nhìn)</label>
            <input type="text" id="input-pov" list="characters-list" placeholder="e.g., Protagonist">
            <datalist id="characters-list"></datalist>
        </div>

        <div class="form-group">
            <label for="input-synopsis">Scene Synopsis (Ý đồ cốt truyện)</label>
            <textarea id="input-synopsis" placeholder="Briefly summarize what happens and what conflicts unfold..."></textarea>
        </div>

        <div class="form-group">
            <label for="input-notes">Author Backstage Notes (Nháp riêng tư)</label>
            <textarea id="input-notes" placeholder="Reminders, sensory motifs, or hidden twists (will not be printed)..."></textarea>
        </div>

        <div class="form-group" style="margin-top: 14px;">
            <label>Scene Snapshots (Bản lưu an toàn)</label>
            <button id="btn-snapshot" class="btn-action btn-primary">📸 Take Snapshot</button>
            <div id="snapshot-list" class="snapshot-list"></div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        const emptyEl = document.getElementById('empty-state');
        const contentEl = document.getElementById('inspector-content');
        const titleEl = document.getElementById('display-title');
        const metaEl = document.getElementById('display-meta');
        const statusEl = document.getElementById('input-status');
        const povEl = document.getElementById('input-pov');
        const synopsisEl = document.getElementById('input-synopsis');
        const notesEl = document.getElementById('input-notes');
        const charactersListEl = document.getElementById('characters-list');
        const btnSnapshot = document.getElementById('btn-snapshot');
        const snapshotListEl = document.getElementById('snapshot-list');

        function triggerSave() {
            vscode.postMessage({
                type: 'updateMetadata',
                data: {
                    status: statusEl.value,
                    pov: povEl.value.trim(),
                    synopsis: synopsisEl.value.trim(),
                    notes: notesEl.value.trim()
                }
            });
        }

        statusEl.addEventListener('change', triggerSave);
        povEl.addEventListener('input', triggerSave);
        synopsisEl.addEventListener('input', triggerSave);
        notesEl.addEventListener('input', triggerSave);

        btnSnapshot.addEventListener('click', () => {
            vscode.postMessage({ type: 'takeSnapshot' });
        });

        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.type) {
                case 'setEmptyState':
                    emptyEl.style.display = 'block';
                    contentEl.style.display = 'none';
                    break;
                case 'setSceneData':
                    emptyEl.style.display = 'none';
                    contentEl.style.display = 'block';

                    const d = msg.data;
                    titleEl.textContent = d.title;
                    metaEl.textContent = \`\${d.fileName} • \${d.words.toLocaleString()} words\`;
                    statusEl.value = d.status || 'draft';
                    povEl.value = d.pov || '';
                    synopsisEl.value = d.synopsis || '';
                    notesEl.value = d.notes || '';

                    // Characters datalist
                    charactersListEl.innerHTML = '';
                    if (Array.isArray(d.knownCharacters)) {
                        d.knownCharacters.forEach(name => {
                            const opt = document.createElement('option');
                            opt.value = name;
                            charactersListEl.appendChild(opt);
                        });
                    }

                    // Snapshots
                    snapshotListEl.innerHTML = '';
                    if (Array.isArray(d.snapshots) && d.snapshots.length > 0) {
                        d.snapshots.forEach(s => {
                            const card = document.createElement('div');
                            card.className = 'snapshot-card';
                            card.innerHTML = \`
                                <div class="snapshot-info">
                                    <div class="snapshot-label" title="\${s.label}">\${s.label}</div>
                                    <div class="snapshot-date">\${s.dateStr} • \${s.words}w \${s.oid ? '• #' + s.oid.slice(0, 7) : ''}</div>
                                </div>
                                <div class="snapshot-actions">
                                    <button class="btn-mini btn-compare" title="Compare with current scene">Diff</button>
                                    <button class="btn-mini btn-restore" title="Restore this snapshot">Restore</button>
                                </div>
                            \`;

                            card.querySelector('.btn-compare').addEventListener('click', () => {
                                vscode.postMessage({
                                    type: 'compareSnapshot',
                                    snapshotId: s.id,
                                    label: s.label
                                });
                            });

                            card.querySelector('.btn-restore').addEventListener('click', () => {
                                vscode.postMessage({
                                    type: 'restoreSnapshot',
                                    snapshotId: s.id,
                                    label: s.label
                                });
                            });

                            snapshotListEl.appendChild(card);
                        });
                    } else {
                        snapshotListEl.innerHTML = '<div style="font-size:11px;color:#777;padding:4px 0;">No snapshots yet. Click above to save checkpoints.</div>';
                    }
                    break;
            }
        });

        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
