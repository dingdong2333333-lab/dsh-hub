import fs from 'node:fs';
import path from 'node:path';

import { AppError } from '../utils/errors.js';
import { pathExists, readJsonSync } from '../utils/fs-utils.js';

/**
 * Reads DSH's cached Chinese plugin catalog. The cache is optional: when it is
 * absent or malformed the UI simply works without community descriptions.
 */
export class CatalogService {
  constructor({ profileService, logger }) {
    this.profileService = profileService;
    this.logger = logger.child('catalog');
    this.cache = new Map();
  }

  load(profile) {
    const file = path.join(profile.dir, 'cache', 'catalog-plugins-zh.json');
    if (!pathExists(file)) return { entries: [], byName: new Map(), byRepo: new Map() };
    const stat = fs.statSync(file);
    const key = profile.dir;
    const cached = this.cache.get(key);
    if (cached && cached.mtime === stat.mtimeMs) return cached.index;

    const index = { entries: [], byName: new Map(), byRepo: new Map() };
    try {
      const raw = readJsonSync(file);
      const entries = typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;
      if (!Array.isArray(entries)) throw new Error('catalog body is not an array');
      index.entries = entries;
      for (const entry of entries) {
        const names = [entry.n, entry.r?.npmPackage].filter(Boolean);
        for (const name of names) if (!index.byName.has(name)) index.byName.set(name, entry);
        if (entry.r?.repo) index.byRepo.set(String(entry.r.repo).toLowerCase(), entry);
      }
    } catch (error) {
      this.logger.warn('Unable to read catalog cache', { file, error: error.message });
    }
    this.cache.set(key, { mtime: stat.mtimeMs, index });
    return index;
  }

  find(profile, { packageName, repository }) {
    const index = this.load(profile);
    if (packageName && index.byName.has(packageName)) return normalizeEntry(index.byName.get(packageName));
    const repo = normalizeRepo(repository);
    if (repo && index.byRepo.has(repo)) return normalizeEntry(index.byRepo.get(repo));
    return null;
  }

  findLocal(profile, packageName) {
    const index = this.load(profile);
    const entry = index.byName.get(packageName);
    return entry ? normalizeEntry(entry) : null;
  }

  all(profile) {
    return this.load(profile).entries.map(normalizeEntry).filter(Boolean);
  }
}

function normalizeRepo(repository) {
  if (!repository) return '';
  if (typeof repository === 'object') repository = repository.url || '';
  return String(repository)
    .replace(/^git\+/, '')
    .replace(/^github:/, '')
    .replace(/\.git$/, '')
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export function normalizeEntry(entry) {
  if (!entry) return null;
  return {
    slug: entry.s || '',
    name: entry.n || '',
    owner: entry.o || '',
    npmPackage: entry.r?.npmPackage || '',
    repository: entry.r?.repo || '',
    version: entry.vr || '',
    description: entry.d || '',
    features: Array.isArray(entry.f) ? entry.f.filter((item) => typeof item === 'string') : [],
    tags: Array.isArray(entry.t) ? entry.t.filter((item) => typeof item === 'string') : [],
    category: entry.c || '',
    stars: Number(entry.sg) || 0,
    forks: Number(entry.fk) || 0,
    verified: entry.v === 'verified',
    updatedAt: entry.u || '',
    addedAt: entry.a || '',
    installCommand: entry.ic || '',
  };
}

export function requireCatalog(entry) {
  if (!entry) throw new AppError('CATALOG_MISS', '本地社区缓存中没有这个插件的资料。');
  return entry;
}
