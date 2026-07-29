# 弹幕小游戏交接文档

> 2026-07-29：个人本地弹幕素材与手机操作已收口。所有者提供的 `etama3.png` 已归档为 `battle-bullets-etama3-local-v1.png`，只用于本机预览并在 manifest 标记 `personal-local-only-do-not-package-or-distribute`；渲染器按已登记 shape×hue 取图，未知组合回退几何弹。触控主指实际拖动超过轻触阈值后自动连射，抬起／取消停火；轻触不射、第二指专注、双击 Bomb、鼠标拖动与键盘 Z 均保持原语义。`check:ui`、`npm test` 136/136、`build:ui` 全绿；`390×844` 下画布约 `350×467`，战斗 dialog 无溢出、控制台无错误。**未打包；当前 `build:ui` 会为个人本地预览复制并内嵌 etama3，任何可分发检查点都必须先显式移除或替换该素材；真实 SillyTavern 多点触控仍待验收**。
>
> 2026-07-29：三副本 Boss 独立战斗图已接入。琪露诺、爱丽丝、咲夜各使用一张 `1254×1254`、`2×2` 四状态透明图集，四格对应待机／施法／受击／击破；渲染器按 `presentation.boss_id` 选择图集，加载失败回退温室妖花。构建器只复制／内嵌透明版，宿主通过独立 dataset 交给 iframe。琪露诺已在本地浏览器实跑至 Boss 到场，尺寸、锚点与透明背景正常；爱丽丝、咲夜尚待逐场目视。离线门禁为 `check:ui`、`npm test` 134/134、`build:ui` 全绿。**未打包，未做真实 SillyTavern 验收**。
>
> 2026-07-26：完成 TH06 参考对齐优化（方向 A/B/C）与一处 P0 修复。离线门禁 `check:ui` 通过、`npm test` 100/100、`build:ui` 通过、产物自包含。**真实 SillyTavern 实机验收（协议 §7.3）仍未执行**，不得据此声称"酒馆已验收"。
>
> 执行边界见 `project/bullet-hell-minigame-optimization-protocol.md`（本文件不覆盖它，只记录当前状态与后续）。参考仓库为 `GensokyoClub/th06`（东方红魔郷 1.02h C++ 反编译）——代码参考仍只取机制与数学，不从仓库提取 ECL／资源；当前 etama3 图由所有者另行提供，只允许个人本地预览。

## 当前状态总览

- 战斗本体已从单文件重构为模块：`battle-types` / `battle-atlas` / `battle-input` / `battle-patterns` / `battle-renderer` / `battle-simulation`，`src/ui/battle-engine.ts` 为稳定门面。
- 已实现 TH06 风格扩展：120Hz 定步长 + 自适应绘制、Power(0–128)/Bomb/决死补弹/被弹无敌/复活控制锁、杂鱼波 + 道具 POC、弹型 **11 种**、shape×hue 视觉文法、素材内嵌链（build→data URL→dataset→app，含几何 fallback）。
- 主线继续使用温室妖花图集；三个副本已按 `boss_id` 分别使用琪露诺、爱丽丝、咲夜四状态图集，不再视觉串台。
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

- `npm run check:ui` 通过；`npm test` 136/136。
- `npm run build:ui` 通过；个人本地构建的 `dist/runtime/ui-mount.js` 内嵌自机、妖花、三副本 Boss、通用特效与本地 etama3 data URL；严格路径正则无 `localhost`/本机盘符/远程 URL，且无 chroma 重复大图。该结果仅证明本地预览自包含，不代表可分发。
- 本地浏览器已实跑妖精弹幕练习至琪露诺到场，独立图集选择、尺寸、锚点与透明背景正常，控制台无警告／错误；爱丽丝、咲夜未逐场目视。
- **未打包、未导入、未推送**。真实酒馆 §7.3 矩阵未跑。

## 后续待办（按优先级）

1. **真实 SillyTavern 实机验收**（硬门禁）：新聊天单实例、主线可信 `battle.current` 写入/复读/剧情消息、三副本本地结算与金币/时段/rewarded_ids、取消/Escape/关闭不结算、后台恢复不偷跑、素材断链 fallback、320px/触控拖动自动射击/双指专注/双击 Bomb/200% 缩放/焦点可见。个人本地验收可使用 etama3；若要形成可分发候选，必须先移除或替换该素材再留证据。不得把 dry-run 写成 accepted。
2. **判定半径决策**：4 份配置 `hitbox_radius=4`（比 TH06 比例偏大）本轮**刻意未改**，属所有者已接受手感。若要更 TH06 化可下调至 ~3，但是跨 4 配置的平衡改动，需所有者定夺。
3. **Boss 图集视觉复核**：逐场查看爱丽丝、咲夜的四种姿态，并在真实 SillyTavern 检查三张图放大可见的轻微洋红边缘；必要时只返修透明蒙版，不改裁切和战斗语义。
4. **atlas 像素核对**：继续核对旧自机／妖花／特效裁切与新 Boss 四宫格在各视口的实际显示比例。
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
