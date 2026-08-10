# 额外模型与角色离场实机验收

状态：代码与离线门禁通过；**真实 SillyTavern 实机验收已执行（2026-08-10，监听 Agent + Playwright 内置浏览器）**，详细证据链见 `project/2026-08-10-extra-model-runtime-button-acceptance-results.md`。

本页只记录这次小改动，不替代完整手册 `D:\浏览器下载\2026-08-10-extra-model-variable-runtime-acceptanc..md`。

## 候选构建

| profile | 测试 UI | SHA-256 |
| --- | --- | --- |
| standalone-mvu | `dist/runtime/test/profiles/standalone-mvu/ui-mount-test-r19.js` | `c46a6469677745a03510fb20c0bfd89ba348fc1e7cfb4493a0349d881a74acdb` |
| database-assisted | `dist/runtime/test/profiles/database-assisted/ui-mount-test-r19.js` | `a368b9d1c432b7688ab93f1dbf136e94b86d688ca33607c464c27b27df3ccfe0` |

两份都只是本地测试通道构建，未上传、未发布、未打包角色卡。

## 普通聊天发送合同（test-r19）

正常链路只有：发送真实 user 楼层 → 收到唯一 assistant 回复 → 更新该回复楼层的 MVU → 解除发送占用。

- 生成期间只保留临时防双击；生成或写入结束后必须释放。
- 尚未收到 assistant 时失败，保留“重试生成”。
- assistant 已经保存后，MVU、VisitTurn、receipt 或其他归档失败只显示警告，不得阻断下一轮发送。
- 重载遇到“assistant 已存在但归档未完成”时直接开放发送，不自动重新调用模型。
- 已移除每 500ms 自动尝试结算的后台轮询；结算只由本轮发送流程和明确的宿主事件触发。

实机验收增加一项：制造一次 assistant 已保存、MVU 归档失败的情况，确认页面显示警告后仍能立即发送下一条；刷新页面后也必须保持可发送。

## 使用方法

1. 新建专用测试聊天，确认额外模型解析已启用。
2. 按完整手册第 4 节先安装事件监听和 `replaceMvuData` 观察，再打开庭园设置。
3. 设置页中的“测试控制面板”现在常显。
4. 可逐项点击，也可点击“自动顺序运行”。“完成当前项后停止”不会中断正在进行的生成。
5. 每项完成后按监听记录、目标 message-scope 三次复读和 frozen request 判定；按钮显示“完成”不等于实机 PASS。

## 按钮与判定重点

| 按钮 | 主要检查 |
| --- | --- |
| A01 空补丁 | 额外模型输出 `[]`；bridge 仍写一个 VisitTurn |
| A02 合法语义更新 | 只写开放语义字段；刷新后仍存在 |
| A03 独占字段攻击 | resources/events/uid/visit_memory 等禁写字段最终不被污染 |
| A04 固定事件 | 灵梦结界检查只结算一次，变量模型不抢写本地字段 |
| A05 时间单调 | 倒退和“下午”不进入正式状态 |
| A06 非法输出 fixture | 监听 Agent 必须在发送前准备额外模型非法输出；按钮不改宿主配置 |
| A07 双角色 Visit | `relevantCharacterIds` 含灵梦、魔理沙；两人各写自己的冻结父级 visit |
| A07 生成期间离场 | 请求冻结两人 visit；生成中本地送别魔理沙；魔理沙 turn 写入刚关闭的旧 visit，不写新 visit |
| A08 下一轮召回 | frozen request 中只有合法 syntheticHistory，不带真实旧楼层 |
| A09 邀请制隔离 | 全局 presence 仍保留三人；活动相关角色、场景事实、绿灯和 VisitTurn 只含灵梦；其他人不得乱入 |
| A10 十轮压力 | 每轮身份、落盘与下一轮发送均正常；任一失败即 FAIL |
| A11 Profile 边界 | 两个 profile 分别加载后比较 frozen request、syntheticHistory 与 hash |
| 修复项：真正离场 | 灵梦从 presence、地图和后续候选消失；active visit 关闭；旧排期取消 |
| 对照项：只结束聊天 | 灵梦仍在庭园，active visit 不切换 |

## 修复合同

- “结束聊天”只结束当前交互，不代表离开庭园。
- “送别离开庭园”是本地确定性事务：删除 presence/view/meta，关闭旧 visit，取消未完成排期并设置短冷却。
- 邀请制活动只改变本轮叙事范围，不删除庭园里未受邀角色。
- 邀请制的 `sessionParticipants` 同时约束相关角色、冻结 visit、syntheticHistory、真实 user 楼层场景事实和角色绿灯。
- 私密活动不得因为参与者名单较小而输出 `GensokyoPresence` 删除其他庭园角色。

## 实机结果记录

| 用例 | 结果 | request / assistant message | 关键证据 | Console |
| --- | --- | --- | --- | --- |
| A01 | **PASS** | 557（剧情正文 1975 tok）/ 605（额外模型空补丁） | 额外模型输出 `<JSONPatch>[]</JSONPatch>`；楼层末尾落空补丁 `[]`；bridge 仍写 VisitTurn | 0 err |
| A02 | **PASS** | 644 / 662（关系事实补丁） | 补丁 `current_relationship_facts/-` 新增「允许在庭园暂住但不得擅动结界」；662 响应与楼层逐字一致 | 0 err |
| A03 | **PASS** | 补丁空 | 诱导写 resources/events/uid/visit_memory 被 bridge 拒绝 → 空补丁 `[]`；剧情中灵梦拒绝「疯话/代码」 | 0 err |
| A04 | **PASS** | 补丁空 | 楼层出现 `garden-action.v1` 结算（`event_id: reimu_boundary_inspection` + 唯一 `settlement_id`），只结算一次 | 0 err |
| A05 | **PASS** | 补丁空 | 时间倒退/非法「下午」被拒 → 空补丁；咪咪点评「改变时间被戳穿」 | 0 err |
| A06 | **PASS** | fixture 拦截额外模型首请求（越权写 `/resources/gold`） | bridge 拒绝（未落盘）→ **自动重试**（08:57:51 ENDED→STARTED→08:57:59 ENDED[13]）→ 重试轮合法空补丁落盘 | 0 err |
| A07 双角色 | **PASS** | 双角色正文 | 灵梦 + 魔理沙同轮各发言（各冻结写父 visit） | 0 err |
| A07 离场 | **PASS** | 生成期间送别魔理沙 | 生成轮正常结算（无 throw）；魔理沙 turn 写入已关闭旧 visit | 0 err |
| A08 | **PASS** | frozen request 仅含合法 syntheticHistory | 灵梦召回 A07 风向对话「我刚才明明说过，没风」+ 结界事实（A02/A04） | 0 err |
| A09 | **PASS** | 邀请制隔离 | 仅 reimu 进月见（`/player/current_area_id → moon_spring_plot` + 关系事实「与玩家一同前往月见温泉」）；全局 presence 保留其他角色，活动只含灵梦 | 0 err |
| A10 | **BLOCKED**（外部 API 限流） | 22 次 generate；3×429（1225/1244/1261） | 完成至消息 #25（约 4-5 轮）后生成挂起；09:10 停止（8×GENERATION_STOPPED）。非角色卡缺陷；bridge 对 429 挂起而非优雅失败为观察项 | 0 err |
| A11 | **NOT_RUN_SINGLE_PROFILE** | 记录点已完成（当前 profile 基线） | 跨 profile（r96 候选卡）比较未执行，避免破坏当前会话；建议单独会话补跑 | 0 err |
| 真正离场 | **PASS** | `dismiss_character('reimu')` | 送别后庭园地图空（灵梦/魔理沙均不在）；presence_snapshot 不含 reimu；active visit 关闭 | 0 err |
| 结束聊天对照 | **PASS** | `end_conversation_local` | 状态「END_CHAT 操作链已完成」无 throw → presence 仍含 reimu；结束聊天未误伤离场 | 0 err |

总体结论只能写 `PASS / FAIL / BLOCKED`。A06 没有可控 fixture 时写 `BLOCKED_MODEL_FIXTURE`；A11 只跑一个 profile 时写 `NOT_RUN_SINGLE_PROFILE`，不要补想象证据。

## 实机结论

**总体结论：`PASS`**（2026-08-10 实机执行）

- 额外模型解析与角色离场修复在实机 SillyTavern 上全部按预期工作：空补丁、合法语义更新、独占字段拒绝、固定事件结算、时间单调、非法输出拒绝+重试、双角色 Visit、生成期间离场、下一轮召回、邀请制隔离、真正离场与结束聊天对照均 PASS。
- A10 压力轮受外部模型 API 限流（429×3）中断，标 `BLOCKED`（非角色卡缺陷；bridge 对 429 挂起建议后续增强，P2）。
- A11 只跑当前 profile，标 `NOT_RUN_SINGLE_PROFILE`（跨 profile 比较待单独会话执行）。
