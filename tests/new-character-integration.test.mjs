import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';

const read = (path) => readFile(new URL(path, import.meta.url));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const importTypescript = async (path) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const characters = {
  youmu: { name: '魂魄妖梦', frames: 28, duration: 48, source: '妖梦' },
  patchouli: { name: '帕秋莉·诺蕾姬', frames: 26, duration: 48, source: '帕秋莉' },
  sanae: { name: '东风谷早苗', frames: 35, duration: 48, source: '早苗' },
};

test('三名新角色无剧情前置即可进入随机来访候选池', async () => {
  const visitors = await importTypescript('../src/ui/visitor-rules.ts');
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const initial = JSON.parse((await read('../src/schema/initial-state.json')).toString('utf8'));
  const state = migration.migrateGardenState(initial);
  const profiles = new Map(visitors.listVisitProfiles().map((profile) => [profile.character_id, profile]));
  for (const [id, definition] of Object.entries(characters)) {
    assert.equal(profiles.get(id)?.eligibility, 'always');
    assert.equal(visitors.isCharacterKnown({ events: { completed_key_events: {} } }, id), true);
    assert.ok(state.visit_scheduler.known_characters.includes(id));
    assert.equal(state.characters[id].name, definition.name);
  }

  const observed = new Set();
  for (let index = 0; index < 2500 && observed.size < 3; index += 1) {
    const probe = structuredClone(state);
    probe.environment = { day: 2, time_period: '白昼' };
    probe.presence_snapshot = { present_character_ids: [], character_views: {}, visitor_meta: {} };
    probe.visit_scheduler.plans = [];
    probe.visit_scheduler.cooldown_until = {};
    probe.visit_scheduler.last_processed_serial = null;
    const result = visitors.evaluateVisitScheduler(probe, { chatId: `new-character-${index}` });
    const id = result.state.visit_scheduler.plans.find((plan) => plan.source === 'random')?.character_id;
    if (id in characters) observed.add(id);
  }
  assert.deepEqual([...observed].sort(), Object.keys(characters).sort());
});

test('妖梦与早苗左右运行方向纠正且完整保留四方向源帧', async () => {
  for (const id of ['youmu', 'sanae']) {
    const { frames: frameCount } = characters[id];
    const runtimeManifest = JSON.parse(
      (await read(`../src/assets/characters/${id}/sequence-runtime-v1/manifest.json`)).toString('utf8'),
    );
    assert.deepEqual(runtimeManifest.direction_source_map, {
      front: 'front',
      back: 'back',
      left: 'right',
      right: 'left',
    });
    assert.equal(runtimeManifest.frames.length, frameCount * 4);

    for (const direction of ['front', 'back', 'left', 'right']) {
      const names = (await readdir(new URL(`../src/assets/characters/${id}/sequence-v1/${direction}/`, import.meta.url)))
        .filter((name) => /^\d{3}\.png$/u.test(name));
      assert.equal(names.length, frameCount, `${id}/${direction} 源帧数`);
    }

    const expectedSourceDirection = { left: 'right', right: 'left' };
    for (const [runtimeDirection, sourceDirection] of Object.entries(expectedSourceDirection)) {
      const mappedFrames = runtimeManifest.frames.filter((frame) => frame.direction === runtimeDirection);
      assert.equal(mappedFrames.length, frameCount);
      assert.ok(mappedFrames.every((frame) => frame.source.includes(`/sequence-v1/${sourceDirection}/`)));
    }
  }
});

test('三名新角色使用独立静态视图且仅早苗右视图来自左视图镜像', async () => {
  for (const id of ['youmu', 'patchouli', 'sanae']) {
    const runtimeManifest = JSON.parse(
      (await read(`../src/assets/characters/${id}/sequence-runtime-v1/manifest.json`)).toString('utf8'),
    );
    const splitManifest = JSON.parse(
      (await read(`../src/assets/characters/${id}/static-v1/split-manifest.json`)).toString('utf8'),
    );
    assert.equal(runtimeManifest.idle_source_directory, `src/assets/characters/${id}/static-v1`);
    assert.equal(runtimeManifest.idle_frames.length, 4);
    assert.ok(runtimeManifest.idle_frames.every((frame) => frame.source.includes('/static-v1/')));
    assert.notEqual(runtimeManifest.idle_frames[0].source_sha256, runtimeManifest.frames[0].source_sha256);
    assert.equal(splitManifest.dirs.right.mirrorOf, id === 'sanae' ? 'left' : null);

    const idleAtlas = PNG.sync.read(await read(`../src/assets/characters/${id}/${id}-turnaround-v1.png`));
    assert.deepEqual([idleAtlas.width, idleAtlas.height], [418, 418]);
  }

  const left = PNG.sync.read(await read('../src/assets/characters/sanae/static-v1/left/001.png'));
  const right = PNG.sync.read(await read('../src/assets/characters/sanae/static-v1/right/001.png'));
  assert.deepEqual([right.width, right.height], [left.width, left.height]);
  const mirrored = Buffer.alloc(left.data.length);
  for (let y = 0; y < left.height; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      const sourceIndex = (y * left.width + x) * 4;
      const targetIndex = (y * left.width + (left.width - x - 1)) * 4;
      left.data.copy(mirrored, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
  assert.deepEqual(Buffer.from(right.data), mirrored);
});

test('三名新角色动静帧校准台提供同画布对比与独立变换控制', async () => {
  const html = (await read('../src/ui/new-character-sprite-calibration.html')).toString('utf8');
  const script = (await read('../src/ui/new-character-sprite-calibration.ts')).toString('utf8');
  const builder = (await read('../scripts/build-ui.mjs')).toString('utf8');
  for (const id of ['youmu', 'sanae', 'patchouli']) assert.match(script, new RegExp(`${id}: \\{`));
  for (const id of ['cal-canvas', 'cal-character', 'cal-facing', 'motion-scale', 'motion-x', 'motion-y', 'idle-scale', 'idle-x', 'idle-y', 'cal-result']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(script, /drawSprite\('motion', centers\[2\]/);
  assert.match(script, /drawSprite\('idle', centers\[2\]/);
  assert.match(script, /localStorage\.setItem\(storageKey/);
  assert.match(builder, /src\/ui\/new-character-sprite-calibration\.ts/);
  assert.match(builder, /new-character-sprite-calibration\.html/);
});

test('三名新角色应用所有者校准参数与 48ms 帧速', async () => {
  const registry = await importTypescript('../src/ui/character-sprite-registry.ts');
  const sprites = registry.resolveCharacterSprites('../assets', {});
  const fit = (front, back, left, right) => ({ front, back, left, right });
  const expected = {
    youmu: {
      motion: fit(
        { scale: 1.001, x: -0.531, y: -0.793 },
        { scale: 1.006, x: -0.55, y: -0.855 },
        { scale: 0.969, x: -0.425, y: -0.82 },
        { scale: 0.973, x: -0.443, y: -0.82 },
      ),
      idle: fit(
        { scale: 0.929, x: -0.478, y: -0.79 },
        { scale: 0.948, x: -0.506, y: -0.802 },
        { scale: 0.901, x: -0.367, y: -0.758 },
        { scale: 0.887, x: -0.381, y: -0.758 },
      ),
    },
    sanae: {
      motion: fit(
        { scale: 0.932, x: -0.517, y: -0.774 },
        { scale: 0.941, x: -0.443, y: -0.811 },
        { scale: 0.918, x: -0.439, y: -0.793 },
        { scale: 0.932, x: -0.49, y: -0.786 },
      ),
      idle: fit(
        { scale: 0.943, x: -0.524, y: -0.796 },
        { scale: 0.925, x: -0.427, y: -0.802 },
        { scale: 0.915, x: -0.436, y: -0.783 },
        { scale: 0.901, x: -0.473, y: -0.765 },
      ),
    },
    patchouli: {
      motion: fit(
        { scale: 0.95, x: -0.513, y: -0.805 },
        { scale: 0.959, x: -0.55, y: -0.82 },
        { scale: 0.959, x: -0.5, y: -0.82 },
        { scale: 0.955, x: -0.466, y: -0.811 },
      ),
      idle: fit(
        { scale: 0.934, x: -0.506, y: -0.82 },
        { scale: 0.943, x: -0.534, y: -0.821 },
        { scale: 0.939, x: -0.408, y: -0.82 },
        { scale: 0.962, x: -0.427, y: -0.82 },
      ),
    },
  };

  for (const [id, transforms] of Object.entries(expected)) {
    assert.equal(sprites[id].sequence.frameDurationMs, 48);
    assert.equal(sprites[id].frameDurationMs, 48);
    assert.deepEqual(sprites[id].motionFrameTransforms, transforms.motion);
    assert.deepEqual(sprites[id].idleFrameTransforms, transforms.idle);
  }
});

test('三名新角色动画图集、GAL 原图和空 sexual 池满足登记合同', async () => {
  const manifest = JSON.parse((await read('../src/assets/asset-manifest.json')).toString('utf8'));
  for (const [id, definition] of Object.entries(characters)) {
    const animation = manifest.characters[id];
    assert.equal(animation.map_usage, true);
    assert.equal(animation.animation_sequence_frame_count, definition.frames);
    assert.equal(animation.animation_sequence_frame_duration_ms, definition.duration);
    for (const source of [animation.source_alpha, animation.animation_sequence_source_alpha]) {
      const bytes = await read(`../src/assets/${source}`);
      assert.ok(bytes.length > 10_000, source);
    }
    const runtimeManifest = JSON.parse((await read(`../src/assets/characters/${id}/sequence-runtime-v1/manifest.json`)).toString('utf8'));
    assert.equal(runtimeManifest.frame_count, definition.frames);
    assert.equal(runtimeManifest.frames.length, definition.frames * 4);

    const portrait = manifest.gal_portraits[id];
    assert.deepEqual(portrait.canvas, [1152, 1920]);
    assert.deepEqual(portrait.sexual_pose_sources, {});
    for (const [mode, reactions] of Object.entries(portrait.sources)) {
      assert.deepEqual(Object.keys(reactions), ['neutral', 'smile', 'shy', 'sad', 'angry']);
      for (const [reaction, target] of Object.entries(reactions)) {
        const runtimeBytes = await read(`../src/assets/${target}`);
        const sourceVariant = mode === 'normal' ? 'sfw' : 'nsfw';
        const sourceNames = {
          neutral: `正常 ${sourceVariant}.png`,
          smile: id === 'patchouli' && sourceVariant === 'sfw' ? '开心sfw.png' : `开心 ${sourceVariant}.png`,
          shy: id === 'youmu' && sourceVariant === 'sfw' ? "害羞 sfw'.png" : `害羞 ${sourceVariant}.png`,
          sad: `哭泣 ${sourceVariant}.png`,
          angry: `生气 ${sourceVariant}.png`,
        };
        const ownerBytes = await read(`../旧素材/素材处理/CG/${definition.source}/${sourceNames[reaction]}`);
        assert.equal(sha256(runtimeBytes), sha256(ownerBytes), `${id}/${mode}/${reaction} 原字节一致`);
        const png = PNG.sync.read(runtimeBytes);
        assert.deepEqual([png.width, png.height], [1152, 1920]);
        assert.equal(png.colorType, 6);
      }
    }
  }
});
