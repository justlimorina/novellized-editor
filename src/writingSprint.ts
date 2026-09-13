import * as vscode from 'vscode';
import { countWords } from './wordCount';

export class WritingSprintManager implements vscode.Disposable {
    private static instance: WritingSprintManager | null = null;

    private statusBarItem: vscode.StatusBarItem;
    private timer: NodeJS.Timeout | null = null;
    private sprintDurationSeconds: number = 0;
    private remainingSeconds: number = 0;
    private initialWords: number = 0;
    private currentSessionWords: number = 0;
    private isRunning: boolean = false;
    private rootWorkspaceUri: vscode.Uri | null = null;

    public static getInstance(): WritingSprintManager {
        if (!this.instance) {
            this.instance = new WritingSprintManager();
        }
        return this.instance;
    }

    private constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
        this.statusBarItem.command = 'novellized.startWritingSprint';
        this.statusBarItem.tooltip = 'Writing Sprint: Click to manage sprint session';
    }

    /**
     * Starts or cancels a writing sprint
     */
    public async promptSprint(): Promise<void> {
        if (this.isRunning) {
            const action = await vscode.window.showWarningMessage(
                `A Writing Sprint is currently running (${this.formatTime(this.remainingSeconds)} left).`,
                'Stop Sprint',
                'Keep Going'
            );
            if (action === 'Stop Sprint') {
                this.stopSprint(false);
            }
            return;
        }

        const picked = await vscode.window.showQuickPick([
            { label: '15 Minutes Sprint', description: 'Quick power session', value: 15 },
            { label: '20 Minutes Sprint', description: 'Standard writing burst', value: 20 },
            { label: '25 Minutes (Pomodoro)', description: 'Classic focus interval', value: 25 },
            { label: '30 Minutes Sprint', description: 'Deep flow session', value: 30 },
            { label: '45 Minutes Sprint', description: 'Extended chapter draft', value: 45 },
            { label: 'Custom Duration...', description: 'Specify custom minutes', value: -1 }
        ], {
            title: 'Novellized Writing Sprint',
            placeHolder: 'Select sprint duration to boost your writing momentum'
        });

        if (!picked) return;

        let minutes = picked.value;
        if (minutes === -1) {
            const customInput = await vscode.window.showInputBox({
                prompt: 'Enter sprint duration in minutes (e.g., 10, 40)',
                validateInput: val => {
                    const n = parseInt(val, 10);
                    return (!n || n <= 0 || n > 240) ? 'Please enter a valid number between 1 and 240 minutes' : null;
                }
            });
            if (!customInput) return;
            minutes = parseInt(customInput, 10);
        }

        await this.startSprint(minutes);
    }

    public async startSprint(minutes: number): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('Please open a novel project workspace before starting a sprint.');
            return;
        }

        this.rootWorkspaceUri = workspaceFolders[0].uri;
        this.initialWords = await this.computeCurrentWorkspaceWords(this.rootWorkspaceUri);
        this.sprintDurationSeconds = minutes * 60;
        this.remainingSeconds = this.sprintDurationSeconds;
        this.currentSessionWords = 0;
        this.isRunning = true;

        this.updateStatusBar();
        this.statusBarItem.show();

        if (this.timer) {
            clearInterval(this.timer);
        }

        this.timer = setInterval(async () => {
            this.remainingSeconds--;

            // Update word difference every 5 seconds
            if (this.remainingSeconds % 5 === 0 && this.rootWorkspaceUri) {
                const currentTotal = await this.computeCurrentWorkspaceWords(this.rootWorkspaceUri);
                this.currentSessionWords = Math.max(0, currentTotal - this.initialWords);
            }

            this.updateStatusBar();

            if (this.remainingSeconds <= 0) {
                await this.completeSprint();
            }
        }, 1000);

        vscode.window.showInformationMessage(`Writing Sprint started: ${minutes} minutes on the clock.`);
    }

    public async stopSprint(silent: boolean = false): Promise<void> {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
        this.statusBarItem.hide();

        if (!silent) {
            vscode.window.showInformationMessage('Writing Sprint stopped.');
        }
    }

    private async completeSprint(): Promise<void> {
        this.stopSprint(true);

        if (this.rootWorkspaceUri) {
            const finalWords = await this.computeCurrentWorkspaceWords(this.rootWorkspaceUri);
            this.currentSessionWords = Math.max(0, finalWords - this.initialWords);
        }

        const durationMinutes = Math.round(this.sprintDurationSeconds / 60);
        const wpm = durationMinutes > 0 ? (this.currentSessionWords / durationMinutes).toFixed(1) : '0';

        vscode.window.showInformationMessage(
            `Sprint Complete: You wrote ${this.currentSessionWords.toLocaleString()} words in ${durationMinutes} minutes (~${wpm} wpm).`,
            { modal: true },
            'Close'
        );
    }

    private updateStatusBar(): void {
        const timeStr = this.formatTime(this.remainingSeconds);
        const elapsedMinutes = Math.max(0.1, (this.sprintDurationSeconds - this.remainingSeconds) / 60);
        const wpm = Math.round(this.currentSessionWords / elapsedMinutes);

        this.statusBarItem.text = `$(flame) Sprint: ${timeStr} (+${this.currentSessionWords} w · ${wpm} wpm)`;
        this.statusBarItem.tooltip = `Writing Sprint Active\nRemaining: ${timeStr}\nWords added this session: ${this.currentSessionWords}\nSpeed: ~${wpm} words/min`;
    }

    private formatTime(totalSeconds: number): string {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    private async computeCurrentWorkspaceWords(rootUri: vscode.Uri): Promise<number> {
        let total = 0;
        try {
            const entries = await vscode.workspace.fs.readDirectory(rootUri);
            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory && (/^part[-_]/i.test(name) || /^chapter[-_]/i.test(name))) {
                    total += await this.computeFolderWords(vscode.Uri.joinPath(rootUri, name));
                } else if (type === vscode.FileType.File && name.endsWith('.md') && !name.toLowerCase().startsWith('readme')) {
                    total += await this.readWordCount(vscode.Uri.joinPath(rootUri, name));
                }
            }
        } catch { }
        return total;
    }

    private async computeFolderWords(folderUri: vscode.Uri): Promise<number> {
        let total = 0;
        try {
            const entries = await vscode.workspace.fs.readDirectory(folderUri);
            for (const [name, type] of entries) {
                if (type === vscode.FileType.File && name.endsWith('.md')) {
                    total += await this.readWordCount(vscode.Uri.joinPath(folderUri, name));
                } else if (type === vscode.FileType.Directory) {
                    total += await this.computeFolderWords(vscode.Uri.joinPath(folderUri, name));
                }
            }
        } catch { }
        return total;
    }

    private async readWordCount(uri: vscode.Uri): Promise<number> {
        try {
            const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
            let text = '';
            if (openDoc) {
                text = openDoc.getText();
            } else {
                const raw = await vscode.workspace.fs.readFile(uri);
                text = Buffer.from(raw).toString('utf8');
            }
            return countWords(text);
        } catch {
            return 0;
        }
    }

    public dispose(): void {
        this.stopSprint(true);
        this.statusBarItem.dispose();
    }
}
