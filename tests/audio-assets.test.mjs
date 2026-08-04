import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readBuffer = (path) => readFile(new URL(`../${path}`, import.meta.url));

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

test('battle sound manifest owns fourteen stable WAV assets with matching hashes', async () => {
  const manifest = JSON.parse(await read('src/assets/asset-manifest.json'));
  const battleSfx = manifest.audio_assets.battle_sfx;

  assert.equal(battleSfx.runtime_embed, 'wav-data-url');
  assert.equal(battleSfx.format.runtime_total_bytes, 308202);
  assert.deepEqual(Object.keys(battleSfx.events), battleSfxIds);

  for (const id of battleSfxIds) {
    const asset = battleSfx.events[id];
    const buffer = await readBuffer(`src/assets/${asset.runtime}`);
    assert.equal(asset.runtime, `audio/runtime/battle/${id}.wav`);
    assert.equal(createHash('sha256').update(buffer).digest('hex'), asset.sha256);
  }
});

test('battle sound bus decodes lazily, throttles hot events, and observes visibility', async () => {
  const source = await read('src/battle/battle-sound.ts');

  assert.match(source, /export function createBattleSoundBus/);
  assert.match(source, /decodeAudioData/);
  assert.match(source, /player_shot:\s*80/);
  assert.match(source, /boss_hit:\s*60/);
  assert.match(source, /graze:\s*60/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /setMuted/);
  assert.match(source, /setVolume/);
});

test('battle engine forwards typed sound events to the application-owned bus', async () => {
  const source = await read('src/ui/battle-engine.ts');

  assert.match(source, /soundBus\?: BattleSoundBus/);
  assert.match(source, /sfx:\s*\(id\) => this\.soundBus\.play\(id\)/);
  assert.match(source, /this\.soundBus\.unlock\?\.\(\)/);
});

test('UI exposes persistent sound controls and injects the bus into every battle', async () => {
  const [app, html, styles] = await Promise.all([
    read('src/ui/app.ts'),
    read('src/ui/index.html'),
    read('src/ui/styles.css'),
  ]);

  assert.match(app, /gensokyo-garden:battle-sfx-enabled/);
  assert.match(app, /gensokyo-garden:battle-sfx-volume/);
  assert.match(app, /createBattleSoundBus/);
  assert.equal((app.match(/soundBus:\s*battleSoundBus/g) ?? []).length, 3);
  assert.match(html, /id="gg-battle-sound-enabled"/);
  assert.match(html, /id="gg-battle-sound-volume"/);
  assert.match(html, /id="gg-battle-sound-test"/);
  assert.match(html, /id="gg-battle-audio-settings"/);
  assert.match(html, /id="gg-battle-settings-sfx-enabled"/);
  assert.match(styles, /\.gg-sound-settings/);
});

test('BGM catalog reserves R2-ready HTTPS slots without shipping credentials', async () => {
  const [catalogSource, busSource, app, html, template] = await Promise.all([
    read('src/battle/battle-bgm-catalog.json'),
    read('src/battle/battle-bgm.ts'),
    read('src/ui/app.ts'),
    read('src/ui/index.html'),
    read('project/battle-bgm-r2-template.md'),
  ]);
  const catalog = JSON.parse(catalogSource);
  assert.equal(catalog.version, 'battle-bgm.v1');
  assert.deepEqual(catalog.tracks.map((track) => track.id), ['stage_theme', 'boss_theme', 'duel_theme']);
  assert.ok(catalog.tracks.every((track) => track.source_url === null));
  assert.match(busSource, /source\.startsWith\('https:\/\/'\)/);
  assert.match(app, /gensokyo-garden:battle-bgm-volume\.v2/);
  assert.match(app, /gensokyo-garden:battle-bgm-source\.v1/);
  assert.match(app, /savedBgmVolumeRaw == null \? NaN/);
  assert.match(html, /作者推荐/);
  assert.match(template, /不在前端保存 R2 Access Key、Secret 或签名凭据/);
});

test('preview and embedded builds both provide scheduled battle WAV sources', async () => {
  const [buildSource, hostSource, previewSource] = await Promise.all([
    read('scripts/build-ui.mjs'),
    read('src/runtime/ui-host-shell.js'),
    read('scripts/preview-server.mjs'),
  ]);

  assert.match(buildSource, /battleSfxDataUrls/);
  assert.match(buildSource, /data:audio\/wav;base64/);
  assert.match(buildSource, /battleSfxSources:\s*JSON\.stringify/);
  assert.match(buildSource, /assetDeliveryConfig:\s*remoteAssetConfig/);
  assert.match(hostSource, /dataset\.battleSfxSources/);
  assert.match(previewSource, /\['\.wav', 'audio\/wav'\]/);
});
