// 第二批 B2-T05 —— VisitTurn 确定性构造器。
// 覆盖 runbook §3.7：台词提取、无台词兜底、不相关角色跳过、80–100 字摘要、
// turn_id=requestId:characterId、空/畸形正文拒绝、协议/标签清洗、
// 确定性（同输入同输出）、不解析 UpdateVariable、不创建 RelationshipMemory。
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

const vtc = await importTypescript('../src/ui/visit-turn-commit.ts');

const baseInput = (overrides = {}) => ({
  request: {
    requestId: 'gal-req-1',
    sceneId: 'scene:demo',
    relevantCharacterIds: ['reimu', 'marisa'],
    visitIdsByCharacter: { reimu: 'character_visit_000001', marisa: 'character_visit_000002' },
    visibleUserText: '你在这里做什么？',
  },
  attempt: {
    attemptId: 'gal-req-1:attempt-1',
    commitKey: 'gal-req-1:gal-req-1:attempt-1',
    assistantMessageId: 55,
    assistantSwipeId: null,
  },
  clock: { day: 1, time_period: '清晨', period_serial: 1 },
  acceptedOutput: [
    '<bginfor>这是元信息。</bginfor>',
    '<GensokyoScene>{"beats":[]}</GensokyoScene>',
    '【庭园正文开始】',
    '<narration>灵梦正靠在神社的柱子上。</narration>',
    '<dialogue char="reimu">我在想今晚的晚饭。</dialogue>',
    '<dialogue char="marisa">帮我看看魔法的书！</dialogue>',
    '【庭园正文结束】',
    '<UpdateVariable><JSONPatch op="add" path="/interaction/conversation_log/-" value="不该算摘要"/></UpdateVariable>',
  ].join('\n'),
  characterNames: { reimu: '博丽灵梦', marisa: '雾雨魔理沙' },
  ...overrides,
});

// ---- 台词提取与摘要格式 ----
test('有台词：玩家段 + 角色名 + 该角色台词，turn_id=requestId:characterId', () => {
  const result = vtc.buildVisitTurnCommit(baseInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.turns.length, 2);
  const reimu = result.turns.find((turn) => turn.character_id === 'reimu');
  assert.equal(reimu.turn_id, 'gal-req-1:reimu');
  assert.match(reimu.summary, /玩家行动：你在这里做什么/);
  assert.match(reimu.summary, /博丽灵梦回应：我在想今晚的晚饭/);
  assert.ok(reimu.summary.length >= vtc.TURN_SUMMARY_MIN_CHARS);
  assert.ok(reimu.summary.length <= vtc.TURN_SUMMARY_CHARS);
  assert.equal(reimu.day, 1);
  assert.equal(reimu.time_period, '清晨');
});

test('多条台词按出现顺序合并，台词去内嵌标签', () => {
  const result = vtc.buildVisitTurnCommit(baseInput({
    acceptedOutput: [
      '【庭园正文开始】',
      '<dialogue char="reimu">第一条。</dialogue>',
      '<dialogue char="reimu">第二条<em>强调</em>。</dialogue>',
      '【庭园正文结束】',
    ].join('\n'),
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const reimu = result.turns.find((turn) => turn.character_id === 'reimu');
  assert.match(reimu.summary, /博丽灵梦回应：第一条。；第二条强调。/);
});

// ---- 无台词兜底 ----
test('无台词但属主目标/显式参与者：用清洗后的正文兜底', () => {
  const result = vtc.buildVisitTurnCommit(baseInput({
    acceptedOutput: [
      '【庭园正文开始】',
      '<narration>少女们沉默地站在月光下，气氛微妙。</narration>',
      '<dialogue char="marisa">我先走了。</dialogue>',
      '【庭园正文结束】',
    ].join('\n'),
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const reimu = result.turns.find((turn) => turn.character_id === 'reimu');
  const marisa = result.turns.find((turn) => turn.character_id === 'marisa');
  assert.match(reimu.summary, /现场经过：/);
  assert.match(reimu.summary, /月光下/);
  assert.match(marisa.summary, /雾雨魔理沙回应：我先走了/);
  assert.equal(result.diagnostics.charactersWithoutDialogue.includes('reimu'), true);
});

// ---- 不相关角色跳过（诊断记录） ----
test('不相关角色台词不产生 turn，只进诊断', () => {
  const result = vtc.buildVisitTurnCommit(baseInput({
    request: {
      requestId: 'gal-req-1',
      sceneId: 'scene:demo',
      relevantCharacterIds: ['reimu', 'marisa'],
      visitIdsByCharacter: { reimu: 'character_visit_000001', marisa: null },
      visibleUserText: '你在这里做什么？',
    },
    acceptedOutput: [
      '【庭园正文开始】',
      '<dialogue char="reimu">你好。</dialogue>',
      '<dialogue char="cirno">我是琪露诺！</dialogue>',
      '【庭园正文结束】',
    ].join('\n'),
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0].character_id, 'reimu');
  assert.deepEqual(result.diagnostics.skippedCharacters, ['cirno']);
});

// ---- visit ID null 的角色不写 turn ----
test('visit ID 为 null 的相关角色不写 turn（无可提交 turn 为正常结果，非生成失败）', () => {
  const result = vtc.buildVisitTurnCommit(baseInput({
    request: {
      requestId: 'gal-req-1',
      sceneId: 'scene:demo',
      relevantCharacterIds: ['reimu'],
      visitIdsByCharacter: { reimu: null },
      visibleUserText: '你好',
    },
  }));
  // R0 裁定：无可提交 turn 是正常结果（ok:true + 空 turns），供无记忆提交路径使用。
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.turns, []);
});

// ---- 80–100 字召回摘要 ----
test('summary 保持 80–100 字（玩家/台词段各自截断）', () => {
  const longPlayer = '玩家说了一句很长的话。'.repeat(30);
  const longLine = '非常长的台词。'.repeat(40);
  const result = vtc.buildVisitTurnCommit(baseInput({
    request: {
      requestId: 'gal-req-1',
      sceneId: null,
      relevantCharacterIds: ['reimu'],
      visitIdsByCharacter: { reimu: 'character_visit_000001' },
      visibleUserText: longPlayer,
    },
    acceptedOutput: ['【庭园正文开始】', `<dialogue char="reimu">${longLine}</dialogue>`, '【庭园正文结束】'].join('\n'),
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.turns[0].summary.length >= vtc.TURN_SUMMARY_MIN_CHARS);
  assert.ok(result.turns[0].summary.length <= vtc.TURN_SUMMARY_CHARS);
});

// ---- 空/畸形正文拒绝 ----
test('空输出 / 无正文段 / 正文未闭合 均不写 turn', () => {
  const empty = vtc.buildVisitTurnCommit(baseInput({ acceptedOutput: '   ' }));
  assert.equal(empty.ok, false);
  assert.equal(empty.code, 'empty-output');

  const noBody = vtc.buildVisitTurnCommit(baseInput({ acceptedOutput: '<dialogue char="reimu">你好</dialogue>' }));
  assert.equal(noBody.ok, false);
  assert.equal(noBody.code, 'malformed-output');

  const unclosed = vtc.buildVisitTurnCommit(baseInput({ acceptedOutput: '【庭园正文开始】<dialogue char="reimu">你好</dialogue>' }));
  assert.equal(unclosed.ok, false);
  assert.equal(unclosed.code, 'malformed-output');

  const emptyBody = vtc.buildVisitTurnCommit(baseInput({ acceptedOutput: '【庭园正文开始】\n【庭园正文结束】' }));
  assert.equal(emptyBody.ok, false);
  assert.equal(emptyBody.code, 'empty-output');
});

// ---- 协议/标签清洗 ----
test('UpdateVariable/Presence/Scene/HTML 不进入摘要', () => {
  const result = vtc.buildVisitTurnCommit(baseInput({
    acceptedOutput: [
      '<GensokyoPresence>{"present":["reimu"]}</GensokyoPresence>',
      '【庭园正文开始】',
      '<dialogue char="reimu">这段<em>才算</em>正文。</dialogue>',
      '【庭园正文结束】',
      '<UpdateVariable>{"conversation_log":["不该出现"]}</UpdateVariable>',
    ].join('\n'),
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.turns[0].summary, /这段才算正文/);
  assert.doesNotMatch(result.turns[0].summary, /UpdateVariable|conversation_log|GensokyoPresence/);
});

// ---- 确定性 ----
test('同一输入重复运行逐字节相同（不读现实时间）', () => {
  const a = vtc.buildVisitTurnCommit(baseInput());
  const b = vtc.buildVisitTurnCommit(baseInput());
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = vtc.buildVisitTurnCommit(baseInput({
    acceptedOutput: '【庭园正文开始】\n<narration>夜风。</narration>\n【庭园正文结束】',
  }));
  const d = vtc.buildVisitTurnCommit(baseInput({
    acceptedOutput: '【庭园正文开始】\n<narration>夜风。</narration>\n【庭园正文结束】',
  }));
  assert.equal(JSON.stringify(c), JSON.stringify(d));
});

// ---- 不创建 RelationshipMemory / 纯函数 ----
test('返回对象只含 turns 与诊断，不含任何记忆写入副作用', () => {
  const result = vtc.buildVisitTurnCommit(baseInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const keys = Object.keys(result.turns[0]).sort();
  assert.deepEqual(keys, [
    'character_id', 'day', 'summary', 'time_period', 'turn_id',
  ].sort());
});

// ---- 便捷构造 refs ----
test('visitTurnCommitRefs 映射不丢字段', () => {
  const refs = vtc.visitTurnCommitRefs(
    {
      requestId: 'gal-req-2',
      sceneId: 'scene:x',
      relevantCharacterIds: ['cirno'],
      visitIdsByCharacter: { cirno: 'character_visit_000003' },
      visibleUserText: '测试',
    },
    {
      attemptId: 'gal-req-2:attempt-1',
      commitKey: 'gal-req-2:gal-req-2:attempt-1',
      assistantMessageId: 60,
      assistantSwipeId: 1,
    },
  );
  assert.equal(refs.request.requestId, 'gal-req-2');
  assert.equal(refs.attempt.assistantSwipeId, 1);
  assert.equal(refs.request.visitIdsByCharacter.cirno, 'character_visit_000003');
});
