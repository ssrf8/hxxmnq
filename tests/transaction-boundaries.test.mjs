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
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const generation = await importTypescript('../src/ui/gal-generation-request.ts');
const coordination = await importTypescript('../src/ui/async-coordination.ts');

test('重新生成只接受聊天最后一层 assistant', () => {
  assert.deepEqual(generation.resolveLatestAssistantForRegeneration([
    { role: 'user', message_id: 1 },
    { role: 'assistant', message_id: 2 },
  ]), { ok: true, messageId: 2 });
  assert.deepEqual(generation.resolveLatestAssistantForRegeneration([
    { role: 'assistant', message_id: 2 },
    { role: 'user', message_id: 3 },
  ]), { ok: false, code: 'latest-not-assistant' });
  assert.deepEqual(generation.resolveLatestAssistantForRegeneration([]), { ok: false, code: 'empty-chat' });
});

test('MVU 等待不把预填 stat_data 当作完成证据', () => {
  const base = { updateEpoch: 4, baselineEpoch: 4, assistantObservedAt: 1000 };
  assert.equal(coordination.isVariableStageReady({ ...base, isAnalyzing: false, now: 1200 }), false);
  assert.equal(coordination.isVariableStageReady({ ...base, isAnalyzing: true, now: 5000 }), false);
  assert.equal(coordination.isVariableStageReady({ ...base, isAnalyzing: false, now: 3500 }), true);
  assert.equal(coordination.isVariableStageReady({ ...base, updateEpoch: 5, isAnalyzing: true, now: 1100 }), true);
});
