# GAL 角色记忆重构：第二批「发送与合成历史」实施手册

> 文档性质：交给实施 agent 的逐项施工单；不是讨论稿，不是“任选建议”
> 当前状态：**首次代码逻辑验收未通过**；B2-T00～T13 的既有“完成”声明不构成封账，必须完成本文 §10 的 B2-F00～B2-F06 后重新验收
> 前置基线：第一批“数据基础”已经代码逻辑验收并封账
> 对应总计划：`project/gal-character-visit-memory-and-synthetic-history-plan.md`
> 对应第一批封账：`project/gal-character-memory-batch-1-implementation-log.md` §24
> 目标运行时依据：SillyTavern 1.18.0 + Tavern Helper / JS-Slash-Runner 4.8.18
> 验收性质：本批只做代码逻辑、静态测试和文档证据；不做 runtime probe、时机演示或实机验收

> T08 修订：2026-08-09 外援代码复核发现“无角色剧情、V2 构造失败、requestId 生命周期、临时道具授权、系统操作入口、V2 retry 分流”六个边界未写透。本文已加入强制裁定与 T08-R0～R5 恢复检查点；其优先级高于 T02～T08 早期日志中的临时设计决定。

> 首次验收修订：2026-08-09 静态代码逻辑验收发现 V2 reload recovery 未接线、普通无状态变化回复跳过 VisitTurn、系统操作恢复模糊选层且不写 VisitTurn、写后复读不足以及 swipe 身份恒为 null。§10 是强制返修单，优先级高于旧实施日志中 T09～T13 的完成声明和遗留项裁定；这些问题不得继续列为“后续再做”。

---

## 0. 给实施 agent 的一句话任务

把 GAL 新发送请求改成：**真实聊天楼层一条也不给模型，模型历史只来自第一批的每角色入场记忆；生成成功后，再把本轮确定性摘要提交回本次请求开始时冻结的 visit。**

你要接入现有发送事务，不得另造一套发送器。

本批完成后必须同时成立：

1. 新 V2 GAL 请求只用 Helper `generate()` 发送；
2. `overrides.chat_history.prompts` 只含合成的 system 历史；
3. 真实 SillyTavern user/assistant 旧楼层永不进入模型请求；
4. 无记忆时仍传入非空的历史边界 system 消息，绝不回退真实历史；
5. 发送前冻结相关角色、visit ID、状态边界、合成历史与指纹；
6. stop、retry、reload recovery 复用同一份冻结请求，不重新读当前楼层拼历史；
7. 成功回复在精确 assistant 楼层完成现有 MVU/本地结算后，幂等写入 VisitTurn；
8. 角色已经在本轮结算中离场时，告别回复仍写回冻结的旧 visit，而不是丢失或写进下次 visit；
9. 旧 `conversation_log` 保留作迁移源，但停止新增、停止直接提示投影；
10. 重生成、关系候选、数据库、完整提示词注入改造、打包与 R2 都不在本批。

如果你只完成了“做一个 history 数组”，那不叫完成，只叫把问题藏到了另一个变量里。

---

## 1. 每个小任务都必须重新执行的阅读门禁

### 1.1 固定全文阅读清单

每一个 `B2-Txx` 开始前，执行者本人必须重新完整阅读以下文件；上一任务读过不算，本批开始前读过也不算：

1. `C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md`
2. `C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md`
3. `C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md`
4. `C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md`
5. `C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md`
6. `C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md`
7. `C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md`
8. `project/gal-character-visit-memory-and-synthetic-history-plan.md`
9. `project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md` 的当前任务全文

修改代码前还必须按任务要求阅读当前源码、`project/contract.md`、`project/api-provenance.md` 和 `src/schema/field-ledger.md` 的相关部分。

### 1.2 阅读回执是任务门，不是装饰

每个任务开始时，先在新建的实施日志
`project/gal-character-memory-batch-2-implementation-log.md`
追加阅读回执。格式必须逐文件列出：

```text
[B2-T04][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T04][read] project/gal-character-visit-memory-and-synthetic-history-plan.md
[B2-T04][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T04
```

以下行为一律视为没有通过阅读门禁：

- 只写“已读 skill”；
- 只读摘要、搜索结果或其他 agent 的转述；
- 让子 agent 代读；
- 用上一任务的回执复制粘贴冒充本次阅读；
- 先改代码，后补回执；
- 把总计划的某几个小节当成全文阅读。

任一任务缺少独立阅读回执，该任务自动验收失败，即使测试暂时是绿的。

---

## 2. 本批边界

### 2.1 本批必须实现

- 相关角色的确定性选择与请求时冻结；
- 当前 visit ID 的请求时冻结；
- VisitTurn 的确定性摘要与按冻结 visit 精确提交；
- 每角色关系记忆、过去 visit、当前 visit、legacy memory 的只读投影；
- 非空且只有 system role 的合成历史；
- 每角色与全局预算裁剪；
- GAL 请求 V2、V1 兼容读取和 V2 指纹；
- 现有 MessageTransactionCoordinator 的 V2 接入；
- Helper `generate()` 的受控历史覆盖与 `with_depth_entries: false`；
- stop 后从同一冻结请求重新尝试；
- retry/reload recovery 的幂等提交；
- 旧 `conversation_log` 停止新增并停止直接投影，但不删字段、不删迁移；
- 所有现有 GAL 发送入口统一走 V2；
- 自动化代码逻辑验收和实施日志。

### 2.2 本批明确禁止

- 不改 `/regenerate`、swipe 重生成或重生成同构；
- 不实现 `relationship_memory_candidates`；
- 不让 LLM 直接写 `relationship_memories` 或决定关系状态；
- 不新增数据库 adapter、SQL、向量库或远端召回；
- 不制作 standalone/database-assisted 两种发行包；
- 不把全部动态协议迁到 `injects`；
- 不全面重写 `withGardenNarrativeContract`；
- 不打包 UI、不改 R2、不发布、不写 dist；
- 不运行 probe、不拿旧打包卡当“实机证据”、不做时机演示；
- 不升级 SillyTavern、Helper 或其他依赖版本；
- 不改变第一批字段名、`character-visit-memory.v1`、48/12 容量和 visit 生命周期；
- 不删除 `conversation_log`、`current_relationship_facts` 或 migration metadata；
- 不为了让测试通过而删旧测试、放宽断言或用 snapshot 掩盖差异；
- 不新造第二个事务协调器、第二个 bridge 或第二套消息监听器。

### 2.3 本批允许存在的过渡状态

完整提示词注入专项尚未开始，因此本批暂时保留：

- `visibleUserText`：玩家看到的纯文本；
- `modelUserInput`：仍可由现有 `withGardenNarrativeContract` 包装；
- 动态协议、当前在场事实和场景事实：暂时仍位于 `modelUserInput`；
- 合成历史：只位于 `overrides.chat_history.prompts`；
- 不新增 `injects`，也不宣称提示词分层已经完成。

但是必须从 `withGardenNarrativeContract` / `buildPromptContext` 中移除旧 `conversation_log` 的直接回顾投影，并从正文协议中移除要求模型继续 append `conversation_log` 的句子。其余注入位置不动。

---

## 3. 冻结的请求与历史合同

### 3.1 单一发送管线

新 V2 请求的唯一路径：

```text
UI 可见输入
  → 捕获请求前状态/身份/显式角色
  → 确定 relevantCharacterIds
  → 冻结 visitIdsByCharacter
  → 构造 syntheticHistory（纯函数）
  → 构造并持久化 GalGenerationRequest V2
  → 现有 MessageTransactionCoordinator 创建玩家楼层和 attempt
  → Helper generate（显式 history override）
  → 现有监听/输出校验/assistant 落楼
  → 现有 MVU + local settlement
  → VisitTurn 幂等提交到冻结 visit
  → 精确 assistant 楼层写回并复读验证
  → commit lifecycle settled
```

禁止旁路：

- UI 入口不得自行调用 `generate()`；
- synthetic-history 模块不得访问 SillyTavern 全局对象；
- VisitTurn 模块不得直接写楼层；
- bridge 不得临时读取 `activeMessages()` 再补 history；
- V2 不得调用 `/trigger` 或 `/continue`；
- Helper generate 不可用时必须失败并恢复 UI，不得回退原生历史。

### 3.2 请求版本

新增、不要覆盖 V1：

```text
schema: gal-generation-request.v2
extra key: galGenerationRequestV2
historyRevision: gal-synthetic-history.v1
memoryRevision: character-visit-memory.v1
promptRevision: 保留当前 gal-prompt.v1，直到提示词注入专项
```

V2 逻辑请求至少包含：

```ts
interface GalGenerationRequestV2 {
  schema: 'gal-generation-request.v2';
  requestId: string;
  chatId: string;
  ownerCharacterId: string;
  playerMessageId?: number;
  promptRevision: string;
  historyRevision: 'gal-synthetic-history.v1';
  memoryRevision: 'character-visit-memory.v1';
  sceneId: string | null;
  stateMessageIdBeforeGeneration: number | null;
  stateSwipeIdBeforeGeneration: number | null;
  relevantCharacterIds: string[]; // 可以为空；空数组代表本轮没有可归属角色记忆
  visitIdsByCharacter: Record<string, string | null>;
  syntheticHistory: Array<{ role: 'system'; content: string }>;
  syntheticHistoryHash: string;
  contextFingerprint: string;
  visibleUserText: string;
  modelUserInput: string;
  attemptSeq: number;
  createdAt: string;
}
```

持久化 metadata 时可以不重复保存完整 `modelUserInput`，但必须保存足以进行身份校验和恢复裁定的稳定字段与 hash。若 reload recovery 必须恢复完整冻结请求，就必须把完整 V2 请求存到玩家楼层 metadata；不得在 reload 后重新读取“此刻状态”重建一份长得差不多的新请求。

最终选择必须记录在实施日志，并以测试证明 recovery 没有重新取真实楼层或新状态。

### 3.3 attempt 与 request 身份

- retry 不变：`requestId`、可见输入、模型输入、相关角色、visit map、合成历史、history hash、context fingerprint；
- retry 变化：`attemptSeq`、`attemptId`、`generationId`、`commitKey`；
- stop 后再次生成属于 retry，不属于 continue；
- reload 后结算属于同 request 的 recovery，不得创建第二个玩家楼层；
- V1 历史 metadata 只做兼容读取，不能被悄悄解释成 V2 合成历史请求；
- 新发送只写 V2；已存在的 V1 settled 楼层保持可读；
- 未完成 V1 恢复按旧事务合同处理或明确拒绝，不能伪造 V2 字段。

### 3.4 相关角色选择

输入必须来自结构化 ID，不得扫描自然语言猜角色：

优先顺序冻结为：

1. 当前 GAL 主目标角色；
2. 当前动作显式 `targetCharacterId`；
3. 事件配置的显式 participants；
4. `interaction.current_session.participant_character_ids`；
5. 当前在场集合中的角色，作为缺省补足。

规则：

- 去重后保持上述稳定顺序；
- 只接受已登记角色 ID；
- 最多 4 个；
- 只有调用方明确传入 `requireMainTarget: true` 时，主目标缺失才是请求错误；普通设施、独处活动和无角色过渡允许没有主目标；
- event participants 由配置/当前状态提供，不从模型输出猜；
- 对每个 ID 在请求时记录 `active_visit?.visit_id ?? null`；
- visit map 冻结后不得因生成期间到达/离开而改写。

若所有结构化来源都没有登记角色：

- `requireMainTarget: true`：返回 `missing-main-target`；
- `requireMainTarget: false`：成功返回空角色数组；
- visit map 为 `{}`；
- 合成历史返回固定非空历史边界；
- 请求仍然是 V2 Helper generate；
- 本轮不产生 VisitTurn；
- 禁止因此回退 V1、`/trigger` 或真实聊天历史。

### 3.5 合成历史唯一格式

`syntheticHistory` 第一版固定返回**恰好一条 system 消息**，避免多消息排序和宿主合并差异：

```ts
[
  {
    role: 'system',
    content: '...确定性拼装文本...'
  }
]
```

有记忆时按 relevantCharacterIds 顺序，每个角色按以下顺序输出：

1. `【角色：名字（ID）】`
2. `【当前关系】`
3. `【过去入场：只能作背景，不得续接现场】`
4. `【本次入场：可维持当前连续性】`
5. `【旧版遗留记忆：时间不明】`

投影规则：

- 当前关系最多 6 条：active state 最多 1，active boundary/conflict 优先，其余按 significance 和时间稳定排序；
- 过去入场最多最近 2 次，排除冻结的本次 visit，同一块内从旧到新展示；
- 每次过去入场最多取尾部 6 条 turn；
- 本次入场只投影冻结 visit，最多取尾部 6 条 turn；
- legacy memory 只投影该角色自己的记录；
- `legacy_unassigned` 永不投影；
- null 时间显示“时间未记录”，不得伪造昨天/今天；
- 过去块必须带“不可续接旧地点、姿势、动作进行态、未完台词或即时意图”的边界；
- 当前状态/当前输入的权威始终高于记忆。

没有任何可投影内容时仍必须返回：

```text
【历史边界】本请求不读取 SillyTavern 真实聊天楼层；当前没有可投影的角色入场记忆。
```

### 3.6 预算

固定预算：

- 每角色最多 900 个 JavaScript 字符；
- 全部合成历史最多 2800 个 JavaScript 字符；
- 当前 visit turn 最多 6 条；
- 过去 visit 最多 2 次，每次最多 6 条；
- 当前关系最多 6 条。

裁剪优先级从“最不应删除”到“最先删除”：

1. 历史边界和过去/本次边界；
2. active relationship state 与 boundary/conflict；
3. 当前 visit；
4. 高 significance 关系事件；
5. 最近一次过去 visit；
6. 更早过去 visit；
7. legacy memory。

先按完整条目裁剪，最后仍超预算时才允许对最后一条正文做确定性截断并加 `…`。不得随机裁剪，不得依赖对象枚举偶然顺序。

### 3.7 VisitTurn 提交合同

本批不调用摘要模型。每个角色的摘要由 accepted response 确定性生成：

- 输入只包括玩家 `visibleUserText`、已通过输出校验的庭园正文、显式角色 ID、游戏日/时段和精确 assistant 身份；
- 优先提取 `<dialogue char="角色ID">` 中该角色的可见台词；
- 有角色台词时：`玩家：{清洗并截断的输入}；{角色名}：{该角色台词摘要}`；
- 无角色台词但该角色是主目标/显式参与者时：`玩家：{输入}；本轮：{清洗后的可见正文摘要}`；
- 删除协议、HTML 标签、`GensokyoPresence`、`GensokyoScene`、`UpdateVariable`、思维链和状态块；
- 空正文、拒绝输出、stop 未完成、生成失败均不写 turn；
- `summary` 最长 160 字符；
- `turn_id = request_id + ':' + character_id`；
- assistant message/swipe、latest attempt/commit、游戏日/时段均来自本次精确提交，不用现实时间猜游戏时间。

提交目标必须使用请求时冻结的 `visitIdsByCharacter[characterId]`：

- 为 null：不写 VisitTurn；
- 与当前 active visit 一致：写 active；
- 生成结算期间角色离场、该 visit 已进入 closed_visits：写对应 closed visit；
- visit 在 active/closed 均找不到：失败并保留 settlement pending，不得写进新 visit；
- 同一个 visit ID 出现多处：视为数据冲突并停止，不猜目标；
- 同 turn_id retry/recovery：upsert 覆盖审计字段，不追加重复记录。

因此必须新增按 `character_id + visit_id` 定位的纯 helper，不能只调用第一批只写 active visit 的 `upsertVisitTurn()`。

---

## 4. 允许修改与禁止触碰的文件边界

### 4.1 预计允许修改

- `src/ui/gal-generation-request.ts`
- `src/ui/message-transaction.ts`
- `src/ui/bridge.ts`
- `src/ui/app.ts`（仅统一传纯可见文本和结构化目标，不做 UI 重构）
- `src/ui/types.ts`
- `src/ui/character-memory.ts`（只加按 visit ID 精确 upsert 等第二批必要纯 helper）
- `src/ui/prompt-context.ts`（只移除 conversation_log 直接投影）
- `src/ui/target-actions.ts`（只移除 conversation_log 新写入协议及相应旧连续性措辞）
- `src/lorebook/variable-output-format.md`（只移除 conversation_log 新写入示例/要求）
- `src/schema/field-ledger.md`
- 新增 `src/ui/synthetic-history.ts`
- 新增 `src/ui/visit-turn-commit.ts`
- 相关测试文件及本批实施日志
- `project/api-provenance.md`（只有实际核验/依赖版本敏感 API 时更新）

### 4.2 默认禁止修改

- `src/schema/02-mvu-schema.js`、`src/schema/initial-state.json`：本批不新增 MVU 字段；若确实被现有类型阻塞，先写 STOP 说明，不能擅改；
- `/regenerate` 相关逻辑和测试；
- 数据库、R2、构建、发布、loader、dist；
- `docs/` 参考资料；
- 第一批封账文档的合同正文；
- `.reasonix/`；
- 与本批无关的用户未提交改动。

工作区当前已有未提交的发送事务、R2 和 UI 外置化改动。实施 agent 必须基于当前工作区盘点，不得只看 git HEAD，不得 reset、checkout、clean、stash 或覆盖它们。

---

## 5. 分任务施工单

## B2-T00：建立当前工作区基线与实施日志

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；另外完整阅读 `project/contract.md`、`project/api-provenance.md`、`src/schema/field-ledger.md`、第一批实施日志 §23–24。禁止引用上一任务回执——这是 T00 自己的门禁。

### 目标

建立可复查的“当前工作区”基线，区分已提交第一批和未提交发送事务，避免实施时误删用户改动。

### 必做步骤

1. 新建 `project/gal-character-memory-batch-2-implementation-log.md`；
2. 记录日期、分支、HEAD、origin/main、Node/npm 版本；
3. 记录 `git status --short`，逐项标出“本批前已存在”；
4. 记录当前 `package.json` 中测试与类型检查命令；
5. 运行 `npm run check:ui` 和 `npm test`；
6. 记录精确 pass/fail/skipped 数量，不得只写“通过”；
7. 若基线失败，记录失败测试、判断是否为当前工作区既有问题；未经授权不得顺手修无关失败；
8. 建立本批文件触碰清单，后续每任务追加。

### 完成证据

- 实施日志存在；
- 有完整阅读回执；
- 有 git 与测试基线；
- 有无关改动保护声明；
- 没有代码修改。

### 停止线

发现第一批已封账文件缺失、HEAD 不是含 `de1b568` 的历史、或当前未提交事务源码与计划描述完全不符时，停止并报告，不得凭空重写。

---

## B2-T01：盘点现有发送、监听、停止、重试与恢复路径

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；另外完整阅读 `src/ui/bridge.ts`、`src/ui/message-transaction.ts`、`src/ui/gal-generation-request.ts`、`src/ui/app.ts`、`src/ui/async-coordination.ts` 以及现有 transaction 测试。不得只用 `rg` 命中代替全文阅读。

### 目标

在动代码前画清唯一事务链，确认所有入口和 exact-floor settlement 位置。

### 必做盘点

1. 列出所有 `sendUserMessage`、特殊发送、互动、事件、道具、异常解决入口；
2. 列出 `native-trigger` 与 `helper-generate` 分支；
3. 列出 start/stream/end/stop 监听器和 generation_id 过滤；
4. 列出玩家楼层、assistant 楼层、request/attempt metadata 的创建点；
5. 列出 `Mvu.replaceMvuData`、local settlement、commit lifecycle settled 的顺序；
6. 列出 retry、retryFromScratch、continue、reload restore、chat switch 行为；
7. 列出所有真实楼层进入生成请求的点，至少包括 `buildChatHistoryForGenerate(activeMessages(), ...)`；
8. 列出所有 `conversation_log` 写入要求和提示投影；
9. 为每个入口标记本批改造后的唯一归宿；
10. 把盘点表写入实施日志，未完成前不得进入 T02。

### 禁区

- 不新增 coordinator；
- 不在本任务修改代码；
- 不假设 `/trigger` 能覆盖历史；
- 不把“监听到输出”当成“结算已完成”。

### 完成证据

日志中必须有“入口 → request builder → coordinator → transport → assistant → settlement → memory commit”的完整映射表，以及真实历史泄漏点清单。

---

## B2-T02：核验 Helper API 合同并冻结 V2 类型

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；重点重读 `sillytavern-api-reference/SKILL.md` 的证据层级、`project/api-provenance.md`、总计划 §8–9、当前 Helper 4.8.18 对应声明/源码。禁止拿 4.8.19 或旧打包数据替代目标版本证据。

### 目标

确认本批实际使用的 `generate()` 字段，再建立不覆盖 V1 的 V2 类型与序列化合同。

### 必做步骤

1. 从项目已有 provenance 或目标 Helper 4.8.18 源码核对：`generation_id`、`user_input`、`should_stream`、`should_silence`、`overrides.chat_history.prompts`、`overrides.chat_history.with_depth_entries`；
2. 只记录静态源码/声明证据，不运行探针；
3. 若某字段在目标版本没有证据，立即 STOP，不得猜签名；
4. 新增 V2 常量、类型、parser、serializer；
5. 保留 V1 parser 和已存在 metadata 兼容；
6. V2 只接受 system-role synthetic history；
7. V2 parser 拒绝空 history、未知 revision、重复角色 ID、visit map 多余/缺失键；允许 `relevantCharacterIds: []`，但此时 visit map 必须严格为 `{}`；
8. V2 写新 key，不覆盖 V1 extra；
9. 更新 `types.ts` 中必要的 request snapshot 类型，不把领域字段散落成 `any`；
10. 添加 V1/V2 round-trip、malformed、unknown-field 兼容测试。

### 冻结裁定

- 不新增 `injects`；
- `promptRevision` 暂不冒充提示词 v2；
- history/memory 使用独立 revision；
- 新请求必须 V2，恢复读取同时支持 V1/V2。

### 完成证据

- API 证据表；
- V2 类型与 parser 测试；
- V1 回归测试仍通过；
- 没有生成调用改动，调用接线留到 T08。

---

## B2-T03：实现相关角色与 visit 快照纯函数

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；另外重读总计划 §2、§6–8，完整阅读 `src/ui/types.ts`、角色 registry、事件 registry、`app.ts` 的所有发送入口、第一批 `character-memory.ts` 生命周期部分。

### 目标

让“这一请求属于谁、写回哪个 visit”在发送前确定，后续不再猜。

### 必做步骤

1. 实现纯函数 `resolveRelevantCharacterIds(input)`；
2. 输入字段必须是结构化 ID 集合，不接收整段玩家文本；
3. 按 §3.4 稳定排序、去重、过滤登记表、最多 4 人；
4. `requireMainTarget: true` 且主目标缺失时返回显式错误；否则允许最终角色数组为空；
5. 实现纯函数 `freezeVisitIds(state, characterIds)`；
6. 输出每个相关角色一个键，值为 active visit ID 或 null；
7. 返回新对象，不修改 state；
8. app/bridge 入口只负责传现有结构化上下文，不在不同入口各写一套优先级；
9. 加入单角色、多人事件、重复 ID、未登记 ID、超过 4 人、强制主目标缺失、合法无角色、无 active visit 测试；
10. 测试证明玩家文字里出现角色名不会自动加入角色。

### 禁区

- 不读取真实聊天消息；
- 不用角色显示名作为稳定键；
- 不因生成中 presence 改变而刷新 visit map；
- 不创建 visit；visit 创建仍由第一批 presence lifecycle 独占。

### 2026-08-09 修订

旧实现若把“全部没有登记角色”返回为 `no-registered-characters`，必须在 T08-R0 回修为合法空数组；这是独处设施剧情和无角色过渡的必要路径。不得靠伪造一个角色、使用 `ownerCharacterId` 冒充剧情角色，或回退 V1 来绕开。

### 完成证据

纯函数测试精确列出；所有生产入口尚未全面接线前不得声称发送已完成。

---

## B2-T04：实现按冻结 visit ID 精确 upsert

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；重点完整阅读 `src/ui/character-memory.ts`、`src/ui/types.ts` 的 VisitTurn/VisitRecord、`src/schema/field-ledger.md` 对应字段和第一批容量测试。

### 目标

补齐告别回复写入已关闭 visit 的能力，同时保持第一批容量与幂等合同。

### 必做步骤

1. 在 `character-memory.ts` 增加纯函数 `upsertVisitTurnByVisitId`（名称可等价但语义不能变）；
2. 输入：state、characterId、visitId、完整 VisitTurn；
3. 先执行第一批容错归一化；
4. 在该角色 active + closed 中按 visit_id 查找；
5. 恰好一处命中才写；
6. 零处命中返回带原因的结果，不能静默写当前 active；
7. 多处命中返回 conflict，不能猜；
8. 按 turn_id upsert，retry 更新 attempt/commit/message 审计字段；
9. 写后复用第一批 16/4/48 容量归一化；
10. 保留 unknown fields，纯函数不写宿主、不读现实时间。

### 必测

- active visit 写入；
- just-closed visit 写入；
- 角色离场又重入后仍写旧 visit，不写新 active；
- missing/conflict 不改 state；
- 同 turn_id 幂等；
- 16/4/48 容量；
- malformed 单角色隔离；
- 另一角色数据不动。

### 完成证据

必须给出 before/after 结构断言，不接受只测数组长度。

---

## B2-T05：实现 VisitTurn 确定性构造器

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；另外完整阅读 `src/ui/gal-scene.ts`、现有输出校验、assistant metadata 与 `cleanNarrativeText` 测试，总计划 §5.2、§9.2。不得先写正则后再看现有 parser。

### 目标

从已经接受的回复构造每角色最多一条、可复算、无模型自由裁定的 VisitTurn。

### 必做步骤

1. 新增 `src/ui/visit-turn-commit.ts`，只放纯函数；
2. 输入必须显式包含 request、attempt、assistant identity、最终游戏时间、accepted raw output；
3. 先复用现有庭园正文提取/清洗能力；
4. 只从正文块提取 `<dialogue char="...">`；
5. 只处理 request 冻结的 relevantCharacterIds 且 visit ID 非 null 的角色；
6. 按 §3.7 生成摘要，统一空白，去标签，最长 160；
7. `turn_id` 严格等于 `requestId:characterId`；
8. stop/空正文/非法正文返回空 turns 或明确错误；
9. 不解析 UpdateVariable 作为剧情摘要；
10. 不创建 RelationshipMemory；
11. 不写 state，只返回待提交对象与诊断。

### 必测

- 单角色台词；
- 多角色各取自己的台词；
- 主目标无台词时用正文兜底；
- 不相关角色台词不产生 turn；
- 协议和状态标签不会进入 summary；
- 中文、换行、属性顺序、空台词；
- 160 字截断确定性；
- 同一输入重复运行逐字节相同；
- 游戏时间来自 state，不来自 `Date.now()`；
- /亲密剧情只记录事实摘要，不自动推断 lover 或关系状态。

### 完成证据

纯测试全部通过；本任务不接 bridge、不写楼层。

---

## B2-T06：实现合成历史投影器

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；重点重读总计划 §2.2–2.4、§7、§13–14，完整阅读第一批数据结构、容量 helper 和 field ledger。尤其重读 database-rolecards 的 floor/UI binding：真实楼层是状态承载，不等于模型历史。

### 目标

新增不可能接触真实楼层的纯投影器，输出恰好一条 system history。

### 必做步骤

1. 新增 `src/ui/synthetic-history.ts`；
2. 函数签名只接收 GardenState、frozen relevant IDs、frozen visit map 和角色登记信息；
3. 签名不得接收 chat messages、SillyTavern context 或任意宿主 getter；
4. 按 §3.5 生成稳定分块；
5. 过去 visit 排除 frozen current visit；
6. closed visit 按结束 serial/day/原数组稳定顺序选最近 2 个，显示时旧到新；
7. current visit 精确按 frozen visit ID 找，不因后来重入改投新 visit；
8. 关系记忆只读，不修改 active；
9. legacy_unassigned 永不投影；
10. 实现 §3.6 预算与确定性裁剪；
11. 无内容返回固定边界消息；
12. 返回深拷贝/新对象，不污染 state。

### 必测

- 无记忆也恰好一条非空 system；
- 只有过去、只有当前、只有关系、只有 legacy；
- 上次入场与本次入场明确分块；
- 离场再入场后旧 visit 只在过去块；
- 新 visit 不续旧位置/动作的边界文本存在；
- 每角色 900、全局 2800；
- 关系 boundary/conflict 不被普通记录挤掉；
- legacy_unassigned 不出现；
- null 日期不被写成昨天/今天；
- 角色顺序稳定；
- 同一 state 重复 100 次逐字节相同；
- state 输入不变；
- canary 真实楼层字符串无任何输入通道可传入该函数。

### 完成证据

输出 fixture 与长度断言都写进测试；禁止仅 snapshot 一大段文本而没有结构性断言。

---

## B2-T07：构造 V2 冻结请求与上下文指纹

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；另外完整阅读当前 `gal-generation-request.ts` 及其全部测试、T03/T06 新模块、总计划 §8–9。

### 目标

在玩家楼层创建前完成一次性请求快照，retry/recovery 不再重算历史。

### 必做步骤

1. 新增 V2 request builder，不篡改 V1 builder 的历史语义；
2. 输入接收纯 visible input、状态快照、结构化角色上下文、contractInjector；
3. 先 resolve 角色和 freeze visit；
4. 再构造 synthetic history；
5. `modelUserInput` 本批继续保持现有 contractInjector 逐字节行为；
6. `contextFingerprint` 至少覆盖：chat/owner、state floor/swipe、scene、visible input、model input hash、相关角色顺序、visit map、synthetic history 精确文本、history/memory/prompt revision；
7. hash 输入使用稳定序列化，不依赖对象键偶然顺序；
8. V2 request 对调用方只读，后续 attempt 不可原地改 synthetic history；
9. 玩家楼层 metadata 必须足够恢复同一冻结请求；
10. retry helper 只更新 attemptSeq 或创建 attempt，不重建 request 内容；
11. 删除/停用 V2 对 `historyFingerprintInput` 真实楼层摘要的依赖。

### 必测

- visible/model input 各只出现一次；
- 改任一 visit ID/history 字节会改变 fingerprint；
- 对象键顺序不改变 fingerprint；
- retry history/hash/fingerprint 不变；
- V2 metadata round-trip 恢复逐字节相同；
- V1 测试不回归；
- 无 history 时仍是非空 system；
- 无相关角色时仍成功构造 V2：`relevantCharacterIds=[]`、visit map `{}`、非空历史边界，且不产生 VisitTurn；
- request 构造期间 state 不变。

### 完成证据

实施日志记录 V2 持久化取舍与恢复证明，不能写“以后再说”。

---

## B2-T08：把所有新发送入口接到 V2 与 Helper generate

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；另外再次完整阅读 `bridge.ts`、`message-transaction.ts`、`app.ts` 所有发送入口、T01 入口表、T02 API 证据和当前 transaction 测试。

### 目标

让每一个新 GAL 发送共享同一 V2 request，并从生成调用中彻底切断真实楼层。

### 2026-08-09 外援复核后的强制裁定

以下裁定不是建议，优先于实施日志里 T08 的“待确认”与“已知取舍”：

1. V2 builder 失败必须在创建玩家楼层前抛出带 reason 的错误；禁止把 `request` 置空后继续 `transactions.submit()`；
2. 每次新的 `sendUserMessage` / 系统生成入口必须创建新 requestId，禁止从旧 `pendingRequest` 继承；只有 retry 才复用冻结 request；
3. app 只传未注入的纯文本；`withGardenNarrativeContract` 只允许 bridge 的统一 request builder 调用一次；
4. 无角色请求是合法 V2，不得使用 `ownerCharacterId` 冒充剧情角色；
5. 道具选择使用结构化 `sceneItemPreview`，bridge 基于最新持久状态构造本轮只读 promptState；生成成功后仍由原 M2 命令正式消费，失败不持久化；
6. `sendAnomalyResolution` 与 `sendDuelVictoryRequest` 都是模型生成入口，必须创建 V2 request 和 metadata；`pendingSystemOperation` 只负责本地结算，不能替代生成请求；
7. opening / opening-repair 继续按 T01 裁定保留旧路径，本批不纳入角色记忆 V2；除此之外所有 GAL 剧情生成入口必须 V2；
8. V2 transport 和 retry 分流必须按当前 request schema 判断，禁止用全局 `generationTransport` 推断 V2；
9. `MessageTransactionSnapshot.requestSchema` 必须在带 request 的 submit/restore 时真实赋值，不能只加类型不用；
10. T08 未完成前当前半接线状态不可运行交付，不得进入 T09。

### T08 恢复执行顺序

T08 必须按 R0 → R1 → R2 → R3 → R4 → R5 串行完成。每个检查点开始前都必须重新完整阅读 §1.1 的 9 份固定文件，在实施日志逐文件写本检查点自己的回执；不得写“本会话前面读过、文件未变”。每个检查点 focused tests 通过后才能进入下一个。

#### B2-T08-R0：先修请求合同与失败边界

开始前重新完整阅读固定 9 份文件，并完整阅读 `character-memory.ts` 的 resolver、`gal-generation-request.ts` V2 parser/builder 和对应测试。

必须完成：

1. `resolveRelevantCharacterIds` 在 `requireMainTarget:false` 且无登记角色时返回成功空数组；
2. 低层 V2 parser/builder 接受空相关角色，但只接受严格空 visit map；
3. `requireMainTarget:true` 仍拒绝缺失主目标；
4. 无角色仍构造非空 system 历史边界；
5. `buildVisitTurnCommit` 对空相关角色返回“无可提交 turn”的正常结果，不把它当生成失败；
6. bridge 遇到任何 V2 构造失败都在 `transactions.submit` 之前抛错；
7. 错误信息包含 builder reason，便于诊断；
8. 删除“失败后 request undefined 继续旧路径”的分支。

必测：合法无角色、强制主目标缺失、空 visit map、非空 visit map 与空角色不匹配、builder 失败不建玩家楼层、不调用 trigger/generate。

#### B2-T08-R1：修新请求身份与单次注入

开始前重新完整阅读固定 9 份文件，并完整阅读 `app.ts` 所有模型发送调用、bridge `sendUserMessage`、request/attempt ID helper。

必须完成：

1. 新 `sendUserMessage` 不向 builder 传旧 `pendingRequest.requestId` 或旧 attemptSeq；
2. 新发送构造成功后才把该请求赋给 `pendingRequest`；
3. retry 仍只复用 pending/metadata 恢复出的同一冻结请求；
4. `MessageTransactionSnapshot.requestSchema = request.schema`；
5. 普通 submit、目标动作、设施、装修、异变调查等 app 入口移除预先 `withGardenNarrativeContract`；
6. `submitGalMessage` 接受并合并结构化 requestContext：主目标、动作目标、事件参与者、session 参与者、显式 greenlight IDs；
7. 角色 target 才可成为 mainTarget，facility ID 不能冒充角色 ID；
8. 每个入口的 `modelUserInput` 中正文协议只出现一次。

必测：连续发送两条消息 requestId 不同；retry requestId 相同而 attempt 不同；所有普通入口写 V2 metadata；单次注入；自然语言角色名不影响 relevant IDs。

#### B2-T08-R2：保留场景道具的事务语义

开始前重新完整阅读固定 9 份文件，并完整阅读 `activity-rules.ts` 的 scene item 全链、`m2-commands.ts`、app 道具选择路径、bridge request 构造。

`GalRequestContext` 增加结构化预览，字段语义冻结为：

```ts
sceneItemPreview?: {
  itemId: string;
  useId: string;
  sceneId: string;
  targetCharacterId: string | null;
}
```

bridge 的顺序固定：

1. 读取最新持久 `before`；
2. 用 `queueSceneItemUse(before, ...)` 纯函数得到 `promptState`；
3. request 的身份边界、pending ownership 与正式 settlement 仍以持久 `before` 为基础；
4. contractInjector 使用 `promptState`，因此本轮模型能看到正式道具授权；
5. synthetic history 允许使用 `promptState`，但它与 `before` 的 visit memory 必须相同；
6. 生成成功后 app 按原路径调用 `applyM2Command(queue_scene_item)` 正式持久化与消费；
7. 生成失败时不执行 M2 命令，道具数量和 scene context 不变；
8. 禁止让 app 传整份可变 GardenState 给 bridge；禁止提前持久化再补偿回滚。

必测：本轮 model input 含一次道具授权；失败不消费；成功只消费一次；相同 useId 幂等；preview 不改变传入 state；道具预览不改变 relevant IDs、visit map 或 history memory 内容。

#### B2-T08-R3：把两个系统生成入口改为 V2

开始前重新完整阅读固定 9 份文件，并完整阅读 `sendAnomalyResolution`、`sendDuelVictoryRequest`、对应 app 调用和本地 settlement/recovery 代码。

异变收束：

- app 传未注入的 prompt；
- bridge 从最新持久状态创建全新 V2 request；
- relevant 角色使用结构化 event/session/presence；允许最终为空；
- 保留 `gensokyoSystemOperation` metadata，并与 V2 metadata 合并，不互相覆盖；
- 保留 `pendingSystemOperation.type='anomaly_resolution'` 的本地归档所有权。

决斗胜利：

- app 传未注入的 message；
- bridge 在胜利要求锁定并复读后，以 `pending.target_character_id` 作为 mainTarget；
- `requireMainTarget:true`；
- request state 使用锁定后 reread 状态；
- 保留 duel system-operation metadata 与 settlementId；
- 不创建第二套结算器。

必测：两个入口均写 V2 + system-operation metadata、均只走 Helper synthetic history、均不调用 `/trigger`、builder 失败不创建楼层、本地 settlement 身份保持原样。

#### B2-T08-R4：锁死 Helper transport 与 retry 判定

开始前重新完整阅读固定 9 份文件，并完整阅读 `triggerGeneration`、`runHelperGenerate`、`retryLastTransaction`、MessageTransactionCoordinator 和 stop/retry tests。

必须完成：

1. V2 首次生成按 request schema 强制 Helper；
2. V2 Helper 不存在/抛错时 fail closed；
3. V2 retry 按 `pendingRequest.schema` 或 snapshot.requestSchema 进入 `retryFromScratch`；
4. V2 永不进入 `continueGeneration()`；
5. 全局 `generationTransport` 只服务 V1/诊断，不能覆盖 V2 合同；
6. 新 attempt 只改变 attemptId/generationId/commitKey/attemptSeq；
7. retry 不重建 history、visit map、model input、fingerprint；
8. V2 settled 后的新发送不得复用旧 requestId；
9. chat/owner 身份漂移继续 fail closed。

必测：默认全局 transport 为 native 时 V2 仍走 Helper；stop→retry 不调用 continue；Helper 缺失不调用 trigger；连续新请求 ID 不同；retry 冻结字段逐字节相同。

#### B2-T08-R5：补齐集成测试并重新声明完成

开始前重新完整阅读固定 9 份文件，并完整阅读 T08 全部最终 diff 与新增测试；旧 T08 的半成品完成声明作废。

最低证据：

1. R0～R4 focused tests 全部通过；
2. app 所有 GAL 剧情入口静态映射表更新；
3. canary 真实楼层不出现在 generate config；
4. model input 不双注入；
5. 无角色设施剧情仍为 V2；
6. scene item preview 成功/失败矩阵；
7. anomaly/duel V2 metadata；
8. V2 fail-closed、retry-from-scratch；
9. opening/opening-repair 是唯一明确保留的非 V2 生成路径；
10. `npm run check:ui`、全部 focused tests、`npm test` 精确结果；
11. 全仓搜索并解释所有剩余 `/trigger`、`/continue`、`buildChatHistoryForGenerate` 引用；
12. 实施日志追加“外援复核问题逐项关闭表”，六个边界一个都不能写“已知取舍”。

### 必做步骤

1. UI 入口传纯玩家可见文本；不要在 app 中先后多次套 `withGardenNarrativeContract`；
2. bridge 在统一位置构造 V2 request；
3. 所有普通/特殊入口都显式传结构化 target/participants；
4. coordinator 仍是唯一消息事务状态机；
5. V2 transport 固定为 `helper-generate`；
6. 调用固定包含：独立 generation_id、V2 modelUserInput、`should_stream: false`、`should_silence: true`、`overrides.chat_history.prompts = request.syntheticHistory`、`with_depth_entries: false`；本批不得擅自切换成流式；
7. 调用前断言 history 恰好一条、非空、role 全为 system；
8. 删除生产路径对 `buildChatHistoryForGenerate(activeMessages(), ...)` 的调用；
9. Helper 不可用、history 非法或身份漂移时 fail closed；
10. 禁止 V2 静默回退 `/trigger`；
11. 保留现有 generation_id 事件过滤、聊天身份和 owner 身份过滤；
12. 不碰 regenerate 分支。

### 必测

- 构造假的真实楼层 canary，最终 generate options 中完全不存在；
- 当前玩家楼层不重复进入 history；
- prompts 非空且 system-only；
- `with_depth_entries: false` 存在；
- Helper 失败不调用 `/trigger`；
- 所有发送入口都创建 V2 metadata；
- 入口不重复注入 narrative contract；
- regenerate 相关源文本/测试保持不变；
- coordinator 外没有新的 generate 调用入口。

### 停止线

若 Helper 4.8.18 不能静默生成并由现有 bridge 精确落 assistant 楼层，停止报告 API 缺口；不准用原生 trigger 糊过去。

---

## B2-T09：接入 stop、retry 与 reload recovery

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；另外完整阅读 `message-transaction.ts`、bridge 的 stop/retry/restore 段、attempt/commit parser 和相关所有测试。不要只读方法名。

### 目标

保证暂停和失败只改变 attempt，不改变逻辑请求和历史。

### 必做步骤

1. V2 stop 只停止当前 generationId；
2. stop 后不得把 partial stream 当 accepted response 写 turn；
3. V2 的“继续”按钮语义改为从同一 request retry，不调用 `/continue`；
4. retry 创建新 attempt/generation/commit，requestId 不变；
5. V2 retry 的判断依据是冻结 request 的 schema 或已持久化 `snapshot.requestSchema`，不是全局 `generationTransport`；
6. 不创建第二个玩家楼层；
7. 不重新读取 activeMessages、current state 或新的 visit；
8. reload 从 metadata 恢复冻结 V2；
9. 若 assistant 已存在而 lifecycle pending，只重做 settlement/memory commit，不再生成；
10. 若 request metadata 缺失/损坏，进入明确失败态，不猜 history；
11. chat/owner 不匹配时不写任何楼层；
12. V1 恢复保持兼容边界，不能调用 V2-only memory commit；
13. 记录恢复状态矩阵。

### 必测

- stop → retry：history/fingerprint/visit map 相同，attempt 不同；
- partial output 不写 turn；
- reload 在生成前、assistant 后 settlement 前、settled 后三种状态；
- assistant 已存在不二次 generate；
- chat switch 不串写；
- owner switch 不串写；
- damaged metadata fail closed；
- retry 不新增玩家楼层；
- V2 源码路径不含 `/continue`；
- V1 回归。

### 完成证据

日志必须列出每个恢复状态的“生成？写楼？结算？写 turn？”四列裁定。

---

## B2-T10：把 VisitTurn 纳入精确 assistant 楼层结算

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；另外完整阅读 bridge 的 assistant 落楼、MVU replace、local settlement、commit lifecycle、message ID/swipe ID 反查代码，以及 T04/T05 新模块。重点重读 floor-and-ui-binding reference。

### 目标

只在已接受的精确 assistant 楼层上，将最终状态和 VisitTurn 一起可靠提交。

### 冻结顺序

1. Helper 输出通过现有正文/身份校验；
2. assistant 楼层以 attempt metadata 和 lifecycle pending 落地；
3. 按 commitKey/requestId 精确反查 assistant messageId/swipeId；
4. 完成现有模型变量和本地 settlement，得到最终 GardenState；
5. 从 accepted output 构造 VisitTurn；
6. 对 frozen visit map 逐角色精确 upsert；
7. 将最终 state 与 lifecycle settled 写回同一 assistant 楼层；
8. 复读该楼层，验证 request/attempt/commit、turn_id 和 settled；
9. 任一步失败保持 pending/failed recovery 状态，不写邻近楼层。

如果现有代码必须先写一次 state、再盖 settled，实施可保留最少必要的两阶段写，但必须证明每次都针对同一 messageId/swipeId，且中途 reload 可幂等恢复。不得按“最后一层 assistant”模糊定位。

### 必做步骤

1. 在 bridge 统一 settlement 点调用纯 commit builder；
2. 不在事件监听回调和普通发送入口分别写 turn；
3. 使用 request 冻结 visit ID，不使用 settlement 后 active visit 猜目标；
4. missing/conflict visit 使 lifecycle 不得标 settled；
5. 某角色 visitId 为 null 只跳过该角色，不伪造 visit；
6. retry 同 turn_id 更新审计字段，不累计重复；
7. recovery 重做时幂等；
8. assistant swipe 身份精确写入 VisitTurn；
9. 失败不能污染玩家楼层或前一 assistant swipe；
10. 更新 field ledger 的 VisitTurn 写入者为 Bridge settlement。

### 必测

- 正常 active visit；
- 回复中 presence 使角色离场，turn 仍进 just-closed visit；
- 离场后立刻重入，turn 仍不进新 visit；
- 多角色一次各一条；
- missing/conflict 保持 pending；
- settlement 重放无重复；
- 相邻 assistant 楼层不会被误写；
- swipe ID 精确；
- assistant 已落楼、写 state 前崩溃可恢复；
- state 已写、settled 前崩溃可恢复；
- stop/失败/空正文无 turn。

### 完成证据

除单元测试外，必须有静态集成测试证明 exact ID 传递链；本批不要求实机探针，也不得声称 runtime PASS。

---

## B2-T11：退役旧 conversation_log 新写入与直接投影

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；另外完整阅读 `target-actions.ts`、`prompt-context.ts`、`variable-output-format.md`、state migration、character-memory legacy migration 和所有 conversation_log 测试。

### 目标

让 VisitTurn + synthetic history 成为新剧情记忆的唯一生产/投影链，同时保留旧存档迁移能力。

### 必做步骤

1. 从 `gardenNarrativeContract` 删除要求 LLM append `/interaction/conversation_log/-` 的句子；
2. 删除依赖“最近互动回顾”的旧连续性措辞，改为引用合成历史边界或保持中性；
3. 从 `buildPromptContext` 删除 `conversation_log` 直接投影块；
4. 从变量输出格式文档删除/标记退役该 append 示例；
5. 更新旧测试：不再期待写入协议和 prompt 回顾；
6. 保留 schema/initial-state 中 `conversation_log`；
7. 保留字符串兜底、增量 migration、fingerprint 与原值不删除；
8. 保留 `current_relationship_facts` 旧链，本批不切关系候选；
9. 更新 field ledger：conversation_log = legacy migration source only；
10. 全仓搜索确认生产提示中没有 `conversation_log/-`；
11. 确认 synthetic history 可投影已迁移 legacy，但绝不投影 unassigned。

### 必测

- 新 contract 不要求 conversation_log patch；
- prompt context 不读 conversation_log；
- 旧 conversation_log migration 25 条相关回归仍通过；
- 原字段仍保留；
- 新增旧源条目仍可增量迁移；
- 新生成只新增 VisitTurn，不新增 conversation_log；
- current_relationship_facts 行为未被误删。

### 禁区

不删除旧字段，不把 migration 改成 destructive，不顺手实现关系候选，不全面迁移 prompt 到 injects。

---

## B2-T12：全入口、预算、恢复与泄漏回归测试

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；另外完整阅读本批全部新增/修改源码和测试、总计划 §12–15、tavern-card-builder validation reference。不得只运行测试不读实现。

### 目标

建立验收 agent 可以只看代码逻辑复核的防回归网。

### 最低测试文件建议

- `tests/synthetic-history.test.mjs`
- `tests/visit-turn-commit.test.mjs`
- `tests/gal-generation-request-v2.test.mjs`，或在现有文件中明确分 V2 区块
- `tests/message-transaction-v2.test.mjs` 的第二批扩展
- `tests/ui-contract.test.mjs` 的旧链退役断言

### 必须覆盖的矩阵

1. 真实楼层 canary 永不进入 generate options；
2. no-memory 仍有非空 system history；
3. 过去/本次入场分块和 re-entry；
4. relationship/legacy 只读选择；
5. 每角色 900、全局 2800；
6. relevant IDs 稳定和最多 4 人；
7. V2 metadata/fingerprint/round-trip；
8. 所有普通和特殊发送入口；
9. Helper fail closed，不回退 trigger；
10. stop 不提交 partial；
11. retry request 不变、attempt 变化；
12. reload 三阶段恢复；
13. exact assistant message/swipe；
14. 告别写 closed visit；
15. 幂等 turn；
16. conversation_log 不新增、不直投影、仍可迁移；
17. V1 兼容；
18. regenerate 源码/合同未被本批改造；
19. current_relationship_facts 未误删；
20. 无 Date.now/random 用于领域 ID 或游戏时间。

### 运行命令

至少运行：

```text
node --test tests/character-memory.test.mjs
node --test tests/synthetic-history.test.mjs
node --test tests/visit-turn-commit.test.mjs
node --test tests/gal-generation-request.test.mjs tests/message-transaction-v2.test.mjs tests/phase4-restore.test.mjs
npm run check:ui
npm test
git diff --check
```

文件名若调整，日志写实际命令。必须记录 pass/fail/skipped 精确数量。禁止把未运行写成 PASS，禁止把静态测试叫实机验收。

### 失败处理

- 先定位是本批回归还是基线既有失败；
- 只修本批范围；
- 每个修复增加最小防回归断言；
- 不删除测试、不降低断言、不扩大 timeout 掩盖逻辑错误。

---

## B2-T13：差异审计、文档收尾与申请验收

### 开始前必须重新完整阅读

必须重新读 §1.1 的 9 份固定文件并在日志逐项回执；另外重读本批实施日志全文、`project/contract.md`、`project/api-provenance.md`、`src/schema/field-ledger.md` 和全部 git diff。最后一个任务也不能省 skill 门禁。

### 目标

证明做的是第二批，不是趁机把半个项目重写了。

### 必做步骤

1. `git diff --check`；
2. `git status --short`；
3. 区分本批改动与 T00 前已有改动；
4. 逐文件审计是否越过 §4；
5. 全仓搜索：`buildChatHistoryForGenerate`、`conversation_log/-`、`/trigger`、`/continue`、`/regenerate`、`with_depth_entries`；
6. 确认新 V2 send 无真实历史、无 trigger/continue fallback；
7. 确认 regenerate 未动；
8. 确认没有 database/R2/dist/package 产物；
9. 更新 field ledger 的所有者、读者、容量与退役状态；
10. API provenance 只写本次实际静态核验证据，不添加 probe PASS；
11. 实施日志写最终文件表、测试表、遗留项、风险和回滚边界；
12. 申请代码逻辑验收，不自行提交、推送、打包或发布。

### 完成证据

最终回复必须包含：任务编号、修改文件、核心合同、精确测试结果、未做事项、git status、请求验收。只回复“完成了，测试全绿”视为交付失败。

---

## 6. 跨任务硬禁区

以下任一项出现，本批直接退回：

1. V2 仍从 `activeMessages()`、`chat` 或 DOM 拼模型历史；
2. 合成历史为空时回退真实楼层；
3. V2 默认/失败时调用 `/trigger`；
4. stop 后调用 `/continue` 读取宿主历史；
5. retry 重新读取当前 state 生成新 history；
6. 用“最后一条 assistant”代替精确 messageId/swipeId；
7. 告别 turn 因角色已离场而丢失，或被写进新 visit；
8. LLM 直接生成 visit_id、turn_id、日期或关系状态；
9. 同时继续写 conversation_log 和 VisitTurn，形成双剧情记忆权威；
10. 删除 conversation_log 导致旧存档不可迁移；
11. 把关系亲密事件自动等同 lover；
12. 把 12 条关系记忆误改成 12 条剧情摘要；
13. 改第一批 48/12 容量或 model version；
14. 为本批新增数据库或第二种发行包；
15. 顺手做全面 prompt injects 改造；
16. 顺手改 regenerate；
17. 用旧卡、旧包或邻近 Helper 版本作目标版本证据；
18. 把 probe、浏览器演示或时机测试写进必验命令；
19. 覆盖用户已有未提交事务/R2改动；
20. 缺任一任务或 T08-R0～R5 检查点的独立 skill 阅读回执；
21. V2 builder 失败后用无 request 的 transaction 继续发送；
22. 两条全新玩家消息复用同一 requestId；
23. 用全局 `generationTransport` 代替 request schema 决定 V2 retry；
24. 无相关角色时伪造角色、拒绝合法独处剧情或回退 V1；
25. app 与 bridge 双重调用 `withGardenNarrativeContract`；
26. 道具 preview 缺失授权、提前消费，或失败后仍持久化；
27. 异变收束/决斗胜利任何一个模型入口不带 V2 metadata。

---

## 7. 代码逻辑验收标准

### 7.1 请求与发送

- [ ] 新发送全为 `gal-generation-request.v2`；
- [ ] V1 仍可读取；
- [ ] opening/opening-repair 是唯一明确保留的非 V2 生成入口；
- [ ] visible/model input 不重复；
- [ ] app 传纯文本，正文协议只由 bridge 注入一次；
- [ ] relevant IDs 与 visit map 请求时冻结；
- [ ] 合法无角色请求使用空 IDs/空 visit map/非空历史边界；
- [ ] fingerprint 覆盖合成历史和版本；
- [ ] 所有发送入口统一进入现有 coordinator；
- [ ] 异变收束和决斗胜利同时带 V2 与各自 system-operation metadata；
- [ ] V2 只走 Helper generate；
- [ ] history 恰好一条非空 system；
- [ ] `with_depth_entries: false`；
- [ ] 真实楼层 canary 不泄漏；
- [ ] Helper/V2 builder 失败都不创建降级请求、不回退 trigger；
- [ ] 连续两个新发送 requestId 不同，retry 才复用 requestId；
- [ ] snapshot.requestSchema 被真实写入和恢复；
- [ ] V2 retry 按 schema 走 retryFromScratch，永不 `/continue`；
- [ ] scene item preview 在成功时只消费一次、失败时不消费。

### 7.2 合成历史

- [ ] 每角色关系/过去/当前/legacy 分块稳定；
- [ ] 上次入场只作背景；
- [ ] 本次入场按冻结 visit；
- [ ] re-entry 不续旧现场；
- [ ] 过去最多 2 visits；
- [ ] 当前最多 6 turns；
- [ ] 关系最多 6；
- [ ] 每角色 ≤900，全局 ≤2800；
- [ ] legacy_unassigned 不投影；
- [ ] 无日期不伪造昨天/今天；
- [ ] 无内容也不回退真实历史；
- [ ] 投影纯函数不修改 state。

### 7.3 VisitTurn

- [ ] 只从 accepted response 构造；
- [ ] stop/失败/空正文不写；
- [ ] 每 request+character 一个稳定 turn_id；
- [ ] summary ≤160；
- [ ] 游戏时间来自最终 state；
- [ ] exact assistant message/swipe；
- [ ] active 与 just-closed visit 都可精确写；
- [ ] missing/conflict fail closed；
- [ ] retry/recovery 幂等；
- [ ] 不创建关系候选或关系状态。

### 7.4 旧链与边界

- [ ] conversation_log 不再新增；
- [ ] conversation_log 不再直接投影；
- [ ] 旧字段与迁移仍保留；
- [ ] current_relationship_facts 本批未误删；
- [ ] regenerate 未改；
- [ ] prompt injects 专项未提前做；
- [ ] database/R2/package/dist 未动；
- [ ] 无 runtime probe 声称。

### 7.5 质量证据

- [ ] 每任务有独立全文阅读回执；
- [ ] T08-R0～R5 各自有重新全文阅读回执，不引用“前面读过”；
- [ ] focused tests 全绿；
- [ ] `npm run check:ui` PASS；
- [ ] `npm test` 全绿且无 skipped 掩盖；
- [ ] `git diff --check` PASS；
- [ ] 文件改动与 T00 基线可区分；
- [ ] field ledger/API provenance 与实际代码一致；
- [ ] 实施日志足以让另一个验收 agent 不靠猜。

---

## 8. 本批完成后仍然明确遗留

第二批通过后，以下仍未完成，禁止在交付文案里暗示已经完成：

1. regenerate/swipe 使用同构冻结请求；
2. relationship_memory_candidates 的模型提议、正文证据校验与 Bridge 提交；
3. 12 条关系记忆中新亲密事件/关系状态的生产写入；
4. 全部动态提示从 user input 迁到 docs 所述楼层/system inject 方式；
5. standalone 与 database-assisted 两版本；
6. 数据库归档、召回、降级和同步；
7. UI 测试通道打包与 R2 发布；
8. 实机 SillyTavern 多楼层、swipe、reload、same-floor 与 iframe timing 验收；
9. 性能预算与最终发行验收。

建议后续分批：

- 第三批：关系候选与关系记忆提交；
- 第四批：regenerate 同构；
- 第五批：提示词楼层/system injection 专项；
- 第六批：standalone/database-assisted 双版本；
- 最后再做运行时与发行验收。

---

## 9. 给实施 agent 的最终交付模板

```text
第二批“发送与合成历史”实施完成，申请代码逻辑验收。

完成任务：B2-T00 ～ B2-T13（逐项列出）

核心结果：
- 新请求版本：...
- 新发送 transport：...
- 真实楼层隔离证据：...
- 合成历史预算：...
- VisitTurn 精确提交位置：...
- conversation_log 退役边界：...

修改文件：
- ...

测试：
- 命令：...
- pass/fail/skipped：...

明确未做：
- runtime probe / 时机演示
- regenerate
- relationship candidates
- database
- prompt injects 全面迁移
- UI 打包 / R2 / 发布

当前 git status：
- ...

请按 project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md 验收；不要直接发布。
```

不允许把“未做”删掉，也不允许拿一句“测试都过了”替代精确证据。毕竟会说话的测试不少，会守合同的才值钱。

---

## 10. 首次代码逻辑验收返修单（B2-F00～B2-F06，强制）

### 10.0 验收裁定与执行方式

首次代码逻辑验收结论：**第二批不通过，不得封账、提交、推送、打包或发布。**

本轮返修的结构裁定为：

- `gal-generation-request.ts`：Local Fix；补齐 V1/V2 恢复分派，不重写请求模型；
- `bridge.ts` 的 assistant 结算边界：Staged Refactor；把已经重复且漏分支的 VisitTurn/lifecycle 提交收束到一个明确入口；
- `message-transaction.ts`：Local Fix；只补全恢复后的 request schema/identity 传递，不另造协调器；
- 系统操作恢复：Local Fix；复用同一恢复分析器和统一提交入口，不保留“第一条非空 assistant”旁路；
- schema、容量、迁移、合成历史、发送 transport：No Refactor，本轮不得顺手改。

执行必须按 **F00 → F01 → F02 → F03 → F04 → F05 → F06** 串行进行。前一项 focused tests 未通过，不得进入下一项；不得把几个任务合成一句“统一修复”。

### 10.1 每个返修小任务的重新阅读门禁

每一个 `B2-Fxx` 开始前，实施者本人必须重新完整阅读并在实施日志写该任务自己的逐文件回执：

1. `C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md`；
2. `C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md`；
3. `C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md`；
4. `C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md`；
5. `C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md`；
6. `C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md`；
7. `C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md`；
8. `C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md`；
9. 本实施手册全文，尤其 §3.2、§3.3、T09、T10、§6、§7 与本 §10；
10. `project/gal-character-memory-batch-2-implementation-log.md` 的 T08～T13 和最终遗留项；
11. 当前任务列出的全部源码与测试文件全文。

禁止写“本会话前面已经读过”“文件没变所以不重读”。每个 F 任务都必须独立记录 `[B2-Fxx][read] ...`。

### 10.2 首次验收发现矩阵

| ID | 严重度 | 已确认代码证据 | 实际后果 | 旧测试为何没抓到 |
|---|---|---|---|---|
| F-A | P1 | `analyzeChatRestore()` 只调用 V1 `restoreGalGenerationRequest()`；V2 restore 只有定义/导入，没有进入恢复入口 | 合法 V2 玩家楼层在 reload 后被判为 `none`，未完成、待结算、已结算三态均不能正确恢复 | `phase4-restore.test.mjs` 的 fixture 全由 V1 `createGalGenerationRequest()` 构造 |
| F-B | P1 | `preserveLocalOwnership()` 在调用 VisitTurn 之前用 state 相等分支直接 `markSettlementSucceeded()` 并 return | 普通回复没有 MVU 变化时不写任何 VisitTurn，却已永久 settled | 现有 VisitTurn 测试只测纯函数或源码形状，没有执行 bridge 的相等分支 |
| F-C | P1 | 异变/决斗恢复用玩家楼层后的“第一条非空 assistant”，不验 request/attempt/commit；只写本地结算 | 可选错相邻 assistant 楼层；reload recovery 漏写 VisitTurn | 没有系统操作 reload + 相邻 assistant 干扰集成 fixture |
| F-D | P1 | 固定事件复读只调用 `settlementProjection()`；普通 ownership 写后不复读；`persistCommitSettled()` 不验证 turn | VisitTurn 写入丢失或部分写入时仍可标记 settled，后续 recovery 不再修复 | 测试没有注入 replace 成功但 turn 缺失/复读不一致的故障 |
| F-E | P2 | bridge 构造 VisitTurn 时 `assistantSwipeId: null` 写死 | 审计身份不满足 exact assistant message/swipe 合同 | 纯函数支持 swipe，但生产接线没有传入实际值 |
| F-F | P1 | reload 后没有把恢复出的 V2 request 赋回 `pendingRequest`；retry 以 `pendingRequest!` 调 `retryFromScratch` | 即使补上 V2 analyzer，reload 后 retry/settlement 仍可能拿 null 请求崩溃或无法写 frozen visit | snapshot schema 测试没有验证 bridge 内存请求水合 |

验收时已经完成的最小复现必须保留为回归语义：同一 V2 metadata 经 `restoreGalGenerationRequestV2()` 返回成功，但旧 `analyzeChatRestore()` 返回 `{ kind: 'none' }`。返修后的断言必须改为 `incomplete`，不得只删除复现。

---

## B2-F00：冻结返修基线并纠正完成声明

### 开始前必须重新完整阅读

执行 §10.1 全部阅读门禁；另外完整阅读 `git status --short`、本手册、实施日志 T09～T13、`tests/phase4-restore.test.mjs`、`tests/visit-turn-settlement.test.mjs`、`tests/phase2-contract.test.mjs`。

### 必须完成

1. 在实施日志新增“首次验收未通过”章节，逐条抄录 F-A～F-F，不得把 P1 改写成“后续优化”；
2. 明确撤销旧日志中“T09/T10/T12/T13 已完成”和“第二批可验收”的效力；旧文字可以保留作历史，但必须在其上方或最终汇总处加醒目的 superseded 标记；
3. 记录返修前基线：focused 112/112、全量 431/431、`npm run check:ui` PASS、`git diff --check` PASS；
4. 记录当前 dirty worktree，明确 `reasonix`、R2/UI、既有事务文件都属于用户现有改动，不得清理或代为提交；
5. 新建返修测试清单，先写失败语义，再动生产代码。

### 禁区

- 不改生产代码；
- 不改旧测试让它“继续绿”；
- 不运行 probe、浏览器、打包、发布；
- 不提交或推送。

### 完成证据

- 实施日志有 F00 独立阅读回执、基线命令和 superseded 声明；
- 新增/调整的回归测试在旧代码上至少能证明 F-A、F-B 或 F-F 中对应语义尚未满足；
- 不要求为了展示红灯而长期保留无法运行的测试提交，日志必须记录返修前失败点。

---

## B2-F01：让恢复分析器真正兼容 V1/V2

### 开始前必须重新完整阅读

执行 §10.1 全部阅读门禁；另外完整阅读：

- `src/ui/gal-generation-request.ts`；
- `src/ui/message-transaction.ts` 的 `restoreFromChat()`；
- `src/ui/bridge.ts` 的 `restoreFromChat()`；
- `tests/gal-generation-request-v2.test.mjs`；
- `tests/phase4-restore.test.mjs`。

### 目标合同

最新玩家楼层带 V2 metadata 时，恢复分析器必须恢复**原样冻结的 V2 request**；不得重新读取当前 state、active messages 历史或当前 visit 来重建。V1 只保留兼容读取，不能吞掉或降级损坏的 V2。

### 详细修复方法

1. 把 `ChatRestoreResult` 中的 `request: GalGenerationRequest` 改为 `request: GalAnyRequest`；所有 `incomplete`、`settlement-pending`、`confirmed` 分支都要保留真实 schema；
2. 在 `gal-generation-request.ts` 增加一个单一恢复分派 helper，例如 `restoreAnyGalGenerationRequest(extra)`；名字可调整，语义不可调整：
   - 若顶层或 `extra.extra` 存在 `REQUEST_EXTRA_KEY_V2`，只调用 `restoreGalGenerationRequestV2()`；
   - V2 key 存在但 malformed/incomplete/invalid 时返回明确冲突，**不得继续尝试 V1**；
   - 仅在完全没有 V2 key 时才调用 V1 `restoreGalGenerationRequest()`；
   - V1/V2 都不存在时返回 missing/none；
3. `analyzeChatRestore()` 改用该 helper，并把 `hasMetadata` 扩展到 V1/V2 的顶层及嵌套 key；
4. assistant commit 扫描继续按恢复出的 `requestId + chatId + ownerCharacterId` 校验；不得因为 request 是 V2 而弱化 attempt/commitKey 检查；
5. 最新用户楼层有 V2 metadata、后面只有普通无 attempt metadata assistant 时，不得假装 V2 confirmed；应按既有合同返回可解释的冲突或非自动恢复状态，具体枚举写入日志并测试；
6. 删除 `bridge.ts` 中“导入了却不使用”的 `restoreGalGenerationRequestV2`，或者让统一 helper 真正成为唯一调用点；禁止保留两个互相不一致的恢复解析器。

建议伪代码：

```ts
if (hasV2Key(extra)) {
  const restored = restoreGalGenerationRequestV2(extra);
  return restored.ok ? { ok: true, request: restored.request } : toRestoreFailure(restored.code);
}
const legacy = restoreGalGenerationRequest(extra);
return legacy.ok ? { ok: true, request: legacy.request } : toRestoreFailure(legacy.code);
```

### 必测

1. V2 玩家楼层、无 assistant → `incomplete`，request 逐字段等于 metadata round-trip 结果；
2. V2 玩家楼层、精确 pending assistant → `settlement-pending`；
3. V2 玩家楼层、精确 settled assistant → `confirmed`；
4. 损坏 V2 + 合法 V1 并存 → conflict，禁止降级 V1；
5. V2 chat/owner 不匹配 → 不写、不恢复；
6. V2 多 commit → conflict；
7. V1 原有恢复矩阵全部保持；
8. 测试必须真的调用 `analyzeChatRestore()`，禁止只测 `restoreGalGenerationRequestV2()`。

### 停止线

若为了兼容 V2 需要重新构造 synthetic history、重新读 state 或重新 freeze visit，立即停止；那说明实现偏离冻结请求合同。

---

## B2-F02：恢复后水合 pendingRequest，并让 retry fail closed

### 开始前必须重新完整阅读

执行 §10.1 全部阅读门禁；另外完整阅读 `bridge.ts` 中 `pendingRequest` 全部赋值/清理点、`restoreFromChat()`、`retryLastTransaction()`，以及 `message-transaction.ts` 的 submit/retry/retryFromScratch/restore 全文。

### 目标合同

reload 恢复出的 V2 request 必须成为本次恢复事务唯一的内存冻结请求；retry 只能复用它。缺失完整请求时明确失败，绝不能用 TypeScript 非空断言把 null 传入 retry。

### 详细修复方法

1. bridge `restoreFromChat()` 在 `incomplete`、`settlement-pending`、`confirmed` 返回 V2 request 时同步水合 `pendingRequest = result.request`；
2. `conflict` 时必须清空 `pendingRequest` 并保持事务 failed；不得残留上一个 chat/request；
3. chat change、owner change、local end 和显式 reset 必须同时清理 transaction snapshot 与 `pendingRequest`；
4. `retryLastTransaction()` 删除 `pendingRequest!`：
   - 当 snapshot/request schema 表明是 V2，但 `pendingRequest?.schema !== V2` 时，抛出“冻结 V2 请求缺失，禁止重建或降级”的明确错误；
   - 只有完整 V2 request 存在时才调用 `retryFromScratch(pendingRequest)`；
   - V1 保持原 continue/retry 兼容边界；
5. `settlement-pending` 和已有 assistant 的 recovery 不得调用 generate、`/trigger`、`/continue`，也不得新增玩家楼层；
6. `confirmed` 恢复不得重复写 turn；但如果后续 F05 的精确验证发现 lifecycle 与 turn 不一致，不得把它视为 confirmed，须退回 settlement recovery；
7. 不把 request 存进新的全局/localStorage；玩家楼层 metadata 仍是 reload 权威，`pendingRequest` 只是当前 bridge 实例缓存。

### 必测

- V2 incomplete reload 后 retry：requestId/history/hash/fingerprint/visit map 不变，attempt/commit 改变，不新增玩家楼层；
- V2 settlement-pending reload：不调用模型，只进入结算；
- V2 confirmed reload：不调用模型、不重复 turn；
- snapshot 标 V2 但 metadata 无法恢复：明确失败，不触发 generate；
- chat switch/owner switch 后旧 `pendingRequest` 不可再用；
- V1 retry 语义不回归。

---

## B2-F03：统一 accepted assistant 的 VisitTurn 与 lifecycle 提交边界

### 开始前必须重新完整阅读

执行 §10.1 全部阅读门禁；另外完整阅读：

- `bridge.ts` 的 `persistLocalSettlement()`、`preserveLocalOwnership()`、`persistCommitSettled()`、`settlePendingAfterReply()`、`requirePendingSettlement()`；
- `visit-turn-commit.ts`；
- `event-settlement.ts` 的 ownership/settlement/projection；
- `tests/visit-turn-commit.test.mjs`、`tests/visit-turn-settlement.test.mjs`、相关 transaction tests。

### 目标合同

任意已接受 V2 assistant——包括没有任何 MVU 字段变化的普通闲聊——都必须先基于最终 state 构造 VisitTurn，再决定是否需要写盘；只有精确复读证明 VisitTurn 与 lifecycle 同时成立后，coordinator 才能进入 settled。

### 详细修复方法

1. 删除或移动 `preserveLocalOwnership()` 中位于 VisitTurn 之前的 `JSON.stringify(current) === JSON.stringify(protectedState)` 提前返回；
2. 把普通 ownership、固定事件 settlement、系统操作 settlement 最终都汇入一个 bridge 内统一 helper，例如：

```ts
finalizeAcceptedAssistant({
  request,
  snapshot,
  assistantMessageId,
  assistantText,
  transformFinalState,
})
```

   可以换名，但不得新造 coordinator、第二套请求或第二个记忆权威；
3. 统一 helper 的固定顺序必须是：
   1. 校验当前 chat/owner；
   2. 按 attempt metadata 校验精确 assistant message；
   3. 等待既有 variable stage ready；
   4. 从该 messageId 读取 MVU data；
   5. 应用现有 ownership/local settlement，得到最终 GardenState；
   6. **无条件**对 V2 调用 `applyVisitTurnsToFinalState()`；
   7. 把最终 state 与目标 lifecycle settled 写回同一 messageId；
   8. 复读并执行 F05 的完整验证；
   9. 验证通过后才 `markSettlementSucceeded()`；
4. state 相等优化只能放在第 6 步之后，并比较“含 VisitTurn 和 lifecycle 的完整目标数据”；只要 turn/lifecycle 有差异就必须写；
5. `persistCommitSettled()` 不得继续成为“未验证 turn 也能盖 settled”的旁路：
   - 优先把 lifecycle 合并进统一 helper 的同一次写；
   - 若宿主限制必须两阶段写，第二阶段仍只能针对同一 messageId，并在最终复读同时验证 turn + lifecycle；
6. `settlementProjection()` 继续负责事件事实，不得冒充 VisitTurn 验证器；
7. `applyVisitTurnsToFinalState()` 失败（malformed output、visit missing/conflict）必须保持 settlement pending/failed，可幂等重试；不得盖 settled；
8. frozen visit 为 null 导致零 turn 是合法情况，但仍需验证 request/attempt/commit/lifecycle；不得伪造 visit。

### 必测

1. 普通 V2 对话，模型没有改变任何 MVU 字段：仍新增一个 VisitTurn；
2. 普通 V2 对话已有同 turn_id：retry 覆盖 attempt/commit 审计，不追加；
3. 固定事件既完成事件 settlement，也写 VisitTurn；
4. 告别时 active visit 已关闭：写入 frozen closed visit；
5. VisitTurn helper 失败：transaction 不得 settled；
6. replace 成功但复读缺 turn：transaction 不得 settled；
7. lifecycle 写入失败或复读仍 pending：transaction 不得 settled；
8. 上述测试必须执行 bridge 实际使用的统一 helper；只用正则确认源码出现函数名不算集成证据。

---

## B2-F04：修复异变收束与决斗胜利 reload recovery

### 开始前必须重新完整阅读

执行 §10.1 全部阅读门禁；另外完整阅读 `sendAnomalyResolution()`、`sendDuelVictoryRequest()`、`recoverRecordedAnomalyResolution()`、`recoverRecordedDuelVictory()`、对应 app 调用、duel/anomaly 本地规则与测试。

### 目标合同

系统操作必须像普通 V2 request 一样，使用冻结 request、精确 assistant、同一 MVU 楼层和统一 VisitTurn 提交；system-operation metadata 只描述本地操作，不得取代 request/attempt 身份。

### 详细修复方法

1. 删除两条恢复路径中的 `messages.slice(index + 1).find(first nonempty assistant)` 逻辑；
2. 从最新系统操作玩家楼层同时解析：
   - `galGenerationRequestV2`；
   - `gensokyoSystemOperation`；
   - 玩家 messageId；
3. 通过 F01 的 `analyzeChatRestore()` 或同一精确 commit resolver 得到唯一 assistant：requestId、attemptId、commitKey、chatId、owner 全部匹配；
4. 多个匹配、无 metadata 的相邻 assistant、operationId/settlementId 不一致全部 fail closed；不得猜“最近”或“第一条”；
5. 恢复异变时先幂等应用 `resolveAnomaly`/settled ID，再把最终 state 交给 F03 统一 helper 写 VisitTurn 和 lifecycle；
6. 恢复决斗时先幂等应用 `completeDuelVictoryDialogue`，再交给同一 helper；
7. 即使本地 operation 已经 settled，只要对应 frozen VisitTurn 或 lifecycle 尚未验证，也必须继续完成缺失部分；不得因 `settled_ids.includes(operationId)` 提前 return；
8. assistant 已存在时绝不生成第二次，不新增玩家楼层；
9. 无相关角色的异变收束可以合法零 turn，但仍须精确完成 operation/lifecycle；决斗胜利必须保持冻结对手 visit 规则。

### 必测

- 异变 reload：目标 assistant 前插入一条无关 assistant，仍只命中带正确 commit 的楼层；
- 决斗 reload：同上；
- operation 已结算但 turn 缺失：补 turn，不重复本地奖励/结果；
- turn 已存在但 lifecycle pending：只幂等补齐 lifecycle；
- 两条相同 commit assistant：conflict，不写任一楼层；
- system metadata 正确但 V2 metadata 损坏：失败，不降级旧恢复；
- 两路径恢复均不调用 generate、`/trigger`、`/continue`。

---

## B2-F05：精确 swipe 身份与最终复读验证

### 开始前必须重新完整阅读

执行 §10.1 全部阅读门禁；另外完整阅读 raw message reader、`normalizeMessages()`、attempt metadata、`visitTurnCommitRefs()`、MVU message-floor options 和现有 swipe/regenerate 测试。API 只采用项目已记录的 Helper 4.8.18 静态依据，不新增 probe。

### 目标合同

VisitTurn 必须记录本次 accepted assistant 的真实 message ID 和当前 swipe ID；最终复读必须证明 metadata、turn 和 lifecycle 都位于同一精确 assistant 当前 swipe。没有证据时保持 pending，不猜 ID。

### 详细修复方法

1. 保证 bridge 的 raw/normalized message 类型保留 `swipe_id`；不得在 normalize 时丢弃；
2. 从已经通过 attempt metadata 反查的那一条 assistant 读取 `message_id` 与 `swipe_id`，禁止使用“最后一楼”或最新全局 swipe；
3. 删除生产接线中的 `assistantSwipeId: null` 写死值；V2 精确提交时若 swipe ID 缺失/非法，明确失败并保持 settlement pending；不要私自假定 0；
4. 在 MVU 写入前后都复核该 message 的当前 swipe 未变化。若写盘期间发生 swipe 切换，停止并进入可恢复失败态，不向相邻 swipe 写；
5. 不发明未经证据支持的 `Mvu.getMvuData({ swipe_id })` 参数。本批继续用已验证的 message-floor API，以 raw message 当前 swipe 身份作前后守卫；
6. 新增纯验证 helper（可放在现有 `visit-turn-commit.ts`，不要无必要新建模块），输入至少包括：
   - frozen request；
   - expected turn 列表；
   - attempt/commit；
   - assistant message/swipe；
   - 复读后的 state、lifecycle 和 raw assistant metadata；
7. 对每个 expected turn 按 frozen `visitIdsByCharacter[characterId]` 在 active/closed visit 中精确查找，并验证：
   - `turn_id === requestId + ':' + characterId`；
   - `request_id`、`latest_attempt_id`、`latest_commit_key`；
   - `assistant_message_id`、`assistant_swipe_id`；
   - 不存在重复 turn_id；
8. 同时验证 lifecycle schema/status/commitKey 与 assistant attempt metadata；任一不符，不得 `markSettlementSucceeded()`；
9. partial write 允许已经产生一部分 state，但必须依靠同 turn_id upsert 在 recovery 中幂等收敛，禁止回滚覆盖邻近楼层。

### 必测

- swipe 0 与 swipe 1 分别原样进入 VisitTurn；
- assistantMessageId 正确但 swipe 在写前变化 → 不写/不 settled；
- 写后 swipe 变化 → 验证失败并保持可恢复；
- turn 在错误 visit、错误 message、错误 swipe、错误 commit 任一情况 → 验证失败；
- 相同 turn_id recovery 后只保留一条且审计字段更新；
- V1 不调用 V2-only swipe/turn 验证；
- regenerate 行为本批仍不改。

---

## B2-F06：补齐真实集成测试、差异审计与重新申请验收

### 开始前必须重新完整阅读

执行 §10.1 全部阅读门禁；重新完整阅读本 §10、所有 F00～F05 日志、最终 diff、所有新增/修改测试。不得只读测试名称。

### 测试结构要求

1. `phase4-restore` 必须新增由 `createGalGenerationRequestV2/buildRequestMetadataV2` 构造的真实 V2 三态矩阵；
2. 必须通过 `createHostBridge()` 的可控 host/MVU mock，或调用 bridge 实际使用的导出统一 helper，执行至少以下集成链：
   - normal V2 no-state-change → turn + settled；
   - fixed settlement → event + turn + settled；
   - reload settlement-pending → 不 generate，只补 turn/lifecycle；
   - anomaly reload → exact assistant + turn；
   - duel reload → exact assistant + turn；
3. 只读取源码并用 `assert.match()` 的 contract 测试可以保留作护栏，但**不能作为上述运行分支的唯一证据**；
4. host mock 必须能注入：相邻 assistant、重复 commit、replace 后复读缺字段、swipe 改变、chat/owner 改变；
5. 每个失败 fixture 都验证：不新增玩家楼层、不再 generate、不写邻近 assistant、不标 settled；
6. 更新旧测试标题中已经退役但仍写着“prompt 注入 conversation_log 回顾”等误导文案，使标题与当前断言一致；只改文案/断言语义，不删旧迁移 fixture；
7. 更新实施日志最终遗留项：删除“assistant swipe 恒 null”和“系统操作 reload 不写 VisitTurn”，因为它们是本轮必须修复项，不是允许遗留项；
8. 更新 field ledger/API provenance 仅限实际发生的 writer/reader/静态证据变化；不得写 runtime PASS。

### 必跑命令

先 focused，再全量：

```powershell
node --test tests/gal-generation-request-v2.test.mjs tests/phase4-restore.test.mjs tests/message-transaction-v2.test.mjs tests/visit-turn-commit.test.mjs tests/visit-turn-settlement.test.mjs tests/phase2-contract.test.mjs
npm run check:ui
npm test
git diff --check
git status --short
```

若新增独立 system-recovery 或 bridge-settlement 测试文件，必须加入 focused 命令并在日志写实际文件名。记录精确 pass/fail/skipped 数量。

### 最终差异审计

逐项确认：

1. `analyzeChatRestore` 真正读取 V2；
2. V2 restore 后 `pendingRequest` 已水合，retry 无非空断言赌 null；
3. 普通无状态变化回复仍写 turn；
4. 系统操作恢复不再使用第一条/最后一条 assistant；
5. 所有 V2 accepted assistant 都经过统一提交与最终复读；
6. `assistantSwipeId: null` 不再存在于 V2 生产接线；测试 fixture 中合法 null 不算生产接线；
7. lifecycle settled 之前必有完整验证；
8. conversation_log、关系候选、regenerate、database、R2/package 没有被顺手改；
9. 没有 probe、浏览器演示或实机 PASS 声称；
10. dirty worktree 中用户其他改动未被覆盖、清理、提交或推送。

### 返修通过门槛

以下条件必须全部满足才能重新申请代码逻辑验收：

- F-A～F-F 六项均有代码修复和非源码正则式回归证据；
- focused、tsc、全量、diff check 全部通过；
- 实施日志明确旧完成声明已被返修结果取代；
- §7.1 的 V2 reload/retry、§7.3 的 exact message/swipe 与 recovery 幂等全部可勾选；
- 仍明确声明未做 runtime probe、时机演示和实机验收。

任何一项未满足，都只能写“返修进行中”，不能再次写“T10 完成”“第二批完成”或请求封账。
