# GAL 角色记忆第四批实施日志（batch-4）

> 文档性质：第四批实施日志；执行 agent 按 runbook 逐任务记录阅读回执、diff、测试与遗留
> 对应 runbook：`project/gal-character-memory-batch-4-dual-build-and-database-runbook.md`
> 批次状态：实施中（B4-T01/T02/T02-R1 与主验收方返修后的 T03～T06 已通过静态小验收；下一步 B4-O03 裁定，T07 仍禁止）
> 本批标签规则：`[苦力-机械]` / `[苦力-测试]` 由执行 agent 完成；`[主人-裁定]` / `[主人-高风险]` 只收集证据，到停止线停

---

## 固定阅读回执

每个任务开始前重新完整阅读（runbook §3.1）：

```text
[B4-T00][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B4-T00][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B4-T00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B4-T00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/card-types-and-runtime-dependencies.md
[B4-T00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B4-T00][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B4-T00][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B4-T00][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B4-T00][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B4-T00][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B4-T00][read] project/gal-character-memory-batch-4-dual-build-and-database-runbook.md（全文）
[B4-T00][read] project/gal-character-visit-memory-and-synthetic-history-plan.md（§4.6～§4.9、Phase 7、§12.7、§14）
```

---

## B4-T00：基线盘点与 scope lock

```text
任务标签：[苦力-机械]
开始前基线：见下方“基线证据”小节；全部原始输出均来自本次会话执行的命令
允许改动文件：仅允许新建 project/gal-character-memory-batch-4-implementation-log.md（本文件）；未修改任何源码
禁止改动文件：src/、scripts/、tests/、docs/、schema/、package.json 等一切既有文件
输入合同：runbook §10 B4-T00 九项必须做
输出合同：基线证据完整、引用点/构建点清单完整、本日志创建、scope lock 写入
失败合同：任何基线失败如实记录，不掩盖
新增测试：无（本任务不新增测试）
实际 diff：无源码 diff；仅新增本日志文件
执行命令：
  git status --short && git branch --show-current && git log --oneline -5
  grep（数据库符号 / buildGalGenerationRequestV2 / syncOpeningDatabase 引用）
  npm test（全量）
  npm run check:ui（tsc --noEmit）
  node esbuild 直建 src/ui/app.ts -> tmp/b4-baseline/app-current.js（隔离输出，未改脚本、未覆盖产物）
  grep（bundle 禁词扫描，旧 dist 与隔离重建产物分别扫）
原始结果：见下方各小节
未证明事项：当前宿主数据库脚本 disabled 状态未实机复核；旧 dist 仅作现状参考，不作为新基线（隔离重建产物为准）
```

### 1. git 状态与既有改动归属

- 分支：`main`；HEAD：`de1b568 merge: character visit memory foundation`（前三批及此前批次已合入）
- `git status --short` 显示大量未提交改动，**全部属于用户/此前批次既有工作**，本批不得覆盖：
  - 修改（M）：package.json、project/README.md、project/api-provenance.md、project/gal-character-memory-batch-1-*.md、project/gal-character-visit-memory-and-synthetic-history-plan.md、scripts/build-ui.mjs、scripts/package-checkpoint.mjs、scripts/publish-ui.mjs、src/lorebook/variable-output-format.md、src/runtime/ui-host-shell.js、src/runtime/ui-loader.js、src/schema/field-ledger.md、src/ui/{app,bridge,character-memory,index.html,message-transaction,prompt-context,target-actions,types,async-coordination}.ts、tests/ui-contract.test.mjs
  - 未跟踪（??）：第二批/第三批 runbook 与日志、phase-2-design.md、r2-ui-test-channel-*.md、gal-generate-transaction-*.md、src/ui/gal-*.ts、visit-turn-commit.ts、synthetic-history.ts、tests/gal-*.test.mjs、tests/{character-visit-freeze,finalize-accepted-assistant,message-transaction-v2,phase2-contract,phase4-restore,runtime-js-syntax,scene-item-preview,synthetic-history,transaction-boundaries,ui-channel,visit-turn-by-visit-id,visit-turn-commit,visit-turn-settlement}.test.mjs、scripts/upload-live-asset.mjs、verify*.log、.playwright-mcp/
- **scope lock**：本批不改 reasonix、不提交、不发布、不探针、不打包、不上传 R2、不覆盖正式 UI 名称、不修改 `.reasonix/` 与 `reasonix.toml`；第四批所有构建只进隔离/临时路径。

### 2. 基线测试结果

- 全量：`npm test` → **583 pass / 0 fail / 0 skipped**（39 个 `*.test.mjs`，duration 7778ms）
- 类型检查：`npm run check:ui`（`tsc --noEmit`）→ **通过，无错误输出**
- 基线均为当前工作区状态（含用户既有改动），如实记录，无掩盖。

### 3. 数据库符号生产/测试引用点清单

| 位置 | 符号 | 性质 |
|---|---|---|
| `src/runtime/ui-host-shell.js:231-233` | `AutoCardUpdaterAPI` | 宿主 shell 向子 iframe 注入 host 全局（装配侧） |
| `src/ui/app.ts:21` | `import { syncOpeningDatabase, type DatabaseSyncResult }` | **无条件生产导入**（独立版无法证明零路径） |
| `src/ui/app.ts:694, 1820` | `databaseSync` / `await syncOpeningDatabase(state)` | render 刷新中无条件调用（B4-T00 关注点） |
| `src/ui/bridge.ts:152, 520` | `AutoCardUpdaterAPI?` / `databaseApi()` | 直接诊断探测（需拆除或改端口状态） |
| `src/ui/bridge.ts:2856` | `databaseVersion: databaseApi() ? ...` | 诊断输出 |
| `src/ui/database-adapter.ts:5-7, 18-22, 32-68` | `queryTableRows/insertRow/updateRow`、`resolveApi()`、`syncOpeningDatabase()` | 旧适配器本体（开局主角/物品同步） |
| `tests/ui-contract.test.mjs:1279` | `assert.match(adapter, /AutoCardUpdaterAPI/)` | 测试引用（只读源码断言，不执行 API） |

`registerTableUpdateCallback` / `unregisterTableUpdateCallback` 在 src 与 tests 中**零引用**（runbook 禁词表其余项）。

### 4. build/package/publish 参数与输出目录

- `scripts/build-ui.mjs`：
  - 参数：`--ui-delivery=embedded|remote`（默认 embedded）、`--ui-channel=production|test`（默认 production）、`--asset-mode=embedded|remote-r2-live`、`--asset-base-url=<纯 HTTPS origin>`、`--ui-version=<rN|test-rN>`
  - 固定通道表 `UI_CHANNELS`：production → `dist/runtime`（`ui-mount-<version>.js` + `ui-loader.js`），test → `dist/runtime/test`
  - UI 预览构建：`dist/ui/app.js`（entryPoints `src/ui/app.ts`）
  - **当前无 memory profile 概念**；本批需新增 `--memory-profile` 维度（B4-O01 裁定）
- `scripts/package-checkpoint.mjs`：`--checkpoint=0.2.0-rN`、`--dry-run`、`--replace`、`--expect-remote-r2`、`--ui-delivery=embedded|remote`、`--release-kind=`、`--runtime-root=`
- `scripts/publish-ui.mjs`：`--channel=production|test`、`--dry-run`、`--version=r<N>`、`--file=...`；**前缀固定由 channel 表决定，不支持任意前缀**
- 输出目录现状：`dist/ui/`、`dist/runtime/`、`dist/runtime/test/`、`dist/assets/`、`dist/checkpoint-*`、`dist/asset-*`

### 5. `buildGalGenerationRequestV2` 生产调用点

定义：`src/ui/gal-generation-request.ts:975`（纯函数 builder，同步）。

| 调用点 | 入口 | 备注 |
|---|---|---|
| `src/ui/bridge.ts:2177` | `sendUserMessage`（普通 GAL 发送） | 构造后立即 `transactions.submit` 冻结 metadata |
| `src/ui/bridge.ts:2244` | `sendAnomalyResolution`（异变收束） | `pendingSystemOperation` 合并 |
| `src/ui/bridge.ts:2325` | `sendDuelVictoryRequest`（决斗胜利后生成） | 先锁定 `pending_victory_dialogue` 再构造 |

三个入口全部在 `bridge.ts` 内、`transactions.submit` 之前同步调用 builder；当前 builder 自身不触数据库（纯函数）。

### 6. settlement 成功后的唯一接线候选点

- `src/ui/bridge.ts:370` `finalizeAcceptedAssistant(...)` → `settleByWriting(...)`（`:452` 起）：MVU 写盘 `mvu.replaceMvuData(data, options)` → 精确复读 `verifyFinalizedAssistantData` → 身份复核 → 返回 `{ phase: 'settled' }`
- `finalizeAcceptedAssistant` 调用点：bridge.ts 1280 / 1372 / 1407 / 1498 / 1580（send、事务 regenerate、恢复等路径共用同一 finalizer）
- **候选唯一 hook**：`settleByWriting` 返回 `{ phase: 'settled' }` 处 = “MVU 成功写入 + 精确复读通过 + lifecycle settled”的唯一点；V2 专用 `applyVisitTurnsToFinalState` 与 regeneration receipt 已在此链路上
- B4-O03 将据此裁定归档钩子（本批不自行接线）。

### 7. 当前 bundle 禁词命中位置

旧 dist（仅作现状参考，**不作为新基线**）：

```text
dist/runtime/ui-mount-r95.js (1.8M)   AutoCardUpdaterAPI:3  queryTableRows:1  insertRow:1  updateRow:1
dist/runtime/ui-mount.js   (1.9M)     AutoCardUpdaterAPI:3  queryTableRows:1  insertRow:1  updateRow:1
dist/runtime/test/ui-mount-test-r1.js AutoCardUpdaterAPI:3  queryTableRows:1  insertRow:1  updateRow:1
dist/ui/app.js             (976K)     AutoCardUpdaterAPI:4  queryTableRows:3  insertRow:3  updateRow:2
dist/ui/app.js.map                    AutoCardUpdaterAPI:9  queryTableRows:4  insertRow:4  updateRow:3
```

隔离重建基线（esbuild 直建 `src/ui/app.ts` → `tmp/b4-baseline/app-current.js`，1.1M，当前源码真实产物）：

```text
AutoCardUpdaterAPI:4  queryTableRows:3  insertRow:3  updateRow:2  registerTableUpdateCallback:0  unregisterTableUpdateCallback:0
```

结论：当前源码 bundle 含数据库路径（app.ts 无条件导入 + bridge 直接探测），独立版零路径门目前不成立，符合本批要解决的目标。

### 8. 遗留与下一步

- 未执行：B4-O01（主人裁定）前不写任何 profile/port 代码；
- 未执行：O02 前不碰数据库 CRUD；
- 未执行：O03/O04 前不接生产归档/召回；
- 基线已记录，等待主人对 B4-O01 裁定。

---

## B4-O01：双构建配置与产物隔离裁定（证据收集，等待主人 APPROVED）

```text
任务标签：[主人-裁定]（执行 agent 只收集证据并提交构建图提案，不自行拍板）
开始前基线：B4-T00 已记录（583 pass / tsc 通过 / 禁词命中现状）
允许改动文件：project/gal-character-memory-batch-4-implementation-log.md（记录证据）；不写任何源码
禁止改动文件：src/、scripts/、tests/、package.json
输入合同：runbook §10 B4-O01 八项待裁定 + §5 推荐裁定
输出合同：构建图提案 + 文件列表 + 证据；等待主人写 APPROVED 后才可进入 B4-T01
失败合同：O01 未 APPROVED 绝不开始 B4-T01
新增测试：无
实际 diff：无源码 diff
执行命令：grep/sed 读取 build-ui.mjs、app.ts、bridge.ts、ui-host-shell.js 装配链
原始结果：见下方证据
未证明事项：esbuild alias 是否影响 sourcemap 尚未验证；本批不发布，R2 manifest 仅预案
```

### O01 证据（装配链实况）

1. `scripts/build-ui.mjs`：
   - app bundle：`esbuild build({ entryPoints: ['src/ui/app.ts'], bundle, iife, outfile: 'dist/ui/app.js', sourcemap })`（行 362-370）；
   - runtime mount：`buildMountBundle(versionToken)` 把 `embedded`（含 `appJs` 全文）+ hostShellSource（`src/runtime/ui-host-shell.js`）拼成 `ui-mount.js`，写入 `runtimeOutputDir`（production=`dist/runtime/`，test=`dist/runtime/test/`，行 835-851）；
   - 通道固定表 `UI_CHANNELS`（行 21-33）：production/test 各有固定 `uiPrefix`、`versionPattern`、`outputDir`；
   - 当前**没有** `memory profile` 维度；profile 只能加在 esbuild entry（薄 entrypoint）或 esbuild alias（编译期 adapter 注入）层，两者都不会复制业务源码。
2. `src/ui/app.ts`：
   - 行 21 无条件 `import { syncOpeningDatabase } from './database-adapter'`；
   - 行 694 模块级 `databaseSync` 状态；
   - 行 1427-1428 诊断渲染使用 `diagnostic.databaseAvailable/databaseVersion` 与 `databaseSync.detail`；
   - 行 1820 `performRefresh()` 内每次刷新 `await syncOpeningDatabase(state)`。
3. `src/ui/bridge.ts`：
   - 行 152 `HostGlobals.AutoCardUpdaterAPI?`；
   - 行 520 `databaseApi()` 直接 `g.AutoCardUpdaterAPI ?? hostWindow().AutoCardUpdaterAPI`；
   - 行 2856-2857 `getDiagnostics()` 用 `Boolean(databaseApi())` 输出 `databaseAvailable/databaseVersion`。
4. `src/runtime/ui-host-shell.js` 行 231-233：宿主 shell 把 `host.AutoCardUpdaterAPI` 暴露给子 iframe（这是宿主装配，不是 UI 业务代码；独立版 mount 是否包含它取决于 ui-host-shell 是否进 bundle —— 目前是全部进 mount）。

### O01 构建图提案（待主人裁定）

```text
memory profile 维度（新增，独立于 ui-channel）：
  --memory-profile=standalone-mvu | database-assisted

装配方式（三选一，推荐 A）：
  A. 编译期 esbuild alias：公共端口模块（memory-port.ts）在 build 时 alias 到
     standalone-adapter 或 database-adapter；业务代码零改动、零运行时分支。 [推荐]
  B. 两个薄 entrypoint（app-standalone.ts / app-database.ts）分别 import 同一
     bootstrap + 不同 adapter，esbuild 各构建一次。
  C. 受控生成文件（build 时按 profile 生成 entry/alias 清单，不提交为业务源码）。

输出目录（runbook §5.4 建议形态，待裁定）：
  dist/runtime/profiles/standalone-mvu/
  dist/runtime/profiles/database-assisted/
  dist/runtime/test/profiles/standalone-mvu/
  dist/runtime/test/profiles/database-assisted/
  （ui-channel 仍决定 production/test 前缀；本批只构建到本地 dist，不上传）

开局数据库同步（syncOpeningDatabase）：
  仅允许装配进 database-assisted profile；standalone 通过 alias 摘除。

build report / loader：
  ui-mount 头部注入 build 元数据：memory_profile + memory_adapter；
  构建报告 JSON 增加 memory_profile、memory_adapter、bundle sha256/bytes。

package scripts（显式传值，不依赖默认）：
  build:ui:standalone   --memory-profile=standalone-mvu
  build:ui:database     --memory-profile=database-assisted
  （保持 build:ui 原样或改为必须显式传 profile，待主人裁定）

R2 manifest（本批不发布，仅预案）：
  production/test × 两个 profile 的 ui-mount/loader 路径分目录互不覆盖；
  资源 asset manifest 共用（不复制图片/音频）。

禁词门：
  standalone executable bundle 中 AutoCardUpdaterAPI/queryTableRows/insertRow/
  updateRow/registerTableUpdateCallback/unregisterTableUpdateCallback 全为零。
```

### O01 待主人裁定清单

1. CLI 参数名与合法值：`--memory-profile=standalone-mvu|database-assisted` 是否通过？
2. 未指定/非法 profile：报错（推荐，防误装配）还是默认 standalone？
3. 装配方式 A/B/C 选哪个？（推荐 A：esbuild alias）
4. 输出目录按 §5.4 建议形态是否通过？
5. 开局数据库同步是否只装配 database-assisted？（推荐是）
6. package scripts 是否显式加两个 profile 构建脚本？
7. 其他补充裁定。

**执行 agent 已在此停止，等待主人对 B4-O01 写出 APPROVED 后再开始 B4-T01。**

---

## B4-T01：profile 类型、参数解析与公共端口（已完成）

```text
任务标签：[苦力-机械]
前置条件：B4-O01 已 APPROVED WITH FIXED CONTRACT（2026-08-09）
开始前基线：B4-T00 记录（583 pass / tsc 通过）
允许改动文件：src/ui/memory-port.ts、src/ui/memory-adapter-selection.ts、src/ui/memory-adapters/*、scripts/build-ui.mjs、tsconfig.json、package.json、tests/memory-profile-build.test.mjs
禁止改动文件：不改 reasonix、不发布、不打包、不覆盖正式 UI 名称
输入合同：runbook §10 B4-T01 + O01 §5.3.1/§5.3.2/§5.4/§5.4.1 固定合同
输出合同：MemoryProfile、严格 CLI parser、公共端口、装配根、build report 带 profile、package scripts 显式 profile、不复制业务代码
失败合同：resolve plugin 无法精确命中 / host-shell guard 非恰好一次 / 任一 profile 写公共 app.js / standalone mount 命中禁词 → 立即停止回报，不得换运行时分支
新增测试：tests/memory-profile-build.test.mjs（7 条，全过）
实际 diff：见下方
执行命令：
  node scripts/build-ui.mjs --memory-profile=standalone-mvu|database-assisted（多次，embedded 与 remote-r2-live、production 与 test）
  npm run check:ui；npm test（590 pass）
原始结果：全部通过；见各小节
未证明事项：真实宿主行为未验（本批只封代码逻辑）
```

### B4-T01 交付

1. `src/ui/memory-port.ts`（新）：`MemoryProfile`、`MemoryArchiveRecallPort`、`RecallInput/RecallResult/ArchiveInput/ArchiveResult`、`DatabaseSyncResult`；显式 profile、显式结果、无 throw 穿透、无 MVU 写入。
2. `src/ui/memory-adapter-selection.ts`（新）：唯一 selection import——`import { createMemoryAdapter } from '@card/memory-adapter'`，业务代码只 import 本模块与 memory-port，不直接碰数据库全局。
3. `src/ui/memory-adapters/standalone-mvu.ts`（新）：no-op adapter；recall=disabled-by-build 空候选；archive=skipped；syncOpening=skipped；不触碰宿主全局。
4. `src/ui/memory-adapters/database-assisted.ts`（新）：接口壳；O02 未裁定前 recall/archive 返回结构化“未接线”，仅接入既有开局数据库同步。
5. `scripts/build-ui.mjs`：
   - 强制 `--memory-profile=standalone-mvu|database-assisted`，缺失/空值/错拼/第三值一律失败；
   - 受控 esbuild resolve plugin：只命中 `@card/memory-adapter` 唯一 specifier；未命中/重复命中/越界（`rel.startsWith('..') || isAbsolute`）构建失败；onEnd 检查 `resolveHits !== 1` 抛错；
   - app 输出 `dist/ui/profiles/<profile>/app.js` + map + index.html + styles.css；
   - runtime 输出 `dist/runtime[/test]/profiles/<profile>/`（ui-mount.js、versioned mount、loader、report）；
   - host shell 哨兵 guarded transform（见 B4-T02）；
   - remote manifest 坐标升级为 `channel × profile` 二维：`<uiPrefix>/profiles/<profile>/ui-manifest.json`（不覆盖现有 live/test manifest）；
   - build report 增加 `memory_profile` 与 `memory_adapter`。
6. `tsconfig.json`：`paths: { "@card/memory-adapter": ["src/ui/memory-adapters/standalone-mvu.ts"] }`，两个 adapter 都在 include 范围内被 tsc 检查。
7. `package.json`：所有 build-ui 脚本显式传 `--memory-profile`；新增 standalone/database 两套脚本。

### B4-T01 必测结果

- 两个合法值：standalone-mvu、database-assisted 均构建成功；
- 缺值/空值/错拼/第三值：全部拒绝（错误消息含 `--memory-profile=standalone-mvu|database-assisted 只允许这两个合法值`）；
- profile × channel 独立组合：`dist/runtime/profiles/standalone-mvu/`、`dist/runtime/profiles/database-assisted/`、`dist/runtime/test/profiles/...` 四象限全部验证；
- 输出目录不重叠、同次构建不覆盖另一 profile 文件：目录按 profile 隔离，versioned mount 不可变校验保留；
- 测试：`tests/memory-profile-build.test.mjs` 7/7 通过。

---

## B4-T02：独立版 no-op adapter 与 bundle 禁词门（已完成）

```text
任务标签：[苦力-机械]
开始前基线：B4-T01 完成后（tsc 通过、590 pass）
允许改动文件：src/ui/memory-adapters/standalone-mvu.ts、src/ui/app.ts、src/ui/bridge.ts、src/runtime/ui-host-shell.js、scripts/build-ui.mjs、tests/memory-profile-build.test.mjs、tests/ui-channel.test.mjs
禁止改动文件：同 B4-T01
输入合同：runbook §10 B4-T02 六项必测
输出合同：standalone app.js 与 ui-mount.js 禁词全零；fake 抛错 getter 零访问；send 基础历史与改动前一致；profile 诊断不进入 MVU/prompt
失败合同：若必须把 database adapter 一起打包才能启动 → O01 架构错误，不得放宽禁词门
新增测试：tests/memory-profile-build.test.mjs（B4-T02 部分 4 条）、tests/ui-channel.test.mjs（manifest 坐标断言更新 1 条）
实际 diff：见下方
执行命令：node scripts/build-ui.mjs（两 profile 多通道）、node --test tests/memory-profile-build.test.mjs（7/7）、npm test（590/590）
原始结果：全部通过
未证明事项：真实宿主 send/regenerate 行为未验（本批不探针）
```

### B4-T02 交付与证据

1. **standalone no-op adapter**：`createMemoryAdapter()` 返回 `profile:'standalone-mvu'`、`capability:'disabled-by-build'`；`recall()` → `{ status:'disabled-by-build', candidates:[] }`；`archive()` → `{ status:'skipped' }`；`syncOpening()` → `{ status:'skipped', detail:'独立 MVU 版：数据库能力未装配' }`。
2. **app.ts/bridge.ts 拆除数据库全局**：
   - `app.ts`：删除 `import ... from './database-adapter'`，改 `import { memoryPort } from './memory-adapter-selection'` + `import type { DatabaseSyncResult } from './memory-port'`；`syncOpeningDatabase(state)` → `memoryPort.syncOpening(state)`；
   - `bridge.ts`：删除 `HostGlobals.AutoCardUpdaterAPI` 字段与 `databaseApi()`；诊断改用 `memoryPort.capability` 输出「独立 MVU 版：数据库能力未装配 / 数据库增强版（能力未就绪）/ SP·数据库 VII（database-assisted）」。
3. **host shell 哨兵**：`src/runtime/ui-host-shell.js` 数据库桥接块加 `// [B4-DATABASE-BRIDGE-START]` / `// [B4-DATABASE-BRIDGE-END]`；`build-ui.mjs` 的 `applyMemoryProfileToHostShell` 校验 start/end 各恰好一次、嵌套异常失败；standalone 移除整个块（非置 undefined），database-assisted 保留。
4. **bundle 禁词门**（扫描最终 `app.js` 与 `ui-mount.js`）：
   - standalone app.js：`AutoCardUpdaterAPI/queryTableRows/insertRow/updateRow/registerTableUpdateCallback/unregisterTableUpdateCallback` 全为 0；不包含「主角信息表」「背包物品表」；
   - standalone ui-mount.js：同禁词全 0；`B4-DATABASE-BRIDGE` 残留 0；`gensokyo-game-shell/show-native-chat/__GENSOKYO_GARDEN_UI_024__` 保留；
   - database-assisted ui-mount.js：`AutoCardUpdaterAPI:4`、`queryTableRows:1`、`insertRow:1`、`updateRow:1`（数据库桥保留，符合合同）；哨兵保留。
5. **fake 抛错 getter 零访问**：子进程注入抛错 getter 后 bundle standalone adapter，`recall/archive/syncOpening` 全部按合同返回且未触碰 getter（`FAKE_GLOBAL_OK`）。
6. **测试更新**：`tests/ui-channel.test.mjs` 的 UI manifest 断言升级为 profile-specific 坐标（O01 §5.4.1 预期变更）。

### B4-T02 停止线

- 未出现“必须打包 database adapter 才能启动”的情况；
- 未放宽禁词门；
- 两个 profile 各自独立构建成功，互不覆盖。

### 第一次小验收（双构建与独立版）证据摘要

```text
standalone-mvu:
  dist/ui/profiles/standalone-mvu/app.js（1.1 MB，禁词全 0）
  dist/runtime/profiles/standalone-mvu/ui-mount.js（2.0 MB，禁词全 0）
  dist/runtime/test/profiles/standalone-mvu/{ui-mount-test-r9.js,ui-loader.js,ui-build-report.json}
database-assisted:
  dist/ui/profiles/database-assisted/app.js
  dist/runtime/profiles/database-assisted/ui-mount.js（2.0 MB，含数据库桥 4 处）
  dist/runtime/test/profiles/database-assisted/{ui-mount-test-r9.js,ui-loader.js,ui-build-report.json}
build report：ui_channel / ui_version / memory_profile / memory_adapter / ui_manifest_url / asset_manifest_url / output / versioned_output / loader_output / bytes / sha256
```

**下一步：等待主人对 B4-O02（数据库 API、物理表与行定位）裁定；执行 agent 将先做源码摘录并写入 api-provenance.md 草稿。**

---

## B4-O02：数据库 API、物理表与行定位裁定（证据收集完成，等待主人 APPROVED）

```text
任务标签：[主人-高风险]（执行 agent 只做源码摘录与接口壳）
开始前基线：B4-T02 完成后
允许改动文件：project/api-provenance.md（追加摘录）、tmp/b4-o02-evidence/（只读缓存，非提交物）
禁止改动文件：src/ 中任何生产 CRUD；database-assisted adapter 保持接口壳
输入合同：runbook §10 B4-O02 执行 agent 可做的苦力五条
输出合同：精确映射表 + 逻辑字段→物理列映射表 + 全局装配 realm；写入 api-provenance.md
失败合同：物理表/stable key 列/精确过滤/row identity/update 参数/作用域隔离任一项不明 → 禁止写生产 upsert
新增测试：无（不写生产代码）
实际 diff：project/api-provenance.md 追加 B4-O02 摘录节；tmp/b4-o02-evidence/sp-db-vii-index.js（只读缓存）
执行命令：curl 获取 v2.0.0 脚本；grep/sed 逐行摘录 queryTableRows/insertRow/updateRow/registerTableUpdateCallback/unregisterTableUpdateCallback
原始结果：见 api-provenance.md B4-O02 节
未证明事项：物理表名、archive_scope_id 来源、过滤列设计、row identity 算法均为主人裁定项
```

### 已完成的苦力部分

1. 从用户指定 `https://gcore.jsdelivr.net/gh/AlbusKen/shujuku@spv8.0/index.js`（`@version 2.0.0`，115581 行）摘录五个符号的精确签名、参数、返回、同步/异步、失败形态与行号证据；
2. 表格模型：`sheet_<key> → { name, content: string[][], sourceData?.ddl }`；`content[0]` 表头，`content[row][0]` 为 `row_id` 自增主键；中文/英文表名与列名双向映射；
3. 全局装配：`topLevelWindow_ACU.AutoCardUpdaterAPI = api`（最顶层 window realm），由 11 个领域 API 分组合并；
4. 已写入 `project/api-provenance.md`（含 sha256 缓存指纹）；
5. 未在生产代码接任何 CRUD：`src/ui/memory-adapters/database-assisted.ts` 保持接口壳（recall/archive 返回结构化“未接线”）。

### 待主人裁定清单（B4-O02 主验收方必须裁定）

1. 故事归档/关系归档的物理表名与建表约定（是否存在？由谁预建？缺表时 unavailable 还是提示用户建表？）；
2. 每个逻辑字段 → 物理列的映射（两张映射表）；
3. `archive_scope_id` 的稳定来源与格式（禁止自然语言昵称/正文/Date.now/随机 UUID/当前 message ID）；
4. 查询是否能在数据库侧按 scope + character + key 过滤（`queryTableRows` 的 `where` 对象能力）还是必须召回后本地过滤；
5. 安全 row identity 如何取得（`updateRow` 依赖 `content[row][0]` 的 row_id；稳定键列是哪个）；
6. query 上限（默认 100、上限 1000）与 recall timeout 能否真实成立；
7. 现有开局主角/物品同步是否继续保留（O01 已裁定只装配 database-assisted，这里确认是否延用表名）；
8. 数据库全局当前 `enabled: false`，本批只做静态合同，不做真实宿主探针——确认。

**执行 agent 已在此停止，等待主人对 B4-O02 写出 APPROVED/裁定后再开始 B4-T03。**

---

## B4-T03：归档 schema、normalizer 与纯记录转换（已完成）

```text
任务标签：[苦力-测试]
前置条件：B4-O02 已 APPROVED WITH PRE-T03 REPAIR（2026-08-09）
开始前基线：B4-T02 完成后（590 pass / tsc 通过）
允许改动文件：src/ui/memory-archive-schema.ts（新）、tests/memory-archive-schema.test.mjs（新）
禁止改动文件：不改生产 CRUD；不导入 host/window；不写 MVU；不查数据库；不在 normalizer 调用 LLM；不用随机 ID
输入合同：runbook §10 B4-T03 + O02 固定字段映射（story 表 14 列 / relationship 表 16 列）
输出合同：scope id / archive key 精确算法、stable serialize、content hash、story/relationship normalizer、数据库行→候选校验
失败合同：缺 stable ID/错 character/错 scope/错 enum/超长文本/HTML/协议片段/旧 schema → 结构化错误，不落库
新增测试：tests/memory-archive-schema.test.mjs（15 条，全过）
实际 diff：见下方
执行命令：npm run check:ui（通过）；node --test tests/memory-archive-schema.test.mjs（15/15）
原始结果：全部通过
未证明事项：真实数据库行形状未验（以 O02 摘录的列名为准）
```

### B4-T03 交付

- `src/ui/memory-archive-schema.ts`：
  - `buildArchiveScopeId`：`gal-scope.v1|owner=<len>:<owner>|chat=<len>:<chat>`，trim + 上限（owner 128 / chat 512），空判 invalid-scope；
  - `buildArchiveKey`：`gal-archive.v1|scope=<len>:<scope>|kind=<story|relationship>|id=<len>:<stableId>`，content_hash 绝不进入；
  - `stableSerializeRecord`：键排序、无缩进、稳定转义；`buildContentHash`：FNV-1a 32-bit（复用项目 deterministicStringHash）；
  - `toStoryArchiveRecord` / `toRelationshipArchiveRecord`：normalizer + 枚举校验 + 安全内容（完整正文/script/javascript: 拒绝，摘要 ≤400 截断）；
  - `storyRowToCandidate` / `relationshipRowToCandidate`：召回侧校验（schema/scope/稳定 ID/character/安全），active 0/1/true 规范化；
  - 常量：`STORY_RECALL_PER_CHARACTER=24`、`RELATIONSHIP_RECALL_PER_CHARACTER=12`、`RECALL_TOTAL_BUDGET_CHARS=2800` 相关（管线侧）。
- 注意：`VisitTurn` 无 `visit_id` 字段（O02 要求故事表 visit_id NOT NULL），`toStoryArchiveRecord` 输入显式携带 `visitId`，由调用方从 VisitRecord 归属传入。

### B4-T03 必测结果（15/15）

完整合法行、缺 stable ID、错 character ID、错 scope、错 enum、day number/string/null、超长文本、HTML/协议片段、未知字段、旧 schema、关系事件不推导 relationship state、转换前后不含完整正文、scope/key 精确算法、hash 稳定性、预算常量。

---

## B4-T04：稳定键、content hash 与 upsert plan（已完成）

```text
任务标签：[苦力-测试]
开始前基线：B4-T03 完成后
允许改动文件：src/ui/memory-upsert-plan.ts（新）、tests/memory-upsert-plan.test.mjs（新）
禁止改动文件：不碰生产 CRUD；不查数据库
输入合同：runbook §10 B4-T04
输出合同：insert|update|skip|duplicate|unsafe 纯 plan；完成门（100 次重复规划仅 1 次 insert）
失败合同：错 scope 行参与匹配 / 多行重复仍 insert → 立即失败
新增测试：tests/memory-upsert-plan.test.mjs（5 条，全过）
执行命令：node --test tests/memory-upsert-plan.test.mjs（5/5）
原始结果：全部通过
```

### B4-T04 交付与证据

- `planUpsert`：查重 0 行 insert；1 行同 hash skip / 异 hash update；2 行 duplicate；3+ 行 unsafe；查重结果任何行错 scope → unsafe（不参与匹配）；
- `buildStoryInsertRow` / `buildRelationshipInsertRow`：英文列名写入行（不含 row_id）；
- 表驱动矩阵：2 记录 × 6 查询返回（0/1 同/1 异/2/3/错scope）× 3 hash × 2 rowId = 50 断言；
- 完成门：100 次重复规划 → 1 次 insert + 99 次 skip/update，无第二个 insert。

---

## B4-T05：召回纯管线（已完成）

```text
任务标签：[苦力-测试]
开始前基线：B4-T04 完成后
允许改动文件：src/ui/memory-recall-pipeline.ts（新）、tests/memory-recall-pipeline.test.mjs（新）
禁止改动文件：不触碰请求、host、MVU
输入合同：runbook §10 B4-T05
输出合同：scope/relevant 过滤、story/relationship 分别 normalize、DB 内部去重、MVU 获胜去重、
  active relationship 保护、稳定排序、每角色/全局预算、来源标签仅内部 candidate、纯数据返回
新增测试：tests/memory-recall-pipeline.test.mjs（14 条，全过）
执行命令：node --test tests/memory-recall-pipeline.test.mjs（14/14）
原始结果：全部通过
```

### B4-T05 交付与证据

- `runRecallPipeline`：输入超 10000 行有界拒绝；错 schema/错 scope/非 relevant/缺稳定 ID 逐项计数拒绝；
- DB 内部按稳定 ID 去重；与 MVU 去重且 MVU 获胜（rejected.mvuDuplicate）；
- active 保护：MVU 标记 active 的 ID 即使 DB active=0 也按 active 保留；MVU 无记录时保留 DB 值；
- 稳定排序：periodSerial DESC → day 字典序 DESC → memoryId ASC；
- 每角色预算 story 24 / relationship 12，全局 2800 字符；
- 全部 DB 候选非法 → 输出与 standalone 严格相等（空候选 recall-empty）。

---

## B4-T06：fake database port 与故障矩阵（已完成）

```text
任务标签：[苦力-测试]
开始前基线：B4-T05 完成后
允许改动文件：tests/fake-database-port.mjs（新，测试专用）、src/ui/memory-host-call.ts（新，生产安全调用壳）、tests/memory-host-call.test.mjs（新）
禁止改动文件：fake 模块不进入生产装配链
输入合同：runbook §10 B4-T06 fake 可配置 12 项 + 必须证明 5 项
输出合同：故障不抛穿、standalone 计数 0、fallback 与 standalone 字节相同、timeout 后迟到结果不变、无 unhandled rejection、写失败不改输入、结构化诊断
新增测试：tests/memory-host-call.test.mjs（12 条，全过）
执行命令：node --test tests/memory-host-call.test.mjs（12/12）
原始结果：全部通过；两个 timeout 用例各约 7.8s 为预期等待（验证迟到结果被吸收）
```

### B4-T06 交付与证据

- `FakeDatabaseApi`：可配置 API 缺失/getter 抛错/方法缺失/同步抛错/同步返回/promise resolve-reject/延迟 resolve-reject/insert-update true-false-reject/多行/调用计数与参数录制/并发峰值；
- `safeHostCall` / `withTimeout`：结构化结果 `{ok:true,value}|{ok:false,error}`，同步抛出与 promise reject 均不抛穿；timeout 后迟到 promise 被 `.catch` 吸收；
- 必证全部成立：standalone adapter 在 getter-throws 环境下 getterTouchCount=0、调用计数 0；database-assisted fallback（接口壳 recall-failed）与 standalone（disabled-by-build）空候选 JSON 相等。

---

## 第二次小验收：纯函数与 fake port（执行 agent 自报通过；后被主验收方撤销并返修）

```text
验收对象：B4-T03/T04/T05/T06 纯函数层 + fake database port
证据：
  npm run check:ui → tsc --noEmit 通过
  npm test → 636 pass / 0 fail（590 基线 + T03 15 + T04 5 + T05 14 + T06 12）
  dist/runtime/profiles/{standalone-mvu,database-assisted}/ui-mount.js 均存在
  standalone ui-mount AutoCardUpdaterAPI:0；database-assisted ui-mount AutoCardUpdaterAPI:4（数据库桥保留）
结论：纯函数层全部可独立验证，无 host/请求/MVU 依赖；fake port 覆盖全部故障形态。
```

**下一步：B4-O03（后置归档顺序与恢复扫描，[主人-高风险]）——执行 agent 先收集 settleByWriting 链路上的归档候选证据，然后停止等待主人裁定。**

---

## B4-O03：MVU 后置归档顺序与恢复扫描（证据收集完成，等待主人 APPROVED）

```text
任务标签：[主人-高风险]（执行 agent 只收集证据与接口壳，不接生产归档）
开始前基线：第二次小验收通过（636 pass）
允许改动文件：project/gal-character-memory-batch-4-implementation-log.md（证据记录）
禁止改动文件：不接生产归档/召回；不改 settleByWriting 行为
输入合同：runbook §10 B4-O03 六项确认
输出合同：settle 链路归档候选证据、恢复扫描路径证据、双触发/切 swipe/恢复幂等证据
失败合同：归档任务不得阻塞或破坏 MVU 事务；不得双触发
新增测试：无（等待 O03 裁定后 T07 才接线）
实际 diff：无源码 diff
执行命令：grep/sed 读取 bridge.ts（finalizeAcceptedAssistant/settleByWriting/recoverPendingV2Settlement）
原始结果：见下方证据
未证明事项：归档钩子具体顺序（settle 返回前 vs 后置任务）由主人裁定
```

### O03 证据（settleByWriting 链路实况）

1. `settleByWriting`（bridge.ts:450-470）：
   - `await mvu.replaceMvuData(data, options)`（写盘）→ `reread = structuredClone(mvu.getMvuData(options))`（复读）→ `verifyFinalizedAssistantData(...)`（turn+lifecycle 双验证）→ 身份复核 → `return { phase: 'settled' }`；
   - **唯一 hook 候选**：`{ phase: 'settled' }` 返回处 = “MVU 成功写入 + 精确复读通过 + lifecycle settled”的唯一点；
   - `data` 含 `stat_data`（finalState）+ `COMMIT_LIFECYCLE_KEY` +（V2）`GAL_REGENERATION_RECEIPT_DATA_KEY`。
2. 归档候选来源：`finalizeAcceptedAssistant` 中 `applyVisitTurnsToFinalState(...)` 返回 `committed.turns`（`VisitTurn[]`），settle 前已可用；`visitIdsByCharacter` 可从冻结 request 获得 → `toStoryArchiveRecord({ turn, visitId, archiveScopeId })` 输入齐备（B4-T03 已就绪）。
3. `finalizeAcceptedAssistant` 调用点：bridge.ts 1278 / 1370 / 1405（恢复路径）/ 1496 / 1578（事务 regenerate 等）；全部经统一 finalizer，归档钩子只需接在 settleByWriting 一处（或 finalizer 尾部）。
4. 恢复扫描：`recoverPendingV2Settlement`（bridge.ts:1390）在 reload/恢复时对 pending V2 settlement 调用同一 `finalizeAcceptedAssistant`（1405）——归档必须幂等：恢复重放时不得重复归档（由 archive_key 幂等 + settle 已写盘的标记保证）。
5. 双触发风险点：`recoverRecordedAnomalyResolution`（1424）独立扫描 anomaly resolution；若归档钩子同时接在事务 send 路径与恢复路径，需确认同一 request 只归档一次（O03 裁定点）。
6. 切 swipe：`sameAcceptedAssistantIdentity` 在写盘前后复核，swipe 变化会抛错保持 pending——归档钩子若在 settle 返回前执行，必须与身份复核顺序协调（O03 裁定点）。

### O03 待主人裁定清单

1. 归档钩子接在 settleByWriting 返回 `{ phase: 'settled' }` 之后（事务内后置）还是 finalizer 外部的后置任务（脱离 GAL 锁、捕获所有异常、best-effort）？
2. 归档是否只对 V2 request 执行（V1/无 request 恒等跳过）？
3. 恢复扫描重放时如何保证幂等（archive_key 已唯一 + settle 标记）？
4. 归档失败（数据库 unavailable/写入失败）是否阻断 MVU 事务？（推荐：不阻断，记诊断）
5. 是否限制并发与批次（如每 settle 至多 N 条、串行队列）？
6. 归档范围：仅当前请求新增的 turns，还是含角色全部超预算历史？

**执行 agent 已在此停止，等待主人对 B4-O03 写出 APPROVED/裁定后再开始 B4-T07。**

---

## 主验收方第一次小验收与 B4-O02 裁定（2026-08-09）

### 验收结论

**B4-T01/T02：核心逻辑通过，但带一个必须先修的验证门缺陷。B4-O02：按 runbook 新增最终裁定批准。第四批整体尚未完成。**

本次只看代码逻辑与本地构建，不做真实宿主演示、探针、R2 上传、卡片打包或发布。

### 实际复核证据

- 两个 profile 的 embedded 构建均成功；profile-specific app/mount 未相互覆盖。
- 两个 profile 的 remote test 构建均成功，manifest 坐标分别落在 `test/ui/profiles/<profile>/ui-manifest.json`，共享资产仍指向 `live/manifest.json`。
- `node --test tests/memory-profile-build.test.mjs tests/ui-channel.test.mjs`：19/19 pass。
- `npm run check:ui`：pass。
- `npm test`：590/590 pass，0 fail。
- standalone 最终 app/mount 的数据库禁词为零；database-assisted 保留唯一 guarded bridge；fake throwing getter 未被 standalone 访问。

### 必须返修：B4-T02-R1（P2 验证门空洞）

`tests/memory-profile-build.test.mjs` 当前读取 `dist/runtime/profiles/standalone-mvu/ui-build-report.json`，但本轮 remote test 报告实际写在 `dist/runtime/test/profiles/...`；随后又以 `.catch(() => null)` 和 `if (report)` 静默跳过缺失报告。因此“build report 携带 profile/adapter”的测试可以在完全没有报告时通过。

返修方法已逐条写入 runbook 的 `B4-O02 → B4-T02-R1`：fresh 构建、自带 fixture、报告缺失即失败、所有 profile 构建固定写报告、检查路径/字段/hash 不交叉。返修完成并重跑 focused/check:ui/full/diff-check 前，不得开始 T03。

### B4-O02 主人裁定摘要

1. 物理表固定为预建 `GAL剧情记忆归档表` / `gal_story_memory_archive` 和 `GAL关系记忆归档表` / `gal_relationship_memory_archive`；adapter 不建表、不跑 DDL。
2. schema 固定 `gal-memory-archive.v1`；完整字段映射见 runbook。
3. `archive_scope_id` 只由事务冻结的 ownerCharacterId + chatId 做长度前缀编码；稳定 archive key 由 scope + kind + stable ID 组成，content hash 不进 key。
4. query 必须在数据库侧按 archive key 或 scope + character 精确过滤；story 每角色最多 24，relationship 每角色最多 12；同步 query 不宣称可被 timeout 取消。
5. 新增核验 `exportTableAsJson()`；update 前必须用 query row_id 在精确表快照中唯一反查 `content` 数组下标并重验 stable key。歧义即 `unsafe-row-identity`，严禁猜第一行或把 row_id 当 rowIndex。
6. 缺 API、缺表、缺列、旧 schema、重复键或写入失败均回退 standalone MVU 48+12，不阻断 GAL。
7. 既有主角/背包开局同步继续作为 database-assisted 的独立兼容功能，但不参与记忆 capability，不阻断归档/召回或 GAL。

### 放行范围

- B4-T02-R1 已由主验收方完成并通过；
- 现在可实施 B4-T03、T04、T05、T06；
- 做完后停在第二次小验收；
- B4-T07 生产 CRUD 仍须等待 O03，禁止提前接线。

---

## B4-T02-R1：构建报告验证门返修（2026-08-09，已完成并通过）

```text
任务标签：[主人-修复]
授权范围：scripts/build-ui.mjs、tests/memory-profile-build.test.mjs，以及本 runbook/实施日志/总计划状态回填
禁止范围：数据库 CRUD、探针、R2 上传、卡片打包、发布、reasonix
结构裁定：Local Fix
行为合同：每次 profile 构建必须生成不可选的报告；测试必须从 fresh 报告开始，并把报告 bytes/hash 对回实际 mount
```

### 实际修改

1. `scripts/build-ui.mjs`：把 mount bytes/sha256 与报告对象提升到 embedded/remote 公共路径；报告始终写入 `dist/runtime[/test]/profiles/<profile>/ui-build-report.json`。
2. 报告新增 `ui_delivery`；embedded 对远程专属字段写 `null`，remote 再填入 manifest、版本化 mount 和 loader 路径。
3. `tests/memory-profile-build.test.mjs`：在 `before` 中精确删除 standalone/database 两个旧报告并顺序重建两个 embedded profile，不再依赖旧 `dist`。
4. 报告断言不再使用 `.catch(() => null)`/`if (report)`；现在验证 delivery、channel、version、profile、adapter、output、bytes 与 sha256，缺文件或坏 JSON 会直接失败。

### 验证结果

- `node --test tests/memory-profile-build.test.mjs tests/ui-channel.test.mjs`：19/19 pass。
- `npm run check:ui`：pass。
- `npm test`：590/590 pass，0 fail。
- `git diff --check`：pass。
- 代码质量 skill 的全工作区 scope checker 因此前已存在的 109 个修改/未跟踪文件而按 `local-fix` 预算返回失败；这是脏工作区总量检查，无法单独归因本次两文件代码修复。本次未清理、覆盖或提交那些既有改动。
- standalone remote test：bytes `2082632`，sha256 `72cb3b74dd0ec73c742ca83f3e2e26f183104779cccb7a7e5922a13e0e103a6f`。
- database-assisted remote test：bytes `2086752`，sha256 `d82839ca2edbce2e2ef13505441728d471e225389e6c59d3da946aa7c14e2a4a`。
- 未执行：探针、R2 上传、publish、checkpoint、JSON/PNG 打包。

### 裁定

**B4-T02-R1 APPROVED。T03 前置阻塞解除。执行 agent 下一步必须重新阅读 skill、主计划、第四批 runbook 与本日志，然后从 B4-T03 开始；可做到 T06，完成后必须停下申请第二次小验收。**

---

## B4-O01 主验收方裁定（2026-08-09）

裁定结果：**APPROVED WITH FIXED CONTRACT**。

原提案不能原样批准，主验收发现并封闭了两个遗漏：

1. `src/runtime/ui-host-shell.js` 会在 app bundle 之外原样拼入 mount，其中无条件暴露 `AutoCardUpdaterAPI`；只给 app adapter 做 alias 无法满足 standalone 最终产物禁词门；
2. 两个 profile 若继续共用 `dist/ui/app.js`，会形成覆盖与并发交叉污染；只隔离 `dist/runtime` 不够。

最终执行合同：

```text
CLI:
  --memory-profile=standalone-mvu|database-assisted
  缺失/非法值 -> 构建失败

adapter selection:
  唯一 selection import
  + 受控 esbuild resolve plugin
  + standalone no-op adapter / database-assisted adapter
  禁止运行时切换，禁止复制完整 app

app outputs:
  dist/ui/profiles/standalone-mvu/app.js(.map)
  dist/ui/profiles/database-assisted/app.js(.map)

runtime outputs:
  dist/runtime/profiles/<profile>/
  dist/runtime/test/profiles/<profile>/

host shell:
  数据库桥接块使用唯一 begin/end guard
  standalone 构建移除整个块
  database-assisted 构建保留整个块
  guard 不是恰好一次 -> 构建失败

standalone gates:
  profile-specific app.js 禁词为零
  最终 ui-mount.js 禁词为零
  fake throwing getter 访问次数为零

manifest coordinates（仅合同，不发布）:
  live/ui/profiles/<profile>/ui-manifest.json
  test/ui/profiles/<profile>/ui-manifest.json
  既有 live/ui 与 test/ui manifest 不覆盖
  runtime 图片/音频/地图继续共用 live/manifest.json
```

批准范围：B4-T01 与 B4-T02 的本地构建配置、端口、no-op adapter、host-shell guarded selection、测试和隔离构建报告。

未批准范围：

- B4-O02 之后的数据库 CRUD；
- 物理表名/列名/row identity 猜测；
- R2 上传、publish、checkpoint、JSON/PNG 打包；
- 修改正式 UI 指针；
- 修改 reasonix；
- 探针或真实宿主结论。

执行 agent 下一步必须从 B4-T01 开始，并重新完成 runbook §3.1 的逐项阅读回执。B4-T01/T02 完成后停在第一次小验收，不得越过 B4-O02。

---

## 主验收方 T03～T06 返修与第二次小验收裁定（2026-08-09）

### 初验裁定

执行 agent 的 636 pass 被裁定为 **REJECTED — REPAIR REQUIRED**。对抗输入证明：一般 HTML 与非法关系枚举可进入召回；canonical string 可发生字段边界碰撞；错 archive key 仍会计划 update；fake 返回数组而非已核验宿主 envelope；“第五角色拒绝”测试实际断言接受第五人。

### 主验收方实际修复

- `memory-archive-schema.ts`：canonical JSON；严格 scope 解析；ID/schema/revision/hash/time/active/significance 校验；任意 HTML/协议拒绝；160 字摘要。
- `memory-upsert-plan.ts`：scope + archive key 双身份；缺安全身份禁止 update；新增 `resolveSafeRowIdentity()` 唯一快照反查。
- `memory-recall-pipeline.ts`：统一调用 T03 normalizer；relevant 最大 4；冲突重复整组拒绝；MVU/active 保护；显式剩余预算（每角色 900、全局 2800）。
- `fake-database-port.mjs` / `memory-host-call.test.mjs`：精确 `AutoCardUpdaterAPI` 与 query envelope；export 快照；真实未决并发；快速 timeout/迟到吸收；完整 synthetic history fallback。
- 四个测试文件新增或修订对抗回归；未接生产 adapter。

### 最终验证

```text
npm run check:ui
  PASS

node --test tests/memory-archive-schema.test.mjs tests/memory-upsert-plan.test.mjs tests/memory-recall-pipeline.test.mjs tests/memory-host-call.test.mjs
  55/55 PASS

第四批相关 + 双 profile/UI 通道 focused
  74/74 PASS

npm test
  645/645 PASS, 0 fail

git diff --check
  PASS
```

未执行：探针、真实宿主演示、R2 上传、publish、checkpoint、JSON/PNG 打包。未修改 reasonix。

代码质量 skill 的全工作区 scope checker 以 `staged-refactor` 预算执行，因当前工作区累计存在 118 个已修改/未跟踪文件、29178 行已知变更而按设计返回失败；这属于跨批次既有脏工作区总量，不能归因于本次 T03～T06 返修。本次未清理、覆盖或提交这些既有改动，功能裁定以定向测试、全量测试与 `git diff --check` 为准。

### 第二次小验收最终裁定

**APPROVED AFTER R1，仅批准 T03～T06 纯逻辑/fake 层。** 下一步停在 B4-O03。T07、生产数据库 CRUD、真实宿主能力声明继续禁止。

### O03 准备裁定补充

执行 agent 所称“settleByWriting 返回 settled 是唯一 hook”不完整：`finalizeAcceptedAssistant` 的 `noop/already-settled` 也已完成 lifecycle/VisitTurn/assistant identity 验证，reload 补归档必须覆盖该出口。O03 还必须定义 RelationshipMemory 的当前 request/attempt/commit 差量，不能只归档 VisitTurn。详细停止线已回写 runbook 的 B4-O03。

---

## R2 数据库共存改线裁定（2026-08-09）

主人最终决定不再专门适配数据库召回：卡内 MVU 召回 token 体积可接受，有无数据库均保持同一套 48 条剧情梗概 + 12 条关系记忆。数据库若自行执行剧情推进与世界书召回，视为宿主额外增强；本卡不读取、不合并、不去重、不依赖该结果。

据此撤销此前 O03 → T07 → O04 → T08 的生产接线许可。T03～T06 已完成代码与测试仅保留为研究资产，不得被 database-assisted 生产 adapter import。新的执行入口为 `project/gal-character-memory-batch-4-database-coexistence-replan.md`：先做双 profile 卡内请求逐字节同一性测试，再单独裁定 late-bound `generate` 共存桥；不得继续自建数据库故事/关系归档表、主动查表召回或数据库失败切换历史。

当前状态：**REPLANNED — OLD DATABASE RECALL PATH SUPERSEDED**。未执行探针、R2 上传、发布、checkpoint 或整卡打包；未修改 reasonix。

---

## R2 数据库共存实施与静态验收（2026-08-09）

### 阅读与范围回执

重新完整阅读 `sillytavern-database-rolecards`、其 `rolecard-data-model.md` / `floor-and-ui-binding.md`、`sillytavern-api-reference`、`code-quality-workflow` / `gate-change-verify.md`，并复核 R2 重规划、总计划 Phase 7、旧 runbook 与本日志最新裁定。范围锁定为代码逻辑、构建隔离、自动化测试和文档；不做探针、真实宿主演示、R2、发布、checkpoint 或整卡打包，不修改 reasonix。

### B4-R2-T01：双 profile 公共召回合同

- 新增 `tests/memory-profile-recall-parity.test.mjs`，用相同 MVU fixture 分别经过 standalone/database-assisted adapter，再进入同一个 V2 请求构造器。
- fixture 同时覆盖 current visit、closed visit、relationship state、relationship event、无关角色与真实旧聊天楼层 canary。
- 断言 request/history/hash/config/fingerprint 深相等；合法四类本地记忆存在，无关角色和真实旧楼层不进入；重复 100 次稳定。
- 对 `AutoCardUpdaterAPI` 设置抛错 getter，构造阶段访问次数为 0。
- esbuild metafile 证明请求构造 graph 不可达数据库 adapter、`memory-archive-schema`、`memory-upsert-plan`、`memory-recall-pipeline`、`memory-host-call`。

结论：**PASS**。

### B4-R2-O01 / T02：late-bound generate 共存桥

- `src/runtime/ui-host-shell.js` 版本更新为 `0.4.4-late-bound-generate-r2`。
- 删除 child bridge 对 `source.generate.bind(source)` 的挂载时快照；新增 `resolveCurrentGenerate()` / `callCurrentGenerate()`，每次调用优先读取当前 `source.TavernHelper.generate`，保持 helper receiver；仅在 provider 缺失时回退公开 host/source provider。
- 不读取 `original_TavernHelper_generate_ACU` 等数据库私有全局，不调用 `generateRaw`，不解析数据库召回，不在 wrapper 抛错时重试或重建 request。
- 新增 `tests/ui-host-generate-bridge.test.mjs`，覆盖正确 `this`、挂载后安装 wrapper、wrapper 恢复、source/host fallback、抛错只调用一次与静态禁私有全局合同。

结论：**O01 APPROVED；T02 PASS**。

### B4-R2-T03 / O02：封存旧主动数据库记忆路线

- `src/ui/memory-adapters/database-assisted.ts` 的 `recall()` 固定返回 `recall-empty` / 空 candidates，`archive()` 固定返回 `skipped`；不再声称或准备自建数据库故事/关系记忆归档。
- 保留该 adapter 原有的开场主角/背包同步兼容功能；它不进入 GAL request/history、事务 settled、retry 或 regenerate。
- `src/ui/memory-port.ts` 明确 recall/archive 是封存研究接口，禁止生产请求构造调用。
- `tests/memory-profile-build.test.mjs` 解析 database-assisted `app.js.map`，证明旧 T03～T06 模块未进入生产 bundle。
- O02 裁定：旧纯函数/fake 模块**保留隔离**，避免本轮混入大范围删除；不得由 production adapter import，未来清理必须另立任务并独立回归。

结论：**T03 PASS；O02 APPROVED — RETAIN ISOLATED**。

### 验收结果与声明边界

```text
focused R2 + UI contracts
  146/146 PASS

npm run check:ui
  PASS

npm test
  654/654 PASS, 0 fail

git diff --check
  PASS

reasonix.toml / .reasonix status
  CLEAN（本轮零改动）

runtime status
  DBR-C8-UNVERIFIED（未做真实宿主数据库时机演示）
```

当前生产裁定已经成立：两个 profile 的卡内召回完全相同；数据库不参与、不替代、不增强本卡召回构造；数据库 wrapper 若存在，只能在宿主层独立运行。

代码质量 skill 的全工作区 scope checker 按 `staged-refactor` 运行并如预期返回非零：当前脏工作区累计 121 个文件、27901 行已知变更，超过 5 文件/200 行预算，另有 12 个文件行数未知。该统计覆盖此前第一至第四批、UI、战斗资源与浏览器日志等既有改动，不是本次 R2 独占 patch；本轮没有删除、覆盖、暂存或提交这些用户改动。功能裁定以定向测试、全量 654/654 与 `git diff --check` 为准。
