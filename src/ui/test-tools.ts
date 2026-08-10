import type { GardenState } from './types';
import { reconcileCharacterVisitsFromState } from './character-memory';

export type TestJumpId =
  | 'tutorial_boundary_ready'
  | 'tutorial_house_repair_ready'
  | 'tutorial_greenhouse_investigation_ready'
  | 'tutorial_greenhouse_build_ready'
  | 'tutorial_flower_core_ready'
  | 'tutorial_proposals_ready'
  | 'tutorial_form_selection_ready'
  | 'greenhouse_ready'
  | 'r29_after_flower_core'
  | 'r30_shop_ready'
  | 'm2_open_garden'
  | 'm2_anomaly_ready'
  | 'm2_anomaly_resolution_ready'
  | 'm2_facilities_ready'
  | 'm2_visitors_ready'
  | 'm2_items_recovery_ready'
  | 'presence_reimu'
  | 'presence_marisa'
  | 'presence_alice'
  | 'presence_nitori'
  | 'presence_cirno'
  | 'presence_mystia'
  | 'presence_suika'
  | 'presence_sakuya'
  | 'presence_all'
  | 'presence_clear';

const tutorialJumpIds = new Set<TestJumpId>([
  'tutorial_boundary_ready',
  'tutorial_house_repair_ready',
  'tutorial_greenhouse_investigation_ready',
  'tutorial_greenhouse_build_ready',
  'tutorial_flower_core_ready',
  'tutorial_proposals_ready',
  'tutorial_form_selection_ready',
]);

const presenceJumpIds = new Set<TestJumpId>([
  'presence_reimu', 'presence_marisa', 'presence_alice', 'presence_nitori',
  'presence_cirno', 'presence_mystia', 'presence_suika', 'presence_sakuya',
  'presence_all', 'presence_clear',
]);

const m2JumpIds = new Set<TestJumpId>([
  'm2_open_garden',
  'm2_anomaly_ready',
  'm2_anomaly_resolution_ready',
  'm2_facilities_ready',
  'm2_visitors_ready',
  'm2_items_recovery_ready',
]);

const allKnownCharacters = ['reimu', 'marisa', 'alice', 'nitori', 'cirno', 'mystia', 'suika', 'sakuya'];
const characterNames: Record<string, string> = {
  reimu: '博丽灵梦', marisa: '雾雨魔理沙', alice: '爱丽丝·玛格特洛依德', nitori: '河城荷取',
  cirno: '琪露诺', mystia: '米斯蒂娅·萝蕾拉', suika: '伊吹萃香', sakuya: '十六夜咲夜',
};
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
  if (tutorialJumpIds.has(jump)) return prepareTutorialAcceptanceState(before, jump);
  if (presenceJumpIds.has(jump)) return applyPresenceTestAction(before, jump);
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
  state.facility_runtime ??= {};
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

function prepareTutorialAcceptanceState(before: GardenState, jump: TestJumpId): GardenState {
  const state = structuredClone(before);
  state.meta = { ...state.meta, initialized: true, opening_committed: true };
  state.resources = { ...state.resources, materials: 8, inspiration: 3, coins: 0 };
  state.garden = { ...state.garden, construction_stage: '荒废' };
  state.events ??= {};
  state.events.completed_key_events = {};
  state.events.active_event = null;
  state.interaction = { ...state.interaction, current_session: null };
  state.areas ??= {};
  state.areas.main_house = { id: 'main_house', name: '旧主屋', unlocked: true, state: '损坏', main_facility_id: null };
  state.areas.greenhouse_plot = { id: 'greenhouse_plot', name: '温室旧地基', unlocked: true, state: '未清理', main_facility_id: 'magic_greenhouse' };
  state.facilities ??= {};
  state.facilities.magic_greenhouse = {
    id: 'magic_greenhouse', name: '魔法温室', area_id: 'greenhouse_plot', state: '可建设',
    current_form: null, unlocked_forms: [], active_effects: [],
  };
  state.battle = { ...state.battle, current: null, dungeon_unlocked: false, run_count: 0, settled_ids: [], rewarded_ids: [], last_run: null };
  state.shop = { ...state.shop, unlocked: false };
  state.presence_snapshot = {
    present_character_ids: ['reimu', 'marisa'],
    character_views: {
      reimu: { area_id: 'central_courtyard', action: '检查庭园边界', facing: 'front' },
      marisa: { area_id: 'greenhouse_plot', action: '观察旧地基', facing: 'left' },
    },
  };

  const completed = state.events.completed_key_events;
  const stages = [
    'tutorial_boundary_ready',
    'tutorial_house_repair_ready',
    'tutorial_greenhouse_investigation_ready',
    'tutorial_greenhouse_build_ready',
    'tutorial_flower_core_ready',
    'tutorial_proposals_ready',
    'tutorial_form_selection_ready',
  ];
  const stageIndex = stages.indexOf(jump);
  if (stageIndex >= 1) completed.reimu_boundary_inspection = 'temporary_permission';
  if (stageIndex >= 2) {
    completed.main_house_repair = 'main_house_enabled';
    state.areas.main_house.state = '启用';
  }
  if (stageIndex >= 3) {
    completed.marisa_material_rumor = 'greenhouse_clue_found';
    completed.gain_second_inspiration = 'growth_pattern_understood';
    completed.clear_greenhouse_foundation = 'foundation_cleared';
    state.areas.greenhouse_plot.state = '已清理';
  }
  if (stageIndex >= 4) {
    Object.assign(completed, greenhousePrerequisites);
    state.facilities.magic_greenhouse = {
      ...state.facilities.magic_greenhouse,
      state: '启用', current_form: '基础魔法温室', unlocked_forms: ['基础魔法温室'], active_effects: [],
    };
  }
  if (stageIndex >= 5) {
    completed.greenhouse_flower_core = 'clean_win';
    completed.greenhouse_free_growth_proposal = 'wild_growth_plan_registered';
    state.facilities.magic_greenhouse.unlocked_forms = ['基础魔法温室', '自由生长型温室'];
    state.battle.dungeon_unlocked = true;
    state.shop.unlocked = true;
  }
  if (stageIndex >= 6) {
    completed.alice_greenhouse_maintenance_proposal = 'doll_maintenance_plan_registered';
    completed.nitori_greenhouse_automation_proposal = 'kappa_automation_plan_registered';
    state.facilities.magic_greenhouse.unlocked_forms = [
      '基础魔法温室', '自由生长型温室', '人偶维护型温室', '河童自动化型温室',
    ];
  }
  return state;
}

function applyPresenceTestAction(before: GardenState, jump: TestJumpId): GardenState {
  const state = structuredClone(before);
  state.characters ??= {};
  state.presence_snapshot ??= { present_character_ids: [], character_views: {} };
  state.presence_snapshot.present_character_ids ??= [];
  state.presence_snapshot.character_views ??= {};
  state.presence_snapshot.visitor_meta ??= {};
  state.visit_scheduler ??= {
    version: 'visit.v1', known_characters: [], plans: [], cooldown_until: {}, invitation_cooldowns: {},
    last_processed_serial: null, pending_notices: [],
  };
  state.visit_scheduler.known_characters ??= [];
  if (jump === 'presence_clear') {
    state.presence_snapshot = { present_character_ids: [], character_views: {}, visitor_meta: {} };
    return reconcileCharacterVisitsFromState(before, state, 'event');
  }
  const ids = jump === 'presence_all' ? allKnownCharacters : [jump.replace('presence_', '')];
  for (const id of ids) {
    if (!allKnownCharacters.includes(id)) continue;
    state.characters[id] = { ...state.characters[id], id, name: state.characters[id]?.name ?? characterNames[id] };
    if (!state.presence_snapshot.present_character_ids.includes(id)) state.presence_snapshot.present_character_ids.push(id);
    state.presence_snapshot.character_views[id] = {
      area_id: 'central_courtyard', action: '测试入场', facing: 'front',
    };
    state.presence_snapshot.visitor_meta[id] = { source: 'event', arrived_period_serial: 0, planned_departure_serial: 9999 };
    if (!state.visit_scheduler.known_characters.includes(id)) state.visit_scheduler.known_characters.push(id);
  }
  return reconcileCharacterVisitsFromState(before, state, 'event');
}

function prepareM2AcceptanceState(state: GardenState, jump: TestJumpId) {
  if (jump !== 'm2_open_garden') {
    state.resources = { ...state.resources, materials: 50, inspiration: 10, coins: 200 };
  }
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
  if (jump !== 'm2_open_garden') state.inventory.consumables.incident_trigger_card = 3;
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
      emergency_repair_kit: 3,
      foreign_vibrator: 3, foreign_egg: 3, reimu_coin_bait: 3,
      cirno_frog_bait: 3, cirno_ice_toy: 3,
      marisa_dream_mushroom: 3, marisa_obedience_page: 3, alice_doll_pause: 3,
    });
    state.facility_runtime!.fairy_garden.status = 'damaged';
    state.facility_runtime!.fairy_garden.condition_id = 'fairy_garden_broken_fence';
    state.facilities!.fairy_garden.state = '损坏';
  }
}

export function testJumpReached(state: GardenState, jump: TestJumpId): boolean {
  if (jump === 'tutorial_boundary_ready') return Boolean(state.meta?.opening_committed)
    && !state.events?.completed_key_events?.reimu_boundary_inspection;
  if (jump === 'tutorial_house_repair_ready') return Boolean(state.events?.completed_key_events?.reimu_boundary_inspection)
    && !state.events?.completed_key_events?.main_house_repair;
  if (jump === 'tutorial_greenhouse_investigation_ready') return Boolean(state.events?.completed_key_events?.main_house_repair)
    && !state.events?.completed_key_events?.marisa_material_rumor;
  if (jump === 'tutorial_greenhouse_build_ready') return Boolean(state.events?.completed_key_events?.clear_greenhouse_foundation)
    && !state.events?.completed_key_events?.build_basic_magic_greenhouse;
  if (jump === 'tutorial_flower_core_ready') return Boolean(state.events?.completed_key_events?.greenhouse_multiturn_conversation)
    && !state.events?.completed_key_events?.greenhouse_flower_core;
  if (jump === 'tutorial_proposals_ready') return Boolean(state.events?.completed_key_events?.greenhouse_free_growth_proposal)
    && !state.events?.completed_key_events?.alice_greenhouse_maintenance_proposal;
  if (jump === 'tutorial_form_selection_ready') return Boolean(state.events?.completed_key_events?.nitori_greenhouse_automation_proposal)
    && !state.events?.completed_key_events?.select_greenhouse_form;
  if (jump === 'presence_clear') return (state.presence_snapshot?.present_character_ids?.length ?? 0) === 0;
  if (jump === 'presence_all') return allKnownCharacters.every((id) => state.presence_snapshot?.present_character_ids?.includes(id));
  if (jump.startsWith('presence_')) return state.presence_snapshot?.present_character_ids?.includes(jump.slice('presence_'.length)) ?? false;
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
