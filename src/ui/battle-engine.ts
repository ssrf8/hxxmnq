import type { BattleResult } from './types';
import type { BattleConfig } from '../battle/battle-types';
import { FIXED_STEP_MS, MAX_CATCH_UP_STEPS } from '../battle/battle-types';
import { createBattleInput, type BattleInputController } from '../battle/battle-input';
import { nullSoundBus } from '../battle/battle-sound';
import { BattleSimulation } from '../battle/battle-simulation';
import { renderBattleFrame } from '../battle/battle-renderer';
import {
  loadBattleAtlas,
  type BattleAtlas,
  type BattleAtlasSources,
} from '../battle/battle-atlas';

export type { BattleConfig } from '../battle/battle-types';

export interface BattleEngineOptions {
  /** Optional transparent sheet sources (data: URL or relative path). */
  atlasSources?: BattleAtlasSources;
}

/**
 * Public facade kept stable for app.ts:
 *   new BattleEngine(canvas, config, onFinish, options?)
 *   start() / destroy()
 */
export class BattleEngine {
  /** Backing-store supersample factor; logic/coords stay in arena units. */
  static readonly RENDER_SCALE = 2;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: BattleInputController;
  private readonly sim: BattleSimulation;
  private atlas: BattleAtlas | null = null;
  private raf = 0;
  private running = false;
  private destroyed = false;
  private finishedOnce = false;
  private accumulator = 0;
  private lastFrame = 0;
  private drawAccumulator = 0;
  /** Visual-only cadence; simulation always uses FIXED_STEP_MS. */
  private drawIntervalMs = 1000 / 60;
  private slowFrameStreak = 0;
  private visibilityHandler: (() => void) | null = null;
  private readonly onFinish: (result: BattleResult) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    config: BattleConfig,
    onFinish: (result: BattleResult) => void,
    options?: BattleEngineOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 不可用');
    this.ctx = ctx;
    this.onFinish = onFinish;
    // 2× supersampled backing store: the CSS box upscales the arena (~1.5×+),
    // so rendering at logic resolution reads blurry. Simulation, collision and
    // pointer coordinates all stay in config.arena units — only pixels change.
    canvas.width = config.arena.width * BattleEngine.RENDER_SCALE;
    canvas.height = config.arena.height * BattleEngine.RENDER_SCALE;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    if (!canvas.getAttribute('aria-label')) {
      canvas.setAttribute('aria-label', '符卡游戏区域，方向键或 WASD 移动，按住 Z 射击，Shift 专注，X Bomb，Esc 暂停');
    }

    this.sim = new BattleSimulation(config, {
      onFinish: (result) => this.emitFinish(result),
      // Single wiring point for audio: swap nullSoundBus for a real WebAudio
      // bus once assets exist (spec: project/r49-placeholder-asset-spec.md).
      sfx: (id) => nullSoundBus.play(id),
    });
    this.input = createBattleInput(canvas, {
      autoFire: config.player.auto_fire,
      logicalWidth: config.arena.width,
      logicalHeight: config.arena.height,
    });
    this.input.attach();

    this.visibilityHandler = () => {
      if (document.hidden) {
        this.sim.pause();
        this.accumulator = 0;
        this.lastFrame = performance.now();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // Non-blocking atlas load — geometric fallback until ready / on failure.
    if (options?.atlasSources) {
      void loadBattleAtlas(options.atlasSources).then((atlas) => {
        if (!this.destroyed) this.atlas = atlas;
      });
    }
  }

  start() {
    if (this.destroyed || this.finishedOnce) return;
    if (this.running) return;
    this.running = true;
    this.sim.start();
    this.accumulator = 0;
    this.drawAccumulator = 0;
    this.drawIntervalMs = 1000 / 60;
    this.slowFrameStreak = 0;
    this.lastFrame = performance.now();
    this.canvas.focus();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Hold-to-focus for on-screen / touch controls. */
  setFocusHeld(held: boolean) {
    this.input.setExternalFocus(held);
  }

  /** Rising-edge Bomb for on-screen button. */
  requestBomb() {
    this.input.requestBomb();
  }

  /** Lightweight HUD values for external touch labels. */
  getTouchHud() {
    const snap = this.sim.snapshot();
    return {
      bombs: snap.player.bombs,
      lives: snap.player.lives,
      focused: snap.player.focused,
      paused: snap.paused,
      finished: this.finishedOnce || snap.mode === 'finished',
    };
  }

  /** @deprecated Prefer destroy() for cancel; kept for any residual callers. Does not finish. */
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.input.detach();
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (!this.finishedOnce) this.sim.cancelWithoutResult();
  }

  private emitFinish(result: BattleResult) {
    if (this.finishedOnce || this.destroyed) return;
    this.finishedOnce = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onFinish(result);
  }

  private frame = (now: number) => {
    if (!this.running || this.destroyed || this.finishedOnce) return;

    if (this.input.consumePausePressed()) {
      this.sim.togglePause();
      this.accumulator = 0;
      this.drawAccumulator = 0;
      this.lastFrame = now;
    }

    const rawDelta = Math.max(0, now - this.lastFrame);
    this.lastFrame = now;

    // Visual-only adaptive draw rate. Never slows the fixed simulation clock.
    if (rawDelta > 28) this.slowFrameStreak += 1;
    else this.slowFrameStreak = Math.max(0, this.slowFrameStreak - 1);
    if (this.slowFrameStreak >= 8) this.drawIntervalMs = 1000 / 30;
    else if (this.slowFrameStreak === 0) this.drawIntervalMs = 1000 / 60;

    if (document.hidden || this.sim.getMode() === 'paused') {
      this.accumulator = 0;
      this.drawAccumulator = 0;
      renderBattleFrame(this.ctx, this.sim, this.atlas);
      this.raf = requestAnimationFrame(this.frame);
      return;
    }

    this.accumulator += rawDelta;
    let steps = 0;
    const bombPressed = this.input.consumeBombPressed();
    let bombForStep = bombPressed;
    while (this.accumulator >= FIXED_STEP_MS && steps < MAX_CATCH_UP_STEPS) {
      this.sim.step(this.input.state, bombForStep);
      bombForStep = false;
      this.accumulator -= FIXED_STEP_MS;
      steps += 1;
      if (this.finishedOnce) break;
    }
    if (steps >= MAX_CATCH_UP_STEPS) this.accumulator = 0;

    this.drawAccumulator += rawDelta;
    if (this.drawAccumulator >= this.drawIntervalMs || steps > 0 && this.drawAccumulator >= this.drawIntervalMs * 0.5) {
      this.drawAccumulator = 0;
      renderBattleFrame(this.ctx, this.sim, this.atlas);
    }
    if (!this.finishedOnce && this.running) this.raf = requestAnimationFrame(this.frame);
  };
}
