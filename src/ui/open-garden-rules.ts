import type { GardenState } from './types';
import { openGardenProjectsVisible, listFacilityCatalog } from './facility-rules';
import { deriveKnownCharacters } from './visitor-rules';
import { anomalyCardDisabledReason } from './anomaly-rules';
import { periodSerialFromState } from './time-rules';

export function isTutorialGraduated(state: GardenState): boolean {
  return openGardenProjectsVisible(state);
}

export function graduationMessage(state: GardenState): string {
  if (!isTutorialGraduated(state)) return '';
  if (state.ui_flags?.graduation_acknowledged) return '';
  return '首次温室选型完成。移动庭园已经开放：此后没有必须完成的主线，可以自由建设、邀请访客、处理异变、使用道具或进行日常交流。';
}

export function acknowledgeGraduation(before: GardenState): GardenState {
  const state = structuredClone(before);
  state.ui_flags ??= {};
  state.ui_flags.graduation_acknowledged = true;
  return state;
}

export function openGardenOpportunityPanel(state: GardenState) {
  if (!isTutorialGraduated(state)) {
    return {
      graduated: false,
      title: '教程进行中',
      items: ['完成魔理沙、爱丽丝、荷取三套温室方案后，进行首次选型。'],
    };
  }
  const facilities = listFacilityCatalog().map((facility) => {
    const runtime = state.facility_runtime?.[facility.facility_id];
    const built = Boolean(runtime?.built || state.facilities?.[facility.facility_id]?.current_form);
    return {
      id: facility.facility_id,
      title: facility.title,
      built,
      current_form: runtime?.current_form ?? state.facilities?.[facility.facility_id]?.current_form ?? null,
      build_cost: facility.build_cost_materials,
      status: built ? (runtime?.status ?? 'normal') : 'planned',
      second_form_choice_pending: Boolean(runtime?.second_form_choice_pending),
      forms: facility.forms.map((form) => ({
        form_id: form.form_id,
        summary: form.summary,
        quick_actions: form.quick_actions.map((action) => ({ ...action })),
        unlocked: Boolean(runtime?.unlocked_forms?.includes(form.form_id)),
        current: runtime?.current_form === form.form_id,
      })),
    };
  });
  const anomaly = state.anomaly_cycle?.active
    ? {
        title: state.anomaly_cycle.active.title,
        remaining: Math.max(0, state.anomaly_cycle.active.end_period_serial - periodSerialFromState(state)),
        status: state.anomaly_cycle.active.status,
      }
    : null;
  return {
    graduated: true,
    title: '开放庭园机会',
    graduation: graduationMessage(state),
    facilities,
    known_characters: deriveKnownCharacters(state),
    anomaly,
    anomaly_card_block: anomalyCardDisabledReason(state),
    visitor_count: state.presence_snapshot?.present_character_ids?.length ?? 0,
    notices: [...(state.visit_scheduler?.pending_notices ?? [])],
  };
}
