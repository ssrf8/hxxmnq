import { clampPattern } from '../battle/battle-patterns';
import type { BattleConfig, BattleMobWaveConfig, BattlePatternConfig } from '../battle/battle-types';

export interface BulletTowerEntry<TConfig = BattleConfig> {
  id: string;
  title: string;
  boss: string;
  theme: string;
  config: TConfig;
}

export interface BulletTowerRun<TConfig = BattleConfig> {
  order: BulletTowerEntry<TConfig>[];
  currentFloor: number;
}

export interface BulletTowerDifficulty {
  tagLevel: 0 | 1 | 2 | 3;
  label: string;
  detail: string;
  rewardMultiplier: number;
  hpMultiplier: number;
  speedMultiplier: number;
  countMultiplier: number;
  intervalMultiplier: number;
  bonusLives: number;
  bonusBombs: number;
}

const difficultyByTagLevel: Record<0 | 1 | 2 | 3, BulletTowerDifficulty> = {
  0: { tagLevel: 0, label: '标准', detail: '0 枚杂鱼标签 · 标准弹幕与奖励', rewardMultiplier: 1, hpMultiplier: 1, speedMultiplier: 1, countMultiplier: 1, intervalMultiplier: 1, bonusLives: 0, bonusBombs: 0 },
  1: { tagLevel: 1, label: '放缓', detail: '1 枚杂鱼标签 · 弹幕略放缓，奖励 85%', rewardMultiplier: 0.85, hpMultiplier: 0.92, speedMultiplier: 0.88, countMultiplier: 0.86, intervalMultiplier: 1.1, bonusLives: 0, bonusBombs: 0 },
  2: { tagLevel: 2, label: '缓和', detail: '2 枚杂鱼标签 · 弹幕明显降低，奖励 70%', rewardMultiplier: 0.7, hpMultiplier: 0.84, speedMultiplier: 0.76, countMultiplier: 0.72, intervalMultiplier: 1.22, bonusLives: 1, bonusBombs: 1 },
  3: { tagLevel: 3, label: '援助', detail: '3 枚以上杂鱼标签 · 最低压力，奖励 55%', rewardMultiplier: 0.55, hpMultiplier: 0.76, speedMultiplier: 0.65, countMultiplier: 0.58, intervalMultiplier: 1.38, bonusLives: 1, bonusBombs: 1 },
};

const floorMultiplier = [
  { hp: 0.88, speed: 0.9, count: 0.9, interval: 1.08 },
  { hp: 1, speed: 1, count: 1, interval: 1 },
  { hp: 1.16, speed: 1.1, count: 1.12, interval: 0.9 },
] as const;

function normalizeTagLevel(zakoTagCount: number): 0 | 1 | 2 | 3 {
  const count = Number.isInteger(zakoTagCount) ? zakoTagCount : 0;
  return Math.max(0, Math.min(3, count)) as 0 | 1 | 2 | 3;
}

export function bulletTowerDifficultyForTags(zakoTagCount: number): BulletTowerDifficulty {
  return difficultyByTagLevel[normalizeTagLevel(zakoTagCount)];
}

export function bulletTowerRewardMultiplier(zakoTagCount: number) {
  return bulletTowerDifficultyForTags(zakoTagCount).rewardMultiplier;
}

/** Fisher-Yates with injected randomness makes the boss order reproducible in tests. */
export function createBulletTowerRun<TConfig>(
  entries: readonly BulletTowerEntry<TConfig>[],
  random: () => number = Math.random,
): BulletTowerRun<TConfig> {
  const order = entries.map((entry) => ({ ...entry }));
  for (let index = order.length - 1; index > 0; index -= 1) {
    const target = Math.max(0, Math.min(index, Math.floor(random() * (index + 1))));
    [order[index], order[target]] = [order[target]!, order[index]!];
  }
  return { order, currentFloor: 0 };
}

function scalePattern(config: BattleConfig, pattern: BattlePatternConfig, floor: number, difficulty: BulletTowerDifficulty) {
  const floorScale = floorMultiplier[floor]!;
  return clampPattern(config, {
    ...pattern,
    speed: pattern.speed == null ? undefined : pattern.speed * floorScale.speed * difficulty.speedMultiplier,
    count: pattern.count == null ? undefined : Math.round(pattern.count * floorScale.count * difficulty.countMultiplier),
    interval_ms: Math.round(pattern.interval_ms * floorScale.interval * difficulty.intervalMultiplier),
  })!;
}

function scaleMob(wave: BattleMobWaveConfig, floor: number, difficulty: BulletTowerDifficulty): BattleMobWaveConfig {
  const floorScale = floorMultiplier[floor]!;
  return {
    ...wave,
    count: wave.count == null ? undefined : Math.max(1, Math.round(wave.count * floorScale.count * difficulty.countMultiplier)),
    speed: wave.speed == null ? undefined : Math.max(20, Math.round(wave.speed * floorScale.speed * difficulty.speedMultiplier)),
    shot_count: wave.shot_count == null ? undefined : Math.max(1, Math.round(wave.shot_count * floorScale.count * difficulty.countMultiplier)),
    shot_speed: wave.shot_speed == null ? undefined : Math.max(20, Math.round(wave.shot_speed * floorScale.speed * difficulty.speedMultiplier)),
    shot_interval_ms: wave.shot_interval_ms == null ? undefined : Math.round(wave.shot_interval_ms * floorScale.interval * difficulty.intervalMultiplier),
    interval_ms: Math.round(wave.interval_ms * floorScale.interval * difficulty.intervalMultiplier),
  };
}

/**
 * Derives a one-off tower floor from an approved dungeon config. It never mutates
 * the source JSON and keeps the same boss, pattern whitelist and settlement ID.
 */
export function createBulletTowerFloorConfig(
  baseConfig: BattleConfig,
  floor: number,
  zakoTagCount: number,
): BattleConfig {
  const safeFloor = Math.max(0, Math.min(2, Math.floor(floor)));
  const difficulty = bulletTowerDifficultyForTags(zakoTagCount);
  const floorScale = floorMultiplier[safeFloor]!;
  const config = structuredClone(baseConfig);
  config.player.lives = Math.min(9, config.player.lives + difficulty.bonusLives);
  config.player.bombs = Math.min(9, (config.player.bombs ?? 3) + difficulty.bonusBombs);
  config.phases = config.phases.map((phase) => ({
    ...phase,
    hp: Math.max(1, Math.round(phase.hp * floorScale.hp * difficulty.hpMultiplier)),
    patterns: phase.patterns.map((pattern) => scalePattern(config, pattern, safeFloor, difficulty)),
    mobs: phase.mobs?.map((wave) => scaleMob(wave, safeFloor, difficulty)),
    intro_mobs: phase.intro_mobs?.map((wave) => scaleMob(wave, safeFloor, difficulty)),
  }));
  config.presentation = {
    ...config.presentation,
    stage_subtitle: `${config.presentation?.stage_subtitle ?? '符卡之塔'} · 第 ${safeFloor + 1} 层 · ${difficulty.label}`,
  };
  return config;
}
