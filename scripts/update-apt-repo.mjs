import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();
const SIBLING_WEB_DIR = path.resolve(ROOT_DIR, '..', 'novellized.github.io');
const DEFAULT_APT_DIR = fs.existsSync(SIBLING_WEB_DIR)
    ? path.join(SIBLING_WEB_DIR, 'apt')
    : path.join(ROOT_DIR, 'dist-ide', 'apt');

function getHash(filePath, algorithm) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash(algorithm).update(fileBuffer).digest('hex');
}

function getBufferHash(buffer, algorithm) {
    return crypto.createHash(algorithm).update(buffer).digest('hex');
}

function ensureDirSync(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function generateAptRepository(targetAptDir = DEFAULT_APT_DIR) {
    console.log('====================================================');
    console.log('   Novellized Studio APT Repository Generator       ');
    console.log('====================================================\n');

    // 1. Locate .deb files
    const distIde = path.join(ROOT_DIR, 'dist-ide');
    if (!fs.existsSync(distIde)) {
        throw new Error(`Directory not found: ${distIde}. Please build the .deb package first.`);
    }

    const debFiles = fs.readdirSync(distIde)
        .filter(f => f.endsWith('.deb'))
        .map(f => path.join(distIde, f));

    if (debFiles.length === 0) {
        console.log('[INFO] No .deb files found in dist-ide/. Building deb package first...');
        execSync('node scripts/package-deb.mjs', { stdio: 'inherit' });
        const refreshed = fs.readdirSync(distIde)
            .filter(f => f.endsWith('.deb'))
            .map(f => path.join(distIde, f));
        if (refreshed.length === 0) {
            throw new Error('Failed to locate or generate .deb package');
        }
        debFiles.push(...refreshed);
    }

    console.log(`Target APT Directory: ${targetAptDir}`);
    console.log(`Found ${debFiles.length} Debian package(s) to index:\n` + debFiles.map(d => ` - ${path.basename(d)}`).join('\n') + '\n');

    // 2. Prepare APT repository layout
    const poolDir = path.join(targetAptDir, 'pool', 'main', 'n', 'novellized-studio');
    const distsStableDir = path.join(targetAptDir, 'dists', 'stable');
    const binaryAmd64Dir = path.join(distsStableDir, 'main', 'binary-amd64');

    ensureDirSync(poolDir);
    ensureDirSync(binaryAmd64Dir);

    // 3. Copy packages into pool & parse control
    let packagesEntries = [];

    for (const debPath of debFiles) {
        const debName = path.basename(debPath);
        const poolDest = path.join(poolDir, debName);

        // Copy .deb into pool
        fs.copyFileSync(debPath, poolDest);

        // Extract control fields via dpkg-deb -f
        let controlText = '';
        try {
            controlText = execSync(`dpkg-deb -f "${debPath}"`, { encoding: 'utf8' }).trim();
        } catch (err) {
            console.warn(`[WARN] Could not inspect ${debName} via dpkg-deb: ${err.message}`);
            continue;
        }

        const fileSize = fs.statSync(debPath).size;
        const md5 = getHash(debPath, 'md5');
        const sha1 = getHash(debPath, 'sha1');
        const sha256 = getHash(debPath, 'sha256');
        const relativeFilename = `pool/main/n/novellized-studio/${debName}`;

        const entry = `${controlText}\nFilename: ${relativeFilename}\nSize: ${fileSize}\nMD5sum: ${md5}\nSHA1: ${sha1}\nSHA256: ${sha256}`;
        packagesEntries.push(entry);
    }

    if (packagesEntries.length === 0) {
        throw new Error('No valid package entries could be created');
    }

    // 4. Write Packages and Packages.gz
    console.log('1. Generating Packages and Packages.gz ...');
    const packagesContent = packagesEntries.join('\n\n') + '\n';
    const packagesPath = path.join(binaryAmd64Dir, 'Packages');
    fs.writeFileSync(packagesPath, packagesContent, 'utf8');

    const gzBuffer = zlib.gzipSync(Buffer.from(packagesContent, 'utf8'));
    const packagesGzPath = path.join(binaryAmd64Dir, 'Packages.gz');
    fs.writeFileSync(packagesGzPath, gzBuffer);

    // 5. Generate Release file
    console.log('2. Generating dists/stable/Release manifest ...');
    const pkgSize = fs.statSync(packagesPath).size;
    const pkgMd5 = getHash(packagesPath, 'md5');
    const pkgSha1 = getHash(packagesPath, 'sha1');
    const pkgSha256 = getHash(packagesPath, 'sha256');

    const gzSize = gzBuffer.length;
    const gzMd5 = getBufferHash(gzBuffer, 'md5');
    const gzSha1 = getBufferHash(gzBuffer, 'sha1');
    const gzSha256 = getBufferHash(gzBuffer, 'sha256');

    const releaseContent = `Origin: Novellized
Label: Novellized Studio
Suite: stable
Codename: stable
Version: 1.0
Architectures: amd64
Components: main
Description: Official APT Repository for Novellized Studio
Date: ${new Date().toUTCString()}
MD5Sum:
 ${pkgMd5} ${pkgSize} main/binary-amd64/Packages
 ${gzMd5} ${gzSize} main/binary-amd64/Packages.gz
SHA1:
 ${pkgSha1} ${pkgSize} main/binary-amd64/Packages
 ${gzSha1} ${gzSize} main/binary-amd64/Packages.gz
SHA256:
 ${pkgSha256} ${pkgSize} main/binary-amd64/Packages
 ${gzSha256} ${gzSize} main/binary-amd64/Packages.gz
`;

    const releasePath = path.join(distsStableDir, 'Release');
    fs.writeFileSync(releasePath, releaseContent, 'utf8');

    console.log('\n====================================================');
    console.log('   APT REPOSITORY SUCCESSFULLY CREATED & INDEXED!   ');
    console.log('====================================================');
    console.log(`Repository Location: ${targetAptDir}`);
    console.log(`Indexed Packages:    ${debFiles.length}`);
    console.log(`Release Manifest:    ${releasePath}\n`);
}

// Allow passing custom target directory via CLI: node scripts/update-apt-repo.mjs [targetDir]
const customDir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
generateAptRepository(customDir).catch(err => {
    console.error('\n[ERROR] APT repo generator failed:', err.message);
    process.exit(1);
});

