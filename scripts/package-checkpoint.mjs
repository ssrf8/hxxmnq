import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VERSION = '0.3.0';
const releaseKindArg = process.argv.find(argument => argument.startsWith('--release-kind='));
const RELEASE_KIND = releaseKindArg ? releaseKindArg.slice('--release-kind='.length) : 'production';
if (!['production', 'test'].includes(RELEASE_KIND)) throw new Error('--release-kind 只允许 production 或 test');
const IS_TEST_ENTRY = RELEASE_KIND === 'test';
// 正式检查点必须显式提供版本；测试入口是固定卡（卡名不绑定 UI 版本，见 plan 3.3/5.4）。
const checkpointArg = process.argv.find(argument => argument.startsWith('--checkpoint='));
if (!IS_TEST_ENTRY && !checkpointArg) throw new Error('缺少必需参数：--checkpoint=0.3.0-rN');
const CHECKPOINT = IS_TEST_ENTRY ? '0.3.0-ui-test-entry' : checkpointArg.slice('--checkpoint='.length).trim();
const CHECKPOINT_RE = IS_TEST_ENTRY
  ? /^0\.3\.0-ui-test-entry$/u
  : /^0\.3\.0-r[1-9][0-9]*$/u;
if (!CHECKPOINT_RE.test(CHECKPOINT)) {
  throw new Error(`非法检查点：${CHECKPOINT}（${RELEASE_KIND} 通道格式）`);
}
const CHECKPOINT_SUFFIX = CHECKPOINT.slice(VERSION.length + 1); // 正式 'r96'；测试入口 'ui-test-entry'
// B4-O01 §5.4：memory profile 隔离，JS/loader/manifest 按 profile 分目录；打包只消费当前 profile 的产物。
const memoryProfileArg = process.argv.find(argument => argument.startsWith('--memory-profile='));
const MEMORY_PROFILE = memoryProfileArg ? memoryProfileArg.slice('--memory-profile='.length) : 'standalone-mvu';
if (!['standalone-mvu', 'database-assisted'].includes(MEMORY_PROFILE)) {
  throw new Error('--memory-profile 只允许 standalone-mvu 或 database-assisted');
}
const RUNTIME_ROOT = IS_TEST_ENTRY
  ? `dist/runtime/test/profiles/${MEMORY_PROFILE}`
  : `dist/runtime/profiles/${MEMORY_PROFILE}`;
// 可选防御参数：--runtime-root 若提供必须与通道推导一致（plan 5.4 目标接口）。
const runtimeRootArg = process.argv.find(argument => argument.startsWith('--runtime-root='));
if (runtimeRootArg && runtimeRootArg.slice('--runtime-root='.length) !== RUNTIME_ROOT) {
  throw new Error(`--runtime-root 与 ${RELEASE_KIND} 通道推导不一致：${runtimeRootArg.slice('--runtime-root='.length)} != ${RUNTIME_ROOT}`);
}
const OUTPUT_DIR = path.resolve('dist', IS_TEST_ENTRY ? 'checkpoint-ui-test-entry' : `checkpoint-${CHECKPOINT}`);
const OUTPUT_FILE = path.join(OUTPUT_DIR, IS_TEST_ENTRY ? '幻想乡物语 [UI测试版].json' : `幻想乡物语-正式版-${CHECKPOINT}.json`);
const WORLDBOOK_NAME = IS_TEST_ENTRY
  ? '幻想乡物语·移动庭园 [UI测试版]'
  : `幻想乡物语·移动庭园 ${CHECKPOINT}`;
const CARD_NAME = IS_TEST_ENTRY
  ? '幻想乡物语 [UI测试版]'
  : '幻想乡物语·移动庭园';
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
// 测试检查点不登记在正式发布清单（plan 10.4：测试打包不修改 project/manifest.json 的正式发布状态）。
if (RELEASE_KIND !== 'test' && !manifest.planned_checkpoint_sequence?.includes(CHECKPOINT)) {
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
  source(UI_DELIVERY === 'remote' ? `${RUNTIME_ROOT}/ui-loader.js` : `${RUNTIME_ROOT}/ui-mount.js`),
  json('src/lorebook/character-routing.json'),
  json('src/lorebook/item-routing.json'),
]);

if (UI_DELIVERY === 'remote') {
  const expectedUiManifest = IS_TEST_ENTRY
    ? `gensokyo-moving-garden/test/ui/profiles/${MEMORY_PROFILE}/ui-manifest.json`
    : `gensokyo-moving-garden/live/ui/profiles/${MEMORY_PROFILE}/ui-manifest.json`;
  const forbiddenUiManifest = IS_TEST_ENTRY
    ? `gensokyo-moving-garden/live/ui/profiles/${MEMORY_PROFILE}/ui-manifest.json`
    : `gensokyo-moving-garden/test/ui/profiles/${MEMORY_PROFILE}/ui-manifest.json`;
  if (!uiMount.includes(expectedUiManifest) || !uiMount.includes('https://')) {
    throw new Error(`拒绝打包：${RUNTIME_ROOT}/ui-loader.js 不是合法 ${RELEASE_KIND} 通道 loader（缺少 ${expectedUiManifest} 引用）。请先运行对应通道的 remote 构建。`);
  }
  if (uiMount.includes(forbiddenUiManifest)) {
    throw new Error(`拒绝打包：${RUNTIME_ROOT}/ui-loader.js 引用了跨通道 manifest（${forbiddenUiManifest}），测试入口只允许嵌入测试 loader。`);
  }
  // 正式检查点要求版本化副本与当前构建一致（防串线）；固定测试入口不绑定 UI 版本，
  // 日常 UI 更新只换 R2 上的 manifest 指针，入口卡本身不动（plan 1.1.8 / 5.4）。
  if (!IS_TEST_ENTRY) {
    const remoteMountPath = `${RUNTIME_ROOT}/ui-mount-${CHECKPOINT_SUFFIX}.js`;
    if (!(await exists(remoteMountPath))) {
      throw new Error(`拒绝打包：缺少 remote 构建产物 ${remoteMountPath}。请先运行对应通道的 remote 构建（--ui-channel=production --ui-version=${CHECKPOINT_SUFFIX}）。`);
    }
    const currentMount = await source(`${RUNTIME_ROOT}/ui-mount.js`);
    const versionedMount = await source(remoteMountPath);
    if (versionedMount !== currentMount) {
      throw new Error(`拒绝打包：${remoteMountPath} 与当前 ${RUNTIME_ROOT}/ui-mount.js 不一致。不得复用已发布版本号，请升级检查点并重新 remote 构建。`);
    }
  }
} else if (EXPECT_REMOTE_R2 && !uiMount.includes('"mode":"remote-r2-live"')) {
  throw new Error(`拒绝打包：当前 ${RUNTIME_ROOT}/ui-mount.js 不是 remote-r2-live 构建。请先运行 npm run build:ui:remote，再重新 dry-run。`);
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

const routedEntry = (...args) => {
  const result = entry(...args);
  result.extensions.exclude_recursion = true;
  result.extensions.prevent_recursion = true;
  result.extensions.match_whole_words = true;
  result.extensions.case_sensitive = true;
  return result;
};

const initvarEntry = entry(
  6,
  '[initvar] 移动庭园初始状态',
  `<initvar>\n${JSON.stringify(initialState, null, 2)}\n</initvar>`,
);
// MagVarUpdate 会直接枚举世界书并按 comment 读取 [initvar]，不依赖条目启用状态；
// 关闭它可以避免进入常规世界书扫描候选，同时仍保留新聊天初始化来源。
initvarEntry.enabled = false;

const loreEntries = [
  entry(0, '[mvu_plot][core] 角色卡身份与玩家权边界', identity, [], true),
  entry(1, '[mvu_plot][core] 会移动的结界领地', movingGarden, [], true),
  entry(9, '[mvu_plot][core] 幻想乡基础世界观', gensokyoBasics, [], true),
  entry(2, '[mvu_update] 变量更新规则', variableRules, [], true, 'after_char'),
  entry(3, '[mvu_update] 最新 MVU 状态（含本地私有字段）', projection, [], true, 'after_char', 0, 4),
  entry(8, '[mvu_update] 变量输出格式', variableOutputFormat, [], true, 'after_char'),
  entry(7, '[mvu_plot][interaction] GAL 表现与会话协议', galPresentation, [], true, 'after_char'),
  routedEntry(4, '[mvu_plot][opening] 移动庭园首次行动引导', openingGuidance, ['GSK_OPENING_GUIDANCE_ACTIVE'], false),
  initvarEntry,
  ...characterProfiles.map((profile, index) => {
    return routedEntry(
      10 + index,
      `[mvu_plot][character] ${profile.label}`,
      characterContents[index],
      [profile.greenlight],
      false,
    );
  }),
  ...itemProfiles.map((profile, index) => {
    return routedEntry(
      100 + index,
      `[mvu_plot][item] ${profile.label}`,
      itemContents[index],
      [profile.greenlight],
      false,
    );
  }),
];
const loreEntryIds = new Set();
for (const loreEntry of loreEntries) {
  if (loreEntryIds.has(loreEntry.id)) throw new Error(`世界书条目 ID 重复：${loreEntry.id}`);
  loreEntryIds.add(loreEntry.id);
}

const script = (name, id, content) => ({
  type: 'script',
  enabled: true,
  name,
  id,
  content,
  info: IS_TEST_ENTRY
    ? `幻想乡物语 UI 测试入口 ${CHECKPOINT}；由项目源文件生成。`
    : `幻想乡物语正式版 ${CHECKPOINT}；由项目源文件生成。`,
  button: { enabled: false, buttons: [] },
  data: {},
  export_with: { data: true, button: true },
});

const firstMes = `<移动庭园 version="${VERSION}">\n祖父失踪后的第七天，一个没有寄件地址的旧木匣被送到门前。请在自动出现的“移动庭园”界面确认身份并接过庭守钥；界面会在本楼层本地写入开局资料并直接进入庭园，不发送玩家消息，也不调用 LLM。第一次真实行动才会生成正文。若界面未出现，请先使用原生聊天查看诊断。\n</移动庭园>`;
const data = {
  name: CARD_NAME,
  description: identity,
  personality: '群像叙事与庭园建设系统卡。固定角色保持独立行动逻辑；玩家人称、表达方式与尺度由玩家预设及实际输入决定。',
  scenario: '玩家收到祖父留下的遗信与沉睡的“庭守钥”，在本地开场界面确认资料并接受继承后穿过结界抵达荒废庭园，随后修复设施，并在锚点、建设与选择中迎接来访者和小型异变。',
  first_mes: firstMes,
  mes_example: '',
  creator_notes: '',
  system_prompt: `${identity}\n\n${movingGarden}`,
  post_history_instructions: '严格遵守角色卡身份、玩家权边界、信息可知性、庭园正文与 MVU 更新协议。互动允许跨越多轮真实聊天；只有自然离场或玩家明确结束时才结算当前互动。',
  alternate_greetings: [],
  tags: RELEASE_KIND === 'test'
    ? ['幻想乡', '群像', '建设', 'MVU', 'UI测试版', '测试检查点']
    : ['幻想乡', '群像', '建设', 'MVU'],
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
    description: IS_TEST_ENTRY
      ? 'UI 测试入口内嵌世界书；由项目维护源自动组成。'
      : '正式版内嵌世界书；由项目维护源自动组成。',
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
  release_kind: RELEASE_KIND,
  version: VERSION,
  checkpoint: CHECKPOINT,
  ui_manifest: RELEASE_KIND === 'test'
    ? `gensokyo-moving-garden/test/ui/profiles/${MEMORY_PROFILE}/ui-manifest.json`
    : `gensokyo-moving-garden/live/ui/profiles/${MEMORY_PROFILE}/ui-manifest.json`,
  runtime_root: RUNTIME_ROOT,
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

