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
| `resources` | 物资 0–20、灵感 0–10、金币 0–99999 | 本地副本奖励、商店事务 | 模型、资源显示、商店 | 旧存档缺失金币时迁移补 0；不得从正文猜余额 |
| `areas.{id}` | 固定/动态区域记录 | 模型、迁移器 | 模型、地图 | 固定 ID 不改名；删除前解除设施引用 |
| `facilities.{id}` | 设施状态与形态 | 模型；R31 方案登记由本地结算器 | 模型、地图、事件 | 主设施每区一个；形态列表去重由桥接校验 |
| `characters.{id}` | 角色稳定档案 | 模型；R31 魔理沙合作事实由本地结算器 | 模型、地图、数据库归档 | 固定八人永久保留；动态档案最多 16 个 |
| `characters.{id}.current_relationship_facts` | 最多 12 条事实对象 | 模型；受控方案事件的本地结算器 | 相关场景模型 | 冲突事实先失效/归档再新增；不存好感数值 |
| `presence_snapshot` | 本轮在场和动作快照 | bridge（校验剧情模型的 `presence.v1` 回执；固定事件按登记的 `presence_transition` 本地迁移） | 地图、模型 | 每轮整体覆盖，不交给额外变量模型；玩家不得进入角色视图 |
| `interaction.current_session` | null 或单一会话 | 额外变量模型；受控温室会话由 bridge 独占 | 模型、剧情页 | 同时仅一个；受控会话不允许模型替换父对象绕过所有权 |
| `interaction.current_session.effective_rounds` | integer/0 | bridge | 温室多轮会话门槛 | 仅完整且有效的新 assistant 回复递增；停止、失败、Swipe、重放与同消息 ID 不计数 |
| `interaction.settled_ids` | 最多 64 个交互结算 ID | 额外变量模型；受控温室会话由 bridge 独占 | 模型、GAL 幂等检查 | 只追加已复读成功的会话结算；重复 ID 禁止再次结算 |
| `events.active_event` | null 或正式事件 | 模型 | 模型、剧情页 | 同时仅一个；结算后转入近期结果/关键标记 |
| `events.waiting_events` | 最多 3 个事件 | 模型 | 调度器、模型 | 满载时拒绝低优先事件；到期不可静默删除 |
| `events.recent_results` | 最多 8 条短摘要 | 模型 | 模型、数据库归档 | FIFO；关键结果另存永久标记 |
| `events.settled_ids` | 最多 256 个正式事件结算 ID | bridge | 本地事件恢复与幂等检查 | 每个真实 assistant 楼层的受控结算只追加一次；FIFO，额外变量模型禁写 |
| `anchors.stable` | 锚点字典 | 模型 | 地图、剧情 | 同时只有一个 `garden.primary_anchor_id` |
| `anchors.temporary` | 锚点字典 | 模型 | 地图、剧情 | 最多 2 个；到期生成可解释结果后移除 |
| `battle.current` | null 或待结算结果 | 战斗 bridge | 模型、战斗页 | JSON 白名单校验；结算后写 settled_ids 并清空 |
| `battle.settled_ids` | 最多 64 个 ID | 模型/bridge | 幂等校验 | 重复 ID 拒绝二次结算 |
| `battle.dungeon_unlocked` | boolean/false | 妖花核心本地结算、迁移器 | 副本入口 | 教学战完成后永久为 true |
| `battle.run_count` / `last_run` / `rewarded_ids` | 副本次数、最近结果、最多 256 个奖励 ID | 本地副本事务 | 顶栏、结果页、幂等校验 | 每个 ID 只能奖励并推进时段一次；FIFO 清理 |
| `shop` | 解锁、最多 256 个购买 ID、最多 128 个静态对话 ID | 本地商店事务、迁移器 | 小店入口与视图 | 妖花核心完成后解锁；未知商品和重复 ID 拒绝 |
| `inventory.consumables` | 消耗品 ID 到 0..99 数量 | 本地商店与道具事务 | 小店、背包、道具使用 | 购买与使用原子增减；异变卡失败时不消费；玩家不能自建 item ID |
| `key_items` | 关键物品字典 | 确定性开场 bridge、模型 | 模型、UI | 开场只确认庭守钥取得与苏醒；关键物不得无因删除 |
| `key_items.sakuya_watch` | 获得、日冷却、累计使用、最近地点/时段、时间痕迹与察觉者 | 本地商店、怀表使用与迁移器 | 小店、背包、登记事件投影 | 每日最多一次；不推进或回滚时段；不缩短 12/24/28 派生计时 |
| `anomaly_cycle.pending_activation` | null 或预留启用事务 | bridge 异变预留 | 启用调用、背包 | 成功提交或取消后置空；失败不扣卡；旧存档默认 null |
| `anomaly_cycle.active` | null 或唯一活动异变 | bridge 异变事务 | UI、剧情投影、时间规则 | 同时仅一个；28 标准时段后收束；模型不可改写规则/源头/期限 |
| `anomaly_cycle.active.hidden_origin` | 隐藏源头对象 | 本地确定性异变事务 | 每日调查、最终收束 | 使用卡片时按事务种子生成并锁定；普通剧情与普通 UI 不可见 |
| `anomaly_cycle.history` | 最多 8 条摘要 | bridge | 历史 UI | FIFO；不保存完整七日正文 |
| `visit_scheduler` | 计划、冷却、通知 | bridge 来访调度器 | UI、时间规则、邀请 | 旧计划失效移除；刷新/Swipe 不重抽 |
| `presence_snapshot.visitor_meta` | 在场访客生命周期元数据 | bridge | 离场调度、到访说明 | 与在场白名单同步；离场删除 |
| `facility_runtime.{id}` | 后续三设施建造/解锁/风险/事务 | 本地设施规则 | 机会面板、设施行动 | 与 `facilities.{id}` 同步 current_form；模型禁写 |
| `garden_projects.active_construction` | null 或唯一大型施工 | 本地建造事务 | 建造入口 | 同时最多一个 |
| `garden_activities` | 温泉会话、宴会计划/活动与最多 8 条宴会摘要 | 本地活动规则 | 来访上限、场景收尾、宴会入口 | 到时先生成待办；玩家进入或四时段后默认举行并清理 |
| `pending_tasks` | 最多 8 个到期待办，默认 `[]` | 本地调度器与白名单命令 | 庭院待办面板 | `(kind, source_id)` 唯一；异变/宴会到期创建，点击或四时段自动处理后删除；模型禁写 |
| `scene_item_context` | null 或最多 3 种场景道具 | bridge 场景道具事务 | 提示上下文、收尾 | 完整收尾成功后清空；修缮包不进入 |
| `ui_flags.graduation_acknowledged` | boolean/false | 本地 UI | 毕业说明 | 首次选型后显示一次 |
| `abilities` | 最多 32 条事实解锁 | 模型 | 模型、战斗 | 必须记录剧情来源；不用等级/经验 |
| `memory.long_term_notes` | 最多 24 条短事实 | 模型 | 条件投影、数据库归档 | 不存流水账；相近内容合并 |
| `uid_counters` | 正整数计数器 | bridge | 实体创建器 | 额外变量模型不得猜测计数器；动态实体创建须先经本地分配器 |

## 关键对象约束

- 关系事实：`id`、`subjects[]`、`fact`、`source_event_id`、`established_at`、`active`、`last_confirmed_at`。
- 交互会话：`uid`、`type`、`status`、`area_id`、参与者、关联设施/事件、开始时间、焦点、最后有效消息、有效轮数、600 字摘要、结算状态。
- 正式事件：稳定 `config_id` 与实例 `uid` 分离；保存状态、优先级、参与者、关联设施、期限和摘要。
- 战斗结果：只接受预登记 `config_id`；`settlement_id` 是一次性结算键。
- 到期待办：`task_id`、`kind`、`status`、创建/到期/自动处理绝对时段、`source_id`、标签与最小 payload；不保存剧情正文。

## 未知字段策略

所有正式对象使用 passthrough，迁移时保留未知字段，避免旧聊天被静默裁剪。只有展示快照和有明确上限的列表会在 schema 阶段限长；语义去重与跨引用清理由桥接校验负责。
