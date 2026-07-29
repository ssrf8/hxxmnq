import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const CELL = 209;
const ROOT = path.resolve('src/assets/characters/cirno');
const ATLAS = path.join(ROOT, 'cirno-animation-v2-r1.png');
const FRAME_DIR = path.join(ROOT, 'v2-demo-frames-r1');
const FRAME_MS = 160;

function extractCell(atlas, col, row) {
  const cell = new PNG({ width: CELL, height: CELL });
  cell.data.fill(0);
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const sourceIndex = (atlas.width * (row * CELL + y) + col * CELL + x) << 2;
      const destIndex = (CELL * y + x) << 2;
      atlas.data.copy(cell.data, destIndex, sourceIndex, sourceIndex + 4);
    }
  }
  return cell;
}

function repeated(name, coords, loops) {
  return {
    name,
    frames: Array.from({ length: loops }, () => coords).flat(),
  };
}

const jobs = [
  {
    name: 'idle',
    frames: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 0], [1, 0], [2, 0], [3, 0], [0, 0]],
  },
  repeated('left', [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2]], 2),
  repeated('right', [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3]], 2),
  repeated('up', [[5, 0], [6, 0], [7, 0], [8, 0]], 2),
  repeated('down', [[1, 1], [2, 1], [3, 1], [4, 1]], 2),
  {
    name: 'overview',
    frames: [
      [0, 0], [1, 0], [2, 0], [3, 0], [0, 0],
      [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
      [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3],
      [4, 0], [5, 0], [6, 0], [7, 0], [8, 0],
      [0, 1], [1, 1], [2, 1], [3, 1], [4, 1],
    ],
  },
];

const atlas = PNG.sync.read(fs.readFileSync(ATLAS));
if (atlas.width !== CELL * 9 || atlas.height !== CELL * 4) {
  throw new Error(`unexpected atlas dimensions ${atlas.width}x${atlas.height}`);
}
fs.mkdirSync(FRAME_DIR, { recursive: true });
const manifest = {
  frameMs: FRAME_MS,
  cell: CELL,
  atlas: path.relative(process.cwd(), ATLAS).replaceAll('\\', '/'),
  jobs: [],
};
for (const job of jobs) {
  const jobDir = path.join(FRAME_DIR, job.name);
  fs.mkdirSync(jobDir, { recursive: true });
  for (const file of fs.readdirSync(jobDir)) {
    if (/^f\d+-r\d+c\d+\.png$/u.test(file)) fs.unlinkSync(path.join(jobDir, file));
  }
  const files = job.frames.map(([col, row], index) => {
    const file = path.join(jobDir, `f${String(index).padStart(3, '0')}-r${row}c${col}.png`);
    fs.writeFileSync(file, PNG.sync.write(extractCell(atlas, col, row)));
    return path.relative(process.cwd(), file).replaceAll('\\', '/');
  });
  manifest.jobs.push({ name: job.name, frameCount: files.length, files });
  console.log(`extracted ${job.name}: ${files.length}`);
}
fs.writeFileSync(path.join(FRAME_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
