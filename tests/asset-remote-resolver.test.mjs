import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const source = await readFile(new URL('../src/ui/asset-remote-resolver.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const { resolveRemoteRelease, validateRemoteR2Config } = await import(moduleUrl);

const stableHash = (value) => createHash('sha256').update(`${JSON.stringify(value, null, 2)}\n`).digest('hex');

test('remote R2 config rejects non-build-safe origins and unpinned coordinates', () => {
  assert.throws(() => validateRemoteR2Config({ mode: 'remote-r2', baseUrl: 'http://assets.example', releaseId: 'release-001', manifestSha256: 'a'.repeat(64) }), /HTTPS/);
  assert.throws(() => validateRemoteR2Config({ mode: 'remote-r2', baseUrl: 'https://assets.example/path?x=1', releaseId: 'release-001', manifestSha256: 'a'.repeat(64) }), /origin/);
  assert.throws(() => validateRemoteR2Config({ mode: 'remote-r2', baseUrl: 'https://assets.example', releaseId: '../latest', manifestSha256: 'a'.repeat(64) }), /releaseId/);
});

test('remote resolver validates manifest hash, origin, key, MIME and totals', async () => {
  const releaseId = '0.2.0-r55-test';
  const baseUrl = 'https://assets.example';
  const prefix = `gensokyo-moving-garden/releases/${releaseId}/`;
  const withoutHash = {
    schema_version: 'gensokyo-r2-release.v2',
    project_version: '0.2.0',
    release_id: releaseId,
    source_commit: 'a'.repeat(40),
    source_tree_dirty: false,
    generated_at: '2026-08-01T00:00:00Z',
    asset_base_url: baseUrl,
    object_prefix: prefix,
    totals: { files: 1, bytes: 3 },
    files: [{
      logical_id: 'asset:maps/map.webp', source: 'maps/map.webp', key: `${prefix}maps/map.webp`, mime: 'image/webp', bytes: 3,
      sha256: 'b'.repeat(64), cache_control: 'public, max-age=31536000, immutable', required: true, fallback: 'ui-visual-fallback',
      priority_class: 'entry-critical', bundle: 'entry:map', trigger: 'opening-background', entry_gate: 'critical', category: 'map',
    }],
  };
  const manifest = { ...withoutHash, manifest_sha256: stableHash(withoutHash) };
  const requested = [];
  const result = await resolveRemoteRelease({ mode: 'remote-r2', baseUrl, releaseId, manifestSha256: manifest.manifest_sha256 }, async (url, init) => {
    requested.push({ url, init });
    return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.equal(requested[0].url, `${baseUrl}/${prefix}manifest.json`);
  assert.equal(requested[0].init.credentials, 'omit');
  assert.equal(result.urls.get('asset:maps/map.webp'), `${baseUrl}/${prefix}maps/map.webp`);

  const bad = structuredClone(manifest);
  bad.files[0].key = `${prefix}../escape.webp`;
  await assert.rejects(() => resolveRemoteRelease({ mode: 'remote-r2', baseUrl, releaseId, manifestSha256: manifest.manifest_sha256 }, async () => new Response(JSON.stringify(bad))), /key 越界/);
});
