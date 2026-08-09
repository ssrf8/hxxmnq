export const SAVE_SCHEMA = 'gensokyo-save.v1' as const;
export const SAVE_ENTRY_SOURCE = 'gensokyo-save-v1' as const;
export const SAVE_CHUNK_BYTES = 24 * 1024;
export const SAVE_SLOT_MAX_BYTES = 8 * 1024 * 1024;

export const SAVE_SLOT_IDS = [
  'manual-01', 'manual-02', 'manual-03', 'manual-04',
  'manual-05', 'manual-06', 'manual-07', 'manual-08',
] as const;

export type SaveSlotId = typeof SAVE_SLOT_IDS[number];
export type SavedMvuDataV1 = Record<string, unknown> & { stat_data: Record<string, unknown> };

export interface SavedChatMessageV1 {
  role: 'system' | 'assistant' | 'user';
  name: string;
  is_hidden: boolean;
  message: string;
  data: Record<string, unknown>;
}

export interface GensokyoSaveV1 {
  schema: typeof SAVE_SCHEMA;
  slotId: SaveSlotId;
  label: string;
  capturedAt: string;
  appSchemaVersion: string;
  messageCount: number;
  messages: SavedChatMessageV1[];
  mvu: SavedMvuDataV1;
}

export interface SaveMetaV1 {
  slotId: SaveSlotId;
  label: string;
  capturedAt: string;
  messageCount: number;
  chunkCount: number;
  byteLength: number;
  checksum: `sha256:${string}`;
}

const encoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function assertSaveSlotId(value: unknown): asserts value is SaveSlotId {
  if (!SAVE_SLOT_IDS.includes(value as SaveSlotId)) throw new Error('非法存档槽位');
}

export function normalizeSaveLabel(value: unknown): string {
  const label = String(value ?? '').trim();
  if (!label || [...label].length > 24 || /[\u0000-\u001f\u007f<>]/u.test(label)) {
    throw new Error('存档标签必须为 1～24 个普通字符');
  }
  return label;
}

export function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

export function validateSavePayload(value: unknown, expectedSlotId?: SaveSlotId): GensokyoSaveV1 {
  if (!isRecord(value) || value.schema !== SAVE_SCHEMA) throw new Error('存档 schema 不受支持');
  assertSaveSlotId(value.slotId);
  if (expectedSlotId && value.slotId !== expectedSlotId) throw new Error('存档槽位不匹配');
  const label = normalizeSaveLabel(value.label);
  if (typeof value.capturedAt !== 'string' || !Number.isFinite(Date.parse(value.capturedAt))) throw new Error('存档时间无效');
  if (typeof value.appSchemaVersion !== 'string' || !value.appSchemaVersion.trim()) throw new Error('应用 schema 版本缺失');
  if (!Array.isArray(value.messages) || value.messages.length === 0) throw new Error('存档没有消息');
  if (!Number.isSafeInteger(value.messageCount) || value.messageCount !== value.messages.length) throw new Error('存档消息数不匹配');

  const messages = value.messages.map((item) => {
    if (!isRecord(item) || !['system', 'assistant', 'user'].includes(String(item.role))) throw new Error('存档消息角色无效');
    if (typeof item.name !== 'string' || typeof item.message !== 'string' || typeof item.is_hidden !== 'boolean' || !isRecord(item.data)) {
      throw new Error('存档消息字段无效');
    }
    return {
      role: item.role as SavedChatMessageV1['role'],
      name: item.name,
      is_hidden: item.is_hidden,
      message: item.message,
      data: cloneJson(item.data),
    } as SavedChatMessageV1;
  });
  if (!isRecord(value.mvu) || !isRecord(value.mvu.stat_data)) throw new Error('存档 MVU 无效');

  return {
    schema: SAVE_SCHEMA,
    slotId: value.slotId,
    label,
    capturedAt: value.capturedAt,
    appSchemaVersion: value.appSchemaVersion,
    messageCount: messages.length,
    messages,
    mvu: cloneJson(value.mvu) as SavedMvuDataV1,
  };
}

export function serializeSavePayload(payload: GensokyoSaveV1): string {
  return JSON.stringify(validateSavePayload(payload, payload.slotId));
}

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

export function splitUtf8(value: string, maxBytes = SAVE_CHUNK_BYTES): string[] {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4) throw new Error('分块大小无效');
  const chunks: string[] = [];
  let chunk = '';
  let bytes = 0;
  for (const symbol of value) {
    const symbolBytes = utf8ByteLength(symbol);
    if (symbolBytes > maxBytes) throw new Error('单个字符超过分块上限');
    if (chunk && bytes + symbolBytes > maxBytes) {
      chunks.push(chunk);
      chunk = '';
      bytes = 0;
    }
    chunk += symbol;
    bytes += symbolBytes;
  }
  if (chunk || value === '') chunks.push(chunk);
  return chunks;
}

export async function sha256(value: string): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

export async function encodeSavePayload(payload: GensokyoSaveV1): Promise<{ meta: SaveMetaV1; chunks: string[] }> {
  const json = serializeSavePayload(payload);
  const byteLength = utf8ByteLength(json);
  if (byteLength > SAVE_SLOT_MAX_BYTES) throw new Error('存档超过 8 MiB 上限');
  const chunks = splitUtf8(json);
  return {
    meta: {
      slotId: payload.slotId,
      label: payload.label,
      capturedAt: payload.capturedAt,
      messageCount: payload.messageCount,
      chunkCount: chunks.length,
      byteLength,
      checksum: await sha256(json),
    },
    chunks,
  };
}

export async function decodeSavePayload(meta: SaveMetaV1, chunks: string[]): Promise<GensokyoSaveV1> {
  assertSaveSlotId(meta.slotId);
  normalizeSaveLabel(meta.label);
  if (!Number.isSafeInteger(meta.chunkCount) || meta.chunkCount < 1 || chunks.length !== meta.chunkCount) throw new Error('存档分块数量不匹配');
  const json = chunks.join('');
  if (utf8ByteLength(json) !== meta.byteLength) throw new Error('存档字节数不匹配');
  if (await sha256(json) !== meta.checksum) throw new Error('存档校验失败');
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('存档 JSON 损坏'); }
  const payload = validateSavePayload(parsed, meta.slotId);
  if (payload.messageCount !== meta.messageCount || payload.label !== meta.label || payload.capturedAt !== meta.capturedAt) {
    throw new Error('存档元数据不匹配');
  }
  return payload;
}
