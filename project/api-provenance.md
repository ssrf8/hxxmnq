# 运行 API 来源记录（0.2.0）

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

## SP·数据库 VII

- global: `AutoCardUpdaterAPI`
- used methods: `queryTableRows`、`insertRow`、`updateRow`
- callback methods observed: `registerTableUpdateCallback`、`unregisterTableUpdateCallback`
- applies_to: 用户指定 `https://gcore.jsdelivr.net/gh/AlbusKen/shujuku@spv8.0/index.js`，脚本头版本 `2.0.0`
- provenance: 2026-07-22 获取的指定脚本；全局装配由 `createSqlApi`、`createTableCrudApi` 后赋值到 `topLevelWindow_ACU.AutoCardUpdaterAPI`
- confidence: high（指定脚本源码）
- runtime_check: Luker 设置中“数据库”脚本存在但 `enabled: false`，因此当前页面无该全局

适配器不会下载或执行上述远程脚本，只探测已经由用户启用的 `AutoCardUpdaterAPI`。数据库缺失或写入失败不会阻断 MVU 核心流程。
