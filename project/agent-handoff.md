# Agent 交接文档

## 当前交接点

- 当前已验收运行基线仍为 `0.2.0-r32-extra-model-binding`；R32 的角色主世界书绑定、额外模型 `UpdateVariable` 路线与 MVU 写入已由所有者确认。
- 当前维护源位于 R34 后、R35 前：R33 爱丽丝人偶维护方案与 R34 荷取自动化方案已完成维护源和离线门禁，但各自的精确产物导入、真实新聊天验收仍未在本交接中宣告通过。
- 2026-07-25 已完成运行时架构优化 O0～O3：严格事件登记表、单一允许结果源、当前事件精确投影、世界书打包边界收口、时间单调和区域白名单。
- O4 只读探测仅确认 `http://127.0.0.1:8001/` 服务可达；当时没有选中角色/聊天，也没有 Tavern Helper/MVU 上下文，不能作为世界书激活验收。
- 最新离线门禁：`npm run check:ui`、`npm test` 41/41、`npm run build:ui`、`npm run package:checkpoint:dry` 全部通过；dry-run 为 16 条世界书、碰撞策略 `refuse-overwrite`。
- R34 成品与目录必须冻结。本次优化没有正式打包、导入或覆盖 R34；包含新架构的首个候选必须使用新的未占用检查点。

## R31 内容与 R32 基础设施修复

- 已在源代码实现 `0.2.0-r31-marisa-free-growth`：温室菜单的“整理自由生长方案”是单回合 `progression_fixed` 事件；仅在妖花核心已结算、基础温室仍存在且没有其他主要事件时出现。
- 本地白名单结算只登记 `自由生长型温室` 到 `unlocked_forms`，并记录魔理沙合作事实；不施工、不改 `current_form`、不扣资源、不推进时间、不激活异变。
- 夜晚、魔理沙在场时显示“夜间观察”自由支线；它不带受控事件标记，可多轮交流，不能解锁方案或主线。
- 已生成独立 R31 候选：`../dist/checkpoint-0.2.0-r31/幻想乡物语-测试检查点-0.2.0-r31.json`，SHA-256 为 `960249eef27a91252c694828699eea60329b6dcabae3e3553fcb9a4f267de419`，UI 脚本 ID 为 `gensokyo-garden-ui-020-r31`。
- 旧的同名 R31 预重组包未被覆盖，已按哈希归档为 `../dist/checkpoint-0.2.0-r31/superseded/幻想乡物语-测试检查点-0.2.0-r31.pre-extra-model.4952371b.json`。
- R31 自由生长型维护源已包含在 R32 运行包中；自由生长方案、额外模型变量更新路线、固定事件的魔理沙本地入场和草稿泄露下的 `GensokyoPresence` 回执解析均已通过所有者验收。夜间观察保持为无强制离场规则的自由支线。

## 本轮已完成

### 0.4 R33/R34 内容与事件架构收口

- R33 `alice_greenhouse_maintenance_proposal` 与自由支线 `alice_doll_workshop_chat` 已进入维护源；方案登记、爱丽丝入场、关系事实和会话 UID 均由本地链路拥有。
- R34 `nitori_greenhouse_automation_proposal` 与自由支线 `nitori_instrument_calibration_chat` 已进入维护源；荷取方案不依赖爱丽丝方案，可按玩家调查顺序独立登记。
- `src/ui/event-registry.ts` 现在严格校验事件类型、入口、轮次、投影键、允许结果和在场迁移；`allowed_results` 不再在结算器维护第二份副本。
- 新增 `src/ui/event-projection.ts`：只向模型注入当前事件的大纲、节拍、禁止偏离、允许结果及 `projection_keys` 指定状态切片。
- 打包器不再把整份 `greenhouse-vertical-slice.json` 作为通用温室关键词世界书条目；普通对话不能因此看到未来事件。
- 固定事件结算锁定请求前时间并由本地按规则推进；额外模型写入的倒退日期/时段会被拒绝。未知区域也不能让新角色登场或覆盖已有合法位置。
- 稳定约束已同步到 `contract.md`、运行时优化计划、R29～R37 与 R38～R45 路线图及 API 来源记录。

### 0.5 额外模型变量解析重组（R32 已验收）

- 世界书已按 MagVarUpdate 路由拆成 `[mvu_plot]` 剧情条目、`[mvu_update]` 变量规则/输出格式，以及同时进入两阶段的 D0 最新状态快照。
- 最新状态使用 `{{format_message_variable::stat_data}}`，打包时写入 `extensions.position=4`、`depth=0`，不再依赖静态“投影契约”假装提供实时值。
- 变量阶段即使无变化也必须输出空 JSONPatch，额外模型只拥有开放语义字段；资源、商店、战斗、在场回执、受控主线和楼层幂等字段继续由本地 bridge 独占。
- bridge 不再在 `MESSAGE_RECEIVED` 时抢先结算；它等待 `VARIABLE_UPDATE_ENDED`，失败/禁用额外解析时使用 2.5 秒安全回退，并在同一 assistant 楼层的最新变量状态上合并本地结果。
- R32 已修正角色主世界书绑定：`extensions.world`、`extensions.mvu_worldbook_name` 与 `character_book.name` 使用同一名称；所有者已确认额外模型能够实际输出并更新变量。

### 0. R29 金币副本与 R30 灵梦小店

- R29 已实现并验收：妖花核心完成后解锁三种纯本地可重复副本；clean/narrow/loss 分别奖励 12/8/3 金币并推进一个时段，取消零结算，奖励 ID 幂等且不创建聊天楼层。
- R30 已实现并验收：`shop.unlocked` 与副本同步解锁；小店仅由 `src/shop/catalog.json` 和预写对话驱动，首发单份物资（6 金币/+1）与组合箱（22 金币/+4）。
- 购买为零 LLM 本地原子事务：余额、物资上限 20、未知商品和重复购买 ID 都会整笔拒绝；购买不推进时间、不创建聊天楼层。
- 设置页保留明确标记的验收快进：温室可用、妖花战后／副本解锁、小店测试状态（50 金币）。它们只写受控 MVU 快照。

### 1. 温室固定剧情收口

- `greenhouse_research_with_marisa` 最多两次有效 LLM 回合：首次行动为第 1 回合，玩家最多补充一次（120 字），第 2 次 assistant 回复自动结算并回庭院。
- 固定剧情的正文目标不超过约 300 个汉字；结束后关闭输入、选项和续聊，点击回庭院。
- 主线/固定行动继续使用本地白名单结算，取消依赖第二次预设解析，避免“第二次结算解析结果不符合 schema”。

### 2. 正文与 GAL 体验

- 载入新对话先清空 GAL 旧正文；本次聊天记录会替换左侧历史浏览内容。
- 固定剧情结束可直接回庭院；左箭头已改为单独的本次互动历史入口。
- 正文提取优先使用酒馆原生楼层中可读正文，过滤代码块、协议和边界外标签，适配不同预设的返回格式。

### 3. 在场角色快照同步（R28）

- 每次庭院 UI 发起的 LLM 请求都注入当前 `presence_snapshot`：在场角色 ID、姓名、区域、动作、朝向，及完整不在场名单。
- 角色抵达、离场或换区时，模型必须在正文后追加一次受控回执：

```xml
<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu"],"character_views":{"reimu":{"area_id":"garden","action":"idle","facing":"front"}}}</GensokyoPresence>
```

- `bridge.ts` 只接受已登记角色与白名单字段；回执原子覆盖 `presence_snapshot`，离场角色的小人视图会一并移除。
- 没有位置变更时不输出该标签。叙事写了“离场”却没有回执，属于模型协议违例，不应由本地文本猜测器擅自改状态。
- 契约见 `presence-sync-contract.md`；回归测试在 `tests/ui-contract.test.mjs`。

## 关键文件

| 主题 | 文件 |
|---|---|
| 庭院界面与固定剧情收口 | `src/ui/app.ts` |
| 本地事件结算、两回合上限 | `src/ui/event-settlement.ts` |
| 模型请求、当前事件精确投影与在场契约 | `src/ui/target-actions.ts`、`src/ui/event-projection.ts` |
| 受控在场回执应用 | `src/ui/bridge.ts` |
| 事件 JSON 严格登记表 | `src/ui/event-registry.ts` |
| 时间单调规则 | `src/ui/time-rules.ts` |
| 正文投影与 GAL | `src/ui/gal-scene.ts` |
| 在场同步契约 | `project/presence-sync-contract.md` |
| R28 运行/导入报告 | `project/runtime-report-0.2.0-r28.md` |
| 角色卡打包器 | `scripts/package-checkpoint.mjs` |
| 架构优化状态 | `project/runtime-architecture-optimization-plan.md` |
| M1 / M2 后续路线 | `project/r29-r37-m1-expansion-plan.md`、`project/r38-r45-m2-expansion-plan.md` |

## Luker 当前数据状态

- 已确认可访问本机 SillyTavern 服务，但本轮只读探测时没有可用于 O4 的选中角色和聊天上下文。
- 本轮没有导入、替换或清理任何角色卡、世界书、聊天及用户配置。
- 过往 R30～R32 的运行数据状态以对应运行报告和所有者环境为准；下一 Agent 不得根据 `dist/` 目录存在就推断已经完成真实导入验收。

## 下一阶段

- 正式计划：`project/r29-r37-m1-expansion-plan.md`。
- 后续已确认的 M2 计划：`project/r38-r45-m2-expansion-plan.md`；只有 R37 验收并把 M1 标记为 complete 后才能启用。
- 当前维护源下一功能检查点：`0.2.0-r35-greenhouse-form-selection`。R33/R34 的独立真实验收仍须补齐，不因源码入口前移而自动通过。
- 实施顺序：补齐 R33/R34 精确产物真实验收记录 → R35 三路线选型/换型 → R36 特殊道具 → R37 UI、运行韧性与 M1 完成候选。
- 独立检查点策略：每轮完成自动门禁、打包、导入和真实 Luker 验收后再进入下一轮；不得覆盖 R28 或其他历史检查点。
- 受控推进剧情读取当前 MVU、登记大纲、允许结果和固定结局；可以有出现条件、但自身结果不承担任何下游前置且不触发连锁的独立支线不限制 LLM 回合数。
- 可重复符卡副本全程本地运行；胜负均推进一个时段，奖励分别为 12/8/3 金币，取消不结算。
- 灵梦小店普通购买不调用 LLM；特殊商品使用本地登记效果和预写对话。
- 温室保留自由生长、人偶维护、河童自动化三路线，全部解锁后才能首次选型；首次消耗 4 物资，换型消耗 3 物资。
- 咲夜怀表每天可使用一次、暂停五分钟并留下可被相关强者察觉的时间痕迹，不允许回滚正式状态。

## 下一位 Agent 开工顺序

1. 不得覆盖 R32、R33、R34 或任何既有产物。R33/R34 需要补验收时，先核对精确既有候选；若需修复则创建新的未占用检查点，不使用 `--replace` 倒填。
2. 开始 R35 前以 `project/manifest.json` 的 `next_checkpoint` 和两份路线图为准；三方案按钮、结果、成本与结算都登记在事件 JSON，不新增 `current_route`。
3. 后续每个事件必须通过统一 loader，只投影当前事件和白名单状态路径；不得恢复结算双写、全量 `stat_data` 或整份事件目录关键词注入。
4. R36 新增路径需显式扩展投影 allowlist 与正反测试；R37 必须用精确候选卡完成世界书实际激活、角色缺席、时间单调和区域迁移审计。
5. 保持 R29 副本、R30 小店和 R31～R34 方案登记的本地事务边界；任何模型输出都不能直接完成资源、路线、UID、在场或关键事件结算。

## 操作约束

- 不直接编辑 `dist/`；修改维护源后依次执行：`npm run check:ui`、`npm test`、`npm run build:ui`、`npm run package:checkpoint:dry`。
- Git 默认只提交维护源、测试和文档；`dist/` 下历史检查点、构建产物和 superseded 归档不进入源码提交，除非所有者对某个精确产物另行授权。
- 所有者已批准 R29～R37 采用逐轮独立检查点、打包、导入和真实 Luker 验收的交付方式；每轮执行写入前仍须核对精确版本、未占用输出路径和目标 Luker 会话，不得把该授权扩大为覆盖历史产物或清理无关数据。
- 打包器拒绝覆盖已有检查点；需要新候选时先更新 `package.json`、`project/manifest.json` 的检查点。
- 真实 Luker 验收使用右侧内置浏览器，不操作桌面浏览器。
- 清理 Luker 数据时先核对精确目标；优先移动至回收站，并保留与本项目无关的数据。
