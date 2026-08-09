import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import test from 'node:test';

test('宿主运行时脚本必须是可直接执行的 JavaScript，不得混入 TypeScript 语法', async () => {
  const source = await readFile(new URL('../src/runtime/ui-host-shell.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Script(source, { filename: 'ui-host-shell.js' }));
});
