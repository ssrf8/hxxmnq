import catalog from '../shop/catalog.json';
import dialogues from '../shop/dialogues.json';
import type { GardenState } from './types';

export interface ShopItem {
  item_id: string;
  item_type: 'resource' | 'trigger_item' | 'key_item';
  title: string;
  price: number;
  quantity: number;
  unique: boolean;
  enabled_checkpoint: string;
  local_effect_id: string;
  resource?: string;
}
const MAX_IDS = 256;
const itemList = catalog.items as ShopItem[];
const items = new Map(itemList.map((item) => [item.item_id, item]));

export function shopBlock(state: GardenState) {
  return state.shop?.unlocked ? '' : dialogues.dialogues.shop_locked;
}

export function listShopItems() { return itemList.map((item) => ({ ...item })); }

export function purchaseShopItem(before: GardenState, itemId: string, purchaseId: string): GardenState {
  const blocked = shopBlock(before);
  if (blocked) throw new Error(blocked);
  if (!/^[A-Za-z0-9._:-]{1,64}$/u.test(purchaseId)) throw new Error('购买 ID 非法');
  if (before.shop?.purchase_settled_ids?.includes(purchaseId)) throw new Error('该购买已经结算');
  const item = items.get(itemId);
  if (!item) throw new Error(dialogues.dialogues.unknown_item);
  if ((before.resources?.coins ?? 0) < item.price) throw new Error(dialogues.dialogues.insufficient_coins);
  if (item.item_type === 'resource'
    && (item.resource !== 'materials' || item.local_effect_id !== 'add_materials')) throw new Error(dialogues.dialogues.unknown_item);
  if (item.item_type === 'resource' && (before.resources?.materials ?? 0) + item.quantity > 20) {
    throw new Error(dialogues.dialogues.materials_full);
  }
  if (item.item_type === 'key_item' && before.key_items?.[item.item_id]?.obtained) {
    throw new Error(dialogues.dialogues.unique_owned);
  }
  const state = structuredClone(before);
  state.resources ??= {};
  state.resources.coins = (state.resources.coins ?? 0) - item.price;
  if (item.item_type === 'resource') {
    state.resources.materials = (state.resources.materials ?? 0) + item.quantity;
  } else if (item.item_type === 'trigger_item' && item.local_effect_id === 'add_incident_trigger_card') {
    state.inventory ??= { consumables: {} };
    state.inventory.consumables ??= {};
    const current = state.inventory.consumables[item.item_id] ?? 0;
    if (current + item.quantity > 99) throw new Error('该消耗品已经达到持有上限');
    state.inventory.consumables[item.item_id] = current + item.quantity;
  } else if (item.item_type === 'key_item' && item.local_effect_id === 'obtain_sakuya_watch') {
    state.key_items ??= {};
    state.key_items.sakuya_watch = {
      ...state.key_items.sakuya_watch,
      id: 'sakuya_watch',
      name: '十六夜咲夜的怀表',
      obtained: true,
      state: 'ready',
      last_used_day: null,
      total_uses: 0,
      last_used_area_id: null,
      last_used_time_period: null,
      temporal_trace_active: false,
      noticed_by_character_ids: [],
    };
  } else {
    throw new Error(dialogues.dialogues.unknown_item);
  }
  state.shop ??= {};
  state.shop.purchase_settled_ids = Array.from(new Set([...(state.shop.purchase_settled_ids ?? []), purchaseId])).slice(-MAX_IDS);
  return state;
}

export function shopMessage(error?: unknown) {
  return error instanceof Error ? error.message : dialogues.dialogues.purchase_success;
}
