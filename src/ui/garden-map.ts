import type { GardenState } from './types';
import { SpriteActor, type SpriteActorConfig } from './sprite-actor';
import { greenhouseDiscoveryVisible } from './greenhouse-rules';
import { GARDEN_AREA_OUTLINES, GARDEN_AREA_POSITIONS, gardenAreaPoint } from './garden-spatial';

interface Point { x: number; y: number }
export interface HitTarget extends Point { id: string; label: string; kind: 'area' | 'character'; radius: number }

const areaPositions = GARDEN_AREA_POSITIONS;

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
  private pixelRatio = 1;
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private frameClock = 0;
  private lastAnchor: Point | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    mapSource: string,
    actorSprites: Record<string, SpriteActorConfig>,
    private readonly onSelect: (target: HitTarget, anchor: Point) => void,
    private readonly onSelectedAnchorMoved?: (anchor: Point) => void,
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
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.reducedMotion.addEventListener('change', this.onReducedMotionChanged);
    document.addEventListener('visibilitychange', this.onVisibilityChanged);
    Object.entries(actorSprites).forEach(([id, actor]) => {
      this.actors.set(id, new SpriteActor(id, actor, () => this.draw()));
    });
    this.resize();
    this.startAnimation();
  }

  update(state: GardenState) {
    this.state = state;
    const views = state.presence_snapshot?.character_views ?? {};
    this.actors.forEach((actor, id) => actor.sync(views[id], this.reducedMotion.matches));
    this.draw();
  }

  setSelected(id: string | null) {
    if (this.selectedId === id) return;
    this.selectedId = id;
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
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
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
    this.frameClock = time;
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
    this.pixelRatio = ratio;
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
    // Pixel-art assets must stay crisp when the backing store is scaled.
    ctx.imageSmoothingEnabled = false;
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
    const px = this.pixelRatio;
    const areas = this.state.areas ?? {};
    for (const [id, area] of Object.entries(areas)) {
      const discoveryMarker = id === 'greenhouse_plot'
        && !area.unlocked
        && greenhouseDiscoveryVisible(this.state);
      if (!area.unlocked && !discoveryMarker) continue;
      const point = areaPositions[id];
      if (!point) continue;
      const x = -drawWidth / 2 + point.x * drawWidth;
      const y = -drawHeight / 2 + point.y * drawHeight;
      const label = discoveryMarker ? '温室方向的异常痕迹' : area.name ?? id;
      const markerState = discoveryMarker ? '待调查' : area.state ?? '未知';
      // 悬停/选中前只留一枚低调的菱形路标；有实景轮廓的区域沿底图
      // 手描多边形描边发光，空地块回退贴地光环。
      const active = this.hoveredId === id || this.selectedId === id;
      const accent = discoveryMarker ? '#d9b9e8' : '#f3c86c';
      const outline = GARDEN_AREA_OUTLINES[id];
      const pulse = this.reducedMotion.matches || this.selectedId === id
        ? .95
        : 0.6 + 0.4 * Math.abs(Math.sin(this.frameClock / 420));
      let hitRadius = Math.max(drawWidth * 0.15, drawHeight * 0.12) / 2;
      if (active && outline) {
        const worldPoints = outline.map((point) => ({
          x: -drawWidth / 2 + point.x * drawWidth,
          y: -drawHeight / 2 + point.y * drawHeight,
        }));
        this.drawAreaOutlineGlow(ctx, worldPoints, accent, pulse);
        const topY = Math.min(...worldPoints.map((point) => point.y));
        this.drawLabel(ctx, x, topY - 16 * px, `${label} · ${markerState}`);
      } else if (active) {
        this.drawGroundGlow(ctx, x, y, drawWidth * 0.085, drawHeight * 0.05, pulse);
        this.drawLabel(ctx, x, y - drawHeight * 0.05 - 18 * px, `${label} · ${markerState}`);
      } else {
        this.drawDiamond(ctx, x, y, 7 * px, discoveryMarker ? '#d9b9e8' : '#f3d58a');
      }
      let hitX = x;
      let hitY = y;
      if (outline) {
        const xs = outline.map((point) => point.x);
        const ys = outline.map((point) => point.y);
        hitRadius = Math.max(
          (Math.max(...xs) - Math.min(...xs)) * drawWidth,
          (Math.max(...ys) - Math.min(...ys)) * drawHeight,
        ) / 2;
        // 命中圆与跟随锚点使用轮廓包围盒中心，菜单钉在建筑视觉中心。
        hitX = -drawWidth / 2 + ((Math.min(...xs) + Math.max(...xs)) / 2) * drawWidth;
        hitY = -drawHeight / 2 + ((Math.min(...ys) + Math.max(...ys)) / 2) * drawHeight;
      }
      this.targets.push({ id, label, kind: 'area', x: hitX, y: hitY, radius: hitRadius });
    }

    // Only visiting characters are rendered. There is intentionally no player marker.
    const present = this.state.presence_snapshot?.present_character_ids ?? [];
    const views = this.state.presence_snapshot?.character_views ?? {};
    present.forEach((id, index) => {
      const view = views[id] ?? {};
      const base = gardenAreaPoint(view.area_id);
      const actor = this.actors.get(id);
      const actorOffset = actor?.offsetX ?? 0;
      const x = -drawWidth / 2 + (base.x + actorOffset) * drawWidth + (index % 3 - 1) * 38 * px;
      const y = -drawHeight / 2 + base.y * drawHeight + 54 * px + Math.floor(index / 3) * 35 * px;
      const label = this.state.characters?.[id]?.name ?? id;
      const spriteSize = Math.min(132 * px, drawWidth * 0.12);
      const characterActive = this.hoveredId === id || this.selectedId === id;
      // 轮廓发光：染色剪影垫底，精确贴合人物形状；无 sprite 时回退圆环。
      let glowDrawn = false;
      if (characterActive && actor) {
        const glowPulse = this.reducedMotion.matches || this.selectedId === id
          ? .85
          : .5 + .35 * Math.abs(Math.sin(this.frameClock / 300));
        glowDrawn = actor.drawOutlineGlow(ctx, x, y, spriteSize, 'rgba(243, 200, 108, 1)', glowPulse);
      }
      const drawnAsSprite = actor?.draw(ctx, x, y, spriteSize) ?? false;
      if (!drawnAsSprite) {
      ctx.beginPath();
      ctx.arc(x, y, 18 * px, 0, Math.PI * 2);
      ctx.fillStyle = id === 'reimu' ? '#b82f36' : id === 'marisa' ? '#293246' : id === 'cirno' ? '#4a9fd8' : '#6c5c82';
      ctx.fill();
      ctx.strokeStyle = '#fff8df';
      ctx.lineWidth = 3 * px;
      ctx.stroke();
      }
      if (characterActive) {
        this.drawLabel(ctx, x, y + 40 * px, label);
        if (!glowDrawn) this.drawSelectionRing(ctx, x, y, (drawnAsSprite ? 46 : 26) * px);
      }
      this.targets.push({ id, label, kind: 'character', x, y, radius: (drawnAsSprite ? 42 : 24) * px });
    });
    ctx.restore();

    // 菜单打开期间，把选中目标的世界坐标换算回 CSS 像素并回报给宿主，
    // 使气泡菜单在拖动/缩放视角时始终跟随建筑或角色本体。
    if (this.selectedId && this.onSelectedAnchorMoved) {
      const selected = this.targets.find((item) => item.id === this.selectedId);
      if (selected) {
        const cssScale = this.canvas.clientWidth ? this.canvas.width / this.canvas.clientWidth : 1;
        const anchorX = (selected.x * this.camera.zoom + this.canvas.width / 2 + this.camera.x) / cssScale;
        const anchorY = (selected.y * this.camera.zoom + this.canvas.height / 2 + this.camera.y) / cssScale;
        if (!this.lastAnchor || Math.abs(anchorX - this.lastAnchor.x) > .5 || Math.abs(anchorY - this.lastAnchor.y) > .5) {
          this.lastAnchor = { x: anchorX, y: anchorY };
          this.onSelectedAnchorMoved(this.lastAnchor);
        }
      }
    } else if (this.lastAnchor) {
      this.lastAnchor = null;
    }
  }

  /** Idle waypoint: a small pixel diamond that keeps the map uncluttered. */
  private drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#543f2a';
    ctx.lineWidth = Math.max(1, 2 * this.pixelRatio);
    ctx.stroke();
  }

  /** 沿底图手描轮廓的描边发光：外圈宽淡光 + 内圈亮线 + 极淡填充。 */
  private drawAreaOutlineGlow(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    pulse: number,
  ) {
    if (points.length < 3) return;
    const px = this.pixelRatio;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(243, 200, 108, .07)';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(243, 200, 108, .28)';
    ctx.lineWidth = 9 * px;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * px;
    ctx.stroke();
    ctx.restore();
  }

  /** 空地块的贴地光环：暖金椭圆辉光，替代生硬的矩形框。 */
  private drawGroundGlow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    pulse: number,
  ) {
    ctx.save();
    ctx.globalAlpha = pulse;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(radiusX, radiusY));
    gradient.addColorStop(0, 'rgba(243, 200, 108, .34)');
    gradient.addColorStop(.6, 'rgba(243, 200, 108, .16)');
    gradient.addColorStop(1, 'rgba(243, 200, 108, 0)');
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(243, 200, 108, .55)';
    ctx.lineWidth = 2 * this.pixelRatio;
    ctx.stroke();
    ctx.restore();
  }

  /** Draw text on a translucent pill so labels stay readable over the map art. */
  private drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
    const px = this.pixelRatio;
    const size = 13 * px;
    ctx.font = `600 ${size}px system-ui`;
    ctx.textAlign = 'center';
    const previousBaseline = ctx.textBaseline;
    ctx.textBaseline = 'middle';
    const textWidth = ctx.measureText(text).width;
    const padX = 7 * px;
    const pillWidth = textWidth + padX * 2;
    const radius = (size + 8 * px) / 2;
    const left = x - pillWidth / 2;
    ctx.beginPath();
    ctx.arc(left + radius, y, radius, Math.PI / 2, Math.PI * 1.5);
    ctx.arc(left + pillWidth - radius, y, radius, Math.PI * 1.5, Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 17, 15, .74)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(214, 181, 119, .5)';
    ctx.lineWidth = 1 * px;
    ctx.stroke();
    ctx.fillStyle = '#f5ead7';
    ctx.fillText(text, x, y);
    ctx.textBaseline = previousBaseline;
  }

  private drawSelectionRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    const px = this.pixelRatio;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(243, 200, 108, .95)';
    ctx.lineWidth = 3 * px;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, radius + 4 * px, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(243, 200, 108, .35)';
    ctx.lineWidth = 2 * px;
    ctx.stroke();
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
    const point = this.eventPoint(event);
    if (!this.dragging) {
      // 悬停高亮：命中区域/角色时亮起边缘占位框并切换指针。
      const target = this.hitTarget(point);
      const nextId = target?.id ?? null;
      this.canvas.style.cursor = target ? 'pointer' : 'grab';
      if (nextId !== this.hoveredId) {
        this.hoveredId = nextId;
        this.draw();
      }
      return;
    }
    this.canvas.style.cursor = 'grabbing';
    this.camera.x += point.x - this.lastPointer.x;
    this.camera.y += point.y - this.lastPointer.y;
    this.lastPointer = point;
    this.draw();
  };

  private onPointerLeave = () => {
    if (this.hoveredId === null) return;
    this.hoveredId = null;
    this.canvas.style.cursor = 'grab';
    this.draw();
  };

  private hitTarget(point: Point): HitTarget | undefined {
    const worldX = (point.x - this.canvas.width / 2 - this.camera.x) / this.camera.zoom;
    const worldY = (point.y - this.canvas.height / 2 - this.camera.y) / this.camera.zoom;
    return [...this.targets].reverse().find((item) => Math.hypot(item.x - worldX, item.y - worldY) <= item.radius);
  }

  private onPointerUp = (event: PointerEvent) => {
    const point = this.eventPoint(event);
    const movement = Math.hypot(point.x - this.pointerOrigin.x, point.y - this.pointerOrigin.y);
    this.dragging = false;
    this.canvas.style.cursor = 'grab';
    if (movement > 8) return;
    const target = this.hitTarget(point);
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
