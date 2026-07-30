import duelCatalog from '../battle/duel-profiles.json';
import { consumableCount, reserveConsumable } from './inventory-rules';
import type { CardRuntimeState, GardenState } from './types';
import {
  commitOpportunityArrival,
  listOpportunityCandidateProfiles,
  stableRoll,
  visitorCap,
} from './visitor-rules';

const registeredDuelIds = new Set(
  duelCatalog.profiles
    .filter((profile) => profile.enabled)
    .map((profile) => profile.character_id),
);

export function ensureCardRuntime(state: GardenState): CardRuntimeState {
  state.inventory ??= { consumables: {} };
  state.inventory.consumables ??= {};
  state.inventory.card_runtime ??= {};
  const runtime = state.inventory.card_runtime;
  runtime.settled_use_ids ??= [];
  runtime.opportunity ??= { pending: null, last_result: null };
  runtime.opportunity.pending ??= null;
  runtime.opportunity.last_result ??= null;
  runtime.duel ??= {
    zako_tag_count: 0,
    pending_battle: null,
    settled_result_ids: [],
    pending_victory_dialogue: null,
  };
  runtime.duel.zako_tag_count ??= 0;
  runtime.duel.pending_battle ??= null;
  runtime.duel.settled_result_ids ??= [];
  runtime.duel.pending_victory_dialogue ??= null;
  return runtime;
}

function validateUseId(useId: string) {
  if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(useId)) throw new Error('卡片使用 ID 非法');
}

function cardRuntimeBusy(state: GardenState): boolean {
  const runtime = state.inventory?.card_runtime;
  return Boolean(
    state.battle?.current
    || state.events?.active_event
    || state.interaction?.current_session
    || state.anomaly_cycle?.pending_activation
    || runtime?.opportunity?.pending
    || runtime?.duel?.pending_battle
    || runtime?.duel?.pending_victory_dialogue,
  );
}

export function opportunityCardCandidates(state: GardenState): string[] {
  return listOpportunityCandidateProfiles(state)
    .map((profile) => profile.character_id)
    .filter((characterId) => registeredDuelIds.has(characterId));
}

export function opportunityCardBlock(state: GardenState): string {
  if (consumableCount(state, 'opportunity_card') < 1) return '没有可用的机遇卡';
  if (cardRuntimeBusy(state)) return '当前有其他受控事务，不能使用机遇卡';
  if ((state.presence_snapshot?.present_character_ids?.length ?? 0) >= visitorCap(state)) return '庭院访客已满';
  if (!opportunityCardCandidates(state).length) return '没有尚未认识的登记角色';
  return '';
}

export interface OpportunityCardResult {
  state: GardenState;
  selectedCharacterId: string | null;
  message: string;
  alreadySettled: boolean;
}

export function useOpportunityCard(
  before: GardenState,
  useId: string,
  chatId = 'local',
): OpportunityCardResult {
  validateUseId(useId);
  const beforeRuntime = before.inventory?.card_runtime;
  if (beforeRuntime?.settled_use_ids?.includes(useId)) {
    const previous = beforeRuntime.opportunity?.last_result;
    return {
      state: structuredClone(before),
      selectedCharacterId: previous?.use_id === useId ? previous.selected_character_id : null,
      message: '该机遇卡已经结算',
      alreadySettled: true,
    };
  }
  const blocked = opportunityCardBlock(before);
  if (blocked) throw new Error(blocked);
  const candidates = opportunityCardCandidates(before);
  const rollSeed = `opportunity-card:${chatId}:${useId}`;
  const selectedCharacterId = candidates[stableRoll(rollSeed, candidates.length)];

  let state = reserveConsumable(before, 'opportunity_card', 1);
  const runtime = ensureCardRuntime(state);
  runtime.opportunity!.pending = {
    use_id: useId,
    selected_character_id: selectedCharacterId,
    roll_seed: rollSeed,
    status: 'reserved',
  };
  const arrived = commitOpportunityArrival(state, selectedCharacterId, `opportunity:${useId}`);
  state = arrived.state;
  const arrivedRuntime = ensureCardRuntime(state);
  arrivedRuntime.settled_use_ids = Array.from(new Set([
    ...(arrivedRuntime.settled_use_ids ?? []),
    useId,
  ])).slice(-256);
  arrivedRuntime.opportunity!.last_result = {
    use_id: useId,
    selected_character_id: selectedCharacterId,
  };
  arrivedRuntime.opportunity!.pending = null;
  return {
    state,
    selectedCharacterId,
    message: arrived.notice,
    alreadySettled: false,
  };
}
