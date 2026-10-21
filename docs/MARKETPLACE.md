# 插件市场

DSH Hub 0.2.0 增加了一个独立的插件市场页，功能对齐本机安装的
`dsh-plugin@2.0.4`（DSH Plugin Hub）的核心使用流程：

- 读取 `profiles/<name>/cache/catalog-plugins-zh.json` 的本地中文目录
- 全文搜索（名称、作者、描述、标签、能力、仓库）
- 分类筛选、安装状态筛选、最热/最近更新/最近收录/名称排序
- 已安装/可更新状态和版本对比
- 一键安装、更新、卸载
- 自定义 npm/GitHub/本地目录安装
- 安装日志实时显示、任务历史
- 操作前自动创建配置快照

## 数据来源

- 目录：DSH Plugin Hub 在 profile 内的本地缓存（约 4,800 条）
- 已安装 inventory：本机 `pluginService`
- 安装/更新/卸载：调用 DSH 自带 CLI，不直接改 `node_modules`

## 安装实现

DSH Hub 使用 DSH 安装目录中的 Electron 可执行文件，以
`ELECTRON_RUN_AS_NODE=1` 运行：

```
<DSH install>/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js
```

命令等价于：

```
dsh plugin --profile <profile> add <spec>
dsh plugin --profile <profile> update <package>
dsh plugin --profile <profile> remove <package>
```

安装成功后，如果新依赖声明了 `dsh.bundle`，会把它加入当前 profile 的
`dsh.profile.bundles`；没有 bundle 的客户端插件不会被错误加入。

## 安全边界

- 安装第三方插件会执行其安装脚本；必须由用户确认。
- 自定义安装地址不允许以 `-` 开头，不允许控制字符，避免参数注入。
- 任务串行执行，避免两个 pnpm 进程同时修改 profile。
- 每个操作前自动创建配置快照。
- 失败时保留日志并刷新 inventory，不自动回滚；用户可从快照页恢复。
- 安装/卸载后 DSH 可能需要重启或刷新页面。
- 市场页只管理当前 profile；不会修改其他 profile。

## 与 DSH Plugin Hub 的差异

- 目录来自缓存，没有实现官网实时刷新和通知中心。
- 没有实现“失败一键提交 GitHub Issue”。
- 没有实现 NPM 镜像、代理、日志目录等 Hub 设置页。
- 安装任务历史保存在内存中，重启 DSH Hub 后清空。

这些是后续可扩展项，不影响浏览、安装、更新、卸载和自定义安装。
