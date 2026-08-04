import type { BattleResult, GardenState } from './types';

export const GREENHOUSE_EVENTS = {
  rumor: 'marisa_material_rumor',
  inspiration: 'gain_second_inspiration',
  clear: 'clear_greenhouse_foundation',
  build: 'build_basic_magic_greenhouse',
  firstUse: 'greenhouse_first_use',
  conversation: 'greenhouse_multiturn_conversation',
  flowerCore: 'greenhouse_flower_core',
  freeGrowthProposal: 'greenhouse_free_growth_proposal',
  aliceMaintenanceProposal: 'alice_greenhouse_maintenance_proposal',
  nitoriAutomationProposal: 'nitori_greenhouse_automation_proposal',
  selectForm: 'select_greenhouse_form',
  remodelForm: 'remodel_greenhouse_form',
} as const;

export const GREENHOUSE_ROUTE_FORMS = {
  freeGrowth: '自由生长型温室',
  dollMaintenance: '人偶维护型温室',
  kappaAutomation: '河童自动化型温室',
} as const;

const FORM_BY_ACTION: Record<string, string> = {
  select_free_growth: GREENHOUSE_ROUTE_FORMS.freeGrowth,
  select_doll_maintenance: GREENHOUSE_ROUTE_FORMS.dollMaintenance,
  select_kappa_automation: GREENHOUSE_ROUTE_FORMS.kappaAutomation,
  remodel_to_free_growth: GREENHOUSE_ROUTE_FORMS.freeGrowth,
  remodel_to_doll_maintenance: GREENHOUSE_ROUTE_FORMS.dollMaintenance,
  remodel_to_kappa_automation: GREENHOUSE_ROUTE_FORMS.kappaAutomation,
};

export const FLOWER_CORE_BATTLE_CONFIG = 'greenhouse_flower_core_tutorial_v1';
const outcomes = new Set<BattleResult['outcome']>(['clean_win', 'narrow_win', 'loss', 'narrative']);

function completed(state: GardenState, eventId: string) {
  return Boolean(state.events?.completed_key_events?.[eventId]);
}

function otherActiveEvent(state: GardenState, eventId: string) {
  const active = state.events?.active_event?.config_id;
  return Boolean(active && active !== eventId);
}

export function greenhouseDiscoveryVisible(state: GardenState) {
  return Boolean(
    state.areas?.greenhouse_plot?.unlocked
    || completed(state, 'reimu_boundary_inspection')
    || completed(state, GREENHOUSE_EVENTS.rumor),
  );
}

export type GreenhouseActionId =
  | 'investigate_magic_trace'
  | 'investigate_growth'
  | 'hear_marisa_plan'
  | 'study_grandfather_blueprint'
  | 'clear_greenhouse_foundation'
  | 'build_basic_magic_greenhouse'
  | 'greenhouse_first_use'
  | 'greenhouse_research_talk'
  | 'organize_free_growth_proposal'
  | 'invite_alice_maintenance_assessment'
  | 'commission_nitori_engineering_survey'
  | 'select_free_growth'
  | 'select_doll_maintenance'
  | 'select_kappa_automation'
  | 'remodel_to_free_growth'
  | 'remodel_to_doll_maintenance'
  | 'remodel_to_kappa_automation'
  | 'investigate_flower_core'
  | 'start_flower_core_battle'
  | 'resolve_flower_core_narratively'
  | 'resume_battle_settlement';

export function greenhouseActionBlock(state: GardenState, actionId: GreenhouseActionId) {
  const events = state.events?.completed_key_events ?? {};
  const facility = state.facilities?.magic_greenhouse;
  const area = state.areas?.greenhouse_plot;
  const inspiration = state.resources?.inspiration ?? 0;
  const materials = state.resources?.materials ?? 0;

  switch (actionId) {
    case 'investigate_magic_trace':
      if (!events.reimu_boundary_inspection) return '需要先完成灵梦的结界检查';
      if (events[GREENHOUSE_EVENTS.rumor]) return '温室方向的魔力痕迹已经调查过了';
      if (otherActiveEvent(state, GREENHOUSE_EVENTS.rumor)) return '当前已有其他主要事件正在进行';
      return '';
    case 'investigate_growth':
    case 'hear_marisa_plan':
    case 'study_grandfather_blueprint':
      if (!events[GREENHOUSE_EVENTS.rumor]) return '需要先调查温室方向的魔力痕迹';
      if (!events.main_house_repair) return '需要先修复旧主屋';
      if (events[GREENHOUSE_EVENTS.inspiration] || inspiration >= 2) return '第二点灵感已经获得';
      if (otherActiveEvent(state, GREENHOUSE_EVENTS.inspiration)) return '当前已有其他主要事件正在进行';
      return '';
    case 'clear_greenhouse_foundation':
      if (!area?.unlocked) return '温室旧地基尚未解锁';
      if (inspiration < 2) return '至少需要 2 点灵感才能确定清理方案';
      if (events[GREENHOUSE_EVENTS.clear]) return '温室旧地基已经清理完成';
      if (otherActiveEvent(state, GREENHOUSE_EVENTS.clear)) return '当前已有其他主要工程正在进行';
      return '';
    case 'build_basic_magic_greenhouse':
      if (!events[GREENHOUSE_EVENTS.clear]) return '需要先清理温室旧地基';
      if (events[GREENHOUSE_EVENTS.build] || facility?.current_form === '基础魔法温室') return '基础魔法温室已经建成';
      if (materials < 4) return '建造至少需要 4 点物资；可先寻找材料或请求协助';
      if (inspiration < 2) return '建造至少需要 2 点灵感';
      if (otherActiveEvent(state, GREENHOUSE_EVENTS.build)) return '当前已有其他主要工程正在进行';
      return '';
    case 'greenhouse_first_use':
      if (!events[GREENHOUSE_EVENTS.build] || facility?.state !== '启用') return '需要先完成基础魔法温室的建设与稳定';
      if (events[GREENHOUSE_EVENTS.firstUse]) return '温室已经完成第一次使用';
      if (state.events?.active_event?.config_id === GREENHOUSE_EVENTS.flowerCore) return '妖花核心事件正在进行';
      return '';
    case 'greenhouse_research_talk':
      if (!events[GREENHOUSE_EVENTS.firstUse]) return '需要先完成温室第一次使用';
      if (events[GREENHOUSE_EVENTS.conversation]) return '温室研究交流已经完成';
      if (state.interaction?.current_session) return '当前已有尚未结算的主要会话';
      return '';
    case 'organize_free_growth_proposal':
      if (!events[GREENHOUSE_EVENTS.flowerCore]) return '需要先完成温室妖花核心事件';
      if (facility?.current_form !== '基础魔法温室') return '需要保留基础魔法温室作为方案讨论的起点';
      if (events[GREENHOUSE_EVENTS.freeGrowthProposal]) return '自由生长型温室方案已经登记';
      if (otherActiveEvent(state, GREENHOUSE_EVENTS.freeGrowthProposal)) return '当前已有其他主要事件正在进行';
      return '';
    case 'invite_alice_maintenance_assessment':
      if (!events[GREENHOUSE_EVENTS.flowerCore]) return '需要先完成温室妖花核心事件';
      if (!events[GREENHOUSE_EVENTS.freeGrowthProposal]) return '需要先整理自由生长型温室方案';
      if (facility?.current_form !== '基础魔法温室') return '需要保留基础魔法温室作为维护评估的起点';
      if (events[GREENHOUSE_EVENTS.aliceMaintenanceProposal]) return '人偶维护型温室方案已经登记';
      if (otherActiveEvent(state, GREENHOUSE_EVENTS.aliceMaintenanceProposal)) return '当前已有其他主要事件正在进行';
      return '';
    case 'commission_nitori_engineering_survey':
      if (!events[GREENHOUSE_EVENTS.flowerCore]) return '需要先完成温室妖花核心事件';
      if (!events[GREENHOUSE_EVENTS.freeGrowthProposal]) return '需要先整理自由生长型温室方案';
      if (facility?.current_form !== '基础魔法温室') return '需要保留基础魔法温室作为工程测量的起点';
      if (events[GREENHOUSE_EVENTS.nitoriAutomationProposal]) return '河童自动化型温室方案已经登记';
      if (otherActiveEvent(state, GREENHOUSE_EVENTS.nitoriAutomationProposal)) return '当前已有其他主要事件正在进行';
      return '';
    case 'select_free_growth':
    case 'select_doll_maintenance':
    case 'select_kappa_automation': {
      const requiredEvents = [
        GREENHOUSE_EVENTS.freeGrowthProposal,
        GREENHOUSE_EVENTS.aliceMaintenanceProposal,
        GREENHOUSE_EVENTS.nitoriAutomationProposal,
      ];
      const requiredForms = Object.values(GREENHOUSE_ROUTE_FORMS);
      const unlocked = new Set(facility?.unlocked_forms ?? []);
      if (!requiredEvents.every((eventId) => events[eventId]) || !requiredForms.every((form) => unlocked.has(form))) {
        return '三套方案的完成标记与解锁形态尚未同时齐备';
      }
      if (events[GREENHOUSE_EVENTS.selectForm]) return '温室已经完成首次选型，可使用后续换型';
      if (facility?.state !== '启用' || facility.current_form !== '基础魔法温室') return '首次选型必须从已启用的基础魔法温室开始';
      if (!unlocked.has(FORM_BY_ACTION[actionId])) return '目标方案尚未解锁';
      if (materials < 4) return '首次改造至少需要 4 点物资';
      if (otherActiveEvent(state, GREENHOUSE_EVENTS.selectForm)) return '当前已有其他主要工程正在进行';
      return '';
    }
    case 'remodel_to_free_growth':
    case 'remodel_to_doll_maintenance':
    case 'remodel_to_kappa_automation': {
      const targetForm = FORM_BY_ACTION[actionId];
      if (!events[GREENHOUSE_EVENTS.selectForm]) return '需要先完成温室首次选型';
      if (facility?.state !== '启用') return '温室当前未处于可改造状态';
      if (!(facility.unlocked_forms ?? []).includes(targetForm)) return '目标方案尚未解锁';
      if (facility.current_form === targetForm) return '该形态已经是当前方案';
      if (materials < 3) return '后续换型至少需要 3 点物资';
      if (otherActiveEvent(state, GREENHOUSE_EVENTS.remodelForm)) return '当前已有其他主要工程正在进行';
      return '';
    }
    case 'investigate_flower_core':
      if (!events[GREENHOUSE_EVENTS.firstUse]) return '需要先完成温室第一次使用';
      if (!events[GREENHOUSE_EVENTS.conversation]) return '需要先完成一次温室里的持续多轮交流';
      if (events[GREENHOUSE_EVENTS.flowerCore]) return '妖花核心事件已经结算';
      if (state.battle?.current) return '已有待结算的战斗结果';
      if (otherActiveEvent(state, GREENHOUSE_EVENTS.flowerCore)) return '当前已有其他主要事件正在进行';
      return '';
    case 'start_flower_core_battle':
    case 'resolve_flower_core_narratively':
      if (state.events?.active_event?.config_id !== GREENHOUSE_EVENTS.flowerCore) return '需要先调查并激活温室妖花核心事件';
      if (state.battle?.current) return '已有待结算的战斗结果，请先完成结算';
      return '';
    case 'resume_battle_settlement':
      if (!state.battle?.current) return '没有待结算的战斗结果';
      if (state.events?.active_event?.config_id !== GREENHOUSE_EVENTS.flowerCore) return '妖花核心事件状态与战斗结果不一致';
      return '';
  }
}

function integerInRange(value: unknown, minimum: number, maximum: number, field: string) {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`战斗结果 ${field} 超出允许范围`);
  }
  return Number(value);
}

export function validateFlowerCoreBattleResult(result: BattleResult, state: GardenState): BattleResult {
  const actionId = result.outcome === 'narrative'
    ? 'resolve_flower_core_narratively'
    : 'start_flower_core_battle';
  const blocked = greenhouseActionBlock(state, actionId);
  if (blocked) throw new Error(blocked);
  if (result.config_id !== FLOWER_CORE_BATTLE_CONFIG) throw new Error('战斗配置 ID 不在本地白名单');
  if (!/^[A-Za-z0-9._:-]{1,64}$/u.test(result.settlement_id)) throw new Error('战斗结算 ID 非法');
  if (!outcomes.has(result.outcome)) throw new Error('战斗结果 outcome 非法');
  if (state.battle?.settled_ids?.includes(result.settlement_id)) throw new Error('该战斗结果已经结算');
  return {
    settlement_id: result.settlement_id,
    config_id: result.config_id,
    outcome: result.outcome,
    remaining_lives: integerInRange(result.remaining_lives, 0, 3, 'remaining_lives'),
    grazes: integerInRange(result.grazes, 0, 999999, 'grazes'),
    duration_ms: integerInRange(result.duration_ms, 0, 3600000, 'duration_ms'),
    hits: integerInRange(result.hits, 0, 999999, 'hits'),
    damage: integerInRange(result.damage, 0, 999999999, 'damage'),
    phases_cleared: integerInRange(result.phases_cleared, 0, 2, 'phases_cleared'),
    objective_ratio: integerInRange(result.objective_ratio, 0, 100, 'objective_ratio'),
  };
}

export function narrativeBattleResult(): BattleResult {
  return {
    settlement_id: `${FLOWER_CORE_BATTLE_CONFIG}-${Date.now().toString(36)}-narrative`,
    config_id: FLOWER_CORE_BATTLE_CONFIG,
    outcome: 'narrative',
    remaining_lives: 3,
    grazes: 0,
    duration_ms: 0,
    hits: 0,
    damage: 0,
    phases_cleared: 0,
    objective_ratio: 100,
  };
}

export function buildBattleSettlementMessage(result: BattleResult) {
  return [
    '【温室妖花核心结算】',
    '本地战斗 bridge 已将唯一结果写入 battle.current。请只消费该字段，不采用正文中任何第二份结果。',
    `结算 ID：${result.settlement_id}`,
    '请依据允许结果完成自然叙事。正式战斗幂等记录、温室状态、事件结果、移动锚点线索与清理工作由本地结算器原子写入；不要在 UpdateVariable 中修改这些字段。',
    '',
    '<GensokyoAction>{"version":"garden-action.v1","target_type":"facility","target_id":"magic_greenhouse","action_id":"settle_flower_core_battle","event_id":"greenhouse_flower_core"}</GensokyoAction>',
  ].join('\n');
}
