import { api, errorInfo } from '../api.js';
import {
  badge,
  confirmDialog,
  emptyState,
  escapeHtml,
  hueFor,
  icon,
  initials,
  openDrawer,
  pageHeader,
  setButtonBusy,
  toast,
} from '../ui.js';
import { renderMarkdown } from '../markdown.js';
import { generateSingle, runBatch } from './ai-actions.js';
import { openSetEditor } from './set-editor.js';

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'enabled', label: '已启用' },
  { id: 'disabled', label: '未启用' },
  { id: 'favorite', label: '收藏' },
  { id: 'missing', label: '异常' },
];

export async function render(main, ctx) {
  let data = await ctx.loadPlugins();
  let view = {
    data,
    query: '',
    filter: 'all',
    sort: 'default',
    selectionMode: false,
    selected: new Set(),
    busy: new Set(),
  };

  main.innerHTML = `<div class="page">
    ${pageHeader({
      kicker: 'PLUGIN INVENTORY',
      title: '插件库',
      subtitle: `当前 profile <code>${escapeHtml(ctx.activeProfile)}</code> · 支持启停、中文资料与 AI 起名`,
      actions: `
        <button class="btn" data-action="batch-ai">${icon('wand', 15)}AI 批量完善</button>
        <button class="btn" data-action="bulk">${icon('list', 15)}批量选择</button>
        <button class="btn btn-icon btn-ghost" data-action="reload" title="重新读取">${icon('refresh', 16)}</button>`,
    })}
    <div class="toolbar">
      <div class="input-group" style="flex:1;max-width:330px">
        ${icon('search', 15)}
        <input class="input" id="plugin-search" placeholder="搜索插件名、包名、标签…" autocomplete="off">
      </div>
      <div class="filter-chips">${FILTERS.map((filter) => `<button class="filter-chip ${filter.id === 'all' ? 'active' : ''}" type="button" data-filter="${filter.id}">${filter.label}<span class="count" data-count="${filter.id}">0</span></button>`).join('')}</div>
      <div class="spacer"></div>
      <select class="select" id="plugin-sort" style="width:auto;min-width:128px" aria-label="排序">
        <option value="default">默认排序</option>
        <option value="name">按名称</option>
        <option value="recent">最近更新</option>
        <option value="enabled">先看已启用</option>
      </select>
      <button class="btn btn-sm" data-action="select-visible">全选可见</button>
    </div>
    <div class="row-between" style="margin:0 2px 12px">
      <div class="muted" style="font-size:11px" id="plugin-summary"></div>
      <div class="row" style="gap:6px">
        <span id="plugin-enabled-badge">${badge(`${data.profile.enabled} 启用`, 'success', true)}</span>
        <span id="plugin-chinese-badge">${badge(`${data.profile.withChinese} 个中文名`, 'accent')}</span>
      </div>
    </div>
    <div id="plugin-grid" class="plugin-grid"></div>
    <div id="selection-bar" class="selection-bar hidden">
      <span class="selection-count" id="selection-count">已选 0 个</span>
      <span class="muted" style="font-size:10px">批量操作会立即写入 profile</span>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-selection="enable">${icon('play', 13)}启用所选</button>
      <button class="btn btn-sm" data-selection="disable">${icon('pause', 13)}停用所选</button>
      <button class="btn btn-sm btn-soft" data-selection="set">${icon('layers', 13)}创建套装</button>
      <button class="btn btn-sm btn-ghost" data-selection="clear">取消选择</button>
    </div>
  </div>`;

  const grid = main.querySelector('#plugin-grid');
  const summary = main.querySelector('#plugin-summary');
  const selectionBar = main.querySelector('#selection-bar');
  const searchInput = main.querySelector('#plugin-search');

  const countFor = (filter) => {
    const plugins = view.data.plugins;
    if (filter === 'enabled') return plugins.filter((plugin) => plugin.enabled).length;
    if (filter === 'disabled') return plugins.filter((plugin) => !plugin.enabled).length;
    if (filter === 'favorite') return plugins.filter((plugin) => plugin.favorite).length;
    if (filter === 'missing') return plugins.filter((plugin) => plugin.missing).length;
    return plugins.length;
  };
  const updateFilters = () => {
    for (const filter of FILTERS) {
      const node = main.querySelector(`[data-count="${filter.id}"]`);
      if (node) node.textContent = String(countFor(filter.id));
    }
    main.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === view.filter));
  };

  const visiblePlugins = () => {
    const query = view.query.trim().toLowerCase();
    let list = view.data.plugins.filter((plugin) => {
      if (view.filter === 'enabled' && !plugin.enabled) return false;
      if (view.filter === 'disabled' && plugin.enabled) return false;
      if (view.filter === 'favorite' && !plugin.favorite) return false;
      if (view.filter === 'missing' && !plugin.missing) return false;
      if (!query) return true;
      return `${plugin.displayName} ${plugin.name} ${plugin.description} ${plugin.notes} ${plugin.tags.join(' ')} ${plugin.category}`.toLowerCase().includes(query);
    });
    if (view.sort === 'name') list.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name, 'zh-CN'));
    else if (view.sort === 'recent') list.sort((a, b) => b.mtime - a.mtime);
    else if (view.sort === 'enabled') list.sort((a, b) => Number(b.enabled) - Number(a.enabled) || (a.displayName || a.name).localeCompare(b.displayName || b.name, 'zh-CN'));
    return list;
  };

  const renderList = () => {
    const list = visiblePlugins();
    const percent = view.data.profile.total ? Math.round((view.data.profile.withChinese / view.data.profile.total) * 100) : 0;
    summary.textContent = `显示 ${list.length} / ${view.data.profile.total} 个插件 · 中文覆盖 ${percent}% · ${view.data.profile.toggleable} 个可独立启停`;
    const enabledBadge = main.querySelector('#plugin-enabled-badge');
    const chineseBadge = main.querySelector('#plugin-chinese-badge');
    if (enabledBadge) enabledBadge.innerHTML = badge(`${view.data.profile.enabled} 启用`, 'success', true);
    if (chineseBadge) chineseBadge.innerHTML = badge(`${view.data.profile.withChinese} 个中文名`, 'accent');
    updateFilters();
    if (!list.length) {
      grid.classList.remove('selection-mode');
      grid.innerHTML = emptyState({
        iconName: 'search',
        title: '没有匹配的插件',
        description: '换个关键词或清除筛选条件试试。',
        action: '<button class="btn btn-sm" data-reset-filter>清除筛选</button>',
      });
      grid.querySelector('[data-reset-filter]')?.addEventListener('click', () => {
        view.query = '';
        view.filter = 'all';
        searchInput.value = '';
        updateFilters();
        renderList();
      });
      updateSelectionBar();
      return;
    }
    grid.classList.toggle('selection-mode', view.selectionMode);
    grid.innerHTML = list.map(renderCard).join('');
    updateSelectionBar();
  };

  const renderCard = (plugin) => {
    const selected = view.selected.has(plugin.name);
    const desc = plugin.notes || plugin.suggestedNotes || '还没有中文备注，可以点击 AI 生成或打开详情手动填写。';
    const tags = (plugin.tags?.length ? plugin.tags : plugin.catalog?.features?.slice(0, 3) || []).slice(0, 3);
    return `<article class="plugin-card ${plugin.enabled ? '' : 'is-disabled'} ${selected ? 'is-selected' : ''}" data-plugin-card="${escapeHtml(plugin.name)}" tabindex="0" role="button" aria-label="打开 ${escapeHtml(plugin.title)} 详情">
      <label class="plugin-select checkbox-row" title="选择插件">
        <input type="checkbox" data-select="${escapeHtml(plugin.name)}" ${selected ? 'checked' : ''}>
        <span class="checkbox-box">${icon('check', 11)}</span>
      </label>
      <div class="plugin-card-top">
        <div class="plugin-avatar" style="--hue:${hueFor(plugin.name)}">${escapeHtml(initials(plugin.displayName || plugin.name))}<span class="status-dot ${plugin.enabled ? '' : 'is-off'}"></span></div>
        <div class="plugin-heading">
          <div class="plugin-title"><span>${escapeHtml(plugin.displayName || plugin.name)}</span>${plugin.ai ? '<span class="badge accent" style="height:17px;font-size:8px;padding:0 5px">AI</span>' : ''}</div>
          <div class="plugin-package" title="${escapeHtml(plugin.name)}">${escapeHtml(plugin.name)}</div>
        </div>
        <div class="plugin-card-switch">
          ${plugin.canToggle
            ? `<button class="switch" type="button" role="switch" aria-checked="${plugin.enabled}" data-toggle="${escapeHtml(plugin.name)}" aria-label="${plugin.enabled ? '停用' : '启用'} ${escapeHtml(plugin.title)}"></button>`
            : `<span class="badge ${plugin.missing ? 'danger' : ''}" title="${escapeHtml(plugin.reasonNotToggleable || '')}">${plugin.missing ? '缺失' : '只读'}</span>`}
        </div>
      </div>
      <div class="plugin-desc line-clamp-2">${escapeHtml(desc)}</div>
      <div class="plugin-tags">
        ${plugin.missing ? badge('依赖未安装', 'danger', true) : ''}
        ${!plugin.isBundle && !plugin.missing ? badge('非 bundle', '', false) : ''}
        ${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        ${!tags.length ? `<span class="tag muted">${escapeHtml(plugin.category || '未分类')}</span>` : ''}
      </div>
      <div class="plugin-foot">
        <span class="plugin-version">v${escapeHtml(plugin.version || '—')}</span>
        ${plugin.favorite ? `<span class="badge" style="height:18px;padding:0 6px;font-size:9px">${icon('star', 10)}收藏</span>` : ''}
        <span class="badge" style="height:18px;padding:0 6px;font-size:9px">${plugin.scope === 'client' ? '客户端' : '宿主'}</span>
        <div class="plugin-actions">
          ${plugin.missing ? '' : `<button class="btn btn-xs btn-soft" data-ai="${escapeHtml(plugin.name)}" title="调用 DSH 模型生成中文名与备注">${icon('wand', 12)}${plugin.displayName ? '重写' : 'AI 起名'}</button>`}
          <button class="btn btn-xs btn-ghost" data-detail="${escapeHtml(plugin.name)}">详情${icon('chevronRight', 12)}</button>
        </div>
      </div>
    </article>`;
  };

  const updateSelectionBar = () => {
    const count = view.selected.size;
    const bar = main.querySelector('#selection-bar');
    bar.classList.toggle('hidden', count === 0);
    const label = main.querySelector('#selection-count');
    if (label) label.textContent = `已选 ${count} 个`;
    const bulkButton = main.querySelector('[data-action="bulk"]');
    if (bulkButton) {
      bulkButton.classList.toggle('btn-soft', view.selectionMode);
      bulkButton.innerHTML = `${icon(view.selectionMode ? 'close' : 'list', 15)}${view.selectionMode ? '退出批量' : '批量选择'}`;
    }
    grid.classList.toggle('selection-mode', view.selectionMode);
  };

  const reload = async ({ silent = false } = {}) => {
    view.data = await ctx.loadPlugins(true);
    ctx.afterMutation('sets');
    const stillThere = new Set(view.data.plugins.map((plugin) => plugin.name));
    for (const name of view.selected) if (!stillThere.has(name)) view.selected.delete(name);
    renderList();
    if (!silent) updateFilters();
  };

  const togglePlugin = async (name, enabled, button) => {
    if (view.busy.has(name)) return;
    view.busy.add(name);
    if (button) button.disabled = true;
    try {
      const result = await api.plugins.toggle(name, enabled, ctx.activeProfile);
      const action = enabled ? '启用' : '停用';
      if (result.changed) {
        toast(`已${action}插件`, 'success', {
          description: `${name} · 重启或热重载 DSH 后完全生效。`,
          duration: 4000,
        });
      } else {
        toast(`插件已经是${action}状态。`, 'info');
      }
      await reload();
    } catch (error) {
      toast(errorInfo(error).message, 'error', { title: '启停失败' });
      if (button) button.disabled = false;
    } finally {
      view.busy.delete(name);
    }
  };

  const toggleSelected = async (enabled) => {
    const names = [...view.selected];
    if (!names.length) return;
    const confirmed = await confirmDialog({
      title: enabled ? '批量启用插件' : '批量停用插件',
      message: `将对 ${names.length} 个插件执行${enabled ? '启用' : '停用'}操作。`,
      details: enabled ? '已安装的 bundle 会加入当前 profile 的加载列表。' : '不会卸载插件，只会从 bundle 列表中移除。',
      confirmText: enabled ? '启用所选' : '停用所选',
      tone: enabled ? 'primary' : 'danger',
    });
    if (!confirmed) return;
    try {
      const result = await api.plugins.toggleMany(names, enabled, ctx.activeProfile);
      toast(`批量${enabled ? '启用' : '停用'}完成`, result.skipped.length ? 'warning' : 'success', {
        description: `${result.applied.length} 个成功${result.skipped.length ? `，${result.skipped.length} 个跳过` : ''}。重启 DSH 后完全生效。`,
      });
      view.selected.clear();
      await reload();
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    }
  };

  const batchAi = async () => {
    const missing = view.data.plugins.filter((plugin) => !plugin.displayName && !plugin.missing).map((plugin) => plugin.name);
    if (!missing.length) {
      toast('所有插件都已有中文名。', 'info');
      return;
    }
    const confirmed = await confirmDialog({
      title: 'AI 批量完善插件资料',
      message: `将为 ${missing.length} 个还没有中文名的插件调用 DSH 模型。`,
      details: '每个插件单独请求一次，生成名称、备注与标签。结果会直接保存，之后仍可手动修改。',
      confirmText: '开始生成',
    });
    if (!confirmed) return;
    await runBatch(ctx, missing, {
      onDone: async () => {
        try { await reload({ silent: true }); } catch {}
      },
    });
  };

  main.querySelector('[data-action="batch-ai"]')?.addEventListener('click', batchAi);
  main.querySelector('[data-action="reload"]')?.addEventListener('click', async (event) => {
    setButtonBusy(event.currentTarget, true, '刷新');
    try { await reload(); toast('插件列表已刷新', 'success', { duration: 1800 }); }
    catch (error) { toast(errorInfo(error).message, 'error'); }
    finally { setButtonBusy(event.currentTarget, false); }
  });
  main.querySelector('[data-action="bulk"]')?.addEventListener('click', () => {
    view.selectionMode = !view.selectionMode;
    if (!view.selectionMode) view.selected.clear();
    renderList();
  });
  main.querySelector('[data-action="select-visible"]')?.addEventListener('click', () => {
    for (const plugin of visiblePlugins()) view.selected.add(plugin.name);
    view.selectionMode = true;
    renderList();
  });
  searchInput?.addEventListener('input', () => {
    view.query = searchInput.value;
    renderList();
  });
  main.querySelector('#plugin-sort')?.addEventListener('change', (event) => {
    view.sort = event.target.value;
    renderList();
  });
  main.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      view.filter = button.dataset.filter;
      updateFilters();
      renderList();
    });
  });
  main.querySelectorAll('[data-selection]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.selection;
      if (action === 'enable') await toggleSelected(true);
      else if (action === 'disable') await toggleSelected(false);
      else if (action === 'clear') { view.selected.clear(); renderList(); }
      else if (action === 'set') {
        await openSetEditor(ctx, {
          initialPluginNames: [...view.selected],
          onSaved: () => { view.selected.clear(); renderList(); },
        });
      }
    });
  });

  grid.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-select]');
    if (!checkbox) return;
    if (checkbox.checked) view.selected.add(checkbox.dataset.select);
    else view.selected.delete(checkbox.dataset.select);
    updateSelectionBar();
    const card = checkbox.closest('[data-plugin-card]');
    card?.classList.toggle('is-selected', checkbox.checked);
  });

  grid.addEventListener('click', async (event) => {
    const target = event.target;
    const aiButton = target.closest('[data-ai]');
    if (aiButton) {
      event.stopPropagation();
      try { await generateSingle(ctx, aiButton.dataset.ai, aiButton, { refresh: false }); await reload({ silent: true }); }
      catch {}
      return;
    }
    const toggleButton = target.closest('[data-toggle]');
    if (toggleButton) {
      event.stopPropagation();
      const plugin = view.data.plugins.find((item) => item.name === toggleButton.dataset.toggle);
      if (plugin) await togglePlugin(plugin.name, !plugin.enabled, toggleButton);
      return;
    }
    const detailButton = target.closest('[data-detail]');
    if (detailButton) {
      event.stopPropagation();
      await openPluginDetail(ctx, detailButton.dataset.detail, { reload });
      return;
    }
    const card = target.closest('[data-plugin-card]');
    if (!card) return;
    if (target.closest('.plugin-select')) return;
    if (view.selectionMode) {
      const name = card.dataset.pluginCard;
      if (view.selected.has(name)) view.selected.delete(name);
      else view.selected.add(name);
      renderList();
      return;
    }
    await openPluginDetail(ctx, card.dataset.pluginCard, { reload });
  });

  grid.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest('button, input, label')) return;
    const card = event.target.closest('[data-plugin-card]');
    if (!card) return;
    event.preventDefault();
    await openPluginDetail(ctx, card.dataset.pluginCard, { reload });
  });

  updateFilters();
  renderList();
  return () => {};
}

async function openPluginDetail(ctx, name, { reload }) {
  const drawer = openDrawer({
    title: '插件详情',
    subtitle: name,
    wide: true,
    body: '<div class="loading-block"><div class="spinner spinner-lg"></div><div>正在读取插件资料…</div></div>',
    footer: '<span class="spacer"></span><button class="btn" data-close-detail>关闭</button>',
  });
  let detail;
  try {
    detail = await api.plugins.detail(name, ctx.activeProfile);
  } catch (error) {
    drawer.body.innerHTML = `<div class="empty"><div class="empty-icon" style="color:var(--danger)">${icon('alert', 22)}</div><div class="empty-title">无法读取插件</div><div class="empty-desc">${escapeHtml(errorInfo(error).message)}</div></div>`;
    return;
  }
  const meta = detail;
  const tags = meta.tags?.length ? meta.tags.join(', ') : '';
  const readmeHtml = meta.readme ? renderMarkdown(meta.readme) : '';
  const aiText = meta.ai
    ? `上次由 ${meta.ai.source === 'catalog-fallback' || meta.ai.source === 'catalog' ? '本地社区资料' : meta.ai.model || '模型'} 生成于 ${meta.ai.generatedAt ? new Date(meta.ai.generatedAt).toLocaleString('zh-CN') : '未知时间'}`
    : '还没有 AI 生成记录。';

  drawer.drawer.querySelector('.drawer-title').textContent = meta.displayName || meta.name;
  drawer.drawer.querySelector('.drawer-subtitle').textContent = meta.name;
  drawer.body.innerHTML = `<div class="detail-hero">
    <div class="avatar avatar-lg avatar-tint" style="--hue:${hueFor(meta.name)}">${escapeHtml(initials(meta.displayName || meta.name))}</div>
    <div style="min-width:0">
      <div class="detail-hero-title">${escapeHtml(meta.displayName || meta.name)}</div>
      <div class="detail-hero-sub">${escapeHtml(meta.name)} · v${escapeHtml(meta.version || '—')}</div>
      <div class="detail-badges">
        ${meta.enabled ? badge('已启用', 'success', true) : badge('未启用', '', true)}
        ${meta.favorite ? badge('收藏', 'accent') : ''}
        ${meta.missing ? badge('依赖缺失', 'danger', true) : ''}
        ${badge(meta.scope === 'client' ? '客户端插件' : '宿主插件', 'blue')}
        ${meta.catalog?.verified ? badge('社区已验证', 'success') : ''}
        ${meta.license ? badge(String(meta.license).length > 22 ? `${String(meta.license).slice(0, 21)}…` : meta.license) : ''}
      </div>
    </div>
  </div>

  <section class="ai-panel">
    <div class="ai-panel-head">${icon('wand', 16)}AI 中文资料</div>
    <div class="ai-panel-desc">调用 DSH 当前配置的模型，综合包描述、README 与社区缓存生成中文名称、备注和标签。生成会直接写入插件资料。</div>
    <div class="ai-panel-actions">
      <button class="btn btn-sm btn-soft" data-detail-ai>${icon('wand', 13)}${meta.displayName ? '重新生成' : '用 AI 起名'}</button>
      <button class="btn btn-sm" data-detail-local>${icon('database', 13)}用本地社区资料</button>
      ${!ctx.state.modelStatus?.configured ? `<span class="badge warning">${icon('alert', 11)}模型未配置</span>` : ''}
    </div>
    <div class="field-hint" style="margin-top:8px">${escapeHtml(aiText)}</div>
  </section>

  <section class="detail-section">
    <div class="detail-section-head"><div class="detail-section-title">${icon('edit', 15)}展示资料</div><span class="field-hint">保存后立即生效，不修改 package.json</span></div>
    <div class="form-stack">
      <div class="field">
        <label class="field-label" for="detail-name">中文显示名 <span class="optional">建议 2–14 个汉字</span></label>
        <input class="input" id="detail-name" maxlength="40" value="${escapeHtml(meta.displayName || '')}" placeholder="例如：余额小鲸鱼">
      </div>
      <div class="field">
        <label class="field-label" for="detail-notes">中文备注</label>
        <textarea class="textarea" id="detail-notes" rows="4" maxlength="1200" placeholder="${escapeHtml(meta.suggestedNotes || '说明这个插件做什么、适合什么场景。')}">${escapeHtml(meta.notes || '')}</textarea>
      </div>
      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="detail-tags">标签 <span class="optional">逗号分隔</span></label>
          <input class="input" id="detail-tags" maxlength="300" value="${escapeHtml(tags)}" placeholder="界面, 效率, 工作流">
        </div>
        <div class="field">
          <div class="field-label">收藏</div>
          <label class="checkbox-row" style="height:38px">
            <input type="checkbox" id="detail-favorite" ${meta.favorite ? 'checked' : ''}>
            <span class="checkbox-box">${icon('check', 11)}</span>
            在插件列表中置顶
          </label>
        </div>
      </div>
    </div>
  </section>

  <section class="detail-section">
    <div class="detail-section-head"><div class="detail-section-title">${icon('package', 15)}包信息</div><button class="btn btn-xs btn-ghost" data-detail-reveal>${icon('folderOpen', 12)}定位文件</button></div>
    <div class="meta-grid">
      <div class="meta-item"><div class="label">PACKAGE</div><div class="value" title="${escapeHtml(meta.name)}">${escapeHtml(meta.name)}</div></div>
      <div class="meta-item"><div class="label">VERSION</div><div class="value">${escapeHtml(meta.version || '—')}</div></div>
      <div class="meta-item"><div class="label">DEPENDENCY</div><div class="value">${escapeHtml(meta.dependencyType || '—')} · ${escapeHtml(meta.dependencySpec || '—')}</div></div>
      <div class="meta-item"><div class="label">AUTHOR</div><div class="value">${escapeHtml(meta.author || '—')}</div></div>
      <div class="meta-item"><div class="label">CATEGORY</div><div class="value">${escapeHtml(meta.category || '—')}</div></div>
      <div class="meta-item"><div class="label">ACTIVE</div><div class="value">${meta.enabled ? '已加入 bundles' : '未加入 bundles'}</div></div>
    </div>
    <div class="field-hint" style="margin-top:8px">${meta.reasonNotToggleable ? escapeHtml(meta.reasonNotToggleable) : '该插件是可独立启停的 dsh bundle。'}</div>
  </section>

  ${meta.cordisEntries?.length ? `<section class="detail-section">
    <div class="detail-section-head"><div class="detail-section-title">${icon('git', 15)}关联配置行</div><span class="field-hint">来自 cordis.yml</span></div>
    <div class="cordis-list">${meta.cordisEntries.map((entry) => `<div class="cordis-item"><span>${escapeHtml(entry.id)}</span><span class="pill">${escapeHtml(entry.name || '')}${entry.disabled == null ? '' : entry.disabled ? ' · disabled' : ' · enabled'}</span></div>`).join('')}</div>
  </section>` : ''}

  <section class="detail-section">
    <div class="detail-section-head"><div class="detail-section-title">${icon('book', 15)}README 摘要</div><span class="field-hint">最多显示 8,000 字符</span></div>
    ${readmeHtml ? `<div class="markdown" style="max-height:360px;overflow:auto;padding-right:4px">${readmeHtml}</div>` : `<div class="callout">${icon('info', 15)}<div>这个包没有 README，或文件不可读。</div></div>`}
  </section>

  <div class="callout" style="margin-top:18px">${icon('shield', 15)}<div>修改会写入当前 profile 下的 <code>.dsh-hub/plugin-meta.json</code>，不会改动插件自身文件。启用 / 停用会备份 <code>package.json</code>。</div></div>`;

  const footer = drawer.footer;
  footer.innerHTML = `
    <button class="btn ${meta.enabled ? 'btn-danger' : 'btn-soft'}" data-detail-toggle>${icon(meta.enabled ? 'pause' : 'play', 14)}${meta.enabled ? '停用插件' : '启用插件'}</button>
    <span class="spacer"></span>
    <span class="field-hint">${meta.missing ? '依赖缺失' : '改动需重启 DSH 完全生效'}</span>
    <button class="btn btn-primary" data-detail-save>${icon('save', 14)}保存资料</button>
    <button class="btn" data-close-detail>关闭</button>`;

  const nameInput = drawer.body.querySelector('#detail-name');
  const notesInput = drawer.body.querySelector('#detail-notes');
  const tagsInput = drawer.body.querySelector('#detail-tags');
  const favoriteInput = drawer.body.querySelector('#detail-favorite');
  const saveButton = footer.querySelector('[data-detail-save]');
  const toggleButton = footer.querySelector('[data-detail-toggle]');

  const collect = () => ({
    displayName: nameInput.value.trim(),
    notes: notesInput.value.trim(),
    tags: tagsInput.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
    favorite: favoriteInput.checked,
  });
  const updateBadges = () => {
    const title = drawer.drawer.querySelector('.drawer-title');
    if (title) title.textContent = nameInput.value.trim() || meta.name;
  };
  nameInput.addEventListener('input', updateBadges);

  footer.querySelector('[data-close-detail]')?.addEventListener('click', () => drawer.close());
  saveButton?.addEventListener('click', async () => {
    setButtonBusy(saveButton, true, '保存中');
    try {
      await api.plugins.updateMeta(meta.name, collect(), ctx.activeProfile);
      toast('插件资料已保存', 'success', { description: '可以继续编辑，或重启 DSH 查看效果。' });
      ctx.afterMutation('plugins');
      await reload({ silent: true });
      meta.displayName = collect().displayName;
      meta.notes = collect().notes;
      meta.tags = collect().tags;
      meta.favorite = collect().favorite;
      updateBadges();
    } catch (error) {
      toast(errorInfo(error).message, 'error', { title: '保存失败' });
    } finally {
      setButtonBusy(saveButton, false);
    }
  });
  footer.querySelector('[data-detail-reveal]')?.addEventListener('click', async () => {
    try { await api.plugins.reveal(meta.name, ctx.activeProfile); }
    catch (error) { toast(errorInfo(error).message, 'error'); }
  });
  toggleButton?.addEventListener('click', async () => {
    if (!meta.canToggle) {
      toast(meta.reasonNotToggleable || '这个插件不能单独启停。', 'warning');
      return;
    }
    setButtonBusy(toggleButton, true, '处理中');
    try {
      await api.plugins.toggle(meta.name, !meta.enabled, ctx.activeProfile);
      meta.enabled = !meta.enabled;
      toast(meta.enabled ? '插件已启用' : '插件已停用', 'success', { description: '重启或热重载 DSH 后完全生效。' });
      await reload({ silent: true });
      drawer.close();
      setTimeout(() => openPluginDetail(ctx, name, { reload }), 260);
    } catch (error) {
      toast(errorInfo(error).message, 'error');
      setButtonBusy(toggleButton, false);
    }
  });
  const aiButton = drawer.body.querySelector('[data-detail-ai]');
  aiButton?.addEventListener('click', async () => {
    try {
      const result = await generateSingle(ctx, meta.name, aiButton, { refresh: false, force: true });
      if (result?.meta) {
        nameInput.value = result.meta.displayName || '';
        notesInput.value = result.meta.notes || '';
        tagsInput.value = (result.meta.tags || []).join(', ');
        updateBadges();
        await reload({ silent: true });
      }
    } catch {}
  });
  drawer.body.querySelector('[data-detail-local]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setButtonBusy(button, true, '读取中');
    try {
      const suggestion = await api.plugins.localSuggest(meta.name, ctx.activeProfile);
      if (!suggestion) {
        toast('本地社区缓存中没有这个插件的资料。', 'info');
        return;
      }
      if (suggestion.displayName) nameInput.value = suggestion.displayName;
      if (suggestion.notes) notesInput.value = suggestion.notes;
      if (suggestion.tags?.length) tagsInput.value = suggestion.tags.join(', ');
      updateBadges();
      toast('已填入本地资料，记得保存。', 'success');
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    } finally {
      setButtonBusy(button, false);
    }
  });
}
