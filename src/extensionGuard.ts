import * as vscode from 'vscode';

/**
 * Checks whether an extension is literature/writing friendly, a theme,
 * an AI assistant/agent, or a general productivity tool for writers.
 */
export function isLiteratureOrAllowedExtension(ext: vscode.Extension<any>): boolean {
    const id = ext.id.toLowerCase();

    // 1. Built-in VS Code / VSCodium or Novellized extensions
    if (id.startsWith('novellized.') || id.startsWith('vscode.') || id.startsWith('vscodium.')) {
        return true;
    }

    const pkg = ext.packageJSON || {};
    const name = String(pkg.name || '').toLowerCase();
    const displayName = String(pkg.displayName || '').toLowerCase();
    const description = String(pkg.description || '').toLowerCase();
    const categories: string[] = Array.isArray(pkg.categories) 
        ? pkg.categories.map((c: any) => String(c).toLowerCase()) 
        : [];
    const keywords: string[] = Array.isArray(pkg.keywords) 
        ? pkg.keywords.map((k: any) => String(k).toLowerCase()) 
        : [];

    const allText = `${id} ${name} ${displayName} ${description} ${categories.join(' ')} ${keywords.join(' ')}`;

    // 2. Themes, Icons, Fonts, Keymaps, Language packs
    if (categories.some(c => c === 'themes' || c === 'product icon themes' || c === 'keymaps' || c === 'language packs')) {
        return true;
    }

    // 3. Writing / Literature / Publishing / Book keywords
    const writingKeywords = [
        'novel', 'fiction', 'writing', 'writer', 'prose', 'author', 'book', 'manuscript',
        'markdown', 'latex', 'pdf', 'epub', 'docx', 'text', 'story', 'storytelling',
        'spell', 'spelling', 'grammar', 'thesaurus', 'dictionary', 'languagetool',
        'word count', 'readability', 'proofreading', 'fountain', 'screenplay',
        'media preview', 'preview', 'image', 'photo', 'audio', 'tts', 'text-to-speech',
        'typewriter', 'focus', 'zen'
    ];

    if (writingKeywords.some(kw => allText.includes(kw))) {
        return true;
    }

    // 4. AI Agents & LLM Assistants (explicitly permitted by user)
    const aiKeywords = [
        'ai', 'copilot', 'assistant', 'chat', 'llm', 'gpt', 'claude', 'gemini',
        'openai', 'anthropic', 'deepseek', 'ollama', 'mistral', 'llama', 'agent',
        'codeium', 'supermaven', 'cursor', 'tabnine'
    ];

    if (aiKeywords.some(kw => allText.includes(kw))) {
        return true;
    }

    // 5. Developer tools (languages, compilers, debuggers, linters)
    const devCategories = [
        'programming languages',
        'debuggers',
        'linters',
        'testing',
        'build systems',
        'notebooks',
        'data science',
        'machine learning',
        'azure',
        'devops'
    ];

    if (categories.some(c => devCategories.includes(c))) {
        return false;
    }

    // Default: not matching literature / theme / AI criteria
    return false;
}

/**
 * Initializes the extension advisor/guard that warns the user when installing
 * programming or non-writing extensions in Novellized Studio.
 */
export function initExtensionGuard(context: vscode.ExtensionContext) {
    const STATE_KEY = 'novellized.acknowledgedExtensions';
    const acknowledged = new Set<string>(context.globalState.get<string[]>(STATE_KEY, []));

    // Track known extension IDs
    let knownExtensionIds = new Set<string>(vscode.extensions.all.map(e => e.id.toLowerCase()));

    context.subscriptions.push(
        vscode.extensions.onDidChange(async () => {
            const currentExtensions = vscode.extensions.all;
            const currentIds = new Set<string>(currentExtensions.map(e => e.id.toLowerCase()));

            // Find newly installed extensions
            const newlyInstalled = currentExtensions.filter(e => {
                const lowerId = e.id.toLowerCase();
                return !knownExtensionIds.has(lowerId);
            });

            // Update known extensions
            knownExtensionIds = currentIds;

            for (const ext of newlyInstalled) {
                const lowerId = ext.id.toLowerCase();
                if (acknowledged.has(lowerId)) {
                    continue;
                }

                if (!isLiteratureOrAllowedExtension(ext)) {
                    acknowledged.add(lowerId);
                    await context.globalState.update(STATE_KEY, Array.from(acknowledged));

                    const displayName = ext.packageJSON?.displayName || ext.packageJSON?.name || ext.id;
                    const choice = await vscode.window.showWarningMessage(
                        `⚠️ Novellized Studio: The extension "${displayName}" appears to be a developer tool and is not optimized for novel writing. It may add unnecessary clutter or impact performance.`,
                        'View Details',
                        'Keep Anyway'
                    );

                    if (choice === 'View Details') {
                        vscode.commands.executeCommand('extension.open', ext.id);
                    }
                }
            }
        })
    );
}

