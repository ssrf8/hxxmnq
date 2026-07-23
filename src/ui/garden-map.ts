import type { GardenState } from './types';
import { SpriteActor } from './sprite-actor';

interface Point { x: number; y: number }
export interface HitTarget extends Point { id: string; label: string; kind: 'area' | 'character'; radius: number }

const areaPositions: Record<string, Point> = {
  main_house: { x: 0.25, y: 0.28 },
  central_courtyard: { x: 0.48, y: 0.55 },
  greenhouse_plot: { x: 0.72, y: 0.35 },
  fairy_garden_plot: { x: 0.76, y: 0.68 },
  moon_spring_plot: { x: 0.28, y: 0.76 },
  banquet_plaza_plot: { x: 0.50, y: 0.82 },
};

export class GardenMap {
  private readonly context: CanvasRenderingContext2D;
  private state: GardenState = {};
  private background = new Image();
  private camera = { x: 0, y: 0, zoom: 1 };
  private targets: HitTarget[] = [];
  private dragging = false;
  private lastPointer: Point = { x: 0, y: 0 };
  private pointerOrigin: Point = { x: 0, y: 0 };
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly actors = new Map<string, SpriteActor>();
  private animationFrame = 0;
  private lastFrameTime = 0;
  private visible = !document.hidden;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    mapSource: string,
    reimuSpriteSource: string,
    private readonly onSelect: (target: HitTarget, anchor: Point) => void,
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D 不可用');
    this.context = context;
    this.background.onload = () => this.draw();
    this.background.src = mapSource;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.reducedMotion.addEventListener('change', this.onReducedMotionChanged);
    document.addEventListener('visibilitychange', this.onVisibilityChanged);
    this.actors.set('reimu', new SpriteActor('reimu', '博丽灵梦', reimuSpriteSource, () => this.draw()));
    this.resize();
    this.startAnimation();
  }

  update(state: GardenState) {
    this.state = state;
    const views = state.presence_snapshot?.character_views ?? {};
    this.actors.forEach((actor, id) => actor.sync(views[id], this.reducedMotion.matches));
    this.draw();
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.reducedMotion.removeEventListener('change', this.onReducedMotionChanged);
    document.removeEventListener('visibilitychange', this.onVisibilityChanged);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  private startAnimation() {
    cancelAnimationFrame(this.animationFrame);
    this.lastFrameTime = 0;
    if (!this.visible) return;
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  private animate = (time: number) => {
    const delta = this.lastFrameTime ? Math.min(50, time - this.lastFrameTime) : 16;
    this.lastFrameTime = time;
    const present = new Set(this.state.presence_snapshot?.present_character_ids ?? []);
    this.actors.forEach((actor, id) => {
      if (present.has(id)) actor.update(delta);
    });
    this.draw();
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private onVisibilityChanged = () => {
    this.visible = !document.hidden;
    if (this.visible) this.startAnimation();
    else cancelAnimationFrame(this.animationFrame);
  };

  private onReducedMotionChanged = () => {
    const views = this.state.presence_snapshot?.character_views ?? {};
    this.actors.forEach((actor, id) => actor.sync(views[id], this.reducedMotion.matches));
    this.draw();
  };

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.draw();
  }

  private draw() {
    const { context: ctx, canvas } = this;
    // Expose the effective camera scale for runtime diagnostics without
    // coupling callers to the GardenMap instance.
    canvas.dataset.zoom = this.camera.zoom.toFixed(3);
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2 + this.camera.x, height / 2 + this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    const imageRatio = this.background.naturalWidth / Math.max(1, this.background.naturalHeight);
    const canvasRatio = width / height;
    // Keep the world size independent from camera.zoom. Dividing these cover
    // dimensions by zoom would be cancelled by ctx.scale(), making the map
    // appear fixed while only marker strokes changed size.
    const drawWidth = canvasRatio > imageRatio ? width : height * imageRatio;
    const drawHeight = canvasRatio > imageRatio ? width / imageRatio : height;
    if (this.background.complete && this.background.naturalWidth) {
      ctx.drawImage(this.background, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    } else {
      ctx.fillStyle = '#a7c78c';
      ctx.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    }

    this.targets = [];
    const areas = this.state.areas ?? {};
    for (const [id, area] of Object.entries(areas)) {
      if (!area.unlocked) continue;
      const point = areaPositions[id];
      if (!point) continue;
      const x = -drawWidth / 2 + point.x * drawWidth;
      const y = -drawHeight / 2 + point.y * drawHeight;
      this.drawMarker(ctx, x, y, area.name ?? id, area.state ?? '未知', '#f3d58a');
      this.targets.push({ id, label: area.name ?? id, kind: 'area', x, y, radius: 25 });
    }

    // Only visiting characters are rendered. There is intentionally no player marker.
    const present = this.state.presence_snapshot?.present_character_ids ?? [];
    const views = this.state.presence_snapshot?.character_views ?? {};
    present.forEach((id, index) => {
      const view = views[id] ?? {};
      const base = areaPositions[view.area_id ?? 'central_courtyard'] ?? areaPositions.central_courtyard;
      const actor = this.actors.get(id);
      const actorOffset = actor?.offsetX ?? 0;
      const x = -drawWidth / 2 + (base.x + actorOffset) * drawWidth + (index % 3 - 1) * 38;
      const y = -drawHeight / 2 + base.y * drawHeight + 54 + Math.floor(index / 3) * 35;
      const label = this.state.characters?.[id]?.name ?? id;
      const drawnAsSprite = actor?.draw(ctx, x, y, Math.min(132, drawWidth * 0.12)) ?? false;
      if (!drawnAsSprite) {
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fillStyle = id === 'reimu' ? '#b82f36' : id === 'marisa' ? '#293246' : id === 'cirno' ? '#4a9fd8' : '#6c5c82';
      ctx.fill();
      ctx.strokeStyle = '#fff8df';
      ctx.lineWidth = 3;
      ctx.stroke();
      }
      ctx.font = '600 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#231d18';
      ctx.fillText(label, x, y + 36);
      this.targets.push({ id, label, kind: 'character', x, y, radius: drawnAsSprite ? 42 : 24 });
    });
    ctx.restore();
  }

  private drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, state: string, color: string) {
    ctx.beginPath();
    ctx.arc(x, y, 23, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#543f2a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = '600 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#211b16';
    ctx.fillText(label, x, y - 31);
    ctx.font = '12px system-ui';
    ctx.fillText(state, x, y + 4);
  }

  private eventPoint(event: PointerEvent | WheelEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  private onPointerDown = (event: PointerEvent) => {
    this.dragging = true;
    this.lastPointer = this.eventPoint(event);
    this.pointerOrigin = this.lastPointer;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.dragging) return;
    const point = this.eventPoint(event);
    this.camera.x += point.x - this.lastPointer.x;
    this.camera.y += point.y - this.lastPointer.y;
    this.lastPointer = point;
    this.draw();
  };

  private onPointerUp = (event: PointerEvent) => {
    const point = this.eventPoint(event);
    const movement = Math.hypot(point.x - this.pointerOrigin.x, point.y - this.pointerOrigin.y);
    this.dragging = false;
    if (movement > 8) return;
    const worldX = (point.x - this.canvas.width / 2 - this.camera.x) / this.camera.zoom;
    const worldY = (point.y - this.canvas.height / 2 - this.camera.y) / this.camera.zoom;
    const target = [...this.targets].reverse().find((item) => Math.hypot(item.x - worldX, item.y - worldY) <= item.radius);
    if (target) {
      const rect = this.canvas.getBoundingClientRect();
      this.onSelect(target, {
        x: Math.max(12, Math.min(rect.width - 12, event.clientX - rect.left)),
        y: Math.max(12, Math.min(rect.height - 12, event.clientY - rect.top)),
      });
    }
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (!event.deltaY) return;
    const point = this.eventPoint(event);
    const previousZoom = this.camera.zoom;
    const worldX = (point.x - this.canvas.width / 2 - this.camera.x) / previousZoom;
    const worldY = (point.y - this.canvas.height / 2 - this.camera.y) / previousZoom;
    const factor = Math.exp(-event.deltaY * 0.0015);
    const nextZoom = Math.min(2, Math.max(0.8, previousZoom * factor));
    if (nextZoom === previousZoom) return;
    this.camera.zoom = nextZoom;
    // Preserve the world coordinate currently under the pointer.
    this.camera.x = point.x - this.canvas.width / 2 - worldX * nextZoom;
    this.camera.y = point.y - this.canvas.height / 2 - worldY * nextZoom;
    this.draw();
  };
}
