# Agent 对接与交接

## 当前状态

- 当前可验收检查点：`0.2.0-r18`
- 角色卡：`../dist/checkpoint-0.2.0-r18/幻想乡物语-测试检查点-0.2.0-r18.json`
- SHA-256：`ea8445eb07764a87d38cf81b3c52ad09406cc7865b75c2e44457b88a9f4f5b33`
- 文件大小：约 `19,982,355` bytes
- UI 脚本 ID：`gensokyo-garden-ui-020-r18`
- 当前实机环境：Luker `2.7.0 release`、Tavern Helper 本机清单版本 `4.8.18`
- MVU 固定来源：MagVarUpdate commit `d1bdfd1`
- 当前阶段：M1/M3 并行；r18 已打包并写入 Luker，已清理 r17 角色卡与世界书；等待所有者按验收名单实机勾选 A-H。
- 关键修复：GAL 优先显示 LLM 长正文分页；time_period 口语别名映射四值。

## 下一位必须先读

1. 本文件 `agent-handoff.md`
2. `runtime-report-0.2.0-r18.md`（证据与验收名单）
3. `contract.md` / `api-provenance.md`
4. 改 GAL 或时段：`src/ui/gal-scene.ts`、`src/schema/02-mvu-schema.js`、`src/lorebook/gal-presentation-protocol.md`、`src/lorebook/variable-update-rules.md`

## 操作约束

- 未经用户明确要求，不要 package:checkpoint，不要覆盖已有检查点目录。
- 导入酒馆后只清理旧打包产物（角色卡 PNG / 世界书 JSON）；保留历史聊天目录。
- 改 schema / 协议 / UI 后必须：npm test -> npm run check:ui -> npm run build:ui -> 再打包。
- 打包碰撞策略：refuse-overwrite；源码当前 r18，manifest 下一目标 r19。

## r18 已实现并交付：长正文显示 + 时段别名

### 用户反馈（r17 新聊天）

- 聊天/壳显示已正常（r17 0层钉死修复有效）。
- 结束聊天有收尾，但时间未推进。
- 主屋路径感觉正常。
- 需求：不要只播 3-4 条短 beat，要显示 LLM 正文叙事（约 700-900+ 字）。

### 聊天证据与根因

- 聊天：Luker chats 下 r17 imported.jsonl
- 正文约 700-900 字，多数在 </bginfor> 后；bginfor 常为时间地点元数据。
- 旧 cleanNarrativeText 优先 bginfor -> 空 -> 只播 scene beats。
- UV 写 time_period=下午（楼 7/11/13），variables 仍清晨：非法枚举被 schema 回退。

### 源码修复

- src/ui/gal-scene.ts：候选正文取 bginfor 后/内/全文最长；优先 scene.v1+body 分页。
- src/schema/02-mvu-schema.js：下午/中午/上午->白昼 等口语别名。
- lorebook 协议与变量规则：玩家读正文；时段只写四值。
- types 与 ui-contract 测试同步。

### 交付

- npm test 19/19；check:ui 通过；build:ui + package:checkpoint 完成。
- Luker 仅 r18 角色卡/世界书；r17 已删；聊天目录保留。
- 离线复现 r17 楼 3/5/7/17 clean：725/855/839/637，均为 scene.v1+body。
- 报告：runtime-report-0.2.0-r18.md

### 所有者验收名单（新开 r18）

| 序号 | 项 | 通过标准 |
|------|----|----------|
| A | 导入 | r18；loader/schema/ui-r18；世界书约 16 条 |
| B | 开场 | 载入资料进庭院，不调 LLM |
| C | 在场 | 灵梦可见可点 |
| D | 正文（重点） | 长叙事分页，非仅短 beat；建议回复可用 |
| E | 结束/时段 | 收尾正常；下午/白昼可到顶栏白昼 |
| F | 主屋 | 检查/维修；资源不足有提示 |
| G | 原生 | 多轮楼层可见；返回壳状态仍在 |
| H | 清理 | 仅 r18，无 r17 同名旧卡 |

## r17：0 层钉死修复

- 读楼多路径 + context.chat 兜底；pickLatestAssistant 禁止回落 first_mes。
- 报告：runtime-report-0.2.0-r17.md

## r16：显示修复

- generating 结算；refresh 防抖 Promise；建议回复 action_id/thought；灵梦在场种子。
- 报告：runtime-report-0.2.0-r16.md

## r15：GAL 单壳互动

- 角色/主屋菜单；对话/摸摸头；最多 6 段；建议回复；结束幂等结算；真实非隐藏楼层。
- 报告：runtime-report-0.2.0-r15.md

## r14 / r13 / r12 继承

- r14 切卡生命周期；r13 零生成开场；r12 initvar 与同层挂载。

## 关键实现位置

| 主题 | 路径 |
|------|------|
| GAL 正文/scene | src/ui/gal-scene.ts |
| 壳层 | src/ui/app.ts |
| 桥接 | src/ui/bridge.ts |
| 事务 | src/ui/message-transaction.ts |
| Schema | src/schema/02-mvu-schema.js |
| 协议 | src/lorebook/gal-presentation-protocol.md |
| 打包 | scripts/package-checkpoint.mjs |
| 测试 | tests/ui-contract.test.mjs |

## 剩余工作

1. 所有者完成 r18 验收 A-H，尤其 D 与 E。
2. 结束仍不写时段时，可加强结束协议或本地有限兜底（需授权）。
3. G 深测（Swipe/停止续写/切卡）可继续。
4. M2 全量与正式发布未开始。

## 常用命令

```
npm test
npm run check:ui
npm run build:ui
npm run package:checkpoint:dry
npm run package:checkpoint
```
