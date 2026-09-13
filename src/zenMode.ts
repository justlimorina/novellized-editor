import * as vscode from 'vscode';

export class ZenModeManager {
    public static async toggleZenMode(): Promise<void> {
        const config = vscode.workspace.getConfiguration('zenMode');
        
        // Ensure optimal novelist Zen Mode configuration
        await config.update('centerLayout', true, vscode.ConfigurationTarget.Global);
        await config.update('hideActivityBar', true, vscode.ConfigurationTarget.Global);
        await config.update('hideStatusBar', true, vscode.ConfigurationTarget.Global);
        await config.update('hideTabs', false, vscode.ConfigurationTarget.Global); // keep document tabs visible for switching scenes
        await config.update('fullScreen', true, vscode.ConfigurationTarget.Global);

        // Execute VS Code Zen Mode toggle
        await vscode.commands.executeCommand('workbench.action.toggleZenMode');
    }
}

