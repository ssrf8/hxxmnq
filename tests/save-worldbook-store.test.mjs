import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const result = await build({ entryPoints: [fileURLToPath(new URL('../src/ui/save-worldbook-store.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22' });
const store = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

const makePayload = (slotId, label) => ({ schema: 'gensokyo-save.v1', slotId, label, capturedAt: '2026-08-09T00:00:00.000Z', appSchemaVersion: '0.2.0', messageCount: 1, messages: [{ role: 'user', name: '', is_hidden: false, message: label, data: {} }], mvu: { stat_data: { label } } });

function fakeAdapter(initial = []) {
  let entries = structuredClone(initial);
  let updates = 0;
  return {
    getOrCreateChatWorldbook: async () => 'chat-book',
    getWorldbook: async () => structuredClone(entries),
    updateWorldbook: async (_name, updater) => { updates += 1; entries = structuredClone(updater(structuredClone(entries))); return structuredClone(entries); },
    snapshot: () => structuredClone(entries),
    updates: () => updates,
  };
}

test('覆盖同槽只更新一次并逐字节保留其他条目和其他槽', async () => {
  const foreign = { uid: 41, name: 'foreign', enabled: true, content: 'do-not-touch', extra: { custom: { x: 1 } } };
  const adapter = fakeAdapter([foreign]);
  await store.writeSaveSlot(adapter, makePayload('manual-01', '旧档'));
  const slot2Before = makePayload('manual-02', '二号');
  await store.writeSaveSlot(adapter, slot2Before);
  const beforeOverwrite = adapter.snapshot().filter((entry) => entry.extra?.slotId === 'manual-02');
  const updatesBefore = adapter.updates();
  await store.writeSaveSlot(adapter, makePayload('manual-01', '新档'));
  assert.equal(adapter.updates(), updatesBefore + 1);
  assert.deepEqual(adapter.snapshot().find((entry) => entry.uid === 41), foreign);
  assert.deepEqual(adapter.snapshot().filter((entry) => entry.extra?.slotId === 'manual-02'), beforeOverwrite);
  assert.equal((await store.readSaveSlot(adapter, 'manual-01')).label, '新档');
});

test('所有存档条目永久禁用、空关键词、禁递归', async () => {
  const adapter = fakeAdapter();
  await store.writeSaveSlot(adapter, makePayload('manual-01', '测试'));
  for (const entry of adapter.snapshot()) {
    assert.equal(entry.enabled, false);
    assert.deepEqual(entry.strategy.keys, []);
    assert.equal(entry.probability, 0);
    assert.equal(entry.recursion.prevent_incoming, true);
    assert.equal(entry.recursion.prevent_outgoing, true);
  }
});

test('缺 chunk、重复 part、断层均在读取阶段拒绝', async () => {
  const adapter = fakeAdapter();
  await store.writeSaveSlot(adapter, makePayload('manual-01', '测试'));
  const entries = adapter.snapshot();
  const chunk = entries.find((entry) => entry.extra?.kind === 'chunk');
  await assert.rejects(() => store.readSaveSlotFromEntries(entries.filter((entry) => entry !== chunk), 'manual-01'));
  await assert.rejects(() => store.readSaveSlotFromEntries([...entries, structuredClone(chunk)], 'manual-01'));
  const broken = structuredClone(entries);
  broken.find((entry) => entry.extra?.kind === 'chunk').extra.part = 2;
  await assert.rejects(() => store.readSaveSlotFromEntries(broken, 'manual-01'));
});

test('任何存档条目被启用后都拒绝读取', async () => {
  const adapter = fakeAdapter();
  await store.writeSaveSlot(adapter, makePayload('manual-01', '测试'));
  const entries = adapter.snapshot();
  entries[0].enabled = true;
  await assert.rejects(() => store.readSaveSlotFromEntries(entries, 'manual-01'), /永久禁用/);
});
