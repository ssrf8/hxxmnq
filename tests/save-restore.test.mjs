import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const result = await build({ entryPoints: [fileURLToPath(new URL('../src/ui/save-restore.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22' });
const restore = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

const oldMessages = Array.from({ length: 73 }, (_, i) => ({ message_id: i, role: i % 2 ? 'assistant' : 'user', name: '', is_hidden: false, message: `old-${i}`, data: { floor: i } }));
const targetMessages = Array.from({ length: 62 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', name: '', is_hidden: i === 2, message: `new-${i}`, data: { floor: i, original: true } }));
const target = { schema: 'gensokyo-save.v1', slotId: 'manual-01', label: '测试', capturedAt: '2026-08-09T00:00:00.000Z', appSchemaVersion: '0.2.0', messageCount: targetMessages.length, messages: targetMessages, mvu: { stat_data: { coin: 99 }, unknown: 'kept' } };

function fake(fail = '') {
  let messages = structuredClone(oldMessages);
  let mvu = { stat_data: { coin: 3 }, rollback: true };
  let createCalls = 0;
  let replaceCalls = 0;
  const events = [];
  return {
    currentChatId: () => 'chat-a',
    listMessages: () => structuredClone(messages),
    readMvuData: () => structuredClone(mvu),
    deleteMessages: async (ids) => { events.push(['delete', [...ids]]); messages = messages.filter((_, index) => !ids.includes(index)); if (fail === 'delete') { fail = ''; throw new Error('delete fail'); } },
    createMessages: async (batch) => { createCalls += 1; events.push(['create', batch.map((item) => item.message)]); messages.push(...structuredClone(batch)); if (fail === `create-${createCalls}`) { fail = ''; throw new Error('create fail'); } },
    replaceChatMvu: async (next) => { replaceCalls += 1; events.push(['replace', structuredClone(next)]); mvu = structuredClone(next); if (fail === `replace-${replaceCalls}`) { fail = ''; throw new Error('replace fail'); } },
    clearTransientState: async () => events.push(['clear']),
    reloadCurrentChat: async () => { events.push(['reload']); if (fail === 'reload') { fail = ''; throw new Error('reload fail'); } },
    snapshot: () => ({ messages: structuredClone(messages), mvu: structuredClone(mvu), events }),
  };
}

test('严格按倒序批量删除、原顺序创建、chat MVU 直写并正常只 reload 一次', async () => {
  const adapter = fake();
  const result = await restore.restoreSavePayload(adapter, target);
  const snapshot = adapter.snapshot();
  assert.deepEqual(result, { restoredMessageCount: 62, rollbackUsed: false });
  assert.deepEqual(snapshot.messages.map((item) => ({ role: item.role, name: item.name, is_hidden: item.is_hidden, message: item.message, data: item.data })), targetMessages);
  assert.deepEqual(snapshot.mvu, target.mvu);
  const deleteBatches = snapshot.events.filter(([kind]) => kind === 'delete').map(([, ids]) => ids);
  assert.deepEqual(deleteBatches.map((ids) => ids.length), [50, 23]);
  assert.ok(deleteBatches.flat().every((id, index, all) => index === 0 || all[index - 1] > id));
  assert.deepEqual(snapshot.events.filter(([kind]) => kind === 'create').map(([, batch]) => batch.length), [50, 12]);
  assert.equal(snapshot.events.filter(([kind]) => kind === 'replace').length, 1);
  assert.equal(snapshot.events.filter(([kind]) => kind === 'reload').length, 1);
  assert.ok(snapshot.events.findIndex(([kind]) => kind === 'clear') < snapshot.events.findIndex(([kind]) => kind === 'reload'));
});

for (const failure of ['delete', 'create-1', 'create-2', 'replace-1']) {
  test(`${failure} 失败会恢复原聊天与原 MVU`, async () => {
    const adapter = fake(failure);
    await assert.rejects(() => restore.restoreSavePayload(adapter, target), /已恢复读档前进度/);
    const snapshot = adapter.snapshot();
    assert.deepEqual(snapshot.messages.map((item) => item.message), oldMessages.map((item) => item.message));
    assert.deepEqual(snapshot.mvu, { stat_data: { coin: 3 }, rollback: true });
  });
}

test('正常路径 reload 失败也会回滚后再次 reload', async () => {
  const adapter = fake('reload');
  await assert.rejects(() => restore.restoreSavePayload(adapter, target), /已恢复读档前进度/);
  const snapshot = adapter.snapshot();
  assert.deepEqual(snapshot.messages.map((item) => item.message), oldMessages.map((item) => item.message));
  assert.deepEqual(snapshot.mvu, { stat_data: { coin: 3 }, rollback: true });
  assert.equal(snapshot.events.filter(([kind]) => kind === 'reload').length, 2);
});

test('非法 payload 在第一次 delete 前拒绝', async () => {
  const adapter = fake();
  await assert.rejects(() => restore.restoreSavePayload(adapter, { ...target, messageCount: 999 }));
  assert.equal(adapter.snapshot().events.length, 0);
});

test('实现不依赖 setChatMessages 或最后 assistant 状态锚点', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(fileURLToPath(new URL('../src/ui/save-restore.ts', import.meta.url)), 'utf8'));
  assert.doesNotMatch(source, /setChatMessages/);
  assert.doesNotMatch(source, /lastAssistant|last assistant/i);
  assert.match(source, /replaceChatMvu/);
});
