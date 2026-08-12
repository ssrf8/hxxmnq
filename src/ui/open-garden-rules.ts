import type { GardenState } from './types';
import { listFacilityCatalog } from './facility-rules';
import { deriveKnownCharacters } from './visitor-rules';
import { anomalyCardDisabledReason } from './anomaly-rules';
import { periodSerialFromState } from './time-rules';

export function isTutorialGraduated(state: GardenState): boolean {
  return Boolean(state.events?.completed_key_events?.greenhouse_flower_core);
}

export function graduationMessage(state: GardenState): string {
  if (!isTutorialGraduated(state)) return '';
  if (state.ui_flags?.graduation_acknowledged) return '';
  return '温室妖花核心已经解决，新手教程完成。来客茶席与开放庭园现已开放；三套温室方案和首次选型作为后续自由玩法保留。';
}

export function acknowledgeGraduation(before: GardenState): GardenState {
  const state = structuredClone(before);
  state.ui_flags ??= {};
  state.ui_flags.graduation_acknowledged = true;
  return state;
}

export interface TutorialProgressStep {
  id: string;
  title: string;
  instruction: string;
  completed: boolean;
}

export function tutorialProgress(state: GardenState) {
  const completed = state.events?.completed_key_events ?? {};
  const steps: TutorialProgressStep[] = [
    {
      id: 'opening',
      title: '继承移动庭园',
      instruction: '确认身份，读完祖父留下的序章，并亲手接过庭守钥。',
      completed: Boolean(state.meta?.opening_committed),
    },
    {
      id: 'boundary',
      title: '确认结界异常',
      instruction: '在庭园点击灵梦，选择“检查结界”。',
      completed: Boolean(completed.reimu_boundary_inspection),
    },
    {
      id: 'main-house',
      title: '修复旧主屋',
      instruction: '点击旧主屋，选择维修并完成结算。',
      completed: Boolean(completed.main_house_repair),
    },
    {
      id: 'magic-trace',
      title: '追查温室线索',
      instruction: '点击温室旧地基，调查残留的魔力痕迹。',
      completed: Boolean(completed.marisa_material_rumor),
    },
    {
      id: 'inspiration',
      title: '取得第二点灵感',
      instruction: '在温室旧址选择异常生长、魔理沙方案或祖父图纸中的一个入口。',
      completed: Boolean(completed.gain_second_inspiration || (state.resources?.inspiration ?? 0) >= 2),
    },
    {
      id: 'foundation',
      title: '清理温室地基',
      instruction: '返回温室旧址，选择“清理旧地基”。',
      completed: Boolean(completed.clear_greenhouse_foundation),
    },
    {
      id: 'greenhouse',
      title: '建成基础魔法温室',
      instruction: '准备 4 物资与 2 灵感，在温室旧址开始建造。',
      completed: Boolean(completed.build_basic_magic_greenhouse),
    },
    {
      id: 'first-use',
      title: '完成温室试运行',
      instruction: '点击建成的魔法温室，选择“第一次使用”。',
      completed: Boolean(completed.greenhouse_first_use),
    },
    {
      id: 'research',
      title: '进行温室研究交流',
      instruction: '与魔理沙完成一次温室研究交流。',
      completed: Boolean(completed.greenhouse_multiturn_conversation),
    },
    {
      id: 'flower-core',
      title: '解决妖花核心',
      instruction: '调查温室深处的妖花核心，并用符卡战或剧情方式完成结算。',
      completed: Boolean(completed.greenhouse_flower_core),
    },
  ];
  const completedCount = steps.filter((step) => step.completed).length;
  const currentIndex = steps.findIndex((step) => !step.completed);
  return {
    steps,
    completedCount,
    totalCount: steps.length,
    currentStep: currentIndex >= 0 ? steps[currentIndex] : null,
    nextStep: currentIndex >= 0 ? steps[currentIndex + 1] ?? null : null,
  };
}

export function openGardenOpportunityPanel(state: GardenState) {
  if (!isTutorialGraduated(state)) {
    const tutorial = tutorialProgress(state);
    return {
      graduated: false,
      title: '教程进行中',
      tutorial,
      items: tutorial.currentStep ? [tutorial.currentStep.instruction] : [],
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
