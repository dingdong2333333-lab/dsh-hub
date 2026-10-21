import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFixtureHome, createServices } from './helpers/fixture.js';
import { SnapshotService } from '../src/main/services/snapshot-service.js';

function fixture() {
  const home = createFixtureHome({
    plugins: [
      { name: 'test-bundle', version: '1.0.0', enabled: true },
      { name: 'test-client', version: '2.0.0', enabled: false, isBundle: false },
    ],
  });
  const services = createServices(home);
  fs.mkdirSync(path.join(home.profileDir, '.dsh-hub'), { recursive: true });
  fs.writeFileSync(path.join(home.profileDir, '.dsh-hub', 'plugin-meta.json'), JSON.stringify({
    version: 1,
    plugins: { 'test-bundle': { displayName: '测试插件', notes: '快照测试' } },
  }, null, 2));
  fs.writeFileSync(path.join(home.profileDir, '.dsh-hub', 'sets.json'), JSON.stringify({
    version: 1,
    sets: [{ id: 'set-test', name: '测试套装', pluginNames: ['test-bundle'] }],
  }, null, 2));
  const snapshots = new SnapshotService({
    profileService: services.profileService,
    settings: services.settings,
    logger: { child: () => ({ info() {}, warn() {}, error() {}, debug() {} }) },
    appVersion: '0.2.0',
  });
  return { home, services, snapshots };
}

test('snapshots capture config files, list, and restore with a pre-restore copy', async (t) => {
  const { home, snapshots } = fixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));

  const created = await snapshots.create('test', { label: '测试快照' });
  assert.match(created.id, /^\d{14}-[a-f0-9]{6}$/);
  assert.ok(created.files.some((file) => file.path === 'package.json'));
  assert.ok(created.files.some((file) => file.path === '.dsh-hub/plugin-meta.json'));
  assert.ok(fs.existsSync(path.join(created.path, 'manifest.json')));

  const list = await snapshots.list('test');
  assert.equal(list.stats.total, 1);
  assert.equal(list.snapshots[0].label, '测试快照');
  assert.equal(list.snapshots[0].files.length, created.files.length);

  const manifest = JSON.parse(fs.readFileSync(path.join(home.profileDir, 'package.json'), 'utf8'));
  manifest.dependencies['extra-plugin'] = '^9.0.0';
  fs.writeFileSync(path.join(home.profileDir, 'package.json'), JSON.stringify(manifest, null, 2));

  const restored = await snapshots.restore('test', created.id);
  assert.equal(restored.restartRequired, true);
  assert.ok(restored.restored.includes('package.json'));
  assert.ok(restored.preRestore.id);
  const after = JSON.parse(fs.readFileSync(path.join(home.profileDir, 'package.json'), 'utf8'));
  assert.equal(after.dependencies['extra-plugin'], undefined);
  assert.equal(after.dependencies['test-bundle'], '^1.0.0');
  assert.equal((await snapshots.list('test')).stats.total, 2);
});

test('snapshot IDs are validated before restore, reveal, or delete', async (t) => {
  const { home, snapshots } = fixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  await snapshots.create('test', { label: '删除测试' });
  await assert.rejects(() => snapshots.restore('test', '../not-a-snapshot'), /ID/);
  assert.throws(() => snapshots.getPath('test', '../../escape'), /ID/);
  const list = await snapshots.list('test');
  await snapshots.delete('test', list.snapshots[0].id);
  assert.equal((await snapshots.list('test')).stats.total, 0);
});

test('automatic snapshots are kept separate from manual snapshots', async (t) => {
  const { home, snapshots } = fixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const manual = await snapshots.create('test', { label: '手动', auto: false });
  const automatic = await snapshots.autoBefore('test', '插件切换前自动快照');
  const list = await snapshots.list('test');
  assert.equal(list.stats.total, 2);
  assert.equal(list.stats.automatic, 1);
  assert.equal(manual.auto, false);
  assert.equal(automatic.auto, true);
  await snapshots.delete('test', automatic.id);
  assert.equal((await snapshots.list('test')).stats.total, 1);
});
