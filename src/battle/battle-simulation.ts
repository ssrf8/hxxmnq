import {
  armFallingWarnings,
  armLasers,
  clampPattern,
  detonateBursts,
  distanceToLaser,
  spawnPatternBullets,
} from './battle-patterns';
import {
  arenaBossSpawn,
  arenaPlayerSpawn,
  BOMB_DURATION_MS,
  BOMB_INVULN_MS,
  clamp,
  DEATHBOMB_WINDOW_MS,
  DEFAULT_BOMBS,
  FIXED_STEP_MS,
  GRAZE_RADIUS,
  ITEM_MAGNET_RADIUS,
  ITEM_POC_RATIO,
  MAX_ENEMY_SHOTS,
  MAX_ITEMS,
  MAX_MOBS,
  MAX_PARTICLES,
  MAX_PLAYER_SHOTS,
  PLAYER_SHOT_SPEED,
  POWER_BIG_VALUE,
  POWER_MAX,
  POWER_SMALL_VALUE,
  powerShotLayout,
  RESPAWN_CONTROL_LOCK_MS,
  RESPAWN_TOTAL_MS,
  type BattleConfig,
  type BattleInputState,
  type BattleMobWaveConfig,
  type BattleSnapshot,
  type BossState,
  type Bullet,
  type EngineMode,
  type ItemState,
  type MobState,
  type Particle,
  type PhaseRuntime,
  type PlayerState,
  type BattleStats,
} from './battle-types';
import type { BattleResult } from '../ui/types';
import type { BattleSfxId } from './battle-sound';

export interface SimulationHooks {
  onFinish: (result: BattleResult) => void;
  random?: () => number;
  /** Typed SFX events — a silent placeholder bus consumes these for now. */
  sfx?: (id: BattleSfxId) => void;
}

function createStats(): BattleStats {
  return {
    grazes: 0,
    hits: 0,
    damage: 0,
    phasesCleared: 0,
    bombsUsed: 0,
    misses: 0,
    activeMs: 0,
    mobsDefeated: 0,
    powerCollected: 0,
  };
}

let battleRunSequence = 0;

function createSettlementRunId() {
  battleRunSequence += 1;
  const time = Date.now().toString(36).slice(-8).padStart(8, '0');
  const sequence = battleRunSequence.toString(36).slice(-3).padStart(3, '0');
  const entropy = Math.floor(Math.random() * 0x1000000).toString(36).slice(-5).padStart(5, '0');
  return `${time}${sequence}${entropy}`;
}

function createPlayer(config: BattleConfig): PlayerState {
  const spawn = arenaPlayerSpawn(config.arena);
  const lives = Math.max(1, Math.round(config.player.lives));
  const bombs = Math.max(0, Math.round(config.player.bombs ?? DEFAULT_BOMBS));
  const power = clamp(Math.round(config.player.power ?? 0), 0, POWER_MAX);
  return {
    x: spawn.x,
    y: spawn.y,
    lives,
    bombs,
    maxBombs: bombs,
    power,
    focused: false,
    firing: false,
    invulnerableUntil: 0,
    deathbombUntil: null,
    respawnUntil: null,
    controlLockedUntil: 0,
    bombUntil: 0,
    bombStartedAt: 0,
    state: 'active',
    initialLives: lives,
  };
}

function createBoss(config: BattleConfig, phaseIndex: number): BossState {
  const spawn = arenaBossSpawn(config.arena);
  const phase = config.phases[phaseIndex]!;
  return {
    x: spawn.x,
    y: spawn.y,
    hp: phase.hp,
    maxHp: phase.hp,
    hitFlashUntil: 0,
  };
}

function phaseMeta(config: BattleConfig, index: number, startedAt: number): PhaseRuntime {
  const phase = config.phases[index]!;
  const kind = phase.kind ?? (index % 2 === 0 ? 'nonspell' : 'spell');
  return {
    index,
    startedAt,
    captureFailed: false,
    kind,
    name: phase.name ?? phase.id,
  };
}

/** Distance from point P to segment AB — used for discrete shot vs fairy hits. */
function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 <= 1e-6) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

export class BattleSimulation {
  readonly config: BattleConfig;
  private readonly onFinish: (result: BattleResult) => void;
  private readonly random: () => number;
  private readonly sfx: (id: BattleSfxId) => void;

  private player: PlayerState;
  private boss: BossState;
  private phase: PhaseRuntime;
  private stats = createStats();
  private playerShots: Bullet[] = [];
  private enemyShots: Bullet[] = [];
  private particles: Particle[] = [];
  private mobs: MobState[] = [];
  private items: ItemState[] = [];
  private patternTimes = new Map<string, number>();
  private patternVolleys = new Map<string, number>();
  private mobWaveTimes = new Map<string, number>();
  private nextEntityId = 1;
  private mode: EngineMode = 'loading';
  private finished = false;
  private result: BattleResult | null = null;
  private gameTimeMs = 0;
  private lastShotAt = -Infinity;
  private settlementSerial = 0;
  private readonly settlementRunId = createSettlementRunId();
  private lostLifeThisRun = false;
  private bombEdgeLatched = false;
  private waveStartedAt = 0;
  private pointerAnchor: { x: number; y: number } | null = null;

  constructor(config: BattleConfig, hooks: SimulationHooks) {
    if (!config.phases.length) throw new Error('战斗配置缺少阶段');
    this.config = config;
    this.onFinish = hooks.onFinish;
    this.random = hooks.random ?? Math.random;
    this.sfx = hooks.sfx ?? (() => {});
    this.player = createPlayer(config);
    this.boss = createBoss(config, 0);
    this.phase = phaseMeta(config, 0, 0);
  }

  start() {
    if (this.mode === 'playing' || this.mode === 'paused') return;
    if (this.finished) return;
    this.mode = 'playing';
    this.gameTimeMs = 0;
    this.beginPhase(0, 0);
  }

  pause() {
    if (this.mode === 'playing') this.mode = 'paused';
  }

  resume() {
    if (this.mode === 'paused') this.mode = 'playing';
  }

  togglePause() {
    if (this.mode === 'playing') this.pause();
    else if (this.mode === 'paused') this.resume();
  }

  getMode() {
    return this.mode;
  }

  isFinished() {
    return this.finished;
  }

  getResult() {
    return this.result;
  }

  /** Advance one fixed simulation step. Wall-clock pauses must not call this. */
  step(input: BattleInputState, bombPressed: boolean) {
    if (this.mode !== 'playing' || this.finished) return;
    const dt = FIXED_STEP_MS / 1000;
    this.gameTimeMs += FIXED_STEP_MS;
    this.stats.activeMs += FIXED_STEP_MS;
    const now = this.gameTimeMs;

    this.handleBombEdge(bombPressed, now);
    this.updatePlayer(input, now, dt);
    this.updateShooting(input, now);
    // Intro wave over → the boss joins now; its phase clock starts here so the
    // declaration banner / cut-in fire on arrival, not during the sweep.
    if (this.phase.waveUntil && now >= this.phase.waveUntil) {
      this.phase.waveUntil = undefined;
      this.phase.startedAt = now;
      this.sfx('spell_declare');
    }
    const waveActive = this.isWaveActive(now);
    if (!waveActive) {
      this.updateBoss(now);
      this.updatePatterns(now);
    }
    this.updateMobWaves(now, dt, waveActive);
    this.updateBullets(now, dt);
    this.updateItems(dt);
    this.updateParticles(dt);
    this.resolveCollisions(now);
    this.resolvePhaseProgress(now);
  }

  cancelWithoutResult() {
    this.mode = 'finished';
    this.finished = true;
  }

  forceFinish(outcome: BattleResult['outcome']) {
    this.finish(outcome);
  }

  snapshot(): BattleSnapshot {
    return {
      mode: this.mode,
      player: { ...this.player },
      boss: { ...this.boss },
      phase: { ...this.phase },
      phaseCount: this.config.phases.length,
      stats: { ...this.stats },
      enemyShots: this.enemyShots.length,
      playerShots: this.playerShots.length,
      mobs: this.mobs.length,
      items: this.items.length,
      paused: this.mode === 'paused',
      result: this.result,
    };
  }

  getRenderState() {
    return {
      player: this.player,
      boss: this.boss,
      phase: this.phase,
      phaseCount: this.config.phases.length,
      stats: this.stats,
      playerShots: this.playerShots,
      enemyShots: this.enemyShots,
      particles: this.particles,
      mobs: this.mobs,
      items: this.items,
      mode: this.mode,
      gameTimeMs: this.gameTimeMs,
      arena: this.config.arena,
      hitboxRadius: this.config.player.hitbox_radius,
      familiars: this.familiarPositions(this.gameTimeMs),
    };
  }

  private beginPhase(index: number, now: number) {
    this.phase = phaseMeta(this.config, index, now);
    this.boss = createBoss(this.config, index);
    // Fairy-sweep intro: boss stays absent while intro_mobs spawn and drop power.
    const cfg = this.config.phases[index]!;
    const introMs = clamp(Math.round(cfg.intro_ms ?? 0), 0, 30000);
    if (introMs > 0 && (cfg.intro_mobs?.length ?? 0) > 0) {
      this.phase.waveUntil = now + introMs;
      this.waveStartedAt = now;
      this.sfx('wave_start');
    } else {
      this.sfx('spell_declare');
    }
    // Keep already-cancelling bullets so bomb/phase clear can fade out.
    this.enemyShots = this.enemyShots.filter((bullet) => bullet.cancelling);
    this.playerShots = [];
    this.mobs = [];
    this.patternTimes.clear();
    this.patternVolleys.clear();
    this.mobWaveTimes.clear();
    this.player.invulnerableUntil = Math.max(this.player.invulnerableUntil, now + 400);
  }

  private handleBombEdge(bombPressed: boolean, now: number) {
    const edge = bombPressed && !this.bombEdgeLatched;
    this.bombEdgeLatched = bombPressed;
    if (!edge) return;
    this.tryBomb(now);
  }

  private tryBomb(now: number) {
    if (this.finished) return;
    if (this.player.state === 'respawning' && now < (this.player.respawnUntil ?? 0)) return;
    if (this.player.bombs <= 0) return;
    if (this.player.state === 'bombing' && now < this.player.bombUntil) return;

    const inDeathbomb =
      this.player.state === 'deathbomb'
      && this.player.deathbombUntil != null
      && now <= this.player.deathbombUntil;

    this.player.bombs -= 1;
    this.stats.bombsUsed += 1;
    this.sfx('bomb');
    if (this.phase.kind === 'spell') this.phase.captureFailed = true;

    this.player.state = 'bombing';
    this.player.bombStartedAt = now;
    this.player.bombUntil = now + BOMB_DURATION_MS;
    this.player.invulnerableUntil = Math.max(this.player.invulnerableUntil, now + BOMB_INVULN_MS);
    this.player.deathbombUntil = null;

    if (inDeathbomb) {
      // Successful deathbomb cancels the pending miss.
      this.player.state = 'bombing';
    }

    this.cancelEnemyShots(0.55);
    // Bomb also clears living fairies and pulls power items (TH06-like vacuum).
    for (const mob of this.mobs) {
      this.defeatMob(mob, true);
    }
    this.mobs = [];
    for (const item of this.items) item.attracted = true;
    // The absent boss takes no bomb damage during a fairy intro sweep.
    if (!this.isWaveActive(now)) {
      const phaseHp = Math.max(1, this.boss.maxHp);
      const bombDamage = Math.min(phaseHp * 0.2, phaseHp * 0.25);
      this.boss.hp = Math.max(0, this.boss.hp - bombDamage);
      this.stats.damage += bombDamage;
    }
    // No boss hit-swap animation — damage is shown on the HP bar only.
  }

  /** Convert live enemy shots into non-colliding fade-outs (Touhou-like cancel). */
  private cancelEnemyShots(fadeSeconds = 0.55) {
    for (const shot of this.enemyShots) {
      if (shot.safeLane || shot.cancelling) continue;
      shot.collidable = false;
      shot.warning = false;
      shot.laser = false;
      shot.burst = false;
      shot.cancelling = true;
      shot.cancelMaxLife = fadeSeconds;
      shot.cancelLife = fadeSeconds;
      // Soft outward drift instead of instant delete.
      shot.vx *= 0.35;
      shot.vy *= 0.35;
    }
  }

  private updatePlayer(input: BattleInputState, now: number, dt: number) {
    if (this.player.state === 'finished') return;

    if (this.player.state === 'deathbomb' && this.player.deathbombUntil != null && now > this.player.deathbombUntil) {
      this.resolveMiss(now);
    }

    if (this.player.state === 'bombing' && now >= this.player.bombUntil) {
      this.player.state = 'active';
    }

    if (this.player.state === 'respawning' && this.player.respawnUntil != null && now >= this.player.respawnUntil) {
      this.player.state = 'active';
      this.player.respawnUntil = null;
    }

    this.player.focused = input.focused;
    this.player.firing = input.firing;

    const canControl = now >= this.player.controlLockedUntil && this.player.state !== 'deathbomb';
    if (!canControl) return;

    const speed = input.focused ? this.config.player.focus_speed : this.config.player.move_speed;
    let dx = input.moveX;
    let dy = input.moveY;
    if (input.pointerActive) {
      if (input.pointerRelative && !this.pointerAnchor) {
        this.pointerAnchor = { x: this.player.x, y: this.player.y };
      }
      if (!input.pointerRelative) this.pointerAnchor = null;
      const targetX = input.pointerRelative
        ? (this.pointerAnchor?.x ?? this.player.x) + input.pointerX
        : input.pointerX;
      const targetY = input.pointerRelative
        ? (this.pointerAnchor?.y ?? this.player.y) + input.pointerY
        : input.pointerY;
      const tx = targetX - this.player.x;
      const ty = targetY - this.player.y;
      const dist = Math.hypot(tx, ty);
      if (dist > 1.5) {
        dx = tx / dist;
        dy = ty / dist;
      } else {
        dx = 0;
        dy = 0;
      }
      // pointer overrides keyboard when active
      const step = Math.min(dist, speed * dt);
      this.player.x += (tx / Math.max(dist, 1)) * step;
      this.player.y += (ty / Math.max(dist, 1)) * step;
    } else {
      this.pointerAnchor = null;
      const length = Math.hypot(dx, dy) || 1;
      this.player.x += (dx / length) * speed * dt;
      this.player.y += (dy / length) * speed * dt;
    }

    const margin = 14;
    const topLimit = Math.max(160, this.config.arena.height * 0.28);
    this.player.x = clamp(this.player.x, margin, this.config.arena.width - margin);
    this.player.y = clamp(this.player.y, topLimit, this.config.arena.height - margin);
  }

  private updateShooting(input: BattleInputState, now: number) {
    // auto_fire is off by default (Z / touch-hold only). Config may re-enable for assist.
    const wantsFire = input.firing || this.config.player.auto_fire === true;
    if (!wantsFire) return;
    if (this.player.state === 'deathbomb') return;
    if (this.player.state === 'respawning' && now < this.player.controlLockedUntil) return;
    if (this.player.state === 'finished') return;

    const focused = input.focused;
    const shot = focused ? this.config.player.focus_shot : this.config.player.normal_shot;
    if (now - this.lastShotAt < shot.interval_ms) return;
    this.lastShotAt = now;
    if (this.playerShots.length >= MAX_PLAYER_SHOTS) return;

    // Power only widens lanes / adds a small damage bonus — never touches BattleResult fields.
    const layout = powerShotLayout(this.player.power, focused);
    this.sfx('player_shot');
    for (const offset of layout.offsets) {
      if (this.playerShots.length >= MAX_PLAYER_SHOTS) break;
      this.playerShots.push({
        id: this.nextEntityId++,
        kind: 'player',
        x: this.player.x + offset,
        y: this.player.y - 18,
        vx: focused ? 0 : offset * 1.6,
        vy: -PLAYER_SHOT_SPEED,
        radius: 4,
        damage: shot.damage + layout.damageBonus,
        age: 0,
        collidable: true,
      });
    }
  }

  private updatePatterns(now: number) {
    const phase = this.config.phases[this.phase.index];
    if (!phase) return;
    const phaseElapsed = now - this.phase.startedAt;
    for (const raw of phase.patterns) {
      const pattern = clampPattern(this.config, raw);
      if (!pattern) continue;
      if (pattern.start_ms != null && phaseElapsed < pattern.start_ms) continue;
      if (pattern.end_ms != null && phaseElapsed > pattern.end_ms) continue;
      const key = `${this.phase.index}:${pattern.pattern_id}:${pattern.interval_ms}:${pattern.start_ms ?? 0}`;
      const last = this.patternTimes.get(key) ?? this.phase.startedAt - pattern.interval_ms;
      if (now - last < pattern.interval_ms) continue;
      this.patternTimes.set(key, now);
      const volley = (this.patternVolleys.get(key) ?? 0) + 1;
      this.patternVolleys.set(key, volley);
      if (this.enemyShots.length >= MAX_ENEMY_SHOTS) continue;
      // Familiar-sourced patterns rotate through the orbiting satellites.
      let originX = this.boss.x;
      let originY = this.boss.y;
      if (pattern.from_familiar) {
        const familiars = this.familiarPositions(now);
        if (familiars.length > 0) {
          const origin = familiars[(volley - 1) % familiars.length]!;
          originX = origin.x;
          originY = origin.y;
        }
      }
      const spawned = spawnPatternBullets(this.config, pattern, {
        bossX: originX,
        bossY: originY,
        playerX: this.player.x,
        playerY: this.player.y,
        arenaWidth: this.config.arena.width,
        arenaHeight: this.config.arena.height,
        nextId: () => this.nextEntityId++,
        random: this.random,
        volleyIndex: volley - 1,
        phaseElapsedMs: phaseElapsed,
      });
      for (const bullet of spawned) {
        if (this.enemyShots.length >= MAX_ENEMY_SHOTS) break;
        this.enemyShots.push(bullet);
      }
      if (pattern.pattern_id === 'laser_warning' && spawned.length > 0) {
        this.sfx('laser_warning');
      }
    }
  }

  /**
   * Sparse mid-wave fairies. Keep density low so the Boss remains the focus.
   * Abstracted from TH06 EnemyManager life/itemDrop — no ECL scripts.
   */
  private isWaveActive(now: number) {
    return Boolean(this.phase.waveUntil && now < this.phase.waveUntil);
  }

  /** Orbiting familiar positions — deterministic ellipse around the boss. */
  familiarPositions(now = this.gameTimeMs): Array<{ x: number; y: number }> {
    const phase = this.config.phases[this.phase.index];
    const cfg = phase?.familiars;
    if (!cfg || this.isWaveActive(now) || this.boss.hp <= 0) return [];
    const count = clamp(Math.round(cfg.count ?? 2), 1, 3);
    const orbit = clamp(cfg.orbit_px ?? 56, 24, 120);
    const period = clamp(cfg.orbit_ms ?? 4200, 1200, 20000);
    const base = ((now - this.phase.startedAt) * Math.PI * 2) / period;
    return Array.from({ length: count }, (_, i) => {
      const angle = base + (i * Math.PI * 2) / count;
      return {
        x: this.boss.x + Math.cos(angle) * orbit,
        y: this.boss.y + Math.sin(angle) * orbit * 0.55,
      };
    });
  }

  /**
   * TH06-style boss drift (EnemyManager repositions bosses between volleys):
   * a deterministic slow sway around the spawn anchor. Patterns and aimed
   * shots follow automatically because they read boss.x/y at spawn time.
   */
  private updateBoss(now: number) {
    if (this.boss.hp <= 0) return;
    const spawn = arenaBossSpawn(this.config.arena);
    const elapsed = now - this.phase.startedAt;
    this.boss.x = spawn.x + Math.sin((elapsed * Math.PI * 2) / 6200) * 36;
    this.boss.y = spawn.y + Math.sin((elapsed * Math.PI * 2) / 3900) * 9;
  }

  private updateMobWaves(now: number, dt: number, waveActive = false) {
    const phase = this.config.phases[this.phase.index];
    if (!phase) return;
    // During the fairy intro the wave list, clock origin and default window all
    // come from the sweep, not the boss phase.
    const waveBase = waveActive ? this.waveStartedAt : this.phase.startedAt;
    const phaseElapsed = now - waveBase;
    const waves = (waveActive ? phase.intro_mobs : phase.mobs) ?? [];
    const defaultEnd = waveActive && this.phase.waveUntil
      ? this.phase.waveUntil - this.waveStartedAt
      : phase.duration_ms;

    for (let wi = 0; wi < waves.length; wi += 1) {
      const wave = waves[wi]!;
      const startMs = wave.start_ms ?? (waveActive ? 0 : 800);
      const endMs = wave.end_ms ?? defaultEnd;
      if (phaseElapsed < startMs || phaseElapsed > endMs) continue;
      const interval = clamp(Math.round(wave.interval_ms || 4000), 600, 20000);
      const key = `${this.phase.index}:${waveActive ? 'intro' : 'mob'}:${wi}:${interval}:${startMs}`;
      const last = this.mobWaveTimes.get(key) ?? waveBase + startMs - interval;
      if (now - last < interval) continue;
      this.mobWaveTimes.set(key, now);
      const count = clamp(Math.round(wave.count ?? 1), 1, 3);
      for (let i = 0; i < count; i += 1) {
        if (this.mobs.length >= MAX_MOBS) break;
        this.spawnMob(wave, i, count);
      }
    }

    for (const mob of this.mobs) {
      mob.age += dt;
      mob.bob += dt * 2.4;
      // Side path drifts across; top path descends with a light weave (keep near lane).
      if (mob.path === 'side') {
        mob.x += mob.vx * dt;
        mob.y += Math.sin(mob.bob) * 14 * dt + mob.vy * dt * 0.35;
      } else {
        mob.x += Math.sin(mob.bob) * 12 * dt + mob.vx * dt * 0.15;
        mob.y += mob.vy * dt;
      }

      if (mob.shotInterval > 0 && mob.age > 0.35) {
        const lastShot = mob.lastShotAt;
        if ((now - lastShot) >= mob.shotInterval && this.enemyShots.length < MAX_ENEMY_SHOTS) {
          mob.lastShotAt = now;
          const aim = Math.atan2(this.player.y - mob.y, this.player.x - mob.x);
          const n = clamp(Math.round(mob.shotCount), 1, 3);
          const spread = n === 1 ? 0 : 0.22;
          for (let i = 0; i < n; i += 1) {
            if (this.enemyShots.length >= MAX_ENEMY_SHOTS) break;
            const angle = aim + (i - (n - 1) / 2) * spread;
            this.enemyShots.push({
              id: this.nextEntityId++,
              kind: 'enemy',
              x: mob.x,
              y: mob.y + 6,
              vx: Math.cos(angle) * mob.shotSpeed,
              vy: Math.sin(angle) * mob.shotSpeed,
              radius: 4.5,
              age: 0,
              collidable: true,
              patternId: 'aimed_stream',
              shape: 'bead',
              hue: i % 2 === 0 ? 'red' : 'blue',
            });
          }
        }
      }
    }

    this.mobs = this.mobs.filter((mob) => (
      mob.hp > 0
      && mob.x > -40
      && mob.x < this.config.arena.width + 40
      && mob.y > -40
      && mob.y < this.config.arena.height + 40
      && mob.age < 18
    ));
  }

  private spawnMob(wave: BattleMobWaveConfig, index: number, total: number) {
    if (this.mobs.length >= MAX_MOBS) return;
    const path = wave.path === 'top' ? 'top' : 'side';
    const hp = clamp(Math.round(wave.hp ?? 6), 1, 40);
    const speed = clamp(wave.speed ?? 70, 30, 160);
    const radius = clamp(wave.radius ?? 12, 8, 20);
    const drop = wave.drop === 'none' || wave.drop === 'power_big' || wave.drop === 'power_small'
      ? wave.drop
      : 'power_small';
    const shotInterval = clamp(Math.round(wave.shot_interval_ms ?? 0), 0, 4000);
    const shotCount = clamp(Math.round(wave.shot_count ?? 1), 1, 3);
    const shotSpeed = clamp(wave.shot_speed ?? 110, 40, 220);
    const arena = this.config.arena;
    let x: number;
    let y: number;
    let vx: number;
    let vy: number;

    if (path === 'top') {
      const lane = (index + 1) / (total + 1);
      x = arena.width * (0.18 + lane * 0.64) + (this.random() - 0.5) * 8;
      y = -16;
      vx = (this.random() - 0.5) * 8;
      // Descend past the boss band into mid-field so player shots can connect.
      vy = speed * 0.95;
    } else {
      const fromLeft = (this.mobs.length + index) % 2 === 0;
      x = fromLeft ? -18 : arena.width + 18;
      // Prefer lower mid-field (below boss hit disc) so fairies are shootable.
      y = arena.height * (0.28 + this.random() * 0.22);
      vx = (fromLeft ? 1 : -1) * speed;
      vy = speed * 0.08;
    }

    this.mobs.push({
      id: this.nextEntityId++,
      x,
      y,
      vx,
      vy,
      hp,
      maxHp: hp,
      radius,
      age: 0,
      shotInterval,
      shotCount,
      shotSpeed,
      lastShotAt: this.gameTimeMs,
      drop,
      path,
      bob: this.random() * Math.PI * 2,
      defeated: false,
    });
  }

  private pushParticle(particle: Particle) {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push(particle);
  }

  private defeatMob(mob: MobState, fromBomb = false) {
    // Idempotent: the kill is credited / loot dropped once, whether the last
    // damage came from a player shot (hp already <= 0) or a bomb (hp still > 0).
    void fromBomb;
    if (mob.defeated) return;
    mob.defeated = true;
    mob.hp = 0;
    this.stats.mobsDefeated += 1;
    this.sfx('mob_defeat');
    if (mob.drop !== 'none') {
      this.spawnItem(mob.x, mob.y, mob.drop === 'power_big' ? 'power_big' : 'power_small');
    }
    // Small star burst tinted by the drop so kills read at a glance.
    const gold = mob.drop === 'power_big';
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2 + this.random() * 0.8;
      const speed = 45 + this.random() * 50;
      this.pushParticle({
        x: mob.x,
        y: mob.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.32 + this.random() * 0.14,
        maxLife: 0.46,
        radius: 5,
        color: gold ? '#ffd35a' : '#9ad0ff',
        hue: gold ? 'gold' : 'cyan',
        shape: 'pellet',
      });
    }
  }

  private spawnItem(x: number, y: number, kind: ItemState['kind']) {
    if (this.items.length >= MAX_ITEMS) return;
    this.items.push({
      id: this.nextEntityId++,
      x,
      y,
      vx: (this.random() - 0.5) * 30,
      vy: -40 - this.random() * 30,
      kind,
      age: 0,
      attracted: false,
    });
  }

  private updateItems(dt: number) {
    const pocY = this.config.arena.height * ITEM_POC_RATIO;
    const playerInPoc = this.player.y <= pocY;
    if (playerInPoc) {
      for (const item of this.items) item.attracted = true;
    }

    for (const item of this.items) {
      item.age += dt;
      if (item.attracted) {
        const dx = this.player.x - item.x;
        const dy = this.player.y - item.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pull = 420;
        item.vx = (dx / dist) * pull;
        item.vy = (dy / dist) * pull;
      } else {
        // Soft fall after initial pop — TH06-like arc without original physics tables.
        item.vy = Math.min(140, item.vy + 180 * dt);
        item.vx *= Math.max(0, 1 - 1.2 * dt);
        const magnetDist = Math.hypot(item.x - this.player.x, item.y - this.player.y);
        if (magnetDist < ITEM_MAGNET_RADIUS) item.attracted = true;
      }
      item.x += item.vx * dt;
      item.y += item.vy * dt;
    }

    const keep: ItemState[] = [];
    for (const item of this.items) {
      const dist = Math.hypot(item.x - this.player.x, item.y - this.player.y);
      if (dist < 16) {
        this.collectItem(item);
        continue;
      }
      if (item.y > this.config.arena.height + 30) continue;
      if (item.x < -30 || item.x > this.config.arena.width + 30) continue;
      if (item.age > 14) continue;
      keep.push(item);
    }
    this.items = keep;
  }

  private collectItem(item: ItemState) {
    const value = item.kind === 'power_big' ? POWER_BIG_VALUE : POWER_SMALL_VALUE;
    const before = this.player.power;
    this.player.power = clamp(this.player.power + value, 0, POWER_MAX);
    this.stats.powerCollected += this.player.power - before;
    this.sfx('item_pickup');
    this.pushParticle({
      x: item.x,
      y: item.y - 6,
      vx: 0,
      vy: -46,
      life: 0.5,
      maxLife: 0.5,
      radius: 1,
      color: item.kind === 'power_big' ? '#ffe08a' : '#ffc9b8',
      text: this.player.power >= POWER_MAX && before >= POWER_MAX
        ? 'MAX'
        : `+${value}`,
    });
  }

  private updateBullets(now: number, dt: number) {
    for (const bullet of this.playerShots) {
      bullet.age += dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
    }
    for (const bullet of this.enemyShots) {
      bullet.age += dt;
      if (bullet.cancelling) {
        bullet.cancelLife = (bullet.cancelLife ?? 0) - dt;
        bullet.vx *= Math.max(0, 1 - 1.8 * dt);
        bullet.vy *= Math.max(0, 1 - 1.8 * dt);
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        continue;
      }
      if (
        bullet.warning
        && bullet.ttl != null
        && bullet.age >= bullet.ttl
        && (bullet.patternId === 'local_safe_zone' || bullet.patternId === 'falling_lanes')
      ) {
        armFallingWarnings(this.enemyShots);
      }
      if (bullet.laser && bullet.warning && bullet.ttl != null && bullet.age >= bullet.ttl) {
        armLasers(this.enemyShots);
        this.sfx('laser_fire');
      }
      // Discrete TH06-style redirects: turn (and optionally re-speed) at fixed
      // intervals, up to dirChangeMax. Deterministic — driven by bullet.age only.
      if (bullet.dirChangeInterval && bullet.dirChangeMax && (bullet.dirChangeDone ?? 0) < bullet.dirChangeMax) {
        const shouldHave = Math.min(bullet.dirChangeMax, Math.floor(bullet.age / bullet.dirChangeInterval));
        while ((bullet.dirChangeDone ?? 0) < shouldHave) {
          const speed = bullet.dirChangeSpeed ?? (Math.hypot(bullet.vx, bullet.vy) || 1);
          const angle = Math.atan2(bullet.vy, bullet.vx) + (bullet.dirChangeRotation ?? 0);
          bullet.vx = Math.cos(angle) * speed;
          bullet.vy = Math.sin(angle) * speed;
          bullet.dirChangeDone = (bullet.dirChangeDone ?? 0) + 1;
        }
      }
      if (bullet.homing && bullet.age < 1.8) {
        const targetAngle = Math.atan2(this.player.y - bullet.y, this.player.x - bullet.x);
        const currentSpeed = Math.hypot(bullet.vx, bullet.vy) || 1;
        const turn = bullet.turnRate ?? 1.2;
        const currentAngle = Math.atan2(bullet.vy, bullet.vx);
        let delta = targetAngle - currentAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const maxTurn = turn * dt;
        const nextAngle = currentAngle + clamp(delta, -maxTurn, maxTurn);
        bullet.vx = Math.cos(nextAngle) * currentSpeed;
        bullet.vy = Math.sin(nextAngle) * currentSpeed;
      } else if (bullet.spin) {
        // Constant yaw — produces spirals / curved streams without scripted paths.
        const currentSpeed = Math.hypot(bullet.vx, bullet.vy) || 1;
        const currentAngle = Math.atan2(bullet.vy, bullet.vx) + bullet.spin * dt;
        bullet.vx = Math.cos(currentAngle) * currentSpeed;
        bullet.vy = Math.sin(currentAngle) * currentSpeed;
      }
      if (bullet.accel) {
        const currentSpeed = Math.hypot(bullet.vx, bullet.vy) || 1;
        const nextSpeed = clamp(currentSpeed + bullet.accel * dt, 30, 320);
        if (currentSpeed > 0.001) {
          bullet.vx = (bullet.vx / currentSpeed) * nextSpeed;
          bullet.vy = (bullet.vy / currentSpeed) * nextSpeed;
        }
      }
      // Active lasers and pure warnings stay anchored; mothers still drift.
      if (!bullet.warning && !bullet.laser) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
      } else if (bullet.burst) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
      }
    }

    const burstChildren = detonateBursts(this.enemyShots, () => this.nextEntityId++);
    for (const child of burstChildren) {
      if (this.enemyShots.length >= MAX_ENEMY_SHOTS) break;
      this.enemyShots.push(child);
    }

    this.playerShots = this.playerShots.filter((b) => b.y > -30 && b.y < this.config.arena.height + 30);
    this.enemyShots = this.enemyShots.filter((b) => {
      if (b.cancelling) return (b.cancelLife ?? 0) > 0;
      if (b.ttl != null && b.age >= b.ttl && (b.safeLane || b.ttl === 0)) return false;
      if (b.laser && !b.warning && b.activeTtl != null && b.age >= b.activeTtl) return false;
      if (b.burst === false && b.ttl === 0) return false;
      if (b.laser) return true;
      return b.y < this.config.arena.height + 40 && b.y > -40 && b.x > -40 && b.x < this.config.arena.width + 40;
    });
    void now;
  }

  private updateParticles(dt: number) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0).slice(0, MAX_PARTICLES);
  }

  private resolveCollisions(now: number) {
    // Player shots vs fairies first (cheap targets), then boss.
    // Fast shots + fixed step can tunnel past thin fairies; use a short swept segment
    // along the shot velocity (half-step back) with a few px of forgiveness.
    this.playerShots = this.playerShots.filter((bullet) => {
      const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
      const backX = bullet.x - (bullet.vx / speed) * Math.min(10, speed * (FIXED_STEP_MS / 1000));
      const backY = bullet.y - (bullet.vy / speed) * Math.min(10, speed * (FIXED_STEP_MS / 1000));
      for (const mob of this.mobs) {
        if (mob.hp <= 0) continue;
        const hitR = bullet.radius + mob.radius + 3;
        if (
          Math.hypot(bullet.x - mob.x, bullet.y - mob.y) <= hitR
          || Math.hypot(backX - mob.x, backY - mob.y) <= hitR
          || pointSegmentDistance(mob.x, mob.y, backX, backY, bullet.x, bullet.y) <= hitR
        ) {
          const damage = bullet.damage ?? 1;
          mob.hp -= damage;
          mob.hitAt = now;
          this.stats.hits += 1;
          this.stats.damage += damage;
          if (mob.hp <= 0) this.defeatMob(mob, false);
          return false;
        }
      }
      if (!this.isWaveActive(now) && Math.hypot(bullet.x - this.boss.x, bullet.y - this.boss.y) <= bullet.radius + 28) {
        const damage = bullet.damage ?? 1;
        this.boss.hp -= damage;
        // Additive brighten only — the boss never swaps frames on hit.
        this.boss.hitFlashUntil = now + 90;
        this.stats.hits += 1;
        this.stats.damage += damage;
        this.sfx('boss_hit');
        // Impact spark right where the shot lands.
        this.pushParticle({
          x: bullet.x + (this.random() - 0.5) * 6,
          y: bullet.y - 2,
          vx: (this.random() - 0.5) * 60,
          vy: -30 - this.random() * 40,
          life: 0.14,
          maxLife: 0.14,
          radius: 2.2,
          color: '#ffe9b3',
        });
        return false;
      }
      return true;
    });
    this.mobs = this.mobs.filter((mob) => mob.hp > 0);

    if (this.player.state === 'deathbomb' || this.player.state === 'finished') return;
    if (now < this.player.invulnerableUntil) return;
    if (this.player.state === 'bombing') return;
    if (this.player.state === 'respawning' && now < (this.player.respawnUntil ?? 0)) return;

    // Body contact with fairies (rare, but consistent with TH06 body hit).
    for (const mob of this.mobs) {
      if (Math.hypot(mob.x - this.player.x, mob.y - this.player.y) < mob.radius + this.config.player.hitbox_radius) {
        this.enterDeathbomb(now);
        return;
      }
    }

    for (const bullet of this.enemyShots) {
      if (!bullet.collidable || bullet.warning || bullet.cancelling) continue;
      // Spawn-in grace: a materializing shot is inert (no hit, no graze) briefly.
      if (bullet.spawnInS != null && bullet.age < bullet.spawnInS) continue;
      if (bullet.laser) {
        const distance = distanceToLaser(this.player.x, this.player.y, bullet);
        if (distance < bullet.radius + this.config.player.hitbox_radius) {
          this.enterDeathbomb(now);
          return;
        }
        // Lasers graze continuously on a tick while the player rides the beam.
        if (
          distance < bullet.radius + GRAZE_RADIUS
          && now - (bullet.lastGrazeAt ?? -Infinity) >= 150
        ) {
          bullet.lastGrazeAt = now;
          this.stats.grazes += 1;
          this.spawnGrazeSpark();
        }
        continue;
      }
      const distance = Math.hypot(bullet.x - this.player.x, bullet.y - this.player.y);
      if (distance < bullet.radius + this.config.player.hitbox_radius) {
        this.enterDeathbomb(now);
        bullet.collidable = false;
        return;
      }
      if (!bullet.grazed && distance < bullet.radius + GRAZE_RADIUS) {
        bullet.grazed = true;
        this.stats.grazes += 1;
        this.spawnGrazeSpark();
      }
    }
  }

  /** Tiny white spark at the player's rim — TH06-style graze feedback. */
  private spawnGrazeSpark() {
    const angle = this.random() * Math.PI * 2;
    this.pushParticle({
      x: this.player.x + Math.cos(angle) * 10,
      y: this.player.y + Math.sin(angle) * 10,
      vx: Math.cos(angle) * 90,
      vy: Math.sin(angle) * 90,
      life: 0.18,
      maxLife: 0.18,
      radius: 2.5,
      color: '#f4f7ff',
    });
  }

  private enterDeathbomb(now: number) {
    const windowMs = this.config.player.deathbomb_ms ?? DEATHBOMB_WINDOW_MS;
    this.player.state = 'deathbomb';
    this.player.deathbombUntil = now + windowMs;
  }

  private resolveMiss(now: number) {
    this.stats.misses += 1;
    this.lostLifeThisRun = true;
    this.player.lastMissAt = now;
    this.sfx('player_miss');
    if (this.phase.kind === 'spell') this.phase.captureFailed = true;

    this.player.lives -= 1;
    this.player.deathbombUntil = null;
    this.player.bombs = this.player.maxBombs;
    this.cancelEnemyShots(0.45);

    // Project semantics: after a miss reduces lives to 0, the run is lost.
    if (this.player.lives <= 0) {
      this.player.lives = 0;
      this.player.state = 'finished';
      this.finish('loss');
      return;
    }

    const spawn = arenaPlayerSpawn(this.config.arena);
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    this.player.state = 'respawning';
    this.player.respawnUntil = now + RESPAWN_TOTAL_MS;
    this.player.controlLockedUntil = now + RESPAWN_CONTROL_LOCK_MS;
    // Post-death mercy invulnerability. Floor nudged toward TH06's 240-frame (~4s)
    // recovery so a miss in dense danmaku doesn't chain into an instant second miss.
    this.player.invulnerableUntil = now + Math.max(this.config.player.invulnerability_ms, 2400);
  }

  private resolvePhaseProgress(now: number) {
    if (this.finished) return;
    const phase = this.config.phases[this.phase.index];
    if (!phase) return;
    // Boss absent during the fairy sweep — neither HP nor timeout can advance.
    if (this.isWaveActive(now)) return;

    if (this.boss.hp <= 0) {
      this.stats.phasesCleared += 1;
      this.sfx('phase_break');
      this.cancelEnemyShots(0.4);
      if (this.phase.index + 1 >= this.config.phases.length) {
        this.finish(this.lostLifeThisRun || this.player.lives < this.player.initialLives ? 'narrow_win' : 'clean_win');
      } else {
        this.beginPhase(this.phase.index + 1, now);
      }
      return;
    }

    if (now - this.phase.startedAt >= phase.duration_ms) {
      this.stats.phasesCleared += 1;
      this.cancelEnemyShots(0.35);
      if (this.phase.kind === 'spell') this.phase.captureFailed = true;
      if (this.phase.index + 1 >= this.config.phases.length) {
        this.finish('narrow_win');
      } else {
        this.beginPhase(this.phase.index + 1, now);
      }
    }
  }

  private finish(outcome: BattleResult['outcome']) {
    if (this.finished) return;
    this.finished = true;
    this.mode = 'finished';
    this.player.state = 'finished';
    this.settlementSerial += 1;
    const cleared = Math.min(this.config.phases.length, this.stats.phasesCleared);
    const partial = cleared >= this.config.phases.length
      ? 0
      : clamp(1 - this.boss.hp / Math.max(1, this.boss.maxHp), 0, 1);
    const remaining = Math.max(0, this.player.lives);
    const clean = outcome === 'clean_win'
      || (outcome !== 'loss' && outcome !== 'narrative' && !this.lostLifeThisRun && remaining >= this.player.initialLives && cleared >= this.config.phases.length);
    const finalOutcome: BattleResult['outcome'] =
      outcome === 'loss' || outcome === 'narrative'
        ? outcome
        : clean
          ? 'clean_win'
          : 'narrow_win';

    const result: BattleResult = {
      settlement_id: `${this.config.config_id.slice(0, 32)}-r${this.settlementRunId}-s${this.settlementSerial}-${Math.floor(this.gameTimeMs).toString(36)}`,
      config_id: this.config.config_id,
      outcome: finalOutcome,
      remaining_lives: remaining,
      grazes: this.stats.grazes,
      duration_ms: Math.round(this.stats.activeMs),
      hits: this.stats.hits,
      damage: Math.round(this.stats.damage),
      phases_cleared: cleared,
      objective_ratio: Math.round((100 * (cleared + partial)) / this.config.phases.length),
    };
    this.result = result;
    this.sfx(finalOutcome === 'loss' ? 'battle_lose' : 'battle_win');
    this.onFinish(result);
  }
}
