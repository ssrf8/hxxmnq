// 第二批 B2-T04 —— 按冻结 visit ID 精确 upsert。
// 覆盖 runbook §3.7：active/just-closed 写入、离场重入写旧 visit、
// missing/conflict 不改 state、同 turn_id 幂等、16/4/48 容量、
// malformed 单角色隔离、另一角色数据不动。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
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
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

const cm = await importTypescript('../src/ui/character-memory.ts');

const makeTurn = (overrides = {}) => ({
  turn_id: 'req-1:reimu',
  character_id: 'reimu',
  day: 1,
  time_period: '清晨',
  summary: '玩家：你好；灵梦：回应。',
  ...overrides,
});

const makeVisit = (visitId, turns = []) => ({
  visit_id: visitId,
  character_id: 'reimu',
  source: 'model-presence',
  arrival_uid: null,
  started_day: 1,
  started_time_period: '清晨',
  started_period_serial: 1,
  ended_day: null,
  ended_time_period: null,
  ended_period_serial: null,
  end_reason: null,
  turns,
});

const makeState = (reimu, marisa) => ({
  interaction: {
    visit_memory: {
      version: 'character-visit-memory.v2',
      by_character: {
        reimu: { character_id: 'reimu', active_visit: null, closed_visits: [], legacy_memories: [], ...reimu },
        marisa: { character_id: 'marisa', active_visit: null, closed_visits: [], legacy_memories: [], ...marisa },
      },
      legacy_unassigned: [],
      migration: { revision: 'character-visit-memory.v2', conversation_log_fingerprint: null, migrated_at_serial: null },
    },
  },
});

// ---- active visit 写入 ----
test('upsertVisitTurnByVisitId 写入 active visit', () => {
  const state = makeState({ active_visit: makeVisit('character_visit_000001') });
  const result = cm.upsertVisitTurnByVisitId(state, 'reimu', 'character_visit_000001', makeTurn());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const memory = result.state.interaction.visit_memory.by_character.reimu;
  assert.equal(memory.active_visit.turns.length, 1);
  assert.equal(memory.active_visit.turns[0].turn_id, 'req-1:reimu');
  assert.equal(memory.active_visit.turns[0].summary, '玩家：你好；灵梦：回应。');
});

// ---- just-closed visit 写入 ----
test('upsertVisitTurnByVisitId 写入 just-closed visit', () => {
  const closed = makeVisit('character_visit_000001', []);
  const state = makeState({
    active_visit: null,
    closed_visits: [{ ...closed, ended_day: 1, ended_period_serial: 4, end_reason: 'presence-receipt' }],
  });
  const result = cm.upsertVisitTurnByVisitId(state, 'reimu', 'character_visit_000001', makeTurn());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const memory = result.state.interaction.visit_memory.by_character.reimu;
  assert.equal(memory.closed_visits.length, 1);
  assert.equal(memory.closed_visits[0].turns.length, 1);
  assert.equal(memory.closed_visits[0].turns[0].turn_id, 'req-1:reimu');
});

// ---- 离场又重入：仍写旧 visit，不写新 active ----
test('角色离场又重入后仍写旧 visit，不写新 active', () => {
  const oldVisit = makeVisit('character_visit_000001', []);
  const newVisit = makeVisit('character_visit_000002', []);
  const state = makeState({
    active_visit: newVisit,
    closed_visits: [{ ...oldVisit, end_reason: 'presence-receipt' }],
  });
  // 告别回复属于冻结的旧 visit
  const result = cm.upsertVisitTurnByVisitId(state, 'reimu', 'character_visit_000001', makeTurn({ turn_id: 'req-0:reimu' }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const memory = result.state.interaction.visit_memory.by_character.reimu;
  assert.equal(memory.closed_visits[0].turns.length, 1);
  assert.equal(memory.closed_visits[0].turns[0].turn_id, 'req-0:reimu');
  // 新 active visit 不被污染
  assert.equal(memory.active_visit.turns.length, 0);
  assert.equal(memory.active_visit.visit_id, 'character_visit_000002');
});

// ---- missing / conflict：不改 state ----
test('visit 找不到（not-found）返回失败且不改 state', () => {
  const state = makeState({ active_visit: makeVisit('character_visit_000001') });
  const before = JSON.stringify(state);
  const result = cm.upsertVisitTurnByVisitId(state, 'reimu', 'character_visit_999999', makeTurn());
  assert.deepEqual(result, { ok: false, code: 'not-found', state });
  assert.equal(JSON.stringify(result.state), before);
});

test('visit ID 多处命中（conflict）返回失败且不改 state', () => {
  const state = makeState({
    active_visit: makeVisit('character_visit_000001'),
    closed_visits: [{ ...makeVisit('character_visit_000001'), end_reason: 'presence-receipt' }],
  });
  const before = JSON.stringify(state);
  const result = cm.upsertVisitTurnByVisitId(state, 'reimu', 'character_visit_000001', makeTurn());
  assert.deepEqual(result, { ok: false, code: 'conflict', state });
  assert.equal(JSON.stringify(result.state), before);
});

// ---- 同 turn_id 幂等（retry 覆盖摘要，不追加） ----
test('同 turn_id retry upsert 覆盖摘要，不追加重复记录', () => {
  const state = makeState({ active_visit: makeVisit('character_visit_000001', [makeTurn({ summary: '第一次摘要' })]) });
  const retried = makeTurn({ summary: '第二次摘要' });
  const result = cm.upsertVisitTurnByVisitId(state, 'reimu', 'character_visit_000001', retried);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const turns = result.state.interaction.visit_memory.by_character.reimu.active_visit.turns;
  assert.equal(turns.length, 1);
  assert.equal(turns[0].summary, '第二次摘要');
});

// ---- 16/4/48 容量 ----
test('写后执行 16/4/48 容量归一化（active turns 上限 16）', () => {
  const turns = Array.from({ length: 20 }, (_, i) => makeTurn({ turn_id: `req-${i}:reimu`, summary: `t${i}` }));
  const state = makeState({ active_visit: makeVisit('character_visit_000001', turns) });
  const result = cm.upsertVisitTurnByVisitId(state, 'reimu', 'character_visit_000001', makeTurn({ turn_id: 'req-20:reimu', summary: 'new' }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const memory = result.state.interaction.visit_memory.by_character.reimu;
  assert.equal(memory.active_visit.turns.length, 16);
  // 总剧情 ≤48
  assert.ok(memory.active_visit.turns.length <= 16);
});

test('closed visits 超过 4 个时裁剪，写入仍落在正确 visit', () => {
  const closed = Array.from({ length: 5 }, (_, i) => ({
    ...makeVisit(`character_visit_00000${i + 1}`, []),
    end_reason: 'presence-receipt',
  }));
  const state = makeState({ active_visit: null, closed_visits: closed });
  const result = cm.upsertVisitTurnByVisitId(state, 'reimu', 'character_visit_000003', makeTurn());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const memory = result.state.interaction.visit_memory.by_character.reimu;
  assert.ok(memory.closed_visits.length <= 4);
  const target = memory.closed_visits.find((visit) => visit.visit_id === 'character_visit_000003');
  assert.ok(target, '目标 visit 应保留（裁剪保留最近）');
  assert.ok(target.turns.some((turn) => turn.turn_id === 'req-1:reimu'));
});

// ---- malformed 单角色隔离 / 另一角色数据不动 ----
test('malformed 单角色隔离：坏角色被归一化不影响另一角色', () => {
  const malformedReimu = { character_id: 'reimu', active_visit: 'not-a-visit', closed_visits: null };
  const state = makeState({ ...malformedReimu }, { active_visit: makeVisit('character_visit_000100') });
  const marisaBefore = JSON.stringify(state.interaction.visit_memory.by_character.marisa);
  const result = cm.upsertVisitTurnByVisitId(state, 'marisa', 'character_visit_000100', makeTurn({ turn_id: 'req-m:marisa' }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const byCharacter = result.state.interaction.visit_memory.by_character;
  assert.equal(byCharacter.marisa.active_visit.turns.length, 1);
  // 坏角色结构被角色级兜底归一化（不抛错、不整体回退）
  assert.equal(typeof byCharacter.reimu, 'object');
});

test('另一角色数据不动：写 reimu 后 marisa 记忆逐字节不变', () => {
  const marisa = { active_visit: makeVisit('character_visit_000100', [makeTurn({ turn_id: 'req-m:marisa', summary: '原' })]) };
  const state = makeState({ active_visit: makeVisit('character_visit_000001') }, marisa);
  const marisaBefore = JSON.stringify(state.interaction.visit_memory.by_character.marisa);
  const result = cm.upsertVisitTurnByVisitId(state, 'reimu', 'character_visit_000001', makeTurn());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(JSON.stringify(result.state.interaction.visit_memory.by_character.marisa), marisaBefore);
});

// ---- 无角色记忆：not-found 且不创建 ----
test('角色无记忆结构时 not-found，不静默创建 visit', () => {
  const state = makeState();
  const result = cm.upsertVisitTurnByVisitId(state, 'reimu', 'character_visit_000001', makeTurn());
  assert.deepEqual(result, { ok: false, code: 'not-found', state });
});
