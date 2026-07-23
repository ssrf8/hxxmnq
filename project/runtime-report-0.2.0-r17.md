# 0.2.0-r17 运行验收记录

## 交付物

- 角色卡 JSON：`../dist/checkpoint-0.2.0-r17/幻想乡物语-测试检查点-0.2.0-r17.json`
- SHA-256：`0d74252fbaf6a7cd489753a60b0defa61acdd1f3a14cdf870c2f2d08323e56cc`
- 文件大小：`19,974,293` bytes
- 生成时间：2026-07-24
- 目标环境：`F:\agent airp\Luker`
- 本轮修复：GAL 对话框钉死 0 层开场白（读楼范围/归一化/选楼策略）

## 修复摘要

- `readRawMessages`：`-1` 探测、`getLastMessageId`、宏范围、`getContext().chat` 兜底
- 显示读楼与事务读楼对齐：`include_swipes:false` + `hide_state:all`
- `pickLatestAssistant`：优先最后 user 之后的 assistant；有玩家发言后禁止回落到 first_mes
- 场景签名带文本前缀；宿主向 iframe 暴露 `getLastMessageId`
- 继承 r16：generating 结算、refresh 防抖、建议回复别名、灵梦初始在场

## 自动与离线门禁

- `npm test`：17/17 通过
- `npm run build:ui`：通过
- `npm run check:ui`：通过
- `npm run package:checkpoint`：通过
- UI 脚本 ID：`gensokyo-garden-ui-020-r17`
- 嵌入校验：`pickLatestAssistant` / `readRawMessages` 存在；旧 generating 拦截块不存在

## Luker 导入与清理

- 已写入：`characters/幻想乡物语·移动庭园（测试检查点 0.2.0-r17）.png`
- 已写入：`worlds/幻想乡物语·移动庭园 0.2.0-r17.json`
- 已删除：r16 角色卡、缩略图、世界书
- 角色库当前仅剩 r17 移动庭园卡
- 历史聊天目录保留

请 **刷新/重启 Luker** 后用 **r17 新聊天** 验收。

## 所有者重点验收（从 D 重跑）

### D. 壳内显示（本轮主项）

1. 新聊天开场进庭院，可见灵梦
2. 点灵梦 → 对话/摸摸头 → 生成结束后 **壳内不是 0 层开场白**
3. 壳内文本应接近最新 assistant 的 scene beats 或正文
4. 再发一轮手动输入/建议回复，壳内切换到更新的回复
5. 原生仍可见完整多轮楼层

### 其余可按 r16 名单继续

- E 结束结算、F 旧主屋、G 停止/Swipe/原生恢复

失败时请记录：壳内原文摘要、原生最新 assistant 摘要、是否仍像 0 层开场白。
