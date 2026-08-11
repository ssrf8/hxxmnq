# 幻想乡物语 · 项目总览

最后更新：2026-08-11。

## 项目形态

这是一个运行于 SillyTavern 的角色卡游戏。主要结构：

- `src/ui/`：庭园、GAL、设施、商店、背包和弹幕战；
- `src/runtime/`：宿主挂载与运行时适配；
- `src/schema/`：MVU schema、初始状态和字段所有权；
- `src/lorebook/`：剧情协议、变量协议与世界书路由；
- `scripts/`：构建、测试通道、素材发布和角色卡打包；
- `tests/`：事务、状态、构建与业务规则回归测试。

`stat_data` 是正式状态唯一来源。主模型负责剧情，MagVarUpdate 额外模型负责开放语义分析；资源、库存、战斗、事件、在场快照、UID、会话生命周期和幂等结算由 bridge 独占。

## 当前关键状态

- 当前 schema：`v0.3.0`。
- GAL 新请求协议：`gal-prompt.v7`（设施现状随剧情梗概进入冻结 system 历史；在场快照不再投影朝向）。
- 正式登记角色：11 名；妖梦、帕秋莉、早苗已接入无前置随机来访、独立静态四视图、四向地图动画与 GAL 反应图。妖梦、早苗的左右运行源已在构建期纠正；早苗右侧静态图由左侧精确镜像生成，三人的原始动画帧数保持不变。
- 三名新角色的动静帧已按所有者参数独立校准，动画统一为 48ms/帧；本地校准台位于 `src/ui/new-character-sprite-calibration.html`。这些尺寸、定位和帧速属于 UI 代码，必须随新角色卡/UI 包重新打包后才会进入 SillyTavern。
- 弹幕对战：妖梦、帕秋莉、早苗已接入独立四状态 Boss 图集与角色对战配置；原始 `1536×1536` 图片完整归档，运行副本统一为透明 `1254×1254` 四宫格。
- Live 素材：生产 manifest 已更新至 generation 7（254 files / 355,238,436 bytes）；三张新 Boss WebP 已按 media-first / manifest-last 新增，并完成 S3 与生产域名双通道读回校验。manifest SHA-256 为 `6b6bd8afa66e36e5bce9ddd9b56fd86cdb174d6037c7fa44bc15e82fdeec80b2`。
- 世界书：妖梦、帕秋莉、早苗的人设条目已扩充；新增“剑术特训”和“昏睡红茶·半梦半醒”两个无额外前置的商店消耗品。角色与道具继续使用不透明绿灯，世界书道具 UID 使用独立 `100+` 区段并在打包时检查重复。
- 角色记忆：每角色最多 60 条 `VisitTurn` 剧情梗概；退役的关系事实数组不再使用。
- Presence 已迁移到额外模型任务：bridge 暂存 `interaction.presence_analysis_task`，额外模型填写语义叶字段，bridge 校验并更新 `presence_snapshot`。
- VisitTurn 摘要采用同一机制：bridge 暂存 `interaction.visit_summary_task`，额外模型逐角色填写 `summary`，bridge 绑定冻结 visit 后落盘。
- 主模型不再输出 `<GensokyoPresence>`，变量模型也不得直接写 `presence_snapshot` 或 `interaction.visit_memory`。
- Presence 全流程、非法变量输出拒绝、多角色、生成期间离场、压力测试与二阶段幂等结算已通过真实 SillyTavern 验收。记录见 `project/2026-08-10-presence-extra-model-acceptance-results.md`。

## 当前验证与未完成项

- `npm run check:ui`：通过。
- `npm run build:ui:standalone`：通过，当前内嵌 UI 为 2,196,294 bytes，SHA-256 为 `8b35d93631cf0eb038a20acf1b91e99b998974e5188845e1faf3d5857f80c2f3`。
- `npm test`：739 项中 734 通过、5 失败；失败清单及处理顺序以 `project/agent-handoff.md` 为准，不再沿用旧的 734/734 基线。
- generation 7 已更新远端 Boss 媒体；48ms、动静帧定位、Boss 路由、三个人设与两个新道具仍需重新打包角色卡并在真实 SillyTavern 验收。

## 必读文档

| 需求 | 文档 |
|---|---|
| 项目红线、状态所有权和兼容边界 | `project/contract.md` |
| 当前交接、验证结果和剩余事项 | `project/agent-handoff.md` |
| Presence 任务与落盘契约 | `project/presence-sync-contract.md` |
| 额外变量模型运行方式 | `project/extra-model-variable-analysis.md` |
| 字段类型、上限和写入者 | `src/schema/field-ledger.md` |
| 变量模型可写／禁写规则 | `src/lorebook/variable-update-rules.md` |
| 世界书路由 | `src/lorebook/routing-plan.json` |
| 宿主 API 来源 | `project/api-provenance.md` |

按领域再读：

- R2 与打包：`project/r2-packaging-runbook.md`、`project/live-asset-publish.md`；
- UI 测试通道：`project/r2-ui-test-channel-publish-plan.md`；
- 弹幕：`project/bullet-hell-minigame-handoff.md`、`project/bullet-hell-minigame-optimization-protocol.md`；
- 地图导航：`project/garden-navigation-mask-contract.md`；
- GAL 存读：`project/gal-mvu-save-load-plan.md`；
- 双 profile：`project/gal-character-memory-batch-4-database-coexistence-replan.md`；
- 素材与立绘：对应素材清单或专项文档，最终登记以 `src/assets/asset-manifest.json` 为准。

历史计划和重复实施日志已清理。仍保留的长文档要么被源码／测试直接引用，要么承担尚在使用的操作合同。

## 常用命令

```bash
npm run check:ui
npm test
npm run build:ui:standalone
npm run build:ui:test -- --ui-version=test-rNN
npm run package:checkpoint:dry
```

测试通道与正式通道都要求显式版本号。未经明确授权不要上传 R2、发布通道、打包正式卡或覆盖既有检查点。

## 开工顺序

1. 阅读本页、`contract.md` 和 `agent-handoff.md`。
2. 按任务补读专项合同，不从旧计划推断当前行为。
3. 修改前确认工作树，保留无关改动。
4. 至少执行相关聚焦测试、`npm run check:ui` 和 `git diff --check`；高风险改动再跑全量测试与构建。
5. 离线通过不等于真实 SillyTavern 验收通过；运行时结论必须有真实楼层、事务和落盘证据。
