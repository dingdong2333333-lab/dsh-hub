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
  pageHeader,
  relativeTime,
  setButtonBusy,
  toast,
} from '../ui.js';
import { openCrashAnalysis } from './crash-analysis.js';

export async function render(main, ctx) {
  const [listResult, crashes] = await Promise.all([
    api.logs.list(),
    api.logs.crashes(),
  ]);
  const diagnostics = listResult.diagnostics || {};
  let logs = listResult.logs || [];
  let selectedLog = logs[0]?.name || 'app.log';
  let tail = { name: selectedLog, text: '' };

  main.innerHTML = `<div class="page">
    ${pageHeader({
      kicker: 'DIAGNOSTICS',
      title: '运行诊断',
      subtitle: '崩溃报告、运行日志和诊断信息。遇到问题先复制诊断，再查看日志尾部。',
      actions: `
        <button class="btn btn-soft" data-action="ai-crash" ${crashes.length ? '' : 'disabled'}>${icon('wand', 15)}AI 分析崩溃</button>
        <button class="btn" data-action="copy-diag">${icon('clipboard', 15)}复制诊断</button>
        <button class="btn" data-action="open-logs">${icon('folderOpen', 15)}日志目录</button>
        <button class="btn btn-icon btn-ghost" data-action="refresh" title="刷新">${icon('refresh', 16)}</button>`,
    })}
    ${ctx.state.previousRun ? `<div class="banner danger" style="margin-bottom:16px">${icon('alert', 17)}<div class="grow"><strong>上次运行没有正常退出。</strong> 上次启动时间：${escapeHtml(formatDate(ctx.state.previousRun.startedAt))}，PID ${escapeHtml(String(ctx.state.previousRun.pid || '—'))}。崩溃报告已自动保存。</div><button class="btn btn-sm" data-action="show-crashes">查看报告</button></div>` : ''}
    <div class="diag-grid">
      ${diagCard('应用版本', `v${escapeHtml(ctx.state.boot?.version || '—')}`, `Electron ${escapeHtml(diagnostics.versions?.electron || '—')}`)}
      ${diagCard('日志文件', `${logs.length} 个`, formatBytes(logs.reduce((sum, item) => sum + item.size, 0)))}
      ${diagCard('崩溃记录', `${crashes.length} 条`, crashes.length ? `最近 ${relativeTime(crashes[0].mtime)}` : '暂时没有崩溃')}
      ${diagCard('当前 Profile', escapeHtml(ctx.activeProfile || '—'), `DSH ${ctx.state.boot?.install?.dshVersion || '—'} · ${diagnostics.install?.dir || '未检测到安装目录'}`)}
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="logs">运行日志</button>
      <button class="tab" data-tab="crashes">崩溃报告 ${crashes.length ? `<span class="badge danger" style="margin-left:5px">${crashes.length}</span>` : ''}</button>
      <button class="tab" data-tab="info">环境信息</button>
    </div>

    <div data-pane="logs">
      <div class="log-layout">
        <div>
          <div class="section-label">日志文件</div>
          <div class="log-list" id="log-list"></div>
        </div>
        <div class="log-viewer">
          <div class="log-viewer-head">
            <span class="log-viewer-title" id="log-title">app.log</span>
            <button class="btn btn-xs btn-ghost" data-action="copy-log">${icon('copy', 12)}复制</button>
            <button class="btn btn-xs btn-ghost" data-action="reload-log">${icon('refresh', 12)}刷新</button>
          </div>
          <pre id="log-content">正在读取日志…</pre>
        </div>
      </div>
      <div class="row" style="margin-top:12px;justify-content:flex-end">
        <button class="btn btn-sm btn-danger" data-action="clear-logs">${icon('trash', 13)}清空日志</button>
      </div>
    </div>

    <div data-pane="crashes" class="hidden">
      <div class="crash-list" id="crash-list"></div>
    </div>

    <div data-pane="info" class="hidden">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">${icon('cpu', 15)}运行环境与路径</div><button class="btn btn-xs btn-ghost" data-action="copy-diag">${icon('copy', 12)}复制</button></div>
        <div class="panel-body">
          <div class="kv-list">
            ${kv('DSH Home', diagnostics.dshHome || '—')}
            ${kv('数据目录', diagnostics.dataDir || '—')}
            ${kv('日志目录', diagnostics.logsDir || '—')}
            ${kv('崩溃记录目录', diagnostics.crashesDir || '—')}
            ${kv('DSH 安装目录', diagnostics.install?.dir || '未检测到')}
            ${kv('Electron / Node', `${diagnostics.versions?.electron || '—'} / ${diagnostics.versions?.node || '—'}`)}
            ${kv('Chrome / V8', `${diagnostics.versions?.chrome || '—'} / ${diagnostics.versions?.v8 || '—'}`)}
            ${kv('PID / 运行时长', `${diagnostics.pid || '—'} / ${Math.round((diagnostics.uptimeSec || 0) / 60)} 分钟`)}
          </div>
          <div class="section-label" style="margin-top:18px">原始诊断 JSON</div>
          <div class="code-panel"><pre id="diag-json">${escapeHtml(JSON.stringify(diagnostics, null, 2))}</pre></div>
        </div>
      </div>
    </div>
  </div>`;

  const logList = main.querySelector('#log-list');
  const logContent = main.querySelector('#log-content');
  const logTitle = main.querySelector('#log-title');

  const renderLogs = () => {
    if (!logs.length) {
      logList.innerHTML = '<div class="empty" style="padding:20px"><div class="empty-desc">暂无日志</div></div>';
      return;
    }
    logList.innerHTML = logs.map((log) => `<button class="log-item ${log.name === selectedLog ? 'active' : ''}" type="button" data-log="${escapeHtml(log.name)}">
      ${icon('file', 13)}<span class="name">${escapeHtml(log.name)}</span><span class="size">${formatBytes(log.size)}</span>
    </button>`).join('');
    logList.querySelectorAll('[data-log]').forEach((button) => button.addEventListener('click', async () => {
      selectedLog = button.dataset.log;
      logList.querySelectorAll('[data-log]').forEach((item) => item.classList.toggle('active', item === button));
      await loadTail();
    }));
  };

  const loadTail = async () => {
    logTitle.textContent = selectedLog;
    logContent.textContent = '正在读取日志…';
    try {
      const result = await api.logs.tail(selectedLog, 600);
      tail = result;
      logContent.textContent = result.text || '（日志文件为空）';
      logContent.scrollTop = logContent.scrollHeight;
    } catch (error) {
      logContent.textContent = `读取失败：${errorInfo(error).message}`;
    }
  };

  const renderCrashes = () => {
    const container = main.querySelector('#crash-list');
    if (!crashes.length) {
      container.innerHTML = emptyState({ iconName: 'shield', title: '没有崩溃记录', description: '主进程、渲染进程和未正常退出的情况都会在这里留下报告。' });
      return;
    }
    container.innerHTML = crashes.map((crash) => `<div class="crash-item" data-crash-item="${escapeHtml(crash.id)}">
      <div class="crash-head">
        ${icon('alert', 15)}
        <span class="crash-title">${escapeHtml(crash.title)}</span>
        ${badge(crash.type, 'danger')}
        <span class="crash-time">${escapeHtml(relativeTime(crash.mtime))}</span>
        <span class="spacer" style="flex:1"></span>
        <button class="btn btn-xs btn-ghost" data-crash-read="${escapeHtml(crash.id)}">${icon('eye', 12)}查看</button>
        <button class="btn btn-xs btn-ghost" data-crash-copy="${escapeHtml(crash.id)}">${icon('copy', 12)}复制</button>
      </div>
      <div class="crash-detail">${escapeHtml(crash.file || '')}</div>
      <div data-crash-detail class="crash-json hidden"></div>
    </div>`).join('');
    container.querySelectorAll('[data-crash-read]').forEach((button) => button.addEventListener('click', () => toggleCrash(button.dataset.crashRead)));
    container.querySelectorAll('[data-crash-copy]').forEach((button) => button.addEventListener('click', async () => {
      try {
        const result = await api.logs.crash(button.dataset.crashCopy);
        if (await copyText(JSON.stringify(result.report, null, 2))) toast('崩溃报告已复制', 'success');
      } catch (error) {
        toast(errorInfo(error).message, 'error');
      }
    }));
  };

  const toggleCrash = async (id) => {
    const item = main.querySelector(`[data-crash-item="${cssEscape(id)}"]`);
    const detail = item?.querySelector('[data-crash-detail]');
    if (!detail) return;
    if (!detail.classList.contains('hidden')) {
      detail.classList.add('hidden');
      return;
    }
    detail.classList.remove('hidden');
    detail.textContent = '正在读取…';
    try {
      const result = await api.logs.crash(id);
      detail.textContent = JSON.stringify(result.report, null, 2);
    } catch (error) {
      detail.textContent = `读取失败：${errorInfo(error).message}`;
    }
  };

  const refreshAll = async () => {
    const [nextList, nextCrashes] = await Promise.all([api.logs.list(), api.logs.crashes()]);
    logs = nextList.logs || [];
    crashes.splice(0, crashes.length, ...(nextCrashes || []));
    if (!logs.some((log) => log.name === selectedLog)) selectedLog = logs[0]?.name || 'app.log';
    renderLogs();
    renderCrashes();
    await loadTail();
  };

  main.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
    main.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === tab));
    main.querySelectorAll('[data-pane]').forEach((pane) => pane.classList.toggle('hidden', pane.dataset.pane !== tab.dataset.tab));
  }));
  main.querySelector('[data-action="show-crashes"]')?.addEventListener('click', () => main.querySelector('[data-tab="crashes"]')?.click());
  main.querySelector('[data-action="ai-crash"]')?.addEventListener('click', () => openCrashAnalysis(ctx));
  main.querySelectorAll('[data-action="copy-diag"]').forEach((button) => button.addEventListener('click', async () => {
    if (await copyText(JSON.stringify(diagnostics, null, 2))) toast('诊断信息已复制', 'success');
    else toast('复制失败，请手动选择文本。', 'warning');
  }));
  main.querySelector('[data-action="copy-log"]')?.addEventListener('click', async () => {
    if (await copyText(tail.text || '')) toast('日志已复制', 'success');
  });
  main.querySelector('[data-action="reload-log"]')?.addEventListener('click', loadTail);
  main.querySelector('[data-action="open-logs"]')?.addEventListener('click', async () => {
    try { await api.logs.openDir(); } catch (error) { toast(errorInfo(error).message, 'error'); }
  });
  main.querySelector('[data-action="refresh"]')?.addEventListener('click', async (event) => {
    setButtonBusy(event.currentTarget, true, '刷新');
    try { await refreshAll(); toast('诊断信息已刷新', 'success', { duration: 1600 }); }
    catch (error) { toast(errorInfo(error).message, 'error'); }
    finally { setButtonBusy(event.currentTarget, false); }
  });
  main.querySelector('[data-action="clear-logs"]')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: '清空日志文件',
      message: '会删除所有 app*.log 文件，崩溃报告不会被删除。',
      confirmText: '清空日志',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const result = await api.logs.clear();
      toast(`已清空 ${result.removed} 个日志文件`, 'success');
      await refreshAll();
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    }
  });

  renderLogs();
  renderCrashes();
  await loadTail();
  return () => {};
}

function diagCard(label, value, sub) {
  return `<div class="diag-card"><div class="label">${escapeHtml(label)}</div><div class="value">${value}</div><div class="sub">${escapeHtml(sub)}</div></div>`;
}

function kv(label, value) {
  return `<div class="kv-row"><div class="kv-key">${escapeHtml(label)}</div><div class="kv-val mono" style="font-size:10px">${escapeHtml(value)}</div></div>`;
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, '\\$&');
}
