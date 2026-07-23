import type { MessageTransactionKind, MessageTransactionSnapshot } from './types';

type RawMessage = Record<string, unknown>;

interface SubmitRequest {
  kind: MessageTransactionKind;
  message: string;
  transactionId?: string;
  matchesExisting?: (message: RawMessage) => boolean;
}

interface TransactionHost {
  currentChatId(): string;
  listMessages(): RawMessage[];
  createUserMessage(message: string, extra: Record<string, unknown>): Promise<void>;
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
    if (['submitting_user', 'generating', 'settling'].includes(this.snapshot.phase)) {
      throw new Error('上一条消息仍在处理中，请等待回复或停止生成');
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
        });
        if (this.host.currentChatId().trim() !== chatId) {
          throw new Error('聊天在消息创建期间发生切换');
        }
        const created = this.findUserMessage(request.matchesExisting);
        this.snapshot.userMessageCreated = true;
        if (created) this.snapshot.userMessageId = Number(created.message_id);
      }

      this.snapshot.phase = 'generating';
      await this.host.triggerGeneration();
      this.snapshot.phase = 'settling';
      this.reconcile(true);
      if (!this.snapshot.assistantResponded) this.snapshot.phase = 'generating';
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
      this.snapshot.phase = 'settled';
      return this.read();
    }
    const shouldContinue = this.stopped;
    this.snapshot.phase = 'generating';
    this.snapshot.lastError = undefined;
    this.stopped = false;
    try {
      if (shouldContinue) await this.host.continueGeneration();
      else await this.host.triggerGeneration();
      this.snapshot.phase = 'settling';
      this.reconcile(true);
      if (!this.snapshot.assistantResponded) this.snapshot.phase = 'generating';
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

  private findUserMessage(matchesExisting?: (message: RawMessage) => boolean) {
    return this.host.listMessages().find((message) => {
      if (message.role !== 'user') return false;
      if (messageExtra(message).gensokyoTransactionId === this.snapshot.transactionId) return true;
      return matchesExisting?.(message) ?? false;
    });
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
    if (!force && (this.snapshot.phase === 'submitting_user' || this.snapshot.phase === 'generating' || this.stopped)) return;
    const assistant = messages
      .slice(userIndex + 1)
      .find((message) => message.role === 'assistant' && String(message.message ?? '').trim());
    if (!assistant) return;
    this.snapshot.assistantResponded = true;
    this.snapshot.assistantMessageId = Number(assistant.message_id);
    this.snapshot.phase = 'settled';
    this.snapshot.lastError = undefined;
  }
}
