import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';

const assetManifest = JSON.parse(await readFile('src/assets/asset-manifest.json', 'utf8'));
const localBulletAsset = assetManifest.battle_assets?.local_etama3_bullets;
if (!localBulletAsset?.source_alpha || localBulletAsset.runtime_scope !== 'project-package-and-distribution') {
  throw new Error('etama3 弹幕图集缺少项目运行与打包分发授权登记');
}
const localBulletSource = localBulletAsset.source_alpha;
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
const gardenBaseAsset = assetManifest.maps?.garden_base;
if (!gardenBaseAsset?.source || gardenBaseAsset.runtime_role !== 'base-layer') {
  throw new Error('素材清单缺少运行时庭园底图 maps.garden_base');
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
const previewHtml = (await readFile('src/ui/index.html', 'utf8')).replace(
  'data-asset-base="../assets"',
  `data-asset-base="../assets" data-map-src="../assets/${gardenBaseAsset.source}" data-gal-background-src="../assets/${galBackgroundSource}" data-map-facility-sprites='${JSON.stringify(previewFacilitySprites)}'`,
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
  mkdir('dist/assets/battle/effects', { recursive: true }),
  ...mapFacilityAssets.flatMap(({ sources, damageOverlay, damageReplacement }) => [
    ...sources.map((source) => mkdir(dirname(`dist/assets/${source}`), { recursive: true })),
    ...(damageOverlay ? [mkdir(dirname(`dist/assets/${damageOverlay}`), { recursive: true })] : []),
    ...(damageReplacement ? [mkdir(dirname(`dist/assets/${damageReplacement}`), { recursive: true })] : []),
  ]),
]);
await Promise.all([
  copyFile(`src/assets/${gardenBaseAsset.source}`, `dist/assets/${gardenBaseAsset.source}`),
  copyFile(`src/assets/${dungeonButtonSource}`, `dist/assets/${dungeonButtonSource}`),
  copyFile(`src/assets/${shopButtonSource}`, `dist/assets/${shopButtonSource}`),
  copyFile(`src/assets/${inventoryButtonSource}`, `dist/assets/${inventoryButtonSource}`),
  copyFile(`src/assets/${shopBackgroundSource}`, `dist/assets/${shopBackgroundSource}`),
  copyFile(`src/assets/${galBackgroundSource}`, `dist/assets/${galBackgroundSource}`),
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
  // Transparent battle sheets only — never embed chroma authoring duplicates.
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
  copyFile('src/assets/battle/effects/battle-effects-sheet-v1.png', 'dist/assets/battle/effects/battle-effects-sheet-v1.png'),
  copyFile(`src/assets/${localBulletSource}`, `dist/assets/${localBulletSource}`),
]);

const [
  html,
  css,
  appJs,
  mapBytes,
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
  battleEffectsBytes,
  battleBulletsLocalBytes,
  hostShellSource,
] = await Promise.all([
  readFile('dist/ui/index.html', 'utf8'),
  readFile('dist/ui/styles.css', 'utf8'),
  readFile('dist/ui/app.js', 'utf8'),
  readFile(`src/assets/${gardenBaseAsset.source}`),
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
  readFile('src/assets/battle/effects/battle-effects-sheet-v1.png'),
  readFile(`src/assets/${localBulletSource}`),
  readFile('src/runtime/ui-host-shell.js', 'utf8'),
]);
const body = html.match(/<body>([\s\S]*?)<script src="\.\/app\.js"><\/script>[\s\S]*?<\/body>/i)?.[1];
if (!body) throw new Error('无法提取 UI body');
const mapDataUrl = `data:image/png;base64,${mapBytes.toString('base64')}`;
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
const battleEffectsDataUrl = `data:image/png;base64,${battleEffectsBytes.toString('base64')}`;
const battleBulletsLocalDataUrl = `data:image/png;base64,${battleBulletsLocalBytes.toString('base64')}`;
const embedded = {
  body,
  css,
  appJs,
  mapDataUrl,
  dungeonButtonDataUrl,
  shopButtonDataUrl,
  inventoryButtonDataUrl,
  shopBackgroundDataUrl,
  galBackgroundDataUrl,
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
  battleEffectsDataUrl,
  battleBulletsLocalDataUrl,
};
const enhancedMountBundle = [
  '// generated by scripts/build-ui.mjs — local trusted binder only',
  `const embedded = ${JSON.stringify(embedded)};`,
  hostShellSource,
].join('\n');
await mkdir('dist/runtime', { recursive: true });
await writeFile('dist/runtime/ui-mount.js', enhancedMountBundle, 'utf8');
