import duelCatalog from '../battle/duel-profiles.json';
import { ensureCardRuntime } from './card-item-rules';
import type { BattleResult, DuelDifficultyTier, GardenState } from './types';

export interface DuelProfile {
  character_id: string;
  display_name: string;
  enabled: boolean;
  battle_visual_id: string;
  fallback_visual_id: string;
  hard_config_id: string;
  standard_config_id: string;
  assisted_config_id: string;
  victory_reaction_tags: string[];
}

const profiles = duelCatalog.profiles as DuelProfile[];
const profileById = new Map(profiles.map((profile) => [profile.character_id, profile]));

function validateUseId(useId: string) {
  if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(useId)) throw new Error('角色对战发起 ID 非法');
}

function validateSettlementId(settlementId: string) {
  if (!/^[A-Za-z0-9._:-]{1,96}$/u.test(settlementId)) throw new Error('角色对战结算 ID 非法');
}

function validateDuelBattleResult(result: BattleResult) {
  if (!Number.isInteger(result.remaining_lives) || result.remaining_lives < 0 || result.remaining_lives > 9) {
    throw new Error('对战剩余生命非法');
  }
  if (!Number.isInteger(result.grazes) || result.grazes < 0 || result.grazes > 999999) {
    throw new Error('对战擦弹数非法');
  }
  if (!Number.isInteger(result.duration_ms) || result.duration_ms < 0 || result.duration_ms > 3600000) {
    throw new Error('对战时长非法');
  }
  if (!Number.isInteger(result.hits) || result.hits < 0 || result.hits > 999999) {
    throw new Error('对战命中数非法');
  }
  if (!Number.isFinite(result.damage) || result.damage < 0 || result.damage > 999999999) {
    throw new Error('对战伤害非法');
  }
  if (!Number.isInteger(result.phases_cleared) || result.phases_cleared < 0 || result.phases_cleared > 99) {
    throw new Error('对战阶段数非法');
  }
  if (!Number.isFinite(result.objective_ratio) || result.objective_ratio < 0 || result.objective_ratio > 100) {
    throw new Error('对战完成度非法');
  }
}

export function listDuelProfiles(): DuelProfile[] {
  return profiles.filter((profile) => profile.enabled).map((profile) => ({
    ...profile,
    victory_reaction_tags: [...profile.victory_reaction_tags],
  }));
}

export function getDuelProfile(characterId: string): DuelProfile | undefined {
  const profile = profileById.get(characterId);
  return profile?.enabled ? { ...profile, victory_reaction_tags: [...profile.victory_reaction_tags] } : undefined;
}

export function duelDifficultyForTags(zakoTagCount: number): DuelDifficultyTier {
  const count = Math.max(0, Math.min(99, Number.isInteger(zakoTagCount) ? zakoTagCount : 0));
  if (count === 0) return 'hard';
  return count >= 3 ? 'assisted' : 'standard';
}

export function characterDuelBlock(state: GardenState, targetCharacterId?: string): string {
  if (!state.battle?.dungeon_unlocked) return '需要先完成妖花教学战';
  if (state.battle?.current) return '已有战斗结果等待结算';
  if (state.events?.active_event || state.anomaly_cycle?.pending_activation) {
    return '当前有其他受控事务，不能发起对战';
  }
  const session = state.interaction?.current_session;
  if (session) {
    const participants = session.participant_character_ids ?? [];
    const challengesCurrentCharacter = session.type === 'character'
      && session.status !== 'closing'
      && Boolean(targetCharacterId)
      && participants.includes(targetCharacterId!);
    if (!challengesCurrentCharacter) return '交谈中只能向当前对话角色发起对战';
  }
  const duel = state.inventory?.card_runtime?.duel;
  if (duel?.pending_battle) return '已有一场角色对战进行中';
  if (duel?.pending_victory_dialogue) return '上一场胜利要求尚未完成';
  if (targetCharacterId && !getDuelProfile(targetCharacterId)) return '角色没有登记对战档案';
  return '';
}

export interface DuelCardStartResult {
  state: GardenState;
  targetCharacterId: string;
  configId: string;
  difficultyTier: DuelDifficultyTier;
  alreadyStarted: boolean;
}

export function beginDuelCard(
  before: GardenState,
  targetCharacterId: string,
  useId: string,
): DuelCardStartResult {
  validateUseId(useId);
  const existing = before.inventory?.card_runtime?.duel?.pending_battle;
  if (existing?.use_id === useId && existing.target_character_id === targetCharacterId) {
    return {
      state: structuredClone(before),
      targetCharacterId,
      configId: existing.config_id,
      difficultyTier: existing.difficulty_tier,
      alreadyStarted: true,
    };
  }
  const blocked = characterDuelBlock(before, targetCharacterId);
  if (blocked) throw new Error(blocked);
  const profile = getDuelProfile(targetCharacterId)!;
  const state = structuredClone(before);
  const runtime = ensureCardRuntime(state);
  const count = runtime.duel!.zako_tag_count ?? 0;
  const difficultyTier = duelDifficultyForTags(count);
  const configId = difficultyTier === 'hard'
    ? profile.hard_config_id
    : difficultyTier === 'assisted'
      ? profile.assisted_config_id
      : profile.standard_config_id;
  runtime.duel!.pending_battle = {
    use_id: useId,
    target_character_id: targetCharacterId,
    config_id: configId,
    difficulty_tier: difficultyTier,
    started_zako_tag_count: count,
  };
  return {
    state,
    targetCharacterId,
    configId,
    difficultyTier,
    alreadyStarted: false,
  };
}

export function cancelDuelCard(before: GardenState, useId: string): GardenState {
  validateUseId(useId);
  const state = structuredClone(before);
  const runtime = ensureCardRuntime(state);
  const pending = runtime.duel!.pending_battle;
  if (!pending) return state;
  if (pending.use_id !== useId) throw new Error('取消 ID 与当前对战不一致');
  runtime.duel!.pending_battle = null;
  return state;
}

export interface DuelCardSettlementResult {
  state: GardenState;
  won: boolean;
  zakoTagCount: number;
  previousZakoTagCount: number;
  zakoTagDelta: -1 | 0 | 1;
  message: string;
  alreadySettled: boolean;
}

export function stageDuelVictoryRequest(
  before: GardenState,
  settlementId: string,
  requestText: string,
): GardenState {
  validateSettlementId(settlementId);
  const value = requestText.trim();
  if (!value || value.length > 240) throw new Error('胜利要求应为 1–240 个字符');
  const state = structuredClone(before);
  const pending = ensureCardRuntime(state).duel!.pending_victory_dialogue;
  if (!pending || pending.settlement_id !== settlementId) throw new Error('没有对应的待提交胜利要求');
  if (pending.status === 'completed') throw new Error('该胜利要求已经完成');
  if (pending.status === 'generating' && pending.request_text !== value) {
    throw new Error('胜利要求已经锁定，不能在生成中更换');
  }
  pending.request_text = value;
  pending.status = 'generating';
  return state;
}

export function completeDuelVictoryDialogue(before: GardenState, settlementId: string): GardenState {
  validateSettlementId(settlementId);
  const pending = before.inventory?.card_runtime?.duel?.pending_victory_dialogue;
  if (!pending) return structuredClone(before);
  if (pending.settlement_id !== settlementId) throw new Error('胜利要求完成 ID 与当前事务不一致');
  if (pending.status !== 'generating' || !pending.request_text.trim()) {
    throw new Error('胜利要求尚未进入生成状态');
  }
  const state = structuredClone(before);
  ensureCardRuntime(state).duel!.pending_victory_dialogue = null;
  return state;
}

export function abandonDuelVictoryDialogue(before: GardenState, settlementId: string): GardenState {
  validateSettlementId(settlementId);
  const pending = before.inventory?.card_runtime?.duel?.pending_victory_dialogue;
  if (!pending) return structuredClone(before);
  if (pending.settlement_id !== settlementId) throw new Error('放弃要求 ID 与当前胜利事务不一致');
  const state = structuredClone(before);
  ensureCardRuntime(state).duel!.pending_victory_dialogue = null;
  return state;
}

export function settleDuelCard(before: GardenState, result: BattleResult): DuelCardSettlementResult {
  validateSettlementId(result.settlement_id);
  const existingRuntime = before.inventory?.card_runtime;
  if (existingRuntime?.duel?.settled_result_ids?.includes(result.settlement_id)) {
    const count = existingRuntime.duel.zako_tag_count ?? 0;
    return {
      state: structuredClone(before),
      won: existingRuntime.duel.pending_victory_dialogue?.settlement_id === result.settlement_id,
      zakoTagCount: count,
      previousZakoTagCount: count,
      zakoTagDelta: 0,
      message: '该角色对战结果已经结算',
      alreadySettled: true,
    };
  }
  const pending = existingRuntime?.duel?.pending_battle;
  if (!pending) throw new Error('没有待结算的角色对战');
  if (pending.config_id !== result.config_id) throw new Error('对战配置与预留不一致');
  if (result.outcome === 'narrative') throw new Error('角色对战不接受叙事替代结算');
  if (!['clean_win', 'narrow_win', 'loss'].includes(result.outcome)) throw new Error('未知对战结果');
  validateDuelBattleResult(result);

  const state = structuredClone(before);
  const runtime = ensureCardRuntime(state);
  const duel = runtime.duel!;
  const won = result.outcome === 'clean_win' || result.outcome === 'narrow_win';
  const previousTagCount = duel.zako_tag_count ?? 0;
  duel.zako_tag_count = won
    ? Math.max(0, previousTagCount - 1)
    : Math.min(99, previousTagCount + 1);
  duel.settled_result_ids = Array.from(new Set([
    ...(duel.settled_result_ids ?? []),
    result.settlement_id,
  ])).slice(-256);
  duel.pending_battle = null;
  // A new victory always owns this slot. Discard any stale request left by an
  // older victory before staging the current one.
  duel.pending_victory_dialogue = null;
  duel.pending_victory_dialogue = won
    ? {
      settlement_id: result.settlement_id,
      target_character_id: pending.target_character_id,
      status: 'waiting_request',
      request_text: '',
    }
    : null;
  return {
    state,
    won,
    zakoTagCount: duel.zako_tag_count,
    previousZakoTagCount: previousTagCount,
    zakoTagDelta: duel.zako_tag_count - previousTagCount as -1 | 0 | 1,
    message: won
      ? `符卡对战胜利，杂鱼标签 ${previousTagCount > 0 ? '-1' : '保持 0'}。`
      : `挑战失败，杂鱼标签 +1。当前持有：${duel.zako_tag_count} 枚。`,
    alreadySettled: false,
  };
}
