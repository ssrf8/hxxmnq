# Cloudflare R2 部署准备与交接

> 状态：唯一桶、CORS、首个不可变 release、`r2.dev` 公开读取、`remote-r2` 构建与浏览器预发布验收均已完成；生产自定义域名与真实 SillyTavern 验收待继续。
> 优先队列、最低可玩集、GAL 门控／抢占和三次尝试已实现并通过浏览器验收；可选 Cache Storage 服务模块已完成，但设置页离线包开关尚未接入。
> 2026-08-01 所有者决策：整个项目只使用一个 R2 桶；禁止为 GAL、战斗、音频或不同 release
> 自动创建第二个业务桶。

## 当前部署结论

- 首版采用“公开只读 R2 + Cloudflare 自定义域名”，只托管已批准的运行图片和音频。
- SillyTavern 角色卡仍是应用宿主；本阶段不是 Pages 网站部署，也不需要 Worker。
- `r2.dev` 只用于短期预发布检查，生产使用自定义域名和 Cache Rule。
- 现有 `embedded` 构建保持默认且不变；远端素材失败不能影响对话、玩法或结算。
- 客户端默认依赖不可变 URL 的浏览器 HTTP 磁盘缓存；版本化 Cache Storage 仅作为设置页主动开启的
  离线包，不注册影响 SillyTavern 宿主的 Service Worker。
- 开场只等待最低可玩集。弹幕对手包按场景加载；GAL 图始终最低后台优先级，实际触发的单图可抢占。

## 单桶部署边界

唯一桶内按前缀隔离，不按业务拆桶：

```text
gensokyo-moving-garden/
  releases/<release-id>/...
  gal-pools/<gal-pool-release-id>/...
  channels/stable.json
  channels/gal-stable.json
```

- `releases/**` 与 `gal-pools/**` 都不可变；频道文件是唯一允许更新的短缓存对象。
- 核心 release 与 GAL pool 各自有 manifest，发布工具只能操作本次 manifest 明确列出的前缀。
- 同一桶只配置一份 CORS、一个生产自定义域名和一个最小权限上传入口。
- 首版公开桶只允许公开分发素材；本地成人内容开关不是对象访问控制。未来若必须私有化，保留
  单桶但关闭直接公开读取，并让全部对象统一经过经安全评审的 Worker。

## 已准备的本地工具

生成部署预检，不写 `dist`：

```powershell
npm run check:assets:r2
```

生成一个新的、不可覆盖的 release staging：

```powershell
$env:R2_RELEASE_ID = '0.2.0-r55-<git短哈希>'
$env:R2_ASSET_BASE_URL = 'https://<素材域名>'
npm run build:assets:r2
```

输出结构：

```text
dist/asset-release/<release-id>/
  files/<运行素材相对路径>
  manifest.json
```

生成器只读取 `src/assets/asset-manifest.json` 中被当前 UI 构建消费的活动运行素材，逐文件写入 MIME、字节数、SHA-256、Cache-Control 和对象 key。它拒绝绝对路径、越界路径、符号链接、中文对象路径、source/frames、chroma、Aseprite 和历史归档；已有 release staging 也拒绝覆盖。
正式 staging 还会拒绝脏工作树，确保 `manifest.json` 的 `source_commit` 能唯一追溯来源；开发中的脏工作树只运行 dry-run。

## 已部署状态（2026-08-01）

- `gensokyo-r2-release.v2` 已为 114 项加入调度合同；开场图继续只内置，不进入 release。
- UI 默认仍是 `embedded`。`remote-r2` 只接受构建参数指定的干净 staging manifest，并在运行时先校验固定 HTTPS origin、release ID、manifest SHA-256、schema、对象 key、MIME、字节与逐文件哈希字段；不读取 query、`localStorage` 或模型文本。
- `scripts/publish-r2-assets.mjs` 仍只有强制 `--dry-run` 路径，必须显式唯一 bucket 与 `dist/asset-release/<release>/manifest.json`；它逐项复核 staging 并输出素材对象及最后发布的 manifest，不读取秘密，也没有 live 网络分支。
- 首轮正式 staging 从干净提交 `bbc0e074f993` 生成，release ID 为 `0.2.0-r55-bbc0e074f993`，asset base 为 `https://pub-ca2a1f21ebf84a1393fc91f61b87a1c4.r2.dev`。
- 唯一桶：`hxxwy`（APAC）。桶内已上传 114 个素材对象和最后发布的 manifest，共 115 个对象、`55,050,924` bytes；素材本体为 `54,968,893` bytes。
- release manifest SHA-256：`75c797954353be3d5272a7649c9e6491b151aae43743ebd8406165724a83c08e`。远端 manifest 元数据、公开 GET、MIME、长度和缓存头抽检通过。
- CORS 已允许匿名 GET/HEAD 与 `Range`，暴露 `Content-Length`、`Content-Range`、`ETag`，预检缓存上限为 7200 秒。
- 远程前端浏览器验收：入口 16/16，总调度 114/114，失败 0；10 张 GAL 立绘在非 GAL 队列后静默完成，页面控制台无 warning/error。
- `RuntimeAssetOfflineCache` 服务模块已完成，但设置页显式开关尚未接入；当前实际生效的是浏览器 HTTP cache。不得把可选离线包描述成已启用。

## 生产自定义域名待办

1. 目标生产素材域名为 `ssrfrrt.ccwu.cc`，应绑定到同账号唯一桶 `hxxwy`，最低 TLS 建议 1.2。
2. 当前 Cloudflare 管理 Bearer Token 返回 401，本机 Wrangler 也未登录；必须先恢复浏览器登录，或提供新的最小权限管理 Token。S3 Access Key 只能上传对象，不能替代 R2 自定义域名管理权限。
3. 绑定后等待 ownership 与 SSL 均为 active，再验证根路径、固定 release manifest、代表性 WebP/PNG/SVG/WAV、CORS、Range、MIME、长度和缓存头。
4. 自定义域名会改变 manifest 中的固定 asset origin，因此必须生成新的不可覆盖 release ID；不得直接篡改或覆盖 `0.2.0-r55-bbc0e074f993`。
5. 用新 release 重建 `remote-r2` 前端，复验入口 16/16、总计 114/114、失败 0、GAL 静默加载和控制台。
6. 完成真实 SillyTavern Origin 的 Canvas 像素读取、WebAudio、缓存复用、切卡、断网／慢网与 fallback 验收后，才决定是否关闭 `r2.dev`。

## 继续部署需要的条件

- Cloudflare 控制台登录态，或只放在本机秘密环境中的新最小权限管理 Token；
- 确认 `ssrfrrt.ccwu.cc` 所属 Zone 与桶 `hxxwy` 位于同一 Cloudflare account；
- 真实 SillyTavern 预发布与正式切换授权。

任何 Access Key、Secret、API token 都不得写入仓库、角色卡、manifest、命令参数或聊天记录。
