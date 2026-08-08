import visitCatalog from '../visitors/visit-profiles.json';
import duelCatalog from '../battle/duel-profiles.json';
import type { GardenState, TimePeriod, VisitPlan, VisitSource, VisitorMeta } from './types';
import { periodSerialFromState } from './time-rules';
import { reconcileCharacterVisitsFromState } from './character-memory';

export interface VisitProfile {
  character_id: string;
  display_name: string;
  eligibility: string;
  time_weights: Record<TimePeriod, number>;
  interest_tags: string[];
  arrival_area_preferences: string[];
  crowd_preference: 'low' | 'medium' | 'high';
  stay_period_range: [number, number];
  cooldown_period_range: [number, number];
  invitation_policy: { accept_weight: number; reschedule_weight: number; decline_weight: number };
  arrival_reason_ids: string[];
  base_weight: number;
}

const profiles = visitCatalog.profiles as VisitProfile[];
const profileById = new Map(profiles.map((profile) => [profile.character_id, profile]));
const duelRegisteredIds = new Set(
  duelCatalog.profiles
    .filter((profile) => profile.enabled)
    .map((profile) => profile.character_id),
);
const ORDINARY_CAP = visitCatalog.ordinary_visitor_cap ?? 3;
const BANQUET_CAP = visitCatalog.banquet_visitor_cap ?? 6;

export function listVisitProfiles(): VisitProfile[] {
  return profiles.map((profile) => ({ ...profile }));
}

export function getVisitProfile(characterId: string) {
  return profileById.get(characterId);
}

export function listOpportunityCandidateProfiles(state: GardenState): VisitProfile[] {
  const present = new Set(state.presence_snapshot?.present_character_ids ?? []);
  const planned = new Set(
    (state.visit_scheduler?.plans ?? [])
      .filter((plan) => plan.status === 'scheduled' || plan.status === 'deferred')
      .map((plan) => plan.character_id),
  );
  return profiles
    .filter((profile) => duelRegisteredIds.has(profile.character_id))
    .filter((profile) => !isCharacterKnown(state, profile.character_id))
    .filter((profile) => !present.has(profile.character_id))
    .filter((profile) => !planned.has(profile.character_id))
    .sort((a, b) => a.character_id < b.character_id ? -1 : a.character_id > b.character_id ? 1 : 0)
    .map((profile) => ({ ...profile }));
}

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stableRoll(seed: string, modulo: number): number {
  if (!Number.isInteger(modulo) || modulo <= 0) return 0;
  return hashSeed(seed) % modulo;
}

/**
 * 根据角色来访档案构造确定性的 VisitorMeta（不写 state）。
 * 无档案时返回 null。arrivalUid / reasonId 由调用方提供稳定且可复现的标识。
 */
export function buildVisitorMetaForArrival(
  state: GardenState,
  characterId: string,
  arrivalUid: string,
  reasonId: string,
  source: VisitSource,
): VisitorMeta | null {
  const profile = profileById.get(characterId);
  if (!profile) return null;
  const serial = periodSerialFromState(state);
  const stay = profile.stay_period_range[0]
    + stableRoll(`stay:${arrivalUid}`, profile.stay_period_range[1] - profile.stay_period_range[0] + 1);
  return {
    arrival_uid: arrivalUid,
    reason_id: reasonId,
    source,
    arrived_period_serial: serial,
    earliest_departure_serial: serial + 1,
    planned_departure_serial: serial + stay,
  };
}

export function isCharacterKnown(state: GardenState, characterId: string): boolean {
  if (state.visit_scheduler?.known_characters?.includes(characterId)) return true;
  const completed = state.events?.completed_key_events ?? {};
  switch (characterId) {
    case 'reimu':
      return Boolean(completed.reimu_boundary_inspection || state.meta?.opening_committed || state.meta?.initialized);
    case 'marisa':
      return Boolean(completed.marisa_material_rumor || completed.greenhouse_free_growth_proposal || completed.greenhouse_multiturn_conversation);
    case 'alice':
      return Boolean(completed.alice_greenhouse_maintenance_proposal);
    case 'nitori':
      return Boolean(completed.nitori_greenhouse_automation_proposal);
    case 'cirno':
      return Boolean(completed.cirno_fairy_garden_meeting || completed.cirno_first_meeting);
    case 'mystia':
      return Boolean(completed.mystia_first_meeting || completed.mystia_banquet_meeting);
    case 'suika':
      return Boolean(completed.suika_first_meeting || completed.suika_banquet_meeting);
    case 'sakuya':
      return Boolean(completed.sakuya_temporal_trace_investigation || completed.sakuya_first_meeting);
    default:
      return false;
  }
}

export function deriveKnownCharacters(state: GardenState): string[] {
  return profiles
    .map((profile) => profile.character_id)
    .filter((characterId) => isCharacterKnown(state, characterId));
}

export function visitorCap(state: GardenState): number {
  const banquetActive = state.garden_activities?.banquet?.status === 'active';
  return banquetActive ? BANQUET_CAP : ORDINARY_CAP;
}

export function presentVisitorCount(state: GardenState): number {
  return (state.presence_snapshot?.present_character_ids ?? []).length;
}

function ensureScheduler(state: GardenState) {
  state.visit_scheduler ??= {
    version: 'visit.v1',
    known_characters: [],
    plans: [],
    cooldown_until: {},
    invitation_cooldowns: {},
    last_processed_serial: null,
    pending_notices: [],
  };
  state.visit_scheduler.version = 'visit.v1';
  state.visit_scheduler.known_characters = Array.from(new Set([
    ...(state.visit_scheduler.known_characters ?? []),
    ...deriveKnownCharacters(state),
  ]));
  state.visit_scheduler.plans ??= [];
  state.visit_scheduler.cooldown_until ??= {};
  state.visit_scheduler.invitation_cooldowns ??= {};
  state.visit_scheduler.pending_notices ??= [];
  state.presence_snapshot ??= { present_character_ids: [], character_views: {} };
  state.presence_snapshot.visitor_meta ??= {};
}

function noticeText(characterId: string, reasonId: string, kind: 'arrival' | 'departure') {
  const name = profileById.get(characterId)?.display_name ?? characterId;
  if (kind === 'departure') return `${name}离开了庭园。`;
  const reasonMap: Record<string, string> = {
    boundary_check: `${name}来检查结界动静。`,
    anomaly_watch: `${name}因异变迹象短暂到访。`,
    formal_visit: `${name}正式来访。`,
    magic_curiosity: `${name}骑着扫帚落在温室附近。`,
    greenhouse_peek: `${name}来看温室近况。`,
    borrow_something: `${name}好像又来“借”点什么。`,
    maintenance_followup: `${name}按计划来跟进维护。`,
    planned_visit: `${name}如约到访。`,
    structure_check: `${name}来查看结构状况。`,
    instrument_check: `${name}带着仪器来校准。`,
    engineering_followup: `${name}来跟进工程测量。`,
    commission: `${name}为委托而来。`,
    fairy_play: `${name}忽然冲进了庭园。`,
    challenge: `${name}来找人比试。`,
    freeze_curiosity: `${name}被冰凉的动静吸引而来。`,
    night_crowd: `${name}循着夜间客流出现。`,
    performance_chance: `${name}来找表演机会。`,
    stall_idea: `${name}想看看能不能摆摊。`,
    follow_noise: `${name}循着热闹找来了。`,
    banquet_smell: `${name}被宴会气味吸引。`,
    gathering: `${name}来凑热闹。`,
    time_trace: `${name}为时间痕迹而来。`,
    precise_errand: `${name}带着明确事务到访。`,
    formal_invitation: `${name}应邀请到来。`,
    invitation: `${name}应邀到来。`,
    opportunity_encounter: `一场意外的机遇把${name}带到了庭院。`,
  };
  return reasonMap[reasonId] ?? `${name}来到了庭园。`;
}

export function evaluateVisitScheduler(
  before: GardenState,
  options: { chatId?: string; commitArrivals?: boolean; busy?: boolean } = {},
): { state: GardenState; notices: string[] } {
  const state = structuredClone(before);
  ensureScheduler(state);
  const serial = periodSerialFromState(state);
  const notices: string[] = [];
  const busy = Boolean(options.busy
    || state.battle?.current
    || state.events?.active_event
    || state.interaction?.current_session
    || state.anomaly_cycle?.active?.status === 'resolving'
    || state.anomaly_cycle?.pending_activation);

  // Departures for visitors whose planned leave has passed.
  const present = new Set(state.presence_snapshot?.present_character_ids ?? []);
  for (const characterId of [...present]) {
    const meta = state.presence_snapshot?.visitor_meta?.[characterId];
    if (meta?.planned_departure_serial == null) continue;
    if (meta.planned_departure_serial > serial) continue;
    if (busy && (state.interaction?.current_session?.participant_character_ids?.includes(characterId)
      || state.events?.active_event?.participant_character_ids?.includes(characterId))) {
      continue;
    }
    present.delete(characterId);
    delete state.presence_snapshot!.character_views?.[characterId];
    delete state.presence_snapshot!.visitor_meta?.[characterId];
    const profile = profileById.get(characterId);
    const cooldown = profile
      ? profile.cooldown_period_range[0] + stableRoll(`cooldown:${characterId}:${serial}`, profile.cooldown_period_range[1] - profile.cooldown_period_range[0] + 1)
      : 2;
    state.visit_scheduler!.cooldown_until![characterId] = serial + cooldown;
    const text = noticeText(characterId, meta.reason_id ?? 'formal_visit', 'departure');
    state.visit_scheduler!.pending_notices = [...(state.visit_scheduler!.pending_notices ?? []), text].slice(-12);
    notices.push(text);
  }
  state.presence_snapshot!.present_character_ids = Array.from(present);

  // Commit due plans at safe points only.
  const duePlans = (state.visit_scheduler!.plans ?? []).filter((plan) => (
    (plan.status === 'scheduled' || plan.status === 'deferred') && (plan.due_serial ?? 0) <= serial
  ));
  for (const plan of duePlans) {
    if (busy && !options.commitArrivals) {
      continue;
    }
    if (present.has(plan.character_id)) {
      plan.status = 'cancelled';
      continue;
    }
    if ((state.visit_scheduler!.cooldown_until?.[plan.character_id] ?? 0) > serial) {
      plan.status = 'cancelled';
      continue;
    }
    if (present.size >= visitorCap(state) && plan.source !== 'event') {
      plan.status = 'deferred';
      plan.due_serial = serial + 1;
      continue;
    }
    const profile = profileById.get(plan.character_id);
    if (!profile) {
      plan.status = 'cancelled';
      continue;
    }
    const stay = profile.stay_period_range[0] + stableRoll(`stay:${plan.plan_id}`, profile.stay_period_range[1] - profile.stay_period_range[0] + 1);
    const area = plan.target_area_id || profile.arrival_area_preferences[0] || 'central_courtyard';
    present.add(plan.character_id);
    state.presence_snapshot!.character_views ??= {};
    state.presence_snapshot!.character_views[plan.character_id] = {
      area_id: area,
      action: '到访',
      facing: 'front',
    };
    state.presence_snapshot!.visitor_meta ??= {};
    state.presence_snapshot!.visitor_meta[plan.character_id] = {
      arrival_uid: plan.plan_id,
      reason_id: plan.reason_id,
      source: plan.source,
      arrived_period_serial: serial,
      earliest_departure_serial: serial + 1,
      planned_departure_serial: serial + stay,
    };
    plan.status = 'arrived';
    const text = noticeText(plan.character_id, plan.reason_id, 'arrival');
    state.visit_scheduler!.pending_notices = [...(state.visit_scheduler!.pending_notices ?? []), text].slice(-12);
    notices.push(text);
  }
  state.presence_snapshot!.present_character_ids = Array.from(present);
  state.visit_scheduler!.plans = (state.visit_scheduler!.plans ?? [])
    .filter((plan) => plan.status === 'scheduled' || plan.status === 'deferred')
    .slice(-32);

  // At most one ordinary random arrival plan per newly processed period.
  if ((state.visit_scheduler!.last_processed_serial ?? -1) < serial && !busy) {
    maybeScheduleRandomVisit(state, serial, options.chatId ?? 'local');
    state.visit_scheduler!.last_processed_serial = serial;
  }

  // B1-T09：visitor scheduler 写点（departures + committed arrivals）→ visit 生命周期协调
  // （cause=scheduler；before 为函数入参，协调基于本次 scheduler 产生的 presence 差异）。
  const reconciled = reconcileCharacterVisitsFromState(before, state, 'scheduler');
  return { state: reconciled, notices };
}

function maybeScheduleRandomVisit(state: GardenState, serial: number, chatId: string) {
  if (presentVisitorCount(state) >= visitorCap(state)) return;
  if ((state.visit_scheduler?.plans ?? []).some((plan) => plan.status === 'scheduled' && plan.source === 'random' && plan.due_serial === serial)) {
    return;
  }
  const period = (state.environment?.time_period ?? '清晨') as TimePeriod;
  const present = new Set(state.presence_snapshot?.present_character_ids ?? []);
  const candidates: Array<{ characterId: string; weight: number; profile: VisitProfile }> = [];
  for (const profile of profiles) {
    if (!isCharacterKnown(state, profile.character_id)) continue;
    if (present.has(profile.character_id)) continue;
    if ((state.visit_scheduler?.cooldown_until?.[profile.character_id] ?? 0) > serial) continue;
    const timeWeight = profile.time_weights[period] ?? 0;
    if (timeWeight <= 0) continue;
    let weight = profile.base_weight * timeWeight;
    if (state.anomaly_cycle?.active && profile.character_id === 'reimu') weight = Math.floor(weight * 1.5);
    if (weight > 0) candidates.push({ characterId: profile.character_id, weight, profile });
  }
  if (!candidates.length) return;
  // empty slot chance ~35%
  const emptyRoll = stableRoll(`visit-empty:${chatId}:${serial}`, 100);
  if (emptyRoll < 35) return;
  const total = candidates.reduce((sum, item) => sum + item.weight, 0);
  let cursor = stableRoll(`visit-pick:${chatId}:${serial}`, total);
  let chosen = candidates[0];
  for (const candidate of candidates) {
    if (cursor < candidate.weight) {
      chosen = candidate;
      break;
    }
    cursor -= candidate.weight;
  }
  const reasonId = chosen.profile.arrival_reason_ids[
    stableRoll(`visit-reason:${chatId}:${serial}:${chosen.characterId}`, chosen.profile.arrival_reason_ids.length)
  ] ?? chosen.profile.arrival_reason_ids[0];
  const area = chosen.profile.arrival_area_preferences[
    stableRoll(`visit-area:${chatId}:${serial}:${chosen.characterId}`, chosen.profile.arrival_area_preferences.length)
  ] ?? 'central_courtyard';
  const plan: VisitPlan = {
    plan_id: `visit:${chatId}:${serial}:${chosen.characterId}`,
    character_id: chosen.characterId,
    kind: 'random',
    due_serial: serial,
    status: 'scheduled',
    roll_seed: `visit-pick:${chatId}:${serial}`,
    reason_id: reasonId,
    target_area_id: area,
    source: 'random',
  };
  state.visit_scheduler!.plans = [...(state.visit_scheduler!.plans ?? []), plan].slice(-32);
}

export function inviteCharacter(
  before: GardenState,
  characterId: string,
  inviteId: string,
  chatId = 'local',
): { state: GardenState; result: 'accept_now' | 'reschedule' | 'decline'; message: string } {
  if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(inviteId)) throw new Error('邀请 ID 非法');
  const state = structuredClone(before);
  ensureScheduler(state);
  if ((state.visit_scheduler!.plans ?? []).some((plan) => plan.plan_id === inviteId)) {
    const existing = state.visit_scheduler!.plans!.find((plan) => plan.plan_id === inviteId)!;
    const currentSerial = periodSerialFromState(state);
    const result = existing.status === 'cancelled'
      ? 'decline'
      : existing.status === 'deferred'
        ? 'reschedule'
        : existing.due_serial === currentSerial
          ? 'accept_now'
          : 'reschedule';
    return {
      state,
      result,
      message: existing.status === 'cancelled' ? '邀请已被拒绝。' : '邀请结果已登记。',
    };
  }
  if (!isCharacterKnown(state, characterId)) throw new Error('尚未正式认识该角色，不能邀请');
  const profile = profileById.get(characterId);
  if (!profile) throw new Error('角色没有来访档案');
  const serial = periodSerialFromState(state);
  if ((state.visit_scheduler!.invitation_cooldowns?.[characterId] ?? 0) > serial) {
    throw new Error('该角色的邀请仍在冷却中');
  }
  // 普通来访冷却（刚离场）期间不接受新邀请：明确拒绝，避免 accept roll 命中后
  // 计划被 scheduler 取消却仍向玩家谎报“之后会来”。
  if ((state.visit_scheduler!.cooldown_until?.[characterId] ?? 0) > serial) {
    throw new Error('该角色刚离开庭园，暂时不能邀请');
  }
  if ((state.presence_snapshot?.present_character_ids ?? []).includes(characterId)) {
    throw new Error('该角色已在庭园中');
  }
  const total = profile.invitation_policy.accept_weight
    + profile.invitation_policy.reschedule_weight
    + profile.invitation_policy.decline_weight;
  const roll = stableRoll(`invite:${inviteId}`, total);
  let result: 'accept_now' | 'reschedule' | 'decline' = 'decline';
  if (roll < profile.invitation_policy.accept_weight) result = 'accept_now';
  else if (roll < profile.invitation_policy.accept_weight + profile.invitation_policy.reschedule_weight) result = 'reschedule';
  const reasonId = 'invitation';
  if (result === 'decline') {
    state.visit_scheduler!.invitation_cooldowns![characterId] = serial + 2;
    const declinedPlan: VisitPlan = {
      plan_id: inviteId,
      character_id: characterId,
      kind: 'invitation',
      due_serial: serial,
      status: 'cancelled',
      roll_seed: `invite:${inviteId}`,
      reason_id: reasonId,
      target_area_id: profile.arrival_area_preferences[0] ?? 'central_courtyard',
      source: 'invitation',
    };
    state.visit_scheduler!.plans = [...(state.visit_scheduler!.plans ?? []), declinedPlan].slice(-32);
    return { state, result, message: `${profile.display_name}现在不方便过来。` };
  }
  const due = result === 'accept_now' ? serial : serial + 1 + stableRoll(`invite-delay:${inviteId}`, 3);
  const scheduledPlan: VisitPlan = {
    plan_id: inviteId,
    character_id: characterId,
    kind: 'invitation',
    due_serial: due,
    status: 'scheduled',
    roll_seed: `invite:${inviteId}`,
    reason_id: reasonId,
    target_area_id: profile.arrival_area_preferences[0] ?? 'central_courtyard',
    source: 'invitation',
  };
  state.visit_scheduler!.plans = [...(state.visit_scheduler!.plans ?? []), scheduledPlan].slice(-32);
  if (result === 'accept_now') {
    const committed = evaluateVisitScheduler(state, { chatId, commitArrivals: true, busy: false });
    const arrived = Boolean(
      committed.state.presence_snapshot?.present_character_ids?.includes(characterId),
    );
    const keptPlan = committed.state.visit_scheduler?.plans?.find((plan) => plan.plan_id === inviteId);
    if (arrived) {
      return {
        state: committed.state,
        result: 'accept_now',
        message: `${profile.display_name}答应现在过来。`,
      };
    }
    // accept roll 命中但协调后未到场（如满员被 defer）：如实返回改约。
    if (keptPlan?.status === 'deferred') {
      return {
        state: committed.state,
        result: 'reschedule',
        message: `${profile.display_name}现在过来的人已经满了，改约到之后的时段再来。`,
      };
    }
    // 协调后未到场且计划已不存在（例如被 scheduler 因冷却取消并删除）：
    // 绝不能谎报“之后会来”，明确拒绝。
    return {
      state: committed.state,
      result: 'decline',
      message: `${profile.display_name}现在不方便过来。`,
    };
  }
  return {
    state,
    result,
    message: `${profile.display_name}改约到之后的时段再来。`,
  };
}

export function consumeVisitNotices(before: GardenState): { state: GardenState; notices: string[] } {
  const state = structuredClone(before);
  ensureScheduler(state);
  const notices = [...(state.visit_scheduler?.pending_notices ?? [])];
  state.visit_scheduler!.pending_notices = [];
  return { state, notices };
}

export function markCharacterKnown(before: GardenState, characterId: string): GardenState {
  const state = structuredClone(before);
  ensureScheduler(state);
  state.visit_scheduler!.known_characters = Array.from(new Set([
    ...(state.visit_scheduler!.known_characters ?? []),
    characterId,
  ]));
  return state;
}

export function commitOpportunityArrival(
  before: GardenState,
  characterId: string,
  arrivalId: string,
): { state: GardenState; notice: string } {
  if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(arrivalId)) throw new Error('机遇到访 ID 非法');
  const profile = profileById.get(characterId);
  if (!profile || !duelRegisteredIds.has(characterId)) throw new Error('角色未完成本地登记');
  if (isCharacterKnown(before, characterId)) throw new Error('该角色已经认识');
  if ((before.presence_snapshot?.present_character_ids ?? []).includes(characterId)) throw new Error('该角色已在庭院中');
  if (presentVisitorCount(before) >= visitorCap(before)) throw new Error('庭院访客已满');

  const state = structuredClone(before);
  ensureScheduler(state);
  const serial = periodSerialFromState(state);
  const stay = profile.stay_period_range[0]
    + stableRoll(`opportunity-stay:${arrivalId}`, profile.stay_period_range[1] - profile.stay_period_range[0] + 1);
  const area = profile.arrival_area_preferences[
    stableRoll(`opportunity-area:${arrivalId}`, profile.arrival_area_preferences.length)
  ] ?? 'central_courtyard';
  state.presence_snapshot!.present_character_ids = Array.from(new Set([
    ...(state.presence_snapshot!.present_character_ids ?? []),
    characterId,
  ]));
  state.presence_snapshot!.character_views ??= {};
  state.presence_snapshot!.character_views[characterId] = {
    area_id: area,
    action: '因机遇到访',
    facing: 'front',
  };
  state.presence_snapshot!.visitor_meta ??= {};
  state.presence_snapshot!.visitor_meta[characterId] = {
    arrival_uid: arrivalId,
    reason_id: 'opportunity_encounter',
    source: 'opportunity_card',
    arrived_period_serial: serial,
    earliest_departure_serial: serial + 1,
    planned_departure_serial: serial + stay,
  };
  state.visit_scheduler!.known_characters = Array.from(new Set([
    ...(state.visit_scheduler!.known_characters ?? []),
    characterId,
  ]));
  const notice = noticeText(characterId, 'opportunity_encounter', 'arrival');
  state.visit_scheduler!.pending_notices = [
    ...(state.visit_scheduler!.pending_notices ?? []),
    notice,
  ].slice(-12);
  // B1-T09：opportunity card 到达写点 → visit 生命周期协调
  // （cause=event：本地受控道具路径，不使用模型回执/时间调度 cause）。
  const reconciled = reconcileCharacterVisitsFromState(before, state, 'event');
  return { state: reconciled, notice };
}
