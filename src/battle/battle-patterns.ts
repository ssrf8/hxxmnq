import {
  clamp,
  isRegisteredPattern,
  SPAWN_IN_S,
  type BattleConfig,
  type BattlePatternConfig,
  type Bullet,
  type BulletHue,
  type BulletShape,
} from './battle-types';

export interface PatternSpawnContext {
  bossX: number;
  bossY: number;
  playerX: number;
  playerY: number;
  arenaWidth: number;
  arenaHeight: number;
  nextId: () => number;
  random: () => number;
  volleyIndex: number;
  phaseElapsedMs: number;
  /** Optional discrete-redirect spec stamped onto every spawned bullet. */
  dirChange?: { interval: number; rotation: number; speed?: number; max: number } | null;
  /** Optional per-bullet launch jitter (radians ± / px/s ±). */
  randomJitter?: { angle: number; speed: number } | null;
}

function limitsOf(config: BattleConfig) {
  return {
    speed: config.parameter_limits?.speed ?? [40, 260],
    count: config.parameter_limits?.count ?? [1, 32],
    interval: config.parameter_limits?.interval_ms ?? [80, 10000],
  };
}

export function clampPattern(config: BattleConfig, pattern: BattlePatternConfig): BattlePatternConfig | null {
  if (!isRegisteredPattern(pattern.pattern_id)) return null;
  const limits = limitsOf(config);
  return {
    ...pattern,
    interval_ms: clamp(pattern.interval_ms, limits.interval[0], limits.interval[1]),
    speed: pattern.speed == null ? undefined : clamp(pattern.speed, limits.speed[0], limits.speed[1]),
    count: pattern.count == null ? undefined : clamp(Math.round(pattern.count), limits.count[0], limits.count[1]),
    warning_ms: pattern.warning_ms == null ? undefined : clamp(pattern.warning_ms, 0, 5000),
    duration_ms: pattern.duration_ms == null ? undefined : clamp(pattern.duration_ms, 200, 120000),
    turn_rate_deg: pattern.turn_rate_deg == null ? undefined : clamp(pattern.turn_rate_deg, 0, 360),
    arc_deg: pattern.arc_deg == null ? undefined : clamp(pattern.arc_deg, 1, 360),
    angle_deg: pattern.angle_deg == null ? undefined : clamp(pattern.angle_deg, -360, 360),
    rotate_deg_per_volley: pattern.rotate_deg_per_volley == null
      ? undefined
      : clamp(pattern.rotate_deg_per_volley, -45, 45),
    burst_delay_ms: pattern.burst_delay_ms == null ? undefined : clamp(pattern.burst_delay_ms, 100, 3000),
    gaps: pattern.gaps == null ? undefined : clamp(Math.round(pattern.gaps), 1, 4),
    active_ms: pattern.active_ms == null ? undefined : clamp(pattern.active_ms, 100, 4000),
    spin_deg_per_s: pattern.spin_deg_per_s == null ? undefined : clamp(pattern.spin_deg_per_s, -180, 180),
    layer_speed_scale: pattern.layer_speed_scale == null ? undefined : clamp(pattern.layer_speed_scale, 0.4, 1.5),
    aim_lead: pattern.aim_lead == null ? undefined : clamp(pattern.aim_lead, 0, 1),
    dir_change_interval_ms: pattern.dir_change_interval_ms == null
      ? undefined
      : clamp(pattern.dir_change_interval_ms, 120, 8000),
    dir_change_rotation_deg: pattern.dir_change_rotation_deg == null
      ? undefined
      : clamp(pattern.dir_change_rotation_deg, -180, 180),
    dir_change_speed: pattern.dir_change_speed == null
      ? undefined
      : clamp(pattern.dir_change_speed, limits.speed[0], limits.speed[1]),
    dir_change_times: pattern.dir_change_times == null
      ? undefined
      : clamp(Math.round(pattern.dir_change_times), 0, 6),
    random_angle_deg: pattern.random_angle_deg == null ? undefined : clamp(pattern.random_angle_deg, 0, 90),
    random_speed: pattern.random_speed == null ? undefined : clamp(pattern.random_speed, 0, 120),
  };
}

const HUES: BulletHue[] = ['red', 'blue', 'pink', 'cyan', 'purple', 'gold', 'green'];

function hueFor(index: number, offset = 0): BulletHue {
  return HUES[(index + offset) % HUES.length]!;
}

function styleForPattern(patternId: string, index: number, volley: number): { shape: BulletShape; hue: BulletHue; radius: number } {
  switch (patternId) {
    case 'fixed_seed_ring':
      // Classic red/blue seed dots with mixed pellet/circle silhouettes.
      return {
        shape: index % 3 === 0 ? 'pellet' : index % 3 === 1 ? 'circle' : 'rice',
        hue: index % 2 === 0 ? 'red' : 'blue',
        radius: index % 3 === 2 ? 5 : 6,
      };
    case 'rotating_ring':
      // Alternating red/blue pellets — classic dual-color rings.
      return { shape: index % 2 === 0 ? 'pellet' : 'circle', hue: index % 2 === 0 ? 'red' : 'blue', radius: 5.5 };
    case 'petal_fan':
      return { shape: 'petal', hue: index % 2 === 0 ? 'pink' : 'purple', radius: 7 };
    case 'wave_fan':
      return { shape: 'ellipse', hue: index % 2 === 0 ? 'cyan' : 'blue', radius: 6.5 };
    case 'homing_leaf':
      return { shape: 'kunai', hue: 'green', radius: 6 };
    case 'aimed_stream':
      return { shape: 'rice', hue: 'gold', radius: 5 };
    case 'burst_cluster':
      // 大玉 mother orb; its children keep their explicit pellet/circle style.
      return { shape: 'orb', hue: 'gold', radius: 9 };
    case 'cross_sweep':
      return { shape: 'star', hue: index % 2 === 0 ? 'purple' : 'pink', radius: 6.5 };
    case 'local_safe_zone':
    case 'falling_lanes':
      return { shape: 'crystal', hue: 'purple', radius: 7 };
    default:
      return { shape: 'circle', hue: hueFor(index), radius: 6 };
  }
}

function pushEnemy(
  out: Bullet[],
  ctx: PatternSpawnContext,
  partial: Omit<Bullet, 'id' | 'kind' | 'age' | 'collidable' | 'grazed'> & { collidable?: boolean },
) {
  const style = partial.patternId
    ? styleForPattern(partial.patternId, out.length + ctx.volleyIndex, ctx.volleyIndex)
    : { shape: 'circle' as BulletShape, hue: 'blue' as BulletHue, radius: partial.radius };
  // RANDOM_ANGLE / RANDOM_SPEED jitter — deterministic via ctx.random; never
  // perturbs stationary telegraph markers (warnings / lasers / safe lanes).
  let vx = partial.vx;
  let vy = partial.vy;
  if (ctx.randomJitter && !partial.warning && !partial.laser && !partial.safeLane) {
    const baseSpeed = Math.hypot(vx, vy);
    if (baseSpeed > 0.001) {
      const angle = Math.atan2(vy, vx) + (ctx.random() - 0.5) * 2 * ctx.randomJitter.angle;
      const speed = Math.max(30, baseSpeed + (ctx.random() - 0.5) * 2 * ctx.randomJitter.speed);
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
    }
  }
  out.push({
    id: ctx.nextId(),
    kind: 'enemy',
    age: 0,
    grazed: false,
    collidable: partial.collidable ?? true,
    x: partial.x,
    y: partial.y,
    vx,
    vy,
    radius: partial.radius || style.radius,
    homing: partial.homing,
    turnRate: partial.turnRate,
    patternId: partial.patternId,
    warning: partial.warning,
    safeLane: partial.safeLane,
    ttl: partial.ttl,
    laser: partial.laser,
    laserLength: partial.laserLength,
    laserAngle: partial.laserAngle,
    burst: partial.burst,
    burstDelay: partial.burstDelay,
    burstCount: partial.burstCount,
    burstSpeed: partial.burstSpeed,
    activeTtl: partial.activeTtl,
    shape: partial.shape ?? style.shape,
    hue: partial.hue ?? style.hue,
    spin: partial.spin,
    accel: partial.accel,
    dirChangeInterval: ctx.dirChange?.interval,
    dirChangeRotation: ctx.dirChange?.rotation,
    dirChangeSpeed: ctx.dirChange?.speed,
    dirChangeMax: ctx.dirChange ? ctx.dirChange.max : undefined,
    dirChangeDone: ctx.dirChange ? 0 : undefined,
    // Telegraphs (warnings/lasers/safe lanes) manage their own timing; only
    // ordinary shots get the brief spawn-in materialize grace.
    spawnInS: partial.warning || partial.laser || partial.safeLane ? undefined : SPAWN_IN_S,
  });
}

function velocity(angle: number, speed: number) {
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

/**
 * Aim modes reimplemented from the public GensokyoClub/th06 decompilation
 * (BulletManager::SpawnSingleBullet / EnemyBulletShooter). Math only — no
 * original assets, ECL bytecode, or extracted stage data are used.
 *
 * FAN_AIMED / FAN:
 *   pair bullets L/R of a base using angle2 as the step (odd count keeps center).
 * CIRCLE_AIMED / CIRCLE:
 *   even ring; optional aim; count2 layers lerp speed1→speed2.
 * OFFSET_CIRCLE(_AIMED):
 *   same as circle but rotated by π/count so gaps don't stack across volleys.
 */
type AimMode = 'fan_aimed' | 'fan' | 'circle_aimed' | 'circle' | 'offset_circle_aimed' | 'offset_circle';

function th06BulletAngle(
  mode: AimMode,
  bulletIdx: number,
  layerIdx: number,
  count: number,
  angle1: number,
  angle2: number,
  aimToPlayer: number,
): number {
  let bulletAngle = 0;
  if (mode === 'fan_aimed' || mode === 'fan') {
    if ((count & 1) !== 0) {
      bulletAngle = ((bulletIdx + 1) >> 1) * angle2;
    } else {
      bulletAngle = (bulletIdx >> 1) * angle2 + angle2 * 0.5;
    }
    if ((bulletIdx & 1) !== 0) bulletAngle *= -1;
    if (mode === 'fan_aimed') bulletAngle += aimToPlayer;
    bulletAngle += angle1;
    return bulletAngle;
  }
  if (mode === 'circle_aimed' || mode === 'offset_circle_aimed') {
    bulletAngle += aimToPlayer;
  }
  if (mode === 'offset_circle' || mode === 'offset_circle_aimed') {
    bulletAngle += Math.PI / Math.max(1, count);
  }
  bulletAngle += (bulletIdx * Math.PI * 2) / Math.max(1, count);
  bulletAngle += layerIdx * angle2 + angle1;
  return bulletAngle;
}

function th06LayerSpeed(speed1: number, speed2: number, layerIdx: number, layerCount: number) {
  if (layerCount <= 1) return speed1;
  // speed1 - (speed1 - speed2) * layerIdx / count2  (TH06 SpawnSingleBullet)
  return speed1 - ((speed1 - speed2) * layerIdx) / layerCount;
}

/**
 * Spawn whitelist patterns. Motion formulas follow the public th06 decomp's
 * aim-mode math; pattern IDs and JSON stay project-owned.
 */
export function spawnPatternBullets(
  config: BattleConfig,
  pattern: BattlePatternConfig,
  ctx: PatternSpawnContext,
): Bullet[] {
  const safe = clampPattern(config, pattern);
  if (!safe) return [];
  // Stamp discrete-redirect spec (if any) onto every bullet this pattern emits.
  ctx.dirChange = safe.dir_change_interval_ms != null && safe.dir_change_times != null && safe.dir_change_times > 0
    ? {
        interval: safe.dir_change_interval_ms / 1000,
        rotation: ((safe.dir_change_rotation_deg ?? 0) * Math.PI) / 180,
        speed: safe.dir_change_speed,
        max: safe.dir_change_times,
      }
    : null;
  ctx.randomJitter = (safe.random_angle_deg ?? 0) > 0 || (safe.random_speed ?? 0) > 0
    ? { angle: ((safe.random_angle_deg ?? 0) * Math.PI) / 180, speed: safe.random_speed ?? 0 }
    : null;
  const out: Bullet[] = [];
  const count = Math.round(safe.count ?? 8);
  const speed = safe.speed ?? 100;
  const id = safe.pattern_id;
  const spin = safe.spin_deg_per_s != null ? (safe.spin_deg_per_s * Math.PI) / 180 : undefined;
  const layerScale = safe.layer_speed_scale ?? 0.72;
  const phase = ctx.volleyIndex * 0.37 + ctx.phaseElapsedMs * 0.0011;
  const aimToPlayer = Math.atan2(ctx.playerY - ctx.bossY, ctx.playerX - ctx.bossX);
  const rotate = ((safe.rotate_deg_per_volley ?? 0) * Math.PI) / 180;
  // angle1 accumulates per volley so rings/fans precess instead of stacking.
  const angle1 = ((safe.angle_deg ?? 0) * Math.PI) / 180 + ctx.volleyIndex * rotate + phase * 0.05;

  if (id === 'petal_fan') {
    // FAN_AIMED with 2–3 speed layers (count2 in TH06).
    const angle2 = ((safe.arc_deg ?? 80) * Math.PI) / 180 / Math.max(1, count);
    const layers = Math.max(1, Math.min(3, Math.round(1 + (1 - layerScale) * 4)));
    const speed2 = speed * layerScale;
    for (let layer = 0; layer < layers; layer += 1) {
      const layerSpeed = th06LayerSpeed(speed, speed2, layer, layers);
      for (let i = 0; i < count; i += 1) {
        const angle = th06BulletAngle('fan_aimed', i, layer, count, angle1, angle2, aimToPlayer);
        const v = velocity(angle, layerSpeed);
        pushEnemy(out, ctx, {
          x: ctx.bossX + Math.cos(angle) * 4,
          y: ctx.bossY + Math.sin(angle) * 4,
          ...v,
          radius: 7,
          patternId: id,
          spin: (i % 2 === 0 ? 1 : -1) * (spin ?? 0.28),
          accel: -10,
        });
      }
    }
    return out;
  }

  if (id === 'homing_leaf') {
    // Short FAN_AIMED burst that then homes — leaves open then lock.
    const turnRate = ((safe.turn_rate_deg ?? 55) * Math.PI) / 180;
    const angle2 = 0.16 + 0.03 * Math.sin(phase);
    for (let i = 0; i < count; i += 1) {
      const angle = th06BulletAngle('fan_aimed', i, 0, count, angle1 * 0.2, angle2, aimToPlayer);
      const v = velocity(angle, speed * (0.92 + 0.05 * (i % 3)));
      pushEnemy(out, ctx, {
        x: ctx.bossX + (i - (count - 1) / 2) * 8,
        y: ctx.bossY + 6,
        ...v,
        radius: 7,
        homing: true,
        turnRate,
        patternId: id,
        spin: (i % 2 === 0 ? 0.18 : -0.18),
      });
    }
    return out;
  }

  if (id === 'local_safe_zone' || id === 'falling_lanes') {
    const gaps = id === 'falling_lanes' ? (safe.gaps ?? 2) : 1;
    const warningMs = safe.warning_ms ?? 1200;
    const fallSpeed = speed * (id === 'falling_lanes' ? 1.35 : 1.5);
    const corridorHalf = id === 'falling_lanes' ? 36 : 50;
    // Safe lanes walk over time so the player can't camp one x forever.
    const drift = Math.sin(phase * 0.7) * 40;
    const centers: number[] = [];
    for (let g = 0; g < gaps; g += 1) {
      const base = 90 + ((g + 0.5) / gaps) * (ctx.arenaWidth - 180) + drift * (g % 2 === 0 ? 1 : -1);
      centers.push(clamp(base + (ctx.random() - 0.5) * 30, 70, ctx.arenaWidth - 70));
    }
    centers.sort((a, b) => a - b);
    for (let x = 20; x < ctx.arenaWidth; x += 24) {
      if (centers.some((c) => Math.abs(x - c) <= corridorHalf)) continue;
      pushEnemy(out, ctx, {
        x,
        y: -10 - (x % 3) * 8,
        vx: fallSpeed,
        vy: 0,
        radius: 7,
        patternId: id,
        collidable: false,
        warning: true,
        ttl: warningMs / 1000,
      });
    }
    for (const safeX of centers) {
      pushEnemy(out, ctx, {
        x: safeX,
        y: 24,
        vx: 0,
        vy: 0,
        radius: corridorHalf,
        patternId: id,
        collidable: false,
        warning: true,
        safeLane: true,
        ttl: warningMs / 1000,
      });
    }
    return out;
  }

  if (id === 'aimed_stream') {
    // Single / multi FAN_AIMED stream with speed stacks (count2-style).
    const lead = safe.aim_lead ?? 0.12;
    const predictedX = ctx.playerX + (ctx.playerX - ctx.bossX) * lead * 0.02;
    const predictedY = ctx.playerY + (ctx.playerY - ctx.bossY) * lead * 0.02;
    const aim = Math.atan2(predictedY - ctx.bossY, predictedX - ctx.bossX);
    const angle2 = ((safe.arc_deg ?? (count > 1 ? 10 : 0)) * Math.PI) / 180 / Math.max(1, count);
    const stacks = count === 1 ? 3 : 1;
    for (let layer = 0; layer < stacks; layer += 1) {
      const layerSpeed = th06LayerSpeed(speed * 1.08, speed * 0.92, layer, stacks);
      for (let i = 0; i < Math.max(1, count); i += 1) {
        const angle = th06BulletAngle(
          count === 1 ? 'fan_aimed' : 'fan_aimed',
          i,
          layer,
          Math.max(1, count),
          0,
          angle2,
          aim,
        );
        const v = velocity(angle, layerSpeed);
        pushEnemy(out, ctx, {
          x: ctx.bossX,
          y: ctx.bossY,
          ...v,
          radius: 5,
          patternId: id,
          accel: 20,
        });
      }
    }
    return out;
  }

  if (id === 'rotating_ring') {
    // CIRCLE + OFFSET_CIRCLE dual layers (outer/inner), opposite spin.
    // TH06 OFFSET_CIRCLE adds π/count so spokes don't stack across volleys.
    const angle2 = ((safe.rotate_deg_per_volley ?? 8) * Math.PI) / 180;
    const layers = [
      { mode: 'circle' as AimMode, scale: 1, count, spinSign: 1 as const, radius: 6 },
      {
        mode: 'offset_circle' as AimMode,
        scale: layerScale,
        count: Math.max(6, Math.round(count * 0.75)),
        spinSign: -1 as const,
        radius: 5,
      },
    ];
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i += 1) {
        const angle = th06BulletAngle(
          layer.mode,
          i,
          0,
          layer.count,
          angle1 + (layer.spinSign < 0 ? phase * 0.2 : 0),
          angle2,
          aimToPlayer,
        );
        // For non-aimed rings we ignore aim; re-derive without aim for pure CIRCLE.
        const pure = th06BulletAngle(
          layer.mode === 'offset_circle' ? 'offset_circle' : 'circle',
          i,
          ctx.volleyIndex % 3,
          layer.count,
          angle1,
          angle2 * 0.25,
          0,
        );
        void angle;
        const v = velocity(pure, speed * layer.scale);
        pushEnemy(out, ctx, {
          x: ctx.bossX,
          y: ctx.bossY,
          ...v,
          radius: layer.radius,
          patternId: id,
          spin: (spin ?? 0.55) * layer.spinSign,
          accel: layer.spinSign > 0 ? -8 : 12,
        });
      }
    }
    return out;
  }

  if (id === 'wave_fan') {
    // FAN that sweeps: angle1 oscillates each volley (wave_fan identity).
    const sweep = Math.sin(ctx.volleyIndex * 0.85 + ctx.phaseElapsedMs / 650);
    const angle2 = ((safe.arc_deg ?? 70) * Math.PI) / 180 / Math.max(1, count);
    const baseAim = aimToPlayer + sweep * angle2 * count * 0.35;
    const layers = 2;
    const speed2 = speed * layerScale;
    for (let layer = 0; layer < layers; layer += 1) {
      const layerSpeed = th06LayerSpeed(speed, speed2, layer, layers);
      for (let i = 0; i < count; i += 1) {
        const angle = th06BulletAngle('fan_aimed', i, layer, count, angle1 * 0.3, angle2, baseAim);
        const v = velocity(angle, layerSpeed);
        pushEnemy(out, ctx, {
          x: ctx.bossX,
          y: ctx.bossY,
          ...v,
          radius: 6,
          patternId: id,
          spin: sweep >= 0 ? 0.4 : -0.4,
          accel: 8,
        });
      }
    }
    return out;
  }

  if (id === 'burst_cluster') {
    // Mothers on a short FAN_AIMED, then detonate into CIRCLE rings (red/blue).
    const mothers = Math.max(1, Math.min(6, Math.round(count / 4) || 1));
    const childCount = clamp(count, 6, 16);
    const delay = (safe.burst_delay_ms ?? 700) / 1000;
    const angle2 = 0.35;
    for (let i = 0; i < mothers; i += 1) {
      const angle = th06BulletAngle('fan_aimed', i, 0, mothers, 0, angle2, aimToPlayer);
      const v = velocity(angle, speed * 0.42);
      pushEnemy(out, ctx, {
        x: ctx.bossX + (i - (mothers - 1) / 2) * 14,
        y: ctx.bossY + Math.cos(phase + i) * 5,
        ...v,
        radius: 10,
        patternId: id,
        burst: true,
        burstDelay: delay * (0.9 + 0.1 * (i % 2)),
        burstCount: childCount,
        burstSpeed: speed,
        collidable: true,
        spin: (i % 2 === 0 ? 1 : -1) * 0.45,
      });
    }
    return out;
  }

  if (id === 'cross_sweep') {
    // Not a direct TH06 aim mode — keep as gap-chase lines with moving notch.
    const gapSlot = (ctx.volleyIndex * 2 + Math.floor(ctx.random() * 2)) % 5;
    const fromLeft = ctx.volleyIndex % 2 === 0;
    const rowCount = 6;
    for (let row = 0; row < rowCount; row += 1) {
      if (row === gapSlot) continue;
      const y = 120 + row * ((ctx.arenaHeight - 220) / Math.max(1, rowCount - 1));
      const vSpeed = speed * (0.9 + 0.05 * (row % 3));
      pushEnemy(out, ctx, {
        x: fromLeft ? -12 : ctx.arenaWidth + 12,
        y,
        vx: (fromLeft ? 1 : -1) * vSpeed,
        vy: Math.sin(phase + row) * 12,
        radius: 7,
        patternId: id,
        spin: fromLeft ? 0.12 : -0.12,
      });
    }
    const vertGap = (gapSlot + 2) % 4;
    for (let col = 0; col < 5; col += 1) {
      if (col === vertGap) continue;
      const x = 50 + col * ((ctx.arenaWidth - 100) / 4);
      pushEnemy(out, ctx, {
        x,
        y: -12,
        vx: Math.sin(phase + col) * 16,
        vy: speed * 0.95,
        radius: 6,
        patternId: id,
      });
    }
    return out;
  }

  if (id === 'laser_warning') {
    const warningMs = safe.warning_ms ?? 900;
    const activeMs = safe.active_ms ?? 700;
    const n = Math.max(1, Math.min(4, count));
    for (let i = 0; i < n; i += 1) {
      // Alternate player-aimed and fixed cardinal/diagonal lines.
      const aimed = aimToPlayer + (i - (n - 1) / 2) * 0.35;
      const fixed = (Math.PI / 2) * (i % 2) + (ctx.volleyIndex % 2 === 0 ? 0 : Math.PI / 4);
      const angle = i % 2 === 0 ? aimed : fixed;
      pushEnemy(out, ctx, {
        x: ctx.bossX,
        y: ctx.bossY,
        vx: 0,
        vy: 0,
        radius: 5,
        patternId: id,
        collidable: false,
        warning: true,
        laser: true,
        laserLength: Math.hypot(ctx.arenaWidth, ctx.arenaHeight),
        laserAngle: angle,
        ttl: warningMs / 1000,
        activeTtl: activeMs / 1000,
      });
    }
    return out;
  }

  // fixed_seed_ring — CIRCLE + OFFSET_CIRCLE dual rings (TH06 flower open).
  // Outer: CIRCLE with slow negative accel. Inner: OFFSET_CIRCLE so spokes nest.
  const outerCount = count;
  const innerCount = Math.max(6, Math.round(count * 0.7));
  const angle2 = 0.04;
  for (let i = 0; i < outerCount; i += 1) {
    const angle = th06BulletAngle('circle', i, ctx.volleyIndex % 2, outerCount, angle1 + phase, angle2, 0);
    const v = velocity(angle, speed);
    pushEnemy(out, ctx, {
      x: ctx.bossX,
      y: ctx.bossY,
      ...v,
      radius: 6.5,
      patternId: 'fixed_seed_ring',
      spin: spin ?? 0.22,
      accel: -6,
    });
  }
  for (let i = 0; i < innerCount; i += 1) {
    const angle = th06BulletAngle(
      'offset_circle',
      i,
      0,
      innerCount,
      -angle1 * 0.7 - phase * 0.5,
      angle2,
      0,
    );
    const v = velocity(angle, speed * layerScale);
    pushEnemy(out, ctx, {
      x: ctx.bossX,
      y: ctx.bossY,
      ...v,
      radius: 5,
      patternId: 'fixed_seed_ring',
      spin: -(spin ?? 0.22),
      accel: 14,
    });
  }
  return out;
}

/** Convert safe-zone / falling-lane warning markers into collidable rain. */
export function armFallingWarnings(bullets: Bullet[]): void {
  for (const bullet of bullets) {
    if (bullet.patternId !== 'local_safe_zone' && bullet.patternId !== 'falling_lanes') continue;
    if (bullet.safeLane) {
      bullet.ttl = 0;
      continue;
    }
    if (bullet.warning) {
      bullet.warning = false;
      bullet.collidable = true;
      bullet.vy = bullet.vx || 150;
      bullet.vx = 0;
      bullet.ttl = undefined;
    }
  }
}

/** @deprecated alias kept for older call sites during M3 */
export const armSafeZoneRain = armFallingWarnings;

/** Arm laser_warning after telegraph. */
export function armLasers(bullets: Bullet[]): void {
  for (const bullet of bullets) {
    if (!bullet.laser || !bullet.warning) continue;
    if (bullet.ttl != null && bullet.age >= bullet.ttl) {
      bullet.warning = false;
      bullet.collidable = true;
      bullet.ttl = undefined;
      bullet.age = 0;
    }
  }
}

/** Explode burst mothers into child rings. Returns newly spawned children. */
export function detonateBursts(bullets: Bullet[], nextId: () => number): Bullet[] {
  const children: Bullet[] = [];
  for (const bullet of bullets) {
    if (!bullet.burst || bullet.burstDelay == null) continue;
    if (bullet.age < bullet.burstDelay) continue;
    const n = bullet.burstCount ?? 10;
    const spd = bullet.burstSpeed ?? 120;
    for (let i = 0; i < n; i += 1) {
      // OFFSET_CIRCLE child ring so the split doesn't sit on the mother's spokes.
      const angle = Math.PI / n + (i * Math.PI * 2) / n;
      const childStyle = i % 2 === 0
        ? { shape: 'pellet' as BulletShape, hue: 'red' as BulletHue, radius: 5 }
        : { shape: 'circle' as BulletShape, hue: 'blue' as BulletHue, radius: 5 };
      children.push({
        id: nextId(),
        kind: 'enemy',
        x: bullet.x,
        y: bullet.y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        radius: childStyle.radius,
        age: 0,
        grazed: false,
        collidable: true,
        patternId: 'burst_cluster',
        shape: childStyle.shape,
        hue: childStyle.hue,
        spin: (i % 2 === 0 ? 1 : -1) * 0.35,
        accel: -4,
        spawnInS: SPAWN_IN_S,
      });
    }
    bullet.burst = false;
    bullet.collidable = false;
    bullet.ttl = 0;
  }
  return children;
}

/** Point-segment distance for laser collision. */
export function distanceToLaser(px: number, py: number, laser: Bullet): number {
  const angle = laser.laserAngle ?? 0;
  const length = laser.laserLength ?? 600;
  const x2 = laser.x + Math.cos(angle) * length;
  const y2 = laser.y + Math.sin(angle) * length;
  const dx = x2 - laser.x;
  const dy = y2 - laser.y;
  const denom = dx * dx + dy * dy || 1;
  let t = ((px - laser.x) * dx + (py - laser.y) * dy) / denom;
  t = clamp(t, 0, 1);
  const cx = laser.x + dx * t;
  const cy = laser.y + dy * t;
  return Math.hypot(px - cx, py - cy);
}
