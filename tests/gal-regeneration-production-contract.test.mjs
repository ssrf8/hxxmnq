import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = await readFile(
  fileURLToPath(new URL('../src/ui/bridge.ts', import.meta.url)),
  'utf8',
);

test('T09：事务 transport 显式 opt-in，默认 native，且共用 V2 config builder', () => {
  assert.match(source, /__GAL_REGENERATION_TRANSPORT__ === 'helper-generate-swipe'/u);
  assert.match(source, /: 'native-regenerate';/u);
  assert.match(source, /buildGalGenerateConfig\(request, \{ generationId \}\)/u);
  assert.match(source, /new GalRegenerationCoordinatorV1\(createRegenerationPorts\(\)\)/u);
});

test('O02/O03：frozen clone 经 parseMessage，指定 swipe 五字段一次 setChatMessages', () => {
  assert.match(source, /stagedBase\.stat_data = stageVisitSummaryTask\(baselineState, replayContext\.request\)/u);
  assert.match(source, /mvu\.parseMessage\(text, stagedBase\)/u);
  const writer = source.slice(source.indexOf('async writeSwipe(plan)'), source.indexOf('stopCandidate(generationId)'));
  for (const field of ['message_id:', 'swipe_id:', 'swipes:', 'swipes_data:', 'swipes_info:']) {
    assert.ok(writer.includes(field), `writer missing ${field}`);
  }
  assert.match(writer, /refresh: 'affected'/u);
  assert.doesNotMatch(writer, /triggerSlash|createChatMessages|context\.chat|dispatchEvent/u);
});

test('T10：恢复按 chat+owner 隔离，并持久化 coordinator state', () => {
  assert.match(source, /gal\.regeneration\.v1:\$\{currentChatId\(\)\}:\$\{String\(g\.SillyTavern/u);
  assert.match(source, /sessionStorage\?\.setItem\(regenerationStorageKey\(\), JSON\.stringify\(state\)\)/u);
  assert.match(source, /state\.target\.chatId !== currentChatId\(\)/u);
  assert.match(source, /state\.target\.ownerCharacterId !== owner/u);
});

test('T11：外部 MESSAGE_UPDATED/MESSAGE_SWIPED 分支只刷新，不接生成或结算 writer', () => {
  const subscribeStart = source.indexOf('async subscribe(refresh)');
  const chatChanged = source.indexOf("subscribe(g.tavern_events?.CHAT_CHANGED", subscribeStart);
  const passive = source.slice(subscribeStart, chatChanged);
  assert.match(passive, /subscribe\(g\.tavern_events\?\.MESSAGE_UPDATED\);/u);
  assert.match(passive, /subscribe\(g\.tavern_events\?\.MESSAGE_SWIPED\);/u);
  assert.doesNotMatch(passive, /generateCandidate|writeSwipe|finalizeAcceptedAssistant|replaceMvuData|setChatMessages/u);
});
