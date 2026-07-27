import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const CELL = 209;
const TARGET_H = 150;
const BASELINE = 179;
const ROOT = path.resolve('src/assets/characters/cirno');
const KEY_DIR = path.join(ROOT, 'v2-keyframes-r1', 'poses');
const FRAME_DIR = path.join(ROOT, 'v2-build-frames-r1');

function loadPng(name) {
  return PNG.sync.read(fs.readFileSync(path.join(KEY_DIR, `cirno-v2-${name}-r1.png`)));
}

function contentBBox(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (png.width * y + x) << 2;
      if (png.data[index + 3] <= 10) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) throw new Error('empty source image');
  return {
    minX,
    minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function placeToCell(png) {
  const bbox = contentBBox(png);
  const scale = TARGET_H / bbox.height;
  const width = Math.max(1, Math.round(bbox.width * scale));
  const height = TARGET_H;
  const left = Math.round((CELL - width) / 2);
  const top = BASELINE - height;
  const cell = new PNG({ width: CELL, height: CELL });
  cell.data.fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = bbox.minX + Math.min(bbox.width - 1, Math.floor(x / scale));
      const sourceY = bbox.minY + Math.min(bbox.height - 1, Math.floor(y / scale));
      const sourceIndex = (png.width * sourceY + sourceX) << 2;
      const alpha = png.data[sourceIndex + 3];
      if (alpha <= 10) continue;
      const destIndex = (CELL * (top + y) + left + x) << 2;
      cell.data[destIndex] = png.data[sourceIndex];
      cell.data[destIndex + 1] = png.data[sourceIndex + 1];
      cell.data[destIndex + 2] = png.data[sourceIndex + 2];
      cell.data[destIndex + 3] = alpha;
    }
  }
  return cell;
}

function shiftCell(source, dx, dy) {
  const cell = new PNG({ width: CELL, height: CELL });
  cell.data.fill(0);
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const sourceX = x - dx;
      const sourceY = y - dy;
      if (sourceX < 0 || sourceY < 0 || sourceX >= CELL || sourceY >= CELL) continue;
      const sourceIndex = (CELL * sourceY + sourceX) << 2;
      if (!source.data[sourceIndex + 3]) continue;
      const destIndex = (CELL * y + x) << 2;
      source.data.copy(cell.data, destIndex, sourceIndex, sourceIndex + 4);
    }
  }
  return cell;
}

function cellBBox(cell) {
  let minX = CELL;
  let minY = CELL;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const index = (CELL * y + x) << 2;
      if (cell.data[index + 3] <= 10) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) throw new Error('empty cell');
  return {
    height: maxY - minY + 1,
    bottom: maxY + 1,
    centerX: (minX + maxX + 1) / 2,
  };
}

const keys = Object.fromEntries([
  'stand-front', 'stand-back', 'stand-left', 'stand-right',
  'idle-blink', 'idle-wings-raised', 'idle-wings-lowered',
  'left-contact-a', 'left-high-pass', 'left-contact-b',
  'right-contact-a', 'right-high-pass', 'right-contact-b',
  'up-contact-a', 'up-contact-b', 'down-contact-a', 'down-contact-b',
].map((name) => [name, placeToCell(loadPng(name))]));

const horizontalCycle = (contactA, highPass, contactB) => [
  shiftCell(contactA, 0, 0),
  shiftCell(contactA, 0, -2),
  shiftCell(highPass, 0, -4),
  shiftCell(contactB, 0, 0),
  shiftCell(contactB, 0, -2),
  shiftCell(highPass, 0, -4),
  shiftCell(contactA, 0, -1),
  shiftCell(highPass, 0, -2),
];

const verticalCycle = (contactA, contactB) => [
  shiftCell(contactA, 0, 0),
  shiftCell(contactA, 0, -2),
  shiftCell(contactB, 0, 0),
  shiftCell(contactB, 0, -2),
];

const slots = Array.from({ length: 4 }, () => Array(9).fill(null));
slots[0][0] = keys['stand-front'];
slots[0][1] = keys['idle-blink'];
slots[0][2] = keys['idle-wings-raised'];
slots[0][3] = keys['idle-wings-lowered'];
slots[0][4] = keys['stand-back'];
verticalCycle(keys['up-contact-a'], keys['up-contact-b']).forEach((cell, index) => {
  slots[0][5 + index] = cell;
});

slots[1][0] = shiftCell(keys['stand-front'], 0, 0);
verticalCycle(keys['down-contact-a'], keys['down-contact-b']).forEach((cell, index) => {
  slots[1][1 + index] = cell;
});

slots[2][0] = keys['stand-left'];
horizontalCycle(keys['left-contact-a'], keys['left-high-pass'], keys['left-contact-b'])
  .forEach((cell, index) => { slots[2][1 + index] = cell; });

slots[3][0] = keys['stand-right'];
horizontalCycle(keys['right-contact-a'], keys['right-high-pass'], keys['right-contact-b'])
  .forEach((cell, index) => { slots[3][1 + index] = cell; });

const atlas = new PNG({ width: CELL * 9, height: CELL * 4 });
atlas.data.fill(0);
fs.mkdirSync(FRAME_DIR, { recursive: true });
let filled = 0;
const manifest = [];
for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 9; col += 1) {
    const cell = slots[row][col];
    if (!cell) continue;
    filled += 1;
    const box = cellBBox(cell);
    const name = `r${row}c${col}`;
    const framePath = path.join(FRAME_DIR, `${String(filled).padStart(2, '0')}-${name}.png`);
    fs.writeFileSync(framePath, PNG.sync.write(cell));
    manifest.push({
      index: filled,
      row,
      col,
      file: path.relative(process.cwd(), framePath).replaceAll('\\', '/'),
      ...box,
    });
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const sourceIndex = (CELL * y + x) << 2;
        if (!cell.data[sourceIndex + 3]) continue;
        const destIndex = (atlas.width * (row * CELL + y) + col * CELL + x) << 2;
        cell.data.copy(atlas.data, destIndex, sourceIndex, sourceIndex + 4);
      }
    }
  }
}

if (filled !== 32) throw new Error(`expected 32 filled slots, got ${filled}`);
const atlasPath = path.join(ROOT, 'cirno-animation-v2-r1.png');
fs.writeFileSync(atlasPath, PNG.sync.write(atlas));
fs.writeFileSync(
  path.join(FRAME_DIR, 'manifest.json'),
  `${JSON.stringify({
    cell: CELL,
    atlas: path.relative(process.cwd(), atlasPath).replaceAll('\\', '/'),
    frames: manifest,
  }, null, 2)}\n`,
);
console.log(`wrote ${atlasPath} ${atlas.width}x${atlas.height}; filled=${filled}`);
console.log(`height=${Math.min(...manifest.map((item) => item.height))}..${Math.max(...manifest.map((item) => item.height))}`);
console.log(`bottom=${Math.min(...manifest.map((item) => item.bottom))}..${Math.max(...manifest.map((item) => item.bottom))}`);
console.log(`centerX=${Math.min(...manifest.map((item) => item.centerX))}..${Math.max(...manifest.map((item) => item.centerX))}`);
