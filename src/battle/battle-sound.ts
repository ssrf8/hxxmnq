export type BattleSfxId =
  | 'player_shot'
  | 'boss_hit'
  | 'mob_defeat'
  | 'graze'
  | 'item_pickup'
  | 'player_miss'
  | 'bomb'
  | 'wave_start'
  | 'spell_declare'
  | 'phase_break'
  | 'laser_warning'
  | 'laser_fire'
  | 'battle_win'
  | 'battle_lose';

export const BATTLE_SFX_IDS: readonly BattleSfxId[] = [
  'player_shot',
  'boss_hit',
  'mob_defeat',
  'graze',
  'item_pickup',
  'player_miss',
  'bomb',
  'wave_start',
  'spell_declare',
  'phase_break',
  'laser_warning',
  'laser_fire',
  'battle_win',
  'battle_lose',
];

export type BattleSfxSources = Partial<Record<BattleSfxId, string>>;

export interface BattleSoundBus {
  play(id: BattleSfxId): void;
  unlock?(): Promise<void>;
  setMuted?(muted: boolean): void;
  setVolume?(volume: number): void;
  destroy?(): void;
}

export const nullSoundBus: BattleSoundBus = {
  play: () => {},
};

export interface BattleSoundBusOptions {
  muted?: boolean;
  volume?: number;
}

const EVENT_THROTTLE_MS: Partial<Record<BattleSfxId, number>> = {
  player_shot: 80,
  boss_hit: 60,
  graze: 60,
};

const EVENT_GAIN: Record<BattleSfxId, number> = {
  player_shot: 0.24,
  boss_hit: 0.22,
  mob_defeat: 0.58,
  graze: 0.48,
  item_pickup: 0.55,
  player_miss: 0.72,
  bomb: 0.72,
  wave_start: 0.48,
  spell_declare: 0.68,
  phase_break: 0.7,
  laser_warning: 0.46,
  laser_fire: 0.62,
  battle_win: 0.72,
  battle_lose: 0.68,
};

const clampVolume = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.6));

/**
 * Shared application-level WebAudio bus.
 *
 * Playback and decoding are deliberately fire-and-forget so audio can never
 * block the fixed-step simulation. A failed clip is diagnosed once and then
 * remains silent for the rest of the page lifetime.
 */
export function createBattleSoundBus(
  sources: BattleSfxSources,
  options: BattleSoundBusOptions = {},
): BattleSoundBus {
  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let muted = options.muted ?? false;
  let volume = clampVolume(options.volume ?? 0.6);
  let destroyed = false;
  const buffers = new Map<BattleSfxId, AudioBuffer>();
  const loads = new Map<BattleSfxId, Promise<AudioBuffer | null>>();
  const failures = new Set<BattleSfxId>();
  const lastPlayedAt = new Map<BattleSfxId, number>();
  const activeNodes = new Set<AudioBufferSourceNode>();

  const ensureContext = () => {
    if (destroyed) return null;
    if (!context) {
      const AudioContextCtor = globalThis.AudioContext;
      if (!AudioContextCtor) return null;
      context = new AudioContextCtor();
      masterGain = context.createGain();
      masterGain.gain.value = muted ? 0 : volume;
      masterGain.connect(context.destination);
    }
    return context;
  };

  const load = (id: BattleSfxId) => {
    const cached = buffers.get(id);
    if (cached) return Promise.resolve(cached);
    const pending = loads.get(id);
    if (pending) return pending;
    const source = sources[id];
    if (!source || failures.has(id)) return Promise.resolve(null);
    const current = ensureContext();
    if (!current) return Promise.resolve(null);
    const task = fetch(source)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => current.decodeAudioData(bytes))
      .then((buffer) => {
        if (!destroyed) buffers.set(id, buffer);
        return destroyed ? null : buffer;
      })
      .catch((error) => {
        failures.add(id);
        console.warn(`[battle-sfx] ${id} 无法加载或解码`, error);
        return null;
      })
      .finally(() => loads.delete(id));
    loads.set(id, task);
    return task;
  };

  const unlock = async () => {
    const current = ensureContext();
    if (!current) return;
    if (current.state === 'suspended') {
      try {
        await current.resume();
      } catch {
        return;
      }
    }
    void Promise.all(
      (['player_shot', 'boss_hit', 'graze', 'player_miss', 'bomb'] as BattleSfxId[])
        .map((id) => load(id)),
    );
  };

  const play = (id: BattleSfxId) => {
    if (destroyed || muted || !sources[id]) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    const throttle = EVENT_THROTTLE_MS[id] ?? 0;
    if (now - (lastPlayedAt.get(id) ?? -Infinity) < throttle) return;
    lastPlayedAt.set(id, now);

    void (async () => {
      await unlock();
      const current = ensureContext();
      if (!current || destroyed || muted) return;
      const buffer = await load(id);
      if (!buffer || destroyed || muted) return;
      const node = current.createBufferSource();
      const gain = current.createGain();
      node.buffer = buffer;
      gain.gain.value = EVENT_GAIN[id];
      node.connect(gain);
      gain.connect(masterGain ?? current.destination);
      activeNodes.add(node);
      node.addEventListener('ended', () => activeNodes.delete(node), { once: true });
      node.start();
    })();
  };

  const setMuted = (next: boolean) => {
    muted = next;
    if (masterGain && context) masterGain.gain.setValueAtTime(muted ? 0 : volume, context.currentTime);
  };

  const setVolume = (next: number) => {
    volume = clampVolume(next);
    if (masterGain && context && !muted) masterGain.gain.setValueAtTime(volume, context.currentTime);
  };

  const onVisibilityChange = () => {
    if (!context || context.state === 'closed') return;
    if (document.hidden) void context.suspend();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    for (const node of activeNodes) {
      try { node.stop(); } catch { /* already ended */ }
    }
    activeNodes.clear();
    buffers.clear();
    loads.clear();
    if (context && context.state !== 'closed') void context.close();
    context = null;
    masterGain = null;
  };

  return { play, unlock, setMuted, setVolume, destroy };
}
