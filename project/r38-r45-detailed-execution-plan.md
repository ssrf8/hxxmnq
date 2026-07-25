# R38–R45 M2 详细施工计划

> 面向执行代理的逐项规格书。本文定义“怎么做、做到哪里停、拿什么证明”；产品方向以 `r38-r45-m2-expansion-plan.md` 为准。任何实现与本文冲突时，先停工记录，不得自行改需求。

## 0. 文档用途与优先级

### 0.1 阅读顺序

1. `project/agent-handoff.md`：确认当前真实验收状态。
2. `project/r37-acceptance-checklist.md`：完成或核对 M1 实机闸门。
3. `project/r38-r45-m2-expansion-plan.md`：不可擅改的产品决定。
4. 本文：代码分层、检查点、测试与日志要求。
5. `project/contract.md`、`src/schema/field-ledger.md`、`src/lorebook/variable-update-rules.md`：落地时同步维护的正式契约。

优先级：用户最新明确决定 > M2 产品计划 > 本施工计划 > 旧契约与旧实现。遇到矛盾时只记录矛盾和建议，不得替用户选择。

### 0.2 完成的定义

一个检查点只有同时满足以下条件才算“候选完成”：

- 允许范围内的源文件已完成；
- schema、初始值、类型、迁移、更新规则、UI、提示上下文形成完整字段链；
- `npm run check:ui` 通过；
- `npm test` 全量通过，且新增行为有针对性测试；
- 执行日志包含命令、输出摘要、改动文件、风险和未决事项；
- 没有手工修改 `dist/`；
- 没有把离线测试写成“实机验收通过”。

“候选完成”不等于“已验收”，更不等于“已打包”。实机结论由后续验收者填写。

## 1. 零号闸门：任何 M2 代码之前必须满足

### 1.1 R37 实机闸门

- R37 当前仅为离线门禁通过，真实 Luker/SillyTavern 的 R33–R37 与 O4 验收仍待完成。
- 必须在 `project/r37-acceptance-checklist.md` 留下聊天 ID、环境版本、证据与结论。
- 只有结论为“通过”且所有阻断项为零，才允许开始 R38。
- 若失败，只修 R37 缺陷；不得把 M2 功能倒灌进 R37，也不得先改 manifest 假装进入 R38。

### 1.2 工作区保护

2026-07-25 基线：HEAD `9381503`，工作区已有大量已修改和未跟踪文件。这些都视为用户资产。

严禁：

- `git reset --hard`、`git checkout -- .`、`git clean`；
- 删除、覆盖或改名不属于当前检查点的文件；
- 用旧版本整文件覆盖已有改动；
- 使用 `--replace` 覆盖历史检查点；
- 手工编辑 `dist/ui`、`dist/runtime` 或检查点成品。

每次开工先运行并写入日志：

```powershell
git rev-parse --short HEAD
git status --short
git diff --check
```

若目标文件已有未理解的改动，先阅读 diff；无法可靠合并时停工并记录冲突。

### 1.3 基线证据

规划时已验证：

- `npm run check:ui`：通过；
- `npm test`：44/44 通过；
- 未执行构建；未执行打包；未修改真实运行数据。

执行代理不得把这个结果当成自己改动后的验证结果，改动后必须重跑。

## 2. 工具与产物边界

| 动作 | 命令/入口 | 是否写文件 | 使用规则 |
|---|---|---:|---|
| 类型检查 | `npm run check:ui` | 否 | 每个检查点至少一次 |
| 全量测试 | `npm test` | 否 | 每个检查点至少一次 |
| UI 构建 | `npm run build:ui` | 是 | 仅在源修改验证后；构建产物不得手改 |
| 打包预检 | `node scripts/package-checkpoint.mjs --checkpoint=0.2.0-rNN --dry-run` | 否 | 必须先成功构建；检查点必须在 manifest 中合法 |
| 正式打包 | 同上去掉 `--dry-run` | 是 | 仅用户明确授权；目标不得已存在 |
| 本地预览 | `npm run preview` | 长驻服务 | 只做静态 UI 检查，不能代替真实宿主 |
| 实机验收 | SillyTavern + Tavern Helper + MVU | 写真实聊天 | 后续由验收者按清单执行 |

`package.json` 当前检查点脚本硬编码 R37。R38 可把脚本改为转发 npm 参数，或在日志中始终使用上表的直接 Node 命令；不得让脚本默默打错版本。

## 3. 架构边界与文件所有权

### 3.1 固定职责

- `src/schema/initial-state.json`：新存档默认值。
- `src/schema/02-mvu-schema.js`：可接受字段、类型与范围。
- `src/schema/field-ledger.md`：字段事实源、写入者、生命周期、迁移策略。
- `src/ui/state-migrations.ts`：旧存档补默认值；迁移必须幂等。
- `src/ui/types.ts`：运行时消费的 TypeScript 形状。
- `src/ui/bridge.ts`：宿主读写、事务、消息调用；不得继续堆业务判断。
- `src/ui/app.ts`：页面装配与事件绑定；业务计算下沉到 rules 模块。
- `src/ui/*-rules.ts`：纯计算、校验、roll、状态转移。
- `src/ui/*-view.ts`：DOM 渲染与可访问交互。
- `src/lorebook/*`：模型可见规则和场景上下文，不承担本地随机或扣费。
- `src/**/catalog.json`：登记内容；不能把概率和候选列表藏在提示词里。
- `scripts/build-ui.mjs`：从源生成运行时 UI 并嵌入受支持素材。
- `scripts/package-checkpoint.mjs`：从正式源组装角色卡；不得从手改 dist 取巧。
- `tests/*.test.mjs`：契约、迁移、纯规则、事务幂等测试。

### 3.2 建议新增模块

| 文件 | 唯一职责 |
|---|---|
| `src/items/catalog.json` | 道具类别、适用场景、本地效果、是否消耗；价格和解锁仍由商店目录负责 |
| `src/visitors/visit-profiles.json` | 角色时段权重、停留、冷却、邀请响应参数 |
| `src/facilities/catalog.json` | 三设施、三形态、成本、模式、动作、代表角色候选 |
| `src/facilities/risk-conditions.json` | 风险动作与合法 abnormal/damaged 状况 ID |
| `src/ui/inventory-rules.ts` | 数量、99 上限、预留/提交/回滚、场景合法性 |
| `src/ui/inventory-view.ts` | 背包与选物 UI |
| `src/ui/visitor-rules.ts` | 到访/离场/邀请的纯代码调度与稳定 roll |
| `src/ui/anomaly-rules.ts` | 七日周期、预留、线索日界、到期与历史摘要 |
| `src/ui/facility-rules.ts` | 建造、解锁、换型、角色 roll、风险与恢复 |
| `src/ui/activity-rules.ts` | 温泉会话、宴会排期/开始/结束 |
| `src/ui/scene-item-rules.ts` | 场景道具最多三类、同 ID 合并、收尾清理 |
| `src/ui/prompt-context.ts` | 从正式状态生成最小、分层、无隐藏泄露的提示上下文 |

若现有模块已能清晰承担职责，可以扩展而非机械新增；但不得把以上逻辑全部塞回 `app.ts` 或 `bridge.ts`。

## 4. 正式状态字段账本

字段名可在实现时微调一次，但必须先同步 `field-ledger.md`，然后保持迁移、类型、规则、UI、提示词一致。

### 4.1 时间

| 字段 | 默认 | 写入者 | 约束 |
|---|---|---|---|
| `environment.date` | 既有值 | MVU 经运行时校验 | 不倒退 |
| `environment.period` | 既有值 | MVU 经运行时校验 | 四标准时段之一 |
| 派生 `period_serial` | 不持久化优先 | 本地纯函数 | 日期×4+时段；所有 12/24/28 边界统一使用 |

普通聊天允许保持当前时间或前进一个时段；只有登记为长行动的事务可跨多时段。跨越多个边界时逐一派生调度，但在安全点合并通知。

### 4.2 自定义异变

```text
anomaly_cycle
  pending_activation: null | { transaction_id, form, reserved_item_id, created_at }
  active: null | {
    anomaly_id, title, scope, rules_text, exceptions_text,
    start_period_serial, end_period_serial,
    hidden_origin, public_summary,
    clue_receipts[], last_clue_day, status
  }
  history: [{ anomaly_id, title, start, end, origin_summary }]
```

- 同时仅一个 active；不能主动结束或覆盖。
- 异变卡先预留，背景与隐藏源头生成、结构校验和写入成功后才扣除。
- `hidden_origin` 只进入每日调查与最终收束专用上下文，绝不进入普通剧情上下文。
- 到 `start + 28` 个标准时段后自动进入最终收束；跨边界的当前完整回复可作为最终回复。
- history 必须有有界长度；截断策略写入账本和测试。

### 4.3 来访调度

```text
visit_scheduler
  known_characters[]
  plans[]: { plan_id, character_id, kind, due_serial, status, roll_seed }
  cooldown_until: { [character_id]: period_serial }
  last_processed_serial
presence_snapshot.visitor_meta
  { [character_id]: { source, arrival_serial, leave_serial, plan_id } }
```

- 随机来访由代码 roll，只产生本地通知和地图角色，不自动调用 LLM。
- 普通庭院最多 3 名；宴会最多 6 名；固定事件可临时突破普通上限但必须有来源标记。
- 未认识角色不能普通随机来访或被邀请；设施代表的首次相遇除外。
- 重试、刷新、Swipe 使用同一 plan/seed，不重复 roll。

### 4.4 设施与活动

```text
garden_projects.active_construction: null | { facility_id, form_id, transaction_id }
facilities.<id>
  built, current_form, unlocked_forms[], first_use_forms[]
  activated_at_serial, distinct_chat_periods[]
  second_form_choice_pending, unlock_deadline_2, unlock_deadline_3
  status: normal | abnormal | damaged
  condition_id, risk_cooldown_until
  pending_refit, pending_recovery
garden_activities
  hot_spring_session: null | { mode, participants[], start_serial, status }
  banquet: null | { activity_id, due_serial, mode, invited[], accepted[], status }
```

- 大型施工同时最多一个；花园/月泉/宴会成本 4/6/5 物资，成功后前进一个时段并直接完成。
- 每设施第一次施工直接选三形态之一；基础壳不是第四形态。
- 第二/第三形态由不同聊天时段 2/4 次解锁，同时有 12/24 时段兜底。
- 换型成本统一 2 物资、前进一时段；有活动、访客未清场、设施异常/损坏时禁止。
- 装修角色由代码在开始时锁定；重试/Swipe 不换人，取消整次事务后再发起才重抽。
- 风险仅登记的 experiment/challenge 动作可 roll：10% 命中，再按 70% abnormal / 30% damaged；每形态首次保护，命中后 28 时段冷却。

### 4.5 背包与场景道具

```text
inventory
  consumables: { [item_id]: 0..99 }
  key_items: { anomaly_card, pocket_watch, ...既有正式字段或兼容映射 }
scene_item_context
  scene_id, status: active | closing
  entries[]: { item_id, quantity_used, mode, first_transaction_id }
  closing_transaction_id
```

- 玩家不能创建物品；所有 ID 必须来自本地 catalog。
- 首版新增六种消耗品；永久物只保留怀表。
- 一次 LLM 调用最多新增一种道具；一个场景最多三种 ID；同 ID 再用会再次扣数量但合并条目。
- 只有完整回复、合法 MVU 更新和本地提交均成功后扣除；取消、失败、未采用 Swipe 不扣。
- 点击结束剧情时先以全部道具上下文调用最后一次 LLM，成功后才清空；自动跨时段结束则当前完整回复即最后回复。

## 5. 所有生成事务的统一协议

任何“扣资源/预留物品/roll 角色/启动活动 + 调 LLM”的操作必须按同一骨架：

1. 读取最新 `stat_data`，做 schema 迁移但不写业务结果。
2. 校验前置条件、余额、人数、时间和场景。
3. 生成稳定 `transaction_id`；稳定 roll 结果随事务保存。
4. 在内存或 pending 字段预留，禁止重复按钮提交。
5. 组装最小上下文；隐藏信息只给获准的专用调用。
6. 发送消息并等待主回复与额外模型结算完成。
7. 重新读取最新状态，不能用步骤 1 的旧快照覆盖并发更新。
8. 校验允许的 MVU 变更；本地拥有字段由运行时恢复/重算。
9. 原子提交扣费、时间和状态；写入 settlement/transaction ID。
10. 再读取验证提交结果，然后解锁 UI。
11. 任一步失败：保留可重试上下文，不重复扣费、不重抽、不前进时间。

每一类事务至少测试：成功、取消、空回复、生成失败、MVU 非法、写入失败、重复 settlement、刷新恢复、Swipe 未采用。

## 6. 检查点 R38：基础状态、背包壳与来访底座

### 6.1 目标

只搭建所有后续功能共享的地基，不实现完整异变或设施剧情。

### 6.2 允许改动

- manifest/profile/checkpoint 配置（仅 R37 已正式通过后）；
- schema、ledger、types、migration；
- 时间纯函数；
- items/visitors catalog 与对应 rules；
- 背包入口、空态、数量展示；
- 地图本地通知和缺图降级；
- 测试与施工日志。

### 6.3 步骤

1. 在 manifest 中把已验收基线和 next checkpoint 调整为 R38；不得预先把 R38 写成 accepted。
2. 先写字段账本，再同步 initial state、schema、types、migration。
3. 迁移旧 R36 等待异变队列：保留为 legacy，不得误激活为新七日异变；写明确清理/归档规则。
4. 实现 `periodSerial`、相邻时段、日期边界、跨 N 时段迭代。
5. 建立六种消耗品 catalog；背包 UI 支持空态、99 上限、禁用原因，不允许自由输入 item ID。
6. 建立至少已确定角色的 visit profile。资料不确定时用保守默认值并在日志列为待调参，不得让 LLM 判定。
7. 调度器只创建/结算本地计划；通知不调用 LLM；地图无素材时显示可访问的文字/头像占位，禁止 broken image。
8. 若构建脚本只嵌入少数角色素材，补齐已有 Cirno/设施素材登记；没有素材的角色保留标签降级。

### 6.4 必测用例

- 全新状态与至少两种旧存档迁移幂等；未知字段不污染正式状态。
- period serial 四时段、跨日、跨 12/24/28 边界。
- 背包 0/1/99、未知 ID、错误类型、重复迁移。
- 相同调度 seed 稳定；未知角色、未认识角色、冷却、人数上限被拒绝。
- 到访只产生通知；点击角色后才创建交流动作。
- 缺少地图图像时仍可键盘访问、无空白点击区。

### 6.5 出口闸门

字段链完整；无 LLM 随机调度；测试全绿；日志完整。不得打正式包。

## 7. 检查点 R39：玩家自定义七日异变

### 7.1 目标

把旧“登记事件池抽卡”替换为玩家填写、LLM 一次生成隐藏源头、持续 28 时段的唯一活动异变。

### 7.2 步骤

1. 更新 `project/contract.md`、事件契约、变量规则和 routing，删除“异变卡确定性抽预登记事件”的正式语义。
2. UI 表单字段至少含标题、影响对象/范围、核心规则、补充说明；设定长度上限和纯文本转义。
3. 使用卡时只创建 pending；卡数量此时不减。
4. 专用激活提示请求结构化 `GensokyoAnomalyOrigin`：公开背景、隐藏源头、首日灵梦引导、约束复述。
5. 本地验证非空、长度、枚举和不可执行文本；成功后写 active 并扣卡，失败可原事务重试。
6. 每次普通剧情提示都注入公开异变背景，但不注入隐藏源头。
7. 每个新自然日第一次合格剧情提供一次灵梦调查线索；同日重试/Swipe 不重复。
8. 第 28 时段边界触发最终收束，公开完整源头并归档；不能提前结束，也不能叠加第二个异变。
9. history 有界；旧队列迁移后不再显示为可激活的新异变。

### 7.3 必测用例

- XSS/HTML/URL/脚本文本仅作为文字保存与显示。
- pending 失败不扣卡；成功只扣一次；刷新后可恢复；重复 settlement 幂等。
- active 时拒绝第二张卡；无主动结束入口。
- 普通上下文不含隐藏源头；每日调查含受限线索输入；最终收束才完整公开。
- 0、1、27、28、跨多时段边界；同日多轮只一条线索。
- 正常聊天时间不动/前进一格合法，倒退/普通聊天跨多格被拒绝。

### 7.4 出口闸门

必须能通过测试证明隐藏字段没有走普通 prompt builder；仅看 UI 隐藏不算通过。

## 8. 检查点 R40：妖精花园

### 8.1 固定规则

- 建造 4 物资、1 时段；换型 2 物资、1 时段。
- 三方案在本地比较页直接列差异；选方案和施工不调 LLM。
- 花园固定公开；代表角色包含琪露诺，未认识时在合法候选中双倍权重但不保证出现。
- 形态取得：不同聊天时段 2/4，或投入使用后 12/24 时段兜底。
- 风险动作仅“妖精竞赛”“冰冻实验”；各形态第一次受保护。
- 商店随建成开放妖精糖果包，8 金币。

### 8.2 步骤与测试

1. 在 facility catalog 写三形态的展示差异、三快捷意图、候选角色和风险动作。
2. 本地原子建造：余额、唯一施工、扣 4、时间 +1、直接 built/current_form。
3. 完成后可发起自由行动；LLM 只接收已定事实，不决定成本或成功。
4. 记录不同标准时段的有效聊天；同一时段重试不累计。
5. 到 12 时段显示第二方案选择，暂不选也不阻断；到 24 两个剩余方案自动取得。
6. 换型前清访客/活动；代码锁定装修角色；首次形态相遇与重复拜访上下文分开。
7. 风险命中、严重度、冷却、abnormal 调查与 damaged 修复分别测试；失败不扣不推进。
8. 糖果购买、99 上限、场景使用、赠送、成功后扣除各测试一次。

出口：A→B→A 换型、12/24 兜底、琪露诺首遇、两类风险均有稳定测试。

## 9. 检查点 R41：月见温泉

### 9.1 固定规则

- 建造 6，换型 2；三形态：露天月见汤、静水观测池、雾隐汤屋。
- 默认模式依次为公开、仅邀请、独处；进入前可改本次模式。
- 公开最多 3 人；仅邀请只允许已接受者；独处强制零访客。
- 会话从选择模式后立即开始，离开、主动结束或时间进入下一时段时结束。
- 风险仅静水观测池登记的观测/调查动作。
- 商店开放月见茶 10、温泉香包 12。

### 9.2 必做与必测

- 复用通用设施规则，不复制一套建造/解锁算法。
- 参与者由当前在场、邀请结果和代码静态池生成；LLM 不增人。
- 独处模式 prompt 与 presence 都不得泄露访客。
- 会话结束必须恢复普通来访上限并清理临时参与者。
- 时间不动允许多轮；首次合法 +1 时当前完整回复为最终回复并自动清理。
- 香包仅设施专用，不进入普通场景多轮上下文；月见茶可聊天/赠送。
- 测试公开 0/1/3、邀请接受/改约/拒绝、独处、刷新恢复和结束幂等。

## 10. 检查点 R42：宴会广场

### 10.1 固定规则

- 建造 5，换型 2；三形态：灯火夜市、符卡演武场、鬼之大宴台。
- 宴会可排当前或未来 4 个标准时段；公开或邀请制。
- 公开在开始时补合法随机访客；邀请制只含已接受者；最多 6 人。
- 同一时段可多轮，一旦时间推进自动结束并清场。
- 风险仅符卡演武场切磋/符卡展示。
- 商店开放宴会食盒 14、小瓶鬼酒 16。

### 10.2 必做与必测

- 排期保存稳定 activity ID；刷新不重复邀请或补员。
- 邀请结果由代码依据 profile roll，并在开始前锁定。
- due 超过 4、过去时间、设施不可用、已有活动均拒绝。
- 普通 3 人与宴会 6 人上限切换正确；固定参与者超普通上限有来源记录。
- 自动结束后无幽灵 presence、无残留 scene item context、无宴会 prompt。
- 食盒/鬼酒可聊天和赠送，不创建好感数值或角色永久库存。

## 11. 检查点 R43：咲夜与怀表闭环

### 11.1 目标与边界

- 咲夜加入静态相遇/来访候选，遵守认识门槛、时段、事务和冷却。
- 怀表仍是唯一首版永久新道具：每日成功一次，登记五分钟停顿/痕迹，不改正式时段。
- 第二次跨日使用可登记咲夜调查候选，但不强制咲夜常驻或凭空在场。
- 怀表不能缩短异变 28 时段、设施 12/24 解锁、来访冷却或活动排期。

### 11.2 必测

- 同日第二次拒绝；跨日恢复；刷新/重试不重复登记。
- 怀表使用前后所有 period serial 派生计时器不变。
- 未认识/不在场的咲夜不会被普通 prompt 当作现场角色。
- 调查候选只能通过登记事件触发，不能由关键词误激活。

## 12. 检查点 R44：跨系统道具、组合钩子与恢复

### 12.1 场景道具闭环

1. 自由聊天、设施行动、温泉、宴会允许选择；建造、换型、战斗、异变激活/调查/收束等固定结算禁用。
2. 一次调用最多新增一个 ID；场景最多三种；同 ID 合并并再次消费。
3. 预留只在成功 settlement 后转消费；失败和未采用 Swipe 释放预留。
4. 后加入角色只获得当前可观察影响，不注入缺席期间完整历史。
5. 手动结束必须先做携带全部上下文的最后回复；成功后清空。

### 12.2 恢复与组合

- emergency repair kit 18 金币，任一后续设施建成后解锁；仅 damaged 修复事务可用。
- abnormal：一次调查 +1 时段，不扣物资。
- damaged：预留 2 物资，或使用修缮包的登记替代路径；一次修复 +1 时段；失败零扣除。
- 组合事件只做结构化 hook 和冷却，不在本检查点擅自新增未确认奖励。
- active/pending/plan/history/notification 均设有界清理，防止存档无限增长。

### 12.3 必测

- 三种不同道具后第四种被拒；同 ID 多次数量正确。
- 手动收尾失败保持 active，可重试且不重复扣。
- 自动跨时段结束不额外调用 LLM，当前完整回复结算后清理。
- 异变与道具上下文同时存在，但道具不得修改异变规则/期限。
- 修缮包与 2 物资两条路径互斥、幂等、失败保留。

## 13. 检查点 R45：全量候选与交付准备

### 13.1 离线门禁顺序

```powershell
git diff --check
npm run check:ui
npm test
npm run build:ui
node scripts/package-checkpoint.mjs --checkpoint=0.2.0-r45 --dry-run
```

构建后再次运行类型检查和测试。检查生成 runtime 是否包含新增 UI、catalog 和已有素材；核对没有引用本机绝对路径。

### 13.2 正式打包授权

只有用户明确说“打包 R45”后，才运行不带 `--dry-run` 的命令。若目标文件已存在，停工报告；禁止 `--replace`。成功后记录：绝对路径、字节数、SHA-256、世界书条目数、脚本 ID、Git HEAD、dirty 状态。

### 13.3 R45 不是自动通过

离线候选仍需真实 SillyTavern 验收，至少覆盖：导入、新存档、旧存档迁移、异变完整周期边界、三设施建造/换型、邀请/随机来访、温泉/宴会结束、场景道具收尾、刷新/Swipe/失败恢复、窄屏/200% 缩放、控制台错误和世界书泄露。

## 14. 每个检查点的强制日志格式

所有记录追加到 `project/r38-r45-implementation-log.md`，不得覆盖旧条目。每次至少写“开工”和“收工/停工”两段：

```markdown
## YYYY-MM-DD HH:mm — RNN — 开工/收工/停工
- 执行者：
- HEAD：
- 工作区基线摘要：
- 本轮目标：
- 实际修改文件：
- 字段链变更：
- 数据迁移：
- 执行命令与结果：
- 新增测试名称/数量：
- 手工检查：
- 未执行事项：
- 风险/冲突/待确认：
- 下一步唯一入口：
```

失败日志必须额外包含：复现步骤、期望、实际、聊天 ID、消息楼层/ID、transaction ID、失败前后 `stat_data` 摘要、控制台原文、截图绝对路径。敏感信息不得写入日志。

## 15. 验收者后续 Debug 所需证据

执行代理交接时必须提供：

- 本轮 diff 的文件清单与一句话职责；
- 最后一次 `check:ui`、`npm test` 原始摘要；
- 新增测试对应的需求编号；
- 所有 migration 的输入/输出 fixture；
- 所有稳定 roll 的 seed/transaction ID 示例；
- prompt context 的脱敏快照，分别证明隐藏源头“应出现”和“不应出现”；
- 失败恢复的 before/after 状态；
- 若已获授权打包，提供 hash；否则明确写“未打包”；
- 实机未做就写“未做”，不得用静态预览冒充。

## 16. 总体阻断项

出现任一项立即停工：

- R37 未正式通过却开始写 M2；
- 需要覆盖用户已有改动但无法理解；
- schema/initial/migration/type/ledger 任一缺链；
- LLM 决定本应由代码决定的成本、人物 roll、概率、人数或正式状态；
- 普通 prompt 泄露异变隐藏源头或缺席角色信息；
- 刷新、重试、Swipe 导致重复扣费、重抽、重复推进时间；
- 测试出现回归仍继续下一检查点；
- 打包目标碰撞、准备使用 `--replace`；
- 真实宿主失败却标记为验收通过。

## 17. 执行纪律

- 一次只做一个检查点，一次提交只表达一个可回滚意图。
- 先纯规则和测试，再接 UI，再接提示上下文，最后构建。
- 不顺手重构无关代码；确有必要时单列“前置重构”并证明行为不变。
- 不新增主线、等级、好感数值、自动生产、玩家自建物品或第二个并行异变。
- 不预写固定设施剧情；LLM 生成正文，但必须接收代码已决定的事实。
- 所有“我觉得完成了”都要换成命令输出或实机证据。这样验收时会轻松很多——至少不会需要靠读心术。
