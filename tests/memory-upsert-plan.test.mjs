// 第四批 B4-T04 —— 稳定键、content hash 与 upsert plan。
// runbook §10 B4-T04 苦力测试矩阵：2 种记录 × 6 种查询返回 × 3 种 hash 状态 × 2 种 row identity 状态。
// 完成门：同一 MVU 记录重复规划 100 次，只出现第一次 insert，之后全部 skip/update，不出现第二个 insert。
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
const upsert = await importTypescript('../src/ui/memory-upsert-plan.ts');

const { buildArchiveScopeId, buildArchiveKey, buildContentHash } = schema;
const { planUpsert, buildStoryInsertRow, buildRelationshipInsertRow, resolveSafeRowIdentity } = upsert;

const SCOPE = buildArchiveScopeId({ ownerCharacterId: '卡主', chatId: 'chat-abc' });
assert.ok(SCOPE.ok);
const scopeId = SCOPE.ok ? SCOPE.archiveScopeId : '';

const storyRecord = {
  archiveSchemaVersion: 'gal-memory-archive.v1',
  archiveKey: buildArchiveKey({ archiveScopeId: scopeId, kind: 'story', stableId: 'turn-1' }),
  archiveScopeId: scopeId,
  memoryId: 'turn-1',
  characterId: 'cirno',
  visitId: 'visit-1',
  requestId: 'req-1',
  sceneId: null,
  day: '3',
  timePeriod: '清晨',
  periodSerial: 2,
  summary: '路过雾之湖。',
  sourceRevision: 'gal-memory-archive-v1',
  contentHash: 'aaaaaaaa',
};

const relRecord = {
  archiveSchemaVersion: 'gal-memory-archive.v1',
  archiveKey: buildArchiveKey({ archiveScopeId: scopeId, kind: 'relationship', stableId: 'rel-1' }),
  archiveScopeId: scopeId,
  relationshipMemoryId: 'rel-1',
  characterId: 'cirno',
  visitId: 'visit-2',
  requestId: 'req-2',
  kind: 'milestone',
  relationshipLabel: 'friend',
  eventKind: null,
  day: '5',
  timePeriod: '黄昏',
  periodSerial: 1,
  summary: '约定看流星。',
  significance: 2,
  active: true,
  sourceRevision: 'gal-memory-archive-v1',
  contentHash: 'bbbbbbbb',
};

const STORY_CONTENT = 'summary=路过雾之湖。|day=3|timePeriod=morning|periodSerial=2';
const REL_CONTENT = 'summary=约定看流星。|day=5|timePeriod=evening|periodSerial=1|kind=milestone|relationshipLabel=friend|eventKind=null|significance=2|active=true';

function existingRows(rows, resolvedRowIndex = 3) {
  return rows.map((r) => ({
    row: { ...r },
    rowId: r.row_id,
    rowIndex: r.row_id === undefined ? undefined : resolvedRowIndex,
  }));
}

// 表驱动矩阵：2 记录 × 6 查询返回 × 3 hash 状态 × 2 row identity 状态
test('B4-T04: upsert plan 表驱动矩阵（2 记录 × 6 返回 × 3 hash × 2 rowId）', () => {
  const records = [
    { label: 'story', record: storyRecord, content: STORY_CONTENT, kind: 'story', stableId: 'turn-1', buildRow: buildStoryInsertRow },
    { label: 'relationship', record: relRecord, content: REL_CONTENT, kind: 'relationship', stableId: 'rel-1', buildRow: buildRelationshipInsertRow },
  ];
  // 查询返回：0 行 / 1 行相同 hash / 1 行不同 hash / 2 行 / 3 行 / 错 scope 1 行
  const hashStatuses = ['same', 'diff', 'missing'];
  const rowIdStatuses = ['with-rowId', 'no-rowId'];
  let assertCount = 0;

  for (const rec of records) {
    const incomingHash = buildContentHash(rec.content);
    for (const hashStatus of hashStatuses) {
      for (const rowIdStatus of rowIdStatuses) {
        const baseRow = {
          archive_scope_id: scopeId,
          archive_key: rec.record.archiveKey,
          content_hash: hashStatus === 'same' ? incomingHash : hashStatus === 'diff' ? 'deadbeef' : undefined,
        };
        const rowId = rowIdStatus === 'with-rowId' ? 7 : undefined;

        // 0 行 → insert
        const zero = planUpsert({
          kind: rec.kind, archiveScopeId: scopeId, stableId: rec.stableId, content: rec.content,
          existingRows: [], rowParams: rec.buildRow(rec.record),
        });
        assert.equal(zero.action, 'insert', `${rec.label}/${hashStatus}/${rowIdStatus}: 0 行应 insert`);
        assert.equal(zero.row.archive_key, rec.record.archiveKey);
        assert.equal(zero.row.content_hash, incomingHash);
        assertCount += 1;

        // 1 行
        const one = planUpsert({
          kind: rec.kind, archiveScopeId: scopeId, stableId: rec.stableId, content: rec.content,
          existingRows: existingRows([{ ...baseRow, row_id: rowId }]),
          rowParams: rec.buildRow(rec.record),
        });
        if (hashStatus === 'same') {
          assert.equal(one.action, 'skip', `${rec.label}/${hashStatus}: 1 行同 hash 应 skip`);
        } else if (rowIdStatus === 'no-rowId') {
          assert.equal(one.action, 'unsafe', `${rec.label}/${hashStatus}: 缺安全行身份不得 update`);
        } else {
          assert.equal(one.action, 'update', `${rec.label}/${hashStatus}: 1 行异/缺 hash 应 update`);
          assert.equal(one.row.content_hash, incomingHash);
          assert.equal(one.targetRowIndex, 3);
        }
        assertCount += 1;

        // 2 行 → duplicate
        const two = planUpsert({
          kind: rec.kind, archiveScopeId: scopeId, stableId: rec.stableId, content: rec.content,
          existingRows: existingRows([{ ...baseRow, row_id: 1 }, { ...baseRow, row_id: 2 }]),
          rowParams: rec.buildRow(rec.record),
        });
        assert.equal(two.action, 'duplicate', `${rec.label}: 2 行应 duplicate`);
        assertCount += 1;

        // 3 行 → unsafe
        const three = planUpsert({
          kind: rec.kind, archiveScopeId: scopeId, stableId: rec.stableId, content: rec.content,
          existingRows: existingRows([{ ...baseRow, row_id: 1 }, { ...baseRow, row_id: 2 }, { ...baseRow, row_id: 3 }]),
          rowParams: rec.buildRow(rec.record),
        });
        assert.equal(three.action, 'unsafe', `${rec.label}: 3 行应 unsafe`);
        assertCount += 1;
      }
    }
    // 错 scope 行不参与匹配
    const wrongScope = planUpsert({
      kind: rec.kind, archiveScopeId: scopeId, stableId: rec.stableId, content: rec.content,
      existingRows: existingRows([{ archive_scope_id: 'gal-scope.v1|owner=1:x|chat=1:y', archive_key: 'wrong', content_hash: 'x' }]),
      rowParams: rec.buildRow(rec.record),
    });
    assert.equal(wrongScope.action, 'unsafe', `${rec.label}: 错 scope 行应 unsafe`);
    assertCount += 1;
  }
  assert.equal(assertCount, 50, '矩阵覆盖数应为 2 记录 × (3 hash × 2 rowId × 4 查询返回 + 1 错 scope)');
});

test('B4-T04: 完成门 —— 同一记录重复规划 100 次只出现一次 insert', () => {
  let inserts = 0;
  let others = 0;
  for (let i = 0; i < 100; i += 1) {
    const plan = planUpsert({
      kind: 'story',
      archiveScopeId: scopeId,
      stableId: 'turn-1',
      content: STORY_CONTENT,
      // 模拟第一次查重 0 行 → insert 后，后续每次查重都返回已写入的 1 行（同 hash）
      existingRows: i === 0
        ? []
        : existingRows([{ archive_scope_id: scopeId, archive_key: storyRecord.archiveKey, content_hash: buildContentHash(STORY_CONTENT), row_id: 3 }]),
      rowParams: buildStoryInsertRow(storyRecord),
    });
    if (plan.action === 'insert') inserts += 1;
    else if (plan.action === 'skip' || plan.action === 'update') others += 1;
    else assert.fail(`不应出现 ${plan.action}`);
  }
  assert.equal(inserts, 1, '100 次重复规划必须只出现 1 次 insert');
  assert.equal(others, 99, '其余 99 次应为 skip/update');
});

test('B4-T04: 内容变化 → update，不变 → skip', () => {
  const incomingHash = buildContentHash(STORY_CONTENT);
  const same = planUpsert({
    kind: 'story', archiveScopeId: scopeId, stableId: 'turn-1', content: STORY_CONTENT,
    existingRows: existingRows([{ archive_scope_id: scopeId, archive_key: storyRecord.archiveKey, content_hash: incomingHash, row_id: 1 }]),
    rowParams: buildStoryInsertRow(storyRecord),
  });
  assert.equal(same.action, 'skip');

  const changed = planUpsert({
    kind: 'story', archiveScopeId: scopeId, stableId: 'turn-1', content: `${STORY_CONTENT}|extra=1`,
    existingRows: existingRows([{ archive_scope_id: scopeId, archive_key: storyRecord.archiveKey, content_hash: incomingHash, row_id: 1 }]),
    rowParams: buildStoryInsertRow(storyRecord),
  });
  assert.equal(changed.action, 'update');
  assert.notEqual(changed.row.content_hash, incomingHash);
});

test('B4-T04: content hash 只判断内容变化，不进入 archive key', () => {
  const key1 = buildArchiveKey({ archiveScopeId: scopeId, kind: 'story', stableId: 'turn-1' });
  const key2 = buildArchiveKey({ archiveScopeId: scopeId, kind: 'story', stableId: 'turn-1' });
  assert.equal(key1, key2);
  assert.ok(!key1.includes(buildContentHash(STORY_CONTENT)));
});

test('B4-T04: 错 scope 行不参与匹配（任何查重结果行）', () => {
  const plan = planUpsert({
    kind: 'relationship', archiveScopeId: scopeId, stableId: 'rel-1', content: REL_CONTENT,
    existingRows: existingRows([{ archive_scope_id: 'other', archive_key: 'other-key', content_hash: 'x', row_id: 1 }]),
    rowParams: buildRelationshipInsertRow(relRecord),
  });
  assert.equal(plan.action, 'unsafe');
});

test('B4-T04-R1: 同 scope 但错误 archive_key 仍必须 unsafe', () => {
  const plan = planUpsert({
    kind: 'story', archiveScopeId: scopeId, stableId: 'turn-1', content: `${STORY_CONTENT}|changed=1`,
    existingRows: existingRows([{ archive_scope_id: scopeId, archive_key: 'WRONG-KEY', content_hash: 'deadbeef', row_id: 9 }]),
    rowParams: buildStoryInsertRow(storyRecord),
  });
  assert.equal(plan.action, 'unsafe');
});

test('B4-T04-R1: export snapshot 按精确表名 + row_id + archive_key 唯一反查', () => {
  const snapshot = {
    sheet_story: {
      name: 'GAL剧情记忆归档表',
      content: [
        ['row_id', 'archive_key', 'summary'],
        ['4', storyRecord.archiveKey, '旧摘要'],
        ['9', 'another-key', '其他摘要'],
      ],
    },
  };
  assert.deepEqual(resolveSafeRowIdentity({
    exportedTables: snapshot,
    tableName: 'GAL剧情记忆归档表',
    rowId: 4,
    archiveKey: storyRecord.archiveKey,
  }), { ok: true, rowId: '4', rowIndex: 1 });

  assert.equal(resolveSafeRowIdentity({
    exportedTables: snapshot,
    tableName: 'GAL剧情记忆归档表',
    rowId: 4,
    archiveKey: 'wrong',
  }).code, 'key-mismatch');
  assert.equal(resolveSafeRowIdentity({
    exportedTables: snapshot,
    tableName: 'GAL剧情记忆归档表',
    rowId: 0,
    archiveKey: storyRecord.archiveKey,
  }).code, 'row-ambiguous');

  const duplicateRow = structuredClone(snapshot);
  duplicateRow.sheet_story.content.push(['4', storyRecord.archiveKey, '重复']);
  assert.equal(resolveSafeRowIdentity({
    exportedTables: duplicateRow,
    tableName: 'GAL剧情记忆归档表',
    rowId: 4,
    archiveKey: storyRecord.archiveKey,
  }).code, 'row-ambiguous');
});
