# 变量输出格式

只输出一个 `<UpdateVariable>` 块，不输出剧情、解释、Markdown 围栏或第二个补丁。`<JSONPatch>` 内必须是合法 JSON 数组；没有合法变化时输出空数组 `[]`。

```text
<UpdateVariable>
<JSONPatch>
[
  {"op":"replace","path":"/environment/time_period","value":"白昼"}
]
</JSONPatch>
</UpdateVariable>
```

- 每项只含更新协议允许的 `op`、`path` 与必要的 `value`；不要输出注释、尾逗号、未定义占位符或额外键。
- 路径、所有权、数组追加和父对象保护以 `[mvu_update] 变量更新规则` 为准，本条不另设一套写入规则。
- `interaction.visit_memory` 由 bridge 独占，禁止输出指向该根或其任意子路径的补丁；若本轮只出现这类禁写变化，输出空数组。
- `interaction.conversation_log` 已退役，仅作旧存档迁移来源，禁止写入。
