// 第三批 B3-T08 —— 可控 host 的 coordinator 骨架（fake ports）。
// 覆盖 runbook T08 fake ports 注入矩阵与必测结果：
//   - 完整成功：writer/finalizer 各一次、message count 不变、无 user 新增、settled；
//   - 同 commit 重试不追加（commit fence）；
//   - 生成失败/stopped/empty/tool-call 不调 writer；
//   - 生成期间切 chat / 切 source swipe / 新增楼层 → 写前硬门冲突；
//   - 写前 fingerprint 变化 → target-changed；
//   - 写入成功但复读数组损坏 / active metadata 错 → 写后验证失败；
//   - MVU parser 抛错 / settlement 抛错 → port-failed；
//   - reload 在 candidate_ready / committing_swipe / verifying → resume 不重新生成、writer 最多一次；
//   - 生成成功但写失败缓存 → 可只重试提交。
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

const g = await importTypescript('../src/ui/gal-regeneration-coordinator.ts');
const req = await importTypescript('../src/ui/gal-generation-request.ts');

const attemptMeta = (seq, overrides = {}) => req.buildAttemptMetadata({
  schema: 'gal-generation-attempt.v1',
  requestId: 'gal-req-b3-0001',
  attemptId: `gal-req-b3-0001:attempt-${seq}`,
  generationId: `gal-gen-${seq}`,
  mode: seq === 1 ? 'send' : 'regenerate',
  chatId: 'chat-b3-1',
  ownerCharacterId: 'reimu',
  assistantMessageId: 102,
  baseSwipeId: seq - 1,
  commitKey: `gal-req-b3-0001:gal-req-b3-0001:attempt-${seq}`,
  createdAt: '2026-08-09T00:00:00.000Z',
  ...overrides,
});

const playerFloor = () => ({
  role: 'user',
  message_id: 101,
  extra: req.buildRequestMetadataV2({
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
  }),
});

const assistantFloor = () => ({ role: 'assistant', message_id: 102 });

const baseline = () => ({
  stat_data: { day: 1, player: { money: 100 } },
  schema: 'gal-mvu.v1',
  lifecycle: { status: 'settled', commitKey: 'gal-req-b3-0001:gal-req-b3-0001:attempt-1' },
  initialized_lorebooks: ['core'],
});

const assistantView = () => ({
  message_id: 102,
  swipe_id: 0,
  swipes: ['旧回复'],
  swipes_data: [baseline()],
  swipes_info: [{ extra: attemptMeta(1) }],
});

const candidateData = (text = '新候选回复') => ({
  stat_data: { day: 2, player: { money: 150 } },
  schema: 'gal-mvu.v1',
  galGenerationCommitV1: {
    schema: 'gal-generation-commit.v1', status: 'settled', requestId: 'gal-req-b3-0001',
    attemptId: 'gal-req-b3-0001:attempt-2', commitKey: 'gal-req-b3-0001:gal-req-b3-0001:attempt-2',
  },
  presence: [text.slice(0, 5)],
});

const makeReplayPorts = (overrides = {}) => ({
  async applyModelOutput(base, text) {
    if (overrides.modelError) throw new Error('model parser 抛错');
    return { ...structuredClone(base ?? {}), stat_data: { day: 2, player: { money: 150 } } };
  },
  restoreLocalEventOwnership(base, parsed) {
    return { ...structuredClone(parsed) };
  },
  applyLocalSettlement(state, operation) {
    if (overrides.settlementError) throw new Error('settlement 抛错');
    return { ...structuredClone(state) };
  },
  applyPresenceAnalysis(state, text) {
    return { ...structuredClone(state), presence: [text.slice(0, 5)] };
  },
  reconcileM2Runtime(state) {
    return { ...structuredClone(state) };
  },
  applyVisitTurns(state, turns) {
    return { ok: true, state: {
      ...structuredClone(state), visitTurn: turns[0]?.turnId ?? null,
      __attempt: turns[0] ? { attemptId: turns[0].attemptId, commitKey: turns[0].commitKey } : null,
    } };
  },
  finalizeLifecycle(state) {
    const audit = state.__attempt ?? {};
    return { ...structuredClone(state), galGenerationCommitV1: {
      schema: 'gal-generation-commit.v1', status: 'settled', requestId: 'gal-req-b3-0001',
      attemptId: audit.attemptId, commitKey: audit.commitKey,
    } };
  },
});

/** fake host：可注入全部 13 种场景。 */
const makeHost = (opts = {}) => {
  const h = {
    writeCalls: 0,
    commitCalls: 0,
    genCalls: 0,
    hostCtxCalls: 0,
    persisted: null,
    persistHistory: [],
    chatId: opts.chatId ?? 'chat-b3-1',
    ownerCharacterId: opts.ownerCharacterId ?? 'reimu',
    messages: opts.messages ?? [playerFloor(), assistantFloor()],
    messageTotal: opts.messageTotal ?? 2,
    assistantView: opts.assistantView ?? assistantView(),
    afterView: null,
    activeView: null,
    generateOutcome: opts.generateOutcome ?? { ok: true, text: '新候选回复' },
    writeOutcome: opts.writeOutcome ?? { ok: true },
    driftKind: opts.driftKind ?? 'clean',
    loadedState: opts.loadedState ?? null,
    ctxAfterGenerate: opts.ctxAfterGenerate ?? null,
    readAssistantAfterWrite: opts.readAssistantAfterWrite ?? null,
    readActiveOverride: opts.readActiveOverride ?? null,
    replayOverrides: opts.replayOverrides ?? {},
    baselineOverride: opts.baselineOverride ?? null,
    onGenerate: opts.onGenerate ?? null,
    operation: opts.operation ?? null,
    generateError: opts.generateError ?? null,
    generatePromise: opts.generatePromise ?? null,
    persistThrowOnPhaseOnce: opts.persistThrowOnPhaseOnce ?? null,
  };
  // onGenerate 接收 fake host 的 h（避免闭包捕获测试作用域未初始化的变量）
  if (opts.onGenerate) {
    const fn = opts.onGenerate;
    h.onGenerate = () => fn(h);
  }
  const ports = {
    async readHostContext() {
      h.hostCtxCalls += 1;
      if (h.hostCtxCalls > 1 && h.ctxAfterGenerate) {
        return {
          chatId: h.ctxAfterGenerate.chatId ?? h.chatId,
          ownerCharacterId: h.ctxAfterGenerate.ownerCharacterId ?? h.ownerCharacterId,
          messages: h.ctxAfterGenerate.messages ?? h.messages,
          messageTotal: h.ctxAfterGenerate.messageTotal ?? h.messageTotal,
        };
      }
      return { chatId: h.chatId, ownerCharacterId: h.ownerCharacterId, messages: h.messages, messageTotal: h.messageTotal };
    },
    async readAssistantView(messageId) {
      if (h.writeCalls === 0) return h.assistantView;
      if (h.readAssistantAfterWrite) return h.readAssistantAfterWrite;
      return h.afterView;
    },
    async readActiveView() {
      if (h.readActiveOverride) return h.readActiveOverride;
      return h.activeView;
    },
    async readBaseline() {
      if (h.baselineOverride) return h.baselineOverride;
      return { ok: true, baseline: baseline() };
    },
    async readDrift() {
      return { kind: h.driftKind };
    },
    async readOperation() {
      return h.operation;
    },
    async buildVisitTurns({ target, attemptId, commitKey, candidateText }) {
      return [{
        turnId: `${target.requestId}:reimu`,
        summary: candidateText,
        assistantMessageId: target.assistantMessageId,
        assistantSwipeId: target.candidateSwipeId,
        attemptId,
        commitKey,
        characterId: 'reimu',
        gameDay: null,
      }];
    },
    async generateCandidate() {
      h.genCalls += 1;
      if (h.onGenerate) h.onGenerate();
      if (h.generateError) throw h.generateError;
      if (h.generatePromise) return h.generatePromise;
      return h.generateOutcome;
    },
    async writeSwipe(plan) {
      h.writeCalls += 1;
      if (!h.writeOutcome.ok) return h.writeOutcome;
      h.afterView = {
        message_id: plan.messageId,
        swipe_id: plan.swipe_id,
        swipes: [...plan.swipes],
        swipes_data: plan.swipes_data.map((d) => structuredClone(d)),
        swipes_info: plan.swipes_info.map((i) => structuredClone(i)),
      };
      h.activeView = {
        message_id: plan.messageId,
        swipe_id: plan.swipe_id,
        message: plan.swipes[plan.candidateSwipeId],
        extra: plan.swipes_info[plan.candidateSwipeId].extra,
      };
      return { ok: true };
    },
    async stopCandidate() {
      return true;
    },
    async readActiveData() {
      const activeSwipe = h.activeView?.swipe_id;
      if (Number.isInteger(activeSwipe) && h.afterView?.swipes_data?.[activeSwipe]) {
        return structuredClone(h.afterView.swipes_data[activeSwipe]);
      }
      return structuredClone(h.assistantView.swipes_data[h.assistantView.swipe_id]);
    },
    async commitReceipt() {
      h.commitCalls += 1;
      return { ok: true };
    },
    replay: makeReplayPorts(h.replayOverrides),
    async persist(state) {
      if (h.persistThrowOnPhaseOnce === state.phase) {
        h.persistThrowOnPhaseOnce = null;
        throw new Error(`simulated crash before persisting ${state.phase}`);
      }
      h.persisted = state;
      h.persistHistory.push(structuredClone(state));
    },
    async load() {
      return h.loadedState;
    },
  };
  return { h, ports };
};

const run = async (opts = {}) => {
  const { h, ports } = makeHost(opts);
  const result = await new g.GalRegenerationCoordinatorV1(ports).run();
  return { h, ports, result };
};

// ---- 完整成功 ----
test('完整成功：writer/finalizer 各一次、message count 不变、无 user 新增、settled', async () => {
  const { h, result } = await run();
  assert.equal(result.ok, true);
  assert.equal(result.alreadyDone, false);
  assert.equal(result.receipt.schema, 'gal-regeneration-commit-receipt.v1');
  assert.equal(h.writeCalls, 1);
  assert.equal(h.commitCalls, 1);
  assert.equal(h.genCalls, 1);
  assert.equal(h.persisted.phase, 'settled');
  // message count 不变、无 user 新增：fake host 的 messages 从未被修改（writeSwipe 只改 swipe 数组）
  assert.equal(h.messages.length, 2);
  assert.equal(h.messages.filter((m) => m.role === 'user').length, 1);
});

// ---- 同 commit 重试不追加 ----
test('settled 后再次显式点击：创建下一 attempt，不被旧 sessionStorage 永久锁死', async () => {
  const first = await run();
  assert.equal(first.result.ok, true);
  const stored = first.h.persisted;
  const second = await run({ loadedState: stored, assistantView: first.h.afterView });
  assert.equal(second.result.ok, true);
  assert.equal(second.result.alreadyDone, false);
  assert.equal(second.h.writeCalls, 1);
  assert.equal(second.h.genCalls, 1);
  assert.equal(second.h.commitCalls, 1);
  assert.equal(second.h.afterView.swipes.length, 3);
});

// ---- 生成失败不调 writer ----
test('候选生成 empty/tool-call：不调 writer，失败', async () => {
  for (const code of ['empty', 'tool-call']) {
    const { h, result } = await run({ generateOutcome: { ok: false, code } });
    assert.equal(result.ok, false, code);
    assert.equal(h.writeCalls, 0, code);
    assert.equal(h.commitCalls, 0, code);
  }
});

test('stop：生成被停止 → failed_recoverable，不调 writer', async () => {
  const { h, result } = await run({ generateOutcome: { ok: false, code: 'stopped' } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'candidate-write-conflict');
  assert.equal(h.writeCalls, 0);
  assert.equal(h.persisted.phase, 'failed_recoverable');
});

// ---- 生成期间切 chat ----
test('生成期间切 chat → chat-identity-changed，不写', async () => {
  const { h, result } = await run({ ctxAfterGenerate: { chatId: 'chat-other' } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'chat-identity-changed');
  assert.equal(h.writeCalls, 0);
});

// ---- 生成期间新增楼层 ----
test('生成期间新增楼层（message total 变化）→ unexpected-floor-created，不写', async () => {
  const extraFloor = { role: 'user', message_id: 104 };
  const { h, result } = await run({
    ctxAfterGenerate: { messageTotal: 3, messages: [...[playerFloor(), assistantFloor()], extraFloor] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unexpected-floor-created');
  assert.equal(h.writeCalls, 0);
});

// ---- 写前 fingerprint 变化（切 source swipe） ----
test('生成期间切 source swipe（写前 fingerprint 变化）→ target-changed，不写', async () => {
  const { h, result } = await run({
    onGenerate(h) {
      // 生成成功后、写前：目标数组被改（source swipe 切换）
      h.assistantView = {
        ...h.assistantView,
        swipe_id: 0,
        swipes: ['旧回复', '另一个 swipe'],
        swipes_data: [h.assistantView.swipes_data[0], { stat_data: { day: 9 } }],
        swipes_info: [h.assistantView.swipes_info[0], { extra: attemptMeta(1) }],
      };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'target-changed');
  assert.equal(h.writeCalls, 0);
});

// ---- 写入成功但复读数组损坏 ----
test('写入成功但复读数组损坏 → candidate-verification-failed，不 settled', async () => {
  const { h, result } = await run({
    readAssistantAfterWrite: {
      message_id: 102,
      swipe_id: 1,
      swipes: ['旧回复', '新候选回复', '多余'],
      swipes_data: [{}, {}, {}],
      swipes_info: [{}, {}, {}],
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'malformed-swipe-arrays');
  assert.equal(h.persisted.phase, 'failed_recoverable');
});

// ---- 写入成功但 active metadata 错 ----
test('写入成功但 active metadata 错 → candidate-verification-failed', async () => {
  const { result } = await run({
    readActiveOverride: { message_id: 102, swipe_id: 1, message: '新候选回复', extra: { wrong: true } },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'candidate-verification-failed');
});

// ---- MVU parser 抛错 ----
test('MVU parser（applyModelOutput）抛错 → port-failed → candidate-verification-failed，不写', async () => {
  const { h, result } = await run({ replayOverrides: { modelError: true } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'candidate-verification-failed');
  assert.equal(h.writeCalls, 0);
});

// ---- settlement 抛错 ----
test('settlement（applyLocalSettlement）抛错 → candidate-verification-failed，不写', async () => {
  const { h, result } = await run({
    operation: { kind: 'anomaly-resolution', operationId: 'op-1' },
    replayOverrides: { settlementError: true },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'candidate-verification-failed');
  assert.equal(h.writeCalls, 0);
});

// ---- 生成成功但写失败缓存，可只重试提交 ----
test('生成成功但写失败：缓存 candidate_ready，可只重试提交不再次调模型', async () => {
  const { h, result } = await run({ writeOutcome: { ok: false, code: 'write-failed' } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'candidate-write-conflict');
  assert.equal(result.retryable, true);
  assert.equal(h.persisted.phase, 'candidate_ready');
  assert.equal(h.persisted.candidateText, '新候选回复');
  assert.equal(h.genCalls, 1);
  // 重试：load 返回 candidate_ready 缓存，resume 只重试提交
  const retry = await run({ loadedState: h.persisted, writeOutcome: { ok: true } });
  assert.equal(retry.result.ok, true, JSON.stringify(retry.result));
  assert.equal(retry.result.resumed, true);
  assert.equal(retry.h.genCalls, 0); // 不再调模型
  assert.equal(retry.h.writeCalls, 1); // writer 只再写一次
  assert.equal(retry.h.commitCalls, 1);
});

// ---- reload 在 candidate_ready ----
test('reload 在 candidate_ready：resume 只重试提交，不重新生成', async () => {
  const first = await run({ writeOutcome: { ok: false, code: 'write-failed' } });
  const stored = first.h.persisted;
  assert.equal(stored.phase, 'candidate_ready');
  const reloaded = await run({ loadedState: stored, writeOutcome: { ok: true } });
  assert.equal(reloaded.result.ok, true, JSON.stringify(reloaded.result));
  assert.equal(reloaded.h.genCalls, 0);
  assert.equal(reloaded.h.writeCalls, 1);
});

// ---- reload 在 committing_swipe ----
test('reload 在 committing_swipe：resume 继续提交并验证，不重新生成', async () => {
  const first = await run({ writeOutcome: { ok: false, code: 'write-failed' } });
  const stored = { ...first.h.persisted, phase: 'committing_swipe' };
  const reloaded = await run({ loadedState: stored, writeOutcome: { ok: true } });
  assert.equal(reloaded.result.ok, true, JSON.stringify(reloaded.result));
  assert.equal(reloaded.h.genCalls, 0);
  assert.equal(reloaded.h.writeCalls, 1);
});

// ---- reload 在 verifying ----
test('reload 在 verifying：已写入只重读验证，writer 不再调用', async () => {
  const first = await run();
  assert.equal(first.result.ok, true);
  const stored = { ...first.h.persisted, phase: 'verifying' };
  // afterView 已由第一次写入产生；fake host 需要保留 afterView
  const { h, ports } = makeHost({ loadedState: stored });
  h.afterView = first.h.afterView;
  h.activeView = first.h.activeView;
  h.writeCalls = 1; // 第一次已写
  const result = await new g.GalRegenerationCoordinatorV1(ports).run();
  assert.equal(result.ok, true);
  assert.equal(result.resumed, true);
  assert.equal(h.writeCalls, 1); // 不再写
  assert.equal(h.commitCalls, 1);
  assert.equal(h.genCalls, 0);
});

test('真实 candidate_ready 断点缺 candidateData：reload 只本地重放，不再次 generate', async () => {
  const first = await run();
  const stored = first.h.persistHistory.find((state) => state.phase === 'candidate_ready' && state.candidateData === null);
  assert.ok(stored);
  const reloaded = await run({ loadedState: stored });
  assert.equal(reloaded.result.ok, true, JSON.stringify(reloaded.result));
  assert.equal(reloaded.h.genCalls, 0);
  assert.equal(reloaded.h.writeCalls, 1);
});

test('writer 成功后、verifying 持久化前崩溃：reload 识别已写 swipe，不重复 append', async () => {
  const firstHost = makeHost({ persistThrowOnPhaseOnce: 'verifying' });
  await assert.rejects(
    new g.GalRegenerationCoordinatorV1(firstHost.ports).run(),
    /simulated crash/,
  );
  assert.equal(firstHost.h.writeCalls, 1);
  assert.equal(firstHost.h.persisted.phase, 'committing_swipe');

  const resumed = makeHost({ loadedState: firstHost.h.persisted });
  resumed.h.afterView = firstHost.h.afterView;
  resumed.h.activeView = firstHost.h.activeView;
  resumed.h.writeCalls = 1;
  const result = await new g.GalRegenerationCoordinatorV1(resumed.ports).run();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(resumed.h.writeCalls, 1);
  assert.equal(resumed.h.commitCalls, 1);
});

test('provider reject：收敛为 failed_recoverable，不调用 writer', async () => {
  const { h, result } = await run({ generateError: new Error('provider rejected') });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'candidate-verification-failed');
  assert.equal(h.persisted.phase, 'failed_recoverable');
  assert.equal(h.writeCalls, 0);
  const retried = await run({ loadedState: h.persisted });
  assert.equal(retried.result.ok, true, JSON.stringify(retried.result));
  assert.equal(retried.h.persisted.attemptId, 'gal-req-b3-0001:attempt-3');
});

test('停止后迟到 resolve：丢弃文本，不调用 writer', async () => {
  let resolveGenerate;
  const generatePromise = new Promise((resolve) => { resolveGenerate = resolve; });
  const { h, ports } = makeHost({ generatePromise });
  const coordinator = new g.GalRegenerationCoordinatorV1(ports);
  const pending = coordinator.run();
  while (h.genCalls === 0) await Promise.resolve();
  assert.equal(await coordinator.stop(), true);
  resolveGenerate({ ok: true, text: '迟到回复' });
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(h.writeCalls, 0);
  assert.equal(h.persisted.phase, 'failed_recoverable');
});

// ---- 失败不调用 writer（汇总） ----
test('所有失败路径不调用 writer（drift/冲突汇总）', async () => {
  const cases = [
    { driftKind: 'post-settlement-drift' },
    { driftKind: 'needs-legacy-replay' },
    { driftKind: 'receipt-mismatch', },
  ];
  for (const opts of cases) {
    const { h, result } = await run(opts);
    assert.equal(result.ok, false);
    assert.equal(h.writeCalls, 0);
    assert.equal(h.commitCalls, 0);
  }
});

test('drift post-settlement-drift → conflict_manual，错误码 post-settlement-drift', async () => {
  const { result } = await run({ driftKind: 'post-settlement-drift' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'post-settlement-drift');
});

test('drift needs-legacy-replay → conflict_manual（legacy-replay-mismatch，首版不自动补）', async () => {
  const { result } = await run({ driftKind: 'needs-legacy-replay' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'legacy-replay-mismatch');
});

// ---- locating 失败 ----
test('最后一楼不是 assistant → not-latest-assistant', async () => {
  const { h, result } = await run({ messages: [playerFloor(), { role: 'user', message_id: 103 }], messageTotal: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'not-latest-assistant');
  assert.equal(h.persisted.phase, 'conflict_manual');
});
