# Third-party notices

DSH Hub is released into the public domain under the Unlicense (see `LICENSE`).
Third-party components remain under their own licenses; the MIT notices below
apply to those components and reference projects, not to DSH Hub's own code.

## Runtime

### Electron / Chromium

The portable release bundles an Electron runtime. Electron and Chromium are
distributed under their respective licenses. The release folder includes:

- `LICENSE` (Electron)
- `LICENSES.chromium.html` (Chromium and other third-party components)

Keep these files when redistributing. Electron version used for the reference
build: **44.7.0** (Chromium 152, Node 24.21).

### Node.js

Electron embeds Node.js, which is distributed under the Node.js license and
third-party licenses included in the Electron distribution.

## Build dependencies

These are not loaded at runtime in the packaged app:

- `electron` — MIT, downloaded at development/build time
- Microsoft .NET Framework `csc.exe` — used to compile the tiny launcher
  executable on Windows (build-time only)

## Services

DSH Hub sends prompts to the model endpoint configured in DeepSeek Harness. It
does not bundle a model, does not proxy traffic, and does not send data to any
DSH Hub-operated server. The user is responsible for the terms, privacy policy,
and charges of their chosen model provider.

## Feature research / inspiration

These projects were reviewed for behavior and safety ideas. DSH Hub does not
copy their source code; the features are independently implemented against
DSH's local files and CLI.

- [dshplugin/dsh-plugin-hub](https://github.com/dshplugin/dsh-plugin-hub) —
  MIT. Catalog browsing, install/update/uninstall and confirmation UX.
- [lire1131/dsh-undo-savepoint](https://github.com/lire1131/dsh-undo-savepoint) —
  MIT. Profile snapshots, pre-restore snapshots and rollback safety.
- [AndyZHENG0715/dsh-recovery](https://github.com/AndyZHENG0715/dsh-recovery) —
  offline CLI snapshot/rollback/safe-mode ideas (evaluated, not bundled).
## DSH

DeepSeek Harness is a product of DeepSeek. DSH Hub is an independent local
front-end for files created by DSH and is not affiliated with or endorsed by
DeepSeek.
