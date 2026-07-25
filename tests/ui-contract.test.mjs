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

test('灵梦与魔理沙 NPC 使用自包含图集并提供可暂停的 idle/walk 动画', async () => {
  const map = await read('../src/ui/garden-map.ts');
  const actor = await read('../src/ui/sprite-actor.ts');
  const build = await read('../scripts/build-ui.mjs');
  assert.match(map, /new SpriteActor\(id, actor\.label, actor\.source/);
  assert.match(map, /requestAnimationFrame/);
  assert.match(map, /visibilitychange/);
  assert.match(actor, /SpriteMotion = 'idle' \| 'walk'/);
  assert.match(actor, /prefers-reduced-motion|reducedMotion/);
  assert.match(actor, /facingCell/);
  assert.match(build, /reimuSpriteDataUrl/);
  assert.match(build, /reimu-turnaround-v1\.png/);
  assert.match(build, /marisaSpriteDataUrl/);
  assert.match(build, /marisa-riding-turnaround-v3\.png/);
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

test('互动使用单壳 GAL、自定义输入与真实收尾事务', async () => {
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
  assert.match(controller, /buildSettlementMessage/);
  assert.match(controller, /submitGalMessage\(message, 'settlement', \{ restoreInputOnFailure: false \}\)/);
  assert.match(actions, /action_id: 'end_conversation'/);
  assert.match(settlement, /interaction!\.settled_ids/);
});

test('符卡配置限制敌弹模式与参数上限', async () => {
  const config = JSON.parse(await read('../src/battle/configs/greenhouse-flower-core-tutorial-v1.json'));
  const allowed = new Set(['fixed_seed_ring', 'petal_fan', 'homing_leaf', 'local_safe_zone']);
  for (const phase of config.phases) {
    for (const pattern of phase.patterns) assert.ok(allowed.has(pattern.pattern_id), pattern.pattern_id);
  }
  assert.deepEqual(config.parameter_limits.speed, [40, 260]);
  assert.equal(config.player.auto_fire, true);
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
  assert.match(packer, /\[mvu_plot\]\[mvu_update\] 最新 MVU 状态/);
  assert.match(packer, /\[mvu_update\] 变量输出格式/);
  assert.match(packer, /'after_char', 0, 4/);
  assert.match(packer, /token_budget: 12288/);
  assert.match(projection, /\{\{format_message_variable::stat_data\}\}/);
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
  assert.match(mount, /reimuPortraitDataUrl/);
  assert.match(mount, /marisaPortraitDataUrl/);
  assert.match(mount, /mainHouseDataUrl/);
  assert.match(mount, /greenhouseDataUrl/);
  assert.doesNotMatch(mount, /position:'fixed',inset/);
  assert.doesNotMatch(mount, /127\.0\.0\.1:8765|gcore\.jsdelivr\.net/);
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

test('庭园主线只使用本地白名单结算，不依赖预设的第二次解析', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const registry = await importTypescript('../src/ui/event-registry.ts');
  const rules = await read('../src/lorebook/variable-update-rules.md');
  const contract = await read('../project/contract.md');
  const app = await read('../src/ui/app.ts');
  assert.match(bridge, /\/trigger await=true/);
  assert.match(bridge, /deterministicSettlementResult/);
  assert.match(bridge, /event\.allowed_results\.includes\(action\.action_id\)/);
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
  assert.match(bridge, /restoreLocalEventOwnership\(before, current\)/);
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
