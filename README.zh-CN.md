# DSH Hub · DSH 中枢

**一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的本地桌面控制台。**
用完整的 GUI 管理 DSH 的插件、插件市场、配置快照、会话与 Skill，并给插件补上中文名称、中文备注和可一键切换的套装组合。

> Windows 便携版：解压后双击 `DSH-Hub.exe`。所有状态都保存在应用目录的 `data/` 里，不上传任何内容。

## 为什么做它

DSH 的能力很强，但插件、profile、bundle、会话日志、Skill 分散在多个目录里。日常最常做的几件事——看看某个插件到底启没启用、给英文插件补一个中文名字、把常用的几个插件一起开关、翻一翻之前的会话——往往要开好几个窗口或手改配置。

DSH Hub 把这些操作收进一个界面，并且坚持三个原则：

1. **只改该改的**：插件启停写入 profile 的 `package.json`，中文名与备注写入 `.dsh-hub/plugin-meta.json`，绝不改插件源码。
2. **写入前先备份**：每次改 `package.json`、插件资料或 Skill 都会自动留旧版本。
3. **崩溃也能查**：主进程、渲染进程和异常退出都会留下诊断日志与崩溃报告。

## 功能

### 插件

- 读取当前 profile 的全部直接依赖（bundle），显示版本、来源、客户端/宿主类型、启用状态。
- 单个开关启停；批量选择后一次性启停。
- 显示 DSH 社区中文缓存中的功能点、描述和验证状态。
- 详情抽屉展示 README、关联 `cordis.yml` 配置行、依赖路径和包信息。
- 收藏常用插件，按状态/关键词/更新时间筛选。

### 插件市场

- 读取当前 profile 的 DSH Plugin Hub 中文目录缓存（约 4,800 条），不依赖外部服务即可浏览。
- 搜索名称/作者/描述/标签，按 11 个分类、安装状态、可更新状态筛选，支持最热/最新/收录/名称排序。
- 卡片显示已安装版本、可更新状态、Stars、验证状态；详情抽屉展示仓库、安装命令、能力与标签。
- 安装/更新/卸载通过 DSH 自带 CLI 执行，不直接操作 `node_modules`；任务串行，日志实时显示。
- 支持 npm 包、GitHub 仓库或本地目录的自定义安装。
- 每次操作前自动创建配置快照；安装后自动尝试把声明了 `dsh.bundle` 的依赖加入当前 profile。

### 配置快照

- 保存 `package.json`、`cordis.yml`、`cordis.patch.yml`、`pnpm-lock.yaml` 和 `.dsh-hub` 的插件资料/套装。
- 插件启停、批量 AI、套装应用、市场安装/卸载前自动快照；自动快照最多保留 20 份。
- 恢复前自动保存“恢复前快照”，目标文件先备份；恢复后提示重启 DSH。
- 快照存于 DSH Hub 的 `data/snapshots/<profile>`，不写 profile 的 `.dsh-hub`；删除走系统回收站。
- 不保存 credentials、会话日志、`node_modules` 或插件代码树。

### DSH 运行环境

- 从 `resources/app.asar/package.json` 读取 DSH 版本（不启动 DSH）。
- 首页展示 DSH 版本、安装目录、当前 profile 和 Electron 版本。
- 支持打开 DSH、刷新 DSH（Ctrl+R，只刷新 DSH 页面），以及优先经 `dsh-app-controls` 路由重启 DSH；重启前会明确提示会中断任务。

### AI 中文资料

- 插件卡片上的 **AI 起名 / 重写**，或详情里的 **用 AI 起名**，会调用 DSH 当前配置的模型。
- 一次生成中文名、2–4 句中文备注、标签和分类，直接写入插件资料。
- 支持批量完善所有缺少中文名的插件，实时显示进度。
- 模型不可用时可以回退到本地社区缓存（可关闭），不会把界面卡死。
- API Key 始终从 DSH 的凭据文件或环境变量读取，不进入渲染进程、不写入设置文件。

### 套装

- 把多个可启停插件组合成一套，自定义名称、说明和颜色。
- 一键启用 / 一键关闭；显示全部启用、部分启用、全部关闭三种状态。
- 关闭套装不会卸载插件，只会从当前 profile 的 `dsh.profile.bundles` 中移除。
- 插件页批量选择后可以直接创建套装。

### 会话

- 解压并读取 DSH 的 `session.v4.jsonl.zstd`（支持多帧 zstd）。
- 展示标题、工作区、来源、Agent 预设、创建时间、大小、token 用量。
- 预览对话时间线、助手模型和工具调用。
- 导出为普通 `.jsonl`；删除时移动到系统回收站，可恢复。

### Skill

- 扫描 `~/.dsh/skills` 和 DSH 内置 Office Skill（内置只读）。
- 新建、编辑、预览、复制、删除；删除同样进回收站。
- 编辑器支持原始 Markdown 与渲染预览，保存前校验 frontmatter。
- 未保存关闭时二次确认。

### 诊断

- 启动时检测上次是否异常退出，并生成崩溃报告。
- 捕获主进程未处理异常、Promise 拒绝、渲染进程崩溃、子进程崩溃和前端 JS 错误。
- 日志自动轮转、自动脱敏（API Key、Authorization、token 等）。
- 诊断页可以查看日志尾部、崩溃 JSON、复制诊断信息、打开日志目录、清空日志。
- 首页/诊断页的“AI 分析崩溃”会把最近崩溃报告和日志尾部交给已配置模型，输出严重度、可能原因、建议动作和证据；不发送 API Key 或完整会话。

## 快速开始

### 直接运行

1. 解压 `DSH-Hub-0.2.1-win-x64.zip`（或打开构建目录）。
2. 双击 `DSH-Hub.exe`。
3. 首次启动会自动读取 `%USERPROFILE%\.dsh`。如果 DSH Home 在别处，在 **设置 → DSH 连接** 里修改。
4. 选择要管理的 profile（通常是 `desktop`）。
5. 如果模型卡片显示未配置，请先在 DSH 里配置 `DEEPSEEK_API_KEY`，或设置同名环境变量。

> AI 起名会消耗少量 DeepSeek token。生成结果会直接保存，可在插件详情中继续修改。

### 从源码运行

要求 Node.js 22+、Windows 10/11。

```bash
npm install
npm start
```

`npm install` 会安装 Electron 并触发本仓库的 `postinstall` 检查；官方下载失败时会自动用 `npmmirror` 镜像重试一次。正常情况下应存在：

```text
node_modules\electron\dist\electron.exe
```

可以在 PowerShell 里确认：

```powershell
Test-Path node_modules\electron\dist\electron.exe
```

如果网络受限导致 Electron 二进制没有下载下来，**不需要改代码**，把 `ELECTRON_BIN` 指向任意未打包的 Electron 目录（或该目录里的 `electron.exe`）即可：

```powershell
$env:ELECTRON_BIN = "D:\somewhere\electron-v44.7.0-win32-x64"
npm start
```

如果只想打包、不启动开发窗口，则把 `ELECTRON_DIST` 指向同一类目录：

```powershell
$env:ELECTRON_DIST = "D:\somewhere\electron-v44.7.0-win32-x64"
npm run package:win
```

从 DSH 的受限终端启动时，脚本检测到 `ELECTRON_RUN_AS_NODE=1` 会自动给开发实例加 `--no-sandbox`（仅开发模式；正常终端不会）。也可以显式传入：

```powershell
$env:DSH_HUB_ELECTRON_ARGS = "--no-sandbox"
npm start
```

其他开发命令：

```bash
npm test
npm run self-test
npm run doctor
```

### 打包

```bash
# 使用 node_modules/electron/dist 的 Electron
npm run package:win

# 使用自定义 Electron 二进制目录，并生成 zip
ELECTRON_DIST=/path/to/electron/dist DSH_HUB_RELEASE_DIR=E:/DSH-APP/release npm run package:zip
```

产物是一个“主 EXE + 依赖文件夹”的便携目录：

```
DSH-Hub-0.2.1-win-x64/
├─ DSH-Hub.exe             ← 双击启动（带图标与版本信息的轻量启动器）
├─ DSH-Hub-Runtime.exe     ← Electron 运行时
├─ *.dll / *.pak / locales/ ...
├─ resources/app/          ← 应用源码、图标与文档
├─ data/
│  ├─ self-test.json       ← 打包时自检结果（ok:true 可核对）
│  ├─ logs/                ← 首次运行后的日志
│  └─ crashes/             ← 首次崩溃后的报告
└─ 启动说明.txt
```

启动器只负责转发参数并启动运行时；如果构建环境里没有 `csc.exe`，脚本会自动退化为直接使用 Electron 运行时作为主 EXE。

## 数据与安全

| 内容 | 位置 |
| --- | --- |
| 应用设置 | `<app>/data/settings.json` |
| 运行日志 | `<app>/data/logs/app.log` |
| 崩溃报告 | `<app>/data/crashes/crash-*.json` |
| 插件中文资料 | `<DSH Home>/profiles/<profile>/.dsh-hub/plugin-meta.json` |
| 套装 | `<DSH Home>/profiles/<profile>/.dsh-hub/sets.json` |
| 写入备份 | `<profile>/.dsh-hub/backups/` |
| Skill 备份 | `<app>/data/backups/skills/` |

安全设计：

- 渲染进程开启 `contextIsolation`、`sandbox`，关闭 `nodeIntegration`。
- 所有文件与 shell 操作只在 main 进程，经显式 IPC 暴露。
- 打开外部路径有白名单；外链只允许 HTTP(S)。
- `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app` 是受保护 bundle，不能被本应用移除。
- 日志会脱敏；API Key 不会发往前端。

**重要**：修改 bundle 后，DSH 需要重启或等待 HMR 热重载才会完全生效。应用会在结果提示里明确说明。

## 常见问题

**找不到 profile。**
确认 `%USERPROFILE%\.dsh\profiles\<name>\package.json` 存在，并在设置里指定正确的 DSH Home。

**模型测试 401。**
DSH 的 `.credentials.yaml` 中需要 `DEEPSEEK_API_KEY`，或者设置同名环境变量。修改后点“测试连接”。

**AI 生成返回“模型不可用”。**
检查网络、Base URL、模型 ID 和额度；也可以使用“用本地社区资料”，或打开设置里的回退开关。

**改了插件状态但 DSH 没变化。**
重启 DeepSeek Harness，或在 DSH 中触发热重载。套装开关只改变 `dsh.profile.bundles`，不会卸载依赖。

**应用崩溃了。**
打开 `诊断 → 崩溃报告`，复制诊断信息；日志在 `data/logs`。如果是启动崩溃，可以直接把 `data` 目录发给开发者。

更多见 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。

## 仓库结构

```
src/main/           Electron 主进程、IPC、服务层
src/main/services/  插件 / 会话 / Skill / 模型 / 日志 / 备份
src/renderer/       无框架前端（原生 ES Modules + CSS）
src/shared/         共享常量与 IPC 契约
test/               Node 原生测试
docs/               架构、插件市场、快照、扩展、数据格式、发布、排障
scripts/            开发启动、自检、打包、图标生成
assets/             品牌图标
```

扩展新功能不需要改整体架构：在 `src/main/services` 增加服务，在 `src/main/ipc.js` 注册一条命令，在 preload 暴露方法，在 `src/renderer/js/views` 加页面。详细步骤见 [docs/EXTENDING.md](docs/EXTENDING.md)。

## 测试

```bash
npm test
```

44 个测试覆盖插件清单/启停/保护/备份、套装、元数据、会话 zstd 解压与导出、Skill CRUD、模型请求与回退、日志脱敏与崩溃报告、设置校验。

便携包在构建收尾时会自动运行 `DSH-Hub.exe --self-test`，通过后把结果保留为 `data/self-test.json`（含 `"ok": true`、`isPackaged`、Electron 版本、profile/插件/会话/Skill 计数）。构建机没有 DSH 数据时可以设置 `DSH_HUB_SKIP_SELF_TEST=1` 跳过，但那样发布包不会附带自检证据。

## 已知边界

- 会话摘要只解析前 1.5 MB，完整预览上限 50 MB；这是为了避免大日志拖慢界面。
- 只管理 profile 的直接依赖；传递依赖不展示。
- 只有声明 `dsh.bundle` 的包才可以单独启停。
- 内置 Office Skill 只读；复制到“我的 Skill”后可编辑。
- 目前是 Windows 优先的便携构建；核心服务本身没有平台绑定，macOS/Linux 需要自行替换 Electron 发行包。

## License

本项目使用 [Unlicense](LICENSE) 释放到公共领域。第三方组件保留各自许可证；Electron/Chromium 的许可证随打包目录一并分发，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。DeepSeek Harness 是 DeepSeek 的产品；本项目与 DeepSeek 官方无隶属关系。
