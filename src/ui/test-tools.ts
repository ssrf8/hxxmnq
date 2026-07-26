import type { GardenState } from './types';

export type TestJumpId =
  | 'greenhouse_ready'
  | 'r29_after_flower_core'
  | 'r30_shop_ready'
  | 'm2_open_garden'
  | 'm2_anomaly_ready'
  | 'm2_anomaly_resolution_ready'
  | 'm2_facilities_ready'
  | 'm2_visitors_ready'
  | 'm2_items_recovery_ready';

const m2JumpIds = new Set<TestJumpId>([
  'm2_open_garden',
  'm2_anomaly_ready',
  'm2_anomaly_resolution_ready',
  'm2_facilities_ready',
  'm2_visitors_ready',
  'm2_items_recovery_ready',
]);

const allKnownCharacters = ['reimu', 'marisa', 'alice', 'nitori', 'cirno', 'mystia', 'suika', 'sakuya'];
const m2Forms: Record<string, string[]> = {
  fairy_garden: ['四季花境', '妖精游乐庭', '冰露迷宫'],
  moon_spring: ['露天月见汤', '静水观测池', '雾隐汤屋'],
  banquet_plaza: ['灯火夜市', '鬼之大宴台', '符卡演武场'],
};

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
  if (jump === 'r29_after_flower_core' || jump === 'r30_shop_ready' || m2JumpIds.has(jump)) {
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

  if (m2JumpIds.has(jump)) prepareM2AcceptanceState(state, jump);
  return state;
}

function prepareM2AcceptanceState(state: GardenState, jump: TestJumpId) {
  state.resources = { ...state.resources, materials: 50, inspiration: 10, coins: 200 };
  state.garden ??= {};
  state.garden.construction_stage = '开放';
  state.player ??= {};
  state.player.current_area_id = 'central_courtyard';
  state.areas ??= {};
  state.areas.main_house = {
    ...state.areas.main_house,
    id: 'main_house',
    name: '旧主屋',
    unlocked: true,
    state: '启用',
    main_facility_id: null,
  };
  state.events!.completed_key_events = {
    ...state.events!.completed_key_events,
    greenhouse_free_growth_proposal: 'wild_growth_plan_registered',
    alice_greenhouse_maintenance_proposal: 'doll_maintenance_plan_registered',
    nitori_greenhouse_automation_proposal: 'kappa_automation_plan_registered',
    select_greenhouse_form: 'selected_free_growth',
    cirno_first_meeting: 'done',
    mystia_first_meeting: 'done',
    suika_first_meeting: 'done',
    sakuya_first_meeting: 'done',
  };
  state.facilities!.magic_greenhouse = {
    ...state.facilities!.magic_greenhouse,
    state: '启用',
    current_form: '自由生长型温室',
    unlocked_forms: ['自由生长型温室', '人偶维护型温室', '河童自动化型温室'],
  };
  state.shop = { ...state.shop, unlocked: true };
  state.inventory ??= { consumables: {} };
  state.inventory.consumables ??= {};
  state.inventory.consumables.incident_trigger_card = 3;
  state.anomaly_cycle = { pending_activation: null, active: null, history: state.anomaly_cycle?.history ?? [] };
  state.garden_projects = { active_construction: null };
  state.garden_activities = { moon_spring_session: null, banquet: null, scheduled_banquet: null };
  state.scene_item_context = null;
  state.ui_flags = { ...state.ui_flags, graduation_acknowledged: true };
  state.memory ??= { long_term_notes: [] };
  state.memory.long_term_notes = Array.from(new Set([
    ...(state.memory.long_term_notes ?? []),
    '【阶段边界】新手教程与旧主屋、基础温室、妖花核心及首次温室选型均已完成；后续为自由庭园阶段，不得重演教程。',
  ]));
  state.visit_scheduler = {
    version: 'visit.v1', known_characters: [...allKnownCharacters], plans: [], cooldown_until: {},
    invitation_cooldowns: {}, last_processed_serial: null, pending_notices: [],
  };
  state.presence_snapshot = {
    present_character_ids: ['reimu'],
    character_views: { reimu: { area_id: 'central_courtyard', action: '自由来访', facing: 'front' } },
    visitor_meta: { reimu: { source: 'event', arrived_period_serial: 0, planned_departure_serial: 99 } },
  };

  for (const [facilityId, forms] of Object.entries(m2Forms)) {
    const areaId = `${facilityId}_plot`;
    state.facilities![facilityId] = {
      ...state.facilities![facilityId],
      state: '未建设', current_form: null, unlocked_forms: [], active_effects: [],
    };
    state.areas![areaId] = { ...state.areas![areaId], unlocked: true, state: '预留地', main_facility_id: facilityId };
    state.facility_runtime![facilityId] = {
      built: false, current_form: null, unlocked_forms: [], first_use_forms: [], activated_at_serial: null,
      distinct_chat_periods: [], second_form_choice_pending: false, unlock_deadline_2: null,
      unlock_deadline_3: null, status: 'normal', condition_id: null, risk_cooldown_until: null,
      pending_refit: null, pending_recovery: null,
    };
    if (jump === 'm2_facilities_ready' || jump === 'm2_visitors_ready' || jump === 'm2_items_recovery_ready') {
      const currentForm = forms[0];
      state.facilities![facilityId] = {
        ...state.facilities![facilityId], state: '启用', current_form: currentForm,
        unlocked_forms: [...forms], active_effects: [],
      };
      state.areas![areaId] = { ...state.areas![areaId], unlocked: true, state: '启用', main_facility_id: facilityId };
      state.facility_runtime![facilityId] = {
        ...state.facility_runtime![facilityId], built: true, current_form: currentForm, unlocked_forms: [...forms],
        first_use_forms: [currentForm], activated_at_serial: 0,
      };
    }
  }

  if (jump === 'm2_anomaly_resolution_ready') {
    state.environment = { ...state.environment, day: 8, time_period: '清晨' };
    state.anomaly_cycle!.active = {
      anomaly_id: 'acceptance:anomaly:resolution',
      title: '【验收】全员互换身体',
      rule_text: '所有登场角色在本轮异变中互换身体，并持续受到这一规则影响。',
      scope_mode: 'all', character_ids: [], presentation_tone: '轻松但保持人物身份差异', excluded_content: '',
      hidden_origin: {
        name: '错位的缘结镜', type: '物件', summary: '镜面把人与身体的缘错误连接',
        location: '中央庭院', cause: '七日前积存的愿力', resolution_method: '由灵梦切断错误的缘线',
      },
      public_summary: '庭园中的身体与身份发生了错位。',
      revealed_clues: [{ day: 2, summary: '镜面会回应名字' }, { day: 5, summary: '错位的缘线汇向中央庭院' }],
      status: 'resolving', start_period_serial: 0, end_period_serial: 28,
      last_guidance_day: 8, last_clue_day: 5,
    };
  }

  if (jump === 'm2_visitors_ready') {
    state.presence_snapshot = {
      present_character_ids: ['reimu', 'marisa', 'alice'],
      character_views: {
        reimu: { area_id: 'central_courtyard', action: '在庭院休息', facing: 'front' },
        marisa: { area_id: 'fairy_garden_plot', action: '观察花圃', facing: 'right' },
        alice: { area_id: 'moon_spring_plot', action: '观测水面', facing: 'left' },
      },
      visitor_meta: {
        reimu: { source: 'event', arrived_period_serial: 0, planned_departure_serial: 99 },
        marisa: { source: 'event', arrived_period_serial: 0, planned_departure_serial: 99 },
        alice: { source: 'event', arrived_period_serial: 0, planned_departure_serial: 99 },
      },
    };
  }

  if (jump === 'm2_items_recovery_ready') {
    Object.assign(state.inventory.consumables, {
      fairy_candy_pack: 5, moon_viewing_tea: 5, hot_spring_sachet: 5,
      banquet_bento: 5, oni_sake_flask: 5, emergency_repair_kit: 3,
    });
    state.facility_runtime!.fairy_garden.status = 'damaged';
    state.facility_runtime!.fairy_garden.condition_id = 'fairy_garden_broken_fence';
    state.facilities!.fairy_garden.state = '损坏';
  }
}

export function testJumpReached(state: GardenState, jump: TestJumpId): boolean {
  if (jump === 'greenhouse_ready') return state.facilities?.magic_greenhouse?.current_form === '基础魔法温室';
  if (jump === 'r29_after_flower_core') return Boolean(state.battle?.dungeon_unlocked);
  if (jump === 'r30_shop_ready') return Boolean(state.shop?.unlocked) && (state.resources?.coins ?? 0) >= 50;
  if (jump === 'm2_open_garden') return Boolean(state.events?.completed_key_events?.select_greenhouse_form)
    && Object.keys(m2Forms).every((id) => !state.facility_runtime?.[id]?.built);
  if (jump === 'm2_anomaly_ready') return (state.inventory?.consumables?.incident_trigger_card ?? 0) >= 3
    && !state.anomaly_cycle?.active;
  if (jump === 'm2_anomaly_resolution_ready') return state.anomaly_cycle?.active?.status === 'resolving'
    && state.anomaly_cycle.active.end_period_serial === 28;
  if (jump === 'm2_facilities_ready') return Object.entries(m2Forms).every(([id, forms]) =>
    Boolean(state.facility_runtime?.[id]?.built) && forms.every((form) => state.facility_runtime?.[id]?.unlocked_forms?.includes(form)));
  if (jump === 'm2_visitors_ready') return allKnownCharacters.every((id) => state.visit_scheduler?.known_characters?.includes(id))
    && (state.presence_snapshot?.present_character_ids?.length ?? 0) === 3;
  return state.facility_runtime?.fairy_garden?.status === 'damaged'
    && (state.inventory?.consumables?.emergency_repair_kit ?? 0) >= 1;
}
