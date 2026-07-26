import type { GardenState, TimePeriod } from './types';

export const TIME_PERIODS: TimePeriod[] = ['清晨', '白昼', '黄昏', '夜晚'];

/** Rejects invalid or backward model-written time while preserving other candidate fields. */
export function enforceMonotonicTime(before: GardenState, candidate: GardenState): GardenState {
  const state = structuredClone(candidate);
  state.environment ??= {};
  const beforeDay = before.environment?.day ?? 1;
  const beforePeriod = before.environment?.time_period ?? '清晨';
  const candidateDay = state.environment.day;
  const candidatePeriod = state.environment.time_period;
  const candidateIndex = TIME_PERIODS.indexOf(candidatePeriod ?? beforePeriod);
  const beforeIndex = TIME_PERIODS.indexOf(beforePeriod);
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
  const current = TIME_PERIODS.indexOf(state.environment.time_period ?? '清晨');
  const next = (current < 0 ? 0 : current + 1) % TIME_PERIODS.length;
  state.environment.time_period = TIME_PERIODS[next];
  if (next === 0) state.environment.day = (state.environment.day ?? 1) + 1;
  return state;
}

export function timeSnapshot(state: GardenState) {
  return {
    day: state.environment?.day ?? 1,
    time_period: state.environment?.time_period ?? '清晨',
  };
}

export function periodIndex(period: TimePeriod | string | undefined | null): number {
  const index = TIME_PERIODS.indexOf((period ?? '清晨') as TimePeriod);
  return index < 0 ? 0 : index;
}

/** Absolute standard-period serial. Day 1 清晨 = 0. Not persisted; derived only. */
export function periodSerial(day: number | undefined | null, period: TimePeriod | string | undefined | null): number {
  const safeDay = Number.isInteger(day) && Number(day) >= 1 ? Number(day) : 1;
  return (safeDay - 1) * TIME_PERIODS.length + periodIndex(period);
}

export function periodSerialFromState(state: GardenState): number {
  return periodSerial(state.environment?.day, state.environment?.time_period);
}

export function fromPeriodSerial(serial: number): { day: number; time_period: TimePeriod } {
  const safe = Number.isFinite(serial) ? Math.max(0, Math.floor(serial)) : 0;
  const day = Math.floor(safe / TIME_PERIODS.length) + 1;
  const time_period = TIME_PERIODS[safe % TIME_PERIODS.length];
  return { day, time_period };
}

export function advancePeriodSerial(serial: number, steps = 1): number {
  return Math.max(0, Math.floor(serial) + Math.floor(steps));
}

/** Inclusive start, exclusive end — for crossing N boundaries one by one. */
export function iteratePeriodSerials(fromExclusive: number, toInclusive: number): number[] {
  const start = Math.floor(fromExclusive) + 1;
  const end = Math.floor(toInclusive);
  if (end < start) return [];
  const out: number[] = [];
  for (let serial = start; serial <= end; serial += 1) out.push(serial);
  return out;
}

export function periodsBetween(from: number, to: number): number {
  return Math.max(0, Math.floor(to) - Math.floor(from));
}
