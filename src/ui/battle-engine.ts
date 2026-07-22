import type { BattleResult } from './types';

export interface BattleConfig {
  config_id: string;
  arena: { width: number; height: number };
  player: { lives: number; move_speed: number; focus_speed: number; hitbox_radius: number; invulnerability_ms: number; auto_fire: boolean; normal_shot: { damage: number; interval_ms: number }; focus_shot: { damage: number; interval_ms: number } };
  phases: Array<{ id: string; hp: number; duration_ms: number; patterns: Array<{ pattern_id: string; interval_ms: number; speed?: number; count?: number; arc_deg?: number; turn_rate_deg?: number; warning_ms?: number; duration_ms?: number }> }>;
}

interface Entity { x: number; y: number; vx: number; vy: number; radius: number; damage?: number; age?: number; homing?: boolean }

export class BattleEngine {
  private readonly ctx: CanvasRenderingContext2D;
  private player = { x: 240, y: 560, lives: 3, invulnerableUntil: 0 };
  private enemy = { x: 240, y: 100, hp: 1, maxHp: 1 };
  private playerShots: Entity[] = [];
  private enemyShots: Entity[] = [];
  private keys = new Set<string>();
  private phaseIndex = 0;
  private phaseStartedAt = 0;
  private startedAt = 0;
  private lastFrame = 0;
  private lastPlayerShot = 0;
  private patternTimes = new Map<string, number>();
  private raf = 0;
  private running = false;
  private grazed = new WeakSet<object>();
  private stats = { grazes: 0, hits: 0, damage: 0, phases: 0 };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly config: BattleConfig, private readonly onFinish: (result: BattleResult) => void) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 不可用');
    this.ctx = ctx;
    canvas.width = config.arena.width;
    canvas.height = config.arena.height;
    canvas.tabIndex = 0;
    canvas.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', () => canvas.focus());
  }

  start() {
    this.running = true;
    this.startedAt = performance.now();
    this.lastFrame = this.startedAt;
    this.beginPhase(0, this.startedAt);
    this.canvas.focus();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(outcome: BattleResult['outcome'] = 'narrative') {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    const duration = Math.round(performance.now() - this.startedAt);
    this.onFinish({
      settlement_id: `${this.config.config_id}-${Date.now().toString(36)}`,
      config_id: this.config.config_id,
      outcome,
      remaining_lives: Math.max(0, this.player.lives),
      grazes: this.stats.grazes,
      duration_ms: duration,
      hits: this.stats.hits,
      damage: this.stats.damage,
      phases_cleared: this.stats.phases,
      objective_ratio: Math.round(100 * (this.stats.phases + (1 - this.enemy.hp / this.enemy.maxHp)) / this.config.phases.length),
    });
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
  }

  private beginPhase(index: number, now: number) {
    const phase = this.config.phases[index];
    this.phaseIndex = index;
    this.phaseStartedAt = now;
    this.enemy.hp = phase.hp;
    this.enemy.maxHp = phase.hp;
    this.enemyShots = [];
    this.patternTimes.clear();
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const delta = Math.min(0.04, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.update(now, delta);
    this.draw(now);
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(now: number, delta: number) {
    const focused = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = focused ? this.config.player.focus_speed : this.config.player.move_speed;
    const dx = Number(this.keys.has('ArrowRight') || this.keys.has('KeyD')) - Number(this.keys.has('ArrowLeft') || this.keys.has('KeyA'));
    const dy = Number(this.keys.has('ArrowDown') || this.keys.has('KeyS')) - Number(this.keys.has('ArrowUp') || this.keys.has('KeyW'));
    const length = Math.hypot(dx, dy) || 1;
    this.player.x = Math.min(this.canvas.width - 14, Math.max(14, this.player.x + dx / length * speed * delta));
    this.player.y = Math.min(this.canvas.height - 14, Math.max(180, this.player.y + dy / length * speed * delta));

    const shot = focused ? this.config.player.focus_shot : this.config.player.normal_shot;
    if (now - this.lastPlayerShot >= shot.interval_ms) {
      this.lastPlayerShot = now;
      const offsets = focused ? [0] : [-10, 10];
      offsets.forEach((offset) => this.playerShots.push({ x: this.player.x + offset, y: this.player.y - 18, vx: 0, vy: -520, radius: 4, damage: shot.damage }));
    }

    const phase = this.config.phases[this.phaseIndex];
    phase.patterns.forEach((pattern) => {
      const last = this.patternTimes.get(pattern.pattern_id) ?? this.phaseStartedAt - pattern.interval_ms;
      if (now - last >= pattern.interval_ms) {
        this.patternTimes.set(pattern.pattern_id, now);
        this.spawnPattern(pattern);
      }
    });

    this.playerShots.forEach((bullet) => { bullet.x += bullet.vx * delta; bullet.y += bullet.vy * delta; });
    this.enemyShots.forEach((bullet) => {
      bullet.age = (bullet.age ?? 0) + delta;
      if (bullet.homing && (bullet.age ?? 0) < 1.8) {
        const targetAngle = Math.atan2(this.player.y - bullet.y, this.player.x - bullet.x);
        const currentSpeed = Math.hypot(bullet.vx, bullet.vy);
        bullet.vx += Math.cos(targetAngle) * currentSpeed * 0.55 * delta;
        bullet.vy += Math.sin(targetAngle) * currentSpeed * 0.55 * delta;
        const adjusted = Math.hypot(bullet.vx, bullet.vy) || 1;
        bullet.vx = bullet.vx / adjusted * currentSpeed;
        bullet.vy = bullet.vy / adjusted * currentSpeed;
      }
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
    });

    this.playerShots = this.playerShots.filter((bullet) => {
      if (Math.hypot(bullet.x - this.enemy.x, bullet.y - this.enemy.y) < bullet.radius + 28) {
        const damage = bullet.damage ?? 1;
        this.enemy.hp -= damage;
        this.stats.hits += 1;
        this.stats.damage += damage;
        return false;
      }
      return bullet.y > -20;
    });
    this.enemyShots = this.enemyShots.filter((bullet) => {
      const distance = Math.hypot(bullet.x - this.player.x, bullet.y - this.player.y);
      if (distance < bullet.radius + this.config.player.hitbox_radius && now >= this.player.invulnerableUntil) {
        this.player.lives -= 1;
        this.player.invulnerableUntil = now + this.config.player.invulnerability_ms;
        if (this.player.lives <= 0) this.stop('loss');
        return false;
      }
      if (distance < bullet.radius + 22 && !this.grazed.has(bullet)) {
        this.grazed.add(bullet);
        this.stats.grazes += 1;
      }
      return bullet.y < this.canvas.height + 30 && bullet.y > -30 && bullet.x > -30 && bullet.x < this.canvas.width + 30;
    });

    if (this.enemy.hp <= 0) {
      this.stats.phases += 1;
      if (this.phaseIndex + 1 >= this.config.phases.length) this.stop(this.player.lives === 3 ? 'clean_win' : 'narrow_win');
      else this.beginPhase(this.phaseIndex + 1, now);
    } else if (now - this.phaseStartedAt >= phase.duration_ms) {
      this.stats.phases += 1;
      if (this.phaseIndex + 1 >= this.config.phases.length) this.stop('narrow_win');
      else this.beginPhase(this.phaseIndex + 1, now);
    }
  }

  private spawnPattern(pattern: BattleConfig['phases'][number]['patterns'][number]) {
    const count = Math.min(32, Math.max(1, pattern.count ?? 8));
    const speed = Math.min(260, Math.max(40, pattern.speed ?? 100));
    if (pattern.pattern_id === 'petal_fan') {
      const base = Math.atan2(this.player.y - this.enemy.y, this.player.x - this.enemy.x);
      const arc = (pattern.arc_deg ?? 80) * Math.PI / 180;
      for (let i = 0; i < count; i += 1) {
        const angle = base - arc / 2 + arc * i / Math.max(1, count - 1);
        this.enemyShots.push({ x: this.enemy.x, y: this.enemy.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 7 });
      }
      return;
    }
    if (pattern.pattern_id === 'homing_leaf') {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.PI / 2 + (i - (count - 1) / 2) * 0.16;
        this.enemyShots.push({ x: this.enemy.x, y: this.enemy.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 7, homing: true });
      }
      return;
    }
    if (pattern.pattern_id === 'local_safe_zone') {
      const safeX = 70 + Math.random() * (this.canvas.width - 140);
      for (let x = 20; x < this.canvas.width; x += 28) {
        if (Math.abs(x - safeX) > 50) this.enemyShots.push({ x, y: -10, vx: 0, vy: speed * 1.5, radius: 8 });
      }
      return;
    }
    for (let i = 0; i < count; i += 1) {
      const angle = Math.PI * 2 * i / count;
      this.enemyShots.push({ x: this.enemy.x, y: this.enemy.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 7 });
    }
  }

  private draw(now: number) {
    const { ctx } = this;
    ctx.fillStyle = '#101528';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let y = 0; y < this.canvas.height; y += 32) ctx.fillRect(0, y, this.canvas.width, 1);

    ctx.beginPath();
    ctx.arc(this.enemy.x, this.enemy.y, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#b24b8d';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(40, 24, this.canvas.width - 80, 8);
    ctx.fillStyle = '#e06aa9';
    ctx.fillRect(40, 24, (this.canvas.width - 80) * Math.max(0, this.enemy.hp / this.enemy.maxHp), 8);

    ctx.fillStyle = '#b7e9ff';
    this.playerShots.forEach((bullet) => ctx.fillRect(bullet.x - 2, bullet.y - 9, 4, 14));
    ctx.fillStyle = '#ef8fbf';
    this.enemyShots.forEach((bullet) => { ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2); ctx.fill(); });

    const blink = now < this.player.invulnerableUntil && Math.floor(now / 90) % 2 === 0;
    if (!blink) {
      ctx.save();
      ctx.translate(this.player.x, this.player.y);
      ctx.fillStyle = '#f3d37a';
      ctx.beginPath();
      ctx.moveTo(0, -16); ctx.lineTo(12, 13); ctx.lineTo(0, 8); ctx.lineTo(-12, 13); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) {
      ctx.beginPath(); ctx.arc(this.player.x, this.player.y, this.config.player.hitbox_radius, 0, Math.PI * 2); ctx.fillStyle = '#ff3c55'; ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = '14px system-ui';
    ctx.fillText(`生命 ${Math.max(0, this.player.lives)}　擦弹 ${this.stats.grazes}　阶段 ${this.phaseIndex + 1}/${this.config.phases.length}`, 16, this.canvas.height - 18);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    this.keys.add(event.code);
  };
  private onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.buttons === 0) return;
    const rect = this.canvas.getBoundingClientRect();
    this.player.x = Math.min(this.canvas.width - 14, Math.max(14, (event.clientX - rect.left) / rect.width * this.canvas.width));
    this.player.y = Math.min(this.canvas.height - 14, Math.max(180, (event.clientY - rect.top) / rect.height * this.canvas.height));
  };
}
