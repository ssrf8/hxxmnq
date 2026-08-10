import type { GalReaction, GalSexualAct, GalVisualMode } from './types';

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
  actId: GalSexualAct;
}

export interface GalPortraitCharacterProfile {
  characterId: string;
  reactionIds: readonly GalReaction[];
  visualModes: readonly GalVisualMode[];
  sexualPoseIds: readonly string[];
}

type GalReactionSourceMap = Partial<Record<GalReaction, string>>;
type GalSexualSourceMap = Record<string, Partial<Record<GalSexualAct, string[]>>>;

export type GalPortraitSourceMap = Record<string, {
  normal?: GalReactionSourceMap;
  nude?: GalReactionSourceMap;
  sexual?: GalSexualSourceMap;
}>;

export interface GalRemoteManifestFile {
  source: string;
  key: string;
  mime: string;
  character_id?: string;
  visual_mode?: string;
  pose_id?: string;
  act_id?: string;
  candidate_no?: string;
  pool_id?: string;
  weight?: number;
}

export const GAL_PORTRAIT_REACTION_IDS = ['neutral', 'smile', 'shy', 'sad', 'angry'] as const satisfies readonly GalReaction[];
export const GAL_PORTRAIT_CHARACTER_IDS = [
  'reimu', 'marisa', 'cirno', 'alice', 'nitori', 'mystia', 'suika', 'sakuya',
  'youmu', 'patchouli', 'sanae',
] as const;
const GAL_PORTRAIT_READY_MODES = ['normal', 'nude'] as const;
export const GAL_SEXUAL_POSE_ACTS = {
  missionary: ['vaginal', 'anal'], rear: ['vaginal', 'anal'], prone: ['vaginal', 'anal'],
  rear_standing: ['vaginal', 'anal'], cowgirl: ['vaginal', 'anal'], reverse_cowgirl: ['vaginal', 'anal'],
  side: ['vaginal', 'anal'], front_standing: ['vaginal', 'anal'], seated: ['vaginal', 'anal'],
  lotus: ['vaginal', 'anal'], leg_raise_split: ['vaginal', 'anal'],
  sixty_nine: ['none'], breast: ['none'], oral: ['none'], manual: ['none'], foot_single: ['none'], foot_double: ['none'],
} as const satisfies Record<string, readonly GalSexualAct[]>;
const GAL_SEXUAL_POSE_IDS = Object.keys(GAL_SEXUAL_POSE_ACTS);

export const GAL_PORTRAIT_CHARACTER_PROFILES: Record<string, GalPortraitCharacterProfile> = Object.fromEntries(
  GAL_PORTRAIT_CHARACTER_IDS.map((characterId) => [characterId, {
    characterId,
    reactionIds: GAL_PORTRAIT_REACTION_IDS,
    visualModes: GAL_PORTRAIT_READY_MODES,
    sexualPoseIds: GAL_SEXUAL_POSE_IDS,
  }]),
);

export const GAL_PORTRAIT_SLOTS: readonly GalPortraitSlot[] = GAL_PORTRAIT_CHARACTER_IDS.flatMap((characterId) => (
  GAL_PORTRAIT_READY_MODES.flatMap((visualMode) => GAL_PORTRAIT_REACTION_IDS.map((reactionId) => ({
    poolId: `gal.${characterId}.${visualMode}.${reactionId}`,
    characterId,
    visualMode,
    reactionId,
    localAssetPath: `characters/${characterId}/gal/${visualMode}/${characterId}-${visualMode}-${reactionId}-v1.png`,
    status: 'ready' as const,
  })))
));

function profileFor(characterId: string | null) {
  return characterId ? GAL_PORTRAIT_CHARACTER_PROFILES[characterId] ?? null : null;
}

export function normalizeGalPortraitCue(characterId: string | null, cue: GalPortraitCue): GalPortraitCue {
  const profile = profileFor(characterId);
  if (!profile) return cue;
  const reactionId = profile.reactionIds.includes(cue.reactionId) ? cue.reactionId : 'neutral';
  const allowedActs = GAL_SEXUAL_POSE_ACTS[cue.poseId as keyof typeof GAL_SEXUAL_POSE_ACTS] as readonly GalSexualAct[] | undefined;
  const validSexualCue = cue.visualMode === 'sexual' && profile.sexualPoseIds.includes(cue.poseId) && Boolean(allowedActs?.includes(cue.actId));
  const poseId = validSexualCue ? cue.poseId : 'default';
  const actId = validSexualCue ? cue.actId : 'none';
  return { ...cue, reactionId, poseId, actId };
}

/** Ordered logical pools. The image resolver will try them from left to right. */
export function galPortraitFallbackPoolIds(characterId: string | null, cue: GalPortraitCue): string[] {
  const profile = profileFor(characterId);
  if (!profile) return [];
  const { visualMode, reactionId, poseId, actId } = normalizeGalPortraitCue(characterId, cue);
  const prefix = `gal.${profile.characterId}`;
  if (visualMode === 'normal') return reactionId === 'neutral'
    ? [`${prefix}.normal.neutral`]
    : [`${prefix}.normal.${reactionId}`, `${prefix}.normal.neutral`];
  const nudeFallbacks = reactionId === 'neutral'
    ? [`${prefix}.nude.neutral`, `${prefix}.normal.neutral`]
    : [`${prefix}.nude.${reactionId}`, `${prefix}.nude.neutral`, `${prefix}.normal.${reactionId}`, `${prefix}.normal.neutral`];
  return visualMode === 'nude' || poseId === 'default'
    ? nudeFallbacks
    : [`${prefix}.sexual.${poseId}.${actId}`, ...nudeFallbacks];
}

function isSafePortraitSource(value: unknown, trustedRemoteBase?: string): value is string {
  if (typeof value !== 'string' || value.length > 8_000_000) return false;
  if (/^(?:\.\.\/assets\/|data:image\/png;base64,)[a-z0-9+/=._-]+$/iu.test(value)) return true;
  const normalizedBase = trustedRemoteBase?.replace(/\/+$/u, '');
  if (!normalizedBase?.startsWith('https://')) return false;
  try {
    const base = new URL(`${normalizedBase}/`);
    const source = new URL(value);
    return source.protocol === 'https:' && !source.username && !source.password
      && !source.search && !source.hash && source.origin === base.origin && source.pathname.startsWith(base.pathname);
  } catch {
    return false;
  }
}

export function parseGalPortraitSources(value: string | undefined, trustedRemoteBase?: string): GalPortraitSourceMap {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: GalPortraitSourceMap = {};
    for (const [characterId, characterValue] of Object.entries(parsed)) {
      if (!profileFor(characterId) || !characterValue || typeof characterValue !== 'object' || Array.isArray(characterValue)) continue;
      const characterSources: GalPortraitSourceMap[string] = {};
      for (const mode of GAL_PORTRAIT_READY_MODES) {
        const modeValue = (characterValue as Record<string, unknown>)[mode];
        if (!modeValue || typeof modeValue !== 'object' || Array.isArray(modeValue)) continue;
        const modeSources: Partial<Record<GalReaction, string>> = {};
        for (const reactionId of GAL_PORTRAIT_REACTION_IDS) {
          const source = (modeValue as Record<string, unknown>)[reactionId];
          if (isSafePortraitSource(source, trustedRemoteBase)) modeSources[reactionId] = source;
        }
        if (Object.keys(modeSources).length) characterSources[mode] = modeSources;
      }
      const sexualValue = (characterValue as Record<string, unknown>).sexual;
      if (sexualValue && typeof sexualValue === 'object' && !Array.isArray(sexualValue)) {
        const sexualSources: GalSexualSourceMap = {};
        for (const [poseId, poseValue] of Object.entries(sexualValue)) {
          if (!/^[a-z0-9_]{1,40}$/u.test(poseId) || !poseValue || typeof poseValue !== 'object' || Array.isArray(poseValue)) continue;
          const acts: GalSexualSourceMap[string] = {};
          for (const actId of ['vaginal', 'anal', 'none'] as const) {
            const candidates = (poseValue as Record<string, unknown>)[actId];
            if (!Array.isArray(candidates)) continue;
            const safeCandidates = candidates.filter((source): source is string => isSafePortraitSource(source, trustedRemoteBase));
            if (safeCandidates.length) acts[actId] = safeCandidates;
          }
          if (Object.keys(acts).length) sexualSources[poseId] = acts;
        }
        if (Object.keys(sexualSources).length) characterSources.sexual = sexualSources;
      }
      if (Object.keys(characterSources).length) result[characterId] = characterSources;
    }
    return result;
  } catch {
    return {};
  }
}

export function resolveGalPortraitSource(sources: GalPortraitSourceMap, characterId: string | null, cue: GalPortraitCue): string | null {
  for (const poolId of galPortraitFallbackPoolIds(characterId, cue)) {
    const [, poolCharacterId, mode, selectorId, sexualActId] = poolId.split('.');
    if (mode === 'normal' || mode === 'nude') {
      const source = sources[poolCharacterId]?.[mode]?.[selectorId as GalReaction];
      if (source) return source;
    } else if (mode === 'sexual' && (sexualActId === 'vaginal' || sexualActId === 'anal' || sexualActId === 'none')) {
      const source = sources[poolCharacterId]?.sexual?.[selectorId]?.[sexualActId]?.[0];
      if (source) return source;
    }
  }
  return null;
}

/** Adds convention-based sexual CG entries from a verified live manifest. */
export function mergeRemoteSexualPortraitSources(
  sources: GalPortraitSourceMap,
  files: readonly GalRemoteManifestFile[],
  trustedRemoteBase: string,
): GalPortraitSourceMap {
  const merged = structuredClone(sources);
  const orderedFiles = [...files].sort((left, right) => left.source.localeCompare(right.source, 'en'));
  const pattern = /^characters\/([a-z0-9_]+)\/gal\/sexual\/([a-z0-9_]+)\/(vaginal|anal|none)\/(\d{2})\.png$/u;
  for (const file of orderedFiles) {
    const match = pattern.exec(file.source);
    if (!match || file.mime !== 'image/png' || file.key !== `gensokyo-moving-garden/live/${file.source}`) continue;
    const [, characterId, poseId, actId, candidateNo] = match;
    if (!profileFor(characterId)) continue;
    const allowedActs = GAL_SEXUAL_POSE_ACTS[poseId as keyof typeof GAL_SEXUAL_POSE_ACTS] as readonly GalSexualAct[] | undefined;
    if (!allowedActs?.includes(actId as GalSexualAct)) continue;
    if (file.character_id !== characterId || file.visual_mode !== 'sexual' || file.pose_id !== poseId
      || file.act_id !== actId || file.candidate_no !== candidateNo
      || file.pool_id !== `gal.${characterId}.sexual.${poseId}.${actId}`
      || typeof file.weight !== 'number' || !Number.isFinite(file.weight) || file.weight <= 0) continue;
    const source = `${trustedRemoteBase.replace(/\/+$/u, '')}/${file.key}`;
    if (!isSafePortraitSource(source, trustedRemoteBase)) continue;
    // R79 防御：base 必须是纯 origin（pathname === "/"）。若调用方误传带前缀 base
    // （baseUrl+"/gensokyo-moving-garden/live"），与 file.key（本身已含该前缀）拼接会
    // 产生重复路径 "…/live/gensokyo-moving-garden/live/…" 导致 404，这里直接拒绝。
    const baseUrl = new URL(trustedRemoteBase.replace(/\/+$/u, '') + '/');
    if (baseUrl.pathname !== '/') continue;
    const character = merged[characterId] ??= {};
    const sexual = character.sexual ??= {};
    const pose = sexual[poseId] ??= {};
    const candidates = pose[actId as GalSexualAct] ??= [];
    if (!candidates.includes(source)) candidates.push(source);
  }
  return merged;
}
