// 第三批 B3-T08 —— 可控 host 的 coordinator 骨架（fake ports）。
//
// 当前合同：project/contract.md（重生成状态机与失败闭合）。
//   - 状态机：idle → locating → generating_candidate → candidate_ready → rebuilding_state →
//     committing_swipe → verifying → settled；任一步失败 → failed_recoverable；
//     生成阶段停止 → stopping → failed_recoverable；身份/基线/数组冲突 → conflict_manual；
//   - commit fence：同 commitKey 已完成（settled）→ 返回已有结果，不再生成/追加/结算；
//   - reload 恢复：候选生成成功后写失败 → 缓存候选（candidate_ready），resume 只重试提交不再次调模型；
//   - production adapter 由 bridge 注入；本文件保持 host-agnostic，便于崩溃/竞态纯测。
// 禁止：读真实宿主、写真实楼层、调用真实 generate、运行 Probe C。

import {
  buildAttemptMetadata,
  createGalGenerationAttempt,
  createAttemptId,
  createCommitKey,
  parseAttemptMetadata,
  type GalGenerationRequestV2,
} from './gal-generation-request';
import type { GalRegenerationTargetV1, GalRegenerationErrorCode, SwipeAppendPlanV1 } from './gal-regeneration';
import { locateGalRegenerationTargetV1, type GalRegenerationMessageViewV1, type GalRegenerationSwipeArraysViewV1 } from './gal-regeneration-locator';
import { readFrozenBaselineV1, type FrozenBaselineReadResultV1 } from './gal-regeneration-baseline';
import {
  decideRegenerationDriftV1,
  type RegenerationDriftDecisionV1,
  type RegenerationDriftIdentityV1,
} from './gal-regeneration-receipt';
import {
  replayRegenerationCandidateV1,
  type FrozenOperationV1,
  type RegenerationReplayPortsV1,
  type ReplayVisitTurnCommitV1,
} from './gal-regeneration-replay';
import {
  buildSwipeAppendPlanV1,
  captureSwipeArraysSnapshotV1,
  fingerprintSwipeArraysV1,
  verifySwipeWriteAfterV1,
  verifySwipeWriteBeforeV1,
  type SwipeWriteAfterCheckInputV1,
  type SwipeWriteBeforeCheckInputV1,
} from './gal-regeneration-swipe';
import type { RegenerationCommitReceiptV1 } from './gal-regeneration';
import type { GalRegenerationPhase } from './gal-regeneration';

// ---------------------------------------------------------------------------
// 状态（可持久化，供 reload 恢复）
// ---------------------------------------------------------------------------

export interface RegenerationCoordinatorStateV1 {
  version: 1;
  phase: GalRegenerationPhase;
  commitKey: string | null;
  requestId: string | null;
  attemptId: string | null;
  assistantMessageId: number | null;
  candidateSwipeId: number | null;
  sourceSwipeId: number | null;
  generationId: string | null;
  target: GalRegenerationTargetV1 | null;
  originalMessageTotal: number | null;
  originalUserTotal: number | null;
  /** 定位时（T03）捕获的写前四数组指纹；写前硬门与它比较，而不是与写前重读快照比较。 */
  expectedBeforeFingerprint: string | null;
  candidateText: string | null;
  candidateData: Record<string, unknown> | null;
  plan: SwipeAppendPlanV1 | null;
  receipt: RegenerationCommitReceiptV1 | null;
  visitTurns: ReplayVisitTurnCommitV1[];
  error: { code: GalRegenerationErrorCode; detail?: string } | null;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// fake host ports（production 未接线的外部世界全部走这里）
// ---------------------------------------------------------------------------

export interface RegenerationHostContextV1 {
  chatId: string;
  ownerCharacterId: string;
  messages: GalRegenerationMessageViewV1[];
  messageTotal: number;
}

export interface RegenerationActiveViewV1 {
  message_id?: unknown;
  swipe_id?: unknown;
  message?: unknown;
  extra?: unknown;
}

export interface RegenerationHostPortsV1 {
  readHostContext(): Promise<RegenerationHostContextV1>;
  readAssistantView(messageId: number): Promise<GalRegenerationSwipeArraysViewV1 | null>;
  readActiveView(messageId: number): Promise<RegenerationActiveViewV1>;
  readBaseline(target: GalRegenerationTargetV1): Promise<FrozenBaselineReadResultV1>;
  readDrift(input: { target: GalRegenerationTargetV1; sourceAttemptId: string }): Promise<RegenerationDriftDecisionV1>;
  readOperation(target: GalRegenerationTargetV1, candidateText: string): Promise<FrozenOperationV1 | null>;
  buildVisitTurns(input: {
    target: GalRegenerationTargetV1;
    attemptId: string;
    commitKey: string;
    candidateText: string;
  }): Promise<ReplayVisitTurnCommitV1[]>;
  generateCandidate(input: {
    attemptId: string;
    generationId: string;
    request: GalGenerationRequestV2;
    target: GalRegenerationTargetV1;
  }): Promise<{ ok: true; text: string } | { ok: false; code: 'stopped' | 'empty' | 'tool-call' }>;
  writeSwipe(plan: SwipeAppendPlanV1): Promise<{ ok: true } | { ok: false; code: 'write-failed' }>;
  stopCandidate(generationId: string): Promise<boolean> | boolean;
  readActiveData(messageId: number): Promise<Record<string, unknown>>;
  commitReceipt(receipt: RegenerationCommitReceiptV1): Promise<{ ok: true } | { ok: false }>;
  replay: RegenerationReplayPortsV1;
  persist(state: RegenerationCoordinatorStateV1): Promise<void>;
  load(): Promise<RegenerationCoordinatorStateV1 | null>;
}

export type RegenerationCoordinatorResultV1 =
  | { ok: true; receipt: RegenerationCommitReceiptV1; alreadyDone: boolean; resumed: boolean }
  | RegenerationFailureV1;

export type RegenerationFailureV1 = { ok: false; code: GalRegenerationErrorCode; detail?: string; retryable?: boolean };

// ---------------------------------------------------------------------------
// coordinator
// ---------------------------------------------------------------------------

export class GalRegenerationCoordinatorV1 {
  private stopRequested = false;
  private activeState: RegenerationCoordinatorStateV1 | null = null;

  constructor(private readonly ports: RegenerationHostPortsV1) {}

  async stop(): Promise<boolean> {
    const generationId = this.activeState?.generationId;
    if (!generationId || this.activeState?.phase !== 'generating_candidate') return false;
    this.stopRequested = true;
    const stopping = { ...this.activeState, phase: 'stopping' as const };
    this.activeState = stopping;
    await this.ports.persist(stopping);
    return Boolean(await this.ports.stopCandidate(generationId));
  }

  /** 开始新的重生成；若已有持久化未完成状态则 resume（不重新生成）。 */
  async run(): Promise<RegenerationCoordinatorResultV1> {
    const stored = await this.ports.load();
    if (stored) {
      if (stored.phase === 'candidate_ready' || stored.phase === 'committing_swipe' || stored.phase === 'verifying') {
        return this.resume(stored);
      }
      if (stored.phase === 'failed_recoverable' && stored.candidateText && stored.target) {
        return this.resume({ ...stored, phase: 'candidate_ready', error: null });
      }
      // 新的显式点击在 settled/stopped/conflict 后创建下一 attempt。幂等证据
      // 在 swipe metadata 中；不能让 sessionStorage 永久锁死后续重生成。
      const previousSeq = stored.attemptId?.match(/:attempt-(\d+)$/u)?.[1];
      const minimumAttemptSeq = previousSeq ? Number(previousSeq) + 1 : 0;
      return this.startFresh(minimumAttemptSeq);
    }
    return this.startFresh();
  }

  /** reload 恢复：只重试提交/验证，绝不再次调用模型。 */
  private async resume(stored: RegenerationCoordinatorStateV1): Promise<RegenerationCoordinatorResultV1> {
    if (!stored.candidateText) {
      return this.failRecoverable(stored, 'candidate-write-conflict', '缓存缺候选正文，无法只重试提交');
    }
    if (!stored.assistantMessageId || !stored.commitKey || !stored.attemptId || !stored.target) {
      return this.failRecoverable(stored, 'candidate-write-conflict', '缓存缺目标/身份');
    }
    let state: RegenerationCoordinatorStateV1 = {
      ...stored,
      phase: stored.phase === 'verifying' ? 'verifying' : 'committing_swipe',
      plan: stored.plan,
      error: null,
    };
    await this.ports.persist(state);

    const ctx = await this.ports.readHostContext();
    if (!state.candidateData) {
      const rebuilt = await this.rebuildCandidate(state, stored.target, stored.candidateText);
      if (!rebuilt.ok) return rebuilt;
      state = rebuilt.state;
    }
    const visitTurns = state.visitTurns;
    if (stored.phase === 'verifying') {
      // 已写入：只重读验证，不再调 writer（writer 最多一次）
      const afterResult = await this.verifyAfter(state, visitTurns);
      if (!afterResult.ok) return afterResult;
      return this.finishSettled(afterResult.state, true);
    }

    // candidate_ready / committing_swipe：写前硬门 + writer（只重试提交，不再调模型）
    const existing = await this.resolveCommittingRecovery(state);
    if (!existing.ok) return existing;
    if (!existing.alreadyWritten) {
      const commitResult = await this.commitSwipe(state, ctx, {
      candidateData: state.candidateData!,
      candidateText: stored.candidateText,
      visitTurns,
    });
      if (!commitResult.ok) return commitResult;
      state = commitResult.state;
    } else {
      state = existing.state;
    }

    // 写后硬门
    const afterResult = await this.verifyAfter(state, visitTurns);
    if (!afterResult.ok) return afterResult;
    state = afterResult.state;

    return this.finishSettled(state, true);
  }

  private async startFresh(minimumAttemptSeq = 0): Promise<RegenerationCoordinatorResultV1> {
    // 1. locating
    let state: RegenerationCoordinatorStateV1 = this.fresh('locating');
    this.activeState = state;
    await this.ports.persist(state);

    const ctx = await this.ports.readHostContext();
    const assistantView = await this.ports.readAssistantView(-1);
    if (!assistantView) return this.failConflict(state, 'not-latest-assistant', '无法读取目标 assistant 视图');
    const locate = locateGalRegenerationTargetV1({
      chatId: ctx.chatId,
      ownerCharacterId: ctx.ownerCharacterId,
      messages: ctx.messages,
      assistant: assistantView,
      arraysFingerprint: fingerprintSwipeArraysV1,
    });
    if (!locate.ok) return this.failConflict(state, locate.code, locate.detail);
    const target = locate.target;
    const nextAttemptSeq = Math.max(locate.nextAttemptSeq, minimumAttemptSeq);
    const attemptId = createAttemptId(target.requestId, nextAttemptSeq);
    const commitKey = createCommitKey(target.requestId, attemptId);
    const attempt = createGalGenerationAttempt(target.originalRequest, 'regenerate', nextAttemptSeq);
    state = {
      ...state,
      requestId: target.requestId,
      attemptId,
      commitKey,
      assistantMessageId: target.assistantMessageId,
      candidateSwipeId: target.candidateSwipeId,
      sourceSwipeId: target.sourceSwipeId,
      generationId: attempt.generationId,
      target: structuredClone(target),
      originalMessageTotal: ctx.messageTotal,
      originalUserTotal: ctx.messages.filter((message) => message.role === 'user' || message.is_user === true).length,
      expectedBeforeFingerprint: target.arraysFingerprint,
    };

    // 2. drift 检查（§4.4）
    const drift = await this.ports.readDrift({ target, sourceAttemptId: target.sourceAttemptId });
    if (drift.kind === 'post-settlement-drift') {
      return this.failConflict(state, 'post-settlement-drift', drift.detail ?? 'active data 与 final receipt 不一致');
    }
    if (drift.kind === 'receipt-mismatch') {
      return this.failConflict(state, 'request-conflict', `receipt 身份错配（${drift.code}）`);
    }
    if (drift.kind === 'needs-legacy-replay') {
      return this.failConflict(state, 'legacy-replay-mismatch', '旧 swipe 无 receipt，本批首版不自动补');
    }

    // 3. generating_candidate
    state = { ...state, phase: 'generating_candidate' };
    this.activeState = state;
    await this.ports.persist(state);
    let gen: Awaited<ReturnType<RegenerationHostPortsV1['generateCandidate']>>;
    try {
      gen = await this.ports.generateCandidate({
        attemptId,
        generationId: attempt.generationId,
        request: target.originalRequest,
        target,
      });
    } catch (error) {
      return this.failRecoverable(state, 'candidate-verification-failed', `候选生成 reject：${error instanceof Error ? error.message : String(error)}`);
    }
    if (this.stopRequested) {
      return this.failRecoverable({ ...state, phase: 'stopping' }, 'candidate-write-conflict', '已停止，丢弃迟到候选结果');
    }
    if (!gen.ok) {
      if (gen.code === 'stopped') {
        return this.failRecoverable({ ...state, phase: 'stopping' }, 'candidate-write-conflict', '生成被停止');
      }
      return this.failRecoverable(state, 'candidate-verification-failed', `候选生成失败（${gen.code}）`);
    }

    // 4. candidate_ready（持久化缓存，供 reload 只重试提交）
    state = { ...state, phase: 'candidate_ready', candidateText: gen.text };
    await this.ports.persist(state);

    // 5. rebuilding_state（replay：baseline → 候选 data + receipt）
    const rebuilt = await this.rebuildCandidate(state, target, gen.text);
    if (!rebuilt.ok) return rebuilt;
    state = rebuilt.state;
    const visitTurns = state.visitTurns;
    const replayData = state.candidateData!;
    /*
     * candidate_ready 是真实可恢复断点：target/text 已持久化；reload 时只重放本地状态，
     * 不再次调用模型。rebuildCandidate 内部负责 baseline/operation/VisitTurn/lifecycle。
     */
    // 6. committing_swipe（写前硬门 + writer）
    state = { ...state, phase: 'committing_swipe', plan: null };
    await this.ports.persist(state);
    const commitResult = await this.commitSwipe(state, ctx, {
      candidateData: replayData,
      candidateText: gen.text,
      visitTurns,
    });
    if (!commitResult.ok) return commitResult;
    state = commitResult.state;

    // 7. verifying（写后硬门）
    const afterResult = await this.verifyAfter(state, visitTurns);
    if (!afterResult.ok) return afterResult;
    state = afterResult.state;

    // 8. settled + commit fence
    return this.finishSettled(state, false);
  }

  /** 写前硬门 + writer（含候选生成成功后只重试提交路径）。 */
  private async commitSwipe(
    state: RegenerationCoordinatorStateV1,
    ctx: RegenerationHostContextV1,
    candidate: { candidateData: Record<string, unknown>; candidateText: string; visitTurns: ReplayVisitTurnCommitV1[] },
  ): Promise<{ ok: true; state: RegenerationCoordinatorStateV1 } | RegenerationFailureV1> {
    const messageId = state.assistantMessageId;
    const attemptId = state.attemptId;
    const commitKey = state.commitKey;
    if (messageId === null || attemptId === null || commitKey === null) {
      return this.failConflict(state, 'request-conflict', '状态缺身份');
    }
    const currentView = await this.ports.readAssistantView(messageId);
    if (!currentView) return this.failConflict(state, 'target-changed', '写前重读目标失败');
    const snapshotResult = captureSwipeArraysSnapshotV1(currentView);
    if (!snapshotResult.ok) return this.failConflict(state, snapshotResult.code, snapshotResult.detail);
    // §7.3：写前必须重新读一次当前 chat/owner/消息视图（候选生成期间可能切 chat / 新增楼层）
    const currentCtx = await this.ports.readHostContext();
    const attemptMetadata = this.attemptMetadata(state, ctx.chatId, ctx.ownerCharacterId);
    const planResult = buildSwipeAppendPlanV1({
      snapshot: snapshotResult.snapshot,
      candidateText: candidate.candidateText,
      candidateData: candidate.candidateData,
      candidateAttemptMetadata: attemptMetadata,
    });
    if (!planResult.ok) return this.failConflict(state, planResult.code, planResult.detail);
    // 写前硬门必须与定位时（T03）的快照指纹比较，而不是与写前重读快照比较（否则切 source swipe 检测失效）。
    const plan = state.expectedBeforeFingerprint != null
      ? { ...planResult.plan, expectedBeforeFingerprint: state.expectedBeforeFingerprint }
      : planResult.plan;

    const before: SwipeWriteBeforeCheckInputV1 = {
      plan,
      currentView,
      currentMessages: currentCtx.messages,
      expectedMessageTotal: ctx.messageTotal,
      expectedChatId: ctx.chatId,
      expectedOwnerCharacterId: ctx.ownerCharacterId,
      currentChatId: currentCtx.chatId,
      currentOwnerCharacterId: currentCtx.ownerCharacterId,
    };
    const beforeResult = verifySwipeWriteBeforeV1(before);
    if (!beforeResult.ok) return this.failConflict(state, beforeResult.code, beforeResult.detail);

    const next = { ...state, phase: 'committing_swipe' as const, plan };
    await this.ports.persist(next);
    const write = await this.ports.writeSwipe(plan);
    if (!write.ok) {
      // 写失败：保持 candidate_ready（缓存证据），resume 只重试提交不再次调模型
      const cached = { ...state, phase: 'candidate_ready' as const, plan };
      await this.ports.persist(cached);
      return { ok: false, code: 'candidate-write-conflict' as const, detail: '写入失败，已缓存候选，可重试提交', retryable: true };
    }
    const verifying = { ...next, phase: 'verifying' as const };
    await this.ports.persist(verifying);
    return { ok: true, state: verifying };
  }

  /** 写后硬门。 */
  private async verifyAfter(
    state: RegenerationCoordinatorStateV1,
    visitTurns: ReplayVisitTurnCommitV1[],
  ): Promise<{ ok: true; state: RegenerationCoordinatorStateV1 } | RegenerationFailureV1> {
    const messageId = state.assistantMessageId;
    const plan = state.plan;
    const candidateData = state.candidateData;
    const commitKey = state.commitKey;
    const attemptId = state.attemptId;
    if (messageId === null || !plan || !candidateData || commitKey === null || attemptId === null) {
      return this.failRecoverable(state, 'candidate-verification-failed', '写后验证缺状态');
    }
    const afterView = await this.ports.readAssistantView(messageId);
    if (!afterView) return this.failRecoverable(state, 'candidate-verification-failed', '写后重读目标失败');
    const activeView = await this.ports.readActiveView(messageId);
    const ctx = await this.ports.readHostContext();
    const attemptMetadata = this.attemptMetadata(state, state.target?.chatId ?? ctx.chatId, state.target?.ownerCharacterId ?? ctx.ownerCharacterId);
    const activeData = await this.ports.readActiveData(messageId);
    const afterInput: SwipeWriteAfterCheckInputV1 = {
      plan,
      afterView,
      activeView,
      candidateData,
      candidateAttemptMetadata: attemptMetadata,
      visitTurn: visitTurns[0] ?? this.identityOnlyTurn(state),
      expectedChatId: state.target?.chatId ?? ctx.chatId,
      expectedOwnerCharacterId: state.target?.ownerCharacterId ?? ctx.ownerCharacterId,
      currentChatId: ctx.chatId,
      currentOwnerCharacterId: ctx.ownerCharacterId,
      expectedMessageTotal: state.originalMessageTotal ?? ctx.messageTotal,
      currentMessages: ctx.messages,
      expectedUserTotal: state.originalUserTotal ?? ctx.messages.filter((message) => message.role === 'user' || message.is_user === true).length,
      activeData,
    };
    const afterResult = verifySwipeWriteAfterV1(afterInput);
    if (!afterResult.ok) return this.failRecoverable(state, afterResult.code, afterResult.detail);
    return { ok: true, state: { ...state, phase: 'verifying' as const } };
  }

  /** Rebuild candidate state from the frozen baseline without calling the model. */
  private async rebuildCandidate(
    state: RegenerationCoordinatorStateV1,
    target: GalRegenerationTargetV1,
    candidateText: string,
  ): Promise<{ ok: true; state: RegenerationCoordinatorStateV1 } | RegenerationFailureV1> {
    const attemptId = state.attemptId;
    const commitKey = state.commitKey;
    const assistantMessageId = state.assistantMessageId;
    const candidateSwipeId = state.candidateSwipeId;
    if (!attemptId || !commitKey || assistantMessageId === null || candidateSwipeId === null) {
      return this.failConflict(state, 'request-conflict', 'replay identity is incomplete');
    }

    let rebuilding: RegenerationCoordinatorStateV1 = { ...state, phase: 'rebuilding_state', error: null };
    await this.ports.persist(rebuilding);
    const baseline = await this.ports.readBaseline(target);
    if (!baseline.ok) {
      const code: GalRegenerationErrorCode = baseline.code === 'floor-not-found'
        ? 'baseline-not-found'
        : baseline.code === 'swipe-not-found' || baseline.code === 'data-missing'
          ? 'baseline-swipe-not-found'
          : 'malformed-swipe-arrays';
      return this.failConflict(rebuilding, code, baseline.detail);
    }

    try {
      const operation = await this.ports.readOperation(target, candidateText);
      const visitTurns = await this.ports.buildVisitTurns({ target, attemptId, commitKey, candidateText });
      const replay = await replayRegenerationCandidateV1({
        baseline: baseline.baseline,
        candidateText,
        request: target.originalRequest,
        operation,
        visitTurns,
        attempt: { attemptId, commitKey, assistantMessageId, assistantSwipeId: candidateSwipeId },
        settlementKeys: [],
        ports: this.ports.replay,
      });
      if (!replay.ok) {
        const code: GalRegenerationErrorCode = replay.code === 'port-failed'
          ? 'candidate-verification-failed'
          : 'candidate-write-conflict';
        return this.failRecoverable(rebuilding, code, replay.detail ?? replay.code);
      }
      rebuilding = {
        ...rebuilding,
        phase: 'candidate_ready',
        candidateData: replay.candidateData,
        receipt: replay.receipt,
        visitTurns: structuredClone(replay.visitTurns),
      };
      await this.ports.persist(rebuilding);
      return { ok: true, state: rebuilding };
    } catch (error) {
      return this.failRecoverable(
        rebuilding,
        'candidate-verification-failed',
        `candidate replay failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Prevent a reload after a successful writer call from appending a duplicate swipe. */
  private async resolveCommittingRecovery(
    state: RegenerationCoordinatorStateV1,
  ): Promise<
    | { ok: true; alreadyWritten: boolean; state: RegenerationCoordinatorStateV1 }
    | RegenerationFailureV1
  > {
    const plan = state.plan;
    const messageId = state.assistantMessageId;
    if (!plan || messageId === null) return { ok: true, alreadyWritten: false, state };
    const view = await this.ports.readAssistantView(messageId);
    if (!view) return this.failConflict(state, 'target-changed', 'cannot reread target during commit recovery');
    const snapshot = captureSwipeArraysSnapshotV1(view);
    if (!snapshot.ok) return this.failConflict(state, snapshot.code, snapshot.detail);
    const fingerprint = snapshot.snapshot.arraysFingerprint;
    if (fingerprint === plan.expectedBeforeFingerprint) {
      return { ok: true, alreadyWritten: false, state };
    }

    const candidate = plan.candidateSwipeId;
    const info = snapshot.snapshot.swipes_info[candidate];
    const parsed = parseAttemptMetadata(info?.extra);
    const exactCommitted = snapshot.snapshot.swipes.length === candidate + 1
      && snapshot.snapshot.swipes_data.length === candidate + 1
      && snapshot.snapshot.swipes_info.length === candidate + 1
      && snapshot.snapshot.swipeId === candidate
      && snapshot.snapshot.swipes[candidate] === plan.swipes[candidate]
      && parsed.ok
      && parsed.value.attemptId === state.attemptId
      && parsed.value.commitKey === state.commitKey;
    if (!exactCommitted) {
      return this.failConflict(state, 'candidate-write-conflict', 'target changed while recovering committing_swipe');
    }
    const verifying: RegenerationCoordinatorStateV1 = { ...state, phase: 'verifying', error: null };
    await this.ports.persist(verifying);
    return { ok: true, alreadyWritten: true, state: verifying };
  }

  private async finishSettled(state: RegenerationCoordinatorStateV1, resumed: boolean): Promise<RegenerationCoordinatorResultV1> {
    if (!state.receipt) return this.failRecoverable(state, 'candidate-verification-failed', 'settled 前缺 receipt');
    const commit = await this.ports.commitReceipt(state.receipt);
    if (!commit.ok) return this.failRecoverable(state, 'candidate-write-conflict', 'receipt 提交失败');
    const settled: RegenerationCoordinatorStateV1 = { ...state, phase: 'settled', error: null };
    await this.ports.persist(settled);
    return { ok: true, receipt: state.receipt, alreadyDone: false, resumed };
  }

  /** buildAttemptMetadata 形状（attemptId/commitKey/generationId 等；chat/owner 来自 host context）。 */
  private attemptMetadata(
    state: RegenerationCoordinatorStateV1,
    chatId: string,
    ownerCharacterId: string,
  ): Record<string, unknown> {
    return buildAttemptMetadata({
      schema: 'gal-generation-attempt.v1', requestId: state.requestId!, attemptId: state.attemptId!,
      generationId: state.generationId!, mode: 'regenerate', chatId, ownerCharacterId,
      assistantMessageId: state.assistantMessageId ?? undefined, baseSwipeId: state.sourceSwipeId ?? undefined,
      commitKey: state.commitKey!, createdAt: new Date(state.updatedAt).toISOString(),
    });
  }

  /** 从持久化状态重建 VisitTurn 提交身份（resume 路径；完整 turn 解析由 O02 后接线）。 */
  private identityOnlyTurn(state: RegenerationCoordinatorStateV1): ReplayVisitTurnCommitV1 {
    return {
      turnId: `${state.requestId}:__identity_only__`,
      summary: state.candidateText ?? '',
      assistantMessageId: state.assistantMessageId ?? -1,
      assistantSwipeId: state.candidateSwipeId ?? -1,
      attemptId: state.attemptId ?? '',
      commitKey: state.commitKey ?? '',
      characterId: '__identity_only__',
      gameDay: null,
    };
  }

  private fresh(phase: GalRegenerationPhase): RegenerationCoordinatorStateV1 {
    return {
      version: 1,
      phase,
      commitKey: null,
      requestId: null,
      attemptId: null,
      assistantMessageId: null,
      candidateSwipeId: null,
      sourceSwipeId: null,
      generationId: null,
      target: null,
      originalMessageTotal: null,
      originalUserTotal: null,
      expectedBeforeFingerprint: null,
      candidateText: null,
      candidateData: null,
      plan: null,
      receipt: null,
      visitTurns: [],
      error: null,
      updatedAt: Date.now(),
    };
  }

  private async failConflict(
    state: RegenerationCoordinatorStateV1,
    code: GalRegenerationErrorCode,
    detail?: string,
  ): Promise<RegenerationFailureV1> {
    const next: RegenerationCoordinatorStateV1 = { ...state, phase: 'conflict_manual', error: { code, detail } };
    await this.ports.persist(next);
    return { ok: false, code, detail };
  }

  private async failRecoverable(
    state: RegenerationCoordinatorStateV1,
    code: GalRegenerationErrorCode,
    detail?: string,
  ): Promise<RegenerationFailureV1> {
    const next: RegenerationCoordinatorStateV1 = { ...state, phase: 'failed_recoverable', error: { code, detail } };
    await this.ports.persist(next);
    return { ok: false, code, detail };
  }
}
