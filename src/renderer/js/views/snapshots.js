import { api, errorInfo } from '../api.js';
import {
  badge,
  confirmDialog,
  emptyState,
  errorState,
  escapeHtml,
  formatBytes,
  icon,
  loadingBlock,
  openModal,
  pageHeader,
  relativeTime,
  toast,
} from '../ui.js';

let currentMain = null;

export async function render(main, ctx) {
  currentMain = main;
  if (!ctx.activeProfile) {
    main.innerHTML = `<div class="page">${errorState({ message: '没有可用的 DSH profile。' })}</div>`;
    return () => { currentMain = null; };
  }
  main.innerHTML = `<div class="page snapshot-page">
    ${pageHeader({
      kicker: 'ROLLBACK SAFETY',
      title: '配置快照',
      subtitle: '保存并恢复 profile 的插件清单、cordis 配置、套装与中文资料。恢复前会再保存一份当前状态。',
      actions: `<button class="btn btn-primary" data-snapshot-create>${icon('plus', 15)}新建快照</button><button class="btn" data-snapshot-refresh>${icon('refresh', 15)}刷新</button>`,
    })}
    <div data-snapshot-root>${loadingBlock('正在读取快照…')}</div>
  </div>`;
  bindHeader(main, ctx);
  await reload(ctx);
  return () => { currentMain = null; };
}

async function reload(ctx) {
  const root = currentMain?.querySelector('[data-snapshot-root]');
  if (!root) return;
  try {
    const data = await api.snapshots.list(ctx.activeProfile);
    root.innerHTML = renderBody(data);
    bind(root, ctx, data);
  } catch (error) {
    root.innerHTML = `<div class="panel"><div class="panel-body">${errorState({ message: errorInfo(error).message })}</div></div>`;
  }
}

function renderBody(data) {
  return `<section class="snapshot-summary">
    <div class="snapshot-summary-card"><span class="snapshot-summary-icon">${icon('shield', 20)}</span><div><div class="snapshot-summary-value">${data.stats.total}</div><div class="snapshot-summary-label">总快照</div></div></div>
    <div class="snapshot-summary-card"><span class="snapshot-summary-icon">${icon('clock', 20)}</span><div><div class="snapshot-summary-value">${data.stats.automatic}</div><div class="snapshot-summary-label">自动快照</div></div></div>
    <div class="snapshot-summary-card"><span class="snapshot-summary-icon">${icon('database', 20)}</span><div><div class="snapshot-summary-value">${data.stats.lastAt ? escapeHtml(relativeTime(data.stats.lastAt)) : '—'}</div><div class="snapshot-summary-label">最近快照</div></div></div>
    <div class="snapshot-summary-path"><span class="muted">存储位置</span><code class="mono">${escapeHtml(data.dir)}</code><button class="btn btn-xs btn-ghost" data-snapshot-open-dir>${icon('folderOpen', 12)}打开目录</button></div>
  </section>
  <div class="callout" style="margin: 14px 0 18px">${icon('info', 15)}<div>快照只包含当前 profile 的配置文件，不会复制 credentials、会话日志或 node_modules。恢复后需要重启 DSH 才能确保全部插件重新加载。</div></div>
  ${data.snapshots.length ? `<div class="snapshot-list">${data.snapshots.map((snapshot) => snapshotRow(snapshot)).join('')}</div>` : `<div class="panel"><div class="panel-body">${emptyState({ iconName: 'shield', title: '还没有快照', description: '点击右上角新建快照，或在插件启停/市场安装前自动留存。' })}</div></div>`}`;
}

function snapshotRow(snapshot) {
  const reason = snapshot.auto ? '自动' : snapshot.reason === 'pre-restore' ? '恢复前' : '手动';
  const tone = snapshot.auto ? '' : 'success';
  return `<article class="snapshot-row" data-snapshot-id="${escapeHtml(snapshot.id)}">
    <div class="snapshot-row-icon">${icon(snapshot.auto ? 'clock' : 'shield', 17)}</div>
    <div class="snapshot-row-main">
      <div class="snapshot-row-title">${escapeHtml(snapshot.label)} ${badge(reason, tone, true)}</div>
      <div class="snapshot-row-meta">${escapeHtml(relativeTime(snapshot.createdAt))} · ${snapshot.files?.length || 0} 个文件 · ${formatBytes(snapshot.totalBytes || 0)}${snapshot.dshVersion ? ` · DSH ${escapeHtml(snapshot.dshVersion)}` : ''}</div>
      <div class="snapshot-files">${(snapshot.files || []).map((file) => `<span class="tag mono">${escapeHtml(file.path)}</span>`).join('')}</div>
    </div>
    <div class="snapshot-row-actions">
      <button class="btn btn-xs btn-primary" data-snapshot-restore="${escapeHtml(snapshot.id)}">${icon('undo', 12)}恢复</button>
      <button class="btn btn-xs" data-snapshot-reveal="${escapeHtml(snapshot.id)}">${icon('folder', 12)}目录</button>
      <button class="btn btn-xs btn-ghost snapshot-delete" data-snapshot-delete="${escapeHtml(snapshot.id)}" title="删除快照">${icon('trash', 13)}</button>
    </div>
  </article>`;
}

function bindHeader(main, ctx) {
  main.querySelector('[data-snapshot-refresh]')?.addEventListener('click', () => reload(ctx));
  main.querySelector('[data-snapshot-create]')?.addEventListener('click', () => openCreate(ctx));
}

function bind(root, ctx, data) {
  root.querySelector('[data-snapshot-open-dir]')?.addEventListener('click', () => ctx.openPath(data.dir));
  root.querySelectorAll('[data-snapshot-restore]').forEach((button) => button.addEventListener('click', async () => {
    const id = button.dataset.snapshotRestore;
    const snapshot = data.snapshots.find((item) => item.id === id);
    const confirmed = await confirmDialog({
      title: '恢复这个配置快照？',
      message: `将把 ${snapshot?.files?.length || 0} 个配置文件恢复到快照「${snapshot?.label || id}」的状态。`,
      details: '恢复前会自动保存当前状态作为“恢复前快照”。恢复完成后请重启 DSH；当前正在运行的任务可能会被中断。',
      confirmText: '恢复配置',
      tone: 'danger',
    });
    if (!confirmed) return;
    button.disabled = true;
    try {
      const result = await api.snapshots.restore(id, ctx.activeProfile);
      ctx.invalidate('plugins', 'sets');
      toast('配置已恢复', 'success', {
        description: `已恢复 ${result.restored.length} 个文件；恢复前快照 ${result.preRestore?.id || '已创建'}。请重启 DSH。`,
      });
      await reload(ctx);
    } catch (error) {
      toast(errorInfo(error).message, 'error');
      button.disabled = false;
    }
  }));
  root.querySelectorAll('[data-snapshot-reveal]').forEach((button) => button.addEventListener('click', async () => {
    try { await api.snapshots.reveal(button.dataset.snapshotReveal, ctx.activeProfile); } catch (error) { toast(errorInfo(error).message, 'error'); }
  }));
  root.querySelectorAll('[data-snapshot-delete]').forEach((button) => button.addEventListener('click', async () => {
    const snapshot = data.snapshots.find((item) => item.id === button.dataset.snapshotDelete);
    const confirmed = await confirmDialog({
      title: '删除快照？',
      message: `将把「${snapshot?.label || button.dataset.snapshotDelete}」移入系统回收站。`,
      details: '删除后不能在应用内恢复；其他快照不受影响。',
      confirmText: '移入回收站',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.snapshots.remove(button.dataset.snapshotDelete, ctx.activeProfile);
      toast('快照已移入回收站', 'success');
      await reload(ctx);
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    }
  }));
}

function openCreate(ctx) {
  const modal = openModal({
    title: '新建配置快照',
    subtitle: '保存当前 profile 的 package.json、cordis 配置、套装和插件中文资料。',
    body: `<div class="field"><label class="field-label">快照备注</label><input class="input" data-snapshot-label placeholder="例如：安装插件前、调整套装前" value="手动快照" maxlength="100"></div><div class="callout" style="margin-top:12px">${icon('info', 15)}<div>不会包含 credentials、会话记录、日志或 node_modules。自动快照最多保留 20 份，手动快照不会自动清理。</div></div>`,
    footer: `<button class="btn" data-snapshot-cancel>取消</button><button class="btn btn-primary" data-snapshot-save>${icon('save', 14)}保存快照</button>`,
  });
  modal.footer.querySelector('[data-snapshot-cancel]')?.addEventListener('click', () => modal.close());
  modal.footer.querySelector('[data-snapshot-save]')?.addEventListener('click', async () => {
    const label = modal.body.querySelector('[data-snapshot-label]').value.trim() || '手动快照';
    const button = modal.footer.querySelector('[data-snapshot-save]');
    button.disabled = true;
    try {
      const snapshot = await api.snapshots.create(label, ctx.activeProfile);
      modal.close();
      toast('快照已保存', 'success', { description: `${snapshot.files.length} 个文件，${formatBytes(snapshot.totalBytes || 0)}` });
      await reload(ctx);
    } catch (error) {
      button.disabled = false;
      toast(errorInfo(error).message, 'error');
    }
  });
}
