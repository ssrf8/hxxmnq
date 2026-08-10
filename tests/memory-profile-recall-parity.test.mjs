// 第四批 R2-T01：两种 build profile 始终使用同一套卡内 MVU 召回。
// 数据库 adapter 的存在与返回不得进入请求构造、synthetic history、hash 或 config fingerprint。
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
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const requestModule = await importTypescript('../src/ui/gal-generation-request.ts');
const configModule = await importTypescript('../src/ui/gal-generate-config.ts');
const standaloneModule = await importTypescript('../src/ui/memory-adapters/standalone-mvu.ts');
const databaseModule = await importTypescript('../src/ui/memory-adapters/database-assisted.ts');

const turn = (id, summary, overrides = {}) => ({
  turn_id: `${id}:reimu`,
  request_id: id,
  character_id: 'reimu',
  scene_id: 'scene:r2',
  assistant_message_id: 20,
  assistant_swipe_id: 0,
  latest_attempt_id: `${id}:attempt-1`,
  latest_commit_key: `${id}:${id}:attempt-1`,
  day: 3,
  time_period: '白昼',
  period_serial: 3,
  summary,
  ...overrides,
});

const visit = (visitId, turns, overrides = {}) => ({
  visit_id: visitId,
  character_id: 'reimu',
  source: 'model-presence',
  arrival_uid: null,
  started_day: 1,
  started_time_period: '清晨',
  started_period_serial: 1,
  ended_day: null,
  ended_time_period: null,
  ended_period_serial: null,
  end_reason: null,
  turns,
  ...overrides,
});

const relationship = (id, kind, summary, overrides = {}) => ({
  relationship_memory_id: id,
  character_id: 'reimu',
  request_id: 'request-r2',
  visit_id: 'character_visit_000002',
  day: 3,
  time_period: '白昼',
  period_serial: 3,
  kind,
  relationship_label: null,
  event_kind: null,
  summary,
  significance: 2,
  active: false,
  latest_attempt_id: 'request-r2:attempt-1',
  latest_commit_key: 'request-r2:request-r2:attempt-1',
  ...overrides,
});

const state = {
  characters: {
    reimu: { id: 'reimu', name: '博丽灵梦' },
    marisa: { id: 'marisa', name: '雾雨魔理沙' },
  },
  presence_snapshot: { present_character_ids: ['reimu'] },
  interaction: {
    visit_memory: {
      version: 'character-visit-memory.v2',
      by_character: {
        reimu: {
          character_id: 'reimu',
          active_visit: visit('character_visit_000002', [turn('request-current', 'R2_CURRENT_VISIT_CANARY')]),
          closed_visits: [visit(
            'character_visit_000001',
            [turn('request-past', 'R2_CLOSED_VISIT_CANARY', { day: 1, period_serial: 1 })],
            { ended_day: 1, ended_time_period: '夜晚', ended_period_serial: 1, end_reason: 'presence-receipt' },
          )],
          legacy_memories: [],
        },
        marisa: {
          character_id: 'marisa',
          active_visit: null,
          closed_visits: [visit('character_visit_000099', [
            turn('request-other', 'R2_UNRELATED_CHARACTER_CANARY', { character_id: 'marisa' }),
          ], { character_id: 'marisa', ended_day: 1, ended_period_serial: 1 })],
          legacy_memories: [],
        },
      },
      legacy_unassigned: [],
    },
  },
  // 投影器没有真实聊天输入通道；这个 canary 必须永远不可见。
  chat_messages: ['R2_REAL_CHAT_FLOOR_CANARY'],
};

const buildInput = () => ({
  playerInput: '检查结界。',
  state: structuredClone(state),
  snapshot: {
    ownerCharacterId: 'reimu',
    chatId: 'chat-r2-parity',
    stateMessageIdBeforeGeneration: 20,
    stateSwipeIdBeforeGeneration: 0,
    sceneId: 'scene:r2',
    historyFingerprintInput: 'ignored-r2',
  },
  characterContext: { mainTargetCharacterId: 'reimu', requireMainTarget: true },
  characterNames: { reimu: '博丽灵梦', marisa: '雾雨魔理沙' },
  contractInjector: (text) => `【R2协议】${text}`,
  requestId: 'request-r2-fixed',
  now: 1750000000000,
});

const withoutGenerationId = (config) => {
  const { generation_id: _ignored, ...rest } = config;
  return rest;
};

test('R2-T01：两 profile 的 adapter 结果不参与卡内请求，request/history/hash/config 逐字节相同', async () => {
  let getterReads = 0;
  Object.defineProperty(globalThis, 'AutoCardUpdaterAPI', {
    configurable: true,
    get() {
      getterReads += 1;
      throw new Error('请求构造不得读取数据库');
    },
  });
  try {
    const standalone = standaloneModule.createMemoryAdapter();
    const database = databaseModule.createMemoryAdapter();
    await standalone.recall({ archiveScopeId: 'scope', relevantCharacterIds: ['reimu'], localMemory: null, requestId: 'r' });
    await database.recall({ archiveScopeId: 'scope', relevantCharacterIds: ['reimu'], localMemory: null, requestId: 'r' });

    const standaloneRequest = requestModule.buildGalGenerationRequestV2(buildInput());
    const databaseRequest = requestModule.buildGalGenerationRequestV2(buildInput());
    assert.equal(standaloneRequest.ok, true);
    assert.equal(databaseRequest.ok, true);
    assert.deepEqual(databaseRequest, standaloneRequest);
    assert.equal(getterReads, 0);

    const history = standaloneRequest.request.syntheticHistory[0].content;
    assert.match(history, /R2_CURRENT_VISIT_CANARY/u);
    assert.match(history, /R2_CLOSED_VISIT_CANARY/u);
    assert.doesNotMatch(history, /R2_RELATIONSHIP_STATE_CANARY|R2_RELATIONSHIP_EVENT_CANARY/u);
    assert.doesNotMatch(history, /R2_UNRELATED_CHARACTER_CANARY/u);
    assert.doesNotMatch(history, /R2_REAL_CHAT_FLOOR_CANARY/u);

    const standaloneConfig = configModule.buildGalGenerateConfig(standaloneRequest.request, { generationId: 'standalone-gen' });
    const databaseConfig = configModule.buildGalGenerateConfig(databaseRequest.request, { generationId: 'database-gen' });
    assert.equal(standaloneConfig.ok, true);
    assert.equal(databaseConfig.ok, true);
    assert.deepEqual(
      withoutGenerationId(databaseConfig.built.config),
      withoutGenerationId(standaloneConfig.built.config),
    );
    assert.equal(databaseConfig.built.configFingerprint, standaloneConfig.built.configFingerprint);
  } finally {
    delete globalThis.AutoCardUpdaterAPI;
  }
});

test('R2-T01：同一 profile fixture 重复 100 次 history/hash/fingerprint 稳定', () => {
  const baseline = requestModule.buildGalGenerationRequestV2(buildInput());
  assert.equal(baseline.ok, true);
  for (let index = 0; index < 100; index += 1) {
    const current = requestModule.buildGalGenerationRequestV2(buildInput());
    assert.equal(current.ok, true);
    assert.deepEqual(current.request.syntheticHistory, baseline.request.syntheticHistory);
    assert.equal(current.request.syntheticHistoryHash, baseline.request.syntheticHistoryHash);
    assert.equal(current.request.contextFingerprint, baseline.request.contextFingerprint);
  }
});

test('R2-T01：请求构造 import graph 不可达任何数据库或旧主动召回模块', async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/ui/gal-generation-request.ts', import.meta.url))],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
  });
  const inputs = Object.keys(result.metafile.inputs).join('\n').replaceAll('\\', '/');
  for (const forbidden of [
    'memory-adapter-selection.ts',
    'memory-adapters/database-assisted.ts',
    'memory-recall-pipeline.ts',
    'memory-upsert-plan.ts',
    'memory-host-call.ts',
    'memory-archive-schema.ts',
    'database-adapter.ts',
  ]) {
    assert.doesNotMatch(inputs, new RegExp(forbidden.replaceAll('.', '\\.')));
  }
});
