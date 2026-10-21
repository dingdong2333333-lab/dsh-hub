import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  addCatalogCache,
  createFixtureHome,
  createServices,
  makeTempDir,
} from './helpers/fixture.js';

function fixture() {
  return createFixtureHome({
    plugins: [
      { name: 'alpha-plugin', version: '1.2.0', description: 'Alpha plugin', enabled: true },
      { name: 'beta-plugin', version: '0.4.1', description: 'Beta plugin', enabled: false },
      { name: 'theme-only', version: '2.0.0', description: 'A non-bundle dependency', enabled: false, isBundle: false },
    ],
  });
}

test('plugin inventory reports bundles, versions and toggleability', async (t) => {
  const home = fixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const services = createServices(home);
  const data = await services.pluginService.list('test');
  assert.equal(data.profile.total, 3);
  assert.equal(data.profile.enabled, 1);
  assert.equal(data.profile.disabled, 2);
  const alpha = data.plugins.find((plugin) => plugin.name === 'alpha-plugin');
  const beta = data.plugins.find((plugin) => plugin.name === 'beta-plugin');
  const theme = data.plugins.find((plugin) => plugin.name === 'theme-only');
  assert.equal(alpha.canToggle, true);
  assert.equal(alpha.enabled, true);
  assert.equal(beta.enabled, false);
  assert.equal(theme.canToggle, false);
  assert.match(theme.reasonNotToggleable, /dsh\.bundle/);
});

test('enabling and disabling writes bundles and creates a backup', async (t) => {
  const home = fixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const services = createServices(home);
  const result = await services.pluginService.setEnabled('test', 'beta-plugin', true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.applied, ['beta-plugin']);
  const manifest = JSON.parse(fs.readFileSync(path.join(home.profileDir, 'package.json'), 'utf8'));
  assert.ok(manifest.dsh.profile.bundles.includes('beta-plugin'));
  const backupDir = path.join(home.profileDir, '.dsh-hub', 'backups');
  assert.ok(fs.readdirSync(backupDir).some((file) => file.startsWith('package-')));
  const disabled = await services.pluginService.setEnabled('test', 'beta-plugin', false);
  assert.equal(disabled.changed, true);
  const after = JSON.parse(fs.readFileSync(path.join(home.profileDir, 'package.json'), 'utf8'));
  assert.ok(!after.dsh.profile.bundles.includes('beta-plugin'));
});

test('non-bundle dependencies are skipped instead of corrupting the manifest', async (t) => {
  const home = fixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const services = createServices(home);
  const result = await services.pluginService.setMany('test', ['theme-only', 'alpha-plugin'], false);
  assert.deepEqual(result.applied, ['alpha-plugin']);
  assert.equal(result.skipped[0].name, 'theme-only');
  const manifest = JSON.parse(fs.readFileSync(path.join(home.profileDir, 'package.json'), 'utf8'));
  assert.ok(!manifest.dsh.profile.bundles.includes('alpha-plugin'));
});

test('core bundles cannot be removed by the mutation layer', async (t) => {
  const home = fixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const services = createServices(home);
  const result = await services.profileService.mutateBundles('test', 'test-remove-core', (bundles) => bundles.filter((name) => !name.startsWith('@deepseek-ai/')));
  assert.equal(result.changed, true);
  assert.ok(result.bundles.includes('@deepseek-ai/dsh-base'));
  assert.ok(result.bundles.includes('@deepseek-ai/dsh-web-app'));
});

test('custom Chinese metadata appears in the inventory', async (t) => {
  const home = fixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const services = createServices(home);
  await services.pluginService.updateMeta('test', 'alpha-plugin', {
    displayName: '阿尔法插件',
    notes: '一个用于测试的插件。',
    tags: ['测试'],
    favorite: true,
  });
  const data = await services.pluginService.list('test');
  const alpha = data.plugins.find((plugin) => plugin.name === 'alpha-plugin');
  assert.equal(alpha.displayName, '阿尔法插件');
  assert.equal(alpha.favorite, true);
  assert.equal(data.profile.withChinese, 1);
  assert.ok(fs.existsSync(path.join(home.profileDir, '.dsh-hub', 'plugin-meta.json')));
});

test('sets can be created, applied in both directions, and deleted', async (t) => {
  const home = fixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const services = createServices(home);
  const set = await services.setService.create('test', {
    name: '测试套装',
    description: '只包含测试插件',
    color: '#5b8cff',
    pluginNames: ['alpha-plugin', 'beta-plugin'],
  });
  assert.equal(set.totalCount, 2);

  const off = await services.setService.apply('test', set.id, 'disable');
  assert.deepEqual(off.applied.sort(), ['alpha-plugin']);
  const disabledData = await services.setService.list('test');
  assert.equal(disabledData.sets[0].state, 'none');

  const on = await services.setService.apply('test', set.id, 'enable');
  assert.deepEqual(on.applied.sort(), ['alpha-plugin', 'beta-plugin']);
  const enabledData = await services.setService.list('test');
  assert.equal(enabledData.sets[0].state, 'all');
  assert.ok(enabledData.sets[0].lastAppliedAt);

  await services.setService.delete('test', set.id);
  const empty = await services.setService.list('test');
  assert.equal(empty.sets.length, 0);
});

test('sets reject empty or duplicate names', async (t) => {
  const home = fixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const services = createServices(home);
  await assert.rejects(
    services.setService.create('test', { name: '空套装', pluginNames: [] }),
    /至少选择一个/,
  );
  await services.setService.create('test', { name: '重复', pluginNames: ['alpha-plugin'] });
  await assert.rejects(
    services.setService.create('test', { name: '重复', pluginNames: ['beta-plugin'] }),
    /同名/,
  );
});

test('catalog metadata is merged into plugin cards when available', async (t) => {
  const home = fixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  addCatalogCache(home.profileDir, [{
    s: 'alpha-plugin',
    n: 'alpha-plugin',
    vr: 'v1.2.0',
    c: 'tools',
    f: ['功能一', '功能二'],
    d: '这是社区缓存里的中文描述。',
    r: { repo: 'example/test', npmPackage: 'alpha-plugin' },
    sg: 120,
    v: 'verified',
  }]);
  const services = createServices(home);
  const data = await services.pluginService.list('test');
  const alpha = data.plugins.find((plugin) => plugin.name === 'alpha-plugin');
  assert.equal(alpha.catalog.description, '这是社区缓存里的中文描述。');
  assert.deepEqual(alpha.catalog.features, ['功能一', '功能二']);
  assert.equal(alpha.catalog.verified, true);
});
