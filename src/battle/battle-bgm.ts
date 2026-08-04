export const BATTLE_BGM_TRACK_IDS = ['stage_theme', 'boss_theme', 'duel_theme'] as const;
export type BattleBgmTrackId = typeof BATTLE_BGM_TRACK_IDS[number];

export interface BattleBgmTrack {
  id: BattleBgmTrackId;
  title: string;
  description: string;
  sourceUrl: string | null;
}

export type LocalBgmLinkKind = 'direct_audio' | 'netease_song' | 'netease_playlist';

export interface LocalBgmLink {
  sourceUrl: string;
  kind: LocalBgmLinkKind;
  id: string | null;
}

/** Uses NetEase's public redirect endpoint only for a single song ID. */
export function resolvePlayableLocalBgmSource(link: LocalBgmLink): string | null {
  if (link.kind === 'direct_audio') return link.sourceUrl;
  if (link.kind === 'netease_song' && link.id) {
    return `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(link.id)}`;
  }
  return null;
}

export interface BattleBgmBus {
  setTrack(id: BattleBgmTrackId): void;
  setSource(id: BattleBgmTrackId, sourceUrl: string | null): void;
  setPlaylist(id: BattleBgmTrackId, sourceUrls: string[]): void;
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
  onended: ((event: Event) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  play(): Promise<void> | void;
  pause(): void;
}

interface RawCatalog {
  tracks?: Array<{ id?: unknown; title?: unknown; description?: unknown; source_url?: unknown }>;
}

const clampVolume = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.08));

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

/** Parses only share metadata; it never extracts protected music streams. */
export function parseLocalBgmLinks(raw: unknown, limit = 12): LocalBgmLink[] {
  const rows = typeof raw === 'string' ? raw.split(/[\r\n,]+/u) : Array.isArray(raw) ? raw : [];
  const parsed: LocalBgmLink[] = [];
  for (const value of rows) {
    const sourceUrl = safeSource(value);
    if (!sourceUrl || parsed.some((item) => item.sourceUrl === sourceUrl)) continue;
    const url = new URL(sourceUrl);
    const hashQuery = url.hash.includes('?') ? new URLSearchParams(url.hash.slice(url.hash.indexOf('?') + 1)) : null;
    const id = url.searchParams.get('id') ?? hashQuery?.get('id') ?? null;
    const route = `${url.pathname}${url.hash}`;
    const kind = /(?:^|\/)(song|playlist)(?:\?|$)/u.exec(route)?.[1]
      ?? (/\/song\/media\/outer\/url(?:\?|$)/u.test(route) ? 'song' : undefined);
    const isNeteaseShare = /(?:^|\.)music\.163\.com$/u.test(url.hostname) && id && kind;
    parsed.push(isNeteaseShare
      ? { sourceUrl, kind: kind === 'song' ? 'netease_song' : 'netease_playlist', id }
      : { sourceUrl, kind: 'direct_audio', id: null });
    if (parsed.length >= limit) break;
  }
  return parsed;
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
  let volume = clampVolume(options.volume ?? 0.08);
  let audio: AudioLike | null = null;
  let audioTrackId: BattleBgmTrackId | null = null;
  let playing = false;
  let destroyed = false;
  const playlists = new Map<BattleBgmTrackId, string[]>();
  const playlistPositions = new Map<BattleBgmTrackId, number>();
  const playlistCycles = new Map<BattleBgmTrackId, number>();
  const createAudio = options.createAudio ?? (() => new Audio());

  const currentTrack = () => byId.get(trackId);
  const shuffled = (sources: string[], seed: number) => {
    const result = [...sources];
    let state = seed || 1;
    for (let index = result.length - 1; index > 0; index -= 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const swap = state % (index + 1);
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  };
  const advancePlaylist = (id: BattleBgmTrackId) => {
    const current = playlists.get(id) ?? [];
    if (current.length < 2) { playing = false; return; }
    let position = (playlistPositions.get(id) ?? 0) + 1;
    let nextList = current;
    if (position >= current.length) {
      const cycle = (playlistCycles.get(id) ?? 0) + 1;
      playlistCycles.set(id, cycle);
      nextList = shuffled(current, cycle + id.length * 97);
      playlists.set(id, nextList);
      position = 0;
    }
    playlistPositions.set(id, position);
    setSource(id, nextList[position]);
    if (id === trackId && !destroyed) void play();
  };
  const ensureAudio = () => {
    const track = currentTrack();
    if (destroyed || !track?.sourceUrl) return null;
    if (audio && audioTrackId === trackId) return audio;
    if (audio) audio.pause();
    const nextAudio = createAudio();
    nextAudio.src = track.sourceUrl;
    nextAudio.loop = (playlists.get(trackId)?.length ?? 0) < 2;
    nextAudio.preload = 'metadata';
    nextAudio.volume = volume;
    audio = nextAudio;
    audioTrackId = trackId;
    nextAudio.onended = () => advancePlaylist(trackId);
    nextAudio.onerror = () => advancePlaylist(trackId);
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

  const setSource = (id: BattleBgmTrackId, sourceUrl: string | null) => {
    const track = byId.get(id);
    if (!track) return;
    const next = safeSource(sourceUrl);
    if (track.sourceUrl === next) return;
    if (audioTrackId === id) stop();
    track.sourceUrl = next;
    if (audioTrackId === id) {
      audio = null;
      audioTrackId = null;
    }
  };

  const setPlaylist = (id: BattleBgmTrackId, sourceUrls: string[]) => {
    const sources = [...new Set(sourceUrls.map(safeSource).filter((source): source is string => Boolean(source)))];
    const current = playlists.get(id) ?? [];
    if (current.length === sources.length && current.every((source) => sources.includes(source))) return;
    const ordered = shuffled(sources, id.length * 97);
    playlists.set(id, ordered);
    playlistPositions.set(id, 0);
    playlistCycles.set(id, 0);
    setSource(id, ordered[0] ?? null);
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

  return { setTrack, setSource, setPlaylist, setVolume, play, pause, stop, destroy, getState };
}
