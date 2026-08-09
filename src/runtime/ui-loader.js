// 远程 UI 交付 loader — 由 scripts/build-ui.mjs 生成最终版（替换 __UI_MANIFEST_URL__）。
// 作为卡内唯一 UI 脚本（tavern_helper 模块脚本）运行：读 R2 的 ui-manifest.json 指针，
// 校验 sha256 后经 Blob URL import 远程 ui-mount 包。更新 UI 只改 R2 上的 manifest 指针，
// 已导入的卡无需重发即可在刷新后自动跟到新版。
(() => {
  'use strict';

  const MANIFEST_URL = '__UI_MANIFEST_URL__';
  // 编译时注入通道：production（正式，/live/ui/）或 test（测试，/test/ui/）。
  // 缺失 channel 的旧正式 manifest 视为 production 以保持兼容；测试 loader 必须显式 channel=test。
  const CHANNEL = '__UI_CHANNEL__';
  const VERSION_PATTERN = CHANNEL === 'test' ? /^test-r[1-9]\d*$/ : /^r[1-9]\d*$/;

  function validateManifest(manifest) {
    if (!manifest || manifest.schema_version !== 'gensokyo-ui-live.v1') {
      throw new Error('ui-manifest schema_version 非法');
    }
    const manifestChannel = CHANNEL === 'test' ? manifest.channel : (manifest.channel ?? 'production');
    if (manifestChannel !== CHANNEL) {
      throw new Error(`ui-manifest channel 与当前通道（${CHANNEL}）不一致`);
    }
    if (typeof manifest.version !== 'string' || !VERSION_PATTERN.test(manifest.version)) {
      throw new Error(`ui-manifest version 非法（当前通道 ${CHANNEL}）`);
    }
    if (typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
      throw new Error('ui-manifest sha256 非法或缺失');
    }
    if (!Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0) {
      throw new Error('ui-manifest bytes 非法或缺失');
    }
    if (typeof manifest.url !== 'string') throw new Error('ui-manifest url 非法或缺失');
    const manifestUrl = new URL(MANIFEST_URL);
    const uiUrl = new URL(manifest.url);
    const expectedPath = manifestUrl.pathname.replace(/ui-manifest\.json$/, `ui-mount-${manifest.version}.js`);
    if (
      uiUrl.protocol !== 'https:'
      || uiUrl.origin !== manifestUrl.origin
      || uiUrl.pathname !== expectedPath
      || uiUrl.username
      || uiUrl.password
      || uiUrl.search
      || uiUrl.hash
    ) {
      throw new Error('ui-manifest url 不属于受信任的版本化 UI 路径');
    }
    return uiUrl.href;
  }

  async function loadRemoteUi() {
    if (!globalThis.crypto?.subtle) {
      throw new Error('当前页面缺少 Web Crypto；请通过 HTTPS 或可信 localhost 打开 SillyTavern');
    }
    const manifestRes = await fetch(MANIFEST_URL, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (!manifestRes.ok) throw new Error(`ui-manifest HTTP ${manifestRes.status}`);
    const manifest = await manifestRes.json();
    const uiUrl = validateManifest(manifest);
    const uiRes = await fetch(uiUrl, { credentials: 'omit', redirect: 'error' });
    if (!uiRes.ok) throw new Error(`ui-mount HTTP ${uiRes.status}`);
    const bytes = new Uint8Array(await uiRes.arrayBuffer());
    if (bytes.byteLength !== manifest.bytes) throw new Error('ui-mount 字节数与 manifest 不一致');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex !== manifest.sha256) throw new Error('ui-mount sha256 校验失败（内容与 manifest 不一致）');
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
    try {
      await import(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
    try {
      const host = (window.parent && window.parent.document) || document;
      host.getElementById('gensokyo-ui-load-error')?.remove();
    } catch {
      // 成功清理旧提示失败不影响已挂载 UI
    }
  }

  loadRemoteUi().catch((error) => {
    console.error('[幻想乡物语] 远程 UI 加载失败:', error);
    try {
      const host = (window.parent && window.parent.document) || document;
      const existing = host.getElementById('gensokyo-ui-load-error');
      if (existing) return;
      const banner = host.createElement('div');
      banner.id = 'gensokyo-ui-load-error';
      banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#7f1d1d;color:#fff;padding:8px 14px;border-radius:8px;font:14px/1.4 sans-serif;max-width:90vw;box-shadow:0 2px 10px rgba(0,0,0,.35);';
      banner.textContent = '移动庭园 UI 加载失败（R2 不可达、清单不合法，或当前页面需要 HTTPS），请刷新页面重试。';
      host.body?.appendChild(banner);
    } catch {
      // 兜底提示失败不影响主流程
    }
  });
})();
