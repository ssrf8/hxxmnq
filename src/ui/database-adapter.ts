import type { GardenState } from './types';

interface QueryResult { rows?: Array<Record<string, unknown>> }
interface DatabaseApi {
  queryTableRows?: (options: Record<string, unknown>) => QueryResult | null;
  insertRow?: (options: Record<string, unknown>) => Promise<boolean>;
  updateRow?: (options: Record<string, unknown>) => Promise<boolean>;
}

export interface DatabaseSyncResult {
  status: 'synced' | 'unavailable' | 'skipped' | 'failed';
  detail: string;
}

let lastFingerprint = '';

function resolveApi(): DatabaseApi | undefined {
  const local = globalThis as typeof globalThis & { AutoCardUpdaterAPI?: DatabaseApi };
  if (local.AutoCardUpdaterAPI) return local.AutoCardUpdaterAPI;
  try {
    const parent = window.parent as typeof window & { AutoCardUpdaterAPI?: DatabaseApi };
    return parent.AutoCardUpdaterAPI;
  } catch {
    return undefined;
  }
}

function hasAncestorItem(rows: Array<Record<string, unknown>>): boolean {
  return rows.some((row) => Object.values(row).some((value) => String(value ?? '').includes('祖父的遗物')));
}

export async function syncOpeningDatabase(state: GardenState): Promise<DatabaseSyncResult> {
  if (!state.meta?.opening_committed) return { status: 'skipped', detail: '开局尚未提交' };
  const api = resolveApi();
  if (!api?.queryTableRows || !api.insertRow || !api.updateRow) return { status: 'unavailable', detail: '数据库未加载，核心玩法继续' };

  const player = state.player ?? {};
  const fingerprint = JSON.stringify([player.name, player.pronouns, player.appearance, state.garden?.name]);
  if (fingerprint === lastFingerprint) return { status: 'skipped', detail: '本次开局已归档' };

  try {
    const protagonist = api.queryTableRows({ tableName: '主角信息表', limit: 2 });
    const playerData = {
      '人物名称': player.name || '未命名旅人',
      '性别/年龄': player.pronouns || '中性称谓',
      '外貌特征': player.appearance || '',
      '职业/身份': '移动庭园继承人',
      '过往经历': `依照祖父留下的安排，携带祖父的遗物来到${state.garden?.name || '无名庭园'}。`,
      '性格特点': '',
    };
    const playerSaved = protagonist?.rows?.length
      ? await api.updateRow({ tableName: '主角信息表', rowIndex: 1, data: playerData })
      : await api.insertRow({ tableName: '主角信息表', data: playerData });
    if (!playerSaved) throw new Error('主角信息表写入失败');

    const inventory = api.queryTableRows({ tableName: '背包物品表', limit: 100 });
    if (!hasAncestorItem(inventory?.rows ?? [])) {
      const itemSaved = await api.insertRow({
        tableName: '背包物品表',
        data: { '物品名称': '祖父的遗物（庭守钥）', '数量': 1, '描述/效果': '开启并维系移动庭园结界的继承遗物。', '类别': '关键物品' },
      });
      if (!itemSaved) throw new Error('背包物品表写入失败');
    }
    lastFingerprint = fingerprint;
    return { status: 'synced', detail: '主角信息与祖父的遗物已归档' };
  } catch (error) {
    return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}
