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
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const baseState = async () => {
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const raw = JSON.parse(await read('../src/schema/initial-state.json'));
  const state = migration.migrateGardenState(raw);
  state.shop.unlocked = true;
  state.battle.dungeon_unlocked = true;
  state.inventory.consumables.opportunity_card = 0;
  state.inventory.consumables.spell_duel_card = 0;
  return state;
};

const battleResult = (configId, outcome, settlementId) => ({
  settlement_id: settlementId,
  config_id: configId,
  outcome,
  remaining_lives: outcome === 'loss' ? 0 : 2,
  grazes: 12,
  duration_ms: 45_000,
  hits: outcome === 'loss' ? 1 : 0,
  damage: 1200,
  phases_cleared: outcome === 'loss' ? 0 : 2,
  objective_ratio: outcome === 'loss' ? 40 : 100,
});

test('机遇卡以稳定种子抽取完整登记的未知角色并原子到场', async () => {
  const cards = await importTypescript('../src/ui/card-item-rules.ts');
  const visitors = await importTypescript('../src/ui/visitor-rules.ts');
  const original = await baseState();
  original.inventory.consumables.opportunity_card = 2;

  const first = cards.useOpportunityCard(original, 'opportunity:stable:1', 'chat-A');
  const sameSeed = cards.useOpportunityCard(original, 'opportunity:stable:1', 'chat-A');
  assert.equal(first.selectedCharacterId, sameSeed.selectedCharacterId);
  assert.equal(first.state.inventory.consumables.opportunity_card, 1);
  assert.ok(first.state.presence_snapshot.present_character_ids.includes(first.selectedCharacterId));
  assert.ok(first.state.visit_scheduler.known_characters.includes(first.selectedCharacterId));
  assert.equal(first.state.presence_snapshot.visitor_meta[first.selectedCharacterId].source, 'opportunity_card');
  assert.match(first.message, /机遇/);
  assert.ok(visitors.getVisitProfile(first.selectedCharacterId));

  const replay = cards.useOpportunityCard(first.state, 'opportunity:stable:1', 'chat-A');
  assert.equal(replay.alreadySettled, true);
  assert.equal(replay.selectedCharacterId, first.selectedCharacterId);
  assert.deepEqual(replay.state, first.state);
});

test('机遇卡在无候选、访客满员或受控事务中不消费', async () => {
  const cards = await importTypescript('../src/ui/card-item-rules.ts');
  const duel = await importTypescript('../src/ui/duel-card-rules.ts');
  const state = await baseState();
  state.inventory.consumables.opportunity_card = 1;
  state.visit_scheduler.known_characters = duel.listDuelProfiles().map((profile) => profile.character_id);
  assert.throws(
    () => cards.useOpportunityCard(state, 'opportunity:none:1'),
    /没有尚未认识/,
  );
  assert.equal(state.inventory.consumables.opportunity_card, 1);

  state.visit_scheduler.known_characters = [];
  state.presence_snapshot.present_character_ids = ['reimu', 'marisa', 'alice'];
  assert.throws(
    () => cards.useOpportunityCard(state, 'opportunity:full:1'),
    /访客已满/,
  );
  assert.equal(state.inventory.consumables.opportunity_card, 1);

  state.presence_snapshot.present_character_ids = [];
  state.events.active_event = { uid: 'busy', config_id: 'busy', status: 'active' };
  assert.throws(
    () => cards.useOpportunityCard(state, 'opportunity:busy:1'),
    /其他受控事务/,
  );
  assert.equal(state.inventory.consumables.opportunity_card, 1);
});

test('机遇卡通过本地商店目录购买并遵守开放条件与堆叠上限', async () => {
  const shop = await importTypescript('../src/ui/shop-rules.ts');
  const state = await baseState();
  state.resources.coins = 100;
  state.battle.dungeon_unlocked = false;
  const visible = shop.listShopItems(state).map((item) => item.item_id);
  assert.ok(visible.includes('opportunity_card'));
  assert.ok(!visible.includes('spell_duel_card'));

  const boughtOpportunity = shop.purchaseShopItem(state, 'opportunity_card', 'purchase:opportunity:1');
  assert.equal(boughtOpportunity.resources.coins, 60);
  assert.equal(boughtOpportunity.inventory.consumables.opportunity_card, 1);

  const capped = structuredClone(state);
  capped.inventory.consumables.opportunity_card = 9;
  assert.throws(
    () => shop.purchaseShopItem(capped, 'opportunity_card', 'purchase:opportunity:cap'),
    /持有上限/,
  );
});

test('角色对战按零枚极难、一至二枚标准、三枚以上援助锁定难度，取消不改变标签', async () => {
  const duel = await importTypescript('../src/ui/duel-card-rules.ts');
  const state = await baseState();

  state.inventory.card_runtime.duel.zako_tag_count = 0;
  const hard = duel.beginDuelCard(state, 'marisa', 'duel:hard:1');
  assert.equal(hard.difficultyTier, 'hard');
  assert.equal(hard.configId, 'character_duel_hard_v1');

  state.inventory.card_runtime.duel.zako_tag_count = 2;
  const standard = duel.beginDuelCard(state, 'reimu', 'duel:standard:1');
  assert.equal(standard.difficultyTier, 'standard');
  assert.equal(standard.configId, 'character_duel_standard_v1');
  assert.equal(standard.state.inventory.card_runtime.duel.pending_battle.target_character_id, 'reimu');
  const replay = duel.beginDuelCard(standard.state, 'reimu', 'duel:standard:1');
  assert.equal(replay.alreadyStarted, true);

  const cancelled = duel.cancelDuelCard(standard.state, 'duel:standard:1');
  assert.equal(cancelled.inventory.card_runtime.duel.pending_battle, null);

  state.inventory.card_runtime.duel.zako_tag_count = 3;
  const assisted = duel.beginDuelCard(state, 'alice', 'duel:assisted:1');
  assert.equal(assisted.difficultyTier, 'assisted');
  assert.equal(assisted.configId, 'character_duel_assisted_v1');
  assert.throws(() => duel.beginDuelCard(state, 'unregistered', 'duel:bad:1'), /没有登记对战档案/);
});

test('角色对话中只允许向当前交谈对象发起对战', async () => {
  const duel = await importTypescript('../src/ui/duel-card-rules.ts');
  const state = await baseState();
  state.interaction.current_session = {
    uid: 'interaction_dialogue_duel_1',
    type: 'character',
    status: 'active',
    participant_character_ids: ['marisa'],
  };

  assert.equal(duel.characterDuelBlock(state, 'marisa'), '');
  assert.match(duel.characterDuelBlock(state, 'reimu'), /只能向当前对话角色/);
  const started = duel.beginDuelCard(state, 'marisa', 'duel:dialogue:1');
  assert.equal(started.state.interaction.current_session.uid, 'interaction_dialogue_duel_1');
  assert.equal(started.state.inventory.card_runtime.duel.pending_battle.target_character_id, 'marisa');
});

test('对战失败纯本地加一枚杂鱼标签，不产生胜利剧情或正式奖励', async () => {
  const duel = await importTypescript('../src/ui/duel-card-rules.ts');
  const state = await baseState();
  state.resources.coins = 37;
  state.environment = { day: 4, time_period: '黄昏' };
  state.inventory.card_runtime.duel.zako_tag_count = 3;
  const started = duel.beginDuelCard(state, 'cirno', 'duel:loss:1').state;
  const result = battleResult('character_duel_assisted_v1', 'loss', 'duel-result:loss:1');
  const settled = duel.settleDuelCard(started, result);

  assert.equal(settled.won, false);
  assert.equal(settled.zakoTagCount, 4);
  assert.equal(settled.previousZakoTagCount, 3);
  assert.equal(settled.zakoTagDelta, 1);
  assert.equal(settled.state.inventory.card_runtime.duel.pending_battle, null);
  assert.equal(settled.state.inventory.card_runtime.duel.pending_victory_dialogue, null);
  assert.equal(settled.state.resources.coins, 37);
  assert.deepEqual(settled.state.environment, { day: 4, time_period: '黄昏' });
  assert.deepEqual(settled.state.battle.rewarded_ids, state.battle.rewarded_ids);
  assert.match(settled.message, /杂鱼标签 \+1/);

  const replay = duel.settleDuelCard(settled.state, result);
  assert.equal(replay.alreadySettled, true);
  assert.deepEqual(replay.state, settled.state);
});

test('对战胜利减一枚杂鱼标签且只创建待提交的胜利要求', async () => {
  const duel = await importTypescript('../src/ui/duel-card-rules.ts');
  const state = await baseState();
  state.resources.coins = 19;
  state.environment = { day: 7, time_period: '夜晚' };
  state.inventory.card_runtime.duel.zako_tag_count = 3;
  const started = duel.beginDuelCard(state, 'sakuya', 'duel:win:1').state;
  const settled = duel.settleDuelCard(
    started,
    battleResult('character_duel_assisted_v1', 'narrow_win', 'duel-result:win:1'),
  );

  assert.equal(settled.won, true);
  assert.equal(settled.zakoTagCount, 2);
  assert.equal(settled.previousZakoTagCount, 3);
  assert.equal(settled.zakoTagDelta, -1);
  assert.equal(settled.state.resources.coins, 19);
  assert.deepEqual(settled.state.environment, { day: 7, time_period: '夜晚' });
  assert.deepEqual(settled.state.inventory.card_runtime.duel.pending_victory_dialogue, {
    settlement_id: 'duel-result:win:1',
    target_character_id: 'sakuya',
    status: 'waiting_request',
    request_text: '',
  });

  const locked = duel.stageDuelVictoryRequest(
    settled.state,
    'duel-result:win:1',
    '请陪我在庭院里认真喝一次茶。',
  );
  assert.equal(locked.inventory.card_runtime.duel.pending_victory_dialogue.status, 'generating');
  assert.equal(locked.inventory.card_runtime.duel.pending_victory_dialogue.request_text, '请陪我在庭院里认真喝一次茶。');
  assert.throws(
    () => duel.stageDuelVictoryRequest(locked, 'duel-result:win:1', '临时更换另一个要求'),
    /已经锁定/,
  );
  assert.equal(
    duel.completeDuelVictoryDialogue(locked, 'duel-result:win:1')
      .inventory.card_runtime.duel.pending_victory_dialogue,
    null,
  );
});

test('对战卡拒绝叙事替代、错配配置和非法数值且不修改输入状态', async () => {
  const duel = await importTypescript('../src/ui/duel-card-rules.ts');
  const state = await baseState();
  state.inventory.card_runtime.duel.zako_tag_count = 1;
  const started = duel.beginDuelCard(state, 'marisa', 'duel:guard:1').state;
  const snapshot = structuredClone(started);

  assert.throws(
    () => duel.settleDuelCard(started, battleResult('character_duel_standard_v1', 'narrative', 'duel-result:narrative:1')),
    /不接受叙事替代/,
  );
  assert.throws(
    () => duel.settleDuelCard(started, battleResult('wrong_config', 'loss', 'duel-result:wrong:1')),
    /配置与预留不一致/,
  );
  const invalid = battleResult('character_duel_standard_v1', 'loss', 'duel-result:invalid:1');
  invalid.objective_ratio = 101;
  assert.throws(() => duel.settleDuelCard(started, invalid), /完成度非法/);
  assert.deepEqual(started, snapshot);
});

test('旧存档迁移幂等补齐卡片状态并清理非法 pending', async () => {
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const legacy = {
    inventory: {
      consumables: { opportunity_card: 99, spell_duel_card: 2 },
      card_runtime: {
        settled_use_ids: ['same', 'same'],
        opportunity: { pending: { use_id: '', selected_character_id: '', roll_seed: '', status: 'bad' } },
        duel: {
          zako_tag_count: 120,
          pending_battle: { use_id: '', target_character_id: '', config_id: '', difficulty_tier: 'bad' },
          settled_result_ids: ['result', 'result'],
          pending_victory_dialogue: { settlement_id: '', target_character_id: '', status: 'bad', request_text: 42 },
        },
      },
    },
  };
  const once = migration.migrateGardenState(legacy);
  const twice = migration.migrateGardenState(once);
  assert.equal(once.inventory.consumables.opportunity_card, 99);
  assert.equal(once.inventory.consumables.spell_duel_card, undefined);
  assert.equal(once.inventory.card_runtime.duel.zako_tag_count, 99);
  assert.equal(once.inventory.card_runtime.opportunity.pending, null);
  assert.equal(once.inventory.card_runtime.duel.pending_battle, null);
  assert.equal(once.inventory.card_runtime.duel.pending_victory_dialogue, null);
  assert.deepEqual(once.inventory.card_runtime.settled_use_ids, ['same']);
  assert.deepEqual(once.inventory.card_runtime.duel.settled_result_ids, ['result']);
  assert.deepEqual(once.inventory.card_runtime, twice.inventory.card_runtime);
});

test('三档对战配置均为本地白名单，零标签档具备原作 Hard 风格高压参数', async () => {
  const configs = await importTypescript('../src/battle/duel-configs.ts');
  const duel = await importTypescript('../src/ui/duel-card-rules.ts');
  const bases = configs.listDuelBaseConfigs();
  assert.deepEqual(
    bases.map((entry) => entry.config_id).sort(),
    ['character_duel_assisted_v1', 'character_duel_hard_v1', 'character_duel_standard_v1'],
  );

  const hard = configs.getDuelBattleConfig('reimu', 'hard');
  const standard = configs.getDuelBattleConfig('reimu', 'standard');
  const assisted = configs.getDuelBattleConfig('reimu', 'assisted');
  assert.equal(hard.presentation.boss_name, '博丽灵梦');
  assert.equal(hard.presentation.boss_id, 'reimu');
  assert.equal(hard.phases.length, 5);
  assert.equal(standard.phases.length, 4);
  assert.equal(assisted.phases.length, 3);
  assert.ok(hard.player.lives < standard.player.lives);
  assert.ok(hard.player.bombs < standard.player.bombs);
  assert.ok(assisted.player.lives > standard.player.lives);
  assert.ok(Math.min(...hard.phases.flatMap((phase) => phase.patterns.map((pattern) => pattern.interval_ms)))
    < Math.min(...standard.phases.flatMap((phase) => phase.patterns.map((pattern) => pattern.interval_ms))));
  assert.equal(duel.duelDifficultyForTags(0), 'hard');
  assert.equal(duel.duelDifficultyForTags(1), 'standard');
  assert.equal(duel.duelDifficultyForTags(2), 'standard');
  assert.equal(duel.duelDifficultyForTags(3), 'assisted');
  assert.throws(
    () => configs.getLockedDuelBattleConfig('reimu', 'hard', 'character_duel_standard_v1'),
    /难度与配置不一致/,
  );
});

test('Preview Bridge 会持久结算机遇卡，并预留、取消及按锁定极难配置结算角色对战', async () => {
  const bridgeModule = await importTypescript('../src/ui/bridge.ts');
  const preview = bridgeModule.createPreviewBridge();
  await preview.applyTestJump('r30_shop_ready');
  await preview.purchaseShopItem('opportunity_card', 'purchase:bridge-opportunity:1');
  const opportunity = await preview.useOpportunityCard('opportunity:bridge:1');
  assert.ok(opportunity.selectedCharacterId);
  let stored = await preview.readState();
  assert.ok(stored.presence_snapshot.present_character_ids.includes(opportunity.selectedCharacterId));
  assert.ok(stored.inventory.card_runtime.settled_use_ids.includes('opportunity:bridge:1'));

  const started = await preview.beginDuelCard('sakuya', 'duel:bridge:1');
  assert.equal(started.difficultyTier, 'hard');
  assert.equal(started.configId, 'character_duel_hard_v1');
  assert.equal(started.config.presentation.boss_name, '十六夜咲夜');
  stored = await preview.readState();
  assert.equal(stored.inventory.card_runtime.duel.pending_battle.use_id, 'duel:bridge:1');

  await preview.cancelDuelCard('duel:bridge:1');
  stored = await preview.readState();
  assert.equal(stored.inventory.card_runtime.duel.pending_battle, null);

  await preview.beginDuelCard('sakuya', 'duel:bridge:2');
  const settled = await preview.settleDuelCard(
    battleResult('character_duel_hard_v1', 'loss', 'duel-result:bridge:1'),
  );
  assert.equal(settled.won, false);
  assert.equal(settled.zakoTagCount, 1);
  stored = await preview.readState();
  assert.equal(stored.inventory.card_runtime.duel.pending_battle, null);
  assert.equal(stored.inventory.card_runtime.duel.pending_victory_dialogue, null);

  const standard = await preview.beginDuelCard('reimu', 'duel:bridge:3');
  assert.equal(standard.difficultyTier, 'standard');
  await preview.settleDuelCard(
    battleResult('character_duel_standard_v1', 'clean_win', 'duel-result:bridge:2'),
  );
  stored = await preview.readState();
  assert.equal(stored.inventory.card_runtime.duel.pending_victory_dialogue.status, 'waiting_request');
  const projection = await importTypescript('../src/ui/duel-victory-projection.ts');
  const requestText = '请陪我在庭院里认真喝一次茶。';
  const message = projection.buildDuelVictoryMessage(stored, requestText);
  assert.match(message, /必须承认本次对战结果并答应这个要求/);
  assert.match(message, /GSK_CHAR_REIMU_ACTIVE/);
  assert.match(message, /对手无需原本就在庭院/);
  assert.doesNotMatch(message, /庭园在场快照/);
  await preview.sendDuelVictoryRequest(requestText, message);
  stored = await preview.readState();
  assert.equal(stored.inventory.card_runtime.duel.pending_victory_dialogue, null);
  assert.ok((await preview.listMessages()).some((entry) => entry.role === 'user' && entry.text.includes(requestText)));
});

test('阶段 C 界面提供机遇卡、角色对战结算、胜利要求及窄屏可访问入口', async () => {
  const document = await read('../src/ui/index.html');
  const controller = await read('../src/ui/app.ts');
  const inventory = await read('../src/ui/inventory-view.ts');
  const styles = await read('../src/ui/styles.css');
  assert.match(document, /id="gg-duel-result-dialog"[\s\S]*?id="gg-duel-result-confirm"/);
  assert.match(document, /id="gg-duel-victory-dialog"[\s\S]*?id="gg-duel-victory-request"[^>]*maxlength="240"/);
  assert.match(inventory, /opportunity_card: '缘'/);
  assert.doesNotMatch(inventory, /spell_duel_card/);
  assert.match(controller, /activeBattleKind === 'duel'[\s\S]*?bridge\.settleDuelCard/);
  assert.match(controller, /openDuelResultDialog\(settled\)/);
  assert.match(controller, /bridge\.useOpportunityCard/);
  assert.match(controller, /bridge\.sendDuelVictoryRequest/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?#gg-duel-result-confirm/);
});
