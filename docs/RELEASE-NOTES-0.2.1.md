# DSH Hub 0.2.1

修复 DSH 控制按钮，并保留 0.2.0 的插件市场、配置快照、DSH 版本展示和崩溃 AI 分析。

## 修复

- **刷新 DSH**：不再调用 DSH Hub 自己的 `window.reload()`。现在会定位 DSH 桌面窗口并发送 `Ctrl+R`，只刷新 DSH 页面。
- **重启 DSH**：优先探测 DSH Host 的本地端口并调用已安装的 `dsh-app-controls` `/restart` 路由；该路由不可用时才回退到独立的 PowerShell worker。
- 新增 `app:reload-dsh` IPC 与 `api.app.reloadDsh()`。
- 版本号更新为 0.2.1。

## 验证

- `npm test`：44 个测试通过。
- 便携版自检：`ok:true`、`version:0.2.1`、`DSH 0.2.1-rc.2`。
- 安装包沙箱验证：自定义目录安装、覆盖升级、卸载均正常；卸载保留 `data` 与用户文件。
- 刷新动作已实际执行并返回 `reloaded <pid>`。
- 重启路由已验证发现本地端口且 `restartable:true`；为避免中断当前 DSH 会话，未在验证中实际触发 POST `/restart`。
- Release 中的安装包和便携版已做脱敏处理：`data/self-test.json` 用 `<data-dir>`、`<DSH_HOME>`、`<DSH_INSTALL>` 替换本机路径，`keyMasked` 为 `***`，不包含真实 API Key 或 credentials 文件。

## 安装

- 下载 `DSH-Hub-0.2.1-Setup.exe`，双击安装。
- 或下载 `DSH-Hub-0.2.1-win-x64.zip`，解压后运行 `DSH-Hub.exe`。

## 校验

- Setup SHA-256：`3007a5ef8851f1baceb542a689eb33c76cc114715ea221ad26cb109b9e5925c8`
- 便携版 zip SHA-256：`3fba95a0e7ee6c8ae0a4679923fc04057d4534d7a70f4e66f1bc26463fb9460f`

## 说明

- 开源许可证：Unlicense（公共领域）；第三方组件和参考项目保留各自许可证，见仓库 `THIRD_PARTY_NOTICES.md`。
- 本项目及本介绍由 DeepSeek V4.1Flash 完成。仓库由 AI 生成，使用前请自行检查程序是否正常。
