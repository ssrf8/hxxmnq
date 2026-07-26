# 弹幕小游戏隔离优化协议

> 用途：交给后续执行 agent，限定其只优化本项目的符卡／弹幕小游戏，并保证开发预览与 SillyTavern 角色卡运行时都能使用。
>
> 本协议是执行边界，不是建议清单。出现未授权范围、接口不明或验证失败时，执行 agent 必须停止并报告，不得自行扩大改动。

## 1. 任务目标

在不改变移动庭园主系统、剧情、MVU schema、奖励规则和消息事务的前提下，完成弹幕小游戏的局部优化：

1. 改善 Canvas 战斗的画面、反馈、信息层级、窄屏布局与触控体验。
2. 优先复用已经存在的本地战斗素材，不下载远程图片，不引入运行时网络依赖。
3. 保持同一份 `BattleEngine` 同时服务温室妖花核心主线战和三个可重复符卡副本。
4. 保持现有 SillyTavern／Tavern Helper／MVU 调用链不变；小游戏只产出本地 `BattleResult`，不得自行读写酒馆状态或创建消息。
5. 只改白名单内文件；不得顺手整理、重构或修复其他模块。

本轮执行决策为 **Staged Refactor（分阶段局部重构）**，不是整页 UI 重做，更不是角色卡重写。

## 2. 当前实现地图

### 2.1 小游戏本体

| 维护源 | 当前职责 | 优化时的地位 |
|---|---|---|
| `src/ui/battle-engine.ts` | Canvas 循环、移动、射击、敌弹、碰撞、擦弹、阶段、绘制、结果生成 | 核心可编辑文件 |
| `src/battle/configs/greenhouse-flower-core-tutorial-v1.json` | 温室主线教学战，2 阶段 | 只允许平衡与表现参数的受控调整 |
| `src/battle/configs/dungeons/fairy-pattern-practice-v1.json` | 妖精弹幕练习，1 阶段 | 同上 |
| `src/battle/configs/dungeons/forest-magic-residue-v1.json` | 森林魔力残响，2 阶段 | 同上 |
| `src/battle/configs/dungeons/boundary-echo-trial-v1.json` | 结界回声试炼，2 阶段 | 同上 |
| `src/battle/dungeon-registry.json` | 三个副本 `config_id` 白名单和显示名 | 默认只读；不得改 ID、数量或文件映射 |

四份配置当前均为 `480 × 640`、3 条生命、普通／专注速度 `230 / 115`。允许弹型只有：

- `fixed_seed_ring`
- `petal_fan`
- `homing_leaf`
- `local_safe_zone`

速度边界为 `40..260`，数量边界为 `1..32`。不得新增未登记弹型后绕过验证。

### 2.2 UI 接入面

| 维护源 | 与小游戏有关的锚点 | 约束 |
|---|---|---|
| `src/ui/app.ts` | `battleDialog`、`battleCanvas`、`settleBattleResult`、`openDungeonMenu`、`startDungeonBattle`、`startBattle`、关闭／取消清理 | 只能编辑这些符号及紧邻的战斗素材初始化；不得改其他视图或事务 |
| `src/ui/index.html` | `#gg-battle-dialog` 与 `#gg-dungeon-dialog` 两个完整块 | 只能改这两个块内部 |
| `src/ui/styles.css` | `.gg-battle-*`、`#gg-battle-*`、`.gg-dungeon-*` | 新样式必须使用这些命名空间；不得重写全局 token 或通用组件 |
| `src/ui/types.ts` | `BattleResult`、`DungeonRunRecord`、bridge 两个战斗方法 | **只读契约**，不得修改字段或签名 |

### 2.3 可信结算链（只读边界）

主线妖花战：

```text
BattleEngine.onFinish(result)
  -> app.settleBattleResult(result)
  -> bridge.stageBattleResult(result)
  -> 校验 config_id / 数值 / settlement_id / 事件前置
  -> Mvu.replaceMvuData 写入同一 assistant 楼层的 battle.current
  -> 同楼层复读一致
  -> submitGalMessage(buildBattleSettlementMessage(result), 'battle')
  -> 创建真实玩家结算消息并触发一次剧情生成
```

可重复副本：

```text
BattleEngine.onFinish(result)
  -> app.settleBattleResult(result)
  -> bridge.settleDungeonResult(result)
  -> 本地白名单校验与原子 MVU 写入
  -> 按结果奖励 12 / 8 / 3 金币、推进一个时段、写 rewarded_ids
  -> 复读验证
  -> 不创建 user / assistant 楼层，不调用 LLM
```

小游戏不得知道 `Mvu`、`createChatMessages`、`triggerSlash`、`generate` 或消息楼层。它与酒馆之间唯一允许的出口是构造时注入的 `onFinish(result)` 回调。

### 2.4 已有战斗素材

优先使用透明底 `*-v1.png`，不要使用 `*-chroma.png`：

| 文件 | 尺寸 | 用途 |
|---|---:|---|
| `src/assets/battle/player/keycraft-player-sheet-v1.png` | 1536 × 1024 | 玩家机、射击与护盾状态 |
| `src/assets/battle/boss/greenhouse-flower-core-sheet-v1.png` | 1254 × 1254 | 妖花核心阶段／受击／击破表现 |
| `src/assets/battle/effects/battle-effects-sheet-v1.png` | 1536 × 1024 | 敌弹、玩家弹、命中、爆发与护盾效果 |

这些素材已在 `src/assets/asset-manifest.json` 登记为战斗用途，但当前 `scripts/build-ui.mjs` 没有复制或内嵌它们，`src/runtime/ui-host-shell.js` 也没有把战斗素材 URL 转交给游戏 iframe。离线预览里“能显示”不等于酒馆角色卡里能显示，必须补齐这条链并做产物检查。

## 3. 严格改动白名单

### 3.1 可直接编辑

- `src/ui/battle-engine.ts`
- `src/battle/configs/**/*.json`
- `src/assets/battle/**`
- `src/assets/asset-manifest.json` 中现有 `player` 与 `battle_assets` 节点
- 新建 `src/battle/**` 下仅供小游戏使用的 atlas 元数据、渲染辅助或纯函数模块
- 新建 `tests/battle-minigame.test.mjs`

### 3.2 仅可按锚点局部编辑

- `src/ui/app.ts`
  - 只允许：战斗素材来源、`BattleEngine` 创建参数、上述战斗函数、战斗对话框关闭清理。
  - 禁止：`refresh`、GAL、商店、设施、开场、地图、消息事务及其他 M2 逻辑。
- `src/ui/index.html`
  - 只允许：`#gg-battle-dialog`、`#gg-dungeon-dialog` 内部。
- `src/ui/styles.css`
  - 只允许：战斗／副本命名空间规则和相应窄屏、短屏、reduced-motion 媒体查询。
- `scripts/build-ui.mjs`
  - 只允许：复制／读取透明底战斗素材，生成对应 data URL，加入 `embedded`。
- `src/runtime/ui-host-shell.js`
  - 只允许在 `createGameFrame` 中把 `embedded` 的战斗素材 data URL 写到子 iframe 的 `documentElement.dataset`。
- `tests/ui-contract.test.mjs`
  - 原则上不改；若必须补现有打包契约断言，只能追加战斗素材与结算链断言，不能改弱既有断言。

### 3.3 绝对禁止编辑

- `src/ui/bridge.ts`
- `src/ui/types.ts`
- `src/ui/dungeon-rules.ts`
- `src/ui/greenhouse-rules.ts`
- `src/ui/event-settlement.ts`
- `src/ui/message-transaction.ts`
- `src/schema/**`
- `src/lorebook/**`
- `src/card/**`
- `src/runtime/01-mvu-loader.js`
- `src/ui/opening.ts`、地图、商店、设施、背包、访客、异变及其他非战斗模块
- `project/contract.md`、`project/api-provenance.md`、`project/manifest.json` 和既有实施记录
- `scripts/package-checkpoint.mjs`
- `package.json`、`package-lock.json`、依赖版本
- `dist/**`（生成物只能由构建命令产生，禁止手改）
- 已存在但与本任务无关的未提交改动、未跟踪文件和用户资料

若实现必须改动绝对禁止文件，立即输出 `Scope Expansion Requires Approval`，列出理由与最小方案，然后停止；不得先改后报。

## 4. 不可改变的行为契约

### 4.1 `BattleResult` 形状完全不变

必须原样产出：

```ts
interface BattleResult {
  settlement_id: string;
  config_id: string;
  outcome: 'clean_win' | 'narrow_win' | 'loss' | 'narrative';
  remaining_lives: number;
  grazes: number;
  duration_ms: number;
  hits: number;
  damage: number;
  phases_cleared: number;
  objective_ratio: number;
}
```

- `settlement_id` 必须唯一且匹配现有安全字符约束，不能使用随机正文或用户输入。
- `config_id` 必须原样来自已加载的本地配置。
- `onFinish` 每局最多调用一次；胜负、取消、关闭、重复点击和异步回调不得产生第二份结果。
- 主线允许 `narrative`；副本绝不允许 `narrative`。
- 取消／Escape／关闭不得结算、不得奖励、不得写 `battle.current`。

### 4.2 主线与副本不得串线

- `activeBattleKind === 'flower_core'` 继续走 `stageBattleResult` 和真实剧情消息。
- `activeBattleKind === 'dungeon'` 继续走 `settleDungeonResult`，不创建聊天消息。
- 不得把副本做成主线剧情生成，也不得把主线战改成本地金币结算。
- 不得改变副本奖励 `clean_win=12`、`narrow_win=8`、`loss=3`，不得改变一次副本推进一个时段。
- 不得改变温室事件前置、`battle.current` 消费、`settled_ids`／`rewarded_ids` 幂等规则。

### 4.3 酒馆运行时契约

目标依据为项目已记录的 SillyTavern `1.18.0`（commit `8172dcd0`）、Tavern Helper / JS-Slash-Runner `4.8.19`、ST-Prompt-Template `1.17.4.3` 与本卡固定的 MVU 加载器。执行 agent 不得凭记忆替换接口。

本任务不需要新增宿主 API。必须保留现有外层调用：

- `Mvu.getMvuData(...)`
- `Mvu.replaceMvuData(...)`
- `createChatMessages(..., { insert_before: 'end', refresh: 'none' })`
- `triggerSlash('/trigger await=true')`

执行 agent 不得在小游戏中直接调用这些函数，也不得改用私有宿主 DOM、`postMessage` 自创协议、远程 API 或新的全局变量。构建产物中的素材必须来自本地 `data:` URL 或既有开发相对路径，不得依赖 localhost、CDN、GitHub raw、图床或用户本机绝对路径。

### 4.4 生命周期契约

- `start()` 必须可预测；同一实例重复 `start()` 不得创建多个 RAF 循环。
- `destroy()` 必须幂等，并移除该实例注册的全部键盘、指针、可见性、失焦、计时器和 RAF 资源。
- 不得用匿名监听器造成无法移除的 `pointerdown` 等泄漏。
- 对话框关闭、Escape、iframe 卸载、页面隐藏时不得继续响应输入或后台推进战斗。
- 从后台恢复时不得把隐藏期间的墙钟时间一次性算入阶段时间，从而白送通关或瞬间刷出大量弹幕。
- 异步素材加载失败时必须降级为可玩的几何图形，不得让结算链失效。

## 5. 优化优先级

### P0：先修正确性与隔离

1. 玩家初始生命使用 `config.player.lives`，不要硬编码 3。
2. 玩家与敌人初始位置由 `arena` 尺寸派生，避免只适配 480 宽。
3. `clean_win` 判定应与本局初始生命一致，不能写死 `lives === 3`。
4. 结果回调加单次完成门；`stop()`、胜利、死亡和关闭路径不得竞态复入。
5. 完整清理所有事件监听与 RAF；修复当前匿名 `pointerdown` 无法移除的问题。
6. 明确暂停／恢复的游戏时钟，后台切换不偷跑。

这些是小游戏内部修复，不授权修改 `BattleResult` 或 bridge。

### P1：画面与反馈

1. 使用现有透明图集渲染玩家机、妖花核心和通用弹／命中特效；建立显式 atlas 裁切元数据，禁止在绘制代码各处散落魔法数字。
2. 保留几何绘制 fallback，并在素材未加载、裁切失败或 Canvas 不支持目标能力时安全降级。
3. 区分四类敌弹的颜色、轮廓或形状；危险状态不能只靠颜色表达。
4. 增加可读的 Boss 生命、阶段、玩家生命、擦弹、专注命中点、受击无敌闪烁和阶段切换反馈。
5. `local_safe_zone.warning_ms` 应有清晰预警；当前配置中的 `warning_ms`、`duration_ms` 与 `turn_rate_deg` 若被实现，必须仍受配置边界控制并补测试。
6. 可加入轻量粒子、屏幕震动或光效，但不得影响碰撞判定；尊重 `prefers-reduced-motion`，并提供关闭强动态反馈的路径。

### P1：输入与响应式

1. 保留方向键／WASD 与 Shift 专注。
2. 保留指针拖动；触控必须防止页面滚动抢夺，并提供明确的专注操作方式，不能要求移动端物理 Shift 键。
3. Canvas 逻辑坐标保持配置尺寸，CSS 在约 320px 宽容器内完整缩放，不产生横向滚动。
4. 对话框在短视口中使用内部滚动；取消按钮、状态和关键操作不得被 Canvas 顶出视口。
5. 键盘焦点可见，Canvas 与按钮均有可访问名称；状态变化用 `role=status`／`aria-live` 的现有区域通报。

### P2：性能

1. 目标为普通桌面 60 FPS，低性能设备允许平稳降级到 30 FPS；不得让视觉粒子改变固定游戏逻辑结果。
2. 对敌弹、玩家弹和粒子设置明确上限；避免每帧无界对象增长、重复图片解码、布局测量和 DOM 写入。
3. 只在必要时分配临时对象；先测量再考虑对象池，不要为了“高级”堆抽象。
4. 生产构建只嵌入实际使用的透明素材或裁切后素材，不同时打包 alpha 与 chroma 两套大图。

## 6. 执行顺序与补丁预算

### 阶段 A：基线与小范围正确性

- 先记录 `git status --short`；当前工作树已有其他功能的未提交改动，严禁清理、回退或格式化它们。
- 运行 `npm run check:ui` 与 `npm test`。本协议编写时基线为：TypeScript 检查通过，60/60 测试通过。
- 只修 P0 小游戏内部问题并补 `tests/battle-minigame.test.mjs`。
- 阶段预算：最多 3 个维护源文件，建议少于 180 行净变更。

### 阶段 B：素材接入与视觉优化

- 先确定 atlas 裁切表和 fallback，再接入 UI。
- 允许编辑白名单中的构建／iframe 数据集转交点，但不得改宿主生命周期和 bridge globals。
- 阶段预算：最多 8 个维护源文件（不计新增裁切素材和单一测试文件），建议少于 450 行净变更。

### 阶段 C：窄屏、触控与验收

- 只处理战斗 dialog、Canvas、战斗 HUD 和副本选择块。
- 不得顺手统一全项目按钮、字体、颜色、dialog 或响应式规则。
- 若单阶段超过预算，先停止并拆分，不得用“大重构比较干净”作为越界理由。

任何阶段都禁止打包角色卡、覆盖检查点、发布、提交、推送或部署，除非用户另行明确授权。

## 7. 强制验证门

### 7.1 每次实现后必须通过

```powershell
npm run check:ui
npm test
npm run build:ui
```

并检查：

- `dist/ui/index.html`、`dist/ui/app.js`、`dist/ui/styles.css` 能生成。
- `dist/runtime/ui-mount.js` 自包含实际使用的战斗素材；不得出现 `localhost`、本机盘符或远程 URL。
- `git diff --name-only` 只包含本协议白名单文件和构建生成物；最终交付不得把 `dist/**` 当维护源手改。
- 既有结算链静态断言不被删除或放宽。

### 7.2 必须新增的自动化覆盖

至少覆盖：

1. 使用配置生命数和 arena 派生位置。
2. `onFinish` 每局只调用一次。
3. `destroy()` 幂等且不留输入／RAF 监听。
4. 四类已登记弹型仍受参数上限约束；未知弹型拒绝或安全降级，不能执行任意配置。
5. 胜、负、阶段超时、取消分别产出或不产出正确结果。
6. 主线结果仍调用 `stageBattleResult`；副本结果仍调用 `settleDungeonResult`。
7. 主线保留剧情解决按钮，副本隐藏该按钮。
8. 构建产物包含所需透明战斗素材且不包含 chroma 重复副本。

### 7.3 真实 SillyTavern 运行验收（静态检查不能替代）

使用包含本次修改的**新候选产物**，在目标酒馆环境验证：

- 新聊天、旧存档、切换聊天、切换角色卡、重载 iframe 后均只有一个战斗实例。
- 温室主线战胜／负／剧情解决各走一次可信 `battle.current` 写入、复读和真实剧情消息；正文伪造结果无效。
- 写入失败后“重试写入与结算”复用同一结果，不重开战、不产生第二个 `settlement_id`。
- 三个副本胜／负各只本地结算一次；金币、时段、`rewarded_ids` 正确，聊天楼层数不增加。
- 主动取消、Escape、关闭 dialog、切聊天均不结算、不奖励、不残留输入。
- 约 320px 宽、短视口、200% 缩放、触控与键盘均可操作；焦点和状态提示可见。
- 页面后台放置后恢复，不瞬间超时、不刷弹、不白送通关。
- 断开素材或模拟加载失败时 fallback 仍可完成战斗和结算。
- 控制台无未处理异常；宿主原生聊天恢复机制不受影响。

在真实目标酒馆完成上述证据前，只能报告“构建候选通过静态验证”，不得声称“酒馆调用已验收”。

## 8. 停手与回滚条件

出现任一情况立即停止本阶段：

- 需要改绝对禁止文件或新增宿主 API。
- 需要改变 `BattleResult`、MVU schema、奖励、时段、事件前置、消息数量或检查点格式。
- 无法证明主线与副本仍走各自结算链。
- 素材只能靠远程 URL、绝对路径或执行不可信脚本加载。
- 测试由 60/60 基线变为失败，且失败不能证明为与本任务无关的既有变化。
- 最终 diff 出现非白名单文件、全文件格式化、换行风格清洗或用户改动被覆盖。
- 需要重写整个 `app.ts`、`bridge.ts`、宿主壳或角色卡架构。

回滚只回滚执行 agent 自己在本任务中新增的改动；不得使用 `git reset --hard`、`git checkout --` 或任何会覆盖用户现有工作树的命令。

## 9. 执行 agent 的交付格式

最终必须按以下顺序报告，缺一项视为未完成：

1. **改动文件**：逐个列出，只能来自白名单。
2. **行为契约**：明确 `BattleResult`、主线／副本结算、取消语义均未改变。
3. **画面与输入改进**：说明使用哪些本地素材、fallback、窄屏和触控方案。
4. **酒馆兼容**：说明只通过既有 `onFinish -> app -> bridge` 调用链；列出实际完成与仍待完成的真实运行验证。
5. **验证结果**：贴出 `check:ui`、测试数量、`build:ui` 和产物自包含检查结果。
6. **范围审计**：贴出 `git diff --name-only`，说明没有编辑禁止文件、没有覆盖既有未提交改动。
7. **残余风险**：如 atlas 裁切、移动端型号、目标酒馆版本或实机权限仍未验证，必须直说。

一句话版本：**可以把弹幕战打扮得像样一点，但它只能把可信结果递给现有 bridge；谁敢顺手碰剧情、MVU、奖励或角色卡打包，就立刻停手。**
