import { icon, logoMark } from './icons.js';

const ICON_FOR_TYPE = {
  success: 'checkCircle',
  error: 'xCircle',
  warning: 'alert',
  info: 'info',
};

export function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function iconHtml(name, size = 18, className = '') {
  return icon(name, size, className);
}

export function logoHtml(size = 36) {
  return logoMark(size);
}

export function formatDate(value, withTime = true) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function relativeTime(value) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(time)) return '—';
  const delta = Date.now() - time;
  if (delta < 60_000) return '刚刚';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  if (delta < 2_592_000_000) return `${Math.floor(delta / 86_400_000)} 天前`;
  return formatDate(value, false);
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** index;
  return `${size >= 100 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

export function initials(name) {
  let text = String(name || '?');
  const slash = text.lastIndexOf('/');
  if (slash >= 0) text = text.slice(slash + 1);
  text = text.replace(/^dsh[-_]?/i, '').trim();
  const parts = text.split(/[^A-Za-z0-9\u4e00-\u9fff]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  const cleaned = text.replace(/[^A-Za-z0-9\u4e00-\u9fff]/g, '');
  return (cleaned.slice(0, 2) || '?').toUpperCase();
}

export function hueFor(name) {
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export function avatarHtml(name, { size = 'md', tint = true } = {}) {
  const className = `avatar ${size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : ''} ${tint ? 'avatar-tint' : ''}`.trim();
  return `<div class="${className}" style="--hue:${hueFor(name)}">${escapeHtml(initials(name))}</div>`;
}

export function badge(text, tone = '', dot = false) {
  return `<span class="badge ${tone}">${dot ? '<span class="dot"></span>' : ''}${escapeHtml(text)}</span>`;
}

export function tag(text, tone = '') {
  return `<span class="tag ${tone}">${escapeHtml(text)}</span>`;
}

export function emptyState({ iconName = 'package', title, description = '', action = '' }) {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName, 22)}</div>
    <div class="empty-title">${escapeHtml(title)}</div>
    ${description ? `<div class="empty-desc">${escapeHtml(description)}</div>` : ''}
    ${action}
  </div>`;
}

export function errorState(error, retryMarkup = '') {
  return `<div class="empty">
    <div class="empty-icon" style="color:var(--danger)">${icon('alert', 22)}</div>
    <div class="empty-title">加载失败</div>
    <div class="empty-desc">${escapeHtml(error?.message || '未知错误，请查看诊断日志。')}</div>
    ${retryMarkup}
  </div>`;
}

export function skeletonCards(count = 4) {
  return `<div class="plugin-grid">${Array.from({ length: count }, () => '<div class="skeleton skeleton-card"></div>').join('')}</div>`;
}

export function loadingBlock(text = '正在加载…') {
  return `<div class="loading-block"><div class="spinner spinner-lg"></div><div>${escapeHtml(text)}</div></div>`;
}

export function toast(message, type = 'info', options = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return () => {};
  const title = options.title || message;
  const description = options.description || '';
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `
    <div class="toast-icon">${icon(ICON_FOR_TYPE[type] || 'info', 14)}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${description ? `<div class="muted" style="margin-top:2px">${escapeHtml(description)}</div>` : ''}
      ${options.actionLabel ? `<button class="toast-action" type="button">${escapeHtml(options.actionLabel)}</button>` : ''}
    </div>
    <button class="toast-close" type="button" aria-label="关闭">${icon('close', 13)}</button>`;
  root.append(node);
  while (root.children.length > 4) root.firstElementChild?.remove();

  const close = () => {
    if (!node.isConnected) return;
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 180);
  };
  node.querySelector('.toast-close')?.addEventListener('click', close);
  node.querySelector('.toast-action')?.addEventListener('click', () => {
    close();
    options.onAction?.();
  });
  if (options.duration !== 0) setTimeout(close, options.duration || (type === 'error' ? 7000 : 4200));
  return close;
}

export function setButtonBusy(button, busy, busyLabel = '处理中…') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML = `<span class="spinner"></span>${escapeHtml(busyLabel)}`;
  } else {
    button.disabled = false;
    button.classList.remove('is-loading');
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

/* ── Modal / drawer primitives ───────────────────────────────────── */
let overlaySeq = 0;

export function openModal({
  title,
  subtitle = '',
  body = '',
  footer = null,
  size = '',
  onClose = null,
  closeOnBackdrop = true,
  beforeClose = null,
}) {
  const root = document.getElementById('modal-root');
  const id = ++overlaySeq;
  const backdrop = document.createElement('div');
  backdrop.className = 'overlay-backdrop';
  backdrop.dataset.overlay = String(id);
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  const modal = document.createElement('div');
  modal.className = `modal ${size}`.trim();
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="modal-head">
      <div class="row-between" style="align-items:flex-start">
        <div>
          <div class="modal-title">${escapeHtml(title)}</div>
          ${subtitle ? `<div class="modal-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        <button class="drawer-close" type="button" data-close aria-label="关闭">${icon('close', 16)}</button>
      </div>
    </div>
    <div class="modal-body"></div>
    ${footer ? '<div class="modal-foot"></div>' : ''}`;
  const bodyEl = modal.querySelector('.modal-body');
  if (body instanceof Node) bodyEl.append(body);
  else bodyEl.innerHTML = body || '';
  if (footer) {
    const foot = modal.querySelector('.modal-foot');
    if (footer instanceof Node) foot.append(footer);
    else foot.innerHTML = footer;
  }
  wrap.append(modal);
  root.append(backdrop, wrap);
  const previouslyFocused = document.activeElement;
  let closing = false;

  const close = async (reason = 'close') => {
    if (!modal.isConnected || closing) return;
    closing = true;
    if (beforeClose) {
      const canClose = await beforeClose(reason);
      if (canClose === false) {
        closing = false;
        return;
      }
    }
    modal.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    setTimeout(() => {
      wrap.remove();
      backdrop.remove();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus?.();
    }, 220);
    document.removeEventListener('keydown', onKeydown);
    onClose?.(reason);
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close('escape');
      return;
    }
    if (event.key === 'Tab') {
      const focusables = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  backdrop.addEventListener('click', () => { if (closeOnBackdrop) close('backdrop'); });
  modal.querySelector('[data-close]')?.addEventListener('click', () => close('button'));
  document.addEventListener('keydown', onKeydown);
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    modal.classList.add('is-open');
    const focusable = modal.querySelector('input, textarea, select')
      || modal.querySelector('button.btn-primary')
      || modal.querySelector('button');
    focusable?.focus?.();
  });
  return { close, modal, body: bodyEl, footer: modal.querySelector('.modal-foot') };
}

export function openDrawer({
  title,
  subtitle = '',
  body = '',
  footer = null,
  wide = false,
  beforeClose = null,
  onClose = null,
}) {
  const root = document.getElementById('drawer-root');
  const id = ++overlaySeq;
  const backdrop = document.createElement('div');
  backdrop.className = 'overlay-backdrop';
  backdrop.dataset.overlay = String(id);
  const drawer = document.createElement('aside');
  drawer.className = `drawer ${wide ? 'wide' : ''}`.trim();
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.innerHTML = `
    <div class="drawer-head">
      <div style="min-width:0">
        <div class="drawer-title">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="drawer-subtitle">${escapeHtml(subtitle)}</div>` : ''}
      </div>
      <button class="drawer-close" type="button" data-close aria-label="关闭">${icon('close', 16)}</button>
    </div>
    <div class="drawer-body"></div>
    ${footer ? '<div class="drawer-foot"></div>' : ''}`;
  const bodyEl = drawer.querySelector('.drawer-body');
  if (body instanceof Node) bodyEl.append(body);
  else bodyEl.innerHTML = body || '';
  if (footer) {
    const foot = drawer.querySelector('.drawer-foot');
    if (footer instanceof Node) foot.append(footer);
    else foot.innerHTML = footer;
  }
  root.append(backdrop, drawer);
  const previouslyFocused = document.activeElement;
  let closed = false;

  const close = async (reason = 'close') => {
    if (closed) return;
    if (beforeClose) {
      const canClose = await beforeClose(reason);
      if (canClose === false) return;
    }
    closed = true;
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    setTimeout(() => {
      drawer.remove();
      backdrop.remove();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus?.();
    }, 280);
    document.removeEventListener('keydown', onKeydown);
    onClose?.(reason);
  };
  const onKeydown = (event) => {
    if (event.key !== 'Escape') return;
    // Let a stacked modal (for example a discard confirmation) own Escape.
    if (document.querySelector('#modal-root .modal-wrap')) return;
    event.preventDefault();
    close('escape');
  };
  backdrop.addEventListener('click', () => close('backdrop'));
  drawer.querySelector('[data-close]')?.addEventListener('click', () => close('button'));
  document.addEventListener('keydown', onKeydown);
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    drawer.classList.add('is-open');
    (drawer.querySelector('input, textarea, select') || drawer.querySelector('button'))?.focus?.();
  });
  return { close, drawer, body: bodyEl, footer: drawer.querySelector('.drawer-foot') };
}

export function confirmDialog({
  title,
  message,
  details = '',
  confirmText = '确认',
  cancelText = '取消',
  tone = 'primary',
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const body = document.createElement('div');
    body.innerHTML = `<p class="soft" style="font-size:12.5px">${escapeHtml(message)}</p>${details ? `<div class="callout ${tone === 'danger' ? 'danger' : ''}" style="margin-top:12px">${icon('info', 15)}<div>${escapeHtml(details)}</div></div>` : ''}`;
    const modal = openModal({
      title,
      body,
      size: 'narrow',
      footer: `<button class="btn" data-cancel>${escapeHtml(cancelText)}</button><button class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmText)}</button>`,
      onClose: () => finish(false),
    });
    modal.modal.querySelector('[data-cancel]')?.addEventListener('click', () => { finish(false); modal.close('cancel'); });
    modal.modal.querySelector('[data-confirm]')?.addEventListener('click', () => { finish(true); modal.close('confirm'); });
    setTimeout(() => modal.modal.querySelector('[data-confirm]')?.focus(), 30);
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = String(text);
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    area.remove();
    return ok;
  }
}

export function debounce(fn, delay = 180) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function statusDot(ok, warn = false) {
  return `<span class="status-dot ${ok ? '' : warn ? 'is-warn' : 'is-off'}"></span>`;
}

export function pageHeader({ kicker = '', title, subtitle = '', actions = '' }) {
  return `<div class="page-head">
    <div class="page-head-copy">
      ${kicker ? `<div class="page-kicker">${kicker}</div>` : ''}
      <div class="page-title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="page-subtitle">${subtitle}</div>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}

export function spinner(size = '') {
  return `<span class="spinner ${size}"></span>`;
}

export { icon };
