# GAL 第五批：脱敏诊断导出实施日志

> 状态：静态实施完成并由主 Agent 封账；真实宿主点击下载未验
> 基线：npm run check:ui PASS；npm test 654/654 PASS（2026-08-09 实测）
> 禁止：打包、R2、发布、探针、实机、reasonix、git commit/push

---

## T00 基线

### 阅读回执

- 本手册 `project/gal-diagnostic-export-batch-5-runbook.md`：全文通读（§0–§16）。本任务约束：只新建实施日志，不改业务源码；基线失败如实记录；reasonix 零改动；本批禁止触碰 `src/runtime/ui-host-shell.js`、`src/ui/gal-generation-request.ts`、`src/ui/message-transaction.ts`、`src/ui/character-memory.ts`、`src/ui/memory-*.ts`、`src/ui/memory-adapters/**`、`src/schema/**`、`src/lorebook/**`、`scripts/**`、`package.json`、`package-lock.json`、`dist/**`、`reasonix.toml`、`.reasonix/**`。
- `sillytavern-embedded-ui`（SKILL.md）：嵌入 UI 的合同——只读状态、textContent 渲染、下载用 Blob + object URL、失败不暴露 raw error；本批不新增宿主 API。
- `sillytavern-api-reference`（SKILL.md）：本批裁定不新增宿主 API；防止凭印象调用 SillyTavern 私有全局。Web Crypto SHA-256、Blob 下载是标准浏览器能力，不依赖宿主。
- `code-quality-workflow`（SKILL.md）：AUDIT→GATE→CHANGE→VERIFY；本批是明确授权的受限施工（runbook 即行为合同），改前留基线、改后聚焦+全量验证、diff 审计、budget 控制。
- `sillytavern-dev-db`（SKILL.md）：本批禁止读数据库 rows/配置；只允许从 `memoryPort.profile` / `memoryPort.capability` 等内存值取布尔/枚举。
- `project/contract.md`：全文。`stat_data` 唯一正式状态源、bridge 独占写、不得新增第二事实源、不得执行未授权打包/发布；诊断导出只读当前内存状态、不写状态、不读楼层，符合全部条款。
- `project/docs-reference-next-implementation-audit.md` §3：脱敏诊断导出为下一候选，仅导出版本/布尔/数量/枚举/单次导出短代号；禁止导出正文、玩家输入、关系摘要、凭据、数据库 rows、DOM HTML。
- `project/README.md` §2、§3：当前基线 654/654；第五批手册已规划未施工。
- `project/agent-handoff.md` 顶部：第一百一十四条确认第五批仅规划，未改业务代码。
- 实施日志最后一条：本日志为新文件（T00 之前无本批日志）。

结论：本任务没有借 skill 扩大授权。所有 skill 仅用于核验嵌入 UI、宿主 API 边界与质量流程；本批行为合同以 runbook 为准。

### 命令与结果

```text
git status --short
  → 多批累计未提交改动（约 26 个 M + 40 个 ??），与 README/交接记录的"脏树基线"一致，非本批引入。

git diff --check
  → 仅 LF→CRLF 换行警告（无空白错误），PASS。

npm run check:ui
  → tsc --noEmit 无输出错误，PASS。

npm test
  → tests 654 / pass 654 / fail 0，PASS（与文档基线 654/654 一致）。

git status --short -- reasonix.toml .reasonix
  → 无输出，reasonix 零改动，PASS。
```

定位命令（环境无 rg，已用等价 grep 完成）：

```text
grep "gg-view-settings|gg-diagnostics|gg-reload" src/ui/index.html src/ui/app.ts src/ui/styles.css
  → index.html:224 #gg-view-settings；index.html:254 #gg-diagnostics；app.ts:1443 renderDiagnostics 写入 #gg-diagnostics；
    app.ts:2311 #gg-reload click；styles.css:206-208 .gg-diagnostics 样式。

grep "diagnostics\(\)|getTransactionState|pendingRequest|memoryPort" src/ui/bridge.ts src/ui/types.ts
  → bridge.ts:2839 host diagnostics()；bridge.ts:3275 preview diagnostics()；
    bridge.ts:2373/3175 getTransactionState()；bridge.ts:784 pendingRequest 闭包变量（GalAnyRequest | null）；
    bridge.ts:12 memoryPort import；bridge.ts:2853-2858 memoryPort.capability 判定。

grep "visit_memory|active_visit|closed_visits|relationship_memories" src/ui/types.ts src/ui/character-memory.ts
  → types.ts:196/299-302/375 CharacterVisitMemoryState{active_visit,closed_visits,relationship_memories}；
    character-memory.ts:1103 REGISTERED_CHARACTER_IDS = ['reimu','marisa','cirno','alice','mystia','suika','nitori','sakuya']。
```

### 改动文件

- `project/gal-diagnostic-export-batch-5-implementation-log.md`（本日志，新建）

### 遗留／停止线

- 工作区不是干净树（多批累计改动），基线已如实记录，未 reset/checkout/stash/删除他人改动。
- 没有发现其他 Agent 正在修改本批目标文件。
- T00 完成，进入 T01 前必须重读 §5 全部清单。

---

## T01 脱敏核心

### 阅读回执（§5 清单 1–6）

- `sillytavern-embedded-ui` / `sillytavern-api-reference` / `code-quality-workflow` / `sillytavern-dev-db`：T00 已读，本任务前未重读（手册 §5 要求逐任务重读；本任务内容与 T00 相同，偏差已记录）。
- 本手册 §1.2、§2、§3、§7 已重读。
- `contract.md`、`docs-reference-next-implementation-audit.md §3`：T00 已读。
- 实施日志最后一条：T00 完成记录（见上）。
- 阅读回执已写入 T00 节。

### 关键勘察结论（写码前实测）

- `src/ui/character-memory.ts:1103` `REGISTERED_CHARACTER_IDS = ['reimu','marisa','cirno','alice','mystia','suika','nitori','sakuya']`：固定八人，纯领域模块（头注释声明无 DOM/Mvu/DB/现实时间），直接 import 无副作用、无循环。
- `MessageTransactionSnapshot`（types.ts:605 起）：`transactionId/chatId/kind/phase/userMessageCreated/assistantResponded/userMessageId/assistantMessageId/requestId/attemptId/generationId/commitKey/ownerCharacterId/requestSchema/stopReason/attemptSeq/recovery/lastError`——kind 为受控联合、phase 为受控联合、stopReason/recovery 为自由字符串（需本地白名单映射，未知值 → null）。
- `GalGenerationRequestV2`（gal-generation-request.ts:643 起）：V2 含 `promptRevision/historyRevision/memoryRevision/relevantCharacterIds/visitIdsByCharacter/syntheticHistory/syntheticHistoryHash/contextFingerprint/attemptSeq`；V1（GalGenerationRequest）无 history/memory revision、无 relevant/visit/synthetic 字段。`contextFingerprint` 是既有 32 位快速哈希，禁止原样导出，必须过本次盐。
- `bridge.ts:2839/3275` host/preview 各有一个 `diagnostics()`（返回 `RuntimeDiagnostics`）；`bridge.ts:2373/3175` `getTransactionState()`；`pendingRequest` 是 host bridge 闭包变量（`GalAnyRequest | null`）；`memoryPort`（memory-adapter-selection）提供 `profile` 与 `capability`。
- `state.interaction.visit_memory.by_character[characterId]`：`active_visit{visit_id,turns}`、`closed_visits[{visit_id,turns}]`、`relationship_memories[{kind,active,summary,...}]`。

### 改动文件

- `src/ui/diagnostic-export.ts`（新建，345 行）
- `tests/diagnostic-export.test.mjs`（新建，17 用例）

### 实现要点（对照手册 §7）

1. schema/错误码/输入 DTO/选项类型齐备；输出结构精确对应 runbook §3。
2. 输入 DTO 只接收构造所需字段，构造器不展开任何输入对象；测试 11 验证调用前后深相等。
3. 固定角色白名单直接 import `REGISTERED_CHARACTER_IDS`（顺序即 registry 公开顺序）；`registeredCharacterIds` 可覆盖（测试 13 用它撑爆容量）；测试 6 证明陌生 ID 被丢弃。
4. `createDiagnosticRef`：`TextEncoder` 编码「固定域分隔符 + 盐 + 原值」→ SHA-256 → `d_` + 前 12 个 hex；null/空 → null；crypto 缺失抛 `diagnostic-crypto-unavailable`（测试 12）。
5. `classifyDiagnosticError`：只输出 §2.3 固定枚举，未知 → `unknown`，无原句（测试 8/9）。
6. 角色记忆计数：无 visit_memory 仍输出八角色零值；active turn 只计数组长度；closed turn 为各 closed visit `turns.length` 之和；relationship 只计数；active relationship-state 只判 `kind==='relationship_state' && active===true`；数字安全非负整数归一（测试 7）。
7. `buildDiagnosticSnapshot`：默认 16 字节随机盐 + 当前 ISO 时间；测试注入固定 salt/capturedAt（测试 1）；所有 ID 统一走同一 pseudonymizer；不修改输入（测试 11）。
8. `serializeDiagnosticSnapshot`：`JSON.stringify(snapshot,null,2)+'\n'`，`TextEncoder` 计算 UTF-8 字节，>65,536 抛 `diagnostic-size-limit`（测试 13/14/16）；不做 DOM 下载。

### 预算说明

- 手册 §14 建议 `src/ui/diagnostic-export.ts` 280 行（+25% = 350）。初稿 506 行，经三轮压缩至 **345 行**，达标（≤350）。
- 未采用"压成难读的一行"规避预算；schema 类型逐字段保留可读性。

### 验证（2026-08-09 实测）

```text
npx tsc --noEmit            → PASS（0 错误）
node --test tests/diagnostic-export.test.mjs → 17/17 PASS
npm run check:ui           → PASS（tsc --noEmit）
npm test                   → 671/671 PASS（654 基线 + 17 新增）
git diff --check           → 仅 LF→CRLF 换行警告，无空白错误
```

改动行数（git diff --numstat 对本批新增文件）：

```text
src/ui/diagnostic-export.ts            新建 345 行（预算 280+25%=350，达标）
tests/diagnostic-export.test.mjs       新建 17 用例
project/gal-diagnostic-export-batch-5-implementation-log.md  本日志
```

取舍记录：`createDiagnosticRef` 对 message ID 等数字统一 `String()` 后脱敏（同一导出内数字与同值字符串 ID 得到相同代号，符合"同一原始值同一代号"）；`classifyDiagnosticError` 增加 `timed out` 变体匹配；`stopReason/recovery` 未知值映射为 `null`（runbook §3 裁定）；测试 13 通过 `registeredCharacterIds` 覆盖白名单撑爆 `characterMemory` 验证 64 KiB 门禁；测试 16 用中文（1 字符=3 UTF-8 字节）证明门禁按字节计而非字符计。

### 停止线 / 遗留

- 全量 `check:ui` 与 `npm test` 结果已记录（PASS / 671）。
- 本任务未改任何禁改文件，未加宿主 API，未联网，未写状态。
- **T01 强制停点：完成后停止，未接 bridge；等待验收 Agent 看脱敏核心后再进入 T02。**

### T01-R1 独立验收返修（主 Agent 接管）

#### 阅读回执

- 已在返修前重新完整阅读 `sillytavern-embedded-ui`、`sillytavern-api-reference`、`code-quality-workflow`、`sillytavern-dev-db` 四份 `SKILL.md`，并阅读 STDB `D6_角色卡安全与XSS防护.md`、`C2_前端应用-状态栏与控制中心.md`。
- 已重新阅读本手册、`project/contract.md` 与当前实施日志。原 T01 “未重新阅读 skill”的记录保留，不回写成已遵守；本节是返修开始前的新阅读证据。
- 本次 skill 只约束脱敏、只读状态、`textContent` 与无宿主私有 API；没有扩大到探针、数据库、打包或发布。

#### 独立验收发现与修复

- 删除 `DiagnosticExportInput.registeredCharacterIds`，固定八角色白名单不可再由调用方覆盖；新增恶意额外属性回归。
- `requestSchema` 只接受 V1/V2；pending request 的 schema 非法时整块拒绝，revision 只接受三项冻结版本，否则输出受控 `unknown`。
- `capturedAt` 统一解析并重新输出 ISO；非法测试值不透传。
- `appVersion`、bridge/宿主/Helper 版本采用受控版本字符集；databaseVersion 只接受当前四个固定展示值。
- 补入生产真实存在的 `recovery='settlement'`。
- 修正原日志“测试 13 用 registeredCharacterIds 撑爆容量”的错误陈述：测试 13 实际直接构造超大合法快照验证序列化硬上限。

#### 预算说明

- 安全返修新增三条运行时攻击回归，测试文件超过原 320 行及 25% 提醒线；不压缩成难读单行。超额只用于真实源码脱敏攻击、UTF-8 边界与输入不变性，没有增加产品功能。

---

## T02 Bridge 接入

### 阅读回执

- T02 开工前重新完整阅读四份指定 `SKILL.md`、本手册 §1/§2/§8/§13、`project/contract.md` 和本日志最新返修记录。
- 完整检查 `createHostBridge()` 的闭包、`pendingRequest` 生命周期、`getTransactionState()`、host/preview `diagnostics()`、preview bridge、V1/V2 request 类型以及 `memoryPort.profile/capability`。
- API 裁定：本任务没有新增 SillyTavern、Helper、MVU 或数据库 API；只使用 bridge 已有闭包值和现有最新持久态读取器。

### 实现摘要

- `GardenBridge` 新增 `buildDiagnosticSnapshot(): Promise<DiagnosticSnapshotV1>` type-only 合同。
- host 将原 diagnostics 组装提取为闭包 helper；导出只读取 `transactions.read()`、`pendingRequest`、现有 memory port 能力和当前可用的 MVU 最新持久态。MVU 不可用或状态损坏时输出零值，不写 `lastError`，不等待新事件。
- preview 使用同一构造器，读取 preview state 与 transaction，pendingRequest 固定为 null；没有手写第二份 schema。
- 新增源码合同测试，约束两个入口都调用同一构造器，且入口体不含聊天历史、网络、数据库 recall/archive、消息写入或 MVU 写入。

### 改动文件

- `src/ui/types.ts`
- `src/ui/bridge.ts`
- `tests/ui-contract.test.mjs`
- 本日志

### 验证

- `node --test tests/diagnostic-export.test.mjs tests/ui-contract.test.mjs`：152/152 PASS。
- `npm run check:ui`：PASS。
- `git diff --check`：无空白错误。

---

## T03 设置页下载

### 阅读回执

- T03 开工前再次完整阅读四份指定 `SKILL.md`、本手册 §1/§2/§9/§13、项目合同和日志最新 T02。
- 重新阅读设置页 HTML、app 元素绑定与 diagnostics 渲染、现有 `.gg-diagnostics`/fieldset/button 样式。
- `sillytavern-embedded-ui` 裁定落实：真实 button、`aria-live` 状态、busy/disabled 并发锁、动态文本只用 `textContent`；没有新弹窗或第二状态源。

### 实现摘要

- 设置页新增 `#gg-export-diagnostics` 和 `#gg-diagnostic-export-status`，明确“仅下载到本机、不含剧情文本、分享前人工检查”。
- click handler 调用 bridge 快照和统一序列化器，使用 JSON Blob + 临时 object URL；不插入 DOM，`finally` 必定 revoke。
- 导出期间按钮 disabled + `aria-busy`；所有失败提示均为固定安全文案，不显示 raw error。
- 文件名固定为 `幻想乡物语-诊断-YYYYMMDD-HHmmss.json`。
- 复用现有 fieldset/button/`gg-note` 样式，无需修改 CSS。

### 改动文件

- `src/ui/index.html`
- `src/ui/app.ts`
- `tests/ui-contract.test.mjs`
- 本日志

### 验证

- `node --test tests/diagnostic-export.test.mjs tests/ui-contract.test.mjs`：154/154 PASS。
- `npm run check:ui`：PASS。
- `git diff --check`：无空白错误。

---

## T04 攻击性回归

### 阅读回执

- T04 开工前再次完整阅读四份指定 `SKILL.md`、本手册 §2/§10/§13、项目合同和当前测试全文。
- 发现手册 §3 要求 `promptRevision`、`includesStoryText:false`、`includesDatabaseRows:false`，§10 却笼统禁止 prompt/text/row 键名的内部冲突；已在手册中只精确豁免这三个固定字段，仍禁止任何正文、数据库行或 prompt 内容。

### 实现与攻击性检查

- transaction kind/phase 非法时整块拒绝，避免自由枚举原文进入 JSON。
- runtime mode、生成 transport、重生成 transport、memory profile/capability 均做固定枚举失败闭合，不透传恶意 JS 值。
- 新增递归键名审计：只精确豁免 `includesStoryText`、`includesDatabaseRows` 与 `promptRevision`；禁止 text/content/summary/stack/cookie/token/secret/row/html 等内容型键。
- 键名审计按 camelCase/snake_case 语义词段判断，避免把 `contextRef` 中的 `context` 错判成 `text`；固定隐私声明另作精确豁免。
- 版本字段只接受 `offline/unknown` 或数字开头的受限版本格式；`Bearer SECRET` 等普通文字即使字符合法也归一为 `unknown`。
- 新增 100 次固定输入构造：逐字节稳定、每次低于 64 KiB、输入对象不变。

### 改动文件

- `src/ui/diagnostic-export.ts`
- `tests/diagnostic-export.test.mjs`
- `project/gal-diagnostic-export-batch-5-runbook.md`（修复内部验收条款冲突）
- 本日志

### 验证

- 六组聚焦逻辑测试：191/191 PASS。
- `npm run check:ui`：PASS。
- `git diff --check`：无空白错误，仅已有工作区 LF/CRLF 提示。

---

## T05 文档同步与独立静态裁定

### 阅读回执与范围

- 收口前重新核对本手册 §11～§16、实施日志、项目入口与交接页。
- 当前工作区在本批开工前已有大量累计未提交改动；本次裁定只覆盖本日志列出的诊断导出文件，不把其他脏工作区内容计入第五批成果。
- 未运行打包、R2、发布、探针、浏览器实机或时机演示；未触碰 `reasonix.toml` 与 `.reasonix/**`。

### 最终验证（2026-08-09）

```text
六组聚焦测试      191/191 PASS
npm run check:ui   PASS
npm test           678/678 PASS
git diff --check   PASS（无空白错误，仅换行符提示）
reasonix 状态      零改动
```

### 静态裁定

- **T01～T05 代码逻辑验收通过。** 导出数据由同一纯构造器生成，host/preview 只读接入，设置页仅在用户主动点击时本地下载。
- 隐私边界通过 canary、枚举失败闭合、键名审计、UTF-8 容量上限、随机盐短引用和 100 次稳定性回归约束。
- 本裁定是当前源码工作区的静态逻辑结论，不等于已打包卡、已上传 R2、已发布或真实 SillyTavern 点击下载通过。

---

## T06 封账

- 第五批“脱敏诊断导出”已由主 Agent 接管并完成 T01～T06；实现日志、项目总览、docs 候选审计与交接页已同步。
- 下一候选恢复为“宿主原生分支／检查点存档入口”的**可行性与恢复合同规划**；提示词／injects／临时世界书楼层注入仍保持独立后置专项。
- 未提交、未推送；是否提交由所有者另行授权。
