import type { GardenState, VisitSummaryTask } from './types';

export const VISIT_SUMMARY_TASK_SCHEMA = 'visit-summary-task.v1' as const;
export const VISIT_SUMMARY_MAX_CHARS = 100;

export interface VisitSummaryTaskRequestRef {
  requestId: string;
  relevantCharacterIds: readonly string[];
  visitIdsByCharacter: Record<string, string | null>;
}

export type VisitSummaryTaskReadResult =
  | { ok: true; summaries: Map<string, string> }
  | { ok: false; code: 'missing-task' | 'task-mismatch' | 'missing-summary' | 'invalid-summary' };

export function eligibleVisitSummaryCharacters(request: VisitSummaryTaskRequestRef): string[] {
  return [...new Set(request.relevantCharacterIds)]
    .filter((characterId) => request.visitIdsByCharacter[characterId] != null);
}

export function createVisitSummaryTask(request: VisitSummaryTaskRequestRef): VisitSummaryTask {
  return {
    schema: VISIT_SUMMARY_TASK_SCHEMA,
    request_id: request.requestId,
    slots: eligibleVisitSummaryCharacters(request).map((characterId) => ({
      character_id: characterId,
      summary: '',
    })),
  };
}

/** Bridge 在模型运行前建立任务；只把本轮冻结信封写入 state。 */
export function stageVisitSummaryTask(state: GardenState, request: VisitSummaryTaskRequestRef): GardenState {
  const next = structuredClone(state);
  next.interaction ??= {};
  next.interaction.visit_summary_task = createVisitSummaryTask(request);
  return next;
}

function normalizeSummary(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const summary = value.replace(/\s+/gu, ' ').trim();
  if (!summary || summary.length > VISIT_SUMMARY_MAX_CHARS) return null;
  return summary;
}

/**
 * 只信任与冻结 request 完全同构的任务信封。模型可以填写 summary，不能增删、
 * 调序或改写角色槽位；任一槽缺失时整轮拒绝，避免生成半套角色记忆。
 */
export function readVisitSummaryTask(
  state: GardenState,
  request: VisitSummaryTaskRequestRef,
): VisitSummaryTaskReadResult {
  const task = state.interaction?.visit_summary_task;
  if (!task) return { ok: false, code: 'missing-task' };
  const expected = eligibleVisitSummaryCharacters(request);
  if (task.schema !== VISIT_SUMMARY_TASK_SCHEMA
    || task.request_id !== request.requestId
    || !Array.isArray(task.slots)
    || task.slots.length !== expected.length
    || task.slots.some((slot, index) => slot?.character_id !== expected[index])) {
    return { ok: false, code: 'task-mismatch' };
  }
  const summaries = new Map<string, string>();
  for (const slot of task.slots) {
    if (typeof slot?.summary !== 'string' || !slot.summary.trim()) {
      return { ok: false, code: 'missing-summary' };
    }
    const summary = normalizeSummary(slot.summary);
    if (!summary) return { ok: false, code: 'invalid-summary' };
    summaries.set(slot.character_id, summary);
  }
  return { ok: true, summaries };
}

export function clearVisitSummaryTask(state: GardenState): GardenState {
  const next = structuredClone(state);
  next.interaction ??= {};
  next.interaction.visit_summary_task = null;
  return next;
}
