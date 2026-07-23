# Agent 对接与交接

## 当前状态

- 当前可验收检查点：`0.2.0-r12`
- 角色卡：`../dist/checkpoint-0.2.0-r12/幻想乡物语-测试检查点-0.2.0-r12.json`
- SHA-256：`918e9263d1391f74b41decdbf0f4821c09d9d01f12cc1350e83f5d28f1a1e952`
- 目标运行环境：SillyTavern `1.18.0 release`、酒馆助手实际运行版本 `4.8.19`
- MVU 固定来源：MagVarUpdate commit `d1bdfd1`
- 当前阶段：M1 最小闭环与 M3 真实运行验收并行推进；r12 已导入本地酒馆，等待所有者手动验收，不是正式发布版。
- Git 交付范围：同层常驻壳、消息事务、灵梦 NPC 动画、r12 打包器与交付包、契约测试和本轮文档；r7-r11 中间测试包不进入本次仓库提交。

接手前先阅读：

1. `../幻想乡领地建设剧情卡-第一版总体计划.md`
2. `contract.md`
3. `../src/card/opening-contract.md`
4. `api-provenance.md`
5. `runtime-report-0.2.0.md`
6. `same-layer-refactor-plan.md`
7. `runtime-report-0.2.1-same-layer.md`

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

## 必须保持的开场约束

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

1. 由所有者完成 r12 开场资料提交、首轮生成与确定性进入庭院的手动验收。
2. 补做重复点击、Swipe 分支、生成失败/停止后继续生成与聊天切换的真实运行验收。
3. 在具有 `presence_snapshot` 的真实楼层验收 NPC 像素动画、点击与无玩家小人约束。
4. 若修改状态 schema、开场字段或世界书初始化方式，同时更新：
   - `initial-state.json`
   - `02-mvu-schema.js`
   - `field-ledger.md`
   - `opening-contract.md`
   - 打包脚本与契约测试。
5. 新检查点使用新版本目录和唯一世界书名，禁止覆盖已有产物。
6. 仓库只提交当前交接包 r12；旧检查点产物留在本机追溯，不作为后续开发输入。

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
