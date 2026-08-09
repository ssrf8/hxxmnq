# GAL MVU 存档／读档实施日志

> 实施计划：`project/gal-mvu-save-load-plan.md`
> 范围：八个手动槽；聊天世界书持久化；聊天楼层重建；chat-scope MVU 直接恢复。
> 禁区：不修改生成／重生成／角色记忆／schema 主链，不打包、不发布、不修改 reasonix。

## S00 基线与裁定

- 日期：2026-08-09
- 裁定：新增功能采用分阶段实现；破坏性读档核心独立验收，不扩大为生成链重构。
- `npm run check:ui`：PASS。
- `npm test`：PASS，678/678。
- `git diff --check`：PASS（仅既有 LF/CRLF 提示）。
- `reasonix.toml` / `.reasonix/**`：无待提交变化。
- API 边界：Helper 4.8.18 声明具备消息读写、聊天世界书和更新 API；MVU 支持 `type:'chat'`。静态证据不等于真实宿主时序 PASS。

## S01 schema、codec 与捕获

- 状态：PASS（静态）。
- 约束：只保存活动 swipe 的 `role/name/is_hidden/message/data`，明确丢弃 `extra` 与全部 swipe 元数据；完整 MvuData 单独保存。
- 聚焦测试：`tests/save-schema.test.mjs` 5/5 PASS；读取 payload 时再次执行消息字段白名单，夹带的 `extra/swipes` 不会进入重建参数。

## S02 聊天世界书槽位仓库

- 状态：PASS（静态）。
- 同槽覆盖仅调用一次更新；保留其他槽及非项目条目；meta/chunk 全部 `enabled:false`、空关键词、禁双向递归、概率 0。
- 聚焦测试：`tests/save-worldbook-store.test.mjs` 4/4 PASS；额外证明任一存档条目被启用即拒绝读取。

## S03/S04 保存与破坏性读档

- 状态：PASS（静态）。
- 裁定：完整 MVU 仅使用 chat-scope API 恢复；没有最后 assistant 状态锚点。
- 恢复顺序：按 message_id 倒序每批 50 删除，按原序每批 50 创建，直接替换 chat-scope MvuData，复读哈希，清瞬态，正常路径 reload 一次。
- 回滚：delete、第一／第二 create 批和 replace 失败均由 fake-host 证明恢复旧消息与旧 MVU。
- 聚焦测试：`tests/save-restore.test.mjs` 8/8 PASS；包含正常路径 reload 失败后的回滚与第二次 reload。

## S05 UI 与宿主接入

- 状态：PASS（静态）。
- 设置页固定 8 槽；已有槽覆盖前确认，读取前确认；复用内置 dialog；busy、`role=status` 与固定安全错误文案齐全。
- Host Shell 转发消息／世界书能力；平铺 global 缺失时只为新增能力从 `TavernHelper` 门面补齐。reload 兼容 `SillyTavern.reloadCurrentChat`。
- UI/Bridge 合同测试 1/1 PASS。

## S06 静态总验收

- `npm run check:ui`：PASS。
- `npm test`：PASS，696/696。
- `git diff --check`：PASS（仅既有行尾提示）。
- reasonix：未修改。
- 未构建、未打包、未发布、未上传 R2。

## 最终裁定

第六批代码逻辑施工完成，静态封账。真实 SillyTavern 的聊天世界书写盘、楼层重建保真、chat-scope MVU 持久化与 reload/CHAT_CHANGED 最终收敛仍标记为 **UNVERIFIED**；不得把本日志写成实机 PASS。按所有者要求，无需探针或时机演示，后续只做最终 UI 操作核对即可。

## S07 实机验收（2026-08-09，测试通道 test-r1→test-r4）

> 测试通道实施见 `project/r2-ui-test-channel-implementation-log.md`；入口卡 `幻想乡物语 [UI测试版]`（已指向 /test/ui/）全程复用，未重新打包整张卡。

### 7.1 首次实机保存失败 — 两个真实宿主契约 bug（test-r2 验收发现）

静态测试（mock）未覆盖的真实宿主差异，逐一定位并修复，全部在 `src/ui/bridge.ts`：

1. **`currentChatId()` 调用了错误的 API 位置**：ST 1.18 中 `getCurrentChatId` 位于 `SillyTavern.getContext()` 返回的 context 上，不在 `SillyTavern` 顶层。原实现只查顶层 → 恒返回 `''` → `captureSavePayload` 抛"当前聊天身份不可用"。
   - 修复：顶层与 context 两处探测（`direct ?? viaContext ?? ''`）；类型 `getContext()` 返回类型补 `getCurrentChatId`。
2. **`getMvuData({type:'chat'})` 不返回 `stat_data`**：真实 MagVarUpdate 中 chat scope 只有会话变量（zhihuiji/output_language/…），`stat_data`（庭园状态）持久化在**每条 assistant 消息楼层的 `data.stat_data`**（与 `latestPersistedState` 同源）；`getMvuData({type:'character'})` 的 `stat_data` 是陈旧副本（initialized:false，仅作回退）。原 `readMvuData` 只读 chat scope → `captureSavePayload` 抛"MVU 尚未初始化"。
   - 修复：新增 `snapshotMvu(mvu)` —— chat scope 数据 + 最后一条 assistant 楼层 `data.stat_data`（楼层读取失败回退 character scope）；save/restore 两处 `readMvuData` 统一改用。
   - 佐证（真实宿主探测）：`getMvuData({type:'chat'})` 18 键无 stat_data；`{type:'character'}` 1 键 stat_data（陈旧）；消息楼层 `{type:'message', message_id}` 的 stat_data 为当前态（initialized:true, opening_committed:true）。

另：发布链 `publish-ui.mjs` 修复两个缺陷（见测试通道实施日志 §8）：R2 S3 HEAD 返回 weak ETag（`W/"…"`）导致 manifest 条件写 412 → headObject 剥 `W/` 前缀；ui-mount 已存在时改为读回校验幂等续传（内容不一致仍拒绝）。

### 7.2 实机验收记录（test-r4，2026-08-09）

- 保存：设置与恢复 → 01 号槽 → 标签"验收-r4-初始" → 状态"保存完成"；槽位显示 `2026/8/9 17:39:05 · 7 层 · 第1日·白昼`。
- 覆盖前确认 / 读取前确认：两个确认对话框均出现并正常走通。
- 读档：先推进剧情 1/11→4/11（制造差异）→ 01 号槽"读取"→"确认读取"→ 楼层重建 + reload。
- 读档后：剧情回到 1/11（存档时位置）、楼层 7 条不变、控制台 0 error。
- 聊天世界书（Chat_Book_UI_…）内已真实写入 `[幻想乡存档] slot01` meta + chunk 条目并复读校验通过；探针条目已清理。

### 7.3 状态变更

- 聊天世界书写盘、楼层重建保真、chat-scope+stat_data MVU 持久化、读档后 UI 收敛：**实机 PASS**（以上操作记录）。
- 未触碰正式版名称 / 正式目录 / 正式 manifest（上传前后正式 manifest 336B / sha256=705ee69b… / r94 一致）。
- 测试通道当前版本：`test-r4`（R2 `gensokyo-moving-garden/test/ui/`）。
- 正式通道晋升：**未执行**，待所有者决定。
