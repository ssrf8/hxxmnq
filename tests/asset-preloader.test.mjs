import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const source = await readFile(new URL('../src/ui/asset-preloader.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const { AssetPreloader, collectPreloadAssets } = await import(moduleUrl);

test('preload asset collector recursively finds and deduplicates image/audio URLs', () => {
  const assets = collectPreloadAssets(
    { label: '灵梦', image: '../assets/reimu.png', nested: ['../assets/reimu.png', 'https://cdn.example/a.wav'] },
    'data:image/png;base64,AAAA',
  );
  assert.deepEqual(assets, [
    { url: '../assets/reimu.png', kind: 'image' },
    { url: 'https://cdn.example/a.wav', kind: 'audio' },
    { url: 'data:image/png;base64,AAAA', kind: 'image' },
  ]);
});

test('preloader starts once and retries only the failed asset up to three attempts', async () => {
  const attempts = new Map();
  const load = async ({ url }) => {
    const count = (attempts.get(url) ?? 0) + 1;
    attempts.set(url, count);
    if (url.endsWith('retry.png') && count < 3) throw new Error('temporary failure');
  };
  const preloader = new AssetPreloader([
    { url: '/ready.png', kind: 'image' },
    { url: '/retry.png', kind: 'image' },
  ], { concurrency: 2, maxAttempts: 3, retryDelayMs: 0, load });

  const first = preloader.start();
  const second = preloader.start();
  assert.equal(first, second);
  const snapshot = await first;

  assert.equal(attempts.get('/ready.png'), 1);
  assert.equal(attempts.get('/retry.png'), 3);
  assert.equal(snapshot.loaded, 2);
  assert.equal(snapshot.failed, 0);
  assert.equal(snapshot.done, true);
  assert.equal(snapshot.percent, 100);
});

test('preloader settles after the retry limit and reports only exhausted URLs', async () => {
  let attempts = 0;
  const preloader = new AssetPreloader([
    { url: '/missing.png', kind: 'image' },
  ], {
    maxAttempts: 3,
    retryDelayMs: 0,
    load: async () => { attempts += 1; throw new Error('still missing'); },
  });

  const snapshot = await preloader.waitForCompletion();
  assert.equal(attempts, 3);
  assert.equal(snapshot.loaded, 0);
  assert.equal(snapshot.failed, 1);
  assert.deepEqual(snapshot.failedUrls, ['/missing.png']);
  assert.equal(snapshot.done, true);
});

test('entry gate resolves without waiting for deferred GAL assets', async () => {
  const order = [];
  const preloader = new AssetPreloader([
    { url: '/map.webp', kind: 'image', logicalId: 'map', priorityClass: 'entry-critical', entryGate: 'critical', bundle: 'entry' },
    { url: '/core.webp', kind: 'image', logicalId: 'core', priorityClass: 'background-core', entryGate: 'none', bundle: 'core' },
    { url: '/gal.webp', kind: 'image', logicalId: 'gal', priorityClass: 'gal-deferred', entryGate: 'none', bundle: 'gal' },
  ], { concurrency: 1, retryDelayMs: 0, load: async ({ logicalId }) => { order.push(logicalId); } });

  const entry = await preloader.waitForEntryGate(1000);
  assert.equal(entry.entryReady, true);
  assert.deepEqual(order.slice(0, 1), ['map']);
  await preloader.waitForCompletion();
  assert.deepEqual(order, ['map', 'core', 'gal']);
});

test('ensure promotes a demanded GAL asset ahead of unfinished background assets', async () => {
  const order = [];
  let releaseFirst;
  const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
  const preloader = new AssetPreloader([
    { url: '/one.webp', kind: 'image', logicalId: 'one', priorityClass: 'background-core', entryGate: 'none', bundle: 'core' },
    { url: '/two.webp', kind: 'image', logicalId: 'two', priorityClass: 'background-core', entryGate: 'none', bundle: 'core' },
    { url: '/gal.webp', kind: 'image', logicalId: 'gal', priorityClass: 'gal-deferred', entryGate: 'none', bundle: 'gal:hero' },
  ], { concurrency: 1, retryDelayMs: 0, load: async ({ logicalId }) => {
    order.push(logicalId);
    if (logicalId === 'one') await firstBlocked;
  } });
  void preloader.start();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const ensured = preloader.ensure('gal');
  releaseFirst();
  await ensured;
  await preloader.waitForCompletion();
  assert.deepEqual(order, ['one', 'gal', 'two']);
});

test('destroy is idempotent and cancels in-flight work', async () => {
  const preloader = new AssetPreloader([
    { url: '/slow.webp', kind: 'image' },
  ], { load: async (_asset, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
  void preloader.start();
  preloader.destroy();
  preloader.destroy();
  const snapshot = await preloader.waitForCompletion();
  assert.equal(snapshot.destroyed, true);
});

test('entry timeout is sticky so later renders do not block for another timeout window', async () => {
  const preloader = new AssetPreloader([
    { url: '/slow-entry.webp', kind: 'image', priorityClass: 'entry-critical', entryGate: 'critical' },
  ], { load: async () => new Promise(() => undefined) });
  const first = await preloader.waitForEntryGate(5);
  assert.equal(first.entryTimedOut, true);
  const startedAt = Date.now();
  const second = await preloader.waitForEntryGate(1_000);
  assert.equal(second.entryTimedOut, true);
  assert.equal(Date.now() - startedAt < 100, true);
  preloader.destroy();
});
