import {
  SAVE_ENTRY_SOURCE,
  SAVE_SCHEMA,
  SAVE_SLOT_IDS,
  decodeSavePayload,
  encodeSavePayload,
  type GensokyoSaveV1,
  type SaveMetaV1,
  type SaveSlotId,
} from './save-schema';

export const SAVE_WORLDBOOK_NAME = '幻想乡物语_存档';

export interface SaveWorldbookEntry {
  uid: number;
  name: string;
  enabled: boolean;
  content: string;
  strategy: { type: 'constant' | 'selective' | 'vectorized'; keys: unknown[]; keys_secondary: { logic: 'and_any'; keys: unknown[] }; scan_depth: 'same_as_global' | number };
  position: { type: 'before_character_definition'; role: 'system'; depth: number; order: number };
  probability: number;
  recursion: { prevent_incoming: boolean; prevent_outgoing: boolean; delay_until: null | number };
  effect: { sticky: null | number; cooldown: null | number; delay: null | number };
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SaveWorldbookAdapter {
  getOrCreateSaveWorldbook(): Promise<string>;
  getWorldbook(name: string): Promise<SaveWorldbookEntry[]>;
  updateWorldbook(name: string, updater: (entries: SaveWorldbookEntry[]) => SaveWorldbookEntry[]): Promise<SaveWorldbookEntry[]>;
}

export interface SaveSlotSummary {
  slotId: SaveSlotId;
  occupied: boolean;
  label?: string;
  capturedAt?: string;
  messageCount?: number;
  gameTimeLabel?: string;
  valid: boolean;
}

function gameTimeLabel(payload: GensokyoSaveV1): string | undefined {
  const environment = payload.mvu.stat_data.environment;
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) return undefined;
  const value = environment as Record<string, unknown>;
  const day = Number(value.day);
  const period = typeof value.time_period === 'string' ? value.time_period : '';
  if (!Number.isFinite(day) && !period) return undefined;
  return `${Number.isFinite(day) ? `第${day}日` : ''}${Number.isFinite(day) && period ? '·' : ''}${period}`;
}

function projectExtra(entry: SaveWorldbookEntry) {
  const extra = entry.extra;
  return extra?.source === SAVE_ENTRY_SOURCE && extra.schema === SAVE_SCHEMA ? extra : null;
}

function belongsToSlot(entry: SaveWorldbookEntry, slotId: SaveSlotId) {
  return projectExtra(entry)?.slotId === slotId;
}

function assertStorageEntryIsInert(entry: SaveWorldbookEntry) {
  if (entry.enabled !== false
    || entry.probability !== 0
    || !Array.isArray(entry.strategy?.keys)
    || entry.strategy.keys.length !== 0
    || entry.recursion?.prevent_incoming !== true
    || entry.recursion?.prevent_outgoing !== true) {
    throw new Error('存档世界书条目不是永久禁用状态');
  }
}

function newEntry(uid: number, name: string, content: string, extra: Record<string, unknown>): SaveWorldbookEntry {
  return {
    uid,
    name,
    enabled: false,
    content,
    strategy: { type: 'selective', keys: [], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
    position: { type: 'before_character_definition', role: 'system', depth: 0, order: 0 },
    probability: 0,
    recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
    effect: { sticky: null, cooldown: null, delay: null },
    extra,
  };
}

function parseMeta(entry: SaveWorldbookEntry, slotId: SaveSlotId): SaveMetaV1 {
  const extra = projectExtra(entry);
  if (!extra || extra.kind !== 'meta' || extra.slotId !== slotId) throw new Error('存档 meta 缺失');
  let value: unknown;
  try { value = JSON.parse(entry.content); } catch { throw new Error('存档 meta 损坏'); }
  if (!value || typeof value !== 'object') throw new Error('存档 meta 损坏');
  return value as SaveMetaV1;
}

export async function readSaveSlotFromEntries(entries: SaveWorldbookEntry[], slotId: SaveSlotId): Promise<GensokyoSaveV1> {
  const owned = entries.filter((entry) => belongsToSlot(entry, slotId));
  owned.forEach(assertStorageEntryIsInert);
  const metas = owned.filter((entry) => projectExtra(entry)?.kind === 'meta');
  if (metas.length !== 1) throw new Error('存档 meta 数量错误');
  const meta = parseMeta(metas[0], slotId);
  const chunks = owned.filter((entry) => projectExtra(entry)?.kind === 'chunk');
  if (chunks.length !== meta.chunkCount) throw new Error('存档 chunk 数量错误');
  const byPart = new Map<number, string>();
  for (const entry of chunks) {
    const part = projectExtra(entry)?.part;
    if (!Number.isSafeInteger(part) || Number(part) < 0 || byPart.has(Number(part))) throw new Error('存档 chunk 序号错误');
    byPart.set(Number(part), entry.content);
  }
  const ordered = Array.from({ length: meta.chunkCount }, (_, part) => {
    if (!byPart.has(part)) throw new Error('存档 chunk 不连续');
    return byPart.get(part)!;
  });
  return decodeSavePayload(meta, ordered);
}

export async function listSaveSlots(adapter: SaveWorldbookAdapter): Promise<SaveSlotSummary[]> {
  const name = await adapter.getOrCreateSaveWorldbook();
  const entries = await adapter.getWorldbook(name);
  return Promise.all(SAVE_SLOT_IDS.map(async (slotId) => {
    const owned = entries.filter((entry) => belongsToSlot(entry, slotId));
    if (owned.length === 0) return { slotId, occupied: false, valid: true };
    try {
      const payload = await readSaveSlotFromEntries(entries, slotId);
      return { slotId, occupied: true, valid: true, label: payload.label, capturedAt: payload.capturedAt, messageCount: payload.messageCount, gameTimeLabel: gameTimeLabel(payload) };
    } catch {
      return { slotId, occupied: true, valid: false };
    }
  }));
}

export async function readSaveSlot(adapter: SaveWorldbookAdapter, slotId: SaveSlotId): Promise<GensokyoSaveV1> {
  const name = await adapter.getOrCreateSaveWorldbook();
  return readSaveSlotFromEntries(await adapter.getWorldbook(name), slotId);
}

export async function writeSaveSlot(adapter: SaveWorldbookAdapter, payload: GensokyoSaveV1): Promise<void> {
  const encoded = await encodeSavePayload(payload);
  const name = await adapter.getOrCreateSaveWorldbook();
  await adapter.updateWorldbook(name, (entries) => {
    const kept = entries.filter((entry) => !belongsToSlot(entry, payload.slotId));
    let uid = entries.reduce((max, entry) => Math.max(max, Number.isSafeInteger(entry.uid) ? entry.uid : -1), -1) + 1;
    const common = { source: SAVE_ENTRY_SOURCE, schema: SAVE_SCHEMA, slotId: payload.slotId };
    return [
      ...kept,
      newEntry(uid++, `[幻想乡存档] ${payload.slotId} meta`, JSON.stringify(encoded.meta), { ...common, kind: 'meta' }),
      ...encoded.chunks.map((chunk, part) => newEntry(uid++, `[幻想乡存档] ${payload.slotId} ${part + 1}/${encoded.chunks.length}`, chunk, { ...common, kind: 'chunk', part })),
    ];
  });
  const reread = await readSaveSlot(adapter, payload.slotId);
  if (JSON.stringify(reread) !== JSON.stringify(payload)) throw new Error('存档写后复读不一致');
}
