# GAL 角色入场记忆与合成历史重构计划

> 状态：四批静态实施与返修均已完成并封账；最终数据库共存裁定以 `gal-character-memory-batch-4-database-coexistence-replan.md` 为准
> 范围：GAL 发送、历史投影、角色离场/再次入场、每角色剧情记忆、每角色关系记忆、数据库增强版、重生成一致性
> 本总计划不直接授权：卡片打包、R2 发布、实机探针、提示词体系全面重写；代码修改只按已经单独批准的分批施工单实施
> 目标运行时依据：SillyTavern 1.18.0 + Tavern Helper / JS-Slash-Runner 4.8.18

> 分批入口：第一批数据基础、第二批发送与合成历史、第三批重生成、第四批双 profile／数据库共存均有独立 runbook 与实施日志；本总计划只保留总合同，冲突时以后批最终裁定和较新的封账记录为准。

---

## 0. 给实施 agent 的一句话任务

不要再把 SillyTavern 的真实聊天楼层直接喂给 GAL 模型。

真实楼层继续保留，供界面显示、MVU 状态承载、滑动与恢复使用；模型可见的聊天历史必须改为从结构化角色入场记忆中生成的合成系统消息，并且严格区分：

- 上次入场：已经离场的过去经历，只能作为背景记忆；
- 本次入场：当前仍在进行的在场经历，可以维持当前场景连续性；
- 真实旧楼层：不得进入模型请求，不得作为历史消息兜底。

角色关闭一次 GAL 对话不等于离场。只有角色在场集合发生 present → absent 才结束一次入场；此后再次发生 absent → present 才开始新的入场。

---

## 1. 本计划解决什么

当前 GAL 生成会从活动消息列表构造 chat_history，历史 user/assistant 楼层仍可能直接进入模型上下文，导致：

1. 角色离场后再次入场，模型继续上次离场前的动作、位置或未完对话；
2. 旧楼层混有 UI 协议、旧状态和已经失效的现场信息；
3. interaction.conversation_log 只是带角色前缀的字符串数组，不能表达一次入场的开始、结束和归属；
4. 发送与重生成采用不同装配路径时，同一个请求上下文不一致。

重构后分成四层：

| 层次 | 用途 | 是否给模型 |
|---|---|---|
| SillyTavern 真实消息楼层 | 展示、滑动、恢复、MVU 楼层状态 | 否 |
| 每角色 MVU 记忆库 | 分别保存剧情梗概与关系记忆 | 不直接给 |
| 可选数据库归档 | 数据库增强版归档溢出记忆并按角色召回 | 不直接给 |
| 合成历史投影 | 从入场记忆裁剪出的只读提示 | 是 |
| 当前输入与动态注入 | 本轮输入、协议、现场事实和授权 | 是 |

---

## 2. 已冻结的产品语义

### 2.1 一次入场的边界

- absent → present：创建新的 active_visit；
- present → present：仍是同一次入场，包括换地点、换视图、打开或关闭 GAL；
- present → absent：关闭 active_visit，转入 closed_visits；
- absent → absent：不产生记录；
- 同一事务中先离场再入场：先关闭旧入场，再创建新入场，两个 visit_id 必须不同。

因此：

- 结束对话只结束 interaction.current_session，不结束角色入场；
- sceneId 是交互/场景标识，不是入场标识；
- arrival_uid 可作来源证据，但不替代本系统 visit_id；
- “昨天/今天”来自游戏日和时段，不依赖现实时间，也不作为唯一边界。

### 2.2 上次入场与本次入场

- 本次入场 = 当前角色的 active_visit；
- 上次入场 = closed_visits 中结束时间最新的一条；
- 更早经历可以保留，但默认只投影最近两次已结束入场；
- 没有可靠时间的旧数据不得伪造昨天或今天，只标为旧版遗留记忆。

### 2.3 过去剧情不得续接

上次入场只能提供人物记忆和已发生事实，不能授权模型延续：

- 旧地点；
- 旧站位、姿势或动作进行态；
- 已中断的台词；
- 上次离场前尚未完成的即时意图；
- 已失效的临时物品、事件授权或当前目标。

当前在场状态、当前场景事实和本次入场记录永远高于过去入场记忆。

### 2.4 “完全不输出真实旧楼层”的含义

- 不把真实旧 user/assistant 楼层放进 overrides.chat_history.prompts；
- 不通过字符串拼接把它们塞回 user_input；
- 合成历史为空时也不得回退到默认真实历史；
- 不删除宿主中的真实消息，不破坏 UI、滑动和 MVU 状态。

---

## 3. 当前实现基线

### 3.1 角色卡与依赖

| 项目 | 当前结论 | 实施影响 |
|---|---|---|
| 主卡类型 | MVU Zod | 新状态进入现有 schema 与楼层迁移链 |
| 宿主 | SillyTavern 1.18.0 | 真实消息仍由宿主管理 |
| Helper | Tavern Helper 4.8.18 | generate、injects、overrides 以该版本源码为准 |
| 远程依赖 | 固定提交 mvu_zod.js 与 R2 UI | 本计划不调整加载策略 |
| 额外模型 | 变量更新模型 | 不让它拥有入场生命周期与 ID |
| 开发依赖 | Node、esbuild、测试脚本 | 只用于构建和静态验证 |

### 3.2 当前 conversation_log 的局限

当前 interaction.conversation_log：

- 全角色共享 string 数组；
- 以“角色ID: 一句话摘要”区分；
- 总量最多 24 条；
- 提示投影时按当前在场角色过滤并取最后 6 条；
- 结束对话不会清除。

它只能表达最近发生过什么，不能表达发生在哪一次入场，不能继续作为最终权威历史。

### 3.3 当前提示链路与目标链路

当前大致为：

1. UI 构造 modelUserInput；
2. withGardenNarrativeContract 把动态协议和状态拼入用户输入；
3. buildChatHistoryForGenerate 从真实活动楼层生成历史；
4. Bridge 调 Helper generate；
5. 新发送与原生重生成走不同路径。

目标必须变为：

1. user_input 只保留玩家可见原文；
2. 动态规则统一放进一个 system inject；
3. chat_history 只接收角色入场记忆生成的 system 合成历史；
4. 发送、重试、恢复和重生成使用同一请求装配器。

---

## 4. 目标数据模型

### 4.1 总体结构

在 interaction 下新增版本化字段：

    interaction: {
      visit_memory: {
        version: 'character-visit-memory.v1',
        by_character: Record<CharacterId, CharacterMemory>,
        legacy_unassigned: LegacyMemory[],
        migration: {
          legacy_conversation_log_migrated: boolean,
          migration_revision: string
        }
      }
    }

在现有计数器体系新增：

    uid_counters.character_visit: number

visit_id 由 Bridge 单调分配，例如 character_visit_000001。禁止使用数组下标作为稳定 ID。

### 4.2 每个角色一份独立 MVU 库

    CharacterMemory {
      character_id: string
      active_visit: VisitRecord | null
      closed_visits: VisitRecord[]
      legacy_memories: LegacyMemory[]
      relationship_memories: RelationshipMemory[]
    }

by_character 是真正的按角色分库。灵梦、魔理沙等角色不再争抢一个全局 24 条数组；新增角色也只创建自己的记录。

每角色的剧情梗概上限独立计算为 48 条。48 指该角色 active_visit 与 closed_visits 中所有 VisitTurn 的合计，不是全角色共享 48 条。

### 4.3 VisitRecord

    VisitRecord {
      visit_id: string
      character_id: string
      source: scheduler | event | model-presence | bootstrap | reconcile
      arrival_uid: string | null

      started_day: number | string | null
      started_time_period: string | null
      started_period_serial: number | null

      ended_day: number | string | null
      ended_time_period: string | null
      ended_period_serial: number | null
      end_reason:
        null | scheduled-departure | presence-receipt | event-leave | reconcile

      turns: VisitTurn[]
    }

第一版不让模型另写 visit_summary。关闭入场后，由投影器从 turns 确定性裁剪和拼接，避免第二个摘要写入者。

### 4.4 VisitTurn

    VisitTurn {
      turn_id: string
      request_id: string
      character_id: string
      scene_id: string | null
      assistant_message_id: number | null
      assistant_swipe_id: number | null
      latest_attempt_id: string | null
      latest_commit_key: string | null
      day: number | string | null
      time_period: string | null
      period_serial: number | null
      summary: string
    }

逻辑 ID：

    turn_id = request_id + ':' + character_id

同一请求重试或重生成时按 turn_id 覆盖，不追加重复项。attempt_id 和 commit_key 只审计最新提交，不决定逻辑身份。

### 4.5 LegacyMemory

    LegacyMemory {
      legacy_id: string
      character_id: string | null
      text: string
      source: conversation_log.v0
    }

遗留项没有可靠入场边界、日期或 request ID，不得硬塞进 VisitRecord，也不得伪造时间。

### 4.6 RelationshipMemory：每角色 12 条关系记忆

这 12 条不是“成人亲密行为记录额度”，而是每个角色独立的完整关系记忆库。它既记录当前关系是什么，也记录为什么会变成这样。

    RelationshipMemory {
      relationship_memory_id: string
      character_id: string
      request_id: string
      visit_id: string | null
      day: number | string | null
      time_period: string | null
      period_serial: number | null
      kind:
        relationship_state | milestone | boundary |
        conflict | reconciliation
      relationship_label:
        stranger | acquaintance | friend | close_friend |
        lover | estranged | null
      event_kind:
        trust | affection | confession | kiss | adult_intimacy |
        promise | breakup | null
      summary: string
      significance: 1 | 2 | 3
      active: boolean
      latest_attempt_id: string | null
      latest_commit_key: string | null
    }

用途：

- 记录当前关系定义，例如陌生、认识、朋友、挚友、恋人或疏远；
- 记录造成关系变化的关键事实；
- 例如“第 12 日，角色与玩家明确接吻”“第 18 日，双方发生成人亲密行为”“第 21 日，角色明确拒绝某项越界要求”“第 25 日，双方在争执后和解”；
- 让模型知道关系已经发展到哪里，避免后期仍机械退回陌生或冷淡状态；
- 同一角色最多只有一条 active 的 relationship_state；里程碑和冲突记录解释这条状态的依据。

硬约束：

- 只记录已接受正文明确发生的事件，不记录玩家单方面声称、幻想、未遂动作或模型猜测；
- 成人亲密只写关系层面的中性梗概，不保存露骨动作流水账；
- 接吻或成人亲密不自动等于恋爱、专一、永久同意或未来行为授权；
- 只有正文明确建立或双方明确承认关系时，才能把 relationship_label 改成 friend、lover 等状态；
- boundary、conflict、breakup 与 reconciliation 同样是关系记忆，不能只记甜蜜事件；
- 同一 requestId + characterId + kind + event_kind 为同一逻辑候选，重试/重生成时 upsert；
- 日期由 Bridge 从正式游戏时钟盖章，LLM 不拥有日期、ID 和幂等键；
- 每角色最多 12 条；优先保留 significance 3，再保留较新的记录；
- 被新事实明确推翻的旧关系状态应标记或替换，不能让冲突事实同时投影。

现有 characters.{id}.current_relationship_facts 不得与新关系库永久并存为双权威。迁移策略：

1. 将现有 active 关系事实确定性迁入该角色 relationship_memories；
2. 无法判断朋友/恋人标签的事实按 milestone 保存，不强行分类；
3. 新 relationship_state 生效时，将旧 state 标为 inactive，而非删除历史；
4. 一个兼容周期内保留旧字段只读；
5. 所有投影改为只读新关系库后，再单独移除旧写入协议。

### 4.7 容量与预算

集中定义一份常量：

    storySummariesPerCharacter: 48
    activeTurnsPerCharacter: 16
    closedVisitsPerCharacter: 4
    turnsPerClosedVisitStored: 16
    legacyMemoriesPerCharacter: 16
    relationshipMemoriesPerCharacter: 12
    turnSummaryChars: 160
    relationshipSummaryChars: 160
    projectedCurrentTurns: 6
    projectedClosedVisits: 2
    projectedRelationshipMemories: 6
    projectedCharsPerCharacter: 900
    projectedCharsGlobal: 2800

规则：

- 状态保存上限与提示投影上限分开；
- 每角色剧情梗概总计最多 48 条，角色之间互不挤占；
- active_visit 单次最多保留最近 16 回合；
- 每角色保留最近 4 次 closed visit；
- 每个 closed visit 单次最多 16 条，但所有 active/closed 条目仍受该角色总计 48 条硬上限；
- 每角色关系记忆最多 12 条，与剧情梗概的 48 条额度分开；
- 提示默认只投影当前 6 回合与最近 2 次 closed visit；
- 关系提示先投影当前 active relationship_state，再投影最多 5 条相关事件；
- 超预算时先删更早的过去入场，再删本次入场的最旧回合；
- 当前输入、动态规则、本次入场最新回合不能因历史预算被裁掉。

48 × 每角色会显著放大每个 MVU 消息楼层携带的 stat_data。实施时必须增加状态体积基线和多楼层增长测试；达到停止线时优化字段名、摘要长度或投影，不得偷偷把每角色 48 改回全局共享。

### 4.8 两个发布版本，一个数据契约

本计划定义两个发布配置，但禁止维护两套业务代码。

#### standalone-mvu：不启用数据库版

- 建议显示名：幻想乡物语－独立 MVU 版；
- 构建产物不主动探测、不调用 AutoCardUpdaterAPI；
- 每个角色在 MVU 中独立保存最多 48 条剧情梗概；
- 每个角色另存最多 12 条关系记忆，包括关系状态与关键事件；
- 入场切分、投影、迁移、发送和重生成全部只依赖 stat_data；
- 不启用数据库也不降低核心记忆能力。

#### database-assisted：SP·数据库 VII 增强版

- 建议显示名：幻想乡物语－数据库增强版；
- MVU 使用与独立版逐字节相同的每角色 48 条剧情梗概 + 12 条关系记忆；
- synthetic history、hash、request 与 config fingerprint 均不得因 profile 改变；
- 不主动归档、查询、合并或裁剪数据库记忆；
- SP·数据库若已安装，可在宿主层独立执行填表、剧情推进和世界书召回；
- 数据库不可用、关闭或失败不改变本卡 frozen request，也不触发历史切换；
- 数据库外部文本不能覆盖 active visit、presence、当前关系事实或其他正式状态。

两个版本必须从同一源码和同一 schema 生成，只允许以下差异：

- build profile；
- standalone 是否彻底移除数据库桥；
- database-assisted 是否保留宿主共存桥；
- 诊断文案与插件可见性 UI。

不得复制一份 standalone 分支再手工维护 database 分支。

存档兼容：

- 两版使用相同 MVU schema version；
- 两版切换时不迁移、不归档、不回填卡内记忆；
- 任一版本的 MVU 内均有相同 48 + 12，不依赖数据库继续；
- 数据库 rows、AM、世界书内容和诊断均不写入 stat_data；
- 构建 profile 属于发布元数据，不允许模型通过变量修改；
- 两个产物名称和目录必须明确分开，但都不占用正式版既有文件名，具体打包规则继续服从 R2 测试通道规划。

### 4.9 数据库逻辑表契约

> **R2 SUPERSEDED**：本节及其后续 archive key、upsert、召回查询设计只保留为历史研究，不再授权生产实现。database-assisted 不为本卡记忆创建逻辑表。新的有效合同见 `gal-character-memory-batch-4-database-coexistence-replan.md`。

数据库增强版至少需要两个逻辑表；物理中文表名与列名在实施 Phase 0 读取 SP·数据库 VII 当前源码/配置后锁定，规划阶段不凭猜测写死。

故事记忆逻辑表：

    memory_id
    character_id
    visit_id
    request_id
    day
    time_period
    period_serial
    summary
    source_revision
    content_hash

关系记忆逻辑表：

    relationship_memory_id
    character_id
    visit_id
    request_id
    kind
    relationship_label
    event_kind
    day
    time_period
    period_serial
    summary
    significance
    active
    source_revision
    content_hash

归档规则：

- 以稳定 ID 幂等 upsert，不能每次 UI 加载都 insert；
- 先提交 MVU，再 best-effort 归档数据库；
- 数据库写入状态另存于 UI 内存/诊断，不作为剧情事实；
- 召回时校验字段、角色 ID、长度和版本，拒绝未知结构；
- 同 ID 以 MVU 热记忆优先，数据库不得覆盖当前工作集；
- 查询只取本轮 relevant_character_ids，不扫全角色；
- 查询结果先按角色分组、去重和预算裁剪，再进入 synthetic history；
- 数据库全文不得直接拼进 prompt。

---

## 5. 字段所有权

| 数据 | 唯一写入者 | 其他模块 |
|---|---|---|
| visit_id / character_visit counter | Bridge | 只读 |
| active_visit 生命周期 | Bridge 在场协调器 | 只读 |
| closed_visits | Bridge 在场协调器 | 只读 |
| VisitTurn 与摘要 | Bridge 已接受回复提交器 | 只读 |
| 关系记忆候选语义 | 额外变量模型 | Bridge 只接受本轮候选 |
| RelationshipMemory 正式记录、日期和 ID | Bridge | 模型只读 |
| 入场开始/结束时间 | Bridge | 模型不得修改 |
| presence_snapshot | 维持现有 Bridge 规则 | 入场系统消费差异 |
| 关系、好感等变量 | 现有额外变量模型 | 入场系统只读 |

禁止额外变量模型直接写 visit_id、active_visit、closed_visits、turn_id、入场时间、来源与结束原因。

### 5.1 本地确定性回合摘要

第一版不增加摘要模型调用，也不继续让模型 append conversation_log。

摘要输入仅来自本轮已接受数据：

- 玩家可见原文；
- 最终接受的 assistant GAL 文本；
- 已解析的角色对白段；
- 本轮明确目标与显式参与角色；
- 当前游戏日、时段和 scene ID。

建议格式：

    玩家：<裁剪后的玩家意图>；<角色名>：<本轮关键回应>

规则：

- 去除协议标签、MVU 输出、隐藏控制块、HTML 和纯 UI 文本；
- 优先保存该角色自己的对白；
- 旁白只在角色为主目标或显式参与者时加入；
- 无法解析时用清洗后的 assistant 可见文本兜底；
- 最大 200 字符；
- 空回复、失败回复、未接受的停止结果不写；
- 不扫描正文角色名来猜参与者。

### 5.2 相关角色冻结

请求创建时生成 relevant_character_ids：

1. 当前 GAL 主目标；
2. 事件/操作显式参与者；
3. 多人场景构造器显式加入的参与者；
4. 无明确目标时，才从当前在场角色按稳定顺序选择，最多 4 人。

禁止因为正文提到某角色名字就自动激活该角色记忆。

无角色请求边界（第二批 T08 复核修订）：

- 只有入口明确要求主目标时，主目标缺失才失败；
- 独处设施剧情、无角色过渡或当前确实无人时，允许 `relevant_character_ids=[]`；
- 此时 `visitIdsByCharacter={}`，合成历史仍输出固定的非空 system 历史边界；
- 请求仍使用 V2 Helper generate，不得回退真实历史；
- 因没有角色归属，本轮不创建 VisitTurn；
- 不得用卡片 ownerCharacterId、设施 ID 或从玩家自然语言猜出的名字伪造相关角色。

### 5.3 关系记忆候选与正式提交

现有额外变量模型继续负责语义判断，但不能直接拥有正式里程碑。

建议在 interaction 下增加受控、短生命周期的 relationship_memory_candidates inbox。额外变量模型每轮最多提出 4 条：

    {
      character_id: 'reimu',
      kind: 'milestone',
      relationship_label: null,
      event_kind: 'kiss',
      summary: '双方在明确互动中接吻，关系距离有所改变',
      significance: 2
    }

候选不得包含 ID、日期、visit_id、request_id 或写入目标数组路径。Bridge 在同一事务中：

1. 只读取本轮变量阶段新产生的候选；
2. 校验 character_id 属于 relevant_character_ids；
3. 校验 kind、relationship_label、event_kind、长度和 significance；
4. 校验被接受的 assistant 正文中确实存在对应事件证据；
5. 用正式游戏时钟补 day、time_period、period_serial；
6. 用 requestId、characterId、kind、event_kind 生成稳定 relationship_memory_id；
7. upsert 到该角色 relationship_memories；
8. 清空 inbox 并回读最终 assistant 楼层。

如果 Bridge 未完成消费：

- candidate 不是正式关系事实；
- reload/recovery 只能在 requestId 与目标 assistant 楼层仍可核对时恢复消费；
- 无法绑定的孤儿候选应清除并记录诊断，不能自行归档。

模型不需要输出“第 XX 日”。最终投影由 Bridge 盖章后统一渲染日期。这样能避免模型把第 12 日写成第 21 日，嗯，日历不该交给一个正忙着写吻戏的家伙。

关系状态候选示例：

    {
      character_id: 'reimu',
      kind: 'relationship_state',
      relationship_label: 'lover',
      event_kind: null,
      summary: '双方在本轮明确确认恋人关系',
      significance: 3
    }

只有已接受正文明确确认关系时才能接受 relationship_state；“发生接吻”或“发生成人亲密行为”本身只能先成为 milestone，不能被 Bridge 自动升级为 lover。

关系去重/合并：

- 相同 requestId + characterId + kind + event_kind：覆盖；
- 重复的普通亲吻等低/中重要事件，不应每轮占一条；可以刷新最近确认时间或合并摘要；
- confession、adult_intimacy、breakup、reconciliation 等首次关键事件可独立保留；
- 新 conflict/boundary 不能被旧甜蜜记录抵消；
- active relationship_state 优先于旧关系事件，并在提示中明确“过去发生过”不等于“当前仍成立”。

---

## 6. 在场状态与入场生命周期

### 6.1 统一协调入口

新增纯函数或等价模块：

    reconcileCharacterVisitMemory({
      previousState,
      nextState,
      cause,
      clock
    }): NextState

它只比较前后 presence_snapshot.present_character_ids 的集合差异。

### 6.2 必须覆盖的生产路径

不得只修 applyPresenceUpdate。所有能改变在场集合的路径都要进入同一协调器：

- 模型 GensokyoPresence 回执；
- 本地事件到达/离开；
- 访客调度器到达；
- 访客调度器到期离开；
- 机会卡或特殊事件直接加入角色；
- 特殊物品/剧情分支导致的变化；
- 旧状态载入后的 reconcile；
- 测试工具只走测试适配层，不复制生产算法。

Phase 0 必须先搜索并列出全部 production 写点，有遗漏就停止。

### 6.3 到达

角色 absent → present 时：

1. 如异常残留 active_visit，先以 reconcile 原因关闭；
2. 分配新 visit_id；
3. 记录当前游戏日、时段和 period serial；
4. visitor_meta.arrival_uid 存在时保存为证据；
5. turns 为空；
6. 不复制上次地点、动作或未完台词。

### 6.4 离开

角色 present → absent 时：

1. 先把本轮告别/离场回复提交到当前 active_visit；
2. 写结束日、时段、serial 和原因；
3. 压入 closed_visits；
4. active_visit 置 null；
5. 按容量裁剪；
6. 不删除关系等长期变量。

### 6.5 一条 assistant 回复的结算顺序

1. 冻结生成前相关角色与 active visit；
2. 验证并接受 assistant 正文；
3. 按 request_id + character_id 写入或更新 VisitTurn；
4. 应用本轮 presence 变化；
5. 按差异关闭或打开 visit；
6. 执行调度器/时间推进并再次走协调器；
7. 与最终 MVU 状态一起持久化到目标 assistant 楼层；
8. 回读确认 request、turn、visit 与 presence 一致。

如果先关闭 visit 再写回合，告别内容会掉入错误的下一次入场，这是硬性错误。

---

## 7. 合成历史投影

### 7.1 输出形态

合成历史不是伪造 user/assistant 原话，而是明确标记的 system 历史块。

    【过去入场记忆｜博丽灵梦】
    以下来自已经结束的入场，只代表角色记得的过去。
    不得延续当时的地点、动作、姿势、未完台词或临时任务。

    - 第27日·下午至傍晚：玩家询问结界异动；灵梦答应之后检查。

    【本次入场记录｜博丽灵梦】
    以下属于角色当前这次在场，可用于维持本次场景连续性。
    当前在场状态与本轮场景事实优先。

    - 第28日·上午：玩家询问检查结果；灵梦说结界暂时稳定。

旧迁移内容单独标记：

    【旧版遗留记忆｜博丽灵梦】
    没有可靠入场和时间，只能作为模糊长期记忆，不得视为当前场景。

legacy_unassigned 默认不投影，避免泄漏给错误角色。

### 7.2 关系记忆投影

关系记忆不按入场结束而清除。每个相关角色的历史块在过去/本次入场之前，先加入一段精简关系上下文：

    【与玩家的当前关系｜博丽灵梦】
    当前明确关系：恋人
    关系依据：
    - 第12日：双方明确接吻。
    - 第18日：双方发生成人亲密行为，关系更亲近。
    - 第21日：灵梦明确拒绝在公开场合继续亲密举动，该边界当前有效。

投影规则：

- 最多一条 active relationship_state；
- 再选最多 5 条与当前状态最相关的 milestone、boundary、conflict 或 reconciliation；
- 优先保留有效边界、尚未和解的冲突和 significance 3 事件；
- 成人亲密事件用中性关系描述，不把露骨过程送回模型；
- 明确告诉模型：过去亲密不等于本轮同意，当前边界和当前输入优先；
- 没有 relationship_state 时不擅自输出“陌生人”，只投影确有证据的事实；
- 数据库召回项标记为“归档关系记忆”，其优先级低于 MVU 当前关系状态；
- 关系记忆跨 visit 有效，但不能拿来恢复旧地点、旧姿势或旧动作。

### 7.3 信息优先级

1. 当前动态规则与硬协议；
2. 当前 presence 和场景事实；
3. 当前 active relationship_state 与有效边界；
4. 当前玩家输入；
5. 本次入场记录；
6. 过去关系事件与过去入场记忆；
7. 旧版遗留记忆和数据库归档召回。

冲突时以当前状态为准。

### 7.4 稳定性

- 角色块按冻结的 relevant_character_ids 顺序；
- 每角色先过去、后本次；
- closed visit 从旧到新展示，裁剪保留最近项；
- 当前回合按 serial 与提交顺序；
- 相同状态生成字节稳定的投影，便于 hash、重试和测试。

### 7.5 无记忆时也不得传空数组

Helper 4.8.18 的内部数据处理对 overrides.chat_history 使用真假判断。空数组在部分前置处理中可能走回默认真实历史，哪怕后续聊天历史占位又被过滤。为了让真实楼层连世界书扫描等前置处理都无法参与，syntheticHistory 必须至少包含一条 system 边界消息。

没有任何可投影记忆时使用：

    【历史边界】
    本请求不读取 SillyTavern 真实聊天楼层；当前没有可投影的角色入场记忆。

因此：

- syntheticHistory 在最终 generate 配置中永不为空；
- 必须用非空 prompts 显式覆盖默认 chat history；
- 刚再次入场且没有新回合时，可输出空的本次边界说明；
- 绝不能把上次最后一条当成本次第一条。

---

## 8. 生成请求装配契约

### 8.1 请求对象

    GalGenerationRequestV2 {
      requestId
      attemptId
      sceneId
      visibleUserText
      userInput
      relevantCharacterIds
      visitIdsByCharacter
      syntheticHistory
      injectionContent
      promptRevision: gal-prompt.v2
      memoryRevision: character-visit-memory.v1
      contextFingerprint
    }

- visibleUserText：界面展示与审计；
- userInput：传给模型，玩家自由输入时必须等于可见原文；
- syntheticHistory：唯一允许的 chat history；
- injectionContent：动态行为契约与状态；
- visitIdsByCharacter：冻结本轮归属；
- fingerprint：覆盖输入、历史、注入、角色和 visit ID。

不要把完整历史/注入复制进 message.extra，只保存 revision、hash、request ID、相关角色、visit ID 和必要审计元数据。

### 8.2 Helper 4.8.18 目标配置

    generate({
      user_input: request.userInput,
      overrides: {
        chat_history: {
          with_depth_entries: false,
          prompts: request.syntheticHistory
        }
      },
      injects: [{
        role: 'system',
        position: 'in_chat',
        depth: 1,
        content: request.injectionContent,
        should_scan: false
      }]
    })

Helper 4.8.18 的 InjectionPrompt 不应假定有 order 字段。动态规则合并为一个 system 注入块，不依赖多个注入的隐式顺序。

with_depth_entries 设为 false，避免宿主深度条目混入受控历史段。未来如需深度世界书能力，必须在提示词注入专项中重新定义数据来源与扫描边界，不能静默打开。

### 8.3 动态注入内容

把当前 withGardenNarrativeContract 追加进 user input 的下列内容迁移到 system injection：

- 叙事输出协议；
- 当前在场角色；
- scene facts；
- 物品/事件授权；
- 角色 greenlight；
- 当前操作的结构化上下文。

本阶段只改变承载位置、边界和装配一致性，不顺手全面重写提示词文案。提示词楼层注入另开专项。

### 8.4 自动动作

按钮/系统动作没有玩家原句时：

- userInput 使用可读自然语言意图；
- 机器元数据放 system 注入；
- 不把 JSON、内部 ID 和协议伪装成玩家发言；
- UI 展示文本与实际输入的差异必须有明确分支与测试。

---

## 9. 发送、暂停、重试与重生成

### 9.1 发送

- 使用统一 buildGalGenerationRequestV2 创建不可变快照；
- 请求创建后，retry 不重新读取漂移中的实时状态；
- 成功提交后才写 VisitTurn；
- 失败、空回复、未接受中间流不写记忆；
- 同 requestId 每角色只有一个逻辑 turn。

### 9.2 暂停/停止

- stop 只终止 attempt，不结束角色入场；
- 是否接受已有正文沿用现有事务裁定，但只提交一次；
- 无可接受正文不写 turn；
- stop 后 retry 仍使用同一快照与 visit 归属；
- 不得因暂停清空 active_visit。

### 9.3 重试

- 同一逻辑请求 requestId 不变，attemptId 变化；
- 提交前 retry 不产生重复 turn；
- 提交成功但 UI 回执丢失时按 turn_id upsert；
- fingerprint 不一致不得静默当作同一个 retry。

### 9.4 重生成

重生成与新发送必须具有：

1. 同一规则的纯 user_input；
2. 同一规则的 synthetic history；
3. 同一位置和角色的 system injection。

如果现有原生 /regenerate 会读取真实聊天历史，它就不符合本架构，不能作为最终路径。

目标方案：Helper generate 产生候选，再通过受控 assistant swipe 写入流程替换目标回复，并复用现有 GAL 事务的 requestId、generationId、attemptId、commitKey、消息 ID、swipe ID 和提交回读。

VisitTurn 处理：

- 重生成同一逻辑回复时沿用原 requestId；
- 更新同一个 turn_id 的摘要、swipe 和最新事务元数据；
- 不新增第二条 turn；
- 若参与者或 presence 结果改变，从重生成前稳定状态重新结算，不在旧结果上叠加。

### 9.5 重生成停止线

在代码逻辑不能证明 Helper 结果可安全写入指定 swipe，且不会制造重复楼层或重复 MVU 结算之前：

- 不得宣称重生成已与发送同构；
- 不得把仍读取真实楼层的原生 regenerate 当临时完成方案；
- 可以先合入模型和 builder，但纯合成历史总体验收不得标记通过。

本计划只要求后续做代码逻辑和自动化测试验收，不在本轮执行探针或时机演示。真实宿主未验证项明确写“运行时待验”，不能写 PASS。

---

## 10. 旧数据迁移

### 10.1 原则

- 确定性、幂等、非破坏；
- 保留未知字段；
- 不伪造时间与入场边界；
- 失败时保留原 conversation_log。

### 10.2 conversation_log

1. 按已知“角色ID: 内容”前缀解析；
2. 合法角色写入该角色 legacy_memories；
3. 无前缀、未知 ID 或空内容写 legacy_unassigned；
4. legacy_id 由稳定原始索引与内容 hash 产生；
5. 重复运行不得重复追加；
6. 遗留条目不伪装成 closed_visit。

一个兼容周期内：

- 保留原 conversation_log；
- 停止新增；
- 停止直接投影；
- schema/UI migration 继续读取旧卡；
- 确认无消费者后另行规划删除。

### 10.3 bootstrap 与修复

旧存档中当前在场但没有 active_visit 的角色：

- 新建 source=bootstrap 的 active visit；
- 开始时间使用当前游戏状态；
- 不把旧 conversation_log 自动归入；
- 不声称角色刚刚到达，只表示从本版本开始追踪。

不在场却残留 active_visit：

- 以 reconcile 原因关闭；
- 用当前可用游戏时间作为修复时间；
- 保留已有 turns；
- 不删除记录。

迁移必须以明确 revision 判断，不能只看字段是否存在。

### 10.4 现有 current_relationship_facts 迁移

- 按角色逐条迁移，绝不跨角色合并；
- 保留原 fact、established_at、last_confirmed_at 和 active 语义；
- 能从明确事实判断“朋友/恋人”等关系时，才生成 relationship_state；
- 其余事实生成 milestone、boundary 或 conflict，不强行贴关系标签；
- 缺日期时保存 null 或原始文字，不伪造游戏日；
- 迁移后旧字段只读兼容一个周期；
- 新变量协议只能写候选 inbox，不能同时继续写旧字段；
- 二次迁移不得产生重复 relationship_memory_id。

---

## 11. 分阶段实施

### Phase 0：基线与写点盘点

任务：

- 记录工作树和目标运行时；
- 搜索 conversation_log 全部读写；
- 搜索 presence_snapshot 全部生产写；
- 搜索发送、停止、重试、恢复、重生成入口；
- 写入实施日志。

验收：

- 每个生产写点有文件、函数和责任说明；
- 未知直接写入未解决前停止下一阶段。

### Phase 1：schema、类型与迁移

- 新增 visit_memory、类型、默认值、集中常量和计数器；
- 实现 conversation_log 非破坏迁移；
- 将每角色 current_relationship_facts 迁入 12 条关系记忆库；
- 实现 normalize 与 unknown-field preservation；
- 更新 field ledger。

验收：

- 空状态、旧 string、旧数组、部分新结构、二次迁移都有 fixture；
- 二次迁移字节等价；
- 旧字段与未知字段仍在。
- 每角色 48 条剧情额度与 12 条关系额度彼此独立；

### Phase 2：入场生命周期

- 实现纯 reconcileCharacterVisitMemory；
- 接入所有 production presence 路径；
- 实现 bootstrap 和异常修复；
- 固定 cause 到 source/end_reason 映射。

验收：

- absent→present 创建一次；
- present→present 不重复；
- present→absent 正确关闭；
- leave→re-enter 得到两个 visit ID；
- 关闭 GAL、换区域不关闭；
- 同事务 leave→arrive 先关后开；
- 缺 visitor_meta 仍合法。

### Phase 3：剧情与关系记忆提交

- 冻结参与者；
- 实现清洗和确定性摘要；
- 按 turn_id upsert；
- 实现 relationship_memory_candidates 的白名单校验、正文证据校验和 Bridge 盖章；
- 实现 relationship_state 单 active 规则与 12 条裁剪；
- 接入成功提交与恢复；
- 保证告别 turn 先于 visit close。

验收：

- retry 不重复，regenerate 替换，新 request 追加；
- 失败/空回复不写；
- 多角色仅写显式参与者；
- 协议、MVU 标签、UI HTML 不进摘要；
- 告别 turn 位于关闭的 visit。
- 明确确认朋友/恋人关系时才更新 state；
- kiss/adult_intimacy 不会自动升级为 lover；
- 同 request 重试不会重复关系记录。

### Phase 4：合成历史投影

- 实现 buildSyntheticVisitHistory；
- 加过去/本次/遗留标签；
- 加当前关系状态与关键关系事件投影；
- 实现角色过滤、稳定排序与预算；
- 无记忆时也生成非空历史边界消息。

验收：

- 输出不存在真实楼层正文；
- 重新入场后本次块为空或只含新 turn；
- 上次内容仅在过去块；
- 冲突优先级始终存在；
- 相同输入稳定；
- legacy_unassigned 不投影。
- 有效 boundary/conflict 不会被较早亲密记录遮盖。

### Phase 5：发送请求迁移

- 引入 GalGenerationRequestV2；
- 动态协议从 user_input 移到单一 system inject；
- chat history 改为纯 synthetic history；
- 扩展 fingerprint；
- 保留不可变快照供 retry/recovery。

验收：

- 自由输入时 user_input 等于 visibleUserText；
- inject 为 in_chat、depth 1、should_scan false；
- 不使用 4.8.18 未确认的 order；
- 无记忆时生成非空历史边界消息，绝不传空 prompts；
- retry 使用同 history/injection hash。

### Phase 6：重生成同构（第三批，按所有者 2026-08-09 最新批次顺序）

详细实施与分工以 `project/gal-character-memory-batch-3-regeneration-runbook.md` 为准。2026-08-09 已完成第三批代码逻辑收口：候选生成、冻结基线重放、指定 swipe CAS 写入、receipt/drift、停止围栏与 reload 恢复均已接线并通过静态测试。因所有者明确本轮不做真实宿主时序或探针，事务 transport 仅在 `__GAL_REGENERATION_TRANSPORT__='helper-generate-swipe'` 时启用，默认仍为 `native-regenerate`；这不是自动降级，也不冒充真实宿主验收。

- 重生成使用统一 V2 builder；
- Helper 生成并受控写入目标 swipe；
- 复用事务 ID 与 commit fence；
- 回滚旧回复结果后再结算新结果；
- 移除真实历史原生路径的最终依赖。

验收：

- send/regenerate 配置结构一致；
- 不创建多余楼层；
- swipe 目标明确；
- VisitTurn 更新不重复；
- MVU 与 presence 不双结算；
- 任一项代码逻辑无法证明则本阶段不通过。

### Phase 7：双版本与数据库共存

> 详细实施入口：`project/gal-character-memory-batch-4-dual-build-and-database-runbook.md`
> 当前状态：第四批 R2 已于 2026-08-09 实施并通过静态验收。B4-T01/T02/T02-R1 与 T03～T06 的静态研究结果保留，但不接生产数据库记忆 CRUD。standalone-mvu 与 database-assisted 始终使用逐字节相同的卡内 MVU 48 + 12 召回；数据库原生召回只作为宿主额外增强，本卡不读取、不合并、不去重、不依赖它。旧 O03/T07/O04/T08 执行许可全部撤销；R2-T01/O01/T02/T03/O02 已完成，运行时数据库共存未演示并记为 `DBR-C8-UNVERIFIED`。

- 增加 standalone-mvu 与 database-assisted 两个 build profile；
- 两个 profile 共享同一 schema、事务、投影与测试；
- standalone 构建不调用 AutoCardUpdaterAPI；
- database-assisted 构造与 standalone 逐字节相同的 MVU 48 + 12 synthetic history；
- 本卡不主动归档、查询、合并或裁剪数据库记忆；
- 数据库存在、缺失、关闭或失败均不改变本卡 frozen request；
- 数据库原生召回只作为宿主外部增强，不升级为本卡正式状态源；
- database-assisted 只保留必要的宿主共存桥与非事务诊断。

验收：

- 两个构建配置没有复制业务源文件；
- standalone 全程零数据库 API 调用；
- database-assisted 的卡内请求构造阶段同样零数据库调用；
- 两版相同 MVU 输入产生逐字节相同的 synthetic history、hash 与 config fingerprint；
- database-assisted 不包含自建故事/关系记忆表 CRUD 的生产路径；
- 数据库 wrapper 缺失、透传或失败时，卡内召回仍完整存在；
- retry/regenerate 继续复用同一份冻结卡内历史。

### Phase 8：清理与文档

- 删除 conversation_log 新写入协议；
- 删除旧 prompt-context 直接投影；
- 删除 current_relationship_facts 新写入协议，保留兼容读；
- 保留兼容读和迁移；
- 更新 API provenance、field ledger、实施日志和验收简报。

验收：

- 无生产代码继续 append conversation_log；
- 无生产请求读取真实楼层正文；
- 未做实机验证不写 PASS；
- 全量测试通过；
- 无无关打包和 R2 改动。

---

## 12. 自动化测试清单

### 12.1 数据与迁移

- 默认结构完整；
- malformed record 安全归一化；
- unknown fields 保留；
- 容量裁剪正确；
- 计数器不因重复迁移增加；
- 已知角色前缀正确归属；
- 未知或无前缀进入 unassigned；
- 二次迁移无变化；
- 原 conversation_log 保留；
- current_relationship_facts 按角色迁移且二次迁移无重复；
- 不能确定关系标签的旧事实不被强行写成 friend/lover；
- 在场 bootstrap；
- 不在场残留 active visit 被关闭。

### 12.2 生命周期

- 四种基本 presence transition；
- 多角色同时到达/离开；
- 区域变化但仍在场；
- 关闭 GAL；
- scheduler、模型回执、本地 event 各路径；
- 同事务先离后到；
- visitor_meta 缺失。

### 12.3 回合提交

- 单角色与显式多角色；
- 文本只提及第三人时不写第三人；
- stop before/after accepted content；
- retry、丢回执恢复、regenerate upsert；
- farewell before close；
- HTML/MVU/协议清洗。

### 12.4 关系记忆

- 每角色独立 12 条，不能相互挤占；
- relationship_state 至多一条 active；
- 明确确认朋友/恋人关系才能切换 label；
- kiss/adult_intimacy 只生成 milestone，不自动切 lover；
- boundary、conflict、reconciliation 均能保存；
- 日期由 Bridge 盖章，忽略模型伪造日期；
- 同 request retry/regenerate upsert；
- 无正文证据的候选被拒绝；
- 非 relevant character 候选被拒绝；
- 裁剪优先保留 active state、有效 boundary/conflict 和 significance 3。

### 12.5 提示投影

- 在真实楼层放唯一 canary，断言请求完全不存在；
- 过去/本次标签；
- 新入场不继承旧动作；
- 无记忆时用非空边界消息覆盖；
- 预算稳定、当前块优先；
- legacy_unassigned 不泄漏；
- 输出 hash 稳定。
- 当前关系状态先于过去关系事件；
- 成人关系事件只投影中性摘要；
- 过去亲密不会变成本轮同意；

### 12.6 发送与重生成

- user_input 无附加协议；
- 只有一个 system inject；
- 配置字段符合 Helper 4.8.18；
- syntheticHistory 始终非空；
- send/retry/regenerate 使用同一 builder；
- 任一路径都不读真实历史；
- fingerprint 对 history/injection 变化敏感；
- 重生成后逻辑 turn 仍只有一条。

### 12.7 双版本与数据库

- standalone 构建无 AutoCardUpdaterAPI 调用路径；
- 两 profile 的卡内 synthetic history、hash 与 config fingerprint 逐字节相同；
- database-assisted 卡内请求构造阶段同样零数据库调用；
- database-assisted 不包含自建记忆表 insert/update/query 生产路径；
- 数据库 wrapper 缺失、透传或失败时卡内召回仍完整；
- retry/regenerate 不读取数据库并复用冻结卡内历史；
- 数据库外部召回不写入 MVU，也不参与 settled；
- 每角色 48 条剧情梗概与 12 条关系记忆的 schema/体积基线；
- 多楼层 fixture 统计 stat_data 增长，超过项目停止线时报告而非暗改额度。

---

## 13. 总体验收标准

全部满足才可标记“代码逻辑验收通过”：

1. GAL 请求中真实旧 user/assistant 楼层正文数量为 0；
2. 合成历史只来自版本化每角色记忆与经过校验的数据库归档，且为 system 摘要；
3. present→absent 关闭一次入场；
4. absent→present 创建全新入场；
5. 关闭 GAL、换区域但仍在场不切 visit；
6. 上次入场标为背景，不允许续接旧动作；
7. 本次入场只含本次到达后的已接受回合；
8. conversation_log 非破坏迁移，不伪造日期；
9. 每角色拥有独立 48 条剧情梗概与 12 条关系记忆额度；
10. current_relationship_facts 被迁入新关系库，不形成双权威；
11. 朋友、挚友、恋人等当前关系有唯一 active state；
12. 接吻/成人亲密等事件被记住，但不自动推导恋爱或未来同意；
13. Bridge 是生命周期、ID、日期和正式记忆的唯一写入者；
14. 失败、停止、重试、恢复不重复写；
15. 重生成更新同一逻辑 turn；
16. 发送与重生成使用同一装配；
17. user_input 不承载动态协议；
18. 只使用 Helper 4.8.18 已确认字段；
19. standalone 与 database-assisted 共享业务逻辑，数据库失败不影响核心玩法；
20. 全量测试通过，且未删除真实楼层或破坏 MVU 状态。

本轮不要求时机演示或探针。只能由真实宿主证明的行为标记“运行时待验”。不得拿旧打包产物、旧卡、旧探针目录或邻近 Helper 版本冒充当前工作区证据。

---

## 14. 禁止的捷径

- 仍发送完整旧楼层，只加一句“不要继续”；
- 无记忆时传空 prompts，触发 Helper 内部默认历史分支；
- 把整个状态 JSON 塞进 user_input；
- 把过去摘要伪装成 assistant 原话；
- 用现实日期猜游戏内昨天/今天；
- 关闭 GAL 就结束 visit；
- 按正文角色名猜参与者；
- 让变量模型分配 visit/turn ID；
- 同时新增 conversation_log 和 visit_memory，形成双权威；
- 用数组下标当稳定 ID；
- 重生成在旧 MVU 结果上叠加；
- 静态测试通过就声称真实宿主已验证；
- 顺手打包、上传 R2 或改正式/测试通道。

---

## 15. API 与证据边界

| 能力 | 依据 | 裁定 |
|---|---|---|
| generate 支持 user_input | Helper 4.8.18 类型/源码 | 可使用 |
| generate 支持 overrides | Helper 4.8.18 类型/源码 | 可使用 |
| generate 支持 injects | Helper 4.8.18 类型/源码 | 可使用 |
| inject 支持 role/position/depth/content/should_scan | Helper 4.8.18 | 可使用 |
| inject 存在 order | 当前证据不支持 | 禁止依赖 |
| MVU message-floor 读写 | 当前项目与 API provenance | 维持正常多楼层路径 |
| Helper 结果安全替换指定 swipe | 需代码逻辑闭合 | Phase 6 停止线 |
| AutoCardUpdaterAPI 支持 queryTableRows/insertRow/updateRow | SP·数据库 VII 源码与 API provenance | database-assisted 可规划使用 |
| 当前目标运行时已启用数据库 | 当前记录为 disabled | 禁止声称已启用或已实机通过 |
| 故事/关系逻辑表的物理表名与列 | 尚未锁定 | Phase 0 读取源码/配置后确定 |
| 静态测试等同真实运行时 | 不成立 | 不作声称 |

实施中如需新增 API 声称，先更新 project/api-provenance.md，写明来源文件、目标版本、精确签名、验证层级和限制。

---

## 16. 后续专项

本计划完成后，再建立“GAL 提示词分层与楼层注入优化计划”，处理：

- 固定规则与动态规则拆分；
- preset、worldbook、in-chat injection 职责；
- 提示块去重；
- token 预算与冲突优先级；
- 不同动作的最小注入；
- 是否将稳定规则前移到 docs 所述固定楼层；
- UI、变量模型与剧情模型协议精简。

本计划先保证更基础的一件事：模型看到的历史是受控、结构化、按角色入场分段的，而不是整桌旧聊天记录又被端上来。

---

## 17. 实施交付物

1. schema、类型、迁移与 field ledger；
2. 全部 presence 生产写点清单；
3. 生命周期协调器及测试；
4. VisitTurn 提交器及测试；
5. synthetic history builder 与 canary 测试；
6. V2 builder 和发送/重试/重生成共用证据；
7. conversation_log 兼容与退役说明；
8. API provenance 更新；
9. 分阶段实施日志；
10. 只基于当前工作区代码和测试的验收汇总。

不得把旧打包卡、旧探针或其他 Helper 版本的结果列为本实现通过证据。
