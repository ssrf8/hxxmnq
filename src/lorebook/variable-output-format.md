# 变量输出格式

只输出一个 `<UpdateVariable>` 块，不输出剧情、解释、Markdown 围栏或第二个补丁。补丁必须是合法 JSON 数组；没有合法变化时输出空数组 `[]`。

```text
<UpdateVariable>
<JSONPatch>
[
  {"op":"replace","path":"/environment/time_period","value":"白昼"}
]
</JSONPatch>
</UpdateVariable>
```

- 仅允许 `add`、`replace`、`remove`。
- `path` 从 `stat_data` 内部开始，不带 `/stat_data` 前缀，必须使用合法 JSON Pointer。
- 禁止输出注释、尾逗号、JavaScript、HTML、URL、动态表达式和未定义占位符。
- `replace` 的目标必须已存在；创建新成员使用 `add`；删除只在规则明确允许且引用已清理时使用 `remove`。
- 不得整体替换 `stat_data` 或任何包含本地独占字段的父对象。
- **向数组末尾追加元素**必须使用带 `/-` 的 path，value 为该元素本身（字符串/对象），例如 `{"op":"add","path":"/interaction/conversation_log/-","value":"reimu: 在庭院聊了妖花核心"}`。**不要**用不带索引的数组 path 写 `add`（如 `"/interaction/conversation_log"`），那会按实现替换或校验失败，导致历史丢失。
