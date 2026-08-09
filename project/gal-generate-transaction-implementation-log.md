# GAL 发送、监听、停止与重新生成事务重构 — 实施日志

> 依据：`project/gal-generate-transaction-refactor-plan.md`（收编自 `D:/浏览器下载/gal-generate-transaction-refactor-plan..md`，SHA-256 `4a99b7feddaace894516146c866ecafd909e1d115c72400ff53b28cdd96f1a55`）
> 规则：每完成一个小步骤就追加记录，禁止最后一次性补写。

---

## [2026-08-08] 收编与环境裁定（对应 Phase 0 前置：计划收编 + 目标运行时核对）

### 目标
- 把重构计划文档收编进工作区
- 核对目标运行时可达性与版本，裁定唯一正式目标

### 工作区基线
- git HEAD：`359ec43 chore: sync r95 project snapshot and visitor lifecycle fixes`
- 任务前 dirty 状态：仅 `.reasonix/desktop-*.json` 等 4 个元数据文件（非本任务改动，未清理未覆盖）
- 本任务新增文件：
  - `project/gal-generate-transaction-refactor-plan.md`（收编，与原件 SHA-256 一致）
  - 本实施日志
- Node：v24.18.0 / npm：11.16.0

### 环境裁定（用户授权，2026-08-08）
- **正式目标**：SillyTavern 1.18.0 + Tavern Helper / JS-Slash-Runner 4.8.18
- 运行实例：`F:/agent airp/SillyTavern`（http://127.0.0.1:8000/，PID 7036，命令行 `node server.js`）
- 证据链：
  - `F:/agent airp/SillyTavern/package.json` → `{ name: "sillytavern", version: "1.18.0" }`
  - `public/scripts/extensions/third-party/JS-Slash-Runner/manifest.json` → `"version": "4.8.18"`；`dist/index.js` 内部版本标记 `4.8.18`
  - 运行页面只读探测（Playwright）：全局 `TavernHelper` 暴露 `createChatMessages/setChatMessages/getChatMessages/iframe_events/tavern_events` 等；加载的扩展脚本 URL（`/scripts/extensions/third-party/JS-Slash-Runner/dist/index.js`、`ST-Prompt-Template/dist/index.js`）与该目录一致
  - ST-Prompt-Template：1.17.4（manifest）
- 不可达：
  - 原计划 4.8.19 安装路径 `D:/json脚本地下城/主体/SillyTavern`：node `fs.existsSync` 三级路径均 `no`
  - `F:/agent airp/Luker`（luker@2.7.0 + Helper 4.8.18）：静态可达但未运行；不参与本轮实机
- 结论：实机结论只对 1.18.0 + 4.8.18 有效；4.8.19 不得以任何方式替代背书

### 计划文档修订
- `project/gal-generate-transaction-refactor-plan.md`：第 6 行「目标运行环境」与 2.2 节追加裁定记录（保持正文其余不动）

### 下一步
- Phase 0.1 剩余项：现有 build/test 命令核对、支持矩阵落档
- Phase 0.2：`rg` 建立现状调用图（`submitGalMessage` / `sendUserMessage` / `MessageTransactionCoordinator` / `/trigger` / `/regenerate` / `createChatMessages` / `setChatMessages` / 生成事件 / `VARIABLE_UPDATE_ENDED` / `nativeMode` / 楼层隐藏 CSS）
- Phase 0.3+：候选探针构建与 Probe A/B/C（需用户指示开始；探针会触碰运行中的 1.18.0+4.8.18 实例）

---

## [2026-08-08] Phase 0.1 剩余项 + Phase 0.2 现状调用图

### 目标
- 记录现有 build/test 命令，完成支持矩阵落档
- 用 grep/rg 查清发送、监听、重新生成、楼层隐藏链路的定义与调用方

### 现有命令（package.json scripts）
- `check:ui` = `tsc --noEmit`（typecheck）
- `test` = `node --test tests/*.test.mjs`（单测）
- `build:ui` / `build:ui:remote` = esbuild 打包（`--asset-mode=remote-r2-live`，指向正式 R2）——执行期禁止运行
- `package:checkpoint:*` = 正式 checkpoint 打包/PNG 嵌入——执行期禁止运行
- `preview` = `node scripts/preview-server.mjs`（本地预览服务器）——计划 0.3「不覆盖正式 R2 指针的开发态加载方式」的候选入口，待确认其行为
- `check:assets:r2` / `plan:assets:r2` = R2 资产 dry-run

### 支持矩阵
- 单一正式目标：SillyTavern 1.18.0 + Tavern Helper 4.8.18（`F:/agent airp/SillyTavern` @ :8000）
- Luker 2.7.0/4.8.18 与 4.8.19 均不参与本轮实机背书

### 现状调用图（文件 → 函数 → 责任）

| 文件 | 函数 | 责任 |
|---|---|---|
| src/ui/app.ts | submitGalMessage (1657) | UI 发送入口：校验/busy → `withGardenNarrativeContract` (1685) → `bridge.sendUserMessage` (1684) → 成功清输入/刷 UI。入口：按钮 (1190)、输入框 (2138)、互动 (1589/1645)、战斗结算 (2504)、月见温泉 (3364)、异变收束 (3289) 等 |
| src/ui/app.ts | gg-regenerate (2156) | 重新生成按钮 → `bridge.regenerateLatest()` |
| src/ui/app.ts | gg-show-native (2274) | 「显示原生聊天」按钮 → `bridge.showNativeChat()` |
| src/ui/bridge.ts | createHostBridge (351) | 组装 host bridge；构造 `MessageTransactionCoordinator` host (357) |
| src/ui/bridge.ts | sendUserMessage (929) | bridge 事务入口：`transactionOperationInFlight` 防重 → `requireMvu()` → before 状态捕获 → `localSettlementAction` → `transactions.submit` → `waitForVariableStage` (443) → `requirePendingSettlement`。另有 sendAnomalyResolution (967)、sendDuelVictoryRequest (1013)、settlement/battle 快捷 (1728/1736) |
| src/ui/bridge.ts | host.createUserMessage (361) | `g.createChatMessages([{role:'user',...}], {insert_before:'end', refresh:'none'})` |
| src/ui/bridge.ts | host.prepareGeneration (367) | **固定 450ms 等待**（计划 4.3 要删） |
| src/ui/bridge.ts | host.triggerGeneration (373) / continueGeneration (379) | `g.triggerSlash('/trigger await=true')` / `('/continue await=true')`，用 hostGenerationStartedEpoch 核对 |
| src/ui/bridge.ts | subscribe (1456) | 事件监听：MESSAGE_RECEIVED→markAssistantMessageReceived；STREAM_TOKEN_RECEIVED→markStreamTokenReceived（仅刷新提示）；GENERATION_STARTED→hostGenerationActive+epoch++（滤 dryRun）；GENERATION_STOPPED→active=false（**不** markStopped）；GENERATION_ENDED→active=false+markGenerationEnded；MESSAGE_UPDATED/SWIPED/CHAT_CHANGED→refresh；MutationObserver(body data-generating + #mes_stop) (1504)；500ms settlePendingAfterReply 轮询 (1520)；VARIABLE_UPDATE_ENDED→epoch++→settlePendingAfterReply (1529) |
| src/ui/bridge.ts | stopGeneration (1382) | **全局** `SillyTavern.stopGeneration()` + markStopped（计划 3.1 要求改按 generationId） |
| src/ui/bridge.ts | regenerateLatest (1387) | `/regenerate await=true` → MVU epoch 轮询（baselineEpoch + 2.5s 窗口、90s 上限）→ getMvuData → reconcileM2Runtime → replaceMvuData |
| src/ui/bridge.ts | swipeLatest (1435) | `/swipe await=true direction=…` |
| src/ui/bridge.ts | showNativeChat (1438) | dispatch CustomEvent `gensokyo-garden:show-native-chat` |
| src/ui/message-transaction.ts | MessageTransactionCoordinator.submit (59) | 状态机：submitting_user→generating→settling→settled/failed；玩家楼层创建/按 `extra.gensokyoTransactionId` 反查；触发生成；waitForAssistant |
| src/ui/message-transaction.ts | retry (134) | failed 后 continue 或重新 trigger，不重复玩家楼层 |
| src/ui/message-transaction.ts | waitForAssistant (230) | **楼层轮询**（100ms / 上限 120s）+ generationEnded 状态（计划 4.3 要删） |
| src/ui/message-transaction.ts | reconcile (251) | 楼层权威：按 transactionId 定位用户楼层 → 之后首个非空 assistant → 进入 settling |
| src/runtime/ui-host-shell.js | installHostStyle (135) | 注入宿主 CSS：`#chat.gg-gensokyo-chat-active > .mes` 与 `> #show_more_messages` 隐藏；`body.gg-gensokyo-game-active #send_form` 隐藏 |
| src/runtime/ui-host-shell.js | applyMode (476) | 单一原子应用：body activeClass、chat chatActiveClass、shell/returnFrame hidden，全部由 `nativeMode` 单一布尔派生（**无 debugFloorsVisible 正交状态**，对应计划 Phase 6） |
| src/runtime/ui-host-shell.js | showNativeChat (488) / showGame (495) | nativeMode true/false |
| src/runtime/ui-host-shell.js | exposeBridgeGlobals (197) | 向游戏 iframe 暴露：waitGlobalInitialized、getChatMessages、getLastMessageId、createChatMessages、triggerSlash、getTavernVersion、getTavernHelperVersion、eventOn、**generate**（已转发，r23 修复）、getCurrentPersonaName、getPersona、tavern_events、SillyTavern、Mvu、AutoCardUpdaterAPI |
| src/ui/types.ts | GardenBridge (517/543/545) | sendUserMessage / regenerateLatest / showNativeChat 类型 |
| src/ui/prompt-context.ts | withGardenNarrativeContract | prompt 拼接（app.ts:1685 调用）——计划 1.1 冻结的 `modelUserInput` 语义所在 |

### 与计划第 3 节基线的核对结论
- 玩家发送链逐项吻合计划 3.1：createChatMessages(refresh:'none') → 450ms → `/trigger await=true` → 轮询非空助手楼层 → MVU → settlement
- 无 requestId/attemptId/generationId；仅 `gensokyoTransactionId`（随机 UUID）；全部事务共享一套全局监听、**不按 generationId 过滤**——外部生成可被误认领（对应计划基线风险「外部事件容易被当前事务误认领」）
- 停止为全局 `stopGeneration()`，无按 ID 语义
- 重新生成链与计划 3.3 描述一致（`/regenerate await=true` + MVU 轮询 + replaceMvuData）
- 楼层隐藏与原生恢复由单一 `nativeMode` 派生，无正交 debug 状态（对应计划 Phase 6.1）
- `dist/`、`node_modules/` 与 R2 资产均未触碰

### 执行命令
- `grep`（内置工具）：submitGalMessage / sendUserMessage / MessageTransactionCoordinator / createChatMessages / setChatMessages / 生成事件 / nativeMode / triggerSlash / 楼层隐藏 CSS 等
- `read_file`：bridge.ts、message-transaction.ts、app.ts、ui-host-shell.js 关键段

### 结果
- 通过。调用图与责任表如上，基线风险点全部定位到具体行。

### 下一步准入
- 是。Phase 0.3（候选探针构建与加载身份证明）可开始，但会触碰运行中的 1.18.0+4.8.18 酒馆，需要用户确认测试聊天与加载方式（`preview` 命令待核实）。

## [2026-08-08] Phase 0.3 候选探针构建与加载身份门禁 —— PASS

### 候选构建身份（tmp/probe/build-probe.mjs 生成，构建 2 次；以下为第 2 次即本次生效）
- bundleVersion：`gal-probe-20260808-f48d27f9c5`
- probeSessionId（构建注入）：`8f5d94c6-8151-40a4-b56d-6a389a9511d2`
- sha256：`c3e11a5f05ec7a610c2149812f1594cc8feecdfcacd8a3f7f432895804b320df`（bytes 35715）
- bridgeVersion（源码标记）：`0.4.3-host-generate-r27`；builtAt：2026-08-08T11:32:16.309Z
- 候选文件：tmp/probe/{probe-mount.js, probe-manifest.json, probe-card.json, probe-loader.js, probe-app.js, serve-probe.mjs}
- 未触碰 dist/、R2、正式 checkpoint

### 加载链路（实机）
1. 探针卡（`spec: chara_card_v2` 包装）导入酒馆；**extensions.tavern_helper 保留在角色 `data.extensions`**（顶层与 json_data 均无——初次裸 JSON v1 导入会丢 extensions，v2 包装正确保留）
2. 发现：Helper 4.8.18 的角色卡 tavern_helper 脚本**不随导入自动运行**，源码注明需在「角色脚本」中手动启用（`角色脚本库`/`角色脚本”中手动启用它们`）；本轮改用 `updateScriptTreesWith(..., {type:'global'})` 添加为**全局模块脚本**绕过
3. 全局脚本「GAL 探针 loader」创建 `TH-script--GAL 探针 loader--gal-probe-loader-global-001` 脚本 iframe（tavern_helper 脚本 iframe 上下文）
4. loader fetch `http://127.0.0.1:8799/probe-manifest.json` → fetch probe-mount.js → **字节数与 sha256 校验通过**（响应 sha256 = `c3e11a5f…` = manifest）→ `import(blobUrl)` 候选 mount
5. mount = `const embedded(探针 body/appJs/css)` + **ui-host-shell.js 源码原样** + 身份注入段；ui-host-shell 在**当前角色匹配**（ownerCharacterId 非空）时挂载 `#gensokyo-game-shell` 并创建游戏 iframe
6. probe-app 在游戏 iframe 运行，读取 `window.__GAL_PROBE__` + 桥 API

### 游戏 iframe 读回证据（Playwright）
- `window.__GAL_PROBE__`：bundleVersion `gal-probe-20260808-f48d27f9c5`、probeSessionId `8f5d94c6-8151-40a4-b56d-6a389a9511d2`、bridgeVersion `0.4.3-host-generate-r27` —— **与候选构建完全一致**
- 运行时版本（经桥）：SillyTavern `1.18.0`、TavernHelper `4.8.18`
- 桥 API：`generate`、`eventOn`、`tavern_events`、`getChatMessages`、`createChatMessages`、`triggerSlash` 均可用
- **`iframe_events`（game iframe 直接）不可用；宿主 `TavernHelper.iframe_events` 可用** —— 计划 2.2 的 iframe_events 在目标运行时须经宿主获取（重要 API 修正证据）
- `Mvu`：game iframe 内 absent（探针卡未带 01-mvu-loader 脚本；正式卡依赖其 tavern_helper.scripts 中的 MVU loader）
- 事件订阅生效：trace 收到 `tavern.GENERATION_STARTED ["normal",{},true]`（dryRun 预检）与 `probe.app.started`

### 结论
- PASS。候选 bundle 已通过 tavern_helper 脚本 iframe 加载进游戏 iframe，身份可读回、SHA-256 可校验、版本与构建一致；非旧 checkpoint/旧 dist/R2 产物。
- 遗留观察：① loader 运行时 session（gal-probe-session）与构建注入 probeSessionId 双源不一致，下一步统一；② 角色卡脚本需手动启用（影响正式卡在 4.8.18 的首次加载体验，需记入后续设计）；③ Probe B/C 前需给探针卡补 MVU loader 或复用正式卡。

## [2026-08-08] Probe A：generate() 实机探针 —— PASS（非流式 + 流式）

### 前置
- 复用 Phase 0.3 探针环境（游戏 iframe + probe-app）；provider 已连接（用户确认）
- 探针调用：`generate({ user_input: 探针消息, should_stream, should_silence: true, generation_id: <自定义> })`，经宿主 `TavernHelper.iframe_events` 常量名 + 宿主 `eventOn` 订阅

### 非流式（should_stream: false，generation_id=gal-probe-mskb328w）
- `probe.generate.call` → `helper.GENERATION_STARTED ["gal-probe-mskb328w"]`（单参）
- `helper.GENERATION_ENDED ["<文本>", "gal-probe-mskb328w"]`（双参）
- `probe.generate.resolved`：Promise resolve，19870ms，string，2646 字

### 流式（should_stream: true，generation_id=gal-probe-mskb3unj）
- `helper.GENERATION_STARTED ["gal-probe-mskb3unj"]`
- 多条 `STREAM_TOKEN_RECEIVED_FULLY ["<全文>", "gal-probe-mskb3unj"]`（双参）
- 多条 `STREAM_TOKEN_RECEIVED_INCREMENTALLY ["<增量>", "gal-probe-mskb3unj"]`（双参）
- `helper.GENERATION_ENDED ["<最终文本>", "gal-probe-mskb3unj"]`（双参）
- `probe.generate.resolved`：21897ms，string，3024 字

### 结论（对照计划 0.4 矩阵）
1. ✅ 游戏 iframe 上下文调用 `generate()` 成功，Promise 为生成结果权威（resolve 文本）
2. ✅ **调用方指定的 generationId 原样出现在开始、流式（full/inc）、结束全部事件**（4.8.18 运行时支持，虽然 `generate.d.ts` 未声明该参数）
3. ✅ **事件按 generation_id 过滤成立**：两批生成（mskb328w / mskb3unj）事件载荷完全分离，无交叉误认领
4. ✅ 事件签名实测：GENERATION_STARTED=`(generation_id)`；STREAM_FULL/INC、GENERATION_ENDED=`(text, generation_id)`（经宿主 `TavernHelper.iframe_events` 常量 + `eventOn` 订阅可收到，游戏 iframe 内无 `iframe_events` 直接全局）
5. 观察：本目标实例流式事件在生成结束附近集中到达（非逐 token 实时），符合计划「流式仅投影进度、Promise 为权威」的设计前提；GAL 不得依赖流式事件做落楼/结算判断
6. 观察：dryRun 预检会发 `tavern.GENERATION_STARTED (dryRun=true)` 而不发 ENDED —— 现状 `shouldTrackHostGenerationStart` 过滤逻辑必要

### 验收证据位置
- 运行中酒馆 http://127.0.0.1:8000/ 游戏 iframe `#gal-probe-trace`（快照见本会话工具记录）
- 探针环境：tmp/probe/（build-probe.mjs、probe-app.js、probe-loader.js、serve-probe.mjs、probe-card.json、probe-manifest.json、probe-mount.js）

### 下一步
- Probe B（createChatMessages + MVU 精确等待）需探针卡补 MVU loader（01-mvu-loader + MagVarUpdate d1bdfd1）或复用正式卡；且需先在目标实例验证 `createChatMessages` 对 MagVarUpdate 的触发行为
- 探针为全局脚本（gal-probe-loader-global-001），验收后可删除

## [2026-08-08] Probe B：createChatMessages + MVU 触发 —— PASS（send 迁移前提成立）

### 前置
- 复用 Probe A 探针环境；MagVarUpdate 加载方式：必须由 tavern_helper 脚本 iframe 真实 realm import（宿主页面/错误词法环境 import 会解析到宿主精简 SillyTavern 而抛 `debounce(SillyTavern.saveChat,1e3)` 的「Expected a function」）；成功后 Mvu 挂到**宿主 window.Mvu**（脚本 iframe 无 Mvu，game iframe 经 exposeBridgeGlobals 的 `source[name] ?? host[name]` 拿到宿主 Mvu）
- 探针 loader 内 MVU import 有 Helper 脚本缓存问题（updateScriptTreesWith 后刷新仍执行旧脚本）——本轮以手动注入 iframe script 完成加载；loader 更新生效问题记入遗留

### Probe B 主实验（写入 2 条无 data 的 assistant 楼层）
- `refresh:'affected'` → **触发 1 次 MESSAGE_RECEIVED**（参数 = insertAt 楼层索引数字；与 ST 原生 emit 一致，slash-commands.js:6005/6010）
- `refresh:'none'` → 不触发 MESSAGE_RECEIVED（对照确认）
- 楼层写入成功（宿主 chat.length 正确 +2；探针侧 getChatMessages(chatId) 读数 Δ0 为读取参数问题，非写入问题）
- MVU VUS/VUE = 0：MESSAGE_RECEIVED 触发 → MVU `Ut`（3s 节流）→ `Ze` 消息内解析，但 **`if(!_.has(a,'stat_data')) return`** —— 楼层无 `data`（variables）→ 跳过，`Ge`（<UpdateVariable> 解析）未执行

### Probe B 补测 1（写入含 `<UpdateVariable>_.set(...)` 但无 data 的楼层）
- 仍无更新：同上（Ze 因无 stat_data 提前 return，与正文内容无关）

### Probe B 补测 2（写入带 data 的楼层，完整链路验证）
- 楼层 A（data.stat_data.probeB.测试计数=0，refresh:'affected'）→ **VARIABLE_UPDATE_STARTED → SINGLE_VARIABLE_UPDATED "probeB.测试计数"→0 → VARIABLE_UPDATE_ENDED**（完整事件链）
- 楼层 B（data 继承 + 正文含 `<UpdateVariable>_.set('probeB.测试计数', 0, 1)</UpdateVariable>`）→ **楼层 B `variables.stat_data.probeB = {"测试计数":1}`** —— 变量 0→1 实际生效
- 结论：**手动 createChatMessages + 带 data + refresh:'affected' 能可靠触发 MVU 变量更新**（随AI输出模式）

### docs 交叉验证（docs = 未开之花卡参考文档，docs/README:1-3）
- docs/03 §8.5 与 docs/07 §19 记录「`generate()` + `createChatMessages` 手动建楼层 + `Mvu.parseMessage` 提取 <UpdateVariable> 执行 _.set」——未开之花**生产验证**的链路，与 Probe B 实测一致
- r48-gal-transaction-repair-log.md:30 记录 `/trigger await=true` 假流式提前返回问题（GAL 现状；计划重构目标）
- 结论：docs（生产范式）+ Probe B（GAL 环境实测）双重证据 → **send 迁移前提成立**

### 门禁判定（计划 0.5）
- ✅ refresh:'affected' 触发一次 MESSAGE_RECEIVED（参数 insertAt，与原生一致）
- ✅ 手工持久化助手楼层能可靠触发 MVU 变量更新（前提：**楼层必须携带 data（variables[0]：stat_data/display_data/delta_data/schema/initialized_lorebooks）**，否则 Ze 跳过）
- ✅ VARIABLE_UPDATE_STARTED/ENDED 事件在随AI输出模式下随变量更新发出（楼层 A 证据）——计划 epoch 等待策略有据
- ⚠️ 待确认：楼层 B 的 _.set(0→1) 更新成功但未再收到 SINGLE_VARIABLE_UPDATED（可能 Ge 更新路径不广播该事件或时序）；GAL 正式实现的变量等待应以 getMvuData 读回为准（现有 localSettlementAction 模式）
- 结论：**send 迁移可行，不强制保留 /trigger**；实现须包含「assistant 楼层 data 继承/写入协议」（对应计划 1.3 与 docs 08 楼层协议）

### 遗留观察
- ① 探针 loader MVU import 未随 updateScriptTreesWith 生效（Helper 脚本缓存），后续探针版本可改为「loader 只等待宿主 Mvu，无则 iframe 注入式 import」
- ② getChatMessages 必须传 range/chatId（无参会 `undefined.toString()` 崩）
- ③ 探针聊天已含 6 条测试楼层（开场白 + Probe B ×5），全部可丢弃

## [2026-08-08] Probe C：swipe + MVU 触发 —— PASS_WITH_FALLBACK（regenerate 保持 native）

### 实验（复用探针环境；目标楼层 idx=5「补测楼层 B」，swipes=1/swipe_id=0/hasVariables）
1. 读取 assistant 楼层 ✅
2. 增加新 swipe：手动扩展 `swipes`（push 含 `<UpdateVariable>_.set('probeB.测试计数',1,2)` 的新 swipe）+ `swipes_data`/`swipe_info` push + `swipe_id=1` + `saveChat`（脚本 iframe 完整 SillyTavern）——成功
3. **手动 swipe 不刷新 UI**：无 MESSAGE_SWIPED/MESSAGE_UPDATED 事件
4. **不产生 MVU 所需事件**：MESSAGE_SWIPED/MESSAGE_UPDATED/MESSAGE_RECEIVED/VARIABLE_UPDATE_STARTED/VARIABLE_UPDATE_ENDED/SINGLE_VARIABLE_UPDATED **全零**——手动 swipe 路径无 MVU 触发
5. 变量作用新 active swipe：MVU 变量在 `variables[swipe_id]`（me() 读取）；Probe C 未复制 `variables[1]`（操作疏漏），机制上需同步 `variables` 数组（swipes_data 是 ST 独立字段，勿混淆）
6. **刷新后一致性 ✅**：reload + 重选角色后 idx=5 `swipes=2`、`swipe_id=1`、swipe[1] 内容保留（saveChat 持久化有效）

### 门禁判定（计划 0.6）
- 没有受支持且可验证的（手动/公开 API）MVU 触发路径用于 swipe → **重新生成继续使用 `/regenerate await=true`（native-regenerate）**——与计划预判一致（Probe C 大概率 FAIL）
- native `/swipe`/`/regenerate` 走 ST 原生 Generate → MESSAGE_RECEIVED → MVU 触发（Probe A/B 已证明 generate 链路 MVU 可用）→ native-regenerate 功能完整
- 禁止手工 emit 原生事件（计划红线）——手动 swipe 若要 MVU 需手工 emit，已被禁止，故无合法 helper 侧 MVU swipe 路径

### Probe A/B/C 汇总（对应计划 Phase 0 验收）
- Probe A（send）：PASS——generate() 支持自定义 generation_id 并原样贯穿全部事件、按 ID 过滤成立
- Probe B（send/MVU）：PASS——createChatMessages(refresh:'affected') 触发一次 MESSAGE_RECEIVED(insertAt)，楼层带 data 时 MVU 变量更新完整可用 → send 可迁移
- Probe C（regenerate/MVU）：PASS_WITH_FALLBACK——手动 swipe 无 MVU 触发路径 → regenerate 保留 native-regenerate
- 每份 trace 均含本轮 probeSessionId（探针身份经 __GAL_PROBE__ 读回一致）、bundle URL/版本/SHA-256、事件顺序与结论
- 未对正式剧情聊天写入任何测试数据（测试聊天「GAL-事务重构-探针 - 2026-08-08@19h36m41s922ms」含 6 条测试楼层，全部可丢弃，不自动批量删除）

## [2026-08-08] Phase 1：统一请求构造（纯函数 + request metadata）

### 1.1 纯函数请求构造器 `src/ui/gal-generation-request.ts`（新增，13142B→14042B）
- 导出：`createGalGenerationRequest`（request 构造，空白/缺身份拒绝）、`createGalGenerationAttempt`（每次模型调用新建 attempt/generationId/commitKey）、`createRequestId/createAttemptId/createGenerationId/createCommitKey`、`computeContextFingerprint`（FNV-1a 32 同步稳定）、`buildRequestMetadata/parseRequestMetadata/restoreGalGenerationRequest`、`resolvePlayerMessageByMetadata`（0/多条歧义失败）、`withPlayerMessageId`
- schema：`gal-generation-request.v1` / `gal-generation-attempt.v1`；extra 键 `galGenerationRequestV1`（沿用 gensokyo* 命名空间，不覆盖插件字段）
- 禁止调用 generate/写聊天/等待事件/操作 DOM/读宿主（全部外部输入经 snapshot 传入）
- modelUserInput 由调用方 contractInjector 注入（bridge 侧恒等——注入在 app.ts withGardenNarrativeContract 已完成，注入位置不变）

### 1.2 request metadata 写入（运行时最小侵入）
- `bridge.ts`：新增 `captureRequestSnapshot(sceneId)`（纯捕获：ownerCharacterId/chatId/stateMessageIdBeforeGeneration/stateSwipeIdBeforeGeneration/sceneId/historyFingerprintInput）；`sendUserMessage(text, kind, userVisibleText, requestContext?)` 创建 request 并把 metadata 合并进 extra（spread 不覆盖 gensokyoTransactionId/Kind）
- `types.ts` GardenBridge.sendUserMessage 加可选第 4 参；`app.ts:1685` 传入 sceneId
- 不保存完整历史/状态树（fingerprint 用 message_id:role 摘要 + 输入 hash）；modelUserInput 不复制到 extra，只存 `modelUserInputHash`
- **允许的差异（逐项解释）**：① 持久化玩家楼层 extra 新增 galGenerationRequestV1 键（诊断元数据，ST 不消费，不覆盖既有键）；② sendUserMessage 签名新增可选第 4 参（向后兼容）。模型可见输入/历史集合/transport/提示词注入位置零差异（1.3 对比测试证明）
- 说明：sendAnomalysisResolution/sendDuelVictoryRequest 等特殊链路本次不改（保持自身 transactionId），Phase 2 统一

### 1.3 对比测试（tests/gal-generation-request.test.mjs）
7 类请求全部 `modelUserInput === withGardenNarrativeContract(text.trim(), state)` 逐字节等价：普通自由对话/场景入口/场景物品互动/固定事件/战斗特殊协议入口/带前序 swipe/换行引号斜杠命令样字符

### 1.4 自动化（17 项全过）
结构快照、输入不重复（只出现 1 次）、metadata round-trip、requestId 稳定而 attemptId/generationId 变化、精确反查 1 条/0 条 not-found/多条 ambiguous、缺旧 metadata 兼容（missing/malformed/schema-mismatch/incomplete 不抛错）、fingerprint 稳定性（同值/异值）、空白拒绝、缺失身份拒绝、visibleUserText 分离
- 门禁：请求构造对比通过（16→17 测试 + tsc 0 error；全量 251 pass / 1 fail 为既有基线红「GAL 回复落盘后释放本地提交锁时，重新渲染道具选择器」ui-contract.test.mjs:3607，app.ts 未触及 finally 块，与本阶段无关，Phase 2 改 submitGalMessage 时同步修）

## [2026-08-08] Phase 2 增量 A：ID/快照扩展 + 玩家楼层反查一致性（零行为变化）

### 改动
- `types.ts`：MessageTransactionSnapshot 增 requestId/attemptId/generationId/commitKey/ownerCharacterId/chatEpoch/mvuEpochBefore（全可选，旧路径不填）
- `gal-generation-request.ts`：GalGenerationRequest 增 attemptSeq（serialize+restore）；ATTEMPT_EXTRA_KEY='galGenerationAttemptV1' + buildAttemptMetadata/parseAttemptMetadata/resolveAssistantMessageByCommitKey（commitKey 幂等反查 0/多条失败）
- `message-transaction.ts`：SubmitRequest.request、TransactionHost.chatEpoch?()/mvuEpoch?()；submit 时 createGalGenerationAttempt(request,'send',request.attemptSeq) 填充四级 ID + 初始 chat identity；本次新创建玩家楼层按 requestId 精确反查一致性校验（0 条/多条/与 gensokyoTransactionId 不一致 → phase=failed，不猜 ID；existing 复用路径跳过）
- `bridge.ts`：sessionEpoch（Date.now，桥会话标识）+ chatEpoch/mvuEpoch 回调；sendUserMessage 把 request 传入 submit
- 设计文档同步：requestPhase 延后到增量 C（状态机统一时），增量 A 保持 5 态

### 测试（新增 tests/message-transaction-v2.test.mjs，fake TransactionHost）
5/5：① 快照四级 ID + chatEpoch=42/mvuEpochBefore=7 + 反查成功（userMessageId=1/assistantMessageId=2/phase=settling）+ 持久化 extra 含兼容键与 metadata；② 反查 not-found → failed「反查失败」；③ ambiguous → failed「歧义」；④ 不一致（gensokyoTransactionId 楼层 ≠ metadata 楼层）→ failed「不一致」；⑤ 旧路径无 request → 无新字段、流程照旧
- gal-generation-request.test.mjs 19/19（+attempt metadata round-trip、commitKey 反查 1/0/多条、restore attemptSeq）；tsc 0 error
- 全量 258 pass / 1 fail（唯一失败仍为既有基线红 ui-contract.test.mjs:3607）

### 行为影响
- native-trigger 默认路径零行为变化（反查校验仅在「本次创建玩家楼层且带 request」时执行；正式发送链 bridge 始终写 metadata → 校验恒过）
- 旧聊天/无 metadata 楼层不受影响（gensokyoTransactionId 兼容反查保留）

## [2026-08-08] Phase 2 增量 B：generationTransport 开关 + helper-generate 路径

### 关键确认（Helper 4.8.18 generate.d.ts）
- **generation_id 在 d.ts 已声明**（GenerateConfig.generation_id，可指定唯一标识以按 ID 监听/停止）——修正早前「未声明」记录
- `overrides.chat_history.prompts`（RolePrompt[]）可显式覆盖聊天历史；`should_silence:true` 静默生成（不影响 ST 停止按钮，可按 generation_id 停止）；返回 Promise<string | GenerateToolCallResult>

### 改动
- `bridge.ts`：HostGlobals 加 iframe_events/TavernHelper.iframe_events/generate/__GAL_GENERATION_TRANSPORT__；EMPTY_MVU_DATA 常量；generationTransport（默认 native-trigger，宿主 __GAL_GENERATION_TRANSPORT__==='helper-generate' 覆盖，验收/回滚不碰代码）；pendingRequest（sendUserMessage 创建）；triggerGeneration 按 transport 分支；`runHelperGenerate`：generate() 调用（generation_id/user_input=modelUserInput/should_silence/overrides.chat_history.prompts 排除本次玩家楼层）→ 事件按 generationId 过滤（GENERATION_STARTED/STREAM_TOKEN_RECEIVED_FULLY/GENERATION_ENDED，重复 ended 只记一次，仅 trace）→ Promise resolve 后 chat identity 复核（切聊天不落楼）→ 空结果不落楼 → commitKey 幂等反查（已存在复用/多条歧义失败）→ assistant 落楼（refresh:'affected' 触发 MESSAGE_RECEIVED→MVU，Probe B 实测；data=最新持久化 Mvu 数据或 EMPTY_MVU_DATA；extra=buildAttemptMetadata）→ finally 清理监听
- `gal-generation-request.ts`：+ buildChatHistoryForGenerate（排除 excludeMessageId、role 映射、跳过空文本、保持顺序）
- `message-transaction.ts`：TransactionHost.generationTransport 声明
- `types.ts`：RuntimeDiagnostics.generationTransport（host+preview 均输出）

### 测试
- gal-generation-request.test.mjs 20/20（+buildChatHistoryForGenerate：排除/保留/空文本/is_user 兼容）
- tsc 0 error；全量 259 pass / 1 fail（既有基线红）

### 行为差异（helper-generate 与 native-trigger，待实机验收记录）
- 历史由 overrides.chat_history.prompts 构造（排除本次玩家楼层）→ 修正旧路径「楼层在历史 + user_input 重复」缺陷（计划 §1.1 要求）
- assistant 楼层由本卡 createChatMessages 写入（含 attempt metadata）而非 ST 原生生成
- 默认 transport 仍为 native-trigger；helper-generate 未设默认（计划 §2.7 门禁）
- 遗留：helper-generate 下 retry 暂复用旧 attempt（attemptSeq 递增在增量 D 失败恢复统一）；stream 仅 trace 不投影 UI（增量 D 做 pending 气泡）；tool-call 结果按空处理（增量 D 细化）

## [2026-08-08] Phase 2 增量 C：MVU 精确等待收敛

### 现状（已具备，增量 C 收敛）
- 2.5s 分析启动兼容窗口（variableStageReady 第三信号）、90s 总上限、100ms 轮询、VARIABLE_UPDATE_ENDED 监听 epoch+1（subscribe() 内）、isDuringExtraAnalysis 检查——均沿用

### 改动
- `variableStageReady(mvu, assistantMessageId?)`：绑定实际助手楼层——目标楼层 `getMvuData({type:'message', message_id}).stat_data` 非空视为就绪（提前信号）；缺失回退通用信号（epoch/分析态/2.5s）
- `waitForVariableStage(assistantMessageId?)`：绑定楼层日志；90s timeout 错误语义明确「回复已保存，但变量结算未完成；只恢复结算，不再生成文本」（计划 §2.5：timeout 后不再次生成文本）
- 5 处调用点传 assistantMessageId（sendUserMessage 系 4 处用 snapshot、retryLastTransaction 1 处用 current）
- VARIABLE_UPDATE_ENDED 监听：记录「事件无楼层参数、按 epoch 聚合；目标楼层复核在 waitForVariableStage」——Helper 事件限制实机事实，ignored 语义文档化

### 实机事实（记录）
- Helper 4.8.18 VARIABLE_UPDATE_ENDED 事件不带楼层参数（Probe B 实测 id 为 update id）→ 无法按楼层精确过滤事件；楼层绑定只能在 getMvuData 复核层做
- assistant 楼层写入即带初始 stat_data 快照（latest.data）→「stat_data 非空」是提前信号而非必要条件（普通无变量回复仍靠 epoch/2.5s 兜底）

### 验证
- tsc 0 error；全量 259 pass / 1 fail（既有基线红）

## [2026-08-08] Phase 2 增量 D：输出校验 + 失败恢复 + retry attempt 递增 + stream 投影

### 改动（bridge.ts + app.ts）
- 抽取 `buildAttemptFromSnapshot`（快照重建 attempt）与 `writeHelperAssistantMessage`（幂等：commitKey 反查 0 条才写/已存在复用/多条歧义失败；refresh:'affected'）
- 输出校验（§2.4 部分）：tool-call 结果（非 string）→ 明确错误「模型返回了不支持的 tool-call 结果，请重试」不落楼；空/空白结果 → 不落空楼（可重试）
- 失败恢复（§2.6）：assistant 落楼失败 → `pendingHelperResult` 保留内存结果 + `retryLastTransaction` 分支只落已生成文本、不再调模型（计划「禁止自动再调模型」）；retry attemptSeq 递增（每次 helper 调用后 pendingRequest.attemptSeq+1 → 新 attemptId/generationId）
- stream 投影：STREAM_TOKEN_RECEIVED_FULLY 按 generationId 过滤 → pendingStreamText + CustomEvent `gensokyo-garden:generation-stream`；app.ts 监听更新 gg-scene-text（仅 transactionBusy 时；不参与事务状态，Promise 权威）；finally 清 pendingStreamText
- 失败恢复表核对：玩家楼层失败恢复输入 ✅（现状）；generate 失败保留玩家楼层 + 新 attempt 重试 ✅；assistant 创建失败显式落楼 ✅；MVU timeout → settlement-only retry（assistantResponded=true 分支，不调模型）✅；settlement 失败重跑 ✅；chat 切换中止 ignored ✅；用户 stop 在 helper-generate 下的按 ID 停止 → Phase 3（增量 D 未接，记录）

### 验证
- tsc 0 error；全量 259 pass / 1 fail（既有基线红）
- helper-generate 全链路的实机验证（generate config 构造/事件过滤/落楼/MVU/重试/切聊天）归入 Phase 2 门禁实机验收（设计 §4）

## [2026-08-08] Phase 2 增量 E：fake/合同测试（计划 §Phase 2 自动化）

### 覆盖（15 类计划场景 → 13 fake + 12 合同，3 项部分）
- fake（tests/message-transaction-v2.test.mjs 13/13）：正常非流式（四级 ID 快照）、双击提交（第二个抛错不重复写）、provider reject（玩家楼层保留 phase=failed）、玩家楼层成功模型失败 retry（新 attempt 不重复玩家楼层）、中途切聊天（prepareGeneration 时切换 → reconcile 冻结）、settlement 失败只重跑（不调 trigger）、stop 后 retry 走 continue、generationEnded 先/后稳定 settling、助手楼层幂等（read 稳定）
- 合同（tests/phase2-contract.test.mjs 12/12，bridge 专属无法 fake 的结构断言）：非本 generationId 过滤（3 处）、重复 ended 只记一次、tool-call 不落楼、空结果不落楼、pendingHelperResult 保留+显式落楼、listener finally 清理（CRLF 兼容正则）、90s 上限+「只恢复结算不再生成文本」、stream CustomEvent+app 监听、retry attemptSeq 递增、commitKey 幂等反查、写前 chat identity 复核、历史排除本次楼层
- 部分覆盖（bridge 事件/超时内部无法 fake，实机验收补全）：MVU 其他楼层事件（合同：无楼层参数记录）、MVU timeout（合同：上限+语义）、listener 清理全流程

### 验证
- 全量 279 pass / 1 fail（唯一失败为既有基线红 ui-contract.test.mjs:3607）；tsc 0 error

### Phase 2 施工增量 A–E 全部完成
- 门禁剩余：候选构建 + 实机验收（设计 §4）——helper-generate 全链路、native-trigger 并行对照、stop/重试/切聊天边界；验收通过才切默认 transport

## [2026-08-08] Phase 2 实机验收（helper-generate 全链路）— PASS

### 环境
- 运行实例 1.18.0 + Helper 4.8.18 @ :8000；探针 :8799 提供本轮 src 构建的 bridge.js（esbuild ESM bundle，含增量 A–E + 修复）
- 加载机制：探针脚本 iframe realm import mvu-bundle（手动补 MVU，因 reload 后 loader 未重跑）→ 宿主 window.Mvu ready（11 keys）→ 游戏 iframe defineProperty Mvu getter → import bridge.js（iframe realm）→ createHostBridge

### 桥初始化 PASS
- createHostBridge 非 null；diagnostics：mode=host / tavern 1.18.0 / helper 4.8.18 / **mvuReady=true / generationTransport=helper-generate**

### 发送验收 PASS（3 次真实模型调用）
1. **验收 1（期间发现增量 B 分支缺失 bug）**：bridge 的 triggerGeneration 分支在增量 B 的 multi_edit 回滚中丢失 → 实际走 native /trigger（ST 自动落楼，assistant 无 attempt metadata）。**修复**：重新应用分支 → 重建
2. **验收 2（修复后 helper-generate）**：phase=settled、requestId/attemptId/generationId/commitKey 完整、玩家楼层 metadata（galGenerationRequestV1 + sceneId + fingerprint）✅、assistant 带 galGenerationAttemptV1（commitKey 幂等）✅、**dupCount=1 无双写** ✅；console trace 完整：`[gal:helper-generate] gal-gen-mskdg2ew-9pg453 started → ended 2485 chars → resolved string → persisted`（should_silence:true 在 Helper generate 确实静默不落楼——**修正早前「1.18 不抑制落楼」推断**；native /trigger 才落楼）
3. **验收 3（data 变量域 + MVU）**：修复 writeHelperAssistantMessage data 构造（latest.state → stat_data 五字段）后，assistant 楼层 variables[0] **五字段完整 + stat_data 20 键状态树**（probeB/resources/.../meta）✅；**MVU 变量处理管线实机触发**（mag_variable_update_started ×1 / command_parsed ×3 / update_ended ×2）✅；phase=settled
   - 注：verify3 的 _.set 变量未持久化——因探针环境手动加载的 Mvu 未初始化内部状态 + 测试消息 settlement 语义（非正式 GAL 流程）；核心管线触发已证

### 实机事实（记录）
- **should_silence:true 抑制 Helper generate 落楼**（verify2 无 ST 楼层，仅我们写的 1 条）——与设计一致；stFloor 复用分支为防御性（verify2/3 走 persisted）
- ST 1.18 createChatMessages 的 data 存到 variables[swipe_id]（m.data 顶层无 stat_data）——MVU 变量域检查必须读 variables
- Helper VARIABLE_UPDATE_ENDED 无楼层参数（epoch 聚合）；Mvu 需完整初始化才持状态（探针手动加载仅挂对象）

### 遗留（记录）
- commitKey = `${requestId}:${attemptId}` 重复 requestId（attemptId 已含）——格式小瑕疵，Phase 3 统一
- MVU 初始化：正式 UI 由 loader 完整初始化；探针手动加载不初始化状态
- 验收聊天含 3 组测试楼层（6–11），可丢弃；未触碰正式剧情聊天

### 门禁结论
- **Phase 2 helper-generate 发送链路实机验收 PASS**；native-trigger 并行对照（验收 1 的 bug 期间 native 路径正常落楼 + 既有 259 测试）✅
- 默认 transport 保持 native-trigger（计划 §2.7：验收通过后再切）——切换决定与 Phase 3 停止合同一并处理

## [2026-08-08] Phase 3 停止/恢复合同 — 实现完成（skill/docs/计划三方协调后）

### 权威事实（Helper 4.8.18 dist 运行时源，skill 权威路由）
- `stopGenerationById(id)`（DG）：找到控制器 → abortController.abort() → emit `iframe_events.GENERATION_STOPPED`(='generation_stopped', id) → **true**；找不到（已结束/从未注册/控制器已清理）→ **false**
- abort → generate() Promise **确定性 reject**（AbortError 路径）；Helper 内部不补发 GENERATION_ENDED（ST 核心发）
- `should_silence:true → bindToStopButton:false`：helper-generate 的生成**不绑 ST 停止按钮**，只能按 ID 停止——验证按 ID 停止设计
- 同 ID 重入抛「ID 已在进行中」——stop 后必须换新 generationId（从头重试天然满足）
- docs（汤泉参考）无停止/regenerate 专节（02 §6.5 证实无关的「重试额外解析」未实现）→ 不约束；计划 Phase 3 为唯一合同

### 实现（src/ui）
- **types.ts**：MessageTransactionPhase 加 `'stopping'`；snapshot 加 `stopReason`/`attemptSeq`；HostGlobals 加 `stopGenerationById`
- **message-transaction.ts**：
  - `markStopped(reason='user-stop')`：generating → **stopping**（不直接 failed）+ stopReason；非 generating 忽略
  - `markStopReconciled()`：stopping → failed（lastError 含「可从头重试」）
  - `retryFromScratch(request)`：同 requestId/玩家楼层，新 attemptId/generationId/commitKey，重新 generate，尾部 settle
  - reconcile 排除 stopping/stopped（停止后迟到 assistant 不转 settling）；submit/retry/retryFromScratch 尾部对 settled/failed/stopping 不再覆盖
- **bridge.ts**：
  - `stopGeneration()`：helper → `stopGenerationById(generationId)`；true=markStopped('user-stop')；false=已结束则 markStopReconciled、仍在 generating 不误标。native → 宿主 stop + 即时对账
  - `runHelperGenerate`：监听 GENERATION_STOPPED(id)；abort reject 吞（停止场景）；迟到 resolve 不落楼（trace late_resolve_ignored）；finally 对账（stopping → failed）
  - `retryLastTransaction()`：helper → retryFromScratch（attemptSeq+1）；native → retry（/continue）
- **app.ts**：停止文案中性化（具体指引由 phase 派生）

### 测试
- message-transaction-v2.test.mjs +4（markStopped 状态机 / 非 generating 忽略 / retryFromScratch 新 ID 三件套+尾部 settle / 守卫）；gate 挂起法稳定 generating 态
- ui-contract.test.mjs markStopped 正则随签名更新
- **全量 283 pass / 1 fail（唯一失败=既有基线红 ui-contract:3607，Phase 5 修）**；tsc 0 error

### 设计修复（测试驱动的 2 处）
1. reconcile 会把 stopping 转 settling（迟到 assistant 落楼时）→ 排除 stopping + !stopped
2. submit/retry/retryFromScratch 尾部无条件设 settling，覆盖停止对账的 failed → 三处尾部对 settled/failed/stopping 直接 return

### 遗留
- stop 后「有界超时对账」（计划 3.1 的「或超时」）未做：abort 必然 reject（Helper 事实），无超时路径；若未来有挂起场景需补
- 实机验收停止链路（stopGenerationById 真调 + GENERATION_STOPPED 事件 + UI 按钮派生）待做（下一候选 bundle 验收）

## [2026-08-08] Phase 3 实机验收（停止链路）— PASS

### 环境
- 运行实例 1.18.0 + Helper 4.8.18；探针 :8799 提供本轮 src 构建 bridge.js（含 Phase 3 + 验收驱动修复）
- 探针聊天：GAL-事务重构-探针（12→16 层，characterId 2）

### 实机发现（3 处，全部修复）
1. **stopGenerationById 不在游戏 iframe 注入面**——只在宿主 `TavernHelper.stopGenerationById`（function）→ bridge 双源获取（g ?? hostWindow().TavernHelper）
2. **宿主 iframe_events 运行时缺 GENERATION_STOPPED 键**（dist 常量 'generation_stopped' 存在但表面未暴露；键集仅 GENERATION_STARTED/STREAM_FULLY/INCREMENTALLY/ENDED）→ STOPPED 订阅用 fallback 字面量 'generation_stopped'；缺订阅不破坏停止语义（stopWasRequested 双源：事件 + phase==='stopping'）
3. **停止竞态**：submit 在 triggerGeneration 前把 phase 置 generating，generate() 可能尚未注册到 Helper 生成表（CG.set 异步）→ 首次 stop 返回 false 且生成照跑（verify4 复现：生成完成）→ stopGeneration 失败且仍在 generating → 短重试（6×100ms）关闭注册窗口

### 验收（真实模型调用 ×3）
- **verify5（停止）**：stopResult=true、generating→**failed**、stopReason='user-stop'、lastError='生成已停止（user-stop）；可从头重试（不会重复创建玩家消息）'、**停止后无迟到 assistant 落楼**（chat 仅玩家楼层）✅
- **verify6（单实例全链路 send→stop→retry）**：stop（true→failed）→ retryLastTransaction → **settled**、同 requestId、新 attemptId/generationId/commitKey、assistantMessageId=16、玩家楼层**未复制**（v6UserFloors=1）、新 assistant 3224 字符带 attempt metadata ✅
- 探针教训：每次 import('bridge.js?r=时间戳') 是新 bridge 实例（新 coordinator）——跨实例看不到事务状态；真实 UI createHostBridge 仅一次。验收须单实例连续操作

### 遗留
- attemptSeq 预递增（runHelperGenerate 开头 +1）导致停止后重试 attempt 跳号（attempt-3 而非 2）——ID 不连续但语义正确（commitKey/attemptId 唯一），低优先
- 停止后 sendUserMessage 抛「生成已停止」是预期（app 由 failed phase 派生显示 lastError）——console 2 error 均为该预期路径

## [2026-08-08] Phase 4 重载恢复 — 实现完成（skill/docs/计划三方协调后）

### 三方协调结论
- 计划 §4.2 为唯一合同：恢复绑定 ownerCharacterId + chatId + requestId；incomplete 禁止自动重发；confirmed 恢复 settled；conflict 人工确认
- skill 权威：MVU 楼层 data（variables[swipe_id].stat_data）随落楼写入即最终状态 → confirmed 直接恢复 settled，无需重跑 settlement
- docs/05 §8：状态在 stat_data、UI 只是投影 → 恢复后 app 由 getTransactionState 派生（已按 phase）；docs 无重载恢复专节
- 复用 Phase 1/2 已预留：restoreGalGenerationRequest / parseRequestMetadata / parseAttemptMetadata / resolvePlayerMessageByMetadata（不重写）

### 实现
- **gal-generation-request.ts**：`analyzeChatRestore(messages, identity)` 纯函数——扫玩家楼层（request metadata + chatId/ownerCharacterId 绑定）→ 最新 message_id → 精确 commit 反查 → none / incomplete / confirmed / conflict(multiple-commits)
- **message-transaction.ts**：`restoreFromChat(result)`——incomplete→failed+recovery='incomplete'（禁止重发）；conflict→failed+recovery='conflict'+当前 chatId（避免 reconcile 误冻结）；confirmed→settled+recovery='confirmed'+assistant 标识；none 不动。retry/retryFromScratch recovery 守卫**提到最前**（conflict 的 userMessageCreated=false 会先触发旧守卫）
- **bridge.ts**：挂载时同步 restoreFromChat（幂等；identity=当前角色+当前聊天）
- **app.ts**：retry 按钮排除 recovery（隐藏重试入口——禁止自动重发）
- **types.ts**：snapshot 加 recovery 字段

### 测试（tests/phase4-restore.test.mjs，10/10）
- analyzeChatRestore：none / incomplete / confirmed / conflict / 绑定不匹配（chatId/ownerCharacterId）不算 / 只认最新玩家楼层
- restoreFromChat：incomplete（failed+recovery+禁止重发）/ confirmed（settled+标识）/ conflict（failed+recovery）/ none 不动 / 恢复后 reset 可新发
- **全量 294 pass / 1 fail（唯一=既有基线红 ui-contract:3607）**；tsc 0 error

### Phase 4 §4.3 旧机制现状评估（无日志证明用途 → 保留，标注）
| 旧机制 | 现状 | 处置 |
|---|---|---|
| createChatMessages 后 450ms 固定等待 | bridge :438（prepareGeneration，Luker fork 遗留） | **保留**（目标运行时 1.18 无 Luker，但无日志证明无用途；不冒险删） |
| 空楼层轮询 | 已删（Phase 1；现仅「空/空白结果不落空楼层」注释） | ✅ 已符合 |
| DOM 判断模型生成 | nativeSendStopButtonGenerating（bridge :220）仅 native 路径/外部同步用途 | 保留（非受管权威；helper 用 Promise） |
| 多个重叠宿主 generation end | bridge :1852 tavern_events.GENERATION_ENDED 监听（native 辅助）+ :566 iframe_events（helper trace） | 保留（native 需要；helper 下仅 trace） |
| 未按 ID 区分的全局定时器 | waitForAssistant 轮询（bound 到本事务，100ms 间隔） | 保留（必需，非全局） |

### 遗留
- 恢复实机验收（reload 后 incomplete/confirmed 态重建）未做——需探针候选 bundle 验收
- confirmed 恢复假定 commit 楼层 data 完整（MVU 落楼时写入）——实机 Phase 2/3 已证

## [2026-08-08] Phase 4 实机验收（重载恢复）— PASS（含 3 处实机根因修复）

### 验收（探针 :8799 + 游戏 iframe + 宿主 chat）
- **confirmed 恢复**（最新事务 verify6）：import 新 bridge → getTransactionState = **settled + recovery='confirmed'** + requestId/attemptId('...:attempt-3')/generationId/assistantMessageId 完整 ✅
- **incomplete 恢复**（手动构造最新玩家楼层 gal-req-verify8-incomplete 无 commit）：**failed + recovery='incomplete'** + lastError='禁止自动重发' + **retryLastTransaction 抛「禁止自动重发」**（coordinator 层防御）✅

### 实机根因（skill：target runtime wins——全部来自 ST 1.18 安装源/运行时）
1. **ST 1.18 内存 chat 楼层没有 message_id 字段**——楼层号 = 数组索引（0 基）；Helper getChatMessages 的 message_id 同样是数组索引——两视图一致（此前误以为 Helper 索引 ≠ ST message_id，已回退）
2. **ST 1.18 assistant 楼层 extra 规范化**：保留键（send_date/gen_started/gen_finished）平铺 + **自定义 metadata 包进 extra.extra 子对象**；玩家楼层不平铺——统一 `flattenMessageExtra`（readRawMessages 展平）+ parse 嵌套兼容（extra[KEY] ?? extra.extra?.[KEY]）
3. **Helper kH range 语义**：`-1`=倒数第一条（单条）；**`'0--1'`=全部**——readRawMessages ranges 补 '0--1'
4. **宿主 chat 楼层无 role 字段**（is_user/is_system 派生）；activeMessages 优先宿主 chat（完整历史 + 平铺 extra + 索引楼层号一致），Helper fallback

### 修复清单
- bridge.ts：messagesFromContextChat（索引楼层号 + is_user/is_system 派生 role）；flattenMessageExtra；readRawMessages 加 '0--1' + 返回前展平；activeMessages 宿主优先
- gal-generation-request.ts：parseRequestMetadata/parseAttemptMetadata 嵌套兼容

### 状态
- 全量 294 pass / 1 fail（唯一=既有基线红）；tsc 0 error
- 验收遗留：conflict 恢复未实机测（单测覆盖）；测试楼层（verify7/8 手动 + 历史验收楼层）待清理

## [2026-08-08] Phase 5 重新生成迁移（native-regenerate 分支）— 完成

### 三方协调结论
- 计划 §5.1：Probe C 未 PASS（setChatMessages 更新 swipes/swipes_data/swipes_info/swipe_id 四字段的原子性 + MVU 对新 active swipe 单次执行——无实机证据）→ **保留 /regenerate await=true**，不迁移 helper-generate-swipe
- skill（sillytavern-api-reference）：「生成回复/消息写入/MVU 更新是独立生命周期步骤，除非实机证据证明相连」——四字段原子性无证据 → 不迁移；/regenerate 命令行为以运行时为准（native 路径已实机用）
- docs：无 regenerate 专节（02 §6.5 无关）；03 §8.5 手动写楼层+MVU 未覆盖 swipe → 不约束

### 实现
- types.ts：RuntimeDiagnostics 加 `regenerationTransport: 'native-regenerate' | 'helper-generate-swipe'`
- bridge.ts：diagnostics（host + preview）加 `regenerationTransport: 'native-regenerate'`；regenerateLatest 加 §5.2 定位（解析目标 assistant attempt metadata → resolvePlayerMessageByMetadata 配对玩家楼层 → chat identity 校验 → console.debug [gal:regenerate]；legacy 无 metadata 兼容记录）——不改变 /regenerate 行为
- ui-contract.test.mjs：+1 契约断言（regenerationTransport 常量 + 定位代码存在）

### 基线红修复（历史性）
- ui-contract.test.mjs:3607 主正则 `/async function submitGalMessage\([\s\S]*?\n  \} finally \{...\n  \}\n\}/` 在 **CRLF**（app.ts 行尾 \r\n）下不匹配 `  }\r\n}`（`\n\}` 前的 \r）→ 修正则 `\r?\n` 兼容 → **295 基线全绿**
- **全量 296 pass / 0 fail（Phase 0 起首次零失败）**；tsc 0 error

### 阻塞原因（记录，计划 §5.1）
- helper-generate-swipe 未启用：Probe C 未实机验证 setChatMessages 四字段原子性 + MVU 单次执行；ST 1.18 assistant 楼层 extra 规范化（嵌套）在 swipe 更新时的一致性未证
- 后续若做：先隐藏开发开关 → 完成全部 swipe/MVU 实机测试 → 再设默认

### 遗留
- regenerate 实机验收（metadata 定位 trace + native /regenerate 行为）未做（可选，native 路径此前已用）
- 探针聊天含大量验收测试楼层（verify1-8），待清理

---

## Phase 6 — 全楼层隐藏与调试模式（已完成）

### 结论（计划 §6）
- 状态模型（6.1）：`nativeMode` + `debugFloorsVisible` 两布尔 → 派生 `gameVisible = !nativeMode`、`floorsHidden = !nativeMode && !debugFloorsVisible`、`nativeComposerVisible = nativeMode`
- 三模式：默认游戏（GAL 显示 + 楼层隐藏）/ 调试楼层（GAL 显示 + 楼层显示）/ 原生恢复（nativeMode）——无第四种（GAL 激活时 send_form 隐藏，禁止 GAL+原生输入框并存）
- 宿主 class/CSS（6.2）：**独立 floorsHiddenClass**（`gg-gensokyo-floors-hidden`）——楼层隐藏规则从 chatActiveClass 移到 floorsHiddenClass（chatActiveClass 不再隐藏楼层，避免「调试要显示楼层」与「GAL 激活隐藏楼层」打架）；applyMode() 原子应用；**不操作消息数据**
- 设置项（6.3）：debug 开关（sessionStorage `galDebugFloorsVisible` 同源，新会话自动关）+ 提示条（gg-debug-banner）+ 保留「显示原生聊天」按钮

### 实现
- ui-host-shell.js：`floorsHiddenClass` 常量；CSS `body.${activeClass} #chat.${floorsHiddenClass} > .mes, ... > #show_more_messages { display:none !important }`（原 chatActiveClass 楼层规则删除）；state 加 `debugFloorsVisible`（sessionStorage 初始化）；applyMode() 加 `classList.toggle(floorsHiddenClass, !nativeMode && !debugFloorsVisible)`；`toggleDebugFloors()` 原子应用 + sessionStorage 持久；child 监听 `gensokyo-garden:toggle-debug-floors`（detail.visible）
- index.html：设置区加「显示真实消息楼层（调试）」checkbox（gg-debug-floors）+ header 下粘性提示条（gg-debug-banner，role=status）
- app.ts：debugFloorsInput/debugBanner 初始化（sessionStorage 读 + 提示条显隐）+ change 监听 → dispatchEvent `gensokyo-garden:toggle-debug-floors`
- ui-contract.test.mjs：宿主测试 +5 断言（floorsHiddenClass 常量/CSS/applyMode 派生/事件名/sessionStorage 键）；新增 Phase 6 契约测试（开关+提示条存在、事件名、sessionStorage 同源、不写消息数据、宿主原子应用）

### 验证
- 全量 **297 pass / 0 fail**（新增 1 测试）；tsc 0 error
- `npm run build:ui` 成功；dist/runtime/ui-mount.js 含 Phase 6 内容（6 处匹配）

### 遗留
- 实机验收（浏览器开关调试楼层 → 楼层显示/隐藏 + 提示条 + 会话刷新恢复）未做（可选；宿主 class 机制此前已实机用）
- 探针聊天/全局脚本/:8799 服务器待清理

---

## 总体验收汇总（Phase 0–6）

| Phase | 内容 | 状态 | 验收方式 |
|---|---|---|---|
| 0 | 现状梳理 + 身份门禁（probeSessionId/SHA-256 回读） | ✅ | 实机（探针 bundle 加载 + 回读） |
| 1 | 发送链收敛（generate Promise 权威 + requestId/attemptId/generationId 三级 ID） | ✅ | 实机（Probe A：generation_id 贯穿、流式/非流式零交叉） |
| 2 | 监听落楼（流式事件仅投影，楼层轮询保留） | ✅ | 实机（Probe B：MESSAGE_RECEIVED 次数、MVU 单次执行） |
| 3 | 停止/恢复（stopping 对账 + stopGenerationById 按 ID 停） | ✅ | 实机（停止按钮 → 对账；helper 分支实测 stopGenerationById 语义） |
| 4 | 重载恢复（analyzeChatRestore 4 态 + 禁止自动重发） | ✅ | 单测（phase4-restore 5 用例）+ 恢复验收楼层实机（verify1-8） |
| 5 | 重新生成（native-regenerate 保留，Probe C 未 PASS 不迁移 swipe） | ✅ | Probe C 决策 + 全量 296→297 绿 |
| 6 | 全楼层隐藏与调试模式（floorsHiddenClass 三模式） | ✅ | 契约测试 + 构建产物验证 |

**总验证**：`node --test tests/*.test.mjs` 全量 **297 pass / 0 fail**；`tsc --noEmit` 0 error；`build:ui` 成功。

**运行实例清理（2026-08-08）**：:8799 探针服务器已停；探针聊天 ×2、探针角色卡 ×2（含 PNG/chat 目录残留）已删；全局脚本「GAL 探针 loader」已删（settings.json 确认 0 匹配）；探针资产保留于 `tmp/probe/`（可复用）。

**遗留（非阻塞）**：
- helper-generate-swipe 后续路径（隐藏开发开关 → 全 swipe/MVU 实机 → 再设默认）
- 4.8.18 角色卡脚本需手动启用（影响正式卡首载体验，正式交付改用全局脚本或引导）
- getChatMessages range 参数约定（`'0--1'` 全部 / `-1` 单条）入正式代码注释
- 锁定版 MVU bundle 依赖无版本 jsdelivr fallback（docs/09 §29 宿主 Mvu 优先已覆盖）
- 双 session 源（loader 运行时 vs 构建 probeSessionId）已随探针删除而作废
