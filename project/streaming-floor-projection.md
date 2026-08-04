# GAL 流式 assistant 楼层投影

## 目标

Luker 的假流式生成会先创建空 assistant 楼层，再在生成期间或结束后写入正文。GAL 不得把空占楼、发送控件复位或 `GENERATION_ENDED` 单独解释为“没有回复”。

## 状态约定

1. 事务以带 `gensokyoTransactionId` 的 user 楼层为边界，只查找它之后的 assistant 楼层。
2. `STREAM_TOKEN_RECEIVED`、`MESSAGE_UPDATED` 和 `MESSAGE_RECEIVED` 只触发楼层重读与界面刷新；assistant 楼层正文是唯一的展示来源。
3. assistant 正文非空而宿主仍生成时：事务保持 `generating`，GAL 显示当前正文及“回复正在生成”，所有继续、输入和本地结算保持锁定。
4. 收到 `GENERATION_ENDED`，或已知宿主 generation state 变为 idle 后，且同一 assistant 楼层已非空：事务进入 `settling`，之后才允许 MVU/本地事件结算。
5. `GENERATION_STOPPED` 不是通用失败信号。只有 GAL 的明确停止操作会调用 `markStopped`；这避免 Luker 接管链路的泛化 STOPPED 事件覆盖仍在写入的正文。
6. 只有在 120 秒内持续找不到本轮非空正文时，事务才进入可重试失败态。

## 实机验收

- 普通发送：空 assistant 占楼时 GAL 保持生成态，不显示“没有收到回复”。
- 假流式：正文落盘后，GAL 在仍生成时显示当前内容；最终结束后才同步状态。
- 真实流式：token 到来时界面更新，输入和建议回复始终锁定。
- 原生/GAL 停止：只有明确停止才进入“可继续生成”。
- 重新生成与 swipe：始终绑定当前 user 楼层之后的 assistant 楼层，不借用旧回复。
- 真无回复：超时后显示失败、原生聊天入口和重试，不创建重复 user 楼层。

## 运行时依赖

- Luker/SillyTavern core：`STREAM_TOKEN_RECEIVED` 的 payload 为增量文本；该事件随后推进当前消息楼层的流式渲染。
- Tavern Helper：`getChatMessages`、`eventOn`、`tavern_events` 与 `SillyTavern.getCurrentChatId` 可用。
- MVU：仅在 assistant 正文最终可用后写入本地结算状态。
