# 0.2.0-r58 地图、快进与 R2 设施修复报告

## 结论

`0.2.0-r58` 已完成维护源修复、离线门禁、embedded／remote-R2 内置浏览器冒烟和正式 JSON 打包。候选固定使用生产 R2 release `0.2.0-r55-1ef0d7d6cbab`，没有上传或覆盖远端对象，也没有覆盖 r57。当前状态仍为 candidate；真实 SillyTavern 导入验收尚未由所有者确认。

## 根因与修复

1. 设施弹窗不跟随地图：GardenMap 原本会逐帧回传设施锚点，但 `positionTargetMenu` 把桌面锚点夹在固定 `245px` 安全区内，边缘设施移动时菜单视觉上停住。现直接使用逐帧有限数值坐标，并增加相机位移映射回归测试。
2. 教程快进只隐藏 UI：旧“跳过指引”只写 localStorage，不改变正式状态。现按钮明确为“快进并完成教程”，零模型调用 `m2_open_garden`，成功后才隐藏指引；`tutorialProgress` 复读为 13/13、`currentStep=null`。
3. 测试快进误报生成中：读取 r57 最新 Luker 聊天记录后确认最后 assistant 已生成完成，最终事件 settlement 已写入 `stat_data.events.settled_ids`，不存在活动事件、会话、战斗或施工。拦截来自 iframe 重挂载后遗留的易失 `settling`。桥接层现在先拒绝真实 submitting/generating/宿主生成态；只对 `settling` 运行持久层恢复，再复读事务，未恢复时仍保持拦截。
4. 四设施贴图消失：本地 WebP、透明度、设施状态解析、生产 R2 URL 与 CORS 响应均有效。冲突发生在请求顺序：预加载器先用无 CORS 图片请求缓存 URL，Canvas 随后用 anonymous CORS 重载。现地图、人物、设施和战斗 Canvas 素材从首次预加载起统一使用 anonymous CORS。

## 自动门禁

- `npm run check:ui`：通过。
- `npm run build:ui`（embedded）：通过。
- `npm test`：196/196 通过。
- 固定生产 manifest 的 `remote-r2` 构建：通过。
- `node --test tests/asset-preloader.test.mjs tests/asset-release.test.mjs`：R2／预加载专项 13/13 通过。
- r58 `package:checkpoint:dry` 与正式写入：均为 2,138,350 bytes，SHA-256 均为 `a7edffabd04785e309ddb7bea71bb94c800967eb75a454faaf6ade18d67d9229`。

## 内置浏览器冒烟

- 清除 `127.0.0.1:8765` 的 localStorage/sessionStorage，启用 DevTools 禁用缓存，关闭旧标签并以新标签和唯一查询参数重新进入。
- embedded：确定性开场进入成功；教程按钮直达完成；设施全建成快进成功；四设施全部可见；菜单拖图后持续跟随；控制台无 warning/error。
- remote-R2：运行时坐标复读为生产域名、固定 release 与固定 manifest hash；四设施 URL 均为 HTTPS R2 地址；设施全建成后四贴图全部可见，导航蒙版 ready，控制台无 warning/error。
- 代表性跟随数据：魔法温室菜单锚点 `243.2/135.3 → 245.2/190.3`，相机 `0/0 → 1.98/55`。

## 成品

- 文件：`../dist/checkpoint-0.2.0-r58/幻想乡物语-测试检查点-0.2.0-r58.json`
- 格式：`chara_card_v2` / `2.0`
- UI 脚本：`gensokyo-garden-ui-020-r58`
- 世界书：16 条
- 大小：2,138,350 bytes
- SHA-256：`a7edffabd04785e309ddb7bea71bb94c800967eb75a454faaf6ade18d67d9229`

## 真实酒馆复验重点

1. 导入 r58 后新建聊天，确认开场仍不创建消息或调用 LLM。
2. 在此前出现误报的聊天状态点击“设施全建成”或其他测试快进，确认旧 `settling` 可从持久状态自愈。
3. 拖动地图时观察设施菜单持续跟随；全建设施状态下确认四贴图均显示。
4. 查看控制台与网络面板，确认 R2 设施请求无 CORS、解码或 Canvas 污染错误。
