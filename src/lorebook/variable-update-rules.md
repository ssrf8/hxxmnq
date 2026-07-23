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
- 结束交互时使用 `interaction:<会话UID>` 作为幂等结算 ID；仅当它不在 `interaction.settled_ids` 时追加，然后清空 `interaction.current_session`。
- 会话只有在真实 assistant 回复完成自然收尾后才标记结算；停止生成、Swipe、删除和失败回复不结算。
- `main_house_repair` 只在前置满足时消耗 1 物资并推进一个时段；结果只能是 `main_house_enabled` 或 `temporary_shelter_only`，分别把主屋区域状态写为“启用”或“临时修复”，并记录到 `events.completed_key_events.main_house_repair`。
- 事件到期必须写入错过、延期或条件变化，再移除/转移原记录。
- 战斗结果先检查白名单、范围与 `settled_ids`；成功消费后追加结算 ID、写剧情结果并清空 `battle.current`。

## 时段取值（强制）

environment.time_period 只能是：清晨、白昼、黄昏、夜晚。

禁止写 上午 / 中午 / 下午 / 晚上 等口语词；需要下午时段时写 白昼。错误取值会被 schema 拒绝或回落到旧值，表现为时间“没有推进”。