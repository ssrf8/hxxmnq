# R48 后续修复与到期待办优化计划

> 状态：仅完成诊断与规划，尚未实施代码修复。  
> 记录日期：2026-07-26。  
> 目标基线：`幻想乡物语·移动庭园（测试检查点 0.2.0-r48）`。  
> 实施原则：所有确定性状态转移由本地代码原子完成；只有明确需要剧情正文时才调用 LLM。

## 1. 本轮确认需求

1. 使用异变卡时不调用 LLM。扣卡、建立异变、锁定隐藏源头和七日周期全部由代码完成；异变影响从玩家下一次正常发言开始进入提示词。
2. 点击“结束聊天”时直接结束并返回庭院，不再请求一段告别或收尾正文，不创建新的用户楼层，也不调用 LLM。
3. 异变到达七日终点时：
   - 当前没有进行中的聊天或受控场景：允许立即发起一次异变最终收尾 LLM 请求；
   - 当前正在聊天：不得打断本轮，结束聊天后在待办事项中提醒玩家处理异变收尾；
   - 玩家不点击待办：从到期时段起再经过 4 个标准时段后，由代码默认完成异变收尾并归档，不再调用 LLM。
4. 已安排宴会到达开始时间时创建“开始宴会”待办和明确入口，不得只在后台把计划改成 active。
5. 玩家不处理宴会待办：到期后再经过 4 个标准时段，由代码视为宴会已经举行并结束，清空宴会安排及临时活动状态，恢复普通来访上限，不调用 LLM。
6. 所有自动结算必须幂等；刷新、切楼层、重新打开游戏和重复时间协调不得重复归档、重复清理或重复生成。

## 2. 运行时证据与根因

### 2.1 异变卡仍调用一次 LLM

证据聊天：

`F:\agent airp\Luker\data\default-user\chats\幻想乡物语·移动庭园（测试检查点 0.2.0-r48）\幻想乡物语·移动庭园（测试检查点 0.2.0-r48） - 2026-07-26@02h15m07s434ms.jsonl`

- 第 3 行是 `interaction` 用户楼层，提示内容明确写着“异变卡已由本地代码完成……自然演绎异变首次发生……”。
- 第 4 行模型返回空 `JSONPatch`；扣卡、active 异变、七日周期与隐藏源头在调用前已经存在，证明这次调用只用于额外开场剧情。
- 直接调用点位于 `src/ui/app.ts` 的异变卡使用分支：状态提交后仍执行 `bridge.sendUserMessage(..., 'interaction')`。

结论：状态所有权已经正确移到代码，但“启用后自动生成首次影响剧情”的旧产品行为仍然存在，不符合“使用卡片零调用”的最终要求。

### 2.2 点击结束聊天后反复调用 LLM

同一聊天文件中：

- 第 5、7、11 行分别是三个不同 `gensokyoTransactionId` 的 `settlement` 用户楼层；它们不是同一请求的宿主重放，而是界面三次重新提交。
- 三个楼层都带 `action_id: end_conversation`，并要求模型生成“简短自然的收尾”。
- `src/ui/app.ts::endConversation()` 当前调用 `buildSettlementMessage()`，再调用 `submitGalMessage(..., 'settlement')`，所以“结束聊天”本身被设计成一次 LLM 生成。
- `closurePending` 与 `closurePresented` 只存在于 iframe 内存。结束回复生成期间若 iframe 重载或恢复，`closurePending` 会丢失；最新 assistant 楼层随后被当成普通对话重新投影，按钮再次显示“结束聊天”。玩家再次点击就会产生新的事务 ID 和新一轮 LLM 调用。

结论：反复调用的直接原因是结束按钮每次都发起新 settlement；放大原因是会话结束标记依赖易丢失的 UI 内存。改成纯本地结束后，两项根因应同时消失。

### 2.3 宴会到时没有开始入口

- `src/ui/activity-rules.ts::tickActivitiesOnTimeAdvance()` 在到期时调用 `startDueBanquet()`。
- `startDueBanquet()` 会立即将 `scheduled_banquet` 搬到 `banquet` 并把状态改成 `active`。
- `src/ui/app.ts::renderOpportunities()` 没有为已经 active 的这场宴会渲染“进入/开始宴会”入口，只渲染“立即举办公开宴会/邀请宴会”的新建按钮。
- 此时再次点击新建按钮又会被“已有宴会计划或活动”阻止，因此形成后台 active、前台无入口的死状态。
- 最新 R48 聊天的最终楼层已经没有宴会计划，无法仅凭该楼层还原用户此前那次安排；但源码中的状态转移和渲染缺口足以确认这是结构性问题。

## 3. 总体状态设计

### 3.1 新增代码持有的待办队列

建议新增根字段：

```ts
pending_tasks: Array<{
  task_id: string;
  kind: 'anomaly_resolution' | 'banquet_start';
  status: 'pending' | 'processing';
  created_period_serial: number;
  due_period_serial: number;
  auto_resolve_period_serial: number;
  source_id: string;
  label: string;
  payload: Record<string, unknown>;
}>;
```

约束：

- 本地代码是唯一 writer；变量模型不得增删或改写。
- `(kind, source_id)` 唯一，同一异变或宴会最多存在一个未完成待办。
- UI 只渲染并调用白名单命令，不直接修改原始状态。
- 点击成功或自动结算成功后删除待办；失败则从 `processing` 恢复 `pending`，不得永久卡住。
- `auto_resolve_period_serial = due_period_serial + 4`。以绝对时段计算，避免季节、日期显示或一次跨多时段更新造成歧义。
- 历史结果写入各自业务历史，不把已完成待办当长期事件日志保留。

需要同步维护：

- `src/ui/types.ts`
- `src/schema/02-mvu-schema.js`
- `src/schema/initial-state.json`
- `src/schema/field-ledger.md`
- `src/ui/state-migrations.ts`
- `src/lorebook/variable-update-rules.md`
- 如模型需要知道存在到期事项，只投影业务事实，不暴露隐藏源头或内部 task_id。

### 3.2 调度顺序

每次可信时间更新后，`reconcileM2Runtime()` 应按固定顺序执行：

1. 读取更新前、更新后的绝对时段。
2. 推进设施解锁和现有时间规则。
3. 检测异变到期与宴会计划到期，创建幂等待办。
4. 若没有阻塞场景，按“可立即启动”规则决定是否呈现入口；调度器本身不得偷偷发起 LLM。
5. 对达到 `auto_resolve_period_serial` 的待办执行本地默认结算。
6. 最后运行来访调度与人数上限清理。

重要边界：纯状态协调函数不得直接调用 `sendUserMessage()`。是否生成剧情只能由明确的 UI 命令触发；唯一例外是产品最终确认的“空闲时异变到期立即调用一次 LLM”，也必须由桥接层的单次持久化系统操作触发，而不能由纯函数触发。

## 4. 详细实施任务

### P0-1：异变卡启用改成完全零 LLM

1. 删除 `src/ui/app.ts` 中异变卡提交成功后的“正在生成首次影响剧情”和 `sendUserMessage()` 分支。
2. 启用成功后只执行：刷新状态、关闭/复位表单、显示本地成功提示、返回背包或庭院。
3. 不创建用户楼层，不设置 transaction busy，不出现“对方正在回应”或“正在同步游戏状态”遮罩。
4. 保留 `buildOrdinaryAnomalyPrompt()`：下一次玩家主动发起的正常聊天自然携带异变背景。
5. 删除或修正所有仍声称“启用后生成开场剧情”的计划、字段说明和测试断言。

### P0-2：结束聊天改成纯本地、原子、幂等

1. `endConversation()` 不再构建 settlement prompt，不再调用 `submitGalMessage()` 或 `bridge.sendUserMessage()`。
2. 新增本地命令，例如 `end_conversation_local`，在一次 MVU 写回中完成：
   - 清理 `interaction.current_session`；
   - 清理 `scene_item_context` 及只在本轮有效的道具影响；
   - 按现有产品规则关闭与本轮强绑定的温泉/宴会场景；
   - 结束本轮临时表现状态，但不推进时间；
   - 保留此前真实用户/assistant 楼层作为历史。
3. 本地命令完成并复读成功后立即清空 `activeTarget`、`activeSceneId`、GAL 投影和临时输入，再返回庭院。
4. 连点保护采用同步禁用与命令幂等，不再依赖 `closurePending/closurePresented` 跨异步生成保存。
5. 若异变已经到期且因当前聊天被延迟，结束命令完成后创建/展示异变收尾待办；不能顺便生成收尾正文。
6. 若本地写回失败，留在当前聊天并显示“重试本地结束”，不得退而求其次调用 LLM。

### P0-3：异变到期、提醒与默认收尾

状态转移：

```text
active
  -> 到达 end_period_serial
  -> resolving + 创建 anomaly_resolution 待办
  -> 空闲时允许单次 LLM 收尾 / 聊天中等待结束后提醒
  -> 玩家点击并生成成功后本地归档
  -> 或到 auto_resolve_period_serial 后本地默认归档
```

实施要求：

1. 到期时只允许一次 `active -> resolving`，待办 `source_id` 使用 `anomaly_id`。
2. 有当前聊天、战斗、固定事件、设施受控剧情或正在生成事务时，不自动插入异变收尾楼层。
3. 空闲且没有生成事务时：
   - 推荐实现为先显示高优先级待办并自动打开一次确认入口；
   - 若严格执行“直接调用 LLM”，必须持久化 `system-operation.v1/anomaly_resolution` 后只提交一次，并在刷新/切楼层时根据 operationId 恢复，禁止重复提交。
4. 玩家点击待办后调用一次最终收尾 LLM；本轮回复仍携带异变完整影响与隐藏源头，回复成功后由代码 `resolveAnomaly()` 归档。
5. 自动期限到达时不调用 LLM：直接执行 `resolveAnomaly(state, null)`，写入 history，清空 active 和待办，并用本地通知说明“异变已由灵梦在幕后完成收束”。
6. 自动归档必须算作正式完成，不留下 `resolving`、遮罩或可重复领奖状态。
7. 一次时间更新跨过多个时段时直接按最终 serial 计算；最多归档一次。

### P0-4：宴会到期待办、入口与默认举行

建议宴会状态改为：

```text
scheduled
  -> 到达 start_period_serial
  -> due_waiting + banquet_start 待办
  -> 玩家点击：active，进入宴会场景
  -> 玩家正常结束：completed，本地清理
  -> 或 4 时段未处理：assumed_completed，本地清理
```

实施要求：

1. `startDueBanquet()` 不再在后台无入口地直接制造 active 宴会；改为标记计划已到期并创建待办。
2. 待办卡显示宴会类型、原定开始时段、已接受/邀请角色，并提供“开始宴会”按钮。
3. 点击按钮时再次校验对应计划仍存在、task/source ID 匹配，再原子转为 active；随后才允许调用一次宴会开场 LLM。
4. 活动 active 后，机会面板必须持续提供“进入当前宴会”入口，刷新或离开 UI 后仍可返回，不得只剩“立即举办新宴会”。
5. 到 `start_period_serial + 4` 仍未处理时：
   - 将宴会记录为默认已举行；
   - 清空 `scheduled_banquet`、`banquet` 和对应待办；
   - 清理宴会临时场景道具与超出普通上限的访客；
   - 不调用 LLM，不生成空聊天楼层；
   - 本地通知玩家“宴会已按计划举行并结束”。
6. 为避免“默认举行”没有任何可审计痕迹，建议在 `garden_activities` 增加最多 8 条轻量历史摘要，至少记录 uid、模式、计划开始 serial、完成方式 `played | assumed_completed`；若不增加历史，则必须至少写入 `events.settled_ids` 防重复。
7. 新建宴会按钮在存在 scheduled、due_waiting 或 active 宴会时明确禁用并显示原因；不能让用户点进去才报错。

### P1-1：统一待办 UI

1. 在庭院主界面增加“待办事项”区域，按到期优先级排序。
2. 异变收尾与宴会开始使用不同标题和说明，但复用相同任务组件。
3. 显示“剩余 N 时段后自动处理”；到期时显示“将在本次时间结算中自动处理”。
4. 生成中仅禁用会触发模型或写状态的按钮；待办仍应可见。
5. 没有待办时区域折叠，不占据主要操作空间。
6. 页面刷新、设置往返、切原生楼层再返回时，待办必须从 MVU 恢复。

### P1-2：清理旧的会话收尾协议

1. 删除不再使用的普通 `buildSettlementMessage()` 调用链；若固定事件仍需要剧情收尾，重命名为明确的系统场景收尾，禁止普通结束按钮复用。
2. 审计 `settlement` transaction kind：仅保留战斗、固定事件、异变最终收束等确实需要一条模型回复的场景。
3. 删除或局部保留 `closurePending/closurePresented`；不得再用它们表示普通聊天是否结束。
4. “GAL 返回”与“结束聊天”采用同一本地结束命令，避免一个按钮返回、另一个生成。
5. 更新提示文本和遮罩标签，不能再出现“结束聊天后正在等待对方回应”。

## 5. 建议改动文件

- `src/ui/app.ts`：结束聊天、异变卡启用、待办渲染、宴会进入入口。
- `src/ui/bridge.ts`：本地结束命令、异变收尾单次系统操作、事务恢复。
- `src/ui/m2-commands.ts`：待办点击、结束会话、宴会到期处理命令。
- `src/ui/m2-runtime.ts`：统一到期检测与自动结算顺序。
- `src/ui/anomaly-rules.ts`：到期待办、手动/自动归档幂等规则。
- `src/ui/activity-rules.ts`：宴会 due_waiting、开始、正常结束和 assumed_completed。
- `src/ui/open-garden-rules.ts`：待办和当前宴会的展示模型。
- `src/ui/types.ts`、`src/schema/02-mvu-schema.js`、`src/schema/initial-state.json`、`src/ui/state-migrations.ts`：字段链与旧存档兼容。
- `src/schema/field-ledger.md`、`src/lorebook/variable-update-rules.md`、`src/lorebook/model-projection.md`：所有权和投影规则。
- `tests/m2-r38-r45.test.mjs`、`tests/ui-contract.test.mjs`：状态机与 UI 合同回归。

## 6. 实施日志要求

执行 agent 必须新建：

`project/r48-followup-implementation-log.md`

每个任务至少记录：

1. 完成时间与任务编号；
2. 实际修改文件；
3. 状态字段或行为变化；
4. 执行的测试命令及结果；
5. 尚未实机验证的部分；
6. 发现但未擅自扩大的问题；
7. 打包文件名与 SHA-256。

禁止把计划条目直接标成“已验收”。自动测试通过只能标记“实现完成/待实机验收”。

## 7. 自动测试清单

### 异变启用

- 使用卡片后卡数减一、active 建立、期限为当前 serial + 28、隐藏源头固定。
- 消息列表长度不变；`sendUserMessage` 调用次数为 0。
- 下一次普通聊天的提示词包含异变背景。

### 结束聊天

- 点击一次后立即回庭院，消息列表长度不变，LLM 调用次数为 0。
- 连点、刷新后重试、设置往返均不会新增 `settlement` 楼层。
- 当前会话、场景道具和绑定活动按合同清理；时间不推进。
- 本地写回失败时仍不调用 LLM，并提供可重试错误。

### 异变到期

- serial 到 28：active 变 resolving，仅一个待办。
- 当前聊天中到期：不打断、不生成；本地结束聊天后待办可见。
- 玩家点击待办：只生成一次最终收尾，成功后归档。
- serial 到 32 仍未点击：零 LLM 自动归档，待办消失。
- 从 27 一次跳到 33：仍只归档一次。

### 宴会到期

- 安排在 +2；到达开始 serial 后出现待办，不会出现无入口 active。
- 点击待办后进入正确的公开/邀请宴会，刷新后仍有“进入当前宴会”。
- 忽略 4 时段后清空安排、视为举行过、恢复普通人数上限，零 LLM。
- 同一到期事件重复协调不会创建重复待办或重复历史。

## 8. 实机验收流程

1. 导入新包并新建聊天，使用验收跳转补足异变卡和宴会设施。
2. 记录原生楼层数，使用异变卡；确认无生成遮罩、无新增楼层、状态立即生效。
3. 发起一次普通聊天，确认剧情受到异变影响；点击“结束聊天”，确认立即回庭院且楼层数不增加。
4. 重复进入聊天并在生成完成后切原生楼层、打开设置再返回；再次结束，确认不会重复生成。
5. 跳到异变到期前一时段，在聊天中推进到期；确认当前回复完成但不插入收尾，结束聊天后出现待办。
6. 分支 A：点击待办，确认只调用一次最终收尾并完成归档。
7. 分支 B：不点击，推进 4 时段，确认本地自动收尾、无模型调用、无残留 resolving。
8. 安排公开宴会在 +2 时段开始，推进到点；确认待办和开始入口出现。
9. 分支 A：点击开始，确认进入宴会；刷新/返回后仍可进入当前宴会并能正常结束。
10. 分支 B：不点击并推进 4 时段；确认安排清空、默认完成记录存在、人数上限恢复且没有模型楼层。
11. 检查控制台、原生聊天文件、最新 assistant 楼层 MVU 与游戏 UI，四者状态一致。

## 9. 完成定义

只有同时满足以下条件才可交付打包：

- 异变卡启用与普通结束聊天均为零 LLM、零新增楼层。
- 聊天文件不再出现由普通 `end_conversation` 产生的 settlement 楼层。
- 异变和宴会到期都有持久化、可恢复、可点击的待办入口。
- 两类待办忽略 4 时段后都能本地幂等完成，不留下死状态。
- schema、初始化、迁移、字段账本、模型投影、UI 和测试全部一致。
- 自动测试、UI 构建、打包审计通过；真实 SillyTavern 仍需用户按第 8 节共同验收。
