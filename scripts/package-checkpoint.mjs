import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VERSION = '0.2.0';
const CHECKPOINT = '0.2.0-r18';
const OUTPUT_DIR = path.resolve('dist', `checkpoint-${CHECKPOINT}`);
const OUTPUT_FILE = path.join(OUTPUT_DIR, `幻想乡物语-测试检查点-${CHECKPOINT}.json`);
const DRY_RUN = process.argv.includes('--dry-run');

const source = async file => readFile(path.resolve(file), 'utf8');
const json = async file => JSON.parse(await source(file));
const exists = async file => access(file).then(() => true, () => false);

const profile = await json('project/profile.json');
const manifest = await json('project/manifest.json');
if (profile.version !== VERSION || manifest.version !== VERSION) {
  throw new Error(`版本不一致：profile=${profile.version}, manifest=${manifest.version}, packer=${VERSION}`);
}
if (!DRY_RUN && await exists(OUTPUT_FILE)) {
  throw new Error(`拒绝覆盖已有检查点：${OUTPUT_FILE}`);
}

const [
  identity,
  openingGuidance,
  openingTemplate,
  movingGarden,
  variableRules,
  projection,
  galPresentation,
  initialState,
  mvuLoader,
  mvuSchema,
  uiMount,
  greenhouseEvents,
] = await Promise.all([
  source('src/card/identity.xml'),
  source('src/card/opening-first-response.xml'),
  source('src/card/opening-user-message-template.txt'),
  source('src/lorebook/core/moving-garden.xml'),
  source('src/lorebook/variable-update-rules.md'),
  source('src/lorebook/model-projection.md'),
  source('src/lorebook/gal-presentation-protocol.md'),
  json('src/schema/initial-state.json'),
  source('src/runtime/01-mvu-loader.js'),
  source('src/schema/02-mvu-schema.js'),
  source('dist/runtime/ui-mount.js'),
  source('src/lorebook/events/greenhouse-vertical-slice.json'),
]);

const characterRoutes = {
  reimu: ['博丽灵梦', '灵梦', '博丽神社'],
  marisa: ['雾雨魔理沙', '魔理沙', '扫把'],
  cirno: ['琪露诺', '冰之妖精', '冰妖精'],
  alice: ['爱丽丝·玛格特洛依德', '爱丽丝', '人偶师'],
  mystia: ['米斯蒂娅·萝蕾拉', '米斯蒂娅', '夜雀'],
  suika: ['伊吹萃香', '萃香', '鬼族'],
  nitori: ['河城荷取', '荷取', '河童'],
  sakuya: ['十六夜咲夜', '咲夜', '红魔馆女仆'],
};

const characterContents = await Promise.all(Object.keys(characterRoutes).map(id => source(`src/lorebook/characters/${id}.xml`)));
const entry = (id, comment, content, keys = [], constant = false, position = 'before_char') => ({
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
    position: 0,
    exclude_recursion: false,
    display_index: id,
    probability: 100,
    useProbability: true,
    depth: 4,
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
  entry(0, '[core] 角色卡身份与玩家权边界', identity, [], true),
  entry(1, '[core] 会移动的结界领地', movingGarden, [], true),
  entry(2, '[mvu_update] 变量更新协议', variableRules, [], true, 'after_char'),
  entry(3, '[mvu_context] 当前状态投影', projection, [], true, 'after_char'),
  entry(7, '[interaction] GAL 表现与会话协议', galPresentation, [], true, 'after_char'),
  entry(4, '[opening] 确定性开场后的首次行动引导', `${openingGuidance}\n\n旧版开场兼容格式：\n${openingTemplate}`, ['庭守钥', '荒废庭园', '第一次行动'], false),
  entry(5, '[event] 魔法温室纵切事件', greenhouseEvents, ['魔法温室', '温室旧地基', '妖花', '花核'], false),
  entry(6, '[initvar] 移动庭园初始状态', `<initvar>\n${JSON.stringify(initialState, null, 2)}\n</initvar>`),
  ...Object.entries(characterRoutes).map(([id, keys], index) => entry(10 + index, `[character] ${keys[0]}`, characterContents[index], keys, false)),
];

const script = (name, id, content) => ({
  type: 'script',
  enabled: true,
  name,
  id,
  content,
  info: `幻想乡物语测试检查点 ${VERSION}；由项目源文件生成。`,
  button: { enabled: false, buttons: [] },
  data: {},
  export_with: { data: true, button: true },
});

const firstMes = `<移动庭园_测试检查点 version="${VERSION}">\n庭守钥在荒废庭园的结界边缘微微发热。请在自动出现的“移动庭园”界面载入开局资料；此步骤会直接写入并复读 MVU，不调用 LLM。进入庭院后，你发送的第一次真实行动才会开始生成剧情。若界面未出现，请先使用原生聊天查看诊断，不要重复发送开场资料。\n</移动庭园_测试检查点>`;
const data = {
  name: `幻想乡物语·移动庭园（测试检查点 ${CHECKPOINT}）`,
  description: identity,
  personality: '群像叙事与庭园建设系统卡。固定角色保持独立行动逻辑；玩家人称、表达方式与尺度由玩家预设及实际输入决定。',
  scenario: '玩家继承祖父遗物“庭守钥”，抵达幻想乡边缘一处会移动的结界领地。庭园荒废，设施待修，来访者与小型异变会随锚点、建设和玩家选择逐步出现。',
  first_mes: firstMes,
  mes_example: '',
  creator_notes: `本文件是本地运行测试检查点 ${CHECKPOINT}，不是正式发布版。\n开场界面使用确定性 MVU 初始化，不调用 LLM。\n旧版兼容格式：\n${openingTemplate}`,
  system_prompt: `${identity}\n\n${movingGarden}`,
  post_history_instructions: '严格遵守角色卡身份、玩家权边界、信息可知性、GAL scene.v1 与 MVU 更新协议。互动允许跨越多轮真实聊天；只有自然离场或玩家明确结束时才结算当前互动。',
  alternate_greetings: [],
  tags: ['幻想乡', '群像', '建设', 'MVU', '测试检查点'],
  creator: 'AlbusKen / Codex 协作制作',
  character_version: CHECKPOINT,
  extensions: {
    depth_prompt: { prompt: '', depth: 4, role: 'system' },
    tavern_helper: {
      scripts: [
        script('幻想乡物语 · MVU 固定版本加载器', 'gensokyo-mvu-loader-020', mvuLoader),
        script('幻想乡物语 · MVU Schema', 'gensokyo-mvu-schema-020', mvuSchema),
        script('幻想乡物语 · 移动庭园界面', 'gensokyo-garden-ui-020-r18', uiMount),
      ],
      variables: { stat_data: initialState },
    },
    mvu_worldbook_name: '',
  },
  character_book: {
    name: `幻想乡物语·移动庭园 ${CHECKPOINT}`,
    description: '测试检查点内嵌世界书；由项目维护源自动组成。',
    scan_depth: 4,
    token_budget: 4096,
    recursive_scanning: false,
    extensions: {},
    entries: loreEntries,
  },
};
const payload = { spec: 'chara_card_v2', spec_version: '2.0', ...data, data };
const serialized = `${JSON.stringify(payload, null, 2)}\n`;
const report = {
  mode: DRY_RUN ? 'dry-run' : 'write',
  version: VERSION,
  checkpoint: CHECKPOINT,
  output: OUTPUT_FILE,
  bytes: Buffer.byteLength(serialized),
  sha256: createHash('sha256').update(serialized).digest('hex'),
  scripts: data.extensions.tavern_helper.scripts.map(item => ({ id: item.id, bytes: Buffer.byteLength(item.content) })),
  lorebook_entries: loreEntries.length,
  collision_policy: 'refuse-overwrite',
};

if (!DRY_RUN) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, serialized, { encoding: 'utf8', flag: 'wx' });
}
console.log(JSON.stringify(report, null, 2));

