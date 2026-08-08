# R2 素材发布与轻量角色卡打包手册

> **当前有效流程（2026-08-02）**：live 链已经落地。本手册后续旧 release 段落仅作 r63 及更早测试包的历史记录，禁止作为新发布步骤执行。
>
> 新发布只使用 [`live-asset-publish.md`](./live-asset-publish.md)：固定 `live/<source>`、媒体 `must-revalidate`、manifest `no-store`、媒体先传且 manifest 最后上传；UI 参数为 `--asset-mode=remote-r2-live --asset-base-url=https://ssrfrrt.ccwu.cc`。

> 给第一次接手、容易混淆“素材 staging / R2 上传 / UI 构建 / 角色卡打包”的 agent 使用。
> 从仓库根目录 `F:\agent airp\卡\幻想乡物语` 执行命令。
> 当前生产桶只有一个：`hxxwy`；生产素材域名为 `https://ssrfrrt.ccwu.cc`。

> **状态变更（2026-08-02，待实施）**：所有者已批准后续素材发布改为固定 live URL、原地更新同名
> 素材的单轨方案，不保留新的不可变 release 分支。本手册第 1–10 节描述的是 r63 及更早测试包的
> 历史流程；在 live 发布器、客户端缓存和测试完成前，禁止把旧流程当作新版本发布命令执行。新流程的
> 完整契约与实施清单在 `project/asset-delivery-and-r2-plan.md` 的“0. 已批准的单轨 live 素材迁移方案”。

## 后续 live 发布的固定坐标（规划）

```text
manifest: gensokyo-moving-garden/live/manifest.json
assets:   gensokyo-moving-garden/live/<活动 asset source>
```

- 媒体名称和请求 URL 保持不变；内容变更后仍请求同一 source。
- manifest 使用 `no-store`；媒体使用 `public, max-age=0, must-revalidate`，不得使用 `immutable`。
- 上传顺序是“覆盖全部媒体并校验 → 最后覆盖 manifest”；manifest 写入成功才代表新一代可见。
- 角色卡构建改为固定 live origin/manifest 的单一模式；发布后不再生成或固定新的 release ID。
- 在实现完成前，不执行 live 覆盖、不调整 R2 Cache Rule，也不删除旧 release。

## 先记住四句话

1. **每次素材更新都发布到新的不可变 release 前缀，绝不覆盖旧 release。**
2. **先上传全部素材，逐项校验成功后，最后上传 `manifest.json`。**
3. **轻量包最后一次 UI 构建必须运行 `npm run build:ui:remote`，其实际参数是 `--asset-mode=remote-r2-live --asset-base-url=https://ssrfrrt.ccwu.cc`。**
4. **只运行 `npm run build:ui` 会切回默认 `embedded` 模式，覆盖 `dist/runtime/ui-mount.js`，再打包就会把全素材塞进角色卡。**

## 轻量角色卡强制门禁（2026-08-02 起）

`0.2.0-r72` 曾因在打包前运行裸 `npm run build:ui`，生成 **280,326,339 bytes** 的全素材内嵌包。该文件仅作错误留档，**不得导入、不得作为当前检查点、不得用 `--replace` 覆盖修正**。

从 r73 起，`npm run package:checkpoint:dry` 与 `npm run package:checkpoint` 会要求 `dist/runtime/ui-mount.js` 含有 `remote-r2-live` 配置；若最后一次构建是 embedded，将直接拒绝打包。轻量测试包的固定顺序是：

```powershell
npm run check:ui
npm test
npm run build:ui:remote
npm run package:checkpoint:dry
# 仅在 dry-run、模式和体积都通过后：
npm run package:checkpoint
```

正式打包前必须逐项确认：

- `package:checkpoint:dry` 的 UI 脚本包含 `remote-r2-live`，不是 embedded；
- 包体不超过 **10 MiB**；超过即停止，不得以“先测一下”为由写出正式包；
- 检查点号在 `package.json`、`project/manifest.json` 和输出目录三处一致且目录不存在；
- 打包后检查 SHA-256、`collision_policy: refuse-overwrite` 与旧检查点未被覆盖；
- 文档中的“当前有效轻量包”只能指向已通过上述检查的包，错误留档不得冒充当前版本。

## 当前有效坐标

| 项目 | 当前值 |
|---|---|
| 唯一桶 | `hxxwy` |
| 生产 origin | `https://ssrfrrt.ccwu.cc` |
| 当前素材 release | `0.2.0-r62-0e5ecacdee9f` |
| 当前 manifest 声明哈希 | `0f068864b044613d4d5110ad6f7a850f7aecec1609821a90d0a5ed16cd5a8965` |
| 当前轻量卡 | `0.2.0-r92`（**已发布**） |
| 当前轻量卡大小 | `2,263,771` bytes（JSON）/ PNG 卡片 `3,852,968` bytes |
| 当前轻量卡 SHA-256 | JSON `330e78a338a2253403861b3b325fae5f4235d37d931a9b622298c5dbddbf7e47`；PNG `096061b1d6e7c06c0ffaafd80bff66fb88d98ba32e7058b0363a63c1ffb218dd` |

这些值是交接基线，不是永远不变的配置。发布新版本后，必须同步更新本文、`project/README.md`、
`project/agent-handoff.md` 与 `project/manifest.json`。

## 工具边界

| 能力 | 命令 | 是否写入 |
|---|---|---|
| 素材清单预检 | `npm run check:assets:r2` | 否 |
| 生成 release staging | `node scripts/build-runtime-assets.mjs ...` | 正式模式写入 `dist/asset-release/<release-id>/` |
| 上传计划校验 | `node scripts/publish-r2-assets.mjs --dry-run ...` | 否；该脚本**不会真实上传** |
| 真实上传 | `npx wrangler r2 object put ... --remote` | 写入 R2 |
| 远程素材 UI 构建 | `node scripts/build-ui.mjs --asset-mode=remote-r2 ...` | 覆盖 `dist/ui` 与 `dist/runtime` |
| 角色卡干跑 | `npm run package:checkpoint:dry` | 否 |
| 角色卡正式打包 | `npm run package:checkpoint` | 写入新的 `dist/checkpoint-<版本>/` |

`scripts/publish-r2-assets.mjs` 被故意限制为 dry-run-only。不要误以为运行它已经上传；真实上传仍由
Wrangler 完成。

## 完整流程

### 0. 确认授权和秘密处理

- 只有所有者明确要求“上传、发布、推送到 R2”时才能真实写桶。
- 不要把 Token、Access Key、Secret 写进仓库、Markdown、manifest、角色卡或命令参数。
- 优先让所有者在本机终端完成 `wrangler login`，或在调用 agent 前设置进程环境变量。
- 不要要求所有者把秘密粘贴进聊天；如果已经粘贴，完成后提醒轮换。
- 用 `npx wrangler whoami` 验证账户；输出账户错误时立即停止。

### 1. 确认维护源和 Git 状态

```powershell
git status --short
npm run check:assets:r2
```

正式 release staging 必须来自干净提交。若工作树有未提交内容：

- 不要使用 `--allow-dirty` 伪装生产发布；
- 不要提交与素材发布无关的用户文件；
- 先让所有者确认提交范围，或在独立 `codex/...` 工作树中只提交本次素材变更；
- `manifest.source_tree_dirty` 必须为 `false`。

### 2. 生成唯一 release ID

release ID 推荐格式：

```text
0.2.0-r<角色卡轮次>-<素材提交短哈希>
```

示例命令：

```powershell
$releaseCommit = git rev-parse --short=12 HEAD
$releaseId = "0.2.0-r64-$releaseCommit"
$assetOrigin = "https://ssrfrrt.ccwu.cc"
```

同名 `dist/asset-release/$releaseId` 或远端 manifest 已存在时，必须换新 ID；不要覆盖。

### 3. 先 dry-run，再生成 staging

```powershell
node scripts/build-runtime-assets.mjs --release=$releaseId --base-url=$assetOrigin --dry-run
node scripts/build-runtime-assets.mjs --release=$releaseId --base-url=$assetOrigin
```

成功输出：

```text
dist/asset-release/<release-id>/
  files/<运行素材相对路径>
  manifest.json
```

检查 manifest：

```powershell
$manifestPath = "dist/asset-release/$releaseId/manifest.json"
$manifest = Get-Content -Raw -Encoding utf8 -LiteralPath $manifestPath | ConvertFrom-Json
$manifest | Select-Object schema_version,release_id,source_commit,source_tree_dirty,asset_base_url,manifest_sha256
$manifest.totals
```

必须满足：

- `schema_version == gensokyo-r2-release.v2`
- `release_id == $releaseId`
- `source_tree_dirty == false`
- `asset_base_url == https://ssrfrrt.ccwu.cc`
- 文件数、总字节数和 manifest 哈希存在

### 4. 运行上传计划校验

```powershell
node scripts/publish-r2-assets.mjs `
  --dry-run `
  --bucket=hxxwy `
  --manifest=$manifestPath
```

该命令会逐文件复核路径、MIME、字节数、SHA-256、Cache-Control 和对象 key。任何错误都阻止上传。

### 5. 确认远端前缀没有已发布 manifest

```powershell
$manifestUrl = "$assetOrigin/gensokyo-moving-garden/releases/$releaseId/manifest.json"
try {
  $response = Invoke-WebRequest -Uri $manifestUrl -Method Head -TimeoutSec 20
  throw "远端 manifest 已存在，禁止覆盖：$manifestUrl"
} catch {
  if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }
}
```

只有明确得到 `404` 才能开始首次上传。如果之前上传中断但 manifest 尚未发布，只能用**同一份已校验
staging**恢复；staging 内容发生变化时必须换新 release ID。

### 6. 上传素材对象，禁止先传 manifest

下面是容易审计的串行版本。它较慢，但比错误并发脚本可靠：

```powershell
$releaseRoot = (Resolve-Path -LiteralPath "dist/asset-release/$releaseId").Path
$manifest = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $releaseRoot 'manifest.json') | ConvertFrom-Json

foreach ($file in $manifest.files) {
  $relativePath = [string]$file.source -replace '/', '\\'
  $localPath = Join-Path (Join-Path $releaseRoot 'files') $relativePath
  $objectPath = "hxxwy/$($file.key)"

  & npx.cmd wrangler r2 object put $objectPath `
    --file $localPath `
    --content-type ([string]$file.mime) `
    --cache-control ([string]$file.cache_control) `
    --remote `
    --force

  if ($LASTEXITCODE -ne 0) {
    throw "R2 上传失败：$($file.source)"
  }
}
```

不要把 manifest 放进这个循环。

### 7. 校验素材，再最后上传 manifest

至少逐项检查：

- HTTP 状态为 200；
- `Content-Type` 等于 manifest 的 `mime`；
- `Cache-Control` 等于 `public, max-age=31536000, immutable`；
- `Content-Length` 等于 manifest 的 `bytes`。

Cloudflare 可能不在 SVG 的 HEAD 响应中暴露 `Content-Length`。这不是自动通过理由；对该 SVG 执行
GET，比较实际字节数和 SHA-256。

关键新增或修改素材还应执行完整 GET + SHA-256，不能只看长度。

全部素材通过后，最后上传 manifest：

```powershell
$localManifest = (Resolve-Path -LiteralPath $manifestPath).Path
$manifestObject = "hxxwy/gensokyo-moving-garden/releases/$releaseId/manifest.json"

npx wrangler r2 object put $manifestObject `
  --file $localManifest `
  --content-type application/json `
  --cache-control no-cache `
  --remote `
  --force

if ($LASTEXITCODE -ne 0) { throw 'manifest 上传失败' }
```

随后 GET 公网 manifest，并与本地 `manifest.json` 做整文件字节比较。不同则发布失败。

### 8. 用固定 manifest 构建 remote-r2 UI

```powershell
node scripts/build-ui.mjs `
  --asset-mode=remote-r2 `
  --release-manifest=$manifestPath
```

**从这里到角色卡打包完成之间，不要再运行裸的 `npm run build:ui`。** 裸命令默认使用
`embedded`，会覆盖 `dist/runtime/ui-mount.js`，导致角色卡重新内嵌全部素材。

### 9. 更新角色卡版本并运行门禁

在 `package.json` 中把以下两个脚本更新到新的、未使用过的检查点，例如 `r64`：

- `package:checkpoint:dry`
- `package:checkpoint`

同步更新 `project/manifest.json` 的：

- `next_checkpoint`
- `planned_checkpoint_sequence`
- `runtime_artifacts.checkpoint_card`
- `runtime_artifacts.current_ui_script`
- `runtime_artifacts.current_checkpoint`

然后执行：

```powershell
npm run check:ui
npm test
node --test tests/asset-preloader.test.mjs tests/asset-release.test.mjs tests/asset-remote-resolver.test.mjs tests/r2-publish-plan.test.mjs
npm run package:checkpoint:dry
```

干跑报告必须确认：

- 输出路径是新的检查点目录；
- `collision_policy == refuse-overwrite`；
- UI 脚本 ID 与检查点一致；
- 包体通常约 2–5 MiB，而不是几十 MiB；
- `dist/runtime/ui-mount.js` 内的 `releaseId` 和 `manifestSha256` 等于本次 R2 release；
- 运行挂载通常只剩开场所需的少量 data URI；当前基线为 2 个。

若包体超过 10 MiB，先停止。最常见原因是最后一次 UI 构建变回了 `embedded`。

### 10. 正式打包与交付校验

```powershell
npm run package:checkpoint
```

正式输出的字节数和 SHA-256 必须与 dry-run 完全一致。继续检查：

- JSON 可解析且为 `chara_card_v2 / 2.0`；
- 包内 UI 脚本与交付形态一致：embedded 模式与 `dist/runtime/ui-mount.js` 逐字节一致；remote 模式为 `dist/runtime/ui-loader.js`（loader，须含 R2 `ui-manifest.json` 引用且 `ui-mount-<rN>.js` 产物已存在/已发布）；
- 包内固定的是生产 origin、新 release ID 和新 manifest 哈希；
- 包内不存在 Token、Access Key、Secret、`cloudflarestorage.com` 管理端点或开发服务器地址；
- 旧检查点文件未被覆盖。

最后报告：R2 release、manifest 声明哈希、对象数量、素材字节数、角色卡路径、角色卡字节数、
角色卡 SHA-256、测试数量，以及真实 SillyTavern 验收是否仍待执行。

## UI 远程交付（方案 A，2026-08-04 起）

目标：卡内只留 loader，UI 包与 manifest 指针放 R2，更新 UI 免重发卡。

### 固定坐标

| 对象 | 位置 |
|---|---|
| UI 包（不可变） | `https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/ui/ui-mount-r<N>.js` |
| 指针（唯一可变） | `https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/ui/ui-manifest.json` |
| 卡内 loader | `src/runtime/ui-loader.js`（构建时替换 `__UI_MANIFEST_URL__`） |

### 流程

```powershell
# 1. remote 构建（产出 ui-mount.js + ui-mount-r<N>.js + ui-loader.js）
npm run build:ui:remote -- --ui-version=r<N>

# 2. 发布 dry-run（不写桶）
node scripts/publish-ui.mjs --version=r<N> --file=dist/runtime/ui-mount-r<N>.js --dry-run

# 3. 真实上传（需所有者明确授权；凭据在 .env，勿入仓库/聊天/命令参数）
node scripts/publish-ui.mjs --version=r<N> --file=dist/runtime/ui-mount-r<N>.js

# 4. 打 remote 卡（dry-run 先）
node scripts/package-checkpoint.mjs --checkpoint=0.2.0-r<N> --dry-run --expect-remote-r2 --ui-delivery=remote
node scripts/package-checkpoint.mjs --checkpoint=0.2.0-r<N> --expect-remote-r2 --ui-delivery=remote
```

### 纪律

- `ui-mount-r<N>.js` 不可变：本地构建发现同名不同内容即拒绝，R2 发布使用 `If-None-Match: *` 原子创建；更新 = 新版本号新文件 + 改 manifest 指针。
- 上传顺序：先 ui-mount（`immutable` 长缓存）→ 公网读回并核对字节、SHA-256、Content-Type、Cache-Control → 以当前 ETag 条件更新 ui-manifest（`no-store`）→ 再次公网逐字节读回 manifest。manifest 是唯一"活"文件；并发更新会被条件写拒绝。
- loader 强制校验 schema、版本、同源固定路径、bytes 与 sha256 后再经 Blob URL import；sha256 缺失或格式错误不得降级执行。manifest 使用 `no-store`，不可变 UI 包保留浏览器缓存。
- loader 依赖安全上下文中的 Web Crypto；SillyTavern 必须通过 HTTPS 或浏览器认可的可信 localhost 打开。缺少 `crypto.subtle` 时显示明确错误，不允许跳过完整性校验。
- remote 卡 JSON 约 290KB（loader 大小随校验逻辑演进，r95 为约 4.2KB）；embedded 模式（`--ui-delivery=embedded` 或缺省）保持整包内嵌，用于开发/验收。
- 世界书仍内嵌卡内：加新角色人设仍需重发卡，但无需重打包 UI。

## 旧 R2 release 删除规则

### 默认结论：不删

角色卡会永久固定 `releaseId + manifestSha256`。旧卡、旧聊天或其他用户仍可能读取旧 release；删除后
无法自动转向新 release，只会出现缺图、无音效或 fallback。

当前明确依赖关系：

| R2 release | 已知消费者 | 当前处理 |
|---|---|---|
| `0.2.0-r62-0e5ecacdee9f` | r63 轻量卡 | 当前活跃，禁止删除 |
| `0.2.0-r55-1ef0d7d6cbab` | r56–r61 轻量卡 | 仍有兼容价值，暂不删除 |
| `0.2.0-r55-bbc0e074f993` | 早期预发布／回退路径 | 未完成消费者清点前不删除 |

### 只有同时满足以下条件才可提议删除

1. 所有者明确授权删除**精确 release 前缀**；
2. 已扫描全部保留角色卡、频道文件和部署文档，没有消费者引用；
3. 新 release 已在真实 SillyTavern 完成导入、开场、地图、GAL、战斗、音频和缓存验收；
4. 已保留本地 staging manifest、对象清单、字节数和哈希；
5. 已确认 R2 没有依赖该前缀的频道指针；
6. 已确认删除不可恢复，或桶版本控制／备份确实能恢复；
7. 删除计划经过 dry-run，精确列出对象数量和总字节数。

不要使用模糊前缀、通配符或递归删除整个 `gensokyo-moving-garden/releases/`。真正删除时应作为单独任务，
先停用 manifest，再逐项删除该 manifest 声明的对象，最后复核只影响目标前缀。

## 常见错误速查

| 症状 | 原因 | 处理 |
|---|---|---|
| 角色卡约 70–80 MiB | 最后运行了默认 embedded 构建 | 重新执行 remote-r2 构建，再用新检查点打包 |
| `publish-r2-assets.mjs` 成功但桶没变化 | 该脚本只做 dry-run | 审查计划后使用 Wrangler 上传 |
| staging 拒绝生成 | 工作树脏或同名 release 已存在 | 使用干净提交；换新 release ID，不要强行覆盖 |
| 远端 manifest 404 | 尚未发布或发布顺序正确地停在素材阶段 | 先完成素材校验，再最后上传 manifest |
| SVG HEAD 长度为 0/缺失 | Cloudflare HEAD 元数据限制 | 用 GET 比较字节与 SHA-256 |
| 新卡仍指向旧素材 | remote-r2 构建使用了旧 manifest | 用新 manifest 重建并检查包内 `releaseId` |
| 测试要求内嵌 PNG | 测试契约只考虑 embedded | 断言应允许“内嵌素材或固定可信 remote-r2”二选一 |
