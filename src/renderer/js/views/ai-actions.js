import { api, errorInfo } from '../api.js';
import { icon, openModal, setButtonBusy, toast } from '../ui.js';

/**
 * Shared AI actions used by the dashboard and plugin screens.
 * All state lives in the main process; these helpers only present progress.
 */
export async function generateSingle(ctx, name, button, { force = false, refresh = true } = {}) {
  setButtonBusy(button, true, '生成中');
  try {
    const result = await api.plugins.aiGenerate(name, ctx.activeProfile, { force });
    if (result.fallback) {
      toast(result.warning || '模型暂时不可用，已使用本地社区资料。', 'warning', {
        title: '已使用本地资料',
        duration: 8000,
      });
    } else if (result.skipped) {
      toast('这个插件已有手动填写的资料。', 'info');
    } else {
      toast(`已为「${result.meta?.displayName || name}」生成中文资料`, 'success', {
        description: result.usage ? `消耗 ${result.usage.output_tokens || result.usage.outputTokens || 0} 个输出 token` : '',
      });
    }
    ctx.afterMutation('plugins', 'sets');
    if (refresh) await ctx.refreshCurrentView();
    return result;
  } catch (error) {
    const info = errorInfo(error);
    toast(info.message, 'error', {
      title: 'AI 生成失败',
      description: info.code === 'MODEL_NO_KEY' ? '请先在设置中确认 DSH 模型密钥。' : info.details,
      actionLabel: info.code === 'MODEL_NO_KEY' ? '打开设置' : '',
      onAction: () => ctx.openSettings(),
      duration: 9000,
    });
    throw error;
  } finally {
    setButtonBusy(button, false);
  }
}

/**
 * Run the batch in the background of a modal. The API streams progress on the
 * `ai:progress` channel. Closing is blocked until the batch finishes.
 */
export async function runBatch(ctx, names, { title = 'AI 批量完善中文资料', onDone = null } = {}) {
  const unique = [...new Set((names || []).filter(Boolean))];
  if (!unique.length) {
    toast('没有需要生成的插件。', 'info');
    return null;
  }
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="ai-progress">
      <div class="ai-progress-head">${icon('wand', 16)}<span>正在调用 DSH 模型</span><span class="spacer" style="flex:1"></span><span class="mono" data-progress-percent style="color:var(--text-faint)">0 / ${unique.length}</span></div>
      <div class="progress-label"><span data-progress-name>准备中…</span><span data-progress-state>0%</span></div>
      <div class="progress"><div class="progress-bar" data-progress-bar style="width:0%"></div></div>
      <div class="ai-progress-detail" data-progress-detail>每个插件会单独请求一次模型，可能需要几十秒。</div>
      <div class="ai-progress-errors hidden" data-progress-errors></div>
    </div>
    <div class="callout accent" style="margin-top:14px">${icon('info', 15)}<div>会使用 DSH 当前配置的模型与 API Key。结果会直接写入插件中文资料，可在插件详情里继续修改。</div></div>`;
  const modal = openModal({
    title,
    subtitle: `正在处理 ${unique.length} 个插件`,
    body,
    size: 'narrow',
    closeOnBackdrop: false,
    beforeClose: () => Boolean(finished),
    footer: '<button class="btn btn-primary" data-finish disabled>处理中…</button>',
  });
  const finishButton = modal.footer.querySelector('[data-finish]');
  const closeButton = modal.modal.querySelector('[data-close]');
  if (closeButton) closeButton.style.display = 'none';
  const bar = body.querySelector('[data-progress-bar]');
  const percent = body.querySelector('[data-progress-percent]');
  const nameEl = body.querySelector('[data-progress-name]');
  const stateEl = body.querySelector('[data-progress-state]');
  const detailEl = body.querySelector('[data-progress-detail]');
  const errorsEl = body.querySelector('[data-progress-errors]');
  const errors = [];
  let finished = null;

  const close = () => {
    if (!finished) return;
    modal.close('done');
    onDone && onDone(finished);
  };
  finishButton?.addEventListener('click', close);

  const unsubscribe = api.onAiProgress((progress) => {
    const done = progress.index + (progress.status === 'running' ? 0 : 1);
    const pct = Math.round((done / unique.length) * 100);
    if (bar) bar.style.width = `${pct}%`;
    if (percent) percent.textContent = `${done} / ${unique.length}`;
    if (nameEl) nameEl.textContent = progress.name;
    if (stateEl) stateEl.textContent = `${pct}%`;
    if (detailEl) {
      detailEl.textContent = progress.status === 'error'
        ? `${progress.name} 失败：${progress.message || '未知错误'}`
        : progress.status === 'ok'
          ? `${progress.name} 已完成${progress.fallback ? '（本地资料）' : ''}`
          : `正在生成 ${progress.name}…`;
    }
    if (progress.status === 'error') {
      errors.push(`${progress.name}: ${progress.message || '未知错误'}`);
      errorsEl.classList.remove('hidden');
      errorsEl.innerHTML = errors.map((message) => `<div>${escapeText(message)}</div>`).join('');
    }
  });

  try {
    const result = await api.plugins.aiBatch(unique, ctx.activeProfile);
    finished = result;
    const ok = result.results.filter((item) => item.ok).length;
    const failed = result.results.length - ok;
    if (bar) bar.style.width = '100%';
    if (percent) percent.textContent = `${unique.length} / ${unique.length}`;
    if (nameEl) nameEl.textContent = failed ? '批量处理完成，部分失败' : '全部完成';
    if (stateEl) stateEl.textContent = '100%';
    if (detailEl) detailEl.textContent = `成功 ${ok} 个${failed ? `，失败 ${failed} 个` : ''}。结果已保存到插件资料。`;
    if (finishButton) {
      finishButton.disabled = false;
      finishButton.textContent = '完成';
    }
    toast(`批量完善完成：成功 ${ok} 个${failed ? `，失败 ${failed} 个` : ''}`, failed ? 'warning' : 'success');
    if (onDone) {
      const callback = onDone;
      onDone = null;
      callback(result);
    }
    return result;
  } catch (error) {
    const info = errorInfo(error);
    finished = { error: info };
    if (detailEl) detailEl.textContent = info.message;
    if (finishButton) {
      finishButton.disabled = false;
      finishButton.textContent = '关闭';
    }
    toast(info.message, 'error', { title: '批量处理失败' });
    return null;
  } finally {
    unsubscribe?.();
  }
}

function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
