# Contributing

Thanks for taking a look. This project is deliberately small and dependency-free
at runtime.

## Development loop

```bash
npm install
npm start       # Electron
npm test        # node:test
```

There is no bundler or watcher. Renderer changes need a reload (`Ctrl+R` in the
window); main-process/preload changes need a full restart.

## Code style

- ES modules in `src/main` and `src/renderer`; CommonJS only for the preload.
- Two-space indentation, single quotes, semicolons, trailing commas in
  multiline literals.
- No UI framework and no runtime npm dependency without discussion.
- Use the design tokens in `src/renderer/styles/tokens.css`.
- Escape every dynamic HTML interpolation with `escapeHtml`, or build DOM nodes
  with `textContent`.
- Write JSDoc for exported services and non-obvious invariants.

## Pull requests

1. Keep the change focused; separate refactors from features.
2. Add/update tests for service behavior.
3. Update docs if data formats, IPC, or setup change.
4. Add a CHANGELOG entry for user-visible changes.
5. Do not commit `node_modules`, `release`, `.data`, logs, crash reports, or
   personal DSH paths/data.

## Reporting issues

Include:

- DSH Hub version and Windows version
- the diagnostics JSON from **诊断 → 复制诊断** (it masks keys)
- exact reproduction steps
- expected vs. actual behavior
- relevant crash report (redact any personal paths if needed)

For security issues, do not open a public issue; see `SECURITY.md`.
