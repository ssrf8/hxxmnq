// GAL 角色入场记忆（character-visit-memory.v1）行为测试。
// 覆盖第一批数据地基：schema 结构、确定性迁移、容量裁剪、未知字段保留、
// presence→visit 生命周期协调器、全部生产写点接线与防双调用。
// 纯 Node 测试（esbuild bundle 导入 TS）；不做实机探针。
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

// ===== fixtures =====

const FIXED_CHARACTERS = ['reimu', 'marisa', 'cirno', 'alice', 'mystia', 'suika', 'nitori', 'sakuya'];

const emptyCharacterMemory = (characterId) => ({
  character_id: characterId,
  active_visit: null,
  closed_visits: [],
  legacy_memories: [],
  relationship_memories: [],
});

const visitMemoryFixture = (over = {}) => ({
  version: 'character-visit-memory.v1',
  by_character: Object.fromEntries(FIXED_CHARACTERS.map((id) => [id, emptyCharacterMemory(id)])),
  legacy_unassigned: [],
  migration: {
    revision: '',
    conversation_log_fingerprint: null,
    relationship_facts_fingerprint: null,
    migrated_at_serial: null,
  },
  ...over,
});

const makeTurn = (n, over = {}) => ({
  turn_id: `t:${n}`,
  request_id: `req:${n}`,
  character_id: 'reimu',
  scene_id: null,
  assistant_message_id: null,
  assistant_swipe_id: null,
  latest_attempt_id: null,
  latest_commit_key: null,
  day: null,
  time_period: null,
  period_serial: null,
  summary: `s${n}`,
  ...over,
});

const makeVisit = (visitId, turns) => ({
  visit_id: visitId,
  character_id: 'reimu',
  source: 'scheduler',
  arrival_uid: null,
  started_day: null,
  started_time_period: null,
  started_period_serial: null,
  ended_day: null,
  ended_time_period: null,
  ended_period_serial: null,
  end_reason: 'scheduled-departure',
  turns,
});

const baseState = (over = {}) => ({
  characters: { reimu: { id: 'reimu' }, marisa: { id: 'marisa' }, cirno: { id: 'cirno' } },
  presence_snapshot: { present_character_ids: [], character_views: {}, visitor_meta: {} },
  environment: { day: 2, time_period: '白昼' },
  uid_counters: { character_visit: 1 },
  interaction: { visit_memory: visitMemoryFixture() },
  ...over,
});

// ===== B1-T10：schema 结构 =====

test('schema：visit_memory 位于 interaction、结构上限与业务上限分离', async () => {
  const schema = await read('../src/schema/02-mvu-schema.js');
  // 结构上限：Zod list 上限（每个 closed ≤16、closed ≤4、legacy ≤16、unassigned ≤24、relationship ≤12）
  assert.match(schema, /turns: list\(visitTurnSchema, 16\)/);
  assert.match(schema, /closed_visits: list\(visitRecordSchema, 4\)/);
  assert.match(schema, /legacy_memories: list\(legacyMemorySchema, 16\)/);
  assert.match(schema, /relationship_memories: list\(relationshipMemorySchema, 12\)/);
  assert.match(schema, /legacy_unassigned: list\(legacyMemorySchema, 24\)/);
  assert.match(schema, /visit_memory: visitMemoryStateSchema/);
  assert.match(schema, /character_visit: integer\(1, 1, 999999\)/);
  assert.match(schema, /characterMemorySchema[\s\S]*?\.catch\(\{[\s\S]*?relationship_memories: \[\],[\s\S]*?\}\);/);
  const nullableDaySource = schema.match(/const nullableDay[\s\S]*?const nullableSerial/)?.[0] ?? '';
  assert.match(nullableDaySource, /z\.number\(\)\.int\(\)/);
  assert.match(nullableDaySource, /z\.string\(\)/);
  assert.doesNotMatch(nullableDaySource, /integer\(/);
  // 业务上限 48 必须由 normalizer 执行而非 Zod 单个 list（字段台账注释）
  const ledger = await read('../src/schema/field-ledger.md');
  assert.match(ledger, /STORY_SUMMARIES_PER_CHARACTER\s*\|\s*48/);
  assert.match(ledger, /RELATIONSHIP_MEMORIES_PER_CHARACTER\s*\|\s*12/);
});

test('initial-state：8 个固定角色独立空结构、counter≥1、旧字段保留', async () => {
  const initial = JSON.parse(await read('../src/schema/initial-state.json'));
  assert.equal(initial.interaction.visit_memory.version, 'character-visit-memory.v1');
  const byCharacter = initial.interaction.visit_memory.by_character;
  assert.deepEqual(Object.keys(byCharacter).sort(), [...FIXED_CHARACTERS].sort());
  for (const id of FIXED_CHARACTERS) {
    assert.equal(byCharacter[id].character_id, id);
    assert.equal(byCharacter[id].active_visit, null);
    assert.deepEqual(byCharacter[id].closed_visits, []);
    assert.deepEqual(byCharacter[id].legacy_memories, []);
    assert.deepEqual(byCharacter[id].relationship_memories, []);
  }
  assert.equal(initial.uid_counters.character_visit, 1);
  // 旧字段原样保留
  assert.ok('conversation_log' in initial.interaction);
  assert.ok(FIXED_CHARACTERS.every((id) => 'current_relationship_facts' in initial.characters[id]));
});

// ===== B1-T10：normalize 与未知字段保留 =====

test('normalize：VisitTurn 裁掉多余字段，其他层未知字段保留，malformed 单角色不清空其他角色', async () => {
  const cm = await importTypescript('../src/ui/character-memory.ts');
  const input = visitMemoryFixture({
    by_character: {
      reimu: {
        ...emptyCharacterMemory('reimu'),
        unknownTop: 'keep-me',
        active_visit: {
          visit_id: 'character_visit_000001',
          character_id: 'reimu',
          source: 'model-presence',
          arrival_uid: 'uid-1',
          started_day: 2,
          started_time_period: '白昼',
          started_period_serial: 5,
          ended_day: null,
          ended_time_period: null,
          ended_period_serial: null,
          end_reason: null,
          turns: [makeTurn('a', { custom: 42 })],
        },
        closed_visits: [],
        legacy_memories: [],
        relationship_memories: [],
      },
      marisa: { ...emptyCharacterMemory('marisa'), unknownChar: 'keep' },
    },
    customRoot: 'keep-root',
  });
  const normalized = cm.normalizeVisitMemoryState(input);
  assert.equal(normalized.version, 'character-visit-memory.v1');
  assert.equal(normalized.customRoot, 'keep-root');
  assert.equal(normalized.by_character.reimu.unknownTop, 'keep-me');
  assert.equal(normalized.by_character.marisa.unknownChar, 'keep');
  assert.equal('custom' in normalized.by_character.reimu.active_visit.turns[0], false);
  assert.equal(normalized.by_character.reimu.active_visit.turns[0].turn_id, 't:a');

  // malformed 单角色不清空其他角色
  const malformed = visitMemoryFixture({
    by_character: {
      reimu: 'not-an-object',
      marisa: { ...emptyCharacterMemory('marisa'), relationship_memories: [{ relationship_memory_id: 'ok', character_id: 'marisa', request_id: '', visit_id: null, day: null, time_period: null, period_serial: null, kind: 'milestone', relationship_label: null, event_kind: null, summary: 'x', significance: 2, active: true, latest_attempt_id: null, latest_commit_key: null }] },
    },
  });
  const safe = cm.normalizeVisitMemoryState(malformed);
  assert.deepEqual(safe.by_character.reimu, emptyCharacterMemory('reimu'));
  assert.equal(safe.by_character.marisa.relationship_memories.length, 1);
  // 无稳定 ID 的 malformed 项被拒绝而非编造随机 ID
  const rejected = cm.normalizeVisitMemoryState(visitMemoryFixture({
    by_character: { reimu: { ...emptyCharacterMemory('reimu'), active_visit: { visit_id: '', turns: [{ turn_id: '', summary: 'x' }] } } },
  }));
  assert.equal(rejected.by_character.reimu.active_visit, null);
});

test('migration：malformed 单角色先归一化，不崩溃也不清空其他角色', async () => {
  const migrations = await importTypescript('../src/ui/state-migrations.ts');
  const state = baseState({
    interaction: {
      conversation_log: [],
      visit_memory: visitMemoryFixture({
        by_character: {
          reimu: { ...emptyCharacterMemory('reimu'), closed_visits: 'broken-list' },
          marisa: { ...emptyCharacterMemory('marisa'), unknownChar: 'keep' },
        },
      }),
    },
  });
  const migrated = migrations.migrateGardenState(state);
  assert.deepEqual(migrated.interaction.visit_memory.by_character.reimu.closed_visits, []);
  assert.equal(migrated.interaction.visit_memory.by_character.marisa.unknownChar, 'keep');
});

test('normalize：关系摘要上限 160，VisitTurn 摘要上限 100', async () => {
  const cm = await importTypescript('../src/ui/character-memory.ts');
  const long = 'x'.repeat(300);
  const rel = cm.normalizeRelationshipMemory({
    relationship_memory_id: 'legacy_relation:reimu:f',
    character_id: 'reimu',
    summary: long,
    kind: 'milestone',
    significance: 2,
    active: true,
  });
  assert.equal(rel.summary.length, 160);
  const turn = cm.normalizeVisitTurn({ turn_id: 'a', character_id: 'reimu', summary: long });
  assert.equal(turn.summary.length, 100);
});

// ===== B1-T10：conversation_log 迁移 =====

test('migration：conversation_log 增量导入、幂等、删除源后不重复、容量 16/24', async () => {
  const { migrateConversationLogToLegacyMemory } = await importTypescript('../src/ui/character-memory.ts');
  const base = baseState({
    interaction: {
      conversation_log: ['reimu: 聊了妖花核心', 'marisa：研究过旧蓝图', '未知角色: 进 unassigned', '无前缀也进 unassigned', '   ', 'reimu: 聊了妖花核心'],
    },
  });
  const first = migrateConversationLogToLegacyMemory(base);
  const vm = first.interaction.visit_memory;
  assert.equal(vm.by_character.reimu.legacy_memories.length, 1);
  assert.equal(vm.by_character.marisa.legacy_memories.length, 1);
  assert.equal(vm.legacy_unassigned.length, 2);
  assert.equal(vm.by_character.reimu.legacy_memories[0].source, 'conversation_log.v0');
  assert.equal(vm.migration.revision, 'conversation-log.v1');
  // 源保留（本函数只读源，不删不改不归一化——归一化在 migrateGardenState）
  assert.deepEqual(first.interaction.conversation_log, base.interaction.conversation_log);

  // 幂等：二次 deepEqual（fingerprint 稳定、无重复追加）
  const second = migrateConversationLogToLegacyMemory(first);
  assert.deepEqual(second.interaction.visit_memory, first.interaction.visit_memory);

  // 增量：新增一条只导入新项
  const added = migrateConversationLogToLegacyMemory({
    ...first,
    interaction: { ...first.interaction, conversation_log: [...first.interaction.conversation_log, 'reimu: 新的一天'] },
  });
  assert.equal(added.interaction.visit_memory.by_character.reimu.legacy_memories.length, 2);

  // 删除源后不重复导入（legacy 保留，源回补不重复）
  const removed = migrateConversationLogToLegacyMemory({
    ...first,
    interaction: { ...first.interaction, conversation_log: ['marisa：研究过旧蓝图'] },
  });
  assert.equal(removed.interaction.visit_memory.by_character.reimu.legacy_memories.length, 1);
  assert.equal(removed.interaction.visit_memory.by_character.marisa.legacy_memories.length, 1);

  // 容量：17 条同角色 → 16
  const many = migrateConversationLogToLegacyMemory(baseState({
    interaction: { conversation_log: Array.from({ length: 17 }, (_, i) => `reimu: 事件 ${i}`) },
  }));
  assert.equal(many.interaction.visit_memory.by_character.reimu.legacy_memories.length, 16);

  // unassigned 容量 24
  const manyUn = migrateConversationLogToLegacyMemory(baseState({
    interaction: { conversation_log: Array.from({ length: 30 }, (_, i) => `无前缀 ${i}`) },
  }));
  assert.equal(manyUn.interaction.visit_memory.legacy_unassigned.length, 24);
});

test('migration：稳定 ID 去重覆盖 hash 碰撞路径（同 stable ID 不重复追加）', async () => {
  const { migrateConversationLogToLegacyMemory } = await importTypescript('../src/ui/character-memory.ts');
  // 相同文本必然相同 stable ID；不同文本若发生 32-bit hash 碰撞也走同一去重路径。
  const base = baseState({ interaction: { conversation_log: ['reimu: 重复文本', 'reimu: 重复文本'] } });
  const result = migrateConversationLogToLegacyMemory(base);
  assert.equal(result.interaction.visit_memory.by_character.reimu.legacy_memories.length, 1);
  // turn 去重（同 turn_id 保留后出现/更新版本）
  const cm = await importTypescript('../src/ui/character-memory.ts');
  const memory = {
    character_id: 'reimu',
    active_visit: makeVisit('v1', [makeTurn('dup', { summary: 'OLD' }), makeTurn('dup', { summary: 'UPDATED' }), makeTurn('x')]),
    closed_visits: [],
    legacy_memories: [],
    relationship_memories: [],
  };
  const trimmed = cm.trimStoryMemoriesTo48(memory);
  assert.equal(trimmed.active_visit.turns.length, 2);
  assert.equal(trimmed.active_visit.turns.find((t) => t.turn_id === 't:dup').summary, 'UPDATED');
});

test('migration：字符串 conversation_log 兜底 + 无 interaction 旧状态建立合法根', async () => {
  const { migrateConversationLogToLegacyMemory } = await importTypescript('../src/ui/character-memory.ts');
  const str = migrateConversationLogToLegacyMemory(baseState({
    characters: { reimu: {} },
    interaction: { conversation_log: 'reimu: 字符串兜底' },
  }));
  assert.equal(str.interaction.visit_memory.by_character.reimu.legacy_memories.length, 1);
  const bare = migrateConversationLogToLegacyMemory({});
  assert.equal(bare.interaction.visit_memory.version, 'character-visit-memory.v1');
  assert.deepEqual(bare.interaction.visit_memory.by_character, {});
});

// ===== B1-T10：relationship 迁移 =====

test('migration：relationship 白名单、内容级一致性、12 条容量、旧字段保留', async () => {
  const { migrateRelationshipFactsToMemory } = await importTypescript('../src/ui/character-memory.ts');
  const base = baseState({
    characters: {
      alice: {
        id: 'alice',
        current_relationship_facts: [
          { id: 'alice_maintenance_boundary', subjects: ['player', 'alice'], fact: '你尊重爱丽丝提出的维护边界与人偶分工。', established_at: 'day-3', active: true, last_confirmed_at: 'day-3' },
          { id: 'alice_kind_gesture', subjects: ['player', 'alice'], fact: '魔理沙替爱丽丝整理了一下围裙。', active: true, last_confirmed_at: 'day-4' },
        ],
      },
      marisa: { id: 'marisa', current_relationship_facts: [{ id: 'marisa_free_growth_plan', fact: '约定一起照顾温室。', active: true }] },
    },
  });
  const result = migrateRelationshipFactsToMemory(base);
  const aliceMemories = result.interaction.visit_memory.by_character.alice.relationship_memories;
  assert.equal(aliceMemories.length, 2);
  const boundary = aliceMemories.find((m) => m.relationship_memory_id === 'legacy_relation:alice:alice_maintenance_boundary');
  assert.equal(boundary.kind, 'boundary');
  assert.equal(boundary.character_id, 'alice');
  assert.equal(boundary.request_id, '');
  assert.equal(boundary.visit_id, null);
  assert.equal(boundary.relationship_label, null); // 无受控可证明表达
  assert.equal(boundary.event_kind, null);
  assert.equal(boundary.summary, '你尊重爱丽丝提出的维护边界与人偶分工。');
  assert.equal(boundary.active, true);
  const gesture = aliceMemories.find((m) => m.relationship_memory_id.endsWith(':alice_kind_gesture'));
  assert.equal(gesture.kind, 'milestone');
  assert.equal(result.interaction.visit_memory.by_character.marisa.relationship_memories[0].kind, 'milestone');
  // 旧字段保留
  assert.equal(result.characters.alice.current_relationship_facts.length, 2);
  assert.deepEqual(result.characters.alice.current_relationship_facts[0].subjects, ['player', 'alice']);
  assert.equal(result.interaction.visit_memory.migration.revision, 'relationship-facts.v1');

  // 内容级一致性：active/fact 变化即使 ID 见过也必须更新
  const changed = migrateRelationshipFactsToMemory(baseState({
    characters: {
      alice: { id: 'alice', current_relationship_facts: [{ id: 'alice_maintenance_boundary', fact: '边界已解除。', active: false, last_confirmed_at: 'day-9' }] },
    },
  }));
  const updated = changed.interaction.visit_memory.by_character.alice.relationship_memories.find((m) => m.relationship_memory_id === 'legacy_relation:alice:alice_maintenance_boundary');
  assert.equal(updated.active, false);
  assert.equal(updated.summary, '边界已解除。');

  // 幂等
  const again = migrateRelationshipFactsToMemory(result);
  assert.deepEqual(again.interaction.visit_memory.by_character.alice.relationship_memories, result.interaction.visit_memory.by_character.alice.relationship_memories);

  // 12 条容量
  const many = migrateRelationshipFactsToMemory(baseState({
    characters: {
      alice: { id: 'alice', current_relationship_facts: Array.from({ length: 15 }, (_, i) => ({ id: `fact_${i}`, fact: `事实 ${i}`, active: true })) },
    },
  }));
  assert.equal(many.interaction.visit_memory.by_character.alice.relationship_memories.length, 12);
});

// ===== B1-T10：容量 48/12 边界与固定角色独立 =====

test('容量：48 是每角色而非全局；reimu 写满不挤 marisa；closed ≤4；合计 ≤48', async () => {
  const cm = await importTypescript('../src/ui/character-memory.ts');
  const turn = (n) => makeTurn(n);
  const visit = (id, turns) => makeVisit(id, turns);
  // reimu：4 closed × 16 + active 16 = 80 → 48（active 优先，最新 closed 填充）
  const reimu = {
    character_id: 'reimu',
    active_visit: visit('v-active', Array.from({ length: 16 }, (_, i) => turn(`a${i}`))),
    closed_visits: [0, 1, 2, 3].map((k) => visit(`v-c${k}`, Array.from({ length: 16 }, (_, i) => turn(`c${k}-${i}`)))),
    legacy_memories: [],
    relationship_memories: [],
  };
  // marisa 独立额度：写满但绝不与 reimu 共享
  const marisa = {
    character_id: 'marisa',
    active_visit: visit('v-m-active', Array.from({ length: 16 }, (_, i) => turn(`m${i}`))),
    closed_visits: [0, 1, 2, 3].map((k) => visit(`v-m-c${k}`, Array.from({ length: 16 }, (_, i) => turn(`mc${k}-${i}`)))),
    legacy_memories: [],
    relationship_memories: [],
  };
  const trimmedReimu = cm.trimStoryMemoriesTo48(reimu);
  const trimmedMarisa = cm.trimStoryMemoriesTo48(marisa);
  const count = (m) => (m.active_visit?.turns.length ?? 0) + m.closed_visits.reduce((n, v) => n + v.turns.length, 0);
  assert.equal(count(trimmedReimu), 48);
  assert.equal(count(trimmedMarisa), 48); // 每角色独立，reimu 满额不挤 marisa
  assert.equal(trimmedReimu.closed_visits.length, 4);
  assert.ok(trimmedReimu.closed_visits[0].turns.length === 0); // 最旧 closed 清空但保留 visit 边界
  assert.equal(trimmedReimu.closed_visits[0].visit_id, 'v-c0');
  assert.equal(trimmedReimu.active_visit.turns.length, 16);

  // 12 条 relationship：多条 active state 只留 serial 最大，其余标 inactive 不删除
  const rel = (id, kind, over = {}) => ({ relationship_memory_id: id, character_id: 'reimu', request_id: '', visit_id: null, day: null, time_period: null, period_serial: over.serial ?? null, kind, relationship_label: null, event_kind: null, summary: id, significance: over.sig ?? 2, active: over.active ?? true, latest_attempt_id: null, latest_commit_key: null });
  const relMemory = {
    ...reimu,
    relationship_memories: [
      rel('st-a', 'relationship_state', { serial: 5 }),
      rel('st-b', 'relationship_state', { serial: 9 }),
      rel('st-c', 'relationship_state', { serial: 5 }),
      ...Array.from({ length: 10 }, (_, i) => rel(`m${i}`, 'milestone')),
    ],
  };
  const trimmedRel = cm.trimRelationshipMemoriesTo12(relMemory);
  assert.equal(trimmedRel.relationship_memories.length, 12);
  const activeStates = trimmedRel.relationship_memories.filter((m) => m.kind === 'relationship_state' && m.active);
  assert.deepEqual(activeStates.map((m) => m.relationship_memory_id), ['st-b']);
  assert.equal(trimmedRel.relationship_memories.filter((m) => m.kind === 'relationship_state' && !m.active).length, 2);
});

// ===== B1-T10：counter 与确定性 =====

test('counter：character_visit 初始 ≥1、左补零单调、非法值安全归一', async () => {
  const cm = await importTypescript('../src/ui/character-memory.ts');
  assert.equal(cm.nextCharacterVisitId({ character_visit: 1 }).visitId, 'character_visit_000001');
  assert.equal(cm.nextCharacterVisitId({ character_visit: 2 }).visitId, 'character_visit_000002');
  assert.equal(cm.nextCharacterVisitId(undefined).visitId, 'character_visit_000001');
  assert.equal(cm.nextCharacterVisitId({ character_visit: -5 }).visitId, 'character_visit_000001');
  // 确定性 hash：同输入同输出
  assert.equal(cm.deterministicStringHash('reimu: 测试'), cm.deterministicStringHash('reimu: 测试'));
  assert.notEqual(cm.deterministicStringHash('reimu: a'), cm.deterministicStringHash('reimu: b'));
});

// ===== B1-T11：纯函数矩阵 =====

test('lifecycle 矩阵：absent→present 开、present→present 同 ID、present→absent 关、leave 再 arrive 两个 ID', async () => {
  const cm = await importTypescript('../src/ui/character-memory.ts');
  const clock = { day: 2, time_period: '白昼', period_serial: 5 };
  const reconcile = (beforeIds, afterIds, memory, counters, cause = 'scheduler') => cm.reconcileCharacterVisits({
    beforePresence: { present_character_ids: beforeIds },
    afterPresence: { present_character_ids: afterIds },
    memory,
    counters,
    clock,
    cause,
  });

  let memory = cm.normalizeVisitMemoryState(visitMemoryFixture());
  // absent→absent：no-op
  let r = reconcile([], [], memory, { character_visit: 1 });
  assert.deepEqual(r.openedVisitIds, []);
  assert.deepEqual(r.closedVisitIds, []);
  assert.equal(r.counters.character_visit, 1);
  // absent→present：open one
  r = reconcile([], ['reimu'], r.memory, r.counters);
  assert.deepEqual(r.openedVisitIds, ['character_visit_000001']);
  assert.equal(r.memory.by_character.reimu.active_visit.visit_id, 'character_visit_000001');
  assert.equal(r.memory.by_character.reimu.active_visit.source, 'scheduler');
  // present→present：same ID
  const r2 = reconcile(['reimu'], ['reimu'], r.memory, r.counters);
  assert.equal(r2.memory.by_character.reimu.active_visit.visit_id, 'character_visit_000001');
  assert.deepEqual(r2.openedVisitIds, []);
  assert.equal(r2.counters.character_visit, r.counters.character_visit);
  // present→absent：close one
  const r3 = reconcile(['reimu'], [], r2.memory, r2.counters);
  assert.equal(r3.memory.by_character.reimu.active_visit, null);
  assert.deepEqual(r3.closedVisitIds, ['character_visit_000001']);
  assert.equal(r3.memory.by_character.reimu.closed_visits[0].end_reason, 'scheduled-departure');
  // leave 再 arrive：两个不同 visit ID
  const r4 = reconcile([], ['reimu'], r3.memory, r3.counters);
  assert.equal(r4.memory.by_character.reimu.active_visit.visit_id, 'character_visit_000002');
  assert.notEqual(r4.memory.by_character.reimu.active_visit.visit_id, 'character_visit_000001');
});

test('lifecycle 矩阵：同 arrival replay 无新 ID、同 departure replay 不重复关闭', async () => {
  const cm = await importTypescript('../src/ui/character-memory.ts');
  const clock = { day: 2, time_period: '白昼', period_serial: 5 };
  const reconcile = (beforeIds, afterIds, memory, counters, cause = 'scheduler') => cm.reconcileCharacterVisits({
    beforePresence: { present_character_ids: beforeIds },
    afterPresence: { present_character_ids: afterIds },
    memory,
    counters,
    clock,
    cause,
  });
  let memory = cm.normalizeVisitMemoryState(visitMemoryFixture());
  let r = reconcile([], ['reimu', 'marisa'], memory, { character_visit: 1 });
  assert.equal(r.counters.character_visit, 3);
  // arrival replay：同差异重放 → 无新 ID、counter 不增
  const replay = reconcile([], ['reimu', 'marisa'], r.memory, r.counters);
  assert.deepEqual(replay.openedVisitIds, []);
  assert.equal(replay.counters.character_visit, 3);
  assert.equal(replay.memory.by_character.reimu.active_visit.visit_id, 'character_visit_000001');
  // departure replay：不重复关闭
  const dep = reconcile(['reimu', 'marisa'], ['marisa'], replay.memory, replay.counters);
  assert.deepEqual(dep.closedVisitIds, ['character_visit_000001']);
  assert.equal(dep.memory.by_character.reimu.closed_visits.length, 1);
  const depReplay = reconcile(['reimu', 'marisa'], ['marisa'], dep.memory, dep.counters);
  assert.deepEqual(depReplay.closedVisitIds, []);
  assert.equal(depReplay.memory.by_character.reimu.closed_visits.length, 1);
});

test('lifecycle：多角色同时 arrive/depart、一人离开一人仍在、visitor_meta arrival_uid 捕获', async () => {
  const cm = await importTypescript('../src/ui/character-memory.ts');
  const clock = { day: 2, time_period: '白昼', period_serial: 5 };
  let memory = cm.normalizeVisitMemoryState(visitMemoryFixture());
  const open = cm.reconcileCharacterVisits({
    beforePresence: { present_character_ids: [] },
    afterPresence: { present_character_ids: ['reimu', 'marisa', 'cirno'], visitor_meta: { reimu: { arrival_uid: 'uid-r' }, marisa: {}, cirno: { arrival_uid: null } } },
    memory,
    counters: { character_visit: 1 },
    clock,
    cause: 'event',
  });
  assert.deepEqual(open.openedVisitIds, ['character_visit_000001', 'character_visit_000002', 'character_visit_000003']);
  assert.equal(open.memory.by_character.reimu.active_visit.arrival_uid, 'uid-r');
  assert.equal(open.memory.by_character.reimu.active_visit.source, 'event');
  assert.equal(open.memory.by_character.marisa.active_visit.arrival_uid, null); // meta 存在但无 uid
  assert.equal(open.memory.by_character.cirno.active_visit.arrival_uid, null);
  // 一人离开一人仍在
  const partial = cm.reconcileCharacterVisits({
    beforePresence: { present_character_ids: ['reimu', 'marisa', 'cirno'], visitor_meta: { reimu: { arrival_uid: 'uid-r' }, marisa: {}, cirno: { arrival_uid: null } } },
    afterPresence: { present_character_ids: ['reimu', 'cirno'] },
    memory: open.memory,
    counters: open.counters,
    clock,
    cause: 'event',
  });
  assert.deepEqual(partial.closedVisitIds, ['character_visit_000002']);
  assert.equal(partial.memory.by_character.marisa.active_visit, null);
  assert.equal(partial.memory.by_character.reimu.active_visit.visit_id, 'character_visit_000001');
  assert.equal(partial.memory.by_character.cirno.active_visit.visit_id, 'character_visit_000003');
  // 多角色同时 depart
  const allLeave = cm.reconcileCharacterVisits({
    beforePresence: { present_character_ids: ['reimu', 'cirno'] },
    afterPresence: { present_character_ids: [] },
    memory: partial.memory,
    counters: partial.counters,
    clock,
    cause: 'scheduler',
  });
  assert.deepEqual(allLeave.closedVisitIds, ['character_visit_000001', 'character_visit_000003']);
  assert.equal(allLeave.memory.by_character.reimu.closed_visits[0].end_reason, 'scheduled-departure');
  assert.equal(allLeave.memory.by_character.cirno.closed_visits[0].end_reason, 'scheduled-departure');
});

test('lifecycle：area/view 变化不切 visit；非法 presence 回执不改变 visit', async () => {
  const cm = await importTypescripts();
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const base = baseState({
    interaction: { visit_memory: visitMemoryFixture({ by_character: { reimu: { ...emptyCharacterMemory('reimu'), active_visit: makeVisit('character_visit_000001', []) }, marisa: emptyCharacterMemory('marisa') } }) },
  });
  const after = settlement.applyPresenceUpdate(base, '<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu"],"character_views":{"reimu":{"area_id":"new_area"}}}</GensokyoPresence>');
  assert.equal(after.interaction.visit_memory.by_character.reimu.active_visit.visit_id, 'character_visit_000001');
  assert.equal(after.uid_counters.character_visit, 1);
  // 非法回执：未知区域/未知角色被过滤，不改变 visit
  const bad = settlement.applyPresenceUpdate(base, '<GensokyoPresence>{"version":"presence.v1","present_character_ids":["unknown_char","reimu"],"character_views":{"unknown_char":{"area_id":"nowhere"}}}</GensokyoPresence>');
  assert.deepEqual(bad.presence_snapshot.present_character_ids, ['reimu']);
  assert.equal(bad.interaction.visit_memory.by_character.reimu.active_visit.visit_id, 'character_visit_000001');
  assert.equal(bad.uid_counters.character_visit, 1);
});

test('counter：旧档计数器落后时跳过全部既有 visit ID', async () => {
  const cm = await importTypescript('../src/ui/character-memory.ts');
  const state = baseState({
    presence_snapshot: { present_character_ids: ['reimu'], character_views: {}, visitor_meta: {} },
    uid_counters: { character_visit: 0 },
    interaction: {
      visit_memory: visitMemoryFixture({
        by_character: {
          reimu: {
            ...emptyCharacterMemory('reimu'),
            closed_visits: [makeVisit('character_visit_000001', [])],
          },
        },
      }),
    },
  });
  const repaired = cm.repairCharacterVisitsAgainstPresence(state);
  assert.equal(repaired.interaction.visit_memory.by_character.reimu.active_visit.visit_id, 'character_visit_000002');
  assert.equal(repaired.uid_counters.character_visit, 3);
});

test('upsert：写入入口自身维持 16/48 剧情容量与 12 条关系容量', async () => {
  const cm = await importTypescript('../src/ui/character-memory.ts');
  let state = baseState({
    interaction: {
      visit_memory: visitMemoryFixture({
        by_character: {
          reimu: {
            ...emptyCharacterMemory('reimu'),
            active_visit: makeVisit('character_visit_000001', Array.from({ length: 16 }, (_, i) => makeTurn(i))),
            relationship_memories: Array.from({ length: 12 }, (_, i) => ({
              relationship_memory_id: `rel-${i}`,
              character_id: 'reimu',
              request_id: `req-${i}`,
              visit_id: null,
              day: null,
              time_period: null,
              period_serial: i,
              kind: 'milestone',
              relationship_label: null,
              event_kind: null,
              summary: `rel-${i}`,
              significance: 1,
              active: true,
              latest_attempt_id: null,
              latest_commit_key: null,
            })),
          },
        },
      }),
    },
  });

  state = cm.upsertVisitTurn(state, 'reimu', makeTurn(16));
  assert.equal(state.interaction.visit_memory.by_character.reimu.active_visit.turns.length, 16);
  assert.equal(state.interaction.visit_memory.by_character.reimu.active_visit.turns.at(-1).turn_id, 't:16');

  state = cm.upsertRelationshipMemory(state, 'reimu', {
    relationship_memory_id: 'state-lover',
    character_id: 'reimu',
    request_id: 'req-state',
    visit_id: 'character_visit_000001',
    day: 2,
    time_period: '白昼',
    period_serial: 5,
    kind: 'relationship_state',
    relationship_label: 'lover',
    event_kind: null,
    summary: '双方明确确认恋人关系',
    significance: 3,
    active: true,
    latest_attempt_id: null,
    latest_commit_key: null,
  });
  const relationships = state.interaction.visit_memory.by_character.reimu.relationship_memories;
  assert.equal(relationships.length, 12);
  assert.deepEqual(
    relationships.filter((memory) => memory.kind === 'relationship_state' && memory.active)
      .map((memory) => memory.relationship_memory_id),
    ['state-lover'],
  );
});

test('lifecycle：clockFromState 只用正式时钟（environment + periodSerialFromState）', async () => {
  const cm = await importTypescript('../src/ui/character-memory.ts');
  const clock = cm.clockFromState(baseState({ environment: { day: 3, time_period: '黄昏' } }));
  assert.equal(clock.day, 3);
  assert.equal(clock.time_period, '黄昏');
  assert.equal(typeof clock.period_serial, 'number');
  const emptyClock = cm.clockFromState({});
  assert.deepEqual(emptyClock, { day: null, time_period: null, period_serial: null });
});

// ===== B1-T11：写点接线 =====

test('接线：scheduler due departure 关闭 visit（scheduled-departure）', async () => {
  const visitors = await importTypescript('../src/ui/visitor-rules.ts');
  const state = baseState({
    presence_snapshot: {
      present_character_ids: ['reimu', 'marisa'],
      character_views: {},
      visitor_meta: {
        reimu: { source: 'event', arrived_period_serial: 0, planned_departure_serial: 99 },
        marisa: { arrival_uid: 'a2', source: 'scheduler', arrived_period_serial: 0, planned_departure_serial: 1 },
      },
    },
    interaction: {
      visit_memory: visitMemoryFixture({
        by_character: {
          reimu: emptyCharacterMemory('reimu'),
          marisa: { ...emptyCharacterMemory('marisa'), active_visit: makeVisit('character_visit_000001', []) },
        },
      }),
    },
    visit_scheduler: {
      version: 'visit.v1',
      known_characters: ['reimu', 'marisa'],
      plans: [],
      cooldown_until: {},
      invitation_cooldowns: {},
      last_processed_serial: null,
      pending_notices: [],
    },
  });
  const { state: after } = visitors.evaluateVisitScheduler(state, { chatId: 'c', commitArrivals: true, busy: false });
  assert.equal(after.interaction.visit_memory.by_character.marisa.active_visit, null);
  assert.equal(after.interaction.visit_memory.by_character.marisa.closed_visits[0].end_reason, 'scheduled-departure');
  assert.equal(after.interaction.visit_memory.by_character.marisa.closed_visits[0].ended_period_serial, 5);
});

test('接线：local event settlement 直接追加 presence → event 打开 visit', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const state = baseState({
    areas: { central_courtyard: { id: 'central_courtyard' }, greenhouse_plot: { id: 'greenhouse_plot', unlocked: false, state: '未发现' } },
    facilities: { magic_greenhouse: { id: 'magic_greenhouse', state: '未发现' } },
    events: { completed_key_events: { reimu_boundary_inspection: 'temporary_permission' }, settled_ids: [] },
    resources: { materials: 6, inspiration: 1, coins: 0 },
  });
  const after = settlement.applyLocalSettlement(
    state,
    { version: 'garden-action.v1', action_id: 'investigate_magic_trace', event_id: 'marisa_material_rumor', settlement_id: 'st-1' },
    5,
    '<GensokyoEventResult>{"version":"event-result.v1","event_id":"marisa_material_rumor","result":"greenhouse_clue_found"}</GensokyoEventResult>',
  );
  assert.equal(after.interaction.visit_memory.by_character.marisa.active_visit.source, 'event');
  assert.equal(after.uid_counters.character_visit, 2);
});

test('接线：opportunity arrival → event 打开 visit', async () => {
  const card = await importTypescript('../src/ui/card-item-rules.ts');
  const state = baseState({
    inventory: { consumables: { opportunity_card: 1 }, card_runtime: { settled_use_ids: [], opportunity: { pending: null, last_result: null }, duel: {} } },
  });
  const result = card.useOpportunityCard(state, 'opp-1', 'chat');
  assert.equal(result.state.interaction.visit_memory.by_character[result.selectedCharacterId].active_visit.source, 'event');
  assert.equal(result.state.interaction.visit_memory.by_character[result.selectedCharacterId].active_visit.visit_id, 'character_visit_000001');
});

test('接线：endConversationLocal 不切 visit（禁区）', async () => {
  const activity = await importTypescript('../src/ui/activity-rules.ts');
  const state = baseState({
    presence_snapshot: { present_character_ids: ['reimu'], character_views: {}, visitor_meta: {} },
    interaction: {
      current_session: { uid: 's1' },
      visit_memory: visitMemoryFixture({
        by_character: { reimu: { ...emptyCharacterMemory('reimu'), active_visit: makeVisit('character_visit_000001', []) } },
      }),
    },
  });
  const ended = activity.endConversationLocal(structuredClone(state));
  assert.equal(ended.interaction.current_session, null);
  assert.deepEqual(ended.presence_snapshot.present_character_ids, ['reimu']);
  assert.equal(ended.interaction.visit_memory.by_character.reimu.active_visit.visit_id, 'character_visit_000001');
});

test('接线：migration bootstrap 与 absent stale active repair close', async () => {
  const migrations = await importTypescript('../src/ui/state-migrations.ts');
  // 在场无 active → bootstrap
  const boot = migrations.migrateGardenState({
    characters: { reimu: { id: 'reimu' } },
    presence_snapshot: { present_character_ids: ['reimu'], character_views: {}, visitor_meta: {} },
  });
  assert.equal(boot.interaction.visit_memory.by_character.reimu.active_visit.source, 'bootstrap');
  assert.equal(boot.interaction.visit_memory.by_character.reimu.active_visit.visit_id, 'character_visit_000001');
  assert.equal(boot.uid_counters.character_visit, 2);
  // 幂等：再跑不重复 bootstrap
  const boot2 = migrations.migrateGardenState(boot);
  assert.equal(boot2.interaction.visit_memory.by_character.reimu.active_visit.visit_id, 'character_visit_000001');
  assert.equal(boot2.uid_counters.character_visit, 2);
  // absent 但有 stale active → reconcile close
  const stale = migrations.migrateGardenState({
    characters: { reimu: { id: 'reimu' } },
    presence_snapshot: { present_character_ids: [], character_views: {}, visitor_meta: {} },
    interaction: { visit_memory: visitMemoryFixture({ by_character: { reimu: { ...emptyCharacterMemory('reimu'), active_visit: makeVisit('character_visit_000999', []) } } }) },
  });
  assert.equal(stale.interaction.visit_memory.by_character.reimu.active_visit, null);
  assert.equal(stale.interaction.visit_memory.by_character.reimu.closed_visits[0].end_reason, 'reconcile');
});

test('接线：nested caller 不双增 counter（applyPresenceUpdate → reconcileM2Runtime）', async () => {
  const settlement = await importTypescript('../src/ui/event-settlement.ts');
  const m2 = await importTypescript('../src/ui/m2-runtime.ts');
  const before = baseState();
  const afterPresence = settlement.applyPresenceUpdate(before, '<GensokyoPresence>{"version":"presence.v1","present_character_ids":["reimu","marisa"]}</GensokyoPresence>');
  // before 无人在场 → 回执让 reimu+marisa 都 arrive → counter 1→3
  assert.equal(afterPresence.uid_counters.character_visit, 3);
  const nested = m2.reconcileM2Runtime(before, afterPresence, 'chat');
  // nested 不再双增：counter 保持 3、visit ID 不重复
  assert.equal(nested.interaction.visit_memory.by_character.marisa.active_visit.visit_id, afterPresence.interaction.visit_memory.by_character.marisa.active_visit.visit_id);
  assert.equal(nested.uid_counters.character_visit, afterPresence.uid_counters.character_visit);
  assert.equal(nested.uid_counters.character_visit, 3);
});

// ===== B1-T11：容量收尾 =====

test('lifecycle 容量：closed visit ≤4、total story turns ≤48（经协调器）', async () => {
  const cm = await importTypescript('../src/ui/character-memory.ts');
  const clock = { day: 2, time_period: '白昼', period_serial: 5 };
  const mkVisitWithTurns = (id, turns) => makeVisit(id, turns);
  let memory = cm.normalizeVisitMemoryState(visitMemoryFixture({
    by_character: {
      reimu: {
        ...emptyCharacterMemory('reimu'),
        active_visit: mkVisitWithTurns('v-active', Array.from({ length: 16 }, (_, i) => makeTurn(`a${i}`))),
        closed_visits: [0, 1, 2, 3].map((k) => mkVisitWithTurns(`v-c${k}`, Array.from({ length: 16 }, (_, i) => makeTurn(`c${k}-${i}`)))),
      },
    },
  }));
  // 一次 absent→present→absent 往返
  const closed = cm.reconcileCharacterVisits({
    beforePresence: { present_character_ids: ['reimu'] },
    afterPresence: { present_character_ids: [] },
    memory,
    counters: { character_visit: 1 },
    clock,
    cause: 'scheduler',
  });
  // 关闭后 5 个 closed（4 旧 + 新）→ 容量裁剪保留 4
  assert.equal(closed.memory.by_character.reimu.closed_visits.length, 4);
  const totalTurns = closed.memory.by_character.reimu.closed_visits.reduce((n, v) => n + v.turns.length, 0);
  assert.ok(totalTurns <= 48);
  // 再开新 visit 后 active 16 + closed 32 = 48
  const reopened = cm.reconcileCharacterVisits({
    beforePresence: { present_character_ids: [] },
    afterPresence: { present_character_ids: ['reimu'] },
    memory: closed.memory,
    counters: closed.counters,
    clock,
    cause: 'scheduler',
  });
  const active = reopened.memory.by_character.reimu.active_visit.turns.length;
  const closedTotal = reopened.memory.by_character.reimu.closed_visits.reduce((n, v) => n + v.turns.length, 0);
  assert.ok(active + closedTotal <= 48);
});

// 辅助（避免重复 import）
async function importTypescripts() {
  return importTypescript('../src/ui/character-memory.ts');
}
