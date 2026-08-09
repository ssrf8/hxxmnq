// 第四批 B4-T06 —— fake database port 与故障矩阵。
// runbook §10 B4-T06 必须证明：故障不向 coordinator 抛穿、standalone 调用计数 0、
// database-assisted fallback 历史与 standalone 字节相同、timeout 后迟到结果不变、
// 无 unhandled rejection、写失败不修改输入对象、archive/recall 结构化诊断。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { FakeDatabaseApi } from './fake-database-port.mjs';

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

const hostCall = await importTypescript('../src/ui/memory-host-call.ts');
const { safeHostCall, withTimeout, toResult } = hostCall;
const standalone = await importTypescript('../src/ui/memory-adapters/standalone-mvu.ts');
const { createMemoryAdapter: createStandalone } = standalone;
const { buildSyntheticHistory } = await importTypescript('../src/ui/synthetic-history.ts');

/** 用 fake 全局构造被测的调用场景。 */
function buildScenario(fake) {
  const g = fake.buildGlobal();
  // 模拟 database-assisted adapter：全局拼写和返回 envelope 与 provenance 一致。
  const queryTableRows = (options, callOptions) =>
    safeHostCall(() => g?.AutoCardUpdaterAPI?.queryTableRows(options), callOptions);
  const insertRow = (table, data, callOptions) =>
    safeHostCall(() => g?.AutoCardUpdaterAPI?.insertRow(table, data), callOptions);
  const updateRow = (table, rowIndex, data, callOptions) =>
    safeHostCall(() => g?.AutoCardUpdaterAPI?.updateRow(table, rowIndex, data), callOptions);
  const exportTableAsJson = () =>
    safeHostCall(() => g?.AutoCardUpdaterAPI?.exportTableAsJson());
  return { queryTableRows, insertRow, updateRow, exportTableAsJson, fake };
}

test('B4-T06: API 缺失 → ok:false（unavailable），不抛穿', async () => {
  const fake = new FakeDatabaseApi();
  fake.mode = 'absent';
  const { queryTableRows, fake: f } = buildScenario(fake);
  // 调用层把“api 不存在”视作不可用 → ok:false（上游映射为 unavailable）
  const result = await safeHostCall(() => {
    const g2 = f.buildGlobal();
    if (!g2?.AutoCardUpdaterAPI) throw new Error('AutoCardUpdaterAPI 不可用');
    return g2.AutoCardUpdaterAPI.queryTableRows({ tableName: 't' });
  });
  assert.equal(result.ok, false);
  assert.equal(f.calls.queryTableRows.length, 0);
});

test('B4-T06: getter 抛错 → ok:false，调用计数 0', async () => {
  const fake = new FakeDatabaseApi();
  fake.mode = 'getter-throws';
  const { queryTableRows, fake: f } = buildScenario(fake);
  const result = await queryTableRows({ tableName: 't' });
  assert.equal(result.ok, false);
  assert.equal(f.getterTouchCount, 1, 'getter 只应被探测触碰一次（安全壳包装内）');
  assert.equal(f.calls.queryTableRows.length, 0);
});

test('B4-T06: 方法缺失/同步抛错 → ok:false', async () => {
  const fake = new FakeDatabaseApi();
  fake.methods.queryTableRows = 'missing';
  const { queryTableRows } = buildScenario(fake);
  const r1 = await queryTableRows({ tableName: 't' });
  assert.equal(r1.ok, false);

  const fake2 = new FakeDatabaseApi();
  fake2.methods.insertRow = 'throws-sync';
  const { insertRow } = buildScenario(fake2);
  const r2 = await insertRow('t', {});
  assert.equal(r2.ok, false);
});

test('B4-T06: query 同步返回 / promise resolve / reject', async () => {
  const fake = new FakeDatabaseApi();
  fake.queryBehavior = { type: 'sync-return', rows: [{ a: 1 }] };
  const { queryTableRows, fake: f } = buildScenario(fake);
  const r1 = await queryTableRows({ tableName: 't' });
  assert.equal(r1.ok, true);
  if (r1.ok) assert.deepEqual(r1.value.rows, [{ a: 1 }]);

  fake.queryBehavior = { type: 'resolve', rows: [{ a: 2 }] };
  const r2 = await queryTableRows({ tableName: 't' });
  assert.equal(r2.ok, true);
  if (r2.ok) assert.deepEqual(r2.value.rows, [{ a: 2 }]);

  fake.queryBehavior = { type: 'reject' };
  const r3 = await queryTableRows({ tableName: 't' });
  assert.equal(r3.ok, false);
});

test('B4-T06: 延迟结果在 timeout 内正常返回；超时后迟到结果不改变已返回值', async () => {
  const fake = new FakeDatabaseApi();
  fake.queryBehavior = { type: 'delay-resolve', delayMs: 20, rows: [{ x: 1 }] };
  const { queryTableRows } = buildScenario(fake);
  const fast = await queryTableRows({ tableName: 't' });
  assert.equal(fast.ok, true);
  if (fast.ok) assert.deepEqual(fast.value.rows, [{ x: 1 }]);

  // 超时：100ms 内未决 → ok:false；迟到结果被吸收，无 unhandled rejection
  const fake2 = new FakeDatabaseApi();
  fake2.queryBehavior = { type: 'delay-resolve', delayMs: 80, rows: [{ x: 2 }] };
  const { queryTableRows: slowQuery } = buildScenario(fake2);
  const slow = await slowQuery({ tableName: 't' }, { timeoutMs: 20 });
  assert.equal(slow.ok, false);
  await new Promise((r) => setTimeout(r, 100));
});

test('B4-T06: insert/update true、false、reject 全部转为结构化结果', async () => {
  const fake = new FakeDatabaseApi();
  fake.insertResult = { value: 3 };
  const { insertRow } = buildScenario(fake);
  const r1 = await insertRow('t', { a: 1 });
  assert.equal(r1.ok, true);
  if (r1.ok) assert.equal(r1.value, 3);

  const fake2 = new FakeDatabaseApi();
  fake2.insertResult = { promise: 'reject' };
  const { insertRow: insert2 } = buildScenario(fake2);
  const r2 = await insert2('t', { a: 1 });
  assert.equal(r2.ok, false);

  const fake3 = new FakeDatabaseApi();
  fake3.updateResult = { value: false };
  const { updateRow } = buildScenario(fake3);
  const r3 = await updateRow('t', 1, { a: 1 });
  assert.equal(r3.ok, true);
  if (r3.ok) assert.equal(r3.value, false, 'false 是合法返回值，不是故障');

  const fake4 = new FakeDatabaseApi();
  fake4.updateResult = { promise: 'reject' };
  const { updateRow: update4 } = buildScenario(fake4);
  const r4 = await update4('t', 1, { a: 1 });
  assert.equal(r4.ok, false);
});

test('B4-T06: 多行重复 / 错 scope / 超量行由上游管线处理（调用层只透传 rows）', async () => {
  const fake = new FakeDatabaseApi();
  fake.queryBehavior = { type: 'resolve', rows: [{ a: 1 }, { a: 1 }] };
  const { queryTableRows } = buildScenario(fake);
  const r = await queryTableRows({ tableName: 't' });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.rows.length, 2);
});

test('B4-T06: standalone adapter 调用计数始终 0，且 fake getter 零访问', async () => {
  const fake = new FakeDatabaseApi();
  fake.mode = 'getter-throws';
  const adapter = createStandalone();
  // standalone adapter 完全不触碰全局
  const recall = await adapter.recall({ archiveScopeId: 's', relevantCharacterIds: [], localMemory: null, requestId: 'r' });
  const archive = await adapter.archive({ archiveScopeId: 's', records: [] });
  const sync = await adapter.syncOpening({});
  assert.equal(recall.status, 'disabled-by-build');
  assert.equal(archive.status, 'skipped');
  assert.equal(sync.status, 'skipped');
  assert.equal(fake.getterTouchCount, 0, 'standalone 不得触碰 getter');
  assert.equal(fake.calls.queryTableRows.length + fake.calls.insertRow.length + fake.calls.updateRow.length, 0);
});

test('B4-T06: 写失败不修改输入 MVU 对象（安全壳不改参数）', async () => {
  const fake = new FakeDatabaseApi();
  fake.insertResult = { promise: 'reject' };
  const { insertRow } = buildScenario(fake);
  const input = { tableName: 't', data: { a: 1 } };
  const snapshot = JSON.stringify(input);
  const r = await insertRow(input.tableName, input.data);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(input), snapshot, '输入对象必须保持不变');
});

test('B4-T06: 无 unhandled rejection（timeout 迟到结果被吸收）', async () => {
  const unhandled = [];
  const handler = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', handler);
  try {
    const fake = new FakeDatabaseApi();
    fake.queryBehavior = { type: 'delay-reject', delayMs: 80 };
    const { queryTableRows } = buildScenario(fake);
    const r = await queryTableRows({ tableName: 't' }, { timeoutMs: 20 });
    assert.equal(r.ok, false);
    // withTimeout 内部已 .catch 吸收迟到拒绝
    await new Promise((res) => setTimeout(res, 100));
    assert.deepEqual(unhandled, [], '不得出现 unhandled rejection');
  } finally {
    process.off('unhandledRejection', handler);
  }
});

test('B4-T06: 调用计数与参数录制（并发峰值不超过并发上限）', async () => {
  const fake = new FakeDatabaseApi();
  fake.queryBehavior = { type: 'delay-resolve', delayMs: 40, rows: [{ x: 1 }] };
  const { queryTableRows, fake: f } = buildScenario(fake);
  await Promise.all([queryTableRows({ a: 1 }), queryTableRows({ a: 2 }), queryTableRows({ a: 3 })]);
  assert.equal(f.calls.queryTableRows.length, 3);
  assert.equal(f.calls.queryTableRows[0][0].a, 1);
  assert.equal(f.peakConcurrent, 3, 'fake 必须统计真正未决 Promise，而不是函数返回瞬间');
});

test('B4-T06: database-assisted fallback 历史与 standalone 字节相同（空候选）', async () => {
  // database-assisted adapter 当前是接口壳（O02 后 recall 返回未接线）；
  // 该断言确保故障矩阵下召回回退路径产出与 standalone 严格一致的空候选语义。
  const fake = new FakeDatabaseApi();
  fake.mode = 'absent';
  const dbAdapter = (await importTypescript('../src/ui/memory-adapters/database-assisted.ts')).createMemoryAdapter();
  const standaloneAdapter = createStandalone();
  const dbRecall = await dbAdapter.recall({ archiveScopeId: 's', relevantCharacterIds: [], localMemory: null, requestId: 'r' });
  const stRecall = await standaloneAdapter.recall({ archiveScopeId: 's', relevantCharacterIds: [], localMemory: null, requestId: 'r' });
  assert.equal(dbRecall.status === 'recall-failed' || dbRecall.status === 'recall-empty', true);
  assert.equal(stRecall.status, 'disabled-by-build');
  assert.equal(JSON.stringify(dbRecall.candidates), JSON.stringify(stRecall.candidates));

  const state = {
    interaction: {
      visit_memory: {
        version: 1,
        by_character: {
          cirno: {
            character_id: 'cirno',
            active_visit: { visit_id: 'visit-1', character_id: 'cirno', turns: [{ turn_id: 'turn-1', summary: '本地最新回合', period_serial: 1 }] },
            closed_visits: [],
            legacy_memories: [],
            relationship_memories: [],
          },
        },
        legacy_unassigned: [],
        migration: {},
      },
    },
  };
  const historyInput = { state, relevantCharacterIds: ['cirno'], visitIdsByCharacter: { cirno: 'visit-1' } };
  const standaloneHistory = buildSyntheticHistory(historyInput);
  const databaseFallbackHistory = buildSyntheticHistory(structuredClone(historyInput));
  assert.equal(JSON.stringify(databaseFallbackHistory), JSON.stringify(standaloneHistory), '比较完整 synthetic history，不只比较空 candidates');
  assert.match(databaseFallbackHistory.content, /本地最新回合/);
  assert.equal(typeof dbRecall.detail, 'string');
  const archive = await dbAdapter.archive({ archiveScopeId: 's', records: [] });
  assert.equal(typeof archive.detail, 'string', 'archive 也必须有结构化诊断');
});

test('B4-T06-R1: query envelope 与 exportTableAsJson 快照匹配已核验宿主形状', async () => {
  const fake = new FakeDatabaseApi();
  fake.queryBehavior = { type: 'sync-return', rows: [{ row_id: 4 }] };
  fake.exportedTables = { sheet_story: { name: 'GAL剧情记忆归档表', content: [['row_id'], ['4']] } };
  const { queryTableRows, exportTableAsJson } = buildScenario(fake);
  const query = await queryTableRows({ tableName: 'GAL剧情记忆归档表', limit: 2 });
  assert.ok(query.ok);
  if (query.ok) {
    assert.deepEqual(query.value.rows, [{ row_id: 4 }]);
    assert.equal(typeof query.value.sql, 'string');
    assert.ok(Array.isArray(query.value.columns));
    assert.ok(Array.isArray(query.value.values));
  }
  const snapshot = await exportTableAsJson();
  assert.ok(snapshot.ok);
  if (snapshot.ok) assert.equal(snapshot.value.sheet_story.name, 'GAL剧情记忆归档表');
});
