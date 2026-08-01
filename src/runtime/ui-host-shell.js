// `embedded` is injected by scripts/build-ui.mjs.
(() => {
  'use strict';

  const source = window;
  let host = window;
  try {
    if (window.parent && window.parent !== window && window.parent.document) host = window.parent;
  } catch {
    host = window;
  }
  const doc = host.document;
  const instanceKey = '__GENSOKYO_GARDEN_UI_024__';
  const shellId = 'gensokyo-game-shell';
  const styleId = 'gensokyo-game-host-style';
  const returnButtonId = 'gensokyo-game-return';
  const activeClass = 'gg-gensokyo-game-active';
  const chatActiveClass = 'gg-gensokyo-chat-active';
  const version = '0.4.3-host-generate-r27';

  function currentCharacterId() {
    try {
      const api = source.SillyTavern ?? host.SillyTavern;
      const context = typeof api?.getContext === 'function' ? api.getContext() : api;
      return String(context?.characterId ?? '');
    } catch {
      return '';
    }
  }

  const ownerCharacterId = currentCharacterId();
  const existing = host[instanceKey];
  if (
    ownerCharacterId
    && existing?.version === version
    && existing.ownerCharacterId === ownerCharacterId
    && typeof existing.ensureMounted === 'function'
  ) {
    existing.ensureMounted();
    return;
  }
  existing?.destroy?.();

  function clearHostArtifacts() {
    doc.body?.classList.remove(activeClass);
    doc.querySelectorAll(`#chat.${chatActiveClass}`).forEach((chat) => chat.classList.remove(chatActiveClass));
    doc.querySelectorAll(`#${shellId}, #${returnButtonId}, #${styleId}`).forEach((element) => element.remove());
  }

  clearHostArtifacts();
  if (!ownerCharacterId) return;

  const state = {
    ownerCharacterId,
    chat: null,
    shell: null,
    frame: null,
    returnButton: null,
    observer: null,
    eventStops: [],
    nativeMode: false,
    remountQueued: false,
    destroyed: false,
  };

  function installHostStyle() {
    doc.getElementById(styleId)?.remove();
    const style = doc.createElement('style');
    style.id = styleId;
    style.textContent = `
      #chat.${chatActiveClass} > .mes,
      #chat.${chatActiveClass} > #show_more_messages { display: none !important; }
      body.${activeClass} #send_form { display: none !important; }
      #${shellId} {
        box-sizing: border-box;
        display: block;
        flex: 0 0 auto;
        width: 100%;
        min-width: 0;
        min-height: 320px;
        height: clamp(560px, calc(100dvh - 76px), 960px);
        margin: 0;
        padding: 0;
        overflow: hidden;
        border: 0;
        border-radius: 14px;
        background: #171a1e;
        isolation: isolate;
      }
      #${shellId}[hidden] { display: none !important; }
      #${shellId} > iframe {
        display: block;
        width: 100%;
        height: 100%;
        min-width: 0;
        border: 0;
        background: #171a1e;
      }
      #${returnButtonId} {
        position: fixed;
        right: max(16px, env(safe-area-inset-right));
        bottom: max(72px, calc(env(safe-area-inset-bottom) + 64px));
        z-index: 2147483000;
        min-width: 44px;
        min-height: 44px;
        padding: 9px 14px;
        border: 1px solid #bc9b67;
        border-radius: 12px;
        background: #29251f;
        color: #fff8df;
        font: 600 14px/1.2 system-ui, sans-serif;
        cursor: pointer;
      }
      @media (max-width: 600px), (max-height: 680px) {
        #${shellId} {
          height: max(460px, calc(100dvh - 54px));
          border-radius: 8px;
        }
      }
    `;
    doc.head.append(style);
  }

  function exposeBridgeGlobals(child) {
    for (const name of [
      'waitGlobalInitialized',
      'getChatMessages',
      'getLastMessageId',
      'createChatMessages',
      'triggerSlash',
      'getTavernVersion',
      'getTavernHelperVersion',
      'eventOn',
      'generate',
      'getCurrentPersonaName',
      'getPersona',
    ]) {
      if (typeof source[name] === 'function') child[name] = source[name].bind(source);
    }
    for (const name of ['tavern_events', 'SillyTavern']) {
      Object.defineProperty(child, name, {
        configurable: true,
        get: () => source[name] ?? host[name],
      });
    }
    Object.defineProperty(child, 'Mvu', {
      configurable: true,
      get: () => source.Mvu ?? host.Mvu,
    });
    Object.defineProperty(child, 'AutoCardUpdaterAPI', {
      configurable: true,
      get: () => host.AutoCardUpdaterAPI,
    });
  }

  function createGameFrame(shell) {
    const frame = doc.createElement('iframe');
    frame.title = '幻想乡物语·移动庭园';
    frame.setAttribute('allow', 'clipboard-write');
    shell.append(frame);
    const child = frame.contentWindow;
    const childDoc = frame.contentDocument;
    if (!child || !childDoc) throw new Error('无法创建移动庭园 iframe');
    childDoc.open();
    childDoc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body></body></html>');
    childDoc.close();
    childDoc.documentElement.dataset.mapSrc = embedded.mapDataUrl;
    if (embedded.assetDeliveryConfig) childDoc.documentElement.dataset.assetDeliveryConfig = JSON.stringify(embedded.assetDeliveryConfig);
    if (embedded.dungeonButtonDataUrl) childDoc.documentElement.dataset.dungeonButtonSrc = embedded.dungeonButtonDataUrl;
    if (embedded.shopButtonDataUrl) childDoc.documentElement.dataset.shopButtonSrc = embedded.shopButtonDataUrl;
    if (embedded.inventoryButtonDataUrl) childDoc.documentElement.dataset.inventoryButtonSrc = embedded.inventoryButtonDataUrl;
    if (embedded.shopBackgroundDataUrl) childDoc.documentElement.dataset.shopBackgroundSrc = embedded.shopBackgroundDataUrl;
    if (embedded.galBackgroundDataUrl) childDoc.documentElement.dataset.galBackgroundSrc = embedded.galBackgroundDataUrl;
    childDoc.documentElement.dataset.galPortraitSources = JSON.stringify(embedded.galPortraitDataUrls || {});
    if (embedded.mapNoWalkMaskDataUrl) childDoc.documentElement.dataset.mapNoWalkMaskSrc = embedded.mapNoWalkMaskDataUrl;
    const characterSprites = embedded.characterSpriteDataUrls || {};
    Object.entries(characterSprites).forEach(([id, sources]) => {
      if (sources?.idle) childDoc.documentElement.dataset[`${id}SpriteSrc`] = sources.idle;
      if (sources?.motion) childDoc.documentElement.dataset[`${id}MotionSrc`] = sources.motion;
      if (sources?.animation) childDoc.documentElement.dataset[`${id}AnimationSrc`] = sources.animation;
      if (sources?.sequence) childDoc.documentElement.dataset[`${id}SequenceSrc`] = sources.sequence;
    });
    if (characterSprites.reimu?.idle) childDoc.documentElement.dataset.reimuPortraitSrc = characterSprites.reimu.idle;
    if (characterSprites.marisa?.idle) childDoc.documentElement.dataset.marisaPortraitSrc = characterSprites.marisa.idle;
    childDoc.documentElement.dataset.mainHouseSrc = embedded.mainHouseDataUrl;
    childDoc.documentElement.dataset.greenhouseSrc = embedded.greenhouseDataUrl;
    childDoc.documentElement.dataset.mapFacilitySprites = JSON.stringify(embedded.mapFacilityDataUrls || {});
    // Battle sheets plus direct-import cut-in portraits (no chroma duplicates).
    if (embedded.battlePlayerDataUrl) childDoc.documentElement.dataset.battlePlayerSrc = embedded.battlePlayerDataUrl;
    if (embedded.battleBossDataUrl) childDoc.documentElement.dataset.battleBossSrc = embedded.battleBossDataUrl;
    if (embedded.battleBossReimuDataUrl) childDoc.documentElement.dataset.battleBossReimuSrc = embedded.battleBossReimuDataUrl;
    if (embedded.battleBossMarisaDataUrl) childDoc.documentElement.dataset.battleBossMarisaSrc = embedded.battleBossMarisaDataUrl;
    if (embedded.battleBossCirnoDataUrl) childDoc.documentElement.dataset.battleBossCirnoSrc = embedded.battleBossCirnoDataUrl;
    if (embedded.battleBossAliceDataUrl) childDoc.documentElement.dataset.battleBossAliceSrc = embedded.battleBossAliceDataUrl;
    if (embedded.battleBossNitoriDataUrl) childDoc.documentElement.dataset.battleBossNitoriSrc = embedded.battleBossNitoriDataUrl;
    if (embedded.battleBossMystiaDataUrl) childDoc.documentElement.dataset.battleBossMystiaSrc = embedded.battleBossMystiaDataUrl;
    if (embedded.battleBossSuikaDataUrl) childDoc.documentElement.dataset.battleBossSuikaSrc = embedded.battleBossSuikaDataUrl;
    if (embedded.battleBossSakuyaDataUrl) childDoc.documentElement.dataset.battleBossSakuyaSrc = embedded.battleBossSakuyaDataUrl;
    if (embedded.battlePortraitReimuS0DataUrl) childDoc.documentElement.dataset.battlePortraitReimuS0Src = embedded.battlePortraitReimuS0DataUrl;
    if (embedded.battlePortraitReimuS1DataUrl) childDoc.documentElement.dataset.battlePortraitReimuS1Src = embedded.battlePortraitReimuS1DataUrl;
    if (embedded.battlePortraitReimuS2DataUrl) childDoc.documentElement.dataset.battlePortraitReimuS2Src = embedded.battlePortraitReimuS2DataUrl;
    if (embedded.battlePortraitMarisaS0DataUrl) childDoc.documentElement.dataset.battlePortraitMarisaS0Src = embedded.battlePortraitMarisaS0DataUrl;
    if (embedded.battlePortraitMarisaS1DataUrl) childDoc.documentElement.dataset.battlePortraitMarisaS1Src = embedded.battlePortraitMarisaS1DataUrl;
    if (embedded.battlePortraitMarisaS2DataUrl) childDoc.documentElement.dataset.battlePortraitMarisaS2Src = embedded.battlePortraitMarisaS2DataUrl;
    if (embedded.battlePortraitAliceS0DataUrl) childDoc.documentElement.dataset.battlePortraitAliceS0Src = embedded.battlePortraitAliceS0DataUrl;
    if (embedded.battlePortraitAliceS1DataUrl) childDoc.documentElement.dataset.battlePortraitAliceS1Src = embedded.battlePortraitAliceS1DataUrl;
    if (embedded.battlePortraitAliceS2DataUrl) childDoc.documentElement.dataset.battlePortraitAliceS2Src = embedded.battlePortraitAliceS2DataUrl;
    if (embedded.battlePortraitCirnoS0DataUrl) childDoc.documentElement.dataset.battlePortraitCirnoS0Src = embedded.battlePortraitCirnoS0DataUrl;
    if (embedded.battlePortraitCirnoS1DataUrl) childDoc.documentElement.dataset.battlePortraitCirnoS1Src = embedded.battlePortraitCirnoS1DataUrl;
    if (embedded.battlePortraitCirnoS2DataUrl) childDoc.documentElement.dataset.battlePortraitCirnoS2Src = embedded.battlePortraitCirnoS2DataUrl;
    if (embedded.battlePortraitMystiaS0DataUrl) childDoc.documentElement.dataset.battlePortraitMystiaS0Src = embedded.battlePortraitMystiaS0DataUrl;
    if (embedded.battlePortraitMystiaS1DataUrl) childDoc.documentElement.dataset.battlePortraitMystiaS1Src = embedded.battlePortraitMystiaS1DataUrl;
    if (embedded.battlePortraitMystiaS2DataUrl) childDoc.documentElement.dataset.battlePortraitMystiaS2Src = embedded.battlePortraitMystiaS2DataUrl;
    if (embedded.battlePortraitNitoriS0DataUrl) childDoc.documentElement.dataset.battlePortraitNitoriS0Src = embedded.battlePortraitNitoriS0DataUrl;
    if (embedded.battlePortraitNitoriS1DataUrl) childDoc.documentElement.dataset.battlePortraitNitoriS1Src = embedded.battlePortraitNitoriS1DataUrl;
    if (embedded.battlePortraitNitoriS2DataUrl) childDoc.documentElement.dataset.battlePortraitNitoriS2Src = embedded.battlePortraitNitoriS2DataUrl;
    if (embedded.battlePortraitSuikaS0DataUrl) childDoc.documentElement.dataset.battlePortraitSuikaS0Src = embedded.battlePortraitSuikaS0DataUrl;
    if (embedded.battlePortraitSuikaS1DataUrl) childDoc.documentElement.dataset.battlePortraitSuikaS1Src = embedded.battlePortraitSuikaS1DataUrl;
    if (embedded.battlePortraitSuikaS2DataUrl) childDoc.documentElement.dataset.battlePortraitSuikaS2Src = embedded.battlePortraitSuikaS2DataUrl;
    if (embedded.battlePortraitSakuyaS0DataUrl) childDoc.documentElement.dataset.battlePortraitSakuyaS0Src = embedded.battlePortraitSakuyaS0DataUrl;
    if (embedded.battlePortraitSakuyaS1DataUrl) childDoc.documentElement.dataset.battlePortraitSakuyaS1Src = embedded.battlePortraitSakuyaS1DataUrl;
    if (embedded.battlePortraitSakuyaS2DataUrl) childDoc.documentElement.dataset.battlePortraitSakuyaS2Src = embedded.battlePortraitSakuyaS2DataUrl;
    if (embedded.battlePortraitFlowerCoreS0DataUrl) childDoc.documentElement.dataset.battlePortraitFlowerCoreS0Src = embedded.battlePortraitFlowerCoreS0DataUrl;
    if (embedded.battlePortraitFlowerCoreS1DataUrl) childDoc.documentElement.dataset.battlePortraitFlowerCoreS1Src = embedded.battlePortraitFlowerCoreS1DataUrl;
    if (embedded.battlePortraitFlowerCoreS2DataUrl) childDoc.documentElement.dataset.battlePortraitFlowerCoreS2Src = embedded.battlePortraitFlowerCoreS2DataUrl;
    if (embedded.battleFairyDataUrl) childDoc.documentElement.dataset.battleFairySrc = embedded.battleFairyDataUrl;
    if (embedded.battleEffectsDataUrl) childDoc.documentElement.dataset.battleEffectsSrc = embedded.battleEffectsDataUrl;
    if (embedded.battleBulletsLocalDataUrl) childDoc.documentElement.dataset.battleBulletsLocalSrc = embedded.battleBulletsLocalDataUrl;
    if (embedded.battleSfxDataUrls) childDoc.documentElement.dataset.battleSfxSources = JSON.stringify(embedded.battleSfxDataUrls);
    const style = childDoc.createElement('style');
    style.textContent = embedded.css;
    childDoc.head.append(style);
    childDoc.body.innerHTML = embedded.body;
    exposeBridgeGlobals(child);
    child.addEventListener('gensokyo-garden:show-native-chat', showNativeChat);
    child.addEventListener('gensokyo-garden:reload', rebuildFrame);
    const script = childDoc.createElement('script');
    script.textContent = embedded.appJs;
    childDoc.body.append(script);
    return frame;
  }

  function rebuildFrame() {
    if (state.destroyed || !ownsCurrentCharacter() || !state.shell?.isConnected) {
      if (!state.destroyed && !ownsCurrentCharacter()) destroy();
      return;
    }
    state.frame?.remove();
    state.frame = createGameFrame(state.shell);
  }

  function ensureReturnButton() {
    if (state.returnButton?.isConnected) return state.returnButton;
    const button = doc.createElement('button');
    button.id = returnButtonId;
    button.type = 'button';
    button.textContent = '返回移动庭园';
    button.setAttribute('aria-label', '隐藏原生聊天并返回移动庭园');
    button.addEventListener('click', showGame);
    doc.body.append(button);
    state.returnButton = button;
    return button;
  }

  function findChat() {
    return doc.querySelector('#chat');
  }

  function ownsCurrentCharacter() {
    return currentCharacterId() === state.ownerCharacterId;
  }

  function attachShell() {
    if (state.destroyed) return;
    if (!ownsCurrentCharacter()) {
      destroy();
      return;
    }
    const chat = findChat();
    if (!chat) return;
    if (state.chat !== chat) {
      state.chat?.classList.remove(chatActiveClass);
      state.chat = chat;
    }
    if (!state.shell?.isConnected) {
      doc.querySelectorAll(`#${shellId}`).forEach((staleShell) => staleShell.remove());
      const shell = doc.createElement('section');
      shell.id = shellId;
      shell.dataset.version = version;
      shell.setAttribute('aria-label', '移动庭园游戏界面');
      chat.prepend(shell);
      const frame = createGameFrame(shell);
      state.shell = shell;
      state.frame = frame;
    } else if (state.shell.parentElement !== chat) {
      chat.prepend(state.shell);
    }
    applyMode();
  }

  function applyMode() {
    if (!state.chat || !state.shell) return;
    if (!ownsCurrentCharacter()) {
      destroy();
      return;
    }
    doc.body.classList.toggle(activeClass, !state.nativeMode);
    state.chat.classList.toggle(chatActiveClass, !state.nativeMode);
    state.shell.hidden = state.nativeMode;
    ensureReturnButton().hidden = !state.nativeMode;
  }

  function showNativeChat() {
    state.nativeMode = true;
    applyMode();
  }

  function showGame() {
    state.nativeMode = false;
    attachShell();
    state.frame?.focus();
    const child = state.frame?.contentWindow;
    if (child) child.dispatchEvent(new child.CustomEvent('gensokyo-garden:resume'));
  }

  function queueRemount() {
    if (state.remountQueued || state.destroyed) return;
    if (!ownsCurrentCharacter()) {
      destroy();
      return;
    }
    state.remountQueued = true;
    queueMicrotask(() => {
      state.remountQueued = false;
      attachShell();
    });
  }

  function subscribe(eventName, listener) {
    if (!eventName || typeof source.eventOn !== 'function') return;
    const subscription = source.eventOn(eventName, listener);
    if (subscription?.stop) state.eventStops.push(subscription.stop);
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    state.eventStops.splice(0).forEach((stop) => stop());
    state.observer?.disconnect();
    state.chat?.classList.remove(chatActiveClass);
    clearHostArtifacts();
    if (host[instanceKey]?.destroy === destroy) delete host[instanceKey];
  }

  source.addEventListener('pagehide', destroy, { once: true });
  installHostStyle();
  ensureReturnButton();
  attachShell();
  state.observer = new MutationObserver(queueRemount);
  state.observer.observe(doc.body, { childList: true, subtree: true });
  subscribe(source.tavern_events?.CHAT_CHANGED, () => {
    if (!ownsCurrentCharacter()) {
      destroy();
      return;
    }
    state.nativeMode = false;
    attachShell();
  });
  host[instanceKey] = {
    version,
    ownerCharacterId,
    showGame,
    showNativeChat,
    ensureMounted: attachShell,
    destroy,
  };
})();
