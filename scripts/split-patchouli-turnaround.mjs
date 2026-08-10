// 幻想乡物语:把 patchouli 静态四视图(turnaround 源图 1254×1254)按十字线
// 参数切割为 front/back/left/right 四个独立方向帧,并重新拼回 1254×1254 整图。
// 用法: node scripts/split-patchouli-turnaround.mjs [--out-dir=...] [--x=627] [--y=627]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src/assets/characters/patchouli/ChatGPT Image 2026年8月6日 12_01_17..png');

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
}
const X = parseInt(arg('x', '627'), 10);
const Y = parseInt(arg('y', '627'), 10);
const OUT = path.join(ROOT, arg('out-dir', 'src/assets/characters/patchouli/static-v1'));

// 源图象限真实内容(经所有者观察确认,静态图与序列帧源图布局不同):
//   左上=front、左下=back、右上=left、右下=right(右下半残,不用)
//   right 采用 left 的水平翻转作为替代(所有者批准镜像)
// outX/outY = 运行时 facingCell 布局(front=(0,0) back=(1,0) left=(0,1) right=(1,1))
const DIRECTIONS = [
  { name: 'front', sx: 0, sy: 0, outX: 0, outY: 0 },
  { name: 'back',  sx: 0, sy: 1, outX: 1, outY: 0 },  // 左下
  { name: 'left',  sx: 1, sy: 0, outX: 0, outY: 1 },  // 右上
  { name: 'right', sx: 1, sy: 0, outX: 1, outY: 1, mirrorOf: 'left' },  // = mirror(右上)
];

// 水平翻转 PNG(透明保留)
function mirrorH(png) {
  const out = new PNG({ width: png.width, height: png.height });
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const si = (y * png.width + x) * 4;
      const di = (y * png.width + (png.width - 1 - x)) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = png.data[si + c];
    }
  }
  return out;
}

function crop(srcPng, sx0, sy0, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((sy0 + y) * srcPng.width + (sx0 + x)) * 4;
      const di = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = srcPng.data[si + c];
    }
  }
  return out;
}

function bbox(png) {
  let minx = Infinity, miny = Infinity, maxx = -1, maxy = -1, opaque = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 40) {
        opaque++;
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }
  return { opaque, box: opaque ? [minx, miny, maxx, maxy] : null };
}

function main() {
  if (!fs.existsSync(SRC)) throw new Error(`源图不存在: ${SRC}`);
  const src = PNG.sync.read(fs.readFileSync(SRC));
  const W = src.width, H = src.height;
  console.log(`源图 ${W}×${H},切割点 x=${X}, y=${Y}`);
  if (X <= 0 || Y <= 0 || X >= W || Y >= H) throw new Error('切割点越界');

  const quadSpecs = DIRECTIONS.map((d) => ({
    ...d,
    sx0: d.sx ? X : 0,
    sy0: d.sy ? Y : 0,
    w: d.sx ? W - X : X,
    h: d.sy ? H - Y : Y,
  }));

  // 输出目录
  for (const d of DIRECTIONS) fs.mkdirSync(path.join(OUT, d.name), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'preview'), { recursive: true });

  // 1) 切割四方向
  const frames = {};
  const report = {};
  for (const q of quadSpecs) {
    let f = crop(src, q.sx0, q.sy0, q.w, q.h);
    if (q.mirrorOf) f = mirrorH(f); // right = mirror(left)
    frames[q.name] = f;
    const p = path.join(OUT, q.name, '001.png');
    fs.writeFileSync(p, PNG.sync.write(f));
    const bb = bbox(f);
    report[q.name] = { size: [f.width, f.height], bbox: bb.box, opaquePx: bb.opaque, mirrorOf: q.mirrorOf ?? null };
    console.log(`${q.name.padEnd(5)} [${q.sx0},${q.sy0}] ${f.width}×${f.height}  内容 ${bb.box}${q.mirrorOf ? '  ←mirror(' + q.mirrorOf + ')' : ''}`);
  }

  // 2) 按运行时 facingCell 布局拼回整图(front/back/left/right → 2×2)
  const stitched = new PNG({ width: W, height: H });
  for (const q of quadSpecs) {
    const f = frames[q.name];
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const si = (y * f.width + x) * 4;
        const di = ((q.outY * H / 2 + y) * W + (q.outX * W / 2 + x)) * 4;
        for (let c = 0; c < 4; c++) stitched.data[di + c] = f.data[si + c];
      }
    }
  }
  const hasMirror = quadSpecs.some((q) => q.mirrorOf);
  let identical = false;
  if (!hasMirror) {
    identical = true;
    for (let i = 0; i < stitched.data.length; i++) {
      if (stitched.data[i] !== src.data[i]) { identical = false; break; }
    }
  }
  const turnaroundPath = path.join(OUT, 'patchouli-turnaround-v1.png');
  fs.writeFileSync(turnaroundPath, PNG.sync.write(stitched));
  console.log(`拼回整图 ${W}×${H}: ${hasMirror ? '含镜像方向,不做逐像素断言(右方向为 left 镜像)' : identical ? '与源图逐像素一致 ✔' : '不一致 ✘'}`);
  report.stitchedIdentical = identical;
  report.source = SRC;
  report.split = { x: X, y: Y };
  fs.writeFileSync(path.join(OUT, 'split-manifest.json'), JSON.stringify(report, null, 2));

  // 3) 预览接触表:四方向并排(透明棋盘底)
  const cellW = 320, cellH = 320;
  const sheet = new PNG({ width: cellW * 4, height: cellH + 24 });
  const check = (x, y) => (((x >> 4) + (y >> 4)) & 1) ? [46, 49, 60, 255] : [34, 36, 46, 255];
  for (let y = 0; y < cellH + 24; y++) for (let x = 0; x < cellW * 4; x++) {
    const [r, g, b] = check(x, y);
    const i = (y * sheet.width + x) * 4;
    sheet.data[i] = r; sheet.data[i + 1] = g; sheet.data[i + 2] = b; sheet.data[i + 3] = 255;
  }
  DIRECTIONS.forEach((d, idx) => {
    const f = frames[d.name];
    const dw = cellW, dh = cellH;
    const scale = Math.min(dw / f.width, dh / f.height);
    const ow = Math.max(1, Math.round(f.width * scale));
    const oh = Math.max(1, Math.round(f.height * scale));
    const ox = idx * cellW + Math.floor((dw - ow) / 2);
    const oy = 24 + Math.floor((dh - oh) / 2);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const sx = Math.floor((x / ow) * f.width);
      const sy = Math.floor((y / oh) * f.height);
      const si = (sy * f.width + sx) * 4;
      const di = ((oy + y) * sheet.width + (ox + x)) * 4;
      for (let c = 0; c < 4; c++) sheet.data[di + c] = f.data[si + c];
    }
    // 标签
    const label = d.name;
    for (let i = 0; i < label.length; i++) {
      const ch = label.charCodeAt(i);
      const x = ox + 10 + i * 12, y = 16;
      if (x + 10 < sheet.width && y < sheet.height) {
        const si = (y * sheet.width + x) * 4;
        sheet.data[si] = 255; sheet.data[si + 1] = 230; sheet.data[si + 2] = 0; sheet.data[si + 3] = 255;
      }
    }
  });
  const sheetPath = path.join(OUT, 'preview', 'patchouli-turnaround-contact-sheet.png');
  fs.writeFileSync(sheetPath, PNG.sync.write(sheet));
  console.log(`预览接触表: ${sheetPath}`);
  console.log(`报告: ${path.join(OUT, 'split-manifest.json')}`);
}

main();
