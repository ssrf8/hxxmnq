// 第三批 B3-T06 —— branch replay engine 的纯壳。
// 覆盖 runbook T06 必测：ports 调用顺序、任一步抛错无部分输出、同输入同输出、
// old settled current state 不作为输入、普通无状态变化仍更新 VisitTurn、
// 异变/决斗 operation 只执行一次、missing visit fail closed、同 commit 重跑逐字节相同。
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

const g = await importTypescript('../src/ui/gal-regeneration-replay.ts');

const baseline = () => ({
  stat_data: { day: 1, player: { money: 100 } },
  schema: 'gal-mvu.v1',
  initialized_lorebooks: ['core'],
});

const v2Request = () => ({
  schema: 'gal-generation-request.v2',
  requestId: 'gal-req-b3-0001',
  chatId: 'chat-b3-1',
  ownerCharacterId: 'reimu',
  promptRevision: 'gal-prompt.v1',
  historyRevision: 'gal-synthetic-history.v1',
  memoryRevision: 'character-visit-memory.v2',
  sceneId: 'scene:shrine',
  stateMessageIdBeforeGeneration: 99,
  stateSwipeIdBeforeGeneration: 0,
  relevantCharacterIds: ['reimu'],
  visitIdsByCharacter: { reimu: 'character_visit_000001' },
  syntheticHistory: [{ role: 'system', content: '【历史边界】' }],
  syntheticHistoryHash: 'a1b2c3d4',
  contextFingerprint: 'deadbeef',
  visibleUserText: '你好',
  modelUserInput: '你好',
  attemptSeq: 1,
  createdAt: '2026-08-09T00:00:00.000Z',
});

const visitTurn = (overrides = {}) => ({
  turnId: 'gal-req-b3-0001:reimu',
  summary: '新回复摘要',
  assistantMessageId: 102,
  assistantSwipeId: 1,
  attemptId: 'gal-req-b3-0001:attempt-2',
  commitKey: 'gal-req-b3-0001:gal-req-b3-0001:attempt-2',
  characterId: 'reimu',
  gameDay: 2,
  ...overrides,
});

const attemptIdentity = () => ({
  attemptId: 'gal-req-b3-0001:attempt-2',
  commitKey: 'gal-req-b3-0001:gal-req-b3-0001:attempt-2',
  assistantMessageId: 102,
  assistantSwipeId: 1,
});

/** 确定性 ports：记录调用顺序与参数，可选故障注入。 */
const makePorts = (opts = {}) => {
  const calls = [];
  const {
    failOn = null, // 抛错时机（如 'applyPresenceAnalysis'）
    visitResult = { ok: true, state: undefined },
    applyModelOutput: amo = (base, text) => ({ ...structuredClone(base ?? {}), stat_data: { day: 2, player: { money: 150 } } }),
  } = opts;
  return {
    calls,
    ports: {
      async applyModelOutput(base, text) {
        calls.push(`applyModelOutput:${text}`);
        return amo(base, text);
      },
      restoreLocalEventOwnership(base, parsed) {
        calls.push('restoreLocalEventOwnership');
        if (failOn === 'restoreLocalEventOwnership') throw new Error('ownership fail');
        return { ...structuredClone(parsed), stat_data: { ...parsed.stat_data, owner: 'reimu' } };
      },
      applyLocalSettlement(state, operation) {
        calls.push(`applyLocalSettlement:${operation.kind}`);
        if (failOn === 'applyLocalSettlement') throw new Error('settlement fail');
        return { ...structuredClone(state), stat_data: { ...state.stat_data, settled: operation.kind } };
      },
      applyPresenceAnalysis(state, text) {
        calls.push('applyPresenceAnalysis');
        if (failOn === 'applyPresenceAnalysis') throw new Error('presence fail');
        return { ...structuredClone(state), presence: [text.slice(0, 5)] };
      },
      reconcileM2Runtime(state) {
        calls.push('reconcileM2Runtime');
        if (failOn === 'reconcileM2Runtime') throw new Error('reconcile fail');
        return { ...structuredClone(state), reconciled: true };
      },
      applyVisitTurns(state, turns) {
        calls.push('applyVisitTurns');
        if (failOn === 'applyVisitTurns') throw new Error('visit fail');
        return visitResult.ok
          ? { ok: true, state: { ...structuredClone(state), visitTurn: turns[0]?.turnId ?? null } }
          : { ok: false, code: visitResult.code, detail: visitResult.detail };
      },
      finalizeLifecycle(state) {
        calls.push('finalizeLifecycle');
        if (failOn === 'finalizeLifecycle') throw new Error('lifecycle fail');
        return { ...structuredClone(state), galGenerationCommitV1: {
          schema: 'gal-generation-commit.v1', status: 'settled', requestId: 'gal-req-b3-0001',
          attemptId: 'gal-req-b3-0001:attempt-2', commitKey: 'gal-req-b3-0001:gal-req-b3-0001:attempt-2',
        } };
      },
    },
  };
};

const run = (overrides = {}, portsOpts = {}) => {
  const { ports, calls } = makePorts(portsOpts);
  return {
    calls,
    result: g.replayRegenerationCandidateV1({
      baseline: baseline(),
      candidateText: '新候选回复',
      request: v2Request(),
      operation: { kind: 'anomaly-resolution', operationId: 'op-1' },
      visitTurns: [visitTurn()],
      attempt: attemptIdentity(),
      settlementKeys: ['settle:op-1'],
      ports,
      ...overrides,
    }),
  };
};

// ---- ports 调用顺序 ----
test('ports 按 §8.1 固定顺序调用（含 operation 结算在 presence 之前）', async () => {
  const { calls, result } = run();
  const r = await result;
  assert.equal(r.ok, true);
  assert.deepEqual(calls, [
    'applyModelOutput:新候选回复',
    'restoreLocalEventOwnership',
    'applyLocalSettlement:anomaly-resolution',
    'applyPresenceAnalysis',
    'reconcileM2Runtime',
    'applyVisitTurns',
    'finalizeLifecycle',
  ]);
});

// ---- 任一步抛错无部分输出 ----
test('任一步抛错 → port-failed，无部分输出', async () => {
  for (const failOn of ['restoreLocalEventOwnership', 'applyLocalSettlement', 'applyPresenceAnalysis', 'reconcileM2Runtime', 'applyVisitTurns', 'finalizeLifecycle']) {
    const { result } = run({}, { failOn });
    const r = await result;
    assert.equal(r.ok, false, failOn);
    assert.equal(r.code, 'port-failed', failOn);
    assert.equal('candidateData' in r, false, failOn);
  }
});

test('applyModelOutput 抛错 → port-failed', async () => {
  const { ports } = makePorts();
  const badPorts = { ...ports, applyModelOutput: async () => { throw new Error('model fail'); } };
  const result = await g.replayRegenerationCandidateV1({
    baseline: baseline(),
    candidateText: 'x',
    request: v2Request(),
    operation: null,
    visitTurns: [visitTurn()],
    attempt: attemptIdentity(),
    settlementKeys: [],
    ports: badPorts,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'port-failed');
});

// ---- 同输入同输出 ----
test('同输入同输出（确定性 ports 两次运行 deepEqual）', async () => {
  const a = await run().result;
  const b = await run().result;
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepEqual(a.candidateData, b.candidateData);
  assert.deepEqual(a.receipt, b.receipt);
});

// ---- old settled current state 不作为输入 ----
test('old settled current state 不作为输入：applyModelOutput 收到的 baseData 深等于冻结 baseline', async () => {
  const { ports, calls } = makePorts();
  const received = [];
  ports.applyModelOutput = async (base) => {
    received.push(base);
    return { ...structuredClone(base ?? {}), stat_data: { day: 99, settledOld: true } };
  };
  const result = await g.replayRegenerationCandidateV1({
    baseline: baseline(),
    candidateText: '新回复',
    request: v2Request(),
    operation: null,
    visitTurns: [visitTurn()],
    attempt: attemptIdentity(),
    settlementKeys: [],
    ports,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(received[0], baseline()); // 旧 settled current 的 day:99/settledOld 没进来
  assert.notEqual(result.candidateData.stat_data.settledOld, undefined); // 新输出才有
});

// ---- 普通无状态变化输出仍更新 VisitTurn ----
test('普通无状态变化输出（恒等 ports）仍调用 applyVisitTurns', async () => {
  const identityPorts = makePorts({
    applyModelOutput: (base) => structuredClone(base ?? {}),
  });
  const { calls } = identityPorts;
  const result = await g.replayRegenerationCandidateV1({
    baseline: baseline(),
    candidateText: '无变化',
    request: v2Request(),
    operation: null,
    visitTurns: [visitTurn()],
    attempt: attemptIdentity(),
    settlementKeys: [],
    ports: identityPorts.ports,
  });
  assert.equal(result.ok, true);
  assert.ok(calls.includes('applyVisitTurns'));
  assert.ok(calls.includes('finalizeLifecycle'));
});

// ---- 异变/决斗 operation 只执行一次 ----
test('operation 非 null 时 applyLocalSettlement 恰好调用一次；null 时不调用', async () => {
  const withOp = makePorts();
  await g.replayRegenerationCandidateV1({
    baseline: baseline(),
    candidateText: 'x',
    request: v2Request(),
    operation: { kind: 'duel-victory', settlementId: 's-1' },
    visitTurns: [visitTurn()],
    attempt: attemptIdentity(),
    settlementKeys: [],
    ports: withOp.ports,
  });
  assert.equal(withOp.calls.filter((c) => c.startsWith('applyLocalSettlement')).length, 1);

  const withoutOp = makePorts();
  await g.replayRegenerationCandidateV1({
    baseline: baseline(),
    candidateText: 'x',
    request: v2Request(),
    operation: null,
    visitTurns: [visitTurn()],
    attempt: attemptIdentity(),
    settlementKeys: [],
    ports: withoutOp.ports,
  });
  assert.equal(withoutOp.calls.filter((c) => c.startsWith('applyLocalSettlement')).length, 0);
});

// ---- missing visit fail closed ----
test('applyVisitTurns 失败（visit-missing/visit-conflict）→ 对应错误码，不标 settled', async () => {
  const missing = await run({}, { visitResult: { ok: false, code: 'visit-missing', detail: 'frozen visit 不存在' } }).result;
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'visit-missing');
  assert.equal('candidateData' in missing, false);

  const conflict = await run({}, { visitResult: { ok: false, code: 'visit-conflict' } }).result;
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'visit-conflict');
});

// ---- receipt ----
test('成功输出含 receipt：三阶段 fingerprint 与 settlementKeys 规范化', async () => {
  const { result } = run({ settlementKeys: ['b', 'a', 'b'] });
  const r = await result;
  assert.equal(r.ok, true);
  assert.equal(r.receipt.schema, 'gal-regeneration-commit-receipt.v1');
  assert.equal(r.receipt.requestId, 'gal-req-b3-0001');
  assert.equal(r.receipt.assistantMessageId, 102);
  assert.equal(r.receipt.assistantSwipeId, 1);
  assert.deepEqual(r.receipt.settlementKeys, ['a', 'b']);
  assert.equal(r.candidateData.galGenerationCommitV1.status, 'settled');
});

// ---- 同 commit 重跑逐字节相同 ----
test('同 commit 重跑逐字节相同（含 receipt）', async () => {
  const a = await run().result;
  const b = await run().result;
  assert.deepEqual(a, b);
});
