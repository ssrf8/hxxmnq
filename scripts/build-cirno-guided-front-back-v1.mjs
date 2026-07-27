import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const CELL = 209;
const TARGET_HEIGHT = 150;
const BASELINE = 179;
const ROOT = path.resolve('src/assets/characters/cirno');
const POSES = path.join(ROOT, 'v2-keyframes-r1', 'poses');

function load(name) { return PNG.sync.read(fs.readFileSync(path.join(POSES, `cirno-v2-${name}-r1.png`))); }

function bbox(png) {
  let minX = png.width; let minY = png.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    const i = (y * png.width + x) * 4;
    if (png.data[i + 3] <= 10) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function toCell(source) {
  const box = bbox(source); const scale = TARGET_HEIGHT / box.height;
  const width = Math.round(box.width * scale); const left = Math.round((CELL - width) / 2); const top = BASELINE - TARGET_HEIGHT;
  const out = new PNG({ width: CELL, height: CELL }); out.data.fill(0);
  for (let y = 0; y < TARGET_HEIGHT; y += 1) for (let x = 0; x < width; x += 1) {
    const sx = box.minX + Math.min(box.width - 1, Math.floor(x / scale)); const sy = box.minY + Math.min(box.height - 1, Math.floor(y / scale));
    const si = (sy * source.width + sx) * 4; const di = ((top + y) * CELL + left + x) * 4;
    source.data.copy(out.data, di, si, si + 4);
  }
  return out;
}

function blit(source, target, { x = 0, y = 0, crop = null } = {}) {
  const left = crop?.x ?? 0; const top = crop?.y ?? 0; const width = crop?.width ?? CELL; const height = crop?.height ?? CELL;
  for (let yy = 0; yy < height; yy += 1) for (let xx = 0; xx < width; xx += 1) {
    const sx = left + xx; const sy = top + yy; const dx = x + xx; const dy = y + yy;
    if (dx < 0 || dy < 0 || dx >= CELL || dy >= CELL) continue;
    const si = (sy * CELL + sx) * 4; const di = (dy * CELL + dx) * 4;
    if (source.data[si + 3]) source.data.copy(target.data, di, si, si + 4);
  }
}

function poseFrame(source, bodyDy, supportX) {
  const out = new PNG({ width: CELL, height: CELL }); out.data.fill(0);
  blit(source, out, { y: bodyDy });
  if (bodyDy) blit(source, out, { x: supportX, y: 146, crop: { x: supportX, y: 146, width: 54, height: 40 } });
  return out;
}

const bodyArc = [0, 1, 0, -1, 0, 1, 0, -1];
const directions = {
  down: {
    // Front view: the character's L foot is screen-right, R foot screen-left.
    poses: ['down-contact-a', 'down-contact-a', 'down-contact-b', 'down-contact-b', 'down-contact-b', 'down-contact-b', 'down-contact-a', 'down-contact-a'],
    supports: [101, 101, 101, 101, 54, 54, 54, 54],
    labels: ['L-contact', 'L-down', 'R-pass', 'R-high', 'R-contact', 'R-down', 'L-pass', 'L-high'],
    glint: [150, 113],
  },
  up: {
    // Back view: the character's L foot is screen-left, R foot screen-right.
    poses: ['up-contact-a', 'up-contact-a', 'up-contact-b', 'up-contact-b', 'up-contact-b', 'up-contact-b', 'up-contact-a', 'up-contact-a'],
    supports: [54, 54, 54, 54, 101, 101, 101, 101],
    labels: ['L-contact', 'L-down', 'R-pass', 'R-high', 'R-contact', 'R-down', 'L-pass', 'L-high'],
    glint: [62, 111],
  },
};

for (const [direction, spec] of Object.entries(directions)) {
  const outDir = path.join(ROOT, `guided-${direction}-v1-frames`);
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = [];
  for (let index = 0; index < 8; index += 1) {
    const frame = poseFrame(toCell(load(spec.poses[index])), bodyArc[index], spec.supports[index]);
    // The ice-wing highlight follows the body one phase late, without altering
    // the front/back design or inventing an extra limb.
    const [gx, gy] = spec.glint; const lag = bodyArc[(index + 7) % 8];
    for (const [dx, dy] of [[0, 0], [2, 1], [4, 2]]) {
      const pixel = ((gy + lag + dy) * CELL + gx + dx) * 4;
      frame.data[pixel] = 234; frame.data[pixel + 1] = 251; frame.data[pixel + 2] = 255; frame.data[pixel + 3] = 255;
    }
    const phase = spec.labels[index]; const name = `${String(index + 1).padStart(2, '0')}-${phase}`;
    const file = path.join(outDir, `${name}.png`);
    fs.writeFileSync(file, PNG.sync.write(frame));
    manifest.push({ frame: index + 1, phase, pose: spec.poses[index], bodyDy: bodyArc[index], supportX: spec.supports[index], file: path.relative(process.cwd(), file).replaceAll('\\', '/') });
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify({ direction, cell: CELL, frameMs: 95, frames: manifest }, null, 2)}\n`);
  console.log(JSON.stringify({ direction, output: path.relative(process.cwd(), outDir), frames: 8 }));
}
