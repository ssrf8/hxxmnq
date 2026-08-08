// 地图拼接 · 确定性合成脚本
// 用法：
//   node scripts/stitch-map-layers.mjs \
//     --params scripts/map-stitcher/params-2026-08-08.json \
//     --out-prefix src/assets/maps/garden-base-owner-v4 \
//     --layer-dir "D:/浏览器下载" \
//     --report project/map-stitch-2026-08-08.json
//
// params JSON 结构 = 地图拼接编辑器导出的格式：
//   { base: { source, width, height },
//     layers: [ { source, width, height, offsetX, offsetY, scale } ],
//     canvas: { width, height } }
// offsetX/offsetY 为新图左上角在最终画布中的像素坐标。
//
// 确定性：同一参数在同一输入下产出字节一致的 PNG 与 Q70 WebP，
// 并输出合成报告（实际像素位置、SHA-256、字节数）。
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const paramsPath = arg('--params');
const outPrefix = arg('--out-prefix');
const layerDir = arg('--layer-dir') || 'D:/浏览器下载';
const reportPath = arg('--report') || path.join(__dirname, '..', 'project', 'map-stitch-report.json');
if (!paramsPath || !outPrefix) {
  console.error('缺少 --params 或 --out-prefix');
  process.exit(2);
}

const params = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));

function resolveSource(source, baseDir) {
  if (path.isAbsolute(source)) return source;
  if (baseDir && fs.existsSync(path.join(baseDir, source))) return path.join(baseDir, source);
  const rel = path.join(PROJECT_ROOT, source);
  if (fs.existsSync(rel)) return rel;
  throw new Error('找不到素材: ' + source);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const canvasW = Math.max(1, Math.round(params.canvas.width));
const canvasH = Math.max(1, Math.round(params.canvas.height));

const layers = [];
const baseSource = resolveSource(params.base.source, null);
layers.push({ input: baseSource, left: 0, top: 0 });

const placements = [];
for (const L of params.layers) {
  const left = Math.round(L.offsetX);
  const top = Math.round(L.offsetY);
  layers.push({ input: resolveSource(L.source, layerDir), left, top });
  placements.push({ source: L.source, offsetX: left, offsetY: top, scale: L.scale });
}

const canvas = sharp({
  create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).composite(layers);

const pngOut = outPrefix + '.png';
const webpOut = outPrefix + '.webp';
await canvas.png().toFile(pngOut);
await canvas.webp({ quality: 70 }).toFile(webpOut);

const report = {
  generated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  params,
  resolution: {
    offset_rounding: 'offsetX/offsetY 经 Math.round 取整；scale 原样',
  },
  placements,
  outputs: {
    [pngOut]: { bytes: fs.statSync(pngOut).size, sha256: sha256(pngOut) },
    [webpOut]: { bytes: fs.statSync(webpOut).size, sha256: sha256(webpOut) },
  },
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log('合成完成:');
console.log('  ' + pngOut + '  ' + report.outputs[pngOut].bytes + 'B  ' + report.outputs[pngOut].sha256);
console.log('  ' + webpOut + '  ' + report.outputs[webpOut].bytes + 'B  ' + report.outputs[webpOut].sha256);
console.log('报告: ' + reportPath);
