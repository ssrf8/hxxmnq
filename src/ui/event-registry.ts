import greenhouseEventsJson from '../lorebook/events/greenhouse-vertical-slice.json';

export type EventType = 'progression_fixed' | 'progression_session' | 'free_side_story' | 'ambient_interaction' | 'static_script' | 'deterministic_action';

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
  allowed_results: Array<{ result_id: string; fixed_ending: string }>;
  downstream_unlocks: string[];
  failure_recovery: string;
}

function asEvents(value: unknown): RegisteredEvent[] {
  const items = (value as { events?: unknown }).events;
  if (!Array.isArray(items)) throw new Error('事件注册表缺少 events 数组');
  const ids = new Set<string>();
  return items.map((item) => {
    const event = item as Partial<RegisteredEvent>;
    if (!event.config_id || !event.title || !event.event_type || ids.has(event.config_id)) {
      throw new Error(`事件注册表包含缺失或重复 config_id：${String(event.config_id)}`);
    }
    ids.add(event.config_id);
    return event as RegisteredEvent;
  });
}

export const registeredEvents = asEvents(greenhouseEventsJson);
export const eventById = new Map(registeredEvents.map((event) => [event.config_id, event]));
