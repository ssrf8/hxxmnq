import assistedConfig from './configs/duels/character-duel-assisted-v1.json';
import hardConfig from './configs/duels/character-duel-hard-v1.json';
import standardConfig from './configs/duels/character-duel-standard-v1.json';
import duelCatalog from './duel-profiles.json';
import { clampPattern } from './battle-patterns';
import { REGISTERED_PATTERNS, type BattleConfig } from './battle-types';
import type { DuelDifficultyTier } from '../ui/types';

const baseConfigs = [hardConfig, standardConfig, assistedConfig] as unknown as BattleConfig[];
const configById = new Map(baseConfigs.map((config) => [config.config_id, config]));
const registeredPatterns = new Set<string>(REGISTERED_PATTERNS);

export interface DuelBattleProfile {
  character_id: string;
  display_name: string;
  enabled: boolean;
  battle_visual_id: string;
  fallback_visual_id: string;
  hard_config_id: string;
  standard_config_id: string;
  assisted_config_id: string;
}

function configIdForTier(profile: DuelBattleProfile, tier: DuelDifficultyTier) {
  if (tier === 'hard') return profile.hard_config_id;
  return tier === 'assisted' ? profile.assisted_config_id : profile.standard_config_id;
}

function validateBaseConfig(config: BattleConfig) {
  if (!config.config_id || config.phases.length < 1) throw new Error('对战配置缺少 ID 或阶段');
  if (!config.allowed_outcomes?.every((outcome) => ['clean_win', 'narrow_win', 'loss'].includes(outcome))) {
    throw new Error(`对战配置包含非法结算：${config.config_id}`);
  }
  for (const phase of config.phases) {
    if (phase.patterns.length < 1) throw new Error(`对战阶段缺少弹幕：${phase.id}`);
    for (const pattern of phase.patterns) {
      if (!registeredPatterns.has(pattern.pattern_id)) {
        throw new Error(`对战配置包含未登记弹型：${pattern.pattern_id}`);
      }
      const clamped = clampPattern(config, pattern);
      if (!clamped || JSON.stringify(clamped) !== JSON.stringify(pattern)) {
        throw new Error(`对战配置参数越过白名单：${config.config_id}/${phase.id}/${pattern.pattern_id}`);
      }
    }
  }
}

for (const config of baseConfigs) validateBaseConfig(config);

export function listDuelBaseConfigs(): BattleConfig[] {
  return baseConfigs.map((config) => structuredClone(config));
}

export function getDuelBattleConfig(
  characterId: string,
  tier: DuelDifficultyTier,
): BattleConfig {
  const profile = (duelCatalog.profiles as DuelBattleProfile[])
    .find((entry) => entry.enabled && entry.character_id === characterId);
  if (!profile) throw new Error('角色没有登记对战档案');
  const configId = configIdForTier(profile, tier);
  const base = configById.get(configId);
  if (!base) throw new Error(`对战配置未登记：${configId}`);
  const config = structuredClone(base);
  config.presentation = {
    ...config.presentation,
    boss_id: profile.battle_visual_id || profile.fallback_visual_id,
    boss_name: profile.display_name,
    boss_title: tier === 'hard' ? '毫不留手的符卡对手' : tier === 'assisted' ? '稍微放缓攻势的对手' : '认真应战的符卡对手',
  };
  return config;
}

export function getLockedDuelBattleConfig(
  characterId: string,
  tier: DuelDifficultyTier,
  expectedConfigId: string,
): BattleConfig {
  const config = getDuelBattleConfig(characterId, tier);
  if (config.config_id !== expectedConfigId) throw new Error('锁定的对战难度与配置不一致');
  return config;
}
