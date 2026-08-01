export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface GardenMaskSampler {
  width: number;
  height: number;
  isBlocked(point: NormalizedPoint): boolean;
}

export const GARDEN_FOOTPRINT_RADIUS = Object.freeze({
  x: 12 / 1672,
  y: 7 / 941,
});

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

export function footprintSamples(
  point: NormalizedPoint,
  radius = GARDEN_FOOTPRINT_RADIUS,
): NormalizedPoint[] {
  return [
    point,
    { x: point.x - radius.x, y: point.y },
    { x: point.x + radius.x, y: point.y },
    { x: point.x, y: point.y - radius.y },
    { x: point.x, y: point.y + radius.y },
    { x: point.x - radius.x * .7, y: point.y - radius.y * .7 },
    { x: point.x + radius.x * .7, y: point.y - radius.y * .7 },
    { x: point.x - radius.x * .7, y: point.y + radius.y * .7 },
    { x: point.x + radius.x * .7, y: point.y + radius.y * .7 },
  ];
}

export function isFootprintBlocked(
  sampler: GardenMaskSampler,
  point: NormalizedPoint,
  radius = GARDEN_FOOTPRINT_RADIUS,
): boolean {
  return footprintSamples(point, radius).some((sample) => sampler.isBlocked(sample));
}

export function isRouteWalkable(
  sampler: GardenMaskSampler,
  start: NormalizedPoint,
  end: NormalizedPoint,
  radius = GARDEN_FOOTPRINT_RADIUS,
  sampleStepPixels = 8,
): boolean {
  const distancePixels = Math.hypot(
    (end.x - start.x) * sampler.width,
    (end.y - start.y) * sampler.height,
  );
  const steps = Math.max(1, Math.ceil(distancePixels / Math.max(1, sampleStepPixels)));
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    if (isFootprintBlocked(sampler, {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    }, radius)) return false;
  }
  return true;
}

export class GardenNavigationMask implements GardenMaskSampler {
  readonly image = new Image();
  width = 0;
  height = 0;
  ready = false;
  failed = false;
  private data: Uint8ClampedArray | null = null;

  constructor(
    source: string,
    private readonly expectedSize: readonly [number, number],
    onStateChanged: () => void,
  ) {
    this.image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = this.image.naturalWidth;
      canvas.height = this.image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context || canvas.width !== expectedSize[0] || canvas.height !== expectedSize[1]) {
        this.fail(onStateChanged);
        return;
      }
      try {
        context.drawImage(this.image, 0, 0);
        this.data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        this.width = canvas.width;
        this.height = canvas.height;
        this.ready = true;
        this.failed = false;
      } catch {
        this.fail(onStateChanged);
        return;
      }
      onStateChanged();
    };
    this.image.onerror = () => this.fail(onStateChanged);
    if (/^https:\/\//iu.test(source)) this.image.crossOrigin = 'anonymous';
    this.image.src = source;
  }

  isBlocked(point: NormalizedPoint): boolean {
    if (!this.ready || !this.data) return false;
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return true;
    const x = Math.min(this.width - 1, Math.floor(clampUnit(point.x) * this.width));
    const y = Math.min(this.height - 1, Math.floor(clampUnit(point.y) * this.height));
    return this.data[(y * this.width + x) * 4 + 3] >= 128;
  }

  isRouteWalkable(start: NormalizedPoint, end: NormalizedPoint): boolean {
    return !this.ready || isRouteWalkable(this, start, end);
  }

  private fail(onStateChanged: () => void) {
    this.ready = false;
    this.failed = true;
    this.data = null;
    onStateChanged();
  }
}
