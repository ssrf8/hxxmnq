import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const importTypescript = async (path) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const vtc = await importTypescript('../src/ui/visit-turn-commit.ts');
const vst = await importTypescript('../src/ui/visit-summary-task.ts');

const request = {
  requestId: 'gal-req-1', sceneId: 'scene:demo',
  relevantCharacterIds: ['reimu', 'marisa'],
  visitIdsByCharacter: { reimu: 'character_visit_000001', marisa: 'character_visit_000002' },
  visibleUserText: '你在这里做什么？',
};
const summaries = {
  reimu: '灵梦避开玩家摸头的试探，说明结界锚点与旧主屋的风险，贴符加固柱子后警告不要让庭园成为异变源头。',
  marisa: '魔理沙检查花圃土质，提出提供月光草种子，换取小规模观察和配制肥料的场地许可。',
};
const stateWithTask = (taskRequest = request, values = summaries) => ({
  interaction: {
    visit_summary_task: {
      ...vst.createVisitSummaryTask(taskRequest),
      slots: vst.createVisitSummaryTask(taskRequest).slots.map((slot) => ({
        ...slot, summary: values[slot.character_id] ?? '',
      })),
    },
  },
});
const input = (overrides = {}) => ({
  finalState: stateWithTask(), request,
  attempt: { attemptId: 'attempt-1', commitKey: 'commit-1', assistantMessageId: 55, assistantSwipeId: null },
  clock: { day: 1, time_period: '清晨', period_serial: 1 },
  ...overrides,
});

test('任务按冻结角色顺序建立，模型只需填写 summary', () => {
  assert.deepEqual(vst.createVisitSummaryTask(request), {
    schema: 'visit-summary-task.v1', request_id: 'gal-req-1',
    slots: [
      { character_id: 'reimu', summary: '' },
      { character_id: 'marisa', summary: '' },
    ],
  });
});

test('每个角色使用各自的模型语义梗概，不读取正文', () => {
  const result = vtc.buildVisitTurnCommit(input());
  assert.equal(result.ok, true);
  assert.deepEqual(result.turns.map((turn) => turn.summary), [summaries.reimu, summaries.marisa]);
  assert.equal(result.turns[0].turn_id, 'gal-req-1:reimu');
  assert.equal(result.turns[0].day, 1);
});

test('正文文本不能成为脚本兜底', () => {
  const result = vtc.buildVisitTurnCommit(input({
    finalState: { interaction: { visit_summary_task: null } },
    acceptedOutput: '【庭园正文开始】这里有完整剧情【庭园正文结束】',
  }));
  assert.deepEqual(result, { ok: false, code: 'missing-task', turns: [] });
});

test('空槽、超长摘要分别拒绝', () => {
  const missing = vtc.buildVisitTurnCommit(input({ finalState: stateWithTask(request, { ...summaries, reimu: '' }) }));
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'missing-summary');
  const invalid = vtc.buildVisitTurnCommit(input({ finalState: stateWithTask(request, { ...summaries, reimu: '长'.repeat(101) }) }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, 'invalid-summary');
});

test('模型篡改 request、角色、顺序或增删槽位时拒绝', () => {
  for (const task of [
    { ...stateWithTask().interaction.visit_summary_task, request_id: 'evil' },
    { ...stateWithTask().interaction.visit_summary_task, slots: [...stateWithTask().interaction.visit_summary_task.slots].reverse() },
    { ...stateWithTask().interaction.visit_summary_task, slots: stateWithTask().interaction.visit_summary_task.slots.slice(0, 1) },
  ]) {
    const result = vtc.buildVisitTurnCommit(input({ finalState: { interaction: { visit_summary_task: task } } }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'task-mismatch');
  }
});

test('visit ID 为 null 时不建槽也不写 turn', () => {
  const noVisit = { ...request, relevantCharacterIds: ['reimu'], visitIdsByCharacter: { reimu: null } };
  const result = vtc.buildVisitTurnCommit(input({ request: noVisit, finalState: stateWithTask(noVisit, {}) }));
  assert.deepEqual(result, { ok: true, turns: [] });
});

test('摘要规范化空白且保持不超过100字', () => {
  const value = '  灵梦\n确认结界稳定，\t并拒绝玩家摸头。  ';
  const one = { ...request, relevantCharacterIds: ['reimu'], visitIdsByCharacter: { reimu: 'character_visit_000001' } };
  const result = vtc.buildVisitTurnCommit(input({ request: one, finalState: stateWithTask(one, { reimu: value }) }));
  assert.equal(result.ok, true);
  assert.equal(result.turns[0].summary, '灵梦 确认结界稳定， 并拒绝玩家摸头。');
  assert.ok(result.turns[0].summary.length <= vtc.TURN_SUMMARY_CHARS);
});

test('同一输入重复运行逐字节稳定且不修改输入', () => {
  const value = input();
  const frozen = structuredClone(value);
  assert.equal(JSON.stringify(vtc.buildVisitTurnCommit(value)), JSON.stringify(vtc.buildVisitTurnCommit(value)));
  assert.deepEqual(value, frozen);
});

test('visitTurnCommitRefs 映射不丢字段', () => {
  const refs = vtc.visitTurnCommitRefs(request, {
    attemptId: 'attempt-1', commitKey: 'commit-1', assistantMessageId: 60, assistantSwipeId: 1,
  });
  assert.equal(refs.request.requestId, 'gal-req-1');
  assert.equal(refs.attempt.assistantSwipeId, 1);
});
