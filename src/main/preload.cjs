// Preload runs in an isolated world. Keep this file CommonJS: sandboxed
// preload scripts cannot use ESM imports.
const { contextBridge, ipcRenderer } = require('electron');

const IPC = {
  BOOTSTRAP: 'hub:bootstrap',
  REFRESH: 'hub:refresh',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  MODEL_STATUS: 'model:status',
  MODEL_TEST: 'model:test',
  PROFILES_LIST: 'profiles:list',
  PROFILE_SELECT: 'profile:select',
  PLUGINS_LIST: 'plugins:list',
  PLUGIN_DETAIL: 'plugins:detail',
  PLUGIN_TOGGLE: 'plugins:toggle',
  PLUGIN_TOGGLE_MANY: 'plugins:toggle-many',
  PLUGIN_UPDATE_META: 'plugins:update-meta',
  PLUGIN_AI: 'plugins:ai',
  PLUGIN_AI_BATCH: 'plugins:ai-batch',
  PLUGIN_LOCAL_SUGGEST: 'plugins:local-suggest',
  PLUGIN_REVEAL: 'plugins:reveal',
  SETS_LIST: 'sets:list',
  SET_CREATE: 'sets:create',
  SET_UPDATE: 'sets:update',
  SET_DELETE: 'sets:delete',
  SET_APPLY: 'sets:apply',
  SESSIONS_LIST: 'sessions:list',
  SESSION_DETAIL: 'sessions:detail',
  SESSION_TRASH: 'sessions:trash',
  SESSION_EXPORT: 'sessions:export',
  SESSION_REVEAL: 'sessions:reveal',
  SKILLS_LIST: 'skills:list',
  SKILL_DETAIL: 'skills:detail',
  SKILL_CREATE: 'skills:create',
  SKILL_SAVE: 'skills:save',
  SKILL_DELETE: 'skills:delete',
  SKILL_DUPLICATE: 'skills:duplicate',
  SKILL_REVEAL: 'skills:reveal',
  LOGS_LIST: 'logs:list',
  LOGS_TAIL: 'logs:tail',
  LOGS_CRASHES: 'logs:crashes',
  LOGS_CRASH_READ: 'logs:crash-read',
  LOGS_AI_ANALYZE: 'logs:ai-analyze',
  LOGS_DIAGNOSTICS: 'logs:diagnostics',
  LOGS_CLEAR: 'logs:clear',
  LOGS_OPEN_DIR: 'logs:open-dir',
  LOGS_REPORT_RENDERER: 'logs:renderer-error',
  SHELL_OPEN_PATH: 'shell:open-path',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  APP_STATUS: 'app:status',
  APP_RESTART: 'app:restart',
  APP_LAUNCH: 'app:launch',
  APP_RELOAD: 'app:reload',
  APP_RELOAD_DSH: 'app:reload-dsh',
  MARKET_LIST: 'market:list',
  MARKET_DETAIL: 'market:detail',
  MARKET_INSTALL: 'market:install',
  MARKET_UPDATE: 'market:update',
  MARKET_UNINSTALL: 'market:uninstall',
  MARKET_CUSTOM_INSTALL: 'market:custom-install',
  MARKET_HISTORY: 'market:history',
  MARKET_PROGRESS: 'market:progress',
  SNAPSHOTS_LIST: 'snapshots:list',
  SNAPSHOT_CREATE: 'snapshots:create',
  SNAPSHOT_RESTORE: 'snapshots:restore',
  SNAPSHOT_DELETE: 'snapshots:delete',
  SNAPSHOT_REVEAL: 'snapshots:reveal',
  AI_PROGRESS: 'ai:progress',
};

async function invoke(channel, payload) {
  const response = await ipcRenderer.invoke(channel, payload);
  if (!response || response.ok !== true) {
    const info = response && response.error ? response.error : { code: 'IPC_ERROR', message: '操作失败。' };
    const error = new Error(info.message || '操作失败。');
    error.name = 'DshHubError';
    error.code = info.code || 'IPC_ERROR';
    error.details = info.details;
    error.retryable = Boolean(info.retryable);
    throw error;
  }
  return response.data;
}

const api = {
  bootstrap: () => invoke(IPC.BOOTSTRAP),
  refresh: () => invoke(IPC.REFRESH),
  settings: {
    get: () => invoke(IPC.SETTINGS_GET),
    update: (patch) => invoke(IPC.SETTINGS_UPDATE, { patch }),
  },
  model: {
    status: (profile) => invoke(IPC.MODEL_STATUS, { profile }),
    test: (profile) => invoke(IPC.MODEL_TEST, { profile }),
  },
  profiles: {
    list: () => invoke(IPC.PROFILES_LIST),
    select: (name) => invoke(IPC.PROFILE_SELECT, { name }),
  },
  plugins: {
    list: (profile) => invoke(IPC.PLUGINS_LIST, { profile }),
    detail: (name, profile) => invoke(IPC.PLUGIN_DETAIL, { name, profile }),
    toggle: (name, enabled, profile) => invoke(IPC.PLUGIN_TOGGLE, { name, enabled, profile }),
    toggleMany: (names, enabled, profile) => invoke(IPC.PLUGIN_TOGGLE_MANY, { names, enabled, profile }),
    updateMeta: (name, meta, profile) => invoke(IPC.PLUGIN_UPDATE_META, { name, meta, profile }),
    aiGenerate: (name, profile, options) => invoke(IPC.PLUGIN_AI, { name, profile, ...options }),
    aiBatch: (names, profile) => invoke(IPC.PLUGIN_AI_BATCH, { names, profile }),
    localSuggest: (name, profile) => invoke(IPC.PLUGIN_LOCAL_SUGGEST, { name, profile }),
    reveal: (name, profile) => invoke(IPC.PLUGIN_REVEAL, { name, profile }),
  },
  sets: {
    list: (profile) => invoke(IPC.SETS_LIST, { profile }),
    create: (set, profile) => invoke(IPC.SET_CREATE, { set, profile }),
    update: (id, set, profile) => invoke(IPC.SET_UPDATE, { id, set, profile }),
    remove: (id, profile) => invoke(IPC.SET_DELETE, { id, profile }),
    apply: (id, action, profile) => invoke(IPC.SET_APPLY, { id, action, profile }),
  },
  sessions: {
    list: (options) => invoke(IPC.SESSIONS_LIST, options || {}),
    detail: (id) => invoke(IPC.SESSION_DETAIL, { id }),
    trash: (id) => invoke(IPC.SESSION_TRASH, { id }),
    export: (id) => invoke(IPC.SESSION_EXPORT, { id }),
    reveal: (id) => invoke(IPC.SESSION_REVEAL, { id }),
  },
  skills: {
    list: () => invoke(IPC.SKILLS_LIST),
    detail: (key) => invoke(IPC.SKILL_DETAIL, { key }),
    create: (skill) => invoke(IPC.SKILL_CREATE, { skill }),
    save: (key, content) => invoke(IPC.SKILL_SAVE, { key, content }),
    remove: (key) => invoke(IPC.SKILL_DELETE, { key }),
    duplicate: (key, slug) => invoke(IPC.SKILL_DUPLICATE, { key, slug }),
    reveal: (key) => invoke(IPC.SKILL_REVEAL, { key }),
  },
  logs: {
    list: () => invoke(IPC.LOGS_LIST),
    tail: (name, lines) => invoke(IPC.LOGS_TAIL, { name, lines }),
    crashes: () => invoke(IPC.LOGS_CRASHES),
    crash: (id) => invoke(IPC.LOGS_CRASH_READ, { id }),
    aiAnalyze: (profile) => invoke(IPC.LOGS_AI_ANALYZE, { profile }),
    diagnostics: () => invoke(IPC.LOGS_DIAGNOSTICS),
    clear: () => invoke(IPC.LOGS_CLEAR),
    openDir: () => invoke(IPC.LOGS_OPEN_DIR),
    reportRendererError: (payload) => invoke(IPC.LOGS_REPORT_RENDERER, payload).catch(() => {}),
  },
  shell: {
    openPath: (target) => invoke(IPC.SHELL_OPEN_PATH, { path: target }),
    openExternal: (url) => invoke(IPC.SHELL_OPEN_EXTERNAL, { url }),
  },
  app: {
    status: () => invoke(IPC.APP_STATUS),
    restart: () => invoke(IPC.APP_RESTART),
    launch: () => invoke(IPC.APP_LAUNCH),
    reload: () => invoke(IPC.APP_RELOAD),
    reloadDsh: () => invoke(IPC.APP_RELOAD_DSH),
  },
  market: {
    list: (options, profile) => invoke(IPC.MARKET_LIST, { options, profile }),
    detail: (id, profile) => invoke(IPC.MARKET_DETAIL, { id, profile }),
    install: (id, profile) => invoke(IPC.MARKET_INSTALL, { id, profile }),
    update: (id, profile) => invoke(IPC.MARKET_UPDATE, { id, profile }),
    uninstall: (id, profile) => invoke(IPC.MARKET_UNINSTALL, { id, profile }),
    customInstall: (spec, profile) => invoke(IPC.MARKET_CUSTOM_INSTALL, { spec, profile }),
    history: () => invoke(IPC.MARKET_HISTORY),
    onProgress: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on(IPC.MARKET_PROGRESS, listener);
      return () => ipcRenderer.removeListener(IPC.MARKET_PROGRESS, listener);
    },
  },
  snapshots: {
    list: (profile) => invoke(IPC.SNAPSHOTS_LIST, { profile }),
    create: (label, profile) => invoke(IPC.SNAPSHOT_CREATE, { label, profile }),
    restore: (id, profile) => invoke(IPC.SNAPSHOT_RESTORE, { id, profile }),
    remove: (id, profile) => invoke(IPC.SNAPSHOT_DELETE, { id, profile }),
    reveal: (id, profile) => invoke(IPC.SNAPSHOT_REVEAL, { id, profile }),
  },
  onAiProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC.AI_PROGRESS, listener);
    return () => ipcRenderer.removeListener(IPC.AI_PROGRESS, listener);
  },
};

contextBridge.exposeInMainWorld('dshHub', Object.freeze(api));
