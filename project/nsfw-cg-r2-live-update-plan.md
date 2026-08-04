# 成人 CG 首次 R2 live 更新执行计划

> 规划日期：2026-08-03  
> 状态：generation 2 已于 2026-08-03 发布并完成生产核验  
> 当前范围：`CG/灵梦/` 的 11 张原始 PNG  
> 固定命名合同：`project/nsfw-pose-live-asset-naming-plan.md`  
> 逐文件真相：`CG/灵梦/上传台账.md`  
> Agent 详细执行手册：`project/nsfw-cg-agent-execution-runbook.md`

## 1. 目标与停止点

把灵梦当前 11 张原始 PNG 作为 sexual GAL 候选接入单一生产 live 素材接口。首发角色卡必须先具备
动态 sexual resolver；之后在冻结的 28 池与 `01–99` 候选范围内，新增或替换图片只更新 R2 媒体、
逐角色台账和 `live/manifest.json`，不重新打包角色卡。

本计划列出的发布门已在 generation 2 执行中全部满足。后续 generation 仍须重复这些门：

- 客户端 sexual resolver、路径校验、fallback 与测试已完成；
- 11 张原图已由角色目录的机器上传计划登记，delta staging 与所有者原图哈希一致；
- 从执行时最新远端 manifest 生成新 generation 的完整 staging；
- 上传计划 dry-run 通过且所有目标 key 的远端碰撞审计完成；
- 所有者明确授权本次生产桶写入。

## 2. 已确认基线

### 2.1 本地

| 项 | 结果 |
|---|---|
| 角色目录 | `CG/灵梦/` |
| PNG 数量 | 11 |
| 原始字节总量 | 27,877,219 bytes |
| PNG 文件签名 | 11/11 为 `89504E470D0A1A0A` |
| 本地 SHA-256 | 11/11 已记录；重复哈希组 0 |
| 语义映射 | 9 个逻辑池：7 个单候选池、2 个双候选池 |
| 图片内容检查 | 未执行；语义只依据所有者已给出的文件名，不由程序猜测 |

双候选池为：

- `gal.reimu.sexual.cowgirl.vaginal`：`01`、`02`；
- `gal.reimu.sexual.missionary.anal`：`01`、`02`。

### 2.2 生产 R2（2026-08-03 只读探测）

| 项 | 结果 |
|---|---|
| manifest URL | `https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/manifest.json` |
| HTTP／MIME／缓存 | `200`／`application/json`／`no-store` |
| schema | `gensokyo-r2-live.v1` |
| generation | 1 |
| updated_at | `2026-08-02T10:42:00.316Z` |
| 当前总量 | 184 files／208,627,661 bytes |
| sexual entries | 0 |

如果执行前没有其他 live 更新，本批加入后预计为 195 files／236,504,880 bytes。该数字只是基于当前
generation 1 的预测；执行时必须重新下载远端 manifest，不得用本文快照覆盖更晚更新。

## 3. 当前工具边界

| 能力 | 已验证入口 | 当前行为 | 本批缺口 |
|---|---|---|---|
| 通用 live staging | `node scripts/build-runtime-assets.mjs --generation=<N> --dry-run` | 继续负责 `src/assets` 常规运行素材 | 不负责所有者目录中的 sexual CG |
| CG delta staging | `node scripts/prepare-cg-r2-update.mjs --plan=CG/<角色>/r2-upload-plan.json --manifest-url=<生产 manifest URL>` | 校验原 PNG 签名／大小／SHA-256，从执行时最新远端清单生成完整新 manifest 与只含新增原图的 delta staging | 已在 generation 2 验证 |
| 上传计划 | `dist/r2-updates/generation-<N>-<character_id>/upload-plan.json` | 固定 bucket、旧／新 manifest hash、媒体 delta 与 manifest-last | 上传前必须重新做逐 key 碰撞审计 |
| 真实上传 | 受控 Wrangler `r2 object put --remote` | 凭据只从进程环境读取；媒体逐项写入、生产 GET 核验、基线复查、manifest 最后写 | 不提供删除；同 key 不同哈希必须停机 |

`gal-portrait-registry.ts` 现在内置 17 个冻结 pose／28 池白名单，并在 `resolveRemoteRelease` 完整验证 v1 manifest
后按路径合同动态合并 sexual 候选。候选不嵌入角色包，所以后续合法补图只更新角色台账、机器上传计划、
R2 原图与完整 live manifest，不再修改包内素材表。

## 4. 首包实现计划

### A. 原始 PNG 与机器上传计划

1. 原始 PNG 只保留在 `CG/<角色>/`，不复制进 `src/assets`，避免角色包体积增长和重复二进制。
2. 人工真相写入 `上传台账.md`；同目录 `r2-upload-plan.json` 逐项镜像 `owner_file`、source、pose、act、
   candidate、bytes 与 SHA-256。两者不一致时停止，不由脚本猜语义。
3. `prepare-cg-r2-update.mjs` 复制到 delta staging 时只做原字节复制；禁止调用 WebP 压缩器或图片优化器。
4. 新 manifest 条目声明 `character_id`、`visual_mode=sexual`、`pose_id`、`act_id`、`candidate_no`、
   `pool_id`、`weight=1` 和 fallback；路径与这些字段必须互相推导。

### B. 客户端 sexual resolver

1. 注册 17 个冻结 `pose_id` 及其合法 `act_id` 组合；八名固定角色共用语义白名单，实际可用候选只取自
   已验证 manifest。
2. `GalPortraitCue`、归一化、pool ID 与 fallback 全链使用 `pose_id + act_id`；不得继续生成
   `gal.<character>.sexual.<pose_id>` 三段旧 key。
3. 从 manifest 中筛选合法 `pool_id` 的 `01–99` PNG 候选并稳定抽取；不枚举 R2 目录，不接受模型路径。
4. `anal`／`vaginal` 不交叉回退；池为空回退同反应 `nude`，再回退 `normal`。
5. 成人内容开关关闭时不请求 sexual 对象；manifest 或媒体失败不得阻断正文与结算。

### C. live manifest 向后兼容扩展

保持 `gensokyo-r2-live.v1`，在 sexual 文件项增加可选字段：

```json
{
  "logical_id": "asset:characters/reimu/gal/sexual/rear/vaginal/01.png",
  "source": "characters/reimu/gal/sexual/rear/vaginal/01.png",
  "key": "gensokyo-moving-garden/live/characters/reimu/gal/sexual/rear/vaginal/01.png",
  "mime": "image/png",
  "pool_id": "gal.reimu.sexual.rear.vaginal",
  "candidate_no": "01",
  "weight": 1
}
```

现有客户端会忽略额外字段并继续验证通用字段，因此不为本批升级顶层 schema。新客户端必须额外验证：

- `logical_id`、`pool_id`、路径与候选号能互相推导且完全一致；
- `mime=image/png`，source 以 `.png` 结尾；
- 候选号在 `01–99`，weight 为有限正数；
- 未登记角色、未知姿势、非法 act、重复池候选或冲突哈希导致整个 sexual 增强层拒绝，不影响核心素材。

## 5. staging 与碰撞审计

1. 执行前重新 GET 生产 manifest，令目标 `N = remote generation + 1`。若远端仍为 generation 1，则本批
   暂定 generation 2；否则自动顺延，禁止覆盖。
2. 从干净提交运行 generation N 的 dry-run，核对预计新增恰为台账中的 11 个 source，其他对象不能意外
   删除、改名或改变哈希。
3. 运行定向与全量测试后生成正式 staging；逐项证明 staging PNG 与 `CG/灵梦/` 原图 SHA-256 一致。
4. 对 11 个目标生产 URL 逐个执行 HEAD／GET：
   - `404`：允许进入新增计划；
   - `200` 且 SHA-256 等于台账：视为远端孤儿或此前中断上传，不重复传字节，但仍需进入新 manifest；
   - `200` 且 SHA-256 不同：碰撞，整批停止，不得覆盖；
   - 其他状态、错误 MIME 或错误缓存头：整批停止。
5. `publish-r2-assets.mjs --dry-run` 必须输出完整媒体列表和 `manifest-last`，且 generation、文件数、总字节
   与 staging 一致。

## 6. 生产上传顺序

1. 获得对唯一桶 `hxxwy`、精确前缀 `gensokyo-moving-garden/live/` 的写入授权；凭据不得进入仓库、日志或台账。
2. 只上传碰撞审计为 404 的 11 个或更少媒体对象，设置：
   - `Content-Type: image/png`
   - `Cache-Control: public, max-age=0, must-revalidate`
3. 每上传一项立即从生产自定义域名 GET，核对状态、MIME、字节、缓存头与 SHA-256；成功后将台账状态改为
   `已上传待核验`，但不要写 manifest generation。
4. 重新审查完整 generation N manifest，确认旧 184 项及并发新增项均未丢失；上传前再次计算 manifest hash。
5. 最后且只在全部媒体通过时覆盖 `gensokyo-moving-garden/live/manifest.json`，使用
   `Content-Type: application/json`、`Cache-Control: no-store`。
6. 从生产域名重新 GET manifest，验证 generation N、整文件哈希、总量、11 个 sexual 条目及全部媒体。
7. 仅在 manifest 与媒体都通过后，把灵梦台账 11 行改为 `已上传并核验`，写入 generation、远端哈希和时间。

### 6.1 generation 2 实际结果

- 执行时间：2026-08-03 20:01（Asia/Shanghai）；目标桶 `hxxwy`，固定 live 前缀；
- 上传前生产基线：generation 1，184 files，208,627,661 bytes，sexual 0；
- 11 个目标 key 在上传前全部为 404，没有覆盖既有对象；
- 媒体按 delta 先上传，11/11 从生产自定义域名 GET 的 PNG 字节、大小与 SHA-256 等于所有者原图；
- manifest 最后上传；生产响应与 staging `manifest.json` 字节完全相同；
- 发布后：generation 2，195 files，236,504,880 bytes，灵梦 sexual 11；
- manifest SHA-256：`4395cf365a9846801dbbd5bed95f7d29fc8879654c1c0b66f6562857f931e663`；
- 本轮未删除对象、未生成 WebP／JPEG／AVIF、未打开或查看任何 CG 画面。

## 7. 验收矩阵

- 本地：11/11 PNG 签名、原图／维护源／staging 三方哈希一致；无 WebP 派生物。
- 配置：11 个 source、asset ID、pool ID、候选号唯一且可逆；2 个双候选池排序稳定。
- 客户端：9 个现有池可命中；其余 19 个灵梦预留池安全回退；成人开关关闭不请求图片。
- 远端：媒体先于 manifest；生产 GET 哈希一致；CORS 与缓存头正确；manifest generation 单调递增。
- 兼容：旧轻量卡仍能读取 v1 manifest 与原有 184 项，不因未知可选字段失败。
- 宿主：真实 SillyTavern 覆盖新聊天、旧聊天、Swipe、刷新、慢网、404、断网和关闭成人内容。

## 8. 回滚与中断恢复

- manifest 尚未更新时：已上传 PNG 只是不可达孤儿对象，不删除；台账保持 `已上传待核验`，下次按哈希复用。
- manifest 更新失败或新客户端验收失败：发布一个更高 generation、内容恢复到上一份已验证文件表的 manifest；
  不把 generation 倒退为 1，也不急删 sexual PNG。
- 同名 PNG 字节错误：先停止 manifest 更新。若错误对象尚未被活动 manifest 引用，可在明确授权后上传正确
  同名原字节并 GET 验证；若已被引用，则先用更高 generation 从活动表移除，再修复媒体，最后以更高
  generation 重新加入。
- 任何中断都以角色台账、远端 GET 哈希和当前活动 manifest 三者交叉核对恢复，不能只看桶列表猜状态。
