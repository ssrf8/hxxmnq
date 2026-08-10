// 第二批 B2-T03 —— 相关角色与 visit 快照纯函数。
// 覆盖 runbook §3.4：稳定优先级、去重、登记表过滤、最多 4 人、主目标缺失、
// visit map 冻结、只读不创建、state 输入不变。
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

const cm = await importTypescript('../src/ui/character-memory.ts');

// ---- resolveRelevantCharacterIds：优先级与去重 ----
test('主目标优先，动作 target 次之，事件/session 补足（在场不参与；去重保持稳定顺序）', () => {
  const result = cm.resolveRelevantCharacterIds({
    mainTargetCharacterId: 'reimu',
    actionTargetCharacterId: 'marisa',
    eventParticipants: ['cirno', 'reimu'],
    sessionParticipants: ['alice'],
    presentCharacterIds: ['sakuya', 'marisa'],
    requireMainTarget: true,
  });
  assert.deepEqual(result, { ok: true, characterIds: ['reimu', 'marisa', 'cirno', 'alice'] });
});

test('无主目标但有动作 target 时由动作 target 与显式参与者决定，在场不参与', () => {
  const result = cm.resolveRelevantCharacterIds({
    mainTargetCharacterId: null,
    actionTargetCharacterId: 'cirno',
    presentCharacterIds: ['sakuya', 'suika'],
    requireMainTarget: false,
  });
  assert.deepEqual(result, { ok: true, characterIds: ['cirno'] });
});

test('1–4 层全空时在场集合作为缺省补足', () => {
  const result = cm.resolveRelevantCharacterIds({
    mainTargetCharacterId: null,
    actionTargetCharacterId: null,
    eventParticipants: [],
    sessionParticipants: [],
    presentCharacterIds: ['sakuya', 'suika'],
    requireMainTarget: false,
  });
  assert.deepEqual(result, { ok: true, characterIds: ['sakuya', 'suika'] });
});

test('最多 4 人，超出按稳定顺序截断（在场仅作缺省补足）', () => {
  // 有主目标：在场不参与
  const withMain = cm.resolveRelevantCharacterIds({
    mainTargetCharacterId: 'reimu',
    presentCharacterIds: ['marisa', 'cirno', 'alice', 'mystia', 'suika', 'nitori', 'sakuya'],
    requireMainTarget: true,
  });
  assert.deepEqual(withMain, { ok: true, characterIds: ['reimu'] });
  // 无明确目标：在场按稳定顺序补足，最多 4 人
  const fallback = cm.resolveRelevantCharacterIds({
    mainTargetCharacterId: null,
    presentCharacterIds: ['marisa', 'cirno', 'alice', 'mystia', 'suika', 'nitori', 'sakuya'],
    requireMainTarget: false,
  });
  assert.deepEqual(fallback, { ok: true, characterIds: ['marisa', 'cirno', 'alice', 'mystia'] });
});

// ---- 主目标缺失 ----
test('requireMainTarget 时主目标缺失返回显式错误，不从玩家文字猜', () => {
  const result = cm.resolveRelevantCharacterIds({
    mainTargetCharacterId: null,
    presentCharacterIds: ['reimu'],
    requireMainTarget: true,
  });
  assert.deepEqual(result, { ok: false, reason: 'missing-main-target' });
});

// ---- 登记表过滤 ----
test('未登记角色被过滤；requireMainTarget:false 时全部未登记返回合法空数组', () => {
  const filtered = cm.resolveRelevantCharacterIds({
    mainTargetCharacterId: 'cirno',
    presentCharacterIds: ['unknown-char', 'reimu'],
    requireMainTarget: true,
  });
  assert.deepEqual(filtered, { ok: true, characterIds: ['cirno'] });

  const none = cm.resolveRelevantCharacterIds({
    mainTargetCharacterId: null,
    presentCharacterIds: ['unknown-char'],
    requireMainTarget: false,
  });
  // R0 裁定：无角色是合法 V2（独处设施剧情/无角色过渡），返回成功空数组。
  assert.deepEqual(none, { ok: true, characterIds: [] });
});

test('自定义登记表白名单生效（不使用角色显示名作稳定键）', () => {
  const result = cm.resolveRelevantCharacterIds({
    mainTargetCharacterId: 'custom-hero',
    presentCharacterIds: ['reimu'],
    requireMainTarget: true,
    registeredCharacterIds: ['custom-hero', 'reimu'],
  });
  assert.deepEqual(result, { ok: true, characterIds: ['custom-hero'] });

  // 无明确目标时在场补足也应用自定义白名单
  const fallback = cm.resolveRelevantCharacterIds({
    mainTargetCharacterId: null,
    presentCharacterIds: ['custom-hero', 'reimu'],
    requireMainTarget: false,
    registeredCharacterIds: ['custom-hero', 'reimu'],
  });
  assert.deepEqual(fallback, { ok: true, characterIds: ['custom-hero', 'reimu'] });
});

// ---- freezeVisitIds ----
test('freezeVisitIds 输出每个相关角色 active visit ID 或 null', () => {
  const state = {
    interaction: {
      visit_memory: {
        version: 'character-visit-memory.v2',
        by_character: {
          reimu: {
            character_id: 'reimu',
            active_visit: { visit_id: 'character_visit_000001' },
            closed_visits: [],
            legacy_memories: [],
          },
          marisa: {
            character_id: 'marisa',
            active_visit: null,
            closed_visits: [],
            legacy_memories: [],
          },
        },
      },
    },
  };
  const frozen = cm.freezeVisitIds(state, ['reimu', 'marisa']);
  assert.deepEqual(frozen, { reimu: 'character_visit_000001', marisa: null });
});

test('freezeVisitIds 无记忆/未登记角色输出 null，不创建 visit，state 输入不变', () => {
  const state = {};
  const frozen = cm.freezeVisitIds(state, ['reimu', 'cirno']);
  assert.deepEqual(frozen, { reimu: null, cirno: null });
  assert.deepEqual(state, {});
});

test('freezeVisitIds 是纯读取：闭包/其他角色数据不受影响', () => {
  const state = {
    interaction: {
      visit_memory: {
        version: 'character-visit-memory.v2',
        by_character: {
          reimu: {
            character_id: 'reimu',
            active_visit: { visit_id: 'character_visit_000007' },
            closed_visits: [],
            legacy_memories: [],
          },
        },
      },
    },
  };
  const before = JSON.stringify(state);
  const frozen = cm.freezeVisitIds(state, ['reimu']);
  assert.equal(JSON.stringify(state), before);
  assert.equal(frozen.reimu, 'character_visit_000007');
});
