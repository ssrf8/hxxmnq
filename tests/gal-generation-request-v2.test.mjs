// 第二批 B2-T02 —— V2 请求类型、parser、serializer 与恢复。
// 覆盖 runbook §3.2–3.3：V1/V2 round-trip、malformed 拒绝、unknown-field 兼容、
// V1 不干扰、V2 只接受 system-only 合成历史、recovery 不重读状态。
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

const SYNTHETIC = [
  { role: 'system', content: '【历史边界】本请求不读取 SillyTavern 真实聊天楼层。' },
];

const baseInput = (overrides = {}) => ({
  playerInput: '你好，灵梦',
  visibleUserText: '你好，灵梦',
  snapshot: {
    ownerCharacterId: 'reimu',
    chatId: 'chat-v2-1',
    stateMessageIdBeforeGeneration: 41,
    stateSwipeIdBeforeGeneration: 0,
    sceneId: 'scene:demo',
    historyFingerprintInput: 'h:40:u:0',
    relevantCharacterIds: ['reimu', 'marisa'],
    visitIdsByCharacter: { reimu: 'character_visit_000001', marisa: null },
  },
  syntheticHistory: SYNTHETIC,
  syntheticHistoryHash: 'a1b2c3d4',
  contextFingerprint: 'deadbeef',
  now: 1750000000000,
  ...overrides,
});

const v2Base = () => {
  const result = g.createGalGenerationRequestV2(baseInput());
  assert.equal(result.ok, true);
  return result.request;
};

// ---- §3.2 构造冻结 ----
test('createGalGenerationRequestV2 冻结 schema/revision/相关角色/visit map/合成历史', () => {
  const r = v2Base();
  assert.equal(r.schema, 'gal-generation-request.v2');
  assert.equal(r.requestId.startsWith('gal-req-'), true);
  assert.equal(r.promptRevision, 'gal-prompt.v1');
  assert.equal(r.historyRevision, 'gal-synthetic-history.v1');
  assert.equal(r.memoryRevision, 'character-visit-memory.v1');
  assert.deepEqual(r.relevantCharacterIds, ['reimu', 'marisa']);
  assert.deepEqual(r.visitIdsByCharacter, { reimu: 'character_visit_000001', marisa: null });
  assert.deepEqual(r.syntheticHistory, SYNTHETIC);
  assert.equal(r.syntheticHistoryHash, 'a1b2c3d4');
  assert.equal(r.contextFingerprint, 'deadbeef');
  assert.equal(r.visibleUserText, '你好，灵梦');
  assert.equal(r.modelUserInput, '你好，灵梦');
  assert.equal(r.attemptSeq, 1);
  assert.equal(r.createdAt, new Date(1750000000000).toISOString());
});

test('createGalGenerationRequestV2 拒绝空白输入与缺失聊天身份', () => {
  for (const input of [
    baseInput({ playerInput: '   ' }),
    baseInput({ snapshot: { ...baseInput().snapshot, chatId: '' } }),
    baseInput({ snapshot: { ...baseInput().snapshot, ownerCharacterId: '' } }),
  ]) {
    const result = g.createGalGenerationRequestV2(input);
    assert.equal(result.ok, false);
  }
});

// ---- §3.2 只接受 system-only 合成历史 ----
test('createGalGenerationRequestV2 拒绝空历史与非 system 历史', () => {
  const empty = g.createGalGenerationRequestV2(baseInput({ syntheticHistory: [] }));
  assert.deepEqual(empty, { ok: false, reason: 'empty-history' });
  const nonSystem = g.createGalGenerationRequestV2(baseInput({
    syntheticHistory: [{ role: 'assistant', content: 'x' }],
  }));
  assert.deepEqual(nonSystem, { ok: false, reason: 'non-system-history' });
  const mixed = g.createGalGenerationRequestV2(baseInput({
    syntheticHistory: [{ role: 'system', content: 'a' }, { role: 'user', content: 'b' }],
  }));
  assert.deepEqual(mixed, { ok: false, reason: 'non-system-history' });
});

// ---- §3.4 相关角色与 visit map 校验 ----
test('createGalGenerationRequestV2 接受空相关角色（空 visit map），拒绝重复角色、visit map 键不匹配', () => {
  const emptyRelevant = g.createGalGenerationRequestV2(baseInput({
    snapshot: { ...baseInput().snapshot, relevantCharacterIds: [], visitIdsByCharacter: {} },
  }));
  // R0 裁定：空相关角色 + 严格空 visit map 是合法 V2（独处设施剧情）。
  assert.equal(emptyRelevant.ok, true);
  if (!emptyRelevant.ok) return;
  assert.deepEqual(emptyRelevant.request.relevantCharacterIds, []);
  assert.deepEqual(emptyRelevant.request.visitIdsByCharacter, {});

  const emptyRelevantWithVisit = g.createGalGenerationRequestV2(baseInput({
    snapshot: {
      ...baseInput().snapshot,
      relevantCharacterIds: [],
      visitIdsByCharacter: { reimu: 'character_visit_000001' },
    },
  }));
  // 空角色 + 非空 visit map 必须失败（visit-map-mismatch）。
  assert.deepEqual(emptyRelevantWithVisit, { ok: false, reason: 'visit-map-mismatch' });

  const duplicate = g.createGalGenerationRequestV2(baseInput({
    snapshot: {
      ...baseInput().snapshot,
      relevantCharacterIds: ['reimu', 'reimu'],
      visitIdsByCharacter: { reimu: 'character_visit_000001' },
    },
  }));
  assert.deepEqual(duplicate, { ok: false, reason: 'duplicate-character' });

  const extraKey = g.createGalGenerationRequestV2(baseInput({
    snapshot: {
      ...baseInput().snapshot,
      visitIdsByCharacter: { reimu: 'character_visit_000001', marisa: null, cirno: null },
    },
  }));
  assert.deepEqual(extraKey, { ok: false, reason: 'visit-map-mismatch' });

  const missingKey = g.createGalGenerationRequestV2(baseInput({
    snapshot: { ...baseInput().snapshot, visitIdsByCharacter: { reimu: 'character_visit_000001' } },
  }));
  assert.deepEqual(missingKey, { ok: false, reason: 'visit-map-mismatch' });
});

test('createGalGenerationRequestV2 拒绝非法 hash（unknown-revision 语义）', () => {
  const noHash = g.createGalGenerationRequestV2(baseInput({ syntheticHistoryHash: '' }));
  assert.deepEqual(noHash, { ok: false, reason: 'unknown-revision' });
  const nonStringHash = g.createGalGenerationRequestV2(baseInput({ syntheticHistoryHash: 42 }));
  assert.deepEqual(nonStringHash, { ok: false, reason: 'unknown-revision' });
});

// ---- §3.3 retry：冻结字段不变，attempt 前进 ----
test('advanceGalGenerationRequestV2 冻结字段全保留，attemptSeq 前进', () => {
  const first = v2Base();
  const second = g.advanceGalGenerationRequestV2(first, 1);
  assert.equal(second.requestId, first.requestId);
  assert.equal(second.visibleUserText, first.visibleUserText);
  assert.equal(second.modelUserInput, first.modelUserInput);
  assert.deepEqual(second.relevantCharacterIds, first.relevantCharacterIds);
  assert.deepEqual(second.visitIdsByCharacter, first.visitIdsByCharacter);
  assert.deepEqual(second.syntheticHistory, first.syntheticHistory);
  assert.equal(second.syntheticHistoryHash, first.syntheticHistoryHash);
  assert.equal(second.contextFingerprint, first.contextFingerprint);
  assert.equal(second.attemptSeq, 2);
});

test('requestId 复用与 attemptId/generationId 语义（V2 沿 V1 约定）', () => {
  const r = g.createGalGenerationRequestV2(baseInput({ requestId: 'gal-req-fixed-v2' }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.request.requestId, 'gal-req-fixed-v2');
  const attempt = g.createGalGenerationAttempt(r.request, 'send', 1, 1750000000000);
  assert.equal(attempt.attemptId, 'gal-req-fixed-v2:attempt-1');
  assert.equal(attempt.commitKey, `${attempt.requestId}:${attempt.attemptId}`);
});

// ---- §3.2 序列化/解析 round-trip 与 V1 不干扰 ----
test('buildRequestMetadataV2 → restoreGalGenerationRequestV2 逐字段 round-trip', () => {
  const request = v2Base();
  const extra = g.buildRequestMetadataV2(request);
  assert.equal(extra.galGenerationRequestV2.schema, 'gal-generation-request.v2');
  // V1 键不出现
  assert.equal(extra.galGenerationRequestV1, undefined);
  const restored = g.restoreGalGenerationRequestV2(extra);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.request.schema, 'gal-generation-request.v2');
  assert.equal(restored.request.requestId, request.requestId);
  assert.equal(restored.request.chatId, request.chatId);
  assert.equal(restored.request.ownerCharacterId, request.ownerCharacterId);
  assert.equal(restored.request.promptRevision, request.promptRevision);
  assert.equal(restored.request.historyRevision, request.historyRevision);
  assert.equal(restored.request.memoryRevision, request.memoryRevision);
  assert.equal(restored.request.sceneId, request.sceneId);
  assert.equal(restored.request.stateMessageIdBeforeGeneration, request.stateMessageIdBeforeGeneration);
  assert.equal(restored.request.stateSwipeIdBeforeGeneration, request.stateSwipeIdBeforeGeneration);
  assert.deepEqual(restored.request.relevantCharacterIds, request.relevantCharacterIds);
  assert.deepEqual(restored.request.visitIdsByCharacter, request.visitIdsByCharacter);
  assert.deepEqual(restored.request.syntheticHistory, request.syntheticHistory);
  assert.equal(restored.request.syntheticHistoryHash, request.syntheticHistoryHash);
  assert.equal(restored.request.contextFingerprint, request.contextFingerprint);
  assert.equal(restored.request.visibleUserText, request.visibleUserText);
  assert.equal(restored.request.modelUserInput, request.modelUserInput);
  assert.equal(restored.request.attemptSeq, request.attemptSeq);
  assert.equal(restored.request.createdAt, request.createdAt);
});

test('V1/V2 并存：同一 extra 各自解析互不干扰，V1 不被解释成 V2', () => {
  const v1 = g.createGalGenerationRequest({
    playerInput: 'V1 消息',
    snapshot: {
      ownerCharacterId: 'reimu',
      chatId: 'chat-v1',
      stateMessageIdBeforeGeneration: 1,
      stateSwipeIdBeforeGeneration: 0,
      sceneId: null,
      historyFingerprintInput: 'h',
    },
    contractInjector: (t) => t,
  });
  assert.equal(v1.ok, true);
  if (!v1.ok) return;
  const v2 = v2Base();
  const combined = { ...g.buildRequestMetadata(v1.request), ...g.buildRequestMetadataV2(v2) };
  // V1 读 V1
  assert.equal(g.parseRequestMetadata(combined).ok, true);
  assert.equal(g.parseRequestMetadataV2(combined).ok, true);
  // V2 读 V2（两者都 ok）
  const restoredV2 = g.restoreGalGenerationRequestV2(combined);
  assert.equal(restoredV2.ok, true);
  if (!restoredV2.ok) return;
  assert.equal(restoredV2.request.requestId, v2.requestId);
  // 纯 V1 extra：V2 parser 必须 missing，不能当 V2
  assert.equal(g.parseRequestMetadataV2(g.buildRequestMetadata(v1.request)).code, 'missing');
  // 纯 V2 extra：V1 parser 必须 missing
  assert.equal(g.parseRequestMetadata(g.buildRequestMetadataV2(v2)).code, 'missing');
});

// ---- §3.2 unknown-field 兼容（passthrough 保留未知键） ----
test('restoreGalGenerationRequestV2 保留未知字段（不静默裁剪）', () => {
  const request = v2Base();
  const extra = g.buildRequestMetadataV2(request);
  extra.galGenerationRequestV2.customField = { kept: true };
  const restored = g.restoreGalGenerationRequestV2(extra);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.request.customField?.kept, true);
});

// ---- malformed / 版本不匹配 ----
test('restoreGalGenerationRequestV2 拒绝 malformed 与非法 revision', () => {
  assert.deepEqual(g.restoreGalGenerationRequestV2(undefined), { ok: false, code: 'missing' });
  assert.deepEqual(g.restoreGalGenerationRequestV2({ galGenerationRequestV2: 'not-an-object' }), { ok: false, code: 'malformed' });
  assert.deepEqual(g.restoreGalGenerationRequestV2({ galGenerationRequestV2: { schema: 'gal-generation-request.v1' } }), { ok: false, code: 'schema-mismatch' });

  const badRevision = g.buildRequestMetadataV2(v2Base());
  badRevision.galGenerationRequestV2.historyRevision = 'gal-synthetic-history.v9';
  assert.deepEqual(g.restoreGalGenerationRequestV2(badRevision), { ok: false, code: 'invalid' });

  const badMemory = g.buildRequestMetadataV2(v2Base());
  badMemory.galGenerationRequestV2.memoryRevision = 'character-visit-memory.v9';
  assert.deepEqual(g.restoreGalGenerationRequestV2(badMemory), { ok: false, code: 'invalid' });
});

test('restoreGalGenerationRequestV2 拒绝空/重复角色与 visit map 不一致的持久化负载', () => {
  const base = g.buildRequestMetadataV2(v2Base());
  const emptyChars = structuredClone(base);
  emptyChars.galGenerationRequestV2.relevantCharacterIds = [];
  assert.deepEqual(g.restoreGalGenerationRequestV2(emptyChars), { ok: false, code: 'invalid' });

  const dupChars = structuredClone(base);
  dupChars.galGenerationRequestV2.relevantCharacterIds = ['reimu', 'reimu'];
  assert.deepEqual(g.restoreGalGenerationRequestV2(dupChars), { ok: false, code: 'invalid' });

  const extraVisit = structuredClone(base);
  extraVisit.galGenerationRequestV2.visitIdsByCharacter.cirno = null;
  assert.deepEqual(g.restoreGalGenerationRequestV2(extraVisit), { ok: false, code: 'invalid' });

  const nonSystem = structuredClone(base);
  nonSystem.galGenerationRequestV2.syntheticHistory = [{ role: 'user', content: 'x' }];
  assert.deepEqual(g.restoreGalGenerationRequestV2(nonSystem), { ok: false, code: 'invalid' });
});

test('V2 冻结请求持久化后 recovery 不重读状态（同一对象逐字节一致）', () => {
  const request = v2Base();
  const extra = g.buildRequestMetadataV2(request);
  const restored = g.restoreGalGenerationRequestV2(extra);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(JSON.stringify(restored.request), JSON.stringify(request));
  assert.equal(restored.request.modelUserInput, request.modelUserInput);
  assert.equal(restored.request.syntheticHistory[0].content, request.syntheticHistory[0].content);
});
