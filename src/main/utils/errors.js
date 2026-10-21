/** A typed, serializable application error. */
export class AppError extends Error {
  /**
   * @param {string} code stable machine-readable code
   * @param {string} message user-facing Chinese message
   * @param {{ cause?: unknown, details?: unknown, retryable?: boolean }} [options]
   */
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.details = options.details;
    this.retryable = Boolean(options.retryable);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: sanitizeDetails(this.details),
      retryable: this.retryable,
    };
  }
}

function sanitizeDetails(value) {
  if (value == null) return undefined;
  if (typeof value === 'string') return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeDetails);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 30)) {
      if (/key|token|secret|password|authorization/i.test(key)) continue;
      out[key] = sanitizeDetails(item);
    }
    return out;
  }
  return undefined;
}

export function isAppError(error) {
  return error instanceof AppError
    || (error != null && typeof error === 'object' && typeof error.code === 'string' && typeof error.message === 'string');
}

export function toAppError(error, fallbackCode = 'INTERNAL_ERROR', fallbackMessage = '操作失败，请查看诊断日志。') {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AppError(fallbackCode, fallbackMessage, {
    cause: error,
    details: message,
  });
}
