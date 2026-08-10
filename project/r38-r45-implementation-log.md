# R38–R45 实施日志

> 追加式施工记录。禁止删除、改写或把失败记录润色成成功。命令输出只摘录必要部分；完整错误可放独立文本并在此写绝对路径。

## 日志规则

- 每个检查点开工前一条，收工或停工时一条。
- 每次改动必须列出实际文件，不写“若干文件”。
- `check:ui`、测试、构建、dry-run、正式打包分别记录，不能用一个“均通过”代替。
- 未运行的步骤明确写“未执行”及原因。
- 离线门禁、静态预览、真实 SillyTavern 验收是三种结论，不得混写。
- 正式包必须记录 SHA-256；无明确授权不得生成。
- 不记录密码、令牌、Cookie、完整私密聊天内容。

## 2026-07-25 — 规划基线

- 执行者：Codex（规划与基线核对）
- HEAD：`9381503`
- 工作区：dirty；已有多项用户/前序代理修改与未跟踪文件，全部保留。
- 本轮目标：制定 M2 详细施工规格，不实施功能。
- 实际修改文件：本实施日志及当时的两份规划文件；规划文件完成后已清理，当前合同以 `project/contract.md` 为准。
- 字段链变更：无；仅规划。
- 数据迁移：无。
- 已执行命令：
  - `npm run check:ui`：通过（规划前基线）。
  - `npm test`：44/44 通过（规划前基线）。
- 未执行：构建、dry-run、正式打包、真实宿主导入。
- 当前闸门：R37 离线门禁已通过；真实 R33–R37 与 O4 验收仍待完成，M2 不得提前开工。
- 风险：工作区已有改动较多；后续执行者必须逐文件阅读 diff，不得 reset/覆盖。
- 当时的下一步入口为 R37 实机验收；旧清单已随完成阶段文档清理。

---

## 2026-07-25 — R38 — 开工

- 执行者：Claude Code（Fable 5）
- HEAD：`14e9aac`
- `git status --short` 摘要：工作区仅见未跟踪临时文件 `_bad.cjs`、`_gal_parts1.txt`、`_git_push_*`、`tavernweave-skills/`；无已修改跟踪文件。
- 前置闸门证据：
  - 当时 R37 仍等待真实新聊天验收。
  - 用户本轮明确授权：开始执行计划，一路完成 M2 全部更新，并写入实施日志。
  - 因此本代理在维护源推进 R38–R45 候选实现；**不**把 R37/M1 标为 accepted，**不**把离线门禁写成实机验收，**不**在无单独授权时正式打包。
- 本轮唯一目标：R38 开放庭园与背包底座（schema/迁移/时间序号/背包壳/来访调度底座/毕业派生）。
- 预计修改文件：`src/schema/*`、`src/ui/time-rules.ts`、`src/ui/state-migrations.ts`、`src/ui/types.ts`、`src/items/*`、`src/visitors/*`、`src/ui/inventory-*`、`src/ui/visitor-rules.ts`、`src/ui/open-garden-rules.ts`、UI 入口、测试、manifest、本日志。
- 明确不修改：`dist/` 成品、R34/R37 历史检查点、真实 Luker 数据。
- 已知风险/冲突：R37 实机未验收；用户已授权继续 M2 维护源实现。

---

## 2026-07-25 — R38–R45 — 收工（维护源候选完成）

- 执行者：Claude Code（Fable 5）
- 结论：维护源候选完成（离线门禁通过）；**不是**实机验收通过；**未**正式打包
- HEAD：`14e9aac`（开工基线；本轮未提交 git）
- 实际修改/新增文件（核心）：
  - 目录：`src/items/catalog.json`、`src/visitors/visit-profiles.json`、`src/facilities/catalog.json`、`src/facilities/risk-conditions.json`
  - 规则：`src/ui/time-rules.ts`、`inventory-rules.ts`、`inventory-view.ts`、`visitor-rules.ts`、`anomaly-rules.ts`、`facility-rules.ts`、`activity-rules.ts`、`prompt-context.ts`、`open-garden-rules.ts`、`special-item-rules.ts`、`shop-rules.ts`、`shop-view.ts`、`state-migrations.ts`、`types.ts`
  - 宿主/UI：`src/ui/app.ts`、`src/ui/bridge.ts`、`src/ui/index.html`
  - 契约：`src/schema/initial-state.json`、`src/schema/02-mvu-schema.js`、`src/schema/field-ledger.md`、`src/shop/catalog.json`
  - 配置：`package.json`、`project/manifest.json`
  - 测试：`tests/m2-r38-r45.test.mjs`、`tests/ui-contract.test.mjs`（R36 语义改为自定义异变）
  - 文档：本日志、`project/agent-handoff.md`
- 字段链变更：
  - 新增 `anomaly_cycle` / `visit_scheduler` / `facility_runtime` / `garden_projects` / `garden_activities` / `scene_item_context` / `ui_flags` / `presence_snapshot.visitor_meta`
  - 全链：ledger → initial → schema → migration → types → rules → UI/prompt → tests
- 数据迁移：旧 `events.waiting_events` 保留且不提升为七日异变；M2 字段幂等补默认值
- 命令与结果：
  - `npm run check:ui`：通过
  - `npm test`：56/56 通过
  - `npm run build:ui`：通过
  - package dry-run：`node scripts/package-checkpoint.mjs --checkpoint=0.2.0-r45 --dry-run` 通过
    - 输出路径：`dist/checkpoint-0.2.0-r45/幻想乡物语-测试检查点-0.2.0-r45.json`
    - bytes：`30141017`
    - SHA-256：`c7c5d497136fe122d6c71c3746cbe02a9c7938940eba53d999fb7526cc42cfc4`
    - UI 脚本：`gensokyo-garden-ui-020-r45`
    - 世界书：16
  - 正式打包：未授权，未执行
- 分检查点覆盖（均以离线测试证明，非 Luker 实机）：
  - R38：毕业派生、period serial、背包壳、来访底座、迁移
  - R39：自定义异变预留/提交/取消、28 时段、隐藏源头隔离、每日线索、历史
  - R40：妖精花园建造 4 / 换型 2、12/24 解锁、糖果包
  - R41：月见温泉建造 6、公开/独处会话、茶/香包
  - R42：宴会广场建造 5、排期≤4、6 人上限、食盒/鬼酒
  - R43：怀表不推进 serial / 不缩短异变与设施期限、咲夜认识门槛
  - R44：场景道具最多 3 种、收尾清理、修缮包修复、异变+道具同时投影
  - R45：离线门禁与 dry-run 候选准备
- 未执行事项：
  - R37 真实 Luker 集中验收仍未做
  - R38–R45 真实导入与新聊天验收未做
  - 正式 `--` 无 dry-run 打包未做
  - 设施正文/装修的完整 LLM 宿主事务接线仍偏规则层；UI 入口已有背包/开放庭园/异变表单，完整 GAL 装修流程需后续实机联调
- 风险/冲突：
  - 用户授权在 R37 未实机通过的情况下推进 M2 维护源；文档与日志均不把 M1/M2 标为 accepted
  - 2026-07-30 已移除 `prompt()` 最小实现：异变启用、温泉／宴会参数和商店购买确认统一改用项目内置 `<dialog>`，支持取消、长度限制、键盘焦点与窄屏回流。
- 下一步唯一入口：
  1. 按需授权正式打包 R45；或
  2. 先补 R37 真实验收；或
  3. 在真实新聊天中按 R38–R45 矩阵验收维护源候选

### 失败证据

- 无残留失败。开发中曾修：装修事务重复 begin、场景道具 context 克隆丢失、修缮包 reserve 后 runtime 引用失效。

---

## 2026-07-25 — R45 收尾修复 — 收工候选

- 执行者：Codex（审查、修复与离线验证）
- 基线：`14e9aac` 之后的未提交 M2 实现；保留所有用户与前序代理改动。
- 修复范围：隐藏源头泄露、本地字段所有权、异变运行事务、设施/来访/活动运行接线、场景道具成功后消费、正式契约和配置对齐。
- 关键变更：
  - 完整 D0 `stat_data` 只进入变量阶段；剧情请求使用脱敏 `buildPromptContext`。
  - 新增 `m2-commands.ts` 与 `m2-runtime.ts`，bridge 只负责持久化，纯规则继续拥有成本、roll 和状态转移。
  - 异变表单预留后创建真实消息，解析 `GensokyoAnomalyOrigin` 成功才提交；失败自动退卡。
  - 机会面板提供三方案施工、第二方案取得、换型、恢复、快捷行动、邀请、温泉和宴会入口。
  - 邀请制温泉只接受玩家从已到场角色中点名；宴会由玩家选择当前至未来 4 个标准时段，并从已认识角色中点名邀请。
  - 场景道具作为“下一回复使用”选择；回复成功才消费，同场最多三种，最终收尾后清除。
- 离线验证：
  - `npm run build:ui`：通过。
  - `npm run check:ui`：通过。
  - `npm test`：59/59 通过。
  - `npm run package:checkpoint:dry`：通过；bytes `30349137`；SHA-256 `6ec1ce5b9123de0102fa6e1d5196866b0e2aa5973cbf5367baba86037849245b`。
  - `git diff --check`：通过（仅有 Git 的 LF/CRLF 提示，无空白错误）。
  - 正式打包：未执行；dry-run 未写入 R45 验收目录。
- 当前配置：下一离线候选为 `0.2.0-r45-m2-offline-candidate`；当前已登记运行产物仍保持 R34，不伪造 R45 成品。
- 实机状态：未执行；R37 与 R45 的真实 SillyTavern 验收仍待完成。

## 2026-07-25 — R45 验收快进与正式打包

- 执行者：Codex。
- 用户授权：增加多个验收快进按钮并正式打包。
- 新增快进：开放庭园、异变卡、异变第 7 日收束、三设施全建成、来访与活动、道具与设施修复；连同旧入口共 9 个按钮。
- 安全边界：每个入口只写受控测试快照、不发送消息、不调用 LLM；宿主写入后按对应检查点复读校验。
- 验收清单已归档清理；当前行为以源码测试和 `project/contract.md` 为准。
- 门禁：`npm run build:ui`、`npm run check:ui` 通过；`npm test` 60/60 通过。
- 打包：dry-run 通过后执行 `npm run package:checkpoint`；拒绝覆盖策略生效，R45 目录此前不存在。
- 正式候选：`dist/checkpoint-0.2.0-r45/幻想乡物语-测试检查点-0.2.0-r45.json`。
- bytes：`30376463`。
- SHA-256：`70ce77350f66b89fb3b52eb460d5614e481f292b7b35e4a2590332aee56335c1`。
- 产物复读：`chara_card_v2`、角色版本/世界书/脚本 ID 均为 R45，16 条世界书，9/9 快进按钮存在。
- 状态：离线候选完成；真实 SillyTavern 验收尚未执行，不标记 accepted。

---

## 模板：YYYY-MM-DD HH:mm — RNN — 开工

- 执行者：
- HEAD：
- `git status --short` 摘要：
- 前置闸门证据：
- 本轮唯一目标：
- 预计修改文件：
- 明确不修改：
- 已知风险/冲突：

## 模板：YYYY-MM-DD HH:mm — RNN — 收工 / 停工

- 执行者：
- 结论：候选完成 / 停工 / 未通过
- 实际修改文件：
- 字段链变更：
- 命令与结果：
- 下一步唯一入口：
