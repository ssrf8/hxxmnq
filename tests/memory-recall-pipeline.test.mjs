// 第四批 B4-T05 —— 召回纯管线。
// runbook §10 B4-T05 必测：relevant 为 []、单角色、4 角色、第 5 个角色被拒绝、
// 同 character ID 不同 scope、同 ID 本地/数据库冲突（MVU 获胜）、active relationship 保护、
// 稳定排序、每角色预算与全局预算、来源标签只进入内部 candidate、返回纯数据。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

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

const {
  runRecallPipeline,
  estimateRecallItemChars,
  RECALL_TOTAL_BUDGET_CHARS,
  RECALL_PER_CHARACTER_BUDGET_CHARS,
} = await importTypescript('../src/ui/memory-recall-pipeline.ts');
const schema = await importTypescript('../src/ui/memory-archive-schema.ts');
const {
  MEMORY_ARCHIVE_SCHEMA_VERSION,
  STORY_RECALL_PER_CHARACTER,
  RELATIONSHIP_RECALL_PER_CHARACTER,
  buildArchiveKey,
} = schema;

const SCOPE_A = 'gal-scope.v1|owner=2:卡主|chat=4:chat';
const SCOPE_B = 'gal-scope.v1|owner=2:卡主|chat=5:chat2';

function storyRow(overrides = {}) {
  const row = {
    archive_schema_version: MEMORY_ARCHIVE_SCHEMA_VERSION,
    archive_scope_id: SCOPE_A,
    memory_id: 'turn-1',
    character_id: 'cirno',
    visit_id: 'visit-1',
    request_id: 'req-1',
    day: '3',
    time_period: '清晨',
    period_serial: 2,
    summary: '路过雾之湖。',
    source_revision: 'gal-memory-archive-v1',
    content_hash: 'deadbeef',
    ...overrides,
  };
  if (!Object.hasOwn(overrides, 'archive_key')) {
    row.archive_key = buildArchiveKey({ archiveScopeId: row.archive_scope_id, kind: 'story', stableId: row.memory_id });
  }
  return row;
}

function relRow(overrides = {}) {
  const row = {
    archive_schema_version: MEMORY_ARCHIVE_SCHEMA_VERSION,
    archive_scope_id: SCOPE_A,
    relationship_memory_id: 'rel-1',
    character_id: 'cirno',
    visit_id: null,
    request_id: 'req-1',
    kind: 'milestone',
    relationship_label: 'friend',
    event_kind: null,
    day: '5',
    time_period: '黄昏',
    period_serial: 1,
    summary: '约定看流星。',
    significance: 2,
    active: 1,
    source_revision: 'gal-memory-archive-v1',
    content_hash: 'cafebabe',
    ...overrides,
  };
  if (!Object.hasOwn(overrides, 'archive_key')) {
    row.archive_key = buildArchiveKey({ archiveScopeId: row.archive_scope_id, kind: 'relationship', stableId: row.relationship_memory_id });
  }
  return row;
}

const EMPTY_MVU = { storyIds: new Set(), relationshipIds: new Set() };
const EMPTY_ACTIVE = { byCharacter: {} };

function run(input) {
  const relevantCharacterIds = input.relevantCharacterIds ?? ['cirno'];
  return runRecallPipeline({
    archiveScopeId: SCOPE_A,
    relevantCharacterIds,
    storyRows: [],
    relationshipRows: [],
    localMvu: EMPTY_MVU,
    localActiveRelationships: EMPTY_ACTIVE,
    remainingBudget: {
      globalChars: RECALL_TOTAL_BUDGET_CHARS,
      perCharacterChars: Object.fromEntries(relevantCharacterIds.slice(0, 4).map((id) => [id, RECALL_PER_CHARACTER_BUDGET_CHARS])),
    },
    ...input,
  });
}

test('B4-T05: relevant 为 [] → 全部非 relevant，输出 recall-empty', () => {
  const out = run({ relevantCharacterIds: [], storyRows: [storyRow()], relationshipRows: [relRow()] });
  assert.equal(out.status, 'recall-empty');
  assert.equal(out.story.length, 0);
  assert.equal(out.relationship.length, 0);
  assert.equal(out.rejected.nonRelevant, 2);
});

test('B4-T05: 单角色正常召回', () => {
  const out = run({ storyRows: [storyRow()], relationshipRows: [relRow()] });
  assert.equal(out.story.length, 1);
  assert.equal(out.relationship.length, 1);
  assert.equal(out.story[0].source, 'database-archive');
  assert.equal(out.story[0].characterId, 'cirno');
  assert.equal(out.relationship[0].relationshipMemoryId, 'rel-1');
});

test('B4-T05: 4 角色全部召回，第 5 个角色被拒绝', () => {
  const chars = ['a', 'b', 'c', 'd'];
  const storyRows = chars.map((c, i) => storyRow({ memory_id: `turn-${c}`, character_id: c, summary: `内容${c}` }));
  const out4 = run({ relevantCharacterIds: chars, storyRows });
  assert.equal(out4.story.length, 4);

  const out5 = run({
    relevantCharacterIds: ['a', 'b', 'c', 'd', 'e'],
    storyRows: [
      ...storyRows,
      storyRow({ memory_id: 'turn-e', character_id: 'e', summary: '内容e' }),
    ],
  });
  assert.equal(out5.story.length, 4, '冻结相关角色硬上限为 4，第 5 个必须拒绝');
  assert.equal(out5.rejected.nonRelevant, 1);
  // 第 5 个角色不在 relevant → 拒绝
  const outReject = run({
    relevantCharacterIds: ['a', 'b', 'c', 'd'],
    storyRows: [...storyRows, storyRow({ memory_id: 'turn-e', character_id: 'e', summary: '内容e' })],
  });
  assert.equal(outReject.story.length, 4);
  assert.equal(outReject.rejected.nonRelevant, 1);
});

test('B4-T05: 同 character ID 不同 scope → wrongScope 拒绝', () => {
  const out = run({
    storyRows: [storyRow({ memory_id: 'turn-x' }), storyRow({ archive_scope_id: SCOPE_B, memory_id: 'turn-y' })],
  });
  assert.equal(out.story.length, 1);
  assert.equal(out.rejected.wrongScope, 1);
});

test('B4-T05: 同 ID 本地/数据库冲突 → MVU 获胜', () => {
  const out = run({
    storyRows: [storyRow({ memory_id: 'turn-dup' })],
    relationshipRows: [relRow({ relationship_memory_id: 'rel-dup' })],
    localMvu: { storyIds: new Set(['turn-dup']), relationshipIds: new Set(['rel-dup']) },
  });
  assert.equal(out.story.length, 0);
  assert.equal(out.relationship.length, 0);
  assert.equal(out.rejected.mvuDuplicate, 2);
});

test('B4-T05: 数据库内部重复去重', () => {
  const out = run({
    storyRows: [storyRow({ memory_id: 'turn-dup' }), storyRow({ memory_id: 'turn-dup' })],
    relationshipRows: [relRow({ relationship_memory_id: 'rel-dup' }), relRow({ relationship_memory_id: 'rel-dup' })],
  });
  assert.equal(out.story.length, 1);
  assert.equal(out.relationship.length, 1);
  assert.equal(out.rejected.duplicateDb, 2);
});

test('B4-T05-R1: 冲突重复行不受输入顺序影响，整组拒绝', () => {
  const a = storyRow({ memory_id: 'turn-conflict', summary: '版本甲' });
  const b = storyRow({ memory_id: 'turn-conflict', summary: '版本乙' });
  const left = run({ storyRows: [a, b] });
  const right = run({ storyRows: [b, a] });
  assert.deepEqual(left, right);
  assert.equal(left.story.length, 0);
  assert.equal(left.rejected.duplicateDb, 2);
});

test('B4-T05: active relationship state 保护（MVU active 覆盖 DB active=false）', () => {
  const out = run({
    relationshipRows: [relRow({ relationship_memory_id: 'rel-active', active: 0 })],
    localActiveRelationships: { byCharacter: { cirno: new Set(['rel-active']) } },
  });
  assert.equal(out.relationship.length, 1);
  assert.equal(out.relationship[0].active, true, 'MVU 标记 active 的 ID 必须按 active 保留');
});

test('B4-T05: DB active=false 且 MVU 无记录 → 保留 DB 值', () => {
  const out = run({ relationshipRows: [relRow({ relationship_memory_id: 'rel-old', active: 0 })] });
  assert.equal(out.relationship[0].active, false);
});

test('B4-T05-R1: DB 旧 active=true 不能在 MVU 无当前记录时冒充当前状态', () => {
  const out = run({ relationshipRows: [relRow({ relationship_memory_id: 'rel-old-active', active: 1 })] });
  assert.equal(out.relationship[0].active, false);
});

test('B4-T05: 稳定排序（periodSerial 降序、day 降序、memoryId 升序）', () => {
  const rows = [
    storyRow({ memory_id: 'turn-1', period_serial: 1, day: '1' }),
    storyRow({ memory_id: 'turn-3', period_serial: 3, day: '3' }),
    storyRow({ memory_id: 'turn-2', period_serial: 2, day: '2' }),
    storyRow({ memory_id: 'turn-2b', period_serial: 2, day: '2' }),
  ];
  const out = run({ storyRows: rows });
  assert.deepEqual(out.story.map((i) => i.memoryId), ['turn-3', 'turn-2', 'turn-2b', 'turn-1']);
});

test('B4-T05: 每角色预算裁剪（story 24 / relationship 12）', () => {
  const manyStory = Array.from({ length: STORY_RECALL_PER_CHARACTER + 5 }, (_, i) =>
    storyRow({ memory_id: `turn-${i}`, period_serial: i, summary: `s${i}` }));
  const manyRel = Array.from({ length: RELATIONSHIP_RECALL_PER_CHARACTER + 5 }, (_, i) =>
    relRow({ relationship_memory_id: `rel-${i}`, period_serial: i, summary: `r${i}` }));
  const storyOut = run({ storyRows: manyStory });
  const relOut = run({ relationshipRows: manyRel });
  assert.ok(storyOut.story.length <= STORY_RECALL_PER_CHARACTER);
  assert.ok(relOut.relationship.length <= RELATIONSHIP_RECALL_PER_CHARACTER);
  const storyChars = storyOut.story.reduce((sum, item) => sum + estimateRecallItemChars(item), 0);
  const relChars = relOut.relationship.reduce((sum, item) => sum + estimateRecallItemChars(item), 0);
  assert.ok(storyChars <= RECALL_PER_CHARACTER_BUDGET_CHARS);
  assert.ok(relChars <= RECALL_PER_CHARACTER_BUDGET_CHARS);
  const out = run({ storyRows: manyStory, relationshipRows: manyRel });
  assert.ok(out.rejected.budget >= 10);
});

test('B4-T05: 全局预算（2800 字符）裁剪', () => {
  const bigStory = Array.from({ length: 60 }, (_, i) =>
    storyRow({ memory_id: `turn-${i}`, period_serial: i, summary: '很长内容'.repeat(30) }));
  const out = run({ storyRows: bigStory });
  const totalChars = [...out.story, ...out.relationship].reduce((acc, item) => acc + estimateRecallItemChars(item), 0);
  assert.ok(totalChars <= RECALL_TOTAL_BUDGET_CHARS, `全局预算超限: ${totalChars}`);
});

test('B4-T05-R1: 数据库只吃剩余预算，0 剩余时不能挤掉本地 active visit', () => {
  const out = run({
    storyRows: [storyRow()],
    relationshipRows: [relRow()],
    remainingBudget: { globalChars: 0, perCharacterChars: { cirno: 0 } },
  });
  assert.equal(out.status, 'recall-empty');
  assert.deepEqual(out.story, []);
  assert.deepEqual(out.relationship, []);
  assert.equal(out.rejected.budget, 2);
});

test('B4-T05: 来源标签只进入内部 candidate，不写请求/host/MVU', () => {
  const out = run({ storyRows: [storyRow()], relationshipRows: [relRow()] });
  for (const item of out.story) assert.equal(item.source, 'database-archive');
  for (const item of out.relationship) assert.equal(item.source, 'database-archive');
  // 输出是纯数据：无函数、无请求引用
  assert.equal(typeof out.story[0].summary, 'string');
});

test('B4-T05: 非法 DB 候选（错 schema/错 scope/缺 ID）输出与合法过滤', () => {
  const bad = [
    storyRow({ archive_schema_version: 'gal-memory-archive.v0' }),
    storyRow({ archive_scope_id: SCOPE_B }),
    storyRow({ memory_id: '' }),
    storyRow({ memory_id: 'turn-ok' }),
  ];
  const out = run({ storyRows: bad });
  assert.equal(out.story.length, 1);
  assert.equal(out.story[0].memoryId, 'turn-ok');
  assert.ok(out.rejected.invalid >= 2);
  assert.equal(out.rejected.wrongScope, 1);
});

test('B4-T05-R1: 任意 HTML、非法 kind/label/time 不得进入召回', () => {
  const out = run({
    storyRows: [storyRow({ summary: '<img src=x onerror=alert(1)>' }), storyRow({ memory_id: 'ok-story' })],
    relationshipRows: [
      relRow({ relationship_memory_id: 'bad-kind', kind: 'TELEPORT' }),
      relRow({ relationship_memory_id: 'bad-label', relationship_label: 'NEMESIS' }),
      relRow({ relationship_memory_id: 'bad-time', time_period: 'morning' }),
    ],
  });
  assert.deepEqual(out.story.map((item) => item.memoryId), ['ok-story']);
  assert.equal(out.relationship.length, 0);
  assert.equal(out.rejected.invalid, 4);
});

test('B4-T05: 全部 DB 候选非法 → 输出与 standalone 严格相等（空候选）', () => {
  const out = run({
    storyRows: [storyRow({ archive_schema_version: 'gal-memory-archive.v0' })],
    relationshipRows: [relRow({ archive_scope_id: SCOPE_B })],
  });
  assert.equal(out.status, 'recall-empty');
  assert.deepEqual(out.story, []);
  assert.deepEqual(out.relationship, []);
});
