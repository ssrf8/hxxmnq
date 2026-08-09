# GAL 事务状态机重构 — 验收交接简报

> 给接手验收的 agent：本文件是验收入口。验收对象 = 工作区 `F:/agent airp/卡/幻想乡物语` 的**当前工作区状态**（未提交改动），不是 git HEAD 基线。

## 1. 验收对象（一句话）

GAL 四链路（玩家发送 → 流式监听落楼 → 重新生成 → 停止/恢复）收敛为「`generate()` Promise 为唯一权威 + requestId/attemptId/generationId 三级 ID + 可取消可恢复」事务状态机，按 `gal-generate-transaction-refactor-plan.md` 的 Phase 0–6 实施完毕。

## 2. 必读文档（按顺序）

| 优先级 | 文件 | 用途 |
|---|---|---|
| ★★★ | `project/gal-generate-transaction-refactor-plan.md` | **计划与验收标准**：各阶段验收标准（0.x–6.4）、停止线（第 10 节）、裁定约束（如「4.8.19 不得替代背书」） |
| ★★★ | `project/gal-generate-transaction-implementation-log.md` | **实施日志 + 总体验收汇总**：Phase 0–6 每阶段结论/证据/遗留；末尾「总体验收汇总」表是快速入口 |
| ★★★ | `project/api-provenance.md` | **API 实机证据**：顶部新增「GAL 事务状态机（Probe A/B/C 与 Phase 0–6 实机证据）」章节——generation_id 贯穿、MVU 触发、停止语义、getChatMessages range、Helper 4.8.18 暴露清单 |
| ★★ | `tests/`（17 个 *.test.mjs） | 全量测试；重点：`message-transaction-v2`、`phase2-contract`、`phase4-restore`、`ui-contract`、`gal-generation-request` |

## 3. 验收命令（在 `F:/agent airp/卡/幻想乡物语` 执行）

```bash
node --test tests/*.test.mjs        # 期望：297 pass / 0 fail
npx tsc --noEmit -p tsconfig.json   # 期望：0 error
node scripts/build-ui.mjs --asset-mode=remote-r2-live --asset-base-url=https://ssrfrrt.ccwu.cc   # 期望：成功
```

## 4. 验收标准索引（对照计划章节）

| Phase | 计划章节 | 证据所在 |
|---|---|---|
| 0 现状+身份门禁 | 0.1–0.6 | log Phase 0；探针资产 `tmp/probe/` |
| 1 发送链收敛 | 1.x | log Phase 1；Probe A（api-provenance） |
| 2 监听落楼 | 2.x | log Phase 2；Probe B |
| 3 停止/恢复 | 3.1–3.3 | log Phase 3；stopGenerationById 实机语义 |
| 4 重载恢复 | 4.1–4.5 | log Phase 4；`phase4-restore.test.mjs` |
| 5 重新生成 | 5.1–5.2 | log Phase 5；Probe C 未 PASS → native-regenerate 决策 |
| 6 楼层隐藏/调试 | 6.1–6.4 | log Phase 6；`ui-contract.test.mjs` |

## 5. 环境与限制（验收时必须遵守）

- **正式目标运行时**（已裁定落盘）：SillyTavern **1.18.0** + JS-Slash-Runner / Tavern Helper **4.8.18**，运行实例 `F:/agent airp/SillyTavern` @ `http://127.0.0.1:8000/`（PID 7036）。**计划原目标 `D:/json脚本地下城/主体/SillyTavern`（1.18.0 + Helper 4.8.19）不存在**；不得用邻近版本顶替实机 PASS。
- 探针纪律：禁止手工伪造 Tavern 事件 / 改 `is_hidden` / 改 MVU 源码绕过；候选 bundle 必须能读回 SHA-256 + probeSessionId。
- **docs/ 目录是「未开之花（汤泉）」卡的参考文档**，不是本项目现状文档；其中 03/07/09 章节为参考范式（generate + createChatMessages + Mvu.parseMessage 无 /trigger），与 Probe B 实测一致。
- 探针环境已清理（:8799 服务器、探针卡/聊天/全局脚本已删）；`tmp/probe/` 资产保留，可重建探针复现 Probe A/B/C。
- 运行中实例 Helper 4.8.18 全局暴露：`createChatMessages / setChatMessages / getChatMessages / iframe_events / tavern_events / triggerSlash / generate / eventOn / getScriptTrees / updateScriptTreesWith / stopGenerationById / importRawCharacter`。

## 6. 遗留项（非阻塞，验收时确认即可）

1. helper-generate-swipe 后续路径（隐藏开发开关 → 全 swipe/MVU 实机 → 再设默认）
2. 4.8.18 角色卡脚本需手动启用（正式交付改用全局脚本或引导）
3. `getChatMessages` range 参数约定（`'0--1'` 全部 / `-1` 单条）入正式代码注释
4. 锁定版 MVU bundle 依赖无版本 jsdelivr fallback（docs/09 §29 宿主 Mvu 优先已覆盖）

## 7. git 状态

- HEAD `359ec43 chore: sync r95 project snapshot and visitor lifecycle fixes`；**当前工作区有未提交改动**（Phase 3–6 代码 + 文档），验收应基于工作区，不是 HEAD。
