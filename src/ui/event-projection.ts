import type { GardenState } from './types';
import { eventById } from './event-registry';

function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

export function eventStateProjection(eventId: string, state: GardenState) {
  const event = eventById.get(eventId);
  if (!event) throw new Error(`未登记事件：${eventId}`);
  return Object.fromEntries(event.projection_keys.map((key) => [key, readPath(state, key) ?? null]));
}

export function buildEventPromptProjection(eventId: string, actionId: string, state: GardenState) {
  const event = eventById.get(eventId);
  if (!event) throw new Error(`未登记事件：${eventId}`);
  if (!event.trigger_action_ids.includes(actionId)) {
    throw new Error(`行动 ${actionId} 未登记为事件 ${eventId} 的入口`);
  }
  const list = (label: string, values: string[], empty = '无') => `${label}：${values.length ? values.join(' → ') : empty}`;
  return [
    '【当前事件精确投影】',
    `事件：${event.config_id}（${event.title}）`,
    `类型：${event.event_type}；最多有效轮数：${event.max_effective_rounds}`,
    `本次行动：${actionId}`,
    list('参与角色 ID', event.participants),
    list('前置事实', event.prerequisites),
    list('阻断条件', event.blocks),
    list('叙事大纲', event.narrative_outline),
    list('必经节拍', event.required_beats),
    list('禁止偏离', event.forbidden_deviations),
    list('本地允许结果 ID', event.allowed_results),
    `失败恢复：${event.failure_recovery}`,
    `本次状态切片：${JSON.stringify(eventStateProjection(eventId, state))}`,
    '只演绎本事件；不得引用、预告或完成未投影的其他事件。正式结果仍由 bridge 本地结算。',
  ].join('\n');
}
