# 弹幕小游戏交接文档

> 2026-08-01 阵营识别更新：自机射击不再沿用与敌弹相近的辉光椭圆，现由
> `drawPlayerTalisman` 绘制米白纸符、深色描边、红／青符印、金色顶签与双尾带；敌弹继续保持
> 珠／米／鳞／星等弹体。P 点在既有红方块白像素 P 外增加独立四角拾取框。改动只在渲染层，
> 碰撞半径、伤害、弹速、Power、掉落和结算均未变化。新增定向测试后当前门禁为
> `check:ui`、176/176、`build:ui` 全绿；离线预览已进入妖精练习检查实际缩放，真实宿主待验收。
>
> 2026-08-01 战斗设置更新：弹窗内新增暂停／继续与“音频设置”小弹窗，音效和 BGM 可分别启用、
> 调整音量；设置打开时暂停战斗，关闭后恢复原暂停状态。`battle-bgm-catalog.json` 预留三首曲目，
> 当前 URL 均为空；`battle-bgm.ts` 只接受 HTTPS 曲源，为未来 Cloudflare R2 留接口但不含凭据。
> 偏好只存本机，不写 MVU／聊天／结算。本地默认值、曲目与音量持久化已验证；R2 尚未部署。

> 2026-07-31 琪露诺四阶段修正：固定副本 `fairy_pattern_practice_v1` 已由两阶段扩为四阶段，
> 顺序统一为非符／符卡／非符／符卡，使既有战损规则在 P1–P2 使用 S0、P3 使用 S1、P4 使用 S2。
> 新增阶段沿用已登记弹型与参数上限；未查看、解码、截图或分析任何 S2 图片，图片内容仍由所有者验收。
>
> 2026-07-31 真音效接入更新（历史检查点，现状见顶部 2026-08-01 更新）：26 个 AI 重生成 WAV 已按原字节归档为维护源，14 个稳定事件 WAV
> 已登记 SHA-256 并进入应用级 WebAudio 总线。设置页提供启用、音量和试听，战斗 HUD 可即时静音；
> 高频射击／受击／擦弹有节流，页面隐藏会挂起，单文件失败只静默降级。预览复制本地 WAV，自包含
> mount 内嵌 WAV data URL；`nullSoundBus` 仅保留为 fallback。`check:ui`、166 项测试与构建全绿，
> 但首次手势解锁、各事件听感和真实 SillyTavern 宿主仍待所有者验收。当时没有 BGM，也没有部署 R2。
>
> 2026-07-31 音效规划更新（历史检查点，后续已接入真总线）：`音效/web-sfx/` 已有 26 个 AI 重生成 WAV 候选，全部为单声道
> 22050Hz，总计约 645.4KB；但这些文件仍在 `src/assets` 之外，尚未登记、裁切、归一化、
> 构建内嵌或接入真总线。14 个事件的制作映射、WebAudio 方案和未来 Cloudflare R2 全素材
> 发布合同已写入 `project/asset-delivery-and-r2-plan.md`。该规划记录时运行状态仍是静音；本规划
> 不构成修改“禁止远程运行依赖”协议或部署 R2 的授权。

> 2026-07-31 文档复核：当前维护源、manifest、构建产物与本交接顶部记录一致。弹幕必需图片素材
> 已全部补齐，几何妖精与抽象 cut-in 卡仅是加载失败 fallback；真音效和真实 SillyTavern 验收
> 仍未完成，主题背景贴图为可选项。

> 2026-07-30：内置 ImageGen 生成的温室花妖核心 S0／S1／S2 与妖精小怪 sprite 已接入。
> 花妖三张完整竖图位于 `src/assets/battle/portraits/portrait-flower-core-s{0|1|2}-v1.png`，
> 由同一完好设计逐级编辑为轻损、重损；`boss_id=flower_core` 时按阶段战损档位选择。妖精维护
> 底稿为 `src/assets/battle/effects/fairy-sheet-v1-chroma.png`，透明运行时图为
> `fairy-sheet-v1.png`（2×2、64px 单元，蓝=小 P、金=大 P、两帧翅膀）。两类素材均已完成
> manifest、构建复制／data URL、宿主 dataset、atlas source 与 renderer 接线；几何妖精和
> 样式化 cut-in 卡仅保留作加载失败 fallback。生成稿已目视检查，正式 SillyTavern 实机验收仍待跑。

> 2026-07-30：十六夜咲夜 S0／S1／S2 cut-in 立绘沿用同批素材的直接导入合同接入。
> `D:\浏览器下载\十六夜咲夜` 下的 `S0.png`／`S1.png`／`S2.png` 仅依文件名映射，逐字节复制到
> `src/assets/battle/portraits/portrait-sakuya-s{0|1|2}-v1.png`；没有抠图、去背、修改透明通道、
> 生成 chroma/alpha 中间稿、裁切、缩放、量化或重新编码。manifest、构建复制／data URL、宿主
> dataset、atlas source 和 renderer 状态选择均已接线；咲夜 `boss_id=sakuya` 时按当前战损档位
> 绘制完整图片。至此八名角色的 S0／S1／S2 cut-in 槽位全部接通；非角色 Boss 或加载失败仍回退
> 占位卡。本轮没有解码、预览、截图或目视读取三张图片，故视觉内容与真实显示效果未验收；
> 未正式打包。
>
> 2026-07-30：伊吹萃香 S0／S1／S2 cut-in 立绘沿用同批素材的直接导入合同接入。`D:\浏览器下载\伊吹萃香`
> 下的 `S0.png`／`S1.png`／`S2.png` 仅依文件名映射，逐字节复制到
> `src/assets/battle/portraits/portrait-suika-s{0|1|2}-v1.png`；没有抠图、去背、修改透明通道、
> 生成 chroma/alpha 中间稿、裁切、缩放、量化或重新编码。manifest、构建复制／data URL、宿主
> dataset、atlas source 和 renderer 状态选择均已接线；萃香 `boss_id=suika` 时按当前战损档位
> 绘制完整图片，其他尚未提供差分的 Boss 或加载失败继续回退占位卡。本轮没有解码、预览、截图
> 或目视读取三张图片，故视觉内容与真实显示效果未验收；未正式打包。
>
> 2026-07-30：河城荷取 S0／S1／S2 cut-in 立绘已按所有者的直接导入合同接入。`D:\浏览器下载\河城荷取`
> 下的 `S0.png`／`S1.png`／`S2.png` 仅依文件名映射，逐字节复制到
> `src/assets/battle/portraits/portrait-nitori-s{0|1|2}-v1.png`；没有抠图、去背、修改透明通道、
> 生成 chroma/alpha 中间稿、裁切、缩放、量化或重新编码。manifest、构建复制／data URL、宿主
> dataset、atlas source 和 renderer 状态选择均已接线；荷取 `boss_id=nitori` 时按当前战损档位
> 绘制完整图片，其他尚未提供差分的 Boss 或加载失败继续回退占位卡。遵照所有者禁令，本轮没有
> 解码、预览、截图或目视读取三张图片，故视觉内容与真实显示效果未验收；未正式打包。
>
> 2026-07-30：米斯蒂娅 S0／S1／S2 cut-in 立绘已按所有者的直接导入合同接入。`D:\浏览器下载\米斯蒂娅`
> 下的 `S0.png`／`S1.png`／`S2.png` 仅依文件名映射，逐字节复制到
> `src/assets/battle/portraits/portrait-mystia-s{0|1|2}-v1.png`；没有抠图、去背、修改透明通道、
> 生成 chroma/alpha 中间稿、裁切、缩放、量化或重新编码。manifest、构建复制／data URL、宿主
> dataset、atlas source 和 renderer 状态选择均已接线；米斯蒂娅 `boss_id=mystia` 时按当前战损档位
> 绘制完整图片，其他尚未提供差分的 Boss 或加载失败继续回退占位卡。遵照所有者禁令，本轮没有
> 解码、预览、截图或目视读取三张图片，故视觉内容与真实显示效果未验收；未正式打包。
>
> 2026-07-30：琪露诺 S0／S1／S2 cut-in 立绘已按所有者的直接导入合同接入。`D:\浏览器下载\琪露诺`
> 下的 `S0.png`／`S1.png`／`S2.png` 仅依文件名映射，逐字节复制到
> `src/assets/battle/portraits/portrait-cirno-s{0|1|2}-v1.png`；没有抠图、去背、修改透明通道、
> 生成 chroma/alpha 中间稿、裁切、缩放、量化或重新编码。manifest、构建复制／data URL、宿主
> dataset、atlas source 和 renderer 状态选择均已接线；琪露诺 `boss_id=cirno` 时按当前战损档位
> 绘制完整图片，其他尚未提供差分的 Boss 或加载失败继续回退占位卡。遵照所有者禁令，本轮没有
> 解码、预览、截图或目视读取三张图片，故视觉内容与真实显示效果未验收；未正式打包。
>
> 2026-07-30：爱丽丝 S0／S1／S2 cut-in 立绘已按所有者的直接导入合同接入。`D:\浏览器下载\爱丽丝`
> 下的 `S0.png`／`S1.png`／`S2.png` 仅依文件名映射，逐字节复制到
> `src/assets/battle/portraits/portrait-alice-s{0|1|2}-v1.png`；没有抠图、去背、修改透明通道、
> 生成 chroma/alpha 中间稿、裁切、缩放、量化或重新编码。manifest、构建复制／data URL、宿主
> dataset、atlas source 和 renderer 状态选择均已接线；爱丽丝 `boss_id=alice` 时按当前战损档位
> 绘制完整图片，其他尚未提供差分的 Boss 或加载失败继续回退占位卡。遵照所有者禁令，本轮没有
> 解码、预览、截图或目视读取三张图片，故视觉内容与真实显示效果未验收；未正式打包。
>
> 2026-07-30：魔理沙 S0／S1／S2 cut-in 立绘已按所有者的直接导入合同接入。`D:\浏览器下载\魔理沙`
> 下的 `S0.png`／`S1.png`／`S2.png` 仅依文件名映射，逐字节复制到
> `src/assets/battle/portraits/portrait-marisa-s{0|1|2}-v1.png`；没有抠图、去背、修改透明通道、
> 生成 chroma/alpha 中间稿、裁切、缩放、量化或重新编码。manifest、构建复制／data URL、宿主
> dataset、atlas source 和 renderer 状态选择均已接线；魔理沙 `boss_id=marisa` 时按当前战损档位
> 绘制完整图片，其他尚未提供差分的 Boss 或加载失败继续回退占位卡。遵照所有者禁令，本轮没有
> 解码、预览、截图或目视读取三张图片，故视觉内容与真实显示效果未验收；未正式打包。
>
> 2026-07-30：灵梦 S0／S1／S2 cut-in 立绘已按所有者的直接导入合同接入。`D:\浏览器下载\灵梦`
> 下的 `S0.png`／`S1.png`／`S2.png` 仅依文件名映射，逐字节复制到
> `src/assets/battle/portraits/portrait-reimu-s{0|1|2}-v1.png`；没有抠图、去背、修改透明通道、
> 生成 chroma/alpha 中间稿、裁切、缩放、量化或重新编码。manifest、构建复制／data URL、宿主
> dataset、atlas source 和 renderer 状态选择均已接线；灵梦 `boss_id=reimu` 时按当前战损档位
> 绘制完整图片，其他 Boss 或加载失败继续回退占位卡。遵照所有者禁令，本轮没有解码、预览、
> 截图或目视读取三张图片，故视觉内容与真实显示效果未验收；未正式打包。
>
> 2026-07-30：灵梦与魔理沙的对战卡 BOSS 四状态图已升级为所有者提供的新版。稳定运行路径和 `2×2` 待机／施法／受击／击破合同不变，新版黑底源图以确定性算法透明化，原始字节归档于 `旧素材/素材处理/battle-boss-owner-source-v2/`，旧 v1 原档保留；处理报告与透明总览分别为 `project/character-boss-sheet-replacement-report-2026-07-30.json`、`project/character-boss-sheet-replacement-preview.png`。离线浏览器已分别开启灵梦、魔理沙极难对战并立即暂停，确认新版人物、透明背景、尺寸与锚点正常，页面控制台无 warning/error；证据为 `project/runtime-qa/boss-{reimu,marisa}-v2-paused.png`。完整门禁 `check:ui`、`npm test` 154/154、`build:ui`、r54 dry-run 全绿；演练产物 `101,878,951` bytes、SHA-256 `a0605c9c…7586cf`。**未正式打包；真实 SillyTavern 四状态切换、宿主缩放和移动端显示仍待验收。**
>
> 2026-07-30：任意角色对战卡的八人 BOSS 视觉已补齐。所有者新增提供灵梦、魔理沙、荷取、米斯蒂娅、萃香五张 `1254×1254` 黑底四状态图；确定性透明化后与既有琪露诺、爱丽丝、咲夜统一使用 `2×2` 待机／施法／受击／击破合同。五份原始字节、透明输出哈希与逐格统计可从 `project/character-boss-sheet-preparation-report.json` 追溯。构建、宿主 dataset、app atlas source、渲染选择和对战档案已全部接通；对战档案旧 `boss_alice`／`boss_cirno`／`boss_sakuya` 已校正为渲染器实际使用的角色 ID。离线浏览器逐一打开五名新增角色的对战卡战斗并暂停目视，均显示正确独立人物、无黑底方块，控制台无 warning/error。完整门禁 `check:ui`、`npm test` 154/154、`build:ui`、r54 dry-run 全绿。**未正式打包；真实 SillyTavern 八角色逐场及四状态切换仍待验收。**
>
> 2026-07-30：所有者澄清 `etama3.png` 是其此前使用 AI 生成并修改的项目素材，允许随项目打包分发；原错误的用途限制和构建门槛已撤销。文件继续沿用稳定路径 `battle-bullets-etama3-local-v1.png`，渲染器按已登记 shape×hue 取图，未知组合回退几何弹。真实 SillyTavern 多点触控仍待验收。
>
> 2026-07-29：三副本 Boss 独立战斗图已接入。琪露诺、爱丽丝、咲夜各使用一张 `1254×1254`、`2×2` 四状态透明图集，四格对应待机／施法／受击／击破；渲染器按 `presentation.boss_id` 选择图集，加载失败回退温室妖花。构建器只复制／内嵌透明版，宿主通过独立 dataset 交给 iframe。琪露诺已在本地浏览器实跑至 Boss 到场，尺寸、锚点与透明背景正常；爱丽丝、咲夜尚待逐场目视。离线门禁为 `check:ui`、`npm test` 134/134、`build:ui` 全绿。**未打包，未做真实 SillyTavern 验收**。
>
> 2026-07-26：完成 TH06 参考对齐优化（方向 A/B/C）与一处 P0 修复。离线门禁 `check:ui` 通过、`npm test` 100/100、`build:ui` 通过、产物自包含。**真实 SillyTavern 实机验收（协议 §7.3）仍未执行**，不得据此声称"酒馆已验收"。
>
> 执行边界见 `project/bullet-hell-minigame-optimization-protocol.md`（本文件不覆盖它，只记录当前状态与后续）。参考仓库为 `GensokyoClub/th06`（东方红魔郷 1.02h C++ 反编译）——代码参考仍只取机制与数学，不从仓库提取 ECL／资源；当前 etama3 图为所有者提供并经 AI 生成修改的项目素材。

## 当前状态总览

- 战斗本体已从单文件重构为模块：`battle-types` / `battle-atlas` / `battle-input` / `battle-patterns` / `battle-renderer` / `battle-simulation`，`src/ui/battle-engine.ts` 为稳定门面。
- 已实现 TH06 风格扩展：120Hz 定步长 + 自适应绘制、Power(0–128)/Bomb/决死补弹/被弹无敌/复活控制锁、杂鱼波 + 道具 POC、弹型 **11 种**、shape×hue 视觉文法、素材内嵌链（build→data URL→dataset→app，含几何 fallback）。
- 主线继续使用温室妖花图集；三个固定副本使用琪露诺、爱丽丝、咲夜，任意角色对战卡的八名角色均按 `boss_id` 使用各自独立四状态图集，不再视觉串台或回退妖花。
- `BattleResult` 10 字段形状未变；主线（`stageBattleResult`→剧情）与副本（`settleDungeonResult`→本地金币，无 LLM）双结算链未变。

## 本轮改动（2026-07-26）

### P0 修复：`defeatMob` 幂等
- **旧 bug**：`defeatMob` 守卫 `if (mob.hp <= 0 && !fromBomb) return;` 会吞掉所有自机弹击杀——调用方先把血打到 ≤0 再调用，守卫立即 return，导致 `mobsDefeated` 不增、**不掉落 P**；只有 Bomb 击杀（`fromBomb=true`）才计数。
- **修法**：`MobState` 加 `defeated` 幂等标记，`defeatMob` 按标记判重而非按 hp。现射杀妖精正确计数并掉 P。
- 该 bug 曾使基线为 96/97（红）。修复 + 硬化脆弱测试后现 100/100。

### A 离散 dirChange（参考 `BulletManager::dirChange*`）
- 弹幕可在固定间隔后离散转向（可选变速）N 次，确定性只依赖 `bullet.age`。
- 配置字段（`BattlePatternConfig`）：`dir_change_interval_ms` / `dir_change_rotation_deg` / `dir_change_speed` / `dir_change_times`。
- 钳制：`times ∈ [0,6]`、`|rotation| ≤ 180°`、`interval ≥ 120ms`、`speed` 受 `parameter_limits.speed`。
- 已接入 `boundary-echo-trial-v1.json` 的"境界刻线"符卡（aimed_stream 单次 40° 折返）。

### B 出膛生成态（参考 `BULLET_STATE_SPAWNING_*`）
- 普通弹出膛 `SPAWN_IN_S`(0.09s) 内**免碰撞/免擦弹**且淡入放大（materialize）。
- 预告/激光/安全带标记不带 spawn-in（各自 warning 计时管理）。
- 由 `pushEnemy` 自动盖章，无需配置；burst 子弹亦带。

### C 随机 aim 抖动（参考 `RANDOM_ANGLE / RANDOM_SPEED`）
- 按确定性运行 PRNG 给每弹角度/速度加抖动。
- 配置字段：`random_angle_deg`（≤90°）、`random_speed`（≤120 px/s）。
- 已接入 `forest-magic-residue-v1.json` 的"魔力残响"符卡（wave_fan 轻度散射）。
- 数值微调：复活无敌 floor `1800→2400ms`（贴近 TH06 240帧≈4s 方向）。

### D 触控/窄屏
- 主手指实际拖动超过 `14px` 轻触阈值后自动连射，抬起或触摸取消立即停火；按下但未拖动仍作为轻触，不误射击。
- 第二根手指继续作为专注修饰键，快速双击继续请求 Bomb；第二指移动不夺取主指坐标或触发射击。
- 鼠标拖动仍须按 Z 才射击；键盘、屏上专注／Bomb 回退按钮、44px 触控、320px 内部滚动和 reduced-motion 语义保持。
- `390×844` 离线实测战斗画布约 `350×467`，dialog 完整位于视口且无横向／纵向溢出；真实设备多点触控仍待验收。

## 新增/变更的字段词表（供续作 agent）

| 层 | 新符号 |
|---|---|
| `BattlePatternConfig` | `dir_change_interval_ms/rotation_deg/speed/times`、`random_angle_deg`、`random_speed` |
| `Bullet`（运行时） | `dirChangeInterval/Rotation/Speed/Max/Done`、`spawnInS` |
| `MobState` | `defeated`（幂等击破标记） |
| `battle-types.ts` 常量 | `SPAWN_IN_S = 0.09` |
| `PatternSpawnContext` | `dirChange`、`randomJitter`（spawn 时派生并盖章到每弹） |

## 验证状态

- `npm run check:ui` 通过；`npm test` 176/176。
- `npm run build:ui` 通过；`dist/runtime/ui-mount.js` 保持自包含资源链。BGM 曲目模板的 URL 当前均为空，构建不产生新的远程运行依赖；正式候选仍须取得当次打包授权并完成对应验收。
- 本地浏览器已进入妖精弹幕练习，检查战斗内置音频设置、暂停流程和新纸符绘制在实际画布缩放下的表现；这属于离线预览证据，不等于真实 SillyTavern 验收。爱丽丝、咲夜仍未逐场复核。
- **未打包、未导入、未推送**。真实酒馆 §7.3 矩阵未跑。

## 后续待办（按优先级）

1. **真实 SillyTavern 实机验收**（硬门禁）：新聊天单实例、主线可信 `battle.current` 写入/复读/剧情消息、三副本本地结算与金币/时段/rewarded_ids、取消/Escape/关闭不结算、后台恢复不偷跑、素材断链 fallback、320px/触控拖动自动射击/双指专注/双击 Bomb/200% 缩放/焦点可见。验收与后续获授权的项目候选均可包含 etama3；不得把 dry-run 写成 accepted。
2. **判定半径决策**：4 份配置 `hitbox_radius=4`（比 TH06 比例偏大）本轮**刻意未改**，属所有者已接受手感。若要更 TH06 化可下调至 ~3，但是跨 4 配置的平衡改动，需所有者定夺。
3. **Boss 图集视觉复核**：逐场查看爱丽丝、咲夜的四种姿态，并在真实 SillyTavern 检查三张图放大可见的轻微洋红边缘；必要时只返修透明蒙版，不改裁切和战斗语义。
4. **画布可读性与 atlas 像素核对**：在 320px、200% 缩放、色觉辅助和高密度交火中复核纸符／敌弹／P 点三类轮廓；继续核对旧自机、妖花、特效与 Boss 四宫格的实际显示比例。
5. 可选：把 dirChange / 随机抖动接入更多符卡（目前各只接 1 处示范）。

## 关键文件

| 主题 | 文件 |
|---|---|
| 引擎门面（start/destroy/触控转发/自适应绘制） | `src/ui/battle-engine.ts` |
| 定步长模拟、碰撞、结算、dirChange/出膛应用 | `src/battle/battle-simulation.ts` |
| 弹型生成、钳制、盖章（dirChange/spawn-in/jitter） | `src/battle/battle-patterns.ts` |
| 类型、常量、弹型白名单、power 布局 | `src/battle/battle-types.ts` |
| 绘制（含出膛 materialize） | `src/battle/battle-renderer.ts` |
| atlas 裁切表与安全绘制 | `src/battle/battle-atlas.ts` |
| 键鼠/触控输入（可移除监听） | `src/battle/battle-input.ts` |
| 四场配置 | `src/battle/configs/**/*.json` |
| 战斗对话框/副本选择 HTML | `src/ui/index.html`（`#gg-battle-dialog`/`#gg-dungeon-dialog`） |
| 战斗命名空间样式 | `src/ui/styles.css`（`.gg-battle-*`/`.gg-dungeon-*`） |
| 测试 | `tests/battle-minigame.test.mjs`（100 项含全套战斗断言） |
| 执行边界 | `project/bullet-hell-minigame-optimization-protocol.md` |

## 约束提醒（给续作 agent）

- 只改协议白名单文件：`battle-engine.ts`、`src/battle/**`、`src/assets/battle/**`、`app.ts`/`index.html`/`styles.css`/`build-ui.mjs`/`ui-host-shell.js` 的锚点、`tests/battle-minigame.test.mjs`。
- 绝不改 `BattleResult` 形状、bridge、MVU schema、奖励、时段、事件前置、消息数量。
- 小游戏唯一出口是 `onFinish(result)`；不得引入 `Mvu`/`createChatMessages`/`triggerSlash`/`generate`。
- 新弹型必须进 `REGISTERED_PATTERNS` 并受 `parameter_limits` 钳制，不得绕过验证。
- 工作树含所有者大量未提交 M2 改动，不得清理、回退、格式化或覆盖。
- 不打包/导入/推送/部署，除非所有者明确授权。
