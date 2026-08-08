// publish-cg-r2.mjs — 把 CG delta staging（prepare-cg-r2-update.mjs 产物）发布到 R2（S3 兼容 API，SigV4）。
// 用法：
//   node scripts/publish-cg-r2.mjs --plan=dist/r2-updates/generation-3-reimu/upload-plan.json --manifest=dist/r2-updates/generation-3-reimu/manifest.json
//   node scripts/publish-cg-r2.mjs --plan=... --manifest=... --apply
// 默认 dry-run-only；真实写入必须显式 --apply 且要求 manifest 与 plan 自洽、远端基线吻合。
// 凭据从项目根 .env（已 gitignore）读取：R2_S3_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_ASSET_ORIGIN。
// 纪律：media-first → 逐项 GET 校验 → 基线复查 → manifest-last → 最终 GET 校验；永不删除对象。
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_PREFIX = 'gensokyo-moving-garden/live/';
const MANIFEST_URL = 'https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/manifest.json';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));
const apply = args.apply === true;
const planPath = resolve(ROOT, args.plan);
const manifestPath = resolve(ROOT, args.manifest);
if (typeof args.plan !== 'string' || typeof args.manifest !== 'string') throw new Error('必须提供 --plan=<upload-plan.json> 与 --manifest=<manifest.json>');
if (!planPath.startsWith(join(ROOT, 'dist', 'r2-updates')) || !manifestPath.startsWith(join(ROOT, 'dist', 'r2-updates'))) throw new Error('plan/manifest 必须位于 dist/r2-updates 内');

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

// ---- 校验 plan / staging manifest ----
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const staging = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (plan.schema_version !== 'gensokyo-cg-r2-delta.v1') throw new Error('plan schema 非法');
if (plan.bucket !== bucket) throw new Error(`plan bucket ${plan.bucket} 与 .env R2_BUCKET ${bucket} 不一致`);
if (staging.schema_version !== 'gensokyo-r2-live.v1' || !Array.isArray(staging.files)) throw new Error('staging manifest 非法');
if (staging.generation !== plan.generation) throw new Error(`staging generation ${staging.generation} 与 plan ${plan.generation} 不一致`);
if (staging.totals?.files !== staging.files.length) throw new Error('staging 文件总数不匹配');

const sha256hex = (data) => createHash('sha256').update(data).digest('hex');
const stableJson = (v) => `${JSON.stringify(v, null, 2)}\n`;
const { manifest_sha256: declaredHash, ...withoutHash } = staging;
if (declaredHash !== sha256hex(Buffer.from(stableJson(withoutHash)))) throw new Error('staging manifest SHA-256 自校验失败');
if (plan.next_manifest_sha256 !== declaredHash) throw new Error('plan.next_manifest_sha256 与 staging 自算不一致');

for (const add of plan.additions) {
  if (!add.key.startsWith(LIVE_PREFIX)) throw new Error(`key 越出 live 前缀：${add.key}`);
  const mf = staging.files.find((f) => f.source === add.source);
  if (!mf || mf.bytes !== add.bytes || mf.sha256 !== add.sha256 || mf.mime !== 'image/png') throw new Error(`addition 与 staging manifest 不一致：${add.source}`);
  if (mf.key !== add.key) throw new Error(`key 推导不一致：${add.source}`);
  const stagedBytes = readFileSync(join(ROOT, 'dist', 'r2-updates', `generation-${plan.generation}-${staging.files.find((f) => f.source === add.source).character_id}`, 'files', ...add.source.split('/')));
  if (stagedBytes.length !== add.bytes || sha256hex(stagedBytes) !== add.sha256) throw new Error(`staging 文件字节与 plan 不一致：${add.source}`);
}

// ---- AWS SigV4（region=auto，service=s3）----
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const encodeRfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const region = 'auto';
const service = 's3';

function signRequest({ method, key, body, headers }) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = body === null ? sha256hex('') : sha256hex(body);
  const canonicalUri = `/${bucket}/${key.split('/').map(encodeRfc3986).join('/')}`;
  const canonicalHeaders = [
    `host:${new URL(endpoint).host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ];
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders.join('\n') + '\n', signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    url: `${endpoint}/${bucket}/${key.split('/').map(encodeRfc3986).join('/')}`,
    headers: { ...headers, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` },
  };
}

async function r2Put(key, body, mime, cacheControl) {
  const { url, headers } = signRequest({ method: 'PUT', key, body, headers: { 'content-type': mime, 'cache-control': cacheControl } });
  const res = await fetch(url, { method: 'PUT', headers, body });
  if (!res.ok) throw new Error(`PUT ${key} 失败：HTTP ${res.status}`);
  return res.status;
}

// 权威校验：直接对 S3 端点签名 GET 完整字节（绕过自定义域名边缘缓存）
async function r2Get(key) {
  const { url, headers } = signRequest({ method: 'GET', key, body: null, headers: {} });
  const res = await fetch(url, { method: 'GET', headers });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, mime: res.headers.get('content-type'), cache: res.headers.get('cache-control'), bytes: buf.length, sha256: sha256hex(buf) };
}

async function getFromOrigin(source, bust = false) {
  const url = `${origin}/${LIVE_PREFIX}${source}${bust ? `?v=${Date.now()}` : ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, mime: res.headers.get('content-type'), cache: res.headers.get('cache-control'), bytes: buf.length, sha256: sha256hex(buf) };
}

const summary = {
  mode: apply ? 'upload' : 'dry-run-only',
  bucket,
  generation: plan.generation,
  previous_manifest_sha256: plan.previous_manifest_sha256,
  next_manifest_sha256: plan.next_manifest_sha256,
  manifest_key: plan.manifest_key,
  upload_order: ['media-delta-first', 'per-object-origin-GET-verify', 'baseline-recheck', 'manifest-last'],
  additions: plan.additions.map(({ source, key, mime, bytes, sha256, cache_control }) => ({ source, key, mime, bytes, sha256, cache_control })),
};
console.log(JSON.stringify(summary, null, 2));

if (!apply) {
  console.log('dry-run-only：未执行任何网络写入。真实上传需追加 --apply。');
  process.exit(0);
}

// ---- 碰撞审计（远端 404 允许 PUT；200 同哈希跳过；200 异哈希停止）----
// 注意：生产域名 404 有 max-age=14400 边缘缓存，碰撞审计改以 S3 端点（权威）为准。
const remote = await fetch(MANIFEST_URL, { cache: 'no-store' });
if (!remote.ok) throw new Error(`生产 manifest GET 失败：HTTP ${remote.status}`);
const remoteManifest = await remote.json();
if (remoteManifest.manifest_sha256 !== plan.previous_manifest_sha256 || remoteManifest.generation !== plan.generation - 1) {
  throw new Error(`生产基线变化：remote generation ${remoteManifest.generation} hash ${remoteManifest.manifest_sha256}，预期 generation ${plan.generation - 1} / ${plan.previous_manifest_sha256}。停止。`);
}

const audit = [];
for (const add of plan.additions) {
  const probe = await r2Get(add.key);
  if (probe.status === 200 && probe.sha256 === add.sha256 && probe.bytes === add.bytes) {
    audit.push({ source: add.source, verdict: 'skip-same-hash', ...probe });
  } else if (probe.status === 404) {
    audit.push({ source: add.source, verdict: 'allow-put', ...probe });
  } else {
    throw new Error(`碰撞审计停止：${add.source} 远端 status=${probe.status} sha256=${probe.sha256}，与本地 ${add.sha256} 冲突`);
  }
}

// ---- 媒体上传（全部 PUT，不因边缘缓存中断）----
const putResults = [];
for (const add of plan.additions) {
  if (audit.find((a) => a.source === add.source)?.verdict === 'skip-same-hash') { putResults.push({ source: add.source, action: 'skipped' }); continue; }
  const stagedBytes = readFileSync(join(ROOT, 'dist', 'r2-updates', `generation-${plan.generation}-reimu`, 'files', ...add.source.split('/')));
  await r2Put(add.key, stagedBytes, 'image/png', 'public, max-age=0, must-revalidate');
  putResults.push({ source: add.source, action: 'put' });
  console.log(`已 PUT ${add.source}`);
}

// ---- 逐项校验：S3 端点权威 GET + 生产域名 cache-busting GET ----
const uploaded = [];
for (const add of plan.additions) {
  const s3 = await r2Get(add.key);
  if (s3.status !== 200 || s3.mime !== 'image/png' || s3.bytes !== add.bytes || s3.sha256 !== add.sha256) {
    throw new Error(`S3 权威校验失败：${add.source} ${JSON.stringify(s3)}`);
  }
  const originCheck = await getFromOrigin(add.source, true);
  if (originCheck.status !== 200 || originCheck.mime !== 'image/png' || originCheck.bytes !== add.bytes || originCheck.sha256 !== add.sha256) {
    throw new Error(`生产域名校验失败：${add.source} ${JSON.stringify(originCheck)}`);
  }
  uploaded.push({ source: add.source, s3: { bytes: s3.bytes, sha256: s3.sha256 }, origin: { status: originCheck.status, mime: originCheck.mime, bytes: originCheck.bytes, sha256: originCheck.sha256 } });
  console.log(`已核验 ${add.source}`);
}

// ---- 基线复查（媒体后、manifest 前）----
const baseline2 = await fetch(MANIFEST_URL, { cache: 'no-store' });
const remote2 = await baseline2.json();
if (remote2.manifest_sha256 !== plan.previous_manifest_sha256 || remote2.generation !== plan.generation - 1) {
  throw new Error(`并发基线变化：manifest 未上传，停止。`);
}

// ---- manifest-last ----
const manifestBody = Buffer.from(stableJson(staging));
await r2Put(plan.manifest_key, manifestBody, 'application/json', 'no-store');

// ---- 最终生产 GET 校验 ----
const finalRes = await fetch(MANIFEST_URL, { cache: 'no-store' });
const finalManifest = await finalRes.json();
const finalHash = finalManifest.manifest_sha256;
const finalBody = Buffer.from(await finalRes.arrayBuffer());
const finalSelfHash = sha256hex(Buffer.from(stableJson((() => { const { manifest_sha256: h, ...rest } = finalManifest; return rest; })())));
const ok = finalManifest.generation === plan.generation && finalHash === plan.next_manifest_sha256 && finalManifest.totals.files === staging.files.length;
const finalSexual = finalManifest.files.filter((f) => f.source?.startsWith('characters/reimu/gal/sexual'));
if (!ok) throw new Error(`最终 manifest 校验失败：${JSON.stringify({ generation: finalManifest.generation, hash: finalHash, files: finalManifest.totals?.files })}`);

console.log(JSON.stringify({
  done: true,
  collision_audit: audit,
  uploaded: uploaded.length,
  manifest: { generation: finalManifest.generation, files: finalManifest.totals.files, bytes: finalManifest.totals.bytes, sha256: finalHash, self_hash_ok: finalSelfHash === finalHash, http: finalRes.status, mime: finalRes.headers.get('content-type'), cache: finalRes.headers.get('cache-control') },
  reimu_sexual_entries: finalSexual.length,
}, null, 2));
