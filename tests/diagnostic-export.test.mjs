// GAL 第五批：脱敏诊断导出 —— 真实源码的脱敏与限额测试（runbook §7）。
// 必须通过 esbuild 加载真实 src/ui/diagnostic-export.ts，禁止复制一份伪实现自测自嗨。
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

const mod = await importTypescript('../src/ui/diagnostic-export.ts');

// ---- canary（runbook §7 必用清单）----
const CANARIES = [
  'CANARY_PLAYER_INPUT_9f31',
  'CANARY_ASSISTANT_STORY_2a77',
  'CANARY_SYNTHETIC_HISTORY_51dd',
  'CANARY_RELATIONSHIP_KISS_803c',
  'CANARY_PLAYER_NAME_f043',
  'CANARY_GARDEN_NAME_7aa1',
  'CANARY_CHAT_ID_19bc',
  'CANARY_REQUEST_ID_02ef',
  'CANARY_VISIT_ID_d900',
  'https://example.invalid/path?token=CANARY_URL_TOKEN',
  'Bearer CANARY_AUTH_8841',
  'Cookie=CANARY_COOKIE_44cc',
  'R2_SECRET_CANARY_ba12',
  'C:\\Users\\Owner\\secret-chat.json',
  '<div data-private="CANARY_DOM_90ff">',
];

const FIXED_SALT = 'test-fixed-salt-0000000000000000000000000000000000000000000000000000000000000000';
const FIXED_TIME = '2026-08-09T00:00:00.000Z';
const LEGACY_FINGERPRINT = 'FP32_legacy_fingerprint_8f31c2a7';
const LEGACY_HISTORY_HASH = 'HASH32_synthetic_history_51dd9b00';
const UNKNOWN_CHARACTER = 'stranger_canary_0001';

// ---- 脏输入构造：request/state/transaction/runtime 每处放不同 canary ----
function makeDirtyInput() {
  const state = {
    meta: { schema_version: '0.3.0' },
    player: { name: 'CANARY_PLAYER_NAME_f043' },
    garden: { name: 'CANARY_GARDEN_NAME_7aa1' },
    interaction: {
      visit_memory: {
        by_character: {
          reimu: {
            active_visit: { visit_id: 'CANARY_VISIT_ID_d900', turns: [{ summary: 'CANARY_ASSISTANT_STORY_2a77' }, { summary: 'ok' }] },
            closed_visits: [
              { visit_id: 'v1', turns: [{ summary: 'closed-turn' }] },
              { visit_id: 'v2', turns: [] },
            ],
            relationship_memories: [
              { kind: 'relationship_state', active: true, summary: 'CANARY_RELATIONSHIP_KISS_803c' },
              { kind: 'milestone', active: false, summary: 'x' },
              { kind: 'relationship_state', active: true, summary: 'y' },
            ],
          },
          marisa: { active_visit: null, closed_visits: [], relationship_memories: [] },
          [UNKNOWN_CHARACTER]: {
            active_visit: { visit_id: 'unknown-visit', turns: [{ summary: 'CANARY_PLAYER_INPUT_9f31' }] },
            closed_visits: [], relationship_memories: [],
          },
        },
      },
    },
  };
  const transaction = {
    transactionId: 'CANARY_CHAT_ID_19bc',
    chatId: 'CANARY_CHAT_ID_19bc',
    kind: 'interaction',
    phase: 'settled',
    userMessageCreated: true,
    assistantResponded: true,
    userMessageId: 41,
    assistantMessageId: 42,
    requestId: 'CANARY_REQUEST_ID_02ef',
    attemptId: 'attempt-9f31',
    generationId: 'generation-2a77',
    commitKey: 'commit-51dd',
    ownerCharacterId: 'reimu',
    requestSchema: 'gal-generation-request.v2',
    stopReason: 'user-stop',
    attemptSeq: 2,
    recovery: 'confirmed',
    lastError: 'timeout reading response from provider CANARY_ASSISTANT_STORY_2a77',
  };
  const pendingRequest = {
    schema: 'gal-generation-request.v2',
    requestId: 'CANARY_REQUEST_ID_02ef',
    chatId: 'CANARY_CHAT_ID_19bc',
    ownerCharacterId: 'reimu',
    promptRevision: 'gal-prompt.v1',
    historyRevision: 'gal-synthetic-history.v1',
    memoryRevision: 'character-visit-memory.v2',
    sceneId: null,
    stateMessageIdBeforeGeneration: 40,
    stateSwipeIdBeforeGeneration: 0,
    relevantCharacterIds: ['reimu', UNKNOWN_CHARACTER, 'marisa'],
    visitIdsByCharacter: { reimu: 'CANARY_VISIT_ID_d900', marisa: null },
    syntheticHistory: [
      { role: 'system', content: 'CANARY_SYNTHETIC_HISTORY_51dd\nCANARY_PLAYER_INPUT_9f31' },
      { role: 'system', content: 'normal block' },
    ],
    syntheticHistoryHash: LEGACY_HISTORY_HASH,
    contextFingerprint: LEGACY_FINGERPRINT,
    visibleUserText: 'CANARY_PLAYER_INPUT_9f31',
    modelUserInput: 'CANARY_PLAYER_INPUT_9f31 https://example.invalid/path?token=CANARY_URL_TOKEN',
    attemptSeq: 2,
    createdAt: '2026-08-09T00:00:00.000Z',
  };
  const diagnostics = {
    mode: 'host',
    tavernVersion: '1.18.0',
    helperVersion: '4.8.18',
    mvuReady: true,
    bridgeVersion: '0.4.3-host-generate-r26',
    generationTransport: 'helper-generate',
    regenerationTransport: 'native-regenerate',
    databaseAvailable: false,
    databaseVersion: '独立 MVU 版：数据库能力未装配',
    lastError: 'Bearer CANARY_AUTH_8841 Cookie=CANARY_COOKIE_44cc R2_SECRET_CANARY_ba12 C:\\Users\\Owner\\secret-chat.json <div data-private="CANARY_DOM_90ff"> timeout',
  };
  return {
    state,
    transaction,
    pendingRequest,
    diagnostics,
    memoryPort: { profile: 'standalone-mvu', capability: 'disabled-by-build' },
    appVersion: '0.2.0',
  };
}

const REF_PATTERN = /^d_[0-9a-f]{12}$/;

function assertNoCanary(text, label) {
  for (const canary of CANARIES) {
    assert.ok(!text.includes(canary), `${label} 泄漏 canary: ${canary}`);
  }
}

function collectRefs(snapshot) {
  const refs = [];
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === 'object') return Object.values(value).forEach(walk);
    if (typeof value === 'string' && value.startsWith('d_')) refs.push(value);
  };
  walk(snapshot);
  return refs;
}

test('1 固定 salt + 固定时间得到稳定对象', async () => {
  const input = makeDirtyInput();
  const a = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  const b = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  assert.deepEqual(a, b);
});

test('2 同一原始 ID 在同一导出中的代号相同', async () => {
  // createDiagnosticRef 直接幂等
  const r1 = await mod.createDiagnosticRef('same-raw-id', FIXED_SALT);
  const r2 = await mod.createDiagnosticRef('same-raw-id', FIXED_SALT);
  assert.equal(r1, r2);
  assert.match(r1, REF_PATTERN);
  // 快照内 transactionId === chatId → ref 相同
  const input = makeDirtyInput();
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  assert.equal(snap.transaction.transactionRef, snap.transaction.chatRef);
});

test('3 更换 salt 后代号不同', async () => {
  const r1 = await mod.createDiagnosticRef('raw-id', 'salt-A');
  const r2 = await mod.createDiagnosticRef('raw-id', 'salt-B');
  assert.notEqual(r1, r2);
  const input = makeDirtyInput();
  const s1 = await mod.buildDiagnosticSnapshot(input, { salt: 'salt-A', capturedAt: FIXED_TIME });
  const s2 = await mod.buildDiagnosticSnapshot(input, { salt: 'salt-B', capturedAt: FIXED_TIME });
  assert.notEqual(s1.transaction.chatRef, s2.transaction.chatRef);
});

test('4 原始 ID 与全部 canary 不出现（对象与序列化文本）', async () => {
  const input = makeDirtyInput();
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  const objectText = JSON.stringify(snap);
  const serialized = mod.serializeDiagnosticSnapshot(snap);
  assertNoCanary(objectText, '对象 JSON');
  assertNoCanary(serialized, '序列化文本');
  // 原始 ID（canary）不得以任何形式出现，只能以 d_ 代号存在
  assert.ok(!objectText.includes('CANARY_REQUEST_ID_02ef'));
  assert.ok(!objectText.includes('attempt-9f31'));
  assert.ok(!objectText.includes('generation-2a77'));
  assert.ok(!objectText.includes('commit-51dd'));
});

test('5 旧 fingerprint 不原样出现', async () => {
  const input = makeDirtyInput();
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  const text = JSON.stringify(snap);
  assert.ok(!text.includes(LEGACY_FINGERPRINT));
  assert.ok(!text.includes(LEGACY_HISTORY_HASH));
  assert.match(snap.request.contextRef, REF_PATTERN);
  assert.match(snap.request.syntheticHistoryRef, REF_PATTERN);
});

test('6 未知角色 ID 不出现，固定角色顺序稳定', async () => {
  const input = makeDirtyInput();
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  const text = JSON.stringify(snap);
  assert.ok(!text.includes(UNKNOWN_CHARACTER));
  const expectedOrder = [
    'reimu', 'marisa', 'cirno', 'alice', 'mystia', 'suika', 'nitori', 'sakuya',
    'youmu', 'patchouli', 'sanae',
  ];
  assert.deepEqual(snap.state.characterMemory.map((c) => c.characterId), expectedOrder);
  assert.deepEqual(snap.request.relevantCharacterIds, ['reimu', 'marisa']);
  // reimu 的 visit ID 经同一盐出代号；marisa 为 null 不输出
  const expectedVisitRef = await mod.createDiagnosticRef('CANARY_VISIT_ID_d900', FIXED_SALT);
  assert.deepEqual(snap.request.visitRefs, [expectedVisitRef]);
});

test('7 active/closed VisitTurn 数量准确，退役关系字段不进入诊断', async () => {
  const input = makeDirtyInput();
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  const reimu = snap.state.characterMemory.find((c) => c.characterId === 'reimu');
  assert.equal(reimu.hasActiveVisit, true);
  assert.equal(reimu.activeTurnCount, 2);
  assert.equal(reimu.closedVisitCount, 2);
  assert.equal(reimu.closedTurnCount, 1);
  assert.equal('relationshipMemoryCount' in reimu, false);
  assert.equal('activeRelationshipStateCount' in reimu, false);
  const marisa = snap.state.characterMemory.find((c) => c.characterId === 'marisa');
  assert.equal(marisa.hasActiveVisit, false);
  assert.equal(marisa.activeTurnCount, 0);
  assert.equal(marisa.closedTurnCount, 0);
  assert.equal('relationshipMemoryCount' in marisa, false);
  assert.equal('activeRelationshipStateCount' in marisa, false);
});

test('8 原始错误只变成受控 code', async () => {
  assert.equal(mod.classifyDiagnosticError('request timed out'), 'timeout');
  assert.equal(mod.classifyDiagnosticError('ABORT generation'), 'abort');
  assert.equal(mod.classifyDiagnosticError('chat switched'), 'stale-chat');
  assert.equal(mod.classifyDiagnosticError('stale attempt'), 'stale-attempt');
  assert.equal(mod.classifyDiagnosticError('empty response'), 'empty-response');
  assert.equal(mod.classifyDiagnosticError('mvu commit failed'), 'mvu-commit');
  assert.equal(mod.classifyDiagnosticError('regeneration blocked'), 'regeneration-blocked');
  assert.equal(mod.classifyDiagnosticError('database wrapper error'), 'database-wrapper');
  assert.equal(mod.classifyDiagnosticError('bad request schema'), 'request-schema');
  // 事务 lastError 只留 code
  const input = makeDirtyInput();
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  assert.equal(snap.transaction.errorCode, 'timeout');
  assert.equal(snap.runtime.lastErrorCode, 'timeout');
});

test('9 未知错误变 unknown，不带原句', async () => {
  const weird = 'SOME_WEIRD_MESSAGE_WITH_SECRET_CANARY_zz99';
  const snap = await mod.buildDiagnosticSnapshot(
    { ...makeDirtyInput(), diagnostics: { ...makeDirtyInput().diagnostics, lastError: weird } },
    { salt: FIXED_SALT, capturedAt: FIXED_TIME },
  );
  assert.equal(snap.runtime.lastErrorCode, 'unknown');
  assert.ok(!JSON.stringify(snap).includes('SOME_WEIRD_MESSAGE'));
  assert.equal(mod.classifyDiagnosticError('another unknown thing'), 'unknown');
});

test('10 空 state/request/transaction 仍产生合法 JSON', async () => {
  const input = makeDirtyInput();
  const empty = {
    state: null,
    transaction: null,
    pendingRequest: null,
    diagnostics: { ...input.diagnostics, lastError: undefined },
    memoryPort: input.memoryPort,
    appVersion: '0.2.0',
  };
  const snap = await mod.buildDiagnosticSnapshot(empty, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  assert.equal(snap.transaction, null);
  assert.equal(snap.request, null);
  assert.equal(snap.state.registeredCharacterCount, 0);
  assert.equal(snap.state.mvuUtf8Bytes, 0);
  assert.equal(snap.state.characterMemory.length, 11);
  const json = mod.serializeDiagnosticSnapshot(snap);
  assert.doesNotThrow(() => JSON.parse(json));
});

test('11 输入对象在调用前后深相等', async () => {
  const input = makeDirtyInput();
  const before = structuredClone(input);
  await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  assert.deepEqual(input, before);
});

test('12 crypto 不可用时明确失败，不使用弱兜底', async () => {
  const input = makeDirtyInput();
  const original = globalThis.crypto;
  let restored = false;
  try {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    await assert.rejects(
      mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME }),
      (err) => err?.code === 'diagnostic-crypto-unavailable',
    );
    await assert.rejects(mod.createDiagnosticRef('x', FIXED_SALT), (err) => err?.code === 'diagnostic-crypto-unavailable');
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true, writable: true });
    restored = true;
  }
  assert.equal(restored, true);
  // 恢复后仍可用
  const ref = await mod.createDiagnosticRef('x', FIXED_SALT);
  assert.match(ref, REF_PATTERN);
});

test('13 超过 64 KiB 时明确失败', async () => {
  const snap = await mod.buildDiagnosticSnapshot(
    { ...makeDirtyInput(), state: null, transaction: null, pendingRequest: null },
    { salt: FIXED_SALT, capturedAt: FIXED_TIME },
  );
  // 人为放大：registeredCharacterIds 覆盖大量条目撑爆 characterMemory
  const big = {
    ...snap,
    state: {
      ...snap.state,
      registeredCharacterCount: 0,
      characterMemory: Array.from({ length: 4000 }, (_, i) => ({
        characterId: `character_${i}`,
        hasActiveVisit: true,
        activeTurnCount: 16,
        closedVisitCount: 4,
        closedTurnCount: 64,
      })),
    },
  };
  await assert.rejects(
    async () => mod.serializeDiagnosticSnapshot(big),
    (err) => err?.code === 'diagnostic-size-limit',
  );
});

test('14 正常输出小于等于 64 KiB、末尾只有一个换行并可再次 JSON.parse', async () => {
  const input = makeDirtyInput();
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  const json = mod.serializeDiagnosticSnapshot(snap);
  const bytes = new TextEncoder().encode(json);
  assert.ok(bytes.byteLength <= 65536, `实际 ${bytes.byteLength} bytes`);
  assert.ok(json.endsWith('\n'));
  assert.ok(!json.endsWith('\n\n'));
  const reparsed = JSON.parse(json);
  assert.equal(reparsed.schema, 'gensokyo-diagnostic.v1');
});

test('15 所有 *Ref 只能为 null 或 d_ 格式', async () => {
  const input = makeDirtyInput();
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  const refs = collectRefs(snap);
  assert.ok(refs.length > 0);
  for (const ref of refs) assert.match(ref, REF_PATTERN);
  const text = JSON.stringify(snap);
  assert.ok(!text.includes(FIXED_SALT), '盐不得写入导出文件');
});

test('16 序列化使用 UTF-8 字节而非 JS 字符数计算上限', async () => {
  // 中文字符 1 字符 = 3 UTF-8 字节：字符数 < 65536 但字节数 > 65536 必须被拒，证明按字节计
  const input = makeDirtyInput();
  const base = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  const baseBytes = new TextEncoder().encode(mod.serializeDiagnosticSnapshot(base)).byteLength;
  const underN = Math.floor((65536 - baseBytes - 256) / 3);
  const under = { ...base, build: { ...base.build, bridgeVersion: '桥'.repeat(underN) } };
  const underJson = mod.serializeDiagnosticSnapshot(under);
  assert.ok(new TextEncoder().encode(underJson).byteLength <= 65536);
  assert.ok(underN < 65536, '字符数必须小于 65536 才能证明按字节计');
  const over = { ...base, build: { ...base.build, bridgeVersion: '桥'.repeat(underN + 128) } };
  await assert.rejects(
    async () => mod.serializeDiagnosticSnapshot(over),
    (err) => err?.code === 'diagnostic-size-limit',
  );
});

test('17 未知 stopReason/recovery 映射为 null 而非原样透传', async () => {
  const input = makeDirtyInput();
  const weird = {
    ...input,
    transaction: { ...input.transaction, stopReason: 'random-free-text-xyz', recovery: 'made-up-state' },
  };
  const snap = await mod.buildDiagnosticSnapshot(weird, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  assert.equal(snap.transaction.stopReason, null);
  assert.equal(snap.transaction.recovery, null);
  const ok = {
    ...input,
    transaction: { ...input.transaction, stopReason: 'chat-switch', recovery: 'incomplete' },
  };
  const snapOk = await mod.buildDiagnosticSnapshot(ok, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  assert.equal(snapOk.transaction.stopReason, 'chat-switch');
  assert.equal(snapOk.transaction.recovery, 'incomplete');
});

test('18 调用方不能覆盖固定角色白名单', async () => {
  const input = makeDirtyInput();
  const privateId = 'PRIVATE_CUSTOM_CHARACTER_NAME_7b91';
  input.state.interaction.visit_memory.by_character[privateId] = {
    active_visit: null, closed_visits: [], relationship_memories: [],
  };
  input.registeredCharacterIds = [privateId];
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  assert.ok(!JSON.stringify(snap).includes(privateId));
  assert.deepEqual(snap.state.characterMemory.map((item) => item.characterId), [
    'reimu', 'marisa', 'cirno', 'alice', 'mystia', 'suika', 'nitori', 'sakuya',
    'youmu', 'patchouli', 'sanae',
  ]);
});

test('19 schema/revision/capturedAt 只输出受控值', async () => {
  const input = makeDirtyInput();
  const canary = 'PRIVATE_SCHEMA_CANARY_5ef2';
  input.transaction.requestSchema = canary;
  input.pendingRequest.schema = canary;
  input.pendingRequest.promptRevision = canary;
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: canary });
  const text = JSON.stringify(snap);
  assert.ok(!text.includes(canary));
  assert.equal(snap.transaction.requestSchema, null);
  assert.equal(snap.request, null);
  assert.match(snap.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('20 settlement 恢复状态保留，未知数据库版本不透传', async () => {
  const input = makeDirtyInput();
  input.transaction.recovery = 'settlement';
  input.diagnostics.databaseAvailable = true;
  input.diagnostics.databaseVersion = 'PRIVATE_DATABASE_VERSION_CANARY_11aa';
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  assert.equal(snap.transaction.recovery, 'settlement');
  assert.equal(snap.runtime.databaseVersion, null);
  assert.ok(!JSON.stringify(snap).includes('PRIVATE_DATABASE_VERSION_CANARY_11aa'));
});

test('21 攻击性键名审计、受控枚举与允许版本字段同时成立', async () => {
  const input = makeDirtyInput();
  const canary = 'PRIVATE_ENUM_CANARY_82bb';
  input.transaction.kind = canary;
  input.diagnostics.mode = canary;
  input.appVersion = 'Bearer SECRET VERSION';
  input.diagnostics.tavernVersion = 'Cookie SECRET VERSION';
  input.diagnostics.helperVersion = 'Token SECRET VERSION';
  input.diagnostics.bridgeVersion = 'Private Bridge Version';
  input.diagnostics.generationTransport = canary;
  input.diagnostics.regenerationTransport = canary;
  input.memoryPort.profile = canary;
  input.memoryPort.capability = canary;
  const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
  assert.equal(snap.transaction, null);
  assert.equal(snap.runtime.mode, 'preview');
  assert.equal(snap.build.appVersion, 'unknown');
  assert.equal(snap.build.bridgeVersion, 'unknown');
  assert.equal(snap.runtime.tavernVersion, 'unknown');
  assert.equal(snap.runtime.helperVersion, 'unknown');
  assert.equal(snap.runtime.generationTransport, 'unknown');
  assert.equal(snap.runtime.regenerationTransport, 'unknown');
  assert.equal(snap.build.memoryProfile, 'standalone-mvu');
  assert.equal(snap.runtime.memoryCapability, 'unavailable');
  const text = JSON.stringify(snap);
  assert.ok(!text.includes(canary));
  const forbidden = ['text', 'content', 'summary', 'stack', 'cookie', 'token', 'secret', 'row', 'rows', 'html'];
  const allowedPromptKey = 'promptRevision';
  const allowedStoryDeclaration = 'includesStoryText';
  const allowedDatabaseDeclaration = 'includesDatabaseRows';
  const walkKeys = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^a-z0-9]+/i).map((word) => word.toLowerCase());
      if (key !== allowedStoryDeclaration && key !== allowedDatabaseDeclaration) {
        for (const word of forbidden) assert.ok(!words.includes(word), `禁止诊断键名：${key}`);
      }
      if (words.includes('prompt')) assert.equal(key, allowedPromptKey);
      walkKeys(child);
    }
  };
  walkKeys(snap);
  assert.equal(snap.request.promptRevision, 'gal-prompt.v1');
});

test('22 同一正常输入连续构造 100 次稳定且均低于 64 KiB', async () => {
  const input = makeDirtyInput();
  const before = structuredClone(input);
  let expected;
  for (let index = 0; index < 100; index += 1) {
    const snap = await mod.buildDiagnosticSnapshot(input, { salt: FIXED_SALT, capturedAt: FIXED_TIME });
    const json = mod.serializeDiagnosticSnapshot(snap);
    assert.ok(new TextEncoder().encode(json).byteLength <= 65536);
    expected ??= json;
    assert.equal(json, expected);
  }
  assert.deepEqual(input, before);
});
