/**
 * Explicit crop table for local transparent battle sheets.
 * Collision radii never come from these draw sizes.
 *
 * Crop rectangles were measured from non-transparent pixel bounds
 * of the authored sheets (with a few px padding).
 */

export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasFrame {
  sheet: 'player' | 'boss' | 'effects';
  rect: AtlasRect;
  /** Logical on-arena draw size (width/height). */
  drawW: number;
  drawH: number;
  /** Pivot as fraction of draw box (0..1), default center. */
  pivotX?: number;
  pivotY?: number;
}

/** Source sheets are the transparent *-v1.png assets only. */
export const BATTLE_SHEET_PATHS = {
  player: 'battle/player/keycraft-player-sheet-v1.png',
  boss: 'battle/boss/greenhouse-flower-core-sheet-v1.png',
  effects: 'battle/effects/battle-effects-sheet-v1.png',
} as const;

export const ATLAS_FRAMES = {
  // player sheet 1536×1024
  player_normal: {
    sheet: 'player',
    rect: { x: 102, y: 87, w: 375, h: 400 },
    drawW: 58,
    drawH: 62,
    pivotX: 0.5,
    pivotY: 0.68,
  },
  player_focus: {
    sheet: 'player',
    rect: { x: 549, y: 87, w: 374, h: 400 },
    drawW: 58,
    drawH: 62,
    pivotX: 0.5,
    pivotY: 0.68,
  },
  player_hit: {
    sheet: 'player',
    rect: { x: 267, y: 545, w: 375, h: 394 },
    drawW: 60,
    drawH: 64,
    pivotX: 0.5,
    pivotY: 0.68,
  },
  player_bomb: {
    sheet: 'player',
    rect: { x: 764, y: 547, w: 427, h: 414 },
    drawW: 92,
    drawH: 90,
    pivotX: 0.5,
    pivotY: 0.55,
  },
  player_shot_single: {
    sheet: 'player',
    rect: { x: 1047, y: 182, w: 60, h: 238 },
    drawW: 8,
    drawH: 28,
    pivotX: 0.5,
    pivotY: 0.5,
  },
  player_shot_dual: {
    sheet: 'player',
    rect: { x: 1250, y: 182, w: 123, h: 250 },
    drawW: 16,
    drawH: 28,
    pivotX: 0.5,
    pivotY: 0.5,
  },

  // boss sheet 1254×1254 — 2×2 stage grid
  boss_phase1: {
    sheet: 'boss',
    rect: { x: 63, y: 109, w: 536, h: 470 },
    drawW: 108,
    drawH: 96,
    pivotX: 0.5,
    pivotY: 0.58,
  },
  boss_phase2: {
    sheet: 'boss',
    rect: { x: 620, y: 82, w: 567, h: 500 },
    drawW: 114,
    drawH: 100,
    pivotX: 0.5,
    pivotY: 0.58,
  },
  boss_hit: {
    sheet: 'boss',
    rect: { x: 66, y: 635, w: 558, h: 504 },
    drawW: 112,
    drawH: 100,
    pivotX: 0.5,
    pivotY: 0.58,
  },
  boss_break: {
    sheet: 'boss',
    rect: { x: 616, y: 791, w: 586, h: 347 },
    drawW: 120,
    drawH: 72,
    pivotX: 0.5,
    pivotY: 0.55,
  },

  // effects sheet 1536×1024 — measured cell contents
  fx_orb_small: {
    sheet: 'effects',
    rect: { x: 133, y: 190, w: 52, h: 51 },
    drawW: 12,
    drawH: 12,
  },
  fx_orb_large: {
    sheet: 'effects',
    rect: { x: 300, y: 145, w: 139, h: 140 },
    drawW: 18,
    drawH: 18,
  },
  fx_diamond: {
    sheet: 'effects',
    rect: { x: 567, y: 94, w: 83, h: 234 },
    drawW: 10,
    drawH: 24,
  },
  fx_crystal: {
    sheet: 'effects',
    rect: { x: 779, y: 99, w: 248, h: 226 },
    drawW: 16,
    drawH: 18,
  },
  fx_seed: {
    sheet: 'effects',
    rect: { x: 1021, y: 137, w: 262, h: 161 },
    drawW: 16,
    drawH: 12,
  },
  fx_petal: {
    sheet: 'effects',
    rect: { x: 1277, y: 119, w: 177, h: 171 },
    drawW: 18,
    drawH: 16,
  },
  fx_leaf: {
    sheet: 'effects',
    rect: { x: 133, y: 421, w: 105, h: 195 },
    drawW: 12,
    drawH: 22,
  },
  fx_blade: {
    sheet: 'effects',
    rect: { x: 383, y: 421, w: 116, h: 195 },
    drawW: 12,
    drawH: 22,
  },
  fx_hit_star: {
    sheet: 'effects',
    rect: { x: 619, y: 463, w: 151, h: 151 },
    drawW: 18,
    drawH: 18,
  },
  fx_player_shot: {
    sheet: 'effects',
    rect: { x: 936, y: 370, w: 91, h: 264 },
    drawW: 10,
    drawH: 28,
  },
  fx_player_shot_wide: {
    sheet: 'effects',
    rect: { x: 1021, y: 358, w: 262, h: 276 },
    drawW: 26,
    drawH: 28,
  },
  fx_spark: {
    sheet: 'effects',
    rect: { x: 103, y: 726, w: 156, h: 159 },
    drawW: 24,
    drawH: 24,
  },
  fx_burst_gold: {
    sheet: 'effects',
    rect: { x: 253, y: 716, w: 262, h: 187 },
    drawW: 36,
    drawH: 28,
  },
  fx_ring: {
    sheet: 'effects',
    rect: { x: 509, y: 704, w: 262, h: 213 },
    drawW: 48,
    drawH: 40,
  },
  fx_burst_ice: {
    sheet: 'effects',
    rect: { x: 765, y: 704, w: 262, h: 210 },
    drawW: 36,
    drawH: 30,
  },
  fx_gem: {
    sheet: 'effects',
    rect: { x: 1277, y: 762, w: 87, h: 100 },
    drawW: 12,
    drawH: 14,
  },
} as const satisfies Record<string, AtlasFrame>;

export type AtlasFrameId = keyof typeof ATLAS_FRAMES;

export interface BattleAtlasSources {
  player?: string;
  boss?: string;
  effects?: string;
}

export interface BattleAtlas {
  ready: boolean;
  images: Partial<Record<'player' | 'boss' | 'effects', CanvasImageSource>>;
  failed: boolean;
}

const emptyAtlas = (): BattleAtlas => ({ ready: false, images: {}, failed: false });

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src || typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** Non-blocking atlas load. Missing/broken sources simply leave frames unavailable. */
export async function loadBattleAtlas(sources: BattleAtlasSources = {}): Promise<BattleAtlas> {
  const atlas = emptyAtlas();
  const entries: Array<['player' | 'boss' | 'effects', string | undefined]> = [
    ['player', sources.player],
    ['boss', sources.boss],
    ['effects', sources.effects],
  ];
  const results = await Promise.all(entries.map(async ([key, src]) => {
    if (!src) return [key, null] as const;
    const image = await loadImage(src);
    return [key, image] as const;
  }));
  let any = false;
  for (const [key, image] of results) {
    if (image) {
      atlas.images[key] = image;
      any = true;
    }
  }
  atlas.ready = any;
  atlas.failed = !any && entries.some(([, src]) => Boolean(src));
  return atlas;
}

export function resolveFrame(id: AtlasFrameId): AtlasFrame {
  return ATLAS_FRAMES[id];
}

/** Enemy pattern → preferred effects frame (shape grammar still used as fallback). */
export function patternEffectFrame(patternId: string | undefined): AtlasFrameId | null {
  switch (patternId) {
    case 'fixed_seed_ring':
    case 'rotating_ring':
      return 'fx_orb_small';
    case 'petal_fan':
    case 'wave_fan':
      return 'fx_petal';
    case 'homing_leaf':
      return 'fx_leaf';
    case 'local_safe_zone':
    case 'falling_lanes':
      return 'fx_crystal';
    case 'aimed_stream':
      return 'fx_diamond';
    case 'burst_cluster':
      return 'fx_orb_large';
    case 'cross_sweep':
      return 'fx_blade';
    case 'laser_warning':
      return null;
    default:
      return 'fx_orb_small';
  }
}

export function drawAtlasFrame(
  ctx: CanvasRenderingContext2D,
  atlas: BattleAtlas | null | undefined,
  frameId: AtlasFrameId,
  x: number,
  y: number,
  options?: { scale?: number; alpha?: number; rotation?: number },
): boolean {
  if (!atlas?.ready) return false;
  const frame = ATLAS_FRAMES[frameId];
  const image = atlas.images[frame.sheet];
  if (!image) return false;
  const scale = options?.scale ?? 1;
  const alpha = options?.alpha ?? 1;
  const drawW = frame.drawW * scale;
  const drawH = frame.drawH * scale;
  const pivotX = 'pivotX' in frame && typeof frame.pivotX === 'number' ? frame.pivotX : 0.5;
  const pivotY = 'pivotY' in frame && typeof frame.pivotY === 'number' ? frame.pivotY : 0.5;
  const dx = -drawW * pivotX;
  const dy = -drawH * pivotY;
  ctx.save();
  ctx.translate(x, y);
  if (options?.rotation) ctx.rotate(options.rotation);
  ctx.globalAlpha = alpha;
  try {
    ctx.drawImage(
      image,
      frame.rect.x,
      frame.rect.y,
      frame.rect.w,
      frame.rect.h,
      dx,
      dy,
      drawW,
      drawH,
    );
  } catch {
    ctx.restore();
    return false;
  }
  ctx.restore();
  return true;
}

export function listAtlasFrameIds(): AtlasFrameId[] {
  return Object.keys(ATLAS_FRAMES) as AtlasFrameId[];
}
