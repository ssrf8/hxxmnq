import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const CELL = 209;
const TARGET_HEIGHT = 150;
const BASELINE = 179;
const SOURCE_SIZE = 640;
const QUADRANT = SOURCE_SIZE / 2;
const ROW_ORDER = ['front', 'back', 'left', 'right'];
const CHARACTER_ROOT = path.resolve('src/assets/characters');
const FINAL_DIR = '\u6700\u7ec8\u7248';
const CHARACTERS = ['alice', 'cirno', 'mystia', 'nitori', 'reimu', 'sakuya', 'suika'];

function sourceFiles(character) {
  const directory = path.join(CHARACTER_ROOT, character, FINAL_DIR);
  if (!fs.existsSync(directory)) throw new Error(`${character}: missing ${directory}`);
  const files = fs.readdirSync(directory)
    .filter((file) => /^\d{3}\.png$/u.test(file))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  if (!files.length) throw new Error(`${character}: no numbered PNG frames`);
  files.forEach((file, index) => {
    const expected = `${String(index + 1).padStart(3, '0')}.png`;
    if (file !== expected) throw new Error(`${character}: expected ${expected}, got ${file}`);
  });
  return files.map((file) => path.join(directory, file));
}

function loadSource(file) {
  const bytes = fs.readFileSync(file);
  const png = PNG.sync.read(bytes);
  if (png.width !== SOURCE_SIZE || png.height !== SOURCE_SIZE) {
    throw new Error(`${file}: expected ${SOURCE_SIZE}x${SOURCE_SIZE}, got ${png.width}x${png.height}`);
  }
  return {
    png,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function cropQuadrant(source, row) {
  const output = new PNG({ width: QUADRANT, height: QUADRANT });
  const sourceX = row % 2 === 0 ? 0 : QUADRANT;
  const sourceY = row < 2 ? 0 : QUADRANT;
  for (let y = 0; y < QUADRANT; y += 1) {
    const start = ((sourceY + y) * source.width + sourceX) << 2;
    source.data.copy(output.data, y * QUADRANT << 2, start, start + (QUADRANT << 2));
  }
  return output;
}

function borderAverage(png) {
  const totals = [0, 0, 0];
  let count = 0;
  const sample = (x, y) => {
    const index = (y * png.width + x) << 2;
    totals[0] += png.data[index];
    totals[1] += png.data[index + 1];
    totals[2] += png.data[index + 2];
    count += 1;
  };
  for (let x = 0; x < png.width; x += 2) {
    sample(x, 0);
    sample(x, png.height - 1);
  }
  for (let y = 2; y < png.height - 1; y += 2) {
    sample(0, y);
    sample(png.width - 1, y);
  }
  return totals.map((value) => Math.round(value / count));
}

function backgroundProfile(border) {
  const [r, g, b] = border;
  const average = (r + g + b) / 3;
  if (g - r >= 55 && g - b >= 55) return 'green';
  if (average < 70) return 'dark';
  return 'light';
}

function isBackgroundCandidate(profile, r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const average = (r + g + b) / 3;
  if (profile === 'green') return g >= 85 && g - r >= 48 && g - b >= 48;
  if (profile === 'dark') return average <= 12 && max - min <= 12;
  return average >= 195 && max - min <= 36;
}

function isStrongInteriorBackground(profile, border, r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const average = (r + g + b) / 3;
  if (profile === 'green') {
    return g >= 45 && g - r >= 20 && g - b >= 20 && g >= r * 1.3 && g >= b * 1.3;
  }
  if (profile === 'dark') return average <= 12 && max - min <= 12;
  const distanceSquared = (r - border[0]) ** 2 + (g - border[1]) ** 2 + (b - border[2]) ** 2;
  return distanceSquared <= 144 && max - min <= 18;
}

function removeInteriorBackgroundIslands(source, profile, border) {
  if (profile === 'dark') return { removedPixels: 0, removedIslands: 0 };
  const { width, height } = source;
  const eligible = new Uint8Array(width * height);
  for (let position = 0; position < width * height; position += 1) {
    const index = position << 2;
    if (source.data[index + 3] <= 10) continue;
    if (isStrongInteriorBackground(
      profile,
      border,
      source.data[index],
      source.data[index + 1],
      source.data[index + 2],
    )) eligible[position] = 1;
  }
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let removedPixels = 0;
  let removedIslands = 0;
  for (let origin = 0; origin < width * height; origin += 1) {
    if (!eligible[origin] || visited[origin]) continue;
    let head = 0;
    let tail = 1;
    queue[0] = origin;
    visited[origin] = 1;
    while (head < tail) {
      const position = queue[head];
      head += 1;
      const x = position % width;
      const y = Math.floor(position / width);
      for (const [offsetX, offsetY] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (!eligible[next] || visited[next]) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
    // Green-screen residue has no approved in-character use. White backgrounds,
    // however, overlap real highlights, lace and hair, so only remove sizeable
    // enclosed islands such as leg gaps and prop interiors.
    const minimumIslandPixels = profile === 'green' ? 1 : 48;
    if (tail < minimumIslandPixels) continue;
    removedIslands += 1;
    removedPixels += tail;
    for (let index = 0; index < tail; index += 1) {
      source.data[(queue[index] << 2) + 3] = 0;
    }
  }
  return { removedPixels, removedIslands };
}

function removeConnectedBackground(source) {
  const width = source.width;
  const height = source.height;
  const border = borderAverage(source);
  const profile = backgroundProfile(border);
  const background = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (x, y) => {
    const position = y * width + x;
    if (background[position]) return;
    const index = position << 2;
    if (!isBackgroundCandidate(
      profile,
      source.data[index],
      source.data[index + 1],
      source.data[index + 2],
    )) return;
    background[position] = 1;
    queue[tail] = position;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }
  while (head < tail) {
    const position = queue[head];
    head += 1;
    const x = position % width;
    const y = Math.floor(position / width);
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }

  const output = new PNG({ width, height });
  output.data.fill(0);
  for (let position = 0; position < width * height; position += 1) {
    if (background[position]) continue;
    const index = position << 2;
    output.data[index] = source.data[index];
    output.data[index + 1] = source.data[index + 1];
    output.data[index + 2] = source.data[index + 2];
    output.data[index + 3] = 255;
  }
  const interior = removeInteriorBackgroundIslands(output, profile, border);
  return {
    output: removeStrayComponents(output),
    profile,
    border,
    connectedBackgroundPixelsRemoved: tail,
    interiorBackgroundPixelsRemoved: interior.removedPixels,
    interiorBackgroundIslandsRemoved: interior.removedIslands,
  };
}

function removeStrayComponents(source) {
  const { width, height } = source;
  // Generated 2×2 sheets carry 7–12 px divider bands inside quadrant edges.
  // No approved character silhouette reaches this margin.
  const edgeTrim = 16;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= edgeTrim && y >= edgeTrim && x < width - edgeTrim && y < height - edgeTrim) continue;
      source.data[((y * width + x) << 2) + 3] = 0;
    }
  }
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components = [];
  for (let origin = 0; origin < width * height; origin += 1) {
    if (visited[origin] || source.data[(origin << 2) + 3] <= 10) continue;
    let head = 0;
    let tail = 1;
    queue[0] = origin;
    visited[origin] = 1;
    const pixels = [];
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    while (head < tail) {
      const position = queue[head];
      head += 1;
      pixels.push(position);
      const x = position % width;
      const y = Math.floor(position / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (!offsetX && !offsetY) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (visited[next] || source.data[(next << 2) + 3] <= 10) continue;
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
    }
    components.push({ pixels, minX, minY, maxX, maxY });
  }
  const candidates = components.filter((component) => (
    component.maxX - component.minX + 1 >= 12
    && component.maxY - component.minY + 1 >= 12
    && component.pixels.length >= 80
  ));
  if (!candidates.length) return source;
  const score = (component) => {
    const centerX = (component.minX + component.maxX) / 2;
    const centerY = (component.minY + component.maxY) / 2;
    return component.pixels.length - Math.hypot(centerX - width / 2, centerY - height / 2) * 10;
  };
  const primary = candidates.reduce((best, component) => (
    score(component) > score(best) ? component : best
  ));
  const nearPrimary = (component, margin) => (
    component.maxX >= primary.minX - margin
    && component.minX <= primary.maxX + margin
    && component.maxY >= primary.minY - margin
    && component.minY <= primary.maxY + margin
  );
  const output = new PNG({ width, height });
  output.data.fill(0);
  const touchesTrimBoundary = (component) => (
    component.minX <= edgeTrim
    || component.minY <= edgeTrim
    || component.maxX >= width - edgeTrim - 1
    || component.maxY >= height - edgeTrim - 1
  );
  for (const component of components) {
    const keep = component === primary
      || (!touchesTrimBoundary(component)
        && component.pixels.length >= 2 && nearPrimary(component, 32))
      || (component.pixels.length >= Math.max(24, primary.pixels.length * 0.0025)
        && !touchesTrimBoundary(component) && nearPrimary(component, 40));
    if (!keep) continue;
    for (const position of component.pixels) {
      const index = position << 2;
      source.data.copy(output.data, index, index, index + 4);
    }
  }
  return output;
}

function contentBBox(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  let pixels = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[((y * png.width + x) << 2) + 3];
      if (alpha <= 10) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      pixels += 1;
    }
  }
  if (maxX < 0) throw new Error('background removal produced an empty frame');
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    pixels,
  };
}

function placeInCell(source, bbox, scale) {
  const targetWidth = Math.max(1, Math.round(bbox.width * scale));
  const targetHeight = Math.max(1, Math.round(bbox.height * scale));
  const left = Math.round((CELL - targetWidth) / 2);
  const top = BASELINE - targetHeight;
  if (left < 0 || top < 0 || left + targetWidth > CELL || top + targetHeight > CELL) {
    throw new Error(`normalized frame exceeds ${CELL}x${CELL}`);
  }
  const output = new PNG({ width: CELL, height: CELL });
  output.data.fill(0);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = bbox.minY + Math.min(bbox.height - 1, Math.floor(y / scale));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = bbox.minX + Math.min(bbox.width - 1, Math.floor(x / scale));
      const sourceIndex = (sourceY * source.width + sourceX) << 2;
      if (source.data[sourceIndex + 3] <= 10) continue;
      const targetIndex = ((top + y) * CELL + left + x) << 2;
      source.data.copy(output.data, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
  return output;
}

function blit(target, source, left, top) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceIndex = (y * source.width + x) << 2;
      if (!source.data[sourceIndex + 3]) continue;
      const targetIndex = ((top + y) * target.width + left + x) << 2;
      source.data.copy(target.data, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
}

function writeCharacter(character) {
  const files = sourceFiles(character);
  const frames = [];
  const sourceRecords = [];
  for (const [index, file] of files.entries()) {
    const { png, sha256 } = loadSource(file);
    sourceRecords.push({
      index: index + 1,
      file: path.relative(process.cwd(), file).replaceAll('\\', '/'),
      sha256,
    });
    const directions = ROW_ORDER.map((direction, row) => {
      const result = removeConnectedBackground(cropQuadrant(png, row));
      const bbox = contentBBox(result.output);
      return {
        direction,
        raw: result.output,
        bbox,
        backgroundProfile: result.profile,
        borderRgb: result.border,
        connectedBackgroundPixelsRemoved: result.connectedBackgroundPixelsRemoved,
        interiorBackgroundPixelsRemoved: result.interiorBackgroundPixelsRemoved,
        interiorBackgroundIslandsRemoved: result.interiorBackgroundIslandsRemoved,
      };
    });
    frames.push(directions);
  }

  const maximumHeight = Math.max(...frames.flat().map((frame) => frame.bbox.height));
  const scale = TARGET_HEIGHT / maximumHeight;
  const outputRoot = path.join(CHARACTER_ROOT, character, 'sequence-v1');
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  const atlas = new PNG({ width: CELL * files.length, height: CELL * ROW_ORDER.length });
  atlas.data.fill(0);
  const manifestFrames = [];
  for (let index = 0; index < frames.length; index += 1) {
    for (let row = 0; row < ROW_ORDER.length; row += 1) {
      const source = frames[index][row];
      const cell = placeInCell(source.raw, source.bbox, scale);
      const directionDirectory = path.join(outputRoot, 'frames', source.direction);
      fs.mkdirSync(directionDirectory, { recursive: true });
      const frameName = `${String(index + 1).padStart(3, '0')}.png`;
      const outputFile = path.join(directionDirectory, frameName);
      fs.writeFileSync(outputFile, PNG.sync.write(cell));
      blit(atlas, cell, index * CELL, row * CELL);
      manifestFrames.push({
        index: index + 1,
        direction: source.direction,
        file: path.relative(process.cwd(), outputFile).replaceAll('\\', '/'),
        sourceBBox: source.bbox,
        backgroundProfile: source.backgroundProfile,
        borderRgb: source.borderRgb,
        connectedBackgroundPixelsRemoved: source.connectedBackgroundPixelsRemoved,
        interiorBackgroundPixelsRemoved: source.interiorBackgroundPixelsRemoved,
        interiorBackgroundIslandsRemoved: source.interiorBackgroundIslandsRemoved,
      });
    }
  }

  const atlasFile = path.join(CHARACTER_ROOT, character, `${character}-animation-sequence-v1.png`);
  fs.writeFileSync(atlasFile, PNG.sync.write(atlas));
  const manifest = {
    version: 1,
    character,
    status: 'generated-pending-owner-review',
    layout: 'variable-sequence-v1',
    sourceLayout: '2x2',
    sourceQuadrants: {
      front: 'top-left',
      back: 'top-right',
      left: 'bottom-left',
      right: 'bottom-right',
    },
    sourceSize: [SOURCE_SIZE, SOURCE_SIZE],
    cell: [CELL, CELL],
    atlas: path.relative(process.cwd(), atlasFile).replaceAll('\\', '/'),
    atlasSize: [atlas.width, atlas.height],
    frameCount: files.length,
    rowOrder: ROW_ORDER,
    idleFrame: 0,
    loopStart: 0,
    loopEnd: files.length - 1,
    candidateFrameDurationsMs: [90, 110, 130],
    selectedFrameDurationMs: 90,
    maskProfileVersion: 'connected-edge-plus-interior-islands-v2',
    targetVisibleHeight: TARGET_HEIGHT,
    baseline: BASELINE,
    scale,
    sources: sourceRecords,
    frames: manifestFrames,
  };
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `${character}: ${files.length} frames, ${atlas.width}x${atlas.height}, `
    + `source max height=${maximumHeight}, scale=${scale.toFixed(4)}`,
  );
}

for (const character of CHARACTERS) writeCharacter(character);
