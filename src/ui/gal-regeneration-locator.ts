// 第三批 B3-T03 —— 精确 target locator 与 attemptSeq 扫描。
//
// 当前合同：project/contract.md（重生成目标与身份定位）。
//   - 纯函数从消息视图中定位唯一重生成目标，不调用模型、不写宿主；
//   - 最后一楼必须为 assistant；source swipe 从 all-swipes 视图恢复 source attempt；
//   - 按 requestId 唯一反查玩家楼层并恢复完整 V2 冻结请求；
//   - request/chat/owner/message 全匹配；重复 attemptSeq/commitKey/损坏 metadata 为 conflict；
//   - candidateSwipeId = swipes.length；写前 arraysFingerprint 由调用方注入（T05 提供正式实现）；
//   - 无 V2 metadata 的旧 assistant 不允许同构重生成（legacy-request-unsupported）。
// 禁止：读宿主、写聊天、调用 generate、操作 DOM、猜测"最近有效 state"。

import {
  ATTEMPT_EXTRA_KEY,
  parseAttemptMetadata,
  resolvePlayerMessageByMetadata,
  restoreGalGenerationRequestV2,
  storedUserMessageMatchesRequestV2,
  type GalGenerationRequestV2,
} from './gal-generation-request';
import {
  GAL_REGENERATION_TARGET_SCHEMA_V1,
  type GalRegenerationErrorCode,
  type GalRegenerationTargetV1,
} from './gal-regeneration';

// ---------------------------------------------------------------------------
// 输入视图（调用方从宿主读取后传入，本模块不读宿主）
// ---------------------------------------------------------------------------

export interface GalRegenerationMessageViewV1 {
  role?: string;
  is_user?: boolean;
  is_system?: boolean;
  message_id?: unknown;
  message?: unknown;
  mes?: unknown;
  extra?: unknown;
}

export interface GalRegenerationSwipeArraysViewV1 {
  message_id?: unknown;
  swipe_id?: unknown;
  swipes?: unknown;
  swipes_data?: unknown;
  swipes_info?: unknown;
}

export interface GalRegenerationLocatorInputV1 {
  /** 当前 chat/owner 身份（调用方读取后传入）。 */
  chatId: string;
  ownerCharacterId: string;
  /** active-page 消息视图（最后一楼必须是 assistant）。 */
  messages: ReadonlyArray<GalRegenerationMessageViewV1>;
  /** 目标 assistant 的 all-swipes 视图（含 swipes/swipes_data/swipes_info/swipe_id）。 */
  assistant: GalRegenerationSwipeArraysViewV1;
  /** 写前四数组指纹计算器（T05 提供正式实现；此处注入以便纯测）。 */
  arraysFingerprint: (view: GalRegenerationSwipeArraysViewV1) => string;
}

export type GalRegenerationLocateResult =
  | { ok: true; target: GalRegenerationTargetV1; nextAttemptSeq: number }
  | { ok: false; code: GalRegenerationErrorCode; detail?: string };

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/** 从 attemptId（`${requestId}:attempt-${seq}`）提取 seq；不匹配返回 null。 */
export function attemptSeqOf(attemptId: string): number | null {
  const match = /^.+:attempt-(\d+)$/.exec(attemptId);
  if (!match) return null;
  const seq = Number(match[1]);
  return Number.isInteger(seq) && seq >= 1 ? seq : null;
}

/** extra 是否直接或嵌套（extra.extra）携带 attempt metadata 键（不解析，仅探测存在性）。 */
export function hasAttemptMetadataKey(extra: unknown): boolean {
  if (!isRecord(extra)) return false;
  if (ATTEMPT_EXTRA_KEY in extra) return true;
  return isRecord(extra.extra) && ATTEMPT_EXTRA_KEY in extra.extra;
}

// ---------------------------------------------------------------------------
// locator
// ---------------------------------------------------------------------------

/**
 * 定位唯一重生成目标（纯函数）：
 * 1. 最后一楼必须为 assistant；
 * 2. 四数组存在且长度一致，source swipe 必须在数组内；
 * 3. 从 source swipe info 恢复 source attempt；
 * 4. 按 requestId 唯一反查玩家楼层（0 或多条 → conflict）；
 * 5. 从玩家楼层恢复完整 V2 冻结请求；
 * 6. request/chat/owner/message 全匹配；
 * 7. 扫描全部 swipe attempts：同 request 合法 attempt 取最大 seq + 1；
 *    重复 attemptSeq、重复 commitKey、损坏 metadata、混入其它 request → conflict；
 * 8. candidateSwipeId = swipes.length；计算写前 arraysFingerprint。
 */
export function locateGalRegenerationTargetV1(input: GalRegenerationLocatorInputV1): GalRegenerationLocateResult {
  const fail = (code: GalRegenerationErrorCode, detail?: string): GalRegenerationLocateResult => ({ ok: false, code, detail });

  // 1. 最后一楼必须为 assistant
  const latest = input.messages.at(-1);
  if (!latest) return fail('not-latest-assistant', '聊天为空');
  if (latest.role !== 'assistant' || latest.is_user === true || latest.is_system === true) {
    return fail('not-latest-assistant', '最后一楼不是 assistant');
  }
  const latestMessageId = toInt(latest.message_id);
  if (latestMessageId === null) return fail('target-changed', '最后一楼 message_id 非法');

  // 2. 四数组存在且长度一致
  if (!Array.isArray(input.assistant.swipes)
    || !Array.isArray(input.assistant.swipes_data)
    || !Array.isArray(input.assistant.swipes_info)) {
    return fail('malformed-swipe-arrays', 'swipes/swipes_data/swipes_info 缺失');
  }
  const swipeCount = input.assistant.swipes.length;
  if (input.assistant.swipes_data.length !== swipeCount || input.assistant.swipes_info.length !== swipeCount) {
    return fail('malformed-swipe-arrays', '四数组长度不一致');
  }
  const assistantMessageId = toInt(input.assistant.message_id);
  if (assistantMessageId === null) return fail('target-changed', 'assistant message_id 非法');
  if (assistantMessageId !== latestMessageId) return fail('target-changed', `assistant ${assistantMessageId} 不是最后一楼 ${latestMessageId}`);

  // 3. source swipe
  const sourceSwipeId = toInt(input.assistant.swipe_id);
  if (sourceSwipeId === null || sourceSwipeId < 0 || sourceSwipeId >= swipeCount) {
    return fail('invalid-source-swipe', `swipe_id ${String(input.assistant.swipe_id)} 越界 count=${swipeCount}`);
  }
  const sourceInfo = input.assistant.swipes_info[sourceSwipeId];
  const sourceExtra = isRecord(sourceInfo) ? sourceInfo.extra : undefined;
  const sourceAttempt = parseAttemptMetadata(sourceExtra);
  if (!sourceAttempt.ok) {
    return fail('legacy-request-unsupported', `source swipe 无合法 attempt metadata（${sourceAttempt.code}）`);
  }
  const sourceAttemptValue = sourceAttempt.value;
  const requestId = String(sourceAttemptValue.requestId);
  if (!requestId) return fail('request-conflict', 'source attempt 缺少 requestId');

  // 4. 按 requestId 唯一反查玩家楼层
  const playerResolve = resolvePlayerMessageByMetadata(
    input.messages.map((m) => ({
      role: m.role,
      extra: m.extra,
      message_id: typeof m.message_id === 'number' ? m.message_id : undefined,
    })),
    requestId,
  );
  if (playerResolve.ok) {
    // 5. 从玩家楼层恢复完整 V2
    const playerFloor = input.messages.find((m) => toInt(m.message_id) === playerResolve.messageId);
    const restore = restoreGalGenerationRequestV2(playerFloor?.extra);
    if (!restore.ok) {
      return fail(restore.code === 'missing' ? 'legacy-request-unsupported' : 'request-conflict',
        `玩家楼层 V2 恢复失败（${restore.code}）`);
    }
    // 6. 身份全匹配
    const request = restore.request;
    const storedMessage = playerFloor?.message ?? playerFloor?.mes;
    if (!storedUserMessageMatchesRequestV2(request, storedMessage)) {
      return fail('request-conflict', 'v5 玩家楼层正文与冻结请求不一致');
    }
    const identityError = checkIdentity(input, request, requestId, playerResolve.messageId, assistantMessageId, sourceAttemptValue);
    if (identityError) return identityError;

    // 7. 扫描全部 swipe attempts
    const scan = scanAttempts(input.assistant.swipes_info, requestId);
    if (!scan.ok) return scan.error;

    const candidateSwipeId = swipeCount;
    const target: GalRegenerationTargetV1 = {
      schema: GAL_REGENERATION_TARGET_SCHEMA_V1,
      chatId: input.chatId,
      ownerCharacterId: input.ownerCharacterId,
      requestId,
      playerMessageId: playerResolve.messageId,
      assistantMessageId,
      sourceSwipeId,
      candidateSwipeId,
      sourceAttemptId: String(sourceAttemptValue.attemptId),
      sourceCommitKey: String(sourceAttemptValue.commitKey),
      arraysFingerprint: input.arraysFingerprint(input.assistant),
      originalRequest: request,
    };
    return { ok: true, target, nextAttemptSeq: scan.nextAttemptSeq };
  }
  return fail('request-conflict', `玩家楼层反查失败（${playerResolve.code}）`);
}

function checkIdentity(
  input: GalRegenerationLocatorInputV1,
  request: GalGenerationRequestV2,
  requestId: string,
  playerMessageId: number,
  assistantMessageId: number,
  sourceAttemptValue: Readonly<Record<string, unknown>>,
): GalRegenerationLocateResult | null {
  if (request.chatId !== input.chatId || request.ownerCharacterId !== input.ownerCharacterId) {
    return { ok: false, code: 'chat-identity-changed' as const, detail: 'chat/owner 与请求冻结不一致' };
  }
  if (request.requestId !== requestId) {
    return { ok: false, code: 'request-conflict' as const, detail: '玩家 request 与 source attempt requestId 不一致' };
  }
  if (request.playerMessageId != null && request.playerMessageId !== playerMessageId) {
    return { ok: false, code: 'request-conflict' as const, detail: 'request.playerMessageId 与反查结果不一致' };
  }
  const attemptAssistantMessageId = toInt(sourceAttemptValue.assistantMessageId);
  if (attemptAssistantMessageId !== null && attemptAssistantMessageId !== assistantMessageId) {
    return { ok: false, code: 'target-changed' as const, detail: 'source attempt 指向不同 assistant 楼层' };
  }
  if (sourceAttemptValue.chatId != null && String(sourceAttemptValue.chatId) !== input.chatId) {
    return { ok: false, code: 'chat-identity-changed' as const, detail: 'source attempt chatId 不一致' };
  }
  if (sourceAttemptValue.ownerCharacterId != null && String(sourceAttemptValue.ownerCharacterId) !== input.ownerCharacterId) {
    return { ok: false, code: 'chat-identity-changed' as const, detail: 'source attempt ownerCharacterId 不一致' };
  }
  return null;
}

type AttemptScanResult =
  | { ok: true; nextAttemptSeq: number }
  | { ok: false; error: GalRegenerationLocateResult };

/** 扫描全部 swipes_info 的 attempt metadata：同 request 合法 attempt 取最大 seq + 1；异常 fail closed。 */
export function scanAttempts(
  swipesInfo: unknown[],
  requestId: string,
): AttemptScanResult {
  const seenSeqs = new Set<number>();
  const seenCommitKeys = new Set<string>();
  let maxSeq = 0;

  for (const info of swipesInfo) {
    const extra = isRecord(info) ? info.extra : undefined;
    if (!hasAttemptMetadataKey(extra)) continue; // 无 metadata 的旧 swipe 不参与
    const parsed = parseAttemptMetadata(extra);
    if (!parsed.ok) {
      return { ok: false, error: { ok: false, code: 'attempt-sequence-conflict', detail: `损坏的 attempt metadata（${parsed.code}）` } };
    }
    const value = parsed.value;
    if (value.requestId !== requestId) {
      return { ok: false, error: { ok: false, code: 'request-conflict', detail: 'assistant 楼层混入其它 request 的 attempt' } };
    }
    const attemptId = String(value.attemptId ?? '');
    const commitKey = String(value.commitKey ?? '');
    const seq = attemptSeqOf(attemptId);
    if (seq === null) {
      return { ok: false, error: { ok: false, code: 'attempt-sequence-conflict', detail: `attemptId 无法解析序号: ${attemptId}` } };
    }
    if (seenSeqs.has(seq)) {
      return { ok: false, error: { ok: false, code: 'attempt-sequence-conflict', detail: `重复 attemptSeq ${seq}` } };
    }
    if (commitKey && seenCommitKeys.has(commitKey)) {
      return { ok: false, error: { ok: false, code: 'attempt-sequence-conflict', detail: `重复 commitKey ${commitKey}` } };
    }
    seenSeqs.add(seq);
    if (commitKey) seenCommitKeys.add(commitKey);
    if (seq > maxSeq) maxSeq = seq;
  }

  return { ok: true, nextAttemptSeq: maxSeq + 1 };
}
