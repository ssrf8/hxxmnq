# R48 后续修复与到期待办优化实施日志

> 实施日期：2026-07-26  
> 对应计划：`project/r48-followup-repair-and-optimization-plan.md`  
> 当前状态：维护源实现完成，自动测试、UI 构建与 checkpoint 打包审计通过；尚未在真实 SillyTavern 导入验收。

## 1. P0-1 异变卡启用零 LLM

- 修改文件：`src/ui/app.ts`、`src/ui/special-item-rules.ts`（沿用既有本地原子启用）、合同与测试文件。
- 实际行为：使用异变卡后只执行本地扣卡、建立 active、生成并锁定隐藏源头、设置 28 时段期限；不进入 GAL，不调用 `sendUserMessage()`，不创建用户楼层。
- 后续剧情：`buildOrdinaryAnomalyPrompt()` 仍会在玩家下一次主动聊天时注入脱敏异变背景。
- 静态证据：源码已不存在“异变已启用，正在生成首次影响剧情”和首次剧情 prompt。

## 2. P0-2 普通结束聊天零 LLM

- 修改文件：`src/ui/app.ts`、`src/ui/activity-rules.ts`、`src/ui/m2-commands.ts`、`src/ui/types.ts`。
- 新命令：`end_conversation_local`。
- 原子清理：`interaction.current_session`、`scene_item_context`、绑定的温泉会话与正在举行的宴会；不推进时间。
- UI 行为：点击“结束聊天”或 GAL 返回时执行同一本地命令，成功后立即回庭院；失败时留在原场景并提供本地重试提示。
- 删除边界：普通结束不再调用 `buildSettlementMessage()`、`submitGalMessage(..., 'settlement')`，因此 iframe 内存的 `closurePending` 丢失也不会再制造重复 LLM 请求。

## 3. P0-3 异变到期待办与自动收尾

- 新增文件：`src/ui/task-rules.ts`。
- 新增字段：根级 `pending_tasks`，最多 8 条，由本地代码独占。
- 到期规则：到达 `end_period_serial` 后状态变为 `resolving`，创建唯一 `anomaly_resolution` 待办；自动期限为 `end_period_serial + 4`。
- 空闲规则：庭院空闲且待办不是 reminder-only 时，UI 会锁定待办并调用一次现有的持久化 `sendAnomalyResolution()` 系统操作。
- 聊天中规则：点击本地结束时把异变待办持久标记为 `reminder_only`，回庭院后只提醒，不自动打断或立即生成。
- 手动规则：待办按钮锁定任务后调用一次最终收尾；成功由 `resolveAnomaly()` 归档并删除待办，失败恢复 pending。
- 自动兜底：忽略 4 个标准时段后，本地直接 `resolveAnomaly(state, null)`；不调用 LLM，history 最多保留 8 条，重复协调不重复归档。

## 4. P0-4 宴会到期待办与默认举行

- 修改文件：`src/ui/activity-rules.ts`、`src/ui/m2-runtime.ts`、`src/ui/m2-commands.ts`、`src/ui/app.ts`。
- 旧行为删除：到期不再由 `tickActivitiesOnTimeAdvance()` 后台直接转成无入口的 active。
- 新行为：计划到期后标记 `due_waiting`，创建唯一 `banquet_start` 待办，并在庭院显示“开始宴会”。
- 新命令：`start_due_banquet`；复核 activityId 与到期时间后才把计划转为 active。
- 持续入口：active 宴会在开放庭园面板显示“进入当前宴会”；存在计划或活动时禁用新建宴会按钮。
- 自动兜底：到 `start_period_serial + 4` 仍未处理时，清空计划与待办，按 `assumed_completed` 写入最多 8 条宴会历史，不调用 LLM。
- 正常结束：写入 `played` 宴会历史并恢复普通来访上限。

## 5. 字段链与所有权

同步文件：

- `src/ui/types.ts`
- `src/schema/02-mvu-schema.js`
- `src/schema/initial-state.json`
- `src/ui/state-migrations.ts`
- `src/ui/event-settlement.ts`
- `src/schema/field-ledger.md`
- `src/lorebook/variable-update-rules.md`
- `project/contract.md`

字段合同：

- `pending_tasks`：代码唯一 writer；UI 只读取并发白名单命令；模型禁写；`(kind, source_id)` 唯一。
- `garden_activities.banquet_history`：最多 8 条，只记录业务摘要，不保存剧情正文。
- 本地所有权恢复已加入 `pending_tasks`，防止变量模型或旧 assistant 楼层把待办回滚。
- 旧存档迁移幂等补 `pending_tasks=[]` 和 `banquet_history=[]`，保留合法未知字段。

## 6. UI 与可访问性

- 新增庭院“待办事项”语义区域，使用真实 button、标题和文本节点，所有动态内容通过 `textContent` 写入。
- 显示距离自动处理还剩多少标准时段。
- 处理中的待办提供恢复入口；生成或写入失败不会永久卡死。
- active 宴会入口刷新后仍由 MVU 恢复，不依赖 iframe 临时变量。
- 窄屏继续沿用现有动作按钮纵向布局；待办内容使用可收缩网格和任意位置换行。

## 7. 测试与构建记录

### TypeScript

命令：

`node node_modules/typescript/bin/tsc --noEmit`

结果：通过，0 错误。

### 相关回归

命令：

`node --test tests/m2-r38-r45.test.mjs tests/ui-contract.test.mjs`

结果：69/69 通过。

### 全量自动测试

命令：

`node --test tests/*.test.mjs`（由 PowerShell 展开为全部测试文件）

结果：82/82 通过，0 失败、0 跳过。

新增/更新重点用例：

- 延迟宴会到时保持 `due_waiting` 并创建入口；
- 点击待办后才转 active；
- 异变与宴会忽略四时段均本地幂等完成；
- 普通结束聊天源码合同为零模型本地命令；
- 异变卡源码不再包含首次剧情生成分支。

### UI 构建

命令：

`node scripts/build-ui.mjs`

结果：通过，0 错误。

### 工具链备注

- 首次尝试 `pnpm test` 时，pnpm 因 esbuild 构建脚本未获全局审批而在安装阶段终止，测试尚未启动。
- 后续改用工作区已存在的 Node、TypeScript 与依赖直接执行；所有测试和构建成功。
- pnpm 本轮产生的未跟踪 `pnpm-lock.yaml` 与 `pnpm-workspace.yaml` 已删除；未修改全局审批，也未触碰用户原有未提交改动。

## 8. 尚未完成与验收边界

- 已重建 `0.2.0-r48` checkpoint：`dist/checkpoint-0.2.0-r48/幻想乡物语-测试检查点-0.2.0-r48.json`，SHA-256 为 `ad72532219c290931ca715dd4009d97a6987549d672586b7599ed31bdf61f821`。
- 原 `r48` 包已由打包器归档至同目录的 `superseded/`，归档 SHA-256 为 `04a2e920e9342104d170b50d5f4156b8575a72ce132f8830da23f8c704c95ea9`，没有静默覆盖。
- 尚未把新产物导入真实 SillyTavern；不能把离线测试和构建标记为实机验收通过。
- 实机需验证：异变卡前后原生楼层数、普通结束零楼层、设置/原生楼层往返、聊天中异变到期提醒、空闲到期单次自动收尾、宴会到期待办、刷新后 active 宴会入口、两类四时段自动兜底。
- 本轮验收步骤已写入 checkpoint 目录内的 `本轮修复验收清单.md`；真实导入结果等待用户验收回报。

## 9. 离线界面补充检查

- 使用本地预览页完成开场资料填写并进入庭院，确认庭院主视图可正常挂载。
- `gg-pending-tasks` 与 `gg-pending-task-list` 节点存在；无待办时面板正确隐藏。
- 浏览器控制台错误与警告均为 0。
- 在最后一次访客超限离场规则调整后，重新执行 TypeScript、82 项全量测试、UI 构建及 `git diff --check`；全部通过（换行符转换提示不属于补丁错误）。
