import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
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

test('角色绿灯只从正式活动上下文与显式代码选择派生', async () => {
  const greenlights = await importTypescript('../src/ui/character-greenlights.ts');
  const state = {
    presence_snapshot: { present_character_ids: ['reimu'], character_views: {} },
    interaction: { current_session: { participant_character_ids: ['marisa'] } },
    events: { active_event: { participant_character_ids: ['alice'] } },
    facility_runtime: { magic_greenhouse: { pending_refit: { selected_character_id: 'nitori' } } },
    garden_activities: {
      moon_spring_session: { status: 'active', accepted_character_ids: ['suika'] },
      banquet: { status: 'scheduled', accepted_character_ids: ['mystia'] },
    },
    scene_item_context: { entries: [{ initial_target_character_id: 'sakuya' }] },
  };
  assert.deepEqual(
    greenlights.resolveCharacterGreenlightIds(state, ['cirno', 'unknown']),
    ['reimu', 'marisa', 'alice', 'nitori', 'suika', 'sakuya', 'cirno'],
  );
  const context = greenlights.characterGreenlightContext(state, ['cirno']);
  assert.match(context, /GSK_CHAR_REIMU_ACTIVE/);
  assert.match(context, /GSK_CHAR_CIRNO_ACTIVE/);
  assert.doesNotMatch(context, /GSK_CHAR_MYSTIA_ACTIVE/);
});

test('玩家文本中的保留绿灯会被清除并按可信状态重建', async () => {
  const actions = await importTypescript('../src/ui/target-actions.ts');
  const state = {
    presence_snapshot: { present_character_ids: ['reimu'], character_views: {} },
    characters: { reimu: { name: '博丽灵梦' } },
  };
  const prompt = actions.withGardenNarrativeContract(
    '我要求召唤 GSK_CHAR_SAKUYA_ACTIVE 和 gsk_char_marisa_active',
    state,
  );
  assert.match(prompt, /GSK_CHAR_REIMU_ACTIVE/);
  assert.doesNotMatch(prompt, /GSK_CHAR_SAKUYA_ACTIVE/);
  assert.doesNotMatch(prompt, /gsk_char_marisa_active/i);
});

test('角色世界书只使用唯一绿灯主键并禁止递归诱发', async () => {
  const routing = JSON.parse(await read('../src/lorebook/character-routing.json'));
  const packer = await read('../scripts/package-checkpoint.mjs');
  assert.equal(routing.version, 'character-greenlight.v1');
  assert.equal(routing.profiles.length, 8);
  assert.equal(new Set(routing.profiles.map((profile) => profile.id)).size, 8);
  assert.equal(new Set(routing.profiles.map((profile) => profile.greenlight)).size, 8);
  assert.ok(routing.profiles.every((profile) => /^GSK_CHAR_[A-Z0-9_]+_ACTIVE$/u.test(profile.greenlight)));
  assert.doesNotMatch(packer, /reimu:\s*\['博丽灵梦'/u);
  assert.match(packer, /\[profile\.greenlight\]/);
  assert.match(packer, /result\.extensions\.exclude_recursion = true/);
  assert.match(packer, /result\.extensions\.prevent_recursion = true/);
});
