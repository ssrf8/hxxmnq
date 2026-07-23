# 0.2.0-r18 运行验收记录

## 交付物

- 角色卡：`../dist/checkpoint-0.2.0-r18/幻想乡物语-测试检查点-0.2.0-r18.json`
- SHA-256：`ea8445eb07764a87d38cf81b3c52ad09406cc7865b75c2e44457b88a9f4f5b33`
- 文件大小：`19,982,355` bytes
- UI 脚本：`gensokyo-garden-ui-020-r18`
- 生成时间：2026-07-24
- 目标环境：`F:\agent airp\Luker`
- Luker：`2.7.0 release`；Tavern Helper：`4.8.18`
- Luker 写入：characters 与 worlds 的 0.2.0-r18 产物
- 已删除 r17 角色卡与世界书；历史聊天目录保留。

## 自动与离线门禁

- `npm run build:ui`：通过
- `npm run check:ui`：通过
- `npm test`：19/19 通过
- `npm run package:checkpoint`：写入 r18（refuse-overwrite）
- 包内：loader / schema / ui-r18、16 条世界书、[initvar]、GAL 协议、时段别名与正文候选逻辑

## 问题与根因（基于 r17 聊天）

### 壳内正文过短

- 模型正文约 700-900 字，常在 </bginfor> 后；bginfor 多为时间地点元数据。
- 旧抽取优先 bginfor -> 空 -> 只播 scene beats（约 150 字）。

### 时段不推进

- UV 写 /environment/time_period = 下午（楼 7/11/13）。
- 楼层 variables 仍为清晨：非法枚举被 schema 回退，不是内容不够。

## r18 修复摘要

1. gal-scene.ts：最长正文候选 + 优先 scene.v1+body 分页。
2. 02-mvu-schema.js：口语时段别名映射四值。
3. 协议/规则：玩家读正文；时段只写四值。
4. 类型与契约测试同步。

## 离线复现（r17 楼 3/5/7/17）

| 楼层 | clean 字数 | projection |
|------|-----------|----------|
| 3 | 725 | scene.v1+body |
| 5 | 855 | scene.v1+body |
| 7 | 839 | scene.v1+body |
| 17 | 637 | scene.v1+body |

## 所有者验收名单（新开 r18）

| 序号 | 项 | 通过标准 | 结果 |
|------|----|----------|------|
| A | 导入 | r18 脚本 ui-r18 启用，世界书约 16 条 | 待测 |
| B | 开场 | 载入资料进庭院，不调 LLM | 待测 |
| C | 在场 | 灵梦可见可点 | 待测 |
| D | 正文 | 长叙事分页，非仅短 beat；建议回复可用 | 待测 |
| E | 结束/时段 | 收尾正常；下午/白昼可到顶栏白昼 | 待测 |
| F | 主屋 | 检查/维修；资源不足有提示 | 待测 |
| G | 原生 | 多轮楼层可见 | 待测 |
| H | 清理 | 仅 r18，无 r17 产物 | 待测 |

> 请在新开 r18 聊天验收；旧 r17 聊天不会自动获得新壳逻辑。
