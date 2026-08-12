// B2-T08-R2：场景道具预览的事务语义（外援强制裁定 5）。
// 验证 queueSceneItemUse 作为只读预览派生函数的纯函数性、幂等性，
// 以及道具预览不改变 relevant IDs / visit map / history memory 内容。
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
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

const baseState = async (withItem = false) => {
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const raw = JSON.parse(await read('../src/schema/initial-state.json'));
  const state = migration.migrateGardenState(raw);
  if (withItem) {
    // 给测试注入道具数量（道具目录 consume_policy: on_commit；预览只 reserve 内存态）
    state.inventory = { ...state.inventory, consumables: { ...state.inventory.consumables, reimu_coin_bait: 3 } };
  }
  return state;
};

// ---- 幂等：相同 useId 返回等价状态，不重复扣数量 ----
test('R2：相同 useId 幂等（第二次调用不重复 reserve，scene context 不翻倍）', async () => {
  const ar = await importTypescript('../src/ui/activity-rules.ts');
  const base = await baseState(true);
  const state = ar.queueSceneItemUse(base, 'reimu_coin_bait', 'scene-item:reimu_coin_bait:abc', 'scene:s1', 'reimu');

  // 数量被扣 1 且只扣 1 次
  const afterOne = state.inventory.consumables.reimu_coin_bait;
  const twice = ar.queueSceneItemUse(state, 'reimu_coin_bait', 'scene-item:reimu_coin_bait:abc', 'scene:s1', 'reimu');
  const afterTwo = twice.inventory.consumables.reimu_coin_bait;
  assert.equal(afterOne - afterTwo, 0, '相同 useId 不得重复扣数量');
  const entries = twice.scene_item_context.entries.filter((entry) => entry.item_id === 'reimu_coin_bait');
  assert.equal(entries.length, 1, '相同 useId 不得重复新增条目');
  assert.deepEqual(entries[0].use_ids, ['scene-item:reimu_coin_bait:abc']);
  assert.equal(entries[0].quantity_used, 1);
});

test('R2：同一 useId 已扣到零后仍可幂等复读，不会误报数量不足', async () => {
  const ar = await importTypescript('../src/ui/activity-rules.ts');
  const base = await baseState(true);
  base.inventory.consumables.reimu_coin_bait = 1;
  const once = ar.queueSceneItemUse(base, 'reimu_coin_bait', 'scene-item:reimu_coin_bait:last', 'scene:last', 'reimu');
  assert.equal(once.inventory.consumables.reimu_coin_bait, 0);
  const replayed = ar.queueSceneItemUse(once, 'reimu_coin_bait', 'scene-item:reimu_coin_bait:last', 'scene:last', 'reimu');
  assert.equal(replayed.inventory.consumables.reimu_coin_bait, 0);
  assert.equal(replayed.scene_item_context.entries[0].quantity_used, 1);
});

// ---- 纯函数：不修改传入 state ----
test('R2：queueSceneItemUse 是纯函数，preview 不改变传入 state', async () => {
  const ar = await importTypescript('../src/ui/activity-rules.ts');
  const base = await baseState(true);
  const snapshot = structuredClone(base);
  const result = ar.queueSceneItemUse(base, 'reimu_coin_bait', 'scene-item:reimu_coin_bait:xyz', 'scene:s2', 'reimu');
  assert.deepEqual(base, snapshot, '传入 state 不得被修改');
  assert.notEqual(result, base, '应返回新对象');
  // 原 state 的道具数量与 scene context 不变
  assert.equal(base.inventory.consumables.reimu_coin_bait, snapshot.inventory.consumables.reimu_coin_bait);
  assert.equal(base.scene_item_context?.entries?.length ?? 0, snapshot.scene_item_context?.entries?.length ?? 0);
});

// ---- 道具预览不改变 relevant IDs / visit map / history memory ----
test('R2：预览只改 scene_item_context，不改 visit memory（history 语义不变）', async () => {
  const ar = await importTypescript('../src/ui/activity-rules.ts');
  const cm = await importTypescript('../src/ui/character-memory.ts');
  const base = await baseState(true);
  const promptState = ar.queueSceneItemUse(base, 'reimu_coin_bait', 'scene-item:reimu_coin_bait:uvw', 'scene:s3', 'reimu');

  // 冻结 visit map：before 与 promptState 必须一致（R2 步骤 5：history 的 visit memory 相同）
  const characterIds = ['reimu', 'marisa'];
  const beforeVisits = cm.freezeVisitIds(base, characterIds);
  const previewVisits = cm.freezeVisitIds(promptState, characterIds);
  assert.deepEqual(previewVisits, beforeVisits, '道具预览不得改变 visit map');

  // 合成历史内容一致（道具预览不改 history memory 内容）
  const sh = await importTypescript('../src/ui/synthetic-history.ts');
  const names = { reimu: '博丽灵梦', marisa: '雾雨魔理沙' };
  const beforeHistory = sh.buildSyntheticHistory({ state: base, relevantCharacterIds: characterIds, visitIdsByCharacter: beforeVisits, characterNames: names });
  const previewHistory = sh.buildSyntheticHistory({ state: promptState, relevantCharacterIds: characterIds, visitIdsByCharacter: previewVisits, characterNames: names });
  assert.equal(previewHistory.content, beforeHistory.content, '道具预览不得改变 history memory 内容');
  // 注入文本（withGardenNarrativeContract）确实包含本轮道具授权
  const target = await importTypescript('../src/ui/target-actions.ts');
  const injectedPreview = target.withGardenNarrativeContract('使用道具', promptState, ['reimu']);
  const injectedBefore = target.withGardenNarrativeContract('使用道具', base, ['reimu']);
  assert.match(injectedPreview, /本轮道具授权：已登记/);
  assert.match(injectedPreview, /reimu_coin_bait/);
  assert.match(injectedBefore, /本轮道具授权：无/);
});
