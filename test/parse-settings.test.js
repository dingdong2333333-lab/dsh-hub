import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseCredentialRefs, parseFrontmatter, extractJsonObject, redactSecrets, decodeWorkspaceFolder } from '../src/main/utils/parse-utils.js';
import { makeTempDir } from './helpers/fixture.js';
import { SettingsStore } from '../src/main/services/settings-store.js';

test('frontmatter parser reads skill metadata', () => {
  const parsed = parseFrontmatter('---\nname: 测试技能\ndescription: "一个测试"\nallowed-tools: bash\n---\n\n# Body\n');
  assert.equal(parsed.data.name, '测试技能');
  assert.equal(parsed.data.description, '一个测试');
  assert.equal(parsed.data['allowed-tools'], 'bash');
  assert.equal(parsed.body.trim(), '# Body');
});

test('credential refs parser reads only the refs map', () => {
  const yaml = `version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-test-123\n  OTHER\_TOKEN: abc\nrecords:\n  nested:\n    secret: hidden\n`;
  assert.equal(parseCredentialRefs(yaml, 'DEEPSEEK_API_KEY'), 'sk-test-123');
  assert.deepEqual(parseCredentialRefs(yaml), { DEEPSEEK_API_KEY: 'sk-test-123', OTHER_TOKEN: 'abc' });
});

test('extractJsonObject tolerates fences and prose', () => {
  assert.deepEqual(extractJsonObject('The result is:\n```json\n{"a":1,"b":"x}y"}\n```'), { a: 1, b: 'x}y' });
  assert.throws(() => extractJsonObject('no object'), /No JSON/);
});

test('secrets are removed from log-bound text', () => {
  const output = redactSecrets('api_key=sk-abcdefgh12345678 Authorization: Bearer abc.def');
  assert.doesNotMatch(output, /abcdefgh/);
  assert.match(output, /\*\*\*/);
});

test('workspace folder decoding restores encoded characters', () => {
  assert.match(decodeWorkspaceFolder('--E-~5FEB~6377~8BBF~95EE-demo--'), /E:/);
});

test('settings are normalized and invalid values are repaired', (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new SettingsStore({ dataDir: dir });
  const updated = store.update({
    model: { baseUrl: 'ftp://bad', timeoutMs: 999_999, fallbackToCatalog: false },
    ui: { theme: 'neon' },
    safety: { backupRetention: 9999 },
    activeProfile: 'desktop',
  });
  assert.equal(updated.model.baseUrl, '');
  assert.equal(updated.model.timeoutMs, 180_000);
  assert.equal(updated.model.fallbackToCatalog, false);
  assert.equal(updated.ui.theme, 'dark');
  assert.equal(updated.ui.minimizeToTray, true);
  assert.equal(updated.ui.closeToTray, true);
  assert.equal(updated.safety.backupRetention, 200);
  assert.equal(updated.activeProfile, 'desktop');
  const trayDisabled = store.update({ ui: { minimizeToTray: false, closeToTray: false } });
  assert.equal(trayDisabled.ui.minimizeToTray, false);
  assert.equal(trayDisabled.ui.closeToTray, false);
  assert.ok(fs.existsSync(path.join(dir, 'settings.json')));
});

test('getDshHome reports a helpful error for a missing directory', (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new SettingsStore({ dataDir: dir });
  store.update({ dshHome: path.join(dir, 'does-not-exist') });
  assert.throws(() => store.getDshHome(), /没有找到 DSH 数据目录/);
});
