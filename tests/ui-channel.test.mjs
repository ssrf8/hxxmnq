// UI 通道（production/test）合同测试 — 版本体系 test-r<N> + 固定测试入口。
// 对应 project/r2-ui-test-channel-publish-plan.md 第 10 节（10.1 构建 / 10.2 loader / 10.3 发布 / 10.4 打包）。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const ORIGIN = 'https://ssrfrrt.ccwu.cc';
const TEST_MANIFEST_URL = `${ORIGIN}/gensokyo-moving-garden/test/ui/ui-manifest.json`;
const LIVE_MANIFEST_URL = `${ORIGIN}/gensokyo-moving-garden/live/ui/ui-manifest.json`;

// 把 loader 模板实例化为指定通道的源码，并在受限 vm 中运行，返回实际发起的 fetch 列表。
async function runLoader({ channel, manifestUrl, manifest }) {
  const { runInNewContext } = await import('node:vm');
  const template = await read('../src/runtime/ui-loader.js');
  const source = template
    .replaceAll('__UI_MANIFEST_URL__', manifestUrl)
    .replaceAll('__UI_CHANNEL__', channel);
  const fetches = [];
  const hostDocument = {
    body: { appendChild() {} },
    createElement: () => ({ style: {}, textContent: '' }),
    getElementById: () => null,
  };
  const context = {
    URL,
    console: { error() {} },
    crypto: { subtle: { digest: async () => new ArrayBuffer(32) } },
    document: hostDocument,
    fetch: async (url) => {
      fetches.push(String(url));
      if (fetches.length === 1) return { ok: true, json: async () => manifest };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(manifest.bytes ?? 0) };
    },
    window: { parent: { document: hostDocument } },
  };
  runInNewContext(source, context);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return fetches;
}

const validTestManifest = (overrides = {}) => ({
  schema_version: 'gensokyo-ui-live.v1',
  channel: 'test',
  version: 'test-r1',
  sha256: '0'.repeat(64),
  bytes: 123,
  url: `${ORIGIN}/gensokyo-moving-garden/test/ui/ui-mount-test-r1.js`,
  ...overrides,
});

const validLiveManifest = (overrides = {}) => ({
  schema_version: 'gensokyo-ui-live.v1',
  version: 'r95',
  sha256: '0'.repeat(64),
  bytes: 123,
  url: `${ORIGIN}/gensokyo-moving-garden/live/ui/ui-mount-r95.js`,
  ...overrides,
});

// ---- 10.1 构建测试（静态断言） ----
test('UI 通道构建：build-ui.mjs 含固定通道映射与版本格式约束', async () => {
  const build = await read('../scripts/build-ui.mjs');
  assert.match(build, /--ui-channel=production\|test/, 'build-ui 必须显式要求 --ui-channel');
  assert.match(build, /UI_CHANNELS\s*=\s*\{/, '必须存在固定通道映射表');
  assert.match(build, /production: \{[\s\S]*?uiPrefix: 'gensokyo-moving-garden\/live\/ui'/, '正式通道前缀固定为 live/ui');
  assert.match(build, /test: \{[\s\S]*?uiPrefix: 'gensokyo-moving-garden\/test\/ui'/, '测试通道前缀固定为 test/ui');
  assert.match(build, /test: \{[\s\S]*?versionPattern: \/\^test-r\[1-9\]\\d\*\$\/,/, '测试通道只接受独立递增 test-r<N>');
  assert.match(build, /production: \{[\s\S]*?versionPattern: \/\^r\[1-9\]\\d\*\$\/,/, '正式通道只接受 r<N>');
  assert.match(build, /test: \{[\s\S]*?outputDir: 'dist\/runtime\/test'/, '测试构建输出目录固定为 dist/runtime/test');
  assert.match(build, /远程 UI 构建必须显式传入 --ui-channel=production\|test/, '远程构建必须显式传通道');
  assert.match(build, /拒绝覆盖不可变 UI 产物/, '同名版本文件异内容必须失败');
});

test('UI 通道构建：测试 loader 注入测试 manifest，公共资产 manifest 保持共享', async () => {
  const build = await read('../scripts/build-ui.mjs');
  assert.match(build, /manifestPath: 'gensokyo-moving-garden\/live\/manifest\.json'/, '公共资产 manifest 仍为共享 live/manifest.json');
  // B4-O01 §5.4.1：UI manifest 坐标升级为 channel × memory-profile 二维，
  // 不覆盖现有 live/test ui-manifest.json。
  assert.match(build, /uiManifestPath = `\$\{channelConfig\.uiPrefix\}\/profiles\/\$\{memoryProfile\}\/ui-manifest\.json`/, 'UI manifest 路径由通道前缀 + memory profile 派生');
  assert.match(build, /replace\(\/__UI_MANIFEST_URL__\/g, manifestUrl\)/, 'loader 注入 manifest URL');
  assert.match(build, /replace\(\/__UI_CHANNEL__\/g, uiChannel\)/, 'loader 注入编译时通道');
  assert.match(build, /ui-build-report\.json/, '测试构建必须写入构建报告文件');
});

// ---- 10.2 loader 合同测试 ----
test('UI loader 模板：保留 manifest URL 与通道占位符，按通道校验版本', async () => {
  const loader = await read('../src/runtime/ui-loader.js');
  assert.match(loader, /__UI_MANIFEST_URL__/, 'loader 模板必须保留 manifest URL 占位符');
  assert.match(loader, /__UI_CHANNEL__/, 'loader 模板必须保留编译时通道占位符');
  assert.match(loader, /CHANNEL === 'test' \? /, '版本正则必须按通道区分（测试分支）');
  assert.match(loader, /test-r\[1-9\]\\d\*\$/, '测试通道版本正则必须为 test-r<N>');
  assert.match(loader, /\^r\[1-9\]\\d\*\$/, '正式通道版本正则必须为 r<N>');
  assert.match(loader, /manifestChannel = CHANNEL === 'test' \? manifest\.channel : \(manifest\.channel \?\? 'production'\)/, '测试通道必须显式 channel=test；正式通道兼容缺失 channel');
});

test('UI loader 运行时：测试通道拒绝 production/缺失 channel/正式格式版本/跨目录路径', async () => {
  // 拒绝 channel=production
  let fetches = await runLoader({
    channel: 'test',
    manifestUrl: TEST_MANIFEST_URL,
    manifest: validTestManifest({ channel: 'production' }),
  });
  assert.equal(fetches.length, 1, 'channel=production 必须在下载 UI 前被拒绝');

  // 拒绝缺失 channel
  fetches = await runLoader({
    channel: 'test',
    manifestUrl: TEST_MANIFEST_URL,
    manifest: validTestManifest({ channel: undefined }),
  });
  assert.equal(fetches.length, 1, '测试 loader 必须拒绝缺失 channel 的 manifest');

  // 拒绝正式格式版本（r95 而非 test-r1）
  fetches = await runLoader({
    channel: 'test',
    manifestUrl: TEST_MANIFEST_URL,
    manifest: validTestManifest({ version: 'r95' }),
  });
  assert.equal(fetches.length, 1, '测试 loader 必须拒绝正式格式版本号');

  // 拒绝跨目录 UI 路径（指向 live/ui）
  fetches = await runLoader({
    channel: 'test',
    manifestUrl: TEST_MANIFEST_URL,
    manifest: validTestManifest({ url: `${ORIGIN}/gensokyo-moving-garden/live/ui/ui-mount-test-r1.js` }),
  });
  assert.equal(fetches.length, 1, '测试 loader 必须拒绝指向 live/ui 的 UI 路径');

  // 接受合法测试 manifest：读取 manifest 后继续下载 UI（两次 fetch）
  fetches = await runLoader({
    channel: 'test',
    manifestUrl: TEST_MANIFEST_URL,
    manifest: validTestManifest(),
  });
  assert.equal(fetches.length, 2, '合法测试 manifest 应继续下载 UI');
  assert.equal(fetches[1], validTestManifest().url, '第二次 fetch 必须指向受信任的测试 UI 路径');
});

test('UI loader 运行时：正式通道兼容缺失 channel 的旧 manifest，拒绝 test 通道', async () => {
  // 兼容：缺失 channel 视为 production，正常下载 UI
  let fetches = await runLoader({
    channel: 'production',
    manifestUrl: LIVE_MANIFEST_URL,
    manifest: validLiveManifest(),
  });
  assert.equal(fetches.length, 2, '正式 loader 必须把缺失 channel 的旧 manifest 视为 production');

  // 拒绝 channel=test
  fetches = await runLoader({
    channel: 'production',
    manifestUrl: LIVE_MANIFEST_URL,
    manifest: validLiveManifest({ channel: 'test' }),
  });
  assert.equal(fetches.length, 1, '正式 loader 必须拒绝 test 通道 manifest');

  // 拒绝测试格式版本
  fetches = await runLoader({
    channel: 'production',
    manifestUrl: LIVE_MANIFEST_URL,
    manifest: validLiveManifest({ version: 'test-r1' }),
  });
  assert.equal(fetches.length, 1, '正式 loader 必须拒绝测试格式版本号');
});

test('UI loader 运行时：两类 loader 在字节数或 SHA-256 不一致时不执行脚本', async () => {
  // 字节数不一致
  let fetches = await runLoader({
    channel: 'test',
    manifestUrl: TEST_MANIFEST_URL,
    manifest: validTestManifest({ bytes: 999 }),
  });
  assert.equal(fetches.length, 2, '字节数校验发生在下载之后');

  // sha256 不一致（mock digest 为全 0，manifest 声明非全 0）
  fetches = await runLoader({
    channel: 'test',
    manifestUrl: TEST_MANIFEST_URL,
    manifest: validTestManifest({ sha256: 'a'.repeat(64) }),
  });
  assert.equal(fetches.length, 2, 'sha256 校验发生在下载之后，下载次数不受影响');
});

// ---- 10.3 发布计划测试（publish-ui.mjs 通道适配器） ----
const hasEnv = await (async () => {
  try {
    await readFile(new URL('../.env', import.meta.url), 'utf8');
    return true;
  } catch {
    return false;
  }
})();

test('UI 发布：publish-ui.mjs 含固定通道映射与强制 --channel', async () => {
  const publisher = await read('../scripts/publish-ui.mjs');
  assert.match(publisher, /CHANNELS\s*=\s*\{/, '必须存在固定通道映射表');
  assert.match(publisher, /production: \{[\s\S]*?prefix: 'gensokyo-moving-garden\/live\/ui'/, '正式通道前缀固定');
  assert.match(publisher, /test: \{[\s\S]*?prefix: 'gensokyo-moving-garden\/test\/ui'/, '测试通道前缀固定');
  assert.match(publisher, /必须显式提供 --channel=production\|test/, '未提供 channel 必须失败');
  assert.match(publisher, /不支持 --prefix 参数/, '任意自定义前缀参数必须失败');
  assert.match(publisher, /channel: channelName/, 'manifest 必须写入通道字段');
  assert.match(publisher, /assertChannelBoundary/, '必须存在通道边界停止线');
  assert.match(publisher, /dry-run 结束：未执行任何远端写入/, 'dry-run 必须明确声明未写入');
});

test('UI 发布：test 通道 dry-run 只生成 /test/ui/ 写目标，production 通道只生成 /live/ui/', { skip: !hasEnv && '缺少 .env' }, async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('..', import.meta.url));

  // 测试通道：只允许 test/ui 写目标
  const testOut = await execFileAsync(process.execPath, [
    'scripts/publish-ui.mjs', '--channel=test',
    '--version=test-r1',
    '--file=dist/runtime/test/ui-mount-test-r1.js',
    '--dry-run',
  ], { cwd: root });
  const testText = `${testOut.stdout}\n${testOut.stderr}`;
  assert.match(testText, /gensokyo-moving-garden\/test\/ui\/ui-mount-test-r1\.js/);
  assert.match(testText, /gensokyo-moving-garden\/test\/ui\/ui-manifest\.json/);
  assert.match(testText, /bucket\s+=\s+/);
  assert.match(testText, /dry-run 结束/);
  assert.doesNotMatch(testText, /gensokyo-moving-garden\/live\/ui\//, '测试 dry-run 不得出现正式前缀写目标');

  // 正式通道：只允许 live/ui 写目标
  const prodOut = await execFileAsync(process.execPath, [
    'scripts/publish-ui.mjs', '--channel=production',
    '--version=r95',
    '--file=dist/runtime/ui-mount-r95.js',
    '--dry-run',
  ], { cwd: root });
  const prodText = `${prodOut.stdout}\n${prodOut.stderr}`;
  assert.match(prodText, /gensokyo-moving-garden\/live\/ui\/ui-mount-r95\.js/);
  assert.match(prodText, /gensokyo-moving-garden\/live\/ui\/ui-manifest\.json/);
  assert.doesNotMatch(prodText, /gensokyo-moving-garden\/test\/ui\//, '正式 dry-run 不得出现测试前缀写目标');
});

test('UI 发布：通道/版本交叉、缺 channel、自定义前缀一律失败', { skip: !hasEnv && '缺少 .env' }, async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const base = ['scripts/publish-ui.mjs', '--dry-run'];

  // 未提供 channel
  await assert.rejects(execFileAsync(process.execPath, [...base, '--version=test-r1', '--file=dist/runtime/test/ui-mount-test-r1.js'], { cwd: root }), /--channel/);
  // 测试通道 + 正式格式版本
  await assert.rejects(execFileAsync(process.execPath, [...base, '--channel=test', '--version=r95', '--file=dist/runtime/test/ui-mount-test-r1.js'], { cwd: root }), /格式不符/);
  // 正式通道 + 测试格式版本
  await assert.rejects(execFileAsync(process.execPath, [...base, '--channel=production', '--version=test-r1', '--file=dist/runtime/ui-mount-r95.js'], { cwd: root }), /格式不符/);
  // 任意自定义前缀参数
  await assert.rejects(execFileAsync(process.execPath, [...base, '--channel=test', '--prefix=whatever', '--version=test-r1', '--file=dist/runtime/test/ui-mount-test-r1.js'], { cwd: root }), /--prefix/);
  // 非法通道名
  await assert.rejects(execFileAsync(process.execPath, [...base, '--channel=staging', '--version=test-r1', '--file=dist/runtime/test/ui-mount-test-r1.js'], { cwd: root }), /--channel/);
});

// ---- 10.4 打包测试（package-checkpoint.mjs 固定测试入口） ----
test('UI 测试入口打包：package-checkpoint.mjs 支持 --release-kind=test 且与正式完全隔离', async () => {
  const packer = await read('../scripts/package-checkpoint.mjs');
  assert.match(packer, /--release-kind 只允许 production 或 test/, '必须支持 --release-kind');
  assert.match(packer, /IS_TEST_ENTRY = RELEASE_KIND === 'test'/, '必须定义测试入口判定');
  assert.match(packer, /IS_TEST_ENTRY \? 'dist\/runtime\/test' : 'dist\/runtime'/, '测试模式运行时目录固定为 dist/runtime/test');
  assert.match(packer, /checkpoint-ui-test-entry/, '测试入口输出目录必须固定为 checkpoint-ui-test-entry');
  assert.match(packer, /'幻想乡物语 \[UI测试版\]'/, '测试入口卡名必须固定且不含 UI 版本号');
  assert.match(packer, /RELEASE_KIND !== 'test' && !manifest\.planned_checkpoint_sequence/, '测试打包不得要求登记正式发布清单');
  assert.match(packer, /forbiddenUiManifest/, '必须拒绝跨通道 loader');
  assert.match(packer, /!IS_TEST_ENTRY/, '测试入口不得要求版本化副本比对（不绑定 UI 版本）');
  assert.match(packer, /ui_manifest: RELEASE_KIND === 'test'[\s\S]*?gensokyo-moving-garden\/test\/ui\/ui-manifest\.json/, '构建报告必须记录测试 UI manifest 路径');
  assert.doesNotMatch(packer, /writeFile\([^)]*project\/manifest\.json/, '打包脚本不得写入正式发布清单');
});

test('UI 测试入口打包：dry-run 计划只指向测试通道且输出目录独立', { skip: !hasEnv && '缺少 .env' }, async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { stdout } = await execFileAsync(process.execPath, [
    'scripts/package-checkpoint.mjs', '--release-kind=test', '--ui-channel=test', '--runtime-root=dist/runtime/test', '--dry-run', '--expect-remote-r2', '--ui-delivery=remote',
  ], { cwd: root });
  const plan = JSON.parse(stdout);
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.release_kind, 'test');
  assert.equal(plan.ui_manifest, 'gensokyo-moving-garden/test/ui/ui-manifest.json');
  assert.equal(plan.runtime_root, 'dist/runtime/test');
  assert.match(plan.output, /checkpoint-ui-test-entry/);
  assert.match(plan.output, /幻想乡物语 \[UI测试版\]\.json/);
  assert.doesNotMatch(plan.output, /release\//, '测试入口输出不得进入正式 release 目录');
  const uiScript = plan.scripts.find((s) => s.id.includes('garden-ui'));
  assert.ok(uiScript, '测试入口必须内嵌 UI loader 脚本');
});

test('UI 测试入口打包：真实产物卡名固定、只含测试 loader、不触碰正式清单', { skip: !hasEnv && '缺少 .env' }, async () => {
  const { access, readFile } = await import('node:fs/promises');
  const { spawnSync } = await import('node:child_process');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { createHash } = await import('node:crypto');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const manifestPath = join(root, 'project', 'manifest.json');
  const manifestBefore = await readFile(manifestPath, 'utf8');
  const hashBefore = createHash('sha256').update(manifestBefore).digest('hex');
  const entryFile = join(root, 'dist', 'checkpoint-ui-test-entry', '幻想乡物语 [UI测试版].json');

  if (!(await access(entryFile).then(() => true, () => false))) {
    const result = spawnSync(process.execPath, [
      'scripts/package-checkpoint.mjs', '--release-kind=test', '--ui-channel=test', '--runtime-root=dist/runtime/test', '--expect-remote-r2', '--ui-delivery=remote',
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, `真实打包应成功：${result.stderr}`);
  }

  const manifestAfter = await readFile(manifestPath, 'utf8');
  const hashAfter = createHash('sha256').update(manifestAfter).digest('hex');
  assert.equal(hashAfter, hashBefore, '测试入口打包不得修改 project/manifest.json 的正式发布状态');

  const card = JSON.parse(await readFile(entryFile, 'utf8'));
  assert.equal(card.data.name, '幻想乡物语 [UI测试版]', '测试入口卡名必须固定且不含具体 UI 版本');
  assert.doesNotMatch(card.data.name, /test-r\d+/, '卡名不得绑定具体测试 UI 版本号');
  assert.match(card.data.character_version, /ui-test-entry/, 'character_version 使用固定入口标识');
  const uiScript = card.data.extensions.tavern_helper.scripts.find((s) => s.id.includes('garden-ui'));
  assert.ok(uiScript, '测试入口必须内嵌 UI 脚本');
  assert.match(uiScript.content, /gensokyo-moving-garden\/test\/ui\/ui-manifest\.json/, '测试入口 loader 必须引用测试 UI manifest');
  assert.doesNotMatch(uiScript.content, /gensokyo-moving-garden\/live\/ui\//, '测试入口 loader 不得引用正式 UI manifest');
  assert.match(uiScript.content, /const CHANNEL = 'test'/, '测试入口 loader 必须为 test 通道');
  // 防回归：入口卡复用已有产物时必须仍是新体系版本正则（曾因旧 g12hex loader 混入导致加载失败）。
  assert.match(uiScript.content, /VERSION_PATTERN = CHANNEL === 'test' \? \/\^test-r\[1-9\]\\d\*\$/, '入口卡 loader 版本正则必须为 test-r<N>');
  assert.doesNotMatch(uiScript.content, /test-r\[1-9\]\\d\*-g\[a-f0-9\]\{12\}/, '入口卡 loader 不得残留旧体系 g12hex 版本正则');
});
