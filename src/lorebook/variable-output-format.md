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
