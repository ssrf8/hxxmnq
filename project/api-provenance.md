# 运行 API 来源记录（0.2.0）

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

适配器不会下载或执行上述远程脚本，只探测已经由用户启用的 `AutoCardUpdaterAPI`。数据库缺失或写入失败不会阻断 MVU 核心流程。
