# R49 占位素材规格与接入清单

> 2026-07-31 音效接入更新：下列图片状态与当前源码、manifest 和构建链一致。必需图片项均已完成；
> `音效/web-sfx/` 的 26 个 AI 重生成 WAV 已归档到 `src/assets`，14 个运行事件文件已登记
> SHA-256 并接入 WebAudio 真总线、设置与战斗 HUD；预览使用本地 WAV，自包含构建使用 WAV data URL。
> 完整入库、事件映射与未来 Cloudflare R2 发布方案见
> `project/asset-delivery-and-r2-plan.md`。第 1.4 节主题背景贴图继续保持可选。

> 2026-07-30 更新：温室花妖核心 S0／S1／S2 与妖精小怪 sprite 已由内置 ImageGen 生成并接入。
> 花妖三阶段保留同一设计与构图，分别为完好、轻损、重损，运行时路径为
> `src/assets/battle/portraits/portrait-flower-core-s{0|1|2}-v1.png`。妖精采用蓝色小 P／金色大 P
> 两种配色与各两帧翅膀动画；维护底稿为 `fairy-sheet-v1-chroma.png`，运行时透明图为
> `fairy-sheet-v1.png`（128×128、2×2、64px 单元）。manifest、构建复制／data URL、宿主 dataset、
> atlas 与 renderer 均已接线，几何妖精只保留作加载失败 fallback。至此本表的必需战斗图片素材
> 已全部补齐；音效也已本地接入，仅可选主题背景和真实 SillyTavern 验收继续挂账。

> 2026-07-26。所有者裁定：人物图像与音效**先用占位**，由所有者后续寻找素材填入。
> 本文档是唯一的占位登记表：每一项占位现在长什么样、真素材要满足什么规格、
> 拿到素材后改哪里。填入素材时逐项勾销。
>
> 通用红线：不得使用原作游戏抽出数据（etama/WAV 等），素材授权必须允许再分发
> （角色卡会打包分发）；来源与授权逐项报所有者确认后才接入。

## 1. 图像占位

### 1.1 Boss 立绘 cut-in（八名角色直导 + 温室花妖核心生成稿，全部已接入）

- **现状**：灵梦、魔理沙、爱丽丝、琪露诺、米斯蒂娅、荷取、萃香与咲夜的 S0／S1／S2 完整图片
  已于 2026-07-30 按直接导入合同接入；
  `battle-renderer.ts` 的 `drawBossCutIn` 按战损档位选择对应图片；温室花妖核心三阶段亦已接入。
  加载失败时仍保留样式化 fallback 卡，但不再把它登记为待补素材。
- **需求**：每 boss 一组 3 张战损差分半身立绘。所有者交付什么背景／透明通道就按原文件
  **直接导入**，不抠图、不去背、不补透明背景、不做色键转换，也不清理隐藏 RGB。
  - 推荐构图：3:4 竖向半身立绘；同组三张尽量保持相同画布和人物位置。推荐项只用于提示，
    不构成导入前的裁切、缩放或改图要求。
  - 战损分级（硬约束，不得放宽）：S0 完好 → S1 轻损（饰品脱落/衣角撕裂/灰尘）→
    S2 重损（袖口裙摆破口/发型散乱/狼狈表情）。**不做裸露、内衣特写、性暗示构图。**
  - 不要求导入前量化压缩；体积仅在构建门禁中记录和评估，不得为了压缩而改写所有者原图。
- **命名**：`src/assets/battle/portraits/portrait-<boss_id>-s<0|1|2>-v1.png`
  （八名角色与 `flower_core` 均已接入）。
- **直接导入合同**：
  1. 将 S0／S1／S2 原文件逐字节复制到上述稳定路径；除为满足稳定命名而改文件名外，不生成
     alpha/chroma 中间稿，不合并 sheet，不重新编码图片。
  2. `asset-manifest.json` 分别登记三张完整图片；`build-ui.mjs` 直接读取原文件生成 data URL，
     `ui-host-shell.js` dataset 原样转交。
  3. `drawBossCutIn` 按当前状态直接绘制对应完整图片，并以 `contain` 语义适配 cut-in 区域；
     不依赖透明背景，不裁掉图片自带背景。徽章／名牌可叠加，水印删除。
  4. 验收只检查 S0／S1／S2 映射、图片可解码、原文件哈希与构建输入一致、各视口完整可见；
     不新增透明边、alpha、隐藏 RGB、色键或背景清除门禁。
- **灵梦接入记录（2026-07-30）**：
  - 原文件：`D:\浏览器下载\灵梦\S0.png`／`S1.png`／`S2.png`。
  - 稳定路径：`src/assets/battle/portraits/portrait-reimu-s{0|1|2}-v1.png`。
  - 已完成 manifest、构建复制／data URL、宿主 dataset、atlas source 与 renderer 状态选择接线。
  - 遵照所有者禁令，没有解码、预览、截图或目视读取三张图片；因此图片内容、构图和实际显示效果
    未作视觉验收，真实 SillyTavern 验收继续挂账。
- **魔理沙接入记录（2026-07-30）**：
  - 原文件：`D:\浏览器下载\魔理沙\S0.png`／`S1.png`／`S2.png`。
  - 稳定路径：`src/assets/battle/portraits/portrait-marisa-s{0|1|2}-v1.png`。
  - 已完成 manifest、构建复制／data URL、宿主 dataset、atlas source 与 renderer 状态选择接线。
  - 遵照所有者禁令，没有解码、预览、截图或目视读取三张图片；因此图片内容、构图和实际显示效果
    未作视觉验收，真实 SillyTavern 验收继续挂账。
- **爱丽丝接入记录（2026-07-30）**：
  - 原文件：`D:\浏览器下载\爱丽丝\S0.png`／`S1.png`／`S2.png`。
  - 稳定路径：`src/assets/battle/portraits/portrait-alice-s{0|1|2}-v1.png`。
  - 已完成 manifest、构建复制／data URL、宿主 dataset、atlas source 与 renderer 状态选择接线。
  - 遵照所有者禁令，没有解码、预览、截图或目视读取三张图片；因此图片内容、构图和实际显示效果
    未作视觉验收，真实 SillyTavern 验收继续挂账。
- **琪露诺接入记录（2026-07-30）**：
  - 原文件：`D:\浏览器下载\琪露诺\S0.png`／`S1.png`／`S2.png`。
  - 稳定路径：`src/assets/battle/portraits/portrait-cirno-s{0|1|2}-v1.png`。
  - 已完成 manifest、构建复制／data URL、宿主 dataset、atlas source 与 renderer 状态选择接线。
  - 遵照所有者禁令，没有解码、预览、截图或目视读取三张图片；因此图片内容、构图和实际显示效果
    未作视觉验收，真实 SillyTavern 验收继续挂账。
- **米斯蒂娅接入记录（2026-07-30）**：
  - 原文件：`D:\浏览器下载\米斯蒂娅\S0.png`／`S1.png`／`S2.png`。
  - 稳定路径：`src/assets/battle/portraits/portrait-mystia-s{0|1|2}-v1.png`。
  - 已完成 manifest、构建复制／data URL、宿主 dataset、atlas source 与 renderer 状态选择接线。
  - 遵照所有者禁令，没有解码、预览、截图或目视读取三张图片；因此图片内容、构图和实际显示效果
    未作视觉验收，真实 SillyTavern 验收继续挂账。
- **河城荷取接入记录（2026-07-30）**：
  - 原文件：`D:\浏览器下载\河城荷取\S0.png`／`S1.png`／`S2.png`。
  - 稳定路径：`src/assets/battle/portraits/portrait-nitori-s{0|1|2}-v1.png`。
  - 已完成 manifest、构建复制／data URL、宿主 dataset、atlas source 与 renderer 状态选择接线。
  - 遵照所有者禁令，没有解码、预览、截图或目视读取三张图片；因此图片内容、构图和实际显示效果
    未作视觉验收，真实 SillyTavern 验收继续挂账。
- **伊吹萃香接入记录（2026-07-30）**：
  - 原文件：`D:\浏览器下载\伊吹萃香\S0.png`／`S1.png`／`S2.png`。
  - 稳定路径：`src/assets/battle/portraits/portrait-suika-s{0|1|2}-v1.png`。
  - 已完成 manifest、构建复制／data URL、宿主 dataset、atlas source 与 renderer 状态选择接线。
  - 沿用同批素材的封存直导规则，没有解码、预览、截图或目视读取三张图片；因此图片内容、构图
    和实际显示效果未作视觉验收，真实 SillyTavern 验收继续挂账。
- **十六夜咲夜接入记录（2026-07-30）**：
  - 原文件：`D:\浏览器下载\十六夜咲夜\S0.png`／`S1.png`／`S2.png`。
  - 稳定路径：`src/assets/battle/portraits/portrait-sakuya-s{0|1|2}-v1.png`。
  - 已完成 manifest、构建复制／data URL、宿主 dataset、atlas source 与 renderer 状态选择接线。
  - 沿用同批素材的封存直导规则，没有解码、预览、截图或目视读取三张图片；因此图片内容、构图
    和实际显示效果未作视觉验收，真实 SillyTavern 验收继续挂账。

### 1.2 八角色 boss 战斗形象（✅ 2026-07-30 已全部接入，待真实 SillyTavern 验收）

- **现状**：所有者先后提供琪露诺、爱丽丝、咲夜及灵梦、魔理沙、荷取、米斯蒂娅、萃香共八张
  `1254×1254` 四状态图；均已转为透明底，按 `presentation.boss_id` 选择独立图集，
  加载失败仍回退温室妖花 sheet。
- **已满足规格**：每 boss 一张 2×2 网格 sheet，四格依次为待机／施法／受击／击破；
  透明版命名为 `src/assets/battle/boss/<boss_id>-battle-sheet-v1.png`，chroma 版仅作维护源。
- **已接入链**：asset manifest → atlas 四宫格与 per-boss sheet → build data URL →
  host dataset → app atlas source → renderer `boss_id` 选择；缺省回退妖花。
- **离线验收**：灵梦、魔理沙、荷取、米斯蒂娅、萃香已通过对战卡逐场到场与暂停态目视，
  均显示对应人物且无黑底方块；琪露诺已有本地到场记录。五套新增源图的处理报告及浏览器证据
  分别位于 `project/character-boss-sheet-preparation-report.json` 与 `project/runtime-qa/`。
- **灵梦／魔理沙 v2 替换**：2026-07-30 后续提供的两张新版已覆盖稳定运行路径，旧 v1 源档保留；
  新版归档、哈希报告、透明预览和实显证据分别位于 `旧素材/素材处理/battle-boss-owner-source-v2/`、
  `project/character-boss-sheet-replacement-report-2026-07-30.json`、
  `project/character-boss-sheet-replacement-preview.png` 与 `project/runtime-qa/boss-{reimu,marisa}-v2-paused.png`。
- **剩余验收**：真实 SillyTavern 中复核八角色逐场、受击、阶段切换、击破、宿主缩放与移动端显示。

### 1.3 妖精小怪 sprite（已接入，几何图形仅作 fallback）

- **完成**：一张小 sheet：2 配色变体（蓝=掉小P / 金=掉大P）× 2 帧翅膀，64px 网格，
  透明底，运行时文件 10KB。
- **命名**：`src/assets/battle/effects/fairy-sheet-v1.png`（或独立文件）。
- **接入**：atlas 登记透明 sheet；`drawFairy` 按掉落类型与时间选择 2×2 源格，atlas 优先、
  几何 fallback 保留。

### 1.4 主题背景（当前=程序化，可选替换）

程序化背景（湖夜/森林/红魔夜空/温室）已可用，**非必填**。若想用手绘背景：
480×640 或 960×1280 JPG/PNG，暗调（亮度需压在弹幕之下），每张 ≤200KB，
命名 `src/assets/battle/backgrounds/bg-<boss_id>-v1.png`，接入点
`drawThemedBackground`（图为底、程序化粒子保留叠加）。

## 2. 音效占位

- **现状**：`src/battle/battle-sound.ts` 已实现应用级 WebAudio 真总线，`nullSoundBus` 仅作
  无源或加载失败 fallback。模拟层已在
  所有出声点发出类型化事件；模拟层的声音出口仍只需保持
  `battle-engine.ts` 的 `sfx` 单一接线点。完整接入还包括运行素材登记、构建传递、
  WebAudio 解码缓存、设置开关、节流、生命周期和测试，不得把“单一接线点”误解为只改一行。
- **已入库素材**：`音效/web-sfx/` 的 26 个 WAV 已原字节归档，全部为单声道 22050Hz，
  其中 20 个 8-bit、6 个 16-bit，时长 50–4990ms，总计 660,862 bytes。
  它们是 source 候选，不得把 26 个文件不经筛选全部加入运行包。
- **真总线要求**：本地 data URL（build 内嵌，不得远程加载）；WebAudio 解码缓存；
  fire-and-forget 不阻塞定步长循环；提供静音开关；高频事件（`player_shot`/
  `boss_hit`/`graze`）节流 ≥60ms 或降增益混音。
- **当前接入格式决策**：首版从候选源裁切／归一化后使用 WAV，保留原 22050Hz 单声道，
  不做无收益的 44.1kHz 上采样；全套 runtime SFX 仍应 ≤1.5MB。若后续包体仍需缩减，
  再以有明确工具链和浏览器矩阵的 OGG／M4A 双格式替换。
- **远程发布边界**：本节仍描述当前 `embedded` 合同。未来上线 R2 前，必须按
  `asset-delivery-and-r2-plan.md` 建立固定版本清单、CORS／缓存／回滚，并明确修订当前
  弹幕协议的“禁止远程运行依赖”约束。

| 事件 ID | 触发点 | 素材要求（时长/质感） | 优先级 |
|---|---|---|---|
| `player_shot` | 自机每次开火 | ≤80ms 轻快"哒"，音量低（高频，需节流） | 中 |
| `boss_hit` | 自机弹命中 boss | ≤100ms 闷击/嗒（高频，需节流） | 中 |
| `mob_defeat` | 妖精击破 | 150–250ms 清脆爆裂/泡破 | 高 |
| `graze` | 擦弹（含激光每 tick） | ≤80ms 金属擦音"叮"，辨识度高 | 高 |
| `item_pickup` | 吃到 P 点 | ≤120ms 上扬收集音 | 高 |
| `player_miss` | 被弹失去残机 | 300–500ms 低沉爆炸 | 高 |
| `bomb` | 释放 Bomb | 500–900ms 咒符引爆+余韵 | 高 |
| `wave_start` | 妖精波段开始 | 200–400ms 轻提示铃 | 低 |
| `spell_declare` | boss 到场/符卡宣言 | 400–700ms 宣言音（镜破/铃振感） | 高 |
| `phase_break` | 阶段击破 | 300–600ms 爆裂+消弹扫荡感 | 高 |
| `laser_warning` | 激光预警出现 | 300–600ms 充能上升音 | 中 |
| `laser_fire` | 激光实体化 | 200–400ms 光束发射 | 中 |
| `battle_win` | 胜利结算 | 1–2s 短胜利乐句 | 中 |
| `battle_lose` | 战败结算 | 1–2s 低落短乐句 | 中 |

BGM 不在本表（优先完成 SFX；若做 BGM 另立循环、淡入淡出、页面隐藏与授权规格）。

## 3. 填入流程（给所有者）

1. 图像继续按对应小节的直接导入／生成合同处理。
2. 音频按 `asset-delivery-and-r2-plan.md` 的 A–C 阶段执行：先保存 26 个 source 原字节与哈希，
   再派生 14 个稳定事件文件，最后接 WebAudio 真总线。
3. agent 核对授权与再分发范围 → 更新 `asset-manifest.json` → 跑
   `check:ui` / `npm test` / `build:ui` + 产物自包含检查。
4. 每接入一项，在本文档对应条目标记 ✅ 与日期；真实 SillyTavern 的声音解锁、混音、
   页面隐藏和移动端仍须单独验收。
