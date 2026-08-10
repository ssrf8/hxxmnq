import type { GardenState } from './types';
import {
  createPresenceAnalysisTask,
  stagePresenceAnalysisTask,
  type PresenceAnalysisRequestRef,
} from './presence-analysis-task';
import {
  createVisitSummaryTask,
  stageVisitSummaryTask,
  type VisitSummaryTaskRequestRef,
} from './visit-summary-task';

export const VARIABLE_ANALYSIS_TASK_PROJECTION_SCHEMA = 'gensokyo-variable-analysis-task.v1' as const;

export type VariableAnalysisTaskRequestRef = PresenceAnalysisRequestRef & VisitSummaryTaskRequestRef;

/**
 * Both prompt projection and message-scope staging must be derived from the same
 * authoritative pre-generation state. Keeping this in one module prevents the
 * extra model from seeing an envelope different from the one bridge validates.
 */
export function createVariableAnalysisTaskProjection(
  state: GardenState,
  request: VariableAnalysisTaskRequestRef,
) {
  return {
    schema: VARIABLE_ANALYSIS_TASK_PROJECTION_SCHEMA,
    interaction: {
      visit_summary_task: createVisitSummaryTask(request),
      presence_analysis_task: createPresenceAnalysisTask(state, request),
    },
  };
}

export function stageVariableAnalysisTasks(
  state: GardenState,
  request: VariableAnalysisTaskRequestRef,
): GardenState {
  return stagePresenceAnalysisTask(stageVisitSummaryTask(state, request), request);
}

/**
 * This projection is stored in the real user floor, which is guaranteed to be in
 * MagVarUpdate's two-message extra-analysis history. Angle brackets inside state
 * strings are escaped so a baseline action cannot terminate the wrapper early.
 */
export function formatVariableAnalysisTaskProjection(
  state: GardenState,
  request: VariableAnalysisTaskRequestRef,
): string {
  const json = JSON.stringify(createVariableAnalysisTaskProjection(state, request))
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e');
  return [
    '【额外变量分析任务｜剧情模型忽略，不得复述或改写】',
    `<GensokyoVariableAnalysisTask>${json}</GensokyoVariableAnalysisTask>`,
  ].join('\n');
}
