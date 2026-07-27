import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const CELL = 209;
const TARGET_HEIGHT = 150;
const BASELINE = 179;
const ROOT = path.resolve('src/assets/characters/cirno');
const POSES = path.join(ROOT, 'v2-keyframes-r1', 'poses');
const OUT = path.join(ROOT, 'guided-left-v2-frames');

function load(name) {
  return PNG.sync.read(fs.readFileSync(path.join(POSES, `cirno-v2-${name}-r1.png`)));
}

function bbox(png) {
  let minX = png.width; let minY = png.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    const i = (y * png.width + x) * 4;
    if (png.data[i + 3] <= 10) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function cellFromPose(source) {
  const box = bbox(source); const scale = TARGET_HEIGHT / box.height;
  const width = Math.round(box.width * scale); const left = Math.round((CELL - width) / 2); const top = BASELINE - TARGET_HEIGHT;
  const out = new PNG({ width: CELL, height: CELL }); out.data.fill(0);
  for (let y = 0; y < TARGET_HEIGHT; y += 1) for (let x = 0; x < width; x += 1) {
    const sx = box.minX + Math.min(box.width - 1, Math.floor(x / scale));
    const sy = box.minY + Math.min(box.height - 1, Math.floor(y / scale));
    const si = (sy * source.width + sx) * 4; const di = ((top + y) * CELL + left + x) * 4;
    source.data.copy(out.data, di, si, si + 4);
  }
  return out;
}

function blit(source, target, { x = 0, y = 0, crop = null } = {}) {
  const left = crop?.x ?? 0; const top = crop?.y ?? 0;
  const width = crop?.width ?? CELL; const height = crop?.height ?? CELL;
  for (let yy = 0; yy < height; yy += 1) for (let xx = 0; xx < width; xx += 1) {
    const sx = left + xx; const sy = top + yy; const dx = x + xx; const dy = y + yy;
    if (dx < 0 || dy < 0 || dx >= CELL || dy >= CELL) continue;
    const si = (sy * CELL + sx) * 4; const di = (dy * CELL + dx) * 4;
    if (source.data[si + 3]) source.data.copy(target.data, di, si, si + 4);
  }
}

function poseFrame(source, bodyDy, supportX) {
  const out = new PNG({ width: CELL, height: CELL }); out.data.fill(0);
  // The whole body follows the guide's low/high arc.  The broad shoe patch is
  // then restored at ground level, so the support foot does not slide.
  blit(source, out, { y: bodyDy });
  if (bodyDy) blit(source, out, { x: supportX, y: 146, crop: { x: supportX, y: 146, width: 54, height: 40 } });
  return out;
}

// The guide's actual gait order.  The upper body moves independently of the
// planted shoe; ice wings lag the body by one phase, rather than bobbing in sync.
const plan = [
  ['F1-contact-A', 'left-contact-a', 0,  1,  0],
  ['F2-bearing-A', 'left-contact-a', 3,  2,  1],
  ['F3-passing-A', 'left-high-pass', 0,  1,  0],
  ['F4-lift-A',    'left-high-pass', -3, 0,  1],
  ['F5-contact-B', 'left-contact-b', 0, -1,  0],
  ['F6-bearing-B', 'left-contact-b', 3,  0, -1],
  ['F7-passing-B', 'left-high-pass', 0,  1, -1],
  ['F8-lift-B',    'left-high-pass', -3, 0, -1],
];

fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
for (let index = 0; index < plan.length; index += 1) {
  const [phase, pose, bodyDy, wingDy, wingDx] = plan[index];
  const source = cellFromPose(load(pose));
  const frame = poseFrame(source, bodyDy, index < 4 ? 50 : 77);
  // A tiny delayed ice-wing glint marks the secondary motion without creating
  // a second, ghosted wing silhouette.
  const glintX = index < 4 ? 155 + wingDx : 141 + wingDx;
  const glintY = 112 + wingDy;
  for (const [dx, dy] of [[0, 0], [2, 1], [4, 2]]) {
    const pixel = ((glintY + dy) * CELL + glintX + dx) * 4;
    frame.data[pixel] = 234; frame.data[pixel + 1] = 251; frame.data[pixel + 2] = 255; frame.data[pixel + 3] = 255;
  }
  const file = path.join(OUT, `${String(index + 1).padStart(2, '0')}-${phase}.png`);
  fs.writeFileSync(file, PNG.sync.write(frame));
  manifest.push({ frame: index + 1, phase, pose, bodyDy, wingDy, wingDx, file: path.relative(process.cwd(), file).replaceAll('\\', '/') });
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify({ cell: CELL, fps: 10, frames: manifest }, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(process.cwd(), OUT), frames: manifest.length }));
