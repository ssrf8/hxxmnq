import type { BattleResult } from '../ui/types';

export const FIXED_STEP_MS = 1000 / 120;
export const MAX_CATCH_UP_STEPS = 5;
export const DEFAULT_BOMBS = 3;
export const DEATHBOMB_WINDOW_MS = 150;
export const BOMB_DURATION_MS = 1400;
export const BOMB_CLEAR_EXPAND_MS = 450;
export const BOMB_INVULN_MS = 1600;
export const RESPAWN_CONTROL_LOCK_MS = 500;
export const RESPAWN_TOTAL_MS = 700;
export const GRAZE_RADIUS = 22;
/** TH06 BULLET_STATE_SPAWNING_* grace: brief materialize where a shot is inert. */
export const SPAWN_IN_S = 0.09;
export const PLAYER_SHOT_SPEED = 520;
export const MAX_PLAYER_SHOTS = 96;
export const MAX_ENEMY_SHOTS = 512;
export const MAX_PARTICLES = 128;
export const MAX_MOBS = 8;
export const MAX_ITEMS = 24;
/** TH06-style power meter; full power is 128. */
export const POWER_MAX = 128;
export const POWER_SMALL_VALUE = 1;
export const POWER_BIG_VALUE = 8;
/** Auto-collect height ratio (TH06 POC ~ y<128 on 448 playfield ≈ top band). */
export const ITEM_POC_RATIO = 0.28;
export const ITEM_MAGNET_RADIUS = 36;

/** Whitelisted pattern generators only — JSON cannot name anything else. */
export const REGISTERED_PATTERNS = [
  'fixed_seed_ring',
  'petal_fan',
  'homing_leaf',
  'local_safe_zone',
  'aimed_stream',
  'rotating_ring',
  'wave_fan',
  'burst_cluster',
  'cross_sweep',
  'laser_warning',
  'falling_lanes',
] as const;

export type RegisteredPatternId = (typeof REGISTERED_PATTERNS)[number];

export interface BattleShotConfig {
  pattern?: string;
  damage: number;
  interval_ms: number;
}

export interface BattlePatternConfig {
  pattern_id: string;
  interval_ms: number;
  speed?: number;
  count?: number;
  arc_deg?: number;
  turn_rate_deg?: number;
  warning_ms?: number;
  duration_ms?: number;
  start_ms?: number;
  end_ms?: number;
  angle_deg?: number;
  rotate_deg_per_volley?: number;
  /** burst_cluster: delay before child ring spawns (ms). */
  burst_delay_ms?: number;
  /** falling_lanes / cross_sweep: how many safe gaps. */
  gaps?: number;
  /** laser_warning: length of active laser in ms after warning. */
  active_ms?: number;
  /** Post-spawn curve rate in deg/s (clamped). */
  spin_deg_per_s?: number;
  /** Optional second ring/layer speed scale, e.g. 0.75. */
  layer_speed_scale?: number;
  /** Aim lead factor for aimed streams (0..1). */
  aim_lead?: number;
  /**
   * Discrete redirect (TH06 Bullet::dirChangeInterval/Rotation/Speed/NumTimes).
   * After each interval the bullet turns by rotation (optionally re-speeds),
   * up to `dir_change_times`. Applies on top of the pattern's base motion.
   */
  dir_change_interval_ms?: number;
  dir_change_rotation_deg?: number;
  dir_change_speed?: number;
  dir_change_times?: number;
  /**
   * Per-bullet spawn jitter (TH06 RANDOM_ANGLE / RANDOM_SPEED aim modes).
   * Each shot's launch angle is nudged by ±random_angle_deg and its speed by
   * ±random_speed, drawn from the deterministic run PRNG.
   */
  random_angle_deg?: number;
  random_speed?: number;
  /** Spawn this pattern from the phase's orbiting familiars instead of the boss. */
  from_familiar?: boolean;
}

/**
 * Lightweight midboss-adjacent fairy wave. Abstracted from TH06 EnemyManager
 * (life / itemDrop / score) — no ECL scripts, no original assets.
 */
export interface BattleMobWaveConfig {
  /** Phase-local start; default 800. */
  start_ms?: number;
  /** Phase-local end; default phase end. */
  end_ms?: number;
  /** Spawn cadence. */
  interval_ms: number;
  /** How many mobs per spawn pulse (1..3). */
  count?: number;
  hp?: number;
  speed?: number;
  radius?: number;
  /** Optional aimed pellet the mob fires. 0 = no shot. */
  shot_interval_ms?: number;
  shot_count?: number;
  shot_speed?: number;
  /** Drop on death. */
  drop?: 'power_small' | 'power_big' | 'none';
  /** Enter from left/right alternating, or top. */
  path?: 'side' | 'top';
}

export interface BattlePhaseConfig {
  id: string;
  hp: number;
  duration_ms: number;
  objective?: string;
  kind?: 'nonspell' | 'spell';
  name?: string;
  patterns: BattlePatternConfig[];
  /** Optional short fairy waves — keep sparse so Boss stays the focus. */
  mobs?: BattleMobWaveConfig[];
  /**
   * Fairy-sweep intro before the boss joins this phase (TH06 stage-section
   * feel): for intro_ms the boss is absent (no patterns, untargetable, HP bar
   * hidden) while intro_mobs spawn generously and drop power. The phase's
   * duration/banner clock starts when the wave ends. Clamped to 0..30000.
   */
  intro_ms?: number;
  intro_mobs?: BattleMobWaveConfig[];
  /**
   * Orbiting familiars beside the boss. Visual satellites that patterns with
   * `from_familiar: true` use as their spawn origin (volley-rotating).
   */
  familiars?: { count?: number; orbit_px?: number; orbit_ms?: number };
}

export interface BattlePlayerConfig {
  lives: number;
  move_speed: number;
  focus_speed: number;
  hitbox_radius: number;
  invulnerability_ms: number;
  auto_fire: boolean;
  normal_shot: BattleShotConfig;
  focus_shot: BattleShotConfig;
  bombs?: number;
  deathbomb_ms?: number;
  /** Starting power 0..128. Default 0. */
  power?: number;
}

/**
 * Display-only boss presentation. Drives the cut-in card and future portrait
 * atlas lookups — never read by simulation, collision or BattleResult.
 */
export interface BattlePresentationConfig {
  /** Stable art key, e.g. "cirno"; also the future portrait frame prefix. */
  boss_id?: string;
  boss_name?: string;
  boss_title?: string;
  /** Stage-opening crawl (first ~3.4s of the battle). */
  stage_title?: string;
  stage_subtitle?: string;
}

export interface BattleConfig {
  config_id: string;
  arena: { width: number; height: number };
  player: BattlePlayerConfig;
  phases: BattlePhaseConfig[];
  presentation?: BattlePresentationConfig;
  parameter_limits?: {
    speed?: [number, number];
    count?: [number, number];
    interval_ms?: [number, number];
    duration_ms?: [number, number];
    damage?: [number, number];
  };
  allowed_outcomes?: Array<BattleResult['outcome']>;
}

export type PlayerRuntimeState =
  | 'active'
  | 'deathbomb'
  | 'bombing'
  | 'hit'
  | 'respawning'
  | 'finished';

export interface PlayerState {
  x: number;
  y: number;
  lives: number;
  bombs: number;
  maxBombs: number;
  /** 0..POWER_MAX, TH06-style. Affects shot lanes only — not BattleResult. */
  power: number;
  focused: boolean;
  firing: boolean;
  invulnerableUntil: number;
  deathbombUntil: number | null;
  respawnUntil: number | null;
  controlLockedUntil: number;
  bombUntil: number;
  bombStartedAt: number;
  state: PlayerRuntimeState;
  initialLives: number;
  /** Game-time of the last life loss — drives the brief screen shake only. */
  lastMissAt?: number;
}

export type MobPath = 'side' | 'top';

export interface MobState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  age: number;
  shotInterval: number;
  shotCount: number;
  shotSpeed: number;
  lastShotAt: number;
  drop: 'power_small' | 'power_big' | 'none';
  path: MobPath;
  /** Horizontal bob phase. */
  bob: number;
  /** Idempotent defeat latch — a mob is counted / drops loot exactly once. */
  defeated: boolean;
  /** Game-time (ms) of the last player-shot hit — drives brief brighten + HP tick. */
  hitAt?: number;
}

export type ItemKind = 'power_small' | 'power_big';

export interface ItemState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: ItemKind;
  age: number;
  /** Once true, homes strongly toward player (POC / magnet). */
  attracted: boolean;
}

export interface BossState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  hitFlashUntil: number;
}

/** Visual grammar for enemy shots — shape + hue, independent of collision radius. */
export type BulletShape =
  | 'circle'
  | 'ellipse'
  | 'rice'
  | 'pellet'
  | 'kunai'
  | 'petal'
  | 'crystal'
  /** 大玉 — big translucent orb with a thick rim. */
  | 'orb'
  /** 星弹 — five-point star. */
  | 'star'
  /** 光珠 — small glossy pearl (mob pellets). */
  | 'bead';
export type BulletHue = 'red' | 'blue' | 'pink' | 'cyan' | 'purple' | 'gold' | 'green' | 'white';

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage?: number;
  age: number;
  homing?: boolean;
  turnRate?: number;
  grazed?: boolean;
  /** Lasers re-graze on a tick (TH06 feel); plain shots latch `grazed` once. */
  lastGrazeAt?: number;
  kind: 'player' | 'enemy';
  patternId?: string;
  collidable: boolean;
  warning?: boolean;
  safeLane?: boolean;
  ttl?: number;
  /** laser_warning segment */
  laser?: boolean;
  laserLength?: number;
  laserAngle?: number;
  /** burst_cluster mother shot */
  burst?: boolean;
  burstDelay?: number;
  burstCount?: number;
  burstSpeed?: number;
  /** After arming, laser stays active this many seconds. */
  activeTtl?: number;
  /** Visual-only style. */
  shape?: BulletShape;
  hue?: BulletHue;
  /** Continuous yaw of velocity vector (rad/s) for curving danmaku. */
  spin?: number;
  /** Linear speed change (px/s²), clamped in simulation. */
  accel?: number;
  /** Discrete TH06-style redirects (Bullet::dirChange*). */
  dirChangeInterval?: number; // seconds between redirects
  dirChangeRotation?: number; // radians added to velocity angle per redirect
  dirChangeSpeed?: number; // px/s re-applied at each redirect (optional)
  dirChangeMax?: number; // total redirects
  dirChangeDone?: number; // runtime counter
  /** Spawn-in grace (seconds): inert + materializing while age < spawnInS. */
  spawnInS?: number;
  /** Bomb / phase-clear cancel: non-colliding fade-out. */
  cancelling?: boolean;
  cancelLife?: number;
  cancelMaxLife?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
  shape?: BulletShape;
  hue?: BulletHue;
  /** Floating feedback text (e.g. "+8" on power pickup); drawn instead of a spark. */
  text?: string;
}

export interface BattleInputState {
  moveX: number;
  moveY: number;
  focused: boolean;
  firing: boolean;
  bombPressed: boolean;
  pausePressed: boolean;
  pointerActive: boolean;
  pointerX: number;
  pointerY: number;
}

export interface BattleStats {
  grazes: number;
  hits: number;
  damage: number;
  phasesCleared: number;
  bombsUsed: number;
  misses: number;
  activeMs: number;
  mobsDefeated: number;
  powerCollected: number;
}

export interface PhaseRuntime {
  index: number;
  startedAt: number;
  captureFailed: boolean;
  kind: 'nonspell' | 'spell';
  name: string;
  /** Game-time when the fairy intro wave ends; unset/0 once the boss joins. */
  waveUntil?: number;
}

export type EngineMode = 'loading' | 'playing' | 'paused' | 'finished';

export interface BattleSnapshot {
  mode: EngineMode;
  player: PlayerState;
  boss: BossState;
  phase: PhaseRuntime;
  phaseCount: number;
  stats: BattleStats;
  enemyShots: number;
  playerShots: number;
  mobs: number;
  items: number;
  paused: boolean;
  result: BattleResult | null;
}

/** Shot lane layout from current power. Pure function for tests. */
export function powerShotLayout(power: number, focused: boolean): { offsets: number[]; damageBonus: number } {
  const p = clamp(power, 0, POWER_MAX);
  if (focused) {
    if (p >= 96) return { offsets: [-14, -5, 5, 14], damageBonus: 2 };
    if (p >= 64) return { offsets: [-10, 0, 10], damageBonus: 1 };
    if (p >= 32) return { offsets: [-8, 8], damageBonus: 1 };
    if (p >= 16) return { offsets: [-6, 6], damageBonus: 0 };
    return { offsets: [0], damageBonus: 0 };
  }
  if (p >= 96) return { offsets: [-22, -11, 0, 11, 22], damageBonus: 1 };
  if (p >= 64) return { offsets: [-18, -6, 6, 18], damageBonus: 1 };
  if (p >= 32) return { offsets: [-16, 0, 16], damageBonus: 0 };
  if (p >= 16) return { offsets: [-12, 12], damageBonus: 0 };
  return { offsets: [-10, 10], damageBonus: 0 };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Cut-in damage tiers: S0 intact → S1 light → S2 heavy. Battle-damage only, never nudity. */
export const BOSS_DAMAGE_LABELS = ['完好', '轻损', '重损'] as const;

/**
 * Visual damage tier (0..2) from phase progression. 2 phases: P1=0, P2=1,
 * final break=2 (settle screen). 4 phases: P1-2=0, P3=1, P4=2.
 */
export function bossDamageLevel(phaseIndex: number, phaseCount: number): 0 | 1 | 2 {
  if (!Number.isFinite(phaseIndex) || !Number.isFinite(phaseCount) || phaseCount <= 0) return 0;
  const index = clamp(Math.floor(phaseIndex), 0, Math.max(0, phaseCount - 1));
  const level = Math.floor((index * 3) / phaseCount);
  return level >= 2 ? 2 : level === 1 ? 1 : 0;
}

export function isRegisteredPattern(id: string): id is RegisteredPatternId {
  return (REGISTERED_PATTERNS as readonly string[]).includes(id);
}

export function arenaPlayerSpawn(arena: { width: number; height: number }) {
  return {
    x: arena.width / 2,
    y: arena.height * 0.875,
  };
}

export function arenaBossSpawn(arena: { width: number; height: number }) {
  return {
    x: arena.width / 2,
    y: Math.max(72, arena.height * 0.156),
  };
}

export function createEmptyInput(): BattleInputState {
  return {
    moveX: 0,
    moveY: 0,
    focused: false,
    firing: false,
    bombPressed: false,
    pausePressed: false,
    pointerActive: false,
    pointerX: 0,
    pointerY: 0,
  };
}
