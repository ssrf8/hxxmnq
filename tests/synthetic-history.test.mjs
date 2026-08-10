// 第二批 B2-T06 —— 合成历史投影器。
// 覆盖恰好一条非空 system、过去/本次/legacy 分块、
// 离场重入旧 visit 只在过去块、冻结 visit 精确命中、全量召回不裁剪、
// legacy_unassigned 永不投影、null 时间、
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

const makeState = (reimu, marisa) => ({
  characters: {
    reimu: { id: 'reimu', name: '博丽灵梦' },
    marisa: { id: 'marisa', name: '雾雨魔理沙' },
  },
  interaction: {
    visit_memory: {
      version: 'character-visit-memory.v2',
      by_character: {
        reimu: { character_id: 'reimu', active_visit: null, closed_visits: [], legacy_memories: [], ...reimu },
        marisa: { character_id: 'marisa', active_visit: null, closed_visits: [], legacy_memories: [], ...marisa },
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

// ---- 只有过去、只有 legacy ----
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

// ---- 全量召回：不限制当前/过去条数，也不限制字符预算 ----
test('当前、过去与 legacy 记忆全部投影，内容超过旧 900/2800 预算也不裁剪', () => {
  const activeTurns = Array.from({ length: 16 }, (_, i) => turn({
    turn_id: `active-${i}:reimu`, day: i + 20, summary: `当前回合-${i}-${'长'.repeat(90)}`,
  }));
  const pastTurns = Array.from({ length: 16 }, (_, i) => turn({
    turn_id: `past-${i}:reimu`, day: i + 1, summary: `过去回合-${i}-${'旧'.repeat(90)}`,
  }));
  const state = makeState({
    active_visit: visit('character_visit_000001', activeTurns),
    closed_visits: [
      visit('character_visit_000097', [turn({ turn_id: 'oldest:reimu', summary: '最早过去入场仍保留' })], { ended_day: 87, ended_period_serial: 87, end_reason: 'presence-receipt' }),
      visit('character_visit_000098', [turn({ turn_id: 'older:reimu', summary: '第二次过去入场仍保留' })], { ended_day: 88, ended_period_serial: 88, end_reason: 'presence-receipt' }),
      visit('character_visit_000099', [turn({ turn_id: 'recent:reimu', summary: '第三次过去入场仍保留' })], { ended_day: 89, ended_period_serial: 89, end_reason: 'presence-receipt' }),
      visit('character_visit_000100', pastTurns, { ended_day: 90, ended_period_serial: 90, end_reason: 'presence-receipt' }),
    ],
    legacy_memories: Array.from({ length: 8 }, (_, i) => ({
      legacy_id: `legacy-${i}`, character_id: 'reimu', text: `遗留记忆-${i}-${'远'.repeat(90)}`, source: 'conversation_log.v0',
    })),
  });
  const result = sh.buildSyntheticHistory(baseInput(state));
  assert.ok(result.content.length > 2800, `合成历史 ${result.content.length} 应超过旧全局预算`);
  for (const marker of [
    '当前回合-0-', '当前回合-15-', '最早过去入场仍保留', '第二次过去入场仍保留',
    '第三次过去入场仍保留', '过去回合-0-', '过去回合-15-', '遗留记忆-0-', '遗留记忆-7-',
  ]) {
    assert.match(result.content, new RegExp(marker));
  }
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
