# 最新 MVU 状态（D0）

以下内容是当前消息楼层已结算的 `stat_data`，同时提供给剧情阶段与变量阶段。后面的消息或规则若与它冲突，以此快照和字段写入所有权为准。

<gensokyo_current_state>
{{format_message_variable::stat_data}}
</gensokyo_current_state>

- 剧情模型只把状态当作叙事依据，不输出或伪造本地托管事件结果。
- 变量模型只更新正文已经发生且属于模型所有权的字段，不把角色不可能知道的系统状态写成台词。
- UI 草稿、动画、素材路径、诊断信息和数据库全文不属于 `stat_data`，不得补造。
