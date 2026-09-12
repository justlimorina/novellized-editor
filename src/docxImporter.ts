import * as vscode from 'vscode';
import * as path from 'path';
import * as mammoth from 'mammoth';
import { countWords } from './wordCount';

interface ParsedSection {
    type: 'chapter' | 'scene' | 'characters' | 'worldbuilding' | 'outline' | 'prologue' | 'epilogue';
    title: string;
    chapterNumber?: number;
    lines: string[];
}

export async function importDocxManuscript(): Promise<void> {
    // 1. Pick .docx file
    const fileUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Import Word Manuscript (.docx)',
        filters: {
            'Word Documents': ['docx']
        }
    });

    if (!fileUris || fileUris.length === 0) {
        return;
    }

    const docxUri = fileUris[0];
    const docxFilename = path.basename(docxUri.fsPath, path.extname(docxUri.fsPath));

    // 2. Determine target workspace
    let targetRoot: vscode.Uri;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        targetRoot = workspaceFolders[0].uri;
    } else {
        const pickedFolders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Folder for Imported Novel'
        });
        if (!pickedFolders || pickedFolders.length === 0) return;
        targetRoot = pickedFolders[0];
    }

    // 3. User chooses the intent / destination for this file
    const destinationPick = await vscode.window.showQuickPick([
        {
            label: '$(sparkle) Staging for AI Agent (inbox/) - Recommended',
            description: 'Save to inbox/ & auto-copy AI classification prompt',
            detail: 'Best for mixed notes, raw worldbuilding, or full drafts. AI Agent will organize it cleanly.',
            value: 'inbox' as const
        },
        {
            label: '$(globe) Worldbuilding & Lore (docs/worldbuilding.md)',
            description: 'Save directly to worldbuilding document',
            detail: 'Best for magic systems, geography, factions, power levels, or historical setting notes.',
            value: 'worldbuilding' as const
        },
        {
            label: '$(person) Character Bible (docs/characters.md)',
            description: 'Save directly to character profiles document',
            detail: 'Best for character sheets, appearance descriptions, backstories, and motivations.',
            value: 'characters' as const
        },
        {
            label: '$(milestone) Master Outline (docs/outline.md)',
            description: 'Save directly to plot outline document',
            detail: 'Best for 3-act story beats, synopses, and chapter milestones.',
            value: 'outline' as const
        },
        {
            label: '$(file-text) Single Story Scene (Manuscript)',
            description: 'Import as a single .md scene inside a chapter',
            detail: 'Best for an individual written scene or short narrative passage.',
            value: 'scene' as const
        },
        {
            label: '$(split-horizontal) Auto-Split by Chapters (Heuristic)',
            description: 'Split into chapter_01, chapter_02... by headings',
            detail: 'Use only if the Word file is strictly formatted with Chapter 1, Chapter 2 headings.',
            value: 'heuristic_split' as const
        }
    ], {
        title: 'Novellized: What kind of content is this?',
        placeHolder: 'Select where this Word document belongs in your novel project'
    });

    if (!destinationPick) return;

    // 4. Progress notification & conversion
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Novellized: Importing "${docxFilename}.docx"...`,
        cancellable: false
    }, async (progress) => {
        progress.report({ message: 'Converting Word document to Markdown...' });

        const rawBytes = await vscode.workspace.fs.readFile(docxUri);
        const buffer = Buffer.from(rawBytes);
        const conversionResult = await mammoth.convertToMarkdown({ buffer });
        const rawMarkdown = cleanWordMarkdown(conversionResult.value);

        if (!rawMarkdown.trim()) {
            vscode.window.showWarningMessage('The selected Word document appears to be empty.');
            return;
        }

        const encoder = new TextEncoder();
        const totalWords = countWords(rawMarkdown);
        let openedUri: vscode.Uri | undefined;

        switch (destinationPick.value) {
            case 'inbox': {
                // Save to inbox/[filename].md
                const inboxDir = vscode.Uri.joinPath(targetRoot, 'inbox');
                await vscode.workspace.fs.createDirectory(inboxDir);

                const sanitizedName = docxFilename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
                const targetUri = vscode.Uri.joinPath(inboxDir, `${sanitizedName}.md`);
                await vscode.workspace.fs.writeFile(targetUri, encoder.encode(rawMarkdown + '\n'));
                openedUri = targetUri;

                // Generate AI Prompt & copy to clipboard
                const aiPrompt = generateAiOrganizePrompt(docxFilename, `inbox/${sanitizedName}.md`);
                await vscode.env.clipboard.writeText(aiPrompt);

                const action = await vscode.window.showInformationMessage(
                    `Imported to inbox/${sanitizedName}.md (${totalWords.toLocaleString()} words). AI instruction prompt copied to clipboard!`,
                    'View AI Prompt',
                    'Open in Live View'
                );

                if (action === 'View AI Prompt') {
                    const doc = await vscode.workspace.openTextDocument({
                        content: aiPrompt,
                        language: 'markdown'
                    });
                    await vscode.window.showTextDocument(doc);
                }
                break;
            }

            case 'worldbuilding': {
                const docsDir = vscode.Uri.joinPath(targetRoot, 'docs');
                await vscode.workspace.fs.createDirectory(docsDir);
                const targetUri = vscode.Uri.joinPath(docsDir, 'worldbuilding.md');
                await appendOrWriteDoc(targetUri, rawMarkdown, docxFilename, encoder);
                openedUri = targetUri;
                vscode.window.showInformationMessage(
                    `Appended ${totalWords.toLocaleString()} words to docs/worldbuilding.md!`
                );
                break;
            }

            case 'characters': {
                const docsDir = vscode.Uri.joinPath(targetRoot, 'docs');
                await vscode.workspace.fs.createDirectory(docsDir);
                const targetUri = vscode.Uri.joinPath(docsDir, 'characters.md');
                await appendOrWriteDoc(targetUri, rawMarkdown, docxFilename, encoder);
                openedUri = targetUri;
                vscode.window.showInformationMessage(
                    `Appended ${totalWords.toLocaleString()} words to docs/characters.md!`
                );
                break;
            }

            case 'outline': {
                const docsDir = vscode.Uri.joinPath(targetRoot, 'docs');
                await vscode.workspace.fs.createDirectory(docsDir);
                const targetUri = vscode.Uri.joinPath(docsDir, 'outline.md');
                await appendOrWriteDoc(targetUri, rawMarkdown, docxFilename, encoder);
                openedUri = targetUri;
                vscode.window.showInformationMessage(
                    `Appended ${totalWords.toLocaleString()} words to docs/outline.md!`
                );
                break;
            }

            case 'scene': {
                const chapterUri = await pickOrCreateChapter(targetRoot);
                if (!chapterUri) return;

                const entries = await vscode.workspace.fs.readDirectory(chapterUri);
                const sceneNumbers = entries
                    .filter(([name]) => /^scene[-_]\d+/i.test(name))
                    .map(([name]) => {
                        const match = name.match(/^scene[-_](\d+)/i);
                        return match ? parseInt(match[1], 10) : 0;
                    });
                const nextIdx = (sceneNumbers.length > 0 ? Math.max(...sceneNumbers) : 0) + 1;
                const sceneFilename = `scene_${String(nextIdx).padStart(2, '0')}.md`;
                const sceneUri = vscode.Uri.joinPath(chapterUri, sceneFilename);

                await vscode.workspace.fs.writeFile(sceneUri, encoder.encode(rawMarkdown + '\n'));
                openedUri = sceneUri;

                vscode.window.showInformationMessage(
                    `Imported scene to ${path.basename(chapterUri.fsPath)}/${sceneFilename} (${totalWords.toLocaleString()} words).`
                );
                break;
            }

            case 'heuristic_split': {
                progress.report({ message: 'Analyzing chapter markers...' });
                const sections = splitMarkdownIntoSections(rawMarkdown, docxFilename);
                let chapIdx = 0;
                let totalImportedScenes = 0;

                for (const sec of sections) {
                    chapIdx++;
                    const chapFolder = vscode.Uri.joinPath(targetRoot, `chapter_${String(chapIdx).padStart(2, '0')}`);
                    await vscode.workspace.fs.createDirectory(chapFolder);

                    const sceneUri = vscode.Uri.joinPath(chapFolder, 'scene_01.md');
                    const secText = sec.lines.join('\n').trim();
                    await vscode.workspace.fs.writeFile(sceneUri, encoder.encode(secText + '\n'));
                    totalImportedScenes++;

                    if (!openedUri) {
                        openedUri = sceneUri;
                    }
                }

                vscode.window.showInformationMessage(
                    `Split into ${chapIdx} chapter(s) and ${totalImportedScenes} scene(s) (${totalWords.toLocaleString()} words).`
                );
                break;
            }
        }

        // Open in Novellized Live View
        if (openedUri) {
            try {
                await vscode.commands.executeCommand('vscode.openWith', openedUri, 'novellized.editor');
            } catch {
                const doc = await vscode.workspace.openTextDocument(openedUri);
                await vscode.window.showTextDocument(doc);
            }
        }
    });

    // Refresh tree views
    await vscode.commands.executeCommand('novellized.refreshManuscript');
}

/**
 * Cleans Word-specific artifacts from converted markdown
 */
function cleanWordMarkdown(content: string): string {
    return content
        .replace(/\r\n/g, '\n')
        .replace(/\n{4,}/g, '\n\n\n')
        // Clean smart quotes
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .trim();
}

/**
 * Splits raw converted markdown into logical sections (Chapters, Bible docs, etc.)
 */
function splitMarkdownIntoSections(rawMarkdown: string, defaultTitle: string): ParsedSection[] {
    const lines = rawMarkdown.split('\n');
    const sections: ParsedSection[] = [];
    let currentSection: ParsedSection | null = null;

    // Regular expressions for detecting chapter and documentation markers
    const chapterRegex = /^(?:#{1,3}\s+)?(?:Chuong|Chapter|H?i|Part|Ph?n|M?c)\s+([IVXLCDM\d]+|[0-9]+)(?:[:\.\-��]\s*(.*))?$/i;
    const charactersRegex = /^(?:#{1,3}\s+)?(?:H? so nh�n v?t|Nh�n v?t|Character Bible|Characters?)(?:[:\.\-��\s]|$)/i;
    const worldbuildingRegex = /^(?:#{1,3}\s+)?(?:B?i c?nh|Th? gi?i|Worldbuilding|Setting|Geography)(?:[:\.\-��\s]|$)/i;
    const outlineRegex = /^(?:#{1,3}\s+)?(?:D�n �|C?t truy?n|Master Outline|Outline|Plot)(?:[:\.\-��\s]|$)/i;
    const heading1Regex = /^#\s+(.+)$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 1. Check Story Bible sections
        if (charactersRegex.test(line)) {
            if (currentSection) sections.push(currentSection);
            currentSection = { type: 'characters', title: 'Character Bible', lines: [line] };
            continue;
        }

        if (worldbuildingRegex.test(line)) {
            if (currentSection) sections.push(currentSection);
            currentSection = { type: 'worldbuilding', title: 'Worldbuilding Guide', lines: [line] };
            continue;
        }

        if (outlineRegex.test(line)) {
            if (currentSection) sections.push(currentSection);
            currentSection = { type: 'outline', title: 'Master Outline', lines: [line] };
            continue;
        }

        // 2. Check Chapter markers
        const chapterMatch = line.match(chapterRegex);
        if (chapterMatch) {
            if (currentSection) sections.push(currentSection);
            const numStr = chapterMatch[1];
            const chapTitle = chapterMatch[2] ? chapterMatch[2].trim() : `Chapter ${numStr}`;
            const headerFormatted = line.startsWith('#') ? line : `## ${line}`;
            currentSection = {
                type: 'chapter',
                title: chapTitle || `Chapter ${numStr}`,
                lines: [headerFormatted]
            };
            continue;
        }

        // 3. Check prominent H1 headings (if not in a bible doc)
        const h1Match = line.match(heading1Regex);
        if (h1Match && (!currentSection || currentSection.type === 'chapter')) {
            const headingTitle = h1Match[1].trim();
            // Don't treat the top novel title as a separate chapter if it's the very first line
            if (i > 5 || (currentSection && currentSection.lines.length > 5)) {
                if (currentSection) sections.push(currentSection);
                currentSection = {
                    type: 'chapter',
                    title: headingTitle,
                    lines: [line]
                };
                continue;
            }
        }

        // Standard content line
        if (!currentSection) {
            // First section opening
            currentSection = {
                type: 'chapter',
                title: defaultTitle,
                lines: [line]
            };
        } else {
            currentSection.lines.push(lines[i]);
        }
    }

    if (currentSection && currentSection.lines.some(l => l.trim().length > 0)) {
        sections.push(currentSection);
    }

    return sections;
}

/**
 * Splits chapter content into scenes if scene dividers (?, ---, ***, ### Scene) exist
 */
function splitChapterIntoScenes(chapterContent: string, defaultSceneTitle: string): string[] {
    const lines = chapterContent.split('\n');
    const scenes: string[] = [];
    let currentSceneLines: string[] = [];

    const sceneDividerRegex = /^(?:---|\\*\\*\\*|___|\u2042|###\\s+Scene|###\\s+Cảnh)/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (sceneDividerRegex.test(line) && currentSceneLines.length > 5) {
            scenes.push(currentSceneLines.join('\n').trim());
            currentSceneLines = [lines[i]];
        } else {
            currentSceneLines.push(lines[i]);
        }
    }

    if (currentSceneLines.length > 0) {
        scenes.push(currentSceneLines.join('\n').trim());
    }

    // If no explicit scenes divided, return whole content as single scene
    return scenes.length > 0 ? scenes : [chapterContent];
}

/**
 * Copies the AI organization prompt for a file or prompts user to pick an inbox file
 */
export async function copyAiOrganizePrompt(targetUri?: vscode.Uri): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return;
    const rootUri = workspaceFolders[0].uri;

    let fileToOrganize = targetUri;

    if (!fileToOrganize) {
        // Look for files in inbox/
        const inboxUri = vscode.Uri.joinPath(rootUri, 'inbox');
        let inboxFiles: [string, vscode.FileType][] = [];
        try {
            inboxFiles = await vscode.workspace.fs.readDirectory(inboxUri);
        } catch {
            // No inbox directory
        }

        const mdFiles = inboxFiles.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'));
        if (mdFiles.length === 0) {
            vscode.window.showInformationMessage('No imported files found in inbox/ to organize.');
            return;
        }

        const picked = await vscode.window.showQuickPick(
            mdFiles.map(([name]) => ({
                label: name,
                uri: vscode.Uri.joinPath(inboxUri, name)
            })),
            { placeHolder: 'Select the file you want the AI Agent to organize' }
        );
        if (!picked) return;
        fileToOrganize = picked.uri;
    }

    const relPath = path.relative(rootUri.fsPath, fileToOrganize.fsPath).replace(/\\/g, '/');
    const docName = path.basename(fileToOrganize.fsPath, '.md');
    const prompt = generateAiOrganizePrompt(docName, relPath);

    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(`AI Organization Prompt for "${relPath}" copied to clipboard! Paste it to your AI Agent chat.`);
}

/**
 * Generates clear, structured AI Agent instructions in English with Vietnamese context
 */
function generateAiOrganizePrompt(docTitle: string, relativePath: string): string {
    return `Please analyze and organize the newly imported document at "${relativePath}" for this novel project.

Carefully classify and place the content into the Novellized project structure:

1. **Character Profiles & Psychology**:
   - If this document contains character sheets, appearances, flaws, backstories, or relationship dynamics, append/update them into \`docs/characters.md\`.

2. **Worldbuilding, Lore & Setting Rules**:
   - If it contains magic systems, power rankings, technology, geography, factions, history, cultural taboos, or societal laws, append/update them into \`docs/worldbuilding.md\`.

3. **Master Outline & Plot Beats**:
   - If it contains story arcs, 3-act beats, synopses, or scene milestones, append/update them into \`docs/outline.md\`.

4. **Narrative Fiction / Actual Story Scenes**:
   - If there is actual narrative prose (scenes with character action, dialogue, and narrative voice), split and place them into the appropriate chapter folders (e.g. \`chapter_01/scene_01.md\`, \`chapter_02/scene_01.md\`).

5. **AI Rules & Constraints**:
   - If there are explicit tone/voice directives or narrative POV instructions, record them in \`.novel/ai_rules.json\`.

Maintain document integrity, do not lose any valuable details, and adhere strictly to 'Show, Don't Tell'.`;
}

async function appendOrWriteDoc(fileUri: vscode.Uri, content: string, sourceName: string, encoder: TextEncoder): Promise<void> {
    let existing = '';
    try {
        const raw = await vscode.workspace.fs.readFile(fileUri);
        existing = Buffer.from(raw).toString('utf8');
    } catch {
        // File does not exist yet
    }

    let finalContent = '';
    if (existing.trim().length > 0) {
        finalContent = `${existing.trim()}\n\n---\n\n## ${sourceName}\n\n${content}\n`;
    } else {
        finalContent = `# ${sourceName}\n\n${content}\n`;
    }

    await vscode.workspace.fs.writeFile(fileUri, encoder.encode(finalContent));
}

async function pickOrCreateChapter(rootUri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const entries = await vscode.workspace.fs.readDirectory(rootUri);
    const chapterDirs = entries.filter(([name, type]) => type === vscode.FileType.Directory && /^chapter[-_]/i.test(name));

    if (chapterDirs.length === 0) {
        const chapUri = vscode.Uri.joinPath(rootUri, 'chapter_01');
        await vscode.workspace.fs.createDirectory(chapUri);
        return chapUri;
    }

    const picked = await vscode.window.showQuickPick(
        [
            ...chapterDirs.map(([name]) => ({
                label: name.replace(/^chapter[-_]/i, 'Chapter ').replace(/[-_]/g, ' '),
                uri: vscode.Uri.joinPath(rootUri, name)
            })),
            {
                label: '$(plus) Create New Chapter',
                uri: vscode.Uri.joinPath(rootUri, `chapter_${String(chapterDirs.length + 1).padStart(2, '0')}`)
            }
        ],
        { placeHolder: 'Select destination chapter for this scene' }
    );

    if (!picked) return undefined;
    await vscode.workspace.fs.createDirectory(picked.uri);
    return picked.uri;
}

/**
 * Ensures .novel/project.json is configured with title and target words
 */
async function ensureProjectJson(targetRoot: vscode.Uri, title: string, totalWords: number): Promise<void> {
    const configDir = vscode.Uri.joinPath(targetRoot, '.novel');
    const configFile = vscode.Uri.joinPath(configDir, 'project.json');

    try {
        await vscode.workspace.fs.stat(configFile);
        // Already exists, don't overwrite user settings
    } catch {
        await vscode.workspace.fs.createDirectory(configDir);
        const formattedTitle = title.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const initialConfig = {
            title: formattedTitle,
            author: 'Anonymous',
            structure: 'simple',
            targetWordCount: Math.max(50000, totalWords + 10000),
            createdAt: new Date().toISOString(),
            version: '1.0.0'
        };
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(configFile, encoder.encode(JSON.stringify(initialConfig, null, 2)));
    }
}
