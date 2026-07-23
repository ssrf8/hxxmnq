export type TimePeriod = '清晨' | '白昼' | '黄昏' | '夜晚';

export interface CharacterView {
  area_id?: string;
  action?: string;
  facing?: 'front' | 'back' | 'left' | 'right';
}

export interface GardenState {
  meta?: { initialized?: boolean; opening_committed?: boolean; schema_version?: string };
  environment?: { day?: number; time_period?: TimePeriod; season?: string; weather?: string; anomaly_weather?: string | null };
  player?: { name?: string; pronouns?: string; appearance?: string; current_area_id?: string };
  garden?: { name?: string; construction_stage?: string; primary_anchor_id?: string | null };
  resources?: { materials?: number; inspiration?: number };
  areas?: Record<string, { id?: string; name?: string; unlocked?: boolean; state?: string; main_facility_id?: string | null }>;
  facilities?: Record<string, { id?: string; name?: string; area_id?: string; state?: string; current_form?: string | null }>;
  characters?: Record<string, { id?: string; name?: string }>;
  presence_snapshot?: { present_character_ids?: string[]; character_views?: Record<string, CharacterView> };
  interaction?: { current_session?: { uid?: string; summary?: string; participant_character_ids?: string[] } | null };
  events?: { active_event?: { title?: string; config_id?: string } | null };
  battle?: { current?: unknown };
  [key: string]: unknown;
}

export interface ChatMessageView {
  id: number;
  role: 'system' | 'assistant' | 'user';
  name: string;
  text: string;
  swipeId?: number;
  swipeCount?: number;
}

export interface RuntimeDiagnostics {
  mode: 'host' | 'preview';
  tavernVersion: string;
  helperVersion: string;
  mvuReady: boolean;
  bridgeVersion: string;
  databaseAvailable: boolean;
  databaseVersion: string;
  lastError?: string;
}

export interface OpeningDraft {
  playerName: string;
  playerPronouns: string;
  playerAppearance: string;
  gardenName: string;
}

export interface OpeningContext {
  chatId: string;
  personaName: string;
  personaDescription: string;
}

export interface OpeningCommitResult {
  messageCreated: boolean;
  generationTriggered: boolean;
}

export interface OpeningProgress {
  messageSubmitted: boolean;
  assistantResponded: boolean;
}

export type MessageTransactionKind = 'opening' | 'interaction' | 'settlement';
export type MessageTransactionPhase =
  | 'idle'
  | 'submitting_user'
  | 'generating'
  | 'settling'
  | 'settled'
  | 'failed';

export interface MessageTransactionSnapshot {
  transactionId: string;
  chatId: string;
  kind: MessageTransactionKind;
  phase: MessageTransactionPhase;
  userMessageCreated: boolean;
  assistantResponded: boolean;
  userMessageId?: number;
  assistantMessageId?: number;
  startedAt?: number;
  lastError?: string;
}

export interface GardenBridge {
  readState(): Promise<GardenState>;
  getOpeningContext(): Promise<OpeningContext>;
  getOpeningProgress(): Promise<OpeningProgress>;
  commitOpening(draft: OpeningDraft, message: string, expectedChatId: string): Promise<OpeningCommitResult>;
  enterGarden(expectedChatId: string): Promise<{ initializedFromDefaults: boolean }>;
  repairOpening(expectedChatId: string): Promise<{ messageCreated: boolean }>;
  listMessages(): Promise<ChatMessageView[]>;
  sendUserMessage(text: string): Promise<MessageTransactionSnapshot>;
  getTransactionState(): Promise<MessageTransactionSnapshot>;
  retryLastTransaction(): Promise<MessageTransactionSnapshot>;
  stopGeneration(): Promise<boolean>;
  regenerateLatest(): Promise<void>;
  swipeLatest(): Promise<void>;
  showNativeChat(): Promise<boolean>;
  diagnostics(): Promise<RuntimeDiagnostics>;
  subscribe(refresh: () => void): Promise<() => void>;
}

export interface BattleResult {
  settlement_id: string;
  config_id: string;
  outcome: 'clean_win' | 'narrow_win' | 'loss' | 'narrative';
  remaining_lives: number;
  grazes: number;
  duration_ms: number;
  hits: number;
  damage: number;
  phases_cleared: number;
  objective_ratio: number;
}
