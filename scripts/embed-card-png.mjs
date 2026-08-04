// 幻想乡物语：把打包好的 chara_card_v2 JSON 嵌入 PNG 立绘，输出标准 SillyTavern 角色卡。
// 用法：node scripts/embed-card-png.mjs --checkpoint=0.2.0-rN --image="D:\path\image.png" [--dry-run] [--compress]
//       可选 --json=<自定义 JSON 路径> --output=<自定义 PNG 路径>（默认使用测试检查点命名）
// 产物：dist/checkpoint-0.2.0-rN/幻想乡物语-测试检查点-0.2.0-rN.png
// 说明：SillyTavern 角色卡 PNG 标准——chara 为 tEXt chunk（Latin-1 编码文本，值含 base64 JSON）。
// 默认保留原立绘全部像素与原始 chunk（只插入新 chunk，不重编码）。
// --compress 模式：用 sharp 把立绘压缩为小尺寸 PNG 作为卡片本体（体积大幅缩小，格式仍是标准 PNG，SillyTavern 完全兼容）。

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const checkpointArg = process.argv.find(argument => argument.startsWith('--checkpoint='));
if (!checkpointArg) throw new Error('缺少必需参数：--checkpoint=0.2.0-rN');
const CHECKPOINT = checkpointArg.slice('--checkpoint='.length).trim();
if (!/^0\.2\.0-r[1-9][0-9]*$/u.test(CHECKPOINT)) throw new Error(`非法检查点：${CHECKPOINT}`);

const imageArg = process.argv.find(argument => argument.startsWith('--image='));
if (!imageArg) throw new Error('缺少必需参数：--image="D:\\path\\image.png"');
const IMAGE_FILE = path.resolve(imageArg.slice('--image='.length).trim());

const OUTPUT_DIR = path.resolve('dist', `checkpoint-${CHECKPOINT}`);
const jsonArg = process.argv.find(argument => argument.startsWith('--json='));
const outputArg = process.argv.find(argument => argument.startsWith('--output='));
const JSON_FILE = jsonArg ? path.resolve(jsonArg.slice('--json='.length).trim()) : path.join(OUTPUT_DIR, `幻想乡物语-测试检查点-${CHECKPOINT}.json`);
const OUTPUT_FILE = outputArg ? path.resolve(outputArg.slice('--output='.length).trim()) : path.join(OUTPUT_DIR, `幻想乡物语-测试检查点-${CHECKPOINT}.png`);
const DRY_RUN = process.argv.includes('--dry-run');
const COMPRESS = process.argv.includes('--compress');
const REPLACE_EXISTING = process.argv.includes('--replace');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeTextChunk(keyword, text) {
  const keywordBuffer = Buffer.from(keyword, 'latin1');
  const textBuffer = Buffer.from(text, 'latin1');
  const data = Buffer.concat([keywordBuffer, Buffer.from([0]), textBuffer]);
  const type = Buffer.from('tEXt', 'latin1');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}

async function compressImage(pngBytes) {
  const sharp = require('sharp');
  // 缩略 PNG（卡片本体像素，ST 头像用；512px 内保持纵横比）
  const thumbBuffer = await sharp(pngBytes).resize(512, null, { fit: 'inside' }).png({ compressionLevel: 9 }).toBuffer();
  return { thumbBuffer };
}

async function main() {
  const [jsonBytes, pngBytes] = await Promise.all([readFile(JSON_FILE), readFile(IMAGE_FILE)]);

  // PNG 签名校验（压缩模式立绘也必须是合法 PNG 输入）
  const signature = pngBytes.subarray(0, 8);
  if (signature.toString('hex') !== '89504e470d0a1a0a') throw new Error('立绘不是合法 PNG');

  let charaPayloadBytes = jsonBytes;
  let bodyPng = pngBytes;
  let compressionReport = {};

  if (COMPRESS) {
    const parsedJson = JSON.parse(jsonBytes.toString('utf8'));
    if (parsedJson.spec !== 'chara_card_v2') throw new Error('JSON 不是 chara_card_v2 角色卡');
    const { thumbBuffer } = await compressImage(pngBytes);
    const meta = await require('sharp')(thumbBuffer).metadata();
    charaPayloadBytes = jsonBytes;
    bodyPng = thumbBuffer;
    compressionReport = {
      compress: true,
      thumb_png_bytes: thumbBuffer.length,
      thumb_png_dimensions: `${meta.width}x${meta.height}`,
    };
  }

  // 校验 bodyPng 首 chunk 为 IHDR
  const firstChunkLength = bodyPng.readUInt32BE(8);
  const firstChunkType = bodyPng.subarray(12, 16).toString('latin1');
  if (firstChunkType !== 'IHDR') throw new Error(`PNG 首个 chunk 应为 IHDR，实际 ${firstChunkType}`);

  const charaBase64 = charaPayloadBytes.toString('base64');
  const charaChunk = makeTextChunk('chara', charaBase64);

  // 在 IHDR 之后、其余 chunk 之前插入（PNG 规范允许任意顺序，SillyTavern 解析所有 tEXt）
  const insertAt = 8 + firstChunkLength + 12;
  const output = Buffer.concat([
    bodyPng.subarray(0, insertAt),
    charaChunk,
    bodyPng.subarray(insertAt),
  ]);

  const report = {
    mode: DRY_RUN ? 'dry-run' : 'write',
    checkpoint: CHECKPOINT,
    source_image: IMAGE_FILE,
    source_image_bytes: pngBytes.length,
    json_bytes: jsonBytes.length,
    output: OUTPUT_FILE,
    bytes: output.length,
    sha256: createHash('sha256').update(output).digest('hex'),
    ...compressionReport,
  };

  if (!DRY_RUN) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(OUTPUT_FILE, output, { encoding: null, flag: REPLACE_EXISTING ? 'w' : 'wx' });
  }
  console.log(JSON.stringify(report, null, 2));
}

await main();

