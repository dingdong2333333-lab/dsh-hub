import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { SET_COLORS } from '../../shared/constants.js';
import { AppError } from '../utils/errors.js';
import {
  backupFileSync,
  ensureDir,
  pathExists,
  readJsonSync,
  withFileLock,
  writeJsonAtomic,
} from '../utils/fs-utils.js';

const META_FILE = 'plugin-meta.json';
const SETS_FILE = 'sets.json';

/**
 * Per-profile user data. Living inside `<profile>/.dsh-hub` keeps custom names,
 * notes and sets next to the profile they describe, which also makes them easy
 * to back up or inspect from another tool.
 */
export class MetadataStore {
  constructor({ profileService, settings, logger }) {
    this.profileService = profileService;
    this.settings = settings;
    this.logger = logger.child('metadata');
  }

  paths(profileName) {
    const profile = this.profileService.getProfile(profileName);
    const dir = path.join(profile.dir, '.dsh-hub');
    return {
      dir,
      meta: path.join(dir, META_FILE),
      sets: path.join(dir, SETS_FILE),
      lock: path.join(dir, 'metadata.lock'),
      backups: path.join(dir, 'backups'),
    };
  }

  ensure(profileName) {
    const paths = this.paths(profileName);
    ensureDir(paths.dir);
    ensureDir(paths.backups);
    return paths;
  }

  readMeta(profileName) {
    const paths = this.paths(profileName);
    const raw = readJsonSync(paths.meta, null);
    const plugins = raw && typeof raw.plugins === 'object' && raw.plugins ? raw.plugins : {};
    return { version: 1, updatedAt: raw?.updatedAt || null, plugins: { ...plugins } };
  }

  readSets(profileName) {
    const paths = this.paths(profileName);
    const raw = readJsonSync(paths.sets, null);
    const sets = raw && Array.isArray(raw.sets) ? raw.sets : [];
    return { version: 1, updatedAt: raw?.updatedAt || null, sets: sets.filter(isValidSet) };
  }

  getPluginMeta(profileName, packageName) {
    const meta = this.readMeta(profileName);
    return meta.plugins[packageName] || null;
  }

  async setPluginMeta(profileName, packageName, patch) {
    if (typeof packageName !== 'string' || !packageName) {
      throw new AppError('INVALID_PLUGIN', '插件名称不合法。');
    }
    const paths = this.ensure(profileName);
    return withFileLock(paths.lock, async () => {
      const meta = this.readMeta(profileName);
      const previous = meta.plugins[packageName] || {};
      const next = sanitizePluginMeta({ ...previous, ...(patch || {}) }, previous);
      if (next.empty) delete meta.plugins[packageName];
      else meta.plugins[packageName] = next.value;
      meta.updatedAt = new Date().toISOString();
      if (pathExists(paths.meta)) {
        backupFileSync(paths.meta, paths.backups, 'plugin-meta', this.settings.get().safety.backupRetention);
      }
      await writeJsonAtomic(paths.meta, meta);
      return next.empty ? null : next.value;
    });
  }

  async createSet(profileName, input) {
    const paths = this.ensure(profileName);
    return withFileLock(paths.lock, async () => {
      const data = this.readSets(profileName);
      const set = sanitizeSet({
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      if (data.sets.some((item) => item.name.toLowerCase() === set.name.toLowerCase())) {
        throw new AppError('DUPLICATE_SET', '已经有一个同名套装了。');
      }
      data.sets.push(set);
      data.updatedAt = new Date().toISOString();
      if (pathExists(paths.sets)) {
        backupFileSync(paths.sets, paths.backups, 'sets', this.settings.get().safety.backupRetention);
      }
      await writeJsonAtomic(paths.sets, data);
      this.logger.info('Set created', { profile: profileName, id: set.id, name: set.name, plugins: set.pluginNames.length });
      return set;
    });
  }

  async updateSet(profileName, id, patch) {
    const paths = this.ensure(profileName);
    return withFileLock(paths.lock, async () => {
      const data = this.readSets(profileName);
      const index = data.sets.findIndex((item) => item.id === id);
      if (index < 0) throw new AppError('SET_NOT_FOUND', '没有找到这个套装。');
      const current = data.sets[index];
      const next = sanitizeSet({
        ...current,
        ...(patch || {}),
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      });
      if (next.name.toLowerCase() !== current.name.toLowerCase()
        && data.sets.some((item) => item.id !== id && item.name.toLowerCase() === next.name.toLowerCase())) {
        throw new AppError('DUPLICATE_SET', '已经有一个同名套装了。');
      }
      data.sets[index] = next;
      data.updatedAt = new Date().toISOString();
      if (pathExists(paths.sets)) {
        backupFileSync(paths.sets, paths.backups, 'sets', this.settings.get().safety.backupRetention);
      }
      await writeJsonAtomic(paths.sets, data);
      this.logger.info('Set updated', { profile: profileName, id, name: next.name });
      return next;
    });
  }

  async deleteSet(profileName, id) {
    const paths = this.ensure(profileName);
    return withFileLock(paths.lock, async () => {
      const data = this.readSets(profileName);
      const index = data.sets.findIndex((item) => item.id === id);
      if (index < 0) throw new AppError('SET_NOT_FOUND', '没有找到这个套装。');
      const [removed] = data.sets.splice(index, 1);
      data.updatedAt = new Date().toISOString();
      if (pathExists(paths.sets)) {
        backupFileSync(paths.sets, paths.backups, 'sets', this.settings.get().safety.backupRetention);
      }
      await writeJsonAtomic(paths.sets, data);
      this.logger.info('Set deleted', { profile: profileName, id, name: removed.name });
      return removed;
    });
  }

  async markSetApplied(profileName, id, action) {
    const paths = this.ensure(profileName);
    return withFileLock(paths.lock, async () => {
      const data = this.readSets(profileName);
      const set = data.sets.find((item) => item.id === id);
      if (!set) return null;
      set.lastAppliedAt = new Date().toISOString();
      set.lastAction = action === 'disable' ? 'disable' : 'enable';
      set.updatedAt = new Date().toISOString();
      await writeJsonAtomic(paths.sets, data);
      return set;
    });
  }
}

function sanitizeString(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function sanitizePluginMeta(input, previous = {}) {
  const displayName = sanitizeString(input.displayName, 40);
  const notes = sanitizeString(input.notes, 1_200);
  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map((tag) => sanitizeString(tag, 20)).filter(Boolean))].slice(0, 8)
    : [];
  const favorite = Boolean(input.favorite);
  const value = { ...previous };
  if (displayName) value.displayName = displayName;
  else delete value.displayName;
  if (notes) value.notes = notes;
  else delete value.notes;
  if (tags.length) value.tags = tags;
  else delete value.tags;
  if (favorite) value.favorite = true;
  else delete value.favorite;
  if (input.ai && typeof input.ai === 'object') {
    value.ai = {
      source: sanitizeString(input.ai.source, 32),
      model: sanitizeString(input.ai.model, 80),
      generatedAt: sanitizeString(input.ai.generatedAt, 40),
      category: sanitizeString(input.ai.category, 20),
      confidence: clamp(Number(input.ai.confidence), 0, 1),
    };
  }
  if (input.updatedAt) value.updatedAt = input.updatedAt;
  else value.updatedAt = new Date().toISOString();
  return {
    empty: !value.displayName && !value.notes && !value.favorite && !value.tags?.length,
    value,
  };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, min), max);
}

function sanitizeSet(input) {
  const name = sanitizeString(input.name, 48);
  if (!name) throw new AppError('INVALID_SET', '套装名称不能为空。');
  const pluginNames = Array.isArray(input.pluginNames)
    ? [...new Set(input.pluginNames.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim()))].slice(0, 100)
    : [];
  return {
    id: typeof input.id === 'string' && /^[0-9a-f-]{36}$/i.test(input.id) ? input.id : crypto.randomUUID(),
    name,
    description: sanitizeString(input.description, 300),
    color: SET_COLORS.includes(input.color) ? input.color : SET_COLORS[0],
    icon: sanitizeString(input.icon, 32) || 'layers',
    pluginNames,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
    lastAppliedAt: input.lastAppliedAt || null,
    lastAction: input.lastAction === 'disable' || input.lastAction === 'enable' ? input.lastAction : null,
  };
}

function isValidSet(value) {
  return value && typeof value === 'object' && typeof value.id === 'string' && typeof value.name === 'string';
}

export { META_FILE, SETS_FILE, sanitizeSet };
