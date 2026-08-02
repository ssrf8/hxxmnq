import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { collectRuntimeAssets } from './runtime-assets.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_ROOT = join(ROOT, 'src', 'assets');
const LIVE_ROOT = join(ROOT, 'dist', 'asset-live');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));

const generation = Number(args.generation ?? process.env.R2_LIVE_GENERATION);
const dryRun = args['dry-run'] === true;
const rawBaseUrl = args['base-url'] ?? process.env.R2_ASSET_BASE_URL;
const baseUrl = typeof rawBaseUrl === 'string' ? rawBaseUrl.replace(/\/+$/, '') : null;
if (!Number.isSafeInteger(generation) || generation < 1) throw new Error('live staging 必须提供正整数 --generation=<n>');
if (baseUrl) {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || parsed.origin !== baseUrl) {
    throw new Error('--base-url 必须是无凭据、无查询参数、无路径的 HTTPS origin');
  }
}

const mimeByExtension = new Map([
  ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.wav', 'audio/wav'], ['.webp', 'image/webp'],
  ['.gif', 'image/gif'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const mimeFor = (source) => {
  const extension = /\.[^.]+$/.exec(source.toLowerCase())?.[0];
  const mime = extension && mimeByExtension.get(extension);
  if (!mime) throw new Error(`无法确定 MIME：${source}`);
  return mime;
};

const manifestSource = JSON.parse(await readFile(join(ASSET_ROOT, 'asset-manifest.json'), 'utf8'));
const assetRootReal = await realpath(ASSET_ROOT);
const files = [];
for (const entry of collectRuntimeAssets(manifestSource)) {
  const sourcePath = resolve(ASSET_ROOT, ...entry.source.split('/'));
  const sourceRelative = relative(assetRootReal, await realpath(sourcePath));
  if (sourceRelative === '..' || sourceRelative.startsWith(`..${sep}`) || isAbsolute(sourceRelative)) throw new Error(`素材越出 src/assets：${entry.source}`);
  const stat = await lstat(sourcePath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`live staging 只接受普通文件：${entry.source}`);
  const bytes = await readFile(sourcePath);
  files.push({
    logical_id: entry.logical_id, source: entry.source, key: `gensokyo-moving-garden/live/${entry.source}`,
    mime: mimeFor(entry.source), bytes: bytes.byteLength, sha256: sha256(bytes),
    cache_control: 'public, max-age=0, must-revalidate', required: entry.required, fallback: entry.fallback,
    priority_class: entry.priority_class, bundle: entry.bundle, trigger: entry.trigger, entry_gate: entry.entry_gate, category: entry.category,
  });
}

const [{ stdout: commit }, { stdout: commitTime }, { stdout: worktreeStatus }] = await Promise.all([
  execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }),
  execFileAsync('git', ['show', '-s', '--format=%cI', 'HEAD'], { cwd: ROOT }),
  execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT }),
]);
const sourceTreeDirty = worktreeStatus.trim().length > 0;
if (!dryRun && sourceTreeDirty && args['allow-dirty'] !== true) throw new Error('工作树存在未提交改动；正式 live staging 必须来自干净提交（本地演练可使用 --dry-run）');
const manifestWithoutHash = {
  schema_version: 'gensokyo-r2-live.v1', project_version: manifestSource.version, generation, updated_at: new Date().toISOString(),
  source_commit: commit.trim(), source_tree_dirty: sourceTreeDirty, generated_at: commitTime.trim(), asset_base_url: baseUrl,
  object_prefix: 'gensokyo-moving-garden/live/', totals: { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) }, files,
};
const manifest = { ...manifestWithoutHash, manifest_sha256: sha256(Buffer.from(stableJson(manifestWithoutHash))) };

if (!dryRun) {
  const finalRoot = join(LIVE_ROOT, `generation-${generation}`);
  const tempRoot = join(LIVE_ROOT, `.generation-${generation}-${process.pid}.tmp`);
  try { await lstat(finalRoot); throw new Error(`live staging 已存在，拒绝覆盖：${finalRoot}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(tempRoot, { recursive: true });
  try {
    for (const file of files) {
      const target = join(tempRoot, 'files', ...file.source.split('/'));
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(ASSET_ROOT, ...file.source.split('/')), target);
      const copied = await readFile(target);
      if (copied.byteLength !== file.bytes || sha256(copied) !== file.sha256) throw new Error(`staging 复制校验失败：${file.source}`);
    }
    await writeFile(join(tempRoot, 'manifest.json'), stableJson(manifest), 'utf8');
    await mkdir(LIVE_ROOT, { recursive: true });
    await rename(tempRoot, finalRoot);
  } catch (error) { await rm(tempRoot, { recursive: true, force: true }); throw error; }
}

console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'write', generation, files: manifest.totals.files, bytes: manifest.totals.bytes, manifest_sha256: manifest.manifest_sha256, output: dryRun ? null : `dist/asset-live/generation-${generation}` }, null, 2));
