import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { AppError } from './errors.js';

export function expandHome(input) {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

export function pathExists(target) {
  try {
    fs.accessSync(target);
    return true;
  } catch {
    return false;
  }
}

export async function pathExistsAsync(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

export function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
  return target;
}

export async function ensureDirAsync(target) {
  await fsp.mkdir(target, { recursive: true });
  return target;
}

export function readJsonSync(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw new AppError('READ_JSON_FAILED', `无法读取 JSON 文件：${file}`, {
      cause: error,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw new AppError('READ_JSON_FAILED', `无法读取 JSON 文件：${file}`, {
      cause: error,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Atomic UTF-8 write. Keeps the previous file intact until the rename. */
export async function writeTextAtomic(file, text) {
  await ensureDirAsync(path.dirname(file));
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const handle = await fsp.open(temp, 'w');
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fsp.rename(temp, file);
  } catch (error) {
    await fsp.rm(temp, { force: true });
    throw error;
  }
}

export async function writeJsonAtomic(file, value) {
  await writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeJsonAtomicSync(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

/**
 * Copy `file` into `backupDir` with a timestamped name, then prune old files.
 * Returns the backup path, or null when the source does not exist.
 */
export function backupFileSync(file, backupDir, prefix = path.basename(file, path.extname(file)), keep = 30) {
  if (!pathExists(file)) return null;
  ensureDir(backupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = path.extname(file);
  const target = path.join(backupDir, `${prefix}-${stamp}${ext}`);
  fs.copyFileSync(file, target);
  const entries = fs.readdirSync(backupDir)
    .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(ext))
    .map((name) => ({ name, mtime: fs.statSync(path.join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const entry of entries.slice(Math.max(1, keep))) {
    fs.rmSync(path.join(backupDir, entry.name), { force: true });
  }
  return target;
}

export function isSubPath(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * A tiny cross-process lock based on exclusive file creation.
 * Critical sections here never take longer than a file write, so a 20s
 * stale timeout is intentionally conservative.
 */
export async function withFileLock(lockFile, fn, { timeoutMs = 8_000, staleMs = 20_000 } = {}) {
  await ensureDirAsync(path.dirname(lockFile));
  const started = Date.now();
  let handle;
  while (!handle) {
    try {
      handle = await fsp.open(lockFile, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }), 'utf8');
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const stat = await fsp.stat(lockFile);
        if (Date.now() - stat.mtimeMs > staleMs) {
          await fsp.rm(lockFile, { force: true });
          continue;
        }
      } catch {
        // The lock disappeared between open and stat: retry immediately.
      }
      if (Date.now() - started > timeoutMs) {
        throw new AppError('PROFILE_LOCKED', '配置文件正在被其他操作修改，请稍后重试。', {
          details: lockFile,
          retryable: true,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 80 + Math.floor(Math.random() * 80)));
    }
  }
  try {
    return await fn();
  } finally {
    await handle.close().catch(() => {});
    await fsp.rm(lockFile, { force: true }).catch(() => {});
  }
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function assertSafeSlug(slug) {
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) {
    throw new AppError('INVALID_SLUG', '标识只能包含小写字母、数字和短横线，长度 2–49。', { details: slug });
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(slug)) {
    throw new AppError('INVALID_SLUG', '这个标识是 Windows 保留名，请换一个。', { details: slug });
  }
  return slug;
}

export function fileMtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

export function directorySize(dir, maxEntries = 20_000) {
  let total = 0;
  let count = 0;
  const stack = [dir];
  while (stack.length && count < maxEntries) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      count += 1;
      if (count > maxEntries) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        try { total += fs.statSync(full).size; } catch {}
      }
    }
  }
  return total;
}
