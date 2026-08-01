# Cloudflare R2 部署准备与交接

> 状态：本地发布清单与干净 staging 已具备；真实建桶、CORS、域名绑定、上传和运行时 `remote-r2` 接线尚未执行。
> 优先队列、最低可玩集、GAL 抢占与可选 Cache Storage 也仍是待实现合同；当前加载器不可作为该合同的运行验收证据。
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

## Cloudflare 侧待执行步骤

## 上传前本地实现状态（2026-08-01）

- `gensokyo-r2-release.v2` 已为 114 项加入调度合同；开场图继续只内置，不进入 release。
- UI 默认仍是 `embedded`。`remote-r2` 只接受构建参数指定的干净 staging manifest，并在运行时先校验固定 HTTPS origin、release ID、manifest SHA-256、schema、对象 key、MIME、字节与逐文件哈希字段；不读取 query、`localStorage` 或模型文本。
- `scripts/publish-r2-assets.mjs` 当前只有强制 `--dry-run` 路径，必须显式唯一 bucket 与 `dist/asset-release/<release>/manifest.json`；它逐项复核本地 staging 的路径、字节、SHA-256、MIME 与 Cache-Control，输出素材对象及最后发布的 manifest。它不会读取秘密，也没有 Cloudflare API、Wrangler 或网络调用。
- 脏工作树只运行 `check:assets:r2` dry-run，不生成正式 staging。因此当前不能伪造一次成功的真实发布计划；待干净提交和正式 release 坐标确定后再运行。
- `RuntimeAssetOfflineCache` 服务模块已完成，但设置页显式开关尚未接入；当前实际生效的是浏览器 HTTP cache。不得把可选离线包描述成已启用。

以下步骤会改变云端状态，必须在所有者给出部署坐标并再次确认后执行：

1. 使用项目固定的 Wrangler 登录并确认账号：`npx wrangler login`、`npx wrangler whoami`。
2. 创建或确认项目唯一 R2 桶；桶名只用小写 ASCII、数字与连字符，并记录为后续所有核心、GAL、
   音频和频道发布命令的唯一目标。
3. 先放入一个测试对象，再应用 [r2-cors-public-read.json](./r2-cors-public-read.json)：

   ```powershell
   npx wrangler r2 bucket cors set <bucket-name> --file project/r2-cors-public-read.json
   npx wrangler r2 bucket cors list <bucket-name>
   ```

4. 临时启用 `r2.dev` 做预发布检查；生产前把 Cloudflare 同账号下的自定义域名绑定到桶，并关闭不需要的 `r2.dev` 公网入口。
5. 按 `manifest.json` 逐项上传到新的 `gensokyo-moving-garden/releases/<release-id>/` 前缀；GAL
   滚动池以后只进入同桶 `gensokyo-moving-garden/gal-pools/<gal-pool-release-id>/`。禁止上传整个
   `src/assets` 或 `dist/assets`，也禁止发布工具临时改投第二个桶。
6. 素材全部上传并核验后才上传 release manifest；最后才允许更新人工 channel 指针。
7. 自定义域名配置 Cache Rule：不可变 release 对象使用一年缓存与 `immutable`；频道指针使用 `no-cache` 或短 TTL。
8. 从真实 SillyTavern Origin 验证 CORS、Range、Canvas 像素读取、图片解码和 WebAudio；再进行 `remote-r2` 候选接线。
9. 用同一 release 验证 HTTP cache 命中、切换聊天／切卡后的复用、配额不足与缓存被清理后的安全回退；
   若启用离线包，再验证只清理 `gg-runtime-assets:` 命名空间。

## 继续部署前需要所有者提供

- Cloudflare account 的明确选择；
- 项目唯一 R2 桶名（新建或既有）；
- 生产素材域名，例如 `assets.example.com`，且域名位于同一 Cloudflare account；
- 公开匿名读取是否确认；
- 首个正式 release ID；
- 登录方式：浏览器 OAuth，或只放在本机秘密环境中的最小权限 API token；
- 当前弹幕“禁止运行时远程依赖”协议的修订授权；
- 真实 SillyTavern 预发布与正式切换授权。

任何 Access Key、Secret、API token 都不得写入仓库、角色卡、manifest、命令参数或聊天记录。
