import type { GardenState, TimePeriod } from './types';

const periods: TimePeriod[] = ['清晨', '白昼', '黄昏', '夜晚'];

/** Rejects invalid or backward model-written time while preserving other candidate fields. */
export function enforceMonotonicTime(before: GardenState, candidate: GardenState): GardenState {
  const state = structuredClone(candidate);
  state.environment ??= {};
  const beforeDay = before.environment?.day ?? 1;
  const beforePeriod = before.environment?.time_period ?? '清晨';
  const candidateDay = state.environment.day;
  const candidatePeriod = state.environment.time_period;
  const candidateIndex = periods.indexOf(candidatePeriod ?? beforePeriod);
  const beforeIndex = periods.indexOf(beforePeriod);
  const invalidDay = !Number.isInteger(candidateDay) || Number(candidateDay) < 1;
  const backwards = !invalidDay && (
    Number(candidateDay) < beforeDay
    || (Number(candidateDay) === beforeDay && candidateIndex < beforeIndex)
  );
  if (invalidDay || candidateIndex < 0 || backwards) {
    state.environment.day = beforeDay;
    state.environment.time_period = beforePeriod;
  }
  return state;
}

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
