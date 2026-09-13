import * as vscode from 'vscode';
import * as path from 'path';

export interface SnapshotItem {
    id: string;
    label: string;
    timestamp: number;
    dateStr: string;
    words: number;
    uri: vscode.Uri;
}

export class SnapshotManager {
    /**
     * Resolves root workspace URI
     */
    private static getRootUri(uri: vscode.Uri): vscode.Uri | undefined {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        return folder?.uri || vscode.workspace.workspaceFolders?.[0]?.uri;
    }

    /**
     * Resolves snapshot directory for a scene
     */
    private static getSnapshotDir(sceneUri: vscode.Uri): vscode.Uri | null {
        const rootUri = this.getRootUri(sceneUri);
        if (!rootUri) return null;

        const relPath = path.relative(rootUri.fsPath, sceneUri.fsPath).replace(/\.md$/i, '');
        return vscode.Uri.joinPath(rootUri, '.novel', 'snapshots', relPath);
    }

    /**
     * Creates a new snapshot of the scene
     */
    public static async takeSnapshot(sceneUri: vscode.Uri, label?: string): Promise<SnapshotItem | null> {
        const snapshotDir = this.getSnapshotDir(sceneUri);
        if (!snapshotDir) return null;

        await vscode.workspace.fs.createDirectory(snapshotDir);

        // Read current scene content
        let content = '';
        const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === sceneUri.toString());
        if (openDoc) {
            content = openDoc.getText();
        } else {
            const raw = await vscode.workspace.fs.readFile(sceneUri);
            content = Buffer.from(raw).toString('utf8');
        }

        const now = Date.now();
        const date = new Date(now);
        const cleanLabel = (label || 'Snapshot')
            .trim()
            .replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF\s-]/g, '')
            .replace(/\s+/g, '_')
            .slice(0, 40) || 'Snapshot';

        const filename = `${now}_${cleanLabel}.md`;
        const targetUri = vscode.Uri.joinPath(snapshotDir, filename);

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(targetUri, encoder.encode(content));

        const words = content.trim().split(/\s+/).filter(Boolean).length;
        const dateStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + date.toLocaleDateString();

        return {
            id: filename,
            label: label || 'Snapshot',
            timestamp: now,
            dateStr,
            words,
            uri: targetUri
        };
    }

    /**
     * Lists all snapshots for a given scene
     */
    public static async listSnapshots(sceneUri: vscode.Uri): Promise<SnapshotItem[]> {
        const snapshotDir = this.getSnapshotDir(sceneUri);
        if (!snapshotDir) return [];

        try {
            const entries = await vscode.workspace.fs.readDirectory(snapshotDir);
            const items: SnapshotItem[] = [];

            for (const [name, type] of entries) {
                if (type === vscode.FileType.File && name.endsWith('.md')) {
                    const match = name.match(/^(\d+)_(.+)\.md$/);
                    if (match) {
                        const timestamp = parseInt(match[1], 10);
                        const label = match[2].replace(/_/g, ' ');
                        const date = new Date(timestamp);
                        const fileUri = vscode.Uri.joinPath(snapshotDir, name);

                        let words = 0;
                        try {
                            const raw = await vscode.workspace.fs.readFile(fileUri);
                            const text = Buffer.from(raw).toString('utf8');
                            words = text.trim().split(/\s+/).filter(Boolean).length;
                        } catch { }

                        const dateStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + date.toLocaleDateString();

                        items.push({
                            id: name,
                            label,
                            timestamp,
                            dateStr,
                            words,
                            uri: fileUri
                        });
                    }
                }
            }

            // Sort newest first
            items.sort((a, b) => b.timestamp - a.timestamp);
            return items;
        } catch {
            return [];
        }
    }

    /**
     * Restores content from snapshot to active scene
     */
    public static async restoreSnapshot(sceneUri: vscode.Uri, snapshotUri: vscode.Uri): Promise<boolean> {
        const raw = await vscode.workspace.fs.readFile(snapshotUri);
        const restoredText = Buffer.from(raw).toString('utf8');

        // Check open document
        const doc = await vscode.workspace.openTextDocument(sceneUri);
        const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(sceneUri, fullRange, restoredText);
        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            await doc.save();
        }
        return success;
    }

    /**
     * Opens diff editor comparing current scene with snapshot
     */
    public static async compareWithSnapshot(sceneUri: vscode.Uri, snapshotUri: vscode.Uri, label: string): Promise<void> {
        const title = `${path.basename(sceneUri.fsPath)} ⟷ ${label}`;
        await vscode.commands.executeCommand('vscode.diff', snapshotUri, sceneUri, title);
    }
}
