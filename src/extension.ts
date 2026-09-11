import * as vscode from 'vscode';
import { NovellizedEditorProvider } from './NovellizedEditorProvider';
import { createNewNovelProject } from './projectInit';

import { ManuscriptTreeProvider, ManuscriptTreeItem } from './manuscriptTree';
import { ProjectStatsTreeProvider } from './projectStatsTree';
import { BibleTreeProvider } from './bibleTree';

export function activate(context: vscode.ExtensionContext) {
    console.log('Novellized Prose Editor is now active.');

    // Initialize Tree Providers for Activity Bar
    const manuscriptProvider = new ManuscriptTreeProvider();
    const statsProvider = new ProjectStatsTreeProvider();
    const bibleProvider = new BibleTreeProvider();

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('novellized.manuscriptView', manuscriptProvider),
        vscode.window.registerTreeDataProvider('novellized.projectStatsView', statsProvider),
        vscode.window.registerTreeDataProvider('novellized.bibleView', bibleProvider)
    );

    const refreshAll = () => {
        manuscriptProvider.refresh();
        statsProvider.refresh();
        bibleProvider.refresh();
    };

    // Watch files to update word count and structure in real-time
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{md,json}');
    fileWatcher.onDidCreate(refreshAll);
    fileWatcher.onDidChange(refreshAll);
    fileWatcher.onDidDelete(refreshAll);
    context.subscriptions.push(fileWatcher);

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(refreshAll)
    );

    // Register custom text editor provider for Markdown files
    context.subscriptions.push(NovellizedEditorProvider.register(context));

    // Command to quickly switch to Monaco (Raw Markdown)
    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.openAsRawMarkdown', async (item?: ManuscriptTreeItem) => {
            if (item && item.resourceUri) {
                const doc = await vscode.workspace.openTextDocument(item.resourceUri);
                await vscode.window.showTextDocument(doc);
            } else {
                await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
            }
        })
    );

    // Command to switch back to Novellized Live View
    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.openAsLiveView', async (uriOrItem?: vscode.Uri | ManuscriptTreeItem) => {
            let targetUri: vscode.Uri | undefined;
            if (uriOrItem instanceof vscode.Uri) {
                targetUri = uriOrItem;
            } else if (uriOrItem && 'resourceUri' in uriOrItem) {
                targetUri = uriOrItem.resourceUri;
            } else {
                targetUri = vscode.window.activeTextEditor?.document.uri;
            }

            if (targetUri) {
                await vscode.commands.executeCommand('vscode.openWith', targetUri, 'novellized.editor');
            }
        })
    );

    // Command to initialize a new novel project structure
    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.createNewNovel', async () => {
            await createNewNovelProject();
            refreshAll();
        })
    );

    // Manuscript Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.refreshManuscript', () => {
            refreshAll();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.addScene', async (item?: ManuscriptTreeItem) => {
            await manuscriptProvider.addScene(item);
            statsProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.addChapter', async (item?: ManuscriptTreeItem) => {
            await manuscriptProvider.addChapter(item);
            statsProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.setWordGoal', async () => {
            await statsProvider.setWordGoal();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.deleteScene', async (item?: ManuscriptTreeItem) => {
            if (item && item.resourceUri) {
                const answer = await vscode.window.showWarningMessage(
                    `Are you sure you want to delete scene "${item.label}"?`,
                    { modal: true },
                    'Delete'
                );
                if (answer === 'Delete') {
                    await vscode.workspace.fs.delete(item.resourceUri, { useTrash: true });
                    refreshAll();
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.createMissingBibleDoc', async (relativePath: string) => {
            await bibleProvider.createMissingDoc(relativePath);
        })
    );
}

export function deactivate() {}

