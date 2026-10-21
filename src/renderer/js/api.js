const hub = window.dshHub;

if (!hub) {
  throw new Error('DSH Hub preload bridge is unavailable. Reinstall the application.');
}

export const api = hub;

export function errorInfo(error) {
  return {
    message: error?.message || '操作失败，请查看诊断日志。',
    code: error?.code || 'UNKNOWN',
    details: error?.details,
    retryable: Boolean(error?.retryable),
  };
}

export function isCanceled(error) {
  return error?.code === 'CANCELED';
}
