# Agent 对接与交接

## 当前状态

- 已验收开发基线：`0.2.0-r18`；当前联合验收候选：`0.2.0-r20`
- 角色卡：`../dist/checkpoint-0.2.0-r20/幻想乡物语-测试检查点-0.2.0-r20.json`
- SHA-256：`707dcca41fbbc5067b488392a0ec39fb5be2e2d52db1cb5536db8aeda678e441`
- 文件大小：`29,554,743` bytes
- UI 脚本 ID：`gensokyo-garden-ui-020-r20`
- 当前实机环境：SillyTavern `1.18.0`（`8172dcd0`）、Tavern Helper `4.8.19`
- MVU 固定来源：MagVarUpdate commit `d1bdfd1`
- 当前阶段：M1 联合候选进入人工验收；M3 的 R20 打包、导入、绑定、清理与真实宿主冒烟完成。
- 联合结果：r19 温室建设与首次使用、r20 持续交流、妖花核心、两阶段战斗可信结算和锚点线索均已实现；现在按 `runtime-report-0.2.0-r20.md` 分批验收修复。
- 关键修复：GAL 优先显示 LLM 长正文分页；time_period 口语别名映射四值。

## 下一位必须先读

1. 本文件 `agent-handoff.md`
2. `r19-r20-greenhouse-completion-plan.md`（当前执行计划）
3. `runtime-report-0.2.0-r20.md`（当前候选、运行证据与验收清单）
4. `runtime-report-0.2.0-r18.md`（已验收基线证据）
5. `contract.md` / `api-provenance.md`
6. 改 GAL、事件、战斗或时段：`src/ui/gal-scene.ts`、`src/ui/target-actions.ts`、`src/ui/greenhouse-rules.ts`、`src/ui/bridge.ts`、`src/schema/02-mvu-schema.js`、`src/lorebook/events/greenhouse-vertical-slice.json`、`src/lorebook/variable-update-rules.md`

## 操作约束

- 当前 R20 已按用户明确授权完成 package 与导入；后续验收修复仍使用新检查点或显式授权，不覆盖 R20 目录。
- 导入酒馆后只清理旧打包产物（角色卡 PNG / 世界书 JSON）；保留历史聊天目录。
- 改 schema / 协议 / UI 后必须：npm test -> npm run check:ui -> npm run build:ui -> 再打包。
- 打包碰撞策略：refuse-overwrite；已验收基线 r18，当前候选 r20。

## r19+r20 已实现并导入

- 自动门禁：22/22 tests、TypeScript、UI build、package dry-run 与 write 全通过。
- r19：温室调查标记、魔理沙线索、第二点灵感、清理、资源不足路线、建造和首次使用。
- r20：`effective_rounds`、多轮交流、妖花事件门控、可信 `battle.current`、四结果与锚点线索。
- 真实目标只剩 R20 卡／R20 世界书／R20 缩略图；世界书 16 条并已绑定，三脚本 ID 正确。
- 零生成开场在真实 0 层写入并复读成功；壳、MVU、地图／魔理沙／温室图片均已证明。
- 旧 R12 卡、R12/无后缀世界书和一次误导入副本已删除；8 个历史聊天目录保留。
- 导入与冒烟细节、已知边界、17 项验收方法见 `runtime-report-0.2.0-r20.md`。

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

1. 所有者按 `runtime-report-0.2.0-r20.md` 第 1–17 项逐项验收并回报序号与现象。
2. 优先修复主流程阻断、状态错结算和重复扣费；每次修复先回归自动门禁再真机复验。
3. 完成 narrative 主线后，再分独立聊天慢慢补验 clean/narrow/loss 和待结算恢复。
4. R20 验收完成后再决定进入 M2，当前不提前实现四设施、八角色全量内容。

## 常用命令

```
npm test
npm run check:ui
npm run build:ui
npm run package:checkpoint:dry
npm run package:checkpoint
```
