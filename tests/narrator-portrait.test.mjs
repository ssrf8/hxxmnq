import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('旁白 beat 不继承活动角色的默认近景图', async () => {
  const app = await read('../src/ui/app.ts');
  const styles = await read('../src/ui/styles.css');
  assert.match(app, /const portraitCharacterId = beat\.speakerId \?\? null;/);
  assert.match(app, /portraitStage\.dataset\.portraitKind = 'narrator';/);
  assert.match(app, /portrait\.removeAttribute\('src'\);/);
  assert.match(app, /portrait\.hidden = true;/);
  assert.match(styles, /data-portrait-kind="narrator"\] #gg-portrait[\s\S]*?display: none/);
});
