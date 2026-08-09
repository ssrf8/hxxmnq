// B4-T02 standalone no-op adapter —— 独立 MVU 版装配根。
// 合同：recall 返回空候选与 disabled-by-build；archive 返回 skipped；
// 不触碰宿主全局、不 import 数据库 adapter、不包含任何数据库禁词。
import type { GardenState } from '../types';
import type {
  MemoryArchiveRecallPort,
  RecallInput,
  RecallResult,
  ArchiveInput,
  ArchiveResult,
  DatabaseSyncResult,
} from '../memory-port';

export const STANDALONE_MEMORY_ADAPTER_ID = 'standalone-mvu/no-op' as const;

export function createMemoryAdapter(): MemoryArchiveRecallPort {
  return {
    profile: 'standalone-mvu',
    capability: 'disabled-by-build',
    async recall(_input: RecallInput): Promise<RecallResult> {
      return { status: 'disabled-by-build', candidates: [] };
    },
    async archive(_input: ArchiveInput): Promise<ArchiveResult> {
      return { status: 'skipped', detail: 'standalone-mvu：数据库能力未装配' };
    },
    async syncOpening(_state: GardenState): Promise<DatabaseSyncResult> {
      return { status: 'skipped', detail: '独立 MVU 版：数据库能力未装配' };
    },
  };
}
