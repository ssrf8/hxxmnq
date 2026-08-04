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
let currentPage = 0;
const PAGE_SIZE = 10;

export interface ShopNotice {
  text: string;
  kind: 'success' | 'error';
}

function itemSummary(item: ReturnType<typeof listShopItems>[number], state: GardenState) {
  if (item.item_type === 'resource') return `物资 +${item.quantity}`;
  if (item.item_type === 'trigger_item') {
    return `持有 ${state.inventory?.consumables?.[item.item_id] ?? 0}`;
  }
  return state.key_items?.[item.item_id]?.obtained ? '已经持有' : '唯一关键物品';
}

function showItemDetailDialog(item: { title: string; blurb?: string; description?: string }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'gg-shop-detail-dialog';
  dialog.setAttribute('aria-labelledby', 'gg-shop-detail-dialog-title');
  const shell = document.createElement('div');
  shell.className = 'gg-shop-detail-dialog-shell';
  const header = document.createElement('header');
  header.className = 'gg-shop-detail-dialog-header';
  const title = document.createElement('h2');
  title.id = 'gg-shop-detail-dialog-title';
  title.textContent = item.title;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'gg-shop-detail-dialog-close';
  close.setAttribute('aria-label', '关闭详细介绍');
  close.textContent = '关闭';
  header.append(title, close);
  const body = document.createElement('div');
  body.className = 'gg-shop-detail-dialog-body';
  const blurb = document.createElement('p');
  blurb.className = 'gg-shop-detail-dialog-blurb';
  blurb.textContent = item.blurb ?? item.description ?? '';
  body.append(blurb);
  const fullText = item.description ?? '';
  if (fullText && fullText !== (item.blurb ?? '')) {
    const full = document.createElement('p');
    full.className = 'gg-shop-detail-dialog-full';
    full.textContent = fullText;
    body.append(full);
  }
  shell.append(header, body);
  dialog.append(shell);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

export function renderShopView(
  root: HTMLElement,
  state: GardenState,
  buy: (itemId: string) => void,
  notice?: ShopNotice,
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
  const pager = document.createElement('nav');
  pager.className = 'gg-shop-pager';
  pager.setAttribute('aria-label', '商品分页');
  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.textContent = '‹ 上一页';
  prevButton.addEventListener('click', () => { currentPage -= 1; renderPage(); });
  const pageLabel = document.createElement('span');
  pageLabel.setAttribute('aria-live', 'polite');
  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.textContent = '下一页 ›';
  nextButton.addEventListener('click', () => { currentPage += 1; renderPage(); });
  pager.append(prevButton, pageLabel, nextButton);
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
    copy.className = 'gg-shop-detail-summary';
    copy.textContent = `${itemSummary(selected, state)} · 售价 ${selected.price} 金币`;
    detail.append(title, copy);
    const blurbText = selected.blurb ?? selected.description ?? '';
    if (blurbText) {
      const blurb = document.createElement('p');
      blurb.className = 'gg-shop-detail-blurb';
      blurb.textContent = blurbText;
      blurb.title = '点击查看详细介绍';
      blurb.addEventListener('click', () => showItemDetailDialog(selected));
      detail.append(blurb);
    }
    buyButton.textContent = `购买 · ${selected.price} 金币`;
    buyButton.disabled = Boolean(blocked)
      || Boolean(selected.unique && state.key_items?.[selected.item_id]?.obtained);
  };

  const renderPage = () => {
    const visible = items.filter((item) => (
      selectedCategory === 'all' || (selectedCategory !== 'charm' && item.item_type === selectedCategory)
    ));
    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    currentPage = Math.max(0, Math.min(currentPage, pageCount - 1));
    const pageItems = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
    for (const item of items) cards.get(item.item_id)!.hidden = !pageItems.includes(item);
    const emptyCount = Math.max(0, PAGE_SIZE - pageItems.length);
    emptySlots.forEach((slot, index) => { slot.hidden = index >= emptyCount; });
    if (!pageItems.some((item) => item.item_id === selectedItemId)) {
      selectedItemId = pageItems[0]?.item_id ?? '';
    }
    prevButton.disabled = currentPage <= 0;
    nextButton.disabled = currentPage >= pageCount - 1;
    pageLabel.textContent = `${currentPage + 1} / ${pageCount}`;
    pager.hidden = pageCount <= 1;
    renderSelection();
  };

  const applyCategory = (category: ShopCategory) => {
    selectedCategory = category;
    currentPage = 0;
    for (const button of tabs.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.category === category));
    }
    renderPage();
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
  let noticeEl: HTMLElement | null = null;
  if (notice) {
    noticeEl = document.createElement('div');
    noticeEl.className = 'gg-shop-notice';
    noticeEl.dataset.kind = notice.kind;
    noticeEl.setAttribute('role', 'status');
    noticeEl.textContent = notice.text;
    const dismissTimer = window.setTimeout(() => {
      noticeEl?.classList.add('gg-shop-notice-leave');
      window.setTimeout(() => noticeEl?.remove(), 450);
    }, 4200);
    noticeEl.addEventListener('click', () => {
      window.clearTimeout(dismissTimer);
      noticeEl?.remove();
    });
  }
  root.append(heading, wallet, tabs, list, pager, ...(noticeEl ? [noticeEl, detail] : [detail]), actions, note);
  applyCategory(selectedCategory);
}
