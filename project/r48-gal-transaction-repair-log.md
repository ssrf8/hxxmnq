# R48 GAL 楼层事务与时间所有权修复日志

> 日期：2026-07-26  
> 状态：源码修复与离线回归完成，等待真实 SillyTavern 复验

## 1. 真实聊天取证

取证文件：

`F:\agent airp\Luker\data\default-user\chats\幻想乡物语·移动庭园（测试检查点 0.2.0-r48）\幻想乡物语·移动庭园（测试检查点 0.2.0-r48） - 2026-07-26@02h58m23s167ms.jsonl`

关键现象：

- 新用户楼层已发出但尚未收到对应回复时，游戏会显示上一轮 assistant 正文。
- 从原生聊天返回后，GAL 可能没有正文，但历史记录仍能读到旧楼层；重新生成还可能复用错误楼层。
- 验收快进在模型生成或 MVU 结算期间写入的新时间，会被旧事务携带的发送前快照覆盖。
- 开放庭园验收快照仍保留“荒废庭园、主屋损坏、等待验收”等教程叙事线索，模型因而继续开局教程。
- 异变普通聊天提示允许模型顺手推进源头线索，导致自由聊天被误写成固定调查剧情。

## 2. 根因与修复

### 2.1 上一轮回复串入新请求

根因：旧的 `pickLatestAssistant` 在最新用户楼层后没有 assistant 时，会主动回退到更旧的 assistant 楼层。

修复：新增 `src/ui/gal-message-selection.ts`，只允许选择目标用户楼层之后、下一条用户楼层之前的 assistant。等待期间返回 `null`，绝不借用旧回复。

### 2.2 回复完成后仍卡同步、返回后 GAL 空白

根因：`/trigger await=true` 在假流式环境可能早于 assistant 楼层可读时返回；事务因此过早判定失败。与此同时，GAL 场景仅在签名变化时重建，场景为空但签名未变时无法恢复。

修复：

- 事务协调器在 slash 返回后继续轮询当前事务对应的 assistant 楼层。
- 独立监听宿主 `GENERATION_STARTED`、`GENERATION_ENDED`、`GENERATION_STOPPED`。
- 宿主仍在生成时，游戏事务保持生成态；停止与结束事件会同步更新事务。
- GAL 在 `scene` 为空时强制重建；无法解析正文时显示可恢复提示与历史/重新生成入口，不再显示空白文本框。

### 2.3 原生界面仍生成，却能在游戏内结束聊天

根因：游戏只看本地事务阶段，没有独立确认宿主是否仍在生成。

修复：结束聊天同时检查本地事务、宿主生成状态和重新生成状态。任一仍活动时拒绝结束，避免庭院已返回但原生楼层仍在请求。

### 2.4 重新生成污染楼层或状态

根因：重新生成后的状态恢复曾以“最近一条含 MVU 的 assistant”为写入目标；当实际最新 assistant 没有变量块时，可能写到更早楼层。

修复：重新生成目标固定为实际最新 assistant 楼层；受保护状态仍从最近有效 MVU 快照读取。重新生成完成后，在目标楼层恢复代码托管字段并重新同步在场角色。

### 2.5 快进后时间被旧回复拉回

根因：本地结算曾直接使用请求发送时的 `before` 快照恢复代码托管字段。请求期间执行验收快进后，旧快照会覆盖新时间。

修复：

- 生成、结算或重新生成期间禁止验收快进。
- 结算时优先读取目标 assistant 之前最近的持久 MVU 状态作为所有权基线，不再盲用发送时快照。
- 重新生成同样保护本地 M2 字段与时间所有权。

### 2.6 异变聊天复现新手教程

根因：开放阶段验收快照与提示仍含教程残留，加上历史聊天里存在维修主屋情节，模型把当前自由聊天接回教程。

修复：

- 开放庭园快照明确设置庭园开放、主屋启用、灵梦自由来访，并清除“等待验收”动作。
- 每次开放阶段请求都注入硬边界：新手教程已彻底完成，禁止重演主屋维修、基础温室、妖花核心和首次选型。
- 普通异变自由聊天不得生成或猜测源头、位置、原因、解决方案或调查路线；源头细节只允许由专用调查入口产生。

## 3. API 依据

本轮按本地实际安装版本核对：

- SillyTavern：`2.7.0`
- Tavern Helper / JS-Slash-Runner：`4.8.18`
- `getChatMessages(..., { include_swipes: false })`：读取当前 Swipe 的活动正文。
- `MESSAGE_RECEIVED(message_id, type)`、`GENERATION_STARTED(type, options, dry_run)`、`GENERATION_ENDED(message_id)`、`GENERATION_STOPPED()`：用于楼层与生成生命周期同步。
- `/regenerate await=true`：宿主会等待 `Generate('regenerate')`，但游戏仍必须等待 MVU 更新并恢复代码托管字段。

## 4. 修改范围

- `src/ui/app.ts`
- `src/ui/bridge.ts`
- `src/ui/message-transaction.ts`
- `src/ui/gal-message-selection.ts`
- `src/ui/test-tools.ts`
- `src/ui/prompt-context.ts`
- `src/ui/anomaly-rules.ts`
- `project/manifest.json`
- `tests/ui-contract.test.mjs`

## 5. 自动验证

- `npm run check:ui`：通过，0 个 TypeScript 错误。
- `npm test`：86/86 通过，0 失败、0 跳过。
- `npm run build:ui`：通过。
- `npm run package:checkpoint:dry`：通过。
- 定向 `git diff --check`：通过；只有既有的 LF/CRLF 工作区提示，无补丁空白错误。

自动测试覆盖了：假流式提前返回、当前轮回复隔离、原生返回事务恢复、停止事件同步、实际最新楼层重新生成、教程硬截断、异变自由聊天禁止源头发明、验收快进状态完整性。

## 6. 验收边界

离线检查不能代替真实 SillyTavern 的生成事件、假流式、MVU 扩展时序与 iframe 重挂载。真实导入结果仍需按新验收清单执行后确认。

## 7. 交付产物

- 新包：`dist/checkpoint-0.2.0-r48/幻想乡物语-测试检查点-0.2.0-r48.json`
- 大小：38,095,521 bytes
- SHA-256：`ec3a50abe596fb4a91c4b89515b49e130541c5479f9b151d66fef9b0cd5fd464`
- 被替换旧包 SHA-256：`ad72532219c290931ca715dd4009d97a6987549d672586b7599ed31bdf61f821`
- 旧包由打包器归档到同目录 `superseded/`，未静默覆盖。
- 新复验清单：`dist/checkpoint-0.2.0-r48/R48-GAL楼层事务复验清单.md`
