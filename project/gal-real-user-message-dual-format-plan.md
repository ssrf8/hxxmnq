# GAL 真实玩家楼层与双重格式约束计划

> 状态：源码与静态测试已实施完成（719/719）；尚未构建卡片、发布或完成真实宿主验收
> 日期：2026-08-10
> 目标候选：`gal-prompt.v5`
> 目标运行时基线：SillyTavern 1.18.0 + Tavern Helper / JS-Slash-Runner 4.8.18；消息写入、生成时序和世界书可见性仍须以目标实机为准

## 1. 本次裁定

新 GAL 请求恢复旧版已经证明更稳定的“双重格式约束”，但不恢复真实旧聊天历史：

1. 庭园 UI 提交时，先把玩家原文、庭园正文协议、在场快照、场景事实和本轮道具授权作为一条完整消息，原子写入真实 SillyTavern `role:user` 楼层。
2. 生成请求不得再临时把协议或动态上下文拼到 `user_input`；它只能逐字复用已写入并复读确认的真实玩家楼层正文。
3. 角色卡绑定的常驻 `[mvu_plot]` GAL 世界书再次完整定义正文边界、允许标签、输出顺序和一份正确示范，形成第二重格式约束。
4. synthetic history、每角色 visit memory、真实旧楼层隔离和 `with_depth_entries:false` 全部保持现状；不得为了恢复格式示范而重新发送旧 user/assistant 楼层。
5. 酒馆原生输入不再通过 `CHAT_COMPLETION_PROMPT_READY` 等事件临时追加庭园上下文，也不靠一次性格式 inject；它只依赖常驻 GAL 世界书强调正文格式。
6. 格式协议统一使用现有解析器已登记的“庭园”标记：`【庭园正文开始】`、`【庭园正文结束】`。文档中的“庭院”仅作自然语言称呼，不新增第二套标记。

本计划所说的“不拼接”专指：**不得在生成配置构造阶段，根据 state 再把上下文追加到 `user_input` 或最终 prompt。** 创建真实玩家楼层时仍需由一个确定性构造器一次生成完整楼层正文；写盘后该正文成为本轮唯一请求源，不得在后续阶段重建第二份。

## 2. 保持不变的边界

- `stat_data` 仍是唯一正式游戏状态源。
- synthetic history 仍是唯一允许进入 `overrides.chat_history.prompts` 的聊天历史，且只含冻结的 `role:system` 召回内容。
- SillyTavern 原生旧 user/assistant 楼层仍不得进入生成历史。
- `with_depth_entries:false` 保持不变。
- send、retry、regenerate 继续复用同一冻结请求和同一真实玩家楼层正文；不得在重试时读取新 state 并改写旧请求。
- 角色、道具和开场世界书的扫描路由仍与自然语言格式协议分离；若 GAL UI 仍需要 `position:none / should_scan:true` 路由胶囊，可继续保留，但胶囊不得携带正文格式、在场事实、场景事实或道具授权。
- 变量阶段仍由独立 `[mvu_update]` 协议输出一个且仅一个 `<UpdateVariable><JSONPatch>...</JSONPatch></UpdateVariable>`；剧情世界书不得把变量示例混进 GAL 正文示例。
- `interaction.conversation_log` 已退役，不恢复旧版向 `/interaction/conversation_log/-` 追加摘要的规则。

## 3. 真实玩家楼层合同

### 3.1 固定块顺序

庭园 UI 创建的每个真实玩家楼层必须按下列顺序一次性写入：

```text
玩家本轮原文

【庭园正文协议】
本轮精确格式要求

【庭园在场快照：本轮唯一事实】
当前在场角色、区域、动作、朝向及不在场约束

【场景事实】
当前地点、事件骨架、允许结果、连续性事实及其他脱敏投影

【本轮道具授权：无|已登记】
本轮允许使用的登记道具，或明确的无授权约束
```

真实楼层正文不自行添加 `<interactive_input>`；若已安装的提示词模板在最终 prompt 中包裹 user 内容，那属于模板展示层，不能写回或复制进聊天楼层，避免双重嵌套。

如果角色或道具档案需要由世界书扫描激活，其不透明路由键不写进上述自然语言楼层；继续放在专用扫描胶囊中，避免模型把路由 token 当成剧情内容。

### 3.2 单一来源

- `visibleUserText`：清理后的玩家原文，用于 UI 展示和输入恢复。
- `storedUserMessage`：上面五块组成的完整真实楼层正文，是本轮模型输入的唯一来源。
- `modelUserInput`：不得重新构造；必须与成功写盘并复读的 `storedUserMessage` 逐字节相同。
- `contextHash`：覆盖协议、在场快照、场景事实和道具授权，用于检测写盘、复读、冻结 metadata 和生成配置之间的漂移。

不得保留“真实楼层一份、请求期动态拼接另一份”的双源结构。任何块缺失、重复、顺序错误、hash 漂移或复读不一致，都必须在创建 assistant 楼层前失败闭合。

### 3.3 消息事务

目标时序：

```text
冻结本轮 state
→ 构造完整 storedUserMessage
→ 写入 is_hidden:false 的真实 user 楼层
→ 复读该楼层并校验正文、message_id 与 contextHash
→ 以复读正文冻结 gal-prompt.v5 请求
→ generate.user_input = 复读正文（逐字节复用，不追加）
→ synthetic history 仅进入 overrides.chat_history.prompts
→ 生成并写入真实 assistant 楼层
```

`is_hidden` 不得用于改变上下文语义。游戏壳可以继续在视觉层隐藏原生楼层，但真实消息必须存在、可恢复、可审计。

### 3.4 重试与重生成

- retry：复用原 `message_id + storedUserMessage + contextHash + syntheticHistory + prompt route capsule`。
- regenerate：从原请求 metadata 恢复同一冻结正文，不根据当前 state 重新生成在场快照、事实或道具授权。
- 玩家编辑原 user 楼层后再发送：视为新请求，重新冻结 state、创建新 revision metadata 和新 hash；不得沿用旧 assistant 事务。
- 旧 `gal-prompt.v1/v2/v3/v4` 只按各自 metadata 原语义恢复，不静默改写成 v5。

## 4. 玩家楼层中的第一次格式强调

每条 GAL 真实玩家楼层的 `【庭园正文协议】` 至少完整包含：

```text
【庭园正文协议】
最终回复必须从【庭园正文开始】开始，并以【庭园正文结束】结束。
两个边界之间只允许：
<narration>旁白、环境或动作</narration>
<dialogue char="已登记角色ID" visual_mode="normal|nude|sexual" reaction="已登记表情" pose="已登记姿势" act="vaginal|anal|none">角色台词</dialogue>
多人发言必须拆成多个 dialogue。不要输出 Markdown 代码围栏、格式解释、自我纠错、思维过程、标题、列表或第二份正文。
正文结束后才允许输出本轮明确要求的其他协议标签；其他标签不得放入庭园正文边界内。
```

这里使用完整、直接、可执行的语句，不在每轮消息中重复长篇叙事职责、开发历史或实现说明。动态块只陈述本轮事实，不重新解释格式。

## 5. 世界书中的第二次格式强调

### 5.1 条目合同

- 维护源：`src/lorebook/gal-presentation-protocol.md`。
- 责任：常驻 GAL 正文语法、解析边界、输出顺序、正确示范和稳定叙事职责。
- 接收者：`[mvu_plot]` 剧情模型；不得发送给独立变量模型。
- 激活：角色卡绑定的常驻条目，不依赖本轮动态扫描胶囊才能看到。
- 内容：完整定义一次，不再写“精确格式由 system inject 提供”或“本条不重复定义请求期格式”。
- 示例：只放一份最小正确示范；示例本身不用 Markdown 三反引号包裹，防止模型复制代码围栏。

### 5.2 必须恢复的完整定义

世界书必须明确：

1. 回复第一个可见字符就是 `【庭园正文开始】`，不得有前言。
2. 解析器取最后一个开始标记及其后的第一个结束标记；模型不得输出重复边界。
3. 边界内只允许 `narration` 和 `dialogue`。
4. `dialogue` 必须带 `char`、`visual_mode`、`reaction`、`pose`、`act`；使用登记 ID，没有可靠值时按项目登记的安全默认值。
5. 多人或多次发言拆成多个 `dialogue`，不把旁白塞进台词属性。
6. `GensokyoPresence` 等可选剧情协议只能出现在正文结束后。
7. 剧情模型不输出 `<UpdateVariable>`；变量模型的输出格式由独立 `[mvu_update]` 条目负责。
8. 不输出 Markdown 围栏、解释、纠错文字、思维链、第二份 GAL JSON 或选项列表。

### 5.3 世界书中的正确示范

条目内使用以下纯文本示范：

```text
正确格式示范：
【庭园正文开始】
<narration>灵梦沿着庭院边缘检查了一圈结界，最后停在倾斜的旧主屋前。</narration>
<dialogue char="reimu" visual_mode="normal" reaction="serious" pose="default" act="none">结界暂时没问题。我给你临时许可，先把那栋旧主屋修好吧。</dialogue>
【庭园正文结束】
```

实际模型可见条目只保留“正确格式示范：”和示范正文，不保留本文档用于展示的 Markdown 围栏。结束标记后没有 `=`、句号或解释。

## 6. 酒馆原生发送合同

酒馆原生输入用于 UI 失效时的安全退路：

- 不订阅原生生成事件去修改最终 `role:user`。
- 不向原生玩家文本追加协议、在场快照、场景事实或道具授权。
- 不为格式要求创建一次性 system/depth inject。
- 由常驻 `[mvu_plot]` GAL 世界书提供完整格式定义和正确示范。
- 原生路径没有 GAL UI 冻结的动态块时，模型不得自行编造在场角色、受控事件结果或道具授权；只按模型实际可见的可靠事实叙事。
- 世界书未激活或未进入剧情模型上下文时允许原生聊天继续工作，但该次不得宣称满足 GAL 格式门禁；实机验收必须确认常驻条目确实可见。

此裁定意味着删除或停用当前 `CHAT_COMPLETION_PROMPT_READY` 中追加 `buildGalCurrentTurnContext()` 的原生兜底，以及与原生格式有关的 `GENERATION_AFTER_COMMANDS` 临时注入。若该事件还承担其他非格式职责，实施前必须拆分责任，不能整段粗暴删除。

## 7. 文件级实施范围

计划中的最小代码修改面：

| 文件/组件 | 目标变化 |
| --- | --- |
| `src/ui/target-actions.ts` | 保留唯一协议文本源，补齐精确格式；提供完整真实玩家楼层构造器，避免请求期二次构造 |
| `src/ui/gal-prompt-injection.ts` | v5 一次构造待写入的完整真实玩家楼层正文；生成阶段不再重建或追加上下文，并保留必要的扫描路由和旧 revision 兼容 |
| `src/ui/gal-generation-request.ts` | 以已写盘并复读的真实 user 楼层正文冻结 v5 请求 |
| `src/ui/gal-generate-config.ts` | `user_input` 逐字使用冻结楼层正文；synthetic history 规则不变 |
| `src/ui/bridge.ts` | 调整为“先写真实 user 楼层、复读、再生成”；移除原生最终 prompt 格式拼接 |
| `src/lorebook/gal-presentation-protocol.md` | 恢复完整定义、输出顺序和一份正确示范，修正过期 system inject 描述 |
| 相关测试 | 新增真实楼层唯一来源、双重格式约束、原生无事件拼接、旧 revision 恢复和失败闭合测试 |

本计划不授权改 schema、visit memory、数据库、UI 视觉、卡片打包、R2 或正式发布。

## 8. 静态验收

必须至少证明：

1. 每个新 GAL 请求先创建一个 `is_hidden:false` 的真实 user 楼层。
2. 真实楼层依次且各只包含一次：玩家原文、正文协议、在场快照、场景事实、道具授权。
3. `generate.user_input` 与复读后的真实楼层正文逐字节相同。
4. v5 路径不存在生成时 `${playerInput}\n\n${context}`、最终 chat append 或同义二次拼接。
5. synthetic history 仍只有 system 召回内容，真实旧 user/assistant 楼层不进入 prompts。
6. `with_depth_entries:false` 未改变。
7. 世界书同时包含完整开始/结束边界、两种正文标签定义和正确示范，且不再引用 system inject。
8. 酒馆原生路径不修改最终 user 内容；世界书条目仍由打包脚本作为常驻 `[mvu_plot]` 条目收录。
9. retry/regenerate 恢复同一楼层正文和 hash，state 变化不会改写冻结请求。
10. v1–v4 fixture 继续按旧语义恢复，v5 缺楼层复读证据或 hash 漂移时失败闭合。

## 9. 实机验收门禁

静态测试不能证明消息时序、世界书最终位置或模型服从率。至少在目标 SillyTavern 中验证：

1. GAL 自由输入：聊天记录里确有完整真实 user 楼层，最终 prompt 中只出现一次该楼层正文。
2. 建议回应和固定行动：五块顺序相同，动态事实与提交前冻结 state 一致。
3. retry、regenerate、Swipe：不重复创建 user 楼层，不重算动态块，不出现协议双份。
4. 原生输入：最终 user 内容保持玩家原文，常驻世界书里可直接观察到完整协议和正确示范。
5. UI 故障回退：原生聊天可继续发送，世界书仍约束 `【庭园正文开始】` 格式。
6. 选择至少一个稳定模型和一个过去出现过丢格式的模型，对 GAL UI 与原生路径分别连续生成不少于 20 次；开始/结束边界、标签闭合、属性完整率必须为 100%。
7. 任一回复缺边界、重复边界、正文内混入非法标签或输出代码围栏，都记录为 FAIL，不得用界面保守降级冒充协议通过。

通过上述实机门禁前，只能标记为“v5 静态实施完成、runtime pending”，不得写成已实机修复、已打包或已发布。

## 10. 静态实施记录（2026-08-10）

- 新请求 revision 已升为 `gal-prompt.v5`，`gal-prompt.v1–v4` 保持原 metadata 恢复语义。
- `buildGalStoredUserMessage()` 一次构造玩家原文、正文协议、在场快照、场景事实和道具授权；三个生产入口均把该完整正文交给 `createChatMessages()` 的真实 `is_hidden:false` user 楼层。
- `prepareGeneration()` 在 Helper `generate()` 前复读真实楼层；v5 正文与冻结 `modelUserInput` 不逐字相等时失败闭合。重生成 locator 同样拒绝正文漂移。
- `CHAT_COMPLETION_PROMPT_READY` 原生最终 user 改写已移除；`GENERATION_AFTER_COMMANDS` 只保留世界书扫描路由胶囊。
- 常驻 `[mvu_plot]` GAL 世界书已恢复完整边界、标签属性、输出顺序和灵梦正确示范；剧情与变量输出协议继续分离。
- 静态证据：`npm run check:ui` PASS；`npm test` 719/719 PASS；未执行真实 SillyTavern 消息落盘、重载保真、最终 prompt 或模型连续格式率验收。
