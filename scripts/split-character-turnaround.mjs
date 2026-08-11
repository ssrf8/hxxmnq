// 幻想乡物语:通用静态视图(turnaround)切割。把 1254×1254 静态合帧
// 切成 front/back/left/right 独立方向图,并按运行时 facingCell 布局
// 拼回整图(front=(0,0) back=(1,0) left=(0,1) right=(1,1))。
// 用法: node scripts/split-character-turnaround.mjs --char=youmu
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const CHAR = process.argv.find((a) => a.startsWith('--char='))?.split('=')[1] ?? 'youmu';

const CONFIGS = {
  patchouli: {
    src: 'src/assets/characters/patchouli/ChatGPT Image 2026年8月6日 12_01_17..png',
    layout: 'grid',
    defaultX: 627, defaultY: 627,
    // 左上=front、左下=back、右上=left、右下=right。
    dirs: [
      { name: 'front', sx: 0, sy: 0, outX: 0, outY: 0 },
      { name: 'back',  sx: 0, sy: 1, outX: 1, outY: 0 },
      { name: 'left',  sx: 1, sy: 0, outX: 0, outY: 1 },
      { name: 'right', sx: 1, sy: 1, outX: 1, outY: 1 },
    ],
  },
  youmu: {
    src: 'src/assets/characters/youmu/ChatGPT Image 2026年8月6日 11_56_14..png',
    layout: 'grid',
    defaultX: 649, defaultY: 612,
    // 左上=front、左下=back、右上=left、右下=right。
    dirs: [
      { name: 'front', sx: 0, sy: 0, outX: 0, outY: 0 },
      { name: 'back',  sx: 0, sy: 1, outX: 1, outY: 0 },
      { name: 'left',  sx: 1, sy: 0, outX: 0, outY: 1 },
      { name: 'right', sx: 1, sy: 1, outX: 1, outY: 1 },
    ],
  },
  sanae: {
    src: 'src/assets/characters/sanae/ChatGPT Image 2026年8月6日 23_51_23.png',
    layout: 'horizontal-three',
    defaultX: 418, defaultY: 836,
    // 横向三视图依次为 front、left、back；right 由 left 逐像素镜像。
    dirs: [
      { name: 'front', column: 0, outX: 0, outY: 0 },
      { name: 'back',  column: 2, outX: 1, outY: 0 },
      { name: 'left',  column: 1, outX: 0, outY: 1 },
      { name: 'right', column: 1, outX: 1, outY: 1, mirrorOf: 'left' },
    ],
  },
};

const CFG = CONFIGS[CHAR];
if (!CFG) throw new Error(`未知角色: ${CHAR}(可用 ${Object.keys(CONFIGS).join('/')})`);
const SRC = path.join(ROOT, CFG.src);
const OUT = path.join(ROOT, arg('out-dir', `src/assets/characters/${CHAR}/static-v1`));
const X = parseInt(arg('x', String(CFG.defaultX)), 10);
const Y = parseInt(arg('y', String(CFG.defaultY)), 10);

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
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

function sourceRect(direction, width, height) {
  if (CFG.layout === 'horizontal-three') {
    const bounds = [0, X, Y, width];
    const start = bounds[direction.column];
    return { sx0: start, sy0: 0, w: bounds[direction.column + 1] - start, h: height };
  }
  return {
    sx0: direction.sx ? X : 0,
    sy0: direction.sy ? Y : 0,
    w: direction.sx ? width - X : X,
    h: direction.sy ? height - Y : Y,
  };
}

function main() {
  if (!fs.existsSync(SRC)) throw new Error(`源图不存在: ${SRC}`);
  const src = PNG.sync.read(fs.readFileSync(SRC));
  const W = src.width, H = src.height;
  console.log(`${CHAR} 静态图 ${W}×${H},切割点 x=${X}, y=${Y}`);

  for (const d of CFG.dirs) fs.mkdirSync(path.join(OUT, d.name), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'preview'), { recursive: true });

  const frames = {};
  const report = { character: CHAR, source: CFG.src, split: { x: X, y: Y }, dirs: {} };
  for (const d of CFG.dirs) {
    const { sx0, sy0, w, h } = sourceRect(d, W, H);
    let f = crop(src, sx0, sy0, w, h);
    if (d.mirrorOf) f = mirrorH(f);
    frames[d.name] = f;
    fs.writeFileSync(path.join(OUT, d.name, '001.png'), PNG.sync.write(f));
    const bb = bbox(f);
    report.dirs[d.name] = { sourceQuad: [sx0, sy0, w, h], size: [f.width, f.height], bbox: bb.box, mirrorOf: d.mirrorOf ?? null };
    console.log(`${d.name.padEnd(5)} 源[${sx0},${sy0}] ${w}×${h} → ${f.width}×${f.height}  内容 ${bb.box}${d.mirrorOf ? ' ←mirror(' + d.mirrorOf + ')' : ''}`);
  }

  // 按运行时 facingCell 布局拼回整图。因切割点非对称,四方向尺寸不同,
  // 统一取正方形格 cell=最大宽,各方向居中放入(不足部分透明),整图 cell*2 × cell*2。
  const cell = Math.max(...CFG.dirs.map((d) => frames[d.name].width), ...CFG.dirs.map((d) => frames[d.name].height));
  const stitched = new PNG({ width: cell * 2, height: cell * 2 });
  for (const d of CFG.dirs) {
    const f = frames[d.name];
    const ox = Math.round((cell - f.width) / 2), oy = Math.round((cell - f.height) / 2);
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const si = (y * f.width + x) * 4;
        const tx = d.outX * cell + ox + x, ty = d.outY * cell + oy + y;
        const di = (ty * stitched.width + tx) * 4;
        for (let c = 0; c < 4; c++) stitched.data[di + c] = f.data[si + c];
      }
    }
  }
  fs.writeFileSync(path.join(OUT, `${CHAR}-turnaround-v1.png`), PNG.sync.write(stitched));
  report.turnaround = `${CHAR}-turnaround-v1.png`;
  report.turnaroundGrid = [cell, cell];
  fs.writeFileSync(path.join(OUT, 'split-manifest.json'), JSON.stringify(report, null, 2));

  // 接触表
  const cellW = 320, cellH = 320;
  const sheet = new PNG({ width: cellW * 4, height: cellH + 24 });
  for (let y = 0; y < cellH + 24; y++) for (let x = 0; x < cellW * 4; x++) {
    const i = (y * sheet.width + x) * 4;
    sheet.data[i] = (((x >> 4) + (y >> 4)) & 1) ? 46 : 34;
    sheet.data[i + 1] = (((x >> 4) + (y >> 4)) & 1) ? 49 : 36;
    sheet.data[i + 2] = (((x >> 4) + (y >> 4)) & 1) ? 60 : 46;
    sheet.data[i + 3] = 255;
  }
  CFG.dirs.forEach((d, idx) => {
    const f = frames[d.name];
    const dw = cellW, dh = cellH;
    const scale = Math.min(dw / f.width, dh / f.height);
    const ow = Math.max(1, Math.round(f.width * scale));
    const oh = Math.max(1, Math.round(f.height * scale));
    const ox = idx * cellW + Math.floor((dw - ow) / 2);
    const oy = 24 + Math.floor((dh - oh) / 2);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const sx = Math.min(f.width - 1, Math.floor((x / ow) * f.width));
      const sy = Math.min(f.height - 1, Math.floor((y / oh) * f.height));
      const si = (sy * f.width + sx) * 4;
      const di = ((oy + y) * sheet.width + (ox + x)) * 4;
      for (let c = 0; c < 4; c++) sheet.data[di + c] = f.data[si + c];
    }
  });
  fs.writeFileSync(path.join(OUT, 'preview', `${CHAR}-turnaround-contact-sheet.png`), PNG.sync.write(sheet));
  console.log(`完成: ${OUT}`);
  console.log(`整图: ${path.join(OUT, `${CHAR}-turnaround-v1.png`)}`);
}

main();
