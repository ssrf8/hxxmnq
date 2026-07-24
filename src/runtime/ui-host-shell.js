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
  const version = '0.4.3-host-generate-r23';

  host[instanceKey]?.destroy?.();

  function currentCharacterId() {
    try {
      const api = source.SillyTavern ?? host.SillyTavern;
      const context = typeof api?.getContext === 'function' ? api.getContext() : api;
      return String(context?.characterId ?? '');
    } catch {
      return '';
    }
  }

  function clearHostArtifacts() {
    doc.body?.classList.remove(activeClass);
    doc.querySelectorAll(`#chat.${chatActiveClass}`).forEach((chat) => chat.classList.remove(chatActiveClass));
    doc.querySelectorAll(`#${shellId}, #${returnButtonId}, #${styleId}`).forEach((element) => element.remove());
  }

  clearHostArtifacts();
  const ownerCharacterId = currentCharacterId();
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
    childDoc.documentElement.dataset.reimuSpriteSrc = embedded.reimuSpriteDataUrl;
    childDoc.documentElement.dataset.reimuPortraitSrc = embedded.reimuPortraitDataUrl;
    childDoc.documentElement.dataset.marisaSpriteSrc = embedded.marisaSpriteDataUrl;
    childDoc.documentElement.dataset.marisaPortraitSrc = embedded.marisaPortraitDataUrl;
    childDoc.documentElement.dataset.mainHouseSrc = embedded.mainHouseDataUrl;
    childDoc.documentElement.dataset.greenhouseSrc = embedded.greenhouseDataUrl;
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
    rebuildFrame();
  });
  host[instanceKey] = { version, showGame, showNativeChat, destroy };
})();
