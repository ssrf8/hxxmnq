import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';

const root = path.resolve('src/assets/characters');
const expected = {
  alice: 25,
  cirno: 17,
  mystia: 24,
  nitori: 22,
  reimu: 20,
  sakuya: 24,
  suika: 19,
};
const directions = ['front', 'back', 'left', 'right'];

const readPng = (file) => PNG.sync.read(fs.readFileSync(file));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function alphaBBox(png) {
  let minY = png.height;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[((y * png.width + x) << 2) + 3] <= 10) continue;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return maxY < 0 ? null : { height: maxY - minY + 1, bottom: maxY + 1 };
}

test('最终版角色序列保持连续编号，生成清单可追溯到未改写原件', () => {
  for (const [character, frameCount] of Object.entries(expected)) {
    const manifestFile = path.join(root, character, 'sequence-v1', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    assert.equal(manifest.layout, 'variable-sequence-v1');
    assert.equal(manifest.status, 'generated-pending-owner-review');
    assert.equal(manifest.frameCount, frameCount);
    assert.deepEqual(manifest.rowOrder, directions);
    assert.equal(manifest.selectedFrameDurationMs, 90);
    assert.equal(manifest.maskProfileVersion, 'connected-edge-plus-interior-islands-v2');
    assert.equal(manifest.sources.length, frameCount);
    manifest.sources.forEach((source, index) => {
      assert.equal(source.index, index + 1);
      assert.match(source.file, new RegExp(`/最终版/${String(index + 1).padStart(3, '0')}\\.png$`, 'u'));
      assert.equal(hash(path.resolve(source.file)), source.sha256);
    });
  }
});

test('可变长候选图集四方向齐全、透明且统一落在 209px 单元格基线', () => {
  for (const [character, frameCount] of Object.entries(expected)) {
    const manifestFile = path.join(root, character, 'sequence-v1', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const atlas = readPng(path.resolve(manifest.atlas));
    assert.equal(atlas.width, frameCount * 209);
    assert.equal(atlas.height, 4 * 209);
    for (const direction of directions) {
      for (let index = 1; index <= frameCount; index += 1) {
        const file = path.join(
          root,
          character,
          'sequence-v1',
          'frames',
          direction,
          `${String(index).padStart(3, '0')}.png`,
        );
        const frame = readPng(file);
        assert.equal(frame.width, 209);
        assert.equal(frame.height, 209);
        const box = alphaBBox(frame);
        assert.ok(box, `${character}/${direction}/${index} must not be empty`);
        assert.ok(box.height >= 130 && box.height <= 150, `${character}/${direction}/${index} height`);
        assert.equal(box.bottom, 179);
        for (const [x, y] of [[0, 0], [208, 0], [0, 208], [208, 208]]) {
          assert.equal(frame.data[((y * frame.width + x) << 2) + 3], 0);
        }
      }
    }
  }
});
