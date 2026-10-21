#!/usr/bin/env node
/** Non-destructive environment check for developers and support. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findElectronBinary } from './electron-path.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const record = (name, ok, detail) => checks.push({ name, ok, detail });

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
record('Node.js >= 22.15', Number(process.versions.node.split('.')[0]) >= 22, process.versions.node);
record('package.json', Boolean(pkg.name && pkg.version), `${pkg.name}@${pkg.version}`);

const electron = findElectronBinary({ root });
record('Electron runtime', Boolean(electron), electron || 'not found (set ELECTRON_BIN to an unpacked Electron dir)');

const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
record('DSH Home exists', fs.existsSync(home), home);
const profilesDir = path.join(home, 'profiles');
const profiles = fs.existsSync(profilesDir)
  ? fs.readdirSync(profilesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  : [];
record('DSH profiles', profiles.length > 0, profiles.join(', ') || 'none');

const creds = path.join(home, '.credentials.yaml');
let keyPresent = false;
if (fs.existsSync(creds)) {
  try {
    keyPresent = /DEEPSEEK_API_KEY:\s*\S+/.test(fs.readFileSync(creds, 'utf8')) || Boolean(process.env.DEEPSEEK_API_KEY);
  } catch {}
}
record('DEEPSEEK_API_KEY', keyPresent, keyPresent ? 'present (masked)' : 'not found');

const dataRoot = path.join(root, '.data');
try {
  fs.mkdirSync(dataRoot, { recursive: true });
  record('Working data directory writable', true, dataRoot);
} catch (error) {
  record('Working data directory writable', false, error.message);
}

for (const check of checks) {
  console.log(`${check.ok ? '✔' : '✖'} ${check.name}: ${check.detail}`);
}
const failed = checks.filter((check) => !check.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
process.exit(failed ? 1 : 0);
