import { inventoryDisplayRows } from './inventory-rules';
import type { GardenState } from './types';

const PAGE_SIZE = 4;
let currentPage = 0;

const itemMarks: Record<string, string> = {
  incident_trigger_card: '异',
  emergency_repair_kit: '修',
  sakuya_watch: '刻',
  opportunity_card: '缘',
  foreign_vibrator: '振',
  foreign_egg: '蛋',
  reimu_coin_bait: '币',
  cirno_frog_bait: '蛙',
  cirno_ice_toy: '冰',
  marisa_dream_mushroom: '梦',
  marisa_obedience_page: '服',
  alice_doll_pause: '偶',
};

function duelDifficultyLabel(tagCount: number) {
  if (tagCount === 0) return '极难 · 原作 Hard 风格';
  return tagCount >= 3 ? '援助' : '标准';
}

export function renderInventoryView(
  root: HTMLElement,
  state: GardenState,
  useItem: (itemId: string) => void,
) {
  root.replaceChildren();
  const rows = inventoryDisplayRows(state);
  const totalQuantity = rows.reduce((total, row) => total + row.quantity, 0);

  const introduction = document.createElement('header');
  introduction.className = 'gg-inventory-intro';
  const introductionCopy = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'gg-eyebrow';
  eyebrow.textContent = 'TRAVELLER’S POUCH';
  const heading = document.createElement('h2');
  heading.textContent = '旅人背包';
  const note = document.createElement('p');
  note.className = 'gg-note';
  note.textContent = '庭园承认的物品会收在这里；场景道具需要前往对应地点使用。';
  introductionCopy.append(eyebrow, heading, note);

  const summary = document.createElement('div');
  summary.className = 'gg-inventory-summary';
  summary.setAttribute('aria-label', `持有 ${rows.length} 类物品，共 ${totalQuantity} 件`);
  const kindCount = document.createElement('strong');
  kindCount.textContent = String(rows.length);
  const kindLabel = document.createElement('span');
  kindLabel.textContent = '类物品';
  const totalCount = document.createElement('strong');
  totalCount.textContent = String(totalQuantity);
  const totalLabel = document.createElement('span');
  totalLabel.textContent = '件持有';
  summary.append(kindCount, kindLabel, totalCount, totalLabel);
  introduction.append(introductionCopy, summary);

  const list = document.createElement('div');
  list.className = 'gg-inventory-grid';
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'gg-inventory-empty';
    const emptyMark = document.createElement('span');
    emptyMark.setAttribute('aria-hidden', 'true');
    emptyMark.textContent = '空';
    const emptyText = document.createElement('p');
    emptyText.textContent = '背包还是空的。去灵梦小店看看，或从庭园活动中取得新物品。';
    empty.append(emptyMark, emptyText);
    root.append(introduction, empty);
    return;
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  currentPage = Math.max(0, Math.min(currentPage, pageCount - 1));
  const pageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  for (const row of pageRows) {
    const card = document.createElement('article');
    card.className = 'gg-inventory-item';
    card.dataset.kind = row.kind;
    card.dataset.usable = String(row.usable);
    card.dataset.itemId = row.item_id;

    const mark = document.createElement('div');
    mark.className = 'gg-inventory-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = itemMarks[row.item_id] ?? '物';

    const content = document.createElement('div');
    content.className = 'gg-inventory-item-content';
    const titleLine = document.createElement('div');
    titleLine.className = 'gg-inventory-title-line';
    const title = document.createElement('h3');
    title.textContent = row.title;
    const kind = document.createElement('span');
    kind.className = 'gg-inventory-kind';
    kind.textContent = row.kind === 'consumable' ? '消耗品' : '重要物';
    titleLine.append(title, kind);
    const details = document.createElement('p');
    details.className = 'gg-inventory-description';
    details.textContent = row.description;
    const status = document.createElement('p');
    status.className = 'gg-inventory-status';
    status.dataset.available = String(row.usable);
    status.textContent = row.usable ? (row.kind === 'key_item' ? '现在可以使用' : '可在对应入口使用') : row.disabledReason;
    content.append(titleLine, details, status);

    const side = document.createElement('div');
    side.className = 'gg-inventory-item-side';
    const quantity = document.createElement('span');
    quantity.className = 'gg-inventory-quantity';
    quantity.setAttribute('aria-label', `数量 ${row.quantity}`);
    quantity.textContent = row.kind === 'key_item' ? '唯一' : `×${row.quantity}`;
    side.append(quantity);
    if (['incident_trigger_card', 'sakuya_watch', 'opportunity_card'].includes(row.item_id)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gg-inventory-use';
      button.textContent = row.item_id === 'sakuya_watch'
        ? '使用怀表'
        : row.item_id === 'incident_trigger_card'
          ? '启用异变'
          : row.item_id === 'opportunity_card'
            ? '抽取机遇'
            : '选择对手';
      button.disabled = !row.usable;
      button.addEventListener('click', () => useItem(row.item_id));
      side.append(button);
    }
    card.append(mark, content, side);
    list.append(card);
  }
  const pager = document.createElement('nav');
  pager.className = 'gg-inventory-pager';
  pager.setAttribute('aria-label', '背包分页');
  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.textContent = '‹ 上一页';
  const pageLabel = document.createElement('span');
  pageLabel.setAttribute('aria-live', 'polite');
  pageLabel.textContent = `${currentPage + 1} / ${pageCount}`;
  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.textContent = '下一页 ›';
  prevButton.disabled = currentPage <= 0;
  nextButton.disabled = currentPage >= pageCount - 1;
  pager.hidden = pageCount <= 1;
  prevButton.addEventListener('click', () => {
    if (currentPage > 0) { currentPage -= 1; renderInventoryView(root, state, useItem); }
  });
  nextButton.addEventListener('click', () => {
    if (currentPage < pageCount - 1) { currentPage += 1; renderInventoryView(root, state, useItem); }
  });
  pager.append(prevButton, pageLabel, nextButton);
  root.append(introduction, list, pager);
}
