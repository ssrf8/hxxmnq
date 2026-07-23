import battleConfigJson from '../battle/configs/greenhouse-flower-core-tutorial-v1.json';
import { BattleEngine, type BattleConfig } from './battle-engine';
import { bridge } from './bridge';
import { syncOpeningDatabase, type DatabaseSyncResult } from './database-adapter';
import { projectGalScene } from './gal-scene';
import { GardenMap } from './garden-map';
import { OpeningController } from './opening';
import {
  buildActionMessage,
  buildSettlementMessage,
  targetActions,
} from './target-actions';
import type {
  GalSceneProjection,
  GardenState,
  InteractionTarget,
  SceneMode,
  TargetAction,
} from './types';

const byId = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少界面节点：${id}`);
  return element as T;
};

const app = byId<HTMLElement>('gg-app');
const liveStatus = byId<HTMLElement>('gg-live-status');
const targetMenu = byId<HTMLElement>('gg-target-menu');
const targetActionList = byId<HTMLElement>('gg-target-actions');
const galInput = byId<HTMLTextAreaElement>('gg-gal-input');
const replyPanel = byId<HTMLElement>('gg-reply-panel');
const suggestedReplies = byId<HTMLElement>('gg-suggested-replies');
const dialogueBox = byId<HTMLButtonElement>('gg-dialogue-box');
const portrait = byId<HTMLImageElement>('gg-portrait');
const portraitStage = byId<HTMLElement>('gg-portrait-stage');
const generationIndicator = byId<HTMLElement>('gg-generation-indicator');
const facilityImage = byId<HTMLImageElement>('gg-facility-image');
const workAnimation = byId<HTMLElement>('gg-work-animation');
const facilityConfirm = byId<HTMLButtonElement>('gg-facility-confirm');
const battleDialog = byId<HTMLDialogElement>('gg-battle-dialog');
const battleCanvas = byId<HTMLCanvasElement>('gg-battle-canvas');
const assetBase = document.documentElement.dataset.assetBase ?? '../assets';
const mapSource = document.documentElement.dataset.mapSrc || `${assetBase}/maps/garden-base-spring-v1.png`;
const reimuSpriteSource = document.documentElement.dataset.reimuSpriteSrc
  || `${assetBase}/characters/reimu/reimu-turnaround-v1.png`;
const reimuPortraitSource = document.documentElement.dataset.reimuPortraitSrc || reimuSpriteSource;
const mainHouseSource = document.documentElement.dataset.mainHouseSrc
  || `${assetBase}/world/house/main-house-states-v1.png`;

let state: GardenState = {};
let cleanupSubscription: (() => void) | undefined;
let battle: BattleEngine | undefined;
let refreshTimer = 0;
let runtimeMode: 'host' | 'preview' = 'preview';
let databaseSync: DatabaseSyncResult = { status: 'skipped', detail: '等待开局' };
let currentView: SceneMode = 'garden';
let previousView: SceneMode = 'garden';
let activeTarget: InteractionTarget | null = null;
let pendingAction: TargetAction | null = null;
let scene: GalSceneProjection | null = null;
let sceneSignature = '';
let beatIndex = 0;
let closurePending = false;
let closurePresented = false;
let bootRestoredSession = false;

function setStatus(text: string, error = false) {
  liveStatus.textContent = text;
  liveStatus.dataset.error = String(error);
}

function setView(view: SceneMode) {
  previousView = currentView === 'settings' ? previousView : currentView;
  currentView = view;
  for (const name of ['garden', 'gal', 'facility', 'settings'] as SceneMode[]) {
    byId<HTMLElement>(`gg-view-${name}`).hidden = name !== view;
  }
  if (view !== 'garden') hideTargetMenu();
}

function renderHeader() {
  const environment = state.environment ?? {};
  byId('gg-garden-name').textContent = state.garden?.name ?? '无名庭园';
  byId('gg-time').textContent = `${environment.season ?? '春'}·第${environment.day ?? 1}日·${environment.time_period ?? '清晨'}`;
  byId('gg-weather').textContent = [environment.weather ?? '晴', environment.anomaly_weather].filter(Boolean).join(' / ');
  byId('gg-resources').textContent = `物资 ${state.resources?.materials ?? 0} · 灵感 ${state.resources?.inspiration ?? 0}`;
}

function characterName(id: string | null) {
  if (!id) return '旁白';
  return state.characters?.[id]?.name ?? id;
}

function inferSessionTarget(): InteractionTarget | null {
  const session = state.interaction?.current_session;
  if (!session) return null;
  const participant = session.participant_character_ids?.[0];
  if (participant) {
    return {
      type: 'character',
      id: participant,
      label: state.characters?.[participant]?.name ?? participant,
    };
  }
  if (session.facility_id) {
    return {
      type: 'facility',
      id: session.facility_id,
      label: state.facilities?.[session.facility_id]?.name ?? session.facility_id,
    };
  }
  return null;
}

function renderSceneBeat() {
  if (!scene?.beats.length) return;
  beatIndex = Math.max(0, Math.min(beatIndex, scene.beats.length - 1));
  const beat = scene.beats[beatIndex];
  const speaker = characterName(beat.speakerId);
  byId('gg-scene-speaker').textContent = speaker;
  byId('gg-scene-text').textContent = beat.text;
  byId('gg-scene-progress').textContent = beatIndex < scene.beats.length - 1
    ? `${beatIndex + 1}/${scene.beats.length} · 点击继续`
    : `${beatIndex + 1}/${scene.beats.length}`;
  portraitStage.dataset.reaction = beat.reactionId;
  portrait.src = beat.speakerId === 'reimu' || activeTarget?.id === 'reimu'
    ? reimuPortraitSource
    : reimuPortraitSource;
  portrait.alt = `${speaker}近景占位图`;
  const atEnd = beatIndex >= scene.beats.length - 1;
  replyPanel.hidden = !atEnd;
  dialogueBox.disabled = atEnd;
  if (atEnd) {
    renderSuggestedReplies();
    const endButton = byId<HTMLButtonElement>('gg-end-chat');
    endButton.textContent = closurePresented ? '返回庭院' : '结束聊天';
    galInput.disabled = closurePresented;
    byId<HTMLButtonElement>('gg-send').disabled = closurePresented;
  }
}

function renderSuggestedReplies() {
  const fragment = document.createDocumentFragment();
  if (!closurePresented) {
    for (const reply of scene?.suggestedReplies ?? []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = reply.label;
      button.dataset.replyId = reply.id;
      button.addEventListener('click', () => void submitGalMessage(reply.intent));
      fragment.append(button);
    }
  }
  suggestedReplies.replaceChildren(fragment);
}

function setGenerating(active: boolean, label = '对方正在回应……') {
  generationIndicator.hidden = !active;
  generationIndicator.querySelector('p')!.textContent = label;
  dialogueBox.hidden = active;
  replyPanel.hidden = true;
  byId<HTMLButtonElement>('gg-stop').disabled = !active;
}

async function renderGal() {
  const transaction = await bridge.getTransactionState();
  const busy = ['submitting_user', 'generating', 'settling'].includes(transaction.phase);
  if (busy) {
    setGenerating(true);
    return;
  }
  setGenerating(false);
  const retryButton = byId<HTMLButtonElement>('gg-retry-transaction');
  retryButton.hidden = transaction.phase !== 'failed' || !transaction.userMessageCreated || transaction.assistantResponded;
  if (transaction.phase === 'failed') {
    setStatus(transaction.lastError || '生成失败，可以编辑、继续生成或显示原生聊天。', true);
    replyPanel.hidden = false;
  }
  const messages = await bridge.listMessages();
  const latest = [...messages].reverse().find((message) => message.role === 'assistant' && message.text.trim());
  if (!latest) {
    byId('gg-scene-speaker').textContent = characterName(activeTarget?.type === 'character' ? activeTarget.id : null);
    byId('gg-scene-text').textContent = '还没有可以播放的回复。';
    byId('gg-scene-progress').textContent = '';
    replyPanel.hidden = false;
    return;
  }
  const signature = `${latest.id}:${latest.swipeId ?? 0}:${latest.text.length}`;
  if (signature !== sceneSignature) {
    sceneSignature = signature;
    scene = projectGalScene(
      latest,
      state,
      activeTarget?.type === 'character' ? activeTarget.id : inferSessionTarget()?.id ?? null,
    );
    beatIndex = 0;
    if (closurePending) {
      closurePending = false;
      closurePresented = true;
    }
  }
  renderSceneBeat();
  if (scene?.malformed) setStatus('回复的 GAL 表现块格式异常，已安全降级为普通文本。', true);
}

function renderDiagnostics(transactionPhase: string, transactionError?: string) {
  return bridge.diagnostics().then((diagnostic) => {
    runtimeMode = diagnostic.mode;
    const values: Record<string, string> = {
      运行模式: diagnostic.mode === 'host' ? '酒馆运行时' : '离线预览',
      Luker酒馆: diagnostic.tavernVersion,
      酒馆助手: diagnostic.helperVersion,
      MVU: diagnostic.mvuReady ? '已就绪' : '不可用',
      Bridge: diagnostic.bridgeVersion,
      数据库: diagnostic.databaseAvailable ? diagnostic.databaseVersion : '未加载（不影响核心玩法）',
      数据库归档: databaseSync.detail,
      消息事务: transactionPhase,
      GAL协议: scene?.version ?? '等待回复',
    };
    if (transactionError) values['事务状态'] = transactionError;
    if (diagnostic.lastError) values['最近错误'] = diagnostic.lastError;
    const fragment = document.createDocumentFragment();
    Object.entries(values).forEach(([label, value]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      fragment.append(dt, dd);
    });
    byId('gg-diagnostics').replaceChildren(fragment);
  });
}

function hideTargetMenu() {
  targetMenu.hidden = true;
  targetActionList.replaceChildren();
}

function renderTargetMenu(target: InteractionTarget, anchor: { x: number; y: number }) {
  activeTarget = target;
  byId('gg-target-title').textContent = target.label;
  byId('gg-target-status').textContent = target.type === 'character'
    ? state.presence_snapshot?.character_views?.[target.id]?.action ?? '当前在庭园中'
    : `当前状态：${state.areas?.[target.id]?.state ?? state.facilities?.[target.id]?.state ?? '未知'}`;
  targetMenu.style.setProperty('--gg-anchor-x', `${anchor.x}px`);
  targetMenu.style.setProperty('--gg-anchor-y', `${anchor.y}px`);
  const currentSession = state.interaction?.current_session;
  const sessionTarget = inferSessionTarget();
  const switching = currentSession && sessionTarget
    && !(sessionTarget.type === target.type && sessionTarget.id === target.id);
  const fragment = document.createDocumentFragment();
  if (switching) {
    const note = document.createElement('p');
    note.className = 'gg-note';
    note.textContent = `当前与${sessionTarget.label}的会话尚未结算，不能直接覆盖。`;
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.textContent = '返回当前会话';
    resume.addEventListener('click', () => {
      activeTarget = sessionTarget;
      setView('gal');
      void renderGal();
    });
    fragment.append(note, resume);
  } else {
    for (const item of targetActions(target, state)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.title = item.disabledReason || item.description;
      button.disabled = Boolean(item.disabled);
      button.addEventListener('click', () => void chooseTargetAction(item));
      fragment.append(button);
    }
  }
  targetActionList.replaceChildren(fragment);
  targetMenu.hidden = false;
}

async function chooseTargetAction(action: TargetAction) {
  if (action.mode === 'close') {
    hideTargetMenu();
    return;
  }
  pendingAction = action;
  activeTarget = action.target;
  if (action.mode === 'facility') {
    openFacilityAction(action);
    return;
  }
  closurePending = false;
  closurePresented = false;
  scene = null;
  sceneSignature = '';
  setView('gal');
  setGenerating(true);
  await submitGalMessage(buildActionMessage(action));
}

function openFacilityAction(action: TargetAction) {
  setView('facility');
  byId('gg-facility-title').textContent = action.target.label;
  byId('gg-facility-description').textContent = action.description;
  const cost = document.createDocumentFragment();
  const pairs = action.id === 'repair'
    ? [['行动', '修复旧主屋'], ['最低物资', '1'], ['时间影响', '成功结算后推进一个时段']]
    : [['行动', action.label], ['时间影响', '依实际剧情判断']];
  for (const [label, value] of pairs) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    cost.append(dt, dd);
  }
  byId('gg-facility-cost').replaceChildren(cost);
  facilityImage.src = mainHouseSource;
  facilityImage.alt = `${action.target.label}状态占位图`;
  facilityConfirm.disabled = Boolean(action.disabled);
  facilityConfirm.textContent = action.disabled ? action.disabledReason || '当前不可用' : `确认${action.label}`;
  workAnimation.hidden = true;
}

async function confirmFacilityAction() {
  if (!pendingAction || pendingAction.disabled) return;
  facilityConfirm.disabled = true;
  workAnimation.hidden = false;
  setStatus(`${pendingAction.label}行动已提交，等待真实楼层和 MVU 结算。`);
  try {
    await bridge.sendUserMessage(buildActionMessage(pendingAction), 'interaction');
    workAnimation.hidden = true;
    scene = null;
    sceneSignature = '';
    closurePresented = false;
    setView('gal');
    await refresh();
  } catch (error) {
    workAnimation.hidden = true;
    facilityConfirm.disabled = false;
    setStatus(`设施行动失败：${error instanceof Error ? error.message : String(error)}`, true);
  }
}

async function submitGalMessage(text: string, kind: 'interaction' | 'settlement' = 'interaction') {
  const value = text.trim();
  if (!value) {
    setStatus('先写点什么再发送吧。', true);
    return;
  }
  const original = galInput.value;
  setGenerating(true);
  try {
    const transaction = await bridge.sendUserMessage(value, kind);
    galInput.value = '';
    scene = null;
    sceneSignature = '';
    setStatus(transaction.phase === 'settled' ? '回复与真实楼层已落盘' : '消息已发送，正在等待回复');
    await refresh();
  } catch (error) {
    galInput.value = original || value;
    setGenerating(false);
    replyPanel.hidden = false;
    setStatus(`发送失败：${error instanceof Error ? error.message : String(error)}`, true);
  }
}

async function endConversation() {
  if (closurePresented) {
    closurePresented = false;
    closurePending = false;
    activeTarget = null;
    pendingAction = null;
    scene = null;
    sceneSignature = '';
    setView('garden');
    setStatus('已经返回庭园');
    return;
  }
  const participants = state.interaction?.current_session?.participant_character_ids ?? [];
  const names = participants.map((id) => state.characters?.[id]?.name ?? id);
  const message = buildSettlementMessage(activeTarget, names);
  galInput.value = message;
  closurePending = true;
  await submitGalMessage(message, 'settlement');
}

async function refresh() {
  window.clearTimeout(refreshTimer);
  await new Promise<void>((resolve) => {
    refreshTimer = window.setTimeout(async () => {
      app.setAttribute('aria-busy', 'true');
      try {
        state = await bridge.readState();
        await opening.render(state);
        renderHeader();
        gardenMap.update(state);
        databaseSync = await syncOpeningDatabase(state);
        const transaction = await bridge.getTransactionState();
        await renderDiagnostics(transaction.phase, transaction.lastError);
        if (currentView === 'gal') await renderGal();
        if (!bootRestoredSession && state.meta?.opening_committed) {
          bootRestoredSession = true;
          const restored = inferSessionTarget();
          if (restored) {
            activeTarget = restored;
            setView('gal');
            await renderGal();
          }
        }
        setStatus('庭园状态已同步');
      } catch (error) {
        setStatus(`同步失败：${error instanceof Error ? error.message : String(error)}。请使用“显示原生聊天”。`, true);
      } finally {
        app.setAttribute('aria-busy', 'false');
        resolve();
      }
    }, 80);
  });
}

const gardenMap = new GardenMap(
  byId<HTMLCanvasElement>('gg-garden-map'),
  mapSource,
  reimuSpriteSource,
  (target, anchor) => renderTargetMenu(
    { type: target.kind, id: target.id, label: target.label },
    anchor,
  ),
);

const opening = new OpeningController(
  bridge,
  byId('gg-opening'),
  byId('gg-runtime-shell'),
  setStatus,
  () => void refresh(),
);

dialogueBox.addEventListener('click', () => {
  if (!scene || beatIndex >= scene.beats.length - 1) return;
  beatIndex += 1;
  renderSceneBeat();
});
byId('gg-target-close').addEventListener('click', hideTargetMenu);
byId('gg-gal-back').addEventListener('click', () => setView('garden'));
byId('gg-facility-back').addEventListener('click', () => setView('garden'));
facilityConfirm.addEventListener('click', () => void confirmFacilityAction());
byId<HTMLFormElement>('gg-gal-compose').addEventListener('submit', (event) => {
  event.preventDefault();
  void submitGalMessage(galInput.value);
});
byId('gg-end-chat').addEventListener('click', () => void endConversation());
byId('gg-retry-transaction').addEventListener('click', async () => {
  try {
    setGenerating(true, '正在继续上次生成……');
    await bridge.retryLastTransaction();
    await refresh();
  } catch (error) {
    setGenerating(false);
    setStatus(`继续生成失败：${error instanceof Error ? error.message : String(error)}`, true);
  }
});
byId('gg-stop').addEventListener('click', async () => {
  const stopped = await bridge.stopGeneration();
  setStatus(stopped ? '生成已停止；可以继续上次生成。' : '当前没有可停止的生成');
  await refresh();
});
byId('gg-regenerate').addEventListener('click', async () => {
  try {
    setGenerating(true, '正在重新生成……');
    await bridge.regenerateLatest();
    scene = null;
    sceneSignature = '';
    await refresh();
  } catch (error) {
    setGenerating(false);
    setStatus(`重新生成失败：${String(error)}`, true);
  }
});
byId('gg-swipe-left').addEventListener('click', async () => {
  try {
    await bridge.swipeLatest('left');
    scene = null;
    sceneSignature = '';
    await refresh();
  } catch (error) {
    setStatus(`上一条 Swipe 失败：${String(error)}`, true);
  }
});
byId('gg-swipe-right').addEventListener('click', async () => {
  try {
    setGenerating(true, '正在切换或生成下一条 Swipe……');
    await bridge.swipeLatest('right');
    scene = null;
    sceneSignature = '';
    await refresh();
  } catch (error) {
    setGenerating(false);
    setStatus(`下一条 Swipe 失败：${String(error)}`, true);
  }
});
byId('gg-open-settings').addEventListener('click', () => {
  previousView = currentView;
  setView('settings');
});
byId('gg-settings-back').addEventListener('click', () => setView(previousView === 'settings' ? 'garden' : previousView));
byId('gg-show-native').addEventListener('click', async () => {
  const restored = await bridge.showNativeChat();
  setStatus(restored ? '已显示原生聊天；使用“返回移动庭园”可回到游戏。' : '离线预览没有原生聊天');
});
byId('gg-reload').addEventListener('click', () => {
  globalThis.dispatchEvent(new CustomEvent('gensokyo-garden:reload'));
});

function startBattle() {
  battle?.destroy();
  battleDialog.showModal();
  battle = new BattleEngine(battleCanvas, battleConfigJson as BattleConfig, async (result) => {
    battleDialog.close();
    const payload = JSON.stringify(result);
    activeTarget = null;
    setView('gal');
    await submitGalMessage(`【符卡战结算】\n<battle_result>${payload}</battle_result>\n请依据这一唯一结算结果继续剧情，不要重复结算。`);
  });
  battle.start();
}
byId('gg-start-battle').addEventListener('click', startBattle);
byId('gg-close-battle').addEventListener('click', () => battle?.stop('narrative'));
battleDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  battle?.stop('narrative');
});

globalThis.addEventListener('beforeunload', () => {
  cleanupSubscription?.();
  gardenMap.destroy();
  battle?.destroy();
});

async function boot() {
  cleanupSubscription = await bridge.subscribe(() => void refresh());
  await refresh();
}

void boot();
