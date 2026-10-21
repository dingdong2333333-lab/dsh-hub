import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import { AppError } from '../utils/errors.js';
import { dshVersionFromInstall } from '../app-paths.js';
import { ensureDir } from '../utils/fs-utils.js';

const execFileAsync = promisify(execFile);

/**
 * Port of the useful half of dsh-app-controls.
 *
 * Restart prefers the already-installed dsh-app-controls loopback route. That
 * route uses the original detached WMI worker, which is much more reliable than
 * killing the process tree from DSH Hub. If the plugin is not available we fall
 * back to our own detached PowerShell worker.
 *
 * Reload uses Windows UI automation to focus the DSH desktop window and send
 * Ctrl+R. This is the same action as the "刷新" button in dsh-app-controls and
 * intentionally does not reload DSH Hub's own window.
 */
export class AppControlService {
  constructor({ settings, profileService, logger, dataDir }) {
    this.settings = settings;
    this.profileService = profileService;
    this.logger = logger.child('app-control');
    this.dataDir = dataDir;
  }

  async status() {
    const install = this.profileService.getInstall();
    let processes = [];
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist.exe', ['/FI', 'IMAGENAME eq DeepSeek Harness.exe', '/FO', 'CSV', '/NH'], {
          timeout: 5_000,
          windowsHide: true,
          encoding: 'utf8',
        });
        processes = String(stdout)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.startsWith('"'))
          .map((line) => line.split('","').map((cell) => cell.replace(/^"|"$/g, '')))
          .filter((cells) => cells.length >= 2)
          .map((cells) => ({ image: cells[0], pid: Number(cells[1]) || 0 }));
      }
    } catch (error) {
      this.logger.warn('Unable to query DSH processes', { error: error.message });
    }
    return {
      install,
      version: dshVersionFromInstall(install.dir),
      running: processes.length > 0,
      processes,
      canRestart: Boolean(install.exe && fs.existsSync(install.exe)),
      platform: process.platform,
    };
  }

  /**
   * Find the local web server port of the running DSH host and verify that the
   * dsh-app-controls plugin route is reachable.
   */
  async discoverWeb() {
    if (process.platform !== 'win32') return null;
    const script = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      "$p = Get-CimInstance Win32_Process -Filter \"Name='DeepSeek Harness.exe'\" | Where-Object { $_.CommandLine -match 'dsh-desktop-host' } | Select-Object -First 1",
      'if (-not $p) { exit 3 }',
      '$ports = Get-NetTCPConnection -State Listen -OwningProcess $p.ProcessId -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort',
      'if (-not $ports) { exit 4 }',
      '$ports | Sort-Object -Unique | ForEach-Object { Write-Output $_ }',
    ].join('\r\n');
    let ports = [];
    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        timeout: 8_000,
        windowsHide: true,
        encoding: 'utf8',
      });
      ports = String(stdout).split(/\r?\n/).map((line) => Number(line.trim())).filter((port) => Number.isInteger(port) && port > 0);
    } catch (error) {
      this.logger.warn('Unable to discover DSH web port', { error: error.message });
    }
    // Some environments expose the port in env; keep these as a last resort.
    for (const fallback of [process.env.DSH_HUB_DSH_PORT, 13410, 5860]) {
      const port = Number(fallback);
      if (Number.isInteger(port) && port > 0 && !ports.includes(port)) ports.push(port);
    }
    for (const port of ports) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/dsh-app-controls/status`, {
          signal: AbortSignal.timeout(1_500),
          headers: { accept: 'application/json' },
        });
        if (!response.ok) continue;
        const body = await response.json();
        if (body?.ok) return { port, status: body };
      } catch {}
    }
    return null;
  }

  async restart() {
    const install = this.profileService.getInstall();
    if (!install.exe || !fs.existsSync(install.exe)) {
      throw new AppError('DSH_EXE_MISSING', '没有找到 DeepSeek Harness 可执行文件，无法重启。', {
        details: install.dir || '(unknown)',
      });
    }
    if (process.platform !== 'win32') {
      throw new AppError('UNSUPPORTED_PLATFORM', '当前版本的应用控制仅支持 Windows。');
    }

    // Prefer the official dsh-app-controls restart route. Its WMI worker is
    // outside the Electron job object and handles the Host/app PIDs correctly.
    const web = await this.discoverWeb();
    if (web) {
      try {
        const response = await fetch(`http://127.0.0.1:${web.port}/dsh-app-controls/restart`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(4_000),
        });
        const body = await response.json().catch(() => ({}));
        if (response.ok && body?.ok !== false) {
          this.logger.warn('DSH restart delegated to dsh-app-controls', { port: web.port, mode: body.mode || '' });
          return {
            scheduled: true,
            mode: 'dsh-app-controls',
            port: web.port,
            already: Boolean(body.already),
            warning: 'DeepSeek Harness 将被关闭并重新启动；正在运行的任务和当前 DSH 页面会中断。',
          };
        }
        this.logger.warn('dsh-app-controls restart refused; using fallback', { status: response.status, body });
      } catch (error) {
        this.logger.warn('dsh-app-controls restart unavailable; using fallback', { error: error.message });
      }
    }

    const workerDir = path.join(this.dataDir, 'workers');
    ensureDir(workerDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(workerDir, `restart-${stamp}.log`);
    const scriptFile = path.join(workerDir, `restart-${stamp}.ps1`);
    const psQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;
    const script = [
      "$ErrorActionPreference = 'Continue'",
      `$log = ${psQuote(logFile)}`,
      "function Write-Log($message) { Add-Content -LiteralPath $log -Value ('[' + (Get-Date).ToString('o') + '] ' + $message) -Encoding UTF8 }",
      "Write-Log 'restart requested by DSH Hub (fallback)'",
      "Start-Sleep -Milliseconds 900",
      "Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | ForEach-Object {",
      "  try { Write-Log ('stopping pid ' + $_.Id); Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch { Write-Log ('stop failed: ' + $_.Exception.Message) }",
      "}",
      "Start-Sleep -Seconds 2",
      `$exe = ${psQuote(install.exe)}`,
      `$dir = ${psQuote(install.dir)}`,
      "if (-not (Test-Path -LiteralPath $exe)) { Write-Log 'aborted: executable missing'; exit 1 }",
      "try {",
      "  $p = Start-Process -FilePath $exe -WorkingDirectory $dir -PassThru",
      "  Write-Log ('launched pid ' + $p.Id)",
      "} catch { Write-Log ('launch failed: ' + $_.Exception.Message); exit 1 }",
      '',
    ].join('\r\n');
    fs.writeFileSync(scriptFile, script, 'utf8');
    this.logger.warn('Scheduling DSH restart', { exe: install.exe, scriptFile, logFile });
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', scriptFile], {
      cwd: install.dir,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return {
      scheduled: true,
      mode: 'process-fallback',
      scriptFile,
      logFile,
      warning: 'DeepSeek Harness 将被关闭并重新启动；正在运行的任务和当前 DSH 页面会中断。',
    };
  }

  /**
   * Reload the DSH desktop renderer without restarting the Host. This mirrors
   * dsh-app-controls' "刷新" button (Ctrl+R). It never reloads DSH Hub itself.
   */
  async reloadDsh() {
    if (process.platform !== 'win32') {
      throw new AppError('UNSUPPORTED_PLATFORM', '当前版本的应用控制仅支持 Windows。');
    }
    const workerDir = path.join(this.dataDir, 'workers');
    ensureDir(workerDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const scriptFile = path.join(workerDir, `reload-dsh-${stamp}.ps1`);
    const script = String.raw`$ErrorActionPreference = 'Stop'
$p = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Error 'DSH window not found'; exit 3 }
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DshWin32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
[void][DshWin32]::ShowWindow($p.MainWindowHandle, 9)
[void][DshWin32]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 350
[DshWin32]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
[DshWin32]::keybd_event(0x52, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 70
[DshWin32]::keybd_event(0x52, 0, 2, [UIntPtr]::Zero)
[DshWin32]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
Write-Output ('reloaded ' + $p.Id)
`;
    fs.writeFileSync(scriptFile, script, 'utf8');
    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptFile], {
        timeout: 12_000,
        windowsHide: true,
        encoding: 'utf8',
      });
      this.logger.info('DSH reload requested', { output: String(stdout).trim() });
      return { reloaded: true, action: 'dsh-reload', message: String(stdout).trim() || '已向 DSH 窗口发送刷新。' };
    } catch (error) {
      const details = String(error?.stderr || error?.message || error).trim();
      throw new AppError('DSH_RELOAD_FAILED', '没有找到 DSH 窗口，或发送刷新快捷键失败。', { details });
    }
  }

  async launch() {
    const install = this.profileService.getInstall();
    if (!install.exe || !fs.existsSync(install.exe)) {
      throw new AppError('DSH_EXE_MISSING', '没有找到 DeepSeek Harness 可执行文件。');
    }
    const child = spawn(install.exe, [], { cwd: install.dir, detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    return { launched: true, exe: install.exe };
  }
}
