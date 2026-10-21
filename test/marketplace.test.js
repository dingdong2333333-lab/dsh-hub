import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  addCatalogCache,
  createFixtureHome,
  createServices,
  silentLogger,
} from './helpers/fixture.js';
import {
  compareVersions,
  installSpecFor,
  MarketplaceService,
  validateSpec,
} from '../src/main/services/marketplace-service.js';
import { SnapshotService } from '../src/main/services/snapshot-service.js';

function marketFixture() {
  const home = createFixtureHome({
    plugins: [
      { name: 'dsh-test', version: '1.0.0', enabled: true },
      { name: 'dsh-client', version: '0.5.0', enabled: false, isBundle: false },
    ],
  });
  addCatalogCache(home.profileDir, [
    {
      s: 'dsh-test',
      n: 'dsh-test',
      o: 'tester',
      vr: 'v1.2.0',
      c: 'tools',
      d: '测试插件，用于目录列表。',
      t: ['测试', '工具'],
      f: ['测试能力'],
      sg: 42,
      fk: 3,
      v: 'verified',
      u: '2026-10-01T00:00:00.000Z',
      a: '2026-09-01T00:00:00.000Z',
      r: { repo: 'tester/dsh-test', npmPackage: 'dsh-test' },
      ic: 'dsh plugin --profile web add dsh-test',
    },
    {
      s: 'dsh-new',
      n: 'dsh-new',
      o: 'tester',
      vr: 'v0.1.0',
      c: 'interface',
      d: '尚未安装的插件。',
      v: 'unconfirmed',
      r: { repo: 'tester/dsh-new', npmPackage: 'dsh-new' },
      ic: 'dsh plugin --profile web add dsh-new',
    },
  ]);
  const services = createServices(home);
  const snapshots = new SnapshotService({
    profileService: services.profileService,
    settings: services.settings,
    logger: { child: () => ({ info() {}, warn() {}, error() {}, debug() {} }) },
    appVersion: '0.2.0',
  });
  const market = new MarketplaceService({
    ...services,
    logger: silentLogger(),
    snapshotService: snapshots,
    dataDir: home.dataDir,
  });
  return { home, services, market };
}

test('marketplace list merges catalog entries with installed inventory and updates', async (t) => {
  const { home, market } = marketFixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const all = await market.list('test', { pageSize: 50 });
  assert.equal(all.catalogCount, 2);
  assert.equal(all.installedCount, 1);
  assert.equal(all.updatableCount, 1);
  assert.equal(all.categories.find((item) => item.id === 'tools').count, 1);
  const installed = all.items.find((item) => item.id === 'dsh-test');
  assert.equal(installed.installed, true);
  assert.equal(installed.enabled, true);
  assert.equal(installed.installedVersion, '1.0.0');
  assert.equal(installed.updatable, true);
  const fresh = all.items.find((item) => item.id === 'dsh-new');
  assert.equal(fresh.installed, false);
  const filtered = await market.list('test', { state: 'updatable' });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.items[0].id, 'dsh-test');
});

test('marketplace detail exposes install command and repository', async (t) => {
  const { home, market } = marketFixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const detail = await market.detail('test', 'dsh-test');
  assert.equal(detail.entry.name, 'dsh-test');
  assert.equal(detail.entry.repository, 'tester/dsh-test');
  assert.equal(detail.entry.installSpec, 'dsh-test');
  assert.equal(detail.installed.version, '1.0.0');
  assert.equal(detail.updateAvailable, true);
});

test('install specs and version comparisons are deterministic', () => {
  assert.equal(installSpecFor({ installCommand: 'dsh plugin --profile web add @scope/pkg' }), '@scope/pkg');
  assert.equal(installSpecFor({ npmPackage: 'dsh-x' }), 'dsh-x');
  assert.equal(installSpecFor({ repository: 'owner/repo' }), 'github:owner/repo');
  assert.equal(compareVersions('1.2.0', '1.0.0') > 0, true);
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0);
  assert.equal(validateSpec('github:owner/repo'), 'github:owner/repo');
  assert.throws(() => validateSpec('-Danger'), /短横线/);
  assert.throws(() => validateSpec('bad\nspec'), /非法/);
});
