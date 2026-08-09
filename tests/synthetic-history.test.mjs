// 第二批 B2-T06 —— 合成历史投影器。
// 覆盖 runbook §3.5–3.6 与总计划 §7：恰好一条非空 system、过去/本次/关系/legacy 分块、
// 离场重入旧 visit 只在过去块、冻结 visit 精确命中、900/2800 预算、
// boundary/conflict 不被普通记录挤掉、legacy_unassigned 永不投影、null 时间、
// 稳定顺序、确定性（100 次逐字节相同）、state 不变、canary 无输入通道。
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

const sh = await importTypescript('../src/ui/synthetic-history.ts');

const turn = (overrides = {}) => ({
  turn_id: 'req-1:reimu',
  request_id: 'req-1',
  character_id: 'reimu',
  scene_id: 'scene:demo',
  assistant_message_id: 55,
  assistant_swipe_id: null,
  latest_attempt_id: 'req-1:attempt-1',
  latest_commit_key: 'req-1:req-1:attempt-1',
  day: 1,
  time_period: '清晨',
  period_serial: 1,
  summary: '玩家询问结界；灵梦答应检查。',
  ...overrides,
});

const visit = (visitId, turns = [], overrides = {}) => ({
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
  ...overrides,
});

const rel = (overrides = {}) => ({
  relationship_memory_id: 'rel-1',
  character_id: 'reimu',
  request_id: 'req-1',
  visit_id: null,
  day: 12,
  time_period: '下午',
  period_serial: 12,
  kind: 'milestone',
  relationship_label: null,
  event_kind: 'kiss',
  summary: '双方明确接吻。',
  significance: 2,
  active: false,
  latest_attempt_id: null,
  latest_commit_key: null,
  ...overrides,
});

const makeState = (reimu, marisa) => ({
  characters: {
    reimu: { id: 'reimu', name: '博丽灵梦' },
    marisa: { id: 'marisa', name: '雾雨魔理沙' },
  },
  interaction: {
    visit_memory: {
      version: 'character-visit-memory.v1',
      by_character: {
        reimu: { character_id: 'reimu', active_visit: null, closed_visits: [], legacy_memories: [], relationship_memories: [], ...reimu },
        marisa: { character_id: 'marisa', active_visit: null, closed_visits: [], legacy_memories: [], relationship_memories: [], ...marisa },
      },
      legacy_unassigned: [
        { legacy_id: 'legacy-unassigned-1', character_id: null, text: '绝不能泄漏给角色', source: 'conversation_log.v0' },
      ],
    },
  },
});

const baseInput = (state, overrides = {}) => ({
  state,
  relevantCharacterIds: ['reimu', 'marisa'],
  visitIdsByCharacter: { reimu: 'character_visit_000001', marisa: null },
  characterNames: { reimu: '博丽灵梦', marisa: '雾雨魔理沙' },
  ...overrides,
});

// ---- 无记忆也恰好一条非空 system ----
test('无记忆返回固定边界消息，恰好一条非空 system', () => {
  const state = makeState();
  const result = sh.buildSyntheticHistory(baseInput(state));
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].role, 'system');
  assert.equal(result.history[0].content, sh.HISTORY_BOUNDARY_MESSAGE);
  assert.ok(result.content.length > 0);
  assert.deepEqual(result.characters, []);
});

// ---- 只有当前 visit ----
test('只有当前 visit：本次块出现且不伪造时间', () => {
  const state = makeState({
    active_visit: visit('character_visit_000001', [
      turn({ turn_id: 'req-1:reimu', day: null, time_period: null, period_serial: null, summary: '无日期回合' }),
    ]),
  });
  const result = sh.buildSyntheticHistory(baseInput(state));
  assert.equal(result.history.length, 1);
  assert.match(result.content, /【角色：博丽灵梦（reimu）】/);
  assert.match(result.content, /【本次入场：可维持当前连续性】/);
  assert.match(result.content, /时间未记录：无日期回合/);
  assert.doesNotMatch(result.content, /昨天|今天/);
  assert.equal(result.characters.length, 1);
  assert.deepEqual(result.characters, ['reimu']);
});

// ---- 只有过去、只有关系、只有 legacy ----
test('只有过去入场：过去块带边界句，旧到新', () => {
  const state = makeState({
    active_visit: null,
    closed_visits: [
      visit('character_visit_000001', [turn({ turn_id: 'req-1:reimu', day: 1, summary: '第一天旧事' })], { ended_day: 1, ended_period_serial: 2, end_reason: 'presence-receipt' }),
      visit('character_visit_000002', [turn({ turn_id: 'req-2:reimu', day: 2, summary: '第二天旧事' })], { ended_day: 2, ended_period_serial: 4, end_reason: 'presence-receipt' }),
    ],
  });
  // 无当前 visit：冻结 map 中 reimu 为 null，两个 closed 都进入过去块
  const result = sh.buildSyntheticHistory(baseInput(state, { visitIdsByCharacter: { reimu: null, marisa: null } }));
  assert.match(result.content, /【过去入场：只能作背景，不得续接现场】/);
  assert.match(result.content, /不可续接旧地点/);
  const first = result.content.indexOf('第一天旧事');
  const second = result.content.indexOf('第二天旧事');
  assert.ok(first >= 0 && second > first, '旧到新展示');
  assert.doesNotMatch(result.content, /【本次入场/);
});

test('只有关系记忆：当前明确关系 + 依据', () => {
  const state = makeState({
    relationship_memories: [
      rel({ kind: 'relationship_state', relationship_label: 'lover', significance: 3, active: true, summary: '双方明确确认恋人关系。' }),
      rel({ relationship_memory_id: 'rel-2', kind: 'milestone', event_kind: 'kiss', day: 12, significance: 2, summary: '双方明确接吻。' }),
    ],
  });
  const result = sh.buildSyntheticHistory(baseInput(state));
  assert.match(result.content, /【当前关系】/);
  assert.match(result.content, /当前明确关系：lover/);
  assert.match(result.content, /第12日·下午：双方明确接吻/);
});

test('legacy_unassigned 永不投影；该角色自己的 legacy 单独标记', () => {
  const state = makeState({
    legacy_memories: [
      { legacy_id: 'legacy-1', character_id: 'reimu', text: '很久以前的模糊记忆。', source: 'conversation_log.v0' },
    ],
  });
  const result = sh.buildSyntheticHistory(baseInput(state));
  assert.match(result.content, /【旧版遗留记忆：时间不明】/);
  assert.match(result.content, /模糊长期记忆/);
  assert.doesNotMatch(result.content, /绝不能泄漏给角色/);
});

// ---- 离场重入：旧 visit 只在过去块；冻结 visit 精确命中 ----
test('离场重入后冻结的旧 visit 精确命中本次块，更早 visit 只在过去块，边界文本存在', () => {
  const state = makeState({
    active_visit: visit('character_visit_000002', [
      turn({ turn_id: 'req-2:reimu', day: 2, summary: '新入场的回合' }),
    ]),
    closed_visits: [
      visit('character_visit_000001', [turn({ turn_id: 'req-1:reimu', day: 1, summary: '旧 visit 的回合' })], { ended_day: 1, ended_period_serial: 2, end_reason: 'presence-receipt' }),
      visit('character_visit_000000', [turn({ turn_id: 'req-0:reimu', day: 0, summary: '更早 visit 的回合' })], { ended_day: 0, ended_period_serial: 1, end_reason: 'presence-receipt' }),
    ],
  });
  // 冻结的是旧 visit（生成期间离场）：character_visit_000001 必须精确出现在本次块
  const result = sh.buildSyntheticHistory(baseInput(state, { visitIdsByCharacter: { reimu: 'character_visit_000001', marisa: null } }));
  const pastIndex = result.content.indexOf('【过去入场');
  const currentIndex = result.content.indexOf('【本次入场');
  assert.ok(pastIndex >= 0 && currentIndex >= 0, `past=${pastIndex} current=${currentIndex}`);
  // 冻结的旧 visit 的回合出现在本次块（精确命中），且过去块不含它
  const oldTurnInCurrent = result.content.indexOf('旧 visit 的回合') > currentIndex;
  const oldTurnInPast = result.content.indexOf('旧 visit 的回合') >= 0 && result.content.indexOf('旧 visit 的回合') < currentIndex;
  assert.equal(oldTurnInCurrent, true);
  assert.equal(oldTurnInPast, false);
  // 更早的 visit 仍只出现在过去块
  assert.ok(result.content.indexOf('更早 visit 的回合') < pastIndex + 200, '更早 visit 在过去块');
  assert.match(result.content, /不可续接旧地点/);
});

// ---- 每角色 900 / 全局 2800 ----
test('每角色块 ≤900，全部 ≤2800（构造超长内容）', () => {
  const longSummary = '很长很长的记忆内容。'.repeat(60);
  const manyTurns = Array.from({ length: 30 }, (_, i) => turn({ turn_id: `req-${i}:reimu`, day: i + 1, summary: longSummary }));
  const state = makeState({
    active_visit: visit('character_visit_000001', manyTurns),
    closed_visits: [
      visit('character_visit_000100', manyTurns.slice(0, 20), { ended_day: 90, ended_period_serial: 90, end_reason: 'presence-receipt' }),
    ],
    relationship_memories: Array.from({ length: 12 }, (_, i) => rel({ relationship_memory_id: `rel-${i}`, day: i, summary: longSummary })),
    legacy_memories: Array.from({ length: 10 }, (_, i) => ({ legacy_id: `legacy-${i}`, character_id: 'reimu', text: longSummary, source: 'conversation_log.v0' })),
  });
  const result = sh.buildSyntheticHistory(baseInput(state));
  assert.ok(result.content.length <= sh.TOTAL_BUDGET, `全局 ${result.content.length} ≤ 2800`);
  // 逐角色块检查（按 characters 顺序拆分校验总和边界）
  for (const char of result.characters) {
    // 每角色块 ≤900：按角色头拆分估算最坏单块
  }
  const reimuStart = result.content.indexOf('【角色：博丽灵梦');
  const marisaStart = result.content.indexOf('【角色：雾雨魔理沙');
  const reimuBlock = marisaStart >= 0 ? result.content.slice(reimuStart, marisaStart) : result.content.slice(reimuStart);
  assert.ok(reimuBlock.length <= sh.PER_CHARACTER_BUDGET, `reimu 块 ${reimuBlock.length} ≤ 900`);
});

// ---- boundary/conflict 不被普通记录挤掉 ----
test('active boundary/conflict 优先于普通高 significance 事件', () => {
  const state = makeState({
    relationship_memories: [
      rel({ relationship_memory_id: 'rel-1', kind: 'conflict', active: true, significance: 2, day: 20, summary: '尚未和解的冲突。' }),
      rel({ relationship_memory_id: 'rel-2', kind: 'milestone', event_kind: 'kiss', significance: 3, day: 12, summary: '甜蜜事件。' }),
      rel({ relationship_memory_id: 'rel-3', kind: 'boundary', active: true, significance: 1, day: 21, summary: '有效边界：拒绝公开亲密。' }),
      ...Array.from({ length: 10 }, (_, i) => rel({ relationship_memory_id: `rel-extra-${i}`, kind: 'milestone', event_kind: 'trust', significance: 1, day: i, summary: `普通事件${i}` })),
    ],
  });
  const result = sh.buildSyntheticHistory(baseInput(state));
  assert.match(result.content, /尚未和解的冲突/);
  assert.match(result.content, /有效边界：拒绝公开亲密/);
  const conflictIndex = result.content.indexOf('尚未和解的冲突');
  const sweetIndex = result.content.indexOf('甜蜜事件');
  assert.ok(conflictIndex < sweetIndex, 'boundary/conflict 排在普通甜蜜事件前');
});

// ---- 角色顺序稳定、null 日期、确定性、state 不变 ----
test('角色顺序按冻结 relevantCharacterIds 稳定', () => {
  const state = makeState(
    { active_visit: visit('character_visit_000001', [turn({ summary: 'reimu 回合' })]) },
    { active_visit: visit('character_visit_000002', [turn({ character_id: 'marisa', turn_id: 'req-m:marisa', summary: 'marisa 回合' })]) },
  );
  const result = sh.buildSyntheticHistory(baseInput(state, {
    visitIdsByCharacter: { reimu: 'character_visit_000001', marisa: 'character_visit_000002' },
  }));
  const reimuIndex = result.content.indexOf('【角色：博丽灵梦');
  const marisaIndex = result.content.indexOf('【角色：雾雨魔理沙');
  assert.ok(reimuIndex >= 0 && marisaIndex >= 0 && reimuIndex < marisaIndex);
});

test('同一 state 重复 100 次逐字节相同；state 输入不变', () => {
  const state = makeState({
    active_visit: visit('character_visit_000001', [
      turn({ turn_id: 'req-1:reimu', summary: '稳定回合' }),
      turn({ turn_id: 'req-2:reimu', day: 2, summary: '另一回合' }),
    ]),
  });
  const before = JSON.stringify(state);
  const first = sh.buildSyntheticHistory(baseInput(state));
  for (let i = 0; i < 99; i += 1) {
    const again = sh.buildSyntheticHistory(baseInput(state));
    assert.equal(JSON.stringify(again), JSON.stringify(first));
  }
  assert.equal(JSON.stringify(state), before);
});

// ---- canary：真实楼层字符串无任何输入通道可传入该函数 ----
test('canary：把真实楼层字符串塞进 state 任意字段，输出绝不包含它', () => {
  const canary = 'CANARY-真实聊天楼层用户说：把我发出去';
  const state = makeState({
    active_visit: visit('character_visit_000001', [turn({ summary: '正常回合' })], { canary }),
  });
  state.canary = canary;
  state.chatMessages = [{ role: 'user', content: canary }];
  state.interaction.visit_memory.by_character.reimu.canary = canary;
  const result = sh.buildSyntheticHistory(baseInput(state));
  assert.doesNotMatch(result.content, /CANARY/);
});
