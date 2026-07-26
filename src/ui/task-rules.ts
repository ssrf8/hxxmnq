import type { GardenState, PendingTask } from './types';
import { periodSerialFromState } from './time-rules';
import { resolveAnomaly } from './anomaly-rules';
import { assumeDueBanquetCompleted } from './activity-rules';

export const TASK_GRACE_PERIODS = 4;
export const MAX_PENDING_TASKS = 8;

function taskId(kind: PendingTask['kind'], sourceId: string) {
  return `task:${kind}:${sourceId}`.slice(0, 160);
}

function upsertTask(state: GardenState, task: PendingTask) {
  const tasks = [...(state.pending_tasks ?? [])];
  if (!tasks.some((item) => item.kind === task.kind && item.source_id === task.source_id)) tasks.push(task);
  state.pending_tasks = tasks.slice(-MAX_PENDING_TASKS);
}

export function removePendingTask(before: GardenState, kind: PendingTask['kind'], sourceId: string): GardenState {
  const state = structuredClone(before);
  state.pending_tasks = (state.pending_tasks ?? []).filter((task) => !(task.kind === kind && task.source_id === sourceId));
  return state;
}

export function claimPendingTask(before: GardenState, id: string): GardenState {
  const state = structuredClone(before);
  const task = state.pending_tasks?.find((item) => item.task_id === id);
  if (!task) throw new Error('待办已不存在或已经完成');
  task.status = 'processing';
  return state;
}

export function releasePendingTask(before: GardenState, id: string): GardenState {
  const state = structuredClone(before);
  const task = state.pending_tasks?.find((item) => item.task_id === id);
  if (task) task.status = 'pending';
  return state;
}

/** Synchronizes code-owned due work. This function is pure and never calls a model. */
export function reconcilePendingTasks(before: GardenState): GardenState {
  let state = structuredClone(before);
  const now = periodSerialFromState(state);
  state.pending_tasks = Array.isArray(state.pending_tasks) ? state.pending_tasks.slice(-MAX_PENDING_TASKS) : [];

  const anomaly = state.anomaly_cycle?.active;
  if (anomaly && now >= anomaly.end_period_serial) {
    anomaly.status = 'resolving';
    upsertTask(state, {
      task_id: taskId('anomaly_resolution', anomaly.anomaly_id),
      kind: 'anomaly_resolution',
      status: 'pending',
      created_period_serial: now,
      due_period_serial: anomaly.end_period_serial,
      auto_resolve_period_serial: anomaly.end_period_serial + TASK_GRACE_PERIODS,
      source_id: anomaly.anomaly_id,
      label: `完成异变「${anomaly.title}」的最终收束`,
      payload: { anomaly_id: anomaly.anomaly_id },
    });
  }

  const scheduled = state.garden_activities?.scheduled_banquet;
  if (scheduled && now >= scheduled.start_period_serial) {
    scheduled.status = 'due_waiting';
    upsertTask(state, {
      task_id: taskId('banquet_start', scheduled.activity_id),
      kind: 'banquet_start',
      status: 'pending',
      created_period_serial: now,
      due_period_serial: scheduled.start_period_serial,
      auto_resolve_period_serial: scheduled.start_period_serial + TASK_GRACE_PERIODS,
      source_id: scheduled.activity_id,
      label: `开始${scheduled.participation_mode === 'public' ? '公开' : '邀请制'}宴会`,
      payload: { activity_id: scheduled.activity_id },
    });
  }

  const expired = [...(state.pending_tasks ?? [])].filter((task) => now >= task.auto_resolve_period_serial);
  for (const task of expired) {
    if (task.kind === 'anomaly_resolution' && state.anomaly_cycle?.active?.anomaly_id === task.source_id) {
      state = resolveAnomaly(state, null);
    } else if (task.kind === 'banquet_start'
      && state.garden_activities?.scheduled_banquet?.activity_id === task.source_id) {
      state = assumeDueBanquetCompleted(state, task.source_id);
    }
    state = removePendingTask(state, task.kind, task.source_id);
  }
  return state;
}
