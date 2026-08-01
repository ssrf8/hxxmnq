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
const RELEASE_ROOT = join(ROOT, 'dist', 'asset-release');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));

const releaseId = args.release ?? process.env.R2_RELEASE_ID;
const dryRun = args['dry-run'] === true;
const rawBaseUrl = args['base-url'] ?? process.env.R2_ASSET_BASE_URL;
const baseUrl = typeof rawBaseUrl === 'string' ? rawBaseUrl.replace(/\/+$/, '') : null;

if (typeof releaseId !== 'string' || !/^[a-z0-9][a-z0-9.-]{2,62}$/.test(releaseId)) {
  throw new Error('必须提供 ASCII release ID，例如 --release=0.2.0-r55-a1b2c3d4');
}
if (baseUrl) {
  const parsedBaseUrl = new URL(baseUrl);
  if (
    parsedBaseUrl.protocol !== 'https:'
    || parsedBaseUrl.username
    || parsedBaseUrl.password
    || parsedBaseUrl.search
    || parsedBaseUrl.hash
    || parsedBaseUrl.pathname !== '/'
    || parsedBaseUrl.origin !== baseUrl
  ) {
    throw new Error('--base-url 必须是无凭据、无查询参数、无路径的 HTTPS origin');
  }
}

const mimeByExtension = new Map([
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wav', 'audio/wav'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);
const mimeFor = (source) => {
  const match = /\.[^.]+$/.exec(source.toLowerCase());
  const mime = match ? mimeByExtension.get(match[0]) : null;
  if (!mime) throw new Error(`无法确定 MIME：${source}`);
  return mime;
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const manifestSource = JSON.parse(await readFile(join(ASSET_ROOT, 'asset-manifest.json'), 'utf8'));
const declaredAssets = collectRuntimeAssets(manifestSource);
const assetRootReal = await realpath(ASSET_ROOT);
const files = [];

for (const entry of declaredAssets) {
  const sourcePath = resolve(ASSET_ROOT, ...entry.source.split('/'));
  const sourceRelative = relative(assetRootReal, await realpath(sourcePath));
  if (sourceRelative.startsWith(`..${sep}`) || sourceRelative === '..' || isAbsolute(sourceRelative)) {
    throw new Error(`素材越出 src/assets：${entry.source}`);
  }
  const sourceStat = await lstat(sourcePath);
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
    throw new Error(`R2 release 只接受普通文件：${entry.source}`);
  }
  const bytes = await readFile(sourcePath);
  files.push({
    logical_id: entry.logical_id,
    source: entry.source,
    key: `gensokyo-moving-garden/releases/${releaseId}/${entry.source}`,
    mime: mimeFor(entry.source),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    cache_control: 'public, max-age=31536000, immutable',
    required: entry.required,
    fallback: entry.fallback,
    priority_class: entry.priority_class,
    bundle: entry.bundle,
    trigger: entry.trigger,
    entry_gate: entry.entry_gate,
    category: entry.category,
  });
}

const [{ stdout: commit }, { stdout: commitTime }, { stdout: worktreeStatus }] = await Promise.all([
  execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }),
  execFileAsync('git', ['show', '-s', '--format=%cI', 'HEAD'], { cwd: ROOT }),
  execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT }),
]);
const sourceTreeDirty = worktreeStatus.trim().length > 0;
if (!dryRun && sourceTreeDirty && args['allow-dirty'] !== true) {
  throw new Error('工作树存在未提交改动；正式 release staging 必须来自干净提交（本地演练可直接使用 --dry-run）');
}
const manifestWithoutHash = {
  schema_version: 'gensokyo-r2-release.v2',
  project_version: manifestSource.version,
  release_id: releaseId,
  source_commit: commit.trim(),
  source_tree_dirty: sourceTreeDirty,
  generated_at: commitTime.trim(),
  asset_base_url: baseUrl,
  object_prefix: `gensokyo-moving-garden/releases/${releaseId}/`,
  totals: {
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  },
  files,
};
const manifest = {
  ...manifestWithoutHash,
  manifest_sha256: sha256(Buffer.from(stableJson(manifestWithoutHash))),
};

if (!dryRun) {
  const finalRoot = join(RELEASE_ROOT, releaseId);
  const tempRoot = join(RELEASE_ROOT, `.${releaseId}-${process.pid}.tmp`);
  try {
    await lstat(finalRoot);
    throw new Error(`release staging 已存在，拒绝覆盖：${finalRoot}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(tempRoot, { recursive: true });
  try {
    for (const file of files) {
      const target = join(tempRoot, 'files', ...file.source.split('/'));
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(ASSET_ROOT, ...file.source.split('/')), target);
      const copied = await readFile(target);
      if (copied.byteLength !== file.bytes || sha256(copied) !== file.sha256) {
        throw new Error(`staging 复制校验失败：${file.source}`);
      }
    }
    await writeFile(join(tempRoot, 'manifest.json'), stableJson(manifest), 'utf8');
    await mkdir(RELEASE_ROOT, { recursive: true });
    await rename(tempRoot, finalRoot);
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

console.log(JSON.stringify({
  mode: dryRun ? 'dry-run' : 'write',
  release_id: releaseId,
  files: manifest.totals.files,
  bytes: manifest.totals.bytes,
  manifest_sha256: manifest.manifest_sha256,
  output: dryRun ? null : `dist/asset-release/${releaseId}`,
}, null, 2));
