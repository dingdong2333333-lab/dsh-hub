export const ROUTES = Object.freeze({
  dashboard: { title: '概览', subtitle: '一眼掌握你的 DeepSeek Harness 运行状态', icon: 'dashboard' },
  plugins: { title: '插件', subtitle: '管理 bundle、启停状态与中文资料', icon: 'plugins' },
  market: { title: '插件市场', subtitle: '浏览、安装、更新与卸载 DSH 社区插件', icon: 'download' },
  sets: { title: '套装', subtitle: '把常用插件组合成一套，一键启停', icon: 'layers' },
  sessions: { title: '会话', subtitle: '浏览、导出与清理 DSH 对话记录', icon: 'sessions' },
  skills: { title: 'Skill', subtitle: '查看和编辑 ~/.dsh/skills 中的技能', icon: 'skills' },
  snapshots: { title: '快照', subtitle: '配置快照、恢复与恢复前自动预快照', icon: 'shield' },
  logs: { title: '诊断', subtitle: '崩溃记录、运行日志与诊断信息', icon: 'logs' },
  settings: { title: '设置', subtitle: '路径、模型、外观与安全选项', icon: 'settings' },
});

export function parseRoute(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#\/?/, '').split('?')[0].trim();
  if (raw && Object.hasOwn(ROUTES, raw)) return raw;
  return 'dashboard';
}

export function navigate(route) {
  const target = Object.hasOwn(ROUTES, route) ? route : 'dashboard';
  window.location.hash = `#/${target}`;
}

export function routeHref(route) {
  return `#/${Object.hasOwn(ROUTES, route) ? route : 'dashboard'}`;
}

export function onRouteChange(callback) {
  const handler = () => callback(parseRoute());
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}
