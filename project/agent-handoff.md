# Agent 交接文档

> 2026-07-29（二十三，大型功能入口面板）：按所有者反馈，将顶栏中被压缩的符卡副本／灵梦小店／背包三张图片入口收拢为单一「幻想乡案内」按钮；点击后打开原生单例 dialog，大面板内展示三张大尺寸玩法卡与开放庭园／全屏／设置次级操作。三张源图仍走既有预览和自包含 data URL 链，但面板内明确改为 `image-rendering: auto`，不再参与地图像素素材与浏览器缩放补偿链。所有入口关闭面板后调用原有商店、背包、副本和机会页函数，不新增状态源或业务分支。桌面实测三卡约 `268×250`，`390×844` 下为 `347×138` 横向大卡，`320×720` 无横向溢出；大按钮进入灵梦小店的现有路径验证通过，控制台无警告／错误。`check:ui`、`npm test`（134/134）和 `build:ui` 全绿。规划见 `project/large-entry-panel-plan.md`。**未打包，未做真实 SillyTavern 的类名改写、重挂载、缩放与焦点返回验收**。

> 2026-07-29（二十二，旧素材归档）：完成全项目图片与制作产物引用审计。将 569 个素材／元数据文件（约 279.71MB）及 7 个仅服务旧试作的脚本，按原相对路径移动到 `旧素材/`；主要包括地图生成候选与重复副本、26 张已被 v2 取代的设施 v1 图、取消的四张角色菜单图、Alice/Cirno/Reimu/Sakuya 旧动画试作、Marisa 与旧 sequence 的 QA 预览、未登记樱花地标候选。当前 asset manifest 的 117 个素材／描述路径全部存在；approved 序列、`最终版` 原始输入、测试使用的 `sequence-v1`、运行时 fallback、chroma 维护源与历史 dist 均未移动。归档说明见 `旧素材/README.md`。归档前后 `check:ui`、`npm test`（134/134）、`build:ui` 全绿；checkpoint dry-run 字节数与 SHA-256 保持 `115260989` / `1a2bbf07…45c82`，证明当前交付语义未改变。未正式打包、未实机验收。

> 2026-07-29（二十一，三副本 Boss 战斗图接入）：所有者提供琪露诺、爱丽丝、咲夜三张 `1254×1254` 四状态战斗图。原图为 RGB 黑底；按 imagegen 技能流程生成平坦洋红色键控底，再以保守硬阈值派生透明 PNG，避免通用软蒙版误伤肤色、金发和银发。三套透明图及 chroma 维护源已归档到 `src/assets/battle/boss/`，asset manifest 登记为 `owner-provided-integrated-pending-runtime-validation`。atlas 新增三类 boss sheet 与四宫格裁切，渲染器按 `presentation.boss_id` 选择琪露诺／爱丽丝／咲夜，四格依次用于待机、施法、受击、击破，加载失败仍回退温室妖花。构建器、宿主 dataset 与 app atlas source 链已补齐。`check:ui`、`npm test`（134/134）和 `build:ui` 全绿；本地浏览器已实跑妖精练习至琪露诺到场，尺寸、锚点、透明背景正常且无控制台警告／错误。**爱丽丝／咲夜尚未逐场目视，三张源图放大时可见轻微洋红边缘，实际战斗缩放下不明显；未打包，未做真实 SillyTavern 验收**。

> 2026-07-29（二十，地图全形态接入收口）：所有者对九种补充形态、三张损坏覆盖层及四组叠图回复“全过”。新底图 `garden-base-owner-candidate-v2.png`、四座设施全部正式 `-v2` 形态和三张覆盖层已登记到 asset manifest，并通过 `project/manifest.json`、构建器和 `GardenMap` 进入离线预览／自包含运行时。四座设施使用独立归一化渲染中心、落脚点、标签点和命中多边形；旧主屋保留旧回退位置，底图背景房屋不转成交互对象。设施命中优先级改为角色 → 精确设施多边形 → 旧区域圆形，避免中央庭院抢点击。宽屏 `1440×1000` 与窄屏 `390×844` 已做离线视觉检查，`check:ui`、`npm test`（134/134）和 `build:ui` 全绿。**未打包、未覆盖 `0.2.0-r54`，真实 SillyTavern 的点击、拖放／缩放菜单跟随、损坏层和宿主窄屏仍待验收**。

> 三个异常关闭任务的可执行续接清单统一见 `project/interrupted-work-recovery-2026-07-28.md`；后续 Agent 应先按工作线阅读对应章节，再查看当前未提交差异。

> 2026-07-29（十九，GAL 背景与姓名牌收尾）：所有者提供的 `ChatGPT Image 2026年7月29日 01_10_32.png` 已按原字节归档为 `src/assets/ui/gensokyo-gal-shrine-background-v1.png`，SHA-256 `b1b998f50219824af4340e70285097534c3355e3ebd98bd813ed1b2d0745df44`。素材登记在 `asset-manifest.json/ui_assets.gal_shrine_background`；`build-ui.mjs` 为离线预览复制文件并为内嵌构建生成 data URL，宿主再通过 `data-gal-background-src` 传入 iframe。GAL 舞台改用该图，旧 CSS 月亮和雾气／底部条纹层已禁用。姓名不显示的根因是 `.gg-scene-speaker` 原先位于带 `clip-path` 的对白框外侧而被裁掉；现已增加对白框顶部内边距并把姓名牌移到框内（桌面 `top:.72rem`，窄屏 `.65rem`）。`check:ui` 与 `build:ui` 通过，源与 dist 背景哈希一致；`npm test` 为 132/133，唯一失败是地图契约仍硬编码旧底图文件名，而 manifest 已切至 `garden-base-owner-candidate-v2.png`，与本轮 GAL 变更无关。**未打包检查点，未做真实 SillyTavern 验收**。

> 2026-07-29（十八，交互与验收工具连续优化）：角色／设施目标菜单缩小，并在渲染前过滤与关闭按钮重复的 `close/leave` 动作；设施“查看”模式隐藏图片且清空 `src`，其他设施行动仍保留视觉图。背包改为独立道具袋视图；开放庭园页面从正式状态派生教程完成数、当前步骤和下一步；测试快进扩成分组控制面板，覆盖七个教程断点、M1/M2、道具恢复和八名角色单独／全员入园及清空在场。浏览器缩放新增角色与菜单视觉补偿，地图滚轮缩放仍维持独立锚点；小店／背包／符卡三入口放大下移，旧外层 `gg-header` 黑边移除但内部 HUD 保留。琪露诺待机帧按方向做亮度校正，GAL 使用道具控件改为御札式选择槽。以上均只有维护源、契约测试和离线构建证据；实机应重点检查 100%／125%／200% 缩放、320px、移动中菜单跟随、键盘焦点、重挂载与真实资源注入。

> 2026-07-28（十七，角色菜单视觉定稿）：按所有者新决定，角色点击菜单不再采用四张徽章图片。已从 `scripts/build-ui.mjs`、宿主 `data-*` 和 `app.ts` 移除 `target-action-*.png` 的复制、base64 内嵌与运行时读取；原 PNG 仅保留为本地历史参考，不删除。`createBubbleButton()` 现在只创建受控文本符号节点，CSS 以御守圆章、顶部结绳、虚线内圈、纸札和四套语义配色绘制对话／摸头／任务／离开图案；按钮实际行动名、可见禁用原因、桌面半环与窄屏网格保持不变。契约测试已改为断言构建与宿主不得再出现徽章图片资源链。`check:ui`、`npm test`（125/125）和 `build:ui` 全绿；本地浏览器已实看角色菜单与区域菜单，无控制台警告／错误。**未正式打包，仍需真实 SillyTavern 复查动态类名样式、移动锚点、键盘焦点与 reduced-motion**。

> 2026-07-28（十六，角色菜单徽章续接）：四张 `target-action-{talk,leave,pat-head,quest}-v1.png` 已接入 `scripts/build-ui.mjs` 的离线复制与自包含 data URL 链，并由宿主注入 iframe `data-*`。`src/ui/app.ts` 仅从既有 `TargetAction` 派生 `talk / leave / pat-head / quest` 纯视觉类别：`close/leave` 为离开，`pat_head` 为摸头，登记事件／设施／战斗入口为任务，其余为普通对话；未修改动作注册表、剧情条件、角色移动、bridge 或结算。原不透明图通过 CSS 柔边徽章容器显示；桌面半环半径随 3–6 个按钮扩展，窄屏 390px 双列、320px 单列，触控目标不小于 44px；任务徽章下仍保留“检查结界／观察旧地基”等真实标签，禁用原因增加可见文本。新增资源链、语义与响应式契约测试；`check:ui`、`npm test`（125/125）和 `build:ui` 全绿。本地浏览器已检查桌面、390px、320px，无控制台警告／错误；**尚未正式打包，仍需真实 SillyTavern 复查类名改写、移动中锚点跟随、键盘焦点与 reduced-motion**。

> 2026-07-28（十五，异常任务恢复）：已读取 UI 优化任务 `019fa84a-b6ab-7eb2-a85b-00afcb9ffdb5`。灵梦小店入口／商店 4:3 底图与十槽界面、魔理沙背包入口均已完成并通过此前本地预览；符卡副本入口 `reimu-dungeon-button-v1.png` 已接入预览与内嵌资源链，本地曾验证为约 `87×72px` 且点击仍打开原副本框。该任务中断在临时色键文件清理后的最终收尾之前；恢复后重新执行 `check:ui`、`npm test`（124/124）和 `build:ui`，当前全绿，未发现符卡按钮专用色键临时文件残留。另有四张角色点击菜单素材 `target-action-{talk,leave,pat-head,quest}-v1.png` 已归档，但对应改造只完成方案：桌面半环大徽章、窄屏徽章网格、任务徽章保留具体剧情名；**尚未修改 DOM/CSS，也未改 `TargetAction`、剧情条件或结算逻辑**。

> 2026-07-28（十四，异常任务恢复）：已读取地图优化任务 `019fa8d9-05bc-7173-b17a-fd5212f30226`。在所有者提供的 `1448×1086` 新底图候选上，已生成基础魔法温室、四季花境、露天月见汤、灯火夜市四张 `1254×1254` RGBA 风格样板并完成透明边缘、色键残留、入口朝向与确定性叠图检查；所有者回复“看上去不错，开始下一步”，故风格校准门视为通过。中断发生在“下一步”刚开始、尚未继续生成其余形态时。样板仍位于 `src/assets/world/map-facilities/new-map-style-v2/`，没有登记 `asset-manifest.json`、没有替换现运行时素材；后续应以这四张为风格／占地锚，补齐其余形态与三张损坏覆盖层，再统一校准落脚点、缩放、命中多边形与标签锚点。

> 2026-07-28（十三，异常任务恢复）：已读取像素移动任务 `019fa8e5-2662-7af0-804f-f151564f5a80`。二维随机巡游、强制休息、turnaround 四视图静态待机、待机／移动视觉尺寸对齐，以及单段距离增至 `0.034–0.080` 均已完成并已写入下方（九）至（十二），没有遗失的动画代码步骤。该任务最后被中断的实际请求是角色点击菜单视觉改造：四张 `1024×1024` 不透明图分别映射对话、离开、摸头和任务，计划以柔边大徽章接入，任务类继续显示“检查结界／观察旧地基”等具体标签；当时尚未产生文件改动。不要误把这项 UI 方案记作已完成的动画工作。

> 2026-07-28（十二）：二维随机巡游的单次移动已再次加长，避免角色频繁“动一下、停一下”。共享距离从初版 `0.012–0.035` 提升到 `0.034–0.080`；八名角色水平活动半径扩大到 `0.090–0.110`，步行／浮游垂直半径分别扩大到 `0.065/0.075`。速度保持不变，因此一次移动通常持续约 `2–5s`，抵达后的转向、收步和强制休息规则也保持不变；目标继续受区域锚点周围椭圆边界约束。新增配置合同测试。`check:ui`、`npm test`（124/124）、`build:ui`、r54 dry-run 全绿；dry-run 107,582,225 bytes，SHA-256 `beecd738…a266`。**未正式打包，仍需真实 SillyTavern 观察多角色同时长程巡游时的区域边界、遮挡和点击体验**。

> 2026-07-28（十一）：修复 turnaround 待机图与移动动画切换时人物忽大忽小。根因是两套素材虽绘制到同一目标方框，但 turnaround 单格为 `627×627`、正式动作帧单格为 `209×209`，透明留白比例不同。现已按八名角色四个朝向的透明主体包围盒实测 `scale/x/y`，在 `SpriteActor` 的本体与轮廓发光绘制中共用变换，使待机视图的可见高度、水平中心和脚底线与对应动作首帧对齐；原 PNG 未修改，仍保持最近邻绘制。新增变换合同测试。`check:ui`、`npm test`（123/123）、`build:ui`、r54 dry-run 全绿；dry-run 104,472,990 bytes，SHA-256 `4a949821…8a75`。本地预览已观察灵梦、魔理沙多次移动／休息切换，尺寸与落脚点稳定且无控制台错误；**未正式打包，仍需真实 SillyTavern 验收全部角色和窄屏缩放**。

> 2026-07-28（十）：像素角色的停止表现已改为复用现有四视图 turnaround 静态待机图。`SpriteActor` 在休息、转向预备、收步和 reduced motion 状态优先按 `front/back/left/right` 读取 `2×2` turnaround 对应格，只有静态图加载失败时才回退动作序列或 V2 的当前方向首帧；移动期间仍播放已验收动作序列。因此强制休息不再停在走路姿势上，也没有重新引入待机切帧、呼吸或上下浮动。新增契约测试覆盖四方向格位、非动画标记及加载失败回退。`check:ui`、`npm test`（122/122）、`build:ui`、r54 dry-run 全绿；dry-run 104,470,573 bytes，SHA-256 `92347b1d…966a`。**未正式打包，仍需真实 SillyTavern 观察移动收步到 turnaround 站姿的视觉衔接**。

> 2026-07-28（九）：庭园 NPC 巡游由固定横向往返升级为受限二维随机行动。`SpriteActor` 现在在区域锚点周围的椭圆范围内按单轴随机选择 `front/back/left/right`，通过 `rest → turn → travel → settle` 状态推进；每次抵达后保持当前朝向，收步并强制休息 `760–2200ms`，不再立刻反向。普通 MVU 刷新只更新权威朝向，不覆盖正在进行的本地巡游；离场、换区和 reduced motion 会回到区域锚点并清除旧目标。`GardenMap` 已接入 `offsetX/offsetY`，点击热区、轮廓光晕和气泡锚点继续读取实际绘制位置。新增确定性测试覆盖四方向、单轴目标、椭圆边界、强制休息和刷新朝向保护。`check:ui`、`npm test`（121/121）、`build:ui`、r54 dry-run 全绿；dry-run 104,470,212 bytes，SHA-256 `02ad1417…87c2`。本地预览已观察到前后与水平移动及抵达停顿；**未正式打包，仍需真实 SillyTavern 验收长时间随机分布、移动中点击跟随、后台恢复、窄屏与 reduced motion**。

> 2026-07-28（八）：地图设施第一阶段优化完成。修复三座可换型设施英文素材键与中文 `current_form` 不匹配的问题；主屋和魔法温室启用地图图层；五座设施全部登记显式 `area_id`，主屋按区域状态选损坏／修复图，温室四种正式形态当前共用已验收 operational 图，三座 M2 设施保留损坏覆盖层。构建器会对重复素材源去重，避免 Windows 并发复制文件锁；离线预览现由 asset manifest 注入新版空底图和设施图层，不再误用旧建筑底图。另补齐稀疏离线状态的设施验收快进初始化。类型检查、`npm test`（117/117）、`build:ui`、r54 dry-run 全绿；dry-run 100,043,565 bytes，SHA-256 `7da6554c…6727e`。本地浏览器已检查初始损坏主屋及五设施全建成状态，宽／窄视口均无控制台错误；**尚未正式打包，仍需真实 SillyTavern 校准锚点、比例和命中边界**。

> 2026-07-28（七）：按所有者要求取消全部运行时待机动画。七名 `sequence-approved-v1` 角色停止时固定显示当前方向第 001 帧；魔理沙 V2 停止时固定对应方向站姿；不再切换待机帧，也不做程序化呼吸、缩放或上下浮动。asset manifest 已移除 `dedicated-idle`／`procedural-idle` 待办，并统一已验收角色状态。离线门禁 `check:ui`、`npm test`（116/116）、`build:ui`、r54 dry-run 全绿；dry-run 为 84,548,905 bytes，SHA-256 `ab6bb4cf…74e55d`。审视同时确认：扩大庭园底图已替换；三座可换型设施的素材键为英文而运行态 `current_form` 为中文，当前贴图无法选中；主屋与魔法温室素材尚未接入地图且锚点命名不兼容；r54 输出位已占用，正式打包前须修复地图映射、选择新检查点并完成 SillyTavern 实机验收。本轮未正式打包、未删除素材。

> 2026-07-28（六）：所有者提供并确认 `F:/agent airp/卡/参考素材/New project 11` 为七名角色的完整验收项目，已完成正式接入。604 张验收独立帧按原字节复制到 `sequence-approved-v1/source/`，以角色级统一最近邻缩放和固定锚点生成 `209×209` 帧及 `N×4` 图集；Cirno 使用四方向独立源锚点，Suika 保留 `y≈313` 锚点及已修正的背面正序。运行时速度采用验收 GIF 实值：Alice 90、Cirno 100、Mystia 80、Nitori 90、Reimu 110、Sakuya 100、Suika 100ms。`SpriteActor`、registry、asset manifest、构建器和宿主已支持可变长验收序列优先加载；失败时回退旧 V2/旧图集，魔理沙继续 V2 r2。旧 `sequence-v1` 候选未覆盖。新增可 dry-run 的导入脚本和逐源哈希/图集逐格一致性门禁；`check:ui`、`npm test`（115/115）、`build:ui`、r54 dry-run 全绿，dry-run 预测自包含 JSON 为 84,549,297 bytes。尚未正式打包，也未在真实 SillyTavern 做地图尺度、方向切换与光晕锚点验收。

> 2026-07-28（五）：所有者已选择“最终版”序列统一按 `90ms` 预览，并要求修正前后方向脚部误删、灵梦绿幕残留、萃香道具内部白块与腿间白底。蒙版管线已升级为 `connected-edge-plus-interior-islands-v2`：放宽主体附近小组件保留以保护脚尖/鞋跟；绿幕强清理；灰白背景只清理至少 48 个原始像素的内部同色岛；黑底禁用全局内抠以保护黑色轮廓。期间补入荷取 `001`–`022`，当前七名角色共 151 张原始合帧，已重建 604 个透明方向帧、7 张 `N×4` 图集、7 份 manifest 与 7 个 `90ms` 总览 GIF；旧 `110/130ms` 预览已清理。透明棋盘底与高反差洋红底接触表复核未再发现上述问题，咲夜白色发丝高光也得到保护。离线门禁 `check:ui`、`npm test`（112/112）、`build:ui`、r54 dry-run 全绿。**状态仍为 `generated-pending-owner-review`，未登记 asset-manifest / registry、未接入运行时、未正式打包**；下一步只做所有者 90ms GIF 美术复核，通过后再决定 P1 接入。

> 2026-07-28（四）：六名角色“最终版”可变长序列 P0 已完成，统一状态 `generated-pending-owner-review`。只读处理 129 张 `640×640` 四方向合帧，生成 516 个透明方向帧、6 张 `N×4` 候选图集、6 份可追溯 manifest 与 `90/110/130ms` 共 18 个真实来源总览 GIF；原件未覆盖。构建脚本为 `scripts/build-variable-character-sequences.mjs`，预览脚本为 `scripts/export-variable-character-sequence-gifs.py`，资产门禁为 `tests/character-sequence-assets.test.mjs`。自动 QA：可见高度 `138–150px`、统一底线 `y=179`、四角透明、原件 SHA-256 一致；离线门禁 `check:ui`、`npm test`（112/112）、`build:ui`、r54 dry-run 全绿。**尚未登记 asset-manifest / registry、未接入运行时、未正式打包**；下一步必须先由所有者查看三档 GIF 并逐角色确认透明边缘、循环和速度，通过后才开始 P1 爱丽丝垂直切片。

> 2026-07-28（三）：咲夜四向动作参考序列第二方案 `sequence-imagegen-v2`（逐图调用内置 imagegen，以当前帧锁动作、`sakuya-turnaround-v1.png` 锁身份）同样被所有者判定**验收不通过**，工作已立即停止。项目仅保留首张 `raw/001.png` 与失败说明；随后 `002–005` 的并行调用在完成前被中止，任何默认生成目录中的临时结果均未收进项目。统一状态为 `owner-rejected-imagegen-sequence-v2`；不得继续补齐 23 帧、不得登记或接入，也不得拿本轮 `001` 作为后续身份锚点。此前 v1 换色方案同样维持拒绝状态。

> 2026-07-28（二）：咲夜四向动作参考序列 v1 已生成 23 张 `720×720` 四向帧、Aseprite 母档与 `130ms` GIF，但**所有者验收不通过**。该批产物仅保留在 `src/assets/characters/sakuya/sequence-reference-v1/` 作为失败试作与方法对照，状态为 `owner-rejected-reference-sequence-v1`；不得登记 `asset-manifest`、不得接入 sprite registry 或运行时，也不得作为咲夜 V2 后续动作基线。后续返修必须重新确认失败点后另起版本，不能覆盖本批留档。

> 2026-07-28：独立设施地图素材第一轮已收束。现有五座地图对象均有独立透明素材：主屋（受损／修缮后）、魔法温室（已建成）、妖精花园／月见温泉／宴会广场（各三形态 + `damaged` 覆盖层）。后面三座的绘制链已接入维护源：构建器从 `asset-manifest.json.map_facility_assets` 嵌入透明图，宿主传入 iframe，`GardenMap` 仅在设施已建成且 `current_form` 有映射时绘制，并在 `facility_runtime.status=damaged` 时叠覆盖层；未知／未建成状态仍回退空地标记。离线门禁 `check:ui`、`npm test`（110/110）与 `build:ui` 均通过，所有者已验收视觉和离线接入；**尚未完成真实 SillyTavern 的锚点、缩放、命中边界与各状态截图验收**。R56 花见回廊、R57 缘侧书斋、R58 祈愿分社仍是暂名/暂定锚点的规划项，未生成素材。

> 2026-07-27（八）：琪露诺 `9×4` 指导版图集已获所有者验收；所有演示 GIF 的帧时长已按反馈从约 `95–100ms` 下调为 `130ms`。`pixel-character-animation-v2-plan.md` 的水平/垂直默认播放速度同步调整为 `130ms`（允许 `120–140ms`）。该素材仍未接入运行时。下一角色按登记顺序开始爱丽丝，先核对既有四向基准与步行动作，再走同一关键姿势→Aseprite→GIF 分组验收流程。

> 2026-07-27（七）：所有者裁定琪露诺 V2 **保持旧 `9×4 / 32 格` 合同**；前后 8 帧指导仍是已验收的动作参考，但向上/向下交付各砍回 `00 + 4`，固定取样 `F1/F3/F5/F7`。因而已开始的 `10×4 / 40 格` V3 图集与总览试作废弃，不能接入。`pixel-character-animation-v2-plan.md` §3.3 已改为“前后 8 帧指导的 V2 四帧适配”；下一步是按旧槽位完成 9×4 候选图集并导出真实总览 GIF 再验收。

> 2026-07-27（六）：所有者已验收琪露诺指导版的向下/向上 8 帧步行。母档为 `src/assets/characters/cirno/cirno-walk-guided-{down,up}-v1-work.aseprite`，演示为 `cirno-walk-guided-{down,up}-v1-demo.gif`；逐帧源位于 `guided-{down,up}-v1-frames/`。前后指导的文字版与配图已归档 `project/animation-guides/front-back-8-frame-walk-cycle-guide.{txt,png}`，并被 `pixel-character-animation-v2-plan.md` §3.3 设为后续角色前后移动的强制基线。琪露诺左右、向下、向上四个 8 帧动作组都已通过；尚未组装 `9×4` 总图集、未登记 registry/asset-manifest、未接入运行时。下一步是组装图集与总览 GIF 后再验收。

> 2026-07-27（五）：所有者已验收琪露诺的指导版水平 8 帧步行。左行母档 `src/assets/characters/cirno/cirno-walk-guided-left-v2-work.aseprite` 与 GIF `cirno-walk-guided-left-v2-demo.gif` 已归档；右行依所有者授权由同一 8 帧水平翻向，母档/演示为 `cirno-walk-guided-right-v2-work.aseprite`、`cirno-walk-guided-right-v2-demo.gif`。指导原件已入库 `project/animation-guides/8-frame-walk-cycle-guide.{docx,png}`，并已写入 `pixel-character-animation-v2-plan.md` §3.2 作为后续角色横向动画的强制步态基线。该批准只覆盖琪露诺左右行走；上下动作、完整 V2 图集、registry/asset-manifest/运行时接入仍未处理，下一步从上下动作开始。

> 2026-07-27（四）：所有者提供扩大视角的无设施庭园底图，已以 `src/assets/maps/garden-base-expanded-empty-v1.png` 接入维护源（1536×1024，SHA-256 `19a88b71…fd52fd`），由 `asset-manifest.json` 的 `maps.garden_base` 驱动构建，不再硬编码旧 `garden-base-spring-v1.png`。地图人物显示缩至旧比例 73%，设施占位光环缩至 76%；旧底图手描建筑轮廓已停用，后续设施必须使用独立透明贴图及登记 hit polygon/透明边界，不能复用旧描点。现有区域锚点与交互保留；设施贴图尚未接入。离线门禁：check:ui 通过、npm test 109/109、build:ui 通过、r54 dry-run 通过（37,420,011 字节，SHA-256 `b9124180…0e3cae`）；**未正式打包、未实机验收**。

> 2026-07-27（三）：魔理沙像素动画 V2 r2 已接入维护源。运行时图集 `src/assets/characters/marisa/marisa-animation-v2-r2.png`（`9×4` / `209×209`，由 `v2-hover-keyframes` 四方向 low/high 最近邻对齐合成悬浮循环）；母档 `marisa-animation-v2-r2-work.aseprite`；构建脚本 `scripts/build-marisa-v2-r2.mjs`。registry / asset-manifest / UI 契约测试已登记；旧 `riding-turnaround-v3 + hover-cycle-v1` 保留回退。离线门禁：check:ui 通过、npm test 108/108、build:ui 通过。**未打包、未实机验收**。欠账：Aseprite 手绘 in-between 精修、二维路径、其余六名角色 V2。记录见 `project/pixel-character-animation-v2-plan.md` §10。

> 2026-07-27（二）：所有者对设施扩展计划三项拍板：①R55 底座泛化确认执行；②契约修订已授权并写入 `contract.md`（「八名固定角色」改为首发名单+登记接入制、新增「新设施不得携带后置主线/全局前置/跨设施门票」红线，大妖精禁令保留）；③新角色素材**占位先行**——不再依赖灵梦 V2 试点验收，占位图集规格见计划 §4.4（主题色剪影、V2 版式 9×4、`status: placeholder` 登记、真素材原位替换零链路改动），真素材与动画后补按 r49 流程逐项勾销。R55（泛化）→R56 花见回廊→R57 缘侧书斋→R58 祈愿分社→R59 妖梦→R60+ 帕秋莉/早苗可依序开工；排期与验收欠账的取舍仍开放（计划 §9.4，默认 R55 先行）。本轮仅改文档（计划/契约/本文件），未改代码、未打包。

> 2026-07-27：新增规划文档 `project/r55-r60-facility-character-expansion-plan.md`——沙盒设施扩展与新角色引入线（纯规划，未施工、未改代码、未打包）。所有者方向确认：首批 3 座温泉式无主线沙盒设施（花见回廊/缘侧书斋/祈愿分社，暂名），用于承接后续新角色（推荐妖梦/帕秋莉/早苗，走「静水观测池引出咲夜」的装修 roll 初遇模式）并吸引人设相符的老角色；设施先行、角色二期。施工前置：R55 设施底座泛化（约 7 处三设施硬编码 + `moon_spring_session` 通用化，见计划 §5）。

> 2026-07-26（深夜）：所有者授权打包 —— `0.2.0-r54` 前端美化测试包已正式生成。产物 `dist/checkpoint-0.2.0-r54/幻想乡物语-测试检查点-0.2.0-r54.json`，SHA-256 `ee8587e7e67c832ac7d175c0eb3b58e625e4afc0640de67388fc246d3257ac73`，36,181,652 字节，UI 脚本 `gensokyo-garden-ui-020-r54`，16 条世界书。打包前门禁：check:ui 通过、npm test 108/108、build:ui 通过、dry-run 通过。r53 及更早 dist 均未覆盖。**r54 仍是离线候选，实机验收未执行**。项目总览导航见 `project/README.md`。

> 2026-07-26（晚）：前端美化专项 R1–R7 已在维护源（当前检查点线 `0.2.0-r53`）完成：设计 token 体系、符卡框语言、圆点→半环绕气泡菜单（含视角跟随）、开场页三轮重构（结界祭夜 + 所有者主视觉 base64 嵌入 + 全屏 + 移除魔法阵）、全阶段全屏（含启动首帧修复）、角色轮廓染色发光、区域底图手描轮廓发光、顶栏角色主题按钮、副本页弹幕夜空。离线门禁 106/106 全绿；**未打包、未实机验收**。方向与阶段见 `project/ui-beautification-plan.md`，逐轮施工与待办见 `project/ui-beautification-log.md`。r53 dist 目录已被占用，打包测试需先把 `package.json` 与 `project/manifest.json` 升到未占用的 r54 并重跑 dry-run。战斗/副本命名空间未越界（仅命名空间内底纹与金边）。

> 2026-07-26：R48 运行事务与调度热修复包已生成。产物为 `dist/checkpoint-0.2.0-r48/幻想乡物语-测试检查点-0.2.0-r48.json`，SHA-256 `04a2e920e9342104d170b50d5f4156b8575a72ce132f8830da23f8c704c95ea9`；R47 保留未覆盖。R48 修复最近设施换型封锁、副本时间推进后的宴会触发、异变卡代码原子启用、异变结算恢复、同步遮罩与会话记录。离线门为 81/81，等待所有者在 Luker 2.7.0 实机验收。

> 2026-07-25：R45 已按用户授权正式打包并进入所有者验收。产物为 `dist/checkpoint-0.2.0-r45/幻想乡物语-测试检查点-0.2.0-r45.json`，SHA-256 `70ce77350f66b89fb3b52eb460d5614e481f292b7b35e4a2590332aee56335c1`。设置页现有 9 个独立验收快进按钮；操作清单见 `project/r45-owner-acceptance-checklist.md`。离线门禁通过，真实 SillyTavern 验收仍待所有者完成。

## 当前交接点

- 2026-07-25 收尾修复已把此前仅存在于纯规则测试中的 M2 功能接入 app/bridge：异变启用与源头回执、每日调查/最终收束、三设施施工/换型/恢复、来访邀请与通知、温泉/宴会、场景道具成功后消费及收尾清理。
- 完整 `stat_data` 世界书条目现只进入 `[mvu_update]`；剧情请求由 UI 注入脱敏事实，普通剧情不再接收 `hidden_origin`。M2 本地根字段在每次 MVU 回复后恢复所有权并统一执行时间调度。
- 当前是已打包的离线验收候选，不是实机验收通过。最终门禁结果见 `project/r38-r45-implementation-log.md` 最新条目。

- 当前已验收运行基线仍为 `0.2.0-r32-extra-model-binding`；R32 的角色主世界书绑定、额外模型 `UpdateVariable` 路线与 MVU 写入已由所有者确认。
- 2026-07-25 所有者授权在维护源连续推进 M2（R38–R45）。维护源已实现开放庭园、背包、来访调度、自定义七日异变、三后续设施、场景道具与 R45 离线候选准备。
- **R37 真实 Luker 集中验收仍未执行**；M1 不得标记 complete。M2 也不得标记 complete。
- 最新离线门禁：`npm run check:ui` 通过、`npm test` 56/56、`npm run build:ui` 通过。
- R45 dry-run（未正式写入 dist 成品授权包）：检查点 `0.2.0-r45`，SHA-256 `c7c5d497136fe122d6c71c3746cbe02a9c7938940eba53d999fb7526cc42cfc4`，约 `30,141,017` 字节，UI 脚本 `gensokyo-garden-ui-020-r45`，16 条世界书。正式打包仍需所有者明确授权。
- 历史 R37 正式包仍保留于 `../dist/checkpoint-0.2.0-r37/`；不得覆盖。R34 成品继续冻结。
- 施工日志：`project/r38-r45-implementation-log.md`。

## R31 内容与 R32 基础设施修复

- 已在源代码实现 `0.2.0-r31-marisa-free-growth`：温室菜单的“整理自由生长方案”是单回合 `progression_fixed` 事件；仅在妖花核心已结算、基础温室仍存在且没有其他主要事件时出现。
- 本地白名单结算只登记 `自由生长型温室` 到 `unlocked_forms`，并记录魔理沙合作事实；不施工、不改 `current_form`、不扣资源、不推进时间、不激活异变。
- 夜晚、魔理沙在场时显示“夜间观察”自由支线；它不带受控事件标记，可多轮交流，不能解锁方案或主线。
- 已生成独立 R31 候选：`../dist/checkpoint-0.2.0-r31/幻想乡物语-测试检查点-0.2.0-r31.json`，SHA-256 为 `960249eef27a91252c694828699eea60329b6dcabae3e3553fcb9a4f267de419`，UI 脚本 ID 为 `gensokyo-garden-ui-020-r31`。
- 旧的同名 R31 预重组包未被覆盖，已按哈希归档为 `../dist/checkpoint-0.2.0-r31/superseded/幻想乡物语-测试检查点-0.2.0-r31.pre-extra-model.4952371b.json`。
- R31 自由生长型维护源已包含在 R32 运行包中；自由生长方案、额外模型变量更新路线、固定事件的魔理沙本地入场和草稿泄露下的 `GensokyoPresence` 回执解析均已通过所有者验收。夜间观察保持为无强制离场规则的自由支线。

## 本轮已完成

### 0.4 R33/R34 内容与事件架构收口

- R33 `alice_greenhouse_maintenance_proposal` 与自由支线 `alice_doll_workshop_chat` 已进入维护源；方案登记、爱丽丝入场、关系事实和会话 UID 均由本地链路拥有。
- R34 `nitori_greenhouse_automation_proposal` 与自由支线 `nitori_instrument_calibration_chat` 已进入维护源；荷取方案不依赖爱丽丝方案，可按玩家调查顺序独立登记。
- `src/ui/event-registry.ts` 现在严格校验事件类型、入口、轮次、投影键、允许结果和在场迁移；`allowed_results` 不再在结算器维护第二份副本。
- 新增 `src/ui/event-projection.ts`：只向模型注入当前事件的大纲、节拍、禁止偏离、允许结果及 `projection_keys` 指定状态切片。
- 打包器不再把整份 `greenhouse-vertical-slice.json` 作为通用温室关键词世界书条目；普通对话不能因此看到未来事件。
- 固定事件结算锁定请求前时间并由本地按规则推进；额外模型写入的倒退日期/时段会被拒绝。未知区域也不能让新角色登场或覆盖已有合法位置。
- 稳定约束已同步到 `contract.md`、运行时优化计划、R29～R37 与 R38～R45 路线图及 API 来源记录。

### 0.6 R35 三方案选型与换型（维护源完成）

- `select_greenhouse_form` 与 `remodel_greenhouse_form` 已进入 `greenhouse-upgrade-routes.json`；三个首次选择和三个换型入口分别通过 `action_results` 固定映射结果、提出者、形态、路线 effect 与固定结尾。
- 首次选型只在三项方案完成标记和三个 `unlocked_forms` 同时齐备时开放，扣除 4 物资并推进一个时段；后续只能换到已解锁且不同于当前的形态，扣除 3 物资并推进一个时段。
- `current_form` 仍是唯一当前路线事实源；换型只替换三种路线 effect，保留通用设施效果、全部方案解锁与关系事实，未新增 `current_route`。
- 新增 bridge 独占的 `events.settled_ids` 字段链；庭园行动写入稳定结算 ID，刷新、Swipe、重放和旧楼层扫描不会重复扣费或倒灌旧形态。
- 模型只看到本次 action 对应的提出者、形态、结果和固定结尾；`local_settlement` 的成本与 effect handler 不投影给模型。
- 离线门禁 42/42 通过，R35 dry-run SHA-256 为 `5c4dcbe257154c253e4e5688821ec8c532c5b853bbd1d6769bde13009eda7529`；没有正式打包、导入或真实 Luker 验收。

### 0.7 R36/R37 特殊道具与集中验收候选

- 灵梦小店新增本地目录商品：30 金币的可重复异变触发卡与 80 金币的唯一咲夜怀表；购买、持有、使用和复读均不调用 LLM。
- 异变卡以 `use_id` 从登记事件中确定性抽取，成功写入最多 3 条等待队列后才消费；刷新不重抽、队列满或无候选不消费。
- 咲夜怀表每天最多使用一次，只登记五分钟停顿与时间痕迹，不推进或回滚正式时段；第二次成功使用可登记咲夜调查候选，但不强制常驻，不创建紫或辉夜档案。
- 新增 `special-item-events.json` 并接入统一 loader、最小投影 allowlist、庭院行动入口与本地结算；独立异变支线不写关键完成态。
- R37 保留窄屏、200% 缩放所需的弹性布局、44px 触控尺寸、焦点可见、reduced motion、事务重试、卸载清理、数据库离线降级和道具复读校验。
- 当前 package/manifest 已指向 `0.2.0-r37-m1-release-candidate` 的 dry-run；正式运行基线仍是 R32，现有运行产物仍保持 R34，不得在真实验收前把 M1 标记为 complete。

### 0.5 额外模型变量解析重组（R32 已验收）

- 世界书已按 MagVarUpdate 路由拆成 `[mvu_plot]` 剧情条目、`[mvu_update]` 变量规则/输出格式，以及同时进入两阶段的 D0 最新状态快照。
- 最新状态使用 `{{format_message_variable::stat_data}}`，打包时写入 `extensions.position=4`、`depth=0`，不再依赖静态“投影契约”假装提供实时值。
- 变量阶段即使无变化也必须输出空 JSONPatch，额外模型只拥有开放语义字段；资源、商店、战斗、在场回执、受控主线和楼层幂等字段继续由本地 bridge 独占。
- bridge 不再在 `MESSAGE_RECEIVED` 时抢先结算；它等待 `VARIABLE_UPDATE_ENDED`，失败/禁用额外解析时使用 2.5 秒安全回退，并在同一 assistant 楼层的最新变量状态上合并本地结果。
- R32 已修正角色主世界书绑定：`extensions.world`、`extensions.mvu_worldbook_name` 与 `character_book.name` 使用同一名称；所有者已确认额外模型能够实际输出并更新变量。

### 0. R29 金币副本与 R30 灵梦小店

- R29 已实现并验收：妖花核心完成后解锁三种纯本地可重复副本；clean/narrow/loss 分别奖励 12/8/3 金币并推进一个时段，取消零结算，奖励 ID 幂等且不创建聊天楼层。
- R30 已实现并验收：`shop.unlocked` 与副本同步解锁；小店仅由 `src/shop/catalog.json` 和预写对话驱动，首发单份物资（6 金币/+1）与组合箱（22 金币/+4）。
- 购买为零 LLM 本地原子事务：余额、物资上限 20、未知商品和重复购买 ID 都会整笔拒绝；购买不推进时间、不创建聊天楼层。
- 设置页保留明确标记的验收快进：温室可用、妖花战后／副本解锁、小店测试状态（50 金币）。它们只写受控 MVU 快照。

### 1. 温室固定剧情收口

- `greenhouse_research_with_marisa` 最多两次有效 LLM 回合：首次行动为第 1 回合，玩家最多补充一次（120 字），第 2 次 assistant 回复自动结算并回庭院。
- 固定剧情的正文目标不超过约 300 个汉字；结束后关闭输入、选项和续聊，点击回庭院。
- 主线/固定行动继续使用本地白名单结算，取消依赖第二次预设解析，避免“第二次结算解析结果不符合 schema”。

### 2. 正文与 GAL 体验

- 载入新对话先清空 GAL 旧正文；本次聊天记录会替换左侧历史浏览内容。
- 固定剧情结束可直接回庭院；左箭头已改为单独的本次互动历史入口。
- 正文提取优先使用酒馆原生楼层中可读正文，过滤代码块、协议和边界外标签，适配不同预设的返回格式。

### 3. 在场角色快照同步（R28）

- 每次庭院 UI 发起的 LLM 请求都注入当前 `presence_snapshot`：在场角色 ID、姓名、区域、动作、朝向，及完整不在场名单。
- 角色抵达、离场或换区时，模型必须在正文后追加一次受控回执：

```xml
<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu"],"character_views":{"reimu":{"area_id":"garden","action":"idle","facing":"front"}}}</GensokyoPresence>
```

- `bridge.ts` 只接受已登记角色与白名单字段；回执原子覆盖 `presence_snapshot`，离场角色的小人视图会一并移除。
- 没有位置变更时不输出该标签。叙事写了“离场”却没有回执，属于模型协议违例，不应由本地文本猜测器擅自改状态。
- 契约见 `presence-sync-contract.md`；回归测试在 `tests/ui-contract.test.mjs`。

## 关键文件

| 主题 | 文件 |
|---|---|
| 庭院界面与固定剧情收口 | `src/ui/app.ts` |
| 本地事件结算、两回合上限 | `src/ui/event-settlement.ts` |
| 模型请求、当前事件精确投影与在场契约 | `src/ui/target-actions.ts`、`src/ui/event-projection.ts` |
| 受控在场回执应用 | `src/ui/bridge.ts` |
| 事件 JSON 严格登记表 | `src/ui/event-registry.ts` |
| 时间单调规则 | `src/ui/time-rules.ts` |
| 正文投影与 GAL | `src/ui/gal-scene.ts` |
| 在场同步契约 | `project/presence-sync-contract.md` |
| R28 运行/导入报告 | `project/runtime-report-0.2.0-r28.md` |
| 角色卡打包器 | `scripts/package-checkpoint.mjs` |
| 前端美化方向与阶段 | `project/ui-beautification-plan.md` |
| 前端美化施工日志（R1–R7） | `project/ui-beautification-log.md` |
| 区域手描轮廓（换底图必须重描） | `src/ui/garden-spatial.ts` |
| 架构优化状态 | `project/runtime-architecture-optimization-plan.md` |
| M1 / M2 后续路线 | `project/r29-r37-m1-expansion-plan.md`、`project/r38-r45-m2-expansion-plan.md` |

## Luker 当前数据状态

- 已确认可访问本机 SillyTavern 服务，但本轮只读探测时没有可用于 O4 的选中角色和聊天上下文。
- 本轮没有导入、替换或清理任何角色卡、世界书、聊天及用户配置。
- 过往 R30～R32 的运行数据状态以对应运行报告和所有者环境为准；下一 Agent 不得根据 `dist/` 目录存在就推断已经完成真实导入验收。

## 下一阶段

- M1 计划：`project/r29-r37-m1-expansion-plan.md`；M2 计划与施工：`project/r38-r45-m2-expansion-plan.md`、`project/r38-r45-detailed-execution-plan.md`。
- 维护源已含 R38–R45 规则与离线测试；当前可选路径：
  1. 授权正式打包 `0.2.0-r45` 并做真实新聊天验收；
  2. 先补做 R37 集中真实验收（清单 `project/r37-acceptance-checklist.md`）；
  3. 继续打磨设施装修/异变启用的宿主 GAL 事务 UI。
- 独立检查点策略不变：不覆盖 R28/R32/R34/R37 等历史产物；无授权不正式打包；离线通过 ≠ 实机通过。
- 自定义异变：玩家填表 → 预留卡 → 隐藏源头一次生成并锁定 → 28 标准时段 → 每日短线索 → 最终收束；不可叠加、不可主动结束；怀表不缩短计时。
- 三后续设施：妖精花园 4 / 月见温泉 6 / 宴会广场 5 物资建成，换型统一 2；同时仅一个大型施工；形态 2/4 聊天或 12/24 时段兜底。
- 背包只显示本地目录；场景道具同场最多 3 种；修缮包只走损坏修复入口。

## 下一位 Agent 开工顺序

1. 不得覆盖任何既有 dist 检查点；需要新候选时用未占用版本。
2. 先读 `project/r38-r45-implementation-log.md` 最新收工条与本交接。
3. 若做实机验收：导入精确候选到新聊天，按 R37 或 R45 矩阵留证据；不得把 dry-run/预览写成 accepted。
4. 若续做 UI 深接：优先异变结构化表单、设施方案比较页、装修/修复完整消息事务，保持 rules 纯函数与 bridge 事务边界。
5. 任何模型输出仍不能直接完成资源、路线、UID、在场、异变生命周期或关键事件结算。

## 操作约束

- 不直接编辑 `dist/`；修改维护源后依次执行：`npm run check:ui`、`npm test`、`npm run build:ui`、`npm run package:checkpoint:dry`。
- Git 默认只提交维护源、测试和文档；`dist/` 下历史检查点、构建产物和 superseded 归档不进入源码提交，除非所有者对某个精确产物另行授权。
- 所有者已批准 R29～R37 采用逐轮独立检查点、打包、导入和真实 Luker 验收的交付方式；每轮执行写入前仍须核对精确版本、未占用输出路径和目标 Luker 会话，不得把该授权扩大为覆盖历史产物或清理无关数据。
- 打包器拒绝覆盖已有检查点；需要新候选时先更新 `package.json`、`project/manifest.json` 的检查点。
- 真实 Luker 验收使用右侧内置浏览器，不操作桌面浏览器。
- 清理 Luker 数据时先核对精确目标；优先移动至回收站，并保留与本项目无关的数据。
