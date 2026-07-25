import dialogues from '../shop/dialogues.json';
import type { GardenState } from './types';

const MAX_EVENT_SETTLEMENT_IDS = 256;
const INCIDENT_IDS = ['fairy_seed_shower', 'wandering_magic_mist'] as const;

function validateUseId(useId: string) {
  if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(useId)) throw new Error('道具使用 ID 非法');
}

function deterministicIndex(value: string, length: number) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function appendSettlementId(state: GardenState, useId: string) {
  state.events ??= {};
  state.events.settled_ids = Array.from(new Set([...(state.events.settled_ids ?? []), useId])).slice(-MAX_EVENT_SETTLEMENT_IDS);
}

function waitingHas(state: GardenState, configId: string) {
  return Boolean(state.events?.waiting_events?.some((event) => event.config_id === configId));
}

export interface SpecialItemUseResult {
  state: GardenState;
  message: string;
  selectedEventId?: string;
}

export function useIncidentTriggerCard(before: GardenState, useId: string): SpecialItemUseResult {
  validateUseId(useId);
  if (before.events?.settled_ids?.includes(useId)) {
    return { state: structuredClone(before), message: dialogues.dialogues.trigger_card_used };
  }
  if ((before.inventory?.consumables?.incident_trigger_card ?? 0) < 1) throw new Error('没有可用的异变触发卡');
  if ((before.events?.waiting_events?.length ?? 0) >= 3) throw new Error('等待事件队列已满，卡片没有消耗');
  const eligible: string[] = [...INCIDENT_IDS];
  if (before.key_items?.sakuya_watch?.temporal_trace_active) eligible.push('clockwork_temporal_ripple');
  const available = eligible.filter((eventId) => !waitingHas(before, eventId));
  if (!available.length) throw new Error('当前没有可登记的新异变，卡片没有消耗');
  const selectedEventId = available[deterministicIndex(useId, available.length)];
  const state = structuredClone(before);
  state.inventory ??= { consumables: {} };
  state.inventory.consumables ??= {};
  state.inventory.consumables.incident_trigger_card = (state.inventory.consumables.incident_trigger_card ?? 0) - 1;
  state.events ??= {};
  state.events.waiting_events ??= [];
  state.events.waiting_events.push({
    uid: `waiting:${useId}`,
    config_id: selectedEventId,
    title: selectedEventId === 'fairy_seed_shower' ? '妖精种子雨' : selectedEventId === 'wandering_magic_mist' ? '游荡魔法雾' : '发条时间涟漪',
    status: 'waiting',
  });
  appendSettlementId(state, useId);
  return { state, message: dialogues.dialogues.trigger_card_used, selectedEventId };
}

export function useSakuyaWatch(before: GardenState, useId: string): SpecialItemUseResult {
  validateUseId(useId);
  if (before.events?.settled_ids?.includes(useId)) {
    return { state: structuredClone(before), message: dialogues.dialogues.watch_used };
  }
  const watch = before.key_items?.sakuya_watch;
  if (!watch?.obtained) throw new Error('尚未获得咲夜的怀表');
  const day = before.environment?.day ?? 1;
  if (watch.last_used_day === day || watch.state === 'daily_cooldown') throw new Error(dialogues.dialogues.watch_cooldown);
  if (before.battle?.current || before.events?.active_event || before.interaction?.current_session) {
    throw new Error('战斗、固定剧情或受控会话进行中，不能启动怀表');
  }
  const state = structuredClone(before);
  const nextWatch = state.key_items!.sakuya_watch;
  nextWatch.state = 'daily_cooldown';
  nextWatch.last_used_day = day;
  nextWatch.total_uses = (nextWatch.total_uses ?? 0) + 1;
  nextWatch.last_used_area_id = state.player?.current_area_id ?? 'central_courtyard';
  nextWatch.last_used_time_period = state.environment?.time_period ?? '清晨';
  nextWatch.temporal_trace_active = true;
  nextWatch.noticed_by_character_ids ??= [];
  const reimuView = state.presence_snapshot?.character_views?.reimu;
  const reimuPresent = state.presence_snapshot?.present_character_ids?.includes('reimu');
  if (reimuPresent && (!reimuView?.area_id || reimuView.area_id === nextWatch.last_used_area_id)) {
    nextWatch.noticed_by_character_ids = Array.from(new Set([...nextWatch.noticed_by_character_ids, 'reimu']));
  }
  state.events ??= {};
  state.events.waiting_events ??= [];
  if ((nextWatch.total_uses ?? 0) >= 2
    && !state.events.completed_key_events?.sakuya_temporal_trace_investigation
    && !waitingHas(state, 'sakuya_temporal_trace_investigation')
    && state.events.waiting_events.length < 3) {
    state.events.waiting_events.push({
      uid: `waiting:sakuya:${useId}`,
      config_id: 'sakuya_temporal_trace_investigation',
      title: '咲夜的时间痕迹调查',
      status: 'waiting',
    });
  }
  appendSettlementId(state, useId);
  return { state, message: dialogues.dialogues.watch_used };
}

export function useSpecialItem(before: GardenState, itemId: string, useId: string): SpecialItemUseResult {
  if (itemId === 'incident_trigger_card') return useIncidentTriggerCard(before, useId);
  if (itemId === 'sakuya_watch') return useSakuyaWatch(before, useId);
  throw new Error('该物品没有登记本地使用能力');
}
