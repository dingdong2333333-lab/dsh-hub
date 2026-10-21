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
- 重启路由已验证发现端口 `13410` 且 `restartable:true`；为避免中断当前 DSH 会话，未在验证中实际触发 POST `/restart`。

## 安装

- 下载 `DSH-Hub-0.2.1-Setup.exe`，双击安装。
- 或下载 `DSH-Hub-0.2.1-win-x64.zip`，解压后运行 `DSH-Hub.exe`。

## 校验

- Setup SHA-256：`e075e0f38938e057ecb39d9259da0b9af219a1aa89257805a7bacb9b34032153`
- 便携版 zip SHA-256：`0bd492b3f5127c2000b3dfd0f5fceae9f71e30b772dc451ee39d9febb52ed900`
