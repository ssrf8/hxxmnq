// Phase 1.3/1.4 — gal-generation-request 纯函数测试。
// 覆盖计划 §1.3（对比测试：旧 withGardenNarrativeContract 拼接 vs 新请求构造）与
// §1.4（结构快照、输入不重复、metadata round-trip、ID 语义、精确反查、兼容、
// fingerprint 稳定性、空白拒绝）。
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
const actions = await importTypescript('../src/ui/target-actions.ts');
const { withGardenNarrativeContract } = actions;

const baseSnapshot = (overrides = {}) => ({
  ownerCharacterId: 'reimu',
  chatId: 'chat-probe-1',
  stateMessageIdBeforeGeneration: 41,
  stateSwipeIdBeforeGeneration: 0,
  sceneId: 'scene:demo',
  historyFingerprintInput: 'h:40:u:0',
  ...overrides,
});

// ---- §1.4-1 结构快照 / §1.4-8 空白拒绝 / identity 拒绝 ----
test('createGalGenerationRequest 返回完整结构快照（schema/身份/边界/fingerprint）', () => {
  const r = g.createGalGenerationRequest({
    playerInput: '你好，灵梦',
    snapshot: baseSnapshot(),
    contractInjector: (text) => `INJECTED(${text})`,
    now: 1750000000000,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.request.schema, 'gal-generation-request.v1');
  assert.equal(r.request.requestId.startsWith('gal-req-'), true);
  assert.equal(r.request.chatId, 'chat-probe-1');
  assert.equal(r.request.ownerCharacterId, 'reimu');
  assert.equal(r.request.promptRevision, 'gal-prompt.v1');
  assert.equal(r.request.sceneId, 'scene:demo');
  assert.equal(r.request.stateMessageIdBeforeGeneration, 41);
  assert.equal(r.request.stateSwipeIdBeforeGeneration, 0);
  assert.equal(r.request.visibleUserText, '你好，灵梦');
  assert.equal(r.request.modelUserInput, 'INJECTED(你好，灵梦)');
  assert.equal(r.request.attemptSeq, 1);
  assert.match(r.request.contextFingerprint, /^[0-9a-f]{8}$/);
  assert.equal(r.request.createdAt, new Date(1750000000000).toISOString());
});

test('createGalGenerationRequest 拒绝空白输入', () => {
  for (const input of ['', '   ', '\n\t ']) {
    const r = g.createGalGenerationRequest({ playerInput: input, snapshot: baseSnapshot(), contractInjector: (t) => t });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'empty-input');
  }
});

test('createGalGenerationRequest 拒绝缺失聊天身份', () => {
  for (const overrides of [{ chatId: '' }, { ownerCharacterId: '' }]) {
    const r = g.createGalGenerationRequest({ playerInput: 'hi', snapshot: baseSnapshot(overrides), contractInjector: (t) => t });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'missing-chat-identity');
  }
});

test('createGalGenerationRequest 支持显式 visibleUserText（注入后与原文分离）', () => {
  const r = g.createGalGenerationRequest({
    playerInput: '【庭园正文协议】…注入后全文…',
    visibleUserText: '玩家原文：整理庭院',
    snapshot: baseSnapshot(),
    contractInjector: (t) => t,
    now: 1750000000500,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.request.visibleUserText, '玩家原文：整理庭院');
  assert.equal(r.request.modelUserInput, '【庭园正文协议】…注入后全文…');
});

// ---- §1.4-4 requestId 稳定 / attemptId·generationId 变化 ----
test('requestId 稳定而 retry 的 attemptId/generationId 必须变化', () => {
  const snapshot = baseSnapshot();
  const a = g.createGalGenerationRequest({ playerInput: '重试', snapshot, contractInjector: (t) => t, requestId: 'gal-req-fixed', attemptSeq: 1, now: 1750000001000 });
  const b = g.createGalGenerationRequest({ playerInput: '重试', snapshot, contractInjector: (t) => t, requestId: 'gal-req-fixed', attemptSeq: 1, now: 1750000002000 });
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(a.request.requestId, b.request.requestId); // 稳定
  const attA = g.createGalGenerationAttempt(a.request, 'send', 1, 1750000001000);
  const attB = g.createGalGenerationAttempt(b.request, 'send', 2, 1750000002000);
  assert.equal(attA.attemptId, 'gal-req-fixed:attempt-1');
  assert.equal(attB.attemptId, 'gal-req-fixed:attempt-2');
  assert.notEqual(attA.attemptId, attB.attemptId);
  assert.notEqual(attA.generationId, attB.generationId);
  assert.equal(attA.commitKey, `${attA.requestId}:${attA.attemptId}`);
  assert.equal(attA.generationId.startsWith('gal-gen-'), true);
});

test('advanceGalGenerationRequest 每次真实模型调用只推进一个 attempt', () => {
  const result = g.createGalGenerationRequest({ playerInput: 'seq', snapshot: baseSnapshot(), contractInjector: (t) => t });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const second = g.advanceGalGenerationRequest(result.request, 1);
  const third = g.advanceGalGenerationRequest(second, 2);
  assert.equal(second.attemptSeq, 2);
  assert.equal(third.attemptSeq, 3);
  assert.equal(g.createGalGenerationAttempt(second, 'send', second.attemptSeq).attemptId, `${result.request.requestId}:attempt-2`);
});

// ---- §1.4-3 metadata round-trip ----
test('metadata round-trip：build → parse/restore 一致', () => {
  const r = g.createGalGenerationRequest({
    playerInput: '往返测试',
    snapshot: baseSnapshot({ stateMessageIdBeforeGeneration: 7, stateSwipeIdBeforeGeneration: 1 }),
    contractInjector: (t) => `W(${t})`,
    now: 1750000003000,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const withId = g.withPlayerMessageId(r.request, 42);
  const extra = g.buildRequestMetadata(withId);
  assert.equal(extra.galGenerationRequestV1.schema, 'gal-generation-request.v1');
  assert.equal(extra.galGenerationRequestV1.playerMessageId, 42);
  assert.match(extra.galGenerationRequestV1.modelUserInputHash, /^[0-9a-f]{8}$/);
  const restored = g.restoreGalGenerationRequest(extra);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.request.requestId, r.request.requestId);
  assert.equal(restored.request.playerMessageId, 42);
  assert.equal(restored.request.stateMessageIdBeforeGeneration, 7);
  assert.equal(restored.request.stateSwipeIdBeforeGeneration, 1);
  assert.equal(restored.request.contextFingerprint, r.request.contextFingerprint);
  assert.equal(restored.request.visibleUserText, '往返测试');
});

// ---- §1.4-5 精确反查 0/多条歧义 ----
test('按 requestId 精确反查：1 条成功、0 条 not-found、多条 ambiguous', () => {
  const mk = (role, requestId, message_id) => ({
    role,
    message_id,
    extra: requestId ? { galGenerationRequestV1: { schema: 'gal-generation-request.v1', requestId, chatId: 'c', ownerCharacterId: 'o', promptRevision: 'p', sceneId: null, stateMessageIdBeforeGeneration: null, stateSwipeIdBeforeGeneration: null, contextFingerprint: 'f', visibleUserText: 't', createdAt: 'now' } } : {},
  });
  const one = [mk('user', 'gal-req-x', 5), mk('assistant', null, 6)];
  assert.deepEqual(g.resolvePlayerMessageByMetadata(one, 'gal-req-x'), { ok: true, messageId: 5 });
  const zero = [mk('user', 'gal-req-other', 5)];
  assert.deepEqual(g.resolvePlayerMessageByMetadata(zero, 'gal-req-x'), { ok: false, code: 'not-found' });
  const many = [mk('user', 'gal-req-x', 5), mk('user', 'gal-req-x', 8)];
  assert.deepEqual(g.resolvePlayerMessageByMetadata(many, 'gal-req-x'), { ok: false, code: 'ambiguous' });
});

// ---- §1.4-6 缺旧 metadata 兼容 ----
test('缺少旧 metadata 时返回明确错误码，不抛错', () => {
  assert.deepEqual(g.parseRequestMetadata(undefined), { ok: false, code: 'missing' });
  assert.deepEqual(g.parseRequestMetadata({ otherKey: 1 }), { ok: false, code: 'missing' });
  assert.deepEqual(g.parseRequestMetadata('nope'), { ok: false, code: 'malformed' });
  assert.deepEqual(g.parseRequestMetadata({ galGenerationRequestV1: { schema: 'other.v2' } }), { ok: false, code: 'schema-mismatch' });
  const r = g.restoreGalGenerationRequest({ galGenerationRequestV1: { schema: 'gal-generation-request.v1', requestId: 'gal-req-x' } });
  assert.deepEqual(r, { ok: false, code: 'incomplete' });
});

// ---- §1.4-7 context fingerprint 稳定性 ----
test('contextFingerprint：同快照同值、任一输入变化必变', () => {
  const mk = (overrides) => g.createGalGenerationRequest({ playerInput: '指纹', snapshot: baseSnapshot(overrides), contractInjector: (t) => t, now: 1750000004000 });
  const a = mk({});
  const b = mk({});
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(a.request.contextFingerprint, b.request.contextFingerprint);
  assert.notEqual(a.request.contextFingerprint, mk({ historyFingerprintInput: 'h:99:u:1' }).ok ? mk({ historyFingerprintInput: 'h:99:u:1' }).request.contextFingerprint : '');
  assert.notEqual(a.request.contextFingerprint, mk({ sceneId: 'scene:other' }).ok ? mk({ sceneId: 'scene:other' }).request.contextFingerprint : '');
  const c = g.createGalGenerationRequest({ playerInput: '指纹2', snapshot: baseSnapshot(), contractInjector: (t) => t, now: 1750000004000 });
  assert.equal(c.ok, true);
  if (c.ok) assert.notEqual(a.request.contextFingerprint, c.request.contextFingerprint);
});

// ---- §1.4-2 当前玩家输入不重复 ----
test('当前玩家输入只出现在 user_input 位置，不重复进历史', () => {
  const input = '把这座庭院整理一下。';
  // 历史指纹输入由调用方负责排除本次楼层；此处模拟已排除（不含输入文本）。
  const snapshot = baseSnapshot({ historyFingerprintInput: 'h:40:u:0' });
  const r = g.createGalGenerationRequest({ playerInput: input, snapshot, contractInjector: withGardenNarrativeContract, now: 1750000005000 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // 注入函数只把文本放一处（withGardenNarrativeContract 前置拼接），不允许重复。
  const occurrences = r.request.modelUserInput.split(input).length - 1;
  assert.equal(occurrences, 1);
});

// ---- §1.3 对比测试：新构造 modelUserInput === 旧路径 withGardenNarrativeContract ----
const comparisonCases = [
  { name: '普通自由对话', text: '灵梦，今天天气不错。', state: {} },
  { name: '场景入口', text: '我来到月见温泉，先环顾四周。', state: { player: { current_area_id: 'moon_spring' }, environment: { day: 3, time_period: '夜晚' } } },
  { name: '场景物品互动', text: '拿起石臼仔细端详。', state: { resources: { materials: 2 } } },
  { name: '固定事件', text: '我决定今天去完成庭院的修理工作。', state: { events: { active_event: { config_id: 'main_house_repair' } } } },
  { name: '战斗/特殊协议入口', text: '我以公开模式开始本次月见温泉会话。', state: {} },
  { name: '带前序 swipe 的聊天', text: '继续刚才的对话。', state: { player: { name: '游客' } } },
  { name: '换行/引号/斜杠命令样字符', text: '我说：“快看！\"那边\"\n好像有东西。\n/help 里没写这个。', state: {} },
];

for (const { name, text, state } of comparisonCases) {
  test(`对比测试：${name} —— modelUserInput 与旧 withGardenNarrativeContract 逐字节等价`, () => {
    const r = g.createGalGenerationRequest({
      playerInput: text,
      snapshot: baseSnapshot(),
      contractInjector: (t) => withGardenNarrativeContract(t, state),
      now: 1750000006000,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const legacy = withGardenNarrativeContract(text.trim(), state);
    assert.equal(r.request.modelUserInput, legacy);
    assert.equal(r.request.visibleUserText, text.trim());
  });
}

// ---- Phase 2 增量 A：attempt metadata 与助手楼层精确反查 ----
test('attempt metadata round-trip：build → parse 一致，commitKey 反查 1/0/多条', () => {
  const r = g.createGalGenerationRequest({ playerInput: '增量A', snapshot: baseSnapshot(), contractInjector: (t) => t, now: 1750000007000 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const attempt = g.createGalGenerationAttempt(r.request, 'send', 2, 1750000007000);
  const extra = g.buildAttemptMetadata(attempt);
  assert.equal(extra.galGenerationAttemptV1.schema, 'gal-generation-attempt.v1');
  assert.equal(extra.galGenerationAttemptV1.commitKey, `${attempt.requestId}:${attempt.attemptId}`);
  assert.equal(extra.galGenerationAttemptV1.generationId.startsWith('gal-gen-'), true);
  const parsed = g.parseAttemptMetadata(extra);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.attemptId, attempt.attemptId);
  // 反查：1 条命中
  const mk = (role, commitKey, message_id) => ({
    role,
    message_id,
    extra: commitKey ? { galGenerationAttemptV1: { schema: 'gal-generation-attempt.v1', requestId: attempt.requestId, attemptId: attempt.attemptId, generationId: attempt.generationId, mode: 'send', chatId: 'c', ownerCharacterId: 'o', commitKey, createdAt: 'now' } } : {},
  });
  const one = [mk('assistant', attempt.commitKey, 9), mk('user', null, 10)];
  assert.deepEqual(g.resolveAssistantMessageByCommitKey(one, attempt.requestId, attempt.attemptId), { ok: true, messageId: 9 });
  const zero = [mk('assistant', 'other:key', 9)];
  assert.deepEqual(g.resolveAssistantMessageByCommitKey(zero, attempt.requestId, attempt.attemptId), { ok: false, code: 'not-found' });
  const many = [mk('assistant', attempt.commitKey, 9), mk('assistant', attempt.commitKey, 11)];
  assert.deepEqual(g.resolveAssistantMessageByCommitKey(many, attempt.requestId, attempt.attemptId), { ok: false, code: 'ambiguous' });
  // 错误码
  assert.deepEqual(g.parseAttemptMetadata(undefined), { ok: false, code: 'missing' });
  assert.deepEqual(g.parseAttemptMetadata({ galGenerationAttemptV1: { schema: 'x' } }), { ok: false, code: 'schema-mismatch' });
});

test('restore 恢复 attemptSeq（缺省回退 1）', () => {
  const r = g.createGalGenerationRequest({ playerInput: 'seq', snapshot: baseSnapshot(), contractInjector: (t) => t, attemptSeq: 3, now: 1750000008000 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const extra = g.buildRequestMetadata(r.request);
  const restored = g.restoreGalGenerationRequest(extra);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.request.attemptSeq, 3);
});

// ---- Phase 2 增量 B：generate() chat_history 构造 ----
test('buildChatHistoryForGenerate：排除本次玩家楼层、role 映射、跳过空文本、保持顺序', () => {
  const messages = [
    { role: 'assistant', message: '开场', message_id: 1 },
    { role: 'system', message: '隐藏系统楼层（应跳过）', message_id: 1.5 },
    { role: 'user', message: '   ', message_id: 2 },
    { role: 'user', message: '本次玩家楼层（应排除）', message_id: 3 },
    { role: 'assistant', message: '回复一', message_id: 4 },
    { role: 'user', message: '玩家二', message_id: 5 },
  ];
  const history = g.buildChatHistoryForGenerate(messages, 3);
  assert.deepEqual(history, [
    { role: 'assistant', content: '开场' },
    { role: 'assistant', content: '回复一' },
    { role: 'user', content: '玩家二' },
  ]);
  // 无排除楼层：全部保留（空文本仍跳过）
  const all = g.buildChatHistoryForGenerate(messages, null);
  assert.deepEqual(all.map((item) => item.content), ['开场', '本次玩家楼层（应排除）', '回复一', '玩家二']);
  // is_user 兼容（ST 旧消息可能只有 is_user）
  const legacy = g.buildChatHistoryForGenerate([{ is_user: true, message: '旧', message_id: 9 }], null);
  assert.deepEqual(legacy, [{ role: 'user', content: '旧' }]);
});
