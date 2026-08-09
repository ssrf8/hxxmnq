# 二次确认取证：GAL 聊天发送后卡死（missing-turn）· 2026-08-10 03:42

> 浏览器 hook + 磁盘 jsonl 双确认，复现 2026-08-09 报告中的 missing-turn 卡死。

## 一、hook 时间线（毫秒级，宿主 + 游戏 UI iframe 双源）

本轮 requestId = `gal-req-msm7kb9o-9f01`，generationId = `gal-gen-msm7kb9o-tl9i2q`

```
03:42:00.750  Event emitted: js_generation_before_end
03:42:00.753  Event emitted: js_generation_ended
03:42:00.754  FRAME:console.debug [gal:helper-generate] gal-gen-msm7kb9o-tl9i2q ended 8157 chars   ← 生成完成
03:42:00.755  FRAME:console.debug [gal:helper-generate] gal-gen-msm7kb9o-tl9i2q resolved string
03:42:00.768  Event emitted: message_received
03:42:00.774  Event emitted: mag_variable_update_ended
03:42:00.775  FRAME:console.debug [gal:mvu] VARIABLE_UPDATE_ENDED（无楼层参数，按 epoch 聚合）        ← ST 变量阶段结束
03:42:00.786  HOST:replaceMvuData msg=2 writeTurns=1 lc=? turns=[gal-req-msm7kb9o-9f01:reimu:sw0]   ← finalize 写盘：本轮正确 turn 已写入！
03:42:00.798  [Prompt Template] message #2.0 variables ...
03:42:00.821  FRAME:console.debug [gal:helper-generate] gal-gen-msm7kb9o-tl9i2q persisted           ← 落楼（在 finalize 之后！）
03:42:00.822  FRAME:console.debug [gal:mvu] waitForVariableStage 绑定楼层 2
03:42:00.837  FRAME:unhandledrejection Error: VisitTurn 精确复读失败（missing-turn）：保持 settlement pending  ← 卡死点
```

第二次结算尝试（500ms 轮询 / 重试）：
```
03:42:20.216  HOST:replaceMvuData msg=2 writeTurns=1 turns=[gal-req-msm7lmii-twcp:reimu:sw0]        ← 幽灵 turn 仍在写
03:42:20.218  FRAME:unhandledrejection Error: 冻结 V2 request 缺失，禁止单独标记 lifecycle settled   ← persistCommitSettled V2 分支再抛
```

## 二、磁盘铁证（聊天 jsonl L4 = 本轮 assistant 消息）

- `galGenerationCommitV1` = **settled**（requestId=msm7kb9o, commitKey=msm7kb9o:msm7kb9o:attempt-1）
- `gal_regeneration_receipt_v1` = **Y**（存在，baseline/modelApplied/finalized 三指纹）
- `stat_data.interaction.visit_memory.by_character.reimu` 唯一 turn 是**幽灵**：
  - `turn_id = gal-req-msm7lmii-twcp:reimu`（旧 request！）
  - `request_id = gal-req-msm7lmii-twcp`（≠ 本轮 msm7kb9o）
  - `assistant_message_id = 2`（旧消息）
  - `latest_attempt_id = gal-req-msm7kb9o-9f01:attempt-1`（本轮 attempt —— 落楼时 latest.state 原样复制）
  - `latest_commit_key = gal-req-msm7kb9o-9f01:...`（本轮 commit key）
  - `scene_id = scene:msm7kb9k`
- `stat_data` 中**完全没有**本轮 `msm7kb9o` 的 turn

## 三、根因链（与 2026-08-09 报告一致，实机确认）

1. **竞态**：VARIABLE_UPDATE_ENDED（.775）触发 settle → finalize 写盘（.786，写入本轮正确 turn msm7kb9o）
2. **落楼覆盖**：runHelperGenerate resolve 后 `persisted`（.821，晚于 finalize 35ms）走 `writeHelperAssistantMessage`（bridge.ts:1057-1076），
   用 `latestPersistedMessage().state`（含上一轮污染的幽灵 turn msm7lmii）构造新楼层 stat_data，**覆盖 finalize 刚写入的本轮 turn**
3. **卡死**：persistCommitSettled V2 分支（bridge.ts:972-993）用 snapshot.requestId=msm7kb9o 构造 expected turn
   → stat_data 里只有 msm7lmii → `verifyFinalizedAssistantData`（bridge.ts:380-396）抛 missing-turn → 保持 settlement pending
   → 无法继续发送；再试则 pendingRequest 已被 advanceAnyRequest 推进 → 抛「冻结 V2 request 缺失」

## 四、关键代码位置（同报告）

| 环节 | 位置 | 问题 |
|---|---|---|
| 落楼用 latest.state 构造 data | bridge.ts:1062-1075 / 1210-1221 | 无条件用 latest.state 初始化楼层，可抹掉 finalize 已写入的 turn |
| 落楼与 settle 竞态 | runHelperGenerate resolve vs VARIABLE_UPDATE_ENDED listener（bridge.ts:3170） | settle/finalize 先执行，落楼后覆盖 |
| 卡死验证点 | bridge.ts:937-990 + verifyFinalizedAssistantData(380) | fail-closed：缺本轮 turn 即抛错 |
| 第二次结算再抛 | bridge.ts:973-975 | pendingRequest 已被 advance，requestId 不匹配 → 「冻结 V2 request 缺失」 |

## 五、备注

- hook 首次注入有递归污染（push 里 console.log 触发包装的 console.log 再 push），已修复：后续日志只记录不转发；
  污染仅影响可读性，未丢证据（关键行在原始 buffer 中完整）。
- 磁盘监听 `_gal_watch.cjs` 全程运行，捕获 L3（本轮用户 req 出现）→ L4（commit=settled + receipt=Y + turns=0 摘要）。
