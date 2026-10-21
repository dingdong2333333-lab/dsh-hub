import { api, errorInfo } from '../api.js';
import {
  badge,
  confirmDialog,
  copyText,
  emptyState,
  escapeHtml,
  formatBytes,
  formatDate,
  icon,
  openDrawer,
  pageHeader,
  relativeTime,
  toast,
} from '../ui.js';

export async function render(main, ctx) {
  let data = await ctx.loadSessions();

  main.innerHTML = `<div class="page">
    ${pageHeader({
      kicker: 'SESSION ARCHIVE',
      title: '会话档案',
      subtitle: '浏览 DSH 的本地会话日志，预览、导出或移动到回收站。删除操作可恢复。',
      actions: `
        <button class="btn" data-action="open-folder">${icon('folderOpen', 15)}打开目录</button>
        <button class="btn btn-icon btn-ghost" data-action="refresh" title="重新扫描">${icon('refresh', 16)}</button>`,
    })}
    <div class="session-stats">
      ${badge(`${data.stats.total} 个会话`, 'accent')}
      ${badge(formatBytes(data.stats.totalSize))}
      ${badge(`${data.stats.workspaces} 个工作区`, 'blue')}
      ${data.stats.channels.map((channel) => badge(channel)).join('')}
      ${data.stats.newest ? `<span class="field-hint" style="margin-left:auto">最近活动 ${relativeTime(data.stats.newest)}</span>` : ''}
    </div>
    <div class="toolbar">
      <div class="input-group" style="flex:1;max-width:360px">
        ${icon('search', 15)}
        <input class="input" id="session-search" placeholder="搜索标题、工作区、首条消息…" autocomplete="off">
      </div>
      <select class="select" id="session-channel" style="width:auto;min-width:120px" aria-label="来源筛选">
        <option value="all">全部来源</option>
        ${data.stats.channels.map((channel) => `<option value="${escapeHtml(channel)}">${escapeHtml(channel)}</option>`).join('')}
      </select>
      <select class="select" id="session-sort" style="width:auto;min-width:120px" aria-label="排序">
        <option value="updated">最近活动</option>
        <option value="created">创建时间</option>
        <option value="size">文件大小</option>
      </select>
      <span class="spacer"></span>
      <span class="field-hint" id="session-count">${data.sessions.length} 条</span>
    </div>
    <div class="table-wrap session-table">
      <table class="data-table">
        <thead><tr>
          <th style="width:40%">会话</th>
          <th>工作区</th>
          <th>来源</th>
          <th>预设</th>
          <th>时间</th>
          <th>大小</th>
          <th style="text-align:right">操作</th>
        </tr></thead>
        <tbody id="session-body"></tbody>
      </table>
    </div>
  </div>`;

  const body = main.querySelector('#session-body');
  const searchInput = main.querySelector('#session-search');
  const channelSelect = main.querySelector('#session-channel');
  const sortSelect = main.querySelector('#session-sort');
  const countEl = main.querySelector('#session-count');
  let query = '';
  let channel = 'all';
  let sort = 'updated';

  const visible = () => {
    let list = data.sessions.filter((session) => {
      if (channel !== 'all' && session.source !== channel) return false;
      if (!query) return true;
      return `${session.title} ${session.firstPrompt} ${session.workspace} ${session.workspaceName} ${session.agentPreset} ${session.source}`.toLowerCase().includes(query);
    });
    if (sort === 'created') list = [...list].sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === 'size') list = [...list].sort((a, b) => b.size - a.size);
    else list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  };

  const renderList = () => {
    const list = visible();
    countEl.textContent = `${list.length} 条`;
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="7">${emptyState({ iconName: 'sessions', title: '没有匹配的会话', description: '换个搜索词，或切换来源筛选。' })}</td></tr>`;
      return;
    }
    body.innerHTML = list.map((session) => `<tr class="session-row" data-session-row="${escapeHtml(session.id)}" tabindex="0">
      <td><div class="session-main-cell">
        <div class="session-icon">${icon(session.source === '微信' ? 'sessions' : session.source === 'Orb' ? 'cpu' : 'message', 15)}</div>
        <div style="min-width:0">
          <div class="session-title truncate" title="${escapeHtml(session.title)}">${escapeHtml(session.title)}</div>
          <div class="session-snippet" title="${escapeHtml(session.firstPrompt || '')}">${escapeHtml(session.firstPrompt || '没有首条消息摘要')}</div>
        </div>
      </div></td>
      <td><div class="session-workspace" title="${escapeHtml(session.workspace || '')}">${icon('folder', 12)}${escapeHtml(session.workspaceName || session.workspace || '—')}</div></td>
      <td>${badge(session.source || 'Unknown', session.source === '微信' ? 'success' : session.source === 'Orb' ? 'violet' : 'blue')}</td>
      <td><span class="mono" style="font-size:10px;color:var(--text-muted)">${escapeHtml(session.agentPreset || '—')}</span></td>
      <td><span class="session-date" title="${escapeHtml(formatDate(session.updatedAt))}">${escapeHtml(relativeTime(session.updatedAt))}</span></td>
      <td><span class="session-date">${formatBytes(session.size)}</span></td>
      <td class="session-actions-cell">
        <button class="btn btn-icon btn-xs btn-ghost" data-session-view="${escapeHtml(session.id)}" title="预览">${icon('eye', 13)}</button>
        <button class="btn btn-icon btn-xs btn-ghost" data-session-export="${escapeHtml(session.id)}" title="导出">${icon('download', 13)}</button>
        <button class="btn btn-icon btn-xs btn-ghost" data-session-delete="${escapeHtml(session.id)}" title="移到回收站">${icon('trash', 13)}</button>
      </td>
    </tr>`).join('');
    bindRows();
  };

  const bindRows = () => {
    body.querySelectorAll('[data-session-row]').forEach((row) => {
      row.addEventListener('click', async (event) => {
        if (event.target.closest('button')) return;
        await openSession(row.dataset.sessionRow, ctx, reload);
      });
      row.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') await openSession(row.dataset.sessionRow, ctx, reload);
      });
    });
    body.querySelectorAll('[data-session-view]').forEach((button) => button.addEventListener('click', () => openSession(button.dataset.sessionView, ctx, reload)));
    body.querySelectorAll('[data-session-export]').forEach((button) => button.addEventListener('click', () => exportSession(button.dataset.sessionExport, button)));
    body.querySelectorAll('[data-session-delete]').forEach((button) => button.addEventListener('click', () => deleteSession(button.dataset.sessionDelete, reload)));
  };

  const reload = async () => {
    data = await ctx.loadSessions(true);
    renderList();
    const stats = main.querySelector('.session-stats');
    if (stats) {
      stats.innerHTML = `${badge(`${data.stats.total} 个会话`, 'accent')}
        ${badge(formatBytes(data.stats.totalSize))}
        ${badge(`${data.stats.workspaces} 个工作区`, 'blue')}
        ${data.stats.channels.map((item) => badge(item)).join('')}
        ${data.stats.newest ? `<span class="field-hint" style="margin-left:auto">最近活动 ${relativeTime(data.stats.newest)}</span>` : ''}`;
    }
    const options = ['all', ...data.stats.channels];
    channelSelect.innerHTML = options.map((item) => `<option value="${escapeHtml(item)}">${item === 'all' ? '全部来源' : escapeHtml(item)}</option>`).join('');
    channelSelect.value = options.includes(channel) ? channel : 'all';
    channel = channelSelect.value;
  };

  const deleteSession = async (id, after) => {
    const session = data.sessions.find((item) => item.id === id);
    if (!session) return;
    const confirmed = await confirmDialog({
      title: '删除会话',
      message: `将把「${session.title}」整个会话目录移到系统回收站。`,
      details: `${session.path}\n如果误删，可以从 Windows 回收站恢复。`,
      confirmText: '移到回收站',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.sessions.trash(id);
      toast('会话已移到回收站', 'success', { description: '可以在系统回收站中恢复。' });
      await after?.();
    } catch (error) {
      toast(errorInfo(error).message, 'error', { title: '删除失败' });
    }
  };

  const exportSession = async (id, button) => {
    if (button) button.disabled = true;
    try {
      const result = await api.sessions.export(id);
      if (result.canceled) return;
      toast('会话已导出', 'success', { description: `${result.path}（${formatBytes(result.bytes)}）` });
    } catch (error) {
      toast(errorInfo(error).message, 'error', { title: '导出失败' });
    } finally {
      if (button) button.disabled = false;
    }
  };

  searchInput.addEventListener('input', () => { query = searchInput.value.trim().toLowerCase(); renderList(); });
  channelSelect.addEventListener('change', () => { channel = channelSelect.value; renderList(); });
  sortSelect.addEventListener('change', () => { sort = sortSelect.value; renderList(); });
  main.querySelector('[data-action="refresh"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try { await reload(); toast('会话列表已刷新', 'success', { duration: 1600 }); }
    catch (error) { toast(errorInfo(error).message, 'error'); }
    finally { button.disabled = false; }
  });
  main.querySelector('[data-action="open-folder"]')?.addEventListener('click', () => {
    const path = ctx.state.boot?.paths?.sessionsDir;
    if (path) ctx.openPath(path);
  });

  renderList();
  return () => {};
}

export async function openSession(id, ctx, onChanged = null) {
  const drawer = openDrawer({
    title: '会话详情',
    subtitle: id,
    wide: true,
    body: '<div class="loading-block"><div class="spinner spinner-lg"></div><div>正在解压会话日志…</div></div>',
    footer: '<span class="spacer"></span><button class="btn" data-close>关闭</button>',
  });
  let session;
  try {
    session = await api.sessions.detail(id);
  } catch (error) {
    drawer.body.innerHTML = `<div class="empty"><div class="empty-icon" style="color:var(--danger)">${icon('alert', 22)}</div><div class="empty-title">无法读取会话</div><div class="empty-desc">${escapeHtml(errorInfo(error).message)}</div></div>`;
    return;
  }
  drawer.drawer.querySelector('.drawer-title').textContent = session.title;
  drawer.drawer.querySelector('.drawer-subtitle').textContent = session.id;
  drawer.body.innerHTML = `<div class="session-detail-head">
    <div class="row" style="align-items:flex-start">
      <div class="session-icon" style="width:42px;height:42px;flex-basis:42px">${icon('message', 18)}</div>
      <div style="min-width:0">
        <div class="session-detail-title">${escapeHtml(session.title)}</div>
        <div class="session-detail-meta">
          ${badge(session.source, 'blue')}
          ${badge(session.agentPreset || 'default')}
          ${badge(formatBytes(session.size))}
          ${session.titleSource === 'provider' ? badge('AI 标题', 'accent') : ''}
        </div>
      </div>
    </div>
    <div class="usage-row">
      <span class="usage-pill"><strong>${escapeHtml(formatDate(session.createdAt))}</strong> 创建</span>
      <span class="usage-pill"><strong>${escapeHtml(relativeTime(session.updatedAt))}</strong> 最后活动</span>
      <span class="usage-pill"><strong>${session.messageCount}</strong> 条消息</span>
      ${session.usage.totalTokens ? `<span class="usage-pill"><strong>${session.usage.totalTokens.toLocaleString('zh-CN')}</strong> tokens</span>` : ''}
    </div>
    <div class="meta-grid" style="margin-top:14px">
      <div class="meta-item"><div class="label">WORKSPACE</div><div class="value" title="${escapeHtml(session.cwd || '')}">${escapeHtml(session.cwd || '—')}</div></div>
      <div class="meta-item"><div class="label">SESSION FILE</div><div class="value" title="${escapeHtml(session.path)}">${escapeHtml(session.path)}</div></div>
    </div>
    ${session.hiddenContextCount ? `<div class="callout" style="margin-top:12px">${icon('info', 15)}<div>已隐藏 ${session.hiddenContextCount} 条系统注入上下文（runtime、时间、Skill 目录等），只展示真实对话。</div></div>` : ''}
  </div>
  <div class="section-label">对话时间线</div>
  <div class="session-timeline">
    ${session.messages.length ? session.messages.map((message) => `<div class="message message-${message.role}">
      <div class="message-role">${message.role === 'user' ? 'YOU' : 'DSH'}${message.source ? `<span class="muted">· ${escapeHtml(message.source)}</span>` : ''}${message.model ? `<span class="model">${escapeHtml(message.model)}</span>` : ''}</div>
      ${message.text ? `<div class="message-text">${escapeHtml(message.text)}</div>` : ''}
      ${message.toolCalls?.length ? `<div class="message-tools">${message.toolCalls.map((tool) => `<span class="tool-pill">${icon('terminal', 10)}${escapeHtml(tool)}</span>`).join('')}</div>` : ''}
    </div>`).join('') : '<div class="empty" style="padding:24px"><div class="empty-desc">这个会话没有可显示的消息。</div></div>'}
  </div>`;

  const footer = drawer.footer;
  footer.innerHTML = `<button class="btn btn-sm" data-session-copy>${icon('copy', 13)}复制 ID</button>
    <button class="btn btn-sm" data-session-reveal>${icon('folderOpen', 13)}定位</button>
    <button class="btn btn-sm btn-danger" data-session-delete>${icon('trash', 13)}移到回收站</button>
    <span class="spacer"></span>
    <button class="btn" data-close>关闭</button>`;
  footer.querySelector('[data-close]')?.addEventListener('click', () => drawer.close());
  footer.querySelector('[data-session-copy]')?.addEventListener('click', async () => {
    if (await copyText(session.id)) toast('会话 ID 已复制', 'success', { duration: 1400 });
  });
  footer.querySelector('[data-session-reveal]')?.addEventListener('click', async () => {
    try { await api.sessions.reveal(session.id); } catch (error) { toast(errorInfo(error).message, 'error'); }
  });
  footer.querySelector('[data-session-delete]')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: '删除会话',
      message: `将把「${session.title}」整个会话目录移到系统回收站。`,
      details: session.path,
      confirmText: '移到回收站',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.sessions.trash(session.id);
      toast('会话已移到回收站', 'success');
      drawer.close();
      await onChanged?.();
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    }
  });
}
