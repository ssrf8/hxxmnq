// B2-T10：VisitTurn 精确 assistant 楼层结算（runbook 冻结顺序 5-8）。
// 验证纯函数 applyVisitTurnsToFinalState：
//   - 只用冻结 visit map（不猜 active visit）；
//   - visitId null 角色跳过；
//   - missing/conflict 失败（调用方保持 settlement pending）；
//   - 同 turn_id retry upsert 覆盖不追加；
//   - 精确写同一 visit（active/closed 判定由 T04 负责）。
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

const baseState = async () => {
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const raw = JSON.parse(await read('../src/schema/initial-state.json'));
  const state = migration.migrateGardenState(raw);
  state.environment = { ...state.environment, day: 7, time_period: '午后' };
  // 给 reimu 一个 active visit（T04 upsert 的目标）
  state.interaction ??= {};
  state.interaction.visit_memory ??= { by_character: {} };
  state.interaction.visit_memory.by_character.reimu = {
    source: 'active_visit',
    active_visit: {
      visit_id: 'character_visit_000001',
      character_id: 'reimu',
      source: 'active_visit',
      arrival_uid: 'arrive:reimu:1',
      started_day: 7,
      started_time_period: '清晨',
      started_period_serial: 1,
      ended_day: null,
      ended_time_period: null,
      ended_period_serial: null,
      turns: [],
      summary_events: [],
      event_serial: 0,
      related_relationships: [],
    },
    closed_visits: [],
    relationship_memories: [],
    legacy_memory: null,
    memory_epoch: 0,
  };
  return state;
};

const makeInput = (overrides = {}) => ({
  finalState: undefined, // 由测试注入
  request: {
    requestId: 'gal-req-100',
    sceneId: 'scene:garden',
    relevantCharacterIds: ['reimu', 'marisa'],
    visitIdsByCharacter: { reimu: 'character_visit_000001', marisa: null },
    visibleUserText: '我来拜访。',
  },
  attempt: {
    attemptId: 'attempt-1',
    commitKey: 'commit-1',
    assistantMessageId: 42,
    assistantSwipeId: null,
  },
  clock: { day: 7, time_period: '午后', period_serial: 4 },
  acceptedOutput: [
    '【庭园正文开始】',
    '<dialogue char="reimu">欢迎。</dialogue>',
    '【庭园正文结束】',
  ].join('\n'),
  characterNames: { reimu: '博丽灵梦', marisa: '雾雨魔理沙' },
  ...overrides,
});

// ---- 精确写入冻结 visit ----
test('T10：V2 冻结 visit map 精确写入（reimu 写 active visit；marisa null 跳过）', async () => {
  const vtc = await importTypescript('../src/ui/visit-turn-commit.ts');
  const state = await baseState();
  const result = vtc.applyVisitTurnsToFinalState(makeInput({ finalState: state }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.turns.length, 1);
  const memory = result.state.interaction.visit_memory.by_character.reimu;
  assert.equal(memory.active_visit.visit_id, 'character_visit_000001');
  assert.equal(memory.active_visit.turns.length, 1);
  const turn = memory.active_visit.turns[0];
  assert.equal(turn.turn_id, 'gal-req-100:reimu');
  assert.equal(turn.request_id, 'gal-req-100');
  assert.equal(turn.character_id, 'reimu');
  assert.equal(turn.assistant_message_id, 42);
  assert.equal(turn.day, 7);
  assert.match(turn.summary, /博丽灵梦/);
  // marisa（null visit）不得产生任何 turn（初始空记录保持无 turn）
  const marisaTurns = result.state.interaction.visit_memory.by_character.marisa?.active_visit?.turns ?? [];
  assert.equal(marisaTurns.length, 0);
  assert.ok(!result.turns.some((turn) => turn.character_id === 'marisa'));
});

// ---- 同 turn_id retry：upsert 覆盖，不追加 ----
test('T10：同 turn_id 重试 upsert 覆盖审计字段，不追加重复记录', async () => {
  const vtc = await importTypescript('../src/ui/visit-turn-commit.ts');
  const state = await baseState();
  const first = vtc.applyVisitTurnsToFinalState(makeInput({ finalState: state }));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const retried = vtc.applyVisitTurnsToFinalState(makeInput({
    finalState: first.state,
    attempt: { attemptId: 'attempt-2', commitKey: 'commit-2', assistantMessageId: 42, assistantSwipeId: null },
  }));
  assert.equal(retried.ok, true);
  if (!retried.ok) return;
  const turns = retried.state.interaction.visit_memory.by_character.reimu.active_visit.turns;
  assert.equal(turns.length, 1, '同 turn_id 不得追加重复记录');
  assert.equal(turns[0].latest_attempt_id, 'attempt-2');
  assert.equal(turns[0].latest_commit_key, 'commit-2');
});

// ---- 精确写 closed visit（生成期间离场）----
test('T10：visit 已进 closed_visits 仍精确写入该 visit，不写新 visit', async () => {
  const vtc = await importTypescript('../src/ui/visit-turn-commit.ts');
  const state = await baseState();
  // 角色离场：active_visit 清空，原 visit 移入 closed
  const memory = state.interaction.visit_memory.by_character.reimu;
  memory.closed_visits = [{
    visit_id: 'character_visit_000001',
    character_id: 'reimu',
    source: 'closed_visit',
    arrival_uid: 'arrive:reimu:1',
    started_day: 7,
    started_time_period: '清晨',
    started_period_serial: 1,
    ended_day: 7,
    ended_time_period: '正午',
    ended_period_serial: 3,
    turns: [],
    summary_events: [],
    event_serial: 0,
    related_relationships: [],
  }];
  delete memory.active_visit;
  const result = vtc.applyVisitTurnsToFinalState(makeInput({ finalState: state }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const closed = result.state.interaction.visit_memory.by_character.reimu.closed_visits;
  assert.equal(closed.length, 1);
  assert.equal(closed[0].visit_id, 'character_visit_000001');
  assert.equal(closed[0].turns.length, 1);
  assert.equal(closed[0].turns[0].turn_id, 'gal-req-100:reimu');
});

// ---- missing visit：失败（保持 settlement pending）----
test('T10：冻结 visit 找不到 → ok:false（调用方保持 settlement pending）', async () => {
  const vtc = await importTypescript('../src/ui/visit-turn-commit.ts');
  const state = await baseState();
  const result = vtc.applyVisitTurnsToFinalState(makeInput({
    finalState: state,
    request: {
      requestId: 'gal-req-100',
      sceneId: 'scene:garden',
      relevantCharacterIds: ['reimu'],
      visitIdsByCharacter: { reimu: 'character_visit_999999' },
      visibleUserText: '我来拜访。',
    },
  }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'not-found');
  assert.equal(result.state, state, '失败不得修改 state');
});

// ---- malformed output：失败（不写邻近楼层）----
test('T10：无正文标签（malformed-output）→ ok:false，不写任何 turn', async () => {
  const vtc = await importTypescript('../src/ui/visit-turn-commit.ts');
  const state = await baseState();
  const result = vtc.applyVisitTurnsToFinalState(makeInput({
    finalState: state,
    acceptedOutput: '（只有系统提示，无正文标签）',
  }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'malformed-output');
  const turns = result.state.interaction.visit_memory.by_character.reimu.active_visit?.turns ?? [];
  assert.equal(turns.length, 0);
});

// ---- V1/无 request：bridge 侧保留原 state，并返回空 expected-turn 集合 ----
test('T10：bridge 接线对非 V2 request 保留原 state（V1 兼容路径不写 turn）', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(
    bridge,
    /if \(request\?\.schema !== REQUEST_SCHEMA_V2\) return \{ state: finalState, turns: \[\] \};/,
  );
});
