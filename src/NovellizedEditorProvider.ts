import * as vscode from 'vscode';
import { extractCharactersFromBible, extractWorldbuildingFromBible } from './sceneMetadata';
import { SnapshotManager } from './snapshotManager';

export class NovellizedEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'novellized.editor';
    public static readonly onDidChangeActiveScene = new vscode.EventEmitter<vscode.Uri>();

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new NovellizedEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(
            NovellizedEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                },
                supportsMultipleEditorsPerDocument: false
            }
        );
    }

    constructor(private readonly context: vscode.ExtensionContext) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'dist')
            ]
        };

        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        // Notify active scene for Inspector
        NovellizedEditorProvider.onDidChangeActiveScene.fire(document.uri);

        const viewStateSubscription = webviewPanel.onDidChangeViewState(e => {
            if (e.webviewPanel.active) {
                NovellizedEditorProvider.onDidChangeActiveScene.fire(document.uri);
            }
        });

        let isInternalUpdate = false;
        let lastReceivedContent = document.getText();

        // Listen for messages from the Webview (TipTap -> VS Code)
        const messageSubscription = webviewPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready':
                    // Webview DOM loaded, send initial markdown & entity lore
                    lastReceivedContent = document.getText();
                    const rootUri = vscode.workspace.getWorkspaceFolder(document.uri)?.uri || vscode.workspace.workspaceFolders?.[0]?.uri;
                    let characters: any[] = [];
                    let worldbuilding: any[] = [];
                    if (rootUri) {
                        characters = await extractCharactersFromBible(rootUri);
                        worldbuilding = await extractWorldbuildingFromBible(rootUri);
                    }
                    webviewPanel.webview.postMessage({
                        type: 'init',
                        text: lastReceivedContent,
                        fileName: document.fileName,
                        characters,
                        worldbuilding
                    });
                    return;

                case 'change':
                    if (message.text === document.getText()) {
                        return;
                    }
                    lastReceivedContent = message.text;
                    isInternalUpdate = true;
                    try {
                        await this.updateTextDocument(document, message.text);
                    } finally {
                        isInternalUpdate = false;
                    }
                    return;

                case 'requestRawMode':
                    await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
                    return;

                case 'takeSnapshot': {
                    const label = await vscode.window.showInputBox({
                        title: 'Take Scene Snapshot',
                        prompt: 'Enter label for this snapshot (e.g. Checkpoint before rewrite)',
                        placeHolder: 'Draft checkpoint'
                    });
                    if (label !== undefined) {
                        const item = await SnapshotManager.takeSnapshot(document.uri, label);
                        if (item) {
                            vscode.window.showInformationMessage(`📸 Snapshot "${item.label}" saved!`);
                        }
                    }
                    return;
                }

                case 'save':
                    if (message.text !== undefined && message.text !== document.getText()) {
                        lastReceivedContent = message.text;
                        isInternalUpdate = true;
                        try {
                            await this.updateTextDocument(document, message.text);
                        } finally {
                            isInternalUpdate = false;
                        }
                    }
                    await document.save();
                    return;
            }
        });

        // Listen for external changes to the document (e.g., git, outside edit)
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString() && !isInternalUpdate) {
                const currentText = document.getText();
                if (currentText !== lastReceivedContent) {
                    lastReceivedContent = currentText;
                    webviewPanel.webview.postMessage({
                        type: 'update',
                        text: currentText
                    });
                }
            }
        });

        webviewPanel.onDidDispose(() => {
            viewStateSubscription.dispose();
            messageSubscription.dispose();
            changeDocumentSubscription.dispose();
        });
    }

    private async updateTextDocument(document: vscode.TextDocument, newText: string): Promise<boolean> {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        edit.replace(document.uri, fullRange, newText);
        return vscode.workspace.applyEdit(edit);
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'styles.css')
        );

        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} https:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${styleUri}">
    <title>Novellized Live View</title>
</head>
<body>
    <div class="editor-shell">
        <div class="editor-toolbar">
            <div class="document-stats" id="stats">0 words • 0 characters • 0 min read</div>
            <div class="toolbar-actions">
                <button id="btn-toggle-focus" class="btn-toggle active" title="Toggle Focus Mode (Dim surrounding paragraphs)">
                    🎯 Focus: ON
                </button>
                <button id="btn-toggle-typewriter" class="btn-toggle active" title="Toggle Typewriter Scrolling (Keep active line centered)">
                    📜 Typewriter: ON
                </button>
                <button id="btn-toggle-dialogue" class="btn-toggle" title="Highlight Dialogue vs Narrative (Check Pacing)">
                    💬 Dialogue: OFF
                </button>
                <button id="btn-take-snapshot" title="Take a Quick Snapshot of this Scene">
                    📸 Snapshot
                </button>
                <button id="btn-toggle-raw" title="Switch to Raw Markdown mode (Monaco)">
                    Raw Markdown
                </button>
            </div>
        </div>
        <div class="editor-canvas">
            <div id="editor-container"></div>
        </div>
    </div>

    <!-- Mention / Entity Auto-Suggest Popup -->
    <div id="mention-dropdown" class="mention-dropdown" style="display: none;"></div>
    <!-- Entity Hover Tooltip Card -->
    <div id="entity-tooltip" class="entity-tooltip" style="display: none;"></div>

    <!-- Floating Bubble Menu for ProseMirror -->
    <div id="bubble-menu" class="bubble-menu">
        <button type="button" data-command="bold" title="Bold (Ctrl+B)"><b>B</b></button>
        <button type="button" data-command="italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <button type="button" data-command="strike" title="Strikethrough"><s>S</s></button>
        <span class="menu-divider"></span>
        <button type="button" data-command="h1" title="Heading 1">H1</button>
        <button type="button" data-command="h2" title="Heading 2">H2</button>
        <button type="button" data-command="h3" title="Heading 3">H3</button>
        <button type="button" data-command="p" title="Paragraph">¶</button>
        <span class="menu-divider"></span>
        <button type="button" data-command="blockquote" title="Quote / Inner Monologue">”</button>
        <button type="button" data-command="divider" title="Scene Break">⁂</button>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

