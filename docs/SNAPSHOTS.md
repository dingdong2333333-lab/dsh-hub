# 配置快照

DSH Hub 0.2.0 新增了 profile 级配置快照，用于在改插件、改套装或插件市场安装前留一个可回滚点。

## 范围

快照只保存会影响 DSH 启动和插件加载的配置：

- `package.json`
- `cordis.yml`
- `cordis.patch.yml`
- `pnpm-lock.yaml`
- `.dsh-hub/plugin-meta.json`
- `.dsh-hub/sets.json`

不会保存：

- `.credentials.yaml` / API Key
- 会话日志
- `node_modules`
- 用户工作区文件
- 完整插件代码树

## 存储位置

`<DSH Hub dataDir>/snapshots/<profile>/<snapshot-id>/`

开发态通常在 `dsh-hub/.data/snapshots/desktop/`；安装版通常在
`<安装目录>/data/snapshots/desktop/`。每个快照包含 `manifest.json` 和按原相对路径复制的配置文件。

不写入 DSH profile，是为了避免在只读或受限 profile 环境下失败，同时保持恢复目标仍是真实配置。

## 安全行为

- 恢复前自动创建“恢复前快照”，即使恢复失败也保留当前状态。
- 恢复前把目标文件复制到 `<dataDir>/backups/snapshots/`。
- 只恢复 manifest 中列出的白名单文件，拒绝路径穿越。
- 自动快照最多保留 20 份；手动快照不会自动清理。
- 删除快照进入系统回收站。
- 恢复完成后提示重启 DSH。

## 自动快照触发点

- 插件单个/批量启停
- 批量 AI 完善插件资料
- 应用套装
- 插件市场安装/更新/卸载/自定义安装

安装/卸载失败不会自动回滚；失败信息会保留，用户可以在“快照”页手动恢复。

## 开源参考

实现前评估了以下开源项目，DSH Hub 没有直接复制它们的代码，只吸收了安全策略：

- [lire1131/dsh-undo-savepoint](https://github.com/lire1131/dsh-undo-savepoint) — 配置/插件代码快照、撤销/重做、恢复前快照、安全模式。
- [AndyZHENG0715/dsh-recovery](https://github.com/AndyZHENG0715/dsh-recovery) — 零依赖 CLI 的 snapshot/rollback/safemode/boot-probe 分层恢复思路。
- [dsh-session-snapshot](https://deepseekharness.io/zh/plugins/dsh-session-snapshot/) — 会话级快照，和本功能的 profile 配置快照互补。
- [Yu-Zhuang1/dsh-workspace-snapshot-fork](https://github.com/Yu-Zhuang1/dsh-workspace-snapshot-fork) — 会话与工作区历史状态，未来可扩展。
