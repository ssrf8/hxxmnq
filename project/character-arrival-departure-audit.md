# 角色登场与退场机制检测文档（只读审计）

> 修复状态（2026-08-08）：本审计确认的赖场主链已完成两轮修复并通过独立离线验收。修复计划与证据分别见 `project/character-lingering-fix-plan.md`、`project/character-lingering-fix-implementation-log.md`。旧存档已丢失的 `visitor_meta` 不追溯恢复，真实 SillyTavern 实机验收仍待执行。

> 检测方式：静态代码走查，未修改任何代码、未构建、未打包。
> 检测日期：2026-08-04（工作区 `0.2.0-r94` 之后、未提交状态）
> 范围：角色**随机到访 / 邀请 / 事件到场 / 本地主动退场 / 模型回执退场**的完整链路，含触发时机、状态同步与潜在缺陷。
> 上位文档：`project/contract.md`、`project/presence-sync-contract.md`、`src/schema/field-ledger.md`。

---

## 0. 结论摘要

| # | 级别 | 问题 | 一句话结论 |
|---|---|---|---|
| P0-A | 🔴 严重 | `visitor_meta` 被模型回执 / 事件在场转换**整体覆盖丢弃** | 角色失去 `planned_departure_serial` 后，本地调度永久无法主动清场 → **赖场** |
| P0-B | 🔴 严重 | 满员时计划置 `deferred` 后**永不恢复** | 邀请/随机到访在满员瞬间**永久丢失** → **角色再也不来** |
| P1-C | 🟠 高 | 邀请 `accept_now` 但满员被 defer，UI 仍显示"对方现在就来" | 用户直接看到的"**邀请了不来**" |
| P1-D | 🟠 高 | 固定事件结算推进时段后**不跑** `reconcileM2Runtime` | 到期离场/落地计划延迟，依赖下一次普通回复才补 |
| P2-E | 🟡 中 | 时间不推进时调度完全静止；模型提示词无停留时长信息 | 闲聊/挂会话时访客自然赖场（放大 P0-A） |
| P2-F | 🟡 中 | `busy` 期间离场与随机到访暂停（会话/事件未结束） | 参与活动的角色不会中途离场，需玩家主动"结束聊天" |

**整体因果链**：

```
模型任意一次回复输出 GensokyoPresence（换区即触发，契约要求）
→ applyPresenceUpdate / applyLocalPresenceTransition 整体重建 presence_snapshot
→ visitor_meta（planned_departure_serial）被丢弃（P0-A）
→ 在场角色脱离本地离场调度，永久赖场
→ 赖场角色占满 ordinary_visitor_cap=3 名额
→ 随机到访被 cap 挡住（maybeScheduleRandomVisit 直接 return）
→ 邀请 accept_now 被 defer（P0-B）且永不恢复
→ 新角色永久不来（P1-C 用户可见）
```

---

## 1. 机制总览（数据流）

```text
配置层        src/visitors/visit-profiles.json         八名角色来访档案
             src/battle/duel-profiles.json             对战登记（决定机遇卡候选）

规则层        src/ui/visitor-rules.ts                  纯函数调度：到场/离场/邀请/冷却/认识
             src/ui/time-rules.ts                      periodSerial（绝对时段序号）

执行层        src/ui/m2-runtime.ts   reconcileM2Runtime  唯一"统一调度入口"
             src/ui/m2-commands.ts  applyM2Command       邀请/宴会/建造等命令
             src/ui/activity-rules.ts                    温泉/宴会会话、溢出清场
             src/ui/card-item-rules.ts                    机遇卡到场

桥接层        src/ui/bridge.ts                          唯一写盘入口（replaceMvuData）
             ① preserveLocalOwnership → 普通自由聊天回复后
             ② persistLocalSettlement  → 本地固定事件结算后
             ③ regenerateSettledFloor → 重新生成后
             ④ settleDungeonResult    → 副本结算后
             （其余 m2 命令各自调 reconcileM2Runtime）

在场回执      src/ui/event-settlement.ts  parsePresenceUpdate / applyPresenceUpdate
             src/ui/target-actions.ts      模型契约（GensokyoPresence 标签）
             src/ui/prompt-context.ts      每轮投影（只有在场名单）

数据定义      src/ui/types.ts
             src/schema/02-mvu-schema.js
             src/schema/initial-state.json
             src/ui/state-migrations.ts
```

**核心概念**：
- `periodSerial`（绝对时段序号）= `(day-1)*4 + 时段索引`（清晨=0…夜晚=3），见 `src/ui/time-rules.ts:55-62`。**调度的一切"到期"都依赖它推进**。
- `presence_snapshot`：在场名单 + 角色视图 + `visitor_meta`，见 `src/ui/types.ts:224-228`、`src/schema/02-mvu-schema.js:158-169`。
- `visitor_meta`：访客生命周期元数据，其中 `planned_departure_serial` 是**本地主动离场的唯一依据**，见 `src/ui/types.ts:100-107`。
- `visit_scheduler`：计划/冷却/通知/已认识列表，见 `src/schema/02-mvu-schema.js:300-318`、`src/schema/initial-state.json:248-256`。

---

## 2. 静态配置层

### 2.1 来访档案 `src/visitors/visit-profiles.json`

接口定义在 `src/ui/visitor-rules.ts:6-19`（`VisitProfile`）。关键字段：

| 字段 | 作用 | 使用位置 |
|---|---|---|
| `eligibility` | 说明性（真正判定在 `isCharacterKnown`） | `visitor-rules.ts:69-92` |
| `time_weights` | 各时段到访权重，0 = 该时段不来 | `maybeScheduleRandomVisit` `visitor-rules.ts:278-279` |
| `stay_period_range` | 到场后停留时段数 [min,max]，决定 `planned_departure_serial` | `visitor-rules.ts:229`、`:430-431` |
| `cooldown_period_range` | 离场后冷却 [min,max] | `visitor-rules.ts:195-197` |
| `invitation_policy` | 邀请 accept/reschedule/decline 权重 | `inviteCharacter` `visitor-rules.ts:345-351` |
| `arrival_area_preferences` | 到场区域偏好 | `visitor-rules.ts:230`、`:301-303` |
| `base_weight` | 随机到访基础权重 | `visitor-rules.ts:280` |

八名角色当前数值（摘录）：

| 角色 | stay | cooldown | 邀请 accept/resched/decline | 备注 |
|---|---|---|---|---|
| reimu | [1,2] | [2,4] | 50/30/20 | 夜晚权重 1 |
| marisa | [1,3] | [1,3] | 60/25/15 | 接受率最高 |
| alice | [1,3] | [2,4] | 45/40/15 | 改约率最高 |
| nitori | [1,2] | [2,5] | 40/35/25 | 夜晚权重 0 |
| cirno | [1,2] | [1,3] | 55/20/25 | 白昼/黄昏高 |
| mystia | [1,3] | [2,4] | 50/30/20 | 清晨权重 0，夜晚 5 |
| suika | [2,3] | [1,3] | 55/25/20 | 停留最长 |
| sakuya | [1,1] | [3,6] | 35/40/25 | 停留最短、冷却最长、权重最低 |

上限常量：`ordinary_visitor_cap = 3`、`banquet_visitor_cap = 6`，见 `visitor-rules.ts:28-29`。

### 2.2 对战登记 `src/battle/duel-profiles.json`

`duelRegisteredIds`（`visitor-rules.ts:23-27`）决定：
- 机遇卡候选（`listOpportunityCandidateProfiles` `visitor-rules.ts:39-53`）；
- 机遇卡到场 `commitOpportunityArrival` 的前置（`visitor-rules.ts:422`）。

---

## 3. 调度规则层 `src/ui/visitor-rules.ts`

### 3.1 认识判定 `isCharacterKnown`（`visitor-rules.ts:69-92`）

```ts
export function isCharacterKnown(state, characterId) {
  if (state.visit_scheduler?.known_characters?.includes(characterId)) return true;
  const completed = state.events?.completed_key_events ?? {};
  switch (characterId) {
    case 'reimu':  return Boolean(completed.reimu_boundary_inspection || state.meta?.opening_committed || state.meta?.initialized);
    case 'marisa': return Boolean(completed.marisa_material_rumor || ...);
    case 'alice':  return Boolean(completed.alice_greenhouse_maintenance_proposal);
    case 'nitori': return Boolean(completed.nitori_greenhouse_automation_proposal);
    case 'cirno':  return Boolean(completed.cirno_fairy_garden_meeting || completed.cirno_first_meeting);
    case 'mystia': return Boolean(completed.mystia_first_meeting || completed.mystia_banquet_meeting);
    case 'suika':  return Boolean(completed.suika_first_meeting || completed.suika_banquet_meeting);
    case 'sakuya': return Boolean(completed.sakuya_temporal_trace_investigation || completed.sakuya_first_meeting);
    default: return false;
  }
}
```
- 未认识 → 不进随机候选、不可邀请（`inviteCharacter` 抛 `尚未正式认识该角色`，`visitor-rules.ts:335`）。

### 3.2 统一调度入口 `evaluateVisitScheduler`（`visitor-rules.ts:166-264`）

每次调用做三件事（按顺序）：

**① 离场循环（181-203 行）——本地主动退场的唯一代码**：

```ts
for (const characterId of [...present]) {
  const meta = state.presence_snapshot?.visitor_meta?.[characterId];
  if (!meta?.planned_departure_serial) continue;          // ← 无 meta 的角色：永不主动清场（P0-A 根因）
  if (meta.planned_departure_serial > serial) continue;   // 未到期
  if (busy && (当前在 interaction 会话或 active_event 参与中)) continue; // busy 保护
  present.delete(characterId);                            // 移除
  delete state.presence_snapshot!.character_views?.[characterId];
  delete state.presence_snapshot!.visitor_meta?.[characterId];
  state.visit_scheduler!.cooldown_until![characterId] = serial + cooldown; // 写冷却
  // 追加"XX离开了庭园。"通知
}
```

**② 到期计划落地（206-255 行）**：

```ts
const duePlans = plans.filter(plan =>
  plan.status === 'scheduled' && (plan.due_serial ?? 0) <= serial);   // ← 只看 scheduled
for (const plan of duePlans) {
  if (busy && !options.commitArrivals) continue;
  if (present.has(plan.character_id)) { plan.status = 'cancelled'; continue; }
  if (cooldown_until > serial) { plan.status = 'cancelled'; continue; }
  if (present.size >= visitorCap(state) && plan.source !== 'event') {
    plan.status = 'deferred';                          // ← P0-B：deferred 后永不恢复
    plan.due_serial = serial + 1;
    continue;
  }
  // 到场：写 present + character_views + visitor_meta（arrived/earliest/planned_departure）
  // plan.status = 'arrived'；追加"XX来了"通知
}
state.visit_scheduler!.plans = plans
  .filter(plan => plan.status === 'scheduled' || plan.status === 'deferred')  // arrived/cancelled 被移除
  .slice(-32);
```

**③ 每时段至多 1 次随机到访计划（258-261 行）**：

```ts
if ((last_processed_serial ?? -1) < serial && !busy) {
  maybeScheduleRandomVisit(state, serial, options.chatId ?? 'local');
  last_processed_serial = serial;
}
```

### 3.3 随机到访 `maybeScheduleRandomVisit`（`visitor-rules.ts:266-316`）

过滤链：满员 → 已有同时段 random 计划 → 未认识 → 已在场 → 冷却中 → 时段权重 0 → 加权抽样；**35% 空档 roll**（`visit-empty` 种子，286-287 行）。随机计划 `due_serial = serial` 即当前时段落地。

### 3.4 邀请 `inviteCharacter`（`visitor-rules.ts:318-395`）

```ts
if (plans 中已有同 inviteId) return 幂等结果（cancelled→decline / due===serial→accept_now / else reschedule）
if (!isCharacterKnown) throw '尚未正式认识该角色，不能邀请'
if (invitation_cooldowns > serial) throw '该角色的邀请仍在冷却中'
if (present.includes(characterId)) throw '该角色已在庭园中'
roll = stableRoll(`invite:${inviteId}`, accept+resched+decline)
if decline → 写邀请冷却 serial+2；登记 cancelled 计划；返回 'decline'
due = accept_now ? serial : serial + 1 + stableRoll(`invite-delay`, 3)
if accept_now → evaluateVisitScheduler(state, { commitArrivals: true, busy: false })  // ← 满员会被 defer（P1-C）
```

### 3.5 机遇卡到场 `commitOpportunityArrival`（`visitor-rules.ts:415-463`）

前置：已登记（duelRegisteredIds）、未认识、未在场、未满员；直接写 `presence_snapshot` + `visitor_meta`（`planned_departure_serial = serial + stay`）+ 标记已知。**写 visitor_meta 的两处之一**（另一处在 `evaluateVisitScheduler` 落地计划处 239-246）。

---

## 4. 执行层

### 4.1 `src/ui/m2-runtime.ts` `reconcileM2Runtime`（1-43 行）——统一调度入口

```ts
export function reconcileM2Runtime(before, accepted, chatId) {
  const previousSerial = periodSerialFromState(before);
  let state = structuredClone(accepted);
  state = tickFacilityUnlocks(state);          // facility-rules
  state = tickAnomalyLifecycle(state);         // anomaly-rules
  state = tickActivitiesOnTimeAdvance(state, previousSerial); // activity-rules：跨时段结束温泉/宴会
  state = reconcilePendingTasks(state);        // task-rules
  const busy = Boolean(state.battle?.current || state.events?.active_event
    || state.interaction?.current_session || state.anomaly_cycle?.pending_activation
    || state.anomaly_cycle?.active?.status === 'resolving');
  state = evaluateVisitScheduler(state, { chatId, commitArrivals: !busy, busy }).state;
  if (!busy) {                                 // 第二遍：把同时段新随机计划立即落地
    state = evaluateVisitScheduler(state, { chatId, commitArrivals: true, busy: false }).state;
  }
  return state;
}
```

调用它的文件与位置（**不在这个清单里的路径，调度不跑**）：

| 调用点 | 文件:行 | 触发场景 |
|---|---|---|
| `preserveLocalOwnership` | `src/ui/bridge.ts:567` | 普通自由聊天回复后（`pendingOwnershipBefore` 分支） |
| `persistLocalSettlement` 之后 | `src/ui/bridge.ts:503-517` | ⚠️ **见 P1-D：此路径不调 reconcile** |
| `settleDungeonResult` | `src/ui/bridge.ts:1143` | 副本结算（对战卡/弹幕副本） |
| `regenerateSettledFloor` | `src/ui/bridge.ts:1420` | 重新生成后 |
| `applyM2Command`（5 处） | `src/ui/m2-commands.ts:43,58,80,115,129` | 建造/换型/恢复/宴会/结束聊天后 |
| `startDueBanquet` | `src/ui/activity-rules.ts:214` | 公开宴会开始时（内部再调一次） |

### 4.2 `src/ui/m2-commands.ts` `applyM2Command`（29-151 行）

`invite_character`（87-93）→ `inviteCharacter`（**此命令后不跑 reconcile**；accept_now 已在函数内部跑过带 `commitArrivals` 的调度）。其余命令见上表。

### 4.3 `src/ui/activity-rules.ts`

- `scheduleBanquet`（149-197）：逐个 `inviteCharacter` 收集接受者（**满员 defer 在此同样生效**）。
- `startDueBanquet`（199-218）：公开宴会开始后调 `evaluateVisitScheduler(commitArrivals:true)` 用 6 人上限补位。
- `markBanquetOverflowForDeparture`（240-253）：宴会结束把超出 3 人的访客 `planned_departure_serial = serial`（立即走）。
- `tickActivitiesOnTimeAdvance`（293-306）：跨时段自动结束温泉/宴会会话。
- `endConversationLocal`（276-287）：结束聊天时清会话 + 结束温泉/宴会。

### 4.4 `src/ui/card-item-rules.ts`（机遇卡）

`useOpportunityCard` → `commitOpportunityArrival`（`card-item-rules.ts:107`），前置检查满员（`:65`）。

---

## 5. 桥接层 `src/ui/bridge.ts`

### 5.1 普通自由聊天：`settlePendingAfterReply`（692-733）→ `preserveLocalOwnership`（556-601）

```ts
let protectedState = reconcileM2Runtime(
  ownershipBase,
  applyPresenceUpdate(restoreLocalEventOwnership(ownershipBase, current), assistantText),
  currentChatId(),
);
```
顺序：`restoreLocalEventOwnership`（presence 用 before，**含 visitor_meta**）→ `applyPresenceUpdate`（**整体覆盖，丢 visitor_meta**，P0-A）→ reconcile。

### 5.2 本地固定事件：`persistPendingSettlement`（536-554）→ `persistLocalSettlement`（约 480-518）

```ts
const safeCurrent = restoreLocalEventOwnership(ownershipBase, current, true);
const settledState = applyLocalSettlement(safeCurrent, action, assistantMessageId, settlementText);
const nextState = hasLocalPresenceTransition(action)
  ? settledState                                   // 事件自带在场转换：applyLocalPresenceTransition 已执行
  : applyPresenceUpdate(settledState, assistantText);
data.stat_data = nextState;                        // ← 没有 reconcileM2Runtime（P1-D）
```

### 5.3 重新生成：`regenerateSettledFloor`（约 1400-1425）——同 5.1 模式（1420-1424）。

### 5.4 副本结算：`settleDungeonResult`（1134-1155）——`reconcileM2Runtime(before, settleLocalDungeonResult(before, result), ...)`（无回执参与）。

---

## 6. 在场回执与投影

### 6.1 模型契约 `src/ui/target-actions.ts:36-48`

```text
【庭园在场快照：本轮唯一事实】当前在场：…
若正文中有角色明确抵达、离场或更换区域，必须在正文结束后额外输出一次严格 JSON 的
<GensokyoPresence>{"version":"presence.v1","present_character_ids":[…],"character_views":{…}}</GensokyoPresence>。
没有出入场或位置变化时不要输出该标签。
```
配套：`src/lorebook/gal-presentation-protocol.md`、`src/lorebook/variable-update-rules.md`、`project/presence-sync-contract.md`（"回执原子覆盖 presence_snapshot"）。

### 6.2 解析 `parsePresenceUpdate`（`src/ui/event-settlement.ts:125-167`）

从正文后 `【庭园正文结束】` 之后从后往前找最后一个合法 `<GensokyoPresence>`；校验 `version === 'presence.v1'`、`present_character_ids` 是数组、`slice(0,12)`；`character_views` 的 `facing` 白名单 front/back/left/right。

### 6.3 🔴 P0-A 根因 `applyPresenceUpdate`（`src/ui/event-settlement.ts:169-197`）

```ts
next.presence_snapshot = {
  present_character_ids: presentCharacterIds,
  character_views: characterViews,
};
// ↑ 丢弃 visitor_meta（planned_departure_serial / arrival_uid / reason_id / source）
```
- 只保留"已登记角色"（`characters` 键）且区域合法的角色。
- **不保留仍在场角色的 `visitor_meta`** → 离场循环对它们永远 `continue`。
- 全仓库没有任何代码在覆盖后重建 `visitor_meta`（唯一相关的是 `state-migrations.ts:190-196`，只做"不在场即删除"的清理）。

### 6.4 🔴 P0-A 第二来源 `applyLocalPresenceTransition`（`src/ui/event-settlement.ts:235-264`）

固定事件结算末尾（`applyLocalSettlement` 771 行）执行，同样整体重建：

```ts
state.presence_snapshot = {
  present_character_ids: presentCharacterIds,
  character_views: Object.fromEntries(...),
};
```
同样丢弃 `visitor_meta`。凡带 `presence_transition` 的固定事件（如灵梦/魔理沙入场事件）结算一次，在场角色全部脱离本地离场调度。

### 6.5 `restoreLocalEventOwnership`（`src/ui/event-settlement.ts:828-920`）

presence 分支（852-856）：`next.presence_snapshot = structuredClone(before.presence_snapshot)`（含 visitor_meta）——**但它执行在 applyPresenceUpdate 之前**，被后者覆盖，保护无效（5.1/5.2 顺序可见）。

### 6.6 每轮投影 `src/ui/prompt-context.ts:37`

```ts
`在场角色：${(state.presence_snapshot?.present_character_ids ?? []).join('、') || '无'}`,
```
**只有名单**。模型拿不到 `visitor_meta.planned_departure_serial`（也没有任何"该离场了"的提示），因此模型不会因"停留时长到了"主动让访客离场——本地调度是唯一主动退场机制，而它已被 P0-A 废掉。

---

## 7. 数据定义层

| 文件:行 | 内容 |
|---|---|
| `src/ui/types.ts:88-98` | `VisitPlan`（`status: VisitPlanStatus`，`source: VisitSource`） |
| `src/ui/types.ts:100-107` | `VisitorMeta`（`planned_departure_serial` 等） |
| `src/ui/types.ts:224-228` | `presence_snapshot` |
| `src/ui/types.ts:11` | `VisitPlanStatus = 'scheduled' | 'arrived' | 'cancelled' | 'deferred'` |
| `src/schema/02-mvu-schema.js:158-169` | `presence_snapshot` schema（`visitor_meta` 为 passthrough dictionary） |
| `src/schema/02-mvu-schema.js:300-318` | `visit_scheduler` schema（`plans` 上限 32、`pending_notices` 上限 12） |
| `src/schema/initial-state.json:248-256` | 初始 `visit_scheduler` |
| `src/ui/state-migrations.ts:176-196` | 迁移：`visitor_meta ??= {}` + **只清理不在场角色的 meta**（不重建） |
| `src/ui/ensureScheduler` `visitor-rules.ts:109-130` | 运行期兜底：`visitor_meta ??= {}`（同样不重建） |

---

## 8. 问题详情

### P0-A：`visitor_meta` 被覆盖丢弃 → 角色永久赖场

- **触发**：任意一次模型回复输出 `GensokyoPresence`（契约要求"换区"也必须输出，见 6.1），或任意带 `presence_transition` 的固定事件结算。
- **代码**：`event-settlement.ts:192-195`（applyPresenceUpdate）、`event-settlement.ts:260-263`（applyLocalPresenceTransition）；离场循环 `visitor-rules.ts:184-186` 对无 meta 角色 `continue`。
- **影响**：在场角色失去 `planned_departure_serial` → 本地调度再也不会清走它们 → 占满 3 人上限 → 访客系统整体停摆（见 P0-B/P1-C）。
- **现状测试**：`tests/ui-contract.test.mjs:1774-1803` 只断言"名单被替换"，**未断言 visitor_meta 保留**。

### P0-B：`deferred` 计划永不恢复 → 邀请/随机到访永久丢失

- **触发**：满员时任何 `source !== 'event'` 的到期计划（随机、邀请 accept_now/reschedule 到期）。
- **代码**：置位 `visitor-rules.ts:219-222`；到期过滤只认 `scheduled`（`visitor-rules.ts:206`）；末尾 `.filter` 保留 deferred（`:253-255`）。grep 全仓库确认 **无任何代码把 deferred 恢复为 scheduled**。
- **影响**：计划成为死计划，一直躺在 `plans` 直到被 `.slice(-32)` 挤出。满员是常态（P0-A 加剧），因此频繁发生。
- **现状测试**：`tests/m2-r38-r45.test.mjs:124-135` 只断言"结果三选一 + 不超上限"，**未验证 deferred 计划后续能否到场**。

### P1-C：邀请 accept_now 满员被 defer，UI 反馈"对方现在就来"

- **触发**：场上已满 3 人时邀请某角色且 roll 中 accept_now。
- **代码**：`inviteCharacter` 返回 `result:'accept_now'`、`message:'答应现在过来'`（`visitor-rules.ts:382-388`）→ UI `app.ts:3245-3246` 显示"邀请成功，对方现在就来"；实际计划被 defer（P0-B）且永不落地。
- **影响**：用户直接体验为"邀请了不来"。

### P1-D：固定事件结算推进时段后不跑 `reconcileM2Runtime`

- **触发**：任何 `advance_time_periods:1` 的固定事件（如温室选型 `event-settlement.ts:610`）。
- **代码**：`bridge.ts:503-517` `persistLocalSettlement` 落盘后**未调 reconcile**；对比 5.1/5.3 均有。
- **影响**：到期的本地离场、到期计划落地都延后，直到下一次普通回复/命令才补；`tickActivitiesOnTimeAdvance`（跨时段结束温泉/宴会）也不会在固定事件推进时段时执行。

### P2-E：时间不推进 → 调度静止；模型无停留时长概念

- **代码**：`periodSerialFromState`（`time-rules.ts:60-62`）；普通闲聊不推进时段（`target-actions.ts:649` 提示"普通短暂闲聊不要强制推进"）；投影只有名单（`prompt-context.ts:37`）。
- **影响**：只要玩家连续闲聊/挂会话不推进时段，`planned_departure_serial` 永远不到期；模型也不会自觉让访客走。这是"赖场"体验的最大放大因素，叠加 P0-A 后为必然结果。

### P2-F：busy 期间离场与随机到访暂停

- **代码**：`visitor-rules.ts:174-179`（busy 判定）、`:187-190`（会话/事件参与角色到点不走）、`:258`（busy 不生成随机计划）。
- **说明**：设计意图是"活动中角色不中途离场"，但会话/事件不结束时角色一直停留；释放依赖 `endConversationLocal`（`activity-rules.ts:276-287`，UI"结束当前聊天"按钮）等玩家主动操作。

---

## 9. 测试覆盖现状与缺口

| 测试 | 覆盖 | 缺口 |
|---|---|---|
| `tests/m2-r38-r45.test.mjs:117-136` | 调度确定性、未认识不可邀、满员邀请三选一 | deferred 恢复、accept_now 满员 UI 一致性 |
| `tests/ui-contract.test.mjs:1774-1803` | 回执替换名单、非法 draft 兜底 | **visitor_meta 保留** |
| `tests/card-item-rules.test.mjs:56` | 机遇卡写 visitor_meta | 机遇卡角色后续离场 |
| 无 | — | 固定事件推进时段后调度执行 |
| 无 | — | 时间不推进时赖场行为 |

---

## 10. 场景化复现路径

**场景一（最易触发：换区即赖场）**
1. 琪露诺随机到访（visitor_meta 写入 `planned_departure_serial`）。
2. 玩家与其互动一轮，模型叙事让她"从妖精花园走到中央庭院"→ 按契约输出回执。
3. `applyPresenceUpdate` 重建 presence_snapshot，琪露诺仍在场但 `visitor_meta` 消失。
4. 之后任意时段推进，离场循环对琪露诺 `continue` → 永久赖场。

**场景二（满员即丢邀请）**
1. 场上已赖场 3 人（场景一累积）。
2. 玩家邀请灵梦，roll 中 accept_now → UI 显示"对方现在就来"。
3. 计划被 defer（P0-B）→ 永不落地 → 灵梦再也不来；随机到访也被 cap 挡住。

**场景三（固定事件推进时段不调度）**
1. 咲夜到访（planned_departure = serial+1）。
2. 玩家完成一个推进时段的固定事件（如温室换型）。
3. 时段已推进但 `reconcileM2Runtime` 未跑 → 咲夜继续在场，直到下一次普通回复。

---

## 11. 修复方向（仅建议，未实施）

1. **P0-A**：`applyPresenceUpdate` / `applyLocalPresenceTransition` 重建 `presence_snapshot` 时，合并保留"仍在场角色"的 `visitor_meta`（新增对应契约测试）。
2. **P0-B**：给 `deferred` 计划加重新激活路径（到期重查时把 `deferred` 且 `due_serial <= serial` 的计划转回 `scheduled` 再处理；或在满员时改为 `cancelled` 并补通知，避免静默丢失）。
3. **P1-C**：`inviteCharacter` 在满员导致 defer 时返回 `reschedule`（并让 UI 显示"改约到之后时段"），或让邀请计划 `source` 按事件处理、突破 cap。
4. **P1-D**：`persistLocalSettlement` 落盘前/后补 `reconcileM2Runtime`（与 5.1/5.3 一致），确保固定事件推进时段也跑调度。
5. **P2-E**（可选）：在 `buildPromptContext` 或 `withGardenNarrativeContract` 中给模型注入"在场访客已停留时段 / 临近离场"信息，让模型叙事更配合本地调度。
