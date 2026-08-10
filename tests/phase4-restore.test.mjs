// Phase 4 —— 重载恢复（计划 §4.2）：analyzeChatRestore 纯函数 + coordinator.restoreFromChat。
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

const IDENTITY = { ownerCharacterId: 'reimu', chatId: 'chat-1' };

const makeRequest = () => {
  const r = g.createGalGenerationRequest({
    playerInput: '恢复测试',
    contractInjector: (t) => t,
    snapshot: {
      ownerCharacterId: 'reimu',
      chatId: 'chat-1',
      stateMessageIdBeforeGeneration: 40,
      stateSwipeIdBeforeGeneration: 0,
      sceneId: 'scene:demo',
      historyFingerprintInput: 'h:40:u:0',
    },
  });
  return r.request;
};

const makePlayerFloor = (request, messageId) => ({
  role: 'user',
  is_user: true,
  message_id: messageId,
  extra: g.buildRequestMetadata(request),
});

const makeAttempt = (request, seq) => g.createGalGenerationAttempt(request, 'send', seq);

const makeCommitFloor = (request, seq, messageId, status = 'settled') => {
  const attempt = makeAttempt(request, seq);
  return {
    role: 'assistant',
    message_id: messageId,
    message: '回复正文',
    extra: g.buildAttemptMetadata(attempt),
    data: { [g.COMMIT_LIFECYCLE_KEY]: g.buildCommitLifecycle(attempt, status) },
  };
};

// ── analyzeChatRestore ────────────────────────────────────────────────────────

test('restore none：无 request metadata 玩家楼层 → 正常开放发送', () => {
  const messages = [
    { role: 'user', is_user: true, message_id: 1, extra: { gensokyoTransactionId: 'x' } },
    { role: 'assistant', message_id: 2, message: '旧回复' },
  ];
  assert.deepEqual(g.analyzeChatRestore(messages, IDENTITY), { kind: 'none' });
});

test('restore incomplete：玩家有、commit 无 → 未完成/状态未知（禁止自动重发）', () => {
  const request = makeRequest();
  const messages = [
    { role: 'user', is_user: true, message_id: 1, extra: {} },
    makePlayerFloor(request, 2),
  ];
  const result = g.analyzeChatRestore(messages, IDENTITY);
  assert.equal(result.kind, 'incomplete');
  if (result.kind === 'incomplete') {
    assert.equal(result.userMessageId, 2);
    assert.equal(result.request.requestId, request.requestId);
  }
});

test('restore confirmed：玩家 + 精确 commit → 恢复 settled 依据', () => {
  const request = makeRequest();
  const messages = [
    { role: 'user', is_user: true, message_id: 1, extra: {} },
    makePlayerFloor(request, 2),
    makeCommitFloor(request, 1, 3),
  ];
  const result = g.analyzeChatRestore(messages, IDENTITY);
  assert.equal(result.kind, 'confirmed');
  if (result.kind === 'confirmed') {
    assert.equal(result.userMessageId, 2);
    assert.equal(result.assistantMessageId, 3);
    assert.equal(result.attempt.attemptId, `${request.requestId}:attempt-1`);
    assert.equal(result.request.requestId, request.requestId);
  }
});

test('restore settlement-pending：assistant 已落楼但没有 settled 证据时禁止假完成', () => {
  const request = makeRequest();
  const result = g.analyzeChatRestore([
    makePlayerFloor(request, 2),
    makeCommitFloor(request, 1, 3, 'pending'),
  ], IDENTITY);
  assert.equal(result.kind, 'settlement-pending');
  if (result.kind === 'settlement-pending') assert.equal(result.assistantMessageId, 3);
});

test('restore malformed：最新玩家楼层带损坏 metadata 时进入冲突态', () => {
  const result = g.analyzeChatRestore([{
    role: 'user',
    is_user: true,
    message_id: 2,
    extra: { galGenerationRequestV1: { schema: 'gal-generation-request.v1', requestId: 'broken' } },
  }], IDENTITY);
  assert.deepEqual(result, { kind: 'conflict', reason: 'malformed' });
});

test('restore conflict：多条 commit → 人工确认', () => {
  const request = makeRequest();
  const messages = [
    makePlayerFloor(request, 2),
    makeCommitFloor(request, 1, 3),
    makeCommitFloor(request, 2, 4),
  ];
  const result = g.analyzeChatRestore(messages, IDENTITY);
  assert.deepEqual(result, { kind: 'conflict', reason: 'multiple-commits' });
});

test('restore 绑定：chatId/ownerCharacterId 不匹配不算本会话请求（none）', () => {
  const request = makeRequest();
  const messages = [makePlayerFloor(request, 2)];
  assert.equal(g.analyzeChatRestore(messages, { ownerCharacterId: 'reimu', chatId: 'chat-other' }).kind, 'none');
  assert.equal(g.analyzeChatRestore(messages, { ownerCharacterId: 'marisa', chatId: 'chat-1' }).kind, 'none');
});

test('restore 只认最新玩家楼层（旧请求残留不干扰）', () => {
  const oldRequest = makeRequest();
  const newRequest = { ...makeRequest(), requestId: 'gal-req-newer' };
  const messages = [
    makePlayerFloor(oldRequest, 2),
    makeCommitFloor(oldRequest, 1, 3),
    makePlayerFloor(newRequest, 4),
    makeCommitFloor(newRequest, 1, 5),
  ];
  const result = g.analyzeChatRestore(messages, IDENTITY);
  assert.equal(result.kind, 'confirmed');
  if (result.kind === 'confirmed') {
    assert.equal(result.request.requestId, 'gal-req-newer');
    assert.equal(result.userMessageId, 4);
    assert.equal(result.assistantMessageId, 5);
  }
});

// ── coordinator.restoreFromChat ───────────────────────────────────────────────

const makeHost = () => {
  const messages = [];
  return {
    host: {
      currentChatId: () => 'chat-1',
      listMessages: () => messages,
      isGenerationActive: () => false,
      async createUserMessage() {},
      async triggerGeneration() {},
      async continueGeneration() {},
      chatEpoch: () => 42,
      mvuEpoch: () => 7,
    },
    messages,
  };
};

test('restoreFromChat incomplete：failed + recovery 标记 + userMessageId，禁止重发', async () => {
  const { host } = makeHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  const changed = coordinator.restoreFromChat({
    kind: 'incomplete',
    request,
    userMessageId: 2,
  });
  assert.equal(changed, true);
  const s = coordinator.read();
  assert.equal(s.phase, 'failed');
  assert.equal(s.recovery, 'incomplete');
  assert.equal(s.userMessageCreated, true);
  assert.equal(s.userMessageId, 2);
  assert.match(s.lastError ?? '', /禁止自动重发/);
  await assert.rejects(coordinator.retry(), /禁止自动重发/);
});

test('restoreFromChat confirmed：settled + recovery 标记 + assistant 标识', () => {
  const { host } = makeHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  const changed = coordinator.restoreFromChat({
    kind: 'confirmed',
    request,
    userMessageId: 2,
    assistantMessageId: 3,
    attempt: { attemptId: `${request.requestId}:attempt-1`, generationId: 'gal-gen-r1', commitKey: `k:${request.requestId}` },
  });
  assert.equal(changed, true);
  const s = coordinator.read();
  assert.equal(s.phase, 'settled');
  assert.equal(s.recovery, 'confirmed');
  assert.equal(s.assistantResponded, true);
  assert.equal(s.assistantMessageId, 3);
  assert.equal(s.generationId, 'gal-gen-r1');
});

test('restoreFromChat settlement-pending：保留 assistant 并开放下一轮发送', () => {
  const { host } = makeHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  const changed = coordinator.restoreFromChat({
    kind: 'settlement-pending',
    request,
    userMessageId: 2,
    assistantMessageId: 3,
    attempt: {
      attemptId: `${request.requestId}:attempt-1`,
      generationId: 'gal-gen-r1',
      commitKey: `${request.requestId}:${request.requestId}:attempt-1`,
    },
  });
  assert.equal(changed, true);
  const snapshot = coordinator.read();
  assert.equal(snapshot.phase, 'settled');
  assert.equal(snapshot.recovery, 'settlement');
  assert.equal(snapshot.assistantResponded, true);
  assert.match(snapshot.lastError ?? '', /可以继续发送/);
});

test('resetForChatChange 清除旧会话恢复锁', () => {
  const { host } = makeHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  coordinator.restoreFromChat({ kind: 'incomplete', request, userMessageId: 2 });
  assert.equal(coordinator.read().phase, 'failed');
  coordinator.resetForChatChange();
  assert.equal(coordinator.read().phase, 'idle');
  assert.equal(coordinator.read().recovery, undefined);
});

test('restoreFromChat conflict：failed + recovery 标记', async () => {
  const { host } = makeHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const changed = coordinator.restoreFromChat({ kind: 'conflict', reason: 'multiple-commits' });
  assert.equal(changed, true);
  const s = coordinator.read();
  assert.equal(s.phase, 'failed');
  assert.equal(s.recovery, 'conflict');
  assert.match(s.lastError ?? '', /人工确认/);
  await assert.rejects(coordinator.retry(), /禁止自动重发/);
});

test('restoreFromChat none：不动（返回 false，保持 idle）', () => {
  const { host } = makeHost();
  const coordinator = new MessageTransactionCoordinator(host);
  assert.equal(coordinator.restoreFromChat({ kind: 'none' }), false);
  assert.equal(coordinator.read().phase, 'idle');
});

test('恢复后 send 不受影响（恢复态不阻塞新事务：先 reset 再 submit）', async () => {
  const { host, messages } = makeHost();
  const coordinator = new MessageTransactionCoordinator(host);
  const request = makeRequest();
  coordinator.restoreFromChat({ kind: 'incomplete', request, userMessageId: 2 });
  // 用户手动清理后新发送：submit 要求 idle/settled——恢复态需先 reset（app 层用户操作）。
  coordinator.resetAfterLocalEnd();
  assert.equal(coordinator.read().phase, 'idle');
});

// ── B2-F01：analyzeChatRestore 兼容 V1/V2（F-A 返修）────────────────────────
const makeV2Request = () => {
  const built = g.createGalGenerationRequestV2({
    playerInput: 'V2 恢复测试',
    state: {},
    snapshot: {
      ownerCharacterId: 'reimu',
      chatId: 'chat-1',
      stateMessageIdBeforeGeneration: 40,
      stateSwipeIdBeforeGeneration: 0,
      sceneId: 'scene:demo',
      relevantCharacterIds: ['reimu'],
      visitIdsByCharacter: { reimu: 'character_visit_000001' },
    },
    syntheticHistory: [{ role: 'system', content: '【合成历史边界】V2 恢复测试' }],
    syntheticHistoryHash: 'f01-test-hash',
    contextFingerprint: 'fp:f01:restore',
    characterContext: { mainTargetCharacterId: 'reimu', requireMainTarget: true },
    characterNames: { reimu: '博丽灵梦' },
    contractInjector: (t) => t,
  });
  assert.equal(built.ok, true, built.ok ? '' : built.reason);
  return built.request;
};

const makeV2PlayerFloor = (request, messageId) => ({
  role: 'user',
  is_user: true,
  message_id: messageId,
  extra: g.buildRequestMetadataV2(request),
});

test('F01：V2 玩家楼层经 analyzeChatRestore 恢复为 v2 request，冻结字段逐字节保持', () => {
  const request = makeV2Request();
  const messages = [makeV2PlayerFloor(request, 41)];
  const result = g.analyzeChatRestore(messages, IDENTITY);
  assert.equal(result.kind, 'incomplete');
  if (result.kind !== 'incomplete') return;
  assert.equal(result.request.schema, 'gal-generation-request.v2');
  assert.equal(result.request.requestId, request.requestId);
  assert.deepEqual(result.request.syntheticHistory, request.syntheticHistory);
  assert.deepEqual(result.request.visitIdsByCharacter, request.visitIdsByCharacter);
  assert.equal(result.request.contextFingerprint, request.contextFingerprint);
  assert.equal(result.request.syntheticHistoryHash, request.syntheticHistoryHash);
  assert.equal(result.userMessageId, 41);
});

test('F01：V2 key 存在但 malformed 不得回退 V1（conflict malformed）', () => {
  const request = makeV2Request();
  const broken = { ...request, syntheticHistory: [{ role: 'user', content: '不是 system' }] };
  const messages = [{
    role: 'user',
    is_user: true,
    message_id: 50,
    // 同时塞 V1 完整 metadata + 损坏的 V2 metadata，V2 优先且失败必须 conflict
    extra: {
      ...g.buildRequestMetadataV2(broken),
      ...g.buildRequestMetadata(request),
    },
  }];
  const result = g.analyzeChatRestore(messages, IDENTITY);
  assert.equal(result.kind, 'conflict');
  if (result.kind === 'conflict') assert.equal(result.reason, 'malformed');
});

test('F01：V1 楼层仍走 V1 restore（回归，不被 V2 分支干扰）', () => {
  const request = makeRequest();
  const messages = [makePlayerFloor(request, 60)];
  const result = g.analyzeChatRestore(messages, IDENTITY);
  assert.equal(result.kind, 'incomplete');
  if (result.kind !== 'incomplete') return;
  assert.equal(result.request.schema, 'gal-generation-request.v1');
  assert.equal(result.userMessageId, 60);
});

test('F01：无任何 metadata 仍返回 none（回归）', () => {
  const messages = [{ role: 'user', is_user: true, message_id: 70, message: '普通聊天' }];
  assert.deepEqual(g.analyzeChatRestore(messages, IDENTITY), { kind: 'none' });
});

// ── B2-F04：系统操作 reload recovery 精确 commit 定位（F-C 返修）──────────────
test('F04：两条相同 commit assistant → resolveAssistantMessageByCommitKey 返回 ambiguous（不写任一）', () => {
  const request = makeV2Request();
  const attempt = g.createGalGenerationAttempt({ ...request, attemptSeq: 1 }, 'send', 1);
  const dupA = { role: 'assistant', message_id: 100, message: 'A', extra: g.buildAttemptMetadata(attempt) };
  const dupB = { role: 'assistant', message_id: 101, message: 'B', extra: g.buildAttemptMetadata(attempt) };
  const result = g.resolveAssistantMessageByCommitKey([dupA, dupB], request.requestId, attempt.attemptId);
  assert.deepEqual(result, { ok: false, code: 'ambiguous' });
});

test('F04：system metadata 正确但 V2 metadata 损坏 → restore 失败（不降级旧恢复）', () => {
  const request = makeV2Request();
  // 玩家楼层带完整 system-operation + 损坏的 V2 request（syntheticHistory 混入 user）。
  const broken = { ...request, syntheticHistory: [{ role: 'user', content: 'x' }] };
  const extra = {
    gensokyoSystemOperation: { version: 'system-operation.v1', operationId: 'anomaly-resolution:op1', type: 'anomaly_resolution' },
    ...g.buildRequestMetadataV2(broken),
  };
  const restored = g.restoreGalGenerationRequestV2(extra);
  assert.equal(restored.ok, false);
  assert.equal(g.analyzeChatRestore(
    [{ role: 'user', is_user: true, message_id: 200, extra }],
    IDENTITY,
  ).kind, 'conflict');
});

test('F04：精确 assistant 定位——相邻 assistant 干扰只命中带正确 commit 的楼层', () => {
  const request = makeV2Request();
  const attempt = g.createGalGenerationAttempt({ ...request, attemptSeq: 1 }, 'send', 1);
  const correct = { role: 'assistant', message_id: 210, message: '正确楼层', extra: g.buildAttemptMetadata(attempt) };
  // 干扰：无 metadata 的相邻 assistant（旧恢复会误选它）。
  const decoy = { role: 'assistant', message_id: 211, message: '相邻干扰楼层', extra: {} };
  const result = g.resolveAssistantMessageByCommitKey([decoy, correct], request.requestId, attempt.attemptId);
  assert.deepEqual(result, { ok: true, messageId: 210 });
});

// ── B2-F06：真实 V2 三态矩阵（createGalGenerationRequestV2/buildRequestMetadataV2 构造）──
test('F06-V2 三态：settlement-pending（assistant 已落楼、lifecycle pending）→ 恢复 pending 依据', () => {
  const request = makeV2Request();
  const attempt = g.createGalGenerationAttempt({ ...request, attemptSeq: 1 }, 'send', 1);
  const result = g.analyzeChatRestore([
    makeV2PlayerFloor(request, 302),
    {
      role: 'assistant',
      message_id: 303,
      message: '【庭园正文开始】回复。【庭园正文结束】',
      extra: g.buildAttemptMetadata(attempt),
      data: { [g.COMMIT_LIFECYCLE_KEY]: g.buildCommitLifecycle(attempt, 'pending') },
    },
  ], IDENTITY);
  assert.equal(result.kind, 'settlement-pending');
  if (result.kind === 'settlement-pending') {
    assert.equal(result.request.schema, 'gal-generation-request.v2');
    assert.equal(result.assistantMessageId, 303);
    assert.equal(result.attempt.attemptId, `${request.requestId}:attempt-1`);
  }
});

test('F06-V2 三态：confirmed（精确 commit lifecycle settled）→ 恢复 settled 依据', () => {
  const request = makeV2Request();
  const attempt = g.createGalGenerationAttempt({ ...request, attemptSeq: 1 }, 'send', 1);
  const turn = {
    turn_id: `${request.requestId}:reimu`,
    request_id: request.requestId,
    character_id: 'reimu',
    assistant_message_id: 305,
    assistant_swipe_id: 0,
    latest_attempt_id: attempt.attemptId,
    latest_commit_key: attempt.commitKey,
  };
  const result = g.analyzeChatRestore([
    makeV2PlayerFloor(request, 304),
    {
      role: 'assistant',
      message_id: 305,
      swipe_id: 0,
      message: '【庭园正文开始】回复。【庭园正文结束】',
      extra: g.buildAttemptMetadata(attempt),
      data: {
        [g.COMMIT_LIFECYCLE_KEY]: g.buildCommitLifecycle(attempt, 'settled'),
        stat_data: {
          interaction: {
            visit_memory: {
              by_character: {
                reimu: {
                  active_visit: {
                    visit_id: 'character_visit_000001',
                    character_id: 'reimu',
                    turns: [turn],
                  },
                  closed_visits: [],
                },
              },
            },
          },
        },
      },
    },
  ], IDENTITY);
  assert.equal(result.kind, 'confirmed');
  if (result.kind === 'confirmed') {
    assert.equal(result.request.schema, 'gal-generation-request.v2');
    assert.equal(result.assistantMessageId, 305);
    assert.equal(result.attempt.commitKey, attempt.commitKey);
  }
});

test('返修：V2 lifecycle 虽 settled 但缺少本次 VisitTurn 时仍是 settlement-pending', () => {
  const request = makeV2Request();
  const attempt = g.createGalGenerationAttempt({ ...request, attemptSeq: 1 }, 'send', 1);
  const result = g.analyzeChatRestore([
    makeV2PlayerFloor(request, 307),
    {
      role: 'assistant',
      message_id: 308,
      swipe_id: 0,
      message: '回复正文',
      extra: g.buildAttemptMetadata(attempt),
      data: { [g.COMMIT_LIFECYCLE_KEY]: g.buildCommitLifecycle(attempt, 'settled'), stat_data: {} },
    },
  ], IDENTITY);
  assert.equal(result.kind, 'settlement-pending');
});

test('返修：system recovery 使用 assistant 中的实际 retry attempt，不猜玩家 request 的旧 attemptSeq', () => {
  const request = makeV2Request();
  const retryAttempt = g.createGalGenerationAttempt({ ...request, attemptSeq: 2 }, 'send', 2);
  const result = g.analyzeChatRestore([
    makeV2PlayerFloor(request, 309),
    {
      role: 'assistant',
      message_id: 310,
      swipe_id: 0,
      message: 'retry 回复正文',
      extra: g.buildAttemptMetadata(retryAttempt),
      data: { [g.COMMIT_LIFECYCLE_KEY]: g.buildCommitLifecycle(retryAttempt, 'pending') },
    },
  ], IDENTITY);
  assert.equal(result.kind, 'settlement-pending');
  if (result.kind === 'settlement-pending') assert.equal(result.attempt.attemptId, retryAttempt.attemptId);
});

test('F06-V2 三态：incomplete（玩家有、commit 无）→ 恢复 incomplete 依据', () => {
  const request = makeV2Request();
  const result = g.analyzeChatRestore([makeV2PlayerFloor(request, 306)], IDENTITY);
  assert.equal(result.kind, 'incomplete');
  if (result.kind === 'incomplete') {
    assert.equal(result.request.schema, 'gal-generation-request.v2');
    assert.equal(result.userMessageId, 306);
  }
});
