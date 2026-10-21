# DSH Hub

A local desktop control center for **DeepSeek Harness (DSH)**. Manage plugins, the community plugin marketplace, configuration snapshots, sessions, and skills in one polished GUI, then give every plugin a Chinese display name, notes, and reusable one-click plugin sets.

[中文说明](README.zh-CN.md)

## Features

- **Plugin inventory** — versions, sources, enabled state, client/host type, community metadata, favorites, search and filters.
- **Plugin marketplace** — browse the local DSH Plugin Hub catalog, search/filter/sort, inspect details, and install, update, uninstall or custom-install through the DSH CLI. Operations stream logs and create a config snapshot first.
- **Configuration snapshots** — save `package.json`, cordis config, lockfile, plugin metadata and sets; restore with an automatic pre-restore snapshot. Snapshots live in DSH Hub's data directory, not in the DSH profile.
- **DSH runtime panel** — read the installed DSH version from `app.asar`, open DSH, reload the DSH window (Ctrl+R), or restart DSH through the installed `dsh-app-controls` route.
- **AI Chinese metadata** — one button asks the model configured in DSH to produce a Chinese display name, notes, tags and category. Batch mode streams progress.
- **Crash AI analysis** — send the latest crash report and log tail to the configured DSH model and get likely causes, actions and evidence.
- **Plugin sets** — group bundles, then enable or disable the whole group in one click. Disabling never uninstalls anything.
- **Session browser** — decode multi-frame DSH zstd logs, inspect timeline and usage, export JSONL, move to the recycle bin.
- **Skill library** — list user and built-in Office skills, edit Markdown with live preview, create, duplicate and delete.
- **Crash-first diagnostics** — structured logs, redaction, crash reports, unclean-exit detection, renderer/main process hooks, and a diagnostics view.
- **Portable release + installer** — an Electron folder build with a packaged self-test result, plus a single-EXE Inno Setup installer with a custom install directory and safe uninstall behavior.

## Run

Build or download a release folder, then double-click `DSH-Hub.exe`. DSH Hub reads `%USERPROFILE%\.dsh` by default; change the DSH Home in **Settings** if needed.

Requirements: Windows 10/11 and a working DeepSeek Harness installation/profile. AI naming uses the API key already configured in DSH (`DEEPSEEK_API_KEY` in `.credentials.yaml` or the environment).

## Develop

```bash
npm install
npm start
npm test
npm run package:win
```

Node.js 22.15+ is required. `npm install` runs a postinstall check that
downloads/validates Electron (retrying via the npmmirror mirror if the official
download fails); the expected binary is `node_modules/electron/dist/electron.exe`. If your network or environment blocks
the download, point `ELECTRON_BIN` at any unpacked Electron directory (or its
executable) and `npm start` will use it:

```powershell
$env:ELECTRON_BIN = "D:\electron-v44.7.0-win32-x64"
npm start
```

For packaging, point `ELECTRON_DIST` at the same kind of directory. The main
process is ESM, the preload is CommonJS, and the renderer uses native ES modules
with no UI framework or runtime dependency.

## Safety

- Every `package.json`, metadata file and skill save is backed up first.
- Core bundles (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`) are protected.
- Renderer runs sandboxed with context isolation; credentials never cross the bridge.
- Bundle changes need a DSH restart or HMR reload to take full effect.

## Architecture

```
src/main/          Electron main process + services
src/main/services/ plugin, session, skill, model, logger, metadata
src/renderer/      vanilla ES module UI + CSS design system
src/shared/        constants and IPC contract
test/              node:test unit/integration tests
docs/              architecture, marketplace, snapshots, extension, data format, release, troubleshooting
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/MARKETPLACE.md](docs/MARKETPLACE.md), [docs/SNAPSHOTS.md](docs/SNAPSHOTS.md), [docs/EXTENDING.md](docs/EXTENDING.md), and [docs/DATA-FORMAT.md](docs/DATA-FORMAT.md).

## License

This project is released into the public domain under the [Unlicense](LICENSE). Third-party components retain their own licenses; Electron/Chromium notices ship with the packaged app. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Not affiliated with DeepSeek.
