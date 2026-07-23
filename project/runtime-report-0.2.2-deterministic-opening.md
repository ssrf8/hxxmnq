# 确定性开场源码候选报告（0.2.2-deterministic-opening）

## 候选边界

- 下一检查点：`0.2.0-r13`
- 当前状态：维护源与构建产物已更新，尚未执行正式打包、导入或真机验收。
- 保留制品：`0.2.0-r12` 不覆盖，继续作为最近的已导入候选和旧聊天兼容基线。

## 新开场事务

1. 表单编辑和预览只写当前 chatId 隔离的 `sessionStorage` 草稿。
2. 点击“载入资料并进入庭院”后冻结草稿和 chatId。
3. bridge 拒绝在已有普通 user 消息的新路径中初始化，避免覆盖既有剧情。
4. bridge 选择已有的首个 assistant 楼层，从 `initial-state.json` 补齐默认状态并保留已有未知字段。
5. 只覆盖玩家姓名、称谓、外貌、庭园名、庭守钥状态及两个开场 meta 标志。
6. 使用精确 `message_id` 调用 `Mvu.replaceMvuData`，随后对同一楼层复读。
7. 复读字段完全一致后才进入庭院；数据库只在后续刷新读到已提交 MVU 后做可选归档。
8. 此路径不创建 user 消息、不触发 `/trigger`、不调用 LLM。

## 兼容边界

- 带 `gensokyo_opening` 标记的 r12 及更早聊天继续使用原始消息解析、assistant 楼层确定性恢复和受限修复。
- 普通互动、结算、Swipe、重新生成和停止后继续生成仍使用真实消息事务。
- 第一次 LLM 调用移到玩家进入庭院后的第一次真实行动。

## API 依据

- `Mvu.getMvuData({ type: 'message', message_id })`
- `Mvu.replaceMvuData(mvu_data, { type: 'message', message_id })`
- 声明来源：目标安装 `JS-Slash-Runner/@types/iframe/exported.mvu.d.ts`
- 当前声明版本：`4.8.18`；r12 交接运行环境曾报告 `4.8.19`
- MagVarUpdate 固定来源：commit `d1bdfd1`

## 支持性检查

- `npm run build:ui`：通过
- `npm run check:ui`：通过
- `npm test`：13/13 通过
- `npm run package:checkpoint:dry`：通过
- dry-run 目标：`0.2.0-r13`
- dry-run SHA-256：`63414f97e607bf348dcac6d0859f431f5eb5c429eaf2b4e4812673651092f99d`
- JSON 配置解析与 `git diff --check`：通过

## 真机仍待关闭

- 新聊天点击开始前后消息数不变。
- 精确首个 assistant 楼层持久化完整 `stat_data`。
- 同资料重复点击幂等，不同资料不得覆盖。
- 写入失败时草稿、原生聊天入口和未提交状态完整保留。
- 刷新、切聊天返回后直接恢复庭院。
- 数据库启用与禁用两种环境下，MVU 都是唯一正式状态源。
- 第一次真实行动只创建一条 user 和一条 assistant，并由模型承接荒废庭园场景。
