import { api, errorInfo } from '../api.js';
import {
  escapeHtml,
  h,
  hueFor,
  icon,
  initials,
  openModal,
  setButtonBusy,
  toast,
} from '../ui.js';

/**
 * Reusable create/edit dialog for plugin sets. Used by the Sets page and by
 * the bulk selection bar on the Plugins page.
 */
export async function openSetEditor(ctx, { set = null, initialPluginNames = [], onSaved = null } = {}) {
  const pluginsData = await ctx.loadPlugins();
  const available = pluginsData.plugins.filter((plugin) => plugin.canToggle);
  const initial = new Set(set?.pluginNames || initialPluginNames || []);
  const colors = ['#3ee0c0', '#5b8cff', '#ff9f6e', '#c084fc', '#f472b6', '#facc15'];
  let selectedColor = set?.color || colors[0];
  let query = '';

  const body = document.createElement('div');
  body.innerHTML = `<form id="set-form" class="form-stack" autocomplete="off">
    <div class="form-grid">
      <div class="field span-2">
        <label class="field-label" for="set-name">套装名称 <span class="optional">必填</span></label>
        <input class="input" id="set-name" maxlength="48" placeholder="例如：日常增强 / 写作工作流" value="${escapeHtml(set?.name || '')}">
      </div>
      <div class="field span-2">
        <label class="field-label" for="set-desc">一句话说明 <span class="optional">可选</span></label>
        <input class="input" id="set-desc" maxlength="300" placeholder="这套插件适合什么场景？" value="${escapeHtml(set?.description || '')}">
      </div>
      <div class="field span-2">
        <div class="field-label">标识颜色</div>
        <div class="color-swatches">${colors.map((color) => `<button class="color-swatch ${color === selectedColor ? 'active' : ''}" type="button" data-color="${color}" style="--swatch:${color}" aria-label="选择颜色 ${color}"></button>`).join('')}</div>
      </div>
      <div class="field span-2">
        <div class="field-label">选择插件 <span class="optional">只会列出可独立启停的 bundle</span></div>
        <div class="input-group picker-search">${icon('search', 15)}<input class="input" id="picker-search" placeholder="搜索插件名称或包名…"></div>
        <div class="plugin-picker" id="plugin-picker"></div>
        <div class="field-hint">已选 <strong id="picked-count">${initial.size}</strong> 个插件。套装只保存组合关系，不会复制或修改插件文件。</div>
      </div>
    </div>
  </form>`;

  const modal = openModal({
    title: set ? '编辑套装' : '新建插件套装',
    subtitle: set ? `修改「${set.name}」的成员与外观` : '把经常一起使用的插件绑定成一个开关',
    body,
    size: 'wide',
    footer: '<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-save>保存套装</button>',
  });

  const picker = body.querySelector('#plugin-picker');
  const countEl = body.querySelector('#picked-count');
  const searchInput = body.querySelector('#picker-search');

  const renderPicker = () => {
    const filtered = available.filter((plugin) => {
      const needle = query.toLowerCase();
      return !needle || `${plugin.title} ${plugin.name} ${plugin.category}`.toLowerCase().includes(needle);
    });
    if (!filtered.length) {
      picker.innerHTML = '<div class="empty" style="padding:24px"><div class="empty-desc">没有匹配的可启停插件。</div></div>';
      return;
    }
    picker.innerHTML = filtered.map((plugin) => `<label class="picker-row">
      <input type="checkbox" class="sr-only" data-plugin-name="${escapeHtml(plugin.name)}" ${initial.has(plugin.name) ? 'checked' : ''}>
      <span class="checkbox-box">${icon('check', 11)}</span>
      <div class="avatar avatar-sm" style="--hue:${hueFor(plugin.name)};border-color:hsla(${hueFor(plugin.name)},70%,62%,.22)">${escapeHtml(initials(plugin.name))}</div>
      <div class="picker-row-main">
        <div class="picker-row-title">${escapeHtml(plugin.title)}</div>
        <div class="picker-row-pkg">${escapeHtml(plugin.name)}</div>
      </div>
      ${plugin.enabled ? '<span class="badge success">已启用</span>' : '<span class="badge">未启用</span>'}
    </label>`).join('');
    picker.querySelectorAll('[data-plugin-name]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) initial.add(checkbox.dataset.pluginName);
        else initial.delete(checkbox.dataset.pluginName);
        countEl.textContent = String(initial.size);
      });
    });
  };
  const updateCount = () => { countEl.textContent = String(initial.size); };
  updateCount();
  renderPicker();

  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim();
    renderPicker();
  });

  body.querySelectorAll('[data-color]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedColor = button.dataset.color;
      body.querySelectorAll('[data-color]').forEach((item) => item.classList.toggle('active', item === button));
    });
  });

  const close = () => modal.close('cancel');
  modal.modal.querySelector('[data-cancel]')?.addEventListener('click', close);
  modal.modal.querySelector('[data-save]')?.addEventListener('click', async () => {
    const name = body.querySelector('#set-name').value.trim();
    const description = body.querySelector('#set-desc').value.trim();
    const pluginNames = [...initial];
    if (!name) {
      toast('请填写套装名称。', 'warning');
      body.querySelector('#set-name').focus();
      return;
    }
    if (!pluginNames.length) {
      toast('请至少选择一个插件。', 'warning');
      return;
    }
    const button = modal.modal.querySelector('[data-save]');
    setButtonBusy(button, true, '保存中');
    try {
      const payload = { name, description, color: selectedColor, pluginNames };
      const saved = set
        ? await api.sets.update(set.id, payload, ctx.activeProfile)
        : await api.sets.create(payload, ctx.activeProfile);
      ctx.afterMutation('sets', 'plugins');
      toast(set ? '套装已更新' : '套装已创建', 'success', {
        description: `${saved.name} · ${saved.totalCount} 个插件`,
      });
      modal.close('saved');
      onSaved?.(saved);
    } catch (error) {
      toast(errorInfo(error).message, 'error');
      setButtonBusy(button, false);
    }
  });

  body.querySelector('#set-name')?.focus();
}
