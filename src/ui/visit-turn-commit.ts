// VisitTurn 确定性提交器：语义摘要由额外变量模型填写，bridge 只校验冻结槽位并落盘。
import type { GardenState, VisitTurn } from './types';
import { clearVisitSummaryTask, eligibleVisitSummaryCharacters, readVisitSummaryTask } from './visit-summary-task';

export const TURN_SUMMARY_CHARS = 100;

export interface VisitTurnCommitRequestRef {
  requestId: string;
  sceneId: string | null;
  relevantCharacterIds: readonly string[];
  visitIdsByCharacter: Record<string, string | null>;
  visibleUserText: string;
}

export interface VisitTurnCommitAttemptRef {
  attemptId: string;
  commitKey: string;
  assistantMessageId: number | null;
  assistantSwipeId: number | null;
}

export interface VisitTurnCommitClockRef {
  day: number | string | null;
  time_period: string | null;
  period_serial: number | null;
}

export interface VisitTurnCommitInput {
  /** 含额外变量模型已填写 visit_summary_task 的最终状态。 */
  finalState: GardenState;
  request: VisitTurnCommitRequestRef;
  attempt: VisitTurnCommitAttemptRef;
  clock: VisitTurnCommitClockRef;
}

export type VisitTurnCommitResult =
  | { ok: true; turns: VisitTurn[] }
  | { ok: false; code: 'missing-task' | 'task-mismatch' | 'missing-summary' | 'invalid-summary'; turns: [] };

/**
 * 从 request-scoped MVU 暂存任务构造 VisitTurn。这里绝不读取正文，也没有脚本摘要兜底。
 */
export function buildVisitTurnCommit(input: VisitTurnCommitInput): VisitTurnCommitResult {
  const eligible = eligibleVisitSummaryCharacters(input.request);
  if (eligible.length === 0) return { ok: true, turns: [] };
  const read = readVisitSummaryTask(input.finalState, input.request);
  if (!read.ok) return { ok: false, code: read.code, turns: [] };
  return {
    ok: true,
    turns: eligible.map((characterId) => ({
      turn_id: `${input.request.requestId}:${characterId}`,
      character_id: characterId,
      day: input.clock.day,
      time_period: input.clock.time_period,
      summary: read.summaries.get(characterId)!,
    })),
  };
}

/** 便捷构造：从 V2 request 与 attempt 映射构造 commit 输入引用（纯函数，不读宿主）。 */
export function visitTurnCommitRefs(
  request: {
    requestId: string;
    sceneId: string | null;
    relevantCharacterIds: readonly string[];
    visitIdsByCharacter: Record<string, string | null>;
    visibleUserText: string;
  },
  attempt: {
    attemptId: string;
    commitKey: string;
    assistantMessageId: number | null;
    assistantSwipeId: number | null;
  },
): { request: VisitTurnCommitRequestRef; attempt: VisitTurnCommitAttemptRef } {
  return {
    request: {
      requestId: request.requestId,
      sceneId: request.sceneId,
      relevantCharacterIds: request.relevantCharacterIds,
      visitIdsByCharacter: request.visitIdsByCharacter,
      visibleUserText: request.visibleUserText,
    },
    attempt: {
      attemptId: attempt.attemptId,
      commitKey: attempt.commitKey,
      assistantMessageId: attempt.assistantMessageId,
      assistantSwipeId: attempt.assistantSwipeId,
    },
  };
}

// ---------------------------------------------------------------------------
// B2-T10：把冻结请求的 VisitTurn 精确写入最终结算 state（纯函数）。
// 合同（runbook §3.7 / 冻结顺序 5-8）：
//   - 只用 request 冻结的 visitIdsByCharacter（不用 settlement 后 active visit 猜目标）；
//   - visitId 为 null 的角色由构造器跳过（不伪造 visit）；
//   - buildVisitTurnCommit 失败（empty/malformed）或 upsert not-found/conflict 时抛错，
//     调用方（bridge settlement）保留 pending，不写邻近楼层、不标 settled；
//   - 同 turn_id retry/recovery 由 upsert 覆盖审计字段，不追加重复记录。
// 禁止：直接调 host/MVU；读现实时间；按“最后一层 assistant”模糊定位。
// ---------------------------------------------------------------------------

import { upsertVisitTurnByVisitId } from './character-memory';

export interface VisitTurnCommitFinalStateInput {
  /** 最终结算 GardenState（已含本地 settlement 结果，未含 turn）。 */
  finalState: GardenState;
  request: VisitTurnCommitRequestRef;
  attempt: VisitTurnCommitAttemptRef;
  clock: VisitTurnCommitClockRef;
}

export type VisitTurnCommitFinalStateResult =
  | { ok: true; state: GardenState; turns: VisitTurn[] }
  | { ok: false; code: 'missing-task' | 'task-mismatch' | 'missing-summary' | 'invalid-summary' | 'not-found' | 'conflict'; state: GardenState };

export type VisitTurnVerificationResult =
  | { ok: true }
  | {
      ok: false;
      code: 'unexpected-turn' | 'missing-visit' | 'duplicate-visit' | 'missing-turn' | 'duplicate-turn' | 'turn-mismatch';
      characterId?: string;
      turnId?: string;
    };

const visitTurnFields: ReadonlyArray<keyof VisitTurn> = [
  'turn_id',
  'character_id',
  'day',
  'time_period',
  'summary',
];

function allVisitRecords(state: GardenState) {
  const records: Array<{ characterId: string; visitId: string; turns: VisitTurn[] }> = [];
  const byCharacter = state.interaction?.visit_memory?.by_character ?? {};
  for (const [characterId, memory] of Object.entries(byCharacter)) {
    if (memory?.active_visit) {
      records.push({
        characterId,
        visitId: memory.active_visit.visit_id,
        turns: memory.active_visit.turns ?? [],
      });
    }
    for (const visit of memory?.closed_visits ?? []) {
      records.push({ characterId, visitId: visit.visit_id, turns: visit.turns ?? [] });
    }
  }
  return records;
}

/**
 * 精确验证本次提交的 VisitTurn：
 * - expected 为空是合法零 turn，但不得残留同 requestId 的意外 turn；
 * - 每条 expected 必须只出现在冻结 character+visit 中一次；
 * - 全部审计、时钟和摘要字段必须与本次确定性构造结果一致。
 */
export function verifyCommittedVisitTurns(
  state: GardenState,
  request: Pick<VisitTurnCommitRequestRef, 'requestId' | 'visitIdsByCharacter'>,
  expectedTurns: readonly VisitTurn[],
): VisitTurnVerificationResult {
  const visits = allVisitRecords(state);
  if (expectedTurns.length === 0) {
    const unexpected = visits
      .flatMap((visit) => visit.turns)
      .find((turn) => turn.turn_id.startsWith(`${request.requestId}:`));
    return unexpected
      ? { ok: false, code: 'unexpected-turn', characterId: unexpected.character_id, turnId: unexpected.turn_id }
      : { ok: true };
  }

  for (const expected of expectedTurns) {
    const visitId = request.visitIdsByCharacter[expected.character_id];
    const targetVisits = visits.filter((visit) => (
      visit.characterId === expected.character_id && visit.visitId === visitId
    ));
    if (targetVisits.length === 0) {
      return { ok: false, code: 'missing-visit', characterId: expected.character_id, turnId: expected.turn_id };
    }
    if (targetVisits.length > 1) {
      return { ok: false, code: 'duplicate-visit', characterId: expected.character_id, turnId: expected.turn_id };
    }
    const occurrences = visits.flatMap((visit) => visit.turns).filter((turn) => turn.turn_id === expected.turn_id);
    if (occurrences.length === 0) {
      return { ok: false, code: 'missing-turn', characterId: expected.character_id, turnId: expected.turn_id };
    }
    if (occurrences.length > 1) {
      return { ok: false, code: 'duplicate-turn', characterId: expected.character_id, turnId: expected.turn_id };
    }
    const actual = targetVisits[0].turns.find((turn) => turn.turn_id === expected.turn_id);
    if (!actual || visitTurnFields.some((field) => actual[field] !== expected[field])) {
      return { ok: false, code: 'turn-mismatch', characterId: expected.character_id, turnId: expected.turn_id };
    }
  }
  return { ok: true };
}

/** 恢复分析只需要的精确审计引用验证；合法零 eligible visit 返回 true。 */
export function verifyVisitTurnAuditRefs(
  state: GardenState,
  request: Pick<VisitTurnCommitRequestRef, 'requestId' | 'relevantCharacterIds' | 'visitIdsByCharacter'>,
  _attempt: Pick<VisitTurnCommitAttemptRef, 'attemptId' | 'commitKey' | 'assistantMessageId' | 'assistantSwipeId'>,
): boolean {
  const expectedCharacters = request.relevantCharacterIds.filter((characterId) => (
    request.visitIdsByCharacter[characterId] != null
  ));
  if (expectedCharacters.length === 0) return true;
  const visits = allVisitRecords(state);
  return expectedCharacters.every((characterId) => {
    const visitId = request.visitIdsByCharacter[characterId];
    const expectedTurnId = `${request.requestId}:${characterId}`;
    const targetVisits = visits.filter((visit) => visit.characterId === characterId && visit.visitId === visitId);
    const occurrences = visits.flatMap((visit) => visit.turns).filter((turn) => turn.turn_id === expectedTurnId);
    if (targetVisits.length !== 1 || occurrences.length !== 1) return false;
    const turn = targetVisits[0].turns.find((entry) => entry.turn_id === expectedTurnId);
    return Boolean(turn && turn.character_id === characterId);
  });
}

/**
 * 构造 VisitTurn 并按冻结 visit map 精确 upsert 到最终 state。
 * 失败返回原 state 引用（未变）；成功返回新 state（含 turns）。
 * 纯函数：不写宿主、不读现实时间。
 */
export function applyVisitTurnsToFinalState(
  input: VisitTurnCommitFinalStateInput,
): VisitTurnCommitFinalStateResult {
  const built = buildVisitTurnCommit(input);
  if (!built.ok) return { ok: false, code: built.code, state: input.finalState };
  let next = input.finalState;
  for (const turn of built.turns) {
    const visitId = input.request.visitIdsByCharacter[turn.character_id];
    if (visitId == null) continue; // R0：null visit 只跳过该角色，不伪造
    const result = upsertVisitTurnByVisitId(next, turn.character_id, visitId, turn);
    if (!result.ok) return { ok: false, code: result.code, state: next };
    next = result.state;
  }
  return { ok: true, state: clearVisitSummaryTask(next), turns: built.turns };
}
