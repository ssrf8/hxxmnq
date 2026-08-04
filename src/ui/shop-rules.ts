import catalog from '../shop/catalog.json';
import dialogues from '../shop/dialogues.json';
import type { GardenState } from './types';
import { itemShopUnlocked, addConsumable, getInventoryItem } from './inventory-rules';

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
  unlock?: string;
  blurb?: string;
  description?: string;
}
const MAX_IDS = 256;
const itemList = catalog.items as ShopItem[];
const items = new Map(itemList.map((item) => [item.item_id, item]));
const RESOURCE_DESCRIPTIONS: Record<string, string> = {
  basic_material_single: '获得 1 份基础物资。物资用于建造、升级与修复庭园设施，也可以作为小费交给灵梦换取好感。',
  basic_material_crate: '一次获得 4 份基础物资，比单份购买更划算。物资用于建造、升级与修复庭园设施。',
};

export function shopBlock(state: GardenState) {
  return state.shop?.unlocked ? '' : dialogues.dialogues.shop_locked;
}

export function listShopItems(state?: GardenState) {
  return itemList
    .filter((item) => !state || itemShopUnlocked(state, item.item_id) || item.item_type === 'resource' || item.item_id === 'incident_trigger_card' || item.item_id === 'sakuya_watch')
    .filter((item) => {
      if (!state) return true;
      if (!item.unlock) return true;
      return itemShopUnlocked(state, item.item_id);
    })
    .map((item) => {
      const inventoryItem = getInventoryItem(item.item_id);
      const description = item.item_type === 'resource'
        ? RESOURCE_DESCRIPTIONS[item.item_id] ?? ''
        : inventoryItem?.prompt_description ?? '';
      return { ...item, description, blurb: item.blurb ?? description };
    });
}

export function purchaseShopItem(before: GardenState, itemId: string, purchaseId: string): GardenState {
  const blocked = shopBlock(before);
  if (blocked) throw new Error(blocked);
  if (!/^[A-Za-z0-9._:-]{1,64}$/u.test(purchaseId)) throw new Error('购买 ID 非法');
  if (before.shop?.purchase_settled_ids?.includes(purchaseId)) throw new Error('该购买已经结算');
  const item = items.get(itemId);
  if (!item) throw new Error(dialogues.dialogues.unknown_item);
  if (item.unlock && !itemShopUnlocked(before, item.item_id)) throw new Error('该商品尚未随对应设施开放');
  if ((before.resources?.coins ?? 0) < item.price) throw new Error(dialogues.dialogues.insufficient_coins);
  if (item.item_type === 'resource'
    && (item.resource !== 'materials' || item.local_effect_id !== 'add_materials')) throw new Error(dialogues.dialogues.unknown_item);
  if (item.item_type === 'resource' && (before.resources?.materials ?? 0) + item.quantity > 20) {
    throw new Error(dialogues.dialogues.materials_full);
  }
  if (item.item_type === 'key_item' && before.key_items?.[item.item_id]?.obtained) {
    throw new Error(dialogues.dialogues.unique_owned);
  }
  let state = structuredClone(before);
  state.resources ??= {};
  state.resources.coins = (state.resources.coins ?? 0) - item.price;
  if (item.item_type === 'resource') {
    state.resources.materials = (state.resources.materials ?? 0) + item.quantity;
  } else if (item.item_type === 'trigger_item' && (
    item.local_effect_id === 'add_incident_trigger_card' || item.local_effect_id === 'add_consumable'
  )) {
    state = addConsumable(state, item.item_id, item.quantity);
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

export const STARTER_GIFT_REWARDS = Object.freeze({
  coins: 48,
  inspiration: 4,
  materials: 8,
});

/** 新人礼包：每个聊天档案只可领取一次；领取后置 interaction.starter_gift_claimed=true。 */
export function claimStarterGift(before: GardenState): GardenState {
  if (before.interaction?.starter_gift_claimed) throw new Error('新人礼包已经领取过了');
  const state = structuredClone(before);
  state.interaction ??= {};
  state.interaction.starter_gift_claimed = true;
  state.resources ??= {};
  const materials = Math.min(20, (state.resources.materials ?? 0) + STARTER_GIFT_REWARDS.materials);
  const inspiration = Math.min(10, (state.resources.inspiration ?? 0) + STARTER_GIFT_REWARDS.inspiration);
  const coins = Math.min(99999, (state.resources.coins ?? 0) + STARTER_GIFT_REWARDS.coins);
  state.resources.materials = materials;
  state.resources.inspiration = inspiration;
  state.resources.coins = coins;
  return state;
}
