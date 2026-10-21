import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { ensureDir, readJsonSync, writeJsonAtomicSync } from '../utils/fs-utils.js';
import { redactSecrets, stripAnsi } from '../utils/parse-utils.js';

const LEVELS = ['debug', 'info', 'warn', 'error'];
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_LOG_FILES = 6;

/**
 * Crash-first logging. All writes are synchronous and append-only: when the
 * process is dying, an async queue would lose exactly the lines we need.
 */
export class Logger {
  constructor({ dataDir, appVersion = '0.1.0', console = globalThis.console }) {
    this.dataDir = dataDir;
    this.appVersion = appVersion;
    this.console = console;
    this.logsDir = path.join(dataDir, 'logs');
    this.crashesDir = path.join(dataDir, 'crashes');
    this.runFile = path.join(dataDir, '.running.json');
    this.lastExitFile = path.join(dataDir, '.last-exit.json');
    this.currentLog = path.join(this.logsDir, 'app.log');
    this.previousRun = null;
    this.startedAt = Date.now();
    this.rendererErrorAt = new Map();
    this.initialized = false;
  }

  init() {
    if (this.initialized) return this;
    ensureDir(this.logsDir);
    ensureDir(this.crashesDir);
    this.initialized = true;
    this.detectPreviousRun();
    writeJsonAtomicSync(this.runFile, {
      pid: process.pid,
      startedAt: this.startedAt,
      appVersion: this.appVersion,
      platform: process.platform,
      versions: { electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome },
    });
    this.info('lifecycle', 'DSH Hub started', {
      version: this.appVersion,
      pid: process.pid,
      dataDir: this.dataDir,
      previousRun: this.previousRun ? this.previousRun.summary : null,
    });
    return this;
  }

  detectPreviousRun() {
    if (!fs.existsSync(this.runFile)) return;
    const previous = readJsonSync(this.runFile, null);
    if (!previous) {
      fs.rmSync(this.runFile, { force: true });
      return;
    }
    let alive = false;
    if (Number.isInteger(previous.pid) && previous.pid !== process.pid) {
      try {
        process.kill(previous.pid, 0);
        alive = true;
      } catch {}
    }
    if (alive) {
      this.info('lifecycle', 'Another DSH Hub instance appears to be running', { pid: previous.pid });
      return;
    }
    this.previousRun = {
      ...previous,
      summary: '上次运行没有正常退出',
    };
    writeJsonAtomicSync(this.lastExitFile, {
      clean: false,
      detectedAt: Date.now(),
      previous,
    });
    this.createCrashReport({
      type: 'unclean-shutdown',
      title: '上次运行没有正常退出',
      detail: 'DSH Hub 没有写入正常退出标记。可能发生了主进程崩溃、强制结束或系统断电。',
      extra: { previousRun: previous, logTail: this.tailInternal(this.currentLog, 120) },
    });
  }

  markCleanExit(reason = 'app-quit') {
    try {
      writeJsonAtomicSync(this.lastExitFile, {
        clean: true,
        at: Date.now(),
        reason,
        pid: process.pid,
        uptimeMs: Date.now() - this.startedAt,
      });
      fs.rmSync(this.runFile, { force: true });
      this.info('lifecycle', 'DSH Hub exited cleanly', { reason, uptimeMs: Date.now() - this.startedAt });
    } catch (error) {
      this.console.error('Failed to write clean-exit marker', error);
    }
  }

  rotateIfNeeded() {
    try {
      if (!fs.existsSync(this.currentLog)) return;
      if (fs.statSync(this.currentLog).size < MAX_LOG_BYTES) return;
      for (let index = MAX_LOG_FILES - 1; index >= 1; index -= 1) {
        const from = index === 1 ? this.currentLog : path.join(this.logsDir, `app.${index - 1}.log`);
        const to = path.join(this.logsDir, `app.${index}.log`);
        if (fs.existsSync(from)) fs.renameSync(from, to);
      }
    } catch {
      // Rotation must never take the app down.
    }
  }

  write(level, scope, message, meta) {
    const line = this.formatLine(level, scope, message, meta);
    try {
      ensureDir(this.logsDir);
      this.rotateIfNeeded();
      fs.appendFileSync(this.currentLog, `${line}\n`, 'utf8');
    } catch (error) {
      this.console.error('DSH Hub log write failed:', error);
    }
    if (level === 'error') this.console.error(line);
    else if (level === 'warn') this.console.warn(line);
    else if (process.env.DSH_HUB_VERBOSE === '1') this.console.log(line);
    return line;
  }

  formatLine(level, scope, message, meta) {
    const safeMessage = stripAnsi(message);
    let suffix = '';
    if (meta !== undefined) {
      try {
        suffix = ` ${redactSecrets(JSON.stringify(meta))}`;
      } catch {
        suffix = ' {"meta":"unserializable"}';
      }
    }
    return `${new Date().toISOString()} [${String(level).toUpperCase()}] [${scope}] ${redactSecrets(safeMessage)}${suffix}`;
  }

  debug(scope, message, meta) { return this.write('debug', scope, message, meta); }
  info(scope, message, meta) { return this.write('info', scope, message, meta); }
  warn(scope, message, meta) { return this.write('warn', scope, message, meta); }
  error(scope, message, meta) { return this.write('error', scope, message, meta); }

  child(scope) {
    return {
      debug: (message, meta) => this.debug(scope, message, meta),
      info: (message, meta) => this.info(scope, message, meta),
      warn: (message, meta) => this.warn(scope, message, meta),
      error: (message, meta) => this.error(scope, message, meta),
    };
  }

  async operation(scope, message, meta, fn) {
    const operationId = crypto.randomUUID().slice(0, 8);
    const started = Date.now();
    this.debug(scope, `${message} · start`, { operationId, ...meta });
    try {
      const result = await fn();
      this.info(scope, `${message} · ok`, { operationId, durationMs: Date.now() - started });
      return result;
    } catch (error) {
      this.error(scope, `${message} · failed`, {
        operationId,
        durationMs: Date.now() - started,
        error: serializeError(error),
      });
      throw error;
    }
  }

  serializeError(error) {
    return serializeError(error);
  }

  tailInternal(file, lines = 200) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      return text.split(/\r?\n/).filter(Boolean).slice(-lines).join('\n');
    } catch {
      return '';
    }
  }

  listLogs() {
    const files = [];
    for (const name of fs.readdirSync(this.logsDir).filter((entry) => entry.endsWith('.log'))) {
      const full = path.join(this.logsDir, name);
      try {
        const stat = fs.statSync(full);
        files.push({ name, path: full, size: stat.size, mtime: stat.mtimeMs });
      } catch {}
    }
    return files.sort((a, b) => b.mtime - a.mtime);
  }

  tail(name = 'app.log', lines = 300) {
    const safeName = path.basename(String(name || 'app.log'));
    if (!/^[\w.-]+\.log$/.test(safeName)) {
      return { name: safeName, text: '', error: '日志文件名不合法' };
    }
    const file = path.join(this.logsDir, safeName);
    return { name: safeName, path: file, text: this.tailInternal(file, Math.min(Math.max(Number(lines) || 300, 10), 2_000)) };
  }

  clearLogs() {
    let removed = 0;
    for (const entry of fs.readdirSync(this.logsDir)) {
      if (!entry.endsWith('.log')) continue;
      fs.rmSync(path.join(this.logsDir, entry), { force: true });
      removed += 1;
    }
    this.info('lifecycle', 'Log files cleared', { removed });
    return { removed };
  }

  createCrashReport({ type = 'error', title, detail, error, scope = 'app', extra = {} }) {
    ensureDir(this.crashesDir);
    const now = new Date();
    const id = `${now.toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
    const report = {
      id,
      type,
      title: title || '未处理的异常',
      detail: detail || '',
      scope,
      at: now.toISOString(),
      appVersion: this.appVersion,
      process: {
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        versions: {
          electron: process.versions.electron,
          node: process.versions.node,
          chrome: process.versions.chrome,
          v8: process.versions.v8,
        },
        memory: safeMemoryUsage(),
        uptimeSec: Math.round(process.uptime()),
        cwd: process.cwd(),
        execPath: process.execPath,
      },
      error: error ? serializeError(error) : undefined,
      extra,
      logTail: this.tailInternal(this.currentLog, 250),
    };
    const file = path.join(this.crashesDir, `crash-${id}.json`);
    try {
      writeJsonAtomicSync(file, report);
      this.write('error', scope, `Crash report written: ${title}`, { id, file });
    } catch (writeError) {
      this.console.error('Failed to write crash report', writeError);
    }
    return { ...report, file };
  }

  listCrashes() {
    if (!fs.existsSync(this.crashesDir)) return [];
    return fs.readdirSync(this.crashesDir)
      .filter((name) => /^crash-.*\.json$/.test(name))
      .map((name) => {
        const full = path.join(this.crashesDir, name);
        const data = readJsonSync(full, null);
        return {
          id: data?.id || name,
          file: full,
          name,
          type: data?.type || 'unknown',
          title: data?.title || name,
          at: data?.at || null,
          mtime: safeStatMtime(full),
          size: safeStatSize(full),
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
  }

  readCrash(idOrName) {
    const safe = path.basename(String(idOrName || ''));
    const fileName = safe.endsWith('.json') ? safe : `crash-${safe}.json`;
    const file = path.join(this.crashesDir, fileName);
    if (!file.startsWith(this.crashesDir)) throw new Error('Invalid crash id');
    return { file, report: readJsonSync(file) };
  }

  reportRendererError(payload = {}) {
    const key = `${payload.message || ''}:${payload.source || ''}:${payload.line || ''}`;
    const now = Date.now();
    const last = this.rendererErrorAt.get(key) || 0;
    if (now - last < 5_000) return { throttled: true };
    this.rendererErrorAt.set(key, now);
    this.error('renderer', payload.message || 'Renderer error', {
      source: payload.source,
      line: payload.line,
      column: payload.column,
      stack: payload.stack,
    });
    if (payload.fatal) {
      this.createCrashReport({
        type: 'renderer-error',
        title: '界面发生未捕获异常',
        detail: payload.message || 'Renderer error',
        scope: 'renderer',
        error: payload,
      });
    }
    return { throttled: false };
  }

  getPreviousRun() {
    if (!this.previousRun) return null;
    return {
      startedAt: this.previousRun.startedAt,
      pid: this.previousRun.pid,
      appVersion: this.previousRun.appVersion,
      summary: this.previousRun.summary,
    };
  }

  getBaseDiagnostics() {
    return {
      appVersion: this.appVersion,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      versions: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
        v8: process.versions.v8,
      },
      memory: safeMemoryUsage(),
      uptimeSec: Math.round(process.uptime()),
      dataDir: this.dataDir,
      logsDir: this.logsDir,
      crashesDir: this.crashesDir,
      logFiles: this.listLogs(),
      crashCount: this.listCrashes().length,
      previousRun: this.getPreviousRun(),
      hostname: os.hostname(),
    };
  }
}

export function serializeError(error) {
  if (!error) return undefined;
  if (typeof error === 'string') return { name: 'Error', message: redactSecrets(error) };
  return {
    name: error.name,
    code: error.code,
    message: redactSecrets(error.message || String(error)),
    stack: redactSecrets(error.stack || ''),
    details: error.details ? redactSecrets(JSON.stringify(error.details)) : undefined,
    cause: error.cause ? serializeError(error.cause) : undefined,
  };
}

function safeMemoryUsage() {
  try {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
    };
  } catch {
    return null;
  }
}

function safeStatMtime(file) {
  try { return fs.statSync(file).mtimeMs; } catch { return 0; }
}

function safeStatSize(file) {
  try { return fs.statSync(file).size; } catch { return 0; }
}

export { LEVELS };
