// Scoped character-asset delta publisher for the live R2 manifest.
// Default is staging/dry-run. Add --apply only after reviewing the printed plan.
import { createHash, createHmac } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { collectRuntimeAssets } from './runtime-assets.mjs';

const execFile = promisify(execFileCallback);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_ROOT = join(ROOT, 'src', 'assets');
const LIVE_PREFIX = 'gensokyo-moving-garden/live/';
const DEFAULT_ORIGIN = 'https://ssrfrrt.ccwu.cc';
const MIME = new Map([['.png', 'image/png'], ['.webp', 'image/webp']]);
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));
const apply = args.apply === true;
const allowReplace = args.replace === true;
const characterIds = String(args.characters ?? 'youmu,patchouli,sanae').split(',').map((id) => id.trim()).filter(Boolean);
if (!characterIds.length || characterIds.some((id) => !/^[a-z][a-z0-9_-]*$/u.test(id))) throw new Error('characters 参数非法');

function loadEnv() {
  const values = {};
  try {
    for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/u)) {
      if (!line || line.trimStart().startsWith('#')) continue;
      const split = line.indexOf('=');
      if (split > 0) values[line.slice(0, split).trim()] = line.slice(split + 1).trim();
    }
  } catch { /* process env may be sufficient */ }
  return { ...values, ...process.env };
}

const env = loadEnv();
const origin = String(env.R2_ASSET_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/u, '');
const manifestUrl = `${origin}/${LIVE_PREFIX}manifest.json`;
const remoteResponse = await fetch(manifestUrl, { cache: 'no-store' });
if (!remoteResponse.ok) throw new Error(`生产 manifest GET 失败：HTTP ${remoteResponse.status}`);
const remote = await remoteResponse.json();
if (remote.schema_version !== 'gensokyo-r2-live.v1' || !Array.isArray(remote.files) || !Number.isSafeInteger(remote.generation)) throw new Error('生产 manifest 非法');
const { manifest_sha256: remoteHash, ...remoteWithoutHashForCheck } = remote;
if (sha256(Buffer.from(stableJson(remoteWithoutHashForCheck))) !== remoteHash) throw new Error('生产 manifest 自哈希失败');

const localManifest = JSON.parse(await readFile(join(ASSET_ROOT, 'asset-manifest.json'), 'utf8'));
const prefixes = characterIds.map((id) => `characters/${id}/`);
const battleBossSources = new Set(characterIds.map((id) => `battle/boss/${id}-battle-sheet-v1.webp`));
const selected = collectRuntimeAssets(localManifest).filter((entry) => (
  prefixes.some((prefix) => entry.source.startsWith(prefix))
  || battleBossSources.has(entry.source)
));
const remoteBySource = new Map(remote.files.map((entry) => [entry.source, entry]));
const assetRootReal = await realpath(ASSET_ROOT);
const changes = [];
for (const entry of selected) {
  const sourcePath = resolve(ASSET_ROOT, ...entry.source.split('/'));
  const sourceReal = await realpath(sourcePath);
  const sourceRelative = relative(assetRootReal, sourceReal);
  if (sourceRelative === '..' || sourceRelative.startsWith(`..${sep}`) || isAbsolute(sourceRelative)) throw new Error(`素材越出 src/assets：${entry.source}`);
  const stat = await lstat(sourceReal);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`素材必须是普通文件：${entry.source}`);
  const bytes = await readFile(sourceReal);
  const extension = /\.[^.]+$/u.exec(entry.source.toLowerCase())?.[0];
  const mime = MIME.get(extension);
  if (!mime) throw new Error(`不支持的角色运行素材 MIME：${entry.source}`);
  const file = {
    logical_id: entry.logical_id,
    source: entry.source,
    key: `${LIVE_PREFIX}${entry.source}`,
    mime,
    bytes: bytes.length,
    sha256: sha256(bytes),
    cache_control: 'public, max-age=0, must-revalidate',
    required: entry.required,
    fallback: entry.fallback,
    priority_class: entry.priority_class,
    bundle: entry.bundle,
    trigger: entry.trigger,
    entry_gate: entry.entry_gate,
    category: entry.category,
  };
  const existing = remoteBySource.get(entry.source);
  if (existing) {
    if (existing.bytes !== file.bytes || existing.sha256 !== file.sha256 || existing.mime !== file.mime || existing.key !== file.key) {
      if (!allowReplace) throw new Error(`生产同名对象与本地素材冲突：${entry.source}（确认更新同名运行素材时显式添加 --replace）`);
      changes.push({
        file,
        sourcePath: sourceReal,
        operation: 'replace',
        previous: { bytes: existing.bytes, sha256: existing.sha256, mime: existing.mime, key: existing.key },
      });
    }
    continue;
  }
  changes.push({ file, sourcePath: sourceReal, operation: 'add', previous: null });
}
if (!changes.length) throw new Error('所选角色素材与生产 manifest 已一致');

const generation = remote.generation + 1;
const scope = characterIds.join('-');
const outputRoot = join(ROOT, 'dist', 'r2-updates', `generation-${generation}-${scope}`);
const allowedOutputRoot = join(ROOT, 'dist', 'r2-updates');
if (!outputRoot.startsWith(`${allowedOutputRoot}${sep}`)) throw new Error('staging 路径越界');
await rm(outputRoot, { recursive: true, force: true });
for (const change of changes) {
  const target = join(outputRoot, 'files', ...change.file.source.split('/'));
  await mkdir(dirname(target), { recursive: true });
  await copyFile(change.sourcePath, target);
}

const [{ stdout: commit }, { stdout: commitTime }, { stdout: status }] = await Promise.all([
  execFile('git', ['rev-parse', 'HEAD'], { cwd: ROOT }),
  execFile('git', ['show', '-s', '--format=%cI', 'HEAD'], { cwd: ROOT }),
  execFile('git', ['status', '--porcelain'], { cwd: ROOT }),
]);
const nextFilesBySource = new Map(remote.files.map((file) => [file.source, file]));
for (const change of changes) nextFilesBySource.set(change.file.source, change.file);
const files = [...nextFilesBySource.values()].sort((left, right) => left.source.localeCompare(right.source, 'en'));
const { manifest_sha256: _remoteHash, ...remoteWithoutHash } = remote;
const manifestWithoutHash = {
  ...remoteWithoutHash,
  project_version: localManifest.version,
  generation,
  updated_at: new Date().toISOString(),
  source_commit: commit.trim(),
  source_tree_dirty: status.trim().length > 0,
  generated_at: commitTime.trim(),
  totals: { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) },
  files,
};
const manifest = { ...manifestWithoutHash, manifest_sha256: sha256(Buffer.from(stableJson(manifestWithoutHash))) };
const plan = {
  schema_version: 'gensokyo-character-assets-r2-delta.v2',
  bucket: env.R2_BUCKET,
  generation,
  characters: characterIds,
  previous_manifest_sha256: remoteHash,
  next_manifest_sha256: manifest.manifest_sha256,
  changes: changes.map(({ file, operation, previous }) => ({
    operation,
    source: file.source,
    key: file.key,
    mime: file.mime,
    bytes: file.bytes,
    sha256: file.sha256,
    cache_control: file.cache_control,
    previous,
  })),
  manifest_key: `${LIVE_PREFIX}manifest.json`,
  manifest_last: true,
};
await mkdir(outputRoot, { recursive: true });
await writeFile(join(outputRoot, 'manifest.json'), stableJson(manifest), 'utf8');
await writeFile(join(outputRoot, 'upload-plan.json'), stableJson(plan), 'utf8');

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run', output: outputRoot, generation,
  previous_manifest_sha256: remoteHash, next_manifest_sha256: manifest.manifest_sha256,
  changes: changes.length,
  additions: changes.filter((item) => item.operation === 'add').length,
  replacements: changes.filter((item) => item.operation === 'replace').length,
  changed_bytes: changes.reduce((sum, item) => sum + item.file.bytes, 0),
  final_files: manifest.totals.files, final_bytes: manifest.totals.bytes,
  sources: changes.map(({ file, operation }) => ({ source: file.source, operation })),
}, null, 2));
if (!apply) process.exit(0);

const endpoint = env.R2_S3_ENDPOINT;
const accessKeyId = env.R2_ACCESS_KEY_ID;
const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
const bucket = env.R2_BUCKET;
for (const [name, value] of Object.entries({ R2_S3_ENDPOINT: endpoint, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, R2_BUCKET: bucket })) {
  if (!value) throw new Error(`缺少 ${name}`);
}
if (plan.bucket !== bucket) throw new Error('R2 bucket 与 staging plan 不一致');

const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
function signedRequest(method, key, body, headers = {}) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/gu, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body ?? Buffer.alloc(0));
  const canonicalUri = `/${bucket}/${key.split('/').map(encode).join('/')}`;
  const canonicalHeaders = `host:${new URL(endpoint).host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonical = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), 'auto'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return {
    url: `${endpoint}/${bucket}/${key.split('/').map(encode).join('/')}`,
    headers: { ...headers, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}` },
  };
}
async function r2Get(key) {
  const signed = signedRequest('GET', key, null);
  const response = await fetch(signed.url, { headers: signed.headers, cache: 'no-store' });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, mime: response.headers.get('content-type'), cache: response.headers.get('cache-control'), bytes, sha256: sha256(bytes) };
}
async function r2Put(key, body, mime, cacheControl) {
  const signed = signedRequest('PUT', key, body, { 'content-type': mime, 'cache-control': cacheControl });
  const response = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body });
  if (!response.ok) throw new Error(`PUT ${key} 失败：HTTP ${response.status}`);
}
async function originGet(source) {
  const response = await fetch(`${origin}/${LIVE_PREFIX}${source}?v=${Date.now()}`, { cache: 'no-store' });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, mime: response.headers.get('content-type'), cache: response.headers.get('cache-control'), bytes: bytes.length, sha256: sha256(bytes) };
}

for (const change of plan.changes) {
  const existing = await r2Get(change.key);
  if (existing.status === 200 && existing.bytes.length === change.bytes && existing.sha256 === change.sha256) continue;
  if (change.operation === 'add') {
    if (existing.status !== 404) throw new Error(`新增对象碰撞审计失败：${change.source} HTTP ${existing.status}`);
  } else {
    if (existing.status !== 200 || existing.bytes.length !== change.previous.bytes || existing.sha256 !== change.previous.sha256) {
      throw new Error(`替换对象基线已变化：${change.source}`);
    }
  }
  const body = await readFile(join(outputRoot, 'files', ...change.source.split('/')));
  await r2Put(change.key, body, change.mime, change.cache_control);
  console.log(`PUT ${change.operation} ${change.source}`);
}

for (const change of plan.changes) {
  const s3 = await r2Get(change.key);
  if (s3.status !== 200 || s3.mime !== change.mime || s3.cache !== change.cache_control || s3.bytes.length !== change.bytes || s3.sha256 !== change.sha256) {
    throw new Error(`R2 读回校验失败：${change.source}`);
  }
  const publicRead = await originGet(change.source);
  if (publicRead.status !== 200 || publicRead.mime !== change.mime || publicRead.bytes !== change.bytes || publicRead.sha256 !== change.sha256) {
    throw new Error(`生产域名读回校验失败：${change.source}`);
  }
  console.log(`VERIFY ${change.source}`);
}

const baselineAgain = await fetch(manifestUrl, { cache: 'no-store' }).then((response) => response.json());
if (baselineAgain.generation !== remote.generation || baselineAgain.manifest_sha256 !== remoteHash) throw new Error('媒体上传期间生产 manifest 已变化，停止切换');
await r2Put(plan.manifest_key, Buffer.from(stableJson(manifest)), 'application/json', 'no-store');

const finalResponse = await fetch(`${manifestUrl}?v=${Date.now()}`, { cache: 'no-store' });
const finalBytes = Buffer.from(await finalResponse.arrayBuffer());
const finalManifest = JSON.parse(finalBytes.toString('utf8'));
const { manifest_sha256: finalHash, ...finalWithoutHash } = finalManifest;
if (finalResponse.status !== 200 || finalResponse.headers.get('cache-control') !== 'no-store'
  || finalManifest.generation !== generation || finalHash !== manifest.manifest_sha256
  || sha256(Buffer.from(stableJson(finalWithoutHash))) !== finalHash
  || finalManifest.totals.files !== manifest.totals.files || finalManifest.totals.bytes !== manifest.totals.bytes) {
  throw new Error('manifest-last 最终生产校验失败');
}
console.log(JSON.stringify({ done: true, generation, uploaded_and_verified: plan.changes.length, manifest: { files: finalManifest.totals.files, bytes: finalManifest.totals.bytes, sha256: finalHash, cache_control: finalResponse.headers.get('cache-control') } }, null, 2));
