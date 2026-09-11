import * as vscode from 'vscode';
import { NovellizedEditorProvider } from './NovellizedEditorProvider';
import { createNewNovelProject } from './projectInit';

export function activate(context: vscode.ExtensionContext) {
    console.log('Novellized Prose Editor is now active.');

    // Register custom text editor provider for Markdown files
    context.subscriptions.push(NovellizedEditorProvider.register(context));

    // Command to quickly switch to Monaco (Raw Markdown)
    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.openAsRawMarkdown', async () => {
            await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
        })
    );

    // Command to switch back to Novellized Live View
    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.openAsLiveView', async (uri?: vscode.Uri) => {
            const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (targetUri) {
                await vscode.commands.executeCommand('vscode.openWith', targetUri, 'novellized.editor');
            }
        })
    );

    // Command to initialize a new novel project structure
    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.createNewNovel', async () => {
            await createNewNovelProject();
        })
    );
}

export function deactivate() {}

