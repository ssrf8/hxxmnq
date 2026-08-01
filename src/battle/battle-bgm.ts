export const BATTLE_BGM_TRACK_IDS = ['stage_theme', 'boss_theme', 'duel_theme'] as const;
export type BattleBgmTrackId = typeof BATTLE_BGM_TRACK_IDS[number];

export interface BattleBgmTrack {
  id: BattleBgmTrackId;
  title: string;
  description: string;
  sourceUrl: string | null;
}

export interface BattleBgmBus {
  setTrack(id: BattleBgmTrackId): void;
  setVolume(volume: number): void;
  play(): Promise<boolean>;
  pause(): void;
  stop(): void;
  destroy(): void;
  getState(): { trackId: BattleBgmTrackId; volume: number; available: boolean; playing: boolean };
}

interface AudioLike {
  src: string;
  loop: boolean;
  preload: string;
  volume: number;
  currentTime: number;
  play(): Promise<void> | void;
  pause(): void;
}

interface RawCatalog {
  tracks?: Array<{ id?: unknown; title?: unknown; description?: unknown; source_url?: unknown }>;
}

const clampVolume = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.45));

function safeSource(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const source = value.trim();
  if (!source.startsWith('https://')) return null;
  try {
    const parsed = new URL(source);
    return parsed.protocol === 'https:' ? source : null;
  } catch {
    return null;
  }
}

export function normalizeBattleBgmCatalog(raw: unknown): BattleBgmTrack[] {
  const input = raw && typeof raw === 'object' ? raw as RawCatalog : {};
  const rows = Array.isArray(input.tracks) ? input.tracks : [];
  return BATTLE_BGM_TRACK_IDS.map((id) => {
    const row = rows.find((candidate) => candidate?.id === id);
    return {
      id,
      title: typeof row?.title === 'string' && row.title.trim() ? row.title.trim() : id,
      description: typeof row?.description === 'string' ? row.description.trim() : '',
      sourceUrl: safeSource(row?.source_url),
    };
  });
}

export function createBattleBgmBus(
  tracks: BattleBgmTrack[],
  options: { trackId?: BattleBgmTrackId; volume?: number; createAudio?: () => AudioLike } = {},
): BattleBgmBus {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  let trackId = byId.has(options.trackId ?? 'stage_theme')
    ? options.trackId ?? 'stage_theme'
    : 'stage_theme';
  let volume = clampVolume(options.volume ?? 0.45);
  let audio: AudioLike | null = null;
  let audioTrackId: BattleBgmTrackId | null = null;
  let playing = false;
  let destroyed = false;
  const createAudio = options.createAudio ?? (() => new Audio());

  const currentTrack = () => byId.get(trackId);
  const ensureAudio = () => {
    const track = currentTrack();
    if (destroyed || !track?.sourceUrl) return null;
    if (audio && audioTrackId === trackId) return audio;
    if (audio) audio.pause();
    audio = createAudio();
    audio.src = track.sourceUrl;
    audio.loop = true;
    audio.preload = 'metadata';
    audio.volume = volume;
    audioTrackId = trackId;
    playing = false;
    return audio;
  };

  const pause = () => {
    audio?.pause();
    playing = false;
  };

  const stop = () => {
    pause();
    if (audio) audio.currentTime = 0;
  };

  const setTrack = (next: BattleBgmTrackId) => {
    if (!byId.has(next) || next === trackId) return;
    stop();
    audio = null;
    audioTrackId = null;
    trackId = next;
  };

  const setVolume = (next: number) => {
    volume = clampVolume(next);
    if (audio) audio.volume = volume;
  };

  const play = async () => {
    if (playing) return true;
    const current = ensureAudio();
    if (!current) return false;
    try {
      await current.play();
      playing = true;
      return true;
    } catch (error) {
      playing = false;
      console.warn(`[battle-bgm] ${trackId} 无法播放`, error);
      return false;
    }
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stop();
    audio = null;
    audioTrackId = null;
  };

  const getState = () => ({
    trackId,
    volume,
    available: Boolean(currentTrack()?.sourceUrl),
    playing,
  });

  return { setTrack, setVolume, play, pause, stop, destroy, getState };
}
