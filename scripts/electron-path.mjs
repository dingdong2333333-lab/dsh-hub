import fs from 'node:fs';
import path from 'node:path';

/**
 * Accept either an unpacked Electron directory or the executable itself.
 * Returns an absolute executable path, or '' when it cannot be resolved.
 */
export function resolveElectronBinary(value) {
  if (!value) return '';
  const candidate = path.resolve(value);
  try {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) return candidate;
    if (stat.isDirectory()) {
      for (const name of ['electron.exe', 'electron']) {
        const file = path.join(candidate, name);
        if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
      }
    }
  } catch {
    // Fall through to the not-found result.
  }
  return '';
}

export function findElectronBinary({ root, includeRelease = false } = {}) {
  const candidates = [
    process.env.ELECTRON_BIN,
    path.join(root, 'node_modules', 'electron', 'dist'),
    path.join(root, '..', '.tmp', 'electron-install', 'node_modules', 'electron', 'dist'),
  ].filter(Boolean);
  if (includeRelease) {
    candidates.push(path.join(root, 'release'));
  }
  for (const candidate of candidates) {
    const resolved = resolveElectronBinary(candidate);
    if (resolved) return resolved;
  }
  return '';
}
