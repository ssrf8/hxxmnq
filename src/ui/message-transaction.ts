import type { MessageTransactionKind, MessageTransactionSnapshot } from './types';

type RawMessage = Record<string, unknown>;

interface SubmitRequest {
  kind: MessageTransactionKind;
  message: string;
  transactionId?: string;
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
    this.snapshot = {
      transactionId: id,
      chatId,
      kind: request.kind,
      phase: 'submitting_user',
      userMessageCreated: false,
      assistantResponded: false,
      startedAt: Date.now(),
    };
    this.stopped = false;

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

      this.snapshot.phase = 'generating';
      // A freshly inserted floor can trigger host/regex refresh work. Let that
      // lifecycle drain before starting the model so GENERATION_STARTED is not
      // emitted into a listener-remount gap. Retries deliberately skip this:
      // their user floor is already durable and stable.
      if (createdUserMessage) await this.host.prepareGeneration?.();
      await this.host.triggerGeneration();
      await this.waitForAssistant();
      const completedDuringGeneration = this.read();
      if (completedDuringGeneration.phase === 'settled') return completedDuringGeneration;
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
    try {
      if (shouldContinue) await this.host.continueGeneration();
      else await this.host.triggerGeneration();
      await this.waitForAssistant();
      const completedDuringGeneration = this.read();
      if (completedDuringGeneration.phase === 'settled') return completedDuringGeneration;
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

  markStopped() {
    if (this.snapshot.phase !== 'generating') return;
    this.stopped = true;
    this.snapshot.phase = 'failed';
    this.snapshot.lastError = '生成已由玩家停止，可继续生成而不会重复创建玩家消息';
  }

  markGenerationEnded() {
    // Luker's plugin-takeover path deliberately emits GENERATION_ENDED before
    // MESSAGE_RECEIVED. Keep the transaction busy until its assistant reply is
    // observable; otherwise the GAL briefly renders a false retry/end state.
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
    this.snapshot.phase = 'failed';
    this.snapshot.lastError = `本地结算失败：${error instanceof Error ? error.message : String(error)}`;
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
      this.reconcile(true);
      if (this.snapshot.assistantResponded || this.snapshot.phase === 'failed') return;
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
    const assistant = messages
      .slice(userIndex + 1)
      .find((message) => message.role === 'assistant' && String(message.message ?? '').trim());
    if (!assistant) return;
    const assistantWasAlreadyObserved = this.snapshot.assistantResponded;
    this.snapshot.assistantResponded = true;
    this.snapshot.assistantMessageId = Number(assistant.message_id);
    // Receiving text only ends model generation. MVU analysis and local writes still
    // belong to this transaction, so only markSettlementSucceeded may fully settle it.
    if (this.snapshot.phase !== 'settled'
      && (this.snapshot.phase !== 'failed' || !assistantWasAlreadyObserved)) {
      this.snapshot.phase = 'settling';
      this.snapshot.lastError = undefined;
    }
    this.stopped = false;
  }
}
