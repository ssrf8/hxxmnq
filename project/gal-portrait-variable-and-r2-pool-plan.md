# GAL 贴图变量与 R2 live 卡池规划

> 决策日期：2026-08-01
> 状态：**A 阶段 LLM 表现变量已完成；B 阶段已接入魔理沙首批 10 张本地 GAL 贴图，待真实 SillyTavern 验收，未改 MVU、未部署 R2**
> 适用范围：GAL 角色近景，不改变战斗 cut-in、庭园像素角色或正式 MVU 游戏状态
> 单桶约束：GAL 卡池与核心运行素材共用项目唯一 R2 桶，只使用独立前缀和 manifest，不创建
> GAL 专用桶。

## 1. 目标

现有 GAL 素材按用途分为三组：

1. 正常穿着的反应图片；
2. 与正常反应对应的全裸差分；
3. 进入亲密阶段后使用的独立姿势图片。

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
| 当前反应与姿势语义 | `reaction_id`、`pose_id`、`act_id` | LLM 表现协议 | 当前 beat |
| 合法角色、反应、姿势和卡池映射 | 本地 GAL 贴图注册表 | 维护源 | 随 UI 代码版本 |
| 卡池成员、权重、对象 key、哈希 | `live/manifest.json` | 发布工具 | 单调 `generation`；最后上传 |
| 当前远程素材代次 | `live/manifest.json` 的 `generation` | 发布流程 | 可变 live manifest |
| 本次抽中的具体图片 | iframe UI 临时记录 | 本地抽卡器 | `chatId + messageId + swipeId + shot key` |
| 素材是否启用 | 本地 UI 设置 | 玩家 | 本机偏好，不写 MVU |
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
  act_id?: 'vaginal' | 'anal' | 'none';
  text: string;
}
```

缺少、未知或非法的 `visual_mode` 一律归一化为 `normal`，保证旧消息和旧模型回复仍可播放。

### 4.1 三种模式

| `visual_mode` | 素材家族 | 主要选择字段 | 规则 |
|---|---|---|---|
| `normal` | 正常反应图 | `reaction_id` | 正常穿着；`pose_id` 首版固定 `default` |
| `nude` | 全裸反应差分 | `reaction_id` | 完全裸露但未进入明确亲密行为；`pose_id` 首版固定 `default` |
| `sexual` | 独立姿势图 | `pose_id` + `act_id` | 只有正文已进入明确亲密行为时使用；姿势与行为必须属于该角色白名单 |

判定约束：

- 裸露、洗浴、换衣、检查或休息本身不能自动升级为 `sexual`。
- 害羞、调情、拥抱、亲吻或暧昧本身不能自动升级为 `sexual`。
- `sexual` 结束后，根据正文中是否已经重新穿衣返回 `nude` 或 `normal`。
- 模式不能覆盖角色意愿、关系事实、事件条件或玩家尚未表达的行动。
- `sexual` 下若姿势图没有反应差分，`reaction_id` 保留为叙事／未来扩展语义，但不强制参与选图。

### 4.2 姿势与行为语义（待实现）

`pose_id` 只描述构图／体位，`act_id` 只描述插入行为；两者必须分开，禁止由前端或正文关键字
推断。这样同一“后入”等构图可按不同素材池严格区分，避免错误切图。

```text
visual_mode = sexual
pose_id     = rear
act_id      = vaginal | anal | none
```

- `vaginal`：主列表中带插入语义的默认变种。
- `anal`：与同一 `pose_id` 对应的肛交变种。
- `none`：不适用这两种插入区分的项目，例如乳交、口交、手交、单脚足交、双脚足交与 69。
- `normal`／`nude` 固定 `pose_id="default"`；`act_id` 缺失并按 `none` 处理。
- `sexual` 必须同时提供合法的 `pose_id` 与 `act_id`；信息不明确时不得猜测，回退至
  `nude`／`normal`。
- `anal` 缺图时不得回退到 `vaginal`；只能尝试同角色、同体位的 `none`，再回退
  `nude`／`normal`。
- 所有语义只适用于明确成年、双方自愿的角色与情境。

首批 `pose_id` 目录如下。每个角色可在远端卡池中只登记实际拥有图片的项；不存在的池不参与抽卡。

| 类别 | 稳定 `pose_id` | `act_id` |
|---|---|---|
| 主列表 | `missionary`（传教士） | `vaginal`／`anal` |
| 主列表 | `rear`（后入／跪趴） | `vaginal`／`anal` |
| 主列表 | `prone`（俯卧式） | `vaginal`／`anal` |
| 主列表 | `rear_standing`（站立后入） | `vaginal`／`anal` |
| 主列表 | `cowgirl`（女上位） | `vaginal`／`anal` |
| 主列表 | `reverse_cowgirl`（反向女上位） | `vaginal`／`anal` |
| 主列表 | `side`（侧卧） | `vaginal`／`anal` |
| 主列表 | `front_standing`（站立正面） | `vaginal`／`anal` |
| 主列表 | `seated`（坐姿） | `vaginal`／`anal` |
| 主列表 | `lotus`（莲花式） | `vaginal`／`anal` |
| 主列表 | `leg_raise_split`（一字马／高抬腿） | `vaginal`／`anal` |
| 非插入项目 | `sixty_nine`（69） | `none` |
| 非插入项目 | `breast`（乳交） | `none` |
| 非插入项目 | `oral`（口交） | `none` |
| 非插入项目 | `manual`（手交） | `none` |
| 非插入项目 | `foot_single`（单脚足交） | `none` |
| 非插入项目 | `foot_double`（双脚足交） | `none` |

`rear_standing` 的普通站立、把尿式、独轮车式等只作为同一池内候选图片的构图变体；首版不增加
`variant_id`，因此 LLM 不必输出更细粒度字段。若未来这些变体需要独立叙事控制，再以兼容的可选
`variant_id` 扩展，不能改写既有 `pose_id` 含义。

## 5. 本地注册表与卡池合同

本地代码只登记长期稳定的语义和 fallback，不硬编码每一张远程变体：

```ts
interface GalPortraitPoolDefinition {
  poolId: string;
  characterId: string;
  visualMode: GalVisualMode;
  selectorId: string; // normal/nude 为 reaction_id；sexual 为 pose_id + act_id
  fallbackPoolIds: string[];
}
```

`live/manifest.json` 保存具体成员；以下只展示与 GAL 候选有关的字段，完整顶层 schema 仍由 live
发布工具拥有：

```json
{
  "generation": 1,
  "assets": [
    {
      "asset_id": "gal_reimu_sexual_rear_anal_01",
      "pool_id": "gal.reimu.sexual.rear.anal",
      "source": "characters/reimu/gal/sexual/rear/anal/01.png",
      "mime": "image/png",
      "bytes": 0,
      "sha256": "<hex>",
      "weight": 1
    }
  ]
}
```

实际发布时 `bytes`、`sha256` 必须由工具生成，不允许保留占位值。路径使用 ASCII，源文件中文名仅留在来源记录。

## 6. 稳定抽卡规则

R2 不能也不需要列目录随机取图。前端从已验证 manifest 的候选列表中进行带权稳定抽取。

建议种子：

```text
manifestGeneration
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

## 7. R2 单轨 live 卡池

GAL 卡池与其他运行素材共用唯一 live 接口，不再使用旧 `gal-pools/` 与频道指针：

```text
gensokyo-moving-garden/
  live/manifest.json
  live/characters/<character_id>/gal/normal/...
  live/characters/<character_id>/gal/nude/...
  live/characters/<character_id>/gal/sexual/<pose_id>/<act_id>/<nn>.png
```

- `live/manifest.json` 使用 `no-store`，包含单调 `generation`、更新时间及全部活动对象的 source、MIME、
  字节与 SHA-256；sexual 候选另含 `asset_id`、`pool_id` 和 weight。
- `live/**` 媒体使用 `max-age=0, must-revalidate`，允许同名覆盖并通过 ETag／Last-Modified 重验证；不得
  再应用 immutable Cache Rule。
- 发布时先上传并校验全部媒体，最后覆盖完整 manifest。客户端只消费 manifest，不扫描 R2 目录。
- 客户端保存最近一次完整验证成功的 manifest／离线缓存代次；新 manifest 损坏、超时或不兼容时回退
  last-known-good，再回退随卡基础素材。
- 更新冻结 `pose_id + act_id` 下的图片、候选或权重不需要重新打包角色卡；修改字段结构、抽卡算法、
  白名单语义或客户端 schema 仍需重新构建和打包。
- 体位图片的固定路径、灵梦缺图首发和 R2-only 更新门槛以
  `project/nsfw-pose-live-asset-naming-plan.md` 为唯一专项合同。

## 8. 公开访问与 Worker 边界

首版假设 GAL 运行素材位于公开只读 R2 自定义域名：

- 匿名 `GET`／`HEAD`；不携带 Cookie、Authorization 或写入凭据；
- 为 SillyTavern 的不同来源配置适当 CORS；
- 卡内只保存可信 HTTPS 基址和固定 `/live/manifest.json` 路径，不接受模型、玩家文本、查询参数或 localStorage 覆盖域名；
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

本阶段只让解析结果携带语义，不接真实素材、不部署 R2、不改 MVU。

完成记录：

- `GalBeat` 已新增 `visualMode`，三值类型为 `normal | nude | sexual`。
- `scene.v1` beat 与庭园正文 `<dialogue visual_mode="...">` 共用同一归一化入口。
- `act_id` 已进入运行时 beat：`sexual` 可携带 `vaginal`／`anal`／`none`，旧消息、非 `sexual` 与非法值均兼容降为 `none`；尚未接入真实体位图片选择。
- 缺失／未知模式回退 `normal`；`normal`／`nude` 姿势固定 `default`；`sexual` 暂保留安全格式姿势 ID，待 B 阶段按角色注册表做存在性校验。
- GAL 舞台写入 `data-visual-mode` 作为下一阶段唯一表现挂点，尚未据此切换图片。
- 模型可见协议已写入模式判定、禁止任意路径和旧消息兼容规则。
- `check:ui`、GAL／庭园正文定向测试和 `build:ui` 通过。全量测试 170 项中 169 项通过；唯一失败是工作区既有的对战卡按钮契约仍寻找已被当前道具匣替代的 `gg-use-duel-card`，与本阶段无关。

### B. 本地贴图注册表与离线回退

1. 新建独立 GAL portrait registry／resolver，避免继续在 `app.ts` 硬编码角色二选一。
2. 盘点并人工标注正常反应、全裸差分和姿势；数字源文件不得由程序猜测语义。
3. 在 `src/assets/asset-manifest.json` 登记活动运行源、来源、内容级别和 fallback。
4. 先用本地路径／自包含候选验证三模式切换、窄屏裁切和缺图回退。

八人首批进度（2026-08-02，已接入维护源，尚未发布）：

- 已登记 `reimu`、`marisa`、`cirno`、`alice`、`nitori`、`mystia`、`suika`、`sakuya`；每人均有 `neutral`（正常）、`smile`（开心）、`shy`（害羞）、`sad`（哭泣）、`angry`（生气）五种反应。
- 每人 `sfw` 五图对应 `normal`，`nsfw` 五图对应 `nude`。80 张 `1152×1920` RGBA PNG 均从 `旧素材/素材处理/CG/` 按原字节复制到 `src/assets/characters/<id>/gal/`，没有裁切、缩放、透明处理、量化或重编码。
- `scripts/stage-gal-portraits.mjs` 是唯一批量入库工具：默认遇到不一致的既有目标即失败；本轮以所有者指定的原始目录为真相，显式覆盖了魔理沙 `normal/smile` 的旧副本。
- 80 个逻辑槽均已写入 ASCII 维护路径并标记 `ready`；`src/assets/asset-manifest.json` 登记来源目录、画布、内容家族、运行方式和 fallback。`sexual` 尚无专用姿势图，始终回退至当前反应的 `nude`／`normal` 链。
- 预览构建复制原 PNG，自包含构建生成 data URL 并由宿主 dataset 注入 iframe；UI 只接受受控相对路径或 PNG data URL，真实切图使用完整透明画布、底部居中、`object-fit: contain` 与非像素化缩放。
- `check:ui`、全量测试、R2 staging dry-run 与 `build:ui` 已通过。真实 SillyTavern 的模型输出、切图、Swipe、窄屏构图和显式内容设置仍待验收。

### C. 体位图片准备与卡池登记（待完成）

本阶段只准备和登记已获准公开分发、明确成年且自愿情境的素材；不改 MVU、不从正文猜测行为，
也不上传任何未经过人工核对的图片。

体位图片的固定名称、28 池／角色预留目录、灵梦缺图首发、R2-only 补图流程与首包实现门槛，
统一以 `project/nsfw-pose-live-asset-naming-plan.md` 为准。本节只保留阶段摘要；若与专项文档冲突，
必须先修正文档，不能临时创造另一套文件名。

1. 确认每位允许进入卡池的角色名单；未明确确认的角色不得创建 `sexual` 池。
2. 按 §4.2 的 `角色 × pose_id × act_id` 目录准备图片；每张图人工核对角色、体位、行为、画布、
   透明边缘和来源记录。图片候选不需要表情差分。
3. 每个角色／体位／行为组合允许从缺图状态开始；同一组合的后续变体作为同池 candidates，使用
   `01.png`、`02.png` 等稳定 ASCII 文件名，不上传空文件或占位图。
4. 原始 PNG 不压缩、不转 WebP、不缩放、不重编码，统一上传到
   `live/characters/<id>/gal/sexual/<pose_id>/<act_id>/<nn>.png`；manifest 必须记录
   `asset_id`、`pool_id`、source、MIME、字节、SHA-256 和 weight，禁止客户端枚举目录。
5. 全部对象 HEAD／GET 与哈希校验完成后，最后才更新 `live/manifest.json`；首包已完成专项命名计划
   规定的动态 resolver 后，新增图片或既有体位的候选无需重新打包角色卡。

验收：每张图片可追溯；每个 manifest 池键严格为
`gal.<character_id>.sexual.<pose_id>.<act_id>`；`anal` 与 `vaginal` 不交叉回退；失败时仍能阅读正文。

### D. 固定 live 素材解析

1. 按项目已批准的单轨方案，把全部 GAL PNG 纳入 `live/manifest.json` 与 `live/characters/<id>/gal/...`。
2. 客户端固定请求 live manifest 和同名素材 URL；不使用 GAL 独立 release、`gal-pools/`、
   `channels/gal-stable.json` 或不可变卡池。
3. 媒体使用 `max-age=0, must-revalidate`，manifest 使用 `no-store`；全部媒体校验完成后最后更新 manifest。
4. 保持 embedded 构建仅作离线开发基线，不把包含全部 80 图的卡作为日常测试或发布产物。

### E. R2 预发布与真实宿主验收

前提是固定 live 发布器、客户端缓存和 Cache Rule 已按项目单轨契约实现。

1. 覆盖上传全部 live 媒体，逐项验证长度、MIME、哈希和缓存头；最后写入 live manifest。
2. 在真实 SillyTavern 验证普通消息、连续 beat、Swipe、重新生成、刷新、断网、慢网、404 与素材关闭。
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
- 未启用素材时，任何 `nude`／`sexual` 请求均按本地策略降级。

## 11. 实施前仍需确认

- 素材本地开关的默认值和设置入口；
- 首批各角色允许的 `pose_id` 白名单与模型可见说明；
- 是否要求旧聊天永远固定首次抽中的 pool release，还是允许按频道重新解析；
- 项目唯一 R2 桶、自定义域名、CORS、上传工具、秘密配置入口与回滚方式；
- 公开只读素材是否满足发布要求；若不满足，需先规划 Worker，不能先把私有素材暴露再补权限。
