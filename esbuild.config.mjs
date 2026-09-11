import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Copy styles.css to dist
function copyStyles() {
  const src = path.join('src', 'webview', 'styles.css');
  const dest = path.join('dist', 'styles.css');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('✓ Copied styles.css to dist/');
  }
}

copyStyles();

// Build Extension Host (Node.js CommonJS)
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !isProduction,
  minify: isProduction,
};

// Build Webview Client (Browser IIFE)
const webviewConfig = {
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: !isProduction,
  minify: isProduction,
};

async function main() {
  if (isWatch) {
    const extCtx = await esbuild.context(extensionConfig);
    const webviewCtx = await esbuild.context(webviewConfig);

    await extCtx.watch();
    await webviewCtx.watch();
    
    fs.watch(path.join('src', 'webview'), (eventType, filename) => {
      if (filename === 'styles.css') {
        copyStyles();
      }
    });

    console.log('Watching for file changes...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig)
    ]);
    console.log('✓ Extension & Webview built successfully!');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

