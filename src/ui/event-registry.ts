import greenhouseEventsJson from '../lorebook/events/greenhouse-vertical-slice.json';
import greenhouseUpgradeRoutesJson from '../lorebook/events/greenhouse-upgrade-routes.json';
import freeSideStoriesJson from '../lorebook/events/free-side-stories.json';
import specialItemEventsJson from '../lorebook/events/special-item-events.json';

export type EventType = 'progression_fixed' | 'progression_session' | 'free_side_story' | 'ambient_interaction' | 'static_script' | 'deterministic_action';
type Facing = 'front' | 'back' | 'left' | 'right';

export interface RegisteredEvent {
  config_id: string;
  title: string;
  event_type: EventType;
  trigger_action_ids: string[];
  prerequisites: string[];
  blocks: string[];
  participants: string[];
  facility_id: string | null;
  priority: number;
  one_time: boolean;
  max_effective_rounds: number;
  projection_keys: string[];
  narrative_outline: string[];
  required_beats: string[];
  forbidden_deviations: string[];
  allowed_results: string[];
  action_results?: Record<string, {
    result_id: string;
    form_name: string;
    proposer_id: string;
    effect_id: string;
    fixed_ending: string;
  }>;
  local_settlement?: {
    effect_handler: string;
    material_cost: number;
    advance_time_periods: number;
  };
  downstream_unlocks: string[];
  failure_recovery: string;
  presence_transition?: {
    arrive?: Array<{
      character_id: string;
      area_id?: string;
      action?: string;
      facing?: Facing;
    }>;
    leave?: string[];
  };
}

const EVENT_TYPES = new Set<EventType>([
  'progression_fixed',
  'progression_session',
  'free_side_story',
  'ambient_interaction',
  'static_script',
  'deterministic_action',
]);
const FACINGS = new Set<Facing>(['front', 'back', 'left', 'right']);
const PROJECTION_KEYS = new Set([
  'environment',
  'environment.time_period',
  'presence_snapshot',
  'areas.main_house',
  'areas.greenhouse_plot',
  'resources',
  'resources.materials',
  'resources.inspiration',
  'facilities.magic_greenhouse',
  'interaction.current_session',
  'battle.current',
  'characters.marisa.current_relationship_facts',
  'characters.alice.current_relationship_facts',
  'characters.nitori.current_relationship_facts',
  'characters.sakuya.current_relationship_facts',
  'key_items.sakuya_watch',
  'events.waiting_events',
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 必须是非空字符串`);
  return value;
}

function stringArray(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是字符串数组`);
  const result = value.map((item, index) => stringValue(item, `${label}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`${label} 包含重复值`);
  return result;
}

function optionalPresenceTransition(value: unknown, label: string): RegisteredEvent['presence_transition'] {
  if (value === undefined) return undefined;
  const transition = record(value, label);
  const arrive = transition.arrive === undefined
    ? undefined
    : (() => {
      if (!Array.isArray(transition.arrive)) throw new Error(`${label}.arrive 必须是数组`);
      return transition.arrive.map((item, index) => {
        const arrival = record(item, `${label}.arrive[${index}]`);
        const facing = arrival.facing === undefined
          ? undefined
          : stringValue(arrival.facing, `${label}.arrive[${index}].facing`) as Facing;
        if (facing && !FACINGS.has(facing)) throw new Error(`${label}.arrive[${index}].facing 未登记`);
        return {
          character_id: stringValue(arrival.character_id, `${label}.arrive[${index}].character_id`),
          ...(arrival.area_id === undefined ? {} : { area_id: stringValue(arrival.area_id, `${label}.arrive[${index}].area_id`) }),
          ...(arrival.action === undefined ? {} : { action: stringValue(arrival.action, `${label}.arrive[${index}].action`) }),
          ...(facing ? { facing } : {}),
        };
      });
    })();
  const leave = transition.leave === undefined ? undefined : stringArray(transition.leave, `${label}.leave`);
  if (!arrive?.length && !leave?.length) throw new Error(`${label} 必须至少包含一次抵达或离场`);
  return { ...(arrive ? { arrive } : {}), ...(leave ? { leave } : {}) };
}

function optionalActionResults(
  value: unknown,
  label: string,
  triggerActionIds: string[],
  allowedResults: string[],
): RegisteredEvent['action_results'] {
  if (value === undefined) return undefined;
  const source = record(value, label);
  const result: NonNullable<RegisteredEvent['action_results']> = {};
  for (const [actionId, rawChoice] of Object.entries(source)) {
    if (!triggerActionIds.includes(actionId)) throw new Error(`${label}.${actionId} 不是已登记入口`);
    const choice = record(rawChoice, `${label}.${actionId}`);
    const resultId = stringValue(choice.result_id, `${label}.${actionId}.result_id`);
    if (!allowedResults.includes(resultId)) throw new Error(`${label}.${actionId}.result_id 不在允许结果中`);
    result[actionId] = {
      result_id: resultId,
      form_name: stringValue(choice.form_name, `${label}.${actionId}.form_name`),
      proposer_id: stringValue(choice.proposer_id, `${label}.${actionId}.proposer_id`),
      effect_id: stringValue(choice.effect_id, `${label}.${actionId}.effect_id`),
      fixed_ending: stringValue(choice.fixed_ending, `${label}.${actionId}.fixed_ending`),
    };
  }
  if (triggerActionIds.some((actionId) => !result[actionId])) throw new Error(`${label} 必须覆盖全部入口`);
  return result;
}

function optionalLocalSettlement(value: unknown, label: string): RegisteredEvent['local_settlement'] {
  if (value === undefined) return undefined;
  const source = record(value, label);
  const materialCost = source.material_cost;
  const advanceTimePeriods = source.advance_time_periods;
  if (!Number.isInteger(materialCost) || Number(materialCost) < 0) throw new Error(`${label}.material_cost 必须是非负整数`);
  if (!Number.isInteger(advanceTimePeriods) || Number(advanceTimePeriods) < 0 || Number(advanceTimePeriods) > 1) {
    throw new Error(`${label}.advance_time_periods 只能是 0 或 1`);
  }
  return {
    effect_handler: stringValue(source.effect_handler, `${label}.effect_handler`),
    material_cost: Number(materialCost),
    advance_time_periods: Number(advanceTimePeriods),
  };
}

function validateEvent(value: unknown, index: number, ids: Set<string>): RegisteredEvent {
  const source = record(value, `events[${index}]`);
  const configId = stringValue(source.config_id, `events[${index}].config_id`);
  if (ids.has(configId)) throw new Error(`事件注册表包含重复 config_id：${configId}`);
  ids.add(configId);
  const eventType = stringValue(source.event_type, `${configId}.event_type`) as EventType;
  if (!EVENT_TYPES.has(eventType)) throw new Error(`${configId}.event_type 未登记：${eventType}`);
  const priority = source.priority;
  const maxRounds = source.max_effective_rounds;
  if (!Number.isInteger(priority)) throw new Error(`${configId}.priority 必须是整数`);
  if (!Number.isInteger(maxRounds) || Number(maxRounds) < 0) throw new Error(`${configId}.max_effective_rounds 必须是非负整数`);
  if (typeof source.one_time !== 'boolean') throw new Error(`${configId}.one_time 必须是布尔值`);
  if (source.facility_id !== null && typeof source.facility_id !== 'string') {
    throw new Error(`${configId}.facility_id 必须是字符串或 null`);
  }
  const triggerActionIds = stringArray(source.trigger_action_ids, `${configId}.trigger_action_ids`);
  const projectionKeys = stringArray(source.projection_keys, `${configId}.projection_keys`);
  for (const key of projectionKeys) {
    if (!PROJECTION_KEYS.has(key)) throw new Error(`${configId}.projection_keys 包含未登记路径：${key}`);
  }
  const allowedResults = stringArray(source.allowed_results, `${configId}.allowed_results`);
  if ((eventType === 'progression_fixed' || eventType === 'progression_session') && !allowedResults.length) {
    throw new Error(`${configId}.allowed_results 不能为空`);
  }
  return {
    config_id: configId,
    title: stringValue(source.title, `${configId}.title`),
    event_type: eventType,
    trigger_action_ids: triggerActionIds,
    prerequisites: stringArray(source.prerequisites, `${configId}.prerequisites`),
    blocks: stringArray(source.blocks, `${configId}.blocks`),
    participants: stringArray(source.participants, `${configId}.participants`),
    facility_id: source.facility_id as string | null,
    priority: Number(priority),
    one_time: source.one_time,
    max_effective_rounds: Number(maxRounds),
    projection_keys: projectionKeys,
    narrative_outline: stringArray(source.narrative_outline, `${configId}.narrative_outline`),
    required_beats: stringArray(source.required_beats, `${configId}.required_beats`),
    forbidden_deviations: stringArray(source.forbidden_deviations, `${configId}.forbidden_deviations`),
    allowed_results: allowedResults,
    action_results: optionalActionResults(source.action_results, `${configId}.action_results`, triggerActionIds, allowedResults),
    local_settlement: optionalLocalSettlement(source.local_settlement, `${configId}.local_settlement`),
    downstream_unlocks: stringArray(source.downstream_unlocks, `${configId}.downstream_unlocks`),
    failure_recovery: stringValue(source.failure_recovery, `${configId}.failure_recovery`),
    presence_transition: optionalPresenceTransition(source.presence_transition, `${configId}.presence_transition`),
  };
}

export function eventResultForAction(eventId: string, actionId: string) {
  const event = eventById.get(eventId);
  if (!event) return undefined;
  return event.action_results?.[actionId]?.result_id
    ?? (event.allowed_results.includes(actionId) ? actionId : undefined);
}

export function validateEventDocuments(values: unknown[]): RegisteredEvent[] {
  const ids = new Set<string>();
  return values.flatMap((value, documentIndex) => {
    const document = record(value, `eventDocuments[${documentIndex}]`);
    if (!Array.isArray(document.events)) throw new Error(`eventDocuments[${documentIndex}] 缺少 events 数组`);
    return document.events.map((event, index) => validateEvent(event, index, ids));
  });
}

export const registeredEvents = validateEventDocuments([
  greenhouseEventsJson,
  greenhouseUpgradeRoutesJson,
  freeSideStoriesJson,
  specialItemEventsJson,
]);
export const eventById = new Map(registeredEvents.map((event) => [event.config_id, event]));
