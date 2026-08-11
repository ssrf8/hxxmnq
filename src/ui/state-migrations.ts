import type { GardenState } from './types';
import {
  migrateConversationLogToLegacyMemory,
  repairCharacterVisitsAgainstPresence,
} from './character-memory';
import { deriveKnownCharacters } from './visitor-rules';

const MAX_REWARDED_IDS = 256;
const MAX_HISTORY = 8;
const RETIRED_ANOMALY_CARD_EVENT_IDS = new Set([
  'fairy_seed_shower',
  'wandering_magic_mist',
  'clockwork_temporal_ripple',
]);

function defaultFacilityRuntime() {
  return {
    built: false,
    current_form: null,
    unlocked_forms: [],
    first_use_forms: [],
    activated_at_serial: null,
    distinct_chat_periods: [],
    second_form_choice_pending: false,
    unlock_deadline_2: null,
    unlock_deadline_3: null,
    status: 'normal' as const,
    condition_id: null,
    risk_cooldown_until: null,
    pending_refit: null,
    pending_recovery: null,
  };
}

/** Idempotent, non-destructive defaults for saves created before M2. */
export function migrateGardenState(before: GardenState): GardenState {
  let state = structuredClone(before);
  state.meta = {
    ...(state.meta ?? {}),
    schema_version: '0.3.0',
    bridge_version: '0.3.0',
    database_adapter_version: '0.3.0',
  };
  state.characters ??= {};
  for (const [id, name] of Object.entries({
    youmu: '魂魄妖梦',
    patchouli: '帕秋莉·诺蕾姬',
    sanae: '东风谷早苗',
  })) {
    state.characters[id] ??= { id, name, fixed: true };
  }
  for (const character of Object.values(state.characters ?? {})) {
    delete (character as Record<string, unknown>).current_relationship_facts;
  }
  state.resources ??= {};
  if (!Number.isInteger(state.resources.coins) || (state.resources.coins ?? 0) < 0) state.resources.coins = 0;
  state.resources.coins = Math.min(99999, state.resources.coins ?? 0);
  state.battle ??= {};
  state.battle.dungeon_unlocked ??= Boolean(state.events?.completed_key_events?.greenhouse_flower_core);
  state.battle.run_count ??= 0;
  state.battle.last_run ??= null;
  state.battle.rewarded_ids = Array.from(new Set(state.battle.rewarded_ids ?? [])).slice(-MAX_REWARDED_IDS);
  state.battle.current ??= null;
  state.battle.settled_ids ??= [];
  state.shop ??= {};
  state.shop.unlocked ??= Boolean(state.events?.completed_key_events?.greenhouse_flower_core);
  state.shop.purchase_settled_ids = Array.from(new Set(state.shop.purchase_settled_ids ?? [])).slice(-MAX_REWARDED_IDS);
  state.shop.static_dialogue_seen_ids = Array.from(new Set(state.shop.static_dialogue_seen_ids ?? [])).slice(-128);
  state.inventory ??= { consumables: {} };
  state.inventory.consumables ??= {};
  for (const [itemId, amount] of Object.entries(state.inventory.consumables)) {
    state.inventory.consumables[itemId] = Math.min(99, Math.max(0, Number.isInteger(amount) ? Number(amount) : 0));
  }
  // 角色对战已改为角色菜单中的常规行动；旧存档中的卡片不再显示或保留。
  delete state.inventory.consumables.spell_duel_card;
  state.inventory.consumables.incident_trigger_card = Math.min(
    99,
    Math.max(0, state.inventory.consumables.incident_trigger_card ?? 0),
  );
  state.inventory.card_runtime ??= {
    settled_use_ids: [],
    opportunity: { pending: null, last_result: null },
    duel: {
      zako_tag_count: 0,
      pending_battle: null,
      settled_result_ids: [],
      pending_victory_dialogue: null,
    },
  };
  const cardRuntime = state.inventory.card_runtime;
  cardRuntime.settled_use_ids = Array.from(new Set(cardRuntime.settled_use_ids ?? [])).slice(-256);
  cardRuntime.opportunity ??= { pending: null, last_result: null };
  const opportunityPending = cardRuntime.opportunity.pending;
  if (!opportunityPending
    || typeof opportunityPending.use_id !== 'string'
    || opportunityPending.use_id.length < 1
    || typeof opportunityPending.selected_character_id !== 'string'
    || opportunityPending.selected_character_id.length < 1
    || typeof opportunityPending.roll_seed !== 'string'
    || opportunityPending.roll_seed.length < 1
    || !['reserved', 'arrived'].includes(opportunityPending.status)) {
    cardRuntime.opportunity.pending = null;
  }
  const opportunityResult = cardRuntime.opportunity.last_result;
  if (!opportunityResult
    || typeof opportunityResult.use_id !== 'string'
    || opportunityResult.use_id.length < 1
    || typeof opportunityResult.selected_character_id !== 'string') {
    cardRuntime.opportunity.last_result = null;
  }
  cardRuntime.duel ??= {
    zako_tag_count: 0,
    pending_battle: null,
    settled_result_ids: [],
    pending_victory_dialogue: null,
  };
  const duelRuntime = cardRuntime.duel;
  duelRuntime.zako_tag_count = Math.min(
    99,
    Math.max(0, Number.isInteger(duelRuntime.zako_tag_count) ? Number(duelRuntime.zako_tag_count) : 0),
  );
  duelRuntime.settled_result_ids = Array.from(new Set(duelRuntime.settled_result_ids ?? [])).slice(-256);
  const pendingBattle = duelRuntime.pending_battle;
  if (!pendingBattle
    || typeof pendingBattle.use_id !== 'string'
    || pendingBattle.use_id.length < 1
    || typeof pendingBattle.target_character_id !== 'string'
    || pendingBattle.target_character_id.length < 1
    || typeof pendingBattle.config_id !== 'string'
    || pendingBattle.config_id.length < 1
    || !['hard', 'standard', 'assisted'].includes(pendingBattle.difficulty_tier)
    || !Number.isInteger(pendingBattle.started_zako_tag_count)) {
    duelRuntime.pending_battle = null;
  } else {
    pendingBattle.started_zako_tag_count = Math.min(99, Math.max(0, pendingBattle.started_zako_tag_count));
  }
  const pendingVictory = duelRuntime.pending_victory_dialogue;
  if (!pendingVictory
    || typeof pendingVictory.settlement_id !== 'string'
    || pendingVictory.settlement_id.length < 1
    || typeof pendingVictory.target_character_id !== 'string'
    || pendingVictory.target_character_id.length < 1
    || !['waiting_request', 'generating', 'completed'].includes(pendingVictory.status)
    || typeof pendingVictory.request_text !== 'string') {
    duelRuntime.pending_victory_dialogue = null;
  } else {
    pendingVictory.request_text = pendingVictory.request_text.trim().slice(0, 240);
  }
  state.key_items ??= {};
  state.key_items.sakuya_watch ??= {
    id: 'sakuya_watch', name: '十六夜咲夜的怀表', obtained: false, state: 'ready',
    last_used_day: null, total_uses: 0, last_used_area_id: null, last_used_time_period: null,
    temporal_trace_active: false, noticed_by_character_ids: [],
  };
  const watch = state.key_items.sakuya_watch;
  watch.total_uses = Math.max(0, watch.total_uses ?? 0);
  watch.noticed_by_character_ids = Array.from(new Set(watch.noticed_by_character_ids ?? []));
  if (watch.obtained && watch.last_used_day !== (state.environment?.day ?? 1)) watch.state = 'ready';
  state.interaction ??= {};
  state.interaction.current_session ??= null;
  state.interaction.presence_analysis_task ??= null;
  state.interaction.settled_ids = Array.from(new Set(state.interaction.settled_ids ?? [])).slice(-64);
  state.interaction.starter_gift_claimed = state.interaction.starter_gift_claimed === true;
  // 兜底：模型偶发用 op:add 写不带 /- 的数组 path 时，MagVarUpdate/mvu_zod 可能把
  // conversation_log 替换成字符串或校验失败；这里统一归一化为 string[]，避免崩溃与历史丢失。
  {
    const raw = state.interaction.conversation_log as string[] | string | null | undefined;
    const entries = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw.trim() ? [raw] : []);
    state.interaction.conversation_log = Array.from(
      new Set(entries.map((entry) => String(entry).slice(0, 120))),
    ).slice(-24);
  }
  // GAL 角色记忆：把旧 conversation_log 确定性增量迁移进 visit_memory legacy 结构。
  // 旧 conversation_log 本批仍保留（旧协议继续写）；新结构由 character-memory 纯迁移维护。
  state = migrateConversationLogToLegacyMemory(state);
  // v0.3.0 不迁移独立关系记忆；schema 会直接丢弃旧关系字段。
  state.events ??= {};
  state.events.settled_ids = Array.from(new Set(state.events.settled_ids ?? [])).slice(-256);
  state.events.waiting_events = Array.isArray(state.events.waiting_events)
    ? state.events.waiting_events.filter((event) => !RETIRED_ANOMALY_CARD_EVENT_IDS.has(event.config_id ?? '')).slice(0, 3)
    : [];
  state.events.completed_key_events ??= {};
  for (const eventId of RETIRED_ANOMALY_CARD_EVENT_IDS) delete state.events.completed_key_events[eventId];
  if (state.events.active_event && RETIRED_ANOMALY_CARD_EVENT_IDS.has(state.events.active_event.config_id ?? '')) {
    state.events.active_event = null;
  }
  state.uid_counters ??= {};
  delete state.uid_counters.relationship_fact;
  if (!Number.isInteger(state.uid_counters.interaction) || (state.uid_counters.interaction ?? 0) < 1) {
    state.uid_counters.interaction = 1;
  }
  const facility = state.facilities?.magic_greenhouse;
  if (facility?.current_form === '基础魔法温室') {
    facility.unlocked_forms = Array.from(new Set([...(facility.unlocked_forms ?? []), '基础魔法温室']));
  }

  // M2 defaults
  state.anomaly_cycle ??= { pending_activation: null, active: null, history: [] };
  state.anomaly_cycle.pending_activation ??= null;
  state.anomaly_cycle.active ??= null;
  state.anomaly_cycle.history = Array.isArray(state.anomaly_cycle.history)
    ? state.anomaly_cycle.history.slice(-MAX_HISTORY)
    : [];
  // Legacy waiting incident events remain completable; they are never promoted into anomaly_cycle.active.
  state.visit_scheduler ??= {
    version: 'visit.v1',
    known_characters: [],
    plans: [],
    cooldown_until: {},
    invitation_cooldowns: {},
    last_processed_serial: null,
    pending_notices: [],
  };
  state.visit_scheduler.version = 'visit.v1';
  state.visit_scheduler.plans = Array.isArray(state.visit_scheduler.plans) ? state.visit_scheduler.plans.slice(-32) : [];
  state.visit_scheduler.cooldown_until ??= {};
  state.visit_scheduler.invitation_cooldowns ??= {};
  state.visit_scheduler.pending_notices = Array.isArray(state.visit_scheduler.pending_notices)
    ? state.visit_scheduler.pending_notices.slice(-12)
    : [];
  state.visit_scheduler.known_characters = Array.from(new Set([
    ...(state.visit_scheduler.known_characters ?? []),
    ...deriveKnownCharacters(state),
  ]));
  state.presence_snapshot ??= { present_character_ids: [], character_views: {} };
  state.presence_snapshot.present_character_ids ??= [];
  state.presence_snapshot.character_views ??= {};
  state.presence_snapshot.visitor_meta ??= {};
  // Drop visitor meta for characters no longer present.
  for (const characterId of Object.keys(state.presence_snapshot.visitor_meta)) {
    if (!state.presence_snapshot.present_character_ids.includes(characterId)) {
      delete state.presence_snapshot.visitor_meta[characterId];
    }
  }

  state.facility_runtime ??= {};
  for (const facilityId of ['fairy_garden', 'moon_spring', 'banquet_plaza']) {
    state.facility_runtime[facilityId] = {
      ...defaultFacilityRuntime(),
      ...(state.facility_runtime[facilityId] ?? {}),
    };
    const builtForm = state.facilities?.[facilityId]?.current_form;
    if (builtForm) {
      state.facility_runtime[facilityId].built = true;
      state.facility_runtime[facilityId].current_form = builtForm;
      state.facility_runtime[facilityId].unlocked_forms = Array.from(new Set([
        ...(state.facility_runtime[facilityId].unlocked_forms ?? []),
        ...(state.facilities?.[facilityId]?.unlocked_forms ?? []),
        builtForm,
      ]));
    }
  }
  state.garden_projects ??= { active_construction: null };
  state.garden_projects.active_construction ??= null;
  state.garden_activities ??= { moon_spring_session: null, banquet: null, scheduled_banquet: null, banquet_history: [] };
  state.garden_activities.moon_spring_session ??= null;
  state.garden_activities.banquet ??= null;
  state.garden_activities.scheduled_banquet ??= null;
  state.garden_activities.banquet_history = Array.isArray(state.garden_activities.banquet_history)
    ? state.garden_activities.banquet_history.slice(-MAX_HISTORY)
    : [];
  state.pending_tasks = Array.isArray(state.pending_tasks)
    ? state.pending_tasks.filter((task) => (
        task
        && ['anomaly_resolution', 'banquet_start'].includes(task.kind)
        && typeof task.source_id === 'string'
      )).slice(-MAX_HISTORY)
    : [];
  state.scene_item_context = state.scene_item_context === undefined ? null : state.scene_item_context;
  if (state.scene_item_context?.entries) {
    state.scene_item_context.entries = state.scene_item_context.entries.slice(0, 3);
  }
  state.ui_flags ??= {};
  state.ui_flags.graduation_acknowledged ??= false;
  state.ui_flags.last_visit_notice_serial ??= null;
  // B1-T09：load/migration 修复——当前在场但无 active_visit → bootstrap；
  // 当前 absent 但有 active_visit → reconcile 关闭。幂等，只在迁移/加载路径调用。
  state = repairCharacterVisitsAgainstPresence(state);
  return state;
}
