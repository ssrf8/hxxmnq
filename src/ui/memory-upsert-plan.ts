// B4-T04 稳定键、content hash 与 upsert plan（纯函数层，不调用数据库）。
// O02 裁定（runbook §10 B4-T04）：
// - upsert 查重：where { archive_key } limit 2；0 行 insert，1 行安全定位，2 行 duplicate-key 停写；
// - 内容变化 → update；不变 → skip；错 scope 行不参与匹配；
// - 同一 MVU 记录重复规划 100 次：只出现第一次 insert，之后全部 skip/update，不出现第二个 insert。
import {
  buildArchiveKey,
  buildContentHash,
  stableSerializeRecord,
  MEMORY_ARCHIVE_SCHEMA_REVISION,
  isRecord,
  isValidArchiveScopeId,
  type ArchiveKind,
  type StoryArchiveRecord,
  type RelationshipArchiveRecord,
} from './memory-archive-schema';

export type UpsertAction = 'insert' | 'update' | 'skip' | 'duplicate' | 'unsafe';

export interface UpsertPlan {
  action: UpsertAction;
  reason: string;
  /** insert/update 时的写入参数（英文列名，不含 row_id）。 */
  row?: Record<string, unknown>;
  /** update 时目标行定位（row identity 由调用方从 1 行查询结果提供）。 */
  targetRowIndex?: number;
  /** skip/duplicate/unsafe 时保留原 content hash 以便诊断。 */
  existingContentHash?: string;
}

export interface ExistingRow {
  /** 数据库返回的行对象；仅读 archive_scope_id/archive_key/content_hash。 */
  row: Record<string, unknown>;
  /** 行定位（row identity）：SP·数据库 VII 的 content[row][0] 即 row_id。 */
  rowId?: string | number;
  rowIndex?: number;
}

export type SafeRowIdentityResult =
  | { ok: true; rowId: string; rowIndex: number }
  | { ok: false; code: 'snapshot-missing' | 'table-ambiguous' | 'header-missing' | 'row-ambiguous' | 'key-mismatch' };

/**
 * 把 query 返回的稳定 row_id 转成 updateRow 所需 content 数组下标。
 * 只能从 exportTableAsJson 的精确表快照反查；禁止使用 query 结果数组位置。
 * 生产 update 前必须用新快照再次调用一次本函数。
 */
export function resolveSafeRowIdentity(input: {
  exportedTables: unknown;
  tableName: string;
  rowId: string | number;
  archiveKey: string;
}): SafeRowIdentityResult {
  if (!isRecord(input.exportedTables)) return { ok: false, code: 'snapshot-missing' };
  const sheets = Object.values(input.exportedTables).filter((sheet) => (
    isRecord(sheet) && sheet.name === input.tableName && Array.isArray(sheet.content)
  ));
  if (sheets.length !== 1) return { ok: false, code: 'table-ambiguous' };
  const content = (sheets[0] as Record<string, unknown>).content as unknown[];
  if (!Array.isArray(content[0])) return { ok: false, code: 'header-missing' };
  const header = content[0].map((cell) => String(cell));
  const archiveKeyIndex = header.indexOf('archive_key');
  if (archiveKeyIndex < 1) return { ok: false, code: 'header-missing' };
  const rowId = String(input.rowId);
  if (!/^[1-9]\d*$/u.test(rowId)) return { ok: false, code: 'row-ambiguous' };
  const matches: Array<{ row: unknown[]; rowIndex: number }> = [];
  for (let rowIndex = 1; rowIndex < content.length; rowIndex += 1) {
    const row = content[rowIndex];
    if (Array.isArray(row) && String(row[0]) === rowId) matches.push({ row, rowIndex });
  }
  if (matches.length !== 1) return { ok: false, code: 'row-ambiguous' };
  if (String(matches[0].row[archiveKeyIndex] ?? '') !== input.archiveKey) return { ok: false, code: 'key-mismatch' };
  return { ok: true, rowId, rowIndex: matches[0].rowIndex };
}

export interface UpsertPlanInput {
  kind: ArchiveKind;
  archiveScopeId: string;
  stableId: string;
  /** 期望写入的 content（用于算 hash 与比较）。 */
  content: string;
  /** 数据库查询结果（where { archive_key } 返回 0/1/2 行）。 */
  existingRows: readonly ExistingRow[];
  /** 写入用的完整行参数（英文列名）。 */
  rowParams: Record<string, unknown>;
}

const EMPTY_ROWS: readonly ExistingRow[] = [];

/** 生成写入行：固定 archive_key + content_hash，其余列由调用方提供。 */
export function buildStoryInsertRow(record: StoryArchiveRecord): Record<string, unknown> {
  return {
    archive_schema_version: record.archiveSchemaVersion,
    archive_key: record.archiveKey,
    archive_scope_id: record.archiveScopeId,
    memory_id: record.memoryId,
    character_id: record.characterId,
    visit_id: record.visitId,
    request_id: record.requestId,
    scene_id: record.sceneId,
    day: record.day,
    time_period: record.timePeriod,
    period_serial: record.periodSerial,
    summary: record.summary,
    source_revision: record.sourceRevision,
    content_hash: record.contentHash,
  };
}

export function buildRelationshipInsertRow(record: RelationshipArchiveRecord): Record<string, unknown> {
  return {
    archive_schema_version: record.archiveSchemaVersion,
    archive_key: record.archiveKey,
    archive_scope_id: record.archiveScopeId,
    relationship_memory_id: record.relationshipMemoryId,
    character_id: record.characterId,
    visit_id: record.visitId,
    request_id: record.requestId,
    kind: record.kind,
    relationship_label: record.relationshipLabel,
    event_kind: record.eventKind,
    day: record.day,
    time_period: record.timePeriod,
    period_serial: record.periodSerial,
    summary: record.summary,
    significance: record.significance,
    active: record.active ? 1 : 0,
    source_revision: record.sourceRevision,
    content_hash: record.contentHash,
  };
}

/**
 * 纯 upsert plan：根据数据库查重结果决定动作。
 * - 0 行 → insert；
 * - 1 行且 content hash 相同 → skip；不同 → update；
 * - 2 行 → duplicate（停止写入）；
 * - 3+ 行 → unsafe（数据损坏，停止写入）；
 * - 查重结果中任何行的 archive_scope_id 与期望不一致 → unsafe（错 scope 行不得参与匹配）。
 * 稳定键匹配只依赖 archive_key（scope+kind+stableId），content_hash 只判断内容是否变化。
 */
export function planUpsert(input: UpsertPlanInput): UpsertPlan {
  const expectedKey = buildArchiveKey({
    archiveScopeId: input.archiveScopeId,
    kind: input.kind,
    stableId: input.stableId,
  });
  const incomingHash = buildContentHash(input.content);
  const rows = input.existingRows.length > 0 ? input.existingRows : EMPTY_ROWS;

  if (!isValidArchiveScopeId(input.archiveScopeId)
    || input.rowParams.archive_scope_id !== input.archiveScopeId
    || (input.rowParams.archive_key !== undefined && input.rowParams.archive_key !== expectedKey)) {
    return { action: 'unsafe', reason: '输入 scope 或 archive_key 与稳定键合同不一致' };
  }

  if (rows.length === 0) {
    return {
      action: 'insert',
      reason: '查重 0 行，执行 insert',
      row: { ...input.rowParams, archive_key: expectedKey, content_hash: incomingHash },
    };
  }

  // 错 scope/key 行：精确查询仍返回错误身份，视作数据损坏并停止写入。
  for (const existing of rows) {
    if (existing.row.archive_scope_id !== input.archiveScopeId) {
      return {
        action: 'unsafe',
        reason: `查重结果存在错 scope 行（${String(existing.row.archive_scope_id)} ≠ ${input.archiveScopeId}），停止写入`,
        existingContentHash: typeof existing.row.content_hash === 'string' ? existing.row.content_hash : undefined,
      };
    }
    if (existing.row.archive_key !== expectedKey) {
      return {
        action: 'unsafe',
        reason: '查重结果 archive_key 与期望稳定键不一致，停止写入',
        existingContentHash: typeof existing.row.content_hash === 'string' ? existing.row.content_hash : undefined,
      };
    }
  }

  if (rows.length > 2) {
    return {
      action: 'unsafe',
      reason: `查重返回 ${rows.length} 行（>2），archive_key 唯一性被破坏，停止写入`,
    };
  }

  if (rows.length === 2) {
    return {
      action: 'duplicate',
      reason: '查重 2 行，archive_key 重复，停止写入',
      existingContentHash: typeof rows[0].row.content_hash === 'string' ? rows[0].row.content_hash : undefined,
    };
  }

  const existing = rows[0];
  const existingHash = typeof existing.row.content_hash === 'string' ? existing.row.content_hash : '';
  if (existingHash === incomingHash) {
    return {
      action: 'skip',
      reason: 'content hash 相同，内容未变化，跳过写入',
      existingContentHash: existingHash,
    };
  }
  const rowId = existing.rowId ?? existing.row.row_id as string | number | undefined;
  if ((typeof rowId !== 'string' && typeof rowId !== 'number')
    || !/^[1-9]\d*$/u.test(String(rowId))
    || String(rowId) !== String(existing.row.row_id ?? '')
    || !Number.isInteger(existing.rowIndex)
    || (existing.rowIndex as number) < 1) {
    return {
      action: 'unsafe',
      reason: '内容需要更新，但尚未通过 exportTableAsJson 唯一反查 row identity',
      existingContentHash: existingHash,
    };
  }
  return {
    action: 'update',
    reason: 'content hash 不同，内容已变化，更新目标行',
    row: { ...input.rowParams, archive_key: expectedKey, content_hash: incomingHash },
    targetRowIndex: existing.rowIndex as number,
    existingContentHash: existingHash,
  };
}

/** content 便捷构造：由调用方把“逻辑内容”稳定序列化为 content 串。 */
export function contentFromRecord(record: {
  summary: string;
  day?: string | null;
  timePeriod?: string | null;
  periodSerial?: number | null;
}): string {
  return stableSerializeRecord({
    summary: record.summary,
    day: record.day ?? null,
    timePeriod: record.timePeriod ?? null,
    periodSerial: record.periodSerial ?? null,
  });
}

export const UPSERT_PLAN_SCHEMA_REVISION = MEMORY_ARCHIVE_SCHEMA_REVISION;
