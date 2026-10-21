import fs from 'node:fs';
import path from 'node:path';

import { PROTECTED_BUNDLES } from '../../shared/constants.js';
import { AppError } from '../utils/errors.js';
import {
  backupFileSync,
  ensureDir,
  fileMtime,
  pathExists,
  readJsonSync,
  withFileLock,
  writeTextAtomic,
} from '../utils/fs-utils.js';
import {
  chooseDefaultProfile,
  detectDshInstall,
  dshVersionFromInstall,
  listProfilesOnDisk,
  profilePath,
  resolveDshHome,
} from '../app-paths.js';

const PROFILE_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Owns profile discovery and the only code path that writes `package.json`.
 * All mutations are locked, backed up, and logged.
 */
export class ProfileService {
  constructor({ settings, logger }) {
    this.settings = settings;
    this.logger = logger.child('profiles');
  }

  getDshHome() {
    return resolveDshHome(this.settings.get());
  }

  getInstall() {
    return detectDshInstall(this.settings.get());
  }

  assertProfileName(name) {
    if (!PROFILE_NAME_RE.test(String(name || ''))) {
      throw new AppError('INVALID_PROFILE', 'Profile 名称不合法。', { details: name });
    }
    return name;
  }

  listProfiles() {
    const dshHome = this.getDshHome();
    const names = listProfilesOnDisk(dshHome);
    const profiles = names.map((name) => {
      const dir = profilePath(dshHome, name);
      const manifest = readJsonSync(path.join(dir, 'package.json'), null);
      const bundles = manifest?.dsh?.profile?.bundles;
      const deps = manifest?.dependencies || {};
      return {
        name,
        dir,
        packageCount: Object.keys(deps).length,
        bundleCount: Array.isArray(bundles) ? bundles.length : 0,
        enabledBundleCount: Array.isArray(bundles) ? bundles.filter((item) => Object.hasOwn(deps, item)).length : 0,
        mtime: fileMtime(path.join(dir, 'package.json')),
        hasPatch: pathExists(path.join(dir, 'cordis.patch.yml')),
        hasLock: pathExists(path.join(dir, 'pnpm-lock.yaml')),
        description: manifest?.description || '',
      };
    });
    return profiles.sort((a, b) => a.name.localeCompare(b.name));
  }

  resolveActiveProfile(requestedName) {
    const profiles = this.listProfiles();
    if (!profiles.length) {
      throw new AppError('NO_PROFILES', 'DSH 数据目录里没有找到任何 profile。', {
        details: '请先启动一次 DeepSeek Harness Desktop，并在设置中确认 DSH Home 路径。',
      });
    }
    const available = profiles.map((profile) => profile.name);
    const candidate = requestedName || this.settings.get().activeProfile || '';
    if (candidate && available.includes(candidate)) return candidate;
    return chooseDefaultProfile(available);
  }

  getProfile(name) {
    const activeName = this.resolveActiveProfile(name);
    this.assertProfileName(activeName);
    const dshHome = this.getDshHome();
    const dir = profilePath(dshHome, activeName);
    const manifestFile = path.join(dir, 'package.json');
    if (!pathExists(manifestFile)) {
      throw new AppError('PROFILE_NOT_FOUND', `没有找到 profile：${activeName}`, { details: manifestFile });
    }
    const manifest = readJsonSync(manifestFile);
    if (!manifest || typeof manifest !== 'object') {
      throw new AppError('INVALID_MANIFEST', `profile 的 package.json 格式不正确：${manifestFile}`);
    }
    return {
      name: activeName,
      dir,
      manifestFile,
      manifest,
      bundles: Array.isArray(manifest.dsh?.profile?.bundles) ? [...manifest.dsh.profile.bundles] : [],
      dependencies: { ...(manifest.dependencies || {}) },
    };
  }

  setActiveProfile(name) {
    this.assertProfileName(name);
    const profiles = this.listProfiles().map((profile) => profile.name);
    if (!profiles.includes(name)) {
      throw new AppError('PROFILE_NOT_FOUND', `没有找到 profile：${name}`);
    }
    this.settings.update({ activeProfile: name });
    return this.getProfile(name);
  }

  resolvePackage(profile, packageName) {
    const dir = path.join(profile.dir, 'node_modules', packageName);
    const manifestFile = path.join(dir, 'package.json');
    if (!pathExists(manifestFile)) return { dir, manifestFile, manifest: null, missing: true };
    const manifest = readJsonSync(manifestFile, null);
    let realDir = dir;
    try { realDir = fs.realpathSync(dir); } catch {}
    return { dir: realDir, manifestFile, manifest, missing: false };
  }

  readPackageReadme(profile, packageName, maxChars = 4_000) {
    const pkg = this.resolvePackage(profile, packageName);
    if (pkg.missing) return '';
    const candidates = ['README.zh.md', 'README.zh-CN.md', 'README.md', 'readme.md'];
    for (const name of candidates) {
      const file = path.join(pkg.dir, name);
      if (!pathExists(file)) continue;
      try {
        return fs.readFileSync(file, 'utf8').slice(0, maxChars);
      } catch {}
    }
    return '';
  }

  /**
   * Mutate the ordered bundle list. The callback receives a mutable array and
   * must return an array. This is the single writer used by every feature.
   */
  async mutateBundles(profileName, reason, mutate) {
    const profile = this.getProfile(profileName);
    const lockFile = path.join(profile.dir, '.dsh-hub', 'manifest.lock');
    return withFileLock(lockFile, async () => {
      const current = this.getProfile(profileName);
      const oldBundles = [...current.bundles];
      const proposed = mutate([...oldBundles]);
      if (!Array.isArray(proposed)) {
        throw new AppError('INVALID_MUTATION', '插件变更函数没有返回数组。');
      }
      const seen = new Set();
      const nextBundles = [];
      for (const name of proposed) {
        if (typeof name !== 'string' || !name.trim()) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        nextBundles.push(name);
      }
      // Hard safety rail: never remove the bundles that boot the web app.
      for (const protectedName of PROTECTED_BUNDLES) {
        if (oldBundles.includes(protectedName) && !nextBundles.includes(protectedName)) {
          nextBundles.unshift(protectedName);
        }
      }
      if (JSON.stringify(oldBundles) === JSON.stringify(nextBundles)) {
        return {
          changed: false,
          added: [],
          removed: [],
          bundles: nextBundles,
          backup: null,
          profile: profile.name,
          reason,
          restartRequired: false,
        };
      }
      const added = nextBundles.filter((name) => !oldBundles.includes(name));
      const removed = oldBundles.filter((name) => !nextBundles.includes(name));
      const backup = backupFileSync(
        current.manifestFile,
        path.join(current.dir, '.dsh-hub', 'backups'),
        'package',
        this.settings.get().safety.backupRetention,
      );
      current.manifest.dsh = current.manifest.dsh || {};
      current.manifest.dsh.profile = current.manifest.dsh.profile || {};
      current.manifest.dsh.profile.bundles = nextBundles;
      await writeTextAtomic(current.manifestFile, `${JSON.stringify(current.manifest, null, 2)}\n`);
      ensureDir(path.join(current.dir, '.dsh-hub'));
      this.logger.info('Bundle manifest updated', {
        profile: profile.name,
        reason,
        added,
        removed,
        backup,
      });
      return {
        changed: true,
        added,
        removed,
        bundles: nextBundles,
        backup,
        profile: profile.name,
        reason,
        restartRequired: true,
        dshVersion: dshVersionFromInstall(this.getInstall().dir),
      };
    });
  }

  getPublicProfile(profileName) {
    const profile = this.getProfile(profileName);
    return {
      name: profile.name,
      dir: profile.dir,
      bundleCount: profile.bundles.length,
      dependencyCount: Object.keys(profile.dependencies).length,
      manifestFile: profile.manifestFile,
      dshHome: this.getDshHome(),
      install: this.getInstall(),
    };
  }
}

export { PROFILE_NAME_RE };
