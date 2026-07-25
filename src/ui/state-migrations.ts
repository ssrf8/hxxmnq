import type { GardenState } from './types';

const MAX_REWARDED_IDS = 256;

/** Idempotent, non-destructive defaults for saves created before R29. */
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
  state.inventory.consumables.incident_trigger_card = Math.min(99, Math.max(0, state.inventory.consumables.incident_trigger_card ?? 0));
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
  state.uid_counters ??= {};
  if (!Number.isInteger(state.uid_counters.interaction) || (state.uid_counters.interaction ?? 0) < 1) {
    state.uid_counters.interaction = 1;
  }
  const facility = state.facilities?.magic_greenhouse;
  if (facility?.current_form === '基础魔法温室') {
    facility.unlocked_forms = Array.from(new Set([...(facility.unlocked_forms ?? []), '基础魔法温室']));
  }
  return state;
}
