import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { dshVersionFromInstall } from '../app-paths.js';
import { AppError } from '../utils/errors.js';
import {
  backupFileSync,
  ensureDir,
  pathExists,
  withFileLock,
} from '../utils/fs-utils.js';

const SNAPSHOT_FILES = [
  'package.json',
  'cordis.yml',
  'cordis.patch.yml',
  'pnpm-lock.yaml',
  '.dsh-hub/plugin-meta.json',
  '.dsh-hub/sets.json',
];
const SNAPSHOT_ID_RE = /^\d{14}-[a-f0-9]{6}$/;

/**
 * Profile-scoped config snapshots. This deliberately covers the files that
 * make DSH load plugins and that DSH Hub itself edits; it does not copy the
 * entire node_modules tree or credentials.
 */
export class SnapshotService {
  constructor({ profileService, settings, logger, appVersion = '0.1.0' }) {
    this.profileService = profileService;
    this.settings = settings;
    this.logger = logger.child('snapshots');
    this.appVersion = appVersion;
  }

  root(profileName) {
    const profile = this.profileService.getProfile(profileName);
    // Keep snapshots in DSH Hub's own data directory. This avoids writing into
    // the DSH profile (which may be read-only in restricted hosts) while the
    // restore target remains the real profile config files.
    return {
      profile,
      dir: path.join(this.settings.getDataDir(), 'snapshots', profile.name),
      lock: path.join(this.settings.getDataDir(), 'snapshots', `${profile.name}.lock`),
    };
  }

  async list(profileName) {
    const { profile, dir } = this.root(profileName);
    ensureDir(dir);
    const snapshots = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !SNAPSHOT_ID_RE.test(entry.name)) continue;
      const manifestFile = path.join(dir, entry.name, 'manifest.json');
      if (!pathExists(manifestFile)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        snapshots.push({ ...manifest, path: path.join(dir, entry.name) });
      } catch (error) {
        this.logger.warn('Ignoring invalid snapshot manifest', { id: entry.name, error: error.message });
      }
    }
    snapshots.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return {
      profile: profile.name,
      dir,
      stats: {
        total: snapshots.length,
        automatic: snapshots.filter((snapshot) => snapshot.auto).length,
        lastAt: snapshots[0]?.createdAt || null,
      },
      snapshots,
    };
  }

  async create(profileName, { label = '手动快照', reason = 'manual', auto = false } = {}) {
    const { lock } = this.root(profileName);
    return withFileLock(lock, () => this.createUnlocked(profileName, { label, reason, auto }));
  }

  async createUnlocked(profileName, { label = '手动快照', reason = 'manual', auto = false } = {}) {
    const { profile, dir } = this.root(profileName);
    ensureDir(dir);
    const now = new Date();
    const id = `${now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
    const finalDir = path.join(dir, id);
    const tempDir = path.join(dir, `.tmp-${id}`);
    ensureDir(tempDir);
    const files = [];
    try {
      for (const relative of SNAPSHOT_FILES) {
        const source = path.join(profile.dir, relative);
        if (!pathExists(source)) continue;
        const target = path.join(tempDir, relative);
        ensureDir(path.dirname(target));
        fs.copyFileSync(source, target);
        const stat = fs.statSync(source);
        files.push({
          path: relative,
          size: stat.size,
          sha256: hashFile(source),
        });
      }
      const manifest = {
        id,
        createdAt: now.toISOString(),
        label: String(label || '快照').slice(0, 100),
        reason: String(reason || 'manual').slice(0, 50),
        auto: Boolean(auto),
        profile: profile.name,
        appVersion: this.appVersion,
        dshVersion: getDshVersion(this.profileService),
        bundles: profile.bundles,
        files,
        totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      };
      fs.writeFileSync(path.join(tempDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      fs.renameSync(tempDir, finalDir);
      this.logger.info('Snapshot created', {
        profile: profile.name,
        id,
        label: manifest.label,
        auto,
        files: files.length,
        bytes: manifest.totalBytes,
      });
      if (auto) this.pruneAuto(profileName).catch(() => {});
      return { ...manifest, path: finalDir };
    } catch (error) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  async pruneAuto(profileName, keep = 20) {
    const { dir } = this.root(profileName);
    if (!pathExists(dir)) return { removed: 0 };
    const autos = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !SNAPSHOT_ID_RE.test(entry.name)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, entry.name, 'manifest.json'), 'utf8'));
        if (manifest.auto) autos.push({ id: entry.name, createdAt: manifest.createdAt });
      } catch {}
    }
    autos.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    let removed = 0;
    for (const entry of autos.slice(Math.max(0, keep))) {
      fs.rmSync(path.join(dir, entry.id), { recursive: true, force: true });
      removed += 1;
    }
    return { removed };
  }

  async restore(profileName, id) {
    const { profile, dir, lock } = this.root(profileName);
    if (!SNAPSHOT_ID_RE.test(String(id))) throw new AppError('INVALID_SNAPSHOT', '快照 ID 不合法。');
    return withFileLock(lock, async () => {
      const snapshotDir = path.join(dir, id);
      const manifestFile = path.join(snapshotDir, 'manifest.json');
      if (!pathExists(manifestFile)) throw new AppError('SNAPSHOT_NOT_FOUND', '没有找到这个快照。');
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      const preRestore = await this.createUnlocked(profileName, {
        label: `恢复 ${id} 前的自动快照`,
        reason: 'pre-restore',
        auto: true,
      });
      const restored = [];
      const missing = [];
      for (const file of manifest.files || []) {
        if (!SNAPSHOT_FILES.includes(file.path)) continue;
        const source = path.join(snapshotDir, file.path);
        const target = path.join(profile.dir, file.path);
        if (!pathExists(source)) {
          missing.push(file.path);
          continue;
        }
        backupFileSync(target, path.join(this.settings.getDataDir(), 'backups', 'snapshots'), `snapshot-${id}`, this.settings.get().safety.backupRetention);
        ensureDir(path.dirname(target));
        const temp = `${target}.restore-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
        fs.copyFileSync(source, temp);
        fs.renameSync(temp, target);
        restored.push(file.path);
      }
      this.logger.info('Snapshot restored', { profile: profile.name, id, restored, preRestore: preRestore.id });
      return {
        id,
        restored,
        missing,
        preRestore,
        restartRequired: true,
      };
    });
  }

  async delete(profileName, id, trashItem = null) {
    const { profile, dir, lock } = this.root(profileName);
    if (!SNAPSHOT_ID_RE.test(String(id))) throw new AppError('INVALID_SNAPSHOT', '快照 ID 不合法。');
    return withFileLock(lock, async () => {
      const snapshotDir = path.join(dir, id);
      if (!pathExists(snapshotDir)) throw new AppError('SNAPSHOT_NOT_FOUND', '没有找到这个快照。');
      if (typeof trashItem === 'function') await trashItem(snapshotDir);
      else fs.rmSync(snapshotDir, { recursive: true, force: true });
      this.logger.info('Snapshot deleted', { profile: profile.name, id });
      return { id };
    });
  }

  getPath(profileName, id) {
    const { dir } = this.root(profileName);
    if (!SNAPSHOT_ID_RE.test(String(id))) throw new AppError('INVALID_SNAPSHOT', '快照 ID 不合法。');
    const target = path.join(dir, id);
    if (!pathExists(target)) throw new AppError('SNAPSHOT_NOT_FOUND', '没有找到这个快照。');
    return target;
  }

  async autoBefore(profileName, label, reason = 'automatic') {
    try {
      return await this.create(profileName, { label, reason, auto: true });
    } catch (error) {
      this.logger.warn('Automatic snapshot failed', { label, error: error.message });
      return null;
    }
  }
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function getDshVersion(profileService) {
  try {
    const install = profileService.getInstall();
    return install?.dir ? dshVersionFromInstall(install.dir) : '';
  } catch {
    return '';
  }
}

export { SNAPSHOT_FILES };
