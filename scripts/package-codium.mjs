import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { DatabaseSync } from 'node:sqlite';


const ROOT_DIR = process.cwd();
const CACHE_DIR = path.join(ROOT_DIR, '.cache');
const OUTPUT_DIR = path.join(ROOT_DIR, 'dist-ide', 'Novellized-Studio');


async function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function getLatestVSCodiumRelease() {
    console.log('🔍 Checking latest VSCodium release on GitHub...');
    const res = await fetch('https://api.github.com/repos/VSCodium/vscodium/releases/latest', {
        headers: { 'User-Agent': 'Novellized-Studio-Packager' }
    });
    if (!res.ok) {
        throw new Error(`Failed to query VSCodium release: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const asset = data.assets.find(a => /^VSCodium-win32-x64-.*\.zip$/i.test(a.name));
    if (!asset) {
        throw new Error('Could not find VSCodium-win32-x64-*.zip asset in latest release');
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
        console.log(`✓ Using cached VSCodium archive: ${destPath}`);
        return;
    }
    console.log(`📥 Downloading ${url} ...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log(`✓ Download completed: ${(buffer.length / (1024 * 1024)).toFixed(1)} MB`);
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

    // 1. Build Extension First
    console.log('1. Building Novellized Extension for production...');
    execSync('npm.cmd run build', { stdio: 'inherit' });

    // 2. Fetch VSCodium
    const release = await getLatestVSCodiumRelease();
    console.log(`✓ Target VSCodium version: ${release.version} (${release.name})`);

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
                console.warn('⚠️ Could not remove entire directory, continuing with overwrite...');
            }
        }
        ensureDir(OUTPUT_DIR);
        console.log('Extracting archive...');
        execSync(`tar -xf "${zipPath}" -C "${OUTPUT_DIR}"`, { stdio: 'inherit' });
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
        'node_modules'
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
        console.log(`✓ Pruned ${prunedCount} unused developer extensions (languages, debuggers, git, build tools)`);
    }

    // 5. Patch Workbench Menubar (Remove "Run" and "Terminal" menus)
    console.log('\n4. Patching Workbench to remove programmer menus (Run & Terminal)...');
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
        let jsContent = fs.readFileSync(workbenchMainJs, 'utf8');
        const termPattern = /fe\.appendMenuItem\(T\.MenubarMainMenu,\{submenu:T\.MenubarTerminalMenu,[^}]+\},order:7\}\),?/;
        const runPattern = /fe\.appendMenuItem\(T\.MenubarMainMenu,\{submenu:T\.MenubarDebugMenu,[^}]+R\(\d+,"Run"\)[^}]+\},order:6[^}]*\}\),?/;

        const hasTerm = termPattern.test(jsContent);
        const hasRun = runPattern.test(jsContent);

        if (hasTerm || hasRun) {
            jsContent = jsContent.replace(termPattern, '').replace(runPattern, '');
            console.log('✓ "Run" and "Terminal" menus completely removed from top Menu Bar');
        } else {
            console.log('• Menus already patched or patterns not found');
        }

        // Remove Run & Debug from Sidebar (Activity Bar)
        const debugContainerPattern = /\.registerViewContainer\(\{id:Uv,title:/;
        const debugUxPattern = /vWi="debugUx",dL=new K\(vWi,"default",/;
        if (debugContainerPattern.test(jsContent)) {
            jsContent = jsContent.replace(debugContainerPattern, '.registerViewContainer({id:Uv,hideIfEmpty:!0,title:');
            console.log('✓ "Run and Debug" view container marked hideIfEmpty:true');
        }
        if (debugUxPattern.test(jsContent)) {
            jsContent = jsContent.replace(debugUxPattern, 'vWi="debugUx",dL=new K(vWi,"disabled",');
            console.log('✓ "debugUx" disabled to suppress all debug views from sidebar');
        }

        // Auto-trust extension publishers (Bypass modal: "Do you trust the publisher...")
        const trustPublisherPattern = /isPublisherTrusted\((\w+)\)\{const \w+=\1\.publisher\.toLowerCase\(\);return [^}]+}/;
        if (trustPublisherPattern.test(jsContent)) {
            jsContent = jsContent.replace(trustPublisherPattern, 'isPublisherTrusted($1){return!0}');
            console.log('✓ Extension publishers auto-trusted (bypassed untrusted publisher modal)');
        }

        // 1. Patch Welcome Page Subtitle ("Editing evolved" -> Literary tagline)
        const subtitleSnippet = 'x("p.subtitle.description",{},d(22616,null))';
        if (jsContent.includes(subtitleSnippet)) {
            jsContent = jsContent.replace(subtitleSnippet, 'x("p.subtitle.description",{},"Môi trường sáng tác văn học & tiểu thuyết chuyên nghiệp")');
            console.log('✓ Welcome Page subtitle updated to literary tagline');
        }

        // 2. Prune developer items from Welcome Start list (Git clone, remote connect)
        const gitClonePattern = /\{id:"topLevelGitClone",[^}]+\},?/;
        const gitOpenPattern = /\{id:"topLevelGitOpen",[^}]+\},?/;
        const remoteOpenPattern = /\{id:"topLevelRemoteOpen",[^}]+\},?/;
        if (gitClonePattern.test(jsContent)) {
            jsContent = jsContent.replace(gitClonePattern, '').replace(gitOpenPattern, '').replace(remoteOpenPattern, '');
            console.log('✓ Developer start items (Git clone, remote connect) removed from Welcome page');
        }

        // 3. Patch Recent list to display Novel Title from .novel/project.json and full filesystem path
        const recentSnippet = 'const{name:a,parentPath:l}=bIi(n),c=x("li"),h=x("button.button-link");h.innerText=a,h.title=n';
        if (jsContent.includes(recentSnippet)) {
            const replacement = 'const{name:a,parentPath:l}=bIi(n);const fullPath=r?.fsPath||r?.path||n;const c=x("li"),h=x("button.button-link");h.innerText=a;h.title=fullPath;if(this.fileService&&r){try{const pUri=r.with({path:(r.path.endsWith("/")?r.path:r.path+"/") + ".novel/project.json"});this.fileService.readFile(pUri).then(_res=>{try{const _d=JSON.parse(new TextDecoder().decode(_res.value.buffer));if(_d&&_d.title){h.innerText=_d.title;h.title=_d.title+" ("+fullPath+")";}}catch{}}).catch(()=>{});}catch{}}';
            jsContent = jsContent.replace(recentSnippet, replacement);
            console.log('✓ Recent list title patched to read from .novel/project.json');
        }

        const pathSnippet = 'u.innerText=l,u.title=n';
        if (jsContent.includes(pathSnippet)) {
            jsContent = jsContent.replace(pathSnippet, 'u.innerText=fullPath,u.title=fullPath');
            console.log('✓ Recent list path patched to display full actual filesystem path');
        }

        fs.writeFileSync(workbenchMainJs, jsContent, 'utf8');
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

    // Copy extension files
    console.log('Installing Novellized Prose Editor into portable extensions...');
    fs.copyFileSync(path.join(ROOT_DIR, 'package.json'), path.join(extensionsDir, 'package.json'));
    copyDirSync(path.join(ROOT_DIR, 'dist'), path.join(extensionsDir, 'dist'));
    copyDirSync(path.join(ROOT_DIR, 'themes'), path.join(extensionsDir, 'themes'));
    copyDirSync(path.join(ROOT_DIR, 'resources'), path.join(extensionsDir, 'resources'));

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
        "editor.fontFamily": "Palatino Linotype, Georgia, 'Times New Roman', serif",
        "editor.cursorBlinking": "smooth",
        "editor.cursorSmoothCaretAnimation": "on",
        "workbench.startupEditor": "welcomePage",
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "workbench.enableExperiments": false,

        // Version Control Enabled
        "git.enabled": true,
        "git.autofetch": false,
        "scm.showHistoryGraph": true,
        "workbench.layoutControl.enabled": false,
        "debug.showInStatusBar": "never",
        "debug.toolBarLocation": "hidden",
        "workbench.tips.enabled": false,
        "window.restoreWindows": "none"
    };

    fs.writeFileSync(
        path.join(userSettingsDir, 'settings.json'),
        JSON.stringify(defaultSettings, null, 2),
        'utf8'
    );
    console.log('✓ Novelist settings pre-configured (Warm Parchment, line numbers off, clutter off)');

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
        console.log('✓ Activity Bar pinned to: Manuscript, Source Control, Explorer, Search (Debug removed)');
        console.log('✓ Status Bar problems counter hidden (Source Control enabled)');
    } catch (e) {
        console.warn('⚠️ Could not configure state.vscdb:', e.message);
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

        // Eliminate "installation appears to be corrupt" checksum warning
        delete product.checksums;

        fs.writeFileSync(productJsonPath, JSON.stringify(product, null, 2), 'utf8');
        console.log('✓ product.json updated with Novellized Studio branding & checksums disabled');
    }

    // 9. Rename Executable
    const oldExe = path.join(OUTPUT_DIR, 'VSCodium.exe');
    const newExe = path.join(OUTPUT_DIR, 'Novellized.exe');
    if (fs.existsSync(oldExe)) {
        fs.renameSync(oldExe, newExe);
        console.log('✓ Executable renamed to Novellized.exe');
    }

    console.log('\n====================================================');
    console.log('   🎉 NOVELLIZED STUDIO IDE SUCCESSFULLY CREATED!   ');
    console.log('====================================================');
    console.log(`Executable Path: ${newExe}`);
    console.log('You can run Novellized.exe directly with ZERO telemetry and ZERO dependencies!\n');
}

main().catch(err => {
    console.error('\n❌ Packager error:', err);
    process.exit(1);
});

