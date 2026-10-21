# DSH Hub

DSH Hub is a Windows desktop console for DeepSeek Harness (DSH). It collects plugin management, the community marketplace, configuration snapshots, session browsing, skills and diagnostics into one local application. Version: `0.2.1`.

The application does not modify DeepSeek Harness itself. It reads DSH profiles, configuration and logs, and writes plugin metadata, sets and profile configuration only through explicit user actions.

## Features

- **Plugin management** — inspect direct profile dependencies, enable or disable bundles, batch operations, search, filters, favorites, package details and linked cordis configuration.
- **Plugin marketplace** — browse the local DSH Plugin Hub catalog, search and filter by category, installation state and update status, inspect plugin details, and install, update, uninstall or run a custom install through the DSH CLI. Operations run serially and show live logs.
- **Configuration snapshots** — capture profile configuration files, list and restore snapshots, and create a pre-restore snapshot automatically. Snapshots are stored in DSH Hub's data directory, not in the DSH profile.
- **DSH runtime panel** — read the installed DSH version from `app.asar`, open DSH, reload the DSH window with `Ctrl+R`, and restart DSH through the installed `dsh-app-controls` route.
- **AI-assisted metadata** — generate Chinese display names, notes, tags and categories with the model configured in DSH. Supports single and batch generation with local catalog fallback.
- **Crash diagnostics** — rotating redacted logs, crash reports, unclean-exit detection, log viewer, diagnostics export and optional model-assisted crash analysis.
- **Sessions and skills** — decode multi-frame zstd session logs, preview timelines, export JSONL, move sessions to the recycle bin, and create, edit, duplicate or delete user skills.
- **Packaging** — portable Electron folder build and a single-EXE Inno Setup installer. The installer supports a custom install directory and avoids deleting user data on uninstall.

## Download

- [DSH-Hub-0.2.1-Setup.exe](https://github.com/dingdong2333333-lab/dsh-hub/releases/latest/download/DSH-Hub-0.2.1-Setup.exe) — single-file Windows installer
- [DSH-Hub-0.2.1-win-x64.zip](https://github.com/dingdong2333333-lab/dsh-hub/releases/latest/download/DSH-Hub-0.2.1-win-x64.zip) — portable folder build
- [SHA256SUMS.txt](https://github.com/dingdong2333333-lab/dsh-hub/releases/latest/download/SHA256SUMS.txt) — release checksums

Release binaries are built from this repository. Their `data/self-test.json` has been redacted: local paths are replaced with `<data-dir>`, `<DSH_HOME>` and `<DSH_INSTALL>`, and no real API key or credentials file is included.

## Requirements

- Windows 10 or 11, x64
- A DeepSeek Harness installation with at least one profile
- Node.js 22.15+ for development and packaging
- Inno Setup 6 for building the installer

## Build and run

```powershell
npm install
npm start
npm test
npm run package:zip
```

The build output is written to `release/`. To build the installer:

```powershell
$env:DSH_HUB_APP_DIR = "release\DSH-Hub-0.2.1-win-x64"
npm run installer:win
```

`npm install` verifies the Electron binary and retries through the npmmirror mirror if the official download fails. If Electron is already available elsewhere, set `ELECTRON_BIN` to an unpacked Electron directory or executable.

## Data and security

- The renderer runs with context isolation and sandboxing; filesystem access remains in the main process.
- API keys are read from DSH's credential store or environment at request time and are never exposed to the renderer.
- Profile `package.json` writes use a lock, a backup and an atomic replacement.
- Core bundles are protected from removal.
- Session and skill deletions use the system recycle bin.
- The model provider, its terms and its charges are controlled by the user.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Marketplace](docs/MARKETPLACE.md)
- [Configuration snapshots](docs/SNAPSHOTS.md)
- [Data formats](docs/DATA-FORMAT.md)
- [Extending DSH Hub](docs/EXTENDING.md)
- [Release process](docs/RELEASE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## License

DSH Hub is released into the public domain under the [Unlicense](LICENSE). Third-party components and reference projects remain under their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

DSH Hub is an independent project and is not affiliated with or endorsed by DeepSeek.

## Open-source references and acknowledgements

DSH Hub is built on and informed by the following open-source projects. No source code from the reference projects is bundled; their licenses and attribution requirements remain applicable to their own distributions.

### Runtime and build dependencies

- **Electron** — MIT License — https://github.com/electron/electron
- **Chromium** — BSD-style and other licenses — https://www.chromium.org/
- **Node.js** — MIT License — https://github.com/nodejs/node
- **Inno Setup** — Inno Setup License — https://jrsoftware.org/isinfo.php

### Reference projects

- **DSH Plugin Hub (`dsh-plugin-hub`)** — MIT License — marketplace catalog structure, browsing and install-flow reference. https://github.com/dshplugin/dsh-plugin-hub
- **dsh-undo-savepoint** — MIT License — snapshot, pre-restore and rollback safety reference. https://github.com/lire1131/dsh-undo-savepoint
- **dsh-recovery** — offline snapshot, rollback and safe-mode design reference. https://github.com/AndyZHENG0715/dsh-recovery
- **dsh-app-controls** — restart and reload behavior reference; the DSH Hub implementation is independent. Source supplied by the user.

Thanks to the maintainers and contributors of these projects, and to the DeepSeek Harness community for documenting the plugin and profile model.

## AI-generated project notice

This project and this introduction were produced by **DeepSeek V4.1Flash**.

The repository is AI-generated. It may contain errors, incomplete behavior, security weaknesses or outdated assumptions. Review the source, build and test the application in an isolated environment before using it. The software is provided “as is”, without warranty of any kind; use it at your own risk.
