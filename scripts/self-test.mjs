#!/usr/bin/env node
/** Run the Electron app's headless self-test. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findElectronBinary } from './electron-path.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const electron = findElectronBinary({ root, includeRelease: true });

if (!electron) {
  console.error('找不到 Electron 可执行文件。请运行 `npm install`，或设置 ELECTRON_BIN 指向任意未打包的 Electron 目录/electron.exe。');
  process.exit(1);
}

const inheritedNodeMode = process.env.ELECTRON_RUN_AS_NODE === '1';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const isPackaged = path.basename(electron).toLowerCase().startsWith('dsh-hub');
const args = isPackaged ? ['--self-test'] : [root, '--self-test'];
if (!isPackaged && inheritedNodeMode) {
  args.unshift('--no-sandbox');
  console.log('Detected ELECTRON_RUN_AS_NODE=1 (sandboxed host); using --no-sandbox for the development self-test.');
}
const result = spawnSync(electron, args, { cwd: root, env, stdio: 'inherit' });
process.exit(result.status ?? 1);
