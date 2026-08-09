import type { GardenState } from './types';
import { anomalyPublicProjection, buildDailyInvestigationPrompt, buildFinalResolutionPrompt, buildOrdinaryAnomalyPrompt } from './anomaly-rules';
import { sceneItemPrompt } from './activity-rules';
import { openGardenProjectsVisible } from './facility-rules';
import { periodSerialFromState } from './time-rules';

export type PromptContextKind =
  | 'ordinary'
  | 'anomaly_activation'
  | 'daily_investigation'
  | 'final_resolution'
  | 'facility_action'
  | 'refit';

export interface PromptContextOptions {
  kind?: PromptContextKind;
  facilityId?: string;
  selectedCharacterId?: string | null;
  actionIntent?: string;
  includeSceneItems?: boolean;
}

/**
 * Builds the minimum layered prompt facts for an LLM call.
 * Hidden anomaly origin is only included for daily investigation / final resolution.
 */
export function buildPromptContext(state: GardenState, options: PromptContextOptions = {}): string {
  const kind = options.kind ?? 'ordinary';
  const sections: string[] = [];

  sections.push([
    '【场景事实】',
    `日期：第 ${state.environment?.day ?? 1} 日 ${state.environment?.time_period ?? '清晨'}`,
    `天气：${state.environment?.weather ?? '晴'}`,
    `玩家区域：${state.player?.current_area_id ?? 'central_courtyard'}`,
    // 玩家姓名不再每轮投影：开场时已注入酒馆原生宏（{{user}} 展开名），模型从系统层读到。
    `在场角色：${(state.presence_snapshot?.present_character_ids ?? []).join('、') || '无'}`,
    `绝对时段序号：${periodSerialFromState(state)}`,
  ].join('\n'));

  if (state.key_items?.sakuya_watch?.time_stop_active) {
    sections.push([
      '【时间停止】',
      '十六夜咲夜的怀表正在生效：庭园内除玩家外的一切都陷入静止。角色不能主动行动、移动、说话或做出反应，如同被冻结；玩家的动作与话语依然有效，可以自由行动、触碰或摆弄被定身的角色。',
      '静止中的角色没有内心活动，也听不见玩家的话（除非玩家特意描述解除静止的方式）；不要替被定身角色编写反应。时停会在本轮结束时随时段推进自然解除。',
    ].join('\n'));
  }

  if (openGardenProjectsVisible(state)) {
    sections.push([
      '【阶段边界：教程已经彻底结束】',
      '旧主屋修复、基础温室、妖花核心和首次温室选型都已是历史完成事实；移动庭园处于开放自由阶段，没有强制主线。',
      '不得重演、续写或重新布置结界检查、旧主屋修复、温室教程、妖花核心等新手事件。',
      '本轮只回应玩家当前明确行动；过去教程楼层仅作历史，不得把角色再次写成等待教程验收或催促玩家继续教程。',
    ].join('\n'));
  }

  if (options.facilityId) {
    const facility = state.facilities?.[options.facilityId];
    const runtime = state.facility_runtime?.[options.facilityId];
    sections.push([
      '【设施事实】',
      `设施：${facility?.name ?? options.facilityId}`,
      `形态：${runtime?.current_form ?? facility?.current_form ?? '无'}`,
      `结构状态：${runtime?.status ?? 'normal'}`,
      options.actionIntent ? `玩家行动意图：${options.actionIntent}` : '',
      options.selectedCharacterId ? `代码选定角色：${options.selectedCharacterId}` : '',
    ].filter(Boolean).join('\n'));
  }

  if (kind === 'daily_investigation') {
    const text = buildDailyInvestigationPrompt(state);
    if (text) sections.push(text);
  } else if (kind === 'final_resolution') {
    const text = buildFinalResolutionPrompt(state);
    if (text) sections.push(text);
  } else if (kind === 'anomaly_activation') {
    const pending = state.anomaly_cycle?.pending_activation;
    if (pending) {
      sections.push([
        '【异变启用】',
        `玩家填写名称：${pending.form.title}`,
        `规则：${pending.form.rule_text}`,
        `范围：${pending.form.scope_mode}`,
        pending.form.character_ids.length ? `指定角色：${pending.form.character_ids.join('、')}` : '',
        pending.form.presentation_tone ? `表现倾向：${pending.form.presentation_tone}` : '',
        pending.form.excluded_content ? `排除内容：${pending.form.excluded_content}` : '',
        '请生成启用剧情，并输出结构化隐藏源头草案；不要把它写成可执行物品、按钮或正式永久解锁。',
      ].filter(Boolean).join('\n'));
    }
  } else {
    const text = buildOrdinaryAnomalyPrompt(state);
    if (text) sections.push(text);
  }

  if (options.includeSceneItems !== false) {
    const items = sceneItemPrompt(state);
    if (items) sections.push(items);
  }

  // Leak guard: ordinary/facility contexts must not embed hidden_origin JSON even if caller errs.
  const joined = sections.filter(Boolean).join('\n\n');
  if (kind === 'ordinary' || kind === 'facility_action' || kind === 'refit') {
    if (/"resolution_method"/.test(joined) || /hidden_origin/.test(joined)) {
      const projection = anomalyPublicProjection(state, { includeHidden: false });
      return [
        '【场景事实】',
        `日期：第 ${state.environment?.day ?? 1} 日 ${state.environment?.time_period ?? '清晨'}`,
        projection ? buildOrdinaryAnomalyPrompt(state) : '',
        options.includeSceneItems === false ? '' : sceneItemPrompt(state),
      ].filter(Boolean).join('\n\n');
    }
  }
  return joined;
}

export function assertNoHiddenOriginLeak(text: string) {
  if (/hidden_origin/i.test(text) || /"resolution_method"/.test(text)) {
    throw new Error('普通提示上下文泄露了隐藏异变源头');
  }
}
