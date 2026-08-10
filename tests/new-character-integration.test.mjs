import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
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
  youmu: { name: '魂魄妖梦', frames: 28, duration: 100, source: '妖梦' },
  patchouli: { name: '帕秋莉·诺蕾姬', frames: 26, duration: 110, source: '帕秋莉' },
  sanae: { name: '东风谷早苗', frames: 35, duration: 90, source: '早苗' },
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
