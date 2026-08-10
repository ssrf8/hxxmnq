// 第三批 B3-T07 —— swipe append plan 构造与精确验证器。
//
// 当前合同：project/contract.md（swipe 追加与精确复读）。
//   - §7.1 写前快照：message_id/swipe_id/四数组/长度/未知字段/整体稳定 fingerprint；
//   - §7.2 候选 patch：旧数组逐元素保留、尾部追加、swipes_data[candidate]=候选 MvuData、
//     swipes_info[candidate].extra=attempt metadata、swipe_id=candidate、不删不改旧项；
//   - §7.3 写前硬门：重新读目标，fingerprint 仍等于 expectedBeforeFingerprint 才允许写；
//     写后硬门：楼层数不变、assistant message ID 不变、四数组只增 1、active=候选、
//     active text/metadata=候选、active data lifecycle settled、旧项逐字节未变；任意不符不得 settled；
//   - §7.4 竞态：chat/owner 变化、目标不再是最后一楼、source 切换、四数组变化、新楼层出现 → 放弃提交。
// 本模块是纯函数：不写宿主；写后"再读宿主 MVU"由生产 adapter（T09，O01 后）负责。
// 禁止：读宿主、写楼层、调用 generate、自动合并竞态。

import { computeContextFingerprint, ATTEMPT_EXTRA_KEY } from './gal-generation-request';
import { COMMIT_LIFECYCLE_KEY, parseAttemptMetadata } from './gal-generation-request';
import { stableStringify } from './gal-generate-config';
import { validateSwipeAppendPlanV1, type GalRegenerationErrorCode, type SwipeAppendPlanV1 } from './gal-regeneration';
import type { GalRegenerationSwipeArraysViewV1 } from './gal-regeneration-locator';
import type { ReplayVisitTurnCommitV1 } from './gal-regeneration-replay';

const KNOWN_VIEW_KEYS = ['message_id', 'swipe_id', 'swipes', 'swipes_data', 'swipes_info'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/** 稳定深比较（key 顺序无关）。 */
function stableEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** 未知字段（视图里不在已知键集合内的条目）。 */
function unknownFieldsOf(view: GalRegenerationSwipeArraysViewV1): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(view)) {
    if (!(KNOWN_VIEW_KEYS as readonly string[]).includes(key)) out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// §7.1 写前快照与四数组指纹
// ---------------------------------------------------------------------------

export interface SwipeArraysSnapshotV1 {
  messageId: number;
  swipeId: number;
  swipes: string[];
  swipes_data: Record<string, unknown>[];
  swipes_info: Record<string, unknown>[];
  /** 未知字段（view 内非四数组/message/swipe 字段）。 */
  unknownFields: Record<string, unknown>;
  /** 整体稳定 fingerprint（四数组 + message_id + swipe_id + unknown）。 */
  arraysFingerprint: string;
}

export type SwipeArraysSnapshotResultV1 =
  | { ok: true; snapshot: SwipeArraysSnapshotV1 }
  | { ok: false; code: GalRegenerationErrorCode; detail?: string };

/** 四数组整体稳定 fingerprint（含未知字段与 message/swipe id）。 */
export function fingerprintSwipeArraysV1(view: GalRegenerationSwipeArraysViewV1): string {
  return computeContextFingerprint(stableStringify({
    message_id: view.message_id,
    swipe_id: view.swipe_id,
    swipes: view.swipes,
    swipes_data: view.swipes_data,
    swipes_info: view.swipes_info,
    ...unknownFieldsOf(view),
  }));
}

/**
 * 捕获写前快照（§7.1）。四数组长度不一致 → malformed-swipe-arrays；
 * message_id/swipe_id 缺失或非法 → target-changed / invalid-source-swipe。
 */
export function captureSwipeArraysSnapshotV1(view: GalRegenerationSwipeArraysViewV1): SwipeArraysSnapshotResultV1 {
  if (!Array.isArray(view.swipes) || !Array.isArray(view.swipes_data) || !Array.isArray(view.swipes_info)) {
    return { ok: false, code: 'malformed-swipe-arrays', detail: 'swipes/swipes_data/swipes_info 缺失' };
  }
  if (view.swipes_data.length !== view.swipes.length || view.swipes_info.length !== view.swipes.length) {
    return { ok: false, code: 'malformed-swipe-arrays', detail: '四数组长度不一致' };
  }
  if (!view.swipes.every((item) => typeof item === 'string')
    || !view.swipes_data.every(isRecord)
    || !view.swipes_info.every(isRecord)) {
    return { ok: false, code: 'malformed-swipe-arrays', detail: 'swipe 正文/data/info 含非法元素' };
  }
  const messageId = toInt(view.message_id);
  if (messageId === null) return { ok: false, code: 'target-changed', detail: 'message_id 非法' };
  const swipeId = toInt(view.swipe_id);
  if (swipeId === null || swipeId < 0 || swipeId >= view.swipes.length) {
    return { ok: false, code: 'invalid-source-swipe', detail: `swipe_id ${String(view.swipe_id)} 越界` };
  }
  return {
    ok: true,
    snapshot: {
      messageId,
      swipeId,
      swipes: structuredClone(view.swipes),
      swipes_data: structuredClone(view.swipes_data),
      swipes_info: structuredClone(view.swipes_info),
      unknownFields: structuredClone(unknownFieldsOf(view)),
      arraysFingerprint: fingerprintSwipeArraysV1(view),
    },
  };
}

// ---------------------------------------------------------------------------
// §7.2 候选 patch 构造
// ---------------------------------------------------------------------------

export interface BuildSwipeAppendPlanInputV1 {
  snapshot: SwipeArraysSnapshotV1;
  candidateText: string;
  candidateData: Record<string, unknown>;
  /** attempt metadata（buildAttemptMetadata 输出形状；写入 swipe_info[candidate].extra）。 */
  candidateAttemptMetadata: Record<string, unknown>;
}

export type BuildSwipeAppendPlanResultV1 =
  | { ok: true; plan: SwipeAppendPlanV1 }
  | { ok: false; code: GalRegenerationErrorCode; detail?: string };

/**
 * 构造写后数组 plan（§7.2）：
 * - 旧数组逐元素保留（引用/值都不变）；
 * - 尾部追加一项；candidateSwipeId = 旧长度；swipe_id = candidate；
 * - swipes[candidate] = 候选正文；swipes_data[candidate] = 候选 MvuData；
 * - swipes_info[candidate] = { extra: candidateAttemptMetadata }（宿主系统字段写时补，写后按子集校验）；
 * - expectedBeforeFingerprint = 写前快照指纹。
 */
export function buildSwipeAppendPlanV1(input: BuildSwipeAppendPlanInputV1): BuildSwipeAppendPlanResultV1 {
  const { snapshot } = input;
  if (snapshot.swipes.length !== snapshot.swipes_data.length || snapshot.swipes.length !== snapshot.swipes_info.length) {
    return { ok: false, code: 'malformed-swipe-arrays', detail: '快照四数组长度不一致' };
  }
  const candidateSwipeId = snapshot.swipes.length;
  const plan: SwipeAppendPlanV1 = {
    messageId: snapshot.messageId,
    expectedBeforeFingerprint: snapshot.arraysFingerprint,
    sourceSwipeId: snapshot.swipeId,
    candidateSwipeId,
    swipes: [...snapshot.swipes, input.candidateText],
    swipes_data: [...snapshot.swipes_data, input.candidateData],
    swipes_info: [...snapshot.swipes_info, { extra: input.candidateAttemptMetadata }],
    swipe_id: candidateSwipeId,
  };
  return { ok: true, plan };
}

// ---------------------------------------------------------------------------
// §7.3/§7.4 写前硬门
// ---------------------------------------------------------------------------

export interface SwipeWriteBeforeCheckInputV1 {
  plan: SwipeAppendPlanV1;
  /** 写前重新读取的目标 all-swipes 视图（§7.3 写前必须重新读）。 */
  currentView: GalRegenerationSwipeArraysViewV1;
  /** 写前重新读取的 active-page 消息（最后一楼必须是目标）。 */
  currentMessages: ReadonlyArray<{ role?: string; is_user?: boolean; is_system?: boolean; message_id?: unknown }>;
  /** 定位时（T03）的消息总数；新楼层出现 → 竞态。 */
  expectedMessageTotal: number;
  /** 定位时的 chat/owner；与当前不一致 → 竞态。 */
  expectedChatId: string;
  expectedOwnerCharacterId: string;
  currentChatId: string;
  currentOwnerCharacterId: string;
}

export type SwipeWriteBeforeCheckResultV1 =
  | { ok: true }
  | { ok: false; code: GalRegenerationErrorCode; detail?: string };

/**
 * 写前硬门（§7.3 写前重新读一次 + §7.4 竞态清单）：
 * - chat/owner 变化 → chat-identity-changed；
 * - 消息总数变化（新楼层出现）→ unexpected-floor-created；
 * - 目标不再是最后一楼 → not-latest-assistant / target-changed；
 * - source 越界或数组损坏 → invalid-source-swipe / malformed-swipe-arrays；
 * - fingerprint 变化（四数组/source 切换/未知字段）→ target-changed。
 * 不自动合并竞态。
 */
export function verifySwipeWriteBeforeV1(input: SwipeWriteBeforeCheckInputV1): SwipeWriteBeforeCheckResultV1 {
  const { plan, currentView, currentMessages } = input;
  if (input.currentChatId !== input.expectedChatId || input.currentOwnerCharacterId !== input.expectedOwnerCharacterId) {
    return { ok: false, code: 'chat-identity-changed', detail: 'chat/owner 在候选生成期间变化' };
  }
  if (currentMessages.length !== input.expectedMessageTotal) {
    return { ok: false, code: 'unexpected-floor-created', detail: `消息总数 ${currentMessages.length} !== 定位时 ${input.expectedMessageTotal}` };
  }
  const latest = currentMessages.at(-1);
  if (!latest || latest.role !== 'assistant' || latest.is_user === true || latest.is_system === true) {
    return { ok: false, code: 'not-latest-assistant', detail: '目标不再是最后一楼' };
  }
  if (toInt(latest.message_id) !== plan.messageId) {
    return { ok: false, code: 'target-changed', detail: `最后一楼 ${String(latest.message_id)} !== 目标 ${plan.messageId}` };
  }
  if (!Array.isArray(currentView.swipes) || !Array.isArray(currentView.swipes_data) || !Array.isArray(currentView.swipes_info)) {
    return { ok: false, code: 'malformed-swipe-arrays', detail: '写前重读数组缺失' };
  }
  if (plan.sourceSwipeId < 0 || plan.sourceSwipeId >= currentView.swipes.length) {
    return { ok: false, code: 'invalid-source-swipe', detail: `source ${plan.sourceSwipeId} 越界 count=${currentView.swipes.length}` };
  }
  if (fingerprintSwipeArraysV1(currentView) !== plan.expectedBeforeFingerprint) {
    return { ok: false, code: 'target-changed', detail: '写前 fingerprint 与快照不一致（source 切换/数组变化/未知字段变化）' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// §7.3 写后硬门
// ---------------------------------------------------------------------------

export interface SwipeWriteAfterCheckInputV1 {
  plan: SwipeAppendPlanV1;
  /** include_swipes:true 全数组视图。 */
  afterView: GalRegenerationSwipeArraysViewV1;
  /** include_swipes:false active-page 视图。 */
  activeView: {
    message_id?: unknown;
    swipe_id?: unknown;
    message?: unknown;
    extra?: unknown;
  };
  /** 期望的 candidate MvuData（replay 输出）。 */
  candidateData: Record<string, unknown>;
  /** 期望的 candidate attempt metadata。 */
  candidateAttemptMetadata: Record<string, unknown>;
  /** 期望的 VisitTurn 提交身份（写后必须等于候选）。 */
  visitTurn: ReplayVisitTurnCommitV1;
  expectedChatId: string;
  expectedOwnerCharacterId: string;
  currentChatId: string;
  currentOwnerCharacterId: string;
  expectedMessageTotal: number;
  currentMessages: ReadonlyArray<{ role?: string; is_user?: boolean; message_id?: unknown }>;
  expectedUserTotal: number;
  /** 通过 Mvu.getMvuData 精确复读的当前 active data。 */
  activeData: Record<string, unknown>;
}

export type SwipeWriteAfterCheckResultV1 =
  | { ok: true }
  | { ok: false; code: GalRegenerationErrorCode; detail?: string };

/**
 * 写后硬门（§7.3 同时证明）：
 * - 四数组只增加 1、candidate 是尾部（复用 T01 validate）；
 * - 旧 swipe 内容/data/info 逐字节未变；
 * - candidate swipe 内容/data 严格相等、info 子集包含（宿主系统字段可附加）；
 * - active swipe 等于 candidate、active text 等于候选、active metadata 包含新 attempt；
 * - candidate data lifecycle settled；
 * - VisitTurn 身份等于候选。
 * 任意不符 → candidate-verification-failed / 具体错误码，不得 settled。
 */
export function verifySwipeWriteAfterV1(input: SwipeWriteAfterCheckInputV1): SwipeWriteAfterCheckResultV1 {
  const { plan, afterView, activeView } = input;
  if (input.currentChatId !== input.expectedChatId || input.currentOwnerCharacterId !== input.expectedOwnerCharacterId) {
    return { ok: false, code: 'chat-identity-changed', detail: '写后 chat/owner 已变化' };
  }
  if (input.currentMessages.length !== input.expectedMessageTotal) {
    return { ok: false, code: 'unexpected-floor-created', detail: '写后消息总数变化' };
  }
  const userTotal = input.currentMessages.filter((message) => message.role === 'user' || message.is_user === true).length;
  if (userTotal !== input.expectedUserTotal) {
    return { ok: false, code: 'unexpected-floor-created', detail: '写后玩家楼层数变化' };
  }
  if (toInt(input.currentMessages.at(-1)?.message_id) !== plan.messageId) {
    return { ok: false, code: 'target-changed', detail: '写后目标不再是最后一楼' };
  }
  const afterSwipes = Array.isArray(afterView.swipes) ? afterView.swipes : null;
  const afterData = Array.isArray(afterView.swipes_data) ? afterView.swipes_data : null;
  const afterInfo = Array.isArray(afterView.swipes_info) ? afterView.swipes_info : null;
  if (!afterSwipes || !afterData || !afterInfo) {
    return { ok: false, code: 'candidate-verification-failed', detail: '写后数组缺失' };
  }
  const structural = validateSwipeAppendPlanV1(
    {
      messageId: plan.messageId,
      expectedBeforeFingerprint: plan.expectedBeforeFingerprint,
      sourceSwipeId: plan.sourceSwipeId,
      candidateSwipeId: plan.candidateSwipeId,
      swipes: afterSwipes.map((s) => String(s)),
      swipes_data: afterData.map((d) => (isRecord(d) ? d : {})),
      swipes_info: afterInfo.map((i) => (isRecord(i) ? i : {})),
      swipe_id: toInt(afterView.swipe_id) ?? -1,
    },
    {
      expectedMessageId: plan.messageId,
      beforeSwipeCount: plan.candidateSwipeId,
      afterSwipeCount: afterSwipes.length,
    },
  );
  if (!structural.ok) return structural;

  // 旧项（0..candidate-1）逐字节未变
  for (let i = 0; i < plan.candidateSwipeId; i += 1) {
    if (String(afterSwipes[i]) !== plan.swipes[i]) {
      return { ok: false, code: 'candidate-verification-failed', detail: `旧 swipe[${i}] 正文被修改` };
    }
    if (!stableEqual(afterData[i], plan.swipes_data[i])) {
      return { ok: false, code: 'candidate-verification-failed', detail: `旧 swipes_data[${i}] 被修改` };
    }
    if (!stableEqual(afterInfo[i], plan.swipes_info[i])) {
      return { ok: false, code: 'candidate-verification-failed', detail: `旧 swipes_info[${i}] 被修改` };
    }
  }

  // candidate 项：正文/数据严格相等；info 子集包含（宿主系统字段可附加）
  const c = plan.candidateSwipeId;
  if (String(afterSwipes[c]) !== plan.swipes[c]) {
    return { ok: false, code: 'candidate-verification-failed', detail: 'candidate 正文不符' };
  }
  if (!stableEqual(afterData[c], input.candidateData)) {
    return { ok: false, code: 'candidate-verification-failed', detail: 'candidate swipes_data 与候选 MvuData 不符' };
  }
  if (!stableEqual(input.activeData, input.candidateData)) {
    return { ok: false, code: 'candidate-verification-failed', detail: 'active MVU data 与候选 MvuData 不符' };
  }
  const afterInfoC = isRecord(afterInfo[c]) ? afterInfo[c] : {};
  const expectedInfoC = plan.swipes_info[c];
  for (const [key, value] of Object.entries(expectedInfoC)) {
    if (!stableEqual(afterInfoC[key], value)) {
      return { ok: false, code: 'candidate-verification-failed', detail: `candidate swipes_info.${key} 不符` };
    }
  }

  // active-page：active swipe 等于 candidate；active text 等于候选；active metadata 包含新 attempt
  if (toInt(activeView.swipe_id) !== plan.candidateSwipeId) {
    return { ok: false, code: 'candidate-verification-failed', detail: `active swipe ${String(activeView.swipe_id)} !== candidate ${plan.candidateSwipeId}` };
  }
  if (toInt(activeView.message_id) !== plan.messageId) {
    return { ok: false, code: 'candidate-verification-failed', detail: 'active message_id 不符' };
  }
  if (String(activeView.message ?? '') !== plan.swipes[c]) {
    return { ok: false, code: 'candidate-verification-failed', detail: 'active text 不等于候选正文' };
  }
  const activeAttempt = parseAttemptMetadata(activeView.extra);
  const expectedAttempt = parseAttemptMetadata(input.candidateAttemptMetadata);
  if (!activeAttempt.ok || !expectedAttempt.ok || !stableEqual(activeAttempt.value, expectedAttempt.value)) {
    return { ok: false, code: 'candidate-verification-failed', detail: 'active metadata 不等于新 attempt' };
  }

  const planAttemptRaw = isRecord(plan.swipes_info[c]?.extra) ? plan.swipes_info[c].extra : {};
  const planAttemptInner = isRecord(planAttemptRaw[ATTEMPT_EXTRA_KEY])
    ? planAttemptRaw[ATTEMPT_EXTRA_KEY]
    : planAttemptRaw;

  // candidate data lifecycle settled
  const lifecycle = isRecord(input.candidateData[COMMIT_LIFECYCLE_KEY])
    ? input.candidateData[COMMIT_LIFECYCLE_KEY]
    : null;
  if (!lifecycle
    || lifecycle.status !== 'settled'
    || lifecycle.requestId !== String(planAttemptInner.requestId ?? '')
    || lifecycle.attemptId !== input.visitTurn.attemptId
    || lifecycle.commitKey !== input.visitTurn.commitKey) {
    return { ok: false, code: 'candidate-verification-failed', detail: 'candidate data lifecycle 未 settled' };
  }

  // VisitTurn 身份等于候选（attempt metadata 的 commitKey/attemptId 与 plan 一致；兼容 extra 嵌套）
  if (input.visitTurn.assistantMessageId !== plan.messageId
    || input.visitTurn.assistantSwipeId !== plan.candidateSwipeId
    || String(planAttemptInner.commitKey ?? '') !== input.visitTurn.commitKey
    || String(planAttemptInner.attemptId ?? '') !== input.visitTurn.attemptId) {
    return { ok: false, code: 'candidate-verification-failed', detail: 'VisitTurn 身份与候选不一致' };
  }

  return { ok: true };
}
