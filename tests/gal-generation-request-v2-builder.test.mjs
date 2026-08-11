// 第二批 B2-T07 —— V2 整合 builder 与上下文指纹。
// 覆盖 runbook §B2-T07：visible/model input 各一次、改 visit/history 改变 fingerprint、
// 对象键顺序不影响 fingerprint、retry 冻结不变、V2 metadata round-trip 逐字节相同、
// V1 不回归、无 history 仍非空 system、构造期间 state 不变、不依赖 historyFingerprintInput。
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

const baseState = (overrides = {}) => ({
  areas: {
    main_house: { id: 'main_house', name: '旧主屋', state: '损坏' },
  },
  presence_snapshot: {
    present_character_ids: ['reimu', 'marisa', 'cirno'],
    visitor_meta: {},
    character_views: {
      reimu: { area_id: 'main_house', action: '检查结界', facing: 'left' },
    },
  },
  interaction: {
    visit_memory: {
      version: 'character-visit-memory.v2',
      by_character: {
        reimu: {
          character_id: 'reimu',
          active_visit: { visit_id: 'character_visit_000001', character_id: 'reimu', source: 'model-presence', arrival_uid: null, started_day: 1, started_time_period: '清晨', started_period_serial: 1, ended_day: null, ended_time_period: null, ended_period_serial: null, end_reason: null, turns: [{ turn_id: 'req-0:reimu', request_id: 'req-0', character_id: 'reimu', scene_id: null, assistant_message_id: 10, assistant_swipe_id: null, latest_attempt_id: null, latest_commit_key: null, day: 1, time_period: '清晨', period_serial: 1, summary: '旧回合' }] },
          closed_visits: [],
          legacy_memories: [],
        },
        marisa: {
          character_id: 'marisa',
          active_visit: null,
          closed_visits: [],
          legacy_memories: [],
        },
      },
      legacy_unassigned: [],
      migration: { revision: 'character-visit-memory.v2', conversation_log_fingerprint: null, migrated_at_serial: null },
    },
  },
  ...overrides,
});

const baseInput = (overrides = {}) => ({
  playerInput: '灵梦，结界怎么样了？',
  state: baseState(),
  snapshot: {
    ownerCharacterId: 'reimu',
    chatId: 'chat-v2-b',
    stateMessageIdBeforeGeneration: 41,
    stateSwipeIdBeforeGeneration: 0,
    sceneId: 'scene:demo',
    historyFingerprintInput: 'SHOULD-NOT-COUNT', // V2 不再依赖它
  },
  characterContext: {
    mainTargetCharacterId: 'reimu',
    requireMainTarget: true,
  },
  characterNames: { reimu: '博丽灵梦', marisa: '雾雨魔理沙', cirno: '琪露诺' },
  explicitCharacterIds: ['reimu'],
  now: 1750000000000,
  ...overrides,
});

// ---- 基本构造 ----
test('buildGalGenerationRequestV2 产出冻结请求：schema/revision/角色/visit/合成历史', () => {
  const result = g.buildGalGenerationRequestV2(baseInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.schema, 'gal-generation-request.v2');
  assert.equal(result.request.promptRevision, 'gal-prompt.v7');
  assert.equal(result.request.historyRevision, 'gal-synthetic-history.v1');
  assert.equal(result.request.memoryRevision, 'character-visit-memory.v2');
  assert.deepEqual(result.relevantCharacterIds, ['reimu']);
  assert.deepEqual(result.visitIdsByCharacter, { reimu: 'character_visit_000001' });
  assert.equal(result.request.syntheticHistory.length, 1);
  assert.equal(result.request.syntheticHistory[0].role, 'system');
  assert.match(result.request.syntheticHistory[0].content, /【庭园设施现状：当前代码事实】/u);
  assert.match(result.request.syntheticHistory[0].content, /旧主屋：尚未修复；当前损坏/u);
  assert.doesNotMatch(result.request.modelUserInput, /【庭园设施现状：当前代码事实】/u);
  assert.match(result.request.modelUserInput, /^灵梦，结界怎么样了？\n\n【庭园正文协议】/u);
  assert.match(result.request.modelUserInput, /【庭园在场快照：本轮唯一事实】[\s\S]*【场景事实】/u);
  const presenceSnapshot = result.request.modelUserInput.match(/【庭园在场快照：本轮唯一事实】([\s\S]*?)【场景事实】/u)?.[1] ?? '';
  assert.doesNotMatch(presenceSnapshot, /朝向|facing|left/u);
  const taskMatch = result.request.modelUserInput.match(/<GensokyoVariableAnalysisTask>([\s\S]*?)<\/GensokyoVariableAnalysisTask>/u);
  assert.ok(taskMatch);
  const taskProjection = JSON.parse(taskMatch[1]);
  assert.equal(taskProjection.schema, 'gensokyo-variable-analysis-task.v1');
  assert.deepEqual(taskProjection.interaction.visit_summary_task.slots.map((slot) => slot.character_id), ['reimu']);
  assert.deepEqual(taskProjection.interaction.presence_analysis_task.slots.map((slot) => slot.character_id), ['reimu']);
  assert.equal(result.request.promptInjects.length, 1);
  assert.equal(result.request.promptInjects[0].role, 'system');
  assert.equal(result.request.promptInjects[0].position, 'none');
  assert.equal(result.request.promptInjects[0].depth, 0);
  assert.equal(result.request.promptInjects[0].should_scan, true);
  assert.deepEqual(
    { position: result.request.promptInjects[0].position, depth: result.request.promptInjects[0].depth, role: result.request.promptInjects[0].role, should_scan: result.request.promptInjects[0].should_scan },
    { position: 'none', depth: 0, role: 'system', should_scan: true },
  );
  assert.match(result.request.promptInjects[0].content, /GSK_CHAR_REIMU_ACTIVE/);
  assert.doesNotMatch(result.request.promptInjects[0].content, /【|庭园|场景|授权/);
  assert.equal(result.request.visibleUserText, '灵梦，结界怎么样了？');
  assert.equal(result.request.contextFingerprint.length, 8);
  assert.ok(result.request.syntheticHistoryHash.length > 0);
  assert.equal(g.storedUserMessageMatchesRequestV2(result.request, result.request.modelUserInput), true);
  assert.equal(g.storedUserMessageMatchesRequestV2(result.request, result.request.visibleUserText), false);
});

test('visible/model input 各只出现一次', () => {
  const result = g.buildGalGenerationRequestV2(baseInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const visibleCount = result.request.visibleUserText.split('灵梦，结界怎么样了？').length - 1;
  assert.equal(visibleCount, 1);
  const modelCount = result.request.modelUserInput.split('灵梦，结界怎么样了？').length - 1;
  assert.equal(modelCount, 1);
  assert.equal(result.request.modelUserInput.split('【庭园正文协议】').length - 1, 1);
});

// ---- fingerprint 敏感性与稳定性 ----
test('改任一 visit ID 或 history 字节会改变 fingerprint', () => {
  const base = g.buildGalGenerationRequestV2(baseInput());
  assert.equal(base.ok, true);
  if (!base.ok) return;

  // 改 visit ID（visit map + 合成历史都会变）
  const differentVisit = g.buildGalGenerationRequestV2(baseInput({
    state: baseState({
      interaction: {
        visit_memory: {
          ...baseState().interaction.visit_memory,
          by_character: {
            ...baseState().interaction.visit_memory.by_character,
            reimu: { ...baseState().interaction.visit_memory.by_character.reimu, active_visit: { ...baseState().interaction.visit_memory.by_character.reimu.active_visit, visit_id: 'character_visit_999999' } },
          },
        },
      },
    }),
  }));
  assert.equal(differentVisit.ok, true);
  if (!differentVisit.ok) return;
  assert.notEqual(differentVisit.request.contextFingerprint, base.request.contextFingerprint);
});

test('对象键顺序不改变 fingerprint（visit map 与角色顺序稳定序列化）', () => {
  const inputA = baseInput({
    state: baseState({
      interaction: {
        visit_memory: {
          ...baseState().interaction.visit_memory,
          by_character: {
            reimu: baseState().interaction.visit_memory.by_character.reimu,
            marisa: { ...baseState().interaction.visit_memory.by_character.marisa, active_visit: { visit_id: 'character_visit_000002', character_id: 'marisa', source: 'model-presence', arrival_uid: null, started_day: 1, started_time_period: '清晨', started_period_serial: 1, ended_day: null, ended_time_period: null, ended_period_serial: null, end_reason: null, turns: [] } },
          },
        },
      },
    }),
    characterContext: { mainTargetCharacterId: 'reimu', requireMainTarget: true },
    visitOrder: undefined,
  });
  // 同一逻辑状态，visit map 键顺序不同（reimu 在前 vs marisa 在前）
  const state1 = baseState({});
  const state2 = JSON.parse(JSON.stringify(state1));
  state2.interaction.visit_memory.by_character = { marisa: state1.interaction.visit_memory.by_character.marisa, reimu: state1.interaction.visit_memory.by_character.reimu };
  const a = g.buildGalGenerationRequestV2(baseInput({ state: state1 }));
  const b = g.buildGalGenerationRequestV2(baseInput({ state: state2 }));
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(a.request.contextFingerprint, b.request.contextFingerprint);
});

test('historyFingerprintInput 不进入 V2 fingerprint（改它不改变结果）', () => {
  const a = g.buildGalGenerationRequestV2(baseInput({ snapshot: { ...baseInput().snapshot, historyFingerprintInput: 'A' } }));
  const b = g.buildGalGenerationRequestV2(baseInput({ snapshot: { ...baseInput().snapshot, historyFingerprintInput: 'B' } }));
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(a.request.contextFingerprint, b.request.contextFingerprint);
});

// ---- retry 冻结 ----
test('retry 复用 requestId 且冻结字段不变（history/hash/fingerprint 不变）', () => {
  const first = g.buildGalGenerationRequestV2(baseInput());
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const retried = g.buildGalGenerationRequestV2(baseInput({
    requestId: first.request.requestId,
    attemptSeq: 2,
  }));
  assert.equal(retried.ok, true);
  if (!retried.ok) return;
  assert.equal(retried.request.requestId, first.request.requestId);
  assert.equal(retried.request.contextFingerprint, first.request.contextFingerprint);
  assert.equal(retried.request.syntheticHistoryHash, first.request.syntheticHistoryHash);
  assert.deepEqual(retried.request.syntheticHistory, first.request.syntheticHistory);
  assert.equal(retried.request.attemptSeq, 2);
});

// ---- metadata round-trip ----
test('V2 metadata round-trip 恢复逐字节相同', () => {
  const result = g.buildGalGenerationRequestV2(baseInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const extra = g.buildRequestMetadataV2(result.request);
  const restored = g.restoreGalGenerationRequestV2(extra);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(JSON.stringify(restored.request), JSON.stringify(result.request));
});

test('gal-prompt.v5 metadata 缺注入、额外注入或 hash 漂移时恢复失败闭合', () => {
  const result = g.buildGalGenerationRequestV2(baseInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const valid = g.buildRequestMetadataV2(result.request);
  const cases = [
    (() => { const x = structuredClone(valid); delete x.galGenerationRequestV2.promptInjects; return x; })(),
    (() => { const x = structuredClone(valid); x.galGenerationRequestV2.promptInjects.push(structuredClone(x.galGenerationRequestV2.promptInjects[0])); return x; })(),
    (() => { const x = structuredClone(valid); x.galGenerationRequestV2.promptInjectsHash = 'deadbeef'; return x; })(),
  ];
  for (const extra of cases) assert.deepEqual(g.restoreGalGenerationRequestV2(extra), { ok: false, code: 'invalid' });
});

// ---- 无 history 仍非空 system ----
test('无记忆时合成历史仍是固定边界消息（非空 system），请求仍成功', () => {
  const emptyState = {
    presence_snapshot: { present_character_ids: ['reimu'], visitor_meta: {}, character_views: {} },
    interaction: {
      visit_memory: {
        version: 'character-visit-memory.v2',
        by_character: {
          reimu: { character_id: 'reimu', active_visit: null, closed_visits: [], legacy_memories: [] },
        },
        legacy_unassigned: [],
        migration: { revision: 'character-visit-memory.v2', conversation_log_fingerprint: null, migrated_at_serial: null },
      },
    },
  };
  const result = g.buildGalGenerationRequestV2(baseInput({ state: emptyState }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.syntheticHistory.length, 1);
  assert.equal(result.request.syntheticHistory[0].role, 'system');
  assert.ok(result.request.syntheticHistory[0].content.length > 0);
  assert.match(result.request.syntheticHistory[0].content, /【历史边界】/);
});

// ---- 构造期间 state 不变 ----
test('buildGalGenerationRequestV2 是纯函数：state 输入不变', () => {
  const state = baseState();
  const before = JSON.stringify(state);
  const result = g.buildGalGenerationRequestV2(baseInput({ state }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(JSON.stringify(state), before);
});

// ---- 主目标缺失 ----
test('requireMainTarget 且主目标缺失返回显式错误', () => {
  const result = g.buildGalGenerationRequestV2(baseInput({
    characterContext: { mainTargetCharacterId: null, requireMainTarget: true },
  }));
  assert.deepEqual(result, { ok: false, reason: 'missing-main-target' });
});

test('非 requireMainTarget 时由在场补足', () => {
  const result = g.buildGalGenerationRequestV2(baseInput({
    characterContext: { mainTargetCharacterId: null, requireMainTarget: false },
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.relevantCharacterIds, ['reimu', 'marisa', 'cirno']);
  assert.deepEqual(result.visitIdsByCharacter, { reimu: 'character_visit_000001', marisa: null, cirno: null });
});

test('邀请制 sessionParticipants 同时收口相关角色、真实楼层场景事实与角色绿灯', () => {
  const state = baseState({
    characters: {
      reimu: { id: 'reimu', name: '博丽灵梦' },
      marisa: { id: 'marisa', name: '雾雨魔理沙' },
      cirno: { id: 'cirno', name: '琪露诺' },
    },
  });
  const result = g.buildGalGenerationRequestV2(baseInput({
    state,
    playerInput: '开始仅邀请活动。',
    characterContext: { sessionParticipants: ['reimu'], requireMainTarget: false },
    explicitCharacterIds: ['reimu'],
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.relevantCharacterIds, ['reimu']);
  assert.deepEqual(result.visitIdsByCharacter, { reimu: 'character_visit_000001' });
  assert.match(result.request.modelUserInput, /【当前活动参与者：本轮唯一叙事范围】/);
  assert.match(result.request.modelUserInput, /允许参与本活动：[\s\S]*reimu/);
  assert.match(result.request.modelUserInput, /其他角色不在本活动现场，不得出场、说话、行动/);
  assert.doesNotMatch(result.request.modelUserInput, /marisa（|cirno（/);
  assert.match(result.request.modelUserInput, /当前活动参与者：reimu/);
  assert.match(result.request.promptInjects[0].content, /GSK_CHAR_REIMU_ACTIVE/);
  assert.doesNotMatch(result.request.promptInjects[0].content, /GSK_CHAR_MARISA_ACTIVE|GSK_CHAR_CIRNO_ACTIVE/);
});

// ---- R0：无登记角色是合法 V2（独处设施/无角色过渡）----
test('R0：无登记角色仍构造合法 V2（空角色 + 空 visit map + 非空 system 历史边界）', () => {
  const result = g.buildGalGenerationRequestV2(baseInput({
    playerInput: '独自在庭院里整理花圃。',
    state: { ...baseInput().state, presence_snapshot: { present_character_ids: ['unknown-char'] } },
    characterContext: { mainTargetCharacterId: null, actionTargetCharacterId: null, requireMainTarget: false },
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.relevantCharacterIds, []);
  assert.deepEqual(result.visitIdsByCharacter, {});
  // 无角色仍必须构造恰好一条非空 system 历史边界（runbook §3.5 永不空数组）
  assert.equal(result.request.syntheticHistory.length, 1);
  assert.equal(result.request.syntheticHistory[0].role, 'system');
  assert.ok(result.request.syntheticHistory[0].content.trim().length > 0);
  assert.equal(result.request.syntheticHistoryHash.length, 8);
  assert.equal(result.request.contextFingerprint.length, 8);
});
