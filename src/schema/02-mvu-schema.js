// 幻想乡物语：stat_data schema v0.2.0
// authority: mvu_zod immutable commit 50e3566f7b27325b1ee80cad0646e2184ac01cdf
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource@50e3566f7b27325b1ee80cad0646e2184ac01cdf/dist/util/mvu_zod.js';

await waitGlobalInitialized('Mvu');

const text = (fallback = '', maximum = 240) => z.string()
  .transform(value => value.slice(0, maximum))
  .prefault(fallback)
  .catch(fallback);
const integer = (fallback, minimum, maximum) => z.coerce.number().int()
  .transform(value => Math.min(maximum, Math.max(minimum, value)))
  .prefault(fallback)
  .catch(fallback);
const boolean = fallback => z.boolean().prefault(fallback).catch(fallback);
const list = (schema, maximum) => z.array(schema)
  .transform(value => value.slice(-maximum))
  .prefault([])
  .catch([]);
const dictionary = schema => z.object({}).catchall(schema).prefault({}).catch({});
const nullableText = (maximum = 80) => z.union([text('', maximum), z.null()]).prefault(null).catch(null);

const relationshipFactSchema = z.object({
  id: text('', 48),
  subjects: list(text('', 48), 8),
  fact: text('', 180),
  source_event_id: nullableText(48),
  established_at: text('', 40),
  active: boolean(true),
  last_confirmed_at: text('', 40),
}).passthrough().prefault({});

const characterSchema = z.object({
  id: text('', 48),
  name: text('无名角色', 60),
  fixed: boolean(false),
  current_relationship_facts: list(relationshipFactSchema, 12),
}).passthrough().prefault({});

const areaSchema = z.object({
  id: text('', 48),
  name: text('未知区域', 60),
  unlocked: boolean(false),
  state: text('未发现', 40),
  main_facility_id: nullableText(48),
}).passthrough().prefault({});

const facilitySchema = z.object({
  id: text('', 48),
  name: text('未知设施', 60),
  area_id: text('', 48),
  state: z.enum(['未发现', '可建设', '建设中', '启用', '损坏', '异常', '封印'])
    .prefault('未发现').catch('未发现'),
  current_form: nullableText(60),
  unlocked_forms: list(text('', 60), 12),
  active_effects: list(text('', 120), 12),
}).passthrough().prefault({});

const characterViewSchema = z.object({
  area_id: text('', 48),
  action: text('', 100),
  facing: z.enum(['front', 'back', 'left', 'right']).prefault('front').catch('front'),
}).passthrough().prefault({});

const interactionSessionSchema = z.object({
  uid: text('', 48),
  type: z.enum(['character', 'facility', 'event']).prefault('character').catch('character'),
  status: z.enum(['active', 'closing']).prefault('active').catch('active'),
  area_id: text('', 48),
  participant_character_ids: list(text('', 48), 8),
  facility_id: nullableText(48),
  event_id: nullableText(48),
  started_at: text('', 40),
  focus: text('', 160),
  last_effective_message_id: z.union([integer(0, 0, 999999), z.null()]).prefault(null).catch(null),
  summary: text('', 600),
  settled: boolean(false),
}).passthrough().prefault({});

const eventSchema = z.object({
  uid: text('', 48),
  config_id: text('', 80),
  title: text('未命名事件', 80),
  status: z.enum(['waiting', 'active', 'resolved', 'missed', 'deferred']).prefault('waiting').catch('waiting'),
  priority: integer(0, 0, 100),
  participant_character_ids: list(text('', 48), 8),
  facility_id: nullableText(48),
  expires_at: nullableText(40),
  summary: text('', 240),
}).passthrough().prefault({});

const anchorSchema = z.object({
  id: text('', 48),
  name: text('未知锚点', 80),
  state: z.enum(['closed', 'unstable', 'stable', 'temporary']).prefault('closed').catch('closed'),
  destination: text('', 100),
  expires_at: nullableText(40),
}).passthrough().prefault({});

const battleResultSchema = z.object({
  settlement_id: text('', 64),
  config_id: text('', 80),
  outcome: z.enum(['clean_win', 'narrow_win', 'loss', 'narrative']).prefault('loss').catch('loss'),
  remaining_lives: integer(0, 0, 3),
  grazes: integer(0, 0, 999999),
  duration_ms: integer(0, 0, 3600000),
  hits: integer(0, 0, 999999),
  damage: integer(0, 0, 999999999),
  phases_cleared: integer(0, 0, 3),
  objective_ratio: integer(0, 0, 100),
}).passthrough().prefault({});

const Schema = z.object({
  meta: z.object({
    schema_version: z.literal('0.2.0').prefault('0.2.0').catch('0.2.0'),
    bridge_version: text('0.2.0', 24),
    database_adapter_version: text('0.2.0', 24),
    initialized: boolean(false),
    opening_committed: boolean(false),
  }).passthrough().prefault({}),
  environment: z.object({
    day: integer(1, 1, 999999),
    time_period: z.enum(['清晨', '白昼', '黄昏', '夜晚']).prefault('清晨').catch('清晨'),
    season: z.enum(['春', '夏', '秋', '冬']).prefault('春').catch('春'),
    season_day: integer(1, 1, 30),
    weather: z.enum(['晴', '阴', '雨', '暴雨', '雾', '雪']).prefault('晴').catch('晴'),
    anomaly_weather: nullableText(60),
  }).passthrough().prefault({}),
  player: z.object({
    name: text('', 60),
    pronouns: text('中性称谓', 60),
    appearance: text('', 240),
    current_area_id: text('central_courtyard', 48),
  }).passthrough().prefault({}),
  garden: z.object({
    name: text('无名庭园', 80),
    construction_stage: text('荒废', 60),
    primary_anchor_id: nullableText(48),
    temporary_anchor_ids: list(text('', 48), 2),
  }).passthrough().prefault({}),
  resources: z.object({
    materials: integer(6, 0, 20),
    inspiration: integer(1, 0, 10),
  }).passthrough().prefault({}),
  areas: dictionary(areaSchema),
  facilities: dictionary(facilitySchema),
  characters: dictionary(characterSchema),
  presence_snapshot: z.object({
    present_character_ids: list(text('', 48), 12),
    character_views: dictionary(characterViewSchema),
  }).passthrough().prefault({}),
  interaction: z.object({
    current_session: z.union([interactionSessionSchema, z.null()]).prefault(null).catch(null),
  }).passthrough().prefault({}),
  events: z.object({
    active_event: z.union([eventSchema, z.null()]).prefault(null).catch(null),
    waiting_events: list(eventSchema, 3),
    recent_results: list(text('', 240), 8),
    completed_key_events: dictionary(text('', 160)),
    daily_cooldowns: dictionary(integer(0, 0, 999999)),
  }).passthrough().prefault({}),
  anchors: z.object({
    stable: dictionary(anchorSchema),
    temporary: dictionary(anchorSchema),
  }).passthrough().prefault({}),
  battle: z.object({
    current: z.union([battleResultSchema, z.null()]).prefault(null).catch(null),
    settled_ids: list(text('', 64), 64),
  }).passthrough().prefault({}),
  key_items: dictionary(z.object({
    id: text('', 48),
    name: text('未知物品', 80),
    obtained: boolean(false),
    state: text('', 80),
  }).passthrough().prefault({})),
  abilities: list(z.object({
    id: text('', 48),
    name: text('未命名能力', 80),
    source: text('', 120),
    unlocked_at: text('', 40),
  }).passthrough().prefault({}), 32),
  memory: z.object({
    long_term_notes: list(text('', 240), 24),
  }).passthrough().prefault({}),
  uid_counters: z.object({
    character: integer(1, 1, 999999),
    event: integer(1, 1, 999999),
    interaction: integer(1, 1, 999999),
    battle: integer(1, 1, 999999),
    relationship_fact: integer(1, 1, 999999),
  }).passthrough().prefault({}),
}).passthrough().prefault({});

registerMvuSchema(Schema);
console.info('[幻想乡物语] MVU Schema v0.2.0 已注册（50e3566）');
