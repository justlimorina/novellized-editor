import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();
const DIST_IDE = path.join(ROOT_DIR, 'dist-ide');
const STUDIO_DIR = path.join(DIST_IDE, 'Novellized-Studio');
const STAGING_DIR = path.join(DIST_IDE, 'deb-staging');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const VERSION = (process.env.RELEASE_VERSION || pkg.version).replace(/^v/i, '').trim();

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
    const metainfoDir = path.join(STAGING_DIR, 'usr', 'share', 'metainfo');
    const docDir = path.join(STAGING_DIR, 'usr', 'share', 'doc', 'novellized-studio');
    const aptSourcesDir = path.join(STAGING_DIR, 'etc', 'apt', 'sources.list.d');
    const debianMetaDir = path.join(STAGING_DIR, 'DEBIAN');

    await ensureDir(optAppDir);
    await ensureDir(usrBinDir);
    await ensureDir(applicationsDir);
    await ensureDir(iconsDir);
    await ensureDir(metainfoDir);
    await ensureDir(docDir);
    await ensureDir(aptSourcesDir);
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

    // 8. AppStream metainfo XML (enables GNOME Software / KDE Discover license, rating, and description)
    console.log('4. Generating AppStream metainfo XML ...');
    const metainfoContent = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>io.github.novellized.studio</id>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>
  <name>Novellized Studio</name>
  <summary>WYSIWYG Live Markdown Editor and Novelist IDE</summary>
  <description>
    <p>
      Novellized Studio is a distraction-free, professional literature writing and novel development environment.
    </p>
    <p>
      It features a WYSIWYG live markdown editor, automated chapter management, story bible, git checkpoints, and zero telemetry.
    </p>
  </description>
  <launchable type="desktop-id">novellized.desktop</launchable>
  <url type="homepage">https://github.com/novellized/novellized-editor</url>
  <url type="bugtracker">https://github.com/novellized/novellized-editor/issues</url>
  <developer id="io.github.novellized">
    <name>Novellized</name>
  </developer>
  <content_rating type="oars-1.1" />
  <releases>
    <release version="${VERSION}" date="${new Date().toISOString().split('T')[0]}">
      <description>
        <p>Novellized Studio ${VERSION} release.</p>
      </description>
    </release>
  </releases>
</component>
`;
    fs.writeFileSync(path.join(metainfoDir, 'io.github.novellized.studio.metainfo.xml'), metainfoContent, { encoding: 'utf8', mode: 0o644 });

    // 9. Debian machine-readable copyright file (/usr/share/doc/novellized-studio/copyright)
    console.log('5. Generating Debian copyright file ...');
    const licenseSrc = path.join(ROOT_DIR, 'LICENSE');
    const licenseText = fs.existsSync(licenseSrc) ? fs.readFileSync(licenseSrc, 'utf8') : 'MIT License';
    const copyrightContent = `Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: novellized-studio
Upstream-Contact: Novellized <contact@novellized.org>
Source: https://github.com/novellized/novellized-editor

Files: *
Copyright: 2026-present Novellized
           2018-present Peter Squicciarini and contributors
           2015-present Microsoft Corporation
License: MIT
` + licenseText.split('\n').map(l => l ? ` ${l}` : ' .').join('\n');
    fs.writeFileSync(path.join(docDir, 'copyright'), copyrightContent, { encoding: 'utf8', mode: 0o644 });

    // 10. Package-tracked APT repository file (/etc/apt/sources.list.d/novellized.list)
    const aptLine = 'deb [trusted=yes] https://novellized.github.io/apt stable main\n';
    fs.writeFileSync(path.join(aptSourcesDir, 'novellized.list'), aptLine, { encoding: 'utf8', mode: 0o644 });

    // 11. DEBIAN/control
    console.log('6. Generating DEBIAN/control manifest ...');
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
License: MIT
Description: Novellized Studio - Novelist IDE
 Professional Literary Writing & Novel Development Environment.
 WYSIWYG Live Markdown Editor and Distraction-free IDE for Authors and Novelists.
`;
    fs.writeFileSync(path.join(debianMetaDir, 'control'), controlContent, { encoding: 'utf8', mode: 0o644 });

    // 12. DEBIAN/postinst (Auto-configure APT repository on install)
    console.log('7. Generating DEBIAN/postinst script (Auto-register APT repo on install)...');
    const postinstContent = `#!/bin/sh
set -e

# Update desktop and icon databases
if which update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi
if which gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi

# Automatically register Novellized APT repository for background system updates
APT_LIST="/etc/apt/sources.list.d/novellized.list"
APT_LINE="deb [trusted=yes] https://novellized.github.io/apt stable main"

if [ ! -f "$APT_LIST" ]; then
    echo "$APT_LINE" > "$APT_LIST"
    chmod 0644 "$APT_LIST"
elif ! grep -q "novellized.github.io/apt" "$APT_LIST"; then
    echo "$APT_LINE" >> "$APT_LIST"
    chmod 0644 "$APT_LIST"
fi

exit 0
`;
    const postinstPath = path.join(debianMetaDir, 'postinst');
    fs.writeFileSync(postinstPath, postinstContent, { encoding: 'utf8', mode: 0o755 });
    fs.chmodSync(postinstPath, 0o755);

    // 13. DEBIAN/postrm (Clean up APT repository on uninstall)
    console.log('8. Generating DEBIAN/postrm script (Clean up APT repo on uninstall)...');
    const postrmContent = `#!/bin/sh
set -e

# Update desktop and icon databases
if which update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi
if which gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi

# Remove APT repository configuration when package is removed or purged
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
    rm -f /etc/apt/sources.list.d/novellized.list
fi

exit 0
`;
    const postrmPath = path.join(debianMetaDir, 'postrm');
    fs.writeFileSync(postrmPath, postrmContent, { encoding: 'utf8', mode: 0o755 });
    fs.chmodSync(postrmPath, 0o755);

    // 14. Build .deb package via dpkg-deb
    console.log(`9. Building ${debFileName} via dpkg-deb ...`);
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

