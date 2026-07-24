import catalog from '../shop/catalog.json';
import dialogues from '../shop/dialogues.json';
import type { GardenState } from './types';

export type ShopItem = typeof catalog.items[number];
const MAX_IDS = 256;
const items = new Map(catalog.items.map((item) => [item.item_id, item]));

export function shopBlock(state: GardenState) {
  return state.shop?.unlocked ? '' : dialogues.dialogues.shop_locked;
}

export function listShopItems() { return catalog.items.map((item) => ({ ...item })); }

export function purchaseShopItem(before: GardenState, itemId: string, purchaseId: string): GardenState {
  const blocked = shopBlock(before);
  if (blocked) throw new Error(blocked);
  if (!/^[A-Za-z0-9._:-]{1,64}$/u.test(purchaseId)) throw new Error('购买 ID 非法');
  if (before.shop?.purchase_settled_ids?.includes(purchaseId)) throw new Error('该购买已经结算');
  const item = items.get(itemId);
  if (!item || item.item_type !== 'resource' || item.resource !== 'materials' || item.local_effect_id !== 'add_materials') {
    throw new Error(dialogues.dialogues.unknown_item);
  }
  if ((before.resources?.coins ?? 0) < item.price) throw new Error(dialogues.dialogues.insufficient_coins);
  if ((before.resources?.materials ?? 0) + item.quantity > 20) throw new Error(dialogues.dialogues.materials_full);
  const state = structuredClone(before);
  state.resources ??= {};
  state.resources.coins = (state.resources.coins ?? 0) - item.price;
  state.resources.materials = (state.resources.materials ?? 0) + item.quantity;
  state.shop ??= {};
  state.shop.purchase_settled_ids = Array.from(new Set([...(state.shop.purchase_settled_ids ?? []), purchaseId])).slice(-MAX_IDS);
  return state;
}

export function shopMessage(error?: unknown) {
  return error instanceof Error ? error.message : dialogues.dialogues.purchase_success;
}
