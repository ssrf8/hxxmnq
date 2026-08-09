# GAL 第五批：脱敏诊断导出——超详细执行手册

> 文档日期：2026-08-09
> 文档性质：**仅授权按本文施工源码、测试与实施日志；不授权打包、发布、R2、探针、实机写操作或提示词改造**
> 面向对象：不了解项目历史、容易扩大范围、容易把“哈希”误当“脱敏”的执行 Agent
> 当前基线：`npm run check:ui` PASS；`npm test` 654/654 PASS
> 本批目标：在设置页增加“导出脱敏诊断”按钮，生成一份只落到用户本机的 `gensokyo-diagnostic.v1` JSON；它能辅助定位 GAL 请求、事务、memory profile 与角色记忆容量问题，但绝不包含剧情原文、玩家输入、关系文本、数据库内容或凭据。

---

## 0. 先把任务翻译成人话

你要做的是一个“体检报告下载按钮”，不是录像机，也不是黑匣子。

用户点击按钮后，程序在内存里读取**当前已经存在的状态**，只把允许公开的版本号、布尔值、数量、枚举和经过单次导出随机盐处理的短标识写成 JSON，然后让浏览器下载。程序不得上传它，不得把它写回 MVU，不得为了收集诊断去新增监听器，也不得读取 SillyTavern 的历史楼层或数据库行。

本批最终应出现：

1. `src/ui/diagnostic-export.ts`：脱敏、限额和序列化的唯一实现；
2. `src/ui/bridge.ts`：从当前 bridge 内部取必要数据，调用脱敏构造器；
3. `src/ui/types.ts`：给 `GardenBridge` 增加诊断导出方法的类型；
4. `src/ui/index.html`：设置页按钮、说明文字和状态区；
5. `src/ui/app.ts`：按钮点击、Blob 下载、URL 回收和失败提示；
6. `src/ui/styles.css`：仅在现有样式不能满足时增加少量样式；
7. `tests/diagnostic-export.test.mjs`：真实源码的脱敏与限额测试；
8. `tests/ui-contract.test.mjs`：入口和“绝不联网／绝不写状态”的合同测试；
9. `project/gal-diagnostic-export-batch-5-implementation-log.md`：执行 Agent 新建并逐任务填写的日志。

除此之外，默认都不该动。尤其别因为看到旧代码不顺眼，就顺手做一轮“架构优化”。那通常是灾难穿了件整洁外套。

---

## 1. 本批最终裁定（执行 Agent 无权自行改题）

### 1.1 产品行为

- 入口只放在 `src/ui/index.html` 的 `#gg-view-settings` 设置页。
- 按钮固定使用 `id="gg-export-diagnostics"`。
- 状态文本固定使用 `id="gg-diagnostic-export-status"`，并带 `role="status" aria-live="polite"`。
- 按钮附近必须写明：**仅本地下载；不含剧情文本；分享前仍建议人工检查。**
- 点击后只生成一份当前快照，不维护历史事件环形日志。
- 下载文件名格式：`幻想乡物语-诊断-YYYYMMDD-HHmmss.json`。
- 下载成功或失败都不能改变游戏状态、聊天楼层、swipe、事务阶段和记忆内容。
- 连续快速点击时，第一次未结束前按钮必须禁用；结束后无论成功失败都恢复。

### 1.2 技术行为

- JSON schema 固定为 `gensokyo-diagnostic.v1`。
- 导出构造允许异步，因为标识符脱敏必须使用 Web Crypto SHA-256。
- 每次导出生成一份新的随机盐；盐本身不写入导出文件。
- 同一份导出内，同一个原始标识得到相同短代号；不同导出之间不可稳定追踪。
- 短代号格式固定为 `d_<SHA-256 前 12 个十六进制字符>`。
- 不允许退化到 FNV、CRC、`btoa`、Base64、字符串截断或原值透传。
- `globalThis.crypto?.subtle` 或安全随机数不可用时，导出必须失败并返回安全错误 `diagnostic-crypto-unavailable`；不得偷偷使用弱算法兜底。
- JSON 使用 UTF-8、两个空格缩进，文件末尾保留一个换行。
- 导出硬上限固定为 **64 KiB（65,536 bytes）**；超过时必须失败为 `diagnostic-size-limit`，不得静默截断成结构不完整的 JSON。
- 所有可选字段要么给出受控值，要么明确为 `null`；序列化结果不得依赖 `undefined` 被悄悄丢弃。

### 1.3 为什么不用现有 fingerprint 直接导出

项目里的 `contextFingerprint`、`syntheticHistoryHash` 等现有值服务于请求一致性，不是隐私算法；其中已有 32 位快速哈希语义。它们可能稳定跨导出追踪，也可能被字典猜测。因此：

- 不得原样导出这些 fingerprint；
- 若诊断确实需要判断“两个位置是不是同一值”，只能把该 fingerprint 再经过本次随机盐 SHA-256，输出单次导出代号；
- 不得在文档或 UI 中把现有 fingerprint 描述为“不可逆隐私哈希”。

---

## 2. 固定隐私白名单与黑名单

### 2.1 允许导出的内容

只有下列类型允许进入最终 JSON：

- 固定 schema 名与 schema 版本；
- 捕获时间 `capturedAt`；
- 应用版本、bridge 版本、目标运行时版本；
- `mode`、memory `profile`、memory `capability`；
- `mvuReady`、数据库能力是否可用等布尔值或受控枚举；
- 生成／重生成 transport 名；
- transaction 的受控 `kind`、`phase`、`stopReason`、`recovery`；
- `requestId`、`attemptId`、`generationId`、`commitKey`、`transactionId`、`chatId`、`ownerCharacterId`、message ID、visit ID 等值的**单次导出短代号**；
- V2 request 的 schema/revision、attempt 序号、合成历史消息数量、UTF-8 字节数；
- 固定八角色的 registry ID；不得导出玩家自定义名称、角色显示名或关系描述；
- 每角色 active visit 是否存在、active turn 数、closed visit 数、closed turn 总数、relationship memory 数、active relationship-state 数；
- 整份 MVU JSON 的 UTF-8 字节数这一单一数字；
- 受控错误码和是否存在错误，不得带原始错误文本或 stack；
- `DBR-C8-UNVERIFIED` 等现有受控验证标记。

### 2.2 绝对禁止导出的内容

下面任何一项只要出现在 JSON 中，本批直接判定失败：

- 玩家输入、建议回复原文、assistant 正文、旁白、台词；
- `modelUserInput`、`visibleUserText`、`syntheticHistory` 的任何原文；
- visit turn 的 summary、人物关系 summary、关系标签、亲密事件描述；
- 玩家名、庭园名、角色显示名、自定义名称；
- 世界书正文、prompt、system prompt、injects、预设内容；
- 原始 chat ID、request ID、attempt ID、generation ID、commit key、transaction ID、visit ID；
- 任何未经本次随机盐处理的旧 fingerprint；
- 原始错误 message、stack、URL、URL query、文件系统绝对路径；
- Cookie、Authorization、API key、token、password、secret；
- Cloudflare/R2 account、bucket credential、access key；
- 数据库 row、召回文本、数据库查询结果或数据库连接信息；
- `innerHTML`、iframe HTML、宿主 DOM 快照；
- 整份 `stat_data`、整份 request、整份 transaction snapshot；
- localStorage、sessionStorage 或宿主设置中的任何值。

### 2.3 错误只允许分类，不允许“清洗后原文”

实现 `classifyDiagnosticError(value)` 时，只输出以下固定枚举之一：

```text
none
abort
timeout
stale-chat
stale-attempt
request-schema
empty-response
mvu-commit
regeneration-blocked
database-wrapper
unknown
```

规则：

- 没有错误输出 `none`；
- 对输入只做本地小写匹配以选择枚举，绝不返回匹配到的片段；
- 无法证明的错误统一输出 `unknown`；
- 不得以正则“删 token 后保留其余句子”，因为剩余句子仍可能带剧情、名字、URL 或路径。

---

## 3. `gensokyo-diagnostic.v1` 精确结构

执行 Agent 应在 `src/ui/diagnostic-export.ts` 为下列结构声明类型。字段名不得随意换同义词；没有数据时按说明使用 `null` 或空数组。

```ts
interface DiagnosticSnapshotV1 {
  schema: 'gensokyo-diagnostic.v1';
  capturedAt: string;
  privacy: {
    level: 'strict';
    correlationScope: 'single-export';
    includesStoryText: false;
    includesCredentials: false;
    includesDatabaseRows: false;
    maxUtf8Bytes: 65536;
  };
  build: {
    appVersion: string;
    bridgeVersion: string;
    memoryProfile: 'standalone-mvu' | 'database-assisted';
  };
  runtime: {
    mode: 'host' | 'preview';
    tavernVersion: string;
    helperVersion: string;
    mvuReady: boolean;
    generationTransport: string;
    regenerationTransport: string;
    databaseAvailable: boolean;
    databaseVersion: string | null;
    memoryCapability: 'disabled-by-build' | 'available' | 'unavailable';
    databaseRuntimeVerdict: 'DBR-C8-UNVERIFIED';
    lastErrorCode: DiagnosticErrorCode;
  };
  transaction: null | {
    kind: MessageTransactionKind;
    phase: MessageTransactionPhase;
    transactionRef: string | null;
    chatRef: string | null;
    requestRef: string | null;
    attemptRef: string | null;
    generationRef: string | null;
    commitRef: string | null;
    ownerCharacterRef: string | null;
    userMessageCreated: boolean;
    assistantResponded: boolean;
    userMessageRef: string | null;
    assistantMessageRef: string | null;
    attemptSeq: number;
    requestSchema: string | null;
    stopReason: string | null;
    recovery: string | null;
    errorCode: DiagnosticErrorCode;
  };
  request: null | {
    schema: string;
    promptRevision: string;
    historyRevision: string;
    memoryRevision: string;
    attemptSeq: number;
    relevantCharacterIds: string[];
    syntheticHistoryMessageCount: number;
    syntheticHistoryUtf8Bytes: number;
    syntheticHistoryRef: string | null;
    contextRef: string | null;
    visitRefs: string[];
  };
  state: {
    mvuUtf8Bytes: number;
    registeredCharacterCount: number;
    characterMemory: Array<{
      characterId: string;
      hasActiveVisit: boolean;
      activeTurnCount: number;
      closedVisitCount: number;
      closedTurnCount: number;
      relationshipMemoryCount: number;
      activeRelationshipStateCount: number;
    }>;
  };
}
```

补充裁定：

- `relevantCharacterIds` 和 `characterId` 只能来自项目固定角色 registry 白名单，并按固定顺序输出；陌生 ID 不得原样输出。
- `ownerCharacterId` 仍然做短代号，因为它来自运行时身份，不假定永远是固定注册 ID。
- `databaseVersion` 只有当前 `RuntimeDiagnostics` 已提供安全、受控版本字符串时才可输出，否则 `null`。不得为了补它去读数据库配置。
- transaction 的 `stopReason`、`recovery` 必须先做已有联合类型或本地白名单约束；若当前类型允许自由字符串，应改为安全枚举映射，未知值输出 `null`，不能原样透传。
- 不输出 `startedAt` 绝对时间，也不输出聊天消息的真实楼层号；它们对本批定位价值有限，却会扩大可关联信息。
- `syntheticHistoryUtf8Bytes` 可以在内存里由原文计算，但最终对象中只能留下数字。

---

## 4. 文件改动地图

| 文件 | 允许做什么 | 不允许做什么 |
|---|---|---|
| `src/ui/diagnostic-export.ts` | 新建；类型、白名单、SHA-256 代号、错误分类、摘要构造、序列化与 64 KiB 门禁 | DOM、fetch、MVU 写入、读取宿主全局、弱哈希兜底 |
| `src/ui/types.ts` | 给 `GardenBridge` 增加异步诊断快照方法；必要时用 type-only import | 改 GardenState/schema、扩展消息事务语义 |
| `src/ui/bridge.ts` | host 与 preview bridge 各实现一次安全快照调用；只从已有内存值提取 | 新增 listener、读取聊天楼层、查数据库、写 MVU、改 send/regenerate |
| `src/ui/index.html` | 设置页加入说明、按钮和状态区 | 新页面、弹窗、把诊断塞进 GAL 输入区 |
| `src/ui/app.ts` | 点击事件、禁用态、Blob 下载、object URL 回收、状态提示 | fetch/XHR/sendBeacon、local/sessionStorage、自动上传、自动导出 |
| `src/ui/styles.css` | 最多增加诊断说明／状态的少量样式 | 重做设置页布局或全局主题 |
| `tests/diagnostic-export.test.mjs` | 新建真实源码测试、隐私 canary、尺寸和确定性测试 | 复制一份伪实现到测试里自测自嗨 |
| `tests/ui-contract.test.mjs` | 增加入口和无副作用合同 | 删除或放宽既有断言 |
| `project/gal-diagnostic-export-batch-5-implementation-log.md` | 新建；记录阅读回执、命令、差异、失败与遗留 | 把未执行写成 PASS |

### 4.1 本批禁止触碰的文件／目录

除非停工并交回所有者裁定，不得修改：

```text
src/runtime/ui-host-shell.js
src/ui/gal-generation-request.ts
src/ui/message-transaction.ts
src/ui/character-memory.ts
src/ui/memory-*.ts
src/ui/memory-adapters/**
src/schema/**
src/lorebook/**
scripts/**
package.json
package-lock.json
dist/**
reasonix.toml
.reasonix/**
```

也不得创建依赖、修改版本号、换 checkpoint、构建整卡或上传 R2。

如果你认为必须改上述文件，不要“先改了再解释”。把理由、精确文件、无法绕开的类型错误和最小替代方案写进实施日志，然后停止。

---

## 5. 每一个小任务都必须重复的开工仪式

下面 T00～T06 **每一项开始前都要重新读**，不是第一项读一次后一路冲到底。

每项开始前按顺序执行：

1. 完整阅读 `C:/Users/Administrator/.codex/skills/sillytavern-embedded-ui/SKILL.md`；
2. 完整阅读 `C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md`；
3. 完整阅读 `C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md`；
4. 完整阅读 `C:/Users/Administrator/.codex/skills/sillytavern-dev-db/SKILL.md`；
5. 阅读本手册的 §1、§2、当前任务章节和 §13；
6. 阅读 `project/contract.md`；
7. 阅读 `project/docs-reference-next-implementation-audit.md` §3；
8. 阅读实施日志最后一条，确认前一任务到底做到了哪里；
9. 在实施日志当前任务下写阅读回执，列出以上路径和“本任务没有借 skill 扩大授权”。

注意：`sillytavern-api-reference` 在本批主要用于防止 Agent 猜宿主能力。本文已经裁定不新增宿主 API；如果实现过程中突然想调用 SillyTavern 私有全局、Helper 新函数或数据库 API，必须先停工核验，不能凭印象写。

---

## 6. T00：建立基线与实施日志（只读 + 新建日志）

### 开工前再次阅读

严格执行 §5 的九项阅读，不得引用 T01 的回执代替。

### 目标

确认当前工作区的真实状态，创建日志，但不改业务源码。

### 精确操作

1. 新建 `project/gal-diagnostic-export-batch-5-implementation-log.md`。
2. 日志首页写：日期、任务目标、当前分支／HEAD、工作区不是干净树、基线测试结果、本批禁区。
3. 执行：

```powershell
git status --short
git diff --check
npm run check:ui
npm test
git status --short -- reasonix.toml .reasonix
```

4. 记录真实输出摘要。不要为了得到“干净”而 reset、checkout、stash 或删除别人的改动。
5. 用下列命令确认将要修改的位置：

```powershell
rg -n "gg-view-settings|gg-diagnostics|gg-reload" src/ui/index.html src/ui/app.ts src/ui/styles.css
rg -n "diagnostics\(\)|getTransactionState|pendingRequest|memoryPort" src/ui/bridge.ts src/ui/types.ts
rg -n "visit_memory|active_visit|closed_visits|relationship_memories" src/ui/types.ts src/ui/character-memory.ts
```

### 完成标准

- 只有实施日志是本任务新增文件；
- 基线失败被如实记录，不得先改业务代码消灭失败；
- reasonix 仍无变化。

### 本任务停止线

- `npm run check:ui` 或 `npm test` 与文档基线不同：记录后停止，让验收 Agent 判断是否为既有脏树变化；
- 发现另一个 Agent 正在修改本批目标文件：停止并报告重叠。

---

## 7. T01：先写脱敏核心和攻击性测试（不接 UI、不接 bridge）

### 开工前再次阅读

严格执行 §5；另外重读本手册 §1.2、§2、§3。

### 目标

新建 `src/ui/diagnostic-export.ts` 和 `tests/diagnostic-export.test.mjs`，先证明“坏数据进来，也不会从出口漏出去”。

### 具体实现顺序

1. 在新模块声明 §3 的输出类型、`DiagnosticErrorCode`、输入 DTO 和选项类型。
2. 输入 DTO 可以接收构造摘要所需的当前 state/request/transaction/diagnostics，但函数内部不得把任何输入对象展开进输出。
3. 实现严格固定角色 ID 过滤。角色顺序复用项目当前 registry 的公开顺序；若直接 import 会造成循环，允许在模块内声明只读固定 ID 数组，但测试必须证明陌生 ID 被丢弃。
4. 实现 `createDiagnosticRef(raw, salt)`：
   - `raw` 为 `null`／空字符串时返回 `null`；
   - 使用 `TextEncoder` 编码“固定域分隔符 + 随机盐 + 原值”；
   - 用 `crypto.subtle.digest('SHA-256', bytes)`；
   - 返回 `d_` 加前 12 个十六进制字符；
   - 不把 salt 或 raw 写入返回对象；
   - crypto 不存在时抛出代码固定的安全错误。
5. 实现 `classifyDiagnosticError()`，只能返回 §2.3 枚举。
6. 实现角色记忆计数：
   - 无 `visit_memory` 时仍为固定八角色输出零值；
   - active turn 只计数组长度；
   - closed turn 为各 closed visit `turns.length` 之和；
   - relationship memory 只计数量；
   - active relationship-state 只判断 `kind === 'relationship_state' && active === true`，不导出 label；
   - 所有数字用安全非负整数归一，异常输入归零，不抛出原始数据。
7. 实现异步 `buildDiagnosticSnapshot(input, options?)`：
   - 默认自己生成 16 字节随机盐和当前 ISO 时间；
   - 测试可注入固定 `salt` 与 `capturedAt`，生产调用不得提供固定盐；
   - 对所有 ID 统一走同一个单次导出 pseudonymizer；
   - 只逐字段组装白名单，禁止 `{ ...request }`、`{ ...state }`、`{ ...transaction }`；
   - 不修改输入对象。
8. 实现 `serializeDiagnosticSnapshot(snapshot)`：
   - `JSON.stringify(snapshot, null, 2) + '\n'`；
   - 用 `TextEncoder` 计算 UTF-8 字节；
   - 大于 65,536 bytes 抛出 `diagnostic-size-limit`；
   - 返回字符串，不做 DOM 下载。

### 测试必须使用的 canary

测试输入至少塞入这些独特字符串，并断言最终 `JSON.stringify(snapshot)` 和序列化文本中一个都不存在：

```text
CANARY_PLAYER_INPUT_9f31
CANARY_ASSISTANT_STORY_2a77
CANARY_SYNTHETIC_HISTORY_51dd
CANARY_RELATIONSHIP_KISS_803c
CANARY_PLAYER_NAME_f043
CANARY_GARDEN_NAME_7aa1
CANARY_CHAT_ID_19bc
CANARY_REQUEST_ID_02ef
CANARY_VISIT_ID_d900
https://example.invalid/path?token=CANARY_URL_TOKEN
Bearer CANARY_AUTH_8841
Cookie=CANARY_COOKIE_44cc
R2_SECRET_CANARY_ba12
C:\\Users\\Owner\\secret-chat.json
<div data-private="CANARY_DOM_90ff">
```

### 测试矩阵

`tests/diagnostic-export.test.mjs` 至少覆盖：

1. 固定 salt + 固定时间得到稳定对象；
2. 同一原始 ID 在同一导出中的代号相同；
3. 更换 salt 后代号不同；
4. 原始 ID 与全部 canary 不出现；
5. 旧 fingerprint 不原样出现；
6. 未知角色 ID 不出现，固定角色顺序稳定；
7. active/closed/relationship 数量准确；
8. 原始错误只变成受控 code；
9. 未知错误变 `unknown`，不带原句；
10. 空 state/request/transaction 仍产生合法 JSON；
11. 输入对象在调用前后深相等；
12. crypto 不可用时明确失败，不使用弱兜底；
13. 超过 64 KiB 时明确失败；
14. 正常输出小于等于 64 KiB、末尾只有一个换行并可再次 `JSON.parse`。

测试必须通过 esbuild 或项目现有真实 TS 加载方式导入 `src/ui/diagnostic-export.ts`。不允许在测试文件里重写一份脱敏函数再测试那份副本。

### 本任务命令

```powershell
node --test tests/diagnostic-export.test.mjs
npm run check:ui
git diff --check
git diff --numstat -- src/ui/diagnostic-export.ts tests/diagnostic-export.test.mjs project/gal-diagnostic-export-batch-5-implementation-log.md
```

### 完成标准与强制停点

- 聚焦测试全绿；
- 类型检查全绿；
- 只改本任务三份文件；
- 把测试数、改动行数和任何取舍写入日志；
- **完成后停止，不得直接接 bridge。先交给验收 Agent 看脱敏核心。**

---

## 8. T02：把安全摘要接进 host/preview bridge

### 开工前再次阅读

严格执行 §5；另读：

- `src/ui/bridge.ts` 中 `createHostBridge()` 完整函数；
- `pendingRequest` 的定义、赋值与清空路径；
- `getTransactionState()` 与 `diagnostics()`；
- preview bridge 的完整对象；
- `src/ui/gal-generation-request.ts` 的类型与构造结果，**只读，不修改**；
- `src/ui/memory-adapter-selection.ts` 与 `src/ui/memory-port.ts`，**只读，不修改**。

把以上路径再次写入 T02 阅读回执。

### 目标

给 `GardenBridge` 增加 `buildDiagnosticSnapshot(): Promise<DiagnosticSnapshotV1>`，host 和 preview 都能返回相同 schema。

### 精确改法

1. 在 `src/ui/types.ts` 使用 type-only 方式引用 `DiagnosticSnapshotV1`，给 `GardenBridge` 增加：

```ts
buildDiagnosticSnapshot(): Promise<DiagnosticSnapshotV1>;
```

2. 在 `src/ui/bridge.ts` 导入脱敏构造器。
3. host 实现只能读取当前闭包里已经存在的：
   - 当前已持久化／已读取的 `GardenState`；
   - `transactions.read()`；
   - `pendingRequest`；
   - 当前 diagnostics 安全字段；
   - `memoryPort.profile` 与 `memoryPort.capability`。
4. 不要为了诊断调用 `getChatMessages()`、`getCurrentMessageId()` 全量遍历、数据库 recall/archive、worldbook、DOM 或宿主设置。
5. 若 state 尚未加载，传空安全状态给构造器；不要因此新开一次 MVU 写事务。
6. preview bridge 用 preview state、空 transaction／request 或其本来就有的 fake 安全数据构造，不能硬编码一份与 schema 漂移的手写 JSON。
7. 不允许复用 `diagnostics().lastError` 原文直接进入输出；只能把它交给错误分类器。
8. 不改变现有 `diagnostics()` 对设置页显示的合同；本批只新增导出方法。

### 必补测试

- 在 `tests/diagnostic-export.test.mjs` 或现有合适 bridge 合同测试中证明 host 和 preview 都声明该方法；
- 通过源码合同断言该方法附近没有 `fetch`、XHR、`sendBeacon`、数据库 recall/archive 和 MVU write；
- 测试 pendingRequest 为 null、transaction 为 null 的路径；
- 测试 raw `lastError` 最终只留下错误码。

### 本任务命令

```powershell
node --test tests/diagnostic-export.test.mjs tests/ui-contract.test.mjs tests/transaction-boundaries.test.mjs
npm run check:ui
git diff --check
git diff --numstat -- src/ui/types.ts src/ui/bridge.ts src/ui/diagnostic-export.ts tests/diagnostic-export.test.mjs tests/ui-contract.test.mjs project/gal-diagnostic-export-batch-5-implementation-log.md
```

### 完成标准与强制停点

- host/preview 类型一致；
- 没有新宿主 API；
- 没有数据库读写；
- send/retry/regenerate/stop 相关测试没有变化；
- 日志写清实际读取了哪些现有变量；
- **完成后再次停止，交给验收 Agent 看桥接边界。**

---

## 9. T03：设置页按钮与纯本地下载

### 开工前再次阅读

严格执行 §5；另完整阅读：

- `src/ui/index.html` 的 `#gg-view-settings`；
- `src/ui/app.ts` 的元素绑定区、`renderDiagnostics()` 和设置页事件绑定区；
- `src/ui/styles.css` 的 `.gg-diagnostics` 与现有 button/status 样式。

### 目标

用户能在设置页点击按钮下载 JSON；成功、失败、重复点击和 URL 回收都可验证。

### HTML 精确要求

在现有诊断信息附近增加一个语义分组，包含：

```html
<button id="gg-export-diagnostics" type="button">导出脱敏诊断</button>
<p>仅下载到本机，不包含剧情文本；分享前仍建议人工检查。</p>
<p id="gg-diagnostic-export-status" role="status" aria-live="polite"></p>
```

允许按现有 class 命名补 class，但 ID 和文案含义不得变。不要新增弹窗，也不要把结果 JSON 渲染进 DOM。

### app.ts 精确要求

1. 绑定按钮与状态元素，沿用项目现有的严格元素获取方式。
2. 点击时：
   - 若按钮已 disabled，立即返回；
   - 设 disabled 和 `aria-busy="true"`；
   - 状态区用 `textContent` 显示“正在生成脱敏诊断……”；
   - `await bridge.buildDiagnosticSnapshot()`；
   - 调用 `serializeDiagnosticSnapshot()`；
   - 用 `new Blob([json], { type: 'application/json;charset=utf-8' })`；
   - `URL.createObjectURL(blob)`；
   - 创建临时 `<a>`，设置 `download` 文件名并触发 click；
   - 无论 click 是否成功，都在 `finally` 中 `URL.revokeObjectURL(url)`；
   - 若临时 `<a>` 插入 DOM，必须立即移除；其实无需插入时就不要插入。
3. 成功状态只显示安全信息，例如“诊断文件已下载，请分享前人工检查。”
4. 失败状态只显示受控文案：crypto 不可用、超限或一般失败；不得把 `error.message`、stack、URL 或输入内容直接塞给 `textContent`。
5. `finally` 中恢复 disabled 与 `aria-busy`。
6. 只响应用户主动点击。页面加载、打开设置页、发生错误或 generation 结束时都不得自动导出。

### CSS 要求

优先复用现有按钮和说明样式。只有可读性确实不足时，才给诊断分组／状态加局部 class；本任务 CSS 净新增不超过 30 行，不改颜色系统和全局 button。

### UI 合同测试

在 `tests/ui-contract.test.mjs` 增加至少这些断言：

- HTML 存在两个固定 ID；
- status 有 `role="status"` 和 `aria-live="polite"`；
- app 监听导出按钮 click；
- 调用了 `bridge.buildDiagnosticSnapshot()`；
- 使用 Blob、createObjectURL、revokeObjectURL；
- 失败路径不会把原始 `error.message` 直接显示；
- 导出处理代码没有 fetch、XMLHttpRequest、sendBeacon；
- 导出处理代码没有 localStorage、sessionStorage、writeState、MVU 写入或消息楼层写入。

### 本任务命令

```powershell
node --test tests/diagnostic-export.test.mjs tests/ui-contract.test.mjs
npm run check:ui
git diff --check
git diff --numstat -- src/ui/index.html src/ui/app.ts src/ui/styles.css src/ui/types.ts src/ui/bridge.ts src/ui/diagnostic-export.ts tests/diagnostic-export.test.mjs tests/ui-contract.test.mjs project/gal-diagnostic-export-batch-5-implementation-log.md
```

### 完成标准

- 设置页有唯一入口；
- 双击不并发生成两份；
- object URL 一定回收；
- UI 不显示 raw error；
- 没有网络和持久化副作用。

---

## 10. T04：做“故意塞隐私”的完整回归

### 开工前再次阅读

严格执行 §5；重读本手册 §2 和 T01 canary 列表，并完整阅读当前 `tests/diagnostic-export.test.mjs`。

### 目标

不是补几个漂亮的 happy path，而是主动证明最容易泄漏的路径都被堵住。

### 必做检查

1. 构造一个最大化脏输入：request、state、transaction、runtime error 每处都放不同 canary。
2. 对快照对象做递归键名审计：先按 camelCase、snake_case 和标点拆成语义词段，最终键名不得含独立词段 `text`、`content`、`summary`、`stack`、`cookie`、`token`、`secret`、`row/rows`、`html`。不得用简单 substring 误伤 `contextRef` 里的 `context`。`includesStoryText` 与 `includesDatabaseRows` 是值恒为 `false` 的固定隐私声明，`promptRevision` 是 §3 固定 schema 要求的受控版本字段；测试只可精确豁免这三个键，更不得出现正文、数据库行或 prompt 内容。
3. 对序列化字符串检查 §7 的全部 canary。
4. 检查所有 `*Ref`：只能为 `null` 或匹配 `/^d_[0-9a-f]{12}$/`。
5. 检查输出不存在 32 位旧 fingerprint 原值。
6. 检查没有盐、随机字节或可恢复原值的映射表。
7. 检查固定八角色之外的 ID 被丢弃，而不是被原样作为 object key。
8. 检查运行时版本等允许字段仍存在，确保没有“为了安全导出一张空纸”。
9. 检查 100 次正常构造均小于 64 KiB；测试注入固定时间／salt，避免随机 flaky。
10. 检查序列化不会修改 state、request、transaction。

### 禁止的测试伎俩

- 不得只用正则扫源码就声称运行时对象安全；必须同时运行真实构造器。
- 不得把 canary 从输入删掉后再调用构造器。
- 不得把整个输入先 `JSON.stringify` 后用正则替换；实现必须字段白名单组装。
- 不得 snapshot 一份巨大 JSON 然后人工说“看起来没问题”。

### 本任务命令

```powershell
node --test tests/diagnostic-export.test.mjs tests/ui-contract.test.mjs tests/gal-generation-request-v2.test.mjs tests/message-transaction-v2.test.mjs tests/memory-profile-recall-parity.test.mjs
npm run check:ui
git diff --check
```

### 完成标准

- 所有 canary 运行时断言通过；
- 原有请求、事务、双 profile 同一性测试通过；
- 发现泄漏时先修最小根因，再新增对应回归；不得只改测试字符串绕过。

---

## 11. T05：全量验证与文档交接

### 开工前再次阅读

严格执行 §5；另读 `project/README.md` §2、§3，`project/agent-handoff.md` 顶部和实施日志全文。

### 目标

把结果整理为可供独立验收的当前工作区证据。执行 Agent无权自己宣布封账。

### 精确操作

1. 执行聚焦测试：

```powershell
node --test tests/diagnostic-export.test.mjs tests/ui-contract.test.mjs tests/transaction-boundaries.test.mjs tests/gal-generation-request-v2.test.mjs tests/message-transaction-v2.test.mjs tests/memory-profile-recall-parity.test.mjs
```

2. 执行全量静态门禁：

```powershell
npm run check:ui
npm test
git diff --check
git status --short -- reasonix.toml .reasonix
```

3. 执行范围审计：

```powershell
git diff --name-only
git diff --numstat -- src/ui/diagnostic-export.ts src/ui/types.ts src/ui/bridge.ts src/ui/index.html src/ui/app.ts src/ui/styles.css tests/diagnostic-export.test.mjs tests/ui-contract.test.mjs project/gal-diagnostic-export-batch-5-implementation-log.md
git diff -- src/runtime/ui-host-shell.js src/ui/gal-generation-request.ts src/ui/message-transaction.ts src/ui/character-memory.ts src/ui/memory-port.ts src/ui/memory-adapter-selection.ts package.json package-lock.json reasonix.toml
```

4. 上述最后一条若显示本批之前已有改动，必须结合 T00 基线区分，不能冒充本批新改，也不能擅自回退。
5. 更新实施日志最终汇总：
   - 实际改动文件；
   - 每个命令的真实 pass/fail 和测试数量；
   - 输出 schema 与大小上限；
   - 脱敏 canary 结果；
   - 未做事项；
   - reasonix 零改动证明；
   - 等待独立验收，不写“已封账”。
6. 只有代码与全量门禁都通过后，才允许在 `project/README.md` 导航表把本手册后面补上实施日志链接，并在 `project/agent-handoff.md` 顶部新增“第五批待独立验收”条目。
7. README/交接只能写“静态施工完成、待独立验收”；不得写实机 PASS、发布完成或 R2 已更新。

### 本任务禁止执行

```text
npm run build:ui
npm run build:ui:database
npm run build:ui:test
npm run package:checkpoint:dry
npm run package:checkpoint
npm run publish:ui:test:dry
wrangler ...
任何浏览器探针或真实 SillyTavern 操作
```

用户已经明确本类验收只看代码逻辑；不要自作主张做“时机演示”，更不要拿旧打包数据伪装成本轮证据。

---

## 12. T06：交给独立验收 Agent 的固定清单

### 开工前再次阅读

严格执行 §5。即使 T06 只整理交接，也不能跳过 skill 与计划重读。

执行 Agent 最终只交出下面这些内容：

1. 本手册路径；
2. 实施日志路径；
3. 实际改动文件清单；
4. 聚焦测试命令和结果；
5. `npm run check:ui`、`npm test`、`git diff --check` 结果；
6. canary 泄漏测试结果；
7. 明确声明未打包、未上传、未发布、未探针、未实机、未改 reasonix；
8. 请求独立验收 Agent 重点检查：
   - 是否存在字段白名单之外的展开；
   - 是否有弱哈希兜底；
   - raw error 是否透传；
   - object URL 是否所有路径都回收；
   - 是否读取数据库、聊天楼层或宿主设置；
   - preview/host schema 是否同构；
   - 64 KiB 门禁是否按 UTF-8 字节而非 JS 字符数计算。

执行 Agent 不得提交 git，不得推送，也不得自行把“待验收”改成“通过”。是否提交由所有者或独立验收 Agent 另行裁定。

---

## 13. 总验收标准

### 13.1 功能正确性

- 设置页存在清晰入口和隐私说明；
- 点击后下载可解析的 `gensokyo-diagnostic.v1` JSON；
- host 与 preview 使用同一构造器和 schema；
- 按钮并发受控，成功失败均恢复；
- object URL 一定回收；
- 输出不超过 65,536 UTF-8 bytes。

### 13.2 隐私正确性

- §2.2 黑名单逐项均无泄漏；
- 所有运行时身份只以本次导出 `d_xxxxxxxxxxxx` 代号出现；
- 不输出 salt，不支持跨导出稳定关联；
- 不原样输出旧 fingerprint；
- raw error、stack、URL、路径均不出现；
- 未知错误只为 `unknown`；
- 不读数据库 rows，不读聊天历史，不读 DOM，不读凭据／设置。

### 13.3 无副作用

- 不新增 listener 或 observer；
- 不写 MVU、聊天楼层、swipe、localStorage、sessionStorage；
- 不联网，不自动上传；
- 不改变 send/retry/regenerate/stop 的请求或事务；
- 不改变 standalone-mvu 与 database-assisted 的召回内容；
- 导出失败不影响游戏继续运行。

### 13.4 工程质量

- 核心逻辑集中在 `diagnostic-export.ts`，不是散落在 click handler；
- 生产代码与测试都调用真实实现；
- 全部输入只读，不被构造器修改；
- 类型检查、聚焦测试、全量测试与 `git diff --check` 通过；
- 没有新依赖；
- reasonix 零改动；
- 实施日志真实、逐任务有阅读回执。

### 13.5 直接判失败的情形

出现任一项直接退回：

- 任何剧情、输入、关系 summary 或数据库内容进入导出；
- Base64/FNV/CRC/截断被当成隐私脱敏；
- crypto 不可用时原值或弱哈希兜底；
- `...state`、`...request`、`...transaction` 进入输出对象；
- 把 `error.message` 或 stack 写进 JSON/UI；
- 使用 fetch/XHR/sendBeacon；
- 修改发送、监听、停止、重生成、MVU 结算或记忆召回语义；
- 为了诊断新增宿主事件监听／数据库查询；
- 修改 package、dist、R2、checkpoint 或 reasonix；
- 用旧打包卡、旧探针、preview 截图声称本批代码验收通过；
- 执行 Agent 自行提交、推送或封账。

---

## 14. 工作量预算与超限规则

这是新增小功能，不用假装十几行就能严谨完成，但也不准长成第二个日志平台。

建议净新增预算：

| 部分 | 建议上限 |
|---|---:|
| `src/ui/diagnostic-export.ts` | 280 行 |
| `tests/diagnostic-export.test.mjs` | 320 行 |
| `bridge.ts` + `types.ts` | 100 行 |
| `index.html` + `app.ts` + `styles.css` | 100 行 |
| 不含实施日志的生产与测试合计 | 800 行 |

超过任一单项 25% 时，先在日志解释为什么不能拆小，再交回裁定。不得靠压成难读的一行逃避预算。

明确后置、不要本批顺手做的内容：

- 最近 N 条事件环形日志；
- 一键复制到剪贴板；
- 自动上传工单／R2／GitHub；
- 用户可选“包含正文”；
- 压缩包、加密包、密码分享；
- 实机探针；
- 宿主 branch/checkpoint 存档；
- prompt/injects/临时世界书楼层注入。

---

## 15. 实施日志模板

执行 Agent 新建日志时直接使用下面结构，不要另造一套漂亮但没证据的格式：

```markdown
# GAL 第五批：脱敏诊断导出实施日志

> 状态：施工中／待独立验收（禁止执行 Agent 写“已通过”）
> 基线：npm run check:ui；npm test 654/654
> 禁止：打包、R2、发布、探针、实机、reasonix、git commit/push

## T00 基线
### 阅读回执
- [路径]：读到的本任务约束
### 命令与结果
### 改动文件
### 遗留／停止线

## T01 脱敏核心
### 阅读回执
### 实现摘要
### Canary 结果
### 命令与结果
### 改动文件与 numstat
### 独立验收意见／返修

## T02 Bridge 接入
（同上）

## T03 设置页下载
（同上）

## T04 攻击性回归
（同上）

## T05 全量验证
（同上）

## T06 交接
### 最终改动文件
### PASS/FAIL 汇总
### 明确未执行事项
### 等待独立验收
```

---

## 16. 给执行 Agent 的最后一句话

这批的价值不在于“导出得多”，而在于“足够排错，同时没有把玩家的故事一起打包送人”。如果某个字段让你拿不准是否敏感，默认不导出；先用计数、布尔值、受控枚举或单次导出短代号替代。诊断少一个字段还能补，隐私多漏一段正文可就没那么优雅了。
