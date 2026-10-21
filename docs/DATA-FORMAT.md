# Data format

Everything is local, human-readable JSON or Markdown. No database.

## App data (`<app>/data`)

### `settings.json`

```json
{
  "version": 1,
  "dshHome": "",
  "dshInstallDir": "",
  "activeProfile": "desktop",
  "model": {
    "baseUrl": "",
    "model": "",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "timeoutMs": 60000,
    "fallbackToCatalog": true
  },
  "ui": { "theme": "dark", "compact": false, "reduceMotion": false },
  "safety": { "confirmMutations": true, "backupRetention": 30 }
}
```

Empty `dshHome` / `dshInstallDir` means auto-detect. Empty `model.baseUrl` /
`model.model` means derive from the DSH profile and defaults
(`https://api.deepseek.com/anthropic`, `deepseek-flash`).

### `logs/app.log`

One line per entry:

```
2026-10-21T02:11:06.690Z [INFO] [plugins] Plugin selection updated {"profile":"desktop","action":"disable","plugins":["demo-whale"]}
```

Rotation: when `app.log` exceeds 5 MB, it becomes `app.1.log` … `app.5.log`.
Secrets are redacted at write time.

### `crashes/crash-<timestamp>-<random>.json`

```json
{
  "id": "2026-10-21T02-11-06-000Z-ab12cd",
  "type": "unclean-shutdown",
  "title": "上次运行没有正常退出",
  "at": "2026-10-21T02:11:06.000Z",
  "process": { "pid": 1234, "platform": "win32", "versions": { "...": "..." } },
  "error": { "name": "Error", "message": "...", "stack": "..." },
  "extra": {},
  "logTail": "... last 250 lines ..."
}
```

### `.running.json` / `.last-exit.json`

Runtime markers. `.running.json` exists while the app is alive; if the next
start finds it (and the recorded PID is dead), an unclean-shutdown report is
created. `.last-exit.json` records the last clean exit.

### `backups/skills/`

Timestamped copies of edited `SKILL.md` files. The number retained is
controlled by `safety.backupRetention`.

## Profile data (`<DSH Home>/profiles/<name>/.dsh-hub`)

### `plugin-meta.json`

```json
{
  "version": 1,
  "updatedAt": "2026-10-21T02:11:06.690Z",
  "plugins": {
    "dsh-whale-widget": {
      "displayName": "余额小鲸鱼",
      "notes": "常驻界面右下角的余额浮窗……",
      "tags": ["余额显示", "桌面挂件"],
      "favorite": true,
      "ai": {
        "source": "model",
        "model": "deepseek-flash",
        "generatedAt": "2026-10-21T02:11:06.686Z",
        "category": "界面",
        "confidence": 0.88
      },
      "updatedAt": "2026-10-21T02:11:06.690Z"
    }
  }
}
```

`displayName`, `notes`, `tags` and `favorite` are user-controlled. `ai` is
informational. An empty patch removes the field (and the plugin entry when all
fields are gone).

### `sets.json`

```json
{
  "version": 1,
  "updatedAt": "2026-10-21T02:11:06.703Z",
  "sets": [
    {
      "id": "b2487904-a53c-4a40-85c4-702b16864f03",
      "name": "桌面增强",
      "description": "常驻挂件与工具栏",
      "color": "#3ee0c0",
      "icon": "layers",
      "pluginNames": ["dsh-whale-widget", "dsh-orb"],
      "createdAt": "2026-10-21T02:11:06.703Z",
      "updatedAt": "2026-10-21T02:11:06.703Z",
      "lastAppliedAt": "2026-10-21T02:12:00.000Z",
      "lastAction": "enable"
    }
  ]
}
```

`enabledCount`, `state`, and decorated `members` are computed at read time and
never stored.

### `backups/package-<timestamp>.json`

Full copies of `package.json` before every bundle mutation. Retention follows
`safety.backupRetention`. Restoring means copying one back over `package.json`
while DSH is closed.

### `manifest.lock`, `metadata.lock`

Short-lived cross-process locks. A stale lock older than 20 seconds can be
removed; the services do this automatically.

## DSH data (read by DSH Hub)

| Path | Used for |
| --- | --- |
| `profiles/<name>/package.json` | direct dependencies + `dsh.profile.bundles` |
| `profiles/<name>/node_modules/<pkg>/package.json` | plugin metadata, `dsh.bundle` capability |
| `profiles/<name>/cache/catalog-plugins-zh.json` | community Chinese descriptions/features |
| `sessions/<workspace>/<session>/session.v4.jsonl.zstd` | concatenated zstd frames; each line is an event |
| `skills/<slug>/SKILL.md` | user skills |
| `.credentials.yaml` | `refs.DEEPSEEK_API_KEY` (plaintext refs on supported DSH builds) |

Session header events store fields at the **top level**, not under `data`:

```json
{"type":"session","version":4,"id":"session-…","createdAt":1792544070976,"cwd":"E:\\work","agentPreset":"standard"}
```

All other events use `{ "type": "...", "seq": 1, "time": 123, "data": { ... } }`.
The decoder concatenates all zstd frames and parses one JSON event per line.
