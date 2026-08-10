// 幻想乡物语:把 patchouli 序列帧(26×640×640 四视图合帧,已透明)按十字线
// 参数切割为 front/back/left/right 四个方向独立序列(320×320)。
// 026 帧 right(右下)方向在源素材中完全空白,默认用 025 帧 right 补位(可用 --no-fill 关闭)。
// 用法: node scripts/split-patchouli-sequences.mjs [--x=320] [--y=320] [--no-fill]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src/assets/characters/patchouli/video-frames-20260809-185841');
const OUT_DIR = path.join(ROOT, arg('out-dir', 'src/assets/characters/patchouli/sequence-v1'));

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
}
const X = parseInt(arg('x', '320'), 10);
const Y = parseInt(arg('y', '320'), 10);
const FILL_LAST = !process.argv.includes('--no-fill');
const FRAME_COUNT = 26;

// 源图象限真实内容(经所有者观察确认):
//   左上=front、右上=right、左下=back、右下=left(右下素材残缺/异常,弃用)
//   left 采用 right 的水平翻转作为替代(所有者批准镜像)
const DIRECTIONS = [
  { name: 'front', sx: 0, sy: 0 },
  { name: 'back',  sx: 0, sy: 1 },  // 源图左下
  { name: 'left',  sx: 1, sy: 0, mirrorOf: 'right' },  // = mirror(源图右上)
  { name: 'right', sx: 1, sy: 0 },  // 源图右上
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
  // 读取全部源帧
  const sources = [];
  for (let n = 1; n <= FRAME_COUNT; n++) {
    const f = String(n).padStart(3, '0') + '.png';
    const p = path.join(SRC_DIR, f);
    if (!fs.existsSync(p)) throw new Error(`缺少源帧 ${p}`);
    const png = PNG.sync.read(fs.readFileSync(p));
    if (png.width !== 640 || png.height !== 640) throw new Error(`${f} 尺寸异常 ${png.width}x${png.height}`);
    sources.push({ name: f, png });
  }
  console.log(`读取 ${sources.length} 帧源图,切割点 x=${X}, y=${Y},026-right 补位=${FILL_LAST}`);

  // 输出目录
  for (const d of DIRECTIONS) fs.mkdirSync(path.join(OUT_DIR, d.name), { recursive: true });

  // 切割
  const report = { split: { x: X, y: Y }, frames: {}, fills: [] };
  const perDir = {}; // direction -> [png...]
  for (const d of DIRECTIONS) perDir[d.name] = [];

  for (let n = 0; n < FRAME_COUNT; n++) {
    const src = sources[n].png;
    const entry = { source: sources[n].name };
    for (const d of DIRECTIONS) {
      const sx0 = d.sx ? X : 0, sy0 = d.sy ? Y : 0;
      const w = d.sx ? 640 - X : X, h = d.sy ? 640 - Y : Y;
      let frame = crop(src, sx0, sy0, w, h);
      if (d.mirrorOf) frame = mirrorH(frame); // left = right 水平翻转
      const bb = bbox(frame);
      if (!bb.box) {
        // 空方向:补位
        if (FILL_LAST && n > 0 && perDir[d.name][n - 1]) {
          frame = perDir[d.name][n - 1];
          entry[d.name] = { filledFrom: String(n).padStart(3, '0'), box: bbox(frame).box };
          report.fills.push({ frame: sources[n].name, direction: d.name, filledFrom: String(n).padStart(3, '0') });
          console.log(`⚠ ${sources[n].name} ${d.name} 空白 → 用上一帧补位`);
        } else {
          entry[d.name] = { empty: true };
          console.log(`⚠ ${sources[n].name} ${d.name} 空白(未补位)`);
        }
      } else {
        entry[d.name] = { box: bb.box, opaque: bb.opaque };
      }
      perDir[d.name].push(frame);
      fs.writeFileSync(path.join(OUT_DIR, d.name, String(n + 1).padStart(3, '0') + '.png'), PNG.sync.write(frame));
    }
    report.frames[String(n + 1).padStart(3, '0')] = entry;
  }

  // 每方向包围盒一致性检查(脚底基线 = maxY)
  console.log('\n--- 各方向包围盒稳定性(前3帧/末3帧) ---');
  for (const d of DIRECTIONS) {
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
  console.log(`每方向 ${perDir.front.length} 帧 → 共 ${Object.values(perDir).flat().length} 张`);
  console.log(`报告: ${path.join(OUT_DIR, 'split-manifest.json')}`);
}

main();
