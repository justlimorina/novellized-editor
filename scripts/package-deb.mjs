import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();
const DIST_IDE = path.join(ROOT_DIR, 'dist-ide');
const STUDIO_DIR = path.join(DIST_IDE, 'Novellized-Studio');
const STAGING_DIR = path.join(DIST_IDE, 'deb-staging');
const VERSION = '0.1.0';

async function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function copyDirSync(src, dest, filterFn) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        if (filterFn && !filterFn(entry.name, entry.isDirectory())) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath, filterFn);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

async function buildDeb() {
    console.log('====================================================');
    console.log('   Novellized Studio (.deb) Package Generator       ');
    console.log('====================================================\n');

    if (process.platform !== 'linux') {
        console.log('[INFO] .deb package generation is only supported on Linux runners. Skipping.');
        return;
    }

    // 1. Ensure Novellized Studio is packaged
    if (!fs.existsSync(path.join(STUDIO_DIR, 'novellized')) && !fs.existsSync(path.join(STUDIO_DIR, 'codium'))) {
        console.log('[INFO] Novellized Studio not found. Building it first...');
        execSync('node scripts/package-codium.mjs', { stdio: 'inherit' });
    }

    // 2. Prepare staging directory
    if (fs.existsSync(STAGING_DIR)) {
        fs.rmSync(STAGING_DIR, { recursive: true, force: true });
    }
    await ensureDir(STAGING_DIR);

    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const debFileName = `novellized-studio_${VERSION}_${arch}.deb`;
    const debDest = path.join(DIST_IDE, debFileName);

    // 3. Define Debian package layout
    const optAppDir = path.join(STAGING_DIR, 'opt', 'novellized-studio');
    const usrBinDir = path.join(STAGING_DIR, 'usr', 'bin');
    const applicationsDir = path.join(STAGING_DIR, 'usr', 'share', 'applications');
    const iconsDir = path.join(STAGING_DIR, 'usr', 'share', 'icons', 'hicolor', '256x256', 'apps');
    const debianMetaDir = path.join(STAGING_DIR, 'DEBIAN');

    await ensureDir(optAppDir);
    await ensureDir(usrBinDir);
    await ensureDir(applicationsDir);
    await ensureDir(iconsDir);
    await ensureDir(debianMetaDir);

    // 4. Copy app files to /opt/novellized-studio (EXCLUDE portable 'data' folder for system-wide install)
    console.log('1. Staging application files into /opt/novellized-studio ...');
    copyDirSync(STUDIO_DIR, optAppDir, (name, isDir) => {
        // Exclude portable data directory so users get standard ~/.novellized in system mode
        if (isDir && name === 'data') return false;
        if (name === 'novellized.desktop' || name === 'install-desktop-menu.sh') return false;
        return true;
    });

    // Ensure executable permissions in /opt
    const mainBin = path.join(optAppDir, 'novellized');
    if (fs.existsSync(mainBin)) {
        fs.chmodSync(mainBin, 0o755);
    }

    // 5. Create launcher wrapper in /usr/bin/novellized
    console.log('2. Creating launcher wrapper in /usr/bin/novellized ...');
    const launcherScript = `#!/bin/sh
exec /opt/novellized-studio/novellized "$@"
`;
    const launcherPath = path.join(usrBinDir, 'novellized');
    fs.writeFileSync(launcherPath, launcherScript, { encoding: 'utf8', mode: 0o755 });

    // 6. Copy Icon to /usr/share/icons/hicolor/256x256/apps/novellized.png
    console.log('3. Setting up desktop icons and metadata ...');
    const iconSrc = path.join(ROOT_DIR, 'resources', 'icon.png');
    if (fs.existsSync(iconSrc)) {
        fs.copyFileSync(iconSrc, path.join(iconsDir, 'novellized.png'));
    }

    // 7. Desktop entry in /usr/share/applications/novellized.desktop
    const desktopEntry = `[Desktop Entry]
Name=Novellized Studio
Comment=Professional Literary Writing & Novel Development Environment
GenericName=Novel Prose Editor
Exec=/usr/bin/novellized %F
Icon=novellized
Terminal=false
Type=Application
StartupNotify=true
Categories=Office;WordProcessor;TextEditor;Publishing;
MimeType=text/markdown;text/plain;
`;
    fs.writeFileSync(path.join(applicationsDir, 'novellized.desktop'), desktopEntry, { encoding: 'utf8', mode: 0o644 });

    // 8. DEBIAN/control
    console.log('4. Generating DEBIAN/control manifest ...');
    let totalSizeBytes = 0;
    function calcSize(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) calcSize(p);
            else totalSizeBytes += fs.statSync(p).size;
        }
    }
    calcSize(optAppDir);
    const installedSizeKb = Math.ceil(totalSizeBytes / 1024);

    const controlContent = `Package: novellized-studio
Version: ${VERSION}
Section: editors
Priority: optional
Architecture: ${arch}
Installed-Size: ${installedSizeKb}
Maintainer: Novellized <contact@novellized.org>
Depends: libgtk-3-0 | libgtk-3-0t64, libnotify4, libnss3, libxss1, xdg-utils, libsecret-1-0, libasound2 | libasound2t64
Homepage: https://github.com/novellized/novellized-editor
Description: Novellized Studio - Novelist IDE
 Professional Literary Writing & Novel Development Environment.
 WYSIWYG Live Markdown Editor and Distraction-free IDE for Authors and Novelists.
`;
    fs.writeFileSync(path.join(debianMetaDir, 'control'), controlContent, { encoding: 'utf8', mode: 0o644 });

    // 9. Build .deb package via dpkg-deb
    console.log(`5. Building ${debFileName} via dpkg-deb ...`);
    try {
        execSync(`dpkg-deb --build --root-owner-group "${STAGING_DIR}" "${debDest}"`, { stdio: 'inherit' });
        const stats = fs.statSync(debDest);
        console.log(`\n[OK] Debian Package successfully created:`);
        console.log(`     Path: ${debDest}`);
        console.log(`     Size: ${(stats.size / (1024 * 1024)).toFixed(1)} MB`);
        console.log(`\nInstall command on Debian/Ubuntu:`);
        console.log(`     sudo apt install ./${path.relative(ROOT_DIR, debDest)}\n`);
    } finally {
        try { fs.rmSync(STAGING_DIR, { recursive: true, force: true }); } catch { }
    }
}

buildDeb().catch(err => {
    console.error('\n[ERROR] Deb packaging failed:', err);
    process.exit(1);
});

