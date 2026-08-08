// publish-ui.mjs — 把远程 UI 包与 ui-manifest.json 指针发布到 R2（S3 兼容 API，SigV4 直传）。
// 用法：
//   node scripts/publish-ui.mjs --version=r<N> --file=dist/runtime/ui-mount-r<N>.js --dry-run
//   node scripts/publish-ui.mjs --version=r<N> --file=dist/runtime/ui-mount-r<N>.js
// 凭据从项目根 .env（已 gitignore）读取：R2_S3_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_ASSET_ORIGIN。
// 纪律：ui-mount-<version>.js 不可变（已存在则拒绝覆盖）；manifest 最后上传（no-store 指针）。
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));
const dryRun = args['dry-run'] === true;

// ---- .env 读取（不引第三方依赖） ----
function loadEnv() {
  const env = {};
  let lines = [];
  try {
    lines = readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  } catch {
    lines = [];
  }
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}
const env = { ...process.env, ...loadEnv() };
const endpoint = env.R2_S3_ENDPOINT;
const accessKeyId = env.R2_ACCESS_KEY_ID;
const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
const bucket = env.R2_BUCKET;
const origin = env.R2_ASSET_ORIGIN;
for (const [name, value] of [['R2_S3_ENDPOINT', endpoint], ['R2_ACCESS_KEY_ID', accessKeyId], ['R2_SECRET_ACCESS_KEY', secretAccessKey], ['R2_BUCKET', bucket], ['R2_ASSET_ORIGIN', origin]]) {
  if (!value) throw new Error(`缺少 ${name}（项目根 .env 或进程环境变量）`);
}
const endpointUrl = new URL(endpoint);
const originUrl = new URL(origin);
if (endpointUrl.protocol !== 'https:' || endpointUrl.username || endpointUrl.password || endpointUrl.search || endpointUrl.hash || endpointUrl.pathname !== '/') {
  throw new Error('R2_S3_ENDPOINT 必须是纯 HTTPS origin');
}
if (originUrl.protocol !== 'https:' || originUrl.username || originUrl.password || originUrl.search || originUrl.hash || originUrl.pathname !== '/') {
  throw new Error('R2_ASSET_ORIGIN 必须是纯 HTTPS origin');
}
const s3Origin = endpointUrl.origin;
const publicOrigin = originUrl.origin;

// ---- 参数校验 ----
const version = args.version;
if (typeof version !== 'string' || !/^r\d+$/.test(version)) throw new Error('必须显式提供 --version=rN');
const fileArg = args.file;
if (typeof fileArg !== 'string') throw new Error('必须显式提供 --file=<dist/runtime/ui-mount-rN.js>');
const filePath = resolve(ROOT, fileArg);
if (basename(filePath) !== `ui-mount-${version}.js`) throw new Error(`--file 文件名必须为 ui-mount-${version}.js`);
const st = await lstat(filePath);
if (!st.isFile()) throw new Error(`文件不存在：${filePath}`);
const bytes = await readFile(filePath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== env.UI_MOUNT_EXPECTED_SHA256 && env.UI_MOUNT_EXPECTED_SHA256) throw new Error('sha256 与 UI_MOUNT_EXPECTED_SHA256 不一致，拒绝上传');

const uiKey = `gensokyo-moving-garden/live/ui/ui-mount-${version}.js`;
const manifestKey = 'gensokyo-moving-garden/live/ui/ui-manifest.json';
const uiUrl = `${publicOrigin}/gensokyo-moving-garden/live/ui/ui-mount-${version}.js`;
const manifest = {
  schema_version: 'gensokyo-ui-live.v1',
  version,
  url: uiUrl,
  sha256,
  bytes: bytes.length,
  cache_policy: 'immutable-versioned',
  generated_at: new Date().toISOString(),
};
const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;

// ---- AWS SigV4（region=auto，service=s3）----
const sha256hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const encodeRfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const region = 'auto';
const service = 's3';

function signRequest({ method, key, body, headers }) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = body === null ? sha256hex('') : sha256hex(body);
  const canonicalUri = `/${bucket}/${key.split('/').map(encodeRfc3986).join('/')}`;
  const normalizedHeaders = Object.fromEntries(Object.entries(headers).map(([name, value]) => [
    name.toLowerCase(),
    String(value).trim().replace(/\s+/g, ' '),
  ]));
  const headersToSign = {
    host: endpointUrl.host,
    ...normalizedHeaders,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaderNames = Object.keys(headersToSign).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headersToSign[name]}`);
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders.join('\n') + '\n',
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    url: `${s3Origin}/${bucket}/${key.split('/').map(encodeRfc3986).join('/')}`,
    headers: {
      ...normalizedHeaders,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization,
    },
  };
}

async function headObject(key) {
  const { url, headers } = signRequest({ method: 'HEAD', key, body: null, headers: {} });
  const res = await fetch(url, { method: 'HEAD', headers });
  if (res.status === 200) {
    const etag = res.headers.get('etag');
    if (!etag) throw new Error(`HEAD ${key} 成功但缺少 ETag`);
    return { exists: true, etag };
  }
  if (res.status === 404) return { exists: false, etag: null };
  throw new Error(`HEAD ${key} 失败：HTTP ${res.status}（只有明确 404 才视为不存在）`);
}

async function putObject(key, body, mime, cacheControl, conditions = {}) {
  const { url, headers } = signRequest({
    method: 'PUT',
    key,
    body,
    headers: { 'content-type': mime, 'cache-control': cacheControl, ...conditions },
  });
  const res = await fetch(url, { method: 'PUT', headers, body });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 412) throw new Error(`条件写入拒绝：${key} 已被其他发布覆盖或已经存在`);
    throw new Error(`PUT ${key} 失败：HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  return res.status;
}

async function verifyPublicObject(url, expectedBody, mime, cacheControl) {
  const res = await fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`公网读回失败：${url} HTTP ${res.status}`);
  const actual = Buffer.from(await res.arrayBuffer());
  const expected = Buffer.isBuffer(expectedBody) ? expectedBody : Buffer.from(expectedBody);
  if (!actual.equals(expected)) throw new Error(`公网读回字节不一致：${url}`);
  const actualMime = (res.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
  if (actualMime !== mime) throw new Error(`公网 Content-Type 不一致：${url} -> ${actualMime || '(missing)'}`);
  const actualCacheControl = res.headers.get('cache-control') ?? '';
  if (actualCacheControl !== cacheControl) throw new Error(`公网 Cache-Control 不一致：${url} -> ${actualCacheControl || '(missing)'}`);
  return { bytes: actual.length, sha256: sha256hex(actual) };
}

// ---- 执行 ----
const plan = {
  mode: dryRun ? 'dry-run-only' : 'upload',
  bucket,
  objects: [
    { key: uiKey, bytes: bytes.length, mime: 'text/javascript', cache_control: 'public, max-age=31536000, immutable', first: true },
    { key: manifestKey, bytes: Buffer.byteLength(manifestBody), mime: 'application/json', cache_control: 'no-store', first: false },
  ],
  manifest,
  upload_order: ['ui-mount 先（不可变，长缓存）', 'ui-manifest 最后（no-store 指针）'],
};
console.log(JSON.stringify(plan, null, 2));

if (!dryRun) {
  const uiHead = await headObject(uiKey);
  if (uiHead.exists) throw new Error(`拒绝覆盖：${uiKey} 已存在于 R2（不可变文件名）`);
  await putObject(uiKey, bytes, 'text/javascript', 'public, max-age=31536000, immutable', { 'if-none-match': '*' });
  console.log(`已上传 ${uiKey}（${(bytes.length / 1024 / 1024).toFixed(2)} MB）`);
  const verifiedUi = await verifyPublicObject(uiUrl, bytes, 'text/javascript', 'public, max-age=31536000, immutable');
  if (verifiedUi.sha256 !== sha256) throw new Error(`公网 UI sha256 不一致：${verifiedUi.sha256}`);
  console.log(`已读回校验 ${uiUrl}（${verifiedUi.bytes} bytes，sha256=${verifiedUi.sha256}）`);
  const manifestHead = await headObject(manifestKey);
  const manifestCondition = manifestHead.exists
    ? { 'if-match': manifestHead.etag }
    : { 'if-none-match': '*' };
  await putObject(manifestKey, manifestBody, 'application/json', 'no-store', manifestCondition);
  console.log(`已上传 ${manifestKey}（指针 -> ${uiUrl}）`);
  await verifyPublicObject(`${publicOrigin}/${manifestKey}`, manifestBody, 'application/json', 'no-store');
  console.log(`已读回校验 ${publicOrigin}/${manifestKey}`);
  console.log('发布完成：已导入的卡刷新页面后经 loader 自动切换到新 UI。');
}
