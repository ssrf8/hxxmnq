import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { PNG } from 'pngjs';

const CELL = 209;
const TARGET_VISIBLE_HEIGHT = 150;
const TARGET_ANCHOR = [104, 179];
const DIRECTIONS = ['front', 'back', 'left', 'right'];
const CHARACTER_ROOT = path.resolve('src/assets/characters');

const characters = {
  alice: {
    source: 'characters/alice/aligned-v1',
    frameCount: 25,
    frameDurationMs: 90,
    anchors: { front: [160, 304], back: [160, 304], left: [160, 304], right: [160, 304] },
  },
  cirno: {
    source: 'characters/cirno/transparent-v1',
    frameCount: 17,
    frameDurationMs: 100,
    // Cirno was approved before unified positioning. These fixed direction anchors
    // preserve the approved intra-sequence motion while adapting its four canvases.
    anchors: { front: [185, 330], back: [140, 331], left: [187, 270], right: [133, 270] },
  },
  mystia: {
    source: 'characters/mystia/验收通过版/frames',
    frameCount: 24,
    frameDurationMs: 80,
    anchors: { front: [160, 304], back: [160, 304], left: [160, 304], right: [160, 304] },
  },
  nitori: {
    source: 'characters/nitori/定位完成',
    frameCount: 22,
    frameDurationMs: 90,
    anchors: { front: [160, 304], back: [160, 304], left: [160, 304], right: [160, 304] },
  },
  reimu: {
    source: 'characters/reimu/sprite-sequence-v1/frames',
    frameCount: 20,
    frameDurationMs: 110,
    anchors: { front: [160, 304], back: [160, 304], left: [160, 304], right: [160, 304] },
  },
  sakuya: {
    source: 'characters/sakuya/定位结果',
    frameCount: 24,
    frameDurationMs: 100,
    anchors: { front: [160, 304], back: [160, 304], left: [160, 304], right: [160, 304] },
  },
  suika: {
    source: 'characters/suika/验收通过版/frames',
    frameCount: 19,
    frameDurationMs: 100,
    anchors: { front: [160, 313], back: [160, 313], left: [160, 313], right: [160, 313] },
  },
};

function parseArguments() {
  const dryRun = process.argv.includes('--dry-run');
  const replace = process.argv.includes('--replace');
  const sourceArgument = process.argv.find((argument) => argument.startsWith('--source-root='));
  if (!sourceArgument) {
    throw new Error('缺少 --source-root=<已验收角色动画项目>');
  }
  const sourceRoot = path.resolve(sourceArgument.slice('--source-root='.length));
  return { dryRun, replace, sourceRoot };
}

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

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

function validateSource(sourceRoot, id, definition) {
  const root = path.resolve(sourceRoot, definition.source);
  if (!root.startsWith(`${sourceRoot}${path.sep}`)) throw new Error(`${id} 源目录越界`);
  const frames = [];
  let maximumVisibleHeight = 0;
  for (const direction of DIRECTIONS) {
    const directory = path.join(root, direction);
    const names = fs.readdirSync(directory).filter((name) => /^\d{3}\.png$/u.test(name)).sort();
    if (names.length !== definition.frameCount) {
      throw new Error(`${id}/${direction} 应有 ${definition.frameCount} 帧，实际 ${names.length}`);
    }
    names.forEach((name, index) => {
      const expected = `${String(index + 1).padStart(3, '0')}.png`;
      if (name !== expected) throw new Error(`${id}/${direction} 编号不连续：${name} != ${expected}`);
      const file = path.join(directory, name);
      const bytes = fs.readFileSync(file);
      const png = PNG.sync.read(bytes);
      if (png.colorType !== 6) throw new Error(`${id}/${direction}/${name} 不是 RGBA PNG`);
      const bbox = alphaBBox(png);
      maximumVisibleHeight = Math.max(maximumVisibleHeight, bbox.height);
      frames.push({ id, direction, index: index + 1, name, file, bytes, png, bbox, sha256: hash(bytes) });
    });
  }
  return { id, definition, root, frames, scale: TARGET_VISIBLE_HEIGHT / maximumVisibleHeight };
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

function writeCharacter(stagingRoot, record, sourceRoot) {
  const { id, definition, frames, scale } = record;
  const characterStage = path.join(stagingRoot, id);
  const packageRoot = path.join(characterStage, 'sequence-approved-v1');
  const atlas = new PNG({ width: CELL * definition.frameCount, height: CELL * DIRECTIONS.length });
  atlas.data.fill(0);
  const sourceRecords = [];
  const frameRecords = [];

  for (const frame of frames) {
    const sourceRelative = path.join('source', frame.direction, frame.name);
    const sourceTarget = path.join(packageRoot, sourceRelative);
    fs.mkdirSync(path.dirname(sourceTarget), { recursive: true });
    fs.copyFileSync(frame.file, sourceTarget);

    const rendered = renderFrame(frame.png, scale, definition.anchors[frame.direction]);
    const renderedBox = alphaBBox(rendered);
    if (renderedBox.minX <= 0 || renderedBox.minY <= 0 || renderedBox.maxX >= CELL - 1 || renderedBox.maxY >= CELL - 1) {
      throw new Error(`${id}/${frame.direction}/${frame.name} 适配后触碰 209px 画布边缘`);
    }
    const frameRelative = path.join('frames', frame.direction, frame.name);
    const frameTarget = path.join(packageRoot, frameRelative);
    fs.mkdirSync(path.dirname(frameTarget), { recursive: true });
    const renderedBytes = PNG.sync.write(rendered);
    fs.writeFileSync(frameTarget, renderedBytes);
    blit(atlas, rendered, (frame.index - 1) * CELL, DIRECTIONS.indexOf(frame.direction) * CELL);

    sourceRecords.push({
      index: frame.index,
      direction: frame.direction,
      file: `src/assets/characters/${id}/sequence-approved-v1/${sourceRelative.replaceAll('\\', '/')}`,
      sha256: frame.sha256,
      size: [frame.png.width, frame.png.height],
      bbox: frame.bbox,
    });
    frameRecords.push({
      index: frame.index,
      direction: frame.direction,
      file: `src/assets/characters/${id}/sequence-approved-v1/${frameRelative.replaceAll('\\', '/')}`,
      sha256: hash(renderedBytes),
      bbox: renderedBox,
    });
  }

  const atlasName = `${id}-animation-sequence-approved-v1.png`;
  const atlasBytes = PNG.sync.write(atlas);
  fs.writeFileSync(path.join(characterStage, atlasName), atlasBytes);
  const manifest = {
    version: 1,
    character: id,
    status: 'owner-approved-sequence-source',
    runtimeStatus: 'ready-for-runtime-integration',
    layout: 'variable-sequence-v1',
    sourceProject: path.relative(path.resolve('.'), sourceRoot).replaceAll('\\', '/'),
    sourceDirectory: definition.source.replaceAll('\\', '/'),
    sourcePolicy: 'copied-byte-for-byte-from-owner-approved-frames',
    transform: 'uniform-nearest-neighbor-fixed-anchor',
    cell: [CELL, CELL],
    atlas: `src/assets/characters/${id}/${atlasName}`,
    atlasSha256: hash(atlasBytes),
    atlasSize: [atlas.width, atlas.height],
    frameCount: definition.frameCount,
    rowOrder: DIRECTIONS,
    frameDurationMs: definition.frameDurationMs,
    stationaryFrame: 'direction-row-column-0',
    loopStart: 0,
    loopEnd: definition.frameCount - 1,
    sourceAnchorByDirection: definition.anchors,
    targetAnchor: TARGET_ANCHOR,
    targetVisibleHeight: TARGET_VISIBLE_HEIGHT,
    scale,
    sources: sourceRecords,
    frames: frameRecords,
  };
  fs.writeFileSync(path.join(packageRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function main() {
  const { dryRun, replace, sourceRoot } = parseArguments();
  const records = Object.entries(characters).map(([id, definition]) => validateSource(sourceRoot, id, definition));
  for (const record of records) {
    const targetPackage = path.join(CHARACTER_ROOT, record.id, 'sequence-approved-v1');
    const targetAtlas = path.join(CHARACTER_ROOT, record.id, `${record.id}-animation-sequence-approved-v1.png`);
    if (!replace && (fs.existsSync(targetPackage) || fs.existsSync(targetAtlas))) {
      throw new Error(`${record.id} 目标已存在；需要显式 --replace`);
    }
    console.log(`${record.id}: ${record.definition.frameCount}×4 accepted frames, scale=${record.scale.toFixed(6)}, duration=${record.definition.frameDurationMs}ms`);
  }
  if (dryRun) {
    console.log('dry-run: source validation passed; no files written');
    return;
  }

  const stagingRoot = path.join(CHARACTER_ROOT, `.approved-sequence-import-staging-${process.pid}`);
  fs.mkdirSync(stagingRoot, { recursive: false });
  try {
    for (const record of records) writeCharacter(stagingRoot, record, sourceRoot);
    for (const record of records) {
      const characterRoot = path.join(CHARACTER_ROOT, record.id);
      const targetPackage = path.join(characterRoot, 'sequence-approved-v1');
      const targetAtlas = path.join(characterRoot, `${record.id}-animation-sequence-approved-v1.png`);
      if (replace) {
        fs.rmSync(targetPackage, { recursive: true, force: true });
        fs.rmSync(targetAtlas, { force: true });
      }
      fs.renameSync(path.join(stagingRoot, record.id, 'sequence-approved-v1'), targetPackage);
      fs.renameSync(path.join(stagingRoot, record.id, `${record.id}-animation-sequence-approved-v1.png`), targetAtlas);
    }
    console.log('import: owner-approved sequences copied and adapted successfully');
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

main();
