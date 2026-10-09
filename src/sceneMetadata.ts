import * as vscode from 'vscode';
import * as path from 'path';

export type SceneStatus = 'draft' | 'in_progress' | 'revised' | 'done';

export interface SceneMetadata {
    title?: string;
    synopsis?: string;
    status?: SceneStatus;
    pov?: string;
    notes?: string;
    tags?: string[];
}

export interface ChapterMetadata {
    title?: string;
    synopsis?: string;
    scenes?: Record<string, SceneMetadata>;
}

export interface EntityInfo {
    name: string;
    category: 'character' | 'worldbuilding';
    summary?: string;
}

/**
 * Gets chapter folder URI for a given scene or chapter URI
 */
export function getChapterFolderUri(uri: vscode.Uri): vscode.Uri {
    const isFile = uri.path.endsWith('.md') || uri.path.endsWith('.json');
    return isFile ? vscode.Uri.joinPath(uri, '..') : uri;
}

/**
 * Reads chapter.json safely
 */
export async function getChapterMetadata(chapFolderUri: vscode.Uri): Promise<ChapterMetadata> {
    const metaUri = vscode.Uri.joinPath(chapFolderUri, 'chapter.json');
    try {
        const raw = await vscode.workspace.fs.readFile(metaUri);
        const data = JSON.parse(Buffer.from(raw).toString('utf8'));
        if (typeof data === 'object' && data !== null) {
            return data;
        }
    } catch {
        // Missing or invalid JSON, return clean default
    }
    return {};
}

/**
 * Writes chapter.json safely
 */
export async function saveChapterMetadata(chapFolderUri: vscode.Uri, meta: ChapterMetadata): Promise<void> {
    const metaUri = vscode.Uri.joinPath(chapFolderUri, 'chapter.json');
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(metaUri, encoder.encode(JSON.stringify(meta, null, 2)));
}

/**
 * Gets metadata for a specific scene file
 */
export async function getSceneMetadata(sceneUri: vscode.Uri): Promise<SceneMetadata> {
    const chapFolder = getChapterFolderUri(sceneUri);
    const fileName = path.basename(sceneUri.fsPath);
    const chapMeta = await getChapterMetadata(chapFolder);
    return chapMeta.scenes?.[fileName] || {};
}

/**
 * Updates metadata for a specific scene file
 */
export async function updateSceneMetadata(sceneUri: vscode.Uri, patch: Partial<SceneMetadata>): Promise<void> {
    const chapFolder = getChapterFolderUri(sceneUri);
    const fileName = path.basename(sceneUri.fsPath);
    const chapMeta = await getChapterMetadata(chapFolder);

    if (!chapMeta.scenes) {
        chapMeta.scenes = {};
    }

    chapMeta.scenes[fileName] = {
        ...chapMeta.scenes[fileName],
        ...patch
    };

    await saveChapterMetadata(chapFolder, chapMeta);
}

/**
 * Extracts character entities from docs/characters.md
 */
export async function extractCharactersFromBible(rootUri: vscode.Uri): Promise<EntityInfo[]> {
    const results: EntityInfo[] = [];

    // 1. Scan modular character profiles in docs/characters/*.md
    try {
        const charDirUri = vscode.Uri.joinPath(rootUri, 'docs', 'characters');
        const entries = await vscode.workspace.fs.readDirectory(charDirUri);
        for (const [name, type] of entries) {
            if (type === vscode.FileType.File && name.endsWith('.md')) {
                try {
                    const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(charDirUri, name));
                    const text = Buffer.from(raw).toString('utf8');
                    let charName = name.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
                    let summary = 'Character';

                    const nameMatch = text.match(/^(?:name|tên):\s*([^\n]+)/im) || text.match(/^#\s+([^\n]+)/m);
                    if (nameMatch) {
                        charName = nameMatch[1].trim();
                    }
                    const summaryMatch = text.match(/^(?:summary|role|tóm tắt|vai trò):\s*([^\n]+)/im);
                    if (summaryMatch) {
                        summary = summaryMatch[1].trim();
                    } else {
                        const firstPara = text.split('\n').map(l => l.trim()).find(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('---'));
                        if (firstPara) {
                            summary = firstPara.slice(0, 100);
                        }
                    }

                    results.push({
                        name: charName,
                        category: 'character',
                        summary
                    });
                } catch { }
            }
        }
    } catch { }

    const fileUri = vscode.Uri.joinPath(rootUri, 'docs', 'characters.md');
    try {
        const raw = await vscode.workspace.fs.readFile(fileUri);
        const content = Buffer.from(raw).toString('utf8');
        const lines = content.split('\n');
        const results: EntityInfo[] = [];

        let currentSummary = '';

        for (const line of lines) {
            const trimmed = line.trim();

            const h2Match = trimmed.match(/^##\s+(?:\d+\.\s+)?([^:]+)(?::\s*(.+))?$/);
            const h3Match = trimmed.match(/^###\s+\[?([^\]]+)\]?$/);
            const fullNameMatch = trimmed.match(/^\*\s+\*\*Full Name\*\*:\s*(.+)$/i);

            if (fullNameMatch && fullNameMatch[1].trim() && !fullNameMatch[1].includes('[')) {
                results.push({
                    name: fullNameMatch[1].trim(),
                    category: 'character',
                    summary: currentSummary || 'Character'
                });
            } else if (h3Match) {
                const name = h3Match[1].trim();
                if (name && !name.toLowerCase().startsWith('character name')) {
                    results.push({
                        name,
                        category: 'character',
                        summary: 'Supporting Character'
                    });
                }
            } else if (h2Match) {
                const title = h2Match[2] ? h2Match[2].trim() : h2Match[1].trim();
                if (title && !title.toLowerCase().startsWith('protagonist') && !title.toLowerCase().startsWith('supporting')) {
                    results.push({
                        name: title,
                        category: 'character',
                        summary: h2Match[1].trim()
                    });
                }
            }
        }

        const seen = new Set<string>();
        return results.filter(r => {
            const lower = r.name.toLowerCase();
            if (seen.has(lower) || lower.length < 2) return false;
            seen.add(lower);
            return true;
        });
    } catch {
        return [];
    }
}

/**
 * Extracts worldbuilding entities from docs/worldbuilding.md
 * Extracts worldbuilding entities from docs/worldbuilding.md and docs/worldbuilding/*.md
 */
export async function extractWorldbuildingFromBible(rootUri: vscode.Uri): Promise<EntityInfo[]> {
    const results: EntityInfo[] = [];

    // 1. Scan modular worldbuilding docs in docs/worldbuilding/*.md
    try {
        const loreDirUri = vscode.Uri.joinPath(rootUri, 'docs', 'worldbuilding');
        const entries = await vscode.workspace.fs.readDirectory(loreDirUri);
        for (const [name, type] of entries) {
            if (type === vscode.FileType.File && name.endsWith('.md')) {
                try {
                    const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(loreDirUri, name));
                    const text = Buffer.from(raw).toString('utf8');
                    let loreName = name.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
                    const headingMatch = text.match(/^#\s+([^\n]+)/m);
                    if (headingMatch) {
                        loreName = headingMatch[1].trim();
                    }
                    results.push({
                        name: loreName,
                        category: 'worldbuilding',
                        summary: 'Setting / Lore'
                    });
                } catch { }
            }
        }
    } catch { }

    // 2. Scan consolidated docs/worldbuilding.md
    const fileUri = vscode.Uri.joinPath(rootUri, 'docs', 'worldbuilding.md');
    try {
        const raw = await vscode.workspace.fs.readFile(fileUri);
        const content = Buffer.from(raw).toString('utf8');
        const lines = content.split('\n');
        const results: EntityInfo[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            const headingMatch = trimmed.match(/^#{2,3}\s+(?:\d+\.\s+)?(.+)$/);
            if (headingMatch) {
                const name = headingMatch[1].trim();
                if (name.length > 2 && !name.includes('Setting & Atmosphere') && !name.includes('Rules & Society')) {
                    results.push({
                        name,
                        category: 'worldbuilding',
                        summary: 'Setting / Lore'
                    });
                }
            }
        }
    } catch { }

        const seen = new Set<string>();
        return results.filter(r => {
            const lower = r.name.toLowerCase();
            if (seen.has(lower)) return false;
            seen.add(lower);
            return true;
        });
    } catch {
        return [];
    const seen = new Set<string>();
    return results.filter(r => {
        const lower = r.name.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
    });
}

/**
 * Compiles rich context bundle for the active scene into a prompt ready for AI assistants.
 */
export async function generateAiSceneContext(sceneUri: vscode.Uri): Promise<string> {
    const rootUri = vscode.workspace.getWorkspaceFolder(sceneUri)?.uri || vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!rootUri) {
        throw new Error('No novel workspace folder found.');
    }

    // 1. Novel project metadata
    let projectTitle = path.basename(rootUri.fsPath);
    let author = 'Author';
    try {
        const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(rootUri, '.novel', 'project.json'));
        const pMeta = JSON.parse(Buffer.from(raw).toString('utf8'));
        if (pMeta.title) projectTitle = pMeta.title;
        if (pMeta.author) author = pMeta.author;
    } catch { }

    // 2. AI Rules and voice constraints
    let aiRulesStr = 'Maintain consistent character voice, immersive sensory description, and avoid modern slang.';
    try {
        const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(rootUri, '.novel', 'ai_rules.json'));
        const rules = JSON.parse(Buffer.from(raw).toString('utf8'));
        aiRulesStr = JSON.stringify(rules, null, 2);
    } catch { }

    // 3. Scene & Chapter details
    const chapFolder = getChapterFolderUri(sceneUri);
    const chapMeta = await getChapterMetadata(chapFolder);
    const sceneMeta = await getSceneMetadata(sceneUri);

    let sceneContent = '';
    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === sceneUri.fsPath);
    if (openDoc) {
        sceneContent = openDoc.getText();
    } else {
        const raw = await vscode.workspace.fs.readFile(sceneUri);
        sceneContent = Buffer.from(raw).toString('utf8');
    }

    const sceneTitle = sceneMeta.title || path.basename(sceneUri.fsPath).replace(/\.md$/i, '');
    const chapTitle = chapMeta.title || path.basename(chapFolder.fsPath);

    // 4. Detected characters in this scene
    const allCharacters = await extractCharactersFromBible(rootUri);
    const presentChars = allCharacters.filter(c => sceneContent.toLowerCase().includes(c.name.toLowerCase()));

    const charListStr = presentChars.length > 0
        ? presentChars.map(c => `- **${c.name}**: ${c.summary || 'Character'}`).join('\n')
        : (allCharacters.slice(0, 5).map(c => `- **${c.name}**: ${c.summary || 'Character'}`).join('\n') || 'None recorded');

    // 5. Construct master context prompt
    return `# NOVEL CONTEXT & SCENE WRITING PROMPT

## Master Novel Information
- **Title**: ${projectTitle}
- **Author**: ${author}
- **Current Chapter**: ${chapTitle}
- **Chapter Synopsis**: ${chapMeta.synopsis || 'N/A'}

## Current Scene Specifications
- **Scene**: ${sceneTitle}
- **Status**: ${sceneMeta.status || 'draft'}
- **Point of View (POV)**: ${sceneMeta.pov || 'Third Person Limited'}
- **Scene Goal & Synopsis**: ${sceneMeta.synopsis || 'N/A'}

## Characters in this Scene
${charListStr}

## Literary Voice & Directives (.novel/ai_rules.json)
\`\`\`json
${aiRulesStr}
\`\`\`

## Scene Draft:
\`\`\`markdown
${sceneContent.trim()}
\`\`\`

---
### Request:
Please analyze the scene above and help me continue or refine it. Stay strictly in-character, adhere to the narrative POV, and honor the established rules and literary style.
`;
}
