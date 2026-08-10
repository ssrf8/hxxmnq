import type {
  BattleResult,
  ChatMessageView,
  GardenBridge,
  GardenState,
  MessageTransactionSnapshot,
  OpeningDraft,
  RuntimeDiagnostics,
  SaveSlotId,
  VisitTurn,
} from './types';
import initialState from '../schema/initial-state.json';
import { buildDiagnosticSnapshot } from './diagnostic-export';
import { memoryPort } from './memory-adapter-selection';
import { MessageTransactionCoordinator } from './message-transaction';
import { cleanNarrativeText } from './gal-scene';
import {
  buildAttemptMetadata,
  buildChatHistoryForGenerate,
  buildCommitLifecycle,
  buildRequestMetadata,
  buildRequestMetadataV2,
  buildGalGenerationRequestV2,
  COMMIT_LIFECYCLE_KEY,
  advanceGalGenerationRequest,
  advanceGalGenerationRequestV2,
  createGalGenerationRequest,
  REQUEST_SCHEMA_V2,
  restoreGalGenerationRequestV2,
  resolveAssistantMessageByCommitKey,
  resolvePlayerMessageByMetadata,
  storedUserMessageMatchesRequestV2,
  parseAttemptMetadata,
  resolveLatestAssistantForRegeneration,
  analyzeChatRestore,
  type GalGenerationAttempt,
  type GalAnyRequest,
  type GalGenerationRequest,
  type GalGenerationRequestV2,
  type RequestChatSnapshot,
} from './gal-generation-request';
import { buildGalGenerateConfig } from './gal-generate-config';
import { buildGalCurrentTurnInjections } from './gal-prompt-injection';
import {
  createRegenerationCommitReceiptV1,
  GAL_REGENERATION_RECEIPT_DATA_KEY,
} from './gal-regeneration-receipt';
import { queueSceneItemUse } from './activity-rules';
import {
  reconcileHostGenerationActivity,
  isVariableStageReady,
  SettlementAttemptCoordinator,
  shouldTrackHostGenerationStart,
} from './async-coordination';
import { validateFlowerCoreBattleResult } from './greenhouse-rules';
import { dungeonReward, settleDungeonResult as settleLocalDungeonResult } from './dungeon-rules';
import { migrateGardenState } from './state-migrations';
import { applyTestJump, testJumpReached, type TestJumpId } from './test-tools';
import { purchaseShopItem, claimStarterGift } from './shop-rules';
import { useOpportunityCard as applyOpportunityCardUse } from './card-item-rules';
import {
  beginDuelCard as beginLocalDuelCard,
  cancelDuelCard as cancelLocalDuelCard,
  completeDuelVictoryDialogue,
  settleDuelCard as settleLocalDuelCard,
  stageDuelVictoryRequest,
} from './duel-card-rules';
import { getLockedDuelBattleConfig } from '../battle/duel-configs';
import {
  useSpecialItem as applySpecialItemUse,
  finalizeAnomalyCardUse,
  abortAnomalyCardUse,
} from './special-item-rules';
import type { AnomalyActivationForm, AnomalyHiddenOrigin } from './types';
import { reconcileM2Runtime } from './m2-runtime';
import { appendDailyClue, resolveAnomaly } from './anomaly-rules';
import { applyM2Command as applyLocalM2Command } from './m2-commands';
import { eventById, eventResultForAction } from './event-registry';
import {
  applyVisitTurnsToFinalState as applyVisitTurnsCommit,
  verifyCommittedVisitTurns,
  verifyVisitTurnAuditRefs,
} from './visit-turn-commit';
import {
  GalRegenerationCoordinatorV1,
  type RegenerationCoordinatorStateV1,
  type RegenerationHostPortsV1,
} from './gal-regeneration-coordinator';
import { readFrozenBaselineV1 } from './gal-regeneration-baseline';
import {
  decideRegenerationDriftV1,
  fingerprintMvuData,
  readRegenerationReceiptFromDataV1,
} from './gal-regeneration-receipt';
import type { ReplayVisitTurnCommitV1 } from './gal-regeneration-replay';
import { periodSerialFromState } from './time-rules';
import { captureSavePayload } from './save-capture';
import { restoreSavePayload } from './save-restore';
import {
  listSaveSlots as listStoredSaveSlots,
  readSaveSlot,
  writeSaveSlot,
  type SaveWorldbookAdapter,
  type SaveWorldbookEntry,
} from './save-worldbook-store';
import {
  applyPresenceUpdate,
  applyLocalSettlement,
  findRecordedLocalSettlement,
  hasLocalPresenceTransition,
  isLocalSettlementActionMarker,
  localSettlementAction,
  parseGardenAction,
  restoreLocalEventOwnership,
  stageLocalSession,
  settlementChoices,
  settlementProjection,
  type GardenActionMarker,
} from './event-settlement';

type HostGlobals = typeof globalThis & {
  waitGlobalInitialized?: (name: string) => Promise<unknown>;
  Mvu?: {
    getMvuData: (options: Record<string, unknown>) => { stat_data?: GardenState; [key: string]: unknown };
    replaceMvuData: (data: Record<string, unknown>, options: Record<string, unknown>) => Promise<void>;
    events: Record<string, string>;
    isDuringExtraAnalysis?: () => boolean;
    parseMessage?: (message: string, oldData: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  getChatMessages?: (range: string | number, options?: Record<string, unknown>) => Array<Record<string, unknown>>;
  setChatMessages?: (messages: Array<Record<string, unknown>>, options?: Record<string, unknown>) => Promise<void>;
  getLastMessageId?: () => number;
  SillyTavern?: {
    stopGeneration?: () => boolean;
    getCurrentChatId?: () => string;
    getContext?: () => {
      chat?: Array<Record<string, unknown>>;
      characterId?: unknown;
      name1?: string;
      getCurrentChatId?: () => string;
      setUserName?: (name: string, options?: { toastPersonaNameChange?: boolean }) => void;
      executeSlashCommandsWithOptions?: (command: string) => Promise<unknown> | void;
    };
    reloadCurrentChat?: () => Promise<void>;
  };
  createChatMessages?: (messages: Array<Record<string, unknown>>, options?: Record<string, unknown>) => Promise<void>;
  deleteChatMessages?: (messageIds: number[], options?: Record<string, unknown>) => Promise<void>;
  reloadCurrentChat?: () => Promise<void>;
  getOrCreateChatWorldbook?: (chatName: 'current', worldbookName?: string) => Promise<string>;
  getWorldbook?: (worldbookName: string) => Promise<SaveWorldbookEntry[]>;
  updateWorldbookWith?: (
    worldbookName: string,
    updater: (entries: SaveWorldbookEntry[]) => SaveWorldbookEntry[],
    options?: Record<string, unknown>,
  ) => Promise<SaveWorldbookEntry[]>;
  triggerSlash?: (command: string) => Promise<string | undefined>;
  getTavernVersion?: () => string;
  getTavernHelperVersion?: () => string;
  getCurrentPersonaName?: () => string | null;
  getPersona?: (personaId: string) => { name?: string; description?: string };
  eventOn?: (eventName: string, listener: (...args: unknown[]) => void) => { stop: () => void };
  injectPrompts?: (
    prompts: Array<{ id: string; position: 'in_chat' | 'none'; depth: number; role: 'system' | 'user' | 'assistant'; content: string; should_scan?: boolean }>,
    options?: { once?: boolean },
  ) => { uninject: () => void };
  tavern_events?: Record<string, string>;
  /** TavernHelper iframe 事件（generate() 的 GENERATION_STARTED、STREAM 事件、GENERATION_ENDED 等）。 */
  iframe_events?: Record<string, string>;
  TavernHelper?: {
    iframe_events?: Record<string, string>;
    [key: string]: unknown;
  };
  /** TavernHelper generate()（Promise 为唯一权威；generation_id 原样贯穿事件）。 */
  generate?: (config: Record<string, unknown>) => Promise<unknown>;
  /** TavernHelper stopGenerationById()：true=已 abort（Promise 将 reject 并发 GENERATION_STOPPED(id)）；false=无此生成（已结束/从未注册）。 */
  stopGenerationById?: (id: string) => boolean;
  /** 验收/诊断用 transport 覆盖（'helper-generate' 或 'native-trigger'；缺省 native-trigger）。 */
  __GAL_GENERATION_TRANSPORT__?: string;
  /** Explicit opt-in only: static code logic is complete, real-host timing is not claimed here. */
  __GAL_REGENERATION_TRANSPORT__?: string;
};

const g = globalThis as HostGlobals;
const OPENING_MARKER = '<gensokyo_opening transaction="';
const OPENING_REPAIR_MARKER = '<gensokyo_opening_repair transaction="';

/** 空 MVU 变量域（assistant 楼层写入时的 fallback data）。 */
const EMPTY_MVU_DATA = {
  stat_data: {},
  display_data: {},
  delta_data: {},
  schema: { type: 'object', properties: {} },
  initialized_lorebooks: {},
};

function parseOpeningMessage(message: string): OpeningDraft {
  const body = message
    .replace(/\n*<gensokyo_opening transaction="[^"]+" \/>\s*$/u, '')
    .trim();
  const match = body.match(
    /^我叫「([^」]{1,40})」，希望他人使用「([^」]{1,40})」称呼我。我的外貌大致是：([\s\S]{1,520}?)\n\n我依照祖父留下的安排，[\s\S]*?我暂时把它称作「([^」]{1,60})」。/u,
  );
  if (!match) throw new Error('无法从原始开场消息识别姓名、称谓、外貌和庭园名');
  return {
    playerName: match[1].trim(),
    playerPronouns: match[2].trim(),
    playerAppearance: match[3].trim().replace(/[。！？.!?]$/u, ''),
    gardenName: match[4].trim(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 从 GardenState.characters 提取 characterId → 显示名（合成历史角色块用；缺省回退 id）。 */
function characterNamesOf(state: GardenState): Record<string, string> {
  const names: Record<string, string> = {};
  const characters = state?.characters;
  if (isRecord(characters)) {
    for (const [id, entry] of Object.entries(characters)) {
      const name = isRecord(entry) ? entry.name : undefined;
      names[id] = typeof name === 'string' && name ? name : id;
    }
  }
  return names;
}

/** 按 request schema 分派 advance（V1/V2 各自保留冻结语义）。 */
function advanceAnyRequest(request: GalAnyRequest, completedAttemptSeq: number): GalAnyRequest {
  return request.schema === REQUEST_SCHEMA_V2
    ? advanceGalGenerationRequestV2(request, completedAttemptSeq)
    : advanceGalGenerationRequest(request, completedAttemptSeq);
}

/**
 * T10：bridge 侧接线：把冻结请求的 VisitTurn 精确写入最终结算 state。
 * 纯构造/upsert 逻辑在 visit-turn-commit.applyVisitTurnsToFinalState（可单测）；
 * 这里只负责把 pendingRequest（V2）换算为 commit 输入并在失败时抛错（保持 settlement pending）。
 */
function applyVisitTurnsToFinalState(
  finalState: GardenState,
  request: GalAnyRequest | null,
  snapshot: MessageTransactionSnapshot,
  assistantText: string,
  characterNames: Record<string, string>,
  assistantSwipeId: number | null = null,
): { state: GardenState; turns: VisitTurn[] } {
  if (request?.schema !== REQUEST_SCHEMA_V2) return { state: finalState, turns: [] };
  const v2 = request as GalGenerationRequestV2;
  const result = applyVisitTurnsCommit({
    finalState,
    request: {
      requestId: v2.requestId,
      sceneId: v2.sceneId,
      relevantCharacterIds: v2.relevantCharacterIds,
      visitIdsByCharacter: v2.visitIdsByCharacter,
      visibleUserText: v2.visibleUserText ?? '',
    },
    attempt: {
      attemptId: snapshot.attemptId ?? '',
      commitKey: snapshot.commitKey ?? '',
      assistantMessageId: Number.isInteger(Number(snapshot.assistantMessageId))
        ? Number(snapshot.assistantMessageId) : null,
      // F05：精确 swipe 身份——assistantSwipeId 由调用方从 assistant 楼层解析
      // （message.swipe_id，当前选中 swipe 的 id），null 表示非 swipe 楼层。
      assistantSwipeId,
    },
    clock: {
      day: finalState.environment?.day ?? null,
      time_period: finalState.environment?.time_period ?? null,
      period_serial: periodSerialFromState(finalState),
    },
    acceptedOutput: assistantText,
    characterNames,
  });
  if (!result.ok) {
    throw new Error(
      `VisitTurn 提交失败（${result.code}）：保持 settlement pending，不写邻近楼层、不标 settled`,
    );
  }
  return { state: result.state, turns: result.turns };
}

/**
 * F03：统一 accepted assistant 结算 helper（runbook §B2-F03 固定顺序 1-9）。
 * 任意已接受 V2 assistant——包括没有任何 MVU 字段变化的普通闲聊——都必须先
 * 基于最终 state 构造 VisitTurn，再决定是否需要写盘；只有精确复读证明
 * VisitTurn 与 lifecycle 同时成立后，调用方才能 markSettlementSucceeded。
 *
 * 固定顺序：
 *   1. 校验当前 chat/owner（调用方完成，此处不重复）；
 *   2. 按 attempt metadata 校验精确 assistant message（调用方完成）；
 *   3. 等待既有 variable stage ready（调用方完成）；
 *   4. 从该 messageId 读取 MVU data（调用方传 currentData）；
 *   5. 应用 ownership/local settlement，得到最终 GardenState（transformFinalState）；
 *   6. 无条件对 V2 调用 applyVisitTurnsToFinalState；
 *   7. 把最终 state 与目标 lifecycle settled 写回同一 messageId（本函数执行）；
 *   8. 复读并验证（turn + lifecycle 同时成立）；
 *   9. 验证通过才返回 settled。
 *
 * state 相等优化只能放在第 6 步之后，并比较"含 VisitTurn 和 lifecycle 的完整
 * 目标数据"；只要 turn/lifecycle 有差异就必须写。frozen visit 为 null 导致
 * 零 turn 是合法情况，但仍验证 request/attempt/commit/lifecycle，不伪造 visit。
 */
export interface FinalizeAcceptedAssistantInput {
  /** MVU 读写接口（bridge 传闭包 requireMvu() 的 mvu）。 */
  mvu: {
    getMvuData(options: { type: 'message'; message_id: number }): unknown;
    replaceMvuData(data: Record<string, unknown>, options: { type: 'message'; message_id: number }): Promise<unknown>;
  };
  options: { type: 'message'; message_id: number };
  /** 写盘前的既有楼层 data（含 stat_data；不含目标 lifecycle）。 */
  currentData: Record<string, unknown>;
  /** ownership/local settlement 前的持久化状态基线。 */
  before: GardenState;
  assistantText: string;
  pendingRequest: GalAnyRequest | null;
  snapshot: MessageTransactionSnapshot;
  characterNames: Record<string, string>;
  /** V2 必填：每次调用都重新读取精确 assistant metadata 与当前 swipe。 */
  readAssistantIdentity?: () => AcceptedAssistantIdentity | null;
  /** 第 5 步：应用 ownership/local settlement → 最终 GardenState。 */
  transformFinalState: (state: GardenState) => GardenState;
}

export type FinalizeAcceptedAssistantResult =
  | { phase: 'settled' }
  | { phase: 'noop'; reason: 'already-settled' };

export interface AcceptedAssistantIdentity {
  messageId: number;
  swipeId: number;
  requestId: string;
  attemptId: string;
  commitKey: string;
  chatId: string;
  ownerCharacterId: string;
}

function requireAcceptedAssistantIdentity(
  reader: FinalizeAcceptedAssistantInput['readAssistantIdentity'],
  snapshot: MessageTransactionSnapshot,
  options: FinalizeAcceptedAssistantInput['options'],
): AcceptedAssistantIdentity {
  const identity = reader?.();
  if (!identity
    || !Number.isInteger(identity.messageId)
    || !Number.isInteger(identity.swipeId)
    || identity.swipeId < 0
    || identity.messageId !== options.message_id
    || identity.messageId !== snapshot.assistantMessageId
    || identity.requestId !== snapshot.requestId
    || identity.attemptId !== snapshot.attemptId
    || identity.commitKey !== snapshot.commitKey
    || identity.chatId !== snapshot.chatId
    || identity.ownerCharacterId !== snapshot.ownerCharacterId) {
    throw new Error('assistant identity/message/swipe/commit 不匹配：保持 settlement pending');
  }
  return identity;
}

function sameAcceptedAssistantIdentity(
  before: AcceptedAssistantIdentity,
  after: AcceptedAssistantIdentity,
) {
  return before.messageId === after.messageId
    && before.swipeId === after.swipeId
    && before.requestId === after.requestId
    && before.attemptId === after.attemptId
    && before.commitKey === after.commitKey
    && before.chatId === after.chatId
    && before.ownerCharacterId === after.ownerCharacterId;
}

function verifyFinalizedAssistantData(
  data: Record<string, unknown>,
  request: GalAnyRequest | null,
  snapshot: MessageTransactionSnapshot,
  expectedTurns: readonly VisitTurn[],
) {
  const lifecycle = isRecord(data[COMMIT_LIFECYCLE_KEY]) ? data[COMMIT_LIFECYCLE_KEY] : null;
  if (lifecycle?.schema !== 'gal-generation-commit.v1'
    || lifecycle.status !== 'settled'
    || lifecycle.requestId !== snapshot.requestId
    || lifecycle.attemptId !== snapshot.attemptId
    || lifecycle.commitKey !== snapshot.commitKey) {
    throw new Error('lifecycle 写回后复读身份或状态不一致：保持 settlement pending');
  }
  if (request?.schema !== REQUEST_SCHEMA_V2) return;
  const state = isRecord(data.stat_data) ? data.stat_data as GardenState : {};
  const verified = verifyCommittedVisitTurns(state, request, expectedTurns);
  if (!verified.ok) {
    throw new Error(`VisitTurn 精确复读失败（${verified.code}）：保持 settlement pending`);
  }
}

export async function finalizeAcceptedAssistant(
  input: FinalizeAcceptedAssistantInput,
): Promise<FinalizeAcceptedAssistantResult> {
  const {
    mvu, options, currentData, before, assistantText,
    pendingRequest, snapshot, characterNames, transformFinalState, readAssistantIdentity,
  } = input;
  const identityBefore = pendingRequest?.schema === REQUEST_SCHEMA_V2
    ? requireAcceptedAssistantIdentity(readAssistantIdentity, snapshot, options)
    : null;
  const data = structuredClone(currentData) as Record<string, unknown>;
  let finalState = transformFinalState(
    isRecord(data.stat_data) ? data.stat_data as GardenState : before,
  );
  // 第 6 步：无条件对 V2 调用 applyVisitTurnsToFinalState（V1/无 request 恒等）。
  const committed = applyVisitTurnsToFinalState(
    finalState,
    pendingRequest,
    snapshot,
    assistantText,
    characterNames,
    identityBefore?.swipeId ?? null,
  );
  finalState = committed.state;
  if (!snapshot.requestId || !snapshot.attemptId || !snapshot.commitKey) {
    throw new Error('缺少 attempt 审计标识，不能写 lifecycle：保持 settlement pending');
  }
  data.stat_data = finalState;
  data[COMMIT_LIFECYCLE_KEY] = buildCommitLifecycle({
    requestId: snapshot.requestId,
    attemptId: snapshot.attemptId,
    commitKey: snapshot.commitKey,
  }, 'settled');
  // Third-batch source receipt: every newly settled V2 swipe becomes a safe
  // future regeneration source. The receipt key is excluded from its own hash.
  if (pendingRequest?.schema === REQUEST_SCHEMA_V2 && identityBefore) {
    const baselineData = { ...structuredClone(currentData), stat_data: structuredClone(before) };
    const finalizedWithoutReceipt = structuredClone(data);
    delete finalizedWithoutReceipt[GAL_REGENERATION_RECEIPT_DATA_KEY];
    data[GAL_REGENERATION_RECEIPT_DATA_KEY] = createRegenerationCommitReceiptV1({
      requestId: snapshot.requestId,
      attemptId: snapshot.attemptId,
      commitKey: snapshot.commitKey,
      assistantMessageId: identityBefore.messageId,
      assistantSwipeId: identityBefore.swipeId,
      baselineData,
      modelAppliedData: structuredClone(currentData),
      finalizedData: finalizedWithoutReceipt,
      settlementKeys: [],
    });
  }
  // 第 7 步比较：state 相等优化只看"含 VisitTurn + lifecycle 的完整目标数据"。
  if (JSON.stringify(currentData) === JSON.stringify(data)) {
    verifyFinalizedAssistantData(data, pendingRequest, snapshot, committed.turns);
    if (identityBefore) {
      const identityAfter = requireAcceptedAssistantIdentity(readAssistantIdentity, snapshot, options);
      if (!sameAcceptedAssistantIdentity(identityBefore, identityAfter)) {
        throw new Error('assistant swipe 在结算验证期间发生变化：保持 settlement pending');
      }
    }
    return { phase: 'noop', reason: 'already-settled' };
  }
  // 第 7 步写盘 + 第 8 步复读验证（turn + lifecycle 同时成立）。
  // 写盘由调用方通过 IO 注入执行（此处保留统一判定，避免测试与生产路径分叉）。
  return await settleByWriting(
    mvu,
    options,
    data,
    pendingRequest,
    snapshot,
    committed.turns,
    identityBefore,
    readAssistantIdentity,
  );
}

/**
 * 执行写盘 + 复读验证。复读确认 lifecycle settled 且（V2 时）VisitTurn 已落盘，
 * 才返回 settled；任何缺失都抛错保持 pending（调用方 catch 后 markSettlementFailed）。
 */
async function settleByWriting(
  mvu: FinalizeAcceptedAssistantInput['mvu'],
  options: FinalizeAcceptedAssistantInput['options'],
  data: Record<string, unknown>,
  pendingRequest: GalAnyRequest | null,
  snapshot: MessageTransactionSnapshot,
  expectedTurns: readonly VisitTurn[],
  identityBefore: AcceptedAssistantIdentity | null,
  readAssistantIdentity: FinalizeAcceptedAssistantInput['readAssistantIdentity'],
): Promise<FinalizeAcceptedAssistantResult> {
  await mvu.replaceMvuData(data, options);
  const reread = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
  verifyFinalizedAssistantData(reread, pendingRequest, snapshot, expectedTurns);
  if (identityBefore) {
    const identityAfter = requireAcceptedAssistantIdentity(readAssistantIdentity, snapshot, options);
    if (!sameAcceptedAssistantIdentity(identityBefore, identityAfter)) {
      throw new Error('assistant swipe 在写盘期间发生变化：保持 settlement pending');
    }
  }
  return { phase: 'settled' };
}

function mergeState(base: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown> {  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(current)) {
    if (isRecord(value) && isRecord(merged[key])) {
      merged[key] = mergeState(merged[key] as Record<string, unknown>, value);
    } else {
      merged[key] = structuredClone(value);
    }
  }
  return merged;
}

function applyOpeningDraft(state: Record<string, unknown>, draft: OpeningDraft) {
  const player = state.player as Record<string, unknown>;
  const garden = state.garden as Record<string, unknown>;
  const keyItems = state.key_items as Record<string, Record<string, unknown>>;
  const meta = state.meta as Record<string, unknown>;
  player.name = draft.playerName;
  player.pronouns = draft.playerPronouns;
  player.appearance = draft.playerAppearance;
  garden.name = draft.gardenName;
  keyItems.garden_keeper_key.obtained = true;
  keyItems.garden_keeper_key.state = '苏醒';
  meta.initialized = true;
  meta.opening_committed = true;
}

function openingCommitted(state: GardenState, draft: OpeningDraft) {
  return state.meta?.initialized === true
    && state.meta.opening_committed === true
    && state.player?.name === draft.playerName
    && state.player.pronouns === draft.playerPronouns
    && state.player.appearance === draft.playerAppearance
    && state.garden?.name === draft.gardenName
    && (state.key_items as Record<string, Record<string, unknown>> | undefined)
      ?.garden_keeper_key?.obtained === true
    && (state.key_items as Record<string, Record<string, unknown>> | undefined)
      ?.garden_keeper_key?.state === '苏醒';
}

function hostWindow(): HostGlobals {
  try {
    return window.parent && window.parent !== window ? window.parent as unknown as HostGlobals : g;
  } catch {
    return g;
  }
}

// B4-T02：业务代码不再直接探测数据库全局；诊断/能力一律从 memoryPort 读取。

function currentChatId(): string {
  // ST 1.18 中 getCurrentChatId 位于 getContext() 返回的 context 上，不在 SillyTavern 顶层；
  // 顶层与 context 两处都探测，兼容不同宿主版本。
  const direct = g.SillyTavern?.getCurrentChatId?.() ?? hostWindow().SillyTavern?.getCurrentChatId?.();
  const viaContext = g.SillyTavern?.getContext?.()?.getCurrentChatId?.()
    ?? hostWindow().SillyTavern?.getContext?.()?.getCurrentChatId?.();
  return String(direct ?? viaContext ?? '').trim();
}

/**
 * Phase 1.2 — 请求前聊天状态快照（纯捕获，不改变任何行为）。
 * 调用方（sendUserMessage）在创建 request 时传入；本函数不写聊天、不等待事件。
 */
function captureRequestSnapshot(sceneId: string | null): RequestChatSnapshot {
  const raw = readRawMessages({ include_swipes: false, hide_state: 'all' });
  const last = raw[raw.length - 1];
  const lastMessageId = last ? Number(last.message_id ?? last.id) : NaN;
  return {
    ownerCharacterId: String(g.SillyTavern?.getContext?.().characterId ?? ''),
    chatId: currentChatId(),
    stateMessageIdBeforeGeneration: Number.isFinite(lastMessageId) ? lastMessageId : null,
    stateSwipeIdBeforeGeneration: last && typeof last.swipe_id === 'number' ? last.swipe_id : null,
    sceneId,
    historyFingerprintInput: raw
      .map((message) => `${String(message.message_id ?? message.id ?? '')}:${messageRole(message)}`)
      .join(','),
  };
}

function nativeSendStopButtonGenerating(): boolean | null {
  try {
    const host = hostWindow();
    const doc = host.document;
    if (!doc?.body) return null;
    if (doc.body.dataset.generating === 'true') return true;
    const stop = doc.getElementById('mes_stop');
    if (!stop) return false;
    const view = doc.defaultView;
    return view?.getComputedStyle(stop).display !== 'none';
  } catch {
    return null;
  }
}

function normalizeMessages(raw: Array<Record<string, unknown>>): ChatMessageView[] {
  return raw.slice(-80).map((message) => {
    const swipes = Array.isArray(message.swipes) ? message.swipes.map((item) => String(item ?? '')) : [];
    const swipeId = typeof message.swipe_id === 'number' ? message.swipe_id : 0;
    const swipeText = swipes.length ? swipes[Math.min(Math.max(swipeId, 0), swipes.length - 1)] : '';
    // Prefer explicit message body (include_swipes:false shape). Empty swipe slots must not win.
    const currentText = String(message.message ?? message.mes ?? '').trim()
      ? String(message.message ?? message.mes ?? '')
      : swipeText;
    return {
      id: Number(message.message_id ?? 0),
      role: message.role === 'user' || message.role === 'system' ? message.role : 'assistant',
      name: String(message.name ?? ''),
      text: currentText,
      extra: message.extra && typeof message.extra === 'object'
        ? message.extra as Record<string, unknown>
        : {},
      swipeId: swipes.length ? swipeId : undefined,
      swipeCount: swipes.length || undefined,
    };
  });
}

function messagesFromContextChat(): Array<Record<string, unknown>> {
  try {
    const api = g.SillyTavern ?? hostWindow().SillyTavern;
    const chat = api?.getContext?.()?.chat;
    if (!Array.isArray(chat) || chat.length === 0) return [];
    // 楼层号 = 数组索引（ST 1.18 内存 chat 楼层无 message_id 字段；Helper getChatMessages
    // 的 message_id 同样是 0 基索引——两视图一致，与 createChatMessages 的追加语义一致）。
    // role：宿主楼层无 role 字段，用 is_user/is_system 派生。
    return chat.map((item, message_id) => {
      const record = item as Record<string, unknown>;
      const mes = String(record.mes ?? '');
      const swipes = Array.isArray(record.swipes) && record.swipes.length
        ? record.swipes.map((value) => String(value ?? ''))
        : [mes];
      return {
        message_id,
        name: String(record.name ?? ''),
        role: record.is_user ? 'user' : record.is_system ? 'system' : 'assistant',
        message: mes,
        swipes,
        swipe_id: typeof record.swipe_id === 'number' ? record.swipe_id : 0,
        extra: record.extra && typeof record.extra === 'object' ? record.extra : {},
        data: record.data && typeof record.data === 'object' ? record.data : {},
        is_hidden: Boolean(record.is_system),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Phase 4 实机修复：ST 1.18 对 assistant 楼层的 extra 规范化——保留键
 * （send_date/gen_started/gen_finished）平铺，自定义 metadata 包进 extra.extra 子对象；
 * 玩家楼层则不规范化（自定义直接平铺）。统一展平：合并 extra 与 extra.extra。
 */
function flattenMessageExtra(extra: unknown): Record<string, unknown> {
  if (!extra || typeof extra !== 'object') return {};
  const rec = extra as Record<string, unknown>;
  const nested = rec.extra;
  if (nested && typeof nested === 'object' && Object.keys(nested as Record<string, unknown>).length) {
    return { ...rec, ...(nested as Record<string, unknown>) };
  }
  return rec;
}

function readRawMessages(options: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  const opts = { include_swipes: false, hide_state: 'all', ...options };
  const ranges: Array<string | number> = [];
  try {
    const last = g.getChatMessages?.(-1, { ...opts, hide_state: 'all' }) ?? [];
    const lastId = Number(last[0]?.message_id);
    if (Number.isInteger(lastId) && lastId >= 0) ranges.push(`0-${lastId}`);
  } catch { /* probe failed */ }
  try {
    const id = g.getLastMessageId?.();
    if (Number.isInteger(id) && Number(id) >= 0) ranges.push(`0-${id}`);
  } catch { /* optional helper */ }
  ranges.push('0-{{lastMessageId}}');
  // Phase 4 实机修复：kH 的区间语义中 -1=倒数第一条（单条），'0--1'=0 到倒数第一条（全部）。
  ranges.push('0--1');

  let best: Array<Record<string, unknown>> = [];
  for (const range of ranges) {
    try {
      const raw = g.getChatMessages?.(range, opts) ?? [];
      if (raw.length > best.length) best = raw;
      // Full-history hit: keep the longest successful read.
      if (raw.length > 1) best = raw;
    } catch { /* try next */ }
  }
  if (best.length <= 1) {
    const fallback = messagesFromContextChat();
    if (fallback.length > best.length) best = fallback;
  }
  // Tavern Helper ranges are not guaranteed to preserve chronological array
  // order. Every transaction is defined by message_id, never by response index.
  return best
    .slice()
    .sort((left, right) => Number(left.message_id ?? -1) - Number(right.message_id ?? -1))
    .map((record) => ({ ...record, extra: flattenMessageExtra(record.extra) }));
}

function activeMessages(): Array<Record<string, unknown>> {
  // Phase 4 实机修复（skill：target runtime wins）：优先宿主 getContext().chat——真实
  // message_id（1 基，与 createChatMessages 写侧一致）+ assistant 自定义 metadata 平铺在
  // extra 顶层。Helper getChatMessages 的 message_id 是数组索引（0 基）、assistant extra
  // 嵌套（metadata 在 extra.extra）——仅作宿主不可用时的 fallback（readRawMessages 已展平）。
  const hostChat = (hostWindow().SillyTavern as { getContext?: () => { chat?: Array<Record<string, unknown>> } } | undefined)
    ?.getContext?.()?.chat;
  if (Array.isArray(hostChat) && hostChat.length) {
    return messagesFromContextChat();
  }
  return readRawMessages({ include_swipes: false, hide_state: 'all' });
}

function messageRole(message: Record<string, unknown>) {
  if (message.role === 'user' || message.is_user === true) return 'user';
  if (message.role === 'system' || message.is_system === true) return 'system';
  return 'assistant';
}

/**
 * 完整 MVU 快照：chat-scope 会话变量 + 当前庭园状态（stat_data）。
 * 真实 MagVarUpdate 宿主中 stat_data 不存在于 chat scope（getMvuData({type:'chat'})
 * 只返回 zhihuiji/output_language 等会话变量），而是持久化在每条 assistant 消息
 * 楼层的 data.stat_data（与 latestPersistedState 同源）；character scope 的
 * stat_data 是陈旧副本，仅作回退。存档/读档的 readMvuData 必须合并两者，
 * 否则 captureSavePayload/restoreSavePayload 的 stat_data 校验会失败。
 */
function snapshotMvu(mvu: NonNullable<HostGlobals['Mvu']>): Record<string, unknown> {
  const chatData = structuredClone(mvu.getMvuData({ type: 'chat' })) as Record<string, unknown>;
  let statData: unknown;
  try {
    const raw = readRawMessages({ include_swipes: false, hide_state: 'all' });
    const lastAssistant = [...raw].reverse().find((message) => messageRole(message) === 'assistant');
    if (lastAssistant) {
      const messageId = Number(lastAssistant.message_id);
      if (Number.isInteger(messageId) && messageId >= 0) {
        const msgData = mvu.getMvuData({ type: 'message', message_id: messageId }) as Record<string, unknown> | undefined;
        if (isRecord(msgData?.stat_data)) statData = msgData.stat_data;
      }
    }
  } catch { /* 楼层读取失败时回退 character scope */ }
  if (!isRecord(statData)) {
    try {
      const characterData = mvu.getMvuData({ type: 'character' }) as Record<string, unknown> | undefined;
      if (isRecord(characterData?.stat_data)) statData = characterData.stat_data;
    } catch { /* 双源都缺失时快照不含 stat_data */ }
  }
  return { ...chatData, ...(isRecord(statData) ? { stat_data: statData } : {}) };
}

interface PersistedMessage {
  messageId: number;
  options: Record<string, unknown>;
  data: Record<string, unknown>;
  state: GardenState;
}

function latestPersistedMessage(mvu: HostGlobals['Mvu']): PersistedMessage | null {
  if (!mvu) return null;
  const assistantMessages = activeMessages().filter((message) => messageRole(message) === 'assistant').reverse();
  let fallback: PersistedMessage | null = null;
  for (const message of assistantMessages) {
    const messageId = Number(message.message_id);
    if (!Number.isInteger(messageId) || messageId < 0) continue;
    const options = { type: 'message', message_id: messageId };
    const data = mvu.getMvuData(options);
    const state = data.stat_data;
    if (isRecord(state) && Object.keys(state).length > 0) {
      const persisted = {
        messageId,
        options,
        data: structuredClone(data) as Record<string, unknown>,
        state: structuredClone(state) as GardenState,
      };
      if (persisted.state.meta?.initialized || persisted.state.meta?.opening_committed) return persisted;
      fallback ??= persisted;
    }
  }
  return fallback;
}

function latestPersistedState(mvu: HostGlobals['Mvu']): GardenState {
  return migrateGardenState(latestPersistedMessage(mvu)?.state ?? {});
}

function persistedStateBefore(mvu: HostGlobals['Mvu'], messageId: number): GardenState | null {
  if (!mvu) return null;
  const assistantMessages = activeMessages()
    .filter((message) => messageRole(message) === 'assistant' && Number(message.message_id) < messageId)
    .reverse();
  for (const message of assistantMessages) {
    const previousId = Number(message.message_id);
    if (!Number.isInteger(previousId) || previousId < 0) continue;
    const state = mvu.getMvuData({ type: 'message', message_id: previousId }).stat_data;
    if (isRecord(state) && Object.keys(state).length > 0) return migrateGardenState(state);
  }
  return null;
}

function openingProgress(rawMessages = activeMessages()) {
  const openingIndex = rawMessages.findIndex((item) =>
    item.role === 'user' && String(item.message ?? '').includes(OPENING_MARKER));
  const assistant = openingIndex >= 0
    ? rawMessages
      .slice(openingIndex + 1)
      .filter((item) => item.role !== 'user' && String(item.message ?? '').trim().length > 0)
      .at(-1)
    : undefined;
  return {
    messageSubmitted: openingIndex >= 0,
    assistantResponded: Boolean(assistant),
    storyText: assistant ? cleanNarrativeText(String(assistant.message ?? '')) : undefined,
  };
}

function openingTargetMessage(rawMessages = activeMessages()) {
  const userMessages = rawMessages.filter((item) => item.role === 'user');
  if (userMessages.length > 0) {
    throw new Error('当前聊天已经存在玩家消息；请使用原生聊天或旧开场恢复入口，避免覆盖既有剧情');
  }
  const assistant = rawMessages.find((item) => item.role === 'assistant');
  const messageId = Number(assistant?.message_id);
  if (!Number.isInteger(messageId) || messageId < 0) throw new Error('没有找到可承载开场状态的首个 assistant 楼层');
  return messageId;
}

export function createHostBridge(): GardenBridge | null {
  if (!g.waitGlobalInitialized || !g.getChatMessages || !g.createChatMessages || !g.triggerSlash) return null;
  let lastError = '';
  let hostGenerationActive = false;
  let hostGenerationStartedEpoch = 0;
  let regenerationPhase: 'idle' | 'generating' | 'settling' = 'idle';
  let chatRestoreToken = 0;
  // Phase 2 增量 A：本桥会话 epoch（iframe/桥重建后变化；初始 chat identity 用）。
  const sessionEpoch = Date.now();
  // Phase 2 增量 B：generation transport（计划 §2.7）。迁移期默认 native-trigger；
  // 只有 helper-generate 实机验收通过后才切换。宿主可注入 __GAL_GENERATION_TRANSPORT__
  // 覆盖（验收/回滚不碰代码），诊断可见当前值。
  const generationTransport: 'native-trigger' | 'helper-generate' =
    (hostWindow() as HostGlobals).__GAL_GENERATION_TRANSPORT__ === 'helper-generate' ? 'helper-generate' : 'native-trigger';
  // O01/O02: the exact Helper 4.8.18 APIs are wired, but no runtime probe is
  // claimed in this batch. Production therefore requires an explicit opt-in;
  // there is no silent fallback after the transactional path starts.
  const regenerationTransport: 'native-regenerate' | 'helper-generate-swipe' =
    (hostWindow() as HostGlobals).__GAL_REGENERATION_TRANSPORT__ === 'helper-generate-swipe'
      ? 'helper-generate-swipe'
      : 'native-regenerate';
  let regenerationCoordinator: GalRegenerationCoordinatorV1 | null = null;
  // 当前逻辑请求（sendUserMessage 创建；helper-generate 构造 generate() config 用）。
  let pendingRequest: GalAnyRequest | null = null;
  // Phase 2 增量 D：assistant 落楼失败时保留的已生成文本（显式重试落楼，不再调模型）。
  let pendingHelperResult: string | null = null;
  // Phase 2 增量 D：helper-generate 流式文本（pending GAL 指示投影）。
  let pendingStreamText = '';
  // createChatMessages 会在 Promise 完成前先发 MESSAGE_RECEIVED / MVU 事件。
  // assistant 尚未完整持久化时禁止 settlement 写同一个 message-scope，避免旧 data 回写覆盖本轮 VisitTurn。
  let assistantPersistenceInFlight = false;
  const transactions = new MessageTransactionCoordinator({
    currentChatId,
    listMessages: activeMessages,
    isGenerationActive: () => hostGenerationActive,
    chatEpoch: () => sessionEpoch,
    mvuEpoch: () => variableUpdateEpoch,
    async createUserMessage(message, extra) {
      await g.createChatMessages?.(
        [{ role: 'user', message, is_hidden: false, extra }],
        { insert_before: 'end', refresh: 'none' },
      );
    },
    async prepareGeneration() {
      const current = transactions.read();
      if (pendingRequest?.schema === REQUEST_SCHEMA_V2
        && current.requestId === pendingRequest.requestId) {
        const player = activeMessages().find((message) => (
          Number(message.message_id) === current.userMessageId
        ));
        const stored = player?.message ?? player?.mes;
        if (!storedUserMessageMatchesRequestV2(pendingRequest, stored)) {
          throw new Error('真实玩家楼层与冻结请求不一致：已拒绝生成');
        }
      }
      // createChatMessages resolves after insertion, but Luker may still be
      // draining message/regex refresh callbacks. Keep the GAL busy overlay up
      // while giving the long-lived generation listener a stable turn.
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 450));
    },
    async triggerGeneration() {
      const current = transactions.read();
      // 第二批 V2：冻结请求一律固定 helper-generate 路径（禁 /trigger 静默回退）；
      // generate() 不可用时 runHelperGenerate 内部 fail-closed（抛错），不落入旧触发分支。
      const isV2Pending = pendingRequest?.schema === REQUEST_SCHEMA_V2;
      if (pendingRequest
        && current.requestId === pendingRequest.requestId
        && (generationTransport === 'helper-generate' || isV2Pending)) {
        await runHelperGenerate();
        return;
      }
      const startedEpoch = hostGenerationStartedEpoch;
      hostGenerationActive = true;
      await g.triggerSlash?.('/trigger await=true');
      if (hostGenerationStartedEpoch === startedEpoch) hostGenerationActive = false;
    },
    async continueGeneration() {
      const startedEpoch = hostGenerationStartedEpoch;
      hostGenerationActive = true;
      await g.triggerSlash?.('/continue await=true');
      if (hostGenerationStartedEpoch === startedEpoch) hostGenerationActive = false;
    },
  });

  const requireMvu = async () => {
    if (!g.Mvu?.getMvuData) await g.waitGlobalInitialized?.('Mvu');
    if (!g.Mvu?.getMvuData) throw new Error('MVU 全局未就绪');
    return g.Mvu;
  };

  const collectRuntimeDiagnostics = async (): Promise<RuntimeDiagnostics> => {
    let mvuReady = false;
    try { await requireMvu(); mvuReady = true; } catch { mvuReady = false; }
    return {
      mode: 'host',
      tavernVersion: g.getTavernVersion?.() ?? 'unknown',
      helperVersion: g.getTavernHelperVersion?.() ?? 'unknown',
      mvuReady,
      bridgeVersion: '0.4.3-host-generate-r26',
      generationTransport,
      regenerationTransport,
      regenerationBlockedReason: regenerationTransport === 'native-regenerate'
        ? '事务代码已接线；未做真实宿主时序/探针验收，默认保留 native-regenerate'
        : undefined,
      databaseAvailable: memoryPort.capability === 'available',
      databaseVersion: memoryPort.capability === 'available'
        ? 'SP·数据库 VII（database-assisted）'
        : memoryPort.capability === 'unavailable'
          ? '数据库增强版（能力未就绪）'
          : '独立 MVU 版：数据库能力未装配',
      lastError: lastError || undefined,
    };
  };

  const readAcceptedAssistantIdentity = (snapshot: MessageTransactionSnapshot) => () => {
    const assistantMessageId = Number(snapshot.assistantMessageId);
    const message = activeMessages().find((item) => Number(item.message_id) === assistantMessageId);
    if (!message || messageRole(message) !== 'assistant') return null;
    const metadata = parseAttemptMetadata(message.extra);
    const swipeId = Number(message.swipe_id);
    if (!metadata.ok || !Number.isInteger(swipeId) || swipeId < 0) return null;
    return {
      messageId: assistantMessageId,
      swipeId,
      requestId: String(metadata.value.requestId ?? ''),
      attemptId: String(metadata.value.attemptId ?? ''),
      commitKey: String(metadata.value.commitKey ?? ''),
      chatId: String(metadata.value.chatId ?? ''),
      ownerCharacterId: String(metadata.value.ownerCharacterId ?? ''),
    } satisfies AcceptedAssistantIdentity;
  };

  const persistCommitSettled = async (snapshot: MessageTransactionSnapshot) => {
    const userMessage = activeMessages().find((item) => Number(item.message_id) === Number(snapshot.userMessageId));
    const userAction = parseGardenAction(String(userMessage?.message ?? userMessage?.mes ?? ''));
    // 本地托管剧情以“非空回复 + 白名单结算复读”为完整合同；VisitTurn/lifecycle
    // 只服务附属记忆与重生成审计，不能反过来阻断教程或其他固定事件。
    if (snapshot.receiptPolicy === 'next-nonempty-assistant'
      || (userAction && isLocalSettlementActionMarker(userAction))) return;
    const assistantMessageId = Number(snapshot.assistantMessageId);
    if (!snapshot.requestId || !snapshot.attemptId || !snapshot.commitKey
      || !Number.isInteger(assistantMessageId) || assistantMessageId < 0) return;
    const message = activeMessages().find((item) => Number(item.message_id) === assistantMessageId);
    const metadata = parseAttemptMetadata(message?.extra);
    if (!metadata.ok || metadata.value.commitKey !== snapshot.commitKey) return;
    const mvu = await requireMvu();
    if (!mvu.replaceMvuData) return;
    const options = { type: 'message' as const, message_id: assistantMessageId };
    const data = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
    const current = isRecord(data[COMMIT_LIFECYCLE_KEY]) ? data[COMMIT_LIFECYCLE_KEY] : null;
    if (snapshot.requestSchema === REQUEST_SCHEMA_V2) {
      if (pendingRequest?.schema !== REQUEST_SCHEMA_V2 || pendingRequest.requestId !== snapshot.requestId) {
        throw new Error('冻结 V2 request 缺失，禁止单独标记 lifecycle settled');
      }
      const identityReader = readAcceptedAssistantIdentity(snapshot);
      const identityBefore = requireAcceptedAssistantIdentity(identityReader, snapshot, options);
      const statData = isRecord(data.stat_data) ? data.stat_data as GardenState : {};
      const assistantText = String(message?.message ?? message?.mes ?? '');
      const expected = applyVisitTurnsToFinalState(
        statData,
        pendingRequest,
        snapshot,
        assistantText,
        characterNamesOf(statData),
        identityBefore.swipeId,
      );
      verifyFinalizedAssistantData(data, pendingRequest, snapshot, expected.turns);
      const identityAfter = requireAcceptedAssistantIdentity(identityReader, snapshot, options);
      if (!sameAcceptedAssistantIdentity(identityBefore, identityAfter)) {
        throw new Error('assistant swipe 在 lifecycle 验证期间发生变化');
      }
      return;
    }
    if (current?.status === 'settled' && current.commitKey === snapshot.commitKey) return;
    data[COMMIT_LIFECYCLE_KEY] = buildCommitLifecycle({
      requestId: snapshot.requestId,
      attemptId: snapshot.attemptId,
      commitKey: snapshot.commitKey,
    }, 'settled');
    await mvu.replaceMvuData(data, options);
    // 写后复读：turn + lifecycle 同时成立才视为 settled 确认（两阶段写的第二阶段）。
    const reread = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
    const rereadLifecycle = isRecord(reread[COMMIT_LIFECYCLE_KEY]) ? reread[COMMIT_LIFECYCLE_KEY] : null;
    if (rereadLifecycle?.status !== 'settled' || rereadLifecycle?.commitKey !== snapshot.commitKey) {
      throw new Error('lifecycle 写回后复读仍非 settled');
    }
  };

  /**
   * 从事务快照重建 attempt（helper-generate 的落楼/重试共用）。
   */
  const buildAttemptFromSnapshot = (snapshot: MessageTransactionSnapshot): GalGenerationAttempt | null => {
    if (!snapshot.requestId || !snapshot.attemptId || !snapshot.generationId) return null;
    return {
      schema: 'gal-generation-attempt.v1',
      requestId: snapshot.requestId,
      attemptId: snapshot.attemptId,
      generationId: snapshot.generationId,
      mode: 'send',
      chatId: snapshot.chatId,
      ownerCharacterId: snapshot.ownerCharacterId ?? '',
      commitKey: snapshot.commitKey ?? `${snapshot.requestId}:${snapshot.attemptId}`,
      createdAt: new Date().toISOString(),
    };
  };

  /**
   * Phase 4 §4.2：挂载时从真实聊天重建事务（iframe/热更新/bundle 重载后内存事务视为丢失）。
   * 幂等：绑定 ownerCharacterId + chatId + requestId；incomplete/conflict 进入恢复态
   * （禁止自动重发），confirmed 恢复 settled 与 GAL 投影；none 正常开放发送。
   */
  const restoreFromChat = () => {
    const identity = {
      ownerCharacterId: String(g.SillyTavern?.getContext?.().characterId ?? ''),
      chatId: currentChatId(),
    };
    if (!identity.chatId) return;
    const result = analyzeChatRestore(activeMessages(), identity);
    // F02：恢复出的 request 必须成为本次恢复事务的唯一内存冻结请求；
    // conflict/none 清空，绝不让上一个 chat/request 残留。
    if (result.kind === 'incomplete' || result.kind === 'settlement-pending' || result.kind === 'confirmed') {
      pendingRequest = result.request;
    } else {
      pendingRequest = null;
    }
    if (transactions.restoreFromChat(result)) {
      console.debug('[gal:restore]', result.kind);
    }
  };
  restoreFromChat();

  /**
   * 幂等写入 helper-generate 的 assistant 楼层（commitKey 反查复用；refresh:'affected'
   * 触发 MESSAGE_RECEIVED → MVU，Probe B 实测）。调用方负责 chat identity 复核。
   */
  const writeHelperAssistantMessage = async (attempt: GalGenerationAttempt, text: string): Promise<void> => {
    const commit = resolveAssistantMessageByCommitKey(activeMessages(), attempt.requestId, attempt.attemptId);
    if (commit.ok) return; // 已存在：幂等复用
    if (commit.code === 'ambiguous') throw new Error('助手楼层 commitKey 反查歧义，禁止猜 ID');
    const mvu = await requireMvu();
    const latest = latestPersistedMessage(mvu);
    // MVU 变量域（stat_data 五字段）：ST 原生楼层的 data 结构不含 stat_data，
    // 必须用最新持久化 state 构造，否则该楼层不参与 MVU 变量更新（Probe B 实测）。
    const baseData = latest?.state
      ? { ...EMPTY_MVU_DATA, stat_data: latest.state }
      : EMPTY_MVU_DATA;
    const data = {
      ...baseData,
      [COMMIT_LIFECYCLE_KEY]: buildCommitLifecycle(attempt, 'pending'),
    };
    assistantPersistenceInFlight = true;
    try {
      await g.createChatMessages?.(
        [{ role: 'assistant', message: text, is_hidden: false, data, extra: buildAttemptMetadata(attempt) }],
        { insert_before: 'end', refresh: 'affected' },
      );
    } finally {
      assistantPersistenceInFlight = false;
    }
  };

  /**
   * Phase 2 增量 B：helper-generate 发送路径。
   * - generate() Promise 为唯一权威；start/stream/end 事件按 generationId 过滤；
   * - should_silence:true（不干扰 ST 停止按钮）；历史由 overrides.chat_history.prompts 提供
   *   （排除本次玩家楼层，避免与 user_input 重复）；
   * - resolve 后：chat identity 复核 → 输出校验（空/空白/tool-call）→ 幂等写 assistant 楼层
   *   （落楼失败保留内存结果供显式重试，不再自动调模型）；
   * - stream 文本经 CustomEvent 广播（pending GAL 指示）；listener finally 清理。
   */
  const runHelperGenerate = async () => {
    const snapshot = transactions.read();
    const request = pendingRequest;
    if (!request || !g.generate) throw new Error('helper-generate 需要有效 request 与 generate()');
    const attempt = buildAttemptFromSnapshot(snapshot);
    if (!attempt) throw new Error('helper-generate 需要有效 attempt 标识');
    // 当前 snapshot 是本次真实 attempt；pendingRequest 只保存下一次模型调用的序号。
    pendingRequest = advanceAnyRequest(request, snapshot.attemptSeq ?? request.attemptSeq);
    const userMessageId = snapshot.userMessageId ?? null;
    const startedEpoch = hostGenerationStartedEpoch;
    hostGenerationActive = true;
    const iframeEvents = g.iframe_events ?? hostWindow().TavernHelper?.iframe_events ?? {};
    const unsubs: Array<() => void> = [];
    const subscribe = (name: string | undefined, listener: (...args: unknown[]) => void) => {
      if (!name || !g.eventOn) return;
      try {
        const sub = g.eventOn(name, listener);
        if (sub && typeof sub.stop === 'function') unsubs.push(sub.stop);
      } catch { /* ignore */ }
    };
    let endedLogged = false;
    // Phase 3：停止请求（玩家 stop 按钮 → stopGenerationById → 本事件/或 generate reject 到达）。
    let stopRequested = false;
    const trace = (event: string, detail: unknown = '') => {
      console.debug(`[gal:helper-generate] ${attempt.generationId} ${event}`, detail);
    };
    subscribe(iframeEvents.GENERATION_STARTED, (id) => { if (id !== attempt.generationId) return; trace('started'); });
    subscribe(iframeEvents.STREAM_TOKEN_RECEIVED_FULLY, (text, id) => {
      if (id !== attempt.generationId) return;
      if (typeof text === 'string') {
        pendingStreamText = text;
        // 投影到 pending GAL 指示（app 监听更新生成中文本）。
        globalThis.dispatchEvent(new CustomEvent('gensokyo-garden:generation-stream', { detail: { text } }));
      }
      trace('stream', typeof text === 'string' ? `${text.length} chars` : '?');
    });
    subscribe(iframeEvents.GENERATION_ENDED, (text, id) => {
      if (id !== attempt.generationId || endedLogged) return;
      endedLogged = true;
      trace('ended', typeof text === 'string' ? `${text.length} chars` : '?');
    });
    // 实机事实：宿主 iframe_events 运行时缺 GENERATION_STOPPED 键（dist 常量 'generation_stopped' 存在）——
    // 用 fallback 字面量保证订阅；缺订阅也不影响停止语义（stopWasRequested 双源：事件 + phase==='stopping'）。
    const stoppedEventName = iframeEvents.GENERATION_STOPPED ?? 'generation_stopped';
    subscribe(stoppedEventName, (id) => {
      if (id !== attempt.generationId) return;
      stopRequested = true;
      trace('stopped');
    });
    const stopWasRequested = () => stopRequested || transactions.read().phase === 'stopping';
    try {
      // 第二批 V2：生成历史 = 冻结的合成历史（恰好一条、非空、system-only），
      // 并显式 with_depth_entries:false，杜绝真实楼层/深度条目进入生成调用；
      // 第三批 T02：V2 config 由统一纯 builder 构造（send 与 regenerate 共用，
      // builder 不读宿主、不改 request，generation_id 由 attempt 提供）；
      // V1 兼容路径保留 buildChatHistoryForGenerate（Phase 2 增量 B 语义，仅旧事务恢复用）。
      const isV2Request = request.schema === REQUEST_SCHEMA_V2;
      const config = isV2Request
        ? (() => {
          const built = buildGalGenerateConfig(request as GalGenerationRequestV2, { generationId: attempt.generationId });
          if (!built.ok) {
            throw new Error('V2 冻结请求缺少恰好一条非空 system 合成历史，拒绝生成');
          }
          return built.built.config;
        })()
        : {
          generation_id: attempt.generationId,
          user_input: request.modelUserInput,
          should_stream: false,
          should_silence: true,
          overrides: {
            chat_history: {
              prompts: buildChatHistoryForGenerate(activeMessages(), userMessageId),
            },
          },
        };
      trace('call');
      // 记录生成前最后楼层 id：ST 1.18 的 generate() 会自动落楼（should_silence 不抑制），
      // resolve 后若发现新落 assistant 楼层则复用并补 attempt metadata（幂等建立 commitKey），
      // 未落楼才由本卡写入（避免双写）。
      const floorsBefore = Number(activeMessages().at(-1)?.message_id ?? 0);
      let result: unknown;
      try {
        result = await g.generate(config);
      } catch (error) {
        // Phase 3：停止已请求 → abort 导致的 reject 属预期结束，转入停止对账（不显示为失败）。
        if (stopWasRequested()) {
          trace('stopped_rejected');
          return;
        }
        throw error;
      }
      trace('resolved', typeof result);
      // Phase 3：停止后迟到 resolve（abort 竞态下模型可能先返回）——迟到文本不得落正式楼层。
      if (stopWasRequested()) {
        trace('late_resolve_ignored');
        return;
      }
      // 输出校验（计划 §2.4）：tool-call 结果不落楼，明确失败供重试。
      if (typeof result !== 'string') {
        trace('unsupported_tool_call');
        throw new Error('模型返回了不支持的 tool-call 结果，请重试本次请求');
      }
      const text = result;
      if (!text.trim()) {
        // 空/空白结果：不落空楼层（保持可重试）。
        trace('empty_result');
        return;
      }
      // chat identity 复核（写前）：切聊天不落楼
      const currentOwnerCharacterId = String(g.SillyTavern?.getContext?.().characterId ?? '');
      if (currentChatId().trim() !== snapshot.chatId
        || currentOwnerCharacterId !== snapshot.ownerCharacterId) {
        trace('ignored_chat_switched');
        return;
      }
      try {
        const stFloor = activeMessages()
          .filter((m) => m.role === 'assistant' && Number(m.message_id ?? 0) > floorsBefore)
          .at(-1);
        if (stFloor) {
          // ST 自动落楼：复用楼层并补 attempt metadata + MVU 变量域（幂等 commitKey 语义）。
          const mvuForSt = await requireMvu();
          const latestForSt = latestPersistedMessage(mvuForSt);
          const baseDataForSt = latestForSt?.state
            ? { ...EMPTY_MVU_DATA, stat_data: latestForSt.state }
            : EMPTY_MVU_DATA;
          const dataForSt = {
            ...baseDataForSt,
            [COMMIT_LIFECYCLE_KEY]: buildCommitLifecycle(attempt, 'pending'),
          };
          assistantPersistenceInFlight = true;
          try {
            await g.createChatMessages?.(
              [{ ...stFloor, data: dataForSt, extra: { ...(stFloor.extra ?? {}), ...buildAttemptMetadata(attempt) } }],
              { refresh: 'affected' },
            );
          } finally {
            assistantPersistenceInFlight = false;
          }
          trace('st_persisted', stFloor.message_id);
        } else {
          await writeHelperAssistantMessage(attempt, text);
          trace('persisted');
        }
      } catch (error) {
        // 计划 §2.6：assistant 创建失败——保留内存结果供显式重试落楼，禁止自动再调模型。
        pendingHelperResult = text;
        console.warn('[gal:helper-generate] assistant 落楼失败，已保留生成结果供显式重试：', error instanceof Error ? error.message : String(error));
        throw error;
      }
      // generate() 已返回非空正文，且本次精确 assistant 楼层已成功持久化；这就是
      // Helper 路径的完成权威。不要继续依赖宿主可能缺失的通用 GENERATION_ENDED。
      hostGenerationActive = false;
      transactions.markGenerationEnded();
    } finally {
      unsubs.forEach((stop) => { try { stop(); } catch { /* ignore */ } });
      pendingStreamText = '';
      // Phase 3：停止对账——已请求停止则 stopping → failed（可从头重试）。
      if (stopRequested || transactions.read().phase === 'stopping') {
        transactions.markStopReconciled();
      }
      if (hostGenerationStartedEpoch === startedEpoch) hostGenerationActive = false;
    }
  };

  let pendingSettlement: {
    before: GardenState;
    action: GardenActionMarker;
  } | null = null;
  let pendingOwnershipBefore: GardenState | null = null;
  let pendingSystemOperation: {
    type: 'anomaly_resolution' | 'duel_victory_dialogue';
    operationId: string;
    settlementId?: string;
  } | null = null;
  const settlementAttempts = new SettlementAttemptCoordinator();
  let transactionOperationInFlight = false;
  let variableUpdateEpoch = 0;
  let pendingVariableEpoch = 0;
  let assistantObservedAt = 0;
  let cardOperationInFlight = false;
  let saveOperationInFlight = false;

  const readTransaction = () => {
    const snapshot = transactions.read();
    hostGenerationActive = reconcileHostGenerationActivity(
      hostGenerationActive,
      snapshot,
      nativeSendStopButtonGenerating(),
    );
    return snapshot;
  };

  const runCardOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
    const transaction = readTransaction();
    if (cardOperationInFlight
      || transactionOperationInFlight
      || hostGenerationActive
      || regenerationPhase !== 'idle'
      || ['submitting_user', 'generating', 'settling'].includes(transaction.phase)) {
      throw new Error('当前回复或卡片事务仍在处理中，请稍候');
    }
    cardOperationInFlight = true;
    try {
      return await operation();
    } finally {
      cardOperationInFlight = false;
    }
  };

  const variableStageReady = (mvu: HostGlobals['Mvu'], assistantMessageId?: number) => {
    // helper assistant 会用上一层 stat_data 初始化变量基。存在 stat_data 不能证明
    // MagVarUpdate 已处理本回复，否则会在真实更新开始前提前进入本地结算。
    return isVariableStageReady({
      updateEpoch: variableUpdateEpoch,
      baselineEpoch: pendingVariableEpoch,
      isAnalyzing: Boolean(mvu?.isDuringExtraAnalysis?.()),
      assistantObservedAt,
      now: Date.now(),
    });
  };

  const waitForVariableStage = async (assistantMessageId?: number) => {
    const startedAt = Date.now();
    // 绑定助手楼层（如有）：优先等待目标楼层变量；Helper 的 VARIABLE_UPDATE_ENDED 事件
    // 不带楼层参数，故按 epoch 聚合（Probe B 实测），楼层复核在 getMvuData 层进行。
    if (Number.isInteger(assistantMessageId)) {
      console.debug(`[gal:mvu] waitForVariableStage 绑定楼层 ${assistantMessageId}`);
    }
    while (pendingSettlement || pendingOwnershipBefore || pendingSystemOperation) {
      const mvu = await requireMvu();
      if (variableStageReady(mvu, assistantMessageId)) return;
      if (Date.now() - startedAt >= 90000) {
        // 计划 §2.5：timeout 后不得再次生成文本，只进入“回复已保存、变量结算未完成”恢复状态。
        throw new Error(`回复已保存，但变量结算未在 90 秒内完成（目标楼层 ${assistantMessageId ?? '未绑定'}）；只恢复结算，不再生成文本`);
      }
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 100));
    }
  };

  const deterministicSettlementResult = (action: GardenActionMarker, before: GardenState) => {
    // 温室研究交流已改为单轮固定结算：research_talk / continue / end_conversation
    // 在回复到达后一次性写入完成标记，不再依赖跨轮会话轮数。
    if (action.action_id === 'greenhouse_research_talk'
      || action.action_id === 'continue_greenhouse_conversation'
      || (action.action_id === 'end_conversation' && action.event_id === 'greenhouse_multiturn_conversation')) {
      return 'conversation_settled_after_multiple_turns';
    }
    if (action.action_id === 'investigate_flower_core' && action.event_id === 'greenhouse_flower_core') {
      return 'event_activated';
    }
    if ((action.action_id === 'settle_flower_core_battle' || action.action_id === 'resume_battle_settlement')
      && action.event_id === 'greenhouse_flower_core') {
      return before.battle?.current?.outcome ?? '';
    }
    const event = action.event_id ? eventById.get(action.event_id) : undefined;
    if (!event?.trigger_action_ids.includes(action.action_id)) return '';
    return eventResultForAction(event.config_id, action.action_id) ?? event.allowed_results[0] ?? '';
  };

  const persistLocalSettlement = async (
    before: GardenState,
    action: GardenActionMarker,
    assistantMessageId: number,
    assistantText: string,
  ) => {
    const mvu = await requireMvu();
    if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持本地事件结算');
    if (!assistantText.trim()) throw new Error('assistant 回复为空，不能结算事件');
    const choices = settlementChoices(before, action);
    if (!choices.length) throw new Error(`事件 ${action.event_id} 没有可用的本地结算结果`);
    const parsedResult = deterministicSettlementResult(action, before);
    if (!parsedResult || !choices.includes(parsedResult)) {
      throw new Error(`事件 ${action.event_id} 的本地结算结果未登记或不在白名单内`);
    }
    const settlementText = `${assistantText}\n<GensokyoEventResult>${JSON.stringify({
      version: 'event-result.v1',
      event_id: action.event_id,
      result: parsedResult,
    })}</GensokyoEventResult>`;
    const options = { type: 'message' as const, message_id: assistantMessageId };
    const data = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
    // A local write (notably an acceptance jump) may have updated the previous
    // assistant floor after this request was submitted. Rebase on that durable
    // floor instead of resurrecting the stale send-time snapshot.
    const ownershipBase = persistedStateBefore(mvu, assistantMessageId) ?? before;
    // F03：事件结算转换 = ownership 恢复 + 事件结算 + presence + 统一调度（第 5 步），
    // 之后统一 helper 无条件对 V2 构造 VisitTurn 并写盘 + 复读验证（第 6-8 步）。
    const transformFinalState = (base: GardenState): GardenState => {
      const safeCurrent = restoreLocalEventOwnership(ownershipBase, base, true);
      const settledState = applyLocalSettlement(
        safeCurrent,
        action,
        assistantMessageId,
        settlementText,
      );
      const nextState = hasLocalPresenceTransition(action)
        ? settledState
        : applyPresenceUpdate(settledState, assistantText);
      // 固定事件可能推进时段：写盘前基于结算前后状态运行一次统一调度，
      // 让到期离场/到期计划/活动生命周期在同一个写盘事务内完成。
      return reconcileM2Runtime(safeCurrent, nextState, currentChatId());
    };
    // 固定剧情的模型职责只有叙事。收到本轮非空 assistant 后直接应用本地
    // 白名单结算，不再要求 VisitTurn、swipe、attempt 或 lifecycle 审计通过。
    data.stat_data = transformFinalState(isRecord(data.stat_data) ? data.stat_data as GardenState : before);
    await mvu.replaceMvuData(data, options);
    // settlementProjection 继续负责事件事实（不得冒充 VisitTurn 验证器）。
    const reread = mvu.getMvuData(options).stat_data ?? {};
    if (!settlementProjection(reread, action, assistantMessageId, reread as GardenState)) {
      throw new Error(`事件 ${action.event_id} 写入后复读校验失败`);
    }
  };

  const persistStagedLocalSession = async (before: GardenState, action: GardenActionMarker) => {
    const staged = stageLocalSession(before, action);
    if (staged === before) return before;
    const mvu = await requireMvu();
    if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持受控会话初始化');
    const latest = latestPersistedMessage(mvu);
    if (!latest) throw new Error('没有可承载受控会话的 assistant 楼层');
    latest.data.stat_data = staged;
    await mvu.replaceMvuData(latest.data, latest.options);
    const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
    if (reread.interaction?.current_session?.uid !== staged.interaction?.current_session?.uid) {
      throw new Error('受控会话初始化复读校验失败');
    }
    return reread;
  };

  const persistPendingSettlement = async (snapshot: MessageTransactionSnapshot) => {
    if (!pendingSettlement) return snapshot;
    const assistantMessageId = Number(snapshot.assistantMessageId);
    if (!snapshot.assistantResponded || !Number.isInteger(assistantMessageId) || assistantMessageId < 0) return snapshot;
    try {
      const raw = activeMessages().find((message) => Number(message.message_id) === assistantMessageId);
      const assistantText = String(raw?.message ?? raw?.mes ?? '');
      await persistLocalSettlement(pendingSettlement.before, pendingSettlement.action, assistantMessageId, assistantText);
      pendingSettlement = null;
      pendingOwnershipBefore = null;
      assistantObservedAt = 0;
      transactions.markSettlementSucceeded();
      return transactions.read();
    } catch (error) {
      transactions.markSettlementFailed(error);
      lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  };

  const preserveLocalOwnership = async (before: GardenState, snapshot: MessageTransactionSnapshot) => {
    const assistantMessageId = Number(snapshot.assistantMessageId);
    if (!snapshot.assistantResponded || !Number.isInteger(assistantMessageId) || assistantMessageId < 0) return snapshot;
    const mvu = await requireMvu();
    if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持本地事件边界校验');
    const options = { type: 'message' as const, message_id: assistantMessageId };
    const data = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
    const raw = activeMessages().find((message) => Number(message.message_id) === assistantMessageId);
    const assistantText = String(raw?.message ?? raw?.mes ?? '');
    const ownershipBase = persistedStateBefore(mvu, assistantMessageId) ?? before;
    // F03：统一 helper——先基于最终 state 构造 VisitTurn，再决定是否写盘；
    // 只有精确复读证明 VisitTurn 与 lifecycle 同时成立才 settled。
    // transformFinalState = ownership 恢复 + 系统操作转换（第 5 步）。
    const transformFinalState = (base: GardenState): GardenState => {
      let next = reconcileM2Runtime(ownershipBase, applyPresenceUpdate(
        restoreLocalEventOwnership(ownershipBase, base),
        assistantText,
      ), currentChatId());
      if (pendingSystemOperation?.type === 'anomaly_resolution') {
        const operationId = pendingSystemOperation.operationId;
        if (!next.events?.settled_ids?.includes(operationId)) {
          next = resolveAnomaly(next, assistantMessageId);
          next.events ??= {};
          next.events.settled_ids = Array.from(new Set([
            ...(next.events.settled_ids ?? []),
            operationId,
          ])).slice(-256);
        }
      } else if (pendingSystemOperation?.type === 'duel_victory_dialogue') {
        next = completeDuelVictoryDialogue(
          next,
          pendingSystemOperation.settlementId ?? '',
        );
      }
      return next;
    };
    const outcome = await finalizeAcceptedAssistant({
      mvu: mvu as FinalizeAcceptedAssistantInput['mvu'],
      options,
      currentData: data,
      before,
      assistantText,
      pendingRequest,
      snapshot,
      characterNames: characterNamesOf(before),
      readAssistantIdentity: readAcceptedAssistantIdentity(snapshot),
      transformFinalState,
    });
    void outcome;
    pendingOwnershipBefore = null;
    pendingSystemOperation = null;
    assistantObservedAt = 0;
    transactions.markSettlementSucceeded();
    return transactions.read();
  };

  const requireSaveApis = () => {
    if (!g.deleteChatMessages || !(g.reloadCurrentChat || g.SillyTavern?.reloadCurrentChat) || !g.getOrCreateChatWorldbook || !g.getWorldbook || !g.updateWorldbookWith) {
      throw new Error('当前 Tavern Helper 未提供存档／读档所需接口');
    }
  };

  const saveWorldbookAdapter = (): SaveWorldbookAdapter => {
    requireSaveApis();
    return {
      getOrCreateChatWorldbook: () => g.getOrCreateChatWorldbook!('current'),
      getWorldbook: (name) => g.getWorldbook!(name),
      updateWorldbook: (name, updater) => g.updateWorldbookWith!(name, updater, { render: 'debounced' }),
    };
  };

  const runSaveOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
    const transaction = readTransaction();
    if (saveOperationInFlight
      || cardOperationInFlight
      || transactionOperationInFlight
      || hostGenerationActive
      || regenerationPhase !== 'idle'
      || pendingSettlement
      || pendingOwnershipBefore
      || pendingSystemOperation
      || !['idle', 'settled'].includes(transaction.phase)) {
      throw new Error('当前回复、结算或系统操作仍在处理中，请稍候');
    }
    const mvu = await requireMvu();
    if (mvu.isDuringExtraAnalysis?.()) throw new Error('MVU 额外分析仍在进行，请稍候');
    requireSaveApis();
    saveOperationInFlight = true;
    transactionOperationInFlight = true;
    try {
      return await operation();
    } finally {
      saveOperationInFlight = false;
      transactionOperationInFlight = false;
    }
  };

  const recoverPendingV2Settlement = async (
    mvu: HostGlobals['Mvu'],
    current: GardenState,
    snapshot: MessageTransactionSnapshot,
  ) => {
    if (pendingRequest?.schema !== REQUEST_SCHEMA_V2 || !snapshot.assistantResponded) return false;
    const assistantMessageId = Number(snapshot.assistantMessageId);
    if (!Number.isInteger(assistantMessageId) || assistantMessageId < 0) return false;
    const identityReader = readAcceptedAssistantIdentity(snapshot);
    requireAcceptedAssistantIdentity(identityReader, snapshot, { type: 'message', message_id: assistantMessageId });
    const raw = activeMessages().find((message) => Number(message.message_id) === assistantMessageId);
    const assistantText = String(raw?.message ?? raw?.mes ?? '');
    const before = persistedStateBefore(mvu, assistantMessageId) ?? current;
    const options = { type: 'message' as const, message_id: assistantMessageId };
    const data = structuredClone(mvu!.getMvuData(options)) as Record<string, unknown>;
    await finalizeAcceptedAssistant({
      mvu: mvu as FinalizeAcceptedAssistantInput['mvu'],
      options,
      currentData: data,
      before,
      assistantText,
      pendingRequest,
      snapshot,
      characterNames: characterNamesOf(before),
      readAssistantIdentity: identityReader,
      transformFinalState: (base) => reconcileM2Runtime(
        before,
        applyPresenceUpdate(restoreLocalEventOwnership(before, base), assistantText),
        currentChatId(),
      ),
    });
    return true;
  };

  const recoverRecordedAnomalyResolution = async (mvu: HostGlobals['Mvu'], current: GardenState) => {
    const messages = activeMessages();
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const user = messages[index];
      if (messageRole(user) !== 'user') continue;
      const extra = isRecord(user.extra) ? user.extra : {};
      const operation = isRecord(extra.gensokyoSystemOperation) ? extra.gensokyoSystemOperation : null;
      const taggedOperation = operation?.version === 'system-operation.v1'
        && operation.type === 'anomaly_resolution';
      const userText = String(user.message ?? user.mes ?? '');
      const legacyOperation = extra.gensokyoTransactionKind === 'settlement'
        && userText.includes('【异变最终收束】');
      if (!taggedOperation && !legacyOperation) continue;
      const operationId = String(taggedOperation
        ? operation?.operationId ?? ''
        : extra.gensokyoTransactionId ?? '');
      if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(operationId)) continue;
      // F04：从同一系统操作玩家楼层解析 V2 冻结请求（V2 metadata 损坏不得降级旧恢复）。
      const restored = restoreGalGenerationRequestV2(user.extra);
      if (!restored.ok || restored.request.schema !== REQUEST_SCHEMA_V2) return false;
      const v2 = restored.request;
      // 从真实 assistant metadata 恢复实际 attempt；禁止用玩家楼层初始 attemptSeq 猜 retry attempt。
      const recovery = analyzeChatRestore(messages, {
        chatId: currentChatId(),
        ownerCharacterId: String(g.SillyTavern?.getContext?.().characterId ?? ''),
      });
      if ((recovery.kind !== 'settlement-pending' && recovery.kind !== 'confirmed')
        || recovery.request.requestId !== v2.requestId
        || recovery.userMessageId !== Number(user.message_id)) return false;
      const { attemptId, generationId, commitKey } = recovery.attempt;
      const assistantMessageId = recovery.assistantMessageId;
      // 复验 assistant 的 attempt metadata 与 operation/玩家楼层一致（fail closed）。
      const assistantRaw = messages.find((message) => Number(message.message_id) === assistantMessageId);
      const attemptMeta = parseAttemptMetadata(assistantRaw?.extra);
      if (!attemptMeta.ok
        || attemptMeta.value.requestId !== v2.requestId
        || attemptMeta.value.attemptId !== attemptId
        || attemptMeta.value.commitKey !== commitKey
        || attemptMeta.value.chatId !== currentChatId()
        || attemptMeta.value.ownerCharacterId !== String(g.SillyTavern?.getContext?.().characterId ?? '')) {
        return false;
      }
      const before = persistedStateBefore(mvu, assistantMessageId) ?? current;
      const options = { type: 'message' as const, message_id: assistantMessageId };
      const data = structuredClone(mvu!.getMvuData(options)) as Record<string, unknown>;
      const snapshot: MessageTransactionSnapshot = {
        transactionId: operationId,
        chatId: currentChatId(),
        kind: 'settlement',
        phase: 'settling',
        userMessageCreated: true,
        assistantResponded: true,
        userMessageId: Number(user.message_id),
        assistantMessageId,
        requestId: v2.requestId,
        requestSchema: REQUEST_SCHEMA_V2,
        attemptId,
        generationId,
        commitKey,
        ownerCharacterId: v2.ownerCharacterId,
      };
      // F04：恢复异变时先幂等应用 resolveAnomaly/settled ID，再交给统一 helper 写 VisitTurn。
      const transformFinalState = (base: GardenState): GardenState => {
        let next = restoreLocalEventOwnership(before, base);
        if (next.anomaly_cycle?.active) next = resolveAnomaly(next, assistantMessageId);
        next.events ??= {};
        next.events.settled_ids = Array.from(new Set([...(next.events.settled_ids ?? []), operationId])).slice(-256);
        return next;
      };
      const assistantText = String(assistantRaw?.message ?? assistantRaw?.mes ?? '');
      try {
        await finalizeAcceptedAssistant({
          mvu: mvu as FinalizeAcceptedAssistantInput['mvu'],
          options,
          currentData: data,
          before,
          assistantText,
          pendingRequest: v2,
          snapshot,
          characterNames: characterNamesOf(before),
          readAssistantIdentity: readAcceptedAssistantIdentity(snapshot),
          transformFinalState,
        });
      } catch (error) {
        // 恢复失败保持 pending：不写邻近楼层、不标 settled。
        console.debug('[gal:recover-anomaly]', error instanceof Error ? error.message : String(error));
        return false;
      }
      return true;
    }
    return false;
  };

  const recoverRecordedDuelVictory = async (mvu: HostGlobals['Mvu'], current: GardenState) => {
    const messages = activeMessages();
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const user = messages[index];
      if (messageRole(user) !== 'user') continue;
      const extra = isRecord(user.extra) ? user.extra : {};
      const operation = isRecord(extra.gensokyoSystemOperation) ? extra.gensokyoSystemOperation : null;
      if (operation?.version !== 'system-operation.v1'
        || operation.type !== 'duel_victory_dialogue') continue;
      const settlementId = String(operation.settlementId ?? '');
      if (!settlementId) continue;
      // F04：从同一系统操作玩家楼层解析 V2 冻结请求（V2 metadata 损坏不得降级旧恢复）。
      const restored = restoreGalGenerationRequestV2(user.extra);
      if (!restored.ok || restored.request.schema !== REQUEST_SCHEMA_V2) return false;
      const v2 = restored.request;
      const recovery = analyzeChatRestore(messages, {
        chatId: currentChatId(),
        ownerCharacterId: String(g.SillyTavern?.getContext?.().characterId ?? ''),
      });
      if ((recovery.kind !== 'settlement-pending' && recovery.kind !== 'confirmed')
        || recovery.request.requestId !== v2.requestId
        || recovery.userMessageId !== Number(user.message_id)) return false;
      const { attemptId, generationId, commitKey } = recovery.attempt;
      const assistantMessageId = recovery.assistantMessageId;
      const assistantRaw = messages.find((message) => Number(message.message_id) === assistantMessageId);
      const attemptMeta = parseAttemptMetadata(assistantRaw?.extra);
      if (!attemptMeta.ok
        || attemptMeta.value.requestId !== v2.requestId
        || attemptMeta.value.attemptId !== attemptId
        || attemptMeta.value.commitKey !== commitKey
        || attemptMeta.value.chatId !== currentChatId()
        || attemptMeta.value.ownerCharacterId !== String(g.SillyTavern?.getContext?.().characterId ?? '')) {
        return false;
      }
      const before = persistedStateBefore(mvu, assistantMessageId) ?? current;
      const options = { type: 'message' as const, message_id: assistantMessageId };
      const data = structuredClone(mvu!.getMvuData(options)) as Record<string, unknown>;
      const snapshot: MessageTransactionSnapshot = {
        transactionId: `duel-victory:${settlementId}`,
        chatId: currentChatId(),
        kind: 'settlement',
        phase: 'settling',
        userMessageCreated: true,
        assistantResponded: true,
        userMessageId: Number(user.message_id),
        assistantMessageId,
        requestId: v2.requestId,
        requestSchema: REQUEST_SCHEMA_V2,
        attemptId,
        generationId,
        commitKey,
        ownerCharacterId: v2.ownerCharacterId,
      };
      // F04：恢复决斗胜利——本地规则转换 + 统一 helper 写 VisitTurn。
      const transformFinalState = (base: GardenState): GardenState => (
        completeDuelVictoryDialogue(restoreLocalEventOwnership(before, base), settlementId)
      );
      const assistantText = String(assistantRaw?.message ?? assistantRaw?.mes ?? '');
      try {
        await finalizeAcceptedAssistant({
          mvu: mvu as FinalizeAcceptedAssistantInput['mvu'],
          options,
          currentData: data,
          before,
          assistantText,
          pendingRequest: v2,
          snapshot,
          characterNames: characterNamesOf(before),
          readAssistantIdentity: readAcceptedAssistantIdentity(snapshot),
          transformFinalState,
        });
      } catch (error) {
        console.debug('[gal:recover-duel]', error instanceof Error ? error.message : String(error));
        return false;
      }
      return true;
    }
    return false;
  };

  const recoverCompletedCurrentTransaction = (current: GardenState) => {
    const snapshot = transactions.read();
    // V2 必须经统一 finalizer 验证本次 exact turn/lifecycle；旧事件投影不得捷径 settled。
    if (snapshot.requestSchema === REQUEST_SCHEMA_V2) return false;
    const assistantMessageId = Number(snapshot.assistantMessageId);
    if (snapshot.phase === 'settled' || !snapshot.assistantResponded
      || !Number.isInteger(assistantMessageId) || assistantMessageId < 0) return false;
    const user = activeMessages().find((message) => {
      if (messageRole(message) !== 'user') return false;
      const extra = isRecord(message.extra) ? message.extra : {};
      return extra.gensokyoTransactionId === snapshot.transactionId;
    });
    const action = parseGardenAction(String(user?.message ?? user?.mes ?? ''));
    if (!action || !settlementProjection(current, action, assistantMessageId)) return false;
    pendingSettlement = null;
    pendingOwnershipBefore = null;
    assistantObservedAt = 0;
    transactions.markSettlementSucceeded();
    lastError = '';
    return true;
  };

  const settlePendingAfterReply = (forceReady = false): Promise<boolean> => {
    if (assistantPersistenceInFlight) return Promise.resolve(false);
    return settlementAttempts.run(forceReady, async (attemptForceReady) => {
      const snapshot = readTransaction();
      try {
        if ((pendingSettlement || pendingOwnershipBefore || pendingSystemOperation) && snapshot.assistantResponded) {
          assistantObservedAt ||= Date.now();
          const mvu = await requireMvu();
          // 本地托管剧情的事实由代码拥有；精确的非空 assistant 已落楼后，
          // 固定事件、异变收束和决斗胜利都不再等待模型变量阶段。
          if (!attemptForceReady && !pendingSettlement && !pendingSystemOperation && !variableStageReady(mvu)) return false;
          if (pendingSettlement) await persistPendingSettlement(snapshot);
          else if (pendingOwnershipBefore) await preserveLocalOwnership(pendingOwnershipBefore, snapshot);
          lastError = '';
          return true;
        }
        const mvu = await requireMvu();
        const current = latestPersistedState(mvu);
        const recorded = findRecordedLocalSettlement(activeMessages(), current);
        if (recoverCompletedCurrentTransaction(current)) return true;
        if (await recoverRecordedAnomalyResolution(mvu, current)) return true;
        if (await recoverRecordedDuelVictory(mvu, current)) return true;
        // 本地托管剧情先按精确楼层恢复；只有自由对话恢复仍等待 MVU。
        if (mvu.isDuringExtraAnalysis?.() && !recorded) return false;
        if (!recorded) {
          if (snapshot.recovery !== 'settlement') return false;
          if (snapshot.requestSchema === REQUEST_SCHEMA_V2) {
            if (!await recoverPendingV2Settlement(mvu, current, snapshot)) {
              throw new Error('V2 reload settlement 缺少可验证的冻结请求或精确 assistant');
            }
            transactions.markSettlementSucceeded();
            lastError = '';
            return true;
          }
          transactions.markSettlementSucceeded();
          lastError = '';
          return true;
        }
        const before = persistedStateBefore(mvu, recorded.assistantMessageId) ?? current;
        await persistLocalSettlement(before, recorded.action, recorded.assistantMessageId, recorded.assistantText);
        const reconciled = transactions.read();
        if (reconciled.assistantResponded && reconciled.assistantMessageId === recorded.assistantMessageId) {
          pendingSettlement = null;
          pendingOwnershipBefore = null;
          assistantObservedAt = 0;
          transactions.markSettlementSucceeded();
          lastError = '';
        }
        return true;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if ((pendingSettlement || pendingOwnershipBefore || pendingSystemOperation) && snapshot.assistantResponded) {
          pendingSettlement = null;
          pendingOwnershipBefore = null;
          pendingSystemOperation = null;
          assistantObservedAt = 0;
          transactions.markSettlementFailed(error);
        }
        if (attemptForceReady) throw error;
        return false;
      }
    }).then(async (settled) => {
      if (!settled) return false;
      try {
        await persistCommitSettled(transactions.read());
        return true;
      } catch (error) {
        transactions.markSettlementFailed(error);
        throw error;
      }
    });
  };

  const requirePendingSettlement = async () => {
    await settlePendingAfterReply(true);
    let snapshot = transactions.read();
    // A background readiness probe may have owned the shared promise. Run the
    // force-ready pass once more after it releases the slot.
    if (snapshot.phase === 'settling') {
      await settlePendingAfterReply(true);
      snapshot = transactions.read();
    }
    if (snapshot.phase !== 'settled') {
      throw new Error(snapshot.lastError || '回复已收到，但本地游戏状态尚未完成结算');
    }
    return snapshot;
  };

  const readAllSwipesMessage = (messageId: number): Record<string, unknown> | null => {
    const rows = g.getChatMessages?.(messageId, { include_swipes: true, hide_state: 'all' }) ?? [];
    const row = rows.find((item) => Number(item.message_id) === messageId) ?? rows[0];
    return row ? structuredClone(row) : null;
  };

  const regenerationStorageKey = () => (
    `gal.regeneration.v1:${currentChatId()}:${String(g.SillyTavern?.getContext?.().characterId ?? '')}`
  );

  const createRegenerationPorts = (): RegenerationHostPortsV1 => {
    let replayBaselineState: GardenState = {};
    let replayContext: {
      request: GalGenerationRequestV2;
      attemptId: string;
      commitKey: string;
      assistantMessageId: number;
      assistantSwipeId: number;
      candidateText: string;
    } | null = null;

    return {
      async readHostContext() {
        const messages = activeMessages();
        return {
          chatId: currentChatId(),
          ownerCharacterId: String(g.SillyTavern?.getContext?.().characterId ?? ''),
          messages,
          messageTotal: messages.length,
        };
      },
      async readAssistantView(messageId) {
        const resolvedId = messageId >= 0
          ? messageId
          : Number(activeMessages().filter((message) => messageRole(message) === 'assistant').at(-1)?.message_id);
        return Number.isInteger(resolvedId) ? readAllSwipesMessage(resolvedId) : null;
      },
      async readActiveView(messageId) {
        const view = readAllSwipesMessage(messageId);
        if (!view) return {};
        const swipeId = Number(view.swipe_id);
        const swipes = Array.isArray(view.swipes) ? view.swipes : [];
        const infos = Array.isArray(view.swipes_info) ? view.swipes_info : [];
        return {
          message_id: view.message_id,
          swipe_id: swipeId,
          message: swipes[swipeId] ?? view.message,
          extra: isRecord(infos[swipeId]) ? infos[swipeId].extra : view.extra,
        };
      },
      async readBaseline(target) {
        const floorId = target.originalRequest.stateMessageIdBeforeGeneration;
        return readFrozenBaselineV1({
          stateMessageIdBeforeGeneration: floorId,
          stateSwipeIdBeforeGeneration: target.originalRequest.stateSwipeIdBeforeGeneration,
          message: floorId === null ? null : readAllSwipesMessage(floorId),
        });
      },
      async readDrift({ target, sourceAttemptId }) {
        const view = readAllSwipesMessage(target.assistantMessageId);
        const data = Array.isArray(view?.swipes_data) && isRecord(view.swipes_data[target.sourceSwipeId])
          ? view.swipes_data[target.sourceSwipeId] as Record<string, unknown>
          : null;
        if (!data) return { kind: 'receipt-mismatch', code: 'swipe-mismatch' };
        return decideRegenerationDriftV1({
          receipt: readRegenerationReceiptFromDataV1(data),
          identity: {
            requestId: target.requestId,
            attemptId: sourceAttemptId,
            assistantMessageId: target.assistantMessageId,
            assistantSwipeId: target.sourceSwipeId,
          },
          currentActiveDataFingerprint: fingerprintMvuData(data),
        });
      },
      async readOperation(target, candidateText) {
        const player = activeMessages().find((message) => Number(message.message_id) === target.playerMessageId);
        const extra = isRecord(player?.extra) ? player.extra : {};
        const system = isRecord(extra.gensokyoSystemOperation) ? extra.gensokyoSystemOperation : null;
        if (system?.version === 'system-operation.v1' && system.type === 'anomaly_resolution') {
          return { kind: 'anomaly-resolution', operationId: String(system.operationId ?? ''), candidateText };
        }
        if (system?.version === 'system-operation.v1' && system.type === 'duel_victory_dialogue') {
          return {
            kind: 'duel-victory',
            settlementId: String(system.settlementId ?? ''),
            operationId: String(system.operationId ?? ''),
            candidateText,
          };
        }
        const action = parseGardenAction(String(player?.message ?? player?.mes ?? ''));
        return action ? { kind: 'normal-interaction', action, candidateText } : null;
      },
      async buildVisitTurns({ target, attemptId, commitKey, candidateText }) {
        replayContext = {
          request: target.originalRequest,
          attemptId,
          commitKey,
          assistantMessageId: target.assistantMessageId,
          assistantSwipeId: target.candidateSwipeId,
          candidateText,
        };
        return [];
      },
      async generateCandidate({ generationId, request }) {
        if (!g.generate) throw new Error('Helper generate() 未暴露');
        const built = buildGalGenerateConfig(request, { generationId });
        if (!built.ok) return { ok: false, code: 'empty' };
        const value = await g.generate(built.built.config);
        if (typeof value !== 'string') return { ok: false, code: 'tool-call' };
        return value.trim() ? { ok: true, text: value } : { ok: false, code: 'empty' };
      },
      async writeSwipe(plan) {
        if (!g.setChatMessages) return { ok: false, code: 'write-failed' };
        try {
          await g.setChatMessages([{
            message_id: plan.messageId,
            swipe_id: plan.swipe_id,
            swipes: structuredClone(plan.swipes),
            swipes_data: structuredClone(plan.swipes_data),
            swipes_info: structuredClone(plan.swipes_info),
          }], { refresh: 'affected' });
          return { ok: true };
        } catch {
          return { ok: false, code: 'write-failed' };
        }
      },
      stopCandidate(generationId) {
        return Boolean(g.stopGenerationById?.(generationId));
      },
      async readActiveData(messageId) {
        const view = readAllSwipesMessage(messageId);
        const swipeId = Number(view?.swipe_id);
        if (!view || !Array.isArray(view.swipes_data) || !isRecord(view.swipes_data[swipeId])) {
          throw new Error('active swipe MvuData 不可读');
        }
        return structuredClone(view.swipes_data[swipeId] as Record<string, unknown>);
      },
      async commitReceipt() {
        // Receipt is already embedded in candidateData and committed atomically
        // with the swipe arrays. This hook deliberately performs no second write.
        return { ok: true };
      },
      replay: {
        async applyModelOutput(baseData, text) {
          const mvu = await requireMvu();
          if (!mvu.parseMessage) throw new Error('Mvu.parseMessage(message, old_data) 未暴露');
          return structuredClone(await mvu.parseMessage(text, structuredClone(baseData ?? EMPTY_MVU_DATA)));
        },
        restoreLocalEventOwnership(baseData, parsedData) {
          const next = structuredClone(parsedData);
          const before = isRecord(baseData?.stat_data) ? baseData.stat_data as GardenState : {};
          const parsed = isRecord(next.stat_data) ? next.stat_data as GardenState : {};
          replayBaselineState = structuredClone(before);
          next.stat_data = restoreLocalEventOwnership(before, parsed);
          return next;
        },
        applyLocalSettlement(data, operation) {
          const next = structuredClone(data);
          let state = isRecord(next.stat_data) ? next.stat_data as GardenState : {};
          if (operation.kind === 'anomaly-resolution') {
            state = resolveAnomaly(state, replayContext?.assistantMessageId ?? null);
            state.events ??= {};
            const operationId = String(operation.operationId ?? '');
            state.events.settled_ids = Array.from(new Set([...(state.events.settled_ids ?? []), operationId])).slice(-256);
          } else if (operation.kind === 'duel-victory') {
            state = completeDuelVictoryDialogue(state, String(operation.settlementId ?? ''));
          } else if (isRecord(operation.action)) {
            const action = operation.action as unknown as GardenActionMarker;
            const result = deterministicSettlementResult(action, state);
            const text = `${String(operation.candidateText ?? '')}\n<GensokyoEventResult>${JSON.stringify({
              version: 'event-result.v1', event_id: action.event_id, result,
            })}</GensokyoEventResult>`;
            state = applyLocalSettlement(state, action, replayContext?.assistantMessageId ?? -1, text);
          }
          next.stat_data = state;
          return next;
        },
        applyPresenceUpdate(data, text) {
          const next = structuredClone(data);
          next.stat_data = applyPresenceUpdate(
            isRecord(next.stat_data) ? next.stat_data as GardenState : {},
            text,
          );
          return next;
        },
        reconcileM2Runtime(data) {
          const next = structuredClone(data);
          const current = isRecord(next.stat_data) ? next.stat_data as GardenState : {};
          next.stat_data = reconcileM2Runtime(replayBaselineState, current, currentChatId());
          return next;
        },
        applyVisitTurns(data) {
          if (!replayContext) return { ok: false, code: 'visit-conflict', detail: 'replay context 缺失' };
          const next = structuredClone(data);
          const state = isRecord(next.stat_data) ? next.stat_data as GardenState : {};
          const result = applyVisitTurnsCommit({
            finalState: state,
            request: replayContext.request,
            attempt: {
              attemptId: replayContext.attemptId,
              commitKey: replayContext.commitKey,
              assistantMessageId: replayContext.assistantMessageId,
              assistantSwipeId: replayContext.assistantSwipeId,
            },
            clock: {
              day: state.environment?.day ?? null,
              time_period: state.environment?.time_period ?? null,
              period_serial: periodSerialFromState(state),
            },
            acceptedOutput: replayContext.candidateText,
            characterNames: characterNamesOf(state),
          });
          if (!result.ok) {
            return {
              ok: false,
              code: result.code === 'not-found' ? 'visit-missing' : 'visit-conflict',
              detail: result.code,
            };
          }
          next.stat_data = result.state;
          const turns: ReplayVisitTurnCommitV1[] = result.turns.map((turn) => ({
            turnId: turn.turn_id,
            summary: turn.summary,
            assistantMessageId: replayContext!.assistantMessageId,
            assistantSwipeId: replayContext!.assistantSwipeId,
            attemptId: replayContext!.attemptId,
            commitKey: replayContext!.commitKey,
            characterId: turn.character_id,
            gameDay: typeof turn.day === 'number' ? turn.day : null,
          }));
          return { ok: true, state: next, turns };
        },
        finalizeLifecycle(data) {
          if (!replayContext) throw new Error('replay lifecycle context 缺失');
          const next = structuredClone(data);
          next[COMMIT_LIFECYCLE_KEY] = buildCommitLifecycle({
            requestId: replayContext.request.requestId,
            attemptId: replayContext.attemptId,
            commitKey: replayContext.commitKey,
          }, 'settled');
          return next;
        },
      },
      async persist(state) {
        hostWindow().sessionStorage?.setItem(regenerationStorageKey(), JSON.stringify(state));
      },
      async load() {
        const raw = hostWindow().sessionStorage?.getItem(regenerationStorageKey());
        if (!raw) return null;
        try {
          const state = JSON.parse(raw) as RegenerationCoordinatorStateV1;
          const owner = String(g.SillyTavern?.getContext?.().characterId ?? '');
          if (state.version !== 1 || (state.target && (state.target.chatId !== currentChatId() || state.target.ownerCharacterId !== owner))) {
            return null;
          }
          return state;
        } catch {
          return null;
        }
      },
    };
  };

  return {
    async readState() {
      try {
        const mvu = await requireMvu();
        return latestPersistedState(mvu);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },
    async getOpeningContext() {
      let personaName = '';
      let personaDescription = '';
      try {
        personaName = g.getCurrentPersonaName?.() ?? '';
        const persona = g.getPersona?.('current');
        personaName = persona?.name || personaName;
        personaDescription = persona?.description ?? '';
        // 官方 ST 1.17 及以后没有 getCurrentPersonaName/getPersona（宿主自定义才有）：
        // 回退到官方 getContext().name1（当前用户名，即 {{user}} 展开源），兼容旧酒馆自动填充。
        if (!personaName) {
          const ctx = g.SillyTavern?.getContext?.();
          personaName = String(ctx?.name1 ?? '').trim();
        }
      } catch { /* Persona is optional. */ }
      return { chatId: currentChatId(), personaName, personaDescription };
    },
    async applyUserNameToHost(name) {
      const clean = String(name ?? '').trim();
      if (!clean) return { injected: false, method: 'none', reason: 'empty' };
      const ctx = g.SillyTavern?.getContext?.();
      if (!ctx) return { injected: false, method: 'none', reason: 'no-context' };
      // 把玩家输入注入酒馆原生宏（{{user}} 展开名），模型从系统层读到，无需每轮投影。
      // 多级探测：官方 slash → 官方/旧版 setUserName → 不支持则静默降级（stat_data 兜底照常写入）。
      if (typeof ctx.executeSlashCommandsWithOptions === 'function') {
        try {
          await ctx.executeSlashCommandsWithOptions(`/persona-set mode=temp ${JSON.stringify(clean)}`);
          return { injected: true, method: 'slash-persona-set' };
        } catch { /* fall through to setUserName */ }
      }
      if (typeof ctx.setUserName === 'function') {
        try {
          ctx.setUserName(clean, { toastPersonaNameChange: false });
          return { injected: true, method: 'setUserName' };
        } catch { /* fall through */ }
      }
      return { injected: false, method: 'none', reason: 'unsupported' };
    },
    async getOpeningProgress() {
      return openingProgress();
    },
    async initializeOpening(draft: OpeningDraft, expectedChatId: string) {
      const frozenChatId = expectedChatId.trim();
      if (!frozenChatId || currentChatId() !== frozenChatId) throw new Error('聊天已切换，请重新确认开局资料');
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持确定性写入');

      const persistedState = latestPersistedState(mvu);
      if (openingCommitted(persistedState, draft)) {
        const existingAssistant = activeMessages().find((item) => item.role === 'assistant');
        return {
          messageId: Number(existingAssistant?.message_id ?? 0),
          initializedFromDefaults: false,
          alreadyCommitted: true,
        };
      }
      if (persistedState.meta?.opening_committed) {
        throw new Error('当前聊天已经用另一组资料完成开局，不能静默覆盖');
      }

      const messageId = openingTargetMessage();
      const options = { type: 'message', message_id: messageId };
      const data = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
      const currentState = isRecord(data.stat_data) ? data.stat_data : {};
      const initializedFromDefaults = !isRecord(currentState.meta);
      const nextState = mergeState(initialState as Record<string, unknown>, currentState);
      applyOpeningDraft(nextState, draft);
      data.stat_data = nextState;
      await mvu.replaceMvuData(data, options);

      const persisted = mvu.getMvuData(options).stat_data ?? {};
      if (!openingCommitted(persisted, draft)) throw new Error('MVU 写入后复读校验失败');
      return { messageId, initializedFromDefaults, alreadyCommitted: false };
    },
    async commitOpening(_draft: OpeningDraft, message: string, expectedChatId: string) {
      const frozenChatId = expectedChatId.trim();
      if (!frozenChatId || currentChatId() !== frozenChatId) throw new Error('聊天已切换，请重新确认开局预览');
      const marker = `<gensokyo_opening transaction="${encodeURIComponent(frozenChatId)}" />`;
      // `include_swipes: true` returns ChatMessageSwiped, which intentionally has
      // no `message` field in Tavern Helper 4.8.19. Use the active-page shape for
      // idempotency, and also compare the normalized body because regex display
      // rules may strip the transaction marker before a retry.
      const rawMessages = activeMessages();
      const expectedBody = message.trim();
      const withoutMarker = (value: unknown) => String(value ?? '')
        .replace(/\n*<gensokyo_opening transaction="[^"]+" \/>\s*$/u, '')
        .trim();
      const exists = rawMessages.some((item) => item.role === 'user' && (
        String(item.message ?? '').includes(marker)
        || withoutMarker(item.message) === expectedBody
      ));
      const content = `${message.trim()}\n\n${marker}`;
      if (!message.trim() || content.length > 6000) throw new Error('开场消息应为 1–6000 个字符');
      const snapshot = await transactions.submit({
        kind: 'opening',
        transactionId: `opening-${encodeURIComponent(frozenChatId)}`,
        message: content,
        matchesExisting: (item) => item.role === 'user' && (
          String(item.message ?? '').includes(marker)
          || withoutMarker(item.message) === expectedBody
        ),
      });
      if (!snapshot.assistantResponded) throw new Error(snapshot.lastError || '没有收到完整的开场回复');
      transactions.markSettlementSucceeded();
      return { messageCreated: !exists, generationTriggered: true };
    },
    async enterGarden(expectedChatId: string) {
      const frozenChatId = expectedChatId.trim();
      if (!frozenChatId || currentChatId() !== frozenChatId) throw new Error('聊天已切换，请重新打开恢复页');
      const rawMessages = activeMessages();
      const openingIndex = rawMessages.findIndex((item) =>
        item.role === 'user' && String(item.message ?? '').includes(OPENING_MARKER));
      if (openingIndex < 0) throw new Error('没有找到带事务标记的原始开场消息');
      const assistant = rawMessages
        .slice(openingIndex + 1)
        .filter((item) => item.role === 'assistant' && String(item.message ?? '').trim().length > 0)
        .at(-1);
      const messageId = Number(assistant?.message_id);
      if (!Number.isInteger(messageId) || messageId < 0) throw new Error('尚未找到完整的开场回复');
      const draft = parseOpeningMessage(String(rawMessages[openingIndex].message ?? ''));
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持确定性写入');
      const options = { type: 'message', message_id: messageId };
      const data = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
      const currentState = isRecord(data.stat_data) ? data.stat_data : {};
      const initializedFromDefaults = !isRecord(currentState.meta);
      const nextState = mergeState(initialState as Record<string, unknown>, currentState);
      applyOpeningDraft(nextState, draft);
      data.stat_data = nextState;
      await mvu.replaceMvuData(data, options);
      const persisted = mvu.getMvuData(options).stat_data ?? {};
      if (!openingCommitted(persisted, draft)) throw new Error('MVU 写入后复读校验失败');
      return { initializedFromDefaults };
    },
    async repairOpening(expectedChatId: string) {
      const frozenChatId = expectedChatId.trim();
      if (!frozenChatId || currentChatId() !== frozenChatId) throw new Error('聊天已切换，请重新打开恢复页');
      const marker = `${OPENING_REPAIR_MARKER}${encodeURIComponent(frozenChatId)}" />`;
      const rawMessages = activeMessages();
      const exists = rawMessages.some((item) =>
        item.role === 'user' && String(item.message ?? '').includes(marker));
      const message = [
        '【开场状态修复】',
        '前一轮正文已经描写我进入庭园，但正式开场变量没有成功写入。',
        '请读取此前带有 gensokyo_opening 标记的真实玩家消息，只补写其中已经确认的玩家姓名、称谓、外貌、庭园名、庭守钥取得状态，以及 meta.initialized=true、meta.opening_committed=true。',
        '先用一句简短叙事承接当前场景，然后严格输出一个可由 MVU 解析的 <UpdateVariable><JSONPatch>…</JSONPatch></UpdateVariable> 块；不要推进时间、事件、关系或资源，不要重复开场剧情。',
        '',
        marker,
      ].join('\n');
      const snapshot = await transactions.submit({
        kind: 'opening',
        transactionId: `opening-repair-${encodeURIComponent(frozenChatId)}`,
        message,
        matchesExisting: (item) =>
          item.role === 'user' && String(item.message ?? '').includes(marker),
      });
      if (!snapshot.assistantResponded) throw new Error(snapshot.lastError || '没有收到完整的开场修复回复');
      transactions.markSettlementSucceeded();
      return { messageCreated: !exists };
    },
    async listMessages() {
      // Use the same raw reader as transactions. include_swipes:true + unhidden previously
      // could leave the GAL projector stuck on floor 0 when later floors normalized empty
      // or when the macro range failed to expand past the greeting.
      return normalizeMessages(readRawMessages({ include_swipes: false, hide_state: 'all' }));
    },
    async sendUserMessage(text, kind = 'interaction', userVisibleText, requestContext) {
      if (transactionOperationInFlight) throw new Error('上一条消息仍在生成或结算中，请稍候');
      transactionOperationInFlight = true;
      const value = text.trim();
      try {
        if (!value || value.length > 6000) throw new Error('消息应为 1–6000 个字符');
        const mvu = await requireMvu();
        let before = latestPersistedState(mvu);
        const action = localSettlementAction(value, before);
        if (action) before = await persistStagedLocalSession(before, action);
        pendingOwnershipBefore = structuredClone(before);
        pendingSettlement = action ? { before: structuredClone(before), action } : null;
        pendingVariableEpoch = variableUpdateEpoch;
        assistantObservedAt = 0;
        // 第二批 V2：在统一位置构造冻结请求（B2-T07 builder）并合并 V2 metadata。
        // 本轮规则在统一 V2 builder 中冻结为单条 system inject；真实楼层不进入历史。
        // R2 道具语义：身份边界/结算以持久 before 为基础；本轮只读 promptState
        // （含正式道具授权）由 sceneItemPreview 通过 queueSceneItemUse 纯函数派生，
        // 生成成功后 app 才执行 queue_scene_item M2 正式持久化与消费。
        const injectState = requestContext?.sceneItemPreview
          ? (() => {
            const preview = requestContext.sceneItemPreview;
            const promptState = queueSceneItemUse(
              before,
              preview.itemId,
              preview.useId,
              preview.sceneId,
              preview.targetCharacterId,
            );
            return promptState;
          })()
          : before;
        const v2 = buildGalGenerationRequestV2({
          playerInput: value,
          state: injectState,
          snapshot: captureRequestSnapshot(requestContext?.sceneId ?? null),
          characterContext: {
            mainTargetCharacterId: requestContext?.mainTargetCharacterId ?? null,
            actionTargetCharacterId: requestContext?.actionTargetCharacterId,
            eventParticipants: requestContext?.eventParticipants,
            sessionParticipants: requestContext?.sessionParticipants,
            requireMainTarget: requestContext?.requireMainTarget ?? false,
          },
          characterNames: characterNamesOf(injectState),
          explicitCharacterIds: requestContext?.explicitCharacterIds,
        });
        // 外援强制裁定 1：V2 构造失败必须在创建玩家楼层前抛出带 reason 的错误；
        // 禁止把 request 置空后继续 transactions.submit()（不建楼层、不触发 generate）。
        if (!v2.ok) {
          throw new Error(`V2 请求构造失败（${v2.reason}）：不创建玩家楼层，可安全重试`);
        }
        const requestMetadata = buildRequestMetadataV2(v2.request);
        pendingRequest = v2.request;
        const snapshot = await transactions.submit({
          kind,
          // v5：把协议、在场快照、场景事实和道具授权真实写入 user 楼层；
          // helper generate 只能逐字复用同一冻结正文，不能在请求期重新拼接。
          message: v2.request.modelUserInput,
          request: v2.request,
          receiptPolicy: action ? 'next-nonempty-assistant' : 'exact-attempt',
          extra: {
            gensokyoUserVisibleText: userVisibleText?.trim() || null,
            ...requestMetadata,
          },
        });
        if (!snapshot.assistantResponded) {
          throw new Error(snapshot.lastError || '没有收到 assistant 回复，可以安全重试');
        }
        assistantObservedAt = Date.now();
        // 固定剧情只要求收到精确、非空的 assistant 回复；其结果由本地白名单结算。
        if (!action) await waitForVariableStage(snapshot.assistantMessageId);
        return await requirePendingSettlement();
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        const snapshot = transactions.read();
        if (snapshot.assistantResponded || snapshot.phase === 'settling') {
          transactions.markSettlementFailed(error);
        }
        throw error;
      } finally {
        transactionOperationInFlight = false;
      }
    },
    async sendAnomalyResolution(text) {
      if (transactionOperationInFlight) throw new Error('上一条消息仍在生成或结算中，请稍候');
      transactionOperationInFlight = true;
      const value = text.trim();
      const operationId = `anomaly-resolution:${Date.now().toString(36)}`;
      try {
        if (!value || value.length > 6000) throw new Error('消息应为 1–6000 个字符');
        const mvu = await requireMvu();
        const before = latestPersistedState(mvu);
        if (before.anomaly_cycle?.active?.status !== 'resolving') {
          throw new Error('当前异变尚未进入最终收束阶段');
        }
        pendingOwnershipBefore = structuredClone(before);
        pendingSettlement = null;
        pendingSystemOperation = { type: 'anomaly_resolution', operationId };
        pendingVariableEpoch = variableUpdateEpoch;
        assistantObservedAt = 0;
        // R3：异变收束也是模型生成入口——构造全新 V2 request + V2 metadata，
        // 与 gensokyoSystemOperation metadata 合并（不互相覆盖）。
        // relevant 角色用结构化 event/session/presence；允许最终为空（无角色合法 V2）。
        const v2 = buildGalGenerationRequestV2({
          playerInput: value,
          state: before,
          snapshot: captureRequestSnapshot(null),
          characterContext: {
            mainTargetCharacterId: null,
            actionTargetCharacterId: null,
            eventParticipants: undefined,
            sessionParticipants: undefined,
            requireMainTarget: false,
          },
          characterNames: characterNamesOf(before),
        });
        if (!v2.ok) {
          throw new Error(`异变收束 V2 请求构造失败（${v2.reason}）：不创建玩家楼层，可安全重试`);
        }
        pendingRequest = v2.request;
        const snapshot = await transactions.submit({
          kind: 'settlement',
          message: v2.request.modelUserInput,
          request: v2.request,
          transactionId: operationId,
          extra: {
            gensokyoSystemOperation: {
              version: 'system-operation.v1',
              operationId,
              type: 'anomaly_resolution',
            },
            ...buildRequestMetadataV2(v2.request),
          },
        });
        if (!snapshot.assistantResponded) {
          throw new Error(snapshot.lastError || '没有收到 assistant 回复，可以安全重试');
        }
        assistantObservedAt = Date.now();
        // 异变状态与奖励由 resolveAnomaly 本地结算；正文到达即可提交。
        return await requirePendingSettlement();
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        const snapshot = transactions.read();
        if (snapshot.assistantResponded || snapshot.phase === 'settling') {
          transactions.markSettlementFailed(error);
        }
        throw error;
      } finally {
        transactionOperationInFlight = false;
      }
    },
    async sendDuelVictoryRequest(requestText: string, message: string) {
      if (transactionOperationInFlight) throw new Error('上一条消息仍在生成或结算中，请稍候');
      transactionOperationInFlight = true;
      const value = message.trim();
      try {
        if (!value || value.length > 6000) throw new Error('消息应为 1–6000 个字符');
        const mvu = await requireMvu();
        const before = latestPersistedState(mvu);
        const pending = before.inventory?.card_runtime?.duel?.pending_victory_dialogue;
        if (!pending) throw new Error('没有待提交的胜利要求');
        const settlementId = pending.settlement_id;
        const operationId = `duel-victory:${settlementId}`;
        const staged = stageDuelVictoryRequest(before, settlementId, requestText);
        const latest = latestPersistedMessage(mvu);
        if (!latest || !mvu.replaceMvuData) throw new Error('当前 MVU 不支持胜利要求锁定');
        latest.data.stat_data = staged;
        await mvu.replaceMvuData(latest.data, latest.options);
        const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
        const rereadPending = reread.inventory?.card_runtime?.duel?.pending_victory_dialogue;
        if (rereadPending?.settlement_id !== settlementId
          || rereadPending.status !== 'generating'
          || rereadPending.request_text !== requestText.trim()) {
          throw new Error('胜利要求锁定复读校验失败');
        }
        pendingOwnershipBefore = structuredClone(reread);
        pendingSettlement = null;
        pendingSystemOperation = { type: 'duel_victory_dialogue', operationId, settlementId };
        pendingVariableEpoch = variableUpdateEpoch;
        assistantObservedAt = 0;
        // R3：决斗胜利是模型生成入口——以锁定后 reread 状态构造全新 V2 request；
        // mainTarget = pending.target_character_id（requireMainTarget:true）。
        const duelTargetId = rereadPending.target_character_id;
        const v2 = buildGalGenerationRequestV2({
          playerInput: value,
          state: reread,
          snapshot: captureRequestSnapshot(null),
          characterContext: {
            mainTargetCharacterId: duelTargetId ?? null,
            actionTargetCharacterId: duelTargetId ?? null,
            eventParticipants: undefined,
            sessionParticipants: undefined,
            requireMainTarget: true,
          },
          characterNames: characterNamesOf(reread),
          explicitCharacterIds: duelTargetId ? [duelTargetId] : [],
        });
        if (!v2.ok) {
          throw new Error(`决斗胜利 V2 请求构造失败（${v2.reason}）：不创建玩家楼层，可安全重试`);
        }
        pendingRequest = v2.request;
        const snapshot = await transactions.submit({
          kind: 'battle',
          message: v2.request.modelUserInput,
          request: v2.request,
          transactionId: operationId,
          extra: {
            gensokyoSystemOperation: {
              version: 'system-operation.v1',
              operationId,
              type: 'duel_victory_dialogue',
              settlementId,
            },
            ...buildRequestMetadataV2(v2.request),
          },
        });
        if (!snapshot.assistantResponded) {
          throw new Error(snapshot.lastError || '没有收到 assistant 回复，可以安全重试');
        }
        assistantObservedAt = Date.now();
        // 胜负与奖励已由本地战斗结果锁定；正文到达即可提交。
        return await requirePendingSettlement();
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        const snapshot = transactions.read();
        if (snapshot.assistantResponded || snapshot.phase === 'settling') {
          transactions.markSettlementFailed(error);
        }
        throw error;
      } finally {
        transactionOperationInFlight = false;
      }
    },
    async getTransactionState() {
      const current = readTransaction();
      if (regenerationPhase !== 'idle') {
        return {
          ...current,
          phase: regenerationPhase,
          lastError: undefined,
        };
      }
      if (hostGenerationActive && !['submitting_user', 'generating', 'settling'].includes(current.phase)) {
        return { ...current, phase: 'generating', lastError: undefined };
      }
      return current;
    },
    async retryLastTransaction() {
      if (transactionOperationInFlight) throw new Error('上一条消息仍在生成或结算中，请稍候');
      transactionOperationInFlight = true;
      try {
        const current = transactions.read();
        // Phase 2 增量 D：assistant 落楼失败后的显式重试——只落已生成文本，不再调模型（计划 §2.6）。
        if (pendingHelperResult && !current.assistantResponded) {
          const attempt = buildAttemptFromSnapshot(current);
          if (!attempt) throw new Error('缺少 attempt 标识，无法落回已生成结果');
          await writeHelperAssistantMessage(attempt, pendingHelperResult);
          pendingHelperResult = null;
          assistantObservedAt = Date.now();
          const after = transactions.read();
          if (!pendingSettlement && !pendingSystemOperation) {
            await waitForVariableStage(after.assistantMessageId);
          }
          return await requirePendingSettlement();
        }
        if ((pendingSettlement || pendingOwnershipBefore) && current.assistantResponded) {
          assistantObservedAt ||= Date.now();
          if (!pendingSettlement && !pendingSystemOperation) {
            await waitForVariableStage(current.assistantMessageId);
          }
          return await requirePendingSettlement();
        }
        // Phase 3：V2 停止后的默认恢复 = 从头重试（新 attempt，计划 §3.2），
        // 按 request schema 分流（外援裁定 8：禁止用全局 generationTransport 推断 V2）；
        // V1 native-trigger 保持“继续(/continue)”语义。
        // F02：V2 必须持有完整冻结 request 才允许 retryFromScratch；缺失时 fail closed，
        // 绝不用非空断言把 null 传入（禁止重建或降级）。
        const isV2Retry = pendingRequest?.schema === REQUEST_SCHEMA_V2
          || current.requestSchema === REQUEST_SCHEMA_V2;
        if (isV2Retry && pendingRequest?.schema !== REQUEST_SCHEMA_V2) {
          throw new Error('冻结的 V2 请求缺失，禁止重建或降级；请先 reload 恢复或手动处理');
        }
        const snapshot = isV2Retry
          ? await transactions.retryFromScratch(pendingRequest!)
          : await transactions.retry();
        if (!snapshot.assistantResponded) {
          throw new Error(snapshot.lastError || '重试后仍没有收到 assistant 回复');
        }
        assistantObservedAt = Date.now();
        if (!pendingSettlement && !pendingOwnershipBefore) {
          transactions.markSettlementSucceeded();
          const settled = transactions.read();
          await persistCommitSettled(settled);
          return settled;
        }
        if (!pendingSettlement && !pendingSystemOperation) {
          await waitForVariableStage(snapshot.assistantMessageId);
        }
        return await requirePendingSettlement();
      } finally {
        transactionOperationInFlight = false;
      }
    },
    async stageBattleResult(result: BattleResult) {
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持可信战斗结果写入');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有找到可承载战斗结果的 assistant 楼层');
      const current = latest.state.battle?.current;
      if (current) {
        if (current.settlement_id !== result.settlement_id) {
          throw new Error('已有另一份待结算战斗结果，不能覆盖');
        }
        if (JSON.stringify(current) !== JSON.stringify(result)) {
          throw new Error('同一战斗结算 ID 的内容不一致');
        }
        return { messageId: latest.messageId, alreadyStaged: true };
      }
      const trusted = validateFlowerCoreBattleResult(result, latest.state);
      const nextState = structuredClone(latest.state);
      nextState.battle = { ...nextState.battle, current: trusted };
      latest.data.stat_data = nextState;
      await mvu.replaceMvuData(latest.data, latest.options);
      const reread = mvu.getMvuData(latest.options).stat_data?.battle?.current;
      if (!reread || JSON.stringify(reread) !== JSON.stringify(trusted)) {
        throw new Error('可信战斗结果写入后复读校验失败');
      }
      return { messageId: latest.messageId, alreadyStaged: false };
    },
    async settleDungeonResult(result: BattleResult) {
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持本地副本结算');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有找到可承载副本结算的 assistant 楼层');
      const before = migrateGardenState(latest.state);
      if (before.battle?.rewarded_ids?.includes(result.settlement_id)) {
        return { rewardCoins: dungeonReward(result.outcome as 'clean_win' | 'narrow_win' | 'loss', before.inventory?.card_runtime?.duel?.zako_tag_count ?? 0), alreadySettled: true };
      }
      const next = reconcileM2Runtime(
        before,
        settleLocalDungeonResult(before, result),
        currentChatId(),
      );
      latest.data.stat_data = next;
      await mvu.replaceMvuData(latest.data, latest.options);
      const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
      if (!reread.battle?.rewarded_ids?.includes(result.settlement_id)) {
        throw new Error('副本结算复读校验失败');
      }
      return { rewardCoins: dungeonReward(result.outcome as 'clean_win' | 'narrow_win' | 'loss', before.inventory?.card_runtime?.duel?.zako_tag_count ?? 0), alreadySettled: false };
    },
    async applyTestJump(jump: TestJumpId) {
      // SillyTavern may restore this iframe after the assistant floor and its MVU
      // state were already persisted, while the volatile coordinator still says
      // "settling". Reconcile that durable completion before applying the lock.
      let transaction = readTransaction();
      if (transactionOperationInFlight || hostGenerationActive || regenerationPhase !== 'idle'
        || ['submitting_user', 'generating'].includes(transaction.phase)) {
        throw new Error('当前回复仍在生成或同步状态，请完成本轮后再使用测试快进');
      }
      if (transaction.phase === 'settling') {
        await settlePendingAfterReply(true);
        transaction = readTransaction();
      }
      if (transaction.phase === 'settling') {
        throw new Error('当前回复仍在生成或同步状态，请完成本轮后再使用测试快进');
      }
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持测试快进');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有可承载测试快进的 assistant 楼层');
      const next = applyTestJump(migrateGardenState(latest.state), jump);
      latest.data.stat_data = next;
      await mvu.replaceMvuData(latest.data, latest.options);
      const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
      if (!testJumpReached(reread, jump)) throw new Error('测试快进复读校验失败');
    },
    async purchaseShopItem(itemId: string, purchaseId: string) {
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持小店购买');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有可承载小店购买的 assistant 楼层');
      const next = purchaseShopItem(migrateGardenState(latest.state), itemId, purchaseId);
      latest.data.stat_data = next;
      await mvu.replaceMvuData(latest.data, latest.options);
      const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
      if (!reread.shop?.purchase_settled_ids?.includes(purchaseId)) throw new Error('小店购买复读校验失败');
    },
    async claimStarterGift() {
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持新人礼包');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有可承载新人礼包的 assistant 楼层');
      const next = claimStarterGift(migrateGardenState(latest.state));
      latest.data.stat_data = next;
      await mvu.replaceMvuData(latest.data, latest.options);
      const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
      if (reread.interaction?.starter_gift_claimed !== true) throw new Error('新人礼包领取复读校验失败');
    },
    async useOpportunityCard(useId: string) {
      return runCardOperation(async () => {
        const mvu = await requireMvu();
        if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持机遇卡本地结算');
        const latest = latestPersistedMessage(mvu);
        if (!latest) throw new Error('没有可承载机遇卡结算的 assistant 楼层');
        const result = applyOpportunityCardUse(migrateGardenState(latest.state), useId, currentChatId());
        latest.data.stat_data = result.state;
        await mvu.replaceMvuData(latest.data, latest.options);
        const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
        const recorded = reread.inventory?.card_runtime?.opportunity?.last_result;
        if (!reread.inventory?.card_runtime?.settled_use_ids?.includes(useId)
          || recorded?.use_id !== useId
          || recorded.selected_character_id !== result.selectedCharacterId
          || !reread.presence_snapshot?.present_character_ids?.includes(result.selectedCharacterId)) {
          throw new Error('机遇卡结算复读校验失败');
        }
        return {
          selectedCharacterId: result.selectedCharacterId,
          message: result.message,
          alreadySettled: result.alreadySettled,
        };
      });
    },
    async beginDuelCard(targetCharacterId: string, useId: string) {
      return runCardOperation(async () => {
        const mvu = await requireMvu();
        if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持角色对战预留');
        const latest = latestPersistedMessage(mvu);
        if (!latest) throw new Error('没有可承载角色对战预留的 assistant 楼层');
        const result = beginLocalDuelCard(migrateGardenState(latest.state), targetCharacterId, useId);
        latest.data.stat_data = result.state;
        await mvu.replaceMvuData(latest.data, latest.options);
        const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
        const pending = reread.inventory?.card_runtime?.duel?.pending_battle;
        if (pending?.use_id !== useId
          || pending.target_character_id !== targetCharacterId
          || pending.config_id !== result.configId
          || pending.difficulty_tier !== result.difficultyTier) {
          throw new Error('角色对战预留复读校验失败');
        }
        return {
          targetCharacterId,
          configId: result.configId,
          difficultyTier: result.difficultyTier,
          alreadyStarted: result.alreadyStarted,
          config: getLockedDuelBattleConfig(targetCharacterId, result.difficultyTier, result.configId),
        };
      });
    },
    async cancelDuelCard(useId: string) {
      return runCardOperation(async () => {
        const mvu = await requireMvu();
        if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持取消角色对战');
        const latest = latestPersistedMessage(mvu);
        if (!latest) throw new Error('没有可承载角色对战取消的 assistant 楼层');
        latest.data.stat_data = cancelLocalDuelCard(migrateGardenState(latest.state), useId);
        await mvu.replaceMvuData(latest.data, latest.options);
        const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
        if (reread.inventory?.card_runtime?.duel?.pending_battle?.use_id === useId) {
          throw new Error('角色对战取消复读校验失败');
        }
      });
    },
    async settleDuelCard(result: BattleResult) {
      return runCardOperation(async () => {
        const mvu = await requireMvu();
        if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持角色对战本地结算');
        const latest = latestPersistedMessage(mvu);
        if (!latest) throw new Error('没有可承载角色对战结算的 assistant 楼层');
        const settled = settleLocalDuelCard(migrateGardenState(latest.state), result);
        latest.data.stat_data = settled.state;
        await mvu.replaceMvuData(latest.data, latest.options);
        const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
        if (!reread.inventory?.card_runtime?.duel?.settled_result_ids?.includes(result.settlement_id)
          || reread.inventory.card_runtime.duel.pending_battle) {
          throw new Error('角色对战结算复读校验失败');
        }
        return {
          won: settled.won,
          zakoTagCount: settled.zakoTagCount,
          previousZakoTagCount: settled.previousZakoTagCount,
          zakoTagDelta: settled.zakoTagDelta,
          message: settled.message,
          alreadySettled: settled.alreadySettled,
        };
      });
    },
    async useSpecialItem(itemId: string, useId: string, form?: Partial<AnomalyActivationForm>) {
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持本地道具使用');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有可承载道具使用的 assistant 楼层');
      const result = applySpecialItemUse(migrateGardenState(latest.state), itemId, useId, form);
      latest.data.stat_data = result.state;
      await mvu.replaceMvuData(latest.data, latest.options);
      const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
      if (itemId === 'incident_trigger_card') {
        if (reread.anomaly_cycle?.pending_activation?.transaction_id !== useId
          && reread.anomaly_cycle?.active?.anomaly_id !== useId
          && !reread.events?.settled_ids?.includes(useId)) {
          throw new Error('道具使用复读校验失败');
        }
      } else if (!reread.events?.settled_ids?.includes(useId)) {
        throw new Error('道具使用复读校验失败');
      }
      return result.message;
    },
    async finalizeAnomalyActivation(origin: AnomalyHiddenOrigin, publicSummary = '') {
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持异变提交');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有可承载异变提交的 assistant 楼层');
      const result = finalizeAnomalyCardUse(migrateGardenState(latest.state), origin, publicSummary);
      latest.data.stat_data = result.state;
      await mvu.replaceMvuData(latest.data, latest.options);
      const reread = migrateGardenState(mvu.getMvuData(latest.options).stat_data ?? {});
      if (!reread.anomaly_cycle?.active) throw new Error('异变启用复读校验失败');
      return result.message;
    },
    async cancelAnomalyActivation(transactionId?: string) {
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持异变取消');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有可承载异变取消的 assistant 楼层');
      const result = abortAnomalyCardUse(migrateGardenState(latest.state), transactionId);
      latest.data.stat_data = result.state;
      await mvu.replaceMvuData(latest.data, latest.options);
      return result.message;
    },
    async recordAnomalyClue(summary: string) {
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持异变调查写入');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有可承载异变调查的 assistant 楼层');
      latest.data.stat_data = appendDailyClue(migrateGardenState(latest.state), summary);
      await mvu.replaceMvuData(latest.data, latest.options);
    },
    async resolveActiveAnomaly(resolutionMessageId: number | null = null) {
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持异变收束写入');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有可承载异变收束的 assistant 楼层');
      latest.data.stat_data = resolveAnomaly(migrateGardenState(latest.state), resolutionMessageId);
      await mvu.replaceMvuData(latest.data, latest.options);
    },
    async applyM2Command(command) {
      if (command.type === 'end_conversation_local') {
        const transaction = transactions.read();
        if (transactionOperationInFlight || hostGenerationActive || regenerationPhase !== 'idle'
          || ['submitting_user', 'generating', 'settling'].includes(transaction.phase)) {
          throw new Error('当前回复仍在生成或同步状态，不能提前结束聊天');
        }
      }
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持 M2 本地事务');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有可承载 M2 本地事务的 assistant 楼层');
      const applied = applyLocalM2Command(migrateGardenState(latest.state), command, currentChatId());
      latest.data.stat_data = applied.state;
      await mvu.replaceMvuData(latest.data, latest.options);
      if (command.type === 'end_conversation_local') {
        pendingSettlement = null;
        pendingOwnershipBefore = null;
        pendingSystemOperation = null;
        pendingVariableEpoch = variableUpdateEpoch;
        assistantObservedAt = 0;
        // F02：local end 是显式终局，必须同时清内存冻结请求。
        pendingRequest = null;
        transactions.resetAfterLocalEnd();
        lastError = '';
      }
      return applied.result;
    },
    async continueGeneration() {
      await g.triggerSlash?.('/continue await=true');
    },
    async stopGeneration() {
      if (regenerationCoordinator && regenerationPhase === 'generating') {
        return regenerationCoordinator.stop();
      }
      // Phase 3：按 ID 停止（计划 §3.1）。helper-generate 的生成以 should_silence:true
      // 运行（不绑 ST 停止按钮），宿主 stopGeneration 不会影响它——必须按 generationId abort。
      const current = transactions.read();
      if (generationTransport === 'helper-generate' && current.generationId) {
        // 实机事实（1.18 + Helper 4.8.18）：stopGenerationById 只暴露在宿主 TavernHelper，
        // 游戏 iframe 注入面不含——双源获取（按 ID 停止语义不变，计划 §3.1）。
        const stopById = g.stopGenerationById
          ?? (hostWindow().TavernHelper as { stopGenerationById?: (id: string) => boolean } | undefined)?.stopGenerationById;
        let stopped = Boolean(stopById?.(current.generationId));
        // 竞态：submit 在 triggerGeneration 前就把 phase 置为 generating，此时 generate() 可能
        // 尚未注册到 Helper 的生成表（CG.set 在 IG 开头异步发生）。stop 返回 false 且事务仍在
        // generating → 短重试关闭注册窗口（最多 600ms），避免「点了停止却没停」。
        if (!stopped && (current.phase === 'generating')) {
          for (let attempt = 0; attempt < 6 && !stopped; attempt += 1) {
            await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
            stopped = Boolean(stopById?.(current.generationId));
          }
        }
        if (stopped) {
          // true = 已请求 abort（Helper 将 reject generate() Promise 并发 GENERATION_STOPPED(id)）。
          transactions.markStopped('user-stop');
          return true;
        }
        // false = 无此生成（已结束/从未注册/控制器已清理）：不得直接标记 stopped。
        // 若事务已离开 generating（结束路径），对账为可重试 failed；仍在 generating 则不误标。
        if (current.phase !== 'generating' && current.phase !== 'stopping') {
          transactions.markStopReconciled();
          return true;
        }
        return false;
      }
      const stopped = Boolean(g.SillyTavern?.stopGeneration?.());
      if (stopped) {
        transactions.markStopped('user-stop');
        // native 无按 ID 的 abort 对账流程（触发即已中断）：即时收敛到可重试 failed。
        transactions.markStopReconciled();
      }
      return stopped;
    },
    async regenerateLatest() {
      if (transactionOperationInFlight || regenerationPhase !== 'idle') {
        throw new Error('上一条消息仍在生成或结算中，请稍候');
      }
      transactionOperationInFlight = true;
      regenerationPhase = 'generating';
      try {
        if (regenerationTransport === 'helper-generate-swipe') {
          regenerationCoordinator = new GalRegenerationCoordinatorV1(createRegenerationPorts());
          const result = await regenerationCoordinator.run();
          if (!result.ok) {
            throw new Error(`重生成事务失败（${result.code}）${result.detail ? `：${result.detail}` : ''}`);
          }
          return;
        }
        const mvu = await requireMvu();
        if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持安全重新生成');
        const messages = activeMessages();
        const target = resolveLatestAssistantForRegeneration(messages);
        if (!target.ok) {
          throw new Error('只有聊天最后一层是 assistant 时才能重新生成；当前存在更晚的玩家或系统楼层');
        }
        const targetMessageId = target.messageId;
        const latestAssistant = messages.at(-1)!;
        // Phase 5 §5.2：定位原请求（native-regenerate 路径只记录与保护，不改变 /regenerate 行为）。
        // 解析目标 assistant 的 attempt metadata → 配对玩家楼层 requestId → chat identity 校验。
        const attemptMeta = parseAttemptMetadata(latestAssistant?.extra);
        if (attemptMeta.ok) {
          const originalRequestId = String(attemptMeta.value.requestId ?? '');
          const playerMatch = resolvePlayerMessageByMetadata(messages, originalRequestId);
          const chatIdentityOk = currentChatId().trim() === String(attemptMeta.value.chatId ?? '')
            && String(g.SillyTavern?.getContext?.().characterId ?? '') === String(attemptMeta.value.ownerCharacterId ?? '');
          if (!playerMatch.ok || !chatIdentityOk) {
            throw new Error('重新生成目标的 request/chat identity 无法确认，已拒绝修改历史楼层');
          }
          console.debug('[gal:regenerate]', {
            targetMessageId,
            requestId: originalRequestId,
            attemptId: String(attemptMeta.value.attemptId ?? ''),
            playerFloor: playerMatch.ok ? playerMatch.messageId : null,
            chatIdentityOk,
          });
        } else {
          // legacy 兼容：无 attempt metadata 的旧楼层（Probe A/B 期间或外部生成）——仍允许重新生成，仅记录。
          console.debug('[gal:regenerate] legacy assistant 无 attempt metadata', { targetMessageId });
        }
        const protectedBefore = latestPersistedState(mvu);
        const baselineEpoch = variableUpdateEpoch;
        const startedEpoch = hostGenerationStartedEpoch;
        hostGenerationActive = true;
        await g.triggerSlash?.('/regenerate await=true');
        if (hostGenerationStartedEpoch === startedEpoch) hostGenerationActive = false;
        regenerationPhase = 'settling';
        const waitStartedAt = Date.now();
        while (mvu.isDuringExtraAnalysis?.()
          || (variableUpdateEpoch <= baselineEpoch && Date.now() - waitStartedAt < 2500)) {
          if (Date.now() - waitStartedAt >= 90000) {
            throw new Error('重新生成后的变量同步超过 90 秒');
          }
          await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 100));
        }
        const options = { type: 'message', message_id: targetMessageId };
        const data = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
        const current = isRecord(data.stat_data) ? data.stat_data as GardenState : {};
        const raw = activeMessages().find((message) => Number(message.message_id) === targetMessageId);
        const assistantText = String(raw?.message ?? raw?.mes ?? '');
        data.stat_data = reconcileM2Runtime(
          protectedBefore,
          applyPresenceUpdate(restoreLocalEventOwnership(protectedBefore, current), assistantText),
          currentChatId(),
        );
        await mvu.replaceMvuData(data, options);
      } finally {
        regenerationCoordinator = null;
        hostGenerationActive = false;
        regenerationPhase = 'idle';
        transactionOperationInFlight = false;
      }
    },
    async swipeLatest(direction = 'right') {
      await g.triggerSlash?.(`/swipe await=true direction=${direction === 'left' ? 'left' : 'right'}`);
    },
    async showNativeChat() {
      globalThis.dispatchEvent(new CustomEvent('gensokyo-garden:show-native-chat'));
      return true;
    },
    async diagnostics() { return collectRuntimeDiagnostics(); },
    async buildDiagnosticSnapshot() {
      let state: GardenState | null = null;
      try {
        if (g.Mvu?.getMvuData) state = latestPersistedState(g.Mvu);
      } catch { /* 缺失或损坏状态只导出零值，不改变游戏错误态。 */ }
      return buildDiagnosticSnapshot({
        state,
        transaction: transactions.read(),
        pendingRequest,
        diagnostics: await collectRuntimeDiagnostics(),
        memoryPort: { profile: memoryPort.profile, capability: memoryPort.capability },
        appVersion: String(initialState.meta.schema_version ?? 'unknown'),
      });
    },
    async listSaveSlots() {
      return listStoredSaveSlots(saveWorldbookAdapter());
    },
    async saveToSlot(slotId: SaveSlotId, label: string) {
      return runSaveOperation(async () => {
        const mvu = await requireMvu();
        const payload = captureSavePayload({
          currentChatId,
          listMessages: () => readRawMessages({ include_swipes: false, hide_state: 'all' }),
          readMvuData: () => snapshotMvu(mvu),
          now: () => new Date().toISOString(),
          appSchemaVersion: (data) => String((data.stat_data as GardenState | undefined)?.meta?.schema_version ?? initialState.meta.schema_version ?? 'unknown'),
        }, slotId, label);
        await writeSaveSlot(saveWorldbookAdapter(), payload);
        const summary = (await listStoredSaveSlots(saveWorldbookAdapter())).find((item) => item.slotId === slotId);
        if (!summary?.occupied || !summary.valid) throw new Error('存档写后槽位不可读');
        return summary;
      });
    },
    async loadFromSlot(slotId: SaveSlotId) {
      return runSaveOperation(async () => {
        const target = await readSaveSlot(saveWorldbookAdapter(), slotId);
        if (!currentChatId() || !String(g.SillyTavern?.getContext?.().characterId ?? '')) throw new Error('当前角色卡／聊天身份不可用');
        const mvu = await requireMvu();
        const result = await restoreSavePayload({
          currentChatId,
          listMessages: () => readRawMessages({ include_swipes: false, hide_state: 'all' }),
          readMvuData: () => snapshotMvu(mvu),
          readMessageMvu: (messageId) => structuredClone(mvu.getMvuData({ type: 'message', message_id: messageId })) as Record<string, unknown>,
          deleteMessages: (ids) => g.deleteChatMessages!(ids, { refresh: 'none' }),
          createMessages: (messages) => g.createChatMessages!(
            messages.map((message) => ({ ...message })),
            { insert_before: 'end', refresh: 'none' },
          ),
          replaceChatMvu: (data) => mvu.replaceMvuData(structuredClone(data), { type: 'chat' }),
          replaceMessageMvu: (data, messageId) => mvu.replaceMvuData(
            structuredClone(data),
            { type: 'message', message_id: messageId },
          ),
          clearTransientState: () => {
            pendingRequest = null;
            pendingHelperResult = null;
            pendingStreamText = '';
            pendingSettlement = null;
            pendingOwnershipBefore = null;
            pendingSystemOperation = null;
            regenerationCoordinator = null;
            regenerationPhase = 'idle';
            hostWindow().sessionStorage?.removeItem(regenerationStorageKey());
            transactions.resetForChatChange();
          },
          reloadCurrentChat: () => (g.reloadCurrentChat ?? g.SillyTavern!.reloadCurrentChat!)(),
        }, target);
        return { restoredMessageCount: result.restoredMessageCount };
      });
    },
    async subscribe(refresh) {
      const stops: Array<() => void> = [];
      const subscribe = (eventName?: string, listener: (...args: unknown[]) => void = () => refresh()) => {
        if (eventName && g.eventOn) stops.push(g.eventOn(eventName, listener).stop);
      };
      subscribe(g.tavern_events?.MESSAGE_RECEIVED, (messageId) => {
        transactions.markAssistantMessageReceived(messageId);
        refresh();
      });
      subscribe(g.tavern_events?.MESSAGE_UPDATED);
      subscribe(g.tavern_events?.STREAM_TOKEN_RECEIVED, () => {
        // Luker emits this before its fake-stream body is durably visible. It is a
        // refresh hint only; MessageTransactionCoordinator still reads the floor.
        transactions.markStreamTokenReceived();
        refresh();
      });
      subscribe(g.tavern_events?.MESSAGE_SWIPED);
      subscribe(g.tavern_events?.GENERATION_AFTER_COMMANDS, async (_type, _options, dryRun) => {
        if (dryRun === true || !g.injectPrompts) return;
        const transaction = transactions.read();
        if (transaction.phase === 'generating' && pendingRequest?.schema === REQUEST_SCHEMA_V2) return;
        try {
          const mvu = await requireMvu();
          const [route] = buildGalCurrentTurnInjections({ state: latestPersistedState(mvu) });
          g.injectPrompts([{ id: 'gensokyo-native-route-scan', ...route }], { once: true });
        } catch (error) {
          console.warn('[gal:prompt] 原生世界书路由注入失败：', error instanceof Error ? error.message : String(error));
        }
      });
      subscribe(g.tavern_events?.CHAT_CHANGED, () => {
        const token = ++chatRestoreToken;
        const expectedChatId = currentChatId();
        // 先让旧事务按 chatId 冻结；待其 Promise/finally 退出后再清空内存态，
        // 避免重置成 idle 导致旧 submit 继续等待一个不可能出现的 assistant。
        transactions.read();
        const restoreWhenIdle = () => {
          if (token !== chatRestoreToken || currentChatId() !== expectedChatId) return;
          if (transactionOperationInFlight || hostGenerationActive || regenerationPhase !== 'idle') {
            globalThis.setTimeout(restoreWhenIdle, 100);
            return;
          }
          pendingRequest = null;
          pendingHelperResult = null;
          pendingStreamText = '';
          pendingSettlement = null;
          pendingOwnershipBefore = null;
          pendingSystemOperation = null;
          pendingVariableEpoch = variableUpdateEpoch;
          assistantObservedAt = 0;
          transactions.resetForChatChange();
          restoreFromChat();
          refresh();
        };
        restoreWhenIdle();
      });
      if (g.tavern_events?.GENERATION_STARTED && g.eventOn) {
        stops.push(g.eventOn(g.tavern_events.GENERATION_STARTED, (_type, _options, dryRun) => {
          // Luker prompt previews emit STARTED with dryRun=true but do not emit ENDED.
          // Tracking them would leave every local-only action permanently locked.
          if (!shouldTrackHostGenerationStart(dryRun)) return;
          hostGenerationActive = true;
          hostGenerationStartedEpoch += 1;
          refresh();
        }).stop);
      }
      if (g.tavern_events?.GENERATION_STOPPED && g.eventOn) {
        stops.push(g.eventOn(g.tavern_events.GENERATION_STOPPED, () => {
          hostGenerationActive = false;
          // Only the GAL stop control calls markStopped directly. Luker takeover
          // integrations can emit a generic STOPPED while their assistant floor is
          // still being finalized; treating that as a failed transaction produces a
          // false “no reply” screen over a live native generation.
          refresh();
        }).stop);
      }
      if (g.tavern_events?.GENERATION_ENDED && g.eventOn) {
        stops.push(g.eventOn(g.tavern_events.GENERATION_ENDED, () => {
          hostGenerationActive = false;
          transactions.markGenerationEnded();
          refresh();
        }).stop);
      }
      // Luker plugin takeover may unblock its native controls before the final
      // assistant text reaches getChatMessages. Observe the actual send/stop state
      // so an empty placeholder remains a loading floor rather than a false reply.
      try {
        const doc = hostWindow().document;
        const body = doc?.body;
        const stop = doc?.getElementById('mes_stop');
        if (body && typeof MutationObserver !== 'undefined') {
          const observer = new MutationObserver(() => {
            const nativeGenerating = nativeSendStopButtonGenerating();
            if (nativeGenerating == null || nativeGenerating === hostGenerationActive) return;
            hostGenerationActive = nativeGenerating;
            refresh();
          });
          observer.observe(body, { attributes: true, attributeFilter: ['data-generating'] });
          if (stop) observer.observe(stop, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
          stops.push(() => observer.disconnect());
        }
      } catch { /* parent document is optional in isolated preview frames */ }
      try {
        const mvu = await requireMvu();
        subscribe(mvu.events.VARIABLE_INITIALIZED);
        if (mvu.events.VARIABLE_UPDATE_ENDED && g.eventOn) {
          stops.push(g.eventOn(mvu.events.VARIABLE_UPDATE_ENDED, () => {
            // Helper 事件不带楼层参数：无法区分目标/其他楼层，按 epoch 聚合（Probe B 实测）。
            if (pendingSettlement || pendingOwnershipBefore || pendingSystemOperation) {
              console.debug('[gal:mvu] VARIABLE_UPDATE_ENDED（无楼层参数，按 epoch 聚合；目标楼层复核在 waitForVariableStage）');
            }
            variableUpdateEpoch += 1;
            void settlePendingAfterReply().finally(refresh);
          }).stop);
        }
      } catch { /* diagnostic mode stays usable */ }
      return () => stops.splice(0).forEach((stop) => stop());
    },
  };
}

const previewState: GardenState = {
  meta: { initialized: false, opening_committed: false, schema_version: '0.2.0' },
  environment: { day: 1, time_period: '清晨', season: '春', weather: '晴' },
  player: { name: '', pronouns: '中性称谓', appearance: '', current_area_id: 'central_courtyard' },
  garden: { name: '无名庭园', construction_stage: '荒废' },
  resources: { materials: 6, inspiration: 1 },
  areas: {
    main_house: { id: 'main_house', name: '旧主屋', unlocked: true, state: '损坏' },
    central_courtyard: { id: 'central_courtyard', name: '中央庭院', unlocked: true, state: '荒废' },
    greenhouse_plot: { id: 'greenhouse_plot', name: '温室旧地基', unlocked: true, state: '未清理', main_facility_id: 'magic_greenhouse' },
  },
  facilities: { magic_greenhouse: { id: 'magic_greenhouse', name: '魔法温室', area_id: 'greenhouse_plot', state: '可建设' } },
  characters: { reimu: { id: 'reimu', name: '博丽灵梦' }, marisa: { id: 'marisa', name: '雾雨魔理沙' }, cirno: { id: 'cirno', name: '琪露诺' } },
  presence_snapshot: {
    present_character_ids: ['reimu', 'marisa'],
    character_views: {
      reimu: { area_id: 'central_courtyard', action: '检查结界', facing: 'front' },
      marisa: { area_id: 'greenhouse_plot', action: '观察旧地基', facing: 'left' },
    },
  },
  interaction: { current_session: null, settled_ids: [] },
  events: { completed_key_events: {} },
};

export function createPreviewBridge(): GardenBridge {
  const messages: ChatMessageView[] = [
    { id: 0, role: 'assistant', name: '幻想乡物语', text: '庭园页面离线预览。正式运行时，这里镜像真实聊天消息。' },
  ];
  let transaction: MessageTransactionSnapshot = {
    transactionId: '',
    chatId: 'offline-preview-chat',
    kind: 'interaction',
    phase: 'idle',
    userMessageCreated: false,
    assistantResponded: false,
  };
  let previewOpeningDraft: OpeningDraft | undefined;
  let previewOpeningStory = '';
  const previewRuntimeDiagnostics = (): RuntimeDiagnostics => ({
    mode: 'preview',
    tavernVersion: 'offline',
    helperVersion: 'offline',
    mvuReady: false,
    bridgeVersion: '0.4.3-host-generate-r23',
    generationTransport: 'native-trigger',
    regenerationTransport: 'native-regenerate',
    databaseAvailable: false,
    databaseVersion: '未加载',
  });
  return {
    async readState() { return structuredClone(previewState); },
    async getOpeningContext() { return { chatId: 'offline-preview-chat', personaName: '预览玩家', personaDescription: '来自外界的年轻旅人。' }; },
    async applyUserNameToHost() { return { injected: false, method: 'preview' }; },
    async getOpeningProgress() {
      return {
        messageSubmitted: Boolean(previewOpeningDraft),
        assistantResponded: Boolean(previewOpeningStory),
        storyText: previewOpeningStory || undefined,
      };
    },
    async initializeOpening(draft) {
      const alreadyCommitted = Boolean(previewState.meta?.opening_committed);
      previewState.player = { ...previewState.player, name: draft.playerName, pronouns: draft.playerPronouns, appearance: draft.playerAppearance };
      previewState.garden = { ...previewState.garden, name: draft.gardenName };
      previewState.meta = { ...previewState.meta, initialized: true, opening_committed: true };
      return { messageId: 0, initializedFromDefaults: false, alreadyCommitted };
    },
    async commitOpening(draft, message) {
      messages.push({ id: messages.length, role: 'user', name: draft.playerName, text: message });
      previewOpeningDraft = structuredClone(draft);
      previewOpeningStory = `木匣是在祖父失踪后的第七天送到你手里的。\n\n遗信没有解释他去了哪里，只说那座庭园从来不是一块普通土地。它依靠“庭守钥”锚定在结界之间，会随着主人的选择迁徙，也会把每一次承诺记进荒废的砖石与草木。祖父没有把它直接留给你——因为庭园能提供容身之所，也要求继承者亲自修复结界、照料来客，并承担错误选择留下的痕迹。\n\n信纸燃起一圈柔和的金光。沉睡的钥匙悬到你面前，钥齿间映出一座荒废庭园的轮廓。只要你伸手接过它，结界便会承认新的庭守，将你送往那座会移动的庭园。\n\n钥匙静静等待着。最后一步，仍由你决定。`;
      messages.push({ id: messages.length, role: 'assistant', name: '幻想乡物语', text: previewOpeningStory });
      return { messageCreated: true, generationTriggered: true };
    },
    async enterGarden() {
      if (!previewOpeningDraft || !previewOpeningStory) throw new Error('继承序章尚未完成');
      previewState.player = {
        ...previewState.player,
        name: previewOpeningDraft.playerName,
        pronouns: previewOpeningDraft.playerPronouns,
        appearance: previewOpeningDraft.playerAppearance,
      };
      previewState.garden = { ...previewState.garden, name: previewOpeningDraft.gardenName };
      previewState.key_items = {
        ...previewState.key_items,
        garden_keeper_key: {
          id: 'garden_keeper_key',
          name: '庭守钥',
          obtained: true,
          state: '苏醒',
        },
      };
      previewState.meta = { ...previewState.meta, initialized: true, opening_committed: true };
      return { initializedFromDefaults: false };
    },
    async repairOpening() { throw new Error('离线预览不支持修复真实开场'); },
    async listMessages() { return structuredClone(messages); },
    async sendUserMessage(text, kind = 'interaction', userVisibleText) {
      const previewAction = localSettlementAction(text, previewState);
      const previewTargetMatch = text.match(/<GensokyoAction>\s*(\{[\s\S]*?\})\s*<\/GensokyoAction>/iu);
      let previewSpeakerId = 'reimu';
      if (previewTargetMatch) {
        try {
          const marker = JSON.parse(previewTargetMatch[1]) as { target_type?: string; target_id?: string };
          if (marker.target_type === 'character' && marker.target_id) previewSpeakerId = marker.target_id;
        } catch { /* malformed preview markers fall back to Reimu */ }
      }
      transaction = {
        transactionId: `preview-${Date.now()}`,
        chatId: 'offline-preview-chat',
        kind,
        phase: 'settled',
        userMessageCreated: true,
        assistantResponded: true,
        userMessageId: messages.length,
        assistantMessageId: messages.length + 1,
      };
      messages.push({
        id: messages.length,
        role: 'user',
        name: '预览玩家',
        text,
        extra: {
          gensokyoUserVisibleText: userVisibleText?.trim() || null,
        },
      });
      const isEnding = text.includes('"action_id":"end_conversation"');
      const isRepair = text.includes('"action_id":"repair"');
      const previewActionId = previewAction?.action_id ?? '';
      const tutorialBeats = previewActionId === 'inspect_boundary'
        ? [
            { kind: 'speech', speaker_id: 'reimu', reaction_id: 'serious', pose_id: 'default', text: '这道结界确实被什么东西从里面扯动过。先给你临时通行许可，别擅自碰边缘的裂隙。' },
            { kind: 'action', speaker_id: 'reimu', reaction_id: 'neutral', pose_id: 'default', text: '灵梦收起御札，指向还能遮风的旧主屋，让你先把落脚处修好。' },
          ]
        : previewActionId === 'investigate_magic_trace'
          ? [
              { kind: 'action', speaker_id: null, reaction_id: 'serious', pose_id: 'default', text: '你沿结界残痕走到温室旧址，发现焦黑砖缝里仍有微弱魔力循环。' },
              { kind: 'speech', speaker_id: 'marisa', reaction_id: 'happy', pose_id: 'default', text: '这可不是普通杂草留下的痕迹。要重建温室，先弄明白它为什么还在生长。' },
            ]
          : ['investigate_growth', 'hear_marisa_plan', 'study_grandfather_blueprint'].includes(previewActionId)
            ? [
                { kind: 'action', speaker_id: null, reaction_id: 'neutral', pose_id: 'default', text: '零散痕迹终于拼成一条可行思路，庭守钥随之亮起第二道微光。' },
                { kind: 'speech', speaker_id: 'marisa', reaction_id: 'happy', pose_id: 'default', text: '很好，这下不只是猜想了。两点灵感，足够决定怎么清理旧地基。' },
              ]
            : null;
      const previewBeats = tutorialBeats ?? (isEnding
          ? [
            { kind: 'speech', speaker_id: 'reimu', reaction_id: 'neutral', pose_id: 'default', text: '那就先到这里吧。别忘了庭园还有一堆麻烦等着你。' },
            { kind: 'narration', speaker_id: null, reaction_id: 'neutral', pose_id: 'default', text: '短暂的交谈告一段落，庭园重新安静下来。' },
          ]
          : isRepair
            ? [
              { kind: 'action', speaker_id: null, reaction_id: 'serious', pose_id: 'default', text: '木料与旧屋的结构被逐一检查，施工声在庭园里断续响起。' },
              { kind: 'speech', speaker_id: 'reimu', reaction_id: 'serious', pose_id: 'default', text: '先别急着钉死这块板，下面还有结界留下的痕迹。' },
            ]
            : [
              {
                kind: 'speech',
                speaker_id: previewSpeakerId,
                reaction_id: text.includes('pat_head') ? 'annoyed' : 'neutral',
                pose_id: 'default',
                text: text.includes('pat_head')
                  ? '……你的手是不是伸得太自然了一点？'
                  : previewSpeakerId === 'marisa' ? '有话就说吧，我正好也想看看这座庭园。' : '有话就说。我还得检查这里的结界。',
              },
              {
                kind: 'action',
                speaker_id: previewSpeakerId,
                reaction_id: 'neutral',
                pose_id: 'default',
                text: `${previewSpeakerId === 'marisa' ? '魔理沙' : '灵梦'}看了你一眼，没有立刻离开。`,
              },
            ]);
      const escapeProtocolText = (value: string) => value
        .replace(/&/gu, '&amp;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;')
        .replace(/"/gu, '&quot;');
      const assistantMessageId = messages.length;
      const assistantText = [
        '【庭园正文开始】',
        ...previewBeats.map((beat) => beat.kind === 'speech'
          ? `<dialogue char="${escapeProtocolText(beat.speaker_id ?? previewSpeakerId)}" visual_mode="normal" reaction="${escapeProtocolText(beat.reaction_id)}" pose="default" act="none">${escapeProtocolText(beat.text)}</dialogue>`
          : `<narration>${escapeProtocolText(beat.text)}</narration>`),
        '【庭园正文结束】',
      ].join('\n');
      messages.push({
        id: assistantMessageId,
        role: 'assistant',
        name: '幻想乡物语',
        text: assistantText,
      });
      if (previewAction) {
        const staged = stageLocalSession(previewState, previewAction);
        Object.assign(
          previewState,
          applyLocalSettlement(staged, previewAction, assistantMessageId, assistantText),
        );
      }
      return structuredClone(transaction);
    },
    async sendAnomalyResolution(text) {
      const snapshot = await this.sendUserMessage(text, 'settlement');
      Object.assign(previewState, resolveAnomaly(previewState, snapshot.assistantMessageId ?? null));
      return snapshot;
    },
    async sendDuelVictoryRequest(requestText: string, text: string) {
      const pending = previewState.inventory?.card_runtime?.duel?.pending_victory_dialogue;
      if (!pending) throw new Error('没有待提交的胜利要求');
      Object.assign(previewState, stageDuelVictoryRequest(previewState, pending.settlement_id, requestText));
      const snapshot = await this.sendUserMessage(text, 'battle');
      Object.assign(previewState, completeDuelVictoryDialogue(previewState, pending.settlement_id));
      return snapshot;
    },
    async getTransactionState() { return structuredClone(transaction); },
    async retryLastTransaction() { throw new Error('离线预览没有失败事务'); },
    async stageBattleResult(result: BattleResult) {
      const current = previewState.battle?.current;
      if (current) {
        if (JSON.stringify(current) !== JSON.stringify(result)) throw new Error('已有另一份待结算战斗结果');
        return { messageId: Math.max(0, messages.length - 1), alreadyStaged: true };
      }
      const trusted = validateFlowerCoreBattleResult(result, previewState);
      previewState.battle = { ...previewState.battle, current: trusted };
      return { messageId: Math.max(0, messages.length - 1), alreadyStaged: false };
    },
    async settleDungeonResult(result: BattleResult) {
      if (previewState.battle?.rewarded_ids?.includes(result.settlement_id)) {
        return { rewardCoins: dungeonReward(result.outcome as 'clean_win' | 'narrow_win' | 'loss', previewState.inventory?.card_runtime?.duel?.zako_tag_count ?? 0), alreadySettled: true };
      }
      const before = structuredClone(previewState);
      const next = reconcileM2Runtime(
        before,
        settleLocalDungeonResult(before, result),
        'preview',
      );
      Object.assign(previewState, next);
      return { rewardCoins: dungeonReward(result.outcome as 'clean_win' | 'narrow_win' | 'loss', before.inventory?.card_runtime?.duel?.zako_tag_count ?? 0), alreadySettled: false };
    },
    async applyTestJump(jump: TestJumpId) {
      Object.assign(previewState, applyTestJump(previewState, jump));
    },
    async purchaseShopItem(itemId: string, purchaseId: string) {
      Object.assign(previewState, purchaseShopItem(previewState, itemId, purchaseId));
    },
    async claimStarterGift() {
      Object.assign(previewState, claimStarterGift(previewState));
    },
    async useOpportunityCard(useId: string) {
      const result = applyOpportunityCardUse(previewState, useId, 'offline-preview-chat');
      Object.assign(previewState, result.state);
      return {
        selectedCharacterId: result.selectedCharacterId,
        message: result.message,
        alreadySettled: result.alreadySettled,
      };
    },
    async beginDuelCard(targetCharacterId: string, useId: string) {
      const result = beginLocalDuelCard(previewState, targetCharacterId, useId);
      Object.assign(previewState, result.state);
      return {
        targetCharacterId,
        configId: result.configId,
        difficultyTier: result.difficultyTier,
        alreadyStarted: result.alreadyStarted,
        config: getLockedDuelBattleConfig(targetCharacterId, result.difficultyTier, result.configId),
      };
    },
    async cancelDuelCard(useId: string) {
      Object.assign(previewState, cancelLocalDuelCard(previewState, useId));
    },
    async settleDuelCard(result: BattleResult) {
      const settled = settleLocalDuelCard(previewState, result);
      Object.assign(previewState, settled.state);
      return {
        won: settled.won,
        zakoTagCount: settled.zakoTagCount,
        previousZakoTagCount: settled.previousZakoTagCount,
        zakoTagDelta: settled.zakoTagDelta,
        message: settled.message,
        alreadySettled: settled.alreadySettled,
      };
    },
    async useSpecialItem(itemId: string, useId: string, form?: Partial<AnomalyActivationForm>) {
      const result = applySpecialItemUse(previewState, itemId, useId, form);
      Object.assign(previewState, result.state);
      return result.message;
    },
    async finalizeAnomalyActivation(origin: AnomalyHiddenOrigin, publicSummary = '') {
      const result = finalizeAnomalyCardUse(previewState, origin, publicSummary);
      Object.assign(previewState, result.state);
      return result.message;
    },
    async cancelAnomalyActivation(transactionId?: string) {
      const result = abortAnomalyCardUse(previewState, transactionId);
      Object.assign(previewState, result.state);
      return result.message;
    },
    async recordAnomalyClue(summary: string) {
      Object.assign(previewState, appendDailyClue(previewState, summary));
    },
    async resolveActiveAnomaly(resolutionMessageId: number | null = null) {
      Object.assign(previewState, resolveAnomaly(previewState, resolutionMessageId));
    },
    async applyM2Command(command) {
      const applied = applyLocalM2Command(previewState, command, 'preview');
      Object.assign(previewState, applied.state);
      return applied.result;
    },
    async continueGeneration() { throw new Error('离线预览不支持继续生成'); },
    async stopGeneration() { return false; },
    async regenerateLatest() { throw new Error('离线预览不支持重新生成'); },
    async swipeLatest() { throw new Error('离线预览不支持 Swipe'); },
    async showNativeChat() { return false; },
    async diagnostics(): Promise<RuntimeDiagnostics> { return previewRuntimeDiagnostics(); },
    async buildDiagnosticSnapshot() {
      return buildDiagnosticSnapshot({
        state: structuredClone(previewState),
        transaction: structuredClone(transaction),
        pendingRequest: null,
        diagnostics: previewRuntimeDiagnostics(),
        memoryPort: { profile: memoryPort.profile, capability: memoryPort.capability },
        appVersion: String(previewState.meta?.schema_version ?? 'unknown'),
      });
    },
    async listSaveSlots() {
      return Array.from({ length: 8 }, (_, index) => ({
        slotId: `manual-${String(index + 1).padStart(2, '0')}` as SaveSlotId,
        occupied: false,
        valid: true,
      }));
    },
    async saveToSlot() { throw new Error('离线预览不支持持久化存档'); },
    async loadFromSlot() { throw new Error('离线预览不支持读取存档'); },
    async subscribe() { return () => undefined; },
  };
}

export const bridge = createHostBridge() ?? createPreviewBridge();
