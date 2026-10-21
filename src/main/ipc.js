import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { IPC, APP_VERSION } from '../shared/constants.js';
import { AppError, isAppError } from './utils/errors.js';
import { formatBytes, isSubPath, pathExists } from './utils/fs-utils.js';
import { safeHttpUrl } from './utils/parse-utils.js';
import { dshVersionFromInstall } from './app-paths.js';
import { toPublicSettings } from './settings-public.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * All privileged operations cross this boundary. The renderer never receives
 * filesystem, shell, or credential primitives.
 */
export function registerIpc({ app, ipcMain, shell, dialog, mainWindow, services, logger, dataDir, appRoot, getMainWindow, onSettingsChanged }) {
  const {
    settings,
    profileService,
    pluginService,
    setService,
    sessionService,
    skillService,
    modelService,
    metadataStore,
    snapshotService,
    marketplaceService,
    appControlService,
  } = services;
  const activeProfile = (requested) => profileService.resolveActiveProfile(requested || '');
  const autoSnapshot = (profile, label) => snapshotService.autoBefore(profile, label, 'automatic');

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, payload) => {
      if (!isTrustedSender(event)) {
        logger.warn('Rejected IPC from untrusted sender', { channel, url: event?.senderFrame?.url || '' });
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: '拒绝来自未知页面的请求。' } };
      }
      const safePayload = payload && typeof payload === 'object' ? payload : {};
      try {
        const data = await fn(safePayload, event);
        return { ok: true, data };
      } catch (error) {
        const appError = isAppError(error) ? error : new AppError('IPC_FAILED', '操作失败，请查看诊断日志。', {
          cause: error,
          details: error instanceof Error ? error.message : String(error),
        });
        const level = appError.code === 'PROFILE_LOCKED' ? 'warn' : 'error';
        logger[level]('ipc', `${channel} failed`, {
          code: appError.code,
          message: appError.message,
          details: appError.details,
          stack: error instanceof Error ? error.stack : undefined,
        });
        return { ok: false, error: appError.toJSON ? appError.toJSON() : { code: appError.code, message: appError.message } };
      }
    });
  };

  handle(IPC.BOOTSTRAP, async () => bootstrapData());
  handle(IPC.REFRESH, async () => bootstrapData());

  handle(IPC.SETTINGS_GET, async () => ({ settings: toPublicSettings(settings.get()), paths: settingsPaths() }));
  handle(IPC.SETTINGS_UPDATE, async (payload) => {
    const next = settings.update(payload?.patch || payload || {});
    onSettingsChanged?.(next);
    return { settings: toPublicSettings(next), paths: settingsPaths(), bootstrap: await bootstrapData() };
  });

  handle(IPC.MODEL_STATUS, async (payload) => modelService.status(activeProfile(payload.profile)));
  handle(IPC.MODEL_TEST, async (payload) => modelService.test(activeProfile(payload.profile)));

  handle(IPC.PROFILES_LIST, async () => profileService.listProfiles());
  handle(IPC.PROFILE_SELECT, async (payload) => {
    const name = String(payload.name || '');
    const profile = profileService.setActiveProfile(name);
    return {
      activeProfile: profile.name,
      bootstrap: await bootstrapData(),
    };
  });

  handle(IPC.PLUGINS_LIST, async (payload) => pluginService.list(activeProfile(payload.profile)));
  handle(IPC.PLUGIN_DETAIL, async (payload) => pluginService.detail(activeProfile(payload.profile), requireString(payload.name, '插件名称')));
  handle(IPC.PLUGIN_TOGGLE, async (payload) => {
    if (typeof payload.enabled !== 'boolean') throw new AppError('INVALID_ARGUMENT', 'enabled 必须是布尔值。');
    const profile = activeProfile(payload.profile);
    await autoSnapshot(profile, `切换插件 ${payload.name} 前自动快照`);
    return pluginService.setEnabled(profile, requireString(payload.name, '插件名称'), payload.enabled);
  });
  handle(IPC.PLUGIN_TOGGLE_MANY, async (payload) => {
    if (!Array.isArray(payload.names)) throw new AppError('INVALID_ARGUMENT', '插件列表不合法。');
    if (typeof payload.enabled !== 'boolean') throw new AppError('INVALID_ARGUMENT', 'enabled 必须是布尔值。');
    const profile = activeProfile(payload.profile);
    await autoSnapshot(profile, `批量切换 ${payload.names.length} 个插件前自动快照`);
    return pluginService.setMany(profile, payload.names, payload.enabled);
  });
  handle(IPC.PLUGIN_UPDATE_META, async (payload) => {
    const profile = activeProfile(payload.profile);
    return pluginService.updateMeta(profile, requireString(payload.name, '插件名称'), payload.meta || {});
  });
  handle(IPC.PLUGIN_AI, async (payload) => {
    const profile = activeProfile(payload.profile);
    return modelService.generateForPlugin(profile, requireString(payload.name, '插件名称'), { force: Boolean(payload.force) });
  });
  handle(IPC.PLUGIN_AI_BATCH, async (payload, event) => {
    const profile = activeProfile(payload.profile);
    if (!Array.isArray(payload.names)) throw new AppError('INVALID_ARGUMENT', '插件列表不合法。');
    await autoSnapshot(profile, `批量生成 ${payload.names.length} 个插件资料前自动快照`);
    return modelService.generateBatch(profile, payload.names, (progress) => {
      try {
        if (!event.sender.isDestroyed()) event.sender.send(IPC.AI_PROGRESS, progress);
      } catch {}
    });
  });
  handle(IPC.PLUGIN_LOCAL_SUGGEST, async (payload) => modelService.localSuggestion(activeProfile(payload.profile), requireString(payload.name, '插件名称')));
  handle(IPC.PLUGIN_REVEAL, async (payload) => {
    const target = pluginService.getRevealPath(activeProfile(payload.profile), requireString(payload.name, '插件名称'));
    shell.showItemInFolder(target);
    return { path: target };
  });

  handle(IPC.SETS_LIST, async (payload) => setService.list(activeProfile(payload.profile)));
  handle(IPC.SET_CREATE, async (payload) => setService.create(activeProfile(payload.profile), payload.set || payload));
  handle(IPC.SET_UPDATE, async (payload) => setService.update(activeProfile(payload.profile), requireString(payload.id, '套装 ID'), payload.set || payload));
  handle(IPC.SET_DELETE, async (payload) => setService.delete(activeProfile(payload.profile), requireString(payload.id, '套装 ID')));
  handle(IPC.SET_APPLY, async (payload) => {
    const profile = activeProfile(payload.profile);
    await autoSnapshot(profile, `应用套装 ${payload.id} 前自动快照`);
    return setService.apply(profile, requireString(payload.id, '套装 ID'), String(payload.action || 'enable'));
  });

  handle(IPC.SESSIONS_LIST, async (payload) => sessionService.list({ force: Boolean(payload.force) }));
  handle(IPC.SESSION_DETAIL, async (payload) => sessionService.detail(requireString(payload.id, '会话 ID')));
  handle(IPC.SESSION_TRASH, async (payload) => sessionService.trashSession(requireString(payload.id, '会话 ID'), (target) => shell.trashItem(target)));
  handle(IPC.SESSION_EXPORT, async (payload) => {
    const id = requireString(payload.id, '会话 ID');
    const exported = await sessionService.exportSession(id);
    const win = getMainWindow?.() || mainWindow;
    const result = await dialog.showSaveDialog(win, {
      title: '导出会话日志',
      defaultPath: path.join(app.getPath('downloads'), exported.suggestedName),
      filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fsp.writeFile(result.filePath, exported.content, 'utf8');
    logger.info('Session exported', { id, target: result.filePath, bytes: Buffer.byteLength(exported.content) });
    return { canceled: false, path: result.filePath, bytes: Buffer.byteLength(exported.content) };
  });
  handle(IPC.SESSION_REVEAL, async (payload) => {
    const target = sessionService.getRevealPath(requireString(payload.id, '会话 ID'));
    shell.showItemInFolder(target);
    return { path: target };
  });

  handle(IPC.SKILLS_LIST, async () => skillService.list());
  handle(IPC.SKILL_DETAIL, async (payload) => skillService.detail(requireString(payload.key, 'Skill 标识')));
  handle(IPC.SKILL_CREATE, async (payload) => skillService.create(payload.skill || payload));
  handle(IPC.SKILL_SAVE, async (payload) => skillService.save(requireString(payload.key, 'Skill 标识'), String(payload.content ?? '')));
  handle(IPC.SKILL_DELETE, async (payload) => skillService.delete(requireString(payload.key, 'Skill 标识'), (target) => shell.trashItem(target)));
  handle(IPC.SKILL_DUPLICATE, async (payload) => skillService.duplicate(requireString(payload.key, 'Skill 标识'), requireString(payload.slug, '新标识')));
  handle(IPC.SKILL_REVEAL, async (payload) => {
    const target = skillService.getRevealPath(requireString(payload.key, 'Skill 标识'));
    shell.showItemInFolder(target);
    return { path: target };
  });

  handle(IPC.LOGS_LIST, async () => ({ logs: logger.listLogs(), diagnostics: baseDiagnostics() }));
  handle(IPC.LOGS_TAIL, async (payload) => logger.tail(payload.name || 'app.log', payload.lines || 300));
  handle(IPC.LOGS_CRASHES, async () => logger.listCrashes());
  handle(IPC.LOGS_CRASH_READ, async (payload) => {
    const result = logger.readCrash(requireString(payload.id, '崩溃记录 ID'));
    return result;
  });
  handle(IPC.LOGS_AI_ANALYZE, async (payload) => modelService.analyzeCrashes(activeProfile(payload.profile)));
  handle(IPC.LOGS_DIAGNOSTICS, async () => diagnostics());
  handle(IPC.LOGS_CLEAR, async () => logger.clearLogs());
  handle(IPC.LOGS_OPEN_DIR, async () => {
    await shell.openPath(logger.logsDir);
    return { path: logger.logsDir };
  });
  handle(IPC.LOGS_REPORT_RENDERER, async (payload) => logger.reportRendererError(payload || {}));

  handle(IPC.SHELL_OPEN_PATH, async (payload) => {
    const target = requireString(payload.path, '路径');
    assertAllowedPath(target);
    const error = await shell.openPath(target);
    if (error) throw new AppError('OPEN_FAILED', `无法打开路径：${error}`, { details: target });
    return { path: target };
  });
  handle(IPC.SHELL_OPEN_EXTERNAL, async (payload) => {
    const url = safeHttpUrl(payload.url);
    if (!url) throw new AppError('INVALID_URL', '只能打开 HTTP(S) 链接。');
    await shell.openExternal(url);
    return { url };
  });

  handle(IPC.APP_STATUS, async () => appControlService.status());
  handle(IPC.APP_RESTART, async () => appControlService.restart());
  handle(IPC.APP_LAUNCH, async () => appControlService.launch());
  handle(IPC.APP_RELOAD, async () => {
    const win = getMainWindow?.() || mainWindow;
    win?.reload();
    return { reloaded: Boolean(win) };
  });
  handle(IPC.APP_RELOAD_DSH, async () => appControlService.reloadDsh());

  handle(IPC.MARKET_LIST, async (payload) => marketplaceService.list(activeProfile(payload.profile), payload.options || {}));
  handle(IPC.MARKET_DETAIL, async (payload) => marketplaceService.detail(activeProfile(payload.profile), requireString(payload.id, '插件 ID')));
  handle(IPC.MARKET_INSTALL, async (payload, event) => marketplaceService.install(
    activeProfile(payload.profile),
    requireString(payload.id, '插件 ID'),
    (progress) => sendProgress(event, IPC.MARKET_PROGRESS, progress),
  ));
  handle(IPC.MARKET_UPDATE, async (payload, event) => marketplaceService.update(
    activeProfile(payload.profile),
    requireString(payload.id, '插件 ID'),
    (progress) => sendProgress(event, IPC.MARKET_PROGRESS, progress),
  ));
  handle(IPC.MARKET_UNINSTALL, async (payload, event) => marketplaceService.uninstall(
    activeProfile(payload.profile),
    requireString(payload.id, '插件 ID'),
    (progress) => sendProgress(event, IPC.MARKET_PROGRESS, progress),
  ));
  handle(IPC.MARKET_CUSTOM_INSTALL, async (payload, event) => marketplaceService.customInstall(
    activeProfile(payload.profile),
    requireString(payload.spec, '安装地址'),
    (progress) => sendProgress(event, IPC.MARKET_PROGRESS, progress),
  ));
  handle(IPC.MARKET_HISTORY, async () => marketplaceService.getHistory());

  handle(IPC.SNAPSHOTS_LIST, async (payload) => snapshotService.list(activeProfile(payload.profile)));
  handle(IPC.SNAPSHOT_CREATE, async (payload) => snapshotService.create(activeProfile(payload.profile), {
    label: String(payload.label || '手动快照').slice(0, 100),
    reason: 'manual',
  }));
  handle(IPC.SNAPSHOT_RESTORE, async (payload) => snapshotService.restore(activeProfile(payload.profile), requireString(payload.id, '快照 ID')));
  handle(IPC.SNAPSHOT_DELETE, async (payload) => snapshotService.delete(
    activeProfile(payload.profile),
    requireString(payload.id, '快照 ID'),
    (target) => shell.trashItem(target),
  ));
  handle(IPC.SNAPSHOT_REVEAL, async (payload) => {
    const target = snapshotService.getPath(activeProfile(payload.profile), requireString(payload.id, '快照 ID'));
    shell.showItemInFolder(path.join(target, 'manifest.json'));
    return { path: target };
  });

  function sendProgress(event, channel, progress) {
    try {
      if (!event.sender.isDestroyed()) event.sender.send(channel, progress);
    } catch {}
  }

  function settingsPaths() {
    let home = '';
    try { home = settings.getDshHome(); } catch {}
    return {
      dataDir,
      logsDir: logger.logsDir,
      crashesDir: logger.crashesDir,
      settingsFile: settings.getSettingsFile(),
      dshHome: home,
      profilesDir: home ? path.join(home, 'profiles') : '',
      skillsDir: home ? path.join(home, 'skills') : '',
      sessionsDir: home ? path.join(home, 'sessions') : '',
      credentialsFile: home ? path.join(home, '.credentials.yaml') : '',
      install: profileService.getInstall(),
    };
  }

  async function bootstrapData() {
    let profiles = [];
    let active = '';
    let profileError = null;
    let modelStatus = null;
    try {
      profiles = profileService.listProfiles();
      active = profileService.resolveActiveProfile();
      modelStatus = modelService.status(active);
    } catch (error) {
      profileError = isAppError(error) ? error.toJSON() : { code: 'BOOTSTRAP_FAILED', message: error.message };
    }
    const install = profileService.getInstall();
    return {
      version: APP_VERSION,
      profiles,
      activeProfile: active,
      profileError,
      settings: toPublicSettings(settings.get()),
      modelStatus,
      paths: settingsPaths(),
      install: { ...install, dshVersion: dshVersionFromInstall(install.dir) },
      previousRun: logger.getPreviousRun(),
      crashes: logger.listCrashes().slice(0, 5),
      system: {
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
        dataDir,
        appRoot,
        uptimeSec: Math.round(process.uptime()),
      },
    };
  }

  async function diagnostics() {
    const base = baseDiagnostics();
    let active = '';
    let plugins = null;
    let sessions = null;
    let skills = null;
    try {
      active = profileService.resolveActiveProfile();
      plugins = await pluginService.list(active);
      sessions = await sessionService.list();
      skills = await skillService.list();
    } catch (error) {
      base.errors = [...(base.errors || []), error.message];
    }
    return {
      ...base,
      activeProfile: active,
      modelStatus: active ? modelService.status(active) : null,
      plugins: plugins ? plugins.profile : null,
      sessions: sessions ? sessions.stats : null,
      skills: skills ? skills.stats : null,
      settings: toPublicSettings(settings.get()),
      install: profileService.getInstall(),
      dshHome: settings.getDshHome(),
      disk: {
        sessionsSize: sessions ? formatBytes(sessions.stats.totalSize) : '',
      },
    };
  }

  function baseDiagnostics() {
    return {
      ...logger.getBaseDiagnostics(),
      appRoot,
      dataDir,
      settingsPath: settings.getSettingsFile(),
      dshHome: (() => { try { return settings.getDshHome(); } catch { return ''; } })(),
      install: profileService.getInstall(),
      profiles: (() => { try { return profileService.listProfiles(); } catch { return []; } })(),
    };
  }

  function assertAllowedPath(target) {
    const resolved = path.resolve(target);
    const allowed = [dataDir, settings.getDshHome(), profileService.getInstall().dir, appRoot].filter(Boolean);
    if (!allowed.some((base) => isSubPath(base, resolved))) {
      throw new AppError('UNSAFE_PATH', '这个路径不在 DSH Hub 允许打开的范围内。', { details: resolved });
    }
    if (!pathExists(resolved)) {
      throw new AppError('PATH_NOT_FOUND', '路径不存在。', { details: resolved });
    }
  }

  function isTrustedSender(event) {
    try {
      const url = event.senderFrame?.url || event.sender?.getURL?.() || '';
      return url.startsWith('file://') && url.includes('/renderer/');
    } catch {
      return false;
    }
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('INVALID_ARGUMENT', `${label}不能为空。`);
  }
  return value.trim();
}

export { __dirname };
