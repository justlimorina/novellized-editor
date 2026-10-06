import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { DatabaseSync } from 'node:sqlite';
import { generateAllIcons } from './generate-ico.mjs';


const ROOT_DIR = process.cwd();
const CACHE_DIR = path.join(ROOT_DIR, '.cache');
const OUTPUT_DIR = path.join(ROOT_DIR, 'dist-ide', 'Novellized-Studio');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const VERSION = (process.env.RELEASE_VERSION || pkg.version).replace(/^v/i, '').trim();


async function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function getLatestVSCodiumRelease() {
    console.log('[INFO] Checking latest VSCodium release on GitHub...');
    const res = await fetch('https://api.github.com/repos/VSCodium/vscodium/releases/latest', {
        headers: { 'User-Agent': 'Novellized-Studio-Packager' }
    });
    if (!res.ok) {
        throw new Error(`Failed to query VSCodium release: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    let assetPattern;
    if (process.platform === 'win32') {
        assetPattern = /^VSCodium-win32-x64-.*\.zip$/i;
    } else if (process.platform === 'linux') {
        const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
        assetPattern = new RegExp(`^VSCodium-linux-${arch}-.*\\.tar\\.gz$`, 'i');
    } else if (process.platform === 'darwin') {
        const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
        assetPattern = new RegExp(`^VSCodium-darwin-${arch}-.*\\.zip$`, 'i');
    } else {
        throw new Error(`Unsupported platform: ${process.platform}`);
    }

    const asset = data.assets.find(a => assetPattern.test(a.name));
    if (!asset) {
        throw new Error(`Could not find VSCodium asset matching ${assetPattern} in latest release`);
    }
    return {
        version: data.tag_name,
        name: asset.name,
        url: asset.browser_download_url,
        size: asset.size
    };
}

async function downloadFile(url, destPath) {
    if (fs.existsSync(destPath)) {
        console.log(`[OK] Using cached VSCodium archive: ${destPath}`);
        return;
    }
    console.log(`[INFO] Downloading ${url} ...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log(`[OK] Download completed: ${(buffer.length / (1024 * 1024)).toFixed(1)} MB`);
}

function copyDirSync(src, dest) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

async function main() {
    console.log('====================================================');
    console.log('   Novellized Studio (VSCodium Novel IDE) Packager  ');
    console.log('====================================================\n');

    await ensureDir(CACHE_DIR);
    await ensureDir(path.dirname(OUTPUT_DIR));

    // 1. Generate Icons and Build Extension First
    generateAllIcons();
    console.log('\n1. Building Novellized Extension for production...');
    const buildCmd = process.platform === 'win32' ? 'npm.cmd run build' : 'npm run build';
    execSync(buildCmd, { stdio: 'inherit' });

    // 2. Fetch VSCodium
    const release = await getLatestVSCodiumRelease();
    console.log(`[OK] Target VSCodium version: ${release.version} (${release.name})`);

    const zipPath = path.join(CACHE_DIR, release.name);
    await downloadFile(release.url, zipPath);

    // 3. Extract to output directory
    const isCleanRequested = process.argv.includes('--clean') || process.argv.includes('--force');
    const isAlreadyExtracted = fs.existsSync(path.join(OUTPUT_DIR, 'resources', 'app'));

    if (!isAlreadyExtracted || isCleanRequested) {
        console.log(`\n2. Extracting to ${OUTPUT_DIR} ...`);
        if (fs.existsSync(OUTPUT_DIR) && isCleanRequested) {
            console.log('Cleaning old output directory (--clean requested)...');
            try {
                fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
            } catch (err) {
                console.warn('[WARN] Could not remove entire directory, continuing with overwrite...');
            }
        }
        ensureDir(OUTPUT_DIR);
        console.log('Extracting archive...');
        if (zipPath.endsWith('.tar.gz') || zipPath.endsWith('.tgz')) {
            execSync(`tar -xzf "${zipPath}" -C "${OUTPUT_DIR}"`, { stdio: 'inherit' });
        } else {
            execSync(`tar -xf "${zipPath}" -C "${OUTPUT_DIR}"`, { stdio: 'inherit' });
        }
    } else {
        console.log(`\n2. Output directory already extracted: ${OUTPUT_DIR}`);
        console.log('Skipping extraction (use --clean to force re-extract).');
    }

    // 4. Prune Built-in Developer Extensions
    console.log('\n3. Pruning built-in developer extensions...');
    const builtInExtDir = path.join(OUTPUT_DIR, 'resources', 'app', 'extensions');
    const EXTENSIONS_TO_KEEP = new Set([
        'configuration-editing',
        'json',
        'json-language-features',
        'markdown-basics',
        'markdown-language-features',
        'markdown-math',
        'mermaid-markdown-features',
        'media-preview',
        'search-result',
        'theme-defaults',
        'theme-seti',
        'theme-modern-icons',
        'simple-browser',
        'node_modules',
        'novellized-editor'
    ]);

    if (fs.existsSync(builtInExtDir)) {
        const allExts = fs.readdirSync(builtInExtDir);
        let prunedCount = 0;
        for (const ext of allExts) {
            if (!EXTENSIONS_TO_KEEP.has(ext)) {
                fs.rmSync(path.join(builtInExtDir, ext), { recursive: true, force: true });
                prunedCount++;
            }
        }
        console.log(`[OK] Pruned ${prunedCount} unused developer extensions (languages, debuggers, git, build tools)`);
    }

    // 5. Patch Workbench Menubar (Remove "Run" and "Terminal" menus)
    console.log('\n4. Patching Workbench to remove programmer menus and tailor Welcome page...');
    const workbenchMainJs = path.join(
        OUTPUT_DIR,
        'resources',
        'app',
        'out',
        'vs',
        'workbench',
        'workbench.desktop.main.js'
    );
    if (fs.existsSync(workbenchMainJs)) {
        // Always restore pristine workbench.desktop.main.js from cache archive first to prevent corrupting re-runs
        try {
            const restoreCmd = process.platform === 'win32'
                ? `tar -xf "${zipPath}" -C "${OUTPUT_DIR}" resources/app/out/vs/workbench/workbench.desktop.main.js`
                : `tar -xf "${zipPath}" -C "${OUTPUT_DIR}" --wildcards "*workbench.desktop.main.js"`;
            execSync(restoreCmd, { stdio: 'pipe' });
            console.log('[OK] Restored pristine workbench.desktop.main.js from archive for patching');
        } catch (e) {
            console.warn('[WARN] Could not restore pristine workbench file, patching in-place:', e.message);
        }

        let jsContent = fs.readFileSync(workbenchMainJs, 'utf8');
        const termPattern = /fe\.appendMenuItem\(T\.MenubarMainMenu,\{submenu:T\.MenubarTerminalMenu,[^}]+\},order:7\}\),?/;
        const runPattern = /fe\.appendMenuItem\(T\.MenubarMainMenu,\{submenu:T\.MenubarDebugMenu,[^}]+R\(\d+,"Run"\)[^}]+\},order:6[^}]*\}\),?/;

        const hasTerm = termPattern.test(jsContent);
        const hasRun = runPattern.test(jsContent);

        if (hasTerm || hasRun) {
            jsContent = jsContent.replace(termPattern, '').replace(runPattern, '');
            console.log('[OK] "Run" and "Terminal" menus completely removed from top Menu Bar');
        } else {
            console.log('[INFO] Menus already patched or patterns not found');
        }

        // Remove Run & Debug from Sidebar (Activity Bar) across ALL profiles (including fresh installed profiles)
        const defaultPinnedViewletsStr = JSON.stringify([
            { id: "workbench.view.extension.novellized-manuscript", pinned: true, visible: true, order: 0 },
            { id: "workbench.view.scm", pinned: true, visible: true, order: 1 },
            { id: "workbench.view.explorer", pinned: true, visible: false, order: 2 },
            { id: "workbench.view.search", pinned: true, visible: false, order: 3 },
            { id: "workbench.view.extensions", pinned: true, visible: false, order: 4 },
            { id: "workbench.view.debug", pinned: false, visible: false, order: 5 }
        ]);

        if (jsContent.includes('storageService.get(this.options.pinnedViewContainersKey,0,"[]")')) {
            jsContent = jsContent.replace(
                'storageService.get(this.options.pinnedViewContainersKey,0,"[]")',
                'storageService.get(this.options.pinnedViewContainersKey,0,' + JSON.stringify(defaultPinnedViewletsStr) + ')'
            );
            console.log('[OK] Default pinned viewlets set for initial profile loads');
        }

        const compositeBarIter = 'for(const n of this.getViewContainers())if(!t.some(({id:o})=>o===n.id)){';
        if (jsContent.includes(compositeBarIter)) {
            jsContent = jsContent.replace(
                compositeBarIter,
                'for(const n of this.getViewContainers())if(n.id==="workbench.view.debug")continue;else if(!t.some(({id:o})=>o===n.id)){'
            );
            console.log('[OK] "workbench.view.debug" excluded from composite bar registration');
        }

        const cachedViewletsIter = 'visible:!this.shouldBeHidden(f.id,f),order:f.order,pinned:f.pinned';
        if (jsContent.includes(cachedViewletsIter)) {
            jsContent = jsContent.replace(
                cachedViewletsIter,
                'visible:f.id!=="workbench.view.debug"&&!this.shouldBeHidden(f.id,f),order:f.order,pinned:f.id!=="workbench.view.debug"&&f.pinned'
            );
            console.log('[OK] Cached view containers filtered to unpin debug');
        }

        const debugContainerPattern = /\.registerViewContainer\(\{id:Uv,title:/;
        const debugUxPattern = /vWi="debugUx",dL=new K\(vWi,"default",/;
        if (debugContainerPattern.test(jsContent)) {
            jsContent = jsContent.replace(debugContainerPattern, '.registerViewContainer({id:Uv,hideIfEmpty:!0,title:');
            console.log('[OK] "Run and Debug" view container marked hideIfEmpty:true');
        }
        if (debugUxPattern.test(jsContent)) {
            jsContent = jsContent.replace(debugUxPattern, 'vWi="debugUx",dL=new K(vWi,"disabled",');
            console.log('[OK] "debugUx" disabled to suppress all debug views from sidebar');
        }

        // Auto-trust extension publishers (Bypass modal: "Do you trust the publisher...")
        const trustPublisherPattern = /isPublisherTrusted\((\w+)\)\{const \w+=\1\.publisher\.toLowerCase\(\);return [^}]+}/;
        if (trustPublisherPattern.test(jsContent)) {
            jsContent = jsContent.replace(trustPublisherPattern, 'isPublisherTrusted($1){return!0}');
            console.log('[OK] Extension publishers auto-trusted (bypassed untrusted publisher modal)');
        }

        // 1. Patch Welcome Page Subtitle ("Editing evolved" -> Literary tagline)
        const subtitleSnippet = 'x("p.subtitle.description",{},d(22616,null))';
        if (jsContent.includes(subtitleSnippet)) {
            jsContent = jsContent.replace(subtitleSnippet, 'x("p.subtitle.description",{},"Professional Literary Writing & Novel Development Environment")');
            console.log('[OK] Welcome Page subtitle updated to literary tagline');
        }

        // 2. Prune developer items from Welcome Start list (Git clone, remote connect) cleanly without syntax corruption
        const devItemsSnippet = ',{id:"topLevelGitClone",title:d(22719,null),description:d(22720,null),when:"config.git.enabled && !git.missing",icon:D.sourceControl,content:{type:"startEntry",command:"command:git.clone"}},{id:"topLevelGitOpen",title:d(22721,null),description:d(22722,null),when:"workspacePlatform == \'webworker\'",icon:D.sourceControl,content:{type:"startEntry",command:"command:remoteHub.openRepository"}},{id:"topLevelRemoteOpen",title:d(22723,null),description:d(22724,null),when:"!isWeb",icon:D.remote,content:{type:"startEntry",command:"command:workbench.action.remote.showMenu"}}]';
        if (jsContent.includes(devItemsSnippet)) {
            jsContent = jsContent.replace(devItemsSnippet, ']');
            console.log('[OK] Developer start items (Git clone, remote connect) removed from Welcome page');
        } else {
            console.warn('[WARN] devItemsSnippet not found in workbench.desktop.main.js');
        }

        // 3. Remove VSCodium Announcements from Welcome Page
        if (jsContent.includes('Pi(a,h.getDomElement(),u.getDomElement())')) {
            jsContent = jsContent.replace('Pi(a,h.getDomElement(),u.getDomElement())', 'Pi(a,h.getDomElement())');
            console.log('[OK] VSCodium Announcements removed from Welcome page');
        }
        if (jsContent.includes('Pi(a,u.getDomElement())')) {
            jsContent = jsContent.replace('Pi(a,u.getDomElement())', 'Pi(a)');
        }

        // 4. Remove VSCodium coding walkthroughs ("Get started with VSCodium")
        if (jsContent.includes('ZMs=[{id:"Setup"')) {
            jsContent = jsContent.replace('ZMs=[{id:"Setup"', 'ZMs=[];var _unusedZMs=[{id:"Setup"');
            console.log('[OK] VSCodium coding walkthroughs removed from Welcome page');
        }

        // 5. Patch Recent list to display Novel Title from .novel/project.json and full filesystem path (zero emojis)
        const origRecentSnippet = 'const{name:a,parentPath:l}=bIi(n),c=x("li"),h=x("button.button-link");h.innerText=a,h.title=n,h.setAttribute("aria-label",d(22617,null,a,l))';
        const newRecentSnippet = 'const{name:a,parentPath:l}=bIi(n),fullPath=r?.fsPath||r?.path||n,c=x("li"),h=x("button.button-link");h.innerText=a;h.title=fullPath;if(this.fileService&&r){try{const pUri=r.with({path:(r.path.endsWith("/")?r.path:r.path+"/") + ".novel/project.json"});this.fileService.readFile(pUri).then(_res=>{try{const _d=JSON.parse(_res.value.toString());if(_d&&_d.title){h.innerText=_d.title;h.title=_d.title+" ("+fullPath+")";}}catch{}}).catch(()=>{});}catch{}};h.setAttribute("aria-label",d(22617,null,a,l))';
        if (jsContent.includes(origRecentSnippet)) {
            jsContent = jsContent.replace(origRecentSnippet, newRecentSnippet);
            console.log('[OK] Recent list title patched to read from .novel/project.json');
        } else {
            console.warn('[WARN] origRecentSnippet not found in workbench.desktop.main.js');
        }

        const pathSnippet = 'u.innerText=l,u.title=n';
        if (jsContent.includes(pathSnippet)) {
            jsContent = jsContent.replace(pathSnippet, 'u.innerText=fullPath,u.title=fullPath');
            console.log('[OK] Recent list path patched to display full actual filesystem path');
        } else {
            console.warn('[WARN] pathSnippet not found in workbench.desktop.main.js');
        }

        fs.writeFileSync(workbenchMainJs, jsContent, 'utf8');

        // Strictly validate JavaScript syntax before proceeding
        try {
            execSync(`node --check "${workbenchMainJs}"`, { stdio: 'pipe' });
            console.log('[OK] workbench.desktop.main.js syntax validated successfully (0 syntax errors)');
        } catch (err) {
            console.error('[ERROR] SYNTAX ERROR in patched workbench.desktop.main.js:', err.stderr?.toString());
            throw new Error('workbench.desktop.main.js has syntax errors after patching');
        }
    }

    // 6. Set up Portable Mode (`data/` folder)
    console.log('\n5. Configuring Portable Novelist Environment...');
    const dataDir = path.join(OUTPUT_DIR, 'data');
    const extensionsDir = path.join(dataDir, 'extensions', 'novellized-editor');
    const userSettingsDir = path.join(dataDir, 'user-data', 'User');
    const globalStorageDir = path.join(userSettingsDir, 'globalStorage');

    ensureDir(extensionsDir);
    ensureDir(userSettingsDir);
    ensureDir(globalStorageDir);

    // Copy extension files to both portable data/extensions AND built-in resources/app/extensions
    console.log('Installing Novellized Prose Editor into extensions...');
    const builtInAppExtDir = path.join(OUTPUT_DIR, 'resources', 'app', 'extensions', 'novellized-editor');
    ensureDir(builtInAppExtDir);

    for (const targetExtDir of [extensionsDir, builtInAppExtDir]) {
        fs.copyFileSync(path.join(ROOT_DIR, 'package.json'), path.join(targetExtDir, 'package.json'));
        copyDirSync(path.join(ROOT_DIR, 'dist'), path.join(targetExtDir, 'dist'));
        copyDirSync(path.join(ROOT_DIR, 'themes'), path.join(targetExtDir, 'themes'));
        copyDirSync(path.join(ROOT_DIR, 'resources'), path.join(targetExtDir, 'resources'));
    }

    // Pre-configure settings for novelists
    const defaultSettings = {
        "workbench.colorTheme": "Novellized Warm Parchment",
        "editor.wordWrap": "on",
        "editor.lineNumbers": "off",
        "editor.minimap.enabled": false,
        "editor.renderWhitespace": "none",
        "editor.quickSuggestions": {
            "other": false,
            "comments": false,
            "strings": false
        },
        "editor.fontSize": 16,
        "editor.lineHeight": 28,
        "editor.fontFamily": "'Noto Serif', 'Liberation Serif', 'DejaVu Serif', 'Palatino Linotype', Georgia, 'Times New Roman', serif",
        "editor.cursorBlinking": "smooth",
        "editor.cursorSmoothCaretAnimation": "on",
        "workbench.startupEditor": "welcomePage",
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "workbench.enableExperiments": false,
        "workbench.welcomePage.extraAnnouncements": false,
        "workbench.welcomePage.walkthroughs.openOnInstall": false,
        "workbench.tips.enabled": false,

        // Version Control Enabled
        "git.enabled": true,
        "git.autofetch": false,
        "scm.showHistoryGraph": true,
        "workbench.layoutControl.enabled": false,
        "debug.showInStatusBar": "never",
        "debug.toolBarLocation": "hidden",
        "window.restoreWindows": "none"
    };

    fs.writeFileSync(
        path.join(userSettingsDir, 'settings.json'),
        JSON.stringify(defaultSettings, null, 2),
        'utf8'
    );
    console.log('[OK] Novelist settings pre-configured (Warm Parchment, line numbers off, clutter off)');

    // Clean runtime cache / stale locks so new builds never carry ghost sessions
    const userDataDir = path.join(dataDir, 'user-data');
    if (fs.existsSync(userDataDir)) {
        for (const entry of fs.readdirSync(userDataDir)) {
            if (entry !== 'User') {
                try { fs.rmSync(path.join(userDataDir, entry), { recursive: true, force: true }); } catch { }
            }
        }
    }
    const storageJson = path.join(globalStorageDir, 'storage.json');
    if (fs.existsSync(storageJson)) {
        try { fs.rmSync(storageJson, { force: true }); } catch { }
    }

    // 7. Configure state.vscdb (Activity Bar and Status Bar)
    console.log('\n6. Decluttering Activity Bar and Status Bar in state database...');
    const vscdbPath = path.join(globalStorageDir, 'state.vscdb');
    const vscdbBackup = path.join(globalStorageDir, 'state.vscdb.backup');
    if (fs.existsSync(vscdbBackup)) {
        fs.rmSync(vscdbBackup, { force: true });
    }

    try {
        const db = new DatabaseSync(vscdbPath);
        db.exec("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)");

        // 1. Activity Bar: Pin Manuscript, Source Control, Explorer, Search, and Extensions (Hide Debug only)
        const pinnedViewlets = [
            { "id": "workbench.view.extension.novellized-manuscript", "pinned": true, "visible": true, "order": 0 },
            { "id": "workbench.view.scm", "pinned": true, "visible": true, "order": 1 },
            { "id": "workbench.view.explorer", "pinned": true, "visible": false, "order": 2 },
            { "id": "workbench.view.search", "pinned": true, "visible": false, "order": 3 },
            { "id": "workbench.view.extensions", "pinned": true, "visible": false, "order": 4 },
            { "id": "workbench.view.debug", "pinned": false, "visible": false, "order": 5 }
        ];
        db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
            'workbench.activity.pinnedViewlets2',
            JSON.stringify(pinnedViewlets)
        );

        // 2. Status Bar: Hide Problems counter
        const hiddenStatusItems = [
            "status.problems",
            "status.problemsVisibility"
        ];
        db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
            'workbench.statusbar.hidden',
            JSON.stringify(hiddenStatusItems)
        );

        // 3. Markers / Problems panel hidden
        db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
            'workbench.panel.markers.hidden',
            JSON.stringify([{ "id": "workbench.panel.markers.view", "isHidden": true }])
        );

        db.close();
        console.log('[OK] Activity Bar pinned to: Manuscript, Source Control, Explorer, Search (Debug removed)');
        console.log('[OK] Status Bar problems counter hidden (Source Control enabled)');
    } catch (e) {
        console.warn('[WARN] Could not configure state.vscdb:', e.message);
    }


    // 8. Custom Branding in product.json
    console.log('\n7. Applying Novellized Studio branding...');
    const productJsonPath = path.join(OUTPUT_DIR, 'resources', 'app', 'product.json');
    if (fs.existsSync(productJsonPath)) {
        const product = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
        product.nameShort = "Novellized Studio";
        product.nameLong = "Novellized Studio - Novelist IDE";
        product.applicationName = "novellized";
        product.dataFolderName = ".novellized";
        product.win32MutexName = "novellized";
        product.win32AppUserModelId = "Novellized.Novellized";
        product.win32DirName = "Novellized";
        product.win32NameVersion = "Novellized Studio";
        product.win32RegValueName = "Novellized";
        product.win32ShellNameShort = "Novellized";
        product.enableTelemetry = false;
        product.sendASARTelemetry = false;

        // Clear built-in debug extensions
        product.builtInExtensions = [];

        // Eliminate "installation appears to be corrupt" checksum warning
        delete product.checksums;

        // Apply novelist configuration defaults for all profiles & installed users
        product.configurationDefaults = defaultSettings;

        fs.writeFileSync(productJsonPath, JSON.stringify(product, null, 2), 'utf8');
        console.log('[OK] product.json updated with Novellized Studio branding, configurationDefaults & checksums disabled');
    }

    // 9. Rename Executable & Setup Application Launchers
    console.log('\n8. Finalizing Novellized executable & platform launchers...');
    let targetExePath = '';

    if (process.platform === 'win32') {
        const oldExe = path.join(OUTPUT_DIR, 'VSCodium.exe');
        const newExe = path.join(OUTPUT_DIR, 'Novellized.exe');
        targetExePath = newExe;
        if (fs.existsSync(oldExe)) {
            fs.renameSync(oldExe, newExe);
            console.log('[OK] Executable renamed to Novellized.exe');
        }

        if (fs.existsSync(newExe)) {
            const icoPath = path.join(ROOT_DIR, 'resources', 'icon.ico');
            if (fs.existsSync(icoPath)) {
                console.log('Injecting native icon.ico and PE metadata into Novellized.exe...');
                try {
                    const { rcedit } = await import('rcedit');
                    const semverParts = VERSION.split('-')[0].split('.').map(x => parseInt(x, 10) || 0);
                    while (semverParts.length < 4) semverParts.push(0);
                    const winQuadVersion = semverParts.slice(0, 4).join('.');

                    await rcedit(newExe, {
                        icon: icoPath,
                        'version-string': {
                            FileDescription: 'Novellized Studio',
                            ProductName: 'Novellized Studio',
                            ProductVersion: VERSION,
                            FileVersion: VERSION,
                            CompanyName: 'Novellized',
                            LegalCopyright: 'Copyright (C) 2026 Novellized',
                            OriginalFilename: 'Novellized.exe',
                            InternalName: 'Novellized'
                        },
                        'file-version': winQuadVersion,
                        'product-version': winQuadVersion
                    });
                    console.log('[OK] Injected custom icon.ico and PE metadata into Novellized.exe');
                } catch (err) {
                    console.warn('[WARN] Could not inject native PE resources:', err.message);
                }
            }
        }
    } else if (process.platform === 'linux') {
        const oldBin = path.join(OUTPUT_DIR, 'codium');
        const newBin = path.join(OUTPUT_DIR, 'novellized');
        targetExePath = newBin;

        if (fs.existsSync(oldBin)) {
            fs.renameSync(oldBin, newBin);
            console.log('[OK] Binary renamed to novellized');
        } else if (!fs.existsSync(newBin)) {
            // Check in bin/ if present
            const subBin = path.join(OUTPUT_DIR, 'bin', 'codium');
            if (fs.existsSync(subBin)) {
                const newSubBin = path.join(OUTPUT_DIR, 'bin', 'novellized');
                fs.renameSync(subBin, newSubBin);
                targetExePath = newSubBin;
                console.log('[OK] Binary renamed to bin/novellized');
            }
        }

        if (fs.existsSync(targetExePath)) {
            fs.chmodSync(targetExePath, 0o755);
            console.log('[OK] Executable permissions set (chmod 755)');
        }

        // Copy icon for Linux desktop
        const pngIcon = path.join(ROOT_DIR, 'resources', 'icon.png');
        const destIcon = path.join(OUTPUT_DIR, 'novellized.png');
        if (fs.existsSync(pngIcon)) {
            fs.copyFileSync(pngIcon, destIcon);
            console.log('[OK] App icon copied to novellized.png');
        }

        // Generate Desktop entry & quick-installer script
        const desktopContent = `[Desktop Entry]
Name=Novellized Studio
Comment=Professional Literary Writing & Novel Development Environment
GenericName=Novel Prose Editor
Exec="${targetExePath}" %F
Icon=${destIcon}
Terminal=false
Type=Application
StartupNotify=true
Categories=Office;WordProcessor;TextEditor;Publishing;
MimeType=text/markdown;text/plain;
`;
        fs.writeFileSync(path.join(OUTPUT_DIR, 'novellized.desktop'), desktopContent, 'utf8');
        console.log('[OK] Created novellized.desktop entry file');

        const installMenuScript = `#!/usr/bin/env bash
set -e
APP_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ICON_DIR="\$HOME/.local/share/icons/hicolor/256x256/apps"
DESKTOP_DIR="\$HOME/.local/share/applications"

mkdir -p "\$ICON_DIR" "\$DESKTOP_DIR"
cp "\$APP_DIR/novellized.png" "\$ICON_DIR/novellized.png"

cat <<EOF > "\$DESKTOP_DIR/novellized.desktop"
[Desktop Entry]
Name=Novellized Studio
Comment=Professional Literary Writing & Novel Development Environment
GenericName=Novel Prose Editor
Exec="\$APP_DIR/novellized" %F
Icon=novellized
Terminal=false
Type=Application
StartupNotify=true
Categories=Office;WordProcessor;TextEditor;Publishing;
MimeType=text/markdown;text/plain;
EOF

chmod +x "\$DESKTOP_DIR/novellized.desktop"
echo "[OK] Novellized Studio has been successfully added to your Linux Application Menu!"
`;
        const installScriptPath = path.join(OUTPUT_DIR, 'install-desktop-menu.sh');
        fs.writeFileSync(installScriptPath, installMenuScript, { encoding: 'utf8', mode: 0o755 });
        console.log('[OK] Created install-desktop-menu.sh helper script');
    }

    console.log('\n====================================================');
    console.log('   NOVELLIZED STUDIO IDE SUCCESSFULLY CREATED!      ');
    console.log('====================================================');
    console.log(`Executable Path: ${targetExePath || OUTPUT_DIR}`);
    console.log('You can run Novellized Studio directly with ZERO telemetry and ZERO dependencies!\n');
}

main().catch(err => {
    console.error('\n[ERROR] Packager error:', err);
    process.exit(1);
});

