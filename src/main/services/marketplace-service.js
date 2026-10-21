import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

import { AppError } from '../utils/errors.js';
import { stripAnsi } from '../utils/parse-utils.js';

const CATEGORY_LABELS = {
  tools: '工具能力',
  interface: '界面体验',
  model: '模型接入',
  dev: '开发工具',
  session: '会话消息',
  integration: '集成连接',
  agent: '智能体',
  workflow: '工作流',
  knowledge: '知识库',
  fun: '趣味',
  memory: '记忆上下文',
};

/**
 * A standalone re-implementation of the DSH Plugin Hub catalog experience:
 * browse the same Chinese catalog cache, install/update/uninstall through the
 * DSH CLI, and keep an in-memory task history.
 */
export class MarketplaceService {
  constructor({ profileService, catalogService, pluginService, snapshotService, settings, logger, dataDir }) {
    this.profileService = profileService;
    this.catalogService = catalogService;
    this.pluginService = pluginService;
    this.snapshotService = snapshotService;
    this.settings = settings;
    this.logger = logger.child('marketplace');
    this.dataDir = dataDir;
    this.running = null;
    this.history = [];
  }

  async list(profileName, request = {}) {
    const profile = this.profileService.getProfile(profileName);
    const catalog = this.catalogService.all(profile);
    const inventory = await this.pluginService.list(profile.name);
    const installedList = inventory.plugins;
    const installedByName = new Map();
    for (const plugin of installedList) {
      installedByName.set(plugin.name.toLowerCase(), plugin);
    }
    const installedByRepo = new Map();
    for (const plugin of installedList) {
      const repo = normalizeRepo(plugin.repository);
      if (repo) installedByRepo.set(repo, plugin);
    }

    const items = catalog.map((entry) => {
      const packageName = entry.npmPackage || entry.name;
      const installed = installedByName.get(String(packageName || '').toLowerCase())
        || (entry.repository ? installedByRepo.get(normalizeRepo(entry.repository)) : null);
      const catalogVersion = normalizeVersion(entry.version || '');
      const installedVersion = normalizeVersion(installed?.version || '');
      const updatable = Boolean(installed && catalogVersion && installedVersion && compareVersions(catalogVersion, installedVersion) > 0);
      return {
        id: entry.slug || entry.name,
        name: entry.name,
        packageName: entry.npmPackage || entry.name,
        owner: entry.owner || (entry.repository ? entry.repository.split('/')[0] : ''),
        title: entry.name,
        description: entry.description || '',
        features: entry.features || [],
        tags: entry.tags || [],
        category: CATEGORY_LABELS[entry.category] || entry.category || '其他',
        categoryId: entry.category || '',
        stars: entry.stars || 0,
        forks: entry.forks || 0,
        verified: entry.verified,
        version: entry.version || '',
        updatedAt: entry.updatedAt || '',
        addedAt: entry.addedAt || '',
        repository: entry.repository || '',
        installCommand: entry.installCommand || '',
        installSpec: installSpecFor(entry),
        installed: Boolean(installed),
        enabled: Boolean(installed?.enabled),
        installedVersion: installed?.version || '',
        updatable,
        pluginName: installed?.name || '',
      };
    });

    const query = String(request.query || '').trim().toLowerCase();
    const category = String(request.category || 'all');
    const state = String(request.state || 'all');
    let filtered = items;
    if (query) {
      filtered = filtered.filter((item) => [item.name, item.packageName, item.owner, item.description, item.tags.join(' '), item.features.join(' '), item.repository]
        .join(' ').toLowerCase().includes(query));
    }
    if (category !== 'all') filtered = filtered.filter((item) => item.categoryId === category);
    if (state === 'installed') filtered = filtered.filter((item) => item.installed);
    else if (state === 'not-installed') filtered = filtered.filter((item) => !item.installed);
    else if (state === 'updatable') filtered = filtered.filter((item) => item.updatable);

    const sort = String(request.sort || 'hot');
    filtered = [...filtered].sort((a, b) => {
      if (sort === 'new') return String(b.updatedAt).localeCompare(String(a.updatedAt));
      if (sort === 'added') return String(b.addedAt).localeCompare(String(a.addedAt));
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (sort === 'stars') return b.stars - a.stars;
      return b.stars - a.stars || String(b.updatedAt).localeCompare(String(a.updatedAt));
    });

    const pageSize = Math.min(Math.max(Number(request.pageSize) || 24, 6), 60);
    const page = Math.max(Number(request.page) || 1, 1);
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const itemsPage = filtered.slice((page - 1) * pageSize, page * pageSize);
    const categoryCounts = new Map();
    for (const item of items) categoryCounts.set(item.categoryId, (categoryCounts.get(item.categoryId) || 0) + 1);

    return {
      profile: profile.name,
      catalogCount: items.length,
      installedCount: items.filter((item) => item.installed).length,
      enabledCount: items.filter((item) => item.enabled).length,
      updatableCount: items.filter((item) => item.updatable).length,
      total,
      page,
      pageSize,
      pages,
      categories: [...categoryCounts.entries()]
        .map(([id, count]) => ({ id, label: CATEGORY_LABELS[id] || id, count }))
        .sort((a, b) => b.count - a.count),
      items: itemsPage,
      history: this.history.slice(0, 20),
    };
  }

  async detail(profileName, id) {
    const profile = this.profileService.getProfile(profileName);
    const entry = this.catalogService.all(profile).find((item) => item.slug === id || item.name === id);
    if (!entry) throw new AppError('MARKET_ITEM_NOT_FOUND', '插件市场中找不到这个插件。');
    const plugin = (await this.pluginService.list(profile.name)).plugins
      .find((item) => item.name.toLowerCase() === String(entry.npmPackage || entry.name).toLowerCase());
    return {
      entry: {
        ...entry,
        id: entry.slug || entry.name,
        categoryLabel: CATEGORY_LABELS[entry.category] || entry.category,
        installSpec: installSpecFor(entry),
      },
      installed: plugin || null,
      updateAvailable: Boolean(plugin && compareVersions(entry.version, plugin.version) > 0),
    };
  }

  async install(profileName, id, onProgress = () => {}) {
    const profile = this.profileService.getProfile(profileName);
    const entry = this.catalogService.all(profile).find((item) => item.slug === id || item.name === id);
    if (!entry) throw new AppError('MARKET_ITEM_NOT_FOUND', '插件市场中找不到这个插件。');
    const spec = installSpecFor(entry);
    await this.ensureIdle();
    const beforeDependencies = new Set(Object.keys(profile.dependencies));
    this.running = this.runTask(profile, {
      type: 'install',
      title: `安装 ${entry.name}`,
      packageName: entry.npmPackage || entry.name,
      args: ['add', spec],
      onProgress,
      addBundles: true,
      beforeDependencies,
      snapshotLabel: `安装 ${entry.name} 前自动快照`,
    });
    return this.running;
  }

  async update(profileName, id, onProgress = () => {}) {
    const profile = this.profileService.getProfile(profileName);
    const entry = this.catalogService.all(profile).find((item) => item.slug === id || item.name === id);
    if (!entry) throw new AppError('MARKET_ITEM_NOT_FOUND', '插件市场中找不到这个插件。');
    const pluginName = entry.npmPackage || entry.name;
    const inventory = await this.pluginService.list(profile.name);
    const installed = inventory.plugins.find((plugin) => plugin.name.toLowerCase() === String(pluginName).toLowerCase());
    if (!installed) throw new AppError('NOT_INSTALLED', '这个插件尚未安装，请先安装。');
    await this.ensureIdle();
    this.running = this.runTask(profile, {
      type: 'update',
      title: `更新 ${entry.name}`,
      packageName: installed.name,
      args: ['update', installed.name],
      onProgress,
      addBundles: false,
      snapshotLabel: `更新 ${entry.name} 前自动快照`,
    });
    return this.running;
  }

  async uninstall(profileName, id, onProgress = () => {}) {
    const profile = this.profileService.getProfile(profileName);
    const entry = this.catalogService.all(profile).find((item) => item.slug === id || item.name === id);
    const packageName = entry ? (entry.npmPackage || entry.name) : String(id || '');
    if (!packageName) throw new AppError('INVALID_ARGUMENT', '缺少要卸载的插件名。');
    const inventory = await this.pluginService.list(profile.name);
    const installed = inventory.plugins.find((plugin) => plugin.name.toLowerCase() === packageName.toLowerCase());
    if (!installed) throw new AppError('NOT_INSTALLED', '这个插件尚未安装。');
    await this.ensureIdle();
    this.running = this.runTask(profile, {
      type: 'uninstall',
      title: `卸载 ${installed.title || installed.name}`,
      packageName: installed.name,
      args: ['remove', installed.name],
      onProgress,
      addBundles: false,
      removeBundles: true,
      snapshotLabel: `卸载 ${installed.name} 前自动快照`,
    });
    return this.running;
  }

  async customInstall(profileName, spec, onProgress = () => {}) {
    const profile = this.profileService.getProfile(profileName);
    const clean = validateSpec(spec);
    await this.ensureIdle();
    const beforeDependencies = new Set(Object.keys(profile.dependencies));
    this.running = this.runTask(profile, {
      type: 'custom-install',
      title: `自定义安装 ${clean}`,
      packageName: '',
      args: ['add', clean],
      onProgress,
      addBundles: true,
      beforeDependencies,
      snapshotLabel: '自定义安装前自动快照',
    });
    return this.running;
  }

  getHistory() {
    return this.history.slice(0, 30);
  }

  async ensureIdle() {
    if (this.running) throw new AppError('MARKET_BUSY', '已有一个插件市场任务正在进行，请等待它完成。');
  }

  async runTask(profile, { type, title, packageName, args, onProgress, addBundles, removeBundles, snapshotLabel, beforeDependencies = null }) {
    const taskId = crypto.randomUUID().slice(0, 8);
    const started = Date.now();
    const emit = (payload) => {
      try { onProgress({ taskId, title, packageName, ...payload }); } catch {}
    };
    const task = {
      id: taskId,
      type,
      title,
      packageName,
      status: 'running',
      startedAt: new Date().toISOString(),
      log: [],
      exitCode: null,
    };
    this.history.unshift(task);
    this.history = this.history.slice(0, 30);
    emit({ type: 'start', message: `${title} 开始` });
    try {
      await this.snapshotService?.autoBefore(profile.name, snapshotLabel, `market-${type}`);
      if (removeBundles && packageName) {
        await this.profileService.mutateBundles(profile.name, `market-uninstall-${type}`, (bundles) => bundles.filter((name) => name !== packageName));
      }
      const result = await this.runDshCli(profile.name, args, (line) => {
        task.log.push(line);
        if (task.log.length > 300) task.log.shift();
        emit({ type: 'log', line });
      });
      task.exitCode = result.code;
      if (result.code !== 0) {
        throw new AppError('MARKET_TASK_FAILED', `${title} 失败（退出码 ${result.code}）。`, {
          details: result.stderr.slice(-1500) || result.stdout.slice(-1500),
        });
      }
      let bundlesAdded = [];
      if (addBundles) {
        bundlesAdded = await this.addInstalledBundles(profile.name, packageName, beforeDependencies);
      }
      task.status = 'ok';
      task.finishedAt = new Date().toISOString();
      task.durationMs = Date.now() - started;
      emit({ type: 'done', code: result.code, bundlesAdded, durationMs: task.durationMs });
      this.logger.info('Marketplace task completed', { taskId, profile: profile.name, type, title, durationMs: task.durationMs });
      return {
        ok: true,
        taskId,
        title,
        packageName,
        durationMs: task.durationMs,
        bundlesAdded,
        log: task.log,
        restartRequired: true,
      };
    } catch (error) {
      task.status = 'error';
      task.finishedAt = new Date().toISOString();
      task.durationMs = Date.now() - started;
      task.error = error.message;
      emit({ type: 'error', message: error.message });
      this.logger.error('Marketplace task failed', { taskId, profile: profile.name, type, title, error: error.message });
      throw error;
    } finally {
      this.running = null;
    }
  }

  async addInstalledBundles(profileName, expectedName, beforeDependencies = null) {
    const plugins = (await this.pluginService.list(profileName)).plugins;
    const candidates = plugins.filter((plugin) => plugin.isBundle && !plugin.missing && !plugin.protected);
    const target = candidates.find((plugin) => plugin.name.toLowerCase() === String(expectedName || '').toLowerCase())
      || (beforeDependencies
        ? candidates.find((plugin) => !beforeDependencies.has(plugin.name))
        : null);
    if (!target) return [];
    if (target.enabled) return [];
    const result = await this.profileService.mutateBundles(profileName, `market-add-bundle-${target.name}`, (bundles) => {
      if (!bundles.includes(target.name)) bundles.push(target.name);
      return bundles;
    });
    return result.changed ? [target.name] : [];
  }

  async runDshCli(profileName, args, onLine) {
    const install = this.profileService.getInstall();
    if (!install.dir || !install.exe || !fs.existsSync(install.exe)) {
      throw new AppError('DSH_INSTALL_NOT_FOUND', '没有找到 DeepSeek Harness 安装目录，无法调用插件安装器。');
    }
    const cli = path.join(install.dir, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
    if (!fs.existsSync(cli)) {
      throw new AppError('DSH_CLI_NOT_FOUND', '没有找到 DSH CLI，无法安装插件。', { details: cli });
    }
    return new Promise((resolve, reject) => {
      const child = spawn(install.exe, ['--expose-internals', cli, 'plugin', '--profile', profileName, ...args], {
        cwd: install.dir,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        try { child.kill(); } catch {}
        settled = true;
        reject(new AppError('MARKET_TIMEOUT', '插件安装超时（15 分钟），已停止等待。', { retryable: true }));
      }, 15 * 60_000);
      const consume = (stream, isErr) => {
        let buffer = '';
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            const clean = stripAnsi(line).trim();
            if (!clean) continue;
            if (isErr) stderr += `${clean}\n`;
            else stdout += `${clean}\n`;
            onLine(clean);
          }
        });
      };
      consume(child.stdout, false);
      consume(child.stderr, true);
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new AppError('MARKET_SPAWN_FAILED', '无法启动 DSH 插件安装器。', { cause: error, details: error.message }));
      });
      child.on('exit', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ code: code ?? 1, stdout, stderr });
      });
    });
  }
}

function installSpecFor(entry) {
  if (entry.installCommand) {
    const match = /\badd\s+(.+?)\s*$/i.exec(entry.installCommand);
    if (match) return match[1].trim();
  }
  if (entry.npmPackage) return entry.npmPackage;
  if (entry.repository) return `github:${entry.repository}`;
  return entry.name;
}

function normalizeRepo(value) {
  if (!value) return '';
  return String(value)
    .replace(/^git\+/, '')
    .replace(/^github:/i, '')
    .replace(/\.git$/i, '')
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function normalizeVersion(value) {
  return String(value || '').replace(/^[^\d]*/, '').trim();
}

function compareVersions(a, b) {
  const left = normalizeVersion(a).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const right = normalizeVersion(b).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function validateSpec(input) {
  const spec = String(input || '').trim();
  if (!spec) throw new AppError('INVALID_SPEC', '请填写要安装的 npm 包、GitHub 仓库或本地目录。');
  if (spec.length > 500) throw new AppError('INVALID_SPEC', '安装地址过长。');
  if (/[\u0000-\u001f]/.test(spec)) throw new AppError('INVALID_SPEC', '安装地址包含非法控制字符。');
  if (spec.startsWith('-')) throw new AppError('INVALID_SPEC', '安装地址不能以短横线开头。');
  return spec;
}

export { CATEGORY_LABELS, compareVersions, installSpecFor, validateSpec };
