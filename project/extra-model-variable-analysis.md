# 额外模型变量解析运行说明

## 当前模式

正式运行使用 MagVarUpdate 的“额外模型解析变量”。主模型生成庭园正文；额外变量模型读取最新 assistant 正文、D0 状态和玩家楼层末尾的冻结任务投影，返回一个严格的 `<UpdateVariable><JSONPatch>...</JSONPatch></UpdateVariable>`。

没有合法变化时也必须输出空补丁。

“随着 AI 输出”不是当前支持模式，因为它会让剧情协议和变量输出协议进入同一次生成并产生冲突。

## 额外模型可写内容

- 普通环境和玩家位置等开放事实；
- bridge 已创建普通会话的 `focus` 与覆盖式 `summary`；
- `visit_summary_task.slots[*].summary`；
- `presence_analysis_task.slots[*]` 的 `decision / area_id / action / facing`；
- 少量值得跨场景保留的 `memory.long_term_notes`；
- 已存在且不承担资源、解锁、调度、幂等或下游前置的开放语义字段。

额外模型不得创建任务、角色、visit、UID 或动态实体。

## bridge 独占内容

- `meta`、资源、商店、库存、关键物品、战斗；
- `presence_snapshot`；
- `interaction.visit_memory`；
- 两类任务的信封、角色槽位、基线和顺序；
- 会话创建、关闭、轮数、真实消息 ID 与结算身份；
- 事件完成态、设施、调度、建设、路线与所有本地幂等字段。

退役的 `current_relationship_facts`、`relationship_memories` 和关系 UID 不得恢复。关系变化与其他剧情事实一起写入每角色最多 60 条的 VisitTurn 梗概。

完整规则以 `src/lorebook/variable-update-rules.md` 为准，输出外壳以 `src/lorebook/variable-output-format.md` 为准。

## 两类冻结任务

### VisitTurn 摘要

若存在 `visit_summary_task`，模型必须为每个既有槽位填写不超过 100 字的简体中文梗概。不同角色按各自亲历视角概括，不能复制同一句。bridge 将摘要绑定到冻结 visit 并生成审计身份。

### Presence 判断

若存在 `presence_analysis_task`，模型必须逐槽选择 `unchanged / move / leave / uncertain`。只有 `move` 可填写已登记区域；任务只覆盖本轮开始时已在场的冻结角色，不创建到访。

若 D0 宏因楼层时序读不到任务，以玩家正文末尾的 `<GensokyoVariableAnalysisTask>` 投影为准；不得自行构造不存在的槽位。

## 执行顺序

```text
bridge 冻结 request 与两类任务
→ 任务投影写入真实玩家楼层
→ 主模型生成 assistant 正文
→ 额外变量模型填写开放字段与任务叶字段
→ VARIABLE_UPDATE_ENDED
→ bridge 恢复本地所有权并校验任务
→ 写入 VisitTurn / presence_snapshot / receipt
→ 复读后标记 settled，并清除一次性任务
```

V2 二阶段再次持久化时，若 lifecycle、receipt 和 commitKey 已证明同一提交 settled，必须幂等返回，不能重新读取已清除任务。

## 设置与检查

1. 启用额外模型解析，使用能稳定输出严格 JSONPatch 的模型。
2. 保持 `[mvu_update] 变量更新规则` 与 `[mvu_update] 变量输出格式` 启用。
3. 变量初始化条目保持关闭；新聊天初始化由卡内 MVU initvar 提供。
4. 不降低世界书预算到无法容纳 D0、规则和任务投影的水平。
5. 出现结算失败时先检查玩家楼层任务投影、额外模型补丁、assistant 楼层最终状态和事务 receipt，不要从正文表面推断成功。

最终真实验收记录见 `project/2026-08-10-presence-extra-model-acceptance-results.md`。
