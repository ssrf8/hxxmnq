# Agent 交接文档

> 2026-07-27（四）：所有者提供扩大视角的无设施庭园底图，已以 `src/assets/maps/garden-base-expanded-empty-v1.png` 接入维护源（1536×1024，SHA-256 `19a88b71…fd52fd`），由 `asset-manifest.json` 的 `maps.garden_base` 驱动构建，不再硬编码旧 `garden-base-spring-v1.png`。地图人物显示缩至旧比例 73%，设施占位光环缩至 76%；旧底图手描建筑轮廓已停用，后续设施必须使用独立透明贴图及登记 hit polygon/透明边界，不能复用旧描点。现有区域锚点与交互保留；设施贴图尚未接入。离线门禁：check:ui 通过、npm test 109/109、build:ui 通过、r54 dry-run 通过（37,420,011 字节，SHA-256 `b9124180…0e3cae`）；**未正式打包、未实机验收**。

> 2026-07-27（三）：魔理沙像素动画 V2 r2 已接入维护源。运行时图集 `src/assets/characters/marisa/marisa-animation-v2-r2.png`（`9×4` / `209×209`，由 `v2-hover-keyframes` 四方向 low/high 最近邻对齐合成悬浮循环）；母档 `marisa-animation-v2-r2-work.aseprite`；构建脚本 `scripts/build-marisa-v2-r2.mjs`。registry / asset-manifest / UI 契约测试已登记；旧 `riding-turnaround-v3 + hover-cycle-v1` 保留回退。离线门禁：check:ui 通过、npm test 108/108、build:ui 通过。**未打包、未实机验收**。欠账：Aseprite 手绘 in-between 精修、二维路径、其余六名角色 V2。记录见 `project/pixel-character-animation-v2-plan.md` §10。

> 2026-07-27（二）：所有者对设施扩展计划三项拍板：①R55 底座泛化确认执行；②契约修订已授权并写入 `contract.md`（「八名固定角色」改为首发名单+登记接入制、新增「新设施不得携带后置主线/全局前置/跨设施门票」红线，大妖精禁令保留）；③新角色素材**占位先行**——不再依赖灵梦 V2 试点验收，占位图集规格见计划 §4.4（主题色剪影、V2 版式 9×4、`status: placeholder` 登记、真素材原位替换零链路改动），真素材与动画后补按 r49 流程逐项勾销。R55（泛化）→R56 花见回廊→R57 缘侧书斋→R58 祈愿分社→R59 妖梦→R60+ 帕秋莉/早苗可依序开工；排期与验收欠账的取舍仍开放（计划 §9.4，默认 R55 先行）。本轮仅改文档（计划/契约/本文件），未改代码、未打包。

> 2026-07-27：新增规划文档 `project/r55-r60-facility-character-expansion-plan.md`——沙盒设施扩展与新角色引入线（纯规划，未施工、未改代码、未打包）。所有者方向确认：首批 3 座温泉式无主线沙盒设施（花见回廊/缘侧书斋/祈愿分社，暂名），用于承接后续新角色（推荐妖梦/帕秋莉/早苗，走「静水观测池引出咲夜」的装修 roll 初遇模式）并吸引人设相符的老角色；设施先行、角色二期。施工前置：R55 设施底座泛化（约 7 处三设施硬编码 + `moon_spring_session` 通用化，见计划 §5）。

> 2026-07-26（深夜）：所有者授权打包 —— `0.2.0-r54` 前端美化测试包已正式生成。产物 `dist/checkpoint-0.2.0-r54/幻想乡物语-测试检查点-0.2.0-r54.json`，SHA-256 `ee8587e7e67c832ac7d175c0eb3b58e625e4afc0640de67388fc246d3257ac73`，36,181,652 字节，UI 脚本 `gensokyo-garden-ui-020-r54`，16 条世界书。打包前门禁：check:ui 通过、npm test 108/108、build:ui 通过、dry-run 通过。r53 及更早 dist 均未覆盖。**r54 仍是离线候选，实机验收未执行**。项目总览导航见 `project/README.md`。

> 2026-07-26（晚）：前端美化专项 R1–R7 已在维护源（当前检查点线 `0.2.0-r53`）完成：设计 token 体系、符卡框语言、圆点→半环绕气泡菜单（含视角跟随）、开场页三轮重构（结界祭夜 + 所有者主视觉 base64 嵌入 + 全屏 + 移除魔法阵）、全阶段全屏（含启动首帧修复）、角色轮廓染色发光、区域底图手描轮廓发光、顶栏角色主题按钮、副本页弹幕夜空。离线门禁 106/106 全绿；**未打包、未实机验收**。方向与阶段见 `project/ui-beautification-plan.md`，逐轮施工与待办见 `project/ui-beautification-log.md`。r53 dist 目录已被占用，打包测试需先把 `package.json` 与 `project/manifest.json` 升到未占用的 r54 并重跑 dry-run。战斗/副本命名空间未越界（仅命名空间内底纹与金边）。

> 2026-07-26：R48 运行事务与调度热修复包已生成。产物为 `dist/checkpoint-0.2.0-r48/幻想乡物语-测试检查点-0.2.0-r48.json`，SHA-256 `04a2e920e9342104d170b50d5f4156b8575a72ce132f8830da23f8c704c95ea9`；R47 保留未覆盖。R48 修复最近设施换型封锁、副本时间推进后的宴会触发、异变卡代码原子启用、异变结算恢复、同步遮罩与会话记录。离线门为 81/81，等待所有者在 Luker 2.7.0 实机验收。

> 2026-07-25：R45 已按用户授权正式打包并进入所有者验收。产物为 `dist/checkpoint-0.2.0-r45/幻想乡物语-测试检查点-0.2.0-r45.json`，SHA-256 `70ce77350f66b89fb3b52eb460d5614e481f292b7b35e4a2590332aee56335c1`。设置页现有 9 个独立验收快进按钮；操作清单见 `project/r45-owner-acceptance-checklist.md`。离线门禁通过，真实 SillyTavern 验收仍待所有者完成。

## 当前交接点

- 2026-07-25 收尾修复已把此前仅存在于纯规则测试中的 M2 功能接入 app/bridge：异变启用与源头回执、每日调查/最终收束、三设施施工/换型/恢复、来访邀请与通知、温泉/宴会、场景道具成功后消费及收尾清理。
- 完整 `stat_data` 世界书条目现只进入 `[mvu_update]`；剧情请求由 UI 注入脱敏事实，普通剧情不再接收 `hidden_origin`。M2 本地根字段在每次 MVU 回复后恢复所有权并统一执行时间调度。
- 当前是已打包的离线验收候选，不是实机验收通过。最终门禁结果见 `project/r38-r45-implementation-log.md` 最新条目。

- 当前已验收运行基线仍为 `0.2.0-r32-extra-model-binding`；R32 的角色主世界书绑定、额外模型 `UpdateVariable` 路线与 MVU 写入已由所有者确认。
- 2026-07-25 所有者授权在维护源连续推进 M2（R38–R45）。维护源已实现开放庭园、背包、来访调度、自定义七日异变、三后续设施、场景道具与 R45 离线候选准备。
- **R37 真实 Luker 集中验收仍未执行**；M1 不得标记 complete。M2 也不得标记 complete。
- 最新离线门禁：`npm run check:ui` 通过、`npm test` 56/56、`npm run build:ui` 通过。
- R45 dry-run（未正式写入 dist 成品授权包）：检查点 `0.2.0-r45`，SHA-256 `c7c5d497136fe122d6c71c3746cbe02a9c7938940eba53d999fb7526cc42cfc4`，约 `30,141,017` 字节，UI 脚本 `gensokyo-garden-ui-020-r45`，16 条世界书。正式打包仍需所有者明确授权。
- 历史 R37 正式包仍保留于 `../dist/checkpoint-0.2.0-r37/`；不得覆盖。R34 成品继续冻结。
- 施工日志：`project/r38-r45-implementation-log.md`。

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

### 0.6 R35 三方案选型与换型（维护源完成）

- `select_greenhouse_form` 与 `remodel_greenhouse_form` 已进入 `greenhouse-upgrade-routes.json`；三个首次选择和三个换型入口分别通过 `action_results` 固定映射结果、提出者、形态、路线 effect 与固定结尾。
- 首次选型只在三项方案完成标记和三个 `unlocked_forms` 同时齐备时开放，扣除 4 物资并推进一个时段；后续只能换到已解锁且不同于当前的形态，扣除 3 物资并推进一个时段。
- `current_form` 仍是唯一当前路线事实源；换型只替换三种路线 effect，保留通用设施效果、全部方案解锁与关系事实，未新增 `current_route`。
- 新增 bridge 独占的 `events.settled_ids` 字段链；庭园行动写入稳定结算 ID，刷新、Swipe、重放和旧楼层扫描不会重复扣费或倒灌旧形态。
- 模型只看到本次 action 对应的提出者、形态、结果和固定结尾；`local_settlement` 的成本与 effect handler 不投影给模型。
- 离线门禁 42/42 通过，R35 dry-run SHA-256 为 `5c4dcbe257154c253e4e5688821ec8c532c5b853bbd1d6769bde13009eda7529`；没有正式打包、导入或真实 Luker 验收。

### 0.7 R36/R37 特殊道具与集中验收候选

- 灵梦小店新增本地目录商品：30 金币的可重复异变触发卡与 80 金币的唯一咲夜怀表；购买、持有、使用和复读均不调用 LLM。
- 异变卡以 `use_id` 从登记事件中确定性抽取，成功写入最多 3 条等待队列后才消费；刷新不重抽、队列满或无候选不消费。
- 咲夜怀表每天最多使用一次，只登记五分钟停顿与时间痕迹，不推进或回滚正式时段；第二次成功使用可登记咲夜调查候选，但不强制常驻，不创建紫或辉夜档案。
- 新增 `special-item-events.json` 并接入统一 loader、最小投影 allowlist、庭院行动入口与本地结算；独立异变支线不写关键完成态。
- R37 保留窄屏、200% 缩放所需的弹性布局、44px 触控尺寸、焦点可见、reduced motion、事务重试、卸载清理、数据库离线降级和道具复读校验。
- 当前 package/manifest 已指向 `0.2.0-r37-m1-release-candidate` 的 dry-run；正式运行基线仍是 R32，现有运行产物仍保持 R34，不得在真实验收前把 M1 标记为 complete。

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
| 前端美化方向与阶段 | `project/ui-beautification-plan.md` |
| 前端美化施工日志（R1–R7） | `project/ui-beautification-log.md` |
| 区域手描轮廓（换底图必须重描） | `src/ui/garden-spatial.ts` |
| 架构优化状态 | `project/runtime-architecture-optimization-plan.md` |
| M1 / M2 后续路线 | `project/r29-r37-m1-expansion-plan.md`、`project/r38-r45-m2-expansion-plan.md` |

## Luker 当前数据状态

- 已确认可访问本机 SillyTavern 服务，但本轮只读探测时没有可用于 O4 的选中角色和聊天上下文。
- 本轮没有导入、替换或清理任何角色卡、世界书、聊天及用户配置。
- 过往 R30～R32 的运行数据状态以对应运行报告和所有者环境为准；下一 Agent 不得根据 `dist/` 目录存在就推断已经完成真实导入验收。

## 下一阶段

- M1 计划：`project/r29-r37-m1-expansion-plan.md`；M2 计划与施工：`project/r38-r45-m2-expansion-plan.md`、`project/r38-r45-detailed-execution-plan.md`。
- 维护源已含 R38–R45 规则与离线测试；当前可选路径：
  1. 授权正式打包 `0.2.0-r45` 并做真实新聊天验收；
  2. 先补做 R37 集中真实验收（清单 `project/r37-acceptance-checklist.md`）；
  3. 继续打磨设施装修/异变启用的宿主 GAL 事务 UI。
- 独立检查点策略不变：不覆盖 R28/R32/R34/R37 等历史产物；无授权不正式打包；离线通过 ≠ 实机通过。
- 自定义异变：玩家填表 → 预留卡 → 隐藏源头一次生成并锁定 → 28 标准时段 → 每日短线索 → 最终收束；不可叠加、不可主动结束；怀表不缩短计时。
- 三后续设施：妖精花园 4 / 月见温泉 6 / 宴会广场 5 物资建成，换型统一 2；同时仅一个大型施工；形态 2/4 聊天或 12/24 时段兜底。
- 背包只显示本地目录；场景道具同场最多 3 种；修缮包只走损坏修复入口。

## 下一位 Agent 开工顺序

1. 不得覆盖任何既有 dist 检查点；需要新候选时用未占用版本。
2. 先读 `project/r38-r45-implementation-log.md` 最新收工条与本交接。
3. 若做实机验收：导入精确候选到新聊天，按 R37 或 R45 矩阵留证据；不得把 dry-run/预览写成 accepted。
4. 若续做 UI 深接：优先异变结构化表单、设施方案比较页、装修/修复完整消息事务，保持 rules 纯函数与 bridge 事务边界。
5. 任何模型输出仍不能直接完成资源、路线、UID、在场、异变生命周期或关键事件结算。

## 操作约束

- 不直接编辑 `dist/`；修改维护源后依次执行：`npm run check:ui`、`npm test`、`npm run build:ui`、`npm run package:checkpoint:dry`。
- Git 默认只提交维护源、测试和文档；`dist/` 下历史检查点、构建产物和 superseded 归档不进入源码提交，除非所有者对某个精确产物另行授权。
- 所有者已批准 R29～R37 采用逐轮独立检查点、打包、导入和真实 Luker 验收的交付方式；每轮执行写入前仍须核对精确版本、未占用输出路径和目标 Luker 会话，不得把该授权扩大为覆盖历史产物或清理无关数据。
- 打包器拒绝覆盖已有检查点；需要新候选时先更新 `package.json`、`project/manifest.json` 的检查点。
- 真实 Luker 验收使用右侧内置浏览器，不操作桌面浏览器。
- 清理 Luker 数据时先核对精确目标；优先移动至回收站，并保留与本项目无关的数据。
