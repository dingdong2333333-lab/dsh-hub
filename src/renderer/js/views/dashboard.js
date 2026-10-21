import { api, errorInfo } from '../api.js';
import {
  badge,
  confirmDialog,
  emptyState,
  escapeHtml,
  formatBytes,
  icon,
  initials,
  logoHtml,
  pageHeader,
  relativeTime,
  toast,
} from '../ui.js';
import { generateSingle, runBatch } from './ai-actions.js';
import { openSession } from './sessions.js';
import { openCrashAnalysis } from './crash-analysis.js';

export async function render(main, ctx) {
  const results = await Promise.allSettled([
    ctx.loadPlugins(),
    ctx.loadSets(),
    ctx.loadSessions(),
    ctx.loadSkills(),
  ]);
  const plugins = results[0].status === 'fulfilled' ? results[0].value : null;
  const sets = results[1].status === 'fulfilled' ? results[1].value : null;
  const sessions = results[2].status === 'fulfilled' ? results[2].value : null;
  const skills = results[3].status === 'fulfilled' ? results[3].value : null;
  const errors = results.filter((item) => item.status === 'rejected').map((item) => errorInfo(item.reason).message);

  if (!ctx.activeProfile) {
    main.innerHTML = `<div class="page">
      <div class="setup-panel">
        <div class="page-kicker">需要一次初始化</div>
        <h1>还没有可管理的 DSH profile</h1>
        <p>${escapeHtml(ctx.state.boot?.profileError?.message || '没有在 DSH Home 下找到 profile。')}</p>
        <div class="setup-code mono-block">${escapeHtml(ctx.state.boot?.paths?.dshHome || '~/.dsh')}</div>
        <div class="row">
          <button class="btn btn-primary" data-go-settings>${icon('settings', 15)}打开设置</button>
          <button class="btn" data-retry-dash>${icon('refresh', 15)}重新检查</button>
        </div>
      </div>
    </div>`;
    bindSetup(main, ctx);
    return;
  }

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const profile = plugins?.profile;
  const pluginTotal = profile?.total ?? 0;
  const enabled = profile?.enabled ?? 0;
  const disabled = profile?.disabled ?? 0;
  const chinese = profile?.withChinese ?? 0;
  const coverage = pluginTotal ? Math.round((chinese / pluginTotal) * 100) : 0;
  const enabledPercent = pluginTotal ? Math.round((enabled / pluginTotal) * 100) : 0;
  const recentSessions = sessions?.sessions?.slice(0, 4) || [];
  const aiCandidates = (plugins?.plugins || []).filter((plugin) => !plugin.displayName).slice(0, 4);
  const quickSets = sets?.sets?.slice(0, 4) || [];
  const crash = ctx.state.previousRun || ctx.state.crashes?.length;
  const dshVersion = ctx.state.boot?.install?.dshVersion || '';
  const latestCrash = ctx.state.crashes?.[0] || null;
  const installDir = ctx.state.boot?.install?.dir || ctx.state.boot?.paths?.install?.dir || '';

  main.innerHTML = `<div class="page">
    ${crash ? `<div class="banner danger" style="margin-bottom:16px">
      ${icon('alert', 17)}
      <div class="grow"><strong>检测到上次运行未正常退出。</strong> 崩溃报告已经保存。如果刚刚遇到过闪退，可前往诊断页查看最后一个错误和日志尾部。</div>
      <button class="btn btn-sm" data-go-logs>${icon('logs', 14)}查看诊断</button>
    </div>` : ''}
    ${errors.length ? `<div class="banner" style="margin-bottom:16px">${icon('alert', 16)}<div class="grow">部分数据加载失败：${escapeHtml(errors.join('；'))}</div></div>` : ''}

    <section class="dash-hero">
      <div class="hero-copy">
        <div class="hero-eyebrow"><span class="status-dot"></span>${escapeHtml(greeting)} · DSH CONTROL CENTER</div>
        <h1 class="hero-title">把复杂的 Harness，<br>收进一个<em>清晰的中枢</em>。</h1>
        <p class="hero-desc">插件启停、中文资料、套装组合、会话与 Skill，一站式管理。所有改动都会先备份，再写入你的 DSH profile。</p>
        <div class="hero-actions">
          <button class="btn btn-primary" data-go="plugins">${icon('plugins', 15)}管理插件</button>
          <button class="btn" data-action="ai-batch">${icon('wand', 15)}AI 完善资料</button>
          <button class="btn" data-go="sets">${icon('layers', 15)}一键套装</button>
          <span class="hero-profile">当前 profile <code>${escapeHtml(ctx.activeProfile)}</code></span>
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="hero-orbit"></div>
        <div class="hero-orbit-spin"></div>
        <div class="hero-core"><div class="logo-pulse">${logoHtml(56)}</div></div>
        <span class="hero-node hero-node-a"></span>
        <span class="hero-node hero-node-b"></span>
        <span class="hero-node hero-node-c"></span>
      </div>
    </section>

    <div class="stats-grid">
      ${statCard('plugins', '插件', pluginTotal, `${enabled} 启用 · ${disabled} 未启用`, `${chinese} 个已有中文名`)}
      ${statCard('sessions', '会话', sessions?.stats?.total ?? '—', sessions ? formatBytes(sessions.stats.totalSize) : '正在读取', sessions?.stats?.newest ? `最近活动：${relativeTime(sessions.stats.newest)}` : '')}
      ${statCard('layers', '套装', sets?.stats?.total ?? '—', sets ? `${sets.stats.active} 套启用中 · ${sets.stats.partial} 套部分启用` : '正在读取', quickSets.length ? `最近：${quickSets[0].name}` : '把常用插件组合起来')}
      ${statCard('skills', 'Skill', skills?.stats?.total ?? '—', skills ? `${skills.stats.user} 个我的 · ${skills.stats.builtin} 个内置` : '正在读取', '编辑 SKILL.md 与预览')}
    </div>

    <div class="dashboard-grid equal" style="margin-bottom:18px">
      <section class="panel runtime-panel">
        <div class="panel-head">
          <div class="panel-title">${icon('cpu', 16)}DSH 运行环境</div>
          ${badge(dshVersion ? `DSH ${dshVersion}` : '版本未知', dshVersion ? 'success' : 'warning', true)}
        </div>
        <div class="panel-body">
          <div class="runtime-grid">
            <div><span>DSH 版本</span><strong>${escapeHtml(dshVersion || '未能读取')}</strong></div>
            <div><span>当前 profile</span><strong>${escapeHtml(ctx.activeProfile)}</strong></div>
            <div><span>安装目录</span><strong class="mono truncate" title="${escapeHtml(installDir)}">${escapeHtml(installDir || '未检测到')}</strong></div>
            <div><span>Electron</span><strong>${escapeHtml(ctx.state.boot?.system?.electron || '—')}</strong></div>
          </div>
          <div class="row" style="margin-top:14px">
            <button class="btn btn-sm" data-open-install ${installDir ? '' : 'disabled'}>${icon('folderOpen', 13)}打开安装目录</button>
            <button class="btn btn-sm" data-app-launch>${icon('rocket', 13)}打开 DSH</button>
            <button class="btn btn-sm" data-app-reload>${icon('refresh', 13)}刷新 DSH</button>
            <button class="btn btn-sm" data-app-restart style="color:var(--warning)">${icon('refresh', 13)}重启 DSH</button>
          </div>
        </div>
      </section>

      <section class="panel crash-panel">
        <div class="panel-head">
          <div class="panel-title">${icon(crash ? 'alert' : 'shield', 16)}崩溃与恢复</div>
          ${badge(crash ? `${ctx.state.crashes?.length || 0} 条记录` : '运行正常', crash ? 'warning' : 'success', true)}
        </div>
        <div class="panel-body">
          ${crash ? `<div class="crash-latest">
            <div class="crash-latest-icon">${icon('alert', 16)}</div>
            <div class="grow"><div class="crash-latest-title">${escapeHtml(latestCrash?.title || ctx.state.previousRun?.message || '上次运行未正常退出')}</div><div class="crash-latest-meta">${escapeHtml(relativeTime(latestCrash?.at || ctx.state.previousRun?.at))}${latestCrash?.type ? ` · ${escapeHtml(latestCrash.type)}` : ''}</div></div>
          </div>
          <p class="soft" style="font-size:12px;margin:10px 0 0">AI 可以结合崩溃报告与日志尾部给出可能原因和下一步排查建议。</p>` : `<div class="muted" style="font-size:12.5px">没有发现崩溃报告。发生异常退出时会自动记录上下文。</div>`}
          <div class="row" style="margin-top:14px">
            <button class="btn btn-sm btn-soft" data-crash-ai ${crash ? '' : 'disabled'}>${icon('wand', 13)}AI 分析崩溃</button>
            <button class="btn btn-sm" data-go-logs>${icon('logs', 13)}查看诊断</button>
            <button class="btn btn-sm btn-ghost" data-go="snapshots">${icon('shield', 13)}配置快照</button>
          </div>
        </div>
      </section>
    </div>

    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">${icon('activity', 16)}插件健康度</div>
          <span class="badge ${enabledPercent > 70 ? 'success' : 'warning'}">${enabledPercent}% 已启用</span>
        </div>
        <div class="ring-card">
          <div class="ring-chart" style="--on:${enabledPercent}">
            <div class="ring-center"><div class="ring-value">${enabled}<small style="font-size:11px;color:var(--text-faint)">/${pluginTotal}</small></div><div class="ring-label">ENABLED</div></div>
          </div>
          <div class="ring-legend">
            <div class="legend-row"><span class="legend-swatch" style="background:var(--accent)"></span>已启用<strong>${enabled}</strong></div>
            <div class="legend-row"><span class="legend-swatch" style="background:rgba(140,164,190,.35)"></span>未启用<strong>${disabled}</strong></div>
            <div class="legend-row"><span class="legend-swatch" style="background:var(--accent-blue)"></span>中文覆盖<strong>${coverage}%</strong></div>
            <div class="legend-row"><span class="legend-swatch" style="background:var(--warning)"></span>异常依赖<strong>${profile?.missing ?? 0}</strong></div>
            <button class="btn btn-sm btn-soft" data-go="plugins" style="margin-top:6px">${icon('arrowRight', 13)}查看插件列表</button>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">${icon('sessions', 16)}最近会话</div>
          <button class="btn btn-xs btn-ghost" data-go="sessions">全部 ${icon('chevronRight', 12)}</button>
        </div>
        <div class="panel-body" style="padding-top:6px;padding-bottom:8px">
          ${recentSessions.length ? `<div class="recent-list">${recentSessions.map((session) => `
            <div class="recent-row" data-session="${escapeHtml(session.id)}" role="button" tabindex="0">
              <div class="recent-icon">${icon('message', 14)}</div>
              <div class="recent-main">
                <div class="recent-title">${escapeHtml(session.title)}</div>
                <div class="recent-sub">${escapeHtml(session.workspaceName || '未知工作区')} · ${escapeHtml(session.agentPreset || 'default')}</div>
              </div>
              <div class="recent-time">${escapeHtml(relativeTime(session.updatedAt))}</div>
            </div>`).join('')}</div>` : emptyState({ iconName: 'sessions', title: '还没有会话', description: '在 DSH 里开始一次对话后，这里会出现记录。' })}
        </div>
      </section>
    </div>

    <div class="dashboard-grid equal">
      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">${icon('wand', 16)}待完善中文资料</div>
          <span class="badge ${aiCandidates.length ? 'warning' : 'success'}">${aiCandidates.length} 个待处理</span>
        </div>
        <div class="panel-body" style="padding-top:6px;padding-bottom:8px">
          ${aiCandidates.length ? `<div class="ai-list">${aiCandidates.map((plugin) => `
            <div class="ai-row">
              <div class="avatar avatar-sm" style="--hue:${hueSafe(plugin.name)};border-color:hsla(${hueSafe(plugin.name)},70%,62%,.22)">${escapeHtml(initials(plugin.name))}</div>
              <div class="ai-row-main">
                <div class="ai-row-title">${escapeHtml(plugin.title || plugin.name)}</div>
                <div class="ai-row-pkg">${escapeHtml(plugin.name)}</div>
              </div>
              <button class="btn btn-xs btn-soft" data-ai-plugin="${escapeHtml(plugin.name)}">${icon('wand', 12)}AI 起名</button>
            </div>`).join('')}</div>` : emptyState({ iconName: 'checkCircle', title: '全部插件都有中文名了', description: '你仍然可以在插件详情里重新生成或手动修改。' })}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">${icon('layers', 16)}快捷套装</div>
          <button class="btn btn-xs btn-ghost" data-go="sets">管理 ${icon('chevronRight', 12)}</button>
        </div>
        <div class="panel-body">
          ${quickSets.length ? `<div class="quick-sets">${quickSets.map((set) => `
            <div class="quick-set" style="--set-color:${escapeHtml(set.color)}">
              <div class="quick-set-head"><span class="quick-set-dot"></span><span class="quick-set-name">${escapeHtml(set.name)}</span>${badge(set.state === 'all' ? '已启用' : set.state === 'partial' ? '部分' : '未启用', set.state === 'all' ? 'success' : set.state === 'partial' ? 'warning' : '', true)}</div>
              <div class="quick-set-meta">${set.enabledCount}/${set.totalCount} 个插件已启用</div>
              <button class="btn btn-xs ${set.state === 'all' ? '' : 'btn-soft'}" data-quick-set="${escapeHtml(set.id)}" data-action="${set.state === 'all' ? 'disable' : 'enable'}">${set.state === 'all' ? icon('pause', 11) : icon('play', 11)}${set.state === 'all' ? '关闭' : '一键启用'}</button>
            </div>`).join('')}</div>` : emptyState({ iconName: 'layers', title: '还没有套装', description: '把经常一起使用的插件组合成一套。' })}
        </div>
      </section>
    </div>

    <div class="system-strip" style="margin-top:18px">
      <span class="system-item">${icon('cpu', 13)}DSH <strong>${escapeHtml(dshVersion || '—')}</strong></span>
      <span class="system-item">${icon('terminal', 13)}Electron <strong>${escapeHtml(ctx.state.boot?.system?.electron || '—')}</strong></span>
      <span class="system-item">${icon('terminal', 13)}Node <strong>${escapeHtml(ctx.state.boot?.system?.node || '—')}</strong></span>
      <span class="system-item">${icon('git', 13)}Profile <strong>${escapeHtml(ctx.activeProfile)}</strong></span>
      <span class="system-item">${icon('database', 13)}数据目录 <strong title="${escapeHtml(ctx.state.boot?.paths?.dataDir || '')}">${escapeHtml(shorten(ctx.state.boot?.paths?.dataDir || '—', 38))}</strong></span>
      <span class="system-item" style="margin-left:auto">${icon('shield', 13)}本地优先 · 改动自动备份</span>
    </div>
  </div>`;

  bind(main, ctx, aiCandidates);
  return () => {};
}

function statCard(iconName, label, value, foot, extra) {
  return `<div class="stat-card">
    <div class="stat-top"><span class="stat-label">${escapeHtml(label)}</span><span class="stat-icon">${icon(iconName, 15)}</span></div>
    <div class="stat-value">${escapeHtml(String(value))}</div>
    <div class="stat-foot"><span class="truncate">${escapeHtml(foot)}</span></div>
    ${extra ? `<div class="stat-foot" style="margin-top:3px;color:var(--text-faint)">${escapeHtml(extra)}</div>` : ''}
  </div>`;
}

function shorten(value, max) {
  const text = String(value || '');
  return text.length > max ? `…${text.slice(-(max - 1))}` : text;
}

function hueSafe(name) {
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function bind(main, ctx, aiCandidates) {
  const installDir = ctx.state.boot?.install?.dir || ctx.state.boot?.paths?.install?.dir || '';
  main.querySelectorAll('[data-go]').forEach((button) => {
    button.addEventListener('click', () => ctx.navigate(button.dataset.go));
  });
  main.querySelectorAll('[data-go-logs]').forEach((button) => button.addEventListener('click', () => ctx.navigate('logs')));
  main.querySelector('[data-open-install]')?.addEventListener('click', () => ctx.openPath(installDir));
  main.querySelector('[data-crash-ai]')?.addEventListener('click', () => openCrashAnalysis(ctx));
  main.querySelector('[data-app-launch]')?.addEventListener('click', async () => {
    try {
      await api.app.launch();
      toast('已请求打开 DSH', 'success');
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    }
  });
  main.querySelector('[data-app-reload]')?.addEventListener('click', async () => {
    try {
      const result = await api.app.reloadDsh();
      toast('已向 DSH 发送刷新', 'success', {
        description: result.message || 'DSH 页面已重新加载，Host 不会被重启。',
        duration: 3200,
      });
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    }
  });
  main.querySelector('[data-app-restart]')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: '重启 DeepSeek Harness？',
      message: '这会关闭当前 DSH 应用并重新启动它。',
      details: '正在运行的任务、当前 DSH 页面和未完成的模型请求会中断；会话记录与工作区文件不会被删除。请先保存手头工作。',
      confirmText: '确认重启',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const result = await api.app.restart();
      toast('已安排重启 DSH', 'warning', {
        duration: 6000,
        description: result.warning || 'DSH 将在约 2 秒后关闭并启动。',
      });
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    }
  });
  main.querySelectorAll('[data-session]').forEach((row) => {
    const open = () => openSession(row.dataset.session, ctx);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter') open(); });
  });
  main.querySelectorAll('[data-ai-plugin]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await generateSingle(ctx, button.dataset.aiPlugin, button);
      } catch {}
    });
  });
  main.querySelector('[data-action="ai-batch"]')?.addEventListener('click', async () => {
    const all = ctx.state.caches.plugins?.plugins || [];
    const names = all.filter((plugin) => !plugin.displayName).map((plugin) => plugin.name);
    if (!names.length) {
      toast('所有插件都已有中文名。', 'info');
      return;
    }
    const confirmed = await confirmDialog({
      title: 'AI 完善插件中文资料',
      message: `将为 ${names.length} 个缺少中文名的插件调用 DSH 模型，生成中文名称、备注和标签。`,
      details: '每个插件会单独请求一次模型，可能产生少量 token 费用。生成结果会直接保存，你可以继续手动修改。',
      confirmText: '开始生成',
    });
    if (!confirmed) return;
    await runBatch(ctx, names, {
      onDone: () => { ctx.invalidate('plugins'); },
    });
  });
  main.querySelectorAll('[data-quick-set]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.action;
      const set = ctx.state.caches.sets?.sets.find((item) => item.id === button.dataset.quickSet);
      if (!set) return;
      const confirmed = await confirmDialog({
        title: action === 'enable' ? `启用套装「${set.name}」` : `关闭套装「${set.name}」`,
        message: action === 'enable' ? `将启用其中的 ${set.totalCount} 个插件。` : `将停用其中的 ${set.enabledCount} 个已启用插件。`,
        details: action === 'enable' ? 'DSH 需要重启或热重载后才会完全生效。' : '不会卸载插件，只会从当前 profile 的 bundle 列表中移除。',
        confirmText: action === 'enable' ? '一键启用' : '关闭套装',
        tone: action === 'disable' ? 'danger' : 'primary',
      });
      if (!confirmed) return;
      button.disabled = true;
      try {
        const result = await api.sets.apply(set.id, action, ctx.activeProfile);
        toast(`${action === 'enable' ? '已启用' : '已关闭'}「${set.name}」`, 'success', {
          description: `${result.applied.length} 个插件${action === 'enable' ? '启用' : '停用'}${result.skipped.length ? `，${result.skipped.length} 个跳过` : ''}。重启 DSH 后完全生效。`,
        });
        ctx.invalidate('plugins', 'sets');
        await ctx.refreshCurrentView();
      } catch (error) {
        toast(errorInfo(error).message, 'error');
        button.disabled = false;
      }
    });
  });
}

function bindSetup(main, ctx) {
  main.querySelector('[data-go-settings]')?.addEventListener('click', () => ctx.navigate('settings'));
  main.querySelector('[data-retry-dash]')?.addEventListener('click', () => ctx.refreshCurrentView());
}
