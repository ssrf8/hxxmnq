# BUG 记录：叙事通道授权缺失（统一根因）

> 记录日期：2026-08-11（首次记录）；2026-08-12 增补并修复 BUG-20~23，production UI r10 已发布。
> 状态：BUG-02、BUG-03 已修复并通过实机验收；BUG-05、BUG-08、BUG-12、BUG-13、BUG-15、BUG-16、BUG-17 已修复并通过自动验证；BUG-11 经复核确认为原诊断不成立；BUG-01 代码层面已补投影（2026-08-11 复核确认调用链已接通，**待实机复核确认**）；BUG-04、BUG-06、BUG-07、BUG-09、BUG-10、BUG-14、BUG-18、BUG-19 代码已修复、待实机验收。
> 适用原则：本项目的角色知识只来自目击、告知、调查、推断与既有经历（`src/card/identity.xml:8`）。游戏状态是本地私有后台事实，任何机制要在叙事中生效，都必须经过一层显式的"投影 / 授权 / 解除 / 恢复"衔接。下表 BUG-01~04 全部是**数据通道做完了、叙事通道缺了那一环**；BUG-05 及 BUG-09~19 为独立根因（见下），不适用该模式。

## 统一根因模式

- **数据通道**（bridge 结算、`stat_data`、世界书投影）＝本地权威，机制在这里"生效"。
- **叙事通道**（每轮拼装的 user 楼层：协议 + 在场快照 + 场景事实 + 授权块）＝模型唯一可见，机制要在这里"被宣告"。
- 每次新增机制时只做了数据通道（状态写入 / 规则存储），漏做叙事通道（投影 / 效力声明 / 解除与恢复路径）→ 四个症状（BUG-01~04）：

| Bug | 状态 | 统一模式变体 | 缺失的那一环 |
|---|---|---|---|
| BUG-01 设施建好角色觉得破 | 代码已补投影，待实机复核 | 写入 ≠ 投影 | 【场景事实】缺“已建成设施清单” → 已由 system history 的【庭园设施现状】补齐（见 BUG-01 复核结论） |
| BUG-02 怀表后角色无法互动 | 已修复、已验收 | 生效 ≠ 可解除 | 已补主动解除入口，保留冷却与时间痕迹 |
| BUG-03 胜利要求卡死 | 已修复、已验收 | 锁定 ≠ 可恢复 | 已补本地放弃入口并阻止重复生成；遗留触发点见 BUG-08 |
| BUG-04 色色异变抵抗过强 | 代码已修复，待实机验收 | 授权 ≠ 声明 | 活动异变块现已声明规则效力及不可越界推导的边界 |
| BUG-05 教程卡温室选型、快进强制自由生长 | 已修复、自动验证通过 | 正式入口误用测试跳关；入口可见性缺失 | 跳过教程现撤下全部指引并停在选型前且不代选；三个选型入口始终可见并展示禁用原因 |
| BUG-06 温室妖花核心战失败 → 形态线永久锁死 | 代码已修复，待实机验收 | 战败误记为进度完成 | loss 写入完成标记、设施后果与后续解锁，且没有重打路径；现已改为只结束本次战斗并允许重试 |
| BUG-07 宿主异常 → 永久“生成中”→ 新聊天冻结 | 代码已修复，待实机验收 | 锁定 ≠ 可恢复 | 原生 `/trigger`、事务 `/continue` 已用带 epoch 保护的 `try/finally` 清理宿主忙碌标志 |
| BUG-08 胜利要求失败残留 + 软成功误导 | 已修复、自动验证通过 | 锁定 ≠ 可恢复 | V2 先构造再上锁；正文已保存但结算失败时明确警告，不再误报“已落盘” |
| BUG-09 战斗结算 ID 确定性重复 | 代码已修复，待实机验收 | 独立根因 | 每个战斗实例现有独立 run ID，相同配置与结束帧也不会生成相同结算 ID |
| BUG-10 暂停期间按炸弹 → 恢复后自动消耗 | 代码已修复，待实机验收 | 独立根因 | 键盘 Esc 切换暂停后现会立即清除瞬态输入 |
| BUG-11 存档写入非原子 | 复核关闭（原诊断不成立） | 误报 | 覆盖存档在一次 `updateWorldbookWith` 回调中提交完整新数组，没有“先删后写”的两次宿主调用 |
| BUG-12 历史先截断后迁移 | 已修复、自动验证通过 | 独立根因 | 现已先把完整 conversation_log 迁入角色记忆，再保留最后 24 条兼容日志 |
| BUG-13 schema 数组整体清空 | 已修复、自动验证通过 | 独立根因 | 数组容器与元素现分开解析，单个非法元素只会被单独丢弃 |
| BUG-14 cross_sweep gaps 字段被忽略 | 代码已修复，待实机验收 | 独立根因 | 横纵扫射现均按 gaps 保留对应数量的安全缺口 |
| BUG-15 三角色受击立绘静默缺失（空框） | 已修复、自动验证通过，待实机验收 | 独立根因 | 三角色 S0/S1/S2 已压缩、登记、接入白名单/atlas/构建/宿主，并发布到 R2 generation 8 |
| BUG-16 构建/发布链路失效 | 已修复、自动验证通过 | 独立根因 | 宿主版本注入、PNG 检查点版本与两条 R2 npm 脚本已同步到当前合同 |
| BUG-17 测试套件基线不绿 | 已修复、自动验证通过 | 独立根因 | 已核实三个新 Boss WebP 属于 active release，并同步非 GAL 资源计数 |
| BUG-18 怀表“五分钟”文案与机制不符 | 代码已修复，待实机验收 | 独立根因 | 已实现真实五分钟倒计时、到期自动解除，并保留跨时段/主动解除路径 |
| BUG-19 教程前可送走关键角色，折叠指引后无恢复入口 | 代码已修复，待实机验收 | 独立根因 | 教程期来客茶席过早开放；折叠态隐藏了整条指引且没有重新展开控件 |
| BUG-20 GAL 请求异常后发送锁不释放 | 已修复并发布 r10 | 锁定 ≠ 可恢复 | 所有生成入口异常统一停止当前生成并释放事务、宿主与 UI 锁；发送行新增“修复”按钮 |
| BUG-21 教程第五步卡在取得第二点灵感 | 已修复并发布 r10 | 派生事实不同步 | 教程完成态同时认可正式完成事件或资源已达到 2 点灵感 |
| BUG-22 新胜利继承旧要求锁／生成中不能放弃 | 已修复并发布 r10 | 锁定 ≠ 可恢复 | 新胜利先清旧要求；放弃先停止生成并释放 GAL 锁，再清本次要求，不追加杂鱼标签 |
| BUG-23 点击角色小窗后画廊无法打开 | 已修复并发布 r10 | modal 生命周期冲突 | 进入子页面前同步关闭 launcher；仅真实 GAL 会话或首轮草稿阻止画廊，单纯选中角色不再阻止 |

---

## BUG-01 设施建立后角色仍觉得设施很破

- **现象**：UI/机会面板显示"已建成 · 运转正常"，但普通对话中角色仍按"荒废庭园 / 设施未建"描写。
- **根因**：
  - 建立只写数据通道：`buildFacility` 写入 `facility_runtime.<id>.built/current_form/status='normal'` 与 `facilities.<id>.state='启用'`（`src/ui/facility-rules.ts:105-123`）。
  - 普通剧情轮（`kind='ordinary'`）的【场景事实】只含日期/天气/玩家区域/在场角色/绝对时段序号（`src/ui/prompt-context.ts:36-44`），**不含任何设施状态**。
  - 【设施事实】块只在 `options.facilityId` 非空时注入（`prompt-context.ts:63-74`），即只有玩家正对该设施执行 `build/facility_action/refit/recovery` 的那一轮可见。
  - 唯一纠正性提示【阶段边界】只说"旧主屋修复、基础温室…已是历史完成事实"（`prompt-context.ts:54-60`），不列后续新建设施。
  - 模型长期印象只有开场"荒废庭园 / 温室旧地基 / 未清理"（`src/schema/initial-state.json`、`src/ui/bridge.ts:3367-3374`）。
  - 附带：`buildFacility` 从不更新 `garden.construction_stage`（恒为"荒废"），但它是 UI 字段（`src/ui/types.ts:349`），不进模型通道，非直接原因。
- **修复方向**：在【场景事实】（或阶段边界之后）追加动态"庭园建设现状"子块，每轮投影已建成设施清单（至少覆盖玩家当前区域主设施）。
- **复核结论（2026-08-11 全库复核）**：上述"修复方向"**已在代码层面实现**——`buildFacilitySystemContext`（`src/ui/facility-system-context.ts:23-52`）输出【庭园设施现状：当前代码事实】子块（旧主屋状态、魔法温室形态/状态、catalog 内已建成设施清单，含"优先于开场背景"与"不得把已建成设施描述为废墟"两条效力声明），经 `buildGalSystemHistory`（`src/ui/system-history-context.ts:11`）并入冻结的 system history，再由 `buildGalGenerationRequestV2`（`src/ui/gal-generation-request.ts:1069`）注入**所有消息的请求楼层**（`sendUserMessage` 是普通对话/动作/事件统一的唯一主入口，`src/ui/bridge.ts:2469+`）。若实机复核仍出现"角色觉得设施破"，重点排查方向应改为：system history 楼层是否被请求拼装覆盖/裁剪、投影强度是否被开场梗概冲淡，而非继续补投影本身。**状态建议由"待修复"改为"待实机复核确认"。**

## BUG-02 使用怀表（时停）后角色无法互动（已修复并验收）

- **现象**：使用咲夜怀表后，玩家继续普通对话，角色永远不回应，仿佛卡死；UI 无"时停中"提示，也无解除入口。
- **根因**：
  - 激活：`useSakuyaWatch` 置 `time_stop_active = true`（`src/ui/special-item-rules.ts:106-153`）。
  - 解除唯一途径是"跨时段"：`advanceOneTimePeriod` 里 `time_stop_active = false`（`src/ui/time-rules.ts:35-38`）。
  - 但 `advanceOneTimePeriod` 只在固定事件（`advance_time_periods=1`，`src/ui/event-settlement.ts:631`）、建设施/改型（`facility-rules.ts:103/264/395`）、副本奖励（`src/ui/dungeon-rules.ts:34`）被调用；**没有"推进时段"UI 入口**，普通对话明确不推进时段（`src/ui/target-actions.ts:654`）。
  - 时停期间每轮都注入【时间停止】块，强制"角色不能主动行动、移动、说话或做出反应；不要替被定身角色编写反应"（`prompt-context.ts:46-52`）。
  - 结果：玩家若不触发时段推进事务，时停永不解除 → 角色永久冻结。叙事"暂停五分钟"（`src/shop/catalog.json` blurb）在机制里没有自动过期。
- **修复结果**：背包和 GAL 道具选择器在时停期间提供“解除时停”；解除只关闭 `time_stop_active`，不推进时段，也不重置当日冷却、累计次数和时间痕迹。相关实机验收已通过，临时测试控制台入口已移除。
- **遗留**：`temporal_trace_active`（时间痕迹）置 true 后无任何清回路径（见文末低危观察 1）；原“五分钟”文案不符已由 BUG-18 的真实倒计时机制修复，待实机验收。

## BUG-03 符卡对战胜利后“提出要求”卡死（已修复并验收）

- **现象**：提交胜利要求后，若 assistant 回复未被识别或变量阶段未完成，弹窗反复"继续未完成的胜利剧情"，重试循环等待 90–120 秒；此后所有符卡对战被永久拦截。
- **根因**：
  - 提交要求锁定为 `status='generating'`，文本不可再改（`src/ui/duel-card-rules.ts:181`）。
  - 清空唯一入口是 `completeDuelVictoryDialogue`（`duel-card-rules.ts:185-196`），只在变量阶段成功后调用（`src/ui/bridge.ts:1626`）；失败路径 `markSettlementFailed`（`src/ui/message-transaction.ts:318-327`）**不清空 pending**。
  - `characterDuelBlock` 从此永久拦截："上一场胜利要求尚未完成"（`duel-card-rules.ts:87`）→ 后续全部符卡对战无法发起。
  - 失败触发点①：V2 事务要求回复 metadata（requestId/attemptId/commitKey/chatId/ownerCharacterId）完全匹配（`src/ui/message-transaction.ts:482-490`），不匹配则 `assistantResponded` 恒 false → 120 秒超时。
  - 失败触发点②：变量阶段 90 秒超时（`src/ui/bridge.ts:1465-1473`）；`isVariableStageReady` 的 2.5 秒兜底只在 `!isDuringExtraAnalysis()` 时生效（`src/ui/async-coordination.ts:43-45`），ST 侧额外分析挂起或 `VARIABLE_UPDATE_ENDED` 不触发（`bridge.ts:3351-3353`）则永远不 ready。
  - 弹窗只有"提交要求并进入剧情"一个按钮，**无"取消/放弃要求"**（`src/ui/index.html:557-571`）；"继续"走 `retryLastTransaction`（`bridge.ts:2716`），根因不变则死循环。
- **修复结果**：胜利要求弹窗提供“放弃本次要求”，只清除 `pending_victory_dialogue` 并保留既有战斗结算；恢复逻辑在已有 user／assistant 楼层时不再自动重新发送剧情。相关实机验收已通过，临时测试控制台入口已移除。
- **遗留（BUG-08）**：V2 构造失败残留与“软成功”误导仍存在，见 BUG-08。

## BUG-04 色色异变下角色抵抗性过强（代码已修复，待实机验收）

- **现象**：玩家用异变触发卡填写的色色异变规则，角色几乎不进入状态，抵抗性强。
- **根因**（诊断已验证属实）：
  - 代码注释明确"玩家规则是权威的"：`The player's rule remains authoritative; the seed only chooses presentation facts.`（`src/ui/anomaly-rules.ts:152`）。
  - 但注入文本 `buildOrdinaryAnomalyPrompt` 只把 `rule_text` 原样丢给模型，没有任何"此规则在叙事中生效、与角色边界冲突时谁优先"的效力声明（`anomaly-rules.ts:247-265`）。
  - 防御条款全是强措辞常驻：`identity.xml:8`"角色只依据目击…不得把模型投影、数据库或变量表中的信息直接当作角色知识"；`gal-presentation-protocol.md:27`"按钮或动作 ID 只代表玩家尝试，不代表对方必然接受"、`:54`"裸露…不能自动升级为 sexual"；角色条目"不得替玩家决定内心、愿望或关系"；道具条目"不自动顺从或依恋"。
  - 模型遇到"弱陈述规则 vs 强硬禁令"冲突时服从禁令 → 异变规则总是输。
  - 对照：怀表【时间停止】块有完整授权语义（`prompt-context.ts:46-51`"角色不能…玩家的动作与话语依然有效"），所以时停不抵抗——证明问题不在"色色"本身，而在缺少授权声明。
- **修复结果**：`buildOrdinaryAnomalyPrompt` 现明确声明活动异变是本地系统已正式激活的当前事实，指定范围内的效果必须实际发生；角色性格只能影响反应与表现方式，不能否认、抵消或绕过规则。同时限制只改变规则明示状态，禁止在规则之外推导长期人格、关系、记忆、同意或未声明行为，并明确表现倾向与排除内容不能被用于否定核心规则。
- **自动验证**：R39 异变回归现在逐项检查效力声明、角色反应边界、不可越界推导以及表现倾向/排除内容语义；相关测试、类型检查与构建通过。
- **待实机验收**：激活一条明确描述身体或情绪状态变化、同时带表现倾向和排除内容的异变，进行普通角色对话；确认规则写明的状态实际出现，角色仍保留个性化反应，且不会额外生成长期关系、记忆或未声明行为。

## BUG-05 新手教程卡在温室首次选型，入口找不到；快进强制选“自由生长”（已修复、自动验证通过）

> 2026-08-12 最终产品决定：正常流程仍在解决妖花核心后毕业；正式“跳过教程”则直接结束全部教程与指引，并推进到三套方案均完成、首次温室形态尚未选择的状态。

> 记录日期：2026-08-11。独立根因，与 BUG-01~04 的“叙事通道授权缺失”不同源。已通过真实模块端到端模拟验证属实。行号已于 2026-08-11 复核修正。

- **现象**：玩家完成三套温室方案（自认“每个都聊了”）、物资充足，但教程停在“完成首次温室选型”，魔法温室菜单里找不到选型入口；只能点教程条上的“快进并完成教程”跳关，而跳关会**直接强制把温室选为“自由生长型温室”**，无任何选择环节。
- **根因**：
  - 选型入口（三个“选择 XX型”按钮，`src/ui/target-actions.ts:350-382`）只在三方案 `completed_key_events` 全部齐备时才渲染。三套方案是 `gal` 固定事件（`target-actions.ts:309-343`），**只有点菜单按钮发起才会被本地结算器写完成标记**；玩家纯对话“聊了”而不走按钮（或回复未成功结算），`completed_key_events` 缺一个 → 选型按钮不渲染。端到端模拟验证：荷取方案完成标记缺失时 `select_*` 按钮数量为 0。
  - 即使完成标记齐备，`greenhouseActionBlock`（`src/ui/greenhouse-rules.ts:140-160`）还会因 `unlocked_forms` 未同步（“三套方案的完成标记与解锁形态尚未同时齐备”）、`active_event` 残留（“当前已有其他主要工程正在进行”）、物资 <4（“首次改造至少需要 4 点物资”）、`current_form` 非“基础魔法温室”（“首次选型必须从已启用的基础魔法温室开始”）而禁用按钮；禁用原因只塞进按钮 title（`src/ui/app.ts:1715-1717`），不显眼，玩家误以为没有入口。
  - “快进并完成教程”按钮直接调用测试跳关 `runTestJump('m2_open_garden')`（`src/ui/app.ts:2485-2486`），`prepareM2AcceptanceState` 硬编码 `select_greenhouse_form: 'selected_free_growth'` 与 `current_form: '自由生长型温室'`（`src/ui/test-tools.ts:261,270`），无选择 UI；且顺带写入毕业记忆、丢弃“基础魔法温室”形态等测试痕迹。测试跳关被当作正式入口使用。
- **修复结果**：
  1. 正式按钮改为“跳过教程并前往温室选型”，调用 `tutorial_form_selection_ready` 完成全部教程与三套方案，撤下新手指引并确认毕业；不写选型结果、不改变当前温室形态，玩家仍必须亲自选择。
  2. 温室达到选型阶段后始终渲染三个选择按钮；条件不足时沿用现有 `greenhouseActionBlock` 禁用，并通过按钮下方的可见原因说明缺少方案、物资、基础形态或活动空闲条件。
  3. 未新增状态、恢复系统或存档迁移；测试用 `m2_open_garden` 跳关仍只留在测试控制台。
- **自动验证**：快进后的教程进度为空、毕业确认已写入、首次选型结果仍为空；温室恰好显示三个可用选型按钮，且不会自动选中自由生长。
- **待实机验收**：新局点击“跳过教程并前往温室选型”，确认新手指引完全消失、三种方案均可见且未被自动选中，并能手动完成选型。

## BUG-06 温室妖花核心战失败 → 形态线永久锁死（代码已修复，待实机验收）

> 记录日期：2026-08-11 全库复核；2026-08-11 按“战败不推进剧情、直接允许重战”的最小方案修复。与 BUG-05 无重合（BUG-05 是新手选型入口；本条是后期妖花核心战失败后的进度误结算）。

- **原现象**：玩家在温室妖花核心战中落败（loss）后，系统仍把妖花核心事件视为已完成，同时把温室写成异常并触发后续进度，导致调查入口消失、温室改造/换型被阻断。
- **根因**：`settleFlowerCore` 在区分胜负前就写入 `completed_key_events.greenhouse_flower_core`，loss 分支还写入设施异常；之后又无条件写移动锚点记忆并解锁迷宫、商店。换句话说，普通战败被误当成了带永久后果的主线结算。
- **修复结果**：
  1. loss 现在只登记本次 `settlement_id`，清空 `battle.current` 与 `events.active_event`，随后立即返回；
  2. 不写妖花核心完成标记，不改变温室状态/效果，不写移动锚点记忆，也不解锁迷宫或商店；
  3. 因完成标记仍为空，现有目标行动路由会再次提供 `investigate_flower_core`，无需新增恢复系统或专用 UI；
  4. 项目尚未发布，按用户要求不迁移此前已损坏的测试存档。
- **自动验证**：新增“先败后重试再胜”的合约覆盖；`tests/ui-contract.test.mjs` 140/140 通过，`npm run check:ui` 与 `npm run build:ui` 通过。全量 `npm test` 仍只有 BUG-17 已记录的 2 项资源计数基线失败，无新增失败。
- **待实机验收**：妖花核心战败 → 返回普通界面 → 再次调查并进入战斗 → 获胜后只结算一次正式进度。

## BUG-07 宿主异常 → 永久“生成中”→ 新聊天冻结（代码已修复，待实机验收）

> 记录日期：2026-08-11 全库复核。高危：破坏整局，需重载或清状态恢复。

- **现象**：宿主（ST）侧 `/trigger` 抛错或挂起后，UI 永久停留在“生成中”，且此后切换聊天也冻结，任何操作无响应。
- **根因**：
  - `triggerGeneration`（`src/ui/bridge.ts:1044-1052`）：`hostGenerationActive = true` 后 `await g.triggerSlash?.('/trigger await=true')`，**无 try/finally**；抛错或永不 resolve → `hostGenerationActive` 永久 true。
  - `getTransactionState`（`bridge.ts:2734-2736`）：`hostGenerationActive && !['submitting_user','generating','settling'].includes(phase)` → 强制返回 `'generating'` → UI 永久“生成中”。
  - `restoreWhenIdle`（`bridge.ts:3280-3283`）：CHAT_CHANGED 时若非空闲（generating）则跳过 → 切聊天也冻结。
  - `reconcileHostGenerationActivity`（`bridge.ts:1421-1425`）依赖宿主 `data-generating`/`mes_stop` 事件修正，宿主异常时事件不触发则永久失效。
- **2026-08-11 修复结果**：原生 `/trigger` 与事务重试 `/continue` 均改用 `try/finally`；命令正常结束或抛错时都会释放当前 attempt 设置的 `hostGenerationActive`。清理继续比较 `hostGenerationStartedEpoch`，如果等待期间另一次真实生成已经开始，旧 attempt 不会误清新生成状态。
- **范围控制**：未增加固定超时。生成耗时没有可靠上限，强制超时会在后台仍生成时错误开放发送，造成双请求；现有 `GENERATION_STOPPED/ENDED`、原生按钮 DOM 与 assistant 楼层对账继续处理命令挂起但宿主生命周期仍可观察的情况。
- **自动验证**：新增原生 `/trigger`、事务 `/continue` 必须在 `finally` 进行 epoch 保护清理的合约；UI 合约 141/141、类型检查、构建均通过。全量测试 746 项中 744 通过，仅剩 BUG-17 已记录的 2 项资源计数失败。
- **待实机验收**：让宿主 `/trigger` 或重试 `/continue` 明确抛错，确认界面离开“生成中”、事务进入可重试失败态，且之后能够切换聊天或重新发送。

## BUG-08 胜利要求 V2 构造失败残留 + “软成功”误导（已修复、自动验证通过）

> 记录日期：2026-08-11 全库复核；2026-08-11 先完成“延后上锁”，随后以不增加恢复状态的最小方案修复软成功提示。

- **路径①（V2 构造失败，已修复）**：`sendDuelVictoryRequest` 现在先对 `stageDuelVictoryRequest` 的内存副本构造并验证完整 V2 请求；只有 `v2.ok` 后才调用 `replaceMvuData` 写入 `status='generating'`，随后设置 pending 所有权。构造失败时存档仍是 `waiting_request`，不会留下三件套或伪造可恢复事务。
- **路径②（软成功误导，已修复）**：保留 `phase='settled'` 表示消息传输已经结束，从而不引入新锁或阻断下一次发送；但错误文案改为“回复正文已保存，但本地结算未完成”，且提交完成后的状态栏优先显示该错误，不再被“回复与真实楼层已落盘”覆盖。
- **自动验证**：既有顺序合约继续保证 V2 校验早于持久化；新增断言保证结算失败明确包含“本地结算未完成”，同时下一次角色互动仍可提交。聚焦合同 163/163、类型检查与 UI 构建通过。
- **待实机验收**：制造一次 assistant 正文已出现但本地结算失败，确认状态栏显示红色结算警告、没有“已落盘”假成功，同时发送入口仍可继续使用。

## BUG-09 战斗结算 ID 确定性重复 → 吞奖励（代码已修复，待实机验收）

- **原现象**：同一战斗配置连续失败两次（或复现相同结束帧），第二次结算可能被“已经结算”拒绝，掉宝/奖励被吞。
- **根因**：旧 `settlement_id` 只包含 `config_id`、每个实例都从 0 开始的 `settlementSerial` 与 120Hz 固定步长累计的 `gameTimeMs`。两场同配置战斗在同一模拟帧结束时，三项输入完全相同。
- **修复结果**：每个 `BattleSimulation` 创建时生成一个 16 字符 run ID，由现实时间、模块内递增序号和独立轻量熵组成；结算 ID 现在包含 `config_id` 截断前缀、run ID、局内序号与模拟时间。run ID 不消耗注入的玩法 RNG，因此不会改变固定种子弹幕序列；最终 ID 继续受 64 字符上限约束。
- **自动验证**：新增两个同配置实例在零模拟帧结束的复现用例，确认结算 ID 不同且长度均不超过 64；战斗测试 40/40、类型检查和构建通过。
- **待实机验收**：连续进入同一战斗并立即以相同结果结束两次，确认两次均能各自结算，不出现“已经结算”或奖励缺失。

## BUG-10 暂停期间按炸弹 → 恢复后自动消耗（代码已修复，待实机验收）

- **原现象**：战斗中按 Esc 暂停后按炸弹键，再按 Esc 恢复战斗，炸弹会在恢复后的第一帧被自动消耗。
- **根因**：面板与外部暂停入口均经由 `setPaused()`，原本已经调用 `input.resetTransient()`；唯独键盘 Esc 在 `BattleEngine.frame()` 内直接调用 `sim.togglePause()`，没有清除暂停期间积累的 Bomb 按下沿，恢复后便被 `consumeBombPressed()` 消费。
- **修复结果**：键盘 Esc 切换暂停状态后立即调用 `input.resetTransient()`，统一清除 Bomb/Pause 按下沿与移动、触控瞬态状态；不修改暂停模型、炸弹判定或模拟循环。
- **自动验证**：新增输入控制器回归，确认 `resetTransient()` 会丢弃已排队 Bomb；新增 Esc 分支合约，确认切换暂停后立即清理。战斗测试 41/41、`npm run check:ui` 均通过。
- **待实机验收**：Esc 暂停 → 按 X → Esc 恢复，确认 Bomb 数量不变且战斗可继续；面板暂停与触控入口保持正常。

## BUG-11 存档写入非原子 → 中断即丢档（复核关闭：原诊断不成立）

- **复核结论**：原记录把 updater 回调内部的“过滤旧条目并返回完整新数组”误读成两次持久化操作。实际 `writeSaveSlot` 只调用一次 `adapter.updateWorldbook`，宿主适配器再以一次 `updateWorldbookWith` 提交完整条目数组。
- **自动证据**：现有回归明确断言覆盖同槽只增加一次 update，同时逐字节保留其他条目和其他槽位（`tests/save-worldbook-store.test.mjs:23-35`）。因此不存在项目代码层面的“先删成功、再写失败”窗口。
- **边界**：宿主自身如何落盘不由本项目控制；若未来获得宿主级崩溃复现证据，可另立耐久性增强项，但不沿用本条错误根因增加临时槽或 `.bak` 体系。

## BUG-12 conversation_log 先截断后迁移 → 历史永久丢失（已修复、自动验证通过）

- **原现象**：升级旧档后，24 条之前的历史对话既不在 `conversation_log`，也没有进入 `interaction.visit_memory`，一次性丢失。
- **根因**：`migrateGardenState` 原本先把 `conversation_log` 去重并截断为最后 24 条，随后才调用 `migrateConversationLogToLegacyMemory`；迁移函数因此看不到更早的旧记录。
- **修复结果**：角色记忆迁移调用已移到兼容日志归一化之前；完整旧日志会先按现有规则增量归档，之后 `conversation_log` 仍按原合同去重、单条截为 120 字符并只保留最后 24 条。未修改 schema、记忆容量或持久化格式。
- **自动验证**：新增 25 条日志边界用例，确认第 1 条灵梦记录进入角色记忆，同时兼容日志精确保留末尾 24 条；角色记忆专项测试 27/27、全量测试 750/750、类型检查与 UI 构建均通过。

## BUG-13 schema 数组单元素非法 → 整个数组被清空（已修复、自动验证通过）

- **原现象**：`pending_tasks`/`settled_ids`/`waiting_events` 等数组字段中混入一个非法元素（如旧档迁移脏值）时，整个数组被静默清空。
- **根因**：公共 `list()` 直接使用 `z.array(schema)`；任一元素解析失败会让整个数组失败，末尾 `.catch([])` 随即把所有合法兄弟元素一起清空。
- **修复结果**：数组容器改为先接受 unknown 元素，再对每个元素独立调用原 schema 的 `safeParse`；合法元素保留完整解析结果，非法元素单独丢弃，最后继续执行原有末尾容量裁剪。非数组输入仍回退 `[]`，未修改任何字段 schema、容量或持久化格式。
- **自动验证**：新增“合法—非法—合法”行为回归，同时验证过滤后再裁剪以及非数组回退；角色记忆/schema 专项测试 28/28、全量测试 751/751、schema 语法检查、类型检查与 UI 构建均通过。真实 SillyTavern MVU Zod 环境仍需做一次坏元素实机验收。

## BUG-14 cross_sweep gaps 字段被忽略（代码已修复，待实机验收）

- **原现象**：符卡配置中 hard/standard 的弹幕缺口密度无实际差异。
- **根因**：`cross_sweep` 固定只跳过一条横向行和一条纵向列，没有读取已钳制为 1～4 的 `gaps` 字段。
- **修复结果**：横向与纵向扫射分别按 `gaps` 跳过均匀分布的槽位；缺省值仍为 1，原有单缺口路径、随机调用次数与配置格式保持不变。
- **自动验证**：固定随机源与 volley，确认缺省/1/2/4 个缺口分别生成 9/9/7/3 枚敌弹；完整战斗测试、类型检查与构建通过。
- **待实机验收**：对比标准难度 `gaps: 2` 与困难难度 `gaps: 1` 的交叉扫射，确认标准难度每个方向多一条可见安全缺口，且缺口随 volley 正常移动。

## BUG-15 三角色受击立绘（portrait）静默缺失——空框无图（已修复、自动验证通过，待实机验收）

> 记录日期：2026-08-11 全库复核；2026-08-11 复核修正（原记录误写为“资产缺失/立绘载入失败”，实际资产与主立绘均在，缺失的是受击立绘支线）。

- **现象**：与妖梦/帕秋莉/早苗对战时，屏幕角落的“受击伤害立绘”（随伤害等级 s0/s1/s2 切换的立绘框）只显示深色底+描边空框，无立绘图像；主战斗立绘正常。
- **根因**：
  - 主立绘（战斗动作 sheet）链路完整：`duel-profiles.json` 已启用 youmu/patchouli/sanae；`CHARACTER_BOSS_SHEETS` 含三者（`battle-renderer.ts:25-37`）；atlas `boss_youmu/boss_patchouli/boss_sanae` 键与资产映射齐全（`battle-atlas.ts:40-42,86-88`）；资产文件存在（`src/assets/battle/boss/youmu-battle-sheet-v1.png/.webp` 等，提交 `10880be` 已落地）。
  - 受击立绘支线断裂：`characterBossPortrait` 白名单只有 8 角色 + flower_core，**漏了 youmu/patchouli/sanae**（`battle-renderer.ts:47-57`）；atlas 的 `portrait_*_s{0,1,2}` 键集合同样没有三者（`battle-atlas.ts:43-69`）。三者的 portrait 资产也未制作。
  - 结果：`characterBossPortrait` 对三者返回 undefined → 渲染端 `portraitKey ? atlas.images[...] : undefined` 得 undefined → `if (portrait)` 不成立**静默跳过绘制**（`battle-renderer.ts:645-648`），只画出背景框。
- **修复结果（2026-08-11）**：所有者提供的妖梦、帕秋莉、早苗 S0/S1/S2 共 9 张 `1152×1920` PNG 已按既有 portrait 合同转换为 `480×800`、quality 50、effort 6 的 WebP，总计 138,684 bytes；原图保留在旧素材目录。`characterBossPortrait` 白名单、`BattleSheetKey`、atlas source/load、应用 dataset、宿主注入、构建复制/嵌入与 `asset-manifest` 已补齐。
- **发布结果**：R2 预演确认仅新增 9 个对象、0 替换；已发布 generation 8（263 files / 355,377,120 bytes，manifest SHA-256 `64ac62ae0896e2523af23b137fd2acabfd2d2d4c92f743aeacb94cfdc28d4507`），9 个对象均通过 S3 与生产域名读回。
- **自动验证**：`npm run check:ui`、`npm test`（753/753）与 standalone 构建通过；十一名角色的 S0/S1/S2 映射和 WebP 运行链均有合同测试覆盖。详细追溯见 `project/new-character-battle-portrait-report-2026-08-11.json`。
- **待实机验收**：分别进入妖梦、帕秋莉、早苗对战，确认开场/阶段变化能显示 S0/S1/S2，长短屏与重进战斗不出现空框；远端静态与 CORS 已验证，但仍不等同于真实 SillyTavern 画布验收。

## BUG-16 构建/发布链路失效（已修复、自动验证通过）

> 2026-08-11 复核并修复；`dist/ui/index.html` 当前由构建生成，preview 根路径 404 已不能复现，因此未修改预览服务器。

- **修复结果**：
  1. UI 构建的版本替换目标同步为宿主当前的 `0.4.4-late-bound-generate-rN`；实际产物已生成带哈希的新版本号。
  2. PNG 嵌卡脚本接受当前 `0.3.0-rN` 检查点；`package:checkpoint:png -- --dry-run` 成功。
  3. `build:assets:r2` 固定下一代 generation 8 与生产素材 origin；`plan:assets:r2` 固定 `hxxwy` 桶和 generation 8 清单。仍保留“正式 staging 必须来自干净工作树”的原安全门。
- **自动验证**：快捷命令参数进入合同测试；generation 8 素材 dry-run、PNG dry-run、类型检查和 UI 构建均成功。当前工作树有未提交开发改动，因此 R2 publisher 按预期拒绝脏清单；其独立发布器校验测试通过，待干净提交后再生成正式计划。

## BUG-17 测试套件基线不绿（已修复、自动验证通过）

- **原现象**：`asset-release.test.mjs` 两项失败，实际总数 223 对旧期望 220、非 GAL 资源 112 对旧期望 109。
- **核实结果**：新增三项是 generation 7 已上传并验证、且由十一角色对战运行链使用的妖梦、帕秋莉、早苗 Boss WebP，属于 active release，不应从清单移除。
- **修复结果**：发布合同的非 GAL 基数由 109 同步为 112；未修改资源清单、资产文件、分类、优先级或入口门控。
- **自动验证**：`asset-release.test.mjs` 5/5、全量 `npm test` 749/749 通过。

## BUG-18 怀表“五分钟”文案与机制不符（代码已修复，待实机验收）

- **原现象**：商品目录、道具目录、商店反馈与 UI 共七处表述“暂停五分钟”，prompt 还误称“本轮结束时”解除；实际机制只会在下一次正式时段推进或玩家主动操作时解除。
- **修复结果**：怀表启动时由本地规则写入真实毫秒到期时间，时长固定为五分钟；`gg-header` 显示 `时停 MM:SS`，到达零点后自动执行一次本地解除。主动解除或正式时段推进仍可提前结束；所有解除路径都只清理激活态与到期时间，保留当日冷却、累计使用与时间痕迹。旧存档若处于时停但没有到期时间，会在界面恢复后立即安全解除，不形成永久冻结。
- **自动验证**：覆盖 300000ms 边界、到期前不解除、到点解除、主动解除、跨时段解除、冷却/时间痕迹保留、顶栏语义节点和自动到期命令；`npm run check:ui`、全量 `npm test`（754/754）与 standalone UI 构建通过。
- **待实机验收**：使用怀表后确认顶栏从 `05:00` 递减，到 `00:00` 自动解除，角色恢复可互动且怀表保持今日冷却；另检查主动解除和跨正式时段推进仍会提前结束。

## BUG-19 教程完成前可送走灵梦，折叠指引后无法重新打开（代码已修复，待实机验收）

> 记录日期：2026-08-11。此条与 BUG-05 不同：BUG-05 是温室选型和正式快进入口错误；本条是教程阶段的 UI 可达性与功能开放时机错误。项目尚未发布，因此按用户决定不适配已损坏存档。

- **现象**：新手教程尚未完成时，“来客茶席”已经开放，玩家可以把当前硬前置角色灵梦请离庭园，导致“检查结界”步骤失去目标；同时点击教程条会把整个指引（包括快进按钮）隐藏到步骤变化，而卡死状态无法推动步骤变化，形成无恢复入口的死锁。
- **根因**：
  - 来客茶席入口始终可点击，没有使用正式的 `isTutorialGraduated(state)` 开放条件。
  - 折叠态只记录 `tutorialGuideCollapsedStep` 并隐藏 `gg-tutorial-guide`，没有独立的重新展开控件。
- **修复结果**：
  1. `updateLauncherSummary` 从正式教程毕业状态派生茶席可用性；毕业前将 `gg-open-visitors` 设为原生 `disabled`，并显示“完成新手教程后开放”。
  2. 新增语义化按钮 `gg-tutorial-guide-restore`；当前步骤折叠时显示“展开新手指引”，点击后清除折叠态、重新渲染指引并把焦点移回标题。
  3. 恢复按钮覆盖桌面、窄屏及 GAL 顶部布局；不修改剧情事件、访客调度、schema 或存档。
- **验证结果**：聚焦 UI 合同 140/140 通过，`tsc --noEmit` 通过，`npm run build:ui` 成功；真实 SillyTavern 内的鼠标、键盘与窄屏交互仍待实机验收。

---

## 低危观察清单（不阻塞，随修复顺带处理）

1. `temporal_trace_active` 只进不退：`useSakuyaWatch` 置 true（`src/ui/special-item-rules.ts:126`），`settleSpecialItemEvent` 结算后不清（`src/ui/event-settlement.ts:634-652`）。目前无害冗余，符合“只进不退”模式，未来逻辑接入即踩坑。
2. `pendingHelperResult` 跨事务落楼（`src/ui/bridge.ts:2722-2726`）：旧文本 + 新 attempt 错位，展示误报。
3. `settleFlowerCore` 非幂等（`src/ui/event-settlement.ts:710` 无 completed 短路）：异常重放可重复扣资源。
4. `start_due_banquet` 无条件删 task（`src/ui/m2-commands.ts:118-121`）：activity_id 不匹配时任务被删但宴会未开始。
5. `native-regenerate` 不写新 attempt metadata（`src/ui/bridge.ts:3126-3186`）：刷新后 swipe 与 V2 事务脱节。
6. `facility-system-context` 缺“角色须经目击才获得知识”衔接（`src/ui/facility-system-context.ts:23-52`）：模型易让不在场角色直接谈论设施细节，弱违 `src/card/identity.xml:8`。
7. `legacy_unassigned` 死数据（`src/ui/synthetic-history.ts:172`）。
8. 数据库记忆模块死代码：`memory-archive-schema/memory-upsert-plan/memory-recall-pipeline` 零生产调用，存档实际仍走 worldbook 槽位。
9. `marisa_greenhouse_night_observation` 有叙事投影无结算器（`src/ui/target-actions.ts:440-449`）：通知文案承诺与实际不符。
10. `previewState`（`src/ui/bridge.ts:3385-3397`）与 `src/schema/initial-state.json` 的 `magic_greenhouse.state` 不一致（'可建设' vs '未发现'）。

---

## 统一修复原则

不要削弱防御条款（它们是"角色不能读取游戏状态"架构原则的根基，`identity.xml:8`），而是**给每个机制补上叙事层的显式衔接**：

1. **投影**：设施现状、已发生事务等状态变化要进模型可见通道；
2. **授权**：玩家规则/机制生效时，prompt 里要有一句效力声明；
3. **解除**：任何有持续状态的机制都要有玩家可触达的解除路径；
4. **恢复**：任何锁定事务都要有失败清空/放弃入口。

BUG-02 与 BUG-03 已按上述原则补齐解除／恢复路径；BUG-01 的投影已由 system history 补齐（待实机复核）。后续处理优先级：

- **P0（破坏存档进程/整局）**：BUG-06、BUG-07 已完成代码修复，均待实机验收。
- **P1（数据丢失/吞奖励/误导）**：BUG-09 已完成代码修复、待实机验收；BUG-08、BUG-12、BUG-13 已完成自动验证；BUG-11 已关闭为原诊断不成立。
- **P2**：BUG-10、BUG-14 已完成代码修复、待实机验收；BUG-15、BUG-16、BUG-17 已完成自动验证，其中 BUG-15 仍待真实画布验收。
- **P3**：BUG-05 已完成自动验证；BUG-04、BUG-18、BUG-19 已进入待实机验收。正式 BUG 清单当前无其他待代码修复项，余下仅为实机验收与低危观察清单。
