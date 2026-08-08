# 地图拼接记录 · 2026-08-08（v3 底图 + 下段新图 → v4）

> 状态：维护源已嵌入，离线门禁通过；真实 SillyTavern 运行时验收待执行。
> 复现：`node scripts/stitch-map-layers.mjs --params scripts/map-stitcher/params-2026-08-08.json --out-prefix src/assets/maps/garden-base-owner-v4 --layer-dir "D:/浏览器下载" --report project/map-stitch-2026-08-08.json`

## 1. 背景与参数

- 所有者提供新地图 `D:/浏览器下载/ChatGPT Image 2026年8月8日 03_14_07.png`（1672×941，与旧底图同尺寸；像素与旧底图 0% 相同，为 AI 重绘的同布局图）。
- 经 `scripts/map-stitcher/` 编辑器人工定位后导出参数（`scripts/map-stitcher/params-2026-08-08.json`）：
  - 底图 `garden-base-owner-v3.png` 固定于画布 (0,0)；
  - 新图左上角 offsetX≈-0.07（取整 0）、offsetY≈781.39（取整 781），scale 1；
  - 最终画布 1672×1722（新图底部 y=781+941=1722）。
- 重叠带：画布 y∈[781,941]（160px）由新图顶部覆盖旧底图底部。

## 2. 合成产物（确定性，见 report JSON）

| 文件 | 尺寸 | 字节 | SHA-256 |
|---|---|---|---|
| `src/assets/maps/garden-base-owner-v4.png` | 1672×1722 | 8,891,383 | `41debf6ed97c4dd8c1c6de7b14fafde0cecfa3bea80f1cb9845fa92798b40d32` |
| `src/assets/maps/garden-base-owner-v4.webp` | 1672×1722 | 555,344 | `b51c9234929348a649db74d03583bc71066c04846f72fee6592beac1e3142b95` |

采样验证：画布顶部=底图内容，重叠区/底部=新图内容。

## 3. 代码改动

1. `src/assets/asset-manifest.json`：`maps.garden_base` → `source: maps/garden-base-owner-v4.webp`、`canvas: [1672, 1722]`、status `owner-approved-v4-stitched-pending-runtime-validation`、provenance 记录合成来源与哈希；`maps.garden_no_walk_mask.canvas` → `[1672, 1722]`。
2. `src/assets/maps/garden-no-walk-mask-v1.svg`：画布 1672×941 → 1672×1722；旧河道/池面/桥面形状坐标保持（位于 y 0-941 原坐标系）；下段新图区域未登记阻挡。
3. `src/ui/garden-map.ts`：`CHARACTER_FOOT_OFFSET_Y = 54 / 1722`；蒙版画布 `[1672, 1722]`；诊断采样点 river `720/1722`、bridge `826/1722`。
4. `src/ui/garden-navigation.ts`：脚底半径 `y: 7 / 1722`。
5. `src/ui/garden-spatial.ts`：六个区域归一化 y 乘 941/1722（0.43→0.235、0.58→0.317、0.27→0.148、0.36→0.197、0.70→0.383、0.69→0.377）；所有锚点像素 y<781 未被新图遮挡，视觉位置不变。
6. `tests/ui-contract.test.mjs`：v4 文件名、`[1672, 1722]`、SVG 头部、main_house 坐标断言同步。
7. `src/ui/app.ts` 默认 mapSource（`garden-base-spring-v1.png`）仅为 dataset 覆盖前的回退，运行由 build-ui 注入 manifest source，无需改。

## 4. 门禁

- `npm run check:ui`（tsc --noEmit）：通过。
- `npm test`：222/223。唯一失败「GAL 回复落盘后释放本地提交锁时，重新渲染道具选择器」为**既有失败**（工作树既有 app.ts 改动与测试正则不符；`git show HEAD:src/ui/app.ts` 匹配、工作树版不匹配，非本轮引入）。
- `npm run build:ui:remote`：通过（蒙版与底图画布一致性校验随 manifest 自动通过）。
- `npm run package:checkpoint:dry`：通过（UI 包 1,880,917B、26 条世界书、refuse-overwrite）。
- 未正式打包（需所有者授权）；`dist/` 检查点未被覆盖。

## 5. 待确认 / 待验收

1. 下段新图区域（画布 y 941-1722）是否需要新增不可行走阻挡？新图底部采样色 (163,145,82)/(179,152,95) 为浅黄褐（地面类），与旧底图底部深蓝灰水面 (75,94,98) 不同，当前未阻挡、fail-open 放行。
2. 重叠带 y∈[781,941] 保留原河道阻挡形状（角色不可站上该过渡带；红桥采样点 826 处蒙版镂空仍 walkable，但视觉上该带被新图覆盖）。
3. 所有者后续还有一张新图要拼接：届时用同一编辑器导出新参数、`stitch-map-layers.mjs` 以 v4 为底再合成（v4→v5），并复查上述 1-2 项。
4. 真实 SillyTavern：新底图缩放、角色巡游（含下段区域）、设施落位与重叠带行为。
