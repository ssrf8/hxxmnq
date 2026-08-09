// 第三批 B3-T03 —— 精确 target locator 与 attemptSeq 扫描。
// 覆盖 runbook T03 必测：单 swipe、三 swipe 后 attempt-4、玩家楼层重复、
// swipe attempt 重复、active source swipe 不在数组、后面有 user/system 楼层、
// chat/owner 改变、nested extra.extra metadata、无 metadata legacy。
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

const g = await importTypescript('../src/ui/gal-regeneration-locator.ts');
const req = await importTypescript('../src/ui/gal-generation-request.ts');

const SYNTHETIC = [{ role: 'system', content: '【历史边界】本请求不读取真实楼层。' }];

const v2 = () => ({
  schema: 'gal-generation-request.v2',
  requestId: 'gal-req-b3-0001',
  chatId: 'chat-b3-1',
  ownerCharacterId: 'reimu',
  promptRevision: 'gal-prompt.v1',
  historyRevision: 'gal-synthetic-history.v1',
  memoryRevision: 'character-visit-memory.v1',
  sceneId: 'scene:shrine',
  stateMessageIdBeforeGeneration: 99,
  stateSwipeIdBeforeGeneration: 0,
  relevantCharacterIds: ['reimu'],
  visitIdsByCharacter: { reimu: 'character_visit_000001' },
  syntheticHistory: SYNTHETIC,
  syntheticHistoryHash: 'a1b2c3d4',
  contextFingerprint: 'deadbeef',
  visibleUserText: '你好',
  modelUserInput: '你好',
  attemptSeq: 1,
  createdAt: '2026-08-09T00:00:00.000Z',
});

const V5_ROUTE = [{
  position: 'none', depth: 0, role: 'system', content: 'GSK_CHAR_REIMU_ACTIVE', should_scan: true,
}];
const v5 = () => ({
  ...v2(),
  promptRevision: 'gal-prompt.v5',
  visibleUserText: '你好',
  modelUserInput: '你好\n\n【庭园正文协议】\n严格输出庭园正文。',
  promptInjects: V5_ROUTE,
  promptInjectsHash: req.computeContextFingerprint(JSON.stringify(V5_ROUTE)),
});

const attempt = (seq, { requestId = 'gal-req-b3-0001', assistantMessageId = 102, extra = {} } = {}) => ({
  schema: 'gal-generation-attempt.v1',
  requestId,
  attemptId: `${requestId}:attempt-${seq}`,
  generationId: `gal-gen-${seq}`,
  mode: seq === 1 ? 'send' : 'regenerate',
  chatId: 'chat-b3-1',
  ownerCharacterId: 'reimu',
  assistantMessageId,
  baseSwipeId: seq - 1,
  commitKey: `${requestId}:${requestId}:attempt-${seq}`,
  createdAt: '2026-08-09T00:00:00.000Z',
  ...extra,
});

const playerFloor = (overrides = {}) => ({
  role: 'user',
  message_id: 101,
  extra: req.buildRequestMetadataV2(v2()),
  ...overrides,
});

const assistantFloor = (messageId = 102) => ({ role: 'assistant', message_id: messageId });

const swipeArrays = (opts = {}) => {
  const {
    swipeId = 0,
    attempts = [attempt(1)],
    messageId = 102,
    texts = attempts.map((_, i) => `回复${i + 1}`),
  } = opts;
  return {
    message_id: messageId,
    swipe_id: swipeId,
    swipes: texts,
    swipes_data: attempts.map((_, i) => ({ stat_data: { day: i + 1 } })),
    swipes_info: attempts.map((a) => ({ extra: req.buildAttemptMetadata(a) })),
  };
};

const locate = (overrides = {}) => g.locateGalRegenerationTargetV1({
  chatId: 'chat-b3-1',
  ownerCharacterId: 'reimu',
  messages: [playerFloor(), assistantFloor()],
  assistant: swipeArrays(),
  arraysFingerprint: (view) => `fp-${view.swipes.length}`,
  ...overrides,
});

// ---- 单 swipe ----
test('单 swipe：定位成功，nextAttemptSeq=2，candidateSwipeId=1，身份字段正确', () => {
  const result = locate();
  assert.equal(result.ok, true);
  const t = result.target;
  assert.equal(t.schema, 'gal-regeneration-target.v1');
  assert.equal(t.chatId, 'chat-b3-1');
  assert.equal(t.ownerCharacterId, 'reimu');
  assert.equal(t.requestId, 'gal-req-b3-0001');
  assert.equal(t.playerMessageId, 101);
  assert.equal(t.assistantMessageId, 102);
  assert.equal(t.sourceSwipeId, 0);
  assert.equal(t.candidateSwipeId, 1);
  assert.equal(t.sourceAttemptId, 'gal-req-b3-0001:attempt-1');
  assert.equal(t.arraysFingerprint, 'fp-1');
  assert.equal(t.originalRequest.schema, 'gal-generation-request.v2');
  assert.equal(result.nextAttemptSeq, 2);
});

test('v5 重生成要求真实玩家楼层正文与冻结 modelUserInput 逐字一致', () => {
  const request = v5();
  const exact = playerFloor({ message: request.modelUserInput, extra: req.buildRequestMetadataV2(request) });
  assert.equal(locate({ messages: [exact, assistantFloor()] }).ok, true);

  const drifted = playerFloor({ message: request.visibleUserText, extra: req.buildRequestMetadataV2(request) });
  const result = locate({ messages: [drifted, assistantFloor()] });
  assert.deepEqual(
    { ok: result.ok, code: result.code },
    { ok: false, code: 'request-conflict' },
  );
});

// ---- 三 swipe 后 attempt-4 ----
test('三 swipe（attempt-1/2/3）：nextAttemptSeq=4，candidateSwipeId=3', () => {
  const attempts = [attempt(1), attempt(2), attempt(3)];
  const result = locate({ assistant: swipeArrays({ swipeId: 2, attempts }) });
  assert.equal(result.ok, true);
  assert.equal(result.target.candidateSwipeId, 3);
  assert.equal(result.target.sourceSwipeId, 2);
  assert.equal(result.nextAttemptSeq, 4);
  assert.equal(result.target.sourceAttemptId, 'gal-req-b3-0001:attempt-3');
});

// ---- 玩家楼层重复 ----
test('玩家楼层重复（同 requestId 两个 user 楼层）→ request-conflict', () => {
  const result = locate({ messages: [playerFloor(), playerFloor({ message_id: 103 }), assistantFloor()] });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'request-conflict');
});

// ---- swipe attempt 重复 ----
test('swipe attempt 重复（同 attemptId 两条）→ attempt-sequence-conflict', () => {
  const same = attempt(1);
  const result = locate({ assistant: swipeArrays({ attempts: [same, same] }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'attempt-sequence-conflict');
});

// ---- active source swipe 不在数组 ----
test('active source swipe 不在数组（swipe_id=5，数组长 2）→ invalid-source-swipe', () => {
  const result = locate({ assistant: swipeArrays({ swipeId: 5 }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid-source-swipe');
});

// ---- 后面有 user/system 楼层 ----
test('最后一楼是 user（后面有楼层）→ not-latest-assistant', () => {
  const result = locate({ messages: [playerFloor(), assistantFloor(), { role: 'user', message_id: 104 }] });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'not-latest-assistant');
});

test('最后一楼是 system → not-latest-assistant', () => {
  const result = locate({ messages: [playerFloor(), assistantFloor(), { role: 'system', message_id: 104 }] });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'not-latest-assistant');
});

// ---- chat/owner 改变 ----
test('chat/owner 与请求冻结不一致 → chat-identity-changed', () => {
  const result = locate({ chatId: 'chat-other' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'chat-identity-changed');
  const result2 = locate({ ownerCharacterId: 'marisa' });
  assert.equal(result2.ok, false);
  assert.equal(result2.code, 'chat-identity-changed');
});

// ---- nested extra.extra metadata ----
test('nested extra.extra metadata（ST 1.18 swipe_info 嵌套）解析成功', () => {
  const a = attempt(1);
  const assistant = {
    message_id: 102,
    swipe_id: 0,
    swipes: ['回复1'],
    swipes_data: [{ stat_data: { day: 1 } }],
    swipes_info: [{ extra: { extra: req.buildAttemptMetadata(a) } }],
  };
  const result = locate({ assistant });
  assert.equal(result.ok, true);
  assert.equal(result.nextAttemptSeq, 2);
});

// ---- 无 metadata legacy ----
test('无 V2 metadata 的 legacy assistant → legacy-request-unsupported', () => {
  const assistant = {
    message_id: 102,
    swipe_id: 0,
    swipes: ['旧回复'],
    swipes_data: [{}],
    swipes_info: [{ extra: { note: 'no attempt metadata' } }],
  };
  const result = locate({ assistant });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'legacy-request-unsupported');
});

// ---- 其它失败路径 ----
test('source attempt 的 assistantMessageId 与目标楼层不一致 → target-changed', () => {
  const result = locate({
    assistant: swipeArrays({ attempts: [attempt(1, { assistantMessageId: 999 })] }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'target-changed');
});

test('assistant 楼层混入其它 request 的 attempt → request-conflict', () => {
  const attempts = [attempt(1), attempt(2, { requestId: 'gal-req-other-0001' })];
  const result = locate({ assistant: swipeArrays({ attempts }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'request-conflict');
});

test('四数组长度不一致 → malformed-swipe-arrays', () => {
  const assistant = swipeArrays();
  assistant.swipes_data = assistant.swipes_data.slice(0, 0);
  const result = locate({ assistant });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'malformed-swipe-arrays');
});

test('assistant message_id 不是最后一楼 → target-changed', () => {
  const result = locate({ assistant: swipeArrays({ messageId: 100 }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'target-changed');
});

// ---- attemptSeqOf 单测 ----
test('attemptSeqOf 解析 attemptId 序号；非法返回 null', () => {
  assert.equal(g.attemptSeqOf('gal-req-b3-0001:attempt-4'), 4);
  assert.equal(g.attemptSeqOf('gal-req-b3-0001:attempt-1'), 1);
  assert.equal(g.attemptSeqOf('no-separator'), null);
  assert.equal(g.attemptSeqOf('gal-req:attempt-0'), null);
  assert.equal(g.attemptSeqOf('gal-req:attempt-x'), null);
});
