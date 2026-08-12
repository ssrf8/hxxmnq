import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve as resolvePath } from 'node:path';
import { PNG } from 'pngjs';

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const exists = async (file) => access(file).then(() => true, () => false);

const buildArgs = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));
// B4-O01 裁定：memory profile 是显式构建输入，缺失/非法值一律构建失败；
// 所有 package script 必须显式传 --memory-profile。
const MEMORY_PROFILES = ['standalone-mvu', 'database-assisted'];
const memoryProfile = buildArgs['memory-profile'];
if (!MEMORY_PROFILES.includes(memoryProfile)) {
  throw new Error('--memory-profile=standalone-mvu|database-assisted 只允许这两个合法值（缺失/空值/第三种值均失败）');
}
const uiDelivery = buildArgs['ui-delivery'] ?? 'embedded';
if (!['embedded', 'remote'].includes(uiDelivery)) throw new Error('--ui-delivery 只允许 embedded 或 remote');
// 通道固定映射：正式版 /live/ui/（r<N>），测试版 /test/ui/（test-r<N>-g<12hex>）。
// 不允许通过命令行传任意前缀，脚本只能从这张固定通道表选择。
const UI_CHANNELS = {
  production: {
    uiPrefix: 'gensokyo-moving-garden/live/ui',
    versionPattern: /^r[1-9]\d*$/,
    outputDir: 'dist/runtime',
  },
  test: {
    uiPrefix: 'gensokyo-moving-garden/test/ui',
    versionPattern: /^test-r[1-9]\d*$/,
    outputDir: 'dist/runtime/test',
  },
};
const uiChannel = buildArgs['ui-channel'] ?? 'production';
if (!Object.hasOwn(UI_CHANNELS, uiChannel)) throw new Error('--ui-channel 只允许 production 或 test');
const channelConfig = UI_CHANNELS[uiChannel];
let uiVersion = buildArgs['ui-version'];
if (uiDelivery === 'remote') {
  if (buildArgs['ui-channel'] === undefined) {
    throw new Error('远程 UI 构建必须显式传入 --ui-channel=production|test');
  }
  if (typeof uiVersion !== 'string' || !channelConfig.versionPattern.test(uiVersion)) {
    const sample = uiChannel === 'test' ? 'test-r9' : 'r95';
    throw new Error(`--ui-delivery=remote 必须显式提供符合 ${uiChannel} 通道格式的 --ui-version（例如 ${sample}）`);
  }
}
const assetMode = buildArgs['asset-mode'] ?? 'embedded';
let remoteAssetConfig = null;
if (assetMode !== 'embedded') {
  if (assetMode !== 'remote-r2-live') throw new Error('--asset-mode 只允许 embedded 或 remote-r2-live');
  if (typeof buildArgs['asset-base-url'] !== 'string') throw new Error('remote-r2-live 构建必须显式提供 --asset-base-url');
  const baseUrl = new URL(buildArgs['asset-base-url']);
  if (
    baseUrl.protocol !== 'https:'
    || baseUrl.username
    || baseUrl.password
    || baseUrl.search
    || baseUrl.hash
    || baseUrl.pathname !== '/'
  ) throw new Error('remote-r2-live 的 asset-base-url 必须是纯 HTTPS origin');
  remoteAssetConfig = {
    mode: 'remote-r2-live',
    baseUrl: baseUrl.origin,
    manifestPath: 'gensokyo-moving-garden/live/manifest.json',
  };
}
const assetManifest = JSON.parse(await readFile('src/assets/asset-manifest.json', 'utf8'));
const imageMimeByExtension = new Map([
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);
const imageDataUrl = (bytes, source) => {
  if (remoteAssetConfig) return `${remoteAssetConfig.baseUrl}/gensokyo-moving-garden/live/${source}`;
  const mime = imageMimeByExtension.get(extname(source).toLowerCase());
  if (!mime) throw new Error(`不支持的图片格式：${source}`);
  return `data:${mime};base64,${bytes.toString('base64')}`;
};
const localBulletAsset = assetManifest.battle_assets?.local_etama3_bullets;
if (!localBulletAsset?.source_alpha || localBulletAsset.runtime_scope !== 'project-package-and-distribution') {
  throw new Error('etama3 弹幕图集缺少项目运行与打包分发授权登记');
}
const localBulletSource = localBulletAsset.source_alpha;
const requiredAlphaSource = (asset, label) => {
  if (!asset?.source_alpha) throw new Error(`${label} 缺少运行时透明素材登记`);
  return asset.source_alpha;
};
const battlePlayerSource = requiredAlphaSource(assetManifest.player, '自机图集');
const battleBossSources = {
  greenhouse_flower_core: requiredAlphaSource(assetManifest.battle_assets?.greenhouse_flower_core, '温室花妖核心 Boss 图集'),
  reimu_battle: requiredAlphaSource(assetManifest.battle_assets?.reimu_battle, '灵梦 Boss 图集'),
  marisa_battle: requiredAlphaSource(assetManifest.battle_assets?.marisa_battle, '魔理沙 Boss 图集'),
  cirno_battle: requiredAlphaSource(assetManifest.battle_assets?.cirno_battle, '琪露诺 Boss 图集'),
  alice_battle: requiredAlphaSource(assetManifest.battle_assets?.alice_battle, '爱丽丝 Boss 图集'),
  nitori_battle: requiredAlphaSource(assetManifest.battle_assets?.nitori_battle, '荷取 Boss 图集'),
  mystia_battle: requiredAlphaSource(assetManifest.battle_assets?.mystia_battle, '米斯蒂娅 Boss 图集'),
  suika_battle: requiredAlphaSource(assetManifest.battle_assets?.suika_battle, '萃香 Boss 图集'),
  sakuya_battle: requiredAlphaSource(assetManifest.battle_assets?.sakuya_battle, '咲夜 Boss 图集'),
  youmu_battle: requiredAlphaSource(assetManifest.battle_assets?.youmu_battle, '妖梦 Boss 图集'),
  patchouli_battle: requiredAlphaSource(assetManifest.battle_assets?.patchouli_battle, '帕秋莉 Boss 图集'),
  sanae_battle: requiredAlphaSource(assetManifest.battle_assets?.sanae_battle, '早苗 Boss 图集'),
};
const battleEffectsSource = requiredAlphaSource(assetManifest.battle_assets?.common_effects, '战斗特效图集');
const mainHouseSource = requiredAlphaSource(assetManifest.world_assets?.main_house_states, '主屋状态图集');
const greenhouseSource = requiredAlphaSource(assetManifest.world_assets?.magic_greenhouse_states, '温室状态图集');
const reimuPortraitAsset = assetManifest.battle_assets?.reimu_battle_portraits;
const reimuPortraitSources = reimuPortraitAsset?.sources;
if (
  reimuPortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof reimuPortraitSources?.[state] === 'string')
) {
  throw new Error('灵梦 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
}
const marisaPortraitAsset = assetManifest.battle_assets?.marisa_battle_portraits;
const marisaPortraitSources = marisaPortraitAsset?.sources;
if (
  marisaPortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof marisaPortraitSources?.[state] === 'string')
) {
  throw new Error('魔理沙 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
}
const alicePortraitAsset = assetManifest.battle_assets?.alice_battle_portraits;
const alicePortraitSources = alicePortraitAsset?.sources;
if (
  alicePortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof alicePortraitSources?.[state] === 'string')
) {
  throw new Error('爱丽丝 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
}
const cirnoPortraitAsset = assetManifest.battle_assets?.cirno_battle_portraits;
const cirnoPortraitSources = cirnoPortraitAsset?.sources;
if (
  cirnoPortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof cirnoPortraitSources?.[state] === 'string')
) {
  throw new Error('琪露诺 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
}
const mystiaPortraitAsset = assetManifest.battle_assets?.mystia_battle_portraits;
const mystiaPortraitSources = mystiaPortraitAsset?.sources;
if (
  mystiaPortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof mystiaPortraitSources?.[state] === 'string')
) {
  throw new Error('米斯蒂娅 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
}
const nitoriPortraitAsset = assetManifest.battle_assets?.nitori_battle_portraits;
const nitoriPortraitSources = nitoriPortraitAsset?.sources;
if (
  nitoriPortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof nitoriPortraitSources?.[state] === 'string')
) {
  throw new Error('河城荷取 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
}
const suikaPortraitAsset = assetManifest.battle_assets?.suika_battle_portraits;
const suikaPortraitSources = suikaPortraitAsset?.sources;
if (
  suikaPortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof suikaPortraitSources?.[state] === 'string')
) {
  throw new Error('伊吹萃香 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
}
const sakuyaPortraitAsset = assetManifest.battle_assets?.sakuya_battle_portraits;
const sakuyaPortraitSources = sakuyaPortraitAsset?.sources;
if (
  sakuyaPortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof sakuyaPortraitSources?.[state] === 'string')
) {
  throw new Error('十六夜咲夜 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
}
const youmuPortraitAsset = assetManifest.battle_assets?.youmu_battle_portraits;
const youmuPortraitSources = youmuPortraitAsset?.sources;
if (
  youmuPortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof youmuPortraitSources?.[state] === 'string')
) {
  throw new Error('魂魄妖梦 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
}
const patchouliPortraitAsset = assetManifest.battle_assets?.patchouli_battle_portraits;
const patchouliPortraitSources = patchouliPortraitAsset?.sources;
if (
  patchouliPortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof patchouliPortraitSources?.[state] === 'string')
) {
  throw new Error('帕秋莉 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
}
const sanaePortraitAsset = assetManifest.battle_assets?.sanae_battle_portraits;
const sanaePortraitSources = sanaePortraitAsset?.sources;
if (
  sanaePortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof sanaePortraitSources?.[state] === 'string')
) {
  throw new Error('东风谷早苗 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
}
const flowerCorePortraitAsset = assetManifest.battle_assets?.flower_core_battle_portraits;
const flowerCorePortraitSources = flowerCorePortraitAsset?.sources;
if (
  flowerCorePortraitAsset?.runtime_embed !== 'compressed-webp'
  || !['s0', 's1', 's2'].every((state) => typeof flowerCorePortraitSources?.[state] === 'string')
) {
  throw new Error('温室花妖核心 S0/S1/S2 立绘缺少压缩 WebP 运行登记');
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
const requiredUiSource = (id, runtimeRole) => {
  const asset = assetManifest.ui_assets?.[id];
  if (!asset?.source_alpha || asset.runtime_role !== runtimeRole) {
    throw new Error(`UI 素材 ${id} 缺少 ${runtimeRole} 运行登记`);
  }
  return asset.source_alpha;
};
const dungeonButtonSource = requiredUiSource('dungeon_button', 'entry-button');
const shopButtonSource = requiredUiSource('shop_button', 'entry-button');
const inventoryButtonSource = requiredUiSource('inventory_button', 'entry-button');
const shopBackgroundSource = requiredUiSource('shop_background', 'shop-background');
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
if (characterAssets.length !== 11) {
  throw new Error(`庭园角色素材应为 11 组，实际为 ${characterAssets.length} 组`);
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
    const maintenanceSource = source.replace(/\.webp$/i, '.png');
    const png = PNG.sync.read(await readFile(`src/assets/${maintenanceSource}`));
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

// B4-O01 受控 resolve plugin：唯一 selection import `@card/memory-adapter`
// 只被 src/ui/memory-adapter-selection.ts 引用；plugin 把它映射到
// src/ui/memory-adapters/<profile>.ts。命中必须恰好一次，且解析路径必须在
// memory-adapters 目录内；未命中/重复命中/越界均构建失败。
const MEMORY_ADAPTER_ROOT = resolvePath('src/ui/memory-adapters');
const createMemoryAdapterPlugin = (profile) => {
  let resolveHits = 0;
  return {
    name: 'memory-adapter-profile',
    setup(build) {
      build.onResolve({ filter: /^@card\/memory-adapter$/ }, (args) => {
        resolveHits += 1;
        if (resolveHits > 1) {
          return { errors: [{ text: `memory-adapter selection import 重复命中（${resolveHits} 次），必须恰好一次` }] };
        }
        const target = resolvePath(MEMORY_ADAPTER_ROOT, `${profile}.ts`);
        const rel = relative(MEMORY_ADAPTER_ROOT, target);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { errors: [{ text: `memory-adapter 解析越界：${target}` }] };
        }
        return { path: target };
      });
      build.onEnd(() => {
        if (resolveHits !== 1) {
          throw new Error(`memory-adapter selection import 未命中（命中 ${resolveHits} 次），必须恰好一次`);
        }
      });
    },
  };
};

const appProfileOutDir = `dist/ui/profiles/${memoryProfile}`;
await mkdir('dist/ui', { recursive: true });
await mkdir(appProfileOutDir, { recursive: true });
await build({
  entryPoints: ['src/ui/app.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  outfile: `${appProfileOutDir}/app.js`,
  sourcemap: true,
  legalComments: 'none',
  plugins: [createMemoryAdapterPlugin(memoryProfile)],
});
await build({
  entryPoints: ['src/ui/cirno-walk-demo.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  outfile: 'dist/ui/cirno-walk-demo.js',
  sourcemap: true,
  legalComments: 'none',
});
await build({
  entryPoints: ['src/ui/cirno-sprite-calibration.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  outfile: 'dist/ui/cirno-sprite-calibration.js',
  sourcemap: true,
  legalComments: 'none',
});
await build({
  entryPoints: ['src/ui/cirno-height-calibration.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  outfile: 'dist/ui/cirno-height-calibration.js',
  sourcemap: true,
  legalComments: 'none',
});
await build({
  entryPoints: ['src/ui/new-character-sprite-calibration.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  outfile: 'dist/ui/new-character-sprite-calibration.js',
  sourcemap: true,
  legalComments: 'none',
});
const previewAssetBase = remoteAssetConfig
  ? `${remoteAssetConfig.baseUrl}/gensokyo-moving-garden/live`
  : '../assets';
const previewAssetUrl = (source) => `${previewAssetBase}/${source}`;
const previewFacilitySprites = Object.fromEntries(mapFacilityAssets.map(({ id, areaId, forms, damageOverlay, damageReplacement, geometry }) => [
  id,
  {
    areaId,
    forms: Object.fromEntries(Object.entries(forms).map(([form, source]) => [form, previewAssetUrl(source)])),
    damageOverlay: damageOverlay ? previewAssetUrl(damageOverlay) : undefined,
    damageReplacement: damageReplacement ? previewAssetUrl(damageReplacement) : undefined,
    geometry,
  },
]));
const previewGalPortraitSources = Object.fromEntries(galPortraitAssets.map(({ id, sources }) => [
  id,
  Object.fromEntries(Object.entries(sources).map(([mode, modeSources]) => [
    mode,
    Object.fromEntries(Object.entries(modeSources).map(([reaction, source]) => [
      reaction,
      previewAssetUrl(source),
    ])),
  ])),
]));
const previewDataset = {
  previewHarness: 'true',
  assetBase: previewAssetBase,
  assetDeliveryConfig: remoteAssetConfig ? JSON.stringify(remoteAssetConfig) : undefined,
  mapSrc: previewAssetUrl(gardenBaseAsset.source),
  mapNoWalkMaskSrc: previewAssetUrl(gardenNoWalkMaskAsset.source),
  dungeonButtonSrc: previewAssetUrl(dungeonButtonSource),
  shopButtonSrc: previewAssetUrl(shopButtonSource),
  inventoryButtonSrc: previewAssetUrl(inventoryButtonSource),
  shopBackgroundSrc: previewAssetUrl(shopBackgroundSource),
  galBackgroundSrc: previewAssetUrl(galBackgroundSource),
  galPortraitSources: JSON.stringify(previewGalPortraitSources),
  mapFacilitySprites: JSON.stringify(previewFacilitySprites),
  mainHouseSrc: previewAssetUrl(mainHouseSource),
  greenhouseSrc: previewAssetUrl(greenhouseSource),
  battlePlayerSrc: previewAssetUrl(battlePlayerSource),
  battleBossSrc: previewAssetUrl(battleBossSources.greenhouse_flower_core),
  battleBossReimuSrc: previewAssetUrl(battleBossSources.reimu_battle),
  battleBossMarisaSrc: previewAssetUrl(battleBossSources.marisa_battle),
  battleBossCirnoSrc: previewAssetUrl(battleBossSources.cirno_battle),
  battleBossAliceSrc: previewAssetUrl(battleBossSources.alice_battle),
  battleBossNitoriSrc: previewAssetUrl(battleBossSources.nitori_battle),
  battleBossMystiaSrc: previewAssetUrl(battleBossSources.mystia_battle),
  battleBossSuikaSrc: previewAssetUrl(battleBossSources.suika_battle),
  battleBossSakuyaSrc: previewAssetUrl(battleBossSources.sakuya_battle),
  battleBossYoumuSrc: previewAssetUrl(battleBossSources.youmu_battle),
  battleBossPatchouliSrc: previewAssetUrl(battleBossSources.patchouli_battle),
  battleBossSanaeSrc: previewAssetUrl(battleBossSources.sanae_battle),
  battlePortraitReimuS0Src: previewAssetUrl(reimuPortraitSources.s0),
  battlePortraitReimuS1Src: previewAssetUrl(reimuPortraitSources.s1),
  battlePortraitReimuS2Src: previewAssetUrl(reimuPortraitSources.s2),
  battlePortraitMarisaS0Src: previewAssetUrl(marisaPortraitSources.s0),
  battlePortraitMarisaS1Src: previewAssetUrl(marisaPortraitSources.s1),
  battlePortraitMarisaS2Src: previewAssetUrl(marisaPortraitSources.s2),
  battlePortraitAliceS0Src: previewAssetUrl(alicePortraitSources.s0),
  battlePortraitAliceS1Src: previewAssetUrl(alicePortraitSources.s1),
  battlePortraitAliceS2Src: previewAssetUrl(alicePortraitSources.s2),
  battlePortraitCirnoS0Src: previewAssetUrl(cirnoPortraitSources.s0),
  battlePortraitCirnoS1Src: previewAssetUrl(cirnoPortraitSources.s1),
  battlePortraitCirnoS2Src: previewAssetUrl(cirnoPortraitSources.s2),
  battlePortraitMystiaS0Src: previewAssetUrl(mystiaPortraitSources.s0),
  battlePortraitMystiaS1Src: previewAssetUrl(mystiaPortraitSources.s1),
  battlePortraitMystiaS2Src: previewAssetUrl(mystiaPortraitSources.s2),
  battlePortraitNitoriS0Src: previewAssetUrl(nitoriPortraitSources.s0),
  battlePortraitNitoriS1Src: previewAssetUrl(nitoriPortraitSources.s1),
  battlePortraitNitoriS2Src: previewAssetUrl(nitoriPortraitSources.s2),
  battlePortraitSuikaS0Src: previewAssetUrl(suikaPortraitSources.s0),
  battlePortraitSuikaS1Src: previewAssetUrl(suikaPortraitSources.s1),
  battlePortraitSuikaS2Src: previewAssetUrl(suikaPortraitSources.s2),
  battlePortraitSakuyaS0Src: previewAssetUrl(sakuyaPortraitSources.s0),
  battlePortraitSakuyaS1Src: previewAssetUrl(sakuyaPortraitSources.s1),
  battlePortraitSakuyaS2Src: previewAssetUrl(sakuyaPortraitSources.s2),
  battlePortraitYoumuS0Src: previewAssetUrl(youmuPortraitSources.s0),
  battlePortraitYoumuS1Src: previewAssetUrl(youmuPortraitSources.s1),
  battlePortraitYoumuS2Src: previewAssetUrl(youmuPortraitSources.s2),
  battlePortraitPatchouliS0Src: previewAssetUrl(patchouliPortraitSources.s0),
  battlePortraitPatchouliS1Src: previewAssetUrl(patchouliPortraitSources.s1),
  battlePortraitPatchouliS2Src: previewAssetUrl(patchouliPortraitSources.s2),
  battlePortraitSanaeS0Src: previewAssetUrl(sanaePortraitSources.s0),
  battlePortraitSanaeS1Src: previewAssetUrl(sanaePortraitSources.s1),
  battlePortraitSanaeS2Src: previewAssetUrl(sanaePortraitSources.s2),
  battlePortraitFlowerCoreS0Src: previewAssetUrl(flowerCorePortraitSources.s0),
  battlePortraitFlowerCoreS1Src: previewAssetUrl(flowerCorePortraitSources.s1),
  battlePortraitFlowerCoreS2Src: previewAssetUrl(flowerCorePortraitSources.s2),
  battleFairySrc: previewAssetUrl(fairySource),
  battleEffectsSrc: previewAssetUrl(battleEffectsSource),
  battleBulletsLocalSrc: previewAssetUrl(localBulletSource),
  battleSfxSources: JSON.stringify(Object.fromEntries(battleSfxIds.map((id) => [id, previewAssetUrl(battleSfxSources[id])]))),
};
for (const { id, idle, motion, animation, sequence } of characterAssets) {
  previewDataset[`${id}SpriteSrc`] = previewAssetUrl(idle);
  previewDataset[`${id}MotionSrc`] = previewAssetUrl(motion);
  if (animation) previewDataset[`${id}AnimationSrc`] = previewAssetUrl(animation);
  if (sequence) previewDataset[`${id}SequenceSrc`] = previewAssetUrl(sequence);
}
const escapeHtmlAttribute = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');
const previewDataAttributes = Object.entries(previewDataset)
  .filter(([, value]) => value !== undefined)
  .map(([key, value]) => `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${escapeHtmlAttribute(value)}"`)
  .join(' ');
const previewHtml = (await readFile('src/ui/index.html', 'utf8')).replace(
  'data-asset-base="../assets"',
  previewDataAttributes,
);
await Promise.all([
  writeFile(`${appProfileOutDir}/index.html`, previewHtml, 'utf8'),
  copyFile('src/ui/styles.css', `${appProfileOutDir}/styles.css`),
  copyFile('src/ui/cirno-walk-demo.html', 'dist/ui/cirno-walk-demo.html'),
  copyFile('src/ui/cirno-sprite-calibration.html', 'dist/ui/cirno-sprite-calibration.html'),
  copyFile('src/ui/cirno-height-calibration.html', 'dist/ui/cirno-height-calibration.html'),
  copyFile('src/ui/new-character-sprite-calibration.html', 'dist/ui/new-character-sprite-calibration.html'),
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
  copyFile(`src/assets/${mainHouseSource}`, `dist/assets/${mainHouseSource}`),
  copyFile(`src/assets/${greenhouseSource}`, `dist/assets/${greenhouseSource}`),
  // Battle sheets only — never embed chroma authoring duplicates.
  copyFile(`src/assets/${battlePlayerSource}`, `dist/assets/${battlePlayerSource}`),
  ...Object.values(battleBossSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(reimuPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(marisaPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(alicePortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(cirnoPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(mystiaPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(nitoriPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(suikaPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(sakuyaPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(youmuPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(patchouliPortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(sanaePortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  ...Object.values(flowerCorePortraitSources).map((source) => copyFile(`src/assets/${source}`, `dist/assets/${source}`)),
  copyFile(`src/assets/${fairySource}`, `dist/assets/${fairySource}`),
  copyFile(`src/assets/${battleEffectsSource}`, `dist/assets/${battleEffectsSource}`),
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
  battleBossYoumuBytes,
  battleBossPatchouliBytes,
  battleBossSanaeBytes,
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
  battlePortraitYoumuS0Bytes,
  battlePortraitYoumuS1Bytes,
  battlePortraitYoumuS2Bytes,
  battlePortraitPatchouliS0Bytes,
  battlePortraitPatchouliS1Bytes,
  battlePortraitPatchouliS2Bytes,
  battlePortraitSanaeS0Bytes,
  battlePortraitSanaeS1Bytes,
  battlePortraitSanaeS2Bytes,
  battlePortraitFlowerCoreS0Bytes,
  battlePortraitFlowerCoreS1Bytes,
  battlePortraitFlowerCoreS2Bytes,
  battleFairyBytes,
  battleEffectsBytes,
  battleBulletsLocalBytes,
  hostShellSource,
] = await Promise.all([
  readFile(`${appProfileOutDir}/index.html`, 'utf8'),
  readFile(`${appProfileOutDir}/styles.css`, 'utf8'),
  readFile(`${appProfileOutDir}/app.js`, 'utf8'),
  readFile(`src/assets/${gardenBaseAsset.source}`),
  readFile(`src/assets/${gardenNoWalkMaskAsset.source}`),
  readFile(`src/assets/${dungeonButtonSource}`),
  readFile(`src/assets/${shopButtonSource}`),
  readFile(`src/assets/${inventoryButtonSource}`),
  readFile(`src/assets/${shopBackgroundSource}`),
  readFile(`src/assets/${galBackgroundSource}`),
  readFile(`src/assets/${mainHouseSource}`),
  readFile(`src/assets/${greenhouseSource}`),
  readFile(`src/assets/${battlePlayerSource}`),
  readFile(`src/assets/${battleBossSources.greenhouse_flower_core}`),
  readFile(`src/assets/${battleBossSources.reimu_battle}`),
  readFile(`src/assets/${battleBossSources.marisa_battle}`),
  readFile(`src/assets/${battleBossSources.cirno_battle}`),
  readFile(`src/assets/${battleBossSources.alice_battle}`),
  readFile(`src/assets/${battleBossSources.nitori_battle}`),
  readFile(`src/assets/${battleBossSources.mystia_battle}`),
  readFile(`src/assets/${battleBossSources.suika_battle}`),
  readFile(`src/assets/${battleBossSources.sakuya_battle}`),
  readFile(`src/assets/${battleBossSources.youmu_battle}`),
  readFile(`src/assets/${battleBossSources.patchouli_battle}`),
  readFile(`src/assets/${battleBossSources.sanae_battle}`),
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
  readFile(`src/assets/${youmuPortraitSources.s0}`),
  readFile(`src/assets/${youmuPortraitSources.s1}`),
  readFile(`src/assets/${youmuPortraitSources.s2}`),
  readFile(`src/assets/${patchouliPortraitSources.s0}`),
  readFile(`src/assets/${patchouliPortraitSources.s1}`),
  readFile(`src/assets/${patchouliPortraitSources.s2}`),
  readFile(`src/assets/${sanaePortraitSources.s0}`),
  readFile(`src/assets/${sanaePortraitSources.s1}`),
  readFile(`src/assets/${sanaePortraitSources.s2}`),
  readFile(`src/assets/${flowerCorePortraitSources.s0}`),
  readFile(`src/assets/${flowerCorePortraitSources.s1}`),
  readFile(`src/assets/${flowerCorePortraitSources.s2}`),
  readFile(`src/assets/${fairySource}`),
  readFile(`src/assets/${battleEffectsSource}`),
  readFile(`src/assets/${localBulletSource}`),
  readFile('src/runtime/ui-host-shell.js', 'utf8'),
]);
const body = html.match(/<body>([\s\S]*?)<script src="\.\/app\.js"><\/script>[\s\S]*?<\/body>/i)?.[1];
if (!body) throw new Error('无法提取 UI body');
const mapDataUrl = imageDataUrl(mapBytes, gardenBaseAsset.source);
const mapNoWalkMaskDataUrl = imageDataUrl(mapNoWalkMaskBytes, gardenNoWalkMaskAsset.source);
const dungeonButtonDataUrl = imageDataUrl(dungeonButtonBytes, dungeonButtonSource);
const shopButtonDataUrl = imageDataUrl(shopButtonBytes, shopButtonSource);
const inventoryButtonDataUrl = imageDataUrl(inventoryButtonBytes, inventoryButtonSource);
const shopBackgroundDataUrl = imageDataUrl(shopBackgroundBytes, shopBackgroundSource);
const galBackgroundDataUrl = imageDataUrl(galBackgroundBytes, galBackgroundSource);
const characterSpriteDataUrls = Object.fromEntries(await Promise.all(characterAssets.map(async ({ id, idle, motion, animation, sequence }) => {
  const [idleBytes, motionBytes, animationBytes, sequenceBytes] = await Promise.all([
    readFile(`src/assets/${idle}`),
    readFile(`src/assets/${motion}`),
    animation ? readFile(`src/assets/${animation}`) : Promise.resolve(null),
    sequence ? readFile(`src/assets/${sequence}`) : Promise.resolve(null),
  ]);
  return [id, {
    idle: imageDataUrl(idleBytes, idle),
    motion: imageDataUrl(motionBytes, motion),
    animation: animationBytes ? imageDataUrl(animationBytes, animation) : undefined,
    sequence: sequenceBytes ? imageDataUrl(sequenceBytes, sequence) : undefined,
  }];
})));
const mainHouseDataUrl = imageDataUrl(mainHouseBytes, mainHouseSource);
const greenhouseDataUrl = imageDataUrl(greenhouseBytes, greenhouseSource);
const mapFacilityDataUrls = Object.fromEntries(await Promise.all(mapFacilityAssets.map(async ({ id, areaId, forms, damageOverlay, damageReplacement, geometry }) => {
  const formEntries = await Promise.all(Object.entries(forms).map(async ([form, source]) => [
    form,
    imageDataUrl(await readFile(`src/assets/${source}`), source),
  ]));
  const overlay = damageOverlay
    ? imageDataUrl(await readFile(`src/assets/${damageOverlay}`), damageOverlay)
    : undefined;
  const replacement = damageReplacement
    ? imageDataUrl(await readFile(`src/assets/${damageReplacement}`), damageReplacement)
    : undefined;
  return [id, {
    areaId,
    forms: Object.fromEntries(formEntries),
    damageOverlay: overlay,
    damageReplacement: replacement,
    geometry,
  }];
})));
const battlePlayerDataUrl = imageDataUrl(battlePlayerBytes, battlePlayerSource);
const battleBossDataUrl = imageDataUrl(battleBossBytes, battleBossSources.greenhouse_flower_core);
const battleBossReimuDataUrl = imageDataUrl(battleBossReimuBytes, battleBossSources.reimu_battle);
const battleBossMarisaDataUrl = imageDataUrl(battleBossMarisaBytes, battleBossSources.marisa_battle);
const battleBossCirnoDataUrl = imageDataUrl(battleBossCirnoBytes, battleBossSources.cirno_battle);
const battleBossAliceDataUrl = imageDataUrl(battleBossAliceBytes, battleBossSources.alice_battle);
const battleBossNitoriDataUrl = imageDataUrl(battleBossNitoriBytes, battleBossSources.nitori_battle);
const battleBossMystiaDataUrl = imageDataUrl(battleBossMystiaBytes, battleBossSources.mystia_battle);
const battleBossSuikaDataUrl = imageDataUrl(battleBossSuikaBytes, battleBossSources.suika_battle);
const battleBossSakuyaDataUrl = imageDataUrl(battleBossSakuyaBytes, battleBossSources.sakuya_battle);
const battleBossYoumuDataUrl = imageDataUrl(battleBossYoumuBytes, battleBossSources.youmu_battle);
const battleBossPatchouliDataUrl = imageDataUrl(battleBossPatchouliBytes, battleBossSources.patchouli_battle);
const battleBossSanaeDataUrl = imageDataUrl(battleBossSanaeBytes, battleBossSources.sanae_battle);
const battlePortraitReimuS0DataUrl = imageDataUrl(battlePortraitReimuS0Bytes, reimuPortraitSources.s0);
const battlePortraitReimuS1DataUrl = imageDataUrl(battlePortraitReimuS1Bytes, reimuPortraitSources.s1);
const battlePortraitReimuS2DataUrl = imageDataUrl(battlePortraitReimuS2Bytes, reimuPortraitSources.s2);
const battlePortraitMarisaS0DataUrl = imageDataUrl(battlePortraitMarisaS0Bytes, marisaPortraitSources.s0);
const battlePortraitMarisaS1DataUrl = imageDataUrl(battlePortraitMarisaS1Bytes, marisaPortraitSources.s1);
const battlePortraitMarisaS2DataUrl = imageDataUrl(battlePortraitMarisaS2Bytes, marisaPortraitSources.s2);
const battlePortraitAliceS0DataUrl = imageDataUrl(battlePortraitAliceS0Bytes, alicePortraitSources.s0);
const battlePortraitAliceS1DataUrl = imageDataUrl(battlePortraitAliceS1Bytes, alicePortraitSources.s1);
const battlePortraitAliceS2DataUrl = imageDataUrl(battlePortraitAliceS2Bytes, alicePortraitSources.s2);
const battlePortraitCirnoS0DataUrl = imageDataUrl(battlePortraitCirnoS0Bytes, cirnoPortraitSources.s0);
const battlePortraitCirnoS1DataUrl = imageDataUrl(battlePortraitCirnoS1Bytes, cirnoPortraitSources.s1);
const battlePortraitCirnoS2DataUrl = imageDataUrl(battlePortraitCirnoS2Bytes, cirnoPortraitSources.s2);
const battlePortraitMystiaS0DataUrl = imageDataUrl(battlePortraitMystiaS0Bytes, mystiaPortraitSources.s0);
const battlePortraitMystiaS1DataUrl = imageDataUrl(battlePortraitMystiaS1Bytes, mystiaPortraitSources.s1);
const battlePortraitMystiaS2DataUrl = imageDataUrl(battlePortraitMystiaS2Bytes, mystiaPortraitSources.s2);
const battlePortraitNitoriS0DataUrl = imageDataUrl(battlePortraitNitoriS0Bytes, nitoriPortraitSources.s0);
const battlePortraitNitoriS1DataUrl = imageDataUrl(battlePortraitNitoriS1Bytes, nitoriPortraitSources.s1);
const battlePortraitNitoriS2DataUrl = imageDataUrl(battlePortraitNitoriS2Bytes, nitoriPortraitSources.s2);
const battlePortraitSuikaS0DataUrl = imageDataUrl(battlePortraitSuikaS0Bytes, suikaPortraitSources.s0);
const battlePortraitSuikaS1DataUrl = imageDataUrl(battlePortraitSuikaS1Bytes, suikaPortraitSources.s1);
const battlePortraitSuikaS2DataUrl = imageDataUrl(battlePortraitSuikaS2Bytes, suikaPortraitSources.s2);
const battlePortraitSakuyaS0DataUrl = imageDataUrl(battlePortraitSakuyaS0Bytes, sakuyaPortraitSources.s0);
const battlePortraitSakuyaS1DataUrl = imageDataUrl(battlePortraitSakuyaS1Bytes, sakuyaPortraitSources.s1);
const battlePortraitSakuyaS2DataUrl = imageDataUrl(battlePortraitSakuyaS2Bytes, sakuyaPortraitSources.s2);
const battlePortraitYoumuS0DataUrl = imageDataUrl(battlePortraitYoumuS0Bytes, youmuPortraitSources.s0);
const battlePortraitYoumuS1DataUrl = imageDataUrl(battlePortraitYoumuS1Bytes, youmuPortraitSources.s1);
const battlePortraitYoumuS2DataUrl = imageDataUrl(battlePortraitYoumuS2Bytes, youmuPortraitSources.s2);
const battlePortraitPatchouliS0DataUrl = imageDataUrl(battlePortraitPatchouliS0Bytes, patchouliPortraitSources.s0);
const battlePortraitPatchouliS1DataUrl = imageDataUrl(battlePortraitPatchouliS1Bytes, patchouliPortraitSources.s1);
const battlePortraitPatchouliS2DataUrl = imageDataUrl(battlePortraitPatchouliS2Bytes, patchouliPortraitSources.s2);
const battlePortraitSanaeS0DataUrl = imageDataUrl(battlePortraitSanaeS0Bytes, sanaePortraitSources.s0);
const battlePortraitSanaeS1DataUrl = imageDataUrl(battlePortraitSanaeS1Bytes, sanaePortraitSources.s1);
const battlePortraitSanaeS2DataUrl = imageDataUrl(battlePortraitSanaeS2Bytes, sanaePortraitSources.s2);
const battlePortraitFlowerCoreS0DataUrl = imageDataUrl(battlePortraitFlowerCoreS0Bytes, flowerCorePortraitSources.s0);
const battlePortraitFlowerCoreS1DataUrl = imageDataUrl(battlePortraitFlowerCoreS1Bytes, flowerCorePortraitSources.s1);
const battlePortraitFlowerCoreS2DataUrl = imageDataUrl(battlePortraitFlowerCoreS2Bytes, flowerCorePortraitSources.s2);
const battleFairyDataUrl = imageDataUrl(battleFairyBytes, fairySource);
const battleEffectsDataUrl = imageDataUrl(battleEffectsBytes, battleEffectsSource);
const battleBulletsLocalDataUrl = imageDataUrl(battleBulletsLocalBytes, localBulletSource);
const battleSfxDataUrls = Object.fromEntries(battleSfxIds.map((id) => [
  id,
  remoteAssetConfig
    ? `${remoteAssetConfig.baseUrl}/gensokyo-moving-garden/live/${battleSfxSources[id]}`
    : `data:audio/wav;base64,${battleSfxBytes[id].toString('base64')}`,
]));
const galPortraitDataUrls = Object.fromEntries(await Promise.all(galPortraitAssets.map(async ({ id, sources }) => [
  id,
  Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([mode, modeSources]) => [
    mode,
    Object.fromEntries(await Promise.all(Object.entries(modeSources).map(async ([reaction, source]) => [
      reaction,
      imageDataUrl(await readFile(`src/assets/${source}`), source),
    ]))),
  ]))),
])));
const embedded = {
  assetDeliveryConfig: remoteAssetConfig,
  assetBase: remoteAssetConfig ? previewAssetBase : undefined,
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
  battleBossYoumuDataUrl,
  battleBossPatchouliDataUrl,
  battleBossSanaeDataUrl,
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
  battlePortraitYoumuS0DataUrl,
  battlePortraitYoumuS1DataUrl,
  battlePortraitYoumuS2DataUrl,
  battlePortraitPatchouliS0DataUrl,
  battlePortraitPatchouliS1DataUrl,
  battlePortraitPatchouliS2DataUrl,
  battlePortraitSanaeS0DataUrl,
  battlePortraitSanaeS1DataUrl,
  battlePortraitSanaeS2DataUrl,
  battlePortraitFlowerCoreS0DataUrl,
  battlePortraitFlowerCoreS1DataUrl,
  battlePortraitFlowerCoreS2DataUrl,
  battleFairyDataUrl,
  battleEffectsDataUrl,
  battleBulletsLocalDataUrl,
  battleSfxDataUrls,
};
// B4-O01 §5.3.2：raw host shell 的数据库桥接块必须按 memory profile guarded 保留/删除。
// 哨兵必须各恰好出现一次；缺失/重复/嵌套异常立即失败；standalone 移除整个块后
// 不得残留 AutoCardUpdaterAPI 符号；禁止只把 getter 改成返回 undefined。
const HOST_DB_BRIDGE_START = '// [B4-DATABASE-BRIDGE-START]';
const HOST_DB_BRIDGE_END = '// [B4-DATABASE-BRIDGE-END]';
const applyMemoryProfileToHostShell = (source, profile) => {
  const starts = source.split(HOST_DB_BRIDGE_START).length - 1;
  const ends = source.split(HOST_DB_BRIDGE_END).length - 1;
  if (starts !== 1 || ends !== 1) {
    throw new Error(`host shell 数据库桥接哨兵必须各恰好出现一次（start=${starts} end=${ends}）`);
  }
  const startIdx = source.indexOf(HOST_DB_BRIDGE_START);
  const endIdx = source.indexOf(HOST_DB_BRIDGE_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error('host shell 数据库桥接哨兵嵌套异常');
  }
  if (profile === 'database-assisted') return source;
  // standalone：移除整个块（含哨兵行），而不是把 getter 置 undefined。
  const blockStart = source.lastIndexOf('\n', startIdx) + 1;
  const blockEndLine = source.indexOf('\n', endIdx);
  const blockEnd = blockEndLine === -1 ? source.length : blockEndLine + 1;
  const stripped = source.slice(0, blockStart) + source.slice(blockEnd);
  if (stripped.includes('AutoCardUpdaterAPI')) {
    throw new Error('standalone host shell 移除数据库桥后仍残留 AutoCardUpdaterAPI');
  }
  return stripped;
};
const buildMountBundle = (versionToken) => [
  '// generated by scripts/build-ui.mjs — local trusted binder only',
  `const embedded = ${JSON.stringify(embedded)};`,
  // 构建时注入唯一 host 版本：ST 页面里残留的旧实例（version 相同）会短路新代码，
  // 必须保证每次构建产物 version 不同，旧实例才会走 destroy→重建路径。
  applyMemoryProfileToHostShell(hostShellSource, memoryProfile).replace(
    /0\.4\.4-late-bound-generate-r\d+/,
    `0.4.4-late-bound-generate-${uiDelivery === 'remote'
      ? versionToken
      : createHash('sha256').update(JSON.stringify(embedded)).digest('hex').slice(0, 14)}`,
  ),
].join('\n');
const enhancedMountBundle = buildMountBundle(uiVersion);
const runtimeOutputDir = `${channelConfig.outputDir}/profiles/${memoryProfile}`;
await mkdir(runtimeOutputDir, { recursive: true });
await writeFile(`${runtimeOutputDir}/ui-mount.js`, enhancedMountBundle, 'utf8');
const mountBytes = Buffer.byteLength(enhancedMountBundle, 'utf8');
const mountSha256 = createHash('sha256').update(enhancedMountBundle).digest('hex');
const report = {
  ui_delivery: uiDelivery,
  ui_channel: uiChannel,
  ui_version: uiDelivery === 'remote' ? uiVersion : null,
  memory_profile: memoryProfile,
  memory_adapter: memoryProfile === 'standalone-mvu' ? 'standalone-mvu/no-op' : 'database-assisted/host-auto-card-updater',
  ui_manifest_url: null,
  asset_manifest_url: remoteAssetConfig ? `${remoteAssetConfig.baseUrl}/${remoteAssetConfig.manifestPath}` : null,
  output: `${runtimeOutputDir}/ui-mount.js`,
  versioned_output: null,
  loader_output: null,
  bytes: mountBytes,
  sha256: mountSha256,
};
// UI 交付形态：embedded（默认，现状整包内嵌）或 remote（额外产出发布副本 + 卡内 loader）。
// remote 模式由 scripts/publish-ui.mjs 上传 ui-mount-<version>.js 与 ui-manifest.json，
// 打包链（package-checkpoint.mjs --ui-delivery=remote）将 ui-loader.js 作为卡内脚本。
// 通道隔离：production 输出 dist/runtime/，test 输出 dist/runtime/test/；
// memory profile 隔离：两个 profile 永远分目录，JS/loader/manifest/report 互不覆盖（B4-O01 §5.4）。
if (uiDelivery === 'remote') {
  if (!remoteAssetConfig) throw new Error('--ui-delivery=remote 要求 --asset-mode=remote-r2-live 与 --asset-base-url');
  const versionedMountPath = `${runtimeOutputDir}/ui-mount-${uiVersion}.js`;
  if (await exists(versionedMountPath)) {
    const existingMount = await readFile(versionedMountPath, 'utf8');
    if (existingMount !== enhancedMountBundle) {
      throw new Error(`拒绝覆盖不可变 UI 产物：${versionedMountPath} 已存在且内容不同，请使用新的 --ui-version=${uiVersion}`);
    }
  } else {
    await writeFile(versionedMountPath, enhancedMountBundle, 'utf8');
  }
  // B4-O01 §5.4.1：profile-specific manifest 固定坐标，不覆盖现有 live/test manifest。
  const uiManifestPath = `${channelConfig.uiPrefix}/profiles/${memoryProfile}/ui-manifest.json`;
  const manifestUrl = `${remoteAssetConfig.baseUrl}/${uiManifestPath}`;
  const loaderTemplate = await readFile('src/runtime/ui-loader.js', 'utf8');
  const loader = loaderTemplate
    .replace(/__UI_MANIFEST_URL__/g, manifestUrl)
    .replace(/__UI_CHANNEL__/g, uiChannel);
  await writeFile(`${runtimeOutputDir}/ui-loader.js`, loader, 'utf8');
  Object.assign(report, {
    ui_manifest_url: manifestUrl,
    versioned_output: versionedMountPath,
    loader_output: `${runtimeOutputDir}/ui-loader.js`,
  });
  console.log(`[build-ui] ${uiChannel}/${memoryProfile} remote 交付产物：ui-mount-${uiVersion}.js（${(mountBytes / 1024 / 1024).toFixed(2)} MB）、ui-loader.js（${(loader.length / 1024).toFixed(1)} KB，指向 ${manifestUrl}）`);
}
await writeFile(`${runtimeOutputDir}/ui-build-report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
