# missing-turn 卡死 · 修复方案评审（诊断稿，未动代码）

> 依据：2026-08-10 03:42 实机二次确认（`2026-08-10-missing-turn-二次确认取证.md`）+ 源码精读。
> 本文件只评审三个候选修复方向的影响面/风险/验证方式，不含代码改动。

## 0. 根因回顾（实机证据）

本轮 requestId=`gal-req-msm7kb9o-9f01`，assistant 楼层 L4 最终 stat_data：

```
commit = settled（requestId/commitKey 均本轮）
receipt = Y（baseline/modelApplied/finalized 三指纹，finalize 确实算出了新数据）
唯一 turn = 幽灵：request_id=gal-req-msm7lmii-twcp（上一轮），assistant_message_id=2（旧消息），
            latest_attempt_id/latest_commit_key/scene_id 却已是本轮（落楼时 latest.state 原样复制）
stat_data 中完全无本轮 msm7kb9o 的 turn
```

时序（hook 毫秒级）：
```
03:42:00.786  replaceMvuData msg=2 writeTurns=1 turns=[msm7kb9o:reimu:sw0]   ← finalize 写入本轮正确 turn
03:42:00.821  persisted                                                     ← 落楼（晚于 finalize 35ms）
03:42:00.837  unhandledrejection: VisitTurn 精确复读失败（missing-turn）      ← 卡死
03:42:20.218  unhandledrejection: 冻结 V2 request 缺失（pendingRequest 已被 advanceAnyRequest 推进）
```

三层链：① 上一轮幽灵 turn 残留在 latest.state；② 本轮落楼用 latest.state 初始化楼层 data（且在
finalize 之后执行）→ 抹掉本轮 turn、留下幽灵；③ persistCommitSettled V2 fail-closed 精确复读
发现本轮 turn 缺失 → 保持 settlement pending → 无法继续发送。

---

## 1. 方向 ①：落楼跳过已 settled 楼层（治本，推荐主修）

### 落点
- `writeHelperAssistantMessage`（bridge.ts:1057-1076）：`resolveAssistantMessageByCommitKey` 已做
  幂等（commit.ok 则 return），但"已存在"只按 commitKey 反查楼层，**不检查该楼层 data 是否已被
  finalize 写成 settled**；若 commitKey 未反查到（如楼层 ID 变化/重建），会无条件用 latest.state
  重写 data。
- `st_persisted` 分支（bridge.ts:1203-1227）：ST 已自动落楼时，无条件用 `latestForSt.state`
  构造 `dataForSt` 并 `createChatMessages` 重写 —— 这里是覆盖 finalize 结果的主要现场。

### 机制
落楼写 data 前，先读目标楼层现有 data：
- 若 `galGenerationCommitV1.status === 'settled'` 且 `requestId === attempt.requestId`（本轮），
  则**跳过 stat_data 覆盖**，仅补 `extra`（attempt metadata，若缺失）；
- 若楼层 data 中已含本轮 turn（stat_data.visit_memory 中存在 request_id===本轮），同样跳过覆盖；
- 否则才用 latest.state 初始化（保留现状逻辑）。

### 优点
- 直接消除"落楼覆盖 finalize"的竞态窗口，是根因链第②环的根治；
- 不改变 settled 语义，不放松验证，审计完整性保持。

### 风险 / 副作用
- `latest.state` 的语义是"最新持久化状态"，正常路径下落楼确实需要它作为新楼层 MVU 变量域
  （bridge.ts:1063-1064 注释：不用 latest.state 则新楼层不参与 MVU 变量更新）。跳过覆盖后，
  新楼层 stat_data 可能与"发送时快照"不同——但 finalize 已把最终态写入目标楼层，新楼层
  直接继承最终态是**正确**的（这正是报告期望的行为）。
- 需处理"落楼时楼层尚不存在（commitKey 反查不到）"的情况：此时应检查"finalize 是否已写某个
  楼层"——可通过 receipt/commit 的 assistantMessageId 定位，避免建出第二个 stat_data 来源。
- 回归风险：影响所有 helper-generate 落楼路径（send/regenerate/retry 共用），需跑
  `src/ui/gal-regeneration*` 相关测试 + 实机一回合。

### 验证方式
- 单元：构造"finalize 已 settled + 落楼再触发"场景，断言落楼不覆盖 stat_data、只补 extra；
- 实机：复现一回合（幽灵残留环境），确认落楼后 L4 保留本轮 turn、无 missing-turn、可继续发送。

---

## 2. 方向 ②：latest.state 过滤非本轮 turn（防传染，推荐为辅/可选）

### 落点
- bridge.ts:1065-1067（writeHelperAssistantMessage 的 baseData 构造）；
- bridge.ts:1211-1213（st_persisted 分支的 baseDataForSt 构造）。

### 机制
取 latest.state 构造 baseData 时，把 `interaction.visit_memory.by_character.*.turns` 中
`request_id !== 本轮 requestId` 且 `assistant_message_id` 不属于本轮消息的 turn 剔除，
再写入新楼层。

### 优点
- 即使落楼覆盖仍在，幽灵 turn 也不会传染给新楼层 → 覆盖后的 stat_data 至少"干净"（无幽灵）；
- 实现局部、纯函数可测。

### 风险 / 副作用（高）
- **turn 是历史记忆，不是本轮专属**：active_visit/closed_visits 中的历史 turn 是跨轮合法数据
  （多轮对话的完整 turn 列表）。简单按 request_id 过滤会**误删合法历史 turn**，破坏记忆连续性；
- 幽灵与合法历史的判别没有可靠字段：`latest_attempt_id/commit_key` 是本轮的（实测！），
  `assistant_message_id` 是旧的 —— 需要"assistant_message_id 属于本轮楼层"这样的复合判定，
  而楼层 ID 在 ST 自动落楼场景下本就漂移，判定脆弱；
- 治标不治本：只防止传染，不解决"落楼覆盖 finalize"本身；且若过滤误伤，会产生新的一致性错误。

### 结论
方向②单独使用风险大于收益。若要做，应作为方向①的**补充防御**，且过滤规则必须限定为
"turn.assistant_message_id 已不存在于当前聊天（孤儿 turn）"这一精确条件，而非按 requestId。

---

## 3. 方向 ③：persistCommitSettled 宽容策略（兜底，推荐低优先级）

### 落点
- bridge.ts:954-1008（persistCommitSettled 全函数）；
- bridge.ts:376-396（verifyFinalizedAssistantData 的抛错点）；
- bridge.ts:972-993（V2 分支：expected turn 构造 + 精确复读）。

### 机制
V2 分支中，若目标楼层 data 已同时满足：
```
lifecycle.schema === 'gal-generation-commit.v1'
lifecycle.status === 'settled'
lifecycle.requestId/attemptId/commitKey === snapshot 对应字段
receipt（gal_regeneration_receipt_v1）存在且 requestId === snapshot.requestId
```
则视为"finalize 已完整成功"，跳过 `applyVisitTurnsToFinalState` + `verifyFinalizedAssistantData`
的精确 turn 复读（missing-turn 不再抛错），直接返回 settled。

### 优点
- 直接解除 fail-closed 卡死：即使 stat_data 被覆盖/污染，只要 receipt+settled 在就放行，
  用户能继续发送，体验不中断；
- receipt 本身就是 finalize 输出的指纹证据，以此为依据不算盲放。

### 风险 / 副作用
- **放宽验证 = 容忍数据不一致**：若 stat_data 真的缺本轮 turn（本轮记忆丢失），宽容策略会让
  它"看似 settled"，后续 regeneration 基线、记忆召回可能引用幽灵/缺失 turn；
- receipt 的 finalizedData 指纹证明"finalize 曾算出正确数据"，但**磁盘当前 stat_data 已被覆盖**
  ——宽容放行后，重建/重生成会基于错误 stat_data 继续，可能连环出错；
- 与方向①组合时，①修好后③很少触发；③单独使用是"症状缓解"而非病因修复。

### 结论
方向③可作为**防线兜底**（防止任何残余路径再卡死），但不应作为主修复；建议在①之后评估，
且仅在 receipt+settled+commitKey 三重匹配时放行，同时 `console.warn` 记录"宽容放行"供审计。

---

## 4. 推荐组合与实施顺序

| 优先级 | 方向 | 角色 | 理由 |
|---|---|---|---|
| P0 | ① 落楼跳过已 settled 楼层 | 主修（根治） | 消除竞态覆盖，保留验证强度 |
| P1 | ③ persistCommitSettled 宽容 | 兜底防线 | 防任何残余路径卡死；三重匹配才放行 |
| P2 | ② latest.state 过滤孤儿 turn | 可选加固 | 仅在"孤儿 turn"精确条件下做，防传染 |

实施顺序建议：① 单独落地并实机复现验证 → ③ 按需追加 → ② 评估后决定。

## 5. 遗留待查（不阻塞修复，但影响长期正确性）

1. **幽灵 turn 的第一性来源**：上一轮（msm7lmii）结算时，finalize 用残留 pendingRequest 把
   turn 写进了"不属于它的消息"（8-09 报告：visit-turn-commit.ts:415-430 / character-memory.ts:561
   只校验 visit 存在，不校验 turn 归属 request）。方向①修好后不再传染，但**污染源头仍在**
   ——建议后续为 `upsertVisitTurnByVisitId` 增加 turn.request_id 与楼层 commit 归属校验。
2. **落楼与 settle 的时序契约**：当前 settle（VARIABLE_UPDATE_ENDED listener，bridge.ts:3170）
   与落楼（runHelperGenerate resolve）无明确先后保证，本次实测落楼晚 35ms。方向①依赖
   "finalize 先于落楼"的事实，若未来时序反转需重新评估。
3. **`advanceAnyRequest` 推进时机**：runHelperGenerate 开头即推进 pendingRequest（bridge.ts:1094），
   导致结算重试时「冻结 V2 request 缺失」。若③放行路径仍走到该分支，需确认推进时机与
   persistCommitSettled 的请求一致性。
