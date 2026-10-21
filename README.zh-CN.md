# DSH Hub

DSH Hub 是一个面向 DeepSeek Harness（DSH）的 Windows 桌面控制台，把插件管理、社区插件市场、配置快照、会话浏览、Skill 和诊断集中在本地一个应用中。当前版本：`0.2.1`。

应用本身不修改 DeepSeek Harness。它读取 DSH 的 profile、配置和日志；只有在用户明确操作时，才写入插件资料、套装和 profile 配置。

## 功能

- **插件管理**：查看 profile 的直接依赖，启停 bundle，批量操作，搜索、筛选、收藏、查看包信息和关联的 cordis 配置。
- **插件市场**：读取本地 DSH Plugin Hub 目录，按分类、安装状态和可更新状态筛选，查看插件详情，并通过 DSH CLI 安装、更新、卸载或自定义安装；任务串行执行并显示实时日志。
- **配置快照**：保存 profile 配置文件，查看和恢复快照，恢复前自动创建预快照。快照存放在 DSH Hub 的 data 目录，不写入 DSH profile。
- **DSH 运行环境**：从 `app.asar` 读取已安装的 DSH 版本，支持打开 DSH、发送 `Ctrl+R` 刷新 DSH 窗口，以及通过已安装的 `dsh-app-controls` 路由重启 DSH。
- **AI 辅助资料**：使用 DSH 已配置的模型生成中文名、备注、标签和分类；支持单个和批量生成，并可回退到本地目录资料。
- **崩溃诊断**：轮转的脱敏日志、崩溃报告、异常退出检测、日志查看器、诊断信息导出，以及可选的模型辅助崩溃分析。
- **会话与 Skill**：解析多帧 zstd 会话日志，预览时间线，导出 JSONL，将会话移入系统回收站；创建、编辑、复制和删除用户 Skill。
- **构建产物**：便携版 Electron 目录和 Inno Setup 单文件安装包。安装包支持自定义安装目录，卸载时不会删除用户数据。

## 环境要求

- Windows 10/11 x64
- 已安装 DeepSeek Harness，并至少有一个 profile
- Node.js 22.15+（开发和打包需要）
- Inno Setup 6（构建安装包需要）

## 构建与运行

```powershell
npm install
npm start
npm test
npm run package:zip
```

构建输出位于 `release/`。构建安装包：

```powershell
$env:DSH_HUB_APP_DIR = "release\DSH-Hub-0.2.1-win-x64"
npm run installer:win
```

`npm install` 会检查 Electron 二进制；官方下载失败时会自动改用 npmmirror 镜像重试。如果本机已有 Electron，可以把 `ELECTRON_BIN` 指向未打包的 Electron 目录或可执行文件。

## 数据与安全

- 渲染进程启用 context isolation 和 sandbox，文件系统访问只发生在主进程。
- API Key 在请求时从 DSH 凭据存储或环境变量读取，不进入渲染进程。
- profile 的 `package.json` 写入使用文件锁、备份和原子替换。
- 核心 bundle 受保护，不能被移除。
- 会话和 Skill 删除进入系统回收站。
- 模型服务商、服务条款和费用由用户自行选择与承担。

## 文档

- [架构](docs/ARCHITECTURE.md)
- [插件市场](docs/MARKETPLACE.md)
- [配置快照](docs/SNAPSHOTS.md)
- [数据格式](docs/DATA-FORMAT.md)
- [扩展开发](docs/EXTENDING.md)
- [发布流程](docs/RELEASE.md)
- [故障排查](docs/TROUBLESHOOTING.md)

## 许可证

DSH Hub 使用 [Unlicense](LICENSE) 释放到公共领域。第三方组件和参考项目保留各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

DSH Hub 是独立项目，与 DeepSeek 官方无隶属关系，也未获得其背书。

## 开源项目与致谢

DSH Hub 使用或参考了以下开源项目。参考项目没有随本仓库分发源码，其许可证和署名要求仅适用于各自项目。

### 运行时与构建依赖

- **Electron** — MIT License — https://github.com/electron/electron
- **Chromium** — BSD-style 及其他许可证 — https://www.chromium.org/
- **Node.js** — MIT License — https://github.com/nodejs/node
- **Inno Setup** — Inno Setup License — https://jrsoftware.org/isinfo.php

### 参考项目

- **DSH Plugin Hub（`dsh-plugin-hub`）** — MIT License — 插件目录结构、浏览和安装流程参考。https://github.com/dshplugin/dsh-plugin-hub
- **dsh-undo-savepoint** — MIT License — 快照、恢复前备份和回滚安全参考。https://github.com/lire1131/dsh-undo-savepoint
- **dsh-recovery** — 离线快照、回滚和安全模式设计参考。https://github.com/AndyZHENG0715/dsh-recovery
- **dsh-app-controls** — 重启和刷新行为参考；DSH Hub 中的实现为独立实现，源码由用户提供。

感谢上述项目的维护者和贡献者，也感谢 DeepSeek Harness 社区对插件和 profile 模型的文档与讨论。

## AI 生成声明

本项目及本介绍由 **DeepSeek V4.1Flash** 完成。

本仓库由 AI 生成，可能存在错误、未完成的行为、安全弱点或过时的假设。使用前请自行审查源码，并在隔离环境中构建和测试程序是否正常。软件按“现状”提供，不附带任何明示或暗示的担保；使用风险由使用者自行承担。
