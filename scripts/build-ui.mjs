import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';

const assetManifest = JSON.parse(await readFile('src/assets/asset-manifest.json', 'utf8'));
const localBulletAsset = assetManifest.battle_assets?.local_etama3_bullets;
if (!localBulletAsset?.source_alpha || localBulletAsset.runtime_scope !== 'project-package-and-distribution') {
  throw new Error('etama3 弹幕图集缺少项目运行与打包分发授权登记');
}
const localBulletSource = localBulletAsset.source_alpha;
const reimuPortraitAsset = assetManifest.battle_assets?.reimu_battle_portraits;
const reimuPortraitSources = reimuPortraitAsset?.sources;
if (
  reimuPortraitAsset?.runtime_embed !== 'direct-original-files'
  || !['s0', 's1', 's2'].every((state) => typeof reimuPortraitSources?.[state] === 'string')
) {
  throw new Error('灵梦 S0/S1/S2 立绘缺少直接导入登记');
}
const marisaPortraitAsset = assetManifest.battle_assets?.marisa_battle_portraits;
const marisaPortraitSources = marisaPortraitAsset?.sources;
if (
  marisaPortraitAsset?.runtime_embed !== 'direct-original-files'
  || !['s0', 's1', 's2'].every((state) => typeof marisaPortraitSources?.[state] === 'string')
) {
  throw new Error('魔理沙 S0/S1/S2 立绘缺少直接导入登记');
}
const alicePortraitAsset = assetManifest.battle_assets?.alice_battle_portraits;
const alicePortraitSources = alicePortraitAsset?.sources;
if (
  alicePortraitAsset?.runtime_embed !== 'direct-original-files'
  || !['s0', 's1', 's2'].every((state) => typeof alicePortraitSources?.[state] === 'string')
) {
  throw new Error('爱丽丝 S0/S1/S2 立绘缺少直接导入登记');
}
const cirnoPortraitAsset = assetManifest.battle_assets?.cirno_battle_portraits;
const cirnoPortraitSources = cirnoPortraitAsset?.sources;
if (
  cirnoPortraitAsset?.runtime_embed !== 'direct-original-files'
  || !['s0', 's1', 's2'].every((state) => typeof cirnoPortraitSources?.[state] === 'string')
) {
  throw new Error('琪露诺 S0/S1/S2 立绘缺少直接导入登记');
}
const mystiaPortraitAsset = assetManifest.battle_assets?.mystia_battle_portraits;
const mystiaPortraitSources = mystiaPortraitAsset?.sources;
if (
  mystiaPortraitAsset?.runtime_embed !== 'direct-original-files'
  || !['s0', 's1', 's2'].every((state) => typeof mystiaPortraitSources?.[state] === 'string')
) {
  throw new Error('米斯蒂娅 S0/S1/S2 立绘缺少直接导入登记');
}
const nitoriPortraitAsset = assetManifest.battle_assets?.nitori_battle_portraits;
const nitoriPortraitSources = nitoriPortraitAsset?.sources;
if (
  nitoriPortraitAsset?.runtime_embed !== 'direct-original-files'
  || !['s0', 's1', 's2'].every((state) => typeof nitoriPortraitSources?.[state] === 'string')
) {
  throw new Error('河城荷取 S0/S1/S2 立绘缺少直接导入登记');
}
const suikaPortraitAsset = assetManifest.battle_assets?.suika_battle_portraits;
const suikaPortraitSources = suikaPortraitAsset?.sources;
if (
  suikaPortraitAsset?.runtime_embed !== 'direct-original-files'
  || !['s0', 's1', 's2'].every((state) => typeof suikaPortraitSources?.[state] === 'string')
) {
  throw new Error('伊吹萃香 S0/S1/S2 立绘缺少直接导入登记');
}
const sakuyaPortraitAsset = assetManifest.battle_assets?.sakuya_battle_portraits;
const sakuyaPortraitSources = sakuyaPortraitAsset?.sources;
if (
  sakuyaPortraitAsset?.runtime_embed !== 'direct-original-files'
  || !['s0', 's1', 's2'].every((state) => typeof sakuyaPortraitSources?.[state] === 'string')
) {
  throw new Error('十六夜咲夜 S0/S1/S2 立绘缺少直接导入登记');
}
const flowerCorePortraitAsset = assetManifest.battle_assets?.flower_core_battle_portraits;
const flowerCorePortraitSources = flowerCorePortraitAsset?.sources;
if (
  flowerCorePortraitAsset?.runtime_embed !== 'direct-original-files'
  || !['s0', 's1', 's2'].every((state) => typeof flowerCorePortraitSources?.[state] === 'string')
) {
  throw new Error('温室花妖核心 S0/S1/S2 立绘缺少直接导入登记');
}
const fairyAsset = assetManifest.battle_assets?.fairy_mobs;
if (!fairyAsset?.source_alpha || fairyAsset.runtime_embed !== 'alpha-only') {
  throw new Error('妖精小怪图集缺少透明运行时素材登记');
}
const fairySource = fairyAsset.source_alpha;
const battleSfxIds = [
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
const battleSfxAsset = assetManifest.audio_assets?.battle_sfx;
if (battleSfxAsset?.runtime_embed !== 'wav-data-url') {
  throw new Error('弹幕音效缺少 WAV data URL 运行登记');
}
const battleSfxSources = Object.fromEntries(battleSfxIds.map((id) => {
  const event = battleSfxAsset.events?.[id];
  if (typeof event?.runtime !== 'string' || !/\.wav$/i.test(event.runtime)) {
    throw new Error(`弹幕音效 ${id} 缺少稳定 WAV 路径`);
  }
  if (!/^[a-f0-9]{64}$/.test(event.sha256 ?? '')) {
    throw new Error(`弹幕音效 ${id} 缺少 SHA-256`);
  }
  return [id, event.runtime];
}));
const battleSfxBytes = Object.fromEntries(await Promise.all(battleSfxIds.map(async (id) => {
  const bytes = await readFile(`src/assets/${battleSfxSources[id]}`);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== battleSfxAsset.events[id].sha256) {
    throw new Error(`弹幕音效 ${id} 的 SHA-256 与 manifest 不一致`);
  }
  return [id, bytes];
})));
const dungeonButtonSource = 'ui/reimu-dungeon-button-v1.png';
const shopButtonSource = 'ui/reimu-shop-button-v1.png';
const inventoryButtonSource = 'ui/marisa-inventory-button-v1.png';
const shopBackgroundSource = 'ui/reimu-shop-ui-background-v1.png';
const isNormalizedPoint = (value) => Array.isArray(value)
  && value.length === 2
  && value.every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1);
const validateFacilityGeometry = (id, geometry) => {
  if (!geometry) return;
  if (!Number.isFinite(geometry.width_ratio) || geometry.width_ratio < 0.05 || geometry.width_ratio > 0.5) {
    throw new Error(`地图设施 ${id} 的 geometry.width_ratio 越界`);
  }
  for (const key of ['render_center', 'ground_anchor', 'label_anchor']) {
    if (!isNormalizedPoint(geometry[key])) throw new Error(`地图设施 ${id} 的 geometry.${key} 非法`);
  }
  if (!Array.isArray(geometry.hit_polygon)
    || geometry.hit_polygon.length < 3
    || !geometry.hit_polygon.every(isNormalizedPoint)) {
    throw new Error(`地图设施 ${id} 的 geometry.hit_polygon 非法`);
  }
};
const galBackgroundAsset = assetManifest.ui_assets?.gal_shrine_background;
if (!galBackgroundAsset?.source_alpha || galBackgroundAsset.runtime_role !== 'gal-stage-background') {
  throw new Error('素材清单缺少 GAL 舞台背景 ui_assets.gal_shrine_background');
}
const galBackgroundSource = galBackgroundAsset.source_alpha;
const requiredGalReactions = ['neutral', 'smile', 'shy', 'sad', 'angry'];
const galPortraitAssets = Object.entries(assetManifest.gal_portraits ?? {}).map(([id, asset]) => {
  if (asset.runtime_embed !== 'direct-original-files') {
    throw new Error(`GAL 角色 ${id} 未登记为原文件直接导入`);
  }
  if (!Array.isArray(asset.canvas) || asset.canvas.length !== 2) {
    throw new Error(`GAL 角色 ${id} 缺少统一画布尺寸`);
  }
  for (const mode of ['normal', 'nude']) {
    if (!requiredGalReactions.every((reaction) => typeof asset.sources?.[mode]?.[reaction] === 'string')) {
      throw new Error(`GAL 角色 ${id} 的 ${mode} 五反应素材不完整`);
    }
  }
  return { id, sources: asset.sources };
});
const galPortraitSourcePaths = galPortraitAssets.flatMap(({ sources }) => (
  Object.values(sources).flatMap((modeSources) => Object.values(modeSources))
));
const gardenBaseAsset = assetManifest.maps?.garden_base;
if (!gardenBaseAsset?.source || gardenBaseAsset.runtime_role !== 'base-layer') {
  throw new Error('素材清单缺少运行时庭园底图 maps.garden_base');
}
const gardenNoWalkMaskAsset = assetManifest.maps?.garden_no_walk_mask;
if (
  !gardenNoWalkMaskAsset?.source
  || gardenNoWalkMaskAsset.runtime_role !== 'non-walkable-alpha-mask'
  || gardenNoWalkMaskAsset.alpha_contract !== 'transparent-walkable-alpha-gte-128-blocked'
  || JSON.stringify(gardenNoWalkMaskAsset.canvas) !== JSON.stringify(gardenBaseAsset.canvas)
) {
  throw new Error('庭园不可行走蒙版缺失、画布不一致或 alpha 契约非法');
}
const gardenNoWalkMaskSource = await readFile(`src/assets/${gardenNoWalkMaskAsset.source}`, 'utf8');
if (
  !gardenNoWalkMaskSource.includes(`width="${gardenBaseAsset.canvas[0]}"`)
  || !gardenNoWalkMaskSource.includes(`height="${gardenBaseAsset.canvas[1]}"`)
  || !gardenNoWalkMaskSource.includes(`viewBox="0 0 ${gardenBaseAsset.canvas.join(' ')}"`)
  || !gardenNoWalkMaskSource.includes('fill="#ff00ff"')
  || !gardenNoWalkMaskSource.includes('fill-rule="evenodd"')
) {
  throw new Error('庭园不可行走蒙版必须与底图同画布，并保留洋红阻挡区与桥面镂空');
}
const characterAssets = Object.entries(assetManifest.characters)
  .filter(([, character]) => character.map_usage)
  .map(([id, character]) => {
    if (!character.source_alpha || !character.animation_source_alpha) {
      throw new Error(`角色 ${id} 缺少静态图或移动动画透明图`);
    }
    return {
      id,
      idle: character.source_alpha,
      motion: character.animation_source_alpha,
      animation: character.animation_v2_source_alpha,
      sequence: character.animation_sequence_source_alpha,
    };
  });
if (characterAssets.length !== 8) {
  throw new Error(`庭园角色素材应为 8 组，实际为 ${characterAssets.length} 组`);
}

const mapFacilityAssets = Object.entries(assetManifest.map_facility_assets ?? {})
  .filter(([, facility]) => facility.map_usage)
  .map(([id, facility]) => {
    if (!facility.source_alpha || typeof facility.source_alpha === 'string') {
      throw new Error(`地图设施 ${id} 缺少按形态登记的透明贴图`);
    }
    if (!facility.area_id) throw new Error(`地图设施 ${id} 缺少显式 area_id`);
    validateFacilityGeometry(id, facility.geometry);
    return {
      id,
      areaId: facility.area_id,
      forms: facility.source_alpha,
      sources: [...new Set(Object.values(facility.source_alpha))],
      damageOverlay: facility.damage_overlay_alpha,
      damageReplacement: facility.damage_replacement_alpha,
      geometry: facility.geometry,
    };
  });
const validateFacilityPngGroup = async ({ id, sources, damageOverlay, damageReplacement }) => {
  const paths = [
    ...sources,
    ...(damageOverlay ? [damageOverlay] : []),
    ...(damageReplacement ? [damageReplacement] : []),
  ];
  const decoded = await Promise.all(paths.map(async (source) => {
    const png = PNG.sync.read(await readFile(`src/assets/${source}`));
    if (png.colorType !== 6) throw new Error(`地图设施 ${id} 的 ${source} 必须是 RGBA PNG`);
    if (png.width < 512 || png.width > 768) {
      throw new Error(`地图设施 ${id} 的 ${source} 宽度 ${png.width} 不在 512–768px`);
    }
    const border = 16;
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        const offset = (y * png.width + x) * 4;
        const alpha = png.data[offset + 3];
        if (alpha === 0 && (png.data[offset] || png.data[offset + 1] || png.data[offset + 2])) {
          throw new Error(`地图设施 ${id} 的 ${source} 透明像素保留隐藏 RGB`);
        }
        if ((x < border || x >= png.width - border || y < border || y >= png.height - border) && alpha !== 0) {
          throw new Error(`地图设施 ${id} 的 ${source} 不足 ${border}px 透明安全边`);
        }
      }
    }
    return { source, width: png.width, height: png.height };
  }));
  const [{ width, height }] = decoded;
  for (const image of decoded) {
    if (image.width !== width || image.height !== height) {
      throw new Error(`地图设施 ${id} 的同组形态或损坏素材画布不一致`);
    }
  }
};
await Promise.all(mapFacilityAssets.map(validateFacilityPngGroup));

await mkdir('dist/ui', { recursive: true });
await build({
  entryPoints: ['src/ui/app.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  outfile: 'dist/ui/app.js',
  sourcemap: true,
  legalComments: 'none',
});
const previewFacilitySprites = Object.fromEntries(mapFacilityAssets.map(({ id, areaId, forms, damageOverlay, damageReplacement, geometry }) => [
  id,
  {
    areaId,
    forms: Object.fromEntries(Object.entries(forms).map(([form, source]) => [form, `../assets/${source}`])),
    damageOverlay: damageOverlay ? `../assets/${damageOverlay}` : undefined,
    damageReplacement: damageReplacement ? `../assets/${damageReplacement}` : undefined,
    geometry,
  },
]));
const previewGalPortraitSources = Object.fromEntries(galPortraitAssets.map(({ id, sources }) => [
  id,
  Object.fromEntries(Object.entries(sources).map(([mode, modeSources]) => [
    mode,
    Object.fromEntries(Object.entries(modeSources).map(([reaction, source]) => [
      reaction,
      `../assets/${source}`,
    ])),
  ])),
]));
const previewHtml = (await readFile('src/ui/index.html', 'utf8')).replace(
  'data-asset-base="../assets"',
  `data-asset-base="../assets" data-map-src="../assets/${gardenBaseAsset.source}" data-map-no-walk-mask-src="../assets/${gardenNoWalkMaskAsset.source}" data-gal-background-src="../assets/${galBackgroundSource}" data-gal-portrait-sources='${JSON.stringify(previewGalPortraitSources)}' data-map-facility-sprites='${JSON.stringify(previewFacilitySprites)}' data-battle-sfx-sources='${JSON.stringify(Object.fromEntries(battleSfxIds.map((id) => [id, `../assets/${battleSfxSources[id]}`])))}'`,
);
await Promise.all([
  writeFile('dist/ui/index.html', previewHtml, 'utf8'),
  copyFile('src/ui/styles.css', 'dist/ui/styles.css'),
]);
await Promise.all([
  mkdir('dist/assets/maps', { recursive: true }),
  mkdir('dist/assets/ui', { recursive: true }),
  ...characterAssets.map(({ id }) => mkdir(`dist/assets/characters/${id}`, { recursive: true })),
  mkdir('dist/assets/world/house', { recursive: true }),
  mkdir('dist/assets/world/greenhouse', { recursive: true }),
  mkdir('dist/assets/battle/player', { recursive: true }),
  mkdir('dist/assets/battle/boss', { recursive: true }),
  mkdir('dist/assets/battle/portraits', { recursive: true }),
  mkdir('dist/assets/battle/effects', { recursive: true }),
  mkdir('dist/assets/audio/runtime/battle', { recursive: true }),
  ...galPortraitSourcePaths.map((source) => mkdir(dirname(`dist/assets/${source}`), { recursive: true })),
  ...mapFacilityAssets.flatMap(({ sources, damageOverlay, damageReplacement }) => [
    ...sources.map((source) => mkdir(dirname(`dist/assets/${source}`), { recursive: true })),
    ...(damageOverlay ? [mkdir(dirname(`dist/assets/${damageOverlay}`), { recursive: true })] : []),
    ...(damageReplacement ? [mkdir(dirname(`dist/assets/${damageReplacement}`), { recursive: true })] : []),
  ]),
]);
await Promise.all([
  copyFile(`src/assets/${gardenBaseAsset.source}`, `dist/assets/${gardenBaseAsset.source}`),
  copyFile(`src/assets/${gardenNoWalkMaskAsset.source}`, `dist/assets/${gardenNoWalkMaskAsset.source}`),
  copyFile(`src/assets/${dungeonButtonSource}`, `dist/assets/${dungeonButtonSource}`),
  copyFile(`src/assets/${shopButtonSource}`, `dist/assets/${shopButtonSource}`),
  copyFile(`src/assets/${inventoryButtonSource}`, `dist/assets/${inventoryButtonSource}`),
  copyFile(`src/assets/${shopBackgroundSource}`, `dist/assets/${shopBackgroundSource}`),
  copyFile(`src/assets/${galBackgroundSource}`, `dist/assets/${galBackgroundSource}`),
  ...galPortraitSourcePaths.map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...mapFacilityAssets.flatMap(({ sources, damageOverlay, damageReplacement }) => [
    ...sources.map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
    ...(damageOverlay ? [copyFile(`src/assets/${damageOverlay}`, `dist/assets/${damageOverlay}`)] : []),
    ...(damageReplacement ? [copyFile(`src/assets/${damageReplacement}`, `dist/assets/${damageReplacement}`)] : []),
  ]),
  ...characterAssets.flatMap(({ idle, motion, animation, sequence }) => [
    copyFile(`src/assets/${idle}`, `dist/assets/${idle}`),
    copyFile(`src/assets/${motion}`, `dist/assets/${motion}`),
    ...(animation ? [copyFile(`src/assets/${animation}`, `dist/assets/${animation}`)] : []),
    ...(sequence ? [copyFile(`src/assets/${sequence}`, `dist/assets/${sequence}`)] : []),
  ]),
  copyFile('src/assets/world/house/main-house-states-v1.png', 'dist/assets/world/house/main-house-states-v1.png'),
  copyFile('src/assets/world/greenhouse/magic-greenhouse-states-v1.png', 'dist/assets/world/greenhouse/magic-greenhouse-states-v1.png'),
  // Battle sheets only — never embed chroma authoring duplicates.
  copyFile('src/assets/battle/player/keycraft-player-sheet-v1.png', 'dist/assets/battle/player/keycraft-player-sheet-v1.png'),
  copyFile('src/assets/battle/boss/greenhouse-flower-core-sheet-v1.png', 'dist/assets/battle/boss/greenhouse-flower-core-sheet-v1.png'),
  copyFile('src/assets/battle/boss/reimu-battle-sheet-v1.png', 'dist/assets/battle/boss/reimu-battle-sheet-v1.png'),
  copyFile('src/assets/battle/boss/marisa-battle-sheet-v1.png', 'dist/assets/battle/boss/marisa-battle-sheet-v1.png'),
  copyFile('src/assets/battle/boss/cirno-battle-sheet-v1.png', 'dist/assets/battle/boss/cirno-battle-sheet-v1.png'),
  copyFile('src/assets/battle/boss/alice-battle-sheet-v1.png', 'dist/assets/battle/boss/alice-battle-sheet-v1.png'),
  copyFile('src/assets/battle/boss/nitori-battle-sheet-v1.png', 'dist/assets/battle/boss/nitori-battle-sheet-v1.png'),
  copyFile('src/assets/battle/boss/mystia-battle-sheet-v1.png', 'dist/assets/battle/boss/mystia-battle-sheet-v1.png'),
  copyFile('src/assets/battle/boss/suika-battle-sheet-v1.png', 'dist/assets/battle/boss/suika-battle-sheet-v1.png'),
  copyFile('src/assets/battle/boss/sakuya-battle-sheet-v1.png', 'dist/assets/battle/boss/sakuya-battle-sheet-v1.png'),
  ...Object.values(reimuPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(marisaPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(alicePortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(cirnoPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(mystiaPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(nitoriPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(suikaPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(sakuyaPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(flowerCorePortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  copyFile(`src/assets/${fairySource}`, `dist/assets/${fairySource}`),
  copyFile('src/assets/battle/effects/battle-effects-sheet-v1.png', 'dist/assets/battle/effects/battle-effects-sheet-v1.png'),
  copyFile(`src/assets/${localBulletSource}`, `dist/assets/${localBulletSource}`),
  ...battleSfxIds.map((id) => copyFile(
    `src/assets/${battleSfxSources[id]}`,
    `dist/assets/${battleSfxSources[id]}`,
  )),
]);

const [
  html,
  css,
  appJs,
  mapBytes,
  mapNoWalkMaskBytes,
  dungeonButtonBytes,
  shopButtonBytes,
  inventoryButtonBytes,
  shopBackgroundBytes,
  galBackgroundBytes,
  mainHouseBytes,
  greenhouseBytes,
  battlePlayerBytes,
  battleBossBytes,
  battleBossReimuBytes,
  battleBossMarisaBytes,
  battleBossCirnoBytes,
  battleBossAliceBytes,
  battleBossNitoriBytes,
  battleBossMystiaBytes,
  battleBossSuikaBytes,
  battleBossSakuyaBytes,
  battlePortraitReimuS0Bytes,
  battlePortraitReimuS1Bytes,
  battlePortraitReimuS2Bytes,
  battlePortraitMarisaS0Bytes,
  battlePortraitMarisaS1Bytes,
  battlePortraitMarisaS2Bytes,
  battlePortraitAliceS0Bytes,
  battlePortraitAliceS1Bytes,
  battlePortraitAliceS2Bytes,
  battlePortraitCirnoS0Bytes,
  battlePortraitCirnoS1Bytes,
  battlePortraitCirnoS2Bytes,
  battlePortraitMystiaS0Bytes,
  battlePortraitMystiaS1Bytes,
  battlePortraitMystiaS2Bytes,
  battlePortraitNitoriS0Bytes,
  battlePortraitNitoriS1Bytes,
  battlePortraitNitoriS2Bytes,
  battlePortraitSuikaS0Bytes,
  battlePortraitSuikaS1Bytes,
  battlePortraitSuikaS2Bytes,
  battlePortraitSakuyaS0Bytes,
  battlePortraitSakuyaS1Bytes,
  battlePortraitSakuyaS2Bytes,
  battlePortraitFlowerCoreS0Bytes,
  battlePortraitFlowerCoreS1Bytes,
  battlePortraitFlowerCoreS2Bytes,
  battleFairyBytes,
  battleEffectsBytes,
  battleBulletsLocalBytes,
  hostShellSource,
] = await Promise.all([
  readFile('dist/ui/index.html', 'utf8'),
  readFile('dist/ui/styles.css', 'utf8'),
  readFile('dist/ui/app.js', 'utf8'),
  readFile(`src/assets/${gardenBaseAsset.source}`),
  readFile(`src/assets/${gardenNoWalkMaskAsset.source}`),
  readFile(`src/assets/${dungeonButtonSource}`),
  readFile(`src/assets/${shopButtonSource}`),
  readFile(`src/assets/${inventoryButtonSource}`),
  readFile(`src/assets/${shopBackgroundSource}`),
  readFile(`src/assets/${galBackgroundSource}`),
  readFile('src/assets/world/house/main-house-states-v1.png'),
  readFile('src/assets/world/greenhouse/magic-greenhouse-states-v1.png'),
  readFile('src/assets/battle/player/keycraft-player-sheet-v1.png'),
  readFile('src/assets/battle/boss/greenhouse-flower-core-sheet-v1.png'),
  readFile('src/assets/battle/boss/reimu-battle-sheet-v1.png'),
  readFile('src/assets/battle/boss/marisa-battle-sheet-v1.png'),
  readFile('src/assets/battle/boss/cirno-battle-sheet-v1.png'),
  readFile('src/assets/battle/boss/alice-battle-sheet-v1.png'),
  readFile('src/assets/battle/boss/nitori-battle-sheet-v1.png'),
  readFile('src/assets/battle/boss/mystia-battle-sheet-v1.png'),
  readFile('src/assets/battle/boss/suika-battle-sheet-v1.png'),
  readFile('src/assets/battle/boss/sakuya-battle-sheet-v1.png'),
  readFile(`src/assets/${reimuPortraitSources.s0}`),
  readFile(`src/assets/${reimuPortraitSources.s1}`),
  readFile(`src/assets/${reimuPortraitSources.s2}`),
  readFile(`src/assets/${marisaPortraitSources.s0}`),
  readFile(`src/assets/${marisaPortraitSources.s1}`),
  readFile(`src/assets/${marisaPortraitSources.s2}`),
  readFile(`src/assets/${alicePortraitSources.s0}`),
  readFile(`src/assets/${alicePortraitSources.s1}`),
  readFile(`src/assets/${alicePortraitSources.s2}`),
  readFile(`src/assets/${cirnoPortraitSources.s0}`),
  readFile(`src/assets/${cirnoPortraitSources.s1}`),
  readFile(`src/assets/${cirnoPortraitSources.s2}`),
  readFile(`src/assets/${mystiaPortraitSources.s0}`),
  readFile(`src/assets/${mystiaPortraitSources.s1}`),
  readFile(`src/assets/${mystiaPortraitSources.s2}`),
  readFile(`src/assets/${nitoriPortraitSources.s0}`),
  readFile(`src/assets/${nitoriPortraitSources.s1}`),
  readFile(`src/assets/${nitoriPortraitSources.s2}`),
  readFile(`src/assets/${suikaPortraitSources.s0}`),
  readFile(`src/assets/${suikaPortraitSources.s1}`),
  readFile(`src/assets/${suikaPortraitSources.s2}`),
  readFile(`src/assets/${sakuyaPortraitSources.s0}`),
  readFile(`src/assets/${sakuyaPortraitSources.s1}`),
  readFile(`src/assets/${sakuyaPortraitSources.s2}`),
  readFile(`src/assets/${flowerCorePortraitSources.s0}`),
  readFile(`src/assets/${flowerCorePortraitSources.s1}`),
  readFile(`src/assets/${flowerCorePortraitSources.s2}`),
  readFile(`src/assets/${fairySource}`),
  readFile('src/assets/battle/effects/battle-effects-sheet-v1.png'),
  readFile(`src/assets/${localBulletSource}`),
  readFile('src/runtime/ui-host-shell.js', 'utf8'),
]);
const body = html.match(/<body>([\s\S]*?)<script src="\.\/app\.js"><\/script>[\s\S]*?<\/body>/i)?.[1];
if (!body) throw new Error('无法提取 UI body');
const mapDataUrl = `data:image/png;base64,${mapBytes.toString('base64')}`;
const mapNoWalkMaskDataUrl = `data:image/svg+xml;base64,${mapNoWalkMaskBytes.toString('base64')}`;
const dungeonButtonDataUrl = `data:image/png;base64,${dungeonButtonBytes.toString('base64')}`;
const shopButtonDataUrl = `data:image/png;base64,${shopButtonBytes.toString('base64')}`;
const inventoryButtonDataUrl = `data:image/png;base64,${inventoryButtonBytes.toString('base64')}`;
const shopBackgroundDataUrl = `data:image/png;base64,${shopBackgroundBytes.toString('base64')}`;
const galBackgroundDataUrl = `data:image/png;base64,${galBackgroundBytes.toString('base64')}`;
const characterSpriteDataUrls = Object.fromEntries(await Promise.all(characterAssets.map(async ({ id, idle, motion, animation, sequence }) => {
  const [idleBytes, motionBytes, animationBytes, sequenceBytes] = await Promise.all([
    readFile(`src/assets/${idle}`),
    readFile(`src/assets/${motion}`),
    animation ? readFile(`src/assets/${animation}`) : Promise.resolve(null),
    sequence ? readFile(`src/assets/${sequence}`) : Promise.resolve(null),
  ]);
  return [id, {
    idle: `data:image/png;base64,${idleBytes.toString('base64')}`,
    motion: `data:image/png;base64,${motionBytes.toString('base64')}`,
    animation: animationBytes ? `data:image/png;base64,${animationBytes.toString('base64')}` : undefined,
    sequence: sequenceBytes ? `data:image/png;base64,${sequenceBytes.toString('base64')}` : undefined,
  }];
})));
const mainHouseDataUrl = `data:image/png;base64,${mainHouseBytes.toString('base64')}`;
const greenhouseDataUrl = `data:image/png;base64,${greenhouseBytes.toString('base64')}`;
const mapFacilityDataUrls = Object.fromEntries(await Promise.all(mapFacilityAssets.map(async ({ id, areaId, forms, damageOverlay, damageReplacement, geometry }) => {
  const formEntries = await Promise.all(Object.entries(forms).map(async ([form, source]) => [
    form,
    `data:image/png;base64,${(await readFile(`src/assets/${source}`)).toString('base64')}`,
  ]));
  const overlay = damageOverlay
    ? `data:image/png;base64,${(await readFile(`src/assets/${damageOverlay}`)).toString('base64')}`
    : undefined;
  const replacement = damageReplacement
    ? `data:image/png;base64,${(await readFile(`src/assets/${damageReplacement}`)).toString('base64')}`
    : undefined;
  return [id, {
    areaId,
    forms: Object.fromEntries(formEntries),
    damageOverlay: overlay,
    damageReplacement: replacement,
    geometry,
  }];
})));
const battlePlayerDataUrl = `data:image/png;base64,${battlePlayerBytes.toString('base64')}`;
const battleBossDataUrl = `data:image/png;base64,${battleBossBytes.toString('base64')}`;
const battleBossReimuDataUrl = `data:image/png;base64,${battleBossReimuBytes.toString('base64')}`;
const battleBossMarisaDataUrl = `data:image/png;base64,${battleBossMarisaBytes.toString('base64')}`;
const battleBossCirnoDataUrl = `data:image/png;base64,${battleBossCirnoBytes.toString('base64')}`;
const battleBossAliceDataUrl = `data:image/png;base64,${battleBossAliceBytes.toString('base64')}`;
const battleBossNitoriDataUrl = `data:image/png;base64,${battleBossNitoriBytes.toString('base64')}`;
const battleBossMystiaDataUrl = `data:image/png;base64,${battleBossMystiaBytes.toString('base64')}`;
const battleBossSuikaDataUrl = `data:image/png;base64,${battleBossSuikaBytes.toString('base64')}`;
const battleBossSakuyaDataUrl = `data:image/png;base64,${battleBossSakuyaBytes.toString('base64')}`;
const battlePortraitReimuS0DataUrl = `data:image/png;base64,${battlePortraitReimuS0Bytes.toString('base64')}`;
const battlePortraitReimuS1DataUrl = `data:image/png;base64,${battlePortraitReimuS1Bytes.toString('base64')}`;
const battlePortraitReimuS2DataUrl = `data:image/png;base64,${battlePortraitReimuS2Bytes.toString('base64')}`;
const battlePortraitMarisaS0DataUrl = `data:image/png;base64,${battlePortraitMarisaS0Bytes.toString('base64')}`;
const battlePortraitMarisaS1DataUrl = `data:image/png;base64,${battlePortraitMarisaS1Bytes.toString('base64')}`;
const battlePortraitMarisaS2DataUrl = `data:image/png;base64,${battlePortraitMarisaS2Bytes.toString('base64')}`;
const battlePortraitAliceS0DataUrl = `data:image/png;base64,${battlePortraitAliceS0Bytes.toString('base64')}`;
const battlePortraitAliceS1DataUrl = `data:image/png;base64,${battlePortraitAliceS1Bytes.toString('base64')}`;
const battlePortraitAliceS2DataUrl = `data:image/png;base64,${battlePortraitAliceS2Bytes.toString('base64')}`;
const battlePortraitCirnoS0DataUrl = `data:image/png;base64,${battlePortraitCirnoS0Bytes.toString('base64')}`;
const battlePortraitCirnoS1DataUrl = `data:image/png;base64,${battlePortraitCirnoS1Bytes.toString('base64')}`;
const battlePortraitCirnoS2DataUrl = `data:image/png;base64,${battlePortraitCirnoS2Bytes.toString('base64')}`;
const battlePortraitMystiaS0DataUrl = `data:image/png;base64,${battlePortraitMystiaS0Bytes.toString('base64')}`;
const battlePortraitMystiaS1DataUrl = `data:image/png;base64,${battlePortraitMystiaS1Bytes.toString('base64')}`;
const battlePortraitMystiaS2DataUrl = `data:image/png;base64,${battlePortraitMystiaS2Bytes.toString('base64')}`;
const battlePortraitNitoriS0DataUrl = `data:image/png;base64,${battlePortraitNitoriS0Bytes.toString('base64')}`;
const battlePortraitNitoriS1DataUrl = `data:image/png;base64,${battlePortraitNitoriS1Bytes.toString('base64')}`;
const battlePortraitNitoriS2DataUrl = `data:image/png;base64,${battlePortraitNitoriS2Bytes.toString('base64')}`;
const battlePortraitSuikaS0DataUrl = `data:image/png;base64,${battlePortraitSuikaS0Bytes.toString('base64')}`;
const battlePortraitSuikaS1DataUrl = `data:image/png;base64,${battlePortraitSuikaS1Bytes.toString('base64')}`;
const battlePortraitSuikaS2DataUrl = `data:image/png;base64,${battlePortraitSuikaS2Bytes.toString('base64')}`;
const battlePortraitSakuyaS0DataUrl = `data:image/png;base64,${battlePortraitSakuyaS0Bytes.toString('base64')}`;
const battlePortraitSakuyaS1DataUrl = `data:image/png;base64,${battlePortraitSakuyaS1Bytes.toString('base64')}`;
const battlePortraitSakuyaS2DataUrl = `data:image/png;base64,${battlePortraitSakuyaS2Bytes.toString('base64')}`;
const battlePortraitFlowerCoreS0DataUrl = `data:image/png;base64,${battlePortraitFlowerCoreS0Bytes.toString('base64')}`;
const battlePortraitFlowerCoreS1DataUrl = `data:image/png;base64,${battlePortraitFlowerCoreS1Bytes.toString('base64')}`;
const battlePortraitFlowerCoreS2DataUrl = `data:image/png;base64,${battlePortraitFlowerCoreS2Bytes.toString('base64')}`;
const battleFairyDataUrl = `data:image/png;base64,${battleFairyBytes.toString('base64')}`;
const battleEffectsDataUrl = `data:image/png;base64,${battleEffectsBytes.toString('base64')}`;
const battleBulletsLocalDataUrl = `data:image/png;base64,${battleBulletsLocalBytes.toString('base64')}`;
const battleSfxDataUrls = Object.fromEntries(battleSfxIds.map((id) => [
  id,
  `data:audio/wav;base64,${battleSfxBytes[id].toString('base64')}`,
]));
const galPortraitDataUrls = Object.fromEntries(await Promise.all(galPortraitAssets.map(async ({ id, sources }) => [
  id,
  Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([mode, modeSources]) => [
    mode,
    Object.fromEntries(await Promise.all(Object.entries(modeSources).map(async ([reaction, source]) => [
      reaction,
      `data:image/png;base64,${(await readFile(`src/assets/${source}`)).toString('base64')}`,
    ]))),
  ]))),
])));
const embedded = {
  body,
  css,
  appJs,
  mapDataUrl,
  mapNoWalkMaskDataUrl,
  dungeonButtonDataUrl,
  shopButtonDataUrl,
  inventoryButtonDataUrl,
  shopBackgroundDataUrl,
  galBackgroundDataUrl,
  galPortraitDataUrls,
  characterSpriteDataUrls,
  mainHouseDataUrl,
  greenhouseDataUrl,
  mapFacilityDataUrls,
  battlePlayerDataUrl,
  battleBossDataUrl,
  battleBossReimuDataUrl,
  battleBossMarisaDataUrl,
  battleBossCirnoDataUrl,
  battleBossAliceDataUrl,
  battleBossNitoriDataUrl,
  battleBossMystiaDataUrl,
  battleBossSuikaDataUrl,
  battleBossSakuyaDataUrl,
  battlePortraitReimuS0DataUrl,
  battlePortraitReimuS1DataUrl,
  battlePortraitReimuS2DataUrl,
  battlePortraitMarisaS0DataUrl,
  battlePortraitMarisaS1DataUrl,
  battlePortraitMarisaS2DataUrl,
  battlePortraitAliceS0DataUrl,
  battlePortraitAliceS1DataUrl,
  battlePortraitAliceS2DataUrl,
  battlePortraitCirnoS0DataUrl,
  battlePortraitCirnoS1DataUrl,
  battlePortraitCirnoS2DataUrl,
  battlePortraitMystiaS0DataUrl,
  battlePortraitMystiaS1DataUrl,
  battlePortraitMystiaS2DataUrl,
  battlePortraitNitoriS0DataUrl,
  battlePortraitNitoriS1DataUrl,
  battlePortraitNitoriS2DataUrl,
  battlePortraitSuikaS0DataUrl,
  battlePortraitSuikaS1DataUrl,
  battlePortraitSuikaS2DataUrl,
  battlePortraitSakuyaS0DataUrl,
  battlePortraitSakuyaS1DataUrl,
  battlePortraitSakuyaS2DataUrl,
  battlePortraitFlowerCoreS0DataUrl,
  battlePortraitFlowerCoreS1DataUrl,
  battlePortraitFlowerCoreS2DataUrl,
  battleFairyDataUrl,
  battleEffectsDataUrl,
  battleBulletsLocalDataUrl,
  battleSfxDataUrls,
};
const enhancedMountBundle = [
  '// generated by scripts/build-ui.mjs — local trusted binder only',
  `const embedded = ${JSON.stringify(embedded)};`,
  hostShellSource,
].join('\n');
await mkdir('dist/runtime', { recursive: true });
await writeFile('dist/runtime/ui-mount.js', enhancedMountBundle, 'utf8');
