import { api, errorInfo } from '../api.js';
import {
  badge,
  copyText,
  escapeHtml,
  icon,
  pageHeader,
  setButtonBusy,
  toast,
} from '../ui.js';

export async function render(main, ctx) {
  const settings = ctx.state.settings;
  const boot = ctx.state.boot;
  const paths = boot?.paths || {};
  const model = ctx.state.modelStatus || {};
  const modelPrefs = settings.model || {};
  if (!ctx.state.caches.plugins) {
    try { await ctx.loadPlugins(); } catch {}
  }

  main.innerHTML = `<div class="page">
    ${pageHeader({
      kicker: 'PREFERENCES',
      title: '偏好设置',
      subtitle: '路径、模型、外观与安全选项。设置保存在应用数据目录，密钥始终从 DSH 读取。',
      actions: `
        <button class="btn" data-open="dataDir">${icon('folderOpen', 15)}数据目录</button>
        <button class="btn btn-icon btn-ghost" data-action="rescan" title="重新扫描">${icon('refresh', 16)}</button>`,
    })}
    <div class="settings-layout">
      <div class="settings-stack">
        <section class="setting-card">
          <div class="setting-card-head">
            <div class="setting-card-icon">${icon('git', 15)}</div>
            <div><div class="setting-card-title">DSH 连接</div><div class="setting-card-desc">指向 DSH Home、安装目录与当前要管理的 profile</div></div>
          </div>
          <div class="setting-card-body">
            <div class="form-stack">
              <div class="field">
                <label class="field-label" for="setting-dsh-home">DSH Home</label>
                <input class="input mono" id="setting-dsh-home" value="${escapeHtml(settings.dshHome || '')}" placeholder="${escapeHtml(paths.dshHome || '~/.dsh')}">
                <div class="field-hint">留空会使用环境变量 <code>DSH_HOME</code> 或默认的 <code>~/.dsh</code>。当前生效：<code>${escapeHtml(paths.dshHome || '未检测到')}</code></div>
              </div>
              <div class="field">
                <label class="field-label" for="setting-install-dir">DSH 安装目录 <span class="optional">可选</span></label>
                <input class="input mono" id="setting-install-dir" value="${escapeHtml(settings.dshInstallDir || '')}" placeholder="D:\\DeepSeek Harness">
                <div class="field-hint">用于检测内置 Office Skill 和 DSH 版本。留空会自动查找常见安装位置。</div>
              </div>
              <div class="field">
                <label class="field-label" for="setting-profile">当前 Profile</label>
                <select class="select" id="setting-profile">
                  ${(ctx.state.profiles || []).map((profile) => `<option value="${escapeHtml(profile.name)}" ${profile.name === ctx.activeProfile ? 'selected' : ''}>${escapeHtml(profile.name)} · ${profile.packageCount} 个依赖 / ${profile.bundleCount} 个 bundle</option>`).join('') || '<option value="">没有可用 profile</option>'}
                </select>
                <div class="field-hint">切换 profile 后，插件与会话页面会读取对应数据。会话本身是全局的。</div>
              </div>
            </div>
          </div>
          <div class="settings-actions"><button class="btn btn-primary" data-save-general>${icon('save', 14)}保存连接设置</button></div>
        </section>

        <section class="setting-card">
          <div class="setting-card-head">
            <div class="setting-card-icon">${icon('wand', 15)}</div>
            <div><div class="setting-card-title">模型</div><div class="setting-card-desc">用于 AI 起名与中文备注；默认复用 DSH 的 DeepSeek 配置</div></div>
            ${model.configured ? badge('密钥已找到', 'success', true) : badge('未配置', 'warning', true)}
          </div>
          <div class="setting-card-body">
            <div class="form-stack">
              <div class="form-grid">
                <div class="field span-2">
                  <label class="field-label" for="setting-base-url">Base URL <span class="optional">留空使用 DSH 配置或默认值</span></label>
                  <input class="input mono" id="setting-base-url" value="${escapeHtml(modelPrefs.baseUrl || '')}" placeholder="${escapeHtml(model.baseUrl || 'https://api.deepseek.com/anthropic')}">
                  <div class="field-hint">默认使用 DeepSeek Messages 协议：<code>https://api.deepseek.com/anthropic</code>。请求路径为 <code>/v1/messages</code>。</div>
                </div>
                <div class="field">
                  <label class="field-label" for="setting-model">模型 ID</label>
                  <input class="input mono" id="setting-model" value="${escapeHtml(modelPrefs.model || '')}" placeholder="${escapeHtml(model.model || 'deepseek-flash')}">
                </div>
                <div class="field">
                  <label class="field-label" for="setting-timeout">超时（秒）</label>
                  <input class="input" id="setting-timeout" type="number" min="5" max="180" value="${Math.round((modelPrefs.timeoutMs || 60000) / 1000)}">
                </div>
                <div class="field span-2">
                  <div class="toggle-row" style="padding-top:0">
                    <div class="toggle-copy"><div class="title">模型不可用时回退到本地社区中文资料</div><div class="desc">网络断开或额度不足时，用缓存中的中文描述填入备注。</div></div>
                    <button class="switch" type="button" role="switch" aria-checked="${modelPrefs.fallbackToCatalog !== false}" data-toggle-fallback></button>
                  </div>
                </div>
              </div>
              <div class="model-status-card">
                <div class="model-status-top">${icon(model.configured ? 'key' : 'alert', 14)}${model.configured ? '已找到 DSH 模型凭据' : '没有找到模型凭据'}</div>
                <div class="model-status-detail">${model.configured ? `来源：${escapeHtml(model.keySource)} · ${escapeHtml(model.keyMasked)}<br>模型：${escapeHtml(model.model)}` : `请先在 DSH 中配置 ${escapeHtml(modelPrefs.apiKeyEnv || 'DEEPSEEK_API_KEY')}，或设置同名环境变量。`}</div>
                <div class="row" style="margin-top:10px">
                  <button class="btn btn-sm btn-soft" data-test-model>${icon('zap', 13)}测试连接</button>
                  <span class="field-hint" id="model-test-result"></span>
                </div>
              </div>
            </div>
          </div>
          <div class="settings-actions"><button class="btn btn-primary" data-save-model>${icon('save', 14)}保存模型设置</button></div>
        </section>

        <section class="setting-card">
          <div class="setting-card-head">
            <div class="setting-card-icon">${icon('palette', 15)}</div>
            <div><div class="setting-card-title">外观</div><div class="setting-card-desc">界面主题与动效偏好</div></div>
          </div>
          <div class="setting-card-body">
            <div class="theme-options">
              <button class="theme-option ${settings.ui.theme === 'dark' ? 'active' : ''}" data-theme-choice="dark" type="button"><div class="theme-swatch dark"></div>深色</button>
              <button class="theme-option ${settings.ui.theme === 'light' ? 'active' : ''}" data-theme-choice="light" type="button"><div class="theme-swatch light"></div>浅色</button>
              <button class="theme-option ${settings.ui.theme === 'system' ? 'active' : ''}" data-theme-choice="system" type="button"><div class="theme-swatch system"></div>跟随系统</button>
            </div>
            <div class="toggle-row" style="margin-top:16px">
              <div class="toggle-copy"><div class="title">减少界面动效</div><div class="desc">关闭淡入、旋转和过渡动画，适合远程桌面或低性能机器。</div></div>
              <button class="switch" type="button" role="switch" aria-checked="${Boolean(settings.ui.reduceMotion)}" data-toggle-motion></button>
            </div>
          </div>
        </section>

        <section class="setting-card">
          <div class="setting-card-head">
            <div class="setting-card-icon">${icon('shield', 15)}</div>
            <div><div class="setting-card-title">安全与备份</div><div class="setting-card-desc">危险操作确认、自动备份数量</div></div>
          </div>
          <div class="setting-card-body">
            <div class="toggle-row">
              <div class="toggle-copy"><div class="title">危险操作前二次确认</div><div class="desc">停用插件、关闭套装、删除会话、清空日志等。</div></div>
              <button class="switch" type="button" role="switch" aria-checked="${settings.safety.confirmMutations !== false}" data-toggle-confirm></button>
            </div>
            <div class="field" style="margin-top:14px">
              <label class="field-label" for="setting-backups">每个文件的保留备份数量</label>
              <input class="input" id="setting-backups" type="number" min="1" max="200" value="${settings.safety.backupRetention || 30}">
              <div class="field-hint">每次写入 package.json、插件资料或 Skill 前都会在 <code>.dsh-hub/backups</code> 留存旧版本。</div>
            </div>
          </div>
          <div class="settings-actions"><button class="btn btn-primary" data-save-safety>${icon('save', 14)}保存安全设置</button></div>
        </section>
      </div>

      <aside class="settings-side">
        <div class="status-card">
          <div class="section-label">当前状态</div>
          <div class="status-row">${icon('git', 13)}<span>Profile</span><span class="value">${escapeHtml(ctx.activeProfile || '—')}</span></div>
          <div class="status-row"><span class="status-dot ${model.configured ? '' : 'is-warn'}"></span><span>模型</span><span class="value">${escapeHtml(model.model || '未配置')}</span></div>
          <div class="status-row">${icon('package', 13)}<span>插件</span><span class="value">${escapeHtml(String(ctx.state.caches.plugins?.profile?.total ?? '—'))}</span></div>
          <div class="status-row">${icon('database', 13)}<span>数据目录</span><span class="value" title="${escapeHtml(paths.dataDir || '')}">${escapeHtml(shorten(paths.dataDir || '—', 22))}</span></div>
          <div class="status-row">${icon('hardDrive', 13)}<span>DSH 安装</span><span class="value" title="${escapeHtml(paths.install?.dir || '')}">${escapeHtml(paths.install?.dir ? '已检测' : '未检测')}</span></div>
          <div class="row" style="margin-top:12px">
            <button class="btn btn-sm btn-soft" data-test-model>${icon('zap', 13)}测试模型</button>
            <button class="btn btn-sm" data-open="credentialsFile">${icon('key', 13)}凭据文件</button>
          </div>
        </div>

        <div class="status-card">
          <div class="section-label">路径</div>
          ${pathRow('DSH Home', paths.dshHome, 'dshHome')}
          ${pathRow('数据目录', paths.dataDir, 'dataDir')}
          ${pathRow('日志目录', paths.logsDir, 'logsDir')}
          ${pathRow('设置文件', paths.settingsFile, 'settingsFile')}
        </div>

        <div class="about-card">
          <div class="about-logo">${icon('rocket', 20)}</div>
          <div class="about-name">DSH Hub</div>
          <div class="about-version">v${escapeHtml(boot?.version || '0.1.0')} · MIT License</div>
          <p class="about-desc">面向 DeepSeek Harness 的本地控制台。插件、会话、Skill 都是你的本地文件，DSH Hub 不收集任何内容。</p>
          <div class="about-links">
            <button class="btn btn-xs" data-open="dataDir">${icon('folderOpen', 12)}打开数据目录</button>
            <button class="btn btn-xs" data-action="diagnostics">${icon('logs', 12)}诊断信息</button>
          </div>
        </div>
      </aside>
    </div>
  </div>`;

  const fallbackButton = main.querySelector('[data-toggle-fallback]');
  fallbackButton?.addEventListener('click', async () => {
    const next = fallbackButton.getAttribute('aria-checked') !== 'true';
    fallbackButton.setAttribute('aria-checked', String(next));
    try {
      await ctx.updateSettings({ model: { fallbackToCatalog: next } });
      toast(next ? '已启用本地资料回退' : '已关闭本地资料回退', 'success', { duration: 1800 });
    } catch (error) {
      fallbackButton.setAttribute('aria-checked', String(!next));
      toast(errorInfo(error).message, 'error');
    }
  });
  main.querySelector('[data-toggle-motion]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const next = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', String(next));
    try {
      await ctx.updateSettings({ ui: { reduceMotion: next } });
      document.documentElement.classList.toggle('reduce-motion', next);
    } catch (error) {
      button.setAttribute('aria-checked', String(!next));
      toast(errorInfo(error).message, 'error');
    }
  });
  main.querySelector('[data-toggle-confirm]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const next = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', String(next));
    try { await ctx.updateSettings({ safety: { confirmMutations: next } }); }
    catch (error) { button.setAttribute('aria-checked', String(!next)); toast(errorInfo(error).message, 'error'); }
  });
  main.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.addEventListener('click', async () => {
      main.querySelectorAll('[data-theme-choice]').forEach((item) => item.classList.toggle('active', item === button));
      await ctx.setTheme(button.dataset.themeChoice);
      button.closest('.theme-options')?.querySelectorAll('.theme-option').forEach((item) => item.classList.toggle('active', item === button));
    });
  });

  main.querySelector('[data-save-general]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setButtonBusy(button, true, '保存中');
    try {
      const activeProfile = main.querySelector('#setting-profile')?.value || '';
      await ctx.updateSettings({
        dshHome: main.querySelector('#setting-dsh-home').value.trim(),
        dshInstallDir: main.querySelector('#setting-install-dir').value.trim(),
        activeProfile,
      });
      ctx.invalidateAll();
      toast('连接设置已保存', 'success');
      await ctx.refreshCurrentView();
    } catch (error) {
      toast(errorInfo(error).message, 'error');
      setButtonBusy(button, false);
    }
  });
  main.querySelector('[data-save-model]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setButtonBusy(button, true, '保存中');
    try {
      const seconds = Number(main.querySelector('#setting-timeout').value) || 60;
      await ctx.updateSettings({
        model: {
          baseUrl: main.querySelector('#setting-base-url').value.trim(),
          model: main.querySelector('#setting-model').value.trim(),
          timeoutMs: Math.min(Math.max(seconds, 5), 180) * 1000,
        },
      });
      toast('模型设置已保存', 'success');
      await ctx.refreshCurrentView();
    } catch (error) {
      toast(errorInfo(error).message, 'error');
      setButtonBusy(button, false);
    }
  });
  main.querySelector('[data-save-safety]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setButtonBusy(button, true, '保存中');
    try {
      await ctx.updateSettings({
        safety: {
          backupRetention: Math.min(Math.max(Number(main.querySelector('#setting-backups').value) || 30, 1), 200),
        },
      });
      toast('安全设置已保存', 'success');
      await ctx.refreshCurrentView();
    } catch (error) {
      toast(errorInfo(error).message, 'error');
      setButtonBusy(button, false);
    }
  });

  main.querySelectorAll('[data-test-model]').forEach((button) => button.addEventListener('click', async () => {
    setButtonBusy(button, true, '测试中');
    const resultEl = main.querySelector('#model-test-result');
    if (resultEl) resultEl.textContent = '正在请求 DSH 模型…';
    try {
      const result = await api.model.test(ctx.activeProfile);
      if (resultEl) resultEl.textContent = `连接成功 · ${result.latencyMs} ms · ${result.model}`;
      toast('模型连接成功', 'success', { description: `${result.latencyMs} ms · ${result.model}` });
    } catch (error) {
      const info = errorInfo(error);
      if (resultEl) resultEl.textContent = info.message;
      toast(info.message, 'error', { title: '模型连接失败', duration: 8000 });
    } finally {
      setButtonBusy(button, false);
    }
  }));
  main.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.open;
    const target = key === 'dataDir' ? paths.dataDir
      : key === 'logsDir' ? paths.logsDir
        : key === 'settingsFile' ? paths.settingsFile
          : key === 'dshHome' ? paths.dshHome
            : key === 'credentialsFile' ? paths.credentialsFile
              : paths[key];
    if (target) ctx.openPath(target);
  }));
  main.querySelector('[data-action="rescan"]')?.addEventListener('click', () => ctx.refresh());
  main.querySelector('[data-action="diagnostics"]')?.addEventListener('click', () => ctx.navigate('logs'));

  return () => {};
}

function pathRow(label, value, key) {
  return `<div class="setting-path" style="margin-bottom:6px" title="${escapeHtml(value || '')}">
    ${icon('folder', 12)}<span class="grow truncate">${escapeHtml(shorten(value || '未检测到', 32))}</span>
    ${value ? `<button class="btn btn-icon btn-xs btn-ghost" data-open="${escapeHtml(key)}" title="打开">${icon('external', 11)}</button>` : ''}
  </div>`;
}

function shorten(value, max) {
  const text = String(value || '');
  return text.length > max ? `…${text.slice(-(max - 1))}` : text;
}
