import { api, errorInfo } from '../api.js';
import {
  badge,
  confirmDialog,
  emptyState,
  escapeHtml,
  icon,
  pageHeader,
  setButtonBusy,
  toast,
} from '../ui.js';
import { openSetEditor } from './set-editor.js';

export async function render(main, ctx) {
  let [setsData] = await Promise.all([ctx.loadSets(true), ctx.loadPlugins()]);
  const mainView = { data: setsData };

  main.innerHTML = `<div class="page">
    ${pageHeader({
      kicker: 'BUNDLE SETS',
      title: '套装组合',
      subtitle: '把几个插件绑定成一个开关。启用或关闭套装只会调整当前 profile 的 bundle 列表，不会卸载文件。',
      actions: `
        <button class="btn btn-primary" data-action="create">${icon('plus', 15)}新建套装</button>
        <button class="btn btn-icon btn-ghost" data-action="refresh" title="刷新">${icon('refresh', 16)}</button>`,
    })}
    <div class="row-between" style="margin-bottom:16px">
      <div class="row" style="gap:6px">
        ${badge(`${setsData.stats.total} 个套装`, 'accent')}
        ${badge(`${setsData.stats.active} 个全量启用`, 'success', true)}
        ${setsData.stats.partial ? badge(`${setsData.stats.partial} 个部分启用`, 'warning', true) : ''}
      </div>
      <span class="field-hint">${icon('info', 13)} 套装是本地组合，不依赖插件包自带的能力</span>
    </div>
    <div id="set-grid" class="set-grid"></div>
  </div>`;

  const grid = main.querySelector('#set-grid');

  const renderList = () => {
    if (!mainView.data.sets.length) {
      grid.innerHTML = emptyState({
        iconName: 'layers',
        title: '还没有插件套装',
        description: '把常一起使用的插件放进一套，例如「写作增强」「桌面工作流」「界面美化」。之后一键就能切换。',
        action: '<button class="btn btn-primary btn-sm" data-action="create-empty">新建第一个套装</button>',
      });
      grid.querySelector('[data-action="create-empty"]')?.addEventListener('click', createSet);
      return;
    }
    grid.innerHTML = mainView.data.sets.map((set) => {
      const pct = set.totalCount ? Math.round((set.enabledCount / set.totalCount) * 100) : 0;
      const stateBadge = set.state === 'all'
        ? badge('全部启用', 'success', true)
        : set.state === 'partial'
          ? badge('部分启用', 'warning', true)
          : badge('未启用', '', true);
      return `<article class="set-card" style="--set-color:${escapeHtml(set.color)}">
        <div class="set-head">
          <div class="set-icon">${icon('layers', 18)}</div>
          <div style="min-width:0;flex:1">
            <div class="set-name">${escapeHtml(set.name)}</div>
            <div class="set-desc">${escapeHtml(set.description || '还没有说明。')}</div>
          </div>
          <div class="set-state">${stateBadge}</div>
        </div>
        <div class="set-progress"><span style="width:${pct}%"></span></div>
        <div class="set-members">
          ${set.members.slice(0, 12).map((member) => `<span class="member-chip ${member.missing || !member.canToggle ? 'missing' : member.enabled ? 'on' : 'off'}" title="${escapeHtml(member.name)}">
            <span class="mini-dot"></span>${escapeHtml(member.displayName || member.name)}
          </span>`).join('')}
          ${set.members.length > 12 ? `<span class="member-chip">+${set.members.length - 12}</span>` : ''}
        </div>
        <div class="row" style="margin-bottom:12px">
          <span class="field-hint">${set.enabledCount}/${set.totalCount} 个插件已启用${set.lastAppliedAt ? ` · 上次 ${new Date(set.lastAppliedAt).toLocaleString('zh-CN')}` : ''}</span>
        </div>
        <div class="set-actions">
          <button class="btn btn-sm ${set.state === 'all' ? '' : 'btn-soft'}" data-set-action="${set.state === 'all' ? 'disable' : 'enable'}" data-set-id="${escapeHtml(set.id)}">
            ${icon(set.state === 'all' ? 'pause' : 'play', 13)}${set.state === 'all' ? '一键关闭' : '一键启用'}
          </button>
          <button class="btn btn-sm btn-ghost" data-set-edit="${escapeHtml(set.id)}">${icon('edit', 13)}编辑</button>
          <span class="spacer"></span>
          <button class="btn btn-sm btn-ghost" data-set-delete="${escapeHtml(set.id)}" title="删除套装">${icon('trash', 13)}</button>
        </div>
      </article>`;
    }).join('');
    bindCards();
  };

  const bindCards = () => {
    grid.querySelectorAll('[data-set-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const set = mainView.data.sets.find((item) => item.id === button.dataset.setId);
        if (!set) return;
        const action = button.dataset.setAction;
        if (action === 'disable') {
          const confirmed = await confirmDialog({
            title: `关闭套装「${set.name}」`,
            message: `将停用这套里已启用的 ${set.enabledCount} 个插件。`,
            details: '插件不会被卸载，只是从 profile 的 bundle 列表中移除，之后可以随时重新启用。',
            confirmText: '关闭套装',
            tone: 'danger',
          });
          if (!confirmed) return;
        }
        setButtonBusy(button, true, action === 'enable' ? '启用中' : '关闭中');
        try {
          const result = await api.sets.apply(set.id, action, ctx.activeProfile);
          const skipped = result.skipped || [];
          toast(`${action === 'enable' ? '已启用' : '已关闭'}「${set.name}」`, skipped.length ? 'warning' : 'success', {
            description: `${result.applied.length} 个插件${action === 'enable' ? '启用' : '停用'}${skipped.length ? `，${skipped.length} 个跳过` : ''}。重启或热重载 DSH 后完全生效。`,
            duration: 6000,
          });
          await reload();
        } catch (error) {
          toast(errorInfo(error).message, 'error', { title: '套装操作失败' });
          setButtonBusy(button, false);
        }
      });
    });
    grid.querySelectorAll('[data-set-edit]').forEach((button) => {
      button.addEventListener('click', async () => {
        const set = mainView.data.sets.find((item) => item.id === button.dataset.setEdit);
        if (set) await editSet(set);
      });
    });
    grid.querySelectorAll('[data-set-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const set = mainView.data.sets.find((item) => item.id === button.dataset.setDelete);
        if (!set) return;
        const confirmed = await confirmDialog({
          title: `删除套装「${set.name}」`,
          message: '只删除这个组合关系，不会删除或停用任何插件。',
          confirmText: '删除套装',
          tone: 'danger',
        });
        if (!confirmed) return;
        try {
          await api.sets.remove(set.id, ctx.activeProfile);
          toast('套装已删除', 'success');
          ctx.afterMutation('sets');
          await reload();
        } catch (error) {
          toast(errorInfo(error).message, 'error');
        }
      });
    });
  };

  const reload = async () => {
    mainView.data = await ctx.loadSets(true);
    renderList();
    const summary = main.querySelector('.row-between .row');
    if (summary) {
      summary.innerHTML = `${badge(`${mainView.data.stats.total} 个套装`, 'accent')}
        ${badge(`${mainView.data.stats.active} 个全量启用`, 'success', true)}
        ${mainView.data.stats.partial ? badge(`${mainView.data.stats.partial} 个部分启用`, 'warning', true) : ''}`;
    }
  };

  const createSet = async () => {
    await openSetEditor(ctx, {
      onSaved: async (saved) => {
        ctx.afterMutation('sets');
        toast('套装已创建，现在可以一键启用。', 'success', { description: saved.name });
        await reload();
      },
    });
  };
  const editSet = async (set) => {
    await openSetEditor(ctx, {
      set,
      onSaved: async () => {
        ctx.afterMutation('sets');
        await reload();
      },
    });
  };

  main.querySelector('[data-action="create"]')?.addEventListener('click', createSet);
  main.querySelector('[data-action="refresh"]')?.addEventListener('click', async (event) => {
    setButtonBusy(event.currentTarget, true, '刷新');
    try { await reload(); toast('套装已刷新', 'success', { duration: 1600 }); }
    catch (error) { toast(errorInfo(error).message, 'error'); }
    finally { setButtonBusy(event.currentTarget, false); }
  });

  renderList();
  return () => {};
}
