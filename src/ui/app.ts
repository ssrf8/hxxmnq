import battleConfigJson from '../battle/configs/greenhouse-flower-core-tutorial-v1.json';
import { BattleEngine, type BattleConfig } from './battle-engine';
import { bridge } from './bridge';
import { syncOpeningDatabase, type DatabaseSyncResult } from './database-adapter';
import { GardenMap } from './garden-map';
import { OpeningController } from './opening';
import type { GardenState } from './types';

const byId = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少界面节点：${id}`);
  return element as T;
};

const app = byId<HTMLElement>('gg-app');
const liveStatus = byId<HTMLElement>('gg-live-status');
const composeInput = byId<HTMLTextAreaElement>('gg-compose-input');
const messageList = byId<HTMLElement>('gg-message-list');
const inspectorTitle = byId<HTMLElement>('gg-inspector-title');
const inspectorBody = byId<HTMLElement>('gg-inspector-body');
const draftInteraction = byId<HTMLButtonElement>('gg-draft-interaction');
const battleDialog = byId<HTMLDialogElement>('gg-battle-dialog');
const battleCanvas = byId<HTMLCanvasElement>('gg-battle-canvas');
const assetBase = document.documentElement.dataset.assetBase ?? '../assets';
const mapSource = document.documentElement.dataset.mapSrc || `${assetBase}/maps/garden-base-spring-v1.png`;

let state: GardenState = {};
let selectedDraft = '';
let cleanupSubscription: (() => void) | undefined;
let battle: BattleEngine | undefined;
let refreshTimer = 0;
let runtimeMode: 'host' | 'preview' = 'preview';
let databaseSync: DatabaseSyncResult = { status: 'skipped', detail: '等待开局' };

function setStatus(text: string, error = false) {
  liveStatus.textContent = text;
  liveStatus.dataset.error = String(error);
}

function setTab(name: string) {
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    const active = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(active));
    byId<HTMLElement>(`gg-panel-${button.dataset.tab}`).hidden = !active;
  });
}

function renderHeader() {
  const environment = state.environment ?? {};
  byId('gg-garden-name').textContent = state.garden?.name ?? '无名庭园';
  byId('gg-time').textContent = `${environment.season ?? '春'}·第${environment.day ?? 1}日·${environment.time_period ?? '清晨'}`;
  byId('gg-weather').textContent = [environment.weather ?? '晴', environment.anomaly_weather].filter(Boolean).join(' / ');
  byId('gg-resources').textContent = `物资 ${state.resources?.materials ?? 0} · 灵感 ${state.resources?.inspiration ?? 0}`;
}

async function renderMessages() {
  const messages = await bridge.listMessages();
  const fragment = document.createDocumentFragment();
  messages.forEach((message) => {
    const article = document.createElement('article');
    article.className = `gg-message gg-message-${message.role}`;
    const header = document.createElement('header');
    header.textContent = message.name || (message.role === 'user' ? '玩家' : '叙事');
    if (message.swipeCount && message.swipeCount > 1) header.textContent += ` · ${Number(message.swipeId ?? 0) + 1}/${message.swipeCount}`;
    const body = document.createElement('p');
    body.textContent = message.text;
    article.append(header, body);
    fragment.append(article);
  });
  messageList.replaceChildren(fragment);
  messageList.scrollTop = messageList.scrollHeight;
}

async function renderDiagnostics() {
  const diagnostic = await bridge.diagnostics();
  runtimeMode = diagnostic.mode;
  const values: Record<string, string> = {
    运行模式: diagnostic.mode === 'host' ? '酒馆运行时' : '离线预览',
    Luker酒馆: diagnostic.tavernVersion,
    酒馆助手: diagnostic.helperVersion,
    MVU: diagnostic.mvuReady ? '已就绪' : '不可用',
    Bridge: diagnostic.bridgeVersion,
    数据库: diagnostic.databaseAvailable ? diagnostic.databaseVersion : '未加载（不影响核心玩法）',
    数据库归档: databaseSync.detail,
  };
  if (diagnostic.lastError) values['最近错误'] = diagnostic.lastError;
  const fragment = document.createDocumentFragment();
  Object.entries(values).forEach(([label, value]) => {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    fragment.append(dt, dd);
  });
  byId('gg-diagnostics').replaceChildren(fragment);
}

function renderBattleAvailability() {
  const button = byId<HTMLButtonElement>('gg-start-battle');
  const activeConfig = state.events?.active_event?.config_id;
  const available = runtimeMode === 'preview' || activeConfig === 'greenhouse_flower_core';
  button.disabled = !available;
  button.title = available ? '' : '对应剧情事件激活后可用';
}

const gardenMap = new GardenMap(byId<HTMLCanvasElement>('gg-garden-map'), mapSource, (target) => {
  if (target.kind === 'character') {
    const action = state.presence_snapshot?.character_views?.[target.id]?.action ?? '停留在庭园';
    inspectorTitle.textContent = target.label;
    inspectorBody.textContent = `${action}。点击下方按钮只会写入可编辑草稿，不会把一次点击当成完整交流。`;
    selectedDraft = `我走向${target.label}，先观察了一下对方正在做的事，然后开口与其交谈。`;
  } else {
    const area = state.areas?.[target.id];
    inspectorTitle.textContent = target.label;
    inspectorBody.textContent = `当前状态：${area?.state ?? '未知'}。前往区域只改变剧情焦点，不播放玩家地图寻路。`;
    selectedDraft = `我前往${target.label}，准备查看这里目前的状况。`;
  }
  draftInteraction.disabled = false;
});

const opening = new OpeningController(
  bridge,
  byId('gg-opening'),
  byId('gg-runtime-shell'),
  setStatus,
  () => void refresh(),
);

async function refresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(async () => {
    app.setAttribute('aria-busy', 'true');
    try {
      state = await bridge.readState();
      await opening.render(state);
      renderHeader();
      gardenMap.update(state);
      databaseSync = await syncOpeningDatabase(state);
      await Promise.all([renderMessages(), renderDiagnostics()]);
      renderBattleAvailability();
      setStatus('庭园状态已同步');
    } catch (error) {
      setStatus(`同步失败：${error instanceof Error ? error.message : String(error)}。请使用“显示原生聊天”。`, true);
    } finally {
      app.setAttribute('aria-busy', 'false');
    }
  }, 80);
}

document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab ?? 'garden')));
draftInteraction.addEventListener('click', () => { composeInput.value = selectedDraft; setTab('story'); composeInput.focus(); });
byId<HTMLButtonElement>('gg-end-chat').addEventListener('click', () => {
  const participants = state.interaction?.current_session?.participant_character_ids ?? [];
  const names = participants.map((id) => state.characters?.[id]?.name ?? id).join('、');
  composeInput.value = names ? `我准备结束与${names}的这次交谈，向他们说明后暂时离开。` : '我准备结束当前交谈，说明自己的打算后暂时离开。';
  composeInput.focus();
});
byId<HTMLFormElement>('gg-compose-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = composeInput.value.trim();
  if (!text) return setStatus('先写点什么再发送吧。', true);
  try {
    byId<HTMLButtonElement>('gg-send').disabled = true;
    await bridge.sendUserMessage(text);
    composeInput.value = '';
    setStatus('真实玩家消息已发送，正在生成回复');
  } catch (error) {
    setStatus(`发送失败：${error instanceof Error ? error.message : String(error)}`, true);
  } finally {
    byId<HTMLButtonElement>('gg-send').disabled = false;
  }
});
byId<HTMLButtonElement>('gg-stop').addEventListener('click', async () => setStatus(await bridge.stopGeneration() ? '已请求停止生成' : '当前没有可停止的生成'));
byId<HTMLButtonElement>('gg-regenerate').addEventListener('click', async () => { try { await bridge.regenerateLatest(); } catch (error) { setStatus(String(error), true); } });
byId<HTMLButtonElement>('gg-swipe').addEventListener('click', async () => { try { await bridge.swipeLatest(); } catch (error) { setStatus(String(error), true); } });
byId<HTMLButtonElement>('gg-show-native').addEventListener('click', async () => { const restored = await bridge.showNativeChat(); setStatus(restored ? '已请求显示原生聊天' : '离线预览没有原生聊天'); });
byId<HTMLButtonElement>('gg-reload').addEventListener('click', () => location.reload());

function startBattle() {
  battle?.destroy();
  battleDialog.showModal();
  battle = new BattleEngine(battleCanvas, battleConfigJson as BattleConfig, async (result) => {
    battleDialog.close();
    setStatus(`符卡结算：${result.outcome}，剩余生命 ${result.remaining_lives}`);
    const payload = JSON.stringify(result);
    try { await bridge.sendUserMessage(`【符卡战结算】\n<battle_result>${payload}</battle_result>\n请依据这一唯一结算结果继续剧情，不要重复结算。`); }
    catch (error) { composeInput.value = `【符卡战结算】\n<battle_result>${payload}</battle_result>`; setTab('story'); setStatus(`自动提交失败，结算已放入输入框：${String(error)}`, true); }
  });
  battle.start();
}
byId<HTMLButtonElement>('gg-start-battle').addEventListener('click', startBattle);
byId<HTMLButtonElement>('gg-close-battle').addEventListener('click', () => battle?.stop('narrative'));
battleDialog.addEventListener('cancel', (event) => { event.preventDefault(); battle?.stop('narrative'); });

globalThis.addEventListener('beforeunload', () => { cleanupSubscription?.(); gardenMap.destroy(); battle?.destroy(); });

async function boot() {
  cleanupSubscription = await bridge.subscribe(refresh);
  await refresh();
}

void boot();
