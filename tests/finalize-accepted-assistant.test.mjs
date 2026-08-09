// B2-F03：统一 accepted assistant 结算 helper（runbook §B2-F03 必测 8）。
// 执行 bridge 实际使用的 finalizeAcceptedAssistant（非源码形状检查）：
//   - 普通 V2 对话无 MVU 变化仍写 VisitTurn（F-B 修复核心）；
//   - 同 turn_id retry 覆盖不追加；
//   - 固定事件既 settlement 也写 VisitTurn；
//   - 告别 active visit 已关闭 → 写 frozen closed visit；
//   - VisitTurn 构造失败 → 抛错（调用方保持 pending，不 settled）；
//   - replace 成功但复读缺 turn → 抛错不 settled；
//   - lifecycle 复读仍 pending → 抛错不 settled。
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

const b = await importTypescript('../src/ui/bridge.ts');
const g = await importTypescript('../src/ui/gal-generation-request.ts');
const LC = g.COMMIT_LIFECYCLE_KEY;

const makeV2Request = () => {
  const built = g.createGalGenerationRequestV2({
    playerInput: 'F03 测试',
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
    syntheticHistory: [{ role: 'system', content: '【合成历史边界】F03' }],
    syntheticHistoryHash: 'f03-hash',
    contextFingerprint: 'fp:f03',
    contractInjector: (t) => t,
    now: 1750000020000,
  });
  assert.equal(built.ok, true, built.ok ? '' : built.reason);
  return built.request;
};

const makeBaseState = () => {
  const raw = {
    environment: { day: 7, time_period: '午后' },
    player: {},
    interaction: {
      visit_memory: {
        by_character: {
          reimu: {
            source: 'active_visit',
            active_visit: {
              visit_id: 'character_visit_000001',
              character_id: 'reimu',
              first_seen_day: 7,
              first_seen_time_period: '清晨',
              status: 'active',
              turns: [],
            },
            closed_visits: [],
          },
        },
      },
    },
  };
  return raw;
};

const makeSnapshot = (request, messageId) => ({
  transactionId: 'tx-1',
  chatId: 'chat-1',
  kind: 'interaction',
  phase: 'settling',
  userMessageCreated: true,
  assistantResponded: true,
  userMessageId: 41,
  assistantMessageId: messageId,
  requestId: request.requestId,
  requestSchema: 'gal-generation-request.v2',
  attemptId: `${request.requestId}:attempt-1`,
  generationId: `${request.requestId}:gen-1`,
  commitKey: `${request.requestId}:${request.requestId}:attempt-1`,
  ownerCharacterId: 'reimu',
  chatEpoch: 42,
  mvuEpoch: 7,
});

const makeIdentityReader = (snapshot, swipeId = 0) => () => ({
  messageId: snapshot.assistantMessageId,
  swipeId,
  requestId: snapshot.requestId,
  attemptId: snapshot.attemptId,
  commitKey: snapshot.commitKey,
  chatId: snapshot.chatId,
  ownerCharacterId: snapshot.ownerCharacterId,
});

const makeMvu = () => {
  let stored = null;
  const mvu = {
    getMvuData() {
      return structuredClone(stored ?? { stat_data: {} });
    },
    async replaceMvuData(data) {
      stored = structuredClone(data);
    },
    __forceReread(value) { stored = value; },
    __peek() { return stored; },
  };
  return mvu;
};

test('F03-1：普通 V2 对话无 MVU 变化仍写 VisitTurn（F-B 核心）', async () => {
  const request = makeV2Request();
  const baseState = makeBaseState();
  const mvu = makeMvu();
  const options = { type: 'message', message_id: 50 };
  const currentData = { stat_data: structuredClone(baseState) };
  const snapshot = makeSnapshot(request, 50);
  const outcome = await b.finalizeAcceptedAssistant({
    mvu,
    options,
    currentData,
    before: baseState,
    assistantText: '【庭园正文开始】灵梦轻轻点了点头。<dialogue char="reimu">今天也辛苦了呢。</dialogue>【庭园正文结束】',
    pendingRequest: request,
    snapshot,
    characterNames: { reimu: '博丽灵梦' },
    readAssistantIdentity: makeIdentityReader(snapshot),
    transformFinalState: (state) => state,
  });
  assert.equal(outcome.phase, 'settled');
  const written = mvu.__peek();
  const visits = written.stat_data.interaction.visit_memory.by_character.reimu;
  assert.equal(visits.active_visit.turns.length, 1);
  assert.equal(visits.active_visit.turns[0].turn_id, `${request.requestId}:reimu`);
  assert.equal('latest_attempt_id' in visits.active_visit.turns[0], false);
  assert.equal(written[LC].status, 'settled');
  assert.equal(written.gal_regeneration_receipt_v1.schema, 'gal-regeneration-commit-receipt.v1');
  assert.equal(written.gal_regeneration_receipt_v1.attemptId, snapshot.attemptId);
  assert.equal(written.gal_regeneration_receipt_v1.assistantSwipeId, 0);
});

test('F03-2：同 turn_id retry 以精简记录覆盖，不追加', async () => {
  const request = makeV2Request();
  const baseState = makeBaseState();
  baseState.interaction.visit_memory.by_character.reimu.active_visit.turns.push({
    turn_id: `${request.requestId}:reimu`,
    request_id: request.requestId,
    character_id: 'reimu',
    scene_id: 'scene:demo',
    assistant_message_id: 49,
    assistant_swipe_id: null,
    latest_attempt_id: `${request.requestId}:attempt-1`,
    latest_commit_key: 'old-commit',
    day: 7,
    time_period: '午后',
    period_serial: 12,
    summary: '旧摘要',
  });
  const mvu = makeMvu();
  const options = { type: 'message', message_id: 51 };
  const currentData = { stat_data: structuredClone(baseState) };
  const snapshot = {
    ...makeSnapshot(request, 51),
    attemptId: `${request.requestId}:attempt-2`,
    commitKey: `${request.requestId}:${request.requestId}:attempt-2`,
  };
  await b.finalizeAcceptedAssistant({
    mvu, options, currentData, before: baseState,
    assistantText: '【庭园正文开始】第二次回复。<dialogue char="reimu">我知道了。</dialogue>【庭园正文结束】', pendingRequest: request, snapshot,
    characterNames: { reimu: '博丽灵梦' },
    readAssistantIdentity: makeIdentityReader(snapshot),
    transformFinalState: (state) => state,
  });
  const visits = mvu.__peek().stat_data.interaction.visit_memory.by_character.reimu;
  assert.equal(visits.active_visit.turns.length, 1, '不得追加');
  assert.deepEqual(
    Object.keys(visits.active_visit.turns[0]).sort(),
    ['character_id', 'day', 'summary', 'time_period', 'turn_id'].sort(),
  );
});

test('F03-3：固定事件结算也写 VisitTurn（事件 settlement + turn 同一次写盘）', async () => {
  const request = makeV2Request();
  const baseState = makeBaseState();
  const mvu = makeMvu();
  const options = { type: 'message', message_id: 52 };
  const currentData = { stat_data: structuredClone(baseState) };
  const snapshot = makeSnapshot(request, 52);
  const transformFinalState = (state) => ({
    ...state,
    events: { ...(state.events ?? {}), settled_ids: ['event-fixed-1'] },
  });
  await b.finalizeAcceptedAssistant({
    mvu, options, currentData, before: baseState,
    assistantText: '【庭园正文开始】事件收尾。<dialogue char="reimu">处理完毕。</dialogue>【庭园正文结束】', pendingRequest: request, snapshot,
    characterNames: { reimu: '博丽灵梦' },
    readAssistantIdentity: makeIdentityReader(snapshot),
    transformFinalState,
  });
  const written = mvu.__peek();
  assert.ok(written.stat_data.events.settled_ids.includes('event-fixed-1'), '事件 settlement 已写入');
  const visits = written.stat_data.interaction.visit_memory.by_character.reimu;
  assert.equal(visits.active_visit.turns.length, 1, '事件结算同时写 VisitTurn');
});

test('F03-4：告别时 active visit 已关闭 → 写 frozen closed visit', async () => {
  const request = makeV2Request();
  const baseState = makeBaseState();
  const transformFinalState = (state) => {
    const mem = state.interaction.visit_memory.by_character.reimu;
    return {
      ...state,
      interaction: {
        ...state.interaction,
        visit_memory: {
          by_character: {
            reimu: {
              source: 'closed_visit',
              active_visit: null,
              closed_visits: [{
                ...mem.active_visit,
                status: 'closed',
                closed_at: { day: 8, time_period: '夜晚' },
              }],
            },
          },
        },
      },
    };
  };
  const mvu = makeMvu();
  const options = { type: 'message', message_id: 53 };
  const currentData = { stat_data: structuredClone(baseState) };
  const snapshot = makeSnapshot(request, 53);
  await b.finalizeAcceptedAssistant({
    mvu, options, currentData, before: baseState,
    assistantText: '【庭园正文开始】该说再见了。<dialogue char="reimu">保重。</dialogue>【庭园正文结束】', pendingRequest: request, snapshot,
    characterNames: { reimu: '博丽灵梦' },
    readAssistantIdentity: makeIdentityReader(snapshot),
    transformFinalState,
  });
  const visits = mvu.__peek().stat_data.interaction.visit_memory.by_character.reimu;
  assert.equal(visits.closed_visits.length, 1);
  assert.equal(visits.closed_visits[0].visit_id, 'character_visit_000001');
  assert.equal(visits.closed_visits[0].turns.length, 1, 'closed visit 写入 turn');
});

test('F03-5：VisitTurn 构造失败（frozen visit 不存在）→ 抛错不 settled、不写盘', async () => {
  const request = makeV2Request();
  const brokenRequest = { ...request, visitIdsByCharacter: { reimu: 'character_visit_999999' } };
  const baseState = makeBaseState();
  const mvu = makeMvu();
  const options = { type: 'message', message_id: 54 };
  const currentData = { stat_data: structuredClone(baseState) };
  const snapshot = makeSnapshot(brokenRequest, 54);
  await assert.rejects(
    b.finalizeAcceptedAssistant({
      mvu, options, currentData, before: baseState,
      assistantText: '【庭园正文开始】回复。<dialogue char="reimu">好。</dialogue>【庭园正文结束】', pendingRequest: brokenRequest, snapshot,
      characterNames: { reimu: '博丽灵梦' },
      readAssistantIdentity: makeIdentityReader(snapshot),
      transformFinalState: (state) => state,
    }),
    /VisitTurn 提交失败/,
  );
  assert.equal(mvu.__peek(), null, '失败不得写盘');
});

test('F03-6：replace 成功但复读缺 turn → 抛错不 settled', async () => {
  const request = makeV2Request();
  const baseState = makeBaseState();
  const mvu = makeMvu();
  const options = { type: 'message', message_id: 55 };
  const currentData = { stat_data: structuredClone(baseState) };
  const snapshot = makeSnapshot(request, 55);
  const originalReplace = mvu.replaceMvuData.bind(mvu);
  mvu.replaceMvuData = async (data) => {
    await originalReplace(data);
    const stripped = structuredClone(mvu.__peek());
    delete stripped.stat_data.interaction.visit_memory;
    mvu.__forceReread(stripped);
  };
  await assert.rejects(
    b.finalizeAcceptedAssistant({
      mvu, options, currentData, before: baseState,
      assistantText: '【庭园正文开始】回复。<dialogue char="reimu">好。</dialogue>【庭园正文结束】', pendingRequest: request, snapshot,
      characterNames: { reimu: '博丽灵梦' },
      readAssistantIdentity: makeIdentityReader(snapshot),
      transformFinalState: (state) => state,
    }),
    /VisitTurn 精确复读失败/,
  );
});

test('F03-7：lifecycle 复读仍 pending → 抛错不 settled', async () => {
  const request = makeV2Request();
  const baseState = makeBaseState();
  const mvu = makeMvu();
  const options = { type: 'message', message_id: 56 };
  const currentData = { stat_data: structuredClone(baseState) };
  const snapshot = makeSnapshot(request, 56);
  const originalReplace = mvu.replaceMvuData.bind(mvu);
  mvu.replaceMvuData = async (data) => {
    await originalReplace(data);
    const altered = structuredClone(mvu.__peek());
    altered[LC] = { ...altered[LC], status: 'pending' };
    mvu.__forceReread(altered);
  };
  await assert.rejects(
    b.finalizeAcceptedAssistant({
      mvu, options, currentData, before: baseState,
      assistantText: '【庭园正文开始】回复。<dialogue char="reimu">好。</dialogue>【庭园正文结束】', pendingRequest: request, snapshot,
      characterNames: { reimu: '博丽灵梦' },
      readAssistantIdentity: makeIdentityReader(snapshot),
      transformFinalState: (state) => state,
    }),
    /lifecycle 写回后复读身份或状态不一致/,
  );
});

test('F05：swipe 身份留在提交回执，不复制进 VisitTurn', async () => {
  const request = makeV2Request();
  const baseState = makeBaseState();
  const mvu = makeMvu();
  const options = { type: 'message', message_id: 60 };
  const currentData = { stat_data: structuredClone(baseState) };
  const snapshot = makeSnapshot(request, 60);
  await b.finalizeAcceptedAssistant({
    mvu, options, currentData, before: baseState,
    assistantText: '【庭园正文开始】<dialogue char="reimu">这是 swipe 2 的内容。</dialogue>【庭园正文结束】',
    pendingRequest: request, snapshot,
    characterNames: { reimu: '博丽灵梦' },
    readAssistantIdentity: makeIdentityReader(snapshot, 2),
    transformFinalState: (state) => state,
  });
  const written = mvu.__peek();
  const turn = written.stat_data.interaction.visit_memory.by_character.reimu.active_visit.turns[0];
  assert.equal('assistant_swipe_id' in turn, false);
  assert.equal(written.gal_regeneration_receipt_v1.assistantSwipeId, 2);
});

test('返修：合法空相关角色以零 expected turns settled，不要求历史中存在任意 turn', async () => {
  const request = { ...makeV2Request(), relevantCharacterIds: [], visitIdsByCharacter: {} };
  const baseState = makeBaseState();
  const mvu = makeMvu();
  const snapshot = makeSnapshot(request, 61);
  const outcome = await b.finalizeAcceptedAssistant({
    mvu,
    options: { type: 'message', message_id: 61 },
    currentData: { stat_data: structuredClone(baseState) },
    before: baseState,
    assistantText: '【庭园正文开始】独处剧情正常结束。【庭园正文结束】',
    pendingRequest: request,
    snapshot,
    characterNames: {},
    readAssistantIdentity: makeIdentityReader(snapshot),
    transformFinalState: (state) => state,
  });
  assert.equal(outcome.phase, 'settled');
  assert.equal(mvu.__peek()[LC].status, 'settled');
});

test('返修：其他角色的旧 turn 不能冒充本次 expected turn', async () => {
  const request = makeV2Request();
  const baseState = makeBaseState();
  baseState.interaction.visit_memory.by_character.marisa = {
    source: 'active_visit',
    active_visit: {
      visit_id: 'character_visit_old',
      character_id: 'marisa',
      status: 'active',
      turns: [{ turn_id: 'old-request:marisa', request_id: 'old-request', character_id: 'marisa' }],
    },
    closed_visits: [],
  };
  const mvu = makeMvu();
  const originalReplace = mvu.replaceMvuData.bind(mvu);
  mvu.replaceMvuData = async (data) => {
    await originalReplace(data);
    const stripped = structuredClone(mvu.__peek());
    stripped.stat_data.interaction.visit_memory.by_character.reimu.active_visit.turns = [];
    mvu.__forceReread(stripped);
  };
  const snapshot = makeSnapshot(request, 62);
  await assert.rejects(
    b.finalizeAcceptedAssistant({
      mvu,
      options: { type: 'message', message_id: 62 },
      currentData: { stat_data: structuredClone(baseState) },
      before: baseState,
      assistantText: '【庭园正文开始】<dialogue char="reimu">本次回复。</dialogue>【庭园正文结束】',
      pendingRequest: request,
      snapshot,
      characterNames: { reimu: '博丽灵梦' },
      readAssistantIdentity: makeIdentityReader(snapshot),
      transformFinalState: (state) => state,
    }),
    /VisitTurn 精确复读失败（missing-turn）/,
  );
});

test('返修：assistant identity 缺失时在写盘前 fail closed', async () => {
  const request = makeV2Request();
  const baseState = makeBaseState();
  const mvu = makeMvu();
  const snapshot = makeSnapshot(request, 63);
  await assert.rejects(
    b.finalizeAcceptedAssistant({
      mvu,
      options: { type: 'message', message_id: 63 },
      currentData: { stat_data: structuredClone(baseState) },
      before: baseState,
      assistantText: '【庭园正文开始】<dialogue char="reimu">回复。</dialogue>【庭园正文结束】',
      pendingRequest: request,
      snapshot,
      characterNames: { reimu: '博丽灵梦' },
      readAssistantIdentity: () => null,
      transformFinalState: (state) => state,
    }),
    /assistant identity\/message\/swipe\/commit 不匹配/,
  );
  assert.equal(mvu.__peek(), null);
});

test('返修：写盘期间 swipe 改变时不得返回 settled', async () => {
  const request = makeV2Request();
  const baseState = makeBaseState();
  const mvu = makeMvu();
  const snapshot = makeSnapshot(request, 64);
  let reads = 0;
  const readAssistantIdentity = () => ({
    ...makeIdentityReader(snapshot, reads++ === 0 ? 0 : 1)(),
  });
  await assert.rejects(
    b.finalizeAcceptedAssistant({
      mvu,
      options: { type: 'message', message_id: 64 },
      currentData: { stat_data: structuredClone(baseState) },
      before: baseState,
      assistantText: '【庭园正文开始】<dialogue char="reimu">回复。</dialogue>【庭园正文结束】',
      pendingRequest: request,
      snapshot,
      characterNames: { reimu: '博丽灵梦' },
      readAssistantIdentity,
      transformFinalState: (state) => state,
    }),
    /assistant swipe 在写盘期间发生变化/,
  );
});
