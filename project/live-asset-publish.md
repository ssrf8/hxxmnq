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
- `scripts/publish-character-assets-r2.mjs` 提供按角色前缀筛选的增量 staging、碰撞审计、断点续跑、媒体双通道读回与 manifest-last。默认 dry-run，真实写入必须显式 `--apply`；更新已登记的同名运行素材还必须额外显式传入 `--replace`，并核对旧对象 SHA-256 后才允许覆盖。
- 三名角色的 sexual 姿势图未上传、未写死占位 URL；待未来对象进入同一生产 manifest 后由运行时自动发现。

## 2026-08-11 generation 6

- 作用域：三名新角色校准后的同名运行 WebP；妖梦动画/静态、早苗动画/静态、帕秋莉静态，共 5 个替换对象。
- 基线 generation 5 manifest SHA-256：`d1f6d1c4751045a83e52e6e0f7c35f44cd58f927f68e8920d808c24b9ef791de`。
- 最终 generation 6：251 files / 354,058,350 bytes；manifest SHA-256：`d2cb6a317f449ff7bac92906393948b253d6b421825c78874941792860e1a57f`。
- 发布使用 `--replace --apply`，每个对象覆盖前核对 generation 5 记录的长度与 SHA-256；5 个对象均完成 S3 与生产域名读回，最后切换 `live/manifest.json`。
- generation 6 不包含 UI 代码。48ms 帧速和角色动静定位在内嵌 UI 中，必须由后续角色卡/UI 包交付。

## 2026-08-11 generation 7

- 作用域：妖梦、帕秋莉、早苗的角色对战 Boss 四状态 WebP，共 3 个新增对象；没有覆盖或删除既有对象。
- 原始 `1536×1536` 黑底图完整归档；运行副本以确定性黑底透明化后缩放为既有 `1254×1254`、`2×2` 待机／施法／受击／击破合同。
- 基线 generation 6 manifest SHA-256：`d2cb6a317f449ff7bac92906393948b253d6b421825c78874941792860e1a57f`。
- 最终 generation 7：254 files / 355,238,436 bytes；manifest SHA-256：`6b6bd8afa66e36e5bce9ddd9b56fd86cdb174d6037c7fa44bc15e82fdeec80b2`。
- 三个对象均完成 S3 与生产域名读回校验，最后切换 `live/manifest.json`；清单缓存为 `no-store`。

## 2026-08-11 generation 8

- 作用域：妖梦、帕秋莉、早苗的 S0/S1/S2 战损 cut-in WebP，共 9 个新增对象；没有覆盖或删除既有对象。
- 原始 9 张 `1152×1920` PNG 保留在 `旧素材/素材处理/新建文件夹`；运行副本按既有 portrait 合同转换为 `480×800`、WebP quality 50、effort 6，总计 138,684 bytes。
- dry-run 确认 9 additions / 0 replacements；基线 generation 7 manifest SHA-256：`6b6bd8afa66e36e5bce9ddd9b56fd86cdb174d6037c7fa44bc15e82fdeec80b2`。
- 最终 generation 8：263 files / 355,377,120 bytes；manifest SHA-256：`64ac62ae0896e2523af23b137fd2acabfd2d2d4c92f743aeacb94cfdc28d4507`。
- 9 个对象均完成 S3 与生产域名读回校验，最后切换 `live/manifest.json`；清单缓存为 `no-store`。资源明细见 `project/new-character-battle-portrait-report-2026-08-11.json`。

## 2026-08-14 production UI r16

- UI 版本对象与媒体 generation 是两条独立发布链；本次没有修改 generation 8 的媒体对象或 `live/manifest.json`。
- `standalone-mvu` 构建产物为 `ui-mount-r16.js`，2,288,543 bytes，SHA-256 `d3967f1a76566a197e06e5d061b868c03ecc7753afd3316841465ee66c410e4b`。
- dry-run 只计划写入不可变版本对象与 profile 的 `ui-manifest.json`；正式发布按版本对象优先、manifest-last 执行。
- production manifest 已由 r15 切换至 r16，两个对象均完成生产域名回读；r15 未删除，可用于回滚。
- 本次没有重新打包角色卡。固定 production loader 会在刷新时读取新的 profile manifest。完整记录见 `project/2026-08-14-ui-r16-gameplay-intro.md`。

## 2026-08-14 production UI r17

- UI 版本对象与媒体 generation 继续独立；本次没有修改 generation 8 的媒体对象或 `live/manifest.json`。
- `standalone-mvu` 构建产物为 `ui-mount-r17.js`，2,289,624 bytes，SHA-256 `d540a36cffeb9d4138429346e6d73986c97b44ed72c9c90b0a4556ee4e917f10`。
- dry-run 只计划写入新的不可变版本对象与 profile 的 `ui-manifest.json`；正式发布按版本对象优先、manifest-last 执行。
- production manifest 已由 r16 切换至 r17；版本对象和 manifest 均完成生产域名回读，声明长度与 SHA-256 和本地构建完全一致。r16 未删除，可用于回滚。
- 本次没有重新打包正式角色卡。固定 production loader 会在刷新时自动读取 r17。完整记录见 `project/2026-08-14-ui-r17-gal-mvu-persistence-hotfix.md`。
