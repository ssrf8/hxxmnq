// B4-T03 归档 schema、normalizer 与纯记录转换。
// 本模块不调用数据库、不写 MVU、不读取 host；所有数据库召回行必须先经过这里。
import type { RelationshipMemory, TimePeriod, VisitTurn } from './types';
import {
  deterministicStringHash,
  RELATIONSHIP_SUMMARY_CHARS,
  TURN_SUMMARY_CHARS,
} from './character-memory';

export const MEMORY_ARCHIVE_SCHEMA_VERSION = 'gal-memory-archive.v1';
export const MEMORY_ARCHIVE_SCHEMA_REVISION = 'gal-memory-archive-v1' as const;

export const STORY_ARCHIVE_TABLE = 'gal_story_memory_archive';
export const RELATIONSHIP_ARCHIVE_TABLE = 'gal_relationship_memory_archive';
export const STORY_ARCHIVE_TABLE_CN = 'GAL剧情记忆归档表';
export const RELATIONSHIP_ARCHIVE_TABLE_CN = 'GAL关系记忆归档表';

export const STORY_RECALL_PER_CHARACTER = 24;
export const RELATIONSHIP_RECALL_PER_CHARACTER = 12;
export const SCOPE_OWNER_MAX_CHARS = 128;
export const SCOPE_CHAT_MAX_CHARS = 512;

const CHARACTER_ID_MAX_CHARS = 48;
const STABLE_ID_MAX_CHARS = 128;
const VISIT_ID_MAX_CHARS = 64;
const REQUEST_ID_MAX_CHARS = 96;
const SCENE_ID_MAX_CHARS = 96;
const DAY_MAX_CHARS = 40;
const RAW_SUMMARY_MAX_CHARS = 2000;
const SAFE_ID = /^[A-Za-z0-9._:-]+$/u;
const TIME_PERIODS: readonly TimePeriod[] = ['清晨', '白昼', '黄昏', '夜晚'];
const RELATIONSHIP_KINDS = ['relationship_state', 'milestone', 'boundary', 'conflict', 'reconciliation'] as const;
const RELATIONSHIP_LABELS = ['stranger', 'acquaintance', 'friend', 'close_friend', 'lover', 'estranged'] as const;
const EVENT_KINDS = ['trust', 'affection', 'confession', 'kiss', 'adult_intimacy', 'promise', 'breakup'] as const;

export type ArchiveErrorCode =
  | 'invalid-scope'
  | 'invalid-stable-id'
  | 'invalid-character'
  | 'invalid-kind'
  | 'invalid-enum'
  | 'missing-field'
  | 'oversized'
  | 'unsafe-content'
  | 'old-schema';

export interface ArchiveError {
  code: ArchiveErrorCode;
  field?: string;
  detail: string;
}

export type NormalizeResult<T> = { ok: true; value: T } | { ok: false; error: ArchiveError };

export interface ArchiveScopeInput {
  ownerCharacterId: string;
  chatId: string;
}

export type ScopeResult = { ok: true; archiveScopeId: string } | { ok: false; error: ArchiveError };

export function buildArchiveScopeId(input: ArchiveScopeInput): ScopeResult {
  const owner = input.ownerCharacterId.trim();
  const chat = input.chatId.trim();
  if (!owner || !chat) {
    return { ok: false, error: { code: 'invalid-scope', detail: 'owner 与 chat 均不得为空' } };
  }
  if (owner.length > SCOPE_OWNER_MAX_CHARS || chat.length > SCOPE_CHAT_MAX_CHARS) {
    return { ok: false, error: { code: 'invalid-scope', detail: 'owner 或 chat 超出长度上限' } };
  }
  return { ok: true, archiveScopeId: `gal-scope.v1|owner=${owner.length}:${owner}|chat=${chat.length}:${chat}` };
}

function readLengthPrefixed(value: string, cursor: number): { text: string; cursor: number } | null {
  const colon = value.indexOf(':', cursor);
  if (colon < cursor) return null;
  const lengthText = value.slice(cursor, colon);
  if (!/^(0|[1-9]\d*)$/u.test(lengthText)) return null;
  const length = Number(lengthText);
  if (!Number.isSafeInteger(length)) return null;
  const start = colon + 1;
  const end = start + length;
  if (end > value.length) return null;
  return { text: value.slice(start, end), cursor: end };
}

/** 严格解析长度前缀，不能只检查字符串前缀。 */
export function isValidArchiveScopeId(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('gal-scope.v1|owner=')) return false;
  const owner = readLengthPrefixed(value, 'gal-scope.v1|owner='.length);
  if (!owner || value.slice(owner.cursor, owner.cursor + 6) !== '|chat=') return false;
  const chat = readLengthPrefixed(value, owner.cursor + 6);
  if (!chat || chat.cursor !== value.length) return false;
  return owner.text.length > 0
    && owner.text.length <= SCOPE_OWNER_MAX_CHARS
    && owner.text === owner.text.trim()
    && chat.text.length > 0
    && chat.text.length <= SCOPE_CHAT_MAX_CHARS
    && chat.text === chat.text.trim();
}

export type ArchiveKind = 'story' | 'relationship';

export interface ArchiveKeyInput {
  archiveScopeId: string;
  kind: ArchiveKind;
  stableId: string;
}

export function buildArchiveKey(input: ArchiveKeyInput): string {
  return `gal-archive.v1|scope=${input.archiveScopeId.length}:${input.archiveScopeId}|kind=${input.kind}|id=${input.stableId.length}:${input.stableId}`;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) output[key] = canonicalize(value[key]);
    }
    return output;
  }
  return String(value);
}

/** 无字段边界歧义的 canonical JSON。 */
export function stableSerializeRecord(fields: Record<string, unknown>): string {
  return JSON.stringify(canonicalize(fields));
}

export function buildContentHash(content: string): string {
  return deterministicStringHash(content);
}

function validId(value: unknown, maxChars: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxChars
    && value === value.trim()
    && SAFE_ID.test(value);
}

function normalizeSummary(value: unknown, limit: number): NormalizeResult<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: { code: 'missing-field', field: 'summary', detail: '摘要不得为空' } };
  }
  if (value.length > RAW_SUMMARY_MAX_CHARS) {
    return { ok: false, error: { code: 'oversized', field: 'summary', detail: '摘要疑似完整正文' } };
  }
  if (/<[^>]*>/u.test(value)
    || /(?:javascript|vbscript)\s*:/iu.test(value)
    || /data\s*:\s*text\/html/iu.test(value)
    || /\u0000/u.test(value)) {
    return { ok: false, error: { code: 'unsafe-content', field: 'summary', detail: '摘要包含 HTML 或协议片段' } };
  }
  return { ok: true, value: value.replace(/\s+/gu, ' ').trim().slice(0, limit) };
}

function normalizeDay(value: unknown): NormalizeResult<string | null> {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (Number.isInteger(value) && (value as number) >= 1) return { ok: true, value: String(value) };
  if (typeof value === 'string' && value.trim() && value.length <= DAY_MAX_CHARS && !/[\u0000-\u001f]/u.test(value)) {
    return { ok: true, value: value.trim() };
  }
  return { ok: false, error: { code: 'invalid-enum', field: 'day', detail: 'day 格式非法' } };
}

function normalizeTimePeriod(value: unknown): NormalizeResult<TimePeriod | null> {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value === 'string' && TIME_PERIODS.includes(value as TimePeriod)) {
    return { ok: true, value: value as TimePeriod };
  }
  return { ok: false, error: { code: 'invalid-enum', field: 'time_period', detail: 'time_period 不在白名单' } };
}

function normalizePeriodSerial(value: unknown): NormalizeResult<number | null> {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (Number.isInteger(value) && (value as number) >= 0) return { ok: true, value: value as number };
  return { ok: false, error: { code: 'invalid-enum', field: 'period_serial', detail: 'period_serial 必须是非负整数' } };
}

function validateScope(scope: unknown): ArchiveError | null {
  return isValidArchiveScopeId(scope)
    ? null
    : { code: 'invalid-scope', field: 'archive_scope_id', detail: 'archive scope 格式非法' };
}

export interface StoryArchiveRecord {
  archiveSchemaVersion: typeof MEMORY_ARCHIVE_SCHEMA_VERSION;
  archiveKey: string;
  archiveScopeId: string;
  memoryId: string;
  characterId: string;
  visitId: string;
  requestId: string;
  sceneId: string | null;
  day: string | null;
  timePeriod: TimePeriod | null;
  periodSerial: number | null;
  summary: string;
  sourceRevision: typeof MEMORY_ARCHIVE_SCHEMA_REVISION;
  contentHash: string;
}

export function toStoryArchiveRecord(input: {
  turn: VisitTurn;
  visitId: string;
  archiveScopeId: string;
  sourceRevision?: string;
}): NormalizeResult<StoryArchiveRecord> {
  const scopeError = validateScope(input.archiveScopeId);
  if (scopeError) return { ok: false, error: scopeError };
  if (!validId(input.turn.turn_id, STABLE_ID_MAX_CHARS)) return { ok: false, error: { code: 'invalid-stable-id', field: 'turn_id', detail: 'story 稳定 ID 非法' } };
  if (!validId(input.turn.character_id, CHARACTER_ID_MAX_CHARS)) return { ok: false, error: { code: 'invalid-character', field: 'character_id', detail: '角色 ID 非法' } };
  if (!validId(input.visitId, VISIT_ID_MAX_CHARS)) return { ok: false, error: { code: 'missing-field', field: 'visit_id', detail: '入场 ID 非法' } };
  if (!validId(input.turn.request_id, REQUEST_ID_MAX_CHARS)) return { ok: false, error: { code: 'missing-field', field: 'request_id', detail: '请求 ID 非法' } };
  if (input.sourceRevision !== undefined && input.sourceRevision !== MEMORY_ARCHIVE_SCHEMA_REVISION) return { ok: false, error: { code: 'old-schema', field: 'source_revision', detail: 'source revision 不支持' } };
  const summary = normalizeSummary(input.turn.summary, TURN_SUMMARY_CHARS);
  if (!summary.ok) return summary;
  const day = normalizeDay(input.turn.day);
  if (!day.ok) return day;
  const timePeriod = normalizeTimePeriod(input.turn.time_period);
  if (!timePeriod.ok) return timePeriod;
  const periodSerial = normalizePeriodSerial(input.turn.period_serial);
  if (!periodSerial.ok) return periodSerial;
  const sceneId = input.turn.scene_id === null ? null : input.turn.scene_id;
  if (sceneId !== null && !validId(sceneId, SCENE_ID_MAX_CHARS)) return { ok: false, error: { code: 'missing-field', field: 'scene_id', detail: 'scene_id 非法' } };
  const content = stableSerializeRecord({
    summary: summary.value,
    day: day.value,
    timePeriod: timePeriod.value,
    periodSerial: periodSerial.value,
  });
  const archiveKey = buildArchiveKey({ archiveScopeId: input.archiveScopeId, kind: 'story', stableId: input.turn.turn_id });
  return {
    ok: true,
    value: {
      archiveSchemaVersion: MEMORY_ARCHIVE_SCHEMA_VERSION,
      archiveKey,
      archiveScopeId: input.archiveScopeId,
      memoryId: input.turn.turn_id,
      characterId: input.turn.character_id,
      visitId: input.visitId,
      requestId: input.turn.request_id,
      sceneId,
      day: day.value,
      timePeriod: timePeriod.value,
      periodSerial: periodSerial.value,
      summary: summary.value,
      sourceRevision: MEMORY_ARCHIVE_SCHEMA_REVISION,
      contentHash: buildContentHash(content),
    },
  };
}

export interface RelationshipArchiveRecord {
  archiveSchemaVersion: typeof MEMORY_ARCHIVE_SCHEMA_VERSION;
  archiveKey: string;
  archiveScopeId: string;
  relationshipMemoryId: string;
  characterId: string;
  visitId: string | null;
  requestId: string;
  kind: RelationshipMemory['kind'];
  relationshipLabel: RelationshipMemory['relationship_label'];
  eventKind: RelationshipMemory['event_kind'];
  day: string | null;
  timePeriod: TimePeriod | null;
  periodSerial: number | null;
  summary: string;
  significance: 1 | 2 | 3;
  active: boolean;
  sourceRevision: typeof MEMORY_ARCHIVE_SCHEMA_REVISION;
  contentHash: string;
}

export function toRelationshipArchiveRecord(input: {
  memory: RelationshipMemory;
  archiveScopeId: string;
  sourceRevision?: string;
}): NormalizeResult<RelationshipArchiveRecord> {
  const scopeError = validateScope(input.archiveScopeId);
  if (scopeError) return { ok: false, error: scopeError };
  const memory = input.memory;
  if (!validId(memory.relationship_memory_id, STABLE_ID_MAX_CHARS)) return { ok: false, error: { code: 'invalid-stable-id', field: 'relationship_memory_id', detail: '关系记忆稳定 ID 非法' } };
  if (!validId(memory.character_id, CHARACTER_ID_MAX_CHARS)) return { ok: false, error: { code: 'invalid-character', field: 'character_id', detail: '角色 ID 非法' } };
  if (!RELATIONSHIP_KINDS.includes(memory.kind)) return { ok: false, error: { code: 'invalid-enum', field: 'kind', detail: 'kind 不在白名单' } };
  if (memory.relationship_label !== null && !RELATIONSHIP_LABELS.includes(memory.relationship_label)) return { ok: false, error: { code: 'invalid-enum', field: 'relationship_label', detail: 'relationship_label 不在白名单' } };
  if (memory.event_kind !== null && !EVENT_KINDS.includes(memory.event_kind)) return { ok: false, error: { code: 'invalid-enum', field: 'event_kind', detail: 'event_kind 不在白名单' } };
  if (memory.significance !== 1 && memory.significance !== 2 && memory.significance !== 3) return { ok: false, error: { code: 'invalid-enum', field: 'significance', detail: 'significance 非法' } };
  if (typeof memory.active !== 'boolean') return { ok: false, error: { code: 'invalid-enum', field: 'active', detail: 'active 非法' } };
  if (input.sourceRevision !== undefined && input.sourceRevision !== MEMORY_ARCHIVE_SCHEMA_REVISION) return { ok: false, error: { code: 'old-schema', field: 'source_revision', detail: 'source revision 不支持' } };
  const visitId = memory.visit_id === null ? null : validId(memory.visit_id, VISIT_ID_MAX_CHARS) ? memory.visit_id : null;
  if (memory.visit_id !== null && visitId === null) return { ok: false, error: { code: 'missing-field', field: 'visit_id', detail: 'visit_id 非法' } };
  const requestId = typeof memory.request_id === 'string' ? memory.request_id : '';
  if (requestId !== '' && !validId(requestId, REQUEST_ID_MAX_CHARS)) return { ok: false, error: { code: 'missing-field', field: 'request_id', detail: 'request_id 非法' } };
  const summary = normalizeSummary(memory.summary, RELATIONSHIP_SUMMARY_CHARS);
  if (!summary.ok) return summary;
  const day = normalizeDay(memory.day);
  if (!day.ok) return day;
  const timePeriod = normalizeTimePeriod(memory.time_period);
  if (!timePeriod.ok) return timePeriod;
  const periodSerial = normalizePeriodSerial(memory.period_serial);
  if (!periodSerial.ok) return periodSerial;
  const content = stableSerializeRecord({
    summary: summary.value,
    kind: memory.kind,
    relationshipLabel: memory.relationship_label,
    eventKind: memory.event_kind,
    day: day.value,
    timePeriod: timePeriod.value,
    periodSerial: periodSerial.value,
    significance: memory.significance,
    active: memory.active,
  });
  const archiveKey = buildArchiveKey({ archiveScopeId: input.archiveScopeId, kind: 'relationship', stableId: memory.relationship_memory_id });
  return {
    ok: true,
    value: {
      archiveSchemaVersion: MEMORY_ARCHIVE_SCHEMA_VERSION,
      archiveKey,
      archiveScopeId: input.archiveScopeId,
      relationshipMemoryId: memory.relationship_memory_id,
      characterId: memory.character_id,
      visitId,
      requestId,
      kind: memory.kind,
      relationshipLabel: memory.relationship_label,
      eventKind: memory.event_kind,
      day: day.value,
      timePeriod: timePeriod.value,
      periodSerial: periodSerial.value,
      summary: summary.value,
      significance: memory.significance,
      active: memory.active,
      sourceRevision: MEMORY_ARCHIVE_SCHEMA_REVISION,
      contentHash: buildContentHash(content),
    },
  };
}

export interface StoryRecallCandidate {
  source: 'database-archive';
  memoryId: string;
  characterId: string;
  visitId: string;
  day: string | null;
  timePeriod: TimePeriod | null;
  periodSerial: number | null;
  summary: string;
}

export interface RelationshipRecallCandidate {
  source: 'database-archive';
  relationshipMemoryId: string;
  characterId: string;
  kind: RelationshipMemory['kind'];
  relationshipLabel: RelationshipMemory['relationship_label'];
  eventKind: RelationshipMemory['event_kind'];
  day: string | null;
  timePeriod: TimePeriod | null;
  periodSerial: number | null;
  summary: string;
  significance: 1 | 2 | 3;
  active: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRowCommon(
  row: Record<string, unknown>,
  expectedScope: string,
  kind: ArchiveKind,
  stableId: string,
): ArchiveError | null {
  if (row.archive_schema_version !== MEMORY_ARCHIVE_SCHEMA_VERSION) return { code: 'old-schema', field: 'archive_schema_version', detail: 'schema 不匹配' };
  if (row.archive_scope_id !== expectedScope || !isValidArchiveScopeId(row.archive_scope_id)) return { code: 'invalid-scope', field: 'archive_scope_id', detail: 'scope 不匹配' };
  const expectedKey = buildArchiveKey({ archiveScopeId: expectedScope, kind, stableId });
  if (row.archive_key !== expectedKey) return { code: 'invalid-stable-id', field: 'archive_key', detail: 'archive key 与稳定 ID 不一致' };
  if (row.source_revision !== MEMORY_ARCHIVE_SCHEMA_REVISION) return { code: 'old-schema', field: 'source_revision', detail: 'source revision 不支持' };
  if (typeof row.content_hash !== 'string' || !/^[a-f0-9]{8}$/u.test(row.content_hash)) return { code: 'missing-field', field: 'content_hash', detail: 'content hash 非法' };
  return null;
}

export function storyRowToCandidate(row: unknown, expectedScope: string): NormalizeResult<StoryRecallCandidate> {
  if (!isRecord(row)) return { ok: false, error: { code: 'missing-field', detail: '行不是对象' } };
  const memoryId = typeof row.memory_id === 'string' ? row.memory_id : '';
  if (!validId(memoryId, STABLE_ID_MAX_CHARS)) return { ok: false, error: { code: 'invalid-stable-id', field: 'memory_id', detail: '稳定 ID 非法' } };
  const commonError = validateRowCommon(row, expectedScope, 'story', memoryId);
  if (commonError) return { ok: false, error: commonError };
  const characterId = typeof row.character_id === 'string' ? row.character_id : '';
  const visitId = typeof row.visit_id === 'string' ? row.visit_id : '';
  const requestId = typeof row.request_id === 'string' ? row.request_id : '';
  if (!validId(characterId, CHARACTER_ID_MAX_CHARS)) return { ok: false, error: { code: 'invalid-character', field: 'character_id', detail: '角色 ID 非法' } };
  if (!validId(visitId, VISIT_ID_MAX_CHARS)) return { ok: false, error: { code: 'missing-field', field: 'visit_id', detail: '入场 ID 非法' } };
  if (!validId(requestId, REQUEST_ID_MAX_CHARS)) return { ok: false, error: { code: 'missing-field', field: 'request_id', detail: '请求 ID 非法' } };
  const summary = normalizeSummary(row.summary, TURN_SUMMARY_CHARS);
  if (!summary.ok) return summary;
  const day = normalizeDay(row.day);
  if (!day.ok) return day;
  const timePeriod = normalizeTimePeriod(row.time_period);
  if (!timePeriod.ok) return timePeriod;
  const periodSerial = normalizePeriodSerial(row.period_serial);
  if (!periodSerial.ok) return periodSerial;
  return { ok: true, value: { source: 'database-archive', memoryId, characterId, visitId, day: day.value, timePeriod: timePeriod.value, periodSerial: periodSerial.value, summary: summary.value } };
}

export function relationshipRowToCandidate(row: unknown, expectedScope: string): NormalizeResult<RelationshipRecallCandidate> {
  if (!isRecord(row)) return { ok: false, error: { code: 'missing-field', detail: '行不是对象' } };
  const memoryId = typeof row.relationship_memory_id === 'string' ? row.relationship_memory_id : '';
  if (!validId(memoryId, STABLE_ID_MAX_CHARS)) return { ok: false, error: { code: 'invalid-stable-id', field: 'relationship_memory_id', detail: '稳定 ID 非法' } };
  const commonError = validateRowCommon(row, expectedScope, 'relationship', memoryId);
  if (commonError) return { ok: false, error: commonError };
  const characterId = typeof row.character_id === 'string' ? row.character_id : '';
  if (!validId(characterId, CHARACTER_ID_MAX_CHARS)) return { ok: false, error: { code: 'invalid-character', field: 'character_id', detail: '角色 ID 非法' } };
  const visitId = row.visit_id;
  if (visitId !== null && !validId(visitId, VISIT_ID_MAX_CHARS)) return { ok: false, error: { code: 'missing-field', field: 'visit_id', detail: 'visit_id 非法' } };
  const requestId = row.request_id;
  if (typeof requestId !== 'string' || (requestId !== '' && !validId(requestId, REQUEST_ID_MAX_CHARS))) return { ok: false, error: { code: 'missing-field', field: 'request_id', detail: 'request_id 非法' } };
  if (typeof row.kind !== 'string' || !RELATIONSHIP_KINDS.includes(row.kind as RelationshipMemory['kind'])) return { ok: false, error: { code: 'invalid-enum', field: 'kind', detail: 'kind 不在白名单' } };
  if (row.relationship_label !== null && (typeof row.relationship_label !== 'string' || !RELATIONSHIP_LABELS.includes(row.relationship_label as NonNullable<RelationshipMemory['relationship_label']>))) return { ok: false, error: { code: 'invalid-enum', field: 'relationship_label', detail: 'relationship_label 不在白名单' } };
  if (row.event_kind !== null && (typeof row.event_kind !== 'string' || !EVENT_KINDS.includes(row.event_kind as NonNullable<RelationshipMemory['event_kind']>))) return { ok: false, error: { code: 'invalid-enum', field: 'event_kind', detail: 'event_kind 不在白名单' } };
  if (row.significance !== 1 && row.significance !== 2 && row.significance !== 3) return { ok: false, error: { code: 'invalid-enum', field: 'significance', detail: 'significance 非法' } };
  if (![0, 1, true, false, '0', '1'].includes(row.active as never)) return { ok: false, error: { code: 'invalid-enum', field: 'active', detail: 'active 非法' } };
  const summary = normalizeSummary(row.summary, RELATIONSHIP_SUMMARY_CHARS);
  if (!summary.ok) return summary;
  const day = normalizeDay(row.day);
  if (!day.ok) return day;
  const timePeriod = normalizeTimePeriod(row.time_period);
  if (!timePeriod.ok) return timePeriod;
  const periodSerial = normalizePeriodSerial(row.period_serial);
  if (!periodSerial.ok) return periodSerial;
  return {
    ok: true,
    value: {
      source: 'database-archive',
      relationshipMemoryId: memoryId,
      characterId,
      kind: row.kind as RelationshipMemory['kind'],
      relationshipLabel: row.relationship_label as RelationshipMemory['relationship_label'],
      eventKind: row.event_kind as RelationshipMemory['event_kind'],
      day: day.value,
      timePeriod: timePeriod.value,
      periodSerial: periodSerial.value,
      summary: summary.value,
      significance: row.significance as 1 | 2 | 3,
      active: row.active === 1 || row.active === true || row.active === '1',
    },
  };
}
