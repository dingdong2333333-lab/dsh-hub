#!/usr/bin/env node
/**
 * Make `npm install` leave a usable Electron binary behind.
 *
 * Electron's own postinstall downloads a ~100 MB runtime. Some environments
 * run npm with --ignore-scripts or block the download. This script is
 * intentionally best-effort: if the binary cannot be fetched it prints the
 * ELECTRON_BIN escape hatch instead of failing the whole install.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronDir = path.join(root, 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');
const exe = path.join(distDir, process.platform === 'win32' ? 'electron.exe' : 'electron');

function resolveEnvBinary(value) {
  if (!value) return '';
  try {
    const resolved = path.resolve(value);
    if (fs.statSync(resolved).isFile()) return resolved;
    if (fs.statSync(resolved).isDirectory()) {
      for (const name of ['electron.exe', 'electron']) {
        const file = path.join(resolved, name);
        if (fs.existsSync(file)) return file;
      }
    }
  } catch {}
  return '';
}

function markInstalled() {
  if (!fs.existsSync(path.join(electronDir, 'path.txt')) && fs.existsSync(exe)) {
    fs.writeFileSync(path.join(electronDir, 'path.txt'), process.platform === 'win32' ? 'electron.exe' : 'electron');
  }
  console.log(`Electron ready: ${exe}`);
}

if (fs.existsSync(exe)) {
  markInstalled();
  process.exit(0);
}

if (process.env.ELECTRON_BIN) {
  const resolved = resolveEnvBinary(process.env.ELECTRON_BIN);
  if (resolved) {
    console.log(`Electron dist is missing, but ELECTRON_BIN resolves to: ${resolved}`);
    console.log('Development scripts will use ELECTRON_BIN; no download was attempted.');
    process.exit(0);
  }
  console.warn(`ELECTRON_BIN is set but does not resolve to an Electron executable/directory: ${process.env.ELECTRON_BIN}`);
}

const installer = path.join(electronDir, 'install.js');
if (!fs.existsSync(installer)) {
  console.warn('Electron is not installed in node_modules. Run `npm install` (without --ignore-scripts).');
  process.exit(0);
}

console.log('Electron binary is missing; invoking node_modules/electron/install.js ...');
const baseEnv = { ...process.env };
delete baseEnv.ELECTRON_RUN_AS_NODE;
if (!baseEnv.ELECTRON_CACHE) baseEnv.ELECTRON_CACHE = path.join(root, '.electron-cache');

function runInstaller(extraEnv = {}) {
  return spawnSync(process.execPath, [installer], {
    env: { ...baseEnv, ...extraEnv },
    stdio: 'inherit',
    windowsHide: true,
  });
}

let result = runInstaller();

if (!fs.existsSync(exe) && !baseEnv.ELECTRON_MIRROR) {
  console.log('');
  console.log('Official Electron download failed; retrying via the npmmirror mirror ...');
  console.log('(Set ELECTRON_MIRROR yourself to choose a different mirror.)');
  result = runInstaller({ ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' });
}

if (fs.existsSync(exe)) {
  markInstalled();
  process.exit(0);
}

console.warn('');
console.warn('Electron binary was not downloaded (exit ' + (result.status ?? 'unknown') + ').');
console.warn('Options:');
console.warn('  1. Retry with a mirror, for example:');
console.warn('     PowerShell: $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; npm install');
console.warn('  2. Point at an unpacked Electron distribution:');
console.warn('     PowerShell: $env:ELECTRON_BIN="D:\\path\\to\\electron.exe"; npm start');
console.warn('  3. Packaging: set ELECTRON_DIST to the unpacked Electron directory.');
console.warn('npm install itself is not failed so the source tree remains usable.');
process.exit(0);
