# 运行 API 来源记录（0.2.0）

## GAL 真实玩家楼层与双重格式约束（2026-08-10，静态核验）

目标运行时固定为 SillyTavern `1.18.0` + JS-Slash-Runner / Tavern Helper `4.8.18`。本节只记录目标版本声明和源码逻辑，未运行探针，也不把静态检查声称为真实宿主最终 prompt 观察。

- `symbol: generate(config.injects)`；surface: Tavern Helper；provenance: `F:/agent airp/SillyTavern/public/scripts/extensions/third-party/JS-Slash-Runner/@types/function/generate.d.ts`；confidence: high（目标版本声明）；runtime_check: 未执行。
- `createChatMessages(messages,{insert_before:'end',refresh:'none'})` 来自目标 Helper 的 `@types/function/chat_message.d.ts`。项目用它创建 `role:'user' / is_hidden:false` 的真实楼层；楼层正文包含玩家原文、正文协议、在场快照、场景事实和道具授权。静态源码确认调用形状；真实宿主持久化与重载后保真仍待实机复读。
- `InjectionPrompt` 精确字段来自同安装的 `src/function/inject.ts`：`position:'in_chat' | 'none'`、`depth:number`、`role:'system'|'assistant'|'user'`、`content:string`、`should_scan?:boolean`。`gal-prompt.v6` 只保留不可见路由胶囊 `{position:'none',depth:0,role:'system',should_scan:true}`，不携带格式或动态事实。
- `overrides.chat_history.prompts` 与 `with_depth_entries` 来自目标版本 `generate.d.ts`；项目继续只传一条冻结 synthetic system history，并固定 `with_depth_entries:false`，不恢复 SillyTavern 原生旧聊天历史。
- 新请求冻结为 `gal-prompt.v7`；`modelUserInput` 与写入并复读的真实玩家楼层正文逐字一致，并携带 bridge 冻结的额外变量任务投影，普通互动、异变收束和决斗胜利三类入口均在 `generate()` 前失败闭合校验。设施现状与角色剧情梗概合并为唯一冻结 system history，经 `overrides.chat_history.prompts` 发送，不进入玩家原话。酒馆原生 Chat Completion 不再订阅 `CHAT_COMPLETION_PROMPT_READY` 改写最终 user 消息；`GENERATION_AFTER_COMMANDS` 只保留世界书扫描路由，不承担格式。正文格式由常驻 `[mvu_plot]` GAL 世界书完整定义并提供一份正确示范。旧 `gal-prompt.v1/v2/v3/v4/v5/v6` metadata 继续按各自原配置恢复，不在恢复时升级。
- 依赖分类：Tavern Helper `generate`/`injects` 为 `host_required`；请求构造器、metadata 和 UI bridge 为随卡/远程 UI 交付的项目运行代码；本专项没有新增远程依赖或玩家安装项。
- 源码证据：Helper `dataProcessor.ts` 在世界书扫描前注册自定义 inject；SillyTavern `checkWorldInfo()` 只把 `scan:true` 的 extension prompt 加入扫描缓冲。v5 不再依赖最终 prompt 事件修改 user 内容。静态置信度高；真实楼层保存、世界书最终可见性和模型格式服从率仍待实机观察。

## 第六批 MVU 存档／读档静态 API 裁定（2026-08-09）

目标源码固定为 SillyTavern `1.18.0`、JS-Slash-Runner / Tavern Helper `4.8.18` 与当前 MagVarUpdate 源码；本节只记录声明和代码逻辑证据，**未运行探针，也不声明真实宿主时序 PASS**。

- `@types/function/chat_message.d.ts`：`getChatMessages(range,{include_swipes:false,hide_state:'all'})` 读取活动页；`deleteChatMessages(ids,{refresh:'none'})` 删除指定楼层；`createChatMessages(messages,{insert_before:'end',refresh:'none'})` 按序追加并接受楼层 `data`。
- `@types/function/worldbook.d.ts`：`getOrCreateChatWorldbook('current')` 返回当前聊天绑定世界书；`getWorldbook(name)` 读取条目；`updateWorldbookWith(name,updater)` 用一次 updater 替换同槽条目并保留其他条目。生产壳优先使用 iframe 平铺函数，缺失时从 `TavernHelper` 门面补齐。
- `@types/iframe/exported.sillytavern.d.ts`：`SillyTavern.reloadCurrentChat(): Promise<void>`；Bridge 同时兼容平铺 `reloadCurrentChat`，但不把“声明存在”写成刷新时序已验收。
- 2026-08-10 实机回归勘误：Helper 4.8.18 的 chat-scope 对应 `chat_metadata.variables`，message-scope 对应 `chat[message_id].variables[swipe_id]`，二者不会自动同步。存档合并快照必须拆分恢复：移除 `stat_data` 后的会话变量写入 `{type:'chat'}`，正式 `stat_data` 合并进重建后最后一个 assistant 并写入 `{type:'message',message_id}`；成功与自动回滚共用该路径。旧“完整 MvuData 只写 chat-scope、无需 assistant 状态锚点”裁定作废。
- 静态回归：schema/codec/capture 5 项、世界书仓库 4 项、恢复事务 8 项、UI/Bridge 合同 1 项；全量 696/696 PASS。读取时会再次白名单化楼层字段；删除、首/末创建批、MVU 写入与 reload 失败的 fake-host 路径均恢复读档前消息和 MVU。

真实宿主仍须核对：读档后目标 assistant 的 message-scope `stat_data` 连续稳定、教程步骤不再抖动、刷新后状态保持，并能继续完成下一回合；静态分 scope fake 不能替代这些时序证据。

## GAL 事务状态机（Probe A/B/C 与 Phase 0–6 实机证据）

目标运行时：SillyTavern `1.18.0` + JS-Slash-Runner / Tavern Helper `4.8.18`（`F:/agent airp/SillyTavern`，运行实例）。GAL 事务接口疑点以**实机探针**裁定，当前行为合同见 `project/contract.md`；探针卡以 `chara_card_v2` 包装 + 全局脚本注入（4.8.18 角色卡脚本需手动启用，全局脚本自动跑）。

### Probe A — `generate()` 权威与 generation_id 贯穿（Phase 0 疑点裁定）

- `generate.d.ts` 未声明 `generation_id`，但**运行时接受该参数并原样贯穿事件**；`GENERATION_STARTED(id)`、`STREAM_TOKEN_RECEIVED_FULLY/INCREMENTALLY(text,id)`、`GENERATION_ENDED(text,id)` 均携带同一 id。
- 实测：非流式 resolve 19870ms/2646 字（id `gal-probe-mskb328w`）；流式 resolve 21897ms/3024 字（id `gal-probe-mskb3unj`）；两批事件零交叉 → **按 ID 过滤设计成立，Promise 为唯一权威，流式事件仅投影**。
- dryRun 只发 STARTED 不发 ENDED（d.ts 声明语义：无生成无 ENDED）。

### Probe B — 手动写楼层触发 MVU（send 迁移可行性）

- `createChatMessages([...], { refresh: 'affected' })` → `MESSAGE_RECEIVED` 恰好 1 次（参数 = insertAt）；`refresh: 'none'` → 0 次。
- 带 `data`（stat_data）的楼层 → `VARIABLE_UPDATE_STARTED` → `SINGLE_VARIABLE_UPDATED("probeB.测试计数"→0)` → `VARIABLE_UPDATE_ENDED`；`<UpdateVariable>_.set('probeB.测试计数',0,1)` 变量 0→1 生效 → **send 迁移可行，不强制保留 `/trigger`**。
- MVU 加载必须发生在 tavern_helper 脚本 iframe 真实 realm（宿主/错误环境 realm `import` 抛 `TypeError: Expected a function`，因 `debounce(SillyTavern.saveChat,1e3)` 解析到宿主精简全局）；成功后 `Mvu` 挂宿主 `window.Mvu`。

### Probe C — swipe 四字段迁移（Phase 5 决策依据）

- `setChatMessages` = `async function MH(e,{refresh:'affected'}={})`，按 message_id 分组合并、写 swipes/swipes_data/swipes_info/swipe_id；`getChatMessages` 必须传 range（无参崩 `Cannot read properties of undefined` @ Helper index.js:191:20601）。
- **结论：Probe C 未 PASS**（setChatMessages 更新 swipes/swipes_data/swipes_info/swipe_id 四字段的原子性 + MVU 对新 active swipe 单次执行——无实机证据）→ 保留 native `/regenerate await=true`，不迁移 helper-generate-swipe。

### Phase 3 停止/恢复（helper-generate 传输分支）

- `stopGenerationById(id)` 存在；内部通过 abort 信号 → `generate()` Promise **reject**；同时发 `GENERATION_STOPPED(id)`，`CG.delete` 在 finally；迟到 resolve 被吞（不落楼）。
- 实机：`stopGenerationById` 返回 falsy 当且仅当控制器未注册/已清理——事务层据此对账（`phase:'stopping'` → `failed`），不误标。
- `getChatMessages` range 语义（Helper `kH`）：`-1` = 单条（最后一条）；`'0--1'` = 全部；负数从尾部倒数。**ST 1.18 把自定义 extra 包进 `swipe_info[i].extra` 子对象**（Helper 视图 `extraKeys = [send_date, gen_started, gen_finished, extra]`），metadata 解析需兼容嵌套（`extra.KEY ?? extra.extra?.KEY`）。

### Helper 4.8.18 全局暴露清单（运行实例实测）

`createChatMessages / setChatMessages / getChatMessages / iframe_events / tavern_events / triggerSlash / generate / eventOn / getScriptTrees / updateScriptTreesWith / stopGenerationById / importRawCharacter`。

### 第三批重生成 O01～O04 静态裁定（本轮未运行探针）

- 目标源码：`F:/agent airp/SillyTavern/public/scripts/extensions/third-party/JS-Slash-Runner`，manifest `4.8.18`。
- O01：`src/function/generate/index.ts` 的 `generate(config)` 经 `fromGenerateConfig → iframeGenerate → generateResponse` 返回候选结果；该调用链源码中不含聊天楼层写入，且 `generation_id` 可交给 `stopGenerationById`。置信度：**目标版本静态源码高；真实宿主时序未验收**。
- O02：`@types/iframe/exported.mvu.d.ts` 声明 `Mvu.parseMessage(message, old_data): Promise<MvuData>`。生产 adapter 只传入 `structuredClone(frozenBaseline)`，再 clone 返回值；parser reject 时 coordinator 不写 swipe。置信度：**签名高；无真实宿主副作用证明**。
- O03：`src/function/chat_message.ts:setChatMessages` 的 swipe 分支在同一次 `modify` 中规范化并写 `swipes / variables(swipes_data) / swipe_info(swipes_info) / swipe_id / mes / extra`，之后才执行 `refreshMessages(refreshOneMessage)`。本项目 payload 为 `{message_id, swipe_id, swipes, swipes_data, swipes_info}` + `{refresh:'affected'}`；写前 CAS 与写后 all-swipes/active/MVU 三视图复读由项目代码负责。置信度：**静态源码高；刷新时序未做实机验收**。
- O04：新结算 V2 swipe 在 MvuData 内嵌 `gal_regeneration_receipt_v1`；无 receipt 的旧 V2 swipe直接拒绝，不补猜；receipt 与 active data hash 不同视为 post-settlement drift，禁止静默回档。
- 默认开关：`native-regenerate`。只有显式 `__GAL_REGENERATION_TRANSPORT__='helper-generate-swipe'` 才进入新事务；进入后不自动回退 `/regenerate`。


## R34 后事件精确投影与世界书证据门

2026-07-25 的维护源优化没有引入新的宿主 API：事件定义由 UI bundle 内导入并严格校验，行动消息只注入当前 `event_id` 的受控投影；打包器不再把整份 `greenhouse-vertical-slice.json` 作为通用关键词世界书条目。`character_book.recursive_scanning` 仍为 `false`，但角色条目是否因姓名、宿主扫描设置或扩展行为被意外激活，必须以真实目标环境的最终提示/激活条目证据为准。

本次通过 Codex 应用内浏览器只读访问 `http://127.0.0.1:8001/`，确认 SillyTavern 服务可达；探测时没有选中角色、聊天或角色主世界书，页面上下文也未暴露 Tavern Helper / MVU。因此该结果只证明服务可达，不能证明 O4 世界书激活边界。R37 完成前必须使用包含本优化的精确新候选卡、新聊天及目标版本设置重做审计；不得导入或覆盖 R34 来补做该证据。

## r23 双请求结算与宿主转发

目标安装仍为 SillyTavern `1.18.0`（`8172dcd0`）、Tavern Helper `4.8.19`。受控选项先通过 `/trigger await=true` 使用当前加载预设生成可见剧情；生成结束后，再调用 Tavern Helper `generate`，显式传入 `preset_name: 'in_use'`、`should_silence: true` 与白名单 `json_schema`，把结果解析为本地确定性结算枚举。第二次请求不直接写 MVU；`event-settlement.ts` 根据请求前状态和白名单结果计算新状态，再用 `Mvu.replaceMvuData` 写入同一个真实 assistant 楼层并复读校验。

精确声明来自 `public/scripts/extensions/third-party/JS-Slash-Runner/@types/function/generate.d.ts` 与 `@types/iframe/exported.mvu.d.ts`。r23 同时修复宿主壳转发遗漏：`ui-host-shell.js` 现在把 `generate` 与旧桥接函数一起暴露给游戏 iframe；静态契约测试明确锁定该转发项。

运行边界：目标酒馆已导入并回读 R23 卡、16 条世界书与主世界书链接。Codex 应用内浏览器的独立会话没有执行角色脚本，因此不能用它证明 Tavern Helper 壳挂载；最终人工验收应在用户原有、已授权角色脚本的酒馆浏览器中进行。

## r20 温室可信战斗结算与目标运行时

目标安装为 `D:\json脚本地下城\主体\SillyTavern`：SillyTavern `1.18.0`（commit `8172dcd0`）、JS-Slash-Runner / Tavern Helper `4.8.19`、ST-Prompt-Template `1.17.4.3`。本轮精确接口以该安装内声明为准：

| 能力 | 采用接口 | 本机依据 | r20 用法与证据 |
|---|---|---|---|
| 精确读取消息层 MVU | `Mvu.getMvuData({ type: 'message', message_id })` | `public/scripts/extensions/third-party/JS-Slash-Runner/@types/iframe/exported.mvu.d.ts` | 从最新一份具有正式 `stat_data` 的 assistant 楼层取状态；真实宿主诊断显示 MVU 已就绪 |
| 完整替换同一消息层 MVU | `await Mvu.replaceMvuData(mvu_data, options)` | 同上 | 本地校验 `config_id`、事件前置、范围、settlement ID 后只写 `battle.current`；写后用同一 message ID 复读，失败不发送战后剧情 |
| 读取当前消息页 | `getChatMessages(range, { include_swipes: false, hide_state: 'all' })` | `@types/function/chat_message.d.ts` | 定位最新 assistant 正式状态；避免 `include_swipes:true` 形状没有 `message` 字段的问题 |
| 创建真实结算楼层 | `createChatMessages(..., { insert_before: 'end', refresh: 'none' })` 后 `/trigger await=true` | 同上与目标 slash-command 源码 | 可信结果写入成功后创建 `kind=battle` 的真实玩家消息；模型只消费 `battle.current`，不解析正文第二份战果 |
| MVU 更新刷新 | `Mvu.events.VARIABLE_INITIALIZED`、`VARIABLE_UPDATE_ENDED` | `@types/iframe/exported.mvu.d.ts`；其中历史事件值保留声明拼写 `mag_variable_initiailized` | 刷新单壳状态；代码不自行猜测事件字符串 |

运行时证据：R20 卡通过酒馆文件导入 UI 进入目标安装，角色脚本授权后壳版本为 `0.4.0-greenhouse-r20`；诊断复读 `SillyTavern 1.18.0 / Tavern Helper 4.8.19 / MVU ready`。确定性开场在真实 0 层写入并复读成功，真实消息数保持 1，证明没有调用 LLM 初始化。

## r15 GAL 消息事务、续写与 Swipe

目标环境为 `F:\agent airp\Luker`，SillyTavern/Luker `2.7.0 release`，JS-Slash-Runner / Tavern Helper 清单版本 `4.8.18`。r15 只采用本机源码和类型声明已确认的接口：

| 能力 | 采用接口 | 本机依据 | r15 用法 |
|---|---|---|---|
| 创建真实玩家楼层 | `createChatMessages([{ role: 'user', message, is_hidden: false, extra }], { insert_before: 'end', refresh: 'none' })` | `F:\agent airp\Luker\public\scripts\extensions\third-party\JS-Slash-Runner\@types\function\chat_message.d.ts` | 写入动作、回复和离场消息，再单独触发生成；玩家视角仅隐藏楼层 DOM，不隐藏数据 |
| 触发/续写/重生成 | `/trigger await=true`、`/continue await=true`、`/regenerate await=true` | `F:\agent airp\Luker\public\scripts\slash-commands.js` | 首次动作触发一次生成；停止后的重试只续写，不重复创建 user 楼层 |
| 左右 Swipe | `/swipe await=true direction=left`、`/swipe await=true direction=right` | 同上 | GAL 壳提供双向切换，并重新读取当前 assistant 楼层 |
| 读取消息与 Swipe | `getChatMessages(..., { include_swipes: true })` | Tavern Helper `@types\function\chat_message.d.ts` | 从真实 assistant 楼层读取当前 Swipe；旧消息缺少结构块时使用纯文本降级 |
| 生成与聊天事件 | `GENERATION_STARTED`、`GENERATION_STOPPED`、`GENERATION_ENDED`、`MESSAGE_SWIPED`、`CHAT_CHANGED` | `F:\agent airp\Luker\public\scripts\events.js` 与 Tavern Helper `@types\iframe\event.d.ts` | 控制生成态、停止态、Swipe 刷新以及跨聊天/切卡清理 |
| MVU 精确消息层读写 | `Mvu.getMvuData`、`Mvu.replaceMvuData`、`Mvu.events.VARIABLE_UPDATE_ENDED` | Tavern Helper `@types\iframe\exported.mvu.d.ts` | 读取当前状态、确定性开场与兼容修复；GAL 播放等待完整 assistant 楼层和变量更新结束 |
| 额外变量分析状态 | `Mvu.isDuringExtraAnalysis()` | Tavern Helper `@types\iframe\exported.mvu.d.ts`；MagVarUpdate 固定提交 `d1bdfd1efcf99c6f456e01f8f747b24f4b9834fc` | 阻止本地结算在额外模型仍运行时抢写同一 assistant 楼层；最终以 `VARIABLE_UPDATE_ENDED` 为正常完成信号 |

模型展示协议是“可读正文 + `<GensokyoScene>` JSON + MVU 更新块”。结构块最多 6 个 beat、2–4 个建议回复，只接受本地白名单反应标签；图片路径、URL 和 HTML 不由模型决定。结算以 `interaction:<uid>` 写入 `interaction.settled_ids`，重复收尾不得再次扣材料或推进时间。

## r14 宿主生命周期与切卡清理

| 能力 | 采用接口 | 本机依据 | 适用环境 | 置信度 |
|---|---|---|---|---|
| 识别当前角色卡 | `SillyTavern.characterId` | `F:\agent airp\Luker\data\default-user\extensions\third-party\TavernHelper\dist\@types\iframe\exported.sillytavern.d.ts` 将其声明为 `string`，并注明对应宿主 `this_chid` | Luker 2.7.0 release；Tavern Helper 本机清单 4.8.18 | 高，已实机切卡验证 |
| 监听聊天/角色上下文变化 | `eventOn(tavern_events.CHAT_CHANGED, listener)` | `F:\agent airp\Luker\public\scripts\events.js` 定义 `CHAT_CHANGED: 'chat_id_changed'`；Tavern Helper 类型声明监听参数为聊天文件名 | 同上 | 高，已实机直切验证 |
| iframe/脚本卸载清理 | `window.pagehide` | Tavern Helper `dist\@types\iframe\util.d.ts` 的生命周期说明建议在 `pagehide` 中执行销毁与事件清理 | 同上 | 高，已通过重载与重新挂载验证 |

r14 将挂载时的角色 ID 冻结为界面所有者。`CHAT_CHANGED` 触发后若当前角色不再等于该所有者，则立即销毁壳层、样式、返回按钮、观察器和事件订阅；不会尝试在新角色上下文中重新挂载。

## Luker 与酒馆助手

- `createChatMessages([{ role: 'user', message, is_hidden: false, extra }], { insert_before: 'end', refresh: 'none' })`
  - surface: 酒馆助手 / JS-Slash-Runner
  - applies_to: 4.8.19
  - provenance: `D:/json脚本地下城/主体/SillyTavern/public/scripts/extensions/third-party/JS-Slash-Runner/@types/function/chat_message.d.ts`
  - confidence: high（匹配当前安装版本声明）
  - runtime_check: r11 已验证 `refresh:'affected'`；同层重构使用的 `refresh:'none'` 后接 `/trigger` 时序待真实运行验收
- `triggerSlash('/trigger')`、`/regenerate`、`/swipe await=true direction=right`
  - surface: 酒馆助手 + Luker STScript
  - applies_to: 酒馆助手 4.8.19 / SillyTavern 1.18.0
  - provenance: 当前安装的酒馆助手声明与 SillyTavern slash command 源码
  - confidence: high（源码与声明一致）
  - runtime_check: r11 已完成正常开场生成；`refresh:'none'` 组合待验收
- `Mvu.getMvuData({ type: 'message', message_id: 'latest' })`
  - surface: MVU，经酒馆助手导出
  - applies_to: 酒馆助手 4.8.19 声明；本卡加载器固定 MagVarUpdate commit `d1bdfd1`
  - provenance: `@types/iframe/exported.mvu.d.ts` 与 `src/runtime/01-mvu-loader.js`
  - confidence: high（声明匹配，r11 已完成真实楼层读写）
  - runtime_check: 同层壳下的事件时序与 Swipe 仍待新检查点验收
- `Mvu.replaceMvuData(mvu_data, { type: 'message', message_id })`
  - surface: MVU，经酒馆助手导出
  - applies_to: 本机酒馆助手声明 `4.8.18`；运行交接环境曾报告 `4.8.19`；本卡加载器固定 MagVarUpdate commit `d1bdfd1`
  - provenance: `F:/agent airp/Luker/public/scripts/extensions/third-party/JS-Slash-Runner/@types/iframe/exported.mvu.d.ts`
  - confidence: high（目标安装声明明确支持精确消息楼层读取与完整 MvuData 替换）
  - runtime_check: r11/r12 已验证恢复路径的精确 assistant 楼层写入与复读；新“首个 assistant 楼层零生成初始化”仍需 r13 真机验收

## SP·数据库 VII

- global: `AutoCardUpdaterAPI`
- used methods: `queryTableRows`、`insertRow`、`updateRow`
- callback methods observed: `registerTableUpdateCallback`、`unregisterTableUpdateCallback`
- applies_to: 用户指定 `https://gcore.jsdelivr.net/gh/AlbusKen/shujuku@spv8.0/index.js`，脚本头版本 `2.0.0`
- provenance: 2026-07-22 获取的指定脚本；全局装配由 `createSqlApi`、`createTableCrudApi` 后赋值到 `topLevelWindow_ACU.AutoCardUpdaterAPI`
- confidence: high（指定脚本源码）
- runtime_check: Luker 设置中“数据库”脚本存在但 `enabled: false`，因此当前页面无该全局

### B4-O02 精确签名摘录（2026-08-09，从 v2.0.0 脚本源码逐行摘录）

- 获取：`https://gcore.jsdelivr.net/gh/AlbusKen/shujuku@spv8.0/index.js`（Userscript 头 `@version 2.0.0`，脚本共 115581 行）
- 本地只读缓存：`tmp/b4-o02-evidence/sp-db-vii-index.js`，sha256 `edc20e08be1959f3d521add1f50ba9f6375dc3e4ce98dae35e309690648d9d4e`
- 全局装配：`topLevelWindow_ACU.AutoCardUpdaterAPI = api`（行 68908）；`api = Object.assign({}, createCallbackApi(ctx), createCoreDataApi(ctx), createTableCrudApi(ctx), createTableLockApi(ctx), createTemplatePresetApi(ctx), createPlotPresetApi(ctx), createDataAdminApi(ctx), createSettingsConfigApi(ctx), createWorldbookAiApi(ctx), createAgentWorldbookApi(ctx), createSqlApi(ctx))`（行 68901 附近）；`topLevelWindow_ACU` 即最顶层 window realm。
- 表格模型：`currentJsonTableData_ACU` 为 `{ sheet_<key>: { name, content: string[][], sourceData?: { ddl } } }`；`content[0]` 为表头行；`content[rowIndex]` 的 `[0]` 为 `row_id` 自增主键；列名同时接受中文表名/英文表名/列中文名/列英文名（`getNameMapper`/`resolveColumnForSheet`）。

精确映射表：

| 逻辑操作 | 精确 symbol | 参数 | 返回 | 同步/异步 | 版本证据 | 失败形态 | 实现许可 |
|---|---|---|---|---|---|---|---|
| 查询行 | `queryTableRows` | `(options: { sheetKey\|tableName\|table: string, columns?: string[], where?: object, orderBy?\|order?: object, limit?: number（默认100, 上限1000）, offset?: number })` | `{ rows: Array<Record<string, unknown>>, columns: string[], values: unknown[][], sql, limit, offset } \| null` | 同步（内部 executeQuery） | 行 60010；`buildQueryTableRowsSql_ACU` 行 59930；`toPublicSqlQueryResult_ACU` 行 59825；`rowsFromSqlResult_ACU` 行 59818 | 非对象 options 抛错→返回 null；表不存在抛错→返回 null | 仅查询，可安全用于召回候选 |
| 插入行 | `insertRow` | `(tableNameOrOptions: string\|object, data?: object)`；`data` 键为列中文名或英文名，值为 SQL 参数值；可选 `{ skipChatSave, skipNotify }` | `number`（新行 index）\| `-1` | 异步（async） | 行 66760；`parseInsertRowArgs_ACU`；SQLite 分支行 66800 附近 | 表未加载/表不存在/落盘未增行 → 返回 -1 或 false，不抛 | 需 O02 裁定物理表后使用 |
| 更新行 | `updateRow` | `(tableNameOrOptions: string\|object, rowIndex: number, data: object)`；rowIndex>=1（0 为表头不可改）；按 `content[rowIndex][0]` 的 row_id 定位 | `boolean` | 异步（async） | 行 66616；SQLite 分支行 66650 附近；`parseUpdateRowArgs_ACU` | rowIndex<1 / 表不存在 / row_id 缺失 / 0 列 / 落盘 0 行 → false | 需 O02 裁定 row identity 后使用 |
| 导出当前表快照 | `exportTableAsJson` | `()` | `Record<string, { name, content, sourceData? }>`；无数据时 `{}` | 同步 | `createCoreDataApi` 行 66096～66100 | 返回当前内存表对象或空对象 | O02 批准用于把 query 的 `row_id` 安全反查成 `updateRow` 所需数组下标；缺失/歧义即禁写 |
| 注册表更新回调 | `registerTableUpdateCallback` | `(callback: Function)` | `void` | 同步 | 行 65958（`createCallbackApi`） | 非函数或已注册则忽略 | 归档变更通知可选 |
| 注销表更新回调 | `unregisterTableUpdateCallback` | `(callback: Function)` | `void` | 同步 | 行 65965 | 未注册则忽略 | 同上 |

补充证据：

- `queryTableRows` 生成的 SQL 恒为 `SELECT ... FROM <english_table> [WHERE] [ORDER BY] LIMIT ? OFFSET ?`，WHERE 由 `buildWhereClause_ACU` 从 `options.where` 对象构造（等值/范围等），列名经 `resolveQueryColumn_ACU` 映射；`normalizeLimit_ACU` 上限 1000、默认 100。
- `insertRow` SQLite 分支：`INSERT INTO <english_table> (cols...) VALUES (...)`，跳过 `row_id` 列；仅写入 `headers` 中存在的中文列名；成功后 `finalizeTableEditAfterCommit_ACU` 写回消息楼层；返回值为新行在 `content` 中的 index。
- `updateRow` SQLite 分支：`UPDATE <english_table> SET col = ? ... WHERE row_id = ?`；使用 `content[normalizedRowIndex][0]` 作为 row_id；`isImportMode` 键跳过。
- `exportTableAsJson()` 同步返回 `currentJsonTableData_ACU || {}`。由于 `updateRow` 需要 `content` 数组下标而 query 只给稳定 `row_id`，O02 要求通过该快照按精确表名、第一列 row_id 和 stable-key 列做唯一反查，并在更新前重验；禁止直接把 row_id 当 rowIndex，也禁止默认更新第 1 行。
- `_notifyTableUpdate` 为内部通知；`executeSqlQuery/querySql` 只允许 SELECT/PRAGMA/EXPLAIN/WITH 读语句。
- **B4-O02 裁定**：使用预建 `GAL剧情记忆归档表` / `gal_story_memory_archive` 与 `GAL关系记忆归档表` / `gal_relationship_memory_archive`；作用域由冻结的 ownerCharacterId + chatId 做长度前缀编码；数据库侧按 scope + character/key 精确等值过滤；row identity 必须经 `exportTableAsJson()` 唯一反查并重验。表/列/API 缺失或身份歧义时禁写并回退 standalone MVU。执行 agent 尚未在生产代码接 CRUD。

适配器不会下载或执行上述远程脚本，只探测已经由用户启用的 `AutoCardUpdaterAPI`。数据库缺失或写入失败不会阻断 MVU 核心流程。

### R2 共存桥裁定（2026-08-09，静态证据）

- provider：公开 `TavernHelper.generate`；R2 bridge 在每次调用时重新解析当前函数，并以 helper 为 receiver，避免 UI 挂载时的旧函数快照绕过后来安装的 wrapper。
- SP·数据库 VII 静态源码显示其会包装宿主 `window.TavernHelper.generate`；本卡不读取 wrapper 的私有备份全局，不解析数据库召回，也不模拟数据库算法。
- 本卡请求构造在 standalone/database-assisted 两个 profile 中逐字节相同且零数据库调用；数据库若额外注入内容，发生在本卡 frozen request 构造之后，属于宿主外部增强。
- confidence：代码与指定数据库脚本静态证据为 high；runtime_check：本轮按范围未运行真实宿主时机演示，记为 `DBR-C8-UNVERIFIED`，不得写成实机 PASS。
- 当前 R2 取代此前 B4-O02 的生产许可：预建故事/关系归档表及主动 query/insert/update 方案只保留历史研究，不再授权接入 production adapter。

## 第二批 B2-T02：Helper 4.8.18 generate() 静态核验（V2 发送用）

- 来源：`F:/agent airp/Luker/public/scripts/extensions/third-party/JS-Slash-Runner/manifest.json`（版本 `4.8.18`）与同目录 `@types/function/generate.d.ts`（全文 537 行）
- 核验字段（均存在且有类型声明，confidence: high，静态声明层）：
  - `generation_id?: string`：按 ID 贯穿生成事件，`stopGenerationById(generation_id): boolean` 支持按 ID 停止；
  - `user_input?: string`；`should_stream?: boolean`（默认 false）；`should_silence?: boolean`（默认 false）；
  - `overrides.chat_history.prompts?: RolePrompt[]`（RolePrompt: role `'system'|'assistant'|'user'` + content）；
  - `overrides.chat_history.with_depth_entries?: boolean`（默认 true，V2 必须显式 false）；
  - `injects?: Omit<InjectionPrompt, 'id'>[]`：本批冻结裁定不新增（提示词注入专项前）。
- V2 冻结：`gal-generation-request.v2` / extra key `galGenerationRequestV2` / `historyRevision: gal-synthetic-history.v1` / `memoryRevision: character-visit-memory.v1` / promptRevision 保持 `gal-prompt.v1`。
- runtime_check: 本批只做静态核验，不运行探针；generate 调用接线留待 B2-T08。
