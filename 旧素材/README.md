# 旧素材归档

本目录保存 2026-07-29 项目素材清理中迁出的历史、废弃、被拒绝或已被正式版本取代的素材。

## 归档原则

- 保留原项目相对路径：例如原来的 `src/assets/ui/example.png` 会移动到 `旧素材/src/assets/ui/example.png`。
- 本目录不参与当前 UI 构建、角色卡打包、运行时资源清单或自动测试。
- 需要恢复某项素材时，将对应文件或目录按相对路径移回项目根目录，并重新执行完整门禁。
- `dist/` 历史检查点、当前 `asset-manifest.json` 登记素材、approved 角色序列、`最终版` 原始输入及运行时 fallback 均未移动。

## 本次归档内容

| 类别 | 说明 |
| --- | --- |
| 地图生成过程 | `new-map-style-v2` 的 samples、candidates、previews 和已复制到正式目录的重复图；旧的扩大视角底图与未采用底图候选 |
| 设施旧版 | 已被正式 `-v2` 设施素材取代的 26 张 `-v1` 地图设施图及色键源 |
| UI 退役方案 | 所有者取消采用的四张 `target-action-*.png` 图片按钮 |
| 角色动画试作 | 被拒绝、废弃或已被 approved sequence 取代的 Alice、Cirno、Reimu、Sakuya 动画试作、拆帧、GIF 与母档 |
| QA 派生产物 | Marisa V2 与旧 `sequence-v1` 的可重新生成预览帧、strip 和 GIF；运行时图集、测试夹具、母档和必要关键帧未移动 |
| 旧世界候选 | 当前未登记、未构建的樱花地标候选 |
| 制作脚本 | 只服务上述退役素材的旧构建/导出脚本，保存在 `旧素材/scripts/` |

## 当前保留在维护源的非运行时素材

以下内容虽然不会直接进入成品，但仍用于复现、验收或回退，因此没有归档：

- `asset-manifest.json` 中登记的 chroma 维护源；
- 七名角色的 `sequence-approved-v1` 原字节来源与适配帧；
- 七名角色的 `最终版` 原始合帧；
- 仍由自动测试覆盖的 `sequence-v1` 候选链；
- 当前 turnaround、walk/hover fallback 和 Reimu/Marisa 的活动 V2 图集；
- 当前地图、设施、UI 与战斗运行时素材。
