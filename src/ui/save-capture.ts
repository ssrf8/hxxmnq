import {
  SAVE_SCHEMA,
  cloneJson,
  normalizeSaveLabel,
  validateSavePayload,
  type GensokyoSaveV1,
  type SavedChatMessageV1,
  type SavedMvuDataV1,
  type SaveSlotId,
} from './save-schema';

export interface SaveCaptureAdapter {
  currentChatId(): string;
  listMessages(): Array<Record<string, unknown>>;
  readMvuData(): Record<string, unknown>;
  now(): string;
  appSchemaVersion(mvu: Record<string, unknown>): string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMessage(message: Record<string, unknown>): SavedChatMessageV1 {
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

function messageBoundary(messages: Array<Record<string, unknown>>): string {
  const last = messages.at(-1);
  return `${messages.length}:${String(last?.message_id ?? '')}:${String(last?.message ?? '').length}`;
}

export function captureSavePayload(adapter: SaveCaptureAdapter, slotId: SaveSlotId, labelInput: unknown): GensokyoSaveV1 {
  const chatId = adapter.currentChatId();
  if (!chatId) throw new Error('当前聊天身份不可用');
  const before = adapter.listMessages();
  if (before.length === 0) throw new Error('当前聊天没有可保存楼层');
  const boundary = messageBoundary(before);
  const mvu = cloneJson(adapter.readMvuData());
  if (!isRecord(mvu.stat_data)) throw new Error('MVU 尚未初始化');
  const after = adapter.listMessages();
  if (adapter.currentChatId() !== chatId || messageBoundary(after) !== boundary) throw new Error('捕获期间聊天发生变化');

  return validateSavePayload({
    schema: SAVE_SCHEMA,
    slotId,
    label: normalizeSaveLabel(labelInput),
    capturedAt: adapter.now(),
    appSchemaVersion: adapter.appSchemaVersion(mvu),
    messageCount: before.length,
    messages: before.map(normalizeMessage),
    mvu: mvu as SavedMvuDataV1,
  }, slotId);
}
