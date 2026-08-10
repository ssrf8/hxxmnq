import { reconcileCharacterVisitsFromState } from './character-memory';
import type { GardenState, PresenceAnalysisTask } from './types';

export const PRESENCE_ANALYSIS_TASK_SCHEMA = 'presence-analysis-task.v1' as const;

export interface PresenceAnalysisRequestRef {
  requestId: string;
  relevantCharacterIds: readonly string[];
}

const FACINGS = new Set(['front', 'back', 'left', 'right']);
const DECISIONS = new Set(['pending', 'unchanged', 'move', 'leave', 'uncertain']);
const BASE_AREA_IDS = ['main_house', 'central_courtyard', 'greenhouse_plot'];

function eligibleCharacters(state: GardenState, request: PresenceAnalysisRequestRef): string[] {
  const present = new Set(state.presence_snapshot?.present_character_ids ?? []);
  return [...new Set(request.relevantCharacterIds)].filter((id) => present.has(id));
}

export function createPresenceAnalysisTask(
  state: GardenState,
  request: PresenceAnalysisRequestRef,
): PresenceAnalysisTask {
  const views = state.presence_snapshot?.character_views ?? {};
  return {
    schema: PRESENCE_ANALYSIS_TASK_SCHEMA,
    request_id: request.requestId,
    slots: eligibleCharacters(state, request).map((characterId) => {
      const view = views[characterId] ?? {};
      return {
        character_id: characterId,
        baseline_area_id: view.area_id ?? null,
        baseline_action: view.action ?? null,
        baseline_facing: view.facing ?? null,
        decision: 'pending',
        area_id: null,
        action: null,
        facing: null,
      };
    }),
  };
}

export function stagePresenceAnalysisTask(
  state: GardenState,
  request: PresenceAnalysisRequestRef,
): GardenState {
  const next = structuredClone(state);
  next.interaction ??= {};
  next.interaction.presence_analysis_task = createPresenceAnalysisTask(state, request);
  return next;
}

function sameFrozenEnvelope(actual: PresenceAnalysisTask, expected: PresenceAnalysisTask): boolean {
  return actual.schema === expected.schema
    && actual.request_id === expected.request_id
    && Array.isArray(actual.slots)
    && actual.slots.length === expected.slots.length
    && actual.slots.every((slot, index) => {
      const frozen = expected.slots[index];
      return slot?.character_id === frozen.character_id
        && slot.baseline_area_id === frozen.baseline_area_id
        && slot.baseline_action === frozen.baseline_action
        && slot.baseline_facing === frozen.baseline_facing;
    });
}

export function verifyPresenceAnalysisTask(
  state: GardenState,
  baseline: GardenState,
  request: PresenceAnalysisRequestRef,
): boolean {
  const task = state.interaction?.presence_analysis_task;
  return Boolean(task && sameFrozenEnvelope(task, createPresenceAnalysisTask(baseline, request)));
}

export function clearPresenceAnalysisTask(state: GardenState): GardenState {
  const next = structuredClone(state);
  next.interaction ??= {};
  next.interaction.presence_analysis_task = null;
  return next;
}

/**
 * Consume the extra-model task once. Invalid, pending and uncertain output is
 * fail-safe: presence stays unchanged and the transient task is cleared.
 */
export function applyPresenceAnalysisTask(
  baseline: GardenState,
  state: GardenState,
  request: PresenceAnalysisRequestRef,
): GardenState {
  const task = state.interaction?.presence_analysis_task;
  const expected = createPresenceAnalysisTask(baseline, request);
  if (!task || !sameFrozenEnvelope(task, expected)) return clearPresenceAnalysisTask(state);

  const next = structuredClone(state);
  const knownAreas = new Set([...BASE_AREA_IDS, ...Object.keys(next.areas ?? {})]);
  const present = new Set(next.presence_snapshot?.present_character_ids ?? []);
  const views = next.presence_snapshot?.character_views ?? {};
  const visitorMeta = next.presence_snapshot?.visitor_meta ?? {};

  for (const slot of task.slots) {
    if (!DECISIONS.has(slot.decision)) continue;
    const current = views[slot.character_id] ?? {};
    const baselineStillOwns = present.has(slot.character_id)
      && (current.area_id ?? null) === slot.baseline_area_id
      && (current.action ?? null) === slot.baseline_action
      && (current.facing ?? null) === slot.baseline_facing;
    if (!baselineStillOwns) continue;

    if (slot.decision === 'leave') {
      present.delete(slot.character_id);
      delete views[slot.character_id];
      delete visitorMeta[slot.character_id];
      continue;
    }
    if (slot.decision !== 'move'
      || typeof slot.area_id !== 'string'
      || !knownAreas.has(slot.area_id)) continue;
    views[slot.character_id] = {
      area_id: slot.area_id,
      ...(typeof slot.action === 'string' && slot.action.trim()
        ? { action: slot.action.replace(/\s+/gu, ' ').trim().slice(0, 80) }
        : (current.action ? { action: current.action } : {})),
      ...(typeof slot.facing === 'string' && FACINGS.has(slot.facing)
        ? { facing: slot.facing as 'front' | 'back' | 'left' | 'right' }
        : (current.facing ? { facing: current.facing } : {})),
    };
  }

  next.presence_snapshot = {
    present_character_ids: [...present],
    character_views: views,
    visitor_meta: visitorMeta,
  };
  next.interaction ??= {};
  next.interaction.presence_analysis_task = null;
  return reconcileCharacterVisitsFromState(state, next, 'model-presence');
}
