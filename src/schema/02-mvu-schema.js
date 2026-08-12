// 幻想乡物语：stat_data schema v0.3.0
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
const list = (schema, maximum) => z.array(z.unknown())
  .transform(value => value.flatMap(entry => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  }).slice(-maximum))
  .prefault([])
  .catch([]);
const dictionary = schema => z.object({}).catchall(schema).prefault({}).catch({});
const nullableText = (maximum = 80) => z.union([text('', maximum), z.null()]).prefault(null).catch(null);

const characterSchema = z.object({
  id: text('', 48),
  name: text('无名角色', 60),
  fixed: boolean(false),
}).passthrough().transform(value => {
  const { current_relationship_facts: _retiredRelationshipFacts, ...rest } = value;
  return rest;
}).prefault({});

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

// ===== GAL 角色入场记忆（character-visit-memory.v2）=====
// modelId: gensokyo-character-memory；storage.root: stat_data.interaction.visit_memory
// 结构上限在此限定（turns 16 / closed 4 / legacy 16 / unassigned 24）；
// 每角色剧情总计 60 是跨数组业务不变量，由 character-memory normalizer 执行，不由 Zod 单个 list 证明。
// nullable 字段（day/period_serial/source 等）把 z.null() 放 union 最前，保证 null 语义与 TS 类型一致。

// day 同时兼容正式数字时钟与旧档字符串日期。这里不能复用带 catch 的
// integer/text helper：union 分支内部 catch 会提前吞掉另一种合法类型。
const nullableDay = (fallback = null) => z.union([
  z.null(),
  z.number().int().transform(value => Math.min(999999, Math.max(1, value))),
  z.string().transform(value => value.slice(0, 40)),
]).prefault(fallback).catch(fallback);
const nullableSerial = (fallback = null) => z.union([z.null(), integer(0, 0, 99999999)])
  .prefault(fallback).catch(fallback);
const nullableMessageId = (fallback = null) => z.union([z.null(), integer(0, 0, 999999)])
  .prefault(fallback).catch(fallback);

const legacyMemorySchema = z.object({
  legacy_id: text('', 96),
  character_id: z.union([z.null(), text('', 48)]).prefault(null).catch(null),
  text: text('', 240),
  source: z.literal('conversation_log.v0').prefault('conversation_log.v0').catch('conversation_log.v0'),
}).passthrough().prefault({});

const visitTurnSchema = z.object({
  turn_id: text('', 160),
  character_id: text('', 48),
  day: nullableDay(),
  time_period: z.union([z.null(), text('', 24)]).prefault(null).catch(null),
  summary: text('', 100),
}).prefault({});

const visitRecordSchema = z.object({
  visit_id: text('', 64),
  character_id: text('', 48),
  source: z.enum(['scheduler', 'event', 'model-presence', 'bootstrap', 'reconcile'])
    .prefault('scheduler').catch('scheduler'),
  arrival_uid: z.union([z.null(), text('', 96)]).prefault(null).catch(null),
  started_day: nullableDay(),
  started_time_period: z.union([z.null(), text('', 24)]).prefault(null).catch(null),
  started_period_serial: nullableSerial(),
  ended_day: nullableDay(),
  ended_time_period: z.union([z.null(), text('', 24)]).prefault(null).catch(null),
  ended_period_serial: nullableSerial(),
  end_reason: z.union([
    z.null(),
    z.enum(['scheduled-departure', 'presence-receipt', 'event-leave', 'reconcile']),
  ]).prefault(null).catch(null),
  turns: list(visitTurnSchema, 16),
}).passthrough().prefault({});

const visitSummaryTaskSchema = z.object({
  schema: z.literal('visit-summary-task.v1'),
  request_id: text('', 160),
  slots: list(z.object({
    character_id: text('', 48),
    summary: text('', 100),
  }).passthrough().prefault({}), 4),
}).passthrough();

const presenceAnalysisTaskSchema = z.object({
  schema: z.literal('presence-analysis-task.v1'),
  request_id: text('', 160),
  slots: list(z.object({
    character_id: text('', 48),
    baseline_area_id: z.union([z.null(), text('', 48)]).prefault(null).catch(null),
    baseline_action: z.union([z.null(), text('', 80)]).prefault(null).catch(null),
    baseline_facing: z.union([z.null(), z.enum(['front', 'back', 'left', 'right'])]).prefault(null).catch(null),
    decision: z.enum(['pending', 'unchanged', 'move', 'leave', 'uncertain']).prefault('pending').catch('uncertain'),
    area_id: z.union([z.null(), text('', 48)]).prefault(null).catch(null),
    action: z.union([z.null(), text('', 80)]).prefault(null).catch(null),
    facing: z.union([z.null(), z.enum(['front', 'back', 'left', 'right'])]).prefault(null).catch(null),
  }).passthrough().prefault({}), 4),
}).passthrough();

const characterMemorySchema = z.object({
  character_id: text('', 48),
  active_visit: z.union([visitRecordSchema, z.null()]).prefault(null).catch(null),
  closed_visits: list(visitRecordSchema, 4),
  legacy_memories: list(legacyMemorySchema, 16),
}).passthrough().transform(value => {
  const { relationship_memories: _retiredRelationshipMemories, ...rest } = value;
  return rest;
}).prefault({}).catch({
  character_id: '',
  active_visit: null,
  closed_visits: [],
  legacy_memories: [],
});

const characterVisitMigrationSchema = z.object({
  revision: text('', 64),
  conversation_log_fingerprint: z.union([z.null(), text('', 96)]).prefault(null).catch(null),
  migrated_at_serial: nullableSerial(),
}).passthrough().transform(value => {
  const { relationship_facts_fingerprint: _retiredRelationshipFingerprint, ...rest } = value;
  return rest;
}).prefault({});

const visitMemoryStateSchema = z.object({
  version: z.literal('character-visit-memory.v2')
    .prefault('character-visit-memory.v2').catch('character-visit-memory.v2'),
  by_character: dictionary(characterMemorySchema),
  legacy_unassigned: list(legacyMemorySchema, 24),
  migration: characterVisitMigrationSchema,
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
  effective_rounds: integer(0, 0, 999),
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
  phases_cleared: integer(0, 0, 2),
  objective_ratio: integer(0, 0, 100),
}).passthrough().prefault({});

const Schema = z.object({
  meta: z.object({
    schema_version: z.literal('0.3.0').prefault('0.3.0').catch('0.3.0'),
    bridge_version: text('0.3.0', 24),
    database_adapter_version: text('0.3.0', 24),
    initialized: boolean(false),
    opening_committed: boolean(false),
  }).passthrough().prefault({}),
  environment: z.object({
    day: integer(1, 1, 999999),
    time_period: z.preprocess((value) => {
      const aliases = {
        上午: '白昼', 中午: '白昼', 午后: '白昼', 下午: '白昼',
        傍晚: '黄昏', 日落: '黄昏',
        晚上: '夜晚', 夜里: '夜晚', 深夜: '夜晚', 凌晨: '清晨', 早晨: '清晨', 早上: '清晨',
      };
      if (typeof value === 'string' && aliases[value]) return aliases[value];
      return value;
    }, z.enum(['清晨', '白昼', '黄昏', '夜晚']).prefault('清晨')).catch('清晨'),
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
    coins: integer(0, 0, 99999),
  }).passthrough().prefault({}),
  areas: dictionary(areaSchema),
  facilities: dictionary(facilitySchema),
  characters: dictionary(characterSchema),
  presence_snapshot: z.object({
    present_character_ids: list(text('', 48), 12),
    character_views: dictionary(characterViewSchema),
    visitor_meta: dictionary(z.object({
      arrival_uid: text('', 96),
      reason_id: text('', 48),
      source: text('', 24),
      arrived_period_serial: integer(0, 0, 99999999),
      earliest_departure_serial: integer(0, 0, 99999999),
      planned_departure_serial: integer(0, 0, 99999999),
    }).passthrough().prefault({})),
  }).passthrough().prefault({}),
  interaction: z.object({
    current_session: z.union([interactionSessionSchema, z.null()]).prefault(null).catch(null),
    settled_ids: list(text('', 64), 64),
    conversation_log: list(text('', 120), 24),
    starter_gift_claimed: boolean(false),
    visit_summary_task: z.union([visitSummaryTaskSchema, z.null()]).prefault(null).catch(null),
    presence_analysis_task: z.union([presenceAnalysisTaskSchema, z.null()]).prefault(null).catch(null),
    visit_memory: visitMemoryStateSchema,
  }).passthrough().prefault({}),
  events: z.object({
    active_event: z.union([eventSchema, z.null()]).prefault(null).catch(null),
    waiting_events: list(eventSchema, 3),
    recent_results: list(text('', 240), 8),
    completed_key_events: dictionary(text('', 160)),
    settled_ids: list(text('', 96), 256),
    daily_cooldowns: dictionary(integer(0, 0, 999999)),
  }).passthrough().prefault({}),
  anchors: z.object({
    stable: dictionary(anchorSchema),
    temporary: dictionary(anchorSchema),
  }).passthrough().prefault({}),
  battle: z.object({
    current: z.union([battleResultSchema, z.null()]).prefault(null).catch(null),
    settled_ids: list(text('', 64), 64),
    dungeon_unlocked: boolean(false),
    run_count: integer(0, 0, 999999),
    last_run: z.union([z.object({
      config_id: text('', 80),
      outcome: z.enum(['clean_win', 'narrow_win', 'loss']).prefault('loss').catch('loss'),
      reward_coins: integer(0, 0, 99999),
      started_day: integer(1, 1, 999999),
      started_time_period: z.enum(['清晨', '白昼', '黄昏', '夜晚']).prefault('清晨').catch('清晨'),
      settled_day: integer(1, 1, 999999),
      settled_time_period: z.enum(['清晨', '白昼', '黄昏', '夜晚']).prefault('清晨').catch('清晨'),
    }).passthrough(), z.null()]).prefault(null).catch(null),
    rewarded_ids: list(text('', 64), 256),
  }).passthrough().prefault({}),
  shop: z.object({
    unlocked: boolean(false),
    purchase_settled_ids: list(text('', 64), 256),
    static_dialogue_seen_ids: list(text('', 64), 128),
  }).passthrough().prefault({}),
  inventory: z.object({
    consumables: dictionary(integer(0, 0, 99)),
    card_runtime: z.object({
      settled_use_ids: list(text('', 96), 256),
      opportunity: z.object({
        pending: z.union([z.object({
          use_id: text('', 96),
          selected_character_id: text('', 48),
          roll_seed: text('', 160),
          status: z.enum(['reserved', 'arrived']).prefault('reserved').catch('reserved'),
        }).passthrough(), z.null()]).prefault(null).catch(null),
        last_result: z.union([z.object({
          use_id: text('', 96),
          selected_character_id: text('', 48),
        }).passthrough(), z.null()]).prefault(null).catch(null),
      }).passthrough().prefault({}),
      duel: z.object({
        zako_tag_count: integer(0, 0, 99),
        pending_battle: z.union([z.object({
          use_id: text('', 96),
          target_character_id: text('', 48),
          config_id: text('', 80),
          difficulty_tier: z.enum(['hard', 'standard', 'assisted']).prefault('hard').catch('hard'),
          started_zako_tag_count: integer(0, 0, 99),
        }).passthrough(), z.null()]).prefault(null).catch(null),
        settled_result_ids: list(text('', 96), 256),
        pending_victory_dialogue: z.union([z.object({
          settlement_id: text('', 96),
          target_character_id: text('', 48),
          status: z.enum(['waiting_request', 'generating', 'completed']).prefault('waiting_request').catch('waiting_request'),
          request_text: text('', 240),
        }).passthrough(), z.null()]).prefault(null).catch(null),
      }).passthrough().prefault({}),
    }).passthrough().prefault({}),
  }).passthrough().prefault({}),
  key_items: dictionary(z.object({
    id: text('', 48),
    name: text('未知物品', 80),
    obtained: boolean(false),
    state: text('', 80),
  }).passthrough().prefault({})),
  anomaly_cycle: z.object({
    pending_activation: z.union([z.object({
      transaction_id: text('', 96),
      reserved_item_id: text('', 64),
      form: z.object({
        title: text('', 40),
        rule_text: text('', 600),
        scope_mode: z.enum(['all', 'present', 'specified']).prefault('all').catch('all'),
        character_ids: list(text('', 48), 8),
        presentation_tone: text('', 160),
        excluded_content: text('', 240),
      }).passthrough().prefault({}),
      created_at_serial: integer(0, 0, 99999999),
      activation_message_id: z.union([integer(0, 0, 999999), z.null()]).prefault(null).catch(null),
    }).passthrough(), z.null()]).prefault(null).catch(null),
    active: z.union([z.object({
      anomaly_id: text('', 96),
      title: text('', 40),
      rule_text: text('', 600),
      scope_mode: z.enum(['all', 'present', 'specified']).prefault('all').catch('all'),
      character_ids: list(text('', 48), 8),
      presentation_tone: text('', 160),
      excluded_content: text('', 240),
      hidden_origin: z.object({
        name: text('', 40),
        type: text('', 40),
        summary: text('', 240),
        location: text('', 80),
        cause: text('', 160),
        resolution_method: text('', 160),
      }).passthrough().prefault({}),
      public_summary: text('', 240),
      revealed_clues: list(z.object({
        day: integer(1, 1, 999999),
        summary: text('', 120),
      }).passthrough().prefault({}), 8),
      status: z.enum(['active', 'resolving']).prefault('active').catch('active'),
      start_period_serial: integer(0, 0, 99999999),
      end_period_serial: integer(0, 0, 99999999),
      last_guidance_day: z.union([integer(1, 1, 999999), z.null()]).prefault(null).catch(null),
      last_clue_day: z.union([integer(1, 1, 999999), z.null()]).prefault(null).catch(null),
    }).passthrough(), z.null()]).prefault(null).catch(null),
    history: list(z.object({
      anomaly_id: text('', 96),
      title: text('', 40),
      start_period_serial: integer(0, 0, 99999999),
      end_period_serial: integer(0, 0, 99999999),
      origin_summary: text('', 240),
    }).passthrough().prefault({}), 8),
  }).passthrough().prefault({}),
  visit_scheduler: z.object({
    version: text('visit.v1', 24),
    known_characters: list(text('', 48), 16),
    plans: list(z.object({
      plan_id: text('', 96),
      character_id: text('', 48),
      kind: text('', 24),
      due_serial: integer(0, 0, 99999999),
      status: text('', 24),
      roll_seed: text('', 96),
      reason_id: text('', 48),
      target_area_id: text('', 48),
      source: text('', 24),
    }).passthrough().prefault({}), 32),
    cooldown_until: dictionary(integer(0, 0, 99999999)),
    invitation_cooldowns: dictionary(integer(0, 0, 99999999)),
    last_processed_serial: z.union([integer(0, 0, 99999999), z.null()]).prefault(null).catch(null),
    pending_notices: list(text('', 160), 12),
  }).passthrough().prefault({}),
  facility_runtime: dictionary(z.object({
    built: boolean(false),
    current_form: nullableText(60),
    unlocked_forms: list(text('', 60), 12),
    first_use_forms: list(text('', 60), 12),
    activated_at_serial: z.union([integer(0, 0, 99999999), z.null()]).prefault(null).catch(null),
    distinct_chat_periods: list(integer(0, 0, 99999999), 16),
    second_form_choice_pending: boolean(false),
    unlock_deadline_2: z.union([integer(0, 0, 99999999), z.null()]).prefault(null).catch(null),
    unlock_deadline_3: z.union([integer(0, 0, 99999999), z.null()]).prefault(null).catch(null),
    status: z.enum(['normal', 'abnormal', 'damaged']).prefault('normal').catch('normal'),
    condition_id: nullableText(80),
    risk_cooldown_until: z.union([integer(0, 0, 99999999), z.null()]).prefault(null).catch(null),
    pending_refit: z.union([z.object({}).passthrough(), z.null()]).prefault(null).catch(null),
    pending_recovery: z.union([z.object({}).passthrough(), z.null()]).prefault(null).catch(null),
  }).passthrough().prefault({})),
  garden_projects: z.object({
    active_construction: z.union([z.object({
      facility_id: text('', 48),
      form_id: text('', 60),
      transaction_id: text('', 96),
    }).passthrough(), z.null()]).prefault(null).catch(null),
  }).passthrough().prefault({}),
  garden_activities: z.object({
    moon_spring_session: z.union([z.object({}).passthrough(), z.null()]).prefault(null).catch(null),
    banquet: z.union([z.object({}).passthrough(), z.null()]).prefault(null).catch(null),
    scheduled_banquet: z.union([z.object({}).passthrough(), z.null()]).prefault(null).catch(null),
    banquet_history: list(z.object({
      activity_id: text('', 96),
      participation_mode: z.enum(['public', 'invite_only']).prefault('public').catch('public'),
      start_period_serial: integer(0, 0, 99999999),
      completed_period_serial: integer(0, 0, 99999999),
      completion: z.enum(['played', 'assumed_completed']).prefault('played').catch('played'),
    }).passthrough().prefault({}), 8),
  }).passthrough().prefault({}),
  pending_tasks: list(z.object({
    task_id: text('', 160),
    kind: z.enum(['anomaly_resolution', 'banquet_start']).prefault('anomaly_resolution').catch('anomaly_resolution'),
    status: z.enum(['pending', 'processing']).prefault('pending').catch('pending'),
    created_period_serial: integer(0, 0, 99999999),
    due_period_serial: integer(0, 0, 99999999),
    auto_resolve_period_serial: integer(0, 0, 99999999),
    source_id: text('', 96),
    label: text('', 160),
    payload: z.object({}).passthrough().prefault({}),
  }).passthrough().prefault({}), 8),
  scene_item_context: z.union([z.object({
    scene_id: text('', 96),
    status: z.enum(['active', 'closing', 'closed']).prefault('active').catch('active'),
    entries: list(z.object({
      item_id: text('', 64),
      quantity_used: integer(0, 0, 99),
      use_ids: list(text('', 96), 16),
      mode: text('', 32),
      initial_target_character_id: nullableText(48),
      first_transaction_id: text('', 96),
      narrative_state_summary: text('', 160),
    }).passthrough().prefault({}), 3),
    closing_transaction_id: nullableText(96),
  }).passthrough(), z.null()]).prefault(null).catch(null),
  ui_flags: z.object({
    graduation_acknowledged: boolean(false),
    last_visit_notice_serial: z.union([integer(0, 0, 99999999), z.null()]).prefault(null).catch(null),
  }).passthrough().prefault({}),
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
    character_visit: integer(1, 1, 999999),
  }).passthrough().transform(value => {
    const { relationship_fact: _retiredRelationshipCounter, ...rest } = value;
    return rest;
  }).prefault({}),
}).passthrough().prefault({});

registerMvuSchema(Schema);
console.info('[幻想乡物语] MVU Schema v0.3.0 已注册（50e3566）');
