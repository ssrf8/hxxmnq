// Phase 1.1 — 纯函数请求构造器（gal-generation-request）。
//
// 职责边界（计划 §1.1）：
//   - 创建稳定 request，并为每次调用创建独立 attempt；
//   - 从玩家楼层 metadata 恢复 regenerate request；
//   - 生成 promptRevision 与 contextFingerprint。
// 禁止：调用 generate、写聊天、等待事件、操作 DOM、读取宿主状态。
// 所有外部输入（历史/状态快照、场景、身份）由调用方显式传入，本模块不自行获取。

import { verifyVisitTurnAuditRefs } from './visit-turn-commit';
import {
  buildGalCurrentTurnInjection,
  GAL_PROMPT_REVISION,
  isValidGalPromptInjection,
  LEGACY_GAL_PROMPT_REVISION,
  sanitizeGalPlayerInput,
  type GalPromptInjection,
} from './gal-prompt-injection';

export const REQUEST_SCHEMA = 'gal-generation-request.v1';
export const ATTEMPT_SCHEMA = 'gal-generation-attempt.v1';
export const CURRENT_PROMPT_REVISION = GAL_PROMPT_REVISION;

/** 持久化到玩家楼层 extra 的键名（沿用项目 gensokyo* 命名空间惯例，避免覆盖插件字段）。 */
export const REQUEST_EXTRA_KEY = 'galGenerationRequestV1';

/** 请求前聊天状态快照（调用方捕获后传入，本模块不读宿主）。 */
export interface RequestChatSnapshot {
  ownerCharacterId: string;
  chatId: string;
  /** 请求前最后的楼层 ID（本次刚创建的玩家楼层之前的边界）。 */
  stateMessageIdBeforeGeneration: number | null;
  stateSwipeIdBeforeGeneration: number | null;
  sceneId: string | null;
  /**
   * 历史集合的稳定摘要输入：调用方负责排除本次刚创建的玩家楼层。
   * 仅用于 contextFingerprint 计算，不参与 modelUserInput 拼接。
   */
  historyFingerprintInput: string;
}

export interface GalGenerationRequest {
  schema: typeof REQUEST_SCHEMA;
  requestId: string;
  chatId: string;
  ownerCharacterId: string;
  /** 写入后按 metadata 精确反查并回填（withPlayerMessageId）。 */
  playerMessageId?: number;
  promptRevision: string;
  sceneId: string | null;
  stateMessageIdBeforeGeneration: number | null;
  stateSwipeIdBeforeGeneration: number | null;
  contextFingerprint: string;
  /** 玩家看到的原文（trim 后）。 */
  visibleUserText: string;
  /** 本轮保持现有拼接语义（withGardenNarrativeContract 注入后）；后续注入重构再迁移。 */
  modelUserInput: string;
  /** 该 request 已进行的模型调用次数（首调 1；retry 递增）。 */
  attemptSeq: number;
  createdAt: string;
}

export interface GalGenerationAttempt {
  schema: typeof ATTEMPT_SCHEMA;
  requestId: string;
  /** 每次模型调用都新建。 */
  attemptId: string;
  /** 每次 generate 都新建，不复用已停止/失败 ID。 */
  generationId: string;
  mode: 'send' | 'regenerate';
  chatId: string;
  ownerCharacterId: string;
  assistantMessageId?: number;
  baseSwipeId?: number;
  commitKey: string;
  createdAt: string;
}

export interface GalGenerationRequestInput {
  playerInput: string;
  snapshot: RequestChatSnapshot;
  /** 现有提示词注入（withGardenNarrativeContract 等），保持注入位置不变。 */
  contractInjector: (text: string) => string;
  /** retry/regenerate 复用原 requestId；缺省时新建。 */
  requestId?: string;
  /** 本 request 的第几次模型调用（attempt 序号，从 1 起）。 */
  attemptSeq?: number;
  /** 玩家看到的原文（未注入）；缺省 = playerInput.trim()。 */
  visibleUserText?: string;
  now?: number;
}

export type GalGenerationRequestResult =
  | { ok: true; request: GalGenerationRequest }
  | { ok: false; reason: 'empty-input' | 'missing-chat-identity' };

// ---------------------------------------------------------------------------
// ID 与指纹
// ---------------------------------------------------------------------------

const RANDOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomToken(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += RANDOM_ALPHABET[Math.floor(Math.random() * RANDOM_ALPHABET.length)];
  }
  return out;
}

/** 逻辑玩家请求 ID：retry/regenerate 复用，绑定且只绑定一个真实 player 楼层。 */
export function createRequestId(now = Date.now()): string {
  return `gal-req-${now.toString(36)}-${randomToken(4)}`;
}

/** 每次模型调用新建：`${requestId}:attempt-${seq}`。 */
export function createAttemptId(requestId: string, seq: number): string {
  return `${requestId}:attempt-${seq}`;
}

/** 每次 generate 都新建（Probe A 实测：运行时原样贯穿全部生成事件）。 */
export function createGenerationId(now = Date.now()): string {
  return `gal-gen-${now.toString(36)}-${randomToken(6)}`;
}

/** `${requestId}:${attemptId}`。 */
export function createCommitKey(requestId: string, attemptId: string): string {
  return `${requestId}:${attemptId}`;
}

/** FNV-1a 32 位——同步、稳定、无外部依赖。 */
export function computeContextFingerprint(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** 计算请求的 contextFingerprint（同输入必同值；历史/场景/输入任一变化必变）。 */
export function fingerprintForRequest(
  promptRevision: string,
  sceneId: string | null,
  stateMessageIdBeforeGeneration: number | null,
  stateSwipeIdBeforeGeneration: number | null,
  historyFingerprintInput: string,
  visibleUserText: string,
): string {
  return computeContextFingerprint([
    promptRevision,
    sceneId ?? '',
    stateMessageIdBeforeGeneration == null ? '' : String(stateMessageIdBeforeGeneration),
    stateSwipeIdBeforeGeneration == null ? '' : String(stateSwipeIdBeforeGeneration),
    historyFingerprintInput,
    visibleUserText,
  ].join('\u0000'));
}

// ---------------------------------------------------------------------------
// 请求构造
// ---------------------------------------------------------------------------

export function createGalGenerationRequest(input: GalGenerationRequestInput): GalGenerationRequestResult {
  const value = input.playerInput.trim();
  if (!value) return { ok: false, reason: 'empty-input' };
  if (!input.snapshot.ownerCharacterId || !input.snapshot.chatId) {
    return { ok: false, reason: 'missing-chat-identity' };
  }
  const now = input.now ?? Date.now();
  const requestId = input.requestId ?? createRequestId(now);
  const attemptSeq = input.attemptSeq ?? 1;
  const modelUserInput = input.contractInjector(value);
  const visibleUserText = (input.visibleUserText ?? value).trim() || value;
  const request: GalGenerationRequest = {
    schema: REQUEST_SCHEMA,
    requestId,
    chatId: input.snapshot.chatId,
    ownerCharacterId: input.snapshot.ownerCharacterId,
    promptRevision: LEGACY_GAL_PROMPT_REVISION,
    sceneId: input.snapshot.sceneId,
    stateMessageIdBeforeGeneration: input.snapshot.stateMessageIdBeforeGeneration,
    stateSwipeIdBeforeGeneration: input.snapshot.stateSwipeIdBeforeGeneration,
    contextFingerprint: fingerprintForRequest(
      LEGACY_GAL_PROMPT_REVISION,
      input.snapshot.sceneId,
      input.snapshot.stateMessageIdBeforeGeneration,
      input.snapshot.stateSwipeIdBeforeGeneration,
      input.snapshot.historyFingerprintInput,
      visibleUserText,
    ),
    visibleUserText,
    modelUserInput,
    attemptSeq,
    createdAt: new Date(now).toISOString(),
  };
  return { ok: true, request };
}

/** 创建本次模型调用的 attempt（每次调用新建，不复用已停止/失败 ID）。 */
export function createGalGenerationAttempt(
  request: Pick<GalAnyRequest, 'requestId' | 'attemptSeq' | 'chatId' | 'ownerCharacterId'>,
  mode: 'send' | 'regenerate',
  attemptSeq: number,
  now = Date.now(),
): GalGenerationAttempt {
  const attemptId = createAttemptId(request.requestId, attemptSeq);
  return {
    schema: ATTEMPT_SCHEMA,
    requestId: request.requestId,
    attemptId,
    generationId: createGenerationId(now),
    mode,
    chatId: request.chatId,
    ownerCharacterId: request.ownerCharacterId,
    commitKey: createCommitKey(request.requestId, attemptId),
    createdAt: new Date(now).toISOString(),
  };
}

export function advanceGalGenerationRequest(
  request: GalGenerationRequest,
  completedAttemptSeq: number,
): GalGenerationRequest {
  return { ...request, attemptSeq: Math.max(request.attemptSeq, completedAttemptSeq + 1) };
}

/** 反查回填玩家楼层 ID（纯函数，返回新对象）。 */
export function withPlayerMessageId(request: GalGenerationRequest, messageId: number): GalGenerationRequest {
  return { ...request, playerMessageId: messageId };
}

// ---------------------------------------------------------------------------
// metadata（§1.2）
// ---------------------------------------------------------------------------

export type RequestMetadataParseResult =
  | { ok: true; value: Readonly<Record<string, unknown>> }
  | { ok: false; code: 'missing' | 'malformed' | 'schema-mismatch' };

/** 序列化（供 extra 合并；不覆盖既有 extra 键）。 */
export function buildRequestMetadata(request: GalGenerationRequest): Record<string, unknown> {
  return {
    [REQUEST_EXTRA_KEY]: {
      schema: REQUEST_SCHEMA,
      requestId: request.requestId,
      chatId: request.chatId,
      ownerCharacterId: request.ownerCharacterId,
      playerMessageId: request.playerMessageId ?? null,
      promptRevision: request.promptRevision,
      sceneId: request.sceneId,
      stateMessageIdBeforeGeneration: request.stateMessageIdBeforeGeneration,
      stateSwipeIdBeforeGeneration: request.stateSwipeIdBeforeGeneration,
      contextFingerprint: request.contextFingerprint,
      visibleUserText: request.visibleUserText,
      // 现状等价输入过大时不复制到 extra：记录 hash，正文可恢复。
      modelUserInputHash: computeContextFingerprint(request.modelUserInput),
      attemptSeq: request.attemptSeq,
      createdAt: request.createdAt,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 解析 extra 中的 request metadata（缺旧 metadata 时返回明确错误码，不抛错）。 */
export function parseRequestMetadata(extra: unknown): RequestMetadataParseResult {
  if (extra === undefined || extra === null) return { ok: false, code: 'missing' };
  if (!isRecord(extra)) return { ok: false, code: 'malformed' };
  // Phase 4 实机修复：ST 1.18 对 assistant 楼层的 extra 规范化会把自定义 metadata 包进
  // extra.extra 子对象（玩家楼层则平铺）——两种视图都查（宿主 chat 平铺 / Helper 视图嵌套）。
  const value = extra[REQUEST_EXTRA_KEY] ?? (isRecord(extra.extra) ? extra.extra[REQUEST_EXTRA_KEY] : undefined);
  if (value === undefined || value === null) return { ok: false, code: 'missing' };
  if (!isRecord(value)) return { ok: false, code: 'malformed' };
  if (value.schema !== REQUEST_SCHEMA) return { ok: false, code: 'schema-mismatch' };
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// 精确反查（§1.2/§2.2：找到 0 条或多条都进入失败/未知状态，不能猜 ID）
// ---------------------------------------------------------------------------

export type PlayerMessageResolveResult =
  | { ok: true; messageId: number }
  | { ok: false; code: 'not-found' | 'ambiguous' };

/**
 * 在同一 chat identity 下按 `extra.galGenerationRequestV1.requestId + role=user` 精确反查。
 * 纯函数：messages 由调用方（同一 chat 的已写入楼层集合）传入。
 */
export function resolvePlayerMessageByMetadata(
  messages: ReadonlyArray<{ role?: string; extra?: unknown; message_id?: number }>,
  requestId: string,
): PlayerMessageResolveResult {
  const matches: number[] = [];
  for (const message of messages) {
    if (message.role !== 'user') continue;
    // F-A/F02：V1 与 V2 metadata 都带 requestId，反查需同时认两套 key，
    // 否则 V2 玩家楼层永远 not-found → 事务在 submit 层误判 failed。
    const v2 = parseRequestMetadataV2(message.extra);
    const parsed = v2.ok && v2.value.requestId === requestId
      ? v2
      : parseRequestMetadata(message.extra);
    if (parsed.ok && parsed.value.requestId === requestId && typeof message.message_id === 'number') {
      matches.push(message.message_id);
    }
  }
  if (matches.length === 1) return { ok: true, messageId: matches[0] };
  if (matches.length > 1) return { ok: false, code: 'ambiguous' };
  return { ok: false, code: 'not-found' };
}

/** 从玩家楼层 metadata 恢复 regenerate request（§1.1 恢复路径；纯函数，不查宿主）。 */
export type RestoreRequestResult =
  | { ok: true; request: GalGenerationRequest }
  | { ok: false; code: 'missing' | 'malformed' | 'schema-mismatch' | 'incomplete' };

export function restoreGalGenerationRequest(extra: unknown): RestoreRequestResult {
  const parsed = parseRequestMetadata(extra);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const required = [
    'requestId', 'chatId', 'ownerCharacterId', 'promptRevision',
    'sceneId', 'stateMessageIdBeforeGeneration', 'stateSwipeIdBeforeGeneration',
    'contextFingerprint', 'visibleUserText', 'createdAt',
  ] as const;
  for (const key of required) {
    if (!(key in value)) return { ok: false, code: 'incomplete' };
  }
  return {
    ok: true,
    request: {
      schema: REQUEST_SCHEMA,
      requestId: String(value.requestId),
      chatId: String(value.chatId),
      ownerCharacterId: String(value.ownerCharacterId),
      playerMessageId: typeof value.playerMessageId === 'number' ? value.playerMessageId : undefined,
      promptRevision: String(value.promptRevision),
      sceneId: value.sceneId == null ? null : String(value.sceneId),
      stateMessageIdBeforeGeneration: value.stateMessageIdBeforeGeneration == null ? null : Number(value.stateMessageIdBeforeGeneration),
      stateSwipeIdBeforeGeneration: value.stateSwipeIdBeforeGeneration == null ? null : Number(value.stateSwipeIdBeforeGeneration),
      contextFingerprint: String(value.contextFingerprint),
      visibleUserText: String(value.visibleUserText),
      modelUserInput: '',
      attemptSeq: typeof value.attemptSeq === 'number' && value.attemptSeq >= 1 ? value.attemptSeq : 1,
      createdAt: String(value.createdAt),
    },
  };
}

// ---------------------------------------------------------------------------
// 历史构造（Phase 2 增量 B：generate() 的 chat_history 覆盖）
// ---------------------------------------------------------------------------

/**
 * 构造 generate() `overrides.chat_history.prompts` 的楼层历史（RolePrompt 形状）。
 * - 排除刚创建的当前玩家楼层（它在 `user_input` 中，避免同一内容进入两次）；
 * - 使用当时有效的 active message/swipe 文本（调用方传入已取好当前 swipe 的楼层）；
 * - 仅收 user/assistant 楼层，跳过空文本。
 */
export function buildChatHistoryForGenerate(
  messages: ReadonlyArray<{
    role?: string;
    is_user?: boolean;
    message?: unknown;
    mes?: unknown;
    message_id?: unknown;
  }>,
  excludeMessageId: number | null,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const message of messages) {
    if (excludeMessageId != null && Number(message.message_id) === excludeMessageId) continue;
    const isUser = message.role === 'user' || message.is_user === true;
    const isAssistant = message.role === 'assistant';
    if (!isUser && !isAssistant) continue;
    const role = isUser ? 'user' : 'assistant';
    const text = String(message.message ?? message.mes ?? '').trim();
    if (!text) continue;
    history.push({ role, content: text });
  }
  return history;
}

export function resolveLatestAssistantForRegeneration(
  messages: ReadonlyArray<{ role?: string; is_user?: boolean; is_system?: boolean; message_id?: unknown }>,
): { ok: true; messageId: number } | { ok: false; code: 'empty-chat' | 'latest-not-assistant' | 'invalid-id' } {
  const latest = messages.at(-1);
  if (!latest) return { ok: false, code: 'empty-chat' };
  if (latest.role !== 'assistant' || latest.is_user === true || latest.is_system === true) {
    return { ok: false, code: 'latest-not-assistant' };
  }
  const messageId = Number(latest.message_id);
  return Number.isInteger(messageId) && messageId >= 0
    ? { ok: true, messageId }
    : { ok: false, code: 'invalid-id' };
}

// ---------------------------------------------------------------------------
// attempt metadata 与助手楼层精确反查（Phase 2 增量 A）
// ---------------------------------------------------------------------------

/** 持久化到 assistant 楼层的 extra 键名。 */
export const ATTEMPT_EXTRA_KEY = 'galGenerationAttemptV1';
export const COMMIT_LIFECYCLE_KEY = 'galGenerationCommitV1';

export function buildCommitLifecycle(
  attempt: Pick<GalGenerationAttempt, 'requestId' | 'attemptId' | 'commitKey'>,
  status: 'pending' | 'settled',
): Record<string, unknown> {
  return {
    schema: 'gal-generation-commit.v1',
    requestId: attempt.requestId,
    attemptId: attempt.attemptId,
    commitKey: attempt.commitKey,
    status,
  };
}

export type AttemptMetadataParseResult =
  | { ok: true; value: Readonly<Record<string, unknown>> }
  | { ok: false; code: 'missing' | 'malformed' | 'schema-mismatch' };

/** 序列化 attempt metadata（供 assistant 楼层 extra 合并）。 */
export function buildAttemptMetadata(attempt: GalGenerationAttempt): Record<string, unknown> {
  return {
    [ATTEMPT_EXTRA_KEY]: {
      schema: ATTEMPT_SCHEMA,
      requestId: attempt.requestId,
      attemptId: attempt.attemptId,
      generationId: attempt.generationId,
      mode: attempt.mode,
      chatId: attempt.chatId,
      ownerCharacterId: attempt.ownerCharacterId,
      assistantMessageId: attempt.assistantMessageId ?? null,
      baseSwipeId: attempt.baseSwipeId ?? null,
      commitKey: attempt.commitKey,
      createdAt: attempt.createdAt,
    },
  };
}

export function parseAttemptMetadata(extra: unknown): AttemptMetadataParseResult {
  if (extra === undefined || extra === null) return { ok: false, code: 'missing' };
  if (!isRecord(extra)) return { ok: false, code: 'malformed' };
  // Phase 4 实机修复：同 parseRequestMetadata——assistant 楼层 metadata 可能在 extra.extra。
  const value = extra[ATTEMPT_EXTRA_KEY] ?? (isRecord(extra.extra) ? extra.extra[ATTEMPT_EXTRA_KEY] : undefined);
  if (value === undefined || value === null) return { ok: false, code: 'missing' };
  if (!isRecord(value)) return { ok: false, code: 'malformed' };
  if (value.schema !== ATTEMPT_SCHEMA) return { ok: false, code: 'schema-mismatch' };
  return { ok: true, value };
}

/**
 * 在同一 chat identity 下按 `extra.galGenerationAttemptV1.commitKey + role=assistant`
 * 精确反查助手楼层（幂等 commit 依据）。找到 0 条或多条都进入失败/未知状态。
 */
export function resolveAssistantMessageByCommitKey(
  messages: ReadonlyArray<{ role?: string; extra?: unknown; message_id?: number }>,
  requestId: string,
  attemptId: string,
): PlayerMessageResolveResult {
  const expected = createCommitKey(requestId, attemptId);
  const matches: number[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    const parsed = parseAttemptMetadata(message.extra);
    if (parsed.ok && parsed.value.commitKey === expected && typeof message.message_id === 'number') {
      matches.push(message.message_id);
    }
  }
  if (matches.length === 1) return { ok: true, messageId: matches[0] };
  if (matches.length > 1) return { ok: false, code: 'ambiguous' };
  return { ok: false, code: 'not-found' };
}

// ---------------------------------------------------------------------------
// 重载恢复（Phase 4 §4.2）：从真实聊天重建事务状态（纯函数，不查宿主）
// ---------------------------------------------------------------------------

export interface ChatIdentity {
  ownerCharacterId: string;
  chatId: string;
}

export type ChatRestoreResult =
  | { kind: 'none' }
  | { kind: 'incomplete'; request: GalAnyRequest; userMessageId: number }
  | {
      kind: 'settlement-pending';
      request: GalAnyRequest;
      userMessageId: number;
      assistantMessageId: number;
      attempt: { attemptId: string; generationId: string; commitKey: string };
    }
  | {
      kind: 'confirmed';
      request: GalAnyRequest;
      userMessageId: number;
      assistantMessageId: number;
      attempt: { attemptId: string; generationId: string; commitKey: string };
    }
  | { kind: 'conflict'; reason: 'malformed' | 'multiple-commits' };

/**
 * 重载恢复判定（计划 §4.2）：扫描真实聊天，找「最新带 request metadata 的玩家楼层」
 * 及其精确 assistant commit，绑定 ownerCharacterId + chatId + requestId 判定状态。
 * - none：无本系统请求 → 正常开放发送；
 * - incomplete：玩家存在、commit 无 → 请求未完成/状态未知（禁止自动重发）；
 * - confirmed：commit 已存在（MVU data 随落楼写入，即最终状态）→ 恢复 settled 与 GAL 投影；
 * - conflict：metadata 缺失/多条 commit → 人工确认。
 */
export function analyzeChatRestore(
  messages: ReadonlyArray<{ role?: string; is_user?: boolean; message_id?: unknown; swipe_id?: unknown; message?: unknown; mes?: unknown; extra?: unknown; data?: unknown }>,
  identity: ChatIdentity,
): ChatRestoreResult {
  const latestUser = messages
    .filter((message) => (message.role === 'user' || message.is_user === true) && typeof message.message_id === 'number')
    .reduce<(typeof messages)[number] | null>((latest, message) => (
      !latest || Number(message.message_id) > Number(latest.message_id) ? message : latest
    ), null);
  if (!latestUser) return { kind: 'none' };
  const extra = isRecord(latestUser.extra) ? latestUser.extra : null;
  const nestedExtra = isRecord(extra?.extra) ? extra.extra : null;
  // F-A：按 metadata key 分派 V1/V2，V2 失败不得回退 V1（防 schema 混用）。
  const hasV2Key = Boolean(extra && (
    REQUEST_EXTRA_KEY_V2 in extra
    || (nestedExtra && REQUEST_EXTRA_KEY_V2 in nestedExtra)
  ));
  const hasV1Key = Boolean(extra && (
    REQUEST_EXTRA_KEY in extra
    || ATTEMPT_EXTRA_KEY in extra
    || (nestedExtra && REQUEST_EXTRA_KEY in nestedExtra)
  ));
  const restored = hasV2Key
    ? restoreGalGenerationRequestV2(latestUser.extra)
    : restoreGalGenerationRequest(latestUser.extra);
  if (!restored.ok) {
    const hasMetadata = Boolean(hasV2Key || hasV1Key);
    return hasMetadata ? { kind: 'conflict', reason: 'malformed' } : { kind: 'none' };
  }
  const request = restored.request;
  if (request.chatId !== identity.chatId || request.ownerCharacterId !== identity.ownerCharacterId) return { kind: 'none' };
  const latest = { messageId: Number(latestUser.message_id), request };
  // 精确 assistant commit：requestId 匹配 + 位于玩家楼层之后
  const commits: Array<{ messageId: number; attemptId: string; generationId: string; commitKey: string }> = [];
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    const parsed = parseAttemptMetadata(message.extra);
    if (!parsed.ok) continue;
    if (String(parsed.value.requestId) !== latest.request.requestId) continue;
    if (typeof message.message_id !== 'number' || message.message_id <= latest.messageId) continue;
    if (!String(message.message ?? message.mes ?? '').trim()) return { kind: 'conflict', reason: 'malformed' };
    const attemptId = String(parsed.value.attemptId ?? '');
    const generationId = String(parsed.value.generationId ?? '');
    const commitKey = String(parsed.value.commitKey ?? '');
    if (!attemptId || !generationId
      || parsed.value.chatId !== identity.chatId
      || parsed.value.ownerCharacterId !== identity.ownerCharacterId
      || commitKey !== createCommitKey(latest.request.requestId, attemptId)) {
      return { kind: 'conflict', reason: 'malformed' };
    }
    commits.push({
      messageId: message.message_id,
      attemptId,
      generationId,
      commitKey,
    });
  }
  if (commits.length === 0) {
    const nativeAssistant = messages.some((message) => (
      message.role === 'assistant'
      && Number(message.message_id) > latest.messageId
      && String(message.message ?? message.mes ?? '').trim()
    ));
    return nativeAssistant
      ? { kind: 'none' }
      : { kind: 'incomplete', request: latest.request, userMessageId: latest.messageId };
  }
  if (commits.length > 1) return { kind: 'conflict', reason: 'multiple-commits' };
  const committedMessage = messages.find((message) => Number(message.message_id) === commits[0].messageId);
  const data = isRecord(committedMessage?.data) ? committedMessage.data : {};
  const lifecycle = isRecord(data[COMMIT_LIFECYCLE_KEY]) ? data[COMMIT_LIFECYCLE_KEY] : null;
  const lifecycleSettled = lifecycle?.schema === 'gal-generation-commit.v1'
    && lifecycle.status === 'settled'
    && lifecycle.commitKey === commits[0].commitKey;
  const assistantSwipeId = typeof committedMessage?.swipe_id === 'number'
    && Number.isInteger(committedMessage.swipe_id)
    && committedMessage.swipe_id >= 0
    ? committedMessage.swipe_id
    : null;
  const committedState = isRecord(data.stat_data) ? data.stat_data as import('./types').GardenState : {};
  const visitTurnsSettled = latest.request.schema !== REQUEST_SCHEMA_V2 || (
    assistantSwipeId !== null
    && verifyVisitTurnAuditRefs(
      committedState,
      latest.request,
      {
        attemptId: commits[0].attemptId,
        commitKey: commits[0].commitKey,
        assistantMessageId: commits[0].messageId,
        assistantSwipeId,
      },
    )
  );
  if (!lifecycleSettled || !visitTurnsSettled) {
    return {
      kind: 'settlement-pending',
      request: latest.request,
      userMessageId: latest.messageId,
      assistantMessageId: commits[0].messageId,
      attempt: commits[0],
    };
  }
  return {
    kind: 'confirmed',
    request: latest.request,
    userMessageId: latest.messageId,
    assistantMessageId: commits[0].messageId,
    attempt: commits[0],
  };
}

// ---------------------------------------------------------------------------
// V2 请求（第二批：发送与合成历史）
//
// 合同：project/gal-character-memory-batch-2-send-and-synthetic-history-runbook.md §3.2–3.3
//   - schema: gal-generation-request.v2，extra key: galGenerationRequestV2；
//   - historyRevision: gal-synthetic-history.v1，memoryRevision: character-visit-memory.v1；
//   - 新建 V2 请求使用 gal-prompt.v2；旧 gal-prompt.v1 metadata 保持可恢复；
//   - syntheticHistory 只接受 role:'system'，parser 拒绝空 history；
//   - V2 写新 key，不覆盖 V1 extra；V1 parser/metadata 兼容读取原样保留；
//   - 完整 V2 请求持久化到玩家楼层 metadata，reload recovery 复用同一冻结请求。
// ---------------------------------------------------------------------------

export const REQUEST_SCHEMA_V2 = 'gal-generation-request.v2' as const;
export const REQUEST_EXTRA_KEY_V2 = 'galGenerationRequestV2';
export const HISTORY_REVISION = 'gal-synthetic-history.v1' as const;
export const MEMORY_REVISION = 'character-visit-memory.v1' as const;

/** V1 或 V2 逻辑请求（恢复/事务层按需分派）。 */
export type GalAnyRequest = GalGenerationRequest | GalGenerationRequestV2;

export interface SyntheticHistoryMessage {
  role: 'system';
  content: string;
}

export interface GalGenerationRequestV2 {
  schema: typeof REQUEST_SCHEMA_V2;
  requestId: string;
  chatId: string;
  ownerCharacterId: string;
  /** 写入后按 metadata 精确反查并回填（withPlayerMessageIdV2）。 */
  playerMessageId?: number;
  promptRevision: string;
  historyRevision: typeof HISTORY_REVISION;
  memoryRevision: typeof MEMORY_REVISION;
  sceneId: string | null;
  stateMessageIdBeforeGeneration: number | null;
  stateSwipeIdBeforeGeneration: number | null;
  /** 冻结的相关角色（稳定顺序、去重、≤4、只含已登记 ID）。 */
  relevantCharacterIds: string[];
  /** 每个相关角色一个键：active visit ID 或 null（请求时冻结，生成期间不改写）。 */
  visitIdsByCharacter: Record<string, string | null>;
  /** 唯一允许的 chat history：恰好非空、每条 role==='system'。 */
  syntheticHistory: SyntheticHistoryMessage[];
  /** syntheticHistory 的稳定 hash（synthetic-history 模块产出，随冻结一起持久化）。 */
  syntheticHistoryHash: string;
  /** v2 新请求冻结的唯一请求期注入；旧 gal-prompt.v1 metadata 中不存在。 */
  promptInjects?: GalPromptInjection[];
  promptInjectsHash?: string;
  contextFingerprint: string;
  /** 玩家看到的原文（trim 后）。 */
  visibleUserText: string;
  /** 本轮传给模型的玩家输入；v2 仅含清理后的玩家原文。 */
  modelUserInput: string;
  /** 该 request 已进行的模型调用次数（首调 1；retry 递增）。 */
  attemptSeq: number;
  createdAt: string;
}

export interface GalGenerationRequestV2Input {
  playerInput: string;
  visibleUserText: string;
  snapshot: RequestChatSnapshot & {
    relevantCharacterIds: string[];
    visitIdsByCharacter: Record<string, string | null>;
  };
  syntheticHistory: SyntheticHistoryMessage[];
  syntheticHistoryHash: string;
  promptRevision?: typeof LEGACY_GAL_PROMPT_REVISION | typeof GAL_PROMPT_REVISION;
  promptInjects?: GalPromptInjection[];
  promptInjectsHash?: string;
  contextFingerprint: string;
  /** retry 复用原 requestId；缺省时新建。 */
  requestId?: string;
  attemptSeq?: number;
  now?: number;
}

export type GalGenerationRequestV2Result =
  | { ok: true; request: GalGenerationRequestV2 }
  | { ok: false; reason: 'empty-input' | 'missing-chat-identity' | 'empty-history' | 'non-system-history' | 'duplicate-character' | 'visit-map-mismatch' | 'unknown-revision' | 'invalid-injection' };

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function isSystemOnlyHistory(history: unknown): history is SyntheticHistoryMessage[] {
  return Array.isArray(history) && history.length > 0 && history.every((item) => (
    isRecord(item) && item.role === 'system' && typeof item.content === 'string'
  ));
}

function visitMapKeysEqual(map: unknown, characterIds: readonly string[]): boolean {
  if (!isRecord(map)) return false;
  const keys = Object.keys(map).sort();
  const expected = characterIds.slice().sort();
  if (keys.length !== expected.length) return false;
  for (let i = 0; i < keys.length; i += 1) {
    if (keys[i] !== expected[i]) return false;
  }
  return true;
}

/**
 * 构造 V2 冻结请求（纯函数，不调用 generate、不写聊天、不读宿主）。
 * 相关角色与 visit map 由调用方在请求时冻结传入（B2-T03 纯函数产出），本构造器不再解析玩家文本。
 */
export function createGalGenerationRequestV2(input: GalGenerationRequestV2Input): GalGenerationRequestV2Result {
  const value = input.playerInput.trim();
  if (!value) return { ok: false, reason: 'empty-input' };
  if (!input.snapshot.ownerCharacterId || !input.snapshot.chatId) {
    return { ok: false, reason: 'missing-chat-identity' };
  }
  if (input.syntheticHistory.length === 0) return { ok: false, reason: 'empty-history' };
  if (!isSystemOnlyHistory(input.syntheticHistory)) {
    return { ok: false, reason: 'non-system-history' };
  }
  const relevant = uniqueStrings(input.snapshot.relevantCharacterIds);
  if (relevant.length !== input.snapshot.relevantCharacterIds.length) {
    return { ok: false, reason: 'duplicate-character' };
  }
  // R0 裁定：空相关角色是合法 V2（独处设施/无角色过渡）；
  // 但 visit map 必须严格与角色集合匹配（空角色 → 空 map）。
  if (!visitMapKeysEqual(input.snapshot.visitIdsByCharacter, relevant)) {
    return { ok: false, reason: 'visit-map-mismatch' };
  }
  for (const id of relevant) {
    const visitId = input.snapshot.visitIdsByCharacter[id];
    if (visitId != null && typeof visitId !== 'string') return { ok: false, reason: 'visit-map-mismatch' };
  }
  if (typeof input.syntheticHistoryHash !== 'string' || input.syntheticHistoryHash.length === 0) {
    return { ok: false, reason: 'unknown-revision' };
  }
  const promptRevision = input.promptRevision ?? LEGACY_GAL_PROMPT_REVISION;
  if (promptRevision !== LEGACY_GAL_PROMPT_REVISION && promptRevision !== GAL_PROMPT_REVISION) {
    return { ok: false, reason: 'unknown-revision' };
  }
  if (promptRevision === GAL_PROMPT_REVISION) {
    if (!Array.isArray(input.promptInjects)
      || input.promptInjects.length !== 1
      || !isValidGalPromptInjection(input.promptInjects[0])
      || typeof input.promptInjectsHash !== 'string'
      || input.promptInjectsHash !== computeContextFingerprint(input.promptInjects[0].content)) {
      return { ok: false, reason: 'invalid-injection' };
    }
  } else if (input.promptInjects !== undefined || input.promptInjectsHash !== undefined) {
    return { ok: false, reason: 'invalid-injection' };
  }
  const now = input.now ?? Date.now();
  const request: GalGenerationRequestV2 = {
    schema: REQUEST_SCHEMA_V2,
    requestId: input.requestId ?? createRequestId(now),
    chatId: input.snapshot.chatId,
    ownerCharacterId: input.snapshot.ownerCharacterId,
    promptRevision,
    historyRevision: HISTORY_REVISION,
    memoryRevision: MEMORY_REVISION,
    sceneId: input.snapshot.sceneId,
    stateMessageIdBeforeGeneration: input.snapshot.stateMessageIdBeforeGeneration,
    stateSwipeIdBeforeGeneration: input.snapshot.stateSwipeIdBeforeGeneration,
    relevantCharacterIds: relevant,
    visitIdsByCharacter: { ...input.snapshot.visitIdsByCharacter },
    syntheticHistory: input.syntheticHistory.map((item) => ({ role: 'system' as const, content: item.content })),
    syntheticHistoryHash: input.syntheticHistoryHash,
    ...(promptRevision === GAL_PROMPT_REVISION ? {
      promptInjects: input.promptInjects!.map((item) => ({ ...item })),
      promptInjectsHash: input.promptInjectsHash!,
    } : {}),
    contextFingerprint: input.contextFingerprint,
    visibleUserText: input.visibleUserText,
    modelUserInput: value,
    attemptSeq: input.attemptSeq ?? 1,
    createdAt: new Date(now).toISOString(),
  };
  return { ok: true, request };
}

/** 反查回填玩家楼层 ID（纯函数，返回新对象）。 */
export function withPlayerMessageIdV2(request: GalGenerationRequestV2, messageId: number): GalGenerationRequestV2 {
  return { ...request, playerMessageId: messageId };
}

/** retry：requestId 不变，attemptSeq 前进（冻结字段全部保留）。 */
export function advanceGalGenerationRequestV2(
  request: GalGenerationRequestV2,
  completedAttemptSeq: number,
): GalGenerationRequestV2 {
  return { ...request, attemptSeq: Math.max(request.attemptSeq, completedAttemptSeq + 1) };
}

// ---------------------------------------------------------------------------
// V2 metadata（新 key，不覆盖 V1 extra）
// ---------------------------------------------------------------------------

export type RequestMetadataV2ParseResult =
  | { ok: true; value: Readonly<Record<string, unknown>> }
  | { ok: false; code: 'missing' | 'malformed' | 'schema-mismatch' };

/** 序列化完整 V2 请求（供玩家楼层 extra 合并；不覆盖既有 extra 键，含 V1 键）。 */
export function buildRequestMetadataV2(request: GalGenerationRequestV2): Record<string, unknown> {
  return {
    [REQUEST_EXTRA_KEY_V2]: {
      schema: REQUEST_SCHEMA_V2,
      requestId: request.requestId,
      chatId: request.chatId,
      ownerCharacterId: request.ownerCharacterId,
      playerMessageId: request.playerMessageId ?? null,
      promptRevision: request.promptRevision,
      historyRevision: request.historyRevision,
      memoryRevision: request.memoryRevision,
      sceneId: request.sceneId,
      stateMessageIdBeforeGeneration: request.stateMessageIdBeforeGeneration,
      stateSwipeIdBeforeGeneration: request.stateSwipeIdBeforeGeneration,
      relevantCharacterIds: request.relevantCharacterIds,
      visitIdsByCharacter: request.visitIdsByCharacter,
      syntheticHistory: request.syntheticHistory,
      syntheticHistoryHash: request.syntheticHistoryHash,
      ...(request.promptRevision === GAL_PROMPT_REVISION ? {
        promptInjects: request.promptInjects?.map((item) => ({ ...item })),
        promptInjectsHash: request.promptInjectsHash,
      } : {}),
      contextFingerprint: request.contextFingerprint,
      visibleUserText: request.visibleUserText,
      modelUserInput: request.modelUserInput,
      attemptSeq: request.attemptSeq,
      createdAt: request.createdAt,
    },
  };
}

/** 解析 extra 中的 V2 request metadata（V1/V2 兼容读取；缺旧 metadata 返回明确错误码）。 */
export function parseRequestMetadataV2(extra: unknown): RequestMetadataV2ParseResult {
  if (extra === undefined || extra === null) return { ok: false, code: 'missing' };
  if (!isRecord(extra)) return { ok: false, code: 'malformed' };
  const value = extra[REQUEST_EXTRA_KEY_V2] ?? (isRecord(extra.extra) ? extra.extra[REQUEST_EXTRA_KEY_V2] : undefined);
  if (value === undefined || value === null) return { ok: false, code: 'missing' };
  if (!isRecord(value)) return { ok: false, code: 'malformed' };
  if (value.schema !== REQUEST_SCHEMA_V2) return { ok: false, code: 'schema-mismatch' };
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// V2 恢复（纯函数，不查宿主；从玩家楼层 metadata 重建完整冻结请求）
// ---------------------------------------------------------------------------

export type RestoreRequestV2Result =
  | { ok: true; request: GalGenerationRequestV2 }
  | { ok: false; code: 'missing' | 'malformed' | 'schema-mismatch' | 'incomplete' | 'invalid' };

const V2_REQUIRED_KEYS = [
  'requestId', 'chatId', 'ownerCharacterId', 'promptRevision', 'historyRevision',
  'memoryRevision', 'sceneId', 'stateMessageIdBeforeGeneration', 'stateSwipeIdBeforeGeneration',
  'relevantCharacterIds', 'visitIdsByCharacter', 'syntheticHistory', 'syntheticHistoryHash',
  'contextFingerprint', 'visibleUserText', 'modelUserInput', 'attemptSeq', 'createdAt',
] as const;
const V2_KNOWN_OPTIONAL_KEYS = ['playerMessageId', 'promptInjects', 'promptInjectsHash'] as const;

/**
 * 从玩家楼层 metadata 恢复完整 V2 请求。校验与构造器同构：
 * 非空 system-only history、非空相关角色、无重复角色、visit map 键集合一致、revision 合法。
 * recovery 必须复用这份冻结请求，绝不重读当前楼层/新状态重建（runbook §3.2）。
 */
export function restoreGalGenerationRequestV2(extra: unknown): RestoreRequestV2Result {
  const parsed = parseRequestMetadataV2(extra);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  for (const key of V2_REQUIRED_KEYS) {
    if (!(key in value)) return { ok: false, code: 'incomplete' };
  }
  if (value.historyRevision !== HISTORY_REVISION || value.memoryRevision !== MEMORY_REVISION) {
    return { ok: false, code: 'invalid' };
  }
  if (!Array.isArray(value.relevantCharacterIds)) {
    return { ok: false, code: 'invalid' };
  }
  const relevant: string[] = [];
  for (const id of value.relevantCharacterIds) {
    if (typeof id !== 'string' || relevant.includes(id)) return { ok: false, code: 'invalid' };
    relevant.push(id);
  }
  if (!isSystemOnlyHistory(value.syntheticHistory)) return { ok: false, code: 'invalid' };
  if (!visitMapKeysEqual(value.visitIdsByCharacter, relevant)) return { ok: false, code: 'invalid' };
  if (typeof value.syntheticHistoryHash !== 'string') return { ok: false, code: 'invalid' };
  if (value.promptRevision !== LEGACY_GAL_PROMPT_REVISION && value.promptRevision !== GAL_PROMPT_REVISION) {
    return { ok: false, code: 'invalid' };
  }
  if (value.promptRevision === GAL_PROMPT_REVISION) {
    if (!Array.isArray(value.promptInjects)
      || value.promptInjects.length !== 1
      || !isValidGalPromptInjection(value.promptInjects[0])
      || typeof value.promptInjectsHash !== 'string'
      || value.promptInjectsHash !== computeContextFingerprint(value.promptInjects[0].content)) {
      return { ok: false, code: 'invalid' };
    }
  } else if ('promptInjects' in value || 'promptInjectsHash' in value) {
    return { ok: false, code: 'invalid' };
  }
  // 未知字段 passthrough（field-ledger 策略：正式对象保留未知键，避免旧聊天被静默裁剪）
  const passthrough: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    // playerMessageId 是已知可选字段，由其显式反填逻辑负责，不进入 passthrough
    if ((V2_KNOWN_OPTIONAL_KEYS as readonly string[]).includes(key)) continue;
    if (!(V2_REQUIRED_KEYS as readonly string[]).includes(key)) passthrough[key] = entry;
  }
  return {
    ok: true,
    request: {
      schema: REQUEST_SCHEMA_V2,
      requestId: String(value.requestId),
      chatId: String(value.chatId),
      ownerCharacterId: String(value.ownerCharacterId),
      playerMessageId: typeof value.playerMessageId === 'number' ? value.playerMessageId : undefined,
      promptRevision: String(value.promptRevision),
      historyRevision: HISTORY_REVISION,
      memoryRevision: MEMORY_REVISION,
      sceneId: value.sceneId == null ? null : String(value.sceneId),
      stateMessageIdBeforeGeneration: value.stateMessageIdBeforeGeneration == null ? null : Number(value.stateMessageIdBeforeGeneration),
      stateSwipeIdBeforeGeneration: value.stateSwipeIdBeforeGeneration == null ? null : Number(value.stateSwipeIdBeforeGeneration),
      relevantCharacterIds: relevant,
      visitIdsByCharacter: isRecord(value.visitIdsByCharacter)
        ? Object.fromEntries(Object.entries(value.visitIdsByCharacter).map(([id, visitId]) => [
          id,
          typeof visitId === 'string' ? visitId : null,
        ]))
        : {},
      syntheticHistory: value.syntheticHistory.map((item) => ({ role: 'system' as const, content: String(item.content) })),
      syntheticHistoryHash: String(value.syntheticHistoryHash),
      ...(value.promptRevision === GAL_PROMPT_REVISION ? {
        promptInjects: (value.promptInjects as GalPromptInjection[]).map((item) => ({ ...item })),
        promptInjectsHash: String(value.promptInjectsHash),
      } : {}),
      contextFingerprint: String(value.contextFingerprint),
      visibleUserText: String(value.visibleUserText),
      modelUserInput: String(value.modelUserInput),
      attemptSeq: typeof value.attemptSeq === 'number' && value.attemptSeq >= 1 ? value.attemptSeq : 1,
      createdAt: String(value.createdAt),
      ...passthrough,
    },
  };
}

// ---------------------------------------------------------------------------
// V2 整合 builder（B2-T07）：resolve 角色 → freeze visit → 合成历史 → 冻结请求 + 指纹
// ---------------------------------------------------------------------------

import { freezeVisitIds, resolveRelevantCharacterIds } from './character-memory';
import { buildSyntheticHistory } from './synthetic-history';
import type { GardenState } from './types';

export interface GalGenerationRequestV2BuildInput {
  /** 玩家纯输入（未注入协议）。 */
  playerInput: string;
  /** 完整 GardenState（presence + visit_memory 来源；只读）。 */
  state: GardenState;
  /** 请求前聊天状态快照（chat/owner/floor/scene；不含 historyFingerprintInput 依赖）。 */
  snapshot: RequestChatSnapshot;
  /** 结构化角色上下文（runbook §3.4 优先级分层；presentCharacterIds 由本 builder 从 state 读取）。 */
  characterContext: {
    mainTargetCharacterId?: string | null;
    actionTargetCharacterId?: string | null;
    eventParticipants?: readonly string[];
    sessionParticipants?: readonly string[];
    requireMainTarget?: boolean;
  };
  /** 角色登记显示名（合成历史角色块用；缺省回退 characterId）。 */
  characterNames?: Record<string, string>;
  /** 只用于角色档案绿灯；其余注入内容由统一纯函数构造。 */
  explicitCharacterIds?: readonly string[];
  /** retry/regenerate 复用原 requestId；缺省时新建。 */
  requestId?: string;
  attemptSeq?: number;
  now?: number;
}

export type GalGenerationRequestV2BuildResult =
  | {
      ok: true;
      request: GalGenerationRequestV2;
      relevantCharacterIds: string[];
      visitIdsByCharacter: Record<string, string | null>;
    }
  | {
      ok: false;
      reason: 'empty-input' | 'missing-chat-identity' | 'missing-main-target' | 'empty-history' | 'non-system-history' | 'duplicate-character' | 'visit-map-mismatch' | 'unknown-revision' | 'invalid-injection';
    };

/** 稳定序列化：显式字段拼接，不依赖对象键偶然顺序（runbook §3.2 fingerprint 要求）。 */
function stableFingerprintFields(fields: ReadonlyArray<readonly [string, unknown]>): string {
  return fields.map(([key, value]) => `${key}=${JSON.stringify(value ?? null)}`).join('\u0000');
}

/**
 * V2 整合构造（B2-T07）：在玩家楼层创建前完成一次性请求快照。
 * 纯函数：不调用 generate、不写聊天、不读宿主；state 只读。
 * 步骤：resolve 角色 → freeze visit → synthetic history → 冻结 system inject →
 *       稳定指纹 → 冻结 V2 request。retry/recovery 复用同一冻结请求，不重算历史。
 */
export function buildGalGenerationRequestV2(input: GalGenerationRequestV2BuildInput): GalGenerationRequestV2BuildResult {
  const value = input.playerInput.trim();
  if (!value) return { ok: false, reason: 'empty-input' };
  if (!input.snapshot.ownerCharacterId || !input.snapshot.chatId) {
    return { ok: false, reason: 'missing-chat-identity' };
  }

  const present = presentCharacterIdsOf(input.state);
  const resolved = resolveRelevantCharacterIds({
    mainTargetCharacterId: input.characterContext.mainTargetCharacterId,
    actionTargetCharacterId: input.characterContext.actionTargetCharacterId,
    eventParticipants: input.characterContext.eventParticipants,
    sessionParticipants: input.characterContext.sessionParticipants,
    presentCharacterIds: present,
    requireMainTarget: input.characterContext.requireMainTarget ?? false,
  });
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  const visitIdsByCharacter = freezeVisitIds(input.state, resolved.characterIds);

  const history = buildSyntheticHistory({
    state: input.state,
    relevantCharacterIds: resolved.characterIds,
    visitIdsByCharacter,
    characterNames: input.characterNames,
  });

  const modelUserInput = sanitizeGalPlayerInput(value);
  if (!modelUserInput) return { ok: false, reason: 'empty-input' };
  const promptInjection = buildGalCurrentTurnInjection({
    state: input.state,
    explicitCharacterIds: input.explicitCharacterIds,
  });
  const promptInjects = [promptInjection];
  const promptInjectsHash = computeContextFingerprint(promptInjection.content);
  const visibleUserText = value;
  const syntheticHistoryHash = computeContextFingerprint(history.content);

  const fingerprint = computeContextFingerprint(stableFingerprintFields([
    ['chatId', input.snapshot.chatId],
    ['ownerCharacterId', input.snapshot.ownerCharacterId],
    ['stateMessageIdBeforeGeneration', input.snapshot.stateMessageIdBeforeGeneration],
    ['stateSwipeIdBeforeGeneration', input.snapshot.stateSwipeIdBeforeGeneration],
    ['sceneId', input.snapshot.sceneId],
    ['visibleUserText', visibleUserText],
    ['modelUserInputHash', computeContextFingerprint(modelUserInput)],
    ['relevantCharacterIds', resolved.characterIds],
    ['visitIdsByCharacter', visitIdsByCharacter],
    ['syntheticHistoryHash', syntheticHistoryHash],
    ['promptInjectsHash', promptInjectsHash],
    ['historyRevision', HISTORY_REVISION],
    ['memoryRevision', MEMORY_REVISION],
    ['promptRevision', CURRENT_PROMPT_REVISION],
  ]));

  const result = createGalGenerationRequestV2({
    playerInput: modelUserInput,
    visibleUserText,
    snapshot: {
      ...input.snapshot,
      relevantCharacterIds: resolved.characterIds,
      visitIdsByCharacter,
    },
    syntheticHistory: history.history,
    syntheticHistoryHash,
    promptRevision: CURRENT_PROMPT_REVISION,
    promptInjects,
    promptInjectsHash,
    contextFingerprint: fingerprint,
    requestId: input.requestId,
    attemptSeq: input.attemptSeq,
    now: input.now,
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  return {
    ok: true,
    request: result.request,
    relevantCharacterIds: resolved.characterIds,
    visitIdsByCharacter,
  };
}

/** 从 GardenState 读取当前在场集合（缺省补足层 5；无 presence 时为空数组）。 */
function presentCharacterIdsOf(state: GardenState): string[] {
  const ids = state?.presence_snapshot?.present_character_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}
