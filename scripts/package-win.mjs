#!/usr/bin/env node
/**
 * Build a one-folder portable Windows release.
 *
 * Usage:
 *   node scripts/package-win.mjs [--zip]
 *
 * Environment:
 *   ELECTRON_DIST              Path to an unpacked Electron distribution
 *   DSH_HUB_RELEASE_DIR        Output root (default: ./release)
 *   DSH_HUB_VERSION            Override package version
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = process.env.DSH_HUB_VERSION || pkg.version;
const releaseRoot = path.resolve(process.env.DSH_HUB_RELEASE_DIR || path.join(root, 'release'));
const outDir = path.join(releaseRoot, `DSH-Hub-${version}-win-x64`);
const zip = process.argv.includes('--zip');

const candidates = [
  process.env.ELECTRON_DIST,
  path.join(root, 'node_modules', 'electron', 'dist'),
  path.join(root, '..', '.tmp', 'electron-install', 'node_modules', 'electron', 'dist'),
].filter(Boolean);
const electronDist = candidates.find((dir) => fs.existsSync(path.join(dir, 'electron.exe')));
if (!electronDist) {
  console.error('找不到 Electron 发行目录。请设置 ELECTRON_DIST 或先安装 Electron。');
  process.exit(1);
}

console.log(`Electron: ${electronDist}`);
console.log(`Output:   ${outDir}`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

copyDirectory(electronDist, outDir, (source) => {
  const basename = path.basename(source);
  return basename !== 'default_app.asar' && basename !== 'app.asar' && basename !== 'app';
});

const electronExe = path.join(outDir, 'electron.exe');
const runtimeExe = path.join(outDir, 'DSH-Hub-Runtime.exe');
const appExe = path.join(outDir, 'DSH-Hub.exe');
if (!fs.existsSync(electronExe)) throw new Error('Electron distribution has no electron.exe');
fs.renameSync(electronExe, runtimeExe);

const resourcesDir = path.join(outDir, 'resources');
fs.rmSync(path.join(resourcesDir, 'default_app.asar'), { force: true });
const appDir = path.join(resourcesDir, 'app');
fs.mkdirSync(appDir, { recursive: true });

const releasePackage = {
  name: pkg.name,
  productName: pkg.productName,
  version,
  description: pkg.description,
  author: pkg.author,
  license: pkg.license,
  type: 'module',
  main: 'src/main/main.js',
};
fs.writeFileSync(path.join(appDir, 'package.json'), `${JSON.stringify(releasePackage, null, 2)}\n`);
for (const entry of ['src', 'assets', 'docs']) {
  copyDirectory(path.join(root, entry), path.join(appDir, entry));
}
for (const file of ['README.md', 'README.zh-CN.md', 'LICENSE', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md']) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(appDir, file));
}

const dataDir = path.join(outDir, 'data');
fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'crashes'), { recursive: true });
fs.writeFileSync(path.join(dataDir, 'README.txt'), 'DSH Hub portable data directory. Logs, crash reports, settings and snapshots live here.\r\n');

fs.writeFileSync(path.join(outDir, '启动说明.txt'), [
  'DSH Hub · DeepSeek Harness 控制中枢',
  '',
  '1. 双击 DSH-Hub.exe 启动。',
  '2. 首次启动会自动读取 %USERPROFILE%\\.dsh，若路径不同请在「设置」中修改。',
  '3. 所有个人数据保存在本目录的 data\\ 文件夹；日志位于 data\\logs，崩溃报告位于 data\\crashes。',
  '4. 插件启停、套装切换后需要重启或热重载 DeepSeek Harness 才会完全生效；每次写入前都会自动备份 package.json。',
  '5. AI 起名使用 DSH 已配置的 DeepSeek 模型与 API Key，不读取、不上传其他内容。',
  '6. data\\self-test.json 是打包时自检结果；可以运行 DSH-Hub.exe --self-test 复跑。',
  '',
  '源码与扩展说明见 resources\\app\\docs 与 README.zh-CN.md。',
].join('\r\n'));

let launcherBuilt = false;
const icon = path.join(root, 'assets', 'icon.ico');
const launcherSource = path.join(root, 'scripts', 'launcher-dsh-hub.cs');
const cscCandidates = [
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
];
const csc = cscCandidates.find((candidate) => fs.existsSync(candidate));
if (csc && fs.existsSync(launcherSource) && fs.existsSync(icon) && process.platform === 'win32') {
  const buildDir = path.join(releaseRoot, '.launcher-build');
  fs.mkdirSync(buildDir, { recursive: true });
  const assemblyInfo = path.join(buildDir, 'AssemblyInfo.cs');
  const numericVersion = toNumericVersion(version);
  fs.writeFileSync(assemblyInfo, [
    'using System.Reflection;',
    '[assembly: AssemblyTitle("DSH Hub")]',
    '[assembly: AssemblyDescription("DeepSeek Harness Control Center")]',
    '[assembly: AssemblyProduct("DSH Hub")]',
    '[assembly: AssemblyCompany("DSH Hub contributors")]',
    '[assembly: AssemblyCopyright("Copyright © 2026 DSH Hub contributors")]',
    `[assembly: AssemblyVersion("${numericVersion}")]`,
    `[assembly: AssemblyFileVersion("${numericVersion}")]`,
    '',
  ].join('\n'));
  const result = spawnSync(csc, [
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    `/win32icon:${icon}`,
    `/out:${appExe}`,
    '/r:System.Windows.Forms.dll',
    launcherSource,
    assemblyInfo,
  ], { cwd: outDir, stdio: 'inherit' });
  if (result.status === 0 && fs.existsSync(appExe)) {
    launcherBuilt = true;
  } else {
    console.warn('Launcher compilation failed; using the Electron runtime as the main EXE.');
    fs.renameSync(runtimeExe, appExe);
  }
  fs.rmSync(buildDir, { recursive: true, force: true });
} else {
  console.warn('csc.exe or launcher assets not available; using the Electron runtime as the main EXE.');
  fs.renameSync(runtimeExe, appExe);
}

const selfTest = runPackagedSelfTest();
prunePackagedData();

const size = directorySize(outDir);
console.log(`Build complete (${(size / 1024 / 1024).toFixed(1)} MB, launcher ${launcherBuilt ? 'built' : 'fallback'}, self-test ${selfTest ? 'ok' : 'skipped'})`);

if (zip) {
  const zipFile = path.join(releaseRoot, `DSH-Hub-${version}-win-x64.zip`);
  fs.rmSync(zipFile, { force: true });
  const systemTar = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'tar.exe');
  let zipOk = false;
  if (fs.existsSync(systemTar)) {
    const result = spawnSync(systemTar, ['-a', '-c', '-f', zipFile, '-C', releaseRoot, path.basename(outDir)], {
      stdio: 'inherit',
      windowsHide: true,
    });
    zipOk = result.status === 0 && fs.existsSync(zipFile);
  }
  if (!zipOk) {
    console.warn('System tar could not create the zip; trying PowerShell Compress-Archive...');
    const ps = spawnSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -LiteralPath '${path.join(releaseRoot, path.basename(outDir)).replaceAll("'", "''")}' -DestinationPath '${zipFile.replaceAll("'", "''")}' -Force`,
    ], { stdio: 'inherit', windowsHide: true });
    zipOk = ps.status === 0 && fs.existsSync(zipFile);
  }
  if (!zipOk) {
    console.warn('Could not create the zip; the release folder is still usable.');
  } else {
    console.log(`Zip: ${zipFile} (${(fs.statSync(zipFile).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

function copyDirectory(source, target, filter = null) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    if (filter && !filter(from, entry)) continue;
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to, filter);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function directorySize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    }
  }
  return total;
}

function toNumericVersion(input) {
  const parts = String(input).split('.').map((part) => Number.parseInt(part, 10) || 0);
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4).join('.');
}

/**
 * Run the just-built app's read-only self-test so the release carries hard
 * evidence in data/self-test.json. The launcher forwards --self-test and waits
 * for the Electron runtime, so the exit code here is the real test result.
 */
function runPackagedSelfTest() {
  if (process.env.DSH_HUB_SKIP_SELF_TEST === '1') {
    console.warn('Packaged self-test skipped by DSH_HUB_SKIP_SELF_TEST=1.');
    fs.rmSync(path.join(dataDir, 'self-test.json'), { force: true });
    return null;
  }
  const selfTestFile = path.join(dataDir, 'self-test.json');
  fs.rmSync(selfTestFile, { force: true });

  const env = { ...process.env };
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'DSH_HUB_DATA_DIR',
    'DSH_HUB_CAPTURE',
    'DSH_HUB_CAPTURE_JS',
    'DSH_HUB_CAPTURE_DELAY',
    'DSH_HUB_ROUTE',
    'DSH_HUB_DEV',
  ]) {
    delete env[key];
  }

  console.log('Running packaged self-test...');
  const result = spawnSync(appExe, ['--self-test'], {
    cwd: outDir,
    env,
    windowsHide: true,
    timeout: 120_000,
  });
  if (result.error) {
    throw new Error(`Packaged self-test could not start: ${result.error.message}`);
  }
  if (!fs.existsSync(selfTestFile)) {
    throw new Error(`Packaged self-test produced no ${selfTestFile}`);
  }
  let report;
  try {
    report = JSON.parse(fs.readFileSync(selfTestFile, 'utf8'));
  } catch (error) {
    throw new Error(`Packaged self-test wrote invalid JSON: ${error.message}`);
  }
  if (!report.ok || report.isPackaged !== true) {
    throw new Error(`Packaged self-test failed (ok=${report.ok}, isPackaged=${report.isPackaged}, exit=${result.status}); see ${selfTestFile}`);
  }
  console.log(`Self-test: ok · Electron ${report.electron} · ${report.profiles?.length || 0} profiles · ${report.sessions?.total ?? 0} sessions · ${report.skills?.total ?? 0} skills`);
  return report;
}

/** Remove Chromium caches and transient run markers, keep self-test.json. */
function prunePackagedData() {
  for (const name of ['chromium', 'backups', 'exports']) {
    fs.rmSync(path.join(dataDir, name), { recursive: true, force: true });
  }
  for (const name of ['.running.json', '.last-exit.json']) {
    fs.rmSync(path.join(dataDir, name), { force: true });
  }
  for (const sub of ['logs', 'crashes']) {
    const dir = path.join(dataDir, sub);
    fs.mkdirSync(dir, { recursive: true });
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
    }
  }
  fs.writeFileSync(path.join(dataDir, 'README.txt'), [
    'DSH Hub portable data directory.',
    '',
    'self-test.json 是打包时由 DSH-Hub.exe --self-test 生成的只读自检结果。',
    '运行应用后，设置、日志、崩溃报告和备份也会写入这个目录。',
    '',
  ].join('\r\n'));
}
