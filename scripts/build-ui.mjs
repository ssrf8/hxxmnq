import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const assetManifest = JSON.parse(await readFile('src/assets/asset-manifest.json', 'utf8'));
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
    };
  });
if (characterAssets.length !== 8) {
  throw new Error(`庭园角色素材应为 8 组，实际为 ${characterAssets.length} 组`);
}

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
await Promise.all([
  copyFile('src/ui/index.html', 'dist/ui/index.html'),
  copyFile('src/ui/styles.css', 'dist/ui/styles.css'),
]);
await Promise.all([
  mkdir('dist/assets/maps', { recursive: true }),
  ...characterAssets.map(({ id }) => mkdir(`dist/assets/characters/${id}`, { recursive: true })),
  mkdir('dist/assets/world/house', { recursive: true }),
  mkdir('dist/assets/world/greenhouse', { recursive: true }),
  mkdir('dist/assets/battle/player', { recursive: true }),
  mkdir('dist/assets/battle/boss', { recursive: true }),
  mkdir('dist/assets/battle/effects', { recursive: true }),
]);
await Promise.all([
  copyFile('src/assets/maps/garden-base-spring-v1.png', 'dist/assets/maps/garden-base-spring-v1.png'),
  ...characterAssets.flatMap(({ idle, motion, animation }) => [
    copyFile(`src/assets/${idle}`, `dist/assets/${idle}`),
    copyFile(`src/assets/${motion}`, `dist/assets/${motion}`),
    ...(animation ? [copyFile(`src/assets/${animation}`, `dist/assets/${animation}`)] : []),
  ]),
  copyFile('src/assets/world/house/main-house-states-v1.png', 'dist/assets/world/house/main-house-states-v1.png'),
  copyFile('src/assets/world/greenhouse/magic-greenhouse-states-v1.png', 'dist/assets/world/greenhouse/magic-greenhouse-states-v1.png'),
  // Transparent battle sheets only — never embed chroma authoring duplicates.
  copyFile('src/assets/battle/player/keycraft-player-sheet-v1.png', 'dist/assets/battle/player/keycraft-player-sheet-v1.png'),
  copyFile('src/assets/battle/boss/greenhouse-flower-core-sheet-v1.png', 'dist/assets/battle/boss/greenhouse-flower-core-sheet-v1.png'),
  copyFile('src/assets/battle/effects/battle-effects-sheet-v1.png', 'dist/assets/battle/effects/battle-effects-sheet-v1.png'),
]);

const [
  html,
  css,
  appJs,
  mapBytes,
  mainHouseBytes,
  greenhouseBytes,
  battlePlayerBytes,
  battleBossBytes,
  battleEffectsBytes,
  hostShellSource,
] = await Promise.all([
  readFile('dist/ui/index.html', 'utf8'),
  readFile('dist/ui/styles.css', 'utf8'),
  readFile('dist/ui/app.js', 'utf8'),
  readFile('src/assets/maps/garden-base-spring-v1.png'),
  readFile('src/assets/world/house/main-house-states-v1.png'),
  readFile('src/assets/world/greenhouse/magic-greenhouse-states-v1.png'),
  readFile('src/assets/battle/player/keycraft-player-sheet-v1.png'),
  readFile('src/assets/battle/boss/greenhouse-flower-core-sheet-v1.png'),
  readFile('src/assets/battle/effects/battle-effects-sheet-v1.png'),
  readFile('src/runtime/ui-host-shell.js', 'utf8'),
]);
const body = html.match(/<body>([\s\S]*?)<script src="\.\/app\.js"><\/script>[\s\S]*?<\/body>/i)?.[1];
if (!body) throw new Error('无法提取 UI body');
const mapDataUrl = `data:image/png;base64,${mapBytes.toString('base64')}`;
const characterSpriteDataUrls = Object.fromEntries(await Promise.all(characterAssets.map(async ({ id, idle, motion, animation }) => {
  const [idleBytes, motionBytes, animationBytes] = await Promise.all([
    readFile(`src/assets/${idle}`),
    readFile(`src/assets/${motion}`),
    animation ? readFile(`src/assets/${animation}`) : Promise.resolve(null),
  ]);
  return [id, {
    idle: `data:image/png;base64,${idleBytes.toString('base64')}`,
    motion: `data:image/png;base64,${motionBytes.toString('base64')}`,
    animation: animationBytes ? `data:image/png;base64,${animationBytes.toString('base64')}` : undefined,
  }];
})));
const mainHouseDataUrl = `data:image/png;base64,${mainHouseBytes.toString('base64')}`;
const greenhouseDataUrl = `data:image/png;base64,${greenhouseBytes.toString('base64')}`;
const battlePlayerDataUrl = `data:image/png;base64,${battlePlayerBytes.toString('base64')}`;
const battleBossDataUrl = `data:image/png;base64,${battleBossBytes.toString('base64')}`;
const battleEffectsDataUrl = `data:image/png;base64,${battleEffectsBytes.toString('base64')}`;
const embedded = {
  body,
  css,
  appJs,
  mapDataUrl,
  characterSpriteDataUrls,
  mainHouseDataUrl,
  greenhouseDataUrl,
  battlePlayerDataUrl,
  battleBossDataUrl,
  battleEffectsDataUrl,
};
const enhancedMountBundle = [
  '// generated by scripts/build-ui.mjs — local trusted binder only',
  `const embedded = ${JSON.stringify(embedded)};`,
  hostShellSource,
].join('\n');
await mkdir('dist/runtime', { recursive: true });
await writeFile('dist/runtime/ui-mount.js', enhancedMountBundle, 'utf8');
