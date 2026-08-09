// 第三批 B3-T01 —— 重生成同构：纯类型、错误码与不变量。
// 覆盖 runbook §4.4、§5.1、§5.2、§5.3、§7.2：
//   - target/receipt 合法 round-trip 与 unknown 字段保留；
//   - 每个非法字段 fail closed；
//   - source/candidate swipe 越界与 candidate 非尾部拒绝；
//   - swipe plan 四数组长度不一致拒绝、身份校验；
//   - 15 个业务错误码与 11 个状态机阶段常量存在。
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

const g = await importTypescript('../src/ui/gal-regeneration.ts');

const SYNTHETIC = [
  { role: 'system', content: '【历史边界】本请求不读取 SillyTavern 真实聊天楼层。' },
];

const v2Request = () => ({
  schema: 'gal-generation-request.v2',
  requestId: 'gal-req-v2-0001',
  chatId: 'chat-b3-1',
  ownerCharacterId: 'reimu',
  playerMessageId: 101,
  promptRevision: 'gal-prompt.v1',
  historyRevision: 'gal-synthetic-history.v1',
  memoryRevision: 'character-visit-memory.v1',
  sceneId: 'scene:shrine',
  stateMessageIdBeforeGeneration: 99,
  stateSwipeIdBeforeGeneration: 0,
  relevantCharacterIds: ['reimu', 'marisa'],
  visitIdsByCharacter: { reimu: 'character_visit_000001', marisa: null },
  syntheticHistory: SYNTHETIC,
  syntheticHistoryHash: 'a1b2c3d4',
  contextFingerprint: 'deadbeef',
  visibleUserText: '你好，灵梦',
  modelUserInput: '你好，灵梦',
  attemptSeq: 1,
  createdAt: '2026-08-09T00:00:00.000Z',
});

const validTarget = (overrides = {}) => ({
  schema: 'gal-regeneration-target.v1',
  chatId: 'chat-b3-1',
  ownerCharacterId: 'reimu',
  requestId: 'gal-req-v2-0001',
  playerMessageId: 101,
  assistantMessageId: 102,
  sourceSwipeId: 0,
  candidateSwipeId: 1,
  sourceAttemptId: 'gal-req-v2-0001:attempt-1',
  sourceCommitKey: 'gal-req-v2-0001:gal-req-v2-0001:attempt-1',
  arraysFingerprint: 'fp-before-1234',
  originalRequest: v2Request(),
  ...overrides,
});

const validReceipt = (overrides = {}) => ({
  schema: 'gal-regeneration-commit-receipt.v1',
  requestId: 'gal-req-v2-0001',
  attemptId: 'gal-req-v2-0001:attempt-2',
  commitKey: 'gal-req-v2-0001:gal-req-v2-0001:attempt-2',
  assistantMessageId: 102,
  assistantSwipeId: 1,
  baselineDataFingerprint: 'fp-baseline',
  modelAppliedDataFingerprint: 'fp-model',
  finalizedDataFingerprint: 'fp-final',
  settlementKeys: ['settle:incident-1', 'visit:reimu'],
  ...overrides,
});

const validPlan = (overrides = {}) => ({
  messageId: 102,
  expectedBeforeFingerprint: 'fp-before-1234',
  sourceSwipeId: 0,
  candidateSwipeId: 1,
  swipes: ['旧回复', '新候选'],
  swipes_data: [{ stat_data: { day: 1 } }, { stat_data: { day: 1 } }],
  swipes_info: [{ extra: { a: 1 } }, { extra: { gal: 'attempt-2' } }],
  swipe_id: 1,
  ...overrides,
});

// ---- §5.1 target round-trip ----
test('target 合法 round-trip：全部字段与 unknown 字段保留', () => {
  const input = validTarget({ customField: { keep: 'me' } });
  const result = g.parseGalRegenerationTargetV1(input, { swipeArrayLength: 1 });
  assert.equal(result.ok, true);
  const t = result.target;
  assert.equal(t.schema, 'gal-regeneration-target.v1');
  assert.equal(t.chatId, 'chat-b3-1');
  assert.equal(t.ownerCharacterId, 'reimu');
  assert.equal(t.requestId, 'gal-req-v2-0001');
  assert.equal(t.playerMessageId, 101);
  assert.equal(t.assistantMessageId, 102);
  assert.equal(t.sourceSwipeId, 0);
  assert.equal(t.candidateSwipeId, 1);
  assert.equal(t.sourceAttemptId, 'gal-req-v2-0001:attempt-1');
  assert.equal(t.sourceCommitKey, 'gal-req-v2-0001:gal-req-v2-0001:attempt-1');
  assert.equal(t.arraysFingerprint, 'fp-before-1234');
  // originalRequest 逐字节保持冻结字段
  assert.equal(t.originalRequest.schema, 'gal-generation-request.v2');
  assert.equal(t.originalRequest.requestId, 'gal-req-v2-0001');
  assert.equal(t.originalRequest.ownerCharacterId, 'reimu');
  assert.equal(t.originalRequest.stateMessageIdBeforeGeneration, 99);
  assert.equal(t.originalRequest.stateSwipeIdBeforeGeneration, 0);
  assert.deepEqual(t.originalRequest.relevantCharacterIds, ['reimu', 'marisa']);
  assert.deepEqual(t.originalRequest.visitIdsByCharacter, { reimu: 'character_visit_000001', marisa: null });
  assert.deepEqual(t.originalRequest.syntheticHistory, SYNTHETIC);
  assert.equal(t.originalRequest.modelUserInput, '你好，灵梦');
  // unknown 保留（target 级与 originalRequest 级）
  assert.deepEqual(t.customField, { keep: 'me' });
  const inputWithOriginalUnknown = validTarget({ originalRequest: { ...v2Request(), extraUnknown: 7 } });
  const result2 = g.parseGalRegenerationTargetV1(inputWithOriginalUnknown, { swipeArrayLength: 1 });
  assert.equal(result2.ok, true);
  assert.equal(result2.target.originalRequest.extraUnknown, 7);
});

test('target parser：非法输入 fail closed', () => {
  const cases = [
    { input: undefined, code: 'missing' },
    { input: null, code: 'missing' },
    { input: 'not-object', code: 'malformed' },
    { input: 42, code: 'malformed' },
    { input: validTarget({ schema: 'wrong-schema' }), code: 'schema-mismatch' },
    { input: (() => { const x = validTarget(); delete x.chatId; return x; })(), code: 'incomplete' },
    { input: validTarget({ chatId: '' }), code: 'invalid' },
    { input: validTarget({ ownerCharacterId: 7 }), code: 'invalid' },
    { input: validTarget({ requestId: '' }), code: 'invalid' },
    { input: validTarget({ playerMessageId: 0 }), code: 'invalid' },
    { input: validTarget({ playerMessageId: -3 }), code: 'invalid' },
    { input: validTarget({ assistantMessageId: 1.5 }), code: 'invalid' },
    { input: validTarget({ sourceSwipeId: -1 }), code: 'invalid' },
    { input: validTarget({ candidateSwipeId: '1' }), code: 'invalid' },
    { input: validTarget({ sourceAttemptId: '' }), code: 'invalid' },
    { input: validTarget({ sourceCommitKey: 3 }), code: 'invalid' },
    { input: validTarget({ arraysFingerprint: '' }), code: 'invalid' },
    { input: validTarget({ originalRequest: { ...v2Request(), schema: 'gal-generation-request.v1' } }), code: 'invalid-original-request' },
    { input: validTarget({ originalRequest: { ...v2Request(), syntheticHistory: [{ role: 'user', content: 'x' }] } }), code: 'invalid-original-request' },
    { input: validTarget({ originalRequest: { ...v2Request(), relevantCharacterIds: 'reimu' } }), code: 'invalid-original-request' },
    { input: validTarget({ originalRequest: null }), code: 'invalid-original-request' },
  ];
  for (const { input, code } of cases) {
    const result = g.parseGalRegenerationTargetV1(input, { swipeArrayLength: 1 });
    assert.equal(result.ok, false, `应拒绝 ${JSON.stringify(input)?.slice(0, 60)}`);
    assert.equal(result.code, code);
  }
});

test('target parser：提供 swipeArrayLength 时 source 越界拒绝', () => {
  const result = g.parseGalRegenerationTargetV1(validTarget({ sourceSwipeId: 2, candidateSwipeId: 2 }), { swipeArrayLength: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'source-swipe-out-of-range');
});

test('target parser：candidate 不是尾部（不等于数组长度）拒绝', () => {
  const result = g.parseGalRegenerationTargetV1(validTarget({ candidateSwipeId: 0, sourceSwipeId: 0 }), { swipeArrayLength: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'candidate-not-tail');
});

test('target parser：未提供 swipeArrayLength 时只做基础类型校验（不做越界/尾部断言）', () => {
  const result = g.parseGalRegenerationTargetV1(validTarget({ sourceSwipeId: 5, candidateSwipeId: 9 }));
  assert.equal(result.ok, true);
});

// ---- §4.4 receipt round-trip ----
test('receipt 合法 round-trip：字段与 unknown 保留', () => {
  const input = validReceipt({ note: '保留我' });
  const result = g.parseRegenerationCommitReceiptV1(input);
  assert.equal(result.ok, true);
  const r = result.receipt;
  assert.equal(r.schema, 'gal-regeneration-commit-receipt.v1');
  assert.equal(r.requestId, 'gal-req-v2-0001');
  assert.equal(r.attemptId, 'gal-req-v2-0001:attempt-2');
  assert.equal(r.commitKey, 'gal-req-v2-0001:gal-req-v2-0001:attempt-2');
  assert.equal(r.assistantMessageId, 102);
  assert.equal(r.assistantSwipeId, 1);
  assert.equal(r.baselineDataFingerprint, 'fp-baseline');
  assert.equal(r.modelAppliedDataFingerprint, 'fp-model');
  assert.equal(r.finalizedDataFingerprint, 'fp-final');
  assert.deepEqual(r.settlementKeys, ['settle:incident-1', 'visit:reimu']);
  assert.equal(r.note, '保留我');
});

test('receipt parser：非法输入 fail closed', () => {
  const cases = [
    { input: undefined, code: 'missing' },
    { input: null, code: 'missing' },
    { input: [], code: 'malformed' },
    { input: 'x', code: 'malformed' },
    { input: validReceipt({ schema: 'nope' }), code: 'schema-mismatch' },
    { input: (() => { const x = validReceipt(); delete x.commitKey; return x; })(), code: 'incomplete' },
    { input: validReceipt({ requestId: '' }), code: 'invalid' },
    { input: validReceipt({ attemptId: 5 }), code: 'invalid' },
    { input: validReceipt({ assistantMessageId: 0 }), code: 'invalid' },
    { input: validReceipt({ assistantSwipeId: -1 }), code: 'invalid' },
    { input: validReceipt({ baselineDataFingerprint: '' }), code: 'invalid' },
    { input: validReceipt({ modelAppliedDataFingerprint: '' }), code: 'invalid' },
    { input: validReceipt({ finalizedDataFingerprint: '' }), code: 'invalid' },
    { input: validReceipt({ settlementKeys: 'a,b' }), code: 'invalid' },
    { input: validReceipt({ settlementKeys: [1, 2] }), code: 'invalid' },
  ];
  for (const { input, code } of cases) {
    const result = g.parseRegenerationCommitReceiptV1(input);
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
  }
});

// ---- §7.2 swipe plan 身份/数组结构校验 ----
test('swipe plan：合法 plan 通过（1→2 尾部追加）', () => {
  const result = g.validateSwipeAppendPlanV1(validPlan(), { expectedMessageId: 102, beforeSwipeCount: 1, afterSwipeCount: 2 });
  assert.deepEqual(result, { ok: true });
});

test('swipe plan：3→4 尾部追加通过', () => {
  const plan = validPlan({
    sourceSwipeId: 2,
    candidateSwipeId: 3,
    swipes: ['s0', 's1', 's2', 's3'],
    swipes_data: [{}, {}, {}, {}],
    swipes_info: [{}, {}, {}, {}],
    swipe_id: 3,
  });
  const result = g.validateSwipeAppendPlanV1(plan, { expectedMessageId: 102, beforeSwipeCount: 3, afterSwipeCount: 4 });
  assert.deepEqual(result, { ok: true });
});

test('swipe plan：messageId 不匹配 → target-changed', () => {
  const result = g.validateSwipeAppendPlanV1(validPlan({ messageId: 999 }), { expectedMessageId: 102, beforeSwipeCount: 1, afterSwipeCount: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'target-changed');
});

test('swipe plan：四数组长度不一致 → malformed-swipe-arrays', () => {
  const plan = validPlan({ swipes: ['旧回复', '新候选', '多一个'] });
  const result = g.validateSwipeAppendPlanV1(plan, { expectedMessageId: 102, beforeSwipeCount: 1, afterSwipeCount: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'malformed-swipe-arrays');
});

test('swipe plan：写后数组不是 before+1（多增）→ malformed-swipe-arrays', () => {
  const plan = validPlan({
    swipes: ['s0', 's1', 's2'],
    swipes_data: [{}, {}, {}],
    swipes_info: [{}, {}, {}],
    candidateSwipeId: 2,
    swipe_id: 2,
  });
  const result = g.validateSwipeAppendPlanV1(plan, { expectedMessageId: 102, beforeSwipeCount: 1, afterSwipeCount: 3 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'malformed-swipe-arrays');
});

test('swipe plan：写后数组未增（after === before）→ malformed-swipe-arrays', () => {
  const result = g.validateSwipeAppendPlanV1(validPlan(), { expectedMessageId: 102, beforeSwipeCount: 2, afterSwipeCount: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'malformed-swipe-arrays');
});

test('swipe plan：source 越界 → invalid-source-swipe', () => {
  const result = g.validateSwipeAppendPlanV1(validPlan({ sourceSwipeId: 3 }), { expectedMessageId: 102, beforeSwipeCount: 1, afterSwipeCount: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid-source-swipe');
});

test('swipe plan：source 与 candidate 相同 → invalid-source-swipe', () => {
  const result = g.validateSwipeAppendPlanV1(validPlan({ sourceSwipeId: 0, candidateSwipeId: 0, swipe_id: 0 }), { expectedMessageId: 102, beforeSwipeCount: 1, afterSwipeCount: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid-source-swipe');
});

test('swipe plan：candidate 不是尾部 → candidate-write-conflict', () => {
  // before=2（已有 2 个 swipe），source=1 合法，candidate=0 不是尾部 2
  const plan = validPlan({
    sourceSwipeId: 1,
    candidateSwipeId: 0,
    swipe_id: 0,
    swipes: ['s0', 's1', 's2'],
    swipes_data: [{}, {}, {}],
    swipes_info: [{}, {}, {}],
  });
  const result = g.validateSwipeAppendPlanV1(plan, { expectedMessageId: 102, beforeSwipeCount: 2, afterSwipeCount: 3 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'candidate-write-conflict');
});

test('swipe plan：candidate 不在写后数组 → candidate-write-conflict', () => {
  const result = g.validateSwipeAppendPlanV1(validPlan({ candidateSwipeId: 2, swipe_id: 2 }), { expectedMessageId: 102, beforeSwipeCount: 1, afterSwipeCount: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'candidate-write-conflict');
});

test('swipe plan：swipe_id 不指向 candidate → candidate-write-conflict', () => {
  const result = g.validateSwipeAppendPlanV1(validPlan({ swipe_id: 0 }), { expectedMessageId: 102, beforeSwipeCount: 1, afterSwipeCount: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'candidate-write-conflict');
});

test('swipe plan：expectedBeforeFingerprint 为空 → candidate-write-conflict', () => {
  const result = g.validateSwipeAppendPlanV1(validPlan({ expectedBeforeFingerprint: '' }), { expectedMessageId: 102, beforeSwipeCount: 1, afterSwipeCount: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'candidate-write-conflict');
});

// ---- §5.2 错误码与 §5.3 状态机常量 ----
test('15 个业务错误码常量存在且标签完整', () => {
  const expected = [
    'not-latest-assistant',
    'legacy-request-unsupported',
    'request-conflict',
    'chat-identity-changed',
    'invalid-source-swipe',
    'malformed-swipe-arrays',
    'attempt-sequence-conflict',
    'baseline-not-found',
    'baseline-swipe-not-found',
    'post-settlement-drift',
    'legacy-replay-mismatch',
    'target-changed',
    'unexpected-floor-created',
    'candidate-write-conflict',
    'candidate-verification-failed',
  ];
  for (const code of expected) {
    assert.equal(typeof g.GAL_REGENERATION_ERROR_LABELS[code], 'string', `缺少标签: ${code}`);
    assert.ok(g.GAL_REGENERATION_ERROR_LABELS[code].length > 0);
  }
  assert.equal(Object.keys(g.GAL_REGENERATION_ERROR_LABELS).length, 15);
});

test('11 个状态机阶段常量存在且顺序固定', () => {
  assert.deepEqual(g.GAL_REGENERATION_PHASES, [
    'idle',
    'locating',
    'generating_candidate',
    'candidate_ready',
    'rebuilding_state',
    'committing_swipe',
    'verifying',
    'settled',
    'stopping',
    'failed_recoverable',
    'conflict_manual',
  ]);
});
