# 幻想乡物语 · 项目总览（唯一入口文档）

> 读完本文档即可对整个项目建立全貌认知；需要深入某个领域时，按 §3 导航表跳转对应文档。
> 最后整理：2026-07-27（灵梦 V2 动画试点接入）。

---

## 1. 项目是什么

**幻想乡物语 · 移动庭园**是一张 SillyTavern 角色卡形态的东方 Project 同人经营游戏：玩家继承祖父留下的会移动的结界庭园，在像素地图上与灵梦、魔理沙、琪露诺、爱丽丝、米斯蒂娅、萃香、荷取、咲夜八名角色互动，修缮主屋、经营温室、打符卡弹幕战、开店购物、举办宴会、应对自定义异变。

技术上它是三层结构：

1. **宿主壳层**（`src/runtime/ui-host-shell.js`）：在 SillyTavern 聊天区内挂载单例 iframe 游戏壳，视觉隐藏原生楼层但不删除真实消息；切卡/卸载时完整恢复原生聊天。
2. **游戏 UI 层**（`src/ui/`，约 40 个 TS 模块）：庭园地图 canvas、GAL 剧情演出、设施/商店/背包视图、符卡弹幕小游戏；视图渲染、规则纯函数、桥接事务三组分层。
3. **状态与模型层**：`stat_data`（MVU 变量）是唯一正式游戏状态；剧情由主模型生成、变量由 MagVarUpdate 额外模型以 JSONPatch 更新；**一切关键状态（资源/战斗/事件/在场/时间/UID）由本地 bridge 独占写入，模型只做叙事与开放语义字段**——这是全项目最重要的一条主轴。

交付形态：`scripts/package-checkpoint.mjs` 把 UI（base64 自包含）、世界书 16 条、初始状态打进一张 `chara_card_v2` JSON 测试检查点卡，按 `0.2.0-rN` 序列独立存放于 `dist/`，拒绝覆盖。

## 2. 当前状态速览

| 项 | 状态 |
|---|---|
| 最新打包 | `0.2.0-r54`（`d654424` 主分支基准，SHA-256 `4af870fa…501214`，38.4MB）——**离线候选，未包含本轮扩大视角地图，未实机验收** |
| 已实机验收基线 | `0.2.0-r32-extra-model-binding`（角色世界书绑定 + 额外模型变量路线） |
| 里程碑 | M0 complete / M1 施工完但 R37 集中验收未跑 / M2 施工完但 R45 验收未跑 / M3 进行中 |
| 离线门禁 | check:ui + npm test（109/109）+ build:ui + package dry，全绿 |
| 像素角色动画 | 灵梦 V2 r6 + 魔理沙 V2 r2（扫帚悬浮）已启用 `9×4` 图集；其余六名角色保持旧图集回退，二维路径与后续角色迁移待批次 |
| 庭园地图分层 | 所有者提供的扩大视角无设施底图 `garden-base-expanded-empty-v1.png` 已接入；人物缩至旧比例 73%，设施占位光环缩至 76%；独立设施透明贴图待后续逐座接入 |
| 活跃工作线 | ①前端美化（D/E/F1/F2 阶段待做 + 实机验收）②弹幕小游戏优化（实机验收 + 平衡）③M1/M2 集中实机验收欠账 |
| 目标环境 | SillyTavern 1.18.0 + Tavern Helper 4.8.19 + MagVarUpdate（固定 commit） |

## 3. 导航表：想了解什么 → 读哪个文档

### 3.1 宪法层（改任何东西前必读，不可违背）

| 想了解 | 读 |
|---|---|
| 所有权边界、必须/禁止成立的全部红线 | `project/contract.md` |
| 在场角色同步（presence_snapshot / GensokyoPresence 回执） | `project/presence-sync-contract.md` |
| 额外模型变量分工、写入顺序、世界书路由与预算 | `project/extra-model-variable-analysis.md` + `src/lorebook/variable-update-rules.md` |
| 已固化的架构基线（O0–O3）与停止条件 | `project/runtime-architecture-optimization-plan.md` |

### 3.2 现状指针（回答"改到哪、验到哪、下一步"）

| 想了解 | 读 |
|---|---|
| 当前交接状态、开工顺序、操作约束 | `project/agent-handoff.md`（最上方条目最新） |
| 机器可读的版本/检查点/文件清单指针 | `project/manifest.json` |
| 每个宿主 API 的出处与置信度 | `project/api-provenance.md` |

### 3.3 活跃工作线

| 想了解 | 读 |
|---|---|
| 前端美化方向（像素×二次元双层架构）与阶段规划 | `project/ui-beautification-plan.md` |
| 美化逐轮施工记录、待素材清单、验收交接项 | `project/ui-beautification-log.md` |
| 像素角色 V2 图集合同、灵梦 r6 验收数据与后续迁移步骤 | `project/pixel-character-animation-v2-plan.md` |
| 弹幕小游戏当前状态（TH06 扩展、六模块引擎） | `project/bullet-hell-minigame-handoff.md` |
| 弹幕小游戏改动边界（可改/禁改文件、命名空间） | `project/bullet-hell-minigame-optimization-protocol.md` |
| M1 集中实机验收清单（未执行） | `project/r37-acceptance-checklist.md` |
| M2 所有者验收清单（未执行，含 9 个测试快进按钮用法） | `project/r45-owner-acceptance-checklist.md` |

### 3.4 源码侧文档（改状态/世界书/素材时查）

| 想了解 | 读 |
|---|---|
| 每个 MVU 字段的类型/写入者/上限/迁移 | `src/schema/field-ledger.md` |
| 世界书条目路由（进剧情阶段还是变量阶段） | `src/lorebook/routing-plan.json` + `model-projection.md` |
| 素材清单与评审流程（approved / pending-unified-review） | `src/assets/asset-manifest.json` |
| 商店商品与解锁门 | `src/shop/catalog.json` |
| 符卡战配置结构与白名单 | `src/battle/configs/`（四份同构 JSON）+ `dungeon-registry.json` |
| 地图区域坐标与手描轮廓（换底图必须重描） | `src/ui/garden-spatial.ts` |

### 3.5 历史留档（不必通读，追溯回归原因时按需检索）

- **runtime-report 系列**（`runtime-report-0.2.0*.md`、`-r13`~`-r28`）：版本线里程碑记录；r14/r18/r28/r32 是历史验收节点。
- **规划文档**（`r29-r37-m1-expansion-plan.md`、`r38-r45-m2-*`、`r19-r20-greenhouse-completion-plan.md`、`gal-interaction-plan.md`、`same-layer-refactor-plan.md`、`r47/r48-*-plan.md`）：产品决策来源，施工均已完成；其中 `same-layer-refactor-plan.md` 仍是壳层设计的长期参考。
- **施工日志**（`r38-r45-implementation-log.md`、`r48-followup-implementation-log.md`）：实现细节已固化进代码。
- **`r48-gal-transaction-repair-log.md`**：例外——虽是日志但含真实聊天取证与最易复发的运行时坑，接手运行时问题前值得一读。

## 4. 目录结构速览

```text
src/ui/          游戏 UI（视图渲染 / *-rules.ts 纯函数 / bridge+事务）
src/runtime/     宿主壳（ui-host-shell.js）
src/schema/      MVU schema、字段台账、初始状态
src/lorebook/    世界书源与路由、变量更新规则
src/battle/      符卡战配置与副本登记表
src/shop/        商店目录
src/assets/      像素素材 + asset-manifest.json（批量生成后统一评审制）
scripts/         build-ui / package-checkpoint / preview-server
tests/           三份契约测试（UI 契约 / 弹幕引擎 / M2 规则），esbuild 直测真实源码
project/         全部文档（本文件所在）
dist/            构建产物与历史检查点——不进 git，不许覆盖
```

## 5. 常用命令与固定工作流

```bash
npm run check:ui              # TypeScript 类型检查
npm test                      # node --test，当前 108 项
npm run build:ui              # esbuild 打包 + 素材内嵌 → dist/
npm run package:checkpoint:dry  # 打包演练（不落盘成品）
npm run package:checkpoint    # 正式打包（需所有者授权；拒绝覆盖已有检查点）
npm run preview               # 本地预览 http://127.0.0.1:8765/ui/index.html（注意必须带 /ui/ 路径）
```

修改维护源后的固定顺序：`check:ui → test → build:ui → package:checkpoint:dry`。要新检查点时先把 `package.json` 两个脚本与 `project/manifest.json` 指针升到未占用的 rN。

## 6. 硬约束速记（详见 contract.md）

1. `stat_data` 唯一正式状态；bridge 独占资源/战斗/事件/在场/时间/UID/解锁；模型只写开放语义字段。
2. 时间只能前进；本地结算必须等 `VARIABLE_UPDATE_ENDED` 再合并。
3. 事件登记表是允许结果的唯一来源；模型只收当前事件的最小投影，禁止全目录注入。
4. 模型输出永不作为 HTML/URL/代码执行；玩家不上庭园地图；禁新增万能 `current_chapter`/`current_route`。
5. 未经所有者授权不打包；任何历史 dist 检查点不覆盖；`dist/` 不进 git。
6. 弹幕小游戏只改协议允许的文件；样式限 `.gg-battle-*`/`.gg-dungeon-*` 命名空间；唯一出口 `onFinish(result)`。
7. 离线门禁通过 ≠ 实机验收通过；不得凭 dist 存在推断已验收。
8. UI 故障必须能恢复原生聊天；切卡/卸载完整清理。

## 7. 新 Agent 开工顺序

1. 读本文档 §1–§6 → `project/agent-handoff.md` 最新条目 → `project/contract.md`。
2. 按任务领域从 §3 导航表补读对应细则（美化 → plan+log；弹幕 → handoff+protocol；运行时 bug → r48-gal-transaction-repair-log）。
3. 动手前跑一遍离线门禁确认基线全绿；收工前再跑一遍。
4. 文档更新纪律：状态变化写 `agent-handoff.md` 顶部新条目；专项进展写对应 log；本文件只在"导航结构或项目形态变化"时更新。
