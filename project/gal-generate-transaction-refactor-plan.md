# GAL 发送、监听、停止与重新生成事务重构计划（含可选楼层调试模式）

> 文档状态：待执行（当前仅规划，禁止据此宣称功能已完成）
> 编写日期：2026-08-08
> 最近修订：2026-08-08（补充候选构建探针身份、停止/恢复事务、请求尝试分层与提示词范围冻结）
> 目标运行环境：SillyTavern 1.18.0、Tavern Helper / JS-Slash-Runner 4.8.18（正式目标，2026-08-08 用户裁定；原计划 4.8.19 安装路径本机不可达）、项目锁定版 MagVarUpdate
> 主要参考：本项目现状、`docs/` 中较稳定的发送/监听/重新生成实现、目标运行时已安装 API 源码
> 实施记录：执行者必须创建并持续维护 `project/gal-generate-transaction-implementation-log.md`

---

## 0. 给执行代理的硬性说明

这是一项跨越 UI、消息楼层、模型生成、事件监听、MVU 变量更新和宿主样式的事务重构。不要一次性重写，也不要凭记忆猜 Tavern Helper 或 SillyTavern API。

执行时必须遵守以下顺序：

1. 先读本文、项目合同和指定源码；
2. 创建实施日志并记录基线；
3. 完成实机探针，得到可复查证据；
4. 逐阶段实现，每阶段独立验证；
5. 只有上一阶段通过，才能进入下一阶段；
6. 重新生成若未通过 API/MVU 探针，必须保留现有 `/regenerate await=true` 路径；
7. 不发布、不上传、不写正式 checkpoint，除非用户另行授权。

执行者不得把“编译通过”当作“运行时行为正确”。涉及消息事件、流式输出、swipe 和 MVU 的结论，必须有目标 SillyTavern 实机日志。

---

## 1. 目标与期望结果

### 1.1 总目标

参考 `docs/` 中更稳定的设计，将 GAL 界面的三条链路收敛为可追踪、可取消、可恢复的事务：

1. 玩家发送请求；
2. 发送后的流式监听与最终回复落楼层；
3. 对最新助手回复重新生成；
4. 对当前受管生成执行停止、继续或从头重试，并正确处理迟到结果。

作为非阻塞的可选诊断增强，可同时完善楼层显示策略：

- 默认游戏模式：GAL 外壳可见，所有真实消息楼层视觉隐藏，原生输入框隐藏；
- 调试楼层模式：GAL 外壳仍可见，所有真实消息楼层可见，原生输入框仍隐藏；
- 原生恢复模式：GAL 外壳隐藏，真实楼层和原生输入框可见，可返回游戏界面。

### 1.2 成功标准

完成后应满足：

- 每个逻辑玩家请求都有唯一 `requestId`，每次模型调用都有唯一 `attemptId` 与 `generationId`；
- 一个逻辑玩家请求可包含多个生成尝试：`requestId` 绑定玩家楼层，每次模型调用使用新的 `attemptId` 与 `generationId`；
- `generate()` 返回的 Promise 是生成结果权威来源；
- 流式事件只负责进度展示，并按 `generationId` 严格过滤；
- 玩家消息和助手消息各只持久化一次，不产生空助手楼层；
- 助手楼层持久化后，MagVarUpdate 最多触发一次并能被精确等待；
- 失败、停止、切换聊天、迟到事件都不会误提交到错误楼层；
- 重新生成保留原助手楼层并生成新 swipe，不复制玩家楼层；
- 重新生成使用原请求的基线状态，不能让旧回复产生的变量污染新请求；
- 停止只作用于当前 `generationId`；停止后的“继续生成”“从头重试”“重新生成”具有不同且可验证的语义；
- iframe/游戏壳重载后必须从真实聊天与 metadata 恢复为可解释状态，不能因内存 busy 丢失而盲目重发；
- 默认视觉隐藏不修改消息的 `is_hidden`，不影响真实聊天记录和 MVU；
- 调试模式可在设置中切换，并提供足够的事务日志用于验收复现；
- 保留明确的回滚开关，出现实机不兼容时能恢复现有稳定路径。

### 1.3 本轮非目标

本计划不授权以下工作：

- 重写整个 GAL UI；
- 修改世界书玩法、剧情协议或角色设定；
- 更换 SillyTavern、Tavern Helper、MagVarUpdate 版本；
- 改造 MagVarUpdate 插件内部实现；
- 删除真实消息楼层或将其改为 `is_hidden=true`；
- 改变正式打包、发布、R2 上传流程；
- 清理工作区中与本任务无关的现有修改。
- 把庭园协议、场景事实、角色/道具授权从当前 user 消息迁移到 `injects`、世界书或其他楼层注入位置；该提示词注入改造另立计划，本轮只预留边界并保持现有 prompt 语义。

---

## 2. 权威来源与阅读顺序

执行者开始改代码前，必须按顺序阅读并把实际文件路径、版本、关键函数记入实施日志：

1. `AGENTS.md`（若项目内存在，以离目标文件最近者为准）；
2. `project/contract.md`；
3. `project/gal-interaction-plan.md`；
4. `project/r48-gal-transaction-repair-log.md`；
5. `project/streaming-floor-projection.md`；
6. `project/api-provenance.md`；
7. `docs/` 中与发送、监听、重新生成、隐藏楼层直接相关的实现；
8. 当前项目对应实现；
9. 目标环境已安装的 Tavern Helper 类型声明与源码；
10. 项目锁定的 MagVarUpdate 加载器及其实际事件处理代码。

### 2.1 什么是本计划中的“探针”

探针不是“拿一个旧打包卡跑一遍看看还能不能用”，而是针对一个尚未确认的运行时能力做最小、可回滚、带身份校验的实验。探针必须同时回答：

1. 本轮候选代码是否真的运行在目标脚本 iframe/游戏 iframe 上下文；
2. 目标安装的准确版本、符号、事件载荷与时序是什么；
3. 该能力是否足以支持下一阶段，而不是旧 transport 是否仍能工作；
4. 实验是否只发生在可回滚测试聊天，没有借用旧包、旧 R2 UI 或正式剧情聊天替新实现背书。

#### 探针候选构建身份门禁

Probe A/B/C 开始前，执行者必须创建只包含探针与诊断代码的本轮候选构建，并在实施日志记录：

- 源码工作区绝对路径、Git `HEAD`、工作区 dirty 状态与本任务 diff 摘要；
- 候选 bundle 文件名、绝对路径、SHA-256、内部版本标记；
- 实际加载 URL/本地开发入口及其响应内容 SHA-256；
- 浏览器运行时读回的 bundle 版本、bridge 版本和随机 `probeSessionId`；
- 目标 SillyTavern、Tavern Helper、MagVarUpdate 的运行时读回版本；
- 测试角色、测试聊天 ID、开始前楼层数与结束后楼层数。

以下任一情况都使探针结果自动无效，不得记为 PASS：

- 运行的是旧 checkpoint、旧角色卡包、旧 dist 文件或旧 R2 `ui-manifest.json` 指向的 bundle；
- 只看到了源码已修改，却没有从运行中页面读回候选 bundle 身份；
- 只在浏览器控制台或主窗口调用成功，没有证明目标脚本 iframe/游戏 iframe 中可用；
- 测试聊天或运行版本无法确定；
- trace 中没有本轮唯一 `probeSessionId`；
- 候选 bundle hash 与实际加载响应 hash 不一致。

旧包只允许作为“改动前基线”记录，结论名称必须写成 `BASELINE_ONLY`；它不能为 Probe A/B/C、send transport、stop、regenerate 或 MVU 新路径提供 PASS 证据。

本项目正式 UI 采用远程交付。执行者必须先明确一个不覆盖正式 R2 指针的开发态加载方式，例如项目既有本地预览/临时开发 URL或仅当前会话生效的候选 loader。若无法让目标运行时加载本轮候选 bundle，立即停止并报告；不得为了做探针自行上传 R2、覆盖 live manifest、打正式 checkpoint 或复用旧包假装完成。

探针应使用新建的可丢弃测试聊天。不得在用户正式剧情聊天中插入 Probe B/C 的测试楼层；不得自动批量删除用户数据。测试完成后记录人工清理方式和遗留物。

### 2.2 当前已知 API 基线

以下信息是计划制定时的已知基线，执行者仍须在目标安装中复核，不能只引用本文：

| 能力 | 已知合同 | 计划中的用途 |
|---|---|---|
| `generate(config)` | 返回 `Promise<string | GenerateToolCallResult>` | 受管生成最终结果 |
| `generation_id` | 调用方可指定 | 将事件归属到唯一请求 |
| `iframe_events.GENERATION_STARTED` | 事件包含 `generation_id` | 记录生成开始 |
| `STREAM_TOKEN_RECEIVED_FULLY` | 完整文本 + `generation_id` | 刷新 GAL 流式预览 |
| `STREAM_TOKEN_RECEIVED_INCREMENTALLY` | 增量文本 + `generation_id` | 可选增量统计，不作为最终权威 |
| `GENERATION_ENDED` | 文本 + `generation_id` | 记录结束；最终仍以 Promise 为准 |
| `stopGenerationById(id)` | 按 ID 停止 | 取消当前事务 |
| `createChatMessages` | `refresh:'affected'` 时会触发相应消息事件 | 持久化正式玩家/助手楼层 |
| `setChatMessages` | 可更新 swipe 数组，但不会自动等价于消息接收/切换事件 | 重新生成候选实现，必须实机探针 |

Tavern Helper 4.8.19 的历史安装位置示例：

`D:/json脚本地下城/主体/SillyTavern/public/scripts/extensions/third-party/JS-Slash-Runner/`

该路径在计划修订时的当前工作机上未找到；当前可静态读取的是 `F:/agent airp/Luker`，其 Helper manifest 为 4.8.18。两套运行时证据不得混用。Phase 0 必须先决定唯一正式目标或明确双运行时支持矩阵；目标安装不可访问时，不得用邻近版本替代实机 PASS。

> 裁定记录（2026-08-08，用户授权）：正式目标定为 SillyTavern 1.18.0 + Tavern Helper / JS-Slash-Runner 4.8.18，运行实例 `F:/agent airp/SillyTavern`（http://127.0.0.1:8000/，PID 7036）。证据：`package.json` 读回 `sillytavern@1.18.0`；JS-Slash-Runner `manifest.json` 与 `dist/index.js` 内部标记均为 `4.8.18`；运行页面加载的扩展脚本 URL 与该目录一致，全局 `TavernHelper` 暴露 `createChatMessages/setChatMessages/getChatMessages/iframe_events/tavern_events`。原计划 4.8.19 安装路径 `D:/json脚本地下城/主体/SillyTavern` 经 node `fs.existsSync` 确认不存在。所有实机结论只对 1.18.0+4.8.18 有效，4.8.19 不得以任何方式替代背书。

复核时至少查看：

- `manifest.json`；
- `generate.d.ts` 或当前版本等价声明；
- `src/function/chat_message.ts`；
- 事件常量与 `generate()` 实现；
- `stopGenerationById()` 实现。

### 2.3 重要结论

- 不得假设 `generate()` 自动创建普通聊天楼层；计划按“只返回文本”设计。
- 不得假设 `generate()` 自动触发 MagVarUpdate。
- 不得手工伪造/广播 SillyTavern 原生消息事件来欺骗 MVU。
- `docs/` 是行为参考，不是版本权威；签名和事件载荷以目标环境源码及实机结果为准。
- 类型声明、源码和实机行为不一致时：先停工记录，再由验收者决定兼容策略。
- 静态声明只能证明符号形状；只有加载了本轮候选 bundle 的目标运行时 trace 才能证明调用上下文、事件时序、消息写入和 MVU 行为。

---

## 3. 当前链路基线（改动前必须再次核对）

### 3.1 玩家发送

预期现状：

`src/ui/app.ts` 的 `submitGalMessage`
→ `bridge.sendUserMessage`
→ `MessageTransactionCoordinator`
→ `createChatMessages(..., refresh:'none')` 创建真实玩家楼层
→ 固定等待 450 ms
→ `/trigger await=true`
→ 轮询非空助手楼层
→ 等待宿主生成结束
→ 等待 MVU
→ 本地状态结算。

基线风险：

- 生成由 slash command、宿主状态、楼层轮询共同决定，权威来源不唯一；
- 固定等待和空楼层轮询存在竞态；
- 当前用户输入可能同时进入历史和本次输入，需验证是否重复；
- 外部事件容易被当前事务误认领；
- 取消、迟到事件、切聊天后的提交边界不够清晰。

### 3.2 回复监听

预期现状同时依赖：

- Tavern/SillyTavern 消息事件；
- DOM MutationObserver；
- 定时器或轮询；
- 宿主 generation 状态；
- 事务协调器轮询。

这些机制不能立刻全部删除。迁移时先增加新的 `generationId` 定向监听，等实机证明覆盖所有受管路径后，再移除受管生成中的冗余判断。外部原生操作仍需要较轻的同步监听。

### 3.3 重新生成

预期现状：

`/regenerate await=true`
→ 定位最近助手楼层
→ 等待生成与 MVU
→ 恢复/结算本地状态。

迁移风险最高，因为重新生成必须同时正确处理：

- 原玩家请求；
- 原助手楼层；
- `swipes`、`swipes_data`、`swipes_info`、`swipe_id`；
- 原请求前的变量基线；
- 新回复触发的 MVU；
- 当前聊天是否被用户切走。

### 3.4 楼层隐藏

预期现状位于 `src/runtime/ui-host-shell.js`：

- 游戏激活类下隐藏 `#chat > .mes` 和 `#show_more_messages`；
- 游戏激活时隐藏 `#send_form`；
- `nativeMode` 控制 GAL 外壳与原生聊天恢复；
- 设置中已有“显示原生聊天”类入口。

本次只将“楼层可见性”和“原生恢复”拆成两个正交状态，不改变真实楼层数据。

---

## 4. 不可破坏的行为合同

### 4.1 消息与状态合同

1. 玩家提交后先持久化真实玩家楼层，再开始模型生成。
2. 模型最终文本验证通过后，才持久化正式助手楼层。
3. 每个 request 最多创建一个玩家楼层和一个正式助手楼层。
4. 生成失败或取消不得创建空助手楼层。
5. 正式助手楼层必须仍能触发项目锁定版 MagVarUpdate。
6. 变量更新必须归属到本次助手楼层，不能拿其他楼层的事件结算。
7. `stat_data` 的所有权、桥接与同楼层恢复规则保持现有项目合同。
8. 本地 GAL 投影失败不能篡改真实聊天记录。
9. 切换聊天后，旧请求不得向新聊天写楼层、swipe 或状态。
10. 重试必须复用已持久化玩家楼层，不得重复提交玩家文本。

### 4.2 展示合同

1. 默认隐藏是 CSS/宿主 UI 层面的视觉隐藏。
2. 不修改消息 `is_hidden` 字段。
3. 不克隆消息、不删除消息、不移动消息顺序。
4. 调试楼层模式只显示真实楼层，不开放原生输入框。
5. 只有原生恢复模式可显示原生输入框。
6. GAL 外壳启动失败时仍须能恢复原生聊天。
7. 调试模式要有醒目标识，避免用户误以为 GAL 失效。

### 4.3 生成合同

1. Promise 返回值是最终文本权威来源。
2. stream 事件只更新临时预览，不直接落正式楼层。
3. 所有流事件必须核对 `generationId`。
4. 同一事务只允许一个未结束的模型请求。
5. 工具调用型返回值若项目未设计处理器，必须作为不支持的结果失败，不得转成 `[object Object]`。
6. 旧事务的迟到 Promise、事件或计时器必须被忽略并记录。
7. stop 操作只停止当前 `generationId`，不能无条件停止宿主其他生成。

---

## 5. 目标架构

### 5.1 职责边界

建议保留现有 bridge，对内部职责做渐进式拆分，不进行大爆炸式重写：

| 层 | 职责 | 禁止承担 |
|---|---|---|
| GAL UI | 收集输入、展示 pending/stream/error、触发 retry/stop/regenerate | 直接操作消息数组、直接监听所有宿主事件 |
| Request Builder | 纯函数构造请求、历史、注入和基线指纹 | 调模型、写楼层、读写 DOM |
| Generation Coordinator | 管理事务状态机、取消、幂等、落楼层、等待 MVU | 渲染页面、猜测 API |
| Runtime Bridge | 封装确切 Tavern Helper/SillyTavern 调用和事件订阅 | 保存 UI 业务状态、静默吞错 |
| Host Shell | GAL iframe/外壳、三种显示模式、恢复入口 | 改消息 `is_hidden`、触发模型 |
| Diagnostics | 结构化时间线、导出验收信息 | 默认保存完整 prompt、密钥或大段隐私内容 |

### 5.2 推荐的数据结构

名称可按项目风格微调，但字段语义不得丢失：

```ts
type GenerationMode = 'send' | 'regenerate';

interface GalGenerationRequest {
  schema: 'gal-generation-request.v1';
  requestId: string;              // 逻辑玩家请求；绑定且只绑定一个真实 player 楼层
  chatId: string;
  ownerCharacterId: string;
  playerMessageId?: number;        // 写入后按 metadata 精确反查并回填
  promptRevision: string;
  sceneId: string | null;
  stateMessageIdBeforeGeneration: number | null;
  stateSwipeIdBeforeGeneration: number | null;
  contextFingerprint: string;
  visibleUserText: string;         // 玩家看到的原文
  modelUserInput: string;          // 本轮保持现有拼接语义；后续注入重构再迁移
  createdAt: string;
}

interface GalGenerationAttempt {
  schema: 'gal-generation-attempt.v1';
  requestId: string;
  attemptId: string;              // 每次模型调用都新建
  generationId: string;           // 每次 generate 都新建，不复用已停止/失败 ID
  mode: GenerationMode;
  chatId: string;
  ownerCharacterId: string;
  assistantMessageId?: number;
  baseSwipeId?: number;
  commitKey: string;              // `${requestId}:${attemptId}`
  createdAt: string;
}
```

持久化到玩家楼层的 metadata 只保存稳定的 request 恢复信息；每次成功 assistant 楼层或 swipe 保存对应的 request/attempt/generation/commit 标识。禁止复制完整 `stat_data`、完整 prompt 或大段历史。实际字段须先检查 SillyTavern 当前消息 extra 的既有命名，避免覆盖插件字段。

`createChatMessages()` 不返回新楼层 ID。不得用“写完后的最后一楼”作为身份依据。玩家或助手写入后必须在同一 chat identity 下重新读取，并按 `requestId + attemptId（助手）+ role` 精确反查；找到 0 条或多条都进入失败/未知状态，不能猜 ID。

```ts
type GenerationPhase =
  | 'idle'
  | 'persisting_user'
  | 'generating'
  | 'generated'
  | 'persisting_assistant'
  | 'awaiting_mvu'
  | 'settling'
  | 'settled'
  | 'stopping'
  | 'stopped'
  | 'failed';
```

允许的主路径：

```text
idle
→ persisting_user
→ generating
→ generated
→ persisting_assistant
→ awaiting_mvu
→ settling
→ settled
```

失败/取消必须按各阶段允许的转移进入 `failed`、`stopped` 或“回复已保存、结算待恢复”，不能回跳并重复提交。`generated` 之后是否允许 stop 必须由独立停止合同决定，不能一律删除已生成结果。

### 5.3 请求构造原则

- 统一由一个纯函数构建 send/regenerate 请求；纯函数只能接收调用方传入的历史/状态快照，不能自行读取宿主全局；
- 本轮冻结提示词行为：`modelUserInput` 保持当前 `withGardenNarrativeContract` 的语义和顺序；不得在本计划内把庭园协议迁移到 `injects`/世界书；
- 传给 `generate.user_input` 的 `modelUserInput` 在历史中排除刚创建的当前玩家楼层，避免同一内容进入两次；玩家可见原文与模型输入必须分别命名、分别测试；
- 历史使用当时有效的 active message/swipe；
- 控制指令、协议约束和玩家可见文本分开构造；
- 记录 `promptRevision`，模板调整后可识别旧事务；
- 记录请求前最后状态楼层 ID 与上下文指纹；
- regenerate 从原请求 metadata 恢复请求前基线，而不是读取旧回复执行后的当前状态；
- 纯函数测试必须证明同一输入稳定得到同一指纹。

### 5.4 幂等键

至少使用以下三层防重：

1. UI 层：同一界面只允许一个 active request；
2. Coordinator 层：玩家提交按 `requestId` 幂等，助手提交按 `commitKey=requestId:attemptId` 幂等；
3. 消息层：玩家落楼前按 `requestId + role=user` 检查，助手落楼前按 `commitKey + role=assistant` 检查。

retry 复用 requestId 和玩家楼层，但必须创建新的 attemptId/generationId。不得因为 requestId 已存在而拒绝合法重试，也不得因换了 generationId 而重复创建玩家楼层。

不要只依赖按钮 disabled，因为热重载、iframe 重建和重试会绕过它。

---

## 6. 强制实施日志与运行时诊断

### 6.1 实施日志文件

执行者第一项写操作必须创建：

`project/gal-generate-transaction-implementation-log.md`

每完成一个小步骤就追加记录，禁止最后一次性补写。日志至少包含：

```md
## [日期时间] Phase X / Step X.Y

- 目标：
- 改动文件：
- 改动摘要：
- 依据的 API/源码位置与版本：
- 执行命令：
- 自动化结果：通过/失败（附关键输出）
- 实机步骤：
- requestId / generationId：
- 观察到的事件顺序：
- 预期与实际差异：
- 截图或导出日志路径：
- 回滚方式：
- 未解决问题：
- 下一步是否满足准入条件：是/否
```

如果发生失败，必须写出最短复现步骤，不得只写“有 bug”“偶现”。

### 6.2 应用内结构化事务日志

实现一个轻量环形缓冲区，默认建议保留最近 200～500 条事件、最近 10 个请求。每条至少包含：

```ts
interface GenerationTraceEntry {
  schema: 'gal-generation-trace.v1';
  at: string;
  elapsedMs: number;
  sessionId: string;
  requestId: string;
  attemptId?: string;              // request.created 时尚未产生 attempt
  generationId?: string;
  commitKey?: string;
  mode: 'send' | 'regenerate';
  phase: GenerationPhase;
  event: string;
  chatIdHash: string;
  playerMessageId?: number;
  assistantMessageId?: number;
  swipeId?: number;
  source?: 'ui' | 'coordinator' | 'helper' | 'tavern' | 'mvu' | 'host';
  textLength?: number;
  textHash?: string;
  contextFingerprint?: string;
  mvuEpochBefore?: number;
  mvuEpochAfter?: number;
  outcome?: 'ok' | 'ignored' | 'stopped' | 'failed';
  errorCode?: string;
  detail?: Record<string, unknown>;
}
```

必须记录的关键事件：

- `request.created`；
- `user.persist.begin/success/failure`；
- `generation.call`；
- `generation.started`；
- `generation.stream`（需节流，不能每 token 爆日志）；
- `generation.promise.resolved/rejected`；
- `generation.event.ended`；
- `generation.late_event_ignored`；
- `assistant.persist.begin/success/failure/duplicate_skipped`；
- `mvu.wait.begin/event/fallback/success/timeout`；
- `settlement.begin/success/failure`；
- `stop.requested/success/failure`；
- `chat.changed.abort`；
- `regenerate.swipe.begin/success/failure`；
- `display.mode.changed`。

### 6.3 隐私与可复现平衡

默认日志不得包含：

- API key、Cookie、Authorization；
- 完整 system prompt、preset 内容、世界书全文；
- 完整 `stat_data`；
- 完整聊天历史；
- 未脱敏的远端请求头。

默认只记录文本长度、会话内加盐 hash 和协议解析结果，不保存正文片段。最多 120 字符的脱敏片段只能属于“详细诊断”开关。若增加该开关，它必须：

- 默认关闭；
- 只在当前会话生效；
- UI 明示可能包含对话片段；
- 不自动写入仓库；
- 导出前允许用户检查。

### 6.4 调试导出

设置页调试区建议提供：

- “显示真实楼层”开关；
- “复制最近事务诊断”按钮；
- “复制当前 requestId”按钮；
- 当前 generation transport、regeneration transport；
- 最近请求 phase、玩家/助手楼层 ID、swipe ID、MVU 等待结果；
- 可选“清空本会话诊断”按钮。

诊断导出至少能让验收者按 `requestId` 重建：点击 → 玩家落楼层 → generate → stream → Promise → 助手落楼层 → MVU → settle 的完整顺序。

---

## 7. 分阶段执行计划

每个 Phase 开始前，执行者必须在实施日志写一份 scope lock：允许修改文件、禁止修改文件/生成物、预期行为、前置基线、定向测试、目标不超过 200 行的阶段预算、停止与回滚条件。超过预算或需要碰未列文件时先停止并重新门禁，不得顺手扩建。任何 Phase 都不得修改 `dist/`、正式 checkpoint、R2 live manifest、锁定依赖版本或用户聊天数据，除非用户另行明确授权。

## Phase 0：基线冻结与实机能力探针

### 0.1 创建实施日志并记录工作区

操作：

1. 创建实施日志；
2. 记录 `git status --short`，明确哪些是用户已有改动；
3. 记录 Node/npm 版本、目标 SillyTavern/Helper/MVU 版本；
4. 记录现有 build/test 命令；
5. 明确正式支持矩阵：只支持 1.18.0/4.8.19，还是还要保留 Luker 2.7.0/4.8.18 假流式兼容；
6. 检查目标安装路径真实存在并可读取；不存在时记录 BLOCKED，不用相邻安装替代；
7. 不清理、不回滚、不覆盖无关修改。

通过条件：实施日志能区分“任务前已有修改”和“本任务新增修改”。

### 0.2 建立现状调用图

用 `rg` 查清并记录以下定义和调用方：

- `submitGalMessage`；
- `sendUserMessage`；
- `MessageTransactionCoordinator`；
- `/trigger`；
- `/regenerate`；
- `createChatMessages`；
- `setChatMessages`；
- 生成开始/结束/流式事件；
- `VARIABLE_UPDATE_ENDED` 或项目等价事件；
- `nativeMode`、宿主激活 class、楼层隐藏 CSS；
- 设置页“显示原生聊天”入口。

产物：在实施日志中给出一张“文件 → 函数 → 责任”表。

### 0.3 建立候选探针构建并证明实际加载身份

1. 只加入探针、版本标记和结构化 trace，不先实现正式 transport；
2. 使用不会覆盖正式 R2/live manifest 的开发态入口加载候选 bundle；
3. 在运行页面读回 `probeSessionId`、bundle/bridge 版本和响应 SHA-256；
4. 截取网络请求或运行日志，证明实际脚本 URL 与候选 hash 一致；
5. 新建可丢弃测试聊天，并记录开始前楼层数；
6. 若页面仍加载旧 checkpoint、旧 dist 或旧 R2 bundle，本步骤 FAIL，后续 Probe A/B/C 禁止开始。

该步骤只证明“本轮候选代码确实在目标上下文运行”，不证明任何业务能力。旧打包卡可以另跑基线，但日志必须标记 `BASELINE_ONLY` 并与候选探针分开。

### 0.4 Probe A：直接 generate 与 ID 过滤

在最小诊断入口中验证：

1. GAL iframe 能调用 `generate()`；
2. 自己指定的 `generationId` 原样出现在开始、流式、结束事件；
3. Promise 返回最终文本；
4. `stopGenerationById(generationId)` 只停止该请求；
5. generate 不会自动创建正式消息楼层；
6. 其他 generationId 的事件能被过滤并记为 ignored；
7. stream fully 文本与 Promise 文本的关系被记录，但只认 Promise 为最终值。

至少运行：正常非流式、正常流式、中途 stop 各一次。

门禁：任何签名或载荷不符，禁止进入正式 send transport 迁移；先更新 API 证据与计划。Phase 1 仅可继续做不依赖该能力的 metadata/纯函数工作。

### 0.5 Probe B：助手楼层与 MVU

在可回滚测试聊天中验证：

1. 使用项目拟采用的 assistant `createChatMessages` 参数；
2. 明确 `refresh:'affected'` 是否触发一次 `MESSAGE_RECEIVED`；
3. 明确 MagVarUpdate 是否被触发一次；
4. 记录变量更新开始、结束、目标消息 ID、epoch 变化；
5. 验证没有第二次变量模型调用；
6. 验证同楼层状态所有权恢复逻辑仍成立。

门禁：若手工持久化助手楼层不能可靠触发 MVU，不得迁移正式 send；必须保留 `/trigger`，并将失败证据交给验收者。

### 0.6 Probe C：swipe 更新与 MVU

在测试聊天中验证：

1. 读取一个具有 assistant 回复的楼层；
2. 使用公开 API 增加新 swipe，并正确更新四组字段；
3. 确认当前 swipe 切换是否刷新 UI；
4. 确认是否产生 MagVarUpdate 所需事件；
5. 确认变量更新作用于新的 active swipe；
6. 页面刷新后 swipe 和数据仍一致。

门禁：若没有受支持且可验证的 MVU 触发路径，重新生成继续使用 `/regenerate await=true`。禁止手工 emit 原生事件。

### Phase 0 验收

- 候选构建身份门禁和三份探针时间线都写入实施日志；
- 每份 trace 都包含同一个本轮 `probeSessionId`、实际 bundle URL/版本/SHA-256；
- 每份都有版本、步骤、request/generation ID、实际事件顺序和结论；
- 结论只能是 `PASS`、`PASS_WITH_FALLBACK`、`BLOCKED` 或 `BASELINE_ONLY`，不能写“看起来可以”；
- Probe A/B 只控制 send 迁移，Probe C 只控制 regenerate 迁移；某一能力 FAIL 不得伪装成另一阶段的全局 PASS；
- 没有对正式剧情聊天留下测试垃圾；若使用临时测试聊天，记录清理方式，但不要自动批量删除用户数据。

---

## Phase 1：统一请求构造，不改变生成 transport

目标：先统一 request/attempt 身份、metadata 与可测试的输入边界，保持现有 `/trigger`、`/regenerate` 和当前 `withGardenNarrativeContract` prompt 行为，降低一次改动范围。本阶段不得迁移提示词注入位置。

### 1.1 提取纯请求构造器

建议新增独立模块，例如：

`src/ui/gal-generation-request.ts`

它应只负责：

- 规范化玩家输入；
- 只接收调用方传入的历史/状态快照，不自行读取宿主；
- 排除本次刚创建的玩家楼层；
- 构造本轮现状等价的 `modelUserInput` 与历史边界；只预留 overrides/injects 接口，不迁移现有提示词内容；
- 生成 `promptRevision` 和 `contextFingerprint`；
- 创建稳定 request，并为每次调用创建独立 attempt；
- 从玩家楼层 metadata 恢复 regenerate request。

禁止该模块调用 generate、写聊天、等待事件或操作 DOM。

### 1.2 写入小型 request metadata

玩家楼层持久化时，在不覆盖已有 extra 的前提下合并 `gal-generation-request.v1` 元数据。至少保存：

- `requestId`；
- `ownerCharacterId` 与 `chatId`；
- `promptRevision`；
- `sceneId`；
- `stateMessageIdBeforeGeneration`；
- `stateSwipeIdBeforeGeneration`；
- `contextFingerprint`；
- 可恢复的 `visibleUserText` 和当前现状等价的 `modelUserInput`；若后者过大，不复制到 extra，而是从该玩家楼层正文恢复并记录 hash；
- 创建时间。

不保存完整历史和完整状态树。

### 1.3 对比测试

选取至少以下请求类型，对旧构造结果和新构造结果做结构化对比：

- 普通自由对话；
- 场景入口；
- 场景物品互动；
- 固定事件；
- 战斗/特殊协议入口（若走同一 GAL 提交链）；
- 带前序 swipe 的聊天；
- 输入包含换行、引号、斜杠命令样字符。

Phase 1 不改变 transport 或提示词注入位置，因此除 request/attempt/metadata 与诊断字段外，模型可见的 prompt 结构、`modelUserInput`、历史集合与顺序必须与旧路径等价。允许的差异必须逐项在日志中解释。特别检查当前玩家输入不能同时存在于历史末尾和 `user_input`。

### 1.4 自动化要求

至少新增：

- 纯函数快照/结构测试；
- 当前玩家输入不重复测试；
- metadata round-trip 测试；
- requestId 稳定而 retry 的 attemptId/generationId 必须变化测试；
- 玩家/助手 metadata 精确反查与 0 条/多条歧义失败测试；
- 缺少旧 metadata 时的兼容测试；
- context fingerprint 稳定性测试；
- 空白输入拒绝测试。

门禁：请求构造对比未通过，不进入 transport 迁移。

---

## Phase 2：普通发送迁移到受管 generate

仅当候选构建身份门禁、Probe A、Probe B 均为本轮候选代码的 PASS 执行。旧包的 `BASELINE_ONLY` 或相邻版本结果不满足准入。

### 2.1 引入事务协调器状态机

优先渐进改造现有 `MessageTransactionCoordinator`；只有职责无法安全容纳时，才新增 `gal-generation-coordinator.ts`。不要同时保留两个都能提交楼层的协调器。

协调器必须拥有：

- 当前 active transaction；
- phase；
- request/attempt/generation/commit ID；
- 初始 chat identity（至少是 `ownerCharacterId + chatId + 本次会话 epoch`）；
- Abort/stop 标记；
- 已提交玩家/助手楼层 ID；
- MVU baseline epoch；
- stream 订阅清理函数；
- 幂等 commit 标记；
- 结构化 trace。

### 2.2 明确发送顺序

严格按以下顺序实现：

1. UI 校验输入与 busy 状态；
2. 生成 `requestId`；
3. 捕获 `ownerCharacterId + chatId + session epoch`、请求前状态楼层/swipe 与 MVU epoch；
4. 构造请求快照；
5. 创建真实玩家楼层并写 request metadata；
6. 按 `requestId + role=user` 精确反查实际玩家楼层 ID，确认只有一条且仍在同一 chat；
7. 为本次模型调用生成新的 `attemptId`、`generationId` 和 `commitKey`；
8. 注册仅匹配该 ID 的 stream/start/end 监听；
9. 调用 `generate(config)`；
10. stream 仅投影到 pending GAL 气泡；
11. Promise resolve 后校验类型、非空和聊天身份；
12. 清洗/解析输出，保留现有协议容错行为；
13. 携带 `requestId/attemptId/generationId/commitKey` 幂等创建正式助手楼层；
14. 按 `commitKey + role=assistant` 精确反查实际助手楼层 ID；找到 0 条或多条都停止；
15. 等待该楼层触发的 MVU；
16. 执行同楼层所有权恢复和本地 settlement；
17. phase 进入 `settled`；
18. 清理监听、计时器和 pending UI。

### 2.3 事件与 Promise 竞态处理

- `GENERATION_ENDED` 可先于/后于 Promise；两者都记录；
- 只有 Promise resolve 能进入 assistant persist；
- 重复 ended 事件只记录一次有效、其余 ignored；
- stop 后 Promise 若仍 resolve，必须记录 late result 并忽略；
- chat identity 改变后任何结果都不得主动落楼层；每次写调用前后都复核 identity；
- `createChatMessages/setChatMessages` 若不能绑定指定 chat，必须增加“API 调用期间切聊天”的实机探针；若无法证明不会写错聊天，则停止对应迁移，不能用写后检查冒充预防；
- stream fully 可能重复，UI 更新需节流且可覆盖；
- listener 必须在 finally 清理，不依赖正常结束。

### 2.4 输出校验

至少处理：

- 空字符串；
- 只有空白；
- 普通字符串；
- 项目花园协议完整结果；
- 协议不完整但包含可显示文本；
- 不支持的 tool-call 结果；
- provider rejection；
- 用户 stop；
- 超时；
- 结果到达时 chat 已切换。

保持现有 GAL 协议的容错展示，不得因为协议解析失败而丢失已经生成的可恢复文本；但“是否落正式楼层”必须有明确测试和日志，不允许静默决定。

### 2.5 MVU 精确等待

沿用并收敛当前已验证策略：

- 记录请求前 `mvuEpochBefore`；
- 助手落楼层后监听变量分析状态与 `VARIABLE_UPDATE_ENDED`；
- 优先绑定实际助手楼层 ID；
- 允许现有约 2.5 秒分析启动兼容窗口，但把原因写进注释；
- 总等待上限沿用现有约 90 秒合同，除非项目合同另有规定；
- 收到其他楼层/旧 epoch 事件只记录 ignored；
- timeout 后不得再次生成文本，只进入明确的“回复已保存、变量结算未完成”恢复状态。

### 2.6 失败恢复

| 失败点 | 正确行为 |
|---|---|
| 玩家楼层创建失败 | 不调用模型，恢复可编辑输入 |
| generate 调用失败 | 保留玩家楼层，显示“重试本次请求”，不重复玩家楼层 |
| 用户 stop | 保留玩家楼层，不创建空助手楼层；由独立停止阶段决定继续/从头重试 |
| assistant 创建失败 | 保存内存中的生成结果用于显式重试落楼层，禁止自动再调模型 |
| MVU timeout | 助手楼层保留，提供重新同步/恢复，不再次调模型 |
| settlement 失败 | 真实楼层保留，可仅重跑 settlement |
| chat 切换 | 中止提交，旧结果标记 ignored |

若 assistant 创建失败后 iframe 又重载，内存结果可能丢失。新实例只能显示“已生成但未确认落盘/状态未知”，不得自动再次调用主模型；详细文本若要跨重载保存必须另行设计隐私明确的会话级恢复缓存，本轮不得偷偷写完整回复到消息 metadata 或日志。

### 2.7 兼容开关

迁移期提供可诊断的 transport 选择：

```ts
generationTransport: 'native-trigger' | 'helper-generate'
```

要求：

- 默认值只有在实机验收通过后才切到 `helper-generate`；
- 设置/日志能看见当前 transport；
- 回滚只切 transport，不回滚消息 schema；
- 旧路径在最终稳定验收前不删除；
- 旧路径也必须遵守防重复和 trace 基本合同。

### Phase 2 自动化

使用 fake bridge/host 至少覆盖：

- 正常非流式；
- 正常流式；
- 非本 generationId 事件；
- ended 与 Promise 顺序互换；
- 双击提交；
- stop 后迟到 resolve；
- provider reject；
- 空结果；
- tool-call 结果；
- 玩家楼层成功、模型失败后的 retry；
- 助手楼层幂等提交；
- MVU 其他楼层事件；
- MVU timeout；
- settlement 失败后只重跑 settlement；
- 中途切聊天；
- iframe/unmount 时 listener 清理。

---

## Phase 3：停止、取消与恢复事务

仅在 Phase 2 的候选 `helper-generate` send 能稳定启动后执行。停止不是一个按钮回调，而是独立事务边界。

### 3.1 停止行为合同

- `generating` 阶段点击停止：进入 `stopping`，只调用 `stopGenerationById(currentGenerationId)`；
- `stopGenerationById` 返回 true 只表示已请求中断，最终仍要等待 Promise reject/结束事件或有界超时完成对账；
- 返回 false 时不得直接标记 `stopped`，先检查该 attempt 是否已结束、ID 是否错误或控制器已清理；
- `generated`、`persisting_assistant`、`awaiting_mvu`、`settling` 阶段不再显示“停止生成”；这些阶段只允许继续完成落盘/结算或进入对应恢复入口；
- stop 后到达的 stream、ended、Promise resolve/reject 都按同一 attempt 记录；任何迟到文本不得落正式助手楼层；
- stop 失败不得调用 `stopAllGeneration` 或宿主全局 stop 作为静默兜底；
- 切聊天、iframe unload 和用户显式 stop 使用不同 `abortReason`，日志与 UI 不得混称。

### 3.2 继续、从头重试与重新生成的区分

三个操作必须分开命名和实现：

| 操作 | 适用条件 | 玩家楼层 | 模型调用 | 结果位置 |
|---|---|---|---|---|
| 继续生成 | 仅旧 `native-trigger` 路径且已验证 `/continue` 语义 | 复用 | `/continue` | 由原生路径负责 |
| 从头重试 | send attempt 失败/停止且无正式 assistant commit | 复用同一 requestId | 新 attemptId/generationId 调一次 generate | 新正式 assistant 楼层 |
| 重新生成 | 最新 assistant 已存在 | 不新增 | 独立 regenerate attempt | 同一 assistant 的新 swipe 或 native regenerate |

`helper-generate` 首版停止后默认只提供“从头重试”，不得把它写成“继续上次生成”。若以后要保留流式残文并续写，需要独立能力探针和 prompt/楼层合同，不在本轮猜测实现。

### 3.3 停止恢复与自动化

- stop 过程中再次点击：幂等，不发第二次 stop；
- stop 后 Promise reject、resolve、永不 settle 三种路径；
- stop 返回 false；
- stop 与 GENERATION_ENDED 同时发生；
- stop 后立即从头重试，新 generationId 且不复制玩家楼层；
- stop 后切聊天或 reload，旧结果不能落地；
- 外部 generate 同时存在时，只停止本 ID；
- UI 文案与可用按钮必须由 phase 派生，不能由多个局部 boolean 各自决定。

门禁：不能证明按 ID 停止、迟到结果隔离和新 attempt 重试三者同时成立时，`helper-generate` 不得设为默认；继续保留 native transport。

---

## Phase 4：监听收敛、重载恢复与重复机制下线

仅在 Phase 2、Phase 3 实机通过后执行。

### 4.1 将监听分成两类

受管请求监听：

- `generate()` Promise；
- 按 generationId 过滤的 iframe start/stream/end；
- 本事务助手楼层的 MVU；
- 本事务 chat identity。

外部同步监听：

- 用户在原生界面进行的消息修改、swipe、删除、切换；
- 非本协调器发起的生成；
- chat change；
- UI shell mount/unmount。

外部同步监听不得反过来认领受管事务或重复 settlement。

### 4.2 重载后的事务恢复

iframe、游戏壳、热更新或远程 bundle 重载后，内存 active request、listener 和 timer 一律视为丢失。新实例必须先从真实聊天重建，再开放发送：

- 找到最新带 request metadata 的玩家楼层及其精确 assistant commit；
- 玩家存在、助手不存在：显示“请求未完成/状态未知”，禁止自动重发；
- 助手已存在、MVU/settlement 未确认：只恢复变量等待或 settlement，不调用主模型；
- assistant commit 已完成：恢复 settled 与 GAL 投影；
- metadata 缺失或存在多条冲突：进入 native recovery/人工确认；
- 恢复判断必须绑定 `ownerCharacterId + chatId + requestId`，不得只看最后楼层 role 或内存 busy。

### 4.3 可删除/降级的旧机制

只有日志证明无用途后，才能从受管请求中移除：

- 固定 450 ms 等待；
- 为寻找非空助手楼层而轮询；
- 依赖 DOM 判断模型是否生成；
- 同时等待多个含义重叠的宿主 generation end；
- 未按请求 ID 区分的全局定时器。

DOM observer 若仍负责外部 UI 同步，可保留，但要在命名和注释中说明不再是受管生成权威来源。

### 4.4 监听生命周期与恢复测试

- mount/unmount 10 次不增加重复 listener；
- 连续发送 10 次，每个请求只有一套 start/end/MVU 时间线；
- 切聊天后旧 listener 清理；
- 热重载后无重复提交；
- 生成中 reload 后不自动重发，且旧 Promise 无法提交；
- assistant 已落盘、MVU 未完成时 reload，只恢复结算；
- metadata 冲突时进入明确恢复态；
- 外部原生生成不会被当前空闲协调器错误结算；
- 原生恢复模式和调试楼层模式不会改变监听数量。

---

## Phase 5：重新生成迁移

重新生成是独立门禁，不因普通 send 成功而自动启用。

### 5.1 分支决策

若 Probe C FAIL：

- 保留 `/regenerate await=true`；
- 只复用统一请求定位、日志、chat identity 和 settlement 保护；
- `regenerationTransport` 显示为 `native-regenerate`；
- 在实施日志中明确阻塞原因；
- 不手工 emit Tavern 事件。

若 Probe C PASS：

- 可实现 `helper-generate-swipe`；
- 先隐藏在开发开关后；
- 完成所有 swipe/MVU 实机测试后再设默认。

### 5.2 定位原请求

重新生成必须明确得到：

- 目标 assistant message ID；
- 该楼层是当前聊天最后一条 assistant；首版禁止对历史 assistant 新增 swipe；
- 当前 swipe ID；
- 与它配对的 player message ID；
- 玩家楼层中的 `gal-generation-request.v1`；
- 原请求前状态楼层 ID；
- prompt revision；
- 当前 chat identity。

旧聊天若没有 metadata，走兼容分支：从消息邻接关系和现有项目规则恢复，并在日志标记 `legacy_request_reconstructed`。恢复存在歧义时停止，不得猜错楼层。

若目标 assistant 后方还存在任何 user/assistant 楼层，说明它是历史楼层。本轮只允许切换它已经存在的 swipe 并重读展示，不允许调用模型生成新 swipe。历史楼层重新生成会涉及后续消息裁剪、分支或检查点语义，必须另立计划和目标版本实机探针。

### 5.3 重新构造 prompt

- 以原玩家请求为当前 `user_input`；
- 历史截止在原玩家消息之前；
- 使用原请求记录的状态基线；
- 不把旧助手回复放进历史；
- 不把旧回复执行后的变量状态作为新起点；
- 若 `promptRevision` 已变化，明确选择“按旧版重放”或“按当前版重建”，UI 和日志必须说清楚；首版建议按当前模板 + 原状态基线。
- 本轮保持原 `modelUserInput` 的提示词拼接语义；不得趁 regenerate 把协议迁移到 injects。未来注入改造后再通过 revision/migration 处理新旧请求。

### 5.4 写入新 swipe

必须原子地维护：

- `swipes`；
- `swipes_data`；
- `swipes_info`；
- `swipe_id`；
- 与项目状态所有权相关的 extra 字段。

要求：

- 旧 swipe 不删除；
- 新文本只追加一次；
- 新 swipe 的 metadata 包含原逻辑 requestId 和新的 attemptId/generationId/commitKey；
- active swipe 指向新结果；
- 页面刷新后仍一致；
- MVU 对新 active swipe 只执行一次；
- 失败时保持原 active swipe，不留下半写数组。

如果公开 API 不能提供足够原子性，停止迁移并保留 `/regenerate`。

### 5.5 重新生成自动化与实机用例

- 单 swipe → 新增第二 swipe；
- 多 swipe → 在当前任意 swipe 上重新生成；
- 历史 assistant 后方已有楼层时拒绝新生成，不改变后续聊天；
- 生成失败，数组完全不变；
- stop，数组完全不变；
- 写入期间切聊天，不提交；
- 新 swipe MVU 成功；
- MVU timeout，文本保留且状态明确；
- 刷新页面，swipe 数量/active id/状态一致；
- 旧消息无 metadata 的兼容路径；
- prompt 中不包含旧助手回复；
- 不重复玩家消息。

---

## Phase 6：全楼层隐藏与调试模式

该阶段是可选诊断增强，不属于“发送、监听、停止、重新生成”四条核心完成定义，也不得阻塞核心事务收尾。它可与 Phase 2 的纯 UI 部分独立开发；若本轮实施，则合并前必须与核心事务一起实机验证。若跳过，记录为 `NOT_APPLICABLE`，保留现有 native recovery 与楼层隐藏行为不变。

### 6.1 状态模型

宿主只保留两个独立布尔状态：

```ts
nativeMode: boolean;
debugFloorsVisible: boolean;
```

派生规则：

```ts
gameVisible = !nativeMode;
floorsHidden = !nativeMode && !debugFloorsVisible;
nativeComposerVisible = nativeMode;
```

三种有效模式：

| 模式 | GAL 外壳 | 真实楼层 | 原生输入框 |
|---|---:|---:|---:|
| 默认游戏 | 显示 | 隐藏 | 隐藏 |
| 调试楼层 | 显示 | 显示 | 隐藏 |
| 原生恢复 | 隐藏 | 显示 | 显示 |

不允许出现“GAL 显示 + 原生输入框显示”的第四种模式，以免用户绕过事务协调器重复发送。

### 6.2 宿主 class 与 CSS

在 `src/runtime/ui-host-shell.js` 中：

- GAL 激活 class 负责挂载/显示游戏外壳与隐藏原生 composer；
- 独立的 floors-hidden class 负责隐藏 `#chat` 的所有真实 `.mes` 及 `#show_more_messages`；
- 调试模式只移除 floors-hidden class；
- native mode 移除 GAL 激活和 floors-hidden，恢复宿主；
- 选择器要覆盖目标版本真实楼层容器，但避免隐藏 GAL 自身 iframe/overlay；
- 不操作消息数据字段。

建议继续由单一 `applyMode()` 原子应用 class，避免多个按钮分别改 DOM 造成状态漂移。

### 6.3 设置项

在设置页开发/诊断区域增加：

- `显示真实消息楼层（调试）` 开关；
- 说明文字：“仅显示底层真实楼层，不开放原生输入框，不改变消息数据”；
- 调试模式启用时显示固定或粘性提示条；
- 保留已有“显示原生聊天/恢复模式”按钮，明确它是另一功能；
- 返回游戏界面后恢复先前 debug 开关状态。

首版建议把 `debugFloorsVisible` 存在 `sessionStorage`：

- 默认关闭；
- 新浏览器会话自动关闭；
- 不写入 MVU、聊天消息或角色卡；
- 若项目已有统一 session settings 存储，则复用，不另造全局变量。

### 6.4 楼层模式测试

- 初次加载默认隐藏所有真实楼层；
- `#show_more_messages` 同步隐藏；
- 打开调试：GAL 和真实楼层同时可见，composer 仍隐藏；
- 关闭调试：楼层立即隐藏，GAL 状态不丢失；
- 进入 native：GAL 隐藏，楼层和 composer 显示；
- 返回游戏：恢复 debug 开关对应状态；
- 切聊天后默认行为一致；
- GAL 初始化异常仍能进入 native；
- 移动端/窄屏显示楼层不会遮住调试返回入口；
- debug 切换不新增事件 listener、不触发生成、不修改消息 JSON；
- 刷新后 session 行为符合约定。

---

## Phase 7：清理、集成与默认开关切换

只有 Phase 0～5 的核心适用门禁完成后执行；可选 Phase 6 可为 PASS 或 NOT_APPLICABLE。阶段结果允许 `PASS_WITH_FALLBACK`：例如 Probe C 不支持 helper swipe 时，保留 `native-regenerate` 仍可进入本阶段；核心阶段 `BLOCKED` 不可进入。

### 7.1 清理条件

可删除旧受管生成代码的条件：

- 新 send 在目标运行时连续通过完整场景矩阵；
- listener 数量和事件归属可由日志证明；
- 新失败恢复路径经过测试；
- transport 一键回退验证有效；
- 重新生成若未迁移，旧路径仍完整保留；
- 没有其他调用方依赖待删函数。

删除前用 `rg` 记录调用点，删除后再次确认无死引用。

### 7.2 默认值切换

- `generationTransport` 仅在 send 验收通过后默认设为 `helper-generate`；
- `regenerationTransport` 仅在 Probe C 和 Phase 5 全部通过后默认设为 `helper-generate-swipe`；
- 否则保持 `native-regenerate`，这不是失败，而是受控兼容结论；
- 调试楼层默认关闭；
- native recovery 始终保留。

### 7.3 文档同步

按实际落地结果更新：

- `project/contract.md` 中受影响的运行合同；
- `project/api-provenance.md` 中新确认的 API 与版本；
- 实施日志的最终行为图；
- 若项目已有用户设置说明，增加调试楼层/诊断导出说明。

不得把探针推测写成已证实合同。

---

## 8. 自动化验证矩阵

执行者先读取 `package.json`，使用项目已有脚本；不要臆造不存在的命令。若依赖缺失，记录后按锁文件安装，不随意升级版本。

建议验证层级：

1. 受影响模块的定向单测；
2. UI typecheck/lint；
3. 完整单测；
4. UI build；
5. 项目现有结构/打包 dry-run 检查；
6. 目标 SillyTavern 实机验收。

必须覆盖：

| 类别 | 用例 |
|---|---|
| Request | 输入去重、历史边界、metadata 恢复、指纹稳定、提示词现状等价 |
| Attempt | requestId 稳定、每次 retry/regen 的 attemptId/generationId 更新、commitKey 幂等 |
| Transaction | phase 顺序、双击防重、commit 幂等、继续/从头重试分流 |
| Events | ID 过滤、乱序、重复、迟到、清理 |
| Stop | 生成中停止、stop 后 resolve/reject/悬空、stop false、重复 stop、外部请求隔离 |
| Chat identity | 生成中切聊天、写楼层调用期间切聊天、结算中切聊天、切角色卡 |
| Persistence | 玩家/助手各一次、无空助手、失败不半写 |
| MVU | 正常、其他楼层、未启动、超时、结算失败 |
| Reload | user-only 未知态、assistant 已落盘待结算、metadata 冲突、旧 Promise 隔离 |
| Regenerate | 最新 assistant、swipe 数组、旧请求基线、失败原子性、历史 assistant 拒绝 |
| Display | 三模式矩阵、composer 安全、session 默认 |
| Compatibility | legacy metadata、旧 transport 回退 |
| Diagnostics | trace 顺序、脱敏、环形上限、导出 |

自动化测试中的 fake host 必须可控制 Promise 和事件的先后顺序，不能只测理想同步路径。

---

## 9. 目标运行时人工验收矩阵

每个用例都要保存：候选 bundle URL/版本/SHA-256、`probeSessionId`、环境版本、步骤、requestId、attemptId、generationId、关键楼层 ID、结果和诊断导出。任何一项显示旧包/旧 bundle 时该用例作废；失败用例附最短复现。

### 9.1 普通发送

1. 普通短文本，非流式；
2. 长回复，流式；
3. 连续快速双击发送；
4. provider 返回错误；
5. 空响应/协议异常响应；
6. 生成中切换聊天；
7. assistant 写调用期间切换聊天；
8. 生成完成、MVU 等待中切聊天；
9. 回复保存后刷新页面；
10. 生成中刷新/热重载，确认不自动重发；
11. 连续发送 10 轮，检查重复 listener 和楼层数。

### 9.2 停止与恢复

- 生成中点击 stop，只命中当前 generationId；
- stop 返回 true 后 Promise reject；
- stop 后 Promise 迟到 resolve，文本不落楼；
- stop 返回 false，UI 不伪装成已停止；
- 连点两次 stop，只调用一次；
- stop 后“从头重试”复用玩家楼层并创建新 attempt/generation；
- native transport 的“继续生成”与 helper transport 的“从头重试”文案和调用不同；
- stop 后立即切聊天或 reload，旧结果不提交。

### 9.3 玩法入口

至少各测一次：

- 自由对话；
- 场景进入；
- 场景物品互动；
- 固定事件；
- 具有变量变更的回复；
- 无变量变更的回复；
- 若适用，战斗/小游戏返回 GAL 后首条请求。

### 9.4 MVU

- 变量模型正常；
- 变量模型慢响应；
- 变量模型失败；
- MagVarUpdate 临时禁用；
- 助手回复存在但变量结算超时；
- 恢复后只重跑变量/settlement，不重发主模型；
- 新助手楼层只触发一次变量模型。

### 9.5 重新生成

- 单 swipe；
- 多 swipe；
- 尝试对非最新 assistant 新增 swipe时明确拒绝；
- 旧楼层无 request metadata；
- 生成中 stop；
- provider 失败；
- 切聊天；
- 新 swipe 的变量结果；
- 刷新后 swipe 一致性；
- 切回旧 swipe 时旧状态展示合同仍成立。

### 9.6 显示模式

- 默认游戏模式；
- 调试楼层开/关；
- 调试模式发送一轮；
- 调试模式重新生成；
- 原生恢复模式；
- 从 native 返回游戏；
- GAL 启动失败后的恢复；
- 桌面与窄屏各一次。

---

## 10. 停止线与升级规则

遇到以下任一情况，执行代理必须停止对应阶段，在日志中报告，不得自行绕过：

- 无法访问声明的目标安装，或运行时版本与计划目标不一致；
- 无法证明目标页面实际加载了本轮候选 bundle，或实际加载 hash 指向旧 checkpoint/dist/R2 资源；
- 只能在旧包上复现基线，无法让候选探针代码进入目标脚本 iframe/游戏 iframe；
- 目标 API 签名/事件载荷与计划不符；
- `createChatMessages` 不能可靠触发一次且仅一次 MVU；
- swipe 无公开且可靠的 MVU 触发方式；
- 需要手工 emit SillyTavern 原生事件才能工作；
- 需要修改 MagVarUpdate 源码；
- 需要改变消息 `is_hidden` 才能隐藏楼层；
- 需要删除或迁移用户历史消息；
- 发现现有未提交改动与本任务修改重叠且无法安全合并；
- 测试会触碰正式发布、远端存储或用户生产数据；
- 无法证明失败恢复不会重复调用主模型；
- 无法在切聊天后阻止旧结果提交。
- 无法区分继续生成、从头重试和重新生成，或 stop 必须退化为停止宿主全部生成。

停止时给出：证据、最小复现、已尝试的安全方案、两个以内的可选方向，不要继续扩大改动。

---

## 11. 回滚设计

回滚单位必须小于整次重构：

1. Send transport 回滚：`helper-generate` → `native-trigger`；
2. Regenerate transport 回滚：`helper-generate-swipe` → `native-regenerate`；
3. Stop 回滚：helper transport 随 send 一起关闭；native transport 恢复其已验证的全局 stop/continue UI，不混用按 ID 状态；
4. Listener 回滚：重新启用旧受管轮询，仅在对应旧 transport 下工作；
5. Display 回滚：关闭 debug floors，native recovery 不受影响；
6. Request metadata 为向后兼容的 extra 扩展，旧代码忽略即可；
7. Trace 系统可单独关闭，但错误日志至少保留。

回滚测试必须证明：

- 不需要删除新 metadata；
- 不会复制或丢失已有消息；
- 新旧 transport 不会同时发出两次模型请求；
- 设置刷新后能看见当前实际 transport。

---

## 12. 推荐提交切片（供执行代理自检，不代表授权提交）

即使最终不创建 Git commit，也按以下切片组织改动和日志：

1. `probe/diagnostics`: 候选构建身份门禁、API 探针与结构化 trace 基础；
2. `request-builder`: 纯请求构造与 metadata；
3. `send-coordinator`: 普通发送 generate 事务；
4. `stop-retry`: 按 ID 停止、迟到结果隔离与新 attempt 重试；
5. `listener-recovery`: 监听收敛与 iframe/reload 恢复；
6. `regenerate`: 仅在门禁通过时迁移最新 assistant swipe；
7. `debug-floors`: 三模式与设置；
8. `cleanup/docs`: 删除已证实冗余、同步合同和说明。

每个切片必须能独立说明：改了什么、如何验证、如何回滚。未经用户明确要求，不执行 commit、push、发布或上传。

---

## 13. 最终交付物

执行代理完成后必须交付：

1. 实际代码改动；
2. `project/gal-generate-transaction-implementation-log.md`；
3. 更新后的 API provenance/合同文档（仅写已证实内容）；
4. 自动化测试清单与结果；
5. 目标运行时验收矩阵；
6. 至少一份成功 send、一次 stop、一次 retry、一次 regenerate 的脱敏 trace；
7. 若 regenerate 未迁移，明确保留旧路径的证据和原因；
8. 当前 transport/debug 设置截图或文字记录；
9. 已知问题与最短复现；
10. 精确回滚步骤。
11. 本轮候选 bundle 的文件/响应 SHA-256、实际加载 URL、内部版本和 `probeSessionId`；
12. 明确列出哪些结果是 `PASS`、`PASS_WITH_FALLBACK`、`BLOCKED`、`NOT_APPLICABLE`、`BASELINE_ONLY`，旧包基线不得混入候选验收。

---

## 14. 风宝后续验收清单

后续验收不只看 diff，将按以下顺序复核：

### 14.1 范围与代码

- 工作区是否只改了授权文件；
- 是否覆盖用户已有修改；
- 是否出现双协调器、双模型调用或双提交路径；
- request builder 是否保持纯函数；
- requestId/attemptId/generationId 是否各守其职责，retry 是否错误复用 generationId；
- Promise 是否真的是最终文本权威；
- 所有 iframe generation 事件是否校验 ID；
- listener/timer 是否无条件清理；
- 是否手工伪造 Tavern 事件；
- 是否改动 `is_hidden`；
- 是否把完整 prompt/stat_data 写进日志或消息 metadata。

### 14.2 行为

- 玩家楼层和助手楼层各一次；
- stop/失败不产生空助手；
- stop 是否只命中当前 generationId，迟到结果是否被隔离；
- “继续生成”“从头重试”“重新生成”是否分流；从头 retry 不重复玩家楼层，但必须且只允许一次新的主模型调用；
- MVU 对正确助手楼层最多一次；
- MVU 失败时能仅恢复结算；
- 切聊天后旧结果不落地；
- regenerate 不含旧助手回复和旧回复后的状态污染；
- 非最新 assistant 是否被禁止新增 regenerate swipe；
- reload 后是否从真实楼层恢复，且不会自动重发主模型；
- swipe 数据刷新后保持一致；
- 三种楼层显示模式符合矩阵；
- debug 模式不开放原生输入框。

### 14.3 证据

- 实施日志是否逐阶段记录，而非事后补写；
- PASS/PASS_WITH_FALLBACK/BLOCKED/NOT_APPLICABLE/BASELINE_ONLY 是否有版本、步骤和 trace 支撑；
- 运行页面是否读回本轮候选 bundle URL/版本/SHA-256 与 `probeSessionId`；
- 是否把旧 checkpoint、旧 dist 或旧 R2 bundle 误写成候选探针 PASS；
- 失败是否提供 requestId 与最短复现；
- 自动化是否覆盖乱序、迟到、取消和 chat change；
- 实机是否使用目标版本；
- 回滚是否实际演练。

任何关键行为若只有“应该”“理论上”而没有日志或测试证据，验收视为未完成。

---

## 15. 执行代理的最终报告模板

```md
# GAL 事务重构执行报告

## 结果摘要
- Send transport：
- Regenerate transport：
- 默认楼层模式：
- 完成阶段：
- 未完成/阻塞阶段：

## 版本与环境
- SillyTavern：
- Tavern Helper：
- MagVarUpdate：
- 项目版本/提交：

## 候选构建身份
- Bundle 文件/响应 SHA-256：
- 实际加载 URL：
- Bundle/bridge 版本：
- probeSessionId：
- 是否与旧 checkpoint/dist/R2 资源隔离：

## 文件改动
- 文件：用途

## API 探针结论
- 候选构建身份门禁：PASS/BLOCKED + 日志位置
- Probe A：PASS/PASS_WITH_FALLBACK/BLOCKED + 日志位置
- Probe B：PASS/PASS_WITH_FALLBACK/BLOCKED + 日志位置
- Probe C：PASS/PASS_WITH_FALLBACK/BLOCKED + 日志位置
- 旧包基线：BASELINE_ONLY/未运行 + 日志位置

## 自动化验证
- 命令：结果

## 实机验收
- 场景：结果 + requestId + attemptId + generationId + trace/截图

## 已知问题
- 问题：
- 最短复现：
- 影响：
- 临时回滚：

## 回滚方式
- Send：
- Regenerate：
- Display：

## 请求验收者重点检查
- ...
```

执行者完成报告后停止，不自行发布；由验收者根据本文第 14 节复核。
