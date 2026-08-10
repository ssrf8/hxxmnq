import type { MessageTransactionKind, MessageTransactionSnapshot } from './types';
import type { GalAnyRequest, GalGenerationRequest } from './gal-generation-request';
import type { ChatRestoreResult } from './gal-generation-request';
import { createGalGenerationAttempt, parseAttemptMetadata, resolvePlayerMessageByMetadata } from './gal-generation-request';

type RawMessage = Record<string, unknown>;

interface SubmitRequest {
  kind: MessageTransactionKind;
  message: string;
  transactionId?: string;
  /** Phase 2 增量 A：本次逻辑请求（bridge 已创建并写入玩家楼层 metadata；V1 或 V2）。 */
  request?: GalAnyRequest;
  /** 本地白名单事件的最简完成合同：当前玩家楼层之后出现非空 assistant 即收到回执。 */
  receiptPolicy?: 'exact-attempt' | 'next-nonempty-assistant';
  extra?: Record<string, unknown>;
  matchesExisting?: (message: RawMessage) => boolean;
}

interface TransactionHost {
  currentChatId(): string;
  listMessages(): RawMessage[];
  isGenerationActive?(): boolean;
  assistantResponseTimeoutMs?: number;
  createUserMessage(message: string, extra: Record<string, unknown>): Promise<void>;
  prepareGeneration?(): Promise<void>;
  triggerGeneration(): Promise<void>;
  continueGeneration(): Promise<void>;
  /** Phase 2 增量 A：本次桥会话 epoch（bridge 重建后变化）。 */
  chatEpoch?(): number;
  /** Phase 2 增量 A：请求前 MVU epoch。 */
  mvuEpoch?(): number;
  /** Phase 2 增量 B：当前生成 transport（bridge 按此实现 triggerGeneration 分支）。 */
  generationTransport?: 'native-trigger' | 'helper-generate';
}

const idleSnapshot = (): MessageTransactionSnapshot => ({
  transactionId: '',
  chatId: '',
  kind: 'interaction',
  phase: 'idle',
  userMessageCreated: false,
  assistantResponded: false,
});

function transactionId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `gg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function messageExtra(message: RawMessage): Record<string, unknown> {
  return message.extra && typeof message.extra === 'object'
    ? message.extra as Record<string, unknown>
    : {};
}

export class MessageTransactionCoordinator {
  private snapshot: MessageTransactionSnapshot = idleSnapshot();
  private stopped = false;
  // A non-empty assistant floor can arrive while the host is still streaming it.
  // Keep that text observable to the GAL, but do not begin MVU settlement until
  // the host has also completed the generation lifecycle.
  private generationEnded = false;

  constructor(private readonly host: TransactionHost) {}

  read(): MessageTransactionSnapshot {
    this.reconcile();
    return structuredClone(this.snapshot);
  }

  async submit(request: SubmitRequest): Promise<MessageTransactionSnapshot> {
    this.reconcile();
    if (!['idle', 'settled'].includes(this.snapshot.phase)) {
      throw new Error(this.snapshot.phase === 'failed'
        ? '上一条消息尚未完成，请先重试生成或本地结算'
        : '上一条消息仍在处理中，请等待回复或停止生成');
    }

    const chatId = this.host.currentChatId().trim();
    if (!chatId) throw new Error('当前聊天尚未就绪');
    const id = request.transactionId || transactionId();
    // Phase 2 增量 A：为本次请求建立 attempt（request/attempt/generation/commit 标识）。
    const attempt = request.request
      ? createGalGenerationAttempt(request.request, 'send', request.request.attemptSeq)
      : null;
    this.snapshot = {
      transactionId: id,
      chatId,
      kind: request.kind,
      phase: 'submitting_user',
      userMessageCreated: false,
      assistantResponded: false,
      receiptPolicy: request.receiptPolicy ?? 'exact-attempt',
      startedAt: Date.now(),
      ...(request.request ? {
        requestId: request.request.requestId,
        requestSchema: request.request.schema,
        ownerCharacterId: request.request.ownerCharacterId,
        attemptId: attempt?.attemptId,
        generationId: attempt?.generationId,
        commitKey: attempt?.commitKey,
        attemptSeq: request.request.attemptSeq,
        chatEpoch: this.host.chatEpoch?.(),
        mvuEpochBefore: this.host.mvuEpoch?.(),
      } : {}),
    };
    this.stopped = false;
    this.generationEnded = false;

    try {
      let createdUserMessage = false;
      const existing = this.findUserMessage(request.matchesExisting);
      if (existing) {
        this.snapshot.userMessageCreated = true;
        this.snapshot.userMessageId = Number(existing.message_id);
        this.reconcile();
        if (this.snapshot.assistantResponded) return this.read();
      } else {
        await this.host.createUserMessage(request.message, {
          gensokyoTransactionId: id,
          gensokyoTransactionKind: request.kind,
          ...(request.extra ?? {}),
        });
        if (this.host.currentChatId().trim() !== chatId) {
          throw new Error('聊天在消息创建期间发生切换');
        }
        const created = this.findUserMessage(request.matchesExisting);
        this.snapshot.userMessageCreated = true;
        createdUserMessage = true;
        if (created) this.snapshot.userMessageId = Number(created.message_id);
      }

      // Phase 2 增量 A：本次新创建的玩家楼层按 request metadata 精确反查一致性校验。
      // 仅在本次创建时执行（兼容既有 existing 复用路径）；0 条或多条都不猜 ID。
      if (request.request && createdUserMessage && request.receiptPolicy !== 'next-nonempty-assistant') {
        const resolve = resolvePlayerMessageByMetadata(this.host.listMessages(), request.request.requestId);
        if (!resolve.ok) {
          this.snapshot.phase = 'failed';
          this.snapshot.lastError = resolve.code === 'ambiguous'
            ? '玩家楼层 request 反查歧义（多条命中），禁止猜 ID'
            : '玩家楼层 request 反查失败（未找到 metadata），无法确认本次请求楼层';
          return this.read();
        }
        if (Number.isInteger(this.snapshot.userMessageId) && resolve.messageId !== this.snapshot.userMessageId) {
          this.snapshot.phase = 'failed';
          this.snapshot.lastError = '玩家楼层反查不一致：gensokyoTransactionId 与 request metadata 指向不同楼层';
          return this.read();
        }
        this.snapshot.userMessageId = resolve.messageId;
      }

      this.snapshot.phase = 'generating';
      // A freshly inserted floor can trigger host/regex refresh work. Let that
      // lifecycle drain before starting the model so GENERATION_STARTED is not
      // emitted into a listener-remount gap. Retries deliberately skip this:
      // their user floor is already durable and stable.
      if (createdUserMessage) await this.host.prepareGeneration?.();
      await this.host.triggerGeneration();
      // Hosts without a generation-state surface define completion by the awaited
      // command. Luker exposes the state and may resolve a takeover command before
      // its fake stream has written the assistant body, so it must wait for the
      // lifecycle event instead.
      if (!this.host.isGenerationActive || !this.host.isGenerationActive()) this.generationEnded = true;
      await this.waitForAssistant();
      const completedDuringGeneration = this.read();
      if (['settled', 'failed', 'stopping'].includes(completedDuringGeneration.phase)) return completedDuringGeneration;
      this.snapshot.phase = 'settling';
      this.reconcile(true);
      if (!this.snapshot.assistantResponded) {
        this.snapshot.phase = 'failed';
        this.snapshot.lastError = '生成命令已经结束，但没有收到可用的 assistant 正文；请求可能未启动，可以安全重试且不会重复创建玩家消息';
      }
      return this.read();
    } catch (error) {
      this.snapshot.phase = 'failed';
      this.snapshot.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async retry(): Promise<MessageTransactionSnapshot> {
    this.reconcile();
    if (this.snapshot.recovery) {
      throw new Error('上次请求处于恢复态（未完成/冲突），禁止自动重发；请手动处理');
    }
    if (this.snapshot.phase !== 'failed' || !this.snapshot.userMessageCreated) {
      throw new Error('当前没有可继续生成的失败事务');
    }
    if (this.host.currentChatId().trim() !== this.snapshot.chatId) {
      throw new Error('聊天已经切换，不能在新聊天中重试旧事务');
    }
    if (this.snapshot.assistantResponded) {
      this.snapshot.phase = 'settling';
      return this.read();
    }
    const shouldContinue = this.stopped;
    this.snapshot.phase = 'generating';
    this.snapshot.lastError = undefined;
    this.stopped = false;
    this.generationEnded = false;
    try {
      if (shouldContinue) await this.host.continueGeneration();
      else await this.host.triggerGeneration();
      if (!this.host.isGenerationActive || !this.host.isGenerationActive()) this.generationEnded = true;
      await this.waitForAssistant();
      const completedDuringGeneration = this.read();
      if (['settled', 'failed', 'stopping'].includes(completedDuringGeneration.phase)) return completedDuringGeneration;
      this.snapshot.phase = 'settling';
      this.reconcile(true);
      if (!this.snapshot.assistantResponded) {
        this.snapshot.phase = 'failed';
        this.snapshot.lastError = '重试命令已经结束，但仍没有收到可用的 assistant 正文';
      }
      return this.read();
    } catch (error) {
      this.snapshot.phase = 'failed';
      this.snapshot.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Phase 3：玩家显式停止（abortReason 区分来源；计划 §3.1）。
   * generating → stopping（等待 stopGenerationById 对账，不得直接 failed）；
   * 其他阶段忽略（generated/persisting/awaiting_mvu/settling 只允许完成落盘/结算）。
   */
  markStopped(reason: string = 'user-stop') {
    if (this.snapshot.phase !== 'generating') return false;
    this.stopped = true;
    this.snapshot.phase = 'stopping';
    this.snapshot.stopReason = reason;
    this.snapshot.lastError = undefined;
    return true;
  }

  /**
   * Phase 3：停止对账完成（Promise reject/ENDED/有界超时已确认 attempt 不再活跃）。
   * stopping → failed（可从头重试）；非 stopping 无操作。
   */
  markStopReconciled() {
    if (this.snapshot.phase !== 'stopping') return false;
    this.snapshot.phase = 'failed';
    this.snapshot.lastError = `生成已停止${this.snapshot.stopReason ? `（${this.snapshot.stopReason}）` : ''}；可从头重试（不会重复创建玩家消息）`;
    return true;
  }

  /**
   * Phase 3：从头重试（helper-generate 停止后的默认恢复；计划 §3.2）。
   * 复用同一 requestId 与玩家楼层，生成新 attemptId/generationId/commitKey，
   * 重新调一次 generate()，落新正式 assistant 楼层。与 native 的“继续(/continue)”分开。
   */
  async retryFromScratch(request: GalAnyRequest): Promise<MessageTransactionSnapshot> {
    this.reconcile();
    if (this.snapshot.recovery) {
      throw new Error('上次请求处于恢复态（未完成/冲突），禁止自动重发；请手动处理');
    }
    if (this.snapshot.phase !== 'failed' || !this.snapshot.userMessageCreated) {
      throw new Error('当前没有可从头重试的失败事务');
    }
    if (this.host.currentChatId().trim() !== this.snapshot.chatId) {
      throw new Error('聊天已经切换，不能在新聊天中重试旧事务');
    }
    if (request.requestId !== this.snapshot.requestId) {
      throw new Error('从头重试的 requestId 与当前事务不一致');
    }
    const attempt = createGalGenerationAttempt(request, 'send', request.attemptSeq ?? 1);
    this.snapshot.attemptId = attempt.attemptId;
    this.snapshot.generationId = attempt.generationId;
    this.snapshot.commitKey = attempt.commitKey;
    this.snapshot.attemptSeq = request.attemptSeq ?? 1;
    this.snapshot.phase = 'generating';
    this.snapshot.lastError = undefined;
    this.stopped = false;
    this.generationEnded = false;
    try {
      await this.host.triggerGeneration();
      if (!this.host.isGenerationActive || !this.host.isGenerationActive()) this.generationEnded = true;
      await this.waitForAssistant();
      const completedDuringGeneration = this.read();
      if (['settled', 'failed', 'stopping'].includes(completedDuringGeneration.phase)) return completedDuringGeneration;
      this.snapshot.phase = 'settling';
      this.reconcile(true);
      if (!this.snapshot.assistantResponded) {
        this.snapshot.phase = 'failed';
        this.snapshot.lastError = '从头重试已结束，但仍没有收到可用的 assistant 正文';
      }
      return this.read();
    } catch (error) {
      this.snapshot.phase = 'failed';
      this.snapshot.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  markGenerationEnded() {
    // Luker's plugin-takeover path may emit this before the final assistant body
    // lands. It completes only when reconcile can also see non-empty text.
    this.generationEnded = true;
    this.reconcile(true);
  }

  markStreamTokenReceived() {
    // Tokens are only a refresh hint. The message floor remains the single source
    // of truth, preventing an uncommitted stream fragment from being settled.
    this.reconcile(true);
  }

  markAssistantMessageReceived(messageId: unknown) {
    const id = Number(messageId);
    if (!Number.isInteger(id) || id < 0) return;
    // In Luker this event is emitted after the reply is persisted, but the helper
    // message list may need one more turn of the event loop before it reflects it.
    // Reconcile now and let waitForAssistant continue polling the same transaction.
    this.reconcile(true);
  }

  markSettlementFailed(error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    if (this.snapshot.assistantResponded) {
      this.snapshot.phase = 'settled';
      this.snapshot.lastError = `回复已保存，但 MVU 更新失败：${detail}；可以继续发送`;
      return;
    }
    this.snapshot.phase = 'failed';
    this.snapshot.lastError = `本地结算失败：${detail}`;
  }

  markSettlementSucceeded() {
    if (!this.snapshot.assistantResponded) {
      this.snapshot.phase = 'failed';
      this.snapshot.lastError = '尚未收到 assistant 正文，不能完成本地结算';
      return;
    }
    this.snapshot.phase = 'settled';
    this.snapshot.lastError = undefined;
  }

  resetAfterLocalEnd() {
    this.snapshot = idleSnapshot();
    this.stopped = false;
    this.generationEnded = false;
  }

  resetForChatChange() {
    this.resetAfterLocalEnd();
  }

  /**
   * Phase 4：从真实聊天重建事务（计划 §4.2）。由 analyzeChatRestore 的判定驱动。
   * - incomplete：玩家楼层存在但无 commit → failed + recovery='incomplete'（禁止自动重发）；
   * - conflict：metadata 冲突 → failed + recovery='conflict'（人工确认）；
   * - confirmed：commit 已存在（MVU data 随落楼写入，即最终状态）→ settled + recovery='confirmed'；
   * - none：不动（正常开放发送）。
   * 返回是否发生了恢复。
   */
  restoreFromChat(result: ChatRestoreResult): boolean {
    if (result.kind === 'none') return false;
    const base = idleSnapshot();
    if (result.kind === 'incomplete') {
      this.snapshot = {
        ...base,
        phase: 'failed',
        userMessageCreated: true,
        userMessageId: result.userMessageId,
        requestId: result.request.requestId,
        requestSchema: (result.request as { schema?: string }).schema,
        ownerCharacterId: result.request.ownerCharacterId,
        chatId: result.request.chatId,
        recovery: 'incomplete',
        lastError: '上次请求未完成（玩家楼层存在但无回复）；禁止自动重发，请手动处理',
      };
      return true;
    }
    if (result.kind === 'conflict') {
      this.snapshot = {
        ...base,
        phase: 'failed',
        // 填当前 chatId：reconcile 会按 chatId 冻结旧事务——冲突态必须绑定当前聊天避免误冻结。
        chatId: this.host.currentChatId().trim(),
        recovery: 'conflict',
        lastError: '上次请求状态冲突（多条回复），请人工确认',
      };
      return true;
    }
    if (result.kind === 'settlement-pending') {
      this.snapshot = {
        ...base,
        phase: 'settled',
        userMessageCreated: true,
        assistantResponded: true,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
        requestId: result.request.requestId,
        requestSchema: (result.request as { schema?: string }).schema,
        attemptId: result.attempt.attemptId,
        generationId: result.attempt.generationId,
        commitKey: result.attempt.commitKey,
        ownerCharacterId: result.request.ownerCharacterId,
        chatId: result.request.chatId,
        recovery: 'settlement',
        lastError: '上一轮回复已经保存，但 MVU 归档未完成；当前聊天可以继续发送',
      };
      return true;
    }
    this.snapshot = {
      ...base,
      phase: 'settled',
      userMessageCreated: true,
      assistantResponded: true,
      userMessageId: result.userMessageId,
      assistantMessageId: result.assistantMessageId,
      requestId: result.request.requestId,
      requestSchema: (result.request as { schema?: string }).schema,
      attemptId: result.attempt.attemptId,
      generationId: result.attempt.generationId,
      commitKey: result.attempt.commitKey,
      ownerCharacterId: result.request.ownerCharacterId,
      chatId: result.request.chatId,
      recovery: 'confirmed',
      startedAt: Date.now(),
    };
    return true;
  }

  private findUserMessage(matchesExisting?: (message: RawMessage) => boolean) {
    return this.host.listMessages().find((message) => {
      if (message.role !== 'user') return false;
      if (messageExtra(message).gensokyoTransactionId === this.snapshot.transactionId) return true;
      return matchesExisting?.(message) ?? false;
    });
  }

  private async waitForAssistant() {
    const startedAt = Date.now();
    const responseTimeoutMs = Math.max(1000, Math.min(120000, this.host.assistantResponseTimeoutMs ?? 120000));
    while (Date.now() - startedAt < responseTimeoutMs) {
      // Some helper builds expose generation activity but omit a matching ENDED
      // callback on takeover paths. Polling the documented state keeps those turns
      // bounded without treating an empty placeholder as a reply.
      if (!this.generationEnded && (!this.host.isGenerationActive || !this.host.isGenerationActive())) {
        this.generationEnded = true;
      }
      this.reconcile(true);
      if ((this.snapshot.assistantResponded && this.generationEnded) || this.snapshot.phase === 'failed') return;
      // Luker clears its native generating UI and emits GENERATION_ENDED before
      // MESSAGE_RECEIVED. Some fake-stream paths also expose neither an assistant
      // floor nor text through getChatMessages during that gap. Therefore neither
      // host-idle nor an absent floor can end this transaction early; only this
      // turn's non-empty assistant text (or the bounded response timeout) can.
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 100));
    }
  }

  private reconcile(force = false) {
    if (this.snapshot.phase === 'idle') return;
    if (this.host.currentChatId().trim() !== this.snapshot.chatId) {
      this.snapshot.phase = 'failed';
      this.snapshot.lastError = '聊天已经切换，旧事务已冻结';
      return;
    }
    const messages = this.host.listMessages();
    let userIndex = messages.findIndex((message) =>
      message.role === 'user'
      && messageExtra(message).gensokyoTransactionId === this.snapshot.transactionId);
    if (userIndex < 0 && Number.isInteger(this.snapshot.userMessageId)) {
      userIndex = messages.findIndex((message) => Number(message.message_id) === this.snapshot.userMessageId);
    }
    if (userIndex < 0) return;
    this.snapshot.userMessageCreated = true;
    this.snapshot.userMessageId = Number(messages[userIndex].message_id);
    // Only block assistant detection while the user floor is still being created.
    // Generation/settling/failed must re-check on MESSAGE_RECEIVED / GENERATION_ENDED,
    // otherwise the UI stays stuck on "对方正在回应" after the real reply lands.
    if (!force && this.snapshot.phase === 'submitting_user') return;
    const assistantCandidates = messages
      .slice(userIndex + 1)
      .filter((message) => message.role === 'assistant' && String(message.message ?? '').trim());
    const assistant = this.snapshot.receiptPolicy === 'next-nonempty-assistant'
      ? assistantCandidates[0]
      : this.snapshot.requestSchema === 'gal-generation-request.v2'
        ? assistantCandidates.find((message) => {
          const metadata = parseAttemptMetadata(message.extra);
          return metadata.ok
            && metadata.value.requestId === this.snapshot.requestId
            && metadata.value.attemptId === this.snapshot.attemptId
            && metadata.value.commitKey === this.snapshot.commitKey
            && metadata.value.chatId === this.snapshot.chatId
            && metadata.value.ownerCharacterId === this.snapshot.ownerCharacterId;
        })
        : assistantCandidates[0];
    if (!assistant) return;
    const assistantWasAlreadyObserved = this.snapshot.assistantResponded;
    this.snapshot.assistantResponded = true;
    this.snapshot.assistantMessageId = Number(assistant.message_id);
    // A streamed fragment is safe to project, but not to settle. Wait for the host
    // completion event as well so local state is never derived from a partial reply.
    if ((this.generationEnded || !this.host.isGenerationActive || !this.host.isGenerationActive())
      && this.snapshot.phase !== 'settled'
      && this.snapshot.phase !== 'stopping'
      && !this.stopped
      && (this.snapshot.phase !== 'failed' || !assistantWasAlreadyObserved)) {
      this.snapshot.phase = 'settling';
      this.snapshot.lastError = undefined;
    }
    this.stopped = false;
  }
}
