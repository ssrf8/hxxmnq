import type { GardenState } from './types';
import { tickAnomalyLifecycle } from './anomaly-rules';
import { tickActivitiesOnTimeAdvance } from './activity-rules';
import { tickFacilityUnlocks } from './facility-rules';
import { periodSerialFromState } from './time-rules';
import { evaluateVisitScheduler } from './visitor-rules';
import { reconcilePendingTasks } from './task-rules';

/** Applies every code-owned scheduler after a verified world-time update. */
export function reconcileM2Runtime(
  before: GardenState,
  accepted: GardenState,
  chatId = 'local',
): GardenState {
  const previousSerial = periodSerialFromState(before);
  let state = structuredClone(accepted);
  state = tickFacilityUnlocks(state);
  state = tickAnomalyLifecycle(state);
  state = tickActivitiesOnTimeAdvance(state, previousSerial);
  state = reconcilePendingTasks(state);

  const busy = Boolean(
    state.battle?.current
    || state.events?.active_event
    || state.interaction?.current_session
    || state.anomaly_cycle?.pending_activation
    || state.anomaly_cycle?.active?.status === 'resolving',
  );
  state = evaluateVisitScheduler(state, {
    chatId,
    commitArrivals: !busy,
    busy,
  }).state;
  // A newly scheduled same-period arrival is committed at the same safe point.
  if (!busy) {
    state = evaluateVisitScheduler(state, {
      chatId,
      commitArrivals: true,
      busy: false,
    }).state;
  }
  return state;
}
