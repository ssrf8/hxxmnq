# 新底图设施风格校准 v2

状态：`owner-approved-runtime-integrated-pending-sillytavern-validation`

本目录用于将既有地图设施重绘为与所有者提供的 `1448×1086` 新庭园底图一致的画风、俯视角、光向和远景密度。当前产物为第一批风格样板；所有者已于 2026-07-28 查看叠图并回复“看上去不错，开始下一步”，因此画风方向与继续扩展授权已确认。样板尚未登记进 `asset-manifest.json`，也未替换任何运行时素材。

## 参考与生成方式

- 风格、镜头、日光、色板和细节密度参考：`src/assets/maps/garden-base-owner-candidate-v2.png`
- 各设施身份和必要构件参考：既有 `src/assets/world/map-facilities/*` 透明贴图
- 生成方式：Codex 内置 ImageGen，逐设施独立调用
- 透明方式：统一生成在平坦 `#ff00ff` 色键底，使用 imagegen 技能自带 `remove_chroma_key.py` 软边、去溢色处理
- 共同约束：春日左上光；柔和手绘经营地图风；远景简化；无人物、文字、水印；不生成完整场景；入口朝中央庭院

## 第一批样板

| 文件 | 入口方向 | 设计目标 | SHA-256 |
|---|---|---|---|
| `samples/magic-greenhouse-base-v2.png` | 西南 | 低矮乡野魔法温室，削减旧版宫殿式装饰 | `8e81aa7f5a21af65b6fb0da31e0848f4d90c9398a1e00f4e3e563c66089e63b6` |
| `samples/fairy-garden-four-season-v2.png` | 西南 | 四季花床 + 小型花架，取消高围墙与圆形平台 | `fd54ee585192ab755d026271ad94766a64e811e9e5bbfcde5618311226ea08de` |
| `samples/moon-spring-open-air-v2.png` | 东南 | 日间石汤、换衣小屋和竹屏，取消夜空背景与蒸汽 | `2fd5f17201779f318c8db5d686166edb35f1549adab6753fbfe1e17503152a2c` |
| `samples/banquet-plaza-lantern-market-v2.png` | 西北 | 三摊位、小舞台、长桌，灯笼在日间不强发光 | `124676c4dd5b485100dcc6a6a94b95310e7b520f3a1aac64e05561f5c597681e` |

对应色键原图保存在同目录的 `*-chroma.png`，用于复查或重新抠图。

## 自动检查

- 四张均为 `1254×1254` RGBA PNG。
- 四角 alpha 全为 `0`。
- 可见像素中未检出残留洋红色键。
- 透明软边均保留，未覆盖旧正式素材。
- `previews/four-facility-style-calibration-v1.png` 为确定性叠图预览，不是运行时底图。

## 第二批候选（2026-07-28）

基于已通过的四张样板，已使用 Codex 内置 ImageGen 逐张生成 9 张剩余形态和 3 张低遮挡损坏覆盖层。每张先生成 `#ff00ff` 色键原图，再使用 imagegen 技能的 `remove_chroma_key.py` 以 soft matte、despill 和边缘透明方式派生最终 RGBA PNG。所有文件暂存于 `candidates/`，尚未登记到 `asset-manifest.json`，也未替换运行时素材。

生成提示的共同锁定项：已批准样板负责镜头、足印、入口方向和设施身份；新底图负责画风、春日日间左上光与远景密度；旧版形态贴图仅用于说明形态身份，不继承旧镜头或旧画风；禁止人物、文字、水印、完整场景、夜景和高遮挡效果。

| 设施 | 候选文件 | 生成提示摘要 | SHA-256 |
|---|---|---|---|
| 魔法温室 | `magic-greenhouse-free-growth-v2.png` | 自由生长藤蔓、繁茂植株、少量青色魔法种灯 | `b90aae1ed818f52ee62ce6e2bdc933430fbd7bf20243355fc086ab32173054bb` |
| 魔法温室 | `magic-greenhouse-doll-maintained-v2.png` | 分区苗床、线轴／工具柜、小型人偶维护机构 | `861ccd80ee964b12f6afd64b75f416d49e5a6da12f3d20d6236a53dbfbd9124f` |
| 魔法温室 | `magic-greenhouse-kappa-automated-v2.png` | 青铜水管、水轮泵、仪表与自动灌溉槽 | `0704a7929b0ffeaa824560fea6bad1716147355541e73ffe856aef3ffb4d0ff4` |
| 妖精花园 | `fairy-garden-playground-v2.png` | 花环小径、蘑菇踏石、低矮花瓣游具与秋千 | `c0acf0291a419e46fc68b10bf2a15aea17783fa5fdb0efe9936a0a915be8472c` |
| 妖精花园 | `fairy-garden-ice-dew-maze-v2.png` | 低矮冰露花篱迷宫、清晰路径与中央露水池 | `74227590fd335abacc9cc6478c8d261486dea7e0402af9c47cdf2a223dbb2505` |
| 月见温泉 | `moon-spring-still-water-observation-v2.png` | 静水观测池、低矮观测仪器与水下月盘 | `78504e0e279fda93ad43e08dfabd438618065886e2497eb68c93e496b5547eb6` |
| 月见温泉 | `moon-spring-mist-hidden-bathhouse-v2.png` | 低矮汤屋、竹屏与暖帘，不使用蒸汽遮挡 | `3fce27816b1abb2e00ca3f07bbcd80cf67727f418fe6920e270b496aa93cae1d` |
| 宴会广场 | `banquet-plaza-oni-grand-feast-v2.png` | 低舞台、两列长桌、酒器与克制的鬼族装饰 | `ff42c3cd7fa7410a59a469a0d3905b18f41c0a664eaeef2d8d93a0e45c9ade60` |
| 宴会广场 | `banquet-plaza-spell-card-arena-v2.png` | 开放式椭圆演武场、双起点台与低绳安全边界 | `476dbee5a7ff9d7dca77509edfe17a3d49eaab89d3dfd54b436eb248d63e0df9` |
| 妖精花园 | `fairy-garden-damaged-overlay-v2.png` | 稀疏枯花、断木、碎石与损坏灯帽 | `0260bc90087bbc1ce2ddb44f412d38855ed8c4020d088c8007539dc283c1f52d` |
| 月见温泉 | `moon-spring-damaged-overlay-v2.png` | 稀疏断竹、裂石、旧桶、藻斑与碎木 | `6277183e4da80057df48b9d0a10f01665a8d9158c12024c0b783f1f7a6116d9c` |
| 宴会广场 | `banquet-plaza-damaged-overlay-v2.png` | 稀疏断柱、破灯笼、碎碗、空白纸屑与移位铺石 | `c968fb4dd1fc3a5a4fed16364abae1486791d33721461c713b8f50bed734fb46` |

批量检查结果：12/12 均为 `1254×1254` RGBA，四角 alpha 为 `0`，可见像素中未检出洋红色键；三张损坏层的可见像素占比分别为 `9.2%`、`7.6%` 和 `5.3%`。宴会损坏层初稿的纸屑曾出现疑似符号，已通过单点编辑移除，最终文件无可读文字。

确定性叠图预览：

- `previews/candidate-forms-a-v2.png`：自由生长型／妖精游乐庭／静水观测池／鬼之大宴台。
- `previews/candidate-forms-b-v2.png`：人偶维护型／冰露迷宫／雾隐汤屋／符卡演武场。
- `previews/candidate-forms-c-v2.png`：河童自动化型，其他三设施使用已通过样板作为尺度参照。
- `previews/candidate-damage-overlays-v2.png`：三张损坏层叠加在已通过样板上。

离线叠图初检未发现设施侵入中央移动区、覆盖背景房屋或堵死正式入口。所有者已于 2026-07-29 对四组叠图回复“全过”；河童自动化型的信息密度、静水观测池的占地和三张损坏层的收拢程度均按现状批准。

## 后续门槛

1. ~~所有者确认四张样板的画风、比例和方向。~~ 已通过。
2. ~~以通过的样板为身份与占地参考，继续制作其余形态及三张损坏覆盖层。~~ 候选已生成并完成离线透明检查。
3. ~~所有者复核四张候选叠图。~~ 已回复“全过”。
4. ~~视觉复核通过后，按真实落点生成锚点、缩放、命中多边形与标签锚点。~~ 已完成并登记。
5. ~~通过宽屏／窄屏离线检查后，更新 `asset-manifest.json` 和运行时引用。~~ 已完成；真实 SillyTavern 验收仍待执行。

## 2026-07-29 所有者复核与运行时接入

所有者对四组候选叠图回复“全过”，因此第一批样板、其余九种形态和三张损坏覆盖层均已转入正式资源目录；`samples/`、`candidates/` 与色键原图继续保留作为生成证据，没有覆盖或删除。

- 新底图已由 `src/assets/asset-manifest.json` 正式引用：`maps/garden-base-owner-candidate-v2.png`。
- 四座设施的正式运行时资源位于各自的 `magic-greenhouse/`、`fairy-garden/`、`moon-spring/` 与 `banquet-plaza/` 目录，文件名统一保留 `-v2`。
- 四座设施均登记了独立的 `width_ratio`、`render_center`、`ground_anchor`、`label_anchor` 与 `hit_polygon`；背景房屋不自动转为交互设施，旧主屋继续使用旧版回退位置。
- 地图点击命中改为“角色优先、精确设施多边形其次、旧区域圆形回退最后”，避免中央庭院的宽泛命中区抢占设施点击。
- 离线宽屏 `1440×1000` 与窄屏 `390×844` 已检查：设施落点、遮挡和响应式地图裁切正常，页面日志无项目脚本警告或错误。
- `npm run check:ui`、`npm test`（134/134）与 `npm run build:ui` 已通过。

尚未宣称真实 SillyTavern 验收。下一门只剩在真实 iframe 中复核点击、拖动／缩放后的菜单跟随、损坏覆盖层和窄屏宿主裁切；未经明确授权不得占用或覆盖 `0.2.0-r54` 检查点。
