# 运行 API 来源记录（0.2.0）

## Luker 与酒馆助手

- `createChatMessages([{ role: 'user', message }], { insert_before: 'end', refresh: 'affected' })`
  - surface: 酒馆助手 / JS-Slash-Runner
  - applies_to: 4.8.18
  - provenance: `F:/agent airp/Luker/public/scripts/extensions/third-party/JS-Slash-Runner/@types`
  - confidence: high（匹配安装版本声明）
  - runtime_check: 未导入本卡，真实消息创建待验收
- `triggerSlash('/trigger')`、`/regenerate`、`/swipe await=true direction=right`
  - surface: 酒馆助手 + Luker STScript
  - applies_to: 酒馆助手 4.8.18 / Luker 2.7.0
  - provenance: 匹配安装声明与 `F:/agent airp/Luker/public/scripts/slash-commands.js`
  - confidence: high（源码与声明一致）
  - runtime_check: 本卡未导入，待验收
- `Mvu.getMvuData({ type: 'message', message_id: 'latest' })`
  - surface: MVU，经酒馆助手导出
  - applies_to: 酒馆助手 4.8.18 声明；本卡加载器固定 MagVarUpdate commit `d1bdfd1`
  - provenance: `@types/iframe/exported.mvu.d.ts` 与 `src/runtime/01-mvu-loader.js`
  - confidence: medium（声明已匹配，目标卡运行帧尚未出现）
  - runtime_check: 待新卡导入与新聊天

## SP·数据库 VII

- global: `AutoCardUpdaterAPI`
- used methods: `queryTableRows`、`insertRow`、`updateRow`
- callback methods observed: `registerTableUpdateCallback`、`unregisterTableUpdateCallback`
- applies_to: 用户指定 `https://gcore.jsdelivr.net/gh/AlbusKen/shujuku@spv8.0/index.js`，脚本头版本 `2.0.0`
- provenance: 2026-07-22 获取的指定脚本；全局装配由 `createSqlApi`、`createTableCrudApi` 后赋值到 `topLevelWindow_ACU.AutoCardUpdaterAPI`
- confidence: high（指定脚本源码）
- runtime_check: Luker 设置中“数据库”脚本存在但 `enabled: false`，因此当前页面无该全局

适配器不会下载或执行上述远程脚本，只探测已经由用户启用的 `AutoCardUpdaterAPI`。数据库缺失或写入失败不会阻断 MVU 核心流程。
