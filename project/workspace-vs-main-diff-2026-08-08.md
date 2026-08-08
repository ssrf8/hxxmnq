# 工作树 vs main 已提交版本 · 差异记录（2026-08-08）

> 目的：记录"当前工作树状态"与"git main 分支已提交状态"之间的全部差异，
> 供提交、交接与验收时对照。本文件是一次性快照记录，状态变化后应更新而非堆积。
> 生成方式：`git diff --stat HEAD` + `git status --short`（2026-08-08 工作树）。
>
> 归档状态：本文件现作为 **2026-08-08 云端同步前快照** 保留；其中“未提交”“git 历史滞后”等描述只代表提交前现场。当前项目完成赖场修复独立离线验收后，已按本文件 §6 的边界将项目源码、文档、地图与发布工具同步至云端 `main`；`.reasonix` 本机会话元数据、剪贴板附件、`.env` 与 `dist/` 未纳入。

## 1. 基线

- 分支：`main`；HEAD：`d6aff88 chore: snapshot working tree before UI-externalization refactor`（2026-08-04）。
- HEAD 上层实质提交停留在 **r64 时代**（`71536bb docs: record r64 live candidate` 等）；工作树因此包含 **r65–r94 全部累积未提交工作 + 本轮地图 v4 拼接**。
- 差异规模：**30 个跟踪文件，+808 / -203**；**12 项未跟踪新增**。
- dist/ 不进 git：`dist/checkpoint-0.2.0-r49 … r94` 检查点与 `dist/runtime/` 产物均为磁盘实况，不体现在 git diff。

## 2. 版本状态速览（当前工作树）

| 项 | 值 |
|---|---|
| package.json 版本 | `0.2.0`；三个打包脚本指向 `0.2.0-r94` |
| project/manifest.json | `next_checkpoint=0.2.0-r94-ui-remote-delivery`；`planned_checkpoint_sequence` 至 r94；`runtime_artifacts`/`current_checkpoint=0.2.0-r94`（UI 脚本 `gensokyo-garden-ui-020-r94`）；`release_artifacts` 指向 **r93 正式版**；`ui_sources.garden_base` = v4.png（本次同步） |
| dist 检查点 | r90–r94 齐全；r94 = 测试检查点 JSON+PNG（297,237B / 1,230,920B，远程 loader 形态，已上 R2）；r93 = 含正式版（`superseded` 标记） |
| README「当前有效轻量包」 | r94（UI 远程交付首版，loader 2,613B，指向 R2 ui-manifest） |
| 地图 | `garden_base` = v4（1672×1722，拼接），**未打包进任何检查点**、未上 R2、实机未验收 |
| 离线门禁 | check:ui 通过；npm test **222/223**（唯一失败为既有「GAL 提交锁」测试，见 §6）；build:ui:remote 通过；package:checkpoint:dry 通过 |

## 3. 功能域差异（工作树相对 main）

### A. UI 远程交付（r94 / agent-handoff 第一百零八，2026-08-04）
| 文件 | 变更 | 规模 |
|---|---|---|
| `src/runtime/ui-loader.js`（新增） | 卡内唯一 UI 脚本：no-store 拉 R2 ui-manifest → sha256 校验 → Blob URL import ui-mount，失败可见兜底 | ~48 行 |
| `scripts/build-ui.mjs` | 新增 `--ui-delivery=embedded\|remote`；`--asset-mode=remote-r2-live` 严格校验（HTTPS origin） | +35 |
| `scripts/publish-ui.mjs`（新增） | AWS SigV4 直传 R2 桶 hxxwy：ui-mount immutable 先传、manifest no-store 最后传、拒覆盖、dry-run | ~163 行 |
| `scripts/package-checkpoint.mjs` | `--ui-delivery`、remote 强制校验 loader 含 manifest URL 且 ui-mount-rN.js 存在、10MiB 轻量门禁 | +15 |
| `project/manifest.json` | next_checkpoint/runtime_artifacts 升 r94 | ~5 |
| `package.json` | 打包脚本 r93→r94 | +3/-3 |
| `project/r2-packaging-runbook.md` | 新增「UI 远程交付」章节 | +39 |
| `project/contract.md` | §80 UI 远程交付契约 | +1 |
| `project/README.md` | 「当前有效轻量包」指针更新 | ~2 |
| `tests/ui-contract.test.mjs` | 新增 2 项远程 UI 交付测试（loader 模板结构 + 已构建产物一致性） | +40 |

### B. 地图 v4 拼接（本轮会话 / agent-handoff 第一百零九，2026-08-08）
| 文件 | 变更 |
|---|---|
| `scripts/map-stitcher/`（新增 4 文件） | 可视化拼接编辑器（index.html / start.mjs / README / params-2026-08-08.json） |
| `scripts/stitch-map-layers.mjs`（新增） | 确定性合成脚本：PNG + Q70 WebP + 哈希报告 |
| `src/assets/maps/garden-base-owner-v4.png/.webp`（新增） | v3(0,0) + 新图(0,781) → 1672×1722；PNG 8,891,383B / WebP 555,344B |
| `src/assets/maps/garden-no-walk-mask-v1.svg` | 画布扩至 1722，旧形状不动，下段未登记阻挡（待确认） |
| `src/assets/asset-manifest.json` | garden_base → v4.webp、canvas [1672,1722]、status=v4-stitched-pending-runtime-validation；mask canvas 同步 |
| `src/ui/garden-map.ts` | FOOT_OFFSET 54/941→54/1722、蒙版画布 [1672,1722]、采样点 /1722 |
| `src/ui/garden-navigation.ts` | 脚底半径 7/941→7/1722 |
| `src/ui/garden-spatial.ts` | 六区域 y 按 941/1722 重算（0.43→0.235 等） |
| `tests/ui-contract.test.mjs` | v4 文件名/尺寸/SVG 头部/坐标断言同步 |
| `project/map-stitch-2026-08-08.json/.md`（新增） | 合成报告与嵌入说明 |
| `project/manifest.json` | `ui_sources.garden_base` → v4.png（本次同步） |

### C. 玩家名字投影（r93 / agent-handoff 第一百零七，2026-08-04）
- `src/ui/prompt-context.ts`：`playerIdentityLine()` 注入【场景事实】玩家姓名/称谓（+）
- `src/ui/target-actions.ts`：`gardenNarrativeContract` 称呼玩家规则（+）
- `src/lorebook/gal-presentation-protocol.md`：世界书同款规则同步
- `tests/ui-contract.test.mjs`：名字/称谓/回退/双处规则同步回归（+）

### D. 前端视觉/入口（历史轮次已记录、从未提交的累积改动）
- `src/ui/app.ts`（+123）：「幻想乡案内」大入口面板 launcher 粒子动画（burstStardust / recallStardust / finishLauncherClose / launcherButton / launcherDialog）——对应 README「前端视觉入口」描述
- `src/ui/styles.css`（+334/-）：入口面板、GAL、战斗视觉样式累积
- `src/ui/bridge.ts`（+40）、`src/ui/opening.ts`（+28）、`src/ui/gal-scene.ts`、`src/ui/types.ts`（+1）、`src/ui/index.html`（+3）：与上述视觉/入口及既有事务逻辑配套

### E. 发布脚本与素材发布（未提交工作线）
- `scripts/publish-cg-r2.mjs`、`scripts/publish-cg-r2-finalize.mjs`（新增）：成人 CG R2 live 上传/终稿脚本（对应 nsfw-cg-r2-live-update-plan）
- `project/character-arrival-departure-audit.md`（新增）：角色到达/离开审计文档
- `project/ui-beautification-log.md`（+17）：美化施工日志追加

### F. 环境/杂项
- `.gitignore`（+1）：dist 等忽略条目
- `.reasonix/*`（4 个 desktop-topic json）：本地会话元数据（建议不入库）

## 4. 本轮会话实际改动（与上文 B 域一致）

仅在 §3-B 与 manifest.json ui_sources 一处；其余工作树改动均为会话前遗留。

## 5. 已知不一致与风险

1. **地图 v4 未进入发布链**：R2 live 素材（`dist/asset-live/generation-1`）中 maps 仍只有 v3；v4.webp 未上传、未打包进任何检查点、未实机验收。
2. **蒙版下段未登记阻挡**：画布 y 941–1722 无阻挡形状（新图底部为浅黄褐地面，非深水面），SVG/manifest 已注明"待所有者确认"。
3. **重叠带 y 781–941** 保留原河道阻挡（角色不可站上过渡带；桥镂空采样仍 walkable）。
4. **npm test 222/223**：「GAL 回复落盘后释放本地提交锁」为既有失败——工作树 app.ts 与测试正则不符、`git show HEAD:src/ui/app.ts` 匹配，非本轮引入（本轮地图改动全部通过）。
5. **本地预览修补**：`dist/ui/index.html` 已把 186 处 R2 URL 替换为 `../assets` 并移除 asset-delivery-config（备份 `index.html.remote-backup`）；下次 `build:ui:remote` 会覆盖。
6. **release_artifacts 指 r93**：r93 正式版存在（含 superseded 标记）但 README「正式发布版」行仍写 r92——文档滞后，未在本次修订（如需以 r93/r94 为准需另行确认）。
7. **git 历史滞后**：main 最后一次实质提交为 r64 时代；r65–r94 全部工作均未提交，风险集中在"误回退/误清理工作树"。

## 6. 建议的提交顺序（如需入库）

1. 先提交环境/杂项（.gitignore、.reasonix 可剔除）；
2. 提交文档与审计（contract/runbook/README/handoff/差异本文件/manifest.json/ui_sources）；
3. 提交发布脚本与 UI 远程交付链（build-ui/package-checkpoint/publish-ui/ui-loader/package.json/测试）；
4. 提交前端视觉遗留（app.ts/styles.css/bridge/opening/gal-scene/types/index.html）；
5. 提交地图 v4（素材/脚本/坐标/蒙版/测试）；
6. 提交前补：v4 实机验收、R2 上传 v4.webp、确认蒙版下段阻挡方案。
