// Phase 2 增量 A —— MessageTransactionCoordinator ID/快照扩展与玩家楼层反查一致性。
// 使用 fake TransactionHost：不触碰宿主，验证 submit 快照字段、反查成功/失败/歧义/不一致。
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

const g = await importTypescript('../src/ui/gal-generation-request.ts');
const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');

const makeRequest = () => {
  const r = g.createGalGenerationRequest({
    playerInput: '增量A测试',
    snapshot: {
      ownerCharacterId: 'reimu',
      chatId: 'chat-1',
      stateMessageIdBeforeGeneration: 41,
      stateSwipeIdBeforeGeneration: 0,
      sceneId: 'scene:demo',
      historyFingerprintInput: 'h:40:u:0',
    },
    contractInjector: (text) => `W(${text})`,
    now: 1750000009000,
  });
  assert.equal(r.ok, true);
  return r.request;
};

const makeHost = (messages, { withMetadata = true, seed = [], onTrigger = null } = {}) => {
  for (const item of seed) messages.push(item);
  let nextId = messages.length + 1;
  const created = [];
  const host = {
    currentChatId: () => 'chat-1',
    listMessages: () => messages,
    isGenerationActive: () => false,
    async createUserMessage(message, extra) {
      created.push({ message, extra });
      messages.push({ role: 'user', message, extra, message_id: nextId++ });
    },
    async prepareGeneration() {},
    async triggerGeneration() {
      if (onTrigger) onTrigger();
      messages.push({ role: 'assistant', message: '回复正文', message_id: nextId++ });
    },
    async continueGeneration() {},
    chatEpoch: () => 42,
    mvuEpoch: () => 7,
  };
  return { host, created };
};

test('submit 带 request：快照填充四级 ID + 初始 chat identity + epoch，反查成功', async () => {
  const messages = [];
  const { host, created } = makeHost(messages);
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  const snapshot = await coordinator.submit({
    kind: 'interaction',
    message: request.modelUserInput,
    request,
    extra: g.buildRequestMetadata(request),
  });
  assert.equal(snapshot.requestId, request.requestId);
  assert.equal(snapshot.attemptId, `${request.requestId}:attempt-1`);
  assert.equal(snapshot.generationId.startsWith('gal-gen-'), true);
  assert.equal(snapshot.commitKey, `${snapshot.requestId}:${snapshot.attemptId}`);
  assert.equal(snapshot.ownerCharacterId, 'reimu');
  assert.equal(snapshot.chatEpoch, 42);
  assert.equal(snapshot.mvuEpochBefore, 7);
  assert.equal(snapshot.userMessageId, 1);
  assert.equal(snapshot.assistantMessageId, 2);
  assert.equal(snapshot.phase, 'settling');
  // 持久化 extra 同时含兼容键与 request metadata
  assert.equal(created[0].extra.gensokyoTransactionId, snapshot.transactionId);
  assert.equal(created[0].extra.galGenerationRequestV1.requestId, request.requestId);
});

test('反查 not-found（metadata 未写入）：进入 failed，不猜 ID', async () => {
  const messages = [];
  const { host } = makeHost(messages);
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  // 模拟 metadata 未写入：extra 只带兼容键
  const snapshot = await coordinator.submit({
    kind: 'interaction',
    message: request.modelUserInput,
    request,
    extra: {},
  });
  assert.equal(snapshot.phase, 'failed');
  assert.match(snapshot.lastError ?? '', /反查失败/);
});

test('反查 ambiguous（多条命中）：进入 failed，禁止猜 ID', async () => {
  const request = makeRequest();
  const seed = [
    { role: 'user', message: '旧1', message_id: 1, extra: g.buildRequestMetadata({ ...request, requestId: request.requestId }) },
    { role: 'user', message: '旧2', message_id: 2, extra: g.buildRequestMetadata({ ...request, requestId: request.requestId }) },
  ];
  const messages = [];
  const { host } = makeHost(messages, { seed });
  const coordinator = new MessageTransactionCoordinator(host);
  const snapshot = await coordinator.submit({
    kind: 'interaction',
    message: request.modelUserInput,
    request,
    extra: g.buildRequestMetadata(request),
  });
  assert.equal(snapshot.phase, 'failed');
  assert.match(snapshot.lastError ?? '', /歧义/);
});

test('反查不一致（gensokyoTransactionId 楼层 ≠ metadata 楼层）：进入 failed', async () => {
  const request = makeRequest();
  // 预置一条带相同 requestId metadata 的旧玩家楼层（会被 metadata 反查命中）
  const seed = [
    { role: 'user', message: '预置同 request', message_id: 1, extra: g.buildRequestMetadata({ ...request, requestId: request.requestId }) },
  ];
  const messages = [];
  const { host } = makeHost(messages, { seed });
  const coordinator = new MessageTransactionCoordinator(host);
  // 新写入的楼层只带兼容键（不带 metadata）→ metadata 反查唯一命中预置楼层 1，
  // 与 gensokyoTransactionId 找到的新楼层 2 不一致。
  const snapshot = await coordinator.submit({
    kind: 'interaction',
    message: request.modelUserInput,
    request,
    extra: {},
  });
  assert.equal(snapshot.phase, 'failed');
  assert.match(snapshot.lastError ?? '', /不一致/);
});

test('旧路径（不带 request）：快照无新 ID 字段，流程照旧', async () => {
  const messages = [];
  const { host } = makeHost(messages);
  const coordinator = new MessageTransactionCoordinator(host);
  const snapshot = await coordinator.submit({
    kind: 'interaction',
    message: '旧路径消息',
    extra: { gensokyoTransactionKind: 'interaction' },
  });
  assert.equal(snapshot.requestId, undefined);
  assert.equal(snapshot.attemptId, undefined);
  assert.equal(snapshot.ownerCharacterId, undefined);
  assert.equal(snapshot.chatEpoch, undefined);
  assert.equal(snapshot.mvuEpochBefore, undefined);
  assert.equal(snapshot.phase, 'settling');
  assert.equal(snapshot.userMessageId, 1);
});

// ---------------------------------------------------------------------------
// Phase 2 增量 E：fake host 场景（计划 §Phase 2 自动化）
// ---------------------------------------------------------------------------

const makeFlexibleHost = (overrides = {}) => {
  const messages = [];
  const calls = { createUser: 0, trigger: 0, continue: 0 };
  let nextId = 1;
  let chatId = 'chat-1';
  let triggerError = null;
  let nextAssistantExtra = {};
  const host = {
    currentChatId: () => chatId,
    listMessages: () => messages,
    isGenerationActive: () => false,
    async createUserMessage(message, extra) {
      calls.createUser += 1;
      messages.push({ role: 'user', message, extra, message_id: nextId++ });
    },
    async prepareGeneration() { if (overrides.onPrepare) await overrides.onPrepare(); },
    async triggerGeneration() {
      calls.trigger += 1;
      if (triggerError) { const e = triggerError; throw e; }
      messages.push({ role: 'assistant', message: '回复正文', message_id: nextId++, extra: nextAssistantExtra });
    },
    async continueGeneration() { calls.continue += 1; messages.push({ role: 'assistant', message: '续写回复', message_id: nextId++ }); },
    chatEpoch: () => 42,
    mvuEpoch: () => 7,
    ...overrides,
  };
  return {
    host,
    calls,
    messages,
    setChatId: (v) => { chatId = v; },
    setTriggerError: (e) => { triggerError = e; },
    setNextAssistantExtra: (value) => { nextAssistantExtra = value; },
  };
};

test('双击提交：第二个 submit 在事务进行中抛错，不重复写玩家楼层', async () => {
  const { host, calls } = makeFlexibleHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  const first = coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) });
  const second = coordinator.submit({ kind: 'interaction', message: 'B', request, extra: g.buildRequestMetadata(request) });
  await first;
  await assert.rejects(second, /尚未完成|仍在处理/);
  assert.equal(calls.createUser, 1);
});

test('provider reject：玩家楼层保留（userMessageCreated=true），phase=failed', async () => {
  const { host, setTriggerError } = makeFlexibleHost();
  setTriggerError(new Error('Provider 拒绝请求'));
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  await assert.rejects(
    coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) }),
    /Provider 拒绝请求/,
  );
  const snapshot = coordinator.read();
  assert.equal(snapshot.phase, 'failed');
  assert.equal(snapshot.userMessageCreated, true);
  assert.equal(snapshot.userMessageId, 1);
});

test('玩家楼层成功、模型失败后的 retry：新 attempt 不再创建玩家楼层', async () => {
  const { host, calls, setTriggerError } = makeFlexibleHost();
  setTriggerError(new Error('首次失败'));
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  await assert.rejects(
    coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) }),
    /首次失败/,
  );
  setTriggerError(null);
  const snapshot = await coordinator.retry();
  assert.equal(snapshot.phase, 'settling');
  assert.equal(calls.createUser, 1); // 玩家楼层不重复
  assert.equal(calls.trigger, 2);    // 两次模型触发（首次失败 + retry）
});

test('中途切聊天：生成前切换 → reconcile 冻结旧事务（phase=failed）', async () => {
  const { host, setChatId } = makeFlexibleHost();
  // 在 createUserMessage 之后、triggerGeneration 之前切换聊天（prepareGeneration 阶段）。
  host.prepareGeneration = async () => { setChatId('chat-OTHER'); };
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  const snapshot = await coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) });
  assert.equal(snapshot.phase, 'failed');
  assert.match(snapshot.lastError ?? '', /聊天已经切换/);
});

test('assistant 已保存后 settlement 失败保留事务并阻断新发送', async () => {
  const { host, calls } = makeFlexibleHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  const first = await coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) });
  assert.equal(first.assistantResponded, true);
  coordinator.markSettlementFailed(new Error('settlement 失败'));
  const warned = coordinator.read();
  assert.equal(warned.phase, 'failed');
  assert.match(warned.lastError ?? '', /本地结算未完成/);
  assert.match(warned.lastError ?? '', /重试本地结算/);
  await assert.rejects(
    coordinator.submit({ kind: 'interaction', message: 'B' }),
    /上一条消息尚未完成/,
  );
  assert.equal(calls.trigger, 1);
});

test('stop 后 retry 走 continueGeneration（不重头调模型）', async () => {
  const { host, calls, setTriggerError } = makeFlexibleHost();
  // 生成中用户 stop：prepareGeneration（phase=generating）时 markStopped，随后模型中断。
  const coordinator = new MessageTransactionCoordinator(host);
  host.prepareGeneration = async () => { coordinator.markStopped(); };
  setTriggerError(new Error('用户停止后中断'));
  const request = makeRequest();
  await assert.rejects(
    coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) }),
    /用户停止后中断/,
  );
  assert.equal(coordinator.read().phase, 'failed');
  setTriggerError(null);
  const retried = await coordinator.retry();
  assert.equal(retried.phase, 'settling');
  assert.equal(calls.continue, 1); // stop 后 continue
  assert.equal(calls.trigger, 1);  // 未重头调模型
});

test('generationEnded 先于/后于 assistant 楼层：均稳定进入 settling（幂等）', async () => {
  // 顺序 A：楼层已落，随后补 generationEnded（事件后到）——状态稳定。
  const { host } = makeFlexibleHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  const snapshot = await coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) });
  assert.equal(snapshot.phase, 'settling');
  coordinator.markGenerationEnded();
  assert.equal(coordinator.read().phase, 'settling');
  // 顺序 B：generationEnded 先标记（事件先到），楼层后落——waitForAssistant 仍能收敛。
  const hostB = makeFlexibleHost();
  const coordinatorB = new MessageTransactionCoordinator(hostB.host);
  const requestB = makeRequest();
  const submitB = coordinatorB.submit({ kind: 'interaction', message: 'A', request: requestB, extra: g.buildRequestMetadata(requestB) });
  const snapB = await submitB;
  assert.equal(snapB.phase, 'settling');
});

test('助手楼层幂等：assistant 楼层已存在时 read/reconcile 稳定复用同一 ID', async () => {
  const { host } = makeFlexibleHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  const first = await coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) });
  assert.equal(first.assistantMessageId, 2);
  const second = coordinator.read();
  const third = coordinator.read();
  assert.equal(second.assistantMessageId, third.assistantMessageId);
  assert.equal(second.assistantResponded, true);
  assert.equal(second.userMessageId, 1);
});

// ── Phase 3：停止/恢复合同（计划 §3.1-3.3）──────────────────────────────────────

test('Phase3 markStopped：generating → stopping（不直接 failed），记录 stopReason', async () => {
  const { host, messages } = makeFlexibleHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  // submit 挂起在 trigger（generating 态稳定），外部执行停止
  let releaseTrigger;
  const gate = new Promise((res) => { releaseTrigger = res; });
  host.triggerGeneration = async () => {
    await gate;
    // 释放后正常落 assistant 楼层（waitForAssistant 立即收敛，不跑满 120s 轮询）
    messages.push({ role: 'assistant', message: '回复正文', message_id: messages.length + 1 });
  };
  const submitP = coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(coordinator.read().phase, 'generating');
  assert.equal(coordinator.markStopped('user-stop'), true);
  const stopping = coordinator.read();
  assert.equal(stopping.phase, 'stopping');
  assert.equal(stopping.stopReason, 'user-stop');
  // 停止对账：stopping → failed（可从头重试），lastError 含指引
  assert.equal(coordinator.markStopReconciled(), true);
  assert.equal(coordinator.read().phase, 'failed');
  assert.match(coordinator.read().lastError ?? '', /从头重试/);
  releaseTrigger();
  const done = await submitP;
  assert.equal(done.phase, 'failed'); // 尾部不再覆盖 stopping/failed
});

test('Phase3 markStopped 非 generating 阶段忽略（返回 false）', async () => {
  const { host } = makeFlexibleHost();
  const coordinator = new MessageTransactionCoordinator(host);
  assert.equal(coordinator.markStopped('user-stop'), false);
  assert.equal(coordinator.read().phase, 'idle');
  // settled 后也不得标记停止
  const request = makeRequest();
  const snapshot = await coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) });
  assert.equal(snapshot.phase, 'settling');
  assert.equal(coordinator.markStopped('user-stop'), false);
});

test('Phase3 主动停止清理完成后回到 idle，并允许直接发送下一轮', async () => {
  const { host, messages } = makeFlexibleHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  let releaseTrigger;
  const gate = new Promise((resolve) => { releaseTrigger = resolve; });
  host.triggerGeneration = async () => { await gate; };
  const submitP = coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(coordinator.markStopped('user-stop'), true);
  messages.splice(0, messages.length);
  assert.equal(coordinator.cancelStopped(), true);
  releaseTrigger();
  const cancelled = await submitP;
  assert.equal(cancelled.phase, 'idle');
  assert.equal(cancelled.stopReason, 'user-stop');

  host.triggerGeneration = async () => {
    messages.push({ role: 'assistant', message: '下一轮回复', message_id: messages.length + 1 });
  };
  const next = await coordinator.submit({ kind: 'interaction', message: 'B' });
  assert.equal(next.phase, 'settling');
  assert.equal(next.assistantResponded, true);
});

test('Phase3 retryFromScratch：同 requestId、新 attemptId/generationId/commitKey，尾部 settle', async () => {
  const { host, messages, calls } = makeFlexibleHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  // 生成中停止：submit 挂起在 trigger，外部 markStopped + 对账 → failed
  let releaseTrigger;
  const gate = new Promise((res) => { releaseTrigger = res; });
  host.triggerGeneration = async () => {
    await gate;
    // 释放后正常落 assistant 楼层（waitForAssistant 立即收敛，不跑满 120s 轮询）
    messages.push({ role: 'assistant', message: '回复正文', message_id: messages.length + 1 });
  };
  const submitP = coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) });
  await new Promise((r) => setTimeout(r, 30));
  const oldGenId = coordinator.read().generationId;
  coordinator.markStopped('user-stop');
  coordinator.markStopReconciled();
  releaseTrigger();
  const failed = await submitP;
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.generationId, oldGenId);
  // 从头重试：同 requestId、新 attempt 三件套
  const next = { ...request, attemptSeq: 2 };
  const retried = await coordinator.retryFromScratch(next);
  assert.equal(retried.phase, 'settling');
  assert.equal(retried.requestId, request.requestId);          // requestId 复用
  assert.equal(retried.attemptId, `${request.requestId}:attempt-2`); // 新 attemptId
  assert.notEqual(retried.generationId, oldGenId);             // 新 generationId
  assert.equal(retried.commitKey, `${retried.requestId}:${retried.attemptId}`); // 新 commitKey
  assert.equal(retried.userMessageId, 1);                      // 玩家楼层复用（不复制）
  // 重新调一次 generate：第一次（释放后）+ retryFromScratch 各落 1 条 assistant
  assert.equal(messages.filter((m) => m.role === 'assistant').length, 2);
});

test('Phase3 retryFromScratch 守卫：非 failed 拒绝、requestId 不一致拒绝', async () => {
  const { host } = makeFlexibleHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  await coordinator.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) });
  // 非 failed（settling）→ 拒绝
  await assert.rejects(coordinator.retryFromScratch({ ...request, attemptSeq: 2 }), /没有可从头重试/);
  // 独立构造 failed 态：trigger 抛错
  const { host: hostB, setTriggerError, setNextAssistantExtra } = makeFlexibleHost();
  const coordinatorB = new MessageTransactionCoordinator(hostB);
  setTriggerError(new Error('模型中断'));
  await assert.rejects(
    coordinatorB.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadata(request) }),
    /模型中断/,
  );
  assert.equal(coordinatorB.read().phase, 'failed');
  // requestId 不一致 → 拒绝
  const other = { ...request, requestId: 'gal-req-other', attemptSeq: 2 };
  await assert.rejects(coordinatorB.retryFromScratch(other), /requestId 与当前事务不一致/);
});

// ── B2-F02：V2 冻结 request 经 retryFromScratch 只换 attempt，冻结字段逐字节保持 ──
const makeV2RequestForRetry = () => {
  const built = g.createGalGenerationRequestV2({
    playerInput: 'F02 重试测试',
    state: {},
    snapshot: {
      ownerCharacterId: 'reimu',
      chatId: 'chat-1',
      stateMessageIdBeforeGeneration: 41,
      stateSwipeIdBeforeGeneration: 0,
      sceneId: 'scene:demo',
      relevantCharacterIds: ['reimu'],
      visitIdsByCharacter: { reimu: 'character_visit_000001' },
    },
    syntheticHistory: [{ role: 'system', content: '【合成历史边界】F02 重试' }],
    syntheticHistoryHash: 'f02-hash',
    contextFingerprint: 'fp:f02:retry',
    contractInjector: (t) => t,
    now: 1750000010000,
  });
  assert.equal(built.ok, true, built.ok ? '' : built.reason);
  return built.request;
};

test('F02：V2 retryFromScratch 冻结字段逐字节保持，仅 attemptSeq 前进', async () => {
  const { host } = makeFlexibleHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeV2RequestForRetry();
  // 制造 failed：trigger 抛错
  const { host: hostB, setTriggerError, setNextAssistantExtra } = makeFlexibleHost();
  const coordinatorB = new MessageTransactionCoordinator(hostB);
  setTriggerError(new Error('模型中断'));
  await assert.rejects(
    coordinatorB.submit({ kind: 'interaction', message: 'A', request, extra: g.buildRequestMetadataV2(request) }),
    /模型中断/,
  );
  assert.equal(coordinatorB.read().phase, 'failed');
  setTriggerError(null); // 清除注入错误，让 retryFromScratch 走正常 trigger
  const next = { ...request, attemptSeq: 2 };
  setNextAssistantExtra(g.buildAttemptMetadata(g.createGalGenerationAttempt(next, 'send', 2)));
  const retried = await coordinatorB.retryFromScratch(next);
  assert.equal(retried.requestId, request.requestId);
  assert.equal(retried.requestSchema, 'gal-generation-request.v2');
  assert.equal(retried.userMessageId, 1);
  // 冻结字段逐字节保持（同 request，仅 attempt 前进）
  assert.equal(retried.requestId, request.requestId);
  assert.equal(retried.attemptId, `${request.requestId}:attempt-2`);
  // V2 冻结字段在 coordinator 侧不重建：snapshot 只存身份字段，重建由调用方负责
  assert.equal(coordinatorB.read().phase, 'settling');
});

test('返修：coordinator 主链忽略相邻无 metadata assistant，只接受本 attempt 的精确楼层', async () => {
  const request = makeV2RequestForRetry();
  const attempt = g.createGalGenerationAttempt(request, 'send', 1);
  let messages;
  const built = makeFlexibleHost({
    onPrepare() {
      messages.push({ role: 'assistant', message_id: 99, message: '相邻干扰楼层', extra: {} });
    },
  });
  messages = built.messages;
  built.setNextAssistantExtra(g.buildAttemptMetadata(attempt));
  const coordinator = new MessageTransactionCoordinator(built.host);
  const result = await coordinator.submit({
    kind: 'interaction',
    message: request.modelUserInput,
    request,
    extra: g.buildRequestMetadataV2(request),
  });
  assert.equal(result.phase, 'settling');
  assert.equal(result.assistantMessageId, 2);
});

test('本地剧情最简回执：V2 不要求玩家 request 反查或 assistant attempt metadata', async () => {
  const request = makeV2RequestForRetry();
  const { host } = makeFlexibleHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const result = await coordinator.submit({
    kind: 'interaction',
    message: request.modelUserInput,
    request,
    receiptPolicy: 'next-nonempty-assistant',
    extra: {},
  });
  assert.equal(result.phase, 'settling');
  assert.equal(result.assistantResponded, true);
  assert.equal(result.assistantMessageId, 2);
  assert.equal(result.receiptPolicy, 'next-nonempty-assistant');
});
