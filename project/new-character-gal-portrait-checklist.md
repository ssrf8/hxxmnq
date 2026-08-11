# 新角色素材接入记录（妖梦／帕秋莉／早苗）

> 状态：**源码与 R2 媒体已接入；新角色卡打包及真实 SillyTavern 动静帧验收待执行**（2026-08-11）。
> 范围：地图角色动画、GAL `normal / nude` 五表情、角色世界书、随机来访、旧档迁移与 R2 live 清单。战斗 cut-in 不在本次范围。

## 1. 登记结果

| 角色 | `character_id` | 动画帧数 | GAL 反应图 | 来访条件 | sexual 姿势池 |
|---|---|---:|---:|---|---|
| 魂魄妖梦 | `youmu` | 28 × 4 方向 | 10 | `eligibility: always`，随机调度 | `{}`，等待未来 R2 条目 |
| 帕秋莉·诺蕾姬 | `patchouli` | 26 × 4 方向 | 10 | `eligibility: always`，随机调度 | `{}`，等待未来 R2 条目 |
| 东风谷早苗 | `sanae` | 35 × 4 方向 | 10 | `eligibility: always`，随机调度 | `{}`，等待未来 R2 条目 |

三人均无剧情、设施、好感或初遇前置。`visitor-rules.ts` 将 `always` 档案直接视为已知候选；`visit-profiles.json` 负责带权随机入场，不建立固定入场事件。

## 2. 素材合同

- 所有者 GAL 源：`旧素材/素材处理/CG/{妖梦,帕秋莉,早苗}/`。
- 运行 GAL：`src/assets/characters/<id>/gal/{normal,nude}/`，每种模式含 `neutral/smile/shy/sad/angry`。
- 画布保持 1152×1920 PNG，运行文件与所有者源逐字节一致，不裁切、不缩放、不重编码。
- 地图动画运行文件为 lossless WebP：每人一张独立四方向静态图和一张四方向序列图；维护帧与 `sequence-runtime-v1/manifest.json` 留在源码侧审计。妖梦、早苗的左右动画源在构建期映射纠正，早苗静态右视图由左视图镜像。
- `sexual_pose_sources` 刻意保持空对象。运行时继续通过 `mergeRemoteSexualPortraitSources` 从生产 R2 manifest 合并将来新增且通过白名单验证的姿势图，不需要重新打包角色卡。
- GAL fallback 仍为 `sexual → nude 同反应 → nude.neutral → normal 同反应 → normal.neutral`。

## 3. 接入点

- 素材与构建：`scripts/split-character-sequences.mjs`、`scripts/build-new-character-animation-assets.mjs`、`scripts/stage-gal-portraits.mjs`、`src/assets/asset-manifest.json`。
- UI：角色动画注册表、GAL 注册表、角色记忆白名单、测试控制台均由 8 人扩为 11 人。
- 状态：`initial-state.json` 与 `state-migrations.ts` 为新旧存档补齐三名角色和独立 visit memory。
- 内容：新增 `src/lorebook/characters/{youmu,patchouli,sanae}.xml`，并登记唯一角色绿灯与路由。
- 来访：`src/visitors/visit-profiles.json` 使用 `eligibility: always`；没有前置事件键。

## 4. R2 发布记录

- 生产入口：`https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/manifest.json`。
- 基线：generation 4，215 files，286,579,188 bytes。
- 发布：generation 5，新增 36 files / 67,455,270 bytes；最终 251 files / 354,034,458 bytes。
- manifest SHA-256：`d1f6d1c4751045a83e52e6e0f7c35f44cd58f927f68e8920d808c24b9ef791de`。
- 顺序：媒体先上传；36 项逐个完成 S3 签名 GET 与生产域名 GET 的 MIME、长度、SHA-256 校验；最后写 manifest。
- 缓存：媒体 `public, max-age=0, must-revalidate`；manifest `no-store`。
- 可重复工具：`scripts/publish-character-assets-r2.mjs` 默认只生成 scoped delta staging，显式 `--apply` 才写 R2；同名异哈希对象默认失败闭合，只有额外显式传入 `--replace` 且旧对象哈希仍匹配生产 manifest 时才允许替换。
- 校准修订：generation 6 从 generation 5 替换 5 个同名 WebP（妖梦动画/静态、早苗动画/静态、帕秋莉静态），最终仍为 251 files / 354,058,350 bytes；manifest SHA-256 为 `d2cb6a317f449ff7bac92906393948b253d6b421825c78874941792860e1a57f`，双通道读回通过。

## 5. 验证

- `npm test`：当前 739 项中 734 通过、5 失败；详情见 `project/agent-handoff.md`。
- `npm run check:ui`：通过。
- `npm run build:ui:standalone`：通过；`ui-mount.js` 2,193,307 bytes，SHA-256 `affa3b55478fbad724ebca9d335e6e23d67dd3e966235d6cd7c6321560170542`。
- `git diff --check`：通过。
- 嵌入式 package dry-run：通过（0.3.0-r1，30 条世界书）；仅验证，未写正式包。远程 UI 打包仍需先生成对应 loader/versioned mount。
- 新增专项测试会校验无前置随机候选、动画帧合同、GAL 原字节一致性及空 sexual 池。

本次没有打包或发布新的角色卡检查点；generation 6 只更新了媒体。48ms 帧速、四方向动静定位、新人设与新道具必须随下一张角色卡/UI 包进入真实 SillyTavern 后再验收。
