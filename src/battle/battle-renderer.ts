import type { BattleSimulation } from './battle-simulation';
import type {
  BattlePresentationConfig,
  Bullet,
  BulletShape,
  ItemState,
  MobState,
  Particle,
  PlayerState,
} from './battle-types';
import { BOSS_DAMAGE_LABELS, bossDamageLevel, ITEM_POC_RATIO, POWER_MAX } from './battle-types';
import {
  drawAtlasFrame,
  type BattleAtlas,
} from './battle-atlas';

/** Spell/nonspell declaration banner + boss cut-in lifetime at each phase start. */
const BANNER_MS = 2400;

/** Damage-tier accents: S0 intact / S1 light / S2 heavy. */
const DAMAGE_ACCENTS = ['#7ad0ff', '#ffc94f', '#ff5a6b'] as const;

function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function renderBattleFrame(
  ctx: CanvasRenderingContext2D,
  sim: BattleSimulation,
  atlas?: BattleAtlas | null,
) {
  const state = sim.getRenderState();
  const { arena, player, boss, phase, phaseCount, stats, playerShots, enemyShots, particles, mobs, items, mode, gameTimeMs, hitboxRadius, familiars } = state;
  const reduced = prefersReducedMotion();
  /** Fairy intro sweep: the boss is absent, so all boss chrome hides with it. */
  const waveActive = Boolean(phase.waveUntil && gameTimeMs < phase.waveUntil);

  // Brief screen shake on life loss / bomb — visual translate only, decays fast.
  let shakeX = 0;
  let shakeY = 0;
  if (!reduced) {
    const sinceMiss = player.lastMissAt != null ? gameTimeMs - player.lastMissAt : Infinity;
    const sinceBomb = player.bombStartedAt > 0 ? gameTimeMs - player.bombStartedAt : Infinity;
    const missAmp = sinceMiss < 500 ? 5 * (1 - sinceMiss / 500) : 0;
    const bombAmp = sinceBomb < 400 ? 3 * (1 - sinceBomb / 400) : 0;
    const amp = Math.max(missAmp, bombAmp);
    if (amp > 0.1) {
      shakeX = Math.sin(gameTimeMs / 16) * amp;
      shakeY = Math.cos(gameTimeMs / 13) * amp * 0.7;
    }
  }

  // Draw in arena units on a (possibly) supersampled backing store.
  const backingScale = ctx.canvas && ctx.canvas.width
    ? ctx.canvas.width / arena.width
    : 1;
  if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(backingScale, 0, 0, backingScale, shakeX * backingScale, shakeY * backingScale);
  }

  ctx.clearRect(-12, -12, arena.width + 24, arena.height + 24);
  drawThemedBackground(
    ctx,
    arena,
    sim.config.presentation?.boss_id,
    gameTimeMs,
    phase.kind === 'spell',
    reduced,
  );

  if (!waveActive) {
    ctx.save();
    ctx.globalAlpha = phase.kind === 'spell' ? 0.14 : 0.08;
    ctx.strokeStyle = phase.captureFailed ? '#8a6a78' : '#7aa0c8';
    ctx.lineWidth = 2;
    const radius = 40 + (1 - boss.hp / Math.max(1, boss.maxHp)) * 90;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const bullet of enemyShots) {
    if (bullet.safeLane && bullet.warning) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#5ad0ff';
      ctx.fillRect(bullet.x - bullet.radius, 0, bullet.radius * 2, arena.height);
      ctx.restore();
    }
  }

  const barX = 40;
  const barW = arena.width - 80;
  if (waveActive) {
    // Fairy sweep header: countdown strip instead of the boss HP bar.
    const waveTotal = Math.max(1, (phase.waveUntil ?? 0) - (phase.startedAt || 0));
    const waveRemain = Math.max(0, (phase.waveUntil ?? 0) - gameTimeMs);
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.fillRect(barX, 20, barW, 6);
    ctx.fillStyle = '#ffd35a';
    ctx.fillRect(barX, 20, barW * Math.min(1, waveRemain / waveTotal), 6);
    ctx.fillStyle = '#ffe08a';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`妖精来袭 · 击破收集P点  ${Math.ceil(waveRemain / 1000)}s`, barX, 14);
  } else {
    // Spell phases anchor a slow-turning magic circle beneath the boss.
    if (phase.kind === 'spell' && boss.hp > 0) {
      drawSpellCircle(ctx, boss.x, boss.y, gameTimeMs, reduced, phase.captureFailed);
    }
    // Boss uses phase form only — no hit-flash sprite swap. Damage is read from
    // the HP bar; shot impacts add a brief additive brighten on the same frame.
    const bossFrame = boss.hp <= 0
      ? 'boss_break' as const
      : phase.index === 0
        ? 'boss_phase1' as const
        : 'boss_phase2' as const;
    const bossDrawn = drawAtlasFrame(ctx, atlas, bossFrame, boss.x, boss.y, { scale: 1, alpha: 1 });
    if (!bossDrawn) {
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, 30, 0, Math.PI * 2);
      ctx.fillStyle = phase.index === 0 ? '#3f8f6a' : '#8a3d7a';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#d8f0ff';
      ctx.stroke();
    }
    if (!reduced && gameTimeMs < boss.hitFlashUntil) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (bossDrawn) {
        drawAtlasFrame(ctx, atlas, bossFrame, boss.x, boss.y, { scale: 1, alpha: 0.22 });
      } else {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(boss.x, boss.y, 30, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(barX, 20, barW, 10);
    ctx.fillStyle = boss.hp / boss.maxHp < 0.25 ? '#ff6b6b' : '#e06aa9';
    ctx.fillRect(barX, 20, barW * Math.max(0, boss.hp / Math.max(1, boss.maxHp)), 10);
    ctx.fillStyle = '#f4f0ff';
    ctx.font = '12px system-ui, sans-serif';
    const phaseCfgDuration = sim.config.phases[phase.index]?.duration_ms ?? 1;
    const remain = Math.max(0, phaseCfgDuration - (gameTimeMs - phase.startedAt));
    const title = phase.kind === 'spell' ? `符卡 ${phase.name}` : `非符 ${phase.name}`;
    ctx.fillText(`${title}  ${Math.ceil(remain / 1000)}s`, barX, 14);
    if (phase.kind === 'spell') {
      ctx.fillStyle = phase.captureFailed ? '#c9a0a8' : '#ffe08a';
      ctx.fillText(phase.captureFailed ? '取得失败' : '符卡取得中', barX + barW - 72, 14);
    }
    // Remaining phases after this one, TH06-style stars under the HP bar.
    const remainingPhases = Math.max(0, phaseCount - phase.index - 1);
    ctx.fillStyle = '#ffe08a';
    for (let i = 0; i < remainingPhases; i += 1) {
      drawStar4(ctx, barX + barW - 8 - i * 14, 38, 5, 0);
      ctx.fill();
    }
  }

  // Orbiting familiars — the satellites some patterns fire from.
  for (const familiar of familiars) {
    ctx.save();
    ctx.translate(familiar.x, familiar.y);
    ctx.rotate(reduced ? Math.PI / 4 : gameTimeMs / 480);
    ctx.fillStyle = '#ffd98a';
    ctx.globalAlpha = 0.3;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.globalAlpha = 0.92;
    ctx.fillRect(-4.5, -4.5, 9, 9);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-1.6, -1.6, 3.2, 3.2);
    ctx.restore();
  }

  for (const mob of mobs as MobState[]) {
    drawFairy(ctx, mob, gameTimeMs);
  }

  // Player shots are crisp vector streaks (the atlas crops scaled muddy):
  // soft glow capsule → colored body → white core. Focus = cyan needle,
  // normal = amber bolt.
  for (const bullet of playerShots) {
    const focusShot = player.focused;
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.fillStyle = focusShot ? '#5de6ff' : '#ffc76a';
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.ellipse(0, 0, focusShot ? 3.6 : 4.8, focusShot ? 15 : 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(0, -0.5, focusShot ? 2 : 2.8, focusShot ? 11 : 8.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, -1.5, focusShot ? 0.9 : 1.3, focusShot ? 7 : 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const bullet of enemyShots) {
    if (bullet.safeLane) continue;
    drawEnemyBullet(ctx, bullet, reduced);
  }

  for (const item of items as ItemState[]) {
    drawPowerItem(ctx, item);
  }

  // Auto-collect hint: a faint line marks the POC band while the player is inside it.
  const pocY = arena.height * ITEM_POC_RATIO;
  if (player.y <= pocY) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#ffe08a';
    ctx.setLineDash?.([6, 10]);
    ctx.beginPath();
    ctx.moveTo(8, pocY);
    ctx.lineTo(arena.width - 8, pocY);
    ctx.stroke();
    ctx.setLineDash?.([]);
    ctx.restore();
  }

  for (const particle of particles as Particle[]) {
    const lifeRatio = Math.max(0, particle.life / particle.maxLife);
    if (particle.text) {
      ctx.save();
      ctx.globalAlpha = lifeRatio;
      ctx.fillStyle = particle.color;
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(particle.text, particle.x, particle.y);
      ctx.restore();
      continue;
    }
    // Small feedback dots (graze sparks) stay geometric; big bursts may use the atlas spark.
    const spark = particle.radius >= 4
      ? drawAtlasFrame(ctx, atlas, 'fx_spark', particle.x, particle.y, {
        scale: Math.max(0.3, lifeRatio),
        alpha: lifeRatio,
      })
      : false;
    if (!spark) {
      ctx.globalAlpha = lifeRatio;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawPlayer(ctx, player, gameTimeMs, hitboxRadius, reduced, atlas);

  if (!waveActive) {
    ctx.fillStyle = boss.hp / boss.maxHp < 0.25 ? '#ff7a7a' : 'rgba(255,255,255,.55)';
    ctx.fillRect(boss.x - 6, arena.height - 10, 12, 4);
  }

  // Power meter (TH06-style 0..128) — visual only, never part of BattleResult.
  const powerRatio = Math.max(0, Math.min(1, player.power / POWER_MAX));
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  ctx.fillRect(16, arena.height - 42, 96, 6);
  ctx.fillStyle = powerRatio >= 1 ? '#ffe08a' : '#7ad0ff';
  ctx.fillRect(16, arena.height - 42, 96 * powerRatio, 6);
  ctx.fillStyle = '#dce8ff';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(`P ${Math.round(player.power)}/${POWER_MAX}`, 16, arena.height - 46);

  // Icon HUD: lives as gold stars, bombs as pink dots (the on-screen buttons
  // are retired; X key / double-tap still consume bombs).
  ctx.fillStyle = '#ffd35a';
  for (let i = 0; i < Math.min(9, Math.max(0, player.lives)); i += 1) {
    drawStar4(ctx, 22 + i * 16, arena.height - 25, 6, 0);
    ctx.fill();
  }
  ctx.fillStyle = '#ff8fd2';
  for (let i = 0; i < Math.min(9, Math.max(0, player.bombs)); i += 1) {
    ctx.beginPath();
    ctx.arc(21 + i * 13, arena.height - 11, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`擦弹 ${stats.grazes} · 阶段 ${phase.index + 1}/${phaseCount}`, arena.width - 14, arena.height - 14);
  ctx.textAlign = 'left';

  // Stage-opening crawl covers the first seconds regardless of wave state.
  if (sim.config.presentation?.stage_title && gameTimeMs < 3600) {
    drawStageOpening(
      ctx,
      arena,
      sim.config.presentation.stage_title,
      sim.config.presentation.stage_subtitle,
      gameTimeMs,
      reduced,
    );
  }

  if (!waveActive) {
    drawPhaseBanner(ctx, arena, phase.kind, phase.name, gameTimeMs - phase.startedAt, reduced);
    if (sim.config.presentation) {
      drawBossCutIn(
        ctx,
        arena,
        sim.config.presentation,
        bossDamageLevel(phase.index, phaseCount),
        gameTimeMs - phase.startedAt,
        reduced,
      );
    }
  }

  if (mode === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, 0, arena.width, arena.height);
    ctx.fillStyle = '#fff';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('暂停', arena.width / 2 - 24, arena.height / 2 - 8);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('Esc 继续 · 关闭对话框退出且不结算', arena.width / 2 - 110, arena.height / 2 + 18);
  }

  if (player.state === 'deathbomb') {
    ctx.strokeStyle = 'rgba(255,120,120,.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, arena.width - 8, arena.height - 8);
  }
}

type BgTheme = 'cirno' | 'alice' | 'sakuya' | 'flower_core' | 'default';

function themeOf(bossId: string | undefined): BgTheme {
  switch (bossId) {
    case 'cirno':
    case 'alice':
    case 'sakuya':
    case 'flower_core':
      return bossId;
    default:
      return 'default';
  }
}

/**
 * Procedurally drawn stage moods in the spirit of the source games (night lake,
 * magic forest, scarlet night sky, greenhouse) — entirely original drawing, no
 * game art is copied. Deterministic per frame: motes are index-hashed and only
 * scrolled by game time, so pause/reduced-motion freezes them cleanly.
 * Everything stays dim so danmaku contrast always wins.
 */
function drawThemedBackground(
  ctx: CanvasRenderingContext2D,
  arena: { width: number; height: number },
  bossId: string | undefined,
  timeMs: number,
  spell: boolean,
  reduced: boolean,
) {
  const { width, height } = arena;
  const theme = themeOf(bossId);
  const t = reduced ? 0 : timeMs;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  if (theme === 'cirno') {
    gradient.addColorStop(0, '#0b1330');
    gradient.addColorStop(0.55, '#10223c');
    gradient.addColorStop(1, '#0d1a2c');
  } else if (theme === 'alice') {
    gradient.addColorStop(0, '#0f1322');
    gradient.addColorStop(0.5, '#13212b');
    gradient.addColorStop(1, '#101c20');
  } else if (theme === 'sakuya') {
    gradient.addColorStop(0, '#190d1c');
    gradient.addColorStop(0.6, '#200f1d');
    gradient.addColorStop(1, '#120a12');
  } else if (theme === 'flower_core') {
    gradient.addColorStop(0, '#0e1a18');
    gradient.addColorStop(0.6, '#132420');
    gradient.addColorStop(1, '#0f1c18');
  } else {
    gradient.addColorStop(0, '#101528');
    gradient.addColorStop(1, '#101528');
  }
  ctx.fillStyle = gradient;
  // Overdraw beyond the arena so screen shake never exposes bare canvas.
  ctx.fillRect(-12, -12, width + 24, height + 24);

  ctx.save();
  if (theme === 'default') {
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < height; y += 32) ctx.fillRect(0, y, width, 1);
    ctx.restore();
    return;
  }

  if (theme === 'sakuya') {
    // Pale scarlet moon, high right.
    const mx = width * 0.78;
    const my = height * 0.16;
    const moon = ctx.createRadialGradient(mx, my, 8, mx, my, 74);
    moon.addColorStop(0, 'rgba(255,150,150,.20)');
    moon.addColorStop(0.6, 'rgba(220,110,120,.10)');
    moon.addColorStop(1, 'rgba(220,110,120,0)');
    ctx.fillStyle = moon;
    ctx.fillRect(mx - 80, my - 80, 160, 160);
    for (let i = 0; i < 22; i += 1) {
      const sx = (i * 137.51) % width;
      const sy = (i * 89.7) % (height * 0.55);
      ctx.globalAlpha = Math.max(0.02, reduced ? 0.07 : 0.05 + 0.04 * Math.sin(t / 700 + i * 1.7));
      ctx.fillStyle = '#ffe6ea';
      ctx.fillRect(sx, sy, 1.6, 1.6);
    }
  }

  const span = height + 60;
  for (let i = 0; i < 24; i += 1) {
    const speed = 9 + (i % 5) * 5;
    const x = (((i * 127.33 + Math.sin(i * 4.7) * 60) % width) + width) % width;
    if (theme === 'cirno') {
      const y = ((i * 211.7 + (t / 1000) * speed) % span) - 30;
      ctx.globalAlpha = 0.1 + (i % 3) * 0.03;
      ctx.fillStyle = '#bfe2ff';
      ctx.beginPath();
      ctx.arc(x + Math.sin(t / 1500 + i) * 8, y, 1.2 + (i % 3) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else if (theme === 'alice') {
      const y = span - ((i * 211.7 + (t / 1000) * speed) % span) - 30;
      ctx.globalAlpha = 0.08 + (i % 3) * 0.03;
      ctx.fillStyle = '#ffe3a8';
      ctx.beginPath();
      ctx.arc(x + Math.sin(t / 1200 + i * 2.1) * 10, y, 1 + (i % 2) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (theme === 'flower_core') {
      const y = ((i * 211.7 + (t / 1000) * speed * 0.8) % span) - 30;
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = '#ff9fc4';
      ctx.save();
      ctx.translate(x + Math.sin(t / 900 + i * 1.3) * 14, y);
      ctx.rotate((t / 1000) * 0.8 + i);
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.6, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (theme === 'sakuya' && i < 10) {
      const y = ((i * 211.7 + (t / 1000) * speed) % span) - 30;
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = '#d96a7e';
      ctx.beginPath();
      ctx.ellipse(x, y, 2.2, 1.2, i, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (theme === 'cirno') {
    // Lake mist bands.
    for (let b = 0; b < 2; b += 1) {
      const by = height * (0.32 + b * 0.28) + Math.sin(t / 2600 + b * 2) * 8;
      ctx.globalAlpha = 0.045;
      ctx.fillStyle = '#cfe6ff';
      ctx.beginPath();
      ctx.ellipse(width / 2 + Math.sin(t / 3400 + b) * 30, by, width * 0.62, 26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme === 'alice') {
    // Forest depth: soft vertical bands.
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#0a1410';
    for (let b = 0; b < 5; b += 1) {
      const bx = (b * 127 + 40) % width;
      ctx.fillRect(bx, 0, 26 + (b % 3) * 14, height);
    }
  } else if (theme === 'flower_core') {
    // Greenhouse pane lines.
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#bfe8d8';
    ctx.lineWidth = 1;
    for (let b = 1; b < 4; b += 1) {
      ctx.beginPath();
      ctx.moveTo((width / 4) * b, 0);
      ctx.lineTo((width / 4) * b, height);
      ctx.stroke();
    }
  }

  // Spell phases add the slow-scrolling checker veil.
  if (spell) {
    const size = 46;
    const off = reduced ? 0 : ((t / 1000) * 12) % (size * 2);
    ctx.globalAlpha = 0.03;
    ctx.fillStyle = '#ffffff';
    for (let row = -2; (row - 1) * size < height; row += 1) {
      for (let col = -2; (col - 1) * size < width; col += 1) {
        if (((row + col) % 2 + 2) % 2 !== 0) continue;
        ctx.fillRect(col * size + off, row * size + off, size, size);
      }
    }
  }
  ctx.restore();
}

/** Stage-opening crawl: title fades in low-left, rises slightly, fades out. */
function drawStageOpening(
  ctx: CanvasRenderingContext2D,
  arena: { width: number; height: number },
  title: string,
  subtitle: string | undefined,
  timeMs: number,
  reduced: boolean,
) {
  const fadeIn = Math.min(1, timeMs / 450);
  const fadeOut = Math.min(1, Math.max(0, (3600 - timeMs) / 700));
  const alpha = Math.min(fadeIn, fadeOut);
  if (alpha <= 0) return;
  const rise = reduced ? 0 : (1 - fadeIn) * 12;
  const x = 26;
  const y = arena.height * 0.6 + rise;
  const safeTitle = String(title).slice(0, 18);
  const safeSubtitle = subtitle ? String(subtitle).slice(0, 26) : '';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(10,12,24,.55)';
  ctx.fillRect(x - 10, y - 30, 250, safeSubtitle ? 62 : 44);
  ctx.fillStyle = '#ffe08a';
  ctx.fillRect(x - 10, y - 30, 3, safeSubtitle ? 62 : 44);
  ctx.fillStyle = '#f4f0ff';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillText(safeTitle, x, y);
  if (safeSubtitle) {
    ctx.fillStyle = 'rgba(220,232,255,.75)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(safeSubtitle, x, y + 20);
  }
  ctx.restore();
}

/** Spell/nonspell declaration strip during the first BANNER_MS of a phase. */
function drawPhaseBanner(
  ctx: CanvasRenderingContext2D,
  arena: { width: number; height: number },
  kind: 'nonspell' | 'spell',
  name: string,
  phaseElapsed: number,
  reduced: boolean,
) {
  if (phaseElapsed < 0 || phaseElapsed >= BANNER_MS) return;
  const introT = Math.min(1, phaseElapsed / 280);
  const outroT = Math.min(1, Math.max(0, (BANNER_MS - phaseElapsed) / 280));
  const ease = introT * (2 - introT);
  const alpha = Math.min(introT, outroT);
  const bannerH = 46;
  const bannerY = arena.height * 0.3;
  const slideX = reduced ? 0 : -(1 - ease) * arena.width * 0.45;
  const accent = kind === 'spell' ? '#ffe08a' : '#7ad0ff';

  ctx.save();
  ctx.globalAlpha = 0.85 * alpha;
  ctx.translate(slideX, 0);
  ctx.fillStyle = 'rgba(10,12,24,.78)';
  ctx.fillRect(0, bannerY, arena.width, bannerH);
  ctx.fillStyle = accent;
  ctx.fillRect(0, bannerY, 4, bannerH);
  ctx.fillRect(0, bannerY + bannerH - 2, arena.width * ease, 2);
  ctx.fillStyle = accent;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(kind === 'spell' ? 'SPELL CARD · 符卡' : '通常弹幕 · 非符', 18, bannerY + 17);
  ctx.fillStyle = '#f4f0ff';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText(name, 18, bannerY + 37);
  ctx.restore();
}

/**
 * Boss cut-in placeholder card during the phase intro window.
 * Deliberately abstract (badge / star motif / crack lines) — character art is
 * NOT drawn procedurally; a portrait atlas frame will replace the card body
 * once real assets land. Damage tiers stay at "battle-worn", never nudity.
 */
function drawBossCutIn(
  ctx: CanvasRenderingContext2D,
  arena: { width: number; height: number },
  presentation: BattlePresentationConfig,
  damageLevel: 0 | 1 | 2,
  phaseElapsed: number,
  reduced: boolean,
) {
  if (phaseElapsed < 0 || phaseElapsed >= BANNER_MS) return;
  const name = String(presentation.boss_name ?? '').slice(0, 12);
  if (!name) return;
  const title = String(presentation.boss_title ?? '').slice(0, 18);
  const accent = DAMAGE_ACCENTS[damageLevel];

  const introT = Math.min(1, phaseElapsed / 300);
  const outroT = Math.min(1, Math.max(0, (BANNER_MS - phaseElapsed) / 300));
  const ease = 1 - (1 - introT) * (1 - introT);
  const alpha = Math.min(introT, outroT);

  const w = Math.min(190, arena.width * 0.4);
  const h = Math.min(200, arena.height * 0.32);
  const x = arena.width - (reduced ? w + 14 : (w + 14) * ease);
  const y = arena.height * 0.38;

  ctx.save();
  ctx.globalAlpha = 0.85 * alpha;
  ctx.fillStyle = 'rgba(14,12,24,.88)';
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = accent;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  // Damage badge (S0 完好 / S1 轻损 / S2 重损).
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 58, 20);
  ctx.fillStyle = '#14101c';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText(`S${damageLevel} ${BOSS_DAMAGE_LABELS[damageLevel]}`, x + 6, y + 14);

  // Abstract motif keeps the card readable as "portrait slot", not a figure.
  ctx.globalAlpha = 0.3 * alpha;
  ctx.fillStyle = accent;
  drawStar4(ctx, x + w / 2, y + h * 0.42, 32, reduced ? 0 : phaseElapsed / 900);
  ctx.fill();

  if (damageLevel >= 1) {
    ctx.globalAlpha = 0.5 * alpha;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    drawCracks(ctx, x, y, w, h, damageLevel);
  }

  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(220,232,255,.45)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('立绘占位 · 素材待换', x + 12, y + 34);
  ctx.fillStyle = '#f4f0ff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(name, x + 12, y + h - 32);
  if (title) {
    ctx.fillStyle = accent;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(title, x + 12, y + h - 14);
  }

  // Diagonal light sweep across the card.
  if (!reduced) {
    const sweep = (phaseElapsed % 1400) / 1400;
    const sx = x + sweep * (w + 60) - 30;
    const grad = ctx.createLinearGradient(sx - 20, y, sx + 20, y + h);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/** Fixed-seed jagged crack lines — deterministic per frame, no flicker. */
function drawCracks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  level: number,
) {
  const seeds = level >= 2 ? [0.16, 0.44, 0.72, 0.9] : [0.3, 0.78];
  for (const seed of seeds) {
    ctx.beginPath();
    let px = x + w * seed;
    let py = y + 6;
    ctx.moveTo(px, py);
    for (let i = 1; i <= 4; i += 1) {
      px += w * (i % 2 === 0 ? 0.07 : -0.09) * (seed > 0.5 ? -1 : 1);
      py += (h - 12) / 4;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

/** Slow-turning double-ring spell circle with spokes and diamond ticks. */
function drawSpellCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timeMs: number,
  reduced: boolean,
  captureFailed: boolean,
) {
  const t = reduced ? 0 : timeMs;
  const outer = 50;
  const inner = 34;
  const color = captureFailed ? 'rgba(200,160,170,.5)' : 'rgba(255,217,138,.55)';
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  ctx.save();
  ctx.rotate(t / 2400);
  ctx.beginPath();
  ctx.arc(0, 0, outer, 0, Math.PI * 2);
  ctx.stroke();
  // Diamond ticks riding the outer ring.
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    ctx.save();
    ctx.rotate(angle);
    ctx.translate(outer, 0);
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-3, -3, 6, 6);
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.rotate(-t / 1700);
  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, Math.PI * 2);
  ctx.stroke();
  // Spokes between the rings.
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

/** Concave 4-point star path (HUD stars / cancel sparkles) — path only, caller fills. */
function drawStar4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rotation: number) {
  const inner = r * 0.38;
  const d = Math.SQRT1_2;
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(inner * d, -inner * d);
  ctx.lineTo(r, 0);
  ctx.lineTo(inner * d, inner * d);
  ctx.lineTo(0, r);
  ctx.lineTo(-inner * d, inner * d);
  ctx.lineTo(-r, 0);
  ctx.lineTo(-inner * d, -inner * d);
  ctx.closePath();
  ctx.restore();
}

/** Lightweight geometric fairy — tinted by its drop so loot reads at a glance. */
function drawFairy(ctx: CanvasRenderingContext2D, mob: MobState, gameTimeMs: number) {
  const r = mob.radius;
  const gold = mob.drop === 'power_big';
  const entry = Math.min(1, mob.age / 0.25);
  ctx.save();
  ctx.translate(mob.x, mob.y);
  ctx.globalAlpha = entry;
  // Soft wing bob from age.
  const flap = Math.sin(mob.age * 10) * 0.25;
  ctx.fillStyle = gold ? 'rgba(255,224,150,.4)' : 'rgba(180,220,255,.35)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.9, -2, r * 0.7, r * 0.35, -0.5 + flap, 0, Math.PI * 2);
  ctx.ellipse(r * 0.9, -2, r * 0.7, r * 0.35, 0.5 - flap, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = gold ? '#ffc94f' : '#6ec4ff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.arc(-r * 0.18, -r * 0.2, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // Brief brighten on a fresh hit — no frame swap, damage still reads from the tick.
  const sinceHit = mob.hitAt == null ? Infinity : gameTimeMs - mob.hitAt;
  if (sinceHit < 80) {
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }
  // HP tick only shortly after damage so idle fairies stay clean.
  if (mob.hp < mob.maxHp && sinceHit < 1200) {
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(-r, r + 3, r * 2, 2);
    ctx.fillStyle = '#9ef0c0';
    ctx.fillRect(-r, r + 3, r * 2 * Math.max(0, mob.hp / mob.maxHp), 2);
  }
  ctx.restore();
}

/** 3×5 bitmap for a crisp pixel "P" — drawn as rects, not font glyphs. */
const PIXEL_P: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 0],
  [0, 1], [2, 1],
  [0, 2], [1, 2],
  [0, 3],
  [0, 4],
];

function drawPowerItem(ctx: CanvasRenderingContext2D, item: ItemState) {
  const big = item.kind === 'power_big';
  // Red square with a white pixel P — the classic power-item look.
  const half = big ? 9 : 6;
  ctx.save();
  // Magnet trail while homing to the player.
  if (item.attracted) {
    ctx.fillStyle = 'rgba(240,90,70,.3)';
    for (let i = 1; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.arc(item.x - item.vx * 0.016 * i, item.y - item.vy * 0.016 * i, half * (0.5 - i * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.translate(item.x, item.y);
  // Tumble: squash X as the item flips while falling free.
  const flip = item.attracted ? 1 : Math.max(0.3, Math.abs(Math.cos(item.age * 5)));
  ctx.scale(flip, 1);
  ctx.fillStyle = big ? '#f0503c' : '#dc4432';
  ctx.fillRect(-half, -half, half * 2, half * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = big ? '#ffd35a' : 'rgba(20,16,28,.55)';
  ctx.strokeRect(-half + 0.5, -half + 0.5, half * 2 - 1, half * 2 - 1);
  // Pixel P: 3×5 cells centered in the square.
  const cell = (half * 2) / 7;
  const originX = -cell * 1.5;
  const originY = -cell * 2.5;
  ctx.fillStyle = '#ffffff';
  for (const [px, py] of PIXEL_P) {
    ctx.fillRect(originX + px * cell, originY + py * cell, cell, cell);
  }
  ctx.restore();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  gameTimeMs: number,
  hitboxRadius: number,
  reduced: boolean,
  atlas?: BattleAtlas | null,
) {
  const blinking = !reduced && gameTimeMs < player.invulnerableUntil && Math.floor(gameTimeMs / 90) % 2 === 0;
  if (blinking && !reduced) {
    // skip body while blinking; hitbox still shown when focused
  } else {
    const frameId = player.state === 'bombing'
      ? 'player_bomb' as const
      : player.state === 'deathbomb' || player.state === 'hit'
        ? 'player_hit' as const
        : player.focused
          ? 'player_focus' as const
          : 'player_normal' as const;
    const drawn = drawAtlasFrame(ctx, atlas, frameId, player.x, player.y, {
      alpha: reduced && gameTimeMs < player.invulnerableUntil ? 0.85 : 1,
    });
    if (!drawn) {
      ctx.save();
      ctx.translate(player.x, player.y);
      if (reduced && gameTimeMs < player.invulnerableUntil) {
        ctx.strokeStyle = '#f3d37a';
        ctx.lineWidth = 2;
        ctx.strokeRect(-14, -16, 28, 30);
      }
      ctx.fillStyle = player.state === 'bombing' ? '#fff1b0' : '#f3d37a';
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(12, 13);
      ctx.lineTo(0, 8);
      ctx.lineTo(-12, 13);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (player.state === 'bombing') {
      drawAtlasFrame(ctx, atlas, 'fx_ring', player.x, player.y, { scale: 1.1, alpha: 0.55 });
    }
  }
  // Option orbs mirror the power tier that widens the shot lanes (visual only).
  if (player.power >= 32 && player.state !== 'finished') {
    const bob = reduced ? 0 : Math.sin(gameTimeMs / 260) * 2;
    const spread = player.focused ? 12 : 18;
    drawOptionOrb(ctx, player.x - spread, player.y + 9 + bob);
    drawOptionOrb(ctx, player.x + spread, player.y + 9 - bob);
    if (player.power >= 96) {
      drawOptionOrb(ctx, player.x - spread * 1.8, player.y + 3 - bob);
      drawOptionOrb(ctx, player.x + spread * 1.8, player.y + 3 + bob);
    }
  }
  if (player.focused) {
    ctx.beginPath();
    ctx.arc(player.x, player.y, 12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(120,210,255,.45)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(player.x, player.y, hitboxRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3c55';
    ctx.fill();
  } else if (reduced && gameTimeMs < player.invulnerableUntil) {
    ctx.strokeStyle = '#f3d37a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Small amber familiar orb hovering beside the ship. */
function drawOptionOrb(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#ffd9a0';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.arc(x, y, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x - 0.7, y - 0.7, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const HUE_FILL: Record<string, string> = {
  red: '#ff5a6b',
  blue: '#5aa8ff',
  pink: '#ff8fd2',
  cyan: '#5de6ff',
  purple: '#c08bff',
  gold: '#ffd35a',
  green: '#7dcf63',
  white: '#f4f7ff',
};

/** Lighter inner tint per hue — the layer between body and white core. */
const HUE_LIGHT: Record<string, string> = {
  red: '#ffb3ba',
  blue: '#b8d9ff',
  pink: '#ffd3ec',
  cyan: '#c8f6ff',
  purple: '#e2ccff',
  gold: '#ffe9b3',
  green: '#c8ecba',
  white: '#ffffff',
};

function hueFill(hue: string | undefined) {
  return HUE_FILL[hue ?? 'blue'] ?? '#7ed0ff';
}

function hueLight(hue: string | undefined) {
  return HUE_LIGHT[hue ?? 'blue'] ?? '#c8e6ff';
}

/** Trace the outline of a bullet family at radius r around the origin. */
function traceBulletShape(ctx: CanvasRenderingContext2D, shape: BulletShape, r: number) {
  ctx.beginPath();
  if (shape === 'ellipse') {
    // Scale-bullet teardrop: pointed nose toward travel, round tail.
    ctx.moveTo(0, -r * 1.35);
    ctx.quadraticCurveTo(r * 0.85, -r * 0.35, r * 0.78, r * 0.25);
    ctx.arc(0, r * 0.25, r * 0.78, 0, Math.PI);
    ctx.quadraticCurveTo(-r * 0.85, -r * 0.35, 0, -r * 1.35);
  } else if (shape === 'rice') {
    ctx.moveTo(0, -r * 1.4);
    ctx.quadraticCurveTo(r * 0.85, 0, 0, r * 1.4);
    ctx.quadraticCurveTo(-r * 0.85, 0, 0, -r * 1.4);
  } else if (shape === 'pellet') {
    ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  } else if (shape === 'kunai') {
    ctx.moveTo(0, -r * 1.5);
    ctx.lineTo(r * 0.7, r);
    ctx.lineTo(0, r * 0.55);
    ctx.lineTo(-r * 0.7, r);
    ctx.closePath();
  } else if (shape === 'petal') {
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 1.1, 0, 0, r);
    ctx.quadraticCurveTo(-r * 1.1, 0, 0, -r);
  } else if (shape === 'crystal') {
    ctx.moveTo(0, -r * 1.3);
    ctx.lineTo(r * 0.75, 0);
    ctx.lineTo(0, r * 1.3);
    ctx.lineTo(-r * 0.75, 0);
    ctx.closePath();
  } else if (shape === 'star') {
    const outer = r * 1.25;
    const inner = r * 0.55;
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? outer : inner;
      const px = Math.cos(angle) * rad;
      const py = Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
}

function drawEnemyBullet(ctx: CanvasRenderingContext2D, bullet: Bullet, reduced: boolean) {
  if (bullet.laser) {
    const angle = bullet.laserAngle ?? 0;
    const length = bullet.laserLength ?? 600;
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.rotate(angle);
    if (bullet.warning) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#ffd080';
      ctx.lineWidth = 3;
      ctx.setLineDash?.([8, 8]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length, 0);
      ctx.stroke();
      ctx.setLineDash?.([]);
    } else {
      // Soft glow → colored body → white core, matching the layered bullet look.
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#ff6b9a';
      ctx.lineWidth = Math.max(8, bullet.radius * 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length, 0);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(4, bullet.radius);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length, 0);
      ctx.stroke();
      ctx.strokeStyle = '#fff0f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length, 0);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const cancelAlpha = bullet.cancelling
    ? Math.max(0, (bullet.cancelLife ?? 0) / Math.max(0.001, bullet.cancelMaxLife ?? 0.55))
    : 1;

  if (bullet.warning) {
    const r = bullet.radius;
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.globalAlpha = 0.45 * cancelAlpha;
    ctx.strokeStyle = '#c9b6ff';
    ctx.strokeRect(-r, -r, r * 2, r * 2);
    ctx.restore();
    return;
  }

  // Cancelled shots turn into a swelling star sparkle and fade out (bomb / phase clear).
  if (bullet.cancelling) {
    const grow = 1 + (1 - cancelAlpha) * 1.4;
    const rotation = reduced ? 0 : bullet.age * 5;
    ctx.save();
    ctx.globalAlpha = 0.85 * cancelAlpha;
    ctx.fillStyle = hueFill(bullet.hue);
    drawStar4(ctx, bullet.x, bullet.y, bullet.radius * grow, rotation);
    ctx.fill();
    ctx.globalAlpha = 0.9 * cancelAlpha;
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    drawStar4(ctx, bullet.x, bullet.y, bullet.radius * grow * 0.45, rotation);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Layered danmaku body: soft halo → saturated body → white core.
  const angle = Math.atan2(bullet.vy, bullet.vx);
  // Spawn-in materialize: shots swell from a faint halo down to true size.
  let spawnScale = 1;
  let spawnAlpha = 1;
  if (bullet.spawnInS != null && bullet.age < bullet.spawnInS) {
    const t = Math.max(0, Math.min(1, bullet.age / bullet.spawnInS));
    spawnScale = 1.9 - 0.9 * t;
    spawnAlpha = 0.35 + 0.65 * t;
  }
  const shape = bullet.shape ?? 'circle';
  ctx.save();
  ctx.translate(bullet.x, bullet.y);
  if (Number.isFinite(angle)) ctx.rotate(angle + Math.PI / 2);
  // Stars spin slowly on top of their travel rotation.
  if (shape === 'star') ctx.rotate(bullet.age * 2);
  drawBulletSprite(ctx, shape, bullet.hue, bullet.radius, spawnScale, spawnAlpha);
  ctx.restore();
}

/**
 * Pixel-art bullet cells: each (shape × hue × radius) is painted once into a
 * tiny offscreen canvas at 1/PIXEL_ART_SCALE resolution, then blitted with
 * smoothing OFF — hard pixel chunks like classic sprite danmaku, and cheaper
 * per bullet than layered path fills. Falls back to direct vector painting
 * where no DOM canvas exists (tests, exotic hosts).
 */
const PIXEL_ART_SCALE = 2;
const pixelCellCache = new Map<string, { cell: CanvasImageSource; size: number }>();

function drawBulletSprite(
  ctx: CanvasRenderingContext2D,
  shape: BulletShape,
  hue: string | undefined,
  radius: number,
  scale: number,
  alpha: number,
) {
  const key = `${shape}:${hue ?? 'blue'}:${Math.round(radius)}`;
  let entry = pixelCellCache.get(key);
  if (!entry && typeof document !== 'undefined') {
    try {
      const logicalSize = Math.ceil(radius * 3.6);
      const artSize = Math.max(6, Math.ceil(logicalSize / PIXEL_ART_SCALE));
      const cell = document.createElement('canvas');
      cell.width = artSize;
      cell.height = artSize;
      const cellCtx = cell.getContext('2d');
      if (cellCtx) {
        cellCtx.setTransform(1 / PIXEL_ART_SCALE, 0, 0, 1 / PIXEL_ART_SCALE, artSize / 2, artSize / 2);
        paintBulletLayers(cellCtx, shape, hue, radius);
        entry = { cell, size: artSize * PIXEL_ART_SCALE };
        pixelCellCache.set(key, entry);
      }
    } catch {
      entry = undefined;
    }
  }
  if (entry) {
    const dest = entry.size * scale;
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = alpha;
    ctx.drawImage(entry.cell, -dest / 2, -dest / 2, dest, dest);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = prevSmoothing;
    return;
  }
  ctx.save();
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  paintBulletLayers(ctx, shape, hue, radius);
  ctx.restore();
}

/** Layered bullet painting at the origin in logical units (no transforms). */
function paintBulletLayers(
  ctx: CanvasRenderingContext2D,
  shape: BulletShape,
  hue: string | undefined,
  r: number,
) {
  const fill = hueFill(hue);
  const baseAlpha = ctx.globalAlpha;

  // 大玉 orb: translucent interior + thick colored rim + gloss, no white core.
  if (shape === 'orb') {
    ctx.fillStyle = fill;
    ctx.globalAlpha = baseAlpha * 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = baseAlpha * 0.4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = baseAlpha;
    ctx.lineWidth = Math.max(2, r * 0.3);
    ctx.strokeStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = hueLight(hue);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.76, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.4, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 光珠 bead: glossy pearl with an off-center highlight, no center core.
  if (shape === 'bead') {
    ctx.fillStyle = fill;
    ctx.globalAlpha = baseAlpha * 0.25;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = baseAlpha;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(16,12,24,.55)';
    ctx.stroke();
    ctx.fillStyle = hueLight(hue);
    ctx.beginPath();
    ctx.arc(-r * 0.12, -r * 0.14, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.32, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.fillStyle = fill;
  ctx.globalAlpha = baseAlpha * 0.24;
  traceBulletShape(ctx, shape, r * 1.5);
  ctx.fill();

  ctx.globalAlpha = baseAlpha;
  traceBulletShape(ctx, shape, r);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(16,12,24,.55)';
  ctx.stroke();

  // Lighter inner tint reads as rim-lit volume, not a flat sticker.
  const elongated = shape === 'ellipse' || shape === 'rice';
  ctx.fillStyle = hueLight(hue);
  ctx.save();
  if (elongated) ctx.translate(0, -r * 0.12);
  traceBulletShape(ctx, shape, r * 0.74);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,.94)';
  if (elongated) {
    // Elongated shots carry their white core forward — the glowing head marks
    // the travel direction instead of a concentric pill.
    ctx.save();
    ctx.translate(0, -r * 0.34);
    traceBulletShape(ctx, shape, r * 0.46);
    ctx.fill();
    ctx.restore();
  } else {
    traceBulletShape(ctx, shape, r * 0.5);
    ctx.fill();
  }
}
