import type { GalReaction, GalVisualMode } from './types';

export type GalPortraitSlotStatus = 'awaiting-owner-image' | 'ready';

export interface GalPortraitSlot {
  poolId: string;
  characterId: string;
  visualMode: 'normal' | 'nude';
  reactionId: GalReaction;
  localAssetPath: string | null;
  status: GalPortraitSlotStatus;
}

export interface GalPortraitCue {
  visualMode: GalVisualMode;
  reactionId: GalReaction;
  poseId: string;
}

export interface GalPortraitCharacterProfile {
  characterId: string;
  reactionIds: readonly GalReaction[];
  visualModes: readonly GalVisualMode[];
  sexualPoseIds: readonly string[];
}

export type GalPortraitSourceMap = Record<string, Partial<Record<
  'normal' | 'nude',
  Partial<Record<GalReaction, string>>
>>>;

export const MARISA_GAL_REACTION_IDS = [
  'neutral',
  'smile',
  'shy',
  'sad',
  'angry',
] as const satisfies readonly GalReaction[];

const MARISA_READY_MODES = ['normal', 'nude'] as const;

export const GAL_PORTRAIT_CHARACTER_PROFILES = {
  marisa: {
    characterId: 'marisa',
    reactionIds: MARISA_GAL_REACTION_IDS,
    visualModes: MARISA_READY_MODES,
    sexualPoseIds: [],
  },
} as const satisfies Record<string, GalPortraitCharacterProfile>;

export const MARISA_GAL_PORTRAIT_SLOTS: readonly GalPortraitSlot[] = MARISA_READY_MODES
  .flatMap((visualMode) => MARISA_GAL_REACTION_IDS.map((reactionId) => ({
    poolId: `gal.marisa.${visualMode}.${reactionId}`,
    characterId: 'marisa',
    visualMode,
    reactionId,
    localAssetPath: `characters/marisa/gal/${visualMode}/marisa-${visualMode}-${reactionId}-v1.png`,
    status: 'ready' as const,
  })));

function profileFor(characterId: string | null) {
  if (!characterId) return null;
  return GAL_PORTRAIT_CHARACTER_PROFILES[
    characterId as keyof typeof GAL_PORTRAIT_CHARACTER_PROFILES
  ] ?? null;
}

/**
 * Keeps model output inside the character-specific semantic registry.
 * It does not downgrade visualMode: missing-image fallback belongs to the asset resolver.
 */
export function normalizeGalPortraitCue(
  characterId: string | null,
  cue: GalPortraitCue,
): GalPortraitCue {
  const profile = profileFor(characterId);
  if (!profile) return cue;
  const reactionId = (profile.reactionIds as readonly GalReaction[]).includes(cue.reactionId)
    ? cue.reactionId
    : 'neutral';
  const poseId = cue.visualMode === 'sexual'
    && (profile.sexualPoseIds as readonly string[]).includes(cue.poseId)
    ? cue.poseId
    : 'default';
  return { ...cue, reactionId, poseId };
}

/** Ordered logical pools. The image resolver will try them from left to right. */
export function galPortraitFallbackPoolIds(
  characterId: string | null,
  cue: GalPortraitCue,
): string[] {
  const normalized = normalizeGalPortraitCue(characterId, cue);
  if (characterId !== 'marisa') return [];
  const { visualMode, reactionId, poseId } = normalized;
  if (visualMode === 'normal') {
    return reactionId === 'neutral'
      ? ['gal.marisa.normal.neutral']
      : [`gal.marisa.normal.${reactionId}`, 'gal.marisa.normal.neutral'];
  }
  const nudeFallbacks = reactionId === 'neutral'
    ? ['gal.marisa.nude.neutral', 'gal.marisa.normal.neutral']
    : [
      `gal.marisa.nude.${reactionId}`,
      'gal.marisa.nude.neutral',
      `gal.marisa.normal.${reactionId}`,
      'gal.marisa.normal.neutral',
    ];
  if (visualMode === 'nude') return nudeFallbacks;
  return [`gal.marisa.sexual.${poseId}`, ...nudeFallbacks];
}

function isSafePortraitSource(value: unknown, trustedRemoteBase?: string): value is string {
  if (typeof value !== 'string' || value.length > 8_000_000) return false;
  if (/^(?:\.\.\/assets\/|data:image\/png;base64,)[a-z0-9+/=._-]+$/iu.test(value)) return true;
  const normalizedBase = trustedRemoteBase?.replace(/\/+$/u, '');
  if (!normalizedBase?.startsWith('https://')) return false;
  try {
    const base = new URL(`${normalizedBase}/`);
    const source = new URL(value);
    return source.protocol === 'https:'
      && !source.username
      && !source.password
      && !source.search
      && !source.hash
      && source.origin === base.origin
      && source.pathname.startsWith(base.pathname);
  } catch {
    return false;
  }
}

export function parseGalPortraitSources(
  value: string | undefined,
  trustedRemoteBase?: string,
): GalPortraitSourceMap {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: GalPortraitSourceMap = {};
    for (const [characterId, characterValue] of Object.entries(parsed)) {
      if (!/^[a-z0-9_-]{1,48}$/iu.test(characterId)
        || !characterValue || typeof characterValue !== 'object' || Array.isArray(characterValue)) continue;
      const characterSources: GalPortraitSourceMap[string] = {};
      for (const mode of MARISA_READY_MODES) {
        const modeValue = (characterValue as Record<string, unknown>)[mode];
        if (!modeValue || typeof modeValue !== 'object' || Array.isArray(modeValue)) continue;
        const modeSources: Partial<Record<GalReaction, string>> = {};
        for (const reactionId of MARISA_GAL_REACTION_IDS) {
          const source = (modeValue as Record<string, unknown>)[reactionId];
          if (isSafePortraitSource(source, trustedRemoteBase)) modeSources[reactionId] = source;
        }
        if (Object.keys(modeSources).length) characterSources[mode] = modeSources;
      }
      if (Object.keys(characterSources).length) result[characterId] = characterSources;
    }
    return result;
  } catch {
    return {};
  }
}

export function resolveGalPortraitSource(
  sources: GalPortraitSourceMap,
  characterId: string | null,
  cue: GalPortraitCue,
): string | null {
  for (const poolId of galPortraitFallbackPoolIds(characterId, cue)) {
    const [, poolCharacterId, mode, selectorId] = poolId.split('.');
    if (mode !== 'normal' && mode !== 'nude') continue;
    const source = sources[poolCharacterId]?.[mode]?.[selectorId as GalReaction];
    if (source) return source;
  }
  return null;
}
