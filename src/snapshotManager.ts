import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as git from 'isomorphic-git';

export interface SnapshotItem {
    id: string;
    oid: string;
    label: string;
    timestamp: number;
    dateStr: string;
    words: number;
    uri?: vscode.Uri;
    isLegacy?: boolean;
}

export class SnapshotManager {
    /**
     * Resolves root workspace URI
     */
    private static getRootUri(uri: vscode.Uri): vscode.Uri | undefined {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        return folder?.uri || vscode.workspace.workspaceFolders?.[0]?.uri;
    }

    /**
     * Resolves the sandboxed git directory for isomorphic-git (.novel/.git)
     */
    private static getGitDir(rootUri: vscode.Uri): string {
        return path.join(rootUri.fsPath, '.novel', '.git');
    }

    /**
     * Ensures the sandboxed git repository is initialized inside .novel/.git
     */
    public static async ensureRepo(rootUri: vscode.Uri): Promise<string> {
        const novelDir = path.join(rootUri.fsPath, '.novel');
        if (!fs.existsSync(novelDir)) {
            fs.mkdirSync(novelDir, { recursive: true });
        }

        const gitdir = this.getGitDir(rootUri);
        if (!fs.existsSync(gitdir)) {
            await git.init({
                fs,
                dir: rootUri.fsPath,
                gitdir,
                defaultBranch: 'main'
            });
        }
        return gitdir;
    }

    /**
     * Retrieves author metadata from .novel/project.json or defaults
     */
    private static getAuthorInfo(rootUri: vscode.Uri): { name: string; email: string } {
        try {
            const projectJsonPath = path.join(rootUri.fsPath, '.novel', 'project.json');
            if (fs.existsSync(projectJsonPath)) {
                const data = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
                if (data.author && typeof data.author === 'string' && data.author.trim().length > 0) {
                    return {
                        name: data.author.trim(),
                        email: 'author@novellized.local'
                    };
                }
            }
        } catch { }

        return {
            name: 'Novellized Author',
            email: 'author@novellized.local'
        };
    }

    /**
     * Creates a new snapshot checkpoint of the scene using isomorphic-git
     */
    public static async takeSnapshot(sceneUri: vscode.Uri, label?: string): Promise<SnapshotItem | null> {
        const rootUri = this.getRootUri(sceneUri);
        if (!rootUri) return null;

        const gitdir = await this.ensureRepo(rootUri);

        // Ensure current document edits are flushed to disk
        const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === sceneUri.toString());
        let content = '';
        if (openDoc) {
            if (openDoc.isDirty) {
                await openDoc.save();
            }
            content = openDoc.getText();
        } else {
            const raw = await vscode.workspace.fs.readFile(sceneUri);
            content = Buffer.from(raw).toString('utf8');
        }

        // Relative path must use forward slashes for git
        const filepath = path.relative(rootUri.fsPath, sceneUri.fsPath).replace(/\\/g, '/');

        // Stage the scene file
        await git.add({
            fs,
            dir: rootUri.fsPath,
            gitdir,
            filepath
        });

        const now = Date.now();
        const date = new Date(now);
        const author = this.getAuthorInfo(rootUri);
        const cleanLabel = (label || 'Snapshot checkpoint').trim() || 'Snapshot checkpoint';

        // Commit snapshot checkpoint
        const oid = await git.commit({
            fs,
            dir: rootUri.fsPath,
            gitdir,
            message: cleanLabel,
            author: {
                name: author.name,
                email: author.email,
                timestamp: Math.floor(now / 1000),
                timezoneOffset: date.getTimezoneOffset()
            },
            committer: {
                name: author.name,
                email: author.email,
                timestamp: Math.floor(now / 1000),
                timezoneOffset: date.getTimezoneOffset()
            }
        });

        const words = content.trim().split(/\s+/).filter(Boolean).length;
        const dateStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + date.toLocaleDateString();

        return {
            id: oid,
            oid,
            label: cleanLabel,
            timestamp: now,
            dateStr,
            words
        };
    }

    /**
     * Lists all snapshots for a given scene from git history (and legacy disk backups)
     */
    public static async listSnapshots(sceneUri: vscode.Uri): Promise<SnapshotItem[]> {
        const rootUri = this.getRootUri(sceneUri);
        if (!rootUri) return [];

        const items: SnapshotItem[] = [];
        const gitdir = this.getGitDir(rootUri);
        const filepath = path.relative(rootUri.fsPath, sceneUri.fsPath).replace(/\\/g, '/');

        // 1. Read git commit log for this specific scene file
        if (fs.existsSync(gitdir)) {
            try {
                const commits = await git.log({
                    fs,
                    dir: rootUri.fsPath,
                    gitdir,
                    filepath,
                    depth: 50
                });

                for (const c of commits) {
                    const oid = c.oid;
                    const timestamp = (c.commit.committer?.timestamp || c.commit.author?.timestamp || 0) * 1000;
                    const date = new Date(timestamp);
                    const dateStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + date.toLocaleDateString();

                    let words = 0;
                    try {
                        const { blob } = await git.readBlob({
                            fs,
                            dir: rootUri.fsPath,
                            gitdir,
                            oid,
                            filepath
                        });
                        const text = Buffer.from(blob).toString('utf8');
                        words = text.trim().split(/\s+/).filter(Boolean).length;
                    } catch { }

                    items.push({
                        id: oid,
                        oid,
                        label: c.commit.message || 'Snapshot',
                        timestamp,
                        dateStr,
                        words,
                        isLegacy: false
                    });
                }
            } catch {
                // git.log throws if repo is empty or file not yet tracked
            }
        }

        // 2. Backward compatibility: Read any legacy file-based snapshots (.novel/snapshots/...)
        const legacyRelPath = path.relative(rootUri.fsPath, sceneUri.fsPath).replace(/\.md$/i, '');
        const legacySnapshotDir = path.join(rootUri.fsPath, '.novel', 'snapshots', legacyRelPath);
        if (fs.existsSync(legacySnapshotDir)) {
            try {
                const entries = fs.readdirSync(legacySnapshotDir);
                for (const name of entries) {
                    if (name.endsWith('.md')) {
                        const match = name.match(/^(\d+)_(.+)\.md$/);
                        if (match) {
                            const timestamp = parseInt(match[1], 10);
                            const label = match[2].replace(/_/g, ' ');
                            const date = new Date(timestamp);
                            const fileUri = vscode.Uri.file(path.join(legacySnapshotDir, name));

                            let words = 0;
                            try {
                                const raw = fs.readFileSync(path.join(legacySnapshotDir, name), 'utf8');
                                words = raw.trim().split(/\s+/).filter(Boolean).length;
                            } catch { }

                            const dateStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + date.toLocaleDateString();

                            items.push({
                                id: name,
                                oid: '',
                                label,
                                timestamp,
                                dateStr,
                                words,
                                uri: fileUri,
                                isLegacy: true
                            });
                        }
                    }
                }
            } catch { }
        }

        // Sort newest first
        items.sort((a, b) => b.timestamp - a.timestamp);
        return items;
    }

    /**
     * Reads the snapshot text content given a snapshot identifier (git OID or legacy path)
     */
    public static async getSnapshotContent(sceneUri: vscode.Uri, snapshotId: string): Promise<string> {
        const rootUri = this.getRootUri(sceneUri);
        if (!rootUri) throw new Error('Root workspace folder not found');

        // Check if snapshotId is a 40-char git commit SHA
        if (/^[0-9a-fA-F]{40}$/.test(snapshotId)) {
            const gitdir = this.getGitDir(rootUri);
            const filepath = path.relative(rootUri.fsPath, sceneUri.fsPath).replace(/\\/g, '/');
            const { blob } = await git.readBlob({
                fs,
                dir: rootUri.fsPath,
                gitdir,
                oid: snapshotId,
                filepath
            });
            return Buffer.from(blob).toString('utf8');
        }

        // Otherwise treat as legacy snapshot file
        const legacyRelPath = path.relative(rootUri.fsPath, sceneUri.fsPath).replace(/\.md$/i, '');
        let legacyFile = path.join(rootUri.fsPath, '.novel', 'snapshots', legacyRelPath, snapshotId);
        if (!fs.existsSync(legacyFile) && fs.existsSync(snapshotId)) {
            legacyFile = snapshotId;
        }

        if (fs.existsSync(legacyFile)) {
            return fs.readFileSync(legacyFile, 'utf8');
        }

        throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    /**
     * Restores content from snapshot to active scene.
     * Automatically saves a safety checkpoint before restoring.
     */
    public static async restoreSnapshot(sceneUri: vscode.Uri, snapshotId: string): Promise<boolean> {
        // 1. Take a safety snapshot of current state before overwriting
        try {
            await this.takeSnapshot(sceneUri, 'Auto-save before restoring');
        } catch { }

        // 2. Fetch snapshot content
        const restoredText = await this.getSnapshotContent(sceneUri, snapshotId);

        // 3. Apply edit to active scene
        const doc = await vscode.workspace.openTextDocument(sceneUri);
        const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(sceneUri, fullRange, restoredText);
        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            await doc.save();
        }
        return success;
    }

    /**
     * Opens native side-by-side diff editor comparing current scene with snapshot
     */
    public static async compareWithSnapshot(sceneUri: vscode.Uri, snapshotId: string, label: string): Promise<void> {
        const rootUri = this.getRootUri(sceneUri);
        if (!rootUri) return;

        const content = await this.getSnapshotContent(sceneUri, snapshotId);

        // Write to temporary cache file in .novel/diff_cache/
        const diffCacheDir = path.join(rootUri.fsPath, '.novel', 'diff_cache');
        if (!fs.existsSync(diffCacheDir)) {
            fs.mkdirSync(diffCacheDir, { recursive: true });
        }

        const shortId = snapshotId.length > 7 ? snapshotId.slice(0, 7) : 'snapshot';
        const tempDiffPath = path.join(diffCacheDir, `${path.basename(sceneUri.fsPath, '.md')}_${shortId}.md`);
        fs.writeFileSync(tempDiffPath, content, 'utf8');

        const snapshotUri = vscode.Uri.file(tempDiffPath);
        const title = `${path.basename(sceneUri.fsPath)} (Snapshot: ${label}) ⟷ Current`;
        await vscode.commands.executeCommand('vscode.diff', snapshotUri, sceneUri, title);
    }
}
