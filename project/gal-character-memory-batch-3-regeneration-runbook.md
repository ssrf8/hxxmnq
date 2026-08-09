# 幻想乡物语 GAL 角色记忆第三批：重生成同构实施 Runbook

> 文档性质：第三批专用实施计划；给不擅长自行补全设计的执行 agent 使用
> 编写日期：2026-08-09
> 本批主题：重生成复用 V2 冻结请求、指定 assistant swipe 提交、从原基线重算、记忆 upsert、禁止重复楼层与重复 MVU 结算
> 风险等级：最高；必须独立实施、独立返修、独立验收
> 当前状态：**第三批代码逻辑已完成；事务 transport 默认关闭，未做真实宿主时序/探针验收**
> 重要说明：本文中的“第三批”按所有者最新顺序定义；它取代第二批 runbook 末尾“第三批先做关系候选、第四批做 regenerate”的旧建议顺序。关系候选仍未完成，只是顺延，不得偷偷并入本批。

---

## 0. 给执行 agent 的第一句话

你不是来“把 `/regenerate` 换个函数名”的。

你要建立的是一条可以证明以下五件事同时成立的事务链：

1. 重生成和普通发送使用同一份 V2 冻结请求及同一套 generate 配置构造规则；
2. 新结果只进入指定 assistant 楼层的新 swipe，不新增玩家楼层，不留下临时 assistant 楼层；
3. 新 swipe 的状态从原请求生成前基线重新计算，不在旧回复已经结算后的状态上继续叠加；
4. 同一个 `requestId:characterId` 只 upsert 同一条 VisitTurn，不追加重复记忆；
5. MVU、presence、本地事件、奖励、消费、时间推进和 settled ID 对新 swipe 只结算一次。

任何一条无法通过代码、执行级测试和精确复读证明，第三批都不能写“完成”。

---

## 1. 批次边界

### 1.1 本批必须完成

- V2 重生成目标定位；
- 从玩家楼层恢复原始 `GalGenerationRequestV2`；
- 重生成沿用原 `requestId`，创建新的 regenerate attempt；
- 普通 send 与 regenerate 共用一个纯 generate-config builder；
- 冻结目标 assistant message ID、源 swipe ID、候选 swipe ID 和四数组指纹；
- 从 `stateMessageIdBeforeGeneration + stateSwipeIdBeforeGeneration` 读取原请求基线；
- 从原基线执行“新模型输出解析 → 本地 ownership/settlement/presence → VisitTurn upsert → lifecycle”完整重算；
- 构造指定 assistant 楼层的新 swipe 候选；
- 保留旧 swipe，不复制玩家楼层，不创建第二个正式 assistant 楼层；
- 新 swipe 写前、写后精确验证；
- reload 后可识别 incomplete/pending/settled regenerate attempt；
- 左右切换已有 swipe 时只重读展示和该 swipe 数据，不再次执行 settlement；
- 新增独立测试与实施日志；
- 单独申请第三批代码逻辑验收。

### 1.2 本批禁止顺手做

- 关系记忆候选的模型输出协议；
- 12 条关系记忆的生产写入；
- 提示词注入位置专项迁移；
- database-assisted / standalone 双版本；
- R2、UI 测试通道、打包、checkpoint、PNG/JSON 卡产物；
- 历史 assistant 后还有后续楼层时的“中途改写历史”；
- 删除旧 swipe；
- 删除或裁剪后续聊天楼层；
- 分支/检查点自动创建；
- 群聊 regenerate；
- same-floor/C8 数据库兼容；
- 重新设计 MVU schema；
- 修改正式发布名称、版本或 manifest；
- 运行旧包、旧 checkpoint 或旧 R2 UI 冒充新实现证据；
- 修改、提交或打包 `reasonix`。

### 1.3 首版支持范围

首版只允许：

- 当前聊天最后一条真实消息是 assistant；
- 目标 assistant 来自本卡 V2 request；
- 玩家楼层与目标 assistant 可以按 metadata 唯一配对；
- 目标是当前激活 swipe；
- 新候选只追加为该 assistant 的最后一个 swipe；
- 目标 assistant 后面没有任何 user/assistant/system 楼层；
- 当前不是生成、停止、结算、卡片操作或另一重生成事务中；
- 单聊；
- 没有无法解释的“回复结算后又在同一楼层发生的本地状态漂移”。

历史楼层 regenerate、插入到 swipe 中间、覆盖已有 swipe、删旧 swipe、跨分支改写一律不做。

---

## 2. 固定阅读门禁

### 2.1 每一个小任务开始前都必须重新完整阅读

执行 agent 不得写“前面已经读过”。每个任务的实施日志都必须逐行写阅读回执：

```text
[B3-Txx][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B3-Txx][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B3-Txx][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B3-Txx][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B3-Txx][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B3-Txx][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B3-Txx][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B3-Txx][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B3-Txx][read] project/gal-character-memory-batch-3-regeneration-runbook.md（全文）
```

### 2.2 每个任务按需重新阅读的项目文件

至少包括：

- `project/gal-character-visit-memory-and-synthetic-history-plan.md` §9.4、§9.5、Phase 6；
- `project/gal-generate-transaction-refactor-plan.md` Phase 5；
- `project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md` §7、§8、§10；
- `project/gal-character-memory-batch-2-implementation-log.md` 最终返修段；
- `project/api-provenance.md` Probe C 与 Helper 4.8.18 暴露清单；
- `docs/02-楼层与接口与请求控制.md` §5、§6；
- `docs/03-正文识别与变量更新.md` §7、§8；
- `docs/07-监听层.md`；
- `docs/08-历史上下文.md`；
- `docs/10-完整循环轮.md`；
- 任务涉及的源文件全文和对应测试全文。

### 2.3 阅读回执不等于完成

复制路径不算证据。实施日志还必须写：

- 本任务的行为合同；
- 允许改哪些文件；
- 禁止改哪些文件；
- 开始前基线；
- 预期新增测试；
- 停止条件；
- 实际 diff；
- 验证结果。

---

## 3. 已知事实、待裁定事实与禁止猜测

### 3.1 已有静态/项目证据

目标身份仍按项目记录：SillyTavern 1.18.0 + Tavern Helper / JS-Slash-Runner 4.8.18。

已有证据：

- `generate(config)` 支持 `generation_id`，项目 send 已按 ID 过滤事件；
- `stopGenerationById(generationId)` 已用于 V2 stop；
- `getChatMessages(messageId, { include_swipes:true })` 返回：
  - `swipe_id`；
  - `swipes[]`；
  - `swipes_data[]`；
  - `swipes_info[]`；
- `setChatMessages()` 的声明允许提交上述字段；
- `Mvu.getMvuData({type:'message', message_id})` 与 `replaceMvuData` 只声明 message floor，没有经过项目验证的 `swipe_id` 参数；
- 第二批已经建立 exact assistant message/swipe 守卫、VisitTurn 精确 upsert 与 lifecycle 精确复读；
- Probe C 尚未证明“四数组更新 + active swipe + MVU 对新页单次执行”的运行时原子性；
- 当前生产 regenerate 仍是 `/regenerate await=true`，并从旧结算后的 current state 恢复本地所有权，不符合本批最终同构合同。

### 3.2 必须由主验收方收口的困难事实

以下项目不要让执行 agent 自行猜：

1. `generate()` 在目标真实运行时是否会自动创建 assistant 楼层，以及能否用于“只返回候选文本、不落新楼层”；
2. `setChatMessages()` 同时写四数组和 `swipe_id` 时，目标版本是否能保持一致且刷新正确；
3. 新 swipe 的 `swipes_data` 是否会被 MVU 再处理一次、处理零次或处理多次；
4. `Mvu.parseMessage` 在目标 realm 中是否可作为无宿主写入副作用的纯候选计算器，以及准确签名；
5. 写入新 swipe 时 `swipes_info[index].extra` 与 active message `extra` 的精确映射；
6. 候选生成期间如果宿主偷偷新增楼层，是否存在安全且不会触发第二次 MVU 的回收方式。

执行 agent 做到相关任务时必须停在 adapter 接口，不得发明参数、手工 emit 事件、直接改 `context.chat`，也不得用 `/addswipe`、`/delswipe` 或第三方 LALib 绕开项目依赖合同。

### 3.3 允许的最终裁定

主验收方收口时只能三选一：

- `helper-generate-swipe-ready`：静态合同、执行测试和必要宿主证据全部闭合；
- `feature-flag-only`：代码存在但默认关闭，只在明确测试开关下使用；
- `blocked-native-only`：无法证明安全，生产继续显示 `native-regenerate`，第三批不得封账。

不得把 `blocked-native-only` 写成“重生成同构完成”。

---

## 4. 核心语义：这里的“回滚”到底是什么

### 4.1 禁止做差量反向撤销

禁止：

```text
当前状态 - 猜测旧回复造成的金币 - 猜测旧回复推进的时间 + 新回复变化
```

旧回复可能影响 presence、事件 settled ID、物品消费、时间、会话轮数、VisitTurn 等多个字段。反向扣减无法完整证明，会覆盖之后的合法变化。

### 4.2 正确语义：从原请求前基线重放

新 swipe 的候选状态必须这样产生：

```text
原请求冻结的 MvuData 基线
→ 用新模型输出执行同一 MVU 解析规则
→ 用原玩家动作/系统操作执行同一本地 settlement 规则
→ 恢复代码所有权字段
→ presence reconcile
→ VisitTurn 按同 turn_id upsert
→ 写入新 attempt lifecycle settled
→ 得到新 swipe 的完整 MvuData
```

旧 swipe 的文本和 data 保持原样。切回旧 swipe 时读取旧分支；切到新 swipe 时读取新分支。

所以“回滚旧结算”不是破坏旧 swipe，而是**新分支不继承旧回复结果，从生成前基线重新算一次**。

### 4.3 基线身份

基线由原 V2 request 冻结：

- `stateMessageIdBeforeGeneration`；
- `stateSwipeIdBeforeGeneration`；
- `chatId`；
- `ownerCharacterId`；
- `contextFingerprint`；
- `syntheticHistoryHash`；
- `requestId`。

读取规则：

1. 精确读取 frozen message floor；
2. 用 `include_swipes:true` 找 frozen `swipes_data[stateSwipeIdBeforeGeneration]`；
3. 数组越界、data 缺失、message 不存在、chat/owner 变化立即失败；
4. 不得用“最近一个有 stat_data 的 assistant”替代；
5. 不得用目标 assistant 当前 active data 替代；
6. 不得对 `Mvu.getMvuData` 发明 `swipe_id` 参数；
7. 若旧楼只支持 active-page 读取，只有 active swipe 恰好等于 frozen swipe 时才能使用，否则停止。

### 4.4 同楼层后置本地操作漂移

目标 assistant 结算后，玩家可能在没有新增聊天楼层的情况下执行购买、卡片、测试工具等本地操作，这些操作可能继续写在当前 assistant swipe 的 data 中。

如果直接从生成前基线重放，会把这些后置合法操作从新 swipe 中抹掉。

因此必须引入 `RegenerationCommitReceipt` 或等价收据：

```ts
interface RegenerationCommitReceiptV1 {
  schema: 'gal-regeneration-commit-receipt.v1';
  requestId: string;
  attemptId: string;
  commitKey: string;
  assistantMessageId: number;
  assistantSwipeId: number;
  baselineDataFingerprint: string;
  modelAppliedDataFingerprint: string;
  finalizedDataFingerprint: string;
  settlementKeys: string[];
}
```

用途：

- 当前 active swipe 的正式状态 fingerprint 与原 final receipt 一致：允许重生成；
- 不一致但差异全部属于明确可重放的后置本地操作：以后可设计 rebase，本批首版不做；
- 不一致且无法解释：拒绝重生成，错误码 `post-settlement-drift`；
- 旧 V2 swipe 没有 receipt：尝试用同一 replay engine 重算旧输出；只有结果与当前 data 精确一致才补 receipt 并继续，否则 `legacy-replay-mismatch`。

执行 agent 只负责纯 fingerprint、receipt schema、验证器和 fixture。旧数据补收据的生产接线由主验收方收口。

---

## 5. 身份模型与状态机

### 5.1 重生成目标

建议纯类型：

```ts
interface GalRegenerationTargetV1 {
  schema: 'gal-regeneration-target.v1';
  chatId: string;
  ownerCharacterId: string;
  requestId: string;
  playerMessageId: number;
  assistantMessageId: number;
  sourceSwipeId: number;
  candidateSwipeId: number;
  sourceAttemptId: string;
  sourceCommitKey: string;
  arraysFingerprint: string;
  originalRequest: GalGenerationRequestV2;
}
```

`candidateSwipeId` 首版只能等于 `swipes.length`。不得覆盖已有下标。

### 5.2 attempt 身份

- `requestId`：沿用原逻辑请求；
- `attemptSeq`：扫描目标 assistant 的全部 `swipes_info` 中属于同 request 的合法 attempt，取最大序号 + 1；
- `attemptId`：`${requestId}:attempt-${attemptSeq}`；
- `generationId`：新值；
- `commitKey`：由 requestId + attemptId 确定；
- `mode`：`regenerate`；
- player floor：沿用，不新建；
- assistant message ID：沿用；
- assistant swipe ID：新 candidate swipe ID。

不得仅使用玩家楼层原始 `attemptSeq`。第二次、第三次重生成后它早已过期。

### 5.3 状态机

建议独立状态，不要继续用一个 `regenerationPhase` 三值字符串糊住全部恢复语义：

```text
idle
→ locating
→ generating_candidate
→ candidate_ready
→ rebuilding_state
→ committing_swipe
→ verifying
→ settled

任意阶段 → failed_recoverable
生成阶段 → stopping → failed_recoverable
身份/基线/数组冲突 → conflict_manual
```

每个阶段必须有：

- 进入条件；
- 持久/内存证据；
- 允许按钮；
- 禁止按钮；
- reload 后的恢复策略；
- 失败是否可以复用候选文本；
- 是否允许再次调用模型。

### 5.4 commit fence

一次 regenerate attempt 只能有一个 commitKey。以下所有动作都要按 commitKey 幂等：

- 候选文本缓存；
- 新 swipe 追加；
- candidate data 写入；
- VisitTurn upsert；
- lifecycle settled；
- receipt 写入；
- reload recovery。

同 commitKey 已完成时返回已有结果，不再生成、不再追加 swipe、不再结算。

---

## 6. 统一请求构造合同

### 6.1 “复用同一请求构造器”的准确含义

不是重新读取当前状态再调用 `buildGalGenerationRequestV2()` 创建另一个 request。

正确做法：

1. 普通 send 首次创建 `GalGenerationRequestV2`；
2. 玩家楼层持久化完整 V2 metadata；
3. regenerate 从玩家楼层恢复原 V2 request；
4. regenerate 只推进 attempt，不改变 request 冻结字段；
5. send 与 regenerate 都调用同一个纯 `buildGalGenerateConfig(request, attempt)`；
6. builder 输出 generate config 和稳定 fingerprint，不读宿主、不写楼层。

建议：

```ts
interface BuiltGalGenerateConfig {
  config: {
    generation_id: string;
    user_input: string;
    should_stream: false;
    should_silence: true;
    overrides: {
      chat_history: {
        prompts: SyntheticHistoryMessage[];
        with_depth_entries: false;
      };
    };
  };
  configFingerprint: string;
}
```

### 6.2 必须逐字节保持的字段

- `visibleUserText`；
- `modelUserInput`；
- `syntheticHistory`；
- `syntheticHistoryHash`；
- `contextFingerprint`；
- `promptRevision`；
- `memoryProjectionRevision`；
- `relevantCharacterIds` 顺序；
- `visitIdsByCharacter`；
- `sceneId`；
- state floor/swipe；
- chat/owner；
- requestId。

只有 attemptSeq/attemptId/generationId/commitKey/mode 可以变化。

### 6.3 禁止的“同构伪装”

- regenerate 调原生 `/regenerate`；
- regenerate 重新读取真实聊天历史；
- regenerate 把旧 assistant 文本放进 history；
- regenerate 用当前最新 state 重新构造 synthetic history；
- regenerate 再次调用 `withGardenNarrativeContract` 生成不同文本；
- send 和 regenerate 各维护一份 config object；
- 测试只比较字段存在，不比较逐字节内容和 fingerprint。

---

## 7. 指定 swipe 提交合同

### 7.1 写前快照

对目标 assistant 读取：

- `message_id`；
- `swipe_id`；
- `swipes`；
- `swipes_data`；
- `swipes_info`；
- 四数组长度；
- 所有未知字段；
- active-page metadata；
- 整体稳定 fingerprint。

必须满足：

```text
swipes.length === swipes_data.length === swipes_info.length
0 <= swipe_id < swipes.length
candidateSwipeId === swipes.length
目标 messageId 仍为聊天最后一楼
```

如果旧消息数组长度本身不一致，不自动修，返回 `malformed-swipe-arrays`。

### 7.2 候选 patch

纯函数只生成 patch plan，不直接调用宿主：

```ts
interface SwipeAppendPlanV1 {
  messageId: number;
  expectedBeforeFingerprint: string;
  sourceSwipeId: number;
  candidateSwipeId: number;
  swipes: string[];
  swipes_data: Record<string, unknown>[];
  swipes_info: Record<string, unknown>[];
  swipe_id: number;
}
```

规则：

- 旧数组逐元素保留；
- 只在尾部追加一项；
- 新 `swipes[candidate]` = 新正文；
- 新 `swipes_data[candidate]` = 从 frozen baseline 重算出的完整 candidate MvuData；
- 新 `swipes_info[candidate]` 保留宿主需要的系统字段，并在 `extra` 内写 regenerate attempt metadata；
- `swipe_id = candidateSwipeId`；
- 不修改玩家楼层；
- 不修改其它 assistant；
- 不删除任何 swipe。

### 7.3 写入适配器的硬门

生产 adapter 写前必须重新读一次目标，fingerprint 仍等于 `expectedBeforeFingerprint` 才允许写。

写后必须同时读取：

1. `include_swipes:true` 的全数组视图；
2. `include_swipes:false` 的 active-page 视图；
3. 该 messageId 的 MVU data；
4. 当前 chat/owner；
5. 消息总数和最后 message ID。

同时证明：

- 楼层数不变；
- 玩家楼层数不变；
- assistant message ID 不变；
- 四数组只增加 1；
- active swipe 等于 candidate；
- active text 等于候选；
- active metadata 等于新 attempt；
- active data lifecycle settled；
- VisitTurn 的 message/swipe/attempt/commit 等于候选；
- 旧 swipe 内容、data、info 逐字节未变。

任意不符，不得返回 settled。

### 7.4 竞态

候选生成期间如果发生以下任一变化，放弃提交：

- chat/owner 变化；
- 目标不再是最后一楼；
- source swipe 被用户切换；
- 四数组长度或 fingerprint 改变；
- 新楼层出现；
- 另一个 regenerate attempt 已提交；
- 本地卡片事务开始；
- request metadata 被编辑。

不要尝试“自动合并”这些竞态。

---

## 8. MVU、presence、事件和记忆的单次重算

### 8.1 候选计算阶段

候选最终 data 在宿主写入前尽量完整构造：

```text
baseline MvuData
→ parse new assistant output against baseline
→ restoreLocalEventOwnership(baseline, parsedState)
→ apply original local settlement exactly once
→ applyPresenceUpdate
→ reconcileM2Runtime
→ applyVisitTurnsToFinalState（同 requestId）
→ lifecycle settled
→ receipt
```

不得先写一个半成品 swipe，再靠多个全局事件碰运气补齐。

但如果目标版本只能由 MVU 对已写 swipe 解析，则必须由主验收方另立两阶段提交合同，证明：

- pending swipe 只写一次；
- MVU 只处理一次；
- finalizer 只处理一次；
- reload 可从 pending 收敛；
- 旧 active swipe 不被污染；
- 失败不会重复 append。

执行 agent 不得擅自选择两阶段路径。

### 8.2 VisitTurn

- `turn_id` 继续等于 `${requestId}:${characterId}`；
- 新 swipe 只 upsert；
- summary 改成新回复摘要；
- `latest_attempt_id`、`latest_commit_key`、`assistant_swipe_id` 改成新 attempt；
- `assistant_message_id` 不变；
- retry 同一 regenerate attempt 不追加；
- 再次 regenerate 仍只有一条 turn；
- 原 request 的 frozen visit 已关闭时，仍写 frozen closed visit；
- frozen visit 不存在时失败，不创建新 visit 冒充。

### 8.3 本地 settlement

普通互动、异变收束、决斗胜利分别恢复原操作意图：

- 普通互动：从配对玩家楼层正文/metadata 得到原 `GardenActionMarker`；
- 异变：从 `gensokyoSystemOperation` 恢复 operationId；
- 决斗：恢复 settlementId 和锁定要求；
- operation metadata 缺失或与 request 不一致时停止；
- 从 baseline 重算，因此 settled ID、奖励、物品消费、时间推进不会在旧结果上叠加；
- 同一 candidate commit 重试时依靠 settled ID/commit fence 幂等。

### 8.4 左右切换已有 swipe

`MESSAGE_SWIPED` 只能：

- 重新读取 active message/swipe；
- 重新读取该 swipe 的 MVU data；
- 更新 GAL 投影和 UI；
- 清理失效的内存 regeneration view。

不得：

- 再调用模型；
- 再跑 `applyLocalSettlement`；
- 再 upsert VisitTurn；
- 再追加 settled ID；
- 再扣物品；
- 再推进时间。

数据已经随 swipe 存好，切换只是选择分支，不是再次结算。

---

## 9. 执行任务拆分

以下 T00～T08 是执行 agent 的苦力区。做到 O01 门前必须停。O01～O04 是主验收方高风险收口区。主验收方明确完成 O01 后，执行 agent 才可以继续 T09～T12 的机械接线与补测试。

---

## B3-T00：基线、scope lock 与测试目录

### 任务性质

只读审计 + 新建实施日志，不改生产行为。

### 必须做

1. 执行 §2 阅读门禁；
2. 新建 `project/gal-character-memory-batch-3-implementation-log.md`；
3. 记录 `git status --short`，明确 dirty worktree 是用户现有工作；
4. 记录以下基线：
   - focused 第二批测试；
   - `npm run check:ui`；
   - `npm test`；
   - `git diff --check`；
5. 列出现有 regenerate 生产路径及所有调用点；
6. 列出当前 native 路径的行为和不符合点；
7. 建立第三批测试文件清单，但暂不写实现。

### 允许文件

- 新实施日志；
- 本 runbook 仅允许修正错别字。

### 禁止

- 修改 `src/`；
- 修改测试断言来制造绿灯；
- 跑 probe、打包或发布；
- 清理现有未跟踪文件。

### 完成门

日志必须明确写“第三批未开始实现”。

---

## B3-T01：纯类型、错误码和不变量

### 目标

建立 regeneration target、attempt、receipt、swipe plan、状态机错误码，不接宿主。

### 建议文件

- 新建 `src/ui/gal-regeneration.ts`；
- `src/ui/types.ts` 只做必要公共接口；
- 新建 `tests/gal-regeneration-contract.test.mjs`。

### 必须实现

- §5.1 target；
- §4.4 receipt；
- §7.2 swipe plan；
- 明确错误码联合类型；
- 所有纯类型 schema 带版本；
- parser 保留未知字段，非法输入 fail closed。

### 最少错误码

```text
not-latest-assistant
legacy-request-unsupported
request-conflict
chat-identity-changed
invalid-source-swipe
malformed-swipe-arrays
attempt-sequence-conflict
baseline-not-found
baseline-swipe-not-found
post-settlement-drift
legacy-replay-mismatch
target-changed
unexpected-floor-created
candidate-write-conflict
candidate-verification-failed
```

### 必测

- 合法 round-trip；
- unknown 字段保留；
- 每个非法字段拒绝；
- source/candidate swipe 越界拒绝；
- candidate 不是尾部拒绝；
- 数组长度不一致拒绝。

### 停止线

若需要修改 MVU schema、request V2 schema 或旧 metadata，停止并交回主验收方。

---

## B3-T02：统一 generate-config builder

### 目标

把 `runHelperGenerate()` 内 V2 generate config 的构造抽成纯函数，send 与 regenerate 共用。

### 必须做

1. 先写 characterization tests，锁定当前 V2 send config；
2. 抽出纯 builder；
3. send 改调用 builder；
4. regenerate 测试也调用同一个 builder；
5. builder 不读取 activeMessages/MVU/global；
6. V2 仍要求恰好一条非空 system synthetic history；
7. `with_depth_entries:false`；
8. `user_input === request.modelUserInput`；
9. request 不改变，只由 attempt 提供 generation ID。

### 必测

- send/regenerate 除 generation_id 外 config 深相等；
- frozen request 每个字段逐字节未变；
- 改当前真实聊天、当前 state、当前 presence 不影响 config；
- 旧 assistant 文本不会进入 prompts；
- tool-call/空结果规则仍由执行层处理，不塞进 builder。

### 预算

优先 2 个生产文件、1 个测试文件；超过 160 行生产改动重新门禁。

---

## B3-T03：精确 target locator 与 attemptSeq 扫描

### 目标

纯函数从消息视图中定位唯一目标，不调用模型、不写宿主。

### 输入

- active-page messages；
- target 的 all-swipes view；
- current chat/owner；
- 玩家 request metadata parser；
- assistant swipe info attempt parser。

### 规则

1. 最后一楼必须为 assistant；
2. 读取当前 source swipe；
3. 从 source swipe info 恢复 source attempt；
4. 按 requestId 唯一找到玩家楼层；
5. 从玩家楼层恢复完整 V2；
6. request/chat/owner/message 全匹配；
7. 扫描所有 swipe attempts，取最大合法 attemptSeq + 1；
8. 重复 attemptSeq、重复 commitKey、损坏 metadata 为 conflict；
9. candidateSwipeId = swipes.length；
10. 计算写前 fingerprint。

### legacy 裁定

无 V2 metadata 的旧 assistant 本批不允许 helper regenerate。返回明确错误，UI 可继续使用原生兼容入口，但不能标同构。

### 必测

- 单 swipe；
- 三 swipe 后生成 attempt-4；
- 玩家楼层重复；
- swipe attempt 重复；
- active source swipe 不在数组；
- 后面有 user/system 楼层；
- chat/owner 改变；
- nested `extra.extra` metadata；
- 无 metadata legacy。

---

## B3-T04：冻结 baseline reader 的纯解析部分

### 目标

从调用方传入的 all-swipes message fixture 中精确提取 frozen MvuData，不直接调宿主。

### 规则

- request floor ID 精确；
- frozen swipe ID 精确；
- 返回完整 MvuData clone；
- 保留 stat/display/delta/schema/initialized_lorebooks/unknown；
- 不返回共享引用；
- 不从“最近有效 state”兜底；
- null baseline 仅按 V2 builder 已定义的开场边界处理，不能擅自造默认状态。

### 必测

- baseline 是 swipe 0/1；
- 当前 active swipe 与 frozen 不同仍能从 swipes_data 精确取；
- 数组缺 data；
- floor 不存在；
- data 被 mutation 时原 fixture 不变；
- unknown 字段保留。

### 禁止

不得给 `Mvu.getMvuData` 增加 swipe 参数。

---

## B3-T05：receipt、fingerprint 与漂移检测

### 目标

完成 §4.4 的纯 fingerprint 和 drift decision。

### 要求

- 使用项目稳定序列化/哈希方式；
- 对 object key 顺序稳定；
- 不记录完整私密正文；
- hash 输入覆盖完整 MvuData 或明确列出的正式状态域；
- source receipt 与当前 active data 相等才 `clean`；
- 没 receipt 返回 `needs-legacy-replay`；
- 不相等返回 `post-settlement-drift`；
- 不自动合并差异。

### 必测

- key 顺序变化 hash 相同；
- 任一正式字段变化 hash 不同；
- UI-only 非正式字段是否纳入必须有固定裁定；
- receipt request/attempt/message/swipe 错配拒绝；
- settlementKeys 排序稳定、去重。

---

## B3-T06：branch replay engine 的纯壳

### 目标

把重算顺序做成依赖注入的纯/半纯协调器；执行 agent 不实现未经核验的 `Mvu.parseMessage` adapter。

### 建议接口

```ts
interface RegenerationReplayPorts {
  applyModelOutput(baseData: MvuData, text: string): Promise<MvuData>;
  applyLocalSettlement(state: GardenState, operation: FrozenOperation): GardenState;
  applyPresence(state: GardenState, text: string): GardenState;
}
```

协调器固定顺序：

1. clone baseline；
2. `applyModelOutput`；
3. restore local ownership；
4. apply frozen operation；
5. presence/reconcile；
6. VisitTurn upsert；
7. lifecycle settled；
8. receipt；
9. 精确自检；
10. 返回 candidate data，不写宿主。

### 必测

- ports 调用顺序；
- 任一步抛错后没有部分输出；
- 同输入同输出；
- old settled current state 不作为输入；
- 普通无状态变化输出仍更新 VisitTurn；
- 异变/决斗 operation 只执行一次；
- frozen visit closed；
- missing visit fail closed；
- 同 commit 重跑逐字节相同。

---

## B3-T07：swipe append plan 与精确验证器

### 目标

只做四数组的纯构造和写后验证，不调用 `setChatMessages`。

### 必须实现

- clone-preserve-append；
- unknown swipe info/data 保留；
- candidate metadata 写在对应 `swipes_info[index].extra`；
- old indexes 深相等；
- active candidate 验证；
- active-page metadata/data 验证；
- 楼层数量、角色、message ID 验证输入；
- VisitTurn/lifecycle/receipt 联合验证。

### 必测

- 1→2、3→4 swipe；
- 旧 swipe unknown 字段不变；
- 错 text/data/info/swipe_id 任一失败；
- 多增一个 swipe 失败；
- 少 data/info 失败；
- old swipe 被改一字失败；
- message count +1 失败；
- 玩家楼层数变化失败；
- current owner/chat 变化失败。

---

## B3-T08：可控 host 的 coordinator 骨架

### 目标

用 fake ports 执行完整代码逻辑，但 production swipe writer 和 model-output parser 仍未接线。

### fake ports 必须支持注入

- candidate generation resolve/reject/空/tool-call；
- stop + late resolve；
- 生成期间切 chat；
- 生成期间切 source swipe；
- 生成期间新增楼层；
- 写前 fingerprint 变化；
- 写入成功但复读数组损坏；
- 写入成功但 active metadata 错；
- MVU parser 抛错；
- settlement 抛错；
- reload 在 candidate_ready/committing/verifying；
- 同 commit 重试。

### 必测结果

- 不新增 user；
- fake message count 不变；
- 失败不调用 writer；
- writer 最多一次；
- finalizer 最多一次；
- 同 commit retry 不追加；
- candidate text 生成成功但写失败时缓存，可只重试提交，不再次调模型；
- reload 可恢复缓存证据；
- 所有冲突 fail closed。

### T08 完成声明必须写

```text
纯逻辑骨架完成；production Helper candidate transport、MVU parser adapter、
setChatMessages 四数组写入与真实刷新时序尚未接线。第三批未完成，等待 B3-O01。
```

写成“第三批完成”直接返修。

---

## B3-O01：主验收方裁定候选生成 transport（执行 agent 必须停）

### 为什么留给主人/主验收方

现有 send 代码已经观察到 `generate()` 可能自动出现 assistant 楼层。重生成要求消息数不变。如果候选 API 自带落楼，就会先制造重复楼层、触发 MVU，再把文本搬到 swipe，语义已经污染。

### 必须回答

1. 是否存在项目当前已暴露、使用当前 preset、接受同一 config、只返回文本且不创建楼层的路径；
2. 如果只有 `generate()`，目标 runtime 的 `should_silence` 到底是否落楼；
3. `generateRaw()` 是否真实暴露、是否保持同一 preset 语义；若不保持则不能叫同构；
4. 是否能通过明确 config 禁止落楼；
5. 若自动楼层不可避免，是否存在完全无副作用的事务隔离；删除自动楼层不是默认答案，因为它可能已经触发 MVU/事件；
6. 任何方案能否维持 stopGenerationById 和 generationId 过滤。

### 裁定

- 无无副作用候选路径：第三批阻塞，不接 production；
- 有路径：把精确 API、版本、来源、失败策略写入 `api-provenance.md`，再开放 T09。

执行 agent 不运行 Probe C，不拿旧包试，不自行删除临时楼层。

---

## B3-O02：主验收方裁定 model-output → candidate MvuData

### 优先方案

在内存中用 frozen baseline 解析新输出，得到完整 candidate data，再一次性提交 swipe。

### 必须证明

- 精确函数签名与 realm；
- 输入 baseline 不被原地污染；
- 调用不写真实消息；
- 不自动触发第二次宿主 settlement；
- 输出与普通 send 对同一文本的 MVU 语义一致；
- extra-model 分支如何完成；
- parser 失败不会写 swipe。

若不能证明，只能选择受控两阶段方案或阻塞。不得用当前 target active data 当 baseline。

---

## B3-O03：主验收方实现/审查指定 swipe writer

### 必须负责

- 精确 `setChatMessages` payload；
- `swipes_info.extra` 嵌套；
- 四数组原子性；
- active-page refresh；
- 写前 CAS fingerprint；
- 写后双视图复读；
- chat/owner/message count 守卫；
- 失败状态与恢复；
- 不手工 emit 原生事件；
- 不直接 mutate `context.chat`；
- 不引入 LALib。

这是本批风险最高的代码，不交给执行 agent自由发挥。

---

## B3-O04：主验收方裁定旧 V2 swipe 与 post-settlement drift

必须决定：

- 哪些旧 V2 回复可以通过 replay 补 receipt；
- 哪些必须拒绝重生成；
- 同楼层后置购买/卡片操作是否暂时导致 regenerate 禁用；
- UI 如何显示明确原因；
- 不得静默丢弃后置状态。

首版宁可拒绝，也不要“看起来重生成成功，背包悄悄回档”。

---

## B3-T09：production adapter 接线（O01～O04 通过后）

### 执行 agent 可做的苦力

- 按主验收方已经给出的精确 adapter 接口接线；
- 把 `regenerateLatest()` 改为新 coordinator；
- 删除其中旧的“native 后读取 current，再 restore ownership”逻辑；
- 保留 native transport 作为明确 feature flag/fallback，不自动降级；
- diagnostics 显示真实 transport 和 blocked reason；
- UI phase 从状态机派生。

### 不得自行改变

- O01～O04 的 API、payload、时序和错误码；
- feature flag 默认值；
- legacy policy；
- post-settlement drift policy。

### 生产文件预算

本任务目标不超过 3 个生产文件、220 行净改动。超过必须拆 T09a/T09b，不能把 `bridge.ts` 再堆一层补丁山。

---

## B3-T10：reload/recovery

### 持久证据

至少要能从玩家 request metadata、目标 swipe info、candidate commit metadata、lifecycle/receipt 恢复：

```text
无 candidate swipe、无 commit → incomplete，不自动重发
candidate text 已缓存但未写 → 只允许显式恢复提交
candidate swipe pending → 只恢复解析/结算/验证，不再调用模型
candidate swipe settled + receipt valid → confirmed
同 commit 出现两次 → conflict
数组半写 → conflict/manual，不猜修复
```

### 必测

- 每个阶段 reload；
- reload 后不新增玩家楼层；
- reload 后不再次 generate；
- pending commit 只 upsert 同 turn；
- confirmed 不再 settlement；
- 切 chat 后旧 recovery 不写新 chat；
- source swipe 在 reload 后变化则 conflict。

---

## B3-T11：外部 swipe 监听收敛

### 目标

保证玩家左右切换已有 swipe 时只切换展示/状态，不触发新结算。

### 必须审计

- `MESSAGE_SWIPED`；
- `MESSAGE_UPDATED`；
- MVU variable initialized/updated；
- app refresh；
- `subscribe()` 中的 pending 清理；
- GAL scene projection 的 sourceMessageId/swipeId。

### 必测

- 旧 swipe 0 ↔ 新 swipe 1 往返 10 次；
- VisitTurn 数量不增加；
- settled_ids 不增加；
- 钱/物品/时间不重复；
- 不调用 generate；
- 不调用 finalizer；
- UI 显示跟随当前 swipe；
- 切 chat 后监听不串线。

静态测试不能冒充真实宿主事件时序；代码逻辑验收只证明 listener 分支无写入调用，运行时证据另列。

---

## B3-T12：最终测试、文档与独立申请验收

### focused 命令建议

```powershell
node --test `
  tests/gal-regeneration-contract.test.mjs `
  tests/gal-regeneration-target.test.mjs `
  tests/gal-regeneration-replay.test.mjs `
  tests/gal-regeneration-swipe-plan.test.mjs `
  tests/gal-regeneration-coordinator.test.mjs `
  tests/finalize-accepted-assistant.test.mjs `
  tests/phase4-restore.test.mjs `
  tests/message-transaction-v2.test.mjs `
  tests/visit-turn-settlement.test.mjs
npm run check:ui
npm test
git diff --check
git status --short
```

文件名可按真实实现调整，但日志必须写实际命令和精确数字。

### 文档更新

- 第三批实施日志；
- `project/api-provenance.md`：只写实际核验的 API 与置信度；
- `src/schema/field-ledger.md`：若新增 receipt writer/reader；
- 主计划 Phase 6 状态；
- diagnostics/验收简报；
- 不修改发行文档和 R2 文档。

### 独立申请格式

```text
第三批“重生成同构”申请代码逻辑验收。

完成：B3-T00～T12；主验收门 O01～O04 的实际裁定为……
transport：……
默认开关：……
基线重放：……
指定 message/swipe：……
无重复楼层证据：……
无重复 MVU/VisitTurn 证据：……
focused：x/x
tsc：PASS
full：x/x
diff-check：PASS
未做/已做的真实宿主验收：……
```

如果 O01～O04 任一未闭合，只能写“第三批机械基础完成，等待主验收方收口”，不得申请通过。

---

## 10. 必测矩阵

### 10.1 正常路径

1. 单 swipe → 追加 swipe 1；
2. 三 swipe → 追加 swipe 3；
3. 同 request 第三次 regenerate → attemptSeq 单调递增；
4. player message ID 不变；
5. assistant message ID 不变；
6. message count 不变；
7. 新 swipe active；
8. 旧 swipe 全字段不变；
9. send/regenerate config 同构；
10. synthetic history 和 model input 逐字节复用。

### 10.2 回滚/重算

1. 旧回复加金币，新回复不加：新 swipe 从 baseline 算，不保留旧金币；
2. 旧回复推进时间，新回复不推进：新 swipe 时间回到 baseline；
3. 旧回复角色离场，新回复仍在场：presence 以新文本重算；
4. 旧回复结算事件 A，新回复结算事件 B：新分支只有 B；
5. 旧 reply 后存在无法解释本地购买：拒绝，不能丢购买；
6. baseline 来自非 active frozen swipe：精确读取 swipes_data；
7. baseline 缺失：不写。

### 10.3 记忆与结算幂等

1. 同 turn_id 只一条；
2. summary 替换；
3. attempt/commit/swipe 更新；
4. retry commit 不追加；
5. reload pending 不追加；
6. settled ID 不重复；
7. 消费不重复；
8. 奖励不重复；
9. 时间不二次推进；
10. 左右 swipe 不触发 settlement。

### 10.4 失败与竞态

1. 空结果；
2. tool-call；
3. provider reject；
4. stop；
5. stop 后迟到 resolve；
6. 生成期间切 chat；
7. 生成期间切 swipe；
8. 生成期间新增楼层；
9. 写前 fingerprint 漂移；
10. 四数组半写；
11. active metadata 错；
12. candidate data 缺 lifecycle；
13. candidate turn 在错误 visit；
14. duplicate commit；
15. duplicate attemptSeq；
16. reload 各阶段。

每条失败用例都要证明：

- 不新增玩家楼层；
- 不留下额外正式 assistant 楼层；
- 不修改旧 swipe；
- 不追加 VisitTurn；
- 不重复 MVU settlement；
- 不标 settled；
- 不自动再次调模型。

---

## 11. 验收停止线

出现任一情况，立即停止并交主验收方：

1. 需要猜 `setChatMessages` 的四数组语义；
2. 需要手工 emit `MESSAGE_SWIPED`/MVU 事件；
3. 需要直接改 `SillyTavern.getContext().chat`；
4. 候选 generate 会新增真实楼层且无法在产生副作用前阻止；
5. 只能从旧回复 current state 做反向扣减；
6. 找不到 frozen baseline swipe data；
7. old reply 后有无法解释的本地状态漂移；
8. 必须删除旧 swipe 或后续楼层；
9. 需要引入 LALib 或新扩展；
10. 需要改 V2 request schema 才能继续；
11. patch 超过任务预算；
12. focused 测试无法隔离宿主副作用；
13. dirty worktree 与用户改动发生不可绕开的重叠；
14. 需要 probe、真实模型或用户 API 配置才能继续执行 agent 的机械任务。

停止不是失败。猜一个能跑的实现才是。

---

## 12. 单独验收标准

第三批不能夹在第四批或发行验收里顺便看。验收 agent 必须重新阅读：

- 本 runbook 全文；
- 第三批实施日志全文；
- 所有第三批新增/修改源码全文；
- 所有第三批测试全文；
- 第二批最终返修段；
- API provenance 的实际裁定。

### 12.1 代码逻辑通过条件

- 同一 V2 frozen request；
- 同一 generate-config builder；
- exact target message/source swipe/candidate swipe；
- baseline replay，不从 old settled current 叠加；
- no extra user/assistant floor；
- VisitTurn upsert；
- MVU/local settlement single commit；
- write-before/write-after identity guards；
- reload idempotence；
- swipe navigation read-only；
- focused/tsc/full/diff 全绿；
- 文档无夸大。

### 12.2 代码逻辑验收不能证明

- 目标宿主 `setChatMessages` 的真实刷新时序；
- MVU 对新 active swipe 的真实处理次数；
- MESSAGE_SWIPED 事件到达时 data 是否已经切换；
- iframe 热重载中的真实竞态；
- provider/额外模型真实耗时。

这些必须独立写“运行时待验”，不能因为 100% 单测就写 runtime PASS。

### 12.3 封账条件

只有代码逻辑验收通过，且 O01～O04 已有明确裁定，才能封第三批代码账。

若最终 transport 仍为 `native-regenerate`，则第三批最多只能封“基础设施账”，不能封“重生成同构账”。

---

## 13. 推荐交工顺序

```text
执行 agent：T00 → T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08
                                  ↓
                         必须停，交主验收方
                                  ↓
主验收方：O01 → O02 → O03 → O04
                                  ↓
执行 agent：T09 → T10 → T11 → T12（机械接线、矩阵补齐、日志整理）
                                  ↓
主验收方：第三批独立代码逻辑验收与返修
```

这样分工的目的很朴素：

- 大量纯函数、fixture、错误码、日志和矩阵让执行 agent 消耗 token；
- 任何可能删楼、错写 swipe、重复 MVU、丢状态的决策由主验收方亲自收口；
- 执行 agent 没有权限用“先跑起来再说”替代事务证明。

---

## 14. 最终禁区速查

执行 agent 每次准备改代码前先看这一段：

- 不用当前 state 重建 request；
- 不用旧 assistant 进 history；
- 不调用原生 `/regenerate` 冒充同构；
- 不新增 user；
- 不新增正式 assistant floor；
- 不覆盖已有 swipe；
- 不删除旧 swipe；
- 不猜最近楼层；
- 不猜 swipe 0；
- 不猜 attemptSeq；
- 不给 MVU API 发明 swipe 参数；
- 不直接 mutate host chat；
- 不手工 emit 事件；
- 不从 old settled state 反向扣减；
- 不忽略 post-settlement drift；
- 不重复 settlement；
- 不 append 重复 VisitTurn；
- 不碰关系候选、提示注入、数据库、R2、打包、发行；
- 不碰 `reasonix`；
- 不在 O01 前接 production writer；
- 不在 runtime 未验时写 runtime PASS。

只要老老实实走到停止线，这批苦力就算干得漂亮。剩下那几颗会爆炸的螺丝，留给主验收方拧。
