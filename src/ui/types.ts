import type { DiagnosticSnapshotV1 } from './diagnostic-export';

export type TimePeriod = '清晨' | '白昼' | '黄昏' | '夜晚';

export interface CharacterView {
  area_id?: string;
  action?: string;
  facing?: 'front' | 'back' | 'left' | 'right';
}

export type ParticipationMode = 'public' | 'invite_only' | 'alone';
export type VisitSource = 'random' | 'invitation' | 'event' | 'opportunity_card';
export type VisitPlanStatus = 'scheduled' | 'arrived' | 'cancelled' | 'deferred';
export type FacilityStructureStatus = 'normal' | 'abnormal' | 'damaged';

export interface AnomalyActivationForm {
  title: string;
  rule_text: string;
  scope_mode: 'all' | 'present' | 'specified';
  character_ids: string[];
  presentation_tone: string;
  excluded_content: string;
}

export interface AnomalyHiddenOrigin {
  name: string;
  type: string;
  summary: string;
  location: string;
  cause: string;
  resolution_method: string;
}

export interface AnomalyPendingActivation {
  transaction_id: string;
  reserved_item_id: string;
  form: AnomalyActivationForm;
  created_at_serial: number;
  activation_message_id?: number | null;
}

export interface AnomalyActive {
  anomaly_id: string;
  title: string;
  rule_text: string;
  scope_mode: 'all' | 'present' | 'specified';
  character_ids: string[];
  presentation_tone: string;
  excluded_content: string;
  hidden_origin: AnomalyHiddenOrigin;
  public_summary: string;
  revealed_clues: Array<{ day: number; summary: string }>;
  status: 'active' | 'resolving';
  start_period_serial: number;
  end_period_serial: number;
  last_guidance_day: number | null;
  last_clue_day: number | null;
  activation_message_id?: number | null;
  resolution_message_id?: number | null;
}

export interface AnomalyHistoryEntry {
  anomaly_id: string;
  title: string;
  start_period_serial: number;
  end_period_serial: number;
  origin_summary: string;
}

export interface PendingTask {
  task_id: string;
  kind: 'anomaly_resolution' | 'banquet_start';
  status: 'pending' | 'processing';
  created_period_serial: number;
  due_period_serial: number;
  auto_resolve_period_serial: number;
  source_id: string;
  label: string;
  payload: Record<string, unknown>;
}

export interface BanquetHistoryEntry {
  activity_id: string;
  participation_mode: 'public' | 'invite_only';
  start_period_serial: number;
  completed_period_serial: number;
  completion: 'played' | 'assumed_completed';
}

export interface VisitPlan {
  plan_id: string;
  character_id: string;
  kind: 'random' | 'invitation' | 'event';
  due_serial: number;
  status: VisitPlanStatus;
  roll_seed: string;
  reason_id: string;
  target_area_id: string;
  source: VisitSource;
}

export interface VisitorMeta {
  arrival_uid?: string;
  reason_id?: string;
  source?: VisitSource;
  arrived_period_serial?: number;
  earliest_departure_serial?: number;
  planned_departure_serial?: number;
}

export interface FacilityRuntimeState {
  built?: boolean;
  current_form?: string | null;
  unlocked_forms?: string[];
  first_use_forms?: string[];
  activated_at_serial?: number | null;
  distinct_chat_periods?: number[];
  second_form_choice_pending?: boolean;
  unlock_deadline_2?: number | null;
  unlock_deadline_3?: number | null;
  status?: FacilityStructureStatus;
  condition_id?: string | null;
  risk_cooldown_until?: number | null;
  pending_refit?: null | {
    transaction_id: string;
    target_form: string;
    reserved_cost: number;
    selected_character_id: string | null;
    first_meeting?: boolean;
    started_at_serial: number;
  };
  pending_recovery?: null | {
    transaction_id: string;
    condition_id: string;
    reserved_cost: number;
    used_repair_kit?: boolean;
    started_at_serial: number;
  };
}

export interface SceneItemEntry {
  item_id: string;
  quantity_used: number;
  use_ids: string[];
  mode: string;
  initial_target_character_id?: string | null;
  first_transaction_id: string;
  narrative_state_summary?: string;
}

export interface SceneItemContext {
  scene_id: string;
  status: 'active' | 'closing' | 'closed';
  entries: SceneItemEntry[];
  closing_transaction_id?: string | null;
}

export type DuelDifficultyTier = 'hard' | 'standard' | 'assisted';

export interface OpportunityCardPending {
  use_id: string;
  selected_character_id: string;
  roll_seed: string;
  status: 'reserved' | 'arrived';
}

export interface DuelCardPendingBattle {
  use_id: string;
  target_character_id: string;
  config_id: string;
  difficulty_tier: DuelDifficultyTier;
  started_zako_tag_count: number;
}

export interface DuelVictoryDialogue {
  settlement_id: string;
  target_character_id: string;
  status: 'waiting_request' | 'generating' | 'completed';
  request_text: string;
}

export interface CardRuntimeState {
  settled_use_ids?: string[];
  opportunity?: {
    pending?: OpportunityCardPending | null;
    last_result?: { use_id: string; selected_character_id: string } | null;
  };
  duel?: {
    zako_tag_count?: number;
    pending_battle?: DuelCardPendingBattle | null;
    settled_result_ids?: string[];
    pending_victory_dialogue?: DuelVictoryDialogue | null;
  };
}

// ===== GAL 角色入场记忆（character-visit-memory.v1）=====
// 固定模型标识：gensokyo-character-memory / character-visit-memory.v1
// storage.root: stat_data.interaction.visit_memory（normal multi-floor MVU）
// 本批只添加兼容类型，不改变现有关系事实语义、事件登记或生成请求。

export type CharacterMemoryVersion = 'character-visit-memory.v1';

export type CharacterMemorySource =
  | 'scheduler'
  | 'event'
  | 'model-presence'
  | 'bootstrap'
  | 'reconcile';

export type CharacterVisitEndReason =
  | 'scheduled-departure'
  | 'presence-receipt'
  | 'event-leave'
  | 'reconcile';

export type RelationshipMemoryKind =
  | 'relationship_state'
  | 'milestone'
  | 'boundary'
  | 'conflict'
  | 'reconciliation';

export type RelationshipLabel =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'close_friend'
  | 'lover'
  | 'estranged';

export type RelationshipEventKind =
  | 'trust'
  | 'affection'
  | 'confession'
  | 'kiss'
  | 'adult_intimacy'
  | 'promise'
  | 'breakup';

export interface LegacyMemory {
  legacy_id: string;
  character_id: string | null;
  text: string;
  source: 'conversation_log.v0';
  [key: string]: unknown;
}

export interface VisitTurn {
  turn_id: string;
  request_id: string;
  character_id: string;
  scene_id: string | null;
  assistant_message_id: number | null;
  assistant_swipe_id: number | null;
  latest_attempt_id: string | null;
  latest_commit_key: string | null;
  day: number | string | null;
  time_period: string | null;
  period_serial: number | null;
  summary: string;
  [key: string]: unknown;
}

export interface VisitRecord {
  visit_id: string;
  character_id: string;
  source: CharacterMemorySource;
  arrival_uid: string | null;
  started_day: number | string | null;
  started_time_period: string | null;
  started_period_serial: number | null;
  ended_day: number | string | null;
  ended_time_period: string | null;
  ended_period_serial: number | null;
  end_reason: CharacterVisitEndReason | null;
  turns: VisitTurn[];
  [key: string]: unknown;
}

export interface RelationshipMemory {
  relationship_memory_id: string;
  character_id: string;
  request_id: string;
  visit_id: string | null;
  day: number | string | null;
  time_period: string | null;
  period_serial: number | null;
  kind: RelationshipMemoryKind;
  relationship_label: RelationshipLabel | null;
  event_kind: RelationshipEventKind | null;
  summary: string;
  significance: 1 | 2 | 3;
  active: boolean;
  latest_attempt_id: string | null;
  latest_commit_key: string | null;
  [key: string]: unknown;
}

export interface CharacterMemory {
  character_id: string;
  active_visit: VisitRecord | null;
  closed_visits: VisitRecord[];
  legacy_memories: LegacyMemory[];
  relationship_memories: RelationshipMemory[];
  [key: string]: unknown;
}

export interface CharacterVisitMigrationMetadata {
  revision: string;
  conversation_log_fingerprint: string | null;
  relationship_facts_fingerprint: Record<string, string> | null;
  migrated_at_serial: number | null;
  [key: string]: unknown;
}

export interface CharacterVisitMemoryState {
  version: CharacterMemoryVersion;
  by_character: Record<string, CharacterMemory>;
  legacy_unassigned: LegacyMemory[];
  migration: CharacterVisitMigrationMetadata;
  [key: string]: unknown;
}

export interface GardenState {
  meta?: { initialized?: boolean; opening_committed?: boolean; schema_version?: string };
  environment?: { day?: number; time_period?: TimePeriod; season?: string; weather?: string; anomaly_weather?: string | null };
  player?: { name?: string; pronouns?: string; appearance?: string; current_area_id?: string };
  garden?: { name?: string; construction_stage?: string; primary_anchor_id?: string | null };
  resources?: { materials?: number; inspiration?: number; coins?: number };
  areas?: Record<string, { id?: string; name?: string; unlocked?: boolean; state?: string; main_facility_id?: string | null }>;
  facilities?: Record<string, {
    id?: string;
    name?: string;
    area_id?: string;
    state?: string;
    current_form?: string | null;
    unlocked_forms?: string[];
    active_effects?: string[];
  }>;
  characters?: Record<string, {
    id?: string;
    name?: string;
    fixed?: boolean;
    current_relationship_facts?: Array<{
      id: string;
      subjects: string[];
      fact: string;
      source_event_id: string | null;
      established_at: string;
      active: boolean;
      last_confirmed_at: string;
    }>;
  }>;
  presence_snapshot?: {
    present_character_ids?: string[];
    character_views?: Record<string, CharacterView>;
    visitor_meta?: Record<string, VisitorMeta>;
  };
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
      last_effective_message_id?: number | null;
      effective_rounds?: number;
      settled?: boolean;
    } | null;
    settled_ids?: string[];
    conversation_log?: string[];
    starter_gift_claimed?: boolean;
    visit_memory?: CharacterVisitMemoryState;
  };
  events?: {
    active_event?: {
      uid?: string;
      title?: string;
      config_id?: string;
      status?: string;
      participant_character_ids?: string[];
    } | null;
    waiting_events?: Array<{ uid?: string; config_id?: string; title?: string; status?: string }>;
    completed_key_events?: Record<string, string>;
    settled_ids?: string[];
    recent_results?: string[];
    daily_cooldowns?: Record<string, number>;
  };
  battle?: {
    current?: BattleResult | null;
    settled_ids?: string[];
    dungeon_unlocked?: boolean;
    run_count?: number;
    last_run?: DungeonRunRecord | null;
    rewarded_ids?: string[];
  };
  shop?: { unlocked?: boolean; purchase_settled_ids?: string[]; static_dialogue_seen_ids?: string[] };
  inventory?: {
    consumables?: Record<string, number>;
    card_runtime?: CardRuntimeState;
  };
  key_items?: Record<string, {
    id?: string;
    name?: string;
    obtained?: boolean;
    state?: string;
    last_used_day?: number | null;
    total_uses?: number;
    last_used_area_id?: string | null;
    last_used_time_period?: TimePeriod | null;
    temporal_trace_active?: boolean;
    time_stop_active?: boolean;
    noticed_by_character_ids?: string[];
  }>;
  anomaly_cycle?: {
    pending_activation?: AnomalyPendingActivation | null;
    active?: AnomalyActive | null;
    history?: AnomalyHistoryEntry[];
  };
  visit_scheduler?: {
    version?: string;
    known_characters?: string[];
    plans?: VisitPlan[];
    cooldown_until?: Record<string, number>;
    invitation_cooldowns?: Record<string, number>;
    last_processed_serial?: number | null;
    pending_notices?: string[];
  };
  facility_runtime?: Record<string, FacilityRuntimeState>;
  garden_projects?: {
    active_construction?: null | { facility_id: string; form_id: string; transaction_id: string };
  };
  garden_activities?: {
    moon_spring_session?: null | {
      uid: string;
      form_id?: string | null;
      participation_mode: ParticipationMode;
      accepted_character_ids: string[];
      started_period_serial: number;
      status: 'active' | 'closing';
    };
    banquet?: null | {
      uid: string;
      facility_id: string;
      form_id?: string | null;
      activity_id: string;
      participation_mode: 'public' | 'invite_only';
      invited_character_ids: string[];
      accepted_character_ids: string[];
      start_period_serial: number;
      status: 'scheduled' | 'due_waiting' | 'active' | 'closing';
    };
    scheduled_banquet?: null | {
      uid: string;
      facility_id: string;
      form_id?: string | null;
      activity_id: string;
      participation_mode: 'public' | 'invite_only';
      invited_character_ids: string[];
      accepted_character_ids: string[];
      start_period_serial: number;
      status: 'scheduled' | 'due_waiting' | 'active' | 'closing';
    };
    banquet_history?: BanquetHistoryEntry[];
  };
  pending_tasks?: PendingTask[];
  scene_item_context?: SceneItemContext | null;
  ui_flags?: {
    graduation_acknowledged?: boolean;
    last_visit_notice_serial?: number | null;
  };
  memory?: { long_term_notes?: string[] };
  uid_counters?: { interaction?: number; character_visit?: number; [key: string]: number | undefined };
  [key: string]: unknown;
}

export interface ChatMessageView {
  id: number;
  role: 'system' | 'assistant' | 'user';
  name: string;
  text: string;
  extra?: Record<string, unknown>;
  swipeId?: number;
  swipeCount?: number;
}

export interface RuntimeDiagnostics {
  mode: 'host' | 'preview';
  tavernVersion: string;
  helperVersion: string;
  mvuReady: boolean;
  bridgeVersion: string;
  generationTransport: 'native-trigger' | 'helper-generate';
  // Phase 5：重新生成路径（Probe C 未 PASS → native-regenerate 保留；helper-generate-swipe 未启用）。
  regenerationTransport: 'native-regenerate' | 'helper-generate-swipe';
  regenerationBlockedReason?: string;
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
export type SceneMode = 'garden' | 'gal' | 'facility' | 'settings' | 'shop' | 'inventory' | 'opportunities';
export type GalBeatKind = 'narration' | 'speech' | 'action';
export type GalVisualMode = 'normal' | 'nude' | 'sexual';
export type GalSexualAct = 'vaginal' | 'anal' | 'none';
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
  mode: 'gal' | 'facility' | 'battle' | 'battle_narrative' | 'duel' | 'close';
  intent: string;
  disabled?: boolean;
  disabledReason?: string;
  eventId?: string;
  fixedPresentation?: boolean;
  mayAdvanceTime?: boolean;
  cost?: { materials?: number; inspiration?: number };
}

export interface GalBeat {
  kind: GalBeatKind;
  speakerId: string | null;
  visualMode: GalVisualMode;
  reactionId: GalReaction;
  poseId: string;
  actId: GalSexualAct;
  text: string;
}

export interface SuggestedReply {
  id: string;
  label: string;
  intent: string;
}

export interface GalSceneProjection {
  version: 'garden.v1' | 'scene.v1' | 'scene.v1+body' | 'body' | 'fallback';
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
  storyText?: string;
}

export type MessageTransactionKind = 'opening' | 'interaction' | 'settlement' | 'battle';
export type MessageTransactionPhase =
  | 'idle'
  | 'submitting_user'
  | 'generating'
  | 'stopping'
  | 'settling'
  | 'settled'
  | 'failed';

/**
 * 发送请求的调用方结构化上下文（第二批 V2）：sceneId 兼容旧路径；
 * mainTargetCharacterId / actionTargetCharacterId / eventParticipants / sessionParticipants
 * 由各入口显式传入（runbook §3.4 优先级），不在各入口各写一套优先级；
 * explicitCharacterIds 供冻结的请求期 system inject 构造角色绿灯上下文；
 * relevantCharacterIds / visitIdsByCharacter 由请求时冻结纯函数产出。
 */
export interface GalRequestContext {
  sceneId?: string | null;
  mainTargetCharacterId?: string | null;
  actionTargetCharacterId?: string | null;
  eventParticipants?: readonly string[];
  sessionParticipants?: readonly string[];
  requireMainTarget?: boolean;
  explicitCharacterIds?: readonly string[];
  relevantCharacterIds?: string[];
  visitIdsByCharacter?: Record<string, string | null>;
  /** R2 冻结：本轮场景道具的结构化预览（bridge 用最新持久态构造只读 promptState）。 */
  sceneItemPreview?: {
    itemId: string;
    useId: string;
    sceneId: string;
    targetCharacterId: string | null;
  };
}

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
  // Phase 2 增量 A：request/attempt 标识与初始 chat identity（trace/恢复用；旧路径不填）。
  requestId?: string;
  attemptId?: string;
  generationId?: string;
  commitKey?: string;
  ownerCharacterId?: string;
  chatEpoch?: number;
  mvuEpochBefore?: number;
  // 第二批 V2：当前事务使用的请求 schema（'gal-generation-request.v1' | 'gal-generation-request.v2'）。
  // 恢复读取同时支持 V1/V2；V1 历史 metadata 只做兼容读取，不能被解释成 V2 合成历史请求。
  requestSchema?: string;
  // Phase 3：停止合同。stopReason 区分 abort 来源（user-stop / chat-switch / iframe-unload），
  // 日志与 UI 不得混称；attemptSeq 用于从头重试时生成下一个 attempt 标识。
  stopReason?: string;
  attemptSeq?: number;
  // Phase 4：重载恢复标记（'incomplete' | 'confirmed' | 'conflict'）。恢复态由真实聊天重建，
  // incomplete/conflict 禁止自动重发（app 隐藏重试入口）；confirmed 恢复 settled 与 GAL 投影。
  recovery?: string;
}

export interface OpportunityCardBridgeResult {
  selectedCharacterId: string | null;
  message: string;
  alreadySettled: boolean;
}

export interface DuelCardBridgeStartResult {
  targetCharacterId: string;
  configId: string;
  difficultyTier: DuelDifficultyTier;
  alreadyStarted: boolean;
  config: import('../battle/battle-types').BattleConfig;
}

export interface DuelCardBridgeSettlementResult {
  won: boolean;
  zakoTagCount: number;
  previousZakoTagCount: number;
  zakoTagDelta: -1 | 0 | 1;
  message: string;
  alreadySettled: boolean;
}

export type SaveSlotId = `manual-${'01' | '02' | '03' | '04' | '05' | '06' | '07' | '08'}`;

export interface SaveSlotSummary {
  slotId: SaveSlotId;
  occupied: boolean;
  label?: string;
  capturedAt?: string;
  messageCount?: number;
  gameTimeLabel?: string;
  valid: boolean;
}

export interface GardenBridge {
  readState(): Promise<GardenState>;
  getOpeningContext(): Promise<OpeningContext>;
  applyUserNameToHost(name: string): Promise<{ injected: boolean; method: string; reason?: string }>;
  getOpeningProgress(): Promise<OpeningProgress>;
  initializeOpening(draft: OpeningDraft, expectedChatId: string): Promise<OpeningInitializeResult>;
  commitOpening(draft: OpeningDraft, message: string, expectedChatId: string): Promise<OpeningCommitResult>;
  enterGarden(expectedChatId: string): Promise<{ initializedFromDefaults: boolean }>;
  repairOpening(expectedChatId: string): Promise<{ messageCreated: boolean }>;
  listMessages(): Promise<ChatMessageView[]>;
  sendUserMessage(text: string, kind?: MessageTransactionKind, userVisibleText?: string, requestContext?: GalRequestContext): Promise<MessageTransactionSnapshot>;
  sendAnomalyResolution(text: string): Promise<MessageTransactionSnapshot>;
  sendDuelVictoryRequest(requestText: string, message: string): Promise<MessageTransactionSnapshot>;
  getTransactionState(): Promise<MessageTransactionSnapshot>;
  retryLastTransaction(): Promise<MessageTransactionSnapshot>;
  stageBattleResult(result: BattleResult): Promise<{ messageId: number; alreadyStaged: boolean }>;
  settleDungeonResult(result: BattleResult): Promise<{ rewardCoins: number; alreadySettled: boolean }>;
  applyTestJump(jump: import('./test-tools').TestJumpId): Promise<void>;
  purchaseShopItem(itemId: string, purchaseId: string): Promise<void>;
  claimStarterGift(): Promise<void>;
  useOpportunityCard(useId: string): Promise<OpportunityCardBridgeResult>;
  beginDuelCard(targetCharacterId: string, useId: string): Promise<DuelCardBridgeStartResult>;
  cancelDuelCard(useId: string): Promise<void>;
  settleDuelCard(result: BattleResult): Promise<DuelCardBridgeSettlementResult>;
  useSpecialItem(
    itemId: string,
    useId: string,
    form?: Partial<AnomalyActivationForm>,
  ): Promise<string>;
  finalizeAnomalyActivation(origin: AnomalyHiddenOrigin, publicSummary?: string): Promise<string>;
  cancelAnomalyActivation(transactionId?: string): Promise<string>;
  recordAnomalyClue(summary: string): Promise<void>;
  resolveActiveAnomaly(resolutionMessageId?: number | null): Promise<void>;
  applyM2Command(command: M2Command): Promise<M2CommandResult>;
  continueGeneration(): Promise<void>;
  stopGeneration(): Promise<boolean>;
  regenerateLatest(): Promise<void>;
  swipeLatest(direction?: 'left' | 'right'): Promise<void>;
  showNativeChat(): Promise<boolean>;
  diagnostics(): Promise<RuntimeDiagnostics>;
  buildDiagnosticSnapshot(): Promise<DiagnosticSnapshotV1>;
  listSaveSlots(): Promise<SaveSlotSummary[]>;
  saveToSlot(slotId: SaveSlotId, label: string): Promise<SaveSlotSummary>;
  loadFromSlot(slotId: SaveSlotId): Promise<{ restoredMessageCount: number }>;
  subscribe(refresh: () => void): Promise<() => void>;
}

export type M2Command =
  | { type: 'acknowledge_graduation' }
  | { type: 'build_facility'; facilityId: string; formId: string; transactionId: string }
  | { type: 'choose_second_form'; facilityId: string; formId: string }
  | { type: 'begin_refit'; facilityId: string; formId: string; transactionId: string }
  | { type: 'commit_refit'; transactionId: string }
  | { type: 'cancel_refit'; transactionId: string }
  | { type: 'facility_action'; facilityId: string; actionId: string; transactionId: string }
  | { type: 'begin_recovery'; facilityId: string; transactionId: string; useRepairKit?: boolean }
  | { type: 'commit_recovery'; transactionId: string }
  | { type: 'cancel_recovery'; transactionId: string }
  | { type: 'invite_character'; characterId: string; inviteId: string }
  | { type: 'consume_visit_notices' }
  | { type: 'start_moon_session'; mode: ParticipationMode; acceptedCharacterIds?: string[] }
  | { type: 'end_moon_session' }
  | { type: 'schedule_banquet'; activityId: string; mode: 'public' | 'invite_only'; invitedCharacterIds?: string[]; startOffsetPeriods?: number }
  | { type: 'start_due_banquet'; activityId: string }
  | { type: 'end_banquet' }
  | { type: 'end_conversation_local' }
  | { type: 'claim_pending_task'; taskId: string }
  | { type: 'release_pending_task'; taskId: string }
  | { type: 'queue_scene_item'; itemId: string; useId: string; sceneId: string; targetCharacterId?: string }
  | { type: 'clear_scene_items' };

export interface M2CommandResult {
  message: string;
  selectedCharacterId?: string | null;
  invitationOutcome?: 'accept_now' | 'reschedule' | 'decline';
  risk?: { triggered: boolean; severity?: 'abnormal' | 'damaged'; conditionId?: string };
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

export interface DungeonRunRecord {
  config_id: string;
  outcome: 'clean_win' | 'narrow_win' | 'loss';
  reward_coins: number;
  started_day: number;
  started_time_period: TimePeriod;
  settled_day: number;
  settled_time_period: TimePeriod;
}
