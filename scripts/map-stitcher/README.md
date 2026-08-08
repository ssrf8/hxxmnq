# 地图拼接编辑器

把两张地图（现有庭园底图 + 新地图图片）在浏览器里可视化拼接，微调位置后导出**拼接参数 JSON**，交给 AI 据此把新地图实际嵌入项目（合成新底图、更新 manifest / 蒙版 / 归一化坐标等）。

## 启动

```bash
node scripts/map-stitcher/start.mjs
```

然后打开 <http://127.0.0.1:8917/>（默认端口 8917，可传参改端口）。

> 也可以直接双击 `index.html` 用 `file://` 打开，但这样「加载项目默认底图」按钮不可用（浏览器禁止 file:// 跨文件读取），需手动选择底图文件。建议用服务器方式。

## 操作

| 操作 | 效果 |
|---|---|
| 「加载底图」 / 「加载新地图」 | 选择两张图（默认底图按钮从项目 `src/assets/maps/` 加载） |
| 拖动新图 | 调整 offsetX / offsetY（按住 `Shift` 锁水平、`Alt` 锁垂直） |
| 空白处拖动 | 平移视图 |
| 滚轮 | 缩放视图（以光标为中心） |
| `↑↓←→` / `Shift` / `Ctrl` | 1px / 10px / 100px 微调 |
| `空格` 按住 | 新图以 100% 不透明显示（对完位检查缝隙） |
| `G` | 开关网格 |
| 「⬇ 新图接在下方」等预设 | 一键把新图放到底图下方 / 上方 / 下方居中 |
| 「左/右/顶/底/水平居中」 | 边缘对齐 |

## 输出

- **参数面板**：实时 JSON，语义为「新图左上角在最终合成画布中的像素坐标」：

  ```json
  {
    "base":   { "source": "src/assets/maps/garden-base-owner-v3.png", "width": 1672, "height": 941 },
    "layers": [ { "source": "新图.png", "width": 1672, "height": 941, "offsetX": 0, "offsetY": 941, "scale": 1 } ],
    "canvas": { "width": 1672, "height": 1882 }
  }
  ```

- **复制参数 JSON**：把结果发给 AI 即可。
- **导出合成 PNG**：全分辨率合成结果（透明/白/黑底色可选），用于人工核对。

## 嵌入时会改动的文件（AI 侧）

拿到参数后，AI 嵌入新地图需要同步更新：

1. `src/assets/maps/`：合成新底图 PNG + Q70 WebP 运行版（新命名，如 `garden-base-owner-v4`）。
2. `src/assets/asset-manifest.json`：`maps.garden_base.source` / `canvas`。
3. `src/assets/maps/garden-no-walk-mask-v1.svg`：画布扩展到新尺寸（旧阻挡形状坐标不变，保持在上半部分；新区域如需阻挡另加形状，保持 `fill="#ff00ff"` + `fill-rule="evenodd"` 合同）。
4. `src/ui/garden-map.ts`：`CHARACTER_FOOT_OFFSET_Y`（`54/941` → `54/新高`）、`[1672, 941]` 蒙版画布、内置采样点（`720/941`、`826/941`）。
5. `src/ui/garden-navigation.ts`：脚底半径 `7/941` → `7/新高`。
6. `src/ui/garden-spatial.ts`：`GARDEN_AREA_POSITIONS` 归一化 y 坐标按 `941/新高` 重算；若新图含新区域再补 `GARDEN_AREA_LABELS`。
7. `tests/`：如测试断言了底图尺寸，需同步。
