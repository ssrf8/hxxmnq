# MVU 字段台账 v0.2.0

`stat_data` 是唯一正式状态源。下表中的“模型”指正文与变量更新模型，“桥接”指本地同层应用 bridge，“数据库”只允许读取已结算摘要的副本。

| 路径 | 类型/默认值 | 写入者 | 读取者/渲染者 | 清理与迁移 |
|---|---|---|---|---|
| `meta.schema_version` | 字面量 `0.2.0` | 迁移器 | schema、诊断页 | 只由幂等迁移修改；失败保留旧快照 |
| `meta.initialized` | boolean/false | 确定性开场 bridge | 模型、开场页 | 首个 assistant 楼层写入并复读成功后置 true，不回退 |
| `meta.opening_committed` | boolean/false | 确定性开场 bridge | 开场页 | 防重复提交；失败时保持 false；不同资料禁止静默覆盖 |
| `environment` | 日期、时段、季节、天气 | 模型 | 模型、庭园页 | 时段按固定环推进；季节日限制 1–30 |
| `player` | 身份与当前位置 | 确定性开场 bridge、模型 | 模型、庭园交互 | 草稿编辑不写入；确认时只覆盖身份字段；位置不生成地图玩家小人 |
| `garden` | 庭园名、建设阶段、锚点引用 | 确定性开场 bridge、事件模型 | 模型、庭园页 | 开场只覆盖名称；临时锚点最多 2 个；引用必须存在 |
| `resources` | 物资 0–20、灵感 0–10 | 模型 | 模型、资源显示 | schema 夹取范围；不足时不得形成死局 |
| `areas.{id}` | 固定/动态区域记录 | 模型、迁移器 | 模型、地图 | 固定 ID 不改名；删除前解除设施引用 |
| `facilities.{id}` | 设施状态与形态 | 模型 | 模型、地图、事件 | 主设施每区一个；形态列表去重由桥接校验 |
| `characters.{id}` | 角色稳定档案 | 模型 | 模型、地图、数据库归档 | 固定八人永久保留；动态档案最多 16 个 |
| `characters.{id}.current_relationship_facts` | 最多 12 条事实对象 | 模型 | 相关场景模型 | 冲突事实先失效/归档再新增；不存好感数值 |
| `presence_snapshot` | 本轮在场和动作快照 | 模型 | 地图、模型 | 每轮覆盖，不作为长期事实；玩家不得进入角色视图 |
| `interaction.current_session` | null 或单一会话 | 模型 | 模型、剧情页 | 同时仅一个；只有自然收尾后 settled=true 并清空 |
| `interaction.settled_ids` | 最多 64 个交互结算 ID | 模型 | 模型、GAL 幂等检查 | 只追加已复读成功的会话结算；重复 ID 禁止再次结算 |
| `events.active_event` | null 或正式事件 | 模型 | 模型、剧情页 | 同时仅一个；结算后转入近期结果/关键标记 |
| `events.waiting_events` | 最多 3 个事件 | 模型 | 调度器、模型 | 满载时拒绝低优先事件；到期不可静默删除 |
| `events.recent_results` | 最多 8 条短摘要 | 模型 | 模型、数据库归档 | FIFO；关键结果另存永久标记 |
| `anchors.stable` | 锚点字典 | 模型 | 地图、剧情 | 同时只有一个 `garden.primary_anchor_id` |
| `anchors.temporary` | 锚点字典 | 模型 | 地图、剧情 | 最多 2 个；到期生成可解释结果后移除 |
| `battle.current` | null 或待结算结果 | 战斗 bridge | 模型、战斗页 | JSON 白名单校验；结算后写 settled_ids 并清空 |
| `battle.settled_ids` | 最多 64 个 ID | 模型/bridge | 幂等校验 | 重复 ID 拒绝二次结算 |
| `key_items` | 关键物品字典 | 确定性开场 bridge、模型 | 模型、UI | 开场只确认庭守钥取得与苏醒；不进入传统背包；关键物不得无因删除 |
| `abilities` | 最多 32 条事实解锁 | 模型 | 模型、战斗 | 必须记录剧情来源；不用等级/经验 |
| `memory.long_term_notes` | 最多 24 条短事实 | 模型 | 条件投影、数据库归档 | 不存流水账；相近内容合并 |
| `uid_counters` | 正整数计数器 | 模型/bridge | 实体创建器 | 创建实体与计数器更新必须同一补丁完成 |

## 关键对象约束

- 关系事实：`id`、`subjects[]`、`fact`、`source_event_id`、`established_at`、`active`、`last_confirmed_at`。
- 交互会话：`uid`、`type`、`status`、`area_id`、参与者、关联设施/事件、开始时间、焦点、最后有效消息、600 字摘要、结算状态。
- 正式事件：稳定 `config_id` 与实例 `uid` 分离；保存状态、优先级、参与者、关联设施、期限和摘要。
- 战斗结果：只接受预登记 `config_id`；`settlement_id` 是一次性结算键。

## 未知字段策略

所有正式对象使用 passthrough，迁移时保留未知字段，避免旧聊天被静默裁剪。只有展示快照和有明确上限的列表会在 schema 阶段限长；语义去重与跨引用清理由桥接校验负责。
