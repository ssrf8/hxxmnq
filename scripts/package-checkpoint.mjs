import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VERSION = '0.2.0';
const checkpointArg = process.argv.find(argument => argument.startsWith('--checkpoint='));
if (!checkpointArg) throw new Error('缺少必需参数：--checkpoint=0.2.0-rN');
const CHECKPOINT = checkpointArg.slice('--checkpoint='.length).trim();
if (!/^0\.2\.0-r[1-9][0-9]*$/u.test(CHECKPOINT)) {
  throw new Error(`非法检查点：${CHECKPOINT}`);
}
const CHECKPOINT_SUFFIX = CHECKPOINT.split('-').at(-1);
const OUTPUT_DIR = path.resolve('dist', `checkpoint-${CHECKPOINT}`);
const OUTPUT_FILE = path.join(OUTPUT_DIR, `幻想乡物语-测试检查点-${CHECKPOINT}.json`);
const WORLDBOOK_NAME = `幻想乡物语·移动庭园 ${CHECKPOINT}`;
const DRY_RUN = process.argv.includes('--dry-run');
const REPLACE_EXISTING = process.argv.includes('--replace');
const EXPECT_REMOTE_R2 = process.argv.includes('--expect-remote-r2');
const uiDeliveryArg = process.argv.find(argument => argument.startsWith('--ui-delivery='));
const UI_DELIVERY = uiDeliveryArg ? uiDeliveryArg.slice('--ui-delivery='.length) : 'embedded';
if (!['embedded', 'remote'].includes(UI_DELIVERY)) throw new Error('--ui-delivery 只允许 embedded 或 remote');

const source = async file => readFile(path.resolve(file), 'utf8');
const json = async file => JSON.parse(await source(file));
const exists = async file => access(file).then(() => true, () => false);

const profile = await json('project/profile.json');
const manifest = await json('project/manifest.json');
if (profile.version !== VERSION || manifest.version !== VERSION) {
  throw new Error(`版本不一致：profile=${profile.version}, manifest=${manifest.version}, packer=${VERSION}`);
}
if (!manifest.planned_checkpoint_sequence?.includes(CHECKPOINT)) {
  throw new Error(`检查点未登记在 planned_checkpoint_sequence：${CHECKPOINT}`);
}
let archivedOutput = '';
if (!DRY_RUN && await exists(OUTPUT_FILE)) {
  if (!REPLACE_EXISTING) throw new Error(`拒绝覆盖已有检查点：${OUTPUT_FILE}`);
  const archiveDir = path.join(OUTPUT_DIR, 'superseded');
  const archiveName = `${path.basename(OUTPUT_FILE, '.json')}.pre-replace-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`;
  archivedOutput = path.join(archiveDir, archiveName);
  await mkdir(archiveDir, { recursive: true });
  await copyFile(OUTPUT_FILE, archivedOutput);
}

const [
  identity,
  openingGuidance,
  openingTemplate,
  movingGarden,
  gensokyoBasics,
  variableRules,
  variableOutputFormat,
  projection,
  galPresentation,
  initialState,
  mvuLoader,
  mvuSchema,
  uiMount,
  characterRouting,
  itemRouting,
] = await Promise.all([
  source('src/card/identity.xml'),
  source('src/card/opening-first-response.xml'),
  source('src/card/opening-user-message-template.txt'),
  source('src/lorebook/core/moving-garden.xml'),
  source('src/lorebook/core/gensokyo-basics.xml'),
  source('src/lorebook/variable-update-rules.md'),
  source('src/lorebook/variable-output-format.md'),
  source('src/lorebook/model-projection.md'),
  source('src/lorebook/gal-presentation-protocol.md'),
  json('src/schema/initial-state.json'),
  source('src/runtime/01-mvu-loader.js'),
  source('src/schema/02-mvu-schema.js'),
  source(UI_DELIVERY === 'remote' ? 'dist/runtime/ui-loader.js' : 'dist/runtime/ui-mount.js'),
  json('src/lorebook/character-routing.json'),
  json('src/lorebook/item-routing.json'),
]);

if (UI_DELIVERY === 'remote') {
  if (!uiMount.includes('ui-manifest.json') || !uiMount.includes('https://')) {
    throw new Error('拒绝打包：dist/runtime/ui-loader.js 不是合法远程 loader（缺少 ui-manifest.json 引用）。请先运行 npm run build:ui:remote -- --ui-delivery=remote --ui-version=<rN>。');
  }
  const remoteMountPath = `dist/runtime/ui-mount-${CHECKPOINT_SUFFIX}.js`;
  if (!(await exists(remoteMountPath))) {
    throw new Error(`拒绝打包：缺少 remote 构建产物 ${remoteMountPath}。请先运行 npm run build:ui:remote -- --ui-delivery=remote --ui-version=${CHECKPOINT_SUFFIX}。`);
  }
  const currentMount = await source('dist/runtime/ui-mount.js');
  const versionedMount = await source(remoteMountPath);
  if (versionedMount !== currentMount) {
    throw new Error(`拒绝打包：${remoteMountPath} 与当前 dist/runtime/ui-mount.js 不一致。不得复用已发布版本号，请升级检查点并重新 remote 构建。`);
  }
} else if (EXPECT_REMOTE_R2 && !uiMount.includes('"mode":"remote-r2-live"')) {
  throw new Error('拒绝打包：当前 dist/runtime/ui-mount.js 不是 remote-r2-live 构建。请先运行 npm run build:ui:remote，再重新 dry-run。');
}

if (characterRouting.version !== 'character-greenlight.v1' || !Array.isArray(characterRouting.profiles)) {
  throw new Error('角色绿灯路由表版本或结构非法');
}
const characterProfiles = characterRouting.profiles;
const characterIds = new Set();
const characterGreenlights = new Set();
for (const profile of characterProfiles) {
  if (!/^[a-z0-9_]{1,32}$/u.test(profile.id) || !profile.label) {
    throw new Error(`角色绿灯路由项非法：${JSON.stringify(profile)}`);
  }
  if (!/^GSK_CHAR_[A-Z0-9_]+_ACTIVE$/u.test(profile.greenlight)) {
    throw new Error(`角色绿灯格式非法：${profile.id}`);
  }
  if (characterIds.has(profile.id) || characterGreenlights.has(profile.greenlight)) {
    throw new Error(`角色绿灯路由重复：${profile.id}`);
  }
  characterIds.add(profile.id);
  characterGreenlights.add(profile.greenlight);
}
const characterContents = await Promise.all(characterProfiles.map(({ id }) => source(`src/lorebook/characters/${id}.xml`)));

if (itemRouting.version !== 'item-greenlight.v1' || !Array.isArray(itemRouting.profiles)) {
  throw new Error('道具绿灯路由表版本或结构非法');
}
const itemProfiles = itemRouting.profiles;
const itemIds = new Set();
const itemGreenlights = new Set();
for (const profile of itemProfiles) {
  if (!/^[a-z0-9_]{1,32}$/u.test(profile.id) || !profile.label) {
    throw new Error(`道具绿灯路由项非法：${JSON.stringify(profile)}`);
  }
  if (!/^GSK_ITEM_[A-Z0-9_]+_ACTIVE$/u.test(profile.greenlight)) {
    throw new Error(`道具绿灯格式非法：${profile.id}`);
  }
  if (itemIds.has(profile.id) || itemGreenlights.has(profile.greenlight)) {
    throw new Error(`道具绿灯路由重复：${profile.id}`);
  }
  itemIds.add(profile.id);
  itemGreenlights.add(profile.greenlight);
}
const itemContents = await Promise.all(itemProfiles.map(({ id }) => source(`src/lorebook/items/${id}.xml`)));
const sakuyaWatch = await source('src/lorebook/items/sakuya_watch.xml');
const entry = (
  id,
  comment,
  content,
  keys = [],
  constant = false,
  position = 'before_char',
  depth = 4,
  extensionPosition = position === 'before_char' ? 0 : 1,
) => ({
  id,
  keys,
  secondary_keys: [],
  comment,
  content,
  constant,
  selective: !constant,
  insertion_order: id * 10,
  enabled: true,
  position,
  use_regex: false,
  extensions: {
    position: extensionPosition,
    exclude_recursion: false,
    display_index: id,
    probability: 100,
    useProbability: true,
    depth,
    selectiveLogic: 0,
    group: '',
    group_override: false,
    group_weight: 100,
    prevent_recursion: false,
    delay_until_recursion: false,
    scan_depth: null,
    match_whole_words: null,
    use_group_scoring: false,
    case_sensitive: null,
    automation_id: '',
    role: 0,
    vectorized: false,
    sticky: 0,
    cooldown: 0,
    delay: 0,
  },
});

const loreEntries = [
  entry(0, '[mvu_plot][core] 角色卡身份与玩家权边界', identity, [], true),
  entry(1, '[mvu_plot][core] 会移动的结界领地', movingGarden, [], true),
  entry(9, '[mvu_plot][core] 幻想乡基础世界观', gensokyoBasics, [], true),
  entry(16, '[mvu_plot][special] 怀表·时间停止', sakuyaWatch, [], true),
  entry(2, '[mvu_update] 变量更新规则', variableRules, [], true, 'after_char'),
  entry(3, '[mvu_update] 最新 MVU 状态（含本地私有字段）', projection, [], true, 'after_char', 0, 4),
  entry(8, '[mvu_update] 变量输出格式', variableOutputFormat, [], true, 'after_char'),
  entry(7, '[mvu_plot][interaction] GAL 表现与会话协议', galPresentation, [], true, 'after_char'),
  entry(4, '[mvu_plot][opening] 移动庭园首次行动引导', openingGuidance, ['庭守钥', '第一次行动'], false),
  entry(6, '[initvar] 移动庭园初始状态', `<initvar>\n${JSON.stringify(initialState, null, 2)}\n</initvar>`),
  ...characterProfiles.map((profile, index) => {
    const result = entry(
      10 + index,
      `[mvu_plot][character] ${profile.label}`,
      characterContents[index],
      [profile.greenlight],
      false,
    );
    result.extensions.exclude_recursion = true;
    result.extensions.prevent_recursion = true;
    return result;
  }),
  ...itemProfiles.map((profile, index) => {
    const result = entry(
      18 + index,
      `[mvu_plot][item] ${profile.label}`,
      itemContents[index],
      [profile.greenlight],
      false,
    );
    result.extensions.exclude_recursion = true;
    result.extensions.prevent_recursion = true;
    return result;
  }),
];

const script = (name, id, content) => ({
  type: 'script',
  enabled: true,
  name,
  id,
  content,
  info: `幻想乡物语测试检查点 ${CHECKPOINT}；由项目源文件生成。`,
  button: { enabled: false, buttons: [] },
  data: {},
  export_with: { data: true, button: true },
});

const firstMes = `<移动庭园_测试检查点 version="${VERSION}">\n祖父失踪后的第七天，一个没有寄件地址的旧木匣被送到门前。请在自动出现的“移动庭园”界面确认身份并接过庭守钥；界面会在本楼层本地写入开局资料并直接进入庭园，不发送玩家消息，也不调用 LLM。第一次真实行动才会生成正文。若界面未出现，请先使用原生聊天查看诊断。\n</移动庭园_测试检查点>`;
const data = {
  name: `幻想乡物语·移动庭园（测试检查点 ${CHECKPOINT}）`,
  description: identity,
  personality: '群像叙事与庭园建设系统卡。固定角色保持独立行动逻辑；玩家人称、表达方式与尺度由玩家预设及实际输入决定。',
  scenario: '玩家收到祖父留下的遗信与沉睡的“庭守钥”，在本地开场界面确认资料并接受继承后穿过结界抵达荒废庭园，随后修复设施，并在锚点、建设与选择中迎接来访者和小型异变。',
  first_mes: firstMes,
  mes_example: '',
  creator_notes: `本文件是本地运行测试检查点 ${CHECKPOINT}，不是正式发布版。\n开场为确定性的本地流程：玩家确认资料后，在首个 assistant 楼层幂等写入并复读开场状态；不创建 user 消息、不触发 /trigger、不调用 LLM。第一次真实行动才会首次调用 LLM。\n开场资料格式：\n${openingTemplate}`,
  system_prompt: `${identity}\n\n${movingGarden}`,
  post_history_instructions: '严格遵守角色卡身份、玩家权边界、信息可知性、GAL scene.v1 与 MVU 更新协议。互动允许跨越多轮真实聊天；只有自然离场或玩家明确结束时才结算当前互动。',
  alternate_greetings: [],
  tags: ['幻想乡', '群像', '建设', 'MVU', '测试检查点'],
  creator: 'AlbusKen / Codex 协作制作',
  character_version: CHECKPOINT,
  extensions: {
    world: WORLDBOOK_NAME,
    depth_prompt: { prompt: '', depth: 4, role: 'system' },
    tavern_helper: {
      scripts: [
        script('幻想乡物语 · MVU 固定版本加载器', 'gensokyo-mvu-loader-020', mvuLoader),
        script('幻想乡物语 · MVU Schema', 'gensokyo-mvu-schema-020', mvuSchema),
        script('幻想乡物语 · 移动庭园界面', `gensokyo-garden-ui-020-${CHECKPOINT_SUFFIX}`, uiMount),
      ],
      variables: { stat_data: initialState },
    },
    mvu_worldbook_name: WORLDBOOK_NAME,
  },
  character_book: {
    name: WORLDBOOK_NAME,
    description: '测试检查点内嵌世界书；由项目维护源自动组成。',
    scan_depth: 4,
    token_budget: 12288,
    recursive_scanning: false,
    extensions: {},
    entries: loreEntries,
  },
};
const payload = { spec: 'chara_card_v2', spec_version: '2.0', data };
const serialized = `${JSON.stringify(payload, null, 2)}\n`;
const serializedBytes = Buffer.byteLength(serialized);
if (EXPECT_REMOTE_R2 && serializedBytes > 10 * 1024 * 1024) {
  throw new Error(`拒绝打包：轻量 remote-r2 检查点为 ${serializedBytes} bytes，超过 10 MiB 停止线。请检查构建模式与素材内嵌情况。`);
}
const report = {
  mode: DRY_RUN ? 'dry-run' : 'write',
  version: VERSION,
  checkpoint: CHECKPOINT,
  output: OUTPUT_FILE,
  bytes: serializedBytes,
  sha256: createHash('sha256').update(serialized).digest('hex'),
  scripts: data.extensions.tavern_helper.scripts.map(item => ({ id: item.id, bytes: Buffer.byteLength(item.content) })),
  lorebook_entries: loreEntries.length,
  collision_policy: REPLACE_EXISTING ? 'archive-and-replace' : 'refuse-overwrite',
  archived_output: archivedOutput || undefined,
};

if (!DRY_RUN) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, serialized, { encoding: 'utf8', flag: REPLACE_EXISTING ? 'w' : 'wx' });
}
console.log(JSON.stringify(report, null, 2));

