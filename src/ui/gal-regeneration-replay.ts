// 第三批 B3-T06 —— branch replay engine 的纯壳（依赖注入协调器）。
//
// 当前合同：project/contract.md（重生成重放顺序与本地所有权）。
//   - 重算顺序固定：clone baseline → applyModelOutput → restoreLocalEventOwnership →
//     applyLocalSettlement（原冻结操作，只一次）→ applyPresenceAnalysis → reconcileM2Runtime →
//     applyVisitTurns（同 requestId）→ finalizeLifecycle(settled) → receipt → 返回 candidate data；
//   - 所有宿主/解析副作用走注入 ports；本模块不实现未经核验的 Mvu.parseMessage adapter；
//   - old settled current state 不作为输入；任一步抛错 → 无部分输出（fail closed）；
//   - 同 commit 重跑（确定性 ports）逐字节相同。
// 禁止：读宿主、写楼层、调用 generate、手工 emit 事件、直接 mutate host chat。

import type { GalGenerationRequestV2 } from './gal-generation-request';
import type { RegenerationCommitReceiptV1 } from './gal-regeneration';
import {
  createRegenerationCommitReceiptV1,
  GAL_REGENERATION_RECEIPT_DATA_KEY,
} from './gal-regeneration-receipt';

// ---------------------------------------------------------------------------
// 注入 ports（调用方/主验收方提供真实实现；本模块不实现 Mvu.parseMessage adapter）
// ---------------------------------------------------------------------------

export interface FrozenOperationV1 {
  /** 原玩家动作类型：普通互动 / 异变收束 / 决斗胜利。 */
  kind: 'normal-interaction' | 'anomaly-resolution' | 'duel-victory';
  /** 由调用方从玩家楼层 gensokyoSystemOperation 等 metadata 恢复；未知字段保留。 */
  [key: string]: unknown;
}

export interface ReplayVisitTurnCommitV1 {
  /** `${requestId}:${characterId}`（与 visit-turn-commit 的 turn_id 合同一致）。 */
  turnId: string;
  summary: string;
  assistantMessageId: number;
  assistantSwipeId: number;
  attemptId: string;
  commitKey: string;
  characterId: string;
  gameDay: number | null;
  /** 调用方按 visit-turn-commit.makeTurn 输入提供的其余字段。 */
  [key: string]: unknown;
}

export interface RegenerationReplayPortsV1 {
  /** 用新模型输出对 baseline 解析出新的 MvuData（执行 agent 不实现未经核验的 adapter）。 */
  applyModelOutput(baseData: Record<string, unknown> | null, text: string): Promise<Record<string, unknown>>;
  /** 恢复本地事件所有权（baseline 与解析后状态）。 */
  restoreLocalEventOwnership(baseData: Record<string, unknown> | null, parsedState: Record<string, unknown>): Record<string, unknown>;
  /** 原冻结本地结算（普通互动/异变/决斗），只调用一次。 */
  applyLocalSettlement(state: Record<string, unknown>, operation: FrozenOperationV1): Record<string, unknown>;
  /** presence 重算（用新文本）。 */
  applyPresenceAnalysis(state: Record<string, unknown>, text: string): Record<string, unknown>;
  /** m2 runtime reconcile。 */
  reconcileM2Runtime(state: Record<string, unknown>): Record<string, unknown>;
  /** VisitTurn upsert（同 requestId）；失败表示 frozen visit 缺失/冲突（fail closed）。 */
  applyVisitTurns(
    state: Record<string, unknown>,
    turns: ReplayVisitTurnCommitV1[],
  ): { ok: true; state: Record<string, unknown>; turns?: ReplayVisitTurnCommitV1[] }
    | { ok: false; code: 'visit-missing' | 'visit-conflict'; detail?: string };
  /** 写 lifecycle settled。 */
  finalizeLifecycle(state: Record<string, unknown>, status: 'settled'): Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 输入/输出
// ---------------------------------------------------------------------------

export interface RegenerationReplayInputV1 {
  /** 生成前冻结基线（T04 输出；null = V2 开场边界，由 ports 按开场语义处理）。 */
  baseline: Record<string, unknown> | null;
  candidateText: string;
  request: GalGenerationRequestV2;
  /** 原冻结操作（从玩家楼层恢复）；null = 无本地结算操作。 */
  operation: FrozenOperationV1 | null;
  visitTurns: ReplayVisitTurnCommitV1[];
  attempt: {
    attemptId: string;
    commitKey: string;
    assistantMessageId: number;
    assistantSwipeId: number;
  };
  settlementKeys: string[];
  ports: RegenerationReplayPortsV1;
}

export type RegenerationReplayResultV1 =
  | {
      ok: true;
      candidateData: Record<string, unknown>;
      receipt: RegenerationCommitReceiptV1;
      visitTurns: ReplayVisitTurnCommitV1[];
    }
  | { ok: false; code: 'port-failed' | 'visit-missing' | 'visit-conflict'; detail?: string };

// ---------------------------------------------------------------------------
// 引擎
// ---------------------------------------------------------------------------

/**
 * 从冻结基线重放候选状态（纯壳协调器，顺序固定 §8.1）：
 * 1. clone baseline（structuredClone，不共享引用）；
 * 2. applyModelOutput（新文本 → 新 MvuData）；
 * 3. restoreLocalEventOwnership；
 * 4. operation 非 null 时 applyLocalSettlement 恰好一次；
 * 5. applyPresenceAnalysis（消费额外模型任务）；
 * 6. reconcileM2Runtime；
 * 7. applyVisitTurns（同 requestId，失败 → visit-missing/visit-conflict）；
 * 8. finalizeLifecycle(settled)；
 * 9. 生成 receipt（三阶段 fingerprint）；
 * 10. 返回 candidateData（不写宿主）。
 * 任一步抛错 → { ok:false, code:'port-failed' }，无部分输出。
 */
export async function replayRegenerationCandidateV1(input: RegenerationReplayInputV1): Promise<RegenerationReplayResultV1> {
  const { ports } = input;
  try {
    // 1. clone baseline（null = 开场边界，原样传给 ports）
    const baseline = input.baseline === null ? null : structuredClone(input.baseline);

    // 2. 模型输出解析
    const modelApplied = await ports.applyModelOutput(baseline, input.candidateText);

    // 3. 恢复本地所有权
    const owned = ports.restoreLocalEventOwnership(baseline, modelApplied);

    // 4. 原冻结本地结算（只一次）
    const settled = input.operation === null
      ? owned
      : ports.applyLocalSettlement(owned, input.operation);

    // 5. presence
    const presence = ports.applyPresenceAnalysis(settled, input.candidateText);

    // 6. reconcile
    const reconciled = ports.reconcileM2Runtime(presence);

    // 7. VisitTurn upsert（同 requestId）
    const visitResult = ports.applyVisitTurns(reconciled, structuredClone(input.visitTurns));
    if (!visitResult.ok) {
      return { ok: false, code: visitResult.code, detail: visitResult.detail };
    }

    // 8. lifecycle settled
    const finalized = ports.finalizeLifecycle(visitResult.state, 'settled');

    // 9. receipt（三阶段 fingerprint）
    const receipt = createRegenerationCommitReceiptV1({
      requestId: input.request.requestId,
      attemptId: input.attempt.attemptId,
      commitKey: input.attempt.commitKey,
      assistantMessageId: input.attempt.assistantMessageId,
      assistantSwipeId: input.attempt.assistantSwipeId,
      baselineData: baseline ?? {},
      modelAppliedData: modelApplied,
      finalizedData: finalized,
      settlementKeys: input.settlementKeys,
    });

    // 10. 返回（不写宿主）
    const candidateData = structuredClone(finalized);
    candidateData[GAL_REGENERATION_RECEIPT_DATA_KEY] = structuredClone(receipt);
    return {
      ok: true,
      candidateData,
      receipt,
      visitTurns: structuredClone(visitResult.turns ?? input.visitTurns),
    };
  } catch (error) {
    return {
      ok: false,
      code: 'port-failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
