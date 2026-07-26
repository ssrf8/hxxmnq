import facilityCatalog from '../facilities/catalog.json';
import riskCatalog from '../facilities/risk-conditions.json';
import type { FacilityRuntimeState, GardenState, ParticipationMode } from './types';
import { advanceOneTimePeriod, periodSerialFromState } from './time-rules';
import { consumableCount, reserveConsumable } from './inventory-rules';
import { isCharacterKnown, markCharacterKnown, stableRoll } from './visitor-rules';
import { charactersNearestToFacility } from './garden-spatial';

export interface FacilityFormAction {
  action_id: string;
  label: string;
  intent: string;
  risk_tag?: 'experiment' | 'challenge';
}

export interface FacilityFormDefinition {
  form_id: string;
  summary: string;
  default_mode?: ParticipationMode;
  force_no_refit_character?: boolean;
  quick_actions: FacilityFormAction[];
  refit_candidates: string[];
  risk_actions: string[];
}

export interface FacilityDefinition {
  facility_id: string;
  title: string;
  area_id: string;
  build_cost_materials: number;
  remodel_cost_materials: number;
  representative_character_id?: string;
  representative_character_ids?: string[];
  default_participation_mode: ParticipationMode;
  participation_fixed: boolean;
  forms: FacilityFormDefinition[];
}

const facilities = facilityCatalog.facilities as FacilityDefinition[];
const byId = new Map(facilities.map((facility) => [facility.facility_id, facility]));

function ensureFacilityRuntime(state: GardenState, facilityId: string): FacilityRuntimeState {
  state.facility_runtime ??= {};
  state.facility_runtime[facilityId] ??= {
    built: false,
    current_form: null,
    unlocked_forms: [],
    first_use_forms: [],
    activated_at_serial: null,
    distinct_chat_periods: [],
    second_form_choice_pending: false,
    unlock_deadline_2: null,
    unlock_deadline_3: null,
    status: 'normal',
    condition_id: null,
    risk_cooldown_until: null,
    pending_refit: null,
    pending_recovery: null,
  };
  return state.facility_runtime[facilityId];
}

export function listFacilityCatalog() {
  return facilities.map((facility) => ({ ...facility, forms: facility.forms.map((form) => ({ ...form })) }));
}

export function getFacilityDefinition(facilityId: string) {
  return byId.get(facilityId);
}

export function openGardenProjectsVisible(state: GardenState): boolean {
  return Boolean(state.events?.completed_key_events?.select_greenhouse_form);
}

export function facilityBuildBlock(state: GardenState, facilityId: string, formId: string): string {
  if (!openGardenProjectsVisible(state)) return '需要先完成首次温室选型，教程毕业后才能建设后续设施';
  const def = byId.get(facilityId);
  if (!def) return '未知设施';
  if (!def.forms.some((form) => form.form_id === formId)) return '未知设施形态';
  if (state.garden_projects?.active_construction) return '已有大型施工进行中';
  const runtime = state.facility_runtime?.[facilityId];
  if (runtime?.built || state.facilities?.[facilityId]?.current_form) return '该设施已经建成';
  if ((state.resources?.materials ?? 0) < def.build_cost_materials) {
    return `物资不足，需要 ${def.build_cost_materials} 点物资`;
  }
  return '';
}

export function buildFacility(
  before: GardenState,
  facilityId: string,
  formId: string,
  transactionId: string,
): GardenState {
  if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(transactionId)) throw new Error('施工事务 ID 非法');
  const blocked = facilityBuildBlock(before, facilityId, formId);
  if (blocked) throw new Error(blocked);
  if (before.events?.settled_ids?.includes(transactionId)) return structuredClone(before);
  const def = byId.get(facilityId)!;
  let state = structuredClone(before);
  state.resources ??= {};
  state.resources.materials = (state.resources.materials ?? 0) - def.build_cost_materials;
  state = advanceOneTimePeriod(state);
  const serial = periodSerialFromState(state);
  const runtime = ensureFacilityRuntime(state, facilityId);
  runtime.built = true;
  runtime.current_form = formId;
  runtime.unlocked_forms = [formId];
  runtime.activated_at_serial = serial;
  runtime.unlock_deadline_2 = serial + 12;
  runtime.unlock_deadline_3 = serial + 24;
  runtime.status = 'normal';
  state.facilities ??= {};
  state.facilities[facilityId] = {
    ...state.facilities[facilityId],
    id: facilityId,
    name: def.title,
    area_id: def.area_id,
    state: '启用',
    current_form: formId,
    unlocked_forms: [formId],
    active_effects: [],
  };
  state.areas ??= {};
  state.areas[def.area_id] = {
    ...state.areas[def.area_id],
    id: def.area_id,
    unlocked: true,
    state: '启用',
    main_facility_id: facilityId,
  };
  state.garden_projects ??= { active_construction: null };
  state.garden_projects.active_construction = null;
  state.events ??= {};
  state.events.settled_ids = Array.from(new Set([...(state.events.settled_ids ?? []), transactionId])).slice(-256);
  state.events.completed_key_events = {
    ...(state.events.completed_key_events ?? {}),
    [`build_${facilityId}`]: `day:${state.environment?.day ?? 1}`,
  };
  return state;
}

export function recordFacilityChatPeriod(before: GardenState, facilityId: string): GardenState {
  const state = structuredClone(before);
  const runtime = ensureFacilityRuntime(state, facilityId);
  if (!runtime.built) return state;
  const serial = periodSerialFromState(state);
  if (runtime.distinct_chat_periods?.includes(serial)) return state;
  runtime.distinct_chat_periods = [...(runtime.distinct_chat_periods ?? []), serial].slice(-16);
  refreshFacilityUnlocks(state, facilityId);
  return state;
}

function refreshFacilityUnlocks(state: GardenState, facilityId: string) {
  const def = byId.get(facilityId);
  const runtime = ensureFacilityRuntime(state, facilityId);
  if (!def || !runtime.built || !runtime.current_form) return;
  const serial = periodSerialFromState(state);
  const chatCount = runtime.distinct_chat_periods?.length ?? 0;
  const unlocked = new Set(runtime.unlocked_forms ?? []);
  const allForms = def.forms.map((form) => form.form_id);

  if (chatCount >= 2 || (runtime.unlock_deadline_2 != null && serial >= runtime.unlock_deadline_2)) {
    if (unlocked.size < 2) runtime.second_form_choice_pending = true;
  }
  if (chatCount >= 4 || (runtime.unlock_deadline_3 != null && serial >= runtime.unlock_deadline_3)) {
    for (const formId of allForms) unlocked.add(formId);
    runtime.second_form_choice_pending = false;
  }
  runtime.unlocked_forms = Array.from(unlocked);
  if (state.facilities?.[facilityId]) {
    state.facilities[facilityId].unlocked_forms = [...runtime.unlocked_forms];
  }
}

export function chooseSecondFacilityForm(before: GardenState, facilityId: string, formId: string): GardenState {
  const def = byId.get(facilityId);
  if (!def) throw new Error('未知设施');
  if (!def.forms.some((form) => form.form_id === formId)) throw new Error('未知形态');
  const state = structuredClone(before);
  const runtime = ensureFacilityRuntime(state, facilityId);
  if (!runtime.second_form_choice_pending) throw new Error('当前没有待选择的第二方案');
  if ((runtime.unlocked_forms ?? []).includes(formId)) throw new Error('该方案已经取得');
  runtime.unlocked_forms = Array.from(new Set([...(runtime.unlocked_forms ?? []), formId]));
  runtime.second_form_choice_pending = false;
  if (state.facilities?.[facilityId]) {
    state.facilities[facilityId].unlocked_forms = [...runtime.unlocked_forms];
  }
  return state;
}

export function facilityRemodelBlock(state: GardenState, facilityId: string, formId: string): string {
  const def = byId.get(facilityId);
  if (!def) return '未知设施';
  const runtime = state.facility_runtime?.[facilityId];
  if (!runtime?.built) return '设施尚未建成';
  if (!(runtime.unlocked_forms ?? []).includes(formId)) return '该形态尚未取得';
  if (runtime.current_form === formId) return '已经是当前形态';
  if (runtime.status === 'abnormal' || runtime.status === 'damaged') return '设施异常或损坏时不能换型';
  if (runtime.pending_refit) return '已有装修事务进行中';
  if (state.garden_activities?.banquet?.status === 'active' || state.garden_activities?.moon_spring_session) {
    return '有活动进行时不能换型';
  }
  const nearbyCharacters = charactersNearestToFacility(state, facilityId);
  if (nearbyCharacters.length > 0) {
    const names = nearbyCharacters.map((characterId) => state.characters?.[characterId]?.name ?? characterId);
    return `${names.join('、')}目前离该设施最近，请先让其移动到其他区域再装修`;
  }
  if ((state.resources?.materials ?? 0) < def.remodel_cost_materials) {
    return `物资不足，换型需要 ${def.remodel_cost_materials} 点物资`;
  }
  return '';
}

export function beginFacilityRemodel(
  before: GardenState,
  facilityId: string,
  formId: string,
  transactionId: string,
  chatId = 'local',
): { state: GardenState; selectedCharacterId: string | null } {
  const blocked = facilityRemodelBlock(before, facilityId, formId);
  if (blocked) throw new Error(blocked);
  const def = byId.get(facilityId)!;
  const form = def.forms.find((item) => item.form_id === formId)!;
  const state = structuredClone(before);
  state.resources ??= {};
  // reserve materials
  state.resources.materials = (state.resources.materials ?? 0) - def.remodel_cost_materials;
  const runtime = ensureFacilityRuntime(state, facilityId);
  let selectedCharacterId: string | null = null;
  if (!form.force_no_refit_character && form.refit_candidates.length) {
    const weighted: string[] = [];
    for (const characterId of form.refit_candidates) {
      weighted.push(characterId);
      const reps = [
        def.representative_character_id,
        ...(def.representative_character_ids ?? []),
      ].filter(Boolean);
      if (reps.includes(characterId) && !isCharacterKnown(state, characterId)) weighted.push(characterId);
    }
    selectedCharacterId = weighted[stableRoll(`refit:${transactionId}:${facilityId}:${formId}:${chatId}`, weighted.length)] ?? null;
  }
  runtime.pending_refit = {
    transaction_id: transactionId,
    target_form: formId,
    reserved_cost: def.remodel_cost_materials,
    selected_character_id: selectedCharacterId,
    first_meeting: Boolean(selectedCharacterId && !isCharacterKnown(state, selectedCharacterId)),
    started_at_serial: periodSerialFromState(state),
  };
  return { state, selectedCharacterId };
}

export function commitFacilityRemodel(before: GardenState, transactionId: string): GardenState {
  const state = structuredClone(before);
  const entry = Object.entries(state.facility_runtime ?? {}).find(([, runtime]) => runtime.pending_refit?.transaction_id === transactionId);
  if (!entry) {
    if (before.events?.settled_ids?.includes(transactionId)) return state;
    throw new Error('没有对应的装修事务');
  }
  const [facilityId, runtime] = entry;
  const pending = runtime.pending_refit!;
  let next = advanceOneTimePeriod(state);
  const nextRuntime = ensureFacilityRuntime(next, facilityId);
  nextRuntime.current_form = pending.target_form;
  nextRuntime.unlocked_forms = Array.from(new Set([...(nextRuntime.unlocked_forms ?? []), pending.target_form]));
  nextRuntime.pending_refit = null;
  if (next.facilities?.[facilityId]) {
    next.facilities[facilityId].current_form = pending.target_form;
    next.facilities[facilityId].unlocked_forms = [...nextRuntime.unlocked_forms];
  }
  if (pending.first_meeting && pending.selected_character_id) {
    next = markCharacterKnown(next, pending.selected_character_id);
    next.events ??= {};
    next.events.completed_key_events = {
      ...(next.events.completed_key_events ?? {}),
      [`${pending.selected_character_id}_first_meeting`]: `refit:${transactionId}`,
    };
  }
  next.events ??= {};
  next.events.settled_ids = Array.from(new Set([...(next.events.settled_ids ?? []), transactionId])).slice(-256);
  return next;
}

export function cancelFacilityRemodel(before: GardenState, transactionId: string): GardenState {
  const state = structuredClone(before);
  for (const runtime of Object.values(state.facility_runtime ?? {})) {
    if (runtime.pending_refit?.transaction_id !== transactionId) continue;
    state.resources ??= {};
    state.resources.materials = Math.min(20, (state.resources.materials ?? 0) + (runtime.pending_refit.reserved_cost ?? 0));
    runtime.pending_refit = null;
  }
  return state;
}

export function rollFacilityRisk(
  before: GardenState,
  facilityId: string,
  actionId: string,
  transactionId: string,
): { triggered: boolean; severity?: 'abnormal' | 'damaged'; conditionId?: string; state: GardenState } {
  const def = byId.get(facilityId);
  const formId = before.facility_runtime?.[facilityId]?.current_form
    ?? before.facilities?.[facilityId]?.current_form;
  const form = def?.forms.find((item) => item.form_id === formId);
  const state = structuredClone(before);
  const runtime = ensureFacilityRuntime(state, facilityId);
  if (!form || !form.risk_actions.includes(actionId)) {
    return { triggered: false, state };
  }
  if ((runtime.first_use_forms ?? []).includes(form.form_id) === false) {
    // first action on this form is protected; mark seen after evaluation
    runtime.first_use_forms = Array.from(new Set([...(runtime.first_use_forms ?? []), form.form_id]));
    return { triggered: false, state };
  }
  const serial = periodSerialFromState(state);
  if ((runtime.risk_cooldown_until ?? 0) > serial) return { triggered: false, state };
  const hit = stableRoll(`risk:${transactionId}:${facilityId}:${actionId}`, 100) < (riskCatalog.trigger_rate_percent ?? 10);
  runtime.first_use_forms = Array.from(new Set([...(runtime.first_use_forms ?? []), form.form_id]));
  if (!hit) return { triggered: false, state };
  const severityRoll = stableRoll(`risk-sev:${transactionId}:${facilityId}:${actionId}`, 100);
  const severity: 'abnormal' | 'damaged' = severityRoll < (riskCatalog.severity_weights?.abnormal ?? 70) ? 'abnormal' : 'damaged';
  const pool = ((riskCatalog.conditions as Record<string, Array<{ condition_id: string; severity: string }>>)[actionId] ?? [])
    .filter((item) => item.severity === severity);
  const picked = pool[stableRoll(`risk-cond:${transactionId}:${facilityId}:${actionId}`, Math.max(pool.length, 1))]
    ?? pool[0];
  runtime.status = severity;
  runtime.condition_id = picked?.condition_id ?? `${facilityId}_${severity}`;
  runtime.risk_cooldown_until = serial + (riskCatalog.cooldown_periods ?? 28);
  if (state.facilities?.[facilityId]) {
    state.facilities[facilityId].state = severity === 'damaged' ? '损坏' : '异常';
  }
  return { triggered: true, severity, conditionId: runtime.condition_id, state };
}

export function beginFacilityRecovery(
  before: GardenState,
  facilityId: string,
  transactionId: string,
  useRepairKit = false,
): GardenState {
  const runtimeBefore = before.facility_runtime?.[facilityId];
  if (!runtimeBefore || (runtimeBefore.status !== 'abnormal' && runtimeBefore.status !== 'damaged')) {
    throw new Error('设施没有可恢复的异常');
  }
  if (runtimeBefore.pending_recovery) throw new Error('已有修复事务');
  let state = structuredClone(before);
  if (runtimeBefore.status === 'damaged') {
    if (useRepairKit) {
      if (consumableCount(state, 'emergency_repair_kit') < 1) throw new Error('没有应急修缮包');
      state = reserveConsumable(state, 'emergency_repair_kit', 1);
      const runtime = ensureFacilityRuntime(state, facilityId);
      runtime.pending_recovery = {
        transaction_id: transactionId,
        condition_id: runtime.condition_id ?? 'damaged',
        reserved_cost: 0,
        used_repair_kit: true,
        started_at_serial: periodSerialFromState(state),
      };
      return state;
    }
    if ((state.resources?.materials ?? 0) < 2) throw new Error('修复需要 2 点物资');
    state.resources ??= {};
    state.resources.materials = (state.resources.materials ?? 0) - 2;
    const runtime = ensureFacilityRuntime(state, facilityId);
    runtime.pending_recovery = {
      transaction_id: transactionId,
      condition_id: runtime.condition_id ?? 'damaged',
      reserved_cost: 2,
      used_repair_kit: false,
      started_at_serial: periodSerialFromState(state),
    };
    return state;
  }
  const runtime = ensureFacilityRuntime(state, facilityId);
  runtime.pending_recovery = {
    transaction_id: transactionId,
    condition_id: runtime.condition_id ?? runtime.status ?? 'abnormal',
    reserved_cost: 0,
    used_repair_kit: false,
    started_at_serial: periodSerialFromState(state),
  };
  return state;
}

export function commitFacilityRecovery(before: GardenState, transactionId: string): GardenState {
  const state = structuredClone(before);
  const entry = Object.entries(state.facility_runtime ?? {}).find(([, runtime]) => runtime.pending_recovery?.transaction_id === transactionId);
  if (!entry) {
    if (before.events?.settled_ids?.includes(transactionId)) return state;
    throw new Error('没有对应的修复事务');
  }
  const [facilityId, runtime] = entry;
  let next = advanceOneTimePeriod(state);
  const nextRuntime = ensureFacilityRuntime(next, facilityId);
  // repair kit already reserved/consumed from inventory; materials already reserved
  nextRuntime.status = 'normal';
  nextRuntime.condition_id = null;
  nextRuntime.pending_recovery = null;
  if (next.facilities?.[facilityId]) next.facilities[facilityId].state = '启用';
  next.events ??= {};
  next.events.settled_ids = Array.from(new Set([...(next.events.settled_ids ?? []), transactionId])).slice(-256);
  return next;
}

export function cancelFacilityRecovery(before: GardenState, transactionId: string): GardenState {
  const state = structuredClone(before);
  for (const runtime of Object.values(state.facility_runtime ?? {})) {
    if (runtime.pending_recovery?.transaction_id !== transactionId) continue;
    if (runtime.pending_recovery.used_repair_kit) {
      state.inventory ??= { consumables: {} };
      state.inventory.consumables ??= {};
      state.inventory.consumables.emergency_repair_kit = Math.min(
        99,
        (state.inventory.consumables.emergency_repair_kit ?? 0) + 1,
      );
    } else if ((runtime.pending_recovery.reserved_cost ?? 0) > 0) {
      state.resources ??= {};
      state.resources.materials = Math.min(20, (state.resources.materials ?? 0) + runtime.pending_recovery.reserved_cost);
    }
    runtime.pending_recovery = null;
  }
  return state;
}

export function tickFacilityUnlocks(before: GardenState): GardenState {
  const state = structuredClone(before);
  for (const facilityId of Object.keys(state.facility_runtime ?? {})) {
    refreshFacilityUnlocks(state, facilityId);
  }
  return state;
}
