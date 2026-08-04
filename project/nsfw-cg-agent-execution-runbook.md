# 成人 CG 维护、协作 Agent 与 R2 live 更新详细操作手册

> 面向对象：不了解项目历史的主 Agent、子 Agent、人工维护者  
> 最后更新：2026-08-03  
> 当前状态：操作合同、manifest 驱动 sexual resolver、delta staging 工具均已实现；灵梦 11 张原图已在 generation 2 发布并核验  
> 安全默认：只读；没有明确阶段授权时，不复制图片、不生成 staging、不打包、不上传、不覆盖、不删除

本手册故意写得重复、明确、啰嗦。执行者不得因为“看起来懂了”跳过核对。任何一步不确定时，停在只读
状态并向所有者报告，不得用猜测补完发布事实。

## 0. 十条不可违反的总规则

1. **不得查看图片内容。** 不打开、不渲染、不截图、不生成缩略图、不用图像识别。只允许读取文件名、
   路径、扩展名、字节数、PNG 8 字节签名和 SHA-256。语义只接受所有者给出的文件名或明确映射。
2. **sexual CG 永远使用所有者原始 PNG 字节。** 不压缩、不转 WebP/JPEG/AVIF、不缩放、不裁切、不改
   Alpha、不量化、不去元数据、不重编码。
3. **本地文件存在不等于已上传。** 远端对象存在也不等于已进入活动 manifest。
4. **台账是防重复上传记录。** 每次新增、替换、上传、中断、回滚都必须更新对应角色的
   `CG/<角色>/上传台账.md`，但状态不能提前写成功。
5. **客户端必须先兼容，素材才能后上传。** 当前 resolver 已覆盖冻结的 17 pose／28 池；若命名合同新增语义，仍须先发新客户端。
6. **生产 manifest 永远最后更新。** 媒体未全部上传并从生产域名 GET 校验前，禁止写
   `live/manifest.json`。
7. **generation 必须单调递增。** 执行时重新读取远端，不得使用文档里记载的旧 generation 直接发布。
8. **同名不同哈希默认是冲突。** 没有所有者对精确 key 的覆盖授权时，立即停止，不能“以本地为准”。
9. **一个发布只能有一个协调者。** 子 Agent 可以并行做只读盘点或独立角色审计；只有主协调者能生成最终
   staging、决定 generation、写 manifest、回写台账最终状态。
10. **dry-run 不是上传成功。** 当前 `publish-r2-assets.mjs` 只输出计划，明确不会联网。没有生产 GET
    证据时，任何 Agent 都不得声称“已发布”。

## 1. 必读文档与事实优先级

执行前按顺序完整阅读：

1. `project/contract.md`：稳定红线；
2. `project/nsfw-pose-live-asset-naming-plan.md`：角色、姿势、行为、编号和固定路径合同；
3. `CG/README.md`：台账规则；
4. 本次角色的 `CG/<角色>/上传台账.md`：逐文件唯一真相；
5. `project/nsfw-cg-r2-live-update-plan.md`：当前灵梦首批计划和远端基线；
6. 本手册：执行步骤；
7. `project/asset-delivery-and-r2-plan.md`：全项目 live 缓存、manifest-last 和回滚原则；
8. `project/r2-packaging-runbook.md`：已有构建／R2 历史流程。若它仍描述旧不可变 release，以当前 live
   文档为准，不得恢复双轨。

事实冲突时使用以下优先级：

```text
所有者本轮明确指示
  > project/contract.md
  > 固定命名合同
  > 对应角色上传台账
  > 当前生产 live/manifest.json（只读重新获取）
  > 对应角色 `r2-upload-plan.json` 与当前 resolver
  > 本次执行计划
  > 历史交接记录、dist 产物和旧 release 文档
```

不能通过“选修改时间最新的文件”解决冲突。必须指出冲突双方和拟采用的事实所有者。

## 2. 阶段、授权与允许操作

| 阶段 | 允许操作 | 禁止操作 | 完成证据 |
|---|---|---|---|
| 只读盘点 | 列目录、读文本、取大小／签名／哈希、GET 公开 manifest／对象 | 打开图片、复制、改名、上传 | 盘点报告 |
| 台账准备 | 新增／修正 Markdown 台账和计划 | 改图片、写 R2 | 台账与磁盘交叉校验 |
| 客户端实现 | 改注册表、resolver、manifest 生成／验证、测试 | 生产上传、覆盖检查点 | 定向测试、全量测试、构建证据 |
| staging | 从干净提交生成新 generation 目录 | 覆盖旧 staging、写生产桶 | staging manifest 与文件哈希 |
| 上传计划 | dry-run、远端碰撞审计 | 真实 PUT／DELETE | 审查后的精确 delta |
| 生产媒体上传 | 仅上传授权 delta，逐项 GET 校验 | 先传 manifest、越权覆盖、删除 | 每项远端哈希 |
| manifest 切换 | 最后写完整 manifest | 丢失旧项、generation 倒退 | 生产 manifest GET 与整文件哈希 |
| 宿主验收 | 真实 SillyTavern 验证 | 把离线成功写成 accepted | 验收矩阵与控制台证据 |

用户只说“检查”“规划”“准备”时，默认停在台账准备；只有明确说“上传到哪个桶／开始发布／执行更新”
并确认精确目标后，才可能进入生产写入阶段。

## 3. 工作区预检

所有命令从项目根目录执行：

```text
F:\agent airp\卡\幻想乡物语
```

先记录工作区，不清理、不回退用户改动：

```powershell
git status --short --branch
```

确认 Node 与项目脚本：

```powershell
node --version
```

```powershell
Get-Content -Raw -Encoding UTF8 package.json
```

确认活动配置：

```powershell
Get-Content -Raw -Encoding UTF8 project\profile.json
```

```powershell
Get-Content -Raw -Encoding UTF8 project\manifest.json
```

若工作树已有无关改动：

- 只读盘点与文档补充可以继续；
- 不得运行正式 staging；
- 不得提交、暂存、丢弃或覆盖他人改动；
- 报告本次实际改动文件，不把整个脏树算作自己的成果。

## 4. 新图片入场：不看图的本地审计

### 4.1 发现角色目录

只列目录与文件名：

```powershell
Get-ChildItem -LiteralPath .\CG -Directory | Select-Object Name
```

```powershell
Get-ChildItem -LiteralPath .\CG\灵梦 -File | Select-Object Name,Extension,Length,LastWriteTime
```

把 `灵梦` 替换为本次目标角色。禁止使用会生成缩略图的文件管理器或图片工具。

### 4.2 检查 PNG 签名与哈希

只读取每个文件前 8 字节和完整字节哈希，不解码像素：

```powershell
$cgTarget = '.\CG\灵梦'
Get-ChildItem -LiteralPath $cgTarget -File -Filter '*.png' | ForEach-Object {
  $stream = [System.IO.File]::OpenRead($_.FullName)
  try {
    $signature = New-Object byte[] 8
    $read = $stream.Read($signature, 0, 8)
    $signatureHex = if ($read -eq 8) { ($signature | ForEach-Object { $_.ToString('X2') }) -join '' } else { 'SHORT' }
  } finally {
    $stream.Dispose()
  }
  [pscustomobject]@{
    Name = $_.Name
    Bytes = $_.Length
    PngSignature = $signatureHex
    Sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}
```

合法 PNG 签名必须严格等于：

```text
89504E470D0A1A0A
```

扩展名为 `.png` 但签名不同、文件不足 8 字节、0 字节、哈希失败时，状态写 `待分类` 并停止该文件。
不要尝试“修复格式”。

### 4.3 跨角色全局哈希查重

防止同一原图在不同角色或不同姿势下重复上传：

```powershell
Get-ChildItem -LiteralPath .\CG -Recurse -File -Filter '*.png' | ForEach-Object {
  [pscustomobject]@{
    Path = $_.FullName
    Sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
} | Group-Object Sha256 | Where-Object Count -gt 1
```

出现重复组时不要自动删除，也不要擅自判断哪份正确。把全部路径写入报告，等所有者决定：

- 同一候选的重复副本：保留一个活动映射，其余可标记 `不发布`；
- 有意让同一字节服务多个池：默认禁止，必须获得明确例外；
- 不同角色哈希相同：高度可疑，整组停止。

## 5. 从所有者文件名映射到固定语义

### 5.1 只能使用冻结词表

允许的 `pose_id` 与 `act_id` 只来自 `project/nsfw-pose-live-asset-naming-plan.md`。Agent 不得：

- 从图片内容推断；
- 自创新姿势 ID；
- 把“看不懂”归为最相近姿势；
- 用 `anal` 图填 `vaginal`，或反过来；
- 把序号 `(2)` 当成新姿势；它只表示同一池下一个候选。

文件名语义不够明确时，在台账中写 `待分类`，保留 source 空白，并向所有者询问。不要继续 staging。

### 5.2 分配候选编号

池 ID：

```text
gal.<character_id>.sexual.<pose_id>.<act_id>
```

候选编号规则：

1. 同池从 `01` 开始；
2. 查阅台账全部历史行，包括 `已替换`、`不发布`；
3. 使用从未出现过的最小编号；
4. 已使用编号永久保留，不能因文件删除而复用；
5. 范围只允许 `01–99`；超过 99 停止并升级合同。

固定 source：

```text
characters/<character_id>/gal/sexual/<pose_id>/<act_id>/<nn>.png
```

固定 R2 key：

```text
gensokyo-moving-garden/live/<source>
```

### 5.3 台账追加顺序

上传前先写台账，至少包含：

```text
所有者原文件
pose_id
act_id
candidate_no
固定 live source
字节数
本地 SHA-256
状态=待上传
远端 generation／hash=—
```

写完后必须用脚本交叉验证：台账行数等于本次盘点文件数；每个文件存在；字节与哈希一致；source 唯一。

## 6. 台账状态机

只允许以下转换：

```text
待分类
  └─ 所有者确认语义 ─> 待上传

待上传
  ├─ 所有者取消 ─> 不发布
  └─ 媒体 PUT 完成 ─> 已上传待核验

已上传待核验
  ├─ GET/哈希失败 ─> 保持原状态并停止
  └─ 媒体 GET + 活动 manifest 全部通过 ─> 已上传并核验

已上传并核验
  └─ 获准用新字节替换同 key ─> 已替换（旧历史行）+ 新行待上传
```

禁止的捷径：

- `待上传` 直接改 `已上传并核验`；
- dry-run 后改成功；
- 只看到桶对象就改成功；
- 只看到 manifest 条目但未 GET 图片就改成功；
- 覆盖原行哈希导致旧发布历史消失。

## 7. 首包代码前置：逐文件施工范围

在第一次 sexual CG 发布前，至少审查并按需要修改：

| 文件 | 必须实现的职责 |
|---|---|
| `src/ui/types.ts` | `GalSexualAct` 与 cue 字段完整、旧消息兼容 |
| `src/ui/gal-scene.ts` | `visual_mode + pose_id + act_id` 白名单归一化，不猜测 |
| `src/ui/gal-portrait-registry.ts` | 17 pose／合法 act、四段 pool ID、sexual fallback |
| `src/ui/asset-remote-resolver.ts` | v1 可选 sexual 元数据校验、未知字段兼容、失败隔离 |
| `src/ui/app.ts` 或独立 resolver | 从已验证 manifest 动态组成候选池并稳定抽取 |
| `CG/<角色>/r2-upload-plan.json` | 台账映射的机器可读镜像；owner 文件、source、pool 元数据、字节与原图哈希 |
| `scripts/prepare-cg-r2-update.mjs` | 从最新生产 manifest 生成完整下一 generation、原字节 delta staging 与上传计划 |
| `scripts/build-runtime-assets.mjs` | 继续负责非 sexual 的常规 `src/assets` 运行素材；不得把 CG 重复塞进角色包 |
| `scripts/publish-r2-assets.mjs` | dry-run 验证 sexual 元数据、碰撞策略和 manifest-last |
| `tests/ui-contract.test.mjs` | pose／act／fallback／候选解析合同 |
| `tests/asset-remote-resolver.test.mjs` | v1 扩展、恶意路径、错误 MIME／hash／pool 隔离 |
| `tests/asset-release.test.mjs` | 原图→维护源→staging 哈希一致、禁止 WebP 派生 |
| `tests/r2-publish-plan.test.mjs` | delta、碰撞、generation、媒体先传、manifest 最后 |

如果实现者发现实际职责位于其他文件，可以调整文件范围，但必须在交接中记录“为何改变”和“新事实
所有者”。不得为了省事把所有逻辑堆进 `app.ts`。

## 8. 首包必须新增的测试

最低测试矩阵：

### 8.1 合法输入

- 11 个灵梦 source 全部进入 manifest；
- 9 个 pool 唯一；
- 两个双候选池均含 `01/02`；
- `missionary/rear/prone/rear_standing/cowgirl` 的现有合法 act 可解析；
- 同一 chat/message/swipe/generation 重绘选择相同候选；
- 新 generation 允许重新选择。

### 8.2 缺图与非法输入

- 其余 19 个灵梦预留池为空时回退 nude／normal；
- `anal` 不得回退 `vaginal`；
- `normal/nude` 强制 `pose_id=default`、`act_id=none`；
- 未知 pose、未知 act、编号 `00/100`、重复 asset ID、重复 source、错误 pool ID 被拒绝；
- `.webp` sexual 路径、`image/webp`、路径穿越、反斜杠、中文运行路径被拒绝；
- manifest sexual 增强层失败时核心 184 项仍可用，正文与结算不阻断；
- 成人内容开关关闭时不发出 sexual 网络请求。

### 8.3 原图不变

- `CG/<角色>/<原文件>.png`、活动维护源、staging 三方字节数与 SHA-256 一致；
- sexual 文件没有 `.webp/.jpg/.avif` 派生物；
- build 或 compress 命令不会改写 sexual PNG；
- MIME 固定 `image/png`。

## 9. 本地验证命令顺序

代码实现后依次运行，前一步失败就停止：

```powershell
npm run check:ui
```

```powershell
npm test
```

```powershell
npm run build:ui:remote
```

不要直接运行默认 embedded 构建后打轻量包；历史上已经出现过肥包事故。

本轮只做素材 staging 时，不自动打包角色卡。只有用户明确要求生成新检查点，才运行对应的
`package:checkpoint:dry` 和正式 package 命令。

## 10. 生产 manifest 只读预检

每次执行都重新获取，不使用文档快照：

```powershell
$liveManifestUrl = 'https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/manifest.json'
$remoteManifest = Invoke-RestMethod -Uri $liveManifestUrl -Method Get -TimeoutSec 20
$remoteManifest | Select-Object schema_version,generation,updated_at,source_commit,manifest_sha256
```

统计 sexual 条目：

```powershell
@($remoteManifest.files | Where-Object { $_.source -like 'characters/*/gal/sexual/*' }).Count
```

记录响应头：

```powershell
$manifestResponse = Invoke-WebRequest -Uri $liveManifestUrl -Method Get -TimeoutSec 20 -UseBasicParsing
$manifestResponse.Headers | Select-Object 'Content-Type','Cache-Control','ETag','Last-Modified'
```

预期：HTTP 200、`application/json`、`Cache-Control: no-store`、schema `gensokyo-r2-live.v1`、正整数
generation。任何不同都停止，不能自动“修正远端”。

## 11. 选择新 generation

```text
targetGeneration = 执行时远端 generation + 1
```

例如文档记录远端 generation 1，只说明当时下一代暂定 2。若执行时远端已经是 3，本批必须重基于 3
生成 4，不能再发布 2。

记录基线四元组：

```text
remote generation
remote ETag（若有）
remote manifest_sha256
remote totals.files / totals.bytes
```

在最终 manifest PUT 前再次 GET；任一值变化都说明有并发发布，整批停止并重新生成 staging。

## 12. CG delta staging：从执行时最新生产 manifest 生成

设目标 generation 为 2，仅作示例：

```powershell
node scripts/prepare-cg-r2-update.mjs `
  --plan='CG/灵梦/r2-upload-plan.json' `
  --manifest-url='https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/manifest.json'
```

dry-run 必须核对：

- 文件总数 = 最新远端文件数 + 新增数 − 明确移除数；本批默认不移除；
- 总字节等于逐项求和；
- 11 个灵梦 source 恰好出现一次；
- sexual MIME 全是 `image/png`；
- 不存在意外 WebP sexual 文件；
- generation 等于目标 N；
- `previous_manifest_sha256` 必须等于执行时生产清单；manifest PUT 前还要再比一次。

预期新建：

```text
dist/r2-updates/generation-2-reimu/
  files/characters/reimu/gal/sexual/...
  manifest.json
  upload-plan.json
```

脚本会重建同名未发布 delta 目录，因此它是工作产物，不是历史数据库；发布证据必须回写角色台账。若生产
generation 已变化，必须重新运行脚本，让它自动选择新的 `remote generation + 1`，不得复用旧 manifest。

## 13. staging 原字节与结构审计

对台账每一行比较：

```text
CG 原文件 SHA-256
= CG/<角色>/r2-upload-plan.json 声明 SHA-256
= dist/r2-updates/generation-N-<character>/files/<source> SHA-256
= staging manifest file.sha256
```

同时要求字节数一致、扩展名 `.png`、MIME `image/png`。

manifest 全局检查：

- `totals.files === files.length`；
- source、key、logical ID 全局唯一；
- `key === gensokyo-moving-garden/live/<source>`；
- 所有旧项仍存在，除非本轮有单独删除授权；
- 完整 manifest 去掉 `manifest_sha256` 后，以两空格缩进和末尾换行重新序列化所得 SHA-256 等于声明值；
- `source_tree_dirty=false`；
- `asset_base_url=https://ssrfrrt.ccwu.cc`。

## 14. 生成上传 dry-run 计划

示例：

```powershell
node scripts/publish-r2-assets.mjs --dry-run --bucket=hxxwy --manifest=dist/asset-live/generation-2/manifest.json
```

当前脚本会校验 staging 并输出所有对象计划，但**不会上传**。必须确认输出包含：

```text
mode = dry-run-only
bucket = hxxwy
generation = N
manifest_key = gensokyo-moving-garden/live/manifest.json
upload_order = files-in-manifest-order, manifest-last
```

现有脚本输出全量对象，不等于实际应重复上传全量。真实上传器应通过远端 manifest 与 staging hash 计算
delta：未变对象跳过、新对象上传、同 key 不同 hash 进入冲突队列。

## 15. 逐 key 远端碰撞审计

对每个新增／替换候选请求生产 URL。决策表：

| 远端结果 | 本地／远端哈希 | 行动 |
|---|---|---|
| 404 | — | 允许列为新增 PUT |
| 200 | 相同 | 不重复上传；列为“远端已有、manifest 待登记” |
| 200 | 不同 | 冲突；停止，等待精确覆盖授权 |
| 200 | MIME 非 `image/png` | 冲突；停止 |
| 3xx、401、403、5xx、超时 | — | 环境／权限异常；停止 |

不能只信 ETag，因为它不保证等于 SHA-256。必须 GET 完整字节并本地计算哈希。

碰撞审计结果保存到本次执行记录，至少包含 key、HTTP、bytes、MIME、cache-control、本地 hash、远端 hash、
判定。不要把秘密请求头写进记录。

## 16. 真实上传合同

generation 2 已使用受控 Wrangler 完成真实上传；`prepare-cg-r2-update.mjs` 负责确定性 staging，Wrangler
只负责执行已经审计的 PUT。未来 Agent 不得脱离 `upload-plan.json` 随手拼 key，也不得仅凭 Wrangler 的
`Upload complete` 宣称发布完成。

若未来封装一键上传器，必须满足：

```text
输入：显式 bucket、staging manifest、预期远端 generation、预期 ETag/manifest hash、授权模式
输出：delta 计划、逐对象结果、最终 manifest 结果、可机器读取的审计 JSON
默认：dry-run
真实写入：必须显式 --apply，并要求精确确认参数
范围：只允许 gensokyo-moving-garden/live/
顺序：媒体 delta -> 逐项 GET 校验 -> 并发基线复查 -> manifest last -> 最终 GET 校验
删除：永远不在本流程自动执行
秘密：只从进程环境或受控凭据提供器读取，不写仓库、不回显
```

在没有当次明确授权时，本手册的执行终点仍是“staging 与碰撞审计通过”。

## 17. 生产写入步骤

只有用户明确授权本次目标桶、前缀和 generation 后执行：

1. 保存最终 dry-run 计划与远端基线四元组；
2. 上传 delta 中 404 的媒体对象；相同哈希对象跳过；不同哈希对象已在前一步阻断；
3. 每个媒体 PUT 后立刻从生产自定义域名 GET，验证 HTTP 200、`image/png`、字节数、SHA-256、
   `max-age=0, must-revalidate`；
4. 台账暂时改为 `已上传待核验`，但 manifest generation 仍留空；
5. 再次 GET 当前生产 manifest，对比 generation、ETag、manifest hash。与基线不同则停止，不传 manifest；
6. 用 staging 的完整 manifest 覆盖唯一 key `gensokyo-moving-garden/live/manifest.json`，头为
   `application/json` 与 `no-store`；
7. 从生产域名重新 GET manifest，验证 generation、完整哈希、总量与每个新增条目；
8. 再次 GET 新媒体代表项或全部新增项，证明 manifest 指向的字节仍正确；
9. 最后把台账改为 `已上传并核验`，写 generation、远端 SHA-256、UTC 时间和执行记录路径；
10. 运行真实 SillyTavern 验收。在完成前结果仍是 candidate，不是 accepted。

## 18. 中断与回滚

### 18.1 媒体上传一半，manifest 未改

- 不删除已经上传的正确对象；
- 台账对应行保持 `已上传待核验`；
- 下次碰撞审计会发现相同哈希并复用；
- 活动客户端仍看不到这些对象，不构成正式发布。

### 18.2 媒体全部上传，manifest PUT 失败

- 不重传媒体；
- 重新读取远端 manifest，确认没有并发更新；
- 若基线未变，可在授权仍有效时重试 manifest；
- 若基线变化，重新生成更高 generation 的完整 staging。

### 18.3 manifest 已更新，但客户端验收失败

- 不把 generation 倒退；
- 生成更高 generation，其文件表恢复上一份已验证 manifest 内容；
- 媒体对象暂时保留，不自动删除；
- manifest 最后上传并重新验收；
- 台账记录失败 generation 与回滚 generation。

### 18.4 同名错误字节已经进入活动 manifest

- 立即停止继续发布；
- 优先用更高 generation 从活动文件表移除该候选，让客户端回退；
- 再修复同名媒体并 GET 验证；
- 最后用再高一个 generation 重新加入；
- 禁止只覆盖图片而不改变 manifest generation，因为客户端和离线缓存可能仍持有旧字节。

## 19. 多 Agent／子 Agent 协作规则

### 19.1 唯一协调者

主协调者独占：

- 选择目标 generation；
- 修改最终 asset manifest；
- 生成正式 staging；
- 合并上传 delta；
- 发起任何生产写入；
- 最后写 `live/manifest.json`；
- 把台账改为 `已上传并核验`；
- 输出最终发布报告。

### 19.2 可委派的独立任务

子 Agent 只能接收边界清楚、互不重叠的任务，例如：

- 只读审计某一个角色目录的文件名／大小／签名／哈希；
- 将某一角色台账与磁盘做交叉校验；
- 审查 resolver 代码，不修改；
- 为某个测试文件补测试；
- 对一组明确 URL 做只读碰撞审计；
- 复核 staging 中某一角色的原字节哈希。

不应同时让两个 Agent：

- 编辑同一角色台账；
- 编辑同一 manifest 或 registry；
- 生成不同 generation 的正式 staging；
- 上传同一批 key；
- 更新生产 manifest。

### 19.3 子 Agent 任务模板

```text
任务：只读审计 <角色> CG
允许读取：CG/<角色>/、CG/<角色>/上传台账.md、固定命名合同
禁止：查看图片、修改图片、改名、复制、上传、修改其他角色台账
输出：文件数、总字节、每项 name/bytes/signature/sha256、重复组、台账差异
停止条件：语义不明确、签名错误、台账冲突、跨角色重复哈希
```

### 19.4 子 Agent 返回格式

要求返回机器可读 JSON，避免主协调者从散文里猜状态：

```json
{
  "character_id": "reimu",
  "mode": "read-only",
  "files_seen": 11,
  "bytes": 27877219,
  "png_signature_pass": 11,
  "duplicate_hash_groups": 0,
  "ledger_rows": 11,
  "ledger_errors": [],
  "writes": [],
  "blocked": false,
  "block_reason": null
}
```

主协调者必须自己复核关键计数与哈希，不能只因子 Agent 说“通过”就进入上传。

## 20. 必须停止并请求所有者的情况

任一条件成立立即停止：

- 文件名无法唯一映射冻结 pose／act；
- 用户没有确认角色成年、自愿与公开分发边界；
- PNG 签名错误或文件损坏；
- 跨角色重复 SHA-256；
- 同池候选编号冲突；
- 发现第 18 个新姿势语义、第三种插入 act 或候选超过 99；
- 本地维护源与所有者原图哈希不同；
- 工作树脏但准备生成正式 staging；
- 目标 generation 目录已存在；
- 远端 generation／ETag／manifest hash 在执行中变化；
- 同 key 远端哈希不同；
- R2 凭据、桶、前缀或授权范围不明确；
- 上传器只有 dry-run、没有受审查的真实写入入口；
- 任何测试失败；
- 真实 SillyTavern 尚未验收却有人要求标记 accepted。

## 21. 最终报告模板

```text
阶段：盘点 / 实现 / staging / 上传计划 / 媒体已上传 / manifest 已切换 / candidate / accepted
角色：
本地文件数与字节：
台账路径：
新增 pool / candidates：
原图哈希一致性：
远端基线 generation / ETag / manifest hash：
目标 generation：
staging 路径 / manifest hash：
碰撞审计：404 / same-hash / conflict 数量
媒体上传：成功 / 跳过 / 失败
manifest-last：是否完成
生产 GET 验证：
台账最终状态：
运行测试：check:ui / npm test / remote build / R2 专项
真实 SillyTavern：pending / passed
写入文件：
保留与未删除对象：
阻塞或后续动作：
```

禁止使用含糊结论：“大概上传了”“应该生效”“R2 看起来正常”“测试基本通过”。所有结论必须附精确
计数、generation、哈希或明确的 pending 状态。

## 22. 当前灵梦基线速查

截至 2026-08-03：

```text
CG/灵梦 PNG：11
本地总字节：27,877,219
PNG 签名通过：11/11
重复 SHA-256 组：0
逻辑池：9
双候选池：cowgirl.vaginal、missionary.anal
生产 manifest：gensokyo-r2-live.v1 generation 1
生产总量：184 files / 208,627,661 bytes
生产 sexual entries：0
当前台账状态：11 条均为待上传
本轮是否已上传：否
```

这些数字只用于发现异常，不可替代执行时重新盘点和重新读取生产 manifest。
