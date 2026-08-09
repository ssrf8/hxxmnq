// 第三批 B3-T02 —— 统一 generate-config builder（send 与 regenerate 共用）。
// 覆盖 runbook §6.1–6.3：
//   - characterization：输出 config 形状与当前 V2 send config 一致；
//   - send/regenerate 除 generation_id 外 config 深相等；
//   - frozen request 每个字段逐字节未变；
//   - 纯函数：不读宿主（聊天/state/presence），同一输入输出稳定；
//   - 旧 assistant 文本永不进入 prompts（prompts 深等于冻结 syntheticHistory）；
//   - V2 恰好一条非空 system 合成历史（0/2/非 system/空白都拒绝）；
//   - configFingerprint 稳定且排除 generation_id。
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

const g = await importTypescript('../src/ui/gal-generate-config.ts');

const SYNTHETIC = [
  { role: 'system', content: '【历史边界】本请求不读取 SillyTavern 真实聊天楼层。' },
];
const INJECT = {
  position: 'in_chat', depth: 1, role: 'system', content: '【庭园正文协议】\n测试注入', should_scan: false,
};
const hashText = (value) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

const v2Request = (overrides = {}) => ({
  schema: 'gal-generation-request.v2',
  requestId: 'gal-req-v2-0001',
  chatId: 'chat-b3-1',
  ownerCharacterId: 'reimu',
  playerMessageId: 101,
  promptRevision: 'gal-prompt.v1',
  historyRevision: 'gal-synthetic-history.v1',
  memoryRevision: 'character-visit-memory.v1',
  sceneId: 'scene:shrine',
  stateMessageIdBeforeGeneration: 99,
  stateSwipeIdBeforeGeneration: 0,
  relevantCharacterIds: ['reimu', 'marisa'],
  visitIdsByCharacter: { reimu: 'character_visit_000001', marisa: null },
  syntheticHistory: SYNTHETIC,
  syntheticHistoryHash: 'a1b2c3d4',
  contextFingerprint: 'deadbeef',
  visibleUserText: '你好，灵梦',
  modelUserInput: '你好，灵梦',
  attemptSeq: 1,
  createdAt: '2026-08-09T00:00:00.000Z',
  ...overrides,
});

const injectedRequest = (overrides = {}) => v2Request({
  promptRevision: 'gal-prompt.v2',
  promptInjects: [INJECT],
  promptInjectsHash: hashText(INJECT.content),
  ...overrides,
});

test('gal-prompt.v2 config 只在 injects 携带单条冻结 system 注入', () => {
  const result = g.buildGalGenerateConfig(injectedRequest(), { generationId: 'gal-gen-v2' });
  assert.equal(result.ok, true);
  assert.equal(result.built.config.user_input, '你好，灵梦');
  assert.deepEqual(result.built.config.injects, [INJECT]);
  assert.doesNotMatch(result.built.config.user_input, /【庭园正文协议】/);
  assert.deepEqual(result.built.config.overrides.chat_history.prompts, SYNTHETIC);
});

test('gal-prompt.v2 缺失、双份、错误字段、空内容或 hash 漂移均失败闭合', () => {
  const invalid = [
    injectedRequest({ promptInjects: undefined }),
    injectedRequest({ promptInjects: [INJECT, INJECT] }),
    injectedRequest({ promptInjects: [{ ...INJECT, role: 'user' }] }),
    injectedRequest({ promptInjects: [{ ...INJECT, position: 'none' }] }),
    injectedRequest({ promptInjects: [{ ...INJECT, depth: 0 }] }),
    injectedRequest({ promptInjects: [{ ...INJECT, should_scan: true }] }),
    injectedRequest({ promptInjects: [{ ...INJECT, content: '   ' }] }),
    injectedRequest({ promptInjectsHash: 'deadbeef' }),
  ];
  for (const request of invalid) {
    const result = g.buildGalGenerateConfig(request, { generationId: 'gal-gen-invalid' });
    assert.deepEqual(result, { ok: false, code: 'invalid-injection' });
  }
});

// ---- characterization：输出形状与当前 V2 send config 一致 ----
test('builder 输出 config 形状与当前 V2 send config 一致（含 with_depth_entries:false）', () => {
  const result = g.buildGalGenerateConfig(v2Request(), { generationId: 'gal-gen-send-1' });
  assert.equal(result.ok, true);
  const { config } = result.built;
  assert.equal(config.generation_id, 'gal-gen-send-1');
  assert.equal(config.user_input, '你好，灵梦');
  assert.equal(config.should_stream, false);
  assert.equal(config.should_silence, true);
  assert.deepEqual(config.overrides, {
    chat_history: {
      prompts: SYNTHETIC,
      with_depth_entries: false,
    },
  });
  assert.equal(result.built.schema, 'gal-generate-config.v1');
});

// ---- send/regenerate 同构 ----
test('send 与 regenerate 除 generation_id 外 config 深相等', () => {
  const request = injectedRequest();
  const send = g.buildGalGenerateConfig(request, { generationId: 'gal-gen-send-1' });
  const regen = g.buildGalGenerateConfig(request, { generationId: 'gal-gen-regen-2' });
  assert.equal(send.ok, true);
  assert.equal(regen.ok, true);
  assert.deepEqual({ ...send.built.config, generation_id: 'X' }, { ...regen.built.config, generation_id: 'X' });
  assert.notEqual(send.built.config.generation_id, regen.built.config.generation_id);
  // fingerprint 相同（generation_id 不进入 fingerprint）
  assert.equal(send.built.configFingerprint, regen.built.configFingerprint);
});

test('frozen request 每个字段逐字节未变（builder 纯函数不改 request）', () => {
  const request = v2Request();
  const before = structuredClone(request);
  const result = g.buildGalGenerateConfig(request, { generationId: 'gal-gen-1' });
  assert.equal(result.ok, true);
  assert.deepEqual(request, before);
});

// ---- 纯函数：不读宿主 ----
test('builder 是纯函数：同一输入多次调用输出完全一致（不读聊天/state/presence）', () => {
  const request = v2Request();
  const a = g.buildGalGenerateConfig(request, { generationId: 'gal-gen-1' });
  const b = g.buildGalGenerateConfig(request, { generationId: 'gal-gen-1' });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepEqual(a.built, b.built);
});

test('request 的无关未知字段不改变 config（聊天/state/presence 之类宿主信息不会进入 config）', () => {
  const request = v2Request({ extraUnknownField: { presence: 'whatever', latestState: 42 } });
  const result = g.buildGalGenerateConfig(request, { generationId: 'gal-gen-1' });
  assert.equal(result.ok, true);
  // 未知字段不进 config；prompts 仍是冻结合成历史
  assert.deepEqual(result.built.config.overrides.chat_history.prompts, SYNTHETIC);
  assert.equal('extraUnknownField' in result.built.config, false);
});

// ---- 旧 assistant 文本永不进入 prompts ----
test('旧 assistant 文本永不进入 prompts：prompts 深等于冻结 syntheticHistory，且无真实楼层', () => {
  const request = v2Request({
    syntheticHistory: [{ role: 'system', content: '【历史边界】只有这条历史。' }],
  });
  const result = g.buildGalGenerateConfig(request, { generationId: 'gal-gen-1' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.built.config.overrides.chat_history.prompts, [
    { role: 'system', content: '【历史边界】只有这条历史。' },
  ]);
  const anyRealFloorText = JSON.stringify(result.built.config).includes('assistant 旧正文');
  assert.equal(anyRealFloorText, false);
});

// ---- V2 恰好一条非空 system ----
test('V2 要求恰好一条非空 system 合成历史：0/2/非 system/空白都拒绝', () => {
  const cases = [
    { syntheticHistory: [] },
    { syntheticHistory: [{ role: 'system', content: 'a' }, { role: 'system', content: 'b' }] },
    { syntheticHistory: [{ role: 'user', content: 'a' }] },
    { syntheticHistory: [{ role: 'system', content: '' }] },
    { syntheticHistory: [{ role: 'system', content: '   ' }] },
    { syntheticHistory: 'not-array' },
  ];
  for (const overrides of cases) {
    const result = g.buildGalGenerateConfig(v2Request(overrides), { generationId: 'gal-gen-1' });
    assert.equal(result.ok, false, JSON.stringify(overrides));
    assert.equal(result.code, 'invalid-history');
  }
});

test('非 V2 request → not-v2', () => {
  const v1 = {
    schema: 'gal-generation-request.v1',
    requestId: 'gal-req-1',
    chatId: 'chat-1',
    ownerCharacterId: 'reimu',
    promptRevision: 'gal-prompt.v1',
    sceneId: null,
    stateMessageIdBeforeGeneration: 1,
    stateSwipeIdBeforeGeneration: 0,
    contextFingerprint: 'x',
    visibleUserText: 'hi',
    modelUserInput: 'hi',
    attemptSeq: 1,
    createdAt: '2026-08-09T00:00:00.000Z',
  };
  const result = g.buildGalGenerateConfig(v1, { generationId: 'gal-gen-1' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'not-v2');
});

// ---- configFingerprint ----
test('configFingerprint：任一正式字段变化 fingerprint 必变；key 顺序无关', () => {
  const base = g.buildGalGenerateConfig(injectedRequest(), { generationId: 'g1' });
  assert.equal(base.ok, true);
  const changedInput = g.buildGalGenerateConfig(injectedRequest({ modelUserInput: '你好，魔理沙' }), { generationId: 'g1' });
  assert.equal(changedInput.ok, true);
  assert.notEqual(base.built.configFingerprint, changedInput.built.configFingerprint);
  const changedInject = { ...INJECT, content: `${INJECT.content}\n新状态` };
  const changedInjection = g.buildGalGenerateConfig(injectedRequest({
    promptInjects: [changedInject],
    promptInjectsHash: hashText(changedInject.content),
  }), { generationId: 'g1' });
  assert.equal(changedInjection.ok, true);
  assert.notEqual(base.built.configFingerprint, changedInjection.built.configFingerprint);
  // 手动构造等价 config 对象验证 key 顺序不影响 stableStringify
  const manual = g.stableStringify({ a: 1, b: { c: [1, 2] } });
  const manual2 = g.stableStringify({ b: { c: [1, 2] }, a: 1 });
  assert.equal(manual, manual2);
});
