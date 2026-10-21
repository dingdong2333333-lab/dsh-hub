import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  addCatalogCache,
  createFixtureHome,
  createServices,
  jsonResponse,
} from './helpers/fixture.js';
import {
  normalizeBaseUrl,
  parseAndSanitizeResult,
} from '../src/main/services/model-service.js';

function modelFixture() {
  const home = createFixtureHome({
    plugins: [
      {
        name: 'demo-whale',
        version: '1.2.3',
        description: 'A floating balance whale widget for DeepSeek Harness.',
        keywords: ['dsh', 'widget', 'balance'],
        readme: '# Demo Whale\n\nShows the account balance and daily usage. It adds a floating overlay and supports drag-to-snap.',
        enabled: true,
      },
      {
        name: 'demo-tools',
        version: '0.1.0',
        description: 'Extra repository tools for DSH.',
        keywords: ['dsh', 'tools'],
        enabled: true,
      },
    ],
  });
  addCatalogCache(home.profileDir, [{
    s: 'demo-whale',
    n: 'demo-whale',
    vr: 'v1.2.3',
    c: 'interface',
    f: ['实时余额', '悬浮窗吸附'],
    d: 'DSH 界面右下角的余额小鲸鱼挂件，实时显示账户余额和今日用量。',
    r: { repo: 'example/demo-whale', npmPackage: 'demo-whale' },
    sg: 99,
    v: 'verified',
  }]);
  return home;
}

test('normalizeBaseUrl handles the official URL, /v1, and full endpoints', () => {
  assert.deepEqual(normalizeBaseUrl('https://api.deepseek.com'), {
    baseUrl: 'https://api.deepseek.com/anthropic',
    endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
  });
  assert.deepEqual(normalizeBaseUrl('https://api.deepseek.com/anthropic/'), {
    baseUrl: 'https://api.deepseek.com/anthropic',
    endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
  });
  assert.equal(normalizeBaseUrl('https://gateway.example/v1').endpoint, 'https://gateway.example/v1/messages');
  assert.equal(normalizeBaseUrl('https://gateway.example/v1/messages').endpoint, 'https://gateway.example/v1/messages');
  assert.throws(() => normalizeBaseUrl('ftp://example.com'), /HTTP/);
});

test('parseAndSanitizeResult accepts valid JSON and rejects English names', () => {
  const parsed = parseAndSanitizeResult('```json\n{"displayName":"余额小鲸鱼","notes":"实时显示账户余额与今日用量，适合关注成本的用户。","tags":["余额","挂件"],"category":"界面","confidence":0.9}\n```');
  assert.equal(parsed.displayName, '余额小鲸鱼');
  assert.equal(parsed.category, '界面');
  assert.equal(parsed.confidence, 0.9);
  assert.throws(() => parseAndSanitizeResult('{"displayName":"Whale Widget","notes":"A floating widget for account balance and daily usage.","tags":[],"category":"界面"}'), /中文名称/);
  assert.throws(() => parseAndSanitizeResult('not json'), /JSON/);
});

test('model status finds a key from the environment without exposing it', async (t) => {
  const home = modelFixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const previous = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key-1234567890';
  t.after(() => {
    if (previous == null) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous;
  });
  const services = createServices(home);
  const status = services.modelService.status('test');
  assert.equal(status.configured, true);
  assert.match(status.keyMasked, /7890$/);
  assert.doesNotMatch(JSON.stringify(status), /test-key-1234567890/);
  assert.equal(status.endpoint, 'https://api.deepseek.com/anthropic/v1/messages');
});

test('generateForPlugin calls fetch, parses JSON, and persists metadata', async (t) => {
  const home = modelFixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-model-key';
  let requested = null;
  globalThis.fetch = async (url, options) => {
    requested = { url, body: JSON.parse(options.body), headers: options.headers };
    return jsonResponse({
      id: 'msg-test',
      model: 'deepseek-flash',
      content: [{ type: 'text', text: JSON.stringify({
        displayName: '余额小鲸鱼',
        notes: '常驻界面右下角的余额浮窗，实时显示账户余额与今日用量，支持拖动吸附。适合想随时掌握成本的用户。',
        tags: ['余额', '挂件', '用量'],
        category: '界面',
        confidence: 0.88,
      }) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const services = createServices(home);
  const result = await services.modelService.generateForPlugin('test', 'demo-whale', { force: true });
  assert.equal(result.fallback, false);
  assert.equal(result.meta.displayName, '余额小鲸鱼');
  assert.equal(requested.url, 'https://api.deepseek.com/anthropic/v1/messages');
  assert.equal(requested.headers['x-api-key'], 'test-model-key');
  assert.equal(requested.body.model, 'deepseek-flash');
  assert.deepEqual(requested.body.thinking, { type: 'disabled' });
  assert.ok(requested.body.messages[0].content.includes('demo-whale'));
  const metaFile = path.join(home.profileDir, '.dsh-hub', 'plugin-meta.json');
  assert.ok(fs.existsSync(metaFile));
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  assert.equal(meta.plugins['demo-whale'].displayName, '余额小鲸鱼');
});

test('model failures fall back to the local catalog when enabled', async (t) => {
  const home = modelFixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-model-key';
  globalThis.fetch = async () => jsonResponse({ error: { message: 'invalid key' } }, 401);
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const services = createServices(home);
  const result = await services.modelService.generateForPlugin('test', 'demo-whale', { force: true });
  assert.equal(result.fallback, true);
  assert.match(result.warning, /本地社区中文资料/);
  assert.ok(result.meta.notes.includes('余额'));
});

test('batch generation processes every plugin and reports progress', async (t) => {
  const home = modelFixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-model-key';
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const prompt = body.messages[0].content;
    const isWhale = prompt.includes('demo-whale');
    return jsonResponse({
      model: 'deepseek-flash',
      content: [{ type: 'text', text: JSON.stringify({
        displayName: isWhale ? '余额小鲸鱼' : '仓库工具箱',
        notes: isWhale ? '显示账户余额的桌面浮窗，适合关注成本的用户。' : '为 DSH 增加仓库检索与批量处理工具的插件。',
        tags: [isWhale ? '余额' : '仓库'],
        category: isWhale ? '界面' : '工具',
        confidence: 0.8,
      }) }],
      usage: { output_tokens: 20 },
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const progress = [];
  const services = createServices(home);
  const result = await services.modelService.generateBatch('test', ['demo-whale', 'demo-tools'], (event) => progress.push(event));
  assert.equal(result.total, 2);
  assert.equal(result.results.filter((item) => item.ok).length, 2);
  assert.ok(progress.some((event) => event.status === 'running'));
  assert.equal(progress.filter((event) => event.status === 'ok').length, 2);
  const inventory = await services.pluginService.list('test');
  assert.equal(inventory.profile.withChinese, 2);
});

test('analyzeCrashes feeds crash context to the model and parses diagnosis JSON', async (t) => {
  const home = modelFixture();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-model-key';
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return jsonResponse({
      model: 'deepseek-flash',
      content: [{ type: 'text', text: JSON.stringify({
        summary: '上次启动在加载插件时失败，疑似 bundle 配置被改坏。',
        severity: 'medium',
        likelyCauses: ['插件 bundle 声明不完整', '配置写入被中断'],
        actions: ['打开诊断查看完整堆栈', '恢复到上一个配置快照', '重启 DSH 验证'],
        evidence: ['startup-failure: plugin not found'],
      }) }],
      usage: { input_tokens: 200, output_tokens: 80 },
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const services = createServices(home);
  services.modelService.rootLogger = {
    listCrashes: () => [{ id: 'crash-1', title: '启动失败', type: 'startup-failure', at: '2026-10-21T00:00:00.000Z' }],
    readCrash: () => ({ report: { type: 'startup-failure', message: 'plugin not found', extra: {} } }),
    tail: () => ({ text: 'startup-failure: plugin not found' }),
  };
  const result = await services.modelService.analyzeCrashes('test');
  assert.equal(result.severity, 'medium');
  assert.match(result.summary, /插件/);
  assert.equal(result.likelyCauses.length, 2);
  assert.equal(result.actions.length, 3);
  assert.match(requestBody.messages[0].content, /startup-failure/);
  assert.match(requestBody.messages[0].content, /只输出 JSON/);
});
