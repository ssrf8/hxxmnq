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
  const returnFrameId = 'gensokyo-game-return-frame';
  const chatCleanupKey = '__GENSOKYO_GARDEN_CHAT_CLEANUP_024__';
  const heartbeatKey = '__GENSOKYO_GARDEN_HEARTBEAT_024__';
  const guardKey = '__GENSOKYO_GARDEN_GUARD_024__';
  const activeClass = 'gg-gensokyo-game-active';
  const chatActiveClass = 'gg-gensokyo-chat-active';
  // Phase 6 §6.2：独立 floors-hidden class——GAL 激活时隐藏真实楼层；调试模式移除它显示楼层。
  // 与 chatActiveClass 分开，避免「调试要显示楼层」与「GAL 激活隐藏楼层」互相打架。
  const floorsHiddenClass = 'gg-gensokyo-floors-hidden';
  const version = '0.4.4-late-bound-generate-r2';

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
    doc.querySelectorAll(`#${shellId}, #${returnFrameId}, #${styleId}`).forEach((element) => element.remove());
  }

  // 参考明月秋青脚本：切换聊天/角色卡后彻底清理宿主层残留（悬浮返回按钮、宿主样式）。
  // tavern_helper 在切换聊天时会停止旧脚本（销毁脚本 iframe），其 eventOn 监听器随之失效，
  // 父页面上的悬浮窗 DOM 因此无人清理。这里直接在父页面 eventSource 上注册原生 chat_changed
  // 监听器（仅清理、不重建），监听器由父页面持有，不随脚本 iframe 销毁而失效。
  function registerHostChatCleanup() {
    try {
      const es = host.eventSource;
      if (!es || typeof es.on !== 'function' || host[chatCleanupKey]) return;
      const cleanup = () => {
        try {
          doc.getElementById(returnFrameId)?.remove();
          doc.body?.classList.remove(activeClass);
          doc.querySelectorAll(`#chat.${chatActiveClass}`).forEach((chat) => chat.classList.remove(chatActiveClass));
        } catch { /* ignore */ }
      };
      es.on('chat_changed', cleanup);
      host[chatCleanupKey] = cleanup;
    } catch { /* ignore */ }
  }

  // 心跳与守卫：脚本活跃期间由沙箱 iframe 内定时器持续刷新父页面的心跳标记；
  // 父页面常驻守卫定期检查，一旦心跳过期（脚本被 tavern_helper 停止、iframe 被销毁），
  // 就清除悬浮返回按钮等宿主层残留。这是不依赖任何事件系统能否送达的最终兜底。
  function startHeartbeat() {
    try {
      const tick = () => {
        try { host[heartbeatKey] = Date.now(); } catch { /* ignore */ }
      };
      tick();
      source.setInterval(tick, 1000);
    } catch { /* ignore */ }
  }

  function registerHostGuard() {
    try {
      if (host[guardKey]) return;
      const guard = () => {
        try {
          const last = host[heartbeatKey];
          const fresh = typeof last === 'number' && Date.now() - last < 3500;
          if (fresh) return;
          doc.getElementById(returnFrameId)?.remove();
          doc.body?.classList.remove(activeClass);
          doc.querySelectorAll(`#chat.${chatActiveClass}`).forEach((chat) => chat.classList.remove(chatActiveClass));
        } catch { /* ignore */ }
      };
      host.setInterval(guard, 1500);
      host[guardKey] = true;
    } catch { /* ignore */ }
  }

  // ── 自动清理（参考 th-orb-v2 / TGbreak 脚本的销毁方式）──
  // 极简、无状态依赖、不可能抛异常：tavern_helper 停止脚本（销毁 iframe）或页面
  // 卸载时，pagehide/unload 触发即移除悬浮返回按钮、游戏界面壳与宿主样式。
  function cleanupHostArtifacts() {
    try {
      doc.getElementById(returnFrameId)?.remove();
      doc.getElementById(shellId)?.remove();
      doc.getElementById(styleId)?.remove();
      doc.body?.classList.remove(activeClass);
      doc.querySelectorAll(`#chat.${chatActiveClass}`).forEach((chat) => chat.classList.remove(chatActiveClass));
    } catch { /* ignore */ }
  }

  clearHostArtifacts();
  registerHostChatCleanup();
  registerHostGuard();
  if (!ownerCharacterId) return;

  const state = {
    ownerCharacterId,
    chat: null,
    shell: null,
    frame: null,
    returnFrame: null,
    observer: null,
    eventStops: [],
    nativeMode: false,
    // Phase 6 §6.3：调试楼层开关只存 sessionStorage（新会话自动关；不写 MVU/聊天/角色卡）。
    debugFloorsVisible: false,
    remountQueued: false,
    destroyed: false,
  };
  try {
    state.debugFloorsVisible = doc.defaultView?.sessionStorage?.getItem('galDebugFloorsVisible') === '1';
  } catch { /* sessionStorage 不可用时保持关闭 */ }

  function installHostStyle() {
    doc.getElementById(styleId)?.remove();
    const style = doc.createElement('style');
    style.id = styleId;
    style.textContent = `
      body.${activeClass} #send_form { display: none !important; }
      body.${activeClass} #chat.${floorsHiddenClass} > .mes,
      body.${activeClass} #chat.${floorsHiddenClass} > #show_more_messages { display: none !important; }
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
      #${returnFrameId} {
        position: fixed;
        left: 16px;
        top: 16px;
        width: 132px;
        height: 44px;
        border: 0;
        margin: 0;
        padding: 0;
        background: transparent;
        z-index: 2147483000;
      }
      #${returnFrameId}[hidden] { display: none !important; }
      @media (max-width: 480px) {
        #${returnFrameId} {
          width: 120px;
          height: 42px;
        }
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

  // R2 数据库共存：generate 必须按调用时刻解析。
  // SP·数据库等宿主扩展可能在游戏 iframe 挂载后才包装 TavernHelper.generate；
  // 若像其他稳定 helper 一样提前 bind，会永久绕过后来安装的 wrapper。
  function resolveCurrentGenerate(sourceWindow = source, hostWindow = host) {
    const helpers = [];
    try { helpers.push(sourceWindow.TavernHelper); } catch { /* optional source helper unavailable */ }
    try { helpers.push(hostWindow.TavernHelper); } catch { /* optional host helper unavailable */ }
    for (const helper of helpers) {
      if (typeof helper?.generate === 'function') {
        return { fn: helper.generate, receiver: helper };
      }
    }
    try {
      if (typeof sourceWindow.generate === 'function') {
        return { fn: sourceWindow.generate, receiver: sourceWindow };
      }
    } catch { /* injected helper getter unavailable */ }
    try {
      if (typeof hostWindow.generate === 'function') {
        return { fn: hostWindow.generate, receiver: hostWindow };
      }
    } catch { /* parent helper unavailable */ }
    return null;
  }

  function callCurrentGenerate(...args) {
    const current = resolveCurrentGenerate();
    if (!current) throw new Error('Helper generate() 未暴露');
    return Reflect.apply(current.fn, current.receiver, args);
  }

  function exposeBridgeGlobals(child) {
    for (const name of [
      'waitGlobalInitialized',
      'getChatMessages',
      'getLastMessageId',
      'createChatMessages',
      'deleteChatMessages',
      'reloadCurrentChat',
      'getOrCreateChatWorldbook',
      'getWorldbook',
      'updateWorldbookWith',
      'triggerSlash',
      'getTavernVersion',
      'getTavernHelperVersion',
      'eventOn',
      'getCurrentPersonaName',
      'getPersona',
    ]) {
      if (typeof source[name] === 'function') child[name] = source[name].bind(source);
    }
    // Helper 4.8.18 的稳定门面通常位于 TavernHelper；部分脚本环境也会把
    // 同名函数平铺到 iframe global。优先保留平铺值，缺失时才从门面补齐。
    for (const name of [
      'deleteChatMessages',
      'getOrCreateChatWorldbook',
      'getWorldbook',
      'updateWorldbookWith',
    ]) {
      if (typeof child[name] === 'function') continue;
      const helper = source.TavernHelper ?? host.TavernHelper;
      if (typeof helper?.[name] === 'function') child[name] = helper[name].bind(helper);
    }
    // 无论挂载时 generate 是否已经存在，都暴露 late-bound 转发；实际能力在调用时裁定。
    child.generate = (...args) => callCurrentGenerate(...args);
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
    // [B4-DATABASE-BRIDGE-START] 唯一允许出现 AutoCardUpdaterAPI 暴露的块；由 build-ui.mjs 按 memory profile guarded 保留/删除
    Object.defineProperty(child, 'AutoCardUpdaterAPI', {
      configurable: true,
      get: () => host.AutoCardUpdaterAPI,
    });
    // [B4-DATABASE-BRIDGE-END]
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
    if (embedded.assetBase) childDoc.documentElement.dataset.assetBase = embedded.assetBase;
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
    // Phase 6：调试楼层开关（detail: { visible: boolean }）
    child.addEventListener('gensokyo-garden:toggle-debug-floors', (event) => {
      const visible = Boolean(event?.detail?.visible);
      toggleDebugFloors(visible);
    });
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

  // 返回按钮放在独立的小尺寸悬浮 iframe 里（仿明月秋青方案）：iframe 内部文档不受 ST
  // 页面 CSS（transform/contain/filter）污染，按钮样式与点击行为完全独立。iframe 本身
  // 只是按钮大小的一块区域，其余区域自然穿透，不影响原生聊天交互。位置由宿主层
  // positionReturnFrame() 按 window.parent 的 visualViewport 计算并强制写入。
  function ensureReturnFrame() {
    if (state.returnFrame?.isConnected) return state.returnFrame;
    const frame = doc.createElement('iframe');
    frame.id = returnFrameId;
    frame.setAttribute('aria-label', '返回移动庭园悬浮按钮（独立层）');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('scrolling', 'no');
    frame.srcdoc = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
  #gg-return {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 8px 12px;
    border: 1px solid #bc9b67;
    border-radius: 12px;
    background: #29251f;
    color: #fff8df;
    font: 600 14px/1.2 system-ui, sans-serif;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transform: none !important;
    touch-action: manipulation;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    box-shadow: 0 4px 14px rgba(0,0,0,.45);
  }
  @media (max-width: 480px) {
    #gg-return { font-size: 12px; padding: 7px 10px; }
  }
</style>
</head>
<body>
<button id="gg-return" type="button">返回移动庭园</button>
<script>
document.getElementById('gg-return').addEventListener('click', function () {
  try {
    var api = window.parent.__GENSOKYO_GARDEN_UI_024__;
    if (api && typeof api.showGame === 'function') api.showGame();
  } catch (e) { /* ignore */ }
});
<\/script>
</body>
</html>`;
    doc.body.append(frame);
    state.returnFrame = frame;
    return frame;
  }

  // 主动把返回 iframe 钉在视觉视口右下角：不依赖 CSS right/bottom（会被 ST 的
  // transform/滚动破坏），每次显示/滚动/缩放/键盘弹起都重新计算像素坐标并强制写入。
  function positionReturnFrame() {
    const frame = state.returnFrame;
    if (!frame || frame.hidden) return;
    requestAnimationFrame(() => {
      if (!frame.isConnected || frame.hidden) return;
      const view = doc.defaultView;
      const vv = view?.visualViewport;
      const vw = vv?.width ?? doc.documentElement.clientWidth;
      const vh = vv?.height ?? doc.documentElement.clientHeight;
      const vvTop = vv ? vv.offsetTop : 0;
      const w = frame.offsetWidth || 132;
      const h = frame.offsetHeight || 44;
      const margin = 16;
      const left = Math.max(margin, vw - w - margin);
      const top = Math.max(margin, vvTop + vh - h - margin);
      const style = frame.style;
      style.setProperty('position', 'fixed', 'important');
      style.setProperty('left', `${left}px`, 'important');
      style.setProperty('top', `${top}px`, 'important');
      style.setProperty('right', 'auto', 'important');
      style.setProperty('bottom', 'auto', 'important');
    });
  }

  function bindViewportClamping() {
    if (!doc.defaultView) return;
    const onViewportChange = () => {
      if (!state.nativeMode) return;
      positionReturnFrame();
    };
    const onScroll = () => {
      if (!state.nativeMode) return;
      positionReturnFrame();
    };
    doc.defaultView.addEventListener('resize', onViewportChange);
    doc.defaultView.addEventListener('orientationchange', onViewportChange);
    const vv = doc.defaultView.visualViewport;
    if (vv) vv.addEventListener('resize', onViewportChange);
    doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
    state.eventStops.push({
      stop: () => {
        doc.defaultView.removeEventListener('resize', onViewportChange);
        doc.defaultView.removeEventListener('orientationchange', onViewportChange);
        vv?.removeEventListener('resize', onViewportChange);
        doc.removeEventListener('scroll', onScroll, { capture: true });
      },
    });
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
    // Phase 6 §6.1 派生规则：floorsHidden = !nativeMode && !debugFloorsVisible；
    // native 模式移除（恢复宿主）；调试模式移除（显示楼层）。
    state.chat.classList.toggle(floorsHiddenClass, !state.nativeMode && !state.debugFloorsVisible);
    state.shell.hidden = state.nativeMode;
    ensureReturnFrame().hidden = !state.nativeMode;
  }

  // Phase 6 §6.2/§6.3：调试楼层开关（app 内 checkbox → 事件 → 宿主原子应用）。
  // 只改 class，不操作消息数据字段；sessionStorage 持久（新会话自动关）。
  function toggleDebugFloors(visible) {
    state.debugFloorsVisible = Boolean(visible);
    try {
      doc.defaultView?.sessionStorage?.setItem('galDebugFloorsVisible', state.debugFloorsVisible ? '1' : '0');
    } catch { /* ignore */ }
    applyMode();
  }

  function showNativeChat() {
    state.nativeMode = true;
    applyMode();
    positionReturnFrame();
  }

  // 主动把按钮钉在视觉视口右下角：不依赖 CSS right/bottom（会被 ST 的 transform/滚动破坏），
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
    try { state.eventStops.splice(0).forEach((stop) => stop()); } catch { /* ignore */ }
    try { state.observer?.disconnect(); } catch { /* ignore */ }
    try { state.chat?.classList.remove(chatActiveClass); } catch { /* ignore */ }
    clearHostArtifacts();
    if (host[instanceKey]?.destroy === destroy) delete host[instanceKey];
  }

  source.addEventListener('pagehide', destroy, { once: true });
  installHostStyle();
  ensureReturnFrame();
  bindViewportClamping();
  attachShell();
  state.observer = new MutationObserver(queueRemount);
  state.observer.observe(doc.body, { childList: true, subtree: true });
  subscribe(source.tavern_events?.CHAT_CHANGED ?? 'chat_changed', () => {
    if (!ownsCurrentCharacter()) {
      destroy();
      return;
    }
    state.nativeMode = false;
    attachShell();
  });
  startHeartbeat();
  host[instanceKey] = {
    version,
    ownerCharacterId,
    showGame,
    showNativeChat,
    ensureMounted: attachShell,
    destroy,
  };
  source.addEventListener('pagehide', cleanupHostArtifacts);
  source.addEventListener('unload', cleanupHostArtifacts);
})();
