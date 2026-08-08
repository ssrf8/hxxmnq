// publish-cg-r2-finalize.mjs — 中断恢复收尾：媒体已全部就绪时，只执行 manifest-last 与最终验证。
// 前置条件：publish-cg-r2.mjs --apply 已把全部媒体 PUT 并经 S3 端点确认；本脚本只做
//   1) 生产域名 cache-busting 校验全部 additions
//   2) 生产基线复查（generation / manifest hash 必须等于 plan.previous_manifest_sha256）
//   3) PUT live/manifest.json（application/json, no-store）
//   4) 最终生产 GET 验证 generation、hash、totals、sexual 条目
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
const planPath = resolve(ROOT, args.plan);
const manifestPath = resolve(ROOT, args.manifest);
if (typeof args.plan !== 'string' || typeof args.manifest !== 'string') throw new Error('必须提供 --plan 与 --manifest');
if (!planPath.startsWith(join(ROOT, 'dist', 'r2-updates')) || !manifestPath.startsWith(join(ROOT, 'dist', 'r2-updates'))) throw new Error('plan/manifest 必须位于 dist/r2-updates 内');

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  } catch { /* ignore */ }
  return env;
}
const env = { ...process.env, ...loadEnv() };
const endpoint = env.R2_S3_ENDPOINT, accessKeyId = env.R2_ACCESS_KEY_ID, secretAccessKey = env.R2_SECRET_ACCESS_KEY, bucket = env.R2_BUCKET, origin = env.R2_ASSET_ORIGIN;
for (const [name, value] of [['R2_S3_ENDPOINT', endpoint], ['R2_ACCESS_KEY_ID', accessKeyId], ['R2_SECRET_ACCESS_KEY', secretAccessKey], ['R2_BUCKET', bucket], ['R2_ASSET_ORIGIN', origin]]) {
  if (!value) throw new Error(`缺少 ${name}`);
}

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const staging = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (plan.schema_version !== 'gensokyo-cg-r2-delta.v1' || staging.schema_version !== 'gensokyo-r2-live.v1') throw new Error('plan/staging schema 非法');
if (staging.generation !== plan.generation) throw new Error('generation 不一致');

const sha256hex = (d) => createHash('sha256').update(d).digest('hex');
const stableJson = (v) => `${JSON.stringify(v, null, 2)}\n`;
const { manifest_sha256: declaredHash, ...withoutHash } = staging;
if (declaredHash !== sha256hex(Buffer.from(stableJson(withoutHash)))) throw new Error('staging manifest 自校验失败');

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const encodeRfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const region = 'auto', service = 's3';
function signRequest({ method, key, body, headers }) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = body === null ? sha256hex('') : sha256hex(body);
  const canonicalUri = `/${bucket}/${key.split('/').map(encodeRfc3986).join('/')}`;
  const canonicalHeaders = [`host:${new URL(endpoint).host}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`];
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
}
async function getOrigin(source, bust = false) {
  const res = await fetch(`${origin}/${LIVE_PREFIX}${source}${bust ? `?v=${Date.now()}` : ''}`, { cache: 'no-store' });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, mime: res.headers.get('content-type'), bytes: buf.length, sha256: sha256hex(buf) };
}

// 1) 生产域名校验全部 additions
const mediaChecks = [];
for (const add of plan.additions) {
  const o = await getOrigin(add.source, true);
  if (o.status !== 200 || o.mime !== 'image/png' || o.bytes !== add.bytes || o.sha256 !== add.sha256) throw new Error(`生产域名校验失败：${add.source} ${JSON.stringify(o)}`);
  mediaChecks.push({ source: add.source, status: o.status, bytes: o.bytes, sha256: o.sha256 });
}
console.log('媒体生产域名校验：', mediaChecks.length, '/', plan.additions.length, '通过');

// 2) 基线复查
const base = await (await fetch(MANIFEST_URL, { cache: 'no-store' })).json();
if (base.manifest_sha256 !== plan.previous_manifest_sha256 || base.generation !== plan.generation - 1) {
  throw new Error(`基线变化：remote generation ${base.generation} hash ${base.manifest_sha256}，预期 ${plan.generation - 1}/${plan.previous_manifest_sha256}`);
}
console.log('基线复查通过：', base.generation, base.manifest_sha256);

// 3) manifest-last
await r2Put(plan.manifest_key, Buffer.from(stableJson(staging)), 'application/json', 'no-store');
console.log('已 PUT manifest（', plan.manifest_key, '）');

// 4) 最终验证
const finalRes = await fetch(MANIFEST_URL, { cache: 'no-store' });
const finalManifest = await finalRes.json();
const { manifest_sha256: fh, ...fRest } = finalManifest;
const selfOk = fh === sha256hex(Buffer.from(stableJson(fRest)));
const sexual = finalManifest.files.filter((f) => f.source?.startsWith('characters/reimu/gal/sexual'));
const ok = finalManifest.generation === plan.generation && fh === plan.next_manifest_sha256 && finalManifest.totals.files === staging.files.length;
console.log(JSON.stringify({
  done: ok, self_hash_ok: selfOk,
  generation: finalManifest.generation, files: finalManifest.totals.files, bytes: finalManifest.totals.bytes,
  sha256: fh, http: finalRes.status, mime: finalRes.headers.get('content-type'), cache: finalRes.headers.get('cache-control'),
  reimu_sexual_entries: sexual.length,
}, null, 2));
if (!ok || !selfOk) process.exit(1);
