import { listShopItems, shopBlock } from './shop-rules';
import type { GardenState } from './types';

export function renderShopView(root: HTMLElement, state: GardenState, buy: (itemId: string) => void) {
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
    const details = document.createElement('p'); details.textContent = `${item.price} 金币 · 物资 +${item.quantity}`;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = `购买（${item.price} 金币）`; button.disabled = Boolean(blocked); button.addEventListener('click', () => buy(item.item_id));
    card.append(title, details, button); list.append(card);
  }
  root.append(heading, note, list);
}
