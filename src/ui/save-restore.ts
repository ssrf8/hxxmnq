import { cloneJson, sha256, validateSavePayload, type GensokyoSaveV1, type SavedChatMessageV1, type SavedMvuDataV1 } from './save-schema';

const BATCH_SIZE = 50;

export interface SaveRestoreAdapter {
  currentChatId(): string;
  listMessages(): Array<Record<string, unknown>>;
  readMvuData(): Record<string, unknown>;
  deleteMessages(ids: number[]): Promise<void>;
  createMessages(messages: SavedChatMessageV1[]): Promise<void>;
  replaceChatMvu(mvu: SavedMvuDataV1): Promise<void>;
  clearTransientState(): Promise<void> | void;
  reloadCurrentChat(): Promise<void>;
}

export interface RestoreResult {
  restoredMessageCount: number;
  rollbackUsed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCurrentMessage(message: Record<string, unknown>): SavedChatMessageV1 {
  const role = String(message.role);
  if (!['system', 'assistant', 'user'].includes(role)) throw new Error('当前聊天含非法消息角色');
  return {
    role: role as SavedChatMessageV1['role'],
    name: typeof message.name === 'string' ? message.name : '',
    is_hidden: message.is_hidden === true,
    message: typeof message.message === 'string' ? message.message : '',
    data: isRecord(message.data) ? cloneJson(message.data) : {},
  };
}

function chunks<T>(items: T[], size = BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function currentMessageIds(messages: Array<Record<string, unknown>>): number[] {
  return messages.map((message, index) => Number.isSafeInteger(message.message_id) ? Number(message.message_id) : index).sort((a, b) => b - a);
}

async function deleteAll(adapter: SaveRestoreAdapter) {
  for (const batch of chunks(currentMessageIds(adapter.listMessages()))) await adapter.deleteMessages(batch);
}

async function createAll(adapter: SaveRestoreAdapter, messages: SavedChatMessageV1[]) {
  for (const batch of chunks(messages)) await adapter.createMessages(cloneJson(batch));
}

async function assertMvuRoundTrip(adapter: SaveRestoreAdapter, expected: SavedMvuDataV1) {
  const [actualHash, expectedHash] = await Promise.all([
    sha256(JSON.stringify(adapter.readMvuData())),
    sha256(JSON.stringify(expected)),
  ]);
  if (actualHash !== expectedHash) throw new Error('MVU 写后复读不一致');
}

export async function restoreSavePayload(adapter: SaveRestoreAdapter, candidate: unknown): Promise<RestoreResult> {
  // Full schema/checksum validation is expected before this function; the deep
  // payload validation here is deliberately repeated before the first delete.
  const target = validateSavePayload(candidate);
  const chatId = adapter.currentChatId();
  if (!chatId) throw new Error('当前聊天身份不可用');
  const previousRaw = adapter.listMessages();
  if (previousRaw.length === 0) throw new Error('当前聊天没有可回滚楼层');
  const previousMessages = previousRaw.map(normalizeCurrentMessage);
  const previousMvu = cloneJson(adapter.readMvuData());
  if (!isRecord(previousMvu.stat_data)) throw new Error('当前 MVU 无效');
  if (adapter.currentChatId() !== chatId) throw new Error('准备读档时聊天已切换');

  let destructiveStarted = false;
  const assertChatIdentity = () => {
    if (adapter.currentChatId() !== chatId) throw new Error('读档期间聊天已切换');
  };
  try {
    destructiveStarted = true;
    await deleteAll(adapter);
    assertChatIdentity();
    await createAll(adapter, target.messages);
    assertChatIdentity();
    await adapter.replaceChatMvu(cloneJson(target.mvu));
    await assertMvuRoundTrip(adapter, target.mvu);
    assertChatIdentity();
    await adapter.clearTransientState();
    await adapter.reloadCurrentChat();
    return { restoredMessageCount: target.messageCount, rollbackUsed: false };
  } catch (error) {
    if (!destructiveStarted) throw error;
    try {
      if (adapter.currentChatId() !== chatId) throw new Error('聊天已切换，不能跨聊天回滚');
      await deleteAll(adapter);
      await createAll(adapter, previousMessages);
      await adapter.replaceChatMvu(previousMvu as SavedMvuDataV1);
      await assertMvuRoundTrip(adapter, previousMvu as SavedMvuDataV1);
      await adapter.clearTransientState();
      await adapter.reloadCurrentChat();
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], '读档失败且自动回滚失败，请打开原生聊天人工检查');
    }
    throw new Error('读档失败，已恢复读档前进度', { cause: error });
  }
}
