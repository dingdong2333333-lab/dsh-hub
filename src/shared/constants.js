/**
 * Shared constants used by the main process, preload, and renderer.
 * Keep this module free of Node.js and Electron imports so it can be used
 * from every process.
 */

export const APP_NAME = 'DSH Hub';
export const APP_NAME_ZH = 'DSH 中枢';
export const APP_VERSION = '0.2.2';
export const APP_ID = 'dev.dshhub.app';
export const REPO_URL = 'https://github.com/your-org/dsh-hub';

export const IPC = Object.freeze({
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
});

/** Bundles that are required for the DSH profile to boot. */
export const PROTECTED_BUNDLES = Object.freeze([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
]);

export const PLUGIN_FILTERS = Object.freeze({
  all: '全部',
  enabled: '已启用',
  disabled: '未启用',
  favorite: '收藏',
  missing: '异常',
});

export const SET_COLORS = Object.freeze([
  '#3ee0c0',
  '#5b8cff',
  '#ff9f6e',
  '#c084fc',
  '#f472b6',
  '#facc15',
]);

export const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  dshHome: '',
  dshInstallDir: '',
  activeProfile: '',
  model: {
    baseUrl: '',
    model: '',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    timeoutMs: 60_000,
    fallbackToCatalog: true,
  },
  ui: {
    theme: 'dark',
    compact: false,
    reduceMotion: false,
    minimizeToTray: true,
    closeToTray: true,
  },
  safety: {
    confirmMutations: true,
    backupRetention: 30,
  },
});

export const MODEL_CATEGORIES = Object.freeze([
  '界面',
  '工具',
  '集成',
  '模型',
  '效率',
  '皮肤',
  '开发',
  '其他',
]);

export const RENDERER_ERROR_THROTTLE_MS = 5_000;
