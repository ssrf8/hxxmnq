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
  state.interaction ??= {};
  state.interaction.current_session ??= null;
  state.interaction.settled_ids = Array.from(new Set(state.interaction.settled_ids ?? [])).slice(-64);
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
