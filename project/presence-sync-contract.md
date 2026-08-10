# 在场快照同步契约

## 所有权

`presence_snapshot` 是庭园地图与下一轮现场判断的唯一在场事实源，只能由 bridge 更新。主模型和额外变量模型都不得直接写它。

每次庭园请求必须把当前在场角色、区域、动作、朝向和完整不在场名单投影到玩家楼层。正文只允许当前在场角色作为现场人物行动或发言；不在场角色可以被提及，但不能凭正文自动到场。

## 额外模型任务

bridge 在生成前创建 `interaction.presence_analysis_task`，只冻结本轮开始时已在场且与请求相关的角色。额外变量模型必须逐槽填写：

- `unchanged`：正文没有明确在场变化；
- `move`：角色明确换到已登记区域；
- `leave`：角色明确离开庭园；
- `uncertain`：证据含糊、矛盾或不足。

模型只可 `replace` 既有槽位的 `decision`、`area_id`、`action`、`facing`。不得修改任务信封、request、角色、基线、槽位顺序或数量。

`move` 必须填写已登记 `area_id`；其他决定的目标字段保持 `null`。任务不负责邀请、召回、新建角色或事件到场。

## bridge 落盘

bridge 校验 request 身份、冻结角色、基线和区域后：

- `unchanged` / `uncertain`：保留原快照；
- `move`：只更新该角色合法视图；
- `leave`：移出在场名单并删除对应视图和 `visitor_meta`；
- 非法或被篡改任务：拒绝结算，不部分落盘。

角色仍在场时必须保留原 `visitor_meta`。事件、邀请和调度产生的来访及离场继续由 bridge 的确定性路径处理。

任务成功消费后必须清为 `null`；重试与二阶段持久化不得重复应用已结算任务。

## 禁止的旧路径

- 主模型不再输出 `<GensokyoPresence>`；
- 变量模型不得输出 `/presence_snapshot/...` 补丁；
- 不从自然语言正文机械抽取位置或离场结果；
- 不通过替换 `interaction` 或 `stat_data` 父对象绕过任务所有权。
