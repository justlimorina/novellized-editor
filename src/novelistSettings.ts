import * as vscode from 'vscode';

export async function applyNovelistPreset(): Promise<void> {
    const editorConfig = vscode.workspace.getConfiguration('editor');
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');

    const hasWorkspace = !!(vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0);
    const target = hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;

    // 1. Text Editor Settings for Prose
    await editorConfig.update('wordWrap', 'on', target);
    await editorConfig.update('lineNumbers', 'off', target);
    await editorConfig.update('minimap.enabled', false, target);
    await editorConfig.update('renderWhitespace', 'none', target);
    await editorConfig.update('quickSuggestions', { other: false, comments: false, strings: false }, target);
    await editorConfig.update('fontSize', 16, target);
    await editorConfig.update('lineHeight', 28, target);
    await editorConfig.update('cursorBlinking', 'smooth', target);
    await editorConfig.update('cursorSmoothCaretAnimation', 'on', target);

    // 2. Hide programming-specific telemetry
    await workbenchConfig.update('enableExperiments', false, target);

    vscode.window.showInformationMessage(
        hasWorkspace
            ? '✓ Novellized Writer Preset applied to this workspace! Clean typography and word wrap enabled.'
            : '✓ Novellized Writer Preset applied globally! Clean typography and word wrap enabled.'
    );
}

