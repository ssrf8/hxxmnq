# BUG 记录：叙事通道授权缺失（统一根因）

> 记录日期：2026-08-11（首次记录）；2026-08-11 全库复核更新（BUG-06~18 为复核新增，BUG-05 由用户发现并收录）。
> 状态：BUG-02、BUG-03 已修复并通过实机验收；BUG-01 代码层面已补投影（2026-08-11 复核确认调用链已接通，**待实机复核确认**）；BUG-04、BUG-05 仍待修复；BUG-06~18 为新增，均未修复。
> 适用原则：本项目的角色知识只来自目击、告知、调查、推断与既有经历（`src/card/identity.xml:8`）。游戏状态是本地私有后台事实，任何机制要在叙事中生效，都必须经过一层显式的"投影 / 授权 / 解除 / 恢复"衔接。下表 BUG-01~04 全部是**数据通道做完了、叙事通道缺了那一环**；BUG-05 及 BUG-09~18 为独立根因（见下），不适用该模式。

## 统一根因模式

- **数据通道**（bridge 结算、`stat_data`、世界书投影）＝本地权威，机制在这里"生效"。
- **叙事通道**（每轮拼装的 user 楼层：协议 + 在场快照 + 场景事实 + 授权块）＝模型唯一可见，机制要在这里"被宣告"。
- 每次新增机制时只做了数据通道（状态写入 / 规则存储），漏做叙事通道（投影 / 效力声明 / 解除与恢复路径）→ 四个症状（BUG-01~04）：

| Bug | 状态 | 统一模式变体 | 缺失的那一环 |
|---|---|---|---|
| BUG-01 设施建好角色觉得破 | 代码已补投影，待实机复核 | 写入 ≠ 投影 | 【场景事实】缺“已建成设施清单” → 已由 system history 的【庭园设施现状】补齐（见 BUG-01 复核结论） |
| BUG-02 怀表后角色无法互动 | 已修复、已验收 | 生效 ≠ 可解除 | 已补主动解除入口，保留冷却与时间痕迹 |
| BUG-03 胜利要求卡死 | 已修复、已验收 | 锁定 ≠ 可恢复 | 已补本地放弃入口并阻止重复生成；遗留触发点见 BUG-08 |
| BUG-04 色色异变抵抗过强 | 待修复 | 授权 ≠ 声明 | 代码注释说“玩家规则权威”，prompt 从未宣告 |
| BUG-05 教程卡温室选型、快进强制自由生长 | 未修复 | 正式入口误用测试跳关；入口可见性缺失 | “快进并完成教程”= `m2_open_garden` 测试跳关硬编码选型；选型按钮禁用原因只进按钮 title |
| BUG-06 温室妖花核心战失败 → 形态线永久锁死 | 未修复 | 写入 ≠ 可恢复（+UI 谎报） | 数据写 `state='异常'` 但无 runtime / 修复入口 / 重打路径，UI 却显示“运转正常” |
| BUG-07 宿主异常 → 永久“生成中”→ 新聊天冻结 | 未修复 | 锁定 ≠ 可恢复 | `triggerSlash` 无 try/finally，`hostGenerationActive` 残留 |
| BUG-08 胜利要求失败残留 + 软成功误导 | 未修复（BUG-03 遗留） | 锁定 ≠ 可恢复 | V2 构造失败在 pending 三件套赋值之后抛错；失败被标为“已落盘” |
| BUG-09 战斗结算 ID 确定性重复 | 未修复 | 独立根因 | 结算 ID 无随机成分，重复战斗被“已结算”拒收、吞奖励 |
| BUG-10 暂停期间按炸弹 → 恢复后自动消耗 | 未修复 | 独立根因 | 暂停分支不重置瞬态输入 |
| BUG-11 存档写入非原子 | 未修复 | 独立根因 | 先删旧档再写新档，中断即该槽位永久损坏 |
| BUG-12 历史先截断后迁移 | 未修复 | 独立根因 | 迁移前截断 conversation_log，溢出历史永久丢失 |
| BUG-13 schema 数组整体清空 | 未修复 | 独立根因 | 数组单元素非法 → 整个数组被 `.catch([])` 清空 |
| BUG-14 cross_sweep gaps 字段被忽略 | 未修复 | 独立根因 | 弹幕缺口密度配置失效，难度档位无差异 |
| BUG-15 三角色受击立绘静默缺失（空框） | 未修复 | 独立根因 | 主立绘/资产齐全，但 `characterBossPortrait` 白名单与 atlas `portrait_*` 键漏了 youmu/patchouli/sanae |
| BUG-16 构建/发布链路失效 | 未修复 | 独立根因 | 版本注入正则失效、r2 脚本参数缺失、预览 404 |
| BUG-17 测试套件 6 项失败 | 未修复 | 独立根因 | 资源计数过期、引用失效、skip 条件失真 |
| BUG-18 怀表“五分钟”文案与机制不符 | 未修复 | 独立根因 | 三处文案说“五分钟”，机制是跨时段解除 |

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
- **遗留**：`temporal_trace_active`（时间痕迹）置 true 后无任何清回路径（见文末低危观察 1）；“五分钟”文案三处与机制不符（见 BUG-18）。

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

## BUG-04 色色异变下角色抵抗性过强

- **现象**：玩家用异变触发卡填写的色色异变规则，角色几乎不进入状态，抵抗性强。
- **根因**（诊断已验证属实）：
  - 代码注释明确"玩家规则是权威的"：`The player's rule remains authoritative; the seed only chooses presentation facts.`（`src/ui/anomaly-rules.ts:152`）。
  - 但注入文本 `buildOrdinaryAnomalyPrompt` 只把 `rule_text` 原样丢给模型，没有任何"此规则在叙事中生效、与角色边界冲突时谁优先"的效力声明（`anomaly-rules.ts:247-265`）。
  - 防御条款全是强措辞常驻：`identity.xml:8`"角色只依据目击…不得把模型投影、数据库或变量表中的信息直接当作角色知识"；`gal-presentation-protocol.md:27`"按钮或动作 ID 只代表玩家尝试，不代表对方必然接受"、`:54`"裸露…不能自动升级为 sexual"；角色条目"不得替玩家决定内心、愿望或关系"；道具条目"不自动顺从或依恋"。
  - 模型遇到"弱陈述规则 vs 强硬禁令"冲突时服从禁令 → 异变规则总是输。
  - 对照：怀表【时间停止】块有完整授权语义（`prompt-context.ts:46-51`"角色不能…玩家的动作与话语依然有效"），所以时停不抵抗——证明问题不在"色色"本身，而在缺少授权声明。
- **修复方向**：在异变注入块中追加效力声明（如"该规则在叙事中生效：受影响角色按规则转变行为；仅在触及人设底线（背叛、自我伤害等）时保留边界"），并把 `excluded_content` 与 `visual_mode` 的"过度保守"解释显式收敛。
- **测试缺口**：BUG-01/02/03 均有回归测试，BUG-04 无任何测试覆盖。

## BUG-05 新手教程卡在温室首次选型，入口找不到；快进强制选“自由生长”（未修复）

> 记录日期：2026-08-11。独立根因，与 BUG-01~04 的“叙事通道授权缺失”不同源。已通过真实模块端到端模拟验证属实。行号已于 2026-08-11 复核修正。

- **现象**：玩家完成三套温室方案（自认“每个都聊了”）、物资充足，但教程停在“完成首次温室选型”，魔法温室菜单里找不到选型入口；只能点教程条上的“快进并完成教程”跳关，而跳关会**直接强制把温室选为“自由生长型温室”**，无任何选择环节。
- **根因**：
  - 选型入口（三个“选择 XX型”按钮，`src/ui/target-actions.ts:350-382`）只在三方案 `completed_key_events` 全部齐备时才渲染。三套方案是 `gal` 固定事件（`target-actions.ts:309-343`），**只有点菜单按钮发起才会被本地结算器写完成标记**；玩家纯对话“聊了”而不走按钮（或回复未成功结算），`completed_key_events` 缺一个 → 选型按钮不渲染。端到端模拟验证：荷取方案完成标记缺失时 `select_*` 按钮数量为 0。
  - 即使完成标记齐备，`greenhouseActionBlock`（`src/ui/greenhouse-rules.ts:140-160`）还会因 `unlocked_forms` 未同步（“三套方案的完成标记与解锁形态尚未同时齐备”）、`active_event` 残留（“当前已有其他主要工程正在进行”）、物资 <4（“首次改造至少需要 4 点物资”）、`current_form` 非“基础魔法温室”（“首次选型必须从已启用的基础魔法温室开始”）而禁用按钮；禁用原因只塞进按钮 title（`src/ui/app.ts:1715-1717`），不显眼，玩家误以为没有入口。
  - “快进并完成教程”按钮直接调用测试跳关 `runTestJump('m2_open_garden')`（`src/ui/app.ts:2485-2486`），`prepareM2AcceptanceState` 硬编码 `select_greenhouse_form: 'selected_free_growth'` 与 `current_form: '自由生长型温室'`（`src/ui/test-tools.ts:261,270`），无选择 UI；且顺带写入毕业记忆、丢弃“基础魔法温室”形态等测试痕迹。测试跳关被当作正式入口使用。
- **修复方向**：
  1. 把“快进并完成教程”与 `m2_open_garden` 测试跳关解耦：快进只解锁开放庭园、不改 `current_form`/选型结果，让玩家之后自行选型；或至少在跳关前弹出“将默认选择自由生长型温室”的确认。
  2. 给“三方案齐备但选型按钮被禁用”的状态加可见诊断：在教程条/机会面板直接展示禁用原因（未结算的方案、物资、形态、活动事件、解锁形态），避免玩家误判为无入口。

## BUG-06 温室妖花核心战失败 → 形态线永久锁死 + UI 谎报“运转正常”（未修复）

> 记录日期：2026-08-11 全库复核。高危：破坏存档进程，玩家无任何恢复手段。与 BUG-05 无重合（BUG-05 是新手选型入口；本条是后期妖花核心战失败后的永久锁死）。

- **现象**：玩家在温室妖花核心战中落败（loss）后：温室改造/换型/重打全部失效，UI 却显示“运转正常”，无任何异常提示与修复入口。
- **根因**（证据链完整）：
  1. 结算写异常只落 `facilities`：`settleFlowerCore` loss 分支置 `facilities.magic_greenhouse.state='异常'`（`src/ui/event-settlement.ts:721-723`），**不写 `facility_runtime.magic_greenhouse`**。
  2. `facility_runtime.magic_greenhouse` **全库无任何创建点**（已 grep 验证）：`settleBuild`（`event-settlement.ts:492-510`）只写 `facilities`；`buildFacility`（`facility-rules.ts:89-123`）只处理 catalog 内 3 个设施（fairy_garden/moon_spring/banquet_plaza，`src/facilities/catalog.json`）；`ensureFacilityRuntime`（`facility-rules.ts:42`）无任何以 `magic_greenhouse` 为实参的调用。
  3. 修复入口不可达：`beginFacilityRecovery` 要求 `runtime.status === 'abnormal' | 'damaged'`（`facility-rules.ts:343-345`），无 runtime → 抛“设施没有可恢复的异常”。
  4. UI 谎报：机会面板 `runtime?.status ?? 'normal'`（`src/ui/open-garden-rules.ts:152`）→ 无 runtime → 恒“运转正常”；app.ts 设施卡只区分 normal/damaged（`src/ui/app.ts:3693-3694`）。
  5. 行动永久阻塞：`greenhouseActionBlock` 的 select/remodel 检查 `facilities.state==='启用'`（`greenhouse-rules.ts:154/165`）→ `'异常'` 永久阻断。
  6. 无法重打：`investigate_flower_core` 因 `events[flowerCore]` 已写 `'loss'`（也算“已结算”）而拒绝（`greenhouse-rules.ts:175`）。
  7. 叙事通道反而正确：`facility-system-context.ts:32-35` 能把 `'异常'` 投影为“运转异常”——数据通道（写异常）与 UI 通道（显示正常）自相矛盾。
- **修复方向**：
  1. `settleFlowerCore` loss 分支同时建 runtime（`status:'abnormal'`）并确保魔法温室可走 `beginFacilityRecovery` 修复流程。
  2. UI 状态读取用 `facilities.state` 兜底（runtime 缺失时也显示“异常/损坏”并给出修复按钮）。
  3. 允许 loss 后重打妖花核心（把 `'loss'` 与 `'win'` 区分对待），或提供替代恢复途径。

## BUG-07 宿主异常 → 永久“生成中”→ 新聊天冻结（未修复）

> 记录日期：2026-08-11 全库复核。高危：破坏整局，需重载或清状态恢复。

- **现象**：宿主（ST）侧 `/trigger` 抛错或挂起后，UI 永久停留在“生成中”，且此后切换聊天也冻结，任何操作无响应。
- **根因**：
  - `triggerGeneration`（`src/ui/bridge.ts:1044-1052`）：`hostGenerationActive = true` 后 `await g.triggerSlash?.('/trigger await=true')`，**无 try/finally**；抛错或永不 resolve → `hostGenerationActive` 永久 true。
  - `getTransactionState`（`bridge.ts:2734-2736`）：`hostGenerationActive && !['submitting_user','generating','settling'].includes(phase)` → 强制返回 `'generating'` → UI 永久“生成中”。
  - `restoreWhenIdle`（`bridge.ts:3280-3283`）：CHAT_CHANGED 时若非空闲（generating）则跳过 → 切聊天也冻结。
  - `reconcileHostGenerationActivity`（`bridge.ts:1421-1425`）依赖宿主 `data-generating`/`mes_stop` 事件修正，宿主异常时事件不触发则永久失效。
- **修复方向**：`triggerGeneration` 加 try/finally（离开作用域即复位 `hostGenerationActive`）+ 超时兜底；`restoreWhenIdle` 加“生成超时强制复位”分支。

## BUG-08 胜利要求 V2 构造失败残留 + “软成功”误导（BUG-03 遗留，未修复）

> 记录日期：2026-08-11 全库复核。BUG-03 已修复“放弃”入口，但以下两条触发点原样保留。

- **残留路径①（V2 构造失败）**：`sendDuelVictoryRequest`（`src/ui/bridge.ts:2619-2702`）顺序缺陷——先持久化 `pending_victory_dialogue.status='generating'`（2632-2636），再置内存 pending 三件套（`pendingOwnershipBefore/pendingSystemOperation/pendingVariableEpoch`，2644-2648），**之后**构造 V2 请求（2652-2665）；V2 校验失败抛错（2665-2668）时，catch（2692-2698）因 `assistantResponded=false` 不执行 `markSettlementFailed` → 三件套内存残留 + `'generating'` 已持久化。此后：`characterDuelBlock` 拦截所有对话（`duel-card-rules.ts:87`）；“继续”按钮走 `retryLastTransaction`（`app.ts:3341-3348`）因 `phase='idle'`/`userMessageCreated=false` 不满足任何分支而再次抛错（继续按钮永远无效，只剩“放弃”可恢复）；存档/读档被 `runSaveOperation` 锁阻塞（`bridge.ts:1675-1677`）。
- **残留路径②（软成功误导）**：`markSettlementFailed`（`src/ui/message-transaction.ts:318-327`）在 `assistantResponded=true` 时置 `phase='settled'`——UI 显示“已落盘”，实际结算未完成、三件套仍在、后续状态被静默跳过。
- **修复方向**：把 pending 三件套的赋值移到 V2 构造成功之后；catch 统一执行 `markSettlementFailed` + 清空三件套；`markSettlementFailed` 的“软成功”改为显式“结算未完成”状态并在 UI 呈现真实原因。

## BUG-09 战斗结算 ID 确定性重复 → 吞奖励（未修复）

- **现象**：同一战斗配置连续失败两次（或复现相同操作序列），第二次结算被“已经结算”拒绝，掉宝/奖励被吞。
- **根因**：`settlement_id = ${config_id}-s${serial}-${gameTimeMs 的 36 进制}`（`src/battle/battle-simulation.ts:1113`），其中 `gameTimeMs` 为 120Hz 固定步长累加（`battle-simulation.ts:153/209`）、无随机成分、`settlementSerial` 每实例从 0。两场同 config 战斗（如连续挂机至超时）→ 步数相同 → **ID 完全相同** → 第二次被 `settled_ids.includes` 拒收（`src/ui/dungeon-rules.ts:26`、`greenhouse-rules.ts:207`、`duel-card-rules.ts:211`）。
- **修复方向**：ID 追加随机/时间戳 salt，或去重键改为 `(config_id, outcome, serial)` 组合。

## BUG-10 暂停期间按炸弹 → 恢复后自动消耗（未修复）

- **现象**：战斗中按 Esc 暂停后按炸弹键（或触摸双击），恢复战斗时炸弹被自动消耗。
- **根因**：`battle-engine.ts` 暂停/隐藏分支（`document.hidden || mode==='paused'`）提前 return，不调用 `input.resetTransient()` → 暂停期间滞留的炸弹按键在恢复后第一帧被 `consumeBombPressed()` 消费。
- **修复方向**：暂停分支同样 resetTransient；测试 `battle-minigame.test.mjs` 补 pause+bomb 用例（当前无覆盖）。

## BUG-11 存档写入非原子 → 中断即丢档（未修复）

- **现象**：存档槽位写入中途失败（磁盘满、崩溃、掉线）后，该槽位永久损坏且无备份可恢复。
- **根因**：`writeSaveSlot`（`src/ui/save-worldbook-store.ts:141-148`）：先删旧 slot 内容再写入新内容，无临时文件/备份/回滚。
- **修复方向**：先写临时槽位并 fsync，成功后再原子替换（rename）；旧档保留一份 `.bak` 用于崩溃恢复。

## BUG-12 conversation_log 先截断后迁移 → 历史永久丢失（未修复）

- **现象**：升级旧档后，24 条之前的历史对话既不在 `conversation_log` 也不在 `completed`，一次性蒸发。
- **根因**：迁移把 `conversation_log` 截断至 24 条发生在把旧条目写入 `completed` 之前（`src/ui/state-migrations.ts:161-170`）。
- **修复方向**：先归档被截断条目再截断（或迁移期不截断）。

## BUG-13 schema 数组单元素非法 → 整个数组被清空（未修复）

- **现象**：`pending_tasks`/`settled_ids`/`waiting_events` 等数组字段中混入一个非法元素（如旧档迁移脏值）时，整个数组被静默清空。
- **根因**：`list()` helper（`src/schema/02-mvu-schema.js:19`）：`z.array(schema)` fail-fast，`.catch([])` 兜底 → 单元素非法即清空整数组。
- **修复方向**：元素级容错（每元素独立 catch/默认）或在迁移期清洗，禁止整体降级。

## BUG-14 cross_sweep gaps 字段被忽略（未修复）

- **现象**：符卡配置中 hard/standard 的弹幕缺口密度无实际差异。
- **根因**：`battle-patterns.ts:493-526` 生成交叉扫射只读 `count/offset/duration`，忽略 `gaps`（间隙缺口）字段。
- **修复方向**：实现 gaps 缺口逻辑，或从配置中移除未生效字段并显式标注难度档差异。

## BUG-15 三角色受击立绘（portrait）静默缺失——空框无图（未修复）

> 记录日期：2026-08-11 全库复核；2026-08-11 复核修正（原记录误写为“资产缺失/立绘载入失败”，实际资产与主立绘均在，缺失的是受击立绘支线）。

- **现象**：与妖梦/帕秋莉/早苗对战时，屏幕角落的“受击伤害立绘”（随伤害等级 s0/s1/s2 切换的立绘框）只显示深色底+描边空框，无立绘图像；主战斗立绘正常。
- **根因**：
  - 主立绘（战斗动作 sheet）链路完整：`duel-profiles.json` 已启用 youmu/patchouli/sanae；`CHARACTER_BOSS_SHEETS` 含三者（`battle-renderer.ts:25-37`）；atlas `boss_youmu/boss_patchouli/boss_sanae` 键与资产映射齐全（`battle-atlas.ts:40-42,86-88`）；资产文件存在（`src/assets/battle/boss/youmu-battle-sheet-v1.png/.webp` 等，提交 `10880be` 已落地）。
  - 受击立绘支线断裂：`characterBossPortrait` 白名单只有 8 角色 + flower_core，**漏了 youmu/patchouli/sanae**（`battle-renderer.ts:47-57`）；atlas 的 `portrait_*_s{0,1,2}` 键集合同样没有三者（`battle-atlas.ts:43-69`）。三者的 portrait 资产也未制作。
  - 结果：`characterBossPortrait` 对三者返回 undefined → 渲染端 `portraitKey ? atlas.images[...] : undefined` 得 undefined → `if (portrait)` 不成立**静默跳过绘制**（`battle-renderer.ts:645-648`），只画出背景框。
- **修复方向**：把 youmu/patchouli/sanae 加入 `characterBossPortrait` 白名单并补 atlas `portrait_*_s{0,1,2}` 键与资产；若暂不做三档受击立绘，可先让三者回退到主立绘帧，避免空框。

## BUG-16 构建/发布链路失效（未修复）

> 均亲测必然失败，可直接复现。

- `build-ui.mjs:936-941` 版本注入正则匹配 `0\.4\.3-host-generate-r\d+`，但 `src/runtime/ui-host-shell.js:25` 已是 `'0.4.4-late-bound-generate-r2'` → 注入永不生效 → 产物 version 恒定 → `ui-host-shell.js:39-47` 的“版本不同才 destroy→重建”保证失效 → 旧宿主实例下新构建代码永不加载。
- `embed-card-png.mjs` 版本正则停在 `0.2.0` → `npm run package:checkpoint:png` 必然失败。
- `npm run build:assets:r2` 必然失败：需 `--generation` 参数但 package.json 未传。
- `npm run plan:assets:r2` 必然失败：缺 `--bucket`/`--manifest`。
- `preview-server` 根路径 404：`dist/ui/index.html` 不存在（产物在 `dist/ui/{version}/`）。
- **修复方向**：版本/正则改为从单一常量派生；package.json 补齐 r2 脚本参数；preview 加版本目录 fallback。

## BUG-17 测试套件 6 项失败（基线不绿，未修复）

- **现状**：`node --test tests/*.test.mjs` → 743 项，737 通过，**6 失败**。
- 失败分类：
  1. `asset-release.test.mjs` ×2：R2 release registry 计数过期（223≠220、112≠109），新增运行时资源未同步 registry。
  2. `new-character-integration.test.mjs` ×1：引用不存在的 `旧素材/素材处理/CG/妖梦/正常 sfw.png`（ENOENT）。
  3. `ui-channel.test.mjs` ×3：skip 条件只检查 `.env` **文件存在**（`tests/ui-channel.test.mjs:186`）不检查 `R2_S3_*` 键 → `.env` 缺键时本应跳过却运行并失败。
- **修复方向**：同步 registry 计数；修引用路径；skip 条件改为校验所需键名。

## BUG-18 怀表“五分钟”文案与机制不符（未修复）

- **现象**：四处表述“暂停五分钟”，实际机制是“暂停至跨时段解除”（BUG-02 修复后仍为跨时段语义）。
- **根因**：`src/ui/prompt-context.ts:50`（【时间停止】块）、`src/shop/dialogues.json`（怀表说明）、`src/ui/app.ts:2205`（时停弹窗 UI）均写“五分钟停顿”，机制没有自动过期。
- **修复方向**：统一文案为“暂停至下一时段（或主动解除）”。

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

- **P0（破坏存档进程/整局）**：BUG-06（温室锁死）、BUG-07（永久“生成中”）。
- **P1（数据丢失/吞奖励/误导）**：BUG-08（胜利要求残留+软成功）、BUG-09（结算 ID 重复）、BUG-11（存档原子性）、BUG-12（历史截断丢失）、BUG-13（schema 数组清空）。
- **P2**：BUG-10（暂停炸弹）、BUG-14、BUG-15、BUG-16（构建链路）、BUG-17（测试基线）。
- **P3**：BUG-04（异变授权声明）、BUG-05（快进/跳关解耦+可见诊断）、BUG-18（文案）、低危观察清单。
