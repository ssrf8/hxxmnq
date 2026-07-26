import type {
  AnomalyActivationForm,
  AnomalyActive,
  AnomalyHiddenOrigin,
  AnomalyPendingActivation,
  GardenState,
} from './types';
import { periodSerialFromState } from './time-rules';
import { reserveConsumable, consumableCount } from './inventory-rules';

export const ANOMALY_DURATION_PERIODS = 28;
export const ANOMALY_HISTORY_LIMIT = 8;

export interface AnomalyOriginReceipt {
  origin: AnomalyHiddenOrigin;
  publicSummary: string;
}

function lastTaggedJson(text: string, tag: string): unknown {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'giu');
  let value: unknown = null;
  for (const match of text.matchAll(pattern)) {
    try { value = JSON.parse(match[1]); } catch { value = null; }
  }
  return value;
}

export function parseAnomalyOriginReceipt(text: string): AnomalyOriginReceipt {
  const raw = lastTaggedJson(text, 'GensokyoAnomalyOrigin') as Record<string, unknown> | null;
  if (!raw || raw.version !== 'anomaly-origin.v1' || typeof raw.origin !== 'object' || !raw.origin) {
    throw new Error('异变启用回复缺少合法的 GensokyoAnomalyOrigin 回执');
  }
  return {
    origin: validateHiddenOrigin(raw.origin as Partial<AnomalyHiddenOrigin>),
    publicSummary: clampText(String(raw.public_summary ?? ''), 240),
  };
}

export function parseAnomalyClueReceipt(text: string): string {
  const raw = lastTaggedJson(text, 'GensokyoAnomalyClue') as Record<string, unknown> | null;
  const summary = clampText(String(raw?.summary ?? ''), 120);
  if (!raw || raw.version !== 'anomaly-clue.v1' || !summary) {
    throw new Error('调查回复缺少合法的 GensokyoAnomalyClue 回执');
  }
  return summary;
}

const SCOPE_MODES = new Set(['all', 'present', 'specified']);

function clampText(value: string, max: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function sanitizeAnomalyForm(input: Partial<AnomalyActivationForm>): AnomalyActivationForm {
  const scope_mode = SCOPE_MODES.has(String(input.scope_mode)) ? input.scope_mode as AnomalyActivationForm['scope_mode'] : 'all';
  const character_ids = Array.from(new Set((input.character_ids ?? []).filter((id) => /^[a-z0-9_]{1,32}$/u.test(id)))).slice(0, 8);
  if (scope_mode === 'specified' && character_ids.length < 1) {
    throw new Error('指定角色范围至少选择一名角色');
  }
  const title = clampText(String(input.title ?? ''), 40);
  const rule_text = clampText(String(input.rule_text ?? ''), 600);
  if (!title) throw new Error('异变名称不能为空');
  if (!rule_text) throw new Error('异变核心规则不能为空');
  return {
    title,
    rule_text,
    scope_mode,
    character_ids: scope_mode === 'specified' ? character_ids : [],
    presentation_tone: clampText(String(input.presentation_tone ?? ''), 160),
    excluded_content: clampText(String(input.excluded_content ?? ''), 240),
  };
}

export function canStartAnomaly(state: GardenState): string {
  if (state.anomaly_cycle?.active) return '已有活动异变，不能叠加';
  if (state.anomaly_cycle?.pending_activation) return '已有进行中的异变启用事务';
  if (consumableCount(state, 'incident_trigger_card') < 1) return '没有可用的异变触发卡';
  if (state.battle?.current || state.events?.active_event || state.interaction?.current_session) {
    return '战斗、固定剧情或受控会话进行中，不能启用异变';
  }
  return '';
}

export function reserveAnomalyActivation(
  before: GardenState,
  formInput: Partial<AnomalyActivationForm>,
  transactionId: string,
): GardenState {
  if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(transactionId)) throw new Error('异变事务 ID 非法');
  const blocked = canStartAnomaly(before);
  if (blocked) throw new Error(blocked);
  if (before.anomaly_cycle?.pending_activation?.transaction_id === transactionId) {
    return structuredClone(before);
  }
  const form = sanitizeAnomalyForm(formInput);
  // Reserve card quantity into pending without final consume semantics beyond holding one unit aside.
  const reserved = reserveConsumable(before, 'incident_trigger_card', 1);
  const pending: AnomalyPendingActivation = {
    transaction_id: transactionId,
    reserved_item_id: 'incident_trigger_card',
    form,
    created_at_serial: periodSerialFromState(before),
    activation_message_id: null,
  };
  reserved.anomaly_cycle ??= { pending_activation: null, active: null, history: [] };
  reserved.anomaly_cycle.pending_activation = pending;
  return reserved;
}

export function cancelAnomalyActivation(before: GardenState, transactionId?: string): GardenState {
  const pending = before.anomaly_cycle?.pending_activation;
  if (!pending) return structuredClone(before);
  if (transactionId && pending.transaction_id !== transactionId) return structuredClone(before);
  const state = structuredClone(before);
  state.inventory ??= { consumables: {} };
  state.inventory.consumables ??= {};
  state.inventory.consumables.incident_trigger_card = Math.min(
    99,
    (state.inventory.consumables.incident_trigger_card ?? 0) + 1,
  );
  state.anomaly_cycle ??= { pending_activation: null, active: null, history: [] };
  state.anomaly_cycle.pending_activation = null;
  return state;
}

export function validateHiddenOrigin(input: Partial<AnomalyHiddenOrigin>): AnomalyHiddenOrigin {
  const origin: AnomalyHiddenOrigin = {
    name: clampText(String(input.name ?? ''), 40),
    type: clampText(String(input.type ?? ''), 40),
    summary: clampText(String(input.summary ?? ''), 240),
    location: clampText(String(input.location ?? ''), 80),
    cause: clampText(String(input.cause ?? ''), 160),
    resolution_method: clampText(String(input.resolution_method ?? ''), 160),
  };
  if (!origin.name || !origin.summary || !origin.resolution_method) {
    throw new Error('隐藏源头结构不完整');
  }
  return origin;
}

function deterministicIndex(seed: string, length: number) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, length);
}

/**
 * Creates the private anomaly origin without asking either model to own game state.
 * The player's rule remains authoritative; the seed only chooses presentation facts.
 */
export function createDeterministicAnomalyOrigin(
  formInput: Partial<AnomalyActivationForm>,
  transactionId: string,
): { origin: AnomalyHiddenOrigin; publicSummary: string } {
  const form = sanitizeAnomalyForm(formInput);
  const locations = ['中央庭院的旧石灯下', '旧主屋屋檐的结界缝隙', '温室地基旁的废弃法阵', '庭园边缘的漂移锚点'];
  const vessels = [
    { name: '错位的缘结镜', type: '物件', action: '由灵梦切断镜面与庭园结界之间的错误缘线' },
    { name: '倒转的愿签束', type: '符物', action: '由灵梦逐张解除愿签并封住聚集的愿力' },
    { name: '失序的庭园锚钉', type: '结界节点', action: '由灵梦校正锚钉方向并重新固定结界坐标' },
    { name: '回声妖力结晶', type: '妖力凝结物', action: '由灵梦击散结晶并净化残留的妖力回声' },
  ];
  const causes = ['庭园漂移时积存的愿力发生了偏转', '旧结界把来访者残留的念头错误叠加', '锚点移动令一段妖力回路失去约束', '长期未清理的结界回声自行凝结'];
  const vessel = vessels[deterministicIndex(`${transactionId}:vessel`, vessels.length)];
  const location = locations[deterministicIndex(`${transactionId}:location`, locations.length)];
  const cause = causes[deterministicIndex(`${transactionId}:cause`, causes.length)];
  return {
    origin: {
      name: vessel.name,
      type: vessel.type,
      summary: `${vessel.name}把「${form.title}」的规则投射到了庭园中的受影响者身上`,
      location,
      cause,
      resolution_method: vessel.action,
    },
    publicSummary: `「${form.title}」已经开始影响庭园，灵梦正在追查引发异变的源头。`,
  };
}

export function commitAnomalyActivation(
  before: GardenState,
  originInput: Partial<AnomalyHiddenOrigin>,
  publicSummary = '',
): GardenState {
  const pending = before.anomaly_cycle?.pending_activation;
  if (!pending) throw new Error('没有待提交的异变启用事务');
  if (before.anomaly_cycle?.active) throw new Error('已有活动异变');
  const origin = validateHiddenOrigin(originInput);
  const start = periodSerialFromState(before);
  const active: AnomalyActive = {
    anomaly_id: pending.transaction_id,
    title: pending.form.title,
    rule_text: pending.form.rule_text,
    scope_mode: pending.form.scope_mode,
    character_ids: [...pending.form.character_ids],
    presentation_tone: pending.form.presentation_tone,
    excluded_content: pending.form.excluded_content,
    hidden_origin: origin,
    public_summary: clampText(publicSummary || `${pending.form.title}开始影响庭园。`, 240),
    revealed_clues: [],
    status: 'active',
    start_period_serial: start,
    end_period_serial: start + ANOMALY_DURATION_PERIODS,
    last_guidance_day: before.environment?.day ?? 1,
    last_clue_day: null,
    activation_message_id: pending.activation_message_id,
    resolution_message_id: null,
  };
  const state = structuredClone(before);
  state.anomaly_cycle ??= { pending_activation: null, active: null, history: [] };
  // Card already reserved (removed from inventory). Keep consumed.
  state.anomaly_cycle.pending_activation = null;
  state.anomaly_cycle.active = active;
  return state;
}

export function anomalyPublicProjection(state: GardenState, options: { includeHidden?: boolean; finalResolution?: boolean } = {}) {
  const active = state.anomaly_cycle?.active;
  if (!active) return null;
  const now = periodSerialFromState(state);
  const remaining = Math.max(0, active.end_period_serial - now);
  const dayIndex = Math.min(7, Math.floor((now - active.start_period_serial) / 4) + 1);
  const projection: Record<string, unknown> = {
    title: active.title,
    rule_text: active.rule_text,
    scope_mode: active.scope_mode,
    character_ids: active.character_ids,
    presentation_tone: active.presentation_tone,
    excluded_content: active.excluded_content,
    public_summary: active.public_summary,
    day_index: dayIndex,
    remaining_periods: remaining,
    status: active.status,
    revealed_clues: active.revealed_clues,
    needs_daily_guidance: active.last_guidance_day !== (state.environment?.day ?? 1),
    final_resolution: Boolean(options.finalResolution || active.status === 'resolving'),
  };
  if (options.includeHidden || options.finalResolution || active.status === 'resolving') {
    projection.hidden_origin = active.hidden_origin;
  }
  return projection;
}

export function buildOrdinaryAnomalyPrompt(state: GardenState): string {
  const projection = anomalyPublicProjection(state, { includeHidden: false });
  if (!projection) return '';
  return [
    '【当前活动异变】',
    `名称：${projection.title}`,
    `规则：${projection.rule_text}`,
    `范围：${projection.scope_mode}`,
    projection.character_ids && (projection.character_ids as string[]).length
      ? `指定角色：${(projection.character_ids as string[]).join('、')}`
      : '',
    projection.presentation_tone ? `表现倾向：${projection.presentation_tone}` : '',
    projection.excluded_content ? `排除内容：${projection.excluded_content}` : '',
    `第 ${projection.day_index} 日，剩余 ${projection.remaining_periods} 个标准时段`,
    projection.needs_daily_guidance ? '本轮若合适，只能用一两句概括灵梦仍在调查；具体线索必须留给“每日异变调查”入口。' : '',
    '普通聊天不得新增、猜定或指向异变源头、位置、成因、解决办法或调查路线，也不得把自由聊天改写成固定调查剧情。',
    '不得改写异变规则、期限、范围或隐藏源头。',
  ].filter(Boolean).join('\n');
}

export function buildDailyInvestigationPrompt(state: GardenState): string {
  const projection = anomalyPublicProjection(state, { includeHidden: true });
  if (!projection) return '';
  return [
    '【灵梦每日异变调查】',
    `锁定源头（仅本调查可见）：${JSON.stringify(projection.hidden_origin)}`,
    `已公开线索：${JSON.stringify(projection.revealed_clues ?? [])}`,
    '今日最多新增一条简短进展，不能完整揭露源头。',
  ].join('\n');
}

export function buildFinalResolutionPrompt(state: GardenState): string {
  const projection = anomalyPublicProjection(state, { finalResolution: true });
  if (!projection) return '';
  return [
    '【异变最终收束】',
    `完整源头：${JSON.stringify(projection.hidden_origin)}`,
    '公开源头并按 resolution_method 完成收束；不得开启新的活动异变。',
  ].join('\n');
}

export function appendDailyClue(before: GardenState, summary: string): GardenState {
  const active = before.anomaly_cycle?.active;
  if (!active || active.status !== 'active') throw new Error('没有可追加线索的活动异变');
  const day = before.environment?.day ?? 1;
  if (active.last_clue_day === day) return structuredClone(before);
  const state = structuredClone(before);
  const next = state.anomaly_cycle!.active!;
  next.revealed_clues = [...(next.revealed_clues ?? []), {
    day,
    summary: clampText(summary, 120),
  }].slice(-8);
  next.last_clue_day = day;
  next.last_guidance_day = day;
  return state;
}

export function tickAnomalyLifecycle(before: GardenState): GardenState {
  const active = before.anomaly_cycle?.active;
  if (!active) return structuredClone(before);
  const state = structuredClone(before);
  const now = periodSerialFromState(state);
  if (active.status === 'active' && now >= active.end_period_serial) {
    state.anomaly_cycle!.active!.status = 'resolving';
  }
  return state;
}

export function resolveAnomaly(before: GardenState, resolutionMessageId: number | null = null): GardenState {
  const active = before.anomaly_cycle?.active;
  if (!active) throw new Error('没有可收束的活动异变');
  const state = structuredClone(before);
  const historyEntry = {
    anomaly_id: active.anomaly_id,
    title: active.title,
    start_period_serial: active.start_period_serial,
    end_period_serial: active.end_period_serial,
    origin_summary: active.hidden_origin.summary,
  };
  state.anomaly_cycle ??= { pending_activation: null, active: null, history: [] };
  state.anomaly_cycle.history = [...(state.anomaly_cycle.history ?? []), historyEntry].slice(-ANOMALY_HISTORY_LIMIT);
  state.anomaly_cycle.active = null;
  state.pending_tasks = (state.pending_tasks ?? []).filter((task) => (
    task.kind !== 'anomaly_resolution' || task.source_id !== active.anomaly_id
  ));
  if (resolutionMessageId != null) {
    // retained only in history path; active cleared
  }
  return state;
}

export function anomalyCardDisabledReason(state: GardenState): string {
  if (state.anomaly_cycle?.active) {
    const now = periodSerialFromState(state);
    const remaining = Math.max(0, state.anomaly_cycle.active.end_period_serial - now);
    return `已有异变，剩余 ${remaining} 时段`;
  }
  if (state.anomaly_cycle?.pending_activation) return '异变启用事务进行中';
  if (consumableCount(state, 'incident_trigger_card') < 1) return '没有异变触发卡';
  return '';
}
