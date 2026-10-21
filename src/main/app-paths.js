import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { ensureDir, expandHome, pathExists } from './utils/fs-utils.js';
import { readAsarJson } from './utils/asar.js';

/**
 * Resolve where this run keeps portable state, logs, and crash reports.
 * Packaged builds default to a portable `data/` folder beside the EXE.
 */
export function resolveDataDir({ appRoot, isPackaged, execPath }) {
  if (process.env.DSH_HUB_DATA_DIR) {
    const dir = path.resolve(expandHome(process.env.DSH_HUB_DATA_DIR));
    ensureDir(dir);
    return dir;
  }
  const base = isPackaged ? path.dirname(execPath) : appRoot;
  const dir = path.join(base, isPackaged ? 'data' : '.data');
  ensureDir(dir);
  return dir;
}

export function getDefaultDshHome() {
  return path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), '.dsh');
}

export function resolveDshHome(settings) {
  const candidate = process.env.DSH_HOME || settings.dshHome || getDefaultDshHome();
  return path.resolve(expandHome(candidate));
}

/** A conservative install detector for the official DSH desktop app. */
export function detectDshInstall(settings) {
  const candidates = [];
  const add = (candidate) => {
    if (!candidate) return;
    const resolved = path.resolve(expandHome(candidate));
    if (!candidates.includes(resolved)) candidates.push(resolved);
  };
  add(process.env.DSH_INSTALL_DIR);
  add(settings.dshInstallDir);
  if (process.env.LOCALAPPDATA) add(path.join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness'));
  if (process.env.ProgramFiles) add(path.join(process.env.ProgramFiles, 'DeepSeek Harness'));
  if (process.env['ProgramFiles(x86)']) add(path.join(process.env['ProgramFiles(x86)'], 'DeepSeek Harness'));
  add('C:\\Program Files\\DeepSeek Harness');
  if (process.platform === 'win32') {
    // Installations are commonly placed on a secondary drive. Check the root
    // of each local drive rather than hard-coding one machine's path.
    for (let code = 67; code <= 90; code += 1) {
      add(`${String.fromCharCode(code)}:\\DeepSeek Harness`);
    }
  }

  for (const dir of candidates) {
    const exe = path.join(dir, 'DeepSeek Harness.exe');
    const assets = path.join(dir, 'resources', 'app.asar');
    if (pathExists(exe) || pathExists(assets)) {
      return {
        dir,
        exe: pathExists(exe) ? exe : '',
        officeSkillsDir: pathExists(path.join(dir, 'resources', 'runtime', 'office-skills'))
          ? path.join(dir, 'resources', 'runtime', 'office-skills')
          : '',
      };
    }
  }
  return { dir: '', exe: '', officeSkillsDir: '' };
}

export function listProfilesOnDisk(dshHome) {
  const profilesDir = path.join(dshHome, 'profiles');
  if (!pathExists(profilesDir)) return [];
  return fs.readdirSync(profilesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => pathExists(path.join(profilesDir, name, 'package.json')))
    .sort();
}

export function profilePath(dshHome, name) {
  return path.join(dshHome, 'profiles', name);
}

export function chooseDefaultProfile(profiles) {
  if (profiles.includes('desktop')) return 'desktop';
  if (profiles.includes('web')) return 'web';
  return profiles[0] || '';
}

export function dshVersionFromInstall(installDir) {
  if (!installDir) return '';
  try {
    const packageJson = readAsarJson(path.join(installDir, 'resources', 'app.asar'), 'package.json');
    if (typeof packageJson?.version === 'string' && packageJson.version) return packageJson.version;
  } catch {}
  // Older/other builds may expose a plain version file.
  const candidates = [
    path.join(installDir, 'resources', 'app-update.yml'),
    path.join(installDir, 'resources', 'version'),
    path.join(installDir, 'version'),
  ];
  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      const match = /(?:version|current)[:\s]+["']?v?(\d+\.\d+\.\d+[^\s"']*)/i.exec(text);
      if (match) return match[1];
    } catch {}
  }
  return '';
}
