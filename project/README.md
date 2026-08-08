# 幻想乡物语 · 项目总览（唯一入口文档）

> 读完本文档即可对整个项目建立全貌认知；需要深入某个领域时，按 §3 导航表跳转对应文档。
> 最后整理：2026-08-08（角色登场／退场“赖场”主链完成两轮修复并通过独立离线验收；真实 SillyTavern 实机验收仍待执行）。

---

## 1. 项目是什么

**幻想乡物语 · 移动庭园**是一张 SillyTavern 角色卡形态的东方 Project 同人经营游戏：玩家从收到祖父的遗信与沉睡的庭守钥开始，在本地开场界面确认资料并直接继承庭园，随后进入像素地图，与灵梦、魔理沙、琪露诺、爱丽丝、米斯蒂娅、萃香、荷取、咲夜八名角色互动，修缮主屋、经营温室、打符卡弹幕战、开店购物、举办宴会、应对自定义异变。

技术上它是三层结构：

1. **宿主壳层**（`src/runtime/ui-host-shell.js`）：在 SillyTavern 聊天区内挂载单例 iframe 游戏壳，视觉隐藏原生楼层但不删除真实消息；切卡/卸载时完整恢复原生聊天。
2. **游戏 UI 层**（`src/ui/`，约 40 个 TS 模块）：庭园地图 canvas、GAL 剧情演出、设施/商店/背包视图、符卡弹幕小游戏；视图渲染、规则纯函数、桥接事务三组分层。
3. **状态与模型层**：`stat_data`（MVU 变量）是唯一正式游戏状态；剧情由主模型生成、变量由 MagVarUpdate 额外模型以 JSONPatch 更新；**一切关键状态（资源/战斗/事件/在场/时间/UID）由本地 bridge 独占写入，模型只做叙事与开放语义字段**——这是全项目最重要的一条主轴。

交付形态：`scripts/package-checkpoint.mjs` 把 UI、世界书和初始状态打进一张 `chara_card_v2` JSON 测试检查点卡，按 `0.2.0-rN` 序列独立存放于 `dist/` 并拒绝覆盖；需要标准角色卡时由 `scripts/embed-card-png.mjs` 把该 JSON 作为 `chara` tEXt chunk 嵌入 PNG 立绘，输出可被 SillyTavern 直接导入的 `.png` 卡片（立绘像素原样保留，不重编码）。日常调试可使用全素材内嵌构建；交付给所有者测试的轻量卡使用固定 `remote-r2` manifest，仅保留开场所需的少量内嵌素材。两种模式不得混淆。

## 2. 当前状态速览

| 项 | 状态 |
|---|---|
| 当前有效轻量包 | `0.2.0-r94`（**UI 远程交付首版**）——JSON 297,237 bytes、SHA-256 `4d909263e6555193cde5ded2c713ed2fbdf75d98e97f68eb455c633e524dde33` / PNG 卡片 1,230,920 bytes、立绘 512×853。**UI 脚本 `gensokyo-garden-ui-020-r94` 为远程 loader（2,613 bytes）**：拉取 R2 `…/live/ui/ui-manifest.json` 指针 → sha256 校验 → 加载 `ui-mount-r94.js`（R2 已上传，SHA-256 `17774106057a953a58e63695bded939013626bc008beffc3660f1b88d5eaf7e8`）。更新 UI 免重发卡：传新 ui-mount + 改 manifest 指针，已导入的卡刷新即生效。含 r93 玩家名字投影修复。remote-r2 模式、26 条世界书 |
| 正式发布版卡片 | `幻想乡物语·移动庭园`（0.2.0-r92，**正式版**）——JSON 2,261,814 bytes、SHA-256 `938f5377724e4e5a7d74ca88e746c70cf7c0b42d60e3ef92a5b940dd98740929`；PNG 3,850,356 bytes、SHA-256 `e565e72249c9c5474b71a8d5d6891e091a74a2829cb2944b2fc8cc77a41040ea`（立绘 512×853 sharp 压缩）。卡片名 `幻想乡物语·移动庭园`、开场标签 `<移动庭园 version="0.2.0">`、creator_notes 标注正式发布版；功能内容（3 个 UI 脚本 content、26 条世界书、MVU 状态）与 `0.2.0-r92` 测试检查点逐字节一致。交付给玩家用正式版 PNG；开发/验收用测试检查点 |
| PNG 卡片形态（r84） | 新增 `scripts/embed-card-png.mjs`：把 `chara_card_v2` JSON 作为 `chara` tEXt chunk 嵌入 PNG 立绘，输出标准 SillyTavern 可导入 `.png` 卡片（立绘像素原样保留、不重编码、CRC 正确）。r84 起交付 JSON 与 PNG 双形态；立绘源 `D:\浏览器下载\MiaoMiao_Harem_AnimaBase_single_00504_.png` |
| 错误留档（禁止导入） | `0.2.0-r72`（280,326,339 bytes）——最后一次构建误为 embedded，导致全素材内嵌；保留作事故证据，后续改动改由 r73 remote-r2 候选重新打包 |
| 已实机验收基线 | `0.2.0-r32-extra-model-binding`（角色世界书绑定 + 额外模型变量路线） |
| 里程碑 | M0 complete / M1 施工完但 R37 集中验收未跑 / M2 施工完但 R45 验收未跑 / M3 进行中 |
| 离线门禁 | r94 已发布基线保持不变（loader 2,613B，远端 UI SHA-256 `17774106…e7e8`）。下一本地候选已升为 r95：`check:ui` 通过；远程 UI 专项 4/4；连续两次 remote build 字节与 SHA 一致；UI 发布 dry-run 与 `package:checkpoint:dry` 通过（卡 298,937B、强校验 loader 4,231B、UI 1,880,906B / SHA-256 `375f1cd8…4d061`）。加入赖场回归后的当前全量测试为 234/235，唯一失败仍是修复前已存在的「GAL 回复落盘后释放本地提交锁」测试定位正则，与本轮远程交付及赖场修复无关。r95 未上传、未正式写卡；真实 SillyTavern 验收待执行 |
| 角色来访生命周期 | 2026-08-08 完成两轮“赖场”修复并通过独立离线验收：模型在场回执保留仍在场角色的 `visitor_meta`、固定事件只为真正新增角色生成事件 meta、deferred 计划可恢复、邀请结果不再谎报、固定结算写盘前统一协调、`planned_departure_serial=0` 可正常离场。聚焦测试 15/15；项目全量 234/235，唯一失败为预存 GAL 源码正则测试。旧存档已丢失的 meta 不追溯恢复；真实 SillyTavern 实机验收待执行 |
| 角色人设世界书 | 第一版八名固定角色均已完成完整人设扩写，并继续各占一个独立绿灯条目，连同八条基础世界书共 16 条。米斯蒂娅已补齐老板娘／歌手、料理与账目反差、夜雀能力及撤离型战斗逻辑；咲夜已补齐潇洒与天然、对蕾米莉亚的主动忠诚、时间／空间／飞刀／料理及能力边界。所有者私设与原作资料分层标注；人设内部增加小节不会增加世界书条目数。八人仍待真实对话统一复核语气密度、关系递进、能力尺度和提示预算 |
| 道具绿灯世界书 | 新增 `item-greenlight.v1` 路由表（`src/lorebook/item-routing.json`）与 8 条道具世界书（`src/lorebook/items/*.xml`）：振动棒、跳蛋（无角色限定，写明适用范围），金币·钓饵（限灵梦）、青蛙诱饵／冰之玩具（限琪露诺）、梦境菇·同步／服从之页（限魔理沙）、人偶化·暂停（限爱丽丝）。条目由 `GSK_ITEM_*_ACTIVE` 绿灯标记按 `scene_item_context` 登记加载，与角色绿灯同构（注入【道具档案绿灯】段、防递归诱发）；打包条目 id 从 18 起，`lorebook_entries` 现为 25（17 基础／角色 + 8 道具）。效果限定只在条目内容层约束模型，代码级强制未做 |
| 怀表·时停（r81） | 十六夜咲夜的怀表是世界书 26 条中的 `[mvu_plot][special]` const 常驻条目（`src/lorebook/items/sakuya_watch.xml`，entry 16），不依赖场景道具绿灯。使用后 `key_items.sakuya_watch.time_stop_active=true`，`buildPromptContext` 注入【时间停止】段（角色定身、不能主动行动/说话/反应，玩家可自由行动，不替被定身角色编写反应）；`advanceOneTimePeriod` 跨时段自动复位（时停只持续当前时段）。一天一次、战斗不可用、可留下时间痕迹触发调查事件 |
| 跨对话记忆（r80） | `interaction.conversation_log`：string[]，**所有角色共用一个数组**，每条格式 `角色ID: 一句话摘要`（≤120 字），由模型每轮在 UpdateVariable 中追加；schema `list(text('',120),24)` 为**追加+截断 FIFO**——新条目追加到末尾、不覆盖旧条目，超过 24 条时最旧被挤出。结束对话不清空；重新开场时 `buildPromptContext` 取尾 6 条、按在场角色 ID 过滤注入【最近互动回顾：结束对话不会抹去这些记忆】段（不在场角色的条目不注入）。字段登记见 `src/schema/field-ledger.md` |
| 像素角色动画 | Alice、Cirno、Mystia、Nitori、Reimu、Sakuya、Suika 的 604 张所有者验收独立帧已按原字节归档，并生成 `209×209`、逐角色可变列的 `sequence-approved-v1` 图集接入庭园运行时；七人仅在移动时播放各自的 `80–110ms` 四方向序列，休息、转向预备、收步及 reduced motion 优先显示现有 `2×2` 四视图 turnaround 静态待机图，不播放待机切帧、呼吸或上下浮动；静态图按角色和朝向应用从素材透明包围盒实测得到的缩放、水平中心与脚底对齐参数，使其与对应动作帧保持同一视觉尺寸，加载失败时才回退动作图对应方向首帧。运行时已由固定横向往返升级为区域锚点周围的受限二维随机巡游：每次选择一个上下左右单轴长程，单段距离为 `0.034–0.080`，典型移动约持续 `2–5s`；抵达后保持朝向、收步并强制休息，再生成下一次行动。加载失败自动回退旧 V2 或旧四帧图集。Cirno 使用独立方向锚点，Suika 保留 `y≈313` 源锚点和已修正的背面顺序。魔理沙本批无序列，继续使用 V2 r2，停止时同样使用 turnaround 对应朝向站姿。旧 `sequence-v1` P0 候选未覆盖。详见动画专项文档 §13.7 |
| 庭园地图分层 | 2026-08-08 底图升级为 v4 拼接版 `garden-base-owner-v4.webp`（1672×1722：v3 底图 1672×941 于 (0,0) + 下段新图 1672×941 于 (0,781)，由 `scripts/stitch-map-layers.mjs` 确定性合成，PNG 维护源同目录，SHA-256 见 `project/map-stitch-2026-08-08.json`）。中央主屋继续直接复用底图。13 张 V3 正常设施形态按四组共享透明画布接入，登记独立尺寸、渲染中心、角色落脚点、标签锚点与精确命中多边形；损坏形态由三组共享废墟替换图提供。导航蒙版 `garden-no-walk-mask-v1.svg` 画布随 v4 扩展至 1722，旧河道/池面/桥面形状坐标保持；下段新图区域（y 941–1722）未登记阻挡、待所有者确认；重叠带 y 781–941 保留原河道阻挡。区域归一化坐标 `src/ui/garden-spatial.ts` 已按 941/1722 重算（视觉位置不变）。v4 尚未打包、未上 R2、实机验收待执行；v3 原图保留为合成源。详见 `project/map-stitch-2026-08-08.md` 与 `project/garden-navigation-mask-contract.md` |
| 前端视觉入口 | 顶栏只保留「幻想乡案内」入口；打开原生单例大面板后，以大尺寸平滑插画卡进入符卡副本、灵梦小店与背包，开放庭园／全屏／设置作为次级操作。角色点击菜单为八名登记角色统一提供一次“摸摸头”与本地「符卡对战」；后者不消耗道具，战后用弹窗明确结算杂鱼标签（胜利减一、失败加一，标签降低后续对战强度）。设施“查看”只显示文字详情；背包为独立道具袋视图（每页 4 件，翻页控件）；GAL 道具选择为御札式选择槽（每页 6 件，长按看详情，怀表可即时使用）。符卡副本选关为单卡居中的横版关卡公告卡。浏览器缩放补偿只服务角色小人与目标菜单，地图滚轮缩放保持锚点语义 |
| 教程与测试 | “开放庭园”从正式 `stat_data` 派生 11 步教程进度、当前步骤和下一步说明，不另存 UI 进度；测试快进扩展为分组控制面板，覆盖 7 个教程断点、M1/M2 场景、道具恢复以及八名角色单独／全员进庄园和清空在场状态 |
| GAL 视觉 | 舞台使用 `gensokyo-gal-shrine-background-v1.png`；顶部新增小型“历史”按钮并复用既有滚动弹窗。新玩家消息以 `gensokyoUserVisibleText` 元数据区分真实可见输入与程序提示：手动输入显示原文、建议回应显示按钮文字，自动设施／事件提示不冒充玩家发言；旧聊天采用保守净化兼容。所有文本以 `textContent` 渲染，关闭弹窗后焦点返回入口。LLM 表现协议、`scene.v1` 与庭园正文继续支持 `normal / nude / sexual` 三值 `visual_mode`；真实 SillyTavern 的历史净化、键盘焦点、逐表情与窄屏仍待执行 |
| 弹幕战视觉／音效 | etama3 敌弹图集按 shape×hue 绘制并保留几何回退；自机普通／专注射击使用米白纸符、深色描边、红／青符印、金色顶签与双尾带，不再复用敌弹式辉光椭圆；P 点保留红方块白像素 P，并增加独立四角拾取框。固定三副本与任意角色符卡对战均使用独立 Boss 四状态图集及 S0／S1／S2 cut-in；花妖核心与蓝／金双帧妖精 sprite 已接入。14 个事件 WAV 通过应用级 WebAudio 总线播放；战斗弹窗可暂停，并通过内置“音频设置”分别控制音效、BGM 曲目和 BGM 音量。BGM 目录当前仅有三首 `source_url:null` 模板，未来只接受 HTTPS R2 曲源，缺曲静默且不阻塞模拟；偏好只存本机。手机拖动自动射击、双指专注、双击 Bomb 与桌面键盘语义保持。模拟、碰撞、结算和 `BattleResult` 未因视觉／音频设置改变；真实 SillyTavern 的音频权限、纸符可读性、四状态、cut-in、妖精动画、多点触控和宿主缩放仍待验收 |
| 素材发布 | 唯一桶 `hxxwy` 的当前不可变 release 为 `0.2.0-r62-0e5ecacdee9f`：114 个素材共 54,971,703 bytes，manifest 最后上传；113 个对象通过 HEAD 元数据校验，SVG 通过 GET 字节与 SHA-256 兜底，琪露诺更新 WebP 完整 GET 哈希匹配，公网 manifest 与本地逐字节一致。声明哈希为 `0f068864…5a8965`。轻量包最后一次构建必须显式使用该 manifest；详见 `project/r2-packaging-runbook.md`。旧 release 暂不删除，因为 r56–r61 仍固定引用 `0.2.0-r55-1ef0d7d6cbab` |
| 活跃工作线 | ①修复战斗素材普通预加载与 anonymous CORS atlas 的缓存模式冲突，新增顺序回归测试并发布新的不可覆盖 release ②在浏览器与真实 SillyTavern 复验玩家、Boss、敌弹、特效、妖精贴图及首次手势解锁、暂停恢复、音效／BGM 分轨、缓存和断网回退，之后再决定是否关闭 `r2.dev` ③机遇卡、对战卡与杂鱼标签阶段 A–C 已完成，等待正式卡面／小鱼干素材并验收胜败分流 ④按设施清单验收共享废墟、命中和缩放 ⑤R11–R16、弹幕和 M1/M2 集中实机验收欠账 ⑥道具绿灯世界书 8 件已完成（含仅对爱丽丝生效等限定），等待真实 SillyTavern 导入验收限定效果；服从之页／人偶化等限定的代码级强制未做 |
| 目标环境 | SillyTavern 1.18.0 + Tavern Helper 4.8.19 + MagVarUpdate（固定 commit） |

## 3. 导航表：想了解什么 → 读哪个文档

### 3.1 宪法层（改任何东西前必读，不可违背）

| 想了解 | 读 |
|---|---|
| 所有权边界、必须/禁止成立的全部红线 | `project/contract.md` |
| 在场角色同步（presence_snapshot / GensokyoPresence 回执） | `project/presence-sync-contract.md` |
| 角色登场／退场与“赖场”问题的审计、修复计划及验收证据 | `project/character-arrival-departure-audit.md` → `project/character-lingering-fix-plan.md` → `project/character-lingering-fix-implementation-log.md` |
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
| Cloudflare R2 本地预检、staging、CORS 模板与部署交接 | `project/r2-deployment-readiness.md` |
| 从素材 staging、R2 上传到轻量角色卡打包的逐步命令与删除规则 | `project/r2-packaging-runbook.md`（打包／上传前先读） |
| 战斗 BGM 曲目模板、R2 URL 填写与缺曲回退 | `project/battle-bgm-r2-template.md` |
| GAL 正常／全裸／成人姿势变量、稳定抽卡与 R2 滚动卡池 | `project/gal-portrait-variable-and-r2-pool-plan.md` |
| 成人体位图片固定名称、灵梦缺图首发与后续只更新 R2 的操作合同 | `project/nsfw-pose-live-asset-naming-plan.md` |
| 灵梦首批成人 CG 的本地审计、台账、客户端前置与 R2 live 上传／回滚计划 | `project/nsfw-cg-r2-live-update-plan.md` |
| 面向后续主 Agent／子 Agent 的成人 CG 逐步执行手册、命令、停止条件与报告模板 | `project/nsfw-cg-agent-execution-runbook.md` |
| 机遇卡、任意角色对战卡、杂鱼标签与胜负分流 | `project/opportunity-duel-card-plan.md` |
| M1 集中实机验收清单（未执行） | `project/r37-acceptance-checklist.md` |
| M2 所有者验收清单（未执行，含 9 个测试快进按钮用法） | `project/r45-owner-acceptance-checklist.md` |

### 3.4 源码侧文档（改状态/世界书/素材时查）

| 想了解 | 读 |
|---|---|
| 每个 MVU 字段的类型/写入者/上限/迁移 | `src/schema/field-ledger.md` |
| 世界书条目路由（进剧情阶段还是变量阶段） | `src/lorebook/routing-plan.json` + `model-projection.md` |
| 角色人设源、绿灯路由与扩写进度 | `src/lorebook/characters/*.xml` + `src/lorebook/character-routing.json` + `project/agent-handoff.md` 顶部 |
| 道具世界书条目路由与生效限定 | `src/lorebook/items/*.xml` + `src/lorebook/item-routing.json` + `src/ui/item-greenlights.ts` |
| 素材清单与评审流程（approved / pending-unified-review） | `src/assets/asset-manifest.json` |
| 商店商品与解锁门 | `src/shop/catalog.json` |
| 符卡战配置结构与白名单 | `src/battle/configs/`（四份同构 JSON）+ `dungeon-registry.json` |
| 地图区域坐标与手描轮廓（换底图必须重描） | `src/ui/garden-spatial.ts` |

### 3.5 历史留档（不必通读，追溯回归原因时按需检索）

- **runtime-report 系列**：只保留仍被 `manifest.json`／交接索引引用的里程碑报告，以及当前仍待实机验证的候选报告；更早且无引用的重复报告已清理。
- **规划文档**（`r29-r37-m1-expansion-plan.md`、`r38-r45-m2-*`、`r19-r20-greenhouse-completion-plan.md`、`gal-interaction-plan.md`、`same-layer-refactor-plan.md`）：保留仍承载产品决策或长期架构合同的来源；其中 `same-layer-refactor-plan.md` 仍是壳层设计的长期参考。
- **施工日志**（`r38-r45-implementation-log.md`）：仍被测试和交接引用，保留作为实现追溯依据。
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
npm test                      # node --test，当前 214 项
npm run build:ui              # esbuild 打包 + 素材内嵌 → dist/
npm run check:assets:r2       # R2 活动素材、调度元数据与发布边界预检
npm run package:checkpoint:dry  # 打包演练（不落盘成品）
npm run package:checkpoint    # 正式打包（需所有者授权；拒绝覆盖已有检查点）
npm run preview               # 本地预览 http://127.0.0.1:8765/ui/index.html（注意必须带 /ui/ 路径）
```

修改维护源后的固定顺序：轻量包必须执行 `check:ui → test → build:ui:remote -- --ui-version=rN → package:checkpoint:dry`，绝不可在打包前运行裸 `build:ui`。`build:ui:remote` 已固定 `--ui-delivery=remote`，但仍要求显式提供未占用的 `--ui-version=rN`；同名版本化 UI 内容不同时会拒绝覆盖。`package:checkpoint` 已固定 remote UI 交付，并校验版本化副本与当前 UI 逐字节一致、remote-r2 素材模式及 10 MiB 停止线；要新检查点时先把 `package.json` 两个脚本与 `project/manifest.json` 指针升到未占用的 rN。详见 `project/r2-packaging-runbook.md` 的“轻量角色卡强制门禁”。

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
3. 动手前与收工前各跑一遍离线门禁；若基线已有失败，记录精确测试名与原因，不得把既有失败归到本轮，也不得写成“全绿”。当前离线基线为 234/235；唯一已知失败是「GAL 回复落盘后释放本地提交锁时，重新渲染道具选择器」测试无法定位提交收尾，属于远程 UI 与赖场修复前已存在的问题。
4. 文档更新纪律：状态变化写 `agent-handoff.md` 顶部新条目；专项进展写对应 log；本文件只在"导航结构或项目形态变化"时更新。
