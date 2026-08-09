# `docs/` 参考资料与下一实施候选审计

> 日期：2026-08-09
> 性质：只读参考审计与后续排序，不授权打包、发布、R2、探针、真实宿主写操作或提示词专项施工
> 参考边界：`docs/` 记录的是“未开之花（汤泉）V1.0.6”，不是“幻想乡物语”的现状；只能借鉴架构模式，禁止按函数名、偏移、版本或玩法原样移植。
> 当前基线：`npm run check:ui` PASS；`npm test` 702/702；GAL 脱敏诊断、MVU 多槽存读与请求期提示词楼层注入均已完成静态代码逻辑封账。
> 2026-08-09 所有者后续裁定：原生 branch/checkpoint 候选作废；第六批改为汤泉式世界书多槽，保存“当前活动页聊天 + 楼层原 data + 完整 MvuData”，读档重建楼层后直接恢复 chat-scope MVU。精确计划以 `project/gal-mvu-save-load-plan.md` 为准。

---

## 1. 审计结论

`docs/` 中与 GAL 主链直接相关的四项——发送、监听、停止、重生成——本项目已经有更严格的事务化实现；历史上下文也已从汤泉的“按 sceneId 保留完整旧楼层”升级为“按角色 visit 从 MVU 构造 synthetic history，真实旧楼层不进入请求”。这些部分不应再开第五套实现。

本文原先选出的三项新增价值已经全部完成静态施工：脱敏诊断导出、MVU 全量存档与聊天重建、请求期提示词楼层注入。当前没有必要继续照抄 `docs/` 新建同类基础设施；剩余项主要是已明确排除的参考卡玩法、可选增强和真实宿主／发布验收。

---

## 2. `docs/` 逐册对照

| 文档 | 可复用思想 | 当前项目状态 | 裁定 |
|---|---|---|---|
| 01 架构总览 | 宿主／Helper／MVU／iframe／世界书分层 | 已有 host shell、UI、bridge、MVU 与构建分层 | 已吸收，不重构 |
| 02 楼层与请求控制 | 自建 history、`generate()`、手动落楼、重 Roll | V2 frozen request、单玩家楼层、指定 swipe regenerate 与 request-scoped injects 已完成 | 已完成；不再新增第二套请求控制器 |
| 03 正文识别与变量更新 | 正文协议、本地剥离、MVU 更新后再消费 | 已有 `scene.v1`、正文净化、VARIABLE_UPDATE 生命周期与本地 settlement | 已完成；不新增“额外模型重试按钮” |
| 04 存档与世界书 | 多 slot、checksum、导入导出、串行写入 | 已实现 8 槽禁用世界书存储、完整校验、活动页楼层重建、chat-scope MVU 恢复与失败回滚 | 静态完成；真实宿主写盘／重载待核对 |
| 05 避坑指南 | listener cleanup、存档版本、临时注入职责分离 | 大部分已有合同与测试 | 继续作为禁区参考 |
| 06 渲染与前后端 | iframe 同层壳、UI 故障恢复原生聊天 | host shell 已实现单例挂载、隐藏／恢复、跨卡清理 | 已完成 |
| 07 监听层 | stop 收集、DOM observer、dispose、生成事件 | 事务状态机、generation_id、停止与 host 清理已完成 | 已完成；只需诊断可见性，不再加监听层 |
| 08 历史上下文 | 场景隔离、真实楼层 metadata、隐藏注入点 | 已改为每角色 visit + 48/12 MVU synthetic history | 已完成且更适合当前设计 |
| 09 功能清单 | 串行生成、多槽存档、自动保存、导出、全屏、地图、立绘 | 串行／互斥、多槽、脱敏诊断、全屏、地图和立绘已有；未照抄自动存档 | 目标能力已覆盖；自动存档不是当前合同 |
| 10 完整循环轮 | 请求→解析→变量→落楼→UI 的闭环 | send/listen/settle/stop/retry/regenerate 已统一 | 已完成 |
| 11 临时世界书 | 预置空条目、发送前覆写、退出清空 | 本轮选择 request-scoped `generate({injects})`，没有引入动态世界书生命周期 | 明确不需要；避免持久化清理风险 |
| 12 预设与请求格式 | marker、prompt order、in-chat depth | 已实现单条 depth 1 `system/in_chat` 注入，synthetic history 与玩家输入分层，固定 `with_depth_entries:false` | 静态完成；4.8.18 API 已回源核验 |
| 13 模式系统 | 状态命名空间、统一请求工厂、错误层 | 当前设施／活动／战斗以规则模块 + bridge 组合，无需强造三模式 | 只借鉴，不移植玩法 |
| 14 从零指南 | 分步验收和公开 API 优先 | 当前工程已远超骨架阶段 | 作为新 agent 入门参考 |

---

## 3. 已完成候选：脱敏诊断导出

### 3.1 为什么先做它

- 不改变 `stat_data`、聊天楼层、swipe、世界书或数据库；失败时也不影响玩法。
- 当前事务、记忆和双 profile 已有大量稳定 ID 与 fingerprint，但散落在 metadata、内存状态和日志里；发生问题时验收者仍容易拿旧打包数据或旧楼层猜。
- 汤泉 `docs/09` 的“问题记录导出”适合借鉴，但本项目必须默认脱敏，不能导出正文、玩家原文、角色私密内容或凭据。

### 3.2 建议导出内容

固定 schema：`gensokyo-diagnostic.v1`。只包含：

- app/build/memory profile、脚本版本、聊天身份的不可逆短 hash；
- 最近有限条 GAL transaction 状态：requestId/attemptId/generationId/commitKey 的短 hash、phase、transport、时间间隔、错误码；
- 最近一次 V2 request 的 revision、角色 ID 白名单、visit ID 短 hash、history bytes/hash、config fingerprint；
- listener/host shell 当前装配状态、是否 native mode、是否 debug floors；
- MVU 结构计数：每角色 active/closed/turn/relationship 数量及总 JSON bytes，不含 summary 文本；
- database profile/capability 与 `DBR-C8-UNVERIFIED` 标记，不读数据库内容；
- 最近有限条本地错误的 code/stage，不包含 stack 中的 URL query、正文或 token。

禁止导出：玩家输入、assistant 正文、synthetic history 原文、人物关系摘要、世界书内容、API key、Cookie、R2 凭据、完整聊天 ID、数据库 rows、DOM HTML。

### 3.3 实施边界

- 新增纯函数 `buildDiagnosticSnapshot()` 与 schema parser；先用 fixture 证明脱敏，再接 UI 下载按钮。
- 下载使用 `Blob` + 临时 object URL，下载后立即 revoke；不上传网络，不写 MVU/localStorage。
- 导出入口放设置页，明确显示“仅本地下载，不含剧情文本”。
- 同一 state 重复导出除 `capturedAt` 外应稳定；容量设硬上限。
- 本批适合独立实现和验收，不与 prompt 注入或存档恢复混做。

---

## 4. 已被所有者否决的候选：宿主原生分支／检查点存档入口

> 本节保留为历史取舍依据，不再是实施方向。当前正式方向见 `project/gal-mvu-save-load-plan.md`。

### 4.1 为什么不照抄汤泉世界书存档

汤泉 `docs/04` 的读档会先删除当前聊天全部楼层，再重建 message/data/extra/swipes。这在本项目会同时触碰：

- V2 request/attempt/commit metadata；
- assistant swipe 四数组与 active swipe；
- MVU 每楼状态快照和 VisitTurn 幂等证据；
- pending/settled 恢复判定；
- host listener 与数据库宿主可能观察到的删除／新增事件。

因此它不是“加个存档按钮”，而是一条新的高风险事务系统。禁止直接实现。

### 4.2 更适合的方向

STDB `E2_消息操作与分支检查点.md` 记录 SillyTavern 原生 branch/checkpoint 会克隆聊天文件并保留宿主分支语义。下一批先验证目标 1.18.0 + Helper 4.8.18 的公开入口，再规划：

1. 只允许在无 active generation、无 settling、无 pending scene item/battle 时创建命名检查点；
2. UI 只提供“创建检查点／查看检查点／交给宿主切换”，不自行删除重建楼层；
3. 切换后按 chat identity 重新初始化 bridge、丢弃旧内存事务、从真实最后楼层恢复；
4. 不把 checkpoint 名称、列表或 UI 选择写进 MVU；
5. 不承诺跨设备导出，除非宿主原生导出语义另行核验。

API、事件和切换后的 MVU/swipe 行为具有版本敏感性；施工前必须使用 `sillytavern-api-reference`，真实运行证明之前不得写 PASS。

---

## 5. 已完成：提示词与楼层注入专项

最终实现与主人设想一致：玩家可见输入只保留玩家表达，动态规则／格式／状态改用受控请求期注入层：

- 固定输出协议和当前角色／场景状态合并为唯一一条 depth 1 system inject；
- synthetic history 继续位于 history 覆盖层，不塞回 user input；
- 角色绿灯和道具绿灯继续使用可信代码状态生成；
- 注入正文及 hash 冻结进 V2 metadata，retry/regenerate 复用；损坏 metadata 失败闭合。

实现没有启用 `with_depth_entries`，没有动态改写世界书，也没有恢复真实旧聊天历史。精确合同和封账见 `project/gal-prompt-floor-injection-plan.md`。

---

## 6. 暂不建议实现

- **汤泉式完整聊天世界书副本**：重复 ST 自有聊天持久化，状态体积大，恢复破坏面过宽。
- **数据库存档／召回第二状态源**：第四批 R2 已裁定撤销。
- **额外模型失败后自动再请求**：可能重复消费、重复楼层和重复 MVU 结算；现有失败恢复更安全。
- **再加一层通用 AI 队列**：GAL transaction 已拥有生成互斥和恢复语义；无证据时叠队列只会增加死锁面。
- **照搬老板／游客／服务员三模式**：是汤泉玩法，不是可无条件移植的基础设施。

---

## 7. 建议开工顺序

```text
已完成：脱敏诊断导出
  -> 已完成：MVU 世界书多槽与聊天重建
    -> 已完成：请求期提示词 / injects / 楼层注入
      -> 可选：真实宿主存读与最终 prompt 顺序核对
        -> 所有者授权后才进入打包／测试通道发布
```

三项候选均已完成静态代码逻辑封账。`docs/15` 的独立模型语义召回、参考卡的动态临时世界书和自动存档均未实施，但它们已被明确裁定为可选／不适配，而不是当前漏项。在真实宿主完成世界书写盘、删楼／重建、chat-scope MVU 复读和最终 prompt 顺序核对前，不得把这些功能写成 runtime PASS。
