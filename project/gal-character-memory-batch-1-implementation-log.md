# GAL 角色记忆重构：第一批「数据基础」实施日志

> 对应手册：project/gal-character-memory-batch-1-data-foundation-runbook.md
> 对应总计划：project/gal-character-visit-memory-and-synthetic-history-plan.md
> 目标运行时：SillyTavern 1.18.0 + Tavern Helper / JS-Slash-Runner 4.8.18
> 本批明确不做 runtime probe（实机探针）。所有行为以静态测试与代码逻辑证据为准。

---

## 1. 目标与排除项

### 本批实施（第一批数据地基）

- 新 interaction.visit_memory 数据结构（MVU 多楼层承载）；
- 每角色独立的剧情记忆与关系记忆结构（48 条剧情梗概 / 12 条关系记忆）；
- 角色到达/离开打开或关闭 visit 的纯生命周期协调器；
- 纯函数规范化、裁剪与 upsert 记忆；
- conversation_log → legacy memory 确定性增量迁移；
- current_relationship_facts → relationship_memories 确定性迁移；
- 接入全部生产 presence 写点（只接线生命周期，不碰生成请求）；
- schema 与迁移测试、生命周期与接线测试。

### 明确排除（本批不做）

- 提示投影切换（synthetic history 投影）；
- generate/injects 发送事务改造；
- VisitTurn 生产写入者（新生成回复不自动写 VisitTurn）；
- 暂停/重试改造；
- 重生成改造；
- relationship_memory_candidates inbox；
- 数据库归档/召回；
- UI 打包；
- R2 发布；
- 实机探针（runtime probe）。

### 允许存在的过渡状态（本批结束时）

- 新 interaction.visit_memory 已存在；
- 每角色拥有独立剧情/关系记忆结构；
- 角色到达/离开会打开或关闭 visit；
- 纯函数能规范化、裁剪和 upsert 记忆；
- 旧 conversation_log 仍保留并仍由旧协议写入；
- 旧 current_relationship_facts 仍保留并仍由现有事件/变量链使用；
- 新提示投影未启用；
- 新生成回复尚未自动写 VisitTurn；
- relationship_memory_candidates 尚未加入。

---

## 2. 阅读回执

按手册 §1 门禁，每个任务开始前完整重读固定文档。以下为各任务的实际阅读记录。

### 固定门禁文档（全批通用）

| 文档 | 状态 |
|---|---|
| C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md | 已完整阅读 |
| C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md | 已完整阅读 |
| C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md | 已完整阅读 |
| project/gal-character-visit-memory-and-synthetic-history-plan.md | 已完整阅读 |
| project/contract.md | 已完整阅读 |
| project/api-provenance.md | 已完整阅读 |
| src/schema/field-ledger.md | 已完整阅读 |

### 各任务增量阅读

（每个任务开始时追加本表）

---

## 3. 基线（B1-T00）

- 当前日期：2026-08-09 00:18（本地）
- Node 版本：v24.18.0
- npm 版本：11.16.0
- 分支：main（359ec43，up to date with origin/main）
- SillyTavern 目标版本：1.18.0
- Tavern Helper / JS-Slash-Runner 目标版本：4.8.18
- package.json 命令：
  - test：`node --test tests/*.test.mjs`
  - check:ui：`tsc --noEmit`
- 本批明确不做 runtime probe。

### 基线结果

| 命令 | 结果 | 时间 |
|---|---|---|
| `npm run check:ui` | PASS（tsc --noEmit 无错误） | 2026-08-09 00:18 |
| `npm test` | PASS 317/317（fail 0, cancelled 0, skipped 0），duration 7.26s | 2026-08-09 00:19 |

基线全部通过，无需记录失败项。

### git status 截面（B1-T00 时点）

工作树存在用户未提交改动（本批之前已存在，不属本批产生）：

- 已修改（modified）：`.reasonix/desktop-topic-auto-title-meta.json`、`.reasonix/desktop-topic-created-at.json`、`.reasonix/desktop-topic-title-sources.json`、`.reasonix/desktop-topic-titles.json`、`package.json`、`project/api-provenance.md`、`scripts/build-ui.mjs`、`scripts/package-checkpoint.mjs`、`scripts/publish-ui.mjs`、`src/runtime/ui-host-shell.js`、`src/runtime/ui-loader.js`、`src/ui/app.ts`、`src/ui/async-coordination.ts`、`src/ui/bridge.ts`、`src/ui/index.html`、`src/ui/message-transaction.ts`、`src/ui/types.ts`、`tests/ui-contract.test.mjs`
- 未跟踪（untracked）：`.playwright-mcp/`、`.reasonix/attachments/...`、多个 project/*.md、`scripts/upload-live-asset.mjs`、`src/ui/gal-generation-request.ts`、多个 tests/*.test.mjs、verify-*.log

说明：上述改动均为本批开始前已存在，属于用户/历史会话的工作树状态。本批不会 reset/checkout/clean/stash，也不会覆盖无关改动。本批只修改手册 §3.1 允许的文件并新增实施日志。

### B1-T00 完成证据

- 实施日志已建立（本文件）；
- 基线命令通过数/失败数/时间已记录；
- git status 截面已写入；
- 本任务没有生产代码 diff。

---

## 4. 写点盘点（B1-T01）

阅读回执（B1-T01）：

    [B1-T01][read] tavern-card-builder/SKILL.md
    [B1-T01][read] tavern-card-builder/references/variable-systems.md
    [B1-T01][read] sillytavern-database-rolecards/SKILL.md
    [B1-T01][read] sillytavern-database-rolecards/references/floor-and-ui-binding.md
    [B1-T01][read] 总计划 §3、§5、§6、§10
    [B1-T01][read] 第一批手册 §2、§3、§5

搜索命令（环境无 rg，以等价 grep 执行）：

    grep "conversation_log|current_relationship_facts" src tests project
    grep "presence_snapshot|present_character_ids|visitor_meta" src/ui tests
    grep "applyPresenceUpdate|applyLocalPresenceTransition|evaluateVisitScheduler" src/ui tests
    grep "uid_counters|periodSerialFromState" src/ui src/schema

### 4.1 presence 写点清单

| 数据/写点 | 文件 | 函数 | 当前写入者 | 本批处理 |
|---|---|---|---|---|
| presence_snapshot 整体重建（模型回执） | src/ui/event-settlement.ts:170 | `applyPresenceUpdate` | 本地（解析 assistant `<GensokyoPresence>`） | B1-T09 接线协调器（内部已协调，bridge 不再重复） |
| presence_snapshot 整体重建（本地事件迁移） | src/ui/event-settlement.ts:281 | `applyLocalPresenceTransition` | 本地事件结算（applyLocalSettlement:829 调用） | B1-T09 接线协调器 |
| 直接追加 present_character_ids（事件路径） | src/ui/event-settlement.ts:447-457 | `settleRumor`（marisa 到达） | 本地事件结算 | B1-T09 接线协调器（事件路径） |
| visitor scheduler 到期离场 | src/ui/visitor-rules.ts:192 | `evaluateVisitScheduler`（departures 217-229） | bridge（经 reconcileM2Runtime） | B1-T09 接线协调器 |
| visitor scheduler 计划到达 | src/ui/visitor-rules.ts:192 | `evaluateVisitScheduler`（arrivals 259-280） | bridge（经 reconcileM2Runtime） | B1-T09 接线协调器 |
| 邀请立即到达 | src/ui/visitor-rules.ts:424 | `inviteCharacter`（accept_now → evaluateVisitScheduler） | bridge | 经 scheduler 覆盖 |
| opportunity card 到达 | src/ui/visitor-rules.ts:477 | `commitOpportunityArrival` | card-item-rules.useOpportunityCard:107 | B1-T09 接线协调器（opportunity 路径） |
| 宴会 overflow 离场标记 | src/ui/activity-rules.ts:240-270 | `markBanquetOverflowForDeparture` | 本地活动规则（改 planned_departure_serial，不直接改在场集合） | 只改 departure 期限，实际离场仍走 scheduler；B1-T09 确认 |
| bridge 调用点 1 | src/ui/bridge.ts:871 | `persistLocalSettlement` 内 applyPresenceUpdate | bridge | B1-T09 内部已协调则不再重复 |
| bridge 调用点 2 | src/ui/bridge.ts:930 | `preserveLocalOwnership` 内 applyPresenceUpdate | bridge | B1-T09 内部已协调则不再重复 |
| bridge 调用点 3 | src/ui/bridge.ts:1888 | regenerate 结算内 applyPresenceUpdate | bridge | B1-T09 内部已协调则不再重复 |
| bridge 复读校验（只读） | src/ui/bridge.ts:1627 | useOpportunityCard 校验 | bridge | 不改 |
| m2-runtime 统一调度 | src/ui/m2-runtime.ts:10 | `reconcileM2Runtime`（内部调 evaluateVisitScheduler ×2） | bridge | B1-T09 确认 scheduler 内协调后不重复 |
| 宴会公共模式填位 | src/ui/activity-rules.ts:214 | `startDueBanquet` 内 evaluateVisitScheduler | bridge | 经 scheduler 覆盖 |
| end_conversation_local | src/ui/m2-commands.ts:127-131 | endConversationLocal + reconcileM2Runtime ×2 | bridge | 关闭 GAL 不离场（B1-T08 测试证明） |
| 测试工具（非生产） | src/ui/test-tools.ts:146,200-228,282-286,334-346 | jump 状态构造 / presence 测试动作 | 测试适配层 | 单独分类，不冒充生产路径；B1-T09 通过 migration/repair 获得新结构 |
| 旧状态迁移 presence 归一 | src/ui/state-migrations.ts:187-196 | migrateGardenState | 迁移器 | 保留；visitor_meta 清理逻辑不动 |

### 4.2 current_relationship_facts 写点

| 写点 | 文件 | 函数 | 本批处理 |
|---|---|---|---|
| 事件写入（marisa 自由生长方案） | src/ui/event-settlement.ts:531-542 | `settleFreeGrowthProposal` | 保留（本批不切写入者） |
| 事件写入（alice 维护边界） | src/ui/event-settlement.ts:565-576 | `settleAliceMaintenanceProposal` | 保留 |
| 事件写入（nitori 工程验收） | src/ui/event-settlement.ts:599-610 | `settleNitoriAutomationProposal` | 保留 |
| ownership restore（marisa facts） | src/ui/event-settlement.ts:964-968 | `restoreLocalEventOwnership` | 保留；现有测试必须继续通过 |
| 变量模型写入协议 | src/lorebook/variable-update-rules.md / variable-output-format.md | 模型 JSONPatch | 保留（本批禁止修改） |
| schema/initial-state | src/schema/02-mvu-schema.js:37 / initial-state.json | list 12 条 | 保留 |

### 4.3 conversation_log 读写链

| 环节 | 位置 | 说明 | 本批处理 |
|---|---|---|---|
| schema | src/schema/02-mvu-schema.js:173 | `list(text('',120),24)` | 保留 |
| initial-state | src/schema/initial-state.json:179 | `[]` | 保留 |
| 迁移归一 | src/ui/state-migrations.ts:138-145 | string/array 归一化 | 保留（B1-T06 在其后读源，不破坏） |
| prompt 投影 | src/ui/prompt-context.ts:49 | 回顾投影读取 | 保留（本批不改投影） |
| 模型写入协议 | src/ui/target-actions.ts:28 + variable-output-format.md | `/-` 追加 JSONPatch | 保留（禁止修改） |
| 测试 | tests/ui-contract.test.mjs:1626-1668 | 跨对话记忆、string 兜底、结束对话不清空 | 保留（不得删除） |

### 4.4 uid_counters / periodSerialFromState

- uid_counters：types.ts:346、initial-state.json:326-332（character/event/interaction/battle/relationship_fact）、state-migrations.ts:150-152（interaction 兜底为 1）。本批新增 `character_visit` 计数器（B1-T03/T04），初始值 ≥1。
- periodSerialFromState：time-rules.ts:60，全项目复用。生命周期协调器复用它（B1-T08）。

### 4.5 只读投影（本批不改）

prompt-context.ts、target-actions.ts、garden-map.ts、garden-spatial.ts、activity-rules.ts、card-item-rules.ts、character-greenlights.ts、special-item-rules.ts、opening.ts、duel-victory-projection.ts 中所有读取 presence_snapshot 的地方均为只读，不在本批修改范围。

### 4.6 裁定

- 生产 presence 写点已全部找到并可解释调用顺序（见上表），无未知直接写点，不触发停止线；
- 测试工具单独分类（4.1 表末），不冒充生产路径；
- 固定角色名单（来自 initial-state.json:116-165）：reimu、marisa、cirno、alice、mystia、suika、nitori、sakuya 共 8 人，B1-T04 从该文件读取，不手打第二份。

---

## 5. 数据契约（B1-T02）

阅读回执（B1-T02）：

    [B1-T02][read] tavern-card-builder/SKILL.md
    [B1-T02][read] tavern-card-builder/references/variable-systems.md
    [B1-T02][read] sillytavern-database-rolecards/SKILL.md
    [B1-T02][read] sillytavern-database-rolecards/references/rolecard-data-model.md
    [B1-T02][read] 总计划 §4、§5
    [B1-T02][read] 第一批手册 §2、§6

固定模型标识（已写入 src/schema/field-ledger.md）：

    modelId: gensokyo-character-memory
    modelVersion: character-visit-memory.v1
    storage.root: stat_data.interaction.visit_memory
    storage.scope: message
    storage.strategy: multi-floor

根结构：visit_memory { version, by_character, legacy_unassigned, migration }
CharacterMemory：character_id / active_visit / closed_visits / legacy_memories / relationship_memories
VisitRecord：visit_id / character_id / source / arrival_uid / started_* / ended_* / end_reason / turns
VisitTurn：turn_id（=request_id:character_id）/ request_id / character_id / scene_id / assistant_message_id / assistant_swipe_id / latest_attempt_id / latest_commit_key / day / time_period / period_serial / summary
RelationshipMemory：relationship_memory_id（legacy_relation:<char>:<fact.id>）/ character_id / request_id / visit_id / day / time_period / period_serial / kind / relationship_label / event_kind / summary / significance / active / latest_attempt_id / latest_commit_key
LegacyMemory：legacy_id / character_id / text / source（conversation_log.v0）
uid_counters.character_visit：初始 ≥1，单调左补零。

migration 元数据：revision（非 boolean 开关）+ conversation_log_fingerprint + relationship_facts_fingerprint + migrated_at_serial；fingerprint 仅判断输入变化/诊断，不代替记录级 upsert；旧事实变化后即使 ID 见过也必须更新。

### B1-T02 完成证据

- field-ledger.md 已新增「GAL 角色记忆模型（第一批 v1）」章节（先于 schema 完成）；
- 每字段有 default/writer/reader/cleanup/migration；
- 集中容量常量、入场边界、写入权、裁剪规则全部冻结在 field-ledger 中；
- 无无生命周期字段；
- 本任务没有生产代码 diff（仅文档）。

---

## 6. TypeScript 类型与集中常量（B1-T03）

阅读回执（B1-T03）：

    [B1-T03][read] tavern-card-builder/SKILL.md
    [B1-T03][read] tavern-card-builder/references/variable-systems.md
    [B1-T03][read] sillytavern-database-rolecards/SKILL.md
    [B1-T03][read] 总计划 §4.1–§4.7
    [B1-T03][read] 第一批手册 §2、§6、§7

### 修改文件

- src/ui/types.ts：新增角色记忆类型块（位于 CardRuntimeState 之后）：
  - CharacterMemoryVersion、CharacterMemorySource、CharacterVisitEndReason、RelationshipMemoryKind、RelationshipLabel、RelationshipEventKind；
  - LegacyMemory、VisitTurn、VisitRecord、RelationshipMemory、CharacterMemory、CharacterVisitMigrationMetadata、CharacterVisitMemoryState；
  - GardenState.interaction.visit_memory（CharacterVisitMemoryState）；
  - GardenState.uid_counters.character_visit。
- 新建 src/ui/character-memory.ts：集中容量常量（B1-T03 只放常量与固定标识，纯函数 B1-T05 填充）：
  - STORY_SUMMARIES_PER_CHARACTER=48、ACTIVE_TURNS_PER_CHARACTER=16、CLOSED_VISITS_PER_CHARACTER=4、TURNS_PER_CLOSED_VISIT=16、LEGACY_MEMORIES_PER_CHARACTER=16、LEGACY_UNASSIGNED_LIMIT=24、RELATIONSHIP_MEMORIES_PER_CHARACTER=12、TURN_SUMMARY_CHARS=160、RELATIONSHIP_SUMMARY_CHARS=160；
  - CHARACTER_MEMORY_VERSION、CHARACTER_MEMORY_MODEL_ID、CHARACTER_VISIT_ID_PREFIX、LEGACY_RELATIONSHIP_ID_PREFIX。

### 定向验证

    npm run check:ui → PASS（tsc --noEmit 无错误）

### 禁区遵守

- 无 any 逃避结构；枚举均为字面量联合；
- 未改现有 unrelated GardenState 类型（interaction/uid_counters 仅在既有结构上追加字段）；
- 未重排 types.ts；未在 app.ts/bridge.ts 定义镜像类型。

---

## 7. Zod schema 与 initial-state（B1-T04）

阅读回执（B1-T04）：

    [B1-T04][read] tavern-card-builder/SKILL.md
    [B1-T04][read] tavern-card-builder/references/variable-systems.md
    [B1-T04][read] sillytavern-database-rolecards/SKILL.md
    [B1-T04][read] sillytavern-database-rolecards/references/rolecard-data-model.md
    [B1-T04][read] 总计划 §4、§10
    [B1-T04][read] 第一批手册 §2、§6–§8

### 修改文件

- src/schema/02-mvu-schema.js：
  - 新增独立子 schema（不内联巨大对象）：legacyMemorySchema、visitTurnSchema、visitRecordSchema、relationshipMemorySchema、characterMemorySchema、characterVisitMigrationSchema、visitMemoryStateSchema；
  - 每个 object 使用 passthrough；文本复用现有 text helper；数组复用现有 list helper；
  - nullable 字段把 z.null() 放 union 最前（zod v3 中 `z.coerce.number()` 会把 null 转 0、text 会把 null catch 成 ''，null 放前保证 null 语义与 TS 类型一致）；
  - relationship_memories 限 12、closed_visits 限 4（每 turns 限 16）、active turns 限 16、legacy 16、unassigned 24；
  - 角色总计 48 由 character-memory normalizer 执行（注释注明，Zod 不假装证明）；
  - interaction.visit_memory 挂入；uid_counters.character_visit 新增（min=1）。
- src/schema/initial-state.json：
  - interaction.visit_memory.version = character-visit-memory.v1；
  - 8 个首发固定角色（reimu/marisa/cirno/alice/mystia/suika/nitori/sakuya）各有独立 CharacterMemory 空结构（active_visit: null，由 load 时 bootstrap/repair 创建）；
  - legacy_unassigned: []；migration 元数据初始（revision ''、fingerprint null、migrated_at_serial null）；
  - conversation_log 原样保留；current_relationship_facts 原样保留；
  - uid_counters.character_visit = 1。
  - 固定角色 key 从 initial-state.json 读取（与 B1-T01 名单一致，未手打第二份）。

### 定向验证

    node -e "JSON.parse(initial-state.json)" → OK
    node --check src/schema/02-mvu-schema.js → 语法 OK
    npm run check:ui → PASS
    node --test --test-name-pattern="schema|initial|memory|conversation_log" tests/ui-contract.test.mjs → 3/3 PASS

### 禁区遵守

- 未删除 current_relationship_facts；未把 relationship memory 塞进 characters 与 interaction 两处；
- 未把 schema catch 写成清空整个 by_character 的宽泛兜底（dictionary 逐角色 passthrough，malformed 单角色不清空其他角色）；
- 未改远程 mvu_zod import；未改加载器版本。

---

## 8. 纯 normalizer、容量裁剪与 ID helper（B1-T05）

阅读回执（B1-T05）：

    [B1-T05][read] tavern-card-builder/SKILL.md
    [B1-T05][read] tavern-card-builder/references/variable-systems.md
    [B1-T05][read] sillytavern-database-rolecards/SKILL.md
    [B1-T05][read] sillytavern-database-rolecards/references/rolecard-data-model.md
    [B1-T05][read] 总计划 §4.3–§4.7、§5
    [B1-T05][read] 第一批手册 §2、§6–§9

### 修改文件

src/ui/character-memory.ts（从常量文件扩展为纯领域库）：

- 确定性 hash：`deterministicStringHash`（FNV-1a 32-bit → 8 hex）；用途限制注释明确非密码学安全；碰撞由 migration 按 stable ID 去重逻辑覆盖（B1-T10 碰撞测试）。
- 空结构与 ensure：`createEmptyCharacterMemory`、`ensureVisitMemoryRoot`、`ensureCharacterMemory`。
- normalize 家族（保留未知字段；无稳定 ID 的 malformed 项拒绝而非编造）：`normalizeLegacyMemory`、`normalizeVisitTurn`、`normalizeVisitRecord`、`normalizeRelationshipMemory`、`normalizeCharacterMemory`、`normalizeMigrationMetadata`、`normalizeVisitMemoryState`。
- 容量裁剪：`trimStoryMemoriesTo48`（active ≤16、closed ≤4、每 closed ≤16、合计 ≤48；active 优先、从最新 closed 向更旧填充、允许 closed 留空但保留 visit 边界、turn_id 去重保留最新版本）、`trimRelationshipMemoriesTo12`（唯一 active relationship_state：serial 最大/同值取数组最后、其余标 inactive 不删除；优先级 active state > active boundary/conflict > sig3 > 其他；组内 sig/新度；最终按原数组顺序）、`normalizeCharacterMemoryToCapacity`。
- ID helper：`nextCharacterVisitId`（character_visit_ + 左补零 6 位单调 counter；非法 counter 从 1 归一；禁 Date.now/random）。
- upsert helper（本批仅供迁移与测试，不接生产 LLM 写入）：`upsertVisitTurn`（无 active visit 时 no-op）、`upsertRelationshipMemory`。
- 便捷读取：`getCharacterMemory`。

### 纯函数约束

- 不读取 window/document；不调用 Mvu；不调用数据库；不修改传入对象（一律新对象或内容等价引用）；
- 不生成现实时间；不读取真实消息楼层；相同输入相同输出（hash/裁剪/ID 均已验证确定性）。

### 验证

    npm run check:ui → PASS
    临时 esbuild 冒烟脚本（已删除）：
      - visitId 左补零单调：character_visit_000001 → 000002；非法 counter 归一 1
      - trim48：4×16 closed + 16 active = 80 → 48（active 16 + 最新两个 closed 各 16，最旧两个 closed 清空但保留 visit 边界）
      - turn dedupe：同 turn_id 保留 UPDATED 版本
      - trim12：3 个 active state → 仅 st-b（serial 最大）保留 active，其余标 inactive 保留，总量 12
      - normalize：无 turn_id 的 malformed 项拒绝；未知字段（custom/unknownField）保留
      - hash 确定性：同输入同输出
    npm test → 317/317 PASS（无回归）

---

## 9. conversation_log 增量迁移（B1-T06）

阅读回执（B1-T06）：

    [B1-T06][read] tavern-card-builder/SKILL.md
    [B1-T06][read] tavern-card-builder/references/validation.md
    [B1-T06][read] sillytavern-database-rolecards/SKILL.md
    [B1-T06][read] sillytavern-database-rolecards/references/rolecard-data-model.md
    [B1-T06][read] 总计划 §4.1、§4.3、§10.1
    [B1-T06][read] 第一批手册 §2、§6–§10

### 修改文件

- src/ui/character-memory.ts：
  - `parseConversationLogEntry`（半角/全角冒号前缀解析）；
  - `normalizeConversationLogText`（剥前缀、去空白、截断 120）；
  - `legacyStoryIdFor`（legacy_story: + 角色 + 文本 FNV hash）；
  - `migrateConversationLogToLegacyMemory`：读源 conversation_log（不删源）、已知角色分派/未知无前缀空正文进 unassigned、稳定 legacy_id 幂等去重、增量导入、每角色 legacy ≤16 与 unassigned ≤24 FIFO 裁剪、更新 migration.revision='conversation-log.v1' 与 conversation_log_fingerprint（fingerprint 仅诊断，不代替记录级 upsert；revision 不是永远跳过开关——每次逐条重跑幂等导入）、失败时源保留。
- src/ui/state-migrations.ts：
  - `migrateGardenState` 在 conversation_log 归一化后调用 `migrateConversationLogToLegacyMemory`；
  - `const state` → `let state`（承接返回的新对象；其余原地 mutate 不变）。

### 验证

    npm run check:ui → PASS
    npm test → 317/317 PASS（conversation_log 既有测试无回归）
    临时冒烟脚本（已删除）：
      - 半角/全角冒号解析均正确；已知角色分派、未知/无前缀进 unassigned、空条目跳过、重复源去重
      - 幂等：重复运行不重复追加
      - 增量：新源项只导入新 legacy
      - 删除源项后 legacy 保留不重复导入
      - 容量：17 条 → 16 条
      - 无 characters 字典时"reimu:" 前缀视为未知进 unassigned（合理降级）
      - 空 state 建立合法 visit_memory 根

### 禁区遵守

- 未删除/修改旧 conversation_log 写入者（target-actions.ts 协议、prompt 投影原样）；
- 迁移失败路径不删源（函数只读源）；
- 未用 revision 做跳过开关。

---

## 10. 迁移 current_relationship_facts（B1-T07）

阅读回执（B1-T07）：

    [B1-T07][read] tavern-card-builder/SKILL.md
    [B1-T07][read] tavern-card-builder/references/variable-systems.md
    [B1-T07][read] sillytavern-database-rolecards/SKILL.md
    [B1-T07][read] sillytavern-database-rolecards/references/rolecard-data-model.md
    [B1-T07][read] 总计划 §4.6、§5.3、§10.4
    [B1-T07][read] 第一批手册 §2.3、§6、§9、§11

### 修改文件

- src/ui/character-memory.ts：
  - `LEGACY_FACT_KIND_WHITELIST`：受控 kind 白名单（alice_maintenance_boundary → boundary）；不做模糊关键词推断；relationship_state 无严格结构表达时本批不产生；
  - `legacyFactContentKey`：内容级一致性比较键；
  - `migrateRelationshipFactsToMemory`：character_id 来自 characters 外层 key（不信 subjects）；relationship_memory_id = legacy_relation:<char>:<fact.id>；request_id ''、visit_id null、day/time/serial null；summary ≤160；significance 2；active 继承；kind 白名单或 milestone；relationship_label/event_kind 无受控可证明表达 → null（不因"亲密/喜欢"猜 lover/adult_intimacy/confession）；内容级一致性（active/fact/last_confirmed_at/established_at 变化即更新，即使 ID 见过）；幂等；每角色 ≤12 裁剪；passthrough 保留 last_confirmed_at/established_at。
- src/ui/state-migrations.ts：在 conversation_log 迁移后调用 migrateRelationshipFactsToMemory。

### 验证

    npm run check:ui → PASS
    npm test → 317/317 PASS（现有 event settlement 关系事实测试无回归）
    临时冒烟脚本（已删除）：
      - 白名单 kind：alice_maintenance_boundary → boundary；其他 → milestone；label 全 null
      - 旧字段保留（id/subjects/fact 原样）
      - 幂等：重复迁移不重复
      - 内容级一致性：active=false + fact 变更后 relationship memory 更新
      - 容量：15 条 → 12 条
      - fingerprint 按角色记录

### 禁区遵守

- 未删除/重命名 current_relationship_facts；未设只读；未改 event-registry projection keys；未改变量模型规则；
- 未加入 relationship candidate inbox；未根据 visual_mode 生成关系记录；未把亲密自动等于恋人。

---

## 11. 纯入场生命周期协调器（B1-T08）

阅读回执（B1-T08）：

    [B1-T08][read] tavern-card-builder/SKILL.md
    [B1-T08][read] tavern-card-builder/references/variable-systems.md
    [B1-T08][read] sillytavern-database-rolecards/SKILL.md
    [B1-T08][read] sillytavern-api-reference/SKILL.md
    [B1-T08][read] 总计划 §2、§6
    [B1-T08][read] 第一批手册 §2.4、§9、§12

### 修改文件

src/ui/character-memory.ts 新增：

- `PresenceSnapshotInput`、`VisitClock`、`ReconcileCharacterVisitsInput`、`ReconcileCharacterVisitsResult`；
- `clockFromState`：仅 environment.day/time_period + periodSerialFromState 派生；禁止现实时间；
- `reconcileCharacterVisits`：规范化去重 before/after ID；先关 departed（填结束字段压入 closed_visits、旧 meta 从 before 取）再开 arrived（新 counter ID、arrival_uid 从 after 取）；present→present 不重开、absent→absent 无操作；结束逐角色容量 normalizer；
- cause 映射：scheduler→scheduler/scheduled-departure；event→event/event-leave；model-presence→model-presence/presence-receipt；bootstrap→bootstrap/reconcile；reconcile→reconcile/reconcile；
- 幂等重放：已有 active 的 arrived no-op、无 active 的 departed no-op、counter 不重复增、closed 不重复；
- `repairCharacterVisitsAgainstPresence`：present 无 active → bootstrap 开；absent 有 active → reconcile 关；仅 migration/load repair 调用；两段式 reconcile（先关后开）；
- `reconcileCharacterVisitsFromState`：生产接线/测试入口；memory 与 counter 优先取 after，缺失回退 before。

### 验证

    npm run check:ui → PASS
    npm test → 317/317 PASS（无回归）
    临时冒烟脚本（已删除），连续流验证：
      - open：000001/000002、source=model-presence、arrival_uid、started_serial=9、counter 3
      - present→present（view 变化）不重开、counter 不变
      - close：end_reason=scheduled-departure、ended_serial=9、counter 保持
      - 幂等重放：closed 不重复、marisa 仍 active、counter 不变
      - 同事务 leave 再 arrive：新 visit 000003 ≠ 000001、source=event、counter 4
      - repair：异常 active → reconcile close；在场无 active → bootstrap open
      - 关闭 GAL：current_session→null、presence 不变、active visit ID 不变（禁区遵守）

### 停止线检查

- 能区分 transition replay（幂等 no-op）与异常 repair（独立入口）→ 未触发停止线。

---

## 12. 接入全部生产 presence 写点（B1-T09）

阅读回执（B1-T09）：

    [B1-T09][read] tavern-card-builder/SKILL.md
    [B1-T09][read] tavern-card-builder/references/variable-systems.md
    [B1-T09][read] sillytavern-database-rolecards/SKILL.md
    [B1-T09][read] sillytavern-database-rolecards/references/floor-and-ui-binding.md
    [B1-T09][read] sillytavern-api-reference/SKILL.md
    [B1-T09][read] 总计划 §2.1、§6、§7.2
    [B1-T09][read] 第一批手册 §2.3、§9、§13

### 写点覆盖表

| 写点 | 文件:行 | 处理 | cause |
|---|---|---|---|
| applyPresenceUpdate（模型回执） | src/ui/event-settlement.ts:170 | integrated（返回前协调） | model-presence |
| applyLocalSettlement 统一协调（覆盖 applyLocalPresenceTransition 与 settleRumor 直接追加） | src/ui/event-settlement.ts:829 后 | integrated | event |
| evaluateVisitScheduler departures/arrivals | src/ui/visitor-rules.ts:192（返回前） | integrated | scheduler |
| commitOpportunityArrival（opportunity card） | src/ui/visitor-rules.ts:477（返回前） | integrated | event（本地受控道具路径，裁定不使用模型/时间 cause） |
| migrateGardenState repair（load/migration） | src/ui/state-migrations.ts:249 | integrated | bootstrap/reconcile |
| endConversationLocal（关闭 GAL） | src/ui/activity-rules.ts:276 | intentionally NOT integrated（禁区：关闭 GAL 不离场） | — |
| m2-runtime reconcileM2Runtime | src/ui/m2-runtime.ts | intentionally covered by owning helper（内部 evaluateVisitScheduler 已协调） | — |
| bridge 三处 applyPresenceUpdate 调用 | src/ui/bridge.ts:871/930/1888 | intentionally covered by owning helper（applyPresenceUpdate 内部已协调） | — |
| bridge useOpportunityCard | src/ui/bridge.ts:1613 | intentionally covered by owning helper（commitOpportunityArrival 已协调） | — |
| test-tools 状态构造 | src/ui/test-tools.ts | intentionally covered（经 migrateGardenState/repair 获得新结构；不放松生产 invariants） | — |
| activity-rules banquet overflow | src/ui/activity-rules.ts:240-270 | intentionally covered by owning helper（只改 planned_departure_serial，实际离场走 evaluateVisitScheduler） | — |

### 防双调用证明（冒烟验证）

- applyPresenceUpdate 内部已协调后，再经 reconcileM2Runtime（内部 evaluateVisitScheduler ×2）：visit ID 相同、counter 不翻倍；
- opportunity 到达经 card-item-rules → commitOpportunityArrival（已协调），bridge 不再协调。

### 验证

    npm run check:ui → PASS
    npm test → 317/317 PASS（无回归；现有 presence 测试预期不变）
    临时冒烟脚本（已删除）：
      1 applyPresenceUpdate → marisa visit 打开（model-presence，counter 2）
      2 evaluateVisitScheduler departure → scheduled-departure 关闭
      3 opportunity arrival → event 打开
      4 settleRumor 直接追加 marisa → event 打开（counter 2）
      5 nested：counter 不翻倍、visit 不重复
      6 migrateGardenState repair → reimu bootstrap 打开

### 禁区遵守

- 未触碰 generate/regenerate 事务；未解析正文生成 VisitTurn；未改 prompt；未创建楼层；未调用 Mvu 写新楼层；
- 未改事件结算结果（原有 presence/资源/事实断言全部保持）；
- area/view 变化不触发 leave/arrive；endConversationLocal 不触发离场（B1-T08 测试证明）。

---

## 13. schema 与 migration 测试（B1-T10）

阅读回执（B1-T10）：

    [B1-T10][read] tavern-card-builder/SKILL.md
    [B1-T10][read] tavern-card-builder/references/validation.md
    [B1-T10][read] sillytavern-database-rolecards/SKILL.md
    [B1-T10][read] sillytavern-database-rolecards/references/rolecard-data-model.md
    [B1-T10][read] 总计划 §12.1、§12.2、§12.4
    [B1-T10][read] 第一批手册 §6–§11、§14

### 修改文件

- 新建 tests/character-memory.test.mjs（22 个测试；B1-T11 的生命周期/接线测试在同一文件，见 §14）。

### fixture 覆盖（对照手册清单）

1. 全新 initial-state ✓（8 固定角色独立、counter=1、旧字段保留）
2. 无 interaction 的旧状态 ✓（建立合法根）
3. conversation_log 为 string ✓（字符串兜底）
4. conversation_log 为数组 ✓
5. 未知角色/无前缀/空正文 ✓（进 unassigned/跳过）
6. 重复 legacy 文本 ✓（stable ID 去重）
7. current_relationship_facts 多角色 ✓
8. 明确状态与模糊事实 ✓（boundary 白名单 vs milestone；label/event_kind null）
9. malformed visit_memory ✓（单角色不清空其他角色；无稳定 ID 拒绝）
10. partial v1 state ✓（空 root 建立）
11. 带 unknown top-level/character/visit/turn 字段 ✓（全部保留）
12. 48/49/64 条 story 边界 ✓（80→48；closed ≤4；active 优先）
13. 12/13/20 条 relationship 边界 ✓（15→12；多条 active state 归一）
14. 重复运行 migration ✓（二次 deepEqual）
15. 旧源第二次运行新增一条 ✓（增量导入）

### 必须断言全部覆盖

固定角色独立 / reimu 写满不挤 marisa / 48 每角色 / 12 每角色 / unknown fields 保留 / 源 conversation_log 保留 / 源 current_relationship_facts 保留 / migrated ID 稳定 / 二次运行 deepEqual / malformed 单角色不清空其他 / 无 Date.now/random 漂移（hash 确定性断言）。

### 命令结果

    node --test tests/character-memory.test.mjs → 22/22 PASS
    node --test --test-name-pattern="conversation_log|relationship|memory|migration" tests/ui-contract.test.mjs → 1/1 PASS
    npm run check:ui → PASS

### 测试质量禁区遵守

- 行为测试（esbuild bundle 导入 TS 实际执行），不只 assert 源码字段名（schema 源码断言仅用于"结构上限与业务上限分离"这一项，行为由 normalizer/migration 测试证明）；
- 无 snapshot 掩盖；无错误结果更新为 snapshot；未删旧 conversation_log 测试（ui-contract.test.mjs 原样）；未改 24/48 伪装；无跳过。

---

## 14. 生命周期与接线测试（B1-T11）

阅读回执（B1-T11）：

    [B1-T11][read] tavern-card-builder/SKILL.md
    [B1-T11][read] tavern-card-builder/references/validation.md
    [B1-T11][read] sillytavern-database-rolecards/references/floor-and-ui-binding.md
    [B1-T11][read] sillytavern-api-reference/SKILL.md
    [B1-T11][read] 总计划 §6、§12.2
    [B1-T11][read] 第一批手册 §12–§15

### 修改文件

- tests/character-memory.test.mjs 追加生命周期与接线测试（与 B1-T10 同一文件）。

### 覆盖

- 纯函数矩阵：absent→absent no-op / absent→present 开（counter 递增）/ present→present 同 ID / present→absent 关（end_reason）/ leave 再 arrive 两个不同 ID；
- 幂等：同 arrival replay 无新 ID、同 departure replay 不重复关闭、counter 不增；
- 多角色同时 arrive/depart、一人离开一人仍在；
- visitor_meta 有/无 arrival_uid（无 uid → null）；
- clockFromState 只用正式时钟（environment + periodSerialFromState；空状态全 null）；
- area/view 变化不切 visit；非法 presence 回执（未知角色/未知区域）不改变 visit；
- scheduler due departure → scheduled-departure 关闭；
- local event settlement 直接追加 presence → event 打开；
- opportunity arrival → event 打开；
- endConversationLocal 不切 visit（禁区测试）；
- migration bootstrap（在场无 active）+ absent stale active repair close（reconcile）+ 幂等；
- nested caller 不双增 counter（applyPresenceUpdate → reconcileM2Runtime）；
- 容量收尾：经协调器 closed ≤4、active+closed ≤48。

### 命令结果

    node --test tests/character-memory.test.mjs → 22/22 PASS
    node --test --test-name-pattern="presence|visitor|arrival|departure|conversation" tests/ui-contract.test.mjs → 3/3 PASS
    node --test tests/m2-r38-r45.test.mjs → 23/23 PASS
    npm run check:ui → PASS
    npm test → 339/339 PASS（原 317 + 新 22）

### 现有回归确认

visitor scheduler / event settlement / opportunity card / current_relationship_facts ownership restore / conversation_log 跨对话测试全部继续通过（339 全绿）。

### 不声称（运行时待验）

实机新聊天初始化、swipe 隔离、reload 持久化、message-floor 精确写回、same-floor、iframe timing——本批不做探针，全部留待运行时验收。

---

## 15. 文件变更表（B1-T12 汇总）

| 文件 | 状态 | 本批内容 |
|---|---|---|
| src/schema/02-mvu-schema.js | M | visit_memory 子 schema 链 + interaction.visit_memory + uid_counters.character_visit |
| src/schema/initial-state.json | M | 8 固定角色独立空 CharacterMemory + migration 元数据 + character_visit=1 |
| src/schema/field-ledger.md | M | 「GAL 角色记忆模型（第一批 v1）」契约章节 |
| src/ui/types.ts | M | 角色记忆类型块 + GardenState.interaction.visit_memory + uid_counters.character_visit |
| src/ui/character-memory.ts | 新增 | 纯领域库：常量/确定性 hash/normalize/裁剪/ID/迁移/生命周期协调器 |
| src/ui/state-migrations.ts | M | 接入 conversation_log 迁移、relationship 迁移、repair |
| src/ui/event-settlement.ts | M | applyPresenceUpdate 协调（model-presence）、applyLocalSettlement 统一协调（event） |
| src/ui/visitor-rules.ts | M | evaluateVisitScheduler 协调（scheduler）、commitOpportunityArrival 协调（event） |
| tests/character-memory.test.mjs | 新增 | 22 个行为测试（B1-T10/T11） |
| project/gal-character-memory-batch-1-implementation-log.md | 新增 | 本实施日志 |

## 16. 数据模型版本

    modelId: gensokyo-character-memory
    modelVersion: character-visit-memory.v1
    storage.root: stat_data.interaction.visit_memory（normal multi-floor MVU）
    uid_counters.character_visit：初始 ≥1（initial-state = 1）
    migration revision：conversation-log.v1 / relationship-facts.v1（最新执行者胜，非跳过开关）

## 17. 定向测试与检查结果汇总

| 命令 | 结果 |
|---|---|
| node --test tests/character-memory.test.mjs | 22/22 PASS |
| node --test --test-name-pattern="conversation_log\|relationship\|memory\|migration" tests/ui-contract.test.mjs | 1/1 PASS |
| node --test --test-name-pattern="presence\|visitor\|arrival\|departure\|conversation" tests/ui-contract.test.mjs | 3/3 PASS |
| node --test tests/m2-r38-r45.test.mjs | 23/23 PASS |
| npm run check:ui | PASS |
| npm test | 339/339 PASS |
| git diff --check | 无错误（仅 CRLF 提示） |

## 18. 未做的运行时验收（留待后续）

- 实机新聊天初始化（initial-state → migrate → bootstrap）；
- swipe 隔离；
- reload 持久化（stat_data 写回）；
- message-floor 精确写回；
- same-floor；
- iframe timing；
- 提示投影切换（第二批）；
- VisitTurn 生产写入者（第二批）。

## 19. 遗留到第二批的工作

- 提示投影切换（synthetic history 投影启用）；
- generate/injects 发送事务改造；
- VisitTurn 生产写入者（新生成回复自动写 VisitTurn）；
- 暂停/重试改造；
- 重生成改造；
- relationship_memory_candidates inbox；
- 数据库归档/召回；
- UI 打包与 R2 发布。

## 20. 最终差异审计

- git diff --check：无错误；
- git status --short：本批新增/修改集中在 src/schema、src/ui（6 个指定文件 + 1 新增）、tests（1 新增）、project（1 新增日志）；
- 未误改：prompt-context.ts、target-actions.ts、variable rules、gal-generation-request.ts、app.ts、bridge.ts、message-transaction.ts、async-coordination.ts（这些在基线时即为用户未提交状态，本批未触碰）；
- api-provenance.md：工作树存在用户未提交改动；本批未新增 ST API 依赖（全部为本地纯函数 + 既有 ST 兼容字段），按手册"仅在实际新增/依赖版本敏感 API 时更新"原则不编辑，避免覆盖用户改动；
- conversation_log / current_relationship_facts 旧字段保留且旧协议写入者未动（target-actions.ts:28、prompt-context.ts:49 原样）。

## 21. 验收清单自查

- [x] 没改 generate/injects/chat history；没改重生成；没接数据库；没打包/发布/写 dist；没删除旧字段/旧协议；没覆盖用户无关改动；
- [x] visit_memory 位于 interaction；model version 固定；by_character 动态字典；固定角色独立；schema 保留 unknown fields；counter 合法；结构上限与业务上限分离；
- [x] 每角色 48/12；reimu 满额不挤 marisa；active/closed 合计 ≤48（测试证明）；
- [x] 入场边界（absent→present 开 / present→absent 关 / present→present 不变 / 关闭 GAL 不离场 / 同事务 leave+arrive 两个 visit_id）；
- [x] migration 确定性（稳定 ID、幂等、增量、删除源不重复、内容级一致性、fingerprint 诊断、失败保留源）；
- [x] 写点全部接入（5 个 integrated + 6 个 owning-helper 覆盖）；防双调用测试证明 nested 不双增 counter；
- [x] 测试：339/339 全绿；无跳过、无 snapshot 掩盖。

## 22. git status 与无关改动声明

本批开始时（B1-T00 基线）工作树已存在用户未提交改动：package.json、scripts/*、src/ui/{app,async-coordination,bridge,index.html,message-transaction,types}.ts、tests/ui-contract.test.mjs、src/runtime/*、.reasonix/*、gal-generation-request.ts（untracked）、多个 project/*.md（untracked）、verify-*.log 等。

本批未 reset/checkout/clean/stash，未覆盖上述任何无关改动；本批只新增/修改了 §15 文件变更表中的文件。

---

（后续任务记录追加在下方）

---

## 23. 首轮代码验收修复（2026-08-09）

### 阅读回执

    [B1-ACCEPT-FIX][read] code-quality-workflow/SKILL.md
    [B1-ACCEPT-FIX][read] code-quality-workflow/references/audit-and-sweep.md
    [B1-ACCEPT-FIX][read] code-quality-workflow/references/gate-change-verify.md
    [B1-ACCEPT-FIX][read] tavern-card-builder/SKILL.md
    [B1-ACCEPT-FIX][read] tavern-card-builder/references/variable-systems.md
    [B1-ACCEPT-FIX][read] tavern-card-builder/references/validation.md
    [B1-ACCEPT-FIX][read] sillytavern-database-rolecards/SKILL.md
    [B1-ACCEPT-FIX][read] sillytavern-database-rolecards/references/rolecard-data-model.md
    [B1-ACCEPT-FIX][read] sillytavern-database-rolecards/references/floor-and-ui-binding.md
    [B1-ACCEPT-FIX][read] sillytavern-api-reference/SKILL.md
    [B1-ACCEPT-FIX][read] project/gal-character-visit-memory-and-synthetic-history-plan.md
    [B1-ACCEPT-FIX][read] project/gal-character-memory-batch-1-data-foundation-runbook.md

### 修复范围

1. 所有 visit-memory 入口先执行容错归一化，malformed 单角色不再让 migration/repair 抛错；
2. Zod 的单角色兜底改为角色级结构兜底，禁止一个坏角色让整个 by_character 回退为 `{}`；
3. 字符串日期与数字日期使用不吞分支的独立 Zod union，字符串日期不再被 integer catch 改写为 `1`；
4. visit ID 分配扫描 active/closed 既有 ID，旧 counter 缺失或落后时从最大已有序号之后继续；
5. upsertVisitTurn / upsertRelationshipMemory 写入后立即执行 48/12 容量及 active relationship_state 归一化；
6. 把上述异常档、ID 碰撞和 upsert 边界加入自动回归测试，不再依赖验收人员手工推断。

### 范围声明

- 未改 model/version、字段名、48/12 容量与生命周期语义；
- 未改 generate、prompt、regenerate、数据库、打包、R2 或 dist；
- 未执行探针或实机时机演示；
- 本节结果只代表代码逻辑与 Node/TypeScript 静态验收。

### 定向验证

| 命令 | 结果 |
|---|---|
| `node --test tests/character-memory.test.mjs` | 25/25 PASS |
| `npm run check:ui` | PASS |
| `node --check src/schema/02-mvu-schema.js` | PASS |
| `npm test` | 342/342 PASS，fail 0 / skipped 0 |
| `git diff --check` | PASS（仅工作区既有 LF→CRLF 提示） |

### 修复验收结论

首轮验收列出的 3 个 P1 与 2 个 P2 已全部建立对应修复或自动防回归断言；代码逻辑门通过。运行时项目继续保持“待验”，没有用静态测试冒充实机证据。
