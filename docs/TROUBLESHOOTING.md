# Troubleshooting

Start at **诊断** in the app: it shows the app version, profile, recent logs,
crash reports, and a button to copy the full diagnostics JSON.

## `npm start` says it cannot find Electron

Check the expected file:

```powershell
Test-Path node_modules\electron\dist\electron.exe
```

- `True`: rerun `npm start`.
- `False`: run `npm install` again. The repository has a `postinstall` hook that
  invokes Electron's installer and explains the fallback if the download fails.
- If your network blocks the download, point `ELECTRON_BIN` at **any unpacked
  Electron directory or executable**:

```powershell
$env:ELECTRON_BIN = "D:\electron-v44.7.0-win32-x64"
npm start
```

`ELECTRON_DIST` is the equivalent for packaging. When DSH Hub is launched from a
DSH-hosted terminal (`ELECTRON_RUN_AS_NODE=1`), the development script adds
`--no-sandbox` automatically; this is development-only behavior.

## The app opens with “没有找到可用的 DSH 数据目录”

- Default location: `C:\Users\<you>\.dsh`.
- Check that `profiles\desktop\package.json` (or `web`) exists.
- Start DeepSeek Harness once so it creates the profile.
- Open **设置 → DSH 连接** and set an explicit DSH Home.
- If your DSH uses a different environment, launch DSH Hub with `DSH_HOME` set.

## “没有找到模型密钥” / model test returns 401

DSH Hub resolves the key in this order:

1. environment variable named by `settings.model.apiKeyEnv` (default
   `DEEPSEEK_API_KEY`);
2. `<DSH Home>/.credentials.yaml` → `refs.DEEPSEEK_API_KEY`.

Set the key in DSH's Models settings, or export it, then open **设置** and use
**测试连接**. The UI only ever shows a masked suffix.

Other model failures:

| Symptom | Likely cause |
| --- | --- |
| HTTP 400/422 | wrong Base URL or model ID |
| HTTP 401/403 | invalid/expired key |
| HTTP 429 | rate limit; retry later |
| timeout | network/proxy; increase timeout in Settings |
| `MODEL_INVALID_JSON` twice | model did not follow the JSON prompt; retry or use “用本地社区资料” |

AI calls consume tokens. Use the local catalog button when you do not want a
request.

## Plugin toggles “succeed” but DSH still loads the plugin

- DSH reads `dsh.profile.bundles` at boot. Restart DeepSeek Harness, or trigger
  HMR if your profile has it enabled.
- A package only becomes toggleable if it declares `dsh.bundle` and is a direct
  dependency of the selected profile.
- Check the backup directory if a manifest edit ever looks wrong:
  `<profile>/.dsh-hub/backups/`.

## “该依赖没有声明 dsh.bundle，无法单独启停”

The dependency is installed but is not a DSH bundle (for example a skin loaded
by another plugin). DSH Hub will not guess how to load it. Manage it through its
own plugin or the DSH plugin UI.

## A set enables/closes only some plugins

Some members may be missing, not bundle-capable, or already in the target state.
The result toast reports how many were skipped. Open the set card to see member
states.

## Sessions show “未命名会话”

Some DSH sessions never generate a title (for example an interrupted session).
DSH Hub falls back to the first user message, then to “未命名会话”. The raw log
is still browsable under the session ID.

## “无法读取的会话” / preview too large

- Summary reading caps at the first 1.5 MB; if the title or first message is
  later, the title may fall back.
- Full previews are capped at 50 MB to keep the UI responsive.
- The original file is never modified; open it with **打开目录**.

## I deleted a session/skill by accident

Deletion uses the Windows recycle bin, so restore it from there. Metadata and
manifest backups live under the profile's `.dsh-hub/backups`; skill backups
also live under the app's `data/backups/skills`.

## Crash at startup

1. Look at `<app>/data/logs/app.log`.
2. Look at `<app>/data/crashes/`.
3. If the app cannot boot because of a bad settings file, move
   `data/settings.json` aside; it will be recreated.
4. If the crash happens before logs, run `DSH-Hub.exe --self-test` from a
   terminal to get a JSON result (self-test is read-only).

## Electron/Chromium error about named pipes or sandbox access

This can happen when DSH Hub is launched from inside another confined
environment (for example some sandboxed terminals). Launch `DSH-Hub.exe`
normally from Explorer, not from the sandboxed process.

## How do I reset everything?

- **App settings/logs:** quit the app, delete or rename `<app>/data`.
- **Plugin names/notes/sets:** delete `<profile>/.dsh-hub`.
- **Do not** delete `node_modules` or `package.json` unless you intend to
  reinstall the profile's plugins.

Always quit the app and DSH before manually restoring a backup.
