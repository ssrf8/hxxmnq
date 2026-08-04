import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POSE_ACTS = {
  missionary: ['vaginal', 'anal'], rear: ['vaginal', 'anal'], prone: ['vaginal', 'anal'],
  rear_standing: ['vaginal', 'anal'], cowgirl: ['vaginal', 'anal'], reverse_cowgirl: ['vaginal', 'anal'],
  side: ['vaginal', 'anal'], front_standing: ['vaginal', 'anal'], seated: ['vaginal', 'anal'],
  lotus: ['vaginal', 'anal'], leg_raise_split: ['vaginal', 'anal'],
  sixty_nine: ['none'], breast: ['none'], oral: ['none'], manual: ['none'], foot_single: ['none'], foot_double: ['none'],
};
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));
if (typeof args.plan !== 'string') throw new Error('必须提供 --plan=CG/<角色>/r2-upload-plan.json');
if (typeof args['manifest-url'] !== 'string' || !args['manifest-url'].startsWith('https://')) throw new Error('必须提供 HTTPS --manifest-url');
const planPath = resolve(ROOT, args.plan);
if (!planPath.startsWith(join(ROOT, 'CG'))) throw new Error('plan 必须位于 CG 目录');
const plan = JSON.parse(await readFile(planPath, 'utf8'));
if (plan.schema_version !== 'gensokyo-cg-upload-plan.v1' || !Array.isArray(plan.entries)) throw new Error('上传 plan schema 非法');
const response = await fetch(args['manifest-url'], { cache: 'no-store' });
if (!response.ok) throw new Error(`远端 manifest HTTP ${response.status}`);
const remote = await response.json();
if (remote.schema_version !== 'gensokyo-r2-live.v1' || !Number.isSafeInteger(remote.generation) || !Array.isArray(remote.files)) throw new Error('远端 manifest 非法');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const { manifest_sha256: remoteDeclaredHash, ...verifiedRemoteWithoutHash } = remote;
if (sha256(Buffer.from(stableJson(verifiedRemoteWithoutHash))) !== remoteDeclaredHash) throw new Error('远端 manifest SHA-256 校验失败');
const generation = remote.generation + 1;
const outputRoot = join(ROOT, 'dist', 'r2-updates', `generation-${generation}-${plan.character_id}`);
await rm(outputRoot, { recursive: true, force: true });
const additions = [];
const remoteBySource = new Map(remote.files.map((file) => [file.source, file]));
const planSources = new Set();
for (const entry of plan.entries) {
  const expected = `characters/${plan.character_id}/gal/sexual/${entry.pose_id}/${entry.act_id}/${entry.candidate_no}.png`;
  if (entry.source !== expected) throw new Error(`source 与 pose/act/candidate 不一致：${entry.source}`);
  if (!POSE_ACTS[entry.pose_id]?.includes(entry.act_id) || !/^\d{2}$/u.test(entry.candidate_no) || entry.candidate_no === '00') throw new Error(`pose/act/candidate 不在冻结合同：${entry.source}`);
  if (planSources.has(entry.source)) throw new Error(`上传 plan source 重复：${entry.source}`);
  planSources.add(entry.source);
  const ownerPath = join(dirname(planPath), entry.owner_file);
  const bytes = await readFile(ownerPath);
  if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`原图字节与 plan 不一致：${entry.owner_file}`);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`不是 PNG：${entry.owner_file}`);
  const existing = remoteBySource.get(entry.source);
  if (existing) {
    if (existing.mime !== 'image/png' || existing.bytes !== entry.bytes || existing.sha256 !== entry.sha256) throw new Error(`已发布 source 与本地原图冲突：${entry.source}`);
    continue;
  }
  const stagedPath = join(outputRoot, 'files', ...entry.source.split('/'));
  await mkdir(dirname(stagedPath), { recursive: true });
  await copyFile(ownerPath, stagedPath);
  additions.push({
    logical_id: `asset:${entry.source}`, source: entry.source, key: `${remote.object_prefix}${entry.source}`,
    mime: 'image/png', bytes: entry.bytes, sha256: entry.sha256,
    cache_control: 'public, max-age=0, must-revalidate', required: false,
    fallback: 'gal-nude-then-normal', priority_class: 'gal-deferred', bundle: `gal:${plan.character_id}`,
    trigger: 'sexual-pose-demand', entry_gate: 'none', category: 'gal',
    character_id: plan.character_id, visual_mode: 'sexual', pose_id: entry.pose_id, act_id: entry.act_id,
    candidate_no: entry.candidate_no, pool_id: `gal.${plan.character_id}.sexual.${entry.pose_id}.${entry.act_id}`, weight: 1,
  });
}
if (!additions.length) throw new Error('上传计划没有尚未发布的新条目；拒绝生成空 generation');
const files = [...remote.files, ...additions].sort((left, right) => left.source.localeCompare(right.source, 'en'));
const { manifest_sha256: _oldHash, ...remoteWithoutHash } = remote;
const manifestWithoutHash = {
  ...remoteWithoutHash,
  generation,
  updated_at: new Date().toISOString(),
  totals: { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) },
  files,
};
const manifest = { ...manifestWithoutHash, manifest_sha256: sha256(Buffer.from(stableJson(manifestWithoutHash))) };
await mkdir(outputRoot, { recursive: true });
await writeFile(join(outputRoot, 'manifest.json'), stableJson(manifest), 'utf8');
await writeFile(join(outputRoot, 'upload-plan.json'), stableJson({
  schema_version: 'gensokyo-cg-r2-delta.v1', bucket: 'hxxwy', generation,
  previous_manifest_sha256: remote.manifest_sha256, next_manifest_sha256: manifest.manifest_sha256,
  additions: additions.map(({ source, key, mime, bytes, sha256, cache_control }) => ({ source, key, mime, bytes, sha256, cache_control })),
  manifest_key: `${remote.object_prefix}manifest.json`, manifest_last: true,
}), 'utf8');
console.log(JSON.stringify({ output: outputRoot, generation, additions: additions.length, files: manifest.totals.files, bytes: manifest.totals.bytes, manifest_sha256: manifest.manifest_sha256 }, null, 2));
