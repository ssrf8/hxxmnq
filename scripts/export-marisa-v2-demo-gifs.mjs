import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const CELL = 209;
const ROOT = path.resolve('src/assets/characters/marisa');
const ATLAS = path.join(ROOT, 'marisa-animation-v2-r2.png');
const FRAME_DIR = path.join(ROOT, 'v2-demo-frames');
const FRAME_MS = 160;

function loadPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function extractCell(atlas, col, row) {
  const cell = new PNG({ width: CELL, height: CELL });
  cell.data.fill(0);
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const si = (atlas.width * (row * CELL + y) + (col * CELL + x)) << 2;
      const di = (CELL * y + x) << 2;
      cell.data[di] = atlas.data[si];
      cell.data[di + 1] = atlas.data[si + 1];
      cell.data[di + 2] = atlas.data[si + 2];
      cell.data[di + 3] = atlas.data[si + 3];
    }
  }
  return cell;
}

function writeCell(file, cell) {
  fs.writeFileSync(file, PNG.sync.write(cell));
}

function sequence(name, coords, loops = 1) {
  const frames = [];
  for (let loop = 0; loop < loops; loop += 1) {
    for (const [col, row] of coords) frames.push([col, row]);
  }
  return { name, frames };
}

// Clip ranges from the 9×4 contract.
const clips = [
  sequence('idle', [[0, 0], [1, 0], [2, 0], [3, 0]], 2),
  // travel loops exclude direction-00; play two full cycles
  sequence('right', [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3]], 2),
  sequence('left', [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2]], 2),
  sequence('down', [[1, 1], [2, 1], [3, 1], [4, 1]], 2),
  sequence('up', [[5, 0], [6, 0], [7, 0], [8, 0]], 2),
];

// Combined overview: idle once, then each direction one cycle with settle frame.
const overview = {
  name: 'overview',
  frames: [
    [0, 0], [1, 0], [2, 0], [3, 0],
    [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3],
    [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
    [0, 1], [1, 1], [2, 1], [3, 1], [4, 1],
    [4, 0], [5, 0], [6, 0], [7, 0], [8, 0],
  ],
};

const atlas = loadPng(ATLAS);
fs.mkdirSync(FRAME_DIR, { recursive: true });

const jobs = [...clips, overview];
const manifest = {
  frameMs: FRAME_MS,
  cell: CELL,
  atlas: path.relative(process.cwd(), ATLAS).replaceAll('\\', '/'),
  jobs: [],
};

for (const job of jobs) {
  const jobDir = path.join(FRAME_DIR, job.name);
  fs.mkdirSync(jobDir, { recursive: true });
  const files = [];
  job.frames.forEach(([col, row], index) => {
    const file = path.join(jobDir, `f${String(index).padStart(3, '0')}-r${row}c${col}.png`);
    writeCell(file, extractCell(atlas, col, row));
    files.push(file);
  });
  manifest.jobs.push({
    name: job.name,
    frameCount: files.length,
    files: files.map((file) => path.resolve(file)),
  });
  console.log(`extracted ${job.name}: ${files.length} frames`);
}

const manifestPath = path.join(FRAME_DIR, 'manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('wrote', manifestPath);
