# Cirno V2 keyframes r1（pixel_mcp 前置包）

本目录是琪露诺 V2 动画在 `pixel_mcp` / Aseprite 补间之前使用的关键姿势参考包，不是可直接运行的 sprite sheet，也不替换现有 `cirno-turnaround-v1.png` 或 `cirno-walk-cycle-v1.png`。

## 来源与状态

- 角色身份与四向基准：`../cirno-turnaround-v1.png`（asset manifest 已标记 approved）。
- 次要动作参考：`../cirno-walk-cycle-v1.png`。
- 新增关键姿势由内置 ImageGen 依据上述两张参考图生成；未调用 `pixel_mcp`。
- 洋红色键源图保存在 `chroma-strips/`，去背后的整组透明图保存在 `transparent-strips/`。
- `poses/` 包含交接给后续动画制作的 17 张独立透明 PNG，统一为 `1024×1024`、可见高度 `600px`、水平中心 `x=512`、脚底基线 `y=930`。
- 前置关键姿势与技术 QA 已完成；候选 `9×4` 图集、Aseprite 母档和 GIF 已生成，等待所有者逐组验收。运行时接入尚未执行。

## 17 张关键姿势

| 文件 | 用途 |
|---|---|
| `poses/cirno-v2-stand-front-r1.png` | 正面站姿基准；供 `idle-00` 与独立 `down-00` 的设计锚点使用，最终槽位不得直接共用同一 cel。 |
| `poses/cirno-v2-stand-back-r1.png` | `up-00` 背向站定/起步基准。 |
| `poses/cirno-v2-stand-left-r1.png` | `left-00` 站定/起步基准。 |
| `poses/cirno-v2-stand-right-r1.png` | `right-00` 站定/起步基准。 |
| `poses/cirno-v2-idle-blink-r1.png` | idle 眨眼关键姿势。 |
| `poses/cirno-v2-idle-wings-raised-r1.png` | idle 冰翼轻抬/闪动关键姿势。 |
| `poses/cirno-v2-idle-wings-lowered-r1.png` | idle 冰翼回落关键姿势。 |
| `poses/cirno-v2-left-contact-a-r1.png` | 左行第一接地关键姿势。 |
| `poses/cirno-v2-left-high-pass-r1.png` | 左行经过/高点关键姿势。 |
| `poses/cirno-v2-left-contact-b-r1.png` | 左行对脚接地关键姿势。 |
| `poses/cirno-v2-right-contact-a-r1.png` | 右行第一接地关键姿势。 |
| `poses/cirno-v2-right-high-pass-r1.png` | 右行经过/高点关键姿势。 |
| `poses/cirno-v2-right-contact-b-r1.png` | 右行对脚接地关键姿势。 |
| `poses/cirno-v2-up-contact-a-r1.png` | 向上第一接地关键姿势。 |
| `poses/cirno-v2-up-contact-b-r1.png` | 向上对脚接地关键姿势。 |
| `poses/cirno-v2-down-contact-a-r1.png` | 向下第一接地关键姿势。 |
| `poses/cirno-v2-down-contact-b-r1.png` | 向下对脚接地关键姿势。 |

## 后续 32 帧映射建议

- idle：用正面站姿建立独立 `idle-00`，三张生成姿势对应 `idle-01..03`；脚底和身体中心不得移动。
- left/right：独立制作方向 `00`；contact A、high-pass、contact B 分别锁定交替接地与高点，其余帧由 `pixel_mcp` / Aseprite 补间成 `01..08`。左右不得互相镜像。
- up/down：独立制作方向 `00`；contact A/B 锁定 `01` 与 `03`，再补出经过与回收帧 `02`、`04`。
- 琪露诺仍是“步行 + 翅膀轻悬浮”，不能改成魔理沙式持续离地飞行。脚步必须可读，冰翼只提供小幅相位变化。
- 完成任一动作组后，必须从真实透明 PNG / Aseprite 母档导出 GIF，按 `project/pixel-character-animation-v2-plan.md` 的强制验收门逐组确认。

## 技术 QA

- 17 张独立 PNG 均为 RGBA，四角透明。
- 未检测到可见洋红色键残留。
- 单姿势统一可见高度、中心与脚底基线。
- 方向、角色配色、蓝色大蝴蝶结、红色领结、白色锯齿裙边与六枚冰翼均保留。
- `cirno-v2-keyframes-r1-qa-contact-sheet.png` 仅供总览，不作为动画帧来源。

## V2 r1 候选产物（等待所有者验收）

- 图集：`../cirno-animation-v2-r1.png`（`1881×836`，单格 `209×209`，32 个非空槽）。
- `pixel_mcp` 母档：`../cirno-animation-v2-r1-work.aseprite`。
- GIF：`../cirno-animation-v2-r1-{idle,left,right,up,down,overview}-demo.gif`。
- 构建帧：`../v2-build-frames-r1/`；GIF 裁片：`../v2-demo-frames-r1/`。
- 可复现脚本：`scripts/build-cirno-v2-r1.mjs` 与 `scripts/export-cirno-v2-demo-gifs.mjs`。
- 母档经 `pixel_mcp` 回导 PNG 后与候选图集逐像素一致。
- 当前状态仅为 `owner-gif-review-pending`；未得到所有者明确“通过”前，不得登记进运行时 registry 或 `asset-manifest.json`。

## ImageGen 提示组摘要

所有生成调用均以 approved turnaround 为主参考、旧 walk cycle 为动作次参考，并要求：保持琪露诺身份、像素风、闭嘴轻微微笑、六枚冰翼、无额外肢体；使用均匀 `#FF00FF` 色键背景，无文字、阴影、水印或背景元素。

- idle：正面三姿，依次为闭眼眨眼、冰翼轻抬、冰翼回落，身体和脚底固定。
- left/right：各三姿，依次为接地 A、经过/高点、接地 B；严格保持各自侧面方向并体现交替脚步。
- up/down：各两姿，分别为左右脚交替接地；背向不得露出脸，正向保持闭嘴表情。
