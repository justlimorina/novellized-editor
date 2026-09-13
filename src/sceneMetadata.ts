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
 */
export async function extractWorldbuildingFromBible(rootUri: vscode.Uri): Promise<EntityInfo[]> {
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

        const seen = new Set<string>();
        return results.filter(r => {
            const lower = r.name.toLowerCase();
            if (seen.has(lower)) return false;
            seen.add(lower);
            return true;
        });
    } catch {
        return [];
    }
}
