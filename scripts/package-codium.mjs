import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();
const CACHE_DIR = path.join(ROOT_DIR, '.cache');
const OUTPUT_DIR = path.join(ROOT_DIR, 'dist-ide', 'Novellized-Studio-win32-x64');

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
    console.log(`\n2. Extracting to ${OUTPUT_DIR} ...`);
    if (fs.existsSync(OUTPUT_DIR)) {
        console.log('Cleaning old output directory...');
        fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
    ensureDir(OUTPUT_DIR);

    // Use tar -xf (built-in to Windows 10/11 and faster than PowerShell)
    console.log('Extracting archive...');
    execSync(`tar -xf "${zipPath}" -C "${OUTPUT_DIR}"`, { stdio: 'inherit' });

    // 4. Set up Portable Mode (`data/` folder)
    console.log('\n3. Configuring Portable Novelist Environment...');
    const dataDir = path.join(OUTPUT_DIR, 'data');
    const extensionsDir = path.join(dataDir, 'extensions', 'novellized-editor');
    const userSettingsDir = path.join(dataDir, 'user-data', 'User');

    ensureDir(extensionsDir);
    ensureDir(userSettingsDir);

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
        "workbench.enableExperiments": false
    };

    fs.writeFileSync(
        path.join(userSettingsDir, 'settings.json'),
        JSON.stringify(defaultSettings, null, 2),
        'utf8'
    );
    console.log('✓ Novelist settings pre-configured (Warm Parchment, line numbers off, telemetry off)');

    // 5. Custom Branding in product.json
    console.log('\n4. Applying Novellized Studio branding...');
    const productJsonPath = path.join(OUTPUT_DIR, 'resources', 'app', 'product.json');
    if (fs.existsSync(productJsonPath)) {
        const product = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
        product.nameShort = "Novellized Studio";
        product.nameLong = "Novellized Studio - Novelist IDE";
        product.applicationName = "novellized";
        product.dataFolderName = ".novellized";
        product.win32MutexName = "novellized";
        product.enableTelemetry = false;
        product.sendASARTelemetry = false;

        fs.writeFileSync(productJsonPath, JSON.stringify(product, null, 2), 'utf8');
        console.log('✓ product.json updated with Novellized Studio branding');
    }

    // 6. Rename Executable
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

