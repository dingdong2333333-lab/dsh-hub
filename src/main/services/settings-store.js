import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_SETTINGS } from '../../shared/constants.js';
import { AppError } from '../utils/errors.js';
import { deepMerge, clone } from '../utils/object-utils.js';
import { expandHome, pathExists, readJsonSync, writeJsonAtomicSync } from '../utils/fs-utils.js';
import { safeHttpUrl } from '../utils/parse-utils.js';

/**
 * Persistent, validated application settings. Secrets never live here:
 * the model key is resolved from DSH's credential store on demand.
 */
export class SettingsStore {
  constructor({ dataDir, logger }) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'settings.json');
    this.logger = logger;
    this.value = this.load();
  }

  load() {
    const stored = readJsonSync(this.file, {});
    return this.normalize(deepMerge(clone(DEFAULT_SETTINGS), stored || {}));
  }

  normalize(input) {
    const settings = deepMerge(clone(DEFAULT_SETTINGS), input || {});
    settings.dshHome = typeof settings.dshHome === 'string' ? settings.dshHome.trim() : '';
    settings.dshInstallDir = typeof settings.dshInstallDir === 'string' ? settings.dshInstallDir.trim() : '';
    settings.activeProfile = typeof settings.activeProfile === 'string' ? settings.activeProfile.trim() : '';
    settings.model.baseUrl = typeof settings.model.baseUrl === 'string' ? settings.model.baseUrl.trim() : '';
    if (settings.model.baseUrl && !safeHttpUrl(settings.model.baseUrl)) {
      settings.model.baseUrl = '';
    }
    settings.model.model = typeof settings.model.model === 'string' ? settings.model.model.trim() : '';
    settings.model.apiKeyEnv = typeof settings.model.apiKeyEnv === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(settings.model.apiKeyEnv)
      ? settings.model.apiKeyEnv
      : 'DEEPSEEK_API_KEY';
    settings.model.timeoutMs = clampNumber(settings.model.timeoutMs, 5_000, 180_000, 60_000);
    settings.model.fallbackToCatalog = settings.model.fallbackToCatalog !== false;
    settings.ui.theme = ['dark', 'light', 'system'].includes(settings.ui.theme) ? settings.ui.theme : 'dark';
    settings.ui.compact = Boolean(settings.ui.compact);
    settings.ui.reduceMotion = Boolean(settings.ui.reduceMotion);
    settings.ui.minimizeToTray = settings.ui.minimizeToTray !== false;
    settings.ui.closeToTray = settings.ui.closeToTray !== false;
    settings.safety.confirmMutations = settings.safety.confirmMutations !== false;
    settings.safety.backupRetention = clampNumber(settings.safety.backupRetention, 1, 200, 30);
    return settings;
  }

  get() {
    return clone(this.value);
  }

  update(patch) {
    if (!patch || typeof patch !== 'object') {
      throw new AppError('INVALID_SETTINGS', '设置内容不合法。');
    }
    const next = this.normalize(deepMerge(clone(this.value), patch));
    this.value = next;
    writeJsonAtomicSync(this.file, next);
    this.logger?.info('settings', 'Settings updated', {
      activeProfile: next.activeProfile,
      dshHome: next.dshHome || '(default)',
      theme: next.ui.theme,
      model: next.model.model || '(auto)',
    });
    return this.get();
  }

  getDshHome() {
    const candidate = process.env.DSH_HOME || this.value.dshHome || path.join(process.env.HOME || process.env.USERPROFILE || '', '.dsh');
    const expanded = path.resolve(expandHome(candidate));
    if (!pathExists(expanded)) {
      throw new AppError('DSH_HOME_NOT_FOUND', `没有找到 DSH 数据目录：${expanded}`, {
        details: '请在设置中检查 DSH Home 路径，或先启动一次 DeepSeek Harness。',
        retryable: true,
      });
    }
    return expanded;
  }

  getDataDir() {
    return this.dataDir;
  }

  getDshInstallDir() {
    return this.value.dshInstallDir ? path.resolve(expandHome(this.value.dshInstallDir)) : '';
  }

  getSettingsFile() {
    return this.file;
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

export function ensureDataDirs(dataDir) {
  for (const name of ['logs', 'crashes', 'backups', 'exports']) {
    fs.mkdirSync(path.join(dataDir, name), { recursive: true });
  }
}
