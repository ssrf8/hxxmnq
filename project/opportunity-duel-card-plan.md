# 机遇卡、对战卡与杂鱼标签实施计划

> 状态：阶段 A（状态与纯规则）、阶段 B（Bridge 与战斗接入）、阶段 C（UI 与胜利剧情）已完成；下一步为阶段 D 素材接入与真实运行验收。
> 目标环境：SillyTavern 1.18.0 + Tavern Helper 4.8.19 + MagVarUpdate（项目固定版本）。
> 本计划不授权正式打包、覆盖 `0.2.0-r54`、提交或推送。

阶段 A 于 2026-07-30 完成：两张卡的目录、对战角色登记、MVU 状态合同、旧存档迁移、机遇卡本地抽取／到场规则、杂鱼标签与对战开始／取消／结算纯函数均已落地。阶段 B 同日完成：Host/Preview Bridge 已接入机遇卡写入复读及对战卡开始、取消、结算事务，三档通用配置进入构建；0 枚标签锁定原作 Hard 风格五阶段极难档，1–2 枚为标准档，3 枚以上为援助档。阶段 C 已将两张卡接入背包，补齐对手选择、难度预览、战斗弹窗、取消返卡、胜负分流、胜利要求锁定／重试／刷新恢复及最小模型投影；失败只产生本地标签提示，不创建消息或进入 GAL。桌面与 `390×844` 离线预览已检查且无页面控制台错误；`check:ui`、`build:ui`、`npm test`（152/152）与 r54 dry-run 全绿，最新 dry-run 为 `85,468,974` bytes、SHA-256 `3b99d20b…c7af9716`。当前仍未接入所有者后续提供的正式卡面／小鱼干素材，也未在真实 SillyTavern 验收，因此不得表述为正式交付完成。

## 1. 目标与冻结边界

本轮新增两个本地托管消耗品：

1. `opportunity_card`（机遇卡）：稳定随机抽取一名“已完整登记、但玩家尚未认识”的角色，并邀请其进入庭院。
2. `spell_duel_card`（对战卡）：选择任意已完整登记角色进行符卡对战；胜利进入一次“对方答应玩家一个要求”的剧情，失败只在本地增加一枚以小鱼干表现的“杂鱼标签”。0 枚标签使用原作 Hard 风格极难档，1–2 枚使用标准档，3 枚以上使用援助档。

固定边界：

- 两张卡的库存、使用前置、随机结果、战斗难度、胜负、杂鱼标签和幂等 ID 全由本地 bridge 独占。
- 机遇卡全程不调用 LLM。
- 对战卡只有胜利结算完成后才允许创建真实 user/assistant 剧情。
- 对战失败不创建聊天楼层、不调用剧情模型、不写关系事实，只显示本地结果提示。
- 对战卡不奖励金币、不推进正式时段、不写入普通副本奖励历史。
- 模型不得创建角色、卡片、战斗配置、胜负结果、杂鱼标签或本地奖励。
- 胜利要求在叙事上必须被对手接受，不再进行成功率判定；但模型正文不得直接修改金币、库存、设施、事件、角色在场或其他 bridge 托管字段。
- 未经另行登记的要求只产生剧情承诺与自然关系事实，不产生隐藏的本地奖励。
- 玩家后续提供两张卡和杂鱼标签素材；素材到位前使用现有 CSS 卡面与文字／符号占位，不生成临时 AI 素材。

## 2. 名称、ID 与默认商品参数

| ID | 显示名 | 类型 | 使用模式 | 默认价格 | 堆叠上限 | 默认开放条件 |
|---|---|---|---|---:|---:|---|
| `opportunity_card` | 机遇卡 | consumable | local | 40 | 9 | 小店开放且存在合法候选角色 |
| `spell_duel_card` | 对战卡 | consumable | local | 24 | 99 | 已完成妖花教学战、符卡副本已解锁 |

以上价格与上限是实施默认值，不属于架构常量；正式施工前所有者可直接调整。

“小鱼干”是视觉母题，正式状态和界面名称统一为“杂鱼标签”：

```text
小鱼干图标 × N
杂鱼标签：N
```

## 3. 角色登记边界

### 3.1 完整登记角色

机遇卡和对战卡只接受已经完成项目角色接入合同的角色：

- 角色稳定 `character_id`；
- 世界书或角色设定源；
- `visit-profiles.json` 来访档案；
- 地图／GAL 白名单；
- 可用角色素材或明确登记的占位素材；
- 对战卡所需的 `duel-profile`；
- 初遇或认识事实的本地登记方式。

模型正文中临时出现的人名、玩家输入的名字和未登记角色均不得进入候选池。

### 3.2 机遇卡候选池

候选角色必须同时满足：

- 已完整登记；
- `isCharacterKnown(state, character_id) === false`；
- 当前不在庭院；
- 没有未完成的机遇卡／来访计划；
- 当前角色素材与白名单可安全渲染；
- 庭院未达到当前访客上限。

当前项目已登记来访档案的角色只有首发八人。未来角色完成登记后自动进入候选池，不为机遇卡维护第二份手写角色名单。

### 3.3 对战卡候选池

对战卡按所有者要求允许选择任意完整登记角色：

- 不要求已经认识；
- 不要求当前在庭院；
- 不受普通来访冷却影响；
- 必须存在有效 `duel-profile`；
- 战斗与胜利剧情期间仍遵守单一受控事务约束。

若尚未认识的角色通过对战卡进入胜利剧情，该剧情可同时承担初次见面；认识事实只能在完整胜利回复结束后按登记规则提交。失败不会建立认识事实。

## 4. 状态合同

### 4.1 库存数量

继续复用现有事实源：

```text
inventory.consumables.opportunity_card: 0..9
inventory.consumables.spell_duel_card: 0..99
```

购买与使用都由本地事务原子增减。模型不可写。

### 4.2 卡片运行状态

在 `inventory` 下增加固定运行区：

```text
inventory.card_runtime = {
  settled_use_ids: string[<=256],
  opportunity: {
    pending: null | {
      use_id,
      selected_character_id,
      roll_seed,
      status: "reserved" | "arrived"
    },
    last_result: null | {
      use_id,
      selected_character_id
    }
  },
  duel: {
    zako_tag_count: 0..99,
    pending_battle: null | {
      use_id,
      target_character_id,
      config_id,
      difficulty_tier: "hard" | "standard" | "assisted",
      started_zako_tag_count
    },
    settled_result_ids: string[<=256],
    pending_victory_dialogue: null | {
      settlement_id,
      target_character_id,
      status: "waiting_request" | "generating" | "completed",
      request_text
    }
  }
}
```

设计说明：

- `settled_use_ids` 防止同一卡片使用事务重复扣除。
- `opportunity.pending` 只覆盖极短的原子写入窗口；成功到场后立即清空。
- `opportunity.last_result` 只保留最近一次成功结果，供紧邻的复读／重试恢复同一角色提示，不作为长期事件历史。
- `pending_battle` 在战斗开始前落盘，确保刷新后不能改变对手或难度。
- `settled_result_ids` 不复用 `battle.rewarded_ids`，因为对战卡没有金币奖励。
- `pending_victory_dialogue` 与战斗结算分离；剧情失败只重试对话，不得重打战斗或再次减少标签。
- 所有列表采用 FIFO 上限，迁移器去重并裁剪。

### 4.3 初始化与迁移

新聊天默认：

```text
settled_use_ids = []
opportunity.pending = null
zako_tag_count = 0
pending_battle = null
settled_result_ids = []
pending_victory_dialogue = null
```

旧存档迁移必须幂等：

- 缺字段时补默认值；
- 非整数标签归零；
- 标签钳制到 `0..99`；
- 未知或不完整 pending 对象安全清空；
- 已有 `inventory.consumables` 不重置；
- 不修改旧副本奖励、金币、时段或认识事实。

## 5. 机遇卡本地事务

### 5.1 使用前置

以下任一条件成立时禁止使用且不扣卡：

- 没有机遇卡；
- 当前存在战斗、固定事件、活动中的主交互会话、异变启用预留或其他卡片事务；
- 庭院访客已达到当前上限；
- 没有合法未知角色；
- MVU 不支持可靠写入与复读。

### 5.2 稳定随机

随机种子：

```text
opportunity-card:{chat_id}:{use_id}
```

候选池先按稳定 `character_id` 排序，再使用项目现有 `stableRoll()` 选取。刷新、重试、Swipe 或重复调用同一 `use_id` 时必须得到同一角色。

### 5.3 原子结算顺序

```text
校验 use_id 与库存
→ 建立候选池
→ 稳定抽取角色
→ 在克隆状态中扣除 1 张机遇卡
→ 写入临时 pending
→ 创建 source="opportunity_card" 的到访计划
→ 立即按当前安全点提交到场
→ 将角色加入 known_characters
→ 记录 settled_use_ids
→ 清空 pending
→ 单次写入 MVU 并复读全部结果
```

任一步失败都不得留下扣卡、认识事实、到访计划或半成品在场状态。

### 5.4 到场表现

- 默认落点使用角色来访档案第一合法区域；无合法偏好时回退 `central_courtyard`。
- 停留时长继续使用角色档案的 `stay_period_range`。
- 到场通知使用本地模板，例如：“一场意外的机遇把【角色名】带到了庭院。”
- 不自动进入 GAL，不自动发送欢迎消息。
- 玩家点击角色后才进入普通角色交互。

## 6. 对战卡本地事务

### 6.1 开战前置

禁止条件：

- 没有对战卡；
- 已有战斗或 `pending_battle`；
- 固定事件、异变启用、活动交互或胜利要求对话正在进行；
- 目标角色未完整登记；
- 目标缺少 `duel-profile`；
- MVU 不能可靠写入与复读。

选择对手后先将 `pending_battle` 写入并复读，再启动 Canvas 战斗。此时不扣卡；主动取消、Escape 退出、页面关闭或战斗引擎异常均清空 pending 并保留卡片。

### 6.2 对战角色档案

新增本地白名单 `src/battle/duel-profiles.json`：

```text
character_id
display_name
enabled
battle_visual_id
hard_config_id
standard_config_id
assisted_config_id
victory_reaction_tags
fallback_visual_id
```

第一轮允许角色共用三套已验证的通用弹幕配置，只替换登记的对手姓名、主题色和视觉 ID。以后可以逐角色添加专属弹幕，但不得由模型或玩家 JSON 动态生成配置。

### 6.3 杂鱼标签与难度

开战时读取标签，随后锁定本次难度：

| 开战前标签 | 难度 |
|---:|---|
| 0 | `hard` |
| 1–2 | `standard` |
| 3–99 | `assisted` |

三档均采用独立预登记配置。`hard` 使用原作 Hard 风格的固定种子环、扇弹、自机狙、旋转环、预警激光与安全道叠压，降低生命／Bomb／决死窗口并增加至五阶段；必须保持弹幕可读和确定性，不使用随机瞬杀冒充难度。援助档降低密度、速度和阶段数并增加容错。战斗途中不因标签变化切换难度。

具体数值以离线试玩和所有者手感验收为准，配置文件仍必须通过现有速度、数量、尺寸和持续时间白名单。

### 6.4 战斗结果映射

| BattleResult.outcome | 对战卡语义 |
|---|---|
| `clean_win` | 胜利 |
| `narrow_win` | 胜利 |
| `loss` | 失败 |
| `narrative` | 对战卡禁用，拒绝结算 |

结果必须同时匹配：

- `pending_battle.config_id`；
- pending 中锁定的目标角色；
- 合法 `settlement_id`；
- 战斗引擎生成的完整数值范围；
- 尚未出现在 `settled_result_ids`。

### 6.5 胜利结算

```text
验证 BattleResult
→ 消耗 1 张对战卡
→ zako_tag_count = max(0, count - 1)
→ 记录 settled_use_ids 与 settled_result_ids
→ 清空 pending_battle
→ 创建 pending_victory_dialogue(waiting_request)
→ 写入并复读
→ 打开胜利要求输入界面
```

若原标签为零，胜利后仍为零。

胜利对话：

- 玩家填写一个自然语言要求；
- 第一次提交后锁定 `request_text`，Swipe 只能重生成同一要求的回复；
- 请求发送到一条真实 user 楼层；
- 剧情投影只包含对手、可信胜利、要求正文和“对手必须接受”的叙事约束；
- 不投影标签数量、内部 use ID、settlement ID 或配置参数；
- assistant 完整回复并等待变量阶段结束后，本地将 pending 标为 completed 并清理；
- 生成失败、停止或没有采用 Swipe 时保留 pending，允许幂等重试；
- 不重复扣卡、不重复减标签、不重新结算战斗。

角色必须接受要求，但可以按照自身能力、身份和现实条件说明执行方式。要求若涉及正式本地状态，只有已经登记的白名单行动可以真正落盘；否则只作为剧情承诺。

### 6.6 失败结算

```text
验证 BattleResult
→ 消耗 1 张对战卡
→ zako_tag_count = min(99, count + 1)
→ 记录 settled_use_ids 与 settled_result_ids
→ 清空 pending_battle
→ 写入并复读
→ 显示本地提示
```

固定提示语义：

```text
挑战失败，杂鱼标签 +1。当前持有：N 枚。
```

失败后必须满足：

- `pending_victory_dialogue === null`；
- 不创建 user/assistant 消息；
- 不调用主模型或额外模型；
- 不改关系事实；
- 不奖励金币；
- 不推进时段；
- 不生成失败剧情、安慰剧情或角色嘲讽楼层。

## 7. UI 规划

### 7.1 背包

两张卡加入现有背包：

- 机遇卡按钮：“抽取机遇”；
- 对战卡按钮：“选择对手”；
- 显示数量、用途和禁用原因；
- 对战卡条目同时显示“小鱼干图标 × N / 杂鱼标签 N”；
- 0 枚显示“下次对战：极难（原作 Hard 风格）”，1–2 枚显示标准，达到三枚后显示援助。

### 7.2 机遇卡结果

机遇卡只显示本地抽取／到场提示，然后返回庭院。无候选角色时按钮显示明确原因，不弹空选择框。

### 7.3 对手选择

对手选择面板显示：

- 角色名与登记视觉；
- 极难／标准／援助难度；
- 当前杂鱼标签数量；
- “胜利：减少 1 枚标签并进入要求剧情”；
- “失败：增加 1 枚标签，不进入剧情”；
- 卡片将在有效战斗结算后消费；
- 关闭和取消不消费。

### 7.4 胜利要求

胜利后使用独立单例输入面板：

- 对手名；
- 可信胜利摘要；
- 一个必填要求输入框；
- 字数建议上限 240；
- 提交后锁定正文；
- 失败时可重试；
- 不允许返回后重新选择要求规避已提交文本。

## 8. 模型投影

机遇卡不产生模型投影。

对战失败不产生模型投影。

胜利要求只向剧情模型投影最小信息：

```text
【符卡对战胜利要求】
对手：登记角色
事实：玩家已在本地可信符卡战中获胜
约定：对手必须接受玩家本次提出的一个要求，不进行胜负或接受度重判
要求：玩家已锁定的自然语言文本
边界：不得伪造金币、库存、设施、事件、在场或其他本地托管状态
```

额外变量模型仍只允许根据真实回复更新开放语义关系事实，不得改写卡片、标签、胜负、pending 或结算 ID。

## 9. 文件变更地图

### 9.1 目录与规则

- `src/items/catalog.json`
- `src/shop/catalog.json`
- `src/ui/inventory-rules.ts`
- `src/ui/shop-rules.ts`
- 新增 `src/ui/card-item-rules.ts`
- 新增 `src/ui/duel-card-rules.ts`
- `src/ui/visitor-rules.ts`
- 新增 `src/battle/duel-profiles.json`
- 新增两份通用对战配置或等价的本地登记配置组合

### 9.2 状态链

- `src/schema/initial-state.json`
- `src/schema/02-mvu-schema.js`
- `src/schema/field-ledger.md`
- `src/ui/types.ts`
- `src/ui/state-migrations.ts`
- `src/lorebook/variable-update-rules.md`
- 必要时更新最小模型投影构造器，但不向普通剧情暴露卡片运行内部字段

### 9.3 Bridge 与 UI

- `src/ui/bridge.ts`
- `src/ui/app.ts`
- `src/ui/inventory-view.ts`
- `src/ui/index.html`
- `src/ui/styles.css`
- 如需宿主注入新素材，再更新 `scripts/build-ui.mjs` 与 `src/runtime/ui-host-shell.js`

### 9.4 素材

所有者后续提供：

- `opportunity-card-v1.png`
- `spell-duel-card-v1.png`
- `zako-dried-fish-tag-v1.png`

最终文件名以素材接入时确认值为准。素材须登记到 `src/assets/asset-manifest.json`，预览路径与自包含 data URL 使用同一构建链。

## 10. 测试矩阵

### 10.1 机遇卡

- 未知角色候选只含完整登记角色；
- 已认识、在场、已计划和未登记角色被排除；
- 同一 `use_id` 稳定选择同一角色；
- 无候选、访客满员、繁忙状态不扣卡；
- 成功时扣卡、到场、认识事实和 settled ID 原子提交；
- 写入或复读失败不留下半成品；
- 重复调用不重复扣卡或重复到场；
- 新登记角色无需修改机遇卡名单即可进入候选池。

### 10.2 对战卡

- 任意完整登记角色可选，缺 `duel-profile` 的角色不可选；
- 开战锁定目标、配置、难度和起始标签；
- 取消／关闭／引擎异常不扣卡；
- 0 枚为极难，1、2 枚为标准难度，3、4、99 枚为援助难度；
- 战斗中修改外部状态不改变已锁定难度；
- `clean_win`／`narrow_win` 减一枚且不低于零；
- `loss` 增一枚且不高于 99；
- `narrative` 被拒绝；
- 重复 `settlement_id` 不重复扣卡或改标签；
- 结果不奖励金币、不推进时段、不写副本 rewarded IDs。

### 10.3 胜负分流

- 胜利创建且只创建一个 pending victory；
- 胜利要求只发送一条真实 user 消息；
- 请求提交后锁定，Swipe 不得更换要求；
- 胜利剧情失败只重试对话；
- 失败时 pending victory 恒为 null；
- 失败不创建任何消息楼层；
- 失败不调用剧情模型和变量模型；
- 失败只显示本地“杂鱼标签 +1”提示。

### 10.4 迁移与回归

- 旧存档补齐默认字段且原库存不变；
- 非法 pending 被安全清理；
- 现有异变卡、咲夜怀表、普通场景道具和修缮包回归；
- 温室教学战和三副本结算回归；
- 来访调度、普通邀请和访客上限回归；
- 桌面、390px、320px、200% 缩放与 reduced-motion；
- 刷新、Swipe、切聊天、重挂载和原生聊天恢复。

## 11. 施工顺序

### 阶段 A：状态与纯规则

状态：**已完成（2026-07-30）**。

1. 恢复依赖并记录修改前离线基线。
2. 添加目录项、状态类型、Schema、初始值、字段台账和迁移。
3. 实现机遇卡候选过滤、稳定随机与纯本地结算。
4. 实现杂鱼标签、难度派生、对战 pending 与胜负纯结算。
5. 先完成规则测试，不接 UI、不调用模型。

停止条件：任何纯规则不能证明幂等、失败回滚或旧存档兼容时，不进入阶段 B。

### 阶段 B：Bridge 与战斗接入

状态：**已完成（2026-07-30）**。

1. 新增机遇卡 bridge 写入／复读入口。
2. 新增对战卡开始、取消、结算与恢复入口。
3. 建立通用对战档案及极难／标准／援助三档白名单配置。
4. 严格分开胜利 pending 与失败本地提示。
5. 完成重复提交、刷新恢复和写入失败测试。

停止条件：失败路径出现任何聊天楼层或 LLM 调用时立即回退修复。

### 阶段 C：UI 与胜利剧情

状态：**已完成维护源实现与离线验收，待阶段 D 真实运行复核**。

1. 背包接入两张卡及杂鱼标签。
2. 添加机遇卡状态与结果提示。
3. 添加对手选择面板、难度预览和战斗入口。
4. 添加胜利要求输入、锁定与重试。
5. 添加最小胜利模型投影和本地完成清理。

完成证据：背包两张卡入口、杂鱼标签与三档提示、八人对手选择、既有弹幕弹窗接线、取消不消费、失败本地提示、胜利要求锁定／稳定事务重试／刷新恢复、最小绿灯投影和回复完成清理均已有契约覆盖。投影明确允许未在庭院的对手进入独立战后场景，但不把出场写成到场事实。

停止条件：若真实运行发现胜利要求可借模型直接改托管状态，或失败分支会进入 GAL，则回退到阶段 C 修复，不接正式素材。

### 阶段 D：素材接入与验收

1. 等待所有者提供三份素材。
2. 登记 manifest、复制预览资源并内嵌 data URL。
3. 完成桌面／窄屏离线视觉检查。
4. 运行完整门禁：

```text
npm run check:ui
npm test
npm run build:ui
npm run package:checkpoint:dry
```

5. 使用 `sillytavern-runtime-debug` 完成真实 SillyTavern 验收。

本计划完成不等于功能完成；离线全绿也不等于真实宿主验收通过。

## 12. 验收结论标准

只有同时满足以下条件才能标记功能完成：

- 两张卡的库存与使用均为本地可信事务；
- 机遇卡不会引入未登记角色；
- 对战卡能选择每个完整登记角色；
- 三枚标签稳定触发援助难度；
- 胜利减少一枚，失败增加一枚；
- 胜利才进入要求剧情；
- 失败没有消息楼层、LLM 调用或关系写入；
- 刷新、Swipe、取消和重复 ID 不重复结算；
- 旧存档迁移通过；
- 离线完整门禁通过；
- 真实 SillyTavern 的新聊天、刷新、窄屏、触控与重挂载通过；
- 所有者完成卡面、标签表现、难度手感和胜利对话验收。
