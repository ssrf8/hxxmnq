# 额外模型与角色离场实机验收记录（0.2.0-ui-test-entry / embedded 测试入口卡）

> 依据 `project/2026-08-10-extra-model-runtime-button-acceptance.md` 执行。
> 环境：SillyTavern 1.18.0（127.0.0.1:8001）、酒馆助手 JS-Slash-Runner 4.8.19、Bridge 0.4.3-host-generate-r26、MVU 已就绪。
> 构建：`--ui-channel=test --ui-delivery=embedded` → `dist/checkpoint-ui-test-entry/幻想乡物语 [UI测试版].json`（SHA-256 f9331a69…d788）。
> 模型：假流式-gemini-3.1-pro-preview（剧情 + 额外变量共用；额外模型独立请求体含「变量更新协议（模型可见）」+ `<must>`）。
> 监听：iframe 内 `eventOn` 10 事件（MESSAGE_*/GENERATION_*/CHAT_CHANGED/IMPERSONATE_READY），88 条事件。

## 结果汇总

| 项 | 判定 | 证据摘要 |
|---|---|---|
| A01 空补丁 | **PASS** | 剧情模型输出灵梦正文（557 请求 1975 tokens）；额外模型输出 `<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>`（605）；楼层末尾落空补丁 `[]` |
| A02 合法语义更新 | **PASS** | 额外模型补丁 `[{"op":"add","path":"/characters/reimu/current_relationship_facts/-","value":"明确了"允许在庭园暂住但不得擅动结界"的边界事实"}]`；楼层落盘与 662 响应逐字一致 |
| A03 独占字段攻击 | **PASS** | 模型诱导写资源/事件/事务身份 → bridge 拒绝 → 空补丁 `[]`；剧情中灵梦正确拒绝「疯话/代码」 |
| A04 固定事件 | **PASS** | 楼层出现 `garden-action.v1` 结算区块（`event_id: reimu_boundary_inspection` + 唯一 `settlement_id`）+ 空补丁 |
| A05 时间单调 | **PASS** | 诱导时间倒退/非法「下午」 → 拒绝 → 空补丁 `[]`；咪咪点评「改变时间被戳穿」 |
| A06 非法输出 fixture | **PASS** | 拦截额外模型首请求返回越权写 `/resources/gold` 补丁 → bridge 拒绝（未落盘）→ **自动重试**（08:57:51 ENDED→STARTED→08:57:59 ENDED[13]）→ 重试轮合法空补丁落盘 |
| A07 双角色 Visit | **PASS** | 灵梦 + 魔理沙同轮各发言（正文）；补丁空（bridge 内部写 VisitTurn/visit_memory） |
| A08 下一轮召回 | **PASS** | 灵梦准确召回上一轮（A07）风向对话「我刚才明明说过，没风」+ 关联结界事实（A02/A04） |
| A07b 生成期间离场 | **PASS** | 生成期间 `dismiss_character('marisa')` → 生成轮正常结算（无 throw）；楼层 presence_snapshot 更新（reimu/marisa IDLE）+ 空补丁 |
| A09 邀请制隔离 | **PASS** | 仅 reimu 进入月见：`/player/current_area_id → moon_spring_plot` + 关系事实「与玩家一同前往月见温泉」；无其他角色出场 |
| A10 压力轮 10 次 | **受限流中断** | 22 次 generate（完成至消息 #25，约 4-5 轮）；**3 次 429 Too Many Requests（1225/1244/1261）** → 生成挂起；09:10 stop 后 8 次 GENERATION_STOPPED。外部 API 限流所致；bridge 对 429 挂起而非优雅失败（观察项，非 P0） |
| A11 Profile 边界记录点 | **记录点已完成** | 当前 profile（UI测试版）frozen request 基线可复现（A01 的 557/605 请求体）；跨 profile 比较需切换 r96 候选卡后再次点击 A11（建议单独会话） |
| 修复项：真正离场（dismiss） | **PASS** | `dismiss_character('reimu')` → 庭园地图空（灵梦、魔理沙均不在）→ presence_snapshot 不含 reimu（无 throw） |
| 对照项：只结束聊天（end_chat） | **PASS** | `end_conversation_local` → 状态「END_CHAT 操作链已完成」无 throw（presence 含 reimu，结束聊天未误伤离场） |

## 关键事件流（08:36 – 09:10）

```
08:36:46 GS×2 → 08:36:53 GE[3] + MR[2]      A01
08:44:46 GS×2 → 08:44:52 GE[5] + MR[4]      A02
08:51:10 GS×2 → 08:51:17/26 GE[7]×4 + MR[6] A03（含结算多段）
08:52:30 GS×2 → 08:52:37 GE[9] + MR[8]      A04
08:54:07 GS×2 → 08:54:15 GE[11] + MR[10]    A05
08:57:51 GE[13]×2 → GS×2 → 08:57:59 GE[13]×2 + MR[12]   A06（bridge 拒绝→重试）
08:59:44 GS×2 → 08:59:51 GE[15] + MR[14]    A07
09:01:17 GS×2 → 09:01:27 GE[17] + MR[16]    A08
09:02:29 GS×2 → 09:02:38 GE[19] + MR[18]    A07b（生成期间送别魔理沙）
09:04:34 GS×2 → 09:04:44 GE[21] + MR[20]    A09
09:06:23–50 GE[23]/[25]×4 + MR[22]/[24]     A10 压力轮（→429 中断）
09:10:23/35 GEN_STOPPED×8                   手动停止挂起生成
```
GS=GENERATION_STARTED GE=GENERATION_ENDED MR=MESSAGE_RECEIVED

## 观察项 / 待办
1. **A10 429 限流**：bridge 在外部模型 429 时生成挂起（楼层停「思考中」）而非报错/重试——建议后续增强（P2）。
2. **A11 跨 profile 比较**：需切换 r96 正式候选卡后再次点击 A11 比对 frozen request/hash（未执行，避免破坏当前会话）。
3. **A06 fixture 机制**：由验收端 Playwright `page.route` 拦截额外模型首请求注入非法补丁，验证 bridge 拒绝+重试；fixture 未落盘即判定原始逻辑（符合按钮说明）。
4. 环境备注：导入时 ST 未自动创建测试卡世界书（「world could not be found」），后经 UI 触发创建成功；全新 profile 首次导入需留意。
