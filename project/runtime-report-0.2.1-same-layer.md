# 同层常驻候选运行报告（0.2.1-same-layer）

## 候选身份

- 基线：`0.2.0-r11`
- 候选运行时：`0.2.1-same-layer`
- 交接包：`0.2.0-r12`
- 角色卡：`../dist/checkpoint-0.2.0-r12/幻想乡物语-测试检查点-0.2.0-r12.json`
- 角色卡 SHA-256：`918e9263d1391f74b41decdbf0f4821c09d9d01f12cc1350e83f5d28f1a1e952`
- 自包含挂载：`../dist/runtime/ui-mount.js`
- 挂载 SHA-256：`E436E33C9DECDE3EBBDBB323BE1A26255EB6968E12C102BDEFE62FFD5BABDBCF`
- 挂载字节数：`6502028`
- 目标运行环境：SillyTavern `1.18.0 release (8172dcd0e)`、Tavern Helper `4.8.19`

## 已完成实现

- 游戏 iframe 从覆盖页面的 fixed 悬浮框改为 `#chat` 内常驻单壳。
- 游戏模式使用宿主 class 隐藏消息 DOM 与原生输入框，不删除真实消息。
- 原生聊天模式可逆恢复所有消息与输入框，并提供“返回移动庭园”按钮。
- 宿主聊天节点被替换时去除陈旧克隆壳并维持单例。
- 壳内“重新加载”由宿主重建 iframe，不再使用会丢失共享接口的 `location.reload()`。
- 普通互动使用 `is_hidden:false`、`refresh:'none'` 和 `extra.gensokyoTransactionId`。
- 消息事务覆盖 submitting、generating、settling、settled、failed 与失败后继续生成。
- 灵梦使用自包含四向图，提供程序化 idle/walk、巡逻、点击热区、页面隐藏暂停和 reduced-motion 降级。
- 素材失败时继续使用原有圆形角色标记。
- 最新 assistant 没有变量块时，从后向前读取最近一份非空 MVU `stat_data`，避免无状态回复把界面误重置为开场页。
- iframe 已能直接访问 `Mvu` 时跳过重复初始化等待，避免运行帧已经就绪但 `waitGlobalInitialized` 长时间悬挂。
- dry-run 在旧检查点产物存在时只验证输入，不再误触发覆盖拒绝；正式写入仍使用防覆盖检查。

## 支持性检查

- `npm run build:ui`：通过
- `npm run check:ui`：通过
- `npm test`：13/13 通过
- `npm run package:checkpoint:dry`：通过
- 离线桌面视口 `1180x900`：无 console error
- 离线窄视口 `360x740`：无水平溢出，无 console error
- Canvas 两次截图哈希不同：动画循环实际推进
- 模拟宿主：
  - 游戏壳 1 个
  - 消息和 `#send_form` 在游戏模式隐藏
  - 原生模式恢复
  - `#chat` 替换后仍只有 1 个壳
- 模拟消息事务：
  - 创建 1 条 `is_hidden:false` user 消息
  - 写入参数为 `refresh:'none'`
  - 只触发 1 次 `/trigger`
  - assistant 出现后事务为 `settled`
  - 生成期间壳未重建

## r12 正式导入冒烟验收

- 已通过 SillyTavern 导入 r12 JSON、内嵌世界书与三个随卡脚本。
- 已将 `幻想乡物语·移动庭园 0.2.0-r12` 绑定为 r12 的角色主世界书；刷新复读后绑定仍存在。
- 酒馆助手“角色脚本”总开关已启用并持久化。
- 新聊天中 `#gensokyo-game-shell` 为 1 个，父节点为 `#chat`，运行版本为 `0.2.1-same-layer`。
- 开场表单、状态同步与“确认并开始”均可用。
- 游戏/原生聊天/返回游戏三态切换通过，返回后仍只有一个游戏壳。
- r11 角色卡与未引用 r11 世界书已移除；旧聊天保留。
- 酒馆角色库内只剩一个幻想乡交接卡 r12。
- 运行期间没有新增 page error 或 console error。

## 打包前临时真实运行验收

为避免未经授权打包或覆盖角色卡，候选 `ui-mount.js` 被临时加载到现有 r11 的 Tavern Helper UI 脚本帧。测试结束后已销毁候选实例；没有修改角色卡脚本或世界书。

真实 DOM 证据：

- 最终 SHA-256 `E436E33C9DECDE3EBBDBB323BE1A26255EB6968E12C102BDEFE62FFD5BABDBCF` 已在真实运行帧中复核
- `#gensokyo-game-shell`：1 个，直接父节点为 `#chat`
- 壳尺寸：`720 x 768`
- 游戏模式：3 个旧 `.mes` 的 computed `display` 均为 `none`，`#send_form` 为 `none`
- 原生模式：3 个旧 `.mes` 与 `#send_form` 的 computed `display` 均恢复为 `flex`
- 返回游戏后：壳仍为 1 个
- 壳内重载后：壳 1 个、iframe 1 个
- 运行期间没有新增 page error 或 console error
- 最新 assistant 没有 `stat_data`、较早 assistant 仍有完整状态时：
  - 界面保持主庭园而不是回到开场
  - 庭园名正确显示“无名庭园”
  - 状态显示“庭园状态已同步”

真实消息事务证据：

- 测试聊天消息数由 3 增至 5
- 只新增一条 user 和一条 assistant
- user 消息：
  - `is_hidden=false`
  - `extra.gensokyoTransactionKind=interaction`
  - 唯一 `gensokyoTransactionId`
- assistant 正常返回文本
- UI 事务最终显示 `settled`
- 回复后同层壳仍为单例，真实消息楼层继续视觉隐藏

验收消息明确要求不推进时间、资源、关系或事件，因此本轮没有要求 MVU 产生变量更新。测试聊天保留这两条带“同层事务验收”标记的真实消息，便于追溯。

## 尚未关闭

以下行为仍需所有者或后续运行验收关闭：

- 开场资料提交、首轮生成与确定性进入庭院
- 页面刷新后的自动恢复
- 真实 Swipe 与重新生成后的 MVU 对齐
- 聊天切换后候选脚本帧的销毁与重建
- 生成失败、停止后继续生成
- 灵梦在具有 `presence_snapshot` 的真实 MVU 楼层中的动画与点击
- 移动端真实酒馆容器与软键盘

r12 当前是已导入的验收候选；只有所有者完成手动门禁后才能标记为 accepted release。
