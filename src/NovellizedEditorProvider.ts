import * as vscode from 'vscode';

export class NovellizedEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'novellized.editor';

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

        let isInternalUpdate = false;
        let lastReceivedContent = document.getText();

        // Listen for messages from the Webview (TipTap -> VS Code)
        const messageSubscription = webviewPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready':
                    // Webview DOM loaded, send initial markdown
                    lastReceivedContent = document.getText();
                    webviewPanel.webview.postMessage({
                        type: 'init',
                        text: lastReceivedContent,
                        fileName: document.fileName
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
<html lang="vi">
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
            <div class="document-stats" id="stats">0 từ • 0 ký tự</div>
            <div class="toolbar-actions">
                <button id="btn-toggle-raw" title="Chuyển sang chế độ Markdown thô (Monaco)">
                    <span class="icon">📝</span> Markdown Thô
                </button>
            </div>
        </div>
        <div class="editor-canvas">
            <div id="editor-container"></div>
        </div>
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

