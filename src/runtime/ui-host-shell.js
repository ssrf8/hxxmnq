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
  const instanceKey = '__GENSOKYO_GARDEN_UI_021__';
  const shellId = 'gensokyo-game-shell';
  const styleId = 'gensokyo-game-host-style';
  const activeClass = 'gg-gensokyo-game-active';
  const chatActiveClass = 'gg-gensokyo-chat-active';
  const version = '0.2.1-same-layer';

  host[instanceKey]?.destroy?.();

  const state = {
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
      body.${activeClass} #send_form { display: none !important; }
      #chat.${chatActiveClass} > .mes,
      #chat.${chatActiveClass} > #show_more_messages { display: none !important; }
      #${shellId} {
        box-sizing: border-box;
        display: block;
        flex: 0 0 auto;
        width: 100%;
        min-width: 0;
        min-height: 320px;
        height: clamp(520px, calc(100dvh - 132px), 920px);
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
      #gensokyo-game-return {
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
          height: max(420px, calc(100dvh - 88px));
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
      'createChatMessages',
      'triggerSlash',
      'getTavernVersion',
      'getTavernHelperVersion',
      'eventOn',
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
    if (state.destroyed || !state.shell?.isConnected) return;
    state.frame?.remove();
    state.frame = createGameFrame(state.shell);
  }

  function ensureReturnButton() {
    if (state.returnButton?.isConnected) return state.returnButton;
    const button = doc.createElement('button');
    button.id = 'gensokyo-game-return';
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

  function attachShell() {
    if (state.destroyed) return;
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
    doc.body.classList.remove(activeClass);
    state.shell?.remove();
    state.returnButton?.remove();
    doc.getElementById(styleId)?.remove();
    delete host[instanceKey];
  }

  installHostStyle();
  ensureReturnButton();
  attachShell();
  state.observer = new MutationObserver(queueRemount);
  state.observer.observe(doc.body, { childList: true, subtree: true });
  subscribe(source.tavern_events?.CHAT_CHANGED, () => {
    state.nativeMode = false;
    attachShell();
    rebuildFrame();
  });
  host[instanceKey] = { version, showGame, showNativeChat, destroy };
})();
