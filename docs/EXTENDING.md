# Extending DSH Hub

The codebase is intentionally split so a new feature touches one service, one
IPC method, one preload method and one view. No bundler or framework is needed.

## 1. Add a main-process service

Create `src/main/services/my-service.js`:

```js
import { AppError } from '../utils/errors.js';

export class MyService {
  constructor({ profileService, logger }) {
    this.profileService = profileService;
    this.logger = logger.child('my-feature');
  }

  async list(profileName) {
    const profile = this.profileService.getProfile(profileName);
    // read files, call APIs, return plain serializable data
    return { profile: profile.name, items: [] };
  }
}
```

Rules:

- Return plain JSON-serializable data; no Electron objects or streams.
- Validate all inputs; throw `AppError` with a stable code and Chinese message.
- Use `withFileLock`, `backupFileSync`, `writeTextAtomic` for writes.
- Log operations through `logger`; never log secrets.

Register it in `createServices()` in `src/main/main.js` and pass it to `registerIpc`.

## 2. Add IPC

1. Add channel constants in `src/shared/constants.js`.
2. Add a handler in `src/main/ipc.js`:

```js
handle(IPC.MY_LIST, async (payload) => myService.list(activeProfile(payload.profile)));
```

3. Add the corresponding channel string and method in
   `src/main/preload.cjs`:

```js
const IPC = { /* ... */ MY_LIST: 'my:list' };
// ...
my: {
  list: (profile) => invoke(IPC.MY_LIST, { profile }),
},
```

4. Add a wrapper in `src/renderer/js/api.js` if you want a typed-looking API.
   `api` is the raw bridge; most views call it directly.

The preload cannot import `constants.js` (it is CommonJS + sandboxed), so keep
the channel strings in sync. A test could read both files and compare if this
becomes error-prone.

## 3. Add a view

Create `src/renderer/js/views/my-view.js`:

```js
import { pageHeader, icon, toast } from '../ui.js';

export async function render(main, ctx) {
  const data = await api.my.list(ctx.activeProfile);
  main.innerHTML = `<div class="page">
    ${pageHeader({ kicker: 'MY FEATURE', title: '我的功能', subtitle: '说明文字' })}
    <div class="panel">...</div>
  </div>`;
  // bind events; use ctx.navigate, ctx.toast, ctx.activeProfile
  return () => { /* optional cleanup */ };
}
```

Add it to `src/renderer/js/router.js` (`ROUTES`) and
`src/renderer/js/app.js` (`views`). Add a nav item in `renderShell()`.
Use CSS variables from `styles/tokens.css`; do not hard-code new colors.

## 4. Add an AI-powered field

Model calls belong in `ModelService`; prompts and validation live next to it.
If you add a new output field:

1. Update `SYSTEM_PROMPT` and `parseAndSanitizeResult`.
2. Update `MetadataStore.sanitizePluginMeta` (it drops unknown fields).
3. Add a UI control in `views/plugins.js` and include it in `collect()`.
4. Add a test in `test/model.test.js`.

## 5. Add tests

Use `node:test` and the fixture helpers in `test/helpers/fixture.js`:

```js
import test from 'node:test';
import { createFixtureHome, createServices } from './helpers/fixture.js';

test('my feature', async (t) => {
  const home = createFixtureHome({ plugins: [{ name: 'demo' }] });
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const services = createServices(home);
  // ...
});
```

Run `npm test`. Keep tests independent of the real `~/.dsh` and the network.

## Style guide

- **No new runtime dependencies** unless there is a compelling reason. The
  renderer is framework-free for a small, auditable bundle.
- Use `escapeHtml` for every dynamic string inserted into an HTML template.
- Prefer `textContent`/DOM creation for user-authored text when in doubt.
- Keep destructive actions behind `confirmDialog` and make them recoverable
  (recycle bin, backups).
- Update `docs/DATA-FORMAT.md` if you add a file or change a schema.
- Add a changelog entry for user-visible changes.
