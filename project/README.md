# 幻想乡物语 · 项目总览

最后更新：2026-08-12。

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
- 普通角色“对话”已改为先进入 GAL 等待玩家首轮输入；未发送便结束不会创建楼层、调用 LLM 或写入 MVU。
- “幻想乡案内”已增加只读回想画廊：读取当前聊天最近 1000 个真实楼层，支持起止楼层筛选、滑杆快速定位、逐 beat GAL 回放和范围内图片网格；不建立第二份剧情或图片数据库。
- 怀表主动解除与符卡胜利要求放弃入口已通过真实 SillyTavern 验收，临时测试控制台按钮已移除；记录见 `project/2026-08-11-watch-duel-bugfix-acceptance.md`。
- “幻想乡案内”可在确认后由本地规则快进至活动异变期限并立即归档清空；咲夜怀表现有真实五分钟期限，顶栏显示倒计时，到点自动解除并保持当日冷却。
- 新手教程现以解决温室妖花核心为正常毕业终点；妖花调查回复结束后会明确引导返回庭园选择符卡战或剧情解决。正式“跳过教程”会直接撤下全部新手指引并推进至温室三形态待选状态，但不会代替玩家选型。
- 新手教程与其他本地白名单剧情现统一以“收到非空 assistant 回复”为完成回执；VisitTurn 梗概仍会尽力写入，但任务缺失、错配或摘要失败不再阻断本地剧情推进。普通自由对话继续保持严格 VisitTurn 校验。
- 0.3.0-r7 正式候选已打包：卡内使用 production R2 UI loader，UI r7 已上传并读回校验；JSON/PNG 的创作者注释为空，PNG payload 与 JSON 逐字节一致。已被替代的 production UI r5/r6 源对象已从 R2 删除。
- production remote UI 已热更新至 r10；GAL 请求异常会自动释放发送锁，并提供手动“修复”按钮；教程第五步、胜利要求遗留锁与画廊角色小窗冲突均已修复。采用 production loader 的旧卡刷新后会自动加载 r10，无需重新导入角色卡。

## 当前验证与未完成项

- `npm run check:ui`：通过。
- production remote UI r10：2,255,171 bytes，SHA-256 `132ee9f852f352bdba796f253b6e2cb64d649a00dd1cbbde7ce73a03fbfcdd04`，R2 公网读回通过。
- 首轮输入与回想画廊 UI 契约测试：140/140 通过；相关三组联合回归：178/178 通过。真实 SillyTavern 的新画廊交互仍需按专项文档末尾步骤验收。
- `npm test`：760/760 通过。
- generation 8 已包含远端 Boss portrait 媒体；0.3.0-r7 已重新打包，剩余步骤是真实 SillyTavern 导入与运行验收。

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
| GAL 首轮输入与回想画廊 | `project/gal-first-input-and-history-gallery-plan.md` |
| 已知 BUG 与修复优先级 | `project/bug-log.md` |

按领域再读：

- R2 与打包：`project/r2-packaging-runbook.md`、`project/live-asset-publish.md`；
- UI 测试通道：`project/r2-ui-test-channel-publish-plan.md`；
- 弹幕：`project/bullet-hell-minigame-handoff.md`、`project/bullet-hell-minigame-optimization-protocol.md`；
- 地图导航：`project/garden-navigation-mask-contract.md`；
- GAL 存读：`project/gal-mvu-save-load-plan.md`；
- 双 profile：`project/gal-character-memory-batch-4-database-coexistence-replan.md`；
- 素材与立绘：对应素材清单或专项文档，最终登记以 `src/assets/asset-manifest.json` 为准；
- 已知 BUG 与统一根因（叙事通道授权缺失）：`project/bug-log.md`。

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
