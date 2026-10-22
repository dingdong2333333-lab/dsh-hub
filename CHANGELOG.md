# Changelog

All notable changes to DSH Hub are documented here.

## [0.2.2] — 2026-10-22

### Added

- System tray support: minimize or close the window to the tray, with open, reload and quit actions. Both behaviors can be disabled in Settings.

### Fixed

- Plugin market search no longer re-renders the search input while a Chinese IME composition is active. The input node is preserved during composition and the query runs after compositionend.
- The set editor no longer moves when the wheel is used in the empty area beside the dialog; only the dialog body scrolls.

## [0.2.1] — 2026-10-21

### Fixed

- Restart DSH now delegates to the installed `dsh-app-controls` loopback route,
  which uses its WMI relaunch worker instead of killing the process tree from
  DSH Hub. The old process-kill path remains as a fallback.
- Refresh DSH now focuses the running DSH desktop window and sends Ctrl+R,
  matching `dsh-app-controls`' "刷新" button. It no longer reloads DSH Hub.
- New `app:reload-dsh` IPC and `api.app.reloadDsh()` preload method.

## [0.2.0] — 2026-10-21

### Added

- **Plugin marketplace**: browse the local DSH Plugin Hub catalog (search, 11
  categories, install-state and update filters, sorting, pagination), preview
  plugin details, and install/update/uninstall through the DSH CLI. Includes
  custom install, live task log, task history and post-install bundle
  activation.
- **Profile snapshots**: manual and automatic snapshots of `package.json`,
  `cordis.yml`, `cordis.patch.yml`, `pnpm-lock.yaml`,
  `.dsh-hub/plugin-meta.json` and `.dsh-hub/sets.json`, with list, reveal,
  recycle-bin delete, and safe restore (pre-restore snapshot + file backups).
- **DSH app controls**: read the installed DSH version from `app.asar`, open
  DSH, reload DSH Hub, and restart DSH through a detached PowerShell worker.
- **Crash AI analysis**: send the latest crash report and log tail to the
  configured DSH model and render likely causes, actions and evidence.
- **Dashboard runtime panel**: DSH version, install directory, profile,
  Electron version, crash history and recovery shortcuts.
- Installer now has a custom install-location page, a writability check, and a
  guard against installing into an existing non-DSH directory. Uninstall no
  longer deletes `{app}\data` or any untracked user files.
- 44 tests, including snapshot restore and marketplace catalog coverage.

## [0.1.0] — 2026-10-21

### Added

- Portable Windows desktop app built with Electron 44.
- Plugin inventory with enable/disable, batch operations, search, filters, favorites, README and package details.
- AI Chinese metadata: display name, notes, tags, category, per-plugin and batch generation, automatic fallback to the local community catalog.
- Custom plugin metadata stored in `<profile>/.dsh-hub/plugin-meta.json`.
- Plugin sets stored in `<profile>/.dsh-hub/sets.json`, with one-click enable/disable.
- Session browser with multi-frame zstd decoding, timeline preview, JSONL export and recycle-bin deletion.
- Skill library with Markdown editor/preview, create/duplicate/delete, read-only built-in Office skills.
- Crash and diagnostics subsystem: rotating redacted logs, crash reports, unclean-run detection, renderer/main process hooks, in-app viewer.
- Atomic config writes, profile locks, automatic `package.json` backups, protected core bundles.
- `.vscode` dev configuration, native test suite, packaging script, icon generator.

### Known limits

- Session summaries parse the first 1.5 MB of a log; full previews are capped at 50 MB.
- Only direct profile dependencies are shown.
- Windows is the packaged target; services are platform-neutral.
