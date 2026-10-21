import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { AppError } from '../utils/errors.js';
import { isSubPath } from '../utils/fs-utils.js';
import { decodeWorkspaceFolder, truncate } from '../utils/parse-utils.js';

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const CACHE_LIMIT = 3_000;

/**
 * Read concatenated zstd frames used by DSH session logs. Node's zstd API
 * decodes one frame per call, while DSH appends one frame per batch.
 */
export function decodeZstdFrames(buffer, { maxFrames = 20_000 } = {}) {
  const positions = [];
  let from = 0;
  while (positions.length < maxFrames) {
    const index = buffer.indexOf(ZSTD_MAGIC, from);
    if (index < 0) break;
    positions.push(index);
    from = index + 4;
  }
  const chunks = [];
  for (let index = 0; index < positions.length; index += 1) {
    const start = positions[index];
    const end = positions[index + 1] ?? buffer.length;
    try {
      const chunk = zlib.zstdDecompressSync(buffer.subarray(start, end));
      if (chunk.length) chunks.push(chunk);
    } catch {
      // A false positive magic inside compressed bytes is harmless; skip it.
    }
  }
  return Buffer.concat(chunks);
}

export class SessionService {
  constructor({ settings, profileService, logger }) {
    this.settings = settings;
    this.profileService = profileService;
    this.logger = logger.child('sessions');
    this.cache = new Map();
  }

  getRoot() {
    return path.join(this.profileService.getDshHome(), 'sessions');
  }

  discoverFiles() {
    const root = this.getRoot();
    const files = [];
    const walk = (dir, depth) => {
      if (depth > 4) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, depth + 1);
        else if (entry.isFile() && /^session.*\.jsonl\.zstd$/i.test(entry.name)) files.push(full);
      }
    };
    walk(root, 0);
    return files;
  }

  async list({ force = false } = {}) {
    const root = this.getRoot();
    const files = this.discoverFiles();
    const sessions = [];
    const currentPaths = new Set(files);
    for (const [key] of this.cache) {
      if (!currentPaths.has(key)) this.cache.delete(key);
    }
    for (const file of files) {
      let stat;
      try { stat = fs.statSync(file); } catch { continue; }
      const cached = this.cache.get(file);
      if (!force && cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) {
        sessions.push({ ...cached.summary, path: file });
        continue;
      }
      try {
        const summary = parseSummary(file, stat);
        this.cache.set(file, { mtime: stat.mtimeMs, size: stat.size, summary });
        sessions.push({ ...summary, path: file });
      } catch (error) {
        this.logger.warn('Unable to parse session file', { file, error: error.message });
        sessions.push({
          id: path.basename(path.dirname(file)),
          key: file,
          path: file,
          title: '无法读取的会话',
          workspace: '',
          createdAt: stat.birthtimeMs || stat.mtimeMs,
          updatedAt: stat.mtimeMs,
          size: stat.size,
          source: 'unknown',
          agentPreset: '',
          error: error.message,
        });
      }
    }
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    const totalSize = sessions.reduce((sum, item) => sum + (item.size || 0), 0);
    const workspaces = [...new Set(sessions.map((item) => item.workspace).filter(Boolean))];
    const channels = [...new Set(sessions.map((item) => item.source).filter(Boolean))];
    return {
      root,
      stats: {
        total: sessions.length,
        totalSize,
        workspaces: workspaces.length,
        channels,
        newest: sessions[0]?.updatedAt || null,
      },
      sessions: sessions.map((item) => ({ ...item, key: item.path })),
    };
  }

  resolveById(sessionId) {
    const raw = String(sessionId || '');
    if (!raw || raw.length > 500) throw new AppError('INVALID_SESSION', '会话标识不合法。');
    const files = this.discoverFiles();
    const root = this.getRoot();
    let match = files.find((file) => path.basename(path.dirname(file)) === raw);
    if (!match && /^session-[0-9a-f-]+$/i.test(raw)) {
      match = files.find((file) => path.basename(file).includes(raw));
    }
    if (!match) {
      // Allow the UI to pass a full path, but only inside the sessions root.
      const candidate = path.resolve(raw);
      if (candidate.startsWith(path.resolve(root)) && files.includes(candidate)) match = candidate;
    }
    if (!match) throw new AppError('SESSION_NOT_FOUND', '没有找到这个会话，可能已经被删除。');
    return { file: match, dir: path.dirname(match), id: path.basename(path.dirname(match)) };
  }

  async detail(sessionId) {
    const resolved = this.resolveById(sessionId);
    const stat = fs.statSync(resolved.file);
    if (stat.size > 50 * 1024 * 1024) {
      throw new AppError('SESSION_TOO_LARGE', '这个会话日志超过 50 MB，为避免卡顿暂不加载完整预览。', {
        details: resolved.file,
      });
    }
    const buffer = fs.readFileSync(resolved.file);
    const text = decodeZstdFrames(buffer).toString('utf8');
    const events = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {}
    }
    const sessionEvent = events.find((event) => event.type === 'session');
    const header = sessionEvent?.data || sessionEvent || {};
    const titleEvent = [...events].reverse().find((event) => event.type === 'session/title');
    const messages = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let hiddenContextCount = 0;
    for (const event of events) {
      if (event.type === 'user/message') {
        const message = event.data;
        const source = message?.source?.kind || 'user';
        if (isContextSource(source)) {
          hiddenContextCount += 1;
          continue;
        }
        const textContent = extractContentText(message?.content);
        if (textContent) {
          messages.push({
            role: 'user',
            text: textContent.slice(0, 30_000),
            time: event.time,
            source,
          });
        }
      } else if (event.type === 'assistant/message') {
        const message = event.data?.message;
        const textContent = extractContentText(message?.content);
        const toolCalls = Array.isArray(message?.content)
          ? message.content.filter((block) => block.type === 'tool-call').map((block) => block.name).filter(Boolean)
          : [];
        if (textContent || toolCalls.length) {
          messages.push({
            role: 'assistant',
            text: textContent.slice(0, 30_000),
            time: event.time,
            toolCalls,
            model: message?.source?.model || '',
          });
        }
        const usage = event.data?.usage;
        if (usage) {
          inputTokens += Number(usage.inputTokens) || 0;
          outputTokens += Number(usage.outputTokens) || 0;
          totalTokens += Number(usage.totalTokens) || 0;
        }
      }
    }
    return {
      id: resolved.id,
      title: titleEvent?.data?.title || deriveTitle(messages) || resolved.id,
      createdAt: header.createdAt || stat.birthtimeMs || stat.mtimeMs,
      updatedAt: stat.mtimeMs,
      cwd: header.cwd || '',
      agentPreset: header.agentPreset || '',
      size: stat.size,
      path: resolved.file,
      dir: resolved.dir,
      source: inferSource(path.basename(path.dirname(resolved.dir))),
      messages: messages.slice(-400),
      messageCount: messages.length,
      usage: { inputTokens, outputTokens, totalTokens },
      titleSource: titleEvent?.data?.source?.kind || '',
      hiddenContextCount,
    };
  }

  async exportSession(sessionId) {
    const resolved = this.resolveById(sessionId);
    const detail = await this.detail(sessionId);
    const buffer = decodeZstdFrames(fs.readFileSync(resolved.file));
    const safeTitle = (detail.title || 'session').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 60);
    const date = new Date(detail.createdAt || Date.now()).toISOString().slice(0, 10);
    return {
      content: buffer.toString('utf8'),
      suggestedName: `${date}-${safeTitle}.jsonl`,
      source: resolved.file,
    };
  }

  async trashSession(sessionId, trashItem) {
    const resolved = this.resolveById(sessionId);
    const root = path.resolve(this.getRoot());
    if (!isSubPath(root, resolved.dir)) {
      throw new AppError('UNSAFE_PATH', '拒绝删除 sessions 目录以外的内容。');
    }
    if (typeof trashItem !== 'function') {
      throw new AppError('TRASH_UNAVAILABLE', '当前环境不支持移动到回收站。');
    }
    await trashItem(resolved.dir);
    this.cache.delete(resolved.file);
    this.logger.info('Session moved to trash', { id: resolved.id, dir: resolved.dir });
    return { id: resolved.id, dir: resolved.dir };
  }

  getRevealPath(sessionId) {
    return this.resolveById(sessionId).file;
  }
}

function parseSummary(file, stat) {
  const readSize = Math.min(stat.size, 1_500_000);
  const buffer = Buffer.alloc(readSize);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buffer, 0, readSize, 0);
  } finally {
    fs.closeSync(fd);
  }
  const text = decodeZstdFrames(buffer).toString('utf8');
  let header = {};
  let title = '';
  let titleSource = '';
  let firstPrompt = '';
  let agentPreset = '';
  let eventCount = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    eventCount += 1;
    if (event.type === 'session') {
      header = event.data || event;
      agentPreset = header.agentPreset || agentPreset;
    } else if (event.type === 'session/title') {
      if (event.data?.title) {
        title = event.data.title;
        titleSource = event.data.source?.kind || '';
      }
    } else if (event.type === 'user/message' && !firstPrompt) {
      if (!isContextSource(event.data?.source?.kind)) {
        firstPrompt = extractContentText(event.data?.content).slice(0, 500);
      }
    } else if (event.type === 'agent/inbox/spliced' && !firstPrompt) {
      const inserted = event.data?.inserted;
      if (Array.isArray(inserted)) {
        for (const message of inserted) {
          if (message?.role !== 'user' || isContextSource(message?.source?.kind)) continue;
          const content = extractContentText(message.content);
          if (content) { firstPrompt = content.slice(0, 500); break; }
        }
      }
    }
  }
  const workspace = header.cwd || decodeWorkspaceFolder(path.basename(path.dirname(path.dirname(file))));
  return {
    id: header.id || path.basename(path.dirname(file)),
    title: title || truncate(firstPrompt, 44) || '未命名会话',
    titleSource,
    firstPrompt,
    workspace,
    workspaceName: workspace ? path.basename(workspace) || workspace : '',
    createdAt: header.createdAt || stat.birthtimeMs || stat.mtimeMs,
    updatedAt: stat.mtimeMs,
    size: stat.size,
    agentPreset: agentPreset || header.agentPreset || '',
    source: inferSource(path.basename(path.dirname(path.dirname(file)))),
    eventCount,
  };
}

function extractContentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block && (block.type === 'text' || block.type === 'input_text') && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function deriveTitle(messages) {
  const first = messages.find((message) => message.role === 'user')?.text || '';
  return truncate(first.replace(/\s+/g, ' ').trim(), 44);
}

function isContextSource(kind) {
  return /(?:^|:)(runtime-context|time-context|skill-catalog|user-approval|system|developer|environment)(?:$|:)/i.test(String(kind || ''));
}

function inferSource(folder) {
  const name = String(folder || '').toLowerCase();
  if (name.includes('dsh_wechat')) return '微信';
  if (name.includes('dsh-im')) return 'IM';
  if (name.includes('dsh_orb')) return 'Orb';
  if (name.includes('dsh-pocket')) return 'Pocket';
  if (name.includes('default-workspace')) return 'Desktop';
  return 'Desktop';
}

export { parseSummary, extractContentText };
