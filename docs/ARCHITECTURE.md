# Architecture

DSH Hub is a three-process Electron application with a deliberately small
boundary between the UI and the filesystem.

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer (sandboxed, no Node)                               │
│   views/*.js  →  window.dshHub (preload bridge)              │
└──────────────────────────┬───────────────────────────────────┘
                           │ contextBridge / ipcRenderer
┌──────────────────────────▼───────────────────────────────────┐
│ Preload (CommonJS, sandboxed)                                │
│   explicit methods, error unwrapping, AI progress events     │
└──────────────────────────┬───────────────────────────────────┘
                           │ ipcMain.handle
┌──────────────────────────▼───────────────────────────────────┐
│ Main process                                                │
│   IPC router → services → filesystem / network / shell       │
│                                                              │
│   ProfileService ── only writer of package.json              │
│   MetadataStore  ── plugin-meta.json + sets.json             │
│   PluginService  ── inventory + bundle toggles               │
│   SetService     ── group apply + state decoration           │
│   SessionService ── zstd decode + summary/detail/export      │
│   SkillService   ── SKILL.md CRUD + frontmatter validation   │
│   ModelService   ── DSH model discovery + Anthropic Messages │
│   Logger         ── logs, redaction, crash reports, run marker│
└──────────────────────────────────────────────────────────────┘
```

## Process model

- `src/main/main.js` owns app lifecycle, window creation, crash hooks and
  single-instance locking.
- `src/main/ipc.js` is the only IPC registration point. Every handler validates
  its payload, checks the sender URL (`file://…/renderer/`), logs failures and
  returns `{ ok, data }` or `{ ok, error }`.
- `src/main/preload.cjs` exposes a frozen, explicitly enumerated API. The
  renderer cannot invoke arbitrary channels.
- `src/renderer/js/app.js` is the shell: bootstrap, navigation, theme, profile
  switching, command palette, global error reporting.
- Views are plain ES modules with `render(root, ctx)`; they own their event
  listeners and may return a cleanup function.

## Invariants

1. **No renderer writes files.** Only main-process services touch the disk.
2. **One writer per file.** `ProfileService.mutateBundles` is the only code path
   that writes a profile `package.json`. `MetadataStore` is the only writer of
   plugin metadata and sets. `SkillService` is the only writer of `SKILL.md`.
3. **Write with a lock, backup and atomic rename.** Profile manifest writes use
   `.dsh-hub/manifest.lock`; metadata uses `metadata.lock`; skills use
   `data/locks/skill-*.lock`. Every write is preceded by a timestamped backup.
4. **Protected bundles stay.** `@deepseek-ai/dsh-base` and
   `@deepseek-ai/dsh-web-app` are re-inserted if a mutation removes them.
5. **Secrets never cross the bridge.** The model key is read from
   `~/.dsh/.credentials.yaml` (or the process environment) inside
   `ModelService`; the UI only receives a masked suffix and a source label.
6. **Failures are diagnosable.** Every IPC failure is logged with a code, and
   uncaught main/renderer failures become crash reports. Logs are synchronous,
   redacted and rotated.

## Data flow: AI naming

1. Renderer calls `plugins.aiGenerate`.
2. IPC resolves the active profile and delegates to `ModelService`.
3. `PluginService.detail` merges package manifest, README excerpt and the
   optional DSH community cache.
4. `ModelService.getConfig` resolves the endpoint/model from settings, the DSH
   profile config, or defaults; it reads the API key from the environment or
   the local credential refs.
5. A non-streaming request is sent to the DSH-compatible Anthropic Messages
   endpoint with `thinking: disabled` and a strict JSON system prompt.
6. The response is parsed, validated (Chinese display name, notes length,
   known category) and persisted to `plugin-meta.json`.
7. The renderer invalidates its plugin cache and re-reads the inventory.

## Data flow: bundle toggle

1. UI asks for a single toggle or a batch selection.
2. `PluginService.setMany` validates that every name is an installed direct
   dependency and declares `dsh.bundle`.
3. `ProfileService.mutateBundles` re-reads the manifest under a lock, applies
   the change, protects core bundles, backs up `package.json`, writes atomically.
4. The result lists applied/skipped plugins and tells the UI that a DSH restart
   or HMR reload is required.

## Failure handling

- `Logger` initializes before `app.whenReady` and writes a `.running.json`
  marker. A missing marker on the next start means an unclean shutdown; a crash
  report with log tail is generated.
- Main process `uncaughtException` writes a report and exits without marking a
  clean run. `unhandledRejection` writes a report but keeps the app alive.
- `render-process-gone` and `child-process-gone` are logged; renderer crashes
  offer reload/quit.
- `window.onerror` / `unhandledrejection` in the renderer are throttled and sent
  over IPC.

## Non-goals

- Installing or uninstalling plugins. DSH Hub manages the state of already
  installed dependencies.
- Running DSH for the user, or proxying DSH itself. It reads and writes the
  same local files.
- A database. Everything is JSON/JSONL on disk, inspectable by other tools.
