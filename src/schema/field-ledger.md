# MVU 字段台账 v0.3.0

`stat_data` 是唯一正式状态源。下表中的“模型”指正文与变量更新模型，“桥接”指本地同层应用 bridge，“数据库”只允许读取已结算摘要的副本。

| 路径 | 类型/默认值 | 写入者 | 读取者/渲染者 | 清理与迁移 |
|---|---|---|---|---|
| `meta.schema_version` | 字面量 `0.3.0` | schema | schema、诊断页 | 破坏性新版本；不迁移 v0.2.0 的独立关系字段 |
| `meta.initialized` | boolean/false | 确定性开场 bridge | 模型、开场页 | 首个 assistant 楼层写入并复读成功后置 true，不回退 |
| `meta.opening_committed` | boolean/false | 确定性开场 bridge | 开场页 | 防重复提交；失败时保持 false；不同资料禁止静默覆盖 |
| `environment` | 日期、时段、季节、天气 | 模型 | 模型、庭园页 | 时段按固定环推进；季节日限制 1–30 |
| `player` | 身份与当前位置 | 确定性开场 bridge、模型 | 模型、庭园交互 | 草稿编辑不写入；确认时只覆盖身份字段；位置不生成地图玩家小人 |
| `garden` | 庭园名、建设阶段、锚点引用 | 确定性开场 bridge、本地事件结算；模型仅可更新不承担前置的既有开放语义 | 模型、庭园页 | 开场只覆盖名称；临时锚点最多 2 个；引用必须存在 |
| `resources` | 物资 0–20、灵感 0–10、金币 0–99999 | 本地副本奖励、商店事务 | 模型、资源显示、商店 | 旧存档缺失金币时迁移补 0；不得从正文猜余额 |
| `areas.{id}` | 固定/动态区域记录 | bridge/迁移器负责创建和登记推进；模型仅可更新既有非托管开放语义 | 模型、地图 | 固定 ID 不改名；删除前解除设施引用 |
| `facilities.{id}` | 设施状态与形态 | 本地设施/事件结算；模型仅可更新既有非托管开放语义 | 模型、地图、事件 | 主设施每区一个；形态列表去重由桥接校验 |
| `characters.{id}` | 角色稳定档案 | bridge/迁移器负责创建 | 模型、地图、数据库归档 | 固定八人永久保留；模型不得创建 UID、新角色或退役的关系字段 |
| `presence_snapshot` | 本轮在场和动作快照 | bridge（消费额外模型的冻结语义任务；固定事件按登记的 `presence_transition` 本地迁移） | 地图、模型 | 额外模型不直写快照；越权、未知区域、基线漂移或不确定判断均保持原值；玩家不得进入角色视图 |
| `interaction.current_session` | null 或单一会话 | bridge 创建/关闭/结算；额外变量模型只可更新既有普通会话的 `focus`/`summary` | 模型、剧情页 | 同时仅一个；模型不得替换父对象绕过所有权 |
| `interaction.visit_summary_task` | null 或 `visit-summary-task.v1` 请求期暂存任务 | bridge 创建/绑定/清除；额外变量模型只写既有 `slots.*.summary` | VisitTurn commit | request、槽位角色、顺序与数量归 bridge；成功提交后同次写盘清为 null；不作为长期记忆投影 |
| `interaction.presence_analysis_task` | null 或 `presence-analysis-task.v1` 请求期暂存任务 | bridge 创建/绑定/清除；额外变量模型只写既有槽位的判断叶字段 | presence commit | 仅覆盖请求开始时已在场的相关角色；本地变化优先；消费后同次清为 null；到访仍由本地调度、邀请或固定事件负责 |
| `interaction.current_session.effective_rounds` | integer/0 | bridge | 温室多轮会话门槛 | 仅完整且有效的新 assistant 回复递增；停止、失败、Swipe、重放与同消息 ID 不计数 |
| `interaction.settled_ids` | 最多 64 个交互结算 ID | bridge | 模型、GAL 幂等检查 | 只追加已复读成功的会话结算；重复 ID 禁止再次结算 |
| `interaction.conversation_log` | 最多 24 条短摘要，每条 ≤120 字 | **无（B2-T11 退役：不再由任何变量规则写入）** | **无（不再投影到模型；仅作 legacy migration source）** | 只保留旧存档迁移能力：FIFO 保留尾 24 条、不清空、字符串兜底；新剧情记忆由 `visit_memory` + synthetic history 承担 |
| `interaction.starter_gift_claimed` | boolean，默认 false | 本地桥接（设置区新人礼包） | 设置页、本地结算 | 每个聊天档案只可领取一次；领取后置 true，随 stat_data 持久化；不参与模型投影 |
| `events.active_event` | null 或正式事件 | bridge/事件注册结算；模型仅可更新已存在非托管事件的开放摘要 | 模型、剧情页 | 同时仅一个；模型不得创建事件 UID 或推进登记事件完成态 |
| `events.waiting_events` | 最多 3 个旧式等待事件 | bridge/迁移器 | 调度器、模型 | 只保留旧存档兼容；新系统使用 `pending_tasks` |
| `events.recent_results` | 最多 8 条短摘要 | bridge/迁移器；模型仅可写非托管开放结果 | 模型、数据库归档 | FIFO；关键结果另存永久标记 |
| `events.settled_ids` | 最多 256 个正式事件结算 ID | bridge | 本地事件恢复与幂等检查 | 每个真实 assistant 楼层的受控结算只追加一次；FIFO，额外变量模型禁写 |
| `anchors.stable` | 锚点字典 | bridge/登记事件 | 地图、剧情 | 同时只有一个 `garden.primary_anchor_id`；模型不得创建 UID |
| `anchors.temporary` | 锚点字典 | bridge/登记事件 | 地图、剧情 | 最多 2 个；到期生成可解释结果后移除；模型不得创建 UID |
| `battle.current` | null 或待结算结果 | 战斗 bridge | 模型、战斗页 | JSON 白名单校验；结算后写 settled_ids 并清空 |
| `battle.settled_ids` | 最多 64 个 ID | bridge | 幂等校验 | 重复 ID 拒绝二次结算 |
| `battle.dungeon_unlocked` | boolean/false | 妖花核心本地结算、迁移器 | 副本入口 | 教学战完成后永久为 true |
| `battle.run_count` / `last_run` / `rewarded_ids` | 副本次数、最近结果、最多 256 个奖励 ID | 本地副本事务 | 顶栏、结果页、幂等校验 | 每个 ID 只能奖励并推进时段一次；FIFO 清理 |
| `shop` | 解锁、最多 256 个购买 ID、最多 128 个静态对话 ID | 本地商店事务、迁移器 | 小店入口与视图 | 妖花核心完成后解锁；未知商品和重复 ID 拒绝 |
| `inventory.consumables` | 消耗品 ID 到 0..99 数量 | 本地商店与道具事务 | 小店、背包、道具使用 | 购买与使用原子增减；异变卡失败时不消费；玩家不能自建 item ID |
| `inventory.card_runtime.settled_use_ids` | 最多 256 个卡片使用 ID | 本地卡片事务、迁移器 | 卡片幂等校验 | 只追加已复读成功的机遇卡／对战卡使用；去重并 FIFO 裁剪 |
| `inventory.card_runtime.opportunity` | null pending + 最近一次使用结果 | 本地机遇卡事务、迁移器 | 机遇卡恢复与结果提示 | 失败整笔回滚；成功到场后清空 pending；模型禁写 |
| `inventory.card_runtime.duel.zako_tag_count` | integer/0，范围 0..99 | 本地对战卡结算、迁移器 | 对战难度派生、背包与结果提示 | 失败 +1、胜利 -1 且不越界；0 枚为极难、1–2 枚为标准、3 枚起为援助 |
| `inventory.card_runtime.duel.pending_battle` | null 或唯一对战卡战斗预留 | 本地对战卡事务、迁移器 | 战斗入口、可信结果校验与刷新恢复 | 开战前锁定目标/配置/`hard-standard-assisted` 难度；取消不扣卡并清空；非法旧值迁移清理 |
| `inventory.card_runtime.duel.settled_result_ids` | 最多 256 个对战卡结果 ID | 本地对战卡结算、迁移器 | 结果幂等校验 | 不复用副本奖励 ID；去重并 FIFO 裁剪 |
| `inventory.card_runtime.duel.pending_victory_dialogue` | null 或唯一胜利要求事务 | 本地对战卡结算与胜利消息事务 | 胜利要求 UI、最小剧情投影 | 只有胜利创建；要求提交后正文与事务 ID 锁定为 generating；完整 assistant 回复及变量阶段结束后清空；刷新可按真实 user 消息恢复；失败只重试对话，不重复结算战斗 |
| `key_items` | 关键物品字典 | 确定性开场与本地道具 bridge、迁移器 | 模型、UI | 开场只确认庭守钥取得与苏醒；变量模型禁写 |
| `key_items.sakuya_watch` | 获得、日冷却、累计使用、最近地点/时段、时间痕迹、察觉者、时停激活态与真实毫秒到期时间 | 本地商店、怀表使用/自动到期与迁移器 | 顶栏倒计时、小店、背包、登记事件投影 | 每日最多一次；时停最多 5 分钟；主动/自动解除均保留当日冷却且不推进时段；跨正式时段也会解除；不缩短 12/24/28 派生计时 |
| `anomaly_cycle.pending_activation` | null 或预留启用事务 | bridge 异变预留 | 启用调用、背包 | 成功提交或取消后置空；失败不扣卡；旧存档默认 null |
| `anomaly_cycle.active` | null 或唯一活动异变 | bridge 异变事务 | UI、剧情投影、时间规则 | 同时仅一个；28 标准时段后收束；模型不可改写规则/源头/期限 |
| `anomaly_cycle.active.hidden_origin` | 隐藏源头对象 | 本地确定性异变事务 | 每日调查、最终收束 | 使用卡片时按事务种子生成并锁定；普通剧情与普通 UI 不可见 |
| `anomaly_cycle.history` | 最多 8 条摘要 | bridge | 历史 UI | FIFO；不保存完整七日正文 |
| `visit_scheduler` | 计划、冷却、通知 | bridge 来访调度器 | UI、时间规则、邀请 | 旧计划失效移除；刷新/Swipe 不重抽 |
| `presence_snapshot.visitor_meta` | 在场访客生命周期元数据 | bridge | 离场调度、到访说明 | 与在场白名单同步；离场删除 |
| `facility_runtime.{id}` | 后续三设施建造/解锁/风险/事务 | 本地设施规则 | 机会面板、设施行动 | 与 `facilities.{id}` 同步 current_form；模型禁写 |
| `garden_projects.active_construction` | null 或唯一大型施工 | 本地建造事务 | 建造入口 | 同时最多一个 |
| `garden_activities` | 温泉会话、宴会计划/活动与最多 8 条宴会摘要 | 本地活动规则 | 来访上限、场景收尾、宴会入口 | 到时先生成待办；玩家进入或四时段后默认举行并清理 |
| `pending_tasks` | 最多 8 个到期待办，默认 `[]` | 本地调度器与白名单命令 | 庭院待办面板 | `(kind, source_id)` 唯一；异变/宴会到期创建，点击或四时段自动处理后删除；模型禁写 |
| `scene_item_context` | null 或最多 3 种场景道具 | bridge 场景道具事务 | 提示上下文、收尾 | 完整收尾成功后清空；修缮包不进入 |
| `ui_flags.graduation_acknowledged` | boolean/false | 本地 UI | 毕业说明 | 妖花核心完成后显示一次 |
| `abilities` | 最多 32 条事实解锁 | bridge/登记事件；模型仅可更新请求中已登记 ID 的开放描述 | 模型、战斗 | 必须记录剧情来源；不用等级/经验；模型不得创建 ID |
| `memory.long_term_notes` | 最多 24 条短事实 | 模型 | 条件投影、数据库归档 | 不存流水账；相近内容合并 |
| `uid_counters` | 正整数计数器 | bridge | 实体创建器 | 额外变量模型不得猜测计数器；动态实体创建须先经本地分配器 |

## 关键对象约束

- 交互会话：`uid`、`type`、`status`、`area_id`、参与者、关联设施/事件、开始时间、焦点、最后有效消息、有效轮数、600 字摘要、结算状态。
- 正式事件：稳定 `config_id` 与实例 `uid` 分离；保存状态、优先级、参与者、关联设施、期限和摘要。
- 战斗结果：只接受预登记 `config_id`；`settlement_id` 是一次性结算键。
- 到期待办：`task_id`、`kind`、`status`、创建/到期/自动处理绝对时段、`source_id`、标签与最小 payload；不保存剧情正文。

## 未知字段策略

正式对象通常使用 passthrough；但 v0.3.0 明确删除的 `current_relationship_facts`、`relationship_memories`、`relationship_facts_fingerprint` 与 `uid_counters.relationship_fact` 会在 schema 阶段丢弃，不提供旧档迁移。其他未知字段仍保留。

---

# GAL 角色记忆模型 v2

> 当前模型标识：
>
>     modelId: gensokyo-character-memory
>     modelVersion: character-visit-memory.v2
>     storage.root: stat_data.interaction.visit_memory
>     storage.scope: message
>     storage.strategy: multi-floor
>
> 同层兼容不声称、不新增，标记 DBR-C8-UNVERIFIED。数据库本批完全不接。
> chat metadata / localStorage / sessionStorage 不得保存正式记忆。
> v0.3.0 只维护每角色剧情梗概；独立关系事实与关系记忆已删除且不迁移。

## 集中容量常量

| 常量 | 值 | 说明 |
|---|---|---|
| STORY_SUMMARIES_PER_CHARACTER | 60 | 每角色剧情梗概总计（active+closed 全部 turn）；关系变化也记录在这里 |
| ACTIVE_TURNS_PER_CHARACTER | 16 | active_visit 单次最多 turn |
| CLOSED_VISITS_PER_CHARACTER | 4 | 每角色保留最近 closed visit 数 |
| TURNS_PER_CLOSED_VISIT | 16 | 每个 closed visit 结构上限 turn 数 |
| LEGACY_MEMORIES_PER_CHARACTER | 16 | 每角色 legacy story 条数（不计入 60） |
| LEGACY_UNASSIGNED_LIMIT | 24 | legacy_unassigned 条数 |
| TURN_SUMMARY_CHARS | 100 | turn summary 字符上限；允许简短但必须语义完整 |

## 根结构：interaction.visit_memory

| 路径 | 类型/默认值 | 写入者 | 读取者/渲染者 | 清理与迁移 |
|---|---|---|---|---|
| `interaction.visit_memory.version` | 字面量 `character-visit-memory.v2` | schema | schema、投影器 | v2 为 60 条单轨剧情记忆 |
| `interaction.visit_memory.by_character` | Record<CharacterId, CharacterMemory>，动态字典 | bootstrap、presence reconciliation、VisitTurn commit | 投影器 | 每角色独立；固定角色初始空结构；动态角色懒创建；每角色剧情梗概总计 60 |
| `interaction.visit_memory.legacy_unassigned` | LegacyMemory[]，上限 24 | deterministic migration（conversation_log） | 只读（本批不投影） | 未知角色/无前缀/空正文进入；稳定 legacy_id 去重；FIFO 裁剪 |
| `interaction.visit_memory.migration` | migration 元数据对象 | deterministic migration | 迁移器 | 见下方 migration 元数据 |
| `uid_counters.character_visit` | integer，初始 ≥1 | Bridge/domain helper（nextCharacterVisitId） | visit_id 分配 | 单调递增、左补零；禁止数组下标当 ID |

## CharacterMemory

| 字段 | 类型/默认值 | 写入者 | 说明 |
|---|---|---|---|
| `character_id` | string | migration/ensure | 必须等于 characters 外层 key |
| `active_visit` | VisitRecord \| null | presence reconciliation | 初始/关闭后为 null |
| `closed_visits` | VisitRecord[]，上限 4 | presence reconciliation | 关闭时压入；裁剪保留最近 |
| `legacy_memories` | LegacyMemory[]，上限 16 | deterministic migration | 迁入的旧 conversation_log 条目 |

## VisitRecord

| 字段 | 类型/默认值 | 写入者 | 说明 |
|---|---|---|---|
| `visit_id` | string，`character_visit_` + 左补零单调 counter | Bridge/domain helper | 稳定 ID，禁止下标/随机/现实时间 |
| `character_id` | string | reconciliation | 与 CharacterMemory 一致 |
| `source` | `scheduler\|event\|model-presence\|bootstrap\|reconcile` | reconciliation | cause 映射固定 |
| `arrival_uid` | string \| null | reconciliation（从 visitor_meta 捕获） | 缺失时 null |
| `started_day` | number\|string\|null | reconciliation（游戏时钟） | 无可靠时间时为 null |
| `started_time_period` | string\|null | reconciliation | 同上 |
| `started_period_serial` | number\|null | reconciliation（periodSerialFromState） | 同上 |
| `ended_day` | number\|string\|null | reconciliation | 关闭时填 |
| `ended_time_period` | string\|null | reconciliation | 关闭时填 |
| `ended_period_serial` | number\|null | reconciliation | 关闭时填 |
| `end_reason` | `null\|scheduled-departure\|presence-receipt\|event-leave\|reconcile` | reconciliation | 关闭时填 |
| `turns` | VisitTurn[]，active 上限 16 | 额外变量模型填写语义梗概；bridge settlement 校验冻结任务并精确 upsert | 关闭后随 visit 进入 closed_visits |

## VisitTurn

| 字段 | 类型/默认值 | 写入者 | 说明 |
|---|---|---|---|
| `turn_id` | string = `request_id + ':' + character_id` | bridge settlement（T10 纯构造器） | 逻辑身份；重试/重生成按此覆盖 |
| `character_id` | string | bridge settlement | 与 visit 一致 |
| `day` | number\|string\|null | Bridge 盖章 | 不用现实时间 |
| `time_period` | string\|null | Bridge 盖章 | 同上 |
| `summary` | 非空 string，≤100 字符 | 额外变量模型填写、bridge 校验 | 角色对应的玩家行动、回应、结果及明确关系变化；不从正文机械截取、不推测未来 |

VisitTurn 不再复制 request、attempt、commit、assistant message、swipe、scene 或 period serial。精确事务身份只保留在提交生命周期与 `RegenerationCommitReceiptV1` 中，不进入长期召回记录。

## RegenerationCommitReceiptV1（MvuData 内嵌）

持久键：`gal_regeneration_receipt_v1`。该键随目标 swipe 的 `swipes_data[candidate]` 一次性提交；fingerprint 计算时排除自身，避免自引用。

| 字段 | 类型 | 写入者 | 说明 |
|---|---|---|---|
| `schema` | `gal-regeneration-commit-receipt.v1` | send finalizer / regeneration replay | 固定版本 |
| `requestId` / `attemptId` / `commitKey` | string | 同上 | 精确事务身份 |
| `assistantMessageId` / `assistantSwipeId` | number | 同上 | 精确目标楼层与 swipe |
| `baselineDataFingerprint` | string | replay/finalizer | 冻结基线 hash，不存正文 |
| `modelAppliedDataFingerprint` | string | replay/finalizer | MVU parser 输出 hash |
| `finalizedDataFingerprint` | string | replay/finalizer | 本地结算、presence、VisitTurn、lifecycle 后 hash；用于拒绝后置漂移 |
| `settlementKeys` | string[] | replay/finalizer | 排序去重；首版正常发送为 `[]` |

旧 V2 swipe 若没有此 receipt，策略为 fail closed（`legacy-replay-mismatch`），不静默回滚后置购买、卡片操作或未知状态。

## LegacyMemory

| 字段 | 类型/默认值 | 写入者 | 说明 |
|---|---|---|---|
| `legacy_id` | string | deterministic migration | 基于角色 + 规范化文本稳定 hash；禁止 Date.now/random |
| `character_id` | string \| null | migration | 已知角色则填；未知/无前缀为 null（进 unassigned） |
| `text` | string | migration | 规范化文本 |
| `source` | 字面量 `conversation_log.v0` | migration | 固定标记 |

## migration 元数据（interaction.visit_memory.migration）

| 字段 | 说明 |
|---|---|
| `revision` | 当前迁移 revision（非 boolean 开关；revision 不是“永远跳过导入”） |
| `conversation_log_fingerprint` | conversation_log 规范化源 fingerprint（仅判断输入是否变化/诊断，不代替记录级 upsert） |
| `migrated_at_serial` | 迁移运行时的游戏 period serial（诊断用，非 ID 来源） |

规则：
- 迁移可重复；旧源新增项可增量导入，不重复追加；
- fingerprint 只用于判断输入变化或记录诊断，不能代替记录级 upsert；
- v0.3.0 不迁移任何独立关系字段。

## 入场边界（冻结语义）

- absent → present：打开新 visit（新 visit_id）；
- present → absent：关闭 active visit（填结束字段后压入 closed_visits）；
- present → present：不变（area/view 变化不离场）；
- absent → absent：不变；
- 关闭 GAL（endConversationLocal）：不离场，active_visit 不变；
- 送别离开庭园（dismissCharacter）：本地从 presence 删除角色、关闭 active_visit、取消该角色旧排期并设置短冷却；不调用模型；
- 同事务 leave 再 arrive：两个不同 visit_id（先关后开）。

## 写入权（第一批）

| 字段 | 写入者 |
|---|---|
| visit ID/counter | Bridge/domain helper（nextCharacterVisitId） |
| active/closed visit 生命周期 | presence reconciliation（reconcileCharacterVisits） |
| 迁入的 legacy story | deterministic migration（migrateGardenState 内） |
| 新 VisitTurn | 额外变量模型写 request-scoped 梗概候选；bridge 校验冻结角色槽位并按 visit map 精确 upsert |

conversation_log（B2-T11 已退役）不再由任何变量规则写入、不再投影；关系变化与普通剧情统一写入 VisitTurn。

## 裁剪规则（冻结）

剧情梗概 60 条（每角色；内部记录类型为 VisitTurn）：
1. active_visit turns 保留最近 16；
2. closed_visits 保留最近 4 个 visit；
3. 每个 closed visit turns 保留最近 16；
4. active + closed 全部 turn 若超 60：保留 active 最近 turn，从最新 closed visit 向更旧填充剩余额度，删更旧 turn；
5. 删除 turn 后 closed visit 可留空，但不得删除 visit 边界记录；
6. 同 turn_id 去重保留后出现/更新版本；无 turn_id 的 malformed 项不得编造随机 ID。
