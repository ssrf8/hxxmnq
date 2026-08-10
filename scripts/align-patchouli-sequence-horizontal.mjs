// 幻想乡物语:修复 patchouli 序列帧 left/right 方向的水平漂移。
// 源视频为 fourview walk,横向帧角色整体水平位移(左右各 ~14-15px),
// 导致循环播放时 026→001 跳位。本脚本按方向级固定锚点(各方向所有帧
// 角色包围盒中心的均值)把每帧内容水平平移到统一中心,保留步态与脚底。
// 用法: node scripts/align-patchouli-sequence-horizontal.mjs [--dirs=left,right]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const SEQ = path.join(ROOT, 'src/assets/characters/patchouli/sequence-v1');
const DIRS = (process.argv.find((a) => a.startsWith('--dirs='))?.split('=')[1] ?? 'left,right').split(',');

function bboxOf(png) {
  let minx = Infinity, miny = Infinity, maxx = -1, maxy = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 40) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }
  return { minx, miny, maxx, maxy };
}

function shiftX(png, dx) {
  if (dx === 0) return png;
  const out = new PNG({ width: png.width, height: png.height });
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const si = (y * png.width + x) * 4;
      const nx = x + dx;
      if (nx < 0 || nx >= png.width) continue;
      const di = (y * png.width + nx) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = png.data[si + c];
    }
  }
  return out;
}

for (const d of DIRS) {
  const dir = path.join(SEQ, d);
  const frames = [];
  for (let n = 1; n <= 26; n++) {
    const f = String(n).padStart(3, '0') + '.png';
    frames.push(PNG.sync.read(fs.readFileSync(path.join(dir, f))));
  }
  // 计算每帧中心与锚点(均值)
  const centers = frames.map((f) => {
    const b = bboxOf(f);
    return Math.round((b.minx + b.maxx) / 2);
  });
  const anchor = Math.round(centers.reduce((a, b) => a + b, 0) / centers.length);
  console.log(`${d}: 中心序列 ${centers.join(',')}  锚点=${anchor}  漂移=${Math.max(...centers) - Math.min(...centers)}px`);

  // 平移并对齐
  let clipped = 0;
  const shifts = [];
  for (let i = 0; i < frames.length; i++) {
    const dx = anchor - centers[i];
    shifts.push(dx);
    const shifted = shiftX(frames[i], dx);
    const b = bboxOf(shifted);
    if (b.minx < 0 || b.maxx >= 320) clipped++;
    fs.writeFileSync(path.join(dir, String(i + 1).padStart(3, '0') + '.png'), PNG.sync.write(shifted));
  }
  console.log(`${d}: 每帧平移量 ${shifts.join(',')}  越界帧=${clipped}`);

  // 对齐后重新统计中心
  const newCenters = [];
  for (let n = 1; n <= 26; n++) {
    const p = PNG.sync.read(fs.readFileSync(path.join(dir, String(n).padStart(3, '0') + '.png')));
    const b = bboxOf(p);
    newCenters.push(Math.round((b.minx + b.maxx) / 2));
  }
  console.log(`${d}: 对齐后中心 ${newCenters.join(',')} 漂移=${Math.max(...newCenters) - Math.min(...newCenters)}px`);
}
console.log('完成');
