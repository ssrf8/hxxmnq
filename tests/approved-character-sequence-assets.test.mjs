import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';

const root = path.resolve('src/assets/characters');
const directions = ['front', 'back', 'left', 'right'];
const expected = {
  alice: { frames: 25, duration: 90 },
  cirno: { frames: 17, duration: 100 },
  mystia: { frames: 24, duration: 80 },
  nitori: { frames: 22, duration: 90 },
  reimu: { frames: 20, duration: 110 },
  sakuya: { frames: 24, duration: 100 },
  suika: { frames: 19, duration: 100 },
};

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

test('所有者验收帧以原字节归档，运行时描述保留独立帧数、速度和锚点', () => {
  const assets = JSON.parse(fs.readFileSync('src/assets/asset-manifest.json', 'utf8'));
  for (const [id, contract] of Object.entries(expected)) {
    const manifestPath = path.join(root, id, 'sequence-approved-v1', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.status, 'owner-approved-sequence-source');
    assert.equal(manifest.layout, 'variable-sequence-v1');
    assert.equal(manifest.sourcePolicy, 'copied-byte-for-byte-from-owner-approved-frames');
    assert.equal(manifest.transform, 'uniform-nearest-neighbor-fixed-anchor');
    assert.equal(manifest.frameCount, contract.frames);
    assert.equal(manifest.frameDurationMs, contract.duration);
    assert.deepEqual(manifest.rowOrder, directions);
    assert.equal(manifest.stationaryFrame, 'direction-row-column-0');
    assert.equal('idleFrame' in manifest, false);
    assert.equal(manifest.loopStart, 0);
    assert.equal(manifest.loopEnd, contract.frames - 1);
    assert.deepEqual(manifest.targetAnchor, [104, 179]);
    assert.equal(manifest.sources.length, contract.frames * directions.length);
    assert.equal(manifest.frames.length, contract.frames * directions.length);
    for (const source of manifest.sources) {
      const bytes = fs.readFileSync(path.resolve(source.file));
      assert.equal(sha256(bytes), source.sha256, `${id}/${source.direction}/${source.index} approved source hash`);
    }
    const asset = assets.characters[id];
    assert.equal(asset.animation_sequence_frame_count, contract.frames);
    assert.equal(asset.animation_sequence_frame_duration_ms, contract.duration);
    assert.equal(path.resolve('src/assets', asset.animation_sequence_manifest), manifestPath);
  }
});

test('所有者验收图集逐格等于适配帧，保持透明边界且不逐帧裁切', () => {
  for (const [id, contract] of Object.entries(expected)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, id, 'sequence-approved-v1', 'manifest.json'), 'utf8'));
    const atlasBytes = fs.readFileSync(path.resolve(manifest.atlas));
    assert.equal(sha256(atlasBytes), manifest.atlasSha256);
    const atlas = PNG.sync.read(atlasBytes);
    assert.equal(atlas.width, contract.frames * 209);
    assert.equal(atlas.height, 4 * 209);
    for (const frameRecord of manifest.frames) {
      const frame = PNG.sync.read(fs.readFileSync(path.resolve(frameRecord.file)));
      assert.equal(frame.width, 209);
      assert.equal(frame.height, 209);
      assert.ok(frameRecord.bbox.height <= 150);
      assert.ok(frameRecord.bbox.height >= 120);
      assert.ok(frameRecord.bbox.minX > 0 && frameRecord.bbox.maxX < 208);
      assert.ok(frameRecord.bbox.minY > 0 && frameRecord.bbox.maxY < 208);
      const row = directions.indexOf(frameRecord.direction);
      for (let y = 0; y < 209; y += 1) {
        const atlasStart = (((row * 209 + y) * atlas.width) + (frameRecord.index - 1) * 209) << 2;
        const frameStart = (y * 209) << 2;
        assert.deepEqual(
          atlas.data.subarray(atlasStart, atlasStart + 209 * 4),
          frame.data.subarray(frameStart, frameStart + 209 * 4),
          `${id}/${frameRecord.direction}/${frameRecord.index} atlas parity`,
        );
      }
    }
  }
});
