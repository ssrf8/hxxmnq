# 同层常驻游戏壳与 NPC 像素动画重构计划

> 实施状态（2026-07-23）：Slice A、B、C 已实现；Slice D 已完成 `0.2.0-r12` 打包、导入、世界书绑定与基础同层冒烟验收。当前是等待所有者手动验收的候选，不是正式发布版。

## 1. 决策记录

本计划以 `0.2.0-r11` 为历史重构基线，当前交接检查点为 `0.2.0-r12`。r11 的本地产物与聊天记录可用于追溯，但酒馆角色库和世界书列表中的 r11 已清理，不再作为当前可选卡。

用户已确认：

- 采用“聊天区内常驻单壳”方案：视觉上是唯一 0 层游戏界面，技术上不绑定真实消息 0 楼。
- 其他消息楼层只做 DOM 视觉隐藏，不删除聊天文件中的真实消息。
- 庭园地图只显示 NPC 像素小人，不显示玩家。
- 第一切片先完成同层壳和消息事务，再用一个 NPC 完成 `idle + walk` 动画样板。
- 角色卡与游戏前端必须完全自包含，不依赖远程网站、远程脚本或开发服务器。

## 2. 目标体验

进入角色聊天后，酒馆聊天区域本身显示完整游戏界面，不再出现悬浮在页面上的 fixed iframe。玩家在庭园、角色互动、消息记录和符卡战之间切换时，始终停留在同一个游戏壳内。

底层仍保留正常的 SillyTavern 对话：

- 每次玩家行动创建真实 user 消息。
- 每次模型回复创建真实 assistant 消息。
- MVU 继续在 assistant 消息楼层维护 `stat_data`。
- Swipe、重新生成、消息编辑和聊天分支仍以真实消息为基础。
- 游戏模式下隐藏消息 DOM；维护模式下恢复原生聊天。

## 3. 不采用的方案

### 3.1 不固定在真实消息 0 楼

长聊天可能不会把 0 楼加载进当前 DOM；消息重载、懒加载和 Swipe 也可能重建该楼层。将应用生命周期绑定 0 楼会造成壳消失或动画重置。

### 3.2 不复制“最新 assistant 楼层滚动壳”

参考卡的滚动壳适合它自己的生成与 metadata 状态体系，但本项目依赖真实 assistant 楼层上的 MVU 状态。完全复制会增加手动创建回复、MVU 解析时序和壳重建风险。

### 3.3 不删除真实聊天消息

“删除其他楼层”仅指隐藏或移出当前渲染流。不得调用消息删除 API 清除真实上下文。

### 3.4 不使用 `is_hidden`

所有正式 user/assistant 消息保持 `is_hidden=false`，避免改变模型上下文和破坏既有契约。

## 4. 目标架构

### 4.1 Host 层

新增 `SameLayerShellController`，由受信任的角色脚本挂载：

1. 等待 SillyTavern 与 Tavern Helper 就绪。
2. 找到当前聊天容器 `#chat`。
3. 在聊天容器内插入唯一的 `gensokyo-game-shell`。
4. 创建自包含 iframe，将已构建的 HTML、CSS、JavaScript 和必要素材写入 iframe。
5. 启用楼层视觉隐藏。
6. 在聊天切换、宿主重建或脚本销毁时执行统一清理。

壳必须：

- 使用流式宽高，不采用遮挡页面的 fixed 全屏布局。
- 具有自己的滚动区域。
- 在约 320px 宽容器、短视口和移动端键盘弹出时仍可操作。
- 保持单例，重复初始化不得产生第二个壳。
- 不依赖真实消息 0 楼是否在 DOM 中。

### 4.2 楼层可见性层

新增 `FloorVisibilityController`：

- 使用命名空间 CSS class 控制 `#chat > .mes` 的显示。
- 使用 `MutationObserver` 处理新消息、重新渲染和懒加载。
- 默认隐藏消息 DOM，但不修改消息数据。
- “显示原生聊天”时暂停隐藏规则并恢复消息显示。
- “返回游戏”时重新启用规则并确保常驻壳存在。
- 不能直接永久改写楼层的内联样式而不保存和恢复原值。

宿主聊天容器变化时，控制器应重新解析目标，而不是假设节点永久存在。

### 4.3 消息事务层

在现有 `GardenBridge` 之上增加 `MessageTransactionCoordinator`，统一处理开场和普通互动。

状态机：

```text
idle
  -> submitting_user
  -> generating
  -> settling
  -> idle

任意阶段失败 -> failed -> retrying 或 idle
```

每个事务包含：

- `transactionId`
- `chatId`
- `kind`：opening / interaction / settlement
- 原始输入快照
- user 消息是否已创建
- assistant 回复是否已出现
- 开始时间
- 最后错误

第一实现优先继续使用已经过 r11 验证的正常生成链：

1. `createChatMessages` 创建真实 user 消息。
2. 写入时选择最小刷新范围，避免刷新常驻壳。
3. 使用正常触发生成路径创建真实 assistant 回复。
4. 通过酒馆事件与消息复读确认回复落盘。
5. MVU 更新结束后读取最新 assistant 楼层的 `stat_data`。

不得静态假定 `generate()` 会创建正常聊天楼层或自动触发 MVU。若后续考虑用 `generate()` 替代 `/trigger`，必须先做单独的真实运行探针。

事务必须满足：

- 相同事务重复点击不创建第二条 user 消息。
- 切换聊天后旧事务不得写入新聊天。
- 停止生成后保留已存在的真实 user 消息，并提供继续生成或编辑入口。
- 生成失败时明确区分“没有 user 消息”和“已有 user、没有 assistant”。
- Swipe、重新生成后重新读取被选中的 assistant 页及对应 MVU 状态。
- UI 刷新只更新数据视图，不重建未变化的 Canvas 和动画循环。

### 4.4 状态归属

| 状态 | 唯一归属 | 示例 |
| --- | --- | --- |
| 正式游戏状态 | MVU `stat_data` | 资源、设施、NPC 所在区域、NPC 当前活动 |
| 叙事历史 | SillyTavern 消息 | 玩家行动、角色回复、Swipe |
| 开场草稿 | `sessionStorage`，按 chatId 隔离 | 姓名、称谓、外貌、庭园名 |
| 临时事务 | iframe 内存 | 正在提交、生成 ID、错误 |
| 纯 UI 偏好 | iframe 内存；必要时可用 chat metadata | 当前标签、音量、镜头缩放 |
| 动画状态 | iframe 内存 | 当前帧、像素插值、行走进度 |

禁止把资源、人物关系、NPC 正式位置等游戏状态复制到 chat metadata 形成第二事实源。

## 5. NPC 像素动画子系统

首个验证角色默认采用博丽灵梦，只实现 NPC，不实现玩家地图角色。

### 5.1 模块边界

- `SpriteRegistry`：登记角色图集、帧尺寸、动作和方向。
- `SpriteAssetLoader`：预加载并缓存自包含素材，失败时返回静态占位。
- `SpriteAnimator`：推进 `idle`、`walk` 等动画帧。
- `ActorController`：根据区域锚点、路径和目标切换动作与朝向。
- `GardenRenderer`：按背景、设施、角色、前景、交互提示的顺序绘制。
- `ActorHitTest`：把点击坐标映射到 NPC。
- `AnimationClock`：管理 `requestAnimationFrame`、时间步长和暂停恢复。

### 5.2 MVU 与动画映射

MVU 只提供语义状态，例如：

```json
{
  "area_id": "central_courtyard",
  "action": "检查结界",
  "facing": "left"
}
```

前端把语义状态映射为：

- 出生锚点；
- 巡逻路径；
- `idle` 或 `walk` 动画；
- 朝向；
- 点击热区。

不得把 `frameIndex`、屏幕像素坐标、插值进度写入 MVU。

### 5.3 动画降级

- `prefers-reduced-motion: reduce` 时禁用自动巡逻，只保留低频 idle 或静态帧。
- iframe 不可见或游戏切换到原生聊天时暂停动画循环。
- 素材加载失败时绘制带角色名的静态标记，不能让整个地图空白。
- 数据缺失时回退到中央庭院和正面 idle。

## 6. 实施切片

### Slice A：常驻单壳（已实现）

预计修改：

- `scripts/build-ui.mjs`
- `src/ui/index.html`
- `src/ui/styles.css`
- 新增 Host 挂载与楼层控制模块
- `tests/ui-contract.test.mjs`

已完成：

- iframe 位于聊天区域，不再使用覆盖页面的 fixed 布局。
- 游戏模式只显示一个壳。
- 新消息出现时不会出现可见的额外消息卡。
- 原生聊天可以显示并再次返回游戏。
- 宿主 `#chat` 节点替换后会清理陈旧克隆并保持单壳；跨聊天销毁与重建仍需扩大真实运行覆盖。

### Slice B：消息事务协调器（已实现，异常分支待扩大验收）

预计修改：

- `src/ui/bridge.ts`
- `src/ui/types.ts`
- `src/ui/opening.ts`
- `src/ui/app.ts`
- 新增事务协调模块
- 更新 API 来源记录和契约测试

已完成：

- 普通互动、开场提交和修复操作共享明确的事务保护。
- 连点不会重复创建消息。
- 已实现生成失败、停止后继续生成和聊天切换保护；失败、停止与切换组合仍需真实运行验收。
- 真实 user/assistant 消息与 MVU 状态均正常落盘。

### Slice C：灵梦动画样板（已实现，真实状态楼层待验收）

预计修改：

- `src/ui/garden-map.ts`，必要时拆分为渲染器与 actor 模块
- `src/ui/types.ts`
- `src/assets/characters/reimu/`
- `src/assets/asset-manifest.json`
- UI 契约或动画逻辑测试

已完成：

- 灵梦具有 idle 与四向或最低可接受方向集的 walk 动画。
- 灵梦可在中央庭院预设路径中移动。
- 点击灵梦仍打开现有角色交互入口。
- 不显示玩家地图角色。
- 生成消息期间动画壳不被重建。

### Slice D：整体验收与新检查点（候选已交付）

用户已明确授权并生成、导入新的检查点角色卡。

已完成：

- 静态构建、契约测试和 dry-run 均通过。
- 已在真实 SillyTavern 1.18.0、Tavern Helper 4.8.19 上完成导入、脚本授权、世界书绑定、首次挂载和原生聊天切换冒烟。
- 新产物位于 `dist/checkpoint-0.2.0-r12/`，使用唯一角色卡名、脚本 ID 和世界书名。
- r12 未覆盖任何旧产物；酒馆内只保留 r12 这一张幻想乡交接卡。

仍待完成：

- 所有者提交真实开场资料并确认首轮生成、确定性恢复与进入庭院。
- 真实 Swipe、重新生成、停止/失败后继续生成和跨聊天切换。
- 具有 `presence_snapshot` 的正式 MVU 楼层中的灵梦动画与点击。
- 移动端容器、软键盘和长文本布局。

## 7. 验收矩阵

### 生命周期

- 新聊天首次挂载。
- 刷新页面后恢复。
- 切换到其他聊天再返回。
- 消息编辑、重新渲染和加载更多历史。
- 脚本重复初始化。

### 消息与生成

- 正常发送并回复。
- 连续快速点击发送。
- 生成中停止。
- 网络或模型生成失败后重试。
- 已有 user 消息但没有 assistant 回复时继续生成。
- 重新生成与左右 Swipe。
- 开场正常提交与确定性恢复。

### 数据

- 最新 assistant 楼层能够读取完整 `stat_data`。
- MVU 更新后 UI 刷新但动画实例不重建。
- 原生聊天显示后，真实消息内容和顺序完整。
- 没有任何消息被设置为 `is_hidden=true`。
- 不产生第二份正式游戏状态。

### 界面

- 宽桌面。
- 约 320px 宽聊天容器。
- 短视口。
- 移动端软键盘。
- 200% 缩放和长中文文本。
- 键盘操作、焦点可见、按钮触控尺寸。
- reduced motion。

### 动画

- 素材成功与失败两种路径。
- idle、walk、停止、转向。
- 点击移动中的 NPC。
- 页面隐藏后暂停，返回后无时间跳跃。
- 生成、Swipe 和数据刷新时不重复创建 RAF 循环。

## 8. API 依据与运行探针

目标环境：

- SillyTavern：`1.18.0 release`
- Tavern Helper / JS-Slash-Runner：`4.8.19`
- MVU：固定 MagVarUpdate commit `d1bdfd1`

已由本机 4.8.19 声明确认：

- `getChatMessages(range, options)`
- `createChatMessages(messages, { insert_before, refresh })`
- `refresh: 'none' | 'affected' | 'all'`
- `eventOn(...)`
- `tavern_events.MESSAGE_RECEIVED`
- `tavern_events.MESSAGE_UPDATED`
- `tavern_events.MESSAGE_SWIPED`
- `tavern_events.CHAT_CHANGED`
- `tavern_events.GENERATION_STARTED / STOPPED / ENDED`
- `generate({ generation_id, user_input, should_stream, should_silence, ... })`

仍需真实运行确认：

1. MVU 更新事件相对 `MESSAGE_RECEIVED` 与 `GENERATION_ENDED` 的完整时序。
2. Swipe 后 `message_id`、`swipe_id` 与 `stat_data` 的一致性。
3. 生成失败、停止、继续生成和聊天切换组合下的事务恢复。
4. 页面刷新时当前角色聊天能否由宿主自动恢复，而不依赖再次选择角色。

已确认 `createChatMessages(..., { refresh:'none' })` 后 `/trigger` 能创建一条可见 user 与一条 assistant，回复后同层壳保持单例；脚本 iframe 与同层游戏 iframe 中的必要全局也已在当前目标环境可用。声明与单次探针仍不能替代上述异常和分支时序验收。

## 9. 风险与回退

- r12 是当前唯一酒馆交接卡；r11 本地产物与旧聊天仅用于追溯，不再参与当前验收。
- Slice A、B、C 分别形成独立可验收节点，不把壳迁移和动画一次性混改。
- 若聊天容器 DOM 在目标运行时不稳定，优先增加宿主适配器，不回退到删除真实消息。
- 若 `refresh:'none' + /trigger` 不稳定，保留正常刷新路径，并让壳控制器在重建后恢复 UI；不得改用未经验证的静默生成伪造正式回复。
- 若动画素材导致角色卡体积不可接受，先减少帧数、方向或使用共享图集，不转为远程依赖。

## 10. 当前非目标

- 玩家像素角色及玩家自由移动。
- 多 NPC 寻路、碰撞和复杂 AI。
- 将庭园做成完整地图编辑器。
- 重写现有战斗引擎。
- 删除真实历史消息。
- 正式发布或覆盖既有检查点产物。
