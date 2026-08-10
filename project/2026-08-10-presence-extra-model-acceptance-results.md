# Presence 额外模型接管验收结果

最终状态：**PASS**  
验收完成：2026-08-11  
测试通道基线：`test-r30`

## 覆盖范围

验收覆盖以下完整链路：

```text
bridge 暂存任务
→ 玩家楼层任务投影
→ 主模型正文（无 GensokyoPresence）
→ 额外变量模型填写 summary / presence decision
→ bridge 校验并落盘
→ VisitTurn、presence_snapshot、receipt 与 lifecycle 复读
→ settled
```

## 结果

| 用例 | 结果 |
|---|---|
| Presence 全流程九项复读 | PASS（9/9） |
| A01–A05 基础顺序用例 | PASS |
| A06 非法输出拒绝与合法重试 | PASS |
| A07_multi 多角色 | PASS |
| A07_leave 生成期间离场 | PASS |
| A08–A09 一致性与恢复 | PASS |
| A10 压力测试 | PASS（10/10） |
| dismiss / end_chat | PASS |

A11 是 `standalone-mvu` 与 `database-assisted` 的跨 profile 独立比较，不属于本次 Presence 接管通过条件；需要时在单独聊天执行。

## 已关闭问题

1. **任务对额外模型不可见**：玩家楼层末尾加入 `<GensokyoVariableAnalysisTask>` 投影，避免 D0 宏读取旧楼层时任务丢失。
2. **Presence 槽位为空**：准备验收角色时确保任务按正确楼层的正式在场快照冻结。
3. **二阶段误报 missing-task**：V2 已 settled 且 commitKey 匹配时幂等返回，不重新消费已清除任务。
4. **A07_leave 读取上一轮 settled**：按钮启动本轮前记录旧 `transactionId`，只等待和判断新事务状态。

## 最终证据

- 主模型正文不包含 `<GensokyoPresence>`；
- 额外模型能看到冻结任务并填写角色摘要及 `move / leave` 决定；
- `interaction.visit_memory` 出现唯一且完整的冻结 VisitTurn；
- `presence_snapshot` 按模型语义经 bridge 校验后更新；
- 两类一次性任务结算后清为 `null`；
- lifecycle、receipt、request / attempt / commit 身份一致，最终事务为 `settled`；
- 非法越权补丁被拒绝且未落盘；
- 连续压力轮无重复结算、任务残留或红色错误。

## 离线回归

- `npm run check:ui`：PASS；
- `npm test`：732/732 PASS；
- `npm run build:ui:standalone`：PASS。

本记录是当前 Presence 接管的唯一验收文档。旧计划、诊断稿和重复验收记录已删除。

