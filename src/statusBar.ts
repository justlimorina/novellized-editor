import * as vscode from 'vscode';
import { countWords } from './wordCount';

export class WriterStatusBarManager implements vscode.Disposable {
    private goalItem: vscode.StatusBarItem;
    private readingTimeItem: vscode.StatusBarItem;
    private activeChapterItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];
    private updateDebounceTimer: NodeJS.Timeout | null = null;

    constructor() {
        // 1. Word Count & Target Goal Status Bar Item
        this.goalItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.goalItem.command = 'novellized.setWordGoal';
        this.goalItem.tooltip = 'Click to set target word count';
        this.disposables.push(this.goalItem);

        // 2. Estimated Reading Time Status Bar Item
        this.readingTimeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.readingTimeItem.tooltip = 'Estimated reading time at 200 words per minute';
        this.disposables.push(this.readingTimeItem);

        // 3. Active Chapter / Scene Context
        this.activeChapterItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
        this.activeChapterItem.tooltip = 'Current Chapter & Scene';
        this.disposables.push(this.activeChapterItem);

        // Listeners for real-time updates
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.update()),
            vscode.workspace.onDidSaveTextDocument(() => this.update()),
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (e.document.fileName.endsWith('.md')) {
                    this.debounceUpdate();
                }
            })
        );

        // Initial update
        this.update();
    }

    public refresh(): void {
        this.update();
    }

    private debounceUpdate(): void {
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
        }
        this.updateDebounceTimer = setTimeout(() => {
            this.update();
        }, 1500);
    }

    public async update(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.goalItem.hide();
            this.readingTimeItem.hide();
            this.activeChapterItem.hide();
            return;
        }

        const rootUri = workspaceFolders[0].uri;

        try {
            // Read .novel/project.json
            const projectConfig = await this.readProjectConfig(rootUri);
            const targetWordCount = projectConfig?.targetWordCount || 50000;
            const title = projectConfig?.title || 'Novel';

            // Calculate total manuscript words
            const totalWords = await this.computeTotalWords(rootUri);
            const percent = targetWordCount > 0 ? ((totalWords / targetWordCount) * 100).toFixed(1) : '0.0';

            // Update Goal Item
            this.goalItem.text = `$(target) ${totalWords.toLocaleString()} / ${targetWordCount.toLocaleString()} w (${percent}%)`;
            this.goalItem.tooltip = `Tác phẩm: ${title}\nTiến độ: ${totalWords.toLocaleString()} / ${targetWordCount.toLocaleString()} từ (${percent}%)\nBấm vào để thay đổi mục tiêu số từ.`;
            this.goalItem.show();

            // Update Reading Time Item
            const readingMinutes = Math.ceil(totalWords / 200);
            const readingHours = (readingMinutes / 60).toFixed(1);
            const readingTimeStr = readingMinutes < 60
                ? `~${readingMinutes} min`
                : `~${readingHours}h (${readingMinutes}m)`;
            this.readingTimeItem.text = `$(watch) ${readingTimeStr}`;
            this.readingTimeItem.tooltip = `Thời gian đọc ước tính (~200 từ/phút): ${readingTimeStr}`;
            this.readingTimeItem.show();

            // Active Chapter/Scene detection
            const activeUri = vscode.window.activeTextEditor?.document.uri;
            if (activeUri && activeUri.fsPath.endsWith('.md')) {
                const chapName = await this.detectCurrentChapterName(activeUri, rootUri);
                if (chapName) {
                    this.activeChapterItem.text = `$(book) ${chapName}`;
                    this.activeChapterItem.show();
                } else {
                    this.activeChapterItem.hide();
                }
            } else {
                this.activeChapterItem.hide();
            }
        } catch {
            // Ignore error
        }
    }

    private async readProjectConfig(rootUri: vscode.Uri): Promise<any> {
        try {
            const configUri = vscode.Uri.joinPath(rootUri, '.novel', 'project.json');
            const data = await vscode.workspace.fs.readFile(configUri);
            return JSON.parse(Buffer.from(data).toString('utf8'));
        } catch {
            return null;
        }
    }

    private async computeTotalWords(rootUri: vscode.Uri): Promise<number> {
        let total = 0;
        try {
            const entries = await vscode.workspace.fs.readDirectory(rootUri);
            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory && /^part[-_]/i.test(name)) {
                    const partUri = vscode.Uri.joinPath(rootUri, name);
                    const subEntries = await vscode.workspace.fs.readDirectory(partUri);
                    for (const [chapName, chapType] of subEntries) {
                        if (chapType === vscode.FileType.Directory && /^chapter[-_]/i.test(chapName)) {
                            total += await this.computeFolderWords(vscode.Uri.joinPath(partUri, chapName));
                        }
                    }
                } else if (type === vscode.FileType.Directory && /^chapter[-_]/i.test(name)) {
                    total += await this.computeFolderWords(vscode.Uri.joinPath(rootUri, name));
                }
            }
        } catch {
            // Ignore
        }
        return total;
    }

    private async computeFolderWords(folderUri: vscode.Uri): Promise<number> {
        let total = 0;
        try {
            const entries = await vscode.workspace.fs.readDirectory(folderUri);
            for (const [name, type] of entries) {
                if (type === vscode.FileType.File && name.endsWith('.md')) {
                    const fileUri = vscode.Uri.joinPath(folderUri, name);
                    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === fileUri.toString());
                    let text = '';
                    if (openDoc) {
                        text = openDoc.getText();
                    } else {
                        const raw = await vscode.workspace.fs.readFile(fileUri);
                        text = Buffer.from(raw).toString('utf8');
                    }
                    total += countWords(text);
                }
            }
        } catch {
            // Ignore
        }
        return total;
    }

    private async detectCurrentChapterName(activeUri: vscode.Uri, rootUri: vscode.Uri): Promise<string | null> {
        const relative = vscode.workspace.asRelativePath(activeUri, false);
        const segments = relative.split(/[/\\]/);
        
        let chapterFolderUri: vscode.Uri | null = null;
        let chapterDirName = '';

        for (let i = 0; i < segments.length; i++) {
            if (/^chapter[-_]/i.test(segments[i])) {
                chapterDirName = segments[i];
                chapterFolderUri = vscode.Uri.joinPath(rootUri, ...segments.slice(0, i + 1));
                break;
            }
        }

        if (!chapterFolderUri) return null;

        // Check chapter.json
        try {
            const metaUri = vscode.Uri.joinPath(chapterFolderUri, 'chapter.json');
            const data = await vscode.workspace.fs.readFile(metaUri);
            const parsed = JSON.parse(Buffer.from(data).toString('utf8'));
            if (parsed && typeof parsed.title === 'string' && parsed.title.trim().length > 0) {
                return parsed.title.trim();
            }
        } catch {
            // Continue
        }

        return chapterDirName.replace(/^chapter[-_]/i, 'Chapter ').replace(/[-_]/g, ' ');
    }

    public dispose(): void {
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
        }
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}

