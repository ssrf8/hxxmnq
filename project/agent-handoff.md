# 当前 Agent 交接

更新时间：2026-08-12。

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
- 普通角色对话已改为等待玩家首轮输入；空输入不发送，未发送直接结束不创建楼层或调用 LLM。
- 回想画廊已接入“幻想乡案内”：只读最近 1000 个真实楼层，支持起止范围、滑杆定位、逐 beat 回放和范围内图片网格。实现与验收步骤见 `project/gal-first-input-and-history-gallery-plan.md`。
- 怀表主动解除与符卡胜利要求放弃已通过实机验收，相关临时测试控制台入口已移除；记录见 `project/2026-08-11-watch-duel-bugfix-acceptance.md`。
- “幻想乡案内”的活动异变区已增加“立刻结束异变”：确认后由本地命令把正式时间推进到异变期限，归档并清空当前异变，再统一协调期间到期的设施、活动、待办与来访；不调用 LLM。
- 咲夜怀表已实现真实五分钟期限；顶栏显示 `时停 MM:SS`，到点自动解除并保留当日冷却。主动解除和跨正式时段推进仍可提前结束，旧的无期限激活态会在界面恢复时安全解除。
- 新手教程以解决温室妖花核心正常毕业；妖花调查现使用一次性固定剧情并在正文结束后引导玩家返回庭园选择符卡战或剧情解决。正式跳过按钮则直接结束全部新手教程、撤下指引并停在三种温室形态待选状态，不自动选型。
- 本地白名单剧情（含全部新手教程）收到非空 assistant 回复后直接完成本地结算。VisitTurn 任务改为尽力记录：缺失、错配或摘要失败时清除一次性任务并继续；普通自由对话仍严格拒绝无效 VisitTurn。
- 0.3.0-r7 正式候选已采用 production R2 UI 交付完成打包。UI r7 已上传并公网逐字节读回；正式 JSON/PNG 均已生成，`creator_notes` 为空，PNG 内只有一份 `chara` 且与 JSON 逐字节一致。R2 上已被替代的 production UI r5/r6 源对象已逐个删除并回查为不存在。详见 `project/2026-08-11-release-0.3.0-r7.md`。
- production UI r10 热更新已发布并公网逐字节读回；production manifest 现指向 r10。该版统一释放 GAL 生成异常锁，新增手动“修复”按钮，修正教程第五步事实派生、胜利要求遗留/放弃生成与画廊角色小窗冲突。采用固定 production loader 的既有旧卡刷新后会自动读取 r10，本次未重打角色卡。

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
- `npm test`：760/760 通过。
- production remote UI r10：2,255,171 bytes，SHA-256 `132ee9f852f352bdba796f253b6e2cb64d649a00dd1cbbde7ce73a03fbfcdd04`；R2 上传、production manifest 切换与公网读回通过。
- 首轮输入与回想画廊 UI 契约测试：140/140 通过；相关三组联合回归：178/178 通过。新画廊尚未记录真实 SillyTavern 实机验收。
- production remote `package-checkpoint` dry-run 与正式写入均通过；JSON 329,189 bytes，PNG 1,273,524 bytes。
- `git diff --check`：通过。
- R2 generation 7 的 3 个 Boss 新增对象均通过 MIME、长度和 SHA-256 校验；生产 manifest 为 generation 7 且 `Cache-Control: no-store`。
- Presence 真实 SillyTavern 验收：通过。

## 后续工作

- **P0：在真实 SillyTavern 完成发布后验收。** 重点检查旧卡刷新后 production loader 拉取 UI r9、妖花调查结束后的战斗／剧情解决指引、跳过教程后指引完全消失且停在温室三选一，以及 GAL 子页面返回、剧情召回开关、开放庭院设施折叠、五分钟怀表自动解除、立即结束异变、画廊翻页、固定存档世界书和新角色对战图。
- **P1：整理工作树。** 当前有大量已修改/未跟踪文件及历史诊断产物；正式打包或提交前必须区分本轮源码、用户素材与临时日志，不得批量清理或误提交。
- **P1：三名新角色 sexual 姿势池仍为空。** 这是明确保留状态，不影响 normal/nude 与地图动画，但如要完整 GAL sexual 表现仍需后续素材与 manifest 登记。
- 若要比较 `standalone-mvu` 与 `database-assisted`，单独执行 A11，避免污染现有验收聊天。
- 发布测试 UI 时使用新的 `test-rNN`，不得覆盖既有版本。
- 构建、发布、打包仍是不同授权边界；源码完成不自动授权上传或正式发布。

M2 维护源仍按候选状态管理，具体功能以源码、测试和 `project/contract.md` 为准。
