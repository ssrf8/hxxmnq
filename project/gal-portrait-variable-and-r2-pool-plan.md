# GAL 贴图变量与 R2 滚动卡池规划

> 决策日期：2026-08-01
> 状态：**A 阶段 LLM 表现变量已完成；B 阶段已接入魔理沙首批 10 张本地 GAL 贴图，待真实 SillyTavern 验收，未改 MVU、未部署 R2**
> 适用范围：GAL 角色近景，不改变战斗 cut-in、庭园像素角色或正式 MVU 游戏状态

## 1. 目标

现有 GAL 素材按用途分为三组：

1. 正常穿着的反应图片；
2. 与正常反应对应的全裸差分；
3. 进入成人亲密阶段后使用的独立姿势图片。

本计划让 LLM 只选择受控的表现语义，由本地注册表和卡池解析器选择具体素材。未来 GAL 卡池可以独立更新到 Cloudflare R2，而不要求每次加图都重新打包角色卡。

## 2. 已确认架构

```text
LLM 输出 visual_mode + reaction_id + pose_id
  -> 本地白名单校验
  -> 解析为 logical pool id
  -> 按稳定种子从卡池选择 asset_id
  -> 从本地预览路径、内嵌 fallback 或固定 R2 release 加载
  -> 失败时按同模式候选和既定降级链恢复
```

- LLM 不得输出 `asset_id`、对象 key、文件路径、URL、权重或 release ID。
- R2 只保存已批准的公开运行素材、不可变 release manifest 与一个小型频道指针，不承担随机逻辑或授权判断。
- 首版由前端执行稳定抽取，不新增独立服务器，也不要求 Cloudflare Worker。
- 只有需要私有桶、服务端鉴权、隐藏完整卡池、统计或服务端动态权重时才增加 Worker；Worker 也必须只接受白名单语义 ID。
- 核心 UI 和基础 fallback 随卡固定；远程 GAL 卡池是可关闭、可失败的增强层，不得阻断正文阅读、消息事务或结算。

## 3. 状态与所有权

| 内容 | 唯一归属 | 写入者 | 生命周期 |
|---|---|---|---|
| 当前片段的贴图模式 | `scene.v1` beat 的 `visual_mode` | LLM 表现协议 | 当前 assistant 楼层／Swipe |
| 当前反应与姿势语义 | `reaction_id`、`pose_id` | LLM 表现协议 | 当前 beat |
| 合法角色、反应、姿势和卡池映射 | 本地 GAL 贴图注册表 | 维护源 | 随 UI 代码版本 |
| 卡池成员、权重、对象 key、哈希 | GAL pool release manifest | 发布工具 | 不可变 release |
| 当前远程卡池版本 | `channels/gal-stable.json` | 发布流程 | 可变频道指针 |
| 本次抽中的具体图片 | iframe UI 临时记录 | 本地抽卡器 | `chatId + messageId + swipeId + shot key` |
| 成人素材是否启用 | 本地 UI 设置 | 玩家 | 本机偏好，不写 MVU |
| 服装或亲密剧情事实 | 暂不新增 | — | 只有以后确需跨会话影响玩法时才另立 MVU 字段 |

`visual_mode` 和 `selected_asset_id` 都不是正式游戏状态。首轮不得为了显示贴图修改 `initial-state.json`、MVU schema 或字段台账。

## 4. LLM 表现变量合同

继续使用现有 `scene.v1`，以向后兼容的可选字段扩展每个 beat：

```ts
type GalVisualMode = 'normal' | 'nude' | 'sexual';

interface GalBeat {
  kind: 'narration' | 'speech' | 'action';
  speaker_id: string | null;
  visual_mode?: GalVisualMode;
  reaction_id: GalReaction;
  pose_id: string;
  text: string;
}
```

缺少、未知或非法的 `visual_mode` 一律归一化为 `normal`，保证旧消息和旧模型回复仍可播放。

### 4.1 三种模式

| `visual_mode` | 素材家族 | 主要选择字段 | 规则 |
|---|---|---|---|
| `normal` | 正常反应图 | `reaction_id` | 正常穿着；`pose_id` 首版固定 `default` |
| `nude` | 全裸反应差分 | `reaction_id` | 完全裸露但未进入明确成人亲密行为；`pose_id` 首版固定 `default` |
| `sexual` | 独立成人姿势图 | `pose_id` | 只有正文已进入明确成人亲密行为时使用；姿势必须属于该角色白名单 |

判定约束：

- 裸露、洗浴、换衣、检查或休息本身不能自动升级为 `sexual`。
- 害羞、调情、拥抱、亲吻或暧昧本身不能自动升级为 `sexual`。
- `sexual` 结束后，根据正文中是否已经重新穿衣返回 `nude` 或 `normal`。
- 模式不能覆盖角色意愿、关系事实、事件条件或玩家尚未表达的行动。
- `sexual` 下若姿势图没有反应差分，`reaction_id` 保留为叙事／未来扩展语义，但不强制参与选图。

## 5. 本地注册表与卡池合同

本地代码只登记长期稳定的语义和 fallback，不硬编码每一张远程变体：

```ts
interface GalPortraitPoolDefinition {
  poolId: string;
  characterId: string;
  visualMode: GalVisualMode;
  selectorId: string; // normal/nude 为 reaction_id；sexual 为 pose_id
  fallbackPoolIds: string[];
}
```

远程 release manifest 保存具体成员：

```json
{
  "schema_version": "gal-pool.v1",
  "release_id": "gal-pool-2026-08-01-r1",
  "pools": {
    "gal.reimu.sexual.pose_a": {
      "fallback_pool_ids": ["gal.reimu.nude.shy", "gal.reimu.normal.neutral"],
      "candidates": [
        {
          "asset_id": "gal_reimu_sexual_pose_a_01",
          "key": "characters/reimu/gal/sexual/pose-a/01.webp",
          "mime": "image/webp",
          "bytes": 0,
          "sha256": "<hex>",
          "weight": 1
        }
      ]
    }
  }
}
```

实际发布时 `bytes`、`sha256` 必须由工具生成，不允许保留占位值。路径使用 ASCII，源文件中文名仅留在来源记录。

## 6. 稳定抽卡规则

R2 不能也不需要列目录随机取图。前端从已验证 manifest 的候选列表中进行带权稳定抽取。

建议种子：

```text
releaseId
+ chatId
+ assistantMessageId
+ swipeId
+ speakerId
+ visualMode
+ selectorId
```

行为合同：

- 同一消息、Swipe、角色、模式和 selector 重绘时保持同一张图。
- 同一回复内连续 beat 没有改变模式或 selector 时保持画面，不重复抽取。
- 新 assistant 回复允许重新抽取；Swipe 变化必须重新计算。
- 刷新、iframe 重挂和返回 GAL 时可由同一键重建相同结果。
- 具体 `asset_id` 不写入 MVU；需要缓存时只存与楼层身份绑定的临时 UI 记录。
- 加载失败时先按本次稳定排序尝试同池下一候选，再执行跨池 fallback；不得无限重试。

默认 fallback：

```text
normal 缺图  -> 同角色 normal.neutral -> 角色默认图 -> 全局占位图
nude 缺图    -> 同角色 nude.neutral -> normal 同反应 -> 角色默认图
sexual 缺图  -> 同角色 sexual 默认姿势 -> nude 当前反应 -> 角色默认图
```

## 7. R2 滚动频道

GAL 卡池使用独立于核心 UI release 的滚动频道：

```text
gensokyo-moving-garden/
  channels/gal-stable.json
  releases/<gal-pool-release-id>/manifest.json
  releases/<gal-pool-release-id>/characters/...
```

频道指针示例：

```json
{
  "schema_version": "gal-channel.v1",
  "release_id": "gal-pool-2026-08-01-r1",
  "manifest_url": "releases/gal-pool-2026-08-01-r1/manifest.json",
  "manifest_sha256": "<hex>",
  "minimum_client_schema": "gal-pool.v1"
}
```

- `releases/<id>/**` 不可变，使用长期 immutable 缓存；禁止原地覆盖。
- `channels/gal-stable.json` 可变，使用 `no-cache` 或短 TTL；只能在新 release 全量上传并验证后切换。
- 客户端保存最近一次验证成功的频道和 manifest；频道损坏、超时或不兼容时回退 last-known-good，再回退随卡基础素材。
- 频道指针不是素材真相；不可变 manifest 才是一次卡池发行的完整快照。
- 更新已有 `pose_id` 的候选、权重或图片不需要重新打包角色卡；修改字段结构、抽卡算法、白名单语义或客户端 schema 仍需重新构建和打包。

## 8. 公开访问与 Worker 边界

首版假设 GAL 运行素材位于公开只读 R2 自定义域名：

- 匿名 `GET`／`HEAD`；不携带 Cookie、Authorization 或写入凭据；
- 为 SillyTavern 的不同来源配置适当 CORS；
- 卡内只保存可信 HTTPS 基址和频道路径，不接受模型、玩家文本、查询参数或 localStorage 覆盖域名；
- 浏览器中实际展示过的公开图片无法对玩家保密，本地开关只控制显示，不是访问控制。

出现以下任一需求时，改用私有 R2 + Cloudflare Worker，并单独评审接口、权限和回滚：

- 真正的账户、年龄或授权访问控制；
- 服务端抽卡、跨用户限次、动态活动权重或审计；
- 不向客户端公开完整卡池清单；
- 临时签名 URL 或私有对象读取。

不为单纯随机选图另租 VPS。Worker 若启用，也只做窄 API，不成为 MVU、剧情或玩家身份的第二状态源。

## 9. 分阶段实施

### A. LLM 变量合同（已完成，2026-08-01）

1. 在 `src/ui/types.ts` 新增 `GalVisualMode` 和 beat 的 `visualMode`。
2. 在 `src/ui/gal-scene.ts` 增加白名单归一化，缺失默认 `normal`。
3. 更新 `src/lorebook/gal-presentation-protocol.md` 的字段、判定和降级规则。
4. 更新模型可见路由／提示，使 `sexual` 仅在明确阶段输出，并仅选择登记姿势。
5. 补合法、缺失、未知模式及非法姿势夹具。

本阶段只让解析结果携带语义，不接真实成人素材、不部署 R2、不改 MVU。

完成记录：

- `GalBeat` 已新增 `visualMode`，三值类型为 `normal | nude | sexual`。
- `scene.v1` beat 与庭园正文 `<dialogue visual_mode="...">` 共用同一归一化入口。
- 缺失／未知模式回退 `normal`；`normal`／`nude` 姿势固定 `default`；`sexual` 暂保留安全格式姿势 ID，待 B 阶段按角色注册表做存在性校验。
- GAL 舞台写入 `data-visual-mode` 作为下一阶段唯一表现挂点，尚未据此切换图片。
- 模型可见协议已写入模式判定、禁止任意路径和旧消息兼容规则。
- `check:ui`、GAL／庭园正文定向测试和 `build:ui` 通过。全量测试 170 项中 169 项通过；唯一失败是工作区既有的对战卡按钮契约仍寻找已被当前道具匣替代的 `gg-use-duel-card`，与本阶段无关。

### B. 本地贴图注册表与离线回退

1. 新建独立 GAL portrait registry／resolver，避免继续在 `app.ts` 硬编码角色二选一。
2. 盘点并人工标注正常反应、全裸差分和成人姿势；数字源文件不得由程序猜测语义。
3. 在 `src/assets/asset-manifest.json` 登记活动运行源、来源、内容级别和 fallback。
4. 先用本地路径／自包含候选验证三模式切换、窄屏裁切和缺图回退。

魔理沙首批进度（2026-08-01，已接入本地候选）：

- 已登记 `marisa` 的五种反应：`neutral`（正常）、`smile`（开心）、`shy`（害羞）、`sad`（伤心）、`angry`（生气）。
- 已将所有者提供目录中的 `sfw` 五图按 `normal`、`nsfw` 五图按 `nude` 对应到五种反应；“哭泣”映射为 `sad`。10 张 `1152×1920` RGBA PNG 均按原字节复制到 `src/assets/characters/marisa/gal/`，没有裁切、缩放、透明处理或重编码。
- 10 个逻辑槽均已写入 ASCII 维护路径并标记 `ready`；`src/assets/asset-manifest.json` 登记来源目录、画布、内容家族、运行方式和 fallback。
- 魔理沙暂未登记 `sexualPoseIds`。模型若语义上必须输出 `sexual`，姿势归一化为 `default`；素材解析链计划依次回退到同反应 `nude`、`nude.neutral`、同反应 `normal`、`normal.neutral`。
- 预览构建复制原 PNG，自包含构建生成 data URL 并由宿主 dataset 注入 iframe；UI 只接受受控相对路径或 PNG data URL，真实切图使用完整透明画布、底部居中、`object-fit: contain` 与非像素化缩放。
- 离线类型检查、定向契约、生产 UI 构建、dist 哈希一致性和本地页面 10 槽注入／控制台检查已通过；真实 SillyTavern 的模型输出、切图、Swipe、窄屏构图和显式内容设置仍待验收。

### C. 卡池构建与远程解析

1. 扩展发布工具生成 `gal-pool.v1` manifest、哈希、MIME、字节和权重门禁。
2. 实现频道解析、manifest 校验、last-known-good、稳定抽取和有限重试。
3. 预加载下一张候选后再切换，避免白闪；远程失败不得清空当前可用图。
4. 保持现有 embedded 构建作为离线基线。

### D. R2 预发布与真实宿主验收

前提是所有者另行提供并授权桶、域名、CORS、上传入口和首个 release ID。

1. 上传新不可变 release，逐项验证长度、MIME、哈希和缓存头。
2. 最后切换测试频道，不直接覆盖正式频道。
3. 在真实 SillyTavern 验证新消息、连续 beat、Swipe、重新生成、刷新、断网、慢网、404、错误 manifest 和内容开关。
4. 验收完成后才允许正式频道切换。

## 10. 验收门

- 旧 `scene.v1` 无 `visual_mode` 时表现与当前版本一致。
- 未知 `visual_mode`、角色、反应、姿势、卡池或素材均安全回退。
- LLM 输出的路径、URL、`asset_id`、权重和 release 字段全部忽略。
- `nude` 不会仅因裸露自动升级为 `sexual`；`sexual` 结束后能正确回落。
- 同一楼层刷新不换图，Swipe 和新回复按合同重抽。
- 频道更新只改变卡池候选，不改变消息、MVU、结算、时间或角色关系。
- 远程完全不可用时仍能阅读正文、继续对话、结束会话并恢复原生聊天。
- 未启用成人素材时，任何 `nude`／`sexual` 请求均按本地策略降级。

## 11. 实施前仍需确认

- 成人素材本地开关的默认值和设置入口；
- 首批各角色允许的 `pose_id` 白名单与模型可见说明；
- 是否要求旧聊天永远固定首次抽中的 pool release，还是允许按频道重新解析；
- 正式 R2 桶、自定义域名、CORS、上传工具、秘密配置入口与回滚方式；
- 公开只读素材是否满足发布要求；若不满足，需先规划 Worker，不能先把私有素材暴露再补权限。
