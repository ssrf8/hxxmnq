import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

async function load(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const schema = await load('../src/ui/save-schema.ts');
const capture = await load('../src/ui/save-capture.ts');

function payload(message = '中文🙂'.repeat(9000)) {
  return {
    schema: 'gensokyo-save.v1', slotId: 'manual-01', label: '第一天', capturedAt: '2026-08-09T00:00:00.000Z', appSchemaVersion: '0.2.0', messageCount: 1,
    messages: [{ role: 'assistant', name: '灵梦', is_hidden: false, message, data: { stat_data: { day: 1 } } }],
    mvu: { initialized_lorebooks: ['x'], stat_data: { day: 1 }, unknown: { kept: true } },
  };
}

test('UTF-8 分块不切断中文或 emoji，往返逐字节一致', async () => {
  const original = payload();
  const encoded = await schema.encodeSavePayload(original);
  assert.ok(encoded.chunks.length > 1);
  assert.ok(encoded.chunks.every((chunk) => schema.utf8ByteLength(chunk) <= schema.SAVE_CHUNK_BYTES));
  assert.deepEqual(await schema.decodeSavePayload(encoded.meta, encoded.chunks), original);
});

test('checksum、byteLength、messageCount 任一损坏均拒绝', async () => {
  const encoded = await schema.encodeSavePayload(payload('短消息'));
  await assert.rejects(() => schema.decodeSavePayload({ ...encoded.meta, byteLength: encoded.meta.byteLength + 1 }, encoded.chunks));
  await assert.rejects(() => schema.decodeSavePayload({ ...encoded.meta, checksum: `sha256:${'0'.repeat(64)}` }, encoded.chunks));
  const dirty = JSON.parse(encoded.chunks.join(''));
  dirty.messageCount = 2;
  const dirtyJson = JSON.stringify(dirty);
  const dirtyChecksum = await schema.sha256(dirtyJson);
  await assert.rejects(() => schema.decodeSavePayload({ ...encoded.meta, chunkCount: 1, byteLength: schema.utf8ByteLength(dirtyJson), checksum: dirtyChecksum }, [dirtyJson]));
});

test('捕获只保留楼层白名单并深克隆完整 MVU', () => {
  const sourceMessage = { message_id: 9, role: 'assistant', name: '灵梦', is_hidden: true, message: '正文', data: { stat_data: { coin: 3 } }, extra: { requestId: 'forbidden' }, swipes: ['forbidden'] };
  const sourceMvu = { initialized_lorebooks: ['a'], stat_data: { coin: 3 }, display_data: { x: 1 }, future_field: { kept: true } };
  const result = capture.captureSavePayload({ currentChatId: () => 'chat-a', listMessages: () => [sourceMessage], readMvuData: () => sourceMvu, now: () => '2026-08-09T00:00:00.000Z', appSchemaVersion: () => '0.2.0' }, 'manual-01', ' 测试 ');
  assert.deepEqual(Object.keys(result.messages[0]), ['role', 'name', 'is_hidden', 'message', 'data']);
  assert.equal(result.messages[0].extra, undefined);
  assert.equal(result.messages[0].swipes, undefined);
  assert.deepEqual(result.mvu.future_field, { kept: true });
  sourceMvu.stat_data.coin = 99;
  assert.equal(result.mvu.stat_data.coin, 3);
});

test('捕获期间聊天边界变化会拒绝', () => {
  let call = 0;
  assert.throws(() => capture.captureSavePayload({ currentChatId: () => 'chat-a', listMessages: () => call++ ? [{ message_id: 2, role: 'user', message: 'b' }] : [{ message_id: 1, role: 'user', message: 'a' }], readMvuData: () => ({ stat_data: {} }), now: () => new Date().toISOString(), appSchemaVersion: () => '1' }, 'manual-01', '测试'));
});

test('读取 payload 时再次白名单化消息，不允许夹带旧事务或 swipe 字段', () => {
  const dirty = payload('正文');
  dirty.messages[0].extra = { requestId: 'forbidden' };
  dirty.messages[0].swipes = ['forbidden'];
  const clean = schema.validateSavePayload(dirty);
  assert.deepEqual(Object.keys(clean.messages[0]), ['role', 'name', 'is_hidden', 'message', 'data']);
});
