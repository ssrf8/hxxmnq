import type { ChatMessageView, GardenBridge, GardenState, OpeningDraft, RuntimeDiagnostics } from './types';

type HostGlobals = typeof globalThis & {
  waitGlobalInitialized?: (name: string) => Promise<unknown>;
  Mvu?: { getMvuData: (options: Record<string, unknown>) => { stat_data?: GardenState }; events: Record<string, string> };
  getChatMessages?: (range: string | number, options?: Record<string, unknown>) => Array<Record<string, unknown>>;
  createChatMessages?: (messages: Array<Record<string, unknown>>, options?: Record<string, unknown>) => Promise<void>;
  triggerSlash?: (command: string) => Promise<string | undefined>;
  getTavernVersion?: () => string;
  getTavernHelperVersion?: () => string;
  getCurrentPersonaName?: () => string | null;
  getPersona?: (personaId: string) => { name?: string; description?: string };
  eventOn?: (eventName: string, listener: (...args: unknown[]) => void) => { stop: () => void };
  tavern_events?: Record<string, string>;
  AutoCardUpdaterAPI?: Record<string, unknown>;
  SillyTavern?: { stopGeneration?: () => boolean; getCurrentChatId?: () => string };
};

const g = globalThis as HostGlobals;

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
    const swipes = Array.isArray(message.swipes) ? message.swipes : [];
    const swipeId = typeof message.swipe_id === 'number' ? message.swipe_id : 0;
    const currentText = swipes.length ? swipes[Math.min(swipeId, swipes.length - 1)] : message.message;
    return {
      id: Number(message.message_id ?? 0),
      role: message.role === 'user' || message.role === 'system' ? message.role : 'assistant',
      name: String(message.name ?? ''),
      text: String(currentText ?? ''),
      swipeId: swipes.length ? swipeId : undefined,
      swipeCount: swipes.length || undefined,
    };
  });
}

export function createHostBridge(): GardenBridge | null {
  if (!g.waitGlobalInitialized || !g.getChatMessages || !g.createChatMessages || !g.triggerSlash) return null;
  let lastError = '';

  const requireMvu = async () => {
    await g.waitGlobalInitialized?.('Mvu');
    if (!g.Mvu?.getMvuData) throw new Error('MVU 全局未就绪');
    return g.Mvu;
  };

  return {
    async readState() {
      try {
        const mvu = await requireMvu();
        return structuredClone(mvu.getMvuData({ type: 'message', message_id: 'latest' }).stat_data ?? {});
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
    async commitOpening(_draft: OpeningDraft, message: string, expectedChatId: string) {
      const frozenChatId = expectedChatId.trim();
      if (!frozenChatId || currentChatId() !== frozenChatId) throw new Error('聊天已切换，请重新确认开局预览');
      const marker = `<gensokyo_opening transaction="${encodeURIComponent(frozenChatId)}" />`;
      // `include_swipes: true` returns ChatMessageSwiped, which intentionally has
      // no `message` field in Tavern Helper 4.8.18. Use the active-page shape for
      // idempotency, and also compare the normalized body because regex display
      // rules may strip the transaction marker before a retry.
      const rawMessages = g.getChatMessages?.('0-{{lastMessageId}}', { include_swipes: false, hide_state: 'all' }) ?? [];
      const expectedBody = message.trim();
      const withoutMarker = (value: unknown) => String(value ?? '')
        .replace(/\n*<gensokyo_opening transaction="[^"]+" \/>\s*$/u, '')
        .trim();
      const exists = rawMessages.some((item) => item.role === 'user' && (
        String(item.message ?? '').includes(marker)
        || withoutMarker(item.message) === expectedBody
      ));
      if (!exists) {
        const content = `${message.trim()}\n\n${marker}`;
        if (!message.trim() || content.length > 6000) throw new Error('开场消息应为 1–6000 个字符');
        await g.createChatMessages?.([{ role: 'user', message: content }], { insert_before: 'end', refresh: 'affected' });
      }
      await g.triggerSlash?.('/trigger');
      return { messageCreated: !exists, generationTriggered: true };
    },
    async listMessages() {
      return normalizeMessages(g.getChatMessages?.('0-{{lastMessageId}}', { include_swipes: true, hide_state: 'unhidden' }) ?? []);
    },
    async sendUserMessage(text) {
      const value = text.trim();
      if (!value || value.length > 6000) throw new Error('消息应为 1–6000 个字符');
      await g.createChatMessages?.([{ role: 'user', message: value }], { insert_before: 'end', refresh: 'affected' });
      await g.triggerSlash?.('/trigger');
    },
    async stopGeneration() {
      return Boolean(g.SillyTavern?.stopGeneration?.());
    },
    async regenerateLatest() {
      await g.triggerSlash?.('/regenerate');
    },
    async swipeLatest() {
      await g.triggerSlash?.('/swipe await=true direction=right');
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
        bridgeVersion: '0.2.0',
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
  interaction: { current_session: null },
};

export function createPreviewBridge(): GardenBridge {
  const messages: ChatMessageView[] = [
    { id: 0, role: 'assistant', name: '幻想乡物语', text: '庭园页面离线预览。正式运行时，这里镜像真实聊天消息。' },
  ];
  return {
    async readState() { return structuredClone(previewState); },
    async getOpeningContext() { return { chatId: 'offline-preview-chat', personaName: '预览玩家', personaDescription: '来自外界的年轻旅人。' }; },
    async commitOpening(draft, message) {
      messages.push({ id: messages.length, role: 'user', name: draft.playerName, text: message });
      previewState.player = { ...previewState.player, name: draft.playerName, pronouns: draft.playerPronouns, appearance: draft.playerAppearance };
      previewState.garden = { ...previewState.garden, name: draft.gardenName };
      previewState.meta = { ...previewState.meta, initialized: true, opening_committed: true };
      return { messageCreated: true, generationTriggered: true };
    },
    async listMessages() { return structuredClone(messages); },
    async sendUserMessage(text) { messages.push({ id: messages.length, role: 'user', name: '预览玩家', text }); },
    async stopGeneration() { return false; },
    async regenerateLatest() { throw new Error('离线预览不支持重新生成'); },
    async swipeLatest() { throw new Error('离线预览不支持 Swipe'); },
    async showNativeChat() { return false; },
    async diagnostics(): Promise<RuntimeDiagnostics> {
      return { mode: 'preview', tavernVersion: 'offline', helperVersion: 'offline', mvuReady: false, bridgeVersion: '0.2.0', databaseAvailable: false, databaseVersion: '未加载' };
    },
    async subscribe() { return () => undefined; },
  };
}

export const bridge = createHostBridge() ?? createPreviewBridge();
