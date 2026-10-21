import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Electron patches `node:fs` so `.asar` paths are treated as archives. Reading
// raw archive bytes requires original-fs; plain Node does not have it.
const require = createRequire(import.meta.url);
let rawFs = fs;
try {
  rawFs = require('original-fs');
} catch {}

/**
 * Read a single file out of an Electron ASAR archive without Electron.
 * ASAR layout: 16-byte pickle prefix, JSON header, then file bytes.
 */
export function readAsarFile(asarPath, entryPath, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const fd = rawFs.openSync(asarPath, 'r');
  try {
    const head = Buffer.alloc(16);
    if (rawFs.readSync(fd, head, 0, 16, 0) !== 16) throw new Error('ASAR header is truncated');
    if (head.readUInt32LE(0) !== 4) throw new Error('Unsupported ASAR pickle version');
    const headerSize = head.readUInt32LE(4);
    const jsonSize = head.readUInt32LE(12);
    if (jsonSize < 2 || jsonSize > 64 * 1024 * 1024) throw new Error('ASAR JSON header is too large');
    const headerBuffer = Buffer.alloc(jsonSize);
    if (rawFs.readSync(fd, headerBuffer, 0, jsonSize, 16) !== jsonSize) throw new Error('ASAR JSON header is truncated');
    const header = JSON.parse(headerBuffer.toString('utf8'));
    const parts = String(entryPath).replaceAll('\\', '/').split('/').filter(Boolean);
    let node = header;
    for (const part of parts) {
      node = node?.files?.[part];
      if (!node) throw new Error(`ASAR entry not found: ${entryPath}`);
    }
    if (!Number.isInteger(node.size) || node.offset == null) throw new Error(`ASAR entry is not a file: ${entryPath}`);
    if (node.size > maxBytes) throw new Error(`ASAR entry is too large: ${entryPath}`);
    const base = 8 + headerSize;
    const buffer = Buffer.alloc(node.size);
    if (node.size > 0 && rawFs.readSync(fd, buffer, 0, node.size, base + Number(node.offset)) !== node.size) {
      throw new Error(`ASAR entry is truncated: ${entryPath}`);
    }
    return buffer;
  } finally {
    rawFs.closeSync(fd);
  }
}

export function readAsarJson(asarPath, entryPath, options = {}) {
  return JSON.parse(readAsarFile(asarPath, entryPath, options).toString('utf8'));
}

export function readAsarEntryInfo(asarPath, entryPath) {
  const buffer = readAsarFile(asarPath, entryPath, { maxBytes: 1 });
  return { size: buffer.length, path: path.join(asarPath, entryPath) };
}
