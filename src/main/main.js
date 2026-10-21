import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  Menu,
  crashReporter,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} from 'electron';

import { APP_NAME, APP_NAME_ZH, APP_VERSION, APP_ID } from '../shared/constants.js';
import { Logger, serializeError } from './services/logger.js';
import { SettingsStore, ensureDataDirs } from './services/settings-store.js';
import { ProfileService } from './services/profile-service.js';
import { CatalogService } from './services/catalog-service.js';
import { MetadataStore } from './services/metadata-store.js';
import { PluginService } from './services/plugin-service.js';
import { SetService } from './services/set-service.js';
import { SessionService } from './services/session-service.js';
import { SkillService } from './services/skill-service.js';
import { ModelService } from './services/model-service.js';
import { SnapshotService } from './services/snapshot-service.js';
import { MarketplaceService } from './services/marketplace-service.js';
import { AppControlService } from './services/app-control-service.js';
import { registerIpc } from './ipc.js';
import { resolveDataDir, detectDshInstall, dshVersionFromInstall } from './app-paths.js';
import { readJsonSync, writeJsonAtomicSync, ensureDir } from './utils/fs-utils.js';
import { redactSecrets } from './utils/parse-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');

if (!app) {
  console.error('DSH Hub must be launched with Electron, not Node.');
  process.exit(2);
}

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);
if (process.platform === 'win32') app.commandLine.appendSwitch('lang', 'zh-CN');

const dataDir = resolveDataDir({ appRoot: APP_ROOT, isPackaged: app.isPackaged, execPath: process.execPath });
ensureDataDirs(dataDir);
ensureDir(path.join(dataDir, 'chromium'));
app.setPath('userData', path.join(dataDir, 'chromium'));
app.setPath('sessionData', path.join(dataDir, 'chromium'));

const logger = new Logger({ dataDir, appVersion: APP_VERSION });
logger.init();

let mainWindow = null;
let services = null;
let isQuitting = false;
let fatalError = false;
let settingsStore = null;

process.on('uncaughtException', (error) => {
  fatalError = true;
  logger.error('fatal', 'Uncaught exception in main process', { error: serializeError(error) });
  logger.createCrashReport({
    type: 'main-exception',
    title: '主进程发生未捕获异常',
    detail: error?.message || String(error),
    scope: 'main',
    error,
  });
  try {
    if (app.isReady()) {
      dialog.showErrorBox(
        'DSH Hub 遇到错误',
        `应用即将退出，诊断信息已写入：\n${logger.crashesDir}\n\n${redactSecrets(error?.message || String(error))}`,
      );
    }
  } catch {}
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('fatal', 'Unhandled promise rejection', { reason: serializeError(reason) });
  logger.createCrashReport({
    type: 'unhandled-rejection',
    title: '未处理的 Promise 拒绝',
    detail: reason?.message || String(reason),
    scope: 'main',
    error: reason,
  });
});

process.on('warning', (warning) => {
  logger.warn('process', warning.message, { name: warning.name, stack: warning.stack });
});

try {
  crashReporter.start({
    productName: APP_NAME,
    companyName: 'DSH Hub',
    submitURL: '',
    uploadToServer: false,
    compress: false,
    ignoreSystemCrashHandler: false,
  });
} catch (error) {
  logger.warn('lifecycle', 'Electron crash reporter could not start', { error: error.message });
}

if (process.argv.includes('--self-test')) {
  await runSelfTest({ doctor: process.argv.includes('--doctor') });
} else {
  startApp();
}

function startApp() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    logger.info('lifecycle', 'A second instance was blocked by the single-instance lock');
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      services = createServices();
      settingsStore = services.settings;
      applyTheme(settingsStore.get());
      Menu.setApplicationMenu(null);
      registerIpc({
        app,
        ipcMain,
        shell,
        dialog,
        mainWindow,
        services,
        logger,
        dataDir,
        appRoot: APP_ROOT,
        getMainWindow: () => mainWindow,
        onSettingsChanged: (next) => applyTheme(next),
      });
      createWindow();
      logger.info('lifecycle', 'Application ready', {
        dataDir,
        dshHome: safeCall(() => services.settings.getDshHome()),
        profiles: safeCall(() => services.profileService.listProfiles().map((item) => item.name)),
      });
    } catch (error) {
      fatalError = true;
      logger.error('lifecycle', 'Startup failed', { error: serializeError(error) });
      logger.createCrashReport({
        type: 'startup-failure',
        title: '启动失败',
        detail: error?.message || String(error),
        scope: 'startup',
        error,
      });
      dialog.showErrorBox(
        'DSH Hub 无法启动',
        `${error?.message || String(error)}\n\n诊断日志：\n${logger.logsDir}`,
      );
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('will-quit', () => {
    if (!fatalError) logger.markCleanExit(isQuitting ? 'user-quit' : 'app-quit');
  });
}

function createServices() {
  const settings = new SettingsStore({ dataDir, logger });
  const profileService = new ProfileService({ settings, logger });
  const catalogService = new CatalogService({ profileService, logger });
  const metadataStore = new MetadataStore({ profileService, settings, logger });
  const pluginService = new PluginService({ profileService, catalogService, metadataStore, logger });
  const setService = new SetService({ profileService, pluginService, metadataStore, logger });
  const sessionService = new SessionService({ settings, profileService, logger });
  const skillService = new SkillService({ profileService, logger, dataDir });
  const modelService = new ModelService({ settings, profileService, pluginService, logger });
  const snapshotService = new SnapshotService({ profileService, settings, logger, appVersion: APP_VERSION });
  const marketplaceService = new MarketplaceService({
    profileService,
    catalogService,
    pluginService,
    snapshotService,
    settings,
    logger,
    dataDir,
  });
  const appControlService = new AppControlService({ settings, profileService, logger, dataDir });
  return {
    settings,
    profileService,
    catalogService,
    metadataStore,
    pluginService,
    setService,
    sessionService,
    skillService,
    modelService,
    snapshotService,
    marketplaceService,
    appControlService,
  };
}

function createWindow() {
  const stateFile = path.join(dataDir, 'window-state.json');
  const previous = readJsonSync(stateFile, {});
  const width = clamp(Number(previous.width) || 1480, 1080, 2200);
  const height = clamp(Number(previous.height) || 940, 700, 1500);
  const icon = path.join(APP_ROOT, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#070b12',
    title: `${APP_NAME} · ${APP_NAME_ZH}`,
    icon: fs.existsSync(icon) ? icon : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: process.env.DSH_HUB_DEV === '1' || !app.isPackaged,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  const initialHash = process.env.DSH_HUB_ROUTE ? `/${String(process.env.DSH_HUB_ROUTE).replace(/^#?\/?/, '')}` : '';
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), initialHash ? { hash: initialHash } : undefined);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.env.DSH_HUB_DEV === '1') mainWindow.webContents.openDevTools({ mode: 'detach' });
    if (process.env.DSH_HUB_CAPTURE) {
      if (process.env.DSH_HUB_CAPTURE_JS) {
        setTimeout(() => {
          mainWindow.webContents.executeJavaScript(process.env.DSH_HUB_CAPTURE_JS).catch((error) => {
            logger.warn('renderer', 'Capture script failed', { error: error.message });
          });
        }, 2_000);
      }
      setTimeout(async () => {
        try {
          const image = await mainWindow.webContents.capturePage();
          const target = path.resolve(process.env.DSH_HUB_CAPTURE);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, image.toPNG());
          logger.info('renderer', 'Screenshot captured', { target });
        } catch (error) {
          logger.error('renderer', 'Screenshot capture failed', { error: error.message });
        } finally {
          app.exit(0);
        }
      }, Number(process.env.DSH_HUB_CAPTURE_DELAY) || 4_000);
    }
  });

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('close', () => {
    saveWindowState();
    logger.info('lifecycle', 'Main window closing');
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(url);
    } catch {}
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('renderer', 'Renderer process gone', details);
    logger.createCrashReport({
      type: 'renderer-gone',
      title: '渲染进程崩溃',
      detail: details.reason || 'unknown',
      scope: 'renderer',
      extra: details,
    });
    if (isQuitting || !mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: '界面进程崩溃',
      message: 'DSH Hub 的界面进程意外退出。',
      detail: `原因：${details.reason || 'unknown'}\n诊断日志已保存。`,
      buttons: ['重新加载', '退出'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0 && mainWindow) mainWindow.reload();
      else app.quit();
    }).catch(() => app.quit());
  });

  mainWindow.webContents.on('child-process-gone', (_event, details) => {
    logger.error('renderer', 'Child process gone', details);
    if (details.type === 'GPU') return;
    logger.createCrashReport({
      type: 'child-process-gone',
      title: '子进程崩溃',
      detail: `${details.type}: ${details.reason}`,
      scope: 'main',
      extra: details,
    });
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  function saveWindowState() {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    try {
      const bounds = mainWindow.getBounds();
      writeJsonAtomicSync(stateFile, { ...bounds, savedAt: Date.now() });
    } catch {}
  }
}

function applyTheme(settings) {
  try {
    const theme = settings?.ui?.theme || 'dark';
    nativeTheme.themeSource = theme === 'light' ? 'light' : theme === 'system' ? 'system' : 'dark';
  } catch (error) {
    logger.warn('settings', 'Unable to apply native theme', { error: error.message });
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function safeCall(fn) {
  try { return fn(); } catch { return null; }
}

async function runSelfTest({ doctor = false } = {}) {
  try {
    const localServices = createServices();
    const profiles = localServices.profileService.listProfiles();
    const active = profiles.length ? localServices.profileService.resolveActiveProfile() : '';
    const result = {
      ok: false,
      app: APP_NAME,
      version: APP_VERSION,
      at: new Date().toISOString(),
      dataDir,
      isPackaged: app.isPackaged,
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      profiles,
      activeProfile: active,
      install: detectDshInstall(localServices.settings.get()),
      dshVersion: dshVersionFromInstall(detectDshInstall(localServices.settings.get()).dir),
      checks: {},
    };
    if (active) {
      const plugins = await localServices.pluginService.list(active);
      const sessions = await localServices.sessionService.list();
      const skills = await localServices.skillService.list();
      const sets = await localServices.setService.list(active);
      result.plugins = plugins.profile;
      result.sessions = sessions.stats;
      result.skills = skills.stats;
      result.sets = sets.stats;
      result.model = localServices.modelService.status(active);
      result.checks.profile = true;
      result.checks.plugins = plugins.plugins.length > 0;
      result.checks.sessions = sessions.sessions.length > 0;
      result.checks.skills = skills.skills.length > 0;
      result.checks.setsFile = fs.existsSync(path.join(profiles.find((profile) => profile.name === active)?.dir || '', '.dsh-hub', 'sets.json'));
    }
    result.checks.logsWritable = fs.existsSync(logger.logsDir);
    result.checks.credentialsFound = Boolean(result.model?.configured);
    result.ok = Boolean(active && result.checks.logsWritable);
    if (doctor) {
      result.diagnostics = {
        paths: {
          dataDir,
          logsDir: logger.logsDir,
          crashesDir: logger.crashesDir,
          settingsFile: localServices.settings.getSettingsFile(),
          dshHome: safeCall(() => localServices.settings.getDshHome()),
        },
        crashes: logger.listCrashes(),
        previousRun: logger.getPreviousRun(),
      };
    }
    const target = path.join(dataDir, 'self-test.json');
    writeJsonAtomicSync(target, result);
    logger.info('lifecycle', 'Self-test completed', { ok: result.ok, active, target });
    logger.markCleanExit('self-test');
    console.log(JSON.stringify(result, null, 2));
    app.exit(result.ok ? 0 : 1);
  } catch (error) {
    fatalError = true;
    const report = {
      ok: false,
      error: serializeError(error),
      dataDir,
      at: new Date().toISOString(),
    };
    try { writeJsonAtomicSync(path.join(dataDir, 'self-test.json'), report); } catch {}
    logger.error('lifecycle', 'Self-test failed', { error: serializeError(error) });
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}
