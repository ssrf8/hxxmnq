import type {
  BattleResult,
  ChatMessageView,
  GardenBridge,
  GardenState,
  MessageTransactionSnapshot,
  OpeningDraft,
  RuntimeDiagnostics,
} from './types';
import initialState from '../schema/initial-state.json';
import { MessageTransactionCoordinator } from './message-transaction';
import { validateFlowerCoreBattleResult } from './greenhouse-rules';
import {
  applyLocalSettlement,
  localSettlementAction,
  restoreLocalEventOwnership,
  settlementChoices,
  settlementProjection,
  type GardenActionMarker,
} from './event-settlement';

type HostGlobals = typeof globalThis & {
  waitGlobalInitialized?: (name: string) => Promise<unknown>;
  Mvu?: {
    getMvuData: (options: Record<string, unknown>) => { stat_data?: GardenState; [key: string]: unknown };
    replaceMvuData: (data: Record<string, unknown>, options: Record<string, unknown>) => Promise<void>;
    events: Record<string, string>;
  };
  getChatMessages?: (range: string | number, options?: Record<string, unknown>) => Array<Record<string, unknown>>;
  getLastMessageId?: () => number;
  SillyTavern?: { stopGeneration?: () => boolean; getCurrentChatId?: () => string; getContext?: () => { chat?: Array<Record<string, unknown>>; characterId?: unknown } };
  createChatMessages?: (messages: Array<Record<string, unknown>>, options?: Record<string, unknown>) => Promise<void>;
  triggerSlash?: (command: string) => Promise<string | undefined>;
  generate?: (config: Record<string, unknown>) => Promise<string | Record<string, unknown>>;
  getTavernVersion?: () => string;
  getTavernHelperVersion?: () => string;
  getCurrentPersonaName?: () => string | null;
  getPersona?: (personaId: string) => { name?: string; description?: string };
  eventOn?: (eventName: string, listener: (...args: unknown[]) => void) => { stop: () => void };
  tavern_events?: Record<string, string>;
  AutoCardUpdaterAPI?: Record<string, unknown>;
};

const g = globalThis as HostGlobals;
const OPENING_MARKER = '<gensokyo_opening transaction="';
const OPENING_REPAIR_MARKER = '<gensokyo_opening_repair transaction="';

function parseOpeningMessage(message: string): OpeningDraft {
  const body = message
    .replace(/\n*<gensokyo_opening transaction="[^"]+" \/>\s*$/u, '')
    .trim();
  const match = body.match(
    /^我叫「([^」]{1,40})」，希望他人使用「([^」]{1,40})」称呼我。我的外貌大致是：([\s\S]{1,520}?)\n\n我依照祖父留下的安排，[\s\S]*?我暂时把它称作「([^」]{1,60})」。/u,
  );
  if (!match) throw new Error('无法从原始开场消息识别姓名、称谓、外貌和庭园名');
  return {
    playerName: match[1].trim(),
    playerPronouns: match[2].trim(),
    playerAppearance: match[3].trim().replace(/[。！？.!?]$/u, ''),
    gardenName: match[4].trim(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeState(base: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown> {
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(current)) {
    if (isRecord(value) && isRecord(merged[key])) {
      merged[key] = mergeState(merged[key] as Record<string, unknown>, value);
    } else {
      merged[key] = structuredClone(value);
    }
  }
  return merged;
}

function applyOpeningDraft(state: Record<string, unknown>, draft: OpeningDraft) {
  const player = state.player as Record<string, unknown>;
  const garden = state.garden as Record<string, unknown>;
  const keyItems = state.key_items as Record<string, Record<string, unknown>>;
  const meta = state.meta as Record<string, unknown>;
  player.name = draft.playerName;
  player.pronouns = draft.playerPronouns;
  player.appearance = draft.playerAppearance;
  garden.name = draft.gardenName;
  keyItems.garden_keeper_key.obtained = true;
  keyItems.garden_keeper_key.state = '苏醒';
  meta.initialized = true;
  meta.opening_committed = true;
}

function openingCommitted(state: GardenState, draft: OpeningDraft) {
  return state.meta?.initialized === true
    && state.meta.opening_committed === true
    && state.player?.name === draft.playerName
    && state.player.pronouns === draft.playerPronouns
    && state.player.appearance === draft.playerAppearance
    && state.garden?.name === draft.gardenName
    && (state.key_items as Record<string, Record<string, unknown>> | undefined)
      ?.garden_keeper_key?.obtained === true
    && (state.key_items as Record<string, Record<string, unknown>> | undefined)
      ?.garden_keeper_key?.state === '苏醒';
}

function hostWindow(): HostGlobals {
  try {
    return window.parent && window.parent !== window ? window.parent as unknown as HostGlobals : g;
  } catch {
    return g;
  }
}

function databaseApi(): Record<string, unknown> | undefined {
  return g.AutoCardUpdaterAPI ?? hostWindow().AutoCardUpdaterAPI;
}

function currentChatId(): string {
  return String(g.SillyTavern?.getCurrentChatId?.() ?? hostWindow().SillyTavern?.getCurrentChatId?.() ?? '').trim();
}

function normalizeMessages(raw: Array<Record<string, unknown>>): ChatMessageView[] {
  return raw.slice(-80).map((message) => {
    const swipes = Array.isArray(message.swipes) ? message.swipes.map((item) => String(item ?? '')) : [];
    const swipeId = typeof message.swipe_id === 'number' ? message.swipe_id : 0;
    const swipeText = swipes.length ? swipes[Math.min(Math.max(swipeId, 0), swipes.length - 1)] : '';
    // Prefer explicit message body (include_swipes:false shape). Empty swipe slots must not win.
    const currentText = String(message.message ?? message.mes ?? '').trim()
      ? String(message.message ?? message.mes ?? '')
      : swipeText;
    return {
      id: Number(message.message_id ?? 0),
      role: message.role === 'user' || message.role === 'system' ? message.role : 'assistant',
      name: String(message.name ?? ''),
      text: currentText,
      swipeId: swipes.length ? swipeId : undefined,
      swipeCount: swipes.length || undefined,
    };
  });
}

function messagesFromContextChat(): Array<Record<string, unknown>> {
  try {
    const api = g.SillyTavern ?? hostWindow().SillyTavern;
    const chat = api?.getContext?.()?.chat;
    if (!Array.isArray(chat) || chat.length === 0) return [];
    return chat.map((item, message_id) => {
      const record = item as Record<string, unknown>;
      const mes = String(record.mes ?? '');
      const swipes = Array.isArray(record.swipes) && record.swipes.length
        ? record.swipes.map((value) => String(value ?? ''))
        : [mes];
      return {
        message_id,
        name: String(record.name ?? ''),
        role: record.is_user ? 'user' : 'assistant',
        message: mes,
        swipes,
        swipe_id: typeof record.swipe_id === 'number' ? record.swipe_id : 0,
        extra: record.extra && typeof record.extra === 'object' ? record.extra : {},
        is_hidden: Boolean(record.is_system),
      };
    });
  } catch {
    return [];
  }
}

function readRawMessages(options: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  const opts = { include_swipes: false, hide_state: 'all', ...options };
  const ranges: Array<string | number> = [];
  try {
    const last = g.getChatMessages?.(-1, { ...opts, hide_state: 'all' }) ?? [];
    const lastId = Number(last[0]?.message_id);
    if (Number.isInteger(lastId) && lastId >= 0) ranges.push(`0-${lastId}`);
  } catch { /* probe failed */ }
  try {
    const id = g.getLastMessageId?.();
    if (Number.isInteger(id) && Number(id) >= 0) ranges.push(`0-${id}`);
  } catch { /* optional helper */ }
  ranges.push('0-{{lastMessageId}}');

  let best: Array<Record<string, unknown>> = [];
  for (const range of ranges) {
    try {
      const raw = g.getChatMessages?.(range, opts) ?? [];
      if (raw.length > best.length) best = raw;
      // Full-history hit: keep the longest successful read.
      if (raw.length > 1) best = raw;
    } catch { /* try next */ }
  }
  if (best.length <= 1) {
    const fallback = messagesFromContextChat();
    if (fallback.length > best.length) best = fallback;
  }
  return best;
}

function activeMessages(): Array<Record<string, unknown>> {
  return readRawMessages({ include_swipes: false, hide_state: 'all' });
}

function latestPersistedMessage(mvu: HostGlobals['Mvu']) {
  if (!mvu) return null;
  const assistantMessages = activeMessages().filter((message) => message.role === 'assistant').reverse();
  for (const message of assistantMessages) {
    const messageId = Number(message.message_id);
    if (!Number.isInteger(messageId) || messageId < 0) continue;
    const options = { type: 'message', message_id: messageId };
    const data = mvu.getMvuData(options);
    const state = data.stat_data;
    if (isRecord(state) && Object.keys(state).length > 0) {
      return {
        messageId,
        options,
        data: structuredClone(data) as Record<string, unknown>,
        state: structuredClone(state) as GardenState,
      };
    }
  }
  return null;
}

function latestPersistedState(mvu: HostGlobals['Mvu']): GardenState {
  return latestPersistedMessage(mvu)?.state ?? {};
}

function openingProgress(rawMessages = activeMessages()) {
  const openingIndex = rawMessages.findIndex((item) =>
    item.role === 'user' && String(item.message ?? '').includes(OPENING_MARKER));
  return {
    messageSubmitted: openingIndex >= 0,
    assistantResponded: openingIndex >= 0 && rawMessages
      .slice(openingIndex + 1)
      .some((item) => item.role !== 'user' && String(item.message ?? '').trim().length > 0),
  };
}

function openingTargetMessage(rawMessages = activeMessages()) {
  const userMessages = rawMessages.filter((item) => item.role === 'user');
  if (userMessages.length > 0) {
    throw new Error('当前聊天已经存在玩家消息；请使用原生聊天或旧开场恢复入口，避免覆盖既有剧情');
  }
  const assistant = rawMessages.find((item) => item.role === 'assistant');
  const messageId = Number(assistant?.message_id);
  if (!Number.isInteger(messageId) || messageId < 0) throw new Error('没有找到可承载开场状态的首个 assistant 楼层');
  return messageId;
}

export function createHostBridge(): GardenBridge | null {
  if (!g.waitGlobalInitialized || !g.getChatMessages || !g.createChatMessages || !g.triggerSlash) return null;
  let lastError = '';
  const transactions = new MessageTransactionCoordinator({
    currentChatId,
    listMessages: activeMessages,
    async createUserMessage(message, extra) {
      await g.createChatMessages?.(
        [{ role: 'user', message, is_hidden: false, extra }],
        { insert_before: 'end', refresh: 'none' },
      );
    },
    async triggerGeneration() {
      await g.triggerSlash?.('/trigger await=true');
    },
    async continueGeneration() {
      await g.triggerSlash?.('/continue await=true');
    },
  });

  const requireMvu = async () => {
    if (!g.Mvu?.getMvuData) await g.waitGlobalInitialized?.('Mvu');
    if (!g.Mvu?.getMvuData) throw new Error('MVU 全局未就绪');
    return g.Mvu;
  };

  const requireGenerate = () => {
    const generate = g.generate ?? hostWindow().generate;
    if (typeof generate !== 'function') throw new Error('Tavern Helper generate API 未就绪，无法执行第二次结算解析');
    return generate;
  };

  let pendingSettlement: {
    before: GardenState;
    action: GardenActionMarker;
  } | null = null;
  let pendingOwnershipBefore: GardenState | null = null;

  const persistPendingSettlement = async (snapshot: MessageTransactionSnapshot) => {
    if (!pendingSettlement) return snapshot;
    const assistantMessageId = Number(snapshot.assistantMessageId);
    if (!snapshot.assistantResponded || !Number.isInteger(assistantMessageId) || assistantMessageId < 0) return snapshot;
    try {
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持本地事件结算');
      const raw = activeMessages().find((message) => Number(message.message_id) === assistantMessageId);
      const assistantText = String(raw?.message ?? raw?.mes ?? '');
      if (!assistantText.trim()) throw new Error('assistant 回复为空，不能结算事件');
      const choices = settlementChoices(pendingSettlement.before, pendingSettlement.action);
      if (!choices.length) throw new Error(`事件 ${pendingSettlement.action.event_id} 没有可供解析的允许结果`);
      const parsed = await requireGenerate()({
        preset_name: 'in_use',
        generation_id: `gensokyo-settlement-${snapshot.transactionId}`,
        should_stream: false,
        should_silence: true,
        max_chat_history: 8,
        user_input: [
          '你是移动庭园的专用事件结算解析器。只判断已经完成的剧情正文对应哪个白名单结果，不续写剧情，不输出变量更新。',
          `事件：${pendingSettlement.action.event_id}`,
          `行动：${pendingSettlement.action.action_id}`,
          `允许结果：${choices.join(', ')}`,
          `剧情正文：\n${assistantText.slice(-8000)}`,
        ].join('\n'),
        json_schema: {
          name: 'gensokyo_event_result',
          description: '移动庭园受控事件的白名单结算结果',
          strict: true,
          value: {
            type: 'object',
            additionalProperties: false,
            properties: {
              event_id: { type: 'string', enum: [pendingSettlement.action.event_id] },
              result: { type: 'string', enum: choices },
            },
            required: ['event_id', 'result'],
          },
        },
      });
      if (typeof parsed !== 'string') throw new Error('第二次结算解析没有返回 JSON 文本');
      let parsedResult = '';
      try {
        const value = JSON.parse(parsed) as { event_id?: string; result?: string };
        if (value.event_id === pendingSettlement.action.event_id && choices.includes(String(value.result))) {
          parsedResult = String(value.result);
        }
      } catch { /* handled below */ }
      if (!parsedResult) throw new Error('第二次结算解析结果不符合白名单 schema');
      const settlementText = `${assistantText}\n<GensokyoEventResult>${JSON.stringify({
        version: 'event-result.v1',
        event_id: pendingSettlement.action.event_id,
        result: parsedResult,
      })}</GensokyoEventResult>`;
      const options = { type: 'message', message_id: assistantMessageId };
      const data = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
      const nextState = applyLocalSettlement(
        pendingSettlement.before,
        pendingSettlement.action,
        assistantMessageId,
        settlementText,
      );
      data.stat_data = nextState;
      await mvu.replaceMvuData(data, options);
      const reread = mvu.getMvuData(options).stat_data ?? {};
      if (!settlementProjection(reread, pendingSettlement.action)) {
        throw new Error(`事件 ${pendingSettlement.action.event_id} 写入后复读校验失败`);
      }
      pendingSettlement = null;
      pendingOwnershipBefore = null;
      transactions.markSettlementSucceeded();
      return transactions.read();
    } catch (error) {
      transactions.markSettlementFailed(error);
      lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  };

  const preserveLocalOwnership = async (before: GardenState, snapshot: MessageTransactionSnapshot) => {
    const assistantMessageId = Number(snapshot.assistantMessageId);
    if (!snapshot.assistantResponded || !Number.isInteger(assistantMessageId) || assistantMessageId < 0) return snapshot;
    const mvu = await requireMvu();
    if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持本地事件边界校验');
    const options = { type: 'message', message_id: assistantMessageId };
    const data = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
    const current = isRecord(data.stat_data) ? data.stat_data as GardenState : {};
    const protectedState = restoreLocalEventOwnership(before, current);
    if (JSON.stringify(current) === JSON.stringify(protectedState)) {
      pendingOwnershipBefore = null;
      return snapshot;
    }
    data.stat_data = protectedState;
    await mvu.replaceMvuData(data, options);
    pendingOwnershipBefore = null;
    return snapshot;
  };

  return {
    async readState() {
      try {
        const mvu = await requireMvu();
        return latestPersistedState(mvu);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },
    async getOpeningContext() {
      let personaName = '';
      let personaDescription = '';
      try {
        personaName = g.getCurrentPersonaName?.() ?? '';
        const persona = g.getPersona?.('current');
        personaName = persona?.name || personaName;
        personaDescription = persona?.description ?? '';
      } catch { /* Persona is optional. */ }
      return { chatId: currentChatId(), personaName, personaDescription };
    },
    async getOpeningProgress() {
      return openingProgress();
    },
    async initializeOpening(draft: OpeningDraft, expectedChatId: string) {
      const frozenChatId = expectedChatId.trim();
      if (!frozenChatId || currentChatId() !== frozenChatId) throw new Error('聊天已切换，请重新确认开局资料');
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持确定性写入');

      const persistedState = latestPersistedState(mvu);
      if (openingCommitted(persistedState, draft)) {
        const existingAssistant = activeMessages().find((item) => item.role === 'assistant');
        return {
          messageId: Number(existingAssistant?.message_id ?? 0),
          initializedFromDefaults: false,
          alreadyCommitted: true,
        };
      }
      if (persistedState.meta?.opening_committed) {
        throw new Error('当前聊天已经用另一组资料完成开局，不能静默覆盖');
      }

      const messageId = openingTargetMessage();
      const options = { type: 'message', message_id: messageId };
      const data = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
      const currentState = isRecord(data.stat_data) ? data.stat_data : {};
      const initializedFromDefaults = !isRecord(currentState.meta);
      const nextState = mergeState(initialState as Record<string, unknown>, currentState);
      applyOpeningDraft(nextState, draft);
      data.stat_data = nextState;
      await mvu.replaceMvuData(data, options);

      const persisted = mvu.getMvuData(options).stat_data ?? {};
      if (!openingCommitted(persisted, draft)) throw new Error('MVU 写入后复读校验失败');
      return { messageId, initializedFromDefaults, alreadyCommitted: false };
    },
    async commitOpening(_draft: OpeningDraft, message: string, expectedChatId: string) {
      const frozenChatId = expectedChatId.trim();
      if (!frozenChatId || currentChatId() !== frozenChatId) throw new Error('聊天已切换，请重新确认开局预览');
      const marker = `<gensokyo_opening transaction="${encodeURIComponent(frozenChatId)}" />`;
      // `include_swipes: true` returns ChatMessageSwiped, which intentionally has
      // no `message` field in Tavern Helper 4.8.19. Use the active-page shape for
      // idempotency, and also compare the normalized body because regex display
      // rules may strip the transaction marker before a retry.
      const rawMessages = activeMessages();
      const expectedBody = message.trim();
      const withoutMarker = (value: unknown) => String(value ?? '')
        .replace(/\n*<gensokyo_opening transaction="[^"]+" \/>\s*$/u, '')
        .trim();
      const exists = rawMessages.some((item) => item.role === 'user' && (
        String(item.message ?? '').includes(marker)
        || withoutMarker(item.message) === expectedBody
      ));
      const content = `${message.trim()}\n\n${marker}`;
      if (!message.trim() || content.length > 6000) throw new Error('开场消息应为 1–6000 个字符');
      await transactions.submit({
        kind: 'opening',
        transactionId: `opening-${encodeURIComponent(frozenChatId)}`,
        message: content,
        matchesExisting: (item) => item.role === 'user' && (
          String(item.message ?? '').includes(marker)
          || withoutMarker(item.message) === expectedBody
        ),
      });
      return { messageCreated: !exists, generationTriggered: true };
    },
    async enterGarden(expectedChatId: string) {
      const frozenChatId = expectedChatId.trim();
      if (!frozenChatId || currentChatId() !== frozenChatId) throw new Error('聊天已切换，请重新打开恢复页');
      const rawMessages = activeMessages();
      const openingIndex = rawMessages.findIndex((item) =>
        item.role === 'user' && String(item.message ?? '').includes(OPENING_MARKER));
      if (openingIndex < 0) throw new Error('没有找到带事务标记的原始开场消息');
      const assistant = rawMessages
        .slice(openingIndex + 1)
        .filter((item) => item.role === 'assistant' && String(item.message ?? '').trim().length > 0)
        .at(-1);
      const messageId = Number(assistant?.message_id);
      if (!Number.isInteger(messageId) || messageId < 0) throw new Error('尚未找到完整的开场回复');
      const draft = parseOpeningMessage(String(rawMessages[openingIndex].message ?? ''));
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持确定性写入');
      const options = { type: 'message', message_id: messageId };
      const data = structuredClone(mvu.getMvuData(options)) as Record<string, unknown>;
      const currentState = isRecord(data.stat_data) ? data.stat_data : {};
      const initializedFromDefaults = !isRecord(currentState.meta);
      const nextState = mergeState(initialState as Record<string, unknown>, currentState);
      applyOpeningDraft(nextState, draft);
      data.stat_data = nextState;
      await mvu.replaceMvuData(data, options);
      const persisted = mvu.getMvuData(options).stat_data ?? {};
      if (!openingCommitted(persisted, draft)) throw new Error('MVU 写入后复读校验失败');
      return { initializedFromDefaults };
    },
    async repairOpening(expectedChatId: string) {
      const frozenChatId = expectedChatId.trim();
      if (!frozenChatId || currentChatId() !== frozenChatId) throw new Error('聊天已切换，请重新打开恢复页');
      const marker = `${OPENING_REPAIR_MARKER}${encodeURIComponent(frozenChatId)}" />`;
      const rawMessages = activeMessages();
      const exists = rawMessages.some((item) =>
        item.role === 'user' && String(item.message ?? '').includes(marker));
      const message = [
        '【开场状态修复】',
        '前一轮正文已经描写我进入庭园，但正式开场变量没有成功写入。',
        '请读取此前带有 gensokyo_opening 标记的真实玩家消息，只补写其中已经确认的玩家姓名、称谓、外貌、庭园名、庭守钥取得状态，以及 meta.initialized=true、meta.opening_committed=true。',
        '先用一句简短叙事承接当前场景，然后严格输出一个可由 MVU 解析的 <UpdateVariable><JSONPatch>…</JSONPatch></UpdateVariable> 块；不要推进时间、事件、关系或资源，不要重复开场剧情。',
        '',
        marker,
      ].join('\n');
      await transactions.submit({
        kind: 'opening',
        transactionId: `opening-repair-${encodeURIComponent(frozenChatId)}`,
        message,
        matchesExisting: (item) =>
          item.role === 'user' && String(item.message ?? '').includes(marker),
      });
      return { messageCreated: !exists };
    },
    async listMessages() {
      // Use the same raw reader as transactions. include_swipes:true + unhidden previously
      // could leave the GAL projector stuck on floor 0 when later floors normalized empty
      // or when the macro range failed to expand past the greeting.
      return normalizeMessages(readRawMessages({ include_swipes: false, hide_state: 'all' }));
    },
    async sendUserMessage(text, kind = 'interaction') {
      const value = text.trim();
      if (!value || value.length > 6000) throw new Error('消息应为 1–6000 个字符');
      const mvu = await requireMvu();
      const before = latestPersistedState(mvu);
      const action = localSettlementAction(value, before);
      pendingOwnershipBefore = structuredClone(before);
      pendingSettlement = action ? { before: structuredClone(before), action } : null;
      try {
        const snapshot = await transactions.submit({ kind, message: value });
        if (pendingSettlement) return await persistPendingSettlement(snapshot);
        return await preserveLocalOwnership(before, snapshot);
      } catch (error) {
        if (!pendingSettlement) throw error;
        lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },
    async getTransactionState() {
      return transactions.read();
    },
    async retryLastTransaction() {
      const current = transactions.read();
      if (pendingSettlement && current.assistantResponded) {
        return persistPendingSettlement(current);
      }
      const snapshot = await transactions.retry();
      if (pendingSettlement) return persistPendingSettlement(snapshot);
      if (pendingOwnershipBefore) return preserveLocalOwnership(pendingOwnershipBefore, snapshot);
      return snapshot;
    },
    async stageBattleResult(result: BattleResult) {
      const mvu = await requireMvu();
      if (!mvu.replaceMvuData) throw new Error('当前 MVU 不支持可信战斗结果写入');
      const latest = latestPersistedMessage(mvu);
      if (!latest) throw new Error('没有找到可承载战斗结果的 assistant 楼层');
      const current = latest.state.battle?.current;
      if (current) {
        if (current.settlement_id !== result.settlement_id) {
          throw new Error('已有另一份待结算战斗结果，不能覆盖');
        }
        if (JSON.stringify(current) !== JSON.stringify(result)) {
          throw new Error('同一战斗结算 ID 的内容不一致');
        }
        return { messageId: latest.messageId, alreadyStaged: true };
      }
      const trusted = validateFlowerCoreBattleResult(result, latest.state);
      const nextState = structuredClone(latest.state);
      nextState.battle = { ...nextState.battle, current: trusted };
      latest.data.stat_data = nextState;
      await mvu.replaceMvuData(latest.data, latest.options);
      const reread = mvu.getMvuData(latest.options).stat_data?.battle?.current;
      if (!reread || JSON.stringify(reread) !== JSON.stringify(trusted)) {
        throw new Error('可信战斗结果写入后复读校验失败');
      }
      return { messageId: latest.messageId, alreadyStaged: false };
    },
    async continueGeneration() {
      await g.triggerSlash?.('/continue await=true');
    },
    async stopGeneration() {
      const stopped = Boolean(g.SillyTavern?.stopGeneration?.());
      if (stopped) transactions.markStopped();
      return stopped;
    },
    async regenerateLatest() {
      await g.triggerSlash?.('/regenerate await=true');
    },
    async swipeLatest(direction = 'right') {
      await g.triggerSlash?.(`/swipe await=true direction=${direction === 'left' ? 'left' : 'right'}`);
    },
    async showNativeChat() {
      globalThis.dispatchEvent(new CustomEvent('gensokyo-garden:show-native-chat'));
      return true;
    },
    async diagnostics() {
      let mvuReady = false;
      try { await requireMvu(); mvuReady = true; } catch { mvuReady = false; }
      return {
        mode: 'host',
        tavernVersion: g.getTavernVersion?.() ?? 'unknown',
        helperVersion: g.getTavernHelperVersion?.() ?? 'unknown',
        mvuReady,
        bridgeVersion: '0.4.3-host-generate-r23',
        databaseAvailable: Boolean(databaseApi()),
        databaseVersion: databaseApi() ? 'SP·数据库 VII / AutoCardUpdaterAPI' : '未加载',
        lastError: lastError || undefined,
      };
    },
    async subscribe(refresh) {
      const stops: Array<() => void> = [];
      const subscribe = (eventName?: string) => {
        if (eventName && g.eventOn) stops.push(g.eventOn(eventName, refresh).stop);
      };
      subscribe(g.tavern_events?.MESSAGE_RECEIVED);
      subscribe(g.tavern_events?.MESSAGE_UPDATED);
      subscribe(g.tavern_events?.MESSAGE_SWIPED);
      subscribe(g.tavern_events?.CHAT_CHANGED);
      subscribe(g.tavern_events?.GENERATION_STARTED);
      subscribe(g.tavern_events?.GENERATION_STOPPED);
      if (g.tavern_events?.GENERATION_ENDED && g.eventOn) {
        stops.push(g.eventOn(g.tavern_events.GENERATION_ENDED, () => {
          transactions.markGenerationEnded();
          refresh();
        }).stop);
      }
      try {
        const mvu = await requireMvu();
        subscribe(mvu.events.VARIABLE_INITIALIZED);
        subscribe(mvu.events.VARIABLE_UPDATE_ENDED);
      } catch { /* diagnostic mode stays usable */ }
      return () => stops.splice(0).forEach((stop) => stop());
    },
  };
}

const previewState: GardenState = {
  meta: { initialized: false, opening_committed: false, schema_version: '0.2.0' },
  environment: { day: 1, time_period: '清晨', season: '春', weather: '晴' },
  player: { name: '', pronouns: '中性称谓', appearance: '', current_area_id: 'central_courtyard' },
  garden: { name: '无名庭园', construction_stage: '荒废' },
  resources: { materials: 6, inspiration: 1 },
  areas: {
    main_house: { id: 'main_house', name: '旧主屋', unlocked: true, state: '损坏' },
    central_courtyard: { id: 'central_courtyard', name: '中央庭院', unlocked: true, state: '荒废' },
    greenhouse_plot: { id: 'greenhouse_plot', name: '温室旧地基', unlocked: true, state: '未清理', main_facility_id: 'magic_greenhouse' },
  },
  facilities: { magic_greenhouse: { id: 'magic_greenhouse', name: '魔法温室', area_id: 'greenhouse_plot', state: '可建设' } },
  characters: { reimu: { id: 'reimu', name: '博丽灵梦' }, marisa: { id: 'marisa', name: '雾雨魔理沙' }, cirno: { id: 'cirno', name: '琪露诺' } },
  presence_snapshot: {
    present_character_ids: ['reimu', 'marisa'],
    character_views: {
      reimu: { area_id: 'central_courtyard', action: '检查结界', facing: 'front' },
      marisa: { area_id: 'greenhouse_plot', action: '观察旧地基', facing: 'left' },
    },
  },
  interaction: { current_session: null, settled_ids: [] },
  events: { completed_key_events: { reimu_boundary_inspection: 'temporary_permission' } },
};

export function createPreviewBridge(): GardenBridge {
  const messages: ChatMessageView[] = [
    { id: 0, role: 'assistant', name: '幻想乡物语', text: '庭园页面离线预览。正式运行时，这里镜像真实聊天消息。' },
  ];
  let transaction: MessageTransactionSnapshot = {
    transactionId: '',
    chatId: 'offline-preview-chat',
    kind: 'interaction',
    phase: 'idle',
    userMessageCreated: false,
    assistantResponded: false,
  };
  return {
    async readState() { return structuredClone(previewState); },
    async getOpeningContext() { return { chatId: 'offline-preview-chat', personaName: '预览玩家', personaDescription: '来自外界的年轻旅人。' }; },
    async getOpeningProgress() { return { messageSubmitted: false, assistantResponded: false }; },
    async initializeOpening(draft) {
      const alreadyCommitted = Boolean(previewState.meta?.opening_committed);
      previewState.player = { ...previewState.player, name: draft.playerName, pronouns: draft.playerPronouns, appearance: draft.playerAppearance };
      previewState.garden = { ...previewState.garden, name: draft.gardenName };
      previewState.meta = { ...previewState.meta, initialized: true, opening_committed: true };
      return { messageId: 0, initializedFromDefaults: false, alreadyCommitted };
    },
    async commitOpening(draft, message) {
      messages.push({ id: messages.length, role: 'user', name: draft.playerName, text: message });
      previewState.player = { ...previewState.player, name: draft.playerName, pronouns: draft.playerPronouns, appearance: draft.playerAppearance };
      previewState.garden = { ...previewState.garden, name: draft.gardenName };
      previewState.meta = { ...previewState.meta, initialized: true, opening_committed: true };
      return { messageCreated: true, generationTriggered: true };
    },
    async enterGarden() {
      previewState.meta = { ...previewState.meta, initialized: true, opening_committed: true };
      return { initializedFromDefaults: false };
    },
    async repairOpening() { throw new Error('离线预览不支持修复真实开场'); },
    async listMessages() { return structuredClone(messages); },
    async sendUserMessage(text, kind = 'interaction') {
      transaction = {
        transactionId: `preview-${Date.now()}`,
        chatId: 'offline-preview-chat',
        kind,
        phase: 'settled',
        userMessageCreated: true,
        assistantResponded: true,
        userMessageId: messages.length,
        assistantMessageId: messages.length + 1,
      };
      messages.push({ id: messages.length, role: 'user', name: '预览玩家', text });
      const isEnding = text.includes('"action_id":"end_conversation"');
      const isRepair = text.includes('"action_id":"repair"');
      const scene = {
        version: 'scene.v1',
        beats: isEnding
          ? [
            { kind: 'speech', speaker_id: 'reimu', reaction_id: 'neutral', pose_id: 'default', text: '那就先到这里吧。别忘了庭园还有一堆麻烦等着你。' },
            { kind: 'narration', speaker_id: null, reaction_id: 'neutral', pose_id: 'default', text: '短暂的交谈告一段落，庭园重新安静下来。' },
          ]
          : isRepair
            ? [
              { kind: 'action', speaker_id: null, reaction_id: 'serious', pose_id: 'default', text: '木料与旧屋的结构被逐一检查，施工声在庭园里断续响起。' },
              { kind: 'speech', speaker_id: 'reimu', reaction_id: 'serious', pose_id: 'default', text: '先别急着钉死这块板，下面还有结界留下的痕迹。' },
            ]
            : [
              { kind: 'speech', speaker_id: 'reimu', reaction_id: text.includes('pat_head') ? 'annoyed' : 'neutral', pose_id: 'default', text: text.includes('pat_head') ? '……你的手是不是伸得太自然了一点？' : '有话就说。我还得检查这里的结界。' },
              { kind: 'action', speaker_id: 'reimu', reaction_id: 'neutral', pose_id: 'default', text: '灵梦看了你一眼，没有立刻离开。' },
            ],
        suggested_replies: isEnding ? [] : [
          { id: 'ask-more', label: '继续询问', intent: '我顺着她刚才的话继续问下去。' },
          { id: 'change-topic', label: '换个话题', intent: '我稍微换了一个轻松些的话题。' },
        ],
      };
      messages.push({
        id: messages.length,
        role: 'assistant',
        name: '幻想乡物语',
        text: `<GensokyoScene>${JSON.stringify(scene)}</GensokyoScene>`,
      });
      return structuredClone(transaction);
    },
    async getTransactionState() { return structuredClone(transaction); },
    async retryLastTransaction() { throw new Error('离线预览没有失败事务'); },
    async stageBattleResult(result: BattleResult) {
      const current = previewState.battle?.current;
      if (current) {
        if (JSON.stringify(current) !== JSON.stringify(result)) throw new Error('已有另一份待结算战斗结果');
        return { messageId: Math.max(0, messages.length - 1), alreadyStaged: true };
      }
      const trusted = validateFlowerCoreBattleResult(result, previewState);
      previewState.battle = { ...previewState.battle, current: trusted };
      return { messageId: Math.max(0, messages.length - 1), alreadyStaged: false };
    },
    async continueGeneration() { throw new Error('离线预览不支持继续生成'); },
    async stopGeneration() { return false; },
    async regenerateLatest() { throw new Error('离线预览不支持重新生成'); },
    async swipeLatest() { throw new Error('离线预览不支持 Swipe'); },
    async showNativeChat() { return false; },
    async diagnostics(): Promise<RuntimeDiagnostics> {
      return { mode: 'preview', tavernVersion: 'offline', helperVersion: 'offline', mvuReady: false, bridgeVersion: '0.4.3-host-generate-r23', databaseAvailable: false, databaseVersion: '未加载' };
    },
    async subscribe() { return () => undefined; },
  };
}

export const bridge = createHostBridge() ?? createPreviewBridge();
