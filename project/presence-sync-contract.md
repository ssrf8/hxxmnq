# 在场快照同步契约

`presence_snapshot` 是地图小人与模型现场判断的唯一来源。每次庭园请求必须显式传入：在场角色 ID、角色名、区域、动作、朝向，以及完整的不在场名单。

正文只能让在场角色出现在现场、发言或行动。若角色明确抵达、离场或换区，助手必须在正文结束后给出一次 `GensokyoPresence` JSON 回执。本地仅保留已登记的角色 ID，并用回执原子覆盖 `presence_snapshot` 的“模型可写名单与视图”部分；地图和下一次请求都读取该回执结果。

没有出入场或位置变化时不得输出回执。叙事中的离场而未同步快照、或快照已移除而正文仍把角色写在现场，均属于状态错误。

## visitor_meta 所有权与生命周期

- `visitor_meta`（含 `planned_departure_serial`）由本地 bridge 独占，是本地主动离场调度的依据。模型回执**不得**写入或伪造 `visitor_meta`。
- 回执原子覆盖的是“模型可写的名单与视图”：
  - 角色仍在场：bridge 必须**保留**该角色的全部原 `visitor_meta`（包括未知 passthrough 字段）；
  - 角色已离场：bridge 必须**同步删除**其 `character_views` 与 `visitor_meta`；
  - 回执新加入的合法角色：允许进入名单和视图，但不得由模型生成 `visitor_meta`；
  - 无合法回执时原样返回，不借机清理或重建 meta。
- 固定事件新增角色的生命周期由 bridge 根据登记档案生成：`applyLocalPresenceTransition` 只对真正新增且无 meta 的 `arrive` 角色创建 `source: 'event'` 的确定性 `VisitorMeta`（`arrival_uid` 优先取 `action.settlement_id`，`reason_id` 为 `event:${event_id}`，`planned_departure_serial` 由 `stay_period_range` 与稳定种子确定）；`leave` 角色同步删除名单、视图与 meta。
