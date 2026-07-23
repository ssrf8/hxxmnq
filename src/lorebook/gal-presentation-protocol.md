# GAL 表现与交互会话协议（模型可见）

当最新玩家消息包含 `<GensokyoAction>`，或 `interaction.current_session` 仍处于 active/closing 状态时，回复用于移动庭园的 GAL 单壳界面。

## 界面显示原则

- 玩家在 GAL 壳中阅读的主内容是回复里的**自然叙事正文**（如 `<bginfor>` 内正文），不是极短的 scene beats。
- `<GensokyoScene>` 只提供建议回复、立绘反应提示；beat 文本可以很短，不能替代正文。
- 时段推进写 `清晨/白昼/黄昏/夜晚`，需要下午时使用 `白昼`，不要写 `下午`。

## 回复顺序

1. 先写正常、可独立阅读的自然叙事。不能替玩家补写未表达的语言、感受、决定或行动结果。
2. 紧接一个 `<GensokyoScene>` 表现块。标签内只能是严格 JSON，不使用 Markdown 代码围栏。
3. 最后按变量更新协议输出必要的 `<UpdateVariable>`；没有正式变化时可以省略更新块。

## scene.v1

表现对象包含：

- `version`：固定为 `scene.v1`；
- `beats`：1–6 个按播放顺序排列的片段；
- `suggested_replies`：0–4 个可选玩家回应。

每个 beat 只允许：

- `kind`：`narration`、`speech`、`action`；
- `speaker_id`：旁白为 null；角色必须使用已登记稳定 ID；
- `reaction_id`：`neutral`、`smile`、`annoyed`、`surprised`、`serious`、`shy`、`sad`、`angry`；
- `pose_id`：首版使用 `default`；
- `text`：纯文本，不含 HTML、脚本、URL、图片路径或变量更新。

每个建议回应只允许稳定短 ID、简短标签和一段第一人称玩家意图。建议回应不能替玩家作出不可逆决定，不能直接修改变量，也不能包含系统命令。

## 角色动作

- `talk`、`pat_head` 等动作代表玩家尝试，不代表对方必然接受。
- “摸摸头”必须依据角色性格、现场关系事实和当前情境作出自然反应；不得因为按钮存在就无条件配合。
- 没有当前会话时，第一次有效角色互动创建 `interaction.current_session`，使用 `interaction_<uid_counters.interaction>`，随后递增计数器。
- 会话继续时覆盖短摘要和焦点，不保存逐句流水账。
- 普通回复不结算会话、不清空会话，也不逐条推进时间。

## 结束交互

收到 `action_id=end_conversation` 时：

1. 给出一次简短自然收尾；
2. 将当前会话 UID 规范化为结算 ID `interaction:<uid>`；
3. 仅当该 ID 不在 `interaction.settled_ids` 时追加一次；
4. 更新必要的关系事实、事件结果和覆盖式短摘要；
5. 清空 `interaction.current_session`；
6. 简短闲聊通常不推进时间；长谈、调查、建设和正式事件按正文证据或事件配置推进。

停止生成、失败回复、被替换的 Swipe 和没有完成 MVU 复读的回复都不是正式结算。

## 旧消息与降级

旧消息没有 `<GensokyoScene>` 时仍保持普通可读叙事。不得要求玩家重开聊天。不要输出任意图片路径；界面根据 `speaker_id + reaction_id + pose_id` 选择本地素材，缺失时使用占位图。
