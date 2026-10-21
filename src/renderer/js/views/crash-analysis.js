import { api, errorInfo } from '../api.js';
import {
  badge,
  confirmDialog,
  copyText,
  escapeHtml,
  icon,
  openModal,
  spinner,
  toast,
} from '../ui.js';

export async function openCrashAnalysis(ctx) {
  const confirmed = await confirmDialog({
    title: '让 DSH 模型分析崩溃',
    message: '将把最近的崩溃报告、运行日志尾部、DSH 版本和 profile 信息发送给当前 DSH 模型。',
    details: '不会发送 API Key、credentials 文件或完整会话内容。分析结果只用于排查建议，可能产生少量 token 费用。',
    confirmText: '开始分析',
  });
  if (!confirmed) return;
  const modal = openModal({
    title: 'AI 崩溃分析',
    subtitle: '正在读取崩溃报告并请求模型…',
    body: `<div class="crash-analysis-loading">${spinner()}<div>正在分析日志与崩溃上下文…</div><div class="muted">模型请求可能需要几秒到几十秒。</div></div>`,
    size: 'wide',
    footer: '<button class="btn" data-crash-close>关闭</button>',
  });
  modal.footer.querySelector('[data-crash-close]')?.addEventListener('click', () => modal.close());
  try {
    const result = await api.logs.aiAnalyze(ctx.activeProfile);
    modal.body.innerHTML = renderAnalysis(result);
    modal.body.querySelector('[data-crash-copy]')?.addEventListener('click', async () => {
      const ok = await copyText(plainText(result));
      toast(ok ? '已复制分析结果' : '复制失败', ok ? 'success' : 'error');
    });
    modal.body.querySelector('[data-crash-logs]')?.addEventListener('click', () => {
      modal.close();
      ctx.navigate('logs');
    });
    modal.body.querySelector('[data-crash-retry]')?.addEventListener('click', () => {
      modal.close();
      openCrashAnalysis(ctx);
    });
  } catch (error) {
    const info = errorInfo(error);
    modal.body.innerHTML = `<div class="callout danger">${icon('alert', 16)}<div><strong>分析失败</strong><p>${escapeHtml(info.message)}</p>${info.details ? `<pre class="mono-block">${escapeHtml(String(info.details).slice(0, 2000))}</pre>` : ''}</div></div><div class="row" style="margin-top:12px"><button class="btn" data-crash-retry>${icon('refresh', 14)}重试</button><button class="btn" data-crash-logs>${icon('logs', 14)}打开诊断</button></div>`;
    modal.body.querySelector('[data-crash-logs]')?.addEventListener('click', () => { modal.close(); ctx.navigate('logs'); });
    modal.body.querySelector('[data-crash-retry]')?.addEventListener('click', () => { modal.close(); openCrashAnalysis(ctx); });
  }
}

function renderAnalysis(result) {
  if (result.empty) {
    return `<div class="callout">${icon('checkCircle', 16)}<div><strong>${escapeHtml(result.summary || '没有崩溃记录。')}</strong><p>${escapeHtml((result.actions || []).join(' '))}</p></div></div>`;
  }
  const severity = result.severity === 'high' ? 'danger' : result.severity === 'medium' ? 'warning' : 'success';
  return `<div class="crash-analysis">
    <div class="crash-analysis-top">
      ${badge(`严重度：${result.severity || 'medium'}`, severity, true)}
      <span class="muted">模型 ${escapeHtml(result.model || '未知')} · 基于 ${result.crashCount || 1} 条崩溃记录</span>
    </div>
    <div class="crash-summary">${escapeHtml(result.summary)}</div>
    <div class="crash-columns">
      <section><div class="panel-title">${icon('alert', 14)}可能原因</div><ul>${(result.likelyCauses || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>模型未给出明确原因。</li>'}</ul></section>
      <section><div class="panel-title">${icon('checkCircle', 14)}建议动作</div><ol>${(result.actions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>保持当前配置并观察。</li>'}</ol></section>
    </div>
    ${result.evidence?.length ? `<div class="crash-evidence"><div class="panel-title">${icon('code', 14)}证据</div>${result.evidence.map((item) => `<div class="evidence-line mono">${escapeHtml(item)}</div>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn" data-crash-copy>${icon('copy', 14)}复制分析</button><button class="btn" data-crash-logs>${icon('logs', 14)}打开诊断</button><button class="btn btn-ghost" data-crash-retry>${icon('refresh', 14)}重新分析</button></div>
  </div>`;
}

function plainText(result) {
  return [
    `DSH Hub AI 崩溃分析（${result.generatedAt || new Date().toISOString()}）`,
    `严重度：${result.severity || 'medium'}`,
    '',
    result.summary || '',
    '',
    '可能原因：',
    ...(result.likelyCauses || []).map((item) => `- ${item}`),
    '',
    '建议动作：',
    ...(result.actions || []).map((item, index) => `${index + 1}. ${item}`),
    '',
    '证据：',
    ...(result.evidence || []).map((item) => `- ${item}`),
  ].join('\n');
}
