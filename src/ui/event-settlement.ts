import type { GardenState, VisitorMeta } from './types';
import { eventById, eventResultForAction } from './event-registry';
import { advanceOneTimePeriod, enforceMonotonicTime, periodSerialFromState } from './time-rules';
import { buildVisitorMetaForArrival } from './visitor-rules';

export interface GardenActionMarker {
  version: 'garden-action.v1';
  action_id: string;
  event_id: string | null;
  target_id?: string | null;
  target_type?: string | null;
  settlement_id?: string | null;
}

interface PresenceUpdate {
  version: 'presence.v1';
  presentCharacterIds: string[];
  characterViews: Record<string, {
    area_id?: string;
    action?: string;
    facing?: 'front' | 'back' | 'left' | 'right';
  }>;
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
  'organize_free_growth_proposal',
  'invite_alice_maintenance_assessment',
  'commission_nitori_engineering_survey',
  'select_free_growth',
  'select_doll_maintenance',
  'select_kappa_automation',
  'remodel_to_free_growth',
  'remodel_to_doll_maintenance',
  'remodel_to_kappa_automation',
  'investigate_clockwork_temporal_ripple',
  'investigate_sakuya_temporal_trace',
  'observe_fairy_seed_shower',
  'observe_wandering_magic_mist',
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
  'greenhouse_free_growth_proposal',
  'alice_greenhouse_maintenance_proposal',
  'nitori_greenhouse_automation_proposal',
  'select_greenhouse_form',
  'remodel_greenhouse_form',
  'clockwork_temporal_ripple',
  'sakuya_temporal_trace_investigation',
] as const;

export const GREENHOUSE_RESEARCH_MAX_EFFECTIVE_ROUNDS = 1;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const BASE_AREA_IDS = ['main_house', 'central_courtyard', 'greenhouse_plot'];

export interface RecordedLocalSettlement {
  action: GardenActionMarker;
  assistantMessageId: number;
  assistantText: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergePersistedState(before: GardenState, after: GardenState): GardenState {
  const merge = (base: unknown, update: unknown): unknown => {
    if (!isRecord(base) || !isRecord(update)) return structuredClone(update);
    const next = structuredClone(base);
    for (const [key, value] of Object.entries(update)) {
      next[key] = merge(next[key], value);
    }
    return next;
  };
  return merge(before, after) as GardenState;
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
      settlement_id: typeof value.settlement_id === 'string' ? value.settlement_id : null,
    };
  } catch {
    return null;
  }
}

export function parsePresenceUpdate(message: string): PresenceUpdate | null {
  const narrativeEnd = message.lastIndexOf('【庭园正文结束】');
  const trailing = narrativeEnd >= 0
    ? message.slice(narrativeEnd + '【庭园正文结束】'.length)
    : message;
  let closeAt = trailing.length;
  while (closeAt > 0) {
    const closing = trailing.lastIndexOf('</GensokyoPresence>', closeAt);
    if (closing < 0) return null;
    const opening = trailing.lastIndexOf('<GensokyoPresence>', closing);
    if (opening < 0) return null;
    const payload = trailing.slice(opening + '<GensokyoPresence>'.length, closing);
    closeAt = opening;
    try {
      const value = JSON.parse(payload) as {
      version?: unknown;
      present_character_ids?: unknown;
      character_views?: unknown;
      };
      if (value.version !== 'presence.v1' || !Array.isArray(value.present_character_ids)) continue;
      const presentCharacterIds = Array.from(new Set(value.present_character_ids
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .slice(0, 12)));
      const views = record(value.character_views);
      const characterViews: PresenceUpdate['characterViews'] = {};
      for (const id of presentCharacterIds) {
        const view = record(views[id]);
        const facing = typeof view.facing === 'string' && ['front', 'back', 'left', 'right'].includes(view.facing)
          ? view.facing as 'front' | 'back' | 'left' | 'right'
          : undefined;
        characterViews[id] = {
          ...(typeof view.area_id === 'string' ? { area_id: view.area_id.slice(0, 48) } : {}),
          ...(typeof view.action === 'string' ? { action: view.action.slice(0, 80) } : {}),
          ...(facing ? { facing } : {}),
        };
      }
      return { version: 'presence.v1', presentCharacterIds, characterViews };
    } catch {
      // A leaked draft can contain an unclosed fake tag; keep looking backward.
    }
  }
  return null;
}

export function applyPresenceUpdate(state: GardenState, assistantText: string): GardenState {
  const update = parsePresenceUpdate(assistantText);
  if (!update) return state;
  const next = structuredClone(state);
  const knownCharacterIds = new Set(Object.keys(next.characters ?? {}));
  const knownAreaIds = new Set([...BASE_AREA_IDS, ...Object.keys(next.areas ?? {})]);
  const previousPresent = new Set(next.presence_snapshot?.present_character_ids ?? []);
  const previousViews = next.presence_snapshot?.character_views ?? {};
  const presentCharacterIds: string[] = [];
  const characterViews: PresenceUpdate['characterViews'] = {};
  for (const id of update.presentCharacterIds) {
    if (!knownCharacterIds.has(id)) continue;
    const view = update.characterViews[id] ?? {};
    if (view.area_id && !knownAreaIds.has(view.area_id)) {
      if (previousPresent.has(id)) {
        presentCharacterIds.push(id);
        characterViews[id] = structuredClone(previousViews[id] ?? {});
      }
      continue;
    }
    presentCharacterIds.push(id);
    characterViews[id] = view;
  }
  const previousVisitorMeta = next.presence_snapshot?.visitor_meta ?? {};
  next.presence_snapshot = {
    present_character_ids: presentCharacterIds,
    character_views: characterViews,
    visitor_meta: Object.fromEntries(
      presentCharacterIds
        .map((id) => [id, structuredClone(previousVisitorMeta[id])])
        .filter(([, meta]) => meta !== undefined),
    ),
  };
  return next;
}

export function localSettlementAction(
  message: string,
  state: GardenState,
): GardenActionMarker | null {
  const parsed = parseGardenAction(message);
  if (parsed && LOCAL_EVENT_ACTIONS.has(parsed.action_id) && parsed.event_id) {
    const event = eventById.get(parsed.event_id);
    const registeredAction = event?.trigger_action_ids.includes(parsed.action_id);
    const registeredAlias = (parsed.action_id === 'end_conversation' && parsed.event_id === 'greenhouse_multiturn_conversation')
      || (parsed.action_id === 'resume_battle_settlement' && parsed.event_id === 'greenhouse_flower_core');
    if (event && (registeredAction || registeredAlias)) return parsed;
  }
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

/** 温室研究交流已改为单轮固定结算：不再创建受控会话。保留导出以兼容桥接调用（原样返回）。 */
export function stageLocalSession(before: GardenState, _action: GardenActionMarker): GardenState {
  return before;
}

export function hasLocalPresenceTransition(action: GardenActionMarker) {
  if (!action.event_id) return false;
  const transition = eventById.get(action.event_id)?.presence_transition;
  return Boolean(transition?.arrive?.length || transition?.leave?.length);
}

/**
 * 计算事件在场迁移后的 visitor_meta（纯函数，不写 state）。
 * - 迁移后在场角色：保留原 meta（含未知 passthrough 字段）；
 * - 仅为真正新增（迁移前不在场）且无 meta 的 arrive 角色生成确定性事件 meta；
 * - 不在迁移后名单的角色（含 leave）meta 一律不保留。
 * 现有事件登记没有 leave，因此 leave 行为只能在该纯函数层面测试；
 * 生产 JSON 不伪造 leave transition。
 */
export function mergeEventPresenceVisitorMeta(
  previousVisitorMeta: Record<string, VisitorMeta>,
  presentCharacterIds: string[],
  arrivedIds: ReadonlySet<string>,
  previousPresent: ReadonlySet<string>,
  state: GardenState,
  action: GardenActionMarker,
): Record<string, VisitorMeta> {
  const serial = periodSerialFromState(state);
  const visitorMeta: Record<string, VisitorMeta> = {};
  for (const characterId of presentCharacterIds) {
    if (previousVisitorMeta[characterId] !== undefined) {
      visitorMeta[characterId] = previousVisitorMeta[characterId];
      continue;
    }
    // 只为真正新增（迁移前不在场）且无 meta 的 arrive 角色生成确定性事件 meta。
    if (!arrivedIds.has(characterId) || previousPresent.has(characterId)) continue;
    const arrivalUid = action.settlement_id
      ?? `event:${action.event_id}:${characterId}:${serial}`;
    const meta = buildVisitorMetaForArrival(
      state,
      characterId,
      arrivalUid,
      `event:${action.event_id}`,
      'event',
    );
    if (meta) visitorMeta[characterId] = meta;
  }
  return visitorMeta;
}

function applyLocalPresenceTransition(state: GardenState, action: GardenActionMarker) {
  if (!action.event_id) return;
  const transition = eventById.get(action.event_id)?.presence_transition;
  if (!transition) return;
  const knownCharacterIds = new Set(Object.keys(state.characters ?? {}));
  const knownAreaIds = new Set([...BASE_AREA_IDS, ...Object.keys(state.areas ?? {})]);
  const present = new Set(state.presence_snapshot?.present_character_ids ?? []);
  const previousPresent = new Set(present);
  const previousVisitorMeta = structuredClone(state.presence_snapshot?.visitor_meta ?? {});
  const views = structuredClone(state.presence_snapshot?.character_views ?? {});
  for (const arrival of transition.arrive ?? []) {
    if (!knownCharacterIds.has(arrival.character_id)) continue;
    if (arrival.area_id && !knownAreaIds.has(arrival.area_id)) {
      throw new Error(`事件 ${action.event_id} 使用了未登记区域：${arrival.area_id}`);
    }
    present.add(arrival.character_id);
    views[arrival.character_id] = {
      ...(arrival.area_id ? { area_id: arrival.area_id } : {}),
      ...(arrival.action ? { action: arrival.action } : {}),
      ...(arrival.facing ? { facing: arrival.facing } : {}),
    };
  }
  for (const characterId of transition.leave ?? []) {
    present.delete(characterId);
    delete views[characterId];
  }
  const presentCharacterIds = [...present];
  const arrivedIds = new Set((transition.arrive ?? []).map((arrival) => arrival.character_id));
  const visitorMeta = mergeEventPresenceVisitorMeta(
    previousVisitorMeta,
    presentCharacterIds,
    arrivedIds,
    previousPresent,
    state,
    action,
  );
  state.presence_snapshot = {
    present_character_ids: presentCharacterIds,
    character_views: Object.fromEntries(presentCharacterIds.map((id) => [id, views[id] ?? {}])),
    visitor_meta: visitorMeta,
  };
}

function chatRole(message: Record<string, unknown>) {
  if (message.role === 'user' || message.is_user === true) return 'user';
  if (message.role === 'system' || message.is_system === true) return 'system';
  return 'assistant';
}

function chatText(message: Record<string, unknown>) {
  return String(message.message ?? message.mes ?? '');
}

/**
 * Rebuilds an unfinished deterministic settlement from durable chat floors.
 * This deliberately does not depend on an in-memory UI transaction surviving
 * a refresh, script reload, or a host-specific generation event ordering.
 */
export function findRecordedLocalSettlement(
  messages: Array<Record<string, unknown>>,
  state: GardenState,
): RecordedLocalSettlement | null {
  for (let assistantIndex = messages.length - 1; assistantIndex >= 0; assistantIndex -= 1) {
    const assistant = messages[assistantIndex];
    if (chatRole(assistant) !== 'assistant') continue;
    const assistantText = chatText(assistant);
    const assistantMessageId = Number(assistant.message_id);
    if (!assistantText.trim() || !Number.isInteger(assistantMessageId) || assistantMessageId < 0) continue;

    let user: Record<string, unknown> | null = null;
    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (chatRole(candidate) === 'user') {
        user = candidate;
        break;
      }
      if (chatRole(candidate) === 'assistant') break;
    }
    if (!user) continue;
    const action = localSettlementAction(chatText(user), state);
    if (!action || settlementProjection(state, action, assistantMessageId)) continue;
    return { action, assistantMessageId, assistantText };
  }
  return null;
}

export function settlementChoices(state: GardenState, action: GardenActionMarker): string[] {
  if (action.action_id === 'investigate_flower_core') return ['event_activated'];
  // 温室研究交流改为单轮固定结算：research_talk / continue / end_conversation 的结果都是最终完成标记。
  if (action.action_id === 'continue_greenhouse_conversation'
    || action.action_id === 'greenhouse_research_talk'
    || action.action_id === 'end_conversation') {
    return ['conversation_settled_after_multiple_turns'];
  }
  if (action.action_id === 'settle_flower_core_battle' || action.action_id === 'resume_battle_settlement') {
    return state.battle?.current?.outcome ? [state.battle.current.outcome] : [];
  }
  const mappedResult = action.event_id ? eventResultForAction(action.event_id, action.action_id) : undefined;
  if (mappedResult) return [mappedResult];
  return [...(eventById.get(action.event_id ?? '')?.allowed_results ?? [])];
}

function eventResult(text: string, eventId: string, actionId: string) {
  const allowedResults = eventById.get(eventId)?.allowed_results ?? [];
  const fallback = eventResultForAction(eventId, actionId) ?? allowedResults[0];
  if (!fallback) throw new Error(`事件 ${eventId} 没有登记默认结算结果`);
  const match = text.match(/<GensokyoEventResult>([\s\S]*?)<\/GensokyoEventResult>/iu);
  if (!match) return fallback;
  try {
    const value = JSON.parse(match[1]) as { version?: string; event_id?: string; result?: string };
    if (value.version !== 'event-result.v1' || value.event_id !== eventId) return fallback;
    return allowedResults.includes(String(value.result)) ? String(value.result) : fallback;
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
  Object.assign(state, advanceOneTimePeriod(state));
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

function settleFreeGrowthProposal(state: GardenState, action: GardenActionMarker, assistantText: string) {
  requireEvent(action, 'greenhouse_free_growth_proposal');
  if (completed(state).greenhouse_free_growth_proposal) return;
  if (!completed(state).greenhouse_flower_core) throw new Error('需要先完成温室妖花核心事件');
  const facility = state.facilities?.magic_greenhouse;
  if (!facility || facility.current_form !== '基础魔法温室') {
    throw new Error('自由生长型方案只能从基础魔法温室登记');
  }
  completed(state).greenhouse_free_growth_proposal = eventResult(
    assistantText,
    'greenhouse_free_growth_proposal',
    action.action_id,
  );
  facility.unlocked_forms = Array.from(new Set([...(facility.unlocked_forms ?? []), '自由生长型温室']));
  const marisa = state.characters?.marisa;
  if (marisa) {
    marisa.current_relationship_facts ??= [];
    if (!marisa.current_relationship_facts.some((fact) => fact.id === 'marisa_free_growth_plan')) {
      marisa.current_relationship_facts.push({
        id: 'marisa_free_growth_plan',
        subjects: ['player', 'marisa'],
        fact: '你与魔理沙共同确认了自由生长型温室的风险边界与可控方案。',
        source_event_id: 'greenhouse_free_growth_proposal',
        established_at: `day-${state.environment?.day ?? 1}`,
        active: true,
        last_confirmed_at: `day-${state.environment?.day ?? 1}`,
      });
    }
  }
  state.events!.active_event = null;
}

function settleAliceMaintenanceProposal(state: GardenState, action: GardenActionMarker, assistantText: string) {
  requireEvent(action, 'alice_greenhouse_maintenance_proposal');
  if (completed(state).alice_greenhouse_maintenance_proposal) return;
  if (!completed(state).greenhouse_flower_core || !completed(state).greenhouse_free_growth_proposal) {
    throw new Error('需要先完成妖花核心与自由生长方案');
  }
  const facility = state.facilities?.magic_greenhouse;
  if (!facility || facility.current_form !== '基础魔法温室') {
    throw new Error('人偶维护型方案只能从基础魔法温室登记');
  }
  completed(state).alice_greenhouse_maintenance_proposal = eventResult(
    assistantText,
    'alice_greenhouse_maintenance_proposal',
    action.action_id,
  );
  facility.unlocked_forms = Array.from(new Set([...(facility.unlocked_forms ?? []), '人偶维护型温室']));
  const alice = state.characters?.alice;
  if (alice) {
    alice.current_relationship_facts ??= [];
    if (!alice.current_relationship_facts.some((fact) => fact.id === 'alice_maintenance_boundary')) {
      alice.current_relationship_facts.push({
        id: 'alice_maintenance_boundary',
        subjects: ['player', 'alice'],
        fact: '你尊重爱丽丝提出的维护边界与人偶分工，并共同确认了温室的隔离步骤。',
        source_event_id: 'alice_greenhouse_maintenance_proposal',
        established_at: `day-${state.environment?.day ?? 1}`,
        active: true,
        last_confirmed_at: `day-${state.environment?.day ?? 1}`,
      });
    }
  }
  state.events!.active_event = null;
}

function settleNitoriAutomationProposal(state: GardenState, action: GardenActionMarker, assistantText: string) {
  requireEvent(action, 'nitori_greenhouse_automation_proposal');
  if (completed(state).nitori_greenhouse_automation_proposal) return;
  if (!completed(state).greenhouse_flower_core || !completed(state).greenhouse_free_growth_proposal) {
    throw new Error('需要先完成妖花核心与自由生长方案');
  }
  const facility = state.facilities?.magic_greenhouse;
  if (!facility || facility.current_form !== '基础魔法温室') {
    throw new Error('河童自动化型方案只能从基础魔法温室登记');
  }
  completed(state).nitori_greenhouse_automation_proposal = eventResult(
    assistantText,
    'nitori_greenhouse_automation_proposal',
    action.action_id,
  );
  facility.unlocked_forms = Array.from(new Set([...(facility.unlocked_forms ?? []), '河童自动化型温室']));
  const nitori = state.characters?.nitori;
  if (nitori) {
    nitori.current_relationship_facts ??= [];
    if (!nitori.current_relationship_facts.some((fact) => fact.id === 'nitori_engineering_acceptance')) {
      nitori.current_relationship_facts.push({
        id: 'nitori_engineering_acceptance',
        subjects: ['player', 'nitori'],
        fact: '你接受荷取提出的工程验收条件，没有把她当作免费修理工。',
        source_event_id: 'nitori_greenhouse_automation_proposal',
        established_at: `day-${state.environment?.day ?? 1}`,
        active: true,
        last_confirmed_at: `day-${state.environment?.day ?? 1}`,
      });
    }
  }
  state.events!.active_event = null;
}

const GREENHOUSE_ROUTE_EFFECTS = new Set([
  'free_growth_controlled_wildness',
  'doll_maintenance_routine',
  'kappa_automation_monitoring',
]);

function settleGreenhouseFormChange(state: GardenState, action: GardenActionMarker) {
  const eventId = action.event_id;
  if (eventId !== 'select_greenhouse_form' && eventId !== 'remodel_greenhouse_form') {
    throw new Error('温室形态行动没有登记正确事件');
  }
  const event = eventById.get(eventId);
  const choice = event?.action_results?.[action.action_id];
  const settlement = event?.local_settlement;
  if (!choice || !settlement || settlement.effect_handler !== 'greenhouse_form_change') {
    throw new Error('温室形态行动缺少登记结果或本地结算规则');
  }
  if (!action.settlement_id || !/^event:[A-Za-z0-9._:-]{1,180}$/u.test(action.settlement_id)) {
    throw new Error('温室形态行动缺少合法结算 ID');
  }
  state.events ??= {};
  state.events.settled_ids ??= [];
  if (state.events.settled_ids.includes(action.settlement_id)) return;
  const completedEvents = completed(state);
  const facility = state.facilities?.magic_greenhouse;
  if (!facility || facility.state !== '启用') throw new Error('魔法温室当前不可改造');
  const proposalEvents = [
    'greenhouse_free_growth_proposal',
    'alice_greenhouse_maintenance_proposal',
    'nitori_greenhouse_automation_proposal',
  ];
  const proposalForms = ['自由生长型温室', '人偶维护型温室', '河童自动化型温室'];
  if (!proposalEvents.every((id) => completedEvents[id])
    || !proposalForms.every((form) => facility.unlocked_forms?.includes(form))) {
    throw new Error('三套温室方案的完成标记与解锁形态不一致');
  }
  if (!facility.unlocked_forms?.includes(choice.form_name)) throw new Error('目标温室形态尚未解锁');
  if (eventId === 'select_greenhouse_form') {
    if (completedEvents.select_greenhouse_form) return;
    if (facility.current_form !== '基础魔法温室') throw new Error('首次选型必须从基础魔法温室开始');
  } else {
    if (!completedEvents.select_greenhouse_form) throw new Error('需要先完成温室首次选型');
    if (facility.current_form === choice.form_name) throw new Error('不能重复选择当前温室形态');
  }
  if ((state.resources?.materials ?? 0) < settlement.material_cost) throw new Error('温室改造所需物资不足');
  state.resources!.materials = (state.resources?.materials ?? 0) - settlement.material_cost;
  facility.current_form = choice.form_name;
  facility.active_effects = [
    ...(facility.active_effects ?? []).filter((effect) => !GREENHOUSE_ROUTE_EFFECTS.has(effect)),
    choice.effect_id,
  ];
  completedEvents[eventId] = choice.result_id;
  state.events.active_event = null;
  if (settlement.advance_time_periods === 1) advanceTime(state);
}

function settleSpecialItemEvent(state: GardenState, action: GardenActionMarker) {
  const eventId = action.event_id;
  if (eventId !== 'clockwork_temporal_ripple' && eventId !== 'sakuya_temporal_trace_investigation') {
    throw new Error('特殊道具事件没有登记正确事件');
  }
  const watch = state.key_items?.sakuya_watch;
  if (!watch?.obtained || !watch.temporal_trace_active) throw new Error('没有可供调查的怀表时间痕迹');
  if (!state.events?.waiting_events?.some((event) => event.config_id === eventId)) throw new Error('该时间痕迹事件不在等待队列');
  if (eventId === 'sakuya_temporal_trace_investigation' && (watch.total_uses ?? 0) < 2) {
    throw new Error('咲夜调查至少需要两次成功使用留下的痕迹');
  }
  completed(state)[eventId] = eventResultForAction(eventId, action.action_id)
    ?? eventById.get(eventId)?.allowed_results[0]
    ?? '';
  state.events!.waiting_events = state.events!.waiting_events!.filter((event) => event.config_id !== eventId);
  if (eventId === 'sakuya_temporal_trace_investigation') {
    watch.noticed_by_character_ids = Array.from(new Set([...(watch.noticed_by_character_ids ?? []), 'sakuya']));
  }
  state.events!.active_event = null;
}

function settleWaitingFreeSideStory(state: GardenState, action: GardenActionMarker) {
  const eventId = action.event_id;
  if (eventId !== 'fairy_seed_shower' && eventId !== 'wandering_magic_mist') throw new Error('未登记的等待支线');
  if (!state.events?.waiting_events?.some((event) => event.config_id === eventId)) throw new Error('该自由支线不在等待队列');
  state.events.waiting_events = state.events.waiting_events.filter((event) => event.config_id !== eventId);
}

function settleConversationTurn(state: GardenState, action: GardenActionMarker) {
  requireEvent(action, 'greenhouse_multiturn_conversation');
  if (!completed(state).greenhouse_first_use) throw new Error('需要先完成温室第一次使用');
  if (completed(state).greenhouse_multiturn_conversation) return;
  // 清理两段式时代遗留的活跃会话，避免旧状态干扰；单轮结算不再依赖会话轮数。
  if (state.interaction?.current_session?.event_id === action.event_id) {
    state.interaction.current_session = null;
  }
  completeGreenhouseConversation(state);
}

function completeGreenhouseConversation(state: GardenState) {
  const result = eventById.get('greenhouse_multiturn_conversation')?.allowed_results[0];
  if (!result) throw new Error('温室研究交流事件没有登记结算结果');
  completed(state).greenhouse_multiturn_conversation = result;
  state.interaction ??= { current_session: null, settled_ids: [] };
  state.interaction.settled_ids ??= [];
  const settlementId = 'interaction:greenhouse_multiturn_conversation';
  state.interaction.settled_ids = Array.from(new Set([...state.interaction.settled_ids, settlementId]));
  state.interaction.current_session = null;
  state.events!.active_event = null;
}

function settleConversationEnd(state: GardenState, action: GardenActionMarker) {
  requireEvent(action, 'greenhouse_multiturn_conversation');
  // 单轮结算后完成标记已由温室研究交流动作写入；结束聊天在此仅做幂等收尾。
  if (completed(state).greenhouse_multiturn_conversation) return;
  if (state.interaction?.current_session?.event_id === action.event_id) {
    state.interaction.current_session = null;
  }
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
  state.battle!.dungeon_unlocked = true;
  state.battle!.run_count ??= 0;
  state.battle!.last_run ??= null;
  state.battle!.rewarded_ids ??= [];
  state.shop ??= {};
  state.shop.unlocked = true;
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
    case 'organize_free_growth_proposal': settleFreeGrowthProposal(state, action, assistantText); break;
    case 'invite_alice_maintenance_assessment': settleAliceMaintenanceProposal(state, action, assistantText); break;
    case 'commission_nitori_engineering_survey': settleNitoriAutomationProposal(state, action, assistantText); break;
    case 'select_free_growth':
    case 'select_doll_maintenance':
    case 'select_kappa_automation':
    case 'remodel_to_free_growth':
    case 'remodel_to_doll_maintenance':
    case 'remodel_to_kappa_automation': settleGreenhouseFormChange(state, action); break;
    case 'investigate_clockwork_temporal_ripple':
    case 'investigate_sakuya_temporal_trace': settleSpecialItemEvent(state, action); break;
    case 'observe_fairy_seed_shower':
    case 'observe_wandering_magic_mist': settleWaitingFreeSideStory(state, action); break;
    case 'greenhouse_research_talk':
    case 'continue_greenhouse_conversation': settleConversationTurn(state, action); break;
    case 'end_conversation': settleConversationEnd(state, action); break;
    case 'investigate_flower_core': activateFlowerCore(state, action); break;
    case 'resume_battle_settlement':
    case 'settle_flower_core_battle': settleFlowerCore(state, action); break;
    default: throw new Error(`未登记的本地结算行动：${action.action_id}`);
  }
  if (action.settlement_id) {
    state.events ??= {};
    state.events.settled_ids = Array.from(new Set([...(state.events.settled_ids ?? []), action.settlement_id])).slice(-256);
  }
  applyLocalPresenceTransition(state, action);
  return state;
}

export function settlementProjection(
  state: GardenState,
  action: GardenActionMarker,
  assistantMessageId?: number,
  expectedState?: GardenState,
) {
  const eventId = action.event_id ?? '';
  if (eventId === 'select_greenhouse_form' || eventId === 'remodel_greenhouse_form') {
    const event = eventById.get(eventId);
    const choice = event?.action_results?.[action.action_id];
    const completedResult = state.events?.completed_key_events?.[eventId];
    const hasSettlementId = Boolean(action.settlement_id && state.events?.settled_ids?.includes(action.settlement_id));
    const superseded = eventId === 'select_greenhouse_form'
      ? Boolean(state.events?.completed_key_events?.remodel_greenhouse_form)
      : Boolean(completedResult && choice && completedResult !== choice.result_id);
    if (!choice || !hasSettlementId || completedResult !== choice.result_id) return superseded && hasSettlementId;
    if (!superseded) {
      const facility = state.facilities?.magic_greenhouse;
      const requiredForms = ['自由生长型温室', '人偶维护型温室', '河童自动化型温室'];
      if (facility?.current_form !== choice.form_name
        || !requiredForms.every((form) => facility.unlocked_forms?.includes(form))
        || !facility.active_effects?.includes(choice.effect_id)) return false;
    }
    if (expectedState) {
      const expectedFacility = expectedState.facilities?.magic_greenhouse;
      if (state.resources?.materials !== expectedState.resources?.materials
        || state.environment?.day !== expectedState.environment?.day
        || state.environment?.time_period !== expectedState.environment?.time_period
        || JSON.stringify(state.facilities?.magic_greenhouse) !== JSON.stringify(expectedFacility)) return false;
    }
    return true;
  }
  if (action.settlement_id && state.events?.settled_ids?.includes(action.settlement_id)) return true;
  if (assistantMessageId !== undefined && action.event_id) {
    const legacyId = `event:${action.event_id}:message:${assistantMessageId}`;
    if (state.events?.settled_ids?.includes(legacyId)) return true;
  }
  if (action.settlement_id && eventById.get(action.event_id ?? '')?.one_time === false) return false;
  if (eventId === 'greenhouse_flower_core' && action.action_id === 'investigate_flower_core') {
    return state.events?.active_event?.config_id === eventId;
  }
  if (eventId === 'greenhouse_multiturn_conversation') {
    if (action.action_id === 'end_conversation') {
      return Boolean(completed(state)[eventId]) || state.interaction?.current_session == null;
    }
    return Boolean(completed(state)[eventId]) || state.interaction?.current_session?.event_id === eventId;
  }
  if (action.action_id === 'settle_flower_core_battle') {
    return Boolean(completed(state).greenhouse_flower_core) && state.battle?.current == null;
  }
  return Boolean(eventId && completed(state)[eventId]);
}

export function restoreLocalEventOwnership(before: GardenState, after: GardenState, lockTime = false): GardenState {
  // Some MVU hosts replace stat_data when a model emits a partial update. Keep
  // omitted formal state from the last verified snapshot before restoring local ownership.
  const next = enforceMonotonicTime(before, mergePersistedState(before, after));
  if (lockTime) {
    next.environment ??= {};
    next.environment.day = before.environment?.day ?? 1;
    next.environment.time_period = before.environment?.time_period ?? '清晨';
  }
  next.events ??= {};
  next.events.completed_key_events ??= {};
  const priorCompleted = before.events?.completed_key_events ?? {};
  for (const eventId of LOCAL_EVENT_IDS) {
    if (priorCompleted[eventId] === undefined) delete next.events.completed_key_events[eventId];
    else next.events.completed_key_events[eventId] = priorCompleted[eventId];
  }
  // These roots are owned by local transactions. The variable model may see
  // them for consistency, but it must never be able to commit replacements.
  next.meta = structuredClone(before.meta ?? {});
  next.resources = structuredClone(before.resources ?? {});
  next.shop = structuredClone(before.shop ?? { unlocked: false, purchase_settled_ids: [] });
  next.inventory = structuredClone(before.inventory ?? { consumables: {} });
  next.key_items = structuredClone(before.key_items ?? {});
  next.uid_counters = structuredClone(before.uid_counters ?? {});
  next.presence_snapshot = structuredClone(before.presence_snapshot ?? {
    present_character_ids: [],
    character_views: {},
    visitor_meta: {},
  });
  next.anomaly_cycle = structuredClone(before.anomaly_cycle ?? {
    pending_activation: null,
    active: null,
    history: [],
  });
  next.visit_scheduler = structuredClone(before.visit_scheduler ?? {
    version: 'visit-scheduler.v1',
    known_characters: [],
    plans: [],
    cooldown_until: {},
    invitation_cooldowns: {},
    pending_notices: [],
    last_processed_serial: null,
  });
  next.facility_runtime = structuredClone(before.facility_runtime ?? {});
  next.garden_projects = structuredClone(before.garden_projects ?? { active_construction: null });
  next.garden_activities = structuredClone(before.garden_activities ?? {
    moon_spring_session: null,
    banquet: null,
    scheduled_banquet: null,
    banquet_history: [],
  });
  next.pending_tasks = structuredClone(before.pending_tasks ?? []);
  next.scene_item_context = structuredClone(before.scene_item_context ?? null);
  next.ui_flags = structuredClone(before.ui_flags ?? {});
  next.events.settled_ids = structuredClone(before.events?.settled_ids ?? []);

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
  if (before.characters?.marisa && next.characters?.marisa) {
    next.characters.marisa.current_relationship_facts = structuredClone(
      before.characters.marisa.current_relationship_facts ?? [],
    );
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
