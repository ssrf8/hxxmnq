// B4-R2 database-assisted adapter —— 数据库共存版装配根。
// R2 最高合同：卡内请求永远使用与 standalone 相同的 MVU 48 + 12 召回；
// 本 adapter 不归档、不查询、不合并数据库记忆。SP·数据库的原生召回由宿主独立完成。
// 唯一保留的既有能力是与角色记忆无关的开局主角/物品同步。
import type { GardenState } from '../types';
import { syncOpeningDatabase } from '../database-adapter';
import type {
  MemoryArchiveRecallPort,
  RecallInput,
  RecallResult,
  ArchiveInput,
  ArchiveResult,
  DatabaseSyncResult,
} from '../memory-port';

export const DATABASE_MEMORY_ADAPTER_ID = 'database-assisted/host-auto-card-updater' as const;

export function createMemoryAdapter(): MemoryArchiveRecallPort {
  return {
    profile: 'database-assisted',
    // 插件可见性不是“原生召回成功”的证明，不向业务层宣称 ready。
    capability: 'unavailable',
    async recall(_input: RecallInput): Promise<RecallResult> {
      return {
        status: 'recall-empty',
        candidates: [],
        detail: 'database-assisted：R2 共存策略不读取数据库记忆；继续使用卡内 MVU 召回',
      };
    },
    async archive(_input: ArchiveInput): Promise<ArchiveResult> {
      return {
        status: 'skipped',
        detail: 'database-assisted：R2 共存策略不建立本卡记忆归档表',
      };
    },
    async syncOpening(state: GardenState): Promise<DatabaseSyncResult> {
      // 既有开局主角/物品同步只存在于本 profile，但不属于角色记忆召回。
      return syncOpeningDatabase(state);
    },
  };
}
