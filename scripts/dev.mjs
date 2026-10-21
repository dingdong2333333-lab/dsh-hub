#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findElectronBinary } from './electron-path.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const electron = findElectronBinary({ root });
if (!electron) {
  console.error('找不到 Electron 可执行文件。请运行 `npm install`（postinstall 会尝试下载 Electron），');
  console.error('或设置 ELECTRON_BIN 指向任意未打包的 Electron 目录/electron.exe。');
  process.exit(1);
}

const inheritedNodeMode = process.env.ELECTRON_RUN_AS_NODE === '1';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const extraArgs = (process.env.DSH_HUB_ELECTRON_ARGS || '').split(/\s+/).filter(Boolean);
const args = [];
// The DSH host sets ELECTRON_RUN_AS_NODE=1 and restricts Chromium's sandbox
// IPC. For development only, compensate with --no-sandbox when launched from
// that environment. A normal terminal keeps Chromium's sandbox.
if (inheritedNodeMode && !extraArgs.includes('--no-sandbox')) {
  args.push('--no-sandbox');
  console.log('Detected ELECTRON_RUN_AS_NODE=1 (sandboxed host); adding --no-sandbox for development.');
}
args.push(root, ...extraArgs);

console.log(`Launching ${electron}`);
const child = spawn(electron, args, {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: false,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
