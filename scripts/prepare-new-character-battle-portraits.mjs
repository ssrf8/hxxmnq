import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = join(ROOT, '旧素材', '素材处理', '新建文件夹');
const OUTPUT_ROOT = join(ROOT, 'src', 'assets', 'battle', 'portraits');
const CHARACTERS = [
  { id: 'youmu', folder: '幽梦' },
  { id: 'patchouli', folder: '帕秋莉' },
  { id: 'sanae', folder: '早苗' },
];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

await mkdir(OUTPUT_ROOT, { recursive: true });
const files = [];
for (const character of CHARACTERS) {
  for (let tier = 0; tier <= 2; tier += 1) {
    const source = join(SOURCE_ROOT, character.folder, `S${tier}.png`);
    const output = join(OUTPUT_ROOT, `portrait-${character.id}-s${tier}-v1.webp`);
    const sourceBytes = await readFile(source);
    const sourceMetadata = await sharp(sourceBytes).metadata();
    await sharp(sourceBytes)
      .resize({ height: 800, withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
      .webp({ quality: 50, effort: 6 })
      .toFile(output);
    const outputBytes = await readFile(output);
    const outputMetadata = await sharp(outputBytes).metadata();
    files.push({
      character: character.id,
      tier: `s${tier}`,
      source: source.slice(ROOT.length + 1).replaceAll('\\', '/'),
      source_bytes: sourceBytes.length,
      source_sha256: sha256(sourceBytes),
      source_dimensions: [sourceMetadata.width, sourceMetadata.height],
      output: output.slice(ROOT.length + 1).replaceAll('\\', '/'),
      output_bytes: outputBytes.length,
      output_sha256: sha256(outputBytes),
      output_dimensions: [outputMetadata.width, outputMetadata.height],
    });
  }
}

console.log(JSON.stringify({
  schema_version: 'gensokyo-battle-portrait-preparation.v1',
  codec: 'webp',
  quality: 50,
  target_height: 800,
  resize_kernel: 'lanczos3',
  files,
  totals: {
    files: files.length,
    source_bytes: files.reduce((sum, file) => sum + file.source_bytes, 0),
    output_bytes: files.reduce((sum, file) => sum + file.output_bytes, 0),
  },
}, null, 2));
