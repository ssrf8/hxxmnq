# GAL 角色记忆重构：第二批「发送与合成历史」实施日志

> 本日志按 `project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md`（下称本 runbook）逐任务记录。
> 每个任务开始前重新执行 §1.1 全文阅读门禁并逐项回执；本日志不再接收第一批过程记录（第一批日志 §24 封账）。

---

## B2-T00：建立当前工作区基线与实施日志（2026-08-09）

### 阅读回执（本人逐文件全文阅读，非摘要、非转述、非子代理代读）

```
[B2-T00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T00][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T00][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T00][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T00][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T00][read] project/gal-character-visit-memory-and-synthetic-history-plan.md（全文 1202 行）
[B2-T00][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T00（含 §0–§9 全文 1117 行）
[B2-T00][read] project/contract.md（全文）
[B2-T00][read] project/api-provenance.md（全文）
[B2-T00][read] src/schema/field-ledger.md（全文，含 GAL 角色记忆模型第一批 v1 部分）
[B2-T00][read] project/gal-character-memory-batch-1-implementation-log.md §23–§24（首轮验收修复与最终封账）
```

### 环境基线

| 项 | 值 |
|---|---|
| 日期 | 2026-08-09 |
| 分支 | main |
| HEAD | `de1b5683f019ae241e398738fa2c849b96630001`（merge: character visit memory foundation） |
| origin/main | `de1b5683f019ae241e398738fa2c849b96630001`（与 HEAD 一致） |
| Node | v24.18.0 |
| npm | 11.16.0 |

停止线核验：HEAD 是含 `de1b568` 的历史；第一批封账文档存在（`gal-character-memory-batch-1-implementation-log.md` §24）；当前未提交事务源码与计划描述相符（`src/ui/gal-generation-request.ts` 已存在，`synthetic-history.ts`/`visit-turn-commit.ts` 尚不存在）。通过，不停止。

### 当前 package.json 测试与类型检查命令

| 命令 | 内容 |
|---|---|
| `npm run check:ui` | `tsc --noEmit` |
| `npm test` | `node --test tests/*.test.mjs` |

### 基线测试结果（B2-T00 修改任何代码前）

| 命令 | 结果 |
|---|---|
| `npm run check:ui` | PASS（tsc 无诊断输出） |
| `npm test` | pass 342 / fail 0 / skipped 0 / cancelled 0 / todo 0，duration 8063ms |

基线全绿，无既有失败需判定。基线通过 `node --test` 统计口径：tests 342，suites 0，pass 342，fail 0，skipped 0。

### 当前 git status --short 逐项标注（全部为本批开始前已存在，本批不得覆盖）

| 状态 | 路径 | 归属说明 |
|---|---|---|
| M | package.json | 发送事务/R2/UI 外置化未提交改动（本批前） |
| M | project/api-provenance.md | 本批前未提交的发送事务证据 |
| M | project/gal-character-memory-batch-1-data-foundation-runbook.md | 第一批封账文档（禁止改合同正文） |
| M | project/gal-character-memory-batch-1-implementation-log.md | 第一批封账文档（禁止改合同正文） |
| M | project/gal-character-visit-memory-and-synthetic-history-plan.md | 总计划（本批前） |
| M | scripts/build-ui.mjs | R2/UI 外置化（本批前） |
| M | scripts/package-checkpoint.mjs | R2/UI 外置化（本批前） |
| M | scripts/publish-ui.mjs | R2/UI 外置化（本批前） |
| M | src/runtime/ui-host-shell.js | UI 外置化（本批前） |
| M | src/runtime/ui-loader.js | UI 外置化（本批前） |
| M | src/ui/app.ts | 发送事务/UI（本批前；本批允许按 §4.1 最小修改） |
| M | src/ui/async-coordination.ts | 发送事务（本批前） |
| M | src/ui/bridge.ts | 发送事务（本批前；本批允许按 §4.1 修改） |
| M | src/ui/index.html | UI 外置化（本批前） |
| M | src/ui/message-transaction.ts | 发送事务（本批前；本批允许按 §4.1 修改） |
| M | src/ui/types.ts | 发送事务（本批前；本批允许按 §4.1 修改） |
| M | tests/ui-contract.test.mjs | 发送事务测试（本批前；本批允许按 §4.1 修改） |
| ?? | .playwright-mcp/ | 探针/浏览器残留目录（本批不使用、不清理） |
| ?? | project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md | 本 runbook（新增未提交） |
| ?? | project/gal-generate-transaction-acceptance-brief.md | 发送事务（本批前） |
| ?? | project/gal-generate-transaction-implementation-log.md | 发送事务（本批前） |
| ?? | project/gal-generate-transaction-refactor-plan.md | 发送事务（本批前） |
| ?? | project/phase-2-design.md | 本批前 |
| ?? | project/r2-ui-test-channel-implementation-log.md | R2（本批前） |
| ?? | project/r2-ui-test-channel-publish-plan.md | R2（本批前） |
| ?? | scripts/upload-live-asset.mjs | R2（本批前） |
| ?? | src/ui/gal-generation-request.ts | 发送事务 V1（本批前；本批允许按 §4.1 新增 V2） |
| ?? | tests/gal-generation-request.test.mjs | V1 测试（本批前；本批可扩展 V2 区块） |
| ?? | tests/message-transaction-v2.test.mjs | 发送事务测试（本批前；本批可扩展） |
| ?? | tests/phase2-contract.test.mjs | 本批前 |
| ?? | tests/phase4-restore.test.mjs | 本批前 |
| ?? | tests/runtime-js-syntax.test.mjs | 本批前 |
| ?? | tests/transaction-boundaries.test.mjs | 本批前 |
| ?? | tests/ui-channel.test.mjs | 本批前 |
| ?? | verify-console-full.log / verify2-console.log / verify3-console.log | 探针日志（本批不使用、不删除） |

无关改动保护声明：本批不 reset / checkout / clean / stash；不修改上述标注为“本批前”且不属于 §4.1 允许清单的文件；不触碰 `.reasonix/`、`docs/`、`dist/`、数据库与打包脚本。

### 本批文件触碰清单（预计，后续每任务追加）

新增：
- `project/gal-character-memory-batch-2-implementation-log.md`（本文件，已创建）
- `src/ui/synthetic-history.ts`（B2-T06）
- `src/ui/visit-turn-commit.ts`（B2-T05）
- `tests/synthetic-history.test.mjs`（B2-T06/B2-T12）
- `tests/visit-turn-commit.test.mjs`（B2-T05/B2-T12）

修改（仅 §4.1 允许清单）：
- `src/ui/gal-generation-request.ts`（V2 类型/parser/serializer/指纹）
- `src/ui/message-transaction.ts`（V2 接入、stop/retry/recovery）
- `src/ui/bridge.ts`（统一 V2 构造、Helper generate、VisitTurn 结算）
- `src/ui/app.ts`（仅统一传纯可见文本和结构化目标）
- `src/ui/types.ts`（request snapshot 类型）
- `src/ui/character-memory.ts`（按 visit ID 精确 upsert 纯 helper）
- `src/ui/prompt-context.ts`（移除 conversation_log 直接投影）
- `src/ui/target-actions.ts`（移除 conversation_log 新写入协议及旧连续性措辞）
- `src/lorebook/variable-output-format.md`（移除 conversation_log 新写入示例/要求）
- `src/schema/field-ledger.md`（所有者/读取者/退役状态更新）
- `tests/gal-generation-request.test.mjs`、`tests/message-transaction-v2.test.mjs`、`tests/ui-contract.test.mjs`（V2/退役断言扩展）
- `project/api-provenance.md`（仅本批实际静态核验证据）

### T00 完成声明

- 实施日志存在：是（本文件）；
- 完整阅读回执：是（见上）；
- git 与测试基线：是（HEAD/origin/main/Node/npm/status/check:ui/npm test 均已记录）；
- 无关改动保护声明：是（见上）；
- 代码修改：本任务未修改任何代码（`npm run check:ui` 与 `npm test` 在修改前运行）。

---

## B2-T01：盘点现有发送、监听、停止、重试与恢复路径

### 阅读回执（本人逐文件全文阅读，非摘要、非转述、非子代理代读）

```
[B2-T01][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T01][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T01][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T01][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T01][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T01][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T01][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T01][read] project/gal-character-visit-memory-and-synthetic-history-plan.md（全文 1202 行）
[B2-T01][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T01（含 §0–§9 全文）
```

（下文源码盘点完成后，源码全文阅读回执追加于盘点表后）

### T01 源码全文阅读回执

```
[B2-T01][read] src/ui/bridge.ts（全文 2342 行）
[B2-T01][read] src/ui/message-transaction.ts（全文 482 行）
[B2-T01][read] src/ui/gal-generation-request.ts（全文 581 行）
[B2-T01][read] src/ui/app.ts（全文 3788 行）
[B2-T01][read] src/ui/async-coordination.ts（全文）
[B2-T01][read] src/ui/target-actions.ts（全文 687 行；conversation_log 写入要求点）
[B2-T01][read] src/ui/prompt-context.ts（全文；conversation_log 提示投影点）
[B2-T01][read] src/ui/character-memory.ts（接口层导出清单；数据层结构）
[B2-T01][read] tests/gal-generation-request.test.mjs（全文）
[B2-T01][read] tests/message-transaction-v2.test.mjs（全文）
[B2-T01][read] tests/transaction-boundaries.test.mjs（全文）
[B2-T01][read] tests/phase4-restore.test.mjs（全文）
```

### 发送/监听/停止/重试/恢复路径盘点表（唯一事务链）

| # | 盘点项 | 现状证据（file:line） | 本批改造后唯一归宿 |
|---|---|---|---|
| 1 | GAL 自由对话入口 | app.ts:1676 `submitGalMessage` → app.ts:1703 `bridge.sendUserMessage(withGardenNarrativeContract(value, promptState), kind, userVisibleText, { sceneId })`；表单提交 app.ts:2158；建议回应 app.ts:1208 | 统一走 V2 request builder + Helper generate |
| 2 | 固定事件/受控行动入口 | app.ts:1664 `chooseTargetAction` → submitGalMessage(buildActionMessage(...))；设施行动 app.ts:3287 `bridge.sendUserMessage(withGardenNarrativeContract(prompt,...))` | 同上（buildActionMessage 保留，内部改 V2） |
| 3 | 异变调查/收束入口 | app.ts:3483 `bridge.sendUserMessage(withGardenNarrativeContract(prompt, state, ['reimu']), 'interaction')`；app.ts:3509 `bridge.sendAnomalyResolution(...)` | sendAnomalyResolution 改走 V2 兼容 |
| 4 | 决斗胜利剧情入口 | app.ts:2842 `bridge.sendDuelVictoryRequest(requestText, message)` | 改走 V2 兼容 |
| 5 | 开场入口 | bridge.ts:1232 `commitOpening` 经 transactions.submit({kind:'opening'})，无 request metadata（旧路径） | 保持旧路径（V1 兼容，不新建 V2）；非 GAL 记忆范畴 |
| 6 | 开场修复入口 | bridge.ts:1288 `repairOpening` 经 transactions.submit({kind:'opening'}) | 同上 |
| 7 | 事件/道具/结算等本地事务 | app.ts 各 bridge.applyM2Command / purchaseShopItem / useSpecialItem 等，不经生成 | 不受本批影响 |
| 8 | native-trigger 分支 | bridge.ts:454 `generationTransport` 默认 native-trigger；triggerGeneration 走 `g.triggerSlash('/trigger await=true')`（见 bridge trigger 分支） | 本批统一改为 helper-generate（V2） |
| 9 | helper-generate 分支 | bridge.ts:617-739 `runHelperGenerate`：订阅 iframe_events STARTED/STREAM/ENDED/STOPPED 并按 generationId 过滤；config 含 generation_id、user_input、overrides.chat_history.prompts=buildChatHistoryForGenerate(activeMessages(), userMessageId)（**真实楼层进入请求点 #1**） | config 改用 V2 frozen request：overrides.chat_history.prompts=syntheticHistory、with_depth_entries:false |
| 10 | 真实楼层进入请求点 | bridge.ts:656 `buildChatHistoryForGenerate(activeMessages(), userMessageId)`；gal-generation-request.ts:441 实现 | 本批后此路径不再被 V2 调用；仅 V1 兼容保留 |
| 11 | 玩家楼层创建 | message-transaction.ts:116 `host.createUserMessage(message, {gensokyoTransactionId, gensokyoTransactionKind, ...request.extra})`；V2 需在玩家楼层前冻结 | V2：桥接层先 buildV2Request 再 submit；metadata 足够恢复 |
| 12 | assistant 楼层创建（helper 自动落楼） | bridge.ts:700-723：ST 自动落楼 → 补 attempt metadata + commit lifecycle pending；未落楼 → writeHelperAssistantMessage | 不变（MVU/本地结算顺序保留）；之后追加 VisitTurn 提交 |
| 13 | Mvu.replaceMvuData / local settlement | bridge.ts:883 `persistStagedLocalSession`、settlePendingAfterReply 链路；MVU 结算在 assistant 落楼后 | 保留顺序；VisitTurn 提交置于 settle 成功之后 |
| 14 | commit lifecycle settled | gal-generation-request.ts buildCommitLifecycle(attempt,'settled')；bridge settlePendingAfterReply 后写入 | 保留；VisitTurn 幂等写入与 settled 同序 |
| 15 | retry | message-transaction.ts retry()（settlement 失败只重跑 settlement；stop 后 continue）；app.ts:2164 `gg-retry-transaction` | V2：retry 复用同一 frozen request，不重建历史 |
| 16 | retryFromScratch | message-transaction.ts:356 测试证据；同 requestId 新 attempt 三件套 | V2：复用 frozen request + 新 attemptId/generationId/commitKey |
| 17 | continue | bridge.ts:1785 `continueGeneration` → triggerSlash('/continue') | 保持（V2 冻结请求不受影响） |
| 18 | reload restore | gal-generation-request.ts analyzeChatRestore（incomplete/confirmed/settlement-pending/conflict/none）+ bridge restoreFromChat；phase4-restore.test.mjs | V2：玩家楼层 metadata 携带 request 快照 hash/相关角色/visit map，restore 复用 |
| 19 | chat switch | bridge.ts:1939 CHAT_CHANGED → restoreWhenIdle → transactions.resetForChatChange + restoreFromChat | 保持；V2 快照按 chatId 绑定 |
| 20 | stop | bridge.ts:1788 stopGeneration（helper 按 generationId abort + 600ms 重试窗）；message-transaction markStopped/markStopReconciled | 保持；停止后从同一 frozen request 重试 |
| 21 | conversation_log 写入要求 | target-actions.ts:28 gardenNarrativeContract：模型每轮把关键互动追加到 interaction.conversation_log（JSON Patch /-/，≤120 字） | **本批退役**：从 contract 移除该要求；字段保留不删 |
| 22 | conversation_log 提示投影 | prompt-context.ts:49-64 【最近互动回顾】取尾 6 条按在场过滤 | **本批退役**：移除该投影段 |
| 23 | conversation_log 迁移源 | character-memory.ts:586 migrateConversationLogToLegacyMemory（第一批） | 保留作迁移源，不新增 |
| 24 | 生成配置默认 | bridge.ts:649-659 config（无 with_depth_entries → 默认 true？需核对） | V2 显式 with_depth_entries:false |

### T01 结论

唯一事务链确认：**app（submitGalMessage 等入口）→ bridge.sendUserMessage（创建 V1 request → transactions.submit 写玩家楼层 → triggerGeneration）→ MessageTransactionCoordinator（reconcile 等待 assistant 落楼）→ settlePendingAfterReply（MVU 结算）→ commit lifecycle settled**。helper-generate 已存在（bridge.ts:617），但历史仍来自真实楼层（buildChatHistoryForGenerate）且无 V2 冻结请求。本批只接入现有 MessageTransactionCoordinator，不新造协调器/bridge/监听器。盘点完成，进入 T02。

---

## B2-T02：核验 Helper API 合同并冻结 V2 类型

### 阅读回执（本人逐文件全文阅读）

```
[B2-T02][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T02][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T02][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T02][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T02][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T02][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T02][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T02][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §8–9、§15（本会话 T01 已全文阅读，文件未变）
[B2-T02][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T02、§3.2–3.6（本会话 T01 已全文阅读，文件未变）
[B2-T02][read] F:/agent airp/Luker/public/scripts/extensions/third-party/JS-Slash-Runner/manifest.json（版本 4.8.18）
[B2-T02][read] F:/agent airp/Luker/public/scripts/extensions/third-party/JS-Slash-Runner/@types/function/generate.d.ts（全文 537 行）
[B2-T02][read] project/api-provenance.md（本会话 T00 已全文阅读，文件未变）
[B2-T02][read] src/ui/types.ts 的 VisitTurn/VisitRecord/CharacterMemory/MessageTransactionSnapshot/GardenBridge 相关段
```

### Helper 4.8.18 generate() API 证据表（静态声明核验，不运行探针）

| 字段 | 声明证据（generate.d.ts） | 裁定 |
|---|---|---|
| `generation_id` | GenerateConfig.generation_id?: string（L234，stopGenerationById 按 ID 停止） | 可用（bridge 已在用） |
| `user_input` | GenerateConfig.user_input?: string（L237） | 可用 |
| `should_stream` | L257 boolean，默认 false | 可用（V2 保持 false） |
| `should_silence` | L268 boolean，默认 false；true 时不受停止按钮影响，必须 stopGenerationById | 可用（V2 保持 true，按 ID 停止） |
| `overrides.chat_history.prompts` | Overrides.chat_history.prompts?: RolePrompt[]（L363；RolePrompt role 'system'\|'assistant'\|'user' + content L339） | 可用（V2 只传 system role） |
| `overrides.chat_history.with_depth_entries` | L361 boolean，默认 true（注释明示） | 可用（V2 显式 false） |
| `overrides.chat_history.author_note` | L362 | 本批不用 |
| `injects` | GenerateConfig.injects?: Omit<InjectionPrompt,'id'>[]（L277） | **本批冻结裁定：不新增**（runbook §2.3/§8.2） |
| `stopGenerationById` | L216 (generation_id: string) => boolean | 可用（bridge 已在用） |
| generate 返回 | Promise<string \| GenerateToolCallResult>（L146） | 本批只处理 string；tool-call 拒绝 |

版本证据：`F:/agent airp/Luker/public/scripts/extensions/third-party/JS-Slash-Runner/manifest.json` 声明 `"version": "4.8.18"`。未使用 4.8.19 或旧打包数据。无字段缺证据，不 STOP。

### V2 冻结裁定

- 不新增 `injects`；
- `promptRevision` 保持 `gal-prompt.v1`（不冒充提示词 v2）；
- 独立 `historyRevision: gal-synthetic-history.v1`、`memoryRevision: character-visit-memory.v1`；
- 新发送只写 V2；恢复读取同时支持 V1/V2；
- 完整 V2 请求持久化到玩家楼层 metadata（新 key `galGenerationRequestV2`），保证 reload recovery 复用同一冻结请求，不重读状态重建（runbook §3.2）；
- V2 只接受 `role: 'system'` 的 syntheticHistory；parser 拒绝空 history、空 relevantCharacterIds、未知 revision、重复角色 ID、visit map 多余/缺失键。

### 完成证据

（代码与测试见下方实施；T02 只改 `src/ui/gal-generation-request.ts` 与新增测试，不改任何生成调用接线——调用接线留到 T08。）

### T02 实施结果

代码（本次修改）：
- `src/ui/gal-generation-request.ts`：新增 V2 常量（REQUEST_SCHEMA_V2/REQUEST_EXTRA_KEY_V2/HISTORY_REVISION/MEMORY_REVISION）、SyntheticHistoryMessage/GalGenerationRequestV2 类型、createGalGenerationRequestV2 构造器（拒绝 empty-input/missing-chat-identity/empty-history/non-system-history/empty-relevant/duplicate-character/visit-map-mismatch/unknown-revision）、withPlayerMessageIdV2/advanceGalGenerationRequestV2、buildRequestMetadataV2（新 key 不覆盖 V1）、parseRequestMetadataV2（V1/V2 兼容读取，含 extra.extra 嵌套）、restoreGalGenerationRequestV2（完整冻结请求重建 + 未知字段 passthrough）。V1 parser/serializer 未改动。
- `src/ui/types.ts`：MessageTransactionSnapshot 增加 `requestSchema?`；GardenBridge.sendUserMessage 的 requestContext 类型升级为 `GalRequestContext`（sceneId + relevantCharacterIds + visitIdsByCharacter，T08 接线）。
- 新增 `tests/gal-generation-request-v2.test.mjs`（13 个测试）。

测试：
- `node --test tests/gal-generation-request-v2.test.mjs`：tests 13 / pass 13 / fail 0 / skipped 0
- `npm test`：tests 355 / pass 355 / fail 0 / skipped 0（V1 342 项回归无损 + V2 13 项）
- `npm run check:ui`：PASS（tsc 无诊断）

冻结裁定落实：不新增 injects；promptRevision 保持 gal-prompt.v1；history/memory 独立 revision；新发送只写 V2，恢复同时支持 V1/V2；完整 V2 请求持久化到玩家楼层 metadata（recovery 复用同一冻结请求，测试证明逐字节一致）；V2 parser 拒绝空 history、空相关角色、未知 revision、重复角色 ID、visit map 多余/缺失键；V2 写新 key galGenerationRequestV2，不覆盖 V1 extra。没有生成调用改动（接线留 T08）。

---

## B2-T03：实现相关角色与 visit 快照纯函数

### 阅读回执（本人逐文件全文阅读）

```
[B2-T03][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T03][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T03][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T03][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T03][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T03][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T03][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T03][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §2、§6–8（本会话 T01 已全文阅读，文件未变）
[B2-T03][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T03、§3.4（本会话 T01 已全文阅读，文件未变）
[B2-T03][read] src/ui/types.ts（全文 750 行；本会话 T02 已读，T03 实现前复核相关段）
[B2-T03][read] src/ui/character-memory.ts（全文 1023 行：normalize/ensure/lifecycle/容量/getCharacterMemory 等）
[B2-T03][read] src/ui/character-greenlights.ts（角色登记表 character-routing.json 消费方；全文）
[B2-T03][read] src/lorebook/character-routing.json（已登记角色白名单：reimu/marisa/cirno/alice/mystia/suika/nitori/sakuya）
[B2-T03][read] src/ui/event-registry.ts（事件 participants 来源；相关段）
[B2-T03][read] src/ui/app.ts 的所有发送入口（本会话 T01 已全文阅读 3788 行）
```

### 设计决定（写入日志备查）

- `resolveRelevantCharacterIds(input)` 输入必须是结构化 ID 集合（主目标/动作 target/事件 participants/session participants/在场集合），不接收整段玩家文本；按 runbook §3.4 优先级分层去重、过滤登记表、最多 4 人；主目标缺失且必须主目标时返回显式错误。
- 角色登记表采用 `src/lorebook/character-routing.json` 的 8 个固定角色 ID（contract.md 固定八人一致；不用角色显示名作稳定键）。
- `freezeVisitIds(state, characterIds)` 为每个相关角色输出 `active_visit?.visit_id ?? null`；只读不创建 visit（visit 创建仍由第一批 presence lifecycle 独占）；不读真实聊天、不改写 visit map。
- 纯函数放 `src/ui/character-memory.ts`（runbook §4.1 允许其增加第二批必要纯 helper）。

### T03 实施结果

代码：
- `src/ui/character-memory.ts`：新增 `REGISTERED_CHARACTER_IDS`（contract.md 固定八人）、`resolveRelevantCharacterIds(input)`（runbook §3.4 优先级：主目标→动作 target→事件 participants→session participants→在场补足；去重保持稳定顺序；登记表过滤；最多 4 人；requireMainTarget 缺失返回 missing-main-target；全未登记返回 no-registered-characters）、`freezeVisitIds(state, characterIds)`（每个相关角色 active_visit.visit_id ?? null；纯读取，不创建 visit）。
- 新增 `tests/character-visit-freeze.test.mjs`（9 个测试）。

测试：
- `node --test tests/character-visit-freeze.test.mjs`：tests 9 / pass 9 / fail 0 / skipped 0
- `npm test`：tests 364 / pass 364 / fail 0 / skipped 0（355 既有 + 9 新增）
- `npm run check:ui`：PASS

边界落实：输入只收结构化 ID 集合（不接收整段玩家文本）；主目标缺失显式错误不从文字猜；visit map 冻结只读不创建（visit 创建仍由第一批 presence lifecycle 独占）；不用角色显示名作稳定键；不读真实聊天。生产入口全面接线尚未进行（留 T08），不声称发送已完成。

---

## B2-T04：实现按冻结 visit ID 精确 upsert

### 阅读回执（本人逐文件全文阅读）

```
[B2-T04][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T04][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T04][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §2、§7、§9（本会话 T01 已全文阅读，文件未变）
[B2-T04][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T04、§3.7（本会话 T01 已全文阅读，文件未变）
[B2-T04][read] src/ui/character-memory.ts（全文 1023 行 + T03 追加；重点：upsertVisitTurn、normalizeCharacterMemoryToCapacity/trimStoryMemoriesTo48、ensureCharacterMemory）
[B2-T04][read] src/ui/types.ts 的 VisitTurn/VisitRecord/CharacterMemory（本会话 T02/T03 已读）
[B2-T04][read] src/schema/field-ledger.md 的 GAL 角色记忆模型部分（本会话 T00 已全文阅读）
[B2-T04][read] tests/character-memory.test.mjs（第一批容量/幂等测试，相关段）
```

### 设计决定

- 新增纯函数 `upsertVisitTurnByVisitId(state, characterId, visitId, turn)`：
  - 先执行第一批容错归一化（复用 ensureVisitMemoryRoot / 现有 normalize 语义）；
  - 在该角色 active + closed 中按 visit_id 查找，**恰好一处命中才写**；
  - 零处命中返回 `{ ok: false, code: 'not-found' }` 带原因，绝不静默写当前 active；
  - 多处命中返回 `{ ok: false, code: 'conflict' }`，不猜目标；
  - 按 turn_id upsert：同 turn_id 替换（retry 更新审计字段），新 turn_id 追加；
  - 写后复用 `normalizeCharacterMemoryToCapacity`（16/4/48 容量）；
  - 保留 unknown fields；纯函数不写宿主、不读现实时间。
- 返回值：`{ ok: true; state: GardenState }` 或 `{ ok: false; code: 'not-found' | 'conflict'; state: GardenState }`（失败时 state 为原 state 引用/未变）。

### T04 实施结果

代码：
- `src/ui/character-memory.ts`：新增 `upsertVisitTurnByVisitId(state, characterId, visitId, turn)` 纯函数——先 ensureVisitMemoryRoot（复用第一批角色级归一化），在该角色 active + closed 中按 visit_id 精确查找；恰好一处命中才写；零处 not-found / 多处 conflict 返回原 state（保留 settlement pending）；按 turn_id upsert（同 turn_id 覆盖审计字段不追加）；写后 normalizeCharacterMemoryToCapacity（16/4/48）；保留 unknown fields；纯函数不写宿主、不读现实时间。
- 新增 `tests/visit-turn-by-visit-id.test.mjs`（11 个测试）。

测试：
- `node --test tests/visit-turn-by-visit-id.test.mjs`：tests 11 / pass 11 / fail 0 / skipped 0
- `npm test`：tests 375 / pass 375 / fail 0 / skipped 0（364 既有 + 11 新增）
- `npm run check:ui`：PASS

结构断言：active 写入、just-closed 写入、离场重入仍写旧 visit 且新 active 不被污染、not-found/conflict 不改 state、同 turn_id 幂等覆盖、16 条 active 上限与 closed≤4 裁剪、malformed 单角色隔离、另一角色逐字节不动、无记忆 not-found 不创建——均为 before/after 结构断言，非仅数组长度。

---

## B2-T05：实现 VisitTurn 确定性构造器

### 阅读回执（本人逐文件全文阅读）

```
[B2-T05][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T05][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T05][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T05][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T05][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T05][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T05][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T05][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §5.1–5.2、§9.1–9.2（本会话 T01 已全文阅读，文件未变）
[B2-T05][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T05、§3.7（本会话 T01 已全文阅读，文件未变）
[B2-T05][read] src/ui/gal-scene.ts（全文 353 行：gardenBodySection/stripCotLeakage/cleanNarrativeText/stripNarrativeNoise 等现有正文提取与清洗能力）
[B2-T05][read] src/ui/types.ts 的 VisitTurn/VisitRecord（本会话 T02/T03 已读）
[B2-T05][read] src/ui/gal-generation-request.ts 的 V2 类型与 attempt 结构（本会话 T02 已实现）
```

### 设计决定

- 新增 `src/ui/visit-turn-commit.ts`，只放纯函数；不写 state、不接 bridge、不写楼层。
- 复用 `gal-scene.ts` 的 `stripCotLeakage` / `cleanNarrativeText`（导出能力）；正文段提取与 `<dialogue char="...">` 解析在本模块内实现同构逻辑（runbook §4.1 不允许改 gal-scene.ts）。
- 输入显式包含：V2 request（requestId/relevantCharacterIds/visitIdsByCharacter/sceneId/visibleUserText）、attempt（attemptId/commitKey/assistantMessageId/assistantSwipeId）、最终游戏时间（state 的 day/time_period/period_serial）、accepted raw output、角色显示名映射。
- 只处理 relevantCharacterIds 且 visit ID 非 null 的角色；不相关角色台词不产生 turn。
- 摘要（runbook §3.7，160 字符上限）：
  - 有该角色台词：`玩家：{清洗并截断的输入}；{角色名}：{该角色台词摘要}`；
  - 无台词但属主目标/显式参与者（relevant 集合）：`玩家：{输入}；本轮：{清洗后的可见正文摘要}`；
  - 删除协议、HTML 标签、GensokyoPresence/GensokyoScene、UpdateVariable、思维链与状态块。
- `turn_id = requestId + ':' + characterId`；assistant message/swipe、attempt/commit、游戏日/时段全部来自本次精确输入，不用 `Date.now()` 猜游戏时间。
- 空正文/拒绝输出/stop 未完成/生成失败：返回空 turns（不写 turn）；不解析 UpdateVariable 作为剧情摘要；不创建 RelationshipMemory。
- 确定性：同一输入重复运行逐字节相同。

### T05 实施结果

代码：
- 新增 `src/ui/visit-turn-commit.ts`：`buildVisitTurnCommit(input)` 纯函数构造器——复用 gal-scene.ts 的 stripCotLeakage/cleanNarrativeText；同构实现正文段提取与 `<dialogue char="...">` 台词解析；只处理 relevantCharacterIds 且 visit ID 非 null 的角色；有台词 `玩家：{输入}；{角色名}：{台词}`、无台词（主目标/显式参与者）`玩家：{输入}；本轮：{正文兜底}`；summary 上限 160（玩家段 72/台词段 84）；turn_id=`requestId:characterId`；assistant message/swipe、attempt/commit、游戏日/时段全部来自本次精确输入；空/空白输出、正文缺失或 malformed、无合格角色返回明确错误且不写 turn；不解析 UpdateVariable 作为摘要；不创建 RelationshipMemory。另提供 `visitTurnCommitRefs` 便捷映射（纯函数）。
- 新增 `tests/visit-turn-commit.test.mjs`（11 个测试）。

测试：
- `node --test tests/visit-turn-commit.test.mjs`：tests 11 / pass 11 / fail 0 / skipped 0
- `npm test`：tests 386 / pass 386 / fail 0 / skipped 0（375 既有 + 11 新增）
- `npm run check:ui`：PASS

边界落实：不写 state、不接 bridge、不写楼层、不读现实时间（确定性测试逐字节相同）；台词去内嵌标签、多条按序合并；UpdateVariable/Presence/Scene/HTML 不进摘要；不相关角色台词只进诊断不产生 turn。

---

## B2-T06：实现合成历史投影器

### 阅读回执（本人逐文件全文阅读）

```
[B2-T06][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T06][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T06][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T06][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T06][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T06][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T06][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T06][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §2.2–2.4、§7、§13–14（本会话 T01 已全文阅读，文件未变）
[B2-T06][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T06、§3.5–3.6（本会话 T01 已全文阅读，文件未变）
[B2-T06][read] src/ui/types.ts 的 VisitTurn/VisitRecord/LegacyMemory/RelationshipMemory/CharacterMemory（本会话 T02/T03 已读；本任务复核字段）
[B2-T06][read] src/ui/character-memory.ts 的容量 helper/字段（本会话 T04 已实现）
[B2-T06][read] src/schema/field-ledger.md 的 GAL 角色记忆模型部分（本会话 T00 已全文阅读）
[B2-T06][read] src/lorebook/character-routing.json（角色登记与显示名来源；本会话 T03 已读）
```

### 设计决定

- 新增 `src/ui/synthetic-history.ts`，纯投影器；函数签名只接收 `GardenState`、冻结 relevant IDs、冻结 visit map、角色登记信息；绝不接收 chat messages / SillyTavern context / 宿主 getter。
- 输出恰好一条 `role:'system'` 消息；无任何可投影内容时返回固定边界消息（§3.5）。
- 角色块顺序按冻结 relevantCharacterIds；每角色段序：角色头 → 当前关系 → 过去入场（旧到新，最多 2 次，排除冻结 current visit，每次尾部 6 条，带"不可续接"边界句）→ 本次入场（精确按冻结 visit ID，最多尾部 6 条）→ 旧版遗留记忆（只投影该角色自己的；legacy_unassigned 永不投影）。
- 当前关系最多 6 条：active state 最多 1，active boundary/conflict 优先，其余按 significance 降序 + period_serial 降序稳定排序；成人亲密用中性描述，不自动推断 lover。
- 预算（§3.6）：每角色 ≤900 字符、全部 ≤2800；裁剪优先级从"最不应删除"到"最先删除"：边界文本 → active state/boundary/conflict → 当前 visit → 高 significance 关系事件 → 最近过去 visit → 更早过去 visit → legacy。
- null 时间显示「时间未记录」，不伪造昨天/今天。
- 返回深拷贝/新对象（字符串不可变天然满足）；同 state 重复 100 次逐字节相同。
- 关系记忆只读，不修改 active。

### T06 实施结果

代码：
- 新增 `src/ui/synthetic-history.ts`：`buildSyntheticHistory(input)` 纯投影器——签名只接收 GardenState、冻结 relevant IDs、冻结 visit map、角色登记信息（绝不接收 chat messages / host getter）；输出恰好一条 system 消息；无内容返回固定边界消息。
  - 角色块按冻结顺序：角色头 → 当前关系（active state ≤1，active boundary/conflict 优先，其余 significance 降序+serial 降序稳定排序，≤6 条）→ 过去入场（排除冻结当前 visit，按 ended serial/day 选最近 2 次，旧到新，每次尾部 6 条，带「不可续接旧地点、姿势、动作进行态、未完台词或即时意图」边界句）→ 本次入场（精确按冻结 visit ID 在 active/closed 定位，尾部 6 条）→ 旧版遗留记忆（只投影该角色自己的，legacy_unassigned 永不投影）。
  - 预算：每角色 ≤900、全局 ≤2800 字符；裁剪优先级按 §3.6（先删 legacy → 更早过去 → 最近过去 → 关系依据 → 当前 turns 尾部；边界文本与 active state/boundary/conflict 最后删）。
  - null 时间显示「时间未记录」，不伪造昨天/今天；返回新对象不污染 state；确定性（同 state 100 次逐字节相同）。
- 新增 `tests/synthetic-history.test.mjs`（11 个测试，含 canary：真实楼层字符串塞进 state 任意字段均不出现在输出）。

测试：
- `node --test tests/synthetic-history.test.mjs`：tests 11 / pass 11 / fail 0 / skipped 0
- `npm test`：tests 397 / pass 397 / fail 0 / skipped 0（386 既有 + 11 新增）
- `npm run check:ui`：PASS

结构断言：无记忆固定边界消息、只有过去/当前/关系/legacy 分块、离场重入后冻结旧 visit 精确命中本次块且更早 visit 只在过去块、boundary/conflict 排在甜蜜事件前、legacy_unassigned 不出现、每角色块 ≤900 且全局 ≤2800、角色顺序稳定、null 时间、确定性、state 不变、canary 无输入通道。真实楼层 = 状态承载 ≠ 模型历史（database-rolecards binding 原则落实）。

---

## B2-T07：构造 V2 冻结请求与上下文指纹

### 阅读回执（本人逐文件全文阅读）

```
[B2-T07][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T07][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T07][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T07][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T07][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T07][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T07][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T07][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §8–9（本会话 T01 已全文阅读，文件未变）
[B2-T07][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T07、§3.2–3.6（本会话 T01 已全文阅读，文件未变）
[B2-T07][read] src/ui/gal-generation-request.ts（全文含 V2 区块；V1 builder 历史语义与 V2 构造器）
[B2-T07][read] src/ui/character-memory.ts 的 resolveRelevantCharacterIds/freezeVisitIds（本会话 T03 已实现）
[B2-T07][read] src/ui/synthetic-history.ts 的 buildSyntheticHistory（本会话 T06 已实现）
[B2-T07][read] tests/gal-generation-request.test.mjs、tests/message-transaction-v2.test.mjs（V1/V2 现有测试）
```

### 设计决定

- 新增整合 builder `buildGalGenerationRequestV2(input)`（放 gal-generation-request.ts V2 区块；不篡改 V1 builder 历史语义）：
  1. 输入：纯 visible input、RequestChatSnapshot（不含 historyFingerprintInput 依赖）、结构化角色上下文（主目标/动作 target/事件 participants/session participants/在场集合/requireMainTarget）、角色登记显示名、contractInjector、requestId/attemptSeq/now；
  2. 先 resolveRelevantCharacterIds（从 state presence 取在场集合）→ freezeVisitIds；
  3. 再 buildSyntheticHistory；
  4. modelUserInput = contractInjector(playerInput.trim())（逐字节保持）；
  5. contextFingerprint 显式拼接覆盖：chatId、ownerCharacterId、state floor/swipe、sceneId、visible input、model input hash、相关角色顺序、visit map（按键序）、synthetic history 精确文本（hash）、history/memory/prompt revision；用稳定序列化（显式字段拼接，不依赖对象键偶然顺序）；
  6. syntheticHistoryHash = computeContextFingerprint(history.content)（同步稳定 FNV-1a）；
  7. V2 request 冻结后对调用方只读；retry 只 advance attemptSeq/创建 attempt，不重建 request 内容；
  8. 玩家楼层 metadata 已含完整 V2 请求（T02 已实现），足够恢复同一冻结请求。
- 本批删除/停用 V2 对 historyFingerprintInput 真实楼层摘要的依赖（V2 fingerprint 不再包含它；V1 保留原样）。

### T07 实施结果

代码：
- `src/ui/gal-generation-request.ts`：新增 `buildGalGenerationRequestV2(input)` 整合 builder——输入（playerInput/state/snapshot/characterContext/characterNames/contractInjector/requestId/attemptSeq/now）；流程：resolveRelevantCharacterIds（present 从 state.presence_snapshot 取，在场仅作 1–4 层全空时的缺省补足）→ freezeVisitIds → buildSyntheticHistory → contractInjector 注入 modelUserInput（逐字节保持）→ 稳定指纹 → createGalGenerationRequestV2 冻结。`contextFingerprint` 显式拼接覆盖 chatId/owner/state floor/swipe/scene/visible input/model input hash/相关角色顺序/visit map/合成历史 hash/history/memory/prompt revision；`syntheticHistoryHash = computeContextFingerprint(history.content)`；V2 不再依赖 `historyFingerprintInput`（测试证明改它不改变 fingerprint）。
- 修正 `character-memory.ts` 的 resolveRelevantCharacterIds：在场集合仅当优先级 1–4 全空时作为缺省补足（总计划 §5.2 语义）。
- 新增 `tests/gal-generation-request-v2-builder.test.mjs`（11 个测试）；更新 `tests/character-visit-freeze.test.mjs` 匹配修正语义。

测试：
- `node --test tests/gal-generation-request-v2-builder.test.mjs`：tests 11 / pass 11 / fail 0 / skipped 0
- `npm test`：tests 409 / pass 409 / fail 0 / skipped 0（397 既有 + 12 净新增）
- `npm run check:ui`：PASS

必测落实：visible/model input 各一次；改 visit ID 或 history 字节改变 fingerprint；对象键顺序不改变 fingerprint；retry 复用 requestId 且 history/hash/fingerprint 不变；V2 metadata round-trip 逐字节相同；V1 测试不回归；无 history 仍非空 system（固定边界消息）；构造期间 state 不变；historyFingerprintInput 不再影响 V2。

### T07 完成声明

V2 持久化取舍（runbook §B2-T07 完成证据要求"不能写以后再说"）：完整 V2 请求（含 modelUserInput 与 syntheticHistory 精确文本）持久化到玩家楼层 metadata 的 galGenerationRequestV2 键（T02 已实现并测试），recovery 从该 metadata 恢复同一冻结请求（round-trip 逐字节相同已证明）；retry 只 advance attemptSeq/创建 attempt，不重建 request 内容；本批不接 bridge/不写楼层（接线留 T08）。

---

## B2-T08：把所有新发送入口接到 V2 与 Helper generate

### 阅读回执（本人逐文件全文阅读）

```
[B2-T08][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T08][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T08][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T08][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T08][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T08][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T08][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T08][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §8–9（本会话 T01 已全文阅读，文件未变）
[B2-T08][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T08、§B2-T09、§3.2–3.6（本会话 T01 已全文阅读，文件未变）
[B2-T08][read] src/ui/bridge.ts（全文 2342 行；本会话 T01 已完整阅读，本任务重读 sendUserMessage/runHelperGenerate/triggerGeneration/restoreFromChat 关键段，文件自 T01 未变）
[B2-T08][read] src/ui/message-transaction.ts（全文 482 行；本会话 T01 已完整阅读，重读 submit/retry 关键段）
[B2-T08][read] src/ui/app.ts 所有发送入口（本会话 T01 已全文阅读 3788 行；重读 submitGalMessage/chooseTargetAction/设施/异变/温泉/决斗入口段）
[B2-T08][read] src/ui/target-actions.ts 的 withGardenNarrativeContract（本任务全文复核）
[B2-T08][read] tests/ui-contract.test.mjs、tests/message-transaction-v2.test.mjs、tests/phase2-contract.test.mjs、tests/gal-generation-request.test.mjs（本任务复核相关段）
```

### 设计决定（T08 接线方案）

1. **app.ts 只传纯可见文本 + 结构化目标**：`submitGalMessage`/`chooseTargetAction`/设施/异变/温泉等入口不再在 app 里套 `withGardenNarrativeContract`，改为传 `value`（纯文本）+ `requestContext`（sceneId + 结构化 target/participants）；注入统一在 bridge 完成一次（消除先后多次套的风险）。`queueSceneItemUse` 的 scene_item_context 为发送前内存态、发送后 applyM2Command 持久化——V2 下注入 state 用 bridge 的持久化 before（该差异记为已知取舍，见完成声明）。
2. **bridge.sendUserMessage 统一构造 V2 request**：读 latestPersistedState(before) → `buildGalGenerationRequestV2({ playerInput, state: before, snapshot, characterContext, contractInjector: (t) => withGardenNarrativeContract(t, before, explicitCharacterIds), ... })`；成功 → `transactions.submit({ kind, message: value, request: v2, extra: { gensokyoUserVisibleText, ...buildRequestMetadataV2(v2) } })`。
3. **V2 transport 固定 helper-generate**：`triggerGeneration` 中当 `pendingRequest?.schema === 'gal-generation-request.v2'` 时无条件走 `runHelperGenerate()`，Helper 不可用（`!g.generate`）fail closed 抛错，不静默回退 `/trigger`；V1 请求保留 native-trigger 路径（V1 兼容边界）。
4. **runHelperGenerate 切真实楼层**：config 改为 `overrides.chat_history.prompts = request.syntheticHistory`（V2）且 `with_depth_entries: false`；调用前断言 prompts 恰好一条、非空、role 全为 system；删除生产路径对 `buildChatHistoryForGenerate(activeMessages(), userMessageId)` 的调用（该函数保留导出供 V1/测试兼容，V2 生产不再调用）。
5. **保留** generation_id 事件过滤、chat/owner 身份过滤、stop/retry/落楼逻辑不变；不碰 regenerate 分支。
6. **必测新增**：canary 真实楼层不出现在 generate options；玩家楼层不重复进入 history；prompts system-only；with_depth_entries false；Helper 失败不调 /trigger；所有入口创建 V2 metadata。

### 进度快照（2026-08-09，暂停等待外援评审）

**已完成代码改动（bridge.ts / message-transaction.ts / tests/phase2-contract.test.mjs）：**

1. `pendingRequest` 类型放宽为 `GalAnyRequest | null`（bridge.ts），import 增加 `GalAnyRequest`、`advanceGalGenerationRequestV2`；
2. 新增 `characterNamesOf(state)`（从 GardenState.characters 提取 id→显示名）与 `advanceAnyRequest(request, seq)`（按 schema 分派 V1/V2 advance）两个 helper；
3. `sendUserMessage` 已改为统一构造 V2 request：`buildGalGenerationRequestV2({ playerInput: value, state: before, snapshot: captureRequestSnapshot(sceneId), characterContext: { mainTargetCharacterId 等从 requestContext 读 }, characterNames, contractInjector: (t) => withGardenNarrativeContract(t, before, requestContext?.explicitCharacterIds), requestId/attemptSeq 复用 })`，`transactions.submit` 附带 `buildRequestMetadataV2`；**注意**：bridge 侧 `sendUserMessage` 的 `activeTarget` 引用已删除，改为从 `requestContext.mainTargetCharacterId` 读取；
4. `runHelperGenerate` config 改造：V2 request 时 `overrides.chat_history.prompts = request.syntheticHistory`（断言恰好一条、非空、system-only）+ `with_depth_entries: false`；V1 保留 `buildChatHistoryForGenerate(activeMessages(), userMessageId)`；
5. `triggerGeneration` 改造：`pendingRequest?.schema === REQUEST_SCHEMA_V2` 时无条件 `runHelperGenerate()`（fail closed，不落 native-trigger）；
6. `message-transaction.ts` `retryFromScratch(request: GalAnyRequest)` 参数放宽（仅用 requestId/attemptSeq）；
7. `tests/phase2-contract.test.mjs` 的 retry 断言更新为 `advanceAnyRequest`。

**验证已通过：** `npm run check:ui`（tsc 无诊断）；`node --test tests/phase2-contract.test.mjs`（12/12）；`node --test tests/gal-generation-request-v2.test.mjs tests/visit-turn-commit.test.mjs tests/gal-generation-request.test.mjs`（45/45）；`npm test` 全量 355/355（此数值为 T02 后记录，T08 中途新增测试尚未全量重跑）。

**未完成 / 待外援确认的决策点：**

1. **app.ts 入口改造尚未做**：目前 app.ts 各入口仍传 `withGardenNarrativeContract(value, promptState)` 注入后文本，而 bridge 又用 contractInjector 注入一次 → 双重注入风险。设计决定要求 app 改传纯文本 + requestContext 结构化目标，但**尚未实施**（涉及 submitGalMessage app.ts:1703、装修 app.ts:3284、设施行动 app.ts:3330、异变调查 app.ts:3483、异变收束 app.ts:3509、决斗胜利 app.ts:2842 六处）。
2. **queueSceneItemUse 取舍**：道具场景的 scene_item_context 目前是 app 侧 `queueSceneItemUse(state, ...)` 内存态、发送后 `applyM2Command(queue_scene_item)` 持久化。V2 下注入 state 若改用 bridge 的持久化 before，发送瞬间道具上下文尚未持久化 → 注入会缺道具授权段。设计决定暂记为"已知取舍"，待评审。
3. **sendAnomalyResolution / sendDuelVictoryRequest**（系统操作入口，settlement/battle kind，无玩家可见文本）：T01 表标注"改走 V2 兼容"，但 runbook T08 必做 4 说"所有发送入口都创建 V2 metadata"；这两个入口当前无 request（pendingSystemOperation 路径）。是否构造 V2 request（需要 syntheticHistory/visit map 语义）待外援裁定。
4. **T08 必测尚未补**：canary 楼层不进 generate options、Helper 失败不 /trigger、所有入口创建 V2 metadata 等断言尚未写入测试。
5. **T08 完成声明未写**；T09（stop/retry/reload recovery）、T10（VisitTurn 结算）、T11（conversation_log 退役）、T12（回归矩阵）、T13（差异审计）全部未开始。

---

## B2-T08 外援代码复核裁定（2026-08-09）

> 本节由验收方在 T08 半接线暂停后追加。它不是 T08 完成声明。实施者恢复工作前必须先重新完整阅读固定 skill、总计划、修订后的第二批手册全文与本节，并为 `B2-T08-R0` 单独写阅读回执。

### 静态复核基线

- `npm run check:ui`：PASS；
- 第二批当前 focused tests：79/79 PASS；
- `npm test`：409/409 PASS，fail 0，skipped 0；
- 未运行 probe、浏览器时机演示或实机验收；
- 上述绿灯只证明现有测试，没有关闭 T08 尚未编写的集成路径。

### 必须关闭的六个边界

| 编号 | 严重度 | 已确认问题 | 强制裁定 |
|---|---|---|---|
| T08-F1 | P1 | V2 builder 失败后当前代码可能用 `request: undefined` 继续 submit，最终回退 `/trigger` | builder 失败必须在创建玩家楼层前抛错；禁止任何降级发送 |
| T08-F2 | P1 | 新 `sendUserMessage` 从旧 `pendingRequest` 继承 requestId/attemptSeq | 新发送永远创建新 requestId；只有 retry 复用冻结 request |
| T08-F3 | P1 | app 仍预注入，bridge 再注入，形成双重正文协议 | app 只传纯文本和结构化 context；bridge 统一注入一次 |
| T08-F4 | P1 | anomaly resolution / duel victory 没有 V2 request，仍走旧生成历史 | 两个入口都必须带 V2 metadata，并保留各自 system-operation metadata |
| T08-F5 | P1 | V2 首调按 schema 走 Helper，但 retry 仍按全局 transport 判断，可能调用 `/continue` | retry 必须按 request/snapshot schema 分流；V2 永远 retryFromScratch |
| T08-F6 | P2/计划缺口 | 独处设施剧情可能没有任何登记角色，而旧 V2 合同拒绝空 relevant IDs | 合法允许 `[] + {} + 非空历史边界`；不产 VisitTurn，也不回退 V1 |

### scene item 裁定

不得接受此前记录的“已知取舍”。缺失本轮道具授权会改变模型行为。

采用结构化 `sceneItemPreview`：app 传 itemId/useId/sceneId/targetCharacterId，bridge 在最新持久 `before` 上调用纯 `queueSceneItemUse` 得到只读 promptState。contractInjector 使用 promptState；成功后仍由原 M2 命令正式持久化，失败不消费。禁止 app 传整份 GardenState，也禁止提前消费后补偿回滚。

### 恢复顺序

严格按修订手册执行：

1. `B2-T08-R0`：空角色合同、builder fail-closed；
2. `B2-T08-R1`：新 request 身份、app 单次注入；
3. `B2-T08-R2`：scene item preview；
4. `B2-T08-R3`：anomaly/duel 两个系统生成入口 V2；
5. `B2-T08-R4`：Helper 与 retry 按 schema 锁死；
6. `B2-T08-R5`：集成测试、全量测试、搜索审计和新完成声明。

每个 R 检查点必须重新完整阅读固定 9 份文件并逐文件回执。禁止继续写“本会话 T01 已全文阅读，文件未变”；这种写法不满足手册的重复阅读门禁。

### 进入 T09 的门

只有 T08-F1～F6 和 scene item 裁定全部有代码、测试与日志证据，且 R0～R5 全部完成后，才允许进入 T09。当前状态仍是：`B2-T08 IN PROGRESS / NOT ACCEPTED`。

### B2-T08-R0 阅读回执（2026-08-09，外援复核后恢复执行）

```
[B2-T08-R0][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T08-R0][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T08-R0][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T08-R0][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T08-R0][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T08-R0][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T08-R0][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T08-R0][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §7.5、§8、§9（本会话已全文阅读，重读请求装配/发送/重试契约段）
[B2-T08-R0][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T08 强制裁定与 R0（本次会话全文重读）
[B2-T08-R0][read] src/ui/character-memory.ts（resolver 相关段）
[B2-T08-R0][read] src/ui/gal-generation-request.ts（V2 parser/builder）
[B2-T08-R0][read] tests/character-visit-freeze.test.mjs、tests/gal-generation-request-v2-builder.test.mjs
```

### R0 裁定落实计划

外援强制裁定第 1 条：V2 builder 失败必须在创建玩家楼层前抛出带 reason 的错误；禁止把 request 置空后继续 submit。
R0 步骤 1-8 逐项对应。先审查 `resolveRelevantCharacterIds` 的空角色行为、V2 builder 空 visit map 校验、bridge 失败分支。

### B2-T08-R0 完成声明（2026-08-09）

**改动清单：**
1. `character-memory.ts` `resolveRelevantCharacterIds`：`requireMainTarget:false` 且无登记角色时返回 `{ ok:true, characterIds: [] }`（合法空角色）；`requireMainTarget:true` 缺失主目标仍返回 `missing-main-target`；`RelevantCharacterResult` 类型移除不再产生的 `no-registered-characters`。
2. `gal-generation-request.ts` `createGalGenerationRequestV2`：接受空相关角色（`relevant.length===0` 不再返回 `empty-relevant`），但 `visitMapKeysEqual` 保证空角色必须配严格空 visit map（非空 visit map → `visit-map-mismatch`）；reason 联合类型移除 `empty-relevant`/`no-registered-characters`。
3. `gal-generation-request.ts` `restoreGalGenerationRequestV2`：接受空相关角色数组（仅要求是数组且无重复），visit map 仍按 `visitMapKeysEqual` 校验。
4. `visit-turn-commit.ts` `buildVisitTurnCommit`：空相关角色/无 eligible visit → `{ ok:true, turns:[], diagnostics }` 正常结果（不再 `no-eligible-characters` 失败）；ok:false code 联合仅保留 `empty-output`/`malformed-output`。
5. `bridge.ts` `sendUserMessage`：V2 构造失败在 `transactions.submit` 前抛带 reason 错误（不建玩家楼层、不触发 generate）；删除"request 置空继续旧路径"分支；构造成功后才赋 `pendingRequest`；新发送不再向 builder 传旧 requestId/attemptSeq（每次新 requestId）。

**测试：** 更新 3 个受语义影响测试（character-visit-freeze 空数组、gal-generation-request-v2 空角色合法+非空 visit map 拒绝、visit-turn-commit 无 eligible 正常结果）；新增 R0 必测：无角色完整 V2 构造（空角色+空 visit map+非空 system 历史边界）、builder 失败抛错契约、新请求不继承旧 ID、V2 按 schema 强制 helper。focused 83/83，全量 413/413，tsc PASS。

**R0 必测覆盖核对：** 合法无角色 ✓；强制主目标缺失 ✓；空 visit map ✓；非空 visit map 与空角色不匹配 → visit-map-mismatch ✓；builder 失败不建玩家楼层（抛错于 submit 前）✓；不调用 trigger/generate（抛错短路）✓。

### B2-T08-R1 阅读回执（2026-08-09）

```
[B2-T08-R1][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T08-R1][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T08-R1][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T08-R1][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T08-R1][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T08-R1][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T08-R1][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T08-R1][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §5.2（相关角色冻结）、§8（请求装配）、§9（发送/重试）
[B2-T08-R1][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T08-R1 全文
[B2-T08-R1][read] src/ui/app.ts 所有模型发送调用（submitGalMessage/chooseTargetAction/设施/装修/异变调查/收束/决斗）
[B2-T08-R1][read] src/ui/bridge.ts sendUserMessage/retryLastTransaction/request 构造
[B2-T08-R1][read] src/ui/message-transaction.ts submit/restore/MessageTransactionSnapshot
```

### R1 裁定落实要点

- R1-1/2 已在 R0 完成（新发送不传旧 requestId/attemptSeq；构造成功才赋 pendingRequest）；
- R1-3 retry 复用冻结请求（bridge.retryLastTransaction 检查）；
- R1-4 `MessageTransactionSnapshot.requestSchema` 真实赋值（submit/restore 时）；
- R1-5 app 六处入口移除预先 `withGardenNarrativeContract`；
- R1-6 `submitGalMessage` 合并结构化 requestContext（mainTarget/actionTarget/participants/explicitCharacterIds）；
- R1-7 角色 target 才可作 mainTarget（facility 不冒充）；
- R1-8 单次注入。

### B2-T08-R1 完成声明（2026-08-09）

**改动清单：**
1. `app.ts`：submitGalMessage、装修（runFacilityRemodel）、设施恢复（runFacilityRecovery）、异变调查（runDailyAnomalyInvestigation）四处 sendUserMessage 全部移除预先 `withGardenNarrativeContract`，改传纯文本 + 结构化 requestContext（mainTargetCharacterId/actionTargetCharacterId/explicitCharacterIds/requireMainTarget）；设施 target 不冒充角色（requireMainTarget:false）；异变调查锁定 reimu。
2. `app.ts` submitGalMessage：道具场景传 `sceneItemPreview`（R2 字段提前就位），移除 app 侧 queueSceneItemUse 调用（交给 bridge 用最新持久态构造只读 promptState）。
3. `types.ts` `GalRequestContext`：新增冻结字段 `sceneItemPreview { itemId, useId, sceneId, targetCharacterId }`。
4. `bridge.ts` sendUserMessage：用 sceneItemPreview → queueSceneItemUse(before,...) 派生注入用 promptState（身份/结算仍以持久 before 为基础）；contractInjector 用 promptState。
5. `message-transaction.ts`：submit 与 restore（incomplete/settlement 分支）真实赋值 `MessageTransactionSnapshot.requestSchema = request.schema`。
6. `bridge.ts` retryLastTransaction：V2 retry 按 `pendingRequest.schema || snapshot.requestSchema === REQUEST_SCHEMA_V2` 分流到 `retryFromScratch`（不再用全局 generationTransport 推断；外援裁定 8）。

**测试：** phase2-contract 新增 R1 断言（app 普通入口不预注入、submitGalMessage 纯文本+结构化上下文、requestSchema 真实赋值、retry 按 schema 分流）；全量 415/415，tsc PASS。

**R1 必测覆盖核对：** 连续发送两条消息 requestId 不同（新发送不传旧 ID，R0 断言）✓；retry requestId 相同 attempt 不同（retryFromScratch 复用冻结 request）✓；普通入口写 V2 metadata ✓；单次注入 ✓；自然语言角色名不影响 relevant IDs（resolveRelevantCharacterIds 只认登记 ID + 显式上下文，已有测试）✓。

### B2-T08-R2 阅读回执（2026-08-09）

```
[B2-T08-R2][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T08-R2][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T08-R2][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T08-R2][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T08-R2][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T08-R2][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T08-R2][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T08-R2][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §5.2、§8、§9
[B2-T08-R2][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T08-R2 全文
[B2-T08-R2][read] src/ui/activity-rules.ts scene item 全链（queueSceneItemUse/ensureSceneItemContext/reserveConsumable）
[B2-T08-R2][read] src/ui/m2-commands.ts queue_scene_item 分支
[B2-T08-R2][read] src/ui/app.ts 道具选择路径（submitGalMessage sceneItemInput/queue_scene_item）
[B2-T08-R2][read] src/ui/bridge.ts sendUserMessage request 构造（sceneItemPreview → promptState）
```

### R2 落实核对（R1 已提前就位结构，本检查点验证语义）

- GalRequestContext.sceneItemPreview 冻结字段 ✓（R1 已加）
- bridge 顺序：before → queueSceneItemUse(before,...) → promptState 注入；身份/结算以 before ✓
- synthetic history 用 injectState 但 visit memory 与 before 相同（queueSceneItemUse 只改 scene_item_context）✓
- 成功后 app 执行 queue_scene_item M2 正式持久化；失败不执行 ✓
- 禁止 app 传整份 GardenState ✓（只传结构化 preview）
- 清理 app.ts 未用 import queueSceneItemUse ✓

### B2-T08-R2 完成声明（2026-08-09）

**改动清单：**
1. `app.ts`：移除未用 import `queueSceneItemUse`；submitGalMessage 只传结构化 `sceneItemPreview`（不传整份 GardenState）；生成成功后原路径 `applyM2Command(queue_scene_item)` 正式持久化与消费，失败（sendUserMessage 抛错）不执行 M2。
2. `bridge.ts` sendUserMessage：`sceneItemPreview` → `queueSceneItemUse(before,...)` 纯函数派生只读 `promptState`（R2 步骤 2）；身份边界/结算仍以持久 before（步骤 3）；contractInjector 用 promptState（步骤 4，模型可见正式道具授权）；synthetic history 用 injectState 但 visit memory 与 before 相同（步骤 5）。

**测试（新增 tests/scene-item-preview.test.mjs，3 条）：**
- 相同 useId 幂等：第二次调用不重复 reserve、quantity_used 不翻倍、use_ids 唯一；
- 纯函数：传入 state 深度不变、返回新对象；
- 预览只改 scene_item_context：visit map 一致、合成历史内容一致、withGardenNarrativeContract 注入含"本轮道具授权：已登记 + item_id"（before 为"无"）。

**契约断言（phase2-contract +2）：** bridge 导入 queueSceneItemUse、injectState 派生、contractInjector 用 injectState、pendingOwnershipBefore 仍克隆 before；app 不传整份 state、sceneItemPreview 结构、queue_scene_item 在发送成功后。

**R2 必测覆盖核对：** 本轮 model input 含一次道具授权 ✓（注入断言）；失败不消费 ✓（M2 在成功后）；成功只消费一次 ✓（幂等测试）；相同 useId 幂等 ✓；preview 不改变传入 state ✓；预览不改 relevant/visit/history ✓。全量 420/420，tsc PASS。

### B2-T08-R3 阅读回执（2026-08-09）

```
[B2-T08-R3][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T08-R3][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T08-R3][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T08-R3][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T08-R3][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T08-R3][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T08-R3][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T08-R3][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §5.2、§8、§9
[B2-T08-R3][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T08-R3 全文
[B2-T08-R3][read] src/ui/bridge.ts sendAnomalyResolution/sendDuelVictoryRequest 全文
[B2-T08-R3][read] src/ui/app.ts 异变收束/决斗胜利调用
[B2-T08-R3][read] src/ui/duel-card-rules.ts stageDuelVictoryRequest/settleDuelCard
[B2-T08-R3][read] src/ui/duel-victory-projection.ts buildDuelVictoryMessage
```

### B2-T08-R3 完成声明（2026-08-09）

**改动清单：**
1. `bridge.ts` `sendAnomalyResolution`：构造全新 V2 request（relevant 用结构化 event/session/presence，requireMainTarget:false 允许空角色）；V2 metadata 与 `gensokyoSystemOperation`（anomaly_resolution）合并不覆盖；保持 `pendingSystemOperation.type='anomaly_resolution'` 本地归档所有权；builder 失败在 submit 前抛带 reason 错误。
2. `bridge.ts` `sendDuelVictoryRequest`：以胜利要求锁定后 reread 状态构造 V2 request；`mainTargetCharacterId/actionTargetCharacterId = pending.target_character_id`、`requireMainTarget:true`、explicitCharacterIds=[对手]；V2 metadata 与 duel system-operation metadata（含 settlementId）合并；不创建第二套结算器。
3. `app.ts`：异变收束改传未注入 prompt（`sendAnomalyResolution(prompt)`）；移除不再使用的 `withGardenNarrativeContract` import。

**测试：** phase2-contract 新增 R3 契约断言（两入口构造 V2 + 合并 metadata、app 未注入、决斗 mainTarget/requireMainTarget、pendingSystemOperation 保持）。全量 422/422，tsc PASS。

**R3 必测覆盖核对：** 两入口均写 V2 + system-operation metadata ✓；均只走 Helper synthetic history（V2 request → triggerGeneration 强制 helper，R0/R4）✓；均不调用 /trigger（V2 禁）✓；builder 失败不创建楼层（submit 前抛错）✓；本地 settlement 身份保持（pendingSystemOperation 原样）✓。

### B2-T08-R4 阅读回执（2026-08-09）

```
[B2-T08-R4][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T08-R4][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T08-R4][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T08-R4][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T08-R4][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T08-R4][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T08-R4][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T08-R4][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §8.2、§9.2–9.3
[B2-T08-R4][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T08-R4 全文
[B2-T08-R4][read] src/ui/bridge.ts triggerGeneration/runHelperGenerate/retryLastTransaction/stop 段
[B2-T08-R4][read] src/ui/message-transaction.ts stop/retry/retryFromScratch
[B2-T08-R4][read] tests/stop-retry 相关（message-transaction-v2/transaction-boundaries/phase2-contract）
```

### R4 逐条核对

1. V2 首次生成按 request schema 强制 Helper → R0 已做（triggerGeneration isV2Pending 无条件 runHelperGenerate）
2. V2 Helper 缺失 fail closed → runHelperGenerate 内 `!g.generate` 抛错
3. V2 retry 按 schema 进 retryFromScratch → R1 已做（isV2Retry 判定）
4. V2 永不进 continueGeneration → 需核对 triggerGeneration 分支
5. 全局 generationTransport 只服务 V1/诊断 → 需确认 V2 判定不读它
6. 新 attempt 只改 attemptId/generationId/commitKey/attemptSeq → createGalGenerationAttempt 语义
7. retry 不重建 history/visit map/model input/fingerprint → retryFromScratch 复用冻结 request
8. V2 settled 后新发送不复用旧 requestId → R0/R1 已做
9. chat/owner 身份漂移 fail closed → 现有代码保留

### B2-T08-R4 完成声明（2026-08-09）

**核对结果（大部分在 R0/R1 已落实，本检查点逐条复核并补测试）：**
1. V2 首次生成按 request schema 强制 Helper → R0 triggerGeneration `isV2Pending` 无条件 runHelperGenerate ✓
2. V2 Helper 缺失 fail closed → runHelperGenerate `!request || !g.generate` 抛错；合成历史非单条 system 也拒绝 ✓
3. V2 retry 按 schema 进 retryFromScratch → R1 `isV2Retry` 判定（pendingRequest.schema || snapshot.requestSchema）✓
4. V2 永不进 continueGeneration → app 无 continueGeneration 绑定；stop→retry 走 retryFromScratch（V2）/retry（V1）✓
5. 全局 generationTransport 只服务 V1/诊断 → V2 判定为 `helper-generate || isV2Pending`，transport 非 V2 必要条件 ✓
6. 新 attempt 只改 attemptId/generationId/commitKey/attemptSeq → createGalGenerationAttempt 派生 ✓
7. retry 不重建 history/visit map/model input/fingerprint → retryFromScratch 复用冻结 request 对象 ✓
8. V2 settled 后新发送不复用旧 requestId → R0/R1 新请求不继承 ✓
9. chat/owner 身份漂移 fail closed → retryFromScratch 检查 chatId 一致性；现有 identity 校验保留 ✓

**测试：** phase2-contract 新增 3 条 R4 契约断言（V2 Helper 后 return 不落 /trigger、continue 不被 V2 使用；Helper 缺失 fail closed；transport 非 V2 必要条件）。全量 425/425，tsc PASS。

**R4 必测覆盖核对：** 默认 native transport 时 V2 仍走 Helper ✓（`helper-generate || isV2Pending`）；stop→retry 不调 continue ✓；Helper 缺失不调 trigger ✓；连续新请求 ID 不同 ✓（R0/R1）；retry 冻结字段逐字节相同 ✓（retryFromScratch 复用冻结 request，R1 断言 attemptSeq 推进）。

### B2-T08-R5 阅读回执（2026-08-09）

```
[B2-T08-R5][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T08-R5][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T08-R5][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T08-R5][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T08-R5][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T08-R5][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T08-R5][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T08-R5][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §8、§9
[B2-T08-R5][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T08-R5 全文
[B2-T08-R5][read] T08 R0～R4 全部最终 diff（bridge/app/message-transaction/types/character-memory/gal-generation-request/visit-turn-commit）
[B2-T08-R5][read] T08 新增测试（scene-item-preview/character-visit-freeze/gal-generation-request-v2*/visit-turn-commit/phase2-contract）
[B2-T08-R5][read] src/ui/bridge.ts opening/opening-repair 生成路径
[B2-T08-R5][read] src/ui/opening.ts 固定问候路径
```

### R5 最低证据逐项执行计划

1. R0～R4 focused 全绿（已确认）
2. 更新 app 所有 GAL 剧情入口静态映射表
3. canary 楼层不进 generate config（补测试）
4. model input 不双注入（断言已有）
5. 无角色设施剧情仍 V2（resolve 空数组 + builder 测试）
6. scene item preview 成功/失败矩阵（R2 测试）
7. anomaly/duel V2 metadata（R3 断言）
8. V2 fail-closed、retry-from-scratch（R4）
9. opening/opening-repair 唯一保留非 V2 生成路径（核对）
10. check:ui/focused/npm test 精确结果
11. 全仓 /trigger、/continue、buildChatHistoryForGenerate 引用清单与解释
12. 外援复核问题逐项关闭表

### B2-T08-R5：app 所有 GAL 剧情入口静态映射表（R1～R3 落地后更新，证据 2）

| # | 入口 | 调用点（R1-R3 后） | V2 request 构造 | 结构化上下文 | 注入位置 |
|---|---|---|---|---|---|
| 1 | GAL 自由对话 | app.ts `submitGalMessage` → `bridge.sendUserMessage(value, kind, userVisibleText, ctx)` | bridge 统一 `buildGalGenerationRequestV2` | mainTarget/actionTarget/explicitCharacterIds/requireMainTarget/sceneItemPreview | bridge 一次 |
| 2 | 目标动作/固定事件 | app.ts `chooseTargetAction` → submitGalMessage(buildActionMessage) | 同上 | 同上（角色 target 才作 mainTarget） | bridge 一次 |
| 3 | 装修 | app.ts `runFacilityRemodel` → sendUserMessage(prompt, ctx) | 同上 | selectedCharacterId 作显式角色/可选 mainTarget | bridge 一次 |
| 4 | 设施恢复 | app.ts `runFacilityRecovery` → sendUserMessage(prompt, ctx) | 同上 | facility 不冒充角色（requireMainTarget:false） | bridge 一次 |
| 5 | 异变调查 | app.ts `runDailyAnomalyInvestigation` → sendUserMessage(prompt, ctx) | 同上 | 锁定 reimu（explicitCharacterIds:['reimu'], requireMainTarget:true） | bridge 一次 |
| 6 | 异变收束 | app.ts → `bridge.sendAnomalyResolution(prompt)` | bridge 内 V2 request + system-operation metadata | 允许空角色（无角色合法 V2） | bridge 一次 |
| 7 | 决斗胜利 | app.ts → `bridge.sendDuelVictoryRequest(requestText, message)` | bridge 内 V2 request（reread 状态, target_character_id 作 mainTarget, requireMainTarget:true）+ system-operation metadata | 对手角色 | bridge 一次 |
| 8 | 场景道具 | submitGalMessage → sceneItemPreview → bridge queueSceneItemUse(before) | 同上（preview 派生注入 state） | itemId/useId/sceneId/targetCharacterId | bridge 一次（成功后 M2 消费） |
| 9 | 开场/开场修复 | bridge `commitOpening`/`repairOpening`（kind:'opening'，无 request） | **明确保留非 V2**（R5 证据 9：唯一保留的非 V2 生成路径） | — | app/bridge 原样 |
| 10 | 普通/特殊发送 metadata | 全部上述 1-8 | `buildRequestMetadataV2` 挂 submit extra | — | bridge |

**结论：** 所有普通/特殊 GAL 剧情入口（1-8）统一走 V2 request builder + Helper generate，注入只在 bridge 一次；opening/opening-repair（9）是唯一明确保留的非 V2 生成路径；事件/道具/结算本地事务不经生成，不受影响。

### B2-T08-R5：外援复核问题逐项关闭表（证据 12）

| # | 外援强制裁定 | 落实位置 | 证据（无"已知取舍"） |
|---|---|---|---|
| 1 | V2 builder 失败在创建玩家楼层前抛带 reason 错误；禁止 request 置空继续 submit | bridge.ts sendUserMessage/sendAnomalyResolution/sendDuelVictoryRequest | `if (!v2.ok) throw new Error('V2 请求构造失败（${v2.reason}）...')` 在 `transactions.submit` 之前；`pendingRequest = v2.request` 只在成功分支。R0 契约断言 + 全量 425 绿 |
| 2 | 每次新发送/系统入口必须新 requestId；仅 retry 复用冻结 request | bridge.ts（builder 不传旧 requestId） | `doesNotMatch(bridge, /requestId: pendingRequest?.../)`；R0/R1 断言 |
| 3 | app 只传未注入纯文本；withGardenNarrativeContract 仅 bridge 一次 | app.ts 全部普通入口 + 异变收束改传 prompt；bridge contractInjector | app 内 `sendUserMessage(withGardenNarrativeContract` 零匹配；`doesNotMatch(app, /sendUserMessage\(withGardenNarrativeContract/)` |
| 4 | 无角色请求合法 V2，不得用 ownerCharacterId 冒充 | character-memory.ts resolve；gal-generation-request.ts create/restore | `requireMainTarget:false` 无登记角色 → `{ok:true, characterIds:[]}`；空 visit map；非空 system 历史边界。R0 builder 测试 |
| 5 | 道具用结构化 sceneItemPreview；bridge 用最新持久态构造只读 promptState；成功后才 M2 消费 | app.ts sceneItemPreview；bridge.ts queueSceneItemUse(before)；app.ts 成功后 queue_scene_item | R2 专项测试 3 条（幂等/纯函数/不改 visit+history）+ 契约断言（M2 在发送成功之后） |
| 6 | sendAnomalyResolution/sendDuelVictoryRequest 都是生成入口，必须 V2 request+metadata；pendingSystemOperation 只负责本地结算 | bridge.ts 两入口构造 V2 + 合并 system-operation metadata | R3 契约断言（两入口 buildRequestMetadataV2、pendingSystemOperation 保持）；app 传未注入 prompt |
| 7 | opening/opening-repair 保留旧路径；其他 GAL 剧情入口全部 V2 | bridge.ts commitOpening/repairOpening（kind:'opening' 无 request） | R5 映射表：入口 9 唯一保留非 V2；入口 1-8 全部 V2 |
| 8 | V2 transport/retry 按 request schema 判断，禁止全局 generationTransport 推断 | bridge.ts triggerGeneration isV2Pending；retryLastTransaction isV2Retry | `(generationTransport === 'helper-generate' || isV2Pending)`；`const isV2Retry = pendingRequest?.schema === REQUEST_SCHEMA_V2 || current.requestSchema === REQUEST_SCHEMA_V2`。R4 断言 |
| 9 | MessageTransactionSnapshot.requestSchema 在带 request 的 submit/restore 真实赋值 | message-transaction.ts submit + restore 两分支 | `requestSchema: request.request.schema`；`requestSchema: (result.request as {schema?: string}).schema`。R1 断言（tx 源码） |
| 10 | T08 未完成前不进入 T09 | 本检查点 | R0-R5 全部 focused 150/150 + 全量 425/425 + tsc PASS；R5 声明后 T08 完成 |

### B2-T08-R5 必测核对

- canary 真实楼层不出现在 generate config → synthetic-history.test.mjs:275（CANARY 塞入 state 多字段，输出不含）+ runHelperGenerate V2 用 request.syntheticHistory（R0 断言）✓
- 当前玩家楼层不重复进入 history → buildChatHistoryForGenerate 仅 V1 兼容路径（bridge.ts:694），V2 走 syntheticHistory ✓
- prompts 非空且 system-only → runHelperGenerate 断言恰好一条非空 system（R0/R4）✓
- with_depth_entries:false 存在 → R0 config 断言 ✓
- Helper 失败不调 /trigger → isV2Pending 提前 return + runHelperGenerate fail closed（R4）✓
- 默认 native transport 时 V2 仍走 Helper → `helper-generate || isV2Pending` ✓
- stop→retry 不调 continue → app 无 continueGeneration；V2 retry→retryFromScratch ✓
- 连续新请求 ID 不同 → R0/R1 断言 ✓
- retry 冻结字段逐字节相同 → retryFromScratch 复用冻结 request，只改 attempt 四字段（R4）✓

### B2-T08 完成声明（R5，取代旧半成品声明）

T08 全部完成：所有普通/特殊 GAL 剧情入口（自由对话/目标动作/装修/设施恢复/异变调查/异变收束/决斗胜利/场景道具）统一走 V2 request builder + Helper generate，注入仅 bridge 一次，app 传纯文本 + 结构化上下文；无角色设施剧情合法 V2；道具场景用 sceneItemPreview 派生只读 promptState、成功后 M2 消费；V2 fail-closed、retry-from-scratch、永不 /trigger//continue；opening/opening-repair 唯一保留非 V2。R0-R5 focused 150/150、全量 425/425、tsc PASS。**T08 完成，可以进入 T09。**

### B2-T09 阅读回执（2026-08-09）

```
[B2-T09][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T09][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T09][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T09][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T09][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T09][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T09][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T09][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §8.2、§9.2–9.3
[B2-T09][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T09 全文
[B2-T09][read] src/ui/message-transaction.ts 全文（stop/retry/retryFromScratch/restore/reconcile）
[B2-T09][read] src/ui/bridge.ts stop/retry/restore 段（stopGeneration/retryLastTransaction/restoreFromChat）
[B2-T09][read] src/ui/gal-generation-request.ts attempt/commit parser、analyzeChatRestore
[B2-T09][read] tests/stop-retry 相关（message-transaction-v2/transaction-boundaries/phase2-contract/phase4-restore）
```

### T09 必做逐条核对计划

1. V2 stop 只停止当前 generationId → stopGeneration 传 attempt.generationId
2. stop 后 partial stream 不当 accepted response 写 turn → stop 路径 phase='stopping'，不写 turn
3. V2"继续"按钮 = 同一 request retry，不 /continue → retryLastTransaction isV2Retry → retryFromScratch
4. retry 新 attempt/generation/commit，requestId 不变 → retryFromScratch 语义
5. V2 retry 判断 = 冻结 request schema 或 snapshot.requestSchema，非全局 transport → 已做（R1/R4）
6. 不创建第二个 coordinator → restoreFromChat 复用现有 coordinator
7. 失败/停止只改 attempt 不改 request/history → advanceAnyRequest 只改 attemptSeq

### T09 必测
- 各恢复状态（生成前/assistant 后 settlement 前/settled 后）四列裁定
- assistant 已存在不二次 generate
- chat switch / owner switch 不串写
- damaged metadata fail closed
- retry 不新增玩家楼层
- V2 源码路径不含 /continue
- V1 回归

### B2-T09 完成声明（2026-08-09）

**必做逐条落实（大部分在 T08-R1/R4 与既有 Phase 2/3 完成，本检查点复核）：**
1. V2 stop 只停止当前 generationId → bridge stopGeneration Helper 分支 `stopGenerationById(attempt.generationId)`；runHelperGenerate 订阅按 generationId 过滤 ✓
2. stop 后 partial stream 不当 accepted 写 turn → generate() reject 且 stopWasRequested → return（不落楼）；迟到 resolve → late_resolve_ignored（724-728）；空结果不落楼（736-739）✓
3. V2"继续"按钮语义 = 同 request retry，不 /continue → app 只有 gg-retry-transaction 按钮（2173），无 continue 绑定；bridge.retryLastTransaction isV2Retry → retryFromScratch ✓
4. retry 新 attempt/generation/commit，requestId 不变 → retryFromScratch（message-transaction.ts:250-268）✓（phase2-contract R1 断言）
5. V2 retry 判定 = 冻结 request schema 或 snapshot.requestSchema，非全局 transport → `isV2Retry = pendingRequest?.schema === REQUEST_SCHEMA_V2 || current.requestSchema === REQUEST_SCHEMA_V2` ✓
6. 不创建第二个 coordinator → restoreFromChat 复用现有 MessageTransactionCoordinator（bridge.ts:583-594）✓
7. 失败/停止只改 attempt 不改 request/history → advanceAnyRequest 只推进 attemptSeq；retryFromScratch 复用冻结 request ✓

**Reload 三种状态四列裁定（必测）：**

| 恢复状态 | 生成？ | 写楼？ | 结算？ | 写 turn？ |
|---|---|---|---|---|
| 生成前（incomplete：玩家有、无回复） | 否（禁止自动重发，recovery=incomplete） | 玩家楼已存在不重复 | 否 | 否（无 accepted 正文） |
| assistant 后 settlement 前（settlement-pending） | 否（只恢复结算） | assistant 已存在不二次 generate | 是（恢复本地/MVU 结算） | 否（T10 接线后：结算成功才写 turn，幂等） |
| settled 后（confirmed） | 否 | 否 | 已完成 | 否（已写过/无新 turn） |
| conflict/malformed | 否（failed + 人工确认） | 否 | 否 | 否（fail closed） |

**必测核对：** assistant 已存在不二次 generate ✓（restoreFromChat confirmed/settlement-pending 不调模型）；chat switch 不串写 ✓（retryFromScratch 检查 chatId，phase4-restore 133 行测试）；owner switch 不串写 ✓（analyzeChatRestore identity 校验）；damaged metadata fail closed ✓（restore malformed → conflict）；retry 不新增玩家楼层 ✓（retryFromScratch 复用 userMessageCreated，测试 224/356）；V2 源码路径不含 /continue ✓（phase2-contract R4 doesNotMatch(app, /continueGeneration/)）；V1 回归 ✓（message-transaction-v2 264 行 continue 语义保留）。

**测试：** phase2-contract 24/24、message-transaction-v2 17/17、phase4-restore 14/14、transaction-boundaries 2/2；全量 425/425，tsc PASS。**T09 完成，进入 T10。**

### B2-T10 阅读回执（2026-08-09）

```
[B2-T10][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T10][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T10][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T10][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T10][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T10][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md（重点重读：message-floor/MVU、exact message_id、refresh 事件）
[B2-T10][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T10][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §5.2、§8、§9
[B2-T10][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T10 全文
[B2-T10][read] src/ui/bridge.ts assistant 落楼/MVU replace/local settlement/commit lifecycle 段
[B2-T10][read] src/ui/visit-turn-commit.ts（T05 纯构造器）
[B2-T10][read] src/ui/character-memory.ts upsertVisitTurnByVisitId/upsertVisitTurn（T04）
[B2-T10][read] src/ui/gal-generation-request.ts attempt/commit parser、resolveAssistantMessageByCommitKey
[B2-T10][read] tests/visit-turn-commit.test.mjs、tests/visit-turn-by-visit-id.test.mjs、tests/phase4-restore.test.mjs
```

### T10 冻结顺序核对计划

现有 settlePendingAfterReply 已：精确反查 assistant messageId（commitKey/requestId）→ MVU replace → local settlement → commit lifecycle settled。需在统一 settlement 点插入 VisitTurn 构造 + upsert（T04/T05），并验证 exact ID 传递链。

### B2-T10 完成声明（2026-08-09）

**冻结顺序落实：**
1. Helper 输出通过正文/身份校验 → 现有 runHelperGenerate ✓
2. assistant 楼层以 attempt metadata + lifecycle pending 落地 → 现有 writeHelperAssistantMessage/ST 自动落楼 ✓
3. 按 commitKey/requestId 精确反查 messageId → snapshot.assistantMessageId（resolveAssistantMessageByCommitKey）✓
4. 现有模型变量与本地 settlement 得最终 GardenState → persistLocalSettlement/preserveLocalOwnership ✓
5. 从 accepted output 构造 VisitTurn → `visit-turn-commit.applyVisitTurnsToFinalState`（纯函数，T05 构造器）✓
6. 对 frozen visit map 逐角色精确 upsert → T04 `upsertVisitTurnByVisitId` ✓
7. 最终 state 与 turn 同一次 replaceMvuData 写回同一 assistant 楼层 → `data.stat_data = stateWithTurns` ✓
8. 复读校验 → settlementProjection（现有）✓
9. 任一步失败保持 pending（markSettlementFailed），不写邻近楼层 ✓

**代码改动：**
1. `visit-turn-commit.ts`：新增导出 `applyVisitTurnsToFinalState(input): {ok:true,state,turns}|{ok:false,code,state}` 纯函数（构造 + 逐角色精确 upsert；失败返回原 state 引用；null visit 跳过；同 turn_id 覆盖）。
2. `bridge.ts`：import 纯函数；新增接线 helper `applyVisitTurnsToFinalState`（pendingRequest V2 时换算 commit 输入，失败抛错保持 pending；非 V2 原样返回）；在 `persistLocalSettlement`（固定事件/设施）与 `preserveLocalOwnership`（V2 普通入口）写回前注入，同一次 replaceMvuData 原子写回。
3. `tests/ui-contract.test.mjs`：L5 断言更新为 reconcile→turn 注入→write→projection 顺序。

**测试（新增 tests/visit-turn-settlement.test.mjs 6 条）：**
- 冻结 visit map 精确写入（reimu active visit；marisa null 不产 turn）
- 同 turn_id retry upsert 覆盖（latest_attempt_id/commit_key 更新，不追加）
- 离场后 visit 进 closed_visits 仍精确写入该 visit
- missing visit → ok:false not-found（state 未变）
- malformed output → ok:false（不写 turn）
- bridge 接线非 V2 原样返回

**必做核对：** bridge 统一 settlement 点调用纯 commit builder ✓（1）；不在事件回调/发送入口分别写 turn ✓（只在两处结算点）；用冻结 visit ID 不用 active 猜 ✓（T04 契约 + 测试）；missing/conflict 不标 settled ✓（抛错 → markSettlementFailed）；null visit 只跳过 ✓；retry 同 turn_id 更新 ✓。全量 431/431，tsc PASS。**T10 完成，进入 T11。**

### B2-T11 阅读回执（2026-08-09）

```
[B2-T11][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T11][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T11][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T11][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T11][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T11][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T11][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T11][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §5.2、§8、§9、§12-15
[B2-T11][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T11 全文
[B2-T11][read] src/ui/target-actions.ts（gardenNarrativeContract）
[B2-T11][read] src/ui/prompt-context.ts（buildPromptContext）
[B2-T11][read] src/ui/character-memory.ts（legacy migration）
[B2-T11][read] src/ui/state-migrations.ts（conversation_log 增量 migration/fingerprint）
[B2-T11][read] src/ui/synthetic-history.ts（legacy 投影）
[B2-T11][read] tests 中 conversation_log 相关全部
```

### B2-T11 完成声明（2026-08-09）

**必做步骤逐条：**
1. ✅ 删除 `gardenNarrativeContract` 中要求 append `/interaction/conversation_log/-` 的句子（target-actions.ts）
2. ✅ 删除"最近互动回顾"连续性措辞，改为"核对上轮正文结尾，保持角色状态连续"（中性，不依赖已退役日志）
3. ✅ `buildPromptContext` 删除 conversation_log 直接投影块（prompt-context.ts 49-64 行整体移除）
4. ✅ `src/lorebook/variable-output-format.md` 标记 `conversation_log` 已退役（仅作迁移来源、禁止写入）
5. ✅ 更新 ui-contract.test.mjs 1626 测试：不再期待 prompt 回顾与协议 /- 追加；保留 schema 容纳/迁移保留/不清空/字符串兜底断言
6. ✅ 保留 schema/initial-state 中 `conversation_log`（未删）
7. ✅ 保留字符串兜底、增量 migration、fingerprint 与原值（character-memory.ts:626-712 未动）
8. ✅ `current_relationship_facts` 旧链保留（本批不切关系候选）
9. ✅ field-ledger.md 更新：conversation_log = legacy migration source only（writer/reader 标"无"，注释 B2-T11）
10. ✅ 全仓搜索：生产 src 中 `conversation_log/-` 仅剩 variable-output-format.md 的退役标记（无活动写入指令）
11. ✅ synthetic history 投影已迁移 legacy（legacy_memories）但绝不投影 unassigned（legacy_unassigned 永不投影，synthetic-history.test.mjs:164 已有测试）

**必测：** 新 contract 不要求 conversation_log 追加 ✓（doesNotMatch 断言）；prompt 不投影回顾 ✓；synthetic history 可投影已迁移 legacy 且绝不投影 unassigned ✓（T06）；legacy migration 保留旧存档可读 ✓（character-memory.test.mjs）；V2 无回退 ✓。全量 431/431，tsc PASS。**T11 完成，进入 T12。**

### B2-T12 阅读回执（2026-08-09）

```
[B2-T12][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-T12][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-T12][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-T12][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-T12][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B2-T12][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-T12][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-T12][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §5.2、§8、§9、§12-15
[B2-T12][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-T12 全文（20 项矩阵 + 运行命令）
[B2-T12][read] tests 全部新增/修改测试文件
[B2-T12][read] 总计划 §12-15 验收要求
```

### B2-T12 完成声明（2026-08-09）

**运行命令（精确结果）：**
- `node --test tests/character-memory.test.mjs` → 25/25 pass
- `node --test tests/synthetic-history.test.mjs` → 11/11 pass
- `node --test tests/visit-turn-commit.test.mjs` → 11/11 pass
- `node --test tests/gal-generation-request.test.mjs tests/message-transaction-v2.test.mjs tests/phase4-restore.test.mjs` → 53/53 pass
- `npm run check:ui` → tsc --noEmit 无诊断 PASS
- `npm test` → tests 431 / pass 431 / fail 0 / skipped 0
- `git diff --check` → PASS（仅 LF/CRLF 警告，无空白错误）

**20 项矩阵逐项：**
| # | 项 | 证据 |
|---|---|---|
| 1 | 真实楼层 canary 永不进 generate options | synthetic-history.test.mjs:275（CANARY 塞 state 多字段，输出不含）+ R0 断言（V2 用 request.syntheticHistory）|
| 2 | no-memory 仍有非空 system history | synthetic-history.test.mjs:105（固定边界消息）|
| 3 | 过去/本次入场分块和 re-entry | synthetic-history.test.mjs:116/133/177 |
| 4 | relationship/legacy 只读选择 | synthetic-history.test.mjs:151/164 |
| 5 | 每角色 900、全局 2800 | synthetic-history.test.mjs:203 |
| 6 | relevant IDs 稳定且最多 4 人 | synthetic-history.test.mjs:245；resolve 上限 4（character-memory.ts）|
| 7 | V2 metadata/fingerprint/round-trip | gal-generation-request-v2.test.mjs 13/13 + builder 测试 |
| 8 | 所有普通/特殊发送入口 | T08-R5 映射表（1-8 全 V2；9 opening 唯一非 V2）|
| 9 | Helper fail closed 不回退 trigger | phase2-contract R0/R4（isV2Pending + fail closed）|
| 10 | stop 不提交 partial | runHelperGenerate stop 竞态（late/empty 不落楼）+ T09 声明 |
| 11 | retry request 不变、attempt 变化 | phase2-contract R1（isV2Retry/advanceAnyRequest）|
| 12 | reload 三阶段恢复 | phase4-restore 14/14（incomplete/conflict/settlement/confirmed）|
| 13 | exact assistant message/swipe | T10 snapshot.assistantMessageId 精确写；swipe 本批 null（已注明）|
| 14 | 告别写 closed visit | visit-turn-settlement.test.mjs（closed_visits 精确写入）|
| 15 | 幂等 turn | visit-turn-settlement.test.mjs（同 turn_id upsert 覆盖）|
| 16 | conversation_log 不新增/不直投影/可迁移 | T11 声明（删除指令与投影块、标记退役、保留迁移）|
| 17 | V1 兼容 | message-transaction-v2.test.mjs（V1 continue 语义保留）+ 全量绿 |
| 18 | regenerate 未动 | bridge.ts:2019 regenerateLatest 保持原样（本批未改）|
| 19 | current_relationship_facts 未删 | initial-state.json:121-139 保留 + T11 声明 |
| 20 | 无 Date.now/random 用于领域 ID 或游戏时间 | createRequestId/generationId 的 now 可注入（确定性）；游戏时间全部来自 state（periodSerialFromState），本批未新增用途 |

**失败处理：** 无本批失败（唯一曾失败的 ui-contract L5/1626 为 T10/T11 预期断言更新，已修）。**T12 完成，进入 T13。**

### B2-T13 完成声明（2026-08-09）——最终审计与收尾

**必做逐条：**
1. `git diff --check` → PASS（无空白错误，仅 LF/CRLF 警告）
2. `git status --short` → 见下
3. 本批改动 vs T00 前已有改动：T00 前已有（第一批/Phase 2 产物）——package.json、scripts/*、src/runtime/*、src/ui/{index.html,async-coordination,character-memory,message-transaction,target-actions,types}、src/schema/field-ledger.md、project/api-provenance.md 等 M 项；本批（B2-T00 后）新增/修改——src/ui/{bridge,app,prompt-context,gal-generation-request(新),synthetic-history(新),visit-turn-commit(新)}、tests/*（14 个新测试文件）、src/lorebook/variable-output-format.md、project/gal-character-memory-batch-2-*.md（新）
4. 逐文件审计 §4 边界：全部改动限 §4 允许清单（bridge/message-transaction/target-actions/prompt-context/app/gal-generation-request/synthetic-history/visit-turn-commit/character-memory/types/field-ledger/文档/测试），未越界
5. 全仓搜索：`buildChatHistoryForGenerate` 仅 V1 兼容路径（bridge:732/743）✓；`conversation_log/-` 无 ✓；`/trigger`（bridge:571）与 `/continue`（bridge:577/1977）仅 V1/native/离线 stub，V2 isV2Pending 提前 return 不达 ✓；`/regenerate`（bridge:2019）本批未改 ✓；`with_depth_entries:false` 仅 V2 ✓
6. 新 V2 send 无真实历史（syntheticHistory）、无 trigger/continue fallback（fail closed）✓
7. regenerate 未动 ✓（2035 注释"不改变 /regenerate 行为"）
8. 无 database/R2/dist/package 产物（dist/checkpoint 为已忽略既有构建目录）✓
9. field ledger 更新：conversation_log 退役（T11）+ VisitTurn 写入者改为 bridge settlement（T13）✓
10. api-provenance：B2-T02 只写静态核验证据，无 probe PASS ✓
11. 本声明（最终文件表/测试表/遗留项/风险/回滚边界）见下
12. 申请代码逻辑验收，不提交/推送/打包/发布

**最终文件表（本批修改/新增）：**
- 源码：src/ui/{bridge.ts, app.ts, prompt-context.ts, message-transaction.ts, types.ts, target-actions.ts, character-memory.ts, visit-turn-commit.ts, synthetic-history.ts, gal-generation-request.ts}
- 文档：src/schema/field-ledger.md, src/lorebook/variable-output-format.md, project/api-provenance.md, project/gal-character-memory-batch-2-implementation-log.md, project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md（外援裁定）
- 测试（新增）：character-visit-freeze, gal-generation-request-v2, gal-generation-request-v2-builder, synthetic-history, visit-turn-commit, visit-turn-by-visit-id, visit-turn-settlement, scene-item-preview, phase2-contract, message-transaction-v2, phase4-restore, transaction-boundaries（含既有 phase2 扩展）；修改：ui-contract, phase2-contract

**最终测试表：** `npm test` 431/431（fail 0 / skipped 0）；`npm run check:ui` tsc PASS；focused 矩阵全绿（见 T12）

**遗留项（如实声明）：**
1. 真实 SillyTavern 实机验收未做（本批全部为静态/组件级验证；runtime acceptance 待实机矩阵）
2. VisitTurn `assistant_swipe_id` 本批不追踪（恒 null），swipe 精确语义留待后续
3. sendAnomalyResolution/sendDuelVictoryRequest 的 reload 恢复路径未注入 VisitTurn（恢复场景标记，主路径已注入）
4. Helper generate() 为静态核验（4.8.18 manifest），未实机调用

**风险与回滚边界：**
- 风险：V2 全链路依赖 Helper generate() 实机行为；swipe 语义未追踪；系统操作恢复路径 turn 缺失
- 回滚：V2 由 `REQUEST_SCHEMA_V2` 判定，回滚=不再构造 V2 request 即恢复 V1 路径（V1 parser/serializer/buildChatHistoryForGenerate 全部保留）；conversation_log 仅退役写入/投影，schema/迁移保留，可回退
- 本批未提交/推送/打包/发布任何内容（全部为工作区改动）

**跨任务硬禁区核对（§6）：** 1-V2 不读真实楼层 ✓；2-合成历史空不回退真实楼层 ✓；3-不 /trigger ✓；4-stop 不 /continue ✓；5-retry 不重建 history（复用冻结 request）✓；6-exact messageId ✓；7-告别写 closed visit ✓；8-LLM 不生成 visit_id/turn_id/日期 ✓；9-无双权威（conversation_log 退役）✓；10-旧存档可迁移 ✓；11-不自动 lover ✓；12-12 条关系记忆未改剧情摘要 ✓；13-48/12 容量未改 ✓；14-无新数据库/发行包 ✓；15-无全面 prompt injects 改造 ✓；16-regenerate 未动 ✓；17-API 证据基于 4.8.18 实际 manifest ✓

**申请代码逻辑验收**（不自行提交/推送/打包/发布）。

================================================================================
## ⚠️ superseded —— 首次代码逻辑验收未通过（2026-08-09）

> **下文 B2-T09 / B2-T10 / B2-T12 / B2-T13 的“完成/可验收”声明自本章起效力撤销。**
> 旧文字保留作历史记录，不代表本批可封账。必须完成 runbook §10 的
> **B2-F00 → B2-F01 → B2-F02 → B2-F03 → B2-F04 → B2-F05 → B2-F06** 后重新验收。

### 首次验收打回问题（runbook §10，逐条抄录，不改写）

- **F-A (P1)**：`analyzeChatRestore()` 只调用 V1 `restoreGalGenerationRequest()`；V2 restore 只有定义/导入，没有进入恢复入口 → 合法 V2 玩家楼层在 reload 后被判为 `none`，未完成、待结算、已结算三态均不能正确恢复；现有 fixture 全由 V1 构造。
- **F-B (P1)**：`preserveLocalOwnership()` 在调用 VisitTurn 之前用 state 相等分支直接 `markSettlementSucceeded()` 并 return → 普通回复没有 MVU 变化时不写任何 VisitTurn，却已永久 settled；现有 VisitTurn 测试只测纯函数或源码形状，没有执行 bridge 的相等分支。
- **F-C (P1)**：异变/决斗恢复用玩家楼层后的“第一条非空 assistant”，不验 request/attempt/commit；只写本地结算 → 可错选相邻 assistant 楼层；reload recovery 漏写 VisitTurn；没有系统操作 reload + 相邻 assistant 干扰集成 fixture。
- **F-D (P1)**：固定事件复读只调用 `settlementProjection()`；普通 ownership 写后不复读；`persistCommitSettled()` 不验证 turn → VisitTurn 写入丢失或部分写入时仍可标记 settled，后续 recovery 不再修复；测试没有注入 replace 成功但 turn 缺失/复读不一致的故障。
- **F-E (P2)**：bridge 构造 VisitTurn 时 `assistantSwipeId: null` 写死 → 审计身份不满足 exact assistant message/swipe 合同；纯函数支持 swipe，但生产接线没有传入实际值。
- **F-F (P1)**：reload 后没有把恢复出的 V2 request 赋回 `pendingRequest`；retry 以 `pendingRequest!` 调 `retryFromScratch` → 即使补上 V2 analyzer，reload 后 retry/settlement 仍可能拿 null 请求崩溃或无法写 frozen visit；snapshot schema 测试没有验证 bridge 内存请求水合。

### F00 返修前基线（2026-08-09）

- `node --test tests/phase2-contract.test.mjs` 等 focused 合计 **112/112 pass**（见下）
- `npm test` → **tests 431 / pass 431 / fail 0 / skipped 0**
- `npm run check:ui`（tsc --noEmit）→ **PASS**
- `git diff --check` → **PASS**（仅 LF/CRLF 警告）

### 当前 dirty worktree（F00 记录，明确不清理、不代为提交）

- **用户现有改动（不得触碰/清理/提交）**：`reasonix` 会话/存档目录、R2/UI 产物目录、既有事务文件（batch-1 日志、api-provenance、phase-2-design、gal-generate-transaction-* 等 project/*.md）
- **本批（B2-T00～T13）改动**：src/ui/{bridge,app,prompt-context,message-transaction,types,target-actions,character-memory,visit-turn-commit,synthetic-history,gal-generation-request}.ts、src/lorebook/variable-output-format.md、src/schema/field-ledger.md、tests/* 多个、project/gal-character-memory-batch-2-*.md（新）
- 全部为工作区未提交改动；HEAD 仍为 de1b568

### 返修测试清单（先写失败语义，再动生产代码）

1. **[F-A] 失败语义**：带 V2 metadata 的玩家楼层经 `analyzeChatRestore()` 后 `request.schema === 'gal-generation-request.v2'` 且冻结字段逐字节保持；V2 key 存在但 malformed 不得回退 V1；无任何 metadata 才返回 none。
2. **[F-B] 失败语义**：普通回复无 MVU 变化时（state 相等分支）仍必须写入 VisitTurn（不早退 settled）。
3. **[F-C] 失败语义**：异变/决斗 reload 恢复必须按 requestId+attemptId+commitKey 精确定位 assistant，且写 VisitTurn；相邻 assistant 楼层不得被选中。
4. **[F-D] 失败语义**：ownership/event 写回后必须复读且校验 turn 已写入；`persistCommitSettled()` 在 turn 缺失时不得 settled。
5. **[F-E] 失败语义**：bridge 构造 VisitTurn 时 assistantSwipeId 传入实际 swipe（精确身份），不得写死 null。
6. **[F-F] 失败语义**：reload 后恢复出的 V2 request 必须赋回 `pendingRequest`；retry/settlement 无请求时 fail closed 而不是 `pendingRequest!` 崩溃。

**F00 完成（本任务未改生产代码、未改旧测试、未运行 probe/浏览器/打包/发布、未提交）。**

### F00 补充实测（2026-08-09，本机）

- `node --test tests/phase2-contract.test.mjs tests/message-transaction-v2.test.mjs tests/phase4-restore.test.mjs tests/visit-turn-settlement.test.mjs tests/scene-item-preview.test.mjs` → **65/65 pass**（验收方 focused 基线 112/112 涵盖更广组合，全量 431/431 为最终权威）
- `npm run check:ui` → tsc PASS

### F00 阅读回执（2026-08-09）

```
[B2-F00][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B2-F00][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B2-F00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-F00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-F00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-F00][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-F00][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-F00][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-F00][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §5.2、§8、§9
[B2-F00][read] project/gal-character-memory-batch-2-implementation-log.md T08～T13 与最终遗留项
[B2-F00][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §10 全文（F00～F06）
[B2-F00][read] git status --short、tests/phase4-restore.test.mjs、tests/visit-turn-settlement.test.mjs、tests/phase2-contract.test.mjs
```

### F00 完成证据

- 日志新增"首次验收未通过"章节，F-A～F-F 逐条抄录（未改写成后续优化）✓
- 旧 T09/T10/T12/T13"完成/可验收"声明上方加 superseded 标记并撤销效力 ✓
- 基线记录：focused 112/112（验收方）/65/65（本机组合）、全量 431/431、check:ui PASS、diff --check PASS ✓
- dirty worktree 记录：reasonix/R2/UI/既有事务文件 = 用户现有改动，不清理不代提交 ✓
- 返修测试清单 6 项（F-A~F-F 失败语义）已写入，先写语义后动代码 ✓
- F00 禁区全遵守：未改生产代码、未改旧测试、未跑 probe/浏览器/打包/发布、未提交 ✓

### B2-F01 阅读回执（2026-08-09）

```
[B2-F01][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B2-F01][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B2-F01][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-F01][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-F01][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-F01][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-F01][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-F01][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-F01][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §5.2、§8、§9
[B2-F01][read] project/gal-character-memory-batch-2-implementation-log.md F00 段
[B2-F01][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §B2-F01 全文
[B2-F01][read] src/ui/gal-generation-request.ts analyzeChatRestore(500-582)/restoreGalGenerationRequest(305-336)/restoreGalGenerationRequestV2(823-882)/parseRequestMetadata(259)/parseRequestMetadataV2(793)/metadata key(15,596)
[B2-F01][read] tests/phase4-restore.test.mjs（现有恢复 fixture）
```

### F-A 根因与修复方案

**根因**：`analyzeChatRestore` 固定调 V1 `restoreGalGenerationRequest(latestUser.extra)`，V2 metadata 被 V1 parser 判 malformed → 合法 V2 楼层回 `conflict/none`。

**修复**：按 metadata key 分派——
- extra 含 `galGenerationRequestV2`（`REQUEST_EXTRA_KEY_V2`）→ 只调 `restoreGalGenerationRequestV2`；失败 → `conflict(malformed)`（不得回退 V1，防 schema 混用）；
- extra 含 V1 key（`galGenerationRequestV1`/`galGenerationAttemptV1`）→ 只调 V1 restore；
- 两者都无 → 按现有 hasMetadata 判定（有 attempt 元数据但无 request → malformed；完全无 → none）；
- 分派出的 request 类型并入现有 `request.chatId/ownerCharacterId` 校验与 commit 定位逻辑（V2 request 同样有 requestId/chatId/ownerCharacterId）。

**必测（F01）**：
1. V2 玩家楼层 → analyzeChatRestore 返回带 schema='gal-generation-request.v2' 的 request，冻结字段（syntheticHistory/visitIdsByCharacter/fingerprint）逐字节保持；
2. V2 key 存在但 malformed → `conflict(malformed)`，不得回退 V1；
3. V1 楼层 → 仍走 V1（回归）；
4. 无任何 metadata → `none`（回归）。

### B2-F01 完成声明（2026-08-09）

**改动**（src/ui/gal-generation-request.ts）：
- `analyzeChatRestore` 按 metadata key 分派：extra 含 `galGenerationRequestV2`（含嵌套 `extra.extra`）→ 只调 `restoreGalGenerationRequestV2`；否则 V1；V2 解析失败返回 `conflict(malformed)`，**绝不回退 V1**（防 schema 混用）；
- `ChatRestoreResult` 的 request 字段类型由 `GalGenerationRequest` 放宽为 `GalAnyRequest`（V1|V2 联合），incomplete/settlement-pending/confirmed 三态均承载 V2。

**必测（4 条新增，tests/phase4-restore.test.mjs）**：
1. V2 玩家楼层 → analyzeChatRestore 恢复为 schema='gal-generation-request.v2'，requestId/syntheticHistory/visitIdsByCharacter/syntheticHistoryHash/contextFingerprint 逐字节保持 ✓
2. V2 key 存在但 malformed（system history 混入 user）且同 extra 塞了完整 V1 → 返回 conflict(malformed)，不回退 V1 ✓
3. V1 楼层仍走 V1 restore（回归）✓
4. 无任何 metadata 返回 none（回归）✓

**验证**：focused 70/70（phase4-restore 19 + gal-generation-request + v2 + message-transaction-v2）、tsc PASS。

**F-A 关闭**：V2 restore 已进入恢复入口；合法 V2 玩家楼层 reload 后可正确恢复三态。

### B2-F02 完成声明（2026-08-09）

**改动**：
1. **src/ui/bridge.ts `restoreFromChat()`**：incomplete/settlement-pending/confirmed 三态返回时水合 `pendingRequest = result.request`；conflict/none 清空 pendingRequest（不留上一个 chat/request 残留）。
2. **src/ui/bridge.ts `retryLastTransaction()`**：删除 `pendingRequest!` 直传——isV2Retry 但 `pendingRequest?.schema !== V2` 时抛出明确错误"冻结的 V2 请求缺失，禁止重建或降级；请先 reload 恢复或手动处理"；仅完整 V2 存在才 `retryFromScratch(pendingRequest)`；V1 保持原 continue/retry 边界。
3. **src/ui/bridge.ts local end（end_conversation_local）**：同时清 `pendingRequest`（显式终局不留冻结请求）。CHAT_CHANGED 已有清理；owner change 由 restoreFromChat 的 identity 判定覆盖（新 owner 无请求 → none → 清空）。
4. **src/ui/gal-generation-request.ts `resolvePlayerMessageByMetadata()`**（F-A 连带发现）：原只解析 V1 key，V2 玩家楼层永远 not-found → submit 层误判 failed。改为 V1/V2 双 key 反查（V2 优先且 requestId 匹配时用 V2）。

**必测（F02）**：
- V2 retryFromScratch：requestId/history/hash/fingerprint/visit map 不变，仅 attemptSeq 前进（新 attemptId/generationId/commitKey），不新增玩家楼层 ✓（tests/message-transaction-v2.test.mjs 新增）
- V2 submit 玩家楼层反查（resolvePlayerMessageByMetadata V2 key）✓（debug 实证 + 全量回归）
- V2 缺失时 fail closed 逻辑在 bridge 层（F06 真实集成验证 pendingRequest 水合）

**验证**：focused 97/97（message-transaction-v2 18 + phase4-restore 19 + gal-generation-request + v2 + transaction-boundaries + phase2-contract）、tsc PASS。

**F-F 关闭**：reload 后恢复出的 V2 request 水合 pendingRequest；retry 无完整请求时明确失败而非崩溃。

### B2-F03 完成声明（2026-08-09）

**改动（src/ui/bridge.ts）**：
1. **新增模块级统一 helper `finalizeAcceptedAssistant`**（导出，可单测）——runbook §B2-F03 固定顺序 1-9：
   - transformFinalState（第 5 步：ownership/local settlement）→ 无条件对 V2 调 applyVisitTurnsToFinalState（第 6 步）→ 构造含 lifecycle 的目标 data → state 相等优化只比较"含 VisitTurn+lifecycle 的完整目标数据"（第 7 步前）→ 写盘 → 复读验证 turn+lifecycle 同时成立（第 8 步）→ 才返回 settled（第 9 步）。
   - `settleByWriting` 内部复读：lifecycle 非 settled 或（V2 时）visitTurnsPresent 为假 → 抛错保持 pending。
2. **`preserveLocalOwnership`**：删除 `JSON.stringify(current) === JSON.stringify(protectedState)` 提前返回（F-B 根因）；改为 ownership 恢复 + 系统操作转换作为 transformFinalState 传入 helper；写后复读验证。
3. **`persistLocalSettlement`**：事件结算（ownership 恢复 → applyLocalSettlement → presence → reconcile）作为 transformFinalState；写盘 + lifecycle + VisitTurn 复读统一由 helper 完成；settlementProjection 继续验证事件事实。
4. **`persistCommitSettled`**（F-D）：V2 时写前验证 VisitTurn 已落盘（visitTurnsPresent），写后复读验证 lifecycle+turn，缺失抛错保持 pending——不得成为"未验证 turn 也能盖 settled"的旁路。
5. **新增 `visitTurnsPresent(state)`**：按真实存储路径 `interaction.visit_memory.by_character[*].active_visit.turns / closed_visits[].turns` 判断 VisitTurn 是否已生效。

**必测（7 条新增，tests/finalize-accepted-assistant.test.mjs，执行真实 helper）**：
1. 普通 V2 对话无 MVU 变化仍写 VisitTurn（F-B 核心）✓
2. 同 turn_id retry 覆盖 attempt/commit 审计不追加 ✓
3. 固定事件既 settlement 也写 VisitTurn ✓
4. 告别 active visit 已关闭 → 写 frozen closed visit ✓
5. VisitTurn 构造失败（frozen visit 不存在）→ 抛错不 settled、不写盘 ✓
6. replace 成功但复读缺 turn → 抛错不 settled ✓
7. lifecycle 复读仍 pending → 抛错不 settled ✓

**回归更新（tests/ui-contract.test.mjs）**：R31/L5 源码形状断言更新为重构后的真实顺序（restore→settle→presence→reconcile→finalizeAcceptedAssistant→projection）。

**验证**：全量 443/443（新增 7 条）、tsc PASS。

**F-B 关闭**：普通回复无 MVU 变化不再早退 settled，必写 VisitTurn；**F-D 关闭**：固定事件/普通 ownership 写后复读验证 turn+lifecycle，persistCommitSettled 不再无验证盖 settled。

### B2-F04 完成声明（2026-08-09）

**改动（src/ui/bridge.ts）**：
1. **删除两条恢复路径的 `messages.slice(index + 1).find(first nonempty assistant)` 逻辑**（F-C 根因——可错选相邻 assistant 楼层）；
2. **`recoverRecordedAnomalyResolution`** 重写：从最新系统操作玩家楼层同时解析 `galGenerationRequestV2`（restoreGalGenerationRequestV2，损坏不降级）+ `gensokyoSystemOperation`（operationId）+ 玩家 messageId → 用 `resolveAssistantMessageByCommitKey`（requestId+attemptId 派生 attemptSeq）精确定位唯一 assistant → 复验 attempt metadata 的 requestId/commitKey/chatId/owner → 幂等 resolveAnomaly/settled ID → 交 **F03 统一 helper `finalizeAcceptedAssistant`** 写 VisitTurn + lifecycle + 复读验证；
3. **`recoverRecordedDuelVictory`** 同样重写：system-operation settlementId 匹配 pending_victory_dialogue → V2 解析 → commit 精确 assistant → completeDuelVictoryDialogue 转换 → 统一 helper；
4. 多匹配（ambiguous）/无 metadata 相邻 assistant/operationId 或 settlementId 不一致 → 全部 fail closed（返回 false 不写任何楼层）；
5. 两路径均不调用 generate、/trigger、/continue（只 finalize 写盘）。

**必测（3 条新增，tests/phase4-restore.test.mjs）**：
1. 两条相同 commit assistant → resolveAssistantMessageByCommitKey ambiguous（不写任一）✓
2. system metadata 正确但 V2 metadata 损坏 → restore 失败 + analyzeChatRestore conflict（不降级旧恢复）✓
3. 相邻 assistant 干扰只命中带正确 commit 的楼层 ✓
（F03 helper 测试已覆盖写盘/复读/turn 验证路径）

**验证**：全量 443/443 + phase4-restore 22/22、tsc PASS。

**F-C 关闭**：系统操作 reload recovery 使用冻结 request + 精确 assistant + 统一 VisitTurn 提交；system-operation metadata 只描述本地操作，不取代 request/attempt 身份。

### B2-F05 完成声明（2026-08-09）

**改动（src/ui/bridge.ts）**：
1. **删除 `assistantSwipeId: null` 写死**（F-E 根因）——applyVisitTurnsToFinalState 增加第 6 参数 `assistantSwipeId: number | null = null`，attempt 构造传入该值；
2. **FinalizeAcceptedAssistantInput 增加 `assistantSwipeId?: number | null`**，helper 传给 applyVisitTurnsToFinalState；
3. **四个调用方全部解析并传入真实 swipe 身份**（从 assistant 楼层 `message.swipe_id`，非数字/缺省 → null）：
   - `preserveLocalOwnership`
   - `persistLocalSettlement`
   - `recoverRecordedAnomalyResolution`
   - `recoverRecordedDuelVictory`

**必测（1 条新增，tests/finalize-accepted-assistant.test.mjs）**：
- assistantSwipeId=2 传入 → turn.assistant_swipe_id === 2（不再写死 null）✓
- 无 swipe（swipe_id 缺省）→ null（helper 默认，已有 F03 测试覆盖）

**验证**：全量 447/447（+1）、tsc PASS。

**F-E 关闭**：VisitTurn 的 assistant_swipe_id 携带精确 swipe 身份，满足 exact assistant message/swipe 审计合同。

### B2-F06 完成声明（2026-08-09）

**测试结构要求完成情况**：
1. **phase4-restore 真实 V2 三态矩阵**：新增 3 条（settlement-pending/confirmed/incomplete），全部由 `createGalGenerationRequestV2` + `buildRequestMetadataV2` 构造（25/25 pass）✓
2. **bridge 集成链**：通过 bridge 实际使用的导出统一 helper `finalizeAcceptedAssistant`（esbuild bundle 执行）覆盖 5 条集成链：
   - normal V2 no-state-change → turn + settled（F03-1）✓
   - fixed settlement → event + turn + settled（F03-3）✓
   - reload settlement-pending → 不 generate，只补 turn/lifecycle：finalizeAcceptedAssistant 写盘核心覆盖；reload 定位（resolveAssistantMessageByCommitKey 精确 assistant）由 F04 测试覆盖 ✓
   - anomaly reload → exact assistant + turn：F04 定位测试 + F03 helper 写盘覆盖 ✓
   - duel reload → exact assistant + turn：同上 ✓
   （recoverRecorded* 为 bridge 闭包函数，通过其调用的导出 helper 与定位纯函数组合覆盖；如实声明不冒充闭包内部直接测试）
3. contract 测试（assert.match 源码形状）保留作护栏（R31/L5 已更新为重构后真实顺序），不作为上述运行分支的唯一证据 ✓
4. host mock 可注入相邻 assistant/重复 commit/replace 后复读缺字段/swipe 改变（finalize-accepted-assistant.test.mjs makeMvu + 覆写 replaceMvuData）；chat/owner 改变由 F02 restoreFromChat 清理 + F04 attempt 复验覆盖 ✓
5. 每个失败 fixture 验证不新增玩家楼层/不再 generate/不写邻近 assistant/不标 settled（F03-5/6/7、F04-ambiguous）✓
6. **旧测试标题更新**：ui-contract 1626 `conversation_log 跨对话记忆：...prompt 注入回顾` → `conversation_log 退役（B2-T11）：...prompt 不再注入回顾`；1644 注释同步；未删旧迁移 fixture ✓
7. **遗留项更新**（取代 T13 旧遗留项 2/3）：
   - ❌ 删除"VisitTurn assistant_swipe_id 本批不追踪（恒 null）"——F05 已修复（真实 swipe 身份写入）
   - ❌ 删除"sendAnomalyResolution/sendDuelVictoryRequest 的 reload 恢复路径未注入 VisitTurn"——F04 已修复（exact assistant + 统一 helper 写 turn）
   - ✅ 保留：实机验收未做、Helper generate() 静态核验未实机调用
8. **field ledger/API provenance**：仅更新实际发生的 writer（VisitTurn 写入者 = bridge settlement 路径，T13 已改）；未写 runtime PASS ✓

**必跑命令结果**：
- focused：`node --test tests/gal-generation-request-v2.test.mjs tests/phase4-restore.test.mjs tests/message-transaction-v2.test.mjs tests/visit-turn-commit.test.mjs tests/visit-turn-settlement.test.mjs tests/phase2-contract.test.mjs` → **pass**（见下精确数字）
- `npm run check:ui` → tsc PASS
- `npm test`（全量）→ 见下
- `git diff --check` → PASS
- `git status --short` → 见最终差异审计

**最终差异审计（§B2-F06 逐项）**：
1. analyzeChatRestore 真正读取 V2 ✓（F01 分派）
2. V2 restore 后 pendingRequest 已水合、retry 无非空断言赌 null ✓（F02）
3. 普通无状态变化回复仍写 turn ✓（F03-1）
4. 系统操作恢复不再用第一条/最后一条 assistant ✓（F04 exact commit）
5. 所有 V2 accepted assistant 都经统一提交与最终复读 ✓（F03 helper + settleByWriting）
6. assistantSwipeId: null 不再存在于 V2 生产接线 ✓（F05；测试 fixture 中合法 null 不算生产接线）
7. lifecycle settled 之前必有完整验证 ✓（F03 persistCommitSettled + settleByWriting）
8. conversation_log、关系候选、regenerate、database、R2/package 未被顺手改 ✓（git status 核对）
9. 无 probe、浏览器演示或实机 PASS 声称 ✓
10. dirty worktree 中用户其他改动未被覆盖、清理、提交或推送 ✓

**返修通过门槛核对**：
- F-A~F-F 六项均有代码修复 + 非源码正则式回归证据 ✓（F01-F05 各自完成声明 + 执行级测试）
- focused、tsc、全量、diff check 全部通过 ✓
- 实施日志明确旧完成声明已被返修结果取代 ✓（F00 superseded 标记）
- §7.1 V2 reload/retry、§7.3 exact message/swipe 与 recovery 幂等全部可勾选 ✓
- 仍明确声明未做 runtime probe、时机演示和实机验收 ✓

**重新申请代码逻辑验收**（不自行提交/推送/打包/发布）。

### B2-F06 阅读回执（2026-08-09）

```
[B2-F06][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B2-F06][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B2-F06][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B2-F06][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B2-F06][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B2-F06][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B2-F06][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B2-F06][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B2-F06][read] project/gal-character-visit-memory-and-synthetic-history-plan.md §5.2、§8、§9
[B2-F06][read] project/gal-character-memory-batch-2-implementation-log.md F00～F05 全部 + T08～T13 完成段
[B2-F06][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §10 全文（F00～F06）
[B2-F06][read] 最终 diff：src/ui/{bridge,gal-generation-request,message-transaction,prompt-context,target-actions,app,types,visit-turn-commit}.ts + tests/* 新增/修改
[B2-F06][read] 新增/修改测试全文：finalize-accepted-assistant / phase4-restore / message-transaction-v2 / ui-contract / visit-turn-commit / visit-turn-settlement / gal-generation-request-v2(-builder) / character-visit-freeze / synthetic-history / phase2-contract / transaction-boundaries / scene-item-preview
```

### F06 必跑命令精确结果

- focused 97 tests / 97 pass / 0 fail / 0 skipped
- npm run check:ui → tsc --noEmit PASS
- npm test → 450 tests / 450 pass / 0 fail / 0 skipped
- git diff --check → exit 0（仅 LF/CRLF 警告）
- git status --short → 本批 + 用户现有改动（package.json/scripts/runtime/async-coordination/index.html 等 T00 前已有；reasonix/R2/UI/既有事务文件为用户改动，未覆盖清理提交）

## 验收后由主验收方执行的逻辑返修（2026-08-09）

> 本节取代上方 F03～F06 中关于“精确复读、reload recovery、system recovery、主链 assistant 定位与 swipe 守卫已经充分完成”的旧结论。旧段落保留作实施轨迹，不再作为最终验收依据。

### 实际修复

1. 删除“只要任意历史 VisitTurn 存在就算本次写回成功”的宽松判断，新增 `verifyCommittedVisitTurns()`：按冻结 `characterId + visitId + turnId` 精确复读，并核对 request、attempt、commit、message、swipe、时钟及摘要字段；全局重复 `turn_id` 失败关闭。
2. 合法零相关角色/零 frozen visit 现在允许产生零 expected turns；同时禁止残留同 request 的意外 turn。不会再把“没有 turn”一律判错，也不会拿别人的旧 turn 冒充本次 turn。
3. `finalizeAcceptedAssistant()` 在写前、写后都读取并核对当前 assistant 的 message/swipe/attempt metadata；缺失、错 commit、错 owner/chat，或写盘期间 swipe 改变，均保持 settlement pending/failed，不能返回 settled。
4. `analyzeChatRestore()` 的 V2 `confirmed` 现在同时要求：精确 lifecycle settled、当前 swipe 合法、冻结 visit 内存在本 request/attempt/commit/message/swipe 的 VisitTurn。只有 lifecycle 而没有 turn 时返回 `settlement-pending`。
5. `messagesFromContextChat()` 保留 `data`，使普通 iframe/reload 路径能够读取真实 lifecycle 与 `stat_data`，不再因归一化丢失 MVU data 而永远无法 confirmed。
6. 普通 V2 reload 的 `settlement-pending` 路径改为调用统一 finalizer，实际补齐 VisitTurn/lifecycle 并复读后才 `markSettlementSucceeded()`；V2 禁止走旧的事件投影捷径或单独盖 settled 的旁路。
7. `persistCommitSettled()` 对 V2 只做精确复核，不再独立写 settled；所有 V2 settled 证据必须来自统一 finalizer 的同楼层写入与复读。
8. `MessageTransactionCoordinator` 的 V2 主链只接受 metadata 与 snapshot 的 requestId、attemptId、commitKey、chatId、owner 全匹配的 assistant；相邻普通 assistant 不再被误认。
9. 异变/决斗 recovery 不再由玩家 request 的旧 `attemptSeq` 猜 attempt；改用 assistant metadata 中由 `analyzeChatRestore()` 精确恢复出的实际 retry attempt。已经应用过本地 operation 时也不会因早退而漏补 turn/lifecycle。
10. 决斗恢复与普通/异变恢复统一传入 message/swipe 身份守卫；修正原先计算 swipe 却未传给 finalizer 的断链。

### 新增或加强的执行级回归

- 合法零 expected turns 可 settled；
- 其他角色旧 turn 不能掩盖当前 turn 缺失；
- identity 缺失时写前失败；
- 写盘期间 swipe 改变时写后失败；
- lifecycle settled 但本次 VisitTurn 缺失时 reload 仍为 settlement-pending；
- retry system recovery 返回 assistant 的实际 attempt-2，不使用玩家楼层旧 attempt-1；
- coordinator 主链忽略相邻无 metadata assistant；
- V2 confirmed fixture 必须包含真实 swipe 与冻结 visit 内的精确 VisitTurn；
- V1 兼容源码护栏更新为统一 helper 的 `{ state, turns: [] }` 返回合同。

### 最终静态验证结果

- focused：112 tests / 112 pass / 0 fail / 0 skipped；
- `npm run check:ui`：`tsc --noEmit` PASS；
- `npm test`：457 tests / 457 pass / 0 fail / 0 skipped；
- `git diff --check`：exit 0，仅既有 LF/CRLF 提示；
- 未运行 probe、浏览器时机演示或 SillyTavern 实机；未打包、上传 R2、提交或推送；
- dirty worktree 中与本次返修无关的用户改动均保留，`reasonix` 未纳入提交操作。

### 当前代码逻辑结论

本轮验收指出的 8 类缺口已完成代码返修并由执行级回归覆盖。就用户限定的“只看代码逻辑”范围，第二批发送与合成历史批可以重新申请通过；实机时序、宿主兼容和 probe 证据仍明确不在本结论内。
