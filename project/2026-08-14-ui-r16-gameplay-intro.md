# production UI r16：宝宝玩法介绍

## 发布范围

- 在玩家完成全部新手教程或选择跳过教程后，显示一次全屏暗色玩法介绍；不改写原教程流程，也不新增玩法系统。
- 介绍覆盖时间阶段与剧情驱动的角色出入场、灵梦小店与物资、设施解锁、符卡副本与金币、角色符卡战斗、邀请/请离角色和历史画廊入口。
- 小店与符卡副本步骤会展开案内菜单并高亮真实入口；说明窗口避开菜单区域，地图与菜单层级保持正确。
- 完成记录按聊天身份写入本地存储。同一聊天刷新页面不会重复显示；不同聊天可分别完成一次。

## 生产发布

- channel：`production`
- profile：`standalone-mvu`
- version：`r16`
- URL：`https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/ui/profiles/standalone-mvu/ui-mount-r16.js`
- bytes：`2,288,543`
- SHA-256：`d3967f1a76566a197e06e5d061b868c03ecc7753afd3316841465ee66c410e4b`
- published_at：`2026-08-13T17:56:29.011Z`

发布器按“不可变 UI 对象优先、`ui-manifest.json` 最后”的顺序写入 R2，并完成生产域名的 MIME、缓存头、长度和 SHA-256 回读校验。production manifest 已由 r15 切换至 r16；r15 保留为回滚点，没有删除旧对象。

## 验证

- `npm run check:ui`：通过。
- `npm test -- --test-concurrency=1`：771/771 通过。
- `git diff --check`：通过。
- r16 构建、发布 dry-run、正式上传、对象与 manifest 公网读回：通过。

## 交付边界

本次只更新 production 远程 UI。没有重新打包 JSON/PNG 角色卡，没有更新媒体 generation，也没有修改正式卡内固定 loader；已使用 production loader 的角色卡刷新后会自动读取 r16。

真实 SillyTavern 后续仍应验收一次：完成/跳过教程后出现介绍、刷新同一聊天不再出现、菜单步骤高亮正确，以及旧聊天通过 loader 自动切换 r16。
