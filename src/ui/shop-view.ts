import { listShopItems, shopBlock } from './shop-rules';
import type { GardenState } from './types';

type ShopCategory = 'all' | 'charm' | 'resource' | 'trigger_item' | 'key_item';

const categories: ReadonlyArray<{ id: ShopCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'charm', label: '护身符' },
  { id: 'trigger_item', label: '消耗品' },
  { id: 'resource', label: '道具' },
  { id: 'key_item', label: '特殊' },
];

let selectedCategory: ShopCategory = 'all';
let selectedItemId = '';

function itemSummary(item: ReturnType<typeof listShopItems>[number], state: GardenState) {
  if (item.item_type === 'resource') return `物资 +${item.quantity}`;
  if (item.item_type === 'trigger_item') {
    return `持有 ${state.inventory?.consumables?.[item.item_id] ?? 0}`;
  }
  return state.key_items?.[item.item_id]?.obtained ? '已经持有' : '唯一关键物品';
}

export function renderShopView(
  root: HTMLElement,
  state: GardenState,
  buy: (itemId: string) => void,
  use: (itemId: string) => void,
) {
  root.replaceChildren();
  const blocked = shopBlock(state);
  const items = listShopItems(state);
  if (!items.some((item) => item.item_id === selectedItemId)) {
    selectedItemId = items[0]?.item_id ?? '';
  }

  const heading = document.createElement('h2');
  heading.className = 'gg-shop-sr-title';
  heading.textContent = '灵梦小店商品目录';
  const note = document.createElement('p');
  note.className = 'gg-shop-status';
  note.setAttribute('aria-live', 'polite');
  note.textContent = blocked || `金币 ${state.resources?.coins ?? 0} · 物资 ${state.resources?.materials ?? 0}/20`;
  const wallet = document.createElement('div');
  wallet.className = 'gg-shop-wallet';
  wallet.setAttribute('aria-label', `当前资金 ${state.resources?.coins ?? 0} 钱`);
  const walletLabel = document.createElement('span');
  walletLabel.textContent = '当前资金';
  const walletAmount = document.createElement('strong');
  const coins = Math.max(0, Math.trunc(Number(state.resources?.coins) || 0));
  walletAmount.textContent = coins.toLocaleString('zh-CN');
  const walletUnit = document.createElement('small');
  walletUnit.textContent = '钱';
  wallet.append(walletLabel, walletAmount, walletUnit);

  const tabs = document.createElement('nav');
  tabs.className = 'gg-shop-tabs';
  tabs.setAttribute('aria-label', '商品分类');
  const list = document.createElement('div');
  list.className = 'gg-shop-list';
  const detail = document.createElement('aside');
  detail.className = 'gg-shop-detail';
  detail.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div');
  actions.className = 'gg-shop-actions';
  const buyButton = document.createElement('button');
  buyButton.type = 'button';
  buyButton.className = 'gg-shop-buy';
  const sellButton = document.createElement('button');
  sellButton.type = 'button';
  sellButton.className = 'gg-shop-sell';
  sellButton.textContent = '出售';
  sellButton.title = '出售功能尚未开放';
  sellButton.disabled = true;
  actions.append(buyButton, sellButton);

  const cards = new Map<string, HTMLElement>();
  const emptySlots: HTMLElement[] = [];
  const renderSelection = () => {
    const selected = items.find((item) => item.item_id === selectedItemId);
    for (const [itemId, card] of cards) {
      card.dataset.selected = String(itemId === selectedItemId);
      card.querySelector('button')?.setAttribute('aria-pressed', String(itemId === selectedItemId));
    }
    detail.replaceChildren();
    if (!selected) {
      detail.textContent = '这一栏暂时没有商品。';
      buyButton.textContent = '购买';
      buyButton.disabled = true;
      return;
    }
    const title = document.createElement('h3');
    title.textContent = selected.title;
    const copy = document.createElement('p');
    copy.textContent = `${itemSummary(selected, state)} · 售价 ${selected.price} 金币`;
    detail.append(title, copy);
    const usable = (selected.item_type === 'trigger_item'
      && selected.item_id === 'incident_trigger_card'
      && (state.inventory?.consumables?.[selected.item_id] ?? 0) > 0)
      || (selected.item_type === 'key_item' && state.key_items?.[selected.item_id]?.obtained);
    if (usable) {
      const useButton = document.createElement('button');
      useButton.type = 'button';
      useButton.className = 'gg-shop-use';
      useButton.textContent = selected.item_type === 'key_item'
        ? state.key_items?.sakuya_watch?.state === 'daily_cooldown' ? '今日已使用' : '使用怀表'
        : '启用异变';
      useButton.disabled = selected.item_type === 'key_item'
        && state.key_items?.sakuya_watch?.state === 'daily_cooldown';
      useButton.addEventListener('click', () => use(selected.item_id));
      detail.append(useButton);
    }
    buyButton.textContent = `购买 · ${selected.price} 金币`;
    buyButton.disabled = Boolean(blocked)
      || Boolean(selected.unique && state.key_items?.[selected.item_id]?.obtained);
  };

  const applyCategory = (category: ShopCategory) => {
    selectedCategory = category;
    for (const button of tabs.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.category === category));
    }
    const visible = items.filter((item) => category === 'all' || (category !== 'charm' && item.item_type === category));
    for (const item of items) cards.get(item.item_id)!.hidden = !visible.includes(item);
    const emptyCount = Math.max(0, 10 - visible.length);
    emptySlots.forEach((slot, index) => { slot.hidden = index >= emptyCount; });
    if (!visible.some((item) => item.item_id === selectedItemId)) {
      selectedItemId = visible[0]?.item_id ?? '';
    }
    renderSelection();
  };

  for (const category of categories) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.category = category.id;
    button.textContent = category.label;
    button.addEventListener('click', () => applyCategory(category.id));
    tabs.append(button);
  }

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'gg-shop-item';
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'gg-shop-item-select';
    select.setAttribute('aria-label', `查看${item.title}，${item.price}金币`);
    const title = document.createElement('strong');
    title.textContent = item.title;
    const price = document.createElement('span');
    price.className = 'gg-price';
    price.textContent = `${item.price} 金币`;
    const summary = document.createElement('small');
    summary.textContent = itemSummary(item, state);
    select.append(title, price, summary);
    select.addEventListener('click', () => {
      selectedItemId = item.item_id;
      renderSelection();
    });
    card.append(select);
    cards.set(item.item_id, card);
    list.append(card);
  }
  for (let index = 0; index < 10; index += 1) {
    const empty = document.createElement('div');
    empty.className = 'gg-shop-item gg-shop-item-empty';
    empty.setAttribute('aria-hidden', 'true');
    emptySlots.push(empty);
    list.append(empty);
  }
  buyButton.addEventListener('click', () => {
    if (selectedItemId) buy(selectedItemId);
  });
  root.append(heading, wallet, tabs, list, detail, actions, note);
  applyCategory(selectedCategory);
}
