# R49 占位素材规格与接入清单

> 2026-07-26。所有者裁定：人物图像与音效**先用占位**，由所有者后续寻找素材填入。
> 本文档是唯一的占位登记表：每一项占位现在长什么样、真素材要满足什么规格、
> 拿到素材后改哪里。填入素材时逐项勾销。
>
> 通用红线：不得使用原作游戏抽出数据（etama/WAV 等），素材授权必须允许再分发
> （角色卡会打包分发）；来源与授权逐项报所有者确认后才接入。

## 1. 图像占位

### 1.1 Boss 立绘 cut-in（当前=程序化占位卡）

- **现状**：`battle-renderer.ts` `drawBossCutIn` 画样式化卡片（战损徽章 S0/S1/S2、
  裂纹线、星纹、"立绘占位 · 素材待换"水印）。
- **需求**：每 boss 一组 3 张战损差分半身立绘，透明底 PNG。
  - 尺寸：384×512（3:4），同组三张构图一致只改衣装/表情层。
  - 战损分级（硬约束，不得放宽）：S0 完好 → S1 轻损（饰品脱落/衣角撕裂/灰尘）→
    S2 重损（袖口裙摆破口/发型散乱/狼狈表情）。**不做裸露、内衣特写、性暗示构图。**
  - 体积：量化压缩后每张 ≤120KB，单 boss 三张合计 ≤300KB。
- **命名**：`src/assets/battle/portraits/portrait-<boss_id>-s<0|1|2>-v1.png`
  （boss_id：`flower_core` / `cirno` / `alice` / `sakuya`）。
- **接入**：① `asset-manifest.json` 登记；② `battle-atlas.ts` 增加 portraits sheet 与
  `portrait_<boss_id>_s<n>` 裁切帧；③ `build-ui.mjs` 生成 data URL 加入 embedded；
  ④ `ui-host-shell.js` dataset 转交；⑤ `drawBossCutIn` 中用 `drawAtlasFrame` 替换
  占位卡体（徽章/名牌保留），并删水印行。

### 1.2 三副本 boss 战斗形象（✅ 2026-07-29 已接入，待实机视觉验收）

- **现状**：所有者提供琪露诺、爱丽丝、咲夜三张 `1254×1254` 四状态图；已转为透明底，
  按 `presentation.boss_id` 选择独立图集，加载失败仍回退温室妖花 sheet。
- **已满足规格**：每 boss 一张 2×2 网格 sheet，四格依次为待机／施法／受击／击破；
  透明版命名为 `src/assets/battle/boss/<boss_id>-battle-sheet-v1.png`，chroma 版仅作维护源。
- **已接入链**：asset manifest → atlas 四宫格与 per-boss sheet → build data URL →
  host dataset → app atlas source → renderer `boss_id` 选择；缺省回退妖花。
- **剩余验收**：琪露诺已完成本地浏览器到场目视；爱丽丝、咲夜待逐场目视。三套源图放大时
  有轻微洋红边缘，实际战斗缩放下不明显，真实 SillyTavern 中仍须复核。

### 1.3 妖精小怪 sprite（当前=几何圆脸+翅膀）

- **需求**：一张小 sheet：2 配色变体（蓝=掉小P / 金=掉大P）× 2 帧翅膀，64px 网格，
  透明底，总体 ≤120KB。
- **命名**：`src/assets/battle/effects/fairy-sheet-v1.png`（或独立文件）。
- **接入**：atlas 增加 4 帧裁切；`drawFairy` 改为 atlas 优先、几何 fallback 保留。

### 1.4 主题背景（当前=程序化，可选替换）

程序化背景（湖夜/森林/红魔夜空/温室）已可用，**非必填**。若想用手绘背景：
480×640 或 960×1280 JPG/PNG，暗调（亮度需压在弹幕之下），每张 ≤200KB，
命名 `src/assets/battle/backgrounds/bg-<boss_id>-v1.png`，接入点
`drawThemedBackground`（图为底、程序化粒子保留叠加）。

## 2. 音效占位

- **现状**：`src/battle/battle-sound.ts` 的 `nullSoundBus`（静音总线）。模拟层已在
  所有出声点发出类型化事件；接入真音效**只需**在 `battle-engine.ts` 的
  `sfx: (id) => nullSoundBus.play(id)` 一处换成真总线实现。
- **真总线要求**：本地 data URL（build 内嵌，不得远程加载）；WebAudio 解码缓存；
  fire-and-forget 不阻塞定步长循环；提供静音开关；高频事件（`player_shot`/
  `boss_hit`/`graze`）节流 ≥60ms 或降增益混音。
- **格式**：OGG（备选 M4A），44.1kHz 单声道，每条 ≤100KB，全套合计 ≤1.5MB。

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

BGM 不在本表（酒馆环境默认静音场景多，优先做 SFX；若做 BGM 另立规格）。

## 3. 填入流程（给所有者）

1. 把候选素材文件与**来源/授权说明**发给执行 agent；
2. agent 核对授权与规格 → 放入上表命名路径 → 走接入点 → 跑三门禁
   （`check:ui` / `npm test` / `build:ui` + 产物自包含检查）；
3. 每接入一项，在本文档对应条目标记 ✅ 与日期；
4. 全部图像项完成后，删除 cut-in 水印与本文件的"占位"字样，进入 §7.3 实机验收。
