// 第四批 B4-T03 —— 归档 schema、normalizer 与纯记录转换。
// 覆盖 runbook §10 B4-T03 必测：完整合法行、缺 stable ID、错 character ID、错 scope、
// 错 enum、day 多形态、超长文本、HTML/协议片段、未知字段、旧 schema、
// 成人关系事件不推导 relationship state、转换前后不包含完整正文。
// 禁止：不导入 host/window、不写 MVU、不查询数据库、不在 normalizer 中调用 LLM、不用随机 ID。
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

const schema = await importTypescript('../src/ui/memory-archive-schema.ts');
const {
  MEMORY_ARCHIVE_SCHEMA_VERSION,
  STORY_RECALL_PER_CHARACTER,
  RELATIONSHIP_RECALL_PER_CHARACTER,
  buildArchiveScopeId,
  buildArchiveKey,
  stableSerializeRecord,
  buildContentHash,
  toStoryArchiveRecord,
  toRelationshipArchiveRecord,
  storyRowToCandidate,
  relationshipRowToCandidate,
} = schema;

const SCOPE = buildArchiveScopeId({ ownerCharacterId: '卡主', chatId: 'chat-abc-123' });
assert.ok(SCOPE.ok);
const scopeId = SCOPE.ok ? SCOPE.archiveScopeId : '';

function makeTurn(overrides = {}) {
  return {
    turn_id: 'turn-100',
    request_id: 'req-9',
    character_id: 'cirno',
    scene_id: 'sc-1',
    assistant_message_id: 5,
    assistant_swipe_id: 1,
    latest_attempt_id: 'att-1',
    latest_commit_key: 'ck-1',
    day: 3,
    time_period: '清晨',
    period_serial: 2,
    summary: '与主角在雾之湖散步，讨论了冰之妖精的职责。',
    ...overrides,
  };
}

function makeMemory(overrides = {}) {
  return {
    relationship_memory_id: 'rel-50',
    character_id: 'cirno',
    request_id: 'req-10',
    visit_id: 'visit-7',
    day: 5,
    time_period: '黄昏',
    period_serial: 1,
    kind: 'milestone',
    relationship_label: 'friend',
    event_kind: 'promise',
    summary: '约定下次一起看流星雨。',
    significance: 2,
    active: true,
    latest_attempt_id: null,
    latest_commit_key: null,
    ...overrides,
  };
}

test('B4-T03: scope id 精确算法（长度前缀 + trim + 上限）', () => {
  const ok = buildArchiveScopeId({ ownerCharacterId: ' 卡主 ', chatId: ' chat ' });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.archiveScopeId, 'gal-scope.v1|owner=2:卡主|chat=4:chat');
  }
  // 空 owner/chat
  assert.equal(buildArchiveScopeId({ ownerCharacterId: '', chatId: 'x' }).ok, false);
  assert.equal(buildArchiveScopeId({ ownerCharacterId: 'x', chatId: '  ' }).ok, false);
  // 超长 owner/chat
  assert.equal(buildArchiveScopeId({ ownerCharacterId: 'x'.repeat(129), chatId: 'x' }).ok, false);
  assert.equal(buildArchiveScopeId({ ownerCharacterId: 'x', chatId: 'x'.repeat(513) }).ok, false);
});

test('B4-T03: archive key = scope + kind + stableId，content_hash 不入 key', () => {
  const key = buildArchiveKey({ archiveScopeId: scopeId, kind: 'story', stableId: 'turn-100' });
  assert.equal(key, `gal-archive.v1|scope=${scopeId.length}:${scopeId}|kind=story|id=8:turn-100`);
  assert.ok(!key.includes('content'));
  assert.ok(!key.includes('hash'));
  // 同一稳定 ID 同 kind 同 scope → 相同 key（幂等）
  assert.equal(
    buildArchiveKey({ archiveScopeId: scopeId, kind: 'story', stableId: 'turn-100' }),
    key,
  );
});

test('B4-T03: 完整合法 story 行', () => {
  const result = toStoryArchiveRecord({ turn: makeTurn(), visitId: 'visit-7', archiveScopeId: scopeId });
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.value.archiveSchemaVersion, MEMORY_ARCHIVE_SCHEMA_VERSION);
    assert.equal(result.value.archiveScopeId, scopeId);
    assert.equal(result.value.memoryId, 'turn-100');
    assert.equal(result.value.characterId, 'cirno');
    assert.equal(result.value.visitId, 'visit-7');
    assert.equal(result.value.requestId, 'req-9');
    assert.equal(result.value.day, '3');
    assert.equal(result.value.timePeriod, '清晨');
    assert.equal(result.value.periodSerial, 2);
    assert.match(result.value.summary, /雾之湖/);
    assert.equal(typeof result.value.contentHash, 'string');
    assert.ok(result.value.contentHash.length >= 8);
  }
});

test('B4-T03: 缺 stable ID → invalid-stable-id', () => {
  const result = toStoryArchiveRecord({ turn: makeTurn({ turn_id: '' }), visitId: 'visit-7', archiveScopeId: scopeId });
  assert.ok(!result.ok);
  if (!result.ok) assert.equal(result.error.code, 'invalid-stable-id');
});

test('B4-T03: 错 character ID → invalid-character', () => {
  const result = toStoryArchiveRecord({ turn: makeTurn({ character_id: '   ' }), visitId: 'visit-7', archiveScopeId: scopeId });
  assert.ok(!result.ok);
  if (!result.ok) assert.equal(result.error.code, 'invalid-character');
});

test('B4-T03: day 为 number/string/null 均确定性转字符串', () => {
  const a = toStoryArchiveRecord({ turn: makeTurn({ day: 7 }), visitId: 'visit-7', archiveScopeId: scopeId });
  const b = toStoryArchiveRecord({ turn: makeTurn({ day: '7' }), visitId: 'visit-7', archiveScopeId: scopeId });
  const c = toStoryArchiveRecord({ turn: makeTurn({ day: null }), visitId: 'visit-7', archiveScopeId: scopeId });
  assert.ok(a.ok && b.ok && c.ok);
  if (a.ok) assert.equal(a.value.day, '7');
  if (b.ok) assert.equal(b.value.day, '7');
  if (c.ok) assert.equal(c.value.day, null);
});

test('B4-T03: 超长文本 → oversized（正文不落库）', () => {
  const long = toStoryArchiveRecord({
    turn: makeTurn({ summary: 'x'.repeat(3000) }),
    visitId: 'visit-7',
    archiveScopeId: scopeId,
  });
  assert.ok(!long.ok, '超长摘要应被拒绝（完整正文禁止落库）');
  if (!long.ok) assert.equal(long.error.code, 'oversized');
});

test('B4-T03: HTML/协议片段 → unsafe-content', () => {
  for (const bad of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'javascript:alert(1)', 'data:text/html,<script>']) {
    const result = toStoryArchiveRecord({ turn: makeTurn({ summary: bad }), visitId: 'visit-7', archiveScopeId: scopeId });
    assert.ok(!result.ok, `应拒绝: ${bad}`);
    if (!result.ok) assert.equal(result.error.code, 'unsafe-content');
  }
});

test('B4-T03: 完整合法 relationship 行', () => {
  const result = toRelationshipArchiveRecord({ memory: makeMemory(), archiveScopeId: scopeId });
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.value.archiveSchemaVersion, MEMORY_ARCHIVE_SCHEMA_VERSION);
    assert.equal(result.value.archiveScopeId, scopeId);
    assert.equal(result.value.relationshipMemoryId, 'rel-50');
    assert.equal(result.value.characterId, 'cirno');
    assert.equal(result.value.kind, 'milestone');
    assert.equal(result.value.relationshipLabel, 'friend');
    assert.equal(result.value.eventKind, 'promise');
    assert.equal(result.value.day, '5');
    assert.equal(result.value.timePeriod, '黄昏');
    assert.equal(result.value.periodSerial, 1);
    assert.equal(result.value.significance, 2);
    assert.equal(result.value.active, true);
    assert.equal(typeof result.value.contentHash, 'string');
  }
});

test('B4-T03: 错 enum → invalid-enum', () => {
  const result = toRelationshipArchiveRecord({
    memory: makeMemory({ kind: 'teleport' }),
    archiveScopeId: scopeId,
  });
  assert.ok(!result.ok);
  if (!result.ok) assert.equal(result.error.code, 'invalid-enum');

  const badLabel = toRelationshipArchiveRecord({
    memory: makeMemory({ relationship_label: 'nemesis' }),
    archiveScopeId: scopeId,
  });
  assert.ok(!badLabel.ok);
  if (!badLabel.ok) assert.equal(badLabel.error.code, 'invalid-enum');

  const badEvent = toRelationshipArchiveRecord({
    memory: makeMemory({ event_kind: 'time-travel' }),
    archiveScopeId: scopeId,
  });
  assert.ok(!badEvent.ok);
  if (!badEvent.ok) assert.equal(badEvent.error.code, 'invalid-enum');
});

test('B4-T03: 成人关系事件不推导 relationship state（只记录事件）', () => {
  // adult_intimacy 是 event_kind，不是 kind；转换不反推 active/label。
  const result = toRelationshipArchiveRecord({
    memory: makeMemory({ kind: 'milestone', event_kind: 'adult_intimacy', relationship_label: null, active: false }),
    archiveScopeId: scopeId,
  });
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.value.eventKind, 'adult_intimacy');
    assert.equal(result.value.relationshipLabel, null);
    assert.equal(result.value.active, false, '事件记录不得反推 active state');
  }
});

test('B4-T03: story row → 校验候选（scope/character/稳定 ID/schema/安全）', () => {
  const good = storyRowToCandidate({
    archive_schema_version: MEMORY_ARCHIVE_SCHEMA_VERSION,
    archive_key: buildArchiveKey({ archiveScopeId: scopeId, kind: 'story', stableId: 'turn-1' }),
    archive_scope_id: scopeId,
    memory_id: 'turn-1',
    character_id: 'cirno',
    visit_id: 'visit-1',
    request_id: 'req-1',
    scene_id: null,
    day: '3',
    time_period: '清晨',
    period_serial: 2,
    summary: '路过雾之湖。',
    source_revision: 'gal-memory-archive-v1',
    content_hash: 'deadbeef',
  }, scopeId);
  assert.ok(good.ok);
  if (good.ok) {
    assert.equal(good.value.source, 'database-archive');
    assert.equal(good.value.memoryId, 'turn-1');
    assert.equal(good.value.characterId, 'cirno');
    assert.equal(good.value.periodSerial, 2);
  }
  // 错 scope
  const badScope = storyRowToCandidate({
    archive_schema_version: MEMORY_ARCHIVE_SCHEMA_VERSION,
    archive_scope_id: 'gal-scope.v1|owner=1:x|chat=1:y',
    memory_id: 'turn-1',
    character_id: 'cirno',
    visit_id: 'visit-1',
    summary: 'x',
  }, scopeId);
  assert.ok(!badScope.ok);
  // 旧 schema
  const oldSchema = storyRowToCandidate({
    archive_schema_version: 'gal-memory-archive.v0',
    archive_scope_id: scopeId,
    memory_id: 'turn-1',
    character_id: 'cirno',
    visit_id: 'visit-1',
    summary: 'x',
  }, scopeId);
  assert.ok(!oldSchema.ok);
  if (!oldSchema.ok) assert.equal(oldSchema.error.code, 'old-schema');
  // 超长文本
  const unsafe = storyRowToCandidate({
    archive_schema_version: MEMORY_ARCHIVE_SCHEMA_VERSION,
    archive_scope_id: scopeId,
    memory_id: 'turn-1',
    character_id: 'cirno',
    visit_id: 'visit-1',
    summary: '<script>alert(1)</script>',
  }, scopeId);
  assert.ok(!unsafe.ok);
});

test('B4-T03: relationship row → 校验候选（active 0/1/true 规范化）', () => {
  const row = {
    archive_schema_version: MEMORY_ARCHIVE_SCHEMA_VERSION,
    archive_key: buildArchiveKey({ archiveScopeId: scopeId, kind: 'relationship', stableId: 'rel-9' }),
    archive_scope_id: scopeId,
    relationship_memory_id: 'rel-9',
    character_id: 'cirno',
    visit_id: 'visit-2',
    request_id: 'req-2',
    kind: 'relationship_state',
    relationship_label: 'close_friend',
    event_kind: null,
    day: '8',
    time_period: null,
    period_serial: 1,
    summary: '关系升温。',
    significance: 2,
    active: 1,
    source_revision: 'gal-memory-archive-v1',
    content_hash: 'cafebabe',
  };
  const a = relationshipRowToCandidate(row, scopeId);
  assert.ok(a.ok);
  if (a.ok) assert.equal(a.value.active, true);
  const b = relationshipRowToCandidate({ ...row, active: 0 }, scopeId);
  assert.ok(b.ok);
  if (b.ok) assert.equal(b.value.active, false);
  // 错 enum
  const badKind = relationshipRowToCandidate({ ...row, kind: 'teleport' }, scopeId);
  assert.ok(!badKind.ok);
});

test('B4-T03: stableSerializeRecord 确定性与 content hash 稳定性', () => {
  const a = stableSerializeRecord({ b: 2, a: 1, c: 'x' });
  const b = stableSerializeRecord({ c: 'x', b: 2, a: 1 });
  assert.equal(a, b);
  assert.equal(buildContentHash(a), buildContentHash(b));
  // 内容变化 → hash 变化
  assert.notEqual(buildContentHash(a), buildContentHash(stableSerializeRecord({ b: 2, a: 1, c: 'y' })));
  assert.notEqual(
    stableSerializeRecord({ a: 'x|b=y' }),
    stableSerializeRecord({ a: 'x', b: 'y' }),
    '字符串分隔符不得制造字段边界碰撞',
  );
});

test('B4-T03-R1: converter 拒绝伪造 scope、非法时段，并把摘要统一裁到 160', () => {
  const badScope = toStoryArchiveRecord({ turn: makeTurn(), visitId: 'visit-7', archiveScopeId: 'gal-scope.v1|owner=5:x|chat=1:y' });
  assert.equal(badScope.ok, false);
  if (!badScope.ok) assert.equal(badScope.error.code, 'invalid-scope');

  const badPeriod = toStoryArchiveRecord({ turn: makeTurn({ time_period: 'morning' }), visitId: 'visit-7', archiveScopeId: scopeId });
  assert.equal(badPeriod.ok, false);
  if (!badPeriod.ok) assert.equal(badPeriod.error.field, 'time_period');

  const truncated = toStoryArchiveRecord({ turn: makeTurn({ summary: '摘要'.repeat(100) }), visitId: 'visit-7', archiveScopeId: scopeId });
  assert.ok(truncated.ok);
  if (truncated.ok) assert.equal(truncated.value.summary.length, 160);
});

test('B4-T03-R1: database row 严格拒绝 key/hash/revision/枚举与任意 HTML', () => {
  const base = {
    archive_schema_version: MEMORY_ARCHIVE_SCHEMA_VERSION,
    archive_key: buildArchiveKey({ archiveScopeId: scopeId, kind: 'relationship', stableId: 'rel-strict' }),
    archive_scope_id: scopeId,
    relationship_memory_id: 'rel-strict',
    character_id: 'cirno',
    request_id: 'req-1',
    visit_id: null,
    kind: 'milestone',
    relationship_label: 'friend',
    event_kind: null,
    day: '1',
    time_period: '白昼',
    period_serial: 1,
    summary: '合法摘要',
    significance: 2,
    active: 0,
    source_revision: 'gal-memory-archive-v1',
    content_hash: 'deadbeef',
  };
  for (const row of [
    { ...base, archive_key: 'wrong' },
    { ...base, content_hash: 'xyz' },
    { ...base, source_revision: 'old' },
    { ...base, relationship_label: 'nemesis' },
    { ...base, event_kind: 'exploit' },
    { ...base, time_period: 'morning' },
    { ...base, request_id: 'bad request id' },
    { ...base, summary: '<img src=x onerror=alert(1)>' },
  ]) {
    assert.equal(relationshipRowToCandidate(row, scopeId).ok, false);
  }
});

test('B4-T03: 召回预算常量符合 O02 裁定', () => {
  assert.equal(STORY_RECALL_PER_CHARACTER, 24);
  assert.equal(RELATIONSHIP_RECALL_PER_CHARACTER, 12);
});
