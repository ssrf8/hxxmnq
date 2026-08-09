// 第四批 R2：宿主 generate 共存桥。
// 直接提取并执行生产 resolver，证明 UI 挂载前/后替换 TavernHelper.generate 都不会被旧 bind 快照绕过。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceText = await readFile(new URL('../src/runtime/ui-host-shell.js', import.meta.url), 'utf8');

function extractNamedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `缺少生产函数 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`无法提取生产函数 ${name}`);
}

const resolverSource = extractNamedFunction(sourceText, 'resolveCurrentGenerate');
const resolveCurrentGenerate = Function(`"use strict"; ${resolverSource}; return resolveCurrentGenerate;`)();

test('R2：优先按调用时刻读取 TavernHelper.generate，并保持 helper this', async () => {
  const calls = [];
  const helper = {
    marker: 'helper-v1',
    async generate(config) {
      calls.push({ marker: this.marker, config });
      return 'v1';
    },
  };
  const source = {
    TavernHelper: helper,
    generate() { throw new Error('存在 TavernHelper wrapper 时不得走旧 injected global'); },
  };

  const first = resolveCurrentGenerate(source, {});
  assert.equal(await Reflect.apply(first.fn, first.receiver, [{ id: 1 }]), 'v1');
  assert.deepEqual(calls, [{ marker: 'helper-v1', config: { id: 1 } }]);

  helper.marker = 'helper-v2';
  helper.generate = async function generateV2(config) {
    calls.push({ marker: this.marker, config });
    return 'v2';
  };
  const second = resolveCurrentGenerate(source, {});
  assert.equal(await Reflect.apply(second.fn, second.receiver, [{ id: 2 }]), 'v2');
  assert.deepEqual(calls.at(-1), { marker: 'helper-v2', config: { id: 2 } });
});

test('R2：wrapper 在 UI 挂载后安装或恢复，resolver 不保留旧函数快照', () => {
  const original = () => 'original';
  const wrapped = () => 'wrapped';
  const source = { generate: original };

  assert.equal(resolveCurrentGenerate(source, {}).fn, original);
  source.TavernHelper = { generate: wrapped };
  assert.equal(resolveCurrentGenerate(source, {}).fn, wrapped);
  delete source.TavernHelper;
  assert.equal(resolveCurrentGenerate(source, {}).fn, original);
});

test('R2：source 缺失时允许 host fallback；全部缺失返回 null', () => {
  const hostGenerate = () => 'host';
  assert.deepEqual(resolveCurrentGenerate({}, { generate: hostGenerate }), {
    fn: hostGenerate,
    receiver: { generate: hostGenerate },
  });
  const hostHelperGenerate = () => 'host-helper';
  const hostHelper = { generate: hostHelperGenerate };
  assert.deepEqual(resolveCurrentGenerate({ TavernHelper: {} }, { TavernHelper: hostHelper }), {
    fn: hostHelperGenerate,
    receiver: hostHelper,
  });
  assert.equal(resolveCurrentGenerate({}, {}), null);
});

test('R2：wrapper 抛错只调用一次，桥不重试也不改写 config', async () => {
  let calls = 0;
  const config = { user_input: '原输入', overrides: { chat_history: { prompts: [{ role: 'system', content: '冻结历史' }] } } };
  const helper = {
    async generate(received) {
      calls += 1;
      assert.equal(received, config);
      throw new Error('database wrapper failed');
    },
  };
  const current = resolveCurrentGenerate({ TavernHelper: helper }, {});
  await assert.rejects(Reflect.apply(current.fn, current.receiver, [config]), /database wrapper failed/u);
  assert.equal(calls, 1);
  assert.equal(config.user_input, '原输入');
  assert.equal(config.overrides.chat_history.prompts[0].content, '冻结历史');
});

test('R2：子 iframe 暴露的是 late-bound 转发，不再把 generate 放进 bind 列表', () => {
  assert.match(sourceText, /child\.generate = \(\.\.\.args\) => callCurrentGenerate\(\.\.\.args\)/u);
  const exposeBlock = sourceText.slice(
    sourceText.indexOf('function exposeBridgeGlobals'),
    sourceText.indexOf('function createGameFrame'),
  );
  assert.doesNotMatch(exposeBlock, /'generate',/u);
  assert.match(sourceText, /Reflect\.apply\(current\.fn, current\.receiver, args\)/u);
  assert.doesNotMatch(sourceText, /original_TavernHelper_generate_ACU/u);
});
