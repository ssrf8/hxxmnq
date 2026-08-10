# 当前 Agent 交接

更新时间：2026-08-11。

## 已完成

- 2026-08-11：妖梦、帕秋莉、早苗完成正式登记。三人均为 `eligibility: always` 的带权随机来访，无剧情或设施前置；新旧存档都会补齐角色与独立 visit memory。
- 三人地图动画与 30 张 GAL `normal/nude` 反应图已接入；`sexual_pose_sources` 保持空对象，未来由已验证的 R2 manifest 条目自动补池。
- R2 generation 5 已按 media-first / manifest-last 发布：新增 36 项，最终 251 files / 354,034,458 bytes，manifest SHA-256 为 `d1f6d1c4751045a83e52e6e0f7c35f44cd58f927f68e8920d808c24b9ef791de`。

- `<GensokyoPresence>` 已退出当前主模型协议。
- bridge 会在玩家楼层冻结并投影 `visit_summary_task` 与 `presence_analysis_task`。
- 额外变量模型只填写任务已有槽位的开放叶字段；bridge 验证任务信封、角色、基线、区域和提交身份后落盘。
- Presence 移动、离场和 VisitTurn 二阶段结算已经真实环境验收。
- V2 二阶段持久化具备幂等短路，不再重复消费已清除的任务而误报 `missing-task`。
- A07_leave 测试按钮已按新事务 `transactionId` 等待生成阶段，不会把上一轮 `settled` 当成本轮终态。
- 变量初始化世界书条目保持关闭；新聊天初始状态由打包的 MVU initvar 提供。

## 验收结论

- Presence 全流程：通过。
- A01–A10：通过，包括 A06 非法输出拒绝、A07 多角色／生成期间离场和 A10 10/10 压力轮。
- dismiss / end_chat：通过。
- A11 是跨 profile 独立比较，不属于本次 Presence 通过条件；需要时在单独聊天执行。

最终记录：`project/2026-08-10-presence-extra-model-acceptance-results.md`。

## 当前硬边界

- `presence_snapshot` 与 `interaction.visit_memory` 只由 bridge 写入。
- `presence_analysis_task` 只处理本轮开始时已在场的冻结角色，不负责邀请、召回或创建来访。
- `move` 只接受已登记区域；证据不足使用 `uncertain`，正文无变化使用 `unchanged`。
- VisitTurn 只保存五字段语义记录，关系变化写进剧情梗概，不恢复退役关系数组。
- 结算必须绑定真实 request / attempt / commit / assistant 楼层；不得用正文猜测身份。
- 本地关键状态不能通过替换父对象被变量模型绕过。

## 当前验证基线

- `npm run check:ui`：通过。
- `npm test`：734/734 通过。
- `npm run build:ui:standalone`：通过。
- `npm run package:checkpoint:dry`：通过；没有生成或发布正式角色卡。
- `git diff --check`：通过。
- R2 新增 36 项：S3 签名 GET 与生产域名 GET 均通过 MIME、长度和 SHA-256 校验；生产 manifest 为 generation 5 且 `Cache-Control: no-store`。
- Presence 真实 SillyTavern 验收：通过。

## 后续工作

- 若要比较 `standalone-mvu` 与 `database-assisted`，单独执行 A11，避免污染现有验收聊天。
- 发布测试 UI 时使用新的 `test-rNN`，不得覆盖既有版本。
- 构建、发布、打包仍是不同授权边界；源码完成不自动授权上传或正式发布。

M2 维护源仍按候选状态管理，具体功能以源码、测试和 `project/contract.md` 为准。
