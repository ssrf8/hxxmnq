# 幻想乡物语 GAL 角色记忆第四批：双版本与数据库归档/召回实施 Runbook

> **R2 最高优先级改线（2026-08-09）**：主人已撤销“database-assisted 主动归档并查表增强 synthetic history”的生产方向。两种 profile 现在必须使用逐字节相同的卡内 MVU 48 + 12 召回；数据库只作为宿主可选增强独立运行，本卡不读取、不合并、不去重、不依赖其召回。旧 B4-O03、B4-T07、B4-O04、B4-T08 及相关数据库冷归档/召回章节仅保留历史，不再授权执行。新的任务、测试矩阵与停止线以 `project/gal-character-memory-batch-4-database-coexistence-replan.md` 为唯一准绳。

> 文档性质：第四批专用实施计划；给不擅长自行补全设计的执行 agent 使用
> 编写日期：2026-08-09
> 本批主题：独立 MVU 构建、数据库增强构建、幂等归档、按角色召回、数据库故障回退、状态体积与多楼层增长检查
> 当前状态：**R2 IMPLEMENTED / STATIC ACCEPTED；旧数据库主动归档/查表召回路线 SUPERSEDED；后续不得继续旧 O03/T07/O04/T08**
> 验收范围：代码逻辑、构建产物静态合同、自动化测试与体积报告；不要求探针、真实宿主时机演示、R2 发布或整卡打包

---

## 0. 给执行 agent 的第一句话

这批不是“发现 `AutoCardUpdaterAPI` 就多存几条”。

你要交付两份从同一源码构建的能力产物：

1. `standalone-mvu`：完全依赖每角色 MVU 48 条剧情梗概 + 12 条关系记忆；构建产物中不装配、不探测、不调用数据库能力；
2. `database-assisted`：仍以同一份 MVU 48 + 12 为正式状态；允许宿主数据库独立包装 `generate()`，但本卡不主动归档、查表、合并或依赖数据库记忆。

宿主数据库可能额外注入自己的召回，但那是本卡 request 构造之后的外部行为。本卡两种 profile 构造的卡内历史必须完全相同；数据库挂了以后，发送、重生成、停止、结算、入场切分和 MVU 读取必须照常工作。

任何实现只要出现下面一种情况，本批直接不通过：

- 复制两份业务源码分别维护；
- 独立版 bundle 仍包含数据库全局探测或 CRUD 调用路径；
- 数据库结果写回 `stat_data` 充当第二状态源；
- 数据库查询发生在纯请求构造器内部；
- 重生成时重新查库，导致同一冻结请求的历史漂移；
- 数据库写失败撤销 MVU 已完成结算；
- 为了过体积门擅自把每角色 48 或 12 改小；
- 用旧打包卡、旧探针或邻近版本截图冒充当前工作区证据。

---

## 1. 任务标签：哪些是苦力，哪些必须留给主人收口

本 runbook 使用四种标签。执行 agent 必须原样写进实施日志，不得把标签删掉假装都能自己决定。

| 标签 | 含义 | 执行规则 |
|---|---|---|
| `[苦力-机械]` | 规则已经写死，主要工作是建文件、搬接口、补类型、逐项核对 | 执行 agent 可直接完成，但不能改变合同 |
| `[苦力-测试]` | 测试组合多、fixture 多、输出报告长，耗 token 但设计判断少 | 优先交给执行 agent；失败要报告原始证据，不得改阈值求绿 |
| `[主人-裁定]` | 涉及版本身份、物理表、构建隔离或正式边界 | 执行 agent 只能收集证据和做接口壳，到停止线必须停 |
| `[主人-高风险]` | 会碰请求冻结、MVU 提交顺序、归档一致性或跨聊天泄漏 | 由主验收方实现或逐行复核后才能接生产入口 |

### 1.1 建议分工总表

| 任务 | 标签 | 可以交给“苦力 agent”吗 |
|---|---|---|
| B4-T00 基线盘点与 scope lock | `[苦力-机械]` | 可以 |
| B4-O01 双构建配置与产物隔离裁定 | `[主人-裁定]` | 只收集证据，不能自行拍板 |
| B4-T01 profile 类型、参数解析与公共端口 | `[苦力-机械]` | O01 后可以 |
| B4-T02 独立版空适配器与 bundle 禁词门 | `[苦力-机械]` | 可以 |
| B4-O02 数据库 API、物理表和行定位裁定 | `[主人-高风险]` | 只能做源码摘录 |
| B4-T03 两类归档记录的纯 schema/normalizer | `[苦力-机械]` | 可以 |
| B4-T04 稳定键、content hash 与 upsert plan | `[苦力-测试]` | O02 后可以 |
| B4-T05 按角色召回、校验、去重与预算裁剪纯函数 | `[苦力-测试]` | 可以 |
| B4-T06 fake database port 与故障矩阵 | `[苦力-测试]` | 可以 |
| B4-O03 MVU 后置归档顺序与恢复扫描 | `[主人-高风险]` | 不可独立接生产 |
| B4-T07 database-assisted 归档适配器接线 | `[苦力-机械]` | O02/O03 后可以 |
| B4-O04 召回进入冻结请求的时机 | `[主人-高风险]` | 由主验收方收口 |
| B4-T08 所有新发送入口统一接召回准备器 | `[苦力-机械]` | O04 给出精确接口后可以 |
| B4-T09 故障回退、诊断与 profile UI | `[苦力-测试]` | 可以 |
| B4-T10 状态体积测量器 | `[苦力-测试]` | 非常适合，纯苦力 |
| B4-T11 多楼层/多角色/多 swipe 增长 fixture | `[苦力-测试]` | 非常适合，纯苦力 |
| B4-T12 文档、依赖台账与最终命令 | `[苦力-机械]` | 可以 |
| B4-O05 最终代码逻辑验收与封账 | `[主人-高风险]` | 不可以自验自封 |

---

## 2. 批次边界

### 2.1 本批必须完成

- 增加 `standalone-mvu` 与 `database-assisted` 两个显式 memory build profile；
- 两个 profile 使用同一份 MVU schema、事务代码、请求构造器、历史投影器和测试源；
- 拆除 `src/ui/app.ts` 对现有数据库适配器的无条件生产导入；
- 拆除 `src/ui/bridge.ts` 对 `AutoCardUpdaterAPI` 的直接诊断探测；
- 独立版通过构建图和最终 bundle 两层证明“没有数据库路径”；
- 数据库增强版增加故事记忆、关系记忆两个逻辑归档合同；
- 在 MVU 成功提交后 best-effort 幂等归档；
- 增强版启动或安全刷新点对当前 MVU 48 + 12 做有界恢复扫描；
- 每次新请求只按冻结的 `relevantCharacterIds` 召回；
- 召回结果经过 schema 校验、作用域校验、角色校验、稳定 ID 去重、预算裁剪后才能参与合成历史；
- 本地 MVU 同 ID 永远优先，数据库不能覆盖 active visit 或 active relationship state；
- 数据库缺失、抛错、拒绝、返回畸形、返回重复、返回跨作用域数据时，回退结果与独立版基础历史一致；
- 增加状态体积、多角色、多楼层、多 swipe 和重生成增长检查；
- 新增第四批实施日志，按任务记录阅读回执、diff、测试和遗留；
- 单独申请第四批代码逻辑验收。

### 2.2 本批明确不做

- 不设计提示词注入楼层；
- 不把动态规则从现有位置迁到 docs 的楼层注入方式；
- 不新增关系记忆候选的 LLM 输出协议；
- 不伪造尚未产生的 12 条关系记录；只归档正式 `RelationshipMemory`；
- 不改变第三批重生成 feature flag 裁定；
- 不做真实宿主探针、浏览器演示或事件时机结论；
- 不启用当前宿主里 disabled 的数据库脚本；
- 不下载、注入或执行远程数据库脚本；
- 不创建 SQL 服务、Supabase 或其他外部数据库；
- 不发布 R2，不修改生产 manifest，不覆盖正式 UI 名称；
- 不打 checkpoint、JSON 卡或 PNG 卡；
- 不修改 `reasonix`，不提交 `.reasonix/`、`reasonix.toml` 或其产物；
- 不删除 `conversation_log` 兼容读；
- 不实现 same-floor/C8；本项目继续使用正常 message-floor 多楼层 MVU；
- 不为了数据库版把 MVU 48 + 12 缩成缓存壳。

### 2.3 本批完成后仍然成立的事实

- 正式状态源只有 message-floor `stat_data` 下的 MVU 状态；
- 故事热记忆仍为每角色最多 48 条；
- 关系热记忆仍为每角色最多 12 条，其中包含朋友、挚友、恋人等当前关系状态与关键关系事件；
- 关系事件不会自动推导恋人关系、专一或未来同意；
- 数据库只是 `optional` 的宿主能力；
- 数据库召回只是 prompt 候选，不是状态恢复；
- send/retry/regenerate 仍共享 V2 请求合同；
- regenerate 使用原请求已经冻结的 synthetic history，不重新读数据库；
- 两个 profile 的 MVU 存档可以互相读取。

---

## 3. 固定阅读门禁

### 3.1 每一个小任务开始前必须重新完整阅读

执行 agent 不得写“前面读过了”。B4-T00 到 B4-T12 每个任务开始前，实施日志必须逐行写：

```text
[B4-Txx][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/SKILL.md
[B4-Txx][read] C:/Users/Administrator/.codex/skills/code-quality-workflow/references/gate-change-verify.md
[B4-Txx][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/SKILL.md
[B4-Txx][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/card-types-and-runtime-dependencies.md
[B4-Txx][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/variable-systems.md
[B4-Txx][read] C:/Users/Administrator/.codex/skills/tavern-card-builder/references/validation.md
[B4-Txx][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/SKILL.md
[B4-Txx][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/rolecard-data-model.md
[B4-Txx][read] C:/Users/Administrator/.codex/skills/sillytavern-database-rolecards/references/floor-and-ui-binding.md
[B4-Txx][read] C:/Users/Administrator/.codex/skills/sillytavern-api-reference/SKILL.md
[B4-Txx][read] project/gal-character-memory-batch-4-dual-build-and-database-runbook.md（全文）
[B4-Txx][read] project/gal-character-visit-memory-and-synthetic-history-plan.md（§4.6～§4.9、Phase 7、§12.7、§14）
```

缺任意一条阅读回执，本任务不开始。

### 3.2 每个任务按需复读的项目文件

- `project/gal-character-memory-batch-1-data-foundation-runbook.md`：48 + 12、迁移、字段所有权；
- `project/gal-character-memory-batch-1-implementation-log.md`：当前已实现边界；
- `project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md`：相关角色冻结、合成历史预算、V2 请求；
- `project/gal-character-memory-batch-2-implementation-log.md`：第二批返修后的真实结论；
- `project/gal-character-memory-batch-3-regeneration-runbook.md`：冻结请求与重生成不得漂移；
- `project/gal-character-memory-batch-3-implementation-log.md`：第三批当前默认开关和遗留；
- `project/api-provenance.md`：目标版本、Helper 与 `AutoCardUpdaterAPI` 证据；
- `docs/08-历史上下文.md`：只参考场景隔离和历史构造范式，不当成本项目现状；
- `docs/09-外部接口与功能清单.md`：只参考外部能力清点方法；
- `src/ui/database-adapter.ts`、`src/ui/app.ts`、`src/ui/bridge.ts` 全文；
- `src/ui/character-memory.ts`、`src/ui/synthetic-history.ts`、`src/ui/gal-generation-request.ts` 全文；
- `src/ui/types.ts` 中本批相关类型；
- `scripts/build-ui.mjs`、`scripts/package-checkpoint.mjs` 与 `package.json`；
- 本任务对应的测试全文。

### 3.3 阅读不是证据替代品

每个任务日志还必须写：

```text
任务标签：
开始前基线：
允许改动文件：
禁止改动文件：
输入合同：
输出合同：
失败合同：
新增测试：
实际 diff：
执行命令：
原始结果：
未证明事项：
```

禁止只贴一个 “PASS” 或只写测试数量。

---

## 4. 已知事实、未决事实与旧适配器风险

### 4.1 已知静态事实

- 目标运行时身份仍按项目记录：SillyTavern 1.18.0 + Tavern Helper / JS-Slash-Runner 4.8.18；
- `AutoCardUpdaterAPI` 来自可选的 SP·数据库 VII，不是 SillyTavern 核心，也不是本卡内嵌依赖；
- 项目已记录 `queryTableRows`、`insertRow`、`updateRow` 三个方法名；
- 当前目标宿主中的数据库脚本记录为 disabled，不能声称已实机可用；
- 当前 `src/ui/database-adapter.ts` 只同步开局主角和物品，不是本批的记忆归档器；
- 当前 `src/ui/app.ts` 无条件导入并在渲染刷新中调用 `syncOpeningDatabase`；
- 当前 `src/ui/bridge.ts` 直接探测 `AutoCardUpdaterAPI` 生成诊断；
- 当前 `scripts/build-ui.mjs` 只有 UI delivery/channel，没有 memory profile；
- 当前 V2 请求构造是同步纯函数；
- 当前 synthetic history 总预算为每角色 900 字、全局 2800 字；
- 当前数据库没有被证明支持异步取消或真正的抢占式 timeout。

### 4.2 旧适配器不得直接扩写

`src/ui/database-adapter.ts` 目前存在以下风险：

- 自己从 `globalThis/window.parent` 解析全局；
- `app.ts` 无条件装配，因此独立版无法证明零数据库路径；
- 查询结果后直接假定 `rowIndex: 1` 更新主角表；
- 使用模块内 `lastFingerprint`，刷新/重载后不是持久幂等证据；
- 只按内容包含关系查物品，不是稳定主键；
- 没有聊天作用域、角色作用域、schema version 与跨存档隔离；
- 没有为召回设计畸形行、重复行、超量行和跨角色过滤；
- UI 每次刷新都可能触发，调用时机和本批“MVU 后置归档”不一致。

执行 agent 不得在这个函数下面继续堆 `archiveMemory()`。必须先由 O01 拆 profile 装配边界，再由 O02 锁定数据库 CRUD 事实。

### 4.3 规划阶段明确保留的未决事实

以下内容不能凭函数名猜：

1. SP·数据库 VII 当前指定版本的物理表创建/命名约束；
2. `queryTableRows` 是否支持列过滤、排序、分页和返回真实 row index；
3. `insertRow` / `updateRow` 的精确参数、返回值、索引是 0 基还是 1 基；
4. CRUD 是同步、异步还是混合；
5. 调用所在 iframe 是否能看到同一个全局；
6. 表本身是否已经按卡/聊天隔离；
7. 单行与单表长度限制；
8. 同名表不存在时的失败形态；
9. callback 是否有必要；本批默认不依赖 callback。

O02 未把这些事实写入 `project/api-provenance.md` 前，不允许生产 CRUD 接线。

---

## 5. 总体架构：一个业务核心，两个装配根

### 5.1 profile 与 UI channel 是两回事

必须保留两个独立维度：

```text
memory profile:
  standalone-mvu
  database-assisted

UI delivery channel:
  production
  test
```

`production/test` 决定 UI 上传到哪条发布通道；`standalone-mvu/database-assisted` 决定 bundle 是否装配数据库能力。禁止把它们混成：

- “test 就是数据库版”；
- “production 就是独立版”；
- “有数据库的叫 test-r2”；
- “database-assisted 自动占用正式 manifest”。

本批只构建和静态检查，不上传任何组合。

### 5.2 推荐依赖方向

```text
app / bridge / generation coordinator
                |
                v
       MemoryArchiveRecallPort
          /             \
         v               v
standalone no-op     database-assisted adapter
                            |
                            v
                  host AutoCardUpdaterAPI
```

公共业务代码只依赖 `MemoryArchiveRecallPort`，不得直接读取 `globalThis.AutoCardUpdaterAPI`。

建议端口至少包含：

```ts
type MemoryProfile = 'standalone-mvu' | 'database-assisted';

interface MemoryArchiveRecallPort {
  readonly profile: MemoryProfile;
  readonly capability: 'disabled-by-build' | 'available' | 'unavailable';
  recall(input: RecallInput): Promise<RecallResult>;
  archive(input: ArchiveInput): Promise<ArchiveResult>;
}
```

这里是语义草图，不是授权猜测数据库 API。最终参数名可按项目风格调整，但必须保留：显式 profile、显式结果、无 throw 穿透、无 MVU 写入。

### 5.3 构建期装配，不是运行时偷偷切换

两个 profile 必须由构建参数选择不同 adapter 模块，允许做法：

- esbuild alias/plugin 把固定端口模块映射到 no-op 或 database adapter；
- 两个很薄的 entrypoint 分别导入同一 app bootstrap 与不同 adapter；
- 由受控生成文件提供静态 import，但生成文件不可提交为第二份业务源码。

禁止做法：

- 在共同 bundle 里 `if (profile === 'standalone')` 后仍 import 数据库 adapter；
- 在独立版启动时 `typeof AutoCardUpdaterAPI` 再决定不用；
- 用 URL 参数、本地变量、MVU 字段或模型输出切换 profile；
- 复制 `app-standalone.ts` 和 `app-database.ts` 两份完整 app；
- 用 tree-shaking “应该删掉了”代替 bundle 内容检查。

#### 5.3.1 O01 最终裁定：使用受控 esbuild resolve plugin

O01 已于 2026-08-09 由主验收方裁定，执行 agent 不再三选一：

- CLI 参数固定为 `--memory-profile=standalone-mvu|database-assisted`；
- 参数缺失、空值或出现第三种值一律构建失败；
- `package.json` 中所有调用 `build-ui.mjs` 的脚本都必须显式传 profile；
- 使用一个稳定的 profile selection import + 受控 esbuild resolve plugin，把它映射到 standalone no-op adapter 或 database-assisted adapter；
- 普通 TypeScript 检查必须能够同时检查公共端口和两个 adapter；不能靠让 database adapter 逃出 `tsconfig` 来获得绿灯；
- 不采用两份完整 app entrypoint，不生成第二份业务源码，不通过运行时条件分支选 profile；
- compile-time profile 是构建输入，不写入 MVU，也不允许 URL、localStorage、玩家文本或模型输出修改。

实现时必须给 selection import 一个唯一稳定身份。可以使用项目内约定模块或 esbuild plugin namespace，但必须满足：

1. source 侧只有一条公共 port import；
2. plugin 只对这一条精确 import 生效；
3. 未命中、重复命中或解析到 profile 目录之外时构建失败；
4. standalone import graph 不可达 database adapter；
5. database-assisted import graph 明确可达且 build report 记录 adapter identity。

不得用宽泛正则重写所有 `database` 字样，也不得用字符串替换编译后的 `app.js` 删除调用。

#### 5.3.2 raw host shell 也属于 profile 装配

`src/runtime/ui-host-shell.js` 不是 esbuild app bundle 的一部分，而是由 `build-ui.mjs` 读取后原样拼进 `ui-mount.js`。因此只隔离 `app.ts` 不够。

最终裁定：

- 在 host shell 中为数据库桥接块增加唯一的开始/结束哨兵；
- 哨兵内部只包含 `AutoCardUpdaterAPI` 向子 iframe 的暴露代码；
- `database-assisted` 构建保留该块；
- `standalone-mvu` 构建在拼接 mount 前移除整个块；
- guarded transform 必须确认开始/结束哨兵各恰好一次，缺失、重复或嵌套异常立即失败；
- 禁止只把 getter 改成返回 `undefined`，因为独立版合同要求最终 executable mount 中不存在该符号与路径；
- 禁止修改 Mvu、Tavern Helper、SillyTavern 等其他宿主桥接；
- standalone 与 database-assisted 各自扫描最终 `ui-mount.js`，不能只扫描 `app.js`。

这是 O01 的硬修订，不得留到 O02。O02 决定 CRUD 事实，O01 已经决定宿主能力是否进入产物。

### 5.4 产物隔离合同

O01 已锁定本地输出目录。主 app 中间产物和最终 runtime 产物都必须隔离：

```text
dist/ui/profiles/standalone-mvu/app.js
dist/ui/profiles/standalone-mvu/app.js.map
dist/ui/profiles/database-assisted/app.js
dist/ui/profiles/database-assisted/app.js.map

dist/runtime/profiles/standalone-mvu/
dist/runtime/profiles/database-assisted/
dist/runtime/test/profiles/standalone-mvu/
dist/runtime/test/profiles/database-assisted/
```

`dist/ui/app.js` 不再作为两个 profile 的公共可覆盖中间产物。构建器必须从本次 profile 对应的 `dist/ui/profiles/<profile>/app.js` 读取 app 内容。预览工具、校准工具若与 memory profile 无关，可以保留独立公共输出，但不得反向 import 选中 adapter。

最终必须满足：

- 两个 memory profile 输出目录不同；
- test/production 通道仍不同；
- 图片、音频、地图等共享 asset manifest，不复制资源；
- JS/loader/manifest 不能互相覆盖；
- 本批命令不会写正式 R2 路径；
- 文件名或报告中可直接看出 memory profile；
- 构建报告记录 profile、channel、sha256、bytes 与 adapter identity。

碰撞策略：

- 同一 profile、同一不可变 version、内容相同：允许只读复用；
- 同一 profile、同一不可变 version、内容不同：构建失败；
- 不同 profile：永远不能指向同一 JS、loader、manifest 或 report 文件；
- 不允许先写公共 `dist/ui/app.js` 再复制，因为并发/失败构建会留下交叉污染窗口；
- 本批不发布，因此不得因目录已经规划就调用 `publish-ui.mjs`。

#### 5.4.1 profile-specific manifest 坐标裁定

UI channel 与 memory profile 组成二维坐标。未来远程 UI manifest 固定预留为：

```text
production + standalone-mvu:
  gensokyo-moving-garden/live/ui/profiles/standalone-mvu/ui-manifest.json

production + database-assisted:
  gensokyo-moving-garden/live/ui/profiles/database-assisted/ui-manifest.json

test + standalone-mvu:
  gensokyo-moving-garden/test/ui/profiles/standalone-mvu/ui-manifest.json

test + database-assisted:
  gensokyo-moving-garden/test/ui/profiles/database-assisted/ui-manifest.json
```

约束：

- 不覆盖现有 `live/ui/ui-manifest.json` 与 `test/ui/ui-manifest.json`；
- 本批 loader 可以生成并指向上述坐标，但不得上传；
- profile-specific manifest 只管理 UI JS/loader 版本，不复制图片资源；
- 图片、音频、地图继续共用 `gensokyo-moving-garden/live/manifest.json`；
- profile 不得改变 asset key、hash 或资源 base URL；
- 后续真正发布前仍需单独走 R2 测试通道/正式通道验收，本裁定不是发布授权。

### 5.5 独立版的零数据库证明

独立版不是“没调用到”，而是“不存在调用路径”。至少三层门：

1. import graph：standalone entry 不可到达 database adapter；
2. app bundle scan：profile-specific `app.js` 不得包含以下运行时符号/物理表名；
3. mount bundle scan：拼入 raw host shell 后的最终 `ui-mount.js` 仍不得包含以下运行时符号/物理表名；

```text
AutoCardUpdaterAPI
queryTableRows
insertRow
updateRow
registerTableUpdateCallback
unregisterTableUpdateCallback
```

4. fake global 测试：即使测试环境放置一个每次访问都抛错的 `AutoCardUpdaterAPI` getter，独立版启动、发送准备和诊断也不能触碰它。

如果 source map 因源码文本包含禁词导致扫描误报，分别扫描 executable JS 与 source map；不得干脆关闭所有审计。

---

## 6. 数据所有权与数据库记录合同

### 6.1 唯一权威规则

| 数据 | 唯一写入者 | 数据库权限 |
|---|---|---|
| `active_visit` / `closed_visits` | Bridge presence/visit lifecycle | 只接收归档副本，不得回写 |
| `VisitTurn` | 已接受回复提交器 | 只归档/召回旧候选 |
| `RelationshipMemory` | Bridge 对正式候选的提交器 | 只归档/召回旧候选 |
| active relationship state | 当前 MVU 记录 | 数据库旧行不得覆盖 |
| `relevantCharacterIds` | V2 请求创建阶段 | 只读查询过滤条件 |
| synthetic history | 纯投影器 | 只能接收已校验候选 |
| archive/recall diagnostics | UI 内存 | 不写进剧情事实 |

数据库 adapter 不拥有任何 `stat_data` 字段。

### 6.2 必须增加 archive scope

主计划已有逻辑字段，但实现时必须额外锁定一个不含秘密、由宿主/卡稳定身份派生的 `archive_scope_id`。它至少防止：

- 不同聊天串库；
- 同一卡的新存档误召回旧存档；
- 不同玩家档案互相召回；
- 另一张卡恰好使用相同 `character_id` 时串库。

禁止使用：

- 玩家自然语言昵称；
- assistant 正文；
- `Date.now()`；
- 随机 UUID；
- 当前 message ID 单独作为长期作用域；
- 数据库返回的 scope 反向决定当前 scope。

O02 必须从现有宿主可稳定读取的卡/聊天身份中裁定具体算法。无法取得稳定作用域就停止 database recall，不得降级成全表按角色名查询。

### 6.3 故事归档逻辑记录

逻辑字段至少包括：

```text
archive_schema_version
archive_key
archive_scope_id
memory_id / turn_id
character_id
visit_id
request_id
scene_id
day
time_period
period_serial
summary
source_revision
content_hash
```

规则：

- `memory_id` 采用正式 VisitTurn 的稳定 ID；现状等价于 `requestId:characterId`；
- `archive_key` 必须由 scope + record kind + stable memory ID 确定性生成；
- `content_hash` 只判断内容是否变化，不能充当身份；
- summary 重新走本地 160 字符上限校验；
- 不存玩家原文、完整 assistant 正文、协议标签或完整 prompt；
- 未绑定正式 visit 的记录不归档；
- pending/failed/stopped attempt 不归档。

### 6.4 关系归档逻辑记录

逻辑字段至少包括：

```text
archive_schema_version
archive_key
archive_scope_id
relationship_memory_id
character_id
visit_id
request_id
kind
relationship_label
event_kind
day
time_period
period_serial
summary
significance
active
source_revision
content_hash
```

规则：

- 只接受正式 `RelationshipMemory`；
- 不读取或归档短生命周期 candidate inbox；
- 不因数据库存在 `lover` 就修改当前 MVU；
- `kiss`、`adult_intimacy` 等仍只是事件，不能在归档/召回层推导关系；
- 同角色最多一条 active relationship state 的约束由 MVU 正式状态负责；数据库召回只展示历史依据；
- 亲密只保留关系层面的中性摘要，不归档露骨正文。

### 6.5 schema version 与未知字段

- 写入固定的 archive schema version；
- 读取只接受显式支持的版本；
- 新版本 normalizer 可以保留已知安全字段，不得把整行未知对象塞进 prompt；
- 未知字段不构成拒绝整行的唯一理由，但未知/缺失必填字段必须拒绝该行；
- 不在本批做破坏性数据库迁移；
- 如需物理列改名，另写幂等 migration 计划，不允许在 UI 刷新中批量改表。

---

## 7. 幂等归档算法

### 7.1 正确提交顺序

唯一允许的主顺序：

```text
模型结果被接受
  -> 本地 settlement 候选计算
  -> 指定 assistant swipe/message 的 MVU 成功提交并精确复读
  -> lifecycle 标为 settled
  -> 从已提交最终 MVU 提取可归档记录
  -> database-assisted best-effort archive
  -> 只更新 UI 内存诊断
```

禁止：

- 在 MVU 提交前写数据库；
- 数据库写成功后才允许 MVU 提交；
- 数据库失败把 settled 改回 pending；
- archive promise 未完成就一直锁住 GAL；
- 用原模型输出直接生成归档行；
- 归档器自己重算 relationship state。

### 7.2 upsert plan

对每个稳定 `archive_key`：

1. 按 O02 已核验的 API 做有界精确查询；
2. 0 行：允许 `insertRow` 一次；
3. 1 行且 content hash 相同：`skipped-unchanged`，不 update；
4. 1 行但内容变化：只在能证明真实物理行定位时 `updateRow`；
5. 多于 1 行：不得继续 insert；选择可证明的 canonical 行更新或全部只读并返回 `duplicate-detected`；
6. 没有可靠 row index：禁止猜 `rowIndex: 1`，返回 `unsafe-row-identity`；
7. 任一步异常：捕获为诊断，不向 MVU 事务抛出。

`content_hash` 输入必须使用稳定字段序列化，不得依赖对象属性偶然顺序。

### 7.3 恢复扫描

database-assisted 需要一个有界 reconciliation 扫描，补偿刷新、短暂断线或首次从 standalone 切换的情况：

- 输入只来自当前 MVU 每角色已保存的 48 + 12；
- 每个稳定 ID 仍走同一 upsert plan；
- 不扫真实聊天正文；
- 不把数据库冷数据重新塞回 MVU；
- 同一 UI 生命周期内用内存去重减少重复调用，但内存去重不是幂等依据；
- 刷新后重复扫描必须安全；
- 扫描有最大并发数和最大单批数；
- 扫描失败不阻断 UI；
- 长期数据库故障期间，已经从 MVU 48/12 滑出窗口且从未成功归档的记录可能丢失，这属于明确的 best-effort 边界，禁止谎称“绝不丢”。

本批不在 `stat_data` 新增长期 outbox。若以后要求断库期间绝不丢冷归档，需要另立批次设计持久 outbox 及体积预算。

### 7.4 重生成幂等

- 同一逻辑 turn 的 `memory_id` 不变；
- 新 swipe 成为接受结果后，归档行按相同 key 更新 content hash 与摘要；
- 不允许 append 第二行；
- 切换旧 swipe 只读该 swipe 的 MVU，不触发新归档结算；
- regenerate 请求使用原冻结历史，不能因归档更新而重新召回；
- 恢复扫描遇到旧/新内容时以当前正式 MVU 为本地权威，但必须先通过 commit/revision 守卫。

---

## 8. 按角色召回与合成历史

### 8.1 查询输入只能来自冻结请求

召回输入：

```ts
interface RecallInput {
  archiveScopeId: string;
  relevantCharacterIds: readonly string[];
  localMemory: CharacterVisitMemoryState;
  requestId: string;
}
```

硬规则：

- `relevantCharacterIds` 来自新请求的结构化选择结果；
- 允许空数组；空数组时零数据库调用；
- 最大角色数沿用 V2 相关角色门，不因数据库扩大；
- 不扫描正文角色名；
- 不使用 owner/card 角色伪造相关角色；
- 不允许“先全表查出来再让 LLM 判断相关”；
- 查询必须同时绑定当前 `archive_scope_id` 与单个/有界角色 ID。

### 8.2 请求冻结时机

普通新发送允许：

```text
读取当前 MVU快照
  -> 确定 relevantCharacterIds + visitIdsByCharacter
  -> database-assisted 有界召回
  -> 校验/去重/裁剪
  -> 纯函数构造完整 synthetic history
  -> 创建 GalGenerationRequestV2
  -> 把完整历史冻结进玩家楼层 metadata
  -> generate
```

重试/重生成必须：

```text
读取原玩家楼层冻结的 GalGenerationRequestV2
  -> 直接复用其 synthetic history
  -> 零数据库查询
```

因此，不允许让 `buildGalGenerationRequestV2()` 自己调用数据库。O04 应增加一个异步“请求准备层”，然后继续调用现有纯 builder。

### 8.3 召回校验管线

数据库行必须依次经过：

1. 外层返回结构校验；
2. archive schema version 白名单；
3. `archive_scope_id` 精确相等；
4. `character_id` 属于冻结 relevant set；
5. stable ID、visit ID、request ID 格式与长度校验；
6. day/time/period、kind、label、event kind 枚举校验；
7. summary 清洗与 160 字符截断；
8. 同 archive key 去重；
9. 与本地 MVU stable ID 去重，本地获胜；
10. 排序与预算裁剪；
11. 转成内部 `SyntheticHistoryCandidate`；
12. 由现有投影器统一渲染。

禁止把 `Object.values(row).join()` 或 `JSON.stringify(rows)` 直接拼进 prompt。

### 8.4 去重和优先级

同一 stable ID：

```text
当前 MVU正式记录 > 数据库记录
```

不同记录的保留优先级：

```text
本次 active visit 最新回合
  > 当前 active relationship_state
  > 本地重要关系事件
  > 本地最近 closed visit
  > 数据库 significance=3 关系事件
  > 数据库较新的故事归档
  > 更旧的普通数据库归档
```

数据库旧 `active=true` 不能覆盖当前 MVU 已经变更或取消的 relationship state。对于数据库历史状态，投影必须表达“过去曾为”，不能表达“当前仍为”。

### 8.5 预算

本批不得扩大已有 prompt 总预算：

- 每角色投影总量仍不超过 900 字；
- 所有角色 synthetic history 仍不超过 2800 字；
- 当前输入、动态规则、本次 active visit 最新回合不因数据库召回被挤掉；
- 数据库候选只吃剩余历史预算；
- 每角色进入 normalizer 前的数据库候选数量必须有硬上限；初始测试建议故事 24、关系 12，最终值由 O04 结合物理查询能力锁定；
- 原始数据库返回必须有行数和字符串字节上限，超量部分拒绝或截断，不得先完整 stringify；
- 召回来源在内部结构标记 `database-archive`；模型可见文本只需标“更早归档”，不得泄漏表名、row index、API 错误或诊断。

### 8.6 回退必须字节稳定

对于相同 MVU、相同输入、相同冻结相关角色：

- standalone 产出基础 synthetic history `H`；
- database-assisted 在 API 缺失、查询异常、超时、全部行非法或全部重复时，也必须产出同一个 `H`；
- 只有存在合法且预算允许的冷归档候选时，增强版才允许产出 `H + D`；
- `D` 不得改变 `H` 内记录的内容、顺序、关系状态或 ID；
- fallback 不能切回真实聊天历史。

测试必须对字符串做 `strictEqual`，不能只看“意思差不多”。

---

## 9. 数据库故障模型

### 9.1 必测故障

| 故障 | 召回行为 | 归档行为 | 核心 GAL |
|---|---|---|---|
| profile 为 standalone | 零调用 | 零调用 | 正常 |
| 全局不存在 | 返回空候选 | `unavailable` | 正常 |
| 跨 iframe 访问抛错 | 返回空候选 | `unavailable` | 正常 |
| 方法缺失 | 返回空候选 | `unsupported` | 正常 |
| query 抛错 | 返回空候选 | 不 insert/update | 正常 |
| query 返回 null/畸形 | 返回空候选 | 不盲写 | 正常 |
| insert 返回 false/reject | 不影响已冻结请求 | `failed` | 正常 |
| update 返回 false/reject | 不影响已冻结请求 | `failed` | 正常 |
| 重复行 | 去重 | 不再 insert | 正常 |
| 跨 scope 行 | 拒绝 | 不触碰 | 正常 |
| 非 relevant 角色行 | 拒绝 | 不触碰 | 正常 |
| 旧 schema 行 | 拒绝/显式兼容 | 不自动迁移 | 正常 |
| 超长 summary | 截断/拒绝 | 写入前规范化 | 正常 |
| 超量行 | 有界裁剪 | 有界批次 | 正常 |
| 延迟 Promise | 到可证明 timeout 后回退 | 后台失败诊断 | 正常 |
| 同步函数长时间阻塞 | 静态 timeout 无法抢占 | 记录为未解决运行时风险 | 不得谎称已解决 |

### 9.2 timeout 的准确含义

- 如果核验后的 API 返回 Promise，可以在请求准备层做有界等待；
- timeout 后返回 standalone 基础历史，迟到结果不得修改已冻结 request；
- 迟到 promise 必须被吸收，避免 unhandled rejection；
- `Promise.race` 不能中断同步阻塞函数；
- 若目标 API 的 query 是同步调用，本批只能限制调用次数、查询范围与结果量，不能声称具备抢占式 timeout；
- O02 必须在 provenance 中写清这一点；
- 不允许用 Web Worker 包装一个无法在 worker realm 访问的宿主全局来假装可取消。

### 9.3 诊断

诊断至少区分：

```text
disabled-by-build
unavailable
ready
recall-empty
recall-partial
recall-failed
archive-synced
archive-skipped-unchanged
archive-duplicate-detected
archive-failed
unsafe-row-identity
```

诊断只存 UI 内存或当前可丢失的显示状态，不写入 MVU 剧情字段，不放进 prompt，不包含正文、玩家输入、数据库整行或秘密。

---

## 10. 详细任务拆分

## B4-T00：基线盘点与 scope lock

### 任务性质

`[苦力-机械]`

### 必须做

1. 记录 `git status --short`，明确所有既有改动属于用户；
2. 记录第四批开始前 focused tests、全量 tests、`tsc --noEmit` 结果；
3. 列出所有数据库符号的生产引用和测试引用；
4. 列出 build/package/publish 参数和输出目录；
5. 列出所有 `buildGalGenerationRequestV2` 生产调用点；
6. 列出 settlement 成功后的唯一接线候选点；
7. 记录当前 bundle 中数据库禁词的命中位置；
8. 创建 `project/gal-character-memory-batch-4-implementation-log.md`；
9. 写“不改 reasonix、不提交、不发布、不探针”的 scope lock。

### 禁止

- 不修代码；
- 不格式化全仓库；
- 不删除旧 adapter；
- 不运行打包或发布；
- 不用旧 dist 作为新基线，必须重新构建到隔离临时/第四批输出路径后再测。

### 完成门

- 引用点和构建点清单完整；
- 基线失败如实记录；
- 没有工作区既有文件被覆盖。

---

## B4-O01：双构建配置与产物隔离裁定

### 任务性质

`[主人-裁定]`

### 必须裁定

- memory profile 的 CLI 参数名与合法值；
- 无参数是报错还是仅本地开发默认 standalone；
- esbuild 用 alias、薄 entrypoint 还是受控生成模块；
- production/test × 两个 profile 的输出目录；
- build report 与 loader 如何携带 profile；
- 当前开局数据库同步属于 database-assisted 还是延后；
- package scripts 如何显式列出两个 profile；
- 未来 R2 manifest 如何避免互相覆盖，但本批不执行发布。

### 最终裁定（2026-08-09，APPROVED WITH FIXED CONTRACT）

- 参数固定为 `--memory-profile=standalone-mvu|database-assisted`；缺失/非法值报错；
- 所有 package scripts 显式传值；现有 `build:ui` 显式选择 standalone，不保留隐式 profile；
- 装配方式固定为受控 esbuild resolve plugin + 唯一 selection import；
- profile-specific app 输出固定进入 `dist/ui/profiles/<profile>/`；
- runtime 输出固定使用 `dist/runtime[/test]/profiles/<profile>/`；
- raw `ui-host-shell.js` 的数据库桥接使用唯一哨兵做 guarded build-time 保留/删除；
- standalone 的最终 app.js 与 ui-mount.js 均必须禁词为零；
- database-assisted 必须保留数据库桥且报告 adapter identity；
- 现有开局数据库同步只允许装配在 database-assisted；
- build report 增加 `memory_profile`、`memory_adapter`、channel、sha256、bytes；
- 远程 manifest 使用 channel × profile 二维固定坐标，不覆盖现有正式/测试 manifest；
- 图片、音频、地图继续共用正式 asset manifest，不复制；
- 本裁定只授权 B4-T01/T02 所需的本地构建配置与测试，不授权 R2、打包、发布或数据库 CRUD。

详细路径、guard 与碰撞规则以 §5.3.1、§5.3.2、§5.4、§5.4.1 为准。

### 停止线

O01 已批准。执行 agent 可以开始 B4-T01；但只能实施上述固定合同。若 resolve plugin 无法精确命中、host-shell guard 不是恰好一次、任一 profile 仍写公共 app.js、或 standalone 最终 mount 命中禁词，立即停止并回报，不得自行换成运行时分支。

---

## B4-T01：profile 类型、参数解析与公共端口

### 任务性质

`[苦力-机械]`

### 前置条件

O01 已批准。

### 必须实现

- `MemoryProfile` 枚举/联合类型；
- 严格 CLI parser，拒绝未知 profile；
- 公共 `MemoryArchiveRecallPort`；
- profile-specific adapter 装配根；
- build report 写 profile；
- package scripts 显式 profile；
- 不复制 app/bridge/synthetic-history 业务代码。

### 必测

- 两个合法值；
- 缺值策略；
- 错拼、空值、第三个值拒绝；
- profile 与 UI channel 独立组合；
- 输出目录不重叠；
- 同次构建不会覆盖另一个 profile 文件。

### 文件预算

优先新增小型 profile/port 文件并小改 build script。若需要复制超过 30 行业务逻辑，停止并回 O01。

---

## B4-T02：独立版 no-op adapter 与 bundle 禁词门

### 任务性质

`[苦力-机械]`

### 必须实现

- standalone no-op adapter；
- `recall()` 返回空候选和 `disabled-by-build`；
- `archive()` 返回 skipped，不触碰宿主全局；
- UI 诊断显示“独立 MVU 版：数据库能力未装配”，而不是“数据库故障”；
- `app.ts`、`bridge.ts` 不直接出现数据库全局；
- import graph 与 bundle scan 测试。

### 必测

- 带抛错 getter 的 fake `AutoCardUpdaterAPI` 零访问；
- send 请求基础历史与改动前一致；
- regenerate 零数据库调用；
- bundle 禁词全为零；
- standalone 不包含记忆物理表名；
- profile 诊断不会进入 MVU 或 prompt。

### 停止线

如果必须把 database adapter 一起打包才能启动，说明 O01 架构错误，不得放宽禁词门。

---

## B4-O02：数据库 API、物理表与行定位裁定

### 任务性质

`[主人-高风险]`

### 执行 agent 可做的苦力

- 从用户指定的 SP·数据库 VII 版本源码摘录 `queryTableRows`、`insertRow`、`updateRow`、`exportTableAsJson` 的精确签名；
- 摘录表名、列名、过滤、排序、分页、row index 与返回值证据；
- 标记同步/异步；
- 记录全局装配 realm；
- 把来源、版本、路径/commit、confidence 写入 `project/api-provenance.md` 草稿。

### 主验收方必须裁定

- 故事/关系物理表名；
- 每个逻辑字段到物理列的映射；
- `archive_scope_id` 来源和格式；
- 查询是否能在数据库侧按 scope + character + key 过滤；
- 安全 row identity 如何取得；
- 无表/缺列时是 unavailable 还是需要用户预建；
- query 上限与 recall timeout 能否真实成立；
- 现有开局主角/物品同步是否继续保留。

### 必须产出

一张精确映射表：

| 逻辑操作 | 精确 symbol | 参数 | 返回 | 同步/异步 | 版本证据 | 失败形态 | 实现许可 |
|---|---|---|---|---|---|---|---|

以及两张逻辑字段 → 物理列映射表。

### 停止线

以下任一项不明，禁止写生产 upsert：

- 物理表；
- stable key 列；
- 精确过滤；
- row identity；
- update 参数；
- 作用域隔离。

### 主验收方最终裁定（2026-08-09，APPROVED WITH PRE-T03 REPAIR）

本裁定仅批准数据库归档/召回的静态合同和 B4-T03～T06 的纯函数、fake-port 工作；不批准生产 CRUD 接线、真实宿主 PASS、R2 上传或卡片打包。执行 agent 必须先完成下方 `B4-T02-R1`，再开始 T03。

#### B4-T02-R1：构建报告验证门返修（先修，后继续）

当前 `tests/memory-profile-build.test.mjs` 读取了错误的报告路径，并用 `.catch(() => null)` + `if (report)` 把“报告不存在”静默放行；这条断言当前是空门。必须修成：

1. 测试自行在 fresh 输出上构建两个 profile，不依赖工作区旧 `dist`；
2. 报告缺失、JSON 无法解析、profile/adapter/channel/hash 任一缺失或错误都立即失败，不允许 catch 后跳过；
3. 每次 profile 构建均在对应 `dist/runtime[/test]/profiles/<profile>/ui-build-report.json` 写报告；embedded 构建允许远程 manifest/version 字段为 `null`，但 `memory_profile`、`memory_adapter`、`ui_channel`、`output`、`bytes`、`sha256` 必须存在；
4. standalone 报告只能指向 standalone 产物，database-assisted 同理；两个报告路径和 sha256 均不得相互覆盖；
5. 返修后重跑 focused tests、`npm run check:ui`、`npm test` 与 `git diff --check`，把原始结果写入实施日志。

**返修验收结果（2026-08-09，APPROVED）：**

- `scripts/build-ui.mjs` 已把报告出口移到 embedded/remote 公共尾部；production/test、standalone/database-assisted 均固定写入自己的 profile 目录；
- embedded 报告对不适用的 `ui_version`、manifest、versioned output、loader output 明确写 `null`，不伪造远程坐标；
- 测试会先精确删除两个 generated report，再现场构建两个 profile；报告缺失、JSON 损坏、profile/adapter/channel/path/bytes/hash 错误均直接失败；
- focused 19/19、`npm run check:ui`、全量 590/590 与 `git diff --check` 均通过；
- 两个 remote test profile 也实际重建成功，报告分别落入 `dist/runtime/test/profiles/<profile>/`，未上传、未发布。

B4-T02-R1 已解除 T03 前置阻塞，不得再次把报告断言改成可选检查。

#### 物理表与建表责任

数据库增强版使用两张**由用户选中的 SP·数据库 VII 模板/预设预先创建**的表；本卡 adapter 不创建表、不执行 DDL、不用 raw SQL 改表：

| 用途 | SP 中文表名 | DDL 英文表名 |
|---|---|---|
| 剧情记忆归档 | `GAL剧情记忆归档表` | `gal_story_memory_archive` |
| 关系记忆归档 | `GAL关系记忆归档表` | `gal_relationship_memory_archive` |

表不存在、同名表不唯一、缺列或 schema version 不支持时，数据库能力返回结构化 `unavailable`/`unsupported-schema`，随即回退 standalone MVU 48+12；不得临时建表，不得查询别的相似表凑数。第四批只需提交可机检的 schema/DDL fixture 与配置说明，不导入、不发布数据库预设。

#### 固定字段映射

所有 CRUD 参数一律使用下列英文列名。`row_id` 由数据库维护，写入时不得提供。

故事表：

| 逻辑字段 | 物理列 | 约束 |
|---|---|---|
| schema version | `archive_schema_version` | 固定 `gal-memory-archive.v1`，NOT NULL |
| 幂等键 | `archive_key` | NOT NULL、UNIQUE |
| 卡片/聊天作用域 | `archive_scope_id` | NOT NULL |
| 记忆稳定 ID | `memory_id` | NOT NULL |
| 角色 ID | `character_id` | NOT NULL |
| 入场 ID | `visit_id` | NOT NULL |
| 请求 ID | `request_id` | NOT NULL |
| 场景 ID | `scene_id` | nullable |
| 日期 | `day` | nullable TEXT，number 先确定性转字符串 |
| 时段 | `time_period` | nullable |
| 时段序号 | `period_serial` | nullable INTEGER |
| 梗概 | `summary` | NOT NULL，禁止完整正文 |
| 来源修订 | `source_revision` | NOT NULL |
| 内容指纹 | `content_hash` | NOT NULL |

关系表：

| 逻辑字段 | 物理列 | 约束 |
|---|---|---|
| schema version | `archive_schema_version` | 固定 `gal-memory-archive.v1`，NOT NULL |
| 幂等键 | `archive_key` | NOT NULL、UNIQUE |
| 卡片/聊天作用域 | `archive_scope_id` | NOT NULL |
| 关系记忆稳定 ID | `relationship_memory_id` | NOT NULL |
| 角色 ID | `character_id` | NOT NULL |
| 入场 ID | `visit_id` | nullable |
| 请求 ID | `request_id` | NOT NULL（迁移记录可为空字符串，不可缺列） |
| 类型 | `kind` | NOT NULL |
| 关系标签 | `relationship_label` | nullable；只是事件记录，不反推 active state |
| 事件类型 | `event_kind` | nullable |
| 日期 | `day` | nullable TEXT |
| 时段 | `time_period` | nullable |
| 时段序号 | `period_serial` | nullable INTEGER |
| 摘要 | `summary` | NOT NULL，禁止完整正文 |
| 重要度 | `significance` | NOT NULL INTEGER |
| 是否有效 | `active` | NOT NULL INTEGER，只允许 0/1 |
| 来源修订 | `source_revision` | NOT NULL |
| 内容指纹 | `content_hash` | NOT NULL |

#### 稳定作用域与幂等键

作用域只允许来自事务开始时冻结的 `ownerCharacterId` 与 `chatId`：

```text
archive_scope_id = gal-scope.v1|owner=<owner长度>:<trim后owner>|chat=<chat长度>:<trim后chat>
archive_key = gal-archive.v1|scope=<scope长度>:<archive_scope_id>|kind=<story|relationship>|id=<稳定ID长度>:<稳定ID>
```

长度按 JavaScript 字符串 `.length` 计算，拼接前先 trim。owner/chat 任一为空、owner 超过 128 字符或 chat 超过 512 字符即判 `invalid-scope` 并回退；禁止昵称、正文、`Date.now()`、随机 UUID、当前楼层号或 message ID。story 稳定 ID 使用 VisitTurn 的 `turn_id`；relationship 使用 `relationship_memory_id`。`content_hash` 只用于判断内容是否变化，绝不进入 archive key。

#### 精确查询、召回预算与排序

- upsert 查重：`where: { archive_key }`，`limit: 2`；0 行才可 insert，1 行进入安全定位，2 行即 `duplicate-key` 并停止写入。
- 召回：对每个 `relevant_character_id` 分别查询两表，固定带 `archive_scope_id + character_id` 等值过滤；相关角色为空时零调用。
- story：`orderBy: [{ column: 'period_serial', direction: 'DESC' }, { column: 'row_id', direction: 'DESC' }]`，每角色至多 24。
- relationship：同序，每角色至多 12。
- 返回后仍须 schema 校验、scope/character 二次校验、稳定 ID 去重与全局预算裁剪；数据库记录不能覆盖 MVU 当前 active relationship state。
- `queryTableRows` 是同步调用，不能承诺 Promise timeout 能中断它。这里只允许通过精确 where、limit、结果裁剪控制成本；不得把 `Promise.race` 写成“已取消查询”。异步 insert/update 的 timeout 同样不等于取消底层写入。

#### 安全 row identity 与 upsert 算法

`updateRow` 接受的是 `content` 数组下标，不是查询结果里的 `row_id`；删除行后二者不保证相等。因此生产实现必须使用已经静态核验的 `exportTableAsJson()`：

1. 精确查询 archive key，要求恰好一行并取得 `row_id`；
2. 调 `exportTableAsJson()` 读取快照，按精确中文表名找到唯一 sheet；
3. 从 `content[1..]` 找到第一格字符串化后等于该 `row_id` 的行，必须恰好一行；
4. 通过表头定位 `archive_key` 列，并再次确认该行键等于目标键；
5. 紧邻 update 前重新执行上述身份校验；只有仍唯一匹配时才把该数组下标交给 `updateRow`；
6. 任一步缺失、歧义或全局 API 版本不含 `exportTableAsJson`，返回 `unsafe-row-identity`，不得猜 `rowIndex=1`，不得把 `row_id` 直接当 rowIndex；
7. insert 成功后按 archive key 重查验证；update/insert 返回失败或验证失败均记录诊断并回退，不重试盲写。

#### 既有开局同步与实施放行范围

既有“主角信息表/背包物品表”开局同步只作为 database-assisted 的独立兼容功能保留；它既不参与记忆 capability 判定，也不得阻塞 GAL 生成与记忆回退。诊断必须把“旧开局同步失败”和“记忆归档/召回失败”分开。

O02 之后允许：T02-R1 已完成，从 T03 schema/normalizer 开始，随后做 T04 pure upsert plan、T05 pure recall pipeline、T06 fake database port。**不允许开始 T07 生产 adapter；必须在第二次小验收和 O03 后才放行。**

---

## B4-T03：归档 schema、normalizer 与纯记录转换

### 任务性质

`[苦力-机械]`

### 目标

不调用数据库，只完成两类逻辑记录的纯函数层。

### 必须实现

- story archive record 类型；
- relationship archive record 类型；
- schema version 常量；
- stable serialization；
- content hash；
- MVU VisitTurn → story record；
- MVU RelationshipMemory → relationship record；
- database row → validated candidate；
- 明确错误码，不抛异常吞掉上下文。

### 必测

- 完整合法行；
- 缺 stable ID；
- 错 character ID；
- 错 scope；
- 错 enum；
- day 为 number/string/null；
- 超长文本；
- HTML/协议片段；
- 未知字段；
- 旧 schema；
- 关系事件不推导 relationship state；
- 转换前后不包含完整正文。

### 禁止

- 不导入 host/window；
- 不写 MVU；
- 不查询数据库；
- 不在 normalizer 中调用 LLM；
- 不用随机 ID。

---

## B4-T04：稳定键、content hash 与 upsert plan

### 任务性质

`[苦力-测试]`

### 前置条件

O02 已锁定 scope、表、列和 row identity。

### 必须实现

- 确定性的 archive key builder；
- 确定性的 content hash；
- `insert | update | skip | duplicate | unsafe` 纯 plan；
- 多行重复时不再 insert；
- 当前 MVU 内容变化时 plan 为 update；
- 不变时为 skip；
- 错 scope 行不参与匹配。

### 苦力测试矩阵

至少覆盖：2 种记录 × 6 种查询返回 × 3 种 hash 状态 × 2 种 row identity 状态。用表驱动测试，不要手抄几十个几乎相同的 test。

### 完成门

同一 MVU 记录重复规划 100 次，只出现第一次 insert，之后全部 skip/update，不出现第二个 insert。

---

## B4-T05：召回纯管线

### 任务性质

`[苦力-测试]`

### 必须实现

- 按 scope 与 relevant set 过滤；
- story/relationship 分别 normalize；
- 数据库内部重复去重；
- 与 MVU stable ID 去重且 MVU 获胜；
- active relationship state 保护；
- 稳定排序；
- 每角色预算与全局预算；
- 来源标签只进入内部 candidate；
- 返回纯数据，不触碰请求、host、MVU。

### 必测

- relevant 为 `[]`；
- 单角色；
- 4 角色；
- 第 5 个角色被拒绝；
- 同 character ID 不同 scope；
- 同 ID 本地/数据库冲突；
- 数据库旧 lover 与本地 estranged；
- duplicate rows 顺序不同仍输出相同；
- 10,000 个恶意/畸形行仍有界；
- 中文、emoji、空白、HTML；
- 合成结果不超过 900/2800；
- 本次 active visit 最新回合始终保留；
- 所有 DB 候选非法时输出与 standalone 严格相等。

---

## B4-T06：fake database port 与故障矩阵

### 任务性质

`[苦力-测试]`

### fake 必须可配置

- API 缺失；
- getter 抛错；
- 方法缺失；
- query 同步返回；
- query promise resolve/reject；
- 延迟结果；
- insert/update true、false、reject；
- 多行重复；
- 错 scope/角色/schema；
- 超量行；
- 调用计数、参数录制与并发峰值。

### 必须证明

- 故障不会向 generation coordinator 抛穿；
- standalone 调用计数始终 0；
- database-assisted fallback 历史与 standalone 字节相同；
- timeout 后迟到结果不会改变已返回值；
- 没有 unhandled rejection；
- 写失败不修改输入 MVU 对象；
- archive/recall 都有结构化诊断。

### 主验收方第二次小验收返修裁定（2026-08-09，APPROVED AFTER R1）

执行 agent 最初自报的 636 pass 不足以通过第二次小验收：测试曾绕过 normalizer、允许第 5 个角色、把 query 数组位置伪装成 rowIndex，并用错误的 fake API envelope。主验收方完成 R1 后，T03～T06 的纯逻辑合同现裁定如下：

1. **T03 通过**：稳定序列化改为 canonical JSON，不再有 `|`/`=` 字段边界碰撞；scope 必须完整解析长度前缀；stable/request/visit/character ID、四时段、period serial、schema/revision/hash 全部严格校验；任意 HTML/脚本协议拒绝；story/relationship 摘要统一清洗并截到 160。
2. **T04 通过**：现有行必须同时匹配 scope 与精确 archive key；内容变化但没有安全身份时返回 `unsafe`。新增纯 `resolveSafeRowIdentity()`，只允许从 `exportTableAsJson()` 的唯一中文表、正整数 row_id、`archive_key` 表头和值反查 `rowIndex>=1`；生产 update 前仍必须用新快照再验一次。
3. **T05 通过**：召回强制复用 T03 两个 row normalizer；最多接受冻结 relevant 列表前 4 人；冲突重复稳定 ID 整组拒绝，输入换序不改变输出；MVU stable ID 获胜；数据库旧 active 不得成为当前状态；数据库只使用显式传入的每角色≤900、全局≤2800 **剩余预算**，剩余为 0 时输出空候选，不挤本地最新回合。
4. **T06 通过（静态/fake 范围）**：fake 使用顶层 `AutoCardUpdaterAPI`，`queryTableRows` 返回 `{rows,columns,values,sql,limit,offset}|null`，并提供 `exportTableAsJson`；并发峰值统计未决 Promise；timeout 迟到 resolve/reject 被吸收；完整 synthetic history fallback 与 standalone 逐字节一致；archive/recall 均有结构化诊断。
5. **验证证据**：T03～T06 focused 55/55；含双 profile/UI 通道 focused 74/74；`npm run check:ui` 通过；全量 645/645；`git diff --check` 通过。未做探针、真实宿主、R2、publish、checkpoint 或卡片打包。

本批准只覆盖纯 schema/plan/recall/fake 层。它不证明 SP·数据库 VII 在真实宿主中的时序、持久化、reload 或 same-floor 行为；按 database-rolecard skill，相关宿主矩阵继续保持 pending，`DBR-C8-UNVERIFIED`。

---

## B4-O03：MVU 后置归档与恢复扫描接线

### 任务性质

`[主人-高风险]`

### 必须负责

- 找到“MVU 已成功写入、精确复读已通过、lifecycle settled”后的唯一 hook；
- 确认普通 send 与事务 regenerate 都不会双触发；
- 确认左右切 swipe 不触发；
- 确认 reload recovery 只做幂等扫描，不重结算；
- 归档任务脱离 GAL 锁但仍捕获所有异常；
- 限制并发与批次；
- 不把 archive 状态写进 `stat_data`；
- 记录数据库长期离线时 best-effort 边界。

### 裁定前证据修正（第二次小验收后新增）

- `settleByWriting()` 的 `{ phase:'settled' }` 不是唯一成功出口：`finalizeAcceptedAssistant()` 在目标数据已存在且复读验证通过时会返回 `{ phase:'noop', reason:'already-settled' }`。若首次数据库归档失败，reload/recovery 很可能走 noop；只挂 settled 分支会永久漏补归档。
- O03 必须设计一个**统一的 post-finalization 结果**，同时覆盖 `settled` 与经过同等身份/VisitTurn/lifecycle 验证的 `noop already-settled`，再把 best-effort 归档交给锁外队列；禁止在写盘前归档。
- 归档候选不能只有 `committed.turns`。必须同时定义当前 request/attempt/commit 可归属的 RelationshipMemory 差量；禁止扫描并重归档角色全部 48+12 历史。
- reload 只允许重放同一 archive key 的幂等归档，不得重新运行 MVU settlement；左右切 swipe 后身份不一致必须零归档。
- 在上述四项被主人明确 APPROVED 前，T07 继续禁止。

### 执行 agent 的允许工作

可以先实现纯 `collectArchivableRecords(finalState)` 和 fake coordinator 测试；不得自行把调用塞进 `render()`、通用刷新监听或每次 MVU_UPDATED。

### 停止线

如果只能通过 UI render 刷新触发归档，本设计不通过。

---

## B4-T07：database-assisted adapter 接线

### 任务性质

`[苦力-机械]`

### 前置条件

O02 与 O03 均已批准。

### 必须实现

- host API resolver 只存在于 database-assisted adapter；
- 解析跨 iframe 失败安全；
- 使用 O02 的精确 CRUD 参数；
- 使用 T04 的纯 upsert plan；
- 使用有界队列；
- archive 单条失败不阻断其他条，但汇总 partial；
- 同一批 stable key 先内存去重；
- 不使用 callback 作为正确性前提；
- 不下载远程脚本。

### 必测

- 首次从 standalone 切增强版归档当前 48 + 12；
- 第二次扫描零 insert；
- 一条内容变化只 update 对应行；
- 重复数据库行不 insert；
- 无安全 row identity 不 update；
- API 缺失不影响 UI/GAL；
- 每个调用参数不含完整 prompt/正文。

---

## B4-O04：召回准备层与冻结请求接线

### 任务性质

`[主人-高风险]`

### 推荐接口边界

```ts
prepareGalGenerationRequestV2({
  playerInput,
  state,
  snapshot,
  context,
  memoryPort,
}) -> Promise<GalGenerationRequestV2>
```

内部顺序必须是：先用结构化状态确定 relevant 角色，再召回，再调用现有纯 builder/投影器，最后冻结完整请求。

### 必须逐个审计的入口

- 普通 GAL 发送；
- 异变收束；
- 决斗胜利后生成；
- retry；
- native regenerate；
- transactional regenerate。

裁定原则：只有“新请求”可以召回；读取旧 `GalGenerationRequestV2` 的 retry/regenerate 一律不召回。

### 必须证明

- 等待召回期间尚未创建正式请求楼层；
- timeout/失败继续用基础历史；
- 召回迟到不能篡改 request；
- 玩家楼层 metadata 保存的是最终完整 synthetic history；
- 请求 fingerprint 对最终 history 敏感；
- 重生成继续使用原 fingerprint/冻结历史；
- DB 诊断不进入 request fingerprint，避免无意义漂移。

### 停止线

若接线需要让纯 builder 直接访问 window/API，停止；若 retry/regenerate 重新查询数据库，停止。

---

## B4-T08：所有新发送入口统一迁移到准备层

### 任务性质

`[苦力-机械]`

### 前置条件

O04 已给出最终接口与调用表。

### 必须做

- 按 O04 清单逐个替换新请求入口；
- 删除重复的 relevant 角色与召回拼接代码；
- 保持原 metadata 合并规则；
- retry/regenerate 明确走 frozen path；
- 每个入口写一个 contract test；
- 调用计数测试证明每个新请求最多一次 recall；
- relevant 为空时零 recall；
- 不修改第三批 regenerate 默认开关。

### 文件预算

这是机械接线，不允许借机重写 bridge。单个入口如需超过约 30 行新分支，回 O04 复核抽象。

---

## B4-T09：故障回退、诊断与 profile UI

### 任务性质

`[苦力-测试]`

### 必须做

- 用公共端口状态渲染诊断；
- standalone 显示 build-disabled，不探测数据库；
- database-assisted 显示 ready/unavailable/partial/failed；
- 错误消息裁剪，不包含行内容；
- 诊断更新不触发发送、结算、归档或 MVU 更新；
- 旧 `databaseAvailable: Boolean(databaseApi())` 直接探测删除或改为端口状态；
- app render 不再每次无条件同步数据库。

### 必测

- 诊断反复 render 无 CRUD；
- profile 切换只能通过重新构建，不接受 URL/MVU 切换；
- database failure 后下一次新请求仍正常；
- archive failure 与 recall failure 分开显示；
- 不出现原始异常堆栈或私有数据。

---

## B4-T10：状态体积测量器

### 任务性质

`[苦力-测试]`，这是最适合交给苦力 agent 的部分：组合很多，判断很少。

### 测量对象

每个 fixture 至少记录：

```text
profile
character_count
story_turn_count_per_character
relationship_count_per_character
floor_count
swipe_count
active_stat_data_bytes
all_floor_stat_data_bytes
request_metadata_bytes
synthetic_history_chars
bundle_bytes
database_rows_seen
database_rows_accepted
elapsed_ms（仅诊断，不作为宿主性能证明）
```

### 必须使用真实项目函数

- 初始化走当前 normalize/migration；
- turn 走正式 upsert；
- relationship 走正式 upsert；
- history 走正式 projector；
- request 走正式 builder/准备层；
- floor fixture 模拟每层持有完整 message-floor state；
- swipe fixture 分别记录 active swipe 与所有 swipe data。

禁止只手写一个缩减 JSON 然后宣称等同真实状态。

### 输出

生成机器可读 JSON 报告和 Markdown 摘要，放在测试/临时报告路径；不得覆盖正式 runtime report。

---

## B4-T11：多楼层增长 fixture 与停止线

### 任务性质

`[苦力-测试]`，也是纯苦力重点。

### 最少矩阵

角色数：

```text
1, 4, 8
```

每角色故事条数：

```text
0, 1, 16, 48
```

每角色关系条数：

```text
0, 1, 12
```

楼层数：

```text
1, 10, 50, 100, 200
```

swipe 数：

```text
1, 3
```

无需做全部笛卡尔积；至少覆盖空、常规、单角色上限、4 角色上限、8 角色上限、200 楼层、3 swipe 的边界组合，并在日志列出取舍。

### 硬门

- 两个 profile 对相同 MVU fixture 的 `stat_data` 必须字节相同；
- database-assisted 不得把 recall rows/cache/诊断写入 MVU，因此 active state 增量必须为 0；
- story 仍为每角色最多 48，relationship 仍为每角色最多 12；
- retry/regenerate 100 次后逻辑 turn 数不增长；
- 同一关系 stable ID 重放 100 次不增长；
- synthetic history 始终不超过 2800 字；
- 100 → 200 楼层累计体积增长应近似线性，不允许因数据库缓存出现平方级增长；
- 本批相对第三批基线的每楼层 MVU payload 不应增长；若增长，必须定位字段并停止封账；
- bundle 体积分别报告，不因阈值难看删除能力。

### 不能由执行 agent擅自决定的事

如果现有 48 × 8 的状态已经很大，执行 agent 只能报告：

- 哪个字段占比最高；
- 单角色/单楼层/100 楼层/200 楼层字节数；
- 增长斜率；
- 可选优化建议。

不得：

- 把 48 改成 24；
- 把 12 改成 6；
- 删除日期、visit ID 或审计字段；
- 改成全角色共享额度；
- 只测一个角色然后写“通过”。

---

## B4-T12：文档、依赖台账与最终验证

### 任务性质

`[苦力-机械]`

### 必须更新

- `project/gal-character-memory-batch-4-implementation-log.md`；
- `project/gal-character-visit-memory-and-synthetic-history-plan.md` Phase 7 状态与最终裁定；
- `project/api-provenance.md` 精确数据库 API 与未实机项；
- `src/schema/field-ledger.md`：只在确有新正式字段时更新；若无 MVU 新字段，要明确写“零字段”；
- runtime dependency ledger：数据库为 `optional/host-provided`，不是 embedded；
- build scripts 使用说明；
- 测试/体积报告索引。

### 依赖说明必须准确

- standalone 玩家不需要安装或启用数据库；
- database-assisted 需要宿主中可选启用匹配版本的 SP·数据库 VII；
- 本卡不下载数据库脚本；
- 数据库缺失时退回独立 MVU 能力；
- TypeScript/esbuild 是 development-only；
- 未做真实宿主验收的项目标记“运行时待验”，不能写 PASS。

### 最终命令

实施时按仓库实际脚本补全，至少包括：

```text
focused database/profile tests
focused generation/regeneration tests
focused character-memory/synthetic-history tests
npm run check:ui
npm test
standalone build to isolated output
database-assisted build to isolated output
bundle forbidden-symbol scan
state-size report generation
git diff --check
git status --short
```

禁止执行 publish、R2、checkpoint、PNG embed。

---

## B4-O05：最终代码逻辑验收与封账

### 任务性质

`[主人-高风险]`

执行 agent 完工后只能写“申请验收”，不能自己把 Phase 7 改成已封账。

主验收方必须逐项检查：

1. 构建图是否真的隔离；
2. standalone bundle 是否零数据库路径；
3. 两版是否共享业务核心与 MVU schema；
4. 物理表/API 是否有精确版本证据；
5. archive 是否在 MVU settled 后；
6. update 是否有安全 row identity；
7. duplicate 是否绝不继续 insert；
8. scope/character 过滤是否在进入 prompt 前完成；
9. 本地 active relationship state 是否不可被覆盖；
10. regenerate 是否零 recall；
11. fallback 是否与 standalone 基础历史字节一致；
12. 数据库结果是否从不写回 MVU；
13. 48 + 12 是否保留；
14. 多楼层增长报告是否真实使用生产函数；
15. 是否误改 R2、正式名称、打包或 reasonix；
16. focused、全量、tsc、diff 是否通过。

---

## 11. 自动化验收矩阵

### 11.1 双构建

- 两个 profile 均能从干净临时输出目录构建；
- 未指定/非法 profile 按 O01 合同失败；
- production/test 与 profile 组合不互相覆盖；
- 共享 asset URL/manifest；
- standalone 禁词为零；
- database-assisted 明确包含 adapter identity；
- 两个产物报告的 profile 正确；
- 两版 MVU schema/version 完全相同。

### 11.2 归档

- 首次 insert；
- 相同内容 skip；
- 同 key 内容变化 update；
- 多重复行不 insert；
- unsafe row identity 不 update；
- query/insert/update 各自失败；
- 刷新恢复扫描幂等；
- regenerate 更新同一行；
- stopped/failed/pending 不归档；
- swipe 左右切换不归档；
- MVU 提交失败时零归档；
- 归档失败时 MVU 仍 settled。

### 11.3 召回

- relevant 为空零查询；
- 每个 relevant 角色精确查询；
- 非 relevant 行拒绝；
- 跨 scope 行拒绝；
- malformed/旧 schema/超长/超量安全；
- 数据库重复去重；
- 本地 stable ID 获胜；
- 本地 active relationship state 获胜；
- DB 只占剩余预算；
- 输出稳定排序；
- 错误时与 standalone strictEqual；
- 新请求最多查一次；
- retry/regenerate 零查询。

### 11.4 体积与增长

- 1/4/8 角色；
- 0/16/48 story；
- 0/12 relationship；
- 1/10/50/100/200 floors；
- 1/3 swipes；
- 两 profile MVU bytes 相同；
- DB cache 未进入 state；
- 100 次 retry/regenerate 无重复增长；
- prompt 总预算不突破；
- 报告包含绝对 bytes 与相对斜率。

---

## 12. 验收停止线

出现任一项，执行 agent 必须停止并在日志写 `BLOCKED`：

- O01/O02/O03/O04 未裁定却继续生产接线；
- 找不到可靠 archive scope；
- 找不到可靠物理 row identity；
- 只能全表无限查询；
- 只能让数据库记录覆盖 MVU 才能合成历史；
- 只能在 render/MVU_UPDATED 中无限归档；
- standalone 无法从构建图剔除数据库 adapter；
- retry/regenerate 必须重新查库；
- 召回失败会落回真实聊天历史；
- 数据库 promise 可在 timeout 后修改冻结请求；
- 必须在 `stat_data` 保存数据库全量 cache；
- 多楼层测试出现数据库相关的非线性增长；
- 为通过测试需要缩减 48/12；
- 需要猜 API 参数、表名、列名或索引基数；
- 需要运行旧探针、启用外部脚本、发布 R2 或覆盖正式产物；
- 需要修改 reasonix；
- 工作区既有用户改动发生不明覆盖。

---

## 13. 推荐实施顺序

严格按下面顺序，不要一口气写完整 adapter：

```text
B4-T00 基线
  -> B4-O01 构建裁定
  -> B4-T01 profile/port
  -> B4-T02 standalone 零路径
  -> 第一次小验收：只验双构建与独立版

B4-O02 API/物理表裁定
  -> B4-T03 纯 schema
  -> B4-T04 upsert plan
  -> B4-T05 recall 纯管线
  -> B4-T06 fake 故障矩阵
  -> 第二次小验收：只验纯函数与 fake port

B4-O03 后置归档裁定
  -> B4-T07 archive adapter
  -> B4-O04 请求冻结裁定
  -> B4-T08 新请求入口接线
  -> B4-T09 诊断/回退
  -> 第三次小验收：只验生产接线

B4-T10 体积工具
  -> B4-T11 大矩阵苦力测试
  -> B4-T12 文档与总验证
  -> B4-O05 独立最终验收/封账
```

这样分四段，不会让那个执行 agent 一卡就把半成品数据库代码埋进发送事务里。嗯，省下来的不是时间，是未来骂人的力气。

---

## 14. 执行 agent 交工模板

```text
第四批交工申请

1. 完成任务：B4-Txx...
2. 未执行的主人任务：B4-Oxx...
3. memory profile 架构：
4. standalone bundle 禁词结果：
5. database API provenance：
6. 物理表/列/row identity：
7. archive 提交时机：
8. recall 冻结时机：
9. regenerate 查询次数：
10. fallback strictEqual 结果：
11. focused tests：
12. 全量 tests：
13. tsc：
14. 两版 build：
15. 体积报告路径与关键数字：
16. git diff --check：
17. git status --short：
18. 未做：探针/真实宿主/R2/打包/发布
19. 未修改：reasonix
20. 运行时待验：
21. 请求主验收方裁定：
```

缺任意关键项，只算“苦力提交了一堆文件”，不算第四批完成。

---

## 15. 第四批封账条件

只有主验收方确认以下全部成立，才能把第四批写为“代码逻辑封账”：

- 两个 profile 由同一源码构建；
- standalone 产物不存在数据库调用/探测路径；
- database-assisted 的数据库能力是 optional host-provided；
- MVU 48 + 12 仍是唯一正式状态与完整离线兜底；
- 归档在 MVU settled 之后且幂等；
- 相同 stable ID 不重复 insert；
- 召回严格按 scope + relevant character；
- malformed、重复、跨 scope、跨角色和超量数据都安全；
- 本地 MVU 记录与 active relationship state 永远优先；
- 数据库失败与独立版基础 history 字节一致；
- 新请求最多一次召回，retry/regenerate 零召回；
- 数据库内容、缓存与诊断不写回 MVU；
- 状态体积未因 database profile 增长；
- 多楼层增长无新增非线性项；
- focused、全量测试、tsc、两个 profile build、bundle scan、diff check 全部通过；
- 实施日志和 provenance 完整；
- 未做的真实宿主行为明确标记“待验”；
- 未发布、未打包、未碰 reasonix。

本批只封代码逻辑，不封真实宿主可用性。数据库当前仍是 disabled 的运行时事实，谁敢把静态 fake 测试写成“实机 PASS”，就把他拎回来重读第 3 节。懒得客气第二遍。
