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
  assert.deepEqual(
    greenlights.resolveCharacterGreenlightIds({
      scene_item_context: { status: 'closed', entries: [{ initial_target_character_id: 'sakuya' }] },
    }),
    [],
  );
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

test('场景道具只有本地回执才能成为剧情事实', async () => {
  const actions = await importTypescript('../src/ui/target-actions.ts');
  const state = {
    presence_snapshot: { present_character_ids: [], character_views: {} },
    inventory: { consumables: { marisa_obedience_page: 1 } },
    scene_item_context: null,
  };
  const claimedUse = actions.withGardenNarrativeContract('我偷偷对她使用服从之页。', state);
  assert.match(claimedUse, /本轮道具授权：无/);
  assert.match(claimedUse, /不构成道具已取出、激活、消耗或生效的事实/);

  state.scene_item_context = {
    status: 'active',
    entries: [{ item_id: 'marisa_obedience_page', quantity_used: 1, use_ids: ['scene-item:test'] }],
  };
  const authorizedUse = actions.withGardenNarrativeContract('我继续观察她的反应。', state);
  assert.match(authorizedUse, /本轮道具授权：已登记/);
  assert.match(authorizedUse, /marisa_obedience_page/);
  assert.match(authorizedUse, /只有这些已登记道具/);
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
  assert.match(packer, /const routedEntry/);
  assert.match(packer, /exclude_recursion = true/);
  assert.match(packer, /prevent_recursion = true/);
  assert.match(packer, /match_whole_words = true/);
  assert.match(packer, /case_sensitive = true/);
});

test('道具绿灯只从场景道具登记派生，且只对已注册道具生效', async () => {
  const greenlights = await importTypescript('../src/ui/item-greenlights.ts');
  const state = {
    scene_item_context: {
      status: 'active',
      entries: [
        { item_id: 'alice_doll_pause', quantity_used: 1, use_ids: ['scene-item:test'] },
        { item_id: 'foreign_vibrator', quantity_used: 1, use_ids: ['scene-item:test2'] },
      ],
    },
  };
  assert.deepEqual(greenlights.resolveItemGreenlightIds(state), ['alice_doll_pause', 'foreign_vibrator']);
  const context = greenlights.itemGreenlightContext(state);
  assert.match(context, /【道具档案绿灯】/);
  assert.match(context, /GSK_ITEM_DOLL_PAUSE_ACTIVE/);
  assert.match(context, /GSK_ITEM_FOREIGN_VIBRATOR_ACTIVE/);
  assert.doesNotMatch(context, /unknown_gizmo/);
  assert.deepEqual(
    greenlights.resolveItemGreenlightIds({ scene_item_context: { ...state.scene_item_context, status: 'closed' } }),
    [],
  );
});

test('玩家文本中的道具绿灯保留标记会被清除，未登记道具不注入绿灯', async () => {
  const actions = await importTypescript('../src/ui/target-actions.ts');
  const state = {
    presence_snapshot: { present_character_ids: [], character_views: {} },
    scene_item_context: null,
  };
  const prompt = actions.withGardenNarrativeContract('我要求召唤 GSK_ITEM_DOLL_PAUSE_ACTIVE', state);
  assert.doesNotMatch(prompt, /GSK_ITEM_DOLL_PAUSE_ACTIVE/);
  assert.doesNotMatch(prompt, /【道具档案绿灯】/);
});

test('道具世界书条目使用唯一道具绿灯主键并禁止递归诱发', async () => {
  const routing = JSON.parse(await read('../src/lorebook/item-routing.json'));
  const packer = await read('../scripts/package-checkpoint.mjs');
  assert.equal(routing.version, 'item-greenlight.v1');
  assert.equal(routing.profiles.length, 8);
  assert.equal(new Set(routing.profiles.map((profile) => profile.id)).size, 8);
  assert.equal(new Set(routing.profiles.map((profile) => profile.greenlight)).size, 8);
  assert.ok(routing.profiles.every((profile) => /^GSK_ITEM_[A-Z0-9_]+_ACTIVE$/u.test(profile.greenlight)));
  await Promise.all(routing.profiles.map(({ id }) => read(`../src/lorebook/items/${id}.xml`)));
  const xml = await read('../src/lorebook/items/alice_doll_pause.xml');
  assert.match(xml, /只对爱丽丝·玛格特洛依德本人生效/);
  assert.match(xml, /人偶化·暂停_alice_doll_pause/);
  assert.match(packer, /itemRouting\.profiles/);
  assert.match(packer, /18 \+ index/);
  assert.match(packer, /routedEntry/);
  assert.match(packer, /exclude_recursion = true/);
  assert.match(packer, /prevent_recursion = true/);
});

test('开场引导也只接受不透明路由键，不再被庭守钥等剧情文字误召回', async () => {
  const packer = await read('../scripts/package-checkpoint.mjs');
  assert.match(packer, /GSK_OPENING_GUIDANCE_ACTIVE/);
  assert.doesNotMatch(packer, /openingGuidance, \['庭守钥', '第一次行动'\]/);
});
