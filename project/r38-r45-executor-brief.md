# 给下一位执行代理的施工简报

你正在维护 `F:\agent airp\卡\幻想乡物语`。这是一个 SillyTavern + Tavern Helper + MVU + 嵌入 UI 的角色卡项目。你的任务不是自由发挥，而是逐检查点实现已确认的 M2 计划。

## 开始前必须阅读

按顺序完整阅读：

1. `project/agent-handoff.md`
2. `project/r37-acceptance-checklist.md`
3. `project/r38-r45-m2-expansion-plan.md`
4. `project/r38-r45-detailed-execution-plan.md`
5. `project/contract.md`
6. `src/schema/field-ledger.md`
7. `src/lorebook/variable-update-rules.md`

## 你的工作方式

1. 一次只处理一个检查点，不跨 R38–R45 混做。
2. 每轮先在 `project/r38-r45-implementation-log.md` 追加“开工”条目。
3. 运行 `git rev-parse --short HEAD`、`git status --short`、`git diff --check`。
4. 阅读目标文件已有 diff。工作区很脏，禁止 reset、clean、checkout 覆盖或删除已有内容。
5. 先写/更新字段账本和纯规则测试，再写业务规则，再接 UI/bridge/prompt。
6. 每轮完成后运行 `npm run check:ui` 和 `npm test`，追加“收工/停工”日志。
7. 任一测试失败就停在当前检查点，不得继续下一项。

## 当前硬闸门

R37 还缺真实 SillyTavern 验收。除非 `project/r37-acceptance-checklist.md` 已有明确通过结论和证据，否则不要开始 M2 实现；只能协助修复 R37 验收缺陷。不要先改 manifest 冒充已经进入 R38。

## 不允许自行改变的产品规则

- 新手教程在首次温室选型后结束，后续没有固定主线限制。
- 玩家填写一个自定义异变；源头由首次 LLM 调用生成并隐藏；持续完整 28 时段，不能提前结束，同期不能叠加。
- 普通剧情持续接收异变背景；灵梦只在启用、每日首次调查和最终收束做简短引导。
- 背包物品来自本地目录，玩家不能创建；首批六消耗品，永久物只保留怀表。
- 随机来访、邀请结果、装修角色、设施风险、成本、人数与正式状态全部由代码决定，不能交给 LLM。
- 三设施均为一个设施壳加三种可切换形态；建造 4/6/5，换型统一 2；一次仅一个大型施工。
- 形态通过不同聊天时段 2/4 次或 12/24 时段兜底取得。
- 设施正文不预写固定剧情，LLM 只演绎代码已经确定的场景事实。
- 普通聊天时间由 MVU 返回，可不动或最多前进一时段；长行动才可跨多时段。
- 场景道具一次调用最多新增一种、全场最多三种；效果保持到结束剧情后的最后一次 LLM 回复成功为止。

## 架构原则

- `bridge.ts` 只做宿主 I/O 与事务，不堆业务规则。
- `app.ts` 只装配 UI；概率、候选、扣费、解锁下沉纯 rules。
- `stat_data` 是正式状态唯一事实源。
- 每个字段必须走完：ledger → initial state → schema → migration → types → rules → UI/prompt → tests。
- LLM 输出不是可信状态；本地拥有字段必须校验、恢复或重算。
- 所有生成事务使用稳定 transaction ID，重试/刷新/Swipe 不重抽、不重扣、不重复推进。

## 命令

```powershell
npm run check:ui
npm test
```

只在检查点要求构建时运行：

```powershell
npm run build:ui
node scripts/package-checkpoint.mjs --checkpoint=0.2.0-rNN --dry-run
```

没有用户明确授权时禁止正式打包。禁止使用 `--replace`。禁止手工编辑 `dist/`。

## 必须停工并记录的情况

- R37 未真实通过；
- 目标文件存在你无法理解或可靠合并的已有改动；
- 需求文档互相冲突；
- 字段链缺一环；
- 需要让 LLM 决定代码所有的结果；
- 普通 prompt 可能看到隐藏异变源头或缺席角色；
- 刷新/重试/Swipe 会重复结算；
- 全量测试未通过；
- 打包目标已存在。

## 每轮交接必须给出

- 做了哪个检查点，哪些未做；
- 精确修改文件清单；
- 新增测试名称及对应需求；
- `check:ui` 与 `npm test` 结果；
- 构建、dry-run、正式打包是否执行；
- 未决风险和下一步唯一入口；
- 若失败：复现、期望/实际、聊天和消息 ID、transaction ID、状态前后、控制台原文、截图路径。

不要写“应该没问题”“大概完成”。留证据，后续验收者会负责实机验收和 debug。你只需要老老实实把每一颗螺丝拧到有编号的位置——这已经比灵感型施工可靠多了。
