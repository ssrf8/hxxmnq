// 第三批 B3-T07 —— swipe append plan 构造与精确验证器。
// 覆盖 runbook T07 必测：合法构造、source/candidate 标识、三数组一致、candidate 尾部、
// 快照指纹、写前变化检测、写后复读损坏、写后 active metadata 错、指纹变化、
// 宿主附加系统字段容忍、VisitTurn 身份、lifecycle settled。
// reload/同 commit 重试属于 T08 coordinator 状态机测试，不在此重复。
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

const g = await importTypescript('../src/ui/gal-regeneration-swipe.ts');
const req = await importTypescript('../src/ui/gal-generation-request.ts');

const attemptMeta = (seq = 2) => req.buildAttemptMetadata({
  schema: 'gal-generation-attempt.v1',
  requestId: 'gal-req-b3-0001',
  attemptId: `gal-req-b3-0001:attempt-${seq}`,
  generationId: `gal-gen-${seq}`,
  mode: 'regenerate',
  chatId: 'chat-b3-1',
  ownerCharacterId: 'reimu',
  assistantMessageId: 102,
  baseSwipeId: 1,
  commitKey: `gal-req-b3-0001:gal-req-b3-0001:attempt-${seq}`,
  createdAt: '2026-08-09T00:00:00.000Z',
});

const oldView = () => ({
  message_id: 102,
  swipe_id: 0,
  swipes: ['旧回复'],
  swipes_data: [{ stat_data: { day: 1 }, schema: 'gal-mvu.v1', lifecycle: { status: 'settled', commitKey: 'gal-req-b3-0001:gal-req-b3-0001:attempt-1' } }],
  swipes_info: [{ extra: attemptMeta(1) }],
  customUnknown: { keep: true },
});

const candidateData = () => ({
  stat_data: { day: 2 },
  schema: 'gal-mvu.v1',
  galGenerationCommitV1: {
    schema: 'gal-generation-commit.v1', status: 'settled', requestId: 'gal-req-b3-0001',
    attemptId: 'gal-req-b3-0001:attempt-2', commitKey: 'gal-req-b3-0001:gal-req-b3-0001:attempt-2',
  },
});

const snapshot = () => {
  const r = g.captureSwipeArraysSnapshotV1(oldView());
  assert.equal(r.ok, true);
  return r.snapshot;
};

const plan = () => {
  const r = g.buildSwipeAppendPlanV1({
    snapshot: snapshot(),
    candidateText: '新候选正文',
    candidateData: candidateData(),
    candidateAttemptMetadata: attemptMeta(2),
  });
  assert.equal(r.ok, true);
  return r.plan;
};

const visitTurn = () => ({
  turnId: 'gal-req-b3-0001:reimu',
  summary: '新摘要',
  assistantMessageId: 102,
  assistantSwipeId: 1,
  attemptId: 'gal-req-b3-0001:attempt-2',
  commitKey: 'gal-req-b3-0001:gal-req-b3-0001:attempt-2',
  characterId: 'reimu',
  gameDay: 2,
});

const beforeCheckInput = (overrides = {}) => ({
  plan: plan(),
  currentView: oldView(),
  currentMessages: [{ role: 'assistant', message_id: 102 }],
  expectedMessageTotal: 1,
  expectedChatId: 'chat-b3-1',
  expectedOwnerCharacterId: 'reimu',
  currentChatId: 'chat-b3-1',
  currentOwnerCharacterId: 'reimu',
  ...overrides,
});

const afterView = (overrides = {}) => {
  const p = plan();
  return {
    message_id: 102,
    swipe_id: 1,
    swipes: [...p.swipes],
    swipes_data: p.swipes_data.map((d) => structuredClone(d)),
    swipes_info: p.swipes_info.map((i) => structuredClone(i)),
    ...overrides,
  };
};

const afterCheckInput = (overrides = {}) => ({
  plan: plan(),
  afterView: afterView(),
  activeView: {
    message_id: 102,
    swipe_id: 1,
    message: '新候选正文',
    extra: attemptMeta(2),
  },
  candidateData: candidateData(),
  candidateAttemptMetadata: attemptMeta(2),
  visitTurn: visitTurn(),
  expectedChatId: 'chat-b3-1',
  expectedOwnerCharacterId: 'reimu',
  currentChatId: 'chat-b3-1',
  currentOwnerCharacterId: 'reimu',
  expectedMessageTotal: 2,
  currentMessages: [{ role: 'user', message_id: 101 }, { role: 'assistant', message_id: 102 }],
  expectedUserTotal: 1,
  activeData: candidateData(),
  ...overrides,
});

// ---- §7.1 快照 ----
test('快照：四数组、message/swipe id、未知字段与整体指纹', () => {
  const r = g.captureSwipeArraysSnapshotV1(oldView());
  assert.equal(r.ok, true);
  assert.equal(r.snapshot.messageId, 102);
  assert.equal(r.snapshot.swipeId, 0);
  assert.deepEqual(r.snapshot.swipes, ['旧回复']);
  assert.deepEqual(r.snapshot.unknownFields, { customUnknown: { keep: true } });
  assert.equal(r.snapshot.arraysFingerprint, g.fingerprintSwipeArraysV1(oldView()));
});

test('快照：四数组长度不一致 → malformed-swipe-arrays；swipe 越界 → invalid-source-swipe', () => {
  const bad = oldView();
  bad.swipes_data = [];
  assert.equal(g.captureSwipeArraysSnapshotV1(bad).code, 'malformed-swipe-arrays');
  const badSwipe = oldView();
  badSwipe.swipe_id = 5;
  assert.equal(g.captureSwipeArraysSnapshotV1(badSwipe).code, 'invalid-source-swipe');
});

// ---- §7.2 构造 ----
test('plan 构造：旧数组逐元素保留、candidate 尾部、三数组一致、swipe_id=candidate', () => {
  const p = plan();
  assert.equal(p.messageId, 102);
  assert.equal(p.sourceSwipeId, 0);
  assert.equal(p.candidateSwipeId, 1);
  assert.equal(p.swipes.length, 2);
  assert.equal(p.swipes_data.length, 2);
  assert.equal(p.swipes_info.length, 2);
  assert.equal(p.swipe_id, 1);
  // 旧项保留
  assert.equal(p.swipes[0], '旧回复');
  assert.deepEqual(p.swipes_data[0], oldView().swipes_data[0]);
  assert.deepEqual(p.swipes_info[0], oldView().swipes_info[0]);
  // candidate 项
  assert.equal(p.swipes[1], '新候选正文');
  assert.deepEqual(p.swipes_data[1], candidateData());
  assert.deepEqual(p.swipes_info[1], { extra: attemptMeta(2) });
  // fingerprint 预期 = 写前快照指纹
  assert.equal(p.expectedBeforeFingerprint, snapshot().arraysFingerprint);
});

// ---- §7.3 写前硬门 ----
test('写前硬门：一切一致 → ok', () => {
  assert.deepEqual(g.verifySwipeWriteBeforeV1(beforeCheckInput()), { ok: true });
});

test('写前硬门：chat/owner 变化 → chat-identity-changed', () => {
  assert.equal(g.verifySwipeWriteBeforeV1(beforeCheckInput({ currentChatId: 'chat-other' })).code, 'chat-identity-changed');
  assert.equal(g.verifySwipeWriteBeforeV1(beforeCheckInput({ currentOwnerCharacterId: 'marisa' })).code, 'chat-identity-changed');
});

test('写前硬门：新楼层出现（消息总数变化）→ unexpected-floor-created', () => {
  assert.equal(g.verifySwipeWriteBeforeV1(beforeCheckInput({
    currentMessages: [{ role: 'user', message_id: 101 }, { role: 'assistant', message_id: 102 }],
    expectedMessageTotal: 1,
  })).code, 'unexpected-floor-created');
});

test('写前硬门：目标不再是最后一楼 → not-latest-assistant / target-changed', () => {
  // 最后一楼是 user → not-latest-assistant
  assert.equal(g.verifySwipeWriteBeforeV1(beforeCheckInput({
    currentMessages: [{ role: 'user', message_id: 103 }],
    expectedMessageTotal: 1,
  })).code, 'not-latest-assistant');
  // 最后一楼是 assistant 但不是目标 ID → target-changed
  assert.equal(g.verifySwipeWriteBeforeV1(beforeCheckInput({
    currentMessages: [{ role: 'assistant', message_id: 103 }],
    expectedMessageTotal: 1,
  })).code, 'target-changed');
});

test('写前硬门：fingerprint 变化（数组内容被改）→ target-changed', () => {
  const changed = oldView();
  changed.swipes = ['被改写的旧回复'];
  assert.equal(g.verifySwipeWriteBeforeV1(beforeCheckInput({ currentView: changed })).code, 'target-changed');
});

test('写前硬门：source 越界 → invalid-source-swipe', () => {
  const changed = oldView();
  changed.swipes = ['a', 'b'];
  changed.swipes_data = [{}, {}];
  changed.swipes_info = [{}, {}];
  // fingerprint 会变，但先检查 source 越界（sourceSwipeId=0 < 2 合法）……构造真正越界场景：
  const p = plan();
  const shifted = g.verifySwipeWriteBeforeV1(beforeCheckInput({
    plan: { ...p, sourceSwipeId: 5 },
    currentView: oldView(),
  }));
  assert.equal(shifted.code, 'invalid-source-swipe');
});

// ---- §7.3 写后硬门 ----
test('写后硬门：合法写后（旧项未变、candidate 正确、active=候选、lifecycle settled）→ ok', () => {
  assert.deepEqual(g.verifySwipeWriteAfterV1(afterCheckInput()), { ok: true });
});

test('写后硬门：宿主在 candidate swipe_info 附加系统字段 → 仍通过（子集包含）', () => {
  const view = afterView();
  view.swipes_info[1] = { ...view.swipes_info[1], send_date: '2026-08-09', gen_started: 123, gen_finished: 456 };
  const result = g.verifySwipeWriteAfterV1(afterCheckInput({ afterView: view }));
  assert.deepEqual(result, { ok: true });
});

test('写后硬门：旧 swipe 正文被修改 → candidate-verification-failed', () => {
  const view = afterView();
  view.swipes[0] = '被改';
  assert.equal(g.verifySwipeWriteAfterV1(afterCheckInput({ afterView: view })).code, 'candidate-verification-failed');
});

test('写后硬门：旧 swipes_data 被修改 → candidate-verification-failed', () => {
  const view = afterView();
  view.swipes_data[0] = { stat_data: { day: 999 } };
  assert.equal(g.verifySwipeWriteAfterV1(afterCheckInput({ afterView: view })).code, 'candidate-verification-failed');
});

test('写后硬门：candidate swipes_data 与候选 MvuData 不符 → candidate-verification-failed', () => {
  const view = afterView();
  view.swipes_data[1] = { stat_data: { day: 99 } };
  assert.equal(g.verifySwipeWriteAfterV1(afterCheckInput({ afterView: view })).code, 'candidate-verification-failed');
});

test('写后硬门：四数组未增加（复读损坏）→ malformed-swipe-arrays', () => {
  const view = afterView();
  view.swipes = view.swipes.slice(0, 1);
  view.swipes_data = view.swipes_data.slice(0, 1);
  view.swipes_info = view.swipes_info.slice(0, 1);
  assert.equal(g.verifySwipeWriteAfterV1(afterCheckInput({ afterView: view })).code, 'malformed-swipe-arrays');
});

test('写后硬门：active swipe 不是 candidate → candidate-verification-failed', () => {
  const result = g.verifySwipeWriteAfterV1(afterCheckInput({ activeView: { message_id: 102, swipe_id: 0, message: '旧回复', extra: attemptMeta(1) } }));
  assert.equal(result.code, 'candidate-verification-failed');
});

test('写后硬门：active text 不等于候选 → candidate-verification-failed', () => {
  const result = g.verifySwipeWriteAfterV1(afterCheckInput({ activeView: { message_id: 102, swipe_id: 1, message: '别的文本', extra: attemptMeta(2) } }));
  assert.equal(result.code, 'candidate-verification-failed');
});

test('写后硬门：active metadata 缺新 attempt → candidate-verification-failed', () => {
  const result = g.verifySwipeWriteAfterV1(afterCheckInput({ activeView: { message_id: 102, swipe_id: 1, message: '新候选正文', extra: {} } }));
  assert.equal(result.code, 'candidate-verification-failed');
});

test('写后硬门：candidate data lifecycle 未 settled → candidate-verification-failed', () => {
  const data = candidateData();
  delete data.galGenerationCommitV1;
  assert.equal(g.verifySwipeWriteAfterV1(afterCheckInput({ candidateData: data })).code, 'candidate-verification-failed');
});

test('写后硬门：VisitTurn 身份与候选不一致 → candidate-verification-failed', () => {
  const turn = visitTurn();
  turn.commitKey = 'wrong-commit';
  assert.equal(g.verifySwipeWriteAfterV1(afterCheckInput({ visitTurn: turn })).code, 'candidate-verification-failed');
});

// ---- fingerprint ----
test('fingerprintSwipeArraysV1：key 顺序无关', () => {
  const a = g.fingerprintSwipeArraysV1(oldView());
  const b = g.fingerprintSwipeArraysV1({
    swipes_info: oldView().swipes_info,
    customUnknown: oldView().customUnknown,
    swipes: oldView().swipes,
    swipes_data: oldView().swipes_data,
    swipe_id: oldView().swipe_id,
    message_id: oldView().message_id,
  });
  assert.equal(a, b);
});
