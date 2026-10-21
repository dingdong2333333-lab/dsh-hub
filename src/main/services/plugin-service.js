import fs from 'node:fs';
import path from 'node:path';

import { PROTECTED_BUNDLES } from '../../shared/constants.js';
import { AppError } from '../utils/errors.js';
import { pathExists } from '../utils/fs-utils.js';
import { safeHttpUrl } from '../utils/parse-utils.js';

/**
 * Plugin inventory and package-level enable/disable. A plugin here means one
 * direct dependency of the selected DSH profile. DSH calls these "bundles";
 * only packages that declare `dsh.bundle` can be toggled safely.
 */
export class PluginService {
  constructor({ profileService, catalogService, metadataStore, logger }) {
    this.profileService = profileService;
    this.catalogService = catalogService;
    this.metadataStore = metadataStore;
    this.logger = logger.child('plugins');
  }

  async list(profileName) {
    const profile = this.profileService.getProfile(profileName);
    const meta = this.metadataStore.readMeta(profile.name);
    const bundleSet = new Set(profile.bundles);
    const plugins = [];

    for (const [name, spec] of Object.entries(profile.dependencies)) {
      const resolved = this.profileService.resolvePackage(profile, name);
      const manifest = resolved.manifest || {};
      const repository = repositoryUrl(manifest);
      const catalog = this.catalogService.find(profile, { packageName: name, repository });
      const custom = meta.plugins[name] || null;
      const isBundle = Boolean(manifest.dsh?.bundle);
      const enabled = bundleSet.has(name);
      const protectedCore = PROTECTED_BUNDLES.includes(name);
      const missing = resolved.missing;
      const canToggle = !missing && isBundle && !protectedCore;
      const displayName = custom?.displayName || '';
      const notes = custom?.notes || '';
      plugins.push({
        name,
        displayName,
        title: displayName || name,
        version: manifest.version || '',
        description: manifest.description || '',
        notes,
        suggestedNotes: notes || catalog?.description || manifest.description || '',
        tags: custom?.tags || [],
        favorite: Boolean(custom?.favorite),
        ai: custom?.ai || null,
        enabled,
        inBundles: enabled,
        isBundle,
        canToggle,
        protected: protectedCore,
        missing,
        reasonNotToggleable: protectedCore
          ? '系统核心 bundle，不能关闭'
          : missing
            ? '依赖未安装，可能安装不完整'
            : !isBundle
              ? '该依赖没有声明 dsh.bundle，可能由其他插件加载'
              : '',
        dependencySpec: spec,
        dependencyType: dependencyType(spec),
        versionRange: spec,
        license: manifest.license || '',
        author: normalizeAuthor(manifest.author),
        homepage: safeHttpUrl(manifest.homepage || ''),
        repository: repository,
        keywords: Array.isArray(manifest.keywords) ? manifest.keywords.slice(0, 12) : [],
        category: custom?.ai?.category || mapCatalogCategory(catalog?.category) || (manifest.dsh?.client ? '界面' : '工具'),
        catalog: catalog ? {
          description: catalog.description,
          features: catalog.features,
          stars: catalog.stars,
          verified: catalog.verified,
          repository: catalog.repository,
        } : null,
        hasReadme: pathExists(path.join(resolved.dir, 'README.md')) || pathExists(path.join(resolved.dir, 'README.zh.md')),
        packageDir: resolved.dir,
        manifestFile: resolved.manifestFile,
        mtime: safeMtime(resolved.manifestFile),
        scope: manifest.dsh?.client ? 'client' : 'host',
      });
    }

    plugins.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return (a.displayName || a.name).localeCompare(b.displayName || b.name, 'zh-CN');
    });

    return {
      profile: {
        name: profile.name,
        dir: profile.dir,
        total: plugins.length,
        enabled: plugins.filter((plugin) => plugin.enabled).length,
        disabled: plugins.filter((plugin) => !plugin.enabled).length,
        toggleable: plugins.filter((plugin) => plugin.canToggle).length,
        favorites: plugins.filter((plugin) => plugin.favorite).length,
        missing: plugins.filter((plugin) => plugin.missing).length,
        withChinese: plugins.filter((plugin) => plugin.displayName).length,
        dshHome: this.profileService.getDshHome(),
      },
      plugins,
    };
  }

  async detail(profileName, pluginName) {
    const data = await this.list(profileName);
    const plugin = data.plugins.find((item) => item.name === pluginName);
    if (!plugin) {
      throw new AppError('PLUGIN_NOT_FOUND', `没有找到插件：${pluginName}`);
    }
    const profile = this.profileService.getProfile(profileName);
    const resolved = this.profileService.resolvePackage(profile, pluginName);
    const manifest = resolved.manifest || {};
    return {
      ...plugin,
      readme: this.profileService.readPackageReadme(profile, pluginName, 8_000),
      manifest: {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        main: manifest.main,
        license: manifest.license,
        author: normalizeAuthor(manifest.author),
        repository: repositoryUrl(manifest),
        homepage: manifest.homepage || '',
        keywords: manifest.keywords || [],
        dsh: manifest.dsh || null,
      },
      cordisEntries: findCordisEntries(profile, pluginName),
      backups: path.join(profile.dir, '.dsh-hub', 'backups'),
    };
  }

  async setEnabled(profileName, pluginName, enabled) {
    const result = await this.setMany(profileName, [pluginName], enabled);
    if (result.skipped.length && !result.changed) {
      throw new AppError('PLUGIN_NOT_TOGGLEABLE', result.skipped[0].reason, { details: pluginName });
    }
    return result;
  }

  async setMany(profileName, pluginNames, enabled) {
    if (typeof enabled !== 'boolean') {
      throw new AppError('INVALID_ARGUMENT', 'enabled 必须是布尔值。');
    }
    const names = [...new Set((Array.isArray(pluginNames) ? pluginNames : []).filter((name) => typeof name === 'string' && name))];
    if (!names.length) throw new AppError('INVALID_ARGUMENT', '没有选择任何插件。');
    const inventory = await this.list(profileName);
    const byName = new Map(inventory.plugins.map((plugin) => [plugin.name, plugin]));
    const applied = [];
    const skipped = [];
    for (const name of names) {
      const plugin = byName.get(name);
      if (!plugin) {
        skipped.push({ name, reason: '当前 profile 中没有这个依赖' });
        continue;
      }
      if (plugin.missing) {
        skipped.push({ name, reason: '依赖未安装' });
        continue;
      }
      if (!plugin.isBundle) {
        skipped.push({ name, reason: '该依赖没有声明 dsh.bundle，无法单独启停' });
        continue;
      }
      if (PROTECTED_BUNDLES.includes(name)) {
        skipped.push({ name, reason: '系统核心 bundle 受保护' });
        continue;
      }
      if (plugin.enabled === enabled) {
        skipped.push({ name, reason: enabled ? '已经启用' : '已经停用' });
        continue;
      }
      applied.push(name);
    }

    if (!applied.length) {
      return {
        changed: false,
        enabled,
        applied: [],
        skipped,
        restartRequired: false,
      };
    }

    const result = await this.profileService.mutateBundles(profileName, enabled ? 'enable-plugins' : 'disable-plugins', (bundles) => {
      const set = new Set(bundles);
      for (const name of applied) {
        if (enabled) set.add(name);
        else set.delete(name);
      }
      return [...set];
    });

    this.logger.info('Plugin selection updated', {
      profile: profileName,
      action: enabled ? 'enable' : 'disable',
      plugins: applied,
      changed: result.changed,
    });

    return {
      ...result,
      enabled,
      applied,
      skipped,
      restartRequired: result.changed,
    };
  }

  async updateMeta(profileName, pluginName, patch) {
    const profile = this.profileService.getProfile(profileName);
    if (!Object.hasOwn(profile.dependencies, pluginName)) {
      throw new AppError('PLUGIN_NOT_FOUND', `当前 profile 没有这个依赖：${pluginName}`);
    }
    const result = await this.metadataStore.setPluginMeta(profile.name, pluginName, patch);
    return { pluginName, meta: result };
  }

  async applyAiMeta(profileName, pluginName, generated) {
    if (!generated || typeof generated !== 'object') {
      throw new AppError('INVALID_AI_RESULT', '模型返回的插件资料格式不正确。');
    }
    const patch = {
      displayName: generated.displayName || '',
      notes: generated.notes || '',
      tags: generated.tags || [],
      ai: generated.ai || {
        source: 'model',
        generatedAt: new Date().toISOString(),
      },
    };
    return this.updateMeta(profileName, pluginName, patch);
  }

  getRevealPath(profileName, pluginName) {
    const profile = this.profileService.getProfile(profileName);
    const resolved = this.profileService.resolvePackage(profile, pluginName);
    return resolved.missing ? profile.dir : resolved.manifestFile;
  }

  getLocalSuggestion(profileName, pluginName) {
    const profile = this.profileService.getProfile(profileName);
    const resolved = this.profileService.resolvePackage(profile, pluginName);
    const repository = repositoryUrl(resolved.manifest || {});
    const catalog = this.catalogService.find(profile, { packageName: pluginName, repository });
    if (!catalog) return null;
    const descriptor = catalog.features?.[0] || catalog.description;
    const displayName = deriveChineseName(descriptor);
    return {
      displayName,
      notes: catalog.description,
      tags: (catalog.features || []).slice(0, 4).map((feature) => feature.slice(0, 12)),
      category: mapCatalogCategory(catalog.category),
      source: 'catalog',
      ai: {
        source: 'catalog',
        model: 'local-catalog',
        generatedAt: new Date().toISOString(),
        category: mapCatalogCategory(catalog.category),
        confidence: 0.55,
      },
    };
  }
}

function safeMtime(file) {
  try { return fs.statSync(file).mtimeMs; } catch { return 0; }
}

function repositoryUrl(manifest) {
  const repo = manifest.repository;
  if (!repo) return '';
  if (typeof repo === 'string') return safeHttpUrl(repo.startsWith('github:') ? `https://github.com/${repo.slice(7)}` : repo);
  const url = repo.url || '';
  if (url.startsWith('github:')) return safeHttpUrl(`https://github.com/${url.slice(7)}`);
  return safeHttpUrl(url.replace(/^git\+/, ''));
}

function normalizeAuthor(author) {
  if (!author) return '';
  if (typeof author === 'string') return author;
  if (typeof author === 'object') return author.name || '';
  return '';
}

function dependencyType(spec) {
  if (typeof spec !== 'string') return 'unknown';
  if (spec.startsWith('github:')) return 'github';
  if (spec.startsWith('link:') || spec.startsWith('file:')) return 'local';
  if (spec.startsWith('http:') || spec.startsWith('https:')) return 'url';
  if (spec.startsWith('workspace:')) return 'workspace';
  return 'npm';
}

function mapCatalogCategory(category) {
  const map = {
    interface: '界面',
    tools: '工具',
    integration: '集成',
    model: '模型',
    productivity: '效率',
    skin: '皮肤',
    developer: '开发',
  };
  return map[category] || '';
}

function findCordisEntries(profile, packageName) {
  const entries = [];
  for (const file of ['cordis.yml', 'cordis.patch.yml']) {
    const full = path.join(profile.dir, file);
    if (!pathExists(full)) continue;
    let text = '';
    try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
    const lines = text.split(/\r?\n/);
    let current = null;
    let indent = 0;
    for (const line of lines) {
      const idMatch = /^(\s*)-\s+id:\s*['"]?([^'"#]+?)['"]?\s*$/.exec(line);
      if (idMatch) {
        current = { id: idMatch[2].trim(), file, disabled: null };
        indent = idMatch[1].length;
        entries.push(current);
        continue;
      }
      if (!current) continue;
      const nameMatch = /^(\s*)name:\s*['"]?([^'"#]+?)['"]?\s*$/.exec(line);
      if (nameMatch && nameMatch[1].length === indent + 2) {
        current.name = nameMatch[2].trim();
      }
      const disabledMatch = /^(\s*)disabled:\s*(true|false)\s*$/.exec(line);
      if (disabledMatch && disabledMatch[1].length === indent + 2) {
        current.disabled = disabledMatch[2] === 'true';
      }
    }
  }
  return entries
    .filter((entry) => entry.name === packageName || entry.name?.startsWith(`${packageName}/`))
    .map(({ id, name, disabled, file }) => ({ id, name, disabled, file }))
    .slice(0, 30);
}

function deriveChineseName(descriptor) {
  if (!descriptor) return '';
  let text = String(descriptor).replace(/^DSH\s*/i, '').trim();
  text = text.split(/[，。；：,.;:]/)[0].trim();
  if (text.length > 14) text = text.slice(0, 14);
  return /[\u4e00-\u9fff]/.test(text) ? text : '';
}

export { repositoryUrl, dependencyType, findCordisEntries };
