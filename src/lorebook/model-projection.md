# 最新 MVU 状态（D0）

以下内容是当前消息楼层已结算的完整 `stat_data`，只提供给 MVU 变量阶段。它可能包含异变隐藏源头等剧情阶段不可见的本地私有字段，禁止将其复述、转交或写入剧情正文。

<gensokyo_current_state>
{{format_message_variable::stat_data}}
</gensokyo_current_state>

- 剧情阶段使用每次 UI 请求附带的脱敏场景事实，不读取本条完整快照。
- 变量模型只更新正文已经发生且属于模型所有权的字段，不输出或复述 `hidden_origin` 等本地私有字段。
- UI 草稿、动画、素材路径、诊断信息和数据库全文不属于 `stat_data`，不得补造。
