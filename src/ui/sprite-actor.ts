import type { CharacterView } from './types';

export type SpriteFacing = 'front' | 'back' | 'left' | 'right';
export type SpriteMotion = 'idle' | 'walk';
export type SpriteMovementStyle = 'walk' | 'hover' | 'flutter';

export interface SpriteActorConfig {
  label: string;
  idleSource: string;
  motionSource?: string;
  movementStyle: SpriteMovementStyle;
  frameDurationMs: number;
  idleBob: number;
  motionBob: number;
  motionSway: number;
  travelSpeed: number;
  travelRadius: number;
}

interface Point {
  x: number;
  y: number;
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

const phaseFor = (id: string) => [...id]
  .reduce((value, character) => value * 31 + character.charCodeAt(0), 17) % 997;

export class SpriteActor {
  readonly idleImage = new Image();
  readonly motionImage = new Image();
  readonly id: string;
  readonly label: string;
  imageReady = false;
  imageFailed = false;
  motionImageReady = false;
  offsetX = 0;
  facing: SpriteFacing = 'front';
  motion: SpriteMotion = 'idle';
  private direction: -1 | 1 = 1;
  private idleRemaining = 700;
  private animationTime = 0;
  private reducedMotion = false;
  private readonly phaseOffset: number;

  constructor(
    id: string,
    private readonly config: SpriteActorConfig,
    onAssetStateChanged: () => void,
  ) {
    this.id = id;
    this.label = config.label;
    this.phaseOffset = phaseFor(id);
    this.idleRemaining += this.phaseOffset % 520;
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
      this.motionImage.src = config.motionSource;
    }
  }

  sync(view: CharacterView | undefined, reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    if (view?.facing) this.facing = view.facing;
    if (reducedMotion) {
      this.motion = 'idle';
      this.offsetX = 0;
    }
  }

  update(deltaMs: number) {
    this.animationTime += deltaMs;
    if (this.reducedMotion) return;
    if (this.motion === 'idle') {
      this.idleRemaining -= deltaMs;
      if (this.idleRemaining <= 0) {
        this.motion = 'walk';
        this.facing = this.direction > 0 ? 'right' : 'left';
      }
      return;
    }
    this.offsetX += this.direction * deltaMs * this.config.travelSpeed;
    if (Math.abs(this.offsetX) < this.config.travelRadius) return;
    this.offsetX = Math.sign(this.offsetX) * this.config.travelRadius;
    this.direction = this.direction > 0 ? -1 : 1;
    this.motion = 'idle';
    this.idleRemaining = 760 + this.phaseOffset % 460;
    this.facing = this.direction > 0 ? 'right' : 'left';
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
    if (!this.imageReady || !this.idleImage.naturalWidth) return false;
    const useMotionSheet = this.motion === 'walk'
      && this.motionImageReady
      && this.motionImage.naturalWidth > 0;
    const image = useMotionSheet ? this.motionImage : this.idleImage;
    const columns = useMotionSheet ? 4 : 2;
    const rows = useMotionSheet ? 4 : 2;
    const frame = useMotionSheet
      ? Math.floor((this.animationTime + this.phaseOffset) / this.config.frameDurationMs) % 4
      : facingCell[this.facing].x;
    const row = useMotionSheet ? facingRow[this.facing] : facingCell[this.facing].y;
    const sourceWidth = image.naturalWidth / columns;
    const sourceHeight = image.naturalHeight / rows;
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
      pad,
      pad,
      size,
      size,
    );
    scratchContext.globalCompositeOperation = 'source-in';
    scratchContext.fillStyle = color;
    scratchContext.fillRect(0, 0, scratchSize, scratchSize);
    scratchContext.globalCompositeOperation = 'source-over';
    // 与 draw() 同步的浮动/摆动，使光晕严格跟随本体。
    const idleCycle = (this.animationTime + this.phaseOffset) / 470;
    const motionCycle = (this.animationTime + this.phaseOffset) / this.config.frameDurationMs;
    const bob = this.reducedMotion
      ? 0
      : Math.sin(useMotionSheet ? motionCycle * Math.PI : idleCycle)
        * (useMotionSheet ? this.config.motionBob : this.config.idleBob);
    const sway = this.reducedMotion || !useMotionSheet
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
    if (!this.imageReady || !this.idleImage.naturalWidth) return false;
    const useMotionSheet = this.motion === 'walk'
      && this.motionImageReady
      && this.motionImage.naturalWidth > 0;
    const image = useMotionSheet ? this.motionImage : this.idleImage;
    const columns = useMotionSheet ? 4 : 2;
    const rows = useMotionSheet ? 4 : 2;
    const frame = useMotionSheet
      ? Math.floor((this.animationTime + this.phaseOffset) / this.config.frameDurationMs) % 4
      : facingCell[this.facing].x;
    const row = useMotionSheet ? facingRow[this.facing] : facingCell[this.facing].y;
    const sourceWidth = image.naturalWidth / columns;
    const sourceHeight = image.naturalHeight / rows;
    const idleCycle = (this.animationTime + this.phaseOffset) / 470;
    const motionCycle = (this.animationTime + this.phaseOffset) / this.config.frameDurationMs;
    const bob = this.reducedMotion
      ? 0
      : Math.sin(useMotionSheet ? motionCycle * Math.PI : idleCycle)
        * (useMotionSheet ? this.config.motionBob : this.config.idleBob);
    const sway = this.reducedMotion || !useMotionSheet
      ? 0
      : Math.sin(motionCycle * Math.PI * 0.5) * this.config.motionSway;
    const idleBreath = this.reducedMotion || useMotionSheet
      ? 1
      : 1 + Math.sin(idleCycle) * 0.007;
    context.save();
    context.translate(x, y + bob);
    context.rotate(sway);
    context.scale(1, idleBreath);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      frame * sourceWidth,
      row * sourceHeight,
      sourceWidth,
      sourceHeight,
      -size / 2,
      -size * 0.82,
      size,
      size,
    );
    context.restore();
    return true;
  }
}
