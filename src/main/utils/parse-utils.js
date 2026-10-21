import path from 'node:path';

/** Escape a string for safe insertion into HTML text and quoted attributes. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Strip terminal control sequences from CLI output before logging. */
export function stripAnsi(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

/** Mask credentials in any string that may reach a log file or diagnostics. */
export function redactSecrets(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof text !== 'string') return String(value);
  text = text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/(x-api-key|authorization|api[_-]?key|token|secret)(["']?\s*[:=]\s*["']?)([^\s"',}]+)/gi, '$1$2***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***');
  return text;
}

export function truncate(value, max = 200) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Parse Markdown-ish YAML frontmatter without a YAML dependency.
 * Supports the scalar shapes that SKILL.md files use in practice.
 */
export function parseFrontmatter(markdown) {
  const text = String(markdown ?? '').replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text, rawFrontmatter: '' };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const item = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (!item) continue;
    const [, key, raw] = item;
    let value = raw.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null') value = null;
    data[key] = value;
  }
  return { data, body: text.slice(match[0].length), rawFrontmatter: match[1] };
}

/** Parse the `refs:` map in DSH's .credentials.yaml (plaintext on supported builds). */
export function parseCredentialRefs(yamlText, wantedKey) {
  const lines = String(yamlText ?? '').split(/\r?\n/);
  let inRefs = false;
  let refsIndent = 0;
  const refs = {};
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (!inRefs) {
      if (/^refs\s*:\s*$/.test(line.trimEnd())) {
        inRefs = true;
        refsIndent = indent;
      }
      continue;
    }
    if (indent <= refsIndent) break;
    const match = /^\s+([A-Za-z0-9_./-]+)\s*:\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let [, key, value] = match;
    value = value.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    refs[key] = value;
  }
  return wantedKey ? refs[wantedKey] : refs;
}

/**
 * Pull the first complete JSON object out of a model response.
 * Handles code fences and short prose around the object.
 */
export function extractJsonObject(input) {
  let text = String(input ?? '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = text.indexOf('{');
  if (start < 0) throw new SyntaxError('No JSON object found');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new SyntaxError('Unterminated JSON object');
}

/** Decode a DSH-encoded workspace folder name when possible. */
export function decodeWorkspaceFolder(folder) {
  if (!folder) return '';
  let text = folder.replace(/^--/, '').replace(/--$/, '');
  text = text.replace(/~([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  text = text.replace(/^([A-Za-z])-/, '$1:/');
  return text.replace(/-/g, path.sep);
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {}
  return '';
}

export function formatDateTime(value, locale = 'zh-CN') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function relativeTime(value) {
  const date = new Date(value).getTime();
  if (!Number.isFinite(date)) return '未知';
  const delta = Date.now() - date;
  if (delta < 60_000) return '刚刚';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  if (delta < 2_592_000_000) return `${Math.floor(delta / 86_400_000)} 天前`;
  return formatDateTime(value);
}

export function initials(name) {
  let text = String(name || '?');
  const slash = text.lastIndexOf('/');
  if (slash >= 0) text = text.slice(slash + 1);
  text = text.replace(/^dsh[-_]?/i, '').trim();
  const parts = text.split(/[^A-Za-z0-9\u4e00-\u9fff]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  const cleaned = text.replace(/[^A-Za-z0-9\u4e00-\u9fff]/g, '');
  return (cleaned.slice(0, 2) || '?').toUpperCase();
}

export function hueFor(name) {
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}
