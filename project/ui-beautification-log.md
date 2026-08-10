# 前端美化施工日志（UI Beautification Log）

> 配套方案：`project/ui-beautification-plan.md`（方向定稿与阶段规划）。
> 本日志按轮记录 2026-07-26 起的美化施工；各轮是否打包以轮次与交接记录为准，离线通过不等于实机验收通过。
> 每轮收工门禁：`npm run check:ui` → `npm test` → `npm run build:ui`，全绿才记为完成。

## 轮次总览

| 轮 | 内容 | 触发 | 门禁 |
|---|---|---|---|
| R1 | 阶段 A/B/C：token 重构、地图标注药丸衬底+DPR 修复、符卡框语言、GAL 过渡态、商店/背包/状态反馈 | 方案 P0/P1 | 101/101 |
| R1.5 | 目标菜单方框 → 圆点气泡群（像素糖果按钮，按 mode 配色） | 所有者反馈 | 101/101 |
| R2 | 气泡半环绕 + 锚点视角跟随修复；开场页「结界之夜」；庭园全屏 + 顶部 HUD + 原生全屏按钮；区域悬停角括占位高亮；副本页弹幕夜空 | 所有者反馈 + 报 bug | 102/102 |
| R3 | 开场页「结界仪式」重排：只留姓名/外貌/庭园名，说明文案转 sr-only（守 140 号契约测试），双环魔法阵 + 灵玉 | 所有者反馈 | 103/103 |
| R4 | 开场炫光强化（光束/星芒/灯笼/更强明暗）；鼠标跟随动态光源；所有者主视觉图压缩嵌入（430KB JPEG，原图存档） | 所有者反馈 + 素材 | 104/104 |
| R5 | 开场全屏铺满；移除旋转魔法阵（元素与 CSS 全拆） | 所有者反馈 | 105/105 |
| R6 | 全阶段全屏（.gg-app 基础规则满屏）；SpriteActor 轮廓染色发光替代圆环；顶栏六钮角色主题胶囊（参考所有者灵梦按钮图） | 所有者反馈 + 参考图 | 105/105 |
| R6.5 | 修复「默认进庭院不全屏」：启动即初始化 `data-active-view='garden'` | 所有者报 bug | 106/106 |
| R7 | 区域高亮从矩形角括 → 底图手描轮廓多边形描边发光（主屋/水井/田地/山门），空地块贴地光环；两轮叠图校验 | 所有者反馈 | 106/106 |
| R8 | 扩大视角无设施底图接入；地图素材改为 manifest 驱动；人物 73% / 设施占位 76% 远景缩放；停用旧底图轮廓 | 所有者供图与规划 | 109/109 |
| R9 | 灵梦小店入口与 4:3 十槽商店界面、魔理沙背包入口、灵梦符卡副本入口换图；分类双态、资金牌、商品说明与底部热区校准 | 所有者素材与逐项反馈 | 124/124（异常恢复后复跑） |
| R10 | 角色点击菜单四徽章：动作对象派生对话／离开／摸头／任务视觉语义；最终采用纯 HTML/CSS 东方御守风，不加载徽章图片；桌面半环、390px 双列与 320px 单列网格，禁用原因改为可见文本 | 异常任务续接 + 所有者调整 | 125/125 |
| R11 | 角色／设施弹窗收紧按钮，过滤与关闭重复的“离开”；设施查看隐藏视觉图；背包重构为独立道具袋界面 | 所有者逐项反馈 | 后续总门禁复跑 134/134 |
| R12 | 开放庭园教程进度与下一步；详细测试控制面板（教程断点、M1/M2、道具、八角色在场编排）；浏览器缩放补偿；三项顶栏入口放大下移并移除旧外层黑框；琪露诺待机亮度校准；GAL 道具御札式选择槽 | 所有者逐项反馈与报错 | 后续总门禁复跑 134/134 |
| R13 | GAL 东方幻想乡视觉收尾：所有者神社背景进入预览／内嵌链路，移除旧月亮与雾气，修复姓名牌被对白框 `clip-path` 裁切 | 所有者供图与报 bug | 后续总门禁复跑 134/134 |
| R14 | 新庭园底图与设施全形态接入：13 种正式形态、3 张损坏层、四组渲染／落脚／标签／命中几何；精确设施多边形优先于旧区域圆形 | 异常任务续接 + 所有者“全过” | 134/134；宽／窄屏离线通过 |
| R15 | 三副本 Boss 独立四状态图集：琪露诺／爱丽丝／咲夜按 `boss_id` 切换待机、施法、受击、击破；透明资源进入预览与内嵌链，妖花保留断链回退 | 所有者供图 | 134/134；琪露诺本地到场目视通过 |
| R16 | 顶栏三张缩略玩法入口收拢为「幻想乡案内」；原生大面板内提供符卡副本／灵梦小店／背包三张平滑渲染大卡及三项辅助操作；桌面、390px、320px 响应式与入口跳转检查 | 所有者反馈 | 134/134；宽／窄屏离线通过 |
| R17 | 符卡副本选关改为妖精／森林／结界三卷主题绘卷；正式挑战与无结算演练建立主次层级，桌面三栏、窄屏单列 | 所有者反馈 | 136/136；宽／窄屏离线通过 |
| R18 | 接入所有者提供并经 AI 生成修改的 `etama3.png` 敌弹图集；敌弹按 shape×hue 取图，未知组合保留几何回退；该素材允许随项目打包分发 | 所有者供图与后续授权澄清 | 136/136；弹幕测试 30/30 |
| R19 | 顶部 HUD 先提升状态文字可读性，再压缩标签与顶栏高度；手机弹幕主指拖动自动射击，轻触不射、松手停火，双指专注／双击 Bomb／桌面键盘语义保持 | 所有者连续反馈 | 136/136；390×844 实测无溢出 |
| R20 | 手机端人物／设施目标菜单由透明气泡叠层改为视口固定的底部操作抽屉；人物双列快捷卡、设施单列操作、禁用原因独立显示，操作区支持内部滚动与安全区；关闭／Escape 返回地图焦点，桌面半环保持不变 | 所有者反馈 | 136/136；390×844 设施五操作完整可见、无横向溢出 |
| R21 | 手机端地图人物按画布宽度独立放大：≤360px 为 1.35 倍、361–520px 为 1.25 倍，桌面保持 1.00 倍；同步放大命中半径、选中光环与活动标签，并轻度扩展多人间距 | 所有者反馈 | 137/137；320×720 与 390×844 离线实看通过，桌面 1200×900 回归通过 |
| R22 | 庭园底图切换为所有者提供的 `1672×941` 横向主屋庭院；旧 V2 设施贴图退出地图渲染，区域锚点迁移到新空地，设施状态与交互继续保留；新增 V3 设施素材清单 | 所有者供图 | 137/137；907×894 与 390×844 离线实看通过、无横向溢出 |
| R23 | 13 张 V3 设施全景差分完成透明抠图、四组共享画布正规化与运行时接入；重标尺寸／中心／落脚／标签／命中几何，构建新增 RGBA、透明边、隐藏 RGB 和同组画布门禁；旧 V2 损坏层不复用 | 所有者供图 + 本地确定性后处理 | 138/138；桌面与 390×844 离线实看、手机设施菜单通过，控制台无警告／错误；V3 损坏层与真实 ST 验收待补 |
| R23 | 地图相机增加按 cover 尺寸、缩放和画布动态计算的软边界；拖拽越界使用指数阻力，松手后由阻尼弹簧回弹，缩放下限收紧为 1，减少动态效果时直接归位 | 所有者反馈 | 138/138；390×844 横向约 45px、纵向约 47px 软越界后 0.9s 内回稳 |
| R24 | 修正手机端上下软边界：无合法平移空间的轴改用独立小额度，纵向拉伸由约 47px 降到约 16px；画布先铺设地图边缘渐变底色，避免回弹瞬间闪透明／黑边 | 所有者报错 | 138/138；390×844 纵向峰值 15.73px、0.5s 回稳，横向反馈保持 |
| R25 | 桌面／手机地图人物比例回调：全局视觉基准由 0.73 调为 0.64；≤360px 视口倍率由 1.35 调为 1.18，361–520px 由 1.25 调为 1.12，形成桌面 0.64／普通手机约 0.72／窄手机约 0.76 的现行有效比例；标签、选中光环、命中半径与多人间距同步收紧，手机命中保留 44px 级下限 | 所有者反馈 + 验收通过 | `check:ui`、138/138、`build:ui` 全绿；人物缩放／待机对齐／琪露诺亮度定向测试通过；桌面／手机目视验收通过 |
| R26 | 所有者提供的完整透明废墟图确定性正规化为妖精花园／月见温泉／宴会广场三组同画布素材；三座设施进入 `damaged` 时以废墟完整替换正常形态，修复后恢复当前正常形态，不再使用 V3 损坏覆盖层方案 | 所有者供图 | `check:ui`、153/153、`build:ui`、r54 dry-run 全绿；地图合成预览通过，真实 SillyTavern 待验收 |
| R27 | 补齐灵梦／魔理沙／荷取／米斯蒂娅／萃香五套 `2×2` BOSS 四状态透明图集；八角色对战卡统一按角色 ID 选择独立 sheet，修复爱丽丝／琪露诺／咲夜旧视觉 ID 与渲染映射不一致；原图归档、透明处理报告和五张浏览器实显证据落盘 | 所有者供图 + 确定性透明化 | `check:ui`、154/154、`build:ui`、r54 dry-run 全绿；五名新增角色离线对战弹窗目视通过，控制台无 warning/error；真实 SillyTavern 四状态切换待验收 |
| R28 | 灵梦／魔理沙 BOSS 四状态图升级为新版；处理脚本支持指定角色增量替换和版本化原图归档，稳定运行路径不变；manifest 记录 v2 当前档、v1 被替代档和哈希报告 | 所有者供图 + 确定性透明化 | `check:ui`、154/154、`build:ui`、r54 dry-run 全绿；两场新版对战暂停态目视通过，页面控制台无 warning/error |
| R29 | 弹幕战暂停与战斗内置音频设置：裸露 HUD 滑杆收进专属小弹窗，音效／BGM 分轨调节；三首 BGM 模板登记为 `source_url:null`，为后续 HTTPS R2 曲源预留安全接口 | 所有者反馈 | 当时 `check:ui`、175/175、`build:ui` 全绿；本地验证默认值、曲目／音量持久化和暂停恢复，真实 ST／R2 待验收 |
| R30 | 自机小符札与敌弹视觉解耦：辉光椭圆改为米白纸符、深色描边、红／青符印、金色顶签和双尾带；P 点补独立四角拾取框，颜色之外再用轮廓与尾迹区分阵营 | 所有者反馈 | `check:ui`、176/176、`build:ui` 全绿；离线妖精练习实际缩放目视，真实 ST／320px／高密度交火待验收 |
| R31 | 商店分页（10/页翻页控件，单页隐藏）＋购买成功/失败气泡提示＋blurb 精炼介绍（截断点击弹窗看完整）；背包分页（4/页）与高度压缩；GAL 道具选择器分页（6/页）＋blurb 短描述＋长按 500ms 看详情＋「不使用道具」跨行置顶＋怀表即时使用入口；符卡副本选关改为单卡居中横版关卡公告卡；道具介绍布局修复（标题固定不被描述顶动） | 所有者逐项反馈 | `check:ui`、214/214、`build:ui` 全绿；宽／窄屏离线通过，真实 SillyTavern 待验收 |
| R33.2 | 顶栏换装「晨雾结界·像素晨光·玻璃流光」（文字排版与间距不变）：底图再淡（纸底渐变 alpha 降至 .76/.66/.56，点阵纹理 .09/.07，庭园更透出）；晨光扫过升级为流动炫光玻璃（`gg-header-glass-flow` 9s：淡金/淡青/淡玫三团柔光晕 170-190% 超尺寸层缓缓漂移 + 白亮带横掠）；便利贴感加重——铭牌加半透明胶带条（`::after` 横条＋竖纹压边）＋纸纹加密＋抬升硬投影 3px，状态片改淡柠檬/淡樱/淡水三色便签纸底＋抬升投影；案内按钮/面板维持 R33.1 浅朱渐变与米白半透；全部动效由全局 `prefers-reduced-motion` 豁免归零 | 所有者「这些便利贴的感觉再重一点，底图的背景再淡一点，加点流动炫光透明玻璃的感觉」 | `check:ui`、222/223、`build:ui` 全绿；唯一失败为既有的 GAL 回复落盘释放提交锁用例（所有者 UI 外置化重构遗留，未触碰）；预览刷新目视待验收 |
| R33.3 | 顶栏移除浮游像素月（删 `::after` 八角阶梯月块与 `gg-moon-float` 关键帧，注释同步去掉「像素月轻浮」）；文字排版与间距、流动炫光玻璃、胶带条、状态片分色等 R33.2 其余效果不变 | 所有者「像素月好丑，去掉」 | `check:ui`、222/223、`build:ui` 全绿；唯一失败为既有的 GAL 回复落盘释放提交锁用例（所有者 UI 外置化重构遗留，未触碰）；预览刷新目视待验收 |
| R33.4 | 案内弹窗出场动画改为「以按钮为原点从小变大长出」：`transform-origin: top right` 配 `--from-x/y`（按钮中心 − 视口中心），0% 平移用 `calc(var(--from-x) - 50%)` / `calc(var(--from-y) + 50%)` 修正（scale 先于 translate，直接 `translate(var(--from-x))` 会让右上角锚点落在 `C_tr + T·s` 而非按钮中心）；`gg-launcher-fly-in` .5s cubic-bezier(.22,.8,.3,1) backwards，子元素分批 `gg-launcher-rise-in`（70/130/190/250ms 延迟） | 所有者「为什么我看着还是冲右上角飞出来，而不是从按钮那边出现？」 | `check:ui`、222/223、`build:ui` 全绿；唯一失败为既有的 GAL 用例；预览刷新目视待验收 |
| R33.5 | 案内弹窗三卡均衡化（`@media (max-width: 899px)`）：去掉 `.gg-launcher-card-dungeon { grid-column: 1 / -1 }` 整行横跨，网格改回三列等宽，符卡副本不再占整行大头，与灵梦小店/背包同宽；同步删 559px 段里已被架空的行内重置 `grid-column: auto`；卡片内文字排版与间距、图片尺寸 clamp、hover 效果均不变 | 所有者「这个加载页面也优化一下，目前的符卡副本占比也太大了」 | `check:ui`、222/223、`build:ui` 全绿；唯一失败为既有的 GAL 用例；预览刷新目视待验收 |
| R33.6 | 案内弹窗关闭动画（与 R33.4 出场反向呼应，幻想乡「灵力收回」式）：点关闭钮/背板/Esc/导航关闭时先播 `[open].gg-closing` 退场——弹窗以按钮为原点 3° 微旋反向收起（`gg-launcher-fly-out` .45s，终点同出场 0% 位置 `scale(.06)` 化为一缕金芒）、`::backdrop` 淡出、内容 0.2s 反向敛入；动画播完才真正 `dialog.close()`（`dialog.close()` 本身无退场动画，直接调会瞬关），Esc 用 `cancel` 事件 `preventDefault()` 拦截后同样走动画路径；收尾时 `recallStardust` 在案内按钮处金白闪光＋14 枚金/粉星屑从按钮四周敛回中心（复用出场星屑视觉语言、方向相反）；`animationend` 事件过滤 `animationName === 'gg-launcher-fly-out'` 且 target 为弹窗本体，600ms 兜底定时器防节流吞事件；reduced-motion 下 JS 直接瞬关、CSS 一并豁免；文字排版与间距不变 | 所有者「关闭这个窗口也要有动画，来点幻想乡风格的关闭动画」 | `check:ui`、222/223、`build:ui` 全绿；唯一失败为既有的 GAL 用例；预览刷新目视待验收 |
| R33.7 | 案内弹窗出场节奏提速（仅动效时长，视觉与几何不变）：`gg-launcher-fly-in` .5s → .3s（保持 `cubic-bezier(.22,.8,.3,1)` 与按钮原点几何）；子元素分批入场延迟 70/130/190/250ms 压缩为 40/80/120/160ms（时长仍 `--gg-dur-2` .3s），整体出场从约 550ms 收至约 460ms；关闭退场 .45s 与星屑迸发节奏维持不变 | 所有者「出场动画可以快一点」 | `check:ui`、222/223、`build:ui` 全绿；唯一失败为既有的 GAL 用例；预览刷新目视待验收 |
| R33.8 | 案内弹窗出场再提速（仅动效时长）：`gg-launcher-fly-in` .3s → .2s；子元素延迟 40/80/120/160ms → 25/50/75/100ms，整体出场约 400ms 收尾；关闭退场与星屑节奏仍不变 | 所有者「再快一点」 | `check:ui`、222/223、`build:ui` 全绿；唯一失败为既有的 GAL 用例；预览刷新目视待验收 |
| R33.9 | 案内弹窗与星屑迸发改为并行重叠（不再等星屑播完）：点击案内按钮后星屑先迸出，`setTimeout(openLauncher, 500)` 缩短为 250ms（约中心闪光 .45s 的一半），弹窗半程同步展开、像从金芒里长出；顶层对话框会盖住部分星屑，但半透明玻璃下余烬仍可见；弹窗飞入 .2s 与星屑 1.1s 节奏本身不变 | 所有者「我的意思是不要等前面的按钮动画结束才下一步，完全可以动画一半同步出现」 | `check:ui`、222/223、`build:ui` 全绿；唯一失败为既有的 GAL 用例；预览刷新目视待验收 |

## 变更文件

| 文件 | 变更 |
|---|---|
| `src/ui/styles.css` | token 层、符卡框、气泡、开场 R3-R5、HUD、全屏、主题按钮、副本夜空；内嵌 base64 主视觉与 SVG 占位素材 |
| `src/ui/index.html` | 开场重排（三输入 + 场景层 + sr-only 契约句）；新增单例「幻想乡案内」dialog 与大尺寸玩法卡结构 |
| `src/ui/index.html`、`app.ts`、`styles.css` | 大型案内面板的当前结构、交互与响应式实现 |
| `src/ui/app.ts` | 统一案内入口转场、动态状态摘要、关闭与焦点返回；原业务入口函数保持唯一 |
| `src/ui/styles.css` | 新增 `.gg-launcher-*` 大面板、大卡与三档响应式样式；三张入口插画在面板内改用平滑采样 |
| `tests/ui-contract.test.mjs` | 固化案内入口唯一性、三卡顺序、平滑渲染、桌面三列与窄屏单列契约 |
| `src/ui/app.ts` | `createBubbleButton`、半环绕定位、`positionTargetMenu` 跟随、`setStatus` tone、全屏开关、启动视图标记、鼠标光源、正文逐拍淡入 |
| `src/ui/garden-map.ts` | DPR 补偿、药丸标签、悬停/选中态、轮廓多边形发光、贴地光环、锚点跟随回调、指针切换、imageSmoothing 关闭；R25 桌面／手机人物响应式缩放、标签／光环／命中／间距联动与 44px 级手机命中保底 |
| `src/ui/garden-spatial.ts` | 新增 `GARDEN_AREA_OUTLINES` 手描轮廓（换底图必须重描） |
| `旧素材/src/assets/maps/garden-base-expanded-empty-v1.png` | R8 历史运行时底图，已归档，不再由当前 manifest 使用 |
| `src/assets/maps/garden-base-owner-v3.png` | 当前 `1672×941` 横向正式运行时底图；所有者已批准并由 manifest 驱动 |
| `src/assets/world/map-facilities/{magic-greenhouse,fairy-garden,moon-spring,banquet-plaza}/*-v3.png` | 所有者批准的 13 种正式设施形态；由 manifest 几何和运行态正式键驱动 |
| `src/assets/world/map-facilities/{fairy-garden,moon-spring,banquet-plaza}/*-ruins-v3.png` | 所有者废墟源图按三组现行画布正规化后的完整损坏替换图；只在 `damaged` 状态替换当前正常形态 |
| `旧素材/src/assets/{maps,world/map-facilities}/` | 已被 V3 取代的 V2 底图、V2 设施／损坏层及色键源，以及退出运行时的主屋旧叠图；保留原相对路径，不参与构建 |
| `src/assets/asset-manifest.json` / `scripts/build-ui.mjs` | 登记 `maps.garden_base` 并由清单选择、复制和内嵌运行时底图 |
| `scripts/prepare-shared-facility-ruins.py` / `project/shared-facility-ruin-report.json` | 共享废墟的可复现预乘 alpha 缩放、透明像素清理、落位与完整输入／输出哈希报告 |
| `src/ui/sprite-actor.ts` | 新增 `drawOutlineGlow`（source-in 染色 + 模糊双叠，含浮动/摆动同步） |
| `src/ui/shop-view.ts` / `inventory-view.ts` | 价签 `gg-price`、空状态 `gg-empty` |
| `src/assets/ui/opening-hero-source-v1.png` | 所有者主视觉原图存档（2.9MB，未入清单，不进卡） |
| `src/assets/ui/reimu-shop-button-v1.png` / `marisa-inventory-button-v1.png` / `reimu-dungeon-button-v1.png` | 顶栏小店、背包、符卡副本独立像素入口；预览与内嵌运行时使用同一资源链 |
| `src/assets/ui/reimu-shop-ui-background-v1.png` | 灵梦小店 4:3 底图；桌面端覆盖十槽、资金牌与透明操作热区，窄屏回流为可读卡片布局 |
| `src/ui/shop-view.ts` / `shop-rules.ts` / `src/shop/catalog.json` | 商品分页（PAGE_SIZE=10，翻页控件单页隐藏）；blurb 精炼介绍默认显示（3 行截断＋点击弹窗看完整版）；购买成功/失败气泡 `.gg-shop-notice`（4.2s 自动消失，success/error 双色）；移除 `gg-shop-use` 使用按钮；详情区布局修复（标题固定、描述区滚动不顶标题） |
| `src/ui/inventory-view.ts` / `styles.css` | 背包分页（PAGE_SIZE=4）＋卡片/头部间距压缩降低整页高度 |
| `src/ui/app.ts` / `src/ui/index.html` / `styles.css` | GAL 道具选择器分页（6/页）＋blurb 短描述（2 行截断）＋长按 500ms 弹完整介绍＋「不使用道具」固定跨行；怀表（`sakuya_watch`）作为即时使用选项加入选择器（金色「刻」标记，冷却禁用） |
| `styles.css` | 符卡副本选关 UI：`#gg-dungeon-actions` 单列居中、关卡卡限宽 640px 横版布局、主题色顶部辉光条、Boss 名放大、按钮横排主次分明 |
| `src/items/catalog.json` | 12 件道具新增 `blurb` 短描述（商店与 GAL 选择器共用短文案） |
| `src/lorebook/item-routing.json` / `src/lorebook/items/*.xml` / `src/ui/item-greenlights.ts` / `src/ui/target-actions.ts` / `scripts/package-checkpoint.mjs` | 道具绿灯世界书机制：8 件场景道具各占一条世界书条目（含仅对爱丽丝生效等生效限定），由 `GSK_ITEM_*_ACTIVE` 标记按场景登记加载，打包条目 id 18+，`lorebook_entries` 25 |
| `旧素材/src/assets/ui/target-action-*.png` | 角色点击菜单四张历史参考原图；已归档，最终运行时不读取、不复制、不内嵌，徽章完全由 HTML/CSS 绘制 |
| `src/assets/ui/gensokyo-gal-shrine-background-v1.png` | 所有者提供的 GAL 神社背景原图；由清单登记，离线预览复制文件，嵌入式运行时注入 data URL |
| `src/assets/battle/boss/{cirno,alice,sakuya}-battle-sheet-v1.png` | 三副本独立 `2×2` 四状态 Boss 透明图集；按 `presentation.boss_id` 选择，chroma 维护源不进产物 |
| `src/assets/battle/boss/{reimu,marisa,nitori,mystia,suika}-battle-sheet-v1.png` | 任意角色对战卡新增的五套 `2×2` 四状态 Boss 透明图集；与既有三人共同组成八角色独立视觉 |
| `scripts/prepare-character-boss-sheets.py` / `project/character-boss-sheet-preparation-report.json` / `project/runtime-qa/` | 五套所有者黑底源图的可复现透明化、输入／输出哈希与逐格统计，以及离线浏览器逐角色实显截图 |
| `project/character-boss-sheet-replacement-report-2026-07-30.json` / `project/character-boss-sheet-replacement-preview.png` / `旧素材/素材处理/battle-boss-owner-source-v2/` | 灵梦／魔理沙新版源图归档、运行时输出哈希、逐格统计与透明总览；旧 v1 归档不覆盖 |
| `src/assets/battle/effects/battle-bullets-etama3-local-v1.png` | 所有者提供并经 AI 生成修改的敌弹图集，允许随项目打包分发；运行时未知裁切组合回退几何绘制 |
| `src/battle/battle-input.ts` | 手机主指拖动超过轻触阈值后自动连射，抬起／取消停止；第二指专注、双击 Bomb、鼠标与键盘行为保持 |
| `src/battle/battle-renderer.ts` | 自机射击纸符轮廓、普通／专注符印与双尾带；P 点独立四角拾取框；仅改绘制，不改模拟和判定 |
| `src/battle/battle-bgm.ts` / `src/battle/battle-bgm-catalog.json` | 战斗 BGM 总线、HTTPS-only 曲源校验与三首空 URL 模板；曲源缺失时静默，不阻塞战斗 |
| `project/battle-bgm-r2-template.md` | 后续把歌曲放入 Cloudflare R2 时的目录、URL、缓存、CORS与回滚填写模板，不含凭据 |
| `src/ui/open-garden-rules.ts` | 只从正式状态派生教程步骤、完成数、当前步骤与下一步，不新增持久化 UI 状态 |
| `src/ui/test-tools.ts` | 教程断点、M1/M2、道具恢复及八名角色在场编排的受控测试快照 |
| `src/ui/inventory-view.ts` | 独立背包介绍、分类统计、物品网格、详情与受控使用入口 |
| `src/runtime/ui-host-shell.js` | 向 iframe 传递 GAL 背景 data URL，并保持资源链在宿主边界内 |
| `src/ui/styles.css` / `tests/ui-contract.test.mjs` | R33.2 顶栏换装「晨雾结界·像素晨光·玻璃流光」（不改文字排版与间距）：底图再淡（纸底 alpha .76/.66/.56＋点阵 .09/.07）；流动炫光玻璃 `gg-header-glass-flow` 9s（淡金/淡青/淡玫柔光晕漂移＋白亮带横掠，7 层 background-position 动画）；铭牌加半透明胶带条 `::after`＋纸纹加密＋抬升投影 3px；状态片淡柠檬/淡樱/淡水三色便签纸底＋抬升投影；案内按钮/面板维持浅朱渐变与米白半透；R33.2 契约测试锚点同步更新为新设计 |
| `src/ui/styles.css` | R33.3 移除顶栏浮游像素月：删 `.gg-header::after` 八角阶梯月块（36px、淡金、`gg-moon-float` 5.5s）与 `@keyframes gg-moon-float`，头注释去掉「像素月轻浮」；契约测试本就未锚定该月，无需改动，其余效果不变 |
| `src/ui/styles.css` | R33.4 案内弹窗出场动画改以按钮为原点长出：`.gg-launcher-dialog[open]` 加 `transform-origin: top right` 与 `@keyframes gg-launcher-fly-in`（0% `translate(calc(var(--from-x,0px) - 50%), calc(var(--from-y,0px) + 50%)) scale(.1)`，100% 归位），配合 `app.ts` `openLauncher()` 写入的 `--from-x/y`（按钮中心 − 视口中心）；子元素 `::backdrop`/header/卡片/secondary 分批 `gg-launcher-rise-in` 入场 |
| `src/ui/styles.css` | R33.5 案内弹窗三卡均衡化（`@media (max-width: 899px)`）：删 `.gg-launcher-card-dungeon { grid-column: 1 / -1 }` 整行横跨，网格改回 `repeat(3, minmax(0, 1fr))` 三列等宽，符卡副本与灵梦小店/背包同宽不再占大头；559px 段架空的行内重置 `grid-column: auto` 一并删除；文字排版与间距、图片 clamp、hover 均不变 |
| `src/ui/app.ts` | R33.6 案内弹窗关闭动画：`closeLauncher()` 改为先加 `.gg-closing` 类播退场，`animationend`（过滤 `animationName === 'gg-launcher-fly-out'` 且 target 为弹窗本体，另设 600ms 兜底定时器）后才真正 `close()`（先 `close()` 再摘类避免动画移除瞬间闪回全尺寸）；新增 `finishLauncherClose()` 收尾并触发 `recallStardust(launcherButton)`；新增 `recallStardust()`（关闭时案内按钮处金白闪光＋14 枚星屑从四周敛回中心，方向与 `burstStardust` 相反，reduced-motion 跳过）；新增 `launcherDialog` 的 `cancel` 监听（`preventDefault()` 拦截 Esc 默认瞬关，改走动画路径）；`launcherClosing`/`launcherCloseTimer` 双重防重入 |
| `src/ui/styles.css` | R33.6 案内弹窗关闭动画：新增 `.gg-launcher-dialog[open].gg-closing` 退场——`@keyframes gg-launcher-fly-out` .45s cubic-bezier(.6,.04,.76,.3) forwards（终点复用出场 0% 位置 `translate(calc(var(--from-x,0px) - 50%), calc(var(--from-y,0px) + 50%)) scale(.06)`＋3° 微旋，化为一缕金芒收回按钮）；`[open].gg-closing::backdrop` 淡出（`gg-launcher-fade-out` .35s）；内容反向敛入（`gg-launcher-sink-in` .2s，`translateY(-8px)`）；新增 `.gg-stardust-recall`/`@keyframes gg-stardust-recall-fly`（星屑敛回按钮，方向与 `gg-stardust-fly` 相反）；reduced-motion 块补 `.gg-closing` 全套与 `.gg-stardust-recall` 豁免 |
| `src/ui/styles.css` | R33.7 案内弹窗出场提速：`gg-launcher-fly-in` .5s → .3s（缓动与几何不变）；子元素延迟 70/130/190/250ms → 40/80/120/160ms；仅动效时长改动，文字排版与间距不变 |
| `src/ui/styles.css` | R33.8 案内弹窗出场再提速：`gg-launcher-fly-in` .3s → .2s；子元素延迟 40/80/120/160ms → 25/50/75/100ms；仅动效时长改动，文字排版与间距不变 |
| `src/ui/app.ts` | R33.9 案内弹窗与星屑迸发并行重叠：`setTimeout(openLauncher, 500)` → 250ms，弹窗约半程同步展开（不再等星屑播完）；注释同步更新；其余不变 |

## 关键决策与约束

- 战斗/副本命名空间继续遵守弹幕协议：`.gg-battle-*` 管理战斗框，`.gg-dungeon-*` 管理选关绘卷；结算、碰撞、奖励与 `BattleResult` 不变。R19 仅在输入层新增手机主指拖动自动射击。
- 开场契约句「不调用 LLM／第一次真实行动才开始生成剧情」以 `.gg-visually-hidden` 保留在 DOM（契约测试 140 号锚定 + 无障碍）。
- 称谓字段隐藏但保留在 DOM 与开场事务（默认「中性称谓」）。
- 所有动效统一走全局 `prefers-reduced-motion` 豁免；像素素材永远 `imageSmoothingEnabled=false` / `pixelated`。
- 体积纪律：主视觉压缩至 430KB 再嵌入；灯笼/星芒/鸟居等全部内嵌 SVG 零位图。
- world_assets 的既有 states 图集（RGBA）与新底图透视不一致，继续只服务设施页；地图设施必须重新制作独立透明贴图。空底图阶段统一使用缩小后的贴地光环，旧手描轮廓停用。
- 浏览器页面缩放与地图世界缩放是两条独立链路：前者通过 `--gg-browser-zoom-compensation` 只补偿角色与目标菜单的视觉尺寸，后者继续由地图滚轮逻辑处理并保持指针锚点；不要再用统一 transform 把弹窗和地图一起缩放。
- R25 是当前地图人物尺寸基线：桌面有效比例 0.64、361–520px 约 0.72、≤360px 约 0.76。视觉尺寸与交互命中解耦，手机命中直径保留约 44 CSS px 下限；R21 的 1.35／1.25 仅为历史参数，不再代表现行方案。
- R26 是当前三座可损坏设施的素材语义：妖精花园、月见温泉、宴会广场在 `damaged` 时画完整废墟替换图，不能再把正常建筑与废墟叠加；魔法温室没有独立损坏替换图。
- “离开”与弹窗关闭属于同一语义，目标动作列表必须过滤 `mode=close`／`id=leave`，不得重新呈现第二个退出按钮。
- GAL 背景唯一来源为 `asset-manifest.json/ui_assets.gal_shrine_background`；`.gg-gal::before` 与舞台 `::after` 不再生成月亮、雾气或条纹遮罩。姓名牌必须位于对白框裁切多边形内部。

## 待办 / 待素材 / 待验收

- **实机验收（sillytavern-runtime-debug，最高优先）**：轮廓发光悬停手感、全阶段全屏、气泡视角跟随、移动端 320px、reduced-motion、ST 类名改写抽查。
- ~~升 r54 打包~~ **已完成**：原 2026-07-26 产物 `ee8587e7…57ac73` 已归档；当前 r54 为 `d654424` 基准测试包，SHA-256 `4af870fa…501214`、38,392,452 字节。R8 扩大视角地图尚未正式打包。
- **待所有者素材**：鼠标指针（已声明暂缓）、灯笼真素材、开场按钮完整绘制版（参考图未嵌卡）、细腻立绘线（方案 §7）。新底图设施透明贴图已于 R14 完成，不再列入待素材。
- ~~**角色点击菜单徽章（异常任务续接）**~~ **离线实现已完成**：`app.ts` 只从既有 `TargetAction` 派生 `talk / leave / pat-head / quest` 视觉类别，不修改注册表、剧情条件、bridge 或结算；四类徽章最终改为纯 HTML/CSS 御守风，原 PNG 不进入构建。桌面半环、390px 双列、320px 单列已在本地浏览器检查，无控制台警告／错误；任务按钮仍显示具体剧情名，禁用原因不再只依赖 `title`。仍需真实 SillyTavern 复查类名改写、角色移动中锚点跟随、键盘焦点与 reduced-motion。
- **R11–R14 实机验收**：在真实 SillyTavern 检查 100%／125%／200% 浏览器缩放、地图滚轮缩放、320px 与短视口、角色／设施菜单跟随、设施点击和损坏层、设施查看、背包长文本、测试面板滚动、GAL 姓名牌、道具键盘操作、背景内嵌加载、重挂载和聊天切换；当前具备静态契约、类型检查、134/134 测试、离线构建及宽／窄屏预览证据。
- **方案剩余阶段**：D 季节时段主题、E 微交互收尾与截图归档、F 素材接入。
