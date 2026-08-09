// 第三批 B3-T05 —— receipt、fingerprint 与漂移检测。
// 覆盖 runbook T05 必测：key 顺序变化 hash 相同、任一正式字段变化 hash 不同、
// UI-only 非正式字段纳入裁定、receipt 身份错配拒绝、settlementKeys 排序去重、
// drift 三态（clean/needs-legacy-replay/post-settlement-drift）。
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

const g = await importTypescript('../src/ui/gal-regeneration-receipt.ts');

const mvuData = (day, extra = {}) => ({
  stat_data: { day, player: { money: 100 } },
  display_data: { label: `d${day}` },
  delta_data: {},
  schema: 'gal-mvu.v1',
  initialized_lorebooks: ['core'],
  ...extra,
});

const receiptInput = (overrides = {}) => ({
  requestId: 'gal-req-b3-0001',
  attemptId: 'gal-req-b3-0001:attempt-2',
  commitKey: 'gal-req-b3-0001:gal-req-b3-0001:attempt-2',
  assistantMessageId: 102,
  assistantSwipeId: 1,
  baselineData: mvuData(1),
  modelAppliedData: mvuData(2),
  finalizedData: mvuData(2),
  settlementKeys: ['settle:b', 'settle:a', 'settle:b'],
  ...overrides,
});

const identity = (overrides = {}) => ({
  requestId: 'gal-req-b3-0001',
  attemptId: 'gal-req-b3-0001:attempt-2',
  assistantMessageId: 102,
  assistantSwipeId: 1,
  ...overrides,
});

// ---- fingerprint：key 顺序无关 ----
test('fingerprint：object key 顺序变化 hash 相同', () => {
  const a = g.fingerprintMvuData({ z: 1, a: { b: [1, 2], c: 'x' }, m: 'y' });
  const b = g.fingerprintMvuData({ m: 'y', a: { c: 'x', b: [1, 2] }, z: 1 });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{8}$/);
});

// ---- 任一正式字段变化 hash 不同 ----
test('fingerprint：任一正式字段变化 hash 必不同（stat_data 改动）', () => {
  const a = g.fingerprintMvuData(mvuData(2));
  const b = g.fingerprintMvuData({ ...mvuData(2), stat_data: { day: 3, player: { money: 100 } } });
  assert.notEqual(a, b);
});

test('fingerprint：UI-only 非正式字段也纳入（裁定：纳入，fail-closed）', () => {
  const a = g.fingerprintMvuData(mvuData(2));
  const b = g.fingerprintMvuData({ ...mvuData(2), display_data: { label: 'changed' } });
  assert.notEqual(a, b);
});

test('fingerprint：未知字段变化 hash 必不同', () => {
  const a = g.fingerprintMvuData(mvuData(2));
  const b = g.fingerprintMvuData(mvuData(2, { mystery: 1 }));
  assert.notEqual(a, b);
});

// ---- receipt 构造 ----
test('receipt 构造：只存 fingerprint 不存正文，settlementKeys 排序去重', () => {
  const r = g.createRegenerationCommitReceiptV1(receiptInput());
  assert.equal(r.schema, 'gal-regeneration-commit-receipt.v1');
  assert.equal(r.requestId, 'gal-req-b3-0001');
  assert.equal(r.attemptId, 'gal-req-b3-0001:attempt-2');
  assert.equal(r.assistantMessageId, 102);
  assert.equal(r.assistantSwipeId, 1);
  assert.equal(r.baselineDataFingerprint, g.fingerprintMvuData(mvuData(1)));
  assert.equal(r.modelAppliedDataFingerprint, g.fingerprintMvuData(mvuData(2)));
  assert.equal(r.finalizedDataFingerprint, g.fingerprintMvuData(mvuData(2)));
  assert.deepEqual(r.settlementKeys, ['settle:a', 'settle:b']);
  assert.equal('stat_data' in r, false); // 不记录正文
});

test('receipt 嵌入 MvuData 不形成自引用 hash，且可严格读回', () => {
  const data = mvuData(2);
  const receipt = g.createRegenerationCommitReceiptV1(receiptInput());
  const before = g.fingerprintMvuData(data);
  data[g.GAL_REGENERATION_RECEIPT_DATA_KEY] = receipt;
  assert.equal(g.fingerprintMvuData(data), before);
  assert.deepEqual(g.readRegenerationReceiptFromDataV1(data), receipt);
  assert.equal(g.readRegenerationReceiptFromDataV1({ [g.GAL_REGENERATION_RECEIPT_DATA_KEY]: { schema: 'wrong' } }), null);
});

// ---- drift 三态 ----
test('drift：receipt 与当前 active data 相等 → clean', () => {
  const receipt = g.createRegenerationCommitReceiptV1(receiptInput());
  const decision = g.decideRegenerationDriftV1({
    receipt,
    identity: identity(),
    currentActiveDataFingerprint: g.fingerprintMvuData(mvuData(2)),
  });
  assert.deepEqual(decision, { kind: 'clean' });
});

test('drift：无 receipt → needs-legacy-replay', () => {
  const decision = g.decideRegenerationDriftV1({
    receipt: null,
    identity: identity(),
    currentActiveDataFingerprint: g.fingerprintMvuData(mvuData(2)),
  });
  assert.deepEqual(decision, { kind: 'needs-legacy-replay' });
});

test('drift：receipt 存在但 active data 不相等 → post-settlement-drift（不自动合并）', () => {
  const receipt = g.createRegenerationCommitReceiptV1(receiptInput());
  const decision = g.decideRegenerationDriftV1({
    receipt,
    identity: identity(),
    currentActiveDataFingerprint: g.fingerprintMvuData(mvuData(99)),
  });
  assert.equal(decision.kind, 'post-settlement-drift');
});

// ---- receipt 身份错配拒绝 ----
test('drift：receipt 身份错配逐一拒绝（request/attempt/message/swipe）', () => {
  const receipt = g.createRegenerationCommitReceiptV1(receiptInput());
  const cases = [
    { identity: identity({ requestId: 'other' }), code: 'request-mismatch' },
    { identity: identity({ attemptId: 'gal-req-b3-0001:attempt-9' }), code: 'attempt-mismatch' },
    { identity: identity({ assistantMessageId: 999 }), code: 'message-mismatch' },
    { identity: identity({ assistantSwipeId: 7 }), code: 'swipe-mismatch' },
  ];
  for (const { identity: id, code } of cases) {
    const decision = g.decideRegenerationDriftV1({
      receipt,
      identity: id,
      currentActiveDataFingerprint: g.fingerprintMvuData(mvuData(2)),
    });
    assert.equal(decision.kind, 'receipt-mismatch', code);
    assert.equal(decision.code, code);
  }
});

// ---- settlementKeys 排序去重 ----
test('normalizeSettlementKeys：排序稳定 + 去重', () => {
  assert.deepEqual(g.normalizeSettlementKeys(['b', 'a', 'b', 'c', 'a']), ['a', 'b', 'c']);
  assert.deepEqual(g.normalizeSettlementKeys([]), []);
  assert.deepEqual(g.normalizeSettlementKeys(['same', 'same']), ['same']);
});
