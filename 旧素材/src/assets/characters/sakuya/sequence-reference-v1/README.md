# 咲夜四向动作参考序列 v1

本目录把 `src/assets/characters/参考序列帧/正常/001.png`–`023.png`
转换为咲夜身份版本，供后续像素动画制作和动作拆帧参考。它不是运行时图集，
不得直接登记到 `character-sprite-registry.ts`。

## 输入与约束

- 动作、四向朝向、肢体位置、重心、抬脚、角色尺度和 `720×720` 排版：
  完全继承原 23 张参考帧。
- 身份与配色：以 `../sakuya-turnaround-v1.png` 为准，采用银灰发、蓝白女仆装、
  深色鞋袜、绿色发饰和怀表语义。
- 不增加飞刀、托盘、魔法、文字或其它动作道具。
- 原参考右下角生成水印只在非角色矩形内清理，不触碰动作像素。

## 生产方法

1. 使用内置 imagegen，以 `001.png` 为动作参考、`sakuya-turnaround-v1.png`
   为身份参考生成首张身份模板：
   `candidates/001-identity-template-imagegen-v1.png`。
2. 检查发现直接生成会压缩侧向抬腿幅度，因此该图只作为身份色板，不作为动作帧。
3. `scripts/build-sakuya-reference-sequence-v1.mjs` 在原帧上执行受角色区域约束的
   像素换色；只改变头发、服装、发饰和鞋袜色系，保留原始空间结构。
4. 使用 `pixel_mcp` 把 23 张 PNG 导入 Aseprite，统一设为 `130ms`，建立
   `normal-reference-cycle` 标签并导出循环 GIF。

## 产物

- `frames/001.png`–`frames/023.png`：23 张 `720×720 RGBA` 咲夜四向参考帧。
- `sakuya-reference-sequence-v1-work.aseprite`：23 帧可编辑母档。
- `sakuya-reference-sequence-v1-demo.gif`：23 帧循环预览，每帧 `130ms`。
- `sakuya-reference-sequence-v1-contact-sheet.png`：静态总览。
- `manifest.json`：机器可读的来源、输出和 QA 状态。

## 验收状态

所有者于 2026-07-28 判定本批**验收不通过**。本目录仅作为失败试作与生产方法
对照保留，不得登记 `asset-manifest`、不得接入 sprite registry 或运行时，也不得
作为咲夜 V2 后续动作基线。若继续返修，必须另起版本，不能覆盖本批产物。

统一状态：`owner-rejected-reference-sequence-v1`。

## 技术 QA

- 23 张输出尺寸均为 `720×720`。
- 输入与输出 alpha 平面逐帧完全一致。
- 颜色变化仅发生在四个角色允许区域与右下角水印清理区域；
  允许区域之外的变化像素数为 `0`。
- Aseprite 母档为 23 帧；GIF 为 23 帧，全部帧时长 `130ms`。
- 技术导出完整不等于所有者验收通过；本批最终裁定以本页“验收状态”为准。
