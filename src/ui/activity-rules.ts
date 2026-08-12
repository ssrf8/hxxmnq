import type { GardenState, ParticipationMode, SceneItemContext } from './types';
import { getInventoryItem, consumableCount, reserveConsumable } from './inventory-rules';
import { periodSerialFromState } from './time-rules';
import { inviteCharacter, evaluateVisitScheduler, visitorCap } from './visitor-rules';

const MAX_SCENE_ITEM_KINDS = 3;

export function sceneItemsAllowed(context: 'free_chat' | 'facility' | 'hot_spring' | 'banquet' | 'fixed' | 'build' | 'battle' | 'anomaly'): boolean {
  return context === 'free_chat' || context === 'facility' || context === 'hot_spring' || context === 'banquet';
}

export function ensureSceneItemContext(before: GardenState, sceneId: string): GardenState {
  const state = structuredClone(before);
  if (state.scene_item_context?.scene_id === sceneId && state.scene_item_context.status !== 'closed') {
    return state;
  }
  state.scene_item_context = {
    scene_id: sceneId,
    status: 'active',
    entries: [],
    closing_transaction_id: null,
  };
  return state;
}

export function queueSceneItemUse(
  before: GardenState,
  itemId: string,
  useId: string,
  sceneId: string,
  targetCharacterId: string | null = null,
): GardenState {
  const item = getInventoryItem(itemId);
  if (!item) throw new Error('未知物品');
  if (item.use_mode !== 'scene_chat') throw new Error('该物品不是场景聊天道具');
  if (item.item_id === 'emergency_repair_kit') throw new Error('应急修缮包不能进入普通场景道具上下文');
  if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(useId)) throw new Error('使用 ID 非法');
  const prepared = ensureSceneItemContext(before, sceneId);
  const preparedContext = prepared.scene_item_context!;
  if (preparedContext.status !== 'active') throw new Error('场景正在收尾，不能再新增道具');
  if (preparedContext.entries.some((entry) => entry.use_ids.includes(useId))) return prepared;
  if (consumableCount(before, itemId) < 1) throw new Error('数量不足');

  // One new item kind reservation per call is enforced by caller; same id merges.
  const preparedExisting = preparedContext.entries.find((entry) => entry.item_id === itemId);
  if (!preparedExisting && preparedContext.entries.length >= MAX_SCENE_ITEM_KINDS) {
    throw new Error('同一场景最多保留 3 种道具上下文');
  }

  // Reserve after validation, then mutate the reserved clone's own context.
  const state = reserveConsumable(prepared, itemId, 1);
  const context = state.scene_item_context!;
  const existing = context.entries.find((entry) => entry.item_id === itemId);
  if (existing) {
    existing.quantity_used += 1;
    existing.use_ids = Array.from(new Set([...existing.use_ids, useId]));
  } else {
    context.entries.push({
      item_id: itemId,
      quantity_used: 1,
      use_ids: [useId],
      mode: 'scene_chat',
      initial_target_character_id: targetCharacterId,
      first_transaction_id: useId,
      narrative_state_summary: `${item.title}已被带入当前场景。`,
    });
  }
  return state;
}

export function updateSceneItemNarrative(before: GardenState, itemId: string, summary: string): GardenState {
  const state = structuredClone(before);
  const entry = state.scene_item_context?.entries.find((item) => item.item_id === itemId);
  if (!entry) return state;
  entry.narrative_state_summary = summary.replace(/\s+/g, ' ').trim().slice(0, 160);
  return state;
}

export function beginSceneItemClosing(before: GardenState, transactionId: string): GardenState {
  const state = structuredClone(before);
  if (!state.scene_item_context || state.scene_item_context.status === 'closed') return state;
  state.scene_item_context.status = 'closing';
  state.scene_item_context.closing_transaction_id = transactionId;
  return state;
}

export function clearSceneItemContext(before: GardenState): GardenState {
  const state = structuredClone(before);
  state.scene_item_context = null;
  return state;
}

export function sceneItemPrompt(state: GardenState): string {
  const context = state.scene_item_context;
  if (!context || !context.entries.length || context.status === 'closed') return '';
  return [
    '【当前场景道具】',
    ...context.entries.map((entry) => {
      const item = getInventoryItem(entry.item_id);
      return `- ${item?.title ?? entry.item_id} x${entry.quantity_used}：${entry.narrative_state_summary || item?.prompt_description || ''}`;
    }),
    '后来进入场景的角色只能感知仍可观察的影响，不能自动获得缺席期间完整经历。',
    '道具不能修改正式资源、异变规则或永久状态。',
  ].join('\n');
}

export function startMoonSpringSession(
  before: GardenState,
  mode: ParticipationMode,
  acceptedCharacterIds: string[] = [],
): GardenState {
  if (!before.facility_runtime?.moon_spring?.built && !before.facilities?.moon_spring?.current_form) {
    throw new Error('月见温泉尚未建成');
  }
  if (before.garden_activities?.moon_spring_session) {
    throw new Error('已有月见温泉活动正在进行');
  }
  const state = structuredClone(before);
  if (mode === 'alone') {
    if ((state.presence_snapshot?.present_character_ids?.length ?? 0) > 0) {
      throw new Error('独处模式开始前需要先结束访客停留');
    }
  }
  if (mode === 'invite_only' && acceptedCharacterIds.some((id) => !(state.presence_snapshot?.present_character_ids ?? []).includes(id))) {
    throw new Error('仅邀请模式只能包含已经接受且到场的角色');
  }
  if (mode === 'public' && presentOverCap(state, 3)) throw new Error('公开温泉最多 3 名访客');
  state.garden_activities ??= { moon_spring_session: null, banquet: null, scheduled_banquet: null };
  state.garden_activities.moon_spring_session = {
    uid: `moon:${periodSerialFromState(state)}:${mode}`,
    form_id: state.facilities?.moon_spring?.current_form ?? state.facility_runtime?.moon_spring?.current_form ?? null,
    participation_mode: mode,
    accepted_character_ids: mode === 'alone' ? [] : acceptedCharacterIds.slice(0, 3),
    started_period_serial: periodSerialFromState(state),
    status: 'active',
  };
  return state;
}

export function endMoonSpringSession(before: GardenState): GardenState {
  const state = structuredClone(before);
  if (state.garden_activities?.moon_spring_session) {
    state.garden_activities.moon_spring_session = null;
  }
  return clearSceneItemContext(state);
}

export function scheduleBanquet(
  before: GardenState,
  options: {
    activityId: string;
    mode: 'public' | 'invite_only';
    invitedCharacterIds?: string[];
    startOffsetPeriods?: number;
    formId?: string;
  },
): GardenState {
  if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(options.activityId)) throw new Error('宴会活动 ID 非法');
  if ((options.startOffsetPeriods ?? 0) < 0 || (options.startOffsetPeriods ?? 0) > 4) {
    throw new Error('宴会只能安排在当前或未来 4 个标准时段内');
  }
  if (!before.facility_runtime?.banquet_plaza?.built && !before.facilities?.banquet_plaza?.current_form) {
    throw new Error('宴会广场尚未建成');
  }
  if (before.garden_activities?.banquet || before.garden_activities?.scheduled_banquet) {
    throw new Error('已有宴会计划或活动');
  }
  const state = structuredClone(before);
  const start = periodSerialFromState(state) + (options.startOffsetPeriods ?? 0);
  const invited = Array.from(new Set(options.invitedCharacterIds ?? [])).slice(0, 6);
  const accepted: string[] = [];
  let cursor = state;
  for (const characterId of invited) {
    const inviteId = `${options.activityId}:invite:${characterId}`;
    try {
      const result = inviteCharacter(cursor, characterId, inviteId);
      cursor = result.state;
      if (result.result === 'accept_now') accepted.push(characterId);
    } catch {
      // decline / unknown stay out
    }
  }
  cursor.garden_activities ??= { moon_spring_session: null, banquet: null, scheduled_banquet: null };
  cursor.garden_activities.scheduled_banquet = {
    uid: options.activityId,
    facility_id: 'banquet_plaza',
    form_id: options.formId ?? cursor.facilities?.banquet_plaza?.current_form ?? null,
    activity_id: options.activityId,
    participation_mode: options.mode,
    invited_character_ids: invited,
    accepted_character_ids: accepted,
    start_period_serial: start,
    status: 'scheduled',
  };
  return cursor;
}

export function startDueBanquet(before: GardenState, chatId = 'local', activityId?: string): GardenState {
  const scheduled = before.garden_activities?.scheduled_banquet;
  if (!scheduled || !['scheduled', 'due_waiting'].includes(scheduled.status)) return structuredClone(before);
  if (activityId && scheduled.activity_id !== activityId) throw new Error('宴会待办与当前安排不匹配');
  const serial = periodSerialFromState(before);
  if (scheduled.start_period_serial > serial) throw new Error('宴会尚未到开始时间');
  let state = structuredClone(before);
  state.garden_activities ??= { moon_spring_session: null, banquet: null, scheduled_banquet: null };
  state.garden_activities.banquet = {
    ...scheduled,
    status: 'active',
  };
  state.garden_activities.scheduled_banquet = null;
  if (scheduled.participation_mode === 'public') {
    // allow visitor scheduler to fill up to 6 using banquet cap
    const evaluated = evaluateVisitScheduler(state, { chatId, commitArrivals: true, busy: false });
    state = evaluated.state;
  }
  return state;
}

export function endBanquet(before: GardenState, completion: 'played' | 'assumed_completed' = 'played'): GardenState {
  const state = structuredClone(before);
  const banquet = state.garden_activities?.banquet;
  if (banquet) {
    state.garden_activities!.banquet_history = [
      ...(state.garden_activities?.banquet_history ?? []),
      {
        activity_id: banquet.activity_id,
        participation_mode: banquet.participation_mode,
        start_period_serial: banquet.start_period_serial,
        completed_period_serial: periodSerialFromState(state),
        completion,
      },
    ].slice(-8);
    state.garden_activities!.banquet = null;
  }
  markBanquetOverflowForDeparture(state);
  return clearSceneItemContext(state);
}

function markBanquetOverflowForDeparture(state: GardenState) {
  // Restore the ordinary cap at a safe point by marking overflow visitors to leave.
  const cap = 3;
  const present = [...(state.presence_snapshot?.present_character_ids ?? [])];
  if (present.length > cap) {
    const overflow = present.slice(cap);
    const serial = periodSerialFromState(state);
    state.presence_snapshot ??= { present_character_ids: [], character_views: {}, visitor_meta: {} };
    for (const characterId of overflow) {
      if (!state.presence_snapshot.visitor_meta?.[characterId]) continue;
      state.presence_snapshot.visitor_meta[characterId].planned_departure_serial = serial;
    }
  }
}

export function assumeDueBanquetCompleted(before: GardenState, activityId: string): GardenState {
  const scheduled = before.garden_activities?.scheduled_banquet;
  if (!scheduled || scheduled.activity_id !== activityId) return structuredClone(before);
  const state = structuredClone(before);
  state.garden_activities ??= { moon_spring_session: null, banquet: null, scheduled_banquet: null, banquet_history: [] };
  state.garden_activities.banquet_history = [
    ...(state.garden_activities.banquet_history ?? []),
    {
      activity_id: scheduled.activity_id,
      participation_mode: scheduled.participation_mode,
      start_period_serial: scheduled.start_period_serial,
      completed_period_serial: periodSerialFromState(state),
      completion: 'assumed_completed' as const,
    },
  ].slice(-8);
  state.garden_activities.scheduled_banquet = null;
  state.garden_activities.banquet = null;
  markBanquetOverflowForDeparture(state);
  return clearSceneItemContext(state);
}

export function endConversationLocal(before: GardenState): GardenState {
  let state = structuredClone(before);
  for (const task of state.pending_tasks ?? []) {
    if (task.kind === 'anomaly_resolution') task.payload = { ...task.payload, reminder_only: true };
  }
  state.interaction ??= {};
  state.interaction.current_session = null;
  state = clearSceneItemContext(state);
  if (state.garden_activities?.moon_spring_session) state = endMoonSpringSession(state);
  if (state.garden_activities?.banquet) state = endBanquet(state, 'played');
  return state;
}

function presentOverCap(state: GardenState, cap: number) {
  return (state.presence_snapshot?.present_character_ids?.length ?? 0) > cap;
}

export function tickActivitiesOnTimeAdvance(before: GardenState, previousSerial: number): GardenState {
  let state = structuredClone(before);
  const serial = periodSerialFromState(state);
  if (serial === previousSerial) return state;
  if (state.garden_activities?.moon_spring_session
    && state.garden_activities.moon_spring_session.started_period_serial < serial) {
    state = endMoonSpringSession(state);
  }
  if (state.garden_activities?.banquet
    && (state.garden_activities.banquet.start_period_serial ?? 0) < serial) {
    state = endBanquet(state);
  }
  return state;
}

export function getSceneItemContext(state: GardenState): SceneItemContext | null {
  return state.scene_item_context ?? null;
}

export function currentVisitorCap(state: GardenState) {
  return visitorCap(state);
}
