import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const GITHUB_REPO = 'novellized/novellized-editor';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=5`;
const LAST_CHECK_KEY = 'novellized.lastUpdateCheckTime';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface GitHubReleaseAsset {
    name: string;
    browser_download_url: string;
    size: number;
}

interface GitHubRelease {
    tag_name: string;
    name: string;
    html_url: string;
    body: string;
    assets: GitHubReleaseAsset[];
}

interface ParsedSemver {
    major: number;
    minor: number;
    patch: number;
    prerelease: (string | number)[];
}

function parseSemver(v: string): ParsedSemver {
    const clean = v.replace(/^v/i, '').trim();
    const [main, ...preParts] = clean.split('-');
    const [major = 0, minor = 0, patch = 0] = main.split('.').map(x => parseInt(x, 10) || 0);
    const preRaw = preParts.join('-');
    const prerelease = preRaw ? preRaw.split('.').map(part => {
        const num = parseInt(part, 10);
        return isNaN(num) ? part : num;
    }) : [];

    return { major, minor, patch, prerelease };
}

/**
 * Compare two semver version strings (e.g. "0.1.0" vs "v0.1.1-alpha")
 * Follows SemVer 2.0 precedence.
 * Returns true if latest is strictly greater than current
 */
export function isNewerVersion(current: string, latest: string): boolean {
    const a = parseSemver(current);
    const b = parseSemver(latest);

    if (b.major !== a.major) return b.major > a.major;
    if (b.minor !== a.minor) return b.minor > a.minor;
    if (b.patch !== a.patch) return b.patch > a.patch;

    // Normal version has higher precedence than a pre-release version
    if (a.prerelease.length > 0 && b.prerelease.length === 0) return true;
    if (a.prerelease.length === 0 && b.prerelease.length > 0) return false;
    if (a.prerelease.length === 0 && b.prerelease.length === 0) return false;

    // Both have pre-release identifiers: compare each identifier
    const maxLen = Math.max(a.prerelease.length, b.prerelease.length);
    for (let i = 0; i < maxLen; i++) {
        const idA = a.prerelease[i];
        const idB = b.prerelease[i];

        if (idA === undefined) return true;
        if (idB === undefined) return false;

        const isNumA = typeof idA === 'number';
        const isNumB = typeof idB === 'number';

        if (isNumA && isNumB) {
            if (idB !== idA) return idB > idA;
        } else if (isNumA && !isNumB) {
            return true;
        } else if (!isNumA && isNumB) {
            return false;
        } else {
            if (idB !== idA) return (idB as string) > (idA as string);
        }
    }

    return false;
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
    try {
        const res = await fetch(RELEASES_API, {
            headers: {
                'User-Agent': 'Novellized-Editor-Updater',
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (!res.ok) {
            if (res.status === 404) return null; // No releases yet
            throw new Error(`GitHub API returned ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        const publishedRelease = data.find((r: any) => !r.draft);
        return (publishedRelease as GitHubRelease) || null;
    } catch (err: any) {
        throw new Error(`Could not connect to update server: ${err.message}`);
    }
}

async function downloadFileWithProgress(
    url: string,
    destPath: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Novellized-Editor-Updater'
        }
    });

    if (!res.ok) {
        throw new Error(`Download failed (${res.status} ${res.statusText})`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    progress.report({ message: `Completed (${(buffer.length / 1024).toFixed(0)} KB)` });
}

/**
 * Checks for updates and prompts user if a new version is available.
 */
export async function checkForUpdates(
    context: vscode.ExtensionContext,
    options: { silentIfLatest?: boolean } = {}
): Promise<void> {
    const currentVersion: string = context.extension.packageJSON.version || '0.1.0';

    try {
        const release = await fetchLatestRelease();
        if (!release) {
            if (!options.silentIfLatest) {
                vscode.window.showInformationMessage(`You are running the latest version of Novellized (v${currentVersion}).`);
            }
            return;
        }

        const latestVersion = release.tag_name || release.name;
        if (!isNewerVersion(currentVersion, latestVersion)) {
            if (!options.silentIfLatest) {
                vscode.window.showInformationMessage(`Novellized is already up to date (v${currentVersion}).`);
            }
            return;
        }

        // New version detected
        const vsixAsset = release.assets.find(a => a.name.endsWith('.vsix'));
        const debAsset = release.assets.find(a => a.name.endsWith('.deb'));
        const actions: string[] = [];

        if (vsixAsset) {
            actions.push('Update Now');
        }
        if (debAsset && process.platform === 'linux') {
            actions.push('Download .deb');
        }
        actions.push('Release Notes');
        actions.push('Later');

        const message = `Novellized update ${latestVersion} is available (Current: v${currentVersion}).`;
        const selection = await vscode.window.showInformationMessage(message, ...actions);

        if (selection === 'Update Now' && vsixAsset) {
            await installVsixUpdate(vsixAsset, latestVersion);
        } else if (selection === 'Download .deb' && debAsset) {
            vscode.env.openExternal(vscode.Uri.parse(debAsset.browser_download_url));
        } else if (selection === 'Release Notes') {
            vscode.env.openExternal(vscode.Uri.parse(release.html_url));
        }
    } catch (err: any) {
        if (!options.silentIfLatest) {
            vscode.window.showErrorMessage(`Update check failed: ${err.message}`);
        }
    }
}

async function installVsixUpdate(asset: GitHubReleaseAsset, versionTag: string): Promise<void> {
    const tmpDir = os.tmpdir();
    const tempVsixPath = path.join(tmpDir, asset.name);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Novellized: Downloading ${versionTag}...`,
            cancellable: false
        },
        async (progress) => {
            progress.report({ message: 'Downloading package...' });
            await downloadFileWithProgress(asset.browser_download_url, tempVsixPath, progress);

            progress.report({ message: 'Installing update...' });
            const vsixUri = vscode.Uri.file(tempVsixPath);
            await vscode.commands.executeCommand('workbench.extensions.installExtension', vsixUri);
        }
    );

    // Clean up temporary file
    try {
        if (fs.existsSync(tempVsixPath)) {
            fs.unlinkSync(tempVsixPath);
        }
    } catch { }

    const reloadChoice = await vscode.window.showInformationMessage(
        `Novellized Editor has been updated to ${versionTag}. Please reload window to apply.`,
        'Reload Window',
        'Later'
    );

    if (reloadChoice === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}

/**
 * Initializes the background update checker schedule
 */
export function initUpdateChecker(context: vscode.ExtensionContext): void {
    // 1. Register manual check command
    context.subscriptions.push(
        vscode.commands.registerCommand('novellized.checkForUpdates', () => {
            checkForUpdates(context, { silentIfLatest: false });
        })
    );

    // 2. Schedule automatic background check (once a day)
    const config = vscode.workspace.getConfiguration('novellized');
    const autoCheckEnabled = config.get<boolean>('checkForUpdates', true);
    if (!autoCheckEnabled) return;

    const lastCheckTime = context.globalState.get<number>(LAST_CHECK_KEY) || 0;
    const now = Date.now();

    if (now - lastCheckTime > ONE_DAY_MS) {
        context.globalState.update(LAST_CHECK_KEY, now);
        // Delay 5 seconds after startup to ensure smooth startup experience
        setTimeout(() => {
            checkForUpdates(context, { silentIfLatest: true }).catch(() => {});
        }, 5000);
    }
}
