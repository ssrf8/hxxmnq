# 额外模型变量解析运行说明

## 目标

剧情模型只生成剧情与 GAL 协议；MagVarUpdate 在剧情回复后发起独立变量分析。这样变量格式不再依赖剧情模型“记得顺手输出”，而本地可判定的资源、战斗、商店和主事件结算仍由 bridge 保证。

## 剧情状态机责任

- MVU `stat_data` 保存已经发生的剧情进度和持久状态，不保存完整事件脚本；
- 本地事件登记表保存前置、剧情骨架、允许结果、固定结尾和结算效果；
- UI 根据“登记表 + 当前 MVU”计算下一步可用行动；
- 剧情模型输出正文、`GensokyoScene`，并只在角色出入场/换区时输出 `GensokyoPresence`；
- 额外变量模型只写关系事实、互动摘要/焦点、长期记忆和开放支线语义；
- bridge 独占 UID、会话生命周期、在场快照、关键事件完成态、设施/区域解锁、资源与奖励。

不得恢复“剧情模型顺手输出全部变量”或“额外变量模型直接决定关键剧情是否完成”的旧方案。不得新增与现有完成事件、设施形态重复的万能章节字段。

## Luker / SillyTavern 设置

1. 确认角色卡内的固定版本 MagVarUpdate 加载成功。
2. 在 MVU 设置中启用“额外模型解析变量”，选择可稳定输出严格 JSON 的模型与可用 API。
3. 变量模型建议使用较低温度，并保留插件的格式校验与重试；不要关闭世界书中的 `[mvu_update]` 条目。
4. 若临时关闭额外解析，bridge 会在 assistant 回复后等待 2.5 秒再执行所有权保护，但开放语义字段将不会自动更新。这只是安全降级，不是推荐玩法。

具体分流：

- `[mvu_plot]`：角色身份、设定、GAL、角色档案、事件剧情配置；
- `[mvu_update]`：变量更新规则、唯一输出格式，以及 D0 最新 `stat_data` 快照；
- 剧情模型不读取完整 D0，只接收 UI 生成的脱敏场景事实；其中不会出现异变隐藏源头或其他本地私有字段；
- `[initvar]`：新聊天初始化，不承担每轮更新。

内嵌世界书预算为 12288 tokens，用来容纳变量规则、D0 完整状态和当前剧情条目。不要恢复为旧的 4096，否则状态增长后可能在送入额外模型前就被截断。

### 世界书落点与当前约束

- `scripts/package-checkpoint.mjs` 直接读取 `src/lorebook/variable-update-rules.md` 与 `variable-output-format.md`，分别写成常驻的 `[mvu_update] 变量更新规则`、`[mvu_update] 变量输出格式`；D0 完整状态另写为 `[mvu_update] 最新 MVU 状态（含本地私有字段）`。
- 变量规则与输出格式均明确禁止 `interaction.visit_memory` 及其子路径；变量模型只能看见它，不能修改它。本轮只有禁写变化时必须输出空数组。
- `src/lorebook/routing-plan.json` 记录相同的 recipient/activation 合同，避免后续维护时误把变量条目送回剧情模型。
- 本次只修改维护源；未重新打包，因此已经生成的旧卡不会自动得到这些世界书内容，下一次测试卡构建时才会嵌入。

## 写入顺序

```text
玩家消息
  -> 剧情模型生成 assistant 正文
  -> 额外变量模型输出一个 UpdateVariable/JSONPatch
  -> MVU 完成同层变量更新并发出 VARIABLE_UPDATE_ENDED
  -> bridge 读取该层最新 stat_data
  -> 恢复本地独占字段并合并确定性事件结果
  -> replaceMvuData 精确写回同一 assistant 楼层并复读
```

bridge 不再在 `MESSAGE_RECEIVED` 时立即结算，因为该事件与 MagVarUpdate 的额外分析监听器没有可靠的先后顺序。

## 最小真实验收

使用独立测试聊天依次检查：

1. 普通无状态闲聊：变量模型返回空补丁，正文保留，MVU 不报格式缺失。
2. 自由角色互动：关系事实或短摘要能更新；资源、战斗和主事件字段不变。
3. 已登记固定事件：剧情正常生成，变量模型不抢写受控字段，本地结算在变量阶段后一次落盘。
4. 故意让变量模型输出非法格式：插件重试；最终失败时不得出现本地状态覆盖或部分结算。
5. Swipe、停止生成、刷新后重试：同一消息楼层不重复扣资源、不重复增加会话轮数。

每轮多一次模型请求会增加延迟和费用；若变量模型质量过低，优先换稳定的小模型或收紧采样，不要把确定性结算重新交回模型。

## 2026-08-10：模式选择与真实请求复核

### 当前支持结论

当前卡的可靠运行合同仍是**额外模型解析变量**，不是“随着 AI 输出”。真实 Chat Completion 请求已经证明，在“随着 AI 输出”模式下，同一个剧情请求会同时收到：

- `[mvu_plot]` 的 GAL 正文协议，其中明确要求剧情模型不得输出 `<UpdateVariable>`；
- `[mvu_update]` 的变量规则与输出格式，其中又要求只输出一个 `<UpdateVariable>` 块。

这两组指令在同一次生成里互相冲突。因此主模型只输出庭园正文而省略 `<UpdateVariable>`，是当前提示合同可以预期的结果，不能靠重复强调稳定解决。额外模型模式下两组条目分阶段生效，职责才不冲突。

当前建议：

1. 玩家设置继续选择“额外模型解析变量”；
2. “随着 AI 输出”只视为安全降级：bridge 独占的资源、事件、VisitTurn 等确定性状态仍应由本地链路提交，但关系事实、普通会话摘要和长期开放语义可能不更新；
3. 不为兼容同轮模式而让剧情模型直接写全部状态，也不放宽 bridge 的精确 VisitTurn 校验；
4. 若以后正式支持同轮模式，应另立模式感知的输出合同：允许 `【庭园正文结束】` 后追加唯一 `<UpdateVariable>`，同时把 `[mvu_update]` 的“只输出变量块”改为不会与正文结构冲突的同轮版本。该迁移需要单独设计与真实宿主验收，本轮不实施。

### 抓到的 UpdateVariable 判定

外层：

```text
<UpdateVariable>
<JSONPatch>
[ ... ]
</JSONPatch>
</UpdateVariable>
```

属于本项目当前 MVU 方言接受的目标形状；问题在补丁内容，而不在标签外壳。

本次样本中的两条 `interaction.visit_memory.by_character.*.active_visit.turns/-` **不得写入**：

- 新 VisitTurn 的唯一写入者是 bridge settlement；
- 持久记录只含 `turn_id`、`character_id`、`day`、`time_period`、`summary`，其中摘要为 80–100 字；
- request、attempt、commit、assistant message、swipe 等事务身份只存在于 bridge 提交回执，不再复制进长期记忆；
- 变量模型先写一份、bridge 再写一份会产生重复或幽灵 turn，并可能破坏 reload、swipe 与精确复读。

样本中的 `characters.reimu.current_relationship_facts/-` 在语义上可以是关系事实候选，但给出的 `value` 是字符串，和项目要求的事实对象不一致。当前对象至少需要稳定 `id`、`subjects`、`fact`、`source_event_id`、`established_at`、`active`、`last_confirmed_at`；在“新 ID 只能由 bridge 分配”的规则尚未与关系事实新增方式进一步收口前，不应接受变量模型临时编造的对象或字符串。

### 是否能被召回

- 错误 VisitTurn 若被 MVU 实际写入，synthetic history 会读取 turn 的 `summary`，所以它**可能被召回**；这属于污染传播，不是有效记忆证明。
- 错误字符串关系事实不会被 `current_relationship_facts -> relationship_memories` 的对象迁移器当作合法事实，因此不能依赖它进入关系召回。
- 若 MVU/schema 在写入阶段拒绝了整份补丁，则两者都不会持久化。必须以目标 assistant message-scope 的实际 `stat_data` 为准，不能只看模型曾输出过标签。

结论：该样本不应原样存入 MVU。正确状态应由 bridge 写入本轮精确 VisitTurn；额外变量模型只提交它被授权且结构合法的开放语义变化，没有合法变化时输出空补丁。
