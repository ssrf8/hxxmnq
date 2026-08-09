import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const readBuffer = (path) => readFile(new URL(path, import.meta.url));
const importTypescript = async (path) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

test('MVU 存读 UI 与 bridge 只暴露八槽合同，宿主壳补齐精确 Helper 能力', async () => {
  const document = await read('../src/ui/index.html');
  const app = await read('../src/ui/app.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const types = await read('../src/ui/types.ts');
  const shell = await read('../src/runtime/ui-host-shell.js');
  assert.match(document, /id="gg-save-panel"[^>]*aria-busy="false"/);
  assert.match(document, /id="gg-save-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(types, /listSaveSlots\(\): Promise<SaveSlotSummary\[\]>/);
  assert.match(types, /saveToSlot\(slotId: SaveSlotId, label: string\)/);
  assert.match(types, /loadFromSlot\(slotId: SaveSlotId\)/);
  assert.match(app, /confirmInApp\(\{ title: '读取存档'/);
  assert.match(app, /promptInApp\(\{ title: slot\.occupied \? '覆盖存档' : '保存进度'/);
  assert.doesNotMatch(app, /\b(?:alert|confirm|prompt)\s*\(/);
  for (const capability of ['deleteChatMessages', 'getOrCreateChatWorldbook', 'getWorldbook', 'updateWorldbookWith']) {
    assert.match(shell, new RegExp(`'${capability}'`));
  }
  assert.match(bridge, /replaceMvuData\(structuredClone\(data\), \{ type: 'chat' \}\)/);
});

test('脱敏诊断 bridge：host/preview 共用构造器且不扩张为消息、数据库或网络读取', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const types = await read('../src/ui/types.ts');
  assert.match(types, /buildDiagnosticSnapshot\(\): Promise<DiagnosticSnapshotV1>/);
  assert.match(types, /import type \{ DiagnosticSnapshotV1 \} from '\.\/diagnostic-export'/);
  assert.match(bridge, /import \{ buildDiagnosticSnapshot \} from '\.\/diagnostic-export'/);
  const methods = [...bridge.matchAll(/async buildDiagnosticSnapshot\(\) \{([\s\S]*?)\n\s{4}\},/g)];
  assert.equal(methods.length, 2, 'host 与 preview 必须各实现一次诊断快照入口');
  for (const [, body] of methods) {
    assert.match(body, /return buildDiagnosticSnapshot\(\{/);
    assert.doesNotMatch(body, /getChatMessages|activeMessages|fetch\(|XMLHttpRequest|sendBeacon/);
    assert.doesNotMatch(body, /memoryPort\.(?:recall|archive)|replaceMvuData|createChatMessages|triggerSlash/);
  }
});

test('脱敏诊断设置入口只做主动本地下载并回收临时 URL', async () => {
  const document = await read('../src/ui/index.html');
  const app = await read('../src/ui/app.ts');
  assert.match(document, /id="gg-export-diagnostics"[^>]*type="button"/);
  assert.match(document, /id="gg-diagnostic-export-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(document, /仅下载到本机，不包含剧情文本；分享前仍建议人工检查/);
  assert.match(app, /diagnosticExportButton\.addEventListener\('click', \(\) => void downloadDiagnosticSnapshot\(\)\)/);
  const handler = app.match(/async function downloadDiagnosticSnapshot\(\): Promise<void> \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(handler, '必须存在独立诊断下载处理器');
  assert.match(handler, /if \(diagnosticExportButton\.disabled\) return/);
  assert.match(handler, /await bridge\.buildDiagnosticSnapshot\(\)/);
  assert.match(handler, /serializeDiagnosticSnapshot\(snapshot\)/);
  assert.match(handler, /new Blob\(\[json\], \{ type: 'application\/json;charset=utf-8' \}\)/);
  assert.match(handler, /URL\.createObjectURL\(blob\)/);
  assert.match(handler, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(handler, /finally \{/);
  assert.doesNotMatch(handler, /error\.message|String\(error\)|error\.stack/);
  assert.doesNotMatch(handler, /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);
  assert.doesNotMatch(handler, /writeState|replaceMvuData|createChatMessages|triggerSlash/);
});

test('角色菜单可发起符卡对战，开战前说明规则，并在失败后返回庭院', async () => {
  const document = await read('../src/ui/index.html');
  const app = await read('../src/ui/app.ts');
  assert.doesNotMatch(document, /id="gg-use-duel-card"/);
  assert.doesNotMatch(document, /对战卡会直接挑战当前交谈角色/);
  assert.match(app, /function beginDialogueDuel/);
  assert.match(app, /action\.mode === 'duel'/);
  assert.match(app, /openDuelResultDialog\(settled\)/);
  assert.match(document, /id="gg-duel-result-dialog"/);
  assert.match(app, /activeDuelConversationTarget/);
  assert.match(app, /胜利后可以向对方提出一项要求/);
  assert.match(app, /setView\('garden'\)/);
  assert.match(app, /已返回庭院/);
});

test('角色点击菜单由代码绘制、去除重复离开入口并保持语义映射', async () => {
  const controller = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  const build = await read('../scripts/build-ui.mjs');
  const host = await read('../src/runtime/ui-host-shell.js');
  assert.match(controller, /type TargetActionVisualKind = 'talk' \| 'leave' \| 'pat-head' \| 'quest'/);
  assert.match(controller, /const targetActionSymbols/);
  assert.match(controller, /action\.mode === 'close' \|\| action\.id === 'leave'/);
  assert.match(controller, /action\.id === 'pat_head'/);
  assert.match(controller, /action\.eventId \|\| action\.mode === 'facility'/);
  assert.match(controller, /button\.dataset\.visualKind = visualKind/);
  assert.match(controller, /targetMenu\.dataset\.targetType = target\.type/);
  assert.match(controller, /delete targetMenu\.dataset\.targetType/);
  assert.match(controller, /className = 'gg-bubble-symbol'/);
  assert.match(controller, /className = 'gg-bubble-reason'/);
  assert.match(controller, /options\.disabled[\s\S]*?action: item/);
  assert.match(controller, /candidate\.mode !== 'close' && candidate\.id !== 'leave'/);
  assert.doesNotMatch(build, /target-action-(?:talk|leave|pat-head|quest)-v1\.png/);
  assert.doesNotMatch(build, /targetActionBadgeDataUrls/);
  assert.doesNotMatch(host, /dataset\.targetAction(?:Talk|Leave|PatHead|Quest)Src/);
  assert.doesNotMatch(controller, /gg-bubble-image|targetActionBadgeSources/);
  assert.match(styles, /\.gg-bubble-dot::before/);
  assert.match(styles, /\.gg-bubble-dot::after/);
  assert.match(styles, /\.gg-bubble-symbol/);
  assert.match(styles, /\[data-visual-kind="quest"\]/);
  assert.match(styles, /#gg-target-menu\[data-target-type="character"\] \.gg-target-actions \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /#gg-target-menu\[data-target-type="facility"\] \.gg-target-actions \{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(styles, /手机端目标菜单是地图内的底部操作抽屉/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?#gg-target-menu \{[\s\S]*?position: fixed/);
  assert.match(styles, /#gg-target-menu\[hidden\] \{ display: none; \}/);
  assert.match(styles, /overscroll-behavior: contain/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(controller, /event\.key !== 'Escape' \|\| targetMenu\.hidden/);
  assert.match(styles, /#gg-target-menu \.gg-bubble-dot \{[\s\S]*?width: 82px;[\s\S]*?height: 82px;/);
});

test('金币旁边显示杂鱼标签，并降低默认弹幕音效', async () => {
  const document = await read('../src/ui/index.html');
  const app = await read('../src/ui/app.ts');
  const sound = await read('../src/battle/battle-sound.ts');
  assert.match(app, /金币 \$\{state\.resources\?\.coins \?\? 0\} · 杂鱼标签 ×\$\{zakoTagCount\}/);
  assert.doesNotMatch(app, /fishMarks|小鱼干/);
  assert.match(app, /let battleSoundVolume = 0\.01/);
  assert.match(document, /id="gg-battle-sound-volume" type="range" min="0" max="100" step="1" value="1"/);
  assert.match(sound, /options\.volume \?\? 0\.01/);
  assert.match(app, /let battleBgmVolume = 0\.08/);
  assert.match(document, /id="gg-battle-settings-bgm-volume" type="range" min="0" max="100" step="5" value="8"/);
});

test('符卡副本以会话内三层塔运行，逐层结算且退出不保留进度', async () => {
  const app = await read('../src/ui/app.ts');
  const rules = await read('../src/ui/bullet-tower-rules.ts');
  assert.match(app, /let towerRun:/);
  assert.match(app, /createBulletTowerRun\(dungeonEntries\)/);
  assert.match(app, /towerRun\.currentFloor \+= 1/);
  assert.match(app, /if \(activeBattleKind === 'dungeon'\) discardTowerRun\(\)/);
  assert.match(app, /胜负均立即结算；胜利进入下一层/);
  assert.match(rules, /rewardMultiplier: 0\.85/);
  assert.match(rules, /rewardMultiplier: 0\.7/);
  assert.match(rules, /rewardMultiplier: 0\.55/);
});

test('战斗音频设置可本地保存并解析网易云链接', async () => {
  const document = await read('../src/ui/index.html');
  const app = await read('../src/ui/app.ts');
  assert.match(document, /id="gg-battle-bgm-links"/);
  assert.match(document, /id="gg-battle-bgm-links-save"/);
  assert.match(document, /id="gg-battle-bgm-links-open"/);
  assert.match(app, /battleBgmLinksStorageKey/);
  assert.match(app, /parseLocalBgmLinks\(battleBgmLinksInput\.value\)/);
  assert.match(app, /battleBgmBus\.setPlaylist/);
  assert.match(app, /resolvePlayableLocalBgmSource/);
  assert.match(document, /打开网易云歌单原页/);
  assert.match(document, /作者推荐/);
  assert.match(document, /自己想听/);
  assert.match(app, /battleBgmSourceMode: BattleBgmSourceMode = 'off'/);
  assert.match(app, /setBattleBgmSourceMode/);
  assert.match(app, /openBattleBgmOnboardingOnce/);
  assert.match(app, /battlePracticeBgmOnboardingStorageKey/);
  assert.match(app, /弹幕演练提示/);
  assert.match(document, /id="gg-bgm-onboarding"/);
});

test('八名登记角色都提供一次不预设结果的摸摸头互动', async () => {
  const actions = await importTypescript('../src/ui/target-actions.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  const characters = [
    ['reimu', '博丽灵梦'],
    ['marisa', '雾雨魔理沙'],
    ['alice', '爱丽丝'],
    ['nitori', '河城荷取'],
    ['cirno', '琪露诺'],
    ['mystia', '米斯蒂娅'],
    ['suika', '伊吹萃香'],
    ['sakuya', '十六夜咲夜'],
  ];
  for (const [id, label] of characters) {
    const pats = actions.targetActions({ type: 'character', id, label }, state)
      .filter((action) => action.id === 'pat_head');
    assert.equal(pats.length, 1, id);
    assert.equal(pats[0].mode, 'gal', id);
    assert.match(pats[0].intent, new RegExp(label));
    assert.match(pats[0].intent, /只是尝试，不预设对方会接受/);
    assert.equal(pats[0].eventId, undefined, id);
  }
});

test('浏览器缩放补偿只服务地图交互，三项玩法入口进入大型案内面板', async () => {
  const controller = await read('../src/ui/app.ts');
  const document = await read('../src/ui/index.html');
  const map = await read('../src/ui/garden-map.ts');
  const styles = await read('../src/ui/styles.css');
  assert.match(controller, /const initialDevicePixelRatio/);
  assert.match(controller, /--gg-browser-zoom-compensation/);
  assert.match(controller, /visualViewport\?\.addEventListener\('resize'/);
  assert.match(map, /initialDevicePixelRatio \/ currentDevicePixelRatio/);
  assert.match(map, /dataset\.browserZoomCompensation/);
  assert.match(map, /this\.pixelRatio \* this\.browserZoomCompensation/);
  assert.match(styles, /#gg-target-menu \{[\s\S]*?transform: scale\(var\(--gg-browser-zoom-compensation, 1\)\)/);
  assert.match(styles, /顶栏：博丽符纸色 \+ 像素结界纹[\s\S]*?\.gg-header \{[\s\S]*?--gg-header-paper:[\s\S]*?border: 0;[\s\S]*?repeating-linear-gradient/);
  assert.match(styles, /\.gg-header \.gg-title-wrap \{[\s\S]*?clip-path: polygon/);
  assert.match(styles, /\.gg-header \.gg-status-line span \{[\s\S]*?border-radius: 2px;[\s\S]*?box-shadow:/);
  assert.match(document, /id="gg-open-launcher"[^>]*aria-controls="gg-launcher-dialog"/);
  assert.match(document, /id="gg-launcher-dialog"[^>]*aria-labelledby="gg-launcher-title"/);
  assert.match(document, /class="gg-launcher-grid"[\s\S]*?id="gg-open-dungeon"[\s\S]*?id="gg-open-shop"[\s\S]*?id="gg-open-inventory"/);
  assert.match(controller, /function openLauncher\(\)[\s\S]*?launcherDialog\.showModal\(\)/);
  assert.match(controller, /function navigateFromLauncher\(action: \(\) => void\)/);
  assert.match(styles, /\.gg-header #gg-open-launcher \{[\s\S]*?-webkit-tap-highlight-color: transparent;[\s\S]*?touch-action: manipulation;/);
  assert.match(styles, /\.gg-header #gg-open-launcher:focus-visible \{[\s\S]*?outline: 3px solid var\(--gg-focus\)/);
  assert.match(styles, /\.gg-launcher-grid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 559px\)[\s\S]*?\.gg-launcher-grid \{ grid-template-columns: 1fr/);
});

test('R33.2 顶栏换装「晨雾结界·像素晨光·玻璃流光」：更透底图 + 流动炫光玻璃 + 便利贴胶带；不改文字与间距', async () => {
  const styles = await read('../src/ui/styles.css');
  assert.match(styles, /\.gg-header \{[\s\S]*?--gg-header-paper: rgba\(255, 249, 231, \.9\);[\s\S]*?border: 0;[\s\S]*?repeating-linear-gradient\(90deg, rgba\(214, 181, 119, \.09\)/);
  assert.match(styles, /\.gg-header \{[\s\S]*?radial-gradient\(circle 52% at 50% 50%, rgba\(240, 200, 130, \.38\)[\s\S]*?radial-gradient\(circle 56% at 50% 50%, rgba\(160, 205, 215, \.32\)[\s\S]*?radial-gradient\(circle 50% at 50% 50%, rgba\(226, 160, 172, \.28\)/);
  assert.match(styles, /\.gg-header \{[\s\S]*?linear-gradient\(180deg, rgba\(255, 251, 240, \.76\)/);
  assert.match(styles, /\.gg-header \{[\s\S]*?animation: gg-header-glass-flow 9s/);
  assert.match(styles, /@keyframes gg-header-glass-flow \{[\s\S]*?background-position: 0 0, 0 0, 135% 50%, 10% 25%, 80% 70%, 20% 60%, 0 0;/);
  assert.match(styles, /\.gg-header \.gg-title-wrap \{[\s\S]*?clip-path: polygon\(0 8px/);
  assert.match(styles, /\.gg-header \.gg-title-wrap \{[\s\S]*?filter: drop-shadow\(3px 3px 0 rgba\(150, 110, 74, \.3\)\)/);
  assert.match(styles, /\.gg-header \.gg-title-wrap::after \{[\s\S]*?height: 8px;[\s\S]*?repeating-linear-gradient\(90deg, rgba\(255, 255, 255, \.18\)/);
  assert.match(styles, /\.gg-header \.gg-status-line span \{[\s\S]*?border: 2px solid rgba\(178, 130, 86, \.4\);[\s\S]*?border-radius: 2px;[\s\S]*?box-shadow:/);
  assert.match(styles, /\.gg-header \.gg-status-line #gg-time \{ background: rgba\(255, 250, 218, \.62\); \}/);
  assert.match(styles, /\.gg-header \.gg-status-line #gg-weather \{ background: rgba\(255, 240, 233, \.62\); \}/);
  assert.match(styles, /\.gg-header \.gg-status-line #gg-resources \{ background: rgba\(234, 246, 244, \.62\); \}/);
  assert.match(styles, /\.gg-header #gg-time::before \{ background: #dfa84e; \}/);
  assert.match(styles, /\.gg-header #gg-weather::before \{ background: var\(--gg-header-red\); \}/);
  assert.match(styles, /\.gg-header #gg-resources::before \{ background: #86b3b0; \}/);
  assert.match(styles, /\.gg-header #gg-open-launcher \{[\s\S]*?--btn-hi: rgba\(235, 178, 160, \.9\);[\s\S]*?--btn-lo: rgba\(214, 138, 118, \.88\);/);
  assert.match(styles, /\.gg-header #gg-open-launcher:active:not\(:disabled\) \{[\s\S]*?translate\(2px, 2px\)/);
  assert.match(styles, /\.gg-launcher-dialog \{[\s\S]*?border: 4px solid #d9c29a;[\s\S]*?border-radius: 2px;/);
});

test('设施查看与主屋维修隐藏图片且不影响其他设施行动', async () => {
  const controller = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  assert.match(controller, /const isInspectView = action\.id === 'inspect'/);
  assert.match(controller, /const hidesFacilityVisual = isInspectView[\s\S]*?action\.target\.id === 'main_house'[\s\S]*?action\.target\.id === 'magic_greenhouse'[\s\S]*?action\.id === 'greenhouse_first_use'/);
  assert.match(controller, /facilityView\.dataset\.presentation = isInspectView \? 'details' : 'action'/);
  assert.match(controller, /facilityView\.dataset\.hasVisual = hidesFacilityVisual \? 'false' : 'true'/);
  assert.match(controller, /facilityVisual\.hidden = hidesFacilityVisual/);
  assert.match(controller, /if \(hidesFacilityVisual\) \{[\s\S]*?facilityImage\.removeAttribute\('src'\)/);
  assert.match(controller, /action\.target\.id === 'greenhouse_plot' \|\| action\.target\.id === 'magic_greenhouse'/);
  assert.match(controller, /singleShotEventPresentation = Boolean\(pendingAction\.fixedPresentation\);[\s\S]*?setView\('gal'\);[\s\S]*?setGenerating\(true\);[\s\S]*?await submitGalMessage\(/);
  assert.match(styles, /\.gg-facility-visual\[hidden\] \{ display: none; \}/);
  assert.match(styles, /\.gg-facility\[data-has-visual="false"\] \.gg-facility-card \{ margin: var\(--gg-space-4\) auto 0; \}/);
  assert.match(styles, /@media \(max-width: 700px\) \{[\s\S]*?\.gg-facility > \.gg-scene-toolbar \{[\s\S]*?z-index: 2;[\s\S]*?\.gg-facility\[data-has-visual="false"\] \.gg-facility-card \{[\s\S]*?margin-top: 0;/);
});

test('背包使用独立道具袋视图并保留受控使用入口', async () => {
  const view = await read('../src/ui/inventory-view.ts');
  const document = await read('../src/ui/index.html');
  const styles = await read('../src/ui/styles.css');
  assert.match(document, /id="gg-view-inventory" class="gg-view gg-settings gg-inventory"/);
  assert.match(view, /const itemMarks: Record<string, string>/);
  assert.match(view, /className = 'gg-inventory-intro'/);
  assert.match(view, /className = 'gg-inventory-grid'/);
  assert.match(view, /card\.dataset\.itemId = row\.item_id/);
  assert.match(
    view,
    /\['incident_trigger_card', 'sakuya_watch', 'opportunity_card'\]\.includes\(row\.item_id\)/,
  );
  assert.match(view, /button\.disabled = !row\.usable/);
  assert.match(styles, /\.gg-inventory-item\[data-item-id="sakuya_watch"\]/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.gg-inventory-item-side/);
});

test('购买与参数输入统一使用内置弹窗，不调用浏览器原生弹窗', async () => {
  const app = await read('../src/ui/app.ts');
  const document = await read('../src/ui/index.html');
  const styles = await read('../src/ui/styles.css');
  assert.doesNotMatch(app, /\b(?:window|globalThis)\.(?:alert|confirm|prompt)\s*\(/);
  assert.match(document, /id="gg-internal-dialog"[\s\S]*?id="gg-internal-dialog-form"/);
  assert.match(document, /id="gg-internal-dialog-input"[\s\S]*?id="gg-internal-dialog-textarea"/);
  assert.match(app, /async function confirmInApp/);
  assert.match(app, /function promptInApp/);
  assert.match(app, /internalDialog\.addEventListener\('cancel'/);
  assert.match(app, /queueMicrotask\(\(\) => opener\?\.focus\(\)\)/);
  assert.match(app, /title: '确认购买'[\s\S]*?confirmLabel: '确认购买'/);
  assert.match(styles, /\.gg-internal-dialog:not\(\[open\]\)/);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*?\.gg-internal-dialog-actions/);
});

test('GAL 道具选择使用独立道具匣并同步本轮选择', async () => {
  const document = await read('../src/ui/index.html');
  const controller = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  assert.match(document, /id="gg-scene-item-picker" class="gg-scene-item-picker" data-has-selection="false"/);
  assert.match(document, /class="gg-scene-item-mark"[^>]*>御<\/span>/);
  assert.doesNotMatch(document, /<select[^>]*id="gg-scene-item"/);
  assert.match(document, /id="gg-scene-item" type="hidden"/);
  assert.match(document, /id="gg-scene-item-trigger"[\s\S]*?aria-haspopup="dialog"[\s\S]*?aria-controls="gg-scene-item-dialog"/);
  assert.match(document, /id="gg-scene-item-dialog"[\s\S]*?id="gg-scene-item-options"/);
  assert.match(document, /id="gg-scene-item-hint"[^>]*aria-live="polite"/);
  assert.match(controller, /sceneItemDialog\.showModal\(\)/);
  assert.match(controller, /function selectSceneItem\(itemId: string\)/);
  assert.match(controller, /description\.textContent = item\.blurb \?\? item\.prompt_description/);
  assert.match(controller, /sceneItemOptions\.replaceChildren\(noItemButton, \.\.\.pageButtons\)/);
  assert.match(controller, /attachSceneItemLongPress/);
  assert.match(controller, /SCENE_ITEM_PAGE_SIZE/);
  assert.match(document, /id="gg-scene-item-pager"/);
  assert.match(controller, /sceneItemDialog\.addEventListener\('close'[\s\S]*?sceneItemTrigger\.focus/);
  assert.match(controller, /function updateSceneItemPickerState\(\)/);
  assert.match(controller, /sceneItemPicker\.dataset\.hasSelection = String\(Boolean\(selected\)\)/);
  assert.match(controller, /已装备：\$\{selectedItem\.title\} ×\$\{count\} · 发送时消耗 1 个/);
  assert.match(controller, /输入中提及道具不会触发效果/);
  assert.match(styles, /\.gg-scene-item-picker \{[\s\S]*?clip-path: polygon/);
  assert.match(styles, /\.gg-scene-item-trigger \{[\s\S]*?linear-gradient\(180deg, #f5e3bd, #dbbd84\)/);
  assert.match(styles, /\.gg-scene-item-dialog \{[\s\S]*?width: min\(92vw, 680px\)/);
  assert.match(styles, /\.gg-scene-item-options \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.gg-scene-item-option\[data-selected="true"\]/);
  assert.match(styles, /\.gg-scene-item-picker\[data-has-selection="true"\]/);
  assert.match(styles, /\.gg-scene-item-picker\[data-has-selection="true"\] \.gg-scene-item-trigger \{[\s\S]*?linear-gradient\(180deg, #8f3942, #64262e\)/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.gg-scene-item-picker \{ grid-template-columns: 1fr;/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.gg-scene-item-options \{ grid-template-columns: 1fr;/);
});

test('开放庭园页面从正式状态派生教程进度与下一步', async () => {
  const rules = await importTypescript('../src/ui/open-garden-rules.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  let progress = rules.tutorialProgress(initial);
  assert.equal(progress.currentStep.id, 'opening');
  assert.equal(progress.totalCount, 13);

  initial.meta.opening_committed = true;
  progress = rules.tutorialProgress(initial);
  assert.equal(progress.currentStep.id, 'boundary');
  assert.match(progress.currentStep.instruction, /点击灵梦/);

  Object.assign(initial.events.completed_key_events, {
    reimu_boundary_inspection: 'temporary_permission',
    main_house_repair: 'main_house_enabled',
    marisa_material_rumor: 'greenhouse_clue_found',
    gain_second_inspiration: 'growth_pattern_understood',
    clear_greenhouse_foundation: 'foundation_cleared',
    build_basic_magic_greenhouse: 'basic_greenhouse_enabled',
    greenhouse_first_use: 'stable_first_growth',
    greenhouse_multiturn_conversation: 'conversation_settled_after_multiple_turns',
    greenhouse_flower_core: 'clean_win',
    greenhouse_free_growth_proposal: 'wild_growth_plan_registered',
    nitori_greenhouse_automation_proposal: 'kappa_automation_plan_registered',
  });
  progress = rules.tutorialProgress(initial);
  assert.equal(progress.currentStep.id, 'parallel-proposals');
  assert.match(progress.currentStep.instruction, /爱丽丝/);
  assert.doesNotMatch(progress.currentStep.instruction, /荷取/);

  initial.events.completed_key_events.alice_greenhouse_maintenance_proposal = 'doll_maintenance_plan_registered';
  progress = rules.tutorialProgress(initial);
  assert.equal(progress.currentStep.id, 'select-form');

  const controller = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  const document = await read('../src/ui/index.html');
  const bridge = await read('../src/ui/bridge.ts');
  const map = await read('../src/ui/garden-map.ts');
  assert.match(document, /id="gg-tutorial-guide"/);
  assert.match(document, /id="gg-tutorial-guide-skip">快进并完成教程/);
  assert.match(controller, /TUTORIAL_GUIDE_ROUTES/);
  assert.match(controller, /boundary:\s*\{ targetId: 'reimu'[\s\S]*actionIds: \['inspect_boundary'\]/);
  assert.match(controller, /'main-house':\s*\{ targetId: 'main_house'[\s\S]*actionIds: \['repair'\]/);
  assert.match(controller, /'magic-trace':\s*\{ targetId: 'greenhouse_plot'[\s\S]*actionIds: \['investigate_magic_trace'\]/);
  assert.match(controller, /inspiration:[\s\S]*investigate_growth[\s\S]*hear_marisa_plan[\s\S]*study_grandfather_blueprint/);
  assert.match(controller, /await runTestJump\('m2_open_garden'\)/);
  assert.match(controller, /localStorage\.setItem\(tutorialGuideStorageKey, '1'\)/);
  assert.match(controller, /title: '开放庭园玩法说明'/);
  assert.match(controller, /符卡副本获得金币，购买搭建设施吸引 NPC 互动。/);
  assert.match(controller, /道具会添加额外玩法；每个角色都可以自由挑战。/);
  assert.match(controller, /新手教程已快进至完成；开放庭园已经解锁，现有资源保持不变。/);
  assert.match(controller, /button\.dataset\.actionId = options\.action\.id/);
  assert.match(controller, /const actionStep = currentView !== 'garden'[\s\S]*TUTORIAL_GUIDE_ROUTES\[item\.id\]\?\.actionIds\.includes\(activeActionId\)/);
  assert.match(bridge, /events: \{ completed_key_events: \{\} \}/);
  assert.match(bridge, /const previewAction = localSettlementAction\(text, previewState\)/);
  assert.match(bridge, /applyLocalSettlement\(staged, previewAction, assistantMessageId, assistantText\)/);
  assert.match(map, /setTutorialTarget\(id: string \| null\)/);
  assert.match(map, /this\.tutorialTargetId === id/);
  assert.match(styles, /\.gg-tutorial-guide \{[\s\S]*?position: fixed/);
  assert.match(styles, /\.gg-tutorial-guide \{[\s\S]*?bottom: max\(20px, env\(safe-area-inset-bottom\)\);[\s\S]*?left: 50%;[\s\S]*?transform: translateX\(-50%\);/);
  assert.match(styles, /@media \(max-width: 700px\) \{[\s\S]*?\.gg-tutorial-guide \{[\s\S]*?transform: none;/);
  assert.match(styles, /\.gg-tutorial-focus \{[\s\S]*?outline: 3px solid #f3c86c/);
  assert.match(controller, /className = 'gg-tutorial-current'/);
  assert.match(controller, /progress\.value = panel\.tutorial\.completedCount/);
  assert.match(controller, /step\.completed \? 'complete'/);
  assert.match(controller, /className = 'gg-opportunity-section gg-opportunity-facilities'/);
  assert.match(controller, /className = 'gg-opportunity-facility-grid'/);
  assert.match(controller, /className = 'gg-opportunity-section gg-opportunity-invites'/);
  assert.match(controller, /className = 'gg-opportunity-invite-grid'/);
  assert.match(controller, /className = 'gg-opportunity-invite-feedback'/);
  assert.match(controller, /result\.invitationOutcome === 'reschedule'[\s\S]*?title: '已改约到之后的时段'/);
  assert.match(controller, /feedback\.setAttribute\('role', 'status'\)/);
  assert.match(controller, /querySelectorAll<HTMLDetailsElement>\('details\[data-opportunity-drawer\]\[open\]'\)/);
  assert.match(controller, /createElement\('details'\)[\s\S]*?dataset\.opportunityDrawer = 'facilities'[\s\S]*?open = expandedDrawers\.has\('facilities'\)/);
  assert.match(controller, /createElement\('details'\)[\s\S]*?dataset\.opportunityDrawer = 'invites'[\s\S]*?open = expandedDrawers\.has\('invites'\)/);
  assert.match(controller, /name\.textContent = characterName\(characterId\)/);
  const opportunityRenderer = controller.match(/function renderOpportunities\(\) \{[\s\S]*?\n\}\n\nasync function runFacilityBuild/)?.[0] ?? '';
  assert.doesNotMatch(opportunityRenderer, /gg-shop-(?:item|list)/);
  assert.match(styles, /\.gg-tutorial-steps li\[data-state="current"\]/);
  assert.match(styles, /\.gg-opportunity-invite-feedback \{[\s\S]*?border-left-width: 5px/);
  assert.match(styles, /\.gg-opportunity-invite-feedback\[data-tone="accepted"\]/);
  assert.match(styles, /\.gg-opportunity-invite-feedback\[data-tone="declined"\],[\s\S]*?\.gg-opportunity-invite-feedback\[data-tone="error"\]/);
  assert.match(styles, /\.gg-opportunity-facility \{[\s\S]*?background: linear-gradient\(150deg, #f2dfbb, #dcbf91\);[\s\S]*?color: #452b24;/);
  assert.match(styles, /\.gg-opportunity-invite \{[\s\S]*?color: #4f3027;/);
  assert.match(styles, /details\.gg-opportunity-section > \.gg-opportunity-section-header \{[\s\S]*?cursor: pointer;[\s\S]*?list-style: none;/);
  assert.match(styles, /details\.gg-opportunity-section:not\(\[open\]\) > \.gg-opportunity-section-header \{[\s\S]*?margin-bottom: 0;/);
  assert.match(styles, /@media \(max-width: 520px\) \{[\s\S]*?\.gg-opportunity-facility-grid \{ grid-template-columns: 1fr;[\s\S]*?\.gg-opportunity-invite-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /@media \(max-width: 360px\) \{[\s\S]*?\.gg-opportunity-invite-grid \{ grid-template-columns: 1fr;/);
});

test('三张玩法入口使用大型平滑插画并同时进入预览与内嵌构建', async () => {
  const document = await read('../src/ui/index.html');
  const controller = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  const build = await read('../scripts/build-ui.mjs');
  const assetManifest = JSON.parse(await read('../src/assets/asset-manifest.json'));
  const host = await read('../src/runtime/ui-host-shell.js');
  assert.match(document, /id="gg-open-shop"[^>]*aria-label="打开灵梦小店"/);
  assert.match(document, /id="gg-shop-button-image"/);
  assert.match(controller, /dataset\.shopButtonSrc/);
  assert.match(controller, /reimu-shop-button-v1\.png/);
  assert.match(styles, /\.gg-launcher-dialog #gg-open-shop img/);
  assert.match(styles, /\.gg-launcher-dialog #gg-open-dungeon img,[\s\S]*?image-rendering: auto/);
  assert.match(build, /shopButtonDataUrl/);
  assert.match(build, /requiredUiSource\('shop_button', 'entry-button'\)/);
  assert.equal(assetManifest.ui_assets.shop_button.source_alpha, 'ui/reimu-shop-button-v1.webp');
  assert.match(host, /dataset\.shopButtonSrc = embedded\.shopButtonDataUrl/);
  assert.match(document, /id="gg-open-inventory"[^>]*aria-label="打开背包"[\s\S]*?id="gg-inventory-button-image"/);
  assert.match(controller, /const inventoryButtonSource[\s\S]*?marisa-inventory-button-v1\.png/);
  assert.match(controller, /inventoryButtonImage\.src = inventoryButtonSource/);
  assert.match(styles, /\.gg-launcher-dialog #gg-open-inventory img/);
  assert.match(build, /inventoryButtonDataUrl/);
  assert.match(build, /requiredUiSource\('inventory_button', 'entry-button'\)/);
  assert.equal(assetManifest.ui_assets.inventory_button.source_alpha, 'ui/marisa-inventory-button-v1.webp');
  assert.match(host, /dataset\.inventoryButtonSrc = embedded\.inventoryButtonDataUrl/);
  assert.match(document, /id="gg-open-dungeon"[^>]*aria-label="打开符卡副本"[\s\S]*?id="gg-dungeon-button-image"/);
  assert.match(controller, /const dungeonButtonSource[\s\S]*?reimu-dungeon-button-v1\.png/);
  assert.match(controller, /dungeonButtonImage\.src = dungeonButtonSource/);
  assert.match(styles, /\.gg-launcher-dialog #gg-open-dungeon img/);
  assert.match(build, /dungeonButtonDataUrl/);
  assert.match(build, /requiredUiSource\('dungeon_button', 'entry-button'\)/);
  assert.equal(assetManifest.ui_assets.dungeon_button.source_alpha, 'ui/reimu-dungeon-button-v1.webp');
  assert.match(host, /dataset\.dungeonButtonSrc = embedded\.dungeonButtonDataUrl/);
});

test('开场光源离开画面时原地淡出，不再飞向左上角', async () => {
  const controller = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  const pointerLeave = controller.match(/openingRoot\.addEventListener\('pointerleave',[\s\S]*?\n\s*\}\);/)?.[0] ?? '';
  assert.match(controller, /cursorGlow\.style\.opacity = '1'/);
  assert.match(pointerLeave, /cursorGlow\.style\.opacity = '0'/);
  assert.doesNotMatch(pointerLeave, /transform|-999/);
  assert.match(styles, /\.gg-cursor-glow \{[\s\S]*?opacity: 0;[\s\S]*?transition: opacity \.12s ease-out;/);
});

test('灵梦小店底图、十槽商品层和窄屏回流共同进入构建', async () => {
  const document = await read('../src/ui/index.html');
  const controller = await read('../src/ui/app.ts');
  const view = await read('../src/ui/shop-view.ts');
  const styles = await read('../src/ui/styles.css');
  const build = await read('../scripts/build-ui.mjs');
  const assetManifest = JSON.parse(await read('../src/assets/asset-manifest.json'));
  const host = await read('../src/runtime/ui-host-shell.js');
  assert.match(document, /id="gg-shop-background"/);
  assert.match(controller, /dataset\.shopBackgroundSrc/);
  assert.match(view, /className = 'gg-shop-tabs'/);
  assert.match(view, /className = 'gg-shop-item-select'/);
  assert.match(view, /className = 'gg-shop-wallet'/);
  assert.match(view, /className = 'gg-shop-item gg-shop-item-empty'/);
  assert.match(view, /Math\.max\(0, PAGE_SIZE - pageItems\.length\)/);
  assert.match(view, /const PAGE_SIZE = 10;/);
  assert.match(view, /className = 'gg-shop-pager'/);
  assert.match(styles, /\.gg-shop-pager \{[^}]*top: 72\.35%/s);
  assert.match(view, /toLocaleString\('zh-CN'\)/);
  assert.match(view, /aria-pressed/);
  assert.match(styles, /\.gg-shop-detail/);
  assert.match(styles, /--gg-shop-pixel-font/);
  assert.match(styles, /\.gg-shop-tabs button\[aria-pressed="true"\]/);
  assert.match(styles, /radial-gradient\(circle at 50% 24%/);
  assert.match(styles, /clip-path: polygon\(7px 0/);
  assert.match(styles, /\.gg-shop-buy, \.gg-shop-sell, \.gg-shop-leave \{[^}]*top: 77\.35%[^}]*height: 13\.1%[^}]*transform: none/s);
  assert.match(styles, /\.gg-shop-buy:active:not\(:disabled\), \.gg-shop-leave:active:not\(:disabled\) \{[^}]*transform: none/s);
  assert.match(styles, /\.gg-shop-status \{[^}]*top: 92\.25%/s);
  assert.match(styles, /@media \(max-width: 620px\)/);
  assert.match(build, /requiredUiSource\('shop_background', 'shop-background'\)/);
  assert.equal(assetManifest.ui_assets.shop_background.source_alpha, 'ui/reimu-shop-ui-background-v1.webp');
  assert.match(build, /shopBackgroundDataUrl/);
  assert.match(host, /dataset\.shopBackgroundSrc = embedded\.shopBackgroundDataUrl/);
});

test('庭园地图只读取访客快照，不渲染玩家占位小人', async () => {
  const source = await read('../src/ui/garden-map.ts');
  assert.match(source, /present_character_ids/);
  assert.match(source, /intentionally no player marker/);
  assert.match(source, /actorLabels\.set\(id, actor\.label\)/);
  assert.match(source, /this\.state\.characters\?\.\[id\]\?\.name \?\? this\.actorLabels\.get\(id\) \?\? id/);
  assert.doesNotMatch(source, /state\.player/);
});

test('七名验收序列优先运行并保留旧图集回退，魔理沙继续使用 V2 图集', async () => {
  const map = await read('../src/ui/garden-map.ts');
  const actor = await read('../src/ui/sprite-actor.ts');
  const registry = await read('../src/ui/character-sprite-registry.ts');
  const build = await read('../scripts/build-ui.mjs');
  const host = await read('../src/runtime/ui-host-shell.js');
  assert.match(map, /new SpriteActor\(\s*id,\s*actor/);
  assert.match(map, /requestAnimationFrame/);
  assert.match(map, /visibilitychange/);
  assert.match(actor, /SpriteMotion = 'idle' \| 'walk'/);
  assert.match(actor, /prefers-reduced-motion|reducedMotion/);
  assert.match(actor, /facingCell/);
  assert.match(actor, /facingRow/);
  assert.match(actor, /motionImageReady/);
  assert.match(actor, /resolveRenderFrame/);
  assert.match(actor, /columns: useMotionSheet \? 4 : 2/);
  assert.match(actor, /resolveV2Cell/);
  assert.match(actor, /sequenceImageReady/);
  assert.match(actor, /resolveSequenceCell/);
  assert.match(actor, /frameDurationMs/);
  for (const id of ['reimu', 'marisa', 'cirno', 'alice', 'mystia', 'suika', 'nitori', 'sakuya']) {
    assert.match(registry, new RegExp(`${id}: \\{`));
  }
  assert.match(registry, /mystia-turnaround-v2\.png/);
  assert.match(registry, /marisa-hover-cycle-v1\.png/);
  assert.match(registry, /marisa-animation-v2-r2\.png/);
  assert.match(registry, /reimu-animation-v2-r6\.png/);
  for (const id of ['reimu', 'cirno', 'alice', 'mystia', 'suika', 'nitori', 'sakuya']) {
    assert.match(registry, new RegExp(`${id}-animation-sequence-approved-v1\\.png`));
  }
  assert.match(build, /asset-manifest\.json/);
  assert.match(build, /animation_source_alpha/);
  assert.match(build, /animation_sequence_source_alpha/);
  assert.match(build, /characterSpriteDataUrls/);
  assert.doesNotMatch(build, /animation_source_chroma/);
  assert.match(host, /characterSpriteDataUrls/);
  assert.match(host, /MotionSrc/);
  assert.match(host, /AnimationSrc/);
  assert.match(host, /SequenceSrc/);
});

test('可变长序列按方向行、独立速度和完整循环区间选帧', async () => {
  const actor = await importTypescript('../src/ui/sprite-actor.ts');
  const sequence = { columns: 17, rows: 4, frameDurationMs: 100, loopStart: 0, loopEnd: 16 };
  assert.deepEqual(actor.resolveSequenceCell(sequence, 'idle', 'back', 9999), { frame: 0, row: 1 });
  assert.deepEqual(actor.resolveSequenceCell(sequence, 'walk', 'front', 0), { frame: 0, row: 0 });
  assert.deepEqual(actor.resolveSequenceCell(sequence, 'walk', 'left', 1600), { frame: 16, row: 2 });
  assert.deepEqual(actor.resolveSequenceCell(sequence, 'walk', 'right', 1700), { frame: 0, row: 3 });
});

test('动作图回退在静止时固定方向首帧，不播放待机循环或程序化呼吸', async () => {
  const actor = await importTypescript('../src/ui/sprite-actor.ts');
  const sequence = { columns: 25, rows: 4, frameDurationMs: 90, loopStart: 0, loopEnd: 24 };
  for (const [facing, row] of [['front', 0], ['back', 1], ['left', 2], ['right', 3]]) {
    assert.deepEqual(actor.resolveSequenceCell(sequence, 'idle', facing, 99999), { frame: 0, row });
  }
  assert.deepEqual(actor.resolveV2Cell('idle', 'front', 99999, 148), { frame: 0, row: 1 });
  assert.deepEqual(actor.resolveV2Cell('idle', 'back', 99999, 148), { frame: 4, row: 0 });
  assert.deepEqual(actor.resolveV2Cell('idle', 'left', 99999, 148), { frame: 0, row: 2 });
  assert.deepEqual(actor.resolveV2Cell('idle', 'right', 99999, 148), { frame: 0, row: 3 });
  const source = await read('../src/ui/sprite-actor.ts');
  assert.doesNotMatch(source, /idleBob|idleBreath|idleCycle/);
  assert.doesNotMatch(source, /520\) % 4/);
});

test('角色随机巡游生成上下左右四方向的单轴目标，并始终留在椭圆范围内', async () => {
  const actor = await importTypescript('../src/ui/sprite-actor.ts');
  const radius = { x: 0.04, y: 0.026 };
  const expected = [
    [0, 'left'],
    [0.26, 'right'],
    [0.51, 'back'],
    [0.76, 'front'],
  ];
  for (const [choice, facing] of expected) {
    const values = [choice, 0.5];
    const move = actor.chooseWanderMove({ x: 0, y: 0 }, radius, 0.012, 0.035, undefined, () => values.shift());
    assert.equal(move.facing, facing);
    if (facing === 'left' || facing === 'right') assert.equal(move.target.y, 0);
    else assert.equal(move.target.x, 0);
    assert.ok((move.target.x / radius.x) ** 2 + (move.target.y / radius.y) ** 2 <= 1 + Number.EPSILON);
  }
});

test('不可行走蒙版检查脚底体积与完整路径，而不是只看终点', async () => {
  const navigation = await importTypescript('../src/ui/garden-navigation.ts');
  const sampler = {
    width: 100,
    height: 100,
    isBlocked: ({ x, y }) => x >= .48 && x <= .52 && y >= .35 && y <= .65,
  };
  assert.equal(
    navigation.isRouteWalkable(sampler, { x: .2, y: .5 }, { x: .8, y: .5 }, { x: .01, y: .01 }, 4),
    false,
  );
  assert.equal(
    navigation.isRouteWalkable(sampler, { x: .2, y: .2 }, { x: .8, y: .2 }, { x: .01, y: .01 }, 4),
    true,
  );
  assert.equal(
    navigation.isFootprintBlocked(sampler, { x: .47, y: .5 }, { x: .02, y: .01 }),
    true,
  );
  assert.equal(navigation.footprintSamples({ x: .5, y: .5 }).length, 9);
});

test('同区域多人位置按角色 ID 稳定分槽，顺序变化不会绕过蒙版', async () => {
  const map = await importTypescript('../src/ui/garden-map.ts');
  const areaFor = () => 'central_courtyard';
  assert.deepEqual(
    map.resolveCharacterSlot('reimu', ['reimu', 'marisa'], areaFor),
    map.resolveCharacterSlot('reimu', ['marisa', 'reimu'], areaFor),
  );
  assert.notDeepEqual(
    map.resolveCharacterSlot('reimu', ['reimu', 'marisa'], areaFor),
    map.resolveCharacterSlot('marisa', ['reimu', 'marisa'], areaFor),
  );
});

test('随机巡游会重试被蒙版拒绝的路线，十二次失败后留在原地休息', async () => {
  const source = await read('../src/ui/sprite-actor.ts');
  assert.match(source, /for \(let attempt = 0; attempt < 12; attempt \+= 1\)/);
  assert.match(source, /this\.canTravel\(start, candidate\.target\)/);
  assert.match(source, /if \(!move\) \{[\s\S]*?this\.phaseRemaining = this\.randomBetween\(this\.config\.restDurationMs\)/);
});

test('默认巡游使用更长单段距离和相应扩大的活动范围', async () => {
  const registry = await read('../src/ui/character-sprite-registry.ts');
  assert.match(registry, /travelDistanceMin: 0\.045/);
  assert.match(registry, /travelDistanceMax: 0\.12/);
  assert.match(registry, /travelRadiusY: 0\.105/);
  assert.match(registry, /travelRadiusY: 0\.12/);
  const radii = [...registry.matchAll(/travelRadius: (0\.\d+)/g)].map((match) => Number(match[1]));
  assert.equal(radii.length, 8);
  assert.ok(radii.every((radius) => radius >= 0.145));
  assert.ok(Math.max(...radii) >= 0.17);
});

test('角色完成一次二维移动后强制休息，状态刷新不会覆盖巡游朝向', async () => {
  const actorModule = await importTypescript('../src/ui/sprite-actor.ts');
  const PreviousImage = globalThis.Image;
  globalThis.Image = class {
    naturalWidth = 1;
    naturalHeight = 1;
    complete = true;
    set src(value) { this.value = value; this.onload?.(); }
  };
  try {
    const randomValues = [0.99, 0, 0];
    const sprite = new actorModule.SpriteActor('test', {
      label: '测试角色', idleSource: 'idle.png', motionSource: 'walk.png', movementStyle: 'walk',
      frameDurationMs: 100, motionBob: 0, motionSway: 0, travelSpeed: 0.000012,
      travelRadius: 0.04, travelRadiusY: 0.026, travelDistanceMin: 0.012, travelDistanceMax: 0.035,
      restDurationMs: [1000, 1000], turnDurationMs: [50, 50], settleDurationMs: [100, 100],
    }, () => {}, () => randomValues.shift() ?? 0);
    sprite.sync({ area_id: 'central_courtyard', facing: 'left' }, false, true);
    sprite.update(1000);
    assert.equal(sprite.facing, 'front');
    assert.equal(sprite.motion, 'idle');
    sprite.sync({ area_id: 'central_courtyard', facing: 'right' }, false, true);
    assert.equal(sprite.facing, 'front');
    sprite.update(50);
    assert.equal(sprite.motion, 'walk');
    sprite.update(1000);
    assert.equal(sprite.motion, 'idle');
    assert.equal(sprite.offsetX, 0);
    assert.ok(sprite.offsetY > 0);
    const stoppedAt = sprite.offsetY;
    sprite.update(100);
    sprite.update(999);
    assert.equal(sprite.offsetY, stoppedAt);
    assert.equal(sprite.motion, 'idle');
  } finally {
    globalThis.Image = PreviousImage;
  }
});

test('角色休息、转向和收步优先使用四方向静态待机图，动作图只作加载失败回退', async () => {
  const actorModule = await importTypescript('../src/ui/sprite-actor.ts');
  const PreviousImage = globalThis.Image;
  globalThis.Image = class {
    naturalWidth = 2;
    naturalHeight = 2;
    complete = true;
    set src(value) { this.value = value; this.onload?.(); }
  };
  try {
    const sprite = new actorModule.SpriteActor('idle-test', {
      label: '待机测试', idleSource: 'turnaround.png', motionSource: 'walk.png', movementStyle: 'walk',
      frameDurationMs: 100, motionBob: 0, motionSway: 0, travelSpeed: 0.000012,
      travelRadius: 0.04, travelRadiusY: 0.026, travelDistanceMin: 0.012, travelDistanceMax: 0.035,
      restDurationMs: [1000, 1000], turnDurationMs: [50, 50], settleDurationMs: [100, 100],
    }, () => {}, () => 0);
    const expected = {
      front: { frame: 0, row: 0 },
      back: { frame: 1, row: 0 },
      left: { frame: 0, row: 1 },
      right: { frame: 1, row: 1 },
    };
    for (const [facing, cell] of Object.entries(expected)) {
      sprite.facing = facing;
      sprite.motion = 'idle';
      const renderFrame = sprite.resolveRenderFrame();
      assert.equal(renderFrame.image, sprite.idleImage);
      assert.deepEqual({ frame: renderFrame.frame, row: renderFrame.row }, cell);
      assert.equal(renderFrame.animated, false);
    }
    sprite.imageReady = false;
    sprite.animationImageReady = true;
    sprite.animationImage.naturalWidth = 18;
    const fallback = sprite.resolveRenderFrame();
    assert.equal(fallback.image, sprite.animationImage);
  } finally {
    globalThis.Image = PreviousImage;
  }
});

test('待机四视图按实测变换与移动帧统一视觉尺寸和脚底线', async () => {
  const actor = await importTypescript('../src/ui/sprite-actor.ts');
  assert.deepEqual(actor.resolveSpriteDrawRect(100), { x: -50, y: -82, width: 100, height: 100 });
  assert.deepEqual(
    actor.resolveSpriteDrawRect(100, { scale: 0.8, x: -0.4, y: -0.7 }),
    { x: -40, y: -70, width: 80, height: 80 },
  );
  const registry = await read('../src/ui/character-sprite-registry.ts');
  for (const id of ['reimu', 'marisa', 'cirno', 'alice', 'mystia', 'suika', 'nitori', 'sakuya']) {
    assert.match(registry, new RegExp(`idleFrameTransforms: turnaroundFits\\.${id}`));
  }
  assert.match(registry, /cirno: idleFits\(\[\.6657, -\.3911, -\.6657\], \[\.6945, -\.3022, -\.6945\], \[\.7494, -\.415, -\.6502\], \[\.7494, -\.2927, -\.6502\]\)/);
  assert.match(await read('../src/ui/app.ts'), /new AssetPreloader\(scheduledAssets, \{[\s\S]*?maxAttempts: 8/);
});

test('琪露诺移动帧按方向提亮且不影响待机图', async () => {
  const actor = await read('../src/ui/sprite-actor.ts');
  const registry = await read('../src/ui/character-sprite-registry.ts');
  assert.match(actor, /motionFrameBrightness\?: Record<SpriteFacing, number>/);
  assert.match(actor, /motionFrameTransforms\?: Record<SpriteFacing, SpriteFrameTransform>/);
  assert.match(actor, /transform: this\.motion === 'walk' \? this\.config\.motionFrameTransforms\?\.\[this\.facing\] : undefined/);
  assert.match(actor, /brightness: this\.motion === 'walk' \? this\.config\.motionFrameBrightness\?\.\[this\.facing\] : undefined/);
  assert.match(actor, /brightness: useMotionSheet \? this\.config\.motionFrameBrightness\?\.\[this\.facing\] : undefined/);
  assert.match(actor, /context\.filter = brightness === undefined \? 'none' : `brightness\(\$\{brightness\}\)`/);
  assert.match(registry, /const cirnoMotionBrightness:[\s\S]*?front: 1\.39,[\s\S]*?back: 1\.56,[\s\S]*?left: 1\.47,[\s\S]*?right: 1\.47/);
  assert.match(registry, /cirno: \{[\s\S]*?motionFrameBrightness: cirnoMotionBrightness/);
  assert.match(registry, /const cirnoMotionFits = idleFits\([\s\S]*?\[\.8719, -\.436, -\.7342\],[\s\S]*?\[\.9042, -\.4521, -\.7614\],[\s\S]*?\[1, -\.5, -\.8517\],[\s\S]*?\[1, -\.5, -\.8469\]/);
  assert.match(registry, /cirno: \{[\s\S]*?motionFrameTransforms: cirnoMotionFits/);
  for (const id of ['reimu', 'marisa', 'alice', 'mystia', 'suika', 'nitori', 'sakuya']) {
    const definition = registry.match(new RegExp(`${id}: \\{([\\s\\S]*?)\\n  \\},`))?.[1] ?? '';
    assert.doesNotMatch(definition, /motionFrameBrightness/);
  }
});

test('庭园地图滚轮缩放不被绘制尺寸抵消，并保持指针锚点', async () => {
  const source = await read('../src/ui/garden-map.ts');
  const styles = await read('../src/ui/styles.css');
  assert.match(source, /const mapSize = this\.mapDrawSize\(\)/);
  assert.match(source, /const drawWidth = mapSize\.width/);
  assert.doesNotMatch(source, /const viewWidth = width \/ this\.camera\.zoom/);
  assert.match(source, /const worldX = \(point\.x - this\.canvas\.width \/ 2 - this\.camera\.x\) \/ previousZoom/);
  assert.match(source, /this\.camera\.x = point\.x - this\.canvas\.width \/ 2 - worldX \* nextZoom/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /canvas\.dataset\.zoom = this\.camera\.zoom\.toFixed\(3\)/);
  assert.match(source, /if \(this\.canvas\.width === width && this\.canvas\.height === height\) return/);
  assert.match(styles, /\.gg-map-shell \{[^}]*height: clamp\(420px, 62vh, 620px\)/);
  assert.match(styles, /#gg-garden-map \{[^}]*height: 100%; min-height: 0/);
  assert.doesNotMatch(styles, /#gg-garden-map \{[^}]*min-height: 480px/);
});

test('庭园地图支持双指捏合缩放，并保持手指中点锚点', async () => {
  const source = await read('../src/ui/garden-map.ts');
  assert.match(source, /private readonly activePointers = new Map<number, Point>/);
  assert.match(source, /pinchDistance = Math\.max\(1, Math\.hypot\(a\.x - b\.x, a\.y - b\.y\)\)/);
  assert.match(source, /pinchMidpoint = \{ x: \(a\.x \+ b\.x\) \/ 2/);
  assert.match(source, /activePointers\.set\(event\.pointerId, point\)/);
  assert.match(source, /setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /private beginPinch\(\)/);
  assert.match(source, /private updatePinch\(\)/);
  assert.match(source, /Math\.min\(2, Math\.max\(1, previousZoom \* \(distance \/ this\.pinchDistance\)\)/);
  assert.match(source, /this\.camera\.x = midpoint\.x - this\.canvas\.width \/ 2 - worldX \* nextZoom/);
  assert.match(source, /this\.pinchMoved/);
});

test('地图相机具有软边界、拖拽阻力和减少动态效果回退', async () => {
  const map = await importTypescript('../src/ui/garden-map.ts');
  const source = await read('../src/ui/garden-map.ts');
  const size = map.resolveCoveredMapSize(390, 700, 1672, 1722);
  assert.equal(size.height, 700);
  assert.ok(size.width > 679 && size.width < 680);
  assert.deepEqual(map.resolveCameraBounds(390, 700, size.width, size.height, 1), {
    minX: -(size.width - 390) / 2,
    maxX: (size.width - 390) / 2,
    minY: 0,
    maxY: 0,
  });
  assert.deepEqual(map.resolveCameraBounds(390, 700, size.width, size.height, 2), {
    minX: -(size.width - 195),
    maxX: size.width - 195,
    minY: -350,
    maxY: 350,
  });
  const overscrolled = map.rubberBandAxis(180, -100, 100, 60);
  assert.ok(overscrolled > 100 && overscrolled < 160);
  assert.equal(map.rubberBandAxis(40, -100, 100, 60), 40);
  assert.equal(map.resolveAxisOverscrollLimit(0, 0, 1, 700), 16);
  assert.equal(map.resolveAxisOverscrollLimit(0, 0, 2, 1400), 32);
  assert.equal(map.resolveAxisOverscrollLimit(-400, 400, 1, 390), 48);
  assert.match(source, /updateCameraSpring\(delta\)/);
  assert.match(source, /stiffness = 180/);
  assert.match(source, /damping = 18/);
  assert.match(source, /this\.reducedMotion\.matches/);
  assert.match(source, /Math\.max\(1, previousZoom \* factor\)/);
  assert.match(source, /canvas\.dataset\.cameraLimitX/);
  assert.match(source, /const overscrollLimitY = resolveAxisOverscrollLimit/);
  assert.match(source, /edgeFill\.addColorStop/);
});

test('人物响应式缩放同步命中、标签与多人间距', async () => {
  const map = await importTypescript('../src/ui/garden-map.ts');
  const source = await read('../src/ui/garden-map.ts');
  assert.equal(map.resolveCharacterViewportScale(320), 1.18);
  assert.equal(map.resolveCharacterViewportScale(360), 1.18);
  assert.equal(map.resolveCharacterViewportScale(390), 1.12);
  assert.equal(map.resolveCharacterViewportScale(520), 1.12);
  assert.equal(map.resolveCharacterViewportScale(521), 1);
  assert.equal(map.resolveCharacterViewportScale(0), 1);
  assert.equal(map.resolveCharacterLayoutScale(320), 1.08);
  assert.equal(map.resolveCharacterLayoutScale(390), 1.04);
  assert.equal(map.resolveCharacterLayoutScale(521), 0.92);
  assert.match(source, /canvas\.dataset\.characterScale = characterViewportScale\.toFixed\(2\)/);
  assert.match(source, /canvas\.dataset\.characterEffectiveScale = \(CHARACTER_VISUAL_SCALE \* characterViewportScale\)\.toFixed\(2\)/);
  assert.match(source, /spriteSize = [\s\S]*?CHARACTER_VISUAL_SCALE[\s\S]*?characterViewportScale/);
  assert.match(source, /drawLabel\(ctx, x, y \+ 28 \* px \* characterLayoutScale, label\)/);
  assert.match(source, /resolveCharacterHitGeometry\(spriteSize, 22 \* px\)/);
  assert.match(source, /hitCenter: \{ x, y: y \+ hitGeometry\.offsetY \}/);
  assert.match(source, /characterSpacingScale = characterLayoutScale/);
  assert.match(source, /resolveCharacterSlot\(id, present/);
  assert.match(source, /CHARACTER_FOOT_OFFSET_Y/);
});

test('所有者提供的 v4 拼接庭园底图由素材清单驱动，人物比例保持稳定', async () => {
  const manifest = await read('../src/assets/asset-manifest.json');
  const build = await read('../scripts/build-ui.mjs');
  const map = await read('../src/ui/garden-map.ts');
  const spatial = await read('../src/ui/garden-spatial.ts');
  assert.match(manifest, /garden-base-owner-v4\.webp/);
  assert.match(manifest, /"canvas": \[1672, 1722\]/);
  assert.match(manifest, /"runtime_role": "base-layer"/);
  assert.match(manifest, /"facility_layer_policy": "v3-transparent-sprites-with-damaged-ruin-replacements-integrated"/);
  assert.match(build, /assetManifest\.maps\?\.garden_base/);
  assert.match(build, /gardenBaseAsset\.source/);
  assert.match(map, /CHARACTER_VISUAL_SCALE = 0\.64/);
  assert.match(map, /FACILITY_VISUAL_SCALE = 0\.76/);
  assert.match(spatial, /GARDEN_AREA_OUTLINES[^=]*= Object\.freeze\(\{\}\)/);
});

test('庭园不可行走蒙版与底图同画布，并进入预览和自包含运行链', async () => {
  const manifest = JSON.parse(await read('../src/assets/asset-manifest.json'));
  const mask = await read('../src/assets/maps/garden-no-walk-mask-v1.svg');
  const build = await read('../scripts/build-ui.mjs');
  const host = await read('../src/runtime/ui-host-shell.js');
  const app = await read('../src/ui/app.ts');
  const map = await read('../src/ui/garden-map.ts');
  assert.deepEqual(manifest.maps.garden_no_walk_mask.canvas, manifest.maps.garden_base.canvas);
  assert.equal(manifest.maps.garden_no_walk_mask.runtime_role, 'non-walkable-alpha-mask');
  assert.match(mask, /width="1672" height="1722" viewBox="0 0 1672 1722"/);
  assert.match(mask, /fill="#ff00ff"/);
  assert.match(mask, /fill-rule="evenodd"/);
  assert.match(build, /mapNoWalkMaskSrc: previewAssetUrl/);
  assert.match(build, /mapNoWalkMaskDataUrl/);
  assert.match(host, /dataset\.mapNoWalkMaskSrc/);
  assert.match(app, /dataset\.mapNoWalkMaskSrc/);
  assert.match(map, /navigationMask\.isRouteWalkable/);
  assert.match(map, /canvas\.dataset\.navigationMask/);
  assert.match(map, /canvas\.dataset\.navigationSamples/);
});

test('v3 底图启用同画布透明设施，并以共享废墟替换三组 damaged 形态', async () => {
  const manifest = JSON.parse(await read('../src/assets/asset-manifest.json'));
  const ruinReport = JSON.parse(await read('../project/shared-facility-ruin-report.json'));
  const build = await read('../scripts/build-ui.mjs');
  const preparation = await read('../scripts/prepare-shared-facility-ruins.py');
  const host = await read('../src/runtime/ui-host-shell.js');
  const map = await read('../src/ui/garden-map.ts');
  const expectedForms = {
    magic_greenhouse: ['基础魔法温室', '自由生长型温室', '人偶维护型温室', '河童自动化型温室'],
    fairy_garden: ['四季花境', '妖精游乐庭', '冰露迷宫'],
    moon_spring: ['露天月见汤', '静水观测池', '雾隐汤屋'],
    banquet_plaza: ['灯火夜市', '鬼之大宴台', '符卡演武场'],
  };
  const expectedCanvases = {
    magic_greenhouse: [608, 528],
    fairy_garden: [592, 464],
    moon_spring: [624, 464],
    banquet_plaza: [656, 464],
  };
  const expectedRuins = {
    fairy_garden: 'world/map-facilities/fairy-garden/fairy-garden-ruins-v3.webp',
    moon_spring: 'world/map-facilities/moon-spring/moon-spring-ruins-v3.webp',
    banquet_plaza: 'world/map-facilities/banquet-plaza/banquet-plaza-ruins-v3.webp',
  };
  assert.equal(
    ruinReport.source_sha256,
    '9a00186d0694f44d4d8404f33291f5d31c2082a261cc437f3945ca78f0b5b1e7',
  );
  assert.match(preparation, /convert\("RGBa"\)\.resize/);
  assert.match(preparation, /transparent pixels retain hidden RGB/);
  for (const [id, forms] of Object.entries(expectedForms)) {
    const asset = manifest.map_facility_assets[id];
    assert.equal(asset.map_usage, true);
    assert.ok(asset.area_id);
    assert.deepEqual(Object.keys(asset.source_alpha), forms);
    assert.equal(asset.damage_overlay_alpha, undefined);
    if (id === 'magic_greenhouse') {
      assert.equal(asset.damage_replacement_alpha, undefined);
    } else {
      assert.equal(asset.damage_replacement_alpha, expectedRuins[id]);
      assert.equal(ruinReport.outputs[id].path, `src/assets/${expectedRuins[id].replace(/\.webp$/, '.png')}`);
    }
    const sources = [
      ...Object.values(asset.source_alpha),
      ...(asset.damage_replacement_alpha ? [asset.damage_replacement_alpha] : []),
    ];
    for (const source of sources) {
      assert.match(source, /-v3\.webp$/);
      const maintenanceSource = source.replace(/\.webp$/, '.png');
      const png = PNG.sync.read(await readBuffer(`../src/assets/${maintenanceSource}`));
      assert.deepEqual([png.width, png.height], expectedCanvases[id]);
      assert.equal(png.colorType, 6);
      let transparentRgbClean = true;
      let borderClean = true;
      for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
          const offset = (y * png.width + x) * 4;
          const alpha = png.data[offset + 3];
          if (alpha === 0 && (png.data[offset] || png.data[offset + 1] || png.data[offset + 2])) {
            transparentRgbClean = false;
          }
          if (x < 16 || x >= png.width - 16 || y < 16 || y >= png.height - 16) {
            if (alpha !== 0) borderClean = false;
          }
        }
      }
      assert.equal(transparentRgbClean, true);
      assert.equal(borderClean, true);
    }
  }
  assert.equal(manifest.map_facility_assets.main_house.map_usage, false);
  assert.equal(manifest.map_facility_assets.main_house.source_alpha, undefined);
  assert.equal(manifest.map_facility_assets.main_house.source_chroma, undefined);
  assert.deepEqual(manifest.map_facility_assets.main_house.archived_states, ['损坏', '临时修复', '启用']);
  assert.equal(
    manifest.map_facility_assets.main_house.archive_root,
    '旧素材/src/assets/world/map-facilities/main-house/',
  );
  assert.match(manifest.map_facility_assets.main_house.status, /^retired-from-map/);
  const spatial = await read('../src/ui/garden-spatial.ts');
  assert.match(spatial, /main_house:\s*\{\s*x:\s*0\.50,\s*y:\s*0\.235\s*\}/);
  for (const id of ['magic_greenhouse', 'fairy_garden', 'moon_spring', 'banquet_plaza']) {
    const geometry = manifest.map_facility_assets[id].geometry;
    assert.ok(geometry.width_ratio > 0.2 && geometry.width_ratio < 0.3);
    for (const point of [geometry.render_center, geometry.ground_anchor, geometry.label_anchor, ...geometry.hit_polygon]) {
      assert.equal(point.length, 2);
      assert.ok(point.every((coordinate) => coordinate >= 0 && coordinate <= 1));
    }
    assert.ok(geometry.hit_polygon.length >= 6);
    if (id === 'magic_greenhouse') {
      assert.match(manifest.map_facility_assets[id].status, /^owner-provided-v3-integrated-pending-runtime-validation/);
    } else {
      assert.match(manifest.map_facility_assets[id].status, /^owner-provided-v3-with-shared-ruin-integrated-pending-runtime-validation/);
    }
  }
  assert.match(build, /mapFacilityDataUrls/);
  assert.match(build, /areaId: facility\.area_id/);
  assert.match(build, /validateFacilityGeometry/);
  assert.match(build, /validateFacilityPngGroup/);
  assert.match(build, /不足 \$\{border\}px 透明安全边/);
  assert.match(build, /同组形态或损坏素材画布不一致/);
  assert.match(build, /damageReplacement: facility\.damage_replacement_alpha/);
  assert.match(build, /geometry: facility\.geometry/);
  assert.match(build, /mapFacilitySprites: JSON\.stringify/);
  assert.match(build, /gardenBaseAsset\.source/);
  assert.match(host, /mapFacilitySprites/);
  assert.match(map, /drawFacilityLayer/);
  assert.match(map, /resolveMapFacilitySprite/);
  assert.match(map, /geometry\?\.width_ratio/);
  assert.match(map, /facilityGeometryForArea/);
  assert.match(map, /geometry\.ground_anchor/);
  assert.match(map, /facilityGeometry\.label_anchor/);
  assert.match(map, /facilityGeometry\?\.hit_polygon/);
  assert.match(map, /item\.polygon && this\.targetContains/);
});

test('设施命中优先使用精确多边形，避免中央庭院的宽泛圆形抢占点击', async () => {
  const map = await importTypescript('../src/ui/garden-map.ts');
  const polygon = [
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 30, y: 30 },
    { x: 10, y: 30 },
  ];
  assert.equal(map.pointInPolygon({ x: 20, y: 20 }, polygon), true);
  assert.equal(map.pointInPolygon({ x: 40, y: 20 }, polygon), false);
});

test('设施菜单锚点随地图相机逐帧移动，不被固定安全区夹住', async () => {
  const map = await importTypescript('../src/ui/garden-map.ts');
  const canvas = { width: 1000, height: 500, clientWidth: 500 };
  const initial = map.resolveMapTargetAnchor({ x: 100, y: 50 }, { x: 0, y: 0, zoom: 1 }, canvas);
  const moved = map.resolveMapTargetAnchor({ x: 100, y: 50 }, { x: 80, y: -40, zoom: 1 }, canvas);
  assert.deepEqual(initial, { x: 300, y: 150 });
  assert.deepEqual(moved, { x: 340, y: 130 });

  const app = await read('../src/ui/app.ts');
  assert.match(app, /function positionTargetMenu[\s\S]*?Number\.isFinite\(anchor\.x\)[\s\S]*?--gg-anchor-x/);
  assert.doesNotMatch(app, /245 \* compensation/);
});

test('角色命中区上移覆盖整幅立绘，重叠时不会把头部点击漏给设施', async () => {
  const map = await importTypescript('../src/ui/garden-map.ts');
  assert.deepEqual(map.resolveCharacterHitGeometry(100, 22), {
    offsetY: -32,
    radius: 50,
  });
  assert.deepEqual(map.resolveCharacterHitGeometry(20, 22), {
    offsetY: -6.4,
    radius: 22,
  });

  const source = await read('../src/ui/garden-map.ts');
  assert.match(source, /item\.kind === 'character' && this\.targetContains/);
  assert.match(source, /const center = target\.hitCenter \?\? target/);
});

test('内置地图区域使用固定中文名，已建设施使用贴图透明边缘发光', async () => {
  const spatial = await importTypescript('../src/ui/garden-spatial.ts');
  const map = await read('../src/ui/garden-map.ts');
  assert.equal(spatial.gardenAreaLabel('fairy_garden_plot'), '妖精花园');
  assert.equal(spatial.gardenAreaLabel('moon_spring_plot'), '月见温泉');
  assert.equal(spatial.gardenAreaLabel('banquet_plaza_plot'), '宴会广场');
  assert.equal(spatial.gardenAreaLabel('custom_area', '自定义区域'), '自定义区域');
  assert.doesNotMatch(map, /area\.name \?\? id/);
  assert.match(map, /gardenAreaLabel\(id, area\.name\)/);
  assert.match(map, /if \(!facilitySprite\) this\.drawAreaOutlineGlow/);
  assert.match(map, /this\.drawFacilityImage\(ctx, image, x, y, width, height, active\)/);
  assert.match(map, /ctx\.shadowColor = `rgba\(255, 222, 128,/);
  assert.match(map, /ctx\.shadowBlur = \(14 \+ 5 \* pulse\) \* px/);
});

test('符卡副本使用会话内符卡之塔与响应式挑战层级', async () => {
  const document = await read('../src/ui/index.html');
  const app = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  assert.match(document, /SPELL CARD ARCHIVE · 幻想弹幕绘卷/);
  assert.match(document, /gg-dungeon-seal[^>]*>符</);
  assert.match(document, /gg-dungeon-footer/);
  for (const value of ['符卡之塔', '琪露诺', '爱丽丝', '十六夜咲夜']) assert.match(app, new RegExp(value));
  assert.match(app, /card\.dataset\.theme = entry\.theme/);
  assert.match(app, /gg-dungeon-meta/);
  assert.match(app, /aria-label', `挑战符卡之塔第 \$\{floor \+ 1\} 层：\$\{entry\.title\}`/);
  assert.match(app, /aria-label', `演练符卡之塔第 \$\{floor \+ 1\} 层：\$\{entry\.title\}`/);
  assert.match(styles, /#gg-dungeon-actions\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.gg-dungeon-entry\s*\{[^}]*width: min\(100%, 640px\)/);
  assert.match(styles, /\.gg-dungeon-entry\[data-theme="ice"\]/);
  assert.match(styles, /\.gg-dungeon-entry\[data-theme="forest"\]/);
  assert.match(styles, /\.gg-dungeon-entry\[data-theme="boundary"\]/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?#gg-dungeon-actions \{ grid-template-columns: 1fr; \}/);
});

test('设施贴图解析覆盖主屋状态、温室形态与 damaged 废墟替换', async () => {
  const map = await importTypescript('../src/ui/garden-map.ts');
  const mainHouse = { areaId: 'main_house', forms: { 损坏: 'house-damaged', 启用: 'house-restored' } };
  assert.deepEqual(map.resolveMapFacilitySprite({
    areas: { main_house: { unlocked: true, state: '损坏' } },
  }, 'main_house', mainHouse), { source: 'house-damaged', damageOverlay: undefined });

  const greenhouse = { areaId: 'greenhouse_plot', forms: { 基础魔法温室: 'greenhouse' } };
  assert.deepEqual(map.resolveMapFacilitySprite({
    facilities: { magic_greenhouse: { state: '启用', current_form: '基础魔法温室' } },
  }, 'magic_greenhouse', greenhouse), { source: 'greenhouse', damageOverlay: undefined });

  const fairyGarden = {
    areaId: 'fairy_garden_plot',
    forms: { 四季花境: 'flowers' },
    damageReplacement: 'ruins',
  };
  assert.deepEqual(map.resolveMapFacilitySprite({
    facility_runtime: { fairy_garden: { built: true, current_form: '四季花境', status: 'damaged' } },
  }, 'fairy_garden', fairyGarden), { source: 'ruins', damageOverlay: undefined });
  assert.deepEqual(map.resolveMapFacilitySprite({
    facility_runtime: { fairy_garden: { built: true, current_form: '四季花境', status: 'abnormal' } },
  }, 'fairy_garden', fairyGarden), { source: 'flowers', damageOverlay: undefined });
  assert.equal(map.resolveMapFacilitySprite({
    facility_runtime: { fairy_garden: { built: false, current_form: '四季花境' } },
  }, 'fairy_garden', fairyGarden), null);

  const app = await read('../src/ui/app.ts');
  assert.match(app, /bundle: `facility:\$\{id\}`[\s\S]*?category: 'facility', crossOrigin: 'anonymous'/);
  assert.match(app, /bundle: `character:\$\{id\}`[\s\S]*?category: 'character', crossOrigin: 'anonymous'/);
});

test('互动使用单壳 GAL、自定义输入与零模型本地结束', async () => {
  const document = await read('../src/ui/index.html');
  const controller = await read('../src/ui/app.ts');
  const actions = await read('../src/ui/target-actions.ts');
  const settlement = await read('../src/ui/event-settlement.ts');
  assert.match(document, /id="gg-view-gal"/);
  assert.match(document, /id="gg-gal-input"/);
  assert.match(document, /id="gg-suggested-replies"/);
  assert.match(document, /id="gg-end-chat"/);
  assert.match(document, /id="gg-show-native"/);
  assert.match(controller, /bridge\.sendUserMessage/);
  assert.doesNotMatch(controller, /buildSettlementMessage/);
  assert.match(controller, /type: 'end_conversation_local'/);
  assert.match(controller, /聊天已直接结束，没有调用模型/);
  assert.match(actions, /action_id: 'end_conversation'/);
  assert.match(settlement, /interaction\.settled_ids/);
});

test('GAL 使用月下结界舞台、和纸对白框与窄屏回流', async () => {
  const document = await read('../src/ui/index.html');
  const controller = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  const build = await read('../scripts/build-ui.mjs');
  const host = await read('../src/runtime/ui-host-shell.js');
  const assets = JSON.parse(await read('../src/assets/asset-manifest.json'));
  assert.match(document, /id="gg-view-gal" class="gg-view gg-gal"/);
  assert.match(document, /id="gg-portrait-stage" class="gg-portrait-stage" data-reaction="neutral"/);
  assert.match(document, /id="gg-dialogue-box" class="gg-dialogue-box"/);
  assert.doesNotMatch(document, /id="gg-gal-back"|id="gg-swipe-right"/);
  assert.match(document, /class="gg-scene-tools"[\s\S]*?id="gg-session-history"[\s\S]*?id="gg-regenerate"[\s\S]*?id="gg-stop"/);
  assert.match(styles, /GAL 最终主题：月下结界、博丽红漆与和纸对白框/);
  assert.match(styles, /\.gg-portrait-stage \{[\s\S]*?var\(--gg-gal-background-image, none\) center center \/ cover no-repeat/);
  assert.match(styles, /\.gg-gal::before \{\s*content: none;/);
  assert.match(styles, /\.gg-portrait-stage::after \{\s*content: none;/);
  assert.doesNotMatch(styles.match(/GAL 最终主题[\s\S]*?R4 主视觉/)?.[0] ?? '', /radial-gradient\(circle at (?:78% 17%|74% 23%)/);
  assert.match(styles, /\.gg-dialogue-box \{[\s\S]*?background:[\s\S]*?rgba\(255, 244, 215, \.97\)/);
  assert.match(styles, /\.gg-dialogue-box \{[\s\S]*?padding: 3\.25rem 1\.45rem \.85rem/);
  assert.match(styles, /\.gg-scene-speaker \{[\s\S]*?top: \.72rem;[\s\S]*?background: linear-gradient\(180deg, #b74a53, #842e38\)/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.gg-reply-panel \{ width: 100%; margin-top: \.5rem; padding: \.45rem; \}/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.gg-suggested-replies \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?\.gg-gal-compose textarea \{ height: 68px; min-height: 68px;/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.gg-gal-compose > \.gg-actions \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.gg-scene-item-picker \{ grid-template-columns: auto minmax\(0, 1fr\);[\s\S]*?\.gg-scene-item-trigger \{ min-height: 42px;/);
  assert.match(styles, /\.gg-gal \.gg-scene-tools \{[\s\S]*?grid-template-columns: minmax\(64px, \.7fr\) repeat\(2, minmax\(110px, 1fr\)\);[\s\S]*?width: min\(100%, 400px\);/);
  assert.match(styles, /\.gg-suggested-replies button \{[\s\S]*?background: linear-gradient\(180deg, #f0d9ae, #d8b681\)/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.gg-suggested-replies \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-height: 650px\) and \(min-width: 701px\)/);
  assert.doesNotMatch(styles.match(/GAL 最终主题[\s\S]*?R4 主视觉/)?.[0] ?? '', /backdrop-filter/);
  assert.match(controller, /--gg-gal-background-image/);
  assert.match(build, /galBackgroundSrc: previewAssetUrl/);
  assert.match(build, /galBackgroundDataUrl/);
  assert.match(host, /dataset\.galBackgroundSrc = embedded\.galBackgroundDataUrl/);
  assert.equal(assets.ui_assets.gal_shrine_background.source_alpha, 'ui/gensokyo-gal-shrine-background-v1.png');
  assert.equal(assets.ui_assets.gal_shrine_background.runtime_role, 'gal-stage-background');
});

test('符卡配置限制敌弹模式与参数上限', async () => {
  const allowed = new Set([
    'fixed_seed_ring', 'petal_fan', 'homing_leaf', 'local_safe_zone',
    'aimed_stream', 'rotating_ring', 'wave_fan', 'burst_cluster',
    'cross_sweep', 'laser_warning', 'falling_lanes',
  ]);
  const files = [
    '../src/battle/configs/greenhouse-flower-core-tutorial-v1.json',
    '../src/battle/configs/dungeons/fairy-pattern-practice-v1.json',
    '../src/battle/configs/dungeons/forest-magic-residue-v1.json',
    '../src/battle/configs/dungeons/boundary-echo-trial-v1.json',
  ];
  for (const file of files) {
    const config = JSON.parse(await read(file));
    for (const phase of config.phases) {
      assert.ok(phase.kind === 'nonspell' || phase.kind === 'spell', `${file}:${phase.id}`);
      for (const pattern of phase.patterns) {
        assert.ok(allowed.has(pattern.pattern_id), `${file}:${pattern.pattern_id}`);
        if (pattern.speed != null) {
          assert.ok(pattern.speed >= 40 && pattern.speed <= 260, pattern.pattern_id);
        }
        if (pattern.count != null) {
          assert.ok(pattern.count >= 1 && pattern.count <= 32, pattern.pattern_id);
        }
      }
    }
    assert.deepEqual(config.parameter_limits.speed, [40, 260]);
    assert.equal(config.player.auto_fire, false);
  }
  const flower = JSON.parse(await read('../src/battle/configs/greenhouse-flower-core-tutorial-v1.json'));
  assert.equal(flower.phases.length, 2);
  assert.equal(flower.config_id, 'greenhouse_flower_core_tutorial_v1');
  assert.equal(flower.player.auto_fire, false);
  assert.ok(flower.phases.every((phase) => phase.patterns.some((p) => p.start_ms != null || p.end_ms != null)));
});

test('旧主屋维修由本地前置条件与登记结果约束', async () => {
  const actions = await read('../src/ui/target-actions.ts');
  const events = JSON.parse(await read('../src/lorebook/events/greenhouse-vertical-slice.json'));
  const repair = events.events.find((item) => item.config_id === 'main_house_repair');
  assert.match(actions, /completed\.reimu_boundary_inspection/);
  assert.match(actions, /state\.areas\?\.main_house\?\.state !== '损坏'/);
  assert.match(actions, /action_id: action\.id/);
  assert.deepEqual(repair.cost, { materials: 1 });
  assert.deepEqual(repair.allowed_results, ['main_house_enabled', 'temporary_shelter_only']);
});

test('新开局本地写入首层 MVU，不创建消息或调用 LLM', async () => {
  const document = await read('../src/ui/index.html');
  const opening = await read('../src/ui/opening.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const styles = await read('../src/ui/styles.css');
  assert.match(document, /id="gg-opening-preview"/);
  assert.match(document, /id="gg-opening-commit"/);
  assert.match(document, /接过庭守钥 · 进入庭园/);
  assert.doesNotMatch(document, /id="gg-opening-story"|id="gg-opening-recovery"/);
  assert.match(opening, /export function buildOpeningMessage\(draft: OpeningDraft\)/);
  assert.match(opening, /sessionStorage/);
  assert.match(opening, /appearanceSentence/);
  assert.match(opening, /bridge\.initializeOpening\(resolved, frozenChatId\)/);
  assert.match(opening, /不发送玩家消息，也不会调用 LLM/);
  const commitHandler = opening.slice(opening.indexOf('private async commit()'));
  assert.match(commitHandler, /initializeOpening|sessionStorage\.removeItem/);
  assert.doesNotMatch(opening, /bridge\.commitOpening|bridge\.enterGarden|bridge\.repairOpening|getOpeningProgress/);
  assert.match(bridge, /async initializeOpening\(draft: OpeningDraft, expectedChatId: string\)/);
  const initializeHandler = bridge.slice(bridge.indexOf('async initializeOpening(draft: OpeningDraft'), bridge.indexOf('async commitOpening('));
  assert.match(initializeHandler, /openingTargetMessage/);
  assert.match(initializeHandler, /mergeState\(initialState/);
  assert.match(initializeHandler, /applyOpeningDraft/);
  assert.match(initializeHandler, /replaceMvuData/);
  assert.match(initializeHandler, /MVU 写入后复读校验失败/);
  assert.doesNotMatch(initializeHandler, /createChatMessages|triggerSlash|transactions\.submit/);
  assert.match(bridge, /garden_keeper_key\?\.state === '苏醒'/);
  assert.doesNotMatch(opening, /replaceMvuData|stat_data\s*=/);
  assert.match(document, /不会发送消息或调用语言模型/);
  assert.match(document, /id="gg-asset-loading"/);
  assert.match(document, /id="gg-asset-loading-progress"/);
  assert.match(opening, /void this\.assetPreloader\.start\(\)/);
  assert.match(opening, /await this\.assetPreloader\.waitForEntryGate\(\)/);
  assert.match(commitHandler, /!beforeLoad\.entryReady\s*&&\s*!beforeLoad\.entryTimedOut/);
  assert.match(await read('../src/ui/app.ts'), /priorityClass:\s*'entry-contextual'[\s\S]*?sprite\.sequence\?\.source|sprite\.sequence\?\.source[\s\S]*?priorityClass:\s*'entry-contextual'/);
  assert.match(styles, /@keyframes gg-asset-loading-spin/);
});

test('普通互动使用非隐藏真实消息、事务标识和无刷新写入', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const transaction = await read('../src/ui/message-transaction.ts');
  const document = await read('../src/ui/index.html');
  assert.match(bridge, /is_hidden: false/);
  assert.match(bridge, /refresh: 'none'/);
  assert.doesNotMatch(bridge, /is_hidden: true/);
  assert.match(transaction, /gensokyoTransactionId/);
  assert.match(transaction, /submitting_user/);
  assert.match(transaction, /generating/);
  assert.match(transaction, /settling/);
  assert.match(transaction, /settled/);
  assert.match(transaction, /failed/);
  assert.match(document, /id="gg-retry-transaction"/);
});

test('最新回复没有变量块时向前读取最近一份 MVU 正式状态', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(bridge, /function latestPersistedState/);
  assert.match(bridge, /filter\(\(message\) => messageRole\(message\) === 'assistant'\)\.reverse\(\)/);
  assert.match(bridge, /Object\.keys\(state\)\.length > 0/);
  assert.match(bridge, /return latestPersistedState\(mvu\)/);
  assert.match(bridge, /if \(!g\.Mvu\?\.getMvuData\) await g\.waitGlobalInitialized/);
});

test('默认开场不暴露旧生成式恢复入口，桥接层仍保留历史聊天兼容解析', async () => {
  const document = await read('../src/ui/index.html');
  const opening = await read('../src/ui/opening.ts');
  const bridge = await read('../src/ui/bridge.ts');
  assert.doesNotMatch(document, /id="gg-opening-recovery"/);
  assert.doesNotMatch(document, /id="gg-opening-retry"/);
  assert.doesNotMatch(opening, /gg-opening-retry|private async retry/);
  assert.doesNotMatch(document, /id="gg-opening-enter"/);
  assert.doesNotMatch(document, /id="gg-opening-repair"/);
  assert.doesNotMatch(document, /id="gg-opening-native"/);
  assert.doesNotMatch(opening, /gg-opening-native|private async showNative/);
  assert.doesNotMatch(opening, /getOpeningProgress|enterGarden|repairOpening/);
  assert.doesNotMatch(opening, /regenerateLatest/);
  assert.match(bridge, /async repairOpening/);
  assert.match(bridge, /gensokyo_opening_repair/);
  assert.match(bridge, /parseOpeningMessage/);
  assert.match(bridge, /MVU 写入后复读校验失败/);
  assert.match(bridge, /replaceMvuData/);
  assert.match(bridge, /message_id: messageId/);
  assert.match(bridge, /只补写其中已经确认的玩家姓名/);
});

test('打包器提供 MVU initvar 初始状态，不依赖角色脚本变量初始化消息楼层', async () => {
  const packer = await read('../scripts/package-checkpoint.mjs');
  const projection = await read('../src/lorebook/model-projection.md');
  const outputFormat = await read('../src/lorebook/variable-output-format.md');
  assert.match(packer, /\[initvar\] 移动庭园初始状态/);
  assert.match(packer, /\[mvu_update\] 最新 MVU 状态（含本地私有字段）/);
  assert.doesNotMatch(packer, /\[mvu_plot\]\[mvu_update\] 最新 MVU 状态/);
  assert.match(packer, /\[mvu_update\] 变量输出格式/);
  assert.match(packer, /'after_char', 0, 4/);
  assert.match(packer, /token_budget: 12288/);
  assert.match(projection, /\{\{format_message_variable::stat_data\}\}/);
  assert.match(projection, /只提供给 MVU 变量阶段/);
  assert.match(outputFormat, /没有合法变化时输出空数组/);
  assert.match(packer, /<initvar>/);
  assert.match(packer, /JSON\.stringify\(initialState, null, 2\)/);
  assert.match(packer, /--checkpoint=0\.2\.0-rN/);
  assert.match(packer, /planned_checkpoint_sequence/);
  assert.match(packer, /world: WORLDBOOK_NAME/);
  assert.match(packer, /mvu_worldbook_name: WORLDBOOK_NAME/);
  assert.match(packer, /name: WORLDBOOK_NAME/);
  assert.match(packer, /GAL 表现与会话协议/);
  assert.match(packer, /gensokyo-garden-ui-020-\$\{CHECKPOINT_SUFFIX\}/);
  assert.match(packer, /移动庭园首次行动引导/);
  assert.match(packer, /不发送玩家消息，也不调用 LLM/);
  assert.match(packer, /const payload = \{ spec: 'chara_card_v2', spec_version: '2\.0', data \}/);
  assert.doesNotMatch(packer, /spec_version: '2\.0', \.\.\.data, data/);
  assert.match(packer, /if \(!DRY_RUN && await exists\(OUTPUT_FILE\)\)/);
  assert.match(packer, /REPLACE_EXISTING/);
  assert.match(packer, /archive-and-replace/);
  assert.match(packer, /copyFile\(OUTPUT_FILE, archivedOutput\)/);
});

test('数据库适配器是可选归档且不下载或执行远程脚本', async () => {
  const adapter = await read('../src/ui/database-adapter.ts');
  assert.match(adapter, /AutoCardUpdaterAPI/);
  assert.match(adapter, /state\.meta\?\.opening_committed/);
  assert.match(adapter, /祖父的遗物（庭守钥）/);
  assert.doesNotMatch(adapter, /fetch\(|eval\(|new Function/);
});

test('运行挂载产物使用内嵌素材或固定 remote-r2-live 清单，不依赖开发服务器', async () => {
  const mount = await read('../dist/runtime/ui-mount.js');
  const embeddedLine = mount.split('\n').find((line) => line.startsWith('const embedded = '));
  assert.ok(embeddedLine, '运行挂载缺少 embedded 配置');
  const embedded = JSON.parse(embeddedLine.slice('const embedded = '.length, -1));
  if (embedded.assetDeliveryConfig?.mode === 'remote-r2-live') {
    const { baseUrl, manifestPath } = embedded.assetDeliveryConfig;
    assert.match(baseUrl, /^https:\/\/[^/?#]+$/);
    assert.equal(manifestPath, 'gensokyo-moving-garden/live/manifest.json');
    assert.equal(embedded.assetBase, `${baseUrl}/gensokyo-moving-garden/live`);
  } else {
    assert.match(mount, /data:image\/png;base64,/);
  }
  assert.match(mount, /__GENSOKYO_GARDEN_UI_024__/);
  assert.match(mount, /show-native-chat/);
  assert.match(mount, /gensokyo-game-shell/);
  assert.match(mount, /gg-gensokyo-chat-active/);
  assert.doesNotMatch(mount, /"reimuPortraitDataUrl":/);
  assert.doesNotMatch(mount, /"marisaPortraitDataUrl":/);
  assert.match(mount, /const characterSprites = embedded\.characterSpriteDataUrls \|\| \{\}/);
  assert.match(mount, /dataset\.reimuPortraitSrc = characterSprites\.reimu\.idle/);
  assert.match(mount, /dataset\.marisaPortraitSrc = characterSprites\.marisa\.idle/);
  assert.match(mount, /mainHouseDataUrl/);
  assert.match(mount, /greenhouseDataUrl/);
  assert.match(mount, /battlePlayerDataUrl/);
  assert.match(mount, /battleBossDataUrl/);
  assert.match(mount, /battleEffectsDataUrl/);
  assert.match(mount, /battlePlayerSrc/);
  assert.match(mount, /battleBossSrc/);
  assert.match(mount, /battleEffectsSrc/);
  assert.doesNotMatch(mount, /chroma\.png/);
  assert.doesNotMatch(mount, /position:'fixed',inset/);
  assert.doesNotMatch(mount, /127\.0\.0\.1:8765|gcore\.jsdelivr\.net|localhost/);
});

test('宿主只在本卡游戏模式受控隐藏原生输入区，并在跨角色或卸载时恢复', async () => {
  const host = await read('../src/runtime/ui-host-shell.js');
  assert.match(host, /body\.\$\{activeClass\} #send_form \{ display: none !important; \}/);
  assert.match(host, /doc\.body\.classList\.toggle\(activeClass, !state\.nativeMode\)/);
  assert.match(host, /doc\.body\?\.classList\.remove\(activeClass\)/);
  assert.match(host, /const ownerCharacterId = currentCharacterId\(\)/);
  assert.match(host, /currentCharacterId\(\) === state\.ownerCharacterId/);
  assert.match(host, /source\.addEventListener\('pagehide', destroy, \{ once: true \}\)/);
  assert.match(host, /if \(!ownsCurrentCharacter\(\)\) \{\s*destroy\(\)/);
  assert.match(host, /clearHostArtifacts\(\)/);
  assert.match(host, /#\$\{shellId\}, #\$\{returnFrameId\}, #\$\{styleId\}/);
  assert.match(host, /ensureReturnFrame/);
  // R2：generate 必须在每次调用时解析当前 TavernHelper.generate，不能在 UI 挂载时快照绑定。
  assert.match(host, /resolveCurrentGenerate/);
  assert.match(host, /child\.generate = \(\.\.\.args\) => callCurrentGenerate\(\.\.\.args\)/);
  // Phase 6 §6.2：独立 floors-hidden class + applyMode 派生（!nativeMode && !debugFloorsVisible）
  assert.match(host, /const floorsHiddenClass = 'gg-gensokyo-floors-hidden'/);
  assert.match(host, /body\.\$\{activeClass\} #chat\.\$\{floorsHiddenClass\} > \.mes/);
  assert.match(host, /classList\.toggle\(floorsHiddenClass, !state\.nativeMode && !state\.debugFloorsVisible\)/);
  assert.match(host, /gensokyo-garden:toggle-debug-floors/);
  assert.match(host, /galDebugFloorsVisible/);
});

test('Phase 6：调试楼层开关只改 class/会话存储，不写消息数据，并带提示条', async () => {
  const app = await read('../src/ui/app.ts');
  const html = await read('../src/ui/index.html');
  const host = await read('../src/runtime/ui-host-shell.js');
  assert.match(html, /id="gg-debug-floors"/);
  assert.match(html, /id="gg-debug-banner"/);
  assert.match(app, /byId<HTMLInputElement>\('gg-debug-floors'\)/);
  assert.match(app, /gensokyo-garden:toggle-debug-floors/);
  // 会话存储键与宿主同源；不写 MVU/聊天/角色卡
  assert.match(app, /galDebugFloorsVisible/);
  assert.doesNotMatch(app, /debugFloorsVisible.*setChatMessages|debugFloorsVisible.*createChatMessages/);
  // 宿主原子应用
  assert.match(host, /function toggleDebugFloors/);
});

test('GAL 世界书恢复完整庭园正文定义与正确示范，旧 scene 只保留本地兼容解析', async () => {
  const parser = await read('../src/ui/gal-scene.ts');
  const controller = await read('../src/ui/app.ts');
  const protocol = await read('../src/lorebook/gal-presentation-protocol.md');
  const packager = await read('../scripts/package-checkpoint.mjs');
  assert.match(parser, /<GensokyoScene/);
  assert.match(parser, /\.slice\(0, 6\)/);
  assert.match(parser, /ALLOWED_REACTIONS/);
  assert.match(parser, /ALLOWED_VISUAL_MODES/);
  assert.match(parser, /malformed \? 'fallback'/);
  assert.match(parser, /scene\.v1\+body|preferBody|bodyChars/);
  assert.match(parser, /bginfor/);
  assert.match(controller, /textContent = beat\.text/);
  assert.match(controller, /dataset\.visualMode = beat\.visualMode/);
  assert.match(await read('../src/ui/index.html'), /data-visual-mode="normal"/);
  assert.doesNotMatch(controller, /innerHTML\s*=/);
  assert.doesNotMatch(protocol, /GensokyoScene|scene\.v1|suggested_replies/);
  assert.ok(Buffer.byteLength(protocol, 'utf8') < 6500, '常驻 GAL 协议应保持紧凑');
  assert.match(protocol, /## 庭园正文格式（强制）/);
  assert.match(protocol, /正确格式示范：[\s\S]*【庭园正文开始】[\s\S]*<narration>[\s\S]*<dialogue char="reimu"[\s\S]*【庭园正文结束】/);
  assert.doesNotMatch(protocol, /当前请求的 system inject/);
  assert.match(protocol, /不输出第二份 GAL 表现 JSON/);
  assert.match(protocol, /不得输出 `<UpdateVariable>`、`<GensokyoEventResult>`/);
  assert.match(protocol, /visual_mode/);
  assert.doesNotMatch(protocol, /event-result\.v1|interaction_<uid_counters|本地事务失败并允许重试/);
  assert.doesNotMatch(packager, /GAL scene\.v1|GensokyoScene/);
});

test('咲夜怀表只在生效时动态投影，不再作为常驻世界书条目', async () => {
  const promptContext = await read('../src/ui/prompt-context.ts');
  const packager = await read('../scripts/package-checkpoint.mjs');
  assert.match(promptContext, /【时间停止】/);
  assert.match(promptContext, /不授予伤害、永久记忆或立场变化/);
  assert.doesNotMatch(packager, /sakuya_watch\.xml|怀表·时间停止/);
});

test('GAL visual_mode 兼容旧回复并按三种素材语义归一化姿势', async () => {
  const parser = await importTypescript('../src/ui/gal-scene.ts');
  const state = { characters: { reimu: {} } };
  const scene = parser.projectGalScene({
    id: 21,
    text: '<GensokyoScene>{"version":"scene.v1","beats":['
      + '{"kind":"speech","speaker_id":"reimu","reaction_id":"smile","pose_id":"legacy_pose","text":"旧格式。"},'
      + '{"kind":"speech","speaker_id":"reimu","visual_mode":"nude","reaction_id":"shy","pose_id":"invented_pose","text":"非亲密裸露。"},'
      + '{"kind":"speech","speaker_id":"reimu","visual_mode":"sexual","reaction_id":"shy","pose_id":"pose_a","act_id":"anal","text":"已登记姿势。"},'
      + '{"kind":"speech","speaker_id":"reimu","visual_mode":"unknown","reaction_id":"angry","pose_id":"pose_b","text":"非法模式。"}'
      + '],"suggested_replies":[]}</GensokyoScene>',
  }, state, 'reimu');
  assert.equal(scene.version, 'scene.v1');
  assert.deepEqual(scene.beats.map((beat) => [beat.visualMode, beat.poseId, beat.actId]), [
    ['normal', 'default', 'none'],
    ['nude', 'default', 'none'],
    ['sexual', 'default', 'none'],
    ['normal', 'default', 'none'],
  ]);
});

test('庭园正文剥离 LLM 自指纠错 CoT 泄漏且不误伤正常台词', async () => {
  const parser = await importTypescript('../src/ui/gal-scene.ts');
  const state = { characters: { reimu: {} } };
  // 真实泄漏：模型先误标玩家台词为 dialogue，随即在正文里输出“（注意：…）修正：”自指纠错。
  const leaked = '【庭园正文开始】'
    + '<narration>她把金币抓在手里。</narration>\n'
    + '<dialogue char="reimu" reaction="neutral">“想要吗？”</dialogue>\n'
    + '（注意：这句话是我说的，所以不应该用dialogue标签，应该放在narration里。）\n'
    + '修正：\n'
    + '<narration>“想要吗？”我问。</narration>\n'
    + '<narration>她扑了上来。</narration>\n'
    + '【庭园正文结束】';
  const scene = parser.projectGalScene({ id: 22, text: leaked }, state, 'reimu');
  const joined = scene.beats.map((beat) => beat.text).join('\n');
  assert.doesNotMatch(joined, /注意：/u, '正文中不得残留自指纠错文本');
  assert.doesNotMatch(joined, /修正：/u, '正文中不得残留修正标记');
  assert.doesNotMatch(joined, /不应该/u, '正文中不得残留自指分析');
  assert.match(joined, /她把金币抓在手里/u, '正常旁白保留');
  assert.match(joined, /她扑了上来/u, '纠错后的重写段落保留');
  // 误标 dialogue 的玩家台词按当前策略保留（靠协议约束模型，不做启发式改写）。
  assert.match(joined, /想要吗/u, '台词内容保留');

  // 误伤防护：正文台词里的“（注意：…）”陈述是正常内容，不得剥离。
  const narrationNote = '【庭园正文开始】'
    + '<narration>她说：“（注意：这里有个机关）要小心。”然后走了。</narration>\n'
    + '【庭园正文结束】';
  const kept = parser.projectGalScene({ id: 23, text: narrationNote }, state, 'reimu');
  assert.match(kept.beats.map((beat) => beat.text).join('\n'), /这里有个机关/u, '正文台词的注意陈述保留');

  // 非协议正文路径（cleanNarrativeText）同样剥离。
  const bginfor = '<bginfor>（思考：这个反应应该更激烈一点）她瞪大眼睛。' + '<GensokyoScene>{"version":"scene.v1","beats":[]}</GensokyoScene>';
  const cleaned = parser.cleanNarrativeText(bginfor);
  assert.doesNotMatch(cleaned, /思考：/u, '普通正文路径同样剥离自指思考');
  assert.match(cleaned, /她瞪大眼睛/u, '正文内容保留');
});

test('庭园正文段落不设条数上限：25 条以上全部保留直到正文结束', async () => {
  const parser = await importTypescript('../src/ui/gal-scene.ts');
  const state = { characters: { reimu: {} } };
  const body = '【庭园正文开始】\n'
    + Array.from({ length: 25 }, (_, index) => `<narration>这是第 ${index + 1} 段正文。</narration>\n`).join('')
    + '【庭园正文结束】';
  const scene = parser.projectGalScene({ id: 24, text: body }, state, 'reimu');
  assert.equal(scene.beats.length, 25, '25 条段落应全部保留，不再截断前 24 条');
  assert.match(scene.beats[24].text, /第 25 段正文/u, '最后一段（第 25 段）应进入 GAL 播放');
});

test('八名 GAL 角色注册表接入五种表情的着装与全裸槽位', async () => {
  const registry = await importTypescript('../src/ui/gal-portrait-registry.ts');
  assert.deepEqual([...registry.GAL_PORTRAIT_REACTION_IDS], [
    'neutral',
    'smile',
    'shy',
    'sad',
    'angry',
  ]);
  assert.deepEqual([...registry.GAL_PORTRAIT_CHARACTER_IDS], [
    'reimu', 'marisa', 'cirno', 'alice', 'nitori', 'mystia', 'suika', 'sakuya',
  ]);
  assert.equal(registry.GAL_PORTRAIT_SLOTS.length, 80);
  assert.deepEqual(
    [...new Set(registry.GAL_PORTRAIT_SLOTS.map((slot) => slot.visualMode))],
    ['normal', 'nude'],
  );
  assert.ok(registry.GAL_PORTRAIT_SLOTS.every((slot) => (
    slot.localAssetPath?.startsWith(`characters/${slot.characterId}/gal/${slot.visualMode}/`)
      && slot.status === 'ready'
  )));

  assert.deepEqual(registry.normalizeGalPortraitCue('marisa', {
    visualMode: 'normal',
    reactionId: 'surprised',
    poseId: 'not_used',
    actId: 'anal',
  }), {
    visualMode: 'normal',
    reactionId: 'neutral',
    poseId: 'default',
    actId: 'none',
  });
  assert.deepEqual(registry.normalizeGalPortraitCue('marisa', {
    visualMode: 'sexual',
    reactionId: 'shy',
    poseId: 'invented_pose',
    actId: 'anal',
  }), {
    visualMode: 'sexual',
    reactionId: 'shy',
    poseId: 'default',
    actId: 'none',
  });
  assert.deepEqual(registry.galPortraitFallbackPoolIds('marisa', {
    visualMode: 'sexual',
    reactionId: 'shy',
    poseId: 'invented_pose',
    actId: 'anal',
  }), [
    'gal.marisa.nude.shy',
    'gal.marisa.nude.neutral',
    'gal.marisa.normal.shy',
    'gal.marisa.normal.neutral',
  ]);

  const sources = registry.parseGalPortraitSources(JSON.stringify({
    marisa: {
      normal: { neutral: '../assets/characters/marisa/gal/normal/marisa-normal-neutral-v1.png' },
      nude: { shy: 'data:image/png;base64,YWJjZA==' },
    },
  }));
  assert.equal(registry.resolveGalPortraitSource(sources, 'marisa', {
    visualMode: 'sexual',
    reactionId: 'shy',
    poseId: 'default',
    actId: 'none',
  }), 'data:image/png;base64,YWJjZA==');
  assert.deepEqual(registry.parseGalPortraitSources(JSON.stringify({
    marisa: { normal: { neutral: 'https://untrusted.example/portrait.png' } },
  })), {});
  const trustedRemotePortrait = 'https://assets.example/releases/r1/characters/marisa/neutral.png';
  assert.equal(registry.resolveGalPortraitSource(registry.parseGalPortraitSources(JSON.stringify({
    marisa: { normal: { neutral: trustedRemotePortrait } },
  }), 'https://assets.example/releases/r1'), 'marisa', {
    visualMode: 'normal',
    reactionId: 'neutral',
    poseId: 'default',
    actId: 'none',
  }), trustedRemotePortrait);

  const remoteBase = 'https://assets.example';
  const merged = registry.mergeRemoteSexualPortraitSources(sources, [{
    source: 'characters/reimu/gal/sexual/missionary/vaginal/01.png',
    key: 'gensokyo-moving-garden/live/characters/reimu/gal/sexual/missionary/vaginal/01.png',
    mime: 'image/png',
    character_id: 'reimu', visual_mode: 'sexual', pose_id: 'missionary', act_id: 'vaginal',
    candidate_no: '01', pool_id: 'gal.reimu.sexual.missionary.vaginal', weight: 1,
  }, {
    source: 'characters/reimu/gal/sexual/missionary/vaginal/02.png',
    key: 'gensokyo-moving-garden/live/characters/reimu/gal/sexual/missionary/vaginal/02.png',
    mime: 'image/png',
    character_id: 'reimu', visual_mode: 'sexual', pose_id: 'missionary', act_id: 'vaginal',
    candidate_no: '02', pool_id: 'gal.reimu.sexual.missionary.vaginal', weight: 1,
  }], remoteBase);
  assert.equal(registry.resolveGalPortraitSource(merged, 'reimu', {
    visualMode: 'sexual', reactionId: 'shy', poseId: 'missionary', actId: 'vaginal',
  }), `${remoteBase}/gensokyo-moving-garden/live/characters/reimu/gal/sexual/missionary/vaginal/01.png`);
  const nonInsert = registry.mergeRemoteSexualPortraitSources(merged, [{
    source: 'characters/reimu/gal/sexual/oral/none/01.png',
    key: 'gensokyo-moving-garden/live/characters/reimu/gal/sexual/oral/none/01.png',
    mime: 'image/png',
    character_id: 'reimu', visual_mode: 'sexual', pose_id: 'oral', act_id: 'none',
    candidate_no: '01', pool_id: 'gal.reimu.sexual.oral.none', weight: 1,
  }], remoteBase);
  assert.equal(registry.resolveGalPortraitSource(nonInsert, 'reimu', {
    visualMode: 'sexual', reactionId: 'shy', poseId: 'oral', actId: 'none',
  }), `${remoteBase}/gensokyo-moving-garden/live/characters/reimu/gal/sexual/oral/none/01.png`);
  // R79 回归：base 必须是纯 origin；若误传带前缀 base（如 baseUrl+"/gensokyo-moving-garden/live"），
  // 会与 file.key（已含前缀）拼接出重复路径 "…/live/gensokyo-moving-garden/live/…" 导致 404。
  // mergeRemoteSexualPortraitSources 只负责拼接，调用方必须传 manifest.asset_base_url（纯 origin）。
  const prefixedBase = 'https://assets.example/gensokyo-moving-garden/live';
  const withPrefixedBase = registry.mergeRemoteSexualPortraitSources(sources, [{
    source: 'characters/reimu/gal/sexual/rear/vaginal/01.png',
    key: 'gensokyo-moving-garden/live/characters/reimu/gal/sexual/rear/vaginal/01.png',
    mime: 'image/png',
    character_id: 'reimu', visual_mode: 'sexual', pose_id: 'rear', act_id: 'vaginal',
    candidate_no: '01', pool_id: 'gal.reimu.sexual.rear.vaginal', weight: 1,
  }], prefixedBase);
  const resolvedUrl = registry.resolveGalPortraitSource(withPrefixedBase, 'reimu', {
    visualMode: 'sexual', reactionId: 'shy', poseId: 'rear', actId: 'vaginal',
  });
  assert.doesNotMatch(resolvedUrl ?? '', /\/gensokyo-moving-garden\/live\/gensokyo-moving-garden\/live\//u,
    'base 不应重复前缀；sexual 立绘 URL 不得出现重复的 /live/ 路径段');
});

test('八名角色八十张 GAL 原图进入素材清单、预览与自包含构建链', async () => {
  const manifest = JSON.parse(await read('../src/assets/asset-manifest.json'));
  const build = await read('../scripts/build-ui.mjs');
  const host = await read('../src/runtime/ui-host-shell.js');
  const app = await read('../src/ui/app.ts');
  assert.deepEqual(Object.keys(manifest.gal_portraits), [
    'reimu', 'marisa', 'cirno', 'alice', 'nitori', 'mystia', 'suika', 'sakuya',
  ]);
  for (const asset of Object.values(manifest.gal_portraits)) {
    assert.deepEqual(asset.canvas, [1152, 1920]);
    assert.equal(asset.runtime_embed, 'direct-original-files');
    assert.deepEqual(Object.keys(asset.sources), ['normal', 'nude']);
    for (const mode of ['normal', 'nude']) {
      assert.deepEqual(Object.keys(asset.sources[mode]), ['neutral', 'smile', 'shy', 'sad', 'angry']);
      for (const source of Object.values(asset.sources[mode])) {
        const png = PNG.sync.read(await readBuffer(`../src/assets/${source}`));
        assert.equal(png.width, 1152);
        assert.equal(png.height, 1920);
        assert.equal(png.alpha, true);
      }
    }
  }
  assert.match(build, /previewGalPortraitSources/);
  assert.match(build, /galPortraitDataUrls/);
  assert.match(host, /dataset\.galPortraitSources/);
  assert.match(build, /assetBase: remoteAssetConfig \? previewAssetBase : undefined/);
  assert.match(host, /dataset\.assetBase = embedded\.assetBase/);
  assert.match(app, /resolveGalPortraitSource/);
  const styles = await read('../src/ui/styles.css');
  assert.match(styles, /data-portrait-kind="gal"[\s\S]*?position: absolute;[\s\S]*?top: 16px;[\s\S]*?bottom: auto;[\s\S]*?width: auto;[\s\S]*?height: calc\(100% - 116px\);[\s\S]*?object-fit: contain;[\s\S]*?image-rendering: auto/);
});

test('真实消息事务等待生成完成，停止后继续原回复并支持左右 Swipe', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const transaction = await read('../src/ui/message-transaction.ts');
  assert.match(bridge, /\/trigger await=true/);
  assert.match(bridge, /\/continue await=true/);
  assert.match(bridge, /\/regenerate await=true/);
  assert.match(bridge, /direction === 'left' \? 'left' : 'right'/);
  assert.match(transaction, /private stopped = false/);
  assert.match(transaction, /if \(shouldContinue\) await this\.host\.continueGeneration\(\)/);
  assert.match(transaction, /this\.reconcile\(true\)/);
  assert.match(transaction, /phase = 'generating'/);
  assert.match(transaction, /phase === 'submitting_user'/);
  assert.doesNotMatch(transaction, /phase === 'submitting_user' \|\| this\.snapshot\.phase === 'generating' \|\| this\.stopped/);
});

test('交互结算 ID 有完整 schema、初始状态和字段台账链', async () => {
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const schema = await read('../src/schema/02-mvu-schema.js');
  const ledger = await read('../src/schema/field-ledger.md');
  assert.deepEqual(initial.interaction.settled_ids, []);
  assert.match(schema, /settled_ids: list\(text\('', 64\), 64\)/);
  assert.match(ledger, /interaction\.settled_ids/);
});

test('conversation_log 退役（B2-T11）：schema 仍容纳、迁移保留、结束对话不清空、prompt 不再注入回顾', async () => {
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const schema = await read('../src/schema/02-mvu-schema.js');
  const ledger = await read('../src/schema/field-ledger.md');
  assert.deepEqual(initial.interaction.conversation_log, []);
  assert.match(schema, /conversation_log: list\(text\('', 120\), 24\)/);
  assert.match(ledger, /interaction\.conversation_log/);
  const migrations = await importTypescript('../src/ui/state-migrations.ts');
  // 旧状态迁移默认补空数组，已有日志 FIFO 保留尾 24 条
  const migrated = migrations.migrateGardenState({ interaction: { conversation_log: ['reimu: 聊了妖花核心', 'marisa: 研究过旧蓝图'] } });
  assert.deepEqual(migrated.interaction.conversation_log, ['reimu: 聊了妖花核心', 'marisa: 研究过旧蓝图']);
  const bare = migrations.migrateGardenState({});
  assert.deepEqual(bare.interaction.conversation_log, []);
  // 结束对话（end_conversation_local）只清 current_session 与场景道具，不清 conversation_log
  const { endConversationLocal } = await importTypescript('../src/ui/activity-rules.ts');
  const ended = endConversationLocal({ ...migrated, scene_item_context: { entries: [{ item_id: 'reimu_coin_bait', quantity_used: 1, prompt_description: 'x' }], status: 'active' } });
  assert.equal(ended.interaction.current_session, null);
  assert.deepEqual(ended.interaction.conversation_log, ['reimu: 聊了妖花核心', 'marisa: 研究过旧蓝图']);
  // B2-T11 退役：conversation_log 仅作为 legacy migration source；prompt 不再注入回顾，协议不再要求追加
  const { buildPromptContext } = await importTypescript('../src/ui/prompt-context.ts');
  const ctx = buildPromptContext({
    environment: { day: 1, time_period: '清晨', weather: '晴' },
    player: { current_area_id: 'central_courtyard' },
    presence_snapshot: { present_character_ids: ['reimu'], character_views: {}, visitor_meta: {} },
    interaction: { conversation_log: ['reimu: 在中央庭院聊了妖花核心', 'marisa: 研究过旧蓝图'] },
  });
  assert.doesNotMatch(ctx, /【最近互动回顾/);
  assert.doesNotMatch(ctx, /reimu: 在中央庭院聊了妖花核心/);
  // R82→T11：协议不再要求 /- 数组追加；格式文档标记退役
  const contractSource = await read('../src/ui/target-actions.ts');
  assert.doesNotMatch(contractSource, /conversation_log\/-/, '协议不再要求模型追加 conversation_log');
  assert.match(contractSource, /剧情连续性/, '协议含剧情连续性约束');
  assert.match(contractSource, /不代表剧情分支切换或记忆重置/, '协议明确道具授权≠记忆重置');
  assert.match(contractSource, /不得装作什么都没发生/, '协议禁止失忆式反应');
  const formatDoc = await read('../src/lorebook/variable-output-format.md');
  assert.match(formatDoc, /conversation_log.*已退役/, '输出格式文档标记 conversation_log 退役');
  assert.match(formatDoc, /旧存档迁移来源/, '格式文档注明仅作迁移来源');
  const stringy = migrations.migrateGardenState({ interaction: { conversation_log: 'reimu: 被 MagVarUpdate 误替换成字符串' } });
  assert.deepEqual(stringy.interaction.conversation_log, ['reimu: 被 MagVarUpdate 误替换成字符串'], '字符串兜底转单元素数组');
  const emptyStr = migrations.migrateGardenState({ interaction: { conversation_log: '   ' } });
  assert.deepEqual(emptyStr.interaction.conversation_log, [], '空白字符串兜底为空数组');
});

test('玩家姓名不再每轮投影：走酒馆原生宏注入，规则钉住称呼边界', async () => {
  const { buildPromptContext } = await importTypescript('../src/ui/prompt-context.ts');
  const base = {
    environment: { day: 1, time_period: '清晨', weather: '晴' },
    player: { current_area_id: 'central_courtyard' },
    presence_snapshot: { present_character_ids: ['reimu'], character_views: {}, visitor_meta: {} },
  };
  // 名字由开场时注入酒馆原生宏（{{user}}）承载，场景事实不再每轮投影姓名。
  const named = buildPromptContext({ ...base, player: { ...base.player, name: '灵梦的饲主', pronouns: '他' } });
  assert.doesNotMatch(named, /玩家姓名/u, '场景事实不再投影玩家姓名');
  assert.doesNotMatch(named, /未命名旅人/u);
  assert.match(named, /在场角色：reimu/u, '场景事实其余字段保留');
  // 称呼边界规则：每轮注入协议（gardenNarrativeContract）与世界书（entries[7]）同步
  const contract = await read('../src/ui/target-actions.ts');
  assert.match(contract, /称呼玩家时使用酒馆当前用户名/u);
  assert.match(contract, /不得据此替玩家决定人称、台词、心理、关系承诺或关键选择/u);
  const worldbook = await read('../src/lorebook/gal-presentation-protocol.md');
  assert.match(worldbook, /称呼玩家时使用酒馆当前用户名/u);
  // 宏注入链路：提交时把输入注入原生宏（slash persona-set → setUserName 多级探测）
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(bridge, /applyUserNameToHost/u);
  assert.match(bridge, /executeSlashCommandsWithOptions/u);
  assert.match(bridge, /persona-set mode=temp/u);
  assert.match(bridge, /setUserName/u);
  // 旧酒馆适配：getOpeningContext 回退到官方 getContext().name1
  assert.match(bridge, /getContext\(\)\.name1|ctx\?\.name1|ctx\?\.name1/u);
});

test('cleanNarrativeText 优先使用 bginfor 后正文，而不是时段元数据', async () => {
  const source = await read('../src/ui/gal-scene.ts');
  assert.match(source, /candidates\.reduce/);
  assert.match(source, /preferBody/);
  assert.match(source, /scene\.v1\+body/);
  assert.match(source, /afterBginfor/);
  assert.match(source, /insideBginfor/);
  const sample = [
    '<draft>plan</draft>',
    '<bginfor><!--meta--><details><summary>时间地点</summary>日期：x 时间：14:15</details></bginfor>',
    '',
    '我深吸一口气，让胸腔充盈着这片被遗弃之地的陈旧气息，迈步绕过那一丛由于缺乏修剪而张牙舞爪的枯萎灌木。',
    '我停在巫女身前，尽量让自己的声音听起来像个通情达理的邻居。',
    '“这里荒废了挺久，如果刚才的波动惊扰到了博丽神社，我很抱歉。”',
    '灵梦把手插进袖子里，视线落在庭守钥上。',
    '<GensokyoScene>{"version":"scene.v1","beats":[{"kind":"speech","speaker_id":"reimu","reaction_id":"annoyed","pose_id":"default","text":"别折腾。"}],"suggested_replies":[{"id":"a","label":"继续","intent":"继续观察"}]}</GensokyoScene>',
    '<UpdateVariable><JSONPatch>[{"op":"replace","path":"/environment/time_period","value":"下午"}]</JSONPatch></UpdateVariable>',
  ].join('\n');
  const after = sample.match(/<\/bginfor>\s*([\s\S]*?)(?=<GensokyoScene\b|<UpdateVariable\b|$)/iu)?.[1] ?? '';
  const inside = sample.match(/<bginfor\b[^>]*>([\s\S]*?)(?:<\/bginfor>|(?=<GensokyoScene\b))/iu)?.[1] ?? '';
  const strip = (t) => t
    .replace(/<GensokyoScene\b[^>]*>[\s\S]*?<\/GensokyoScene>/giu, '')
    .replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/giu, '')
    .replace(/<draft>[\s\S]*?<\/draft>/giu, '')
    .replace(/<details>[\s\S]*?<\/details>/giu, '')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<[^>]+>/gu, '')
    .trim();
  const best = [after, inside, sample].map(strip).reduce((a, b) => (b.length > a.length ? b : a));
  assert.ok(best.length >= 80, 'expected long body, got ' + best.length);
  assert.match(best, /深吸一口气/);
  assert.doesNotMatch(best, /别折腾/);
});

test('庭园正文协议只投影最后一个边界内的多角色正文，并拒绝坏协议代码', async () => {
  const parser = await importTypescript('../src/ui/gal-scene.ts');
  const state = { characters: { reimu: {}, marisa: {} } };
  const message = {
    id: 8,
    text: [
      '预设可能在前面输出任意说明。',
      '【庭园正文开始】<narration>旧样例，不应出现。</narration>【庭园正文结束】',
      '【庭园正文开始】',
      '<narration>庭院的风穿过残墙。</narration>',
      '<dialogue char="reimu" visual_mode="nude" reaction="annoyed" pose="not_used">“木料别堵在路上。”</dialogue>',
      '<dialogue char="marisa" visual_mode="sexual" reaction="smile" pose="pose_b">“借两根，之后还你。”</dialogue>',
      '【庭园正文结束】',
      '<w2g>不应进入 GAL</w2g><GensokyoScene>{"version":"scene.v1"}</GensokyoScene>',
    ].join('\n'),
  };
  const scene = parser.projectGalScene(message, state, 'reimu');
  assert.equal(scene.version, 'garden.v1');
  assert.deepEqual(scene.beats.map((beat) => [beat.kind, beat.speakerId, beat.text]), [
    ['narration', null, '庭院的风穿过残墙。'],
    ['speech', 'reimu', '“木料别堵在路上。”'],
    ['speech', 'marisa', '“借两根，之后还你。”'],
  ]);
  assert.deepEqual(scene.beats.map((beat) => [beat.visualMode, beat.poseId]), [
    ['normal', 'default'],
    ['nude', 'default'],
    ['sexual', 'default'],
  ]);
  assert.deepEqual(scene.suggestedReplies, []);

  const malformed = parser.projectGalScene({
    id: 9,
    text: '【庭园正文开始】<narration>不完整正文</narration><GensokyoScene>{"version":"scene.v1"}',
  }, state, 'reimu');
  assert.equal(malformed.version, 'garden.v1');
  assert.equal(malformed.malformed, true);
  assert.doesNotMatch(malformed.beats[0].text, /scene\.v1|GensokyoScene/);
});

test('庭园行动追加正文协议，维修固定结算且不开放续聊', async () => {
  const actions = await read('../src/ui/target-actions.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const app = await read('../src/ui/app.ts');
  assert.match(actions, /【庭园正文开始】/);
  assert.match(actions, /第一个可见字符必须是【庭园正文开始】/);
  assert.match(actions, /fixedPresentation: true/);
  // R78 协议加固：每轮注入的正文协议必须包含 visual_mode 三值格式与 sexual 触发规则，
  // 防止模型在插入性行为正文中停留在 nude。
  assert.match(actions, /visual_mode="normal\|nude\|sexual"/);
  assert.match(actions, /act="vaginal\|anal\|none"/);
  assert.match(actions, /正文确实进入明确亲密行为时/);
  assert.match(actions, /必须为 sexual/);
  assert.match(actions, /不得停留在 nude/);
  assert.doesNotMatch(actions, /GensokyoScene/);
  assert.match(bridge, /eventById\.get\(action\.event_id\)/);
  assert.deepEqual(settlement.settlementChoices({}, {
    version: 'garden-action.v1', action_id: 'repair', event_id: 'main_house_repair',
  }), ['main_house_enabled', 'temporary_shelter_only']);
  assert.match(app, /singleShotEventPresentation = Boolean\(pendingAction\.fixedPresentation\)/);
  assert.match(app, /点击返回庭园/);
  assert.match(app, /function returnToGardenAfterFixedScene/);
  assert.match(app, /if \(singleShotEventPresentation\) returnToGardenAfterFixedScene\(\)/);
});

test('GAL 加载清空旧正文，顶栏提供净化历史但不暴露 Swipe 入口', async () => {
  const document = await read('../src/ui/index.html');
  const app = await read('../src/ui/app.ts');
  assert.match(document, /id="gg-session-history"[\s\S]*?aria-controls="gg-session-history-dialog"/);
  assert.doesNotMatch(document, /id="gg-swipe-right"|id="gg-gal-back"/);
  assert.match(document, /id="gg-session-history-dialog"/);
  assert.doesNotMatch(document, /id="gg-swipe-left"/);
  assert.match(app, /function sessionHistoryMessages/);
  assert.match(app, /activeSessionActionId/);
  assert.match(app, /parseGardenAction\(message\.text\)/);
  assert.match(app, /sessionHistoryButton\.addEventListener\('click', \(\) => void openSessionHistory\(\)\)/);
  assert.match(app, /gensokyoUserVisibleText/);
  assert.match(app, /userHistoryText\(message\)/);
  assert.doesNotMatch(app, /byId\('gg-swipe-right'\)|byId\('gg-gal-back'\)/);
  assert.match(app, /gg-scene-text'\)\.textContent = ''/);
});

test('温室研究交流单轮结算、回复后自动完成', async () => {
  const app = await read('../src/ui/app.ts');
  const actions = await read('../src/ui/target-actions.ts');
  const settlement = await read('../src/ui/event-settlement.ts');
  const eventConfig = await read('../src/lorebook/events/greenhouse-vertical-slice.json');
  assert.doesNotMatch(app, /GREENHOUSE_RESEARCH_INPUT_MAX_LENGTH/);
  assert.match(app, /greenhouseResearchJustSettled/);
  assert.match(app, /温室研究交流已完成/);
  assert.match(actions, /单轮收束/);
  assert.match(actions, /约 300 个汉字以内/);
  assert.match(settlement, /GREENHOUSE_RESEARCH_MAX_EFFECTIVE_ROUNDS = 1/);
  assert.match(settlement, /completeGreenhouseConversation/);
  assert.match(eventConfig, /"max_effective_rounds": 1/);
  assert.doesNotMatch(eventConfig, /"maximum_effective_rounds": 2/);
  assert.doesNotMatch(eventConfig, /"auto_settle_on_max_rounds": true/);
});

test('在场快照会注入每次庭园请求，并以受控回执同步角色离场', async () => {
  const actions = await importTypescript('../src/ui/target-actions.ts');
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const state = {
    characters: { reimu: { name: '博丽灵梦' }, marisa: { name: '雾雨魔理沙' } },
    presence_snapshot: {
      present_character_ids: ['reimu', 'marisa'],
      character_views: { marisa: { area_id: 'greenhouse_plot', action: '观察温室', facing: 'left' } },
    },
  };
  const request = actions.withGardenNarrativeContract('测试请求', state);
  assert.match(request, /庭园在场快照：本轮唯一事实/);
  assert.match(request, /marisa（雾雨魔理沙）：greenhouse_plot/);
  const next = settlement.applyPresenceUpdate(state, [
    '魔理沙骑扫帚离开了。',
    '<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu"],"character_views":{"reimu":{"area_id":"central_courtyard","action":"等待","facing":"front"}}}</GensokyoPresence>',
  ].join('\n'));
  assert.deepEqual(next.presence_snapshot.present_character_ids, ['reimu']);
  assert.equal(next.presence_snapshot.character_views.marisa, undefined);
  const leakedDraft = settlement.applyPresenceUpdate(state, [
    '<draft>必须输出<GensokyoPresence>{"not":"a callback"}</draft>',
    '【庭园正文结束】',
    '<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu","marisa"],"character_views":{"reimu":{"area_id":"central_courtyard"},"marisa":{"area_id":"greenhouse_plot","action":"抵达温室","facing":"front"}}}</GensokyoPresence>',
  ].join('\n'));
  assert.deepEqual(leakedDraft.presence_snapshot.present_character_ids, ['reimu', 'marisa']);
  assert.equal(leakedDraft.presence_snapshot.character_views.marisa.action, '抵达温室');
  assert.match(bridge, /applyPresenceUpdate/);
  assert.match(bridge, /raw\?\.message \?\? raw\?\.mes/);
});

test('L1 回执重建快照保留仍在场角色 visitor meta 并删除离场角色', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const state = {
    characters: {
      reimu: { name: '博丽灵梦' },
      marisa: { name: '雾雨魔理沙' },
      alice: { name: '爱丽丝' },
    },
    presence_snapshot: {
      present_character_ids: ['reimu', 'marisa'],
      character_views: {
        reimu: { area_id: 'central_courtyard', action: '等待', facing: 'front' },
        marisa: { area_id: 'greenhouse_plot', action: '观察温室', facing: 'left' },
      },
      visitor_meta: {
        reimu: {
          arrival_uid: 'visit:chat:1:reimu',
          reason_id: 'formal_visit',
          source: 'random',
          arrived_period_serial: 2,
          earliest_departure_serial: 3,
          planned_departure_serial: 4,
          passthrough_flag: '保留未知字段',
        },
        marisa: {
          arrival_uid: 'visit:chat:1:marisa',
          reason_id: 'magic_curiosity',
          source: 'random',
          arrived_period_serial: 2,
          earliest_departure_serial: 3,
          planned_departure_serial: 5,
        },
      },
    },
  };
  const originalSnapshot = structuredClone(state.presence_snapshot);
  const next = settlement.applyPresenceUpdate(state, [
    '灵梦留在庭院，魔理沙离开，爱丽丝到场。',
    '<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu","alice"],"character_views":{"reimu":{"area_id":"central_courtyard","action":"等待","facing":"front"},"alice":{"area_id":"greenhouse_plot","action":"抵达温室","facing":"front"}}}</GensokyoPresence>',
  ].join('\n'));
  // 仍在场角色保留完整 meta（含未知 passthrough 字段）
  assert.deepEqual(next.presence_snapshot.present_character_ids, ['reimu', 'alice']);
  assert.deepEqual(next.presence_snapshot.visitor_meta.reimu, state.presence_snapshot.visitor_meta.reimu);
  // 已离场角色 view 与 meta 均删除
  assert.equal(next.presence_snapshot.character_views.marisa, undefined);
  assert.equal(next.presence_snapshot.visitor_meta.marisa, undefined);
  // 回执新加入角色不得伪造 visitor meta
  assert.equal(next.presence_snapshot.visitor_meta.alice, undefined);
  // 输入 state 未被原地修改
  assert.deepEqual(state.presence_snapshot, originalSnapshot);
});

test('时段 schema 接受口语别名并映射到四值', async () => {
  const schema = await read('../src/schema/02-mvu-schema.js');
  assert.match(schema, /z\.preprocess/);
  assert.match(schema, /下午:\s*'白昼'/);
  assert.match(schema, /晚上:\s*'夜晚'/);
  const rules = await read('../src/lorebook/variable-update-rules.md');
  assert.match(rules, /只能是：清晨、白昼、黄昏、夜晚/);
});

test('变量模型规则只保留写入合同，不携带本地事件施工手册', async () => {
  const rules = await read('../src/lorebook/variable-update-rules.md');
  const format = await read('../src/lorebook/variable-output-format.md');
  const ledger = await read('../src/schema/field-ledger.md');
  assert.ok(Buffer.byteLength(rules, 'utf8') < 7000, '变量更新规则应保持为紧凑合同');
  assert.ok(Buffer.byteLength(format, 'utf8') < 1000, '输出格式只负责外壳，不应重复更新规则');
  assert.match(rules, /变量模型只可写以下内容/);
  assert.match(rules, /本地 bridge 独占以下根或语义/);
  assert.match(rules, /不得通过替换父对象绕过禁写子路径/);
  assert.match(rules, /interaction\.conversation_log.*已退役/);
  assert.match(rules, /interaction\.visit_memory.*全部路径/);
  assert.doesNotMatch(rules, /main_house_enabled|greenhouse_flower_core_tutorial_v1|rewarded_ids|zako_tag_count/);
  assert.doesNotMatch(rules, /12\/24|28 个标准时段|80 金币|4 物资|3 物资/);
  assert.match(format, /以 `\[mvu_update\] 变量更新规则` 为准/);
  assert.match(format, /interaction\.visit_memory.*bridge 独占.*禁止输出/);
  assert.doesNotMatch(format, /不得整体替换|向数组末尾追加元素|replace` 的目标必须已存在/);
  assert.match(ledger, /interaction\.current_session[^\n]*bridge 创建\/关闭\/结算/);
  assert.match(ledger, /interaction\.settled_ids[^\n]*bridge/);
  assert.match(ledger, /battle\.settled_ids[^\n]*bridge/);
  assert.match(ledger, /key_items[^\n]*变量模型禁写/);
});

test('R19 温室行动按线索、灵感、清理、建造和首次使用逐段解锁', async () => {
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const state = {
    resources: { materials: 3, inspiration: 1 },
    areas: { greenhouse_plot: { unlocked: false, state: '未清理' } },
    facilities: { magic_greenhouse: { state: '可建设', current_form: null } },
    events: { active_event: null, completed_key_events: { reimu_boundary_inspection: 'temporary_permission' } },
    interaction: { current_session: null },
    battle: { current: null, settled_ids: [] },
  };
  assert.equal(rules.greenhouseDiscoveryVisible(state), true);
  assert.equal(rules.greenhouseActionBlock(state, 'investigate_magic_trace'), '');
  state.events.completed_key_events.marisa_material_rumor = 'greenhouse_clue_found';
  state.areas.greenhouse_plot.unlocked = true;
  state.events.completed_key_events.main_house_repair = 'main_house_enabled';
  assert.equal(rules.greenhouseActionBlock(state, 'hear_marisa_plan'), '');
  state.events.completed_key_events.gain_second_inspiration = 'hear_marisa_plan';
  state.resources.inspiration = 2;
  assert.equal(rules.greenhouseActionBlock(state, 'clear_greenhouse_foundation'), '');
  state.events.completed_key_events.clear_greenhouse_foundation = 'foundation_cleared';
  assert.match(rules.greenhouseActionBlock(state, 'build_basic_magic_greenhouse'), /4 点物资/);
  state.resources.materials = 4;
  assert.equal(rules.greenhouseActionBlock(state, 'build_basic_magic_greenhouse'), '');
  state.events.completed_key_events.build_basic_magic_greenhouse = 'basic_greenhouse_enabled';
  state.facilities.magic_greenhouse = { state: '启用', current_form: '基础魔法温室' };
  assert.equal(rules.greenhouseActionBlock(state, 'greenhouse_first_use'), '');
});

test('R20 妖花核心只接受活动事件中的白名单可信结果并拒绝重复结算', async () => {
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const state = {
    events: {
      active_event: { config_id: rules.GREENHOUSE_EVENTS.flowerCore },
      completed_key_events: {
        greenhouse_first_use: 'stable_first_growth',
        greenhouse_multiturn_conversation: 'conversation_settled_after_multiple_turns',
      },
    },
    battle: { current: null, settled_ids: [] },
  };
  const valid = {
    settlement_id: 'greenhouse-flower-core-test-1',
    config_id: rules.FLOWER_CORE_BATTLE_CONFIG,
    outcome: 'clean_win',
    remaining_lives: 2,
    grazes: 12,
    duration_ms: 4567,
    hits: 20,
    damage: 80,
    phases_cleared: 2,
    objective_ratio: 100,
  };
  assert.deepEqual(rules.validateFlowerCoreBattleResult(valid, state), valid);
  assert.throws(
    () => rules.validateFlowerCoreBattleResult({ ...valid, config_id: 'untrusted' }, state),
    /白名单/,
  );
  assert.throws(
    () => rules.validateFlowerCoreBattleResult({ ...valid, objective_ratio: 101 }, state),
    /objective_ratio/,
  );
  state.battle.settled_ids.push(valid.settlement_id);
  assert.throws(() => rules.validateFlowerCoreBattleResult(valid, state), /已经结算/);
});

test('妖花核心入口不再暴露为设置页演练，结算先写 battle.current 再生成剧情', async () => {
  const document = await read('../src/ui/index.html');
  const app = await read('../src/ui/app.ts');
  const bridge = await read('../src/ui/bridge.ts');
  assert.doesNotMatch(document, /id="gg-start-battle"/);
  assert.match(app, /bridge\.stageBattleResult\(result\)/);
  assert.match(app, /buildBattleSettlementMessage\(result\)/);
  assert.match(bridge, /nextState\.battle = \{ \.\.\.nextState\.battle, current: trusted \}/);
  assert.match(bridge, /可信战斗结果写入后复读校验失败/);
  assert.match(bridge, /已有另一份待结算战斗结果，不能覆盖/);
});

test('R21 本地结算器原子完成温室主链，温室研究交流为单轮结算', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  let state = JSON.parse(await read('../src/schema/initial-state.json'));
  const action = (action_id, event_id) => ({ version: 'garden-action.v1', action_id, event_id });
  const result = (event_id, value) => `<GensokyoEventResult>{"version":"event-result.v1","event_id":"${event_id}","result":"${value}"}</GensokyoEventResult>`;

  state = settlement.applyLocalSettlement(state, action('inspect_boundary', 'reimu_boundary_inspection'), 1, result('reimu_boundary_inspection', 'temporary_permission'));
  state = settlement.applyLocalSettlement(state, action('investigate_magic_trace', 'marisa_material_rumor'), 2, result('marisa_material_rumor', 'greenhouse_clue_found'));
  assert.equal(state.areas.greenhouse_plot.unlocked, true);
  assert.equal(state.facilities.magic_greenhouse.state, '可建设');
  assert.equal(state.characters.marisa.name, '雾雨魔理沙');
  assert.ok(state.presence_snapshot.present_character_ids.includes('marisa'));

  state = settlement.applyLocalSettlement(state, action('repair', 'main_house_repair'), 3, result('main_house_repair', 'main_house_enabled'));
  state = settlement.applyLocalSettlement(state, action('hear_marisa_plan', 'gain_second_inspiration'), 4, result('gain_second_inspiration', 'hear_marisa_plan'));
  assert.equal(state.resources.materials, 5);
  assert.equal(state.resources.inspiration, 2);
  state = settlement.applyLocalSettlement(state, action('clear_greenhouse_foundation', 'clear_greenhouse_foundation'), 5, result('clear_greenhouse_foundation', 'foundation_cleared'));
  state = settlement.applyLocalSettlement(state, action('build_basic_magic_greenhouse', 'build_basic_magic_greenhouse'), 6, result('build_basic_magic_greenhouse', 'basic_greenhouse_enabled'));
  assert.equal(state.resources.materials, 1);
  assert.equal(state.resources.inspiration, 0);
  assert.equal(state.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.deepEqual(state.facilities.magic_greenhouse.unlocked_forms, ['基础魔法温室']);

  state = settlement.applyLocalSettlement(state, action('greenhouse_first_use', 'greenhouse_first_use'), 7, result('greenhouse_first_use', 'stable_first_growth'));
  // 温室研究交流为单轮固定结算：一次回复即写入完成标记，不创建/依赖跨轮会话。
  state = settlement.applyLocalSettlement(state, action('greenhouse_research_talk', 'greenhouse_multiturn_conversation'), 8, '单轮研究交流');
  assert.equal(state.interaction.current_session, null);
  assert.equal(state.events.completed_key_events.greenhouse_multiturn_conversation, 'conversation_settled_after_multiple_turns');
  assert.deepEqual(state.interaction.settled_ids, ['interaction:greenhouse_multiturn_conversation']);
  // 幂等：重复结算不改变完成标记，也不新建会话。
  state = settlement.applyLocalSettlement(state, action('greenhouse_research_talk', 'greenhouse_multiturn_conversation'), 9, '再次尝试');
  assert.equal(state.events.completed_key_events.greenhouse_multiturn_conversation, 'conversation_settled_after_multiple_turns');
  assert.deepEqual(state.interaction.settled_ids, ['interaction:greenhouse_multiturn_conversation']);
  assert.equal(state.interaction.current_session, null);
  assert.equal(settlement.localSettlementAction('第三轮不应再被视为研究续聊', state), null);

  // 旧版两段式残留的活跃会话：玩家在旧机制下卡住（会话存在但从未完成），新结算应清理会话并写入完成标记。
  const legacyStuck = JSON.parse(await read('../src/schema/initial-state.json'));
  legacyStuck.events.completed_key_events.greenhouse_first_use = 'stable_first_growth';
  legacyStuck.interaction ??= { current_session: null, settled_ids: [] };
  legacyStuck.interaction.current_session = {
    uid: 'interaction_legacy', type: 'facility', status: 'active', area_id: 'greenhouse_plot',
    participant_character_ids: ['marisa'], facility_id: 'magic_greenhouse',
    event_id: 'greenhouse_multiturn_conversation', focus: '旧会话', summary: '旧版两段式残留',
    last_effective_message_id: 5, effective_rounds: 1, settled: false,
  };
  const rescued = settlement.applyLocalSettlement(legacyStuck, action('greenhouse_research_talk', 'greenhouse_multiturn_conversation'), 10, '重新研究');
  assert.equal(rescued.events.completed_key_events.greenhouse_multiturn_conversation, 'conversation_settled_after_multiple_turns');
  assert.equal(rescued.interaction.current_session, null);

  state = settlement.applyLocalSettlement(state, action('investigate_flower_core', 'greenhouse_flower_core'), 11, '激活');
  state.battle.current = {
    settlement_id: 'r21-test-narrative',
    config_id: 'greenhouse_flower_core_tutorial_v1',
    outcome: 'narrative',
    remaining_lives: 3,
    grazes: 0,
    duration_ms: 0,
    hits: 0,
    damage: 0,
    phases_cleared: 0,
    objective_ratio: 100,
  };
  state = settlement.applyLocalSettlement(state, action('settle_flower_core_battle', 'greenhouse_flower_core'), 12, '结算');
  assert.equal(state.battle.current, null);
  assert.deepEqual(state.battle.settled_ids, ['r21-test-narrative']);
  assert.equal(state.events.completed_key_events.greenhouse_flower_core, 'narrative');
  assert.match(state.memory.long_term_notes.join('\n'), /移动锚点/);
  assert.deepEqual(state.anchors.stable, {});
});

test('R21 非受控自由文本不能篡改本地托管事件字段', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const before = JSON.parse(await read('../src/schema/initial-state.json'));
  before.events.completed_key_events.reimu_boundary_inspection = 'temporary_permission';
  const after = structuredClone(before);
  after.areas.greenhouse_plot.unlocked = false;
  after.areas.greenhouse_plot.state = '清理中';
  after.facilities.magic_greenhouse.state = '可建设';
  after.events.active_event = { config_id: 'marisa_material_rumor' };
  after.events.completed_key_events.clear_greenhouse_foundation = 'foundation_cleared';
  after.battle.current = { settlement_id: 'forged', config_id: 'forged' };
  const restored = settlement.restoreLocalEventOwnership(before, after);
  assert.equal(restored.areas.greenhouse_plot.unlocked, before.areas.greenhouse_plot.unlocked);
  assert.equal(restored.areas.greenhouse_plot.state, before.areas.greenhouse_plot.state);
  assert.equal(restored.facilities.magic_greenhouse.state, before.facilities.magic_greenhouse.state);
  assert.equal(restored.events.active_event, null);
  assert.equal(restored.events.completed_key_events.clear_greenhouse_foundation, undefined);
  assert.equal(restored.battle.current, null);
});

test('R21 空回复与本地结算失败进入可重试事务，不重复创建玩家楼层', async () => {
  const transaction = await read('../src/ui/message-transaction.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const app = await read('../src/ui/app.ts');
  assert.match(transaction, /markGenerationEnded/);
  assert.match(transaction, /没有收到可用的 assistant 正文/);
  assert.match(transaction, /markSettlementFailed/);
  assert.match(bridge, /pendingSettlement/);
  assert.match(bridge, /persistPendingSettlement/);
  assert.match(bridge, /restoreLocalEventOwnership/);
  assert.match(app, /重试本地结算/);
});

test('事务收到正文后保持结算锁，只有本地结算成功才能接受下一条消息', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  let releaseGeneration;
  const generationGate = new Promise((resolve) => { releaseGeneration = resolve; });
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-1',
    listMessages: () => messages,
    async createUserMessage(message, extra) {
      messages.push({ message_id: messages.length, role: 'user', message, extra });
    },
    async triggerGeneration() {
      await generationGate;
      messages.push({ message_id: messages.length, role: 'assistant', message: '完整回复' });
    },
    async continueGeneration() {},
  });
  const first = coordinator.submit({ kind: 'interaction', message: '第一条' });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    coordinator.submit({ kind: 'settlement', message: '不该出现的收尾楼层' }),
    /上一条消息仍在处理中/,
  );
  releaseGeneration();
  const received = await first;
  assert.equal(received.assistantResponded, true);
  assert.equal(received.phase, 'settling');
  await assert.rejects(
    coordinator.submit({ kind: 'settlement', message: '结算期间也不能提交' }),
    /上一条消息仍在处理中/,
  );
  coordinator.markSettlementSucceeded();
  assert.equal(coordinator.read().phase, 'settled');
});

test('迟到的 trigger Promise 不能把后台已完成的事务倒退回结算中', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  let releaseTrigger;
  const triggerGate = new Promise((resolve) => { releaseTrigger = resolve; });
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-native-switch',
    listMessages: () => messages,
    async createUserMessage(message, extra) {
      messages.push({ message_id: 1, role: 'user', message, extra });
    },
    async triggerGeneration() {
      messages.push({ message_id: 2, role: 'assistant', message: '回复与本地结算已经完成' });
      await triggerGate;
    },
    async continueGeneration() {},
  });
  const pending = coordinator.submit({ kind: 'interaction', message: '检查结界' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(coordinator.read().phase, 'settling');
  coordinator.markSettlementSucceeded();
  releaseTrigger();
  const completed = await pending;
  assert.equal(completed.phase, 'settled');
  assert.equal(completed.assistantMessageId, 2);
});

test('Luker 先结束生成再落 assistant 楼层时 GAL 不闪入失败态', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  let releaseTrigger;
  const triggerGate = new Promise((resolve) => { releaseTrigger = resolve; });
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-luker-event-order',
    listMessages: () => messages,
    async createUserMessage(message, extra) {
      messages.push({ message_id: 1, role: 'user', message, extra });
    },
    async triggerGeneration() {
      await triggerGate;
    },
    async continueGeneration() {},
  });
  const pending = coordinator.submit({ kind: 'interaction', message: '和魔理沙聊天' });
  await new Promise((resolve) => setImmediate(resolve));
  coordinator.markGenerationEnded();
  assert.equal(coordinator.read().phase, 'generating');
  assert.equal(coordinator.read().lastError, undefined);
  messages.push({ message_id: 2, role: 'assistant', message: '魔理沙的回复' });
  assert.equal(coordinator.read().phase, 'settling');
  releaseTrigger();
  const completed = await pending;
  assert.equal(completed.phase, 'settling');
  assert.equal(completed.assistantMessageId, 2);
});

test('首次玩家楼层稳定后才触发 LLM', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  const order = [];
  let releasePreparation;
  const preparationGate = new Promise((resolve) => { releasePreparation = resolve; });
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-initial-floor-stability',
    listMessages: () => messages,
    async createUserMessage(message, extra) {
      order.push('create');
      messages.push({ message_id: 1, role: 'user', message, extra });
    },
    async prepareGeneration() {
      order.push('prepare');
      await preparationGate;
    },
    async triggerGeneration() {
      order.push('trigger');
      messages.push({ message_id: 2, role: 'assistant', message: '正常回复' });
    },
    async continueGeneration() {},
  });
  const pending = coordinator.submit({ kind: 'interaction', message: '首次发送' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ['create', 'prepare']);
  assert.equal(coordinator.read().phase, 'generating');
  releasePreparation();
  const completed = await pending;
  assert.deepEqual(order, ['create', 'prepare', 'trigger']);
  assert.equal(completed.phase, 'settling');
});

test('Luker 空 assistant 占位会保持生成态直到假流式正文落盘', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-empty-assistant-placeholder',
    listMessages: () => messages,
    isGenerationActive: () => false,
    async createUserMessage(message, extra) {
      messages.push({ message_id: 1, role: 'user', message, extra });
    },
    async triggerGeneration() {
      messages.push({ message_id: 2, role: 'assistant', message: '' });
      setTimeout(() => {
        messages[1].message = '假流式同步完成后的正文';
      }, 60);
    },
    async continueGeneration() {},
  });
  const pending = coordinator.submit({ kind: 'interaction', message: '首次自动调用' });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(coordinator.read().phase, 'generating');
  assert.equal(coordinator.read().lastError, undefined);
  const completed = await pending;
  assert.equal(completed.phase, 'settling');
  assert.equal(completed.assistantMessageId, 2);
});

test('Luker 在消息 API 可见 assistant 楼层前解除生成 UI 时仍等待 MESSAGE_RECEIVED 后的正文', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-luker-dom-first',
    listMessages: () => messages,
    isGenerationActive: () => false,
    assistantResponseTimeoutMs: 1000,
    async createUserMessage(message, extra) {
      messages.push({ message_id: 1, role: 'user', message, extra });
    },
    async triggerGeneration() {
      setTimeout(() => {
        messages.push({ message_id: 2, role: 'assistant', message: 'MESSAGE_RECEIVED 后才可见的正文' });
        coordinator.markAssistantMessageReceived(2);
      }, 60);
    },
    async continueGeneration() {},
  });
  const pending = coordinator.submit({ kind: 'interaction', message: '等待 Luker 落盘' });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(coordinator.read().phase, 'generating');
  const completed = await pending;
  assert.equal(completed.phase, 'settling');
  assert.equal(completed.assistantMessageId, 2);
});

test('流式 assistant 正文可被观察，但必须等 GENERATION_ENDED 才进入结算', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  let generating = true;
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-streaming-floor',
    listMessages: () => messages,
    isGenerationActive: () => generating,
    async createUserMessage(message, extra) {
      messages.push({ message_id: 1, role: 'user', message, extra });
    },
    async triggerGeneration() {
      messages.push({ message_id: 2, role: 'assistant', message: '第一段仍在生成' });
    },
    async continueGeneration() {},
  });
  const pending = coordinator.submit({ kind: 'interaction', message: '观察流式楼层' });
  await new Promise((resolve) => setTimeout(resolve, 35));
  const duringStream = coordinator.read();
  assert.equal(duringStream.assistantResponded, true);
  assert.equal(duringStream.phase, 'generating');
  generating = false;
  coordinator.markGenerationEnded();
  const completed = await pending;
  assert.equal(completed.phase, 'settling');
  assert.equal(completed.assistantMessageId, 2);
});

test('本地结束会废弃失败事务，下一次角色互动可以重新提交', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-local-end-reset',
    listMessages: () => messages,
    async createUserMessage(message, extra) {
      messages.push({ message_id: messages.length, role: 'user', message, extra });
    },
    async triggerGeneration() {
      messages.push({ message_id: messages.length, role: 'assistant', message: '可显示回复' });
    },
    async continueGeneration() {},
  });
  const first = await coordinator.submit({ kind: 'interaction', message: '聊天' });
  assert.equal(first.phase, 'settling');
  coordinator.markSettlementFailed(new Error('模拟本地结算失败'));
  assert.equal(coordinator.read().phase, 'failed');
  coordinator.resetAfterLocalEnd();
  assert.equal(coordinator.read().phase, 'idle');
  const second = await coordinator.submit({ kind: 'interaction', message: '摸摸头' });
  assert.equal(second.assistantResponded, true);
});

test('await trigger 返回但没有正文时进入可重试失败态，不再永久显示回应中', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-2',
    listMessages: () => messages,
    assistantResponseTimeoutMs: 1000,
    async createUserMessage(message, extra) {
      messages.push({ message_id: messages.length, role: 'user', message, extra });
    },
    async triggerGeneration() {},
    async continueGeneration() {},
  });
  const result = await coordinator.submit({ kind: 'interaction', message: '触发失败' });
  assert.equal(result.phase, 'failed');
  assert.equal(result.assistantResponded, false);
  assert.match(result.lastError, /请求可能未启动/);
});

test('假流式 trigger 提前返回时事务会等待当前楼层，不会借用旧回复', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [
    { message_id: 0, role: 'assistant', message: '开场' },
    { message_id: 1, role: 'user', message: '旧请求', extra: { gensokyoTransactionId: 'old' } },
    { message_id: 2, role: 'assistant', message: '旧回复' },
  ];
  let generating = false;
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-fake-stream',
    listMessages: () => messages,
    isGenerationActive: () => generating,
    async createUserMessage(message, extra) {
      messages.push({ message_id: messages.length, role: 'user', message, extra });
    },
    async triggerGeneration() {
      generating = true;
      setTimeout(() => {
        messages.push({ message_id: messages.length, role: 'assistant', message: '新回复' });
        generating = false;
      }, 40);
    },
    async continueGeneration() {},
  });
  const result = await coordinator.submit({ kind: 'interaction', message: '新请求' });
  assert.equal(result.assistantResponded, true);
  assert.equal(result.assistantMessageId, 4);
  assert.equal(result.phase, 'settling');
});

test('GAL 只选择当前用户楼层之后的回复，等待中不回退到上一轮', async () => {
  const selection = await importTypescript('../src/ui/gal-message-selection.ts');
  const messages = [
    { id: 0, role: 'assistant', name: '', text: '开场' },
    { id: 1, role: 'user', name: '', text: '旧请求' },
    { id: 2, role: 'assistant', name: '', text: '旧回复' },
    { id: 3, role: 'user', name: '', text: '新请求' },
  ];
  assert.equal(selection.assistantForCurrentTurn(messages), null);
  assert.equal(selection.assistantForCurrentTurn(messages, 1)?.id, 2);
  messages.push({ id: 4, role: 'assistant', name: '', text: '新回复' });
  assert.equal(selection.assistantForCurrentTurn(messages)?.id, 4);
});

test('GAL 稳定后忽略旧事务锚点，原生输入的新回复应接管场景', async () => {
  const selection = await importTypescript('../src/ui/gal-message-selection.ts');
  const messages = [
    { id: 0, role: 'user', name: '', text: 'GAL 旧请求' },
    { id: 1, role: 'assistant', name: '', text: '旧回复（normal）' },
    { id: 2, role: 'user', name: '', text: '原生输入的新请求' },
    { id: 3, role: 'assistant', name: '', text: '新回复（nude）' },
  ];
  assert.equal(selection.assistantForCurrentTurn(messages, 0)?.id, 1);
  assert.equal(selection.assistantForCurrentTurn(messages)?.id, 3);

  const app = await read('../src/ui/app.ts');
  assert.match(app, /transaction\.phase === 'submitting_user' \|\| transaction\.phase === 'generating'[\s\S]*?assistantForCurrentTurn\(messages, transaction\.userMessageId\)/);
  assert.match(app, /messages \?\?= await bridge\.listMessages\(\);[\s\S]*?latest \?\?= assistantForCurrentTurn\(messages\);/);
});

test('返回原生聊天后重新打开游戏会主动校正事务状态', async () => {
  const app = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  const bridge = await read('../src/ui/bridge.ts');
  const shell = await read('../src/runtime/ui-host-shell.js');
  assert.match(shell, /gensokyo-garden:resume/);
  assert.match(app, /addEventListener\('gensokyo-garden:resume'/);
  assert.match(app, /if \(returnView === 'gal'\) void refresh\(\)/);
  assert.match(app, /回复已收到，正在同步游戏状态/);
  assert.match(app, /gg-regenerate'\)\.disabled = active/);
  assert.match(app, /gg-stop'\)\.disabled = !active \|\| !stoppable/);
  assert.match(styles, /\.gg-dialogue-box\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(bridge, /gensokyoSystemOperation/);
  assert.match(bridge, /recoverRecordedAnomalyResolution/);
  assert.match(bridge, /recoverCompletedCurrentTransaction/);
  assert.match(bridge, /settlementProjection\(current, action, assistantMessageId\)/);
  assert.match(bridge, /reconcileHostGenerationActivity\([\s\S]*?hostGenerationActive,[\s\S]*?snapshot,[\s\S]*?nativeSendStopButtonGenerating\(\)/);
  assert.match(bridge, /regenerationPhase/);
  assert.match(bridge, /const targetMessageId = target\.messageId/);
  assert.match(bridge, /transactions\.markStopped\(/);
  assert.match(bridge, /当前回复仍在生成或同步状态，不能提前结束聊天/);
  assert.match(bridge, /gensokyoTransactionKind === 'settlement'/);
  assert.match(bridge, /includes\('【异变最终收束】'\)/);
});

test('庭园主线只使用本地白名单结算，不依赖预设的第二次解析', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const contract = await read('../project/contract.md');
  const app = await read('../src/ui/app.ts');
  assert.match(bridge, /\/trigger await=true/);
  assert.match(bridge, /deterministicSettlementResult/);
  assert.match(bridge, /eventResultForAction\(event\.config_id, action\.action_id\) \?\? event\.allowed_results\[0\]/);
  assert.deepEqual(registry.eventById.get('reimu_boundary_inspection').allowed_results, [
    'temporary_permission', 'supervised_restriction', 'urgent_seal_repair',
  ]);
  assert.equal(registry.eventById.get('main_house_repair').allowed_results[0], 'main_house_enabled');
  assert.equal(registry.eventById.get('marisa_material_rumor').allowed_results[0], 'greenhouse_clue_found');
  assert.equal(registry.eventById.get('build_basic_magic_greenhouse').allowed_results[0], 'basic_greenhouse_enabled');
  assert.match(bridge, /before\.battle\?\.current\?\.outcome/);
  assert.doesNotMatch(bridge, /json_schema/);
  assert.doesNotMatch(bridge, /第二次结算解析/);
  assert.match(contract, /不发起第二次模型解析/);
  assert.match(app, /restoreInputOnFailure: false/);
  assert.match(app, /galCompose\.hidden = streaming \|\| singleShotEventPresentation/);
});

test('全部教程剧情动作统一采用本地白名单与非空回复回执', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const tutorialEventIds = [
    'reimu_boundary_inspection',
    'main_house_repair',
    'marisa_material_rumor',
    'gain_second_inspiration',
    'clear_greenhouse_foundation',
    'build_basic_magic_greenhouse',
    'greenhouse_first_use',
    'greenhouse_multiturn_conversation',
    'greenhouse_flower_core',
    'greenhouse_free_growth_proposal',
    'alice_greenhouse_maintenance_proposal',
    'nitori_greenhouse_automation_proposal',
    'select_greenhouse_form',
  ];
  for (const eventId of tutorialEventIds) {
    const event = registry.eventById.get(eventId);
    assert.ok(event, `${eventId} 必须登记在事件注册表`);
    assert.ok(event.trigger_action_ids.length > 0, `${eventId} 必须提供教程动作`);
    for (const actionId of event.trigger_action_ids) {
      assert.equal(settlement.isLocalSettlementActionMarker({
        version: 'garden-action.v1',
        action_id: actionId,
        event_id: eventId,
      }), true, `${eventId}/${actionId} 必须走最简回执链路`);
    }
  }
});

test('R29 副本只由本地白名单结算金币、时段与幂等记录', async () => {
  const dungeon = await importTypescript('../src/ui/dungeon-rules.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  initial.battle.dungeon_unlocked = true;
  initial.environment.day = 7;
  initial.environment.time_period = '夜晚';
  const result = {
    settlement_id: 'dungeon-r29-clean-1', config_id: 'fairy_pattern_practice_v1', outcome: 'clean_win',
    remaining_lives: 3, grazes: 0, duration_ms: 1000, hits: 1, damage: 1, phases_cleared: 1, objective_ratio: 100,
  };
  const settled = dungeon.settleDungeonResult(initial, result);
  assert.equal(settled.resources.coins, 12);
  assert.equal(settled.environment.day, 8);
  assert.equal(settled.environment.time_period, '清晨');
  assert.equal(settled.battle.last_run.started_day, 7);
  assert.equal(settled.battle.last_run.settled_day, 8);
  assert.deepEqual(settled.battle.rewarded_ids, ['dungeon-r29-clean-1']);
  assert.throws(() => dungeon.settleDungeonResult(settled, result), /已经结算/);
  assert.throws(() => dungeon.validateDungeonResult({ ...result, outcome: 'narrative' }, initial), /不接受叙事/);
});

test('R29 旧存档迁移、事件契约与副本入口完整登记', async () => {
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  delete initial.resources.coins;
  delete initial.battle.dungeon_unlocked;
  delete initial.battle.rewarded_ids;
  const migrated = migration.migrateGardenState(initial);
  assert.equal(migrated.resources.coins, 0);
  assert.equal(migrated.battle.dungeon_unlocked, false);
  assert.deepEqual(migrated.battle.rewarded_ids, []);
  const registry = JSON.parse(await read('../src/battle/dungeon-registry.json'));
  assert.equal(registry.dungeons.length, 3);
  assert.equal(new Set(registry.dungeons.map((entry) => entry.config_id)).size, 3);
  const events = JSON.parse(await read('../src/lorebook/events/greenhouse-vertical-slice.json'));
  for (const event of events.events) {
    assert.ok(event.event_type);
    assert.ok(Array.isArray(event.trigger_action_ids));
    assert.ok(Array.isArray(event.narrative_outline));
    assert.ok(Array.isArray(event.forbidden_deviations));
  }
});

test('验收快进只写受控测试快照，能直达温室与妖花战后', async () => {
  const tools = await importTypescript('../src/ui/test-tools.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const greenhouse = tools.applyTestJump(initial, 'greenhouse_ready');
  assert.equal(greenhouse.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.equal(greenhouse.events.completed_key_events.greenhouse_flower_core, undefined);
  assert.equal(greenhouse.battle.dungeon_unlocked, false);
  const afterCore = tools.applyTestJump(initial, 'r29_after_flower_core');
  assert.equal(afterCore.events.completed_key_events.greenhouse_flower_core, 'clean_win');
  assert.equal(afterCore.battle.dungeon_unlocked, true);
  assert.equal(afterCore.battle.current, null);
  const app = await read('../src/ui/app.ts');
  const html = await read('../src/ui/index.html');
  assert.match(app, /applyTestJump/);
  assert.match(html, /测试控制面板/);
});

test('M2 验收快进可独立抵达开放庭园、异变、设施、来访和修复检查点', async () => {
  const tools = await importTypescript('../src/ui/test-tools.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const jumps = [
    'm2_open_garden',
    'm2_anomaly_ready',
    'm2_anomaly_resolution_ready',
    'm2_facilities_ready',
    'm2_visitors_ready',
    'm2_items_recovery_ready',
  ];
  for (const jump of jumps) {
    const state = tools.applyTestJump(initial, jump);
    assert.equal(tools.testJumpReached(state, jump), true, jump);
    assert.equal(state.events.completed_key_events.select_greenhouse_form, 'selected_free_growth');
    assert.equal(state.interaction.current_session, null);
    assert.equal(state.garden_projects.active_construction, null);
    assert.equal(state.garden.construction_stage, '开放');
    assert.equal(state.areas.main_house.state, '启用');
    assert.match(state.memory.long_term_notes.join('\n'), /新手教程.*不得重演教程/);
  }
  const open = tools.applyTestJump(initial, 'm2_open_garden');
  assert.deepEqual(open.resources, initial.resources);
  assert.deepEqual(open.inventory.consumables, initial.inventory.consumables);
  assert.equal(open.facility_runtime.fairy_garden.built, false);
  const tutorial = (await importTypescript('../src/ui/open-garden-rules.ts')).tutorialProgress(open);
  assert.equal(tutorial.completedCount, tutorial.totalCount);
  assert.equal(tutorial.currentStep, null);
  const sparsePreview = structuredClone(initial);
  delete sparsePreview.facility_runtime;
  assert.equal(tools.applyTestJump(sparsePreview, 'm2_facilities_ready').facility_runtime.fairy_garden.built, true);
  const anomaly = tools.applyTestJump(initial, 'm2_anomaly_ready');
  assert.equal(anomaly.inventory.consumables.incident_trigger_card, 3);
  assert.equal(anomaly.anomaly_cycle.active, null);
  const ending = tools.applyTestJump(initial, 'm2_anomaly_resolution_ready');
  assert.equal(ending.environment.day, 8);
  assert.equal(ending.anomaly_cycle.active.status, 'resolving');
  const facilities = tools.applyTestJump(initial, 'm2_facilities_ready');
  assert.equal(facilities.facility_runtime.moon_spring.unlocked_forms.length, 3);
  const visitors = tools.applyTestJump(initial, 'm2_visitors_ready');
  assert.deepEqual(visitors.presence_snapshot.present_character_ids, ['reimu', 'marisa', 'alice']);
  assert.equal(visitors.presence_snapshot.character_views.reimu.action, '在庭院休息');
  const repair = tools.applyTestJump(initial, 'm2_items_recovery_ready');
  assert.equal(repair.facility_runtime.fairy_garden.status, 'damaged');
  assert.equal(repair.inventory.consumables.emergency_repair_kit, 3);

  const app = await read('../src/ui/app.ts');
  const html = await read('../src/ui/index.html');
  for (const id of ['gg-test-m2-open', 'gg-test-m2-anomaly', 'gg-test-m2-anomaly-end', 'gg-test-m2-facilities', 'gg-test-m2-visitors', 'gg-test-m2-items']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /querySelectorAll<HTMLButtonElement>\('\[data-test-jump\]'\)/);
});

test('测试快进先修复持久层已结算但协调器仍 settling 的恢复态', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const method = bridge.slice(bridge.indexOf('async applyTestJump(jump: TestJumpId)'), bridge.indexOf('async purchaseShopItem'));
  assert.match(method, /let transaction = readTransaction\(\);[\s\S]*?\['submitting_user', 'generating'\]\.includes\(transaction\.phase\)/);
  assert.match(method, /transaction\.phase === 'settling'[\s\S]*?await settlePendingAfterReply\(true\);[\s\S]*?transaction = readTransaction\(\);/);
  assert.match(method, /if \(transaction\.phase === 'settling'\)[\s\S]*?当前回复仍在生成或同步状态/);
});

test('测试控制面板覆盖教程断点与八名角色在场编排', async () => {
  const tools = await importTypescript('../src/ui/test-tools.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const tutorialJumps = [
    'tutorial_boundary_ready',
    'tutorial_house_repair_ready',
    'tutorial_greenhouse_investigation_ready',
    'tutorial_greenhouse_build_ready',
    'tutorial_flower_core_ready',
    'tutorial_proposals_ready',
    'tutorial_form_selection_ready',
  ];
  for (const jump of tutorialJumps) {
    assert.equal(tools.testJumpReached(tools.applyTestJump(initial, jump), jump), true, jump);
  }

  let presence = tools.applyTestJump(initial, 'presence_sakuya');
  assert.deepEqual(presence.presence_snapshot.present_character_ids, ['reimu', 'sakuya']);
  assert.equal(presence.presence_snapshot.character_views.sakuya.area_id, 'central_courtyard');
  assert.equal(presence.presence_snapshot.character_views.sakuya.action, '测试入场');
  assert.ok(presence.visit_scheduler.known_characters.includes('sakuya'));
  presence = tools.applyTestJump(presence, 'presence_all');
  assert.equal(presence.presence_snapshot.present_character_ids.length, 8);
  assert.equal(tools.testJumpReached(presence, 'presence_all'), true);
  presence = tools.applyTestJump(presence, 'presence_clear');
  assert.deepEqual(presence.presence_snapshot.present_character_ids, []);

  const html = await read('../src/ui/index.html');
  const styles = await read('../src/ui/styles.css');
  assert.match(html, /id="gg-test-tutorial-title"/);
  assert.match(html, /id="gg-test-systems-title"/);
  assert.match(html, /id="gg-test-presence-title"/);
  for (const id of ['reimu', 'marisa', 'alice', 'nitori', 'cirno', 'mystia', 'suika', 'sakuya']) {
    assert.match(html, new RegExp(`data-test-jump="presence_${id}"`));
  }
  assert.match(styles, /\.gg-test-dashboard/);
  assert.match(styles, /\.gg-test-character-grid/);
});

test('助手楼层已经出现时会清除漏掉结束事件留下的宿主忙碌标志', async () => {
  const { reconcileHostGenerationActivity } = await importTypescript('../src/ui/async-coordination.ts');
  assert.equal(reconcileHostGenerationActivity(true, { assistantResponded: false }), true);
  assert.equal(reconcileHostGenerationActivity(true, { assistantResponded: true }), false);
  assert.equal(reconcileHostGenerationActivity(false, { assistantResponded: true }), false);
  assert.equal(reconcileHostGenerationActivity(false, { assistantResponded: true }, true), true);
  assert.equal(reconcileHostGenerationActivity(true, { assistantResponded: false }, false), false);
});

test('宿主提示词 dry-run 不会锁住测试快进，真实生成仍进入忙碌态', async () => {
  const { shouldTrackHostGenerationStart } = await importTypescript('../src/ui/async-coordination.ts');
  assert.equal(shouldTrackHostGenerationStart(true), false);
  assert.equal(shouldTrackHostGenerationStart(false), true);
  assert.equal(shouldTrackHostGenerationStart(undefined), true);

  const bridge = await read('../src/ui/bridge.ts');
  const handler = bridge.slice(
    bridge.indexOf("g.eventOn(g.tavern_events.GENERATION_STARTED"),
    bridge.indexOf("g.eventOn(g.tavern_events.GENERATION_STOPPED"),
  );
  assert.match(handler, /\(_type, _options, dryRun\)/);
  assert.match(handler, /shouldTrackHostGenerationStart\(dryRun\)/);
});

test('刷新请求落在旧 drain 结束与 Promise 清理之间时不会被悬挂', async () => {
  const { LatestRefreshQueue } = await importTypescript('../src/ui/async-coordination.ts');
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  let runs = 0;
  let tailRefresh;
  const queue = new LatestRefreshQueue(async () => {
    runs += 1;
    if (runs === 1) {
      markStarted();
      await firstGate;
    }
  }, 0);

  const firstRefresh = queue.request();
  await started;
  firstGate.then(() => { tailRefresh = queue.request(); });
  releaseFirst();
  await firstRefresh;
  await Promise.resolve();
  await tailRefresh;
  assert.equal(runs, 2);
});

test('R48 强制结算会越过后台未就绪探测，刷新队列不会悬挂或留下旧状态', async () => {
  const { LatestRefreshQueue, SettlementAttemptCoordinator } = await importTypescript('../src/ui/async-coordination.ts');

  let releaseProbe;
  const probeGate = new Promise((resolve) => { releaseProbe = resolve; });
  const settlement = new SettlementAttemptCoordinator();
  const attempts = [];
  const attempt = async (forceReady) => {
    attempts.push(forceReady);
    if (!forceReady) {
      await probeGate;
      return false;
    }
    return true;
  };
  const background = settlement.run(false, attempt);
  const forced = settlement.run(true, attempt);
  releaseProbe();
  assert.equal(await background, false);
  assert.equal(await forced, true);
  assert.deepEqual(attempts, [false, true]);

  const states = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  let runs = 0;
  const refreshes = new LatestRefreshQueue(async () => {
    runs += 1;
    if (runs === 1) {
      markFirstStarted();
      await firstGate;
    }
    states.push(runs);
  }, 0);
  const first = refreshes.request();
  await firstStarted;
  const latest = refreshes.request();
  releaseFirst();
  await Promise.all([first, latest]);
  assert.deepEqual(states, [1, 2]);
});

test('开放阶段提示严格切断新手教程，异变自由聊天不擅自生成源头线索', async () => {
  const tools = await importTypescript('../src/ui/test-tools.ts');
  const prompt = await importTypescript('../src/ui/prompt-context.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const state = tools.applyTestJump(initial, 'm2_anomaly_ready');
  state.anomaly_cycle.active = {
    anomaly_id: 'test-anomaly', title: '互换身体', rule_text: '所有人互换身体', scope_mode: 'all',
    character_ids: [], presentation_tone: '', excluded_content: '',
    hidden_origin: { name: '镜', type: '物件', summary: '秘密', location: '井底', cause: '愿力', resolution_method: '切断缘线' },
    public_summary: '身份错位', revealed_clues: [], status: 'active',
    start_period_serial: 0, end_period_serial: 28, last_guidance_day: 0, last_clue_day: null,
  };
  const text = prompt.buildPromptContext(state, { kind: 'ordinary' });
  assert.match(text, /阶段边界：教程已经彻底结束/);
  assert.match(text, /不得重演、续写或重新布置/);
  assert.match(text, /普通聊天不得新增、猜定或指向异变源头/);
  assert.doesNotMatch(text, /井底|切断缘线|"hidden_origin"/);
});

test('R30 小店目录以本地白名单原子购买物资，拒绝越界与重复结算', async () => {
  const shop = await importTypescript('../src/ui/shop-rules.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  initial.shop.unlocked = true;
  initial.resources.coins = 50;
  initial.resources.materials = 10;
  const one = shop.purchaseShopItem(initial, 'basic_material_single', 'shop-test-1');
  assert.equal(one.resources.coins, 44);
  assert.equal(one.resources.materials, 11);
  assert.throws(() => shop.purchaseShopItem(one, 'basic_material_single', 'shop-test-1'), /已经结算/);
  assert.throws(() => shop.purchaseShopItem(initial, 'unknown', 'shop-test-2'), /不在本地目录/);
  const poor = structuredClone(initial); poor.resources.coins = 5;
  assert.throws(() => shop.purchaseShopItem(poor, 'basic_material_single', 'shop-test-3'), /金币不够/);
  const full = structuredClone(initial); full.resources.materials = 19;
  assert.throws(() => shop.purchaseShopItem(full, 'basic_material_crate', 'shop-test-4'), /装不下/);
});

test('新人礼包：每聊天一次、48金币/4灵感/8物资、上限截断、迁移兜底', async () => {
  const shop = await importTypescript('../src/ui/shop-rules.ts');
  const migrations = await importTypescript('../src/ui/state-migrations.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  assert.equal(initial.interaction.starter_gift_claimed, false);
  const claimed = shop.claimStarterGift(initial);
  assert.equal(claimed.interaction.starter_gift_claimed, true);
  assert.equal(claimed.resources.coins, (initial.resources.coins ?? 0) + 48);
  assert.equal(claimed.resources.inspiration, (initial.resources.inspiration ?? 0) + 4);
  assert.equal(claimed.resources.materials, (initial.resources.materials ?? 0) + 8);
  assert.throws(() => shop.claimStarterGift(claimed), /已经领取/);
  // 上限截断：物资接近上限时不超 20、灵感不超 10、金币不超 99999
  const nearCap = structuredClone(initial);
  nearCap.resources.materials = 19; nearCap.resources.inspiration = 9; nearCap.resources.coins = 99990;
  const capped = shop.claimStarterGift(nearCap);
  assert.equal(capped.resources.materials, 20);
  assert.equal(capped.resources.inspiration, 10);
  assert.equal(capped.resources.coins, 99999);
  // 迁移兜底：旧状态无字段时默认 false
  const bare = migrations.migrateGardenState({ interaction: {} });
  assert.equal(bare.interaction.starter_gift_claimed, false);
  // bridge 同时暴露 claimStarterGift（正式版与离线预览 stub）
  const bridge = await read('../src/ui/bridge.ts');
  const types = await read('../src/ui/types.ts');
  assert.match(bridge, /async claimStarterGift\(\)/);
  assert.match(bridge, /claimStarterGift\(migrateGardenState/);
  assert.match(bridge, /Object\.assign\(previewState, claimStarterGift\(previewState\)\)/);
  assert.match(types, /claimStarterGift\(\): Promise<void>/);
  // UI：设置区按钮、4 秒倒计时、领取后禁用
  const html = await read('../src/ui/index.html');
  const app = await read('../src/ui/app.ts');
  assert.match(html, /gg-starter-gift/);
  assert.match(html, /请先阅读 4 秒/);
  assert.match(app, /secondsLeft = 4/);
  assert.match(app, /renderStarterGiftButton/);
  assert.match(app, /新人礼包（已领取）/);
});

test('R31 自由生长方案只由本地单回合结算登记，不提前选型或改变资源', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const actionRules = await importTypescript('../src/ui/target-actions.ts');
  const actions = await read('../src/ui/target-actions.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.environment.day = 4;
  state.environment.time_period = '夜晚';
  state.resources.materials = 7;
  state.resources.inspiration = 3;
  state.facilities.magic_greenhouse.state = '启用';
  state.facilities.magic_greenhouse.current_form = '基础魔法温室';
  state.facilities.magic_greenhouse.unlocked_forms = ['基础魔法温室'];
  state.events.completed_key_events.greenhouse_flower_core = 'clean_win';
  state.presence_snapshot.present_character_ids = ['reimu', 'marisa'];

  assert.equal(rules.greenhouseActionBlock(state, 'organize_free_growth_proposal'), '');
  assert.equal(actionRules.isFixedPresentationAction('organize_free_growth_proposal'), true);
  assert.equal(actionRules.isFixedPresentationAction('marisa_greenhouse_night_observation'), false);
  assert.equal(registry.eventById.get('greenhouse_free_growth_proposal').max_effective_rounds, 1);
  assert.match(actions, /organize_free_growth_proposal/);
  assert.match(actions, /marisa_greenhouse_night_observation/);
  const app = await read('../src/ui/app.ts');
  assert.match(app, /isRestoredFixedPresentation/);
  assert.match(app, /singleShotEventPresentation \|\|= isRestoredFixedPresentation/);
  assert.match(app, /if \(singleShotEventPresentation \|\| closurePresented\)/);
  assert.doesNotMatch(app, /galInput\.value = message/);

  const action = {
    version: 'garden-action.v1',
    action_id: 'organize_free_growth_proposal',
    event_id: 'greenhouse_free_growth_proposal',
  };
  const after = settlement.applyLocalSettlement(state, action, 42, [
    '【庭园正文开始】<narration>魔理沙把方案压在花盆旁。</narration>【庭园正文结束】',
    '<GensokyoEventResult>{"version":"event-result.v1","event_id":"greenhouse_free_growth_proposal","result":"forged"}</GensokyoEventResult>',
  ].join('\n'));
  assert.equal(after.events.completed_key_events.greenhouse_free_growth_proposal, 'wild_growth_plan_registered');
  assert.deepEqual(after.facilities.magic_greenhouse.unlocked_forms, ['基础魔法温室', '自由生长型温室']);
  assert.equal(after.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.equal(after.resources.materials, 7);
  assert.equal(after.resources.inspiration, 3);
  assert.equal(after.environment.time_period, '夜晚');
  assert.equal(after.characters.marisa.current_relationship_facts[0].source_event_id, 'greenhouse_free_growth_proposal');
  assert.deepEqual(after.presence_snapshot.present_character_ids, ['reimu', 'marisa']);
  assert.deepEqual(after.presence_snapshot.character_views.marisa, {
    area_id: 'greenhouse_plot', action: '讨论自由生长方案', facing: 'front',
  });

  const forged = structuredClone(after);
  forged.facilities.magic_greenhouse.current_form = '自由生长型温室';
  forged.characters.marisa.current_relationship_facts = [];
  const restored = settlement.restoreLocalEventOwnership(after, forged);
  assert.equal(restored.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.equal(restored.characters.marisa.current_relationship_facts.length, 1);

  const partial = {
    events: { completed_key_events: { greenhouse_flower_core: 'clean_win' } },
    battle: { current: null, settled_ids: [] },
  };
  const protectedPartial = settlement.restoreLocalEventOwnership(after, partial);
  assert.deepEqual(protectedPartial.meta, after.meta);
  assert.equal(protectedPartial.player.name, state.player.name);
  assert.equal(protectedPartial.events.completed_key_events.greenhouse_free_growth_proposal, 'wild_growth_plan_registered');

  const bridge = await read('../src/ui/bridge.ts');
  assert.match(bridge, /settlePendingAfterReply/);
  assert.match(bridge, /findRecordedLocalSettlement/);
  assert.match(bridge, /setInterval/);
  assert.match(bridge, /subscribe\(g\.tavern_events\?\.MESSAGE_RECEIVED,\s*\(messageId\)\s*=>\s*\{[\s\S]*?transactions\.markAssistantMessageReceived\(messageId\)/);
  assert.match(bridge, /variableUpdateEpoch \+= 1/);
  assert.match(bridge, /isDuringExtraAnalysis/);
  assert.match(bridge, /ownershipBase = persistedStateBefore\(mvu, assistantMessageId\) \?\? before/);
  assert.match(bridge, /restoreLocalEventOwnership\(ownershipBase, base\)/);
  assert.match(bridge, /hasLocalPresenceTransition\(action\)/);
  assert.match(bridge, /eventById\.get\(action\.event_id\)/);
  assert.doesNotMatch(bridge, /subscribe\(g\.tavern_events\?\.MESSAGE_RECEIVED, true\)/);
  assert.match(bridge, /settlePendingAfterReply\(\)\.finally\(refresh\)/);

  const recorded = settlement.findRecordedLocalSettlement([
    { message_id: 40, role: 'user', message: '<GensokyoAction>{"version":"garden-action.v1","action_id":"organize_free_growth_proposal","event_id":"greenhouse_free_growth_proposal"}</GensokyoAction>' },
    { message_id: 41, role: 'assistant', message: '【庭园正文开始】方案已经交付。【庭园正文结束】' },
  ], state);
  assert.equal(recorded.assistantMessageId, 41);
  assert.equal(recorded.action.event_id, 'greenhouse_free_growth_proposal');
  assert.equal(settlement.findRecordedLocalSettlement([
    { message_id: 40, role: 'user', message: '<GensokyoAction>{"version":"garden-action.v1","action_id":"organize_free_growth_proposal","event_id":"greenhouse_free_growth_proposal"}</GensokyoAction>' },
    { message_id: 41, role: 'assistant', message: '【庭园正文开始】方案已经交付。【庭园正文结束】' },
  ], after), null);
  const upgradeConfig = JSON.parse(await read('../src/lorebook/events/greenhouse-upgrade-routes.json'));
  assert.equal(upgradeConfig.events[0].presence_transition.arrive[0].character_id, 'marisa');
});

test('L2 固定事件到场迁移保留其他访客 meta，并为事件角色生成确定性 event meta', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const visitors = await importTypescript('../src/ui/visitor-rules.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const buildState = () => {
    const state = structuredClone(initial);
    state.environment.day = 4;
    state.environment.time_period = '夜晚';
    state.resources.materials = 7;
    state.resources.inspiration = 3;
    state.facilities.magic_greenhouse.state = '启用';
    state.facilities.magic_greenhouse.current_form = '基础魔法温室';
    state.facilities.magic_greenhouse.unlocked_forms = ['基础魔法温室'];
    state.events.completed_key_events.greenhouse_flower_core = 'clean_win';
    state.presence_snapshot.present_character_ids = ['reimu'];
    state.presence_snapshot.character_views = {
      reimu: { area_id: 'central_courtyard', action: '等待', facing: 'front' },
    };
    state.presence_snapshot.visitor_meta = {
      reimu: {
        arrival_uid: 'visit:chat:1:reimu',
        reason_id: 'formal_visit',
        source: 'random',
        arrived_period_serial: 14,
        earliest_departure_serial: 15,
        planned_departure_serial: 16,
        passthrough_flag: '保留未知字段',
      },
    };
    return state;
  };
  const action = {
    version: 'garden-action.v1',
    action_id: 'organize_free_growth_proposal',
    event_id: 'greenhouse_free_growth_proposal',
    settlement_id: 'event:greenhouse_free_growth_proposal:42',
  };
  const after = settlement.applyLocalSettlement(buildState(), action, 42, [
    '【庭园正文开始】<narration>魔理沙把方案压在花盆旁。</narration>【庭园正文结束】',
    '<GensokyoEventResult>{"version":"event-result.v1","event_id":"greenhouse_free_growth_proposal","result":"wild_growth_plan_registered"}</GensokyoEventResult>',
  ].join('\n'));
  // 无关在场角色 meta 完整保留
  assert.deepEqual(after.presence_snapshot.visitor_meta.reimu, {
    arrival_uid: 'visit:chat:1:reimu',
    reason_id: 'formal_visit',
    source: 'random',
    arrived_period_serial: 14,
    earliest_departure_serial: 15,
    planned_departure_serial: 16,
    passthrough_flag: '保留未知字段',
  });
  // 新到场事件角色获得 source:'event' meta，departure serial 大于当前 serial
  const marisaMeta = after.presence_snapshot.visitor_meta.marisa;
  assert.ok(marisaMeta);
  assert.equal(marisaMeta.source, 'event');
  assert.equal(marisaMeta.arrived_period_serial, 15);
  assert.equal(marisaMeta.earliest_departure_serial, 16);
  assert.ok(marisaMeta.planned_departure_serial >= 16);
  // 相同输入重复结算产生相同 meta
  const again = settlement.applyLocalSettlement(buildState(), action, 42, [
    '【庭园正文开始】<narration>魔理沙把方案压在花盆旁。</narration>【庭园正文结束】',
    '<GensokyoEventResult>{"version":"event-result.v1","event_id":"greenhouse_free_growth_proposal","result":"wild_growth_plan_registered"}</GensokyoEventResult>',
  ].join('\n'));
  assert.deepEqual(again.presence_snapshot.visitor_meta.marisa, marisaMeta);
  // 帮助函数：有档案返回确定性 meta，无档案返回 null（覆盖 leave 缺失场景的公开路径）
  const metaWithProfile = visitors.buildVisitorMetaForArrival(
    after, 'marisa', 'event:greenhouse_free_growth_proposal:42', 'event:greenhouse_free_growth_proposal', 'event',
  );
  assert.equal(metaWithProfile.source, 'event');
  assert.equal(metaWithProfile.arrival_uid, 'event:greenhouse_free_growth_proposal:42');
  assert.equal(metaWithProfile.reason_id, 'event:greenhouse_free_growth_proposal');
  assert.ok(metaWithProfile.planned_departure_serial >= 16);
  assert.equal(visitors.buildVisitorMetaForArrival(after, 'unknown_char', 'uid', 'reason', 'event'), null);
});

test('L3 固定事件推进时段后到期访客在同次协调中离场', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const runtime = await importTypescript('../src/ui/m2-runtime.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const buildState = () => {
    const state = structuredClone(initial);
    state.environment.day = 7;
    state.environment.time_period = '黄昏';
    state.resources.materials = 12;
    state.facilities.magic_greenhouse.state = '启用';
    state.facilities.magic_greenhouse.current_form = '基础魔法温室';
    state.facilities.magic_greenhouse.unlocked_forms = [
      '基础魔法温室', '自由生长型温室', '人偶维护型温室', '河童自动化型温室',
    ];
    state.facilities.magic_greenhouse.active_effects = ['温室核心保持安静'];
    Object.assign(state.events.completed_key_events, {
      marisa_material_rumor: 'greenhouse_clue_found',
      gain_second_inspiration: 'growth_pattern_understood',
      clear_greenhouse_foundation: 'foundation_cleared',
      build_basic_magic_greenhouse: 'basic_greenhouse_enabled',
      greenhouse_first_use: 'stable_first_growth',
      greenhouse_multiturn_conversation: 'conversation_settled_after_multiple_turns',
      greenhouse_flower_core: 'clean_win',
      greenhouse_free_growth_proposal: 'wild_growth_plan_registered',
      alice_greenhouse_maintenance_proposal: 'doll_maintenance_plan_registered',
      nitori_greenhouse_automation_proposal: 'kappa_automation_plan_registered',
    });
    // 咲夜到访：planned_departure_serial = 当前 serial(26) + 1 = 27
    state.presence_snapshot.present_character_ids = ['reimu', 'sakuya'];
    state.presence_snapshot.character_views = {
      reimu: { area_id: 'central_courtyard', action: '等待', facing: 'front' },
      sakuya: { area_id: 'central_courtyard', action: '观察', facing: 'front' },
    };
    state.presence_snapshot.visitor_meta = {
      sakuya: {
        arrival_uid: 'visit:chat:1:sakuya',
        reason_id: 'time_trace',
        source: 'random',
        arrived_period_serial: 25,
        earliest_departure_serial: 26,
        planned_departure_serial: 27,
      },
    };
    return state;
  };
  const action = {
    version: 'garden-action.v1',
    action_id: 'select_free_growth',
    event_id: 'select_greenhouse_form',
    settlement_id: 'event:select_greenhouse_form:test-l3',
  };
  const before = buildState();
  const settled = settlement.applyLocalSettlement(before, action, 81, [
    '【庭园正文开始】改造完成。【庭园正文结束】',
    '<GensokyoEventResult>{"version":"event-result.v1","event_id":"select_greenhouse_form","result":"selected_free_growth"}</GensokyoEventResult>',
  ].join('\n'));
  // 事件推进了一个时段：黄昏(26) → 夜晚(27)
  assert.equal(settled.environment.time_period, '夜晚');
  // 与 bridge 相同：reconcileM2Runtime(safeCurrent, nextState, chatId)
  const reconciled = runtime.reconcileM2Runtime(before, settled, 'chat-l3');
  assert.equal(reconciled.presence_snapshot.present_character_ids.includes('sakuya'), false);
  assert.equal(reconciled.presence_snapshot.visitor_meta.sakuya, undefined);
  assert.ok((reconciled.visit_scheduler.cooldown_until?.sakuya ?? 0) > 27);
  const departureNotices = (reconciled.visit_scheduler.pending_notices ?? [])
    .filter((text) => text.includes('十六夜咲夜离开了庭园'));
  assert.equal(departureNotices.length, 1);
  // 幂等：再次协调不重复离场通知
  const again = runtime.reconcileM2Runtime(before, reconciled, 'chat-l3');
  assert.equal(again.presence_snapshot.present_character_ids.includes('sakuya'), false);
  assert.equal((again.visit_scheduler.pending_notices ?? []).filter((text) => text.includes('十六夜咲夜离开了庭园')).length, 1);
});

test('L2b 事件 arrive 不会给结算前已在场且无 meta 的角色强加离场期限', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const state = structuredClone(initial);
  state.environment.day = 4;
  state.environment.time_period = '夜晚';
  state.resources.materials = 7;
  state.facilities.magic_greenhouse.state = '启用';
  state.facilities.magic_greenhouse.current_form = '基础魔法温室';
  state.facilities.magic_greenhouse.unlocked_forms = ['基础魔法温室'];
  state.events.completed_key_events.greenhouse_flower_core = 'clean_win';
  state.presence_snapshot.present_character_ids = ['reimu', 'marisa'];
  state.presence_snapshot.character_views = {
    reimu: { area_id: 'central_courtyard', action: '等待', facing: 'front' },
    marisa: { area_id: 'greenhouse_plot', action: '看花', facing: 'front' },
  };
  // marisa 结算前已在场但没有任何 meta。
  state.presence_snapshot.visitor_meta = {
    reimu: { arrival_uid: 'visit:l2b:reimu', source: 'random', planned_departure_serial: 20 },
  };
  const action = {
    version: 'garden-action.v1',
    action_id: 'organize_free_growth_proposal',
    event_id: 'greenhouse_free_growth_proposal',
    settlement_id: 'event:greenhouse_free_growth_proposal:l2b',
  };
  const after = settlement.applyLocalSettlement(state, action, 91, [
    '【庭园正文开始】<narration>魔理沙把方案压在花盆旁。</narration>【庭园正文结束】',
    '<GensokyoEventResult>{"version":"event-result.v1","event_id":"greenhouse_free_growth_proposal","result":"wild_growth_plan_registered"}</GensokyoEventResult>',
  ].join('\n'));
  // marisa 仍在场，但不得被误判为事件新到场而强加 meta。
  assert.ok(after.presence_snapshot.present_character_ids.includes('marisa'));
  assert.equal(after.presence_snapshot.visitor_meta.marisa, undefined);
  // 原有在场角色 meta 保留。
  assert.equal(after.presence_snapshot.visitor_meta.reimu.planned_departure_serial, 20);
});

test('L2c 固定事件 leave 迁移的 meta 清理与真正新增判定', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const state = structuredClone(initial);
  state.environment.day = 4;
  state.environment.time_period = '夜晚';
  const action = {
    version: 'garden-action.v1',
    action_id: 'organize_free_growth_proposal',
    event_id: 'greenhouse_free_growth_proposal',
    settlement_id: 'event:greenhouse_free_growth_proposal:l2c',
  };
  const previousMeta = {
    reimu: { arrival_uid: 'visit:l2c:reimu', source: 'random', planned_departure_serial: 20 },
    marisa: { arrival_uid: 'visit:l2c:marisa', source: 'random', planned_departure_serial: 20 },
  };
  // leave 场景：marisa 不在迁移后名单 → meta 必须清理；reimu 仍在场 → meta 保留。
  const afterLeave = settlement.mergeEventPresenceVisitorMeta(
    structuredClone(previousMeta),
    ['reimu'],
    new Set(['marisa']),
    new Set(['reimu', 'marisa']),
    state,
    action,
  );
  assert.deepEqual(afterLeave, {
    reimu: { arrival_uid: 'visit:l2c:reimu', source: 'random', planned_departure_serial: 20 },
  });
  // 已在场但无 meta 的 arrive 角色：不得被误判为新增而强加离场期限。
  const alreadyPresent = settlement.mergeEventPresenceVisitorMeta(
    {},
    ['reimu', 'marisa'],
    new Set(['marisa']),
    new Set(['reimu', 'marisa']),
    state,
    action,
  );
  assert.equal(alreadyPresent.marisa, undefined);
  // 真正新增的 arrive 角色：生成确定性 event meta。
  const trulyNew = settlement.mergeEventPresenceVisitorMeta(
    {},
    ['reimu', 'marisa'],
    new Set(['marisa']),
    new Set(['reimu']),
    state,
    action,
  );
  assert.equal(trulyNew.marisa.source, 'event');
  assert.equal(trulyNew.marisa.arrival_uid, 'event:greenhouse_free_growth_proposal:l2c');
  assert.equal(trulyNew.marisa.arrived_period_serial, 15);
});

test('L5 固定剧情收到非空回复后按 restore→settle→presence→reconcile→write→projection 直接结算', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const persist = bridge.slice(
    bridge.indexOf('const persistLocalSettlement = async'),
    bridge.indexOf('const persistStagedLocalSession'),
  );
  assert.ok(persist.length > 0, '应能定位 persistLocalSettlement');
  const steps = [
    /restoreLocalEventOwnership\(ownershipBase, base, true\)/,
    /const settledState = applyLocalSettlement\(/,
    /const nextState = hasLocalPresenceTransition\(action\)[\s\S]*?\? settledState[\s\S]*?:\s*applyPresenceUpdate\(settledState, assistantText\)/,
    /return reconcileM2Runtime\(safeCurrent, nextState, currentChatId\(\)\)/,
    /data\.stat_data = transformFinalState\(/,
    /await mvu\.replaceMvuData\(data, options\)/,
    /settlementProjection\(reread, action, assistantMessageId,/,
  ];
  let cursor = 0;
  for (const step of steps) {
    const match = persist.slice(cursor).search(step);
    assert.ok(match >= 0, `persistLocalSettlement 应包含 ${step}`);
    cursor += match + 1;
  }
  assert.doesNotMatch(persist, /finalizeAcceptedAssistant|applyVisitTurnsToFinalState|requireAcceptedAssistantIdentity/);
  assert.match(bridge, /receiptPolicy:\s*action\s*\?\s*'next-nonempty-assistant'\s*:\s*'exact-attempt'/);
});

test('R33 爱丽丝维护方案与受控会话 UID 都由 bridge 本地链路拥有', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const actionRules = await importTypescript('../src/ui/target-actions.ts');
  const actions = await read('../src/ui/target-actions.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.environment.day = 5;
  state.resources.materials = 9;
  state.resources.inspiration = 4;
  state.facilities.magic_greenhouse.state = '启用';
  state.facilities.magic_greenhouse.current_form = '基础魔法温室';
  state.facilities.magic_greenhouse.unlocked_forms = ['基础魔法温室', '自由生长型温室'];
  state.events.completed_key_events.greenhouse_flower_core = 'clean_win';
  state.events.completed_key_events.greenhouse_free_growth_proposal = 'wild_growth_plan_registered';

  assert.equal(rules.greenhouseActionBlock(state, 'invite_alice_maintenance_assessment'), '');
  assert.equal(actionRules.isFixedPresentationAction('invite_alice_maintenance_assessment'), true);
  assert.equal(registry.eventById.get('alice_greenhouse_maintenance_proposal').max_effective_rounds, 1);
  assert.match(actions, /邀请爱丽丝进行维护评估/);
  assert.match(actions, /alice_doll_workshop_chat/);

  const action = {
    version: 'garden-action.v1',
    action_id: 'invite_alice_maintenance_assessment',
    event_id: 'alice_greenhouse_maintenance_proposal',
  };
  const after = settlement.applyLocalSettlement(state, action, 51, '【庭园正文开始】爱丽丝交付了方案。【庭园正文结束】');
  assert.equal(after.events.completed_key_events.alice_greenhouse_maintenance_proposal, 'doll_maintenance_plan_registered');
  assert.deepEqual(after.facilities.magic_greenhouse.unlocked_forms, ['基础魔法温室', '自由生长型温室', '人偶维护型温室']);
  assert.equal(after.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.equal(after.resources.materials, 9);
  assert.equal(after.resources.inspiration, 4);
  assert.deepEqual(after.presence_snapshot.present_character_ids, ['reimu', 'alice']);
  assert.equal(after.presence_snapshot.character_views.alice.action, '进行人偶维护评估');
  assert.equal(after.characters.alice.current_relationship_facts[0].source_event_id, 'alice_greenhouse_maintenance_proposal');

  const sessionState = JSON.parse(await read('../src/schema/initial-state.json'));
  sessionState.events.completed_key_events.greenhouse_first_use = 'stable_first_growth';
  const researchAction = {
    version: 'garden-action.v1',
    action_id: 'greenhouse_research_talk',
    event_id: 'greenhouse_multiturn_conversation',
  };
  const staged = settlement.stageLocalSession(sessionState, researchAction);
  // 温室研究交流已改为单轮结算：stage 不再创建会话（原样返回），结算一次直接完成。
  assert.equal(staged, sessionState);
  assert.equal(staged.interaction.current_session, null);
  const firstRound = settlement.applyLocalSettlement(sessionState, researchAction, 52, '单轮研究交流');
  assert.equal(firstRound.events.completed_key_events.greenhouse_multiturn_conversation, 'conversation_settled_after_multiple_turns');
  assert.equal(firstRound.interaction.current_session, null);
  assert.match(bridge, /persistStagedLocalSession/);
  assert.match(bridge, /stageLocalSession\(before, action\)/);
  assert.match(bridge, /event\.allowed_results\[0\]/);

  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const legacy = JSON.parse(await read('../src/schema/initial-state.json'));
  delete legacy.interaction;
  delete legacy.uid_counters;
  const migrated = migration.migrateGardenState(legacy);
  assert.equal(migrated.interaction.current_session, null);
  assert.deepEqual(migrated.interaction.settled_ids, []);
  assert.equal(migrated.uid_counters.interaction, 1);

  const upgradeConfig = JSON.parse(await read('../src/lorebook/events/greenhouse-upgrade-routes.json'));
  const aliceConfig = upgradeConfig.events.find((event) => event.config_id === 'alice_greenhouse_maintenance_proposal');
  assert.equal(aliceConfig.presence_transition.arrive[0].character_id, 'alice');
});

test('R34 荷取自动化方案不依赖爱丽丝路线，并由本地登记入场', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const actionRules = await importTypescript('../src/ui/target-actions.ts');
  const actions = await read('../src/ui/target-actions.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.environment.day = 6;
  state.resources.materials = 11;
  state.resources.inspiration = 5;
  state.facilities.magic_greenhouse.state = '启用';
  state.facilities.magic_greenhouse.current_form = '基础魔法温室';
  state.facilities.magic_greenhouse.unlocked_forms = ['基础魔法温室', '自由生长型温室'];
  state.events.completed_key_events.greenhouse_flower_core = 'clean_win';
  state.events.completed_key_events.greenhouse_free_growth_proposal = 'wild_growth_plan_registered';

  assert.equal(rules.greenhouseActionBlock(state, 'commission_nitori_engineering_survey'), '');
  assert.equal(actionRules.isFixedPresentationAction('commission_nitori_engineering_survey'), true);
  assert.equal(registry.eventById.get('nitori_greenhouse_automation_proposal').max_effective_rounds, 1);
  assert.equal(state.events.completed_key_events.alice_greenhouse_maintenance_proposal, undefined);
  assert.match(actions, /委托荷取进行工程测量/);
  assert.match(actions, /nitori_instrument_calibration_chat/);

  const action = {
    version: 'garden-action.v1',
    action_id: 'commission_nitori_engineering_survey',
    event_id: 'nitori_greenhouse_automation_proposal',
  };
  const after = settlement.applyLocalSettlement(state, action, 61, '【庭园正文开始】荷取交付工程测量方案。【庭园正文结束】');
  assert.equal(after.events.completed_key_events.nitori_greenhouse_automation_proposal, 'kappa_automation_plan_registered');
  assert.deepEqual(after.facilities.magic_greenhouse.unlocked_forms, ['基础魔法温室', '自由生长型温室', '河童自动化型温室']);
  assert.equal(after.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.equal(after.resources.materials, 11);
  assert.equal(after.resources.inspiration, 5);
  assert.deepEqual(after.presence_snapshot.present_character_ids, ['reimu', 'nitori']);
  assert.equal(after.presence_snapshot.character_views.nitori.action, '进行温室工程测量');
  assert.equal(after.characters.nitori.current_relationship_facts[0].source_event_id, 'nitori_greenhouse_automation_proposal');
  assert.ok(registry.eventById.get('nitori_greenhouse_automation_proposal')
    .trigger_action_ids.includes('commission_nitori_engineering_survey'));

  const upgradeConfig = JSON.parse(await read('../src/lorebook/events/greenhouse-upgrade-routes.json'));
  const nitoriConfig = upgradeConfig.events.find((event) => event.config_id === 'nitori_greenhouse_automation_proposal');
  assert.equal(nitoriConfig.presence_transition.arrive[0].character_id, 'nitori');
});

test('R35 三方案首次选型与重复换型由登记结果和事件结算 ID 原子保护', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const actionsModule = await importTypescript('../src/ui/target-actions.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.environment.day = 7;
  state.environment.time_period = '黄昏';
  state.resources.materials = 12;
  state.facilities.magic_greenhouse.state = '启用';
  state.facilities.magic_greenhouse.current_form = '基础魔法温室';
  state.facilities.magic_greenhouse.unlocked_forms = [
    '基础魔法温室', '自由生长型温室', '人偶维护型温室', '河童自动化型温室',
  ];
  state.facilities.magic_greenhouse.active_effects = ['温室核心保持安静'];
  Object.assign(state.events.completed_key_events, {
    marisa_material_rumor: 'greenhouse_clue_found',
    gain_second_inspiration: 'growth_pattern_understood',
    clear_greenhouse_foundation: 'foundation_cleared',
    build_basic_magic_greenhouse: 'basic_greenhouse_enabled',
    greenhouse_first_use: 'stable_first_growth',
    greenhouse_multiturn_conversation: 'conversation_settled_after_multiple_turns',
    greenhouse_flower_core: 'clean_win',
    greenhouse_free_growth_proposal: 'wild_growth_plan_registered',
    alice_greenhouse_maintenance_proposal: 'doll_maintenance_plan_registered',
    nitori_greenhouse_automation_proposal: 'kappa_automation_plan_registered',
  });

  const selectEvent = registry.eventById.get('select_greenhouse_form');
  assert.equal(selectEvent.local_settlement.material_cost, 4);
  assert.equal(registry.eventResultForAction('select_greenhouse_form', 'select_doll_maintenance'), 'selected_doll_maintenance');
  assert.equal(rules.greenhouseActionBlock(state, 'select_free_growth'), '');
  const target = { type: 'facility', id: 'magic_greenhouse', label: '魔法温室' };
  const selectActions = actionsModule.targetActions(target, state);
  assert.ok(selectActions.some((action) => action.id === 'select_free_growth' && action.cost.materials === 4));
  assert.ok(selectActions.some((action) => action.id === 'select_doll_maintenance'));
  assert.ok(selectActions.some((action) => action.id === 'select_kappa_automation'));
  const projected = actionsModule.buildActionMessage(
    selectActions.find((action) => action.id === 'select_free_growth'),
    state,
  );
  assert.match(projected, /形态 自由生长型温室/);
  assert.match(projected, /结果 selected_free_growth/);
  assert.doesNotMatch(projected, /selected_doll_maintenance/);
  const parsed = settlement.parseGardenAction(projected);
  assert.match(parsed.settlement_id, /^event:select_greenhouse_form:/);

  const afterSelect = settlement.applyLocalSettlement(state, parsed, 71, [
    '【庭园正文开始】改造完成。【庭园正文结束】',
    '<GensokyoEventResult>{"version":"event-result.v1","event_id":"select_greenhouse_form","result":"selected_kappa_automation"}</GensokyoEventResult>',
  ].join('\n'));
  assert.equal(afterSelect.facilities.magic_greenhouse.current_form, '自由生长型温室');
  assert.deepEqual(afterSelect.facilities.magic_greenhouse.active_effects, ['温室核心保持安静', 'free_growth_controlled_wildness']);
  assert.equal(afterSelect.resources.materials, 8);
  assert.equal(afterSelect.environment.day, 7);
  assert.equal(afterSelect.environment.time_period, '夜晚');
  assert.equal(afterSelect.events.completed_key_events.select_greenhouse_form, 'selected_free_growth');
  assert.ok(afterSelect.events.settled_ids.includes(parsed.settlement_id));
  assert.deepEqual(settlement.applyLocalSettlement(afterSelect, parsed, 71, '重复楼层'), afterSelect);

  const damagedAfterLateWrite = structuredClone(afterSelect);
  damagedAfterLateWrite.resources.materials = 12;
  damagedAfterLateWrite.facilities.magic_greenhouse.current_form = '基础魔法温室';
  damagedAfterLateWrite.facilities.magic_greenhouse.unlocked_forms = ['基础魔法温室'];
  damagedAfterLateWrite.facilities.magic_greenhouse.active_effects = [];
  assert.equal(settlement.settlementProjection(damagedAfterLateWrite, parsed, 71), false);
  const recordedRepair = settlement.findRecordedLocalSettlement([
    { message_id: 70, role: 'user', message: projected },
    { message_id: 71, role: 'assistant', message: '改造完成' },
  ], damagedAfterLateWrite);
  assert.equal(recordedRepair.action.action_id, 'select_free_growth');
  const repaired = settlement.applyLocalSettlement(state, recordedRepair.action, 71, recordedRepair.assistantText);
  assert.equal(repaired.facilities.magic_greenhouse.current_form, '自由生长型温室');
  assert.equal(repaired.resources.materials, 8);
  assert.equal(settlement.settlementProjection(repaired, parsed, 71, afterSelect), true);

  const damagedCostOnly = structuredClone(afterSelect);
  damagedCostOnly.resources.materials = 12;
  assert.equal(settlement.settlementProjection(damagedCostOnly, parsed, 71), true);
  assert.equal(settlement.settlementProjection(damagedCostOnly, parsed, 71, afterSelect), false);

  const remodelAction = {
    version: 'garden-action.v1',
    action_id: 'remodel_to_doll_maintenance',
    event_id: 'remodel_greenhouse_form',
    settlement_id: 'event:remodel_greenhouse_form:test-72',
  };
  assert.equal(rules.greenhouseActionBlock(afterSelect, 'remodel_to_doll_maintenance'), '');
  const afterRemodel = settlement.applyLocalSettlement(afterSelect, remodelAction, 72, '换型完成');
  assert.equal(afterRemodel.facilities.magic_greenhouse.current_form, '人偶维护型温室');
  assert.deepEqual(afterRemodel.facilities.magic_greenhouse.active_effects, ['温室核心保持安静', 'doll_maintenance_routine']);
  assert.equal(afterRemodel.resources.materials, 5);
  assert.equal(afterRemodel.environment.day, 8);
  assert.equal(afterRemodel.environment.time_period, '清晨');
  assert.equal(afterRemodel.events.completed_key_events.remodel_greenhouse_form, 'remodeled_to_doll_maintenance');
  assert.equal(settlement.findRecordedLocalSettlement([
    { message_id: 70, role: 'user', message: projected },
    { message_id: 71, role: 'assistant', message: '改造完成' },
  ], afterRemodel), null);
});

test('R36/R39 特殊商品、自定义异变卡与咲夜怀表完全由本地规则结算', async () => {
  const shop = await importTypescript('../src/ui/shop-rules.ts');
  const special = await importTypescript('../src/ui/special-item-rules.ts');
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const actions = await importTypescript('../src/ui/target-actions.ts');
  const prompt = await importTypescript('../src/ui/prompt-context.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.shop.unlocked = true;
  state.resources.coins = 200;
  state.player.current_area_id = 'central_courtyard';
  state.presence_snapshot.present_character_ids = ['reimu'];
  state.presence_snapshot.character_views.reimu.area_id = 'central_courtyard';

  const withCard = shop.purchaseShopItem(state, 'incident_trigger_card', 'shop-r36-card');
  assert.equal(withCard.resources.coins, 170);
  assert.equal(withCard.inventory.consumables.incident_trigger_card, 1);
  const equipped = shop.purchaseShopItem(withCard, 'sakuya_watch', 'shop-r36-watch');
  assert.equal(equipped.resources.coins, 90);
  assert.equal(equipped.key_items.sakuya_watch.obtained, true);
  assert.throws(() => shop.purchaseShopItem(equipped, 'sakuya_watch', 'shop-r36-watch-2'), /唯一物品|已经归你/);

  const activated = special.useSpecialItem(equipped, 'incident_trigger_card', 'item:incident:test-1', {
    title: '全员互换身体',
    rule_text: '庭园内所有人身体互换，但仍保持自我认知。',
    scope_mode: 'all',
    character_ids: [],
    presentation_tone: '轻喜剧',
    excluded_content: '',
  });
  assert.equal(activated.state.inventory.consumables.incident_trigger_card, 0);
  assert.equal(activated.state.anomaly_cycle.active.title, '全员互换身体');
  assert.equal(activated.state.anomaly_cycle.pending_activation, null);
  assert.equal(activated.state.anomaly_cycle.active.anomaly_id, 'item:incident:test-1');
  assert.ok(activated.state.anomaly_cycle.active.hidden_origin.name);
  assert.ok(activated.state.events.settled_ids.includes('item:incident:test-1'));
  assert.throws(() => special.useSpecialItem(activated.state, 'incident_trigger_card', 'item:incident:test-2', {
    title: '第二异变', rule_text: '不能叠加', scope_mode: 'all', character_ids: [], presentation_tone: '', excluded_content: '',
  }), /已有活动异变|不能叠加/);
  const ordinary = prompt.buildPromptContext(activated.state, { kind: 'ordinary' });
  assert.match(ordinary, /全员互换身体/);
  assert.doesNotMatch(ordinary, new RegExp(activated.state.anomaly_cycle.active.hidden_origin.name, 'u'));
  assert.doesNotMatch(ordinary, /hidden_origin/);
  const daily = prompt.buildPromptContext(activated.state, { kind: 'daily_investigation' });
  assert.match(daily, new RegExp(activated.state.anomaly_cycle.active.hidden_origin.name, 'u'));

  // Legacy waiting events remain migratable and are not promoted into anomaly_cycle.
  const legacy = migration.migrateGardenState({
    ...equipped,
    events: {
      ...equipped.events,
      waiting_events: [{ uid: 'waiting:old', config_id: 'fairy_seed_shower', title: '妖精种子雨', status: 'waiting' }],
    },
  });
  assert.equal(legacy.anomaly_cycle.active, null);
  assert.equal(legacy.events.waiting_events[0].config_id, 'fairy_seed_shower');

  const firstWatch = special.useSakuyaWatch(activated.state, 'item:watch:test-1');
  assert.equal(firstWatch.state.key_items.sakuya_watch.state, 'daily_cooldown');
  assert.equal(firstWatch.state.key_items.sakuya_watch.total_uses, 1);
  assert.equal(firstWatch.state.key_items.sakuya_watch.temporal_trace_active, true);
  assert.ok(firstWatch.state.key_items.sakuya_watch.noticed_by_character_ids.includes('reimu'));
  assert.equal(firstWatch.state.environment.time_period, equipped.environment.time_period);
  assert.equal(
    firstWatch.state.anomaly_cycle.active.end_period_serial - firstWatch.state.anomaly_cycle.active.start_period_serial,
    activated.state.anomaly_cycle.active.end_period_serial - activated.state.anomaly_cycle.active.start_period_serial,
  );
  assert.throws(() => special.useSakuyaWatch(firstWatch.state, 'item:watch:test-same-day'), /今天已经使用过/);

  const nextDay = structuredClone(firstWatch.state);
  nextDay.environment.day += 1;
  const ready = migration.migrateGardenState(nextDay);
  assert.equal(ready.key_items.sakuya_watch.state, 'ready');
  const secondWatch = special.useSakuyaWatch(ready, 'item:watch:test-2');
  assert.equal(secondWatch.state.key_items.sakuya_watch.total_uses, 2);
  assert.ok(secondWatch.state.events.waiting_events.some((event) => event.config_id === 'sakuya_temporal_trace_investigation'));
  // R75 修复：怀表放宽守卫——GAL 对话（受控会话/固定剧情事件）中允许即时使用，仅战斗中禁止。
  const sessionState = structuredClone(ready);
  sessionState.interaction ??= { current_session: null, settled_ids: [] };
  sessionState.interaction.current_session = {
    uid: 'interaction_test_gal', type: 'facility', status: 'active', area_id: 'greenhouse_plot',
    participant_character_ids: ['marisa'], facility_id: 'magic_greenhouse',
    event_id: 'greenhouse_multiturn_conversation', focus: '测试会话', summary: '测试会话',
    last_effective_message_id: null, effective_rounds: 0, settled: false,
  };
  const watchInSession = special.useSakuyaWatch(sessionState, 'item:watch:session');
  assert.equal(watchInSession.state.key_items.sakuya_watch.total_uses, 2);
  const eventState = structuredClone(ready);
  eventState.events ??= {};
  eventState.events.active_event = { uid: 'flower_core_test', config_id: 'greenhouse_flower_core', title: '温室妖花核心', status: 'active' };
  const watchInEvent = special.useSakuyaWatch(eventState, 'item:watch:event');
  assert.equal(watchInEvent.state.key_items.sakuya_watch.total_uses, 2);
  const battleState = structuredClone(ready);
  battleState.battle ??= {};
  battleState.battle.current = { config_id: 'greenhouse_flower_core_tutorial_v1' };
  assert.throws(() => special.useSakuyaWatch(battleState, 'item:watch:battle'), /战斗进行中/);
  assert.ok(registry.eventById.has('clockwork_temporal_ripple'));
  assert.ok(registry.eventById.has('sakuya_temporal_trace_investigation'));
  const courtyardActions = actions.targetActions({ type: 'area', id: 'central_courtyard', label: '中央庭院' }, secondWatch.state);
  assert.ok(courtyardActions.some((action) => action.id === 'investigate_sakuya_temporal_trace'));
  // R81 怀表时停：使用时 time_stop_active 置真；prompt 注入【时间停止】段；跨时段自动失效。
  assert.equal(firstWatch.state.key_items.sakuya_watch.time_stop_active, true);
  const stopPrompt = prompt.buildPromptContext(firstWatch.state, { kind: 'ordinary' });
  assert.match(stopPrompt, /【时间停止】/);
  assert.match(stopPrompt, /怀表正在生效/);
  assert.match(stopPrompt, /不能主动行动/);
  const time = await importTypescript('../src/ui/time-rules.ts');
  const advanced = time.advanceOneTimePeriod(firstWatch.state);
  assert.equal(advanced.key_items.sakuya_watch.time_stop_active, false);
  const noStopPrompt = prompt.buildPromptContext(advanced, { kind: 'ordinary' });
  assert.doesNotMatch(noStopPrompt, /【时间停止】/);
  // 未使用时不得注入时停段
  const idlePrompt = prompt.buildPromptContext(equipped.state ?? equipped, { kind: 'ordinary' });
  assert.doesNotMatch(idlePrompt, /【时间停止】/);
  const specialEvents = await read('../src/lorebook/events/special-item-events.json');
  assert.doesNotMatch(specialEvents, /"participants"\s*:\s*\[[^\]]*(?:yukari|kaguya)/u);
});

test('R37 候选保留窄屏、可访问性、失败恢复与本地特殊商品反馈', async () => {
  const styles = await read('../src/ui/styles.css');
  const app = await read('../src/ui/app.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const shopView = await read('../src/ui/shop-view.ts');
  const packageJson = JSON.parse(await read('../package.json'));
  const manifest = JSON.parse(await read('../project/manifest.json'));
  assert.match(styles, /@media \(max-width: 380px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /focus-visible/);
  assert.match(styles, /min-height: 44px/);
  assert.match(app, /retryLastTransaction/);
  assert.match(app, /beforeunload/);
  assert.match(app, /useSpecialItem/);
  assert.match(bridge, /道具使用复读校验失败/);
  assert.match(shopView, /showItemDetailDialog/);
  assert.match(shopView, /gg-shop-detail-dialog/);
  assert.match(shopView, /点击查看详细介绍/);
  assert.match(shopView, /唯一关键物品/);
  assert.match(packageJson.scripts['package:checkpoint:dry'], /0\.2\.0-r/);
  assert.match(String(manifest.next_checkpoint), /0\.2\.0-r/);
});

test('优化门：事件登记表严格校验且允许结果只有一个事实源', async () => {
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const vertical = JSON.parse(await read('../src/lorebook/events/greenhouse-vertical-slice.json'));
  const routes = JSON.parse(await read('../src/lorebook/events/greenhouse-upgrade-routes.json'));
  const sideStories = JSON.parse(await read('../src/lorebook/events/free-side-stories.json'));
  const events = registry.validateEventDocuments([vertical, routes, sideStories]);
  assert.equal(events.length, vertical.events.length + routes.events.length + sideStories.events.length);
  assert.ok(events.every((event) => event.allowed_results.every((result) => typeof result === 'string')));
  const invalid = structuredClone(vertical);
  invalid.events[0].projection_keys = ['future.secret'];
  assert.throws(() => registry.validateEventDocuments([invalid]), /包含未登记路径/);
  assert.throws(() => registry.validateEventDocuments([vertical, vertical]), /重复 config_id/);
});

test('优化门：每次只投影当前事件，打包器不再关键词注入整份事件配置', async () => {
  const projection = await importTypescript('../src/ui/event-projection.ts');
  const actions = await importTypescript('../src/ui/target-actions.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  const prompt = projection.buildEventPromptProjection(
    'greenhouse_free_growth_proposal',
    'organize_free_growth_proposal',
    state,
  );
  assert.match(prompt, /【当前事件精确投影】/);
  assert.match(prompt, /greenhouse_free_growth_proposal/);
  assert.match(prompt, /characters\.marisa\.current_relationship_facts/);
  assert.doesNotMatch(prompt, /alice_greenhouse_maintenance_proposal/);
  assert.doesNotMatch(prompt, /nitori_greenhouse_automation_proposal/);
  assert.throws(() => projection.buildEventPromptProjection(
    'greenhouse_free_growth_proposal', 'repair', state,
  ), /未登记为事件/);
  const message = actions.buildActionMessage({
    id: 'organize_free_growth_proposal',
    label: '整理方案',
    description: '测试',
    intent: '我与魔理沙整理方案。',
    mode: 'gal',
    target: { id: 'magic_greenhouse', label: '魔法温室', type: 'facility' },
    eventId: 'greenhouse_free_growth_proposal',
  }, state);
  assert.match(message, /当前事件精确投影/);
  assert.doesNotMatch(message, /当前不在场：/);
  assert.deepEqual(actions.actionEventParticipantIds({
    id: 'organize_free_growth_proposal',
    label: '整理方案',
    description: '测试',
    intent: '我与魔理沙整理方案。',
    mode: 'gal',
    target: { id: 'magic_greenhouse', label: '魔法温室', type: 'facility' },
    eventId: 'greenhouse_free_growth_proposal',
  }), ['marisa']);
  const packer = await read('../scripts/package-checkpoint.mjs');
  assert.doesNotMatch(packer, /greenhouseEvents/);
  assert.doesNotMatch(packer, /魔法温室纵切事件/);
});

test('优化门：时间不可倒退，未知区域回执不能污染正式在场快照', async () => {
  const time = await importTypescript('../src/ui/time-rules.ts');
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.environment.day = 4;
  state.environment.time_period = '黄昏';
  const backwards = structuredClone(state);
  backwards.environment.day = 3;
  backwards.environment.time_period = '夜晚';
  assert.deepEqual(time.enforceMonotonicTime(state, backwards).environment, state.environment);
  const sameDayBackwards = structuredClone(state);
  sameDayBackwards.environment.time_period = '白昼';
  assert.deepEqual(time.enforceMonotonicTime(state, sameDayBackwards).environment, state.environment);
  const nextDay = structuredClone(state);
  nextDay.environment.day = 5;
  nextDay.environment.time_period = '清晨';
  assert.equal(time.enforceMonotonicTime(state, nextDay).environment.day, 5);

  state.characters.marisa = { id: 'marisa', name: '雾雨魔理沙' };
  state.presence_snapshot = {
    present_character_ids: ['reimu'],
    character_views: { reimu: { area_id: 'central_courtyard', action: '等待', facing: 'front' } },
  };
  const invalidArea = settlement.applyPresenceUpdate(state, [
    '【庭园正文结束】',
    '<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu","marisa"],"character_views":{"reimu":{"area_id":"unknown_void"},"marisa":{"area_id":"unknown_void"}}}</GensokyoPresence>',
  ].join('\n'));
  assert.deepEqual(invalidArea.presence_snapshot.present_character_ids, ['reimu']);
  assert.equal(invalidArea.presence_snapshot.character_views.reimu.area_id, 'central_courtyard');
  assert.equal(invalidArea.presence_snapshot.character_views.marisa, undefined);
  assert.equal(settlement.localSettlementAction(
    '<GensokyoAction>{"version":"garden-action.v1","action_id":"repair","event_id":"reimu_boundary_inspection"}</GensokyoAction>',
    state,
  ), null);
});

test('设置页返回原场景，重复入口不会把返回目标污染成设置页', async () => {
  const app = await read('../src/ui/app.ts');
  assert.match(app, /let settingsReturnView: Exclude<SceneMode, 'settings'> = 'garden'/);
  assert.match(app, /const sourceView = currentView;\s+if \(sourceView === 'settings'\) return;\s+settingsReturnView = sourceView;/);
  assert.match(app, /function returnFromSettings\(\) \{\s+const returnView = settingsReturnView;\s+setView\(returnView\);\s+if \(returnView === 'gal'\) void refresh\(\);\s+\}/);
  assert.doesNotMatch(app, /previousView/);
});

test('宿主重复注入复用同一游戏框架，聊天切换不再强制重建 iframe', async () => {
  const host = await read('../src/runtime/ui-host-shell.js');
  assert.match(host, /existing\?\.version === version/);
  assert.match(host, /existing\.ownerCharacterId === ownerCharacterId/);
  assert.match(host, /existing\.ensureMounted\(\);\s+return;/);
  assert.match(host, /ensureMounted: attachShell/);
  const chatChangedHandler = host.match(/subscribe\(source\.tavern_events\?\.CHAT_CHANGED,[\s\S]*?\n  \}\);/)?.[0] ?? '';
  assert.doesNotMatch(chatChangedHandler, /rebuildFrame\(\)/);
});

test('普通角色或设施聊天可在界面重挂载后恢复 GAL，结束剧情除外', async () => {
  const app = await read('../src/ui/app.ts');
  assert.match(app, /function inferRecentGalContext\(messages: ChatMessageView\[\]\)/);
  assert.match(app, /action\.action_id === 'end_conversation'/);
  assert.match(app, /action\.target_type === 'character'/);
  assert.match(app, /action\.target_type === 'facility'/);
  assert.match(app, /inferRecentGalContext\(await bridge\.listMessages\(\)\)/);
  assert.match(app, /activeSessionActionId = recentContext\?\.actionId/);
});

test('本地结束解除失败事务与待办按钮，记录不伪造空 assistant 剧情', async () => {
  const app = await read('../src/ui/app.ts');
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(app, /message\.role === 'assistant'[\s\S]*?message\.text\.trim\(\)[\s\S]*?message\.role === 'user' && userHistoryText\(message\)/);
  assert.match(app, /submissionInFlight = false;[\s\S]*?if \(currentView === 'gal'\) renderSceneItemPicker\(\);[\s\S]*?renderPendingTasks\(\);/);
  assert.match(bridge, /transactions\.resetAfterLocalEnd\(\)/);
  assert.match(bridge, /pendingSettlement = null;[\s\S]*pendingOwnershipBefore = null;[\s\S]*pendingSystemOperation = null;/);
});

test('GAL 回复落盘后释放本地提交锁时，重新渲染道具选择器', async () => {
  const app = await read('../src/ui/app.ts');
  const submitFinally = app.match(/async function submitGalMessage\([\s\S]*?\r?\n  \} finally \{([\s\S]*?)\r?\n  \}\r?\n\}/);
  assert.ok(submitFinally, '应能定位 GAL 提交收尾');
  assert.match(submitFinally[1], /submissionInFlight = false;[\s\S]*?if \(currentView === 'gal'\) renderSceneItemPicker\(\);/);
});

test('远程 UI 交付：loader 模板结构完整，构建脚本支持双模式', async () => {
  const loader = await read('../src/runtime/ui-loader.js');
  assert.match(loader, /__UI_MANIFEST_URL__/, 'loader 模板必须保留 manifest URL 占位符');
  assert.match(loader, /schema_version !== 'gensokyo-ui-live\.v1'/, 'loader 必须强制校验 manifest schema');
  assert.match(loader, /\^\[a-f0-9\]\{64\}\$/, 'loader 必须拒绝缺失或非法 sha256');
  assert.match(loader, /uiUrl\.origin !== manifestUrl\.origin/, 'loader 必须限制远程包 origin');
  assert.match(loader, /bytes\.byteLength !== manifest\.bytes/, 'loader 必须校验下载字节数');
  assert.match(loader, /globalThis\.crypto\?\.subtle/, 'loader 必须显式检测安全上下文 Web Crypto 能力');
  assert.match(loader, /crypto\.subtle\.digest\('SHA-256'/, 'loader 必须做 sha256 完整性校验');
  assert.match(loader, /URL\.createObjectURL\(new Blob\(\[bytes\]/, 'loader 必须经 Blob URL import 远程包');
  assert.match(loader, /ui-manifest HTTP|HTTP \$\{/, 'loader 必须对 manifest/包失败做 HTTP 状态检查');
  assert.match(loader, /gensokyo-ui-load-error/, 'loader 失败时必须显示可见兜底提示');
  assert.match(loader, /fetch\(MANIFEST_URL, \{ cache: 'no-store'/, 'manifest 指针必须 no-store 拉取');
  assert.doesNotMatch(loader, /fetch\(uiUrl, \{[^}]*cache: 'no-store'/, '不可变 UI 包不得禁用浏览器缓存');
  const build = await read('../scripts/build-ui.mjs');
  assert.match(build, /ui-delivery/, 'build-ui 必须支持 --ui-delivery');
  assert.match(build, /ui-mount-\$\{uiVersion\}\.js/, 'remote 必须产出版本化发布副本');
  assert.match(build, /拒绝覆盖不可变 UI 产物/, 'remote 构建不得用不同内容覆盖既有版本号');
  assert.match(build, /uiDelivery === 'remote'[\s\S]*?uiVersion/, 'remote 宿主版本必须由发布版本决定');
  assert.doesNotMatch(build, /new Date\(\)\.toISOString\(\).*host-generate/s, '构建产物不得因当前时间而不可复现');
  assert.match(build, /ui-loader\.js/, 'remote 必须产出卡内 loader');
  const packer = await read('../scripts/package-checkpoint.mjs');
  assert.match(packer, /ui-delivery/, '打包器必须支持 --ui-delivery');
  assert.match(packer, /ui-loader\.js/, '打包器 remote 模式必须内嵌 loader');
  assert.match(packer, /versionedMount !== currentMount/, '打包器必须拒绝版本化副本与当前 UI 串线');
  const packageJson = JSON.parse(await read('../package.json'));
  assert.match(packageJson.scripts['build:ui:remote'], /--ui-delivery=remote/);
  assert.match(packageJson.scripts['package:checkpoint:dry'], /--ui-delivery=remote/);
  assert.match(packageJson.scripts['package:checkpoint'], /--ui-delivery=remote/);
});

test('远程 UI loader：缺失哈希或跨源 URL 在下载 UI 前即被拒绝', async () => {
  const { runInNewContext } = await import('node:vm');
  const template = await read('../src/runtime/ui-loader.js');
  const source = template.replaceAll(
    '__UI_MANIFEST_URL__',
    'https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/ui/ui-manifest.json',
  );
  const validBase = {
    schema_version: 'gensokyo-ui-live.v1',
    version: 'r95',
    sha256: 'a'.repeat(64),
    bytes: 123,
    url: 'https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/ui/ui-mount-r95.js',
  };
  for (const manifest of [
    { ...validBase, sha256: undefined },
    { ...validBase, url: 'https://evil.example/ui-mount-r95.js' },
  ]) {
    let fetchCalls = 0;
    const hostDocument = {
      body: { appendChild() {} },
      createElement: () => ({ style: {}, textContent: '' }),
      getElementById: () => null,
    };
    const context = {
      URL,
      console: { error() {} },
      crypto: { subtle: { digest: async () => new ArrayBuffer(32) } },
      document: hostDocument,
      fetch: async () => {
        fetchCalls += 1;
        return { ok: true, json: async () => manifest };
      },
      window: { parent: { document: hostDocument } },
    };
    runInNewContext(source, context);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fetchCalls, 1, '非法 manifest 只能被读取一次，不得继续下载 UI');
  }
});

test('远程 UI 交付：已构建 loader 可用，过期版本化副本会被打包器拒绝', async () => {
  const { access, readFile } = await import('node:fs/promises');
  const { spawnSync } = await import('node:child_process');
  const { join } = await import('node:path');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const exists = async (p) => access(join(root, p)).then(() => true, () => false);
  if (!(await exists('dist/runtime/ui-loader.js'))) return; // 仅 remote 构建后校验
  const loader = await readFile(join(root, 'dist/runtime/ui-loader.js'), 'utf8');
  assert.doesNotMatch(loader, /__UI_MANIFEST_URL__/, '构建产物不得残留占位符');
  assert.match(loader, /https:\/\/ssrfrrt\.ccwu\.cc\/gensokyo-moving-garden\/live\/ui\/ui-manifest\.json/);
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const checkpoint = packageJson.scripts['package:checkpoint:dry'].match(/--checkpoint=(0\.2\.0-r\d+)/)?.[1];
  assert.ok(checkpoint, '应能从 dry-run 命令解析检查点');
  const suffix = checkpoint.split('-').at(-1);
  const versionedPath = `dist/runtime/ui-mount-${suffix}.js`;
  if (await exists(versionedPath)) {
    const remote = await readFile(join(root, versionedPath), 'utf8');
    const local = await readFile(join(root, 'dist/runtime/ui-mount.js'), 'utf8');
    if (remote !== local) {
      const result = spawnSync(process.execPath, [
        'scripts/package-checkpoint.mjs', `--checkpoint=${checkpoint}`, '--dry-run', '--expect-remote-r2', '--ui-delivery=remote',
      ], { cwd: root, encoding: 'utf8' });
      assert.notEqual(result.status, 0, '过期版本化副本必须阻止打包');
      assert.match(`${result.stdout}\n${result.stderr}`, /与当前 dist\/runtime\/ui-mount\.js 不一致/);
    }
  }
});

test('远程 UI 发布：不可变对象条件写，manifest 乐观锁，切指针前后均读回校验', async () => {
  const publisher = await read('../scripts/publish-ui.mjs');
  assert.match(publisher, /只有明确 404 才视为不存在/);
  assert.match(publisher, /'if-none-match': '\*'/, '不可变 UI 必须使用原子条件创建');
  assert.match(publisher, /'if-match': manifestHead\.etag/, 'manifest 更新必须绑定读取到的 ETag');
  const uiVerify = publisher.indexOf('await verifyPublicObject(uiUrl');
  const manifestPut = publisher.indexOf('await putObject(manifestKey');
  const manifestVerify = publisher.indexOf('await verifyPublicObject(`${publicOrigin}/${manifestKey}`');
  assert.ok(uiVerify >= 0 && manifestPut > uiVerify, '必须先读回校验 UI，再更新 manifest');
  assert.ok(manifestVerify > manifestPut, '更新 manifest 后必须再次公网读回校验');
});

test('Phase 5：native-regenerate 保留（Probe C 未 PASS），定位与传输常量存在', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const types = await read('../src/ui/types.ts');
  // 5.1：regenerationTransport 显示 native-regenerate（helper-generate-swipe 未启用）
  assert.match(types, /regenerationTransport: 'native-regenerate' \| 'helper-generate-swipe'/);
  assert.match(bridge, /regenerationTransport: 'native-regenerate'/);
  // 5.2：定位原请求（attempt metadata → 配对玩家楼层 → chat identity 校验；legacy 兼容记录）
  assert.match(bridge, /\[gal:regenerate\]/);
  assert.match(bridge, /resolvePlayerMessageByMetadata\(messages, originalRequestId\)/);
  assert.match(bridge, /resolveLatestAssistantForRegeneration\(messages\)/);
  assert.match(bridge, /legacy assistant 无 attempt metadata/);
});
