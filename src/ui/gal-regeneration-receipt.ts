// 第三批 B3-T05 —— receipt、fingerprint 与漂移检测。
//
// 合同：project/gal-character-memory-batch-3-regeneration-runbook.md §4.4、T05
//   - 项目稳定序列化 + FNV-1a 哈希（stableStringify + computeContextFingerprint），key 顺序无关；
//   - fingerprint 覆盖完整 MvuData（stat/display/delta/schema/initialized_lorebooks/unknown 全纳入——
//     裁定：UI-only 非正式字段也纳入，宁可保守拒绝，不静默丢状态；runbook §4.4"不得静默丢弃后置状态"）；
//   - drift decision：receipt 与当前 active data fingerprint 相等 → clean；
//     无 receipt → needs-legacy-replay；不相等 → post-settlement-drift；身份错配 → receipt-mismatch；
//   - 不自动合并差异；
//   - settlementKeys 排序稳定、去重。
// 禁止：读宿主、写楼层、调用 generate、记录完整私密正文（只存 fingerprint）。

import { computeContextFingerprint, type GalGenerationRequestV2 } from './gal-generation-request';
import { stableStringify } from './gal-generate-config';
import {
  GAL_REGENERATION_RECEIPT_SCHEMA_V1,
  type RegenerationCommitReceiptV1,
} from './gal-regeneration';

// ---------------------------------------------------------------------------
// fingerprint
// ---------------------------------------------------------------------------

/**
 * 稳定 fingerprint：key 排序 + FNV-1a。
 * 输入为完整 MvuData（含 stat/display/delta/schema/initialized_lorebooks/未知字段）。
 * 裁定：UI-only 非正式字段也纳入 fingerprint（fail-closed；差异宁可拒绝，不静默丢状态）。
 */
export function fingerprintMvuData(data: Record<string, unknown>): string {
  const normalized = structuredClone(data);
  delete normalized[GAL_REGENERATION_RECEIPT_DATA_KEY];
  return computeContextFingerprint(stableStringify(normalized));
}

/** Stored inside each settled swipe's MvuData. Excluded from its own fingerprint. */
export const GAL_REGENERATION_RECEIPT_DATA_KEY = 'gal_regeneration_receipt_v1' as const;

export function readRegenerationReceiptFromDataV1(data: unknown): RegenerationCommitReceiptV1 | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>)[GAL_REGENERATION_RECEIPT_DATA_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const receipt = value as Record<string, unknown>;
  if (receipt.schema !== GAL_REGENERATION_RECEIPT_SCHEMA_V1
    || typeof receipt.requestId !== 'string'
    || typeof receipt.attemptId !== 'string'
    || typeof receipt.commitKey !== 'string'
    || !Number.isInteger(receipt.assistantMessageId)
    || !Number.isInteger(receipt.assistantSwipeId)
    || typeof receipt.baselineDataFingerprint !== 'string'
    || typeof receipt.modelAppliedDataFingerprint !== 'string'
    || typeof receipt.finalizedDataFingerprint !== 'string'
    || !Array.isArray(receipt.settlementKeys)
    || !receipt.settlementKeys.every((key) => typeof key === 'string')) return null;
  return structuredClone(receipt) as unknown as RegenerationCommitReceiptV1;
}

/** settlementKeys 排序稳定 + 去重（receipt 写入前规范化）。 */
export function normalizeSettlementKeys(keys: readonly string[]): string[] {
  return [...new Set(keys)].sort();
}

// ---------------------------------------------------------------------------
// receipt 构造
// ---------------------------------------------------------------------------

export interface RegenerationCommitReceiptInputV1 {
  requestId: string;
  attemptId: string;
  commitKey: string;
  assistantMessageId: number;
  assistantSwipeId: number;
  baselineData: Record<string, unknown>;
  modelAppliedData: Record<string, unknown>;
  finalizedData: Record<string, unknown>;
  settlementKeys: string[];
}

/** 纯构造 receipt：三个阶段的 data 只存 fingerprint，不存正文；settlementKeys 规范化。 */
export function createRegenerationCommitReceiptV1(input: RegenerationCommitReceiptInputV1): RegenerationCommitReceiptV1 {
  return {
    schema: GAL_REGENERATION_RECEIPT_SCHEMA_V1,
    requestId: input.requestId,
    attemptId: input.attemptId,
    commitKey: input.commitKey,
    assistantMessageId: input.assistantMessageId,
    assistantSwipeId: input.assistantSwipeId,
    baselineDataFingerprint: fingerprintMvuData(input.baselineData),
    modelAppliedDataFingerprint: fingerprintMvuData(input.modelAppliedData),
    finalizedDataFingerprint: fingerprintMvuData(input.finalizedData),
    settlementKeys: normalizeSettlementKeys(input.settlementKeys),
  };
}

// ---------------------------------------------------------------------------
// 漂移检测（§4.4）
// ---------------------------------------------------------------------------

export interface RegenerationDriftIdentityV1 {
  requestId: string;
  attemptId: string;
  assistantMessageId: number;
  assistantSwipeId: number;
}

export type RegenerationDriftDecisionV1 =
  | { kind: 'clean' }
  | { kind: 'needs-legacy-replay' }
  | { kind: 'post-settlement-drift'; detail?: string }
  | { kind: 'receipt-mismatch'; code: 'request-mismatch' | 'attempt-mismatch' | 'message-mismatch' | 'swipe-mismatch' };

/**
 * 漂移决策（纯函数）：
 * - 无 receipt → needs-legacy-replay（调用方决定是否用 replay engine 补 receipt，本模块不自动补）；
 * - receipt 身份与目标错配 → receipt-mismatch（fail closed，拒绝）；
 * - receipt.finalizedDataFingerprint === 当前 active data fingerprint → clean；
 * - 不等 → post-settlement-drift（不自动合并差异）。
 */
export function decideRegenerationDriftV1(input: {
  receipt: RegenerationCommitReceiptV1 | null;
  identity: RegenerationDriftIdentityV1;
  currentActiveDataFingerprint: string;
}): RegenerationDriftDecisionV1 {
  const { receipt, identity } = input;
  if (receipt === null) return { kind: 'needs-legacy-replay' };
  if (receipt.requestId !== identity.requestId) return { kind: 'receipt-mismatch', code: 'request-mismatch' };
  if (receipt.attemptId !== identity.attemptId) return { kind: 'receipt-mismatch', code: 'attempt-mismatch' };
  if (receipt.assistantMessageId !== identity.assistantMessageId) return { kind: 'receipt-mismatch', code: 'message-mismatch' };
  if (receipt.assistantSwipeId !== identity.assistantSwipeId) return { kind: 'receipt-mismatch', code: 'swipe-mismatch' };
  if (receipt.finalizedDataFingerprint === input.currentActiveDataFingerprint) return { kind: 'clean' };
  return { kind: 'post-settlement-drift', detail: 'active data 与 final receipt 不一致（含后置本地操作或未知漂移）' };
}

// ---------------------------------------------------------------------------
// 便利：给定 frozen request + 目标身份构造 drift identity
// ---------------------------------------------------------------------------

export function driftIdentityForTargetV1(input: {
  request: GalGenerationRequestV2;
  attemptId: string;
  assistantMessageId: number;
  assistantSwipeId: number;
}): RegenerationDriftIdentityV1 {
  return {
    requestId: input.request.requestId,
    attemptId: input.attemptId,
    assistantMessageId: input.assistantMessageId,
    assistantSwipeId: input.assistantSwipeId,
  };
}
