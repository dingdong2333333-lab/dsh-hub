import fs from 'node:fs';
import path from 'node:path';

import { AppError } from '../utils/errors.js';
import {
  assertSafeSlug,
  backupFileSync,
  ensureDir,
  isSubPath,
  pathExists,
  readJsonSync,
  withFileLock,
  writeTextAtomic,
} from '../utils/fs-utils.js';
import { parseFrontmatter, truncate } from '../utils/parse-utils.js';

/**
 * Skills are folders containing a SKILL.md. User skills are editable; the
 * Office skills shipped with DSH are surfaced read-only for discoverability.
 */
export class SkillService {
  constructor({ profileService, logger, dataDir }) {
    this.profileService = profileService;
    this.logger = logger.child('skills');
    this.dataDir = dataDir;
  }

  getUserRoot() {
    return path.join(this.profileService.getDshHome(), 'skills');
  }

  getRoots() {
    const roots = [{ root: this.getUserRoot(), source: 'user', label: '我的 Skill', editable: true }];
    const install = this.profileService.getInstall();
    if (install.officeSkillsDir) {
      roots.push({ root: install.officeSkillsDir, source: 'office', label: 'DSH 内置 Office', editable: false });
    }
    return roots;
  }

  async list() {
    const skills = [];
    const warnings = [];
    for (const rootInfo of this.getRoots()) {
      if (!pathExists(rootInfo.root)) continue;
      let entries;
      try { entries = fs.readdirSync(rootInfo.root, { withFileTypes: true }); } catch (error) {
        warnings.push({ root: rootInfo.root, error: error.message });
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const file = path.join(rootInfo.root, entry.name, 'SKILL.md');
        if (!pathExists(file)) continue;
        try {
          const stat = fs.statSync(file);
          const head = readHead(file, 24_000);
          const parsed = parseFrontmatter(head);
          const name = String(parsed.data.name || entry.name);
          const description = String(parsed.data.description || firstParagraph(parsed.body) || '');
          skills.push({
            key: `${rootInfo.source}:${entry.name}`,
            slug: entry.name,
            name,
            description,
            source: rootInfo.source,
            sourceLabel: rootInfo.label,
            editable: rootInfo.editable,
            path: file,
            dir: path.dirname(file),
            size: stat.size,
            mtime: stat.mtimeMs,
            allowedTools: parsed.data['allowed-tools'] || parsed.data.allowed_tools || '',
            license: parsed.data.license || '',
          });
        } catch (error) {
          warnings.push({ path: file, error: error.message });
        }
      }
    }
    skills.sort((a, b) => {
      if (a.editable !== b.editable) return a.editable ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    return {
      roots: this.getRoots().map(({ root, source, label, editable }) => ({ root, source, label, editable })),
      stats: {
        total: skills.length,
        user: skills.filter((item) => item.source === 'user').length,
        builtin: skills.filter((item) => !item.editable).length,
      },
      skills,
      warnings,
    };
  }

  resolve(key) {
    const raw = String(key || '');
    const separator = raw.indexOf(':');
    if (separator < 1) throw new AppError('INVALID_SKILL', 'Skill 标识不合法。');
    const source = raw.slice(0, separator);
    const slug = raw.slice(separator + 1);
    assertSafeSlug(slug);
    const rootInfo = this.getRoots().find((item) => item.source === source);
    if (!rootInfo) throw new AppError('SKILL_NOT_FOUND', '没有找到这个 Skill。');
    const dir = path.join(rootInfo.root, slug);
    const file = path.join(dir, 'SKILL.md');
    if (!pathExists(file)) throw new AppError('SKILL_NOT_FOUND', '没有找到这个 Skill。');
    return { ...rootInfo, slug, dir, file, key: raw };
  }

  async detail(key) {
    const resolved = this.resolve(key);
    const stat = fs.statSync(resolved.file);
    if (stat.size > 2 * 1024 * 1024) {
      throw new AppError('SKILL_TOO_LARGE', '这个 SKILL.md 超过 2 MB，暂不支持在编辑器里打开。');
    }
    const content = fs.readFileSync(resolved.file, 'utf8');
    const parsed = parseFrontmatter(content);
    return {
      key: resolved.key,
      slug: resolved.slug,
      source: resolved.source,
      sourceLabel: resolved.label,
      editable: resolved.editable,
      path: resolved.file,
      dir: resolved.dir,
      size: stat.size,
      mtime: stat.mtimeMs,
      content,
      frontmatter: parsed.data,
      body: parsed.body,
      name: String(parsed.data.name || resolved.slug),
      description: String(parsed.data.description || firstParagraph(parsed.body) || ''),
    };
  }

  async save(key, content) {
    const resolved = this.resolve(key);
    if (!resolved.editable) throw new AppError('READ_ONLY_SKILL', '内置 Skill 是只读的，可以复制一份再修改。');
    if (typeof content !== 'string') throw new AppError('INVALID_SKILL', 'Skill 内容必须是文本。');
    if (content.length > 1_500_000) throw new AppError('SKILL_TOO_LARGE', 'SKILL.md 不能超过 1.5 MB。');
    const parsed = parseFrontmatter(content);
    if (!parsed.data.name) throw new AppError('INVALID_SKILL', 'SKILL.md 的 frontmatter 必须包含 name。');
    if (!parsed.data.description) throw new AppError('INVALID_SKILL', 'SKILL.md 的 frontmatter 必须包含 description。');
    const lock = path.join(this.dataDir, 'locks', `skill-${resolved.slug}.lock`);
    return withFileLock(lock, async () => {
      backupFileSync(resolved.file, path.join(this.dataDir, 'backups', 'skills'), resolved.slug, 30);
      await writeTextAtomic(resolved.file, content);
      this.logger.info('Skill saved', { slug: resolved.slug, chars: content.length });
      return this.detail(key);
    });
  }

  async create({ slug, name, description, body }) {
    const safeSlug = assertSafeSlug(String(slug || '').trim().toLowerCase());
    const root = this.getUserRoot();
    ensureDir(root);
    const dir = path.join(root, safeSlug);
    if (pathExists(dir)) throw new AppError('SKILL_EXISTS', `Skill 目录已经存在：${safeSlug}`);
    const cleanName = String(name || '').trim();
    const cleanDescription = String(description || '').trim();
    if (!cleanName) throw new AppError('INVALID_SKILL', '请填写 Skill 名称。');
    if (!cleanDescription) throw new AppError('INVALID_SKILL', '请填写 Skill 描述。');
    const markdown = buildSkillMarkdown({ slug: safeSlug, name: cleanName, description: cleanDescription, body });
    await writeTextAtomic(path.join(dir, 'SKILL.md'), markdown);
    this.logger.info('Skill created', { slug: safeSlug, name: cleanName });
    return this.detail(`user:${safeSlug}`);
  }

  async duplicate(key, targetSlug) {
    const original = await this.detail(key);
    const slug = assertSafeSlug(String(targetSlug || '').trim().toLowerCase());
    const dir = path.join(this.getUserRoot(), slug);
    if (pathExists(dir)) throw new AppError('SKILL_EXISTS', `Skill 目录已经存在：${slug}`);
    let content = original.content;
    const parsed = parseFrontmatter(content);
    const name = `${parsed.data.name || original.name} 副本`;
    content = content.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (match, frontmatter) => {
      let next = frontmatter;
      if (/^name\s*:/m.test(next)) next = next.replace(/^name\s*:.*$/m, `name: ${name}`);
      else next = `name: ${name}\n${next}`;
      return `---\n${next}\n---`;
    });
    await writeTextAtomic(path.join(dir, 'SKILL.md'), content);
    this.logger.info('Skill duplicated', { from: key, slug });
    return this.detail(`user:${slug}`);
  }

  async delete(key, trashItem) {
    const resolved = this.resolve(key);
    if (!resolved.editable) throw new AppError('READ_ONLY_SKILL', '内置 Skill 不能删除。');
    if (!isSubPath(this.getUserRoot(), resolved.dir)) {
      throw new AppError('UNSAFE_PATH', '拒绝删除 Skill 目录以外的内容。');
    }
    if (typeof trashItem !== 'function') throw new AppError('TRASH_UNAVAILABLE', '当前环境不支持移动到回收站。');
    await trashItem(resolved.dir);
    this.logger.info('Skill moved to trash', { key, dir: resolved.dir });
    return { key, dir: resolved.dir };
  }

  getRevealPath(key) {
    return this.resolve(key).file;
  }
}

function readHead(file, bytes) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buffer, 0, bytes, 0);
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function firstParagraph(body) {
  const lines = String(body || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('```')) continue;
    return truncate(trimmed.replace(/^[-*]\s+/, ''), 280);
  }
  return '';
}

function buildSkillMarkdown({ slug, name, description, body }) {
  const cleanBody = String(body || '').trim() || `# ${name}\n\n## 使用场景\n\n- 描述什么时候使用这个 Skill。\n\n## 步骤\n\n1. 第一步\n2. 第二步\n`;
  return `---\nname: ${name.replace(/\n/g, ' ')}\ndescription: ${description.replace(/\n/g, ' ')}\n---\n\n${cleanBody}\n`;
}

export { firstParagraph, buildSkillMarkdown };
