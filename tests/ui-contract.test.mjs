import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const importTypescript = async (path) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

test('庭园地图只读取访客快照，不渲染玩家占位小人', async () => {
  const source = await read('../src/ui/garden-map.ts');
  assert.match(source, /present_character_ids/);
  assert.match(source, /intentionally no player marker/);
  assert.doesNotMatch(source, /state\.player/);
});

test('八名来访角色保留旧图集回退，灵梦与魔理沙可使用 V2 图集', async () => {
  const map = await read('../src/ui/garden-map.ts');
  const actor = await read('../src/ui/sprite-actor.ts');
  const registry = await read('../src/ui/character-sprite-registry.ts');
  const build = await read('../scripts/build-ui.mjs');
  const host = await read('../src/runtime/ui-host-shell.js');
  assert.match(map, /new SpriteActor\(id, actor/);
  assert.match(map, /requestAnimationFrame/);
  assert.match(map, /visibilitychange/);
  assert.match(actor, /SpriteMotion = 'idle' \| 'walk'/);
  assert.match(actor, /prefers-reduced-motion|reducedMotion/);
  assert.match(actor, /facingCell/);
  assert.match(actor, /facingRow/);
  assert.match(actor, /motionImageReady/);
  assert.match(actor, /resolveRenderFrame/);
  assert.match(actor, /columns: useMotionSheet \? 4 : 2/);
  assert.match(actor, /columns: 9, rows: 4/);
  assert.match(actor, /frameDurationMs/);
  for (const id of ['reimu', 'marisa', 'cirno', 'alice', 'mystia', 'suika', 'nitori', 'sakuya']) {
    assert.match(registry, new RegExp(`${id}: \\{`));
  }
  assert.match(registry, /mystia-turnaround-v2\.png/);
  assert.match(registry, /marisa-hover-cycle-v1\.png/);
  assert.match(registry, /marisa-animation-v2-r2\.png/);
  assert.match(registry, /reimu-animation-v2-r6\.png/);
  assert.match(build, /asset-manifest\.json/);
  assert.match(build, /animation_source_alpha/);
  assert.match(build, /characterSpriteDataUrls/);
  assert.doesNotMatch(build, /animation_source_chroma/);
  assert.match(host, /characterSpriteDataUrls/);
  assert.match(host, /MotionSrc/);
  assert.match(host, /AnimationSrc/);
});

test('庭园地图滚轮缩放不被绘制尺寸抵消，并保持指针锚点', async () => {
  const source = await read('../src/ui/garden-map.ts');
  const styles = await read('../src/ui/styles.css');
  assert.match(source, /const drawWidth = canvasRatio > imageRatio \? width : height \* imageRatio/);
  assert.doesNotMatch(source, /const viewWidth = width \/ this\.camera\.zoom/);
  assert.match(source, /const worldX = \(point\.x - this\.canvas\.width \/ 2 - this\.camera\.x\) \/ previousZoom/);
  assert.match(source, /this\.camera\.x = point\.x - this\.canvas\.width \/ 2 - worldX \* nextZoom/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /canvas\.dataset\.zoom = this\.camera\.zoom\.toFixed\(3\)/);
  assert.match(source, /if \(this\.canvas\.width === width && this\.canvas\.height === height\) return/);
  assert.match(styles, /\.gg-map-shell \{[^}]*height: clamp\(420px, 62vh, 620px\)/);
  assert.match(styles, /#gg-garden-map \{[^}]*height: 100%; min-height: 0/);
  assert.doesNotMatch(styles, /#gg-garden-map \{[^}]*min-height: 480px/);
});

test('扩大视角空庭园底图由素材清单驱动，人物与设施标记按远景比例收缩', async () => {
  const manifest = await read('../src/assets/asset-manifest.json');
  const build = await read('../scripts/build-ui.mjs');
  const map = await read('../src/ui/garden-map.ts');
  const spatial = await read('../src/ui/garden-spatial.ts');
  assert.match(manifest, /garden-base-expanded-empty-v1\.png/);
  assert.match(manifest, /"runtime_role": "base-layer"/);
  assert.match(manifest, /"facility_layer_policy": "separate-transparent-sprites"/);
  assert.match(build, /assetManifest\.maps\?\.garden_base/);
  assert.match(build, /gardenBaseAsset\.source/);
  assert.match(map, /CHARACTER_VISUAL_SCALE = 0\.73/);
  assert.match(map, /FACILITY_VISUAL_SCALE = 0\.76/);
  assert.match(spatial, /GARDEN_AREA_OUTLINES[^=]*= Object\.freeze\(\{\}\)/);
});

test('已验收的三座可换型设施以透明图层接入地图，并在损坏时叠加覆盖层', async () => {
  const manifest = await read('../src/assets/asset-manifest.json');
  const build = await read('../scripts/build-ui.mjs');
  const host = await read('../src/runtime/ui-host-shell.js');
  const map = await read('../src/ui/garden-map.ts');
  for (const id of ['fairy_garden', 'moon_spring', 'banquet_plaza']) {
    assert.match(manifest, new RegExp(`"${id}": \\{[\\s\\S]*?"map_usage": true`));
  }
  assert.match(build, /mapFacilityDataUrls/);
  assert.match(host, /mapFacilitySprites/);
  assert.match(map, /drawFacilityLayer/);
  assert.match(map, /runtime\?\.status === 'damaged'/);
  assert.match(map, /runtime\?\.current_form \?\? facility\?\.current_form/);
});

test('互动使用单壳 GAL、自定义输入与零模型本地结束', async () => {
  const document = await read('../src/ui/index.html');
  const controller = await read('../src/ui/app.ts');
  const actions = await read('../src/ui/target-actions.ts');
  const settlement = await read('../src/ui/event-settlement.ts');
  assert.match(document, /id="gg-view-gal"/);
  assert.match(document, /id="gg-gal-input"/);
  assert.match(document, /id="gg-suggested-replies"/);
  assert.match(document, /id="gg-end-chat"/);
  assert.match(document, /id="gg-show-native"/);
  assert.match(controller, /bridge\.sendUserMessage/);
  assert.doesNotMatch(controller, /buildSettlementMessage/);
  assert.match(controller, /type: 'end_conversation_local'/);
  assert.match(controller, /聊天已直接结束，没有调用模型/);
  assert.match(actions, /action_id: 'end_conversation'/);
  assert.match(settlement, /interaction!\.settled_ids/);
});

test('符卡配置限制敌弹模式与参数上限', async () => {
  const allowed = new Set([
    'fixed_seed_ring', 'petal_fan', 'homing_leaf', 'local_safe_zone',
    'aimed_stream', 'rotating_ring', 'wave_fan', 'burst_cluster',
    'cross_sweep', 'laser_warning', 'falling_lanes',
  ]);
  const files = [
    '../src/battle/configs/greenhouse-flower-core-tutorial-v1.json',
    '../src/battle/configs/dungeons/fairy-pattern-practice-v1.json',
    '../src/battle/configs/dungeons/forest-magic-residue-v1.json',
    '../src/battle/configs/dungeons/boundary-echo-trial-v1.json',
  ];
  for (const file of files) {
    const config = JSON.parse(await read(file));
    for (const phase of config.phases) {
      assert.ok(phase.kind === 'nonspell' || phase.kind === 'spell', `${file}:${phase.id}`);
      for (const pattern of phase.patterns) {
        assert.ok(allowed.has(pattern.pattern_id), `${file}:${pattern.pattern_id}`);
        if (pattern.speed != null) {
          assert.ok(pattern.speed >= 40 && pattern.speed <= 260, pattern.pattern_id);
        }
        if (pattern.count != null) {
          assert.ok(pattern.count >= 1 && pattern.count <= 32, pattern.pattern_id);
        }
      }
    }
    assert.deepEqual(config.parameter_limits.speed, [40, 260]);
    assert.equal(config.player.auto_fire, false);
  }
  const flower = JSON.parse(await read('../src/battle/configs/greenhouse-flower-core-tutorial-v1.json'));
  assert.equal(flower.phases.length, 2);
  assert.equal(flower.config_id, 'greenhouse_flower_core_tutorial_v1');
  assert.equal(flower.player.auto_fire, false);
  assert.ok(flower.phases.every((phase) => phase.patterns.some((p) => p.start_ms != null || p.end_ms != null)));
});

test('旧主屋维修由本地前置条件与登记结果约束', async () => {
  const actions = await read('../src/ui/target-actions.ts');
  const rules = await read('../src/lorebook/variable-update-rules.md');
  const events = JSON.parse(await read('../src/lorebook/events/greenhouse-vertical-slice.json'));
  const repair = events.events.find((item) => item.config_id === 'main_house_repair');
  assert.match(actions, /completed\.reimu_boundary_inspection/);
  assert.match(actions, /state\.areas\?\.main_house\?\.state !== '损坏'/);
  assert.match(actions, /action_id: action\.id/);
  assert.deepEqual(repair.cost, { materials: 1 });
  assert.deepEqual(repair.allowed_results, ['main_house_enabled', 'temporary_shelter_only']);
  assert.match(rules, /main_house_enabled/);
  assert.match(rules, /temporary_shelter_only/);
});

test('新开局只预览草稿，点击开始后确定性写入 MVU 且不调用 LLM', async () => {
  const document = await read('../src/ui/index.html');
  const opening = await read('../src/ui/opening.ts');
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(document, /id="gg-opening-preview"/);
  assert.match(document, /id="gg-opening-commit"/);
  assert.match(opening, /buildOpeningMessage\(draft\)/);
  assert.match(opening, /sessionStorage/);
  assert.match(opening, /appearanceSentence/);
  assert.match(opening, /bridge\.initializeOpening\(draft, frozenChatId\)/);
  const commitHandler = opening.slice(opening.indexOf('private async commit()'), opening.indexOf('private async retry()'));
  assert.doesNotMatch(commitHandler, /commitOpening|buildOpeningMessage|regenerateLatest/);
  assert.match(commitHandler, /sessionStorage\.removeItem/);
  assert.match(bridge, /async initializeOpening\(draft: OpeningDraft, expectedChatId: string\)/);
  const initializeHandler = bridge.slice(bridge.indexOf('async initializeOpening(draft: OpeningDraft'), bridge.indexOf('async commitOpening('));
  assert.match(initializeHandler, /openingTargetMessage/);
  assert.match(initializeHandler, /mergeState\(initialState/);
  assert.match(initializeHandler, /applyOpeningDraft/);
  assert.match(initializeHandler, /replaceMvuData/);
  assert.match(initializeHandler, /MVU 写入后复读校验失败/);
  assert.doesNotMatch(initializeHandler, /createChatMessages|triggerSlash|transactions\.submit/);
  assert.match(bridge, /garden_keeper_key\?\.state === '苏醒'/);
  assert.match(bridge, /createChatMessages/);
  assert.match(bridge, /<gensokyo_opening transaction=/);
  assert.match(bridge, /include_swipes: false/);
  assert.match(bridge, /withoutMarker\(item\.message\) === expectedBody/);
  assert.doesNotMatch(opening, /replaceMvuData|stat_data\s*=/);
  assert.match(document, /不调用 LLM/);
  assert.match(document, /第一次真实行动才开始生成剧情/);
});

test('普通互动使用非隐藏真实消息、事务标识和无刷新写入', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const transaction = await read('../src/ui/message-transaction.ts');
  const document = await read('../src/ui/index.html');
  assert.match(bridge, /is_hidden: false/);
  assert.match(bridge, /refresh: 'none'/);
  assert.doesNotMatch(bridge, /is_hidden: true/);
  assert.match(transaction, /gensokyoTransactionId/);
  assert.match(transaction, /submitting_user/);
  assert.match(transaction, /generating/);
  assert.match(transaction, /settling/);
  assert.match(transaction, /settled/);
  assert.match(transaction, /failed/);
  assert.match(document, /id="gg-retry-transaction"/);
});

test('最新回复没有变量块时向前读取最近一份 MVU 正式状态', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(bridge, /function latestPersistedState/);
  assert.match(bridge, /filter\(\(message\) => messageRole\(message\) === 'assistant'\)\.reverse\(\)/);
  assert.match(bridge, /Object\.keys\(state\)\.length > 0/);
  assert.match(bridge, /return latestPersistedState\(mvu\)/);
  assert.match(bridge, /if \(!g\.Mvu\?\.getMvuData\) await g\.waitGlobalInitialized/);
});

test('开场变量掉格式时提供幂等恢复，不把玩家锁在设置页', async () => {
  const document = await read('../src/ui/index.html');
  const opening = await read('../src/ui/opening.ts');
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(document, /id="gg-opening-recovery"/);
  assert.match(document, /id="gg-opening-retry"/);
  assert.match(document, /id="gg-opening-enter"/);
  assert.match(document, /id="gg-opening-repair"/);
  assert.match(document, /id="gg-opening-native"/);
  assert.match(opening, /getOpeningProgress/);
  assert.match(opening, /enterGarden/);
  assert.match(opening, /regenerateLatest/);
  assert.match(opening, /repairOpening/);
  assert.match(bridge, /gensokyo_opening_repair/);
  assert.match(bridge, /parseOpeningMessage/);
  assert.match(bridge, /MVU 写入后复读校验失败/);
  assert.match(bridge, /replaceMvuData/);
  assert.match(bridge, /message_id: messageId/);
  assert.match(bridge, /只补写其中已经确认的玩家姓名/);
});

test('打包器提供 MVU initvar 初始状态，不依赖角色脚本变量初始化消息楼层', async () => {
  const packer = await read('../scripts/package-checkpoint.mjs');
  const projection = await read('../src/lorebook/model-projection.md');
  const outputFormat = await read('../src/lorebook/variable-output-format.md');
  assert.match(packer, /\[initvar\] 移动庭园初始状态/);
  assert.match(packer, /\[mvu_update\] 最新 MVU 状态（含本地私有字段）/);
  assert.doesNotMatch(packer, /\[mvu_plot\]\[mvu_update\] 最新 MVU 状态/);
  assert.match(packer, /\[mvu_update\] 变量输出格式/);
  assert.match(packer, /'after_char', 0, 4/);
  assert.match(packer, /token_budget: 12288/);
  assert.match(projection, /\{\{format_message_variable::stat_data\}\}/);
  assert.match(projection, /只提供给 MVU 变量阶段/);
  assert.match(outputFormat, /没有合法变化时输出空数组/);
  assert.match(packer, /<initvar>/);
  assert.match(packer, /JSON\.stringify\(initialState, null, 2\)/);
  assert.match(packer, /--checkpoint=0\.2\.0-rN/);
  assert.match(packer, /planned_checkpoint_sequence/);
  assert.match(packer, /world: WORLDBOOK_NAME/);
  assert.match(packer, /mvu_worldbook_name: WORLDBOOK_NAME/);
  assert.match(packer, /name: WORLDBOOK_NAME/);
  assert.match(packer, /GAL 表现与会话协议/);
  assert.match(packer, /gensokyo-garden-ui-020-\$\{CHECKPOINT_SUFFIX\}/);
  assert.match(packer, /确定性开场后的首次行动引导/);
  assert.match(packer, /此步骤会直接写入并复读 MVU，不调用 LLM/);
  assert.match(packer, /const payload = \{ spec: 'chara_card_v2', spec_version: '2\.0', data \}/);
  assert.doesNotMatch(packer, /spec_version: '2\.0', \.\.\.data, data/);
  assert.match(packer, /if \(!DRY_RUN && await exists\(OUTPUT_FILE\)\)/);
  assert.match(packer, /REPLACE_EXISTING/);
  assert.match(packer, /archive-and-replace/);
  assert.match(packer, /copyFile\(OUTPUT_FILE, archivedOutput\)/);
});

test('数据库适配器是可选归档且不下载或执行远程脚本', async () => {
  const adapter = await read('../src/ui/database-adapter.ts');
  assert.match(adapter, /AutoCardUpdaterAPI/);
  assert.match(adapter, /state\.meta\?\.opening_committed/);
  assert.match(adapter, /祖父的遗物（庭守钥）/);
  assert.doesNotMatch(adapter, /fetch\(|eval\(|new Function/);
});

test('运行挂载产物自包含界面与底图，不依赖开发服务器', async () => {
  const mount = await read('../dist/runtime/ui-mount.js');
  assert.match(mount, /data:image\/png;base64,/);
  assert.match(mount, /__GENSOKYO_GARDEN_UI_024__/);
  assert.match(mount, /show-native-chat/);
  assert.match(mount, /gensokyo-game-shell/);
  assert.match(mount, /gg-gensokyo-chat-active/);
  assert.doesNotMatch(mount, /"reimuPortraitDataUrl":/);
  assert.doesNotMatch(mount, /"marisaPortraitDataUrl":/);
  assert.match(mount, /const characterSprites = embedded\.characterSpriteDataUrls \|\| \{\}/);
  assert.match(mount, /dataset\.reimuPortraitSrc = characterSprites\.reimu\.idle/);
  assert.match(mount, /dataset\.marisaPortraitSrc = characterSprites\.marisa\.idle/);
  assert.match(mount, /mainHouseDataUrl/);
  assert.match(mount, /greenhouseDataUrl/);
  assert.match(mount, /battlePlayerDataUrl/);
  assert.match(mount, /battleBossDataUrl/);
  assert.match(mount, /battleEffectsDataUrl/);
  assert.match(mount, /battlePlayerSrc/);
  assert.match(mount, /battleBossSrc/);
  assert.match(mount, /battleEffectsSrc/);
  assert.doesNotMatch(mount, /chroma\.png/);
  assert.doesNotMatch(mount, /position:'fixed',inset/);
  assert.doesNotMatch(mount, /127\.0\.0\.1:8765|gcore\.jsdelivr\.net|localhost/);
});

test('宿主只在本卡游戏模式受控隐藏原生输入区，并在跨角色或卸载时恢复', async () => {
  const host = await read('../src/runtime/ui-host-shell.js');
  assert.match(host, /body\.\$\{activeClass\} #send_form \{ display: none !important; \}/);
  assert.match(host, /doc\.body\.classList\.toggle\(activeClass, !state\.nativeMode\)/);
  assert.match(host, /doc\.body\?\.classList\.remove\(activeClass\)/);
  assert.match(host, /const ownerCharacterId = currentCharacterId\(\)/);
  assert.match(host, /currentCharacterId\(\) === state\.ownerCharacterId/);
  assert.match(host, /source\.addEventListener\('pagehide', destroy, \{ once: true \}\)/);
  assert.match(host, /if \(!ownsCurrentCharacter\(\)\) \{\s*destroy\(\)/);
  assert.match(host, /clearHostArtifacts\(\)/);
  assert.match(host, /#\$\{shellId\}, #\$\{returnButtonId\}, #\$\{styleId\}/);
  assert.match(host, /'generate'/);
});

test('GAL scene.v1 最多六段、白名单反应并对非法格式安全降级', async () => {
  const parser = await read('../src/ui/gal-scene.ts');
  const controller = await read('../src/ui/app.ts');
  const protocol = await read('../src/lorebook/gal-presentation-protocol.md');
  assert.match(parser, /<GensokyoScene/);
  assert.match(parser, /\.slice\(0, 6\)/);
  assert.match(parser, /ALLOWED_REACTIONS/);
  assert.match(parser, /malformed \? 'fallback'/);
  assert.match(parser, /scene\.v1\+body|preferBody|bodyChars/);
  assert.match(parser, /bginfor/);
  assert.match(controller, /textContent = beat\.text/);
  assert.doesNotMatch(controller, /innerHTML\s*=/);
  assert.match(protocol, /suggested_replies/);
  assert.match(protocol, /1–6/);
});

test('真实消息事务等待生成完成，停止后继续原回复并支持左右 Swipe', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const transaction = await read('../src/ui/message-transaction.ts');
  assert.match(bridge, /\/trigger await=true/);
  assert.match(bridge, /\/continue await=true/);
  assert.match(bridge, /\/regenerate await=true/);
  assert.match(bridge, /direction === 'left' \? 'left' : 'right'/);
  assert.match(transaction, /private stopped = false/);
  assert.match(transaction, /if \(shouldContinue\) await this\.host\.continueGeneration\(\)/);
  assert.match(transaction, /this\.reconcile\(true\)/);
  assert.match(transaction, /phase = 'generating'/);
  assert.match(transaction, /phase === 'submitting_user'/);
  assert.doesNotMatch(transaction, /phase === 'submitting_user' \|\| this\.snapshot\.phase === 'generating' \|\| this\.stopped/);
});

test('交互结算 ID 有完整 schema、初始状态和字段台账链', async () => {
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const schema = await read('../src/schema/02-mvu-schema.js');
  const ledger = await read('../src/schema/field-ledger.md');
  assert.deepEqual(initial.interaction.settled_ids, []);
  assert.match(schema, /settled_ids: list\(text\('', 64\), 64\)/);
  assert.match(ledger, /interaction\.settled_ids/);
});

test('cleanNarrativeText 优先使用 bginfor 后正文，而不是时段元数据', async () => {
  const source = await read('../src/ui/gal-scene.ts');
  assert.match(source, /candidates\.reduce/);
  assert.match(source, /preferBody/);
  assert.match(source, /scene\.v1\+body/);
  assert.match(source, /afterBginfor/);
  assert.match(source, /insideBginfor/);
  const sample = [
    '<draft>plan</draft>',
    '<bginfor><!--meta--><details><summary>时间地点</summary>日期：x 时间：14:15</details></bginfor>',
    '',
    '我深吸一口气，让胸腔充盈着这片被遗弃之地的陈旧气息，迈步绕过那一丛由于缺乏修剪而张牙舞爪的枯萎灌木。',
    '我停在巫女身前，尽量让自己的声音听起来像个通情达理的邻居。',
    '“这里荒废了挺久，如果刚才的波动惊扰到了博丽神社，我很抱歉。”',
    '灵梦把手插进袖子里，视线落在庭守钥上。',
    '<GensokyoScene>{"version":"scene.v1","beats":[{"kind":"speech","speaker_id":"reimu","reaction_id":"annoyed","pose_id":"default","text":"别折腾。"}],"suggested_replies":[{"id":"a","label":"继续","intent":"继续观察"}]}</GensokyoScene>',
    '<UpdateVariable><JSONPatch>[{"op":"replace","path":"/environment/time_period","value":"下午"}]</JSONPatch></UpdateVariable>',
  ].join('\n');
  const after = sample.match(/<\/bginfor>\s*([\s\S]*?)(?=<GensokyoScene\b|<UpdateVariable\b|$)/iu)?.[1] ?? '';
  const inside = sample.match(/<bginfor\b[^>]*>([\s\S]*?)(?:<\/bginfor>|(?=<GensokyoScene\b))/iu)?.[1] ?? '';
  const strip = (t) => t
    .replace(/<GensokyoScene\b[^>]*>[\s\S]*?<\/GensokyoScene>/giu, '')
    .replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/giu, '')
    .replace(/<draft>[\s\S]*?<\/draft>/giu, '')
    .replace(/<details>[\s\S]*?<\/details>/giu, '')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<[^>]+>/gu, '')
    .trim();
  const best = [after, inside, sample].map(strip).reduce((a, b) => (b.length > a.length ? b : a));
  assert.ok(best.length >= 80, 'expected long body, got ' + best.length);
  assert.match(best, /深吸一口气/);
  assert.doesNotMatch(best, /别折腾/);
});

test('庭园正文协议只投影最后一个边界内的多角色正文，并拒绝坏协议代码', async () => {
  const parser = await importTypescript('../src/ui/gal-scene.ts');
  const state = { characters: { reimu: {}, marisa: {} } };
  const message = {
    id: 8,
    text: [
      '预设可能在前面输出任意说明。',
      '【庭园正文开始】<narration>旧样例，不应出现。</narration>【庭园正文结束】',
      '【庭园正文开始】',
      '<narration>庭院的风穿过残墙。</narration>',
      '<dialogue char="reimu" reaction="annoyed">“木料别堵在路上。”</dialogue>',
      '<dialogue char="marisa" reaction="smile">“借两根，之后还你。”</dialogue>',
      '【庭园正文结束】',
      '<w2g>不应进入 GAL</w2g><GensokyoScene>{"version":"scene.v1"}</GensokyoScene>',
    ].join('\n'),
  };
  const scene = parser.projectGalScene(message, state, 'reimu');
  assert.equal(scene.version, 'garden.v1');
  assert.deepEqual(scene.beats.map((beat) => [beat.kind, beat.speakerId, beat.text]), [
    ['narration', null, '庭院的风穿过残墙。'],
    ['speech', 'reimu', '“木料别堵在路上。”'],
    ['speech', 'marisa', '“借两根，之后还你。”'],
  ]);
  assert.deepEqual(scene.suggestedReplies, []);

  const malformed = parser.projectGalScene({
    id: 9,
    text: '【庭园正文开始】<narration>不完整正文</narration><GensokyoScene>{"version":"scene.v1"}',
  }, state, 'reimu');
  assert.equal(malformed.version, 'garden.v1');
  assert.equal(malformed.malformed, true);
  assert.doesNotMatch(malformed.beats[0].text, /scene\.v1|GensokyoScene/);
});

test('庭园行动追加正文协议，维修固定结算且不开放续聊', async () => {
  const actions = await read('../src/ui/target-actions.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const app = await read('../src/ui/app.ts');
  assert.match(actions, /【庭园正文开始】/);
  assert.match(actions, /最后一个【庭园正文开始】/);
  assert.match(actions, /fixedPresentation: true/);
  assert.match(bridge, /eventById\.get\(action\.event_id\)/);
  assert.deepEqual(settlement.settlementChoices({}, {
    version: 'garden-action.v1', action_id: 'repair', event_id: 'main_house_repair',
  }), ['main_house_enabled', 'temporary_shelter_only']);
  assert.match(app, /singleShotEventPresentation = Boolean\(pendingAction\.fixedPresentation\)/);
  assert.match(app, /点击返回庭园/);
  assert.match(app, /function returnToGardenAfterFixedScene/);
  assert.match(app, /if \(singleShotEventPresentation\) returnToGardenAfterFixedScene\(\)/);
});

test('GAL 加载清空旧正文，并以本次对话记录替换左 Swipe', async () => {
  const document = await read('../src/ui/index.html');
  const app = await read('../src/ui/app.ts');
  assert.match(document, /id="gg-session-history"/);
  assert.match(document, /id="gg-session-history-dialog"/);
  assert.doesNotMatch(document, /id="gg-swipe-left"/);
  assert.match(app, /function sessionHistoryMessages/);
  assert.match(app, /activeSessionActionId/);
  assert.match(app, /parseGardenAction\(message\.text\)/);
  assert.match(app, /await openSessionHistory\(\)/);
  assert.match(app, /gg-scene-text'\)\.textContent = ''/);
});

test('温室研究固定两轮、限制输入并在第二轮自动返回庭园', async () => {
  const app = await read('../src/ui/app.ts');
  const actions = await read('../src/ui/target-actions.ts');
  const settlement = await read('../src/ui/event-settlement.ts');
  const eventConfig = await read('../src/lorebook/events/greenhouse-vertical-slice.json');
  assert.match(app, /GREENHOUSE_RESEARCH_INPUT_MAX_LENGTH = 120/);
  assert.match(app, /greenhouseResearchJustSettled/);
  assert.match(app, /温室研究已在两轮内收束/);
  assert.match(actions, /初始回复算第 1 轮/);
  assert.match(actions, /约 300 个汉字以内/);
  assert.match(settlement, /GREENHOUSE_RESEARCH_MAX_EFFECTIVE_ROUNDS = 2/);
  assert.match(settlement, /completeGreenhouseConversation/);
  assert.match(eventConfig, /"maximum_effective_rounds": 2/);
  assert.match(eventConfig, /"auto_settle_on_max_rounds": true/);
});

test('在场快照会注入每次庭园请求，并以受控回执同步角色离场', async () => {
  const actions = await importTypescript('../src/ui/target-actions.ts');
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const state = {
    characters: { reimu: { name: '博丽灵梦' }, marisa: { name: '雾雨魔理沙' } },
    presence_snapshot: {
      present_character_ids: ['reimu', 'marisa'],
      character_views: { marisa: { area_id: 'greenhouse_plot', action: '观察温室', facing: 'left' } },
    },
  };
  const request = actions.withGardenNarrativeContract('测试请求', state);
  assert.match(request, /庭园在场快照：本轮唯一事实/);
  assert.match(request, /marisa（雾雨魔理沙）：greenhouse_plot/);
  const next = settlement.applyPresenceUpdate(state, [
    '魔理沙骑扫帚离开了。',
    '<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu"],"character_views":{"reimu":{"area_id":"central_courtyard","action":"等待","facing":"front"}}}</GensokyoPresence>',
  ].join('\n'));
  assert.deepEqual(next.presence_snapshot.present_character_ids, ['reimu']);
  assert.equal(next.presence_snapshot.character_views.marisa, undefined);
  const leakedDraft = settlement.applyPresenceUpdate(state, [
    '<draft>必须输出<GensokyoPresence>{"not":"a callback"}</draft>',
    '【庭园正文结束】',
    '<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu","marisa"],"character_views":{"reimu":{"area_id":"central_courtyard"},"marisa":{"area_id":"greenhouse_plot","action":"抵达温室","facing":"front"}}}</GensokyoPresence>',
  ].join('\n'));
  assert.deepEqual(leakedDraft.presence_snapshot.present_character_ids, ['reimu', 'marisa']);
  assert.equal(leakedDraft.presence_snapshot.character_views.marisa.action, '抵达温室');
  assert.match(bridge, /applyPresenceUpdate/);
  assert.match(bridge, /raw\?\.message \?\? raw\?\.mes/);
});

test('时段 schema 接受口语别名并映射到四值', async () => {
  const schema = await read('../src/schema/02-mvu-schema.js');
  assert.match(schema, /z\.preprocess/);
  assert.match(schema, /下午:\s*'白昼'/);
  assert.match(schema, /晚上:\s*'夜晚'/);
  const rules = await read('../src/lorebook/variable-update-rules.md');
  assert.match(rules, /只能是：清晨、白昼、黄昏、夜晚/);
});

test('R19 温室行动按线索、灵感、清理、建造和首次使用逐段解锁', async () => {
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const state = {
    resources: { materials: 3, inspiration: 1 },
    areas: { greenhouse_plot: { unlocked: false, state: '未清理' } },
    facilities: { magic_greenhouse: { state: '可建设', current_form: null } },
    events: { active_event: null, completed_key_events: { reimu_boundary_inspection: 'temporary_permission' } },
    interaction: { current_session: null },
    battle: { current: null, settled_ids: [] },
  };
  assert.equal(rules.greenhouseDiscoveryVisible(state), true);
  assert.equal(rules.greenhouseActionBlock(state, 'investigate_magic_trace'), '');
  state.events.completed_key_events.marisa_material_rumor = 'greenhouse_clue_found';
  state.areas.greenhouse_plot.unlocked = true;
  state.events.completed_key_events.main_house_repair = 'main_house_enabled';
  assert.equal(rules.greenhouseActionBlock(state, 'hear_marisa_plan'), '');
  state.events.completed_key_events.gain_second_inspiration = 'hear_marisa_plan';
  state.resources.inspiration = 2;
  assert.equal(rules.greenhouseActionBlock(state, 'clear_greenhouse_foundation'), '');
  state.events.completed_key_events.clear_greenhouse_foundation = 'foundation_cleared';
  assert.match(rules.greenhouseActionBlock(state, 'build_basic_magic_greenhouse'), /4 点物资/);
  state.resources.materials = 4;
  assert.equal(rules.greenhouseActionBlock(state, 'build_basic_magic_greenhouse'), '');
  state.events.completed_key_events.build_basic_magic_greenhouse = 'basic_greenhouse_enabled';
  state.facilities.magic_greenhouse = { state: '启用', current_form: '基础魔法温室' };
  assert.equal(rules.greenhouseActionBlock(state, 'greenhouse_first_use'), '');
});

test('R20 妖花核心只接受活动事件中的白名单可信结果并拒绝重复结算', async () => {
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const state = {
    events: {
      active_event: { config_id: rules.GREENHOUSE_EVENTS.flowerCore },
      completed_key_events: {
        greenhouse_first_use: 'stable_first_growth',
        greenhouse_multiturn_conversation: 'conversation_settled_after_multiple_turns',
      },
    },
    battle: { current: null, settled_ids: [] },
  };
  const valid = {
    settlement_id: 'greenhouse-flower-core-test-1',
    config_id: rules.FLOWER_CORE_BATTLE_CONFIG,
    outcome: 'clean_win',
    remaining_lives: 2,
    grazes: 12,
    duration_ms: 4567,
    hits: 20,
    damage: 80,
    phases_cleared: 2,
    objective_ratio: 100,
  };
  assert.deepEqual(rules.validateFlowerCoreBattleResult(valid, state), valid);
  assert.throws(
    () => rules.validateFlowerCoreBattleResult({ ...valid, config_id: 'untrusted' }, state),
    /白名单/,
  );
  assert.throws(
    () => rules.validateFlowerCoreBattleResult({ ...valid, objective_ratio: 101 }, state),
    /objective_ratio/,
  );
  state.battle.settled_ids.push(valid.settlement_id);
  assert.throws(() => rules.validateFlowerCoreBattleResult(valid, state), /已经结算/);
});

test('妖花核心入口不再暴露为设置页演练，结算先写 battle.current 再生成剧情', async () => {
  const document = await read('../src/ui/index.html');
  const app = await read('../src/ui/app.ts');
  const bridge = await read('../src/ui/bridge.ts');
  assert.doesNotMatch(document, /id="gg-start-battle"/);
  assert.match(app, /bridge\.stageBattleResult\(result\)/);
  assert.match(app, /buildBattleSettlementMessage\(result\)/);
  assert.match(bridge, /nextState\.battle = \{ \.\.\.nextState\.battle, current: trusted \}/);
  assert.match(bridge, /可信战斗结果写入后复读校验失败/);
  assert.match(bridge, /已有另一份待结算战斗结果，不能覆盖/);
});

test('R21 本地结算器原子完成温室主链并由真实 assistant 楼层维护交流轮数', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  let state = JSON.parse(await read('../src/schema/initial-state.json'));
  const action = (action_id, event_id) => ({ version: 'garden-action.v1', action_id, event_id });
  const result = (event_id, value) => `<GensokyoEventResult>{"version":"event-result.v1","event_id":"${event_id}","result":"${value}"}</GensokyoEventResult>`;

  state = settlement.applyLocalSettlement(state, action('inspect_boundary', 'reimu_boundary_inspection'), 1, result('reimu_boundary_inspection', 'temporary_permission'));
  state = settlement.applyLocalSettlement(state, action('investigate_magic_trace', 'marisa_material_rumor'), 2, result('marisa_material_rumor', 'greenhouse_clue_found'));
  assert.equal(state.areas.greenhouse_plot.unlocked, true);
  assert.equal(state.facilities.magic_greenhouse.state, '可建设');
  assert.equal(state.characters.marisa.name, '雾雨魔理沙');
  assert.ok(state.presence_snapshot.present_character_ids.includes('marisa'));

  state = settlement.applyLocalSettlement(state, action('repair', 'main_house_repair'), 3, result('main_house_repair', 'main_house_enabled'));
  state = settlement.applyLocalSettlement(state, action('hear_marisa_plan', 'gain_second_inspiration'), 4, result('gain_second_inspiration', 'hear_marisa_plan'));
  assert.equal(state.resources.materials, 5);
  assert.equal(state.resources.inspiration, 2);
  state = settlement.applyLocalSettlement(state, action('clear_greenhouse_foundation', 'clear_greenhouse_foundation'), 5, result('clear_greenhouse_foundation', 'foundation_cleared'));
  state = settlement.applyLocalSettlement(state, action('build_basic_magic_greenhouse', 'build_basic_magic_greenhouse'), 6, result('build_basic_magic_greenhouse', 'basic_greenhouse_enabled'));
  assert.equal(state.resources.materials, 1);
  assert.equal(state.resources.inspiration, 0);
  assert.equal(state.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.deepEqual(state.facilities.magic_greenhouse.unlocked_forms, ['基础魔法温室']);

  state = settlement.applyLocalSettlement(state, action('greenhouse_first_use', 'greenhouse_first_use'), 7, result('greenhouse_first_use', 'stable_first_growth'));
  state = settlement.applyLocalSettlement(state, action('greenhouse_research_talk', 'greenhouse_multiturn_conversation'), 8, '第一轮');
  assert.equal(state.interaction.current_session.effective_rounds, 1);
  assert.equal(state.interaction.current_session.last_effective_message_id, 8);
  state = settlement.applyLocalSettlement(state, action('continue_greenhouse_conversation', 'greenhouse_multiturn_conversation'), 9, '第二轮');
  assert.equal(state.interaction.current_session, null);
  assert.equal(state.events.completed_key_events.greenhouse_multiturn_conversation, 'conversation_settled_after_multiple_turns');
  assert.deepEqual(state.interaction.settled_ids, ['interaction:interaction_1']);
  assert.equal(settlement.localSettlementAction('第三轮不应再被视为研究续聊', state), null);

  state = settlement.applyLocalSettlement(state, action('investigate_flower_core', 'greenhouse_flower_core'), 11, '激活');
  state.battle.current = {
    settlement_id: 'r21-test-narrative',
    config_id: 'greenhouse_flower_core_tutorial_v1',
    outcome: 'narrative',
    remaining_lives: 3,
    grazes: 0,
    duration_ms: 0,
    hits: 0,
    damage: 0,
    phases_cleared: 0,
    objective_ratio: 100,
  };
  state = settlement.applyLocalSettlement(state, action('settle_flower_core_battle', 'greenhouse_flower_core'), 12, '结算');
  assert.equal(state.battle.current, null);
  assert.deepEqual(state.battle.settled_ids, ['r21-test-narrative']);
  assert.equal(state.events.completed_key_events.greenhouse_flower_core, 'narrative');
  assert.match(state.memory.long_term_notes.join('\n'), /移动锚点/);
  assert.deepEqual(state.anchors.stable, {});
});

test('R21 非受控自由文本不能篡改本地托管事件字段', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const before = JSON.parse(await read('../src/schema/initial-state.json'));
  before.events.completed_key_events.reimu_boundary_inspection = 'temporary_permission';
  const after = structuredClone(before);
  after.areas.greenhouse_plot.unlocked = false;
  after.areas.greenhouse_plot.state = '清理中';
  after.facilities.magic_greenhouse.state = '可建设';
  after.events.active_event = { config_id: 'marisa_material_rumor' };
  after.events.completed_key_events.clear_greenhouse_foundation = 'foundation_cleared';
  after.battle.current = { settlement_id: 'forged', config_id: 'forged' };
  const restored = settlement.restoreLocalEventOwnership(before, after);
  assert.equal(restored.areas.greenhouse_plot.unlocked, before.areas.greenhouse_plot.unlocked);
  assert.equal(restored.areas.greenhouse_plot.state, before.areas.greenhouse_plot.state);
  assert.equal(restored.facilities.magic_greenhouse.state, before.facilities.magic_greenhouse.state);
  assert.equal(restored.events.active_event, null);
  assert.equal(restored.events.completed_key_events.clear_greenhouse_foundation, undefined);
  assert.equal(restored.battle.current, null);
});

test('R21 空回复与本地结算失败进入可重试事务，不重复创建玩家楼层', async () => {
  const transaction = await read('../src/ui/message-transaction.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const app = await read('../src/ui/app.ts');
  assert.match(transaction, /markGenerationEnded/);
  assert.match(transaction, /没有收到可用的 assistant 正文/);
  assert.match(transaction, /markSettlementFailed/);
  assert.match(bridge, /pendingSettlement/);
  assert.match(bridge, /persistPendingSettlement/);
  assert.match(bridge, /restoreLocalEventOwnership/);
  assert.match(app, /重试本地结算/);
});

test('事务收到正文后保持结算锁，只有本地结算成功才能接受下一条消息', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  let releaseGeneration;
  const generationGate = new Promise((resolve) => { releaseGeneration = resolve; });
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-1',
    listMessages: () => messages,
    async createUserMessage(message, extra) {
      messages.push({ message_id: messages.length, role: 'user', message, extra });
    },
    async triggerGeneration() {
      await generationGate;
      messages.push({ message_id: messages.length, role: 'assistant', message: '完整回复' });
    },
    async continueGeneration() {},
  });
  const first = coordinator.submit({ kind: 'interaction', message: '第一条' });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    coordinator.submit({ kind: 'settlement', message: '不该出现的收尾楼层' }),
    /上一条消息仍在处理中/,
  );
  releaseGeneration();
  const received = await first;
  assert.equal(received.assistantResponded, true);
  assert.equal(received.phase, 'settling');
  await assert.rejects(
    coordinator.submit({ kind: 'settlement', message: '结算期间也不能提交' }),
    /上一条消息仍在处理中/,
  );
  coordinator.markSettlementSucceeded();
  assert.equal(coordinator.read().phase, 'settled');
});

test('迟到的 trigger Promise 不能把后台已完成的事务倒退回结算中', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  let releaseTrigger;
  const triggerGate = new Promise((resolve) => { releaseTrigger = resolve; });
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-native-switch',
    listMessages: () => messages,
    async createUserMessage(message, extra) {
      messages.push({ message_id: 1, role: 'user', message, extra });
    },
    async triggerGeneration() {
      messages.push({ message_id: 2, role: 'assistant', message: '回复与本地结算已经完成' });
      await triggerGate;
    },
    async continueGeneration() {},
  });
  const pending = coordinator.submit({ kind: 'interaction', message: '检查结界' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(coordinator.read().phase, 'settling');
  coordinator.markSettlementSucceeded();
  releaseTrigger();
  const completed = await pending;
  assert.equal(completed.phase, 'settled');
  assert.equal(completed.assistantMessageId, 2);
});

test('本地结束会废弃失败事务，下一次角色互动可以重新提交', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-local-end-reset',
    listMessages: () => messages,
    async createUserMessage(message, extra) {
      messages.push({ message_id: messages.length, role: 'user', message, extra });
    },
    async triggerGeneration() {
      messages.push({ message_id: messages.length, role: 'assistant', message: '可显示回复' });
    },
    async continueGeneration() {},
  });
  const first = await coordinator.submit({ kind: 'interaction', message: '聊天' });
  assert.equal(first.phase, 'settling');
  coordinator.markSettlementFailed(new Error('模拟本地结算失败'));
  assert.equal(coordinator.read().phase, 'failed');
  coordinator.resetAfterLocalEnd();
  assert.equal(coordinator.read().phase, 'idle');
  const second = await coordinator.submit({ kind: 'interaction', message: '摸摸头' });
  assert.equal(second.assistantResponded, true);
});

test('await trigger 返回但没有正文时进入可重试失败态，不再永久显示回应中', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [];
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-2',
    listMessages: () => messages,
    async createUserMessage(message, extra) {
      messages.push({ message_id: messages.length, role: 'user', message, extra });
    },
    async triggerGeneration() {},
    async continueGeneration() {},
  });
  const result = await coordinator.submit({ kind: 'interaction', message: '触发失败' });
  assert.equal(result.phase, 'failed');
  assert.equal(result.assistantResponded, false);
  assert.match(result.lastError, /请求可能未启动/);
});

test('假流式 trigger 提前返回时事务会等待当前楼层，不会借用旧回复', async () => {
  const { MessageTransactionCoordinator } = await importTypescript('../src/ui/message-transaction.ts');
  const messages = [
    { message_id: 0, role: 'assistant', message: '开场' },
    { message_id: 1, role: 'user', message: '旧请求', extra: { gensokyoTransactionId: 'old' } },
    { message_id: 2, role: 'assistant', message: '旧回复' },
  ];
  let generating = false;
  const coordinator = new MessageTransactionCoordinator({
    currentChatId: () => 'chat-fake-stream',
    listMessages: () => messages,
    isGenerationActive: () => generating,
    async createUserMessage(message, extra) {
      messages.push({ message_id: messages.length, role: 'user', message, extra });
    },
    async triggerGeneration() {
      generating = true;
      setTimeout(() => {
        messages.push({ message_id: messages.length, role: 'assistant', message: '新回复' });
        generating = false;
      }, 40);
    },
    async continueGeneration() {},
  });
  const result = await coordinator.submit({ kind: 'interaction', message: '新请求' });
  assert.equal(result.assistantResponded, true);
  assert.equal(result.assistantMessageId, 4);
  assert.equal(result.phase, 'settling');
});

test('GAL 只选择当前用户楼层之后的回复，等待中不回退到上一轮', async () => {
  const selection = await importTypescript('../src/ui/gal-message-selection.ts');
  const messages = [
    { id: 0, role: 'assistant', name: '', text: '开场' },
    { id: 1, role: 'user', name: '', text: '旧请求' },
    { id: 2, role: 'assistant', name: '', text: '旧回复' },
    { id: 3, role: 'user', name: '', text: '新请求' },
  ];
  assert.equal(selection.assistantForCurrentTurn(messages), null);
  assert.equal(selection.assistantForCurrentTurn(messages, 1)?.id, 2);
  messages.push({ id: 4, role: 'assistant', name: '', text: '新回复' });
  assert.equal(selection.assistantForCurrentTurn(messages)?.id, 4);
});

test('返回原生聊天后重新打开游戏会主动校正事务状态', async () => {
  const app = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  const bridge = await read('../src/ui/bridge.ts');
  const shell = await read('../src/runtime/ui-host-shell.js');
  assert.match(shell, /gensokyo-garden:resume/);
  assert.match(app, /addEventListener\('gensokyo-garden:resume'/);
  assert.match(app, /if \(returnView === 'gal'\) void refresh\(\)/);
  assert.match(app, /回复已收到，正在同步游戏状态/);
  assert.match(app, /gg-gal-back'\)\.disabled = active/);
  assert.match(app, /gg-regenerate'\)\.disabled = active/);
  assert.match(app, /gg-swipe-right'\)\.disabled = active/);
  assert.match(styles, /\.gg-dialogue-box\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(bridge, /gensokyoSystemOperation/);
  assert.match(bridge, /recoverRecordedAnomalyResolution/);
  assert.match(bridge, /recoverCompletedCurrentTransaction/);
  assert.match(bridge, /settlementProjection\(current, action, assistantMessageId\)/);
  assert.match(bridge, /reconcileHostGenerationActivity\(hostGenerationActive, snapshot\)/);
  assert.match(bridge, /regenerationPhase/);
  assert.match(bridge, /targetMessageId = Number\(latestAssistant\?\.message_id\)/);
  assert.match(bridge, /transactions\.markStopped\(\)/);
  assert.match(bridge, /当前回复仍在生成或同步状态，不能提前结束聊天/);
  assert.match(bridge, /gensokyoTransactionKind === 'settlement'/);
  assert.match(bridge, /includes\('【异变最终收束】'\)/);
});

test('庭园主线只使用本地白名单结算，不依赖预设的第二次解析', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const rules = await read('../src/lorebook/variable-update-rules.md');
  const contract = await read('../project/contract.md');
  const app = await read('../src/ui/app.ts');
  assert.match(bridge, /\/trigger await=true/);
  assert.match(bridge, /deterministicSettlementResult/);
  assert.match(bridge, /eventResultForAction\(event\.config_id, action\.action_id\) \?\? event\.allowed_results\[0\]/);
  assert.deepEqual(registry.eventById.get('reimu_boundary_inspection').allowed_results, [
    'temporary_permission', 'supervised_restriction', 'urgent_seal_repair',
  ]);
  assert.equal(registry.eventById.get('main_house_repair').allowed_results[0], 'main_house_enabled');
  assert.equal(registry.eventById.get('marisa_material_rumor').allowed_results[0], 'greenhouse_clue_found');
  assert.equal(registry.eventById.get('build_basic_magic_greenhouse').allowed_results[0], 'basic_greenhouse_enabled');
  assert.match(bridge, /before\.battle\?\.current\?\.outcome/);
  assert.doesNotMatch(bridge, /json_schema/);
  assert.doesNotMatch(bridge, /第二次结算解析/);
  assert.match(rules, /不发起第二次模型解析/);
  assert.match(contract, /不发起第二次模型解析/);
  assert.match(app, /restoreInputOnFailure: false/);
  assert.match(app, /galCompose\.hidden = singleShotEventPresentation/);
});

test('R29 副本只由本地白名单结算金币、时段与幂等记录', async () => {
  const dungeon = await importTypescript('../src/ui/dungeon-rules.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  initial.battle.dungeon_unlocked = true;
  initial.environment.day = 7;
  initial.environment.time_period = '夜晚';
  const result = {
    settlement_id: 'dungeon-r29-clean-1', config_id: 'fairy_pattern_practice_v1', outcome: 'clean_win',
    remaining_lives: 3, grazes: 0, duration_ms: 1000, hits: 1, damage: 1, phases_cleared: 1, objective_ratio: 100,
  };
  const settled = dungeon.settleDungeonResult(initial, result);
  assert.equal(settled.resources.coins, 12);
  assert.equal(settled.environment.day, 8);
  assert.equal(settled.environment.time_period, '清晨');
  assert.equal(settled.battle.last_run.started_day, 7);
  assert.equal(settled.battle.last_run.settled_day, 8);
  assert.deepEqual(settled.battle.rewarded_ids, ['dungeon-r29-clean-1']);
  assert.throws(() => dungeon.settleDungeonResult(settled, result), /已经结算/);
  assert.throws(() => dungeon.validateDungeonResult({ ...result, outcome: 'narrative' }, initial), /不接受叙事/);
});

test('R29 旧存档迁移、事件契约与副本入口完整登记', async () => {
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  delete initial.resources.coins;
  delete initial.battle.dungeon_unlocked;
  delete initial.battle.rewarded_ids;
  const migrated = migration.migrateGardenState(initial);
  assert.equal(migrated.resources.coins, 0);
  assert.equal(migrated.battle.dungeon_unlocked, false);
  assert.deepEqual(migrated.battle.rewarded_ids, []);
  const registry = JSON.parse(await read('../src/battle/dungeon-registry.json'));
  assert.equal(registry.dungeons.length, 3);
  assert.equal(new Set(registry.dungeons.map((entry) => entry.config_id)).size, 3);
  const events = JSON.parse(await read('../src/lorebook/events/greenhouse-vertical-slice.json'));
  for (const event of events.events) {
    assert.ok(event.event_type);
    assert.ok(Array.isArray(event.trigger_action_ids));
    assert.ok(Array.isArray(event.narrative_outline));
    assert.ok(Array.isArray(event.forbidden_deviations));
  }
});

test('验收快进只写受控测试快照，能直达温室与妖花战后', async () => {
  const tools = await importTypescript('../src/ui/test-tools.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const greenhouse = tools.applyTestJump(initial, 'greenhouse_ready');
  assert.equal(greenhouse.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.equal(greenhouse.events.completed_key_events.greenhouse_flower_core, undefined);
  assert.equal(greenhouse.battle.dungeon_unlocked, false);
  const afterCore = tools.applyTestJump(initial, 'r29_after_flower_core');
  assert.equal(afterCore.events.completed_key_events.greenhouse_flower_core, 'clean_win');
  assert.equal(afterCore.battle.dungeon_unlocked, true);
  assert.equal(afterCore.battle.current, null);
  const app = await read('../src/ui/app.ts');
  const html = await read('../src/ui/index.html');
  assert.match(app, /applyTestJump/);
  assert.match(html, /测试快进/);
});

test('M2 验收快进可独立抵达开放庭园、异变、设施、来访和修复检查点', async () => {
  const tools = await importTypescript('../src/ui/test-tools.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const jumps = [
    'm2_open_garden',
    'm2_anomaly_ready',
    'm2_anomaly_resolution_ready',
    'm2_facilities_ready',
    'm2_visitors_ready',
    'm2_items_recovery_ready',
  ];
  for (const jump of jumps) {
    const state = tools.applyTestJump(initial, jump);
    assert.equal(tools.testJumpReached(state, jump), true, jump);
    assert.equal(state.events.completed_key_events.select_greenhouse_form, 'selected_free_growth');
    assert.equal(state.interaction.current_session, null);
    assert.equal(state.garden_projects.active_construction, null);
    assert.equal(state.garden.construction_stage, '开放');
    assert.equal(state.areas.main_house.state, '启用');
    assert.match(state.memory.long_term_notes.join('\n'), /新手教程.*不得重演教程/);
  }
  const open = tools.applyTestJump(initial, 'm2_open_garden');
  assert.equal(open.facility_runtime.fairy_garden.built, false);
  const anomaly = tools.applyTestJump(initial, 'm2_anomaly_ready');
  assert.equal(anomaly.inventory.consumables.incident_trigger_card, 3);
  assert.equal(anomaly.anomaly_cycle.active, null);
  const ending = tools.applyTestJump(initial, 'm2_anomaly_resolution_ready');
  assert.equal(ending.environment.day, 8);
  assert.equal(ending.anomaly_cycle.active.status, 'resolving');
  const facilities = tools.applyTestJump(initial, 'm2_facilities_ready');
  assert.equal(facilities.facility_runtime.moon_spring.unlocked_forms.length, 3);
  const visitors = tools.applyTestJump(initial, 'm2_visitors_ready');
  assert.deepEqual(visitors.presence_snapshot.present_character_ids, ['reimu', 'marisa', 'alice']);
  assert.equal(visitors.presence_snapshot.character_views.reimu.action, '在庭院休息');
  const repair = tools.applyTestJump(initial, 'm2_items_recovery_ready');
  assert.equal(repair.facility_runtime.fairy_garden.status, 'damaged');
  assert.equal(repair.inventory.consumables.emergency_repair_kit, 3);

  const app = await read('../src/ui/app.ts');
  const html = await read('../src/ui/index.html');
  for (const id of ['gg-test-m2-open', 'gg-test-m2-anomaly', 'gg-test-m2-anomaly-end', 'gg-test-m2-facilities', 'gg-test-m2-visitors', 'gg-test-m2-items']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(app, new RegExp(id));
  }
});

test('助手楼层已经出现时会清除漏掉结束事件留下的宿主忙碌标志', async () => {
  const { reconcileHostGenerationActivity } = await importTypescript('../src/ui/async-coordination.ts');
  assert.equal(reconcileHostGenerationActivity(true, { assistantResponded: false }), true);
  assert.equal(reconcileHostGenerationActivity(true, { assistantResponded: true }), false);
  assert.equal(reconcileHostGenerationActivity(false, { assistantResponded: true }), false);
});

test('刷新请求落在旧 drain 结束与 Promise 清理之间时不会被悬挂', async () => {
  const { LatestRefreshQueue } = await importTypescript('../src/ui/async-coordination.ts');
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  let runs = 0;
  let tailRefresh;
  const queue = new LatestRefreshQueue(async () => {
    runs += 1;
    if (runs === 1) {
      markStarted();
      await firstGate;
    }
  }, 0);

  const firstRefresh = queue.request();
  await started;
  firstGate.then(() => { tailRefresh = queue.request(); });
  releaseFirst();
  await firstRefresh;
  await Promise.resolve();
  await tailRefresh;
  assert.equal(runs, 2);
});

test('R48 强制结算会越过后台未就绪探测，刷新队列不会悬挂或留下旧状态', async () => {
  const { LatestRefreshQueue, SettlementAttemptCoordinator } = await importTypescript('../src/ui/async-coordination.ts');

  let releaseProbe;
  const probeGate = new Promise((resolve) => { releaseProbe = resolve; });
  const settlement = new SettlementAttemptCoordinator();
  const attempts = [];
  const attempt = async (forceReady) => {
    attempts.push(forceReady);
    if (!forceReady) {
      await probeGate;
      return false;
    }
    return true;
  };
  const background = settlement.run(false, attempt);
  const forced = settlement.run(true, attempt);
  releaseProbe();
  assert.equal(await background, false);
  assert.equal(await forced, true);
  assert.deepEqual(attempts, [false, true]);

  const states = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  let runs = 0;
  const refreshes = new LatestRefreshQueue(async () => {
    runs += 1;
    if (runs === 1) {
      markFirstStarted();
      await firstGate;
    }
    states.push(runs);
  }, 0);
  const first = refreshes.request();
  await firstStarted;
  const latest = refreshes.request();
  releaseFirst();
  await Promise.all([first, latest]);
  assert.deepEqual(states, [1, 2]);
});

test('开放阶段提示严格切断新手教程，异变自由聊天不擅自生成源头线索', async () => {
  const tools = await importTypescript('../src/ui/test-tools.ts');
  const prompt = await importTypescript('../src/ui/prompt-context.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  const state = tools.applyTestJump(initial, 'm2_anomaly_ready');
  state.anomaly_cycle.active = {
    anomaly_id: 'test-anomaly', title: '互换身体', rule_text: '所有人互换身体', scope_mode: 'all',
    character_ids: [], presentation_tone: '', excluded_content: '',
    hidden_origin: { name: '镜', type: '物件', summary: '秘密', location: '井底', cause: '愿力', resolution_method: '切断缘线' },
    public_summary: '身份错位', revealed_clues: [], status: 'active',
    start_period_serial: 0, end_period_serial: 28, last_guidance_day: 0, last_clue_day: null,
  };
  const text = prompt.buildPromptContext(state, { kind: 'ordinary' });
  assert.match(text, /阶段边界：教程已经彻底结束/);
  assert.match(text, /不得重演、续写或重新布置/);
  assert.match(text, /普通聊天不得新增、猜定或指向异变源头/);
  assert.doesNotMatch(text, /井底|切断缘线|"hidden_origin"/);
});

test('R30 小店目录以本地白名单原子购买物资，拒绝越界与重复结算', async () => {
  const shop = await importTypescript('../src/ui/shop-rules.ts');
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  initial.shop.unlocked = true;
  initial.resources.coins = 50;
  initial.resources.materials = 10;
  const one = shop.purchaseShopItem(initial, 'basic_material_single', 'shop-test-1');
  assert.equal(one.resources.coins, 44);
  assert.equal(one.resources.materials, 11);
  assert.throws(() => shop.purchaseShopItem(one, 'basic_material_single', 'shop-test-1'), /已经结算/);
  assert.throws(() => shop.purchaseShopItem(initial, 'unknown', 'shop-test-2'), /不在本地目录/);
  const poor = structuredClone(initial); poor.resources.coins = 5;
  assert.throws(() => shop.purchaseShopItem(poor, 'basic_material_single', 'shop-test-3'), /金币不够/);
  const full = structuredClone(initial); full.resources.materials = 19;
  assert.throws(() => shop.purchaseShopItem(full, 'basic_material_crate', 'shop-test-4'), /装不下/);
});

test('R31 自由生长方案只由本地单回合结算登记，不提前选型或改变资源', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const actionRules = await importTypescript('../src/ui/target-actions.ts');
  const actions = await read('../src/ui/target-actions.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.environment.day = 4;
  state.environment.time_period = '夜晚';
  state.resources.materials = 7;
  state.resources.inspiration = 3;
  state.facilities.magic_greenhouse.state = '启用';
  state.facilities.magic_greenhouse.current_form = '基础魔法温室';
  state.facilities.magic_greenhouse.unlocked_forms = ['基础魔法温室'];
  state.events.completed_key_events.greenhouse_flower_core = 'clean_win';
  state.presence_snapshot.present_character_ids = ['reimu', 'marisa'];

  assert.equal(rules.greenhouseActionBlock(state, 'organize_free_growth_proposal'), '');
  assert.equal(actionRules.isFixedPresentationAction('organize_free_growth_proposal'), true);
  assert.equal(actionRules.isFixedPresentationAction('marisa_greenhouse_night_observation'), false);
  assert.equal(registry.eventById.get('greenhouse_free_growth_proposal').max_effective_rounds, 1);
  assert.match(actions, /organize_free_growth_proposal/);
  assert.match(actions, /marisa_greenhouse_night_observation/);
  const app = await read('../src/ui/app.ts');
  assert.match(app, /isRestoredFixedPresentation/);
  assert.match(app, /singleShotEventPresentation \|\|= isRestoredFixedPresentation/);
  assert.match(app, /if \(singleShotEventPresentation \|\| closurePresented\)/);
  assert.doesNotMatch(app, /galInput\.value = message/);

  const action = {
    version: 'garden-action.v1',
    action_id: 'organize_free_growth_proposal',
    event_id: 'greenhouse_free_growth_proposal',
  };
  const after = settlement.applyLocalSettlement(state, action, 42, [
    '【庭园正文开始】<narration>魔理沙把方案压在花盆旁。</narration>【庭园正文结束】',
    '<GensokyoEventResult>{"version":"event-result.v1","event_id":"greenhouse_free_growth_proposal","result":"forged"}</GensokyoEventResult>',
  ].join('\n'));
  assert.equal(after.events.completed_key_events.greenhouse_free_growth_proposal, 'wild_growth_plan_registered');
  assert.deepEqual(after.facilities.magic_greenhouse.unlocked_forms, ['基础魔法温室', '自由生长型温室']);
  assert.equal(after.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.equal(after.resources.materials, 7);
  assert.equal(after.resources.inspiration, 3);
  assert.equal(after.environment.time_period, '夜晚');
  assert.equal(after.characters.marisa.current_relationship_facts[0].source_event_id, 'greenhouse_free_growth_proposal');
  assert.deepEqual(after.presence_snapshot.present_character_ids, ['reimu', 'marisa']);
  assert.deepEqual(after.presence_snapshot.character_views.marisa, {
    area_id: 'greenhouse_plot', action: '讨论自由生长方案', facing: 'front',
  });

  const forged = structuredClone(after);
  forged.facilities.magic_greenhouse.current_form = '自由生长型温室';
  forged.characters.marisa.current_relationship_facts = [];
  const restored = settlement.restoreLocalEventOwnership(after, forged);
  assert.equal(restored.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.equal(restored.characters.marisa.current_relationship_facts.length, 1);

  const partial = {
    events: { completed_key_events: { greenhouse_flower_core: 'clean_win' } },
    battle: { current: null, settled_ids: [] },
  };
  const protectedPartial = settlement.restoreLocalEventOwnership(after, partial);
  assert.deepEqual(protectedPartial.meta, after.meta);
  assert.equal(protectedPartial.player.name, state.player.name);
  assert.equal(protectedPartial.events.completed_key_events.greenhouse_free_growth_proposal, 'wild_growth_plan_registered');

  const bridge = await read('../src/ui/bridge.ts');
  assert.match(bridge, /settlePendingAfterReply/);
  assert.match(bridge, /findRecordedLocalSettlement/);
  assert.match(bridge, /setInterval/);
  assert.match(bridge, /subscribe\(g\.tavern_events\?\.MESSAGE_RECEIVED\)/);
  assert.match(bridge, /variableUpdateEpoch \+= 1/);
  assert.match(bridge, /isDuringExtraAnalysis/);
  assert.match(bridge, /ownershipBase = persistedStateBefore\(mvu, assistantMessageId\) \?\? before/);
  assert.match(bridge, /restoreLocalEventOwnership\(ownershipBase, current\)/);
  assert.match(bridge, /hasLocalPresenceTransition\(action\)/);
  assert.match(bridge, /eventById\.get\(action\.event_id\)/);
  assert.doesNotMatch(bridge, /subscribe\(g\.tavern_events\?\.MESSAGE_RECEIVED, true\)/);
  assert.match(bridge, /settlePendingAfterReply\(\)\.finally\(refresh\)/);

  const recorded = settlement.findRecordedLocalSettlement([
    { message_id: 40, role: 'user', message: '<GensokyoAction>{"version":"garden-action.v1","action_id":"organize_free_growth_proposal","event_id":"greenhouse_free_growth_proposal"}</GensokyoAction>' },
    { message_id: 41, role: 'assistant', message: '【庭园正文开始】方案已经交付。【庭园正文结束】' },
  ], state);
  assert.equal(recorded.assistantMessageId, 41);
  assert.equal(recorded.action.event_id, 'greenhouse_free_growth_proposal');
  assert.equal(settlement.findRecordedLocalSettlement([
    { message_id: 40, role: 'user', message: '<GensokyoAction>{"version":"garden-action.v1","action_id":"organize_free_growth_proposal","event_id":"greenhouse_free_growth_proposal"}</GensokyoAction>' },
    { message_id: 41, role: 'assistant', message: '【庭园正文开始】方案已经交付。【庭园正文结束】' },
  ], after), null);
  const upgradeConfig = JSON.parse(await read('../src/lorebook/events/greenhouse-upgrade-routes.json'));
  assert.equal(upgradeConfig.events[0].presence_transition.arrive[0].character_id, 'marisa');
});

test('R33 爱丽丝维护方案与受控会话 UID 都由 bridge 本地链路拥有', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const actionRules = await importTypescript('../src/ui/target-actions.ts');
  const actions = await read('../src/ui/target-actions.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.environment.day = 5;
  state.resources.materials = 9;
  state.resources.inspiration = 4;
  state.facilities.magic_greenhouse.state = '启用';
  state.facilities.magic_greenhouse.current_form = '基础魔法温室';
  state.facilities.magic_greenhouse.unlocked_forms = ['基础魔法温室', '自由生长型温室'];
  state.events.completed_key_events.greenhouse_flower_core = 'clean_win';
  state.events.completed_key_events.greenhouse_free_growth_proposal = 'wild_growth_plan_registered';

  assert.equal(rules.greenhouseActionBlock(state, 'invite_alice_maintenance_assessment'), '');
  assert.equal(actionRules.isFixedPresentationAction('invite_alice_maintenance_assessment'), true);
  assert.equal(registry.eventById.get('alice_greenhouse_maintenance_proposal').max_effective_rounds, 1);
  assert.match(actions, /邀请爱丽丝进行维护评估/);
  assert.match(actions, /alice_doll_workshop_chat/);

  const action = {
    version: 'garden-action.v1',
    action_id: 'invite_alice_maintenance_assessment',
    event_id: 'alice_greenhouse_maintenance_proposal',
  };
  const after = settlement.applyLocalSettlement(state, action, 51, '【庭园正文开始】爱丽丝交付了方案。【庭园正文结束】');
  assert.equal(after.events.completed_key_events.alice_greenhouse_maintenance_proposal, 'doll_maintenance_plan_registered');
  assert.deepEqual(after.facilities.magic_greenhouse.unlocked_forms, ['基础魔法温室', '自由生长型温室', '人偶维护型温室']);
  assert.equal(after.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.equal(after.resources.materials, 9);
  assert.equal(after.resources.inspiration, 4);
  assert.deepEqual(after.presence_snapshot.present_character_ids, ['reimu', 'alice']);
  assert.equal(after.presence_snapshot.character_views.alice.action, '进行人偶维护评估');
  assert.equal(after.characters.alice.current_relationship_facts[0].source_event_id, 'alice_greenhouse_maintenance_proposal');

  const sessionState = JSON.parse(await read('../src/schema/initial-state.json'));
  sessionState.events.completed_key_events.greenhouse_first_use = 'stable_first_growth';
  const researchAction = {
    version: 'garden-action.v1',
    action_id: 'greenhouse_research_talk',
    event_id: 'greenhouse_multiturn_conversation',
  };
  const staged = settlement.stageLocalSession(sessionState, researchAction);
  assert.equal(staged.interaction.current_session.uid, 'interaction_1');
  assert.equal(staged.interaction.current_session.effective_rounds, 0);
  assert.equal(staged.uid_counters.interaction, 2);
  const firstRound = settlement.applyLocalSettlement(staged, researchAction, 52, '第一轮研究');
  assert.equal(firstRound.interaction.current_session.uid, 'interaction_1');
  assert.equal(firstRound.interaction.current_session.effective_rounds, 1);
  assert.match(bridge, /persistStagedLocalSession/);
  assert.match(bridge, /stageLocalSession\(before, action\)/);
  assert.match(bridge, /event\.allowed_results\[0\]/);

  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const legacy = JSON.parse(await read('../src/schema/initial-state.json'));
  delete legacy.interaction;
  delete legacy.uid_counters;
  const migrated = migration.migrateGardenState(legacy);
  assert.equal(migrated.interaction.current_session, null);
  assert.deepEqual(migrated.interaction.settled_ids, []);
  assert.equal(migrated.uid_counters.interaction, 1);

  const upgradeConfig = JSON.parse(await read('../src/lorebook/events/greenhouse-upgrade-routes.json'));
  const aliceConfig = upgradeConfig.events.find((event) => event.config_id === 'alice_greenhouse_maintenance_proposal');
  assert.equal(aliceConfig.presence_transition.arrive[0].character_id, 'alice');
});

test('R34 荷取自动化方案不依赖爱丽丝路线，并由本地登记入场', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const actionRules = await importTypescript('../src/ui/target-actions.ts');
  const actions = await read('../src/ui/target-actions.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.environment.day = 6;
  state.resources.materials = 11;
  state.resources.inspiration = 5;
  state.facilities.magic_greenhouse.state = '启用';
  state.facilities.magic_greenhouse.current_form = '基础魔法温室';
  state.facilities.magic_greenhouse.unlocked_forms = ['基础魔法温室', '自由生长型温室'];
  state.events.completed_key_events.greenhouse_flower_core = 'clean_win';
  state.events.completed_key_events.greenhouse_free_growth_proposal = 'wild_growth_plan_registered';

  assert.equal(rules.greenhouseActionBlock(state, 'commission_nitori_engineering_survey'), '');
  assert.equal(actionRules.isFixedPresentationAction('commission_nitori_engineering_survey'), true);
  assert.equal(registry.eventById.get('nitori_greenhouse_automation_proposal').max_effective_rounds, 1);
  assert.equal(state.events.completed_key_events.alice_greenhouse_maintenance_proposal, undefined);
  assert.match(actions, /委托荷取进行工程测量/);
  assert.match(actions, /nitori_instrument_calibration_chat/);

  const action = {
    version: 'garden-action.v1',
    action_id: 'commission_nitori_engineering_survey',
    event_id: 'nitori_greenhouse_automation_proposal',
  };
  const after = settlement.applyLocalSettlement(state, action, 61, '【庭园正文开始】荷取交付工程测量方案。【庭园正文结束】');
  assert.equal(after.events.completed_key_events.nitori_greenhouse_automation_proposal, 'kappa_automation_plan_registered');
  assert.deepEqual(after.facilities.magic_greenhouse.unlocked_forms, ['基础魔法温室', '自由生长型温室', '河童自动化型温室']);
  assert.equal(after.facilities.magic_greenhouse.current_form, '基础魔法温室');
  assert.equal(after.resources.materials, 11);
  assert.equal(after.resources.inspiration, 5);
  assert.deepEqual(after.presence_snapshot.present_character_ids, ['reimu', 'nitori']);
  assert.equal(after.presence_snapshot.character_views.nitori.action, '进行温室工程测量');
  assert.equal(after.characters.nitori.current_relationship_facts[0].source_event_id, 'nitori_greenhouse_automation_proposal');
  assert.ok(registry.eventById.get('nitori_greenhouse_automation_proposal')
    .trigger_action_ids.includes('commission_nitori_engineering_survey'));

  const upgradeConfig = JSON.parse(await read('../src/lorebook/events/greenhouse-upgrade-routes.json'));
  const nitoriConfig = upgradeConfig.events.find((event) => event.config_id === 'nitori_greenhouse_automation_proposal');
  assert.equal(nitoriConfig.presence_transition.arrive[0].character_id, 'nitori');
});

test('R35 三方案首次选型与重复换型由登记结果和事件结算 ID 原子保护', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const rules = await importTypescript('../src/ui/greenhouse-rules.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const actionsModule = await importTypescript('../src/ui/target-actions.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.environment.day = 7;
  state.environment.time_period = '黄昏';
  state.resources.materials = 12;
  state.facilities.magic_greenhouse.state = '启用';
  state.facilities.magic_greenhouse.current_form = '基础魔法温室';
  state.facilities.magic_greenhouse.unlocked_forms = [
    '基础魔法温室', '自由生长型温室', '人偶维护型温室', '河童自动化型温室',
  ];
  state.facilities.magic_greenhouse.active_effects = ['温室核心保持安静'];
  Object.assign(state.events.completed_key_events, {
    marisa_material_rumor: 'greenhouse_clue_found',
    gain_second_inspiration: 'growth_pattern_understood',
    clear_greenhouse_foundation: 'foundation_cleared',
    build_basic_magic_greenhouse: 'basic_greenhouse_enabled',
    greenhouse_first_use: 'stable_first_growth',
    greenhouse_multiturn_conversation: 'conversation_settled_after_multiple_turns',
    greenhouse_flower_core: 'clean_win',
    greenhouse_free_growth_proposal: 'wild_growth_plan_registered',
    alice_greenhouse_maintenance_proposal: 'doll_maintenance_plan_registered',
    nitori_greenhouse_automation_proposal: 'kappa_automation_plan_registered',
  });

  const selectEvent = registry.eventById.get('select_greenhouse_form');
  assert.equal(selectEvent.local_settlement.material_cost, 4);
  assert.equal(registry.eventResultForAction('select_greenhouse_form', 'select_doll_maintenance'), 'selected_doll_maintenance');
  assert.equal(rules.greenhouseActionBlock(state, 'select_free_growth'), '');
  const target = { type: 'facility', id: 'magic_greenhouse', label: '魔法温室' };
  const selectActions = actionsModule.targetActions(target, state);
  assert.ok(selectActions.some((action) => action.id === 'select_free_growth' && action.cost.materials === 4));
  assert.ok(selectActions.some((action) => action.id === 'select_doll_maintenance'));
  assert.ok(selectActions.some((action) => action.id === 'select_kappa_automation'));
  const projected = actionsModule.buildActionMessage(
    selectActions.find((action) => action.id === 'select_free_growth'),
    state,
  );
  assert.match(projected, /形态 自由生长型温室/);
  assert.match(projected, /结果 selected_free_growth/);
  assert.doesNotMatch(projected, /selected_doll_maintenance/);
  const parsed = settlement.parseGardenAction(projected);
  assert.match(parsed.settlement_id, /^event:select_greenhouse_form:/);

  const afterSelect = settlement.applyLocalSettlement(state, parsed, 71, [
    '【庭园正文开始】改造完成。【庭园正文结束】',
    '<GensokyoEventResult>{"version":"event-result.v1","event_id":"select_greenhouse_form","result":"selected_kappa_automation"}</GensokyoEventResult>',
  ].join('\n'));
  assert.equal(afterSelect.facilities.magic_greenhouse.current_form, '自由生长型温室');
  assert.deepEqual(afterSelect.facilities.magic_greenhouse.active_effects, ['温室核心保持安静', 'free_growth_controlled_wildness']);
  assert.equal(afterSelect.resources.materials, 8);
  assert.equal(afterSelect.environment.day, 7);
  assert.equal(afterSelect.environment.time_period, '夜晚');
  assert.equal(afterSelect.events.completed_key_events.select_greenhouse_form, 'selected_free_growth');
  assert.ok(afterSelect.events.settled_ids.includes(parsed.settlement_id));
  assert.deepEqual(settlement.applyLocalSettlement(afterSelect, parsed, 71, '重复楼层'), afterSelect);

  const damagedAfterLateWrite = structuredClone(afterSelect);
  damagedAfterLateWrite.resources.materials = 12;
  damagedAfterLateWrite.facilities.magic_greenhouse.current_form = '基础魔法温室';
  damagedAfterLateWrite.facilities.magic_greenhouse.unlocked_forms = ['基础魔法温室'];
  damagedAfterLateWrite.facilities.magic_greenhouse.active_effects = [];
  assert.equal(settlement.settlementProjection(damagedAfterLateWrite, parsed, 71), false);
  const recordedRepair = settlement.findRecordedLocalSettlement([
    { message_id: 70, role: 'user', message: projected },
    { message_id: 71, role: 'assistant', message: '改造完成' },
  ], damagedAfterLateWrite);
  assert.equal(recordedRepair.action.action_id, 'select_free_growth');
  const repaired = settlement.applyLocalSettlement(state, recordedRepair.action, 71, recordedRepair.assistantText);
  assert.equal(repaired.facilities.magic_greenhouse.current_form, '自由生长型温室');
  assert.equal(repaired.resources.materials, 8);
  assert.equal(settlement.settlementProjection(repaired, parsed, 71, afterSelect), true);

  const damagedCostOnly = structuredClone(afterSelect);
  damagedCostOnly.resources.materials = 12;
  assert.equal(settlement.settlementProjection(damagedCostOnly, parsed, 71), true);
  assert.equal(settlement.settlementProjection(damagedCostOnly, parsed, 71, afterSelect), false);

  const remodelAction = {
    version: 'garden-action.v1',
    action_id: 'remodel_to_doll_maintenance',
    event_id: 'remodel_greenhouse_form',
    settlement_id: 'event:remodel_greenhouse_form:test-72',
  };
  assert.equal(rules.greenhouseActionBlock(afterSelect, 'remodel_to_doll_maintenance'), '');
  const afterRemodel = settlement.applyLocalSettlement(afterSelect, remodelAction, 72, '换型完成');
  assert.equal(afterRemodel.facilities.magic_greenhouse.current_form, '人偶维护型温室');
  assert.deepEqual(afterRemodel.facilities.magic_greenhouse.active_effects, ['温室核心保持安静', 'doll_maintenance_routine']);
  assert.equal(afterRemodel.resources.materials, 5);
  assert.equal(afterRemodel.environment.day, 8);
  assert.equal(afterRemodel.environment.time_period, '清晨');
  assert.equal(afterRemodel.events.completed_key_events.remodel_greenhouse_form, 'remodeled_to_doll_maintenance');
  assert.equal(settlement.findRecordedLocalSettlement([
    { message_id: 70, role: 'user', message: projected },
    { message_id: 71, role: 'assistant', message: '改造完成' },
  ], afterRemodel), null);
});

test('R36/R39 特殊商品、自定义异变卡与咲夜怀表完全由本地规则结算', async () => {
  const shop = await importTypescript('../src/ui/shop-rules.ts');
  const special = await importTypescript('../src/ui/special-item-rules.ts');
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const actions = await importTypescript('../src/ui/target-actions.ts');
  const prompt = await importTypescript('../src/ui/prompt-context.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.shop.unlocked = true;
  state.resources.coins = 200;
  state.player.current_area_id = 'central_courtyard';
  state.presence_snapshot.present_character_ids = ['reimu'];
  state.presence_snapshot.character_views.reimu.area_id = 'central_courtyard';

  const withCard = shop.purchaseShopItem(state, 'incident_trigger_card', 'shop-r36-card');
  assert.equal(withCard.resources.coins, 170);
  assert.equal(withCard.inventory.consumables.incident_trigger_card, 1);
  const equipped = shop.purchaseShopItem(withCard, 'sakuya_watch', 'shop-r36-watch');
  assert.equal(equipped.resources.coins, 90);
  assert.equal(equipped.key_items.sakuya_watch.obtained, true);
  assert.throws(() => shop.purchaseShopItem(equipped, 'sakuya_watch', 'shop-r36-watch-2'), /唯一物品|已经归你/);

  const activated = special.useSpecialItem(equipped, 'incident_trigger_card', 'item:incident:test-1', {
    title: '全员互换身体',
    rule_text: '庭园内所有人身体互换，但仍保持自我认知。',
    scope_mode: 'all',
    character_ids: [],
    presentation_tone: '轻喜剧',
    excluded_content: '',
  });
  assert.equal(activated.state.inventory.consumables.incident_trigger_card, 0);
  assert.equal(activated.state.anomaly_cycle.active.title, '全员互换身体');
  assert.equal(activated.state.anomaly_cycle.pending_activation, null);
  assert.equal(activated.state.anomaly_cycle.active.anomaly_id, 'item:incident:test-1');
  assert.ok(activated.state.anomaly_cycle.active.hidden_origin.name);
  assert.ok(activated.state.events.settled_ids.includes('item:incident:test-1'));
  assert.throws(() => special.useSpecialItem(activated.state, 'incident_trigger_card', 'item:incident:test-2', {
    title: '第二异变', rule_text: '不能叠加', scope_mode: 'all', character_ids: [], presentation_tone: '', excluded_content: '',
  }), /已有活动异变|不能叠加/);
  const ordinary = prompt.buildPromptContext(activated.state, { kind: 'ordinary' });
  assert.match(ordinary, /全员互换身体/);
  assert.doesNotMatch(ordinary, new RegExp(activated.state.anomaly_cycle.active.hidden_origin.name, 'u'));
  assert.doesNotMatch(ordinary, /hidden_origin/);
  const daily = prompt.buildPromptContext(activated.state, { kind: 'daily_investigation' });
  assert.match(daily, new RegExp(activated.state.anomaly_cycle.active.hidden_origin.name, 'u'));

  // Legacy waiting events remain migratable and are not promoted into anomaly_cycle.
  const legacy = migration.migrateGardenState({
    ...equipped,
    events: {
      ...equipped.events,
      waiting_events: [{ uid: 'waiting:old', config_id: 'fairy_seed_shower', title: '妖精种子雨', status: 'waiting' }],
    },
  });
  assert.equal(legacy.anomaly_cycle.active, null);
  assert.equal(legacy.events.waiting_events[0].config_id, 'fairy_seed_shower');

  const firstWatch = special.useSakuyaWatch(activated.state, 'item:watch:test-1');
  assert.equal(firstWatch.state.key_items.sakuya_watch.state, 'daily_cooldown');
  assert.equal(firstWatch.state.key_items.sakuya_watch.total_uses, 1);
  assert.equal(firstWatch.state.key_items.sakuya_watch.temporal_trace_active, true);
  assert.ok(firstWatch.state.key_items.sakuya_watch.noticed_by_character_ids.includes('reimu'));
  assert.equal(firstWatch.state.environment.time_period, equipped.environment.time_period);
  assert.equal(
    firstWatch.state.anomaly_cycle.active.end_period_serial - firstWatch.state.anomaly_cycle.active.start_period_serial,
    activated.state.anomaly_cycle.active.end_period_serial - activated.state.anomaly_cycle.active.start_period_serial,
  );
  assert.throws(() => special.useSakuyaWatch(firstWatch.state, 'item:watch:test-same-day'), /今天已经使用过/);

  const nextDay = structuredClone(firstWatch.state);
  nextDay.environment.day += 1;
  const ready = migration.migrateGardenState(nextDay);
  assert.equal(ready.key_items.sakuya_watch.state, 'ready');
  const secondWatch = special.useSakuyaWatch(ready, 'item:watch:test-2');
  assert.equal(secondWatch.state.key_items.sakuya_watch.total_uses, 2);
  assert.ok(secondWatch.state.events.waiting_events.some((event) => event.config_id === 'sakuya_temporal_trace_investigation'));
  assert.ok(registry.eventById.has('clockwork_temporal_ripple'));
  assert.ok(registry.eventById.has('sakuya_temporal_trace_investigation'));
  const courtyardActions = actions.targetActions({ type: 'area', id: 'central_courtyard', label: '中央庭院' }, secondWatch.state);
  assert.ok(courtyardActions.some((action) => action.id === 'investigate_sakuya_temporal_trace'));
  const specialEvents = await read('../src/lorebook/events/special-item-events.json');
  assert.doesNotMatch(specialEvents, /"participants"\s*:\s*\[[^\]]*(?:yukari|kaguya)/u);
});

test('R37 候选保留窄屏、可访问性、失败恢复与本地特殊商品反馈', async () => {
  const styles = await read('../src/ui/styles.css');
  const app = await read('../src/ui/app.ts');
  const bridge = await read('../src/ui/bridge.ts');
  const shopView = await read('../src/ui/shop-view.ts');
  const packageJson = JSON.parse(await read('../package.json'));
  const manifest = JSON.parse(await read('../project/manifest.json'));
  assert.match(styles, /@media \(max-width: 380px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /focus-visible/);
  assert.match(styles, /min-height: 44px/);
  assert.match(app, /retryLastTransaction/);
  assert.match(app, /beforeunload/);
  assert.match(app, /useSpecialItem/);
  assert.match(bridge, /道具使用复读校验失败/);
  assert.match(shopView, /今日已使用/);
  assert.match(shopView, /唯一关键物品/);
  assert.match(packageJson.scripts['package:checkpoint:dry'], /0\.2\.0-r/);
  assert.match(String(manifest.next_checkpoint), /0\.2\.0-r/);
});

test('优化门：事件登记表严格校验且允许结果只有一个事实源', async () => {
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const vertical = JSON.parse(await read('../src/lorebook/events/greenhouse-vertical-slice.json'));
  const routes = JSON.parse(await read('../src/lorebook/events/greenhouse-upgrade-routes.json'));
  const sideStories = JSON.parse(await read('../src/lorebook/events/free-side-stories.json'));
  const events = registry.validateEventDocuments([vertical, routes, sideStories]);
  assert.equal(events.length, vertical.events.length + routes.events.length + sideStories.events.length);
  assert.ok(events.every((event) => event.allowed_results.every((result) => typeof result === 'string')));
  const invalid = structuredClone(vertical);
  invalid.events[0].projection_keys = ['future.secret'];
  assert.throws(() => registry.validateEventDocuments([invalid]), /包含未登记路径/);
  assert.throws(() => registry.validateEventDocuments([vertical, vertical]), /重复 config_id/);
});

test('优化门：每次只投影当前事件，打包器不再关键词注入整份事件配置', async () => {
  const projection = await importTypescript('../src/ui/event-projection.ts');
  const actions = await importTypescript('../src/ui/target-actions.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  const prompt = projection.buildEventPromptProjection(
    'greenhouse_free_growth_proposal',
    'organize_free_growth_proposal',
    state,
  );
  assert.match(prompt, /【当前事件精确投影】/);
  assert.match(prompt, /greenhouse_free_growth_proposal/);
  assert.match(prompt, /characters\.marisa\.current_relationship_facts/);
  assert.doesNotMatch(prompt, /alice_greenhouse_maintenance_proposal/);
  assert.doesNotMatch(prompt, /nitori_greenhouse_automation_proposal/);
  assert.throws(() => projection.buildEventPromptProjection(
    'greenhouse_free_growth_proposal', 'repair', state,
  ), /未登记为事件/);
  const message = actions.buildActionMessage({
    id: 'organize_free_growth_proposal',
    label: '整理方案',
    description: '测试',
    intent: '我与魔理沙整理方案。',
    mode: 'gal',
    target: { id: 'magic_greenhouse', label: '魔法温室', type: 'facility' },
    eventId: 'greenhouse_free_growth_proposal',
  }, state);
  assert.match(message, /当前事件精确投影/);
  assert.doesNotMatch(message, /当前不在场：/);
  const packer = await read('../scripts/package-checkpoint.mjs');
  assert.doesNotMatch(packer, /greenhouseEvents/);
  assert.doesNotMatch(packer, /魔法温室纵切事件/);
});

test('优化门：时间不可倒退，未知区域回执不能污染正式在场快照', async () => {
  const time = await importTypescript('../src/ui/time-rules.ts');
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const state = JSON.parse(await read('../src/schema/initial-state.json'));
  state.environment.day = 4;
  state.environment.time_period = '黄昏';
  const backwards = structuredClone(state);
  backwards.environment.day = 3;
  backwards.environment.time_period = '夜晚';
  assert.deepEqual(time.enforceMonotonicTime(state, backwards).environment, state.environment);
  const sameDayBackwards = structuredClone(state);
  sameDayBackwards.environment.time_period = '白昼';
  assert.deepEqual(time.enforceMonotonicTime(state, sameDayBackwards).environment, state.environment);
  const nextDay = structuredClone(state);
  nextDay.environment.day = 5;
  nextDay.environment.time_period = '清晨';
  assert.equal(time.enforceMonotonicTime(state, nextDay).environment.day, 5);

  state.characters.marisa = { id: 'marisa', name: '雾雨魔理沙' };
  state.presence_snapshot = {
    present_character_ids: ['reimu'],
    character_views: { reimu: { area_id: 'central_courtyard', action: '等待', facing: 'front' } },
  };
  const invalidArea = settlement.applyPresenceUpdate(state, [
    '【庭园正文结束】',
    '<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu","marisa"],"character_views":{"reimu":{"area_id":"unknown_void"},"marisa":{"area_id":"unknown_void"}}}</GensokyoPresence>',
  ].join('\n'));
  assert.deepEqual(invalidArea.presence_snapshot.present_character_ids, ['reimu']);
  assert.equal(invalidArea.presence_snapshot.character_views.reimu.area_id, 'central_courtyard');
  assert.equal(invalidArea.presence_snapshot.character_views.marisa, undefined);
  assert.equal(settlement.localSettlementAction(
    '<GensokyoAction>{"version":"garden-action.v1","action_id":"repair","event_id":"reimu_boundary_inspection"}</GensokyoAction>',
    state,
  ), null);
});

test('设置页返回原场景，重复入口不会把返回目标污染成设置页', async () => {
  const app = await read('../src/ui/app.ts');
  assert.match(app, /let settingsReturnView: Exclude<SceneMode, 'settings'> = 'garden'/);
  assert.match(app, /const sourceView = currentView;\s+if \(sourceView === 'settings'\) return;\s+settingsReturnView = sourceView;/);
  assert.match(app, /function returnFromSettings\(\) \{\s+const returnView = settingsReturnView;\s+setView\(returnView\);\s+if \(returnView === 'gal'\) void refresh\(\);\s+\}/);
  assert.doesNotMatch(app, /previousView/);
});

test('宿主重复注入复用同一游戏框架，聊天切换不再强制重建 iframe', async () => {
  const host = await read('../src/runtime/ui-host-shell.js');
  assert.match(host, /existing\?\.version === version/);
  assert.match(host, /existing\.ownerCharacterId === ownerCharacterId/);
  assert.match(host, /existing\.ensureMounted\(\);\s+return;/);
  assert.match(host, /ensureMounted: attachShell/);
  const chatChangedHandler = host.match(/subscribe\(source\.tavern_events\?\.CHAT_CHANGED,[\s\S]*?\n  \}\);/)?.[0] ?? '';
  assert.doesNotMatch(chatChangedHandler, /rebuildFrame\(\)/);
});

test('普通角色或设施聊天可在界面重挂载后恢复 GAL，结束剧情除外', async () => {
  const app = await read('../src/ui/app.ts');
  assert.match(app, /function inferRecentGalContext\(messages: ChatMessageView\[\]\)/);
  assert.match(app, /action\.action_id === 'end_conversation'/);
  assert.match(app, /action\.target_type === 'character'/);
  assert.match(app, /action\.target_type === 'facility'/);
  assert.match(app, /inferRecentGalContext\(await bridge\.listMessages\(\)\)/);
  assert.match(app, /activeSessionActionId = recentContext\?\.actionId/);
});

test('本地结束解除失败事务与待办按钮，记录不伪造空 assistant 剧情', async () => {
  const app = await read('../src/ui/app.ts');
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(app, /message\.role !== 'assistant' \|\| message\.text\.trim\(\)/);
  assert.match(app, /submissionInFlight = false;[\s\S]*renderPendingTasks\(\);/);
  assert.match(bridge, /transactions\.resetAfterLocalEnd\(\)/);
  assert.match(bridge, /pendingSettlement = null;[\s\S]*pendingOwnershipBefore = null;[\s\S]*pendingSystemOperation = null;/);
});
