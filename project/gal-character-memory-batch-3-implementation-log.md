# GAL 角色记忆重构：第三批「重生成同构」实施日志

> 文档性质：第三批实施日志（与 `gal-character-memory-batch-3-regeneration-runbook.md` 配套）
> 编写日期：2026-08-09（本批实施会话）
> 批次主题：重生成复用 V2 冻结请求、指定 assistant swipe 提交、从原基线重算、记忆 upsert、禁止重复楼层与重复 MVU 结算
> 当前状态：**第三批未开始实现**（T00 只读审计完成）

---

## 0. 批次定位

- 本文对应 runbook `project/gal-character-memory-batch-3-regeneration-runbook.md`（下称"第三批 runbook"）。
- 执行分工：执行 agent 完成 T00～T08；**到 O01 门前必须停**，交主验收方；O01～O04 通过后执行 T09～T12。
- 本日志只记录执行 agent 实际完成、实际验证的内容，不夸大、不提前写"完成"。

---

## B3-T00：基线、scope lock 与测试目录（已完成，只读审计）

### B3-T00 阅读回执

本任务开始前逐行执行第三批 runbook §2.1 阅读门禁。Reasonix 环境通过 `read_skill` 加载技能，实际加载的是以下路径的技能文件全文（含 references）：

```text
[B3-T00][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B3-T00][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B3-T00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B3-T00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B3-T00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B3-T00][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B3-T00][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B3-T00][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B3-T00][read] project/gal-character-memory-batch-3-regeneration-runbook.md（全文，分段逐行读完）
```

按需阅读的项目文件（runbook §2.2）：

```text
[B3-T00][read] project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §7、§8、§10（验收标准、遗留项、首次返修单）
[B3-T00][read] project/api-provenance.md Probe C 段（§Probe C 与 Helper 4.8.18 暴露清单）
[B3-T00][read] project/gal-character-memory-batch-2-implementation-log.md（经 explore 子代理摘要核对关键返修段）
[B3-T00][read] package.json（测试命令：test = node --test tests/*.test.mjs；check:ui = tsc --noEmit）
```

### B3-T00 行为合同

- 目标：只读审计 + 新建实施日志，不改生产行为。
- 允许改的文件：本实施日志（当前文件）；第三批 runbook 仅允许修正错别字（本批未做任何修改）。
- 禁止改的文件：`src/` 全部、`tests/` 全部、scripts、schema、docs、发行文档。
- 禁止动作：修改测试断言制造绿灯、跑 probe、打包、发布、清理未跟踪文件。
- 停止条件：任何需要改动生产代码才能继续的发现，立即停止并记录。

### B3-T00 开始前基线

`git status --short`（2026-08-09 会话，分支 `main`，HEAD `de1b568 merge: character visit memory foundation`）：

```text
 M package.json
 M project/README.md
 M project/api-provenance.md
 M project/gal-character-memory-batch-1-data-foundation-runbook.md
 M project/gal-character-memory-batch-1-implementation-log.md
 M project/gal-character-visit-memory-and-synthetic-history-plan.md
 M scripts/build-ui.mjs
 M scripts/package-checkpoint.mjs
 M scripts/publish-ui.mjs
 M src/lorebook/variable-output-format.md
 M src/runtime/ui-host-shell.js
 M src/runtime/ui-loader.js
 M src/schema/field-ledger.md
 M src/ui/app.ts
 M src/ui/async-coordination.ts
 M src/ui/bridge.ts
 M src/ui/character-memory.ts
 M src/ui/index.html
 M src/ui/message-transaction.ts
 M src/ui/prompt-context.ts
 M src/ui/target-actions.ts
 M src/ui/types.ts
 M tests/ui-contract.test.mjs
?? .playwright-mcp/
?? project/gal-character-memory-batch-2-implementation-log.md
?? project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md
?? project/gal-character-memory-batch-3-regeneration-runbook.md
?? project/gal-generate-transaction-acceptance-brief.md
?? project/gal-generate-transaction-implementation-log.md
?? project/gal-generate-transaction-refactor-plan.md
?? project/phase-2-design.md
?? project/r2-ui-test-channel-implementation-log.md
?? project/r2-ui-test-channel-publish-plan.md
?? scripts/upload-live-asset.mjs
?? src/ui/gal-generation-request.ts
?? src/ui/synthetic-history.ts
?? src/ui/visit-turn-commit.ts
?? tests/character-visit-freeze.test.mjs
?? tests/finalize-accepted-assistant.test.mjs
?? tests/gal-generation-request-v2-builder.test.mjs
?? tests/gal-generation-request-v2.test.mjs
?? tests/gal-generation-request.test.mjs
?? tests/message-transaction-v2.test.mjs
?? tests/phase2-contract.test.mjs
?? tests/phase4-restore.test.mjs
?? tests/runtime-js-syntax.test.mjs
?? tests/scene-item-preview.test.mjs
?? tests/synthetic-history.test.mjs
?? tests/transaction-boundaries.test.mjs
?? tests/ui-channel.test.mjs
?? tests/visit-turn-by-visit-id.test.mjs
?? tests/visit-turn-commit.test.mjs
?? tests/visit-turn-settlement.test.mjs
?? verify-console-full.log
?? verify2-console.log
?? verify3-console.log
```

**声明：以上 dirty worktree 全部是用户/前序批次现有工作，不是本批引入。本批不得清理、不得代为提交、不得覆盖其中任何文件内容。**

基线验证结果（B3-T00 实测命令与精确数字）：

```text
focused 第二批测试（6 个文件）:  node --test tests/finalize-accepted-assistant.test.mjs tests/phase4-restore.test.mjs tests/message-transaction-v2.test.mjs tests/visit-turn-settlement.test.mjs tests/visit-turn-commit.test.mjs tests/transaction-boundaries.test.mjs
  → 77 pass / 0 fail / 0 skipped
npm run check:ui                 → PASS（tsc --noEmit 无错误）
npm test                         → 457 pass / 0 fail / 0 skipped（tests/*.test.mjs 全量）
git diff --check                 → CLEAN（exit 0；仅 LF→CRLF 提示，无空白错误）
```

### B3-T00 审计：现有 regenerate 生产路径与调用点

基于只读调查（explore 子代理 + 关键文件确认），当前 regenerate 生产路径如下：

| 位置 | 行为 |
|---|---|
| `src/ui/bridge.ts:2442-2511` `regenerateLatest()` | 唯一生产实现。guard（`transactionOperationInFlight \|\| regenerationPhase !== 'idle'`）→ `requireMvu` + `replaceMvuData` 可用性检查 → `resolveLatestAssistantForRegeneration`（最后一层必须 assistant）→ `parseAttemptMetadata` → `resolvePlayerMessageByMetadata`（V1/V2 双 key 反查玩家楼层）→ chat identity 校验 → 无 metadata legacy 仅记录仍允许 → `latestPersistedState` 保护基线 → **`await g.triggerSlash?.('/regenerate await=true')`**（原生 regenerate）→ 等待变量 epoch 推进（90s 超时）→ 读目标楼层 `mvu.getMvuData` → `stat_data = reconcileM2Runtime(protectedBefore, applyPresenceUpdate(restoreLocalEventOwnership(...), assistantText), chatId)` → `replaceMvuData`。 |
| `src/ui/app.ts:2189-2192` | `gg-regenerate` 按钮 click → `bridge.regenerateLatest()`。 |
| `src/ui/bridge.ts:2946`（离线预览 stub） | `regenerateLatest` 抛错 stub。 |
| `src/ui/bridge.ts:2402-2441` `stopGeneration()` | 仅 helper-generate 路径使用 `stopGenerationById`；native 分支用 `g.SillyTavern?.stopGeneration?.()`。`regenerateLatest` 内部不调用 stop。 |
| `src/ui/bridge.ts:2530` | 诊断声明 `regenerationTransport: 'native-regenerate'`；`src/ui/types.ts:497` 联合类型含 `native-regenerate` 与 `helper-generate-swipe`（后者未启用）。 |

### B3-T00 审计：当前 native 路径的行为与不符合点

对照第三批 runbook §0 五条合同，当前 native 路径逐条判定：

1. **重生成与普通发送共用同一 V2 冻结请求**：✗ 不符合。`regenerateLatest` 不重建/不复用 V2 请求；它直接调原生 `/regenerate`，让宿主基于**当前真实聊天历史**重新生成，旧 assistant 文本不冻结、synthetic history 不复用。
2. **新结果只进入指定 assistant 楼层的新 swipe，不新增玩家楼层、不留临时 assistant 楼层**：✗ 不符合。原生 `/regenerate` 在**同一 assistant 楼层**替换/新增 swipe 的行为由宿主控制，本卡无指定 swipe 提交能力（全代码库无 `setChatMessages` 调用）；且候选生成期间宿主是否自动落楼未受控（Probe C 未 PASS）。
3. **新 swipe 状态从原请求生成前基线重算，不在旧回复结算后状态上叠加**：✗ 不符合。当前做法是 `latestPersistedState` 保护基线 → 原生生成完成后读**当前** `getMvuData` → 从"旧回复已结算后的 current state"restore 本地所有权并 reconcile，这正是 runbook §4.1 禁止的"从旧 settled current 叠加"。
4. **同一 requestId:characterId 只 upsert 一条 VisitTurn，不追加重复记忆**：✗ 不符合。当前 `regenerateLatest` 根本不执行 VisitTurn 提交（无 `upsertVisitTurnByVisitId` / `applyVisitTurnsToFinalState` 调用）。
5. **MVU、presence、本地事件、奖励、消费、时间推进和 settled ID 对新 swipe 只结算一次**：✗ 无法证明。原生 regenerate 触发宿主自身 MVU 处理，本卡随后又做一次本地 reconcile，处理次数不受控；且没有 swipe 级生命周期/receipt。

其它不符合点：

- 无 attempt 推进：`regenerateLatest` 不创建新的 regenerate attempt（attemptSeq/attemptId/commitKey 不更新）。
- 无状态机：只有 `regenerationPhase: 'idle'|'generating'|'settling'` 三值字符串，无 runbook §5.3 要求的七阶段 + failed/conflict 恢复语义。
- 无 commit fence：没有 `commitKey` 幂等缓存、reload 恢复、同 commit 重试保护。
- 无漂移检测：没有 `RegenerationCommitReceiptV1`、无 fingerprint、无 `post-settlement-drift` 错误码。
- 无 swipe 监听收敛：`MESSAGE_UPDATED`/`MESSAGE_SWIPED` 都只是通用 `refresh()`（bridge.ts:2545、2552），左右切换会触发 `refresh`，不触发新结算，但也没有 swipe 分支选择逻辑。

**结论：当前生产 regenerate 是 `native-regenerate` 兼容入口，不符合第三批同构合同；第三批改造不是"换个函数名"，而是新建事务链。符合 runbook §1.1/§3.1 现状描述。**

### B3-T00 审计：第三批测试文件清单（暂不写实现）

按 runbook §9 与 §12 focused 建议，规划测试文件（T01 起逐个创建）：

| 测试文件 | 对应任务 | 覆盖 |
|---|---|---|
| `tests/gal-regeneration-contract.test.mjs` | T01 | 纯类型 round-trip、错误码、unknown 保留、越界/非法拒绝 |
| `tests/gal-regeneration-target.test.mjs` | T03 | target locator、attemptSeq 扫描、legacy 拒绝 |
| `tests/gal-regeneration-replay.test.mjs` | T06 | replay engine 顺序、幂等、fail-closed |
| `tests/gal-regeneration-swipe-plan.test.mjs` | T07 | swipe append plan、写后验证器 |
| `tests/gal-regeneration-coordinator.test.mjs` | T08 | coordinator 骨架（fake ports 竞态矩阵） |
| `tests/gal-regeneration-fingerprint.test.mjs` | T05 | receipt/fingerprint/漂移检测 |
| `tests/gal-regeneration-baseline.test.mjs` | T04 | frozen baseline reader |
| `tests/gal-generate-config-builder.test.mjs` | T02 | 统一 config builder（send/regenerate 深相等） |

### B3-T00 停止条件复核

- 未修改 `src/` 任何文件；
- 未修改任何测试断言；
- 未运行 probe、打包、发布；
- 未清理未跟踪文件；
- 未提交、未推送。

### B3-T00 完成声明

```text
B3-T00 只读审计完成：阅读回执、dirty worktree 基线、focused 77/77、check:ui PASS、
全量 457/457、diff-check CLEAN、regenerate 生产路径与 native 不符合点已列明、
第三批测试文件清单已建立。
第三批未开始实现（T01 起尚未写任何生产代码）。
```

---

## B3-T01：纯类型、错误码和不变量（已完成）

### B3-T01 阅读回执（每个小任务重新完整阅读）

```text
[B3-T01][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B3-T01][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B3-T01][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B3-T01][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B3-T01][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B3-T01][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B3-T01][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B3-T01][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B3-T01][read] project/gal-character-memory-batch-3-regeneration-runbook.md（全文）
[B3-T01][read] src/ui/gal-generation-request.ts（V2 类型/构造/恢复/metadata 全文）
[B3-T01][read] src/ui/types.ts（前 80 行风格确认）
[B3-T01][read] tests/gal-generation-request-v2.test.mjs（测试风格确认）
[B3-T01][read] tsconfig.json（strict: true）
```

### B3-T01 行为合同

- 目标：建立 regeneration target、attempt/receipt、swipe plan、状态机错误码，不接宿主。
- 允许改：新建 `src/ui/gal-regeneration.ts`；新建 `tests/gal-regeneration-contract.test.mjs`；`src/ui/types.ts` 仅在必要时做公共接口（本任务未改）。
- 禁止改：bridge.ts、message-transaction.ts、character-memory.ts、visit-turn-commit.ts、synthetic-history.ts、MVU schema、request V2 schema、旧 metadata、其它测试。
- 开始前基线：focused 第二批 77/77、check:ui PASS、全量 457/457、diff-check CLEAN（T00 记录）。
- 预期新增测试：`tests/gal-regeneration-contract.test.mjs`（21 个用例）。
- 停止条件：若需要修改 MVU schema、request V2 schema 或旧 metadata，停止交回主验收方（未触发）。

### B3-T01 实际 diff

- 新建 `src/ui/gal-regeneration.ts`（约 500 行）：版本化 schema 常量（target/receipt/swipe-plan）；15 个业务错误码 + 标签表；11 个状态机阶段；`GalRegenerationTargetV1` + `parseGalRegenerationTargetV1`（上下文可选 swipeArrayLength，越界/尾部校验，unknown 保留）；`RegenerationCommitReceiptV1` + `parseRegenerationCommitReceiptV1`；`SwipeAppendPlanV1` + `validateSwipeAppendPlanV1`（身份与数组结构校验）。
- 新建 `tests/gal-regeneration-contract.test.mjs`（21 个用例）：target/receipt round-trip、unknown 保留、每个非法字段 fail closed、source 越界、candidate 非尾部、四数组长度不一致、错误码/阶段常量。
- `src/ui/types.ts`：未改（runbook 允许"只做必要公共接口"，本任务无必要）。

### B3-T01 验证结果

```text
node --test tests/gal-regeneration-contract.test.mjs → 21/21 PASS
npx tsc --noEmit → exit 0（PASS）
```

设计裁定记录：

- `validateSwipeAppendPlanV1` 只锁身份与数组形状（messageId、source/candidate 范围与尾部、四数组长度、swipe_id），正文/数据深比较留给 T07 的写后验证器，避免 T01/T07 职责重叠。
- candidate 非尾部的错误码裁定为 `candidate-write-conflict`（位置语义冲突）；四数组长度不一致/写后未增或超增裁定为 `malformed-swipe-arrays`（runbook §7.1 语义）；messageId 不符裁定为 `target-changed`。
- parse 层错误码（missing/malformed/schema-mismatch/incomplete/invalid/invalid-original-request/source-swipe-out-of-range/candidate-not-tail）与业务错误码分离：parse 证明"形状合法"，业务码证明"流程可用"。

---

## B3-T02：统一 generate-config builder（已完成）

### B3-T02 阅读回执（每个小任务重新完整阅读）

```text
[B3-T02][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B3-T02][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B3-T02][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B3-T02][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B3-T02][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B3-T02][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B3-T02][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B3-T02][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B3-T02][read] project/gal-character-memory-batch-3-regeneration-runbook.md（全文，重点 §6.1–6.3）
[B3-T02][read] src/ui/bridge.ts runHelperGenerate 全文（config 构造区域 930-1095）
[B3-T02][read] src/ui/gal-generation-request.ts（REQUEST_SCHEMA_V2/computeContextFingerprint/SyntheticHistoryMessage）
```

### B3-T02 行为合同

- 目标：把 V2 generate config 构造抽成纯 builder，send 与 regenerate 共用；send 改调用 builder；builder 不读宿主。
- 允许改：新建 `src/ui/gal-generate-config.ts`；`src/ui/bridge.ts` 仅两处（import + runHelperGenerate 的 V2 config 构造）；新建 `tests/gal-generate-config-builder.test.mjs`。
- 禁止改：V1 兼容路径行为、request 冻结字段、其它生产文件、其它测试。
- 开始前基线：全量 457/457（T00 记录）。
- 预期新增测试：`tests/gal-generate-config-builder.test.mjs`（9 个用例）。
- 停止条件：需要改 V2 request schema、MVU schema 或旧 metadata（未触发）；生产改动超过 160 行需重新门禁（未触发，约 126 行）。

### B3-T02 实际 diff

- 新建 `src/ui/gal-generate-config.ts`（106 行）：`GAL_GENERATE_CONFIG_SCHEMA_V1`、`BuiltGalGenerateConfig`（config + configFingerprint）、`buildGalGenerateConfig(request, { generationId })`（纯函数；校验 schema==='gal-generation-request.v2' 与恰好一条非空 system syntheticHistory；`with_depth_entries:false`；`user_input=request.modelUserInput`；fingerprint 用 `stableStringify` + FNV-1a，**排除 generation_id**）。
- `src/ui/bridge.ts`（2 处）：第 39 行 import；runHelperGenerate 991-1006 区域 V2 分支改为调用 `buildGalGenerateConfig`（V1 分支原样保留 `buildChatHistoryForGenerate`）。原 V2 history 内联校验（恰好一条非空 system）移入 builder，行为等价。
- 新建 `tests/gal-generate-config-builder.test.mjs`（9 个用例）：characterization 形状、send/regenerate 除 generation_id 深相等、request 逐字节未变、纯函数稳定性、未知字段不进 config、旧 assistant 文本不进 prompts、0/2/非 system/空白拒绝、not-v2、fingerprint 稳定性与 key 顺序无关。

### B3-T02 验证结果

```text
node --test tests/gal-generate-config-builder.test.mjs → 9/9 PASS
npx tsc --noEmit → exit 0（PASS）
npm test（全量回归，含 ui-contract 与 message-transaction-v2）→ 487/487 PASS（+30 = T01 21 + T02 9）
```

设计裁定记录：

- fingerprint 排除 `generation_id`：generation_id 每次 attempt 都不同，若纳入则 send/regenerate 指纹永远不同，"同构"无法用指纹证明；裁定 fingerprint 覆盖其余全部 config 字段（runbook §6.1 "configFingerprint" 语义）。
- V1 兼容路径不迁移：V1 只服务旧事务恢复，不参与同构合同；runbook §6.3 禁止的是"send 和 regenerate 各维护一份 config object"，不涉及 V1。
- tool-call/空结果校验保持在执行层（runHelperGenerate），builder 只做 config 构造（runbook T02 必测最后一条）。

---

## B3-T03：精确 target locator 与 attemptSeq 扫描（已完成）

### B3-T03 阅读回执（每个小任务重新完整阅读）

```text
[B3-T03][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B3-T03][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B3-T03][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B3-T03][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B3-T03][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B3-T03][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B3-T03][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B3-T03][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B3-T03][read] project/gal-character-memory-batch-3-regeneration-runbook.md（全文，重点 §5.1–5.2、T03）
[B3-T03][read] src/ui/gal-generation-request.ts（resolvePlayerMessageByMetadata/restoreGalGenerationRequestV2/parseAttemptMetadata/buildAttemptMetadata/ATTEMPT_EXTRA_KEY 全文）
[B3-T03][read] project/api-provenance.md（ST 1.18 swipe_info.extra 嵌套事实）
```

### B3-T03 行为合同

- 目标：纯函数定位唯一 target，不调用模型、不写宿主；扫描同 request 合法 attempt 取最大 seq + 1。
- 允许改：新建 `src/ui/gal-regeneration-locator.ts`；新建 `tests/gal-regeneration-target.test.mjs`。
- 禁止改：其它生产文件、既有测试、schema、宿主接口。
- 开始前基线：全量 487/487（T02 记录）。
- 预期新增测试：`tests/gal-regeneration-target.test.mjs`（15 个用例）。
- 停止条件：需要修改 MVU schema、request V2 schema 或旧 metadata（未触发）。

### B3-T03 实际 diff

- 新建 `src/ui/gal-regeneration-locator.ts`（约 290 行）：`locateGalRegenerationTargetV1`（纯函数，输入 chat/owner/messages/assistant all-swipes 视图 + 注入的 arraysFingerprint；输出 `{ ok:true; target; nextAttemptSeq }` 或业务错误码）；`attemptSeqOf`（从 attemptId 提取 seq）；`hasAttemptMetadataKey`（兼容 extra 与 extra.extra 嵌套探测）；`scanAttempts`（同 request 合法 attempt 去重扫描，重复 seq/commitKey/损坏/异 request 污染 fail closed）。
- 新建 `tests/gal-regeneration-target.test.mjs`（15 个用例）：单 swipe、三 swipe attempt-4、玩家楼层重复、attempt 重复、source 越界、后续 user/system 楼层、chat/owner 变化、nested extra.extra、legacy、attempt 指向他楼、异 request 污染、四数组不一致、message_id 非最后楼、attemptSeqOf。

### B3-T03 验证结果

```text
node --test tests/gal-regeneration-target.test.mjs → 15/15 PASS
npx tsc --noEmit → exit 0（PASS）
```

设计裁定记录：

- `nextAttemptSeq` 作为 locate 产出（runbook §5.2），不塞进 target 类型（target 保持 runbook §5.1 原样）；coordinator（T08）用 `target.nextAttemptSeq` 构造新 attempt。
- 无 metadata 的**非 source** swipe 忽略不参与扫描（可能是旧协议 swipe，不能因此拒绝整个卡）；但 source swipe 必须能解析 attempt，否则 `legacy-request-unsupported`。
- 混入其它 request 的合法 attempt 判 `request-conflict`（assistant 楼层被污染）；存在 attempt key 但解析失败判 `attempt-sequence-conflict`（损坏）。
- arraysFingerprint 以注入方式提供（T05 实现正式指纹后由调用方传入），locator 保持纯函数。

---

## B3-T04：冻结 baseline reader 的纯解析部分（已完成）

### B3-T04 阅读回执（每个小任务重新完整阅读）

```text
[B3-T04][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B3-T04][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B3-T04][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B3-T04][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B3-T04][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B3-T04][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B3-T04][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B3-T04][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B3-T04][read] project/gal-character-memory-batch-3-regeneration-runbook.md（全文，重点 §4.3、T04）
[B3-T04][read] src/ui/bridge.ts EMPTY_MVU_DATA 定义（139-145，MvuData 形状）
[B3-T04][read] src/ui/gal-generation-request.ts RequestChatSnapshot（stateMessageIdBeforeGeneration: number | null 语义）
```

### B3-T04 行为合同

- 目标：纯函数从 all-swipes fixture 精确提取 frozen MvuData 深克隆，不接宿主。
- 允许改：新建 `src/ui/gal-regeneration-baseline.ts`；新建 `tests/gal-regeneration-baseline.test.mjs`。
- 禁止改：其它生产文件、既有测试；禁止给 `Mvu.getMvuData` 增加 swipe 参数。
- 开始前基线：全量 487/487（T02 记录）。
- 预期新增测试：`tests/gal-regeneration-baseline.test.mjs`（12 个用例）。
- 停止条件：需要改 MVU schema、request V2 schema 或旧 metadata（未触发）。

### B3-T04 实际 diff

- 新建 `src/ui/gal-regeneration-baseline.ts`（约 80 行）：`readFrozenBaselineV1`（纯函数；开场边界 null → baseline null 不造默认；floor 缺失/message_id 不一致 → floor-not-found；swipes_data 非数组 → malformed；swipe 越界 → swipe-not-found；data 缺失 → data-missing；成功 → structuredClone 深克隆保留全部字段）。
- 新建 `tests/gal-regeneration-baseline.test.mjs`（12 个用例）。

### B3-T04 验证结果

```text
node --test tests/gal-regeneration-baseline.test.mjs → 12/12 PASS
npx tsc --noEmit → exit 0（PASS）
```

设计裁定记录：

- 开场边界（stateMessageIdBeforeGeneration=null）返回 `{ ok:true, baseline:null }`：符合 runbook §4.3"null baseline 仅按 V2 builder 已定义的开场边界处理"，reader 不造默认状态，由调用方（T06 replay）按 V2 builder 开场语义处理。
- 深克隆用 `structuredClone`（node22 / 浏览器均可用），保证"data 被 mutation 时原 fixture 不变"与"不返回共享引用"。
- 增加了 message_id 一致性守卫：floor 视图的 message_id 必须等于冻结 ID，防止调用方传错 floor 造成静默读错基线。

---

## B3-T05：receipt、fingerprint 与漂移检测（已完成）

### B3-T05 阅读回执（每个小任务重新完整阅读）

```text
[B3-T05][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B3-T05][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B3-T05][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B3-T05][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B3-T05][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B3-T05][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B3-T05][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B3-T05][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B3-T05][read] project/gal-character-memory-batch-3-regeneration-runbook.md（全文，重点 §4.4、T05）
[B3-T05][read] src/ui/gal-generate-config.ts（stableStringify 复用）
[B3-T05][read] src/ui/gal-generation-request.ts（computeContextFingerprint）
```

### B3-T05 行为合同

- 目标：纯 fingerprint、receipt schema 构造、drift decision 与 validator；不接宿主。
- 允许改：新建 `src/ui/gal-regeneration-receipt.ts`；新建 `tests/gal-regeneration-fingerprint.test.mjs`。
- 禁止改：其它生产文件、既有测试；禁止记录完整私密正文（只存 fingerprint）。
- 开始前基线：全量 487/487（T02 记录）。
- 预期新增测试：`tests/gal-regeneration-fingerprint.test.mjs`（10 个用例）。
- 停止条件：需要改 MVU schema、request V2 schema 或旧 metadata（未触发）。

### B3-T05 实际 diff

- 新建 `src/ui/gal-regeneration-receipt.ts`（约 150 行）：`fingerprintMvuData`（stableStringify + FNV-1a，覆盖完整 MvuData）；`normalizeSettlementKeys`（排序去重）；`createRegenerationCommitReceiptV1`（三阶段只存 fingerprint）；`decideRegenerationDriftV1`（clean / needs-legacy-replay / post-settlement-drift / receipt-mismatch 四态）；`driftIdentityForTargetV1`。
- 新建 `tests/gal-regeneration-fingerprint.test.mjs`（10 个用例）。

### B3-T05 验证结果

```text
node --test tests/gal-regeneration-fingerprint.test.mjs → 10/10 PASS
npx tsc --noEmit → exit 0（PASS）
```

设计裁定记录（runbook T05 要求"UI-only 非正式字段是否纳入必须有固定裁定"）：

- **裁定：UI-only 非正式字段（display_data/delta_data 等）也纳入 fingerprint（fail-closed）**。理由：本批首版宁可拒绝也不静默丢状态（runbook §4.4/O04"不得静默丢弃后置状态"）；如果后续发现 UI 字段抖动导致误拒，由主验收方 O04 决定是否收窄到 stat_data 正式域。
- receipt-mismatch 是独立四态（request/attempt/message/swipe），与 post-settlement-drift 分离：错配是身份问题（拒绝），不匹配是状态漂移（拒绝），两者都 fail closed。
- 不自动合并差异、不自动补 receipt（needs-legacy-replay 只标记，是否 replay 由调用方/主验收方裁定）。

---

## B3-T06：branch replay engine 的纯壳（已完成）

### B3-T06 阅读回执（每个小任务重新完整阅读）

```text
[B3-T06][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B3-T06][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B3-T06][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B3-T06][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B3-T06][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B3-T06][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B3-T06][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B3-T06][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B3-T06][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/references/core-facts.md（generate/generateRaw/MVU 边界）
[B3-T06][read] project/gal-character-memory-batch-3-regeneration-runbook.md（全文，重点 §4.2、§8.1、T06）
[B3-T06][read] src/ui/visit-turn-commit.ts makeTurn 区域（turn_id 合同，经 explore 摘要）
```

### B3-T06 行为合同

- 目标：重算顺序固定、依赖注入的纯壳协调器；执行 agent 不实现未经核验的 Mvu.parseMessage adapter。
- 允许改：新建 `src/ui/gal-regeneration-replay.ts`；新建 `tests/gal-regeneration-replay.test.mjs`。
- 禁止改：其它生产文件、既有测试；禁止实现真实 model-output parser（留给主验收方 O02）。
- 开始前基线：全量 487/487（T02 记录）。
- 预期新增测试：`tests/gal-regeneration-replay.test.mjs`（10 个用例）。
- 停止条件：需要实现未经核验的 Mvu.parseMessage adapter（未触发——ports 注入，adapter 留给主验收方）。

### B3-T06 实际 diff

- 新建 `src/ui/gal-regeneration-replay.ts`（约 170 行）：`RegenerationReplayPortsV1`（7 个注入 port：applyModelOutput/restoreLocalEventOwnership/applyLocalSettlement/applyPresenceUpdate/reconcileM2Runtime/applyVisitTurns/finalizeLifecycle）；`FrozenOperationV1`（normal-interaction/anomaly-resolution/duel-victory）；`ReplayVisitTurnCommitV1`；`replayRegenerationCandidateV1`（顺序固定 §8.1：clone baseline → parse → ownership → settlement(一次) → presence → reconcile → visit turn → lifecycle settled → receipt → 返回，不写宿主；任一步抛错 → port-failed 无部分输出；visit 失败 → visit-missing/visit-conflict）。
- 新建 `tests/gal-regeneration-replay.test.mjs`（10 个用例）。

### B3-T06 验证结果

```text
node --test tests/gal-regeneration-replay.test.mjs → 10/10 PASS
npx tsc --noEmit → exit 0（PASS）
```

设计裁定记录：

- runbook 建议接口只有 3 个 port（applyModelOutput/applyLocalSettlement/applyPresence），本实现扩展为 7 个以完整覆盖 §8.1 的 8 步顺序（restoreLocalEventOwnership/reconcileM2Runtime/applyVisitTurns/finalizeLifecycle 单列）。所有宿主/解析副作用保持注入，engine 纯壳。
- 文本→VisitTurn 的解析不进入 engine：调用方把解析好的 `ReplayVisitTurnCommitV1` 传入，engine 只保证 `applyVisitTurns` 恰好调用一次、失败 fail closed。
- "frozen visit closed / missing visit" 语义由注入的 `applyVisitTurns` 实现承担（engine 不重复实现 visit 定位逻辑，避免与 character-memory 的 upsert 逻辑分叉）。

---

## B3-T07：swipe append plan 与精确验证器（已完成）

### B3-T07 阅读回执（每个小任务重新完整阅读）

```text
[B3-T07][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B3-T07][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B3-T07][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B3-T07][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B3-T07][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B3-T07][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B3-T07][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B3-T07][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B3-T07][read] project/gal-character-memory-batch-3-regeneration-runbook.md（全文，重点 §7.1–7.4、T07）
[B3-T07][read] src/ui/gal-generation-request.ts buildAttemptMetadata/parseAttemptMetadata（嵌套 extra 语义）
[B3-T07][read] project/api-provenance.md（setChatMessages 四字段写语义、swipe_info.extra 嵌套）
```

### B3-T07 行为合同

- 目标：swipe append plan 构造（§7.2）+ 写前硬门（§7.3 前段 + §7.4 竞态）+ 写后硬门（§7.3 全项）的纯函数实现。
- 允许改：新建 `src/ui/gal-regeneration-swipe.ts`；新建 `tests/gal-regeneration-swipe-plan.test.mjs`。
- 禁止改：其它生产文件、既有测试；禁止写宿主（生产 adapter 是 T09/O01 后）。
- 开始前基线：全量 487/487（T02 记录）。
- 预期新增测试：`tests/gal-regeneration-swipe-plan.test.mjs`（21 个用例）。
- 停止条件：需要改 MVU schema、request V2 schema 或旧 metadata（未触发）。

### B3-T07 实际 diff

- 新建 `src/ui/gal-regeneration-swipe.ts`（约 380 行）：`fingerprintSwipeArraysV1`（四数组+message/swipe id+未知字段稳定指纹）；`captureSwipeArraysSnapshotV1`（§7.1 快照，四数组不一致→malformed、swipe 越界→invalid-source-swipe）；`buildSwipeAppendPlanV1`（§7.2：旧数组逐元素保留、尾部追加、swipes_data[candidate]=候选 MvuData、swipes_info[candidate]={extra: attempt metadata}、swipe_id=candidate）；`verifySwipeWriteBeforeV1`（§7.3 写前重读 fingerprint 硬门 + §7.4 竞态清单：chat/owner、消息总数、最后一楼、source 越界、指纹变化）；`verifySwipeWriteAfterV1`（§7.3 写后硬门：复用 T01 validate 四数组只增 1、旧项逐字节未变、candidate 正文/数据严格相等、candidate info 子集包含（容忍宿主系统字段）、active swipe/text/metadata 等于候选、candidate lifecycle settled、VisitTurn 身份一致）。
- 新建 `tests/gal-regeneration-swipe-plan.test.mjs`（21 个用例）。

### B3-T07 验证结果

```text
node --test tests/gal-regeneration-swipe-plan.test.mjs → 21/21 PASS
npx tsc --noEmit → exit 0（PASS）
```

设计裁定记录：

- 写后验证中 candidate `swipes_info` 采用**子集包含**比较（plan 的键值必须都在，宿主附加 send_date/gen_started/gen_finished 等系统字段容忍）；旧项（0..candidate-1）严格 stableEqual。runbook §7.3"旧 swipe 内容、data、info 逐字节未变"只约束旧项，candidate 的宿主系统字段写时才补，无法预知。
- `buildAttemptMetadata` 输出是 `{ galGenerationAttemptV1: {...} }` 嵌套形状（非平铺），VisitTurn 身份检查按 `extra[ATTEMPT_EXTRA_KEY]` 解析（兼容嵌套，与 parseAttemptMetadata 同一语义）。
- 深比较用 `stableStringify`（key 顺序无关），避免手写 deepEqual 分叉。
- reload 在 candidate_ready/committing/verifying、同 commit 重试属于 T08 coordinator 状态机测试，不在 T07 重复。

---

## B3-T08：可控 host 的 coordinator 骨架（已完成）

### B3-T08 阅读回执（每个小任务重新完整阅读）

```text
[B3-T08][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B3-T08][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B3-T08][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B3-T08][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B3-T08][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B3-T08][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B3-T08][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B3-T08][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B3-T08][read] project/gal-character-memory-batch-3-regeneration-runbook.md（全文，重点 §5.3–5.4、§7.3–7.4、T08）
[B3-T08][read] src/ui/gal-regeneration-swipe.ts（写前/写后硬门）
[B3-T08][read] src/ui/gal-regeneration-replay.ts（replay ports）
[B3-T08][read] src/ui/gal-regeneration-receipt.ts（drift decision）
```

### B3-T08 行为合同

- 目标：状态机骨架 + commit fence + reload 恢复，全部走 fake ports；production swipe writer / MVU parser adapter / setChatMessages 四数组写入与真实刷新时序**未接线**。
- 允许改：新建 `src/ui/gal-regeneration-coordinator.ts`；新建 `tests/gal-regeneration-coordinator.test.mjs`。
- 禁止改：其它生产文件、既有测试；禁止实现 production writer、禁止运行 Probe C、禁止接真实宿主。
- 开始前基线：全量 487/487（T02 记录）。
- 预期新增测试：`tests/gal-regeneration-coordinator.test.mjs`（19 个用例）。
- 停止条件：任何需要接生产 writer / 真实宿主才能继续的发现（未触发——ports 注入，writer 留给 O01/O02）。

### B3-T08 实际 diff

- 新建 `src/ui/gal-regeneration-coordinator.ts`（约 430 行）：`GalRegenerationCoordinatorV1`（状态机 idle→locating→generating_candidate→candidate_ready→rebuilding_state→committing_swipe→verifying→settled；失败→failed_recoverable/conflict_manual；stopping）；commit fence（settled 同 commitKey 直接返回已有结果）；reload 恢复（candidate_ready/committing_swipe 只重试提交不再次调模型；verifying 只重读验证不再写）；写前硬门用定位时（T03）快照指纹（`state.expectedBeforeFingerprint`）比较，写前重读当前 chat/owner/消息视图（§7.3/§7.4）；写失败缓存 candidate_ready（retryable）；`RegenerationHostPortsV1` 全注入。
- 新建 `tests/gal-regeneration-coordinator.test.mjs`（19 个用例）：完整成功、同 commit 重试、生成失败不写、stop、切 chat、新增楼层、切 source swipe（fingerprint）、写后复读损坏、active metadata 错、MVU parser 抛错、settlement 抛错、写失败缓存重试、reload 三态、drift 冲突、locating 失败。

### B3-T08 验证结果

```text
node --test tests/gal-regeneration-coordinator.test.mjs → 19/19 PASS
npx tsc --noEmit → exit 0（PASS）
npm test（全量回归）→ 574/574 PASS（+87 = T01 21 + T02 9 + T03 15 + T04 12 + T05 10 + T06 10 + T07 21 + T08 19）
```

设计裁定记录：

- 写前硬门的 fingerprint 必须来自**定位时（T03）快照**，而不是写前重读快照；否则"生成期间切 source swipe"永远检测不到（写前重读与快照同源）。`state.expectedBeforeFingerprint = target.arraysFingerprint`。
- reload 恢复按 stored.phase 分派：candidate_ready/committing_swipe → 只重试提交（commitSwipe 重新 snapshot+build plan，不再调 generateCandidate）；verifying → 只重读验证，writer 不再调用（writer 最多一次）。
- `finishSettled` 增加 resumed 标志，reload 路径返回 resumed:true（首版实现遗漏，测试捕获后修复）。
- drift needs-legacy-replay → conflict_manual + legacy-replay-mismatch（本批首版不自动补 receipt，等 O02/O03 裁定）。

### B3-T08 完成声明（runbook 要求的 T08 结束声明）

```text
纯逻辑骨架完成；production Helper candidate transport、MVU parser adapter、
setChatMessages 四数组写入与真实刷新时序尚未接线。第三批未完成，等待 B3-O01。
```

---

## 主验收方返修与 O01～O04 裁定（2026-08-09）

### 返修摘要

- 修正 coordinator 漂移身份：始终用 source attempt/source swipe，不再拿新 attempt 或 `candidate-1` 猜源身份。
- attempt metadata 改为 `buildAttemptMetadata` 正式嵌套形状；write-after 解析正式 metadata，不再比较错误的平铺对象。
- `candidate_ready` 成为真实恢复断点：只持久化候选文本也能从 frozen baseline 本地重放，绝不再次 generate。
- `committing_swipe` 增加 crash fence：先辨认写前 fingerprint 或精确已写 candidate；writer 成功但 verifying 未持久化时，reload 不重复 append。
- provider reject 与 stop-late resolve 均收敛到 `failed_recoverable`，迟到文本不写。
- 写后增加 chat/owner、消息总数、user 楼层数、最后楼层、active MvuData、正式 lifecycle identity 复读。
- V2 target parser 改为严格验证 revision、角色/visit map、状态楼层配对、attemptSeq、日期与身份，不再把 malformed 输入强制转换成合法值。
- VisitTurn 改为本地结算/reconcile 后按最终游戏时钟构造并回传实际 upsert 结果；避免结算推进时间后仍记旧日期。
- settled sessionStorage 不再永久锁死后续显式重生成；下一次点击由 locator 扫描 swipe metadata 创建下一 attempt。

### O01～O04

- O01：目标 Helper 4.8.18 静态源码存在 candidate-only `generate(config)` 调用链和 `stopGenerationById(generation_id)`；本轮不运行探针，因此 transport 仅显式 feature flag 启用。
- O02：接入声明为 `Mvu.parseMessage(message, old_data)` 的内存解析；输入 frozen baseline clone，reject 不写。真实宿主副作用未声称已验收。
- O03：接入 `setChatMessages([{message_id, swipe_id, swipes, swipes_data, swipes_info}], {refresh:'affected'})`；项目侧执行写前 CAS、写后 all-swipes/active/MVU 三视图复读，不手工 emit，不直接 mutate context.chat。
- O04：新 V2 send 与 regenerate 的 MvuData 均内嵌 receipt；receipt 自身不参与 hash。旧 V2 无 receipt、receipt 身份错或 post-settlement drift 一律 fail closed，不静默回档。

## B3-T09～T11：生产接线、恢复、外部 swipe 收敛（已完成代码逻辑）

- `bridge.regenerateLatest()` 在显式 `helper-generate-swipe` transport 下调用 `GalRegenerationCoordinatorV1`；默认仍为 `native-regenerate`，且事务路径启动后不自动降级。
- send/regenerate 共用 `buildGalGenerateConfig`；候选解析从 frozen `swipes_data[stateSwipe]` 开始，顺序为 parser → ownership → 原本地结算 → presence → M2 reconcile → VisitTurn upsert → lifecycle → receipt。
- coordinator state 按 `chatId + ownerCharacterId` 写入 sessionStorage；reload 支持 candidate_ready/committing/verifying，切 chat 后旧状态不会写入新 chat。
- `MESSAGE_SWIPED` / `MESSAGE_UPDATED` 仍仅触发 refresh；只有既有 pending send settlement 才允许 variable listener 调结算器。单纯左右切换不调用 generate/finalizer/writer。
- diagnostics 暴露真实 `regenerationTransport` 与默认关闭原因。

## B3-T12：代码逻辑验收结果

本轮遵守所有者要求：**未运行 Probe、未做真实宿主时机演示、未打包、未发布**。

最终命令与数字见本日志末尾“最终封账验证”；代码逻辑覆盖包括：指定 swipe、无重复楼层守卫、frozen baseline 重算、receipt/drift、provider reject、停止迟到围栏、candidate_ready 真断点、writer 后崩溃恢复、重复显式重生成、VisitTurn upsert 与正式 lifecycle。

### 最终封账验证

```text
focused（12 个第三批/相邻回归文件）→ 181/181 PASS
npm test → 583/583 PASS
npx tsc --noEmit → PASS（exit 0）
git diff --check → PASS（exit 0；仅既有 LF/CRLF 提示）
```

封账结论：**第三批代码逻辑完成**。默认 transport 为 `native-regenerate`；显式事务 transport 为 `helper-generate-swipe`。没有执行真实宿主探针、时机演示、打包或发布，因此不得把本结论改写为“真实宿主运行验收通过”。
