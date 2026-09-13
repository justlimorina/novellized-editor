import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as git from 'isomorphic-git';
import { SnapshotManager } from './snapshotManager';

export class NovellizedSourceControl implements vscode.Disposable {
    private sc: vscode.SourceControl;
    private changesGroup: vscode.SourceControlResourceGroup;
    private disposables: vscode.Disposable[] = [];
    private refreshTimer: NodeJS.Timeout | null = null;
    private isBusy = false;

    constructor(private readonly rootUri: vscode.Uri) {
        // Create source control provider in VS Code Source Control panel
        this.sc = vscode.scm.createSourceControl('novellized', 'Novellized Manuscript', rootUri);
        this.sc.inputBox.placeholder = 'Checkpoint note (e.g. Completed Chapter 1 revision)...';
        this.sc.acceptInputCommand = {
            command: 'novellized.scmCommit',
            title: 'Save Checkpoint',
            tooltip: 'Commit manuscript checkpoint (Ctrl+Enter)'
        };

        this.changesGroup = this.sc.createResourceGroup('changes', 'Changed Scenes & Drafts');
        this.changesGroup.hideWhenEmpty = true;

        this.disposables.push(this.sc);
        this.disposables.push(this.changesGroup);

        // Listen for save events
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument((doc) => {
                if (doc.uri.fsPath.endsWith('.md')) {
                    this.scheduleRefresh();
                }
            })
        );

        // Listen for file creations/deletions
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
        this.disposables.push(watcher);
        this.disposables.push(watcher.onDidCreate(() => this.scheduleRefresh()));
        this.disposables.push(watcher.onDidChange(() => this.scheduleRefresh()));
        this.disposables.push(watcher.onDidDelete(() => this.scheduleRefresh()));

        // Listen to snapshot events
        this.disposables.push(
            SnapshotManager.onDidSnapshot.event(() => {
                this.scheduleRefresh();
            })
        );

        // Register SCM commands
        this.disposables.push(
            vscode.commands.registerCommand('novellized.scmCommit', async () => {
                await this.commit();
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('novellized.scmDiff', async (resourceUri: vscode.Uri) => {
                if (resourceUri) {
                    await SnapshotManager.compareWithHead(resourceUri);
                }
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('novellized.scmDiscard', async (resourceState?: vscode.SourceControlResourceState) => {
                const targetUri = resourceState?.resourceUri || vscode.window.activeTextEditor?.document.uri;
                if (!targetUri) return;

                const name = path.basename(targetUri.fsPath);
                const confirm = await vscode.window.showWarningMessage(
                    `Discard changes in "${name}" and revert back to the last checkpoint?`,
                    { modal: true },
                    'Discard Changes'
                );

                if (confirm === 'Discard Changes') {
                    const success = await SnapshotManager.discardChanges(targetUri);
                    if (success) {
                        vscode.window.showInformationMessage(`Reverted "${name}" to previous checkpoint.`);
                        this.refresh();
                    } else {
                        vscode.window.showErrorMessage(`Could not revert "${name}".`);
                    }
                }
            })
        );

        this.disposables.push(
            vscode.commands.registerCommand('novellized.openSourceControl', async () => {
                await vscode.commands.executeCommand('workbench.view.scm');
            })
        );

        // Initial scan
        this.refresh();
    }

    public scheduleRefresh(): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => {
            this.refresh();
        }, 300);
    }

    public async refresh(): Promise<void> {
        if (this.isBusy) return;
        this.isBusy = true;

        try {
            const gitdir = SnapshotManager.getGitDir(this.rootUri);
            if (!fs.existsSync(gitdir)) {
                this.changesGroup.resourceStates = [];
                this.sc.count = 0;
                return;
            }

            const matrix = await git.statusMatrix({
                fs,
                dir: this.rootUri.fsPath,
                gitdir,
                filter: (f) => f.endsWith('.md') && !f.startsWith('.novel/')
            });

            const states: vscode.SourceControlResourceState[] = [];

            for (const [filepath, head, workdir] of matrix) {
                // If modified (1, 2, 1), new (0, 2, 0), or deleted (1, 0, 1)
                const isModified = workdir === 2 && head === 1;
                const isNew = head === 0 && workdir === 2;
                const isDeleted = workdir === 0 && head === 1;

                if (isModified || isNew || isDeleted) {
                    const fileUri = vscode.Uri.file(path.join(this.rootUri.fsPath, filepath));
                    states.push({
                        resourceUri: fileUri,
                        command: {
                            command: 'novellized.scmDiff',
                            title: 'Diff with Previous Checkpoint',
                            arguments: [fileUri]
                        },
                        decorations: {
                            strikeThrough: isDeleted,
                            tooltip: isNew ? 'New Scene (Untracked)' : isDeleted ? 'Deleted Scene' : 'Modified Scene'
                        }
                    });
                }
            }

            this.changesGroup.resourceStates = states;
            this.sc.count = states.length;
        } catch {
            this.changesGroup.resourceStates = [];
            this.sc.count = 0;
        } finally {
            this.isBusy = false;
        }
    }

    public async commit(): Promise<void> {
        const message = this.sc.inputBox.value.trim();
        if (!message) {
            const promptMsg = await vscode.window.showInputBox({
                title: 'Save Manuscript Checkpoint',
                prompt: 'Enter a checkpoint note describing what was written or changed',
                placeHolder: 'e.g., Finished Chapter 2 revision'
            });
            if (!promptMsg) return;
            this.sc.inputBox.value = promptMsg;
        }

        const commitLabel = this.sc.inputBox.value.trim();
        const oid = await SnapshotManager.createProjectCheckpoint(this.rootUri, commitLabel);

        if (oid) {
            this.sc.inputBox.value = '';
            vscode.window.showInformationMessage(`Checkpoint "${commitLabel}" saved (#${oid.slice(0, 7)}).`);
            await this.refresh();
        } else {
            vscode.window.showInformationMessage('No changes detected in manuscript to checkpoint.');
        }
    }

    public dispose(): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.disposables.forEach((d) => d.dispose());
    }
}
