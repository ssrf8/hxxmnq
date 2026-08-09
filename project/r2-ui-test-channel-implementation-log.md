# R2 UI 测试通道实施日志

> 对应规划：`project/r2-ui-test-channel-publish-plan.md`（2026-08-08 更新版：`test-r<N>` 独立递增 + 固定测试入口）
> 状态：**已实施并完成首次测试 UI 上传与验收**

## 0. 实施摘要

| 项 | 值 |
|---|---|
| 测试通道版本 | `test-r1`（首次独立递增序号） |
| R2 bucket | `hxxwy` |
| 测试 UI 目录 | `gensokyo-moving-garden/test/ui/` |
| 测试 UI manifest | `https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/test/ui/ui-manifest.json` |
| 测试 UI 包 | `https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/test/ui/ui-mount-test-r1.js` |
| 测试入口卡 | `dist/checkpoint-ui-test-entry/幻想乡物语 [UI测试版].json` |
| 正式版状态 | 完全未触碰（manifest 哈希前后一致，见 §4） |

## 1. 脚本改造（每个 Patch 的改动 / 命令 / 结果）

### Patch 1：通道建模与构建隔离 — `scripts/build-ui.mjs` + `src/runtime/ui-loader.js`

- **改动**：build-ui.mjs 新增 `UI_CHANNELS` 固定通道映射（production→`/live/ui/`+`r<N>`+`dist/runtime/`；test→`/test/ui/`+`test-r<N>`+`dist/runtime/test/`）；远程构建强制 `--ui-channel`；测试 loader 注入测试 manifest URL 与 `__UI_CHANNEL__`；构建报告写入 `ui-build-report.json`。ui-loader.js 新增编译时 `CHANNEL` 常量与按通道版本校验（测试 loader 必须显式 `channel=test`；正式 loader 兼容缺失 channel 的旧 manifest）。
- **命令**：`node scripts/build-ui.mjs --asset-mode=remote-r2-live --asset-base-url=https://ssrfrrt.ccwu.cc --ui-delivery=remote --ui-channel=test --ui-version=test-r1`
- **结果**：产出 `dist/runtime/test/{ui-mount.js, ui-mount-test-r1.js, ui-loader.js, ui-build-report.json}`；loader 只引用 `/test/ui/ui-manifest.json`，公共资产 manifest 保持 `/live/manifest.json`。
- **远端写入**：无。

### Patch 2：R2 测试发布适配器 — `scripts/publish-ui.mjs`

- **改动**：新增 `CHANNELS` 固定前缀映射、强制 `--channel=production|test`、拒绝 `--prefix`；manifest 写入 `channel` 字段；`assertChannelBoundary` 通道边界停止线；dry-run 输出人类可读计划（bucket / ui key / manifest key / bytes / sha256）并声明未写入。
- **命令**：`node scripts/publish-ui.mjs --channel=test --version=test-r1 --file=dist/runtime/test/ui-mount-test-r1.js --dry-run`
- **结果**：dry-run 计划只含 `/test/ui/` 两个写目标，无正式前缀。
- **远端写入**：无（dry-run）。

### Patch 3：固定测试入口打包 — `scripts/package-checkpoint.mjs`

- **改动**：新增 `--release-kind=production|test`；测试模式为一次性固定测试入口（`IS_TEST_ENTRY`）：卡名固定 `幻想乡物语 [UI测试版]`、输出 `dist/checkpoint-ui-test-entry/`、`character_version=0.2.0-ui-test-entry`、不绑定 UI 版本、跳过版本化副本比对、可选 `--runtime-root` 防御校验；测试模式跳过正式发布清单登记要求。
- **命令**：`node scripts/package-checkpoint.mjs --release-kind=test --ui-channel=test --runtime-root=dist/runtime/test --expect-remote-r2 --ui-delivery=remote`
- **结果**：产出固定测试入口卡，loader 只引用测试 manifest。
- **远端写入**：无。

### 版本体系修订（用户 2026-08-08 更新规划文档后）

- 规划 v1 的 `test-r<N>-g<12hex>`（git/内容哈希拼版本）废弃；v2 改为独立递增 `test-r<N>`，SHA-256 只进 manifest 不拼版本名；测试卡改为固定测试入口，日常 UI 更新不再重新打包卡。
- 据此修订了上述三个脚本与 `package-checkpoint.mjs`（见各 Patch 描述中的 v2 形态）；旧体系构建产物（`ui-mount-test-r96-ged878d80031b.js`、`dist/checkpoint-test-0.2.0-test-r96-ged878d80031b/`）已清理，旧体系未向 R2 写入任何对象。

## 2. 测试（tests/ui-channel.test.mjs，12 项）

- 构建：通道映射/版本格式/输出目录/loader 注入/构建报告。
- loader 运行时（vm）：测试通道拒绝 production/缺失 channel/正式格式版本/跨目录路径；正式通道兼容缺失 channel、拒绝 test；字节数/SHA-256 校验时机。
- 发布：通道映射/强制 channel/拒绝前缀/边界停止线；test/production dry-run 目录隔离；缺 channel、版本交叉、自定义前缀、非法通道一律失败。
- 打包：测试入口卡名固定、输出目录独立、loader 通道正确、不修改正式发布清单（`project/manifest.json` 哈希不变）。
- 全套结果：`npm test` 317/317 通过；`npx tsc --noEmit` 通过。

## 3. 首次测试 UI 上传（Patch 4，经操作者授权）

- **授权**：操作者明确选择“授权上传 test-r1 到 R2 /test/ui/”并确认序号 `test-r1`（此前 dry-run 计划已展示）。
- **命令**：`node scripts/publish-ui.mjs --channel=test --version=test-r1 --file=dist/runtime/test/ui-mount-test-r1.js`
- **结果**：
  - 上传 `gensokyo-moving-garden/test/ui/ui-mount-test-r1.js`（1.84 MB）→ 公网读回校验：1930223 bytes，sha256=`5747d73bb52371fa8d5dbfc4a65844fcca5982d3aca9c8b6f9a32fd106bcb161` ✓
  - 条件写 `gensokyo-moving-garden/test/ui/ui-manifest.json`（`channel=test`，`version=test-r1`）→ 公网读回校验 ✓
- **远端写入**：**是**（仅 `/test/ui/` 两个对象）。

## 4. Phase E 验收

| # | 验收项 | 结果 |
|---|---|---|
| 1 | 只读 R2 对象（测试 UI 不可变文件 + manifest） | ✓ 上传后公网读回校验通过 |
| 2 | 只允许 `test/ui` 前缀，正式前缀不可见 | ✓ 固定映射 + 边界停止线 |
| 3 | bucket = `hxxwy` | ✓ |
| 4 | manifest 指向 `test-r1`，URL/哈希/字节匹配 | ✓ |
| 5 | 正式 UI manifest 前后字节完全一致 | ✓ 上传前基线 sha256=`705ee69b93f2b085472742be08f7ee0cce4b330ed539bfee61e813d3e31cbe87`/336B；上传后完全一致，仍指向 r94 |
| 6 | 正式 UI 不可变对象列表不变 | ✓ `live/ui/ui-mount-r94.js` 仍 200（1859290B） |
| 7 | 后续测试更新不重新打包卡 | ✓ 固定测试入口已实现（`checkpoint-ui-test-entry/`） |

## 5. Phase F 静态检查（测试入口卡）

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 卡名固定含 `[UI测试版]`，不含 `test-r<N>` | ✓ `幻想乡物语 [UI测试版]` |
| 2 | 卡内 loader 只引用测试 UI manifest | ✓ 只含 `/test/ui/ui-manifest.json` |
| 3 | 卡内公共资产仍引用共享 `live/manifest.json` | ✓ 无 `test/assets/` 引用 |
| 4 | 卡内不包含正式 UI mount 旧副本 | ✓ 最大脚本为 loader 4841B，无大段 mount |
| 5 | 输出目录不在正式 release 目录 | ✓ `dist/checkpoint-ui-test-entry/` |

## 6. 遗留项

1. **真实 SillyTavern 运行验收**属于发布后的独立 gate，本次未做实机验收，不得以静态检查代替（规划 §Phase F 末尾）。操作者需导入 `dist/checkpoint-ui-test-entry/幻想乡物语 [UI测试版].json` 在真实 ST 中验证 UI 加载。
2. 日常更新测试 UI：构建 `test-r2` 等并走同一发布命令，**不再重新打包测试入口卡**。
3. 测试版公共资产与正式版共用 `/live/manifest.json`，测试通道不能独立试用“覆盖同路径的新图片”；若需候选资产通道需另立规划。
4. 晋升正式版：从相同源码重新走正式构建与正式发布，禁止让正式指针引用测试目录。

## 7. 排障记录：入口卡混入旧体系 loader（已修复）

- **现象**：操作者导入测试入口卡后，ST 内显示“移动庭园 UI 加载失败（R2 不可达、清单不合法，或当前页面需要 HTTPS）”。
- **排查**：R2 对象本身完全正常（manifest 200/CORS `*`/no-store；mount 200/immutable；sha256、bytes、channel、版本格式、url 派生全部校验 PASS；正式 UI 链路对照也 PASS）。
- **根因**：`dist/checkpoint-ui-test-entry/幻想乡物语 [UI测试版].json` 是在旧版本体系（`test-r<N>-g<12hex>`）loader 状态下生成的，内嵌 loader 的 `VERSION_PATTERN` 仍是 `/^test-r[1-9]\d*-g[a-f0-9]{12}$/`；而 R2 manifest version 为 `test-r1`，不匹配该正则 → loader 在下载 UI 前即抛“version 非法”并显示兜底 banner。入口卡文件生成时间（23:06:58）早于 `test-r1` 构建更新 loader（23:07:13），测试的“产物已存在则复用”逻辑未校验 loader 版本正则，掩盖了该问题。
- **修复**：删除错误入口卡 → 用当前正确的 `dist/runtime/test/ui-loader.js` 重新打包入口卡（`VERSION_PATTERN=/^test-r[1-9]\d*$/`，与构建产物逐字节一致）→ 新增防回归断言（入口卡 loader 必须为新体系正则、不得残留 g12hex 正则）→ 12 项通道测试 + 全套 317 测试通过。
- **结论**：R2 上传自始至终成功；操作者需**重新导入修复后的** `dist/checkpoint-ui-test-entry/幻想乡物语 [UI测试版].json` 并刷新页面。

## 8. 排障记录：v4 地图 404（从未上传）+ 新上传脚本两个签名 bug（已修复）

- **现象**：`gensokyo-moving-garden/live/maps/garden-base-owner-v4.webp` 加载 404。
- **根因**：v4 地图本地已合成并登记为 asset-manifest.json 的 `garden_base.source`（status=`owner-approved-v4-stitched-pending-runtime-validation`），但**从未上传到 R2**（文档与 agent-handoff 均记录“未打包（按纪律需所有者授权）”，R2 上只有 v3）。引用 v4 的 UI（如测试版 test-r1）请求该 URL → 404。
- **修复**：新增 `scripts/upload-live-asset.mjs`（单资产上传，带 live/ 前缀停止线、拒绝 live/ui 与 test/、默认 refuse-overwrite、上传后读回验收）。经操作者授权后上传 v4（新增对象，不覆盖 v3，不影响正式 r94 指针），读回校验：555344B，sha256=`b51c9234…`，MIME `image/webp`，与本地完全一致。
- **过程中的两个脚本签名 bug**：
  1. SigV4 签名密钥派生误用 `reduce` 多签了两层（`'AWS4'` 与 `secretAccessKey`），导致所有 PUT/HEAD 403 `SignatureDoesNotMatch`；改为与 publish-ui.mjs 一致的 `kDate→kRegion→kService→kSigning` 链后 HEAD 正常。
  2. `signRequest` 返回头漏掉 `...normalizedHeaders`（content-type/cache-control 未随请求发送但被计入签名），PUT 仍 403；补上后 PUT 成功。
- **Cloudflare 缓存规则提示**：`/live/maps/*` 的 **GET** 响应被 Cloudflare 规则强制为 `Cache-Control: public, max-age=14400, must-revalidate`（`cf-cache-status: REVALIDATED`），对 v3/v4 一致、源站元数据仍为 `max-age=0`；因此上传脚本的缓存头验收改用 HEAD（源站权威），内容验收保持 GET no-store 严格校验。浏览器对同名地图图片可能缓存 4 小时，源站更新后 CF 会 REVALIDATED。
- **结论**：v4 已上线，引用它的 UI（测试版/未来正式版）刷新后可见；v3 未受影响。

## 9. 测试通道迭代记录（test-r2 → test-r4，2026-08-09 存读功能实机验收）

> 背景：存读功能（`project/gal-mvu-save-load-implementation-log.md` S07）测试通道验收。全程复用 `幻想乡物语 [UI测试版]` 入口卡，未重新打包整张卡；正式版未触碰（正式 manifest 上传前后 336B / sha256=`705ee69b93f2b085472742be08f7ee0cce4b330ed539bfee61e813d3e31cbe87` / r94 一致）。

| 版本 | 内容 | 结果 |
|---|---|---|
| `test-r2` | 含存读功能的首个测试构建 | 构建/上传成功；实机验收发现保存失败（见下） |
| `test-r3` | 修复 `currentChatId()`（ST 1.18 的 `getCurrentChatId` 在 `getContext()` 上，不在顶层） | 上传成功；实机验收仍保存失败（第二个 bug） |
| `test-r4` | 修复 `snapshotMvu()`（chat scope 无 `stat_data`，需合并最后一条 assistant 楼层 `data.stat_data`；character scope 为陈旧回退） | 上传成功；**实机保存/读档验收 PASS**（存读日志 §7.2） |

### 9.1 publish-ui.mjs 两个缺陷修复（manifest 条件写 412 + 幂等续传）

- **weak ETag**：R2 S3 HEAD 返回 `W/"…"`（weak ETag），原样塞入 `If-Match` 必然 412（RFC 只允许 strong）。修复：`headObject` 剥 `W/` 前缀后再用于条件写。
- **已存在不可变对象**：`ui-mount-test-r2.js` 首传成功后脚本整体失败，重跑被"拒绝覆盖已存在"卡住。修复：ui-mount 已存在时只读回校验（字节+sha256 一致视为已上传，幂等续传），不一致仍由读回校验拒绝。

### 9.2 构建产物目录说明（B4-O01 双 profile 布局）

- 自 B4-O01 起 `build-ui.mjs` 将远程 UI 产物输出到 `dist/runtime/test/profiles/<profile>/`，并在**新 loader** 中注入 `test/ui/profiles/<profile>/ui-manifest.json`（profile-specific 坐标，不覆盖根 manifest）。
- 但 **R2 发布目标与入口卡 loader 固定为根路径** `test/ui/ui-manifest.json`（测试通道规划 v2）。本次复用旧入口卡，loader 读根 manifest → 下载根路径 mount，链路不受 profiles 布局影响。
- **遗留**：若未来用新 loader 重新打包入口卡或启用双 profile 测试，需先对齐 build 注入的 profiles manifest URL 与发布目标（发布侧尚未实现 profiles 子路径）。本次未触碰。

## 10. 测试通道迭代记录（test-r5，2026-08-09 开场流程"卡在初始页"修复）

> 背景：所有者在真实 ST 复现——「显示原生聊天 → 开始新聊天（勾选『同时删除当前聊天文件』）→ 新聊天卡在开场初始页，点『接过庭守钥』进不去」。

### 10.1 复现（test-r4，真实 ST 1.18.0）

- 打开测试卡聊天 → `#option_start_new_chat` 弹出「开始新聊天？」，勾选「同时删除当前聊天文件」→ 确定 → 新聊天出现开场页。
- 点「接过庭守钥 · 进入庭园」→ 状态栏 **「进入庭园失败：聊天已切换，请重新确认开局资料。草稿仍在，可以安全重试。」**，停留初始页；重试同样失败（非瞬时竞态）。
- 对照：不勾选删除的 `/newchat` 路径可正常进入庭园。

### 10.2 根因（`src/ui/opening.ts`）

- `OpeningController` 为单例，`context`（含 `chatId`）仅在首次 `render()` 时经 `bridge.getOpeningContext()` 初始化并**永久缓存**（`if (!this.context)`）。
- 经 ST「开始新聊天（含删除旧聊天文件）」切换聊天时，UI 常驻不重建；`CHAT_CHANGED → performRefresh → opening.render(state)` 不会刷新 `context.chatId`。
- 点「接过庭守钥」时 `commitOpening` 校验 `currentChatId() !== frozenChatId`（桥层 2144/2177 行）→ 抛「聊天已切换」→ 开场页 catch 后停留在初始页。
- 佐证：sessionStorage 的 opening-draft key 仍为旧聊天（18h05…），实时 `getContext().getCurrentChatId()` 为新聊天（18h08…）。

### 10.3 修复（test-r5）

- `OpeningController.render()` 在 `if (!this.context)` 前新增聊天切换检测：每次 render 调 `getOpeningContext()`（轻量），若 `context.chatId !== live.chatId` 则置 `context = undefined` 强制重建（重新加载新聊天的草稿或默认预填）。
- 同聊天内的普通 refresh 不重置表单输入。

### 10.4 复测（test-r5，真实 ST）

- 勾选「同时删除当前聊天文件」→ 新聊天 → 点「接过庭守钥 · 进入庭园」→ **成功进入庭园**（无名庭园 / 春·第1日·清晨 / 物资 6 / 地图正常），控制台 0 error。
