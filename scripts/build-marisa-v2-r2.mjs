import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const CELL = 209;
const TARGET_H = 150;
const LOW_BOTTOM = 179;
const HIGH_RISE = 8;
const ROOT = path.resolve('src/assets/characters/marisa');
const KF_DIR = path.join(ROOT, 'v2-hover-keyframes');

function loadPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function contentBBox(png) {
  const { width: w, height: h, data } = png;
  let minx = w;
  let miny = h;
  let maxx = -1;
  let maxy = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (w * y + x) << 2;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 10 && !(r < 18 && g < 18 && b < 18)) {
        if (x < minx) minx = x;
        if (y < miny) miny = y;
        if (x > maxx) maxx = x;
        if (y > maxy) maxy = y;
      }
    }
  }
  if (maxx < 0) return null;
  return {
    minx,
    miny,
    maxx: maxx + 1,
    maxy: maxy + 1,
    w: maxx - minx + 1,
    h: maxy - miny + 1,
  };
}

function cellBBox(cell) {
  let minx = CELL;
  let miny = CELL;
  let maxx = -1;
  let maxy = -1;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const i = (CELL * y + x) << 2;
      if (cell.data[i + 3] > 10) {
        if (x < minx) minx = x;
        if (y < miny) miny = y;
        if (x > maxx) maxx = x;
        if (y > maxy) maxy = y;
      }
    }
  }
  if (maxx < 0) return null;
  return {
    minx,
    miny,
    maxx: maxx + 1,
    maxy: maxy + 1,
    h: maxy - miny + 1,
    bottom: maxy + 1,
    cx: (minx + maxx + 1) / 2,
  };
}

function shiftCell(srcCell, dx, dy) {
  const out = new PNG({ width: CELL, height: CELL });
  out.data.fill(0);
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const sx = x - dx;
      const sy = y - dy;
      if (sx < 0 || sy < 0 || sx >= CELL || sy >= CELL) continue;
      const si = (CELL * sy + sx) << 2;
      const a = srcCell.data[si + 3];
      if (!a) continue;
      const di = (CELL * y + x) << 2;
      out.data[di] = srcCell.data[si];
      out.data[di + 1] = srcCell.data[si + 1];
      out.data[di + 2] = srcCell.data[si + 2];
      out.data[di + 3] = a;
    }
  }
  return out;
}

// Scale each source independently so visible height hits TARGET_H.
function placeToTarget(png, targetH = TARGET_H) {
  const bbox = contentBBox(png);
  if (!bbox) throw new Error('empty source');
  const scale = targetH / bbox.h;
  const dw = Math.max(1, Math.round(bbox.w * scale));
  const dh = Math.max(1, Math.round(bbox.h * scale));
  const cell = new PNG({ width: CELL, height: CELL });
  cell.data.fill(0);
  const destBottom = LOW_BOTTOM;
  const destTop = destBottom - dh;
  const destLeft = Math.round((CELL - dw) / 2);
  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const sx = bbox.minx + Math.min(bbox.w - 1, Math.floor(x / scale));
      const sy = bbox.miny + Math.min(bbox.h - 1, Math.floor(y / scale));
      const si = (png.width * sy + sx) << 2;
      const r = png.data[si];
      const g = png.data[si + 1];
      const b = png.data[si + 2];
      const a = png.data[si + 3];
      if (a <= 10 || (r < 18 && g < 18 && b < 18)) continue;
      const dx = destLeft + x;
      const dy = destTop + y;
      if (dx < 0 || dy < 0 || dx >= CELL || dy >= CELL) continue;
      const di = (CELL * dy + dx) << 2;
      cell.data[di] = r;
      cell.data[di + 1] = g;
      cell.data[di + 2] = b;
      cell.data[di + 3] = 255;
    }
  }
  return cell;
}

function makeHover(low, high, t, sway = 0) {
  const pose = t >= 0.55 ? high : low;
  const rise = Math.round(HIGH_RISE * Math.max(0, Math.min(1, t)));
  return shiftCell(pose, sway, -rise);
}

const keys = {
  rightLow: loadPng(path.join(KF_DIR, 'marisa-hover-v2-right-low.png')),
  rightHigh: loadPng(path.join(KF_DIR, 'marisa-hover-v2-right-high.png')),
  leftLow: loadPng(path.join(KF_DIR, 'marisa-hover-v2-left-low.png')),
  leftHigh: loadPng(path.join(KF_DIR, 'marisa-hover-v2-left-high.png')),
  downLow: loadPng(path.join(KF_DIR, 'marisa-hover-v2-down-low.png')),
  downHigh: loadPng(path.join(KF_DIR, 'marisa-hover-v2-down-high.png')),
  upLow: loadPng(path.join(KF_DIR, 'marisa-hover-v2-up-low.png')),
  upHigh: loadPng(path.join(KF_DIR, 'marisa-hover-v2-up-high.png')),
};

const base = Object.fromEntries(
  Object.entries(keys).map(([name, png]) => [name, placeToTarget(png)]),
);

for (const [name, cell] of Object.entries(base)) {
  console.log(name, cellBBox(cell));
}

// Hover rhythm: low → rise → high → fall. Not ground-walk cadence.
const HORIZ_T = [0.0, 0.28, 0.55, 1.0, 0.72, 0.4, 0.08, 0.22];
const HORIZ_SWAY = [0, 1, 1, 0, -1, -1, 0, 1];
const VERT_T = [0.0, 0.5, 1.0, 0.45];
const IDLE_T = [0.12, 0.4, 0.7, 0.35];

const dir00 = (low, high) => makeHover(low, high, 0.22, 0);
const slots = Array.from({ length: 4 }, () => Array.from({ length: 9 }, () => null));

for (let i = 0; i < 4; i += 1) {
  slots[0][i] = makeHover(base.downLow, base.downHigh, IDLE_T[i], 0);
}
slots[0][4] = dir00(base.upLow, base.upHigh);
for (let i = 0; i < 4; i += 1) {
  slots[0][5 + i] = makeHover(base.upLow, base.upHigh, VERT_T[i], 0);
}

slots[1][0] = dir00(base.downLow, base.downHigh);
for (let i = 0; i < 4; i += 1) {
  slots[1][1 + i] = makeHover(base.downLow, base.downHigh, VERT_T[i], 0);
}

slots[2][0] = dir00(base.leftLow, base.leftHigh);
for (let i = 0; i < 8; i += 1) {
  slots[2][1 + i] = makeHover(base.leftLow, base.leftHigh, HORIZ_T[i], HORIZ_SWAY[i]);
}

slots[3][0] = dir00(base.rightLow, base.rightHigh);
for (let i = 0; i < 8; i += 1) {
  slots[3][1 + i] = makeHover(base.rightLow, base.rightHigh, HORIZ_T[i], -HORIZ_SWAY[i]);
}

const atlas = new PNG({ width: CELL * 9, height: CELL * 4 });
atlas.data.fill(0);
let filled = 0;
const heights = [];
const bottoms = [];
for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 9; col += 1) {
    const cell = slots[row][col];
    if (!cell) {
      console.log(`r${row}c${col}: EMPTY`);
      continue;
    }
    filled += 1;
    const b = cellBBox(cell);
    heights.push(b.h);
    bottoms.push(b.bottom);
    console.log(`r${row}c${col}: h=${b.h} bottom=${b.bottom} cx=${b.cx.toFixed(1)} miny=${b.miny}`);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const si = (CELL * y + x) << 2;
        if (!cell.data[si + 3]) continue;
        const dx = col * CELL + x;
        const dy = row * CELL + y;
        const di = (atlas.width * dy + dx) << 2;
        atlas.data[di] = cell.data[si];
        atlas.data[di + 1] = cell.data[si + 1];
        atlas.data[di + 2] = cell.data[si + 2];
        atlas.data[di + 3] = cell.data[si + 3];
      }
    }
  }
}

const outPath = path.join(ROOT, 'marisa-animation-v2-r2.png');
fs.writeFileSync(outPath, PNG.sync.write(atlas));
console.log('wrote', outPath, `${atlas.width}x${atlas.height}`, 'filled', filled);
console.log('height range', Math.min(...heights), Math.max(...heights));
console.log('bottom range', Math.min(...bottoms), Math.max(...bottoms));

// Export base poses as individual PNGs for Aseprite import
const baseDir = path.join(ROOT, 'v2-hover-keyframes', 'aligned-209');
fs.mkdirSync(baseDir, { recursive: true });
for (const [name, cell] of Object.entries(base)) {
  fs.writeFileSync(path.join(baseDir, `${name}.png`), PNG.sync.write(cell));
}

// Right-strip preview
const strip = new PNG({ width: CELL * 9, height: CELL });
strip.data.fill(0);
for (let col = 0; col < 9; col += 1) {
  const cell = slots[3][col];
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const si = (CELL * y + x) << 2;
      if (!cell.data[si + 3]) continue;
      const di = (strip.width * y + col * CELL + x) << 2;
      strip.data[di] = cell.data[si];
      strip.data[di + 1] = cell.data[si + 1];
      strip.data[di + 2] = cell.data[si + 2];
      strip.data[di + 3] = cell.data[si + 3];
    }
  }
}
fs.writeFileSync(path.join(ROOT, 'marisa-animation-v2-r2-right-strip.png'), PNG.sync.write(strip));

// Idle strip
const idleStrip = new PNG({ width: CELL * 4, height: CELL });
idleStrip.data.fill(0);
for (let col = 0; col < 4; col += 1) {
  const cell = slots[0][col];
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const si = (CELL * y + x) << 2;
      if (!cell.data[si + 3]) continue;
      const di = (idleStrip.width * y + col * CELL + x) << 2;
      idleStrip.data[di] = cell.data[si];
      idleStrip.data[di + 1] = cell.data[si + 1];
      idleStrip.data[di + 2] = cell.data[si + 2];
      idleStrip.data[di + 3] = cell.data[si + 3];
    }
  }
}
fs.writeFileSync(path.join(ROOT, 'marisa-animation-v2-r2-idle-strip.png'), PNG.sync.write(idleStrip));
console.log('previews written');
