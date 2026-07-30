import itemCatalog from '../items/catalog.json';
import type { GardenState } from './types';
import { listOpportunityCandidateProfiles } from './visitor-rules';

export type ItemUseMode = 'local' | 'scene_chat' | 'anomaly_authoring';
export type ItemConsumePolicy = 'on_commit' | 'never';

export interface InventoryItemDefinition {
  item_id: string;
  title: string;
  item_type: 'consumable' | 'key_item';
  stack_limit: number;
  use_mode: ItemUseMode;
  scope_tags: string[];
  unlock_conditions: string[];
  consume_policy: ItemConsumePolicy;
  local_effect_id?: string;
  prompt_description: string;
  shop_price?: number;
  shop_unlock?: string;
}

const items = (itemCatalog.items as InventoryItemDefinition[]);
const byId = new Map(items.map((item) => [item.item_id, item]));

export function listInventoryCatalog(): InventoryItemDefinition[] {
  return items.map((item) => ({ ...item, scope_tags: [...item.scope_tags], unlock_conditions: [...item.unlock_conditions] }));
}

export function getInventoryItem(itemId: string): InventoryItemDefinition | undefined {
  const item = byId.get(itemId);
  return item ? { ...item, scope_tags: [...item.scope_tags], unlock_conditions: [...item.unlock_conditions] } : undefined;
}

export function consumableCount(state: GardenState, itemId: string): number {
  return Math.max(0, Math.min(99, state.inventory?.consumables?.[itemId] ?? 0));
}

export function isFacilityBuilt(state: GardenState, facilityId: string): boolean {
  const facility = state.facilities?.[facilityId];
  return Boolean(facility && (facility.state === '启用' || facility.current_form));
}

export function itemShopUnlocked(state: GardenState, itemId: string): boolean {
  const item = byId.get(itemId);
  if (!item) return false;
  if (!state.shop?.unlocked) return false;
  switch (item.shop_unlock) {
    case 'facility_fairy_garden_built':
      return isFacilityBuilt(state, 'fairy_garden');
    case 'facility_moon_spring_built':
      return isFacilityBuilt(state, 'moon_spring');
    case 'facility_banquet_plaza_built':
      return isFacilityBuilt(state, 'banquet_plaza');
    case 'any_followup_facility_built':
      return isFacilityBuilt(state, 'fairy_garden')
        || isFacilityBuilt(state, 'moon_spring')
        || isFacilityBuilt(state, 'banquet_plaza');
    case 'opportunity_candidates_available':
      return listOpportunityCandidateProfiles(state).length > 0;
    case 'battle_dungeon_unlocked':
      return Boolean(state.battle?.dungeon_unlocked);
    case 'shop_unique':
    case 'always_when_shop_open':
    default:
      return true;
  }
}

export function inventoryDisplayRows(state: GardenState) {
  const rows: Array<{
    item_id: string;
    title: string;
    kind: 'consumable' | 'key_item';
    quantity: number;
    description: string;
    usable: boolean;
    disabledReason: string;
  }> = [];

  for (const item of items) {
    if (item.item_type === 'consumable') {
      const quantity = consumableCount(state, item.item_id);
      if (quantity <= 0 && item.item_id !== 'incident_trigger_card') continue;
      if (quantity <= 0 && item.item_id === 'incident_trigger_card') continue;
      let usable = quantity > 0;
      let disabledReason = usable ? '' : '数量不足';
      if (item.use_mode === 'anomaly_authoring') {
        if (state.anomaly_cycle?.active) {
          usable = false;
          const remaining = Math.max(0, (state.anomaly_cycle.active.end_period_serial ?? 0) - (state.anomaly_cycle.active.start_period_serial ?? 0));
          disabledReason = `已有异变，剩余约 ${remaining} 时段`;
        } else if (state.anomaly_cycle?.pending_activation) {
          usable = false;
          disabledReason = '异变启用事务进行中';
        }
      } else if (item.use_mode === 'scene_chat') {
        usable = false;
        disabledReason = '请在自由聊天或设施行动中选择';
      } else if (item.local_effect_id === 'repair_kit_substitute') {
        usable = false;
        disabledReason = '仅可从损坏设施修复入口使用';
      }
      rows.push({
        item_id: item.item_id,
        title: item.title,
        kind: 'consumable',
        quantity,
        description: item.prompt_description,
        usable,
        disabledReason,
      });
    } else if (item.item_id === 'sakuya_watch') {
      const watch = state.key_items?.sakuya_watch;
      if (!watch?.obtained) continue;
      const onCooldown = watch.state === 'daily_cooldown' || watch.last_used_day === (state.environment?.day ?? 1);
      rows.push({
        item_id: item.item_id,
        title: item.title,
        kind: 'key_item',
        quantity: 1,
        description: item.prompt_description,
        usable: !onCooldown,
        disabledReason: onCooldown ? '今日已使用' : '',
      });
    }
  }
  return rows;
}

export function reserveConsumable(before: GardenState, itemId: string, amount = 1): GardenState {
  const item = byId.get(itemId);
  if (!item || item.item_type !== 'consumable') throw new Error('未知消耗品');
  if (!Number.isInteger(amount) || amount < 1) throw new Error('预留数量非法');
  const current = consumableCount(before, itemId);
  if (current < amount) throw new Error(`${item.title}数量不足`);
  const state = structuredClone(before);
  state.inventory ??= { consumables: {} };
  state.inventory.consumables ??= {};
  state.inventory.consumables[itemId] = current - amount;
  return state;
}

export function addConsumable(before: GardenState, itemId: string, amount = 1): GardenState {
  const item = byId.get(itemId);
  if (!item || item.item_type !== 'consumable') throw new Error('未知消耗品');
  if (!Number.isInteger(amount) || amount < 1) throw new Error('增加数量非法');
  const current = consumableCount(before, itemId);
  if (current + amount > item.stack_limit) throw new Error(`${item.title}已达到持有上限`);
  const state = structuredClone(before);
  state.inventory ??= { consumables: {} };
  state.inventory.consumables ??= {};
  state.inventory.consumables[itemId] = current + amount;
  return state;
}

export function validateItemId(itemId: string) {
  if (!byId.has(itemId)) throw new Error('物品不在本地登记目录中');
  if (!/^[A-Za-z0-9._:-]{1,64}$/u.test(itemId)) throw new Error('物品 ID 非法');
}
