// 第四批 B4-T01/B4-T02 —— memory profile 双构建与独立版零数据库路径。
// 覆盖 runbook §5.3/§5.4/§5.5 与 §10 B4-T01/B4-T02 必测：
// - CLI 合法值/缺值/空值/错拼/第三值拒绝；
// - profile 与 UI channel 独立组合、输出目录不重叠、同次构建不覆盖另一 profile；
// - 唯一 selection import 恰好一次、plugin 未命中/重复命中/越界失败；
// - standalone app.js 与 ui-mount.js 禁词全零、host shell 哨兵移除；
// - database-assisted 保留数据库桥且 report 携带 profile/adapter identity；
// - fake AutoCardUpdaterAPI 抛错 getter 零访问（standalone 装配根）。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import test, { before } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));

const BASE_BUILD_ARGS = [
  'scripts/build-ui.mjs',
  '--asset-mode=remote-r2-live',
  '--asset-base-url=https://ssrfrrt.ccwu.cc',
];

const FORBIDDEN_SYMBOLS = [
  'AutoCardUpdaterAPI',
  'queryTableRows',
  'insertRow',
  'updateRow',
  'registerTableUpdateCallback',
  'unregisterTableUpdateCallback',
];

const PROFILE_REPORTS = [
  new URL('../dist/runtime/profiles/standalone-mvu/ui-build-report.json', import.meta.url),
  new URL('../dist/runtime/profiles/database-assisted/ui-build-report.json', import.meta.url),
];

before(async () => {
  // 明确删除两个生成报告，避免旧 dist 让本测试在构建未产出报告时误通过。
  await Promise.all(PROFILE_REPORTS.map((reportUrl) => rm(reportUrl, { force: true })));
  for (const profile of ['standalone-mvu', 'database-assisted']) {
    await execFileAsync(process.execPath, [...BASE_BUILD_ARGS, `--memory-profile=${profile}`], { cwd: root });
  }
});

test('B4-T01: build-ui.mjs 强制 --memory-profile 合法值，缺值/空值/错拼/第三值拒绝', async () => {
  const build = await read('../scripts/build-ui.mjs');
  assert.match(build, /--memory-profile=standalone-mvu\|database-assisted/);
  assert.match(build, /缺失\/空值\/第三种值均失败/);
  // 缺值
  await assert.rejects(
    execFileAsync(process.execPath, BASE_BUILD_ARGS, { cwd: root }),
    /--memory-profile=standalone-mvu\|database-assisted 只允许这两个合法值/,
  );
  // 空值
  await assert.rejects(
    execFileAsync(process.execPath, [...BASE_BUILD_ARGS, '--memory-profile='], { cwd: root }),
    /--memory-profile=standalone-mvu\|database-assisted 只允许这两个合法值/,
  );
  // 错拼
  await assert.rejects(
    execFileAsync(process.execPath, [...BASE_BUILD_ARGS, '--memory-profile=standalone'], { cwd: root }),
    /--memory-profile=standalone-mvu\|database-assisted 只允许这两个合法值/,
  );
  // 第三值
  await assert.rejects(
    execFileAsync(process.execPath, [...BASE_BUILD_ARGS, '--memory-profile=hybrid'], { cwd: root }),
    /--memory-profile=standalone-mvu\|database-assisted 只允许这两个合法值/,
  );
});

test('B4-T01: profile 与 UI channel 独立组合、输出目录二维隔离', async () => {
  const build = await read('../scripts/build-ui.mjs');
  // runtime 输出必须是 channel × profile 二维：dist/runtime[/test]/profiles/<profile>/
  assert.match(build, /const runtimeOutputDir = `\$\{channelConfig\.outputDir\}\/profiles\/\$\{memoryProfile\}`/);
  assert.match(build, /dist\/ui\/profiles\/\$\{memoryProfile\}/, 'app 输出必须进入 profile 目录');
  // profile-specific manifest 固定坐标，不覆盖现有 manifest
  assert.match(build, /profiles\/\$\{memoryProfile\}\/ui-manifest\.json/);
  // 两个 profile 的 app 输出目录不同（目录名即 profile）
  assert.notEqual('dist/ui/profiles/standalone-mvu', 'dist/ui/profiles/database-assisted');
});

test('B4-T01: 受控 esbuild resolve plugin —— 唯一 selection import、未命中/重复/越界失败', async () => {
  const build = await read('../scripts/build-ui.mjs');
  assert.match(build, /name: 'memory-adapter-profile'/);
  assert.match(build, /filter: \/\^@card\\\/memory-adapter\$\//, 'plugin 必须只命中唯一 specifier');
  assert.match(build, /resolveHits !== 1/, '未命中/重复命中必须使构建失败');
  assert.match(build, /rel\.startsWith\('\.\.'\) \|\| isAbsolute\(rel\)/, '解析到 profile 目录之外必须失败');
  // selection import 源：source 侧只有一条公共 port import（import 行恰好一条）
  const selection = await read('../src/ui/memory-adapter-selection.ts');
  const importLines = selection.split('\n').filter((line) => line.includes('@card/memory-adapter') && line.includes('import'));
  assert.equal(importLines.length, 1, 'selection import 必须恰好一条');
  assert.match(selection, /import \{ createMemoryAdapter \} from '@card\/memory-adapter'/);
  // app/bridge 不得直接 import 数据库 adapter
  const app = await read('../src/ui/app.ts');
  const bridge = await read('../src/ui/bridge.ts');
  assert.doesNotMatch(app, /from '\.\/database-adapter'/);
  assert.doesNotMatch(bridge, /from '\.\/database-adapter'/);
  assert.doesNotMatch(app, /AutoCardUpdaterAPI/);
  assert.doesNotMatch(bridge, /AutoCardUpdaterAPI/);
});

test('B4-T02: standalone no-op adapter 零数据库路径（fake 抛错 getter 零访问）', async () => {
  const adapter = await read('../src/ui/memory-adapters/standalone-mvu.ts');
  assert.match(adapter, /createMemoryAdapter/);
  assert.match(adapter, /status: 'disabled-by-build'/);
  assert.match(adapter, /status: 'skipped'/);
  assert.doesNotMatch(adapter, /AutoCardUpdaterAPI|queryTableRows|insertRow|updateRow/);
  // fake global 测试：即使放置抛错 getter，standalone adapter 的调用也不能触碰它。
  // 在真实子进程中注入抛错 getter，然后 bundle adapter 并执行 recall/archive/syncOpening。
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: [resolve(root, 'src/ui/memory-adapters/standalone-mvu.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
  });
  const source = result.outputFiles[0].text;
  const driver = `
    Object.defineProperty(globalThis, 'AutoCardUpdaterAPI', {
      configurable: true,
      get() { throw new Error('poisoned getter must never be touched'); },
    });
    const src = Buffer.from('${Buffer.from(source).toString('base64')}', 'base64').toString('utf8');
    const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
    const adapter = mod.createMemoryAdapter();
    const recall = await adapter.recall({ archiveScopeId: 's', relevantCharacterIds: [], localMemory: null, requestId: 'r' });
    const archive = await adapter.archive({ archiveScopeId: 's', records: [] });
    const sync = await adapter.syncOpening({});
    if (recall.status !== 'disabled-by-build' || recall.candidates.length !== 0) throw new Error('recall 合同不符');
    if (archive.status !== 'skipped') throw new Error('archive 合同不符');
    if (sync.status !== 'skipped') throw new Error('syncOpening 合同不符');
    console.log('FAKE_GLOBAL_OK');
  `;
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync2 = promisify(execFile);
  const { stdout } = await execFileAsync2(process.execPath, ['--input-type=module', '-e', driver], { cwd: root });
  assert.match(stdout, /FAKE_GLOBAL_OK/, 'fake 抛错 getter 环境中 standalone adapter 必须零访问且按合同返回');
});

test('B4-T02: standalone app bundle 禁词全零（import graph 层证明）', async () => {
  const appJs = await read('../dist/ui/profiles/standalone-mvu/app.js');
  for (const sym of FORBIDDEN_SYMBOLS) {
    assert.equal(appJs.includes(sym), false, `standalone app.js 不应包含 ${sym}`);
  }
  // 独立版不包含记忆物理表名
  assert.equal(appJs.includes('主角信息表'), false);
  assert.equal(appJs.includes('背包物品表'), false);
});

test('B4-T02: standalone ui-mount.js 禁词全零且 host shell 哨兵块已移除', async () => {
  const mount = await read('../dist/runtime/profiles/standalone-mvu/ui-mount.js');
  for (const sym of FORBIDDEN_SYMBOLS) {
    assert.equal(mount.includes(sym), false, `standalone ui-mount.js 不应包含 ${sym}`);
  }
  assert.equal(mount.includes('B4-DATABASE-BRIDGE'), false, 'standalone mount 不得残留数据库桥哨兵');
  // host shell 其余宿主桥接保留
  assert.match(mount, /gensokyo-game-shell/);
  assert.match(mount, /show-native-chat/);
  assert.match(mount, /__GENSOKYO_GARDEN_UI_024__/);
});

test('B4-T02: database-assisted 保留数据库桥与 adapter identity', async () => {
  const mount = await read('../dist/runtime/profiles/database-assisted/ui-mount.js');
  assert.equal(mount.includes('AutoCardUpdaterAPI'), true, 'database-assisted mount 应保留数据库桥');
  assert.equal(mount.includes('B4-DATABASE-BRIDGE'), true, 'database-assisted 应保留哨兵块');

  for (const profile of ['standalone-mvu', 'database-assisted']) {
    // 报告缺失或 JSON 损坏必须直接失败；不得 catch 后跳过。
    const report = JSON.parse(await read(`../dist/runtime/profiles/${profile}/ui-build-report.json`));
    const profileMount = await read(`../dist/runtime/profiles/${profile}/ui-mount.js`);
    assert.equal(report.ui_delivery, 'embedded');
    assert.equal(report.ui_channel, 'production');
    assert.equal(report.ui_version, null);
    assert.equal(report.memory_profile, profile);
    assert.equal(
      report.memory_adapter,
      profile === 'standalone-mvu' ? 'standalone-mvu/no-op' : 'database-assisted/host-auto-card-updater',
    );
    assert.equal(report.output, `dist/runtime/profiles/${profile}/ui-mount.js`);
    assert.equal(report.versioned_output, null);
    assert.equal(report.loader_output, null);
    assert.equal(report.bytes, Buffer.byteLength(profileMount, 'utf8'));
    assert.equal(report.sha256, createHash('sha256').update(profileMount).digest('hex'));
  }
});

test('B4-R2: database-assisted 生产 bundle 不可达旧主动数据库记忆模块', async () => {
  const map = JSON.parse(await read('../dist/ui/profiles/database-assisted/app.js.map'));
  const sources = (map.sources ?? []).join('\n').replaceAll('\\', '/');
  for (const forbidden of [
    'memory-archive-schema.ts',
    'memory-upsert-plan.ts',
    'memory-recall-pipeline.ts',
    'memory-host-call.ts',
  ]) {
    assert.doesNotMatch(sources, new RegExp(forbidden.replaceAll('.', '\\.')), `${forbidden} 不得进入生产 bundle`);
  }

  const adapter = await read('../src/ui/memory-adapters/database-assisted.ts');
  assert.match(adapter, /R2 共存策略不读取数据库记忆/u);
  assert.match(adapter, /status: 'recall-empty'/u);
  assert.match(adapter, /status: 'skipped'/u);
  assert.doesNotMatch(adapter, /memory-recall-pipeline|memory-upsert-plan|memory-archive-schema/u);
});
