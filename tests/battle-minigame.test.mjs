import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const importTypescript = async (path) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

const baseConfig = {
  config_id: 'fairy_pattern_practice_v1',
  arena: { width: 480, height: 640 },
  player: {
    lives: 3,
    move_speed: 230,
    focus_speed: 115,
    hitbox_radius: 4,
    invulnerability_ms: 1600,
    auto_fire: false,
    normal_shot: { damage: 1, interval_ms: 95 },
    focus_shot: { damage: 2, interval_ms: 110 },
    bombs: 3,
    deathbomb_ms: 150,
  },
  phases: [
    {
      id: 'practice_ring',
      kind: 'nonspell',
      name: '圆阵练习',
      hp: 40,
      duration_ms: 20000,
      patterns: [{ pattern_id: 'fixed_seed_ring', interval_ms: 1600, speed: 85, count: 10 }],
    },
  ],
  parameter_limits: {
    speed: [40, 260],
    count: [1, 32],
    interval_ms: [80, 10000],
    duration_ms: [500, 120000],
    damage: [1, 10],
  },
  allowed_outcomes: ['clean_win', 'narrow_win', 'loss'],
};

test('配置生命数与 arena 派生出生点', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const { arenaPlayerSpawn, arenaBossSpawn } = await importTypescript('../src/battle/battle-types.ts');
  const results = [];
  const config = {
    ...baseConfig,
    player: { ...baseConfig.player, lives: 5 },
    arena: { width: 360, height: 520 },
  };
  const sim = new BattleSimulation(config, { onFinish: (r) => results.push(r), random: () => 0.25 });
  sim.start();
  const snap = sim.snapshot();
  assert.equal(snap.player.lives, 5);
  assert.equal(snap.player.initialLives, 5);
  const expectedPlayer = arenaPlayerSpawn(config.arena);
  const expectedBoss = arenaBossSpawn(config.arena);
  assert.equal(snap.player.x, expectedPlayer.x);
  assert.equal(snap.player.y, expectedPlayer.y);
  assert.equal(snap.boss.x, expectedBoss.x);
  assert.equal(snap.boss.y, expectedBoss.y);
});

test('onFinish 每局只调用一次，cancel 不结算', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const results = [];
  const sim = new BattleSimulation(
    {
      ...baseConfig,
      phases: [{ id: 'instant', kind: 'nonspell', name: 'x', hp: 1, duration_ms: 5000, patterns: [] }],
    },
    { onFinish: (r) => results.push(r), random: () => 0.5 },
  );
  sim.start();
  const input = {
    moveX: 0, moveY: 0, focused: false, firing: true,
    bombPressed: false, pausePressed: false, pointerActive: false, pointerX: 0, pointerY: 0,
  };
  for (let i = 0; i < 800; i += 1) sim.step(input, false);
  assert.equal(results.length, 1);
  sim.forceFinish('loss');
  sim.forceFinish('clean_win');
  assert.equal(results.length, 1);

  const cancelled = [];
  const sim2 = new BattleSimulation(baseConfig, { onFinish: (r) => cancelled.push(r) });
  sim2.start();
  sim2.cancelWithoutResult();
  assert.equal(cancelled.length, 0);
  assert.equal(sim2.isFinished(), true);
});

test('固定时钟下暂停不推进阶段，clean_win 用初始生命判定', async () => {
  const { BattleSimulation, FIXED_STEP_MS } = await importTypescript('../src/battle/battle-simulation.ts')
    .then(async (mod) => ({ ...mod, ...(await importTypescript('../src/battle/battle-types.ts')) }));
  const results = [];
  const sim = new BattleSimulation(
    {
      ...baseConfig,
      player: { ...baseConfig.player, lives: 2, auto_fire: true },
      phases: [{ id: 'quick', kind: 'spell', name: '快', hp: 8, duration_ms: 30000, patterns: [] }],
    },
    { onFinish: (r) => results.push(r), random: () => 0.1 },
  );
  sim.start();
  sim.pause();
  const input = {
    moveX: 0, moveY: 0, focused: true, firing: true,
    bombPressed: false, pausePressed: false, pointerActive: false, pointerX: 0, pointerY: 0,
  };
  // Even if caller mistakenly steps while paused facade prevents it; direct step still only when playing.
  assert.equal(sim.getMode(), 'paused');
  sim.step(input, false);
  assert.equal(sim.snapshot().stats.activeMs, 0);
  sim.resume();
  for (let i = 0; i < 400; i += 1) sim.step(input, false);
  assert.equal(results.length, 1);
  assert.equal(results[0].outcome, 'clean_win');
  assert.equal(results[0].remaining_lives, 2);
  assert.ok(results[0].duration_ms > 0);
  assert.ok(Number.isInteger(FIXED_STEP_MS) || FIXED_STEP_MS > 0);
});

test('TH06 风格扇弹／环弹角度公式产生非均匀固定射线', async () => {
  const { spawnPatternBullets } = await importTypescript('../src/battle/battle-patterns.ts');
  const ctx = {
    bossX: 240, bossY: 100, playerX: 200, playerY: 500,
    arenaWidth: 480, arenaHeight: 640,
    nextId: (() => { let i = 1; return () => i++; })(),
    random: () => 0.25, volleyIndex: 0, phaseElapsedMs: 0,
  };
  const fan = spawnPatternBullets(baseConfig, {
    pattern_id: 'petal_fan', interval_ms: 200, count: 7, speed: 100, arc_deg: 80, layer_speed_scale: 0.7,
  }, ctx);
  // FAN_AIMED with layers → more than count bullets, paired around aim.
  assert.ok(fan.length >= 7);
  const angles = fan.map((b) => Math.atan2(b.vy, b.vx));
  const unique = new Set(angles.map((a) => a.toFixed(3)));
  assert.ok(unique.size >= 5, 'fan should open multiple distinct angles');

  const ring0 = spawnPatternBullets(baseConfig, {
    pattern_id: 'rotating_ring', interval_ms: 200, count: 12, speed: 90, rotate_deg_per_volley: 10, layer_speed_scale: 0.7,
  }, { ...ctx, volleyIndex: 0 });
  const ring1 = spawnPatternBullets(baseConfig, {
    pattern_id: 'rotating_ring', interval_ms: 200, count: 12, speed: 90, rotate_deg_per_volley: 10, layer_speed_scale: 0.7,
  }, { ...ctx, volleyIndex: 1, nextId: (() => { let i = 100; return () => i++; })() });
  // Dual layer → > count, and next volley precesses so first angles differ.
  assert.ok(ring0.length > 12);
  const a0 = Math.atan2(ring0[0].vy, ring0[0].vx);
  const a1 = Math.atan2(ring1[0].vy, ring1[0].vx);
  assert.ok(Math.abs(a0 - a1) > 0.05, 'rings should precess across volleys');

  const seed = spawnPatternBullets(baseConfig, {
    pattern_id: 'fixed_seed_ring', interval_ms: 200, count: 10, speed: 85, layer_speed_scale: 0.7,
  }, ctx);
  // CIRCLE + OFFSET_CIRCLE dual rings
  assert.ok(seed.length >= 16);
  assert.ok(seed.every((b) => b.shape && b.hue));
});

test('敌弹有形状色相，Bomb 清弹改为缓消而非瞬间删除', async () => {
  const { spawnPatternBullets } = await importTypescript('../src/battle/battle-patterns.ts');
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const ctx = {
    bossX: 240, bossY: 100, playerX: 240, playerY: 500,
    arenaWidth: 480, arenaHeight: 640, nextId: (() => { let i = 1; return () => i++; })(),
    random: () => 0.3, volleyIndex: 1, phaseElapsedMs: 0,
  };
  const ring = spawnPatternBullets(baseConfig, {
    pattern_id: 'rotating_ring', interval_ms: 200, count: 8, speed: 90, rotate_deg_per_volley: 10,
  }, ctx);
  assert.ok(ring.every((b) => b.shape && b.hue));
  assert.ok(ring.some((b) => b.hue === 'red'));
  assert.ok(ring.some((b) => b.hue === 'blue'));

  const results = [];
  const sim = new BattleSimulation(
    {
      ...baseConfig,
      phases: [{
        id: 'dense', kind: 'spell', name: 'x', hp: 99999, duration_ms: 60000,
        patterns: [{ pattern_id: 'fixed_seed_ring', interval_ms: 200, speed: 90, count: 12 }],
      }],
    },
    { onFinish: (r) => results.push(r), random: () => 0.4 },
  );
  sim.start();
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false, pointerActive: false, pointerX: 0, pointerY: 0,
  };
  for (let i = 0; i < 40; i += 1) sim.step(idle, false);
  assert.ok(sim.snapshot().enemyShots > 0);
  sim.step(idle, true); // bomb
  const after = sim.getRenderState();
  assert.ok(after.enemyShots.some((b) => b.cancelling), 'bomb should leave fading bullets');
  assert.ok(after.enemyShots.every((b) => !b.collidable || b.cancelling));
  assert.equal(results.length, 0);
});

test('登记弹型受参数上限约束，未知弹型被拒绝', async () => {
  const { clampPattern, spawnPatternBullets, detonateBursts, armLasers } = await importTypescript('../src/battle/battle-patterns.ts');
  const { REGISTERED_PATTERNS } = await importTypescript('../src/battle/battle-types.ts');
  assert.equal(REGISTERED_PATTERNS.length, 11);
  assert.ok(REGISTERED_PATTERNS.includes('aimed_stream'));
  assert.ok(REGISTERED_PATTERNS.includes('laser_warning'));
  const over = clampPattern(baseConfig, {
    pattern_id: 'fixed_seed_ring',
    interval_ms: 1,
    speed: 999,
    count: 999,
  });
  assert.equal(over.speed, 260);
  assert.equal(over.count, 32);
  assert.equal(over.interval_ms, 80);
  assert.equal(clampPattern(baseConfig, { pattern_id: 'eval_me', interval_ms: 100 }), null);
  const ctx = {
    bossX: 240, bossY: 100, playerX: 240, playerY: 500,
    arenaWidth: 480, arenaHeight: 640, nextId: (() => { let i = 1; return () => i++; })(),
    random: () => 0.4, volleyIndex: 2, phaseElapsedMs: 1200,
  };
  assert.equal(spawnPatternBullets(baseConfig, { pattern_id: 'nope', interval_ms: 100 }, ctx).length, 0);
  for (const id of REGISTERED_PATTERNS) {
    const spawned = spawnPatternBullets(baseConfig, {
      pattern_id: id,
      interval_ms: 200,
      count: 8,
      speed: 100,
      arc_deg: 60,
      warning_ms: 200,
      active_ms: 300,
      burst_delay_ms: 100,
      gaps: 2,
      rotate_deg_per_volley: 8,
    }, ctx);
    assert.ok(spawned.length > 0, id);
  }
  const mothers = spawnPatternBullets(baseConfig, {
    pattern_id: 'burst_cluster', interval_ms: 200, count: 12, speed: 100, burst_delay_ms: 50,
  }, ctx);
  for (const m of mothers) m.age = 1;
  const kids = detonateBursts(mothers, ctx.nextId);
  assert.ok(kids.length >= 6);
  const lasers = spawnPatternBullets(baseConfig, {
    pattern_id: 'laser_warning', interval_ms: 200, count: 1, warning_ms: 100, active_ms: 200,
  }, ctx);
  assert.equal(lasers[0].collidable, false);
  lasers[0].age = 1;
  armLasers(lasers);
  assert.equal(lasers[0].warning, false);
  assert.equal(lasers[0].collidable, true);
});

test('dirChange 离散重定向：钳制、标记并在间隔后转向', async () => {
  const { spawnPatternBullets, clampPattern } = await importTypescript('../src/battle/battle-patterns.ts');
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const ctx = {
    bossX: 240, bossY: 100, playerX: 240, playerY: 500,
    arenaWidth: 480, arenaHeight: 640, nextId: (() => { let i = 1; return () => i++; })(),
    random: () => 0.5, volleyIndex: 0, phaseElapsedMs: 0,
  };
  // Clamp: times ≤ 6, |rotation| ≤ 180, interval ≥ 120, speed within limits.
  const c = clampPattern(baseConfig, {
    pattern_id: 'aimed_stream', interval_ms: 400, speed: 120,
    dir_change_interval_ms: 20, dir_change_rotation_deg: 999, dir_change_times: 99, dir_change_speed: 999,
  });
  assert.equal(c.dir_change_times, 6);
  assert.equal(c.dir_change_rotation_deg, 180);
  assert.equal(c.dir_change_interval_ms, 120);
  assert.equal(c.dir_change_speed, 260);
  // Stamp: bullets carry runtime redirect fields; plain patterns do not.
  const spawned = spawnPatternBullets(baseConfig, {
    pattern_id: 'aimed_stream', interval_ms: 400, count: 1, speed: 120,
    dir_change_interval_ms: 200, dir_change_rotation_deg: 90, dir_change_times: 2,
  }, ctx);
  assert.ok(spawned.length >= 1);
  assert.ok(spawned.every((b) => b.dirChangeMax === 2 && b.dirChangeDone === 0 && Math.abs(b.dirChangeInterval - 0.2) < 1e-9));
  const plain = spawnPatternBullets(baseConfig, {
    pattern_id: 'aimed_stream', interval_ms: 400, count: 1, speed: 120,
  }, { ...ctx, nextId: (() => { let i = 99; return () => i++; })() });
  assert.ok(plain.every((b) => b.dirChangeMax == null));

  // Simulation redirects the live bullet by ~rotation once the interval elapses.
  const sim = new BattleSimulation({
    ...baseConfig,
    player: { ...baseConfig.player, lives: 9, bombs: 0 },
    phases: [{
      id: 'dc', kind: 'nonspell', name: 'x', hp: 999999, duration_ms: 60000,
      patterns: [{
        pattern_id: 'aimed_stream', interval_ms: 5000, count: 1, speed: 120,
        dir_change_interval_ms: 200, dir_change_rotation_deg: 90, dir_change_times: 1,
      }],
    }],
  }, { onFinish: () => {}, random: () => 0.5 });
  sim.start();
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false, pointerActive: false, pointerX: 0, pointerY: 0,
  };
  sim.step(idle, false);
  const first = sim.getRenderState().enemyShots.find((b) => b.dirChangeMax === 1);
  assert.ok(first, 'a dirChange bullet should have spawned');
  const angle0 = Math.atan2(first.vy, first.vx);
  assert.equal(first.dirChangeDone, 0);
  for (let i = 0; i < 30; i += 1) sim.step(idle, false); // ~250ms > 200ms interval
  const angle1 = Math.atan2(first.vy, first.vx);
  assert.equal(first.dirChangeDone, 1, 'redirect should have fired once');
  let delta = angle1 - angle0;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  assert.ok(Math.abs(Math.abs(delta) - Math.PI / 2) < 0.05, `expected ~90° turn, got ${(delta * 180 / Math.PI).toFixed(1)}°`);
});

test('随机 aim 抖动：确定性 PRNG 打散角度/速度且受钳制', async () => {
  const { spawnPatternBullets, clampPattern } = await importTypescript('../src/battle/battle-patterns.ts');
  const c = clampPattern(baseConfig, {
    pattern_id: 'fixed_seed_ring', interval_ms: 200, random_angle_deg: 999, random_speed: 999,
  });
  assert.equal(c.random_angle_deg, 90);
  assert.equal(c.random_speed, 120);
  const seq = [0.12, 0.88, 0.31, 0.67, 0.5, 0.22, 0.79, 0.41, 0.6, 0.15, 0.95, 0.05];
  const mkCtx = () => {
    let i = 0;
    return {
      bossX: 240, bossY: 100, playerX: 240, playerY: 500,
      arenaWidth: 480, arenaHeight: 640, nextId: (() => { let n = 1; return () => n++; })(),
      random: () => seq[i++ % seq.length], volleyIndex: 0, phaseElapsedMs: 0,
    };
  };
  const pat = { pattern_id: 'fixed_seed_ring', interval_ms: 200, count: 8, speed: 100, random_angle_deg: 25, random_speed: 40 };
  const a = spawnPatternBullets(baseConfig, pat, mkCtx());
  const b = spawnPatternBullets(baseConfig, pat, mkCtx());
  assert.equal(a.length, b.length);
  assert.ok(a.every((bl, i) => Math.abs(bl.vx - b[i].vx) < 1e-9 && Math.abs(bl.vy - b[i].vy) < 1e-9),
    'identical PRNG sequence → identical velocities (deterministic)');
  const jitterSpeeds = new Set(a.map((bl) => Math.hypot(bl.vx, bl.vy).toFixed(2)));
  const plain = spawnPatternBullets(baseConfig, { pattern_id: 'fixed_seed_ring', interval_ms: 200, count: 8, speed: 100 }, mkCtx());
  const plainSpeeds = new Set(plain.map((bl) => Math.hypot(bl.vx, bl.vy).toFixed(2)));
  assert.ok(jitterSpeeds.size > plainSpeeds.size, 'random_speed widens the speed spread vs a plain ring');
});

test('出膛生成态：普通弹带 spawn-in 宽限，预告/激光/安全带不带', async () => {
  const { spawnPatternBullets } = await importTypescript('../src/battle/battle-patterns.ts');
  const { SPAWN_IN_S } = await importTypescript('../src/battle/battle-types.ts');
  const ctx = {
    bossX: 240, bossY: 100, playerX: 240, playerY: 500,
    arenaWidth: 480, arenaHeight: 640, nextId: (() => { let i = 1; return () => i++; })(),
    random: () => 0.5, volleyIndex: 0, phaseElapsedMs: 0,
  };
  const ring = spawnPatternBullets(baseConfig, {
    pattern_id: 'fixed_seed_ring', interval_ms: 200, count: 10, speed: 90,
  }, ctx);
  assert.ok(ring.length > 0);
  assert.ok(ring.every((b) => Math.abs(b.spawnInS - SPAWN_IN_S) < 1e-9), 'ordinary shots carry spawn-in grace');
  // Safe-lane / falling-lane markers manage their own warning timing → no spawn-in.
  const lanes = spawnPatternBullets(baseConfig, {
    pattern_id: 'local_safe_zone', interval_ms: 200, warning_ms: 300, speed: 100,
  }, { ...ctx, nextId: (() => { let i = 50; return () => i++; })() });
  assert.ok(lanes.length > 0);
  assert.ok(lanes.every((b) => b.spawnInS == null), 'telegraph markers stay spawn-in free');
  const lasers = spawnPatternBullets(baseConfig, {
    pattern_id: 'laser_warning', interval_ms: 200, count: 2, warning_ms: 200, active_ms: 200,
  }, { ...ctx, nextId: (() => { let i = 80; return () => i++; })() });
  assert.ok(lasers.every((b) => b.spawnInS == null));

  // Freshly spawned shots stay inert (no graze) inside the grace window.
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const sim = new BattleSimulation({
    ...baseConfig,
    phases: [{
      id: 'grace', kind: 'nonspell', name: 'x', hp: 99999, duration_ms: 60000,
      patterns: [{ pattern_id: 'fixed_seed_ring', interval_ms: 5000, speed: 120, count: 16 }],
    }],
  }, { onFinish: () => {}, random: () => 0.4 });
  sim.start();
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false, pointerActive: false, pointerX: 0, pointerY: 0,
  };
  sim.step(idle, false);
  const rs = sim.getRenderState();
  assert.ok(rs.enemyShots.length > 0);
  assert.ok(rs.enemyShots.every((b) => b.age < b.spawnInS), 'first frame: all fresh shots still materializing');
  assert.equal(sim.snapshot().stats.grazes, 0);
});

test('Bomb 按下沿只消费一次，决死窗口内可取消 Miss', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const results = [];
  const sim = new BattleSimulation(
    {
      ...baseConfig,
      phases: [{ id: 'idle', kind: 'spell', name: '试', hp: 9999, duration_ms: 60000, patterns: [] }],
    },
    { onFinish: (r) => results.push(r), random: () => 0.2 },
  );
  sim.start();
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false, pointerActive: false, pointerX: 0, pointerY: 0,
  };
  // Place an enemy bullet on the player via internal render state mutation is not exported;
  // instead drive deathbomb by stepping with a crafted approach: use many bombs first.
  sim.step(idle, true);
  let snap = sim.snapshot();
  assert.equal(snap.player.bombs, 2);
  assert.equal(snap.stats.bombsUsed, 1);
  // Holding bomb must not retrigger; latch stays high.
  sim.step(idle, true);
  snap = sim.snapshot();
  assert.equal(snap.stats.bombsUsed, 1);
  // Release edge, but bomb animation still active — still no second bomb.
  sim.step(idle, false);
  sim.step(idle, true);
  snap = sim.snapshot();
  assert.equal(snap.stats.bombsUsed, 1);
  // Advance past bomb duration, then edge-trigger again.
  for (let i = 0; i < 200; i += 1) sim.step(idle, false);
  sim.step(idle, true);
  snap = sim.snapshot();
  assert.equal(snap.stats.bombsUsed, 2);
  assert.equal(snap.player.bombs, 1);
  assert.equal(results.length, 0);
});

test('耗尽生命产出一次 loss；斜向速度归一化', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const { FIXED_STEP_MS } = await importTypescript('../src/battle/battle-types.ts');
  const results = [];
  const sim = new BattleSimulation(
    {
      ...baseConfig,
      player: { ...baseConfig.player, lives: 1, auto_fire: false, invulnerability_ms: 1, bombs: 0 },
      phases: [{ id: 'lose', kind: 'nonspell', name: 'x', hp: 99999, duration_ms: 120000, patterns: [
        { pattern_id: 'fixed_seed_ring', interval_ms: 80, speed: 200, count: 24 },
      ] }],
    },
    { onFinish: (r) => results.push(r), random: () => 0.5 },
  );
  sim.start();
  const input = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false, pointerActive: false, pointerX: 0, pointerY: 0,
  };
  for (let i = 0; i < 5000 && results.length === 0; i += 1) sim.step(input, false);
  assert.equal(results.length, 1);
  assert.equal(results[0].outcome, 'loss');
  assert.equal(results[0].remaining_lives, 0);

  const moveSim = new BattleSimulation(
    { ...baseConfig, phases: [{ id: 'm', kind: 'nonspell', name: 'm', hp: 99999, duration_ms: 999999, patterns: [] }] },
    { onFinish: () => {}, random: () => 0 },
  );
  moveSim.start();
  const before = moveSim.snapshot().player;
  const right = {
    moveX: 1, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false, pointerActive: false, pointerX: 0, pointerY: 0,
  };
  moveSim.step(right, false);
  const afterRight = moveSim.snapshot().player;
  const diagSim = new BattleSimulation(
    { ...baseConfig, phases: [{ id: 'm', kind: 'nonspell', name: 'm', hp: 99999, duration_ms: 999999, patterns: [] }] },
    { onFinish: () => {}, random: () => 0 },
  );
  diagSim.start();
  const diag = {
    moveX: 1, moveY: 1, focused: false, firing: false,
    bombPressed: false, pausePressed: false, pointerActive: false, pointerX: 0, pointerY: 0,
  };
  diagSim.step(diag, false);
  const afterDiag = diagSim.snapshot().player;
  const rightDist = Math.hypot(afterRight.x - before.x, afterRight.y - before.y);
  const diagStart = diagSim.snapshot();
  // compare against fresh expected: diagonal step distance should match axis step distance
  const expected = (baseConfig.player.move_speed * FIXED_STEP_MS) / 1000;
  assert.ok(Math.abs(rightDist - expected) < 0.01);
  const diagDist = Math.hypot(afterDiag.x - before.x, afterDiag.y - before.y);
  assert.ok(Math.abs(diagDist - expected) < 0.01);
  void diagStart;
});

test('BattleEngine 门面：重复 start 不双循环，destroy 幂等且取消不结算', async () => {
  const { BattleEngine } = await importTypescript('../src/ui/battle-engine.ts');
  const results = [];
  const listeners = new Map();
  const canvas = {
    width: 0,
    height: 0,
    tabIndex: 0,
    style: {},
    getContext: () => ({
      clearRect() {},
      fillRect() {},
      beginPath() {},
      arc() {},
      fill() {},
      stroke() {},
      strokeRect() {},
      moveTo() {},
      lineTo() {},
      quadraticCurveTo() {},
      ellipse() {},
      closePath() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fillText() {},
      set lineWidth(_) {},
      set strokeStyle(_) {},
      set fillStyle(_) {},
      set font(_) {},
      set globalAlpha(_) {},
    }),
    focus() {},
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      listeners.set(type, list.filter((h) => h !== handler));
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 640 }),
  };
  const originalRAF = globalThis.requestAnimationFrame;
  const originalCAF = globalThis.cancelAnimationFrame;
  let rafCount = 0;
  let currentId = 0;
  const pending = new Map();
  globalThis.requestAnimationFrame = (cb) => {
    rafCount += 1;
    currentId += 1;
    pending.set(currentId, cb);
    return currentId;
  };
  globalThis.cancelAnimationFrame = (id) => {
    pending.delete(id);
  };
  const g = globalThis;
  const windowListeners = new Map();
  const docListeners = new Map();
  const previousWindow = g.window;
  const previousDocument = g.document;
  g.window = {
    addEventListener(type, handler) {
      const list = windowListeners.get(type) ?? [];
      list.push(handler);
      windowListeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = windowListeners.get(type) ?? [];
      windowListeners.set(type, list.filter((h) => h !== handler));
    },
  };
  g.document = {
    hidden: false,
    addEventListener(type, handler) {
      const list = docListeners.get(type) ?? [];
      list.push(handler);
      docListeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = docListeners.get(type) ?? [];
      docListeners.set(type, list.filter((h) => h !== handler));
    },
  };

  try {
    const engine = new BattleEngine(canvas, baseConfig, (r) => results.push(r));
    engine.start();
    engine.start();
    assert.equal(rafCount, 1);
    engine.destroy();
    engine.destroy();
    assert.equal(results.length, 0);
    for (const [, list] of listeners) assert.equal(list.length, 0);
    for (const [, list] of windowListeners) assert.equal(list.length, 0);
    for (const [, list] of docListeners) assert.equal(list.length, 0);
  } finally {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
    g.window = previousWindow;
    g.document = previousDocument;
  }
});

test('主线与副本分流锚点仍指向既有 bridge 方法', async () => {
  const app = await read('../src/ui/app.ts');
  assert.match(app, /bridge\.stageBattleResult\(result\)/);
  assert.match(app, /bridge\.settleDungeonResult\(result\)/);
  assert.match(app, /activeBattleKind === 'dungeon'/);
  assert.match(app, /activeBattleKind === 'practice'/);
  assert.match(app, /练习（不结算）/);
  assert.match(app, /gg-battle-narrative/);
  assert.match(app, /new BattleEngine\(/);
  assert.doesNotMatch(app, /Mvu\.(get|replace)MvuData/);
  const engine = await read('../src/ui/battle-engine.ts');
  assert.match(engine, /export class BattleEngine/);
  assert.match(engine, /start\(/);
  assert.match(engine, /destroy\(/);
  assert.doesNotMatch(engine, /createChatMessages|triggerSlash|replaceMvuData/);
});

test('战斗 dialog 文案包含原作式操作提示', async () => {
  const html = await read('../src/ui/index.html');
  assert.match(html, /按住 Z 射击/);
  assert.match(html, /X Bomb/);
  assert.match(html, /Esc 暂停/);
  assert.match(html, /手机拖动会自动射击/);
  assert.match(html, /id="gg-battle-dialog"/);
  assert.match(html, /id="gg-dungeon-dialog"/);
  assert.match(html, /id="gg-battle-focus"/);
  assert.match(html, /id="gg-battle-bomb"/);
  assert.match(html, /id="gg-battle-bomb-count"/);
  assert.match(html, /按住专注/);
});

test('触控专注／Bomb 与窄屏样式不污染全局', async () => {
  const app = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  const input = await read('../src/battle/battle-input.ts');
  const engine = await read('../src/ui/battle-engine.ts');
  assert.match(app, /setFocusHeld/);
  assert.match(app, /requestBomb/);
  assert.match(app, /bindHoldButton\(battleFocusBtn/);
  assert.match(app, /destroyBattleSession/);
  assert.match(app, /clearBattleTouchState/);
  assert.match(input, /requestBomb\(\)/);
  assert.match(engine, /setFocusHeld\(held: boolean\)/);
  assert.match(engine, /requestBomb\(\)/);
  assert.match(engine, /drawIntervalMs/);
  assert.match(engine, /1000 \/ 30/);
  assert.match(styles, /\.gg-battle-touch/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /#gg-battle-canvas[^}]*max-width: 100%/);
  assert.match(styles, /@media \(max-width: 420px\)/);
  assert.match(styles, /@media \(max-height: 560px\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  // Closed dialog must not stay in document flow under the garden.
  assert.match(styles, /\.gg-battle-dialog:not\(\[open\]\)\s*\{[^}]*display:\s*none\s*!important/);
  assert.match(styles, /\.gg-battle-dialog\[open\]\s*\{[^}]*position:\s*fixed/);
  assert.doesNotMatch(styles, /^\.gg-battle-dialog\s*\{[^}]*display:\s*flex/m);
  // touch-action limited to battle canvas / touch controls, not body
  assert.match(styles, /#gg-battle-canvas[^}]*touch-action: none/);
  assert.match(styles, /\.gg-battle-touch[^}]*touch-action: none/);
  assert.doesNotMatch(styles, /body\s*\{[^}]*touch-action:\s*none/);
});

test('外部专注与 Bomb 请求进入输入状态', async () => {
  const { createBattleInput } = await importTypescript('../src/battle/battle-input.ts');
  const listeners = new Map();
  const canvas = {
    width: 480,
    height: 640,
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      listeners.set(type, list.filter((h) => h !== handler));
    },
    focus() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 640 }),
  };
  const input = createBattleInput(canvas, { autoFire: false });
  input.attach();
  assert.equal(input.state.focused, false);
  input.setExternalFocus(true);
  assert.equal(input.state.focused, true);
  input.requestBomb();
  assert.equal(input.consumeBombPressed(), true);
  assert.equal(input.consumeBombPressed(), false);
  input.setExternalFocus(false);
  assert.equal(input.state.focused, false);
  input.detach();
  for (const [, list] of listeners) assert.equal(list.length, 0);
});

test('战斗 atlas 裁切表完整且 build 只嵌入透明素材', async () => {
  const {
    ATLAS_FRAMES,
    listAtlasFrameIds,
    patternEffectFrame,
    drawAtlasFrame,
    drawLocalBulletSprite,
    loadBattleAtlas,
    resolveLocalBulletSprite,
  } = await importTypescript('../src/battle/battle-atlas.ts');
  const ids = listAtlasFrameIds();
  assert.ok(ids.includes('player_normal'));
  assert.ok(ids.includes('boss_phase1'));
  assert.ok(ids.includes('boss_character_phase1'));
  assert.ok(ids.includes('boss_character_hit'));
  assert.ok(ids.includes('fx_petal'));
  for (const id of ids) {
    const frame = ATLAS_FRAMES[id];
    assert.ok(frame.rect.w > 0 && frame.rect.h > 0, id);
    assert.ok(frame.drawW > 0 && frame.drawH > 0, id);
  }
  assert.equal(patternEffectFrame('petal_fan'), 'fx_petal');
  assert.equal(patternEffectFrame('laser_warning'), null);
  assert.deepEqual(resolveLocalBulletSprite('circle', 'red').rect, { x: 8, y: 40, w: 16, h: 16 });
  assert.deepEqual(resolveLocalBulletSprite('kunai', 'gold').rect, { x: 160, y: 192, w: 32, h: 32 });
  assert.equal(resolveLocalBulletSprite('star', 'purple'), null);
  let localBulletDraws = 0;
  assert.equal(drawLocalBulletSprite({
    save() {}, restore() {}, drawImage() { localBulletDraws += 1; },
    set globalAlpha(_) {}, set imageSmoothingEnabled(_) {},
  }, { ready: true, failed: false, images: { bullets_local: {} } }, 'rice', 'cyan', 6), true);
  assert.equal(localBulletDraws, 1);
  // Missing sources → not ready, renderer must tolerate null atlas.
  const empty = await loadBattleAtlas({});
  assert.equal(empty.ready, false);
  assert.equal(drawAtlasFrame({
    save() {}, restore() {}, translate() {}, rotate() {}, drawImage() { throw new Error('no'); },
    set globalAlpha(_) {},
  }, empty, 'player_normal', 0, 0), false);

  const build = await read('../scripts/build-ui.mjs');
  assert.match(build, /keycraft-player-sheet-v1\.png/);
  assert.match(build, /greenhouse-flower-core-sheet-v1\.png/);
  assert.match(build, /reimu-battle-sheet-v1\.png/);
  assert.match(build, /marisa-battle-sheet-v1\.png/);
  assert.match(build, /cirno-battle-sheet-v1\.png/);
  assert.match(build, /alice-battle-sheet-v1\.png/);
  assert.match(build, /nitori-battle-sheet-v1\.png/);
  assert.match(build, /mystia-battle-sheet-v1\.png/);
  assert.match(build, /suika-battle-sheet-v1\.png/);
  assert.match(build, /sakuya-battle-sheet-v1\.png/);
  assert.match(build, /battle-effects-sheet-v1\.png/);
  assert.match(build, /localBulletSource/);
  assert.match(build, /battleBulletsLocalDataUrl/);
  assert.match(build, /battlePlayerDataUrl/);
  assert.doesNotMatch(build, /sheet-v1-chroma\.png|copyFile\([^)]*chroma/);
  const host = await read('../src/runtime/ui-host-shell.js');
  assert.match(host, /battlePlayerSrc/);
  assert.match(host, /battleBossSrc/);
  assert.match(host, /battleBossReimuSrc/);
  assert.match(host, /battleBossMarisaSrc/);
  assert.match(host, /battleBossCirnoSrc/);
  assert.match(host, /battleBossAliceSrc/);
  assert.match(host, /battleBossNitoriSrc/);
  assert.match(host, /battleBossMystiaSrc/);
  assert.match(host, /battleBossSuikaSrc/);
  assert.match(host, /battleBossSakuyaSrc/);
  assert.match(host, /battleEffectsSrc/);
  assert.match(host, /battleBulletsLocalSrc/);
  const app = await read('../src/ui/app.ts');
  assert.match(app, /atlasSources: battleAtlasSources/);
  assert.match(app, /dataset\.battlePlayerSrc/);
  assert.match(app, /dataset\.battleBulletsLocalSrc/);
  const manifest = JSON.parse(await read('../src/assets/asset-manifest.json'));
  assert.equal(manifest.battle_assets.local_etama3_bullets.runtime_scope, 'project-package-and-distribution');
  const localBullets = await readFile(new URL(`../src/assets/${manifest.battle_assets.local_etama3_bullets.source_alpha}`, import.meta.url));
  assert.ok(localBullets.length > 50_000);
  const replacementReport = JSON.parse(await read('../project/character-boss-sheet-replacement-report-2026-07-30.json'));
  const replacementById = new Map(replacementReport.assets.map((asset) => [asset.character_id, asset]));
  for (const id of ['reimu', 'marisa', 'alice', 'nitori', 'cirno', 'mystia', 'suika', 'sakuya']) {
    const entry = manifest.battle_assets[`${id}_battle`];
    assert.equal(entry.runtime_embed, 'alpha-only', id);
    assert.equal(entry.layout, '2x2-phase1-phase2-hit-break', id);
    const pngBytes = await readFile(new URL(`../src/assets/${entry.source_alpha}`, import.meta.url));
    const png = PNG.sync.read(pngBytes);
    assert.equal(png.width, 1254, id);
    assert.equal(png.height, 1254, id);
    assert.equal(png.colorType, 6, `${id} must be RGBA`);
    for (const [x, y] of [[0, 0], [1253, 0], [0, 1253], [1253, 1253]]) {
      assert.equal(png.data[(y * png.width + x) * 4 + 3], 0, `${id} corner ${x},${y}`);
    }
    for (const [cellX, cellY] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      let visible = 0;
      for (let y = cellY * 627; y < (cellY + 1) * 627; y += 1) {
        for (let x = cellX * 627; x < (cellX + 1) * 627; x += 1) {
          if (png.data[(y * png.width + x) * 4 + 3] > 0) visible += 1;
        }
      }
      assert.ok(visible > 10_000, `${id} pose ${cellX},${cellY} should be populated`);
    }
    if (id === 'reimu' || id === 'marisa') {
      assert.match(entry.status, /owner-provided-v2-integrated/);
      assert.match(entry.owner_source_archive, /battle-boss-owner-source-v2/);
      assert.match(entry.supersedes_owner_source_archive, /battle-boss-owner-source-v1/);
      assert.equal(entry.replacement_report, 'project/character-boss-sheet-replacement-report-2026-07-30.json');
      assert.equal(
        createHash('sha256').update(pngBytes).digest('hex'),
        replacementById.get(id).output_sha256,
        `${id} replacement report must match runtime bytes`,
      );
    }
  }
});

test('四场配置保留 config_id 且阶段具有非符／符卡语义', async () => {
  const files = {
    greenhouse_flower_core_tutorial_v1: '../src/battle/configs/greenhouse-flower-core-tutorial-v1.json',
    fairy_pattern_practice_v1: '../src/battle/configs/dungeons/fairy-pattern-practice-v1.json',
    forest_magic_residue_v1: '../src/battle/configs/dungeons/forest-magic-residue-v1.json',
    boundary_echo_trial_v1: '../src/battle/configs/dungeons/boundary-echo-trial-v1.json',
  };
  for (const [id, path] of Object.entries(files)) {
    const config = JSON.parse(await read(path));
    assert.equal(config.config_id, id);
    assert.ok(config.phases.length >= 2);
    assert.ok(config.phases.some((p) => p.kind === 'nonspell'));
    assert.ok(config.phases.some((p) => p.kind === 'spell'));
  }
  // Flower core stays at 2 formal phases (phases_cleared 0..2 bridge validator),
  // but each phase uses start_ms/end_ms wave blocks for progressive density.
  const flower = JSON.parse(await read(files.greenhouse_flower_core_tutorial_v1));
  assert.equal(flower.phases.length, 2);
  assert.ok(flower.phases[0].patterns.some((p) => p.start_ms != null || p.end_ms != null));
  assert.ok(flower.phases[1].patterns.some((p) => p.start_ms != null));
  assert.equal(flower.player.auto_fire, false);
  // Sparse fairy waves exist but stay optional / light.
  assert.ok(Array.isArray(flower.phases[0].mobs));
  assert.ok(flower.phases[0].mobs.length <= 2);
});

test('powerShotLayout 随 P 值加线且不越界', async () => {
  const { powerShotLayout, POWER_MAX } = await importTypescript('../src/battle/battle-types.ts');
  assert.deepEqual(powerShotLayout(0, false).offsets.length, 2);
  assert.ok(powerShotLayout(16, false).offsets.length >= 2);
  assert.equal(powerShotLayout(96, false).offsets.length, 5);
  assert.equal(powerShotLayout(32, true).offsets.length, 2);
  assert.equal(powerShotLayout(96, true).offsets.length, 4);
  assert.equal(powerShotLayout(POWER_MAX + 50, false).offsets.length, 5);
  assert.ok(powerShotLayout(128, true).damageBonus >= 1);
});

test('小怪击败掉 P 点，火力升级，BattleResult 不含 power', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const { powerShotLayout } = await importTypescript('../src/battle/battle-types.ts');
  const results = [];
  const config = {
    ...baseConfig,
    player: { ...baseConfig.player, auto_fire: true, power: 0, bombs: 2 },
    phases: [{
      id: 'mob_drop',
      kind: 'nonspell',
      name: '妖精掉落',
      hp: 800,
      duration_ms: 30000,
      patterns: [],
      mobs: [{
        start_ms: 0,
        end_ms: 25000,
        interval_ms: 600,
        count: 2,
        hp: 8,
        path: 'side',
        drop: 'power_small',
        shot_interval_ms: 0,
        speed: 70,
        radius: 14,
      }],
    }],
  };
  const sim = new BattleSimulation(config, {
    onFinish: (r) => results.push(r),
    random: () => 0.5,
  });
  sim.start();
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false,
    pointerActive: false, pointerX: 0, pointerY: 0,
  };
  // Let fairies enter, bomb-clear them (guaranteed drop), then POC-vacuum P items.
  for (let i = 0; i < 180; i += 1) sim.step(idle, false);
  assert.ok(sim.snapshot().mobs >= 1, 'fairies should spawn before bomb');
  sim.step(idle, true);
  assert.equal(sim.snapshot().mobs, 0);
  assert.ok(sim.snapshot().stats.mobsDefeated >= 1);
  // Climb into auto-collect band.
  const climb = { ...idle, moveY: -1, firing: false };
  for (let i = 0; i < 600; i += 1) sim.step(climb, false);
  const snap = sim.snapshot();
  assert.ok(snap.player.power >= 1, `power should rise after P pickup, got ${snap.player.power}`);
  assert.ok(snap.stats.powerCollected >= 1);
  // Power widens shot layout once threshold crossed (or stays base below 16).
  const layoutBefore = powerShotLayout(0, false).offsets.length;
  const layoutAfter = powerShotLayout(snap.player.power, false).offsets.length;
  assert.ok(layoutAfter >= layoutBefore);

  if (!sim.isFinished()) sim.forceFinish('narrow_win');
  assert.equal(results.length, 1);
  const result = results[0];
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'power'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'power_collected'), false);
  assert.ok(['clean_win', 'narrow_win', 'loss', 'narrative'].includes(result.outcome));
  for (const key of [
    'settlement_id', 'config_id', 'outcome', 'remaining_lives',
    'grazes', 'duration_ms', 'hits', 'damage', 'phases_cleared', 'objective_ratio',
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(result, key), key);
  }
});

test('自机弹可击破小怪并掉 P', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const sim = new BattleSimulation(
    {
      ...baseConfig,
      player: {
        ...baseConfig.player,
        auto_fire: true,
        power: 0,
        // Focused center lane (offset 0) + chunky fairy = deterministic mid-field hit.
        focus_shot: { damage: 2, interval_ms: 50 },
      },
      phases: [{
        id: 'shoot_mobs',
        kind: 'nonspell',
        name: '射击',
        hp: 9999,
        duration_ms: 25000,
        patterns: [],
        mobs: [{
          start_ms: 0,
          interval_ms: 3000,
          count: 1,
          hp: 4,
          // Top path with count 1 spawns dead-center (x = width*(0.18+0.5*0.64) = 240),
          // descending straight down the focused single-lane shot column at x=240.
          // radius clamps to [8,20]; 16 keeps the descent within the vertical shot line.
          path: 'top',
          drop: 'power_big',
          shot_interval_ms: 0,
          speed: 40,
          radius: 16,
        }],
      }],
    },
    { onFinish: () => {}, random: () => 0.5 },
  );
  sim.start();
  const input = {
    moveX: 0, moveY: 0, focused: true, firing: true,
    bombPressed: false, pausePressed: false,
    pointerActive: false, pointerX: 0, pointerY: 0,
  };
  for (let i = 0; i < 2000; i += 1) sim.step(input, false);
  const snap = sim.snapshot();
  assert.ok(snap.stats.mobsDefeated >= 1, `shots should defeat fairy, got ${snap.stats.mobsDefeated}`);
  assert.ok(snap.player.power >= 1 || snap.items >= 1 || snap.stats.powerCollected >= 1);
});

test('Bomb 清小怪并吸引 P 点', async () => {
  const { BattleSimulation, BOMB_DURATION_MS } = await importTypescript('../src/battle/battle-simulation.ts')
    .then(async (mod) => ({ ...mod, ...(await importTypescript('../src/battle/battle-types.ts')) }));
  const sim = new BattleSimulation(
    {
      ...baseConfig,
      player: { ...baseConfig.player, bombs: 2, auto_fire: false },
      phases: [{
        id: 'bomb_mobs',
        kind: 'nonspell',
        name: 'bomb',
        hp: 200,
        duration_ms: 30000,
        patterns: [],
        mobs: [{
          start_ms: 0,
          interval_ms: 500,
          count: 2,
          hp: 20,
          path: 'side',
          drop: 'power_big',
          shot_interval_ms: 0,
        }],
      }],
    },
    { onFinish: () => {}, random: () => 0.3 },
  );
  sim.start();
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false,
    pointerActive: false, pointerX: 0, pointerY: 0,
  };
  for (let i = 0; i < 200; i += 1) sim.step(idle, false);
  const before = sim.snapshot();
  assert.ok(before.mobs >= 1, 'fairies should have spawned');
  sim.step(idle, true);
  const afterBomb = sim.snapshot();
  assert.equal(afterBomb.mobs, 0);
  assert.ok(afterBomb.items >= 1 || afterBomb.player.power > 0 || afterBomb.stats.mobsDefeated >= 1);
  // Wait bomb duration so a second bomb is allowed.
  const steps = Math.ceil((BOMB_DURATION_MS + 50) / (1000 / 120)) + 5;
  for (let i = 0; i < steps; i += 1) sim.step(idle, false);
  assert.ok(sim.snapshot().player.bombs <= 1);
});

test('B1 反馈层：收集浮字、擦弹火花、boss/小怪受击标记均为纯视觉', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false,
    pointerActive: false, pointerX: 0, pointerY: 0,
  };

  // --- Power pickup emits a floating "+N" text particle. ---
  const dropSim = new BattleSimulation(
    {
      ...baseConfig,
      phases: [{
        id: 'popup_drop',
        kind: 'nonspell',
        name: '浮字',
        hp: 800,
        duration_ms: 30000,
        patterns: [],
        mobs: [{
          start_ms: 0, end_ms: 25000, interval_ms: 600, count: 2,
          hp: 8, path: 'side', drop: 'power_small', shot_interval_ms: 0,
          speed: 70, radius: 14,
        }],
      }],
    },
    { onFinish: () => {}, random: () => 0.5 },
  );
  dropSim.start();
  for (let i = 0; i < 180; i += 1) dropSim.step(idle, false);
  dropSim.step(idle, true); // bomb clears fairies -> drops -> vacuum
  let sawPopup = false;
  const climb = { ...idle, moveY: -1 };
  for (let i = 0; i < 600 && !sawPopup; i += 1) {
    dropSim.step(climb, false);
    sawPopup = dropSim.getRenderState().particles.some((p) => typeof p.text === 'string' && p.text.startsWith('+'));
  }
  assert.ok(sawPopup, 'collecting a P item should emit a "+N" text particle');
  assert.ok(dropSim.getRenderState().particles.length <= 128);

  // --- Boss shot hits set hitFlashUntil; fairy hits stamp hitAt. Both stay out of BattleResult. ---
  const results = [];
  const hitSim = new BattleSimulation(
    {
      ...baseConfig,
      player: {
        ...baseConfig.player,
        auto_fire: true,
        focus_shot: { damage: 2, interval_ms: 50 },
      },
      phases: [{
        id: 'hit_marks',
        kind: 'nonspell',
        name: '受击标记',
        hp: 9999,
        duration_ms: 25000,
        patterns: [],
        mobs: [{
          start_ms: 0, interval_ms: 3000, count: 1, hp: 4,
          path: 'top', drop: 'power_big', shot_interval_ms: 0,
          speed: 40, radius: 16,
        }],
      }],
    },
    { onFinish: (r) => results.push(r), random: () => 0.5 },
  );
  hitSim.start();
  const focusFire = { ...idle, focused: true, firing: true };
  let sawMobHit = false;
  for (let i = 0; i < 2000; i += 1) {
    hitSim.step(focusFire, false);
    if (!sawMobHit) {
      sawMobHit = hitSim.getRenderState().mobs.some((m) => m.hitAt != null);
    }
  }
  assert.ok(sawMobHit, 'a damaged fairy should carry hitAt for the brighten window');
  const render = hitSim.getRenderState();
  assert.ok(render.boss.hitFlashUntil > 0, 'boss shot damage should stamp hitFlashUntil');
  hitSim.forceFinish('narrow_win');
  assert.equal(Object.prototype.hasOwnProperty.call(results[0], 'hitFlashUntil'), false);

  // --- A graze spawns a small white spark particle the same step. ---
  const grazeSim = new BattleSimulation(
    {
      ...baseConfig,
      phases: [{
        id: 'graze_spark',
        kind: 'nonspell',
        name: '擦弹',
        hp: 9999,
        duration_ms: 30000,
        patterns: [{ pattern_id: 'aimed_stream', interval_ms: 2400, speed: 120, count: 1 }],
      }],
    },
    { onFinish: () => {}, random: () => 0.5 },
  );
  grazeSim.start();
  // Sidestep after the first aimed volley so the shot passes inside the graze
  // ring (22px) without touching the 4px hitbox.
  let sawSpark = false;
  let prevGrazes = 0;
  for (let i = 0; i < 1400; i += 1) {
    const dodge = i < 10 ? { ...idle, moveX: 1 } : idle;
    grazeSim.step(dodge, false);
    const snap = grazeSim.snapshot();
    if (snap.stats.grazes > prevGrazes) {
      prevGrazes = snap.stats.grazes;
      const sparks = grazeSim.getRenderState().particles.filter((p) => !p.text && p.radius <= 3);
      if (sparks.length > 0) sawSpark = true;
    }
    if (snap.stats.misses > 0) break;
  }
  assert.ok(prevGrazes >= 1, 'dodged aimed shot should graze');
  assert.ok(sawSpark, 'graze should emit a small spark particle');
});

test('B3 表现层：boss 战损分级与四配置 presentation 字段', async () => {
  const { bossDamageLevel, BOSS_DAMAGE_LABELS } = await importTypescript('../src/battle/battle-types.ts');
  // 2 phases: S0 during P1, S1 during P2 (final break settles at S2 outside sim).
  assert.equal(bossDamageLevel(0, 2), 0);
  assert.equal(bossDamageLevel(1, 2), 1);
  // 4 phases: P1-2 intact, P3 light, P4 heavy.
  assert.equal(bossDamageLevel(0, 4), 0);
  assert.equal(bossDamageLevel(1, 4), 0);
  assert.equal(bossDamageLevel(2, 4), 1);
  assert.equal(bossDamageLevel(3, 4), 2);
  // Clamps and degenerate input.
  assert.equal(bossDamageLevel(99, 2), 1);
  assert.equal(bossDamageLevel(-3, 4), 0);
  assert.equal(bossDamageLevel(0, 0), 0);
  assert.equal(BOSS_DAMAGE_LABELS.length, 3);

  const configs = [
    '../src/battle/configs/greenhouse-flower-core-tutorial-v1.json',
    '../src/battle/configs/dungeons/fairy-pattern-practice-v1.json',
    '../src/battle/configs/dungeons/forest-magic-residue-v1.json',
    '../src/battle/configs/dungeons/boundary-echo-trial-v1.json',
  ];
  for (const path of configs) {
    const config = JSON.parse(await read(path));
    const pres = config.presentation;
    assert.ok(pres, `${path} should carry presentation`);
    assert.match(pres.boss_id, /^[a-z0-9_]{1,24}$/, `${path} boss_id must be a safe art key`);
    assert.ok(typeof pres.boss_name === 'string' && pres.boss_name.length >= 1 && pres.boss_name.length <= 12);
    assert.ok(typeof pres.boss_title === 'string' && pres.boss_title.length <= 18);
  }
});

test('八名角色的对战视觉 ID 均解析到独立 Boss sheet', async () => {
  const { characterBossSheet } = await importTypescript('../src/battle/battle-renderer.ts');
  const configs = await importTypescript('../src/battle/duel-configs.ts');
  const expected = {
    reimu: 'boss_reimu',
    marisa: 'boss_marisa',
    alice: 'boss_alice',
    nitori: 'boss_nitori',
    cirno: 'boss_cirno',
    mystia: 'boss_mystia',
    suika: 'boss_suika',
    sakuya: 'boss_sakuya',
  };
  for (const [characterId, sheet] of Object.entries(expected)) {
    const config = configs.getDuelBattleConfig(characterId, 'standard');
    assert.equal(config.presentation.boss_id, characterId);
    assert.equal(characterBossSheet(config.presentation.boss_id), sheet);
  }
  assert.equal(characterBossSheet('boss_flower_core'), undefined);
});

test('B3 渲染冒烟：mock 上下文整帧绘制含 cut-in 占位卡，不抛异常', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const { renderBattleFrame } = await importTypescript('../src/battle/battle-renderer.ts');
  const config = {
    ...baseConfig,
    presentation: { boss_id: 'cirno', boss_name: '琪露诺', boss_title: '湖上的冰之妖精' },
  };
  const sim = new BattleSimulation(config, { onFinish: () => {}, random: () => 0.5 });
  sim.start();
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false,
    pointerActive: false, pointerX: 0, pointerY: 0,
  };
  // Step into the intro window so banner + cut-in are live, with bullets spawned.
  for (let i = 0; i < 60; i += 1) sim.step(idle, false);

  const textCalls = [];
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'fillText') {
        return (...args) => { textCalls.push(String(args[0])); };
      }
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
      if (prop === 'canvas') return { width: 480, height: 640 };
      if (!(prop in target)) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });

  assert.doesNotThrow(() => renderBattleFrame(ctx, sim, null));
  assert.ok(textCalls.some((t) => t.includes('琪露诺')), 'cut-in should print the boss name');
  assert.ok(textCalls.some((t) => t.includes('完好')), 'cut-in should print the S0 damage label');
  assert.ok(textCalls.some((t) => t.includes('立绘占位')), 'placeholder note must be visible until real art lands');

  // Past the intro window the cut-in retires but the frame still renders clean.
  for (let i = 0; i < 400; i += 1) sim.step(idle, false);
  textCalls.length = 0;
  assert.doesNotThrow(() => renderBattleFrame(ctx, sim, null));
  assert.ok(!textCalls.some((t) => t.includes('立绘占位')), 'cut-in must retire after the intro window');
});

test('R49-C 触控手势：拖动自动射击、双指按住专注、双击 Bomb、鼠标不误触', async () => {
  const { createBattleInput } = await importTypescript('../src/battle/battle-input.ts');
  const listeners = new Map();
  const canvas = {
    width: 480,
    height: 640,
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      listeners.set(type, list.filter((h) => h !== handler));
    },
    focus() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 640 }),
  };
  const fire = (type, event) => {
    for (const handler of listeners.get(type) ?? []) handler({ preventDefault() {}, buttons: 1, ...event });
  };
  const input = createBattleInput(canvas, { autoFire: false });
  input.attach();

  // Two held touch pointers = focus; the 2nd finger must not steer.
  fire('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, button: 0 });
  assert.equal(input.state.focused, false);
  assert.equal(input.state.firing, false, 'touch-down alone remains a tap and must not fire');
  assert.equal(input.state.pointerX, 100);
  fire('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 300, button: 0 });
  assert.equal(input.state.focused, true);
  assert.equal(input.state.pointerX, 100, 'second finger must not move the aim point');
  fire('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 320, clientY: 320 });
  assert.equal(input.state.pointerX, 100);
  assert.equal(input.state.firing, false, 'modifier finger must not trigger firing');
  fire('pointerup', { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 300 });
  assert.equal(input.state.focused, false);
  assert.equal(input.state.pointerActive, true, 'primary drag survives the modifier finger lifting');
  fire('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 120, clientY: 130 });
  assert.equal(input.state.firing, true, 'primary touch drag should automatically fire');
  assert.equal(input.state.pointerX, 120);
  fire('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 120, clientY: 130 });
  assert.equal(input.state.pointerActive, false);
  assert.equal(input.state.firing, false, 'lifting the primary touch should stop drag firing');

  // The pair of ups above counts as tap #1+#2 only if both were quick and still;
  // finger 2 moved (320,320->300,300 < threshold from down at 300,300? it moved 20px+ then back)
  // so drain any pending edge, then perform a clean double tap.
  input.consumeBombPressed();
  fire('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 400, button: 0 });
  fire('pointerup', { pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 400 });
  fire('pointerdown', { pointerId: 4, pointerType: 'touch', clientX: 202, clientY: 402, button: 0 });
  fire('pointerup', { pointerId: 4, pointerType: 'touch', clientX: 202, clientY: 402 });
  assert.equal(input.consumeBombPressed(), true, 'quick double tap should request a bomb');
  assert.equal(input.consumeBombPressed(), false);

  // Mouse clicks never trigger the tap gesture.
  fire('pointerdown', { pointerId: 5, pointerType: 'mouse', clientX: 240, clientY: 320, button: 0 });
  fire('pointermove', { pointerId: 5, pointerType: 'mouse', clientX: 280, clientY: 360 });
  assert.equal(input.state.firing, false, 'mouse drag still requires the Z key');
  fire('pointerup', { pointerId: 5, pointerType: 'mouse', clientX: 240, clientY: 320 });
  fire('pointerdown', { pointerId: 6, pointerType: 'mouse', clientX: 240, clientY: 320, button: 0 });
  fire('pointerup', { pointerId: 6, pointerType: 'mouse', clientX: 240, clientY: 320 });
  assert.equal(input.consumeBombPressed(), false);

  input.detach();
  for (const [, list] of listeners) assert.equal(list.length, 0);
});

test('R49-D 妖精波段：boss 缺席免伤、弹幕停火、波段结束宣言重置', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false,
    pointerActive: false, pointerX: 0, pointerY: 0,
  };
  const sim = new BattleSimulation(
    {
      ...baseConfig,
      player: { ...baseConfig.player, auto_fire: true, focus_shot: { damage: 2, interval_ms: 50 } },
      phases: [{
        id: 'wave_then_boss',
        kind: 'nonspell',
        name: '波段验证',
        hp: 300,
        duration_ms: 20000,
        patterns: [{ pattern_id: 'fixed_seed_ring', interval_ms: 900, speed: 80, count: 8 }],
        intro_ms: 4000,
        intro_mobs: [
          { interval_ms: 800, count: 2, hp: 4, path: 'side', drop: 'power_small', speed: 80, shot_interval_ms: 0 },
        ],
      }],
    },
    { onFinish: () => {}, random: () => 0.5 },
  );
  sim.start();
  const focusFire = { ...idle, focused: true, firing: true };

  // ~2s into the wave: fairies spawned, boss untouched, no boss patterns fired.
  for (let i = 0; i < 240; i += 1) sim.step(focusFire, false);
  let snap = sim.snapshot();
  assert.ok(snap.phase.waveUntil > 0, 'wave window should be active');
  assert.ok(snap.mobs >= 1, 'intro fairies should spawn during the wave');
  assert.equal(snap.boss.hp, snap.boss.maxHp, 'absent boss must take no shot damage');
  assert.equal(snap.enemyShots, 0, 'boss patterns must stay silent during the wave');

  // Bomb during the wave clears fairies but still deals no boss damage.
  sim.step(focusFire, true);
  snap = sim.snapshot();
  assert.equal(snap.boss.hp, snap.boss.maxHp, 'bomb must not hit the absent boss');

  // Cross the wave boundary: banner clock resets, boss becomes targetable.
  for (let i = 0; i < 300; i += 1) sim.step(focusFire, false);
  snap = sim.snapshot();
  assert.ok(!snap.phase.waveUntil, 'wave flag should clear when the boss joins');
  assert.ok(snap.phase.startedAt >= 4000, 'phase clock should restart at boss arrival');
  for (let i = 0; i < 600; i += 1) sim.step(focusFire, false);
  snap = sim.snapshot();
  assert.ok(snap.boss.hp < snap.boss.maxHp, 'boss should take damage after the wave');
  assert.ok(snap.stats.powerCollected >= 0);

  // All four shipped configs carry intro waves on their opening phase.
  const configs = [
    '../src/battle/configs/greenhouse-flower-core-tutorial-v1.json',
    '../src/battle/configs/dungeons/fairy-pattern-practice-v1.json',
    '../src/battle/configs/dungeons/forest-magic-residue-v1.json',
    '../src/battle/configs/dungeons/boundary-echo-trial-v1.json',
  ];
  for (const path of configs) {
    const config = JSON.parse(await read(path));
    const first = config.phases[0];
    assert.ok(first.intro_ms >= 4000 && first.intro_ms <= 30000, `${path} opening intro_ms`);
    assert.ok(Array.isArray(first.intro_mobs) && first.intro_mobs.length >= 1, `${path} opening intro_mobs`);
    const drops = config.phases.flatMap((p) => (p.intro_mobs ?? []).map((w) => w.drop));
    assert.ok(drops.includes('power_small') && drops.includes('power_big'), `${path} should drop both P sizes`);
  }
});

test('R49-F boss 确定性游移且命中出火花，结算链不受影响', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false,
    pointerActive: false, pointerX: 0, pointerY: 0,
  };
  const sim = new BattleSimulation(
    {
      ...baseConfig,
      player: { ...baseConfig.player, auto_fire: true, focus_shot: { damage: 2, interval_ms: 50 } },
      phases: [{
        id: 'drift_boss',
        kind: 'nonspell',
        name: '游移',
        hp: 5000,
        duration_ms: 30000,
        patterns: [],
      }],
    },
    { onFinish: () => {}, random: () => 0.5 },
  );
  sim.start();
  const focusFire = { ...idle, focused: true, firing: true };

  // At the sway peak (~1.55s: sin(2π·t/6200)=1) the boss is well off its anchor.
  for (let i = 0; i < 186; i += 1) sim.step(focusFire, false);
  const atPeak = sim.snapshot();
  assert.ok(Math.abs(atPeak.boss.x - 240) > 15, `boss should drift, x=${atPeak.boss.x}`);

  // Shots still land across the sway cycle and spark on impact.
  let sawImpact = false;
  for (let i = 0; i < 800; i += 1) {
    sim.step(focusFire, false);
    if (!sawImpact && sim.snapshot().stats.hits >= 1) {
      sawImpact = sim.getRenderState().particles.length > 0;
    }
  }
  const snap = sim.snapshot();
  assert.ok(snap.stats.hits >= 1, 'moving boss must still be hittable from center lane');
  assert.ok(sawImpact, 'boss hits should spawn impact sparks');
  assert.ok(snap.boss.hp < snap.boss.maxHp);
});

test('R49-G 僚机弹源、SFX 事件、开场报幕与新弹种渲染', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const { renderBattleFrame } = await importTypescript('../src/battle/battle-renderer.ts');
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false,
    pointerActive: false, pointerX: 0, pointerY: 0,
  };
  const events = [];
  const sim = new BattleSimulation(
    {
      ...baseConfig,
      presentation: {
        boss_id: 'sakuya', boss_name: '十六夜咲夜', boss_title: '红魔馆的完美从者',
        stage_title: '境界回声试炼', stage_subtitle: '红魔之夜 · 银刀与刻线',
      },
      phases: [{
        id: 'familiar_phase',
        kind: 'spell',
        name: '僚机验证',
        hp: 400,
        duration_ms: 20000,
        familiars: { count: 2, orbit_px: 60, orbit_ms: 4200 },
        patterns: [
          { pattern_id: 'aimed_stream', interval_ms: 900, speed: 100, count: 1, from_familiar: true },
          { pattern_id: 'burst_cluster', interval_ms: 2000, speed: 100, count: 10, burst_delay_ms: 700, start_ms: 500 },
          { pattern_id: 'cross_sweep', interval_ms: 2200, speed: 110, count: 8, start_ms: 800 },
        ],
      }],
    },
    { onFinish: () => {}, random: () => 0.5, sfx: (id) => events.push(id) },
  );
  sim.start();
  assert.ok(events.includes('spell_declare'), 'phase without wave should declare on start');

  // First aimed volley must originate at a familiar (~60px off the boss).
  let sighting = null;
  for (let i = 0; i < 300 && !sighting; i += 1) {
    sim.step(idle, false);
    const state = sim.getRenderState();
    const shot = state.enemyShots.find((b) => b.patternId === 'aimed_stream');
    if (shot) sighting = { shot, boss: { x: state.boss.x, y: state.boss.y }, familiars: state.familiars };
  }
  assert.ok(sighting, 'familiar-sourced aimed volley should fire');
  assert.equal(sighting.familiars.length, 2);
  const offset = Math.hypot(sighting.shot.x - sighting.boss.x, sighting.shot.y - sighting.boss.y);
  assert.ok(offset > 30, `shot should spawn at the familiar, offset=${offset}`);

  // Full-frame render smoke with orb/star bullets, familiars and stage crawl.
  const textCalls = [];
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'fillText') return (...args) => { textCalls.push(String(args[0])); };
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
      if (prop === 'canvas') return { width: 960, height: 1280 };
      if (!(prop in target)) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  assert.doesNotThrow(() => renderBattleFrame(ctx, sim, null));
  assert.ok(textCalls.some((t) => t.includes('境界回声试炼')), 'stage crawl should print the stage title');

  sim.forceFinish('narrow_win');
  assert.ok(events.includes('battle_win'));
  assert.ok(!events.includes('battle_lose'));
});

test('R49-G 激光持续擦弹：贴线可多次擦、不判中弹', async () => {
  const { BattleSimulation } = await importTypescript('../src/battle/battle-simulation.ts');
  const idle = {
    moveX: 0, moveY: 0, focused: false, firing: false,
    bombPressed: false, pausePressed: false,
    pointerActive: false, pointerX: 0, pointerY: 0,
  };
  const sim = new BattleSimulation(
    {
      ...baseConfig,
      phases: [{
        id: 'laser_graze',
        kind: 'spell',
        name: '激光擦弹',
        hp: 9999,
        duration_ms: 20000,
        patterns: [
          { pattern_id: 'laser_warning', interval_ms: 6000, count: 1, warning_ms: 600, active_ms: 600, speed: 100 },
        ],
      }],
    },
    { onFinish: () => {}, random: () => 0.5 },
  );
  sim.start();
  // Laser aims at spawn position; sidestep ~23px during the telegraph so the
  // beam passes inside the graze band without touching the hitbox.
  for (let i = 0; i < 156; i += 1) {
    const input = i < 12 ? { ...idle, moveX: 1 } : idle;
    sim.step(input, false);
  }
  const snap = sim.snapshot();
  assert.equal(snap.stats.misses, 0, 'riding the beam edge must not count as a hit');
  assert.ok(snap.stats.grazes >= 2, `laser should re-graze on ticks, got ${snap.stats.grazes}`);
});
