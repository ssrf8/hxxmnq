export interface RemoteR2Config {
  mode: 'remote-r2';
  baseUrl: string;
  releaseId: string;
  manifestSha256: string;
}

export interface RemoteReleaseFile {
  logical_id: string;
  source: string;
  key: string;
  mime: string;
  bytes: number;
  sha256: string;
  cache_control: string;
  required: boolean;
  fallback: string;
  priority_class: string;
  bundle: string;
  trigger: string;
  entry_gate: string;
  category: string;
}

export interface RemoteReleaseManifest {
  schema_version: 'gensokyo-r2-release.v2';
  release_id: string;
  asset_base_url: string;
  object_prefix: string;
  totals: { files: number; bytes: number };
  files: RemoteReleaseFile[];
  manifest_sha256: string;
}

const RELEASE_PATTERN = /^[a-z0-9][a-z0-9.-]{2,62}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', wav: 'audio/wav',
};
const PRIORITIES = new Set(['entry-critical', 'entry-contextual', 'background-core', 'scene-on-demand', 'gal-deferred']);
const ENTRY_GATES = new Set(['critical', 'contextual', 'none']);

function trustedBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('R2 baseUrl 必须是无凭据、无查询参数、无路径的 HTTPS origin');
  }
  return url.origin;
}

export function validateRemoteR2Config(value: unknown): RemoteR2Config {
  const config = value as Partial<RemoteR2Config>;
  if (config?.mode !== 'remote-r2') throw new Error('远程素材模式必须在构建时固定为 remote-r2');
  if (!RELEASE_PATTERN.test(config.releaseId ?? '')) throw new Error('远程素材 releaseId 非法');
  if (!SHA256_PATTERN.test(config.manifestSha256 ?? '')) throw new Error('远程素材 manifestSha256 非法');
  return { mode: 'remote-r2', baseUrl: trustedBaseUrl(config.baseUrl ?? ''), releaseId: config.releaseId!, manifestSha256: config.manifestSha256! };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function assertFile(file: RemoteReleaseFile, prefix: string) {
  if (!file || typeof file !== 'object') throw new Error('release manifest 含非法文件条目');
  if (typeof file.logical_id !== 'string' || file.logical_id !== `asset:${file.source}`) throw new Error('release logical_id/source 不一致');
  if (!/^[\x20-\x7e]+$/.test(file.source) || file.source.includes('\\') || file.source.split('/').includes('..') || file.source.startsWith('/')) throw new Error(`release source 越界：${file.source}`);
  if (file.key !== `${prefix}${file.source}`) throw new Error(`release key 越界：${file.key}`);
  const extension = file.source.split('.').pop()?.toLowerCase() ?? '';
  if (MIME_BY_EXTENSION[extension] !== file.mime) throw new Error(`release MIME 与扩展名不一致：${file.source}`);
  if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !SHA256_PATTERN.test(file.sha256)) throw new Error(`release 字节或哈希非法：${file.source}`);
  if (file.cache_control !== 'public, max-age=31536000, immutable') throw new Error(`release 缓存策略非法：${file.source}`);
  if (!PRIORITIES.has(file.priority_class) || !ENTRY_GATES.has(file.entry_gate)) throw new Error(`release 调度字段非法：${file.source}`);
  for (const field of ['bundle', 'trigger', 'category', 'fallback'] as const) {
    if (typeof file[field] !== 'string' || !file[field]) throw new Error(`release 缺少 ${field}：${file.source}`);
  }
}

export async function resolveRemoteRelease(configValue: unknown, fetcher: typeof fetch = fetch) {
  const config = validateRemoteR2Config(configValue);
  const prefix = `gensokyo-moving-garden/releases/${config.releaseId}/`;
  const manifestUrl = `${config.baseUrl}/${prefix}manifest.json`;
  const response = await fetcher(manifestUrl, { cache: 'no-store', credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`R2 release manifest HTTP ${response.status}`);
  const manifest = await response.json() as RemoteReleaseManifest;
  if (manifest.schema_version !== 'gensokyo-r2-release.v2' || manifest.release_id !== config.releaseId) throw new Error('R2 release schema 或 releaseId 不匹配');
  if (trustedBaseUrl(manifest.asset_base_url) !== config.baseUrl || manifest.object_prefix !== prefix) throw new Error('R2 release origin 或 object_prefix 不匹配');
  if (!Array.isArray(manifest.files) || manifest.totals?.files !== manifest.files.length) throw new Error('R2 release 文件总数不匹配');
  manifest.files.forEach((file) => assertFile(file, prefix));
  if (new Set(manifest.files.map((file) => file.logical_id)).size !== manifest.files.length || new Set(manifest.files.map((file) => file.key)).size !== manifest.files.length) throw new Error('R2 release 含重复 logical_id 或 key');
  if (manifest.files.reduce((sum, file) => sum + file.bytes, 0) !== manifest.totals.bytes) throw new Error('R2 release 字节总数不匹配');
  const { manifest_sha256: declaredHash, ...withoutHash } = manifest;
  const actualHash = await sha256(`${JSON.stringify(withoutHash, null, 2)}\n`);
  if (declaredHash !== config.manifestSha256 || actualHash !== declaredHash) throw new Error('R2 release manifest SHA-256 校验失败');
  return {
    manifest,
    urls: new Map(manifest.files.map((file) => [file.logical_id, `${config.baseUrl}/${file.key}`])),
  };
}
