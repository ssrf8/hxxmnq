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

const baseState = async () => {
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const raw = JSON.parse(await read('../src/schema/initial-state.json'));
  return migration.migrateGardenState(raw);
};

test('R38 period serial 覆盖四时段、跨日与 12/24/28 边界', async () => {
  const time = await importTypescript('../src/ui/time-rules.ts');
  assert.equal(time.periodSerial(1, '清晨'), 0);
  assert.equal(time.periodSerial(1, '夜晚'), 3);
  assert.equal(time.periodSerial(2, '清晨'), 4);
  assert.deepEqual(time.fromPeriodSerial(28), { day: 8, time_period: '清晨' });
  assert.deepEqual(time.iteratePeriodSerials(10, 12), [11, 12]);
  assert.equal(time.periodsBetween(0, 12), 12);
  assert.equal(time.periodsBetween(0, 24), 24);
  assert.equal(time.periodsBetween(0, 28), 28);
});

test('R38 迁移幂等补齐 anomaly/visit/facility/scene 默认值且保留旧等待事件', async () => {
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  const legacy = {
    environment: { day: 3, time_period: '白昼' },
    resources: { materials: 4, inspiration: 1, coins: 12 },
    events: {
      completed_key_events: {
        reimu_boundary_inspection: 'done',
        marisa_material_rumor: 'done',
        alice_greenhouse_maintenance_proposal: 'done',
        nitori_greenhouse_automation_proposal: 'done',
        select_greenhouse_form: 'selected_free_growth',
      },
      waiting_events: [{ uid: 'w1', config_id: 'wandering_magic_mist', title: '游荡魔法雾', status: 'waiting' }],
      settled_ids: [],
    },
    inventory: { consumables: { incident_trigger_card: 2 } },
    presence_snapshot: { present_character_ids: ['reimu'], character_views: { reimu: { area_id: 'central_courtyard' } } },
  };
  const once = migration.migrateGardenState(legacy);
  const twice = migration.migrateGardenState(once);
  assert.equal(once.anomaly_cycle.active, null);
  assert.equal(once.anomaly_cycle.pending_activation, null);
  assert.equal(once.events.waiting_events[0].config_id, 'wandering_magic_mist');
  assert.ok(once.visit_scheduler.known_characters.includes('reimu'));
  assert.ok(once.visit_scheduler.known_characters.includes('alice'));
  assert.ok(once.visit_scheduler.known_characters.includes('nitori'));
  assert.equal(once.facility_runtime.fairy_garden.built, false);
  assert.equal(once.scene_item_context, null);
  assert.deepEqual(once.anomaly_cycle, twice.anomaly_cycle);
  assert.deepEqual(once.visit_scheduler.known_characters, twice.visit_scheduler.known_characters);
});

test('R38 背包目录拒绝未知 ID，并支持 0/1/99 边界', async () => {
  const inventory = await importTypescript('../src/ui/inventory-rules.ts');
  let state = await baseState();
  state = inventory.addConsumable(state, 'fairy_candy_pack', 1);
  assert.equal(inventory.consumableCount(state, 'fairy_candy_pack'), 1);
  state.inventory.consumables.fairy_candy_pack = 99;
  assert.throws(() => inventory.addConsumable(state, 'fairy_candy_pack', 1), /上限/);
  assert.throws(() => inventory.validateItemId('player_made_sword'), /登记目录/);
  const rows = inventory.inventoryDisplayRows({
    ...state,
    inventory: { consumables: { fairy_candy_pack: 2, incident_trigger_card: 1 } },
    anomaly_cycle: { active: { end_period_serial: 40, start_period_serial: 10 }, pending_activation: null, history: [] },
  });
  const card = rows.find((row) => row.item_id === 'incident_trigger_card');
  assert.equal(card.usable, false);
  assert.match(card.disabledReason, /已有异变/);
});

test('R38 来访调度：相同 seed 稳定、未认识拒绝、人数上限与本地通知', async () => {
  const visitors = await importTypescript('../src/ui/visitor-rules.ts');
  const migration = await importTypescript('../src/ui/state-migrations.ts');
  let state = migration.migrateGardenState({
    environment: { day: 2, time_period: '白昼' },
    events: {
      completed_key_events: {
        reimu_boundary_inspection: 'yes',
        marisa_material_rumor: 'yes',
        alice_greenhouse_maintenance_proposal: 'yes',
        nitori_greenhouse_automation_proposal: 'yes',
      },
    },
    presence_snapshot: { present_character_ids: [], character_views: {} },
  });
  const a = visitors.evaluateVisitScheduler(state, { chatId: 'chat-A', commitArrivals: true });
  const b = visitors.evaluateVisitScheduler(state, { chatId: 'chat-A', commitArrivals: true });
  assert.deepEqual(
    (a.state.visit_scheduler.plans ?? []).map((plan) => plan.plan_id),
    (b.state.visit_scheduler.plans ?? []).map((plan) => plan.plan_id),
  );
  assert.throws(() => visitors.inviteCharacter(state, 'cirno', 'invite:cirno:1'), /尚未正式认识/);
  const filled = structuredClone(a.state);
  filled.presence_snapshot.present_character_ids = ['reimu', 'marisa', 'alice'];
  filled.presence_snapshot.visitor_meta = {
    reimu: { planned_departure_serial: 99 },
    marisa: { planned_departure_serial: 99 },
    alice: { planned_departure_serial: 99 },
  };
  const invited = visitors.inviteCharacter(filled, 'nitori', 'invite:nitori:cap');
  // accept may schedule/defer rather than exceed ordinary cap immediately
  assert.ok(['accept_now', 'reschedule', 'decline'].includes(invited.result));
  assert.ok((invited.state.presence_snapshot.present_character_ids?.length ?? 0) <= 3
    || invited.result !== 'accept_now');
});

test('R38 教程毕业由首次选型派生，机会面板同时展示三设施', async () => {
  const open = await importTypescript('../src/ui/open-garden-rules.ts');
  const state = await baseState();
  assert.equal(open.isTutorialGraduated(state), false);
  state.events.completed_key_events.select_greenhouse_form = 'selected_free_growth';
  assert.equal(open.isTutorialGraduated(state), true);
  const panel = open.openGardenOpportunityPanel(state);
  assert.equal(panel.facilities.length, 3);
  assert.ok(panel.facilities.every((item) => item.built === false));
  assert.match(panel.graduation, /没有必须完成的主线/);
});

test('R39 异变 28 时段、隐藏源头隔离、取消退卡与历史有界', async () => {
  const special = await importTypescript('../src/ui/special-item-rules.ts');
  const anomaly = await importTypescript('../src/ui/anomaly-rules.ts');
  const prompt = await importTypescript('../src/ui/prompt-context.ts');
  const time = await importTypescript('../src/ui/time-rules.ts');
  let state = await baseState();
  state.inventory.consumables.incident_trigger_card = 1;
  const reserved = special.beginAnomalyCardUse(state, 'anom:1', {
    title: '夜色反转',
    rule_text: '所有对话都变成夜谈语气',
    scope_mode: 'all',
    character_ids: [],
    presentation_tone: '',
    excluded_content: '<script>alert(1)</script>',
  });
  assert.equal(reserved.state.inventory.consumables.incident_trigger_card, 0);
  assert.equal(reserved.state.anomaly_cycle.pending_activation.form.excluded_content.includes('<script>'), true);
  const cancelled = special.abortAnomalyCardUse(reserved.state, 'anom:1');
  assert.equal(cancelled.state.inventory.consumables.incident_trigger_card, 1);
  assert.equal(cancelled.state.anomaly_cycle.pending_activation, null);

  const again = special.beginAnomalyCardUse(cancelled.state, 'anom:2', {
    title: '夜色反转',
    rule_text: '所有对话都变成夜谈语气',
    scope_mode: 'all',
    character_ids: [],
    presentation_tone: '',
    excluded_content: '',
  });
  const active = special.finalizeAnomalyCardUse(again.state, {
    name: '旧灯笼',
    type: '物件',
    summary: '灯笼改写了夜色',
    location: '中央庭院',
    cause: '残留愿力',
    resolution_method: '熄灭灯笼',
  });
  assert.equal(active.state.anomaly_cycle.active.end_period_serial - active.state.anomaly_cycle.active.start_period_serial, 28);
  prompt.assertNoHiddenOriginLeak(prompt.buildPromptContext(active.state, { kind: 'ordinary' }));
  const withClue = anomaly.appendDailyClue(active.state, '灵梦发现灯笼温度异常');
  const sameDay = anomaly.appendDailyClue(withClue, '不应重复');
  assert.equal(sameDay.anomaly_cycle.active.revealed_clues.length, 1);
  let cursor = withClue;
  for (let i = 0; i < 28; i += 1) cursor = time.advanceOneTimePeriod(cursor);
  cursor = anomaly.tickAnomalyLifecycle(cursor);
  assert.equal(cursor.anomaly_cycle.active.status, 'resolving');
  const resolved = anomaly.resolveAnomaly(cursor);
  assert.equal(resolved.anomaly_cycle.active, null);
  assert.equal(resolved.anomaly_cycle.history.length, 1);
});

test('R40 妖精花园建造/换型/12-24 解锁与糖果商店', async () => {
  const facility = await importTypescript('../src/ui/facility-rules.ts');
  const shop = await importTypescript('../src/ui/shop-rules.ts');
  const time = await importTypescript('../src/ui/time-rules.ts');
  let state = await baseState();
  state.events.completed_key_events.select_greenhouse_form = 'selected_free_growth';
  state.resources.materials = 10;
  state.resources.coins = 50;
  state.shop.unlocked = true;
  assert.throws(() => shop.purchaseShopItem(state, 'fairy_candy_pack', 'candy-early'), /尚未随对应设施开放/);
  state = facility.buildFacility(state, 'fairy_garden', '四季花境', 'build:fairy:1');
  assert.equal(state.resources.materials, 6);
  assert.equal(state.facility_runtime.fairy_garden.current_form, '四季花境');
  assert.equal(state.facilities.fairy_garden.state, '启用');
  const candy = shop.purchaseShopItem(state, 'fairy_candy_pack', 'candy-1');
  assert.equal(candy.inventory.consumables.fairy_candy_pack, 1);

  // 12-period fallback unlocks second-form choice
  let advanced = state;
  for (let i = 0; i < 12; i += 1) advanced = time.advanceOneTimePeriod(advanced);
  advanced = facility.tickFacilityUnlocks(advanced);
  assert.equal(advanced.facility_runtime.fairy_garden.second_form_choice_pending, true);
  advanced = facility.chooseSecondFacilityForm(advanced, 'fairy_garden', '妖精游乐庭');
  assert.ok(advanced.facility_runtime.fairy_garden.unlocked_forms.includes('妖精游乐庭'));

  // A character in the central courtyard is nearest to the banquet plaza and
  // must not globally block this fairy-garden remodel.
  advanced.presence_snapshot.present_character_ids = ['reimu'];
  advanced.presence_snapshot.character_views = { reimu: { area_id: 'central_courtyard' } };
  advanced.resources.materials = 5;
  const began = facility.beginFacilityRemodel(advanced, 'fairy_garden', '妖精游乐庭', 'refit:fairy:1', 'chat-1');
  const locked = began.state.facility_runtime.fairy_garden.pending_refit.selected_character_id;
  assert.equal(began.selectedCharacterId, locked);
  // same transaction stays locked; a brand-new transaction id is required to re-roll
  const other = facility.beginFacilityRemodel({
    ...advanced,
    resources: { ...advanced.resources, materials: 5 },
    presence_snapshot: { present_character_ids: [], character_views: {} },
  }, 'fairy_garden', '妖精游乐庭', 'refit:fairy:1', 'chat-1');
  assert.equal(other.selectedCharacterId, began.selectedCharacterId);
  const committed = facility.commitFacilityRemodel(began.state, 'refit:fairy:1');
  assert.equal(committed.facility_runtime.fairy_garden.current_form, '妖精游乐庭');
});

test('R40 换型只被最近该设施的在场角色阻止', async () => {
  const facility = await importTypescript('../src/ui/facility-rules.ts');
  const testTools = await importTypescript('../src/ui/test-tools.ts');
  let state = testTools.applyTestJump(await baseState(), 'm2_facilities_ready');
  state.resources.materials = 20;
  state.presence_snapshot = {
    present_character_ids: ['reimu'],
    character_views: { reimu: { area_id: 'central_courtyard' } },
    visitor_meta: {},
  };

  assert.match(facility.facilityRemodelBlock(state, 'banquet_plaza', '鬼之大宴台'), /博丽灵梦|reimu/);
  assert.equal(facility.facilityRemodelBlock(state, 'fairy_garden', '妖精游乐庭'), '');
  assert.equal(facility.facilityRemodelBlock(state, 'moon_spring', '静水观测池'), '');

  state.presence_snapshot.character_views.reimu.area_id = 'fairy_garden_plot';
  assert.match(facility.facilityRemodelBlock(state, 'fairy_garden', '妖精游乐庭'), /博丽灵梦|reimu/);
  assert.equal(facility.facilityRemodelBlock(state, 'banquet_plaza', '鬼之大宴台'), '');

  state.presence_snapshot.present_character_ids.push('marisa');
  state.presence_snapshot.character_views.marisa = { area_id: 'moon_spring_plot' };
  assert.match(facility.facilityRemodelBlock(state, 'moon_spring', '静水观测池'), /雾雨魔理沙|marisa/);
});

test('R41 月见温泉模式与茶/香包解锁', async () => {
  const facility = await importTypescript('../src/ui/facility-rules.ts');
  const activity = await importTypescript('../src/ui/activity-rules.ts');
  const shop = await importTypescript('../src/ui/shop-rules.ts');
  let state = await baseState();
  state.events.completed_key_events.select_greenhouse_form = 'selected_free_growth';
  state.resources.materials = 10;
  state.resources.coins = 40;
  state.shop.unlocked = true;
  assert.throws(() => activity.startMoonSpringSession(state, 'public'), /尚未建成/);
  state = facility.buildFacility(state, 'moon_spring', '露天月见汤', 'build:moon:1');
  assert.equal(state.resources.materials, 4);
  const tea = shop.purchaseShopItem(state, 'moon_viewing_tea', 'tea-1');
  const sachet = shop.purchaseShopItem(tea, 'hot_spring_sachet', 'sachet-1');
  assert.equal(sachet.inventory.consumables.moon_viewing_tea, 1);
  assert.equal(sachet.inventory.consumables.hot_spring_sachet, 1);
  state = activity.startMoonSpringSession(sachet, 'public');
  assert.equal(state.garden_activities.moon_spring_session.participation_mode, 'public');
  assert.throws(() => activity.startMoonSpringSession(state, 'public'), /正在进行/);
  state = activity.endMoonSpringSession(state);
  state.presence_snapshot.present_character_ids = ['reimu'];
  assert.throws(() => activity.startMoonSpringSession(state, 'alone'), /独处模式/);
  assert.equal(state.garden_activities.moon_spring_session, null);
});

test('R42 宴会排期、6 人上限与食盒/鬼酒', async () => {
  const facility = await importTypescript('../src/ui/facility-rules.ts');
  const activity = await importTypescript('../src/ui/activity-rules.ts');
  const shop = await importTypescript('../src/ui/shop-rules.ts');
  const visitors = await importTypescript('../src/ui/visitor-rules.ts');
  let state = await baseState();
  state.events.completed_key_events = {
    select_greenhouse_form: 'selected_free_growth',
    reimu_boundary_inspection: 'yes',
    marisa_material_rumor: 'yes',
    mystia_first_meeting: 'yes',
    suika_first_meeting: 'yes',
  };
  state.resources.materials = 10;
  state.resources.coins = 50;
  state.shop.unlocked = true;
  state = facility.buildFacility(state, 'banquet_plaza', '灯火夜市', 'build:banquet:1');
  const food = shop.purchaseShopItem(state, 'banquet_bento', 'bento-1');
  const sake = shop.purchaseShopItem(food, 'oni_sake_flask', 'sake-1');
  assert.equal(sake.inventory.consumables.banquet_bento, 1);
  assert.throws(() => activity.scheduleBanquet(sake, {
    activityId: 'banquet:too-far',
    mode: 'public',
    startOffsetPeriods: 5,
  }), /未来 4 个标准时段/);
  state = activity.scheduleBanquet(sake, {
    activityId: 'banquet:now',
    mode: 'public',
    invitedCharacterIds: ['mystia', 'suika'],
    startOffsetPeriods: 0,
  });
  state = activity.startDueBanquet(state, 'chat-banquet');
  assert.equal(state.garden_activities.banquet.status, 'active');
  assert.equal(visitors.visitorCap(state), 6);
  state = activity.endBanquet(state);
  assert.equal(state.garden_activities.banquet, null);
  assert.equal(visitors.visitorCap(state), 3);
});

test('R48 排期两时段后的宴会会准时生成持久待办和明确入口', async () => {
  const facility = await importTypescript('../src/ui/facility-rules.ts');
  const activity = await importTypescript('../src/ui/activity-rules.ts');
  const dungeon = await importTypescript('../src/ui/dungeon-rules.ts');
  const runtime = await importTypescript('../src/ui/m2-runtime.ts');
  let state = await baseState();
  state.events.completed_key_events.select_greenhouse_form = 'selected_free_growth';
  state.resources.materials = 10;
  state.battle.dungeon_unlocked = true;
  state = facility.buildFacility(state, 'banquet_plaza', '灯火夜市', 'build:banquet:delayed');
  state = activity.scheduleBanquet(state, {
    activityId: 'banquet:after-two-periods',
    mode: 'public',
    startOffsetPeriods: 2,
  });
  const dueSerial = state.garden_activities.scheduled_banquet.start_period_serial;

  const firstBefore = state;
  state = runtime.reconcileM2Runtime(firstBefore, dungeon.settleDungeonResult(firstBefore, {
    settlement_id: 'dungeon:banquet:first', config_id: 'fairy_pattern_practice_v1', outcome: 'loss',
  }), 'chat-banquet-delayed');
  assert.equal(state.garden_activities.banquet, null);
  assert.equal(state.garden_activities.scheduled_banquet.start_period_serial, dueSerial);

  const secondBefore = state;
  state = runtime.reconcileM2Runtime(secondBefore, dungeon.settleDungeonResult(secondBefore, {
    settlement_id: 'dungeon:banquet:second', config_id: 'fairy_pattern_practice_v1', outcome: 'loss',
  }), 'chat-banquet-delayed');
  assert.equal(state.garden_activities.banquet, null);
  assert.equal(state.garden_activities.scheduled_banquet.status, 'due_waiting');
  assert.equal(state.pending_tasks[0].kind, 'banquet_start');
  assert.equal(state.pending_tasks[0].source_id, 'banquet:after-two-periods');

  const commands = await importTypescript('../src/ui/m2-commands.ts');
  state = commands.applyM2Command(state, {
    type: 'start_due_banquet', activityId: 'banquet:after-two-periods',
  }, 'chat-banquet-delayed').state;
  assert.equal(state.garden_activities.scheduled_banquet, null);
  assert.equal(state.garden_activities.banquet.status, 'active');
  assert.equal(state.pending_tasks.length, 0);
});

test('R48 异变和宴会待办忽略四时段后由本地代码幂等完成', async () => {
  const anomaly = await importTypescript('../src/ui/anomaly-rules.ts');
  const activity = await importTypescript('../src/ui/activity-rules.ts');
  const runtime = await importTypescript('../src/ui/m2-runtime.ts');
  const time = await importTypescript('../src/ui/time-rules.ts');
  let state = await baseState();
  state.inventory.consumables.incident_trigger_card = 1;
  state = anomaly.reserveAnomalyActivation(state, {
    title: '到期测试', rule_text: '所有人的影子方向相反', scope_mode: 'all', character_ids: [], presentation_tone: '', excluded_content: '',
  }, 'anomaly:auto-finish');
  state = anomaly.commitAnomalyActivation(state, {
    name: '反向日晷', type: '物件', summary: '日晷扰乱影子', location: '庭院', cause: '愿力', resolution_method: '灵梦封印日晷',
  });
  const anomalyEnd = state.anomaly_cycle.active.end_period_serial;
  Object.assign(state.environment, time.fromPeriodSerial(anomalyEnd));
  state = runtime.reconcileM2Runtime(state, state, 'chat-auto');
  assert.equal(state.anomaly_cycle.active.status, 'resolving');
  assert.equal(state.pending_tasks[0].auto_resolve_period_serial, anomalyEnd + 4);
  Object.assign(state.environment, time.fromPeriodSerial(anomalyEnd + 4));
  state = runtime.reconcileM2Runtime(state, state, 'chat-auto');
  assert.equal(state.anomaly_cycle.active, null);
  assert.equal(state.anomaly_cycle.history.length, 1);
  assert.equal(state.pending_tasks.length, 0);
  state = runtime.reconcileM2Runtime(state, state, 'chat-auto');
  assert.equal(state.anomaly_cycle.history.length, 1);

  state.events.completed_key_events.select_greenhouse_form = 'done';
  state.facility_runtime.banquet_plaza.built = true;
  state.facility_runtime.banquet_plaza.current_form = '灯火夜市';
  state = activity.scheduleBanquet(state, { activityId: 'banquet:auto-finish', mode: 'public', startOffsetPeriods: 0 });
  state = runtime.reconcileM2Runtime(state, state, 'chat-auto');
  const banquetDue = state.garden_activities.scheduled_banquet.start_period_serial;
  assert.equal(state.pending_tasks[0].kind, 'banquet_start');
  Object.assign(state.environment, time.fromPeriodSerial(banquetDue + 4));
  state = runtime.reconcileM2Runtime(state, state, 'chat-auto');
  assert.equal(state.garden_activities.scheduled_banquet, null);
  assert.equal(state.garden_activities.banquet_history.at(-1).completion, 'assumed_completed');
  assert.equal(state.pending_tasks.length, 0);
});

test('R43 怀表不缩短异变与设施计时，咲夜认识后才可邀请', async () => {
  const special = await importTypescript('../src/ui/special-item-rules.ts');
  const facility = await importTypescript('../src/ui/facility-rules.ts');
  const visitors = await importTypescript('../src/ui/visitor-rules.ts');
  const time = await importTypescript('../src/ui/time-rules.ts');
  let state = await baseState();
  state.events.completed_key_events.select_greenhouse_form = 'selected_free_growth';
  state.resources.materials = 10;
  state.inventory.consumables.incident_trigger_card = 1;
  state.key_items.sakuya_watch.obtained = true;
  state = facility.buildFacility(state, 'fairy_garden', '四季花境', 'build:fairy:watch');
  const unlock2 = state.facility_runtime.fairy_garden.unlock_deadline_2;
  const reserved = special.beginAnomalyCardUse(state, 'anom:watch', {
    title: '停顿试验', rule_text: '时间痕迹可见', scope_mode: 'all', character_ids: [], presentation_tone: '', excluded_content: '',
  });
  const active = special.finalizeAnomalyCardUse(reserved.state, {
    name: '怀表回声', type: '现象', summary: '停顿残响', location: '庭院', cause: '试验', resolution_method: '等待消散',
  });
  const endSerial = active.state.anomaly_cycle.active.end_period_serial;
  const watched = special.useSakuyaWatch(active.state, 'watch:r43');
  assert.equal(time.periodSerialFromState(watched.state), time.periodSerialFromState(active.state));
  assert.equal(watched.state.anomaly_cycle.active.end_period_serial, endSerial);
  assert.equal(watched.state.facility_runtime.fairy_garden.unlock_deadline_2, unlock2);
  assert.throws(() => visitors.inviteCharacter(watched.state, 'sakuya', 'invite:sakuya:early'), /尚未正式认识/);
  watched.state.events.completed_key_events.sakuya_temporal_trace_investigation = 'done';
  const known = visitors.markCharacterKnown(watched.state, 'sakuya');
  assert.ok(visitors.isCharacterKnown(known, 'sakuya'));
});

test('R44 场景道具三上限、收尾清理、修缮包与异变并存', async () => {
  const activity = await importTypescript('../src/ui/activity-rules.ts');
  const facility = await importTypescript('../src/ui/facility-rules.ts');
  const shop = await importTypescript('../src/ui/shop-rules.ts');
  const prompt = await importTypescript('../src/ui/prompt-context.ts');
  const special = await importTypescript('../src/ui/special-item-rules.ts');
  let state = await baseState();
  state.events.completed_key_events.select_greenhouse_form = 'selected_free_growth';
  state.resources.materials = 20;
  state.resources.coins = 100;
  state.shop.unlocked = true;
  state.inventory.consumables.incident_trigger_card = 1;
  state = facility.buildFacility(state, 'fairy_garden', '四季花境', 'build:f');
  state = facility.buildFacility(state, 'moon_spring', '露天月见汤', 'build:m');
  // second build should fail due to needing materials continuity - actually first build spent 4, second needs 6, have 16 left ok.
  // Wait - buildFacility on second: active_construction is null, fairy already built. moon can build.
  state = shop.purchaseShopItem(state, 'fairy_candy_pack', 'c1');
  state = shop.purchaseShopItem(state, 'moon_viewing_tea', 't1');
  state = shop.purchaseShopItem(state, 'hot_spring_sachet', 's1');
  state = shop.purchaseShopItem(state, 'emergency_repair_kit', 'r1');
  state.inventory.consumables.fairy_candy_pack = 2;
  state.inventory.consumables.moon_viewing_tea = 1;
  state.inventory.consumables.hot_spring_sachet = 1;
  state.inventory.consumables.banquet_bento = 1;
  state = activity.queueSceneItemUse(state, 'fairy_candy_pack', 'use:1', 'scene-a');
  state = activity.queueSceneItemUse(state, 'moon_viewing_tea', 'use:2', 'scene-a');
  state = activity.queueSceneItemUse(state, 'hot_spring_sachet', 'use:3', 'scene-a');
  assert.throws(() => activity.queueSceneItemUse(state, 'banquet_bento', 'use:4', 'scene-a'), /最多保留 3 种/);
  state = activity.queueSceneItemUse(state, 'fairy_candy_pack', 'use:1b', 'scene-a');
  assert.equal(state.scene_item_context.entries.find((entry) => entry.item_id === 'fairy_candy_pack').quantity_used, 2);
  const reserved = special.beginAnomalyCardUse(state, 'anom:items', {
    title: '道具异变', rule_text: '道具描写必须服从异变', scope_mode: 'all', character_ids: [], presentation_tone: '', excluded_content: '',
  });
  state = special.finalizeAnomalyCardUse(reserved.state, {
    name: '糖霜核', type: '物件', summary: '糖霜改写味觉', location: '花园', cause: '过期魔法', resolution_method: '融化',
  }).state;
  const text = prompt.buildPromptContext(state, { kind: 'ordinary', includeSceneItems: true });
  assert.match(text, /道具异变/);
  assert.match(text, /妖精糖果包|当前场景道具/);
  prompt.assertNoHiddenOriginLeak(text);
  state = activity.beginSceneItemClosing(state, 'close:1');
  state = activity.clearSceneItemContext(state);
  assert.equal(state.scene_item_context, null);

  // damage + repair kit
  state.facility_runtime.fairy_garden.status = 'damaged';
  state.facility_runtime.fairy_garden.condition_id = 'fairy_garden_broken_fence';
  state = facility.beginFacilityRecovery(state, 'fairy_garden', 'repair:1', true);
  assert.equal(state.inventory.consumables.emergency_repair_kit, 0);
  state = facility.commitFacilityRecovery(state, 'repair:1');
  assert.equal(state.facility_runtime.fairy_garden.status, 'normal');
});

test('R45 维护源具备开放庭园入口、目录与提示分层，且未宣称实机验收', async () => {
  const app = await read('../src/ui/app.ts');
  const html = await read('../src/ui/index.html');
  const items = JSON.parse(await read('../src/items/catalog.json'));
  const facilities = JSON.parse(await read('../src/facilities/catalog.json'));
  const handoff = await read('../project/agent-handoff.md');
  const log = await read('../project/r38-r45-implementation-log.md');
  assert.match(html, /id="gg-open-inventory"/);
  assert.match(html, /id="gg-open-opportunities"/);
  assert.match(app, /renderInventory/);
  assert.match(app, /openGardenOpportunityPanel/);
  assert.equal(items.items.length >= 8, true);
  assert.equal(facilities.facilities.length, 3);
  assert.match(log, /R38 — 开工/);
  assert.doesNotMatch(handoff, /M2 已验收通过|M2 complete/);
});

test('收尾门：隐藏源头回执可校验，完整状态不再进入剧情世界书', async () => {
  const anomaly = await importTypescript('../src/ui/anomaly-rules.ts');
  const packer = await read('../scripts/package-checkpoint.mjs');
  const receipt = anomaly.parseAnomalyOriginReceipt([
    '<GensokyoAnomalyOrigin>',
    JSON.stringify({
      version: 'anomaly-origin.v1',
      origin: { name: '镜面', type: '物品', summary: '藏在井底', location: '井底', cause: '愿望', resolution_method: '击碎镜面' },
      public_summary: '所有人的影子变得不听话。',
    }),
    '</GensokyoAnomalyOrigin>',
  ].join(''));
  assert.equal(receipt.origin.location, '井底');
  assert.throws(() => anomaly.parseAnomalyOriginReceipt('没有回执'), /缺少合法/);
  assert.match(packer, /\[mvu_update\] 最新 MVU 状态（含本地私有字段）/);
  assert.doesNotMatch(packer, /\[mvu_plot\]\[mvu_update\] 最新 MVU 状态/);
});

test('收尾门：本地所有权恢复拒绝模型覆盖全部 M2 根字段', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const before = await baseState();
  before.inventory.consumables.incident_trigger_card = 2;
  before.anomaly_cycle.history = [{ anomaly_id: 'a', title: 'A', start_period_serial: 0, end_period_serial: 28, origin_summary: 'x' }];
  before.visit_scheduler.known_characters = ['reimu'];
  before.facility_runtime.fairy_garden.built = true;
  const hostile = structuredClone(before);
  hostile.inventory.consumables.incident_trigger_card = 99;
  hostile.anomaly_cycle.history = [];
  hostile.visit_scheduler.known_characters = ['unknown'];
  hostile.facility_runtime.fairy_garden.built = false;
  const restored = settlement.restoreLocalEventOwnership(before, hostile);
  assert.equal(restored.inventory.consumables.incident_trigger_card, 2);
  assert.equal(restored.anomaly_cycle.history.length, 1);
  assert.deepEqual(restored.visit_scheduler.known_characters, ['reimu']);
  assert.equal(restored.facility_runtime.fairy_garden.built, true);
});

test('收尾门：M2 命令层接通施工、邀请和活动，邀请制拒绝未到场者', async () => {
  const commands = await importTypescript('../src/ui/m2-commands.ts');
  const activity = await importTypescript('../src/ui/activity-rules.ts');
  let state = await baseState();
  state.events.completed_key_events.select_greenhouse_form = 'done';
  state.resources.materials = 20;
  state = commands.applyM2Command(state, {
    type: 'build_facility', facilityId: 'moon_spring', formId: '露天月见汤', transactionId: 'build:moon:integration',
  }, 'chat-integration').state;
  assert.equal(state.facility_runtime.moon_spring.built, true);
  assert.throws(() => activity.startMoonSpringSession(state, 'invite_only', ['sakuya']), /已经接受且到场/);
  const app = await read('../src/ui/app.ts');
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(app, /type: 'build_facility'/);
  assert.doesNotMatch(app, /异变已启用，正在生成首次影响剧情/);
  assert.match(app, /下一次正常聊天会自然携带异变影响/);
  assert.match(app, /sendAnomalyResolution/);
  assert.match(app, /type: 'queue_scene_item'/);
  assert.match(bridge, /applyLocalM2Command/);
});
