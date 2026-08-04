# 全素材入库、弹幕音效与 Cloudflare R2 发布规划

> 2026-08-02 更新：当前生产 release 为 `0.2.0-r62-0e5ecacdee9f`，manifest 声明哈希为
> `0f068864b044613d4d5110ad6f7a850f7aecec1609821a90d0a5ed16cd5a8965`，r63 轻量卡已固定使用。
> 本文件保留架构与历史规划；实际 staging、上传、校验、remote-r2 构建、轻量打包和旧 release
> 删除门槛，以 `project/r2-packaging-runbook.md` 为唯一操作手册。

> 状态：**本地音效、发布清单、优先调度、`remote-r2` 构建、R2 预发布、生产自定义域名与新域名固定 release 已完成；战斗 atlas CORS 缓存冲突修复、真实 SillyTavern 候选和正式切换（F–G）待继续**。

> **2026-08-02 所有者决策（待实施）**：此前全部 R2 release 均为所有者个人测试版本。后续不再维护
> “不可变 release 与可变频道”双轨；统一迁移到单一、固定路径的 live 素材接口。图片和音频的 logical
> source 名保持不变，内容允许原地更新；`SHA-256` 保留为发布校验记录，不再进入请求 URL。本文中与此
> 决策冲突的旧 release 流程仅作为历史记录，不得作为下一次发布的操作依据。

> 成人体位图片在 live 接口下的固定名称、预留池、缺图发布和后续免重打包补图规则，见
> `project/nsfw-pose-live-asset-naming-plan.md`。该专项合同服从本文件的单轨 live、manifest 最后上传与
> 缓存重验证规则；不得恢复旧 `gal-pools/`／频道双轨。sexual CG 是全项目图片压缩流程的明确例外：
> 只上传所有者原始 PNG 字节，禁止转 WebP 或运行任何优化器，维护源、staging 与 R2 GET 的 SHA-256
> 必须完全一致。

## 0. 已批准的单轨 live 素材迁移方案（待代码实现）

### 0.1 目标契约

新角色卡只固定可信 origin 与下列不变 API，不固定 release ID 或素材内容哈希：

```text
https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/manifest.json
https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/<source>
```

`<source>` 直接使用活动 `asset-manifest.json` 的 source，例如
`ui/reimu-dungeon-button-v1.webp`、`maps/garden-base-owner-v3.webp`。素材替换时只覆盖同名
live object；角色卡内请求接口、图片名和 source 均不改变。

### 0.2 缓存与一致性

| 对象 | 响应策略 | 原因 |
|---|---|---|
| `live/manifest.json` | `Cache-Control: no-store` | 每次启动取得当前文件表、generation 与校验记录。 |
| `live/**` 媒体 | `Cache-Control: public, max-age=0, must-revalidate` | 可由浏览器/CDN 保存，但每次使用必须用 ETag/Last-Modified 向源站确认；未变通常只返回 304，变化时下载新字节。 |
| 404／上传中的错误 | `Cache-Control: no-store` | 防止首次 404 被缓存成“素材不存在”。 |

- 必须删除覆盖 `live/**` 的 `immutable` Cache Rule；否则同 URL 的旧图可以被保存一年，live 契约失效。
- 客户端 live 预加载禁止使用 `cache: 'force-cache'`；应使用默认缓存行为或 `cache: 'no-cache'`，让 HTTP
  revalidation 生效。
- manifest 至少包含 `generation`（单调递增发布号）、`updated_at`、每项 `bytes`、`mime`、`sha256` 和
  `source`。hash 用于上传后校验、诊断和离线缓存换代，**不用来拼接 URL**。
- 多对象原地覆盖不具备跨对象原子性。发布器必须先上传并校验全部媒体，最后覆盖 `live/manifest.json`；
  manifest 是唯一发布完成标记。旧 manifest 与新媒体短暂交错只允许发生在向前兼容的素材改动中；涉及
  图集尺寸、帧布局、字段删除或运行时代码契约变化时，必须先发布兼容代码并进行实机验收。

### 0.3 客户端、离线缓存与发布器改造范围

1. `scripts/build-runtime-assets.mjs` 与 `scripts/publish-r2-assets.mjs` 新建 live manifest/staging 与
   覆盖计划：允许且只允许写 `gensokyo-moving-garden/live/`，拒绝写其他桶或未列入 manifest 的 key。
2. `scripts/build-ui.mjs`、`src/ui/asset-remote-resolver.ts` 改为单一 `remote-r2-live` 配置：构建时固定
   HTTPS origin 和 `/live/manifest.json`，运行时无凭据读取 manifest；不再写入 `releaseId` 或固定
   manifest hash。
3. `src/ui/asset-preloader.ts` 改为可重验证请求；`src/ui/asset-offline-cache.ts` 的缓存名改为
   `gg-runtime-assets:live:<generation-or-manifest-hash>`，下载并验证新代后再删除旧代。
4. 更新 R2 专项测试，覆盖固定 URL、第二次发布后 ETag/304、内容更新后 200、新 manifest 最后可见、
   Canvas anonymous CORS、离线缓存换代、断网 fallback 与错误 MIME。
5. 完成一次真实 SillyTavern 导入和缓存更新验收后，所有后续轻量卡只使用 live 模式；不保留新双轨构建。

### 0.4 迁移边界与回退

- 本次决策**不授权删除**当前桶内旧测试 release；它们不再是发布链的一部分，待单独清理任务精确列出
  前缀和对象后再处理。
- live 模式的回退是重新上传上一次已校验的同名素材，再最后上传对应 manifest；不能依赖旧 release URL
  自动回退。
- 在代码、Cache Rule 与实机验收完成前，`0.2.0-r62-0e5ecacdee9f` / r63 仍只是历史测试基线，不得把
  本计划误报为已经生效。
>
> 2026-07-31 所有者提出：先把现有弹幕音效纳入项目维护源；上线时计划把项目运行素材托管到
> Cloudflare R2。本文件统一规划图片、音频和未来新增媒体的维护源、发布清单、R2 对象结构、
> 缓存、CORS、回滚与验收。
>
> 2026-08-01 已确认项目唯一桶为 `hxxwy`，首个不可变 release 为
> `0.2.0-r55-bbc0e074f993`；短期通过公开 `r2.dev` 域名验收。生产素材域名拟使用
> `ssrfrrt.ccwu.cc`；该域名现已绑定到 `hxxwy`，ownership／SSL active，最低 TLS 1.2。
>
> 2026-08-01 所有者确认：**整个项目长期只使用一个 R2 桶**。核心素材、GAL 滚动卡池、频道
> 指针和未来 BGM 均进入同一桶，通过不可变前缀、独立 manifest 与缓存策略隔离；规划和发布工具
> 不得要求或自动创建第二个业务桶。

## 开场预加载约定

> 2026-08-01 实现状态：`src/ui/asset-preloader.ts` 已按以下合同调度。浏览器预发布验证共登记
> 114 项：入口关键素材 16/16 后即可进入，非 GAL 完成或 fallback 后再单并发静默加载 GAL；
> 实际触发的场景或单素材可抢占，单项默认最多三次尝试。可选 Cache Storage 服务模块已实现，
> 但设置页离线包开关仍未接入，当前实际依赖浏览器 HTTP cache。

- 开场主视觉继续以压缩 JPEG data URI 内嵌在 `src/ui/styles.css`，不进入 R2 release；这样开场页不依赖首次网络请求。
- 开场页出现后即静默后台加载“最低可玩集”；玩家确认进入时只检查该集合，不等待全量素材。
- 最低可玩集包含地图与导航、当前在场角色的小人渲染链、当前可见设施形态和三张主入口按钮；完成或进入明确 fallback 后即可游玩。
- 战斗、商店、设施详情按即将进入的场景组成可抢占场景包。GAL 背景与近景图最低优先级，只在高优先队列空闲时单并发静默获取。
- 玩家触发尚未就绪的具体场景／GAL 素材时，只提升该素材及其直接依赖；不重新启动全量加载，也不阻塞庭园其他操作。
- 单项载入失败只重试对应素材，默认最多尝试 3 次。仍失败时使用现有降级显示，不阻断进入与存档流程。

## 1. 目标与不做事项

### 1.1 目标

1. 把 `音效/web-sfx/` 的 26 个 AI 重生成 WAV 作为有来源记录的候选维护源纳入
   `src/assets/audio/`。
2. 从候选源派生 14 个稳定事件 ID 的运行时音效，接入现有 `BattleSoundBus`，不改变弹幕模拟、
   `BattleResult`、主线／副本结算和 MVU。
3. 为**所有运行素材**建立一份由构建生成的发布清单；上线时只上传清单列出的文件，不上传
   `src/assets` 整树、历史文件、chroma 稿、独立帧、Aseprite 工程或陈旧 `dist` 残留。
4. 保留两种可验证交付：
   - `embedded`：当前自包含角色卡／离线检查点，素材继续内嵌；
   - `remote-r2`：上线发行版，UI 代码壳内嵌，图片与音效读取固定版本的 R2 URL。
5. 远程素材失败时安全降级：图片沿用现有 fallback，音效静默失败，玩法和结算继续工作。

### 1.2 本计划不做

- 不把 BGM 混进本轮 SFX；BGM 需另建循环、淡入淡出、页面隐藏和版权规格。
- 不在角色卡、前端代码、清单或日志中放 R2 写入密钥。
- 不从模型输出、玩家文本、聊天消息或任意 URL 动态决定素材地址。
- 不覆盖已发布 R2 对象，不把可变 `latest` 指针作为角色卡运行时的唯一事实源。
- 不因上线 R2 删除仓库维护源；仓库仍是可复现构建的内容真相。
- 不把本规划视为上传、DNS、CORS 或生产部署授权。

## 2. 当前事实基线

### 2.1 当前构建

- `scripts/build-ui.mjs` 显式读取运行图片，开发预览复制到 `dist/assets/`，角色卡运行壳则把图片
  转为 data URL 写入 `dist/runtime/ui-mount.js`。
- `src/runtime/ui-host-shell.js` 把 data URL 交给子 iframe 的 `documentElement.dataset`；
  UI 仍保留 `../assets/...` 开发相对路径 fallback。
- 当前弹幕音效事件已经全部从 `battle-simulation.ts` 发出，`src/ui/battle-engine.ts`
  已注入应用级 WebAudio 真总线；`nullSoundBus` 仅作 fallback。
- `embedded` 仍是默认构建；`remote-r2` 只在显式传入干净、固定 release manifest 时启用，
  不从查询参数、模型文本或 `localStorage` 接受远端坐标。

### 2.2 素材盘点口径

| 范围 | 当前观察值 | 结论 |
|---|---:|---|
| `src/assets` | 2122 PNG，约 380MB；另有 Aseprite、JSON、GIF、SVG 等 | 混有运行图、维护稿、独立帧和参考文件，不能整树发布 |
| 当前 `dist/assets` | 128 文件，约 207.49MB | 构建未保证先清空，可能含历史残留，不能整目录上传 |
| `音效/web-sfx` | 26 WAV，660,862 bytes（约 645.4KB） | 已按原字节归档为维护源；14 个运行事件 WAV 共 308,202 bytes，已登记、接线并进入两种构建 |
| 当前音频参数 | 全部单声道、22050Hz；20 个 8-bit、6 个 16-bit；50–4990ms | 无需无意义上采样；需裁切、响度和峰值检查 |

当前 R2 运行集（2026-08-01 dry-run）按大类统计如下；这也是不能把全量下载当作开场门的直接依据：

| 类别 | 文件数 | 字节 | 约 MiB | 调度结论 |
|---|---:|---:|---:|---|
| 地图与导航 | 2 | 333,844 | 0.32 | 最低可玩集 |
| 角色小人 | 25 | 23,201,720 | 22.13 | 当前在场角色优先，其余后台；无损 WebP |
| 庭园世界／设施 | 18 | 1,236,586 | 1.18 | 当前可见形态优先，其余后台或按需 |
| UI | 5 | 3,443,691 | 3.28 | 三张入口按钮优先；商店／GAL 背景按场景；其中 GAL 背景保持 PNG |
| 弹幕战 | 40 | 3,900,438 | 3.72 | 不进入开场总门；按对手／副本场景包加载 |
| 战斗音效 | 14 | 308,202 | 0.29 | 战斗包内加载，未就绪时静默 |
| GAL 近景 | 10 | 22,544,412 | 21.50 | 最低后台优先级，触发单图时抢占 |
| **合计** | **114** | **54,968,893** | **52.42** | 只按 manifest 发布，不在开场全量等待；非 GAL 为 28.25 MiB |

因此上线发布清单必须从活动 manifest 与构建实际消费项生成，不能用“某个目录里看起来都是素材”
代替。

## 3. 素材分层与唯一真相

### 3.1 四层

| 层 | 位置／产物 | 职责 | 是否上传 R2 |
|---|---|---|---|
| 原始／所有者源 | `src/assets/**/source/`、所有者直导原件、确定性维护稿 | 可追溯、可重新派生 | 否 |
| 活动运行源 | `src/assets/` 中被 `asset-manifest.json` 明确标记为 runtime 的文件 | 本地开发与构建输入 | 是 |
| 发布清单 | 构建生成的 `dist/asset-release/<release-id>/manifest.json` | 精确列出 key、MIME、字节、SHA-256、缓存策略 | 是 |
| 发行物 | 自包含 UI mount 或固定 R2 release 前缀 | 供角色卡实际消费 | 按构建模式 |

`src/assets/asset-manifest.json` 继续拥有素材身份、来源、状态和活动路径；未来生成的 release manifest
只是某次发行快照，不能反向覆盖维护源。

### 3.2 全素材分类

| 类别 | 现有例子 | 远程策略 | 失败策略 |
|---|---|---|---|
| 地图与导航 | 底图、不可行走蒙版 | 同一 release 固定版本 | 地图加载失败时恢复可诊断的既有降级 |
| UI | 入口卡面、商店／GAL 背景 | 固定版本，按视图懒加载 | 文本与 CSS 基础 UI 仍可用 |
| 庭园世界 | 设施正常／异常／损坏图 | 进入庭园后预取当前区域 | 保留现有形状／隐藏失败层 |
| 角色 | turnaround、motion、approved sequence | 当前在场角色优先加载，其余懒加载 | 静态帧或旧 fallback |
| 弹幕战 | 自机、Boss、cut-in、妖精、弹幕和特效图集 | 开战前并行预取；战斗关键图设超时 | 几何弹体、样式化卡片等既有 fallback |
| 音效 | 14 个 `BattleSfxId` | 开战时解码关键音效，其余按需 | 静默，不中断模拟和结算 |
| 作者维护项 | chroma、独立帧、Aseprite、报告预览 | 不发布 | 不适用 |
| 历史归档 | `旧素材/` | 不发布 | 不适用 |

## 4. 弹幕音效入库方案

### 4.1 建议目录

```text
src/assets/audio/
  source/
    battle-ai-regenerated-v1/
      provenance.md
      *.wav
  runtime/
    battle/
      player_shot.wav
      boss_hit.wav
      mob_defeat.wav
      graze.wav
      item_pickup.wav
      player_miss.wav
      bomb.wav
      wave_start.wav
      spell_declare.wav
      phase_break.wav
      laser_warning.wav
      laser_fire.wav
      battle_win.wav
      battle_lose.wav
```

- `source/` 保存 26 个原始字节和来源／授权说明，不参与运行发布。
- `runtime/` 只放实际使用的 14 个稳定事件文件；允许从 source 裁切、淡入淡出、混合和归一化，
  但每个派生关系必须登记。
- 首版运行格式采用 WAV：现有候选总量很小、浏览器解码兼容性高，也避免为了满足旧占位规格而
  将 22050Hz 素材无收益上采样。以后若包体仍需缩减，再用有确定工具链和浏览器矩阵的
  OGG／M4A 双格式替换。

### 4.2 首轮事件映射

下表是**制作映射**，不是声学验收结论。需要试听后才能确认裁切点、增益和最终选材。

| 事件 ID | 候选源 | 处理计划 |
|---|---|---|
| `player_shot` | `玩家_射击_plst00.wav` | 保留短瞬态；低增益；80ms 节流 |
| `boss_hit` | `敌人_Boss受伤_damage00.wav` | 缩短尾部；低增益；60ms 节流 |
| `mob_defeat` | `敌人_普通击破_enep00.wav` | 取清脆爆裂主体，控制在约 250ms |
| `graze` | `玩家_擦弹_graze.wav` | 保留辨识瞬态；60ms 节流，激光擦弹不得叠成爆音 |
| `item_pickup` | `道具_拾取_item00.wav` | 轻微抬高存在感，控制在约 120–170ms |
| `player_miss` | `玩家_中弹死亡_pldead00.wav` | 保留约 500–900ms 主体 |
| `bomb` | `符卡_灵梦B魔理沙A发动_power1.wav` | 裁为约 900ms；试听后可与 `power0` 比选 |
| `wave_start` | `特效_闪光魔法粒子1_kira00.wav` | 取约 250–400ms 提示段 |
| `spell_declare` | `符卡_通用发动_cat00.wav` | 裁为约 600–700ms |
| `phase_break` | `特效_闪光魔法粒子3_kira02.wav` | 保留约 600ms；确认有阶段结束力度 |
| `laser_warning` | `战斗_强力能量效果_power0.wav` | 取连续上升段，控制在约 500–600ms |
| `laser_fire` | `激光_Boss激光1_lazer00.wav` | 与 `lazer01` 试听比选，控制在约 300–500ms |
| `battle_win` | `道具_获得残机1UP_extend.wav` | 作为首轮胜利候选，保留约 1.5s |
| `battle_lose` | `玩家_中弹死亡_pldead00.wav` + `菜单_返回取消_cancel00.wav` | 派生约 1–1.5s 的失败尾声；若听感不成立则补生成专用素材 |

以下候选暂不进入弹幕运行包：三种敌方发射、菜单三音、灵梦 A 发射、极限火花、倒计时、
火力提升和未被选中的粒子／激光版本。它们保留在 source 层，未来新增 `enemy_shot`、菜单声或
特殊符卡事件时再登记，不能仅因“文件已经存在”就上传。

### 4.3 声学门禁

每个 runtime 文件至少记录：

- 源文件、处理动作和处理工具／版本；
- 声道、采样率、位深、时长、字节；
- 峰值不得削波；首尾无明显爆点；同类事件主观响度一致；
- `player_shot`、`boss_hit`、`graze` 在高频压力测试中不形成持续爆音；
- 全套 runtime SFX 建议继续控制在 1.5MB 内。

当前 `音效/来源文档.txt` 只有“AI 重新生成、无版权风险”的概括。公开发行前应补充：
提供者、生成／重生成方式、是否含第三方输入、允许修改及随角色卡和 R2 再分发的明确声明。
声明不必公开个人身份，但必须能支撑项目的再分发判断。

## 5. 真音效总线实施计划

### 5.1 接口

- 保留 `BattleSoundBus.play(id)`，新增真实实现，例如 `createBattleSoundBus(options)`。
- `battle-simulation.ts` 的 14 个触发点不改；`battle-engine.ts` 的单一接线点由
  `nullSoundBus` 替换为注入的真总线。
- 素材来源由构建时可信配置提供；不读取模型、聊天正文或玩家 URL。

### 5.2 WebAudio 行为

1. 首次明确用户操作（进入战斗或点击启用声音）后创建／恢复 `AudioContext`，不得绕过浏览器
   自动播放限制。
2. `fetch/arrayBuffer → decodeAudioData` 使用 Promise 缓存；同一文件不重复下载或解码。
3. 高频事件按 ID 节流：
   - `player_shot`：建议 80ms；
   - `boss_hit`、`graze`：至少 60ms；
   - 激光持续擦弹继续受模拟层 tick 与声音层双重保护。
4. 设主增益和分类增益；首版建议主音量 0.6，射击／命中再下调。
5. 设置页提供“战斗音效”开关和音量；偏好只进 `localStorage`，不写 MVU。
6. `destroy()` 停止当前节点并清理监听；页面隐藏／战斗暂停不继续制造新声音。
7. 单个音效加载／解码失败只记录一次脱敏诊断并静默，不影响 120Hz 固定步长循环。

### 5.3 加载次序

- 开战前优先解码：`player_shot`、`boss_hit`、`graze`、`player_miss`、`bomb`。
- 其余音效后台并行解码；在对应事件前未就绪时跳过一次，不阻塞开战。
- R2 模式下音频必须以匿名 CORS 请求读取；不携带 Cookie、Authorization 或写入凭据。

### 5.4 Canvas 跨域图片

- 地图、不可行走蒙版、角色和战斗图会进入 Canvas；所有远程 `Image` 必须在赋值 `src` **之前**
  设置 `crossOrigin = 'anonymous'`。
- 这一点对不可行走蒙版尤其关键：未启用匿名 CORS 的跨域图片会污染 Canvas，后续像素读取可能
  抛出安全异常。远程模式不能把这种异常伪装成正常导航结果。
- CSS 背景可继续直接引用固定 URL；同一 logical asset 不应同时走 CSS、dataset 和临时拼接的
  三套不同地址。
- 加载器必须覆盖图片成功、404、超时、CORS 拒绝和解码失败；失败后仍走对应 fallback。

## 6. 发布资产清单

### 6.1 生成物

当前仓库已经提供：

```text
scripts/build-runtime-assets.mjs
scripts/publish-r2-assets.mjs
```

`build-runtime-assets` 从 `asset-manifest.json` 的活动 runtime 项生成：

```text
dist/asset-release/<release-id>/
  files/<logical-path>
  manifest.json
```

`manifest.json` 每项至少包含：

```json
{
  "logical_id": "battle.sfx.graze",
  "key": "releases/<release-id>/audio/battle/graze.wav",
  "mime": "audio/wav",
  "bytes": 4542,
  "sha256": "<hex>",
  "cache": "immutable",
  "required": false,
  "fallback": "silent"
}
```

发布清单还要记录总体字节、文件数量、生成时间、源项目版本、清单自身 SHA-256 和允许的
`asset_base_url`。所有路径必须为 ASCII URL key；中文原始文件名只留在 source 层和来源字段。

### 6.2 发布清单硬门禁

- 所有路径必须位于 `src/assets` 的已登记活动源；拒绝 `..`、绝对路径和符号链接越界。
- 拒绝 `*-chroma.*`、独立帧、Aseprite、报告、预览、`旧素材/` 和未登记文件。
- 拒绝同 key 不同内容、同 logical ID 多文件、缺失 MIME、SHA-256 或 fallback。
- 复制到干净 staging；不能从可能含陈旧文件的 `dist/assets` 反推发布集。
- 生成后逐文件复算哈希；发布脚本只接受这份 manifest，不接受目录通配上传。

## 7. R2 目标架构

### 7.0 单桶硬约束

- 只配置一个项目桶、一个生产素材自定义域名、一份公开读取 CORS 和一个桶级最小权限上传入口。
- 核心 release、GAL pool、频道指针与未来 BGM 只按对象 key 前缀隔离，不按素材类型拆桶。
- 发布、校验、回滚和清理工具必须显式接受唯一桶名；任何“为 GAL／音频另建桶”的路径都视为
  规划偏离并拒绝执行。
- 首版桶为公开匿名只读，因此桶内只能放允许公开分发的运行素材。成人内容 UI 开关只控制显示，
  **不是访问控制**。若未来确需私有读取，仍保留单桶，但必须关闭直接公开读取并让全部对象统一经
  过经过安全评审的 Worker；不能在同一公开桶中伪造对象级私密性。

### 7.1 对象 key

建议固定前缀：

```text
gensokyo-moving-garden/
  releases/<release-id>/manifest.json
  releases/<release-id>/maps/...
  releases/<release-id>/ui/...
  releases/<release-id>/world/...
  releases/<release-id>/characters/...
  releases/<release-id>/battle/...
  releases/<release-id>/audio/...
  gal-pools/<gal-pool-release-id>/manifest.json
  gal-pools/<gal-pool-release-id>/characters/...
  channels/stable.json
  channels/gal-stable.json
```

- `<release-id>` 使用 ASCII、不可变，例如 `0.2.0-r55-a1b2c3d4`。
- 角色卡运行时固定到 `releases/<release-id>/manifest.json`，不追随 `stable.json`。
- `channels/stable.json` 仅供发布工具／人工查看；不得让已发出的卡在无人确认时自动换素材。
- 新版本创建新前缀；**永不原地覆盖 release key**。Cloudflare 缓存下覆盖或删除同 key 仍可能继续
  返回旧内容，因此不可变 key 是回滚和一致性的基础。
- `releases/` 与 `gal-pools/` 共用同一个桶，但使用不同 manifest schema 和发布流水线；任一流水线
  都不得扫描或覆盖另一前缀。

### 7.2 访问方式

- 开发／预发布可短期使用 `r2.dev` 检查对象，但生产必须绑定 Cloudflare 自定义域名。
- 生产建议形如 `https://<asset-domain>/gensokyo-moving-garden/releases/...`，实际域名由所有者
  在部署前提供。
- 唯一 R2 桶只存公开、已批准的运行素材；不承担身份、授权或玩家数据。
- 客户端只有匿名读权限。上传使用桶级最小权限令牌，由发布工具从秘密配置读取，绝不进入 Git、
  角色卡、命令输出或聊天。

Cloudflare 官方说明：`r2.dev` 面向非生产且受限流；自定义域名才能使用 Cloudflare Cache、
WAF 等生产能力。参见：
[Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)、
[R2 与 Cloudflare Cache](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)。

### 7.3 CORS

由于 SillyTavern 可能运行在 localhost、桌面壳或不同私有域名，首版远程素材采用：

- 匿名 `GET`／`HEAD`；
- `Access-Control-Allow-Origin: *`；
- 不允许凭据，不发送 Cookie；
- 允许请求头 `Range`；
- 暴露 `Content-Length`、`Content-Range`、`ETag`；
- 预检缓存建议 7200–86400 秒，以浏览器实际上限为准。

通配 Origin 只能用于不携带凭据的公开素材。若以后改为 Cookie 或受保护资源，必须单独评审 CORS，
不能把 `*` 与凭据混用。R2 CORS 的官方字段与方法见
[R2 CORS API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/cors/)。

### 7.4 缓存与响应元数据

| 路径 | 建议策略 |
|---|---|
| `releases/<release-id>/**` | `Cache-Control: public, max-age=31536000, immutable` |
| `channels/stable.json` | `Cache-Control: no-cache` 或很短 TTL |
| 错误响应 | 不依赖缓存 404 作为发布检测；上传完成后再切任何指针 |

- 每个对象设置正确 `Content-Type`：PNG、SVG、GIF、WAV／未来音频和 JSON 不可混淆。
- 自定义域名启用覆盖全部 release 媒体的 Cache Rule；JSON 是否缓存需显式决定。
- 可启用 Smart Tiered Cache；不是首轮功能正确性的前置。
- 发布顺序为“上传全部不可变对象 → 远端逐项校验 → 上传不可变 manifest → 最后更新人工
  channel 指针”。不得先暴露指针再慢慢补文件。

Cloudflare 文档明确提醒：缓存域名下删除、覆盖对象或先产生 404 后再上传，旧响应可能持续到 TTL
或清除缓存。因此本项目不覆盖 release key。参见
[R2 consistency model](https://developers.cloudflare.com/r2/reference/consistency/)。

### 7.5 浏览器本地缓存优先级

客户端采用两层缓存，但不把缓存状态写进 MVU、世界书或聊天变量：

1. **默认：浏览器 HTTP 磁盘缓存。** 所有不可变 release URL 由浏览器自然复用；图片、Canvas、
   CSS 背景与音频继续使用原 URL，不额外复制当前 52.42 MiB release，也不需要 Service Worker。
2. **可选：版本化 Cache Storage 离线包。** 仅由设置页显式开启；缓存名使用
   `gg-runtime-assets:<release-id>`。启用前通过 `navigator.storage.estimate()` 检查配额，能力或空间
   不足时继续使用 HTTP 缓存，不影响游玩。

离线包约束：

- 不使用约 10 MiB 上限的 `localStorage` 保存二进制素材；`localStorage` 只保留小型用户偏好。
- 全量离线包要求估算剩余空间至少达到 manifest 总字节的 1.25 倍；当前 52.42 MiB release 至少
  预留约 65.53 MiB。
- 默认只保留当前 release。升级时先缓存并验证新 release 的最低可玩集，再删除旧离线包；只有配额
  明确足够时才短暂同时保留两版；按当前体积，两版原始对象约 104.84 MiB，建议至少预留约
  131.05 MiB 后才执行双版本切换。
- `navigator.storage.persist()` 只能由设置页的明确用户操作触发，不能在开场自动请求或阻塞进入。
- Cache Storage 与 SillyTavern 宿主共享 origin 配额，所有 key 必须使用 `gg-runtime-assets:` 命名空间；
  不注册可能影响宿主路径的 Service Worker。首版若未实现可信 URL→Response／Blob resolver，保持
  HTTP 缓存，不做一份“写入了但运行时不会读取”的伪离线缓存。
- 写入离线包前校验 release ID、HTTPS origin、MIME、字节上限和 manifest 哈希；捕获
  `QuotaExceededError`。缓存清理只删除本项目命名空间，不触碰宿主或其他卡的存储。
- iframe 销毁时统一取消 fetch、释放临时对象 URL 和监听；HTTP／Cache Storage 的磁盘数据按版本
  保留，不随聊天刷新重复创建。

## 8. 运行时双模式

构建时生成可信配置：

```ts
type AssetDeliveryConfig =
  | { mode: 'embedded' }
  | {
      mode: 'remote-r2';
      baseUrl: string;
      releaseId: string;
      manifestSha256: string;
    };
```

- `embedded` 继续是开发、离线检查点和网络故障排查基线。
- `remote-r2` 只接受构建时写死的 HTTPS 基址、release ID 和 manifest 哈希。
- UI 不解析任意查询参数来换域名，不从 localStorage、模型或玩家输入覆盖基址。
- 远程模式不把全部 URL 写成一长串 dataset；应由可信 manifest resolver 按 logical ID 生成 URL，
  但保留现有图片注册表和 fallback 语义。
- 启动时 manifest 失败或哈希／结构不符，显示“远程素材不可用”的可恢复诊断；不得执行未知 URL。

### 8.1 优先队列与最低可玩集

发布 manifest 后续增加调度元数据，避免在 UI 代码里维护第二份素材名单：

```json
{
  "logical_id": "characters.reimu.sequence",
  "priority_class": "entry-contextual",
  "bundle": "map-character:reimu",
  "trigger": "character-present",
  "entry_gate": true
}
```

运行时只有一个可复用、可取消、幂等的调度器；`start()` 不得重复请求成功项，`ensure(logicalId)`
负责按用户意图提升单项或场景包。建议队列如下：

| 顺序 | 队列 | 内容 | 是否阻塞进入 |
|---:|---|---|---|
| 0 | `bootstrap` | 内嵌开场主视觉、HTML/CSS/JS、加载 UI | 无网络请求 |
| 1 | `entry-critical` | 地图、导航蒙版、三张主入口按钮 | 是，只等成功或明确 fallback |
| 2 | `entry-contextual` | 当前 `character_views` 在场角色的 idle + 首选动作源；当前可见设施形态 | 是，只等当前状态需要的项 |
| 3 | `garden-background` | 其余角色小人、设施地图形态、主屋／温室详情 | 否，进入后静默 |
| 4 | `scene-demand` | 即将打开的商店、设施详情、指定副本／对手战斗包及关键 SFX | 否；触发时抢占低队列 |
| 5 | `gal-background` | GAL 舞台背景及未触发的近景卡池 | 否，始终最低 |

关键调度规则：

- “其他素材完成后再加载 GAL”按所有者要求解释为：固定 release 中 103 个非 GAL 对象全部成功
  或进入明确 fallback 后，才启动 GAL 后台队列。当前非 GAL 总量约 28.25 MiB，玩家只等待最低
  可玩集，剩余非 GAL 在庭园内继续静默加载；若玩家提前触发具体 GAL，则只允许该命中图及直接
  fallback 链提升为 `scene-demand`。
- 默认并发桌面为 4；GAL 后台最多占 1 个槽，始终给用户触发的 `scene-demand` 保留抢占空间。
  `saveData`、慢速网络或窄带环境降为总并发 2、GAL 并发 1；页面隐藏时暂停启动新的低优先任务。
- 已经发出的低优先请求通常不强制中断，以免浪费已传输字节；调度器只停止派发新的低优先项。
- 进入加载层只展示 `entry-critical + entry-contextual` 的进度，不用全量 114 项稀释百分比。
  设置页可另行显示全量缓存／下载进度与清理入口。
- 每项最多自动尝试 3 次，采用短退避；成功项不重试。三次耗尽后进入对应 fallback，用户触发不会
  无限重置自动重试预算，可提供显式“重试该素材”。
- 入口门设置总超时（建议 15 秒）；超时项进入可诊断 fallback 后放行，绝不因网络问题锁死继承、
  存档、地图操作或消息事务。

场景包进一步拆分，避免“游戏素材”成为另一个全量门：

- 地图角色只加载当前在场角色；初始状态通常优先灵梦、魔理沙，后来访角色在到场事件前提升。
- 设施地图只加载当前形态；施工、换型、损坏结算前提升目标形态与降级图。
- 战斗公共包仅含自机、弹幕、妖精、通用特效和关键 SFX；Boss sheet 与 S0/S1/S2 仅按当前对手加载。
- 指针悬停、触摸按下、确认弹窗打开都可作为预取意图，但正式点击仍必须允许 fallback 进入。

### 8.2 GAL 滚动卡池扩展与按需抢占

核心 UI、地图、战斗和基础 fallback 继续固定到角色卡的 `releaseId`。GAL 近景允许在**同一个 R2
桶**内使用 `channels/gal-stable.json` 与 `gal-pools/<gal-pool-release-id>/` 滚动前缀，使已有
`pose_id` 卡池增删图片或调整权重时不必重新打包角色卡。

GAL 运行时遵守以下附加规则：

- 未进入 GAL 时，卡池只以单并发、最低优先级静默加载；不得占满调度器或推迟地图／战斗需求。
- 玩家触发角色 GAL 时，先解析本轮实际需要的 `characterId + visualMode + reactionId + poseId`，只把
  命中的近景和直接 fallback 链提升为 `scene-demand`，而不是提升该角色整个卡池。
- 命中图未就绪时立即显示角色小人 idle 或已登记的通用占位，并在 GAL 局部显示加载状态；庭园、
  消息发送、状态结算和其他操作保持可用。图片完成后只替换当前仍匹配同一 scene signature 的画面，
  防止迟到响应覆盖玩家已经切换的角色／表情。
- 若具体图三次失败，沿注册表 fallback 链降级；失败不清空整池、不重复创建消息、不改变 GAL 语义。

- 频道只指向一个已上传、已验证的不可变 `gal-pool` release manifest；不得直接列目录或接受模型 URL。
- 客户端校验频道 schema、manifest SHA-256 和兼容版本，并保存 last-known-good；因此可变频道不是唯一事实源。
- 更新字段结构、姿势语义、白名单、抽卡算法或客户端 schema 仍必须重新构建和打包。
- 首版抽卡在客户端按楼层身份使用稳定种子完成；单纯随机选图不新增服务器。私有访问、服务端鉴权或
  服务端动态权重才使用绑定 R2 的 Cloudflare Worker。
- 完整变量、注册表、fallback、对象结构和验收合同见
  `project/gal-portrait-variable-and-r2-pool-plan.md`。

## 9. 分阶段实施

### A. 音频维护源与登记

**2026-07-31 进度：已完成。** 26 个文件已原字节复制，来源说明与活动 manifest 已建立；
原 `音效/` 未删除。

1. 把 26 个 WAV 原字节复制到 `src/assets/audio/source/battle-ai-regenerated-v1/`。
2. 补 `provenance.md`，逐文件记录原名、SHA-256、声明和是否允许改作／再分发。
3. 在 `asset-manifest.json` 新增 `audio_assets.battle_sfx`，source 与 runtime 分开登记。
4. 不删除当前 `音效/`，直到哈希核对和所有者确认迁移完整；之后是否归档另行授权。

验收：26/26 字节哈希一致；JSON 可解析；无文件进入运行清单。

### B. 14 个运行音效制作

**2026-07-31 进度：工程侧已完成，听感验收待所有者。** 当前 14 个文件是候选源的直接字节复制，
未做裁切、归一化、重采样或重编码；逐文件 SHA-256 与总量已由测试校验。单项语义与高频混音仍须试听。

1. 按 §4.2 制作稳定英文名 WAV。
2. 输出机器可读处理报告，记录源哈希、输出哈希、时长和音频参数。
3. 完成单文件试听和高频混音试听；不合格的 `battle_lose` 等事件补专用生成素材。

验收：14/14 存在、无削波／爆点、总量合规、映射完整。

### C. 真总线与设置

**2026-07-31 进度：已完成本地实现与离线门禁，待真实宿主验收。** Preview 使用本地 WAV，
自包含 mount 使用 WAV data URL；设置页与战斗 HUD 已接线。

1. 实现真实 `BattleSoundBus`、解码缓存、节流、主增益、静音与销毁。
2. 在设置与战斗 HUD 增加音效开关；只保存本地偏好。
3. 扩展战斗测试：事件映射、节流、缺文件静默、暂停／销毁、`nullSoundBus` fallback。

验收：定步长结果与无声基线完全一致；离线 Preview 可试听；控制台无未处理异常。

### D. 发布清单与干净 staging

**2026-08-01 进度：已完成。** 已新增 manifest 驱动的运行素材收敛器、
不可覆盖的干净 staging 生成器、逐文件 MIME／字节／SHA-256／缓存元数据、路径与维护稿排除门禁、
公开匿名读取 CORS 模板及专项测试。当前固定 release 收敛并上传 114 个运行文件；`remote-r2`
预览与运行挂载均读取同一 manifest 坐标，默认 `embedded` 行为未改变。

1. 扩展 `asset-manifest.json` 的 delivery 元数据。
2. 实现 release manifest 生成器和路径／哈希／MIME 门禁。
3. 让 `build:ui` 明确区分 `embedded` 与未来 `remote-r2`，现有命令默认行为不暗改。
4. 新增资产专项检查，证明 staging 不含历史／维护素材。
5. 在不改变现有发布文件集合的前提下，为 release manifest 补 `priority_class`、`bundle`、
   `trigger`、`entry_gate`；生成器校验每项恰好属于一个调度层，并拒绝 GAL 或全量战斗包进入开场门。
6. 在部署配置中固化 `bucket_scope: single-project`；未来上传工具只接受一次显式 `--bucket`，核心
   release、GAL pool、频道与 BGM 子流程必须复用该目标，并按允许前缀拒绝越界 key。

验收：干净环境与脏 `dist` 生成同一清单哈希。

### E. R2 预发布

**2026-08-01 进度：`r2.dev` 预发布、生产自定义域名绑定与新域名固定 release 均已完成。**

1. 发布工具先 `--dry-run`，显示拟上传 key、字节和总量，不打印秘密。
2. 上传到新的不可变 release 前缀。
3. 逐项 HEAD 校验状态、MIME、长度和缓存头；抽样 GET 后本地复算 SHA-256。
4. 从模拟 SillyTavern Origin 验证 CORS、Range、图片与 WebAudio 解码。
5. 列出唯一桶的目标前缀并证明本次发布没有写入 manifest 之外的对象，也没有创建或使用第二个桶。

验收：不得以“桶里看得到文件”代替清单一致性和浏览器验收。

### F. 双模式候选与真实 SillyTavern

1. 同一维护源构建 embedded 候选和 remote-r2 候选。
2. 桌面、窄屏、200% 缩放、页面隐藏恢复、断网、慢网、单文件 404、错误 MIME、CORS 拒绝矩阵。
3. 检查地图、角色、设施、GAL、弹幕所有素材；音效检查首次手势解锁、静音、音量和高频压力。
4. 主线／副本结算、取消不结算和原生聊天恢复不得回归。
5. 记录队列证据：开场只等待最低可玩集；GAL 单并发不抢占；触发具体 GAL／Boss／设施时目标包
   提升；迟到响应不覆盖新 scene；三次失败和 15 秒入口超时均安全降级。
6. 验证 HTTP 缓存命中、缓存清除后重取、Cache Storage 不可用／配额不足、显式离线包更新与
   命名空间清理；不要求自动获得 persistent storage。

验收：真实 SillyTavern 未通过前只能称 release candidate。

### G. 上线与回滚

1. 每张发行卡固定一个已验证的 R2 release ID。
2. 上线只更新新卡的构建配置和人工 channel 指针，不覆盖旧对象。
3. 回滚优先重新指向上一个已验证 release／分发上一候选；不删除当前对象、不紧急覆盖同 key。
4. 至少保留最近两个已发行 release；清理旧对象必须有独立清单、保留期和显式删除授权。
5. 单桶清理只能按已归档 manifest 删除完整旧前缀；不得使用桶级通配删除，也不得因清理核心
   release 触碰 `gal-pools/` 或 `channels/`。

## 10. 验收矩阵

## 9.1 上传前实现结果（2026-08-01）

本地 A–F 代码骨架、v2 调度清单、优先队列、入口门、场景抢占、GAL 门控、可信 resolver、HTTP cache 复用和可测试的显式离线缓存服务均已落地。唯一桶 `hxxwy` 已应用公开读取 CORS，并发布 release `0.2.0-r55-bbc0e074f993`：114 个素材对象共 `54,968,893` bytes，最后发布 manifest 后共 115 个对象、`55,050,924` bytes；manifest SHA-256 为 `75c797954353be3d5272a7649c9e6491b151aae43743ebd8406165724a83c08e`。浏览器验证入口 16/16、总计 114/114、失败 0、控制台无 warning/error。生产自定义域名 `ssrfrrt.ccwu.cc` 已绑定并通过 ownership／SSL、公开 manifest、Range 与 CORS 验证；随后从干净提交 `1ef0d7d6cbab` 发布不可覆盖 release `0.2.0-r55-1ef0d7d6cbab`，114 个素材共 `54,968,864` bytes、远端 115 对象，manifest 声明 SHA-256 为 `c44ff80e99c51f63fb61092bfeff9e0fd0e2ee467ae614437a66615bc45c2b29`。标准测试 191/191、远端专项 8/8、远端对象元数据、公开 manifest 整文件一致性与代表性 Range/CORS 均通过；生产浏览器普通预加载为入口 16/16、总调度 114/114、失败 0且控制台无 warning/error，但后续弹幕复现发现 atlas 因先非 CORS 预加载、后 anonymous CORS 重载的缓存模式冲突而失败并走几何回退。离线包设置 UI、atlas 修复和真实 SillyTavern 验收仍未完成。

仓库内发布器继续只提供单桶 dry-run 计划，不持有秘密或 live 分支；首轮实际上传由受控外部 S3 客户端严格按已审查 manifest 执行，并坚持“素材先传、manifest 最后传”。后续发布仍必须先从干净提交生成新的不可覆盖 staging，再显式传入唯一 bucket，禁止复用或覆盖当前 release 前缀。

| 层 | 必须证明 |
|---|---|
| 来源 | 来源声明、26 个输入哈希、14 个派生链 |
| 音频 | 格式／时长／峰值、事件覆盖、高频压力、静音与音量 |
| manifest | 活动白名单、路径收敛、MIME、字节、SHA-256、总量 |
| 本地构建 | `check:ui`、`npm test`、`build:ui`、自包含 embedded 仍通过 |
| R2 | dry-run、不可变前缀、远端长度／哈希抽检、缓存头、CORS／Range |
| 调度 | 最低可玩集门控、状态驱动角色／设施、场景包抢占、GAL 单并发、三次重试与入口超时 |
| 本地缓存 | HTTP cache 命中、配额探测、离线包显式开启、版本升级、仅清理项目命名空间 |
| 运行时 | Canvas 匿名跨域与蒙版像素读取、图片 fallback、音效静默失败、无未知 URL、无结算变化 |
| 真实宿主 | SillyTavern 导入、新聊天、桌面／移动端、断网／慢网、控制台 |
| 发布 | 固定 release ID、产物哈希、未覆盖旧版、回滚目标存在 |

## 11. 实施前需要所有者确认

开始 A–C（本地音效接入）前：

- 确认现有 26 个 WAV 可修改并随项目再分发；
- 试听后确认 14 个事件的最终选材，尤其 `bomb`、`battle_win`、`battle_lose`。

继续 F–G（生产域名与真实发行）前：

- 修复战斗预加载／atlas 的 CORS 缓存模式冲突，发布新 release 后完成真实 SillyTavern 候选验收；
- 真实 SillyTavern 候选和正式发行授权。
