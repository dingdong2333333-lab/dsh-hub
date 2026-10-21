import { api, errorInfo } from '../api.js';
import {
  badge,
  confirmDialog,
  emptyState,
  escapeHtml,
  formatBytes,
  formatDate,
  icon,
  openDrawer,
  openModal,
  pageHeader,
  relativeTime,
  setButtonBusy,
  toast,
} from '../ui.js';
import { renderMarkdown } from '../markdown.js';

export async function render(main, ctx) {
  let data = await ctx.loadSkills();

  main.innerHTML = `<div class="page">
    ${pageHeader({
      kicker: 'SKILL LIBRARY',
      title: '技能库',
      subtitle: '查看和编辑 <code>~/.dsh/skills</code> 下的技能，内置 Office Skill 以只读方式展示。',
      actions: `
        <button class="btn btn-primary" data-action="create">${icon('plus', 15)}新建 Skill</button>
        <button class="btn" data-action="open-folder">${icon('folderOpen', 15)}打开目录</button>
        <button class="btn btn-icon btn-ghost" data-action="refresh" title="刷新">${icon('refresh', 16)}</button>`,
    })}
    <div class="row-between" style="margin-bottom:16px">
      <div class="row">
        ${badge(`${data.stats.total} 个 Skill`, 'accent')}
        ${badge(`${data.stats.user} 个我的`, 'success', true)}
        ${badge(`${data.stats.builtin} 个内置只读`)}
      </div>
      <span class="field-hint">Skill 通过 SKILL.md 的 frontmatter 描述自己</span>
    </div>
    <div class="toolbar">
      <div class="input-group" style="flex:1;max-width:340px">${icon('search', 15)}<input class="input" id="skill-search" placeholder="搜索 Skill 名称、描述…" autocomplete="off"></div>
      <select class="select" id="skill-source" style="width:auto;min-width:130px">
        <option value="all">全部来源</option>
        <option value="user">我的 Skill</option>
        <option value="office">内置 Office</option>
      </select>
      <span class="spacer"></span>
      <span class="field-hint" id="skill-count">${data.skills.length} 个</span>
    </div>
    <div id="skill-grid" class="skill-grid"></div>
  </div>`;

  const grid = main.querySelector('#skill-grid');
  const searchInput = main.querySelector('#skill-search');
  const sourceSelect = main.querySelector('#skill-source');
  let query = '';
  let source = 'all';

  const visible = () => data.skills.filter((skill) => {
    if (source !== 'all' && skill.source !== source) return false;
    if (!query) return true;
    return `${skill.name} ${skill.slug} ${skill.description}`.toLowerCase().includes(query);
  });

  const renderList = () => {
    const list = visible();
    main.querySelector('#skill-count').textContent = `${list.length} 个`;
    if (!list.length) {
      grid.innerHTML = emptyState({
        iconName: 'skills',
        title: '没有匹配的 Skill',
        description: '尝试搜索其他关键词，或者新建一个自己的 Skill。',
        action: '<button class="btn btn-sm" data-action="create-empty">新建 Skill</button>',
      });
      grid.querySelector('[data-action="create-empty"]')?.addEventListener('click', createSkill);
      return;
    }
    grid.innerHTML = list.map((skill) => `<article class="skill-card" data-skill="${escapeHtml(skill.key)}" tabindex="0" role="button">
      <div class="skill-card-top">
        <div class="skill-icon">${icon(skill.source === 'office' ? 'book' : 'skills', 17)}</div>
        <div style="min-width:0;flex:1">
          <div class="skill-name truncate">${escapeHtml(skill.name)}</div>
          <div class="skill-slug">${escapeHtml(skill.slug)}</div>
        </div>
        ${skill.editable ? badge('可编辑', 'success') : badge('只读', 'warning')}
      </div>
      <div class="skill-desc line-clamp-3">${escapeHtml(skill.description || '还没有描述。')}</div>
      <div class="skill-foot">
        <span class="meta">${escapeHtml(formatBytes(skill.size))}</span>
        <span class="meta">·</span>
        <span class="meta">${escapeHtml(relativeTime(skill.mtime))}</span>
        <div class="actions">
          <button class="btn btn-xs btn-ghost" data-skill-open="${escapeHtml(skill.key)}">${icon('edit', 12)}${skill.editable ? '编辑' : '查看'}</button>
        </div>
      </div>
    </article>`).join('');
    bindList();
  };

  const bindList = () => {
    grid.querySelectorAll('[data-skill]').forEach((card) => {
      const open = () => openSkill(card.dataset.skill, ctx, reload);
      card.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        open();
      });
      card.addEventListener('keydown', (event) => { if (event.key === 'Enter') open(); });
    });
    grid.querySelectorAll('[data-skill-open]').forEach((button) => button.addEventListener('click', () => openSkill(button.dataset.skillOpen, ctx, reload)));
  };

  const reload = async () => {
    data = await ctx.loadSkills(true);
    renderList();
    const stats = main.querySelector('.row-between .row');
    if (stats) stats.innerHTML = `${badge(`${data.stats.total} 个 Skill`, 'accent')} ${badge(`${data.stats.user} 个我的`, 'success', true)} ${badge(`${data.stats.builtin} 个内置只读`)}`;
  };

  const createSkill = async () => {
    const created = await openCreateSkill(ctx);
    if (created) {
      await reload();
      await openSkill(created.key, ctx, reload);
    }
  };

  searchInput.addEventListener('input', () => { query = searchInput.value.trim().toLowerCase(); renderList(); });
  sourceSelect.addEventListener('change', () => { source = sourceSelect.value; renderList(); });
  main.querySelector('[data-action="create"]')?.addEventListener('click', createSkill);
  main.querySelector('[data-action="refresh"]')?.addEventListener('click', async (event) => {
    setButtonBusy(event.currentTarget, true, '刷新');
    try { await reload(); toast('Skill 列表已刷新', 'success', { duration: 1600 }); }
    catch (error) { toast(errorInfo(error).message, 'error'); }
    finally { setButtonBusy(event.currentTarget, false); }
  });
  main.querySelector('[data-action="open-folder"]')?.addEventListener('click', () => {
    const path = ctx.state.boot?.paths?.skillsDir;
    if (path) ctx.openPath(path);
  });

  renderList();
  return () => {};
}

async function openSkill(key, ctx, onChanged) {
  let dirty = false;
  let editable = false;
  const drawer = openDrawer({
    title: 'Skill 详情',
    subtitle: key,
    wide: true,
    beforeClose: async () => {
      if (!dirty || !editable) return true;
      return confirmDialog({
        title: '放弃未保存的修改？',
        message: '当前 SKILL.md 还有未保存的修改。',
        confirmText: '放弃修改',
        tone: 'danger',
      });
    },
    body: '<div class="loading-block"><div class="spinner spinner-lg"></div><div>正在读取 SKILL.md…</div></div>',
    footer: '<span class="spacer"></span><button class="btn" data-close>关闭</button>',
  });
  let detail;
  try {
    detail = await api.skills.detail(key);
  } catch (error) {
    drawer.body.innerHTML = `<div class="empty"><div class="empty-icon" style="color:var(--danger)">${icon('alert', 22)}</div><div class="empty-title">无法读取 Skill</div><div class="empty-desc">${escapeHtml(errorInfo(error).message)}</div></div>`;
    return;
  }

  let content = detail.content;
  editable = Boolean(detail.editable);
  let mode = 'edit';
  drawer.drawer.querySelector('.drawer-title').textContent = detail.name;
  drawer.drawer.querySelector('.drawer-subtitle').textContent = `${key} · ${detail.path}`;
  drawer.body.innerHTML = `<div class="skill-source-note">
    ${icon(detail.editable ? 'edit' : 'shield', 15)}
    <div class="grow">${detail.editable ? '这是你自己的 Skill，可以直接编辑 SKILL.md。' : '这是 DSH 内置 Skill，只读。你可以复制一份到自己的 Skill 目录再修改。'}</div>
    ${detail.editable ? badge('可编辑', 'success') : badge('只读', 'warning')}
  </div>
  <div class="skill-editor-toolbar" style="margin-top:14px">
    <div class="segmented">
      <button type="button" data-mode="edit" class="active">${icon('code', 12)}编辑</button>
      <button type="button" data-mode="preview">${icon('eye', 12)}预览</button>
    </div>
    <span class="editor-dirty hidden" data-dirty>未保存</span>
    <span class="spacer"></span>
    <span class="field-hint">${escapeHtml(detail.description || '')}</span>
  </div>
  <div data-editor-wrap>
    <textarea class="textarea skill-editor mono" data-skill-editor spellcheck="false" ${detail.editable ? '' : 'readonly'}>${escapeHtml(detail.content)}</textarea>
  </div>
  <div class="meta-grid" style="margin-top:14px">
    <div class="meta-item"><div class="label">SOURCE</div><div class="value">${escapeHtml(detail.sourceLabel)}</div></div>
    <div class="meta-item"><div class="label">UPDATED</div><div class="value">${escapeHtml(formatDate(detail.mtime))}</div></div>
    <div class="meta-item"><div class="label">SIZE</div><div class="value">${formatBytes(detail.size)}</div></div>
    <div class="meta-item"><div class="label">FRONTMATTER</div><div class="value">${escapeHtml(Object.keys(detail.frontmatter || {}).join(', ') || '—')}</div></div>
  </div>
  <div class="callout" style="margin-top:14px">${icon('info', 15)}<div>SKILL.md 的第一段 frontmatter 必须包含 <code>name</code> 和 <code>description</code>，否则 DSH 无法发现这个 Skill。</div></div>`;

  const textarea = drawer.body.querySelector('[data-skill-editor]');
  const dirtyLabel = drawer.body.querySelector('[data-dirty]');
  const editorWrap = drawer.body.querySelector('[data-editor-wrap]');
  const footer = drawer.footer;
  footer.innerHTML = `${detail.editable ? `<button class="btn btn-sm btn-danger" data-skill-delete>${icon('trash', 13)}删除</button>` : ''}
    <button class="btn btn-sm" data-skill-duplicate>${icon('copy', 13)}复制</button>
    <button class="btn btn-sm" data-skill-reveal>${icon('folderOpen', 13)}定位文件</button>
    <span class="spacer"></span>
    ${detail.editable ? `<button class="btn btn-primary" data-skill-save>${icon('save', 14)}保存</button>` : ''}
    <button class="btn" data-close>关闭</button>`;

  const updateDirty = () => {
    dirtyLabel.classList.toggle('hidden', !dirty);
  };
  textarea.addEventListener('input', () => {
    content = textarea.value;
    dirty = true;
    updateDirty();
  });
  drawer.body.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      mode = button.dataset.mode;
      drawer.body.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('active', item === button));
      if (mode === 'preview') {
        if (textarea.isConnected) content = textarea.value;
        editorWrap.innerHTML = `<div class="skill-preview markdown">${renderMarkdown(stripFrontmatter(content))}</div>`;
      } else {
        editorWrap.innerHTML = `<textarea class="textarea skill-editor mono" data-skill-editor spellcheck="false" ${detail.editable ? '' : 'readonly'}>${escapeHtml(content)}</textarea>`;
        const next = editorWrap.querySelector('[data-skill-editor]');
        next.addEventListener('input', () => {
          content = next.value;
          dirty = true;
          updateDirty();
        });
      }
    });
  });
  footer.querySelector('[data-close]')?.addEventListener('click', () => drawer.close());
  footer.querySelector('[data-skill-reveal]')?.addEventListener('click', async () => {
    try { await api.skills.reveal(key); } catch (error) { toast(errorInfo(error).message, 'error'); }
  });
  footer.querySelector('[data-skill-save]')?.addEventListener('click', async (event) => {
    if (textarea.isConnected) content = textarea.value;
    const button = event.currentTarget;
    setButtonBusy(button, true, '保存中');
    try {
      const saved = await api.skills.save(key, content);
      dirty = false;
      updateDirty();
      detail = saved;
      toast('Skill 已保存', 'success', { description: '修改会在 DSH 下次读取 Skill 时生效。' });
      await onChanged?.();
    } catch (error) {
      toast(errorInfo(error).message, 'error', { title: '保存失败' });
    } finally {
      setButtonBusy(button, false);
    }
  });
  footer.querySelector('[data-skill-delete]')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: '删除 Skill',
      message: `将把「${detail.name}」整个目录移到系统回收站。`,
      details: detail.path,
      confirmText: '移到回收站',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.skills.remove(key);
      dirty = false;
      toast('Skill 已移到回收站', 'success');
      drawer.close();
      await onChanged?.();
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    }
  });
  footer.querySelector('[data-skill-duplicate]')?.addEventListener('click', async () => {
    const newSlug = await askSlug(ctx, detail.slug);
    if (!newSlug) return;
    try {
      const created = await api.skills.duplicate(key, newSlug);
      toast('Skill 已复制', 'success', { description: created.key });
      dirty = false;
      await onChanged?.();
      drawer.close();
      setTimeout(() => openSkill(created.key, ctx, onChanged), 280);
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    }
  });

}

async function openCreateSkill(ctx) {
  const body = document.createElement('div');
  body.innerHTML = `<form id="skill-create-form" class="form-stack" autocomplete="off">
    <div class="form-grid">
      <div class="field">
        <label class="field-label" for="skill-slug">目录标识 <span class="optional">小写字母/数字/短横线</span></label>
        <input class="input mono" id="skill-slug" maxlength="48" placeholder="my-skill">
      </div>
      <div class="field">
        <label class="field-label" for="skill-name">名称 <span class="optional">可中文</span></label>
        <input class="input" id="skill-name" maxlength="80" placeholder="我的技能">
      </div>
      <div class="field span-2">
        <label class="field-label" for="skill-description">描述 <span class="optional">会出现在 Skill 卡片上</span></label>
        <input class="input" id="skill-description" maxlength="280" placeholder="什么场景下应该使用这个 Skill？">
      </div>
      <div class="field span-2">
        <label class="field-label" for="skill-body">正文 <span class="optional">Markdown</span></label>
        <textarea class="textarea mono" id="skill-body" rows="9" spellcheck="false">## 使用场景

- 描述什么时候使用它。

## 步骤

1. 第一步
2. 第二步</textarea>
      </div>
    </div>
  </form>`;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const modal = openModal({
      title: '新建 Skill',
      subtitle: '会创建 ~/.dsh/skills/<slug>/SKILL.md',
      body,
      size: 'wide',
      onClose: () => finish(null),
      footer: '<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-create>创建 Skill</button>',
    });
    modal.modal.querySelector('[data-cancel]')?.addEventListener('click', () => modal.close());
    modal.modal.querySelector('[data-create]')?.addEventListener('click', async (event) => {
      const slug = body.querySelector('#skill-slug').value.trim().toLowerCase();
      const name = body.querySelector('#skill-name').value.trim();
      const description = body.querySelector('#skill-description').value.trim();
      const skillBody = body.querySelector('#skill-body').value;
      if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) {
        toast('目录标识只能包含小写字母、数字和短横线，长度 2–49。', 'warning');
        return;
      }
      if (!name || !description) {
        toast('请填写名称和描述。', 'warning');
        return;
      }
      const button = event.currentTarget;
      setButtonBusy(button, true, '创建中');
      try {
        const created = await api.skills.create({ slug, name, description, body: skillBody });
        toast('Skill 已创建', 'success', { description: created.key });
        finish(created);
        modal.close();
      } catch (error) {
        toast(errorInfo(error).message, 'error');
        setButtonBusy(button, false);
      }
    });
  });
}

function askSlug(ctx, baseSlug) {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label class="field-label" for="copy-slug">新目录标识</label><input class="input mono" id="copy-slug" value="${escapeHtml(`${baseSlug}-copy`)}" maxlength="48"><div class="field-hint">会复制 SKILL.md 到 ~/.dsh/skills/&lt;标识&gt;/。</div></div>`;
    const modal = openModal({
      title: '复制 Skill',
      body,
      size: 'narrow',
      footer: '<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-ok>复制</button>',
      onClose: () => resolve(null),
    });
    modal.modal.querySelector('[data-cancel]')?.addEventListener('click', () => { resolve(null); modal.close(); });
    modal.modal.querySelector('[data-ok]')?.addEventListener('click', () => {
      const value = body.querySelector('#copy-slug').value.trim().toLowerCase();
      resolve(value || null);
      modal.close();
    });
    body.querySelector('#copy-slug')?.select();
  });
}

function stripFrontmatter(content) {
  return String(content || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}
