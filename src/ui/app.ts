import battleConfigJson from '../battle/configs/greenhouse-flower-core-tutorial-v1.json';
import fairyDungeonConfig from '../battle/configs/dungeons/fairy-pattern-practice-v1.json';
import forestDungeonConfig from '../battle/configs/dungeons/forest-magic-residue-v1.json';
import boundaryDungeonConfig from '../battle/configs/dungeons/boundary-echo-trial-v1.json';
import { BattleEngine, type BattleConfig } from './battle-engine';
import { bridge } from './bridge';
import { LatestRefreshQueue } from './async-coordination';
import { syncOpeningDatabase, type DatabaseSyncResult } from './database-adapter';
import { parseGardenAction, settlementProjection } from './event-settlement';
import { assistantForCurrentTurn } from './gal-message-selection';
import { projectGalScene } from './gal-scene';
import { GardenMap } from './garden-map';
import { resolveCharacterSprites } from './character-sprite-registry';
import {
  buildBattleSettlementMessage,
  greenhouseActionBlock,
  narrativeBattleResult,
} from './greenhouse-rules';
import { dungeonBlock } from './dungeon-rules';
import { renderShopView } from './shop-view';
import { renderInventoryView } from './inventory-view';
import { shopBlock, shopMessage } from './shop-rules';
import { openGardenOpportunityPanel, acknowledgeGraduation, graduationMessage } from './open-garden-rules';
import { buildPromptContext } from './prompt-context';
import { parseAnomalyClueReceipt } from './anomaly-rules';
import { consumableCount, listInventoryCatalog } from './inventory-rules';
import { queueSceneItemUse } from './activity-rules';
import { rollFacilityRisk } from './facility-rules';
import { periodSerialFromState } from './time-rules';
import { OpeningController } from './opening';
import {
  buildActionMessage,
  isFixedPresentationAction,
  targetActions,
  withGardenNarrativeContract,
} from './target-actions';
import type {
  BattleResult,
  ChatMessageView,
  GalSceneProjection,
  GardenState,
  InteractionTarget,
  MessageTransactionKind,
  PendingTask,
  SceneMode,
  TargetAction,
} from './types';

const byId = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少界面节点：${id}`);
  return element as T;
};

const app = byId<HTMLElement>('gg-app');
const galBackgroundSource = document.documentElement.dataset.galBackgroundSrc
  || '../assets/ui/gensokyo-gal-shrine-background-v1.png';
app.style.setProperty('--gg-gal-background-image', `url(${JSON.stringify(galBackgroundSource)})`);
const initialDevicePixelRatio = Math.max(0.5, globalThis.devicePixelRatio || 1);
function browserZoomCompensation() {
  const current = Math.max(0.5, globalThis.devicePixelRatio || 1);
  return Math.max(0.5, Math.min(2, initialDevicePixelRatio / current));
}
function updateBrowserZoomCompensation() {
  app.style.setProperty('--gg-browser-zoom-compensation', browserZoomCompensation().toFixed(3));
}
updateBrowserZoomCompensation();
globalThis.addEventListener('resize', updateBrowserZoomCompensation);
globalThis.visualViewport?.addEventListener('resize', updateBrowserZoomCompensation);
const liveStatus = byId<HTMLElement>('gg-live-status');
const targetMenu = byId<HTMLElement>('gg-target-menu');
const targetActionList = byId<HTMLElement>('gg-target-actions');
const galInput = byId<HTMLTextAreaElement>('gg-gal-input');
const galCompose = byId<HTMLFormElement>('gg-gal-compose');
const sceneItemSelect = byId<HTMLSelectElement>('gg-scene-item');
const sceneItemPicker = byId<HTMLElement>('gg-scene-item-picker');
const sceneItemHint = byId<HTMLElement>('gg-scene-item-hint');
const replyPanel = byId<HTMLElement>('gg-reply-panel');
const suggestedReplies = byId<HTMLElement>('gg-suggested-replies');
const dialogueBox = byId<HTMLButtonElement>('gg-dialogue-box');
const sessionHistoryDialog = byId<HTMLDialogElement>('gg-session-history-dialog');
const sessionHistoryList = byId<HTMLElement>('gg-session-history-list');
const portrait = byId<HTMLImageElement>('gg-portrait');
const portraitStage = byId<HTMLElement>('gg-portrait-stage');
const generationIndicator = byId<HTMLElement>('gg-generation-indicator');
const pendingTasksPanel = byId<HTMLElement>('gg-pending-tasks');
const pendingTaskList = byId<HTMLElement>('gg-pending-task-list');
const facilityView = byId<HTMLElement>('gg-view-facility');
const facilityVisual = byId<HTMLElement>('gg-facility-visual');
const facilityImage = byId<HTMLImageElement>('gg-facility-image');
const workAnimation = byId<HTMLElement>('gg-work-animation');
const facilityConfirm = byId<HTMLButtonElement>('gg-facility-confirm');
const launcherDialog = byId<HTMLDialogElement>('gg-launcher-dialog');
const launcherButton = byId<HTMLButtonElement>('gg-open-launcher');
const battleDialog = byId<HTMLDialogElement>('gg-battle-dialog');
const dungeonDialog = byId<HTMLDialogElement>('gg-dungeon-dialog');
const battleCanvas = byId<HTMLCanvasElement>('gg-battle-canvas');
const battleFocusBtn = byId<HTMLButtonElement>('gg-battle-focus');
const battleBombBtn = byId<HTMLButtonElement>('gg-battle-bomb');
const battleBombCount = byId<HTMLElement>('gg-battle-bomb-count');
const dungeonButtonImage = byId<HTMLImageElement>('gg-dungeon-button-image');
const shopButtonImage = byId<HTMLImageElement>('gg-shop-button-image');
const inventoryButtonImage = byId<HTMLImageElement>('gg-inventory-button-image');
const shopBackgroundImage = byId<HTMLImageElement>('gg-shop-background');
const assetBase = document.documentElement.dataset.assetBase ?? '../assets';
type TargetActionVisualKind = 'talk' | 'leave' | 'pat-head' | 'quest';
const targetActionSymbols: Record<TargetActionVisualKind, string> = {
  talk: '···',
  leave: '×',
  'pat-head': '♡',
  quest: '!',
};
dungeonButtonImage.src = document.documentElement.dataset.dungeonButtonSrc
  || `${assetBase}/ui/reimu-dungeon-button-v1.png`;
shopButtonImage.src = document.documentElement.dataset.shopButtonSrc
  || `${assetBase}/ui/reimu-shop-button-v1.png`;
inventoryButtonImage.src = document.documentElement.dataset.inventoryButtonSrc
  || `${assetBase}/ui/marisa-inventory-button-v1.png`;
shopBackgroundImage.src = document.documentElement.dataset.shopBackgroundSrc
  || `${assetBase}/ui/reimu-shop-ui-background-v1.png`;
const mapSource = document.documentElement.dataset.mapSrc || `${assetBase}/maps/garden-base-spring-v1.png`;
const mapFacilitySprites = (() => {
  try {
    return JSON.parse(document.documentElement.dataset.mapFacilitySprites ?? '{}');
  } catch {
    return {};
  }
})();
const characterSprites = resolveCharacterSprites(assetBase, document.documentElement.dataset);
const reimuSpriteSource = characterSprites.reimu.idleSource;
const reimuPortraitSource = document.documentElement.dataset.reimuPortraitSrc || reimuSpriteSource;
const marisaSpriteSource = characterSprites.marisa.idleSource;
const marisaPortraitSource = document.documentElement.dataset.marisaPortraitSrc || marisaSpriteSource;
const mainHouseSource = document.documentElement.dataset.mainHouseSrc
  || `${assetBase}/world/house/main-house-states-v1.png`;
const greenhouseSource = document.documentElement.dataset.greenhouseSrc
  || `${assetBase}/world/greenhouse/magic-greenhouse-states-v1.png`;
const battlePlayerSheetSource = document.documentElement.dataset.battlePlayerSrc
  || `${assetBase}/battle/player/keycraft-player-sheet-v1.png`;
const battleBossSheetSource = document.documentElement.dataset.battleBossSrc
  || `${assetBase}/battle/boss/greenhouse-flower-core-sheet-v1.png`;
const battleBossCirnoSheetSource = document.documentElement.dataset.battleBossCirnoSrc
  || `${assetBase}/battle/boss/cirno-battle-sheet-v1.png`;
const battleBossAliceSheetSource = document.documentElement.dataset.battleBossAliceSrc
  || `${assetBase}/battle/boss/alice-battle-sheet-v1.png`;
const battleBossSakuyaSheetSource = document.documentElement.dataset.battleBossSakuyaSrc
  || `${assetBase}/battle/boss/sakuya-battle-sheet-v1.png`;
const battleEffectsSheetSource = document.documentElement.dataset.battleEffectsSrc
  || `${assetBase}/battle/effects/battle-effects-sheet-v1.png`;
const battleAtlasSources = {
  player: battlePlayerSheetSource,
  boss: battleBossSheetSource,
  boss_cirno: battleBossCirnoSheetSource,
  boss_alice: battleBossAliceSheetSource,
  boss_sakuya: battleBossSakuyaSheetSource,
  effects: battleEffectsSheetSource,
};

let state: GardenState = {};
let cleanupSubscription: (() => void) | undefined;
let battle: BattleEngine | undefined;
let runtimeMode: 'host' | 'preview' = 'preview';
let databaseSync: DatabaseSyncResult = { status: 'skipped', detail: '等待开局' };
let currentView: SceneMode = 'garden';
let settingsReturnView: Exclude<SceneMode, 'settings'> = 'garden';
let activeTarget: InteractionTarget | null = null;
let activeSessionActionId: string | null = null;
let pendingAction: TargetAction | null = null;
let scene: GalSceneProjection | null = null;
let sceneSignature = '';
let beatIndex = 0;
let closurePending = false;
let closurePresented = false;
let singleShotEventPresentation = false;
let bootRestoredSession = false;
let pendingBattleResult: BattleResult | null = null;
let activeBattleKind: 'flower_core' | 'dungeon' | 'practice' = 'flower_core';
let activeSceneId = '';
let submissionInFlight = false;
let automaticTaskInFlight = false;

const GREENHOUSE_RESEARCH_INPUT_MAX_LENGTH = 120;

function greenhouseResearchJustSettled() {
  return activeSessionActionId === 'greenhouse_research_talk'
    && !state.interaction?.current_session
    && Boolean(state.events?.completed_key_events?.greenhouse_multiturn_conversation);
}

function setStatus(text: string, error = false, tone?: 'success' | 'info') {
  liveStatus.textContent = text;
  liveStatus.dataset.error = String(error);
  if (tone && !error) liveStatus.dataset.tone = tone;
  else delete liveStatus.dataset.tone;
}

function setView(view: SceneMode) {
  currentView = view;
  // 供 CSS 按当前视图切换外壳形态（庭园视图去边框、地图撑满）。
  byId('gg-app').dataset.activeView = view;
  for (const name of ['garden', 'gal', 'facility', 'settings', 'shop', 'inventory', 'opportunities'] as SceneMode[]) {
    const node = document.getElementById(`gg-view-${name}`);
    if (node) node.hidden = name !== view;
  }
  if (view !== 'garden') hideTargetMenu();
}

function openSettings() {
  const sourceView = currentView;
  if (sourceView === 'settings') return;
  settingsReturnView = sourceView;
  setView('settings');
}

function returnFromSettings() {
  const returnView = settingsReturnView;
  setView(returnView);
  if (returnView === 'gal') void refresh();
}

let launcherOpener: HTMLElement | null = null;

function updateLauncherSummary() {
  byId('gg-launcher-summary').textContent = [
    byId('gg-time').textContent,
    byId('gg-weather').textContent,
    byId('gg-resources').textContent,
  ].filter(Boolean).join(' · ');
}

function openLauncher() {
  updateLauncherSummary();
  if (launcherDialog.open) return;
  launcherOpener = document.activeElement instanceof HTMLElement ? document.activeElement : launcherButton;
  launcherDialog.showModal();
}

function closeLauncher() {
  if (launcherDialog.open) launcherDialog.close();
}

function navigateFromLauncher(action: () => void) {
  closeLauncher();
  action();
}

function renderHeader() {
  const environment = state.environment ?? {};
  byId('gg-garden-name').textContent = state.garden?.name ?? '无名庭园';
  byId('gg-time').textContent = `${environment.season ?? '春'}·第${environment.day ?? 1}日·${environment.time_period ?? '清晨'}`;
  byId('gg-weather').textContent = [environment.weather ?? '晴', environment.anomaly_weather].filter(Boolean).join(' / ');
  byId('gg-resources').textContent = `物资 ${state.resources?.materials ?? 0} · 灵感 ${state.resources?.inspiration ?? 0} · 金币 ${state.resources?.coins ?? 0}`;
  updateLauncherSummary();
}

function taskActionLabel(task: PendingTask) {
  if (task.status === 'processing') return '恢复待办';
  return task.kind === 'anomaly_resolution' ? '进行异变收尾' : '开始宴会';
}

function renderPendingTasks() {
  const tasks = [...(state.pending_tasks ?? [])].sort((left, right) => (
    left.auto_resolve_period_serial - right.auto_resolve_period_serial
  ));
  pendingTasksPanel.hidden = tasks.length === 0;
  const fragment = document.createDocumentFragment();
  const now = periodSerialFromState(state);
  for (const task of tasks) {
    const card = document.createElement('article');
    card.className = 'gg-pending-task';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const detail = document.createElement('p');
    const remaining = Math.max(0, task.auto_resolve_period_serial - now);
    title.textContent = task.label;
    detail.textContent = remaining > 0
      ? `剩余 ${remaining} 个标准时段；未处理时将由本地代码默认完成。`
      : '已到自动处理时点，将在本次状态协调中完成。';
    copy.append(title, detail);
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = taskActionLabel(task);
    action.disabled = submissionInFlight;
    action.addEventListener('click', () => {
      if (task.status === 'processing') {
        void bridge.applyM2Command({ type: 'release_pending_task', taskId: task.task_id }).then(() => refresh());
      } else if (task.kind === 'anomaly_resolution') {
        void runAnomalyResolution(task.task_id);
      } else {
        void startBanquetTask(task);
      }
    });
    card.append(copy, action);
    fragment.append(card);
  }
  pendingTaskList.replaceChildren(fragment);
}

function maybeStartAutomaticAnomalyResolution(transactionPhase: string) {
  if (automaticTaskInFlight || submissionInFlight || currentView === 'gal' || activeTarget) return;
  if (!['idle', 'settled'].includes(transactionPhase)) return;
  const task = state.pending_tasks?.find((item) => (
    item.kind === 'anomaly_resolution'
    && item.status === 'pending'
    && item.payload?.reminder_only !== true
  ));
  if (!task) return;
  automaticTaskInFlight = true;
  queueMicrotask(() => {
    void runAnomalyResolution(task.task_id).finally(() => { automaticTaskInFlight = false; });
  });
}

function characterName(id: string | null) {
  if (!id) return '旁白';
  return state.characters?.[id]?.name ?? id;
}

function inferSessionTarget(): InteractionTarget | null {
  const session = state.interaction?.current_session as
    | (NonNullable<typeof state.interaction>['current_session'] & { participants?: string[] })
    | null
    | undefined;
  if (!session) return null;
  const participant = session.participant_character_ids?.[0]
    || session.participants?.[0];
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

function inferRecentGalContext(messages: ChatMessageView[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    const action = parseGardenAction(message.text);
    if (!action) continue;
    if (action.action_id === 'end_conversation' || isFixedPresentationAction(action.action_id)) return null;
    if (action.target_type === 'character' && action.target_id) {
      return {
        target: {
          type: 'character' as const,
          id: action.target_id,
          label: state.characters?.[action.target_id]?.name ?? action.target_id,
        },
        actionId: action.action_id,
      };
    }
    if (action.target_type === 'facility' && action.target_id) {
      return {
        target: {
          type: 'facility' as const,
          id: action.target_id,
          label: state.facilities?.[action.target_id]?.name ?? action.target_id,
        },
        actionId: action.action_id,
      };
    }
    return null;
  }
  return null;
}

function renderSceneBeat() {
  if (!scene?.beats.length) return;
  beatIndex = Math.max(0, Math.min(beatIndex, scene.beats.length - 1));
  const beat = scene.beats[beatIndex];
  const atEnd = beatIndex >= scene.beats.length - 1;
  const speaker = characterName(beat.speakerId);
  byId('gg-scene-speaker').textContent = speaker;
  const sceneText = byId('gg-scene-text');
  sceneText.textContent = beat.text;
  // Replay the entrance fade per beat; the class is decorative only.
  sceneText.classList.remove('gg-beat-enter');
  void (sceneText as HTMLElement).offsetWidth;
  sceneText.classList.add('gg-beat-enter');
  byId('gg-scene-progress').textContent = beatIndex < scene.beats.length - 1
    ? `${beatIndex + 1}/${scene.beats.length} · 点击继续`
    : singleShotEventPresentation
      ? '点击返回庭园'
      : `${beatIndex + 1}/${scene.beats.length}`;
  portraitStage.dataset.reaction = beat.reactionId;
  portrait.src = beat.speakerId === 'marisa' || activeTarget?.id === 'marisa'
    ? marisaPortraitSource
    : reimuPortraitSource;
  portrait.alt = `${speaker}近景占位图`;
  replyPanel.hidden = !atEnd || singleShotEventPresentation;
  galCompose.hidden = singleShotEventPresentation;
  dialogueBox.disabled = atEnd && !singleShotEventPresentation;
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

function setGenerating(active: boolean, label = '对方正在回应……', stoppable = true) {
  generationIndicator.hidden = !active;
  generationIndicator.querySelector('p')!.textContent = label;
  app.dataset.transactionBusy = String(active);
  dialogueBox.hidden = active;
  replyPanel.hidden = true;
  if (active) {
    byId('gg-scene-speaker').textContent = '';
    byId('gg-scene-text').textContent = '';
    byId('gg-scene-progress').textContent = '';
  }
  byId<HTMLButtonElement>('gg-stop').disabled = !active || !stoppable;
  byId<HTMLButtonElement>('gg-gal-back').disabled = active;
  byId<HTMLButtonElement>('gg-end-chat').disabled = active;
  byId<HTMLButtonElement>('gg-regenerate').disabled = active;
  byId<HTMLButtonElement>('gg-swipe-right').disabled = active;
  byId<HTMLButtonElement>('gg-send').disabled = active || closurePresented;
  galInput.disabled = active || closurePresented;
  sceneItemSelect.disabled = active || singleShotEventPresentation || closurePending;
  updateSceneItemPickerState();
  suggestedReplies.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.disabled = active;
  });
}

function isRestoredFixedPresentation(messages: ChatMessageView[], latest: ChatMessageView) {
  const assistantIndex = messages.findIndex((message) => message.id === latest.id && message.role === 'assistant');
  if (assistantIndex < 1) return false;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'assistant') return false;
    if (message.role !== 'user') continue;
    const action = parseGardenAction(message.text);
    return Boolean(
      action
      && isFixedPresentationAction(action.action_id)
      && settlementProjection(state, action),
    );
  }
  return false;
}

function userHistoryText(value: string) {
  return String(value ?? '')
    .split('【庭园正文协议】')[0]
    .replace(/<GensokyoAction>[\s\S]*?<\/GensokyoAction>/giu, '')
    .trim();
}

function sessionHistoryMessages(messages: ChatMessageView[], preferredUserMessageId?: number) {
  const target = activeTarget;
  let start = -1;
  if (target) {
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.role !== 'user') continue;
      const action = parseGardenAction(message.text);
      if (action?.target_type === target.type && action.target_id === target.id
        && (!activeSessionActionId || action.action_id === activeSessionActionId)) start = index;
    }
  }
  if (start < 0 && Number.isInteger(preferredUserMessageId)) {
    start = messages.findIndex((message) => message.role === 'user' && message.id === preferredUserMessageId);
  }
  // System scenes such as anomaly activation/resolution have no character target
  // or GensokyoAction. Treat the latest real user/assistant pair as this scene.
  if (start < 0) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') {
        start = index;
        break;
      }
    }
  }
  if (start < 0) return [];
  const result: ChatMessageView[] = [];
  for (let index = start; index < messages.length; index += 1) {
    const message = messages[index];
    if (index > start && message.role === 'user' && parseGardenAction(message.text)) break;
    result.push(message);
  }
  return result;
}

async function openSessionHistory() {
  const transaction = await bridge.getTransactionState();
  const messages = sessionHistoryMessages(await bridge.listMessages(), transaction.userMessageId)
    .filter((message) => message.role !== 'assistant' || message.text.trim());
  const fragment = document.createDocumentFragment();
  if (!messages.length) {
    const empty = document.createElement('p');
    empty.className = 'gg-note';
    empty.textContent = '当前还没有可归入这次互动的对话记录。';
    fragment.append(empty);
  }
  for (const message of messages) {
    const entry = document.createElement('article');
    entry.className = 'gg-session-history-entry';
    entry.dataset.role = message.role;
    const header = document.createElement('header');
    const body = document.createElement('p');
    if (message.role === 'user') {
      header.textContent = '你';
      body.textContent = userHistoryText(message.text) || '庭园行动';
    } else {
      const projection = projectGalScene(message, state, activeTarget?.type === 'character' ? activeTarget.id : null);
      header.textContent = projection.beats.some((beat) => beat.speakerId) ? '剧情' : '旁白';
      body.textContent = projection.beats.map((beat) => {
        const prefix = beat.speakerId ? `${characterName(beat.speakerId)}：` : '';
        return `${prefix}${beat.text}`;
      }).join('\n\n');
    }
    entry.append(header, body);
    fragment.append(entry);
  }
  sessionHistoryList.replaceChildren(fragment);
  if (!sessionHistoryDialog.open) sessionHistoryDialog.showModal();
}

async function renderGal() {
  const transaction = await bridge.getTransactionState();
  if (transaction.phase === 'submitting_user' || transaction.phase === 'generating') {
    setGenerating(true, transaction.phase === 'submitting_user' ? '正在提交消息……' : '对方正在回应……');
    return;
  }
  if (transaction.phase === 'settling') {
    setGenerating(true, '回复已收到，正在同步游戏状态……', false);
    return;
  }
  setGenerating(false);
  const retryButton = byId<HTMLButtonElement>('gg-retry-transaction');
  retryButton.hidden = transaction.phase !== 'failed' || !transaction.userMessageCreated;
  retryButton.textContent = transaction.assistantResponded ? '重试本地结算' : '重试生成';
  if (transaction.phase === 'failed') {
    setStatus(transaction.lastError || '生成失败，可以编辑、继续生成或显示原生聊天。', true);
    replyPanel.hidden = false;
  }
  const messages = await bridge.listMessages();
  const latest = assistantForCurrentTurn(messages, transaction.userMessageId);
  if (!latest) {
    byId('gg-scene-speaker').textContent = characterName(activeTarget?.type === 'character' ? activeTarget.id : null);
    byId('gg-scene-text').textContent = '还没有可以播放的回复。';
    byId('gg-scene-progress').textContent = '';
    replyPanel.hidden = false;
    return;
  }
  singleShotEventPresentation ||= isRestoredFixedPresentation(messages, latest);
  const signature = `${latest.id}:${latest.swipeId ?? 0}:${latest.text.length}:${latest.text.slice(0, 48)}`;
  if (signature !== sceneSignature || !scene) {
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
  if (!scene?.beats.length) {
    byId('gg-scene-speaker').textContent = characterName(activeTarget?.type === 'character' ? activeTarget.id : null);
    byId('gg-scene-text').textContent = '本轮回复没有可播放的正文，请查看本次对话记录或重新生成。';
    byId('gg-scene-progress').textContent = '';
    replyPanel.hidden = false;
    return;
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
  gardenMap.setSelected(null);
}

function targetActionVisualKind(action?: TargetAction): TargetActionVisualKind {
  if (!action) return 'talk';
  if (action.mode === 'close' || action.id === 'leave') return 'leave';
  if (action.id === 'pat_head') return 'pat-head';
  if (action.eventId || action.mode === 'facility' || action.mode === 'battle' || action.mode === 'battle_narrative') {
    return 'quest';
  }
  return 'talk';
}

function createBubbleButton(
  label: string,
  mode: string,
  options: {
    title?: string;
    disabled?: boolean;
    action?: TargetAction;
    visualKind?: TargetActionVisualKind;
  } = {},
) {
  const visualKind = options.visualKind ?? targetActionVisualKind(options.action);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gg-bubble';
  button.dataset.mode = mode;
  button.dataset.visualKind = visualKind;
  const dot = document.createElement('span');
  dot.className = 'gg-bubble-dot';
  dot.setAttribute('aria-hidden', 'true');
  const symbol = document.createElement('span');
  symbol.className = 'gg-bubble-symbol';
  symbol.textContent = targetActionSymbols[visualKind];
  dot.append(symbol);
  const text = document.createElement('span');
  text.className = 'gg-bubble-label';
  text.textContent = label;
  button.append(dot, text);
  if (options.title) button.title = options.title;
  button.disabled = Boolean(options.disabled);
  if (button.disabled && options.title) {
    const reason = document.createElement('span');
    reason.className = 'gg-bubble-reason';
    reason.textContent = options.title;
    button.append(reason);
  }
  return button;
}

// 半环绕布局需要完整的弧半径空间；把锚点收进容器安全区。
// 地图拖动/缩放时由 GardenMap 的跟随回调持续调用，菜单钉在目标本体上。
function positionTargetMenu(anchor: { x: number; y: number }) {
  let anchorX = anchor.x;
  let anchorY = anchor.y;
  const shell = targetMenu.parentElement;
  if (!matchMedia('(max-width: 700px)').matches && shell) {
    const rect = shell.getBoundingClientRect();
    const compensation = browserZoomCompensation();
    anchorX = Math.max(245 * compensation, Math.min(rect.width - 245 * compensation, anchor.x));
    anchorY = Math.max(245 * compensation, Math.min(rect.height - 140 * compensation, anchor.y));
  }
  targetMenu.style.setProperty('--gg-anchor-x', `${anchorX}px`);
  targetMenu.style.setProperty('--gg-anchor-y', `${anchorY}px`);
}

function renderTargetMenu(target: InteractionTarget, anchor: { x: number; y: number }) {
  activeTarget = target;
  byId('gg-target-title').textContent = target.label;
  byId('gg-target-status').textContent = target.type === 'character'
    ? state.presence_snapshot?.character_views?.[target.id]?.action ?? '当前在庭园中'
    : `当前状态：${state.areas?.[target.id]?.state ?? state.facilities?.[target.id]?.state ?? '未知'}`;
  positionTargetMenu(anchor);
  const radialLayout = !matchMedia('(max-width: 700px)').matches;
  const currentSession = state.interaction?.current_session;
  const sessionTarget = inferSessionTarget();
  const switching = currentSession && sessionTarget
    && !(sessionTarget.type === target.type && sessionTarget.id === target.id);
  const fragment = document.createDocumentFragment();
  if (switching) {
    const note = document.createElement('p');
    note.className = 'gg-note';
    note.textContent = `当前与${sessionTarget.label}的会话尚未结算，不能直接覆盖。`;
    const resume = createBubbleButton('返回当前会话', 'gal');
    resume.addEventListener('click', () => {
      activeTarget = sessionTarget;
      setView('gal');
      void renderGal();
    });
    fragment.append(note, resume);
  } else {
    // 菜单右上角已经提供关闭入口；不再重复渲染语义相同的“离开”。
    for (const item of targetActions(target, state).filter((candidate) => (
      candidate.mode !== 'close' && candidate.id !== 'leave'
    ))) {
      const button = createBubbleButton(item.label, item.mode, {
        title: item.disabledReason || item.description,
        disabled: item.disabled,
        action: item,
      });
      button.addEventListener('click', () => void chooseTargetAction(item));
      fragment.append(button);
    }
  }
  targetActionList.replaceChildren(fragment);
  // 桌面端：把气泡摆在锚点上方的半环上（-160° 到 -20°），标题与状态牌留在锚点下方。
  if (radialLayout) {
    const bubbles = Array.from(targetActionList.querySelectorAll<HTMLButtonElement>('.gg-bubble'));
    const startAngle = -165;
    const endAngle = -15;
    const reach = Math.min(168, 122 + Math.max(0, bubbles.length - 3) * 15);
    bubbles.forEach((bubble, index) => {
      const angle = bubbles.length === 1
        ? -90
        : startAngle + ((endAngle - startAngle) * index) / (bubbles.length - 1);
      const radians = (angle * Math.PI) / 180;
      bubble.style.setProperty('--gg-bubble-x', `${Math.round(Math.cos(radians) * reach)}px`);
      bubble.style.setProperty('--gg-bubble-y', `${Math.round(Math.sin(radians) * reach)}px`);
    });
  }
  targetMenu.hidden = false;
  gardenMap.setSelected(target.id);
}

async function chooseTargetAction(action: TargetAction) {
  if (action.mode === 'close') {
    hideTargetMenu();
    return;
  }
  pendingAction = action;
  activeSceneId = state.scene_item_context?.scene_id || `scene:${Date.now().toString(36)}`;
  activeTarget = action.target;
  activeSessionActionId = action.id;
  if (action.mode === 'battle') {
    startBattle();
    return;
  }
  if (action.mode === 'battle_narrative') {
    await settleBattleResult(narrativeBattleResult());
    return;
  }
  if (action.mode === 'facility') {
    openFacilityAction(action);
    return;
  }
  closurePending = false;
  closurePresented = false;
  singleShotEventPresentation = Boolean(action.fixedPresentation);
  scene = null;
  sceneSignature = '';
  setView('gal');
  setGenerating(true);
  await submitGalMessage(buildActionMessage(action, state), 'interaction', { restoreInputOnFailure: false });
}

function openFacilityAction(action: TargetAction) {
  setView('facility');
  const isInspectView = action.id === 'inspect';
  facilityView.dataset.presentation = isInspectView ? 'details' : 'action';
  facilityVisual.hidden = isInspectView;
  byId('gg-facility-title').textContent = action.target.label;
  byId('gg-facility-description').textContent = action.description;
  const cost = document.createDocumentFragment();
  const pairs: string[][] = [['行动', action.label]];
  if (action.id === 'repair') pairs.push(['最低物资', '1']);
  if (action.cost?.materials) pairs.push(['消耗物资', String(action.cost.materials)]);
  if (action.cost?.inspiration) pairs.push(['消耗灵感', String(action.cost.inspiration)]);
  pairs.push(['时间影响', action.mayAdvanceTime ? '成功结算后推进一个时段' : '依实际剧情判断']);
  for (const [label, value] of pairs) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    cost.append(dt, dd);
  }
  byId('gg-facility-cost').replaceChildren(cost);
  if (isInspectView) {
    facilityImage.removeAttribute('src');
    facilityImage.alt = '';
  } else {
    facilityImage.src = action.target.id === 'greenhouse_plot' || action.target.id === 'magic_greenhouse'
      ? greenhouseSource
      : mainHouseSource;
    facilityImage.alt = `${action.target.label}状态占位图`;
  }
  facilityConfirm.disabled = Boolean(action.disabled);
  facilityConfirm.textContent = action.disabled ? action.disabledReason || '当前不可用' : `确认${action.label}`;
  workAnimation.hidden = true;
}

async function confirmFacilityAction() {
  if (!pendingAction || pendingAction.disabled) return;
  facilityConfirm.disabled = true;
  activeSessionActionId = pendingAction.id;
  workAnimation.hidden = false;
  setStatus(`${pendingAction.label}行动已提交，等待真实楼层和 MVU 结算。`);
  try {
    singleShotEventPresentation = Boolean(pendingAction.fixedPresentation);
    await bridge.sendUserMessage(buildActionMessage(pendingAction, state), 'interaction');
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

async function submitGalMessage(
  text: string,
  kind: MessageTransactionKind = 'interaction',
  { restoreInputOnFailure = true }: { restoreInputOnFailure?: boolean } = {},
) {
  const value = text.trim();
  if (submissionInFlight) {
    setStatus('上一条消息仍在生成或结算中，请稍候。', true);
    return false;
  }
  if (!value) {
    setStatus('先写点什么再发送吧。', true);
    return false;
  }
  if (kind === 'interaction'
    && state.interaction?.current_session?.event_id === 'greenhouse_multiturn_conversation'
    && value.length > GREENHOUSE_RESEARCH_INPUT_MAX_LENGTH) {
    setStatus(`温室研究的补充请控制在 ${GREENHOUSE_RESEARCH_INPUT_MAX_LENGTH} 字以内。`, true);
    return false;
  }
  const original = galInput.value;
  const selectedItemId = kind === 'interaction' ? sceneItemSelect.value : '';
  const itemUseId = selectedItemId ? `scene-item:${selectedItemId}:${Date.now().toString(36)}` : '';
  submissionInFlight = true;
  setGenerating(true);
  try {
    const sceneId = state.scene_item_context?.scene_id || activeSceneId || `scene:${Date.now().toString(36)}`;
    const promptState = selectedItemId
      ? queueSceneItemUse(state, selectedItemId, itemUseId, sceneId, activeTarget?.type === 'character' ? activeTarget.id : null)
      : state;
    const transaction = await bridge.sendUserMessage(withGardenNarrativeContract(value, promptState), kind);
    if (selectedItemId) {
      await bridge.applyM2Command({
        type: 'queue_scene_item',
        itemId: selectedItemId,
        useId: itemUseId,
        sceneId,
        targetCharacterId: activeTarget?.type === 'character' ? activeTarget.id : undefined,
      });
      sceneItemSelect.value = '';
      updateSceneItemPickerState();
    }
    if (kind === 'interaction'
      && activeTarget?.type === 'facility'
      && ['fairy_garden', 'moon_spring', 'banquet_plaza'].includes(activeTarget.id)) {
      await bridge.applyM2Command({
        type: 'facility_action',
        facilityId: activeTarget.id,
        actionId: 'free_chat',
        transactionId: `facility-chat:${activeTarget.id}:${transaction.assistantMessageId ?? Date.now().toString(36)}`,
      });
    }
    galInput.value = '';
    scene = null;
    sceneSignature = '';
    setStatus(transaction.phase === 'settled' ? '回复与真实楼层已落盘' : '消息已发送，正在等待回复');
    await refresh();
    if (greenhouseResearchJustSettled()) {
      singleShotEventPresentation = true;
      renderSceneBeat();
      setStatus('温室研究已在两轮内收束；读完本段后点击正文返回庭园。');
    }
    return true;
  } catch (error) {
    galInput.value = restoreInputOnFailure ? (original || value) : original;
    setGenerating(false);
    replyPanel.hidden = false;
    setStatus(`发送失败：${error instanceof Error ? error.message : String(error)}`, true);
    return false;
  } finally {
    submissionInFlight = false;
  }
}

async function endConversation() {
  if (submissionInFlight || app.dataset.transactionBusy === 'true') {
    setStatus('当前回复尚未完成结算，暂时不能结束聊天。', true);
    return;
  }
  if (singleShotEventPresentation || closurePresented) {
    returnToGardenAfterFixedScene();
    return;
  }
  submissionInFlight = true;
  byId<HTMLButtonElement>('gg-end-chat').disabled = true;
  byId<HTMLButtonElement>('gg-gal-back').disabled = true;
  try {
    await bridge.applyM2Command({ type: 'end_conversation_local' });
    await refresh();
    returnToGardenAfterFixedScene();
    renderPendingTasks();
    setStatus('聊天已直接结束，没有调用模型。');
  } catch (error) {
    setStatus(`结束聊天失败：${error instanceof Error ? error.message : String(error)}。可以重试本地结束。`, true);
  } finally {
    submissionInFlight = false;
    byId<HTMLButtonElement>('gg-end-chat').disabled = false;
    byId<HTMLButtonElement>('gg-gal-back').disabled = false;
    renderPendingTasks();
  }
}

function returnToGardenAfterFixedScene() {
  closurePresented = false;
  closurePending = false;
  singleShotEventPresentation = false;
  activeTarget = null;
  activeSceneId = '';
  pendingAction = null;
  scene = null;
  sceneSignature = '';
  setView('garden');
  setStatus('已经返回庭园');
}

async function performRefresh() {
  app.setAttribute('aria-busy', 'true');
  try {
    state = await bridge.readState();
    await opening.render(state);
    renderHeader();
    renderPendingTasks();
    gardenMap.update(state);
    databaseSync = await syncOpeningDatabase(state);
    const transaction = await bridge.getTransactionState();
    await renderDiagnostics(transaction.phase, transaction.lastError);
    if (currentView === 'gal') {
      await renderGal();
      renderSceneItemPicker();
    }
    if (currentView === 'shop') renderShop();
    if (currentView === 'inventory') renderInventory();
    if (currentView === 'opportunities') renderOpportunities();
    const graduated = graduationMessage(state);
    if (graduated && !state.ui_flags?.graduation_acknowledged) {
      setStatus(graduated);
    }
    if (!bootRestoredSession && state.meta?.opening_committed) {
      bootRestoredSession = true;
      const sessionTarget = inferSessionTarget();
      const recentContext = sessionTarget ? null : inferRecentGalContext(await bridge.listMessages());
      const restoredTarget = sessionTarget ?? recentContext?.target ?? null;
      if (restoredTarget) {
        activeTarget = restoredTarget;
        activeSessionActionId = recentContext?.actionId ?? activeSessionActionId;
        setView('gal');
        await renderGal();
      }
    }
    maybeStartAutomaticAnomalyResolution(transaction.phase);
    setStatus('庭园状态已同步', false, 'success');
  } catch (error) {
    setStatus(`同步失败：${error instanceof Error ? error.message : String(error)}。请使用“显示原生聊天”。`, true);
  } finally {
    app.setAttribute('aria-busy', 'false');
  }
}

const refreshQueue = new LatestRefreshQueue(performRefresh);

function refresh() {
  return refreshQueue.request();
}

function renderSceneItemPicker() {
  const selected = sceneItemSelect.value;
  const options = [new Option('不使用道具', '')];
  for (const item of listInventoryCatalog()) {
    if (item.use_mode !== 'scene_chat' || item.item_id === 'emergency_repair_kit') continue;
    const count = consumableCount(state, item.item_id);
    if (count < 1) continue;
    options.push(new Option(`${item.title} ×${count}`, item.item_id));
  }
  sceneItemSelect.replaceChildren(...options);
  if (options.some((option) => option.value === selected)) sceneItemSelect.value = selected;
  sceneItemSelect.disabled = Boolean(singleShotEventPresentation || closurePending);
  updateSceneItemPickerState();
}

function updateSceneItemPickerState() {
  const selected = sceneItemSelect.value;
  sceneItemPicker.dataset.hasSelection = String(Boolean(selected));
  sceneItemPicker.dataset.disabled = String(sceneItemSelect.disabled);
  if (sceneItemSelect.disabled) {
    sceneItemHint.textContent = '当前剧情阶段不可追加道具';
    return;
  }
  const label = sceneItemSelect.selectedOptions[0]?.textContent?.trim();
  sceneItemHint.textContent = selected && label
    ? `已装备：${label} · 发送时消耗 1 个`
    : '未选择道具 · 不会消耗库存';
}

const gardenMap = new GardenMap(
  byId<HTMLCanvasElement>('gg-garden-map'),
  mapSource,
  characterSprites,
  mapFacilitySprites,
  (target, anchor) => renderTargetMenu(
    { type: target.kind, id: target.id, label: target.label },
    anchor,
  ),
  (anchor) => positionTargetMenu(anchor),
);

const opening = new OpeningController(
  bridge,
  byId('gg-opening'),
  byId('gg-runtime-shell'),
  setStatus,
  () => void refresh(),
);

// 运行壳的默认视图是庭园，但启动路径不经过 setView；
// 这里先写入视图标记，保证首次进入庭院就应用全屏地图布局，
// 而不是等到第一次切换视图（设置/小店等）才生效。
byId('gg-app').dataset.activeView = 'garden';

dialogueBox.addEventListener('click', () => {
  if (!scene) return;
  if (beatIndex >= scene.beats.length - 1) {
    if (singleShotEventPresentation) returnToGardenAfterFixedScene();
    return;
  }
  beatIndex += 1;
  renderSceneBeat();
});
byId('gg-target-close').addEventListener('click', hideTargetMenu);
launcherButton.addEventListener('click', openLauncher);
byId('gg-close-launcher').addEventListener('click', closeLauncher);
launcherDialog.addEventListener('click', (event) => {
  if (event.target === launcherDialog) closeLauncher();
});
launcherDialog.addEventListener('close', () => {
  if (document.activeElement === document.body && launcherOpener?.isConnected) launcherOpener.focus();
  launcherOpener = null;
});
byId('gg-fullscreen').addEventListener('click', () => {
  void (async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await byId('gg-app').requestFullscreen();
    } catch {
      setStatus('当前宿主环境不允许全屏显示', true);
    }
  })();
});
document.addEventListener('fullscreenchange', () => {
  byId('gg-fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏显示';
});
// 开场页动态光源：光晕跟随指针，仅做装饰，不参与任何状态。
{
  const openingRoot = byId('gg-opening');
  const cursorGlow = document.getElementById('gg-cursor-glow');
  if (cursorGlow) {
    openingRoot.addEventListener('pointermove', (event) => {
      const rect = openingRoot.getBoundingClientRect();
      cursorGlow.style.transform =
        `translate(${Math.round(event.clientX - rect.left - 220)}px, ${Math.round(event.clientY - rect.top - 220)}px)`;
    });
    openingRoot.addEventListener('pointerleave', () => {
      cursorGlow.style.transform = 'translate(-999px, -999px)';
    });
  }
}
byId('gg-gal-back').addEventListener('click', () => void endConversation());
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
byId('gg-session-history').addEventListener('click', async () => {
  try {
    await openSessionHistory();
  } catch (error) {
    setStatus(`读取本次对话记录失败：${String(error)}`, true);
  }
});
byId('gg-session-history-close').addEventListener('click', () => sessionHistoryDialog.close());
sessionHistoryDialog.addEventListener('click', (event) => {
  if (event.target === sessionHistoryDialog) sessionHistoryDialog.close();
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
byId('gg-open-settings').addEventListener('click', () => navigateFromLauncher(openSettings));
byId('gg-settings-back').addEventListener('click', returnFromSettings);
byId('gg-show-native').addEventListener('click', async () => {
  const restored = await bridge.showNativeChat();
  setStatus(restored ? '已显示原生聊天；使用“返回移动庭园”可回到游戏。' : '离线预览没有原生聊天');
});
byId('gg-reload').addEventListener('click', () => {
  globalThis.dispatchEvent(new CustomEvent('gensokyo-garden:reload'));
});
async function runTestJump(jump: import('./test-tools').TestJumpId) {
  try {
    await bridge.applyTestJump(jump);
    await refresh();
    const messages: Record<import('./test-tools').TestJumpId, string> = {
      tutorial_boundary_ready: '教程断点已就绪：点击灵梦检查结界。',
      tutorial_house_repair_ready: '教程断点已就绪：结界已确认，旧主屋等待维修。',
      tutorial_greenhouse_investigation_ready: '教程断点已就绪：主屋已修复，温室魔力痕迹等待调查。',
      tutorial_greenhouse_build_ready: '教程断点已就绪：温室地基已清理，可开始施工。',
      tutorial_flower_core_ready: '教程断点已就绪：温室研究完成，妖花核心等待调查。',
      tutorial_proposals_ready: '教程断点已就绪：自由生长方案已登记，等待爱丽丝与荷取。',
      tutorial_form_selection_ready: '教程断点已就绪：三套方案齐备，等待首次选型。',
      greenhouse_ready: '测试快进完成：基础魔法温室已可用。',
      r29_after_flower_core: '测试快进完成：已到妖花战后，符卡副本已解锁。',
      r30_shop_ready: '小店测试状态已就绪：已解锁，金币为 50。',
      m2_open_garden: '开放庭园验收状态已就绪：三项设施均未建设。',
      m2_anomaly_ready: '异变卡验收状态已就绪：背包中有 3 张异变卡。',
      m2_anomaly_resolution_ready: '异变收束验收状态已就绪：已到第 7 日结束边界。',
      m2_facilities_ready: '设施验收状态已就绪：三设施建成并解锁全部形态。',
      m2_visitors_ready: '来访与活动验收状态已就绪：三名角色在场，全部角色已认识。',
      m2_items_recovery_ready: '道具与修复验收状态已就绪：场景道具充足，妖精花园已损坏。',
      presence_reimu: '角色测试：灵梦已加入中央庭院。',
      presence_marisa: '角色测试：魔理沙已加入中央庭院。',
      presence_alice: '角色测试：爱丽丝已加入中央庭院。',
      presence_nitori: '角色测试：荷取已加入中央庭院。',
      presence_cirno: '角色测试：琪露诺已加入中央庭院。',
      presence_mystia: '角色测试：米斯蒂娅已加入中央庭院。',
      presence_suika: '角色测试：萃香已加入中央庭院。',
      presence_sakuya: '角色测试：咲夜已加入中央庭院。',
      presence_all: '角色测试：八名角色已全部加入中央庭院。',
      presence_clear: '角色测试：当前在场角色已全部清空。',
    };
    setStatus(messages[jump]);
  } catch (error) {
    setStatus(`测试快进失败：${error instanceof Error ? error.message : String(error)}`, true);
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-test-jump]').forEach((button) => {
  button.addEventListener('click', () => {
    const jump = button.dataset.testJump as import('./test-tools').TestJumpId;
    void runTestJump(jump);
  });
});
sceneItemSelect.addEventListener('change', updateSceneItemPickerState);

function setBattleStatus(text: string, error = false) {
  const element = byId('gg-battle-status');
  element.textContent = text;
  element.dataset.error = String(error);
}

let battleHudTimer = 0;

function clearBattleTouchState() {
  battle?.setFocusHeld(false);
  battleFocusBtn.setAttribute('aria-pressed', 'false');
  if (battleHudTimer) {
    window.clearInterval(battleHudTimer);
    battleHudTimer = 0;
  }
}

function syncBattleTouchHud() {
  if (!battle) return;
  const hud = battle.getTouchHud();
  battleBombCount.textContent = String(Math.max(0, hud.bombs));
  battleBombBtn.disabled = hud.finished || hud.bombs <= 0;
  battleFocusBtn.disabled = hud.finished;
  battleFocusBtn.setAttribute('aria-pressed', hud.focused ? 'true' : 'false');
}

function bindBattleSession() {
  clearBattleTouchState();
  syncBattleTouchHud();
  if (battleHudTimer) window.clearInterval(battleHudTimer);
  battleHudTimer = window.setInterval(() => {
    if (!battle) {
      clearBattleTouchState();
      return;
    }
    syncBattleTouchHud();
  }, 200);
}

function destroyBattleSession() {
  clearBattleTouchState();
  battle?.destroy();
  battle = undefined;
}

async function settleBattleResult(result: BattleResult) {
  destroyBattleSession();
  pendingBattleResult = result;
  byId<HTMLButtonElement>('gg-battle-retry').hidden = true;
  if (activeBattleKind === 'practice') {
    pendingBattleResult = null;
    if (battleDialog.open) battleDialog.close();
    setBattleStatus(`练习结束：${result.outcome}（不写入 MVU、不发奖、不推进时段）`);
    setStatus(`练习结束：${result.outcome} · 擦弹 ${result.grazes} · 不结算`);
    return;
  }
  setBattleStatus('正在把唯一结算结果写入 battle.current 并复读校验……');
  try {
    if (activeBattleKind === 'dungeon') {
      const settled = await bridge.settleDungeonResult(result);
      pendingBattleResult = null;
      if (battleDialog.open) battleDialog.close();
      setStatus(`副本结算完成：获得 ${settled.rewardCoins} 金币，并推进一个时段。`);
      await refresh();
      return;
    }
    const staged = await bridge.stageBattleResult(result);
    pendingBattleResult = null;
    setBattleStatus(staged.alreadyStaged ? '结果已存在，继续恢复剧情结算。' : '可信结果已写入并通过复读校验。');
    if (battleDialog.open) battleDialog.close();
    activeTarget = { type: 'facility', id: 'magic_greenhouse', label: '魔法温室' };
    closurePending = false;
    closurePresented = false;
    scene = null;
    sceneSignature = '';
    setView('gal');
    await submitGalMessage(buildBattleSettlementMessage(result), 'battle');
  } catch (error) {
    setBattleStatus(`可信结算写入失败：${error instanceof Error ? error.message : String(error)}`, true);
    byId<HTMLButtonElement>('gg-battle-retry').hidden = false;
  }
}

const dungeonEntries = [
  {
    title: '妖精弹幕练习',
    focus: '环弹 · 自机狙 · Bomb',
    phases: 2,
    duration: '约 40～70 秒',
    config: fairyDungeonConfig,
  },
  {
    title: '森林魔力残响',
    focus: '扇弹 · 追踪 · 切返',
    phases: 4,
    duration: '约 70～110 秒',
    config: forestDungeonConfig,
  },
  {
    title: '结界回声试炼',
    focus: '旋转环 · 激光预警 · 安全道',
    phases: 4,
    duration: '约 80～120 秒',
    config: boundaryDungeonConfig,
  },
] as const;

function openDungeonMenu() {
  const blocked = dungeonBlock(state);
  byId('gg-dungeon-note').textContent = blocked
    || '正式挑战：12／8／3 金币并推进时段。练习：不结算、不发奖、不推进。主动取消均不结算。';
  const actions = byId('gg-dungeon-actions');
  const fragment = document.createDocumentFragment();
  for (const entry of dungeonEntries) {
    const card = document.createElement('article');
    card.className = 'gg-dungeon-entry';
    const heading = document.createElement('h3');
    heading.textContent = entry.title;
    const meta = document.createElement('p');
    meta.className = 'gg-note';
    meta.textContent = `${entry.phases} 阶段 · ${entry.duration} · ${entry.focus}`;
    const row = document.createElement('div');
    row.className = 'gg-dungeon-entry-actions';
    const challenge = document.createElement('button');
    challenge.type = 'button';
    challenge.textContent = '正式挑战';
    challenge.disabled = Boolean(blocked);
    challenge.addEventListener('click', () => startDungeonBattle(entry.title, entry.config as unknown as BattleConfig, 'dungeon'));
    const practice = document.createElement('button');
    practice.type = 'button';
    practice.textContent = '练习（不结算）';
    practice.className = 'gg-dungeon-practice';
    practice.addEventListener('click', () => startDungeonBattle(`练习 · ${entry.title}`, entry.config as unknown as BattleConfig, 'practice'));
    row.append(challenge, practice);
    card.append(heading, meta, row);
    fragment.append(card);
  }
  actions.replaceChildren(fragment);
  dungeonDialog.showModal();
}

function startDungeonBattle(title: string, config: BattleConfig, kind: 'dungeon' | 'practice' = 'dungeon') {
  if (kind === 'dungeon') {
    const blocked = dungeonBlock(state);
    if (blocked) { setStatus(blocked, true); return; }
  }
  dungeonDialog.close();
  activeBattleKind = kind;
  destroyBattleSession();
  battleDialog.showModal();
  byId('gg-battle-title').textContent = title;
  byId<HTMLButtonElement>('gg-battle-narrative').hidden = true;
  setBattleStatus(
    kind === 'practice'
      ? '【练习】方向键/WASD 移动，按住 Z 射击，Shift/专注，X/Bomb，Esc 暂停；结束不写入 MVU。'
      : '方向键/WASD 移动，按住 Z 射击，Shift/专注，X/Bomb，Esc 暂停；本局结算完全在本地进行。',
  );
  battle = new BattleEngine(
    battleCanvas,
    config,
    async (result) => { await settleBattleResult(result); },
    { atlasSources: battleAtlasSources },
  );
  battle.start();
  bindBattleSession();
}

function startBattle() {
  const blocked = greenhouseActionBlock(state, 'start_flower_core_battle');
  if (blocked) {
    setStatus(`无法开始符卡战：${blocked}`, true);
    return;
  }
  destroyBattleSession();
  activeBattleKind = 'flower_core';
  battleDialog.showModal();
  byId('gg-battle-title').textContent = '温室妖花核心';
  byId<HTMLButtonElement>('gg-battle-narrative').hidden = false;
  setBattleStatus('方向键/WASD 移动，按住 Z 射击，Shift/专注，X/Bomb，Esc 暂停；结算后会先写入可信 MVU 字段。');
  byId<HTMLButtonElement>('gg-battle-retry').hidden = true;
  battle = new BattleEngine(
    battleCanvas,
    battleConfigJson as unknown as BattleConfig,
    async (result) => { await settleBattleResult(result); },
    { atlasSources: battleAtlasSources },
  );
  battle.start();
  bindBattleSession();
}
byId('gg-battle-narrative').addEventListener('click', () => void settleBattleResult(narrativeBattleResult()));
byId('gg-open-dungeon').addEventListener('click', () => navigateFromLauncher(openDungeonMenu));
byId('gg-close-dungeon').addEventListener('click', () => dungeonDialog.close());
function renderShop() {
  renderShopView(
    byId('gg-shop-content'),
    state,
    (itemId) => void buyShopItem(itemId),
    (itemId) => void useShopItem(itemId),
  );
}
function renderInventory() {
  renderInventoryView(byId('gg-inventory-content'), state, (itemId) => void useShopItem(itemId));
}
function renderOpportunities() {
  const root = byId('gg-opportunities-content');
  root.replaceChildren();
  const panel = openGardenOpportunityPanel(state);
  const title = document.createElement('h2');
  title.textContent = panel.title;
  root.append(title);
  if (panel.tutorial) {
    const tutorial = document.createElement('section');
    tutorial.className = 'gg-tutorial-progress';
    tutorial.setAttribute('aria-labelledby', 'gg-tutorial-current-title');

    const overview = document.createElement('div');
    overview.className = 'gg-tutorial-overview';
    const count = document.createElement('p');
    count.textContent = `${panel.tutorial.completedCount} / ${panel.tutorial.totalCount} 步完成`;
    const progress = document.createElement('progress');
    progress.max = panel.tutorial.totalCount;
    progress.value = panel.tutorial.completedCount;
    progress.setAttribute('aria-label', '新手教程完成进度');
    overview.append(count, progress);
    tutorial.append(overview);

    if (panel.tutorial.currentStep) {
      const current = document.createElement('article');
      current.className = 'gg-tutorial-current';
      const eyebrow = document.createElement('p');
      eyebrow.className = 'gg-eyebrow';
      eyebrow.textContent = '现在要做';
      const currentTitle = document.createElement('h3');
      currentTitle.id = 'gg-tutorial-current-title';
      currentTitle.textContent = panel.tutorial.currentStep.title;
      const instruction = document.createElement('p');
      instruction.textContent = panel.tutorial.currentStep.instruction;
      current.append(eyebrow, currentTitle, instruction);
      tutorial.append(current);
    }

    if (panel.tutorial.nextStep) {
      const next = document.createElement('p');
      next.className = 'gg-tutorial-next';
      next.textContent = `随后：${panel.tutorial.nextStep.title}`;
      tutorial.append(next);
    }

    const stepList = document.createElement('ol');
    stepList.className = 'gg-tutorial-steps';
    for (const step of panel.tutorial.steps) {
      const item = document.createElement('li');
      item.dataset.state = step.completed ? 'complete' : step.id === panel.tutorial.currentStep?.id ? 'current' : 'upcoming';
      const marker = document.createElement('span');
      marker.className = 'gg-tutorial-step-marker';
      marker.setAttribute('aria-hidden', 'true');
      marker.textContent = step.completed ? '✓' : '';
      const label = document.createElement('span');
      label.textContent = step.title;
      item.append(marker, label);
      stepList.append(item);
    }
    tutorial.append(stepList);
    root.append(tutorial);
  }
  if (panel.graduation) {
    const grad = document.createElement('p');
    grad.textContent = panel.graduation;
    root.append(grad);
    const ack = document.createElement('button');
    ack.type = 'button';
    ack.textContent = '知道了';
    ack.addEventListener('click', () => {
      void bridge.applyM2Command({ type: 'acknowledge_graduation' }).then(() => refresh());
    });
    root.append(ack);
  }
  if (state.garden_activities?.banquet) {
    const activeBanquet = document.createElement('article');
    activeBanquet.className = 'gg-shop-item';
    const heading = document.createElement('h3');
    const detail = document.createElement('p');
    const enter = document.createElement('button');
    heading.textContent = '当前宴会';
    detail.textContent = state.garden_activities.banquet.participation_mode === 'public' ? '公开宴会正在举行' : '邀请制宴会正在举行';
    enter.type = 'button';
    enter.textContent = '进入当前宴会';
    enter.addEventListener('click', () => void enterActiveBanquet());
    activeBanquet.append(heading, detail, enter);
    root.append(activeBanquet);
  }
  if (panel.facilities) {
    const list = document.createElement('div');
    list.className = 'gg-shop-list';
    for (const facility of panel.facilities) {
      const card = document.createElement('article');
      card.className = 'gg-shop-item';
      const heading = document.createElement('h3');
      heading.textContent = facility.title;
      const detail = document.createElement('p');
      detail.textContent = facility.built
        ? `已建成 · 当前形态 ${facility.current_form ?? '未知'} · 状态 ${facility.status}`
        : `可规划 · 建设消耗 ${facility.build_cost} 物资`;
      card.append(heading, detail);
      for (const form of facility.forms) {
        const row = document.createElement('section');
        row.className = 'gg-shop-item';
        const formTitle = document.createElement('h4');
        formTitle.textContent = form.form_id;
        const summary = document.createElement('p');
        summary.textContent = form.summary;
        row.append(formTitle, summary);
        if (!facility.built) {
          const build = document.createElement('button');
          build.type = 'button';
          build.textContent = `选择此方案施工（${facility.build_cost} 物资）`;
          build.addEventListener('click', () => void runFacilityBuild(facility.id, form.form_id));
          row.append(build);
        } else if (facility.second_form_choice_pending && !form.unlocked) {
          const unlock = document.createElement('button');
          unlock.type = 'button';
          unlock.textContent = '取得此方案';
          unlock.addEventListener('click', () => void runChooseFacilityForm(facility.id, form.form_id));
          row.append(unlock);
        } else if (form.unlocked && !form.current) {
          const remodel = document.createElement('button');
          remodel.type = 'button';
          remodel.textContent = '装修切换（2 物资）';
          remodel.addEventListener('click', () => void runFacilityRemodel(facility.id, form.form_id));
          row.append(remodel);
        }
        if (form.current) {
          const actions = document.createElement('div');
          actions.className = 'gg-actions';
          for (const item of form.quick_actions) {
            const action = document.createElement('button');
            action.type = 'button';
            action.textContent = item.label;
            action.addEventListener('click', () => void runM2FacilityAction(facility.id, item.action_id, item.intent));
            actions.append(action);
          }
          row.append(actions);
        }
        card.append(row);
      }
      if (facility.built && (facility.status === 'abnormal' || facility.status === 'damaged')) {
        const repair = document.createElement('button');
        repair.type = 'button';
        repair.textContent = facility.status === 'damaged' ? '修复设施' : '调查异常';
        repair.addEventListener('click', () => void runFacilityRecovery(facility.id));
        card.append(repair);
      }
      if (facility.id === 'moon_spring' && facility.built) {
        const modes = document.createElement('div');
        modes.className = 'gg-actions';
        for (const mode of [['public', '公开泡汤'], ['invite_only', '仅邀请'], ['alone', '独处']] as const) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = mode[1];
          button.addEventListener('click', () => void runMoonSpring(mode[0]));
          modes.append(button);
        }
        card.append(modes);
      }
      if (facility.id === 'banquet_plaza' && facility.built) {
        const modes = document.createElement('div');
        modes.className = 'gg-actions';
        for (const mode of [['public', '立即举办公开宴会'], ['invite_only', '立即举办邀请宴会']] as const) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = mode[1];
          button.disabled = Boolean(state.garden_activities?.banquet || state.garden_activities?.scheduled_banquet);
          if (button.disabled) button.title = '已有宴会计划或正在举行的宴会';
          button.addEventListener('click', () => void runBanquet(mode[0]));
          modes.append(button);
        }
        card.append(modes);
      }
      list.append(card);
    }
    root.append(list);
  }
  if (panel.known_characters) {
    const known = document.createElement('p');
    known.className = 'gg-note';
    known.textContent = `已认识并可调度：${panel.known_characters.join('、') || '无'}`;
    root.append(known);
    const invites = document.createElement('div');
    invites.className = 'gg-actions';
    for (const characterId of panel.known_characters) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `邀请 ${state.characters?.[characterId]?.name ?? characterId}`;
      button.addEventListener('click', () => void runInvite(characterId));
      invites.append(button);
    }
    root.append(invites);
  }
  if (panel.notices?.length) {
    const noticeTitle = document.createElement('h3');
    noticeTitle.textContent = '来访通知';
    const notices = document.createElement('ul');
    for (const text of panel.notices) {
      const item = document.createElement('li');
      item.textContent = text;
      notices.append(item);
    }
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = '标记通知为已读';
    clear.addEventListener('click', () => void bridge.applyM2Command({ type: 'consume_visit_notices' }).then(() => refresh()));
    root.append(noticeTitle, notices, clear);
  }
  if (panel.anomaly) {
    const anomaly = document.createElement('p');
    anomaly.textContent = `活动异变「${panel.anomaly.title}」· 剩余 ${panel.anomaly.remaining} 时段 · ${panel.anomaly.status}`;
    root.append(anomaly);
    const actions = document.createElement('div');
    actions.className = 'gg-actions';
    const active = state.anomaly_cycle?.active;
    if (active?.status === 'resolving') {
      const resolve = document.createElement('button');
      resolve.type = 'button';
      resolve.textContent = '完成异变收束';
      resolve.addEventListener('click', () => void runAnomalyResolution());
      actions.append(resolve);
    } else if (active && active.last_clue_day !== (state.environment?.day ?? 1)) {
      const investigate = document.createElement('button');
      investigate.type = 'button';
      investigate.textContent = '陪灵梦调查今日线索';
      investigate.addEventListener('click', () => void runDailyAnomalyInvestigation());
      actions.append(investigate);
    }
    if (actions.childElementCount) root.append(actions);
  } else if (panel.anomaly_card_block) {
    const block = document.createElement('p');
    block.className = 'gg-note';
    block.textContent = panel.anomaly_card_block;
    root.append(block);
  }
}

async function runFacilityBuild(facilityId: string, formId: string) {
  try {
    const result = await bridge.applyM2Command({
      type: 'build_facility', facilityId, formId, transactionId: `build:${facilityId}:${Date.now().toString(36)}`,
    });
    await refresh();
    renderOpportunities();
    setStatus(result.message);
  } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
}

async function runChooseFacilityForm(facilityId: string, formId: string) {
  try {
    const result = await bridge.applyM2Command({ type: 'choose_second_form', facilityId, formId });
    await refresh();
    renderOpportunities();
    setStatus(result.message);
  } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
}

async function runFacilityRemodel(facilityId: string, formId: string) {
  const transactionId = `refit:${facilityId}:${Date.now().toString(36)}`;
  try {
    const started = await bridge.applyM2Command({ type: 'begin_refit', facilityId, formId, transactionId });
    await refresh();
    activeTarget = { type: 'facility', id: facilityId, label: state.facilities?.[facilityId]?.name ?? facilityId };
    setView('gal');
    setGenerating(true, '正在生成简短装修剧情……');
    const prompt = [
      buildPromptContext(state, { kind: 'refit', facilityId, selectedCharacterId: started.selectedCharacterId, actionIntent: `装修切换为 ${formId}` }),
      '写一段简短装修过渡。代码选定角色已经锁定，不得替换；没有角色时写独自装修。不要决定成本、成功与正式形态。',
    ].join('\n\n');
    await bridge.sendUserMessage(withGardenNarrativeContract(prompt, state), 'interaction');
    await bridge.applyM2Command({ type: 'commit_refit', transactionId });
    await refresh();
  } catch (error) {
    await bridge.applyM2Command({ type: 'cancel_refit', transactionId }).catch(() => undefined);
    await refresh();
    setStatus(`装修失败：${error instanceof Error ? error.message : String(error)}`, true);
  }
}

async function runM2FacilityAction(facilityId: string, actionId: string, intent: string) {
  try {
    const transactionId = `facility:${facilityId}:${actionId}:${Date.now().toString(36)}`;
    const preview = rollFacilityRisk(state, facilityId, actionId, transactionId);
    activeTarget = { type: 'facility', id: facilityId, label: state.facilities?.[facilityId]?.name ?? facilityId };
    setView('gal');
    const prompt = [
      buildPromptContext(preview.state, { kind: 'facility_action', facilityId, actionIntent: intent }),
      preview.triggered
        ? `代码已决定本轮触发 ${preview.severity}，结构状况 ID 为 ${preview.conditionId}。只演绎原因与过程，不改变严重度。`
        : '代码已决定本轮没有新的结构风险；自由演绎当前行动，不凭空损坏设施。',
    ].join('\n\n');
    const completed = await submitGalMessage(prompt, 'interaction', { restoreInputOnFailure: false });
    if (completed) {
      await bridge.applyM2Command({ type: 'facility_action', facilityId, actionId, transactionId });
      await refresh();
    }
  } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
}

async function runFacilityRecovery(facilityId: string) {
  const transactionId = `recovery:${facilityId}:${Date.now().toString(36)}`;
  try {
    const hasKit = (state.inventory?.consumables?.emergency_repair_kit ?? 0) > 0;
    await bridge.applyM2Command({ type: 'begin_recovery', facilityId, transactionId, useRepairKit: hasKit });
    await refresh();
    activeTarget = { type: 'facility', id: facilityId, label: state.facilities?.[facilityId]?.name ?? facilityId };
    setView('gal');
    const prompt = [
      buildPromptContext(state, { kind: 'facility_action', facilityId, actionIntent: '调查并恢复当前结构状况' }),
      '写一段调查或修复剧情。正式严重度、资源预留、耗时和成功状态由本地代码结算。',
    ].join('\n\n');
    await bridge.sendUserMessage(withGardenNarrativeContract(prompt, state), 'interaction');
    await bridge.applyM2Command({ type: 'commit_recovery', transactionId });
    await refresh();
  } catch (error) {
    await bridge.applyM2Command({ type: 'cancel_recovery', transactionId }).catch(() => undefined);
    await refresh();
    setStatus(`恢复失败：${error instanceof Error ? error.message : String(error)}`, true);
  }
}

async function runInvite(characterId: string) {
  try {
    const result = await bridge.applyM2Command({ type: 'invite_character', characterId, inviteId: `invite:${characterId}:${Date.now().toString(36)}` });
    await refresh();
    renderOpportunities();
    setStatus(result.message);
  } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
}

async function runMoonSpring(mode: 'public' | 'invite_only' | 'alone') {
  try {
    let accepted: string[] = [];
    if (mode === 'invite_only') {
      const present = [...(state.presence_snapshot?.present_character_ids ?? [])];
      if (!present.length) throw new Error('当前没有已经到场、可接受邀请的角色');
      const raw = window.prompt(`输入参加者 ID（逗号分隔，最多 3 人）\n当前到场：${present.join(', ')}`, present.join(', '));
      if (raw == null) return;
      accepted = Array.from(new Set(raw.split(/[,，\s]+/u).map((id) => id.trim()).filter(Boolean))).slice(0, 3);
      if (!accepted.length) throw new Error('仅邀请模式至少需要选择一名到场角色');
    }
    await bridge.applyM2Command({ type: 'start_moon_session', mode, acceptedCharacterIds: accepted });
    await refresh();
    activeTarget = { type: 'facility', id: 'moon_spring', label: '月见温泉' };
    setView('gal');
    await submitGalMessage(`我以${mode === 'public' ? '公开' : mode === 'alone' ? '独处' : '仅邀请'}模式开始本次月见温泉会话。`, 'interaction', { restoreInputOnFailure: false });
  } catch (error) {
    await bridge.applyM2Command({ type: 'end_moon_session' }).catch(() => undefined);
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function runBanquet(mode: 'public' | 'invite_only') {
  try {
    const offsetText = window.prompt('宴会从几个标准时段后开始？请输入 0—4（0 表示当前时段）', '0');
    if (offsetText == null) return;
    const startOffsetPeriods = Number(offsetText);
    if (!Number.isInteger(startOffsetPeriods) || startOffsetPeriods < 0 || startOffsetPeriods > 4) {
      throw new Error('宴会开始时段必须是 0—4 的整数');
    }
    let invitedCharacterIds: string[] = [];
    if (mode === 'invite_only') {
      const known = [...(state.visit_scheduler?.known_characters ?? [])];
      if (!known.length) throw new Error('还没有可邀请的已认识角色');
      const raw = window.prompt(`输入邀请对象 ID（逗号分隔，最多 6 人）\n已认识：${known.join(', ')}`, known.join(', '));
      if (raw == null) return;
      invitedCharacterIds = Array.from(new Set(raw.split(/[,，\s]+/u).map((id) => id.trim()).filter(Boolean))).slice(0, 6);
      if (!invitedCharacterIds.length) throw new Error('邀请制宴会至少需要选择一名角色');
    }
    await bridge.applyM2Command({
      type: 'schedule_banquet', activityId: `banquet:${Date.now().toString(36)}`, mode, invitedCharacterIds, startOffsetPeriods,
    });
    await refresh();
    renderOpportunities();
    setStatus(startOffsetPeriods > 0
      ? `宴会已安排在 ${startOffsetPeriods} 个标准时段后开始；到时会出现待办入口。`
      : '宴会已经到点，请从待办事项开始。');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function startBanquetTask(task: PendingTask) {
  const activityId = String(task.payload?.activity_id ?? task.source_id);
  try {
    await bridge.applyM2Command({ type: 'start_due_banquet', activityId });
    await refresh();
    const banquet = state.garden_activities?.banquet;
    if (!banquet || banquet.activity_id !== activityId) throw new Error('宴会开始状态复读失败');
    activeTarget = { type: 'facility', id: 'banquet_plaza', label: '宴会广场' };
    setView('gal');
    await submitGalMessage(
      `我开始已经到期的${banquet.participation_mode === 'public' ? '公开' : '邀请制'}宴会。`,
      'interaction',
      { restoreInputOnFailure: false },
    );
  } catch (error) {
    setStatus(`宴会入口处理失败：${error instanceof Error ? error.message : String(error)}`, true);
  }
}

async function enterActiveBanquet() {
  const banquet = state.garden_activities?.banquet;
  if (!banquet) return;
  activeTarget = { type: 'facility', id: 'banquet_plaza', label: '宴会广场' };
  setView('gal');
  await renderGal();
}

async function latestAssistantReply() {
  const messages = await bridge.listMessages();
  return [...messages].reverse().find((message) => message.role === 'assistant');
}

async function runDailyAnomalyInvestigation() {
  try {
    setView('gal');
    setGenerating(true, '灵梦正在追查今天的线索……');
    const prompt = [
      buildPromptContext(state, { kind: 'daily_investigation', includeSceneItems: false }),
      '写一段简短调查剧情，不完整揭露源头。正文结束后严格输出：',
      '<GensokyoAnomalyClue>{"version":"anomaly-clue.v1","summary":"本日新增的一条简短线索"}</GensokyoAnomalyClue>',
    ].join('\n\n');
    await bridge.sendUserMessage(withGardenNarrativeContract(prompt, state), 'interaction');
    const reply = await latestAssistantReply();
    if (!reply) throw new Error('没有找到调查回复');
    await bridge.recordAnomalyClue(parseAnomalyClueReceipt(reply.text));
    await refresh();
  } catch (error) {
    setGenerating(false);
    setStatus(`异变调查失败：${error instanceof Error ? error.message : String(error)}`, true);
  }
}

async function runAnomalyResolution(taskId?: string) {
  const task = taskId
    ? state.pending_tasks?.find((item) => item.task_id === taskId)
    : state.pending_tasks?.find((item) => item.kind === 'anomaly_resolution');
  try {
    if (task) {
      await bridge.applyM2Command({ type: 'claim_pending_task', taskId: task.task_id });
      await refresh();
    }
    setView('gal');
    setGenerating(true, '异变正在迎来最终收束……');
    const prompt = [
      buildPromptContext(state, { kind: 'final_resolution', includeSceneItems: false }),
      '自然完成最终收束。本轮成功后异变将由本地代码彻底归档，不得开启新异变。',
    ].join('\n\n');
    await bridge.sendAnomalyResolution(withGardenNarrativeContract(prompt, state));
    await refresh();
  } catch (error) {
    if (task) await bridge.applyM2Command({ type: 'release_pending_task', taskId: task.task_id }).catch(() => undefined);
    await refresh().catch(() => undefined);
    setGenerating(false);
    setStatus(`异变收束失败：${error instanceof Error ? error.message : String(error)}`, true);
  }
}
async function buyShopItem(itemId: string) {
  const blocked = shopBlock(state);
  if (blocked) { setStatus(blocked, true); return; }
  const purchaseId = `shop:${itemId}:${Date.now().toString(36)}`;
  if (!globalThis.confirm('确认以登记价格购买这件商品吗？')) return;
  try {
    await bridge.purchaseShopItem(itemId, purchaseId);
    await refresh();
    setStatus(shopMessage());
  } catch (error) {
    setStatus(shopMessage(error), true);
  }
}
async function useShopItem(itemId: string) {
  const useId = `item:${itemId}:${Date.now().toString(36)}`;
  try {
    let form: { title: string; rule_text: string; scope_mode: 'all' | 'present' | 'specified'; character_ids: string[]; presentation_tone: string; excluded_content: string } | undefined;
    if (itemId === 'incident_trigger_card') {
      const title = globalThis.prompt('异变名称（最多 40 字）', '未命名异变') ?? '';
      const rule_text = globalThis.prompt('异变核心规则（最多 600 字）', '') ?? '';
      if (!title.trim() || !rule_text.trim()) {
        setStatus('已取消异变表单', true);
        return;
      }
      const scopeRaw = (globalThis.prompt('影响范围：all（所有人）/ present（当前在场）/ specified（指定角色）', 'all') ?? 'all').trim();
      const scope_mode = scopeRaw === 'present' || scopeRaw === 'specified' ? scopeRaw : 'all';
      const character_ids = scope_mode === 'specified'
        ? (globalThis.prompt('指定角色 ID，用逗号分隔', '') ?? '').split(/[,，]/u).map((value) => value.trim()).filter(Boolean)
        : [];
      form = {
        title,
        rule_text,
        scope_mode,
        character_ids,
        presentation_tone: globalThis.prompt('表现倾向（可空）', '') ?? '',
        excluded_content: globalThis.prompt('排除内容（可空）', '') ?? '',
      };
    }
    const message = await bridge.useSpecialItem(itemId, useId, form);
    await refresh();
    if (itemId === 'incident_trigger_card') {
      setView('inventory');
      renderInventory();
      setStatus('自定义异变已由本地代码启用；下一次正常聊天会自然携带异变影响。', false, 'success');
    } else {
      setStatus(message);
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}
byId('gg-open-shop').addEventListener('click', () => navigateFromLauncher(() => { setView('shop'); renderShop(); }));
byId('gg-shop-back').addEventListener('click', () => setView('garden'));
byId('gg-open-inventory').addEventListener('click', () => navigateFromLauncher(() => { setView('inventory'); renderInventory(); }));
byId('gg-inventory-back').addEventListener('click', () => setView('garden'));
byId('gg-open-opportunities').addEventListener('click', () => navigateFromLauncher(() => { setView('opportunities'); renderOpportunities(); }));
byId('gg-opportunities-back').addEventListener('click', () => setView('garden'));
byId('gg-battle-retry').addEventListener('click', () => {
  if (pendingBattleResult) void settleBattleResult(pendingBattleResult);
});
function closeBattleDialog() {
  destroyBattleSession();
  pendingBattleResult = null;
  if (battleDialog.open) battleDialog.close();
  // Belt-and-suspenders: if a stylesheet ever forces display, still remove [open].
  battleDialog.removeAttribute('open');
}

byId('gg-close-battle').addEventListener('click', () => {
  closeBattleDialog();
});
battleDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeBattleDialog();
});
battleDialog.addEventListener('close', () => {
  // Defensive: any non-settling close path must drop focus/bomb hold state.
  if (battle) destroyBattleSession();
  else clearBattleTouchState();
});

function bindHoldButton(button: HTMLButtonElement, onHold: (held: boolean) => void) {
  const down = (event: PointerEvent) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    try { button.setPointerCapture(event.pointerId); } catch { /* test doubles */ }
    button.setAttribute('aria-pressed', 'true');
    onHold(true);
  };
  const up = (event: PointerEvent) => {
    event.preventDefault();
    button.setAttribute('aria-pressed', 'false');
    onHold(false);
    try { button.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
  };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('lostpointercapture', () => onHold(false));
}

bindHoldButton(battleFocusBtn, (held) => {
  battle?.setFocusHeld(held);
  if (!held) battleFocusBtn.setAttribute('aria-pressed', 'false');
});

battleBombBtn.addEventListener('pointerdown', (event) => {
  if (event.button != null && event.button !== 0) return;
  event.preventDefault();
  battle?.requestBomb();
  syncBattleTouchHud();
});

globalThis.addEventListener('beforeunload', () => {
  cleanupSubscription?.();
  gardenMap.destroy();
  destroyBattleSession();
});

globalThis.addEventListener('gensokyo-garden:resume', () => {
  void refresh();
});

async function boot() {
  cleanupSubscription = await bridge.subscribe(() => void refresh());
  await refresh();
}

void boot();
