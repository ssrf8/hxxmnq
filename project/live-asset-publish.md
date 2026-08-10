# Live 素材发布流程

从本次起，轻量角色卡只读取固定接口：

```text
https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/manifest.json
https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/<source>
```

`<source>` 等于 `src/assets/asset-manifest.json` 内的素材路径。更新图片或音频时覆盖同名对象；角色卡中的请求 URL、图片名称和 UI 构建坐标均不变化。

## 缓存与一致性

- 媒体：`Cache-Control: public, max-age=0, must-revalidate`。浏览器/CDN 可复用未变化的内容；再次使用前以 ETag 或 Last-Modified 验证，变了便取新字节。
- 清单：`Cache-Control: no-store`。
- 上传顺序：先上传并逐项校验所有媒体，**最后**覆盖 `live/manifest.json`。清单成功写入才代表该代素材可见。
- Cloudflare 不得对 `gensokyo-moving-garden/live/**` 施加 `immutable` Cache Rule。

## 本地发布准备

```powershell
$generation = 1 # 每次发布递增；仅作审计和离线缓存代号，不进入素材 URL
$assetOrigin = "https://ssrfrrt.ccwu.cc"

npm run check:assets:r2
node scripts/build-runtime-assets.mjs --generation=$generation --base-url=$assetOrigin
node scripts/publish-r2-assets.mjs --dry-run --bucket=hxxwy --manifest="dist/asset-live/generation-$generation/manifest.json"
node scripts/build-ui.mjs --asset-mode=remote-r2-live --asset-base-url=$assetOrigin
```

正式 staging 必须来自干净工作树；脚本拒绝覆盖已有的 `generation-N` 本地目录。发布器目前只生成校验过的上传计划，不会自行访问 R2。获得明确上传授权后，按计划将 `files/` 的对象写到同名 `live/<source>`，逐项验证 MIME、长度、SHA-256 和缓存头，再最后上传 `manifest.json`（`no-store`）。

历史 `releases/**` 只是过去的个人测试对象，不参与新构建、发布或回滚。若需回滚，把上一代已验证的同名素材重新上传，再最后上传对应清单。

## 2026-08-11 generation 5

- 作用域：`youmu`、`patchouli`、`sanae` 的地图待机/序列 WebP 与 GAL `normal/nude` PNG，共 36 项。
- 基线 generation 4：215 files / 286,579,188 bytes。
- 最终 generation 5：251 files / 354,034,458 bytes。
- manifest SHA-256：`d1f6d1c4751045a83e52e6e0f7c35f44cd58f927f68e8920d808c24b9ef791de`。
- `scripts/publish-character-assets-r2.mjs` 提供按角色前缀筛选的增量 staging、碰撞审计、断点续跑、媒体双通道读回与 manifest-last。默认 dry-run，真实写入必须显式 `--apply`。
- 三名角色的 sexual 姿势图未上传、未写死占位 URL；待未来对象进入同一生产 manifest 后由运行时自动发现。
