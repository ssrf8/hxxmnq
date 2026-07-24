import type { GardenState } from './types';

export interface GardenActionMarker {
  version: 'garden-action.v1';
  action_id: string;
  event_id: string | null;
  target_id?: string | null;
  target_type?: string | null;
}

const LOCAL_EVENT_ACTIONS = new Set([
  'inspect_boundary',
  'repair',
  'investigate_magic_trace',
  'investigate_growth',
  'hear_marisa_plan',
  'study_grandfather_blueprint',
  'clear_greenhouse_foundation',
  'build_basic_magic_greenhouse',
  'greenhouse_first_use',
  'greenhouse_research_talk',
  'continue_greenhouse_conversation',
  'end_conversation',
  'investigate_flower_core',
  'resume_battle_settlement',
  'settle_flower_core_battle',
]);

const LOCAL_EVENT_IDS = [
  'reimu_boundary_inspection',
  'main_house_repair',
  'marisa_material_rumor',
  'gain_second_inspiration',
  'clear_greenhouse_foundation',
  'build_basic_magic_greenhouse',
  'greenhouse_first_use',
  'greenhouse_multiturn_conversation',
  'greenhouse_flower_core',
] as const;

const allowedResults: Record<string, readonly string[]> = {
  reimu_boundary_inspection: ['temporary_permission', 'supervised_restriction', 'urgent_seal_repair'],
  main_house_repair: ['main_house_enabled', 'temporary_shelter_only'],
  marisa_material_rumor: ['greenhouse_clue_found', 'material_sample_deferred'],
  gain_second_inspiration: ['investigate_growth', 'hear_marisa_plan', 'study_grandfather_blueprint'],
  clear_greenhouse_foundation: ['foundation_cleared', 'hidden_root_network_found'],
  build_basic_magic_greenhouse: ['basic_greenhouse_enabled', 'enabled_with_instability'],
  greenhouse_first_use: ['stable_first_growth', 'unusual_growth_observed'],
  greenhouse_multiturn_conversation: ['conversation_settled_after_multiple_turns'],
};

const defaultResults: Record<string, string> = {
  reimu_boundary_inspection: 'temporary_permission',
  main_house_repair: 'main_house_enabled',
  marisa_material_rumor: 'greenhouse_clue_found',
  gain_second_inspiration: 'investigate_growth',
  clear_greenhouse_foundation: 'foundation_cleared',
  build_basic_magic_greenhouse: 'basic_greenhouse_enabled',
  greenhouse_first_use: 'stable_first_growth',
  greenhouse_multiturn_conversation: 'conversation_settled_after_multiple_turns',
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseGardenAction(message: string): GardenActionMarker | null {
  const match = message.match(/<GensokyoAction>([\s\S]*?)<\/GensokyoAction>/iu);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]) as Partial<GardenActionMarker>;
    if (value.version !== 'garden-action.v1' || typeof value.action_id !== 'string') return null;
    return {
      version: value.version,
      action_id: value.action_id,
      event_id: typeof value.event_id === 'string' && value.event_id ? value.event_id : null,
      target_id: typeof value.target_id === 'string' ? value.target_id : null,
      target_type: typeof value.target_type === 'string' ? value.target_type : null,
    };
  } catch {
    return null;
  }
}

export function localSettlementAction(
  message: string,
  state: GardenState,
): GardenActionMarker | null {
  const parsed = parseGardenAction(message);
  if (parsed && LOCAL_EVENT_ACTIONS.has(parsed.action_id) && parsed.event_id) return parsed;
  const session = state.interaction?.current_session;
  if (!parsed && session?.event_id === 'greenhouse_multiturn_conversation') {
    return {
      version: 'garden-action.v1',
      action_id: 'continue_greenhouse_conversation',
      event_id: 'greenhouse_multiturn_conversation',
      target_id: session.facility_id ?? 'magic_greenhouse',
      target_type: 'facility',
    };
  }
  return null;
}

export function settlementChoices(state: GardenState, action: GardenActionMarker): string[] {
  if (action.action_id === 'investigate_flower_core') return ['event_activated'];
  if (action.action_id === 'continue_greenhouse_conversation'
    || action.action_id === 'greenhouse_research_talk') return ['conversation_continues'];
  if (action.action_id === 'end_conversation') {
    return (state.interaction?.current_session?.effective_rounds ?? 0) >= 2
      ? ['conversation_settled_after_multiple_turns']
      : ['conversation_continues'];
  }
  if (action.action_id === 'settle_flower_core_battle' || action.action_id === 'resume_battle_settlement') {
    return state.battle?.current?.outcome ? [state.battle.current.outcome] : [];
  }
  return [...(allowedResults[action.event_id ?? ''] ?? [])];
}

function eventResult(text: string, eventId: string, actionId: string) {
  const fallback = actionId === 'investigate_growth'
    || actionId === 'hear_marisa_plan'
    || actionId === 'study_grandfather_blueprint'
    ? actionId
    : defaultResults[eventId];
  const match = text.match(/<GensokyoEventResult>([\s\S]*?)<\/GensokyoEventResult>/iu);
  if (!match) return fallback;
  try {
    const value = JSON.parse(match[1]) as { version?: string; event_id?: string; result?: string };
    if (value.version !== 'event-result.v1' || value.event_id !== eventId) return fallback;
    return allowedResults[eventId]?.includes(String(value.result)) ? String(value.result) : fallback;
  } catch {
    return fallback;
  }
}

function completed(state: GardenState) {
  state.events ??= {};
  state.events.completed_key_events ??= {};
  return state.events.completed_key_events;
}

function advanceTime(state: GardenState) {
  state.environment ??= {};
  const periods = ['清晨', '白昼', '黄昏', '夜晚'] as const;
  const current = periods.indexOf(state.environment.time_period ?? '清晨');
  const next = (current + 1) % periods.length;
  state.environment.time_period = periods[next];
  if (next === 0) state.environment.day = (state.environment.day ?? 1) + 1;
}

function requireEvent(action: GardenActionMarker, expected: string) {
  if (action.event_id !== expected) throw new Error(`行动事件不匹配：预期 ${expected}`);
}

function settleReimu(state: GardenState, action: GardenActionMarker, assistantText: string) {
  requireEvent(action, 'reimu_boundary_inspection');
  if (completed(state).reimu_boundary_inspection) return;
  completed(state).reimu_boundary_inspection = eventResult(assistantText, 'reimu_boundary_inspection', action.action_id);
  state.events!.active_event = null;
}

function settleMainHouse(state: GardenState, action: GardenActionMarker, assistantText: string) {
  requireEvent(action, 'main_house_repair');
  if (completed(state).main_house_repair) return;
  if (!completed(state).reimu_boundary_inspection) throw new Error('需要先完成灵梦的结界检查');
  if ((state.resources?.materials ?? 0) < 1) throw new Error('修复旧主屋至少需要 1 点物资');
  state.resources!.materials = (state.resources?.materials ?? 0) - 1;
  const result = eventResult(assistantText, 'main_house_repair', action.action_id);
  completed(state).main_house_repair = result;
  state.areas!.main_house.state = result === 'main_house_enabled' ? '启用' : '临时修复';
  state.events!.active_event = null;
  advanceTime(state);
}

function settleRumor(state: GardenState, action: GardenActionMarker, assistantText: string) {
  requireEvent(action, 'marisa_material_rumor');
  if (completed(state).marisa_material_rumor) return;
  if (!completed(state).reimu_boundary_inspection) throw new Error('需要先完成灵梦的结界检查');
  completed(state).marisa_material_rumor = eventResult(assistantText, 'marisa_material_rumor', action.action_id);
  state.areas!.greenhouse_plot.unlocked = true;
  state.areas!.greenhouse_plot.state = '未清理';
  state.facilities!.magic_greenhouse.state = '可建设';
  state.characters ??= {};
  state.characters.marisa = {
    ...state.characters.marisa,
    id: 'marisa',
    name: '雾雨魔理沙',
    fixed: true,
  };
  state.presence_snapshot ??= {};
  state.presence_snapshot.present_character_ids = Array.from(new Set([
    ...(state.presence_snapshot.present_character_ids ?? []),
    'marisa',
  ]));
  state.presence_snapshot.character_views ??= {};
  state.presence_snapshot.character_views.marisa = {
    area_id: 'greenhouse_plot',
    action: '观察温室旧地基',
    facing: 'left',
  };
  state.events!.active_event = null;
}

function settleInspiration(state: GardenState, action: GardenActionMarker, assistantText: string) {
  requireEvent(action, 'gain_second_inspiration');
  if (completed(state).gain_second_inspiration) return;
  if (!completed(state).marisa_material_rumor) throw new Error('需要先完成温室方向的魔力痕迹调查');
  if (!completed(state).main_house_repair) throw new Error('需要先修复旧主屋');
  if ((state.resources?.inspiration ?? 0) !== 1) throw new Error('第二点灵感的前置状态不一致');
  state.resources!.inspiration = 2;
  completed(state).gain_second_inspiration = eventResult(assistantText, 'gain_second_inspiration', action.action_id);
  state.events!.active_event = null;
}

function settleClear(state: GardenState, action: GardenActionMarker, assistantText: string) {
  requireEvent(action, 'clear_greenhouse_foundation');
  if (completed(state).clear_greenhouse_foundation) return;
  if (!state.areas?.greenhouse_plot?.unlocked) throw new Error('温室旧地基尚未解锁');
  if ((state.resources?.inspiration ?? 0) < 2) throw new Error('清理地基至少需要 2 点灵感');
  completed(state).clear_greenhouse_foundation = eventResult(assistantText, 'clear_greenhouse_foundation', action.action_id);
  state.areas.greenhouse_plot.state = '已清理';
  state.events!.active_event = null;
  advanceTime(state);
}

function settleBuild(state: GardenState, action: GardenActionMarker, assistantText: string) {
  requireEvent(action, 'build_basic_magic_greenhouse');
  if (completed(state).build_basic_magic_greenhouse) return;
  if (!completed(state).clear_greenhouse_foundation) throw new Error('需要先完成温室旧地基清理');
  if ((state.resources?.materials ?? 0) < 4 || (state.resources?.inspiration ?? 0) < 2) {
    throw new Error('建造温室所需资源不足');
  }
  state.resources!.materials = (state.resources?.materials ?? 0) - 4;
  state.resources!.inspiration = (state.resources?.inspiration ?? 0) - 2;
  const result = eventResult(assistantText, 'build_basic_magic_greenhouse', action.action_id);
  completed(state).build_basic_magic_greenhouse = result;
  const facility = state.facilities!.magic_greenhouse;
  facility.state = '启用';
  facility.current_form = '基础魔法温室';
  facility.unlocked_forms = Array.from(new Set([...(facility.unlocked_forms ?? []), '基础魔法温室']));
  if (result === 'enabled_with_instability') {
    facility.active_effects = Array.from(new Set([...(facility.active_effects ?? []), '温室魔力流仍有轻微波动']));
  }
  state.events!.active_event = null;
  advanceTime(state);
}

function settleFirstUse(state: GardenState, action: GardenActionMarker, assistantText: string) {
  requireEvent(action, 'greenhouse_first_use');
  if (completed(state).greenhouse_first_use) return;
  if (!completed(state).build_basic_magic_greenhouse || state.facilities?.magic_greenhouse?.state !== '启用') {
    throw new Error('需要先建成并启用基础魔法温室');
  }
  completed(state).greenhouse_first_use = eventResult(assistantText, 'greenhouse_first_use', action.action_id);
  state.events!.active_event = null;
}

function settleConversationTurn(
  state: GardenState,
  action: GardenActionMarker,
  assistantMessageId: number,
) {
  requireEvent(action, 'greenhouse_multiturn_conversation');
  if (!completed(state).greenhouse_first_use) throw new Error('需要先完成温室第一次使用');
  const session = state.interaction?.current_session;
  if (session && session.event_id !== action.event_id) throw new Error('当前已有其他主要会话');
  state.interaction ??= { current_session: null, settled_ids: [] };
  if (!session) {
    const counter = state.uid_counters?.interaction ?? 1;
    state.interaction.current_session = {
      uid: `interaction_${counter}`,
      type: 'facility',
      status: 'active',
      area_id: 'greenhouse_plot',
      participant_character_ids: ['marisa'],
      facility_id: 'magic_greenhouse',
      event_id: action.event_id,
      focus: '温室里的持续研究与交流',
      summary: '你与魔理沙开始在温室里持续研究和交谈。',
      last_effective_message_id: assistantMessageId,
      effective_rounds: 1,
      settled: false,
    };
    state.uid_counters ??= {};
    state.uid_counters.interaction = counter + 1;
    return;
  }
  if (session.last_effective_message_id === assistantMessageId) return;
  session.last_effective_message_id = assistantMessageId;
  session.effective_rounds = Math.min(999, (session.effective_rounds ?? 0) + 1);
  session.summary = '你与魔理沙继续交换温室研究的观察与想法。';
}

function settleConversationEnd(state: GardenState, action: GardenActionMarker) {
  requireEvent(action, 'greenhouse_multiturn_conversation');
  const session = state.interaction?.current_session;
  if (!session || session.event_id !== action.event_id) throw new Error('没有找到温室持续交流会话');
  if ((session.effective_rounds ?? 0) < 2) return;
  completed(state).greenhouse_multiturn_conversation = defaultResults.greenhouse_multiturn_conversation;
  state.interaction!.settled_ids ??= [];
  const settlementId = `interaction:${session.uid}`;
  state.interaction!.settled_ids = Array.from(new Set([...state.interaction!.settled_ids!, settlementId]));
  state.interaction!.current_session = null;
  state.events!.active_event = null;
}

function activateFlowerCore(state: GardenState, action: GardenActionMarker) {
  requireEvent(action, 'greenhouse_flower_core');
  if (!completed(state).greenhouse_first_use || !completed(state).greenhouse_multiturn_conversation) {
    throw new Error('妖花核心事件前置尚未完成');
  }
  if (completed(state).greenhouse_flower_core) return;
  state.events ??= {};
  state.events.active_event = {
    uid: 'greenhouse_flower_core',
    config_id: 'greenhouse_flower_core',
    title: '温室妖花核心',
    status: 'active',
  };
}

function settleFlowerCore(state: GardenState, action: GardenActionMarker) {
  requireEvent(action, 'greenhouse_flower_core');
  const result = state.battle?.current;
  if (!result || result.config_id !== 'greenhouse_flower_core_tutorial_v1') {
    throw new Error('没有找到可信的温室妖花核心战斗结果');
  }
  state.battle!.settled_ids ??= [];
  if (state.battle!.settled_ids!.includes(result.settlement_id)) throw new Error('该战斗结果已经结算');
  completed(state).greenhouse_flower_core = result.outcome;
  const facility = state.facilities!.magic_greenhouse;
  facility.active_effects ??= [];
  if (result.outcome === 'loss') {
    facility.state = '异常';
    facility.active_effects = Array.from(new Set([...facility.active_effects, '妖花核心暂时占据温室深处']));
  } else {
    facility.state = '启用';
    const effect = result.outcome === 'narrow_win'
      ? '妖花核心休眠，根系余波待观察'
      : result.outcome === 'narrative'
        ? '妖花核心经协商封存，仍有轻微异常'
        : '';
    facility.active_effects = effect ? [effect] : [];
  }
  state.memory ??= { long_term_notes: [] };
  state.memory.long_term_notes ??= [];
  state.memory.long_term_notes = Array.from(new Set([
    ...state.memory.long_term_notes,
    '庭守钥与温室核心共鸣，暗示未来可建立移动锚点',
  ]));
  state.battle!.settled_ids = [...state.battle!.settled_ids!, result.settlement_id];
  state.battle!.current = null;
  state.events!.active_event = null;
}

export function applyLocalSettlement(
  before: GardenState,
  action: GardenActionMarker,
  assistantMessageId: number,
  assistantText: string,
): GardenState {
  const state = structuredClone(before);
  switch (action.action_id) {
    case 'inspect_boundary': settleReimu(state, action, assistantText); break;
    case 'repair': settleMainHouse(state, action, assistantText); break;
    case 'investigate_magic_trace': settleRumor(state, action, assistantText); break;
    case 'investigate_growth':
    case 'hear_marisa_plan':
    case 'study_grandfather_blueprint': settleInspiration(state, action, assistantText); break;
    case 'clear_greenhouse_foundation': settleClear(state, action, assistantText); break;
    case 'build_basic_magic_greenhouse': settleBuild(state, action, assistantText); break;
    case 'greenhouse_first_use': settleFirstUse(state, action, assistantText); break;
    case 'greenhouse_research_talk':
    case 'continue_greenhouse_conversation': settleConversationTurn(state, action, assistantMessageId); break;
    case 'end_conversation': settleConversationEnd(state, action); break;
    case 'investigate_flower_core': activateFlowerCore(state, action); break;
    case 'resume_battle_settlement':
    case 'settle_flower_core_battle': settleFlowerCore(state, action); break;
    default: throw new Error(`未登记的本地结算行动：${action.action_id}`);
  }
  return state;
}

export function settlementProjection(state: GardenState, action: GardenActionMarker) {
  const eventId = action.event_id ?? '';
  if (eventId === 'greenhouse_flower_core' && action.action_id === 'investigate_flower_core') {
    return state.events?.active_event?.config_id === eventId;
  }
  if (eventId === 'greenhouse_multiturn_conversation') {
    if (action.action_id === 'end_conversation') {
      return Boolean(completed(state)[eventId]) || Boolean(state.interaction?.current_session);
    }
    return state.interaction?.current_session?.event_id === eventId;
  }
  if (action.action_id === 'settle_flower_core_battle') {
    return Boolean(completed(state).greenhouse_flower_core) && state.battle?.current == null;
  }
  return Boolean(eventId && completed(state)[eventId]);
}

export function restoreLocalEventOwnership(before: GardenState, after: GardenState): GardenState {
  const next = structuredClone(after);
  next.events ??= {};
  next.events.completed_key_events ??= {};
  const priorCompleted = before.events?.completed_key_events ?? {};
  for (const eventId of LOCAL_EVENT_IDS) {
    if (priorCompleted[eventId] === undefined) delete next.events.completed_key_events[eventId];
    else next.events.completed_key_events[eventId] = priorCompleted[eventId];
  }

  const beforeActive = before.events?.active_event;
  const afterActive = next.events.active_event;
  if (LOCAL_EVENT_IDS.includes(beforeActive?.config_id as typeof LOCAL_EVENT_IDS[number])
    || LOCAL_EVENT_IDS.includes(afterActive?.config_id as typeof LOCAL_EVENT_IDS[number])) {
    next.events.active_event = structuredClone(beforeActive ?? null);
  }

  if (before.areas?.main_house && next.areas?.main_house) {
    next.areas.main_house.state = before.areas.main_house.state;
  }
  if (before.areas?.greenhouse_plot && next.areas?.greenhouse_plot) {
    next.areas.greenhouse_plot.unlocked = before.areas.greenhouse_plot.unlocked;
    next.areas.greenhouse_plot.state = before.areas.greenhouse_plot.state;
  }
  if (before.facilities?.magic_greenhouse && next.facilities?.magic_greenhouse) {
    const prior = before.facilities.magic_greenhouse;
    const current = next.facilities.magic_greenhouse;
    current.state = prior.state;
    current.current_form = prior.current_form;
    current.unlocked_forms = structuredClone(prior.unlocked_forms ?? []);
    current.active_effects = structuredClone(prior.active_effects ?? []);
  }

  const beforeConversation = before.interaction?.current_session?.event_id === 'greenhouse_multiturn_conversation';
  const afterConversation = next.interaction?.current_session?.event_id === 'greenhouse_multiturn_conversation';
  if (beforeConversation || afterConversation) {
    next.interaction ??= {};
    next.interaction.current_session = structuredClone(before.interaction?.current_session ?? null);
    next.interaction.settled_ids = structuredClone(before.interaction?.settled_ids ?? []);
  }
  next.battle = structuredClone(before.battle ?? { current: null, settled_ids: [] });
  return next;
}
