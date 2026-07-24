import type { GardenState, TimePeriod } from './types';

const periods: TimePeriod[] = ['清晨', '白昼', '黄昏', '夜晚'];

/** Advances exactly one canonical game period and returns a new state. */
export function advanceOneTimePeriod(before: GardenState): GardenState {
  const state = structuredClone(before);
  state.environment ??= {};
  const current = periods.indexOf(state.environment.time_period ?? '清晨');
  const next = (current < 0 ? 0 : current + 1) % periods.length;
  state.environment.time_period = periods[next];
  if (next === 0) state.environment.day = (state.environment.day ?? 1) + 1;
  return state;
}

export function timeSnapshot(state: GardenState) {
  return {
    day: state.environment?.day ?? 1,
    time_period: state.environment?.time_period ?? '清晨',
  };
}
