import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { collectRuntimeAssets } from './runtime-assets.mjs';

const ROOT = process.cwd();
const ASSET_ROOT = resolve(ROOT, 'src', 'assets');
const MANIFEST_PATH = resolve(ASSET_ROOT, 'asset-manifest.json');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isGalAsset = (entry) => entry.category.startsWith('gal.')
  || entry.source.includes('/gal/')
  || entry.source.includes('gal-shrine-background');
const isBattlePortrait = (entry) => entry.category.includes('_battle_portraits.');
const isBossSheet = (entry) => /^battle\.(?:greenhouse_flower_core|reimu_battle|marisa_battle|cirno_battle|alice_battle|nitori_battle|mystia_battle|suika_battle|sakuya_battle|youmu_battle|patchouli_battle|sanae_battle)$/.test(entry.category);

const run = (command, args, label, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${label} 失败：${String(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
};

const dimensions = (path) => {
  const output = run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=s=x:p=0',
    path,
  ], `读取尺寸 ${path}`);
  const match = String(output).trim().match(/^(\d+)x(\d+)$/);
  if (!match) throw new Error(`无法解析图片尺寸：${path}`);
  return { width: Number(match[1]), height: Number(match[2]) };
};

const manifestText = await readFile(MANIFEST_PATH, 'utf8');
const manifest = JSON.parse(manifestText);
const entries = collectRuntimeAssets(manifest).filter((entry) => (
  !isGalAsset(entry) && ['.png', '.webp'].includes(extname(entry.source).toLowerCase())
));

const conversions = [];
for (const [index, entry] of entries.entries()) {
  const maintenanceSource = entry.source.replace(/\.webp$/i, '.png');
  const sourcePath = resolve(ASSET_ROOT, maintenanceSource);
  const targetSource = entry.source.replace(/\.(?:png|webp)$/i, '.webp');
  const targetPath = resolve(ASSET_ROOT, targetSource);
  const previousRuntimeBytes = await readFile(resolve(ASSET_ROOT, entry.source));
  const sourceDimensions = dimensions(sourcePath);
  const portrait = isBattlePortrait(entry);
  const lossless = entry.category.startsWith('characters.');
  const quality = isBossSheet(entry) || portrait ? 50 : 70;
  const codecArgs = lossless
    ? ['-lossless', '1']
    : ['-preset', 'drawing', '-quality', String(quality)];
  const scaleArgs = portrait
    ? ['-vf', 'scale=-2:800:flags=lanczos']
    : [];

  run('ffmpeg', [
    '-y',
    '-v', 'error',
    '-i', sourcePath,
    '-frames:v', '1',
    ...scaleArgs,
    '-c:v', 'libwebp',
    '-compression_level', '6',
    ...codecArgs,
    targetPath,
  ], `压缩 ${entry.source}`);

  const targetDimensions = dimensions(targetPath);
  const expectedHeight = portrait ? 800 : sourceDimensions.height;
  const expectedWidth = portrait
    ? Math.round((sourceDimensions.width * expectedHeight / sourceDimensions.height) / 2) * 2
    : sourceDimensions.width;
  if (targetDimensions.width !== expectedWidth || targetDimensions.height !== expectedHeight) {
    throw new Error(`尺寸校验失败：${targetSource}，期望 ${expectedWidth}x${expectedHeight}，实际 ${targetDimensions.width}x${targetDimensions.height}`);
  }

  const sourceBytes = await readFile(sourcePath);
  const targetBytes = await readFile(targetPath);
  conversions.push({
    ...entry,
    targetSource,
    sourceBytes: sourceBytes.length,
    targetBytes: targetBytes.length,
    sourceSha256: sha256(sourceBytes),
    previousRuntimeSha256: sha256(previousRuntimeBytes),
    targetSha256: sha256(targetBytes),
    policy: lossless ? 'lossless' : `q${quality}${portrait ? '-h800' : ''}`,
  });
  console.log(`[${index + 1}/${entries.length}] ${entry.source} -> ${targetSource}`);
}

let updatedManifestText = manifestText;
for (const conversion of conversions) {
  updatedManifestText = updatedManifestText.replaceAll(
    JSON.stringify(conversion.source),
    JSON.stringify(conversion.targetSource),
  );
  updatedManifestText = updatedManifestText.replaceAll(
    conversion.previousRuntimeSha256,
    conversion.targetSha256,
  );
}

const temporaryManifestPath = `${MANIFEST_PATH}.compression-tmp`;
await writeFile(temporaryManifestPath, updatedManifestText, 'utf8');
JSON.parse(await readFile(temporaryManifestPath, 'utf8'));
await rename(temporaryManifestPath, MANIFEST_PATH);

const sourceTotal = conversions.reduce((total, entry) => total + entry.sourceBytes, 0);
const targetTotal = conversions.reduce((total, entry) => total + entry.targetBytes, 0);
console.log(JSON.stringify({
  files: conversions.length,
  source_bytes: sourceTotal,
  target_bytes: targetTotal,
  reduction_percent: Number(((1 - targetTotal / sourceTotal) * 100).toFixed(2)),
  policies: Object.fromEntries([...new Set(conversions.map((entry) => entry.policy))].map((policy) => [
    policy,
    conversions.filter((entry) => entry.policy === policy).length,
  ])),
}, null, 2));
