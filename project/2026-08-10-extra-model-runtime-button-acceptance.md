# 额外模型与角色离场实机验收

状态：代码与离线门禁通过；真实 SillyTavern 验收待监听 Agent 执行。

本页只记录这次小改动，不替代完整手册 `D:\浏览器下载\2026-08-10-extra-model-variable-runtime-acceptanc..md`。

## 候选构建

| profile | 测试 UI | SHA-256 |
| --- | --- | --- |
| standalone-mvu | `dist/runtime/test/profiles/standalone-mvu/ui-mount-test-r19.js` | `c46a6469677745a03510fb20c0bfd89ba348fc1e7cfb4493a0349d881a74acdb` |
| database-assisted | `dist/runtime/test/profiles/database-assisted/ui-mount-test-r19.js` | `a368b9d1c432b7688ab93f1dbf136e94b86d688ca33607c464c27b27df3ccfe0` |

两份都只是本地测试通道构建，未上传、未发布、未打包角色卡。

## 普通聊天发送合同（test-r19）

正常链路只有：发送真实 user 楼层 → 收到唯一 assistant 回复 → 更新该回复楼层的 MVU → 解除发送占用。

- 生成期间只保留临时防双击；生成或写入结束后必须释放。
- 尚未收到 assistant 时失败，保留“重试生成”。
- assistant 已经保存后，MVU、VisitTurn、receipt 或其他归档失败只显示警告，不得阻断下一轮发送。
- 重载遇到“assistant 已存在但归档未完成”时直接开放发送，不自动重新调用模型。
- 已移除每 500ms 自动尝试结算的后台轮询；结算只由本轮发送流程和明确的宿主事件触发。

实机验收增加一项：制造一次 assistant 已保存、MVU 归档失败的情况，确认页面显示警告后仍能立即发送下一条；刷新页面后也必须保持可发送。

## 使用方法

1. 新建专用测试聊天，确认额外模型解析已启用。
2. 按完整手册第 4 节先安装事件监听和 `replaceMvuData` 观察，再打开庭园设置。
3. 设置页中的“测试控制面板”现在常显。
4. 可逐项点击，也可点击“自动顺序运行”。“完成当前项后停止”不会中断正在进行的生成。
5. 每项完成后按监听记录、目标 message-scope 三次复读和 frozen request 判定；按钮显示“完成”不等于实机 PASS。

## 按钮与判定重点

| 按钮 | 主要检查 |
| --- | --- |
| A01 空补丁 | 额外模型输出 `[]`；bridge 仍写一个 VisitTurn |
| A02 合法语义更新 | 只写开放语义字段；刷新后仍存在 |
| A03 独占字段攻击 | resources/events/uid/visit_memory 等禁写字段最终不被污染 |
| A04 固定事件 | 灵梦结界检查只结算一次，变量模型不抢写本地字段 |
| A05 时间单调 | 倒退和“下午”不进入正式状态 |
| A06 非法输出 fixture | 监听 Agent 必须在发送前准备额外模型非法输出；按钮不改宿主配置 |
| A07 双角色 Visit | `relevantCharacterIds` 含灵梦、魔理沙；两人各写自己的冻结父级 visit |
| A07 生成期间离场 | 请求冻结两人 visit；生成中本地送别魔理沙；魔理沙 turn 写入刚关闭的旧 visit，不写新 visit |
| A08 下一轮召回 | frozen request 中只有合法 syntheticHistory，不带真实旧楼层 |
| A09 邀请制隔离 | 全局 presence 仍保留三人；活动相关角色、场景事实、绿灯和 VisitTurn 只含灵梦；其他人不得乱入 |
| A10 十轮压力 | 每轮身份、落盘与下一轮发送均正常；任一失败即 FAIL |
| A11 Profile 边界 | 两个 profile 分别加载后比较 frozen request、syntheticHistory 与 hash |
| 修复项：真正离场 | 灵梦从 presence、地图和后续候选消失；active visit 关闭；旧排期取消 |
| 对照项：只结束聊天 | 灵梦仍在庭园，active visit 不切换 |

## 修复合同

- “结束聊天”只结束当前交互，不代表离开庭园。
- “送别离开庭园”是本地确定性事务：删除 presence/view/meta，关闭旧 visit，取消未完成排期并设置短冷却。
- 邀请制活动只改变本轮叙事范围，不删除庭园里未受邀角色。
- 邀请制的 `sessionParticipants` 同时约束相关角色、冻结 visit、syntheticHistory、真实 user 楼层场景事实和角色绿灯。
- 私密活动不得因为参与者名单较小而输出 `GensokyoPresence` 删除其他庭园角色。

## 实机结果记录

| 用例 | 结果 | request / assistant message | 关键证据 | Console |
| --- | --- | --- | --- | --- |
| A01 |  |  |  |  |
| A02 |  |  |  |  |
| A03 |  |  |  |  |
| A04 |  |  |  |  |
| A05 |  |  |  |  |
| A06 |  |  |  |  |
| A07 双角色 |  |  |  |  |
| A07 离场 |  |  |  |  |
| A08 |  |  |  |  |
| A09 |  |  |  |  |
| A10 |  |  |  |  |
| A11 |  |  |  |  |
| 真正离场 |  |  |  |  |
| 结束聊天对照 |  |  |  |  |

总体结论只能写 `PASS / FAIL / BLOCKED`。A06 没有可控 fixture 时写 `BLOCKED_MODEL_FIXTURE`；A11 只跑一个 profile 时写 `NOT_RUN_SINGLE_PROFILE`，不要补想象证据。
