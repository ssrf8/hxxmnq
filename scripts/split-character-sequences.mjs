// 幻想乡物语:通用序列帧切割。把角色四视图合帧视频帧按十字线切成
// front/back/left/right 四个独立方向序列。支持多角色配置(--char)。
// 默认象限映射可经 --dirs 覆盖;right 可经 --mirror-right 指定用 right 镜像作为 left。
// 用法: node scripts/split-character-sequences.mjs --char=youmu [--out-dir=...]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const CHAR = process.argv.find((a) => a.startsWith('--char='))?.split('=')[1] ?? 'youmu';

// 每角色配置
const CONFIGS = {
  sanae: {
    srcDir: 'src/assets/characters/sanae/video-frames-20260809-174504',
    frames: 35, grid: 960, x: 320, y: 960,
    // 横向三视图：front=左、right=中、back=右；left 由 right 镜像补齐。
    dirs: [
      { name: 'front', rect: [0, 0, 320, 960] },
      { name: 'right', rect: [320, 0, 320, 960] },
      { name: 'back', rect: [640, 0, 320, 960] },
      { name: 'left', rect: [320, 0, 320, 960], mirrorOf: 'right' },
    ],
  },
  patchouli: {
    srcDir: 'src/assets/characters/patchouli/video-frames-20260809-185841',
    frames: 26, grid: 640, x: 320, y: 320,
    // front=左上, right=右上, back=左下, left=mirror(right)
    dirs: [
      { name: 'front', sx: 0, sy: 0 },
      { name: 'right', sx: 1, sy: 0 },
      { name: 'back',  sx: 0, sy: 1 },
      { name: 'left',  sx: 1, sy: 0, mirrorOf: 'right' },
    ],
  },
  youmu: {
    srcDir: 'src/assets/characters/youmu/video-frames-20260809-180250',
    frames: 28, grid: 960, x: 480, y: 480,
    // 默认按象限直切:front=左上, right=右上, back=左下, left=右下(待所有者目视确认)
    dirs: [
      { name: 'front', sx: 0, sy: 0 },
      { name: 'right', sx: 1, sy: 0 },
      { name: 'back',  sx: 0, sy: 1 },
      { name: 'left',  sx: 1, sy: 1 },
    ],
  },
};

const CFG = CONFIGS[CHAR];
if (!CFG) throw new Error(`未知角色: ${CHAR}(可用 ${Object.keys(CONFIGS).join('/')})`);
const SRC_DIR = path.join(ROOT, CFG.srcDir);
const OUT_DIR = path.join(ROOT, arg('out-dir', `src/assets/characters/${CHAR}/sequence-v1`));
const GRID = CFG.grid, X = CFG.x, Y = CFG.y;
const FILL_LAST = CFG.fill ?? true;

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

function main() {
  const sources = [];
  for (let n = 1; n <= CFG.frames; n++) {
    const f = String(n).padStart(3, '0') + '.png';
    const p = path.join(SRC_DIR, f);
    if (!fs.existsSync(p)) throw new Error(`缺少源帧 ${p}`);
    const png = PNG.sync.read(fs.readFileSync(p));
    if (png.width !== GRID || png.height !== GRID) throw new Error(`${f} 尺寸异常 ${png.width}x${png.height}(期望 ${GRID}x${GRID})`);
    sources.push({ name: f, png });
  }
  console.log(`${CHAR}: ${sources.length} 帧,${GRID}x${GRID},切割点 x=${X}, y=${Y}`);
  console.log(`方向映射: ${CFG.dirs.map((d) => `${d.name}=(${d.sx},${d.sy})${d.mirrorOf ? '←mirror(' + d.mirrorOf + ')' : ''}`).join('  ')}`);

  for (const d of CFG.dirs) fs.mkdirSync(path.join(OUT_DIR, d.name), { recursive: true });

  const report = { character: CHAR, split: { x: X, y: Y }, frames: {}, fills: [], mirror: {} };
  const perDir = {};
  for (const d of CFG.dirs) perDir[d.name] = [];

  for (let n = 0; n < CFG.frames; n++) {
    const src = sources[n].png;
    const entry = { source: sources[n].name };
    for (const d of CFG.dirs) {
      const [sx0, sy0, w, h] = d.rect
        ?? [d.sx ? X : 0, d.sy ? Y : 0, d.sx ? GRID - X : X, d.sy ? GRID - Y : Y];
      let frame = crop(src, sx0, sy0, w, h);
      if (d.mirrorOf) frame = mirrorH(frame);
      const bb = bbox(frame);
      if (!bb.box) {
        if (FILL_LAST && n > 0 && perDir[d.name][n - 1]) {
          frame = perDir[d.name][n - 1];
          report.fills.push({ frame: sources[n].name, direction: d.name, filledFrom: String(n).padStart(3, '0') });
          console.log(`⚠ ${sources[n].name} ${d.name} 空白 → 用上一帧补位`);
        } else {
          console.log(`⚠ ${sources[n].name} ${d.name} 空白(未补位)`);
        }
      }
      if (d.mirrorOf) report.mirror[d.name] = d.mirrorOf;
      perDir[d.name].push(frame);
      fs.writeFileSync(path.join(OUT_DIR, d.name, String(n + 1).padStart(3, '0') + '.png'), PNG.sync.write(frame));
      entry[d.name] = bb.box ? { box: bb.box } : { empty: true };
    }
    report.frames[String(n + 1).padStart(3, '0')] = entry;
  }

  console.log('\n--- 各方向包围盒稳定性(前3帧/末3帧) ---');
  for (const d of CFG.dirs) {
    const list = perDir[d.name];
    const samples = [0, 1, 2, list.length - 3, list.length - 2, list.length - 1]
      .filter((i) => i >= 0 && i < list.length)
      .map((i) => {
        const bb = bbox(list[i]);
        return bb.box ? `#${String(i + 1).padStart(3, '0')}[${bb.box}]` : `#${String(i + 1).padStart(3, '0')}[空]`;
      });
    console.log(d.name.padEnd(5), samples.join(' '));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'split-manifest.json'), JSON.stringify(report, null, 2));
  console.log(`\n完成: ${OUT_DIR}`);
  console.log(`每方向 ${CFG.frames} 帧 → 共 ${CFG.frames * CFG.dirs.length} 张`);
}

main();
