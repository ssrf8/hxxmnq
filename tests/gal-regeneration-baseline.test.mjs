// 第三批 B3-T04 —— 冻结 baseline reader 的纯解析部分。
// 覆盖 runbook T04 必测：baseline 是 swipe 0/1、active swipe 与 frozen 不同仍精确取、
// 数组缺 data、floor 不存在、mutation 不影响原 fixture、unknown 字段保留、
// 开场边界 null baseline 不造默认状态。
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

const g = await importTypescript('../src/ui/gal-regeneration-baseline.ts');

const mvuData = (day, extra = {}) => ({
  stat_data: { day, player: { money: 100 } },
  display_data: { label: `d${day}` },
  delta_data: {},
  schema: 'gal-mvu.v1',
  initialized_lorebooks: ['core'],
  ...extra,
});

const floorView = (opts = {}) => {
  const { messageId = 99, swipeId = 0, data = [mvuData(1), mvuData(2)] } = opts;
  return {
    message_id: messageId,
    swipe_id: swipeId,
    swipes: ['t0', 't1'],
    swipes_data: data,
    swipes_info: [{}, {}],
  };
};

const read = (overrides = {}) => g.readFrozenBaselineV1({
  stateMessageIdBeforeGeneration: 99,
  stateSwipeIdBeforeGeneration: 0,
  message: floorView(),
  ...overrides,
});

// ---- baseline 是 swipe 0/1 ----
test('baseline 从 swipes_data[0] 精确读取并保留全部字段', () => {
  const result = read();
  assert.equal(result.ok, true);
  assert.deepEqual(result.baseline, mvuData(1));
  assert.equal(result.baseline.stat_data.day, 1);
  assert.equal(result.baseline.schema, 'gal-mvu.v1');
  assert.deepEqual(result.baseline.initialized_lorebooks, ['core']);
});

test('baseline 是 swipe 1（frozen swipe id=1）', () => {
  const result = read({ stateSwipeIdBeforeGeneration: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.baseline, mvuData(2));
});

// ---- active swipe 与 frozen 不同仍精确取 ----
test('active swipe（swipe_id=1）与 frozen swipe（0）不同仍从 swipes_data[0] 精确取', () => {
  const result = read({ message: floorView({ swipeId: 1 }) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.baseline, mvuData(1));
});

// ---- unknown 字段保留 ----
test('unknown 字段保留', () => {
  const data = [mvuData(1, { unknownField: { a: 1 }, extraUnknown: 'keep' }), mvuData(2)];
  const result = read({ message: floorView({ data }) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.baseline.unknownField, { a: 1 });
  assert.equal(result.baseline.extraUnknown, 'keep');
});

// ---- 数组缺 data ----
test('swipes_data[swipe] 缺失 → data-missing', () => {
  const result = read({ message: floorView({ data: [null, mvuData(2)] }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'data-missing');
});

test('swipes_data[swipe] 为 undefined/字符串 → data-missing', () => {
  assert.equal(read({ message: floorView({ data: [undefined, mvuData(2)] }) }).code, 'data-missing');
  assert.equal(read({ message: floorView({ data: ['not-object', mvuData(2)] }) }).code, 'data-missing');
});

// ---- floor 不存在 ----
test('floor 视图缺失 → floor-not-found', () => {
  const result = read({ message: null });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'floor-not-found');
});

test('message_id 与冻结 ID 不一致 → floor-not-found', () => {
  const result = read({ message: floorView({ messageId: 98 }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'floor-not-found');
});

// ---- swipe 越界 ----
test('frozen swipe 越界 → swipe-not-found', () => {
  assert.equal(read({ stateSwipeIdBeforeGeneration: 5 }).code, 'swipe-not-found');
  assert.equal(read({ stateSwipeIdBeforeGeneration: -1 }).code, 'swipe-not-found');
  assert.equal(read({ stateSwipeIdBeforeGeneration: null }).code, 'swipe-not-found');
});

test('swipes_data 非数组 → malformed', () => {
  const result = read({ message: floorView({ data: 'nope' }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'malformed');
});

// ---- mutation 不影响原 fixture ----
test('返回深克隆：mutation 不影响原 fixture（不共享引用）', () => {
  const original = floorView();
  const before = structuredClone(original.swipes_data[0]);
  const result = read({ message: original });
  assert.equal(result.ok, true);
  result.baseline.stat_data.day = 999;
  result.baseline.newField = 'mutated';
  assert.deepEqual(original.swipes_data[0], before);
  assert.notEqual(result.baseline.stat_data.day, original.swipes_data[0].stat_data.day);
});

// ---- 开场边界 ----
test('stateMessageIdBeforeGeneration=null（开场边界）→ baseline null，不造默认状态', () => {
  const result = read({ stateMessageIdBeforeGeneration: null, stateSwipeIdBeforeGeneration: null });
  assert.equal(result.ok, true);
  assert.equal(result.baseline, null);
});
