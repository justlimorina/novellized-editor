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
                    const { title, words } = await this.getChapterDetails(chapUri, name);
                    items.push(new ManuscriptTreeItem(
                        title,
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
                const { title, words } = await this.getChapterDetails(chapUri, name);
                items.push(new ManuscriptTreeItem(
                    title,
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

    public async getChapterDetails(chapUri: vscode.Uri, dirName: string): Promise<{ title: string; words: number }> {
        const fallbackTitle = dirName.replace(/^chapter[-_]/i, 'Chapter ').replace(/[-_]/g, ' ');
        const words = await this.computeFolderWordCount(chapUri);

        try {
            // 1. Check chapter.json if author or rename explicitly set it
            const metaUri = vscode.Uri.joinPath(chapUri, 'chapter.json');
            try {
                const rawMeta = await vscode.workspace.fs.readFile(metaUri);
                const meta = JSON.parse(Buffer.from(rawMeta).toString('utf8'));
                if (meta && typeof meta.title === 'string' && meta.title.trim().length > 0) {
                    return { title: meta.title.trim(), words };
                }
            } catch {
                // No chapter.json, proceed to inspect markdown content
            }

            // 2. Inspect the first scene file
            const entries = await this.readDirSafe(chapUri);
            const sceneFiles = entries.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'));
            if (sceneFiles.length === 0) {
                return { title: fallbackTitle, words };
            }

            sceneFiles.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
            const firstSceneUri = vscode.Uri.joinPath(chapUri, sceneFiles[0][0]);

            const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === firstSceneUri.toString());
            let content = '';
            if (openDoc) {
                content = openDoc.getText();
            } else {
                const raw = await vscode.workspace.fs.readFile(firstSceneUri);
                content = Buffer.from(raw).toString('utf8');
            }

            const lines = content.split('\n');

            // 2a. Priority 1: Line explicitly identifying a chapter (e.g. "# Chương 1: ...", "## Chapter 1: ...")
            for (const line of lines) {
                const trimmed = line.trim();
                if (/^#+\s*(?:chapter|chương|hồi|act)\b/i.test(trimmed)) {
                    const heading = trimmed.replace(/^#+\s*/, '').trim();
                    if (heading.length > 0) {
                        return { title: heading, words };
                    }
                }
            }

            // 2b. Priority 2: First ## heading that is not a Part or Volume
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('## ')) {
                    const heading = trimmed.replace(/^##\s*/, '').trim();
                    const isPart = /^(?:part|phần|volume|quyển)\s+\d+/i.test(heading);
                    if (!isPart && heading.length > 0) {
                        return { title: heading, words };
                    }
                }
            }

            // 2c. Priority 3: First # heading that is not a Part or Volume
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
                    const heading = trimmed.replace(/^#\s*/, '').trim();
                    const isPart = /^(?:part|phần|volume|quyển)\s+\d+/i.test(heading);
                    if (!isPart && heading.length > 0) {
                        return { title: heading, words };
                    }
                }
            }
        } catch {
            // Ignore error and use fallback
        }

        return { title: fallbackTitle, words };
    }

    public async renameChapter(targetItem?: ManuscriptTreeItem): Promise<void> {
        let chapFolder: vscode.Uri | undefined;
        let currentLabel = '';

        if (targetItem && targetItem.itemType === 'chapter') {
            chapFolder = targetItem.resourceUri;
            currentLabel = targetItem.label;
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) return;
            const rootUri = workspaceFolders[0].uri;
            const chapters = await this.findAllChapters(rootUri);
            if (chapters.length === 0) return;

            const picked = await vscode.window.showQuickPick(
                chapters.map(c => ({ label: c.label, uri: c.uri })),
                { placeHolder: 'Select chapter to rename' }
            );
            if (!picked) return;
            chapFolder = picked.uri;
            currentLabel = picked.label;
        }

        const newTitle = await vscode.window.showInputBox({
            title: 'Rename Chapter',
            prompt: 'Enter chapter title (e.g., Chapter 1: The Awakening / Chương 1: Sự khởi đầu)',
            value: currentLabel,
            validateInput: value => (!value || value.trim().length === 0) ? 'Chapter title cannot be empty' : null
        });
        if (!newTitle || newTitle.trim() === currentLabel) return;
        const trimmedNewTitle = newTitle.trim();
        const cleanTitle = trimmedNewTitle.replace(/^#+\s*/, '');

        // 1. Persist chapter title in chapter.json
        const metaUri = vscode.Uri.joinPath(chapFolder, 'chapter.json');
        const metaContent = JSON.stringify({ title: cleanTitle }, null, 2);
        await vscode.workspace.fs.writeFile(metaUri, new TextEncoder().encode(metaContent));

        // 2. Check opening scene file to synchronize heading if already present
        const entries = await this.readDirSafe(chapFolder);
        const sceneFiles = entries.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'));
        sceneFiles.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));

        if (sceneFiles.length === 0) {
            const scene01Uri = vscode.Uri.joinPath(chapFolder, 'scene_01.md');
            const initialContent = `# ${cleanTitle}\n\n`;
            await vscode.workspace.fs.writeFile(scene01Uri, new TextEncoder().encode(initialContent));
        } else {
            const firstSceneUri = vscode.Uri.joinPath(chapFolder, sceneFiles[0][0]);
            const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === firstSceneUri.toString());
            let content = '';
            if (openDoc) {
                content = openDoc.getText();
            } else {
                const raw = await vscode.workspace.fs.readFile(firstSceneUri);
                content = Buffer.from(raw).toString('utf8');
            }

            const lines = content.split('\n');
            let headingIndex = -1;
            let currentPrefix = '# ';
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                const m = trimmed.match(/^(#+)\s*(?:chapter|chương|hồi|act)\b/i);
                if (m) {
                    headingIndex = i;
                    currentPrefix = m[1] + ' '; // Preserve the author's preferred heading level (# or ##)!
                    break;
                }
            }

            if (headingIndex !== -1) {
                lines[headingIndex] = `${currentPrefix}${cleanTitle}`;
                const newContent = lines.join('\n');

                const doc = await vscode.workspace.openTextDocument(firstSceneUri);
                const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
                const edit = new vscode.WorkspaceEdit();
                edit.replace(firstSceneUri, fullRange, newContent);
                await vscode.workspace.applyEdit(edit);
                await doc.save();
            }
        }

        this.refresh();
        vscode.window.showInformationMessage(`Chapter renamed to: "${cleanTitle}"`);
    }

    public async renameScene(targetItem?: ManuscriptTreeItem): Promise<void> {
        if (!targetItem || targetItem.itemType !== 'scene') return;

        const sceneUri = targetItem.resourceUri;
        const currentLabel = targetItem.label;

        const newTitle = await vscode.window.showInputBox({
            title: 'Rename Scene',
            prompt: 'Enter scene title (e.g., Scene 1: Arrival / Cảnh 1: Khởi hành)',
            value: currentLabel,
            validateInput: value => (!value || value.trim().length === 0) ? 'Scene title cannot be empty' : null
        });
        if (!newTitle || newTitle.trim() === currentLabel) return;
        const trimmedNewTitle = newTitle.trim();
        const cleanTitle = trimmedNewTitle.replace(/^#+\s*/, '');

        const doc = await vscode.workspace.openTextDocument(sceneUri);
        const content = doc.getText();
        const lines = content.split('\n');

        let sceneHeadingIndex = -1;
        let scenePrefix = '### ';
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('#')) {
                const isChapter = /^#+\s*(?:chapter|chương|hồi|act)\b/i.test(trimmed);
                const isPart = /^#+\s*(?:part|phần|volume|quyển)\s+\d+/i.test(trimmed);
                if (!isChapter && !isPart) {
                    sceneHeadingIndex = i;
                    const m = trimmed.match(/^(#+)\s*/);
                    if (m) {
                        scenePrefix = m[1] + ' ';
                    }
                    break;
                }
            }
        }

        let newContent = '';
        if (sceneHeadingIndex !== -1) {
            lines[sceneHeadingIndex] = `${scenePrefix}${cleanTitle}`;
            newContent = lines.join('\n');
        } else {
            // Find insertion position after any chapter/part headers
            let insertPos = 0;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith('#')) {
                    insertPos = i + 1;
                } else if (lines[i].trim().length > 0) {
                    break;
                }
            }
            if (insertPos > 0) {
                lines.splice(insertPos, 0, '', `### ${cleanTitle}`, '');
                newContent = lines.join('\n');
            } else {
                newContent = `### ${cleanTitle}\n\n` + content;
            }
        }

        const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(content.length));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(sceneUri, fullRange, newContent);
        await vscode.workspace.applyEdit(edit);
        await doc.save();

        this.refresh();
        vscode.window.showInformationMessage(`Scene renamed to: "${cleanTitle}"`);
    }

    public async deleteChapter(targetItem?: ManuscriptTreeItem): Promise<void> {
        let chapFolder: vscode.Uri | undefined;
        let chapName = '';

        if (targetItem && targetItem.itemType === 'chapter') {
            chapFolder = targetItem.resourceUri;
            chapName = targetItem.label;
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) return;
            const rootUri = workspaceFolders[0].uri;
            const chapters = await this.findAllChapters(rootUri);
            if (chapters.length === 0) return;

            const picked = await vscode.window.showQuickPick(
                chapters.map(c => ({ label: c.label, uri: c.uri })),
                { placeHolder: 'Select chapter to delete' }
            );
            if (!picked) return;
            chapFolder = picked.uri;
            chapName = picked.label;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete chapter "${chapName}" and all scenes inside it?`,
            { modal: true },
            'Delete Chapter'
        );

        if (confirmation === 'Delete Chapter') {
            await vscode.workspace.fs.delete(chapFolder, { recursive: true, useTrash: true });
            this.refresh();
            vscode.window.showInformationMessage(`Deleted chapter "${chapName}".`);
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
