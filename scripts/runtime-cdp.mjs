import { access } from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/u, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));
const command = String(args.command || 'inspect');
const debugPort = Number(args.port || 9333);
const targetOrigin = String(args.origin || 'http://127.0.0.1:8001');

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data));
      if (!payload.id) return;
      const waiter = this.pending.get(payload.id);
      if (!waiter) return;
      this.pending.delete(payload.id);
      if (payload.error) waiter.reject(new Error(`${payload.error.code}: ${payload.error.message}`));
      else waiter.resolve(payload.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
  }

  close() {
    this.socket?.close();
  }
}

async function pageTarget() {
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json());
  const page = targets.find(target => target.type === 'page' && target.url.startsWith(targetOrigin));
  if (!page) throw new Error(`没有找到 ${targetOrigin} 的 Chrome 页面`);
  return page;
}

async function snapshot(client) {
  return client.evaluate(`(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const popupRoot = [...document.querySelectorAll('#dialogue_popup, .popup, .popup-content')].find(visible);
    const buttons = [...document.querySelectorAll('button, .menu_button, .popup-button')]
      .filter(visible)
      .map(element => (element.textContent || element.getAttribute('title') || '').trim())
      .filter(Boolean)
      .slice(0, 80);
    return {
      readyState: document.readyState,
      title: document.title,
      url: location.href,
      importInput: Boolean(document.querySelector('#character_import_file')),
      tagImportSetting: document.querySelector('#tag_import_setting')?.value ?? null,
      worldImportDialog: document.querySelector('#world_import_dialog')?.checked ?? null,
      selectedName: document.querySelector('#character_name_pole')?.value ?? '',
      selectedAvatar: document.querySelector('#avatar_url_pole')?.value ?? '',
      linkedWorld: document.querySelector('#character_world')?.value ?? '',
      embeddedLoreMenu: (() => {
        const option = document.querySelector('#import_character_info');
        return {
          visible: option instanceof HTMLElement ? getComputedStyle(option).display !== 'none' : false,
          chid: globalThis.jQuery?.(option).data('chid') ?? null,
          value: option?.value ?? '',
          selected: option?.selected ?? false,
        };
      })(),
      popupText: popupRoot?.textContent?.replace(/\\s+/gu, ' ').trim().slice(0, 1000) ?? '',
      visibleButtons: buttons,
      shell: Boolean(document.querySelector('#gensokyo-game-shell')),
      shellVersion: document.querySelector('#gensokyo-game-shell')?.dataset?.version ?? '',
      frameReady: Boolean(document.querySelector('#gensokyo-game-shell iframe')?.contentDocument?.querySelector('#gg-app')),
      frame: (() => {
        const frameDocument = document.querySelector('#gensokyo-game-shell iframe')?.contentDocument;
        if (!frameDocument) return null;
        return {
          appBusy: frameDocument.querySelector('#gg-app')?.getAttribute('aria-busy') ?? null,
          openingHidden: frameDocument.querySelector('#gg-opening')?.hidden ?? null,
          runtimeHidden: frameDocument.querySelector('#gg-runtime-shell')?.hidden ?? null,
          liveStatus: frameDocument.querySelector('#gg-live-status')?.textContent?.trim() ?? '',
          gardenName: frameDocument.querySelector('#gg-garden-name')?.textContent?.trim() ?? '',
          diagnostics: frameDocument.querySelector('#gg-diagnostics')?.textContent?.replace(/\\s+/gu, ' ').trim() ?? '',
          mapSourceLength: frameDocument.documentElement.dataset.mapSrc?.length ?? 0,
          marisaSourceLength: frameDocument.documentElement.dataset.marisaSpriteSrc?.length ?? 0,
          greenhouseSourceLength: frameDocument.documentElement.dataset.greenhouseSrc?.length ?? 0,
        };
      })(),
      bodyClasses: document.body.className,
      chatMessages: document.querySelectorAll('#chat .mes').length,
      toasts: [...document.querySelectorAll('#toast-container .toast, .toast')]
        .filter(visible)
        .map(element => element.textContent.replace(/\\s+/gu, ' ').trim())
        .slice(-8),
    };
  })()`);
}

async function clickPopupChoice(client) {
  return client.evaluate(`(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const popup = [...document.querySelectorAll('#dialogue_popup, .popup, .popup-content')]
      .filter(visible)
      .at(-1);
    const candidates = [...(popup || document).querySelectorAll('button, .menu_button, .popup-button')].filter(visible);
    const text = element => (element.textContent || element.getAttribute('title') || '').replace(/\\s+/gu, ' ').trim();
    const priorities = [
      value => /^(Import All|全部导入)$/iu.test(value),
      value => /^(Yes|是|确定|确认)$/iu.test(value),
    ];
    for (const match of priorities) {
      const button = candidates.find(element => match(text(element)));
      if (button) {
        const choice = text(button);
        button.click();
        return choice;
      }
    }
    return '';
  })()`);
}

async function importCharacter(client, artifact) {
  const absolute = path.resolve(artifact);
  const expectedCheckpoint = path.basename(absolute).match(/0\.2\.0-r[0-9]+/u)?.[0];
  if (!expectedCheckpoint) throw new Error(`无法从产物名识别检查点：${absolute}`);
  await access(absolute);
  const document = await client.send('DOM.getDocument', { depth: 1, pierce: true });
  const input = await client.send('DOM.querySelector', {
    nodeId: document.root.nodeId,
    selector: '#character_import_file',
  });
  if (!input.nodeId) throw new Error('没有找到角色卡导入文件输入框');
  await client.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [absolute] });

  const actions = [];
  const deadline = Date.now() + 120000;
  let stableSelectedAt = 0;
  while (Date.now() < deadline) {
    const choice = await clickPopupChoice(client);
    if (choice) actions.push({ at: new Date().toISOString(), choice });
    const current = await snapshot(client);
    if (current.selectedName.includes(expectedCheckpoint) || current.selectedAvatar.includes(expectedCheckpoint)) {
      stableSelectedAt ||= Date.now();
      if (!current.popupText && Date.now() - stableSelectedAt >= 2500) {
        return { actions, snapshot: current };
      }
    }
    await delay(400);
  }
  return { actions, snapshot: await snapshot(client), timedOut: true };
}

async function reloadPage(client) {
  await client.send('Page.enable');
  await client.send('Page.reload', { ignoreCache: true });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const ready = await client.evaluate('document.readyState');
    if (ready === 'complete') {
      await delay(1500);
      return snapshot(client);
    }
    await delay(200);
  }
  throw new Error('页面重载超时');
}

async function deleteCharacterFile(client, avatar) {
  if (!/^幻想乡物语·移动庭园（测试检查点 0\.2\.0-r[0-9]+）(?:[0-9]+)?\.png$/u.test(avatar)) {
    throw new Error(`拒绝删除未登记角色卡名：${avatar}`);
  }
  return client.evaluate(`(async () => {
    const module = await import('/script.js');
    const response = await fetch('/api/characters/delete', {
      method: 'POST',
      headers: module.getRequestHeaders(),
      body: JSON.stringify({ avatar_url: ${JSON.stringify(avatar)}, delete_chats: false }),
      cache: 'no-cache',
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  })()`);
}

async function deleteWorldFile(client, worldName) {
  if (!/^幻想乡物语·移动庭园(?: 0\.2\.0(?:-r[0-9]+)?)?$/u.test(worldName)) {
    throw new Error(`拒绝删除未登记世界书名：${worldName}`);
  }
  return client.evaluate(`(async () => {
    const module = await import('/script.js');
    const response = await fetch('/api/worldinfo/delete', {
      method: 'POST',
      headers: module.getRequestHeaders(),
      body: JSON.stringify({ name: ${JSON.stringify(worldName)} }),
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  })()`);
}

async function cardInfo(client, avatar) {
  return client.evaluate(`(async () => {
    const module = await import('/script.js');
    const response = await fetch('/api/characters/get', {
      method: 'POST',
      headers: module.getRequestHeaders(),
      body: JSON.stringify({ avatar_url: ${JSON.stringify(avatar)} }),
      cache: 'no-cache',
    });
    if (!response.ok) return { ok: false, status: response.status, text: await response.text() };
    const card = await response.json();
    return {
      ok: true,
      status: response.status,
      name: card.data?.name ?? card.name,
      characterVersion: card.data?.character_version ?? '',
      linkedWorld: card.data?.extensions?.world ?? '',
      embeddedBookName: card.data?.character_book?.name ?? '',
      embeddedEntries: card.data?.character_book?.entries?.length ?? 0,
      topLevelBookName: card.character_book?.name ?? '',
      topLevelEntries: card.character_book?.entries?.length ?? 0,
      dataKeys: Object.keys(card.data ?? {}).sort(),
      scriptIds: (card.data?.extensions?.tavern_helper?.scripts ?? []).map(script => script.id),
    };
  })()`);
}

async function selectCharacter(client, query) {
  await client.evaluate(`(() => {
    document.querySelector('#rightNavDrawerIcon')?.click();
    document.querySelector('#rm_button_characters')?.click();
  })()`);
  const deadline = Date.now() + 90000;
  let clicked = false;
  const actions = [];
  while (Date.now() < deadline) {
    if (!clicked) {
      clicked = await client.evaluate(`(() => {
        const query = ${JSON.stringify(query)};
        const cards = [...document.querySelectorAll('#rm_print_characters_block .character_select')];
        const card = cards.find(element => {
          const text = element.textContent || '';
          const alt = element.querySelector('img')?.alt || '';
          const title = element.querySelector('.avatar')?.getAttribute('title') || '';
          return text.includes(query) || alt.includes(query) || title.includes(query);
        });
        if (!card) return false;
        card.click();
        return true;
      })()`);
    }
    const choice = await clickPopupChoice(client);
    if (choice) actions.push({ at: new Date().toISOString(), choice });
    const current = await snapshot(client);
    if (clicked && (current.selectedName.includes(query) || current.selectedAvatar.includes(query))) {
      if (!current.popupText) {
        await delay(2500);
        return { clicked, actions, snapshot: await snapshot(client) };
      }
    }
    await delay(400);
  }
  return { clicked, actions, snapshot: await snapshot(client), timedOut: true };
}

async function openingSmoke(client) {
  const smokeCheckpoint = String(args.checkpoint || 'R21').toUpperCase();
  const smokeName = `${smokeCheckpoint}验收测试`;
  const smokeGarden = `${smokeCheckpoint}验收庭园`;
  const before = await snapshot(client);
  const submit = await client.evaluate(`(() => {
    const frame = document.querySelector('#gensokyo-game-shell iframe');
    const frameDocument = frame?.contentDocument;
    if (!frameDocument) throw new Error('移动庭园 iframe 未就绪');
    const values = {
      'gg-opening-name': ${JSON.stringify(smokeName)},
      'gg-opening-pronouns': '中性称谓',
      'gg-opening-appearance': '用于运行冒烟测试的外界旅人',
      'gg-opening-garden': ${JSON.stringify(smokeGarden)},
    };
    for (const [id, value] of Object.entries(values)) {
      const input = frameDocument.getElementById(id);
      if (!input) throw new Error('缺少开场输入：' + id);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = frameDocument.querySelector('#gg-opening-form');
    if (!(form instanceof frame.contentWindow.HTMLFormElement)) throw new Error('开场表单不可用');
    form.requestSubmit();
    return true;
  })()`);
  if (!submit) throw new Error('开场提交未触发');

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const current = await snapshot(client);
    if (current.frame?.openingHidden && current.frame?.runtimeHidden === false && current.frame?.appBusy === 'false') {
      const state = await client.evaluate(`(() => {
        const frame = document.querySelector('#gensokyo-game-shell iframe');
        const child = frame?.contentWindow;
        if (!child?.Mvu?.getMvuData) throw new Error('MVU 未暴露给移动庭园 iframe');
        const messages = child.getChatMessages?.('0-{{lastMessageId}}', { include_swipes: false, hide_state: 'all' }) || [];
        const assistant = [...messages].reverse().find(message => message.role === 'assistant');
        const messageId = Number(assistant?.message_id ?? 0);
        const statData = child.Mvu.getMvuData({ type: 'message', message_id: messageId }).stat_data || {};
        return {
          messageCount: messages.length,
          messageId,
          initialized: statData.meta?.initialized,
          openingCommitted: statData.meta?.opening_committed,
          playerName: statData.player?.name,
          pronouns: statData.player?.pronouns,
          appearance: statData.player?.appearance,
          gardenName: statData.garden?.name,
          keyObtained: statData.key_items?.garden_keeper_key?.obtained,
          keyState: statData.key_items?.garden_keeper_key?.state,
          battleCurrent: statData.battle?.current ?? null,
        };
      })()`);
      return { before, after: current, state };
    }
    await delay(250);
  }
  return { before, after: await snapshot(client), timedOut: true };
}

async function importLore(client, expectedWorld) {
  const started = await client.evaluate(`(() => {
    const select = document.querySelector('#char-management-dropdown');
    const option = document.querySelector('#import_character_info');
    if (!(select instanceof HTMLSelectElement) || !(option instanceof HTMLOptionElement)) {
      throw new Error('角色世界书导入菜单不可用');
    }
    option.selected = true;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!started) throw new Error('未能触发角色世界书导入');
  const actions = [];
  const deadline = Date.now() + 60000;
  let linkedAt = 0;
  while (Date.now() < deadline) {
    const choice = await clickPopupChoice(client);
    if (choice) actions.push({ at: new Date().toISOString(), choice });
    const current = await snapshot(client);
    if (current.linkedWorld === expectedWorld) {
      linkedAt ||= Date.now();
      if (!current.popupText && Date.now() - linkedAt > 2000) {
        return { actions, snapshot: current };
      }
    }
    await delay(300);
  }
  return { actions, snapshot: await snapshot(client), timedOut: true };
}

async function linkWorld(client, worldName) {
  return client.evaluate(`(async () => {
    const module = await import('/scripts/world-info.js');
    await module.charUpdatePrimaryWorld(${JSON.stringify(worldName)});
    return {
      linkedWorld: document.querySelector('#character_world')?.value ?? '',
      selectedName: document.querySelector('#character_name_pole')?.value ?? '',
    };
  })()`);
}

const page = await pageTarget();
const client = new CdpClient(page.webSocketDebuggerUrl);
await client.connect();
await client.send('Runtime.enable');
await client.send('DOM.enable');

try {
  if (command === 'inspect') {
    console.log(JSON.stringify(await snapshot(client), null, 2));
  } else if (command === 'import') {
    if (!args.artifact) throw new Error('import 需要 --artifact=绝对路径');
    console.log(JSON.stringify(await importCharacter(client, String(args.artifact)), null, 2));
  } else if (command === 'reload') {
    console.log(JSON.stringify(await reloadPage(client), null, 2));
  } else if (command === 'delete-character') {
    if (!args.avatar) throw new Error('delete-character 需要 --avatar=文件名');
    console.log(JSON.stringify(await deleteCharacterFile(client, String(args.avatar)), null, 2));
  } else if (command === 'delete-world') {
    if (!args.world) throw new Error('delete-world 需要 --world=世界书名');
    console.log(JSON.stringify(await deleteWorldFile(client, String(args.world)), null, 2));
  } else if (command === 'card-info') {
    if (!args.avatar) throw new Error('card-info 需要 --avatar=文件名');
    console.log(JSON.stringify(await cardInfo(client, String(args.avatar)), null, 2));
  } else if (command === 'select') {
    if (!args.query) throw new Error('select 需要 --query=角色名片段');
    console.log(JSON.stringify(await selectCharacter(client, String(args.query)), null, 2));
  } else if (command === 'opening-smoke') {
    console.log(JSON.stringify(await openingSmoke(client), null, 2));
  } else if (command === 'import-lore') {
    if (!args.world) throw new Error('import-lore 需要 --world=期望世界书名');
    console.log(JSON.stringify(await importLore(client, String(args.world)), null, 2));
  } else if (command === 'link-world') {
    if (!args.world) throw new Error('link-world 需要 --world=世界书名');
    console.log(JSON.stringify(await linkWorld(client, String(args.world)), null, 2));
  } else if (command === 'close-browser') {
    await client.send('Browser.close');
    console.log(JSON.stringify({ closed: true }));
  } else {
    throw new Error(`未知 command：${command}`);
  }
} finally {
  client.close();
}
