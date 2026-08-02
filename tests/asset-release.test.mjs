import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectRuntimeAssets } from '../scripts/runtime-assets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_ROOT = resolve(ROOT, 'src', 'assets');
const manifest = JSON.parse(await readFile(resolve(ASSET_ROOT, 'asset-manifest.json'), 'utf8'));

test('R2 release registry contains only existing active runtime assets', async () => {
  const assets = collectRuntimeAssets(manifest);
  const expectedGalPortraits = Object.values(manifest.gal_portraits)
    .reduce((count, portrait) => count + Object.values(portrait.sources)
      .reduce((modeCount, reactions) => modeCount + Object.keys(reactions).length, 0), 0);
  assert.equal(assets.length, 103 + 1 + expectedGalPortraits);
  assert.equal(new Set(assets.map((asset) => asset.logical_id)).size, assets.length);
  assert.equal(new Set(assets.map((asset) => asset.source)).size, assets.length);

  const assetRootReal = await realpath(ASSET_ROOT);
  for (const asset of assets) {
    assert.match(asset.source, /^[\x20-\x7e]+$/);
    assert.doesNotMatch(asset.source, /(?:^|\/)(?:source|frames)(?:\/|$)|-chroma\.|\.aseprite$/i);
    const sourceReal = await realpath(resolve(ASSET_ROOT, ...asset.source.split('/')));
    const sourceRelative = relative(assetRootReal, sourceReal);
    assert.equal(sourceRelative.startsWith(`..${sep}`) || sourceRelative === '..', false);
    assert.equal((await stat(sourceReal)).isFile(), true);
  }
});

test('R2 release registry carries the single-bucket scheduling contract', () => {
  const assets = collectRuntimeAssets(manifest);
  const priorities = new Set(['entry-critical', 'entry-contextual', 'background-core', 'scene-on-demand', 'gal-deferred']);
  const gates = new Set(['critical', 'contextual', 'none']);
  for (const asset of assets) {
    assert.equal(priorities.has(asset.priority_class), true);
    assert.equal(gates.has(asset.entry_gate), true);
    assert.equal(typeof asset.bundle, 'string');
    assert.equal(typeof asset.trigger, 'string');
    assert.equal(typeof asset.category, 'string');
  }
  const expectedGalPortraits = Object.values(manifest.gal_portraits)
    .reduce((count, portrait) => count + Object.values(portrait.sources)
      .reduce((modeCount, reactions) => modeCount + Object.keys(reactions).length, 0), 0);
  assert.equal(assets.filter((asset) => asset.category !== 'gal').length, 103);
  assert.equal(assets.filter((asset) => asset.category === 'gal').length, 1 + expectedGalPortraits);
  assert.equal(assets.filter((asset) => asset.priority_class === 'entry-critical').length, 5);
  assert.equal(assets.every((asset) => asset.required === (asset.entry_gate !== 'none')), true);
});

test('R2 release registry includes every externally visible UI entry asset', () => {
  const sources = new Set(collectRuntimeAssets(manifest).map((asset) => asset.source));
  assert.equal(sources.has('ui/reimu-dungeon-button-v1.webp'), true);
  assert.equal(sources.has('ui/reimu-shop-button-v1.webp'), true);
  assert.equal(sources.has('ui/marisa-inventory-button-v1.webp'), true);
  assert.equal(sources.has('ui/reimu-shop-ui-background-v1.webp'), true);
  assert.equal(sources.has('ui/gensokyo-gal-shrine-background-v1.png'), true);
});

test('opening hero remains embedded and is never added to the R2 runtime release', async () => {
  const assets = collectRuntimeAssets(manifest);
  assert.equal(assets.some((asset) => asset.source.includes('opening-hero')), false);
  const styles = await readFile(resolve(ROOT, 'src', 'ui', 'styles.css'), 'utf8');
  assert.match(styles, /--gg-opening-hero-photo:\s*url\("data:image\/jpeg;base64,/);
});

test('every canvas image loader sets anonymous CORS before assigning an HTTPS source', async () => {
  const files = [
    ['src/battle/battle-atlas.ts', /crossOrigin = 'anonymous'[\s\S]*?image\.src = src/],
    ['src/ui/garden-map.ts', /background\.crossOrigin = 'anonymous'[\s\S]*?background\.src = mapSource/],
    ['src/ui/garden-navigation.ts', /image\.crossOrigin = 'anonymous'[\s\S]*?image\.src = source/],
    ['src/ui/sprite-actor.ts', /idleImage\.crossOrigin = 'anonymous'[\s\S]*?idleImage\.src = config\.idleSource/],
  ];
  for (const [file, pattern] of files) {
    assert.match(await readFile(resolve(ROOT, file), 'utf8'), pattern, file);
  }
  const app = await readFile(resolve(ROOT, 'src/ui/app.ts'), 'utf8');
  assert.match(app, /taggedAssets\(\[battleAtlasSources\][\s\S]*?category: 'battle', crossOrigin: 'anonymous'/);
});
