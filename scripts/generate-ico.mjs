import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

const SIZES = [256, 128, 64, 48, 32, 16];

// Premium literary emblem: deep warm obsidian background, gold foil quill and open novel
const NOVELLIZED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2c2520" />
      <stop offset="50%" stop-color="#1b1715" />
      <stop offset="100%" stop-color="#120f0e" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffea9f" />
      <stop offset="35%" stop-color="#d4af37" />
      <stop offset="70%" stop-color="#aa820a" />
      <stop offset="100%" stop-color="#6e5000" />
    </linearGradient>
    <linearGradient id="pageGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fdfbf7" />
      <stop offset="100%" stop-color="#e2dad0" />
    </linearGradient>
    <filter id="dropShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Squircle Base -->
  <rect x="24" y="24" width="464" height="464" rx="108" fill="url(#bgGrad)" stroke="#3f352e" stroke-width="6"/>

  <!-- Inner Gold Accent Ring -->
  <rect x="36" y="36" width="440" height="440" rx="96" fill="none" stroke="url(#goldGrad)" stroke-width="2.5" opacity="0.4"/>

  <!-- Open Book Pages (Left & Right) -->
  <g filter="url(#dropShadow)">
    <!-- Left Page -->
    <path d="M256 360 C210 335 150 338 100 354 L100 160 C150 144 210 141 256 166 Z" 
          fill="url(#pageGrad)" stroke="#8c7d6b" stroke-width="3"/>
    <!-- Right Page -->
    <path d="M256 360 C302 335 362 338 412 354 L412 160 C362 144 302 141 256 166 Z" 
          fill="url(#pageGrad)" stroke="#8c7d6b" stroke-width="3"/>
    
    <!-- Spine Center -->
    <line x1="256" y1="166" x2="256" y2="360" stroke="#736353" stroke-width="4"/>

    <!-- Subtle Page Lines Left -->
    <line x1="126" y1="196" x2="230" y2="196" stroke="#b0a394" stroke-width="4" stroke-linecap="round"/>
    <line x1="126" y1="230" x2="230" y2="230" stroke="#b0a394" stroke-width="4" stroke-linecap="round"/>
    <line x1="126" y1="264" x2="230" y2="264" stroke="#b0a394" stroke-width="4" stroke-linecap="round"/>
    <line x1="126" y1="298" x2="190" y2="298" stroke="#b0a394" stroke-width="4" stroke-linecap="round"/>

    <!-- Subtle Page Lines Right -->
    <line x1="282" y1="196" x2="386" y2="196" stroke="#b0a394" stroke-width="4" stroke-linecap="round"/>
    <line x1="282" y1="230" x2="386" y2="230" stroke="#b0a394" stroke-width="4" stroke-linecap="round"/>
    <line x1="282" y1="264" x2="386" y2="264" stroke="#b0a394" stroke-width="4" stroke-linecap="round"/>
    <line x1="282" y1="298" x2="340" y2="298" stroke="#b0a394" stroke-width="4" stroke-linecap="round"/>
  </g>

  <!-- Golden Feather Quill Diagonal -->
  <g filter="url(#dropShadow)">
    <path d="M370 95 C330 130 300 185 285 245 C278 275 275 310 270 340 L260 350 L255 330 C265 295 272 260 282 225 C295 180 320 135 355 102 C362 95 367 92 370 95 Z" 
          fill="url(#goldGrad)" stroke="#523900" stroke-width="2"/>
    <path d="M370 95 C335 110 320 145 310 185 C305 205 300 230 290 255 C298 238 312 215 328 190 C345 160 365 130 375 105 Z" 
          fill="#fff3c4" opacity="0.8"/>
    <!-- Quill Nib Tip -->
    <polygon points="260,350 252,365 255,346" fill="#ffe27c"/>
  </g>
</svg>`;

export function buildIcoBuffer(pngBuffersWithSizes) {
    const numImages = pngBuffersWithSizes.length;
    const headerSize = 6;
    const dirEntrySize = 16;
    const dirTotalSize = headerSize + numImages * dirEntrySize;

    let totalFileSize = dirTotalSize;
    for (const item of pngBuffersWithSizes) {
        totalFileSize += item.buffer.length;
    }

    const ico = Buffer.alloc(totalFileSize);

    // 1. ICONDIR Header
    ico.writeUInt16LE(0, 0); // reserved
    ico.writeUInt16LE(1, 2); // 1 = ICO
    ico.writeUInt16LE(numImages, 4); // image count

    // 2. ICONDIRENTRY Entries and Image Data
    let currentOffset = dirTotalSize;

    for (let i = 0; i < numImages; i++) {
        const { size, buffer } = pngBuffersWithSizes[i];
        const entryOffset = headerSize + i * dirEntrySize;

        ico.writeUInt8(size >= 256 ? 0 : size, entryOffset);     // Width
        ico.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1); // Height
        ico.writeUInt8(0, entryOffset + 2);                      // Color palette count
        ico.writeUInt8(0, entryOffset + 3);                      // Reserved
        ico.writeUInt16LE(1, entryOffset + 4);                   // Color planes
        ico.writeUInt16LE(32, entryOffset + 6);                  // Bits per pixel
        ico.writeUInt32LE(buffer.length, entryOffset + 8);       // Image size in bytes
        ico.writeUInt32LE(currentOffset, entryOffset + 12);      // Image data offset

        // Copy image bytes
        buffer.copy(ico, currentOffset);
        currentOffset += buffer.length;
    }

    return ico;
}

export function generateAllIcons(resourcesDir = path.resolve('resources')) {
    if (!fs.existsSync(resourcesDir)) {
        fs.mkdirSync(resourcesDir, { recursive: true });
    }

    console.log('Generating high-resolution icon buffers for Novellized Studio...');
    const renderedList = [];

    for (const size of SIZES) {
        const resvg = new Resvg(NOVELLIZED_SVG, {
            fitTo: { mode: 'width', value: size }
        });
        const pngData = resvg.render();
        const buffer = pngData.asPng();
        renderedList.push({ size, buffer });
        console.log(`[OK] Rendered ${size}x${size} icon frame (${(buffer.length / 1024).toFixed(1)} KB)`);
    }

    // 1. Write resources/icon.ico
    const icoPath = path.join(resourcesDir, 'icon.ico');
    const icoBuffer = buildIcoBuffer(renderedList);
    fs.writeFileSync(icoPath, icoBuffer);
    console.log(`[OK] Created Windows icon file: ${icoPath} (${(icoBuffer.length / 1024).toFixed(1)} KB, ${SIZES.length} sizes)`);

    // 2. Write resources/icon.png (256x256)
    const png256 = renderedList.find(i => i.size === 256).buffer;
    const pngPath = path.join(resourcesDir, 'icon.png');
    fs.writeFileSync(pngPath, png256);
    console.log(`[OK] Created PNG preview: ${pngPath}`);

    // 3. Write desktop app master SVG to resources/app-icon.svg
    const appSvgPath = path.join(resourcesDir, 'app-icon.svg');
    fs.writeFileSync(appSvgPath, NOVELLIZED_SVG, 'utf8');
    console.log(`[OK] Created Desktop App SVG master: ${appSvgPath}`);

    return { icoPath, pngPath, appSvgPath };
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('generate-ico.mjs')) {
    generateAllIcons();
}
