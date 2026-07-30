# V3 庭园地图设施素材清单

## 2026-07-30 接入状态

- 13 张正常形态已完成差分抠图、同组画布正规化并接入运行时，状态为 `owner-provided-v3-integrated-pending-runtime-validation`。
- 正式透明画布：魔法温室 `608×528`、妖精花园 `592×464`、月见温泉 `624×464`、宴会广场 `656×464`；全部至少保留 24px 透明安全边。温室画布于标注修复后扩展，用于容纳人偶形态的屋脊／右侧人偶区／底部构件，以及河童形态的顶部管道／左右设备／底部基座。
- 2026-07-30 所有者已确认两张温室修复图通过：`magic-greenhouse-doll-maintained-v3.png` SHA-256 为 `5cdd7c484b0da736777fea4c0d903cd5d4f9af1c04c61dafb28a2e49f6e396b2`，`magic-greenhouse-kappa-automated-v3.png` SHA-256 为 `5b12d408c3b878f8d254ff23cf1702fd166109a946603ef9f7216967999b0956`。该确认只关闭正常形态缺块问题，不等同于真实 SillyTavern 运行时验收。
- 可复现脚本：`旧素材/素材处理/extract_facility_differences.py` → `scripts/prepare-v3-facility-assets.py`；哈希与画布报告见 `project/v3-facility-asset-preparation-report.json`。
- 所有者于 2026-07-30 提供一张完整透明废墟图，并明确指定为三座后续设施共用的废墟形态。现已按三组画布确定性正规化为 `fairy-garden-ruins-v3.png`、`moon-spring-ruins-v3.png`、`banquet-plaza-ruins-v3.png`；损坏时替换正常形态，不再使用覆盖层。
- 废墟源图 SHA-256 为 `9a00186d…f0b5b1e7`；未使用生成模型重绘，原始字节归档于 `旧素材/素材处理/facility-ruin-shared-v3/`，处理脚本与完整输出哈希见 `scripts/prepare-shared-facility-ruins.py`、`project/shared-facility-ruin-report.json`。
- 本轮完整门禁 `check:ui`、`npm test`（153/153）、`build:ui` 与 r54 `package:checkpoint:dry` 全绿；最新 dry-run 为 `86,743,293` bytes、SHA-256 `5083dcf8…633afd68`。未正式打包或覆盖现有 r54。
- 所有者全景差分中的装饰人物与设施招牌按原图保留，作为本批素材的明确来源特征；若后续决定改为空牌匾或无人版，应在同一画布内原位替换，不改变 manifest 形态键或几何。
- 当前只有离线构建与浏览器证据；真实 SillyTavern 验收通过前不得把状态改成 runtime validated。

## 基准底图

- 文件：`src/assets/maps/garden-base-owner-v3.png`
- 尺寸：`1672×941`，横向俯视像素场景
- 光照：左上／上方自然光，阴影向右下收束
- 主屋：已经烘焙在底图中央偏上，不再需要完整主屋建筑贴图
- 当前策略：V3 正常形态已启用；未建设施继续显示交互地块标记；妖精花园、月见温泉、宴会广场进入 `damaged` 时改画同组画布的共享废墟替换图，`normal`／`abnormal` 保留当前正常形态

## 必需设施素材（16 张）

| 设施组 | 建议落位（归一化中心） | 正常形态素材 | 损坏素材 |
|---|---:|---|---|
| 魔法温室 | 左上空地 `0.19, 0.27` | `基础魔法温室`、`自由生长型温室`、`人偶维护型温室`、`河童自动化型温室` | 暂无独立损坏状态要求 |
| 妖精花园 | 右上空地 `0.81, 0.36` | `四季花境`、`妖精游乐庭`、`冰露迷宫` | `fairy-garden-ruins-v3.png` 替换图 |
| 月见温泉 | 左下空地 `0.22, 0.70` | `露天月见汤`、`静水观测池`、`雾隐汤屋` | `moon-spring-ruins-v3.png` 替换图 |
| 宴会广场 | 右下空地 `0.78, 0.69` | `灯火夜市`、`鬼之大宴台`、`符卡演武场` | `banquet-plaza-ruins-v3.png` 替换图 |

合计：13 张正常形态图 + 3 张共享废墟替换图 = 16 张。

## 建议追加的主屋状态层（2 张）

底图中的主屋为完整启用状态。若要继续让教程里的主屋维修阶段有明显视觉变化，还需要：

1. `主屋-损坏覆盖层`：破瓦、断栏、封窗、散落木料等。
2. `主屋-临时修复覆盖层`：脚手架、补丁瓦、临时木板与施工材料等。

`启用` 状态直接使用底图，不另出图。主屋两张覆盖层最好使用 `1672×941` 全画布透明 PNG，以保证与底图建筑逐像素对齐。

## 交付规范

- 格式：透明背景 `PNG / RGBA`，禁止 JPG、纯色底或棋盘格底。
- 风格：与 V3 底图一致的高细节像素风、同一俯视角和像素密度。
- 内容：只画设施及其贴地阴影；不要包含人物、文字、按钮、地图边框或大面积重复地面。
- 尺寸：完整设施建议源图宽度 `512–768px`；最终地图显示宽度约为底图的 `22%–27%`。
- 对齐：同一设施组的所有形态必须使用完全相同的透明画布尺寸、地面接触点和视觉中心。
- 损坏替换图：必须与该设施组正常形态同尺寸、同锚点；它是完整废墟形态，`damaged` 时替换正常图，不与正常建筑叠加。
- 边缘：保留柔和落地阴影，但不要把阴影裁断；外圈至少留 `16px` 透明安全边。
- 避让：设施主体不要压住中央主路、底部溪流／红桥或主屋前阶梯。

## 建议文件名

```text
magic-greenhouse-base-v3.png
magic-greenhouse-free-growth-v3.png
magic-greenhouse-doll-maintained-v3.png
magic-greenhouse-kappa-automated-v3.png

fairy-garden-four-season-v3.png
fairy-garden-playground-v3.png
fairy-garden-ice-dew-maze-v3.png
fairy-garden-ruins-v3.png

moon-spring-open-air-v3.png
moon-spring-still-water-observation-v3.png
moon-spring-mist-hidden-bathhouse-v3.png
moon-spring-ruins-v3.png

banquet-plaza-lantern-market-v3.png
banquet-plaza-oni-grand-feast-v3.png
banquet-plaza-spell-card-arena-v3.png
banquet-plaza-ruins-v3.png

main-house-damaged-overlay-v3.png
main-house-temporary-repair-overlay-v3.png
```

## 共享废墟接入记录与后续验收

### 0. 开工前锁定边界

1. 先读 `project/README.md`、`project/agent-handoff.md` 最新条目、本文件和当前 `git status`。
2. 工作树中已有地图、UI、素材归档和 V3 接入改动，均视为所有者现有成果；不得清理、回退或用旧文件覆盖。
3. 三张设施废墟替换图及其接入已完成：
   - `fairy-garden-ruins-v3.png`
   - `moon-spring-ruins-v3.png`
   - `banquet-plaza-ruins-v3.png`
4. 主屋两张状态层是可选扩展，不得与三张设施废墟替换图混做；须等所有者另行确认。
5. 本轮允许离线构建和 checkpoint dry-run，不允许正式打包、覆盖 `0.2.0-r54` 或生成可分发检查点。`battle-bullets-etama3-local-v1.png` 为所有者提供并经 AI 生成修改的项目素材，允许进入后续获授权的项目检查点。

### 1. 制作三张共享废墟替换图

1. 所有者提供的 `1536×1024` RGBA 源图本身已有有效透明通道；处理仅裁掉 alpha `<8` 的几乎不可见暗场、清除隐藏 RGB，并按组缩放／落位，没有生成或重画废墟。
2. 三张正式图使用相同废墟内容，但分别服从同组现行画布和底部接地点；外圈保持至少 `24px` 全透明。
3. 维护源、地图合成预览和原始哈希归档于 `旧素材/素材处理/facility-ruin-shared-v3/`；正式产物只位于对应 `src/assets/world/map-facilities/<group>/`。

### 2. 正规化与素材门禁

| 替换图 | 必须画布 | 对齐要求 |
|---|---:|---|
| 妖精花园 | `592×464` | 与三张 fairy-garden V3 正常形态逐像素同画布 |
| 月见温泉 | `624×464` | 与三张 moon-spring V3 正常形态逐像素同画布 |
| 宴会广场 | `656×464` | 与三张 banquet-plaza V3 正常形态逐像素同画布 |

- 文件必须为 PNG/RGBA；透明像素的 RGB 必须清零。
- 外圈至少保留 `16px` 全透明安全边；不得裁断碎片、烟痕或落地阴影。
- 不改变现行 `width_ratio`、`render_center`、`ground_anchor`、`label_anchor` 或 `hit_polygon`。
- 废墟不与正常形态合成；地图合成预览必须检查三处地块的落地、道路／溪流／红桥避让和整体比例。
- 可扩展 `scripts/prepare-v3-facility-assets.py` 或新增单用途确定性脚本完成尺寸、alpha、隐藏 RGB、边界和哈希报告；不得靠手工反复另存制造不可复现产物。

### 3. 接入范围

所有者已明确指定该图作为设施废墟，因此维护源按下列合同接入：

1. 在 `src/assets/asset-manifest.json` 的 `fairy_garden`、`moon_spring`、`banquet_plaza` 条目分别登记精确的 `damage_replacement_alpha` 路径。
2. 将 `maps.garden_base.facility_layer_policy`、三组 `status`、`render_contract` 与 `provenance` 更新为“共享废墟替换已接入、真实运行待验收”。
3. `src/ui/garden-map.ts` 只有在 `facility_runtime.<id>.status === 'damaged'` 时用废墟替换当前形态；`normal`、`abnormal`、未建设和魔法温室不得误用。
4. `scripts/build-ui.mjs` 复用现有设施复制、内嵌和同组画布校验链，并增加替换图字段，不另造第二套资源注入路径。
5. 更新 `tests/ui-contract.test.mjs`：
   - 三条 manifest 路径精确断言；
   - 替换图与同组正常形态画布一致、RGBA、透明安全边与隐藏 RGB 合格；
   - damaged 状态返回废墟源，normal／abnormal 返回原正常形态；
   - 魔法温室继续无独立损坏覆盖层；
   - 构建后的预览路径与自包含 data URL 均存在。

### 4. 离线验收顺序

```bash
npm run check:ui
npm test
npm run build:ui
npm run package:checkpoint:dry
```

随后在离线浏览器完成：

1. 桌面与 `390×844` 各检查三组设施的正常／废墟切换。
2. 每组至少检查一种正常形态的命中、选中光、标签、角色落脚和目标菜单跟随；素材合成另须覆盖同组三形态。
3. 检查地图拖拽、滚轮／触控缩放、软边界回弹和损坏层同步变换。
4. 控制台不得出现资源 404、图片解码、未处理 Promise、布局或项目脚本警告／错误。
5. 记录新的测试总数、dry-run 字节数和 SHA-256；这里只是候选证据，不等于真实宿主验收。

### 5. 真实 SillyTavern 验收

离线门禁全绿后，使用 `sillytavern-runtime-debug` 在项目声明的 SillyTavern 1.18.0 + Tavern Helper 4.8.19 + MagVarUpdate 环境复核：

1. iframe 中三张废墟替换图均由自包含资源链加载，不依赖本机预览相对路径。
2. 三组设施从正常切到 damaged 时替换为废墟、修复后恢复当前正常形态，状态标签和实际画面一致。
3. 100%／125%／200% 浏览器缩放、地图自身缩放、320px／390px／短视口下，点击、菜单、焦点与触控仍正常。
4. 拖拽、pointercancel、reduced-motion、全屏、聊天切换、重挂载和卸载恢复均无残留。
5. 控制台和网络面板无项目错误；保存截图或等价证据，并将结果写回 `project/agent-handoff.md` 与本文件。

只有完成所有者视觉确认和真实宿主验收后，才可把相关状态标记为 runtime validated。若真实宿主暴露实现问题，先回维护源修复并重跑完整离线门禁；不得只改 `dist/`。
