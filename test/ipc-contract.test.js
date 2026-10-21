import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { IPC } from '../src/shared/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('preload IPC channel strings stay in sync with the shared contract', () => {
  const preload = fs.readFileSync(path.join(root, 'src', 'main', 'preload.cjs'), 'utf8');
  const block = /const IPC = \{([\s\S]*?)\};/.exec(preload)?.[1] || '';
  const channels = {};
  for (const match of block.matchAll(/([A-Z_]+):\s*'([^']+)'/g)) {
    channels[match[1]] = match[2];
  }
  const shared = Object.fromEntries(Object.entries(IPC).filter(([, value]) => typeof value === 'string'));
  assert.deepEqual(channels, shared);
  assert.equal(new Set(Object.values(channels)).size, Object.values(channels).length);
});
