import { listShopItems, shopBlock } from './shop-rules';
import type { GardenState } from './types';

export function renderShopView(
  root: HTMLElement,
  state: GardenState,
  buy: (itemId: string) => void,
  use: (itemId: string) => void,
) {
  root.replaceChildren();
  const blocked = shopBlock(state);
  const heading = document.createElement('h2');
  heading.textContent = '灵梦小店';
  const note = document.createElement('p');
  note.className = 'gg-note';
  note.textContent = blocked || `金币 ${state.resources?.coins ?? 0} · 物资 ${state.resources?.materials ?? 0}/20`;
  const list = document.createElement('div');
  list.className = 'gg-shop-list';
  for (const item of listShopItems()) {
    const card = document.createElement('article');
    card.className = 'gg-shop-item';
    const title = document.createElement('h3'); title.textContent = item.title;
    const details = document.createElement('p');
    details.textContent = item.item_type === 'resource'
      ? `${item.price} 金币 · 物资 +${item.quantity}`
      : item.item_type === 'trigger_item'
      ? `${item.price} 金币 · 持有 ${state.inventory?.consumables?.[item.item_id] ?? 0}`
      : `${item.price} 金币 · 唯一关键物品`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `购买（${item.price} 金币）`;
    button.disabled = Boolean(blocked) || Boolean(item.unique && state.key_items?.[item.item_id]?.obtained);
    button.addEventListener('click', () => buy(item.item_id));
    card.append(title, details, button);
    const usable = (item.item_type === 'trigger_item' && (state.inventory?.consumables?.[item.item_id] ?? 0) > 0)
      || (item.item_type === 'key_item' && state.key_items?.[item.item_id]?.obtained);
    if (usable) {
      const useButton = document.createElement('button');
      useButton.type = 'button';
      useButton.textContent = item.item_type === 'key_item'
        ? state.key_items?.sakuya_watch?.state === 'daily_cooldown' ? '今日已使用' : '使用怀表'
        : '使用一张';
      useButton.disabled = item.item_type === 'key_item' && state.key_items?.sakuya_watch?.state === 'daily_cooldown';
      useButton.addEventListener('click', () => use(item.item_id));
      card.append(useButton);
    }
    list.append(card);
  }
  root.append(heading, note, list);
}
