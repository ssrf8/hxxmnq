# Marisa V2 hover keyframes（生成参考）

此目录包含供后续 Aseprite / `pixel_mcp` 修图、对齐和拼接使用的关键姿势参考，不是可直接运行的 sprite sheet，也不替换现有 `marisa-hover-cycle-v1.png`。

| 文件 | 含义 |
|---|---|
| `marisa-hover-v2-{direction}-low.png` | 该方向悬浮摆动的低点参考 |
| `marisa-hover-v2-{direction}-high.png` | 该方向悬浮摆动的高点参考 |

`direction` 为 `left`、`right`、`up`（背向）或 `down`（面向）。文件均为已去除色键背景的 PNG。

## 已接入 r2

这些关键姿势已由 `scripts/build-marisa-v2-r2.mjs` 对齐到 `209×209`、统一可见高度约 150px，并组装为运行时图集：

- 运行时：`../marisa-animation-v2-r2.png`
- 母档：`../marisa-animation-v2-r2-work.aseprite`
- 对齐后单格：`aligned-209/*.png`

中间帧当前为 low/high 关键姿势 + 悬浮位移合成，**不是**手绘完整 in-between；后续若在 Aseprite 精修，应覆盖图集对应槽位后仍保持 `9 × 4` 合同与脚底/中心锚点。不得把生成参考图直接按地面行走节奏裁切。
