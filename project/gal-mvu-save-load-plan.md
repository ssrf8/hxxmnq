# GAL 第六批：MVU 全量存档与聊天重建规划

> 实施状态（2026-08-11）：代码逻辑与静态验收已完成；真实宿主最终操作核对仍须单独执行，不得仅凭离线测试标记 runtime PASS。

> 日期：2026-08-09
> 状态：**STATIC COMPLETE — 已施工并通过静态验收；真实宿主待验**
> 目标运行时：SillyTavern 1.18.0 + Tavern Helper / JS-Slash-Runner 4.8.18 + MagVarUpdate
> 参考：`docs/04-存档与世界书.md` 的“世界书分块存档 + 全聊天重建”思路；不得照抄汤泉卡内部字段、函数名或偏移。
> 用户最终裁定：存档由“聊天上下文 + 完整 MVU”组成；读档时分别恢复楼层和 MVU。禁止把完整 MVU 人为写成最后一个 assistant 楼层，禁止为旧楼层重新制造请求／重生成／事务元数据。

---

## 0. 一句话方案

把每个存档槽保存为当前聊天绑定世界书中的一组**永久禁用数据条目**：

```text
一个完整 MVU 数据
+ 当前已选中页的全部聊天楼层（含楼层原本已有的 data）
+ 最少的存档版本、长度和 SHA-256 校验信息
```

读档时先完整读取并校验存档，再清空当前聊天，原样重建楼层，最后调用：

```ts
await Mvu.replaceMvuData(savedMvu, { type: 'chat' });
```

重载当前聊天后，庭园 UI 从恢复的 MVU 状态重新渲染；下一次玩家发送时，现有代码根据恢复后的 `stat_data` 重新选择角色、visit、合成历史和请求配置。

---

## 1. 先回答所有者的问题

### 1.1 当前发送是不是根据 MVU 由代码选择内容

是。

当前正式游戏状态位于 MVU `stat_data`。发送和重生成不会把完整 `stat_data` 直接交给剧情模型，而是由代码读取当前状态后，按以下内容构造请求：

- 当前主目标、动作目标与登记参与角色；
- 每名角色当前／历史 visit；
- 48 条剧情梗概与 12 条关系记忆构成的 synthetic history；
- 当前场景、事件、道具和在场角色的受控投影；
- 冻结的本轮 user input 与请求配置。

因此读档后只要 MVU 和历史楼层恢复正确，后续新发送无需保存或复用旧 request metadata，会自然从恢复状态建立一条全新事务。

### 1.2 为什么楼层和 MVU 要分开恢复

- 楼层负责：让玩家查看存档时的过往聊天记录，并保留 MVU 原来已经写在各楼层 `data` 中的历史轨迹。
- 完整 MVU 负责：恢复存档时刻的当前游戏状态，供本地 UI、bridge 和后续请求构造读取。
- 世界书负责：保存多个槽位的数据，不参与剧情提示词。

禁止把三者混成“在最后一个 assistant 楼层临时塞一份最终状态”。

---

## 2. 本批范围

### 2.1 必须完成

1. 固定 `gensokyo-save.v1` 存档 schema。
2. 从当前聊天捕获全部活动页楼层和完整 MVU。
3. 把存档按 UTF-8 字节分块写入当前聊天绑定世界书。
4. 提供固定手动槽位列表、覆盖存档和读取存档。
5. 读档前完整校验，读档时清聊天、重建楼层、直接恢复 chat-scope MVU。
6. 读档成功后清理旧内存事务并重新载入 UI。
7. 失败时不留下半份聊天；破坏性阶段失败必须尝试恢复读档前内容。
8. 玩家可以在原生聊天界面查看恢复后的全部历史记录。

### 2.2 明确不做

- 不用 SillyTavern checkpoint／branch 代替游戏存档。
- 不保存旧 request、attempt、generation、commitKey、regeneration receipt。
- 不为重建楼层重新生成上述 metadata。
- 不保存未选中的 swipe；第一版只保存每楼当前活动页。
- 不允许对读档恢复的旧 assistant 楼层直接重生成。
- 不自动续跑读档前未完成的生成、结算、战斗或 GAL 演出。
- 不做自动存档、快速存档、云存档、导入／导出文件。
- 不把存档正文、MVU 或聊天内容注入剧情模型或额外更新模型。
- 不把存档写入 `localStorage`、`sessionStorage`、R2 或数据库。
- 不打包、不上传、不发布、不修改 reasonix。

---

## 3. 能力和依赖裁定

| 能力 | 来源 | 目标版本 | 用途 | 静态置信度 | 运行时状态 |
|---|---|---:|---|---|---|
| `getChatMessages(range, { include_swipes:false, hide_state:'all' })` | Tavern Helper | 4.8.18 | 捕获当前活动页楼层 | 高 | 待本批实机验收 |
| `deleteChatMessages(ids, { refresh:'none' })` | Tavern Helper | 4.8.18 | 分批清空当前聊天 | 高 | 待本批实机验收 |
| `createChatMessages(messages, { insert_before:'end', refresh:'none' })` | Tavern Helper | 4.8.18 | 分批重建楼层 | 高 | 待本批实机验收 |
| `reloadCurrentChat()` | SillyTavern / Helper 暴露 | 1.18.0 / 4.8.18 | 完成后一次性刷新 | 高 | 待本批实机验收 |
| `Mvu.getMvuData(options)` | MagVarUpdate | 当前已安装 | 捕获／复读完整 MVU | 高 | 已被现有项目使用 |
| `Mvu.replaceMvuData(data, {type:'chat'})` | MagVarUpdate | 当前已安装 | 直接恢复聊天级 MVU | 高 | 签名已由声明和源码确认；本用途待实机 |
| `getOrCreateChatWorldbook('current')` | Tavern Helper | 4.8.18 | 获取专属聊天世界书 | 高 | 待本批实机验收 |
| `getWorldbook` / `updateWorldbookWith` | Tavern Helper | 4.8.18 | 读取及单次替换槽位条目 | 高 | 待本批实机验收 |

依赖分类：

- SillyTavern：`host_required`。
- Tavern Helper / JS-Slash-Runner：`host_required`。
- MagVarUpdate：`host_required`。
- 远程 UI loader：既有 `remote_runtime`，与存档数据载体无关；UI 加载失败时原生聊天仍可用。
- 世界书存档条目：运行时数据，不是 `embedded_required` 提示词内容。

---

## 4. 数据源和所有权

| 数据 | 唯一事实源 | 写入者 | 读取者 |
|---|---|---|---|
| 当前游戏状态 | MVU `stat_data` | 既有 MVU + bridge 所有权恢复链 | UI、bridge、请求构造器 |
| 存档槽数据 | 当前聊天绑定世界书中 `extra.source='gensokyo-save-v1'` 的禁用条目 | `save-worldbook-store` | 存档列表／读档器 |
| 当前聊天历史 | SillyTavern 当前聊天楼层 | Tavern Helper 消息 API | 原生聊天、存档捕获器 |
| 存档 UI 状态 | iframe 内存 | 存档面板 | 存档面板 |

存档世界书不是第二份实时游戏状态。它只保存用户主动创建的历史副本；日常玩法永远不从存档槽读取状态。

---

## 5. 存档 schema

### 5.1 顶层 payload

```ts
interface GensokyoSaveV1 {
  schema: 'gensokyo-save.v1';
  slotId: `manual-${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'}`;
  label: string;
  capturedAt: string;
  appSchemaVersion: string;
  messageCount: number;
  messages: SavedChatMessageV1[];
  mvu: SavedMvuDataV1;
}
```

第一版固定 8 个手动槽位，不含自动槽。槽位数量属于 UI 常量，不写入 MVU。

### 5.2 楼层结构

```ts
interface SavedChatMessageV1 {
  role: 'system' | 'assistant' | 'user';
  name: string;
  is_hidden: boolean;
  message: string;
  data: Record<string, unknown>;
}
```

规则：

- 保留所有楼层，包括隐藏楼层。
- 保留当前活动页的 `message` 和该页原本已有的 `data`。
- 不保存 `message_id`；读档重建后由 SillyTavern 按数组顺序重新编号。
- 不保存 `extra`，因此不会保留或重造 GAL request／transaction／regeneration metadata。
- 不保存 `swipes`、`swipe_id`、`swipes_data`、`swipes_info`。
- `data` 是楼层原有数据的深克隆，不得把最终 MVU 人工覆盖进去。

### 5.3 完整 MVU

`mvu` 保存捕获时真实有效的完整 `MvuData`，至少包括：

- `initialized_lorebooks`；
- `stat_data`；
- 若存在则保留 `schema`、`display_data`、`delta_data`；
- 保留未知字段，避免升级时静默丢数据。

完整 MVU 的捕获来源必须是当前最新有效 MVU 数据。禁止只保存 `stat_data` 后自行拼一个残缺 `MvuData`。

### 5.4 世界书 meta 和 chunk

一个槽由一个 meta 条目和 N 个 chunk 条目组成：

```ts
interface SaveEntryExtraV1 {
  source: 'gensokyo-save-v1';
  kind: 'meta' | 'chunk';
  slotId: string;
  part?: number;
  schema: 'gensokyo-save.v1';
}

interface SaveMetaV1 {
  slotId: string;
  label: string;
  capturedAt: string;
  messageCount: number;
  chunkCount: number;
  byteLength: number;
  checksum: `sha256:${string}`;
}
```

所有存档条目必须：

- `enabled:false`；
- 空关键字；
- 禁止 incoming/outgoing recursion；
- 不设置 sticky、cooldown、delay；
- 不进入任何 model prompt。

---

## 6. 容量、分块和校验

1. 使用 `JSON.stringify(payload)` 生成 UTF-8 JSON。
2. 使用 Web Crypto SHA-256 计算完整 payload 校验值。
3. 按 UTF-8 字节安全分块，不能切断中文或 emoji 多字节字符。
4. 建议单 chunk 最大 24 KiB；最终值由聚焦测试确认。
5. 第一版单槽硬上限 8 MiB；超限时拒绝保存，不截断聊天、不删除旧槽。
6. 读取时必须验证：schema、slot、chunkCount、part 连续、byteLength、SHA-256、JSON parse、字段类型和 messageCount。
7. 任一验证失败时禁止进入删除聊天阶段。

没有弱校验回退，没有“尽量读一点”，没有损坏档自动覆盖当前进度。

---

## 7. 保存流程

### 7.1 保存前门禁

以下任一成立都禁止保存：

- generation 正在运行或停止中；
- message transaction 不是稳定 idle／settled；
- 本地 settlement、重生成或系统操作正在进行；
- `Mvu.isDuringExtraAnalysis()` 为 true；
- 当前 chat identity 在捕获期间发生变化；
- MVU 未初始化或不存在有效 `stat_data`；
- 当前没有可保存楼层。

### 7.2 捕获顺序

```text
冻结 chat identity
→ 读取全部当前活动页楼层（include_swipes:false, hide_state:all）
→ 找到当前最新有效完整 MvuData
→ 深克隆 messages 和 MvuData
→ 再次核对 chat identity、消息数量和最后楼层
→ 构造并校验 gensokyo-save.v1
→ 序列化、SHA-256、分块
```

捕获期间不写消息、不写 MVU、不触发生成。

### 7.3 写世界书

```text
getOrCreateChatWorldbook('current')
→ updateWorldbookWith(worldbook => {
     保留全部非本项目条目
     删除 source+slotId 匹配的旧 meta/chunk
     分配不冲突 uid
     一次追加新 meta/chunk
   })
→ getWorldbook 读回
→ 按完整读取流程复验
```

同一个槽覆盖时只执行一次世界书更新。写入或读回失败时旧 UI 不显示“保存成功”。

---

## 8. 读档流程

### 8.1 读档前门禁

读档使用和保存相同的静止门禁，并额外要求：

- 用户在二次确认框明确确认“当前未保存进度会被替换”；
- 目标槽已经完整读取、校验和解析；
- 目标角色卡／聊天身份仍属于当前庭园卡；
- 存档 `appSchemaVersion` 能通过现有幂等迁移器升级。

### 8.2 破坏前临时回滚副本

进入删除阶段前，在 iframe 内存捕获当前：

- 全部活动页楼层及其原有 `data`；
- 当前完整 MvuData；
- 当前 chat identity。

它只用于本次读档失败后的恢复，不写世界书、MVU、localStorage 或 sessionStorage，读档结束立即释放。这不是第二个存档槽。

### 8.3 正式恢复顺序

```text
锁定存档操作和全部玩法按钮
→ 再次确认 chat identity 未变
→ 按 message_id 倒序、每批 50 条 deleteChatMessages(refresh:none)
→ 按保存顺序、每批 50 条 createChatMessages(refresh:none)
→ 每条只恢复 role/name/is_hidden/message/data
→ Mvu.replaceMvuData(savedMvu, { type:'chat' })
→ Mvu.getMvuData({ type:'chat' }) 复读并验证 SHA-256
→ 清空旧 pending request／settlement／regeneration 内存态
→ reloadCurrentChat() 一次
→ 等待 CHAT_CHANGED + MVU 初始化／读取完成
→ UI 从恢复后的 MVU 重新渲染
```

重要：

- 不在最后一个 assistant 楼层补写最终 MVU。
- 楼层中的 `data` 只来自存档时该楼原有 `data`。
- chat-scope 完整 MVU 只通过 `Mvu.replaceMvuData(...,{type:'chat'})` 恢复。
- 重载前不允许玩家发送、重生成、战斗或操作背包。

### 8.4 失败回滚

若删除开始后任一步失败：

1. 保持全屏错误锁，不允许继续玩法。
2. 删除已经重建的目标档楼层。
3. 用内存回滚副本重建读档前楼层。
4. 用 `Mvu.replaceMvuData(previousMvu,{type:'chat'})` 恢复读档前 MVU。
5. 复读校验后 reload。
6. 回滚成功才解除锁；回滚失败则恢复原生聊天并给出明确人工处理提示。

禁止在回滚失败时自动初始化新游戏或覆盖目标槽。

---

## 9. 读档后的事务语义

1. 重建楼层不携带旧 GAL request／attempt／commit／regeneration metadata。
2. `CHAT_CHANGED` 后 bridge 必须清空：
   - `pendingRequest`；
   - `pendingHelperResult`；
   - `pendingStreamText`；
   - `pendingSettlement`；
   - `pendingOwnershipBefore`；
   - `pendingSystemOperation`；
   - regeneration session state；
   - 旧 transaction coordinator snapshot。
3. 读档完成状态固定为 idle，不自动生成回复。
4. 玩家下一次发送建立新的 V2 request、requestId、attemptId、generationId 和 commitKey。
5. 请求构造器只从恢复后的 MVU 重新选择角色记忆与 synthetic history。
6. 旧楼层可在原生聊天查看，但第一版不允许从旧楼层重新生成；只能从读档完成后的新输入继续。

---

## 10. UI 规划

位置：庭园设置页新增“存档与读档”区块，复用项目现有 dialog，不使用浏览器 `alert/prompt/confirm`。

每个槽显示：

- 槽位编号；
- 标签；
- 保存日期；
- 消息数；
- 游戏内第几日／时段（从存档 MVU 派生展示，不另存第二事实字段）；
- “保存／覆盖”和“读取”按钮。

交互：

- 空槽只显示“保存”。
- 已有槽保存必须二次确认覆盖。
- 读取必须二次确认当前进度会被替换。
- 保存／读取期间整个区块 `aria-busy=true`，按钮 disabled。
- 状态提示使用 `role=status` + `aria-live=polite`。
- 错误只显示固定安全文案，不把世界书正文、聊天正文、MVU 内容或 stack 放进 DOM。
- 不提供删除槽按钮；覆盖就是第一版唯一清理方式。

标签第一版允许 1～24 个普通字符；去首尾空格，拒绝控制字符、HTML 和超长值。标签只用于 UI 和存档 meta，不进入模型。

---

## 11. 预计源码文件

### 11.1 新建

| 文件 | 职责 |
|---|---|
| `src/ui/save-schema.ts` | schema、规范化、UTF-8 分块、SHA-256、容量检查 |
| `src/ui/save-capture.ts` | 从消息 API 和 MVU 只读捕获 payload |
| `src/ui/save-worldbook-store.ts` | 槽位列举、读、单次覆盖写入 |
| `src/ui/save-restore.ts` | 门禁、删除／重建、chat-scope MVU 恢复、失败回滚 |
| `tests/save-schema.test.mjs` | schema、中文分块、checksum、损坏档测试 |
| `tests/save-worldbook-store.test.mjs` | fake worldbook、槽覆盖、非项目条目保护 |
| `tests/save-restore.test.mjs` | fake 消息／MVU、顺序、门禁和回滚矩阵 |
| `tests/` 中存读相关用例 | 当前静态回归证据 |

### 11.2 修改

| 文件 | 仅允许的改动 |
|---|---|
| `src/ui/types.ts` | GardenBridge 存档类型与方法 |
| `src/ui/bridge.ts` | 宿主 API 适配、静止门禁、存读协调与 CHAT_CHANGED 清理 |
| `src/ui/index.html` | 设置页存档区块 |
| `src/ui/app.ts` | 槽位渲染、确认 dialog、busy 状态 |
| `src/ui/styles.css` | 仅 `.gg-save-*` 响应式样式；能复用则不改 |
| `tests/ui-contract.test.mjs` | UI 与 bridge 只读／破坏边界合同 |
| `project/README.md` | 完成后同步当前状态与导航 |
| `project/agent-handoff.md` | 完成后新增交接条目 |
| `project/api-provenance.md` | 记录 4.8.18 世界书、消息、chat-scope MVU 精确证据 |

### 11.3 禁改

- `src/ui/gal-generation-request.ts`
- `src/ui/gal-generation-request-v2.ts`（若不存在不得新造）
- `src/ui/gal-regeneration-*.ts`
- `src/ui/message-transaction.ts`
- `src/ui/character-memory.ts`
- `src/ui/synthetic-history.ts`
- `src/schema/**`
- `src/lorebook/**`
- `scripts/**`
- `package.json` / `package-lock.json`
- `dist/**`
- `reasonix.toml` / `.reasonix/**`

若实现发现必须修改以上文件，立即停止并重新裁定，不得顺手扩建。

---

## 12. 分批实施

### S00：基线与范围锁

- 重读本计划、`project/contract.md`、相关 skill 和 API provenance。
- 运行 `npm run check:ui`、`npm test`、`git diff --check`。
- 建实施日志，记录现有脏工作区，不覆盖其他批次。

### S01：纯 schema 和 codec

- 完成 payload parser、深克隆、UTF-8 分块／拼接、SHA-256、8 MiB 上限。
- 只写纯函数和 fake 测试，不接世界书、消息或 UI。
- 强制停点独立验收。

### S02：世界书槽位仓库

- 用 fake worldbook 完成 list/read/overwrite。
- 证明只替换同 source+slot 条目，未知条目逐字节保留。
- 证明所有存档条目 disabled 且不会进入 prompt。
- 强制停点独立验收。

### S03：只读捕获和保存

- 捕获活动页消息、楼层原 `data` 和完整 MVU。
- 加静止门禁、identity 双检和保存读回验证。
- 不实现读档。

### S04：破坏性读档核心

- fake 环境完成 delete→create→replace chat MVU→reload 顺序。
- 实现内存回滚副本和每一个失败注入点。
- 证明没有最后 assistant 人工 MVU 写入，也没有 metadata 重造。
- 本批风险最高，单独验收。

### S05：UI 接入

- 设置页 8 槽面板、标签、覆盖／读取确认、busy 与错误状态。
- 不增加存档以外的设置或视觉重构。

### S06：静态总验收

- 聚焦测试、check:ui、全量 test、diff check。
- 审计存档内容不存在 request／transaction／regeneration metadata。
- 审计世界书存档条目永不激活。

### S07：真实 SillyTavern 验收（后续必须）

静态测试不能证明删除／重建、世界书写盘、chat-scope MVU 和 reload 时序。必须在目标 1.18.0 + 4.8.18 实机验证后才可写 runtime PASS。

---

## 13. 强制测试矩阵

### 13.1 保存

1. 中文、emoji、多行正文分块往返逐字节一致。
2. 隐藏楼层保留。
3. 当前活动页 `data` 深克隆，输入不变。
4. 不保存 swipes、extra 或事务 metadata。
5. MVU 未就绪、额外模型运行中、generation／settlement 中拒绝。
6. 捕获期间切聊天拒绝。
7. 覆盖槽只替换该槽，其他槽和世界书条目不变。
8. 超过容量拒绝且旧槽仍可读。

### 13.2 读取和校验

1. 缺 meta、缺 chunk、重复 part、part 断层全部拒绝。
2. byteLength、checksum、schema、messageCount 任一错误都在删聊天前拒绝。
3. 非法 role、空 message 对象、非法 MVU 拒绝。
4. 旧 app schema 经现有迁移成功；无法迁移则拒绝。

### 13.3 重建

1. 删除严格倒序且批量。
2. 创建严格按原顺序且批量。
3. 重建后 role/name/is_hidden/message/data 与存档一致。
4. 不调用 `setChatMessages` 给最后 assistant 补最终 MVU。
5. `Mvu.replaceMvuData(savedMvu,{type:'chat'})` 恰好一次。
6. 复读失败触发回滚。
7. create 第 1／中间／最后批失败都能恢复旧聊天和旧 MVU。
8. reload 恰好一次；失败保持原生聊天可用。

### 13.4 读档后

1. 事务固定 idle，无自动生成。
2. 旧 request／regeneration 恢复入口不可触发。
3. UI 状态与存档 MVU 一致。
4. 玩家下一次发送创建全新 V2 request。
5. 角色 visit、48 条剧情记忆和 12 条关系记忆从恢复 MVU 正常构造。
6. 原生聊天可查看完整恢复历史。

---

## 14. 真实宿主验收矩阵

1. 新开局后保存、继续两轮、读档，金币／日期／设施／在场恢复。
2. 角色对话两轮后保存，继续、离场、再读档，visit 和关系记忆恢复。
3. 含隐藏楼层的存档读回，原生聊天楼层顺序正确。
4. 中文长聊天跨多个 chunk 保存与读取。
5. 同槽覆盖后读取的是新档，旧槽内容不可残留拼接。
6. 保存中切聊天被拒绝且两边都不受影响。
7. 读档确认后模拟世界书／消息／MVU 任一步失败，旧聊天可恢复。
8. 读档后第一次新发送正常，未恢复旧 transaction。
9. 刷新页面后槽位仍存在并可读。
10. UI loader 故障时原生聊天仍可见，存档数据不被自动改写。

真实验收不要求时机探针；只需按 UI 操作并核对最终聊天、MVU 与控制台错误。

---

## 15. 停止线

出现以下任一情况立即停止：

- `Mvu.replaceMvuData(...,{type:'chat'})` 在目标运行时无法持久化或复读不一致；
- 重建楼层时 Helper 自动改写 `data`，导致保存内容无法逐字节恢复；
- `updateWorldbookWith` 无法保证保留非本项目条目；
- 删除开始后无法通过内存副本恢复当前聊天；
- 需要把完整 MVU 人工写进最后 assistant 才能运行；
- 需要保存或重造 request／transaction／regeneration metadata 才能继续；
- 需要修改生成、重生成、角色记忆或 schema 主链；
- 单槽 8 MiB 仍不足且没有真实容量数据支持提高上限；
- 任一存档条目可能被世界书激活送入模型。

停止后只能更新计划并请求所有者裁定，不得私自换成 checkpoint、数据库或 localStorage。

---

## 16. 完成定义

本批只有同时满足下列条件才算完成：

- 8 个手动槽可保存、覆盖和读取；
- 存档保存完整聊天活动页和完整 MVU；
- 读档分别重建楼层并直接恢复 chat-scope MVU；
- 没有最后 assistant 人工状态锚点；
- 没有旧请求／重生成／事务 metadata；
- 损坏档在删除前被拒绝；
- 破坏阶段失败可以恢复读档前聊天和 MVU；
- 存档世界书条目永不进入模型；
- 静态测试和真实宿主矩阵分别留证；
- 未打包、未发布、未上传 R2、未修改 reasonix。

这套存档的产品语义很简单：**存下当时看到的聊天，以及当时完整的 MVU；读档就把两者放回去。**
