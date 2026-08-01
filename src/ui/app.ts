import battleConfigJson from '../battle/configs/greenhouse-flower-core-tutorial-v1.json';
import fairyDungeonConfig from '../battle/configs/dungeons/fairy-pattern-practice-v1.json';
import forestDungeonConfig from '../battle/configs/dungeons/forest-magic-residue-v1.json';
import boundaryDungeonConfig from '../battle/configs/dungeons/boundary-echo-trial-v1.json';
import {
  BATTLE_SFX_IDS,
  createBattleSoundBus,
  type BattleSfxSources,
} from '../battle/battle-sound';
import battleBgmCatalogJson from '../battle/battle-bgm-catalog.json';
import {
  createBattleBgmBus,
  normalizeBattleBgmCatalog,
  type BattleBgmTrackId,
} from '../battle/battle-bgm';
import { BattleEngine, type BattleConfig } from './battle-engine';
import { bridge } from './bridge';
import { LatestRefreshQueue } from './async-coordination';
import { syncOpeningDatabase, type DatabaseSyncResult } from './database-adapter';
import { parseGardenAction, settlementProjection } from './event-settlement';
import { assistantForCurrentTurn } from './gal-message-selection';
import { parseGalPortraitSources, resolveGalPortraitSource } from './gal-portrait-registry';
import { projectGalScene } from './gal-scene';
import { GardenMap } from './garden-map';
import { resolveCharacterSprites } from './character-sprite-registry';
import {
  buildBattleSettlementMessage,
  greenhouseActionBlock,
  narrativeBattleResult,
} from './greenhouse-rules';
import { dungeonBlock } from './dungeon-rules';
import { duelCardBlock, duelDifficultyForTags, getDuelProfile, listDuelProfiles } from './duel-card-rules';
import { buildDuelVictoryMessage } from './duel-victory-projection';
import { renderShopView } from './shop-view';
import { renderInventoryView } from './inventory-view';
import { listShopItems, shopBlock, shopMessage } from './shop-rules';
import {
  openGardenOpportunityPanel,
  acknowledgeGraduation,
  graduationMessage,
  tutorialProgress,
} from './open-garden-rules';
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
const gardenMapCanvas = byId<HTMLCanvasElement>('gg-garden-map');
const galInput = byId<HTMLTextAreaElement>('gg-gal-input');
const galCompose = byId<HTMLFormElement>('gg-gal-compose');
const sceneItemInput = byId<HTMLInputElement>('gg-scene-item');
const sceneItemPicker = byId<HTMLElement>('gg-scene-item-picker');
const sceneItemHint = byId<HTMLElement>('gg-scene-item-hint');
const sceneItemTrigger = byId<HTMLButtonElement>('gg-scene-item-trigger');
const sceneItemSelected = byId<HTMLElement>('gg-scene-item-selected');
const sceneItemDialog = byId<HTMLDialogElement>('gg-scene-item-dialog');
const sceneItemDialogClose = byId<HTMLButtonElement>('gg-scene-item-dialog-close');
const sceneItemOptions = byId<HTMLElement>('gg-scene-item-options');
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
const tutorialGuide = byId<HTMLElement>('gg-tutorial-guide');
const tutorialGuideProgress = byId<HTMLElement>('gg-tutorial-guide-progress');
const tutorialGuideTitle = byId<HTMLElement>('gg-tutorial-guide-title');
const tutorialGuideText = byId<HTMLElement>('gg-tutorial-guide-text');
const tutorialGuideSkip = byId<HTMLButtonElement>('gg-tutorial-guide-skip');
const launcherDialog = byId<HTMLDialogElement>('gg-launcher-dialog');
const launcherButton = byId<HTMLButtonElement>('gg-open-launcher');
const battleDialog = byId<HTMLDialogElement>('gg-battle-dialog');
const dungeonDialog = byId<HTMLDialogElement>('gg-dungeon-dialog');
const duelDialog = byId<HTMLDialogElement>('gg-duel-dialog');
const duelVictoryDialog = byId<HTMLDialogElement>('gg-duel-victory-dialog');
const duelVictoryForm = byId<HTMLFormElement>('gg-duel-victory-form');
const duelVictoryRequest = byId<HTMLTextAreaElement>('gg-duel-victory-request');
const internalDialog = byId<HTMLDialogElement>('gg-internal-dialog');
const internalDialogForm = byId<HTMLFormElement>('gg-internal-dialog-form');
const internalDialogTitle = byId<HTMLElement>('gg-internal-dialog-title');
const internalDialogMessage = byId<HTMLElement>('gg-internal-dialog-message');
const internalDialogInputWrap = byId<HTMLElement>('gg-internal-dialog-input-wrap');
const internalDialogLabel = byId<HTMLLabelElement>('gg-internal-dialog-label');
const internalDialogInput = byId<HTMLInputElement>('gg-internal-dialog-input');
const internalDialogTextarea = byId<HTMLTextAreaElement>('gg-internal-dialog-textarea');
const internalDialogCancel = byId<HTMLButtonElement>('gg-internal-dialog-cancel');
const internalDialogConfirm = byId<HTMLButtonElement>('gg-internal-dialog-confirm');
const battleCanvas = byId<HTMLCanvasElement>('gg-battle-canvas');
const battleFocusBtn = byId<HTMLButtonElement>('gg-battle-focus');
const battleBombBtn = byId<HTMLButtonElement>('gg-battle-bomb');
const battleBombCount = byId<HTMLElement>('gg-battle-bomb-count');
const battlePauseButton = byId<HTMLButtonElement>('gg-battle-pause');
const battleAudioSettingsButton = byId<HTMLButtonElement>('gg-battle-audio-settings');
const battleAudioDialog = byId<HTMLDialogElement>('gg-battle-audio-dialog');
const battleAudioClose = byId<HTMLButtonElement>('gg-battle-audio-close');
const battleAudioDone = byId<HTMLButtonElement>('gg-battle-audio-done');
const battleSettingsSfxEnabled = byId<HTMLInputElement>('gg-battle-settings-sfx-enabled');
const battleSettingsSfxVolume = byId<HTMLInputElement>('gg-battle-settings-sfx-volume');
const battleSettingsSfxOutput = byId<HTMLOutputElement>('gg-battle-settings-sfx-output');
const battleSettingsBgmTrack = byId<HTMLSelectElement>('gg-battle-settings-bgm-track');
const battleSettingsBgmVolume = byId<HTMLInputElement>('gg-battle-settings-bgm-volume');
const battleSettingsBgmOutput = byId<HTMLOutputElement>('gg-battle-settings-bgm-output');
const battleBgmStatus = byId<HTMLElement>('gg-battle-bgm-status');
const battleSoundEnabledInput = byId<HTMLInputElement>('gg-battle-sound-enabled');
const battleSoundVolumeInput = byId<HTMLInputElement>('gg-battle-sound-volume');
const battleSoundVolumeOutput = byId<HTMLOutputElement>('gg-battle-sound-volume-output');
const battleSoundTest = byId<HTMLButtonElement>('gg-battle-sound-test');
const dungeonButtonImage = byId<HTMLImageElement>('gg-dungeon-button-image');
const shopButtonImage = byId<HTMLImageElement>('gg-shop-button-image');
const inventoryButtonImage = byId<HTMLImageElement>('gg-inventory-button-image');
const shopBackgroundImage = byId<HTMLImageElement>('gg-shop-background');
const assetBase = document.documentElement.dataset.assetBase ?? '../assets';
const battleSfxSources: BattleSfxSources = (() => {
  let embeddedSources: unknown = {};
  try {
    embeddedSources = JSON.parse(document.documentElement.dataset.battleSfxSources ?? '{}');
  } catch {
    embeddedSources = {};
  }
  const record = embeddedSources && typeof embeddedSources === 'object'
    ? embeddedSources as Record<string, unknown>
    : {};
  return Object.fromEntries(BATTLE_SFX_IDS.map((id) => [
    id,
    typeof record[id] === 'string'
      ? record[id]
      : `${assetBase}/audio/runtime/battle/${id}.wav`,
  ])) as BattleSfxSources;
})();
const battleSoundEnabledStorageKey = 'gensokyo-garden:battle-sfx-enabled';
const battleSoundVolumeStorageKey = 'gensokyo-garden:battle-sfx-volume';
const battleBgmVolumeStorageKey = 'gensokyo-garden:battle-bgm-volume';
const battleBgmTrackStorageKey = 'gensokyo-garden:battle-bgm-track';
const battleBgmCatalog = normalizeBattleBgmCatalog(battleBgmCatalogJson);
let battleSoundEnabled = true;
let battleSoundVolume = 0.6;
let battleBgmVolume = 0.45;
let battleBgmTrackId: BattleBgmTrackId = 'stage_theme';
try {
  battleSoundEnabled = localStorage.getItem(battleSoundEnabledStorageKey) !== '0';
  const savedVolumeRaw = localStorage.getItem(battleSoundVolumeStorageKey);
  const savedVolume = savedVolumeRaw == null ? NaN : Number(savedVolumeRaw);
  if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) battleSoundVolume = savedVolume;
  const savedBgmVolumeRaw = localStorage.getItem(battleBgmVolumeStorageKey);
  const savedBgmVolume = savedBgmVolumeRaw == null ? NaN : Number(savedBgmVolumeRaw);
  if (Number.isFinite(savedBgmVolume) && savedBgmVolume >= 0 && savedBgmVolume <= 1) {
    battleBgmVolume = savedBgmVolume;
  }
  const savedTrack = localStorage.getItem(battleBgmTrackStorageKey);
  const matchedTrack = battleBgmCatalog.find((track) => track.id === savedTrack);
  if (matchedTrack) battleBgmTrackId = matchedTrack.id;
} catch { /* Fall back to enabled SFX, 60% SFX and 45% BGM. */ }
const battleSoundBus = createBattleSoundBus(battleSfxSources, {
  muted: !battleSoundEnabled,
  volume: battleSoundVolume,
});
const battleBgmBus = createBattleBgmBus(battleBgmCatalog, {
  trackId: battleBgmTrackId,
  volume: battleBgmVolume,
});
function syncBattleSoundControls() {
  const volumePercent = Math.round(battleSoundVolume * 100);
  battleSoundEnabledInput.checked = battleSoundEnabled;
  battleSoundVolumeInput.value = String(volumePercent);
  battleSoundVolumeInput.disabled = !battleSoundEnabled;
  battleSoundVolumeOutput.value = `${volumePercent}%`;
  battleSettingsSfxEnabled.checked = battleSoundEnabled;
  battleSettingsSfxVolume.value = String(volumePercent);
  battleSettingsSfxVolume.disabled = !battleSoundEnabled;
  battleSettingsSfxOutput.value = `${volumePercent}%`;
}
function syncBattleBgmControls() {
  if (battleSettingsBgmTrack.options.length !== battleBgmCatalog.length) {
    const options = battleBgmCatalog.map((track) => {
      const option = document.createElement('option');
      option.value = track.id;
      option.textContent = track.sourceUrl ? track.title : `${track.title} · 待接入`;
      return option;
    });
    battleSettingsBgmTrack.replaceChildren(...options);
  }
  battleSettingsBgmTrack.value = battleBgmTrackId;
  const volumePercent = Math.round(battleBgmVolume * 100);
  battleSettingsBgmVolume.value = String(volumePercent);
  battleSettingsBgmOutput.value = `${volumePercent}%`;
  const selected = battleBgmCatalog.find((track) => track.id === battleBgmTrackId);
  battleBgmStatus.dataset.available = String(Boolean(selected?.sourceUrl));
  battleBgmStatus.textContent = selected?.sourceUrl
    ? `${selected.title} · 已配置远程音源，战斗继续后播放。`
    : `${selected?.title ?? '当前曲目'}仍是模板槽位；填入公开 R2 HTTPS 地址后即可循环播放。`;
}
function persistBattleSoundPreferences() {
  try {
    localStorage.setItem(battleSoundEnabledStorageKey, battleSoundEnabled ? '1' : '0');
    localStorage.setItem(battleSoundVolumeStorageKey, battleSoundVolume.toFixed(2));
  } catch { /* Preference remains active for this page. */ }
}
function setBattleSoundEnabled(enabled: boolean, preview = false) {
  battleSoundEnabled = enabled;
  battleSoundBus.setMuted?.(!enabled);
  persistBattleSoundPreferences();
  syncBattleSoundControls();
  if (enabled) {
    void battleSoundBus.unlock?.();
    if (preview) battleSoundBus.play('item_pickup');
  }
}
function setBattleSoundVolume(volume: number) {
  battleSoundVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.6));
  battleSoundBus.setVolume?.(battleSoundVolume);
  persistBattleSoundPreferences();
  syncBattleSoundControls();
}
function persistBattleBgmPreferences() {
  try {
    localStorage.setItem(battleBgmVolumeStorageKey, battleBgmVolume.toFixed(2));
    localStorage.setItem(battleBgmTrackStorageKey, battleBgmTrackId);
  } catch { /* Preference remains active for this page. */ }
}
function setBattleBgmVolume(volume: number) {
  battleBgmVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.45));
  battleBgmBus.setVolume(battleBgmVolume);
  persistBattleBgmPreferences();
  syncBattleBgmControls();
}
function setBattleBgmTrack(trackId: string) {
  const track = battleBgmCatalog.find((candidate) => candidate.id === trackId);
  if (!track) return;
  battleBgmTrackId = track.id;
  battleBgmBus.setTrack(track.id);
  persistBattleBgmPreferences();
  syncBattleBgmControls();
}
syncBattleSoundControls();
syncBattleBgmControls();
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
const navigationMaskSource = document.documentElement.dataset.mapNoWalkMaskSrc
  || `${assetBase}/maps/garden-no-walk-mask-v1.svg`;
const mapFacilitySprites = (() => {
  try {
    return JSON.parse(document.documentElement.dataset.mapFacilitySprites ?? '{}');
  } catch {
    return {};
  }
})();

interface InternalDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  input?: {
    label: string;
    value?: string;
    maxLength?: number;
    multiline?: boolean;
    required?: boolean;
  };
}

let internalDialogResolve: ((value: string | null) => void) | null = null;
let internalDialogOpener: HTMLElement | null = null;

function finishInternalDialog(value: string | null) {
  const resolve = internalDialogResolve;
  if (!resolve) return;
  internalDialogResolve = null;
  if (internalDialog.open) internalDialog.close();
  const opener = internalDialogOpener;
  internalDialogOpener = null;
  resolve(value);
  queueMicrotask(() => opener?.focus());
}

function showInternalDialog(options: InternalDialogOptions): Promise<string | null> {
  if (internalDialogResolve) {
    return Promise.reject(new Error('已有一个内置弹窗正在等待处理'));
  }
  internalDialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  internalDialogTitle.textContent = options.title;
  internalDialogMessage.textContent = options.message;
  internalDialogConfirm.textContent = options.confirmLabel ?? '确认';
  internalDialogInputWrap.hidden = !options.input;
  internalDialogInput.hidden = true;
  internalDialogInput.disabled = true;
  internalDialogInput.required = false;
  internalDialogTextarea.hidden = true;
  internalDialogTextarea.disabled = true;
  internalDialogTextarea.required = false;

  let activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;
  if (options.input) {
    internalDialogLabel.textContent = options.input.label;
    activeInput = options.input.multiline ? internalDialogTextarea : internalDialogInput;
    internalDialogLabel.htmlFor = activeInput.id;
    activeInput.hidden = false;
    activeInput.disabled = false;
    activeInput.required = options.input.required ?? false;
    activeInput.maxLength = options.input.maxLength ?? 2048;
    activeInput.value = options.input.value ?? '';
  }

  return new Promise((resolve, reject) => {
    internalDialogResolve = resolve;
    try {
      internalDialog.showModal();
      queueMicrotask(() => (activeInput ?? internalDialogConfirm).focus());
    } catch (error) {
      internalDialogResolve = null;
      internalDialogOpener = null;
      reject(error);
    }
  });
}

async function confirmInApp(options: Omit<InternalDialogOptions, 'input'>) {
  return (await showInternalDialog(options)) !== null;
}

function promptInApp(options: InternalDialogOptions & { input: NonNullable<InternalDialogOptions['input']> }) {
  return showInternalDialog(options);
}

internalDialogForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!internalDialogForm.reportValidity()) return;
  const activeInput = internalDialogTextarea.disabled ? internalDialogInput : internalDialogTextarea;
  finishInternalDialog(internalDialogInputWrap.hidden ? 'confirmed' : activeInput.value);
});
internalDialogCancel.addEventListener('click', () => finishInternalDialog(null));
internalDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  finishInternalDialog(null);
});
internalDialog.addEventListener('click', (event) => {
  if (event.target === internalDialog) finishInternalDialog(null);
});
const characterSprites = resolveCharacterSprites(assetBase, document.documentElement.dataset);
const reimuSpriteSource = characterSprites.reimu.idleSource;
const reimuPortraitSource = document.documentElement.dataset.reimuPortraitSrc || reimuSpriteSource;
const marisaSpriteSource = characterSprites.marisa.idleSource;
const marisaPortraitSource = document.documentElement.dataset.marisaPortraitSrc || marisaSpriteSource;
const galPortraitSources = parseGalPortraitSources(
  document.documentElement.dataset.galPortraitSources,
);
const mainHouseSource = document.documentElement.dataset.mainHouseSrc
  || `${assetBase}/world/house/main-house-states-v1.png`;
const greenhouseSource = document.documentElement.dataset.greenhouseSrc
  || `${assetBase}/world/greenhouse/magic-greenhouse-states-v1.png`;
const battlePlayerSheetSource = document.documentElement.dataset.battlePlayerSrc
  || `${assetBase}/battle/player/keycraft-player-sheet-v1.png`;
const battleBossSheetSource = document.documentElement.dataset.battleBossSrc
  || `${assetBase}/battle/boss/greenhouse-flower-core-sheet-v1.png`;
const battleBossReimuSheetSource = document.documentElement.dataset.battleBossReimuSrc
  || `${assetBase}/battle/boss/reimu-battle-sheet-v1.png`;
const battleBossMarisaSheetSource = document.documentElement.dataset.battleBossMarisaSrc
  || `${assetBase}/battle/boss/marisa-battle-sheet-v1.png`;
const battleBossCirnoSheetSource = document.documentElement.dataset.battleBossCirnoSrc
  || `${assetBase}/battle/boss/cirno-battle-sheet-v1.png`;
const battleBossAliceSheetSource = document.documentElement.dataset.battleBossAliceSrc
  || `${assetBase}/battle/boss/alice-battle-sheet-v1.png`;
const battleBossNitoriSheetSource = document.documentElement.dataset.battleBossNitoriSrc
  || `${assetBase}/battle/boss/nitori-battle-sheet-v1.png`;
const battleBossMystiaSheetSource = document.documentElement.dataset.battleBossMystiaSrc
  || `${assetBase}/battle/boss/mystia-battle-sheet-v1.png`;
const battleBossSuikaSheetSource = document.documentElement.dataset.battleBossSuikaSrc
  || `${assetBase}/battle/boss/suika-battle-sheet-v1.png`;
const battleBossSakuyaSheetSource = document.documentElement.dataset.battleBossSakuyaSrc
  || `${assetBase}/battle/boss/sakuya-battle-sheet-v1.png`;
const battlePortraitReimuS0Source = document.documentElement.dataset.battlePortraitReimuS0Src
  || `${assetBase}/battle/portraits/portrait-reimu-s0-v1.png`;
const battlePortraitReimuS1Source = document.documentElement.dataset.battlePortraitReimuS1Src
  || `${assetBase}/battle/portraits/portrait-reimu-s1-v1.png`;
const battlePortraitReimuS2Source = document.documentElement.dataset.battlePortraitReimuS2Src
  || `${assetBase}/battle/portraits/portrait-reimu-s2-v1.png`;
const battlePortraitMarisaS0Source = document.documentElement.dataset.battlePortraitMarisaS0Src
  || `${assetBase}/battle/portraits/portrait-marisa-s0-v1.png`;
const battlePortraitMarisaS1Source = document.documentElement.dataset.battlePortraitMarisaS1Src
  || `${assetBase}/battle/portraits/portrait-marisa-s1-v1.png`;
const battlePortraitMarisaS2Source = document.documentElement.dataset.battlePortraitMarisaS2Src
  || `${assetBase}/battle/portraits/portrait-marisa-s2-v1.png`;
const battlePortraitAliceS0Source = document.documentElement.dataset.battlePortraitAliceS0Src
  || `${assetBase}/battle/portraits/portrait-alice-s0-v1.png`;
const battlePortraitAliceS1Source = document.documentElement.dataset.battlePortraitAliceS1Src
  || `${assetBase}/battle/portraits/portrait-alice-s1-v1.png`;
const battlePortraitAliceS2Source = document.documentElement.dataset.battlePortraitAliceS2Src
  || `${assetBase}/battle/portraits/portrait-alice-s2-v1.png`;
const battlePortraitCirnoS0Source = document.documentElement.dataset.battlePortraitCirnoS0Src
  || `${assetBase}/battle/portraits/portrait-cirno-s0-v1.png`;
const battlePortraitCirnoS1Source = document.documentElement.dataset.battlePortraitCirnoS1Src
  || `${assetBase}/battle/portraits/portrait-cirno-s1-v1.png`;
const battlePortraitCirnoS2Source = document.documentElement.dataset.battlePortraitCirnoS2Src
  || `${assetBase}/battle/portraits/portrait-cirno-s2-v1.png`;
const battlePortraitMystiaS0Source = document.documentElement.dataset.battlePortraitMystiaS0Src
  || `${assetBase}/battle/portraits/portrait-mystia-s0-v1.png`;
const battlePortraitMystiaS1Source = document.documentElement.dataset.battlePortraitMystiaS1Src
  || `${assetBase}/battle/portraits/portrait-mystia-s1-v1.png`;
const battlePortraitMystiaS2Source = document.documentElement.dataset.battlePortraitMystiaS2Src
  || `${assetBase}/battle/portraits/portrait-mystia-s2-v1.png`;
const battlePortraitNitoriS0Source = document.documentElement.dataset.battlePortraitNitoriS0Src
  || `${assetBase}/battle/portraits/portrait-nitori-s0-v1.png`;
const battlePortraitNitoriS1Source = document.documentElement.dataset.battlePortraitNitoriS1Src
  || `${assetBase}/battle/portraits/portrait-nitori-s1-v1.png`;
const battlePortraitNitoriS2Source = document.documentElement.dataset.battlePortraitNitoriS2Src
  || `${assetBase}/battle/portraits/portrait-nitori-s2-v1.png`;
const battlePortraitSuikaS0Source = document.documentElement.dataset.battlePortraitSuikaS0Src
  || `${assetBase}/battle/portraits/portrait-suika-s0-v1.png`;
const battlePortraitSuikaS1Source = document.documentElement.dataset.battlePortraitSuikaS1Src
  || `${assetBase}/battle/portraits/portrait-suika-s1-v1.png`;
const battlePortraitSuikaS2Source = document.documentElement.dataset.battlePortraitSuikaS2Src
  || `${assetBase}/battle/portraits/portrait-suika-s2-v1.png`;
const battlePortraitSakuyaS0Source = document.documentElement.dataset.battlePortraitSakuyaS0Src
  || `${assetBase}/battle/portraits/portrait-sakuya-s0-v1.png`;
const battlePortraitSakuyaS1Source = document.documentElement.dataset.battlePortraitSakuyaS1Src
  || `${assetBase}/battle/portraits/portrait-sakuya-s1-v1.png`;
const battlePortraitSakuyaS2Source = document.documentElement.dataset.battlePortraitSakuyaS2Src
  || `${assetBase}/battle/portraits/portrait-sakuya-s2-v1.png`;
const battlePortraitFlowerCoreS0Source = document.documentElement.dataset.battlePortraitFlowerCoreS0Src
  || `${assetBase}/battle/portraits/portrait-flower-core-s0-v1.png`;
const battlePortraitFlowerCoreS1Source = document.documentElement.dataset.battlePortraitFlowerCoreS1Src
  || `${assetBase}/battle/portraits/portrait-flower-core-s1-v1.png`;
const battlePortraitFlowerCoreS2Source = document.documentElement.dataset.battlePortraitFlowerCoreS2Src
  || `${assetBase}/battle/portraits/portrait-flower-core-s2-v1.png`;
const battleFairySheetSource = document.documentElement.dataset.battleFairySrc
  || `${assetBase}/battle/effects/fairy-sheet-v1.png`;
const battleEffectsSheetSource = document.documentElement.dataset.battleEffectsSrc
  || `${assetBase}/battle/effects/battle-effects-sheet-v1.png`;
const battleBulletsLocalSheetSource = document.documentElement.dataset.battleBulletsLocalSrc
  || `${assetBase}/battle/effects/battle-bullets-etama3-local-v1.png`;
const battleAtlasSources = {
  player: battlePlayerSheetSource,
  boss: battleBossSheetSource,
  boss_reimu: battleBossReimuSheetSource,
  boss_marisa: battleBossMarisaSheetSource,
  boss_alice: battleBossAliceSheetSource,
  boss_nitori: battleBossNitoriSheetSource,
  boss_cirno: battleBossCirnoSheetSource,
  boss_mystia: battleBossMystiaSheetSource,
  boss_suika: battleBossSuikaSheetSource,
  boss_sakuya: battleBossSakuyaSheetSource,
  portrait_reimu_s0: battlePortraitReimuS0Source,
  portrait_reimu_s1: battlePortraitReimuS1Source,
  portrait_reimu_s2: battlePortraitReimuS2Source,
  portrait_marisa_s0: battlePortraitMarisaS0Source,
  portrait_marisa_s1: battlePortraitMarisaS1Source,
  portrait_marisa_s2: battlePortraitMarisaS2Source,
  portrait_alice_s0: battlePortraitAliceS0Source,
  portrait_alice_s1: battlePortraitAliceS1Source,
  portrait_alice_s2: battlePortraitAliceS2Source,
  portrait_cirno_s0: battlePortraitCirnoS0Source,
  portrait_cirno_s1: battlePortraitCirnoS1Source,
  portrait_cirno_s2: battlePortraitCirnoS2Source,
  portrait_mystia_s0: battlePortraitMystiaS0Source,
  portrait_mystia_s1: battlePortraitMystiaS1Source,
  portrait_mystia_s2: battlePortraitMystiaS2Source,
  portrait_nitori_s0: battlePortraitNitoriS0Source,
  portrait_nitori_s1: battlePortraitNitoriS1Source,
  portrait_nitori_s2: battlePortraitNitoriS2Source,
  portrait_suika_s0: battlePortraitSuikaS0Source,
  portrait_suika_s1: battlePortraitSuikaS1Source,
  portrait_suika_s2: battlePortraitSuikaS2Source,
  portrait_sakuya_s0: battlePortraitSakuyaS0Source,
  portrait_sakuya_s1: battlePortraitSakuyaS1Source,
  portrait_sakuya_s2: battlePortraitSakuyaS2Source,
  portrait_flower_core_s0: battlePortraitFlowerCoreS0Source,
  portrait_flower_core_s1: battlePortraitFlowerCoreS1Source,
  portrait_flower_core_s2: battlePortraitFlowerCoreS2Source,
  fairies: battleFairySheetSource,
  effects: battleEffectsSheetSource,
  bullets_local: battleBulletsLocalSheetSource,
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
let activeBattleKind: 'flower_core' | 'dungeon' | 'practice' | 'duel' = 'flower_core';
let activeDuelUseId = '';
let activeDuelConversationTarget: InteractionTarget | null = null;
let activeSceneId = '';
let submissionInFlight = false;
let automaticTaskInFlight = false;
let inviteFeedback: {
  tone: 'accepted' | 'rescheduled' | 'declined' | 'error';
  title: string;
  message: string;
} | null = null;
let tutorialGuideChatId = '';
let tutorialGuideStorageKey = '';
let tutorialGuideSkipped = false;

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

interface TutorialGuideRoute {
  targetId: string;
  targetLabel: string;
  actionIds: string[];
  actionLabel: string;
}

const TUTORIAL_GUIDE_ROUTES: Record<string, TutorialGuideRoute> = {
  boundary: { targetId: 'reimu', targetLabel: '博丽灵梦', actionIds: ['inspect_boundary'], actionLabel: '检查结界' },
  'main-house': { targetId: 'main_house', targetLabel: '旧主屋', actionIds: ['repair'], actionLabel: '维修' },
  'magic-trace': { targetId: 'greenhouse_plot', targetLabel: '温室旧地基', actionIds: ['investigate_magic_trace'], actionLabel: '调查魔力痕迹' },
  inspiration: {
    targetId: 'greenhouse_plot',
    targetLabel: '温室旧地基',
    actionIds: ['investigate_growth', 'hear_marisa_plan', 'study_grandfather_blueprint'],
    actionLabel: '任意一个灵感入口',
  },
  foundation: { targetId: 'greenhouse_plot', targetLabel: '温室旧地基', actionIds: ['clear_greenhouse_foundation'], actionLabel: '清理旧地基' },
  greenhouse: { targetId: 'greenhouse_plot', targetLabel: '温室旧地基', actionIds: ['build_basic_magic_greenhouse'], actionLabel: '建造基础温室' },
  'first-use': { targetId: 'greenhouse_plot', targetLabel: '魔法温室', actionIds: ['greenhouse_first_use'], actionLabel: '第一次使用' },
  research: { targetId: 'greenhouse_plot', targetLabel: '魔法温室', actionIds: ['greenhouse_research_talk'], actionLabel: '温室研究交流' },
  'flower-core': { targetId: 'greenhouse_plot', targetLabel: '魔法温室', actionIds: ['investigate_flower_core'], actionLabel: '调查妖花核心' },
  'free-growth': { targetId: 'greenhouse_plot', targetLabel: '魔法温室', actionIds: ['organize_free_growth_proposal'], actionLabel: '整理自由生长方案' },
  'parallel-proposals': {
    targetId: 'greenhouse_plot',
    targetLabel: '魔法温室',
    actionIds: ['invite_alice_maintenance_assessment', 'commission_nitori_engineering_survey'],
    actionLabel: '尚未完成的方案',
  },
  'select-form': {
    targetId: 'greenhouse_plot',
    targetLabel: '魔法温室',
    actionIds: ['select_free_growth', 'select_doll_maintenance', 'select_kappa_automation'],
    actionLabel: '任意一个首次选型方案',
  },
};

function clearTutorialFocus() {
  document.querySelectorAll('.gg-tutorial-focus').forEach((node) => node.classList.remove('gg-tutorial-focus'));
}

function renderTutorialGuide() {
  clearTutorialFocus();
  gardenMap.setTutorialTarget(null);
  const progress = tutorialProgress(state);
  const activeActionId = pendingAction?.id ?? activeSessionActionId ?? '';
  const actionStep = currentView !== 'garden'
    ? progress.steps.find((item) => TUTORIAL_GUIDE_ROUTES[item.id]?.actionIds.includes(activeActionId))
    : null;
  const step = actionStep ?? progress.currentStep;
  if (tutorialGuideSkipped || !state.meta?.opening_committed || !step || step.id === 'opening') {
    tutorialGuide.hidden = true;
    return;
  }
  const route = TUTORIAL_GUIDE_ROUTES[step.id];
  if (!route) {
    tutorialGuide.hidden = true;
    return;
  }

  tutorialGuide.hidden = false;
  const stepIndex = progress.steps.findIndex((item) => item.id === step.id) + 1;
  tutorialGuideProgress.textContent = `新手指引 · 第 ${stepIndex}/${progress.totalCount} 步`;
  tutorialGuideTitle.textContent = step.title;

  let instruction = step.instruction;
  if (currentView === 'gal') {
    instruction = '阅读当前剧情并点击对白框继续。剧情播放完毕后会返回庭园，再指向下一项目标。';
    dialogueBox.classList.add('gg-tutorial-focus');
  } else if (currentView === 'facility' && pendingAction && route.actionIds.includes(pendingAction.id)) {
    instruction = `确认行动信息后，点击“${facilityConfirm.textContent || `确认${pendingAction.label}`}”。`;
    facilityConfirm.classList.add('gg-tutorial-focus');
  } else if (currentView !== 'garden') {
    instruction = '先返回庭园地图，指引会继续标出下一目标。';
  } else if (!targetMenu.hidden && activeTarget?.id === route.targetId) {
    instruction = `在${route.targetLabel}的操作菜单中点击“${route.actionLabel}”。`;
    Array.from(targetActionList.querySelectorAll<HTMLButtonElement>('[data-action-id]'))
      .filter((button) => route.actionIds.includes(button.dataset.actionId ?? ''))
      .forEach((button) => button.classList.add('gg-tutorial-focus'));
  } else {
    instruction = `点击地图上的${route.targetLabel}。`;
    gardenMap.setTutorialTarget(route.targetId);
  }
  tutorialGuideText.textContent = instruction;
}

async function syncTutorialGuidePreference() {
  const context = await bridge.getOpeningContext();
  if (context.chatId === tutorialGuideChatId) return;
  tutorialGuideChatId = context.chatId;
  tutorialGuideStorageKey = `gensokyo-garden:tutorial-guide-skipped:${encodeURIComponent(context.chatId || 'unknown')}`;
  try {
    tutorialGuideSkipped = localStorage.getItem(tutorialGuideStorageKey) === '1';
  } catch {
    tutorialGuideSkipped = false;
  }
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
  renderTutorialGuide();
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
  return state.characters?.[id]?.name ?? characterSprites[id]?.label ?? id;
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
      label: characterName(participant),
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
          label: characterName(action.target_id),
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
  portraitStage.dataset.visualMode = beat.visualMode;
  const portraitCharacterId = beat.speakerId ?? activeTarget?.id ?? null;
  const galPortraitSource = resolveGalPortraitSource(galPortraitSources, portraitCharacterId, {
    visualMode: beat.visualMode,
    reactionId: beat.reactionId,
    poseId: beat.poseId,
  });
  portraitStage.dataset.portraitKind = galPortraitSource ? 'gal' : 'sprite';
  portrait.src = galPortraitSource ?? (portraitCharacterId === 'marisa'
    ? marisaPortraitSource
    : reimuPortraitSource);
  portrait.alt = `${speaker}${galPortraitSource ? '立绘' : '近景占位图'}`;
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
  byId<HTMLButtonElement>('gg-end-chat').disabled = active;
  byId<HTMLButtonElement>('gg-regenerate').disabled = active;
  byId<HTMLButtonElement>('gg-send').disabled = active || closurePresented;
  galInput.disabled = active || closurePresented;
  sceneItemInput.disabled = active || singleShotEventPresentation || closurePending;
  sceneItemTrigger.disabled = sceneItemInput.disabled;
  if (sceneItemInput.disabled && sceneItemDialog.open) sceneItemDialog.close();
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
    byId('gg-scene-text').textContent = '本轮回复没有可播放的正文，请重新生成。';
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
  delete targetMenu.dataset.targetType;
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
  if (options.action) button.dataset.actionId = options.action.id;
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
  targetMenu.dataset.targetType = target.type;
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
  if (matchMedia('(max-width: 700px)').matches) {
    byId<HTMLButtonElement>('gg-target-close').focus({ preventScroll: true });
  }
  gardenMap.setSelected(target.id);
  renderTutorialGuide();
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
  const hidesFacilityVisual = isInspectView || action.target.id === 'main_house';
  facilityView.dataset.presentation = isInspectView ? 'details' : 'action';
  facilityView.dataset.hasVisual = hidesFacilityVisual ? 'false' : 'true';
  facilityVisual.hidden = hidesFacilityVisual;
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
  if (hidesFacilityVisual) {
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
  const selectedItemId = kind === 'interaction' ? sceneItemInput.value : '';
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
      sceneItemInput.value = '';
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
    await syncTutorialGuidePreference();
    state = await bridge.readState();
    await opening.render(state);
    renderHeader();
    renderPendingTasks();
    gardenMap.update(state);
    renderTutorialGuide();
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
    const pendingVictory = state.inventory?.card_runtime?.duel?.pending_victory_dialogue;
    if (pendingVictory && !duelVictoryDialog.open && !battleDialog.open) openDuelVictoryDialog();
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
  const pickerDisabled = Boolean(
    app.dataset.transactionBusy === 'true'
    || submissionInFlight
    || singleShotEventPresentation
    || closurePending
  );
  const available = listInventoryCatalog()
    .filter((item) => item.use_mode === 'scene_chat' && item.item_id !== 'emergency_repair_kit')
    .map((item) => ({ item, count: consumableCount(state, item.item_id) }))
    .filter(({ count }) => count > 0);
  if (sceneItemInput.value && !available.some(({ item }) => item.item_id === sceneItemInput.value)) {
    sceneItemInput.value = '';
  }
  const noItemButton = document.createElement('button');
  noItemButton.type = 'button';
  noItemButton.className = 'gg-scene-item-option';
  noItemButton.dataset.selected = String(!sceneItemInput.value);
  noItemButton.setAttribute('aria-pressed', String(!sceneItemInput.value));
  const noItemMark = document.createElement('span');
  noItemMark.className = 'gg-scene-item-option-mark';
  noItemMark.textContent = '空';
  const noItemCopy = document.createElement('span');
  noItemCopy.className = 'gg-scene-item-option-copy';
  const noItemTitle = document.createElement('strong');
  noItemTitle.textContent = '不使用道具';
  const noItemDescription = document.createElement('small');
  noItemDescription.textContent = '保留库存，直接发送本轮回应。';
  noItemCopy.append(noItemTitle, noItemDescription);
  noItemButton.append(noItemMark, noItemCopy);
  noItemButton.addEventListener('click', () => selectSceneItem(''));

  const itemButtons = available.map(({ item, count }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gg-scene-item-option';
    button.dataset.itemId = item.item_id;
    button.dataset.selected = String(sceneItemInput.value === item.item_id);
    button.setAttribute('aria-pressed', String(sceneItemInput.value === item.item_id));
    const mark = document.createElement('span');
    mark.className = 'gg-scene-item-option-mark';
    mark.textContent = String(count);
    const copy = document.createElement('span');
    copy.className = 'gg-scene-item-option-copy';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const description = document.createElement('small');
    description.textContent = item.prompt_description;
    copy.append(title, description);
    const stock = document.createElement('span');
    stock.className = 'gg-scene-item-option-stock';
    stock.textContent = `持有 ×${count}`;
    button.append(mark, copy, stock);
    button.addEventListener('click', () => selectSceneItem(item.item_id));
    return button;
  });
  const target = activeTarget?.type === 'character' ? activeTarget : null;
  const duelItem = listInventoryCatalog().find((item) => item.item_id === 'spell_duel_card');
  const duelCount = consumableCount(state, 'spell_duel_card');
  if (target && duelItem && duelCount > 0) {
    const blocked = duelCardBlock(state, target.id);
    const difficulty = duelDifficultyCopy(state.inventory?.card_runtime?.duel?.zako_tag_count ?? 0);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gg-scene-item-option';
    button.dataset.itemId = duelItem.item_id;
    button.dataset.action = 'dialogue-duel';
    button.dataset.selected = 'false';
    button.setAttribute('aria-pressed', 'false');
    button.disabled = pickerDisabled || Boolean(blocked);
    button.title = blocked;
    const mark = document.createElement('span');
    mark.className = 'gg-scene-item-option-mark';
    mark.textContent = '斗';
    const copy = document.createElement('span');
    copy.className = 'gg-scene-item-option-copy';
    const title = document.createElement('strong');
    title.textContent = `${duelItem.title} · 挑战${target.label}`;
    const description = document.createElement('small');
    description.textContent = blocked
      ? `当前不可使用：${blocked}`
      : `直接发起${difficulty.label}难度对战；不随消息发送，有效结算后才消费。`;
    copy.append(title, description);
    const stock = document.createElement('span');
    stock.className = 'gg-scene-item-option-stock';
    stock.textContent = `持有 ×${duelCount}`;
    button.append(mark, copy, stock);
    button.addEventListener('click', () => {
      if (sceneItemDialog.open) sceneItemDialog.close();
      void beginDialogueDuel();
    });
    itemButtons.push(button);
  }
  sceneItemOptions.replaceChildren(noItemButton, ...itemButtons);
  sceneItemInput.disabled = pickerDisabled;
  sceneItemTrigger.disabled = sceneItemInput.disabled;
  if (sceneItemInput.disabled && sceneItemDialog.open) sceneItemDialog.close();
  updateSceneItemPickerState();
}

function selectSceneItem(itemId: string) {
  sceneItemInput.value = itemId;
  updateSceneItemPickerState();
  if (sceneItemDialog.open) sceneItemDialog.close();
}

function updateSceneItemPickerState() {
  const selected = sceneItemInput.value;
  sceneItemPicker.dataset.hasSelection = String(Boolean(selected));
  sceneItemPicker.dataset.disabled = String(sceneItemInput.disabled);
  const selectedItem = selected
    ? listInventoryCatalog().find((item) => item.item_id === selected)
    : undefined;
  const count = selectedItem ? consumableCount(state, selectedItem.item_id) : 0;
  sceneItemSelected.textContent = selectedItem ? `${selectedItem.title} ×${count}` : '不使用道具';
  sceneItemOptions.querySelectorAll<HTMLButtonElement>('.gg-scene-item-option').forEach((button) => {
    const active = (button.dataset.itemId ?? '') === selected;
    button.dataset.selected = String(active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (sceneItemInput.disabled) {
    sceneItemHint.textContent = '当前剧情阶段不可追加道具';
    return;
  }
  sceneItemHint.textContent = selectedItem
    ? `已装备：${selectedItem.title} ×${count} · 发送时消耗 1 个`
    : '未选择道具 · 不会消耗库存';
}

const gardenMap = new GardenMap(
  gardenMapCanvas,
  mapSource,
  navigationMaskSource,
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

tutorialGuideSkip.addEventListener('click', () => {
  tutorialGuideSkipped = true;
  try {
    if (tutorialGuideStorageKey) localStorage.setItem(tutorialGuideStorageKey, '1');
  } catch { /* The guide still stays hidden for the current session. */ }
  renderTutorialGuide();
  setStatus('已跳过界面指引；剧情进度与可执行任务不会被跳过。');
});

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
byId('gg-target-close').addEventListener('click', () => {
  hideTargetMenu();
  gardenMapCanvas.focus({ preventScroll: true });
});
globalThis.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || targetMenu.hidden) return;
  event.preventDefault();
  hideTargetMenu();
  gardenMapCanvas.focus({ preventScroll: true });
});
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
      cursorGlow.style.opacity = '1';
    });
    openingRoot.addEventListener('pointerleave', () => {
      cursorGlow.style.opacity = '0';
    });
  }
}
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
byId('gg-session-history-close').addEventListener('click', () => sessionHistoryDialog.close());
sessionHistoryDialog.addEventListener('click', (event) => {
  if (event.target === sessionHistoryDialog) sessionHistoryDialog.close();
});
byId('gg-open-settings').addEventListener('click', () => navigateFromLauncher(openSettings));
byId('gg-settings-back').addEventListener('click', returnFromSettings);
battleSoundEnabledInput.addEventListener('change', () => {
  setBattleSoundEnabled(battleSoundEnabledInput.checked, battleSoundEnabledInput.checked);
});
battleSoundVolumeInput.addEventListener('input', () => {
  setBattleSoundVolume(Number(battleSoundVolumeInput.value) / 100);
});
battleSoundTest.addEventListener('click', () => {
  if (!battleSoundEnabled) setBattleSoundEnabled(true);
  void battleSoundBus.unlock?.();
  battleSoundBus.play('spell_declare');
});
battleSettingsSfxEnabled.addEventListener('change', () => {
  setBattleSoundEnabled(battleSettingsSfxEnabled.checked, battleSettingsSfxEnabled.checked);
});
battleSettingsSfxVolume.addEventListener('input', () => {
  setBattleSoundVolume(Number(battleSettingsSfxVolume.value) / 100);
});
battleSettingsBgmVolume.addEventListener('input', () => {
  setBattleBgmVolume(Number(battleSettingsBgmVolume.value) / 100);
});
battleSettingsBgmTrack.addEventListener('change', () => {
  setBattleBgmTrack(battleSettingsBgmTrack.value);
});
battlePauseButton.addEventListener('click', () => {
  if (!battle) return;
  const paused = battle.togglePaused();
  syncBattleTouchHud();
  if (!paused) battleCanvas.focus({ preventScroll: true });
});
battleAudioSettingsButton.addEventListener('click', openBattleAudioSettings);
battleAudioClose.addEventListener('click', closeBattleAudioSettings);
battleAudioDone.addEventListener('click', closeBattleAudioSettings);
battleAudioDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeBattleAudioSettings();
});
battleAudioDialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  closeBattleAudioSettings();
});
battleAudioDialog.addEventListener('click', (event) => {
  if (event.target === battleAudioDialog) closeBattleAudioSettings();
});
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
sceneItemTrigger.addEventListener('click', () => {
  if (sceneItemTrigger.disabled) return;
  renderSceneItemPicker();
  sceneItemDialog.showModal();
  sceneItemTrigger.setAttribute('aria-expanded', 'true');
  queueMicrotask(() => {
    (sceneItemOptions.querySelector<HTMLButtonElement>('[data-selected="true"]')
      ?? sceneItemOptions.querySelector<HTMLButtonElement>('button'))?.focus();
  });
});
sceneItemDialogClose.addEventListener('click', () => sceneItemDialog.close());
sceneItemDialog.addEventListener('click', (event) => {
  if (event.target === sceneItemDialog) sceneItemDialog.close();
});
sceneItemDialog.addEventListener('close', () => {
  sceneItemTrigger.setAttribute('aria-expanded', 'false');
  sceneItemTrigger.focus({ preventScroll: true });
});

function setBattleStatus(text: string, error = false) {
  const element = byId('gg-battle-status');
  element.textContent = text;
  element.dataset.error = String(error);
}

let battleHudTimer = 0;
let battleAudioSettingsWasPaused = false;

function clearBattleTouchState() {
  battle?.setFocusHeld(false);
  battleBgmBus.stop();
  battleFocusBtn.setAttribute('aria-pressed', 'false');
  battlePauseButton.disabled = true;
  battleAudioSettingsButton.disabled = true;
  battlePauseButton.setAttribute('aria-pressed', 'false');
  battlePauseButton.textContent = '暂停';
  battleDialog.dataset.paused = 'false';
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
  battlePauseButton.disabled = hud.finished;
  battleAudioSettingsButton.disabled = hud.finished;
  battlePauseButton.setAttribute('aria-pressed', String(hud.paused));
  battlePauseButton.textContent = hud.paused ? '继续' : '暂停';
  battleDialog.dataset.paused = String(hud.paused);
  if (hud.paused || hud.finished) battleBgmBus.pause();
  else if (battleBgmBus.getState().available) void battleBgmBus.play();
}

function openBattleAudioSettings() {
  if (!battle || battle.getTouchHud().finished || battleAudioDialog.open) return;
  battleAudioSettingsWasPaused = battle.getTouchHud().paused;
  battle.setPaused(true);
  syncBattleTouchHud();
  syncBattleSoundControls();
  syncBattleBgmControls();
  battleAudioDialog.showModal();
  queueMicrotask(() => battleSettingsSfxEnabled.focus({ preventScroll: true }));
}

function closeBattleAudioSettings() {
  if (!battleAudioDialog.open) return;
  battleAudioDialog.close();
  if (battle && !battleAudioSettingsWasPaused && !battle.getTouchHud().finished) {
    battle.setPaused(false);
  }
  syncBattleTouchHud();
  if (battle) battleCanvas.focus({ preventScroll: true });
  else battleAudioSettingsButton.focus({ preventScroll: true });
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
  if (battleAudioDialog.open) {
    battleAudioSettingsWasPaused = true;
    battleAudioDialog.close();
  }
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
    if (activeBattleKind === 'duel') {
      const settled = await bridge.settleDuelCard(result);
      pendingBattleResult = null;
      activeDuelUseId = '';
      if (battleDialog.open) battleDialog.close();
      await refresh();
      if (settled.won) {
        openDuelVictoryDialog();
        setStatus('符卡对战胜利。请提出一项对方必须答应的要求。', false, 'success');
        activeDuelConversationTarget = null;
      } else if (activeDuelConversationTarget) {
        activeTarget = activeDuelConversationTarget;
        activeDuelConversationTarget = null;
        setView('gal');
        await renderGal();
        setStatus(`${settled.message} 已返回与${activeTarget.label}的对话。`);
      } else {
        setView('inventory');
        renderInventory();
        setStatus(settled.message);
      }
      return;
    }
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
    chapter: '壹之卷',
    location: '雾之湖 · 冰雾回廊',
    boss: '琪露诺',
    difficulty: '入门',
    theme: 'ice',
    focus: '环弹 · 自机狙 · Bomb',
    phases: 2,
    duration: '约 40～70 秒',
    config: fairyDungeonConfig,
  },
  {
    title: '森林魔力残响',
    chapter: '贰之卷',
    location: '魔法森林 · 人偶剧场',
    boss: '爱丽丝',
    difficulty: '进阶',
    theme: 'forest',
    focus: '扇弹 · 追踪 · 切返',
    phases: 4,
    duration: '约 70～110 秒',
    config: forestDungeonConfig,
  },
  {
    title: '结界回声试炼',
    chapter: '叁之卷',
    location: '境界边缘 · 银时回廊',
    boss: '十六夜咲夜',
    difficulty: '上级',
    theme: 'boundary',
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
  const decorateButton = (button: HTMLButtonElement, symbol: string, title: string, detail: string) => {
    const symbolNode = document.createElement('span');
    symbolNode.setAttribute('aria-hidden', 'true');
    symbolNode.textContent = symbol;
    const titleNode = document.createElement('strong');
    titleNode.textContent = title;
    const detailNode = document.createElement('small');
    detailNode.textContent = detail;
    button.append(symbolNode, titleNode, detailNode);
  };
  for (const entry of dungeonEntries) {
    const card = document.createElement('article');
    card.className = 'gg-dungeon-entry';
    card.dataset.theme = entry.theme;
    const cardTopline = document.createElement('div');
    cardTopline.className = 'gg-dungeon-card-topline';
    const chapter = document.createElement('span');
    chapter.className = 'gg-dungeon-chapter';
    chapter.textContent = entry.chapter;
    const difficulty = document.createElement('span');
    difficulty.className = 'gg-dungeon-difficulty';
    difficulty.textContent = `${entry.difficulty}难度`;
    cardTopline.append(chapter, difficulty);
    const location = document.createElement('p');
    location.className = 'gg-dungeon-location';
    location.textContent = entry.location;
    const heading = document.createElement('h3');
    heading.textContent = entry.title;
    const boss = document.createElement('p');
    boss.className = 'gg-dungeon-boss';
    const bossLabel = document.createElement('span');
    bossLabel.textContent = '对阵';
    const bossName = document.createElement('strong');
    bossName.textContent = entry.boss;
    boss.append(bossLabel, bossName);
    const meta = document.createElement('div');
    meta.className = 'gg-dungeon-meta';
    for (const value of [`${entry.phases} 阶段`, entry.duration, ...entry.focus.split(' · ')]) {
      const tag = document.createElement('span');
      tag.textContent = value;
      meta.append(tag);
    }
    const row = document.createElement('div');
    row.className = 'gg-dungeon-entry-actions';
    const challenge = document.createElement('button');
    challenge.type = 'button';
    challenge.className = 'gg-dungeon-challenge';
    decorateButton(challenge, '⚔', '正式挑战', '结算金币与时段');
    challenge.setAttribute('aria-label', `正式挑战：${entry.title}`);
    challenge.disabled = Boolean(blocked);
    challenge.addEventListener('click', () => startDungeonBattle(entry.title, entry.config as unknown as BattleConfig, 'dungeon'));
    const practice = document.createElement('button');
    practice.type = 'button';
    decorateButton(practice, '✧', '弹幕演练', '不结算庭园状态');
    practice.setAttribute('aria-label', `练习（不结算）：${entry.title}`);
    practice.className = 'gg-dungeon-practice';
    practice.addEventListener('click', () => startDungeonBattle(`练习 · ${entry.title}`, entry.config as unknown as BattleConfig, 'practice'));
    row.append(challenge, practice);
    card.append(cardTopline, location, heading, boss, meta, row);
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
      ? '【练习】方向键/WASD 移动，按住 Z 射击，Shift 专注，X Bomb，Esc 暂停；手机拖动自动射击，双指专注，双击 Bomb；结束不写入 MVU。'
      : '方向键/WASD 移动，按住 Z 射击，Shift 专注，X Bomb，Esc 暂停；手机拖动自动射击，双指专注，双击 Bomb；本局结算完全在本地进行。',
  );
  battle = new BattleEngine(
    battleCanvas,
    config,
    async (result) => { await settleBattleResult(result); },
    { atlasSources: battleAtlasSources, soundBus: battleSoundBus },
  );
  battle.start();
  bindBattleSession();
}

function duelDifficultyCopy(tagCount: number) {
  const tier = duelDifficultyForTags(tagCount);
  return tier === 'hard'
    ? { tier, label: '极难', detail: '0 枚标签 · 原作 Hard 风格五阶段 · 低容错高密度' }
    : tier === 'assisted'
      ? { tier, label: '援助', detail: '3 枚以上标签 · 三阶段并提高生命、Bomb 与决死容错' }
      : { tier, label: '标准', detail: '1–2 枚标签 · 四阶段标准压力' };
}

function launchDuelBattle(title: string, config: BattleConfig, useId: string) {
  activeDuelUseId = useId;
  activeBattleKind = 'duel';
  if (duelDialog.open) duelDialog.close();
  destroyBattleSession();
  battleDialog.showModal();
  byId('gg-battle-title').textContent = title;
  byId<HTMLButtonElement>('gg-battle-narrative').hidden = true;
  byId<HTMLButtonElement>('gg-battle-retry').hidden = true;
  setBattleStatus('对战卡挑战：方向键/WASD 移动，Z 射击，Shift 专注，X Bomb；有效结算后才消费卡片。失败只增加杂鱼标签。');
  battle = new BattleEngine(
    battleCanvas,
    config,
    async (result) => { await settleBattleResult(result); },
    { atlasSources: battleAtlasSources, soundBus: battleSoundBus },
  );
  battle.start();
  bindBattleSession();
}

async function beginDuelAgainst(
  characterId: string,
  useId = `duel:${characterId}:${Date.now().toString(36)}`,
  conversationTarget: InteractionTarget | null = null,
) {
  try {
    const started = await bridge.beginDuelCard(characterId, useId);
    const profile = getDuelProfile(characterId);
    activeDuelConversationTarget = conversationTarget;
    launchDuelBattle(
      `对战卡 · ${profile?.display_name ?? characterId} · ${duelDifficultyCopy(state.inventory?.card_runtime?.duel?.zako_tag_count ?? 0).label}`,
      started.config as BattleConfig,
      useId,
    );
    await refresh();
  } catch (error) {
    activeDuelConversationTarget = null;
    setStatus(`无法开始对战卡：${error instanceof Error ? error.message : String(error)}`, true);
  }
}

async function beginDialogueDuel() {
  const target = activeTarget?.type === 'character' ? { ...activeTarget } : null;
  if (!target) return;
  const blocked = duelCardBlock(state, target.id);
  if (blocked) {
    setStatus(`无法向${target.label}使用对战卡：${blocked}`, true);
    return;
  }
  const difficulty = duelDifficultyCopy(state.inventory?.card_runtime?.duel?.zako_tag_count ?? 0);
  const confirmed = await confirmInApp({
    title: `挑战${target.label}`,
    message: `本次将锁定为${difficulty.label}难度。有效结算后才消费 1 张对战卡；取消会保留卡片并返回当前对话。`,
    confirmLabel: '亮出对战卡',
  });
  if (!confirmed) return;
  await beginDuelAgainst(target.id, `duel:${target.id}:${Date.now().toString(36)}`, target);
}

function openDuelChooser() {
  const targets = byId('gg-duel-targets');
  const summary = byId('gg-duel-summary');
  const tagCount = state.inventory?.card_runtime?.duel?.zako_tag_count ?? 0;
  const difficulty = duelDifficultyCopy(tagCount);
  summary.textContent = `杂鱼标签 ${tagCount} 枚 · 本次锁定为${difficulty.label}难度。${difficulty.detail}`;
  const fragment = document.createDocumentFragment();
  const pending = state.inventory?.card_runtime?.duel?.pending_battle;
  if (pending) {
    const profile = getDuelProfile(pending.target_character_id);
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.className = 'gg-duel-resume';
    resume.textContent = `恢复与${profile?.display_name ?? pending.target_character_id}的${duelDifficultyCopy(pending.started_zako_tag_count).label}对战`;
    resume.addEventListener('click', () => void beginDuelAgainst(pending.target_character_id, pending.use_id));
    fragment.append(resume);
  } else {
    for (const profile of listDuelProfiles()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gg-duel-target';
      button.dataset.characterId = profile.character_id;
      const name = document.createElement('strong');
      name.textContent = profile.display_name;
      const detail = document.createElement('small');
      detail.textContent = `${difficulty.label}难度 · 胜利进入要求剧情，失败标签 +1`;
      button.append(name, detail);
      const blocked = duelCardBlock(state, profile.character_id);
      button.disabled = Boolean(blocked);
      if (blocked) button.title = blocked;
      button.addEventListener('click', () => void beginDuelAgainst(profile.character_id));
      fragment.append(button);
    }
  }
  targets.replaceChildren(fragment);
  duelDialog.showModal();
}

function openDuelVictoryDialog() {
  const pending = state.inventory?.card_runtime?.duel?.pending_victory_dialogue;
  if (!pending) return;
  const profile = getDuelProfile(pending.target_character_id);
  byId('gg-duel-victory-summary').textContent = `你已战胜${profile?.display_name ?? pending.target_character_id}。本次要求在提交后锁定，对方必须接受。`;
  duelVictoryRequest.value = pending.request_text;
  duelVictoryRequest.disabled = pending.status === 'generating';
  byId<HTMLButtonElement>('gg-duel-victory-submit').textContent = pending.status === 'generating'
    ? '继续未完成的胜利剧情'
    : '提交要求并进入剧情';
  byId('gg-duel-victory-status').textContent = pending.status === 'generating'
    ? '要求已锁定；如上一轮生成中断，可从这里安全继续。'
    : '';
  if (!duelVictoryDialog.open) duelVictoryDialog.showModal();
  if (!duelVictoryRequest.disabled) duelVictoryRequest.focus();
}

async function submitDuelVictoryRequest() {
  const pending = state.inventory?.card_runtime?.duel?.pending_victory_dialogue;
  if (!pending) return;
  const requestText = (pending.status === 'generating' ? pending.request_text : duelVictoryRequest.value).trim();
  const status = byId('gg-duel-victory-status');
  const submit = byId<HTMLButtonElement>('gg-duel-victory-submit');
  if (!requestText) {
    status.textContent = '请先填写一项要求。';
    duelVictoryRequest.focus();
    return;
  }
  submit.disabled = true;
  status.textContent = pending.status === 'generating' ? '正在恢复胜利剧情……' : '要求已锁定，正在等待对方回应……';
  try {
    const message = buildDuelVictoryMessage(state, requestText);
    if (pending.status === 'generating') {
      try {
        await bridge.retryLastTransaction();
      } catch {
        await bridge.sendDuelVictoryRequest(requestText, message);
      }
    } else {
      await bridge.sendDuelVictoryRequest(requestText, message);
    }
    if (duelVictoryDialog.open) duelVictoryDialog.close();
    activeTarget = { type: 'character', id: pending.target_character_id, label: getDuelProfile(pending.target_character_id)?.display_name ?? pending.target_character_id };
    scene = null;
    sceneSignature = '';
    setView('gal');
    await refresh();
    setStatus('胜利要求剧情已完成并写入真实聊天。', false, 'success');
  } catch (error) {
    status.textContent = `胜利剧情未完成：${error instanceof Error ? error.message : String(error)}`;
    await refresh().catch(() => undefined);
    openDuelVictoryDialog();
  } finally {
    submit.disabled = false;
  }
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
  setBattleStatus('方向键/WASD 移动，按住 Z 射击，Shift 专注，X Bomb，Esc 暂停；手机拖动自动射击，双指专注，双击 Bomb；结算后会先写入可信 MVU 字段。');
  byId<HTMLButtonElement>('gg-battle-retry').hidden = true;
  battle = new BattleEngine(
    battleCanvas,
    battleConfigJson as unknown as BattleConfig,
    async (result) => { await settleBattleResult(result); },
    { atlasSources: battleAtlasSources, soundBus: battleSoundBus },
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
  const expandedDrawers = new Set(
    Array.from(root.querySelectorAll<HTMLDetailsElement>('details[data-opportunity-drawer][open]'))
      .map((drawer) => drawer.dataset.opportunityDrawer)
      .filter((drawer): drawer is string => Boolean(drawer)),
  );
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
    const graduation = document.createElement('section');
    graduation.className = 'gg-opportunity-graduation';
    const grad = document.createElement('p');
    grad.textContent = panel.graduation;
    const ack = document.createElement('button');
    ack.type = 'button';
    ack.textContent = '知道了';
    ack.addEventListener('click', () => {
      void bridge.applyM2Command({ type: 'acknowledge_graduation' }).then(() => refresh());
    });
    graduation.append(grad, ack);
    root.append(graduation);
  }
  if (state.garden_activities?.banquet) {
    const activeBanquet = document.createElement('article');
    activeBanquet.className = 'gg-opportunity-banner';
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
    const facilitySection = document.createElement('details');
    facilitySection.className = 'gg-opportunity-section gg-opportunity-facilities';
    facilitySection.dataset.opportunityDrawer = 'facilities';
    facilitySection.open = expandedDrawers.has('facilities');
    facilitySection.setAttribute('aria-labelledby', 'gg-opportunity-facilities-title');
    const sectionHeader = document.createElement('summary');
    sectionHeader.className = 'gg-opportunity-section-header';
    const sectionCopy = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'gg-eyebrow';
    eyebrow.textContent = '设施施工与经营';
    const sectionTitle = document.createElement('h3');
    sectionTitle.id = 'gg-opportunity-facilities-title';
    sectionTitle.textContent = '庭园设施';
    const sectionDescription = document.createElement('p');
    sectionDescription.textContent = '选择建设方案；建成后可切换形态、处理异常并执行日常行动。';
    sectionCopy.append(eyebrow, sectionTitle, sectionDescription);
    const facilityCount = document.createElement('span');
    facilityCount.className = 'gg-opportunity-count';
    facilityCount.textContent = `${panel.facilities.filter((facility) => facility.built).length} / ${panel.facilities.length} 已建成`;
    sectionHeader.append(sectionCopy, facilityCount);
    facilitySection.append(sectionHeader);

    const list = document.createElement('div');
    list.className = 'gg-opportunity-facility-grid';
    for (const facility of panel.facilities) {
      const card = document.createElement('article');
      card.className = 'gg-opportunity-facility';
      card.dataset.state = facility.built ? facility.status : 'planned';
      const cardHeader = document.createElement('header');
      const heading = document.createElement('h4');
      heading.textContent = facility.title;
      const status = document.createElement('span');
      status.className = 'gg-opportunity-status';
      status.textContent = facility.built
        ? facility.status === 'normal' ? '运转正常' : facility.status === 'damaged' ? '需要修复' : '等待调查'
        : '等待施工';
      cardHeader.append(heading, status);
      const detail = document.createElement('p');
      detail.className = 'gg-opportunity-facility-summary';
      detail.textContent = facility.built
        ? `已建成 · 当前形态 ${facility.current_form ?? '未知'} · 状态 ${facility.status}`
        : `可规划 · 建设消耗 ${facility.build_cost} 物资`;
      const forms = document.createElement('div');
      forms.className = 'gg-opportunity-form-list';
      card.append(cardHeader, detail, forms);
      for (const form of facility.forms) {
        const row = document.createElement('section');
        row.className = 'gg-opportunity-form';
        row.dataset.current = form.current ? 'true' : 'false';
        row.dataset.unlocked = form.unlocked ? 'true' : 'false';
        const formHeader = document.createElement('header');
        const formTitle = document.createElement('h5');
        formTitle.textContent = form.form_id;
        formHeader.append(formTitle);
        if (form.current) {
          const current = document.createElement('span');
          current.textContent = '当前形态';
          formHeader.append(current);
        }
        const summary = document.createElement('p');
        summary.textContent = form.summary;
        row.append(formHeader, summary);
        if (!facility.built) {
          const build = document.createElement('button');
          build.type = 'button';
          build.className = 'gg-opportunity-primary';
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
          actions.className = 'gg-opportunity-actions';
          for (const item of form.quick_actions) {
            const action = document.createElement('button');
            action.type = 'button';
            action.textContent = item.label;
            action.addEventListener('click', () => void runM2FacilityAction(facility.id, item.action_id, item.intent));
            actions.append(action);
          }
          row.append(actions);
        }
        forms.append(row);
      }
      if (facility.built && (facility.status === 'abnormal' || facility.status === 'damaged')) {
        const repair = document.createElement('button');
        repair.type = 'button';
        repair.className = 'gg-opportunity-warning';
        repair.textContent = facility.status === 'damaged' ? '修复设施' : '调查异常';
        repair.addEventListener('click', () => void runFacilityRecovery(facility.id));
        card.append(repair);
      }
      if (facility.id === 'moon_spring' && facility.built) {
        const modes = document.createElement('div');
        modes.className = 'gg-opportunity-actions';
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
        modes.className = 'gg-opportunity-actions';
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
    facilitySection.append(list);
    root.append(facilitySection);
  }
  if (panel.known_characters) {
    const inviteSection = document.createElement('details');
    inviteSection.className = 'gg-opportunity-section gg-opportunity-invites';
    inviteSection.dataset.opportunityDrawer = 'invites';
    inviteSection.open = expandedDrawers.has('invites');
    inviteSection.setAttribute('aria-labelledby', 'gg-opportunity-invites-title');
    const inviteHeader = document.createElement('summary');
    inviteHeader.className = 'gg-opportunity-section-header';
    const inviteCopy = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'gg-eyebrow';
    eyebrow.textContent = '访客调度';
    const inviteTitle = document.createElement('h3');
    inviteTitle.id = 'gg-opportunity-invites-title';
    inviteTitle.textContent = '邀请角色';
    const inviteDescription = document.createElement('p');
    inviteDescription.textContent = '邀请已认识的角色来访；是否接受仍由时段、职责与人数上限决定。';
    inviteCopy.append(eyebrow, inviteTitle, inviteDescription);
    inviteHeader.append(inviteCopy);
    inviteSection.append(inviteHeader);
    if (inviteFeedback) {
      const feedback = document.createElement('div');
      feedback.className = 'gg-opportunity-invite-feedback';
      feedback.dataset.tone = inviteFeedback.tone;
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');
      const marker = document.createElement('span');
      marker.className = 'gg-opportunity-invite-feedback-marker';
      marker.textContent = inviteFeedback.tone === 'accepted'
        ? '成功'
        : inviteFeedback.tone === 'rescheduled'
          ? '改约'
          : inviteFeedback.tone === 'declined'
            ? '未成'
            : '受阻';
      const feedbackCopy = document.createElement('div');
      const feedbackTitle = document.createElement('strong');
      feedbackTitle.textContent = inviteFeedback.title;
      const feedbackMessage = document.createElement('p');
      feedbackMessage.textContent = inviteFeedback.message;
      feedbackCopy.append(feedbackTitle, feedbackMessage);
      feedback.append(marker, feedbackCopy);
      inviteSection.append(feedback);
    }
    const known = document.createElement('p');
    known.className = 'gg-opportunity-known';
    known.textContent = panel.known_characters.length
      ? `已认识 ${panel.known_characters.length} 名角色`
      : '尚未认识可邀请角色';
    inviteSection.append(known);
    const invites = document.createElement('div');
    invites.className = 'gg-opportunity-invite-grid';
    for (const characterId of panel.known_characters) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gg-opportunity-invite';
      const name = document.createElement('strong');
      name.textContent = characterName(characterId);
      const hint = document.createElement('small');
      hint.textContent = '发送庭园邀请';
      button.append(name, hint);
      button.addEventListener('click', () => void runInvite(characterId));
      invites.append(button);
    }
    inviteSection.append(invites);
    root.append(inviteSection);
  }
  if (panel.notices?.length) {
    const noticeSection = document.createElement('section');
    noticeSection.className = 'gg-opportunity-section gg-opportunity-notices';
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
    noticeSection.append(noticeTitle, notices, clear);
    root.append(noticeSection);
  }
  if (panel.anomaly) {
    const anomalySection = document.createElement('section');
    anomalySection.className = 'gg-opportunity-section gg-opportunity-anomaly';
    const anomaly = document.createElement('p');
    anomaly.textContent = `活动异变「${panel.anomaly.title}」· 剩余 ${panel.anomaly.remaining} 时段 · ${panel.anomaly.status}`;
    anomalySection.append(anomaly);
    const actions = document.createElement('div');
    actions.className = 'gg-opportunity-actions';
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
    if (actions.childElementCount) anomalySection.append(actions);
    root.append(anomalySection);
  } else if (panel.anomaly_card_block) {
    const block = document.createElement('p');
    block.className = 'gg-opportunity-anomaly-note';
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
    await bridge.sendUserMessage(withGardenNarrativeContract(
      prompt,
      state,
      started.selectedCharacterId ? [started.selectedCharacterId] : [],
    ), 'interaction');
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
    const presentation = result.invitationOutcome === 'accept_now'
      ? { tone: 'accepted' as const, title: '邀请成功，对方现在就来' }
      : result.invitationOutcome === 'reschedule'
        ? { tone: 'rescheduled' as const, title: '已改约到之后的时段' }
        : { tone: 'declined' as const, title: '本次邀请未成' };
    inviteFeedback = { ...presentation, message: result.message };
    await refresh();
    renderOpportunities();
    setStatus(result.message, false, result.invitationOutcome === 'accept_now' ? 'success' : 'info');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    inviteFeedback = { tone: 'error', title: `${characterName(characterId)}暂时无法邀请`, message };
    renderOpportunities();
    setStatus(message, true);
  }
}

async function runMoonSpring(mode: 'public' | 'invite_only' | 'alone') {
  try {
    let accepted: string[] = [];
    if (mode === 'invite_only') {
      const present = [...(state.presence_snapshot?.present_character_ids ?? [])];
      if (!present.length) throw new Error('当前没有已经到场、可接受邀请的角色');
      const raw = await promptInApp({
        title: '月见温泉 · 仅邀请',
        message: `当前到场：${present.join('、')}`,
        confirmLabel: '确认参加者',
        input: {
          label: '参加者 ID（逗号分隔，最多 3 人）',
          value: present.join(', '),
          maxLength: 240,
          required: true,
        },
      });
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
    const offsetText = await promptInApp({
      title: '安排宴会时间',
      message: '请输入 0—4；0 表示当前时段，之后会从待办事项进入宴会。',
      confirmLabel: '确认时间',
      input: {
        label: '几个标准时段后开始',
        value: '0',
        maxLength: 1,
        required: true,
      },
    });
    if (offsetText == null) return;
    const startOffsetPeriods = Number(offsetText);
    if (!Number.isInteger(startOffsetPeriods) || startOffsetPeriods < 0 || startOffsetPeriods > 4) {
      throw new Error('宴会开始时段必须是 0—4 的整数');
    }
    let invitedCharacterIds: string[] = [];
    if (mode === 'invite_only') {
      const known = [...(state.visit_scheduler?.known_characters ?? [])];
      if (!known.length) throw new Error('还没有可邀请的已认识角色');
      const raw = await promptInApp({
        title: '宴会 · 邀请名单',
        message: `已认识：${known.join('、')}`,
        confirmLabel: '确认邀请',
        input: {
          label: '邀请对象 ID（逗号分隔，最多 6 人）',
          value: known.join(', '),
          maxLength: 480,
          required: true,
        },
      });
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
    await bridge.sendUserMessage(withGardenNarrativeContract(prompt, state, ['reimu']), 'interaction');
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
  const item = listShopItems(state).find((candidate) => candidate.item_id === itemId);
  const confirmed = await confirmInApp({
    title: '确认购买',
    message: item
      ? `购买「${item.title}」将花费 ${item.price} 金币。`
      : '确认以登记价格购买这件商品吗？',
    confirmLabel: '确认购买',
  });
  if (!confirmed) return;
  const purchaseId = `shop:${itemId}:${Date.now().toString(36)}`;
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
    if (itemId === 'opportunity_card') {
      const result = await bridge.useOpportunityCard(`opportunity:${Date.now().toString(36)}`);
      await refresh();
      setView('garden');
      setStatus(result.message, false, 'success');
      return;
    }
    if (itemId === 'spell_duel_card') {
      openDuelChooser();
      return;
    }
    let form: { title: string; rule_text: string; scope_mode: 'all' | 'present' | 'specified'; character_ids: string[]; presentation_tone: string; excluded_content: string } | undefined;
    if (itemId === 'incident_trigger_card') {
      const title = await promptInApp({
        title: '自定义异变 · 名称',
        message: '为这次异变填写一个简短名称。',
        confirmLabel: '下一步',
        input: { label: '异变名称（最多 40 字）', value: '未命名异变', maxLength: 40, required: true },
      });
      if (title == null) {
        setStatus('已取消异变表单', true);
        return;
      }
      const rule_text = await promptInApp({
        title: '自定义异变 · 核心规则',
        message: '描述异变会怎样影响庭院中的故事表现。',
        confirmLabel: '下一步',
        input: { label: '异变核心规则（最多 600 字）', maxLength: 600, multiline: true, required: true },
      });
      if (rule_text == null) {
        setStatus('已取消异变表单', true);
        return;
      }
      if (!title.trim() || !rule_text.trim()) {
        setStatus('异变名称与核心规则不能为空', true);
        return;
      }
      const scopeRawValue = await promptInApp({
        title: '自定义异变 · 影响范围',
        message: '可填写 all（所有人）、present（当前在场）或 specified（指定角色）。',
        confirmLabel: '下一步',
        input: { label: '影响范围', value: 'all', maxLength: 9, required: true },
      });
      if (scopeRawValue == null) {
        setStatus('已取消异变表单', true);
        return;
      }
      const scopeRaw = scopeRawValue.trim();
      const scope_mode = scopeRaw === 'present' || scopeRaw === 'specified' ? scopeRaw : 'all';
      const specifiedCharacters = scope_mode === 'specified'
        ? await promptInApp({
          title: '自定义异变 · 指定角色',
          message: '填写本次异变影响的已登记角色 ID。',
          confirmLabel: '下一步',
          input: { label: '角色 ID（用逗号分隔）', maxLength: 480, required: true },
        })
        : '';
      if (specifiedCharacters == null) {
        setStatus('已取消异变表单', true);
        return;
      }
      const character_ids = specifiedCharacters.split(/[,，]/u).map((value) => value.trim()).filter(Boolean);
      const presentation_tone = await promptInApp({
        title: '自定义异变 · 表现倾向',
        message: '可选。留空则由剧情根据核心规则自然表现。',
        confirmLabel: '下一步',
        input: { label: '表现倾向', maxLength: 120 },
      });
      if (presentation_tone == null) {
        setStatus('已取消异变表单', true);
        return;
      }
      const excluded_content = await promptInApp({
        title: '自定义异变 · 排除内容',
        message: '可选。填写明确不希望剧情出现的内容。',
        confirmLabel: '启用异变',
        input: { label: '排除内容', maxLength: 240, multiline: true },
      });
      if (excluded_content == null) {
        setStatus('已取消异变表单', true);
        return;
      }
      form = {
        title,
        rule_text,
        scope_mode,
        character_ids,
        presentation_tone,
        excluded_content,
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
byId('gg-close-duel').addEventListener('click', () => duelDialog.close());
duelDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  duelDialog.close();
});
duelVictoryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitDuelVictoryRequest();
});
duelVictoryDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  setStatus('胜利要求尚未完成，必须提交后才能继续。', true);
});
byId('gg-open-opportunities').addEventListener('click', () => navigateFromLauncher(() => { setView('opportunities'); renderOpportunities(); }));
byId('gg-opportunities-back').addEventListener('click', () => setView('garden'));
byId('gg-battle-retry').addEventListener('click', () => {
  if (pendingBattleResult) void settleBattleResult(pendingBattleResult);
});
async function closeBattleDialog() {
  destroyBattleSession();
  pendingBattleResult = null;
  const cancelledUseId = activeBattleKind === 'duel' ? activeDuelUseId : '';
  const conversationTarget = activeDuelConversationTarget;
  activeDuelUseId = '';
  activeDuelConversationTarget = null;
  if (cancelledUseId) {
    try {
      await bridge.cancelDuelCard(cancelledUseId);
      await refresh();
      if (conversationTarget) {
        activeTarget = conversationTarget;
        setView('gal');
        await renderGal();
        setStatus(`已取消对战卡挑战，卡片没有消费；继续与${conversationTarget.label}交谈。`);
      } else {
        setStatus('已取消对战卡挑战，卡片没有消费。');
      }
    } catch (error) {
      setStatus(`取消对战卡失败：${error instanceof Error ? error.message : String(error)}`, true);
    }
  }
  if (battleDialog.open) battleDialog.close();
  // Belt-and-suspenders: if a stylesheet ever forces display, still remove [open].
  battleDialog.removeAttribute('open');
}

byId('gg-close-battle').addEventListener('click', () => {
  void closeBattleDialog();
});
battleDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  void closeBattleDialog();
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
  battleSoundBus.destroy?.();
});

globalThis.addEventListener('gensokyo-garden:resume', () => {
  void refresh();
});

async function boot() {
  cleanupSubscription = await bridge.subscribe(() => void refresh());
  await refresh();
}

void boot();
