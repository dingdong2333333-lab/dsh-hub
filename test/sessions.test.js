import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { decodeZstdFrames } from '../src/main/services/session-service.js';
import { createFixtureHome, createServices, writeSessionFrame } from './helpers/fixture.js';

function sessionEvents() {
  return [
    { type: 'session', data: { id: 'session-test-0001', createdAt: 1_700_000_000_000, cwd: 'E:\\work\\demo', agentPreset: 'standard' } },
    { type: 'user/message', seq: 1, time: 1_700_000_001_000, data: { role: 'user', content: [{ type: 'text', text: '帮我检查一下这个仓库' }], source: { kind: 'user' } } },
    { type: 'user/message', seq: 2, time: 1_700_000_001_050, data: { role: 'user', content: [{ type: 'text', text: 'runtime context should be hidden' }], source: { kind: 'runtime-context' } } },
    { type: 'session/title', seq: 2, time: 1_700_000_001_100, data: { title: '帮我检查一下这个仓库', source: { kind: 'fallback' } } },
    { type: 'assistant/message', seq: 3, time: 1_700_000_002_000, data: { message: { role: 'assistant', content: [{ type: 'text', text: '好的，我先看看。' }, { type: 'tool-call', name: 'ops_bash' }], source: { model: 'deepseek-flash' } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } } },
    { type: 'session/title', seq: 4, time: 1_700_000_003_000, data: { title: '检查仓库并运行测试', source: { kind: 'provider' } } },
  ];
}

test('decodeZstdFrames decodes concatenated frames', () => {
  const frames = Buffer.concat([
    zlib.zstdCompressSync(Buffer.from('{"a":1}\n')),
    zlib.zstdCompressSync(Buffer.from('{"b":2}\n')),
  ]);
  const out = decodeZstdFrames(frames).toString('utf8');
  assert.equal(out, '{"a":1}\n{"b":2}\n');
});

test('session list extracts title, workspace, source and size', async (t) => {
  const home = createFixtureHome();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  writeSessionFrame(home.home, { id: 'session-test-0001', events: sessionEvents() });
  const services = createServices(home);
  const data = await services.sessionService.list();
  assert.equal(data.stats.total, 1);
  assert.equal(data.sessions[0].title, '检查仓库并运行测试');
  assert.equal(data.sessions[0].workspace, 'E:\\work\\demo');
  assert.equal(data.sessions[0].firstPrompt, '帮我检查一下这个仓库');
  assert.equal(data.sessions[0].agentPreset, 'standard');
  assert.ok(data.sessions[0].size > 0);
});

test('session detail returns messages, tool calls and usage', async (t) => {
  const home = createFixtureHome();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  writeSessionFrame(home.home, { id: 'session-test-0001', events: sessionEvents() });
  const services = createServices(home);
  const list = await services.sessionService.list();
  const detail = await services.sessionService.detail(list.sessions[0].id);
  assert.equal(detail.messageCount, 2);
  assert.equal(detail.messages[0].role, 'user');
  assert.equal(detail.messages[1].toolCalls[0], 'ops_bash');
  assert.equal(detail.usage.totalTokens, 15);
  assert.equal(detail.messages[1].model, 'deepseek-flash');
  assert.equal(detail.hiddenContextCount, 1);
  assert.ok(!detail.messages.some((message) => message.text.includes('runtime context')));
});

test('session export returns decompressed JSONL and a safe filename', async (t) => {
  const home = createFixtureHome();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  writeSessionFrame(home.home, { id: 'session-test-0001', events: sessionEvents() });
  const services = createServices(home);
  const list = await services.sessionService.list();
  const exported = await services.sessionService.exportSession(list.sessions[0].id);
  assert.match(exported.content, /"type":"session"/);
  assert.match(exported.suggestedName, /\.jsonl$/);
  assert.ok(!/[<>:"/\\|?*]/.test(exported.suggestedName));
});

test('session trash validates the path and calls the provided trash function', async (t) => {
  const home = createFixtureHome();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const written = writeSessionFrame(home.home, { id: 'session-test-0001', events: sessionEvents() });
  const services = createServices(home);
  let removed = null;
  const result = await services.sessionService.trashSession('session-test-0001', async (target) => {
    removed = target;
    fs.rmSync(target, { recursive: true, force: true });
  });
  assert.equal(removed, written.dir);
  assert.equal(result.id, 'session-test-0001');
  assert.equal(fs.existsSync(written.dir), false);
});

test('an unknown session produces a friendly error', async (t) => {
  const home = createFixtureHome();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  writeSessionFrame(home.home, { id: 'session-test-0001', events: sessionEvents() });
  const services = createServices(home);
  await assert.rejects(services.sessionService.detail('does-not-exist'), /没有找到这个会话/);
});
