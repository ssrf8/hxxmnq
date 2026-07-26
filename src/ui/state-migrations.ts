import type { GardenState } from './types';
import { deriveKnownCharacters } from './visitor-rules';

const MAX_REWARDED_IDS = 256;
const MAX_HISTORY = 8;

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
  const state = structuredClone(before);
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
  state.inventory.consumables.incident_trigger_card = Math.min(
    99,
    Math.max(0, state.inventory.consumables.incident_trigger_card ?? 0),
  );
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
  state.interaction.settled_ids = Array.from(new Set(state.interaction.settled_ids ?? [])).slice(-64);
  state.events ??= {};
  state.events.settled_ids = Array.from(new Set(state.events.settled_ids ?? [])).slice(-256);
  state.events.waiting_events = Array.isArray(state.events.waiting_events) ? state.events.waiting_events.slice(0, 3) : [];
  state.events.completed_key_events ??= {};
  state.uid_counters ??= {};
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
  return state;
}
