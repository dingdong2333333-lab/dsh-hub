import { api, errorInfo } from '../api.js';
import {
  badge,
  confirmDialog,
  debounce,
  emptyState,
  errorState,
  escapeHtml,
  icon,
  loadingBlock,
  openDrawer,
  openModal,
  pageHeader,
  relativeTime,
  toast,
} from '../ui.js';

const filters = {
  query: '',
  category: 'all',
  sort: 'hot',
  state: 'all',
  page: 1,
};
let lastData = null;
let boundMain = null;

export async function render(main, ctx) {
  boundMain = main;
  if (!ctx.activeProfile) {
    main.innerHTML = `<div class="page">${errorState({ message: '没有可用的 DSH profile。请先在设置中检查 DSH Home。' })}</div>`;
    return cleanup;
  }
  main.innerHTML = `<div class="page market-page">
    ${pageHeader({
      kicker: 'PLUGIN HUB',
      title: '插件市场',
      subtitle: '浏览、搜索、安装、更新与卸载 DSH 社区插件。目录来自 DSH Plugin Hub 本地缓存。',
      actions: `<button class="btn btn-primary" data-market-custom>${icon('plus', 15)}自定义安装</button><button class="btn" data-market-refresh>${icon('refresh', 15)}刷新目录</button>`,
    })}
    <div data-market-root>${loadingBlock('正在读取插件目录…')}</div>
  </div>`;
  bindHeader(main, ctx);
  await reload(ctx);
  return cleanup;
}

export function cleanup() {
  boundMain = null;
}

async function reload(ctx, { focusSearch = false } = {}) {
  const root = boundMain?.querySelector('[data-market-root]');
  if (!root) return;
  try {
    lastData = await api.market.list(filters, ctx.activeProfile);
    root.innerHTML = renderBody(lastData, ctx);
    bindBody(root, ctx);
    if (focusSearch) {
      const input = root.querySelector('[data-market-search]');
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
  } catch (error) {
    const info = errorInfo(error);
    root.innerHTML = `<div class="panel"><div class="panel-body">${errorState({ message: info.message, code: info.code })}<div class="row" style="margin-top:12px"><button class="btn" data-market-retry>${icon('refresh', 14)}重试</button></div></div></div>`;
    root.querySelector('[data-market-retry]')?.addEventListener('click', () => reload(ctx));
  }
}

function renderBody(data, ctx) {
  const installedPct = data.catalogCount ? (data.installedCount / data.catalogCount) * 100 : 0;
  const installedPctLabel = installedPct > 0 && installedPct < 1 ? installedPct.toFixed(1) : String(Math.round(installedPct));
  return `
    <section class="market-summary">
      <div class="market-summary-main">
        <div class="market-summary-eyebrow"><span class="status-dot"></span>目录已就绪 · 本地缓存</div>
        <div class="market-summary-title">${data.catalogCount.toLocaleString('zh-CN')} <span>个社区插件</span></div>
        <div class="market-summary-sub">已安装 ${data.installedCount} 个 · 可更新 ${data.updatableCount} 个 · 插件启停请到「插件」页</div>
      </div>
      <div class="market-summary-bars">
        ${summaryCell('已安装', data.installedCount, `${installedPctLabel}% 目录覆盖`)}
        ${summaryCell('已启用', data.enabledCount, 'bundle 中已挂载')}
        ${summaryCell('可更新', data.updatableCount, data.updatableCount ? '建议查看' : '全部最新')}
      </div>
    </section>
    <div class="market-toolbar panel">
      <div class="market-search">${icon('search', 15)}<input type="search" placeholder="搜索插件名、作者、描述或标签…" value="${escapeHtml(filters.query)}" data-market-search autocomplete="off"></div>
      <select class="select" data-market-category aria-label="分类">
        <option value="all">全部分类</option>
        ${data.categories.map((category) => `<option value="${escapeHtml(category.id)}" ${filters.category === category.id ? 'selected' : ''}>${escapeHtml(category.label)} (${category.count})</option>`).join('')}
      </select>
      <select class="select" data-market-state aria-label="安装状态">
        ${option('all', '全部状态', filters.state)}
        ${option('installed', '已安装', filters.state)}
        ${option('not-installed', '未安装', filters.state)}
        ${option('updatable', '可更新', filters.state)}
      </select>
      <select class="select" data-market-sort aria-label="排序">
        ${option('hot', '最热', filters.sort)}
        ${option('new', '最近更新', filters.sort)}
        ${option('added', '最近收录', filters.sort)}
        ${option('name', '名称', filters.sort)}
      </select>
      <div class="market-toolbar-count">${data.total.toLocaleString('zh-CN')} 个结果</div>
    </div>
    ${data.items.length ? `<div class="market-grid">${data.items.map((item) => marketCard(item)).join('')}</div>` : `<div class="panel"><div class="panel-body">${emptyState({ iconName: 'search', title: '没有匹配的插件', description: '换一个关键词、分类或状态筛选试试。' })}</div></div>`}
    ${renderPager(data)}
    ${renderHistory(data.history)}`;
}

function summaryCell(label, value, foot) {
  return `<div class="market-summary-cell"><div class="market-summary-value">${value}</div><div class="market-summary-label">${escapeHtml(label)}</div><div class="market-summary-foot">${escapeHtml(foot)}</div></div>`;
}

function option(value, label, current) {
  return `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`;
}

function marketCard(item) {
  const stateBadge = item.updatable
    ? badge('可更新', 'warning', true)
    : item.installed
      ? badge(item.enabled ? '已启用' : '已安装', item.enabled ? 'success' : '', true)
      : badge('未安装', '', true);
  const action = item.installed
    ? `${item.updatable ? `<button class="btn btn-xs btn-primary" data-market-action="update" data-id="${escapeHtml(item.id)}">${icon('download', 12)}更新</button>` : ''}<button class="btn btn-xs" data-market-detail="${escapeHtml(item.id)}">${icon('eye', 12)}详情</button>`
    : `<button class="btn btn-xs btn-primary" data-market-action="install" data-id="${escapeHtml(item.id)}">${icon('download', 12)}安装</button><button class="btn btn-xs" data-market-detail="${escapeHtml(item.id)}">${icon('eye', 12)}详情</button>`;
  return `<article class="market-card ${item.installed ? 'is-installed' : ''}" data-market-card="${escapeHtml(item.id)}">
    <div class="market-card-top">
      <div class="market-card-avatar">${icon('package', 18)}</div>
      <div class="market-card-heading">
        <div class="market-card-title">${escapeHtml(item.name)}</div>
        <div class="market-card-owner">${escapeHtml(item.owner || '社区')}${item.verified ? ` · <span class="verified-dot">已人工验证</span>` : ''}</div>
      </div>
      ${stateBadge}
    </div>
    <p class="market-card-desc">${escapeHtml(item.description || '暂无描述。')}</p>
    <div class="market-card-tags">${item.tags.slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}<span class="tag tag-soft">${escapeHtml(item.category)}</span></div>
    <div class="market-card-meta">
      <span>${icon('star', 12)}${item.stars.toLocaleString('zh-CN')}</span>
      <span>${icon('git', 12)}${escapeHtml(item.version || '—')}</span>
      ${item.installed ? `<span class="market-installed-version">已装 ${escapeHtml(item.installedVersion || '未知')}</span>` : ''}
    </div>
    <div class="market-card-actions">${action}<button class="btn btn-xs btn-ghost" data-market-repo="${escapeHtml(item.repository)}" ${item.repository ? '' : 'disabled'}>${icon('external', 12)}仓库</button></div>
  </article>`;
}

function renderPager(data) {
  if (data.pages <= 1) return '';
  return `<div class="market-pager"><button class="btn btn-sm" data-market-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>${icon('chevronLeft', 14)}上一页</button><span>第 ${data.page} / ${data.pages} 页</span><button class="btn btn-sm" data-market-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''}>下一页${icon('chevronRight', 14)}</button></div>`;
}

function renderHistory(history) {
  if (!history?.length) return '';
  return `<section class="panel market-history">
    <div class="panel-head"><div class="panel-title">${icon('clock', 15)}最近市场任务</div><span class="badge">${history.length} 条</span></div>
    <div class="panel-body">
      ${history.slice(0, 4).map((task) => `<div class="market-history-row"><span class="market-history-dot ${task.status === 'ok' ? 'ok' : task.status === 'error' ? 'error' : 'running'}"></span><span class="grow"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.error || task.status)}</small></span><span class="muted">${escapeHtml(relativeTime(task.startedAt))}</span></div>`).join('')}
    </div>
  </section>`;
}

function bindHeader(main, ctx) {
  main.querySelector('[data-market-refresh]')?.addEventListener('click', () => reload(ctx));
  main.querySelector('[data-market-custom]')?.addEventListener('click', () => openCustomInstall(ctx));
}

function bindBody(root, ctx) {
  const search = root.querySelector('[data-market-search]');
  search?.addEventListener('input', debounce(() => {
    filters.query = search.value.trim();
    filters.page = 1;
    reload(ctx, { focusSearch: true });
  }, 280));
  root.querySelector('[data-market-category]')?.addEventListener('change', (event) => { filters.category = event.target.value; filters.page = 1; reload(ctx); });
  root.querySelector('[data-market-state]')?.addEventListener('change', (event) => { filters.state = event.target.value; filters.page = 1; reload(ctx); });
  root.querySelector('[data-market-sort]')?.addEventListener('change', (event) => { filters.sort = event.target.value; filters.page = 1; reload(ctx); });
  root.querySelectorAll('[data-market-page]').forEach((button) => button.addEventListener('click', () => {
    filters.page = Number(button.dataset.marketPage) || 1;
    reload(ctx);
  }));
  root.querySelectorAll('[data-market-detail]').forEach((button) => button.addEventListener('click', () => openDetail(ctx, button.dataset.marketDetail)));
  root.querySelectorAll('[data-market-action]').forEach((button) => button.addEventListener('click', () => runItemAction(ctx, button.dataset.marketAction, button.dataset.id)));
  root.querySelectorAll('[data-market-repo]').forEach((button) => button.addEventListener('click', () => {
    const repo = button.dataset.marketRepo;
    if (repo) ctx.openExternal(`https://github.com/${repo}`);
  }));
}

async function openDetail(ctx, id) {
  try {
    const data = await api.market.detail(id, ctx.activeProfile);
    const entry = data.entry;
    const installed = data.installed;
    const actions = installed
      ? `${data.updateAvailable ? `<button class="btn btn-primary" data-detail-action="update">${icon('download', 14)}更新</button>` : ''}<button class="btn" data-detail-action="uninstall" style="color:var(--danger)">${icon('trash', 14)}卸载</button>`
      : `<button class="btn btn-primary" data-detail-action="install">${icon('download', 14)}安装插件</button>`;
    const drawer = openDrawer({
      title: entry.name,
      subtitle: `${entry.owner || '社区'} · ${entry.categoryLabel || entry.category}`,
      wide: true,
      body: `<div class="market-detail">
        <div class="market-detail-badges">${entry.verified ? badge('已人工验证', 'success', true) : badge('社区收录', '', true)}${installed ? badge(installed.enabled ? '已启用' : '已安装', installed.enabled ? 'success' : '', true) : badge('未安装', '', true)}${badge(entry.version || '版本未知')}</div>
        <p class="market-detail-desc">${escapeHtml(entry.description || '暂无描述。')}</p>
        <div class="market-detail-grid">
          <div><span>分类</span><strong>${escapeHtml(entry.categoryLabel || entry.category || '—')}</strong></div>
          <div><span>Stars</span><strong>${Number(entry.stars || 0).toLocaleString('zh-CN')}</strong></div>
          <div><span>Forks</span><strong>${Number(entry.forks || 0).toLocaleString('zh-CN')}</strong></div>
          <div><span>最近更新</span><strong>${escapeHtml(relativeTime(entry.updatedAt))}</strong></div>
          <div><span>仓库</span><strong class="mono">${escapeHtml(entry.repository || '—')}</strong></div>
          <div><span>安装包</span><strong class="mono">${escapeHtml(entry.npmPackage || entry.name)}</strong></div>
        </div>
        ${entry.features?.length ? `<div class="market-detail-section"><div class="panel-title">能力</div><div class="market-card-tags">${entry.features.map((feature) => `<span class="tag">${escapeHtml(feature)}</span>`).join('')}</div></div>` : ''}
        ${entry.tags?.length ? `<div class="market-detail-section"><div class="panel-title">标签</div><div class="market-card-tags">${entry.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div></div>` : ''}
        <div class="market-detail-section"><div class="panel-title">来源</div><button class="btn btn-sm" data-detail-repo ${entry.repository ? '' : 'disabled'}>${icon('external', 13)}打开 GitHub 仓库</button></div>
        <div class="callout" style="margin-top:16px">${icon('shield', 15)}<div>安装会从 npm 或 GitHub 下载代码，并由 DSH 插件管理器执行。请只安装你信任的插件；安装/卸载前 DSH Hub 会自动创建配置快照。</div></div>
      </div>`,
      footer: `<div class="grow"></div>${actions}<button class="btn" data-detail-close>关闭</button>`,
    });
    drawer.drawer.querySelector('[data-detail-close]')?.addEventListener('click', () => drawer.close());
    drawer.drawer.querySelector('[data-detail-repo]')?.addEventListener('click', () => {
      if (entry.repository) ctx.openExternal(`https://github.com/${entry.repository}`);
    });
    drawer.drawer.querySelectorAll('[data-detail-action]').forEach((button) => button.addEventListener('click', async () => {
      const action = button.dataset.detailAction;
      drawer.close();
      await runItemAction(ctx, action, entry.id || entry.name);
    }));
  } catch (error) {
    toast(errorInfo(error).message, 'error');
  }
}

async function runItemAction(ctx, action, id) {
  let title = '';
  let message = '';
  let details = '';
  if (action === 'install') {
    title = '安装插件';
    message = `将从插件市场安装「${id}」，并加入当前 profile 的 bundle。`;
    details = '安装会下载并执行第三方代码，可能触发 npm postinstall。请确认来源可信。安装完成后可能需要重启或刷新 DSH。';
  } else if (action === 'update') {
    title = '更新插件';
    message = `将把「${id}」更新到目录中的最新版本。`;
    details = '更新会覆盖当前安装的包；DSH Hub 会在操作前创建配置快照。';
  } else if (action === 'uninstall') {
    title = '卸载插件';
    message = `将停用并从当前 profile 移除「${id}」。`;
    details = '只影响当前 profile，不会删除其他 profile 或你的工作区。操作前会自动创建配置快照。';
  }
  const confirmed = await confirmDialog({ title, message, details, confirmText: action === 'uninstall' ? '确认卸载' : '继续', tone: action === 'uninstall' ? 'danger' : 'primary' });
  if (!confirmed) return;
  const modal = openModal({
    title: `${title}：${id}`,
    body: `<div class="market-progress"><div class="market-progress-head"><span class="status-dot is-warn"></span><strong data-progress-title>正在启动 DSH 插件管理器…</strong></div><pre class="market-log" data-market-log></pre></div>`,
    size: 'wide',
    closeOnBackdrop: false,
    beforeClose: () => !modal.modal.dataset.running,
    footer: `<button class="btn" data-progress-close disabled>关闭</button>`,
  });
  const logEl = modal.body.querySelector('[data-market-log]');
  const titleEl = modal.body.querySelector('[data-progress-title]');
  const closeBtn = modal.footer.querySelector('[data-progress-close]');
  const append = (text, className = '') => {
    const line = document.createElement('div');
    line.className = `market-log-line ${className}`;
    line.textContent = text;
    logEl.append(line);
    logEl.scrollTop = logEl.scrollHeight;
  };
  modal.modal.dataset.running = '1';
  const off = api.market.onProgress((progress) => {
    if (progress.type === 'start') titleEl.textContent = progress.message || '正在执行…';
    if (progress.type === 'done') titleEl.textContent = '完成';
    if (progress.type === 'error') titleEl.textContent = progress.message || '失败';
    if (progress.line) append(progress.line);
    if (progress.type === 'done') append(`✔ ${progress.message || '操作完成'}`, 'ok');
    if (progress.type === 'error') append(`✖ ${progress.message || '操作失败'}`, 'error');
  });
  try {
    let result;
    if (action === 'install') result = await api.market.install(id, ctx.activeProfile);
    else if (action === 'update') result = await api.market.update(id, ctx.activeProfile);
    else result = await api.market.uninstall(id, ctx.activeProfile);
    append(`✔ 完成，用时 ${Math.round((result.durationMs || 0) / 1000)} 秒。`);
    if (result.bundlesAdded?.length) append(`已加入 bundle：${result.bundlesAdded.join(', ')}`);
    append('提示：如果 DSH 页面没有立即生效，请重启 DSH。');
    titleEl.textContent = '操作完成';
    toast(`${title}成功`, 'success', { description: '已刷新插件 inventory；重启 DSH 后完全生效。' });
    ctx.invalidate('plugins');
    await ctx.loadPlugins(true);
  } catch (error) {
    const info = errorInfo(error);
    append(`✖ ${info.message}`, 'error');
    if (info.details) append(String(info.details).slice(-1800), 'error');
    titleEl.textContent = '操作失败';
    toast(info.message, 'error');
  } finally {
    off();
    delete modal.modal.dataset.running;
    closeBtn.disabled = false;
    closeBtn.addEventListener('click', () => modal.close());
    await reload(ctx);
  }
}

function openCustomInstall(ctx) {
  const modal = openModal({
    title: '自定义安装 DSH 插件',
    subtitle: '支持 npm 包名、GitHub 仓库地址或本地目录；请只安装可信来源。',
    body: `<div class="field"><label class="field-label">安装地址</label><input class="input" data-custom-spec placeholder="例如 dsh-plugin、github:owner/repo 或 D:\\\\plugins\\\\my-plugin" spellcheck="false"></div><div class="callout warning" style="margin-top:12px">${icon('alert', 15)}<div>安装会下载并执行第三方代码。DSH Hub 会在安装前自动创建 profile 配置快照，但不会审计插件安全性。</div></div>`,
    footer: `<button class="btn" data-custom-cancel>取消</button><button class="btn btn-primary" data-custom-start>${icon('download', 14)}开始安装</button>`,
  });
  modal.footer.querySelector('[data-custom-cancel]')?.addEventListener('click', () => modal.close());
  modal.footer.querySelector('[data-custom-start]')?.addEventListener('click', async () => {
    const input = modal.body.querySelector('[data-custom-spec]');
    const spec = input.value.trim();
    if (!spec) { input.focus(); return; }
    modal.close();
    const progress = openModal({
      title: '自定义安装',
      body: `<div class="market-progress"><div class="market-progress-head"><span class="status-dot is-warn"></span><strong data-custom-title>正在启动 DSH 插件管理器…</strong></div><pre class="market-log" data-custom-log></pre></div>`,
      size: 'wide',
      closeOnBackdrop: false,
      beforeClose: () => !progress.modal.dataset.running,
      footer: '<button class="btn" data-custom-close disabled>关闭</button>',
    });
    const logEl = progress.body.querySelector('[data-custom-log]');
    const titleEl = progress.body.querySelector('[data-custom-title]');
    const closeBtn = progress.footer.querySelector('[data-custom-close]');
    progress.modal.dataset.running = '1';
    const append = (text, className = '') => {
      const line = document.createElement('div');
      line.className = `market-log-line ${className}`;
      line.textContent = text;
      logEl.append(line);
      logEl.scrollTop = logEl.scrollHeight;
    };
    const off = api.market.onProgress((payload) => {
      if (payload.type === 'start') titleEl.textContent = payload.message || '正在安装…';
      if (payload.type === 'error') titleEl.textContent = payload.message || '失败';
      if (payload.type === 'done') titleEl.textContent = '完成';
      if (payload.line) append(payload.line);
      if (payload.type === 'done') append(`✔ ${payload.message || '安装完成'}`, 'ok');
      if (payload.type === 'error') append(`✖ ${payload.message || '安装失败'}`, 'error');
    });
    try {
      await api.market.customInstall(spec, ctx.activeProfile);
      titleEl.textContent = '安装完成';
      append('✔ 已安装并尝试加入 bundle。如 DSH 未生效，请重启 DSH。');
      toast('自定义安装完成', 'success');
      ctx.invalidate('plugins');
      await ctx.loadPlugins(true);
    } catch (error) {
      const info = errorInfo(error);
      append(`✖ ${info.message}`, 'error');
      if (info.details) append(String(info.details).slice(-1800), 'error');
      titleEl.textContent = '安装失败';
      toast(info.message, 'error');
    } finally {
      off();
      delete progress.modal.dataset.running;
      closeBtn.disabled = false;
      closeBtn.addEventListener('click', () => progress.close());
      await reload(ctx);
    }
  });
  setTimeout(() => modal.body.querySelector('[data-custom-spec]')?.focus(), 40);
}
