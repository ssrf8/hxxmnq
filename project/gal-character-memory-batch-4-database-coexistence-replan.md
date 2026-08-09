# GAL 角色记忆第四批 R2：数据库共存双线路重规划

> 日期：2026-08-09
> 状态：**IMPLEMENTED / STATIC ACCEPTED；替代旧“数据库冷归档 + 卡内主动查表召回”路线**
> 范围：代码逻辑、构建隔离与自动化静态验收；未授权探针、R2 上传、发布、打包或真实数据库写入
> 主人最终取舍：卡内 MVU 召回体积可接受；无论有没有 SP·数据库，都继续使用同一套卡内召回。数据库原生召回属于宿主额外增强，本卡不读取、不合并、不去重、不依赖它。

---

## 1. 一句话裁定

两条线路不是“两套记忆算法”，而是：

```text
standalone-mvu
  = 卡内 MVU 48 条剧情梗概 + 12 条关系记忆
  = 卡内 synthetic history
  = 不触碰数据库

database-assisted
  = 与 standalone-mvu 完全相同的卡内 MVU 召回和 synthetic history
  + 允许宿主已安装的 SP·数据库独立运行
  = 本卡不主动查询数据库记忆，不把数据库行拼进 synthetic history
```

对相同 MVU、玩家输入、角色选择和 visit 快照，两个 build profile 在交给宿主 `generate()` **之前**构造的 `GalGenerationRequestV2`、`syntheticHistory` 与 generate config 必须逐字节相同。

---

## 2. 为什么改掉旧方案

旧方案会同时形成：

```text
卡内 MVU 召回
+ 本卡自建数据库表召回
+ SP·数据库原生召回
```

这会把复杂度落在归档幂等、表结构、row identity、查询预算、冲突消解、超时与重生成冻结上。主人已接受少量重复 token，不再为此建立第三套记忆协议。

---

## 3. 外部数据库事实与责任边界

参考：

- [酒馆助手脚本《数据库》教程](https://docs.google.com/document/d/1C5S8nB1rMRqb2fx8pubH9boDtLoPP6AZgSAlw3UhT9A/edit?tab=t.i8aizjy2g2vt#heading=h.jexc4fof3nqx)
- 目标 Helper：SillyTavern `1.18.0` + Tavern Helper / JS-Slash-Runner `4.8.18`
- 本地只读 SP·数据库 VII 证据：`tmp/b4-o02-evidence/sp-db-vii-index.js`

已确认：数据库总结数据持久化在聊天楼层并注入世界书；剧情推进选出 AM 编号并参与当前 user 输入，相关绿灯世界书内容再进入正文提示词。数据库数据的存储楼层不等于正文提示词里的历史 assistant 楼层。

本卡不承担：

- 判断数据库原生召回是否成功；
- 读取数据库本轮选出的 AM 或世界书内容；
- 对数据库召回与 MVU 召回做语义去重；
- 因数据库存在而关闭 MVU 召回；
- 因数据库失败而重建 frozen request；
- 把数据库回调当作 GAL settled 条件。

本卡只承担：

- 始终生成正确、非空、受预算约束的卡内 synthetic history；
- standalone 构建完全不接触数据库符号；
- database-assisted 不妨碍宿主已安装的数据库包装 `generate()`；
- 数据库是否存在都不改变本卡事务、MVU 写入、retry 和 regenerate 的卡内语义。

---

## 4. 双线路正式合同

### 4.1 公共主线

两种 profile 均执行：

```text
读取正式 MVU 快照
  -> 冻结 relevantCharacterIds / visitIdsByCharacter
  -> 从每角色 48 条剧情梗概 + 12 条关系记忆构造候选
  -> 本地去重、优先级、每角色 900 / 全局 2800 预算
  -> buildSyntheticHistory()
  -> buildGalGenerationRequestV2()
  -> 冻结玩家楼层 metadata
  -> buildGalGenerateConfig()
  -> 调用宿主 generate()
```

禁止插入：

```text
memoryPort.recall()
AutoCardUpdaterAPI.queryTableRows()
数据库候选 normalizer / 预算合并
数据库失败后重建第二份 request
```

### 4.2 standalone-mvu

- build graph 不得出现 `AutoCardUpdaterAPI`、数据库 CRUD 或数据库 adapter；
- 带抛错 getter 的 fake global 必须零访问；
- UI 显示“独立 MVU 记忆”；
- 卡内召回失败属于本卡错误，不得假装由数据库补足。

### 4.3 database-assisted

- 卡内请求构造与 standalone 严格相同；
- 不主动调用数据库记忆 CRUD；
- 可保留数据库宿主桥与插件可见性诊断，但诊断不参与 request fingerprint；
- 数据库可以在宿主层独立改写 user input、激活世界书或填表；这些行为不写回本卡 frozen request；
- 数据库不存在、关闭剧情推进或内部失败时，本卡仍使用自己的 MVU 历史，不切换模式、不重建 request；
- 数据库注入与 MVU 召回重复，属于明确接受的外部增强效果。

### 4.4 冲突裁定

模型可能同时看见卡内记忆与数据库记忆。如果冲突：

- 本卡正式 MVU、当前 visit 与当前 relationship state 是本卡结算和 UI 的唯一事实源；
- 数据库文本不能直接修改 MVU；
- LLM 输出仍经过既有 schema、白名单和事务结算；
- 不新增“让 LLM 判断哪份记忆正确”的提示词；
- 本批不做跨系统语义去重。

---

## 5. generate 桥的最低共存要求

这不是召回适配，只是避免主动绕过宿主函数包装。

当前 `src/runtime/ui-host-shell.js` 在 iframe 挂载时把 `source.generate.bind(source)` 存成快照。若数据库稍后替换 `window.TavernHelper.generate`，子 iframe 可能继续调用旧函数。R2 要求先裁定 late-bound 转发：每次调用时重新读取当前宿主 `generate`，并保持正确 `this`。

必须覆盖：

1. 数据库先安装、UI 后挂载；
2. UI 先挂载、数据库后安装；
3. wrapper 被移除后调用当前恢复函数；
4. standalone 不因此暴露数据库 API；
5. 不读取 `original_TavernHelper_generate_ACU` 等私有全局；
6. 不调用 `generateRaw` 模拟数据库；
7. wrapper 抛错由既有生成事务处理，不重建历史。

---

## 6. 双线路测试矩阵

### 6.1 纯请求同一性

相同 fixture 分别通过两个 profile，必须满足：

| 检查对象 | 期望 |
|---|---|
| relevantCharacterIds | 深相等 |
| visitIdsByCharacter | 深相等 |
| syntheticHistory | 字节相等 |
| syntheticHistoryHash | 相等 |
| modelUserInput | 字节相等 |
| config（排除 generation_id） | 深相等 |
| configFingerprint | 相等 |
| 每角色/全局预算 | 同为 900/2800 |
| 数据库调用计数 | 构造阶段均为 0 |

### 6.2 卡内召回 canary

fixture 放入当前 visit、closed visit、relationship state、relationship event、非相关角色和真实旧楼层 canary。两个 profile 都必须包含相同的四类合法本地记忆，排除非相关角色与真实旧楼层；重复 100 次逐字节稳定；retry/regenerate 复用冻结 history 且零数据库调用。

### 6.3 数据库宿主共存 fake

fake 只模拟 wrapper，不模拟数据库召回算法：

1. 原始 `generate` 记录 config；
2. fake wrapper 给 `user_input` 增加 `DB_EXTERNAL_CANARY`；
3. 验证 late-bound bridge 调到 wrapper；
4. wrapper 收到的卡内 history 与 standalone 完全相同；
5. wrapper 缺失或静默透传时卡内召回仍存在；
6. wrapper 抛错不触发第二次请求、第二个玩家楼或查表 fallback；
7. 覆盖 wrapper 在 UI 挂载前和挂载后安装。

### 6.4 构建隔离

standalone 最终 `app.js`、`ui-mount.js`：数据库禁词为零，fake throwing getter 访问为零。

database-assisted：

- build report 标记 profile；
- 保留经批准的 late-bound 共存桥；
- 不包含 `queryTableRows/insertRow/updateRow` 的记忆调用路径；
- 不 import `memory-recall-pipeline.ts`、`memory-upsert-plan.ts` 进入生产 bundle；
- 不生成自建故事/关系归档表。

### 6.5 状态增长

两 profile 必须保持：每角色 story turns 总计 ≤48、active turns ≤16、closed visits ≤4、relationship memories ≤12。database-assisted 不把 rows、AM、世界书内容、回调或诊断写入 MVU；相同 100/500 回合 fixture 的 MVU JSON 字节数必须相同。

### 6.6 允许的外部差异

SP·数据库可能在网络请求前独立改写 user input 或世界书注入，所以最终宿主提示词不要求与 standalone 相同。本项目只要求差异发生在卡内 request 构造之后，卡内 history 不被删除，旧真实楼层不因空 history 回退而进入，并明确不声称能限制数据库自己的 token、召回量或重试次数。

---

## 7. 原 T03～T06 研究代码处置

以下模块不再获得生产接线许可：

- `memory-archive-schema.ts`
- `memory-upsert-plan.ts`
- `memory-recall-pipeline.ts`
- `memory-host-call.ts`
- `tests/fake-database-port.mjs`

现有测试可暂时保留；database-assisted adapter 不得 import；不得因代码已经写完继续 T07。第四批收口时再独立裁定保留隔离或删除，删除前后都必须证明无生产 import 并跑全量测试。

---

## 8. 新任务顺序

每个小任务开始前，执行 agent 必须重新阅读 database-rolecards skill、API-reference skill、总计划 Phase 7、本 R2 文档与 implementation log 最新裁定。

### B4-R2-T01：冻结公共召回合同 `[苦力-测试]`

- 建双 profile 相同 fixture；
- 断言 request/history/config/fingerprint 同一；
- 断言构造阶段数据库调用均为 0；
- 不改生产 bridge。

完成后停下申请小验收。

### B4-R2-O01：late-bound generate 裁定 `[主人-高风险]`

- 确认 `source` provider 与 `this`；
- 确认 wrapper 安装顺序；
- 给出最小转发与卸载语义；
- 不读数据库私有全局，不解析真实召回。

未批准前不得修改 host shell。

### B4-R2-T02：共存桥与 fake 矩阵 `[苦力-机械]`

- 按 O01 实现 late-bound 转发；
- 测试挂载前/后安装、透传、抛错、恢复；
- 证明无二次请求和 request 重建。

完成后停下申请第二次小验收。

### B4-R2-T03：封存旧接线计划 `[苦力-文档]`

- 将旧 B4-T07/O04/T08 标为 superseded；
- 更新总计划、runbook、implementation log；
- 列出旧研究模块生产 import 扫描结果。

### B4-R2-O02：研究模块清理裁定 `[主人-中风险]`

- 若无生产 import，决定保留隔离或删除；
- 清理独立验收、独立回滚；
- 不顺手改 schema、MVU 或提示词。

---

## 9. 停止线

命中任一项立即停止：

- 检测到数据库便关闭 MVU 召回；
- 主动查数据库构造 prompt；
- 合并数据库候选与 MVU 候选；
- 数据库失败后建立第二份 request；
- retry/regenerate 读取数据库；
- 数据库回调参与 settled；
- 依赖数据库私有全局或 DOM；
- standalone 出现数据库符号；
- 数据库诊断写入 MVU；
- 为减重复 token 删除 48 + 12；
- 执行探针、R2 上传、发布或整卡打包。

---

## 10. 最终验收

必须同时满足：双 profile 卡内召回逐字节一致；构造阶段数据库调用为零；standalone 数据库禁词为零；database-assisted 无自建记忆 CRUD；late-bound bridge 不绕过后安装 wrapper；wrapper 缺失/透传/抛错不让卡内记忆消失；retry/regenerate 复用冻结 history；状态增长一致；旧研究模块未进生产 adapter；全量测试通过。

最终裁定语句固定为：

> **数据库只与卡内 MVU 召回共存，不参与、不替代、不增强本卡的召回构造。**

---

## 11. 执行与静态验收结果（2026-08-09）

### 11.1 任务结论

| 任务 | 状态 | 结果 |
|---|---|---|
| B4-R2-T01 | PASS | 新增双 profile 同 fixture 合同测试；request、synthetic history、hash、config 与 fingerprint 逐字节相同；重复 100 次稳定；请求构造 import graph 对数据库及旧主动召回模块均不可达。 |
| B4-R2-O01 | APPROVED | `generate` provider 裁定为调用时刻可见的 `TavernHelper.generate`，保持 helper 为 `this`；只在缺失时回退宿主公开 provider，不读取数据库私有全局。 |
| B4-R2-T02 | PASS | host shell 改为 late-bound 转发；覆盖 UI 挂载后 wrapper 安装、恢复、source/host fallback、参数透传、`this` 与抛错不重试。 |
| B4-R2-T03 | PASS | database-assisted 的 recall/archive 明确封口；构建 sourcemap 证明旧 T03～T06 主动归档/召回模块未进入生产 bundle。 |
| B4-R2-O02 | APPROVED — RETAIN ISOLATED | 旧研究模块保留为隔离测试资产，不删除、不接生产 adapter；后续若删除必须另立变更与回归，不得顺手清理。 |

### 11.2 生产合同落点

- `src/runtime/ui-host-shell.js`：不再在 iframe 挂载时快照绑定 `generate`；每次调用重新解析当前公开 helper，因而不会绕过稍后安装的数据库 wrapper。
- `src/ui/memory-adapters/database-assisted.ts`：`recall()` 固定返回空候选，`archive()` 固定跳过；只保留既有的开场主角/背包同步兼容功能，该功能不参与 GAL 请求、记忆召回、事务 settled 或 regenerate。
- `src/ui/memory-port.ts`：recall/archive 被标记为封存研究接口；生产请求构造器不得调用。
- 旧 `memory-archive-schema.ts`、`memory-upsert-plan.ts`、`memory-recall-pipeline.ts`、`memory-host-call.ts` 仍可供纯函数研究测试使用，但 production adapter/import graph 不可达。

### 11.3 验收边界

本次只声明静态代码逻辑与自动化测试成立。未执行真实宿主数据库时机演示，因此运行时结论仍为 `DBR-C8-UNVERIFIED`；这不阻塞当前裁定，因为本卡不把数据库召回作为正确性依赖。未执行探针、R2 上传、发布、checkpoint、JSON/PNG 打包，也未修改 reasonix。
