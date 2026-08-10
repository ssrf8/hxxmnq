// 第三批 B3-T01 —— 重生成同构：纯类型、错误码与不变量。
//
// 当前合同：project/contract.md（重生成同构与提交身份）。
//   - §5.1 GalRegenerationTargetV1（target 身份与 frozen request）；
//   - §4.4 RegenerationCommitReceiptV1（commit 收据与漂移检测输入）；
//   - §7.2 SwipeAppendPlanV1（指定 assistant 楼层 swipe 追加 plan）与身份/数组结构校验；
//   - §5.3 状态机阶段类型（idle → … → settled，含 failed/stopping/conflict_manual）。
// 职责边界：
//   - 纯类型与版本化 schema；
//   - parser：保留未知字段，非法输入 fail closed，不静默裁剪旧聊天数据；
//   - 业务错误码联合类型（15 个，runbook §5.2 最少错误码）。
// 禁止：调用 generate、写聊天、等待事件、操作 DOM、读取宿主状态。
// 本文件不接宿主；swipe 写后深验证与构造在 B3-T07，生产 adapter 在 B3-T09（O01～O04 之后）。

import {
  computeContextFingerprint,
  HISTORY_REVISION,
  MEMORY_REVISION,
  REQUEST_SCHEMA_V2,
} from './gal-generation-request';
import {
  galPromptInjectsFingerprintInput,
  isSupportedGalPromptRevision,
  isValidGalPromptInjectsForRevision,
  LEGACY_GAL_PROMPT_REVISION,
} from './gal-prompt-injection';

// ---------------------------------------------------------------------------
// 版本化 schema
// ---------------------------------------------------------------------------

export const GAL_REGENERATION_TARGET_SCHEMA_V1 = 'gal-regeneration-target.v1' as const;
export const GAL_REGENERATION_RECEIPT_SCHEMA_V1 = 'gal-regeneration-commit-receipt.v1' as const;
export const GAL_REGENERATION_SWIPE_PLAN_SCHEMA_V1 = 'gal-regeneration-swipe-plan.v1' as const;

// ---------------------------------------------------------------------------
// 业务错误码（runbook §5.2 最少错误码，15 个）
// ---------------------------------------------------------------------------

export type GalRegenerationErrorCode =
  | 'not-latest-assistant'
  | 'legacy-request-unsupported'
  | 'request-conflict'
  | 'chat-identity-changed'
  | 'invalid-source-swipe'
  | 'malformed-swipe-arrays'
  | 'attempt-sequence-conflict'
  | 'baseline-not-found'
  | 'baseline-swipe-not-found'
  | 'post-settlement-drift'
  | 'legacy-replay-mismatch'
  | 'target-changed'
  | 'unexpected-floor-created'
  | 'candidate-write-conflict'
  | 'candidate-verification-failed';

/** 错误码 → 人类可读诊断（生产 UI 可显示，不夸大语义）。 */
export const GAL_REGENERATION_ERROR_LABELS: Record<GalRegenerationErrorCode, string> = {
  'not-latest-assistant': '目标 assistant 不是聊天最后一楼',
  'legacy-request-unsupported': '旧 V2 之前的回复不支持同构重生成',
  'request-conflict': 'request 身份冲突（重复/损坏 metadata）',
  'chat-identity-changed': 'chat/owner 身份已变化',
  'invalid-source-swipe': '源 swipe 非法（越界/与候选相同）',
  'malformed-swipe-arrays': 'swipe 四数组长度不一致或形状损坏',
  'attempt-sequence-conflict': 'attempt 序号冲突',
  'baseline-not-found': '冻结基线 message 楼层不存在',
  'baseline-swipe-not-found': '冻结基线 swipe data 不存在',
  'post-settlement-drift': '回复结算后本地状态漂移，拒绝重生成',
  'legacy-replay-mismatch': '旧回复无法按同构规则重放',
  'target-changed': '目标在候选生成期间被改动',
  'unexpected-floor-created': '候选生成期间出现未预期楼层',
  'candidate-write-conflict': '候选写入冲突（位置/指纹/数组变化）',
  'candidate-verification-failed': '候选写后验证失败',
};

// ---------------------------------------------------------------------------
// 状态机阶段（runbook §5.3）
// ---------------------------------------------------------------------------

export type GalRegenerationPhase =
  | 'idle'
  | 'locating'
  | 'generating_candidate'
  | 'candidate_ready'
  | 'rebuilding_state'
  | 'committing_swipe'
  | 'verifying'
  | 'settled'
  | 'stopping'
  | 'failed_recoverable'
  | 'conflict_manual';

export const GAL_REGENERATION_PHASES: readonly GalRegenerationPhase[] = [
  'idle',
  'locating',
  'generating_candidate',
  'candidate_ready',
  'rebuilding_state',
  'committing_swipe',
  'verifying',
  'settled',
  'stopping',
  'failed_recoverable',
  'conflict_manual',
];

// ---------------------------------------------------------------------------
// §5.1 重生成目标
// ---------------------------------------------------------------------------

export interface GalRegenerationTargetV1 {
  schema: typeof GAL_REGENERATION_TARGET_SCHEMA_V1;
  chatId: string;
  ownerCharacterId: string;
  requestId: string;
  playerMessageId: number;
  assistantMessageId: number;
  sourceSwipeId: number;
  /** 首版只能等于目标 assistant 的 swipes.length；不得覆盖已有下标。 */
  candidateSwipeId: number;
  sourceAttemptId: string;
  sourceCommitKey: string;
  arraysFingerprint: string;
  originalRequest: import('./gal-generation-request').GalGenerationRequestV2;
}

/** parse 上下文：提供目标 assistant 的四数组长度时执行越界/尾部校验。 */
export interface GalRegenerationTargetParseContextV1 {
  swipeArrayLength?: number;
}

export type GalRegenerationTargetParseResult =
  | { ok: true; target: GalRegenerationTargetV1 }
  | { ok: false; code: 'missing' | 'malformed' | 'schema-mismatch' | 'incomplete' | 'invalid' | 'invalid-original-request' | 'source-swipe-out-of-range' | 'candidate-not-tail' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

// V2 请求在 target 内的必填键（含 playerMessageId 可选；schema 单独校验）。
const TARGET_V2_REQUIRED_KEYS = [
  'requestId', 'chatId', 'ownerCharacterId', 'promptRevision', 'historyRevision',
  'memoryRevision', 'sceneId', 'stateMessageIdBeforeGeneration', 'stateSwipeIdBeforeGeneration',
  'relevantCharacterIds', 'visitIdsByCharacter', 'syntheticHistory', 'syntheticHistoryHash',
  'contextFingerprint', 'visibleUserText', 'modelUserInput', 'attemptSeq', 'createdAt',
] as const;

function isFrozenV2RequestShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (value.schema !== REQUEST_SCHEMA_V2) return false;
  for (const key of TARGET_V2_REQUIRED_KEYS) {
    if (!(key in value)) return false;
  }
  if (!isNonEmptyString(value.requestId)) return false;
  if (!isNonEmptyString(value.chatId)) return false;
  if (!isNonEmptyString(value.ownerCharacterId)) return false;
  if (!isSupportedGalPromptRevision(value.promptRevision)) return false;
  if (value.historyRevision !== HISTORY_REVISION || value.memoryRevision !== MEMORY_REVISION) return false;
  if (value.sceneId !== null && typeof value.sceneId !== 'string') return false;
  if (value.stateMessageIdBeforeGeneration !== null && !isNonNegativeInt(value.stateMessageIdBeforeGeneration)) return false;
  if (value.stateSwipeIdBeforeGeneration !== null && !isNonNegativeInt(value.stateSwipeIdBeforeGeneration)) return false;
  if ((value.stateMessageIdBeforeGeneration === null) !== (value.stateSwipeIdBeforeGeneration === null)) return false;
  if (!Array.isArray(value.relevantCharacterIds) || value.relevantCharacterIds.length > 4) return false;
  if (!value.relevantCharacterIds.every((id) => isNonEmptyString(id))) return false;
  const relevantCharacterIds = value.relevantCharacterIds as string[];
  if (new Set(relevantCharacterIds).size !== relevantCharacterIds.length) return false;
  if (!isRecord(value.visitIdsByCharacter)) return false;
  const visitKeys = Object.keys(value.visitIdsByCharacter);
  if (visitKeys.length !== relevantCharacterIds.length
    || !visitKeys.every((id) => relevantCharacterIds.includes(id))) return false;
  if (!Object.values(value.visitIdsByCharacter).every((id) => id === null || isNonEmptyString(id))) return false;
  if (!Array.isArray(value.syntheticHistory)) return false;
  if (!value.syntheticHistory.every((item) => isRecord(item) && item.role === 'system' && typeof item.content === 'string')) {
    return false;
  }
  if (!isNonEmptyString(value.syntheticHistoryHash)) return false;
  if (!isValidGalPromptInjectsForRevision(value.promptRevision, value.promptInjects)) return false;
  if (value.promptRevision !== LEGACY_GAL_PROMPT_REVISION) {
    if (!isNonEmptyString(value.promptInjectsHash)
      || value.promptInjectsHash !== computeContextFingerprint(
        galPromptInjectsFingerprintInput(value.promptRevision, value.promptInjects),
      )) return false;
  } else if ('promptInjectsHash' in value) return false;
  if (!isNonEmptyString(value.contextFingerprint)) return false;
  if (typeof value.visibleUserText !== 'string') return false;
  if (typeof value.modelUserInput !== 'string') return false;
  if (!isPositiveInt(value.attemptSeq)) return false;
  if (!isNonEmptyString(value.createdAt) || Number.isNaN(Date.parse(value.createdAt))) return false;
  if (value.playerMessageId !== undefined && !isNonNegativeInt(value.playerMessageId)) return false;
  return true;
}

/** 保留未知字段：返回不在已知键集合内的条目（不深拷贝值，值由调用方冻结）。 */
function unknownFieldsOf(record: Record<string, unknown>, knownKeys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (!(knownKeys as readonly string[]).includes(key)) out[key] = entry;
  }
  return out;
}

/**
 * 解析并校验重生成目标。非法输入 fail closed：
 * - 未提供 swipeArrayLength 时只做基础类型校验；提供时强制 source 在数组内、candidate 等于数组长度（尾部）。
 * - 未知字段保留（target 级与 originalRequest 级各自 passthrough）。
 */
export function parseGalRegenerationTargetV1(
  value: unknown,
  context: GalRegenerationTargetParseContextV1 = {},
): GalRegenerationTargetParseResult {
  if (value === undefined || value === null) return { ok: false, code: 'missing' };
  if (!isRecord(value)) return { ok: false, code: 'malformed' };
  if (value.schema !== GAL_REGENERATION_TARGET_SCHEMA_V1) return { ok: false, code: 'schema-mismatch' };

  const required = ['chatId', 'ownerCharacterId', 'requestId', 'sourceAttemptId', 'sourceCommitKey', 'arraysFingerprint'] as const;
  for (const key of required) {
    if (!(key in value)) return { ok: false, code: 'incomplete' };
  }
  if (!isNonEmptyString(value.chatId)) return { ok: false, code: 'invalid' };
  if (!isNonEmptyString(value.ownerCharacterId)) return { ok: false, code: 'invalid' };
  if (!isNonEmptyString(value.requestId)) return { ok: false, code: 'invalid' };
  if (!isNonEmptyString(value.sourceAttemptId)) return { ok: false, code: 'invalid' };
  if (!isNonEmptyString(value.sourceCommitKey)) return { ok: false, code: 'invalid' };
  if (!isNonEmptyString(value.arraysFingerprint)) return { ok: false, code: 'invalid' };
  if (!isPositiveInt(value.playerMessageId)) return { ok: false, code: 'invalid' };
  if (!isPositiveInt(value.assistantMessageId)) return { ok: false, code: 'invalid' };
  if (!isNonNegativeInt(value.sourceSwipeId)) return { ok: false, code: 'invalid' };
  if (!isNonNegativeInt(value.candidateSwipeId)) return { ok: false, code: 'invalid' };
  if (!isFrozenV2RequestShape(value.originalRequest)) return { ok: false, code: 'invalid-original-request' };

  const swipeArrayLength = context.swipeArrayLength;
  if (swipeArrayLength !== undefined) {
    if (value.sourceSwipeId >= swipeArrayLength) return { ok: false, code: 'source-swipe-out-of-range' };
    if (value.candidateSwipeId !== swipeArrayLength) return { ok: false, code: 'candidate-not-tail' };
    if (value.sourceSwipeId === value.candidateSwipeId) return { ok: false, code: 'invalid' };
  }

  const originalRaw = structuredClone(value.originalRequest);
  if (originalRaw.requestId !== value.requestId
    || originalRaw.chatId !== value.chatId
    || originalRaw.ownerCharacterId !== value.ownerCharacterId
    || (originalRaw.playerMessageId !== undefined && originalRaw.playerMessageId !== value.playerMessageId)) {
    return { ok: false, code: 'invalid-original-request' };
  }
  const target: GalRegenerationTargetV1 = {
    schema: GAL_REGENERATION_TARGET_SCHEMA_V1,
    chatId: String(value.chatId),
    ownerCharacterId: String(value.ownerCharacterId),
    requestId: String(value.requestId),
    playerMessageId: Number(value.playerMessageId),
    assistantMessageId: Number(value.assistantMessageId),
    sourceSwipeId: Number(value.sourceSwipeId),
    candidateSwipeId: Number(value.candidateSwipeId),
    sourceAttemptId: String(value.sourceAttemptId),
    sourceCommitKey: String(value.sourceCommitKey),
    arraysFingerprint: String(value.arraysFingerprint),
    originalRequest: originalRaw as unknown as GalRegenerationTargetV1['originalRequest'],
    ...unknownFieldsOf(value, ['schema', 'chatId', 'ownerCharacterId', 'requestId', 'playerMessageId', 'assistantMessageId', 'sourceSwipeId', 'candidateSwipeId', 'sourceAttemptId', 'sourceCommitKey', 'arraysFingerprint', 'originalRequest']),
  };
  return { ok: true, target };
}

// ---------------------------------------------------------------------------
// §4.4 重生成 commit 收据
// ---------------------------------------------------------------------------

export interface RegenerationCommitReceiptV1 {
  schema: typeof GAL_REGENERATION_RECEIPT_SCHEMA_V1;
  requestId: string;
  attemptId: string;
  commitKey: string;
  assistantMessageId: number;
  assistantSwipeId: number;
  baselineDataFingerprint: string;
  modelAppliedDataFingerprint: string;
  finalizedDataFingerprint: string;
  settlementKeys: string[];
}

export type GalRegenerationReceiptParseResult =
  | { ok: true; receipt: RegenerationCommitReceiptV1 }
  | { ok: false; code: 'missing' | 'malformed' | 'schema-mismatch' | 'incomplete' | 'invalid' };

const RECEIPT_REQUIRED_KEYS = [
  'requestId', 'attemptId', 'commitKey', 'assistantMessageId', 'assistantSwipeId',
  'baselineDataFingerprint', 'modelAppliedDataFingerprint', 'finalizedDataFingerprint', 'settlementKeys',
] as const;

/** 解析并校验 commit 收据；未知字段保留。 */
export function parseRegenerationCommitReceiptV1(value: unknown): GalRegenerationReceiptParseResult {
  if (value === undefined || value === null) return { ok: false, code: 'missing' };
  if (!isRecord(value)) return { ok: false, code: 'malformed' };
  if (value.schema !== GAL_REGENERATION_RECEIPT_SCHEMA_V1) return { ok: false, code: 'schema-mismatch' };
  for (const key of RECEIPT_REQUIRED_KEYS) {
    if (!(key in value)) return { ok: false, code: 'incomplete' };
  }
  if (!isNonEmptyString(value.requestId)) return { ok: false, code: 'invalid' };
  if (!isNonEmptyString(value.attemptId)) return { ok: false, code: 'invalid' };
  if (!isNonEmptyString(value.commitKey)) return { ok: false, code: 'invalid' };
  if (!isPositiveInt(value.assistantMessageId)) return { ok: false, code: 'invalid' };
  if (!isNonNegativeInt(value.assistantSwipeId)) return { ok: false, code: 'invalid' };
  if (!isNonEmptyString(value.baselineDataFingerprint)) return { ok: false, code: 'invalid' };
  if (!isNonEmptyString(value.modelAppliedDataFingerprint)) return { ok: false, code: 'invalid' };
  if (!isNonEmptyString(value.finalizedDataFingerprint)) return { ok: false, code: 'invalid' };
  if (!Array.isArray(value.settlementKeys)) return { ok: false, code: 'invalid' };
  if (!value.settlementKeys.every((key) => typeof key === 'string')) return { ok: false, code: 'invalid' };

  const receipt: RegenerationCommitReceiptV1 = {
    schema: GAL_REGENERATION_RECEIPT_SCHEMA_V1,
    requestId: String(value.requestId),
    attemptId: String(value.attemptId),
    commitKey: String(value.commitKey),
    assistantMessageId: Number(value.assistantMessageId),
    assistantSwipeId: Number(value.assistantSwipeId),
    baselineDataFingerprint: String(value.baselineDataFingerprint),
    modelAppliedDataFingerprint: String(value.modelAppliedDataFingerprint),
    finalizedDataFingerprint: String(value.finalizedDataFingerprint),
    settlementKeys: value.settlementKeys.map((key) => String(key)),
    ...unknownFieldsOf(value, [...RECEIPT_REQUIRED_KEYS, 'schema']),
  };
  return { ok: true, receipt };
}

// ---------------------------------------------------------------------------
// §7.2 指定 swipe 提交 plan（类型 + 身份/数组结构校验；构造与写后深验证在 T07）
// ---------------------------------------------------------------------------

export interface SwipeAppendPlanV1 {
  messageId: number;
  expectedBeforeFingerprint: string;
  sourceSwipeId: number;
  candidateSwipeId: number;
  swipes: string[];
  swipes_data: Record<string, unknown>[];
  swipes_info: Record<string, unknown>[];
  swipe_id: number;
}

/** 校验上下文：写前/写后观察到的宿主视图（不含正文内容比较，正文深比较在 T07）。 */
export interface SwipeAppendPlanValidationContextV1 {
  expectedMessageId: number;
  /** 写前四数组长度（source swipe 集合大小）。 */
  beforeSwipeCount: number;
  /** 写后四数组长度（应为 before+1）。 */
  afterSwipeCount: number;
}

export type SwipeAppendPlanValidationResult =
  | { ok: true }
  | { ok: false; code: GalRegenerationErrorCode; detail?: string };

/**
 * swipe plan 身份与数组结构校验（纯函数）：
 * - messageId 必须等于目标；
 * - 四数组内部长度必须一致（不一致 → malformed-swipe-arrays）；
 * - 写后数组必须恰好比写前多 1（多增/未增 → malformed-swipe-arrays）；
 * - source 必须在写前数组内且不同于 candidate（否则 invalid-source-swipe）；
 * - candidate 必须是写前数组长度（尾部追加），且写后数组内存在（否则 candidate-write-conflict）；
 * - swipe_id 必须指向 candidate。
 * 本校验不比较正文/数据的深内容（T07 负责），只锁定身份与数组形状。
 */
export function validateSwipeAppendPlanV1(
  plan: SwipeAppendPlanV1,
  context: SwipeAppendPlanValidationContextV1,
): SwipeAppendPlanValidationResult {
  if (plan.messageId !== context.expectedMessageId) {
    return { ok: false, code: 'target-changed', detail: `messageId ${plan.messageId} !== expected ${context.expectedMessageId}` };
  }
  if (
    plan.swipes.length !== plan.swipes_data.length
    || plan.swipes.length !== plan.swipes_info.length
    || plan.swipes_data.length !== plan.swipes_info.length
  ) {
    return { ok: false, code: 'malformed-swipe-arrays', detail: 'swipes/swipes_data/swipes_info 长度不一致' };
  }
  if (context.afterSwipeCount !== context.beforeSwipeCount + 1) {
    return { ok: false, code: 'malformed-swipe-arrays', detail: `after ${context.afterSwipeCount} !== before ${context.beforeSwipeCount} + 1` };
  }
  if (plan.sourceSwipeId < 0 || plan.sourceSwipeId >= context.beforeSwipeCount) {
    return { ok: false, code: 'invalid-source-swipe', detail: `sourceSwipeId ${plan.sourceSwipeId} 越界 before=${context.beforeSwipeCount}` };
  }
  if (plan.sourceSwipeId === plan.candidateSwipeId) {
    return { ok: false, code: 'invalid-source-swipe', detail: 'source 与 candidate 相同' };
  }
  if (plan.candidateSwipeId !== context.beforeSwipeCount) {
    return { ok: false, code: 'candidate-write-conflict', detail: `candidate ${plan.candidateSwipeId} 不是尾部 ${context.beforeSwipeCount}` };
  }
  if (plan.candidateSwipeId >= context.afterSwipeCount) {
    return { ok: false, code: 'candidate-write-conflict', detail: `candidate ${plan.candidateSwipeId} 不在写后数组 after=${context.afterSwipeCount}` };
  }
  if (plan.swipe_id !== plan.candidateSwipeId) {
    return { ok: false, code: 'candidate-write-conflict', detail: `swipe_id ${plan.swipe_id} !== candidate ${plan.candidateSwipeId}` };
  }
  if (plan.expectedBeforeFingerprint.length === 0) {
    return { ok: false, code: 'candidate-write-conflict', detail: 'expectedBeforeFingerprint 为空' };
  }
  return { ok: true };
}
