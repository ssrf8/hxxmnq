# 当前 Agent 交接

更新时间：2026-08-11。

## 已完成

- 2026-08-11：妖梦、帕秋莉、早苗完成正式登记。三人均为 `eligibility: always` 的带权随机来访，无剧情或设施前置；新旧存档都会补齐角色与独立 visit memory。
- 三人地图动画与 30 张 GAL `normal/nude` 反应图已接入；妖梦和早苗的左右运行源已纠正，三人静态图改用独立四视图，早苗右视图由左视图镜像。源动画图片数量保持妖梦 28×4、早苗 35×4、帕秋莉 26×4。
- 三人动静帧已按所有者提供的四方向参数独立校准，动画统一为 48ms/帧；同画布校准台已加入 UI 构建。`sexual_pose_sources` 仍保持空对象。
- 妖梦、帕秋莉、早苗的人设世界书已扩充；“剑术特训”和“昏睡红茶·半梦半醒”已登记为商店开放后直接可买的场景消耗品，分别为 26/22 金币。道具绿灯、购买、扣款、入库测试通过。
- 世界书角色/道具 UID 重叠已消除：道具条目使用 `100 + index`，打包器会拒绝重复 ID。
- R2 generation 6 已按 media-first / manifest-last 发布：替换 5 个动静态 WebP，最终 251 files / 354,058,350 bytes，manifest SHA-256 为 `d2cb6a317f449ff7bac92906393948b253d6b421825c78874941792860e1a57f`；S3 与生产域名双通道读回均通过。
- 三人弹幕 Boss 四状态图已确定性抠图并接入对战视觉与构建链；原始 `1536×1536` 图片完整归档。R2 generation 7 新增 3 个 WebP（无替换），最终 254 files / 355,238,436 bytes，manifest SHA-256 为 `6b6bd8afa66e36e5bce9ddd9b56fd86cdb174d6037c7fa44bc15e82fdeec80b2`，生产读回与本地 SHA-256 一致。

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
- `npm test`：739 项中 734 通过、5 失败，不能标记为全绿。
- `npm run build:ui:standalone`：通过；2,196,294 bytes，SHA-256 `8b35d93631cf0eb038a20acf1b91e99b998974e5188845e1faf3d5857f80c2f3`。
- 嵌入式 `package-checkpoint` dry-run：通过；远程 UI 打包 dry-run 因当前未生成 production/test loader 而不能作为通过项。
- `git diff --check`：通过。
- R2 generation 7 的 3 个 Boss 新增对象均通过 MIME、长度和 SHA-256 校验；生产 manifest 为 generation 7 且 `Cache-Control: no-store`。
- Presence 真实 SillyTavern 验收：通过。

## 后续工作

- **P0：恢复全量测试基线。** 当前 5 个失败为：
  1. `tests/new-character-integration.test.mjs` 读取不到维护源 `旧素材/素材处理/CG/妖梦/正常 sfw.png`；需要恢复所有者原图，或把测试改为项目现存的权威归档来源。
  2. 两项 `tests/ui-channel.test.mjs` 发布测试被项目根 `.env` 的 Cloudflare 控制台分段格式阻断；发布脚本只认标准 `KEY=value` dotenv。不得在日志中打印或提交密钥。
  3. UI 测试入口打包缺少 `dist/runtime/test/profiles/standalone-mvu/ui-loader.js`；需要用新的 `test-rNN` 完成一次测试通道 remote build 后再跑打包 dry-run。
  4. `tests/ui-contract.test.mjs` 的“开放庭园页面从正式状态派生教程进度与下一步”仍得到空文案；需要判断是实现回归还是旧断言过期。
- **P0：重新打包并在真实 SillyTavern 验收本轮功能。** generation 7 已提供媒体，但 Boss 路由与其他本轮逻辑仍需进入新角色卡/UI 包；实际检查三角色动静切换、左右朝向、Boss 四状态、商店购买、消费、绿灯加载与场景结束回收。
- **P1：整理工作树。** 当前有大量已修改/未跟踪文件及历史诊断产物；正式打包或提交前必须区分本轮源码、用户素材与临时日志，不得批量清理或误提交。
- **P1：三名新角色 sexual 姿势池仍为空。** 这是明确保留状态，不影响 normal/nude 与地图动画，但如要完整 GAL sexual 表现仍需后续素材与 manifest 登记。
- 若要比较 `standalone-mvu` 与 `database-assisted`，单独执行 A11，避免污染现有验收聊天。
- 发布测试 UI 时使用新的 `test-rNN`，不得覆盖既有版本。
- 构建、发布、打包仍是不同授权边界；源码完成不自动授权上传或正式发布。

M2 维护源仍按候选状态管理，具体功能以源码、测试和 `project/contract.md` 为准。
