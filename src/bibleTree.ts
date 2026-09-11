import * as vscode from 'vscode';

interface BibleDocItem {
    label: string;
    relativePath: string;
    icon: string;
    description: string;
}

const BIBLE_DOCS: BibleDocItem[] = [
    {
        label: 'Character Bible',
        relativePath: 'docs/characters.md',
        icon: 'person',
        description: 'Protagonist, allies, rivals & arcs'
    },
    {
        label: 'Worldbuilding Guide',
        relativePath: 'docs/worldbuilding.md',
        icon: 'globe',
        description: 'Setting, lore, magic & laws'
    },
    {
        label: 'Master Outline (3 Acts)',
        relativePath: 'docs/outline.md',
        icon: 'milestone',
        description: 'Story beats & scene milestones'
    },
    {
        label: 'AI Rules & Directives',
        relativePath: '.novel/ai_rules.json',
        icon: 'robot',
        description: 'POV, voice, tone & constraints'
    }
];

export class BibleTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) return [];

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const rootUri = workspaceFolders[0].uri;
        const items: vscode.TreeItem[] = [];

        for (const doc of BIBLE_DOCS) {
            const fileUri = vscode.Uri.joinPath(rootUri, doc.relativePath);
            let exists = false;
            try {
                await vscode.workspace.fs.stat(fileUri);
                exists = true;
            } catch {
                exists = false;
            }

            const treeItem = new vscode.TreeItem(doc.label, vscode.TreeItemCollapsibleState.None);
            treeItem.iconPath = new vscode.ThemeIcon(doc.icon);
            treeItem.description = exists ? doc.relativePath : '(missing)';
            treeItem.tooltip = `${doc.description}\nPath: ${doc.relativePath}`;

            if (exists) {
                if (doc.relativePath.endsWith('.md')) {
                    treeItem.command = {
                        command: 'vscode.openWith',
                        title: 'Open Document',
                        arguments: [fileUri, 'novellized.editor']
                    };
                } else {
                    treeItem.command = {
                        command: 'vscode.open',
                        title: 'Open Document',
                        arguments: [fileUri]
                    };
                }
            } else {
                treeItem.command = {
                    command: 'novellized.createMissingBibleDoc',
                    title: 'Create Missing Document',
                    arguments: [doc.relativePath]
                };
            }

            items.push(treeItem);
        }

        return items;
    }

    public async createMissingDoc(relativePath: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;
        const rootUri = workspaceFolders[0].uri;
        const fileUri = vscode.Uri.joinPath(rootUri, relativePath);

        const encoder = new TextEncoder();
        let content = `# ${relativePath}\n\n`;
        if (relativePath.endsWith('.json')) {
            content = JSON.stringify({ note: 'Configuration file' }, null, 2);
        }

        await vscode.workspace.fs.writeFile(fileUri, encoder.encode(content));
        this.refresh();

        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc);
    }
}
