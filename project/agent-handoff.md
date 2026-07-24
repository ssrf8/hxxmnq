# Agent 交接文档

## 当前交接点

- 当前检查点：`0.2.0-r28`（在场快照同步）。
- 已生成并导入：`../dist/checkpoint-0.2.0-r28/幻想乡物语-测试检查点-0.2.0-r28.json`。
- SHA-256：`87c8cef37b1f35bb541199ccdc9ef7fbdac00f2beba8f0f4c1349987e2c8065e`。
- UI 脚本 ID：`gensokyo-garden-ui-020-r28`。
- 已在 Luker 的右侧内置浏览器完成：角色卡导入、标签导入、世界书绑定、嵌入脚本启用、MVU 初始化。窗口停在 R28 的庭院初始化页，供所有者继续测试。
- 自动门禁：`npm run check:ui` 通过；`npm test` 31/31 通过；`npm run build:ui` 与 R28 package dry-run / 写入均通过。

## 本轮已完成

### 1. 温室固定剧情收口

- `greenhouse_research_with_marisa` 最多两次有效 LLM 回合：首次行动为第 1 回合，玩家最多补充一次（120 字），第 2 次 assistant 回复自动结算并回庭院。
- 固定剧情的正文目标不超过约 300 个汉字；结束后关闭输入、选项和续聊，点击回庭院。
- 主线/固定行动继续使用本地白名单结算，取消依赖第二次预设解析，避免“第二次结算解析结果不符合 schema”。

### 2. 正文与 GAL 体验

- 载入新对话先清空 GAL 旧正文；本次聊天记录会替换左侧历史浏览内容。
- 固定剧情结束可直接回庭院；左箭头已改为单独的本次互动历史入口。
- 正文提取优先使用酒馆原生楼层中可读正文，过滤代码块、协议和边界外标签，适配不同预设的返回格式。

### 3. 在场角色快照同步（R28）

- 每次庭院 UI 发起的 LLM 请求都注入当前 `presence_snapshot`：在场角色 ID、姓名、区域、动作、朝向，及完整不在场名单。
- 角色抵达、离场或换区时，模型必须在正文后追加一次受控回执：

```xml
<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu"],"character_views":{"reimu":{"area_id":"garden","action":"idle","facing":"front"}}}</GensokyoPresence>
```

- `bridge.ts` 只接受已登记角色与白名单字段；回执原子覆盖 `presence_snapshot`，离场角色的小人视图会一并移除。
- 没有位置变更时不输出该标签。叙事写了“离场”却没有回执，属于模型协议违例，不应由本地文本猜测器擅自改状态。
- 契约见 `presence-sync-contract.md`；回归测试在 `tests/ui-contract.test.mjs`。

## 关键文件

| 主题 | 文件 |
|---|---|
| 庭院界面与固定剧情收口 | `src/ui/app.ts` |
| 本地事件结算、两回合上限 | `src/ui/event-settlement.ts` |
| 模型请求与在场快照注入 | `src/ui/target-actions.ts` |
| 受控在场回执应用 | `src/ui/bridge.ts` |
| 正文投影与 GAL | `src/ui/gal-scene.ts` |
| 在场同步契约 | `project/presence-sync-contract.md` |
| R28 运行/导入报告 | `project/runtime-report-0.2.0-r28.md` |
| 角色卡打包器 | `scripts/package-checkpoint.mjs` |

## Luker 当前数据状态

- 已保留：R28 角色卡、R28 世界书、R28 新聊天目录。
- 已清理：历史项目聊天目录与 R26/R27 角色卡；它们已移动至 Windows 回收站，仍可恢复。
- 未触碰：其他角色卡、其他聊天和用户配置。

## 后续验收重点

1. 新开 R28 聊天，完成庭院资料初始化，不应调用 LLM。
2. 与灵梦、魔理沙分别互动；请求日志/消息中应含“庭园在场快照”。
3. 让魔理沙明确离场；assistant 正文后应有合法 `GensokyoPresence`，地图立刻移除她。
4. 再发送一轮普通互动；请求中的“不在场”名单应包含魔理沙，正文不得把她写成现场角色。
5. 让角色抵达或换区；回执后小人位置/动作/朝向与叙事一致。
6. 走温室研究两回合；第二回合后自动结束、回庭院、无输入框和额外选项残留。
7. 回归主屋维修：成功后时间推进一次，GAL 载入不残留旧文本。

## 操作约束

- 不直接编辑 `dist/`；修改维护源后依次执行：`npm run check:ui`、`npm test`、`npm run build:ui`、`npm run package:checkpoint:dry`。
- 只有所有者明确要求时才执行 `npm run package:checkpoint` 或导入 Luker。
- 打包器拒绝覆盖已有检查点；需要新候选时先更新 `package.json`、`project/manifest.json` 的检查点。
- 真实 Luker 验收使用右侧内置浏览器，不操作桌面浏览器。
- 清理 Luker 数据时先核对精确目标；优先移动至回收站，并保留与本项目无关的数据。
