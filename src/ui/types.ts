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
  interaction?: {
    current_session?: {
      uid?: string;
      type?: 'character' | 'facility' | 'event';
      status?: 'active' | 'closing';
      area_id?: string;
      summary?: string;
      focus?: string;
      participant_character_ids?: string[];
      facility_id?: string | null;
      event_id?: string | null;
      effective_rounds?: number;
      settled?: boolean;
    } | null;
    settled_ids?: string[];
  };
  events?: {
    active_event?: { uid?: string; title?: string; config_id?: string; status?: string } | null;
    completed_key_events?: Record<string, string>;
  };
  battle?: { current?: BattleResult | null; settled_ids?: string[] };
  memory?: { long_term_notes?: string[] };
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

export type TargetType = 'character' | 'area' | 'facility';
export type SceneMode = 'garden' | 'gal' | 'facility' | 'settings';
export type GalBeatKind = 'narration' | 'speech' | 'action';
export type GalReaction =
  | 'neutral'
  | 'smile'
  | 'annoyed'
  | 'surprised'
  | 'serious'
  | 'shy'
  | 'sad'
  | 'angry';

export interface InteractionTarget {
  type: TargetType;
  id: string;
  label: string;
}

export interface TargetAction {
  id: string;
  label: string;
  description: string;
  target: InteractionTarget;
  mode: 'gal' | 'facility' | 'battle' | 'battle_narrative' | 'close';
  intent: string;
  disabled?: boolean;
  disabledReason?: string;
  eventId?: string;
  mayAdvanceTime?: boolean;
  cost?: { materials?: number; inspiration?: number };
}

export interface GalBeat {
  kind: GalBeatKind;
  speakerId: string | null;
  reactionId: GalReaction;
  poseId: string;
  text: string;
}

export interface SuggestedReply {
  id: string;
  label: string;
  intent: string;
}

export interface GalSceneProjection {
  version: 'scene.v1' | 'scene.v1+body' | 'body' | 'fallback';
  beats: GalBeat[];
  suggestedReplies: SuggestedReply[];
  sourceMessageId: number;
  swipeId: number;
  malformed?: boolean;
}

export interface OpeningInitializeResult {
  messageId: number;
  initializedFromDefaults: boolean;
  alreadyCommitted: boolean;
}

export interface OpeningProgress {
  messageSubmitted: boolean;
  assistantResponded: boolean;
}

export type MessageTransactionKind = 'opening' | 'interaction' | 'settlement' | 'battle';
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
  initializeOpening(draft: OpeningDraft, expectedChatId: string): Promise<OpeningInitializeResult>;
  commitOpening(draft: OpeningDraft, message: string, expectedChatId: string): Promise<OpeningCommitResult>;
  enterGarden(expectedChatId: string): Promise<{ initializedFromDefaults: boolean }>;
  repairOpening(expectedChatId: string): Promise<{ messageCreated: boolean }>;
  listMessages(): Promise<ChatMessageView[]>;
  sendUserMessage(text: string, kind?: MessageTransactionKind): Promise<MessageTransactionSnapshot>;
  getTransactionState(): Promise<MessageTransactionSnapshot>;
  retryLastTransaction(): Promise<MessageTransactionSnapshot>;
  stageBattleResult(result: BattleResult): Promise<{ messageId: number; alreadyStaged: boolean }>;
  continueGeneration(): Promise<void>;
  stopGeneration(): Promise<boolean>;
  regenerateLatest(): Promise<void>;
  swipeLatest(direction?: 'left' | 'right'): Promise<void>;
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
