/**
 * Placeholder sound bus — SILENT by design.
 *
 * The simulation emits typed SFX events at every audible moment; this bus
 * swallows them. When the owner supplies audio assets, implement a real bus
 * behind the same interface (decode local data-URL clips via WebAudio, no
 * remote fetches) and swap it in at the single wiring point in
 * `battle-engine.ts`. Per-event asset requirements live in
 * `project/r49-placeholder-asset-spec.md`.
 *
 * Runtime rules for the future implementation:
 * - Assets must be embedded data: URLs (protocol forbids remote/local-path deps).
 * - Throttle high-frequency events (`player_shot`, `boss_hit`, `graze`) to
 *   ≥60ms between plays or mix at reduced gain — they fire many times/second.
 * - Never block the fixed-step loop: fire-and-forget only.
 * - Respect a user-facing mute (default ON=silent until assets exist).
 */

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

export interface BattleSoundBus {
  play(id: BattleSfxId): void;
}

/** Swallows every event; keeps the wiring live for a future real bus. */
export const nullSoundBus: BattleSoundBus = {
  play: () => {},
};
