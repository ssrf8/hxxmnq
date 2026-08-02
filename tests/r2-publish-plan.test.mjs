import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_ROOT = join(ROOT, 'dist', 'asset-live');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('R2 publisher accepts only a verified live staging dry-run plan', async () => {
  await mkdir(LIVE_ROOT, { recursive: true });
  const generation = Number.parseInt(randomBytes(3).toString('hex'), 16);
  const stagingRoot = join(LIVE_ROOT, `generation-${generation}`);
  await mkdir(stagingRoot);
  try {
    const source = 'maps/test.webp';
    const bytes = Buffer.from('verified-live-asset');
    const prefix = 'gensokyo-moving-garden/live/';
    await mkdir(join(stagingRoot, 'files', 'maps'), { recursive: true });
    await writeFile(join(stagingRoot, 'files', source), bytes);
    const withoutHash = {
      schema_version: 'gensokyo-r2-live.v1', generation, source_tree_dirty: false, object_prefix: prefix,
      totals: { files: 1, bytes: bytes.byteLength },
      files: [{ logical_id: `asset:${source}`, source, key: `${prefix}${source}`, mime: 'image/webp', bytes: bytes.byteLength, sha256: sha256(bytes), cache_control: 'public, max-age=0, must-revalidate' }],
    };
    const manifest = { ...withoutHash, manifest_sha256: sha256(Buffer.from(stableJson(withoutHash))) };
    const manifestPath = join(stagingRoot, 'manifest.json');
    await writeFile(manifestPath, stableJson(manifest));
    const manifestArg = relative(ROOT, manifestPath).replaceAll('\\', '/');
    const { stdout } = await execFileAsync(process.execPath, ['scripts/publish-r2-assets.mjs', '--dry-run', '--bucket=gensokyo-assets-test', `--manifest=${manifestArg}`], { cwd: ROOT });
    const plan = JSON.parse(stdout);
    assert.equal(plan.mode, 'dry-run-only');
    assert.equal(plan.generation, generation);
    assert.equal(plan.asset_objects, 1);
    assert.equal(plan.total_objects, 2);
    assert.equal(plan.manifest_headers.cache_control, 'no-store');
    assert.equal(plan.upload_order.at(-1), 'manifest-last');
    await assert.rejects(execFileAsync(process.execPath, ['scripts/publish-r2-assets.mjs', '--bucket=gensokyo-assets-test', `--manifest=${manifestArg}`], { cwd: ROOT }));
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
});
