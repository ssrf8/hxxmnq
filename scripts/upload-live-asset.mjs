// upload-live-asset.mjs — 把单个 live 公共资产上传到 R2（S3 兼容 API，SigV4 直传）。
// 用法：
//   node scripts/upload-live-asset.mjs --source=src/assets/maps/garden-base-owner-v4.webp --key=gensokyo-moving-garden/live/maps/garden-base-owner-v4.webp --mime=image/webp --dry-run
//   node scripts/upload-live-asset.mjs --source=... --key=... --mime=image/webp --apply
// 默认 dry-run-only；真实写入必须显式 --apply。
// 纪律：只允许 gensokyo-moving-garden/live/ 前缀（公共资产）；拒绝 live/ui/ 与 test/（UI 通道走 publish-ui.mjs）；
//       默认拒绝覆盖已存在对象（--replace 才允许，用于文档约定的“更新图片覆盖同名对象”）；
//       上传后逐项读回校验 MIME / 长度 / SHA-256 / 缓存头。
// 凭据从项目根 .env（已 gitignore）读取：R2_S3_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_ASSET_ORIGIN。
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
const apply = args.apply === true;
const replace = args.replace === true;

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
if (endpointUrl.protocol !== 'https:' || endpointUrl.pathname !== '/') throw new Error('R2_S3_ENDPOINT 必须是纯 HTTPS origin');
if (originUrl.protocol !== 'https:' || originUrl.pathname !== '/') throw new Error('R2_ASSET_ORIGIN 必须是纯 HTTPS origin');
const s3Origin = endpointUrl.origin;
const publicOrigin = originUrl.origin;

// ---- 参数校验与停止线 ----
const source = args.source;
if (typeof source !== 'string') throw new Error('必须显式提供 --source=<本地相对路径>');
const sourcePath = resolve(ROOT, source);
const st = await lstat(sourcePath);
if (!st.isFile()) throw new Error(`本地文件不存在：${sourcePath}`);
const bytes = await readFile(sourcePath);
const sha256 = createHash('sha256').update(bytes).digest('hex');

const key = args.key;
if (typeof key !== 'string') throw new Error('必须显式提供 --key=gensokyo-moving-garden/live/<source>');
// 停止线：只允许 live/ 公共资产前缀。
if (!key.startsWith('gensokyo-moving-garden/live/')) throw new Error(`拒绝上传：${key} 不在 live/ 公共资产前缀内`);
if (key.startsWith('gensokyo-moving-garden/live/ui/')) throw new Error(`拒绝上传：${key} 属于 UI 通道对象，请使用 scripts/publish-ui.mjs`);
if (key.startsWith('gensokyo-moving-garden/test/')) throw new Error(`拒绝上传：${key} 属于测试通道，不允许用本脚本写入`);
if (!key.endsWith(`/${basename(sourcePath)}`)) throw new Error(`--key 与本地文件名不一致：${key} != .../${basename(sourcePath)}`);
const mime = args.mime;
if (typeof mime !== 'string') throw new Error('必须显式提供 --mime=image/webp 等');
const cacheControl = args.cache ?? 'public, max-age=0, must-revalidate';
const uiUrl = `${publicOrigin}/${key}`;

// ---- AWS SigV4（region=auto，service=s3）----
const sha256hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const encodeRfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const region = 'auto';
const service = 's3';

function signRequest({ method, key: objectKey, body, headers }) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = body === null ? sha256hex('') : sha256hex(body);
  const canonicalUri = `/${bucket}/${objectKey.split('/').map(encodeRfc3986).join('/')}`;
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
  return {
    ...normalizedHeaders,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function headObject(objectKey) {
  const headers = signRequest({ method: 'HEAD', key: objectKey, body: null, headers: {} });
  const res = await fetch(`${s3Origin}/${bucket}/${objectKey.split('/').map(encodeRfc3986).join('/')}`, {
    method: 'HEAD',
    headers,
    redirect: 'error',
  });
  if (res.status === 200) {
    return {
      exists: true,
      etag: res.headers.get('etag'),
      bytes: Number(res.headers.get('content-length')),
    };
  }
  if (res.status === 404) return { exists: false };
  const detail = await res.text().catch(() => '');
  throw new Error(`HEAD ${objectKey} 失败：HTTP ${res.status} ${detail.slice(0, 300)}`);
  return {
    exists: true,
    etag: res.headers.get('etag'),
    bytes: Number(res.headers.get('content-length')),
  };
}

async function putObject(objectKey, body, mimeType, cache) {
  const headers = signRequest({
    method: 'PUT',
    key: objectKey,
    body,
    headers: { 'content-type': mimeType, 'cache-control': cache },
  });
  const res = await fetch(`${s3Origin}/${bucket}/${objectKey.split('/').map(encodeRfc3986).join('/')}`, {
    method: 'PUT',
    headers,
    body,
    redirect: 'error',
  });
  if (res.status !== 200) {
    const detail = await res.text().catch(() => '');
    throw new Error(`PUT ${objectKey} 失败：HTTP ${res.status} ${detail.slice(0, 300)}`);
  }
}

async function verifyPublicObject(url, mimeType, cache) {
  // 内容校验：GET no-store 严格验证长度 / SHA-256 / MIME。
  const res = await fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' }, redirect: 'error' });
  if (!res.ok) throw new Error(`公网读回 ${url} 失败：HTTP ${res.status}`);
  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.toLowerCase().includes(mimeType.split('/')[0])) {
    throw new Error(`公网读回 MIME 不符：${contentType}`);
  }
  const remote = Buffer.from(await res.arrayBuffer());
  if (remote.length !== bytes.length) throw new Error(`公网读回长度不符：${remote.length} != ${bytes.length}`);
  if (createHash('sha256').update(remote).digest('hex') !== sha256) throw new Error('公网读回 SHA-256 不符');
  // 缓存头权威在 R2 源站：用 HEAD 绕过 Cloudflare 边缘缓存规则校验。
  // 注意：当前 Cloudflare 对 /live/maps/* 的 GET 会强制改写为 max-age=14400（v3/v4 一致，REVALIDATED
  // 保证源站更新后重新验证），因此不能拿 GET 头做严格比较。
  const headRes = await fetch(url, { method: 'HEAD', headers: { 'cache-control': 'no-cache' }, redirect: 'error' });
  const actualCache = headRes.headers.get('cache-control') ?? '';
  if (actualCache !== cache) {
    throw new Error(`源站（HEAD）缓存头不符：${actualCache} != ${cache}`);
  }
}

// ---- 计划 ----
const remoteState = await headObject(key);
console.log(JSON.stringify({
  mode: apply ? 'upload' : 'dry-run-only',
  bucket,
  key,
  url: uiUrl,
  mime,
  cache_control: cacheControl,
  bytes: bytes.length,
  sha256,
  remote_exists: remoteState.exists,
  remote_etag: remoteState.etag ?? null,
  collision_policy: replace ? 'replace-allowed' : 'refuse-overwrite',
}, null, 2));
console.log(`key         = ${key}`);
console.log(`bytes       = ${bytes.length}`);
console.log(`sha256      = ${sha256}`);
if (apply) {
  if (remoteState.exists && !replace) {
    throw new Error(`拒绝覆盖已存在对象：${key}（如需覆盖请加 --replace）`);
  }
  await putObject(key, bytes, mime, cacheControl);
  console.log(`已上传 ${key}`);
  await verifyPublicObject(uiUrl, mime, cacheControl);
  console.log(`已读回校验 ${uiUrl}（${bytes.length} bytes，sha256=${sha256}）`);
  console.log('发布完成：引用该素材的 UI 刷新后可见。');
} else {
  console.log('dry-run 结束：未执行任何远端写入。');
}
