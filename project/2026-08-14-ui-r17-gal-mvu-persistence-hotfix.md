# production UI r17：GAL MVU 持久化修复

## 修复范围

- GAL assistant 落楼时继承完整 MvuData，而不是从空模板重建后只复制 `stat_data`；保留 `initialized_lorebooks`、schema、显示／增量状态和未知扩展字段。
- 只接管正文与 `generate()` 返回值完全一致的宿主 assistant 楼层，避免空占位或并发消息抢占本次 attempt。
- 已存在的正确楼层使用 `setChatMessages` 更新 metadata 与 MVU 数据；没有精确匹配时才创建包含真实生成正文的新楼层。
- 持久化继承锚定到本次用户楼层之前的 assistant，避免并发楼层污染初始化状态。

## 验收与离线门禁

- 所有者已在真实 SillyTavern 完成测试候选验收。
- `npm run check:ui`：通过。
- `npm test`：774/774 通过。
- production r17 构建、发布 dry-run、正式上传、对象与 manifest 公网读回：通过。

## 生产发布

- channel：`production`
- profile：`standalone-mvu`
- version：`r17`
- URL：`https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/ui/profiles/standalone-mvu/ui-mount-r17.js`
- bytes：`2,289,624`
- SHA-256：`d540a36cffeb9d4138429346e6d73986c97b44ed72c9c90b0a4556ee4e917f10`
- published_at：`2026-08-14T05:04:59.524Z`

发布器先以不可覆盖条件写上传版本对象，并从生产域名按字节和 SHA-256 回读；随后使用 ETag 条件写更新 `ui-manifest.json`，再读回确认 production 指针指向 r17。独立公网复核同样确认 manifest 为 `no-store`，版本对象为 JavaScript 长缓存，长度与哈希完全匹配。

## 交付边界

本次只更新 production 远程 UI，没有重新打包正式 JSON/PNG 角色卡，也没有修改媒体 generation。已嵌入固定 production loader 的角色卡刷新页面后会自动加载 r17；r16 对象保留为回滚点。
