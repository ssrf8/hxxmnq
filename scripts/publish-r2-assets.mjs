import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));
if (args['dry-run'] !== true) throw new Error('真实 R2 上传默认禁用；本工具当前只接受显式 --dry-run');
if (typeof args.bucket !== 'string' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(args.bucket)) throw new Error('必须显式提供唯一桶名 --bucket=<bucket>');
if (typeof args.manifest !== 'string') throw new Error('必须显式提供已生成 staging manifest：--manifest=<path>');

const releaseRoot = join(ROOT, 'dist', 'asset-release');
const releaseRootReal = await realpath(releaseRoot);
const manifestPath = await realpath(resolve(ROOT, args.manifest));
const manifestRelative = relative(releaseRootReal, manifestPath);
if (
  manifestRelative === '..'
  || manifestRelative.startsWith(`..${sep}`)
  || isAbsolute(manifestRelative)
  || basename(manifestPath) !== 'manifest.json'
) throw new Error('manifest 必须是 dist/asset-release/<release>/manifest.json 内的 staging 文件');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.schema_version !== 'gensokyo-r2-release.v2' || !Array.isArray(manifest.files)) throw new Error('只接受 gensokyo-r2-release.v2 staging manifest');
const { manifest_sha256: declaredManifestHash, ...manifestWithoutHash } = manifest;
const calculatedManifestHash = createHash('sha256').update(`${JSON.stringify(manifestWithoutHash, null, 2)}\n`).digest('hex');
if (declaredManifestHash !== calculatedManifestHash) throw new Error('staging manifest SHA-256 校验失败');
if (manifest.source_tree_dirty) throw new Error('拒绝为脏工作树生成 R2 上传计划');
if (manifest.totals?.files !== manifest.files.length) throw new Error('staging manifest 文件总数不匹配');
if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(manifest.release_id)) throw new Error('staging release ID 非法');
const expectedPrefix = `gensokyo-moving-garden/releases/${manifest.release_id}/`;
if (manifest.object_prefix !== expectedPrefix || dirname(manifestPath) !== join(releaseRootReal, manifest.release_id)) {
  throw new Error('staging 目录、release ID 与 object_prefix 不一致');
}
const stagingRoot = dirname(manifestPath);
const filesRoot = join(stagingRoot, 'files');
const filesRootReal = await realpath(filesRoot);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mimeByExtension = new Map([
  ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.webp', 'image/webp'], ['.gif', 'image/gif'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.wav', 'audio/wav'],
]);
const plan = [];
const logicalIds = new Set();
const keys = new Set();
for (const file of manifest.files) {
  if (typeof file.source !== 'string' || !/^[\x20-\x7e]+$/.test(file.source) || file.source.startsWith('/') || file.source.includes('\\') || file.source.split('/').includes('..')) throw new Error(`manifest source 越界：${file.source}`);
  if (file.logical_id !== `asset:${file.source}` || logicalIds.has(file.logical_id) || keys.has(file.key)) throw new Error(`manifest logical_id 或 key 重复/不一致：${file.source}`);
  if (file.key !== `${manifest.object_prefix}${file.source}` || file.key.includes('\\') || file.key.split('/').includes('..')) throw new Error(`manifest key 越界：${file.key}`);
  if (mimeByExtension.get(extname(file.source).toLowerCase()) !== file.mime) throw new Error(`manifest MIME 非法：${file.source}`);
  if (file.cache_control !== 'public, max-age=31536000, immutable') throw new Error(`manifest Cache-Control 非法：${file.source}`);
  logicalIds.add(file.logical_id);
  keys.add(file.key);
  const localPath = resolve(filesRoot, ...file.source.split('/'));
  const localReal = await realpath(localPath);
  const localRelative = relative(filesRootReal, localReal);
  if (localRelative === '..' || localRelative.startsWith(`..${sep}`) || isAbsolute(localRelative)) throw new Error(`staging 文件越界：${file.source}`);
  const stat = await lstat(localReal);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`staging 只接受普通文件：${file.source}`);
  const bytes = await readFile(localReal);
  if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`staging 文件校验失败：${file.source}`);
  plan.push({ key: file.key, bytes: file.bytes, mime: file.mime, cache_control: file.cache_control });
}
if (manifest.totals.bytes !== plan.reduce((sum, item) => sum + item.bytes, 0)) throw new Error('staging manifest 字节总数不匹配');
console.log(JSON.stringify({
  mode: 'dry-run-only',
  bucket: args.bucket,
  release_id: manifest.release_id,
  asset_objects: plan.length,
  total_objects: plan.length + 1,
  bytes: plan.reduce((sum, item) => sum + item.bytes, 0),
  manifest_key: `${manifest.object_prefix}manifest.json`,
  manifest_headers: { mime: 'application/json', cache_control: 'no-cache' },
  upload_order: ['files-in-manifest-order', 'manifest-last'],
  plan,
  next_step: '需要所有者提供真实桶坐标并另行授权上传；当前工具不会调用 wrangler、Cloudflare API 或网络。',
}, null, 2));
