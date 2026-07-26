import { inventoryDisplayRows } from './inventory-rules';
import type { GardenState } from './types';

export function renderInventoryView(
  root: HTMLElement,
  state: GardenState,
  useItem: (itemId: string) => void,
) {
  root.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = '背包';
  const note = document.createElement('p');
  note.className = 'gg-note';
  note.textContent = '只显示本地登记物品。玩家不能创建目录外物品；聊天道具需在合法场景中使用。';
  const list = document.createElement('div');
  list.className = 'gg-shop-list';
  const rows = inventoryDisplayRows(state);
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'gg-note gg-empty';
    empty.textContent = '背包还是空的。可在灵梦小店购买物资、异变卡或后续设施道具。';
    root.append(heading, note, empty);
    return;
  }
  for (const row of rows) {
    const card = document.createElement('article');
    card.className = 'gg-shop-item';
    const title = document.createElement('h3');
    title.textContent = `${row.title}${row.kind === 'consumable' ? ` ×${row.quantity}` : ''}`;
    const details = document.createElement('p');
    details.textContent = row.description;
    const status = document.createElement('p');
    status.className = 'gg-note';
    status.textContent = row.usable ? (row.kind === 'key_item' ? '可使用' : '可在合法入口使用') : row.disabledReason;
    card.append(title, details, status);
    if (row.item_id === 'incident_trigger_card' || row.item_id === 'sakuya_watch') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = row.item_id === 'sakuya_watch' ? '使用怀表' : '启用异变';
      button.disabled = !row.usable;
      button.addEventListener('click', () => useItem(row.item_id));
      card.append(button);
    }
    list.append(card);
  }
  root.append(heading, note, list);
}
