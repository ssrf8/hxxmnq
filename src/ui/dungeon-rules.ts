import dungeonRegistry from '../battle/dungeon-registry.json';
import type { BattleResult, GardenState } from './types';
import { advanceOneTimePeriod, timeSnapshot } from './time-rules';
import { bulletTowerRewardMultiplier } from './bullet-tower-rules';
import { ensureCardRuntime } from './card-item-rules';

const MAX_REWARDED_IDS = 256;
const rewardByOutcome = { clean_win: 12, narrow_win: 8, loss: 3 } as const;
type DungeonOutcome = keyof typeof rewardByOutcome;
const configs = new Set(dungeonRegistry.dungeons.map((entry) => entry.config_id));

export function dungeonBlock(state: GardenState) {
  return state.battle?.dungeon_unlocked ? '' : '需要先完成温室妖花核心教学战';
}

export function isDungeonConfig(configId: string) {
  return configs.has(configId);
}

export function validateDungeonResult(result: BattleResult, state: GardenState): BattleResult {
  const blocked = dungeonBlock(state);
  if (blocked) throw new Error(blocked);
  if (!isDungeonConfig(result.config_id)) throw new Error('副本配置 ID 不在本地白名单');
  if (!/^[A-Za-z0-9._:-]{1,64}$/u.test(result.settlement_id)) throw new Error('副本结算 ID 非法');
  if (!(result.outcome in rewardByOutcome)) throw new Error('副本不接受叙事替代结算');
  if (state.battle?.rewarded_ids?.includes(result.settlement_id)) throw new Error('该副本结果已经结算');
  return result;
}

/** Pure, atomic local dungeon settlement; it never sends a chat message. */
export function settleDungeonResult(before: GardenState, result: BattleResult): GardenState {
  const trusted = validateDungeonResult(result, before);
  const started = timeSnapshot(before);
  const state = advanceOneTimePeriod(before);
  state.resources ??= {};
  const tagsBefore = state.inventory?.card_runtime?.duel?.zako_tag_count ?? 0;
  const rewardCoins = dungeonReward(trusted.outcome as DungeonOutcome, tagsBefore);
  state.resources.coins = Math.min(99999, (state.resources.coins ?? 0) + rewardCoins);
  if (trusted.outcome === 'loss') {
    const duel = ensureCardRuntime(state).duel!;
    duel.zako_tag_count = Math.min(99, (duel.zako_tag_count ?? tagsBefore) + 1);
  }
  state.battle ??= {};
  state.battle.rewarded_ids = Array.from(new Set([...(state.battle.rewarded_ids ?? []), trusted.settlement_id])).slice(-MAX_REWARDED_IDS);
  state.battle.run_count = (state.battle.run_count ?? 0) + 1;
  state.battle.last_run = {
    config_id: trusted.config_id,
    outcome: trusted.outcome as DungeonOutcome,
    reward_coins: rewardCoins,
    started_day: started.day,
    started_time_period: started.time_period,
    settled_day: state.environment?.day ?? 1,
    settled_time_period: state.environment?.time_period ?? '清晨',
  };
  state.battle.current = null;
  return state;
}

export function dungeonReward(outcome: DungeonOutcome, zakoTagCount = 0) {
  return Math.max(1, Math.floor(rewardByOutcome[outcome] * bulletTowerRewardMultiplier(zakoTagCount)));
}
