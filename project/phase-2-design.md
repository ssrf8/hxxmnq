# Phase 2 改造设计 —— send 迁移到受管 generate

> 依据 `project/gal-generate-transaction-refactor-plan.md` Phase 2（§2.1–2.7 + 自动化）。
> 准入已满足：Phase 0.3 身份门禁 PASS、Probe A PASS（generation_id 原样贯穿）、Probe B PASS（createChatMessages+data 触发 MVU）、Phase 1 请求构造对比 PASS。
> Probe C = PASS_WITH_FALLBACK（不影响 send 迁移；Phase 5 regenerate 走 native-regenerate）。

## 0. 决策前提

- **渐进改造 `MessageTransactionCoordinator`**（计划 §2.1），不新建并行协调器。
- **`generationTransport: 'native-trigger' | 'helper-generate'`，默认 `native-trigger`**（计划 §2.7），只有 helper-generate 实机验收通过才切默认。
- 每次增量保持 native-trigger 可运行、可回滚（回滚只切 transport，不回滚 schema）。

## 1. 现状基线（message-transaction.ts）

- `MessageTransactionSnapshot`：`{ transactionId, chatId, kind, phase, userMessageCreated, assistantResponded }`
- `TransactionHost`：currentChatId / listMessages / isGenerationActive / assistantResponseTimeoutMs / createUserMessage / prepareGeneration(450ms) / triggerGeneration(/trigger await=true) / continueGeneration
- submit 流程：reconcile → phase 检查 → findUserMessage(gensokyoTransactionId) → createUserMessage(refresh:'none') → prepareGeneration → triggerGeneration → waitForAssistant(轮询 100ms, 上限 120s) → reconcile → settlement（bridge 的 waitForVariableStage）
- bridge 侧已存在：`variableUpdateEpoch`、`waitForVariableStage()`、`SettlementAttemptCoordinator`、`hostGenerationActive` 对账

## 2. 目标差距（计划 vs 现状）

| 计划要求 | 现状 | 增量 |
|---|---|---|
| 11 态 GenerationPhase 状态机 | 5 态（idle/submitting_user/generating/settled/failed） | A |
| request/attempt/generation/commit 四级 ID | 仅 transactionId | A |
| initial chat identity（ownerCharacterId+chatId+epoch） | 仅 chatId | A |
| stream 订阅按 generationId 过滤 + finally 清理 | 无（依赖 triggerSlash 轮询） | B |
| generate() Promise 为唯一权威 | 无 | B |
| MVU baseline epoch + 绑定实际助手楼层 ID | 全局 waitForVariableStage | C |
| 幂等 commit（commitKey 反查） | 无 | A+D |
| 失败恢复表 8 类 | 部分（retryLastTransaction） | D |
| trace 结构化 | 无 | A（挂 snapshot） |
| 15 类 fake 测试 | 无 | E |

## 3. 增量步骤

### 增量 A：ID 与快照扩展（零行为变化，纯结构）
- `MessageTransactionSnapshot` 增：`requestId/attemptId/generationId/commitKey/ownerCharacterId/chatEpoch/mvuEpochBefore`（全部可选，旧路径不填）
- `SubmitRequest` 增 `request?: GalGenerationRequest`（bridge 已创建并写 metadata，直接传入）
- submit 时为 request 创建 attempt（`createGalGenerationAttempt(request,'send',request.attemptSeq)`），快照记录四级 ID 与初始 chat identity（chatEpoch 来自 bridge 会话 epoch、mvuEpochBefore 来自 variableUpdateEpoch）
- 玩家楼层反查：保留 gensokyoTransactionId 兼容，新增 `resolvePlayerMessageByMetadata` 一致性校验——本次新创建楼层按 requestId 反查，找到 0 条（metadata 未写入）/多条（歧义）/与 gensokyoTransactionId 楼层不一致 → phase=failed，明确错误码
- 新增纯函数 `buildAttemptMetadata/parseAttemptMetadata/resolveAssistantMessageByCommitKey`（`gal-generation-attempt.v1` 落 assistant extra；commitKey 幂等反查 0/多条失败）
- `requestPhase`（11 态 trace 字段）延后到增量 C 状态机统一时引入——增量 A 保持 5 态零行为变化

### 增量 B：transport 开关 + helper-generate 路径
- `TransactionHost` 增 `generationTransport`；bridge 的 `triggerGeneration` 分支：
  - `native-trigger`：现状 `/trigger await=true`（原样保留）
  - `helper-generate`：`runHelperGenerate`——generate() 调用（`generation_id` 传 attempt.generationId；`user_input`=modelUserInput 唯一；`should_silence:true`；`overrides.chat_history.prompts`=buildChatHistoryForGenerate 排除本次玩家楼层，修正旧路径「历史+user_input 重复」缺陷）；事件（GENERATION_STARTED/STREAM_*/GENERATION_ENDED）按 generationId 过滤仅 trace（Probe A 实测签名），重复 ended 只记一次；Promise resolve 才进入 assistant 落楼（chat identity 复核 → 空结果不落楼 → commitKey 幂等反查 0/多条 → createChatMessages refresh:'affected' + attempt metadata + data 变量域）；listener finally 清理
- 默认 `native-trigger`；宿主 `__GAL_GENERATION_TRANSPORT__==='helper-generate'` 覆盖（验收/回滚不碰代码）；diagnostics 输出当前 transport（host+preview）
- 已实现并记录日志（遗留：retry attempt 递增/stream UI 投影/tool-call 细化 → 增量 D）

### 增量 C：MVU 精确等待（已实现并记录）
- `waitForVariableStage(assistantMessageId?)` 绑定实际助手楼层（4 处 sendUserMessage 系 + retry 1 处传参）；目标楼层 getMvuData.stat_data 非空为提前就绪信号，缺失回退通用信号
- 保留：2.5s 分析启动兼容窗口（注释原因）、90s 总上限、VARIABLE_UPDATE_ENDED epoch 聚合（Helper 事件无楼层参数，实机事实）、isDuringExtraAnalysis
- timeout 语义：回复已保存、变量结算未完成 → 明确恢复态，不再次生成文本

### 增量 D：输出校验与失败恢复（已实现并记录）
- 抽取 `buildAttemptFromSnapshot`/`writeHelperAssistantMessage`（幂等 commitKey 反查）
- 输出校验（§2.4 部分）：tool-call 结果明确失败不落楼；空/空白不落空楼
- 失败恢复（§2.6）：assistant 落楼失败 → pendingHelperResult 显式重试落楼（不再调模型）；retry attemptSeq 递增（新 attemptId/generationId）；玩家楼层失败/generate 失败/MVU timeout settlement-only/settlement 重跑/chat 切换中止 均核对符合
- stream 投影：CustomEvent `gensokyo-garden:generation-stream` → app 更新 gg-scene-text（Promise 权威，展示层）
- 用户 stop 的按 ID 停止 → Phase 3（增量 D 未接，记录）

### 增量 E：Phase 2 自动化（已实现并记录）
- fake（13/13）：正常非流式、双击提交、provider reject、模型失败 retry、中途切聊天、settlement 重跑、stop retry continue、ended 顺序、助手楼层幂等
- 合同（12/12）：generationId 过滤、tool-call/空结果、pendingHelperResult、listener 清理、90s 上限、stream 投影、attemptSeq 递增、commitKey 幂等、chat identity 复核、历史排除
- 3 项部分覆盖（bridge 事件/超时内部无法 fake，实机验收补全）：MVU 其他楼层事件、MVU timeout、listener 全流程

## 4. 候选构建与实机验收（Phase 2 门禁）

1. src 改造完成后 `npm run check:ui`（tsc）+ 全量测试绿（除既有基线红）
2. **本轮候选代码构建**：build-ui.mjs 构建含 Phase 2 改动的 UI bundle；探针 manifest（:8799）指向该构建产物；loader 校验 SHA-256 + probeSessionId/bundleVersion 读回一致（沿用 Phase 0.3 身份门禁流程）
3. 实机验收（探针环境 + 测试聊天）：helper-generate 发送全链路（发送→监听→落楼→MVU→settlement）、native-trigger 并行对照、stop/重试/切聊天边界
4. 验收通过才把默认 transport 切 helper-generate；日志记录 transport 与每步证据
5. 既有基线红测试（ui-contract.test.mjs:3607 finally 正则）在 Phase 2 改 submitGalMessage 时同步修复

## 4b. 实机验收结果（2026-08-08，PASS）

- 方式：esbuild 单独构建 src/ui/bridge.ts → :8799 → 游戏 iframe realm import → createHostBridge + sendUserMessage（3 次真实模型调用；transport 注入 __GAL_GENERATION_TRANSPORT__）
- PASS：桥初始化（mvuReady/helper-generate）；helper-generate 全链路（generation_id 事件贯穿、Promise resolve、assistant 落楼带 attempt metadata + MVU 五字段变量域 + 20 键状态树、dupCount=1 无双写、玩家楼层 metadata 完整、MVU 管线触发、phase=settled）
- 修复（验收驱动）：① 增量 B triggerGeneration 分支在 multi_edit 回滚中丢失（实机发现）→ 重新应用；② writeHelperAssistantMessage data 用 latest.state 构造（ST 楼层 data 无 stat_data）
- 实机事实：should_silence:true 抑制 Helper generate 落楼（verify2 仅 1 条我们写的）；ST createChatMessages 的 data 落 variables[swipe_id]（m.data 顶层无 stat_data）；Mvu 需完整初始化
- 遗留：commitKey 重复 requestId（Phase 3 修）；MVU 初始化依赖 loader（探针手动加载不初始化）；默认 transport 保持 native-trigger（切换与 Phase 3 一并处理）

## 5. 范围与红线

- 本轮不迁移提示词注入位置（modelUserInput 保持 withGardenNarrativeContract 语义）；regenerate 走 Phase 5 native-regenerate（Probe C 结论）
- 不手工 emit Tavern 事件；不静默兜底 stopAllGeneration；不复制完整 stat_data/完整 prompt 到 metadata
- 每次写聊天前后复核 chat identity；0/多条反查一律失败不猜 ID

## 5. Phase 3 停止/恢复合同（2026-08-08 实现，未实机验收）

### 权威事实（Helper 4.8.18 dist：DG/LG/IG/tG/jG）
- `stopGenerationById(id)`：true=abort 已发（Promise 确定 reject + GENERATION_STOPPED(id) 事件）；false=无此生成（已结束/从未注册/控制器已清理）→ 计划 §3.1 的「false 不直接 stopped」落地为：已结束则对账，仍 generating 不误标
- `should_silence:true → bindToStopButton:false`：helper 生成不绑 ST 停止按钮，只能按 ID 停止（宿主 stopGeneration 不影响）
- docs 无停止专节（02 §6.5 证实无关）→ 计划为唯一合同

### 实现要点
- coordinator：markStopped(reason) → stopping；markStopReconciled() → failed（可从头重试）；retryFromScratch(request)（同 requestId 新 attempt 三件套）
- bridge：stopGeneration helper 按 ID / native 宿主+即时对账；runHelperGenerate 停止处理（STOPPED 监听 / abort reject 吞 / 迟到 resolve 不落楼 / finally 对账）；retryLastTransaction helper→retryFromScratch
- reconcile 与三处尾部排除 stopping/failed（停止语义不被迟到楼层/覆盖）

### 状态
- 283 pass / 1 fail（唯一=既有基线红）；tsc 0
- 未实机验收停止链路（待候选 bundle 验收：stopGenerationById 真调、GENERATION_STOPPED、UI 按钮 phase 派生、stop 后从头重试）

## 5b. Phase 3 实机验收结果（2026-08-08，PASS）

- 验收方式：探针 :8799 提供 src 构建 bridge.js；游戏 iframe import → createHostBridge（transport=helper-generate）→ 单实例 send→stop→retry
- PASS：stopGenerationById 真调（true）；generating→stopping→failed 对账 + stopReason='user-stop'；停止后迟到文本不落楼；从头重试（同 requestId 新 attempt/generationId、玩家楼层不复制、新 assistant 落楼、settled）
- 实机修复 3 处：① stopGenerationById 双源（宿主 TavernHelper）② GENERATION_STOPPED fallback 字面量 'generation_stopped'（iframe_events 缺键）③ stop 竞态短重试（CG 注册窗口 6×100ms）
- 遗留：attemptSeq 预递增跳号（语义正确）；探针多实例事务状态隔离（验收方法限制，真实 UI 单实例）

## 6. Phase 4 重载恢复（2026-08-08 实现，未实机验收）

### 合同（计划 §4.2 + skill/docs 协调）
- analyzeChatRestore 纯函数：玩家楼层 request metadata + ownerCharacterId/chatId/requestId 绑定 → 最新 → 精确 commit → none/incomplete/confirmed/conflict
- restoreFromChat：incomplete→failed+recovery（禁止重发）、conflict→failed+recovery（人工确认）、confirmed→settled（MVU data 随落楼写入即最终状态）、none 不动
- 挂载同步恢复；app retry 按钮排除 recovery；retry/retryFromScratch recovery 守卫最前

### §4.3 旧机制评估
- 450ms（Luker 遗留）保留（无日志证明）；空楼层轮询已删；DOM 判断/native ENDED/轮询均保留并标注用途

### 状态
- 10/10 新测试；全量 294 pass / 1 fail（唯一=既有基线红）；tsc 0
- 未实机验收（reload 恢复态重建）

## 6b. Phase 4 实机验收结果（2026-08-08，PASS + 3 处根因修复）

- 验收：confirmed（verify6 settled+标识）✅ / incomplete（手动构造楼层 failed+禁止重发）✅
- 根因修复（ST 1.18 安装源/运行时）：
  ① 内存 chat 楼层无 message_id 字段（楼层号=数组索引，Helper 视图一致——回退误改）
  ② assistant 楼层 extra 嵌套（metadata 在 extra.extra）→ flattenMessageExtra + parse 兼容
  ③ Helper range：-1=单条、'0--1'=全部 → readRawMessages 补 '0--1'
  ④ 宿主楼层无 role 字段（is_user/is_system 派生）；activeMessages 宿主优先
- 全量 294/1（唯一=基线红）；tsc 0

## 7. Phase 5 重新生成迁移（2026-08-08 完成，native-regenerate 分支）

- 合同：Probe C 未 PASS → 保留 /regenerate await=true；regenerationTransport='native-regenerate'；只复用统一请求定位/日志/chat identity/settlement 保护
- 实现：types + diagnostics 加 regenerationTransport；regenerateLatest 加 §5.2 定位（attempt metadata → 配对玩家 → chat identity；legacy 兼容）
- 基线红修复：ui-contract:3607 CRLF 正则（`\r?\n` 兼容）→ **全量 296 pass / 0 fail（首次零失败）**
- 阻塞原因（helper-generate-swipe 未启用）：四字段原子性 + MVU 单次无实机证据；后续先开发开关 → 全 swipe/MVU 实机 → 再设默认
