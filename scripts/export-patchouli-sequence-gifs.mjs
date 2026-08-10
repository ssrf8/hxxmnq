// 幻想乡物语:从 patchouli 序列帧生成验收 GIF(四方向总览 + 每方向独立)。
// 用法: node scripts/export-patchouli-sequence-gifs.mjs [--ms=90]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import gifencDefault from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifencDefault;

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src/assets/characters/patchouli/sequence-v1');
const PREVIEW = path.join(SRC, 'preview');
const DELAY = parseInt(process.argv.find((a) => a.startsWith('--ms='))?.split('=')[1] ?? '90', 10);
const DIRECTIONS = ['front', 'back', 'left', 'right'];
const FRAME_COUNT = 26;

function readFrames(dir) {
  const out = [];
  for (let n = 1; n <= FRAME_COUNT; n++) {
    const f = String(n).padStart(3, '0') + '.png';
    out.push(PNG.sync.read(fs.readFileSync(path.join(dir, f))));
  }
  return out;
}

// 预处理:把 RGBA 像素二值化 alpha,并将透明像素 RGB 清零(消除 GIF 1bit 透明下的边缘抖动与脏色)
function preprocess(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a >= 128) {
      rgba[i + 3] = 255;
    } else {
      rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 0;
    }
  }
  return rgba;
}

function extractRgba(f, width, height) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * f.width + x) * 4;
      const di = (y * width + x) * 4;
      rgba[di] = f.data[si];
      rgba[di + 1] = f.data[si + 1];
      rgba[di + 2] = f.data[si + 2];
      rgba[di + 3] = f.data[si + 3];
    }
  }
  return preprocess(rgba);
}

// 把 RGBA 帧序列编码为 GIF(全局统一调色板,固定透明索引,dispose=2)
function encodeGif(frames, width, height) {
  // 1) 全部帧像素拼接 → 一次联合量化,得到全局调色板
  const all = new Uint8Array(frames.length * width * height * 4);
  for (let i = 0; i < frames.length; i++) {
    const rgba = extractRgba(frames[i], width, height);
    all.set(rgba, i * width * height * 4);
  }
  const palette = quantize(all, 256, { format: 'rgba4444', oneBitAlpha: true });

  // 2) 固定透明索引:找到 alpha=0 条目;若不存在则强制在头部插入 [0,0,0,0]
  let transparentIndex = -1;
  for (let i = 0; i < palette.length; i++) {
    if (palette[i][3] === 0) { transparentIndex = i; break; }
  }
  if (transparentIndex < 0) {
    palette.unshift([0, 0, 0, 0]);
    transparentIndex = 0;
  }

  // 3) 每帧用全局调色板索引化并写出
  const gif = GIFEncoder();
  for (const f of frames) {
    const rgba = extractRgba(f, width, height);
    const index = applyPalette(rgba, palette, 'rgba4444');
    gif.writeFrame(index, width, height, {
      palette,
      delay: DELAY,
      transparent: true,
      transparentIndex,
      dispose: 2, // 每帧前恢复背景(透明)色,避免残影与闪烁
    });
  }
  gif.finish();
  return gif.bytes();
}

function main() {
  fs.mkdirSync(PREVIEW, { recursive: true });
  const dirs = {};
  for (const d of DIRECTIONS) dirs[d] = readFrames(path.join(SRC, d));

  // 1) 每方向独立 GIF
  for (const d of DIRECTIONS) {
    const bytes = encodeGif(dirs[d], 320, 320);
    const p = path.join(PREVIEW, `patchouli-sequence-${d}.gif`);
    fs.writeFileSync(p, Buffer.from(bytes));
    console.log(`${d}: ${p} (${(bytes.length / 1024).toFixed(0)}KB, ${DELAY}ms/帧)`);
  }

  // 2) 四方向总览 GIF(并排 1280×320)
  const overview = [];
  for (let n = 0; n < FRAME_COUNT; n++) {
    const canvas = new PNG({ width: 1280, height: 320 });
    for (let d = 0; d < 4; d++) {
      const f = dirs[DIRECTIONS[d]][n];
      for (let y = 0; y < 320; y++) {
        for (let x = 0; x < 320; x++) {
          const si = (y * 320 + x) * 4;
          const di = (y * 1280 + d * 320 + x) * 4;
          for (let c = 0; c < 4; c++) canvas.data[di + c] = f.data[si + c];
        }
      }
    }
    overview.push(canvas);
  }
  const obytes = encodeGif(overview, 1280, 320);
  const op = path.join(PREVIEW, 'patchouli-sequence-overview.gif');
  fs.writeFileSync(op, Buffer.from(obytes));
  console.log(`overview: ${op} (${(obytes.length / 1024).toFixed(0)}KB)`);
}

main();
