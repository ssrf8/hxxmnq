import dialogues from '../shop/dialogues.json';
import type { AnomalyActivationForm, GardenState } from './types';
import {
  cancelAnomalyActivation,
  canStartAnomaly,
  commitAnomalyActivation,
  createDeterministicAnomalyOrigin,
  reserveAnomalyActivation,
} from './anomaly-rules';
import { periodSerialFromState } from './time-rules';

const MAX_EVENT_SETTLEMENT_IDS = 256;

function validateUseId(useId: string) {
  if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(useId)) throw new Error('道具使用 ID 非法');
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
  pendingAnomaly?: boolean;
}

/**
 * R39: incident card reserves a custom seven-day anomaly instead of rolling pre-registered incidents.
 * Legacy waiting_events already in saves remain completable and are never auto-promoted.
 */
export function beginAnomalyCardUse(
  before: GardenState,
  useId: string,
  form: Partial<AnomalyActivationForm>,
): SpecialItemUseResult {
  validateUseId(useId);
  if (before.events?.settled_ids?.includes(useId) && before.anomaly_cycle?.active?.anomaly_id === useId) {
    return { state: structuredClone(before), message: '该异变启用已经结算' };
  }
  const blocked = canStartAnomaly(before);
  if (blocked) throw new Error(blocked);
  const state = reserveAnomalyActivation(before, form, useId);
  return {
    state,
    message: '已预留异变卡，等待生成启用剧情与隐藏源头。失败可重试且不扣卡。',
    pendingAnomaly: true,
  };
}

/** Atomically consumes the card and establishes the seven-day anomaly. */
export function activateAnomalyCard(
  before: GardenState,
  useId: string,
  form: Partial<AnomalyActivationForm>,
): SpecialItemUseResult {
  validateUseId(useId);
  if (before.events?.settled_ids?.includes(useId)) {
    return { state: structuredClone(before), message: '该异变启用已经结算' };
  }
  const reserved = reserveAnomalyActivation(before, form, useId);
  const generated = createDeterministicAnomalyOrigin(form, useId);
  const state = commitAnomalyActivation(reserved, generated.origin, generated.publicSummary);
  appendSettlementId(state, useId);
  return {
    state,
    message: `自定义异变「${state.anomaly_cycle?.active?.title}」已启用，将持续 28 个标准时段。`,
  };
}

export function finalizeAnomalyCardUse(
  before: GardenState,
  origin: {
    name: string;
    type: string;
    summary: string;
    location: string;
    cause: string;
    resolution_method: string;
  },
  publicSummary = '',
): SpecialItemUseResult {
  const pending = before.anomaly_cycle?.pending_activation;
  if (!pending) throw new Error('没有待提交的异变启用');
  const state = commitAnomalyActivation(before, origin, publicSummary);
  appendSettlementId(state, pending.transaction_id);
  return {
    state,
    message: `自定义异变「${state.anomaly_cycle?.active?.title}」已启用，将持续 28 个标准时段。`,
  };
}

export function abortAnomalyCardUse(before: GardenState, transactionId?: string): SpecialItemUseResult {
  return {
    state: cancelAnomalyActivation(before, transactionId),
    message: '已取消异变启用，卡片已退回。',
  };
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
  const serialBefore = periodSerialFromState(before);
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
  // Watch pause must not advance period serial / anomaly timers / facility unlock deadlines.
  if (periodSerialFromState(state) !== serialBefore) {
    throw new Error('怀表不得推进正式时段');
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

export function useSpecialItem(
  before: GardenState,
  itemId: string,
  useId: string,
  form?: Partial<AnomalyActivationForm>,
): SpecialItemUseResult {
  if (itemId === 'incident_trigger_card') {
    if (!form) throw new Error('启用异变需要填写结构化表单');
    return activateAnomalyCard(before, useId, form);
  }
  if (itemId === 'sakuya_watch') return useSakuyaWatch(before, useId);
  throw new Error('该物品没有登记本地使用能力');
}
