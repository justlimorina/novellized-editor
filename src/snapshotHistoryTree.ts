import * as vscode from 'vscode';
import * as path from 'path';
import { SnapshotManager, SnapshotItem } from './snapshotManager';

export class SnapshotHistoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly itemType: 'checkpoint' | 'file',
        public readonly snapshot: SnapshotItem | null,
        public readonly relativePath?: string,
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(
            itemType === 'checkpoint'
                ? (snapshot?.label || 'Checkpoint')
                : path.basename(relativePath || ''),
            collapsibleState
        );

        if (itemType === 'checkpoint' && snapshot) {
            this.description = `#${snapshot.oid.slice(0, 7)} · ${snapshot.dateStr}`;
            this.tooltip = new vscode.MarkdownString(
                `### Checkpoint: **${snapshot.label}**\n\n` +
                `- **Commit Hash**: \`${snapshot.oid}\`\n` +
                `- **Date**: ${snapshot.dateStr}\n\n` +
                `*Expand to view files or click Diff/Restore icons.*`
            );
            this.contextValue = 'checkpointItem';
            this.iconPath = new vscode.ThemeIcon('git-commit');
        } else if (itemType === 'file' && relativePath && snapshot) {
            this.description = path.dirname(relativePath);
            this.tooltip = `File: ${relativePath}\nClick to compare with current working draft`;
            this.contextValue = 'checkpointFileItem';
            this.iconPath = new vscode.ThemeIcon('file-text');

            const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
            if (rootUri) {
                const targetUri = vscode.Uri.file(path.join(rootUri.fsPath, relativePath));
                this.command = {
                    command: 'novellized.compareSnapshotFile',
                    title: 'Compare with Checkpoint',
                    arguments: [targetUri, snapshot.oid, snapshot.label]
                };
            }
        }
    }
}

export class SnapshotHistoryTreeProvider implements vscode.TreeDataProvider<SnapshotHistoryTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SnapshotHistoryTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SnapshotHistoryTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {
        // Auto-refresh when any snapshot is created
        SnapshotManager.onDidSnapshot.event(() => {
            this.refresh();
        });
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: SnapshotHistoryTreeItem): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: SnapshotHistoryTreeItem): Promise<SnapshotHistoryTreeItem[]> {
        const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!rootUri) return [];

        if (!element) {
            // Root level: all checkpoints
            const snapshots = await SnapshotManager.listAllSnapshots(rootUri);
            if (snapshots.length === 0) {
                const emptyItem = new vscode.TreeItem('No checkpoints recorded yet. Enter a note above and press Enter to save.');
                emptyItem.iconPath = new vscode.ThemeIcon('info');
                return [emptyItem as any];
            }
            return snapshots.map(
                s => new SnapshotHistoryTreeItem('checkpoint', s, undefined, vscode.TreeItemCollapsibleState.Collapsed)
            );
        } else if (element.itemType === 'checkpoint' && element.snapshot) {
            // Child level: files included in this checkpoint
            const files = await SnapshotManager.getFilesAtCommit(rootUri, element.snapshot.oid);
            if (files.length === 0) {
                const noFilesItem = new vscode.TreeItem('All manuscript scenes');
                noFilesItem.iconPath = new vscode.ThemeIcon('files');
                return [noFilesItem as any];
            }
            return files.map(
                f => new SnapshotHistoryTreeItem('file', element.snapshot, f, vscode.TreeItemCollapsibleState.None)
            );
        }

        return [];
    }
}
