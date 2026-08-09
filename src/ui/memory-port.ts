// B4-R2 公共 profile port —— 业务代码唯一允许依赖的可选数据库能力边界。
// 规则（runbook §5.2 / §5.3.1）：
// - 业务代码（app/bridge/generation coordinator）只 import 本端口与 memory-adapter-selection；
// - 任何代码不得直接读取 globalThis.AutoCardUpdaterAPI；
// - 显式 profile、显式结果、无 throw 穿透、无 MVU 写入；
// - recall/archive 是旧研究接口，只允许返回跳过结果，生产请求构造不得调用。
import type { GardenState } from './types';

export type MemoryProfile = 'standalone-mvu' | 'database-assisted';

export interface DatabaseSyncResult {
  status: 'synced' | 'unavailable' | 'skipped' | 'failed';
  detail: string;
}

/** R2 封存接口：保留类型兼容，不得接入生产请求构造。 */
export interface RecallInput {
  archiveScopeId: string;
  relevantCharacterIds: readonly string[];
  localMemory: unknown;
  requestId: string;
}

/** R2 封存结果：两个 adapter 均不得向卡内请求提供数据库候选。 */
export interface RecallResult {
  status: 'disabled-by-build' | 'recall-empty' | 'recall-partial' | 'recall-failed';
  candidates: readonly unknown[];
  detail?: string;
}

/** R2 封存接口：不建立本卡故事/关系数据库归档表。 */
export interface ArchiveInput {
  archiveScopeId: string;
  records: readonly unknown[];
}

/** 归档结果：best-effort，失败不向 MVU 事务抛出（runbook §7.2）。 */
export interface ArchiveResult {
  status:
    | 'skipped'
    | 'synced'
    | 'partial'
    | 'failed'
    | 'unavailable'
    | 'unsupported'
    | 'duplicate-detected'
    | 'unsafe-row-identity';
  detail: string;
}

/** 公共端口：两个 memory profile 各自提供一份实现，由构建期装配选择。 */
export interface MemoryArchiveRecallPort {
  readonly profile: MemoryProfile;
  readonly capability: 'disabled-by-build' | 'available' | 'unavailable';
  recall(input: RecallInput): Promise<RecallResult>;
  archive(input: ArchiveInput): Promise<ArchiveResult>;
  /** 开局数据库同步只允许装配在 database-assisted；standalone 返回 skipped。 */
  syncOpening(state: GardenState): Promise<DatabaseSyncResult>;
}
