import fs from 'node:fs';
import path from 'node:path';

import { MODEL_CATEGORIES } from '../../shared/constants.js';
import { AppError, toAppError } from '../utils/errors.js';
import { pathExists } from '../utils/fs-utils.js';
import {
  extractJsonObject,
  parseCredentialRefs,
  redactSecrets,
  truncate,
} from '../utils/parse-utils.js';

const DEFAULT_BASE_URL = 'https://api.deepseek.com/anthropic';
const DEFAULT_MODEL = 'deepseek-flash';
const SYSTEM_PROMPT = `你是 DeepSeek Harness（DSH）插件目录的中文产品编辑。
你的任务是根据插件元数据、README 摘要和社区资料，为插件写一条面向中文用户的展示信息。

必须遵守：
1. 只输出一个合法 JSON 对象，不要 Markdown 代码块、前后缀或解释。
2. displayName 必须是 2–14 个汉字的简短名称，不含引号、包名、标点结尾；要好记，不要生硬直译。
3. notes 必须是 2–4 句中文，40–220 字；说清楚它做什么、适合谁、有什么关键限制或代价。
4. tags 是 3–5 个中文短标签，每个 2–8 个字。
5. category 必须从以下列表中选一个：${MODEL_CATEGORIES.join('、')}。
6. 不要编造资料中没有的能力。资料不足时用保守表述，并降低 confidence。
7. confidence 是 0 到 1 之间的小数。

输出结构：
{"displayName":"...","notes":"...","tags":["...","..."],"category":"...","confidence":0.8}`;

export class ModelService {
  constructor({ settings, profileService, pluginService, logger }) {
    this.settings = settings;
    this.profileService = profileService;
    this.pluginService = pluginService;
    this.logger = logger.child('model');
    this.rootLogger = logger;
  }

  getConfig(profileName) {
    const settings = this.settings.get();
    const profile = this.profileService.getProfile(profileName);
    const configText = readConfigText(profile);
    const envKeyName = settings.model.apiKeyEnv || 'DEEPSEEK_API_KEY';
    const envValue = process.env[envKeyName] || '';
    const credentialFile = path.join(this.profileService.getDshHome(), '.credentials.yaml');
    let refValue = '';
    let source = '';
    if (envValue) {
      refValue = envValue;
      source = `环境变量 ${envKeyName}`;
    } else if (pathExists(credentialFile)) {
      try {
        refValue = parseCredentialRefs(fs.readFileSync(credentialFile, 'utf8'), envKeyName) || '';
        if (refValue) source = `DSH 凭据 ${envKeyName}`;
      } catch (error) {
        this.logger.warn('Unable to parse credentials file', { error: error.message });
      }
    }
    const configuredBase = settings.model.baseUrl
      || process.env.DEEPSEEK_BASE_URL
      || parseConfiguredBaseUrl(configText)
      || DEFAULT_BASE_URL;
    const base = normalizeBaseUrl(configuredBase);
    const model = settings.model.model || parseConfiguredModel(configText) || DEFAULT_MODEL;
    return {
      profileName: profile.name,
      baseUrl: base.baseUrl,
      endpoint: base.endpoint,
      model,
      apiKey: refValue,
      apiKeyEnv: envKeyName,
      keySource: source,
      credentialFile,
      timeoutMs: settings.model.timeoutMs,
      fallbackToCatalog: settings.model.fallbackToCatalog,
    };
  }

  status(profileName) {
    const config = this.getConfig(profileName);
    return {
      configured: Boolean(config.apiKey),
      keySource: config.keySource || '未找到',
      keyMasked: config.apiKey ? `sk-…${config.apiKey.slice(-4)}` : '',
      baseUrl: config.baseUrl,
      endpoint: config.endpoint,
      model: config.model,
      apiKeyEnv: config.apiKeyEnv,
      credentialFile: config.credentialFile,
      timeoutMs: config.timeoutMs,
      fallbackToCatalog: config.fallbackToCatalog,
    };
  }

  async test(profileName) {
    const config = this.getConfig(profileName);
    const started = Date.now();
    const result = await this.request(config, {
      system: '你是连接测试助手。只回复“OK”。',
      prompt: '回复 OK',
      maxTokens: 32,
    });
    return {
      ok: true,
      latencyMs: Date.now() - started,
      model: result.model,
      usage: result.usage,
      endpoint: config.endpoint,
    };
  }

  async request(config, { system, prompt, maxTokens = 1_500 }) {
    if (!config.apiKey) {
      throw new AppError('MODEL_NO_KEY', '没有找到可用的 DSH 模型密钥。', {
        details: `请在 DSH 设置中配置 ${config.apiKeyEnv}，或设置同名环境变量。`,
        retryable: false,
      });
    }
    const body = {
      model: config.model,
      max_tokens: Math.max(16, Math.min(Number(maxTokens) || 1_500, 8_000)),
      thinking: { type: 'disabled' },
      system,
      messages: [{ role: 'user', content: prompt }],
    };
    const headers = {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    };
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        const text = await response.text();
        if (!response.ok) {
          const detail = truncate(redactSecrets(text), 800);
          const error = new AppError(mapHttpError(response.status), httpErrorMessage(response.status), {
            details: detail,
            retryable: response.status === 429 || response.status >= 500,
          });
          if (error.retryable && attempt < 2) {
            lastError = error;
            await sleep(800 * (attempt + 1));
            continue;
          }
          throw error;
        }
        let data;
        try { data = JSON.parse(text); } catch {
          throw new AppError('MODEL_BAD_RESPONSE', '模型返回了无法解析的响应。', { details: truncate(text, 500) });
        }
        const output = Array.isArray(data.content)
          ? data.content.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('\n').trim()
          : '';
        if (!output) {
          throw new AppError('MODEL_EMPTY_RESPONSE', '模型没有返回文本内容。', { details: truncate(JSON.stringify(data), 500) });
        }
        return {
          text: output,
          usage: data.usage || null,
          model: data.model || config.model,
          requestId: data.id || '',
        };
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
          lastError = new AppError('MODEL_TIMEOUT', `模型请求超时（${Math.round(config.timeoutMs / 1000)} 秒）。`, {
            cause: error,
            retryable: true,
          });
        } else {
          lastError = error;
        }
        if (lastError?.retryable && attempt < 2 && !(lastError instanceof AppError && lastError.code === 'MODEL_TIMEOUT')) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        if (lastError instanceof AppError) throw lastError;
        throw new AppError('MODEL_NETWORK', '无法连接模型服务，请检查网络或 Base URL。', {
          cause: error,
          details: error instanceof Error ? error.message : String(error),
          retryable: true,
        });
      }
    }
    throw lastError || new AppError('MODEL_ERROR', '模型请求失败。');
  }

  async generateForPlugin(profileName, pluginName, { force = false } = {}) {
    const detail = await this.pluginService.detail(profileName, pluginName);
    if (!force && detail.displayName && detail.notes && !detail.ai) {
      // Keep hand-written metadata, but still allow an explicit regenerate.
      return {
        pluginName,
        meta: { displayName: detail.displayName, notes: detail.notes, tags: detail.tags },
        skipped: true,
        reason: '已有手动填写的资料',
      };
    }
    const config = this.getConfig(profileName);
    const prompt = buildPrompt(detail);
    let result;
    try {
      result = await this.request(config, { system: SYSTEM_PROMPT, prompt, maxTokens: 1_500 });
    } catch (error) {
      this.logger.warn('Model naming failed', {
        plugin: pluginName,
        code: error?.code,
        message: error?.message,
      });
      if (config.fallbackToCatalog) {
        const fallback = this.pluginService.getLocalSuggestion(profileName, pluginName);
        if (fallback) {
          const applied = await this.pluginService.applyAiMeta(profileName, pluginName, {
            ...fallback,
            ai: {
              ...fallback.ai,
              source: 'catalog-fallback',
              model: config.model,
              generatedAt: new Date().toISOString(),
              fallbackReason: error?.code || 'MODEL_ERROR',
            },
          });
          return {
            pluginName,
            meta: applied.meta,
            fallback: true,
            warning: `模型调用失败（${error.message}），已使用本地社区中文资料。`,
            usage: null,
            model: config.model,
          };
        }
      }
      throw error;
    }

    let parsed;
    try {
      parsed = parseAndSanitizeResult(result.text);
    } catch (firstError) {
      this.logger.warn('Model returned invalid JSON, attempting repair', { plugin: pluginName, error: firstError.message });
      const repaired = await this.request(config, {
        system: `${SYSTEM_PROMPT}\n上一次输出无法解析。现在只输出修正后的 JSON 对象，不要任何其他字符。`,
        prompt: `插件的资料摘要：\n${truncate(prompt, 5_000)}\n\n上一次输出：\n${truncate(result.text, 2_000)}\n\n请只输出符合结构的 JSON。`,
        maxTokens: 1_500,
      });
      parsed = parseAndSanitizeResult(repaired.text);
      result = repaired;
    }
    const ai = {
      source: 'model',
      model: result.model,
      generatedAt: new Date().toISOString(),
      category: parsed.category,
      confidence: parsed.confidence,
    };
    const applied = await this.pluginService.applyAiMeta(profileName, pluginName, { ...parsed, ai });
    this.logger.info('Plugin metadata generated', {
      plugin: pluginName,
      model: result.model,
      usage: result.usage,
      chars: parsed.notes.length,
    });
    return {
      pluginName,
      meta: applied.meta,
      suggestion: parsed,
      usage: result.usage,
      model: result.model,
      fallback: false,
    };
  }

  async generateBatch(profileName, pluginNames, onProgress = () => {}) {
    const names = [...new Set((Array.isArray(pluginNames) ? pluginNames : []).filter((name) => typeof name === 'string'))].slice(0, 30);
    if (!names.length) throw new AppError('INVALID_ARGUMENT', '没有选择插件。');
    const results = [];
    let cursor = 0;
    const concurrency = Math.min(2, names.length);
    const worker = async () => {
      while (cursor < names.length) {
        const index = cursor;
        cursor += 1;
        const name = names[index];
        onProgress({ index, total: names.length, name, status: 'running' });
        try {
          const result = await this.generateForPlugin(profileName, name, { force: true });
          results.push({ name, ok: true, result });
          onProgress({ index, total: names.length, name, status: 'ok', fallback: result.fallback });
        } catch (error) {
          results.push({ name, ok: false, error: error.toJSON ? error.toJSON() : { message: error.message } });
          onProgress({
            index,
            total: names.length,
            name,
            status: 'error',
            message: error.message,
          });
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    results.sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));
    return { total: names.length, results };
  }

  localSuggestion(profileName, pluginName) {
    return this.pluginService.getLocalSuggestion(profileName, pluginName);
  }

  /** Ask the configured model to analyze local crash reports and log tail. */
  async analyzeCrashes(profileName) {
    const crashes = this.rootLogger.listCrashes();
    if (!crashes.length) {
      return {
        empty: true,
        summary: '当前没有崩溃报告。',
        severity: 'low',
        likelyCauses: [],
        actions: ['保持当前的备份与日志设置即可。'],
        evidence: [],
      };
    }
    const latest = crashes[0];
    const report = this.rootLogger.readCrash(latest.id).report || {};
    const logTail = this.rootLogger.tail('app.log', 200).text || '';
    const config = this.getConfig(profileName);
    const install = this.profileService.getInstall();
    const prompt = `请分析下面这份 DSH Hub 崩溃报告和日志尾部，帮助中文用户定位问题。

应用版本：0.2.2
DSH Hub 数据目录：${this.settings.getDataDir()}
DSH 安装目录：${install.dir || '未检测到'}
DSH 版本：${report.extra?.dshVersion || '未知'}
崩溃数量：${crashes.length}
最近崩溃：${latest.title || latest.type}
崩溃时间：${latest.at || latest.mtime || '未知'}
崩溃报告：
${truncate(JSON.stringify(report, null, 2), 14_000)}

日志尾部：
${truncate(logTail, 12_000)}

要求：
- 给出 1–2 句中文 summary，直接说明最可能发生了什么。
- severity 只能是 low、medium、high 之一。
- likelyCauses 是 1–4 条可能原因，按可能性排序；必须基于日志/报告，不要编造。
- actions 是 2–5 条可执行的中文排查/修复步骤。
- evidence 是 1–5 条日志或报告中的关键证据（短引用）。
- 只输出 JSON：{"summary":"...","severity":"...","likelyCauses":["..."],"actions":["..."],"evidence":["..."]}`;
    const result = await this.request(config, {
      system: '你是 DSH Hub 的故障诊断助手。只根据提供的日志与崩溃报告分析，不臆测；只输出严格 JSON。',
      prompt,
      maxTokens: 2_000,
    });
    let parsed;
    try {
      const raw = extractJsonObject(result.text);
      parsed = {
        summary: sanitizeCrashText(raw.summary, 400) || '模型没有给出摘要。',
        severity: ['low', 'medium', 'high'].includes(raw.severity) ? raw.severity : 'medium',
        likelyCauses: Array.isArray(raw.likelyCauses) ? raw.likelyCauses.map((item) => sanitizeCrashText(item, 300)).filter(Boolean).slice(0, 4) : [],
        actions: Array.isArray(raw.actions) ? raw.actions.map((item) => sanitizeCrashText(item, 300)).filter(Boolean).slice(0, 5) : [],
        evidence: Array.isArray(raw.evidence) ? raw.evidence.map((item) => sanitizeCrashText(item, 300)).filter(Boolean).slice(0, 5) : [],
      };
    } catch (error) {
      throw new AppError('CRASH_ANALYSIS_INVALID', '模型返回的崩溃分析格式不正确，请重试。', {
        cause: error,
        details: truncate(result.text, 500),
      });
    }
    this.logger.info('Crash analysis generated', { profileName, model: result.model, crashes: crashes.length });
    return {
      ...parsed,
      model: result.model,
      usage: result.usage,
      crashCount: crashes.length,
      latest,
      generatedAt: new Date().toISOString(),
    };
  }
}

function buildPrompt(detail) {
  const catalog = detail.catalog;
  const readme = stripForPrompt(detail.readme || '').slice(0, 4_500);
  return `请为下面这个 DSH 插件生成中文展示资料。

包名：${detail.name}
版本：${detail.version || '未知'}
声明描述：${detail.description || '无'}
关键词：${(detail.keywords || []).join(', ') || '无'}
作者：${detail.author || '未知'}
依赖来源：${detail.dependencySpec || '未知'}
插件类型：${detail.scope === 'client' ? '客户端界面插件' : '宿主/工具插件'}
当前是否启用：${detail.enabled ? '是' : '否'}
${catalog ? `社区资料：\n- 中文描述：${catalog.description || '无'}\n- 功能点：${(catalog.features || []).join('；') || '无'}\n- GitHub 星标：${catalog.stars || 0}` : '社区资料：无'}
README 摘要：
${readme || '（无）'}

请根据以上资料输出 JSON。`;
}

function parseAndSanitizeResult(text) {
  let raw;
  try {
    raw = extractJsonObject(text);
  } catch (error) {
    throw new AppError('MODEL_INVALID_JSON', '模型返回的内容不是合法 JSON。', {
      details: truncate(text, 500),
      cause: error,
    });
  }
  const displayName = sanitizeDisplayName(raw.displayName);
  if (!displayName) {
    throw new AppError('MODEL_INVALID_NAME', '模型返回的中文名称不可用。', { details: truncate(text, 500) });
  }
  const notes = sanitizeText(raw.notes, 600);
  if (notes.length < 10) {
    throw new AppError('MODEL_INVALID_NOTES', '模型返回的备注太短。', { details: truncate(text, 500) });
  }
  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.map((tag) => sanitizeText(tag, 16)).filter(Boolean))].slice(0, 6)
    : [];
  const category = MODEL_CATEGORIES.includes(raw.category) ? raw.category : inferCategory(raw.category);
  const confidence = clamp(Number(raw.confidence) || 0.65, 0, 1);
  return { displayName, notes, tags, category, confidence };
}

function sanitizeDisplayName(value) {
  let text = String(value || '').trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .replace(/[。！？!?，,；;：:]+$/g, '')
    .slice(0, 24)
    .trim();
  if (!/[\u4e00-\u9fff]/.test(text)) return '';
  return text;
}

function sanitizeText(value, max) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^["'“”`]+|["'“”`]+$/g, '')
    .trim()
    .slice(0, max);
}

function inferCategory(value) {
  const text = String(value || '');
  if (/界面|UI|skin|theme/i.test(text)) return '界面';
  if (/皮肤|skin/i.test(text)) return '皮肤';
  if (/模型|LLM|AI/i.test(text)) return '模型';
  if (/集成|连接|IM|wechat/i.test(text)) return '集成';
  if (/效率|自动|批量/i.test(text)) return '效率';
  if (/开发|debug|test/i.test(text)) return '开发';
  if (/工具|tool/i.test(text)) return '工具';
  return '其他';
}

function stripForPrompt(markdown) {
  return String(markdown || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readConfigText(profile) {
  const parts = [];
  for (const name of ['cordis.patch.yml', 'cordis.yml']) {
    const file = path.join(profile.dir, name);
    if (!pathExists(file)) continue;
    try { parts.push(fs.readFileSync(file, 'utf8')); } catch {}
  }
  return parts.join('\n');
}

function parseConfiguredBaseUrl(text) {
  const scoped = /llm-deepseek[\s\S]{0,1_200}?baseURL\s*:\s*['"]?([^'"\s]+)/.exec(text);
  if (scoped) return scoped[1];
  const any = /baseURL\s*:\s*['"]?([^'"\s]+)/.exec(text);
  return any?.[1] || '';
}

function parseConfiguredModel(text) {
  const scoped = /agent-default-model[\s\S]{0,800}?model\s*:\s*['"]?([A-Za-z0-9._-]+)/.exec(text);
  if (scoped) return scoped[1];
  const any = /model\s*:\s*['"]?(deepseek-[A-Za-z0-9._-]+)/.exec(text);
  return any?.[1] || '';
}

export function normalizeBaseUrl(input) {
  let value = String(input || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  let endpoint;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    if (url.hostname === 'api.deepseek.com' && (url.pathname === '/' || url.pathname === '')) {
      value = `${url.origin}/anthropic`;
    }
  } catch {
    throw new AppError('INVALID_BASE_URL', '模型 Base URL 必须是合法的 HTTP(S) 地址。', { details: input });
  }
  if (/\/v1\/messages$/.test(value)) endpoint = value;
  else if (/\/v1$/.test(value)) endpoint = `${value}/messages`;
  else endpoint = `${value}/v1/messages`;
  return { baseUrl: value, endpoint };
}

function mapHttpError(status) {
  if (status === 401 || status === 403) return 'MODEL_AUTH';
  if (status === 429) return 'MODEL_RATE_LIMIT';
  if (status === 400 || status === 422) return 'MODEL_BAD_REQUEST';
  if (status >= 500) return 'MODEL_SERVER';
  return 'MODEL_HTTP';
}

function httpErrorMessage(status) {
  if (status === 401 || status === 403) return '模型鉴权失败，请检查 DSH 的 API Key。';
  if (status === 429) return '模型服务限流，请稍后重试。';
  if (status === 400 || status === 422) return '模型服务拒绝了请求，请检查 Base URL 和模型名。';
  if (status >= 500) return '模型服务暂时不可用，请稍后重试。';
  return `模型服务返回 HTTP ${status}。`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeCrashText(value, max) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/["'`]+/g, '')
    .trim()
    .slice(0, max);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export {
  SYSTEM_PROMPT,
  buildPrompt,
  parseAndSanitizeResult,
  parseConfiguredBaseUrl,
  parseConfiguredModel,
  mapHttpError,
};
