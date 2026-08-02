import { readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

const source = 'src/assets/characters/cirno/cirno-turnaround-v1.png';
const png = PNG.sync.read(await readFile(source));
if (png.width !== 1254 || png.height !== 1254) {
  throw new Error(`琪露诺四视图尺寸异常：${png.width}x${png.height}`);
}

const cellHeight = png.height / 2;
let clearedVisiblePixels = 0;
let clearedNonzeroPixels = 0;
for (let y = cellHeight; y < cellHeight + 4; y += 1) {
  for (let x = 0; x < png.width; x += 1) {
    const offset = (y * png.width + x) * 4;
    const alpha = png.data[offset + 3];
    if (alpha > 8) clearedVisiblePixels += 1;
    if (alpha > 0) clearedNonzeroPixels += 1;
    if (alpha === 0) continue;
    png.data[offset] = 0;
    png.data[offset + 1] = 0;
    png.data[offset + 2] = 0;
    png.data[offset + 3] = 0;
  }
}

if (![0, 575].includes(clearedVisiblePixels)) {
  throw new Error(`残留像素数量异常：预期 0 或 575，实际 ${clearedVisiblePixels}`);
}
if (clearedVisiblePixels === 0) {
  console.log('琪露诺侧视图头顶残留已经清理，无需重复写入');
  process.exit(0);
}
await writeFile(source, PNG.sync.write(png));
console.log(`已清除 ${clearedVisiblePixels} 个可见残留像素（${clearedNonzeroPixels} 个非零 alpha 像素）`);
