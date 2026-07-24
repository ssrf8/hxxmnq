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
  assert.match(document, /id="gg-view-gal"/);
  assert.match(document, /id="gg-gal-input"/);
  assert.match(document, /id="gg-suggested-replies"/);
  assert.match(document, /id="gg-end-chat"/);
  assert.match(document, /id="gg-show-native"/);
  assert.match(controller, /bridge\.sendUserMessage/);
  assert.match(controller, /buildSettlementMessage/);
  assert.match(controller, /submitGalMessage\(message, 'settlement'\)/);
  assert.match(actions, /action_id: 'end_conversation'/);
  assert.match(actions, /interaction\.settled_ids/);
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
  assert.match(bridge, /filter\(\(message\) => message\.role === 'assistant'\)\.reverse\(\)/);
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
  assert.match(packer, /\[initvar\] 移动庭园初始状态/);
  assert.match(packer, /<initvar>/);
  assert.match(packer, /JSON\.stringify\(initialState, null, 2\)/);
  assert.match(packer, /--checkpoint=0\.2\.0-rN/);
  assert.match(packer, /planned_checkpoint_sequence/);
  assert.match(packer, /GAL 表现与会话协议/);
  assert.match(packer, /gensokyo-garden-ui-020-\$\{CHECKPOINT_SUFFIX\}/);
  assert.match(packer, /确定性开场后的首次行动引导/);
  assert.match(packer, /此步骤会直接写入并复读 MVU，不调用 LLM/);
  assert.match(packer, /if \(!DRY_RUN && await exists\(OUTPUT_FILE\)\)/);
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
