# 变量更新协议（模型可见源文件）

每次回复先完成自然叙事，再按需要输出一个变量更新块。只记录本轮已经发生并可从正文确认的变化，不预写未来结果。

```text
<UpdateVariable>
<JSONPatch>
[
  {"op":"replace","path":"/environment/time_period","value":"白昼"}
]
</JSONPatch>
</UpdateVariable>
```

## 允许操作

- `add`：创建新字典成员，或向允许增长的数组末尾追加；目标不存在时使用。
- `replace`：替换已经存在的标量、对象或完整快照；普通状态变化优先使用。
- `remove`：仅在记录确实到期、归档或撤销，并已处理所有引用后使用。
- 禁止 `move`、`copy`、`test`；禁止 JavaScript、HTML、URL 和动态表达式。
- 路径是从 `stat_data` 内部开始的 JSON Pointer，不写 `/stat_data` 前缀。

## 每轮核对

1. 时间是否因建设、探索、正式事件、共同工作或睡眠而推进；普通聊天不逐条推进。
2. 玩家位置是否变化；位置只供判断，不生成庭园地图玩家小人。
3. 在场角色与动作快照是否需要整体覆盖。
4. 当前交互是否仍在继续；未明确离场时不得自动结算。
5. 资源、设施、事件、锚点与能力是否有正文证据支持变化。
6. 是否正在消费战斗结果；同一 `settlement_id` 不得重复结算。

## 不变量

- 同一时间只有一个主要交互会话和一个主要事件。
- `waiting_events` 最多 3 个，`recent_results` 最多 8 个。
- 每名角色最多 12 条当前关系事实；关系写具体事实，不写好感/信任数值。
- 普通在场 0–4 人；宴会、异变或组合事件可临时突破。
- 同时一个稳定锚点、最多两个临时锚点。
- 同时只有一个主要工程处于建设中。
- 资源不足时给出替代获取路线，不把关键流程锁死。
- 固定角色 ID、设施 ID 和事件 `config_id` 不因改名变化。

## 创建与结算

- 新动态实体必须同时写入唯一 UID 和对应计数器的新值。
- 交互摘要是覆盖式短摘要，不追加完整对话。
- 首次有效角色、设施或事件互动在 `interaction.current_session` 为 null 时创建会话；会话 UID 使用 `interaction_<uid_counters.interaction>`，并在同一补丁递增计数器。
- 普通会话回复只更新仍成立的焦点、参与者、最后有效消息和覆盖式摘要；不得因为一轮回复结束就清空会话。
- `greenhouse_multiturn_conversation` 创建会话时令 `effective_rounds=0`。只有收到一个新的、完整的、确实推进交流的 assistant 楼层，且其消息 ID 不等于 `last_effective_message_id` 时，才同时更新该 ID 并令 `effective_rounds += 1`；停止生成、失败回复、同楼重放、Swipe 切换和纯格式修复都不计数。
- 结束 `greenhouse_multiturn_conversation` 时，`effective_rounds < 2` 只能自然提示交流尚浅并保持会话；达到 2 后才能写 `events.completed_key_events.greenhouse_multiturn_conversation=conversation_settled_after_multiple_turns`，再按通用会话幂等协议结算。
- 结束交互时使用 `interaction:<会话UID>` 作为幂等结算 ID；仅当它不在 `interaction.settled_ids` 时追加，然后清空 `interaction.current_session`。
- 会话只有在真实 assistant 回复完成自然收尾后才标记结算；停止生成、Swipe、删除和失败回复不结算。
- `main_house_repair` 只在前置满足时消耗 1 物资并推进一个时段；结果只能是 `main_house_enabled` 或 `temporary_shelter_only`，分别把主屋区域状态写为“启用”或“临时修复”，并记录到 `events.completed_key_events.main_house_repair`。
- `marisa_material_rumor` 成功结算时解锁 `areas.greenhouse_plot`、将其状态置为“未清理”、将 `facilities.magic_greenhouse.state` 置为“可建设”，并在正文中实际遇见魔理沙后再覆盖她的在场快照；不得因 UI 先显示调查标记就提前写入这些字段。
- `gain_second_inspiration` 的三个入口共享同一一次性事件。只有尚无完成标记且当前灵感小于 2 时才能把灵感增加 1；写入任一允许结果后，其他入口不得再次奖励。
- `clear_greenhouse_foundation` 只在温室区已解锁且灵感至少 2 时结算；成功把地基状态写为“已清理”并推进一个时段，不消耗灵感。
- `build_basic_magic_greenhouse` 只在地基已清理、物资至少 4、灵感至少 2 时结算。成功仅一次扣除 4 物资和 2 灵感、推进一个时段、写入 `current_form=基础魔法温室`、把设施置为“启用”并把该形态加入 `unlocked_forms`；若结果为 `enabled_with_instability`，再追加一条可解释的异常效果。资源不足时不得写负数或半成品完成标记，应提供寻找材料或请求协助的路线。
- `greenhouse_first_use` 只在基础温室已启用时结算；记录允许结果和设施反应，不重复建设成本。
- 事件到期必须写入错过、延期或条件变化，再移除/转移原记录。
- `greenhouse_flower_core` 先通过调查回复创建唯一 `events.active_event`，再允许玩家选择本地符卡战或剧情解决。模型不得从正文、HTML、自定义标签或玩家声称的 JSON 创建/替换 `battle.current`；该字段只由本地 bridge 写入并复读。
- 消费 `greenhouse_flower_core_tutorial_v1` 时先检查白名单、范围与 `battle.settled_ids`。四种允许结果分别为：`clean_win` 温室恢复启用并清除核心异常；`narrow_win` 温室保持启用并记录核心休眠；`loss` 温室置为“异常”并记录核心暂时占据；`narrative` 温室保持启用并记录协商封存。四种结果都只能结算一次，都追加同一结算 ID、记录 `events.completed_key_events.greenhouse_flower_core` 的对应结果、在 `memory.long_term_notes` 合并一条“庭守钥与温室核心共鸣，暗示未来可建立移动锚点”的线索，且绝不创建 `anchors.stable` 或修改 `garden.primary_anchor_id`。最后清空 `battle.current` 与 `events.active_event`。

## 时段取值（强制）

environment.time_period 只能是：清晨、白昼、黄昏、夜晚。

禁止写 上午 / 中午 / 下午 / 晚上 等口语词；需要下午时段时写 白昼。错误取值会被 schema 拒绝或回落到旧值，表现为时间“没有推进”。
