import * as vscode from 'vscode';
import { countWords } from './wordCount';

export class ProjectStatsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
        const projectConfig = await this.readProjectConfig(rootUri);
        const stats = await this.computeManuscriptMetrics(rootUri);

        const targetWordCount = projectConfig?.targetWordCount || 50000;
        const title = projectConfig?.title || 'Untitled Novel';
        const author = projectConfig?.author || 'Anonymous';
        const percent = targetWordCount > 0 ? ((stats.totalWords / targetWordCount) * 100).toFixed(1) : '0.0';

        // Progress bar (20 blocks)
        const filledBlocks = Math.min(20, Math.round((stats.totalWords / targetWordCount) * 20));
        const progressBar = `[${'█'.repeat(filledBlocks)}${'░'.repeat(20 - filledBlocks)}] ${percent}%`;

        // Reading time
        const readingMinutes = Math.ceil(stats.totalWords / 200);
        const readingHours = (readingMinutes / 60).toFixed(1);
        const readingTimeStr = readingMinutes < 60
            ? `~${readingMinutes} min`
            : `~${readingHours} hours (${readingMinutes} min)`;

        const items: vscode.TreeItem[] = [];

        // 1. Novel Info
        const infoItem = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.None);
        infoItem.description = `by ${author}`;
        infoItem.iconPath = new vscode.ThemeIcon('book');
        infoItem.tooltip = `Novel: ${title}\nAuthor: ${author}`;
        items.push(infoItem);

        // 2. Word Goal
        const goalItem = new vscode.TreeItem(`Goal: ${stats.totalWords.toLocaleString()} / ${targetWordCount.toLocaleString()} words`, vscode.TreeItemCollapsibleState.None);
        goalItem.description = `${percent}%`;
        goalItem.iconPath = new vscode.ThemeIcon('target');
        goalItem.tooltip = `Click to edit target word count (Current: ${targetWordCount.toLocaleString()})`;
        goalItem.command = {
            command: 'novellized.setWordGoal',
            title: 'Set Target Word Count'
        };
        items.push(goalItem);

        // 3. Progress Bar
        const barItem = new vscode.TreeItem(progressBar, vscode.TreeItemCollapsibleState.None);
        barItem.description = 'Progress';
        barItem.iconPath = new vscode.ThemeIcon('graph-line');
        items.push(barItem);

        // 4. Reading Time
        const timeItem = new vscode.TreeItem(`Est. Reading Time`, vscode.TreeItemCollapsibleState.None);
        timeItem.description = readingTimeStr;
        timeItem.iconPath = new vscode.ThemeIcon('watch');
        timeItem.tooltip = `Based on 200 words per minute average reading speed`;
        items.push(timeItem);

        // 5. Structure Breakdown
        const scaleDesc = `${stats.partsCount > 0 ? `${stats.partsCount} Parts · ` : ''}${stats.chaptersCount} Chapters · ${stats.scenesCount} Scenes`;
        const scaleItem = new vscode.TreeItem(`Manuscript Scale`, vscode.TreeItemCollapsibleState.None);
        scaleItem.description = scaleDesc;
        scaleItem.iconPath = new vscode.ThemeIcon('layers');
        items.push(scaleItem);

        return items;
    }

    private async readProjectConfig(rootUri: vscode.Uri): Promise<{ title?: string; author?: string; targetWordCount?: number } | null> {
        try {
            const configUri = vscode.Uri.joinPath(rootUri, '.novel', 'project.json');
            const data = await vscode.workspace.fs.readFile(configUri);
            return JSON.parse(Buffer.from(data).toString('utf8'));
        } catch {
            return null;
        }
    }

    private async computeManuscriptMetrics(rootUri: vscode.Uri): Promise<{
        totalWords: number;
        partsCount: number;
        chaptersCount: number;
        scenesCount: number;
    }> {
        let totalWords = 0;
        let partsCount = 0;
        let chaptersCount = 0;
        let scenesCount = 0;

        try {
            const entries = await vscode.workspace.fs.readDirectory(rootUri);

            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory && /^part[-_]/i.test(name)) {
                    partsCount++;
                    const partUri = vscode.Uri.joinPath(rootUri, name);
                    const chapEntries = await vscode.workspace.fs.readDirectory(partUri);

                    for (const [chapName, chapType] of chapEntries) {
                        if (chapType === vscode.FileType.Directory && /^chapter[-_]/i.test(chapName)) {
                            chaptersCount++;
                            const chapUri = vscode.Uri.joinPath(partUri, chapName);
                            const sceneEntries = await vscode.workspace.fs.readDirectory(chapUri);

                            for (const [sName, sType] of sceneEntries) {
                                if (sType === vscode.FileType.File && sName.endsWith('.md')) {
                                    scenesCount++;
                                    totalWords += await this.readWordCount(vscode.Uri.joinPath(chapUri, sName));
                                }
                            }
                        }
                    }
                } else if (type === vscode.FileType.Directory && /^chapter[-_]/i.test(name)) {
                    chaptersCount++;
                    const chapUri = vscode.Uri.joinPath(rootUri, name);
                    const sceneEntries = await vscode.workspace.fs.readDirectory(chapUri);

                    for (const [sName, sType] of sceneEntries) {
                        if (sType === vscode.FileType.File && sName.endsWith('.md')) {
                            scenesCount++;
                            totalWords += await this.readWordCount(vscode.Uri.joinPath(chapUri, sName));
                        }
                    }
                }
            }
        } catch {
            // Ignore traversal errors
        }

        return { totalWords, partsCount, chaptersCount, scenesCount };
    }

    private async readWordCount(uri: vscode.Uri): Promise<number> {
        try {
            const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
            let content = '';
            if (openDoc) {
                content = openDoc.getText();
            } else {
                const raw = await vscode.workspace.fs.readFile(uri);
                content = Buffer.from(raw).toString('utf8');
            }
            return countWords(content);
        } catch {
            return 0;
        }
    }

    public async setWordGoal(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;
        const rootUri = workspaceFolders[0].uri;
        const configUri = vscode.Uri.joinPath(rootUri, '.novel', 'project.json');

        let currentConfig: any = {};
        try {
            const data = await vscode.workspace.fs.readFile(configUri);
            currentConfig = JSON.parse(Buffer.from(data).toString('utf8'));
        } catch {
            // Fallback default
        }

        const currentGoal = currentConfig.targetWordCount || 50000;
        const input = await vscode.window.showInputBox({
            prompt: 'Enter target novel word count',
            value: String(currentGoal),
            validateInput: val => {
                const num = parseInt(val, 10);
                if (isNaN(num) || num <= 0) return 'Please enter a positive number of words';
                return null;
            }
        });

        if (!input) return;
        const newGoal = parseInt(input, 10);
        currentConfig.targetWordCount = newGoal;

        const novelDirUri = vscode.Uri.joinPath(rootUri, '.novel');
        await vscode.workspace.fs.createDirectory(novelDirUri);
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(configUri, encoder.encode(JSON.stringify(currentConfig, null, 2)));

        this.refresh();
        vscode.window.showInformationMessage(`Target word count updated to ${newGoal.toLocaleString()} words!`);
    }
}
