import * as vscode from 'vscode';
import { countWords, extractSceneTitle } from './wordCount';

export type ManuscriptItemType = 'part' | 'chapter' | 'scene';

export class ManuscriptTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly itemType: ManuscriptItemType,
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public wordCount: number = 0,
        description?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = itemType;
        this.tooltip = `${resourceUri.fsPath} (${wordCount.toLocaleString()} words)`;
        this.description = description ?? (wordCount > 0 ? `${wordCount.toLocaleString()} words` : undefined);

        switch (itemType) {
            case 'part':
                this.iconPath = new vscode.ThemeIcon('library');
                break;
            case 'chapter':
                this.iconPath = new vscode.ThemeIcon('book');
                break;
            case 'scene':
                this.iconPath = new vscode.ThemeIcon('file-text');
                this.command = {
                    command: 'vscode.openWith',
                    title: 'Open in Live View',
                    arguments: [resourceUri, 'novellized.editor']
                };
                break;
        }
    }
}

export class ManuscriptTreeProvider implements vscode.TreeDataProvider<ManuscriptTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ManuscriptTreeItem | undefined | null | void> = new vscode.EventEmitter<ManuscriptTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ManuscriptTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ManuscriptTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ManuscriptTreeItem): Promise<ManuscriptTreeItem[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const rootUri = workspaceFolders[0].uri;

        if (!element) {
            // Root Level: Look for parts first, then chapters, then root scenes
            const entries = await this.readDirSafe(rootUri);
            const partDirs = entries.filter(([name, type]) => type === vscode.FileType.Directory && /^part[-_]/i.test(name));
            
            if (partDirs.length > 0) {
                // Sort parts naturally
                partDirs.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
                const items: ManuscriptTreeItem[] = [];
                for (const [name] of partDirs) {
                    const partUri = vscode.Uri.joinPath(rootUri, name);
                    const words = await this.computeFolderWordCount(partUri);
                    const formattedName = name.replace(/^part[-_]/i, 'Part ').replace(/[-_]/g, ' ');
                    items.push(new ManuscriptTreeItem(
                        formattedName,
                        'part',
                        partUri,
                        vscode.TreeItemCollapsibleState.Expanded,
                        words
                    ));
                }
                return items;
            }

            // If no parts, check for top-level chapters
            const chapterDirs = entries.filter(([name, type]) => type === vscode.FileType.Directory && /^chapter[-_]/i.test(name));
            if (chapterDirs.length > 0) {
                chapterDirs.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
                const items: ManuscriptTreeItem[] = [];
                for (const [name] of chapterDirs) {
                    const chapUri = vscode.Uri.joinPath(rootUri, name);
                    const words = await this.computeFolderWordCount(chapUri);
                    const formattedName = name.replace(/^chapter[-_]/i, 'Chapter ').replace(/[-_]/g, ' ');
                    items.push(new ManuscriptTreeItem(
                        formattedName,
                        'chapter',
                        chapUri,
                        vscode.TreeItemCollapsibleState.Expanded,
                        words
                    ));
                }
                return items;
            }

            // Fallback: Show any top-level scenes if available
            const sceneFiles = entries.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md') && !name.toLowerCase().startsWith('readme'));
            const items: ManuscriptTreeItem[] = [];
            for (const [name] of sceneFiles) {
                const sceneUri = vscode.Uri.joinPath(rootUri, name);
                const { words, title } = await this.readSceneDetails(sceneUri, name);
                items.push(new ManuscriptTreeItem(
                    title,
                    'scene',
                    sceneUri,
                    vscode.TreeItemCollapsibleState.None,
                    words
                ));
            }
            return items;
        }

        if (element.itemType === 'part') {
            // Inside a Part: list Chapters
            const entries = await this.readDirSafe(element.resourceUri);
            const chapterDirs = entries.filter(([name, type]) => type === vscode.FileType.Directory && /^chapter[-_]/i.test(name));
            chapterDirs.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
            const items: ManuscriptTreeItem[] = [];
            for (const [name] of chapterDirs) {
                const chapUri = vscode.Uri.joinPath(element.resourceUri, name);
                const words = await this.computeFolderWordCount(chapUri);
                const formattedName = name.replace(/^chapter[-_]/i, 'Chapter ').replace(/[-_]/g, ' ');
                items.push(new ManuscriptTreeItem(
                    formattedName,
                    'chapter',
                    chapUri,
                    vscode.TreeItemCollapsibleState.Expanded,
                    words
                ));
            }
            return items;
        }

        if (element.itemType === 'chapter') {
            // Inside a Chapter: list Scenes (.md files)
            const entries = await this.readDirSafe(element.resourceUri);
            const sceneFiles = entries.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'));
            sceneFiles.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
            const items: ManuscriptTreeItem[] = [];
            for (const [name] of sceneFiles) {
                const sceneUri = vscode.Uri.joinPath(element.resourceUri, name);
                const { words, title } = await this.readSceneDetails(sceneUri, name);
                items.push(new ManuscriptTreeItem(
                    title,
                    'scene',
                    sceneUri,
                    vscode.TreeItemCollapsibleState.None,
                    words
                ));
            }
            return items;
        }

        return [];
    }

    private async readDirSafe(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        try {
            return await vscode.workspace.fs.readDirectory(uri);
        } catch {
            return [];
        }
    }

    private async readSceneDetails(uri: vscode.Uri, fileName: string): Promise<{ words: number; title: string }> {
        try {
            const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
            let content = '';
            if (openDoc) {
                content = openDoc.getText();
            } else {
                const raw = await vscode.workspace.fs.readFile(uri);
                content = Buffer.from(raw).toString('utf8');
            }
            const words = countWords(content);
            const title = extractSceneTitle(content, fileName);
            return { words, title };
        } catch {
            return { words: 0, title: fileName };
        }
    }

    private async computeFolderWordCount(folderUri: vscode.Uri): Promise<number> {
        let total = 0;
        try {
            const entries = await vscode.workspace.fs.readDirectory(folderUri);
            for (const [name, type] of entries) {
                const subUri = vscode.Uri.joinPath(folderUri, name);
                if (type === vscode.FileType.File && name.endsWith('.md')) {
                    const { words } = await this.readSceneDetails(subUri, name);
                    total += words;
                } else if (type === vscode.FileType.Directory) {
                    total += await this.computeFolderWordCount(subUri);
                }
            }
        } catch {
            // Ignore missing folder
        }
        return total;
    }

    // Command: Add new scene into a chapter
    public async addScene(targetItem?: ManuscriptTreeItem): Promise<void> {
        let targetFolder: vscode.Uri | undefined;

        if (targetItem && targetItem.itemType === 'chapter') {
            targetFolder = targetItem.resourceUri;
        } else {
            // If invoked from toolbar or no chapter selected, find or prompt for chapter
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) return;
            const rootUri = workspaceFolders[0].uri;

            // Gather all available chapters
            const allChapters = await this.findAllChapters(rootUri);
            if (allChapters.length === 0) {
                vscode.window.showWarningMessage('Please create a chapter first before adding a scene.');
                return;
            }

            const picked = await vscode.window.showQuickPick(
                allChapters.map(c => ({
                    label: c.label,
                    uri: c.uri
                })),
                { placeHolder: 'Select chapter to add new scene to' }
            );
            if (!picked) return;
            targetFolder = picked.uri;
        }

        // Determine next scene index
        const entries = await this.readDirSafe(targetFolder);
        const sceneNumbers = entries
            .filter(([name]) => /^scene[-_]\d+/i.test(name))
            .map(([name]) => {
                const match = name.match(/^scene[-_](\d+)/i);
                return match ? parseInt(match[1], 10) : 0;
            });
        const nextIndex = (sceneNumbers.length > 0 ? Math.max(...sceneNumbers) : 0) + 1;
        const defaultFilename = `scene_${String(nextIndex).padStart(2, '0')}.md`;

        const sceneTitle = await vscode.window.showInputBox({
            prompt: `Scene title (Default filename: ${defaultFilename})`,
            placeHolder: 'e.g., A Fateful Encounter'
        });
        if (sceneTitle === undefined) return;

        const sceneUri = vscode.Uri.joinPath(targetFolder, defaultFilename);
        const initialContent = `### Scene ${nextIndex}: ${sceneTitle.trim() || 'Untitled Scene'}\n\n`;
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(sceneUri, encoder.encode(initialContent));

        this.refresh();

        // Open directly in Novellized Live View
        try {
            await vscode.commands.executeCommand('vscode.openWith', sceneUri, 'novellized.editor');
        } catch {
            const doc = await vscode.workspace.openTextDocument(sceneUri);
            await vscode.window.showTextDocument(doc);
        }
    }

    // Command: Add new chapter
    public async addChapter(targetItem?: ManuscriptTreeItem): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;
        const rootUri = workspaceFolders[0].uri;

        let targetParent = rootUri;
        if (targetItem && targetItem.itemType === 'part') {
            targetParent = targetItem.resourceUri;
        }

        // Determine next chapter index
        const entries = await this.readDirSafe(targetParent);
        const chapterNumbers = entries
            .filter(([name, type]) => type === vscode.FileType.Directory && /^chapter[-_]\d+/i.test(name))
            .map(([name]) => {
                const match = name.match(/^chapter[-_](\d+)/i);
                return match ? parseInt(match[1], 10) : 0;
            });
        const nextIndex = (chapterNumbers.length > 0 ? Math.max(...chapterNumbers) : 0) + 1;
        const defaultDirName = `chapter_${String(nextIndex).padStart(2, '0')}`;

        const chapterTitle = await vscode.window.showInputBox({
            prompt: `Chapter title (Folder: ${defaultDirName})`,
            placeHolder: 'e.g., Whispers in the Dark'
        });
        if (chapterTitle === undefined) return;

        const chapterFolderUri = vscode.Uri.joinPath(targetParent, defaultDirName);
        await vscode.workspace.fs.createDirectory(chapterFolderUri);

        // Create first scene in the chapter
        const firstSceneUri = vscode.Uri.joinPath(chapterFolderUri, 'scene_01.md');
        const header = chapterTitle.trim() ? `## Chapter ${nextIndex}: ${chapterTitle.trim()}\n\n### Scene 1: Opening\n\n` : `## Chapter ${nextIndex}\n\n### Scene 1\n\n`;
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(firstSceneUri, encoder.encode(header));

        this.refresh();

        try {
            await vscode.commands.executeCommand('vscode.openWith', firstSceneUri, 'novellized.editor');
        } catch {
            const doc = await vscode.workspace.openTextDocument(firstSceneUri);
            await vscode.window.showTextDocument(doc);
        }
    }

    private async findAllChapters(rootUri: vscode.Uri): Promise<Array<{ label: string; uri: vscode.Uri }>> {
        const result: Array<{ label: string; uri: vscode.Uri }> = [];
        const entries = await this.readDirSafe(rootUri);

        // Check top-level chapters
        for (const [name, type] of entries) {
            if (type === vscode.FileType.Directory && /^chapter[-_]/i.test(name)) {
                result.push({
                    label: name.replace(/^chapter[-_]/i, 'Chapter ').replace(/[-_]/g, ' '),
                    uri: vscode.Uri.joinPath(rootUri, name)
                });
            } else if (type === vscode.FileType.Directory && /^part[-_]/i.test(name)) {
                const partUri = vscode.Uri.joinPath(rootUri, name);
                const subEntries = await this.readDirSafe(partUri);
                for (const [subName, subType] of subEntries) {
                    if (subType === vscode.FileType.Directory && /^chapter[-_]/i.test(subName)) {
                        result.push({
                            label: `${name} > ${subName.replace(/^chapter[-_]/i, 'Chapter ').replace(/[-_]/g, ' ')}`,
                            uri: vscode.Uri.joinPath(partUri, subName)
                        });
                    }
                }
            }
        }
        return result;
    }
}
