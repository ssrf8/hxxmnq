# GAL 角色记忆重构：第一批「数据基础」实施手册

> 文档性质：交给实施 agent 的逐项执行手册
> 当前状态：已实施、已完成代码逻辑验收、已封账（2026-08-09）
> 对应总计划：project/gal-character-visit-memory-and-synthetic-history-plan.md
> 本批范围：每角色 MVU 数据模型、48 条剧情梗概容量、12 条关系记忆、旧数据迁移、入场生命周期
> 明确排除：提示投影切换、generate/injects、发送事务改造、暂停/重试改造、重生成、数据库归档、UI 打包、R2、实机探针

> 封账基线：功能提交 `48f088f`，合并提交 `de1b568`（`main` / `origin/main`）。定向测试 25/25、全量测试 342/342、`npm run check:ui` PASS。上述结论仅代表代码逻辑和静态检查，不代表实机运行时验收。

> 封账规则：本手册自此只作第一批验收依据，不再向其中追加第二批需求。后续发送、合成历史和 VisitTurn 提交统一进入 `project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md`。若第一批地基发现缺陷，必须另写带编号的修复记录，不得悄悄改写已验收语义、容量或版本号。

---

## 0. 给实施 agent 的硬指令

你不是来“顺便完成整个总计划”的。

你只实施第一批数据地基。完成后，新数据结构、迁移和角色入场生命周期应当可用并有静态测试；现有 GAL 发送、真实历史、conversation_log 提示、关系事实写入和重生成行为暂时保持原状。

本批结束时允许存在的过渡状态：

- 新 interaction.visit_memory 已存在；
- 每角色拥有独立的剧情记忆与关系记忆结构；
- 角色到达/离开会打开或关闭 visit；
- 纯函数能够规范化、裁剪和 upsert 记忆；
- 旧 conversation_log 仍保留并仍由旧协议写入；
- 旧 current_relationship_facts 仍保留并仍由现有事件/变量链使用；
- 新提示投影尚未启用；
- 新生成回复尚未自动写 VisitTurn；
- relationship_memory_candidates 尚未加入。

这不是双权威的最终设计，而是受控过渡期。第一批不能提前删除旧写入者，因为新生成提交器尚未接入。

---

## 1. 每个小任务都必须执行的阅读门禁

下面每个任务都重复列出“开始前必须重读”。不要因为上一任务读过就跳过。

每个任务的固定基础门禁都是：

1. 完整重读 tavern-card-builder/SKILL.md；
2. 完整重读 sillytavern-database-rolecards/SKILL.md；
3. 完整重读 sillytavern-api-reference/SKILL.md；
4. 完整重读总计划 project/gal-character-visit-memory-and-synthetic-history-plan.md；
5. 再阅读该任务列出的重点 reference、总计划重点章节和本手册章节。

各任务“开始前必须重读”列表是重点增量，不是对上述四份固定全文阅读的替代。

每次开始小任务前，实施 agent 必须：

1. 完整重读三份固定 SKILL.md；
2. 完整重读总计划；
3. 完整重读该任务所列 skill reference；
4. 重读总计划指定重点章节；
5. 重读本手册当前小任务；
6. 在实施日志写阅读回执，包含文件路径和本次任务编号；
7. 阅读未完成前不得修改代码。

阅读回执格式：

    [B1-T03][read] tavern-card-builder/SKILL.md
    [B1-T03][read] variable-systems.md
    [B1-T03][read] 总计划 §4、§5
    [B1-T03][read] 第一批手册 B1-T03

禁止只写“已读 skill”而不列文件。禁止让子 agent 代读后只拿摘要。执行者本人必须读。

### 1.1 本批固定 skill

- C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
- C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
- C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
- C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
- C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
- C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
- C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md

### 1.2 固定项目文档

- project/gal-character-visit-memory-and-synthetic-history-plan.md
- project/contract.md
- project/api-provenance.md
- src/schema/field-ledger.md

---

## 2. 本批冻结的数据决策

实施 agent 不得自行更名、更换容量或改变语义。

### 2.1 存储位置

- 正式根：stat_data.interaction.visit_memory；
- 存储策略：正常多楼层 MVU；
- 同层兼容：不声称、不新增，标记 DBR-C8-UNVERIFIED；
- 数据库：本批完全不接；
- chat metadata：不得作为第二状态源；
- localStorage/sessionStorage：不得保存正式记忆。

### 2.2 每角色容量

- 剧情梗概：每角色独立最多 48 条；
- 关系记忆：每角色独立最多 12 条；
- active visit：最多保留最近 16 条 turn；
- closed visit：最多 4 次，每次结构上最多 16 条；
- active + 全部 closed 的 turn 合计必须不超过 48；
- legacy story memory：每角色最多 16 条，不计入新剧情 48 条；
- legacy_unassigned：最多 24 条；
- turn summary：最多 160 字符；
- relationship summary：最多 160 字符。

### 2.3 关系记忆的含义

12 条关系记忆同时容纳：

- 当前关系定义：陌生、认识、朋友、挚友、恋人、疏远；
- 关系里程碑：信任、表白、接吻、亲密、承诺、分手；
- 关系边界；
- 冲突；
- 和解。

同一角色最多一条 active 的 relationship_state。

接吻或亲密只能证明事件发生，不能自动升级为 lover。只有明确建立关系的正式事实才能创建或切换 relationship_state。

### 2.4 入场边界

- absent → present：打开新 visit；
- present → absent：关闭 active visit；
- present → present：不变；
- absent → absent：不变；
- 关闭 GAL：不离场；
- 更换 area/view 但仍 present：不离场；
- 同事务离开再进入：两个不同 visit_id。

### 2.5 写入权

第一批正式写入者：

| 字段 | 写入者 |
|---|---|
| visit ID/counter | Bridge/domain helper |
| active/closed visit 生命周期 | presence reconciliation |
| 迁入的 legacy story | deterministic migration |
| 迁入的旧关系事实 | deterministic migration |
| 新 VisitTurn | 本批没有生产写入者，仅提供纯 upsert helper 和测试 |
| 新关系候选 | 本批不存在 |

旧字段在本批仍维持原写入者。禁止为了“统一”提前修改 target-actions、prompt-context 或变量规则。

---

## 3. 全批文件边界

### 3.1 允许修改

按任务需要，允许：

- src/schema/02-mvu-schema.js
- src/schema/initial-state.json
- src/schema/field-ledger.md
- src/ui/types.ts
- src/ui/state-migrations.ts
- src/ui/time-rules.ts（只读优先；除非确有共享类型问题，不得改算法）
- src/ui/event-settlement.ts
- src/ui/visitor-rules.ts
- src/ui/m2-runtime.ts
- src/ui/activity-rules.ts
- src/ui/bridge.ts（只允许 presence 生命周期接线，不碰生成请求）
- src/ui/test-tools.ts（只在测试状态需适配新字段时）
- 新建 src/ui/character-memory.ts
- tests/ui-contract.test.mjs
- tests/m2-r38-r45.test.mjs
- 必要时新建 tests/character-memory.test.mjs
- project/api-provenance.md（仅新增本批实际使用的 API 依据）
- 新建 project/gal-character-memory-batch-1-implementation-log.md

### 3.2 默认禁止修改

- src/ui/gal-generation-request.ts
- src/ui/target-actions.ts
- src/ui/prompt-context.ts
- src/lorebook/variable-update-rules.md
- src/lorebook/variable-output-format.md
- src/ui/database-adapter.ts
- 所有 R2/publish/package/build profile 文件
- dist/**
- 卡片 JSON/PNG 成品
- docs/** 参考资料
- 角色人设 XML

如确实需要越界，立即停止，写清原因，请所有者确认。不能先改后解释。

### 3.3 Git 与用户改动

- 当前工作树可能已有用户未提交改动；
- 不得 reset、checkout、clean、stash 或覆盖无关改动；
- 修改前记录目标文件 git status；
- 只提交本批相关变更；
- 本手册不授权 commit、push、打包或发布。

---

## 4. B1-T00：建立实施日志与基线

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/validation.md
- 总计划 §0、§3、§11 Phase 0
- 本手册 §0–§4

### 目标

只收集证据，不改生产代码。

### 操作

1. 新建 project/gal-character-memory-batch-1-implementation-log.md。
2. 记录：
   - 当前日期；
   - git status；
   - Node 版本；
   - package.json 的 test/check:ui 命令；
   - SillyTavern 目标版本 1.18.0；
   - Tavern Helper 目标版本 4.8.18；
   - 本批明确不做 runtime probe。
3. 运行并记录基线：

       npm test
       npm run check:ui

4. 若基线失败：
   - 记录失败测试名称和原始错误摘要；
   - 判断是否与本批无关；
   - 不得为了让基线变绿而改无关代码；
   - 未能区分时停止。

### 禁区

- 不运行 build:ui、package、publish、R2 命令；
- 不删除旧测试；
- 不把旧打包产物当基线；
- 不写“实机通过”。

### 完成证据

- 实施日志存在；
- 基线命令、通过数/失败数和时间写清楚；
- git status 截面写入日志；
- 本任务没有生产代码 diff。

---

## 5. B1-T01：完整盘点字段与 presence 写点

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/variable-systems.md
- sillytavern-database-rolecards/SKILL.md
- sillytavern-database-rolecards/references/floor-and-ui-binding.md
- 总计划 §3、§5、§6、§10
- 本手册 §2、§3、§5

### 目标

在任何 schema 修改前，列全现有读写链。

### 必须搜索

    rg -n "conversation_log|current_relationship_facts" src tests project
    rg -n "presence_snapshot|present_character_ids|visitor_meta" src/ui tests
    rg -n "applyPresenceUpdate|applyLocalPresenceTransition|evaluateVisitScheduler" src/ui tests
    rg -n "uid_counters|periodSerialFromState" src/ui src/schema

### 实施日志必须列出的表

| 数据/写点 | 文件 | 函数 | 当前写入者 | 本批处理 |
|---|---|---|---|---|

至少覆盖：

- applyPresenceUpdate；
- applyLocalPresenceTransition；
- visitor scheduler arrival/departure；
- opportunity card arrival；
- 直接修改 present_character_ids 的事件路径；
- bridge 中多处 applyPresenceUpdate；
- test-tools；
- current_relationship_facts 的本地事件写入与 ownership restore；
- conversation_log 的 schema、migration、prompt、模型协议和测试。

### 裁定规则

- 生产写点必须全部纳入后续接线；
- 测试工具单独分类，不能冒充生产路径；
- 只读投影本批不改；
- 找到未知直接写点时先更新清单，不得绕过。

### 停止线

存在无法解释的生产 presence 写点，或不知道其调用顺序时，停止并向所有者报告。禁止猜。

---

## 6. B1-T02：冻结机器可检查的数据契约

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/variable-systems.md
- sillytavern-database-rolecards/SKILL.md
- sillytavern-database-rolecards/references/rolecard-data-model.md
- 总计划 §4、§5
- 本手册 §2、§6

### 目标

在写 Zod 和 TS 前，先把字段、类型、默认值、写入者、读者、迁移和裁剪写入 field ledger 与实施日志。

### 固定模型标识

    modelId: gensokyo-character-memory
    modelVersion: character-visit-memory.v1
    storage.root: stat_data.interaction.visit_memory
    storage.scope: message
    storage.strategy: multi-floor

### 固定根结构

    visit_memory {
      version
      by_character
      legacy_unassigned
      migration
    }

### CharacterMemory 固定结构

    character_id
    active_visit
    closed_visits
    legacy_memories
    relationship_memories

### VisitRecord 固定结构

    visit_id
    character_id
    source
    arrival_uid
    started_day
    started_time_period
    started_period_serial
    ended_day
    ended_time_period
    ended_period_serial
    end_reason
    turns

### VisitTurn 固定结构

    turn_id
    request_id
    character_id
    scene_id
    assistant_message_id
    assistant_swipe_id
    latest_attempt_id
    latest_commit_key
    day
    time_period
    period_serial
    summary

### RelationshipMemory 固定结构

    relationship_memory_id
    character_id
    request_id
    visit_id
    day
    time_period
    period_serial
    kind
    relationship_label
    event_kind
    summary
    significance
    active
    latest_attempt_id
    latest_commit_key

### LegacyMemory 固定结构

    legacy_id
    character_id
    text
    source

### migration 元数据

不得用一个 boolean 阻止后续增量兼容导入。第一批旧字段仍会继续被写入，因此 migration 至少要能表达：

- 当前迁移 revision；
- conversation_log 的规范化源 fingerprint；
- 每角色 current_relationship_facts 的规范化源 fingerprint；
- 迁移运行可以重复；
- 新旧增量不会重复追加。

fingerprint 只能用于判断输入是否变化或记录诊断，不能代替记录级 upsert。旧关系事实的 active、fact、last_confirmed_at 变化后，即使 ID 见过也必须更新对应关系记忆。

具体字段名可按项目命名习惯确定，但必须在 field ledger 写清。

### 禁区

- 不把完整真实楼层存入新库；
- 不加任意 JSON blob；
- 不用数组下标作为正式实体 ID；
- 不用 Date.now/Math.random/uuid 生成迁移 ID；
- 不新增数值好感度；
- 不让数据库成为字段写入者；
- 不新增 candidate inbox。

### 完成证据

- field ledger 先于 schema 或与 schema 同一任务完成；
- 每字段有 default/writer/reader/cleanup/migration；
- 没有无生命周期字段。

---

## 7. B1-T03：实现 TypeScript 类型与集中常量

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/variable-systems.md
- sillytavern-database-rolecards/SKILL.md
- 总计划 §4.1–§4.7
- 本手册 §2、§6、§7

### 目标

在 src/ui/types.ts 增加明确类型，在新 src/ui/character-memory.ts 集中常量和纯领域操作；禁止各文件复制数字。

### 必须定义

- CharacterMemoryVersion；
- CharacterMemorySource；
- CharacterVisitEndReason；
- RelationshipMemoryKind；
- RelationshipLabel；
- RelationshipEventKind；
- LegacyMemory；
- VisitTurn；
- VisitRecord；
- RelationshipMemory；
- CharacterMemory；
- CharacterVisitMemoryState；
- migration metadata 类型；
- GardenState.interaction.visit_memory；
- GardenState.uid_counters.character_visit。

### 集中常量

    STORY_SUMMARIES_PER_CHARACTER = 48
    ACTIVE_TURNS_PER_CHARACTER = 16
    CLOSED_VISITS_PER_CHARACTER = 4
    TURNS_PER_CLOSED_VISIT = 16
    LEGACY_MEMORIES_PER_CHARACTER = 16
    LEGACY_UNASSIGNED_LIMIT = 24
    RELATIONSHIP_MEMORIES_PER_CHARACTER = 12
    TURN_SUMMARY_CHARS = 160
    RELATIONSHIP_SUMMARY_CHARS = 160

名称可以符合项目风格，但值不能改。

### 字符串枚举

source：

- scheduler
- event
- model-presence
- bootstrap
- reconcile

end_reason：

- scheduled-departure
- presence-receipt
- event-leave
- reconcile

relationship kind：

- relationship_state
- milestone
- boundary
- conflict
- reconciliation

relationship label：

- stranger
- acquaintance
- friend
- close_friend
- lover
- estranged

event kind：

- trust
- affection
- confession
- kiss
- adult_intimacy
- promise
- breakup

nullable 字段必须在类型和 schema 中一致。

### 禁区

- 不使用 any 逃避结构；
- 不把所有枚举改成任意 string；
- 不在 app.ts/bridge.ts 再定义一份镜像类型；
- 不改现有 unrelated GardenState 类型；
- 不重排整个 types.ts 制造大 diff。

### 定向验证

    npm run check:ui

### 停止线

类型设计需要修改现有关系事实语义、事件登记或生成请求时，停止。第一批只添加兼容类型。

---

## 8. B1-T04：实现 Zod schema 与 initial-state

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/variable-systems.md
- sillytavern-database-rolecards/SKILL.md
- sillytavern-database-rolecards/references/rolecard-data-model.md
- 总计划 §4、§10
- 本手册 §2、§6–§8

### 目标

让 MVU Zod 能安全承载新结构，同时保留未知字段。

### schema 要求

1. 新增独立子 schema，不在 interaction 内写巨大内联对象。
2. 每个 object 使用 passthrough，除非已有项目约束明确要求别的行为。
3. 文本通过现有 text helper 截断。
4. 数组通过现有 list helper限制结构上限。
5. nullable 字段使用与现有 helper 一致的写法。
6. 动态 by_character 使用 dictionary。
7. relationship_memories schema 限 12。
8. active turns schema 限 16。
9. closed visits schema 限 4，每个 turns 限 16。
10. 角色总计 48 是跨数组业务不变量，由 character-memory normalizer 执行；不要假装 Zod 单个 list 已证明总计 48。
11. uid_counters.character_visit 初始值至少为 1。

### initial-state 要求

- meta/schema 版本按项目现行版本策略更新，不擅自把卡版本改成发布版本；
- interaction.visit_memory.version 写 character-visit-memory.v1；
- 首发固定角色各有独立 CharacterMemory 空结构；
- 动态角色由 migration/ensure helper 懒创建；
- 初始 presence 不在场时 active_visit 为 null；
- conversation_log 原样保留；
- current_relationship_facts 原样保留；
- uid_counters.character_visit = 1。

### 固定角色来源

固定角色 ID 必须从当前 initial-state/character registry 读取，不得凭记忆手打另一份名单。新增测试比较两边 key。

### 禁区

- 不删除 current_relationship_facts；
- 不把 relationship memory 塞进 characters 与 interaction 两处；
- 不把 schema catch 写成会清空整个 by_character 的宽泛兜底；
- 不把 malformed 单角色导致全角色字典归零；
- 不改远程 mvu_zod import；
- 不改加载器版本。

### 定向验证

    npm run check:ui
    node --test --test-name-pattern="schema|initial|memory" tests/ui-contract.test.mjs

如果尚未有匹配测试，先完成 B1-T09 再补跑；日志不得伪造为已通过。

---

## 9. B1-T05：实现纯 normalizer、容量裁剪与 ID helper

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/variable-systems.md
- sillytavern-database-rolecards/SKILL.md
- sillytavern-database-rolecards/references/rolecard-data-model.md
- 总计划 §4.3–§4.7、§5
- 本手册 §2、§6–§9

### 目标

在 src/ui/character-memory.ts 实现可脱离宿主测试的纯函数。

### 至少需要的函数职责

- createEmptyCharacterMemory(characterId)；
- ensureCharacterMemory(state, characterId)；
- normalizeLegacyMemory；
- normalizeVisitTurn；
- normalizeVisitRecord；
- normalizeRelationshipMemory；
- normalizeCharacterMemory；
- normalizeVisitMemoryState；
- trimStoryMemoriesTo48；
- trimRelationshipMemoriesTo12；
- nextCharacterVisitId；
- upsertVisitTurn；
- upsertRelationshipMemory（本批仅供迁移与测试，不接 LLM）。

函数名可调整，但职责不可缺。

### 纯函数规则

- 不读取 window/document；
- 不调用 Mvu；
- 不调用数据库；
- 不修改传入对象；
- 返回新对象；
- 相同输入得到相同输出；
- 保留未知字段；
- 不生成现实时间；
- 不读取真实消息楼层。

### 剧情 48 条裁剪算法

固定顺序：

1. active_visit turns 先各自保留最近 16；
2. closed_visits 先保留最近 4 个 visit；
3. 每个 closed visit turns 保留最近 16；
4. 统计 active + closed 全部 turn；
5. 若超过 48：
   - 保留 active 的最近 turn；
   - 从最新 closed visit 向更旧 visit 填充剩余额度；
   - 删除更旧 turn；
   - 不改变保留项的相对时间顺序；
6. 删除 turn 后允许 closed visit 留空，但不得删除 visit 边界记录；
7. 同 turn_id 去重，保留后出现/更新版本；
8. 无 turn_id 的 malformed 项不得编造随机 ID，安全丢入诊断或拒绝。

### 关系 12 条裁剪算法

固定优先级：

1. 唯一 active relationship_state；
2. 当前仍有效的 boundary/conflict；
3. significance 3；
4. 更新/发生时间较新；
5. 原数组稳定顺序作为最终 tie-breaker。

若出现多条 active relationship_state：

- 选 period_serial 最大者；
- serial 同值选数组最后者；
- 其余 state 标 inactive，不能直接删除；
- 再执行总量 12 裁剪。

### ID 规则

- visit_id：character_visit_ + 左补零单调 counter；
- turn_id：request_id + ':' + character_id；
- migrated relationship ID：优先复用旧 fact.id 的稳定组合；
- migrated story ID：基于角色和规范化文本 hash；
- 禁止 Date.now、Math.random、crypto.randomUUID；
- 若项目已有稳定 hash helper，复用；
- 若没有，新增小型确定性 hash 时必须写碰撞处理测试和用途限制，不能声称密码学安全。

### 停止线

无法在不丢未知字段的情况下归一化，或 48 条算法出现非确定结果，停止，不接生产路径。

---

## 10. B1-T06：实现 conversation_log 增量迁移

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/variable-systems.md
- sillytavern-database-rolecards/SKILL.md
- sillytavern-database-rolecards/references/rolecard-data-model.md
- 总计划 §10.1–§10.3
- 本手册 §2、§6、§9、§10

### 目标

将旧 conversation_log 非破坏地导入 legacy memory；不把旧文本伪造成 visit turn。

### 解析规则

输入先沿用现有兼容：

- string → 非空时单元素数组；
- string[] → 逐项字符串化、裁到旧上限；
- 空白 → 空数组；
- 其他 → 空数组但保留原未知外围结构。

角色前缀：

- 只接受已登记 character ID 后跟英文冒号或中文冒号；
- 去掉前后空白；
- ID 必须存在于 characters 或角色注册表；
- 不按显示名、别名或自然语言猜角色；
- 合法条目进入对应 CharacterMemory.legacy_memories；
- 未知 ID、无前缀、空正文进入 legacy_unassigned；
- 不创建 active/closed visit；
- 不写 day/time。

### 增量与幂等

第一批旧 conversation_log 仍可能继续追加。因此：

- migrateGardenState 每次可重新看见旧源；
- 通过稳定 legacy_id 去重；
- 同一角色的完全相同规范化摘要视为同一条 legacy memory，按稳定 ID 合并；旧 conversation_log 本来也会经现有 Set 逻辑去重；
- 同一状态运行两次结果深度等价；
- FIFO 旧源发生变化时只补新稳定项，不重复旧项；
- migration revision 不是“永远跳过导入”的开关。

### 禁区

- 不清空 conversation_log；
- 不把其上限从 24 改为 48；
- 不修改 target-actions 的 JSONPatch 协议；
- 不修改 prompt-context；
- 不将旧条目放入 active visit；
- 不从文本猜日期、关系或是否亲密。

### 测试最低集合

- 合法 reimu 前缀；
- 中文冒号；
- 未知角色；
- 无前缀；
- 空白；
- string 兼容；
- 重复运行；
- 两条相同文本确定性合并；
- 旧源新增一条后的增量；
- legacy 每角色 16 和 unassigned 24 裁剪。

---

## 11. B1-T07：迁移 current_relationship_facts

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/variable-systems.md
- sillytavern-database-rolecards/SKILL.md
- sillytavern-database-rolecards/references/rolecard-data-model.md
- 总计划 §4.6、§5.3、§10.4
- 本手册 §2.3、§6、§9、§11

### 目标

将每角色已有关系事实导入其 12 条关系记忆库，同时保留旧字段供过渡期使用。

### 映射

每条旧 fact：

- character_id：来自 characters 的外层 key，不相信 fact.subjects 猜归属；
- relationship_memory_id：legacy_relation:<characterId>:<fact.id>；
- request_id：空字符串或明确 legacy 标记，按 schema 统一；
- visit_id：null；
- day/time/serial：只有旧字段有结构化可靠值时才填，否则 null；
- summary：fact.fact 截至 160；
- significance：默认 2；本批不做自然语言重要性评分；
- active：继承旧 fact.active；
- latest attempt/commit：null。

kind 映射：

- 明确边界事实 → boundary；
- 明确冲突事实 → conflict；
- 明确和解事实 → reconciliation；
- 其他 → milestone；
- relationship_state 只能来自严格结构或精确白名单表达，不做模糊关键词推断。

relationship_label 映射：

- 只有旧事实明确写出当前关系且命中受控映射时填；
- friend/close_friend/lover 不由接吻、性行为、好感或合作自动推断；
- 无法判断时为 null。

event_kind 映射：

- 只有事实明确且受控映射可证明时填；
- 不能见到“亲密”两个字就猜 adult_intimacy；
- 不能见到“喜欢”就猜 confession。

### 现有本地事件事实

marisa/alice/nitori 等事件写入的 current_relationship_facts 仍需继续通过旧 ownership restore 测试。本批迁移不得破坏这些事件测试。

### 禁区

- 不删除或重命名 current_relationship_facts；
- 不让旧关系事实数组变只读；
- 不修改 event-registry projection keys；
- 不修改变量模型规则；
- 不加入 relationship candidate inbox；
- 不根据 visual_mode 生成关系记录；
- 不将亲密自动等于恋人。

### 测试最低集合

- 每角色隔离；
- 旧 ID 稳定；
- active 保留；
- 不明确事实成为 milestone/null label；
- 明确关系白名单才产生 relationship_state；
- 两条 active state 归一化为一条 active；
- 重复迁移不重复；
- 超过 12 条按固定优先级裁剪；
- 现有 event settlement 关系事实测试仍通过。

---

## 12. B1-T08：实现纯入场生命周期协调器

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/variable-systems.md
- sillytavern-database-rolecards/SKILL.md
- sillytavern-api-reference/SKILL.md
- 总计划 §2、§6
- 本手册 §2.4、§9、§12

### 目标

在 character-memory.ts 实现不依赖 UI/模型的 presence → visit 协调器。

### 推荐接口

    reconcileCharacterVisits({
      beforePresence,
      afterPresence,
      memory,
      counters,
      clock,
      cause
    })

返回：

- 新 memory；
- 新 counters；
- openedVisitIds；
- closedVisitIds；
- diagnostics。

### 输入要求

beforePresence 和 afterPresence 都要包含：

- present_character_ids；
- visitor_meta；
- 必要时 character_views 只读，不用 area 变化切 visit。

clock 只能来自正式状态：

- environment.day；
- environment.time_period；
- periodSerialFromState(state)。

禁止使用现实时间。

### cause 映射

| 调用来源 | open source | close reason |
|---|---|---|
| visitor scheduler | scheduler | scheduled-departure |
| registered/local event | event | event-leave |
| GensokyoPresence | model-presence | presence-receipt |
| migration/load repair | bootstrap/reconcile | reconcile |

### 基本算法

1. 规范化并去重 before/after ID；
2. arrived = after - before；
3. departed = before - after；
4. 先处理 departed；
5. 再处理 arrived；
6. present→present 不因 area/view 变化创建 visit；
7. absent→absent 无操作；
8. 关闭时把 active_visit 填结束字段后放入 closed_visits；
9. 打开时分配新 counter ID；
10. arrival_uid 从 after visitor_meta 获取；
11. departure 需要的旧 meta 在删除前从 before 获取；
12. 结束后运行容量 normalizer。

### 幂等重放

同一个 transition 被重复调用时必须 no-op：

- arrived 角色如果已经有合法 active_visit，不得关闭后再开；
- departed 角色如果已经没有 active_visit，不得造空 closed visit；
- counter 不得再次增加；
- closed visit 不得重复。

异常修复不要混进普通 transition。另建：

    repairCharacterVisitsAgainstPresence(state)

规则：

- 当前 present 但无 active → bootstrap；
- 当前 absent 但有 active → reconcile close；
- 只在 migration/load repair 明确调用；
- 不能每个 nested production helper 都偷偷 repair。

### 关闭 GAL 禁区

不得修改 endConversationLocal 让其关闭 visit。必须新增测试证明：

- current_session 变 null；
- presence 不变；
- active_visit ID 不变。

### 停止线

如果无法区分 transition replay 与异常 repair，停止。不得用“发现 active 就先关闭再开”的简单写法。

---

## 13. B1-T09：接入全部生产 presence 写点

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/validation.md
- sillytavern-api-reference/SKILL.md
- 总计划 §6、§11 Phase 2
- 本手册 B1-T01 的写点清单、§12、§13

### 目标

所有生产 presence 变化都调用同一个协调器，且每次真实变化只结算一次。

### 接线原则

每个写点：

1. mutation 前 clone/capture beforePresence；
2. 执行原有 presence 校验和修改；
3. mutation 后 capture afterPresence；
4. 使用明确 cause 调用 reconcile；
5. 合并 memory/counter 返回值；
6. 保留原函数返回形状；
7. 原有 presence 测试不得改变预期。

### 必须接入

以 B1-T01 实际清单为准，至少：

- applyPresenceUpdate；
- applyLocalPresenceTransition；
- evaluateVisitScheduler departures；
- evaluateVisitScheduler committed arrivals；
- opportunity card arrival；
- event settlement 中直接追加 present_character_ids 的路径；
- bridge 中不会自然经过上述函数的生产写点。

### 防双调用

- 如果 bridge 调 applyPresenceUpdate，而 applyPresenceUpdate 内已协调，bridge 不再协调同一差异；
- 如果 m2-runtime 调 evaluateVisitScheduler，而 scheduler 内已协调，m2-runtime 不再重复；
- 用测试证明 nested call 不增加 counter；
- 不能因为协调器幂等就任由所有层重复调用，调用所有权仍要明确。

### visitor_meta 删除顺序

角色离开时必须先捕获 beforePresence，再删除 visitor_meta。否则结束记录会丢失 arrival_uid/source 证据。

### 时间顺序

- 复用 periodSerialFromState；
- 如果某事件先推进时间再改变 presence，使用变化发生时的正式 next state；
- 不重复推进时间；
- 不让模型写的倒退时间覆盖 Bridge 时钟。

### test-tools

- test-tools 可以通过 migration/repair 获得新结构；
- 不需要让测试按钮模拟完整数据库；
- 不得为了 test-tools 简单而放宽生产 invariants。

### 禁区

- 不碰 generate/regenerate；
- 不解析 assistant 正文生成 VisitTurn；
- 不改 prompt；
- 不创建消息楼层；
- 不调用 Mvu API 新写楼层；
- 不改事件结算结果；
- 不让 area 变化触发 leave/arrive；
- 不让 end conversation 触发离场。

### 完成证据

实施日志中的每个 production 写点标记：

- integrated；
- intentionally covered by owning helper；
- 或 blocked。

只写“应该都接了”不算证据。

---

## 14. B1-T10：补齐 schema 与 migration 测试

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/validation.md
- sillytavern-database-rolecards/SKILL.md
- sillytavern-database-rolecards/references/rolecard-data-model.md
- 总计划 §12.1、§12.2、§12.4
- 本手册 §6–§11、§14

### 目标

用行为测试证明结构、迁移、容量和未知字段保留，不只用正则检查源码。

### 必须有的 fixture

1. 全新 initial-state；
2. 无 interaction 的旧状态；
3. conversation_log 为 string；
4. conversation_log 为数组；
5. 未知角色/无前缀；
6. 重复 legacy 文本；
7. current_relationship_facts 多角色；
8. 明确状态与模糊事实；
9. malformed visit_memory；
10. partial v1 state；
11. 带 unknown top-level/character/visit/turn 字段；
12. 48/49/64 条 story 边界；
13. 12/13/20 条 relationship 边界；
14. 重复运行 migration；
15. 旧源在第二次运行新增一条。

### 必须断言

- 固定角色 key 独立；
- reimu 写满不会挤掉 marisa；
- 48 是每角色而非全局；
- 12 是每角色关系库；
- unknown fields 保留；
- original conversation_log 保留；
- original current_relationship_facts 保留；
- migrated ID 稳定；
- 二次运行 deepEqual；
- malformed 单角色不清空其他角色；
- 没有 Date.now/random 导致漂移。

### 测试质量禁区

- 不只 assert 源码包含字段名；
- 不用 snapshot 掩盖错误；
- 不把错误结果更新成新 snapshot；
- 不删旧 conversation_log 测试；
- 不把 24 改 48 来伪装完成；
- 不跳过失败测试。

### 命令

    node --test tests/character-memory.test.mjs
    node --test --test-name-pattern="conversation_log|relationship|memory|migration" tests/ui-contract.test.mjs
    npm run check:ui

如果没有单独测试文件，可把第一条替换为实际文件，但日志必须写明。

---

## 15. B1-T11：补齐生命周期与接线测试

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/validation.md
- sillytavern-database-rolecards/references/floor-and-ui-binding.md
- sillytavern-api-reference/SKILL.md
- 总计划 §6、§12.2
- 本手册 §12–§15

### 目标

证明 visit 边界与所有 production presence 路径一致。

### 纯函数矩阵

| before | after | 预期 |
|---|---|---|
| absent | absent | no-op |
| absent | present | open one |
| present | present | same ID |
| present | absent | close one |
| leave then arrive | 两次调用 | two visit IDs |
| 同 arrival replay | 重复调用 | no new ID |
| 同 departure replay | 重复调用 | no duplicate close |

### 必须测试

- 多角色同时 arrive；
- 多角色同时 depart；
- 一人离开、一人仍在；
- visitor_meta 有/无 arrival_uid；
- scheduler arrival；
- scheduler due departure；
- local event arrival/departure；
- GensokyoPresence accepted update；
- 非法 presence receipt 不改变 visit；
- opportunity arrival；
- area/view 改变不切 visit；
- endConversationLocal 不切 visit；
- migration bootstrap；
- absent stale active repair close；
- nested caller 不双增 counter；
- counter 从旧非法值安全归一；
- closed visit 最多 4；
- total story turns 最多 48。

### 现有回归

必须继续通过：

- visitor scheduler 现有测试；
- event settlement 现有测试；
- opportunity card 现有测试；
- current_relationship_facts ownership restore；
- conversation_log 跨对话测试。

### 命令

    node --test tests/character-memory.test.mjs
    node --test --test-name-pattern="presence|visitor|arrival|departure|conversation" tests/ui-contract.test.mjs
    node --test tests/m2-r38-r45.test.mjs
    npm run check:ui
    npm test

### 不得声称

这些静态/Node 测试不能证明：

- 实机新聊天初始化；
- swipe 隔离；
- reload 持久化；
- message-floor 精确写回；
- same-floor；
- iframe timing。

这些全部写“运行时待验”，本批不做探针。

---

## 16. B1-T12：文档同步、差异审计与交付

### 开始前必须重读

- tavern-card-builder/SKILL.md
- tavern-card-builder/references/validation.md
- sillytavern-database-rolecards/SKILL.md
- sillytavern-api-reference/SKILL.md
- 总计划 §11 Phase 0–3、§13–§15
- 本手册全文，尤其 §0、§3、§16

### 目标

交付一个可由另一个 agent 仅看代码逻辑验收的第一批结果。

### 必须更新

- src/schema/field-ledger.md；
- project/gal-character-memory-batch-1-implementation-log.md；
- project/api-provenance.md：仅在实际新增/依赖版本敏感 API 时更新；
- 必要的测试说明。

### 实施日志最终结构

1. 目标与排除项；
2. 阅读回执；
3. 基线；
4. 写点盘点；
5. 文件变更表；
6. 数据模型版本；
7. migration fixtures 结果；
8. lifecycle 矩阵结果；
9. 定向测试结果；
10. check:ui 结果；
11. npm test 结果；
12. 未做的运行时验收；
13. 遗留到第二批的工作；
14. git status 与无关改动声明。

### 最终差异审计

必须执行：

    git diff --check
    git status --short
    git diff -- src/schema src/ui tests project
    rg -n "conversation_log|current_relationship_facts|visit_memory|character_visit" src tests

审计问题：

- 是否误改 prompt-context？
- 是否误改 target-actions？
- 是否误改 generate/regenerate？
- 是否删除旧字段？
- 是否新增数据库调用？
- 是否改 package/build/R2？
- 是否出现 Date.now/random ID？
- 是否出现第二份容量常量？
- 是否每个 presence 写点都有结论？

### 最终命令

    npm run check:ui
    npm test

禁止运行：

    npm run build:ui
    npm run build:ui:test
    npm run package:checkpoint
    npm run publish:ui:test:dry

本批不需要构建 UI，因为没有授权打包/发布，且构建产物会污染差异。

---

## 17. 第一批验收清单

验收 agent 应逐项检查，任一硬项失败则退回。

### 17.1 范围

- [ ] 没改 generate/injects/chat history；
- [ ] 没改重生成；
- [ ] 没接数据库；
- [ ] 没打包、发布或写 dist；
- [ ] 没删除旧字段/旧协议；
- [ ] 没覆盖用户无关改动。

### 17.2 schema

- [ ] visit_memory 位于 interaction；
- [ ] model version 固定；
- [ ] by_character 为动态字典；
- [ ] 固定角色各自独立；
- [ ] schema object 保留 unknown fields；
- [ ] counter 存在且合法；
- [ ] 结构上限与业务上限区分清楚。

### 17.3 容量

- [ ] 每角色 48 条剧情梗概；
- [ ] 每角色 12 条关系记忆；
- [ ] reimu 满额不挤 marisa；
- [ ] active/closed 合计不超过 48；
- [ ] active state 唯一；
- [ ] boundary/conflict 不被普通甜蜜事件随意裁掉。

### 17.4 迁移

- [ ] conversation_log 原字段保留；
- [ ] current_relationship_facts 原字段保留；
- [ ] legacy story 不伪造成 visit；
- [ ] 未知角色进入 unassigned；
- [ ] 不猜日期；
- [ ] 不把 kiss/sex 自动判 lover；
- [ ] 迁移可重复；
- [ ] 旧源新增项可增量导入；
- [ ] unknown fields 保留。

### 17.5 生命周期

- [ ] absent→present 新开；
- [ ] present→absent 关闭；
- [ ] present→present 不变；
- [ ] area 变化不切；
- [ ] 关闭 GAL 不切；
- [ ] leave/re-enter 两 ID；
- [ ] replay 幂等；
- [ ] scheduler/event/model/opportunity 全覆盖；
- [ ] visitor meta 删除前已捕获；
- [ ] 使用游戏时钟。

### 17.6 质量

- [ ] 领域 helper 为纯函数；
- [ ] 无随机/现实时间 ID；
- [ ] 无 any 糊弄；
- [ ] 无重复容量常量；
- [ ] check:ui 通过；
- [ ] npm test 通过；
- [ ] 实施日志证据完整；
- [ ] 运行时未验项没有伪装 PASS。

---

## 18. 第一批完成后必须明确遗留

下列项目必须写入交接，不能偷偷顺手做：

1. 生成成功后如何创建 VisitTurn；
2. relationship_memory_candidates 和正文证据校验；
3. 旧 conversation_log 写入停止时机；
4. current_relationship_facts 写入切换时机；
5. synthetic history 投影；
6. 非空历史边界；
7. user_input 与 system inject 分离；
8. send/retry/recovery 接入；
9. regenerate swipe 同构；
10. standalone/database-assisted 构建；
11. 数据库归档/召回；
12. 实机多楼层、swipe、reload 验收。

如果实施 agent 声称第一批完成了上述项目，验收 agent 应优先检查它是否越界。

---

## 19. 给实施 agent 的最终交付格式

最终回复必须包含：

- 完成的小任务编号；
- 修改文件清单；
- 新 model/version；
- 每角色 48/12 的实现位置；
- migration 幂等证据；
- presence 写点覆盖表；
- check:ui 与 npm test 精确结果；
- 未运行探针/未打包/未发布声明；
- 运行时待验清单；
- 当前 git status；
- 请求验收，不请求直接发布。

禁止只回复“已完成，测试全绿”。那种回复信息量和睡着差不多。
