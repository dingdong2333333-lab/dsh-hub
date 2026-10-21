import { api, errorInfo } from './api.js';
import {
  badge,
  copyText,
  escapeHtml,
  h,
  icon,
  logoHtml,
  setButtonBusy,
  toast,
} from './ui.js';
import { ROUTES, navigate, onRouteChange, parseRoute } from './router.js';

import * as dashboardView from './views/dashboard.js';
import * as pluginsView from './views/plugins.js';
import * as marketView from './views/market.js';
import * as snapshotsView from './views/snapshots.js';
import * as setsView from './views/sets.js';
import * as sessionsView from './views/sessions.js';
import * as skillsView from './views/skills.js';
import * as logsView from './views/logs.js';
import * as settingsView from './views/settings.js';

const views = {
  dashboard: dashboardView,
  plugins: pluginsView,
  market: marketView,
  snapshots: snapshotsView,
  sets: setsView,
  sessions: sessionsView,
  skills: skillsView,
  logs: logsView,
  settings: settingsView,
};

const app = document.getElementById('app');
let cleanupCurrentView = null;
let routeToken = 0;
let shellReady = false;

const state = {
  boot: null,
  settings: null,
  profiles: [],
  activeProfile: '',
  modelStatus: null,
  theme: 'dark',
  previousRun: null,
  crashes: [],
  caches: {
    plugins: null,
    sets: null,
    sessions: null,
    skills: null,
  },
  currentRoute: 'dashboard',
};

const ctx = {
  state,
  api,
  ui: null,
  navigate,
  toast,
  h,
  icon,
  escapeHtml,
  badge,
  copyText,
  get activeProfile() { return state.activeProfile; },
  get settings() { return state.settings; },
  get modelStatus() { return state.modelStatus; },
  async loadPlugins(force = false) {
    if (!state.activeProfile) throw new Error(state.boot?.profileError?.message || '没有可用的 DSH profile。');
    if (!force && state.caches.plugins && state.caches.plugins.profile.name === state.activeProfile) {
      return state.caches.plugins;
    }
    const data = await api.plugins.list(state.activeProfile);
    state.caches.plugins = data;
    setBadge('plugins', data.profile.total);
    return data;
  },
  async loadSets(force = false) {
    if (!state.activeProfile) throw new Error('没有可用的 DSH profile。');
    if (!force && state.caches.sets && state.caches.sets.profile.name === state.activeProfile) {
      return state.caches.sets;
    }
    const data = await api.sets.list(state.activeProfile);
    state.caches.sets = data;
    setBadge('sets', data.stats.total);
    return data;
  },
  async loadSessions(force = false) {
    if (!force && state.caches.sessions) return state.caches.sessions;
    const data = await api.sessions.list({ force: Boolean(force) });
    state.caches.sessions = data;
    setBadge('sessions', data.stats.total);
    return data;
  },
  async loadSkills(force = false) {
    if (!force && state.caches.skills) return state.caches.skills;
    const data = await api.skills.list();
    state.caches.skills = data;
    setBadge('skills', data.stats.total);
    return data;
  },
  invalidate(...keys) {
    for (const key of keys) if (Object.hasOwn(state.caches, key)) state.caches[key] = null;
  },
  invalidateAll() {
    for (const key of Object.keys(state.caches)) state.caches[key] = null;
  },
  async refresh({ silent = false } = {}) {
    const buttons = [...document.querySelectorAll('[data-action="refresh"]')];
    buttons.forEach((button) => setButtonBusy(button, true, '刷新'));
    try {
      const boot = await api.refresh();
      acceptBootstrap(boot);
      ctx.invalidateAll();
      await renderRoute(parseRoute(), { force: true });
      if (!silent) toast('已刷新 DSH 状态', 'success');
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    } finally {
      buttons.forEach((button) => setButtonBusy(button, false));
    }
  },
  async refreshCurrentView() {
    await renderRoute(state.currentRoute, { force: true });
  },
  async selectProfile(name) {
    if (!name || name === state.activeProfile) return;
    try {
      const result = await api.profiles.select(name);
      acceptBootstrap(result.bootstrap);
      ctx.invalidateAll();
      toast(`已切换到 profile：${name}`, 'success');
      await renderRoute(state.currentRoute, { force: true });
    } catch (error) {
      toast(errorInfo(error).message, 'error');
      updateProfileSelect();
    }
  },
  async setTheme(theme) {
    const next = theme || (state.theme === 'dark' ? 'light' : 'dark');
    try {
      const result = await api.settings.update({ ui: { theme: next } });
      acceptBootstrap(result.bootstrap);
      toast(`已切换为${next === 'light' ? '浅色' : '深色'}主题`, 'success', { duration: 2200 });
    } catch (error) {
      toast(errorInfo(error).message, 'error');
    }
  },
  async updateSettings(patch) {
    const result = await api.settings.update(patch);
    acceptBootstrap(result.bootstrap);
    return result;
  },
  acceptBootstrap,
  afterMutation(keys = ['plugins']) {
    for (const key of keys) if (Object.hasOwn(state.caches, key)) state.caches[key] = null;
  },
  openSettings() {
    navigate('settings');
  },
  async openExternal(url) {
    try { await api.shell.openExternal(url); } catch (error) { toast(errorInfo(error).message, 'error'); }
  },
  async openPath(path) {
    try { await api.shell.openPath(path); } catch (error) { toast(errorInfo(error).message, 'error'); }
  },
  confirm: null,
  setBadge,
};
ctx.ui = {
  toast,
  h,
  icon,
  escapeHtml,
  copyText,
  badge,
};

boot();

async function boot() {
  const bootLogo = document.getElementById('boot-logo');
  if (bootLogo) bootLogo.innerHTML = logoHtml(58);
  try {
    const data = await api.bootstrap();
    acceptBootstrap(data);
    renderShell();
    shellReady = true;
    const bootScreen = document.getElementById('boot-screen');
    if (bootScreen) {
      bootScreen.classList.add('is-leaving');
      setTimeout(() => bootScreen.remove(), 320);
    }
    app.classList.remove('is-booting');
    await renderRoute(parseRoute());
    onRouteChange((route) => {
      if (shellReady) renderRoute(route);
    });
    installShortcuts();
    installErrorReporting();
  } catch (error) {
    renderBootFailure(error);
  }
}

function acceptBootstrap(data) {
  if (!data) return;
  state.boot = data;
  state.settings = data.settings;
  state.profiles = data.profiles || [];
  state.activeProfile = data.activeProfile || '';
  state.modelStatus = data.modelStatus || null;
  state.previousRun = data.previousRun || null;
  state.crashes = data.crashes || [];
  state.theme = resolveTheme(data.settings?.ui?.theme || 'dark');
  applyTheme();
  if (shellReady) {
    updateShell();
    updateProfileSelect();
    updateModelChip();
  }
  updateCrashBadge();
}

function resolveTheme(preference) {
  if (preference === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return preference === 'light' ? 'light' : 'dark';
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.classList.toggle('reduce-motion', Boolean(state.settings?.ui?.reduceMotion));
  const themeButton = document.querySelector('[data-action="toggle-theme"]');
  if (themeButton) {
    themeButton.innerHTML = icon(state.theme === 'dark' ? 'sun' : 'moon', 16);
    themeButton.title = state.theme === 'dark' ? '切换浅色主题' : '切换深色主题';
  }
}

function renderShell() {
  const profileLabel = state.activeProfile || '未选择';
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">${logoHtml(38)}</div>
        <div class="brand-copy">
          <div class="brand-title">DSH HUB <span>BETA</span></div>
          <div class="brand-sub">Harness Control Center</div>
        </div>
      </div>
      <nav class="nav-group" aria-label="主导航">
        <div class="nav-label">工作台</div>
        ${navButton('dashboard')}
        ${navButton('plugins')}
        ${navButton('market')}
        ${navButton('sets')}
        ${navButton('sessions')}
        ${navButton('skills')}
        <div class="nav-label">系统</div>
        ${navButton('snapshots')}
        ${navButton('logs')}
        ${navButton('settings')}
      </nav>
      <div class="sidebar-bottom">
        <button class="profile-mini" type="button" data-route="settings" title="打开设置">
          <div class="profile-mini-orb">${icon('git', 15)}</div>
          <div class="profile-mini-copy" style="min-width:0;text-align:left">
            <div class="profile-mini-title truncate">${escapeHtml(profileLabel)}</div>
            <div class="profile-mini-sub">DSH PROFILE</div>
          </div>
        </button>
        <div class="sidebar-version">
          <span>DSH Hub v${escapeHtml(state.boot?.version || '0.1.0')}</span>
          <span>${state.crashes.length ? `${state.crashes.length} 条崩溃记录` : '运行正常'}</span>
        </div>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="topbar-heading">
          <div class="topbar-title" id="topbar-title">概览</div>
          <div class="topbar-subtitle" id="topbar-subtitle">一眼掌握你的 DeepSeek Harness 运行状态</div>
        </div>
        <div class="topbar-actions">
          <div class="profile-select-wrap tooltip" data-tip="切换 DSH profile">
            ${icon('git', 14)}
            <select class="profile-select" id="profile-select" aria-label="选择 profile"></select>
          </div>
          <button class="model-chip" type="button" data-route="settings" id="model-chip" title="模型配置">
            <span class="status-dot is-off"></span>
            <span class="label">模型未配置</span>
          </button>
          <button class="btn btn-icon btn-ghost" type="button" data-action="command" title="命令面板（Ctrl+K）">${icon('search', 16)}</button>
          <button class="btn btn-icon btn-ghost" type="button" data-action="refresh" title="刷新状态">${icon('refresh', 16)}</button>
          <button class="btn btn-icon btn-ghost" type="button" data-action="toggle-theme" title="切换主题"></button>
        </div>
      </header>
      <main class="main" id="main" tabindex="-1"></main>
    </div>`;

  app.querySelectorAll('[data-route]').forEach((element) => {
    element.addEventListener('click', (event) => {
      if (element.closest('select')) return;
      event.preventDefault();
      navigate(element.dataset.route);
    });
  });
  app.querySelector('[data-action="refresh"]')?.addEventListener('click', () => ctx.refresh());
  app.querySelector('[data-action="toggle-theme"]')?.addEventListener('click', () => ctx.setTheme());
  app.querySelector('[data-action="command"]')?.addEventListener('click', openCommandPalette);
  app.querySelector('#profile-select')?.addEventListener('change', (event) => ctx.selectProfile(event.target.value));
  updateShell();
  updateProfileSelect();
  updateModelChip();
  applyTheme();
  updateCrashBadge();
}

function navButton(route) {
  const meta = ROUTES[route];
  return `<button class="nav-item" type="button" data-route="${route}" data-nav="${route}">
    ${icon(meta.icon, 17)}
    <span>${meta.title}</span>
    ${route === 'logs' ? '<span class="nav-dot hidden" data-badge="crashes" title="存在崩溃记录"></span>' : `<span class="nav-count hidden" data-badge="${route}"></span>`}
  </button>`;
}

function updateShell() {
  document.querySelectorAll('[data-nav]').forEach((element) => {
    element.classList.toggle('active', element.dataset.nav === state.currentRoute);
  });
  if (state.boot?.version) {
    const version = document.querySelector('.sidebar-version span');
    if (version) version.textContent = `DSH Hub v${state.boot.version}`;
  }
  const profileMiniTitle = document.querySelector('.profile-mini-title');
  if (profileMiniTitle) profileMiniTitle.textContent = state.activeProfile || '未选择 profile';
  updateModelChip();
  updateCrashBadge();
}

function updateProfileSelect() {
  const select = document.getElementById('profile-select');
  if (!select) return;
  const options = state.profiles.map((profile) => `<option value="${escapeHtml(profile.name)}" ${profile.name === state.activeProfile ? 'selected' : ''}>${escapeHtml(profile.name)}</option>`);
  select.innerHTML = options.join('') || '<option value="">无 profile</option>';
  select.disabled = state.profiles.length <= 1;
  const wrap = select.closest('.profile-select-wrap');
  if (wrap) wrap.style.display = state.profiles.length ? '' : 'none';
}

function updateModelChip() {
  const chip = document.getElementById('model-chip');
  if (!chip) return;
  const status = state.modelStatus;
  const configured = Boolean(status?.configured);
  chip.innerHTML = `<span class="status-dot ${configured ? '' : 'is-warn'}"></span><span class="label">${escapeHtml(configured ? status.model : '模型未配置')}</span>`;
  chip.title = configured
    ? `DSH 模型：${status.model}\n密钥：${status.keySource}\n点击打开设置`
    : '未找到 DSH 模型密钥，点击打开设置';
}

function updateCrashBadge() {
  const dot = document.querySelector('[data-badge="crashes"]');
  if (dot) dot.classList.toggle('hidden', !state.crashes.length);
  const versionInfo = document.querySelector('.sidebar-version span:last-child');
  if (versionInfo) versionInfo.textContent = state.crashes.length ? `${state.crashes.length} 条崩溃记录` : '运行正常';
}

function setBadge(key, count) {
  const node = document.querySelector(`[data-badge="${key}"]`);
  if (!node) return;
  const value = Number(count) || 0;
  node.textContent = value > 999 ? '999+' : String(value);
  node.classList.toggle('hidden', value === 0);
}

async function renderRoute(route, { force = false } = {}) {
  const target = Object.hasOwn(ROUTES, route) ? route : 'dashboard';
  state.currentRoute = target;
  updateShell();
  const main = document.getElementById('main');
  if (!main) return;
  const meta = ROUTES[target];
  document.getElementById('topbar-title').textContent = meta.title;
  document.getElementById('topbar-subtitle').textContent = meta.subtitle;
  updateShell();
  const token = ++routeToken;
  try {
    cleanupCurrentView?.();
    cleanupCurrentView = null;
    main.innerHTML = '<div class="loading-block"><div class="spinner spinner-lg"></div><div>正在读取 DSH 数据…</div></div>';
    main.scrollTop = 0;
    const result = await views[target].render(main, { ...ctx, force });
    if (token !== routeToken) return;
    if (typeof result === 'function') cleanupCurrentView = result;
    main.querySelector('.page')?.classList.add('fade-in');
  } catch (error) {
    if (token !== routeToken) return;
    console.error(error);
    reportRendererError(error, { fatal: false, scope: `view:${target}` });
    main.innerHTML = `<div class="page"><div class="card card-pad">${errorStateMarkup(error, target)}</div></div>`;
    main.querySelector('[data-retry]')?.addEventListener('click', () => renderRoute(target, { force: true }));
  }
}

function errorStateMarkup(error, target) {
  const info = errorInfo(error);
  return `<div class="empty">
    <div class="empty-icon" style="color:var(--danger)">${icon('alert', 22)}</div>
    <div class="empty-title">这个页面没有加载成功</div>
    <div class="empty-desc">${escapeHtml(info.message)}</div>
    <div class="row" style="margin-top:8px">
      <button class="btn btn-primary" data-retry>${icon('refresh', 15)}重新加载</button>
      <button class="btn" data-route="logs">${icon('logs', 15)}查看诊断</button>
    </div>
  </div>`;
}

function renderBootFailure(error) {
  const info = errorInfo(error);
  app.innerHTML = `<div class="setup-panel">
    <div class="page-kicker">启动检查</div>
    <h1>DSH Hub 没有找到可用的 DSH 数据目录</h1>
    <p>${escapeHtml(info.message)}</p>
    <div class="setup-code mono-block">${escapeHtml(info.details || '请先启动一次 DeepSeek Harness Desktop，或在设置中指定 DSH Home。')}</div>
    <div class="callout accent" style="margin-bottom:16px">${icon('info', 16)}<div>默认路径通常是 <code>%USERPROFILE%\\.dsh</code>。如果 DSH 已安装，请确认它至少启动过一次。</div></div>
    <div class="row">
      <button class="btn btn-primary" data-retry-boot>${icon('refresh', 15)}重新检查</button>
      <button class="btn" data-open-logs>${icon('folder', 15)}打开应用数据目录</button>
    </div>
  </div>`;
  app.querySelector('[data-retry-boot]')?.addEventListener('click', () => {
    app.innerHTML = '<div class="loading-block"><div class="spinner spinner-lg"></div><div>重新检查…</div></div>';
    setTimeout(() => window.location.reload(), 120);
  });
  app.querySelector('[data-open-logs]')?.addEventListener('click', () => {
    api.shell.openPath(state.boot?.paths?.dataDir || '').catch(() => {});
  });
}

function installErrorReporting() {
  window.addEventListener('error', (event) => {
    reportRendererError(event.error || new Error(event.message), {
      source: `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportRendererError(event.reason || new Error('Unhandled promise rejection'), { fatal: false });
  });
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    if (state.settings?.ui?.theme === 'system') {
      state.theme = resolveTheme('system');
      applyTheme();
    }
  });
}

function reportRendererError(error, extra = {}) {
  const payload = {
    message: error?.message || String(error),
    stack: error?.stack || '',
    source: extra.source || 'renderer',
    fatal: Boolean(extra.fatal),
    scope: extra.scope || '',
  };
  api.logs.reportRendererError(payload).catch(() => {});
}

function installShortcuts() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-route]');
    if (!target) return;
    if (target.closest('.sidebar') || target.closest('.topbar') || target.closest('select')) return;
    event.preventDefault();
    navigate(target.dataset.route);
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommandPalette();
      return;
    }
    if (event.altKey && /^[1-7]$/.test(event.key)) {
      event.preventDefault();
      navigate(['dashboard', 'plugins', 'sets', 'sessions', 'skills', 'logs', 'settings'][Number(event.key) - 1]);
    }
  });
}

function openCommandPalette() {
  if (document.querySelector('.command-overlay')) {
    document.querySelector('.command-overlay').remove();
    return;
  }
  const actions = [
    ...Object.entries(ROUTES).map(([route, meta]) => ({
      id: route,
      group: '前往',
      label: meta.title,
      description: meta.subtitle,
      icon: meta.icon,
      run: () => navigate(route),
    })),
    { id: 'refresh', group: '操作', label: '刷新全部状态', icon: 'refresh', run: () => ctx.refresh() },
    { id: 'theme', group: '操作', label: '切换深色 / 浅色主题', icon: state.theme === 'dark' ? 'sun' : 'moon', run: () => ctx.setTheme() },
    { id: 'plugins-ai', group: '操作', label: '打开插件并完善中文资料', icon: 'wand', run: () => navigate('plugins') },
    { id: 'new-set', group: '操作', label: '去套装页新建套装', icon: 'plus', run: () => navigate('sets') },
    { id: 'logs-folder', group: '操作', label: '打开日志目录', icon: 'folder', run: () => api.logs.openDir().catch(() => {}) },
    { id: 'data-folder', group: '操作', label: '打开应用数据目录', icon: 'database', run: () => ctx.openPath(state.boot?.paths?.dataDir) },
    { id: 'dsh-folder', group: '操作', label: '打开 DSH Home', icon: 'folderOpen', run: () => ctx.openPath(state.boot?.paths?.dshHome) },
  ];
  const overlay = document.createElement('div');
  overlay.className = 'command-overlay';
  overlay.innerHTML = `<div class="command" role="dialog" aria-label="命令面板">
    <div class="command-input-wrap">${icon('search', 17)}<input class="command-input" placeholder="搜索页面或操作…" autocomplete="off" spellcheck="false"><kbd>ESC</kbd></div>
    <div class="command-list"></div>
  </div>`;
  document.body.append(overlay);
  const input = overlay.querySelector('.command-input');
  const list = overlay.querySelector('.command-list');
  let filtered = actions;
  let activeIndex = 0;

  const render = () => {
    if (!filtered.length) {
      list.innerHTML = '<div class="command-empty">没有匹配的命令</div>';
      return;
    }
    let lastGroup = '';
    list.innerHTML = filtered.map((action, index) => {
      const group = action.group !== lastGroup ? `<div class="command-group">${escapeHtml(action.group)}</div>` : '';
      lastGroup = action.group;
      return `${group}<button class="command-item ${index === activeIndex ? 'active' : ''}" data-command-index="${index}" type="button">
        ${icon(action.icon, 16)}
        <span>${escapeHtml(action.label)}</span>
        ${action.description ? `<span class="muted" style="margin-left:auto;font-size:9.5px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(action.description)}</span>` : ''}
      </button>`;
    }).join('');
  };
  const filter = () => {
    const query = input.value.trim().toLowerCase();
    filtered = query
      ? actions.filter((action) => `${action.label} ${action.description || ''} ${action.group}`.toLowerCase().includes(query))
      : actions;
    activeIndex = 0;
    render();
  };
  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  };
  const run = (action) => {
    if (!action) return;
    close();
    setTimeout(() => action.run(), 40);
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); activeIndex = Math.min(activeIndex + 1, filtered.length - 1); render(); scrollActive(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); render(); scrollActive(); }
    else if (event.key === 'Enter') { event.preventDefault(); run(filtered[activeIndex]); }
  };
  const scrollActive = () => list.querySelector('.command-item.active')?.scrollIntoView({ block: 'nearest' });
  input.addEventListener('input', filter);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
    const button = event.target.closest('[data-command-index]');
    if (button) run(filtered[Number(button.dataset.commandIndex)]);
  });
  document.addEventListener('keydown', onKeydown);
  render();
  setTimeout(() => input.focus(), 30);
}

// Keep a reference used by dashboard log shortcuts.
export { ctx, state };
