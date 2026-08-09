# `gal-prompt.v3` 浏览器实机验收手册

> 历史文档：本手册只适用于旧 `gal-prompt.v3` 双注入语义。当前 `gal-prompt.v5` 已把玩家原文、正文协议与脱敏投影原子写入同一条真实 `role:user` 楼层，并只保留不可见扫描胶囊；不得用本手册宣称 v4 或 v5 验收通过。

> 面向接手验收的 Agent。目标不是“看起来能聊天”，而是在真实 SillyTavern 中证明：正文协议与脱敏投影位于玩家输入之后；绿灯只参与世界书扫描、不进入最终模型提示；角色、道具和开场条目只被可信路由键精准召回。

## 1. 验收结论边界

本手册只验收以下改动：

1. 新请求使用 `gal-prompt.v3`，并固定携带两条注入：
   - 上下文尾注入：`position:'in_chat' / depth:0 / role:'system' / should_scan:false`；
   - 路由扫描胶囊：`position:'none' / depth:0 / role:'system' / should_scan:true`。
2. 最终模型消息序列中，玩家原文后方存在一条 system 消息，包含：
   - `【庭园正文协议】`；
   - `【庭园在场快照：本轮唯一事实】`；
   - `【场景事实】`或本轮对应的场景投影；
   - `【本轮道具授权】`或明确的无授权状态。
3. 最终模型提示中不出现任何 `GSK_*` 路由键，也不出现“角色档案绿灯／道具档案绿灯”包装段。
4. 世界书扫描仍能依据不可见胶囊召回本轮获授权的角色、道具或开场条目。
5. 玩家自然语言、历史文本、正文协议和脱敏投影不能误召回这些选择性条目。
6. send、retry、regenerate 对同一冻结请求保持同一 `promptRevision`、注入内容与 hash。

以下内容不属于本轮 PASS：仅观察模型文风、离线预览、Node 测试、源码推断、单张 UI 截图。它们可以辅助定位，但不能代替真实最终 Prompt 和世界书激活证据。

## 2. 必读顺序

开始操作前依次阅读：

1. `project/contract.md` 中的 GAL 请求期注入合同；
2. `project/api-provenance.md` 顶部“GAL 请求期楼层注入”章节；
3. `project/gal-prompt-floor-injection-plan.md` 顶部 v3 修订说明；
4. `src/ui/gal-prompt-injection.ts`；
5. `src/ui/character-greenlights.ts` 与 `src/ui/item-greenlights.ts`；
6. `scripts/package-checkpoint.mjs` 中 `routedEntry`、角色／道具／开场世界书条目。

不要把 v2 基线正文里“唯一 depth 1 注入”的旧描述当作当前实现；顶部 v3 修订覆盖它。

## 3. 环境与授权前置条件

目标运行时：

- SillyTavern `1.18.0`；
- JS-Slash-Runner / Tavern Helper `4.8.18`；
- 浏览器访问真实 SillyTavern 宿主，而不是 `dist/ui/index.html` 离线预览。

开始前必须记录：

| 项目 | 实测值 |
| --- | --- |
| SillyTavern 版本 |  |
| Tavern Helper 版本 |  |
| 浏览器及版本 |  |
| 视口／缩放 |  |
| 角色卡文件名、checkpoint |  |
| 角色卡 SHA-256 |  |
| 当前聊天名、消息数 |  |
| 新导入还是已有角色 |  |
| 角色绑定世界书名 |  |
| 其他全局／角色／聊天世界书 |  |
| 模型后端与是否流式 |  |
| 对应聊天 JSONL 路径 |  |

### 3.1 产物停止线

当前仓库政策是 `no-package-without-explicit-user-request`。旧 r94 卡不含本轮 v3 改动，禁止拿它验收后声称 v3 PASS。

- 若所有者已经提供由当前工作区构建的 v3 候选卡：记录文件路径与 SHA-256后导入。
- 若没有候选卡，且所有者没有明确授权构建／打包：停止，报告 `BLOCKED_NO_V3_ARTIFACT`。
- 若所有者明确授权构建／打包：先运行静态门禁，再按项目 pipeline 生成独立候选 checkpoint；不得覆盖旧产物，不得上传 R2、发布或晋升通道，除非另有明确授权。
- 不得直接修改 SillyTavern 安装目录里的角色、世界书或扩展文件来伪造通过。

### 3.2 浏览器驱动能力

驱动必须能够：

- 附着真实宿主页并识别顶层文档及相关 iframe；
- 点击、输入、切换页面和等待生成结束；
- 收集顶层及同源相关 frame 的 console error/warning；
- 打开并读取 SillyTavern 的最终 Prompt 检查视图，或获取等价的最终请求消息数组；
- 对世界书绑定与条目状态做只读核对；
- 截图保存视觉证据。

若只能截图、不能读取最终 Prompt 的消息角色和顺序，则不能判定本验收 PASS，应报告 `BLOCKED_PROMPT_INSPECTION`。

## 4. 隔离与证据纪律

1. 使用专门的验收聊天；测试跳转、道具消耗和生成都会修改该聊天状态。
2. 测试前列出所有会参与扫描的世界书。能经所有者授权临时停用无关全局世界书时，记录原状态并在结束后恢复；不能停用时，保留它们并在报告中区分“本卡条目”与“外部条目”。
3. 不记录 API key、cookie、授权头、账号标识或私人世界书全文。
4. 每个用例从动作前 console 基线开始；动作后只记录新增错误。
5. Prompt 证据至少包含消息角色、相邻顺序和必要的短片段。不要把整份私人聊天或完整请求上传到报告。
6. 世界书是否触发，以最终 Prompt 中出现对应条目正文／Prompt 检查器的激活条目为准；模型输出像不像该角色不算证据。
7. `position:none` 的扫描胶囊本来就不应进入最终 Prompt。不要因为看不见它便判失败；要用“对应条目被激活且 `GSK_*` 不可见”共同证明。

### 4.1 已授权的 SillyTavern 聊天文件只读核对

所有者已明确授权验收 Agent 读取 `F:\agent airp\SillyTavern` 下与本次测试对应的聊天文件。该授权是**只读诊断授权**，不包括编辑、替换、删除、恢复备份、批量导出其他聊天或修改 SillyTavern 配置。

当前安装已发现的用户数据根目录是：

```text
F:\agent airp\SillyTavern\data\default-user
```

单人聊天通常位于：

```text
F:\agent airp\SillyTavern\data\default-user\chats\<角色目录>\<聊天名>.jsonl
```

当前机器曾存在如下项目聊天目录，可作为路径形态参考，但不得直接假定它就是本轮活动聊天：

```text
F:\agent airp\SillyTavern\data\default-user\chats\幻想乡物语 [UI测试版]1\
```

定位纪律：

1. 先从浏览器记录当前角色显示名、角色卡文件身份、聊天名与最近消息标记。
2. 再在 `data\default-user\chats` 中按角色目录和最近修改时间缩小范围。
3. 只读取候选 JSONL 的首行、尾部必要消息和 metadata 结构；用本用例唯一 marker 确认对应关系。
4. 若两个文件都可能对应，回到浏览器再发一个无歧义 marker 后观察哪个文件的长度／修改时间变化；不要靠猜测选择。
5. 读取前后记录文件路径、长度和 `LastWriteTime`；Agent 的核对过程不得造成任何写入。

SillyTavern JSONL 中首行通常是聊天 metadata，后续每行是一条消息。ST 1.18 的自定义请求 metadata 可能出现在以下位置之一：

```text
message.extra.galGenerationRequestV2
message.extra.extra.galGenerationRequestV2
message.swipe_info[activeSwipe].extra.galGenerationRequestV2
message.swipe_info[activeSwipe].extra.extra.galGenerationRequestV2
```

验收时按当前活动 `swipe_id` 读取对应 `swipe_info`，不得只看数组最后一项。需要核对的字段仅限：

```text
schema
requestId
attemptSeq
promptRevision
promptInjects
promptInjectsHash
historyRevision
memoryRevision
relevantCharacterIds
```

聊天文件可以证明请求 metadata、活动 swipe、落楼内容和浏览器当前聊天是否一致；它**不能单独证明最终发送给模型的 Prompt 顺序或世界书实际激活**。P01–P08 仍必须保留浏览器 Prompt 检查证据。

不得在报告中粘贴完整 JSONL、完整角色私密对话、整段 synthetic history 或其他无关聊天。只报告字段形状、计数、hash、revision、必要短片段和用例 marker。

## 5. 导入后预检

在新建聊天前完成：

1. 确认选中的角色卡就是记录过 SHA-256 的 v3 候选产物。
2. 确认角色卡脚本、regex、MVU loader、UI loader 和绑定世界书均存在且启用；Tavern Helper 角色脚本若需手动启用，按当前安装实际界面启用并记录。
3. 只读检查绑定世界书：
   - 开场选择性条目键为 `GSK_OPENING_GUIDANCE_ACTIVE`；
   - 角色条目只使用 `GSK_CHAR_*_ACTIVE`；
   - 道具条目只使用 `GSK_ITEM_*_ACTIVE`；
   - 上述选择性条目均为区分大小写、整词匹配；
   - `exclude_recursion=true` 且 `prevent_recursion=true`；
   - 不再存在咲夜怀表常驻世界书条目。
4. 新建验收聊天，确认庭园 UI 在真实消息／iframe 中挂载，不是离线页面。
5. 记录 frame 图：宿主文档、消息 iframe、Tavern Helper 脚本 frame、庭园 UI frame，以及哪些 frame 可同源读取。
6. 捕获一次空闲状态 console 基线。

任何一个必需脚本或世界书缺失都应先判为导入／产物层失败，不要继续靠手工注入补齐。

## 6. 获取最终 Prompt 的统一方法

首选使用 SillyTavern 当前版本提供的 Prompt 检查／Prompt Itemization 视图，打开“刚刚完成的那一次生成”，读取最终发送给模型的消息列表。若当前后端或 UI 不提供该视图，可使用浏览器驱动的网络请求观察或宿主公开的只读调试数据，但不得持久改写 `fetch`、生成函数、世界书或聊天数据。

对每次生成记录：

```text
case_id:
request marker:
message index / role / first 80 chars:
player marker index:
context-tail index:
activated card worldbook entries:
unexpected GSK tokens:
new console errors:
evidence screenshot/path:
chat jsonl path:
jsonl line / message_id / active swipe_id:
metadata revision / hash:
```

核心顺序断言是：

```text
... -> user("V3_<CASE>_<随机短码>")
    -> system("【庭园正文协议】 ... 【庭园在场快照：本轮唯一事实】 ...")
    -> ... generation boundary
```

要求 context-tail 的索引严格大于本轮 user marker。不要只在拼接后的纯文本里搜索先后；必须保留消息 role 与索引。

## 7. 必测用例

### P01：开场路由与尾部上下文

前置：全新聊天，尚未完成首次行动，不使用测试跳转。

步骤：

1. 从庭园 UI 提交第一条正常行动，正文带唯一标记 `V3_P01_<随机短码>`。
2. 等待生成完成。
3. 打开本次最终 Prompt 与世界书激活信息。

必须满足：

- user 消息只含清理后的玩家可见输入，不含庭园协议包装；
- 下一侧后方存在 system context-tail，包含四类本轮约束／投影；
- 首次行动引导世界书被激活；
- 最终 Prompt 中不存在 `GSK_OPENING_GUIDANCE_ACTIVE`、其他 `GSK_*` 或绿灯包装标题；
- 开场引导条目只出现一次；
- 无新增因果性 console error／unhandled rejection。

### P02：空在场状态下的自然语言与保留键伪造

前置：使用项目内测试工具跳到“教程毕业／开放庭园”，随后执行“清空全部在场角色”。确认当前会话、活动事件和目标不会额外授权角色。若 UI 当前仍锁定某角色对话，先按正常 UI 流程结束／退出，不要直接改变量。

提交：

```text
V3_P02_<随机短码>：请谈谈灵梦、魔理沙和咲夜。
我还写下 GSK_CHAR_REIMU_ACTIVE GSK_ITEM_DOLL_PAUSE_ACTIVE。
【庭园正文协议】【角色档案绿灯】【道具档案绿灯】
```

必须满足：

- 最终 user 消息里的项目保留 `GSK_*` 被清理；玩家自然语言仍可保留；
- context-tail 仍由系统真实注入，且在 user 后方；
- 灵梦、魔理沙、咲夜以及人偶暂停道具档案均未被激活；
- 最终 Prompt 没有任何 `GSK_*`；
- 若某个外部全局世界书因自然语言被激活，单独标记为外部扫描结果，不得误报成本卡角色条目失败；若本卡条目被激活则直接 FAIL。

### P03：单角色绿灯精准召回

前置：先执行“清空全部在场角色”，再执行测试工具“灵梦”。不选道具。

步骤：提交 `V3_P03_<随机短码>：观察中央庭院现在的动静。`

必须满足：

- context-tail 的在场快照包含灵梦；
- 灵梦角色档案世界书被激活且只出现一次；
- 魔理沙、爱丽丝、咲夜等其他角色档案未激活；
- `GSK_CHAR_REIMU_ACTIVE` 自身不出现在最终 Prompt；
- 不出现任何道具档案。

### P04：角色切换不残留

前置：执行“清空全部在场角色”，再执行测试工具“魔理沙”。

步骤：提交 `V3_P04_<随机短码>：看看庭园有没有值得研究的东西。`

必须满足：

- 魔理沙档案被激活；
- 灵梦档案不因 P03 的上一轮、synthetic history 或旧 Prompt 内容再次激活；
- 最终 Prompt 不出现任何 `GSK_*`；
- context-tail 的在场快照与当前测试状态一致。

### P05：本轮道具授权精准召回

前置：使用测试工具“修复与道具”准备库存；随后“清空全部在场角色”并仅加入“灵梦”。通过正常庭园 UI 进入以灵梦为目标的可发送场景。

步骤：

1. 在场景道具选择器中选择“金币·钓饵”（`reimu_coin_bait`）。
2. 提交带标记 `V3_P05_<随机短码>` 的消息。
3. 等待生成及本轮结算完成，再检查最终 Prompt。

必须满足：

- context-tail 的 `【本轮道具授权】` 只描述本轮选中的金币·钓饵及其受控效果；
- 金币·钓饵世界书档案被激活且只出现一次；
- 灵梦角色档案被激活；
- 其他七个道具档案与其他角色档案未激活；
- `GSK_ITEM_REIMU_COIN_BAIT_ACTIVE` 与全部其他 `GSK_*` 均不在最终 Prompt；
- 道具只有在生成成功后的正式结算路径中消耗；若生成失败，不应消耗。

### P06：道具授权只活一轮

前置：P05 成功后，不再选择任何场景道具，保持同一角色会话。

步骤：提交 `V3_P06_<随机短码>：继续刚才的话题，但不要再使用道具。`

必须满足：

- 金币·钓饵档案本轮不再激活；
- context-tail 不再声称本轮获得该道具授权；
- 灵梦档案仍可因当前角色目标／在场状态合法激活；
- P05 中的历史正文、道具名称或 synthetic history 不得把道具档案重新召回。

### P07：多角色仅按当前可信状态召回

前置：执行“清空全部在场角色”，再依次加入“灵梦”和“魔理沙”，不选道具。

步骤：提交 `V3_P07_<随机短码>：让在场的人分别说说观察。`

必须满足：

- 仅灵梦、魔理沙档案被激活，各一次；
- 其余角色与全部道具档案未激活；
- 在场快照只列出当前可信状态中的角色；
- 最终 Prompt 不出现 `GSK_*`。

### P08：retry／regenerate 冻结一致性

前置：选取 P03 或 P05 的一条成功请求，确保对应聊天未被其他操作改写。

步骤：

1. 对该请求执行项目 UI 提供的 retry；若 UI 只暴露 regenerate，则执行 regenerate 并注明实际路径。
2. 分别检查原生成与重试／重生成的请求 metadata 和最终 Prompt。
3. 只读打开浏览器当前聊天对应的 JSONL，用本用例 marker 定位 user／assistant 楼层，并按活动 `swipe_id` 读取 `galGenerationRequestV2`；记录字段和 hash，不复制完整注入正文到报告。

必须满足：

- `promptRevision` 均为 `gal-prompt.v3`；
- 两条 `promptInjects` 的公开字段、内容与 `promptInjectsHash` 对同一冻结请求一致；
- context-tail 与路由造成的世界书激活集合一致；
- 最终 Prompt 中仍无 `GSK_*`；
- 不得在恢复时重建为当前新状态，也不得升级／降级 revision。

若浏览器只能看到脱敏诊断，不能读取冻结 metadata 的完整注入，则将 metadata 子项标记为 `BLOCKED_METADATA_INSPECTION`，但仍需完成其余 Prompt 验收。

### P09：旧 v2 请求兼容（有真实旧聊天时才测）

只有存在由旧版本真实生成、metadata 中明确为 `gal-prompt.v2` 的测试聊天时执行。禁止手工伪造生产聊天 metadata 来凑测试。

可以在已授权的 `F:\agent airp\SillyTavern\data\default-user\chats` 范围内按 `gal-prompt.v2` 只读检索候选 metadata，但必须先限制到幻想乡物语角色目录；不得遍历、汇总或输出其他角色聊天内容。找到候选后仍需用浏览器打开该聊天，确认角色、聊天名与活动 swipe 对应，才能作为 P09 fixture。

步骤：对旧 v2 请求执行恢复或重生成，并检查最终配置。

必须满足：

- 仍按一条冻结的 depth 1 system 注入恢复；
- 不被静默升级为 v3 双注入；
- 原 hash 与冻结内容保持一致。

没有真实旧请求时记为 `NOT_RUN_NO_V2_FIXTURE`，不阻塞 v3 主验收，但必须在报告中明确。

## 8. 负向判定与归因

出现以下任一情况，相关用例直接 FAIL：

- context-tail 位于本轮 user 之前，或被合并进 user 内容；
- 最终模型 Prompt 出现任意 `GSK_*`；
- 扫描胶囊中的自然语言、庭园协议或完整投影泄漏进最终 Prompt；
- 仅在玩家提到姓名／道具名时，本卡对应选择性世界书便被召回；
- 未授权角色／道具档案被召回；
- 已授权条目没有召回；
- 选择性条目通过递归扫描诱发另一个角色／道具条目；
- retry／regenerate 对同一冻结请求重算了注入；
- 浏览器出现由本次操作稳定复现的新因果性异常。

归因顺序：

```text
候选产物身份
  -> 导入与世界书绑定
  -> Tavern Helper generate/injects 能力
  -> 请求 metadata 与双注入配置
  -> SillyTavern 世界书扫描
  -> 最终消息组装顺序
  -> 模型请求／响应
  -> UI 落楼与结算
```

先找到最早失败层，不要只报告最后一个空引用或模型回答异常。

## 9. 清理

1. 关闭或删除专用验收聊天前，先确认所有证据已经保存；是否删除由所有者决定。
2. 恢复测试前暂时调整的全局／角色／聊天世界书启用状态。
3. 移除任何临时只读观察 hook；最稳妥的清理方式是刷新页面并确认 hook 不再存在。
4. 不删除候选卡、旧卡、世界书或用户聊天，除非所有者明确授权。
5. 不因实机 PASS 自动发布、上传 R2、打包正式版或修改 released checkpoint。

## 10. Agent 最终报告模板

```markdown
# gal-prompt.v3 实机验收报告

结论：PASS / FAIL / BLOCKED

## 环境
- SillyTavern：
- Tavern Helper：
- 浏览器／视口：
- 候选卡：
- SHA-256：
- 聊天：
- 聊天 JSONL：
- 世界书隔离状态：

## 结果
| 用例 | 结果 | 最终 Prompt 证据 | 世界书激活证据 | Console | 截图／附件 |
| --- | --- | --- | --- | --- | --- |
| P01 |  |  |  |  |  |
| P02 |  |  |  |  |  |
| P03 |  |  |  |  |  |
| P04 |  |  |  |  |  |
| P05 |  |  |  |  |  |
| P06 |  |  |  |  |  |
| P07 |  |  |  |  |  |
| P08 |  |  |  |  |  |
| P09 |  |  |  |  |  |

## 关键证据
- user marker 的消息索引：
- context-tail 的消息索引／role：
- 最终 Prompt 中 `GSK_*` 搜索结果：
- 单角色激活集合：
- 单道具激活集合：
- retry/regenerate revision 与 hash：
- 浏览器消息与 JSONL message_id／swipe_id 对应：

## 失败或阻塞
- 最小复现：
- 最早失败层：
- 第一条因果错误：
- 是否可能为旧产物／缓存：
- 尚缺的权限、设备、扩展或 fixture：

## 清理确认
- 世界书启用状态已恢复：是／否／未改动
- 临时 hook 已移除：是／否／未使用
- 未发布、未上传 R2：是／否
```

只有 P01–P08 的必测部分均有直接证据，且不存在未解释的关键 console 错误时，才能给出 v3 实机 PASS。P09 没有旧 fixture 可以记 NOT RUN；别让一份不存在的古董聊天把大家困到天亮。
