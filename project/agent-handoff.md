# Agent 对接与交接

## 当前状态

- 当前可验收检查点：`0.2.0-r15`
- 角色卡：`../dist/checkpoint-0.2.0-r15/幻想乡物语-测试检查点-0.2.0-r15.json`
- SHA-256：`51c0f0bfa487df32c3647a8ad9c9bb4ecc7276f1ecb1c206ef4ccf22dc03dab5`
- 当前实机环境：Luker `2.7.0 release`、Tavern Helper 本机清单版本 `4.8.18`
- MVU 固定来源：MagVarUpdate commit `d1bdfd1`
- 当前阶段：M1 最小闭环与 M3 真实运行验收并行推进；r15 GAL 单壳交互垂直切片已打包并导入，等待所有者真实生成验收。
- Git 交付范围：确定性零生成开场、同层常驻壳、目标操作菜单、GAL 分段表现、消息事务、Swipe/停止/续写、主屋维修闭环、r15 打包器与交付包、契约测试和运行报告。

## r15 已实现并交付：GAL 单壳互动

- 庭院点击角色或主屋后，操作菜单出现在目标附近；移动端降级为底部面板。
- 灵梦支持“对话 / 摸摸头 / 离开”，对话进入占位近景、最多 6 段点击播放、建议回复、手动输入和结束聊天。
- 后台继续使用真实且非隐藏的 user/assistant 楼层；玩家视角只显示一个游戏壳，消息 DOM 和原生输入区仅在游戏模式下受控隐藏。
- 发送、生成、停止后续写、重新生成和左右 Swipe 使用本机 4.8.18 / Luker 2.7.0 已核对的精确接口。
- `<GensokyoScene>` 只允许纯文本、已知 speaker 与白名单反应；旧消息或坏格式安全降级为普通文本，不执行模型给出的 HTML、路径或 URL。
- 旧主屋支持“检查 / 维修”，维修先显示消耗与时间影响，确认后播放施工动画；只允许 `main_house_enabled` 与 `temporary_shelter_only` 两种结果。
- 互动结算使用 `interaction:<uid>` 与 `interaction.settled_ids` 幂等，重复收尾不得再次扣资源或推进时间。
- 离线门禁 17/17 通过；r15 已导入 Luker，内嵌世界书与三个角色脚本已启用，保留 r14。
- 实机预检停在全新开场，未替所有者提交资料或消耗 LLM；证据见 `runtime-report-0.2.0-r15.md`。

## r15 已确认规划：单壳 GAL 互动

- 玩家正常游玩时只看见一个常驻游戏壳；后台真实 user/assistant 楼层继续保存上下文、Swipe 和 MVU，但只做 DOM 视觉隐藏。
- 角色和设施附近的入口操作由本地注册表与 MVU 前置条件计算；“摸摸头”等动作进入完整 GAL 会话。
- GAL 回复一次最多 6 个演出片段，全部播放完才出现 2–4 个建议回应、手动输入和结束聊天。
- r15 等待完整 assistant 楼层与 MVU 落盘后再播放，不实现流式 GAL 解析。
- 结束聊天发送真实离场消息，由 LLM 完成一次收尾回复和幂等结算；交互回合完成不必然推进时段。
- 活跃会话中切换目标时必须返回、结束、条件式邀请加入或取消，不得覆盖旧会话。
- 角色近景图先使用占位素材；LLM 只输出白名单反应标签，本地注册表负责解析与降级。
- 第一垂直切片为灵梦“对话／摸摸头”和旧主屋“检查／维修”，完整计划见 `gal-interaction-plan.md`。

## r14 已验收：宿主输入区与切卡生命周期

- 庭院模式不再隐藏整个 `#send_form`，酒馆原生聊天输入框、发送区和魔法棒保持可用。
- 挂载时冻结当前 `SillyTavern.characterId`；切换到其他角色卡后立即销毁庭院壳层、样式、返回按钮、观察器和事件订阅。
- 增加 `pagehide` 清理，避免页面重载或 iframe 卸载后遗留宿主节点。
- 已在真实 Luker 中验证 r14 → Assistant → r14 的直接切换，跨卡后无延迟回挂，切回后只有一份界面实例。
- 已删除酒馆中的 r13 角色卡与 r13 世界书；历史聊天目录保留。
- 完整证据与用户验收记录见 `runtime-report-0.2.0-r14.md`。

## r13 已继承进 r14：确定性零生成开场

- r13 的确定性零生成开场已随 r14 打包并导入；r13 旧角色卡与世界书已经从酒馆删除。
- 新聊天点击“载入资料并进入庭院”后不创建 user 消息、不触发 `/trigger`、不调用 LLM。
- bridge 将 `initial-state.json` 与开场资料合并到当前聊天首个 assistant 楼层，使用精确 `message_id` 调用 `Mvu.replaceMvuData`，复读通过后才进入庭院。
- 相同资料重复提交幂等成功；已有不同开场资料或普通 user 消息时拒绝静默覆盖。
- 数据库只在 `meta.opening_committed=true` 的 MVU 状态复读成功后做可选归档。
- 旧 r12 及更早聊天的 `gensokyo_opening` 消息、确定性恢复和受限修复入口继续保留为兼容路径。
- r14 的静态门禁与宿主生命周期实机检查已经完成；零生成初始化、刷新恢复、重复点击与首次行动生成仍由所有者完成最终人工验收。

接手前先阅读：

1. `../幻想乡领地建设剧情卡-第一版总体计划.md`
2. `contract.md`
3. `../src/card/opening-contract.md`
4. `api-provenance.md`
5. `runtime-report-0.2.0.md`
6. `same-layer-refactor-plan.md`
7. `runtime-report-0.2.1-same-layer.md`
8. `runtime-report-0.2.2-deterministic-opening.md`

## r12 继承的 r11 开场修复

此前新聊天只有空消息变量 `{}`。开场完全依赖 LLM 输出正确变量块，一旦模型漏格式或写出错误 JSONPatch 路径，玩家即使已经发送资料并收到正文，也无法进入庭院。

根因是固定版 MagVarUpdate 只会从已启用、备注包含 `[initvar]` 的世界书条目初始化消息楼层变量；角色变量或酒馆助手变量不能代替这一消息层初始种子。旧包没有 `[initvar]` 条目。

r12 继续保留以下两层修复：

1. 打包时新增 `[initvar] 移动庭园初始状态`，内容来自 `src/schema/initial-state.json`。
2. 开场回复完成后若 `meta.opening_committed` 仍未成立，显示“确认资料并进入庭院”。按钮从带事务标记的原始 user 消息读取姓名、称谓、外貌与庭园名，在对应 assistant 楼层补齐完整初始状态并复读验证，不依赖 LLM 变量块。

LLM 修复消息仍保留为次要恢复手段，不能作为唯一入口。

## r12 新增的同层主体

- 游戏界面直接挂载到 `#chat`，不再使用覆盖页面的 fixed 悬浮框。
- 游戏模式只隐藏原生消息与输入框，不删除真实楼层；可随时切到原生聊天并返回。
- 普通互动使用非隐藏真实 user 消息、唯一事务 ID 与一次正常生成。
- 最新回复缺少 `stat_data` 时，向前读取最近一份正式 MVU 状态。
- 地图只显示 NPC 像素小人，不显示玩家小人；灵梦支持四向 idle/walk。
- 宿主聊天节点变化后仍维持一个 `#gensokyo-game-shell`。

## r12 及更早聊天的兼容恢复约束

- 草稿阶段不写入 MVU。
- “确认并开始”只发送一条带事务标记的真实 user 消息。
- “确认资料并进入庭院”只有在该 user 消息之后已经存在 assistant 回复时才能启用。
- 恢复数据只能来自当前聊天、当前事务的原始 user 消息，不能从 LLM 正文反推。
- 写入目标必须是开场后的最新 assistant 楼层，并使用精确 `message_id`。
- 缺少或残缺 `stat_data` 时，以 `initial-state.json` 补齐；现有非开场状态优先保留。
- 确定性恢复只覆盖玩家姓名、称谓、外貌、庭园名、庭守钥状态及两个开场 meta 标志。
- 写入后必须重新读取同一楼层；验证失败时不得切换到主庭园界面。
- 所有恢复操作必须幂等，不推进时间、资源、关系或事件。
- UI 始终保留返回原生聊天的入口。

## 关键实现位置

- 开场事务与恢复控制：`../src/ui/opening.ts`
- 酒馆/MVU 桥接与确定性写入：`../src/ui/bridge.ts`
- Bridge 类型契约：`../src/ui/types.ts`
- 开场页面结构：`../src/ui/index.html`
- 初始状态唯一源：`../src/schema/initial-state.json`
- 角色卡打包与 `[initvar]` 注入：`../scripts/package-checkpoint.mjs`
- 开场契约测试：`../tests/ui-contract.test.mjs`

不要把 `dist/` 中的生成文件当作源文件直接修改。

## r12 已完成的导入与冒烟验收

在本地 SillyTavern `1.18.0 release (8172dcd0e)` 与 Tavern Helper `4.8.19` 中：

1. 导入 r12 JSON，并导入、绑定唯一世界书 `幻想乡物语·移动庭园 0.2.0-r12`。
2. 启用酒馆助手“角色脚本”总开关，三个随卡脚本均建立运行 iframe。
3. 新聊天首次挂载 `#gensokyo-game-shell`，直接父节点为 `#chat`，版本为 `0.2.1-same-layer`。
4. 开局表单可见，“确认并开始”可用，状态显示“庭园状态已同步”。
5. 游戏模式隐藏原生消息与 `#send_form`；切换原生聊天后恢复；返回后仍只有一个游戏壳。
6. 刷新后角色世界书绑定与角色脚本总开关持久化。
7. r11 角色卡及未引用的 r11 世界书已移除；r11 聊天保留。角色库内只剩一个幻想乡交接卡 r12。
8. 浏览器没有新增 error。

离线检查同时通过：

- `npm run build:ui`
- `npm run check:ui`
- `npm test`：13/13
- `npm run package:checkpoint:dry`
- `npm run package:checkpoint`
- 打包 JSON 复读：3 个唯一脚本、15 条世界书、`[initvar]` 存在，内嵌 UI SHA 与构建产物一致。

## r11 历史开场验收

在本地 SillyTavern 中导入 r11、导入内嵌世界书并启用角色脚本后完成以下链路：

1. 新建 r11 聊天，移动庭园 iframe 单例挂载，最小高度为 `320px`。
2. 填写姓名“风宝验收”、称谓“她/她”、外貌“银灰短发，佩戴风铃发饰”、庭园名“风铃庭”。
3. 发送真实开场消息并收到 LLM 正文；本次模型确实没有输出可用变量格式。
4. 回复完成前确定性进入按钮禁用，回复完成后启用。
5. 点击按钮后界面切换到“风铃庭”主庭园。
6. 对应 assistant 消息楼层实际落盘：
   - `player.name = 风宝验收`
   - `player.pronouns = 她/她`
   - `player.appearance = 银灰短发，佩戴风铃发饰`
   - `garden.name = 风铃庭`
   - `meta.initialized = true`
   - `meta.opening_committed = true`
   - `key_items.garden_keeper_key.obtained = true`
   - `key_items.garden_keeper_key.state = 苏醒`
   - `resources.materials = 6`
   - `resources.inspiration = 1`
   - 六个初始区域与四个初始设施均存在。
7. 浏览器控制台没有 error。

静态检查同时通过：

- `npm run build:ui`
- `npm run check:ui`
- `npm test`：当时 10/10
- `npm run package:checkpoint:dry`
- `npm run package:checkpoint`

## 接手后的优先事项

1. 先完成 `runtime-report-0.2.0-r15.md` 中所有者待验收项，特别是真实生成、停止后续写、双向 Swipe、唯一结算和原生恢复。
2. 根据验收结果只修阻断问题；保持 r14 为已接受基线，r15 产物采用拒绝覆盖策略。
3. r15 通过后，下一切片优先建立角色反应素材注册表，用灵梦的白名单反应替换通用占位图；LLM 仍不得直接给路径或 URL。
4. 然后把目标操作扩展到第二名角色，并为魔法温室增加“调查 / 正常使用 / 异常事件”的设施事务，复用已经验证的 GAL 与幂等结算链。
5. 若修改状态 schema、开场字段或世界书初始化方式，同时更新：
   - `initial-state.json`
   - `02-mvu-schema.js`
   - `field-ledger.md`
   - `opening-contract.md`
   - 打包脚本与契约测试。
6. 后续检查点继续使用新版本目录、唯一脚本 ID 与唯一世界书名，禁止覆盖已有产物。

## 常用命令

```powershell
npm run build:ui
npm run check:ui
npm test
npm run package:checkpoint:dry
```

只有用户明确要求打包时才运行：

```powershell
npm run package:checkpoint
```
