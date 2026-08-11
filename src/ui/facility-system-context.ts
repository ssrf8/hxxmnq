import riskCatalog from '../facilities/risk-conditions.json';
import { listFacilityCatalog } from './facility-rules';
import type { FacilityRuntimeState, GardenState } from './types';

export const FACILITY_SYSTEM_CONTEXT_HEADING = '【庭园设施现状：当前代码事实】';

const conditionLabels = new Map<string, string>();
for (const conditions of Object.values(riskCatalog.conditions)) {
  for (const condition of conditions) conditionLabels.set(condition.condition_id, condition.label);
}

function runtimeStatusText(runtime: FacilityRuntimeState | undefined, fallbackState?: string): string {
  const detail = runtime?.condition_id ? conditionLabels.get(runtime.condition_id) : undefined;
  if (runtime?.status === 'damaged' || fallbackState === '损坏') return detail ? `结构损坏（${detail}）` : '结构损坏';
  if (runtime?.status === 'abnormal' || fallbackState === '异常') return detail ? `运转异常（${detail}）` : '运转异常';
  return '运转正常';
}

/**
 * 从正式 GardenState 投影紧凑、可冻结的设施事实。
 * 只输出模型叙事需要的建成形态与结构状态，不泄露交易、冷却、解锁或待处理字段。
 */
export function buildFacilitySystemContext(state: GardenState): string {
  const lines: string[] = [];
  const mainHouseState = state.areas?.main_house?.state;
  if (mainHouseState === '启用') {
    lines.push('- 旧主屋：已修复；正常使用。');
  } else if (mainHouseState === '损坏') {
    lines.push('- 旧主屋：尚未修复；当前损坏。');
  }

  const greenhouse = state.facilities?.magic_greenhouse;
  if (greenhouse?.current_form) {
    lines.push(`- 魔法温室：已建成；形态“${greenhouse.current_form}”；${runtimeStatusText(undefined, greenhouse.state)}。`);
  }

  for (const definition of listFacilityCatalog()) {
    const runtime = state.facility_runtime?.[definition.facility_id];
    const facility = state.facilities?.[definition.facility_id];
    const form = runtime?.current_form ?? facility?.current_form ?? null;
    if (runtime?.built !== true && !form) continue;
    lines.push(`- ${definition.title}：已建成；形态“${form ?? '未记录'}”；${runtimeStatusText(runtime, facility?.state)}。`);
  }

  if (!lines.length) return '';
  return [
    FACILITY_SYSTEM_CONTEXT_HEADING,
    ...lines,
    '以上为本轮从正式状态读取的最新事实，优先于开场背景和剧情梗概中的旧状态。',
    '不得把已建成且运转正常的设施描述为废墟、未建成或仍待修复；只有明确标记异常或损坏时，才能描写对应故障。',
  ].join('\n');
}
