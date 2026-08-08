# 角色“赖场”问题分阶段修复执行计划

> 计划用途：交给后续实施 Agent 逐项执行。本文是施工合同，不是问题讨论稿。
> 上游审计：`project/character-arrival-departure-audit.md`
> 计划编制日期：2026-08-08
> 当前状态：两轮离线修复已完成，并于 2026-08-08 通过独立离线验收；真实 SillyTavern 实机验收仍待执行。
> 交付边界：只修复角色在场生命周期、来访计划恢复、邀请反馈和固定事件调度；不构建、不发布、不上传 R2、不打包角色卡。

---

## 0. 给实施 Agent 的强制指令

1. **先完整阅读本文，再执行任何修改。** 不得边读边改。
2. **以当前工作区为真实基线，不以 `HEAD`、main 分支或其他仓库为基线。** 当前工作区已有用户未提交改动，禁止使用：
   - `git reset --hard`
   - `git checkout -- <file>`
   - `git restore <file>`
   - 任何会用 Git 版本覆盖当前本地文件的命令
3. 不得修改、清理、暂存或提交与本计划无关的现有改动。未经用户明确要求，不执行 `git add`、`git commit`、`git push`。
4. 必须在开始施工时创建并持续更新：
   - `project/character-lingering-fix-implementation-log.md`
5. 日志不是结束后补写。每完成一个阶段，立即记录：
   - 时间；
   - 修改文件；
   - 修改内容；
   - 实际执行命令；
   - 命令退出码和结果；
   - 与计划的偏差；
   - 尚未解决的问题。
6. 每阶段只做该阶段列出的修改。测试失败时先判断是否由本阶段引入；禁止顺手修理无关失败。
7. 如果实际根因与本文不同、需要改 schema、需要迁移旧存档、需要新增依赖、需要改 R2/远程 UI 交付链，**立即停止并在日志中写明阻塞原因**，不要自行扩大范围。
8. 不得通过删除断言、降低断言强度、跳过测试、捕获并吞掉异常来制造“测试通过”。
9. 所有状态变换必须保持纯函数/克隆语义，不得把新逻辑改成直接污染调用者传入对象，除非该函数当前合同本来就是原地修改。
10. 施工完成只允许声称“离线代码与自动测试完成”。没有真实 SillyTavern 导入证据，不得声称实机验收完成。

---

## 1. 已确认根因与修复边界

### 1.1 必须修复

| 编号 | 根因 | 直接证据 | 目标结果 |
|---|---|---|---|
| L-1 | `applyPresenceUpdate` 整体重建 `presence_snapshot` 时丢弃 `visitor_meta` | `src/ui/event-settlement.ts:192-195` | 仍在场角色保留原 meta；已离场角色 meta 删除 |
| L-2 | `applyLocalPresenceTransition` 整体重建快照时丢弃所有 meta | `src/ui/event-settlement.ts:260-263` | 不相关在场角色保留 meta；leave 角色清 meta；事件新到场角色获得确定性 meta |
| L-3 | `deferred` 计划不会重新进入到期处理 | `src/ui/visitor-rules.ts:206,219-222,253-255` | 名额释放且计划到期后自动落地；仍满员则继续延期 |
| L-4 | 满员时 `accept_now` 实际 defer，返回文案却说“现在过来” | `src/ui/visitor-rules.ts:382-388` | 实际没到场时返回 `reschedule` 和延期文案 |
| L-5 | 固定事件结算推进时段后不运行统一调度 | `src/ui/bridge.ts:503-513` | 写盘前基于结算前后状态运行一次 `reconcileM2Runtime` |
| L-6 | `planned_departure_serial=0` 被真假值判断当成缺失 | `src/ui/visitor-rules.ts:185` | `0` 是合法到期值，只有 `null/undefined` 才表示缺失 |

### 1.2 本轮明确保持不变

- `presence_snapshot` 继续作为地图和叙事现场的唯一事实源。
- `GensokyoPresence` 回执仍原子决定在场名单和角色视图。
- 回执不能写入或伪造 `visitor_meta`；该字段仍由本地 bridge 独占。
- 普通访客上限仍按当前“物理在场人数”语义执行。本轮不擅自改成只统计 `visitor_meta`。
- `busy` 期间仅保护当前会话/事件参与者不被中途清走；其他到期角色仍可离场。
- 普通短暂闲聊不强制推进时段。本轮不引入“按聊天轮数离场”或真实时间计时器。
- 不修改 `VisitPlanStatus`、MVU schema、初始状态格式、存档版本和迁移版本。
- 不改变随机种子规则、来访概率、stay/cooldown 配置和角色名单。
- 不修改 R2 loader、远程 UI manifest、发布脚本、checkpoint 或 `dist/`。

### 1.3 允许修改的文件

预期业务文件：

- `src/ui/visitor-rules.ts`
- `src/ui/event-settlement.ts`
- `src/ui/bridge.ts`

预期测试文件：

- `tests/m2-r38-r45.test.mjs`
- `tests/ui-contract.test.mjs`

预期合同与记录文件：

- `project/presence-sync-contract.md`
- `project/character-lingering-fix-implementation-log.md`（实施时新建）

原则上不应修改其他文件。如果必须修改其他文件，先停止，在实施日志中写明“为什么上述文件无法完成合同”，等待用户重新授权。

### 1.4 补丁预算

- 执行方式：分阶段本地修复，不重写模块。
- 业务源码目标：不超过 3 个文件、约 120 行净修改。
- 测试与合同目标：不超过 3 个文件、约 180 行净修改。
- 实施日志不计入业务补丁预算，但必须只记录事实，不复制大段源码。
- 禁止无关格式化、全文件换行重写、批量重命名和依赖升级。

---

## 2. 修复后的行为合同

### 2.1 在场回执合同

给定回执前状态 `before`、回执后的合法在场 ID 集合 `nextPresent`：

```text
next.visitor_meta = before.visitor_meta 中 key 属于 nextPresent 的条目
```

必须满足：

1. 角色仍在场：完整保留其原 `visitor_meta`，包括未知 passthrough 字段。
2. 角色已离场：删除其 `character_views` 和 `visitor_meta`。
3. 模型回执新增角色：允许加入在场名单和视图，但不得由模型凭空生成 `visitor_meta`。
4. 非法角色 ID、非法区域的原有白名单行为保持不变。
5. 无合法回执时原样返回，不能借机清理或重建 meta。

### 2.2 固定事件在场迁移合同

1. 迁移前已经在场且迁移后仍在场的角色：保留原 meta。
2. `leave` 中的角色：同时删除名单、视图和 meta。
3. `arrive` 中的新角色：
   - 若已有 meta，不覆盖；
   - 若角色有来访档案，则创建 `source: 'event'` 的确定性 `VisitorMeta`；
   - `arrival_uid` 使用稳定且可复现的事件标识，优先采用 `action.settlement_id`，缺失时使用由 `event_id + character_id + 当前 periodSerial` 组成的稳定字符串；
   - `reason_id` 使用稳定的事件原因标识，例如 `event:${event_id}`，长度必须符合现有 schema；
   - `arrived_period_serial = 当前 serial`；
   - `earliest_departure_serial = serial + 1`；
   - `planned_departure_serial` 根据该角色现有 `stay_period_range` 和稳定种子确定，必须 `>= serial + 1`；
   - 不得使用 `Math.random()`、当前时间戳或内存自增值。
4. 如果事件到场角色没有来访档案：保留到场，但不伪造生命周期；在实施日志中记录该角色 ID。当前登记的三个提案角色理论上都有档案。
5. 事件本轮结算结束后角色不会立刻消失；到计划时段后由统一调度清理。

实现建议：在 `visitor-rules.ts` 提供一个小型、纯函数的“根据角色档案构造 VisitorMeta”帮助函数，调度到场、机遇卡到场与事件到场可逐步共用。**如果为了共用必须大幅重构现有到场路径，本轮只让事件路径调用该帮助函数，不要扩大重构。**

### 2.3 deferred 计划合同

1. 到期候选必须同时包含：
   - `status === 'scheduled'`
   - `status === 'deferred'`
   - 且 `due_serial <= 当前 serial`
2. 到期时仍满员且 `source !== 'event'`：
   - 状态保持 `deferred`；
   - `due_serial` 更新为 `当前 serial + 1`；
   - 不到场、不写 arrival notice、不生成 meta。
3. 到期时已有名额：按原有到场路径处理，写入名单、视图、meta、通知，并从活动计划列表移除。
4. 角色已经在场或处于冷却：沿用当前取消语义，不新增重复角色。
5. 多次对同一状态执行协调不得重复到场或重复通知。

### 2.4 邀请反馈合同

1. 随机 roll 命中立即接受，且协调后角色真的进入 `present_character_ids`：返回 `accept_now` 与“现在过来”文案。
2. 随机 roll 命中立即接受，但因满员变成 `deferred`：返回 `reschedule` 与“之后时段再来”文案。
3. 原本 roll 为 reschedule/decline：保持现有结果与文案。
4. 同一个 `inviteId` 重放：根据已保存计划的真实状态返回一致结果；`deferred` 不得被解释为 `accept_now`。
5. `scheduleBanquet` 只把真正已经到场的 `accept_now` 角色加入 `accepted_character_ids`，不得把 deferred 角色误记为已接受并到场。

### 2.5 固定事件统一协调合同

`persistLocalSettlement` 应按以下顺序构造最终写盘状态：

```text
ownershipBase
→ restoreLocalEventOwnership 得到 safeCurrent
→ applyLocalSettlement 得到 settledState
→ 应用固定 transition 或受控 GensokyoPresence
→ reconcileM2Runtime(safeCurrent, nextState, currentChatId())
→ 写入 assistant 楼层 stat_data
→ 复读 settlementProjection
```

要求：

- `before` 参数必须使用结算前的 `safeCurrent`，不能把结算后状态同时作为 before/accepted。
- 每次固定结算只协调一次完整 M2 生命周期；不要在桥接层手写一份离场逻辑。
- 若固定结算没有推进时间，协调仍须幂等，不得制造额外随机重抽或重复通知。
- 若固定结算推进一个时段，应在同一写盘事务中完成到期离场、到期计划和活动生命周期处理。

### 2.6 serial 0 合同

以下写法禁止保留：

```ts
if (!meta?.planned_departure_serial) continue;
```

必须改为只排除空值的显式判断，例如：

```ts
if (meta?.planned_departure_serial == null) continue;
```

不得使用 `||` 给合法的 `0` 设置默认值。

---

## 3. 施工前基线与日志初始化

### 3.1 创建实施日志

先创建 `project/character-lingering-fix-implementation-log.md`，至少包含：

```markdown
# 角色“赖场”修复实施日志

> 对应计划：project/character-lingering-fix-plan.md
> 开始时间：YYYY-MM-DD HH:mm（Asia/Shanghai）
> 当前状态：进行中 / 阻塞 / 离线完成待验收

## 0. 施工前基线
- git status --short：
- 目标文件初始 SHA-256：
- 已知预存改动：
- 基线命令与结果：

## 1. 阶段 A：快照元数据
...

## 2. 阶段 B：计划恢复与邀请反馈
...

## 3. 阶段 C：事件生命周期与统一协调
...

## 4. 阶段 D：边界与合同
...

## 5. 最终验证
...

## 6. 未完成与实机验收边界
...
```

### 3.2 记录工作区而不是清理工作区

执行并把输出摘要写入日志：

```powershell
git status --short
git diff -- src/ui/visitor-rules.ts src/ui/event-settlement.ts src/ui/bridge.ts tests/m2-r38-r45.test.mjs tests/ui-contract.test.mjs project/presence-sync-contract.md
Get-FileHash -Algorithm SHA256 src/ui/visitor-rules.ts,src/ui/event-settlement.ts,src/ui/bridge.ts,tests/m2-r38-r45.test.mjs,tests/ui-contract.test.mjs,project/presence-sync-contract.md
```

若目标文件在施工前已经被修改，不得回退；在日志中标注“预存改动”，施工时只在相关最小代码块上编辑。

### 3.3 施工前自动基线

按顺序运行：

```powershell
npm run check:ui
node --test --test-name-pattern="R38 来访调度|在场快照会注入" tests/m2-r38-r45.test.mjs tests/ui-contract.test.mjs
```

记录退出码和通过/失败数量。若基线失败：

- 确认是否为当前工作区既有失败；
- 不得先修无关失败；
- 若失败阻止本计划验证，停止并记录阻塞。

---

## 4. 阶段 A：修复快照覆盖导致的 meta 丢失

### A-1 先增加失败测试

在 `tests/ui-contract.test.mjs` 增加或扩展测试，至少覆盖：

1. 初始在场 `reimu`、`marisa` 都有不同 meta。
2. 回执保留 `reimu`、移除 `marisa`。
3. 断言：
   - `reimu` 的 meta 深度相等，包括额外未知字段；
   - `marisa` 的 view 和 meta 均不存在；
   - 回执新加入的合法角色没有自动继承其他角色 meta；
   - 输入 state 未被原地修改。

先单独运行该测试，确认修改业务代码前它确实失败。把“预期失败”记录到日志；若它意外通过，停止检查测试是否真正覆盖目标分支。

### A-2 修改 `applyPresenceUpdate`

在函数重建快照时：

- 从旧快照读取 `previousVisitorMeta`；
- 只复制 `presentCharacterIds` 中已有的旧 meta；
- 使用 `structuredClone` 或等价深拷贝，不能共享嵌套引用；
- 输出快照必须显式包含 `visitor_meta`，即使为空对象。

不要改解析标签、角色白名单、区域白名单或正文截取逻辑。

### A-3 阶段验证

```powershell
node --test --test-name-pattern="在场快照" tests/ui-contract.test.mjs
npm run check:ui
```

两项通过后立即更新实施日志。失败则停留在阶段 A，不进入阶段 B。

---

## 5. 阶段 B：恢复 deferred 计划并修正邀请反馈

### B-1 先增加 deferred 回归测试

在 `tests/m2-r38-r45.test.mjs` 增加独立测试，不要只扩展“三选一”断言。固定构造状态，避免测试依赖随机碰运气：

1. 创建一个 `status:'deferred'`、`due_serial <= 当前 serial` 的计划。
2. 场上留有名额。
3. 调用 `evaluateVisitScheduler(..., { commitArrivals:true, busy:false })`。
4. 断言角色到场、meta 完整、计划不再保留、arrival notice 只产生一次。
5. 对结果再调用一次 scheduler，断言不重复到场、不重复 notice。
6. 另建满员状态，断言计划仍为 deferred，且 `due_serial` 精确推进到 `serial+1`。

### B-2 修改 duePlans 过滤

只修改到期候选状态判断，让 `scheduled` 与 `deferred` 都能到期重查。不要引入新的计划状态，不要后台把所有 deferred 批量改回 scheduled。

### B-3 修正邀请结果

在 `inviteCharacter` 的 `accept_now` 分支：

1. 运行现有协调；
2. 检查目标角色是否真的进入最终 `present_character_ids`；
3. 已到场才返回 `accept_now`；
4. 未到场且对应计划为 deferred 时返回 `reschedule` 与延期文案；
5. 幂等分支必须把 existing deferred 解释为 `reschedule`。

测试必须找到一个稳定命中 accept roll 的 `inviteId`。可以在测试准备阶段用固定小循环寻找，但断言最终选定 ID 的结果；不得依赖不稳定随机数。

### B-4 阶段验证

```powershell
node --test --test-name-pattern="R38 来访调度|deferred|邀请" tests/m2-r38-r45.test.mjs
npm run check:ui
```

把新增测试名称、通过数量和命令退出码写入日志。

---

## 6. 阶段 C：固定事件到场生命周期与结算后统一协调

### C-1 为事件迁移增加测试

通过公开的 `applyLocalSettlement` 走真实登记事件，不要为了测试导出私有函数。测试状态至少包含：

- 一个已有 visitor meta 的无关在场角色；
- 一个 `presence_transition.arrive` 的事件参与角色；
- 合法的环境时段、角色登记、事件前置和 action/settlement ID。

断言：

1. 无关在场角色 meta 完整保留；
2. 新到场事件角色获得 `source:'event'` meta；
3. 事件角色 departure serial 大于当前 serial；
4. 相同输入重复结算产生相同 meta；
5. 若测试使用 leave transition，则离场角色 meta 同步删除；若现有登记没有 leave，不得伪造生产配置，仅测试帮助函数/可达公开路径。

### C-2 实现事件到场 meta

建议在 `visitor-rules.ts` 增加一个最小纯函数，例如：

```ts
buildVisitorMetaForArrival(state, characterId, arrivalUid, reasonId, source)
```

要求：

- 返回 `VisitorMeta | null`；
- 没有 profile 时返回 null；
- 使用现有 `stableRoll` 与 `stay_period_range`；
- 不写 state；
- 不改变现有随机/邀请/机遇卡的 seed，除非相应测试证明输出保持不变。

然后让 `applyLocalPresenceTransition`：

- 先保留迁移后仍在场的旧 meta；
- 对 leave 删除 meta；
- 仅为真正新增且无 meta 的 arrive 角色生成事件 meta；
- 最终 `visitor_meta` 只包含最终在场名单内的 key。

### C-3 固定结算后调用统一协调

在 `src/ui/bridge.ts` 的 `persistLocalSettlement` 内：

```ts
const nextState = ...;
const reconciledState = reconcileM2Runtime(safeCurrent, nextState, currentChatId());
data.stat_data = reconciledState;
```

复读校验的 expected state 也必须改成 `reconciledState`，不能继续拿协调前状态校验。

不得在这里复制 `evaluateVisitScheduler`、`tickActivitiesOnTimeAdvance` 等子逻辑。

### C-4 固定事件推进时段回归测试

优先做纯逻辑测试：构造结算前访客 departure 到下一 serial，应用推进一个时段的固定事件，再走与 bridge 相同的 reconcile，断言访客在最终状态离场。

如果现有测试夹具能安全模拟 `persistLocalSettlement` 的宿主写回，则增加桥接层测试；如果不能，不要伪造“实机已验证”，应：

- 保留源码合同断言；
- 运行 TypeScript 和完整逻辑测试；
- 在实施日志的残余风险中写明真实宿主写回仍待验收。

### C-5 阶段验证

```powershell
node --test --test-name-pattern="在场快照|presence|固定事件|来访调度" tests/ui-contract.test.mjs tests/m2-r38-r45.test.mjs
npm run check:ui
```

---

## 7. 阶段 D：serial 0、合同同步与防回归

### D-1 serial 0 测试

在第 1 日清晨构造：

- 角色在场；
- `planned_departure_serial: 0`；
- 无 battle、active event、current session 或 resolving anomaly；

调用 scheduler，断言角色被移除、meta 删除、cooldown 写入、departure notice 只出现一次。

### D-2 修正空值判断

把真假值判断改成 nullish 判断。搜索全仓库，确认没有其他离场判断把 `0` 当缺失：

```powershell
rg -n "planned_departure_serial" src tests project
```

只修与本问题直接相关的判断；发现其他可疑路径先记日志，不顺手扩大范围。

### D-3 同步在场合同文档

更新 `project/presence-sync-contract.md`，明确：

- 回执原子覆盖的是“模型可写的名单与视图”；
- bridge 必须保留仍在场角色的代码所有 `visitor_meta`；
- 已离场角色 meta 必须同步删除；
- 模型回执不得提供 visitor meta；
- 固定事件新增角色的生命周期由 bridge 根据登记档案生成。

不要改成让模型输出 `visitor_meta`。

### D-4 阶段验证

```powershell
node --test --test-name-pattern="serial 0|planned_departure|在场快照|deferred|邀请|固定事件" tests/m2-r38-r45.test.mjs tests/ui-contract.test.mjs
npm run check:ui
```

---

## 8. 最终验证矩阵

必须按从小到大的顺序执行并记录。

### 8.1 聚焦测试

```powershell
node --test --test-name-pattern="R38 来访调度|在场快照|deferred|邀请|固定事件|serial 0" tests/m2-r38-r45.test.mjs tests/ui-contract.test.mjs
```

### 8.2 两个相关测试文件全量

```powershell
node --test tests/m2-r38-r45.test.mjs tests/ui-contract.test.mjs
```

### 8.3 TypeScript

```powershell
npm run check:ui
```

### 8.4 项目全量自动测试

```powershell
npm test
```

若 PowerShell/npm 对 glob 展开行为异常，记录原命令错误后改用：

```powershell
node --test tests/*.test.mjs
```

不得隐去第一次失败。

### 8.5 文本与补丁卫生

```powershell
git diff --check
git diff -- src/ui/visitor-rules.ts src/ui/event-settlement.ts src/ui/bridge.ts tests/m2-r38-r45.test.mjs tests/ui-contract.test.mjs project/presence-sync-contract.md project/character-lingering-fix-implementation-log.md
git status --short
```

注意：当前仓库已有大量预存改动，`git diff` 相对 HEAD 不能单独证明“本次改了什么”。最终日志还必须列出：

- 本次实际触碰的文件；
- 每个文件修改的函数/测试名；
- 哪些差异是施工前已有；
- 是否出现计划外文件。

本轮不得运行 UI 构建、checkpoint 打包或 R2 发布命令。它们会制造计划外产物，也不属于逻辑修复验收。

---

## 9. 必须新增的测试清单

实施完成时下列每项都必须能对应到明确测试名：

- [ ] 回执保留仍在场角色的完整 visitor meta。
- [ ] 回执删除已离场角色的 view 和 meta。
- [ ] 回执新加入角色不能伪造 visitor meta。
- [ ] 固定事件 transition 保留其他访客 meta。
- [ ] 固定事件新到场角色获得确定性 event meta。
- [ ] deferred 计划有名额后到场。
- [ ] deferred 计划仍满员时只延期一时段。
- [ ] scheduler 重放不重复到场和通知。
- [ ] 满员 accept roll 返回 reschedule，而不是 accept_now。
- [ ] 同 inviteId 的 deferred 幂等结果仍为 reschedule。
- [ ] 固定事件推进时段后到期访客在同次协调中离场。
- [ ] `planned_departure_serial=0` 可以正常离场。
- [ ] 原有非法区域、未知角色和未认识不可邀请测试继续通过。

---

## 10. 人工状态场景验收（离线状态级）

实施 Agent 应在测试或临时只读脚本中验证下列状态序列，并把结果摘要写入日志；不要把临时脚本留在仓库。

### 场景 1：换区后不再赖场

1. 访客带 `planned_departure_serial=当前+1` 到场。
2. 应用一次只改变区域、角色仍在场的 `GensokyoPresence`。
3. 确认 meta 仍存在且 departure serial 不变。
4. 推进一个时段并 reconcile。
5. 确认角色离场、meta 删除、通知产生一次。

### 场景 2：满员邀请自动改约

1. 场上三人。
2. 使用稳定命中 accept roll 的 invite ID。
3. 确认返回 `reschedule`，计划为 deferred。
4. 移走一人并推进到 due serial。
5. reconcile 后受邀角色到场，计划清理。

### 场景 3：固定事件不会抹掉别人的离场期限

1. 现有访客 A 带 meta 在场。
2. 结算一个让事件角色 B arrive 的固定事件。
3. 确认 A 的 meta 原样保留，B 得到 event meta。
4. 分别推进到 A/B 的离场期限，确认二者按各自期限离场。

### 场景 4：固定事件推进时间立即调度

1. 访客 departure 为下一 serial。
2. 结算 `advance_time_periods:1` 的温室选型/换型事件。
3. 最终写盘候选状态中访客已经离场，不需要再发一轮普通聊天。

### 场景 5：第 1 日清晨的 0 值

1. 当前 serial 为 0。
2. 访客 departure serial 为 0。
3. 空闲调度后立即离场。

---

## 11. 停止条件与回滚要求

出现任一情况立即停止：

- 需要修改 MVU schema 或迁移版本；
- 需要改变“在场人数上限”的产品语义；
- 需要修改事件 JSON 才能给事件角色生成生命周期；
- 需要新增依赖；
- 需要修改超过预期 3 个业务文件；
- 需要重写 visitor scheduler 或 bridge；
- 相关测试无法在不依赖真实宿主的情况下表达；
- 新逻辑改变随机 seed，导致无关来访结果漂移；
- 全文件出现大量换行/格式化差异；
- 当前工作区预存改动与本次修改发生无法安全合并的冲突。

停止时：

1. 不要使用 Git 覆盖整个文件。
2. 仅撤回自己刚添加的最小代码块；如果无法确认所有权，不要删除，标记冲突并等待用户。
3. 在实施日志把状态改为“阻塞”，写明最后一个成功阶段、失败命令和需要用户决定的事项。

---

## 12. 实施完成的交付格式

实施 Agent 最终回复必须包含：

1. 实际修改文件列表。
2. 六个根因 L-1 至 L-6 的对应修复位置。
3. 新增测试名称与覆盖关系。
4. 聚焦测试、相关测试、TypeScript、全量测试的实际结果。
5. `git diff --check` 结果。
6. 与计划的任何偏差。
7. 尚未完成的真实 SillyTavern 验收项。
8. 实施日志的路径。

完成判定：

- 所有必须新增测试通过；
- 原相关测试通过；
- TypeScript 通过；
- 全量测试没有本次引入的新失败；
- 没有计划外业务文件；
- 实施日志完整；
- 没有构建、打包、上传或部署行为。

只有满足以上条件，状态才能写成“离线完成，等待验收”。

---

## 13. 后续由验收 Agent 执行的事项（实施 Agent 不做）

实施完成后由独立验收者：

1. 对照本计划和实施日志审查实际 diff；
2. 独立重跑聚焦与全量测试；
3. 检查 meta 所有权、deferred 幂等和 bridge 调度顺序；
4. 判断是否需要真实 SillyTavern 导入；
5. 真实宿主中验证换区、邀请、固定事件推进时段和刷新后的持久状态；
6. 验收通过后再决定是否构建远程 UI、发布 R2 或制作新 checkpoint。

实施 Agent 不得提前替验收者宣布这些步骤已通过。
