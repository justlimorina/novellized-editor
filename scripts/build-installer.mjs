import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();
const DIST_IDE = path.join(ROOT_DIR, 'dist-ide');
const STUDIO_DIR = path.join(DIST_IDE, 'Novellized-Studio');
const ISS_FILE = path.join(ROOT_DIR, 'scripts', 'novellized.iss');
const VERSION = '0.1.0';

function findInnoCompiler() {
    // 1. Check PATH
    try {
        const out = execSync('where iscc', { stdio: 'pipe' }).toString().trim().split('\n')[0].trim();
        if (out && fs.existsSync(out)) return out;
    } catch { }

    // 2. Common Program Files locations
    const candidatePaths = [
        'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
        'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe')
    ];

    for (const p of candidatePaths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

async function buildInstaller() {
    console.log('====================================================');
    console.log('   Novellized Studio Release & Installer Generator  ');
    console.log('====================================================\n');

    console.log('1. Preparing Novellized Studio application package...');
    execSync('node scripts/package-codium.mjs', { stdio: 'inherit' });

    // 1. Check for Inno Setup compiler
    console.log('1. Checking for Inno Setup Compiler (ISCC.exe)...');
    const isccPath = findInnoCompiler();

    if (isccPath) {
        console.log(`[OK] Found Inno Setup compiler: ${isccPath}`);
        console.log('Compiling Windows Setup installer (Novellized-Studio-Setup-x64.exe)...');
        try {
            execSync(`"${isccPath}" "${ISS_FILE}"`, { stdio: 'inherit' });
            console.log(`[OK] Installer built successfully in: ${DIST_IDE}`);
        } catch (err) {
            console.error('[ERROR] Failed to compile Inno Setup script:', err.message);
        }
    } else {
        console.log('[INFO] Inno Setup compiler (ISCC.exe) was not detected on this system.');
        console.log('  To build the standalone Windows Setup executable (.exe):');
        console.log('    1. Install Inno Setup 6 via: winget install --id JRSoftware.InnoSetup -e');
        console.log('    2. Re-run: npm run package:installer\n');
    }

    // 2. Build Portable Distribution Archive (.zip)
    console.log('2. Building clean Portable Release Archive (.zip)...');
    const zipName = `Novellized-Studio-v${VERSION}-win32-x64.zip`;
    const zipDest = path.join(DIST_IDE, zipName);

    // Clean transient logs and caches before zipping
    const cleanTargets = [
        path.join(STUDIO_DIR, 'data', 'user-data', 'logs'),
        path.join(STUDIO_DIR, 'data', 'user-data', 'Cache'),
        path.join(STUDIO_DIR, 'data', 'user-data', 'CachedData'),
        path.join(STUDIO_DIR, 'data', 'user-data', 'Crashpad')
    ];
    for (const t of cleanTargets) {
        if (fs.existsSync(t)) {
            try { fs.rmSync(t, { recursive: true, force: true }); } catch { }
        }
    }

    if (fs.existsSync(zipDest)) {
        try { fs.unlinkSync(zipDest); } catch { }
    }

    console.log(`Compressing ${STUDIO_DIR} -> ${zipDest} ...`);
    try {
        execSync(`tar -a -cf "${zipDest}" -C "${STUDIO_DIR}" .`, { stdio: 'inherit' });
        const stats = fs.statSync(zipDest);
        console.log(`[OK] Portable Release Archive created: ${zipName} (${(stats.size / (1024 * 1024)).toFixed(1)} MB)`);
    } catch (err) {
        console.warn('[WARN] Could not create zip archive via tar:', err.message);
    }

    console.log('\n====================================================');
    console.log('   Distribution artifacts available in: dist-ide/   ');
    console.log('====================================================');
    if (fs.existsSync(zipDest)) {
        console.log(`- Portable Zip: ${zipDest}`);
    }
    const setupExe = path.join(DIST_IDE, `Novellized-Studio-Setup-${VERSION}-x64.exe`);
    if (fs.existsSync(setupExe)) {
        console.log(`- Windows Setup: ${setupExe}`);
    }
    console.log('');
}

buildInstaller().catch(err => {
    console.error('[ERROR] Generator failed:', err);
    process.exit(1);
});
