import * as vscode from 'vscode';

export async function applyNovelistPreset(): Promise<void> {
    const editorConfig = vscode.workspace.getConfiguration('editor');
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');

    // 1. Text Editor Settings for Prose
    await editorConfig.update('wordWrap', 'on', vscode.ConfigurationTarget.Global);
    await editorConfig.update('lineNumbers', 'off', vscode.ConfigurationTarget.Global);
    await editorConfig.update('minimap.enabled', false, vscode.ConfigurationTarget.Global);
    await editorConfig.update('renderWhitespace', 'none', vscode.ConfigurationTarget.Global);
    await editorConfig.update('quickSuggestions', { other: false, comments: false, strings: false }, vscode.ConfigurationTarget.Global);
    await editorConfig.update('fontSize', 16, vscode.ConfigurationTarget.Global);
    await editorConfig.update('lineHeight', 28, vscode.ConfigurationTarget.Global);
    await editorConfig.update('cursorBlinking', 'smooth', vscode.ConfigurationTarget.Global);
    await editorConfig.update('cursorSmoothCaretAnimation', 'on', vscode.ConfigurationTarget.Global);

    // 2. Hide programming-specific telemetry
    await workbenchConfig.update('enableExperiments', false, vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage(
        '✓ Novellized Writer Preset applied! Distraction-free typography, word wrap, and clean writing mode enabled.'
    );
}

