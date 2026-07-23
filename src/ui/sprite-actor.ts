import type { CharacterView } from './types';

export type SpriteFacing = 'front' | 'back' | 'left' | 'right';
export type SpriteMotion = 'idle' | 'walk';

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

export class SpriteActor {
  readonly image = new Image();
  readonly id: string;
  readonly label: string;
  imageReady = false;
  imageFailed = false;
  offsetX = 0;
  facing: SpriteFacing = 'front';
  motion: SpriteMotion = 'idle';
  private direction: -1 | 1 = 1;
  private idleRemaining = 700;
  private animationTime = 0;
  private reducedMotion = false;

  constructor(id: string, label: string, source: string, onAssetStateChanged: () => void) {
    this.id = id;
    this.label = label;
    this.image.onload = () => {
      this.imageReady = true;
      this.imageFailed = false;
      onAssetStateChanged();
    };
    this.image.onerror = () => {
      this.imageReady = false;
      this.imageFailed = true;
      onAssetStateChanged();
    };
    this.image.src = source;
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
    this.offsetX += this.direction * deltaMs * 0.000018;
    if (Math.abs(this.offsetX) < 0.038) return;
    this.offsetX = Math.sign(this.offsetX) * 0.038;
    this.direction = this.direction > 0 ? -1 : 1;
    this.motion = 'idle';
    this.idleRemaining = 900;
    this.facing = this.direction > 0 ? 'right' : 'left';
  }

  draw(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): boolean {
    if (!this.imageReady || !this.image.naturalWidth) return false;
    const cell = facingCell[this.facing];
    const sourceWidth = this.image.naturalWidth / 2;
    const sourceHeight = this.image.naturalHeight / 2;
    const cycle = this.animationTime / (this.motion === 'walk' ? 115 : 460);
    const bob = this.reducedMotion ? 0 : Math.sin(cycle) * (this.motion === 'walk' ? 3.2 : 1.1);
    const sway = this.reducedMotion || this.motion === 'idle' ? 0 : Math.sin(cycle * 0.5) * 0.035;
    const squash = this.reducedMotion ? 1 : 1 + Math.sin(cycle) * (this.motion === 'walk' ? 0.025 : 0.008);
    context.save();
    context.translate(x, y + bob);
    context.rotate(sway);
    context.scale(1, squash);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      this.image,
      cell.x * sourceWidth,
      cell.y * sourceHeight,
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
