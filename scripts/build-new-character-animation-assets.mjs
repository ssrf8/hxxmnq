import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHARACTER_ROOT = join(ROOT, 'src', 'assets', 'characters');
const CELL = 209;
const TARGET_VISIBLE_HEIGHT = 150;
const TARGET_ANCHOR = [104, 179];
const DIRECTIONS = ['front', 'back', 'left', 'right'];
const APPLY = process.argv.includes('--apply');
const REPLACE = process.argv.includes('--replace');

const CHARACTERS = {
  youmu: {
    frames: 28,
    frameDurationMs: 48,
    movementMode: 'walking-with-sword',
    directionSourceMap: { left: 'right', right: 'left' },
  },
  patchouli: { frames: 26, frameDurationMs: 48, movementMode: 'measured-walk' },
  sanae: {
    frames: 35,
    frameDurationMs: 48,
    movementMode: 'walking-with-sleeve-sway',
    directionSourceMap: { left: 'right', right: 'left' },
  },
};

const requestedCharacters = process.argv.find((value) => value.startsWith('--chars='))
  ?.slice('--chars='.length)
  .split(',')
  .filter(Boolean);
const selectedCharacters = requestedCharacters?.length
  ? Object.fromEntries(requestedCharacters.map((id) => {
      if (!CHARACTERS[id]) throw new Error(`未知角色：${id}`);
      return [id, CHARACTERS[id]];
    }))
  : CHARACTERS;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function alphaBBox(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[((y * png.width + x) << 2) + 3] <= 10) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) throw new Error('发现空白动画帧');
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function renderFrame(source, scale, sourceAnchor) {
  const output = new PNG({ width: CELL, height: CELL });
  output.data.fill(0);
  for (let targetY = 0; targetY < CELL; targetY += 1) {
    const sourceY = Math.round((targetY - TARGET_ANCHOR[1]) / scale + sourceAnchor[1]);
    if (sourceY < 0 || sourceY >= source.height) continue;
    for (let targetX = 0; targetX < CELL; targetX += 1) {
      const sourceX = Math.round((targetX - TARGET_ANCHOR[0]) / scale + sourceAnchor[0]);
      if (sourceX < 0 || sourceX >= source.width) continue;
      const sourceIndex = (sourceY * source.width + sourceX) << 2;
      if (source.data[sourceIndex + 3] <= 10) continue;
      source.data.copy(output.data, (targetY * CELL + targetX) << 2, sourceIndex, sourceIndex + 4);
    }
  }
  return output;
}

function blit(target, source, left, top) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceIndex = (y * source.width + x) << 2;
      if (!source.data[sourceIndex + 3]) continue;
      source.data.copy(target.data, ((top + y) * target.width + left + x) << 2, sourceIndex, sourceIndex + 4);
    }
  }
}

async function loadCharacter(id, definition) {
  const sequenceRoot = join(CHARACTER_ROOT, id, 'sequence-v1');
  const frames = [];
  for (const direction of DIRECTIONS) {
    const sourceDirection = definition.directionSourceMap?.[direction] ?? direction;
    const directionRoot = join(sequenceRoot, sourceDirection);
    const names = (await readdir(directionRoot)).filter((name) => /^\d{3}\.png$/u.test(name)).sort();
    if (names.length !== definition.frames) {
      throw new Error(`${id}/${direction} 应有 ${definition.frames} 帧，实际 ${names.length}`);
    }
    for (const [index, name] of names.entries()) {
      const expected = `${String(index + 1).padStart(3, '0')}.png`;
      if (name !== expected) throw new Error(`${id}/${direction} 帧编号不连续：${name}`);
      const path = join(directionRoot, name);
      const bytes = await readFile(path);
      const png = PNG.sync.read(bytes);
      const bbox = alphaBBox(png);
      frames.push({ direction, sourceDirection, index, name, path, bytes, png, bbox });
    }
  }
  const maximumHeight = Math.max(...frames.map((frame) => frame.bbox.height));
  const scale = TARGET_VISIBLE_HEIGHT / maximumHeight;
  const sourceAnchorByDirection = Object.fromEntries(DIRECTIONS.map((direction) => {
    const directional = frames.filter((frame) => frame.direction === direction);
    return [direction, [Math.round(directional[0].png.width / 2), Math.max(...directional.map((frame) => frame.bbox.maxY))]];
  }));

  const idleFrames = [];
  for (const direction of DIRECTIONS) {
    const path = join(CHARACTER_ROOT, id, 'static-v1', direction, '001.png');
    const bytes = await readFile(path);
    const png = PNG.sync.read(bytes);
    idleFrames.push({ direction, path, bytes, png, bbox: alphaBBox(png) });
  }
  const idleScale = TARGET_VISIBLE_HEIGHT / Math.max(...idleFrames.map((frame) => frame.bbox.height));
  const idleSourceAnchorByDirection = Object.fromEntries(idleFrames.map((frame) => [
    frame.direction,
    [Math.round(frame.png.width / 2), frame.bbox.maxY],
  ]));
  return {
    id,
    definition,
    frames,
    scale,
    sourceAnchorByDirection,
    idleFrames,
    idleScale,
    idleSourceAnchorByDirection,
  };
}

async function buildCharacter(record) {
  const {
    id,
    definition,
    frames,
    scale,
    sourceAnchorByDirection,
    idleFrames,
    idleScale,
    idleSourceAnchorByDirection,
  } = record;
  const sequenceAtlas = new PNG({ width: CELL * definition.frames, height: CELL * DIRECTIONS.length });
  const idleAtlas = new PNG({ width: CELL * 2, height: CELL * 2 });
  sequenceAtlas.data.fill(0);
  idleAtlas.data.fill(0);
  const frameRecords = [];

  for (const frame of frames) {
    const row = DIRECTIONS.indexOf(frame.direction);
    const rendered = renderFrame(frame.png, scale, sourceAnchorByDirection[frame.direction]);
    const renderedBBox = alphaBBox(rendered);
    blit(sequenceAtlas, rendered, frame.index * CELL, row * CELL);
    frameRecords.push({
      direction: frame.direction,
      index: frame.index + 1,
      source: `src/assets/characters/${id}/sequence-v1/${frame.sourceDirection}/${frame.name}`,
      source_sha256: sha256(frame.bytes),
      source_bbox: frame.bbox,
      runtime_bbox: renderedBBox,
    });
  }

  const idleFrameRecords = [];
  for (const frame of idleFrames) {
    const rendered = renderFrame(frame.png, idleScale, idleSourceAnchorByDirection[frame.direction]);
    const renderedBBox = alphaBBox(rendered);
    const idleCell = { front: [0, 0], back: [1, 0], left: [0, 1], right: [1, 1] }[frame.direction];
    blit(idleAtlas, rendered, idleCell[0] * CELL, idleCell[1] * CELL);
    idleFrameRecords.push({
      direction: frame.direction,
      source: `src/assets/characters/${id}/static-v1/${frame.direction}/001.png`,
      source_sha256: sha256(frame.bytes),
      source_bbox: frame.bbox,
      runtime_bbox: renderedBBox,
    });
  }

  const idlePng = PNG.sync.write(idleAtlas);
  const sequencePng = PNG.sync.write(sequenceAtlas);
  const idleWebp = await sharp(idlePng).webp({ lossless: true, effort: 6 }).toBuffer();
  const sequenceWebp = await sharp(sequencePng).webp({ lossless: true, effort: 6 }).toBuffer();
  const manifest = {
    version: 1,
    character: id,
    status: 'owner-provided-animation-runtime-integrated',
    layout: 'variable-sequence-v1',
    source_directory: `src/assets/characters/${id}/sequence-v1`,
    source_policy: 'owner-provided-split-frames-preserved; runtime atlases use nearest-neighbor normalization',
    idle_source_directory: `src/assets/characters/${id}/static-v1`,
    idle_source_policy: 'owner-provided-static-turnaround; right view is mirrored only when declared by the split manifest',
    movement_mode: definition.movementMode,
    cell: [CELL, CELL],
    row_order: DIRECTIONS,
    direction_source_map: Object.fromEntries(
      DIRECTIONS.map((direction) => [direction, definition.directionSourceMap?.[direction] ?? direction]),
    ),
    frame_count: definition.frames,
    frame_duration_ms: definition.frameDurationMs,
    loop_start: 0,
    loop_end: definition.frames - 1,
    target_anchor: TARGET_ANCHOR,
    target_visible_height: TARGET_VISIBLE_HEIGHT,
    scale,
    source_anchor_by_direction: sourceAnchorByDirection,
    idle_scale: idleScale,
    idle_source_anchor_by_direction: idleSourceAnchorByDirection,
    idle_split_manifest: `src/assets/characters/${id}/static-v1/split-manifest.json`,
    idle_png: `src/assets/characters/${id}/${id}-turnaround-v1.png`,
    idle_png_sha256: sha256(idlePng),
    idle_webp: `src/assets/characters/${id}/${id}-turnaround-v1.webp`,
    idle_webp_sha256: sha256(idleWebp),
    sequence_png: `src/assets/characters/${id}/${id}-animation-sequence-v1.png`,
    sequence_png_sha256: sha256(sequencePng),
    sequence_webp: `src/assets/characters/${id}/${id}-animation-sequence-v1.webp`,
    sequence_webp_sha256: sha256(sequenceWebp),
    idle_frames: idleFrameRecords,
    frames: frameRecords,
  };
  return { id, idlePng, idleWebp, sequencePng, sequenceWebp, manifest };
}

const records = await Promise.all(Object.entries(selectedCharacters).map(([id, definition]) => loadCharacter(id, definition)));
const builds = [];
for (const record of records) {
  const result = await buildCharacter(record);
  builds.push(result);
  console.log(`${record.id}: ${record.definition.frames}×4 帧，scale=${record.scale.toFixed(6)}，` +
    `idle=${result.idleWebp.length} bytes，sequence=${result.sequenceWebp.length} bytes`);
}

if (!APPLY) {
  console.log('dry-run: 动画源校验与运行图集构建已通过；未写入文件。使用 --apply 落盘。');
  process.exit(0);
}

for (const build of builds) {
  const characterRoot = join(CHARACTER_ROOT, build.id);
  const targets = [
    join(characterRoot, `${build.id}-turnaround-v1.png`),
    join(characterRoot, `${build.id}-turnaround-v1.webp`),
    join(characterRoot, `${build.id}-animation-sequence-v1.png`),
    join(characterRoot, `${build.id}-animation-sequence-v1.webp`),
    join(characterRoot, 'sequence-runtime-v1', 'manifest.json'),
  ];
  if (!REPLACE) {
    for (const target of targets) {
      try {
        await readFile(target);
        throw new Error(`目标已存在，需显式 --replace：${target}`);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
  const staging = join(characterRoot, `.runtime-animation-${process.pid}.tmp`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(join(staging, 'sequence-runtime-v1'), { recursive: true });
  await writeFile(join(staging, `${build.id}-turnaround-v1.png`), build.idlePng);
  await writeFile(join(staging, `${build.id}-turnaround-v1.webp`), build.idleWebp);
  await writeFile(join(staging, `${build.id}-animation-sequence-v1.png`), build.sequencePng);
  await writeFile(join(staging, `${build.id}-animation-sequence-v1.webp`), build.sequenceWebp);
  await writeFile(join(staging, 'sequence-runtime-v1', 'manifest.json'), `${JSON.stringify(build.manifest, null, 2)}\n`, 'utf8');
  if (REPLACE) {
    for (const target of targets) await rm(target, { force: true });
    await rm(join(characterRoot, 'sequence-runtime-v1'), { recursive: true, force: true });
  }
  await rename(join(staging, `${build.id}-turnaround-v1.png`), join(characterRoot, `${build.id}-turnaround-v1.png`));
  await rename(join(staging, `${build.id}-turnaround-v1.webp`), join(characterRoot, `${build.id}-turnaround-v1.webp`));
  await rename(join(staging, `${build.id}-animation-sequence-v1.png`), join(characterRoot, `${build.id}-animation-sequence-v1.png`));
  await rename(join(staging, `${build.id}-animation-sequence-v1.webp`), join(characterRoot, `${build.id}-animation-sequence-v1.webp`));
  await rename(join(staging, 'sequence-runtime-v1'), join(characterRoot, 'sequence-runtime-v1'));
  await rm(staging, { recursive: true, force: true });
}

console.log(`apply: ${builds.length} 名角色的静态图与动画序列运行资源已写入。`);
