import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { Logger } from '../src/main/services/logger.js';
import { makeTempDir } from './helpers/fixture.js';

test('logger writes, redacts credentials and supports tail', async (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const logger = new Logger({ dataDir: dir, appVersion: 'test' });
  logger.init();
  const fakeKey = ['sk', 'unit', 'test', 'fixture'].join('-');
  logger.info('test', `key ${fakeKey}`, { authorization: `Bearer ${fakeKey}` });
  const tail = logger.tail('app.log', 20);
  assert.match(tail.text, /key sk-\*\*\*/);
  assert.doesNotMatch(tail.text, /fixture/);
  assert.ok(logger.listLogs().some((file) => file.name === 'app.log'));
});

test('crash reports are written with process context and recent log lines', async (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const logger = new Logger({ dataDir: dir, appVersion: 'test' });
  logger.init();
  logger.info('test', 'before crash');
  const report = logger.createCrashReport({
    type: 'unit-test',
    title: '测试崩溃',
    detail: '这是测试',
    error: new Error('boom'),
  });
  assert.ok(fs.existsSync(report.file));
  const crashes = logger.listCrashes();
  assert.equal(crashes.length, 1);
  assert.equal(crashes[0].title, '测试崩溃');
  const read = logger.readCrash(crashes[0].id);
  assert.equal(read.report.type, 'unit-test');
  assert.ok(read.report.logTail.includes('before crash'));
});

test('an unclean previous run is detected and recorded', async (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = new Logger({ dataDir: dir, appVersion: 'test' });
  first.init();
  // Simulate a dead process: overwrite the running marker with an old pid.
  fs.writeFileSync(path.join(dir, '.running.json'), JSON.stringify({
    pid: 999_999_999,
    startedAt: Date.now() - 60_000,
    appVersion: 'test',
  }));
  const second = new Logger({ dataDir: dir, appVersion: 'test' });
  second.init();
  assert.ok(second.getPreviousRun());
  assert.match(second.getPreviousRun().summary, /没有正常退出/);
  const crashes = second.listCrashes();
  assert.ok(crashes.some((crash) => crash.type === 'unclean-shutdown'));
  second.markCleanExit('test-clean');
  assert.equal(second.getPreviousRun() !== null, true);
});

test('renderer errors are throttled by message/location', async (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const logger = new Logger({ dataDir: dir, appVersion: 'test' });
  logger.init();
  const first = logger.reportRendererError({ message: 'same-error', source: 'a', line: 1 });
  const second = logger.reportRendererError({ message: 'same-error', source: 'a', line: 1 });
  assert.equal(first.throttled, false);
  assert.equal(second.throttled, true);
});
