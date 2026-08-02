export interface RemoteLiveConfig {
  mode: 'remote-r2-live';
  baseUrl: string;
  manifestPath: 'gensokyo-moving-garden/live/manifest.json';
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

export interface RemoteLiveManifest {
  schema_version: 'gensokyo-r2-live.v1';
  generation: number;
  updated_at: string;
  asset_base_url: string;
  object_prefix: 'gensokyo-moving-garden/live/';
  totals: { files: number; bytes: number };
  files: RemoteReleaseFile[];
  manifest_sha256: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MIME_BY_EXTENSION: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', wav: 'audio/wav' };
const PRIORITIES = new Set(['entry-critical', 'entry-contextual', 'background-core', 'scene-on-demand', 'gal-deferred']);
const ENTRY_GATES = new Set(['critical', 'contextual', 'none']);
const LIVE_PREFIX = 'gensokyo-moving-garden/live/';
const LIVE_MANIFEST_PATH = `${LIVE_PREFIX}manifest.json` as const;

function trustedBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('R2 baseUrl 必须是无凭据、无查询参数、无路径的 HTTPS origin');
  return url.origin;
}

export function validateRemoteR2Config(value: unknown): RemoteLiveConfig {
  const config = value as Partial<RemoteLiveConfig>;
  if (config?.mode !== 'remote-r2-live' || config.manifestPath !== LIVE_MANIFEST_PATH) throw new Error('远程素材模式必须在构建时固定为 remote-r2-live');
  return { mode: 'remote-r2-live', baseUrl: trustedBaseUrl(config.baseUrl ?? ''), manifestPath: LIVE_MANIFEST_PATH };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function assertFile(file: RemoteReleaseFile) {
  if (!file || typeof file !== 'object' || file.logical_id !== `asset:${file.source}`) throw new Error('live manifest logical_id/source 不一致');
  if (!/^[\x20-\x7e]+$/.test(file.source) || file.source.includes('\\') || file.source.split('/').includes('..') || file.source.startsWith('/')) throw new Error(`live manifest source 越界：${file.source}`);
  if (file.key !== `${LIVE_PREFIX}${file.source}`) throw new Error(`live manifest key 越界：${file.key}`);
  if (MIME_BY_EXTENSION[file.source.split('.').pop()?.toLowerCase() ?? ''] !== file.mime) throw new Error(`live MIME 与扩展名不一致：${file.source}`);
  if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !SHA256_PATTERN.test(file.sha256) || file.cache_control !== 'public, max-age=0, must-revalidate') throw new Error(`live 文件字段非法：${file.source}`);
  if (!PRIORITIES.has(file.priority_class) || !ENTRY_GATES.has(file.entry_gate)) throw new Error(`live 调度字段非法：${file.source}`);
}

export async function resolveRemoteRelease(configValue: unknown, fetcher: typeof fetch = fetch) {
  const config = validateRemoteR2Config(configValue);
  const response = await fetcher(`${config.baseUrl}/${LIVE_MANIFEST_PATH}`, { cache: 'no-store', credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`R2 live manifest HTTP ${response.status}`);
  const manifest = await response.json() as RemoteLiveManifest;
  if (manifest.schema_version !== 'gensokyo-r2-live.v1' || !Number.isSafeInteger(manifest.generation) || manifest.generation < 1) throw new Error('R2 live manifest schema 或 generation 非法');
  if (trustedBaseUrl(manifest.asset_base_url) !== config.baseUrl || manifest.object_prefix !== LIVE_PREFIX || !Array.isArray(manifest.files) || manifest.totals?.files !== manifest.files.length) throw new Error('R2 live manifest origin、prefix 或文件总数不匹配');
  manifest.files.forEach(assertFile);
  if (new Set(manifest.files.map((file) => file.logical_id)).size !== manifest.files.length || new Set(manifest.files.map((file) => file.key)).size !== manifest.files.length || manifest.files.reduce((sum, file) => sum + file.bytes, 0) !== manifest.totals.bytes) throw new Error('R2 live manifest 文件重复或字节总数不匹配');
  const { manifest_sha256: declaredHash, ...withoutHash } = manifest;
  if (!SHA256_PATTERN.test(declaredHash) || await sha256(`${JSON.stringify(withoutHash, null, 2)}\n`) !== declaredHash) throw new Error('R2 live manifest SHA-256 校验失败');
  return { manifest, urls: new Map(manifest.files.map((file) => [file.logical_id, `${config.baseUrl}/${file.key}`])) };
}
