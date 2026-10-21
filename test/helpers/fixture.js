import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { SettingsStore } from '../../src/main/services/settings-store.js';
import { ProfileService } from '../../src/main/services/profile-service.js';
import { CatalogService } from '../../src/main/services/catalog-service.js';
import { MetadataStore } from '../../src/main/services/metadata-store.js';
import { PluginService } from '../../src/main/services/plugin-service.js';
import { SetService } from '../../src/main/services/set-service.js';
import { SessionService } from '../../src/main/services/session-service.js';
import { SkillService } from '../../src/main/services/skill-service.js';
import { ModelService } from '../../src/main/services/model-service.js';

export function makeTempDir(prefix = 'dsh-hub-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function silentLogger() {
  const scope = {
    debug() {}, info() {}, warn() {}, error() {}, operation: async (_scope, _message, _meta, fn) => fn(),
  };
  return {
    ...scope,
    child: () => scope,
    logsDir: '',
    crashesDir: '',
  };
}

export function createFixtureHome({ plugins = [], bundles = null } = {}) {
  const root = makeTempDir();
  const home = path.join(root, 'home');
  const profileName = 'test';
  const profileDir = path.join(home, 'profiles', profileName);
  fs.mkdirSync(profileDir, { recursive: true });
  const dependencies = {};
  const defaultBundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];
  for (const plugin of plugins) {
    dependencies[plugin.name] = plugin.spec || '^1.0.0';
    const pkgDir = path.join(profileDir, 'node_modules', ...plugin.name.split('/'));
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: plugin.name,
      version: plugin.version || '1.0.0',
      description: plugin.description || 'A test plugin.',
      license: plugin.license || 'MIT',
      author: 'Tester',
      keywords: plugin.keywords || ['dsh'],
      repository: plugin.repository || { url: 'https://github.com/example/test' },
      dsh: plugin.isBundle === false ? { client: true } : { bundle: true, client: true },
    }, null, 2));
    if (plugin.readme) fs.writeFileSync(path.join(pkgDir, 'README.md'), plugin.readme);
  }
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    name: 'fixture-profile',
    private: true,
    dependencies,
    dsh: {
      profile: {
        bundles: bundles || [...defaultBundles, ...plugins.filter((plugin) => plugin.enabled !== false && plugin.isBundle !== false).map((plugin) => plugin.name)],
      },
    },
  }, null, 2));
  return { root, home, profileName, profileDir, dataDir: path.join(root, 'data') };
}

export function createServices(fixture) {
  const logger = silentLogger();
  fs.mkdirSync(fixture.dataDir, { recursive: true });
  const settings = new SettingsStore({ dataDir: fixture.dataDir, logger });
  settings.update({ dshHome: fixture.home, activeProfile: fixture.profileName, dshInstallDir: path.join(fixture.root, 'install') });
  const profileService = new ProfileService({ settings, logger });
  const catalogService = new CatalogService({ profileService, logger });
  const metadataStore = new MetadataStore({ profileService, settings, logger });
  const pluginService = new PluginService({ profileService, catalogService, metadataStore, logger });
  const setService = new SetService({ profileService, pluginService, metadataStore, logger });
  const sessionService = new SessionService({ settings, profileService, logger });
  const skillService = new SkillService({ profileService, logger, dataDir: fixture.dataDir });
  const modelService = new ModelService({ settings, profileService, pluginService, logger });
  return {
    settings,
    profileService,
    catalogService,
    metadataStore,
    pluginService,
    setService,
    sessionService,
    skillService,
    modelService,
  };
}

/** Write a DSH session as one zstd frame per JSON event. */
export function writeSessionFrame(home, { workspace = '--test-workspace--', id = 'session-test-0001', events }) {
  const dir = path.join(home, 'sessions', workspace, id);
  fs.mkdirSync(dir, { recursive: true });
  const frames = events.map((event) => zlib.zstdCompressSync(Buffer.from(`${JSON.stringify(event)}\n`)));
  fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), Buffer.concat(frames));
  return { dir, file: path.join(dir, 'session.v4.jsonl.zstd') };
}

export function addCatalogCache(profileDir, entries) {
  const dir = path.join(profileDir, 'cache');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'catalog-plugins-zh.json'), JSON.stringify({ at: Date.now(), body: JSON.stringify(entries) }));
}

export function makeUserSkill(home, slug, { name = slug, description = '测试技能' } = {}) {
  const dir = path.join(home, 'skills', slug);
  fs.mkdirSync(dir, { recursive: true });
  const content = `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n用于测试。\n`;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content);
  return { dir, file: path.join(dir, 'SKILL.md'), content };
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
