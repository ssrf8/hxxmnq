import type { GardenState } from './types';

export type TestJumpId = 'greenhouse_ready' | 'r29_after_flower_core' | 'r30_shop_ready';

const greenhousePrerequisites = {
  reimu_boundary_inspection: 'temporary_permission',
  marisa_material_rumor: 'greenhouse_clue_found',
  main_house_repair: 'main_house_enabled',
  gain_second_inspiration: 'hear_marisa_plan',
  clear_greenhouse_foundation: 'foundation_cleared',
  build_basic_magic_greenhouse: 'basic_greenhouse_enabled',
  greenhouse_first_use: 'stable_first_growth',
  greenhouse_multiturn_conversation: 'conversation_settled_after_multiple_turns',
};

/** Test-only deterministic snapshots. They never generate a chat message. */
export function applyTestJump(before: GardenState, jump: TestJumpId): GardenState {
  const state = structuredClone(before);
  state.meta ??= {};
  state.meta.initialized = true;
  state.meta.opening_committed = true;
  state.resources ??= {};
  state.resources.materials ??= 6;
  state.resources.inspiration ??= 2;
  state.resources.coins ??= 0;
  state.areas ??= {};
  state.areas.greenhouse_plot = { ...state.areas.greenhouse_plot, id: 'greenhouse_plot', name: '温室旧地基', unlocked: true, state: '已清理', main_facility_id: 'magic_greenhouse' };
  state.facilities ??= {};
  state.facilities.magic_greenhouse = { ...state.facilities.magic_greenhouse, id: 'magic_greenhouse', name: '魔法温室', area_id: 'greenhouse_plot', state: '启用', current_form: '基础魔法温室', unlocked_forms: ['基础魔法温室'], active_effects: [] };
  state.events ??= {};
  state.events.completed_key_events = { ...state.events.completed_key_events, ...greenhousePrerequisites };
  state.events.active_event = null;
  state.interaction ??= {};
  state.interaction.current_session = null;
  state.battle ??= {};
  state.battle.current = null;
  state.battle.settled_ids ??= [];
  state.battle.rewarded_ids ??= [];
  state.battle.run_count ??= 0;
  state.battle.last_run ??= null;
  if (jump === 'r29_after_flower_core' || jump === 'r30_shop_ready') {
    state.events.completed_key_events.greenhouse_flower_core = 'clean_win';
    state.battle.dungeon_unlocked = true;
    state.shop ??= {};
    state.shop.unlocked = true;
    state.shop.purchase_settled_ids ??= [];
    state.shop.static_dialogue_seen_ids ??= [];
    if (jump === 'r30_shop_ready') state.resources.coins = 50;
    state.memory ??= { long_term_notes: [] };
    state.memory.long_term_notes = Array.from(new Set([...(state.memory.long_term_notes ?? []), '庭守钥与温室核心共鸣，暗示未来可建立移动锚点', '【测试快进】已跳至妖花核心战后与副本解锁状态。']));
  } else {
    delete state.events.completed_key_events.greenhouse_flower_core;
    state.battle.dungeon_unlocked = false;
    state.shop ??= {};
    state.shop.unlocked = false;
  }
  return state;
}
