import { posix } from 'node:path';

const BATTLE_SFX_IDS = [
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

const BATTLE_SINGLE_ASSET_IDS = [
  'greenhouse_flower_core',
  'reimu_battle',
  'marisa_battle',
  'cirno_battle',
  'alice_battle',
  'nitori_battle',
  'mystia_battle',
  'suika_battle',
  'sakuya_battle',
  'common_effects',
  'fairy_mobs',
  'local_etama3_bullets',
];

const BATTLE_PORTRAIT_IDS = [
  'reimu_battle_portraits',
  'marisa_battle_portraits',
  'alice_battle_portraits',
  'cirno_battle_portraits',
  'mystia_battle_portraits',
  'nitori_battle_portraits',
  'suika_battle_portraits',
  'sakuya_battle_portraits',
  'flower_core_battle_portraits',
];

const UI_ASSET_IDS = [
  'dungeon_button',
  'shop_button',
  'inventory_button',
  'shop_background',
  'gal_shrine_background',
];

const WORLD_ASSET_IDS = ['main_house_states', 'magic_greenhouse_states'];

const assertString = (value, label) => {
  if (typeof value !== 'string' || !value) throw new Error(`${label} 缺少运行时素材路径`);
  return value;
};

const fallbackFor = (source) => {
  if (source.startsWith('audio/')) return 'silent';
  if (source.includes('no-walk-mask')) return 'navigation-failed-open';
  if (source.startsWith('characters/')) return 'character-registry-fallback';
  if (source.startsWith('battle/')) return 'battle-renderer-fallback';
  return 'ui-visual-fallback';
};

const schedulingFor = (source, category) => {
  const isGal = category.startsWith('gal.') || source === 'ui/gensokyo-gal-shrine-background-v1.png';
  if (isGal) return {
    priority_class: 'gal-deferred',
    bundle: category.startsWith('gal.') ? `gal:${category.split('.')[1]}` : 'gal:stage',
    trigger: 'gal-idle-or-demand',
    entry_gate: 'none',
    category: 'gal',
  };
  if (category === 'maps') return {
    priority_class: 'entry-critical', bundle: 'entry:map', trigger: 'opening-background', entry_gate: 'critical', category: 'map',
  };
  if (category === 'ui' && /(?:dungeon|shop|inventory)-button/.test(source)) return {
    priority_class: 'entry-critical', bundle: 'entry:navigation', trigger: 'opening-background', entry_gate: 'critical', category: 'ui',
  };
  if (category.startsWith('characters.')) return {
    priority_class: 'entry-contextual', bundle: `character:${category.split('.')[1]}`, trigger: 'presence-state', entry_gate: 'contextual', category: 'character',
  };
  if (category.startsWith('world.map_facility.')) return {
    priority_class: 'entry-contextual', bundle: `facility:${category.split('.')[2]}`, trigger: 'facility-state', entry_gate: 'contextual', category: 'facility',
  };
  if (category.startsWith('battle.')) return {
    priority_class: 'scene-on-demand', bundle: 'scene:battle', trigger: 'battle-entry-or-background', entry_gate: 'none', category: 'battle',
  };
  if (category.startsWith('audio.')) return {
    priority_class: 'background-core', bundle: 'scene:battle', trigger: 'background-after-entry', entry_gate: 'none', category: 'audio',
  };
  if (category === 'ui') return {
    priority_class: 'background-core', bundle: 'scene:ui', trigger: 'background-after-entry', entry_gate: 'none', category: 'ui',
  };
  return {
    priority_class: 'background-core', bundle: 'world:shared', trigger: 'background-after-entry', entry_gate: 'none', category: 'world',
  };
};

const validateSource = (source) => {
  const normalized = posix.normalize(source.replaceAll('\\', '/'));
  if (
    normalized !== source
    || normalized.startsWith('../')
    || posix.isAbsolute(normalized)
    || !/^[\x20-\x7e]+$/.test(normalized)
  ) {
    throw new Error(`运行时素材路径必须是 src/assets 下的 ASCII 相对路径：${source}`);
  }
  if (
    /(?:^|\/)(?:source|frames)(?:\/|$)/i.test(normalized)
    || /(?:^|\/)(?:旧素材)(?:\/|$)/u.test(normalized)
    || /-chroma\./i.test(normalized)
    || /\.(?:aseprite|psd|kra)$/i.test(normalized)
  ) {
    throw new Error(`维护源或历史素材不得进入 R2 release：${source}`);
  }
  return normalized;
};

export function collectRuntimeAssets(assetManifest) {
  const entries = new Map();
  const add = (source, category) => {
    const normalized = validateSource(assertString(source, category));
    const existing = entries.get(normalized);
    if (existing) return;
    const scheduling = schedulingFor(normalized, category);
    entries.set(normalized, {
      logical_id: `asset:${normalized}`,
      source: normalized,
      ...scheduling,
      required: scheduling.entry_gate !== 'none',
      fallback: fallbackFor(normalized),
      cache: 'must-revalidate',
    });
  };

  add(assetManifest.maps?.garden_base?.source, 'maps');
  add(assetManifest.maps?.garden_no_walk_mask?.source, 'maps');

  for (const id of UI_ASSET_IDS) add(assetManifest.ui_assets?.[id]?.source_alpha, 'ui');

  for (const [characterId, character] of Object.entries(assetManifest.characters ?? {})) {
    if (!character.map_usage) continue;
    add(character.source_alpha, `characters.${characterId}.idle`);
    add(character.animation_source_alpha, `characters.${characterId}.motion`);
    if (character.animation_v2_source_alpha) add(character.animation_v2_source_alpha, `characters.${characterId}.animation_v2`);
    if (character.animation_sequence_source_alpha) add(character.animation_sequence_source_alpha, `characters.${characterId}.sequence`);
  }

  for (const [characterId, portrait] of Object.entries(assetManifest.gal_portraits ?? {})) {
    for (const [mode, reactions] of Object.entries(portrait.sources ?? {})) {
      for (const [reaction, source] of Object.entries(reactions ?? {})) {
        add(source, `gal.${characterId}.${mode}.${reaction}`);
      }
    }
  }

  for (const [facilityId, facility] of Object.entries(assetManifest.map_facility_assets ?? {})) {
    if (!facility.map_usage) continue;
    for (const [form, source] of Object.entries(facility.source_alpha ?? {})) {
      add(source, `world.map_facility.${facilityId}.${form}`);
    }
    if (facility.damage_overlay_alpha) add(facility.damage_overlay_alpha, `world.map_facility.${facilityId}.damage_overlay`);
    if (facility.damage_replacement_alpha) add(facility.damage_replacement_alpha, `world.map_facility.${facilityId}.damage_replacement`);
  }

  for (const id of WORLD_ASSET_IDS) add(assetManifest.world_assets?.[id]?.source_alpha, `world.${id}`);
  add(assetManifest.player?.source_alpha, 'battle.player');

  for (const id of BATTLE_SINGLE_ASSET_IDS) {
    add(assetManifest.battle_assets?.[id]?.source_alpha, `battle.${id}`);
  }
  for (const id of BATTLE_PORTRAIT_IDS) {
    for (const [state, source] of Object.entries(assetManifest.battle_assets?.[id]?.sources ?? {})) {
      add(source, `battle.${id}.${state}`);
    }
  }

  const sfx = assetManifest.audio_assets?.battle_sfx;
  for (const id of BATTLE_SFX_IDS) add(sfx?.events?.[id]?.runtime, `audio.battle_sfx.${id}`);

  return [...entries.values()].sort((left, right) => left.source.localeCompare(right.source, 'en'));
}

export const runtimeAssetConstants = {
  BATTLE_SFX_IDS,
  BATTLE_SINGLE_ASSET_IDS,
  BATTLE_PORTRAIT_IDS,
  UI_ASSET_IDS,
  WORLD_ASSET_IDS,
};
