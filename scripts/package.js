#!/usr/bin/env node
// Builds a release zip ready for Chrome Web Store upload.
// Output: releases/cursus-v<version>.zip
//
// Run via: npm run package

import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { resolve, join, dirname } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
const outDir = join(ROOT, 'releases');
const outFile = join(outDir, `cursus-v${version}.zip`);
const staging = join(ROOT, '.release-staging');

// Files to include, relative to project root.
// Directory structure is preserved in the zip.
const INCLUDE = [
  'manifest.json',
  'background.js',
  'registration.html',
  'registration.js',
  'config.json',
  'dist/content.js',
  'src/styles.css',
  'popup/popup.html',
  'popup/popup.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

console.log(`\nPackaging Cursus v${version}...`);

// Clean staging dir.
rmSync(staging, { recursive: true, force: true });

// Copy each file into staging, preserving relative paths.
for (const rel of INCLUDE) {
  const src  = join(ROOT, rel);
  const dest = join(staging, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`  + ${rel}`);
}

// Zip the staging directory contents.
mkdirSync(outDir, { recursive: true });
rmSync(outFile, { force: true });
execSync(`cd "${staging}" && zip -r "${outFile}" .`, { stdio: 'inherit' });

// Clean up staging.
rmSync(staging, { recursive: true, force: true });

const bytes = readFileSync(outFile).length;
const kb = (bytes / 1024).toFixed(1);
console.log(`\n✓  releases/cursus-v${version}.zip  (${kb} KB)`);
console.log(`   Upload this file at: https://chrome.google.com/webstore/devconsole\n`);
