# 幻想乡物语 · 项目总览（唯一入口文档）

> 读完本文档即可对整个项目建立全貌认知；需要深入某个领域时，按 §3 导航表跳转对应文档。
> 最后整理：2026-08-01（第一版八名固定角色人设均已完成扩写；机遇卡、任意角色对战卡与杂鱼标签阶段 A–C 已接通。八名角色均使用独立 `2×2` BOSS 四状态图集，并各有直接导入的 S0／S1／S2 cut-in；温室花妖核心已有同设计三阶段 cut-in，妖精小怪已有蓝／金两色双帧 sprite。14 个稳定事件 WAV 已接入 WebAudio；战斗弹窗现支持暂停与内置音频设置，音效／BGM 可分轨调整，三首 BGM 模板为未来 HTTPS R2 曲源预留空 URL。自机射击已从敌弹式辉光椭圆改为纸符轮廓，P 点增加四角拾取框，模拟与结算未改。V3 横向庭园底图、13 张正常设施、三组共享废墟与不可行走蒙版均已接入。当前离线门禁为 `check:ui`、`npm test` 176/176 与 `build:ui` 全绿；未正式打包、未覆盖 r54、未部署 R2，真实 SillyTavern 的角色对话、战斗音频／纸符可读性／四状态／cut-in／妖精动画与宿主缩放仍待验收）。

---

## 1. 项目是什么

**幻想乡物语 · 移动庭园**是一张 SillyTavern 角色卡形态的东方 Project 同人经营游戏：玩家从收到祖父的遗信与沉睡的庭守钥开始，在聊天序章中了解那座会移动的结界庭园，亲手接受继承后进入像素地图，与灵梦、魔理沙、琪露诺、爱丽丝、米斯蒂娅、萃香、荷取、咲夜八名角色互动，修缮主屋、经营温室、打符卡弹幕战、开店购物、举办宴会、应对自定义异变。

技术上它是三层结构：

1. **宿主壳层**（`src/runtime/ui-host-shell.js`）：在 SillyTavern 聊天区内挂载单例 iframe 游戏壳，视觉隐藏原生楼层但不删除真实消息；切卡/卸载时完整恢复原生聊天。
2. **游戏 UI 层**（`src/ui/`，约 40 个 TS 模块）：庭园地图 canvas、GAL 剧情演出、设施/商店/背包视图、符卡弹幕小游戏；视图渲染、规则纯函数、桥接事务三组分层。
3. **状态与模型层**：`stat_data`（MVU 变量）是唯一正式游戏状态；剧情由主模型生成、变量由 MagVarUpdate 额外模型以 JSONPatch 更新；**一切关键状态（资源/战斗/事件/在场/时间/UID）由本地 bridge 独占写入，模型只做叙事与开放语义字段**——这是全项目最重要的一条主轴。

交付形态：`scripts/package-checkpoint.mjs` 把 UI（base64 自包含）、世界书 16 条、初始状态打进一张 `chara_card_v2` JSON 测试检查点卡，按 `0.2.0-rN` 序列独立存放于 `dist/`，拒绝覆盖。

## 2. 当前状态速览

| 项 | 状态 |
|---|---|
| 最新打包 | `0.2.0-r54`（`d654424` 主分支基准，SHA-256 `4af870fa…501214`，38.4MB）——**离线候选，未包含本轮扩大视角地图，未实机验收** |
| 已实机验收基线 | `0.2.0-r32-extra-model-binding`（角色世界书绑定 + 额外模型变量路线） |
| 里程碑 | M0 complete / M1 施工完但 R37 集中验收未跑 / M2 施工完但 R45 验收未跑 / M3 进行中 |
| 离线门禁 | 当前维护源已通过 `check:ui`、`npm test`（176/176）与 `build:ui`；最近一次 r54 dry-run 仍是此前记录的 `205,582,027` bytes、SHA-256 `9b0506f5…19427b7c`，本轮未重跑打包 dry-run。未正式打包，现有 r54 历史产物不覆盖 |
| 角色人设世界书 | 第一版八名固定角色均已完成完整人设扩写，并继续各占一个独立绿灯条目，连同八条基础世界书共 16 条。米斯蒂娅已补齐老板娘／歌手、料理与账目反差、夜雀能力及撤离型战斗逻辑；咲夜已补齐潇洒与天然、对蕾米莉亚的主动忠诚、时间／空间／飞刀／料理及能力边界。所有者私设与原作资料分层标注；人设内部增加小节不会增加世界书条目数。八人仍待真实对话统一复核语气密度、关系递进、能力尺度和提示预算 |
| 像素角色动画 | Alice、Cirno、Mystia、Nitori、Reimu、Sakuya、Suika 的 604 张所有者验收独立帧已按原字节归档，并生成 `209×209`、逐角色可变列的 `sequence-approved-v1` 图集接入庭园运行时；七人仅在移动时播放各自的 `80–110ms` 四方向序列，休息、转向预备、收步及 reduced motion 优先显示现有 `2×2` 四视图 turnaround 静态待机图，不播放待机切帧、呼吸或上下浮动；静态图按角色和朝向应用从素材透明包围盒实测得到的缩放、水平中心与脚底对齐参数，使其与对应动作帧保持同一视觉尺寸，加载失败时才回退动作图对应方向首帧。运行时已由固定横向往返升级为区域锚点周围的受限二维随机巡游：每次选择一个上下左右单轴长程，单段距离为 `0.034–0.080`，典型移动约持续 `2–5s`；抵达后保持朝向、收步并强制休息，再生成下一次行动。加载失败自动回退旧 V2 或旧四帧图集。Cirno 使用独立方向锚点，Suika 保留 `y≈313` 源锚点和已修正的背面顺序。魔理沙本批无序列，继续使用 V2 r2，停止时同样使用 turnaround 对应朝向站姿。旧 `sequence-v1` P0 候选未覆盖。详见动画专项文档 §13.7 |
| 庭园地图分层 | manifest 使用所有者提供的 `1672×941` 横向底图 `garden-base-owner-v3.png`，中央主屋直接复用底图。13 张 V3 正常设施形态已按四组共享透明画布接入，并登记独立尺寸、渲染中心、角色落脚点、标签锚点与精确命中多边形；旧 V2 底图、设施、损坏层及已退役主屋叠图共 37 个文件已按原相对路径移至 `旧素材/`，不再混入活动资产清单。所有者提供的完整透明废墟图已确定性正规化为三组同画布替换图，妖精花园／月见温泉／宴会广场进入 damaged 时替换正常设施；建议的两张主屋状态层仍待补。地图合成预览已检查，真实 SillyTavern 验收未执行。详见 `project/v3-map-facility-asset-checklist.md` |
| 前端视觉入口 | 顶栏只保留「幻想乡案内」入口；打开原生单例大面板后，以大尺寸平滑插画卡进入符卡副本、灵梦小店与背包，开放庭园／全屏／设置作为次级操作。入口只换壳，仍调用既有业务函数，不新增状态源。角色／设施点击菜单过滤重复“离开”，设施“查看”只显示文字详情；背包为独立道具袋视图，GAL 道具选择为御札式选择槽。浏览器缩放补偿只服务角色小人与目标菜单，地图滚轮缩放保持锚点语义 |
| 教程与测试 | “开放庭园”从正式 `stat_data` 派生 11 步教程进度、当前步骤和下一步说明，不另存 UI 进度；测试快进扩展为分组控制面板，覆盖 7 个教程断点、M1/M2 场景、道具恢复以及八名角色单独／全员进庄园和清空在场状态 |
| GAL 视觉 | 舞台使用 `gensokyo-gal-shrine-background-v1.png`；预览读取文件、内嵌运行时读取 data URL。旧 CSS 月亮和雾气层已禁用；姓名牌移入带 `clip-path` 的对白框内部，避免被裁掉；桌面及窄屏均保留东方和纸／红漆层级。LLM 表现协议、`scene.v1` 与庭园正文现已接入 `normal / nude / sexual` 三值 `visual_mode`，旧回复默认 `normal`。魔理沙的正常／开心／害羞／伤心／生气五种反应已分别接入 `normal` 与 `nude` 共 10 张所有者原图，进入 asset manifest、预览复制、自包含 data URL、宿主 dataset 和 UI resolver；完整透明画布底部居中并使用平滑缩放。当前无 sexual 姿势，按同反应全裸再到普通图降级；R2 与真实 SillyTavern 验收尚未执行 |
| 弹幕战视觉／音效 | etama3 敌弹图集按 shape×hue 绘制并保留几何回退；自机普通／专注射击使用米白纸符、深色描边、红／青符印、金色顶签与双尾带，不再复用敌弹式辉光椭圆；P 点保留红方块白像素 P，并增加独立四角拾取框。固定三副本与任意角色对战卡均使用独立 Boss 四状态图集及 S0／S1／S2 cut-in；花妖核心与蓝／金双帧妖精 sprite 已接入。14 个事件 WAV 通过应用级 WebAudio 总线播放；战斗弹窗可暂停，并通过内置“音频设置”分别控制音效、BGM 曲目和 BGM 音量。BGM 目录当前仅有三首 `source_url:null` 模板，未来只接受 HTTPS R2 曲源，缺曲静默且不阻塞模拟；偏好只存本机。手机拖动自动射击、双指专注、双击 Bomb 与桌面键盘语义保持。模拟、碰撞、结算和 `BattleResult` 未因视觉／音频设置改变；真实 SillyTavern 的音频权限、纸符可读性、四状态、cut-in、妖精动画、多点触控和宿主缩放仍待验收 |
| 素材发布 | 当前角色卡继续使用本地 data URL 自包含构建。已建立 `project/asset-delivery-and-r2-plan.md`：仓库维护源与发行快照分层，由活动 manifest 生成带 SHA-256／MIME／字节的干净发布清单；未来上线采用固定 release ID 的 Cloudflare R2 自定义域名、匿名 GET／HEAD、不可变缓存和双模式回退。当前 `dist/assets` 可能含历史残留，不得整目录上传；R2 桶、域名、CORS、上传工具和远程运行尚未实施或授权 |
| 活跃工作线 | ①本地 14 事件音效、战斗暂停和内置音频设置已接通；下一步在真实 SillyTavern 验收首次手势解锁、暂停恢复、音效／BGM 分轨与纸符／敌弹／P 点高密度可读性。BGM 当前只有空 URL 模板，R2 预发布仍须另行授权并补桶、域名、CORS 和凭据范围 ②机遇卡、对战卡与杂鱼标签阶段 A–C 已完成，下一步按 `project/opportunity-duel-card-plan.md` 等待正式卡面／小鱼干素材并验收胜败分流 ③按 `project/v3-map-facility-asset-checklist.md` 在真实 SillyTavern 验收共享废墟、命中和缩放 ④复核新地图设施切换、拖动／缩放后菜单跟随、宿主裁切与生命周期 ⑤R11–R16、弹幕和 M1/M2 集中实机验收欠账 |
| 目标环境 | SillyTavern 1.18.0 + Tavern Helper 4.8.19 + MagVarUpdate（固定 commit） |

## 3. 导航表：想了解什么 → 读哪个文档

### 3.1 宪法层（改任何东西前必读，不可违背）

| 想了解 | 读 |
|---|---|
| 所有权边界、必须/禁止成立的全部红线 | `project/contract.md` |
| 在场角色同步（presence_snapshot / GensokyoPresence 回执） | `project/presence-sync-contract.md` |
| 额外模型变量分工、写入顺序、世界书路由与预算 | `project/extra-model-variable-analysis.md` + `src/lorebook/variable-update-rules.md` |
| 已固化的架构基线（O0–O3）与停止条件 | `project/runtime-architecture-optimization-plan.md` |

### 3.2 现状指针（回答"改到哪、验到哪、下一步"）

| 想了解 | 读 |
|---|---|
| 当前交接状态、开工顺序、操作约束 | `project/agent-handoff.md`（最上方条目最新） |
| 三个异常关闭任务的精确断点、素材位置与续接步骤 | `project/interrupted-work-recovery-2026-07-28.md` |
| 机器可读的版本/检查点/文件清单指针 | `project/manifest.json` |
| 每个宿主 API 的出处与置信度 | `project/api-provenance.md` |

### 3.3 活跃工作线

| 想了解 | 读 |
|---|---|
| 前端美化方向（像素×二次元双层架构）与阶段规划 | `project/ui-beautification-plan.md` |
| 美化逐轮施工记录、待素材清单、验收交接项 | `project/ui-beautification-log.md` |
| 顶栏收拢与大型「幻想乡案内」入口面板的结构、尺寸和验收标准 | `project/large-entry-panel-plan.md` |
| 像素角色旧 V2 图集合同、所有者验收序列与运行时接入 | `project/pixel-character-animation-v2-plan.md`（新工作先读 §13.7） |
| 弹幕小游戏当前状态（TH06 扩展、六模块引擎） | `project/bullet-hell-minigame-handoff.md` |
| 弹幕小游戏改动边界（可改/禁改文件、命名空间） | `project/bullet-hell-minigame-optimization-protocol.md` |
| 弹幕音效入库、全素材发布清单与 Cloudflare R2 上线／回滚 | `project/asset-delivery-and-r2-plan.md` |
| 战斗 BGM 曲目模板、R2 URL 填写与缺曲回退 | `project/battle-bgm-r2-template.md` |
| GAL 正常／全裸／成人姿势变量、稳定抽卡与 R2 滚动卡池 | `project/gal-portrait-variable-and-r2-pool-plan.md` |
| 机遇卡、任意角色对战卡、杂鱼标签与胜负分流 | `project/opportunity-duel-card-plan.md` |
| M1 集中实机验收清单（未执行） | `project/r37-acceptance-checklist.md` |
| M2 所有者验收清单（未执行，含 9 个测试快进按钮用法） | `project/r45-owner-acceptance-checklist.md` |

### 3.4 源码侧文档（改状态/世界书/素材时查）

| 想了解 | 读 |
|---|---|
| 每个 MVU 字段的类型/写入者/上限/迁移 | `src/schema/field-ledger.md` |
| 世界书条目路由（进剧情阶段还是变量阶段） | `src/lorebook/routing-plan.json` + `model-projection.md` |
| 角色人设源、绿灯路由与扩写进度 | `src/lorebook/characters/*.xml` + `src/lorebook/character-routing.json` + `project/agent-handoff.md` 顶部 |
| 素材清单与评审流程（approved / pending-unified-review） | `src/assets/asset-manifest.json` |
| 商店商品与解锁门 | `src/shop/catalog.json` |
| 符卡战配置结构与白名单 | `src/battle/configs/`（四份同构 JSON）+ `dungeon-registry.json` |
| 地图区域坐标与手描轮廓（换底图必须重描） | `src/ui/garden-spatial.ts` |

### 3.5 历史留档（不必通读，追溯回归原因时按需检索）

- **runtime-report 系列**（`runtime-report-0.2.0*.md`、`-r13`~`-r28`）：版本线里程碑记录；r14/r18/r28/r32 是历史验收节点。
- **规划文档**（`r29-r37-m1-expansion-plan.md`、`r38-r45-m2-*`、`r19-r20-greenhouse-completion-plan.md`、`gal-interaction-plan.md`、`same-layer-refactor-plan.md`、`r47/r48-*-plan.md`）：产品决策来源，施工均已完成；其中 `same-layer-refactor-plan.md` 仍是壳层设计的长期参考。
- **施工日志**（`r38-r45-implementation-log.md`、`r48-followup-implementation-log.md`）：实现细节已固化进代码。
- **`r48-gal-transaction-repair-log.md`**：例外——虽是日志但含真实聊天取证与最易复发的运行时坑，接手运行时问题前值得一读。

## 4. 目录结构速览

```text
src/ui/          游戏 UI（视图渲染 / *-rules.ts 纯函数 / bridge+事务）
src/runtime/     宿主壳（ui-host-shell.js）
src/schema/      MVU schema、字段台账、初始状态
src/lorebook/    世界书源与路由、变量更新规则
src/battle/      符卡战配置与副本登记表
src/shop/        商店目录
src/assets/      像素素材 + asset-manifest.json（批量生成后统一评审制）
旧素材/          历史、废弃、被拒绝或可重新生成素材归档（保留原相对路径，不参与构建）
scripts/         build-ui / package-checkpoint / preview-server
tests/           三份契约测试（UI 契约 / 弹幕引擎 / M2 规则），esbuild 直测真实源码
project/         全部文档（本文件所在）
dist/            构建产物与历史检查点——不进 git，不许覆盖
```

## 5. 常用命令与固定工作流

```bash
npm run check:ui              # TypeScript 类型检查
npm test                      # node --test，当前 161 项
npm run build:ui              # esbuild 打包 + 素材内嵌 → dist/
npm run package:checkpoint:dry  # 打包演练（不落盘成品）
npm run package:checkpoint    # 正式打包（需所有者授权；拒绝覆盖已有检查点）
npm run preview               # 本地预览 http://127.0.0.1:8765/ui/index.html（注意必须带 /ui/ 路径）
```

修改维护源后的固定顺序：`check:ui → test → build:ui → package:checkpoint:dry`。要新检查点时先把 `package.json` 两个脚本与 `project/manifest.json` 指针升到未占用的 rN。

## 6. 硬约束速记（详见 contract.md）

1. `stat_data` 唯一正式状态；bridge 独占资源/战斗/事件/在场/时间/UID/解锁；模型只写开放语义字段。
2. 时间只能前进；本地结算必须等 `VARIABLE_UPDATE_ENDED` 再合并。
3. 事件登记表是允许结果的唯一来源；模型只收当前事件的最小投影，禁止全目录注入。
4. 模型输出永不作为 HTML/URL/代码执行；玩家不上庭园地图；禁新增万能 `current_chapter`/`current_route`。
5. 未经所有者授权不打包；任何历史 dist 检查点不覆盖；`dist/` 不进 git。
6. 弹幕小游戏只改协议允许的文件；样式限 `.gg-battle-*`/`.gg-dungeon-*` 命名空间；唯一出口 `onFinish(result)`。
7. 离线门禁通过 ≠ 实机验收通过；不得凭 dist 存在推断已验收。
8. UI 故障必须能恢复原生聊天；切卡/卸载完整清理。

## 7. 新 Agent 开工顺序

1. 读本文档 §1–§6 → `project/agent-handoff.md` 最新条目 → `project/contract.md`。
2. 按任务领域从 §3 导航表补读对应细则（美化 → plan+log；弹幕 → handoff+protocol；运行时 bug → r48-gal-transaction-repair-log）。
3. 动手前与收工前各跑一遍离线门禁；若基线已有失败，记录精确测试名与原因，不得把既有失败归到本轮，也不得写成“全绿”。当前离线基线为 176/176，无已知失败。
4. 文档更新纪律：状态变化写 `agent-handoff.md` 顶部新条目；专项进展写对应 log；本文件只在"导航结构或项目形态变化"时更新。
