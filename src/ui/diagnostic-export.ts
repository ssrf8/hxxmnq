// GAL 第五批：脱敏诊断导出 —— runbook §1.2/§2/§3 的唯一实现：白名单字段、d_<12hex> 单次代号、
// 禁展开、无弱哈希兜底、64 KiB UTF-8 门禁、无 DOM/fetch/MVU 写入、不修改输入。
// 序列化超 65,536 UTF-8 字节 → diagnostic-size-limit；无 DOM/fetch/MVU 写入/宿主全局，不修改输入对象。

import type { GardenState, MessageTransactionSnapshot, RuntimeDiagnostics } from './types';
import type { GalAnyRequest } from './gal-generation-request';
import type { MemoryProfile } from './memory-port';
import { REGISTERED_CHARACTER_IDS } from './character-memory';

export const DIAGNOSTIC_SCHEMA = 'gensokyo-diagnostic.v1' as const;
export const DIAGNOSTIC_MAX_UTF8_BYTES = 65536;
export const DATABASE_RUNTIME_VERDICT = 'DBR-C8-UNVERIFIED' as const;

export type DiagnosticErrorCode =
  | 'none' | 'abort' | 'timeout' | 'stale-chat' | 'stale-attempt'
  | 'request-schema' | 'empty-response' | 'mvu-commit'
  | 'regeneration-blocked' | 'database-wrapper' | 'unknown';

/** 导出错误：code 固定为安全错误码，message 不携带任何原文。 */
export class DiagnosticExportError extends Error {
  readonly code: 'diagnostic-crypto-unavailable' | 'diagnostic-size-limit';
  constructor(code: 'diagnostic-crypto-unavailable' | 'diagnostic-size-limit', message: string) {
    super(message);
    this.name = 'DiagnosticExportError';
    this.code = code;
  }
}

export interface DiagnosticSnapshotV1 {
  schema: 'gensokyo-diagnostic.v1';
  capturedAt: string;
  privacy: { level: 'strict'; correlationScope: 'single-export'; includesStoryText: false; includesCredentials: false; includesDatabaseRows: false; maxUtf8Bytes: 65536 };
  build: { appVersion: string; bridgeVersion: string; memoryProfile: 'standalone-mvu' | 'database-assisted' };
  runtime: {
    mode: 'host' | 'preview'; tavernVersion: string; helperVersion: string; mvuReady: boolean;
    generationTransport: string; regenerationTransport: string; databaseAvailable: boolean; databaseVersion: string | null;
    memoryCapability: 'disabled-by-build' | 'available' | 'unavailable';
    databaseRuntimeVerdict: 'DBR-C8-UNVERIFIED';
    lastErrorCode: DiagnosticErrorCode;
  };
  transaction: null | {
    kind: MessageTransactionSnapshot['kind'];
    phase: MessageTransactionSnapshot['phase'];
    transactionRef: string | null; chatRef: string | null; requestRef: string | null;
    attemptRef: string | null; generationRef: string | null; commitRef: string | null;
    ownerCharacterRef: string | null; userMessageCreated: boolean; assistantResponded: boolean;
    userMessageRef: string | null; assistantMessageRef: string | null; attemptSeq: number;
    requestSchema: string | null; stopReason: string | null; recovery: string | null;
    errorCode: DiagnosticErrorCode;
  };
  request: null | {
    schema: string; promptRevision: string;
    historyRevision: string | null; memoryRevision: string | null; attemptSeq: number;
    relevantCharacterIds: string[]; syntheticHistoryMessageCount: number;
    syntheticHistoryUtf8Bytes: number; syntheticHistoryRef: string | null;
    contextRef: string | null; visitRefs: string[];
  };
  state: {
    mvuUtf8Bytes: number; registeredCharacterCount: number;
    characterMemory: Array<{
      characterId: string;
      hasActiveVisit: boolean;
      activeTurnCount: number;
      closedVisitCount: number;
      closedTurnCount: number;
      relationshipMemoryCount: number;
      activeRelationshipStateCount: number;
    }>;
  };
}

export interface DiagnosticExportInput {
  /** state 未加载时传 null（输出零值，不新开 MVU 事务）。 */
  state: GardenState | null;
  /** 当前事务快照（transactions.read() / preview）；无事务为 null。 */
  transaction: MessageTransactionSnapshot | null;
  /** 当前冻结 pendingRequest（V1 或 V2）；无请求为 null。 */
  pendingRequest: GalAnyRequest | null;
  /** diagnostics 安全字段（lastError 只交给错误分类器）。 */
  diagnostics: RuntimeDiagnostics;
  /** 双 memory profile 公共端口内存值，禁止读数据库配置。 */
  memoryPort: { profile: MemoryProfile; capability: 'disabled-by-build' | 'available' | 'unavailable' };
  /** 应用版本（受控字符串，来自构建/状态 meta）。 */
  appVersion: string;
}

export interface DiagnosticExportOptions {
  /** 测试注入固定盐；生产调用不得提供（单次导出必须随机）。 */
  salt?: string;
  /** 测试注入固定捕获时间；缺省为当前 ISO 时间。 */
  capturedAt?: string;
}

const PSEUDONYM_DOMAIN = 'gensokyo-diagnostic.v1';
const PSEUDONYM_SEPARATOR = '\u0000';
const REQUEST_SCHEMA_V1 = 'gal-generation-request.v1';
const REQUEST_SCHEMA_V2 = 'gal-generation-request.v2';
const SAFE_PROMPT_REVISIONS = new Set(['gal-prompt.v1', 'gal-prompt.v2', 'gal-prompt.v3']);
const HISTORY_REVISION = 'gal-synthetic-history.v1';
const MEMORY_REVISION = 'character-visit-memory.v1';
const SAFE_DATABASE_VERSIONS = new Set([
  'SP·数据库 VII（database-assisted）',
  '数据库增强版（能力未就绪）',
  '独立 MVU 版：数据库能力未装配',
  '未加载',
]);
const TRANSACTION_KINDS: readonly MessageTransactionSnapshot['kind'][] = ['opening', 'interaction', 'settlement', 'battle'];
const TRANSACTION_PHASES: readonly MessageTransactionSnapshot['phase'][] = ['idle', 'submitting_user', 'generating', 'stopping', 'settling', 'settled', 'failed'];

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function requireSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new DiagnosticExportError('diagnostic-crypto-unavailable', 'Web Crypto SHA-256 不可用，诊断导出失败');
  }
  return subtle;
}

function randomSalt(): string {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new DiagnosticExportError('diagnostic-crypto-unavailable', '安全随机数不可用，诊断导出失败');
  }
  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * 原始标识 → 本次导出短代号：null/undefined/空字符串 → null；
 * 编码“固定域分隔符 + 随机盐 + 原值”做 SHA-256，取前 12 个十六进制字符；不写回 salt/raw。
 */
export async function createDiagnosticRef(raw: unknown, salt: string): Promise<string | null> {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text.length === 0) return null;
  const subtle = requireSubtle();
  const bytes = new TextEncoder().encode(`${PSEUDONYM_DOMAIN}${PSEUDONYM_SEPARATOR}${salt}${PSEUDONYM_SEPARATOR}${text}`);
  const digest = await subtle.digest('SHA-256', bytes);
  return `d_${toHex(new Uint8Array(digest)).slice(0, 12)}`;
}

const STOP_REASON_WHITELIST: readonly string[] = ['user-stop', 'chat-switch', 'iframe-unload'];
const RECOVERY_WHITELIST: readonly string[] = ['incomplete', 'confirmed', 'conflict', 'settlement'];

function mapWhitelisted(value: string | null | undefined, whitelist: readonly string[]): string | null {
  if (!value) return null;
  return whitelist.includes(value) ? value : null;
}

function safeVersion(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === 'offline' || text === 'unknown') return text;
  return /^\d[0-9a-z._+-]{0,47}$/i.test(text) ? text : 'unknown';
}

function safeRequestSchema(value: unknown): string | null {
  return value === REQUEST_SCHEMA_V1 || value === REQUEST_SCHEMA_V2 ? value : null;
}

function safeRevision(value: unknown, expected: string): string {
  return value === expected ? expected : 'unknown';
}

function safePromptRevision(value: unknown): string {
  return typeof value === 'string' && SAFE_PROMPT_REVISIONS.has(value) ? value : 'unknown';
}

function safeDatabaseVersion(value: unknown, available: boolean): string | null {
  return available && typeof value === 'string' && SAFE_DATABASE_VERSIONS.has(value) ? value : null;
}

function safeCapturedAt(value: string | undefined): string {
  const date = value === undefined ? new Date() : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function safeMode(value: unknown): 'host' | 'preview' {
  return value === 'host' ? 'host' : 'preview';
}

function safeGenerationTransport(value: unknown): string {
  return value === 'native-trigger' || value === 'helper-generate' ? value : 'unknown';
}

function safeRegenerationTransport(value: unknown): string {
  return value === 'native-regenerate' || value === 'helper-generate-swipe' ? value : 'unknown';
}

function safeMemoryProfile(value: unknown): 'standalone-mvu' | 'database-assisted' {
  return value === 'database-assisted' ? 'database-assisted' : 'standalone-mvu';
}

function safeMemoryCapability(value: unknown): 'disabled-by-build' | 'available' | 'unavailable' {
  return value === 'disabled-by-build' || value === 'available' ? value : 'unavailable';
}

function safeTransaction(value: MessageTransactionSnapshot | null): MessageTransactionSnapshot | null {
  if (!value || !TRANSACTION_KINDS.includes(value.kind) || !TRANSACTION_PHASES.includes(value.phase)) return null;
  return value;
}

export function classifyDiagnosticError(value: unknown): DiagnosticErrorCode {
  if (value === null || value === undefined) return 'none';
  const text = String(value).toLowerCase();
  if (text.length === 0) return 'none';
  // 特例优先于一般项；只做本地小写子串匹配，绝不返回匹配到的片段。
  if (/stale[-_\s]?chat|chat[-_\s]?(switch|switched|switching)|聊天(已)?切换/.test(text)) return 'stale-chat';
  if (/stale[-_\s]?attempt|attempt.*stale/.test(text)) return 'stale-attempt';
  if (/regenerat/.test(text)) return 'regeneration-blocked';
  if (/database|wrapper/.test(text)) return 'database-wrapper';
  if (/schema|revision|request[-_\s]?invalid|invalid[-_\s]?request/.test(text)) return 'request-schema';
  if (/empty[-_\s]?response|无回复|空响应|没有收到/.test(text)) return 'empty-response';
  if (/\bmvu\b|commit/.test(text)) return 'mvu-commit';
  if (/timeout|timed[-_\s]?out|超时/.test(text)) return 'timeout';
  if (/abort|中止|停止/.test(text)) return 'abort';
  return 'unknown';
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function countTurns(visit: unknown): number {
  if (!visit || typeof visit !== 'object') return 0;
  const turns = (visit as { turns?: unknown }).turns;
  return Array.isArray(turns) ? turns.length : 0;
}

function countActiveRelationshipStates(memories: unknown): number {
  if (!Array.isArray(memories)) return 0;
  let count = 0;
  for (const item of memories) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { kind?: unknown; active?: unknown };
    if (record.kind === 'relationship_state' && record.active === true) count += 1;
  }
  return count;
}

interface AnyRequestView {
  schema: string; promptRevision: string; attemptSeq: number; contextFingerprint: string;
  historyRevision: string | null; memoryRevision: string | null; relevantCharacterIds: readonly string[];
  visitIdsByCharacter: Record<string, string | null>; syntheticHistory: readonly { content: string }[]; syntheticHistoryHash: string | null;
}

function toRequestView(request: GalAnyRequest): AnyRequestView | null {
  const schema = safeRequestSchema(request.schema);
  if (!schema) return null;
  if (request.schema !== REQUEST_SCHEMA_V2) {
    return {
      schema, promptRevision: safePromptRevision(request.promptRevision), attemptSeq: safeCount(request.attemptSeq) || 1,
      contextFingerprint: request.contextFingerprint, historyRevision: null, memoryRevision: null,
      relevantCharacterIds: [], visitIdsByCharacter: {}, syntheticHistory: [], syntheticHistoryHash: null,
    };
  }
  return {
    schema, promptRevision: safePromptRevision(request.promptRevision), attemptSeq: safeCount(request.attemptSeq) || 1,
    contextFingerprint: request.contextFingerprint,
    historyRevision: safeRevision(request.historyRevision, HISTORY_REVISION),
    memoryRevision: safeRevision(request.memoryRevision, MEMORY_REVISION),
    relevantCharacterIds: request.relevantCharacterIds ?? [], visitIdsByCharacter: request.visitIdsByCharacter ?? {},
    syntheticHistory: request.syntheticHistory ?? [], syntheticHistoryHash: request.syntheticHistoryHash ?? null,
  };
}

function utf8BytesOfText(text: string): number {
  return new TextEncoder().encode(text).length;
}

function syntheticHistoryUtf8Bytes(history: readonly { content: string }[]): number {
  let total = 0;
  for (const item of history) {
    const content = item && typeof item.content === 'string' ? item.content : '';
    total += utf8BytesOfText(content);
  }
  return total;
}

function stateToUtf8Bytes(state: GardenState | null): number {
  if (!state) return 0;
  try { return utf8BytesOfText(JSON.stringify(state)); } catch { return 0; }
}

function registeredCharacterCount(state: GardenState | null, whitelist: readonly string[]): number {
  const byCharacter = state?.interaction?.visit_memory?.by_character;
  if (!byCharacter || typeof byCharacter !== 'object') return 0;
  let count = 0;
  for (const id of whitelist) if (Object.prototype.hasOwnProperty.call(byCharacter, id)) count += 1;
  return count;
}

interface CharacterMemoryView {
  characterId: string; hasActiveVisit: boolean; activeTurnCount: number; closedVisitCount: number;
  closedTurnCount: number; relationshipMemoryCount: number; activeRelationshipStateCount: number;
}

function characterMemoryView(characterId: string, state: GardenState | null): CharacterMemoryView {
  const memory = state?.interaction?.visit_memory?.by_character?.[characterId];
  if (!memory || typeof memory !== 'object') {
    return { characterId, hasActiveVisit: false, activeTurnCount: 0, closedVisitCount: 0, closedTurnCount: 0, relationshipMemoryCount: 0, activeRelationshipStateCount: 0 };
  }
  const activeVisit = memory.active_visit ?? null;
  const closedVisits = Array.isArray(memory.closed_visits) ? memory.closed_visits : [];
  let closedTurnCount = 0;
  for (const visit of closedVisits) closedTurnCount += countTurns(visit);
  return {
    characterId, hasActiveVisit: Boolean(activeVisit), activeTurnCount: countTurns(activeVisit),
    closedVisitCount: closedVisits.length, closedTurnCount,
    relationshipMemoryCount: Array.isArray(memory.relationship_memories) ? memory.relationship_memories.length : 0,
    activeRelationshipStateCount: countActiveRelationshipStates(memory.relationship_memories),
  };
}

/**
 * 异步构造一次脱敏快照。默认生成 16 字节随机盐与当前 ISO 时间；
 * 测试可注入固定 salt/capturedAt；生产调用不得提供固定盐。
 * 不修改任何输入对象；所有身份统一走同一个单次导出 pseudonymizer。
 */
export async function buildDiagnosticSnapshot(
  input: DiagnosticExportInput,
  options: DiagnosticExportOptions = {},
): Promise<DiagnosticSnapshotV1> {
  const salt = options.salt ?? randomSalt();
  const ref = (raw: unknown) => createDiagnosticRef(raw, salt);
  const whitelist = REGISTERED_CHARACTER_IDS;
  const transaction = safeTransaction(input.transaction);
  const pendingRequest = input.pendingRequest ? toRequestView(input.pendingRequest) : null;
  const diagnostics = input.diagnostics;

  const transactionBlock: DiagnosticSnapshotV1['transaction'] = transaction
    ? {
        kind: transaction.kind, phase: transaction.phase,
        transactionRef: await ref(transaction.transactionId), chatRef: await ref(transaction.chatId),
        requestRef: await ref(transaction.requestId), attemptRef: await ref(transaction.attemptId),
        generationRef: await ref(transaction.generationId), commitRef: await ref(transaction.commitKey),
        ownerCharacterRef: await ref(transaction.ownerCharacterId),
        userMessageCreated: Boolean(transaction.userMessageCreated), assistantResponded: Boolean(transaction.assistantResponded),
        userMessageRef: await ref(transaction.userMessageId), assistantMessageRef: await ref(transaction.assistantMessageId),
        attemptSeq: safeCount(transaction.attemptSeq), requestSchema: safeRequestSchema(transaction.requestSchema),
        stopReason: mapWhitelisted(transaction.stopReason, STOP_REASON_WHITELIST),
        recovery: mapWhitelisted(transaction.recovery, RECOVERY_WHITELIST),
        errorCode: classifyDiagnosticError(transaction.lastError),
      }
    : null;

  const relevant = whitelist.filter((id) => pendingRequest?.relevantCharacterIds.includes(id) ?? false);
  const visitRefs: string[] = [];
  if (pendingRequest) {
    for (const id of relevant) {
      const visitRef = await ref(pendingRequest.visitIdsByCharacter[id] ?? null);
      if (visitRef) visitRefs.push(visitRef);
    }
  }
  const requestBlock: DiagnosticSnapshotV1['request'] = pendingRequest
    ? {
        schema: pendingRequest.schema, promptRevision: pendingRequest.promptRevision,
        historyRevision: pendingRequest.historyRevision, memoryRevision: pendingRequest.memoryRevision,
        attemptSeq: pendingRequest.attemptSeq, relevantCharacterIds: relevant,
        syntheticHistoryMessageCount: pendingRequest.syntheticHistory.length,
        syntheticHistoryUtf8Bytes: syntheticHistoryUtf8Bytes(pendingRequest.syntheticHistory),
        syntheticHistoryRef: await ref(pendingRequest.syntheticHistoryHash),
        contextRef: await ref(pendingRequest.contextFingerprint),
        visitRefs,
      }
    : null;

  const stateBlock: DiagnosticSnapshotV1['state'] = {
    mvuUtf8Bytes: stateToUtf8Bytes(input.state),
    registeredCharacterCount: registeredCharacterCount(input.state, whitelist),
    characterMemory: whitelist.map((id) => characterMemoryView(id, input.state)),
  };

  return {
    schema: DIAGNOSTIC_SCHEMA,
    capturedAt: safeCapturedAt(options.capturedAt),
    privacy: { level: 'strict', correlationScope: 'single-export', includesStoryText: false, includesCredentials: false, includesDatabaseRows: false, maxUtf8Bytes: DIAGNOSTIC_MAX_UTF8_BYTES },
    build: { appVersion: safeVersion(input.appVersion), bridgeVersion: safeVersion(diagnostics.bridgeVersion), memoryProfile: safeMemoryProfile(input.memoryPort.profile) },
    runtime: {
      mode: safeMode(diagnostics.mode), tavernVersion: safeVersion(diagnostics.tavernVersion), helperVersion: safeVersion(diagnostics.helperVersion),
      mvuReady: Boolean(diagnostics.mvuReady), generationTransport: safeGenerationTransport(diagnostics.generationTransport),
      regenerationTransport: safeRegenerationTransport(diagnostics.regenerationTransport), databaseAvailable: Boolean(diagnostics.databaseAvailable),
      databaseVersion: safeDatabaseVersion(diagnostics.databaseVersion, diagnostics.databaseAvailable),
      memoryCapability: safeMemoryCapability(input.memoryPort.capability), databaseRuntimeVerdict: DATABASE_RUNTIME_VERDICT,
      lastErrorCode: classifyDiagnosticError(diagnostics.lastError),
    },
    transaction: transactionBlock,
    request: requestBlock,
    state: stateBlock,
  };
}

/**
 * 序列化快照：UTF-8、两个空格缩进、末尾一个换行；
 * 超过 65,536 UTF-8 字节时失败为 diagnostic-size-limit，不静默截断。
 * 只返回字符串，不做任何 DOM/下载操作。
 */
export function serializeDiagnosticSnapshot(snapshot: DiagnosticSnapshotV1): string {
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > DIAGNOSTIC_MAX_UTF8_BYTES) {
    throw new DiagnosticExportError('diagnostic-size-limit', `诊断导出超过 ${DIAGNOSTIC_MAX_UTF8_BYTES} 字节上限，已拒绝导出`);
  }
  return json;
}
