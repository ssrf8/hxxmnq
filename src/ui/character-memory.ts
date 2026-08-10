// GAL 角色入场记忆领域库（第一批：数据基础）
// 固定模型标识：gensokyo-character-memory / character-visit-memory.v2
// storage.root: stat_data.interaction.visit_memory（normal multi-floor MVU）
// 本文件为纯领域模块：不读取 window/document、不调用 Mvu、不调用数据库、
// 不修改传入对象、不生成现实时间、不读取真实消息楼层。
// 容量常量集中于此，禁止在别处复制数字（B1-T03 冻结值，不得更改）。

import type {
  CharacterMemory,
  CharacterMemorySource,
  CharacterMemoryVersion,
  CharacterVisitEndReason,
  CharacterVisitMemoryState,
  CharacterVisitMigrationMetadata,
  GardenState,
  LegacyMemory,
  VisitRecord,
  VisitTurn,
} from './types';
import { periodSerialFromState } from './time-rules';

export const STORY_SUMMARIES_PER_CHARACTER = 60;
export const ACTIVE_TURNS_PER_CHARACTER = 16;
export const CLOSED_VISITS_PER_CHARACTER = 4;
export const TURNS_PER_CLOSED_VISIT = 16;
export const LEGACY_MEMORIES_PER_CHARACTER = 16;
export const LEGACY_UNASSIGNED_LIMIT = 24;
export const TURN_SUMMARY_CHARS = 100;

// 固定迁移元数据标识
export const CHARACTER_MEMORY_VERSION = 'character-visit-memory.v2' as const;
export const CHARACTER_MEMORY_MODEL_ID = 'gensokyo-character-memory' as const;

// visit_id 前缀（左补零单调 counter）
export const CHARACTER_VISIT_ID_PREFIX = 'character_visit_';

// legacy story ID 前缀（角色 + 规范化文本 hash）
export const LEGACY_STORY_ID_PREFIX = 'legacy_story:';

// ===== 基础工具（纯、确定性）=====

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

const SOURCES: readonly CharacterMemorySource[] = ['scheduler', 'event', 'model-presence', 'bootstrap', 'reconcile'];
const END_REASONS: readonly CharacterVisitEndReason[] = ['scheduled-departure', 'presence-receipt', 'event-leave', 'reconcile'];

/**
 * 小型确定性字符串 hash（FNV-1a 32-bit → 8 位 hex）。
 * 用途限制：仅用于稳定 ID 派生（legacy story ID）与指纹比较；
 * 不是密码学安全 hash，不用于安全边界。碰撞空间为 2^32，
 * 碰撞处理由调用方（migration）按 stable ID 去重逻辑覆盖（B1-T10 有碰撞测试）。
 */
export function deterministicStringHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeDay(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (Number.isInteger(value) && (value as number) >= 1) return value as number;
  if (typeof value === 'string' && value.trim()) return value.slice(0, 40);
  return null;
}

function normalizeNullableInt(value: unknown): number | null {
  return isNonNegativeInteger(value) ? value : null;
}

function normalizeNullableText(value: unknown, maximum: number): string | null {
  if (typeof value === 'string') return value.slice(0, maximum);
  return null;
}

// ===== 空结构与 ensure =====

export function createEmptyCharacterMemory(characterId: string): CharacterMemory {
  return {
    character_id: characterId,
    active_visit: null,
    closed_visits: [],
    legacy_memories: [],
  };
}

/**
 * 确保 interaction.visit_memory 存在且合法（旧状态没有时建立空根）。
 * 返回新 state；纯函数。
 */
export function ensureVisitMemoryRoot(state: GardenState): GardenState {
  const existing = state.interaction?.visit_memory;
  const normalized = normalizeVisitMemoryState(existing);
  return {
    ...state,
    interaction: { ...(state.interaction ?? {}), visit_memory: normalized },
  };
}

/** 确保某角色拥有独立 CharacterMemory；返回新 state；纯函数。 */
export function ensureCharacterMemory(state: GardenState, characterId: string): GardenState {
  const withRoot = ensureVisitMemoryRoot(state);
  const memory = withRoot.interaction!.visit_memory!;
  if (memory.by_character[characterId]) return withRoot;
  const nextMemory: CharacterVisitMemoryState = {
    ...memory,
    by_character: {
      ...memory.by_character,
      [characterId]: createEmptyCharacterMemory(characterId),
    },
  };
  return {
    ...withRoot,
    interaction: { ...withRoot.interaction!, visit_memory: nextMemory },
  };
}

// ===== normalize 家族（保留未知字段；无稳定 ID 的 malformed 项拒绝而非编造）=====

export function normalizeLegacyMemory(value: unknown): LegacyMemory | null {
  if (!isRecord(value)) return null;
  const legacyId = typeof value.legacy_id === 'string' && value.legacy_id.trim() ? value.legacy_id.slice(0, 96) : null;
  if (!legacyId) return null;
  const characterId = typeof value.character_id === 'string' && value.character_id.trim()
    ? value.character_id.slice(0, 48)
    : null;
  const text = typeof value.text === 'string' ? value.text.slice(0, 240) : '';
  return {
    ...value,
    legacy_id: legacyId,
    character_id: characterId,
    text,
    source: 'conversation_log.v0',
  };
}

export function normalizeVisitTurn(value: unknown): VisitTurn | null {
  if (!isRecord(value)) return null;
  const turnId = typeof value.turn_id === 'string' && value.turn_id.trim() ? value.turn_id.slice(0, 160) : null;
  if (!turnId) return null;
  const characterId = typeof value.character_id === 'string' ? value.character_id.slice(0, 48) : '';
  const summary = typeof value.summary === 'string' ? value.summary.slice(0, TURN_SUMMARY_CHARS) : '';
  return {
    turn_id: turnId,
    character_id: characterId,
    day: normalizeDay(value.day),
    time_period: normalizeNullableText(value.time_period, 24),
    summary,
  };
}

export function normalizeVisitRecord(value: unknown): VisitRecord | null {
  if (!isRecord(value)) return null;
  const visitId = typeof value.visit_id === 'string' && value.visit_id.trim() ? value.visit_id.slice(0, 64) : null;
  if (!visitId) return null;
  const characterId = typeof value.character_id === 'string' ? value.character_id.slice(0, 48) : '';
  const source = isOneOf(value.source, SOURCES) ? value.source : 'scheduler';
  const rawEndReason = value.end_reason;
  const endReason = rawEndReason === null || rawEndReason === undefined
    ? null
    : isOneOf(rawEndReason, END_REASONS)
      ? rawEndReason
      : 'reconcile';
  const turns = Array.isArray(value.turns)
    ? value.turns.map(normalizeVisitTurn).filter((turn): turn is VisitTurn => turn !== null)
    : [];
  return {
    ...value,
    visit_id: visitId,
    character_id: characterId,
    source,
    arrival_uid: normalizeNullableText(value.arrival_uid, 96),
    started_day: normalizeDay(value.started_day),
    started_time_period: normalizeNullableText(value.started_time_period, 24),
    started_period_serial: normalizeNullableInt(value.started_period_serial),
    ended_day: normalizeDay(value.ended_day),
    ended_time_period: normalizeNullableText(value.ended_time_period, 24),
    ended_period_serial: normalizeNullableInt(value.ended_period_serial),
    end_reason: endReason,
    turns,
  };
}

export function normalizeCharacterMemory(characterId: string, value: unknown): CharacterMemory {
  const record = isRecord(value) ? value : {};
  const activeVisit = normalizeVisitRecord(record.active_visit);
  const closedVisits = Array.isArray(record.closed_visits)
    ? record.closed_visits.map(normalizeVisitRecord).filter((visit): visit is VisitRecord => visit !== null)
    : [];
  const legacyMemories = Array.isArray(record.legacy_memories)
    ? record.legacy_memories.map(normalizeLegacyMemory).filter((legacy): legacy is LegacyMemory => legacy !== null)
    : [];
  const { relationship_memories: _retiredRelationshipMemories, ...retainedRecord } = record;
  return {
    ...retainedRecord,
    character_id: characterId,
    active_visit: activeVisit,
    closed_visits: closedVisits,
    legacy_memories: legacyMemories,
  };
}

export function normalizeMigrationMetadata(value: unknown): CharacterVisitMigrationMetadata {
  const record = isRecord(value) ? value : {};
  const { relationship_facts_fingerprint: _retiredRelationshipFingerprint, ...retainedRecord } = record;
  return {
    ...retainedRecord,
    revision: typeof record.revision === 'string' ? record.revision.slice(0, 64) : '',
    conversation_log_fingerprint: normalizeNullableText(record.conversation_log_fingerprint, 96),
    migrated_at_serial: normalizeNullableInt(record.migrated_at_serial),
  };
}

export function normalizeVisitMemoryState(value: unknown): CharacterVisitMemoryState {
  const record = isRecord(value) ? value : {};
  const rawVersion = record.version;
  const version: CharacterMemoryVersion = rawVersion === CHARACTER_MEMORY_VERSION
    ? CHARACTER_MEMORY_VERSION
    : CHARACTER_MEMORY_VERSION;
  const rawByCharacter = isRecord(record.by_character) ? record.by_character : {};
  const byCharacter: Record<string, CharacterMemory> = {};
  for (const [characterId, raw] of Object.entries(rawByCharacter)) {
    byCharacter[characterId] = normalizeCharacterMemory(characterId, raw);
  }
  const legacyUnassigned = Array.isArray(record.legacy_unassigned)
    ? record.legacy_unassigned
      .map(normalizeLegacyMemory)
      .filter((legacy): legacy is LegacyMemory => legacy !== null)
    : [];
  return {
    ...record,
    version,
    by_character: byCharacter,
    legacy_unassigned: legacyUnassigned,
    migration: normalizeMigrationMetadata(record.migration),
  };
}

// ===== 剧情梗概 60 条裁剪（每角色独立）=====

function dedupeTurnsByTurnId(turns: VisitTurn[]): VisitTurn[] {
  const seen = new Map<string, VisitTurn>();
  for (const turn of turns) {
    if (!turn.turn_id) continue;
    // 后出现/更新版本覆盖，位置保持首次出现（相对时间顺序不变）。
    seen.set(turn.turn_id, turn);
  }
  return Array.from(seen.values());
}

/**
 * 剧情梗概裁剪：active turns ≤16、closed visits ≤4、每 closed ≤16、
 * 每角色 turn 合计 ≤60。顺序：active 优先；从最新 closed visit 向更旧填充。
 * 允许 closed visit 留空，但保留 visit 边界记录。
 */
export function trimStoryMemoriesTo60(memory: CharacterMemory): CharacterMemory {
  const active = memory.active_visit
    ? { ...memory.active_visit, turns: dedupeTurnsByTurnId(memory.active_visit.turns).slice(-ACTIVE_TURNS_PER_CHARACTER) }
    : null;
  let closed = memory.closed_visits.map((visit) => ({
    ...visit,
    turns: dedupeTurnsByTurnId(visit.turns).slice(-TURNS_PER_CLOSED_VISIT),
  })).slice(-CLOSED_VISITS_PER_CHARACTER);

  const activeCount = active?.turns.length ?? 0;
  const total = activeCount + closed.reduce((sum, visit) => sum + visit.turns.length, 0);
  if (total > STORY_SUMMARIES_PER_CHARACTER) {
    let remaining = STORY_SUMMARIES_PER_CHARACTER - activeCount;
    if (remaining < 0) remaining = 0;
    // closed 数组旧→新；从最新（末尾）向更旧填充 → 反向处理再恢复顺序。
    const reversedNewestFirst = [...closed].reverse();
    const trimmed = reversedNewestFirst.map((visit) => {
      if (remaining <= 0) return { ...visit, turns: [] };
      const keep = Math.min(visit.turns.length, remaining);
      remaining -= keep;
      return { ...visit, turns: visit.turns.slice(-keep) };
    });
    closed = trimmed.reverse();
  }
  return { ...memory, active_visit: active, closed_visits: closed };
}

/** 对整份 CharacterMemory 执行有效记忆裁剪；独立关系记忆已退役，仅裁剪 60 条剧情梗概。 */
export function normalizeCharacterMemoryToCapacity(memory: CharacterMemory): CharacterMemory {
  return trimStoryMemoriesTo60(memory);
}

// ===== ID helper =====

/**
 * 分配下一个 visit ID：character_visit_ + 左补零单调 counter。
 * counter 非法（非正整数）时从 1 归一。禁止现实时间/随机。
 */
function allocatedVisitIds(memory: CharacterVisitMemoryState | undefined): Set<string> {
  const ids = new Set<string>();
  for (const characterMemory of Object.values(memory?.by_character ?? {})) {
    if (characterMemory.active_visit?.visit_id) ids.add(characterMemory.active_visit.visit_id);
    for (const visit of characterMemory.closed_visits ?? []) {
      if (visit.visit_id) ids.add(visit.visit_id);
    }
  }
  return ids;
}

function nextCounterAfterExistingVisits(ids: Set<string>): number {
  let next = 1;
  for (const id of ids) {
    if (!id.startsWith(CHARACTER_VISIT_ID_PREFIX)) continue;
    const suffix = id.slice(CHARACTER_VISIT_ID_PREFIX.length);
    if (!/^\d+$/.test(suffix)) continue;
    const numeric = Number(suffix);
    if (Number.isSafeInteger(numeric) && numeric >= next) next = numeric + 1;
  }
  return next;
}

export function nextCharacterVisitId(
  counters: { character_visit?: number } | undefined,
  memory?: CharacterVisitMemoryState,
): {
  visitId: string;
  nextCounter: number;
} {
  const counterValue = Number.isInteger(counters?.character_visit) && (counters!.character_visit! > 0)
    ? counters!.character_visit!
    : 1;
  const existingIds = allocatedVisitIds(memory);
  let current = Math.max(counterValue, nextCounterAfterExistingVisits(existingIds));
  let visitId = `${CHARACTER_VISIT_ID_PREFIX}${String(current).padStart(6, '0')}`;
  while (existingIds.has(visitId)) {
    current += 1;
    visitId = `${CHARACTER_VISIT_ID_PREFIX}${String(current).padStart(6, '0')}`;
  }
  return {
    visitId,
    nextCounter: current + 1,
  };
}

// ===== upsert helper（本批仅供迁移与测试，不接生产 LLM 写入）=====

/**
 * 按 turn_id upsert 到该角色 active_visit 的 turns。
 * 无 active visit 时 no-op（返回原 state）。返回新 state；纯函数。
 */
export function upsertVisitTurn(state: GardenState, characterId: string, turn: VisitTurn): GardenState {
  const memory = state.interaction?.visit_memory?.by_character[characterId];
  if (!memory?.active_visit) return state;
  const existingTurns = memory.active_visit.turns;
  const index = existingTurns.findIndex((existing) => existing.turn_id === turn.turn_id);
  const turns = index >= 0
    ? existingTurns.map((existing, i) => (i === index ? turn : existing))
    : [...existingTurns, turn];
  const nextActiveVisit = { ...memory.active_visit, turns };
  const nextCharacterMemory = normalizeCharacterMemoryToCapacity({ ...memory, active_visit: nextActiveVisit });
  const nextByCharacter = { ...state.interaction!.visit_memory!.by_character, [characterId]: nextCharacterMemory };
  const nextVisitMemory = { ...state.interaction!.visit_memory!, by_character: nextByCharacter };
  return { ...state, interaction: { ...state.interaction!, visit_memory: nextVisitMemory } };
}

// ===== 第二批：按冻结 visit ID 精确 upsert（B2-T04）=====
//
// 合同：runbook §3.7 提交目标必须使用请求时冻结的 visitIdsByCharacter[characterId]
//   - 为 null：不写 VisitTurn（调用方不调用本函数）；
//   - 与当前 active visit 一致：写 active；
//   - 生成结算期间角色离场、该 visit 已进入 closed_visits：写对应 closed visit；
//   - visit 在 active/closed 均找不到：失败并保留 settlement pending，不得写进新 visit；
//   - 同一个 visit ID 出现多处：视为数据冲突并停止，不猜目标；
//   - 同 turn_id retry/recovery：upsert 覆盖审计字段，不追加重复记录。

export type VisitTurnByVisitIdResult =
  | { ok: true; state: GardenState }
  | { ok: false; code: 'not-found' | 'conflict'; state: GardenState };

/**
 * 按 `characterId + visitId` 精确定位 visit（active 或 closed 恰好一处），按 turn_id upsert。
 * 纯函数：不写宿主、不读现实时间；写后执行第一批 16/4/48 容量归一化；保留 unknown fields。
 * 失败（not-found/conflict）返回原 state 引用（未变），由调用方保留 settlement pending。
 */
export function upsertVisitTurnByVisitId(
  state: GardenState,
  characterId: string,
  visitId: string,
  turn: VisitTurn,
): VisitTurnByVisitIdResult {
  const withRoot = ensureVisitMemoryRoot(state);
  const memory = withRoot.interaction?.visit_memory?.by_character[characterId];
  if (!memory) return { ok: false, code: 'not-found', state };

  let activeMatches = 0;
  let closedMatches = 0;
  if (memory.active_visit?.visit_id === visitId) activeMatches = 1;
  for (const visit of memory.closed_visits ?? []) {
    if (visit.visit_id === visitId) closedMatches += 1;
  }
  const total = activeMatches + closedMatches;
  if (total === 0) return { ok: false, code: 'not-found', state };
  if (total > 1) return { ok: false, code: 'conflict', state };

  const upsertTurns = (visit: VisitRecord): VisitRecord => {
    const index = visit.turns.findIndex((existing) => existing.turn_id === turn.turn_id);
    const turns = index >= 0
      ? visit.turns.map((existing, i) => (i === index ? turn : existing))
      : [...visit.turns, turn];
    return { ...visit, turns };
  };

  let nextMemory: CharacterMemory;
  if (activeMatches === 1) {
    nextMemory = normalizeCharacterMemoryToCapacity({
      ...memory,
      active_visit: upsertTurns(memory.active_visit!),
    });
  } else {
    nextMemory = normalizeCharacterMemoryToCapacity({
      ...memory,
      closed_visits: memory.closed_visits.map((visit) => (
        visit.visit_id === visitId ? upsertTurns(visit) : visit
      )),
    });
  }
  const nextByCharacter = { ...withRoot.interaction!.visit_memory!.by_character, [characterId]: nextMemory };
  const nextVisitMemory = { ...withRoot.interaction!.visit_memory!, by_character: nextByCharacter };
  return {
    ok: true,
    state: { ...withRoot, interaction: { ...withRoot.interaction!, visit_memory: nextVisitMemory } },
  };
}

// ===== 便捷读取 =====

export function getCharacterMemory(state: GardenState, characterId: string): CharacterMemory | null {
  return state.interaction?.visit_memory?.by_character[characterId] ?? null;
}

// ===== conversation_log → legacy memory 确定性增量迁移（B1-T06）=====

/** 解析 "角色ID: 摘要" / "角色ID：摘要" 前缀；无匹配返回 null。 */
export function parseConversationLogEntry(entry: string): { characterId: string; text: string } | null {
  const match = /^([A-Za-z0-9_]+)\s*[:：]\s*([\s\S]*)$/u.exec(entry);
  if (!match) return null;
  return { characterId: match[1], text: match[2].trim() };
}

/** 规范化旧 conversation_log 单条文本（剥前缀、去空白、截断）。 */
export function normalizeConversationLogText(entry: string): string {
  return String(entry).trim().slice(0, 120);
}

function legacyStoryIdFor(characterId: string | null, text: string): string {
  const scope = characterId ?? '';
  return `${LEGACY_STORY_ID_PREFIX}${scope}:${deterministicStringHash(`${scope}\u0000${text}`)}`;
}

function knownCharacterIds(state: GardenState): Set<string> {
  return new Set([
    ...Object.keys(state.characters ?? {}),
    ...(state.visit_scheduler?.known_characters ?? []),
  ]);
}

/**
 * 把旧 conversation_log 逐条确定性迁移进 visit_memory legacy 结构。
 * - 读源 conversation_log；旧写入者本批保留（不删源）；
 * - 已知角色 → by_character[characterId].legacy_memories；未知/无前缀/空正文 → legacy_unassigned；
 * - 稳定 legacy_id（角色 + 规范化文本 hash）；同 ID 已存在则跳过（幂等、增量）；
 * - 每角色 legacy ≤16、unassigned ≤24（FIFO 裁剪）；
 * - fingerprint 只做诊断与删除场景辅助判断，不代替记录级 upsert；
 * - revision 更新但不作为"永远跳过导入"的开关；
 * - 迁移失败时旧 conversation_log 原样保留（本函数不删除源）。
 * 返回新 state；纯函数（不修改传入对象）。
 */
export function migrateConversationLogToLegacyMemory(state: GardenState): GardenState {
  const withRoot = ensureVisitMemoryRoot(state);
  const visitMemory = withRoot.interaction!.visit_memory!;
  const known = knownCharacterIds(withRoot);

  const raw = withRoot.interaction?.conversation_log as string[] | string | null | undefined;
  const entries = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw.trim() ? [raw] : []);

  const byCharacter = new Map(Object.entries(visitMemory.by_character).map(([id, memory]) => [id, structuredClone(memory)]));
  const unassigned = structuredClone(visitMemory.legacy_unassigned);
  const unassignedIds = new Set(unassigned.map((item) => item.legacy_id));

  const imported = new Map<string, { characterId: string | null; text: string }>();

  for (const entry of entries) {
    const normalized = normalizeConversationLogText(entry);
    if (!normalized) continue;
    const parsed = parseConversationLogEntry(entry);
    const characterId = parsed && known.has(parsed.characterId) ? parsed.characterId : null;
    const text = parsed ? normalizeConversationLogText(parsed.text) : normalized;
    if (!text) continue;
    const legacyId = legacyStoryIdFor(characterId, text);
    if (imported.has(legacyId)) continue;
    imported.set(legacyId, { characterId, text });

    const legacy: LegacyMemory = {
      legacy_id: legacyId,
      character_id: characterId,
      text,
      source: 'conversation_log.v0',
    };
    if (characterId) {
      const memory = byCharacter.get(characterId);
      if (!memory) byCharacter.set(characterId, createEmptyCharacterMemory(characterId));
      const target = byCharacter.get(characterId)!;
      if (!target.legacy_memories.some((item) => item.legacy_id === legacyId)) {
        target.legacy_memories = [...target.legacy_memories, legacy];
      }
    } else if (!unassignedIds.has(legacyId)) {
      unassigned.push(legacy);
      unassignedIds.add(legacyId);
    }
  }

  const nextByCharacter: Record<string, CharacterMemory> = {};
  for (const [characterId, memory] of byCharacter) {
    nextByCharacter[characterId] = {
      ...memory,
      legacy_memories: memory.legacy_memories.slice(-LEGACY_MEMORIES_PER_CHARACTER),
    };
  }
  const nextVisitMemory: CharacterVisitMemoryState = {
    ...visitMemory,
    by_character: nextByCharacter,
    legacy_unassigned: unassigned.slice(-LEGACY_UNASSIGNED_LIMIT),
    migration: {
      ...visitMemory.migration,
      revision: 'conversation-log.v1',
      conversation_log_fingerprint: deterministicStringHash(entries.map(normalizeConversationLogText).join('\u0000')),
      migrated_at_serial: visitMemory.migration.migrated_at_serial,
    },
  };
  return { ...withRoot, interaction: { ...withRoot.interaction!, visit_memory: nextVisitMemory } };
}

// ===== presence → visit 生命周期协调器（B1-T08）=====

export interface PresenceSnapshotInput {
  present_character_ids?: string[];
  visitor_meta?: Record<string, { arrival_uid?: string | null } | undefined>;
  character_views?: Record<string, unknown>;
}

export interface VisitClock {
  day: number | string | null;
  time_period: string | null;
  period_serial: number | null;
}

export interface ReconcileCharacterVisitsInput {
  beforePresence: PresenceSnapshotInput;
  afterPresence: PresenceSnapshotInput;
  memory: CharacterVisitMemoryState;
  counters: { character_visit?: number } | undefined;
  clock: VisitClock;
  cause: CharacterMemorySource;
}

export interface ReconcileCharacterVisitsResult {
  memory: CharacterVisitMemoryState;
  counters: { character_visit: number };
  openedVisitIds: string[];
  closedVisitIds: string[];
  diagnostics: string[];
}

/** 从正式状态提取时钟（禁止现实时间；仅 environment + 派生 serial）。 */
export function clockFromState(state: GardenState): VisitClock {
  const day = Number.isInteger(state.environment?.day) && (state.environment!.day! >= 1)
    ? state.environment!.day!
    : null;
  const timePeriod = typeof state.environment?.time_period === 'string' && state.environment.time_period
    ? state.environment.time_period
    : null;
  return {
    day,
    time_period: timePeriod,
    period_serial: day === null ? null : periodSerialFromState(state),
  };
}

function causeOpenSource(cause: CharacterMemorySource): CharacterMemorySource {
  // bootstrap/reconcile 均合法；直接透传 cause 本身。
  return cause;
}

function causeCloseReason(cause: CharacterMemorySource): CharacterVisitEndReason {
  switch (cause) {
    case 'scheduler': return 'scheduled-departure';
    case 'event': return 'event-leave';
    case 'model-presence': return 'presence-receipt';
    case 'bootstrap':
    case 'reconcile': return 'reconcile';
  }
}

function normalizePresenceIdList(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string' || !id.trim() || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * presence → visit 协调器（纯函数，不依赖 UI/模型/现实时间）。
 * - 规范化并去重 before/after ID；arrived = after - before；departed = before - after；
 * - 先处理 departed（关闭 active_visit：填结束字段后压入 closed_visits；旧 meta 在删除前从 before 取）；
 * - 再处理 arrived（分配新 counter ID 打开 active_visit；arrival_uid 从 after visitor_meta 取）；
 * - present→present 不因 area/view 变化创建 visit；absent→absent 无操作；
 * - 结束后对每个角色运行容量 normalizer；
 * - 幂等重放：已有 active 的 arrived no-op；无 active 的 departed no-op；counter 不重复增；closed 不重复。
 */
export function reconcileCharacterVisits(
  input: ReconcileCharacterVisitsInput,
): ReconcileCharacterVisitsResult {
  const beforeIds = normalizePresenceIdList(input.beforePresence.present_character_ids);
  const afterIds = normalizePresenceIdList(input.afterPresence.present_character_ids);
  const beforeSet = new Set(beforeIds);
  const afterSet = new Set(afterIds);
  // 保持源数组顺序的确定性差异集合。
  const arrived = afterIds.filter((id) => !beforeSet.has(id));
  const departed = beforeIds.filter((id) => !afterSet.has(id));

  const memory = structuredClone(normalizeVisitMemoryState(input.memory));
  let counters: { character_visit: number } = {
    character_visit: Number.isInteger(input.counters?.character_visit) && (input.counters!.character_visit! > 0)
      ? input.counters!.character_visit!
      : 1,
  };
  const openedVisitIds: string[] = [];
  const closedVisitIds: string[] = [];
  const diagnostics: string[] = [];

  // 1. departed（先关）
  for (const characterId of departed) {
    const characterMemory = memory.by_character[characterId];
    if (!characterMemory?.active_visit) {
      diagnostics.push(`departure-noop:${characterId}:no-active`);
      continue;
    }
    const meta = input.beforePresence.visitor_meta?.[characterId];
    const closedVisit: VisitRecord = {
      ...characterMemory.active_visit,
      ended_day: input.clock.day,
      ended_time_period: input.clock.time_period,
      ended_period_serial: input.clock.period_serial,
      end_reason: causeCloseReason(input.cause),
    };
    memory.by_character[characterId] = {
      ...characterMemory,
      active_visit: null,
      closed_visits: [...characterMemory.closed_visits, closedVisit],
    };
    closedVisitIds.push(closedVisit.visit_id);
  }

  // 2. arrived（后开）
  for (const characterId of arrived) {
    const characterMemory = memory.by_character[characterId];
    if (characterMemory?.active_visit) {
      diagnostics.push(`arrival-noop:${characterId}:already-active`);
      continue;
    }
    const { visitId, nextCounter } = nextCharacterVisitId(counters, memory);
    counters = { character_visit: nextCounter };
    const meta = input.afterPresence.visitor_meta?.[characterId];
    const arrivalUid = (meta && typeof meta.arrival_uid === 'string' && meta.arrival_uid.trim())
      ? meta.arrival_uid.slice(0, 96)
      : null;
    const newVisit: VisitRecord = {
      visit_id: visitId,
      character_id: characterId,
      source: causeOpenSource(input.cause),
      arrival_uid: arrivalUid,
      started_day: input.clock.day,
      started_time_period: input.clock.time_period,
      started_period_serial: input.clock.period_serial,
      ended_day: null,
      ended_time_period: null,
      ended_period_serial: null,
      end_reason: null,
      turns: [],
    };
    memory.by_character[characterId] = characterMemory
      ? { ...characterMemory, active_visit: newVisit }
      : { ...createEmptyCharacterMemory(characterId), active_visit: newVisit };
    openedVisitIds.push(visitId);
  }

  // 3. 容量 normalizer（每角色）
  for (const characterId of Object.keys(memory.by_character)) {
    memory.by_character[characterId] = normalizeCharacterMemoryToCapacity(memory.by_character[characterId]);
  }

  return { memory, counters, openedVisitIds, closedVisitIds, diagnostics };
}

/**
 * 异常修复（仅 migration/load repair 明确调用；生产 transition 不得偷偷调用）：
 * - 当前 present 但无 active → source=bootstrap 打开；
 * - 当前 absent 但有 active → reconcile 关闭。
 * 返回新 state；纯函数。
 */
export function repairCharacterVisitsAgainstPresence(state: GardenState): GardenState {
  const withRoot = ensureVisitMemoryRoot(state);
  const memory = withRoot.interaction!.visit_memory!;
  const presentIds = normalizePresenceIdList(state.presence_snapshot?.present_character_ids);
  const activeIds = Object.entries(memory.by_character)
    .filter(([, characterMemory]) => Boolean(characterMemory.active_visit))
    .map(([characterId]) => characterId);
  const clock = clockFromState(withRoot);
  const counters = withRoot.uid_counters ?? {};

  // 关闭：absent 但有 active（cause=reconcile）。
  const closeResult = reconcileCharacterVisits({
    beforePresence: { present_character_ids: activeIds },
    afterPresence: { present_character_ids: activeIds.filter((id) => presentIds.includes(id)) },
    memory,
    counters,
    clock,
    cause: 'reconcile',
  });
  // 打开：present 但无 active（cause=bootstrap）；已有 active 的幂等 no-op。
  const openResult = reconcileCharacterVisits({
    beforePresence: { present_character_ids: [] },
    afterPresence: { present_character_ids: presentIds },
    memory: closeResult.memory,
    counters: closeResult.counters,
    clock,
    cause: 'bootstrap',
  });

  const nextMemory: CharacterVisitMemoryState = {
    ...openResult.memory,
    migration: {
      ...openResult.memory.migration,
      migrated_at_serial: openResult.memory.migration.migrated_at_serial,
    },
  };
  return {
    ...withRoot,
    interaction: { ...withRoot.interaction!, visit_memory: nextMemory },
    uid_counters: { ...withRoot.uid_counters, character_visit: openResult.counters.character_visit },
  };
}

/**
 * 从 before/after 两个状态提取 presence 后调用协调器，并把结果合并回新 state。
 * memory 与 counter 优先取自 after（正常持久流），after 缺失时回退 before（构造/边界流）。
 * 供生产写点接线（B1-T09）与测试使用；纯函数（不修改传入状态）。
 */
export function reconcileCharacterVisitsFromState(
  before: GardenState,
  after: GardenState,
  cause: CharacterMemorySource,
): GardenState {
  const memory = after.interaction?.visit_memory ?? before.interaction?.visit_memory;
  const withRoot = memory
    ? { ...after, interaction: { ...after.interaction, visit_memory: memory } }
    : ensureVisitMemoryRoot(after);
  const result = reconcileCharacterVisits({
    beforePresence: {
      present_character_ids: before.presence_snapshot?.present_character_ids,
      visitor_meta: before.presence_snapshot?.visitor_meta,
      character_views: before.presence_snapshot?.character_views,
    },
    afterPresence: {
      present_character_ids: withRoot.presence_snapshot?.present_character_ids,
      visitor_meta: withRoot.presence_snapshot?.visitor_meta,
      character_views: withRoot.presence_snapshot?.character_views,
    },
    memory: withRoot.interaction!.visit_memory!,
    counters: withRoot.uid_counters ?? before.uid_counters,
    clock: clockFromState(withRoot),
    cause,
  });
  return {
    ...withRoot,
    interaction: { ...withRoot.interaction!, visit_memory: result.memory },
    uid_counters: { ...withRoot.uid_counters, character_visit: result.counters.character_visit },
  };
}

// ===== 第二批：相关角色与 visit 快照（B2-T03）=====
//
// 当前合同：project/contract.md（GAL 请求、相关角色与冻结 visit）。
//   - 输入必须是结构化 ID 集合，不接收整段玩家文本、不扫描自然语言猜角色；
//   - 优先级冻结：主目标 → 动作 target → 事件 participants → session participants → 在场补足；
//   - 只接受已登记角色 ID；去重保持稳定顺序；最多 4 人；主目标缺失是请求错误；
//   - visit map 请求时冻结，生成期间不得因到达/离开改写；
//   - 不创建 visit（visit 创建仍由第一批 presence lifecycle 独占）；不读真实聊天。

/** 已登记角色白名单（与 character-routing.json 一致）。 */
export const REGISTERED_CHARACTER_IDS: readonly string[] = [
  'reimu', 'marisa', 'cirno', 'alice', 'mystia', 'suika', 'nitori', 'sakuya',
  'youmu', 'patchouli', 'sanae',
];

export interface RelevantCharacterInput {
  /** 优先级 1：当前 GAL 主目标角色。自由对话/角色互动必须存在。 */
  mainTargetCharacterId?: string | null;
  /** 优先级 2：当前动作显式 targetCharacterId。 */
  actionTargetCharacterId?: string | null;
  /** 优先级 3：事件配置的显式 participants（由配置/当前状态提供，不从模型输出猜）。 */
  eventParticipants?: readonly string[];
  /** 优先级 4：interaction.current_session.participant_character_ids。 */
  sessionParticipants?: readonly string[];
  /** 优先级 5：当前在场集合，作为缺省补足。 */
  presentCharacterIds?: readonly string[];
  /** 是否要求主目标（自由对话 true；事件/设施/道具行动可 false）。缺失返回 missing-main-target。 */
  requireMainTarget?: boolean;
  /** 已登记角色白名单；缺省 REGISTERED_CHARACTER_IDS。 */
  registeredCharacterIds?: readonly string[];
}

export type RelevantCharacterResult =
  | { ok: true; characterIds: string[] }
  | { ok: false; reason: 'missing-main-target' };

/**
 * 按 runbook §3.4 稳定优先级解析相关角色（纯函数，无副作用、不读宿主、不创建 visit）。
 * 优先级 1–4（主目标/动作 target/事件 participants/session participants）有任一命中时，
 * 不在场集合不再参与（总计划 §5.2：在场仅作“无明确目标时”的缺省补足）。
 * 返回去重后的有序角色 ID 列表，最多 4 个。
 */
export function resolveRelevantCharacterIds(input: RelevantCharacterInput): RelevantCharacterResult {
  const registered = new Set(input.registeredCharacterIds ?? REGISTERED_CHARACTER_IDS);
  const main = input.mainTargetCharacterId?.trim() ?? '';
  if (input.requireMainTarget && !main) return { ok: false, reason: 'missing-main-target' };

  const candidates: string[] = [];
  const push = (id: string | null | undefined) => {
    const value = id?.trim() ?? '';
    if (value && registered.has(value)) candidates.push(value);
  };
  const pushMany = (ids: readonly string[] | undefined) => {
    for (const id of ids ?? []) push(id);
  };

  push(main);
  push(input.actionTargetCharacterId);
  pushMany(input.eventParticipants);
  pushMany(input.sessionParticipants);

  // 缺省补足：仅当优先级 1–4 都未命中时，才从在场集合选择（总计划 §5.2）
  if (candidates.length === 0) {
    pushMany(input.presentCharacterIds);
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of candidates) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
    if (unique.length >= 4) break;
  }
  // R0 裁定：无登记角色是合法 V2（独处设施剧情/无角色过渡）。
  // requireMainTarget:true 仍拒绝缺失主目标；false 时返回成功空数组，不伪造角色。
  if (unique.length === 0) {
    if (input.requireMainTarget) return { ok: false, reason: 'missing-main-target' };
    return { ok: true, characterIds: [] };
  }
  return { ok: true, characterIds: unique };
}

/**
 * 请求时冻结每个相关角色的 active visit ID（无入场则 null）。
 * 纯函数：只读 state；不创建/关闭 visit；visit map 冻结后不因生成期间到达/离开改写。
 * 调用方（V2 构造）在玩家楼层创建前调用一次并持久化。
 */
export function freezeVisitIds(
  state: GardenState,
  characterIds: readonly string[],
): Record<string, string | null> {
  const frozen: Record<string, string | null> = {};
  for (const characterId of characterIds) {
    const memory = getCharacterMemory(state, characterId);
    frozen[characterId] = memory?.active_visit?.visit_id ?? null;
  }
  return frozen;
}
