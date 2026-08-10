import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

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

const initialState = async () => JSON.parse(await readFile(
  new URL('../src/schema/initial-state.json', import.meta.url),
  'utf8',
));

test('测试入场和离场同步持久化 visit 生命周期', async () => {
  const tools = await importTypescript('../src/ui/test-tools.ts');
  const initial = tools.applyTestJump(
    tools.applyTestJump(await initialState(), 'presence_clear'),
    'presence_reimu',
  );
  const oldVisitId = initial.interaction.visit_memory.by_character.reimu.active_visit.visit_id;

  const absent = tools.applyTestJump(initial, 'presence_clear');
  assert.equal(absent.interaction.visit_memory.by_character.reimu.active_visit, null);
  assert.equal(absent.interaction.visit_memory.by_character.reimu.closed_visits.at(-1).visit_id, oldVisitId);

  const returned = tools.applyTestJump(absent, 'presence_reimu');
  assert.notEqual(returned.interaction.visit_memory.by_character.reimu.active_visit.visit_id, oldVisitId);
});

test('两名角色同轮各写自己的冻结父级 visit', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const commits = await importTypescript('../src/ui/visit-turn-commit.ts');
  const tools = await importTypescript('../src/ui/test-tools.ts');
  let local = tools.applyTestJump(
    tools.applyTestJump(await initialState(), 'presence_clear'),
    'presence_reimu',
  );
  local = tools.applyTestJump(local, 'presence_marisa');
  const reimuVisit = local.interaction.visit_memory.by_character.reimu.active_visit.visit_id;
  const marisaVisit = local.interaction.visit_memory.by_character.marisa.active_visit.visit_id;

  const staleModel = structuredClone(local);
  staleModel.interaction.visit_memory.by_character.reimu.active_visit = null;
  staleModel.interaction.visit_memory.by_character.marisa.active_visit = null;
  let restored = settlement.restoreLocalEventOwnership(local, staleModel);
  assert.equal(restored.interaction.visit_memory.by_character.reimu.active_visit.visit_id, reimuVisit);
  assert.equal(restored.interaction.visit_memory.by_character.marisa.active_visit.visit_id, marisaVisit);
  restored.interaction.visit_summary_task = {
    schema: 'visit-summary-task.v1', request_id: 'multi-turn',
    slots: [
      { character_id: 'reimu', summary: '灵梦与玩家在庭园里打了招呼。' },
      { character_id: 'marisa', summary: '魔理沙与玩家在庭园里打了招呼。' },
    ],
  };

  const result = commits.applyVisitTurnsToFinalState({
    finalState: restored,
    request: {
      requestId: 'multi-turn', sceneId: 'scene:test', visibleUserText: '一起聊聊',
      relevantCharacterIds: ['reimu', 'marisa'],
      visitIdsByCharacter: { reimu: reimuVisit, marisa: marisaVisit },
    },
    attempt: { attemptId: 'a1', commitKey: 'c1', assistantMessageId: 2, assistantSwipeId: 0 },
    clock: { day: 1, time_period: '清晨', period_serial: 0 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.interaction.visit_memory.by_character.reimu.active_visit.turns.at(-1).turn_id, 'multi-turn:reimu');
  assert.equal(result.state.interaction.visit_memory.by_character.marisa.active_visit.turns.at(-1).turn_id, 'multi-turn:marisa');
});

test('角色生成期间离场，仍写入冻结的旧 visit', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const commits = await importTypescript('../src/ui/visit-turn-commit.ts');
  const tools = await importTypescript('../src/ui/test-tools.ts');
  const local = tools.applyTestJump(
    tools.applyTestJump(await initialState(), 'presence_clear'),
    'presence_reimu',
  );
  const reimuVisit = local.interaction.visit_memory.by_character.reimu.active_visit.visit_id;
  const staleModel = structuredClone(local);
  const departed = tools.applyTestJump(local, 'presence_clear');
  const restored = settlement.restoreLocalEventOwnership(departed, staleModel);
  assert.equal(restored.interaction.visit_memory.by_character.reimu.active_visit, null);
  assert.equal(restored.interaction.visit_memory.by_character.reimu.closed_visits.at(-1).visit_id, reimuVisit);
  restored.interaction.visit_summary_task = {
    schema: 'visit-summary-task.v1', request_id: 'leave-turn',
    slots: [{ character_id: 'reimu', summary: '灵梦向玩家告别后离开了庭园。' }],
  };

  const result = commits.applyVisitTurnsToFinalState({
    finalState: restored,
    request: {
      requestId: 'leave-turn', sceneId: 'scene:test', visibleUserText: '回头见',
      relevantCharacterIds: ['reimu'], visitIdsByCharacter: { reimu: reimuVisit },
    },
    attempt: { attemptId: 'a2', commitKey: 'c2', assistantMessageId: 4, assistantSwipeId: 0 },
    clock: { day: 1, time_period: '清晨', period_serial: 0 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.interaction.visit_memory.by_character.reimu.closed_visits.at(-1).turns.at(-1).turn_id, 'leave-turn:reimu');
});
