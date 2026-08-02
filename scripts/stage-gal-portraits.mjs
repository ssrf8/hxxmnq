import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOT = resolve(ROOT, '旧素材', '素材处理', 'CG');
const OUTPUT_ROOT = resolve(ROOT, 'src', 'assets', 'characters');
const dryRun = process.argv.includes('--dry-run');
const replace = process.argv.includes('--replace');

const characters = {
  reimu: ['灵梦', '透明背景'],
  marisa: ['魔理沙', '透明背景'],
  cirno: ['琪露诺', '透明背景'],
  alice: ['爱丽丝'],
  nitori: ['河城荷取'],
  mystia: ['米斯蒂娅'],
  suika: ['萃香'],
  sakuya: ['咲夜'],
};
const reactions = { 正常: 'neutral', 开心: 'smile', 害羞: 'shy', 哭泣: 'sad', 生气: 'angry' };
const modes = { sfw: 'normal', nsfw: 'nude' };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const records = [];
for (const [characterId, sourceSegments] of Object.entries(characters)) {
  for (const [sourceReaction, reactionId] of Object.entries(reactions)) {
    for (const [sourceVariant, mode] of Object.entries(modes)) {
      const source = resolve(SOURCE_ROOT, ...sourceSegments, `${sourceReaction} ${sourceVariant}.png`);
      const target = resolve(OUTPUT_ROOT, characterId, 'gal', mode, `${characterId}-${mode}-${reactionId}-v1.png`);
      const sourceBytes = await readFile(source).catch(() => null);
      if (!sourceBytes) throw new Error(`缺少所有者源图：${relative(ROOT, source)}`);
      const targetExists = await stat(target).then(() => true).catch(() => false);
      if (targetExists && !replace) {
        const targetBytes = await readFile(target);
        if (sha256(sourceBytes) !== sha256(targetBytes)) {
          throw new Error(`目标与原图不一致；请审查后才允许覆盖：${relative(ROOT, target)}`);
        }
      } else if (!dryRun) {
        await mkdir(resolve(target, '..'), { recursive: true });
        await copyFile(source, target);
      }
      records.push({
        character_id: characterId,
        mode,
        reaction_id: reactionId,
        source: relative(ROOT, source).replaceAll('\\', '/'),
        target: relative(ROOT, target).replaceAll('\\', '/'),
        bytes: sourceBytes.length,
        sha256: sha256(sourceBytes),
      });
    }
  }
}

console.log(JSON.stringify({ files: records.length, dry_run: dryRun, assets: records }, null, 2));
