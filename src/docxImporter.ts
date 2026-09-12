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

    // 3. Choose import strategy
    const modePick = await vscode.window.showQuickPick([
        {
            label: '$(split-horizontal) Smart Chapter Splitter (Recommended)',
            description: 'Automatically divide into chapters & scenes',
            detail: 'Detects Chapter/Chuong headings, scenes, and character bibles to build a full project structure.',
            value: 'split' as const
        },
        {
            label: '$(file-text) Single Scene / File',
            description: 'Import as a single .md file',
            detail: 'Converts entire Word file into one markdown file without splitting.',
            value: 'single' as const
        }
    ], {
        title: 'Novellized: Import Strategy',
        placeHolder: 'Choose how to import this Word manuscript'
    });

    if (!modePick) return;

    // 4. Progress notification
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Novellized: Importing "${docxFilename}.docx"...`,
        cancellable: false
    }, async (progress) => {
        progress.report({ message: 'Converting Word document to Markdown...' });

        // Read raw buffer and convert with mammoth
        const rawBytes = await vscode.workspace.fs.readFile(docxUri);
        const buffer = Buffer.from(rawBytes);
        const conversionResult = await mammoth.convertToMarkdown({ buffer });
        const rawMarkdown = cleanWordMarkdown(conversionResult.value);

        if (!rawMarkdown.trim()) {
            vscode.window.showWarningMessage('The selected Word document appears to be empty.');
            return;
        }

        const encoder = new TextEncoder();
        let firstSceneUriToOpen: vscode.Uri | undefined;

        if (modePick.value === 'single') {
            // Mode: Single File
            const targetFilename = `${docxFilename.replace(/[^a-zA-Z0-9_\-\.]/g, '_')}.md`;
            const destUri = vscode.Uri.joinPath(targetRoot, targetFilename);
            await vscode.workspace.fs.writeFile(destUri, encoder.encode(rawMarkdown));
            firstSceneUriToOpen = destUri;

            const totalWords = countWords(rawMarkdown);
            vscode.window.showInformationMessage(
                `Successfully imported "${targetFilename}" (${totalWords.toLocaleString()} words).`
            );
        } else {
            // Mode: Smart Chapter Splitter
            progress.report({ message: 'Analyzing chapters, scenes, and story bible sections...' });
            const sections = splitMarkdownIntoSections(rawMarkdown, docxFilename);

            let importedChapters = 0;
            let importedScenes = 0;
            let totalImportedWords = 0;

            // Ensure .novel/project.json exists
            await ensureProjectJson(targetRoot, docxFilename, totalImportedWords);

            let currentChapterIndex = 0;

            for (const sec of sections) {
                const secContent = sec.lines.join('\n').trim();
                const secWords = countWords(secContent);
                totalImportedWords += secWords;

                if (sec.type === 'characters') {
                    const charUri = vscode.Uri.joinPath(targetRoot, 'docs', 'characters.md');
                    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(targetRoot, 'docs'));
                    await vscode.workspace.fs.writeFile(charUri, encoder.encode(secContent + '\n'));
                } else if (sec.type === 'worldbuilding') {
                    const worldUri = vscode.Uri.joinPath(targetRoot, 'docs', 'worldbuilding.md');
                    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(targetRoot, 'docs'));
                    await vscode.workspace.fs.writeFile(worldUri, encoder.encode(secContent + '\n'));
                } else if (sec.type === 'outline') {
                    const outlineUri = vscode.Uri.joinPath(targetRoot, 'docs', 'outline.md');
                    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(targetRoot, 'docs'));
                    await vscode.workspace.fs.writeFile(outlineUri, encoder.encode(secContent + '\n'));
                } else {
                    // Chapter / Scene
                    currentChapterIndex++;
                    importedChapters++;

                    const chapDirName = `chapter_${String(currentChapterIndex).padStart(2, '0')}`;
                    const chapFolderUri = vscode.Uri.joinPath(targetRoot, chapDirName);
                    await vscode.workspace.fs.createDirectory(chapFolderUri);

                    // Check if chapter content has internal scene breaks (? or --- or ***)
                    const scenes = splitChapterIntoScenes(secContent, sec.title);
                    let sceneIndex = 0;

                    for (const sc of scenes) {
                        sceneIndex++;
                        importedScenes++;
                        const sceneFilename = `scene_${String(sceneIndex).padStart(2, '0')}.md`;
                        const sceneUri = vscode.Uri.joinPath(chapFolderUri, sceneFilename);
                        await vscode.workspace.fs.writeFile(sceneUri, encoder.encode(sc + '\n'));

                        if (!firstSceneUriToOpen) {
                            firstSceneUriToOpen = sceneUri;
                        }
                    }
                }
            }

            // Update project.json with actual target and words
            await ensureProjectJson(targetRoot, docxFilename, totalImportedWords);

            vscode.window.showInformationMessage(
                `Successfully imported from "${docxFilename}.docx": ${importedChapters} chapter(s), ${importedScenes} scene(s) (${totalImportedWords.toLocaleString()} words)!`
            );
        }

        // Open first scene in Novellized Live View
        if (firstSceneUriToOpen) {
            try {
                await vscode.commands.executeCommand('vscode.openWith', firstSceneUriToOpen, 'novellized.editor');
            } catch {
                const doc = await vscode.workspace.openTextDocument(firstSceneUriToOpen);
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
