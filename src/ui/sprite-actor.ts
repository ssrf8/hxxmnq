import type { CharacterView } from './types';

export type SpriteFacing = 'front' | 'back' | 'left' | 'right';
export type SpriteMotion = 'idle' | 'walk';
export type SpriteMovementStyle = 'walk' | 'hover' | 'flutter';
type ActorPhase = 'rest' | 'turn' | 'travel' | 'settle';

export interface SpriteFrameTransform {
  scale: number;
  x: number;
  y: number;
}

export interface SpriteSequenceConfig {
  source: string;
  columns: number;
  rows: 4;
  frameDurationMs: number;
  loopStart: number;
  loopEnd: number;
}

export interface SpriteActorConfig {
  label: string;
  idleSource: string;
  motionSource?: string;
  /** Optional 9×4 V2 atlas; it overrides legacy sheets once loaded. */
  animationSource?: string;
  /** Owner-approved variable-length atlas; falls back to V2/legacy sheets on load failure. */
  sequence?: SpriteSequenceConfig;
  movementStyle: SpriteMovementStyle;
  frameDurationMs: number;
  motionBob: number;
  motionSway: number;
  travelSpeed: number;
  travelRadius: number;
  travelRadiusY: number;
  travelDistanceMin: number;
  travelDistanceMax: number;
  restDurationMs: readonly [number, number];
  turnDurationMs: readonly [number, number];
  settleDurationMs: readonly [number, number];
  /** Per-facing visual fit from the turnaround cells to the approved motion frames. */
  idleFrameTransforms?: Record<SpriteFacing, SpriteFrameTransform>;
  /** Per-facing luminance correction applied only while a movement frame is rendered. */
  motionFrameBrightness?: Record<SpriteFacing, number>;
}

interface Point {
  x: number;
  y: number;
}

export interface WanderMove {
  facing: SpriteFacing;
  target: Point;
}

export type SpriteTravelValidator = (start: Point, target: Point) => boolean;

interface RenderFrame {
  image: HTMLImageElement;
  columns: number;
  rows: number;
  frame: number;
  row: number;
  animated: boolean;
  v2: boolean;
  transform?: SpriteFrameTransform;
  brightness?: number;
}

const facingCell: Record<SpriteFacing, Point> = {
  front: { x: 0, y: 0 },
  back: { x: 1, y: 0 },
  left: { x: 0, y: 1 },
  right: { x: 1, y: 1 },
};

const facingRow: Record<SpriteFacing, number> = {
  front: 0,
  back: 1,
  left: 2,
  right: 3,
};

const defaultFrameTransform: SpriteFrameTransform = { scale: 1, x: -0.5, y: -0.82 };

export function resolveSpriteDrawRect(size: number, transform = defaultFrameTransform) {
  return {
    x: size * transform.x,
    y: size * transform.y,
    width: size * transform.scale,
    height: size * transform.scale,
  };
}

const oppositeFacing: Record<SpriteFacing, SpriteFacing> = {
  front: 'back',
  back: 'front',
  left: 'right',
  right: 'left',
};

const clampRandom = (value: number) => Math.min(0.999999, Math.max(0, value));

export function chooseWanderMove(
  position: Point,
  radius: Point,
  minDistance: number,
  maxDistance: number,
  lastFacing: SpriteFacing | undefined,
  random: () => number = Math.random,
): WanderMove | null {
  const safeX = Math.max(0.000001, radius.x);
  const safeY = Math.max(0.000001, radius.y);
  const xLimit = safeX * Math.sqrt(Math.max(0, 1 - (position.y / safeY) ** 2));
  const yLimit = safeY * Math.sqrt(Math.max(0, 1 - (position.x / safeX) ** 2));
  const candidates = [
    { facing: 'left' as const, available: position.x + xLimit },
    { facing: 'right' as const, available: xLimit - position.x },
    { facing: 'back' as const, available: position.y + yLimit },
    { facing: 'front' as const, available: yLimit - position.y },
  ].filter((candidate) => candidate.available >= minDistance);
  if (!candidates.length) return null;
  const weighted = candidates.map((candidate) => ({
    ...candidate,
    weight: candidate.facing === lastFacing
      ? 1.1
      : lastFacing && candidate.facing === oppositeFacing[lastFacing] ? 0.35 : 1,
  }));
  const weightTotal = weighted.reduce((total, candidate) => total + candidate.weight, 0);
  let choice = clampRandom(random()) * weightTotal;
  const selected = weighted.find((candidate) => {
    choice -= candidate.weight;
    return choice < 0;
  }) ?? weighted[weighted.length - 1];
  const available = Math.min(selected.available, Math.max(minDistance, maxDistance));
  const distance = minDistance
    + clampRandom(random()) * Math.max(0, available - minDistance);
  const target = { ...position };
  if (selected.facing === 'left') target.x -= distance;
  if (selected.facing === 'right') target.x += distance;
  if (selected.facing === 'back') target.y -= distance;
  if (selected.facing === 'front') target.y += distance;
  return { facing: selected.facing, target };
}

export function resolveSequenceCell(
  sequence: Omit<SpriteSequenceConfig, 'source'>,
  motion: SpriteMotion,
  facing: SpriteFacing,
  animationTime: number,
  phaseOffset = 0,
) {
  if (motion === 'idle') return { frame: 0, row: facingRow[facing] };
  const loopLength = sequence.loopEnd - sequence.loopStart + 1;
  const elapsedFrame = Math.floor((animationTime + phaseOffset) / sequence.frameDurationMs);
  return {
    frame: sequence.loopStart + elapsedFrame % loopLength,
    row: facingRow[facing],
  };
}

export function resolveV2Cell(
  motion: SpriteMotion,
  facing: SpriteFacing,
  animationTime: number,
  frameDurationMs: number,
  phaseOffset = 0,
) {
  if (motion === 'idle') {
    if (facing === 'back') return { frame: 4, row: 0 };
    if (facing === 'front') return { frame: 0, row: 1 };
    return { frame: 0, row: facing === 'left' ? 2 : 3 };
  }
  const frame = Math.floor((animationTime + phaseOffset) / frameDurationMs);
  if (facing === 'back') return { frame: 5 + frame % 4, row: 0 };
  if (facing === 'front') return { frame: 1 + frame % 4, row: 1 };
  return { frame: 1 + frame % 8, row: facing === 'left' ? 2 : 3 };
}

const phaseFor = (id: string) => [...id]
  .reduce((value, character) => value * 31 + character.charCodeAt(0), 17) % 997;

export class SpriteActor {
  readonly idleImage = new Image();
  readonly motionImage = new Image();
  readonly animationImage = new Image();
  readonly sequenceImage = new Image();
  readonly id: string;
  readonly label: string;
  imageReady = false;
  imageFailed = false;
  motionImageReady = false;
  animationImageReady = false;
  sequenceImageReady = false;
  offsetX = 0;
  offsetY = 0;
  facing: SpriteFacing = 'front';
  motion: SpriteMotion = 'idle';
  private authoritativeFacing: SpriteFacing = 'front';
  private phase: ActorPhase = 'rest';
  private phaseRemaining = 0;
  private travelStart: Point = { x: 0, y: 0 };
  private travelTarget: Point = { x: 0, y: 0 };
  private travelElapsed = 0;
  private travelDuration = 1;
  private lastFacing: SpriteFacing | undefined;
  private areaId: string | undefined;
  private present = false;
  private animationTime = 0;
  private sequenceTime = 0;
  private reducedMotion = false;
  private readonly phaseOffset: number;

  constructor(
    id: string,
    private readonly config: SpriteActorConfig,
    onAssetStateChanged: () => void,
    private readonly random: () => number = Math.random,
    private readonly canTravel?: SpriteTravelValidator,
  ) {
    this.id = id;
    this.label = config.label;
    this.phaseOffset = phaseFor(id);
    this.idleImage.onload = () => {
      this.imageReady = true;
      this.imageFailed = false;
      onAssetStateChanged();
    };
    this.idleImage.onerror = () => {
      this.imageReady = false;
      this.imageFailed = true;
      onAssetStateChanged();
    };
    if (/^https:\/\//iu.test(config.idleSource)) this.idleImage.crossOrigin = 'anonymous';
    this.idleImage.src = config.idleSource;
    if (config.motionSource) {
      this.motionImage.onload = () => {
        this.motionImageReady = true;
        onAssetStateChanged();
      };
      this.motionImage.onerror = () => {
        this.motionImageReady = false;
        onAssetStateChanged();
      };
      if (/^https:\/\//iu.test(config.motionSource)) this.motionImage.crossOrigin = 'anonymous';
      this.motionImage.src = config.motionSource;
    }
    if (config.animationSource) {
      this.animationImage.onload = () => {
        this.animationImageReady = true;
        onAssetStateChanged();
      };
      this.animationImage.onerror = () => {
        this.animationImageReady = false;
        onAssetStateChanged();
      };
      if (/^https:\/\//iu.test(config.animationSource)) this.animationImage.crossOrigin = 'anonymous';
      this.animationImage.src = config.animationSource;
    }
    if (config.sequence) {
      this.sequenceImage.onload = () => {
        this.sequenceImageReady = true;
        onAssetStateChanged();
      };
      this.sequenceImage.onerror = () => {
        this.sequenceImageReady = false;
        onAssetStateChanged();
      };
      if (/^https:\/\//iu.test(config.sequence.source)) this.sequenceImage.crossOrigin = 'anonymous';
      this.sequenceImage.src = config.sequence.source;
    }
  }

  sync(view: CharacterView | undefined, reducedMotion: boolean, present = true) {
    const wasPresent = this.present;
    const areaChanged = Boolean(view?.area_id && view.area_id !== this.areaId);
    this.present = present;
    this.reducedMotion = reducedMotion;
    if (view?.facing) this.authoritativeFacing = view.facing;
    if (view?.area_id) this.areaId = view.area_id;
    if (!present || reducedMotion || !wasPresent || areaChanged) this.resetAtAnchor();
  }

  update(deltaMs: number) {
    if (!this.present || this.reducedMotion) return;
    this.animationTime += deltaMs;
    if (this.phase === 'rest') {
      this.phaseRemaining -= deltaMs;
      if (this.phaseRemaining <= 0) this.prepareTravel();
      return;
    }
    if (this.phase === 'turn') {
      this.phaseRemaining -= deltaMs;
      if (this.phaseRemaining <= 0) {
        this.phase = 'travel';
        this.motion = 'walk';
        this.sequenceTime = 0;
      }
      return;
    }
    if (this.phase === 'travel') {
      this.sequenceTime += deltaMs;
      this.travelElapsed = Math.min(this.travelDuration, this.travelElapsed + deltaMs);
      const progress = this.travelElapsed / this.travelDuration;
      this.offsetX = this.travelStart.x + (this.travelTarget.x - this.travelStart.x) * progress;
      this.offsetY = this.travelStart.y + (this.travelTarget.y - this.travelStart.y) * progress;
      if (progress < 1) return;
      this.phase = 'settle';
      this.motion = 'idle';
      this.phaseRemaining = this.randomBetween(this.config.settleDurationMs);
      return;
    }
    this.phaseRemaining -= deltaMs;
    if (this.phaseRemaining <= 0) {
      this.phase = 'rest';
      this.phaseRemaining = this.randomBetween(this.config.restDurationMs);
    }
  }

  private resetAtAnchor() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.facing = this.authoritativeFacing;
    this.motion = 'idle';
    this.phase = 'rest';
    this.phaseRemaining = this.randomBetween(this.config.restDurationMs);
    this.travelElapsed = 0;
    this.sequenceTime = 0;
    this.lastFacing = undefined;
  }

  private prepareTravel() {
    const start = { x: this.offsetX, y: this.offsetY };
    let move: WanderMove | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = chooseWanderMove(
        start,
        { x: this.config.travelRadius, y: this.config.travelRadiusY },
        this.config.travelDistanceMin,
        this.config.travelDistanceMax,
        this.lastFacing,
        this.random,
      );
      if (!candidate) break;
      if (!this.canTravel || this.canTravel(start, candidate.target)) {
        move = candidate;
        break;
      }
    }
    if (!move) {
      this.phaseRemaining = this.randomBetween(this.config.restDurationMs);
      return;
    }
    this.travelStart = { x: this.offsetX, y: this.offsetY };
    this.travelTarget = move.target;
    this.travelElapsed = 0;
    this.travelDuration = Math.max(
      1,
      Math.hypot(move.target.x - this.offsetX, move.target.y - this.offsetY) / this.config.travelSpeed,
    );
    this.facing = move.facing;
    this.lastFacing = move.facing;
    this.motion = 'idle';
    this.phase = 'turn';
    this.phaseRemaining = this.randomBetween(this.config.turnDurationMs);
  }

  private randomBetween(range: readonly [number, number]) {
    const [minimum, maximum] = range;
    if (maximum <= minimum) return minimum;
    return minimum + clampRandom(this.random()) * Math.max(0, maximum - minimum);
  }

  /**
   * 轮廓发光：把当前帧染色到共享暂存画布，再以模糊叠加垫在本体之下，
   * 使高亮精确贴合人物剪影（含透明像素之外的轮廓），替代圆环占位。
   */
  drawOutlineGlow(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
    intensity: number,
  ): boolean {
    const renderFrame = this.resolveRenderFrame();
    if (!renderFrame) return false;
    const { image, columns, rows, frame, row, animated, v2, transform } = renderFrame;
    const sourceWidth = image.naturalWidth / columns;
    const sourceHeight = image.naturalHeight / rows;
    const destination = resolveSpriteDrawRect(size, transform);
    const scratch = SpriteActor.glowScratch ?? (SpriteActor.glowScratch = document.createElement('canvas'));
    const pad = Math.ceil(size * 0.25);
    const scratchSize = Math.ceil(size + pad * 2);
    if (scratch.width !== scratchSize || scratch.height !== scratchSize) {
      scratch.width = scratchSize;
      scratch.height = scratchSize;
    }
    const scratchContext = scratch.getContext('2d');
    if (!scratchContext) return false;
    scratchContext.clearRect(0, 0, scratchSize, scratchSize);
    scratchContext.imageSmoothingEnabled = false;
    scratchContext.drawImage(
      image,
      frame * sourceWidth,
      row * sourceHeight,
      sourceWidth,
      sourceHeight,
      pad + destination.x + size / 2,
      pad + destination.y + size * 0.82,
      destination.width,
      destination.height,
    );
    scratchContext.globalCompositeOperation = 'source-in';
    scratchContext.fillStyle = color;
    scratchContext.fillRect(0, 0, scratchSize, scratchSize);
    scratchContext.globalCompositeOperation = 'source-over';
    // 与 draw() 同步的浮动/摆动，使光晕严格跟随本体。
    const motionCycle = (this.animationTime + this.phaseOffset) / this.config.frameDurationMs;
    const bob = this.reducedMotion || !animated || v2
      ? 0
      : Math.sin(motionCycle * Math.PI) * this.config.motionBob;
    const sway = this.reducedMotion || !animated || v2
      ? 0
      : Math.sin(motionCycle * Math.PI * 0.5) * this.config.motionSway;
    context.save();
    context.translate(x, y + bob);
    context.rotate(sway);
    context.globalAlpha = intensity;
    context.filter = `blur(${Math.max(2, size * 0.05)}px)`;
    context.drawImage(scratch, -size / 2 - pad, -size * 0.82 - pad);
    context.drawImage(scratch, -size / 2 - pad, -size * 0.82 - pad);
    context.filter = 'none';
    context.restore();
    return true;
  }

  private static glowScratch: HTMLCanvasElement | null = null;

  draw(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): boolean {
    const renderFrame = this.resolveRenderFrame();
    if (!renderFrame) return false;
    const { image, columns, rows, frame, row, animated, v2, transform, brightness } = renderFrame;
    const sourceWidth = image.naturalWidth / columns;
    const sourceHeight = image.naturalHeight / rows;
    const destination = resolveSpriteDrawRect(size, transform);
    const motionCycle = (this.animationTime + this.phaseOffset) / this.config.frameDurationMs;
    const bob = this.reducedMotion || !animated || v2
      ? 0
      : Math.sin(motionCycle * Math.PI) * this.config.motionBob;
    const sway = this.reducedMotion || !animated || v2
      ? 0
      : Math.sin(motionCycle * Math.PI * 0.5) * this.config.motionSway;
    context.save();
    context.translate(x, y + bob);
    context.rotate(sway);
    context.imageSmoothingEnabled = false;
    context.filter = brightness === undefined ? 'none' : `brightness(${brightness})`;
    context.drawImage(
      image,
      frame * sourceWidth,
      row * sourceHeight,
      sourceWidth,
      sourceHeight,
      destination.x,
      destination.y,
      destination.width,
      destination.height,
    );
    context.restore();
    return true;
  }

  private resolveRenderFrame(): RenderFrame | null {
    // Rest, turn and settle all use the dedicated four-facing turnaround sheet.
    // Approved motion sequences remain a fallback when that static asset fails.
    if (this.motion === 'idle' && this.imageReady && this.idleImage.naturalWidth > 0) {
      return {
        image: this.idleImage,
        columns: 2,
        rows: 2,
        frame: facingCell[this.facing].x,
        row: facingCell[this.facing].y,
        animated: false,
        v2: false,
        transform: this.config.idleFrameTransforms?.[this.facing],
      };
    }
    if (this.config.sequence && this.sequenceImageReady && this.sequenceImage.naturalWidth > 0) {
      const cell = resolveSequenceCell(
        this.config.sequence,
        this.motion,
        this.facing,
        this.sequenceTime,
      );
      return {
        image: this.sequenceImage,
        columns: this.config.sequence.columns,
        rows: this.config.sequence.rows,
        frame: cell.frame,
        row: cell.row,
        animated: this.motion === 'walk',
        v2: true,
        brightness: this.motion === 'walk' ? this.config.motionFrameBrightness?.[this.facing] : undefined,
      };
    }
    if (this.animationImageReady && this.animationImage.naturalWidth > 0) {
      const cell = resolveV2Cell(
        this.motion,
        this.facing,
        this.animationTime,
        this.config.frameDurationMs,
        this.phaseOffset,
      );
      return {
        image: this.animationImage,
        columns: 9,
        rows: 4,
        frame: cell.frame,
        row: cell.row,
        animated: this.motion === 'walk',
        v2: true,
        brightness: this.motion === 'walk' ? this.config.motionFrameBrightness?.[this.facing] : undefined,
      };
    }
    if (!this.imageReady || !this.idleImage.naturalWidth) return null;
    const useMotionSheet = this.motion === 'walk' && this.motionImageReady && this.motionImage.naturalWidth > 0;
    return {
      image: useMotionSheet ? this.motionImage : this.idleImage,
      columns: useMotionSheet ? 4 : 2,
      rows: useMotionSheet ? 4 : 2,
      frame: useMotionSheet ? Math.floor((this.animationTime + this.phaseOffset) / this.config.frameDurationMs) % 4 : facingCell[this.facing].x,
      row: useMotionSheet ? facingRow[this.facing] : facingCell[this.facing].y,
      animated: useMotionSheet,
      v2: false,
      brightness: useMotionSheet ? this.config.motionFrameBrightness?.[this.facing] : undefined,
    };
  }
}
