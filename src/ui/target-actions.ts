import type { GardenState, InteractionTarget, TargetAction } from './types';
import { GREENHOUSE_EVENTS, greenhouseActionBlock } from './greenhouse-rules';
import { buildEventPromptProjection } from './event-projection';
import { buildPromptContext } from './prompt-context';
import { characterGreenlightContext, stripCharacterGreenlights } from './character-greenlights';
import { itemGreenlightContext, stripItemGreenlights } from './item-greenlights';
import { characterDuelBlock } from './duel-card-rules';
import { eventById } from './event-registry';

const action = (
  target: InteractionTarget,
  id: string,
  label: string,
  description: string,
  intent: string,
  mode: TargetAction['mode'],
  extra: Partial<TargetAction> = {},
): TargetAction => ({ id, label, description, intent, mode, target, ...extra });

export const gardenNarrativeContract = [
  '【庭园正文协议】',
  '最终回复的第一个可见字符必须是【庭园正文开始】，玩家可见剧情结束后立即写【庭园正文结束】；不得输出前言、重复边界或 Markdown 代码围栏。',
  '正文内只允许 <narration>旁白、环境或动作</narration> 与 <dialogue char="已登记角色ID" visual_mode="normal|nude|sexual" reaction="已登记表情" pose="已登记姿势" act="vaginal|anal|none">角色台词</dialogue>；dialogue 的五个属性必须全部存在，多人或多次发言必须拆成多个 dialogue。没有更合适的登记值时使用 reaction="neutral" pose="default" act="none"。',
  '正文结束后只能输出本轮明确要求的 GensokyoPresence 等剧情协议标签；它们不会进入庭园 GAL。剧情模型不得输出 UpdateVariable，变量更新由独立变量阶段负责。',
  '不要在正文开始前输出解释、思维链、列表或代码块。',
  '正文内严禁出现任何自我纠错说明、思考痕迹或自指文本（例如“注意：”“修正：”“应该改为”“不能放在这里”等）。发现格式错误时直接重写该行并静默输出，不得在正文中保留纠错过程。',
  'visual_mode 只描述立绘状态：normal 正常穿着；nude 完全裸露但尚未进入明确亲密行为；sexual 正文已进入明确亲密行为（如插入、口交等）。裸露、脱衣、洗浴、拥抱或亲吻本身不能升级为 sexual；正文确实进入明确亲密行为时，dialogue 的 visual_mode 必须为 sexual，并给出已登记 pose_id 与 act_id（如 rear/vaginal），不得停留在 nude。',
  '剧情连续性：本轮【本轮道具授权】只决定本轮能否使用道具，不代表剧情分支切换或记忆重置；前文已发生的事实（包括战斗、对话、亲密行为）依然有效。玩家动作若与前文状态冲突，角色应带着前文记忆做出合理反应（困惑、质问、警惕、害羞等），不得装作什么都没发生、把玩家当陌生人或回到初见状态。输出正文前必须核对上轮正文结尾，保持角色状态连续。',
  '称呼玩家时使用酒馆当前用户名（开场已注入酒馆原生宏的名字）或玩家在开场确认的姓名；姓名与称谓只用于称呼玩家，不得据此替玩家决定人称、台词、心理、关系承诺或关键选择。',
].join('\n');

export function presenceNarrativeContext(state?: GardenState) {
  if (!state) return '';
  const present = new Set(state.presence_snapshot?.present_character_ids ?? []);
  const views = state.presence_snapshot?.character_views ?? {};
  const names = state.characters ?? {};
  const presentLines = [...present].map((id) => {
    const view = views[id] ?? {};
    return `- ${id}（${names[id]?.name ?? id}）：${view.area_id ?? '区域未记录'}；${view.action ?? '行动未记录'}；朝向 ${view.facing ?? '未记录'}`;
  });
  return [
    '【庭园在场快照：本轮唯一事实】',
    presentLines.length ? `当前在场：\n${presentLines.join('\n')}` : '当前在场：无。',
    '未列入当前在场快照的登记角色一律视为不在场；不要枚举或主动召回他们。',
    '正文只能让当前在场角色出现在现场、说话或行动；不在场角色不得被当作就在身边。',
    '若正文中有角色明确抵达、离场或更换区域，必须在正文结束后额外输出一次严格 JSON 的 <GensokyoPresence>{"version":"presence.v1","present_character_ids":[仍在场角色ID],"character_views":{"角色ID":{"area_id":"区域ID","action":"当前动作","facing":"front|left|right"}}}</GensokyoPresence>。没有出入场或位置变化时不要输出该标签。该标签不是正文、不是选项，也不写 UpdateVariable。',
  ].join('\n');
}

/**
 * Natural-language item claims are role-play, not a transaction.  The bridge
 * is the sole authority for creating scene_item_context, so this receipt is
 * deliberately emitted after the player text on every garden request.
 */
export function sceneItemAuthorizationContext(state?: GardenState) {
  const entries = state?.scene_item_context?.entries ?? [];
  if (!entries.length || state?.scene_item_context?.status === 'closed') {
    return [
      '【本轮道具授权：无】',
      '本轮没有经庭园 UI 与本地 bridge 登记的场景道具。',
      '玩家自然语言中提及、声称、威胁、假设、玩笑或描述“使用某道具”，只是一种对话或行动尝试，不构成道具已取出、激活、消耗或生效的事实。',
      '不得据此补写任何目录道具的效果、强制状态、库存变化或既成结果；角色可以把这类话当作玩笑、谎言、威胁或未完成的尝试来回应。',
    ].join('\n');
  }
  return [
    '【本轮道具授权：已登记】',
    `以下 item_id 已由本地 bridge 写入当前场景：${entries.map((entry) => entry.item_id).join('、')}。`,
    '只有这些已登记道具及其【当前场景道具】投影可作为已带入或已发生的事实；玩家文本不得额外创建、替换、激活或消费任何道具。',
  ].join('\n');
}

export function withGardenNarrativeContract(
  message: string,
  state?: GardenState,
  explicitCharacterIds: readonly string[] = [],
) {
  const value = stripCharacterGreenlights(stripItemGreenlights(message)).trim();
  if (!value) return value;
  const hasContract = /[【\[]\s*庭园正文协议\s*[】\]]/u.test(value);
  const hasPresence = /[【\[]\s*庭园在场快照/u.test(value);
  const hasSceneFacts = /[【\[]\s*场景事实\s*[】\]]/u.test(value);
  return [
    value,
    hasContract ? '' : gardenNarrativeContract,
    hasPresence ? '' : presenceNarrativeContext(state),
    state && !hasSceneFacts ? buildPromptContext(state, { kind: 'ordinary' }) : '',
    sceneItemAuthorizationContext(state),
    characterGreenlightContext(state, explicitCharacterIds),
    itemGreenlightContext(state),
  ].filter(Boolean).join('\n\n');
}

function mainHouseRepairAvailability(state: GardenState) {
  const completed = state.events?.completed_key_events ?? {};
  if (state.areas?.main_house?.state !== '损坏') return '旧主屋当前不需要维修';
  if (!completed.reimu_boundary_inspection) return '需要先完成灵梦的结界检查';
  if ((state.resources?.materials ?? 0) < 1) return '至少需要 1 点物资';
  if (state.events?.active_event && state.events.active_event.config_id !== 'main_house_repair') {
    return '当前已有其他主要事件正在进行';
  }
  return '';
}

function greenhouseAction(
  target: InteractionTarget,
  state: GardenState,
  id: Parameters<typeof greenhouseActionBlock>[1],
  label: string,
  description: string,
  intent: string,
  mode: TargetAction['mode'],
  extra: Partial<TargetAction> = {},
) {
  const unavailable = greenhouseActionBlock(state, id);
  return action(target, id, label, unavailable || description, intent, mode, {
    disabled: Boolean(unavailable),
    disabledReason: unavailable || undefined,
    ...extra,
  });
}

function greenhouseActions(target: InteractionTarget, state: GardenState): TargetAction[] {
  const completed = state.events?.completed_key_events ?? {};
  const result: TargetAction[] = [action(
    target,
    'inspect',
    '查看',
    '观察温室旧址或现有设施的真实状态。',
    '我来到温室区域，先观察这里现在的地基、设施、魔力流动与异常迹象，不预设调查结果。',
    'facility',
  )];

  if (!completed[GREENHOUSE_EVENTS.rumor]) {
    result.push(greenhouseAction(
      target,
      state,
      'investigate_magic_trace',
      '调查魔力痕迹',
      '追查温室方向的异常魔力，并让魔理沙的线索自然进入剧情。',
      '我沿着灵梦指出的结界异常前往温室方向，谨慎调查残留魔力。请按 marisa_material_rumor 的前置和允许结果推进，让魔理沙的材料传闻通过真实剧情出现；只有回复和 MVU 一起结算后才改变状态。',
      'gal',
      { eventId: GREENHOUSE_EVENTS.rumor, fixedPresentation: true },
    ));
  } else if (!completed[GREENHOUSE_EVENTS.inspiration] && (state.resources?.inspiration ?? 0) < 2) {
    result.push(
      greenhouseAction(
        target,
        state,
        'investigate_growth',
        '观察异常生长',
        '从旧址里的异常植物生长获得第二点灵感。',
        '我仔细观察温室旧址中不合常理的生长痕迹，尝试据此整理温室方案。请按 gain_second_inspiration 结算；三个灵感入口共享同一事件，只能奖励一次。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.inspiration, fixedPresentation: true },
      ),
      greenhouseAction(
        target,
        state,
        'hear_marisa_plan',
        '听魔理沙的方案',
        '和魔理沙讨论一个大胆但可落地的温室方案。',
        '我请魔理沙讲讲她设想的温室方案，并一起辨别哪些部分能安全实现。请按 gain_second_inspiration 结算；三个灵感入口共享同一事件，只能奖励一次。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.inspiration, fixedPresentation: true },
      ),
      greenhouseAction(
        target,
        state,
        'study_grandfather_blueprint',
        '研究祖父图纸',
        '从祖父留下的旧图纸中整理温室设计思路。',
        '我把祖父留下的图纸带到温室旧址，对照残存地基逐项研究。请按 gain_second_inspiration 结算；三个灵感入口共享同一事件，只能奖励一次。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.inspiration, fixedPresentation: true },
      ),
    );
  }

  if (!completed[GREENHOUSE_EVENTS.clear]) {
    result.push(greenhouseAction(
      target,
      state,
      'clear_greenhouse_foundation',
      '清理旧地基',
      '清除危险残骸并整理可施工地基。',
      '我按照已经确定的方案清理温室旧地基。请严格校验资源、灵感与事件互斥；只有完成叙事并写入 MVU 后才将地基改为已清理，并推进一个时段。',
      'facility',
      { eventId: GREENHOUSE_EVENTS.clear, mayAdvanceTime: true, fixedPresentation: true },
    ));
  } else if (!completed[GREENHOUSE_EVENTS.build]) {
    result.push(greenhouseAction(
      target,
      state,
      'build_basic_magic_greenhouse',
      '建造基础温室',
      '消耗 4 点物资和 2 点灵感，建成基础魔法温室。',
      '我确认地基与材料后开始建造基础魔法温室。请按 build_basic_magic_greenhouse 的成本与允许结果结算：成功时只扣一次 4 点物资和 2 点灵感、推进一个时段并启用设施；若条件不足，只给出获得材料或请求魔理沙协助的自然方案，不得透支资源。',
      'facility',
      {
        eventId: GREENHOUSE_EVENTS.build,
        mayAdvanceTime: true,
        fixedPresentation: true,
        cost: { materials: 4, inspiration: 2 },
      },
    ));
    if ((state.resources?.materials ?? 0) < 4) {
      result.push(
        action(
          target,
          'seek_greenhouse_materials',
          '寻找材料',
          '通过剧情寻找温室需要的材料，不预设一定获得。',
          '现有物资不足，我先不强行施工，转而调查附近能够安全取得的温室材料。请根据当前地点、角色与已知线索自然推进，不得凭空补足全部物资。',
          'gal',
        ),
        action(
          target,
          'ask_marisa_greenhouse_help',
          '请求魔理沙协助',
          '询问魔理沙能否提供线索、代用品或亲自协助。',
          '现有物资不足，我去询问魔理沙是否知道合适的材料、代用品或获取办法。她是否答应以及代价由当前关系与剧情决定，不直接宣布获得资源。',
          'gal',
        ),
      );
    }
  } else if (!completed[GREENHOUSE_EVENTS.firstUse]) {
    result.push(greenhouseAction(
      target,
      state,
      'greenhouse_first_use',
      '第一次使用',
      '与魔理沙一起完成温室的首次试运行。',
      '我邀请魔理沙一起检查并首次启用基础魔法温室。请按 greenhouse_first_use 演绎设施反应与人物互动；只在回复和 MVU 同步结算后记录首次使用完成。',
      'facility',
      { eventId: GREENHOUSE_EVENTS.firstUse, fixedPresentation: true },
    ));
  } else if (!completed[GREENHOUSE_EVENTS.conversation]) {
    result.push(greenhouseAction(
      target,
      state,
      'greenhouse_research_talk',
      '温室研究交流',
      '与魔理沙进行一段简短的温室研究交流。',
      '我邀请魔理沙在温室里进行一段研究交流。请按 greenhouse_multiturn_conversation 单轮收束：回复自然收尾，不要求玩家继续输入；正文控制在约 300 个汉字以内；不可提前揭示、命名或激活妖花核心。正式完成标记由本地结算器在回复完成后原子写入。',
      'gal',
      { eventId: GREENHOUSE_EVENTS.conversation },
    ));
  } else if (!completed[GREENHOUSE_EVENTS.flowerCore]) {
    if (state.battle?.current) {
      result.push(greenhouseAction(
        target,
        state,
        'resume_battle_settlement',
        '继续结算',
        '继续消费已写入 battle.current 的唯一可信结果。',
        '温室妖花核心已有待结算的可信战斗结果。请只读取并消费 battle.current，按 settlement_id 幂等结算 greenhouse_flower_core，然后清空 battle.current 与 events.active_event。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.flowerCore, fixedPresentation: true },
      ));
    } else if (state.events?.active_event?.config_id === GREENHOUSE_EVENTS.flowerCore) {
      result.push(
        greenhouseAction(
          target,
          state,
          'start_flower_core_battle',
          '进入符卡战',
          '启动本地白名单内的温室妖花核心小游戏。',
          '',
          'battle',
          { eventId: GREENHOUSE_EVENTS.flowerCore },
        ),
        greenhouseAction(
          target,
          state,
          'resolve_flower_core_narratively',
          '改用剧情解决',
          '跳过小游戏，以 narrative 结果继续同一结算协议。',
          '',
          'battle_narrative',
          { eventId: GREENHOUSE_EVENTS.flowerCore },
        ),
      );
    } else {
      result.push(greenhouseAction(
        target,
        state,
        'investigate_flower_core',
        '调查妖花核心',
        '调查温室深处的异常花核并激活本次事件。',
        '我沿着温室内反常的魔力脉动调查深处的妖花核心。请按 greenhouse_flower_core 的前置激活唯一 active_event；只呈现本地符卡战或剧情解决两个入口，不提前写入战斗结果。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.flowerCore },
      ));
    }
  } else {
    if (!completed[GREENHOUSE_EVENTS.freeGrowthProposal]) {
      result.push(greenhouseAction(
        target,
        state,
        'organize_free_growth_proposal',
        '整理自由生长方案',
        '与魔理沙登记保留可控野性的温室方案，暂不施工或选型。',
        '我和魔理沙复盘温室妖花核心留下的异常生长，讨论如何保留可控野性，并确认风险边界。请按 greenhouse_free_growth_proposal 演绎：最后由魔理沙交付可执行方案；只登记“自由生长型温室”，不施工、不选定当前形态、不扣资源、不推进时间，也不开启新的异变。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.freeGrowthProposal, fixedPresentation: true },
      ));
    }
    if (!completed[GREENHOUSE_EVENTS.aliceMaintenanceProposal]) {
      result.push(greenhouseAction(
        target,
        state,
        'invite_alice_maintenance_assessment',
        '邀请爱丽丝进行维护评估',
        '请爱丽丝以人偶协作测量温室的连接、隔离和维护需求。',
        '我邀请爱丽丝来到温室，检查结构连接、隔离边界和长期维护需求。请按 alice_greenhouse_maintenance_proposal 演绎：人偶分工测量，说明自由生长方案的维护风险但不贬低魔理沙，最后交付人偶维护型温室方案；只登记方案，不施工、不选定当前形态、不扣资源、不推进时间。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.aliceMaintenanceProposal, fixedPresentation: true },
      ));
    }
    if (!completed[GREENHOUSE_EVENTS.nitoriAutomationProposal]) {
      result.push(greenhouseAction(
        target,
        state,
        'commission_nitori_engineering_survey',
        '委托荷取进行工程测量',
        '请荷取测量温室水路、结界接口与自动化仪表需求。',
        '我委托荷取来到温室，测量水路、结界接口和仪表条件。请按 nitori_greenhouse_automation_proposal 演绎：她说明投入与安全限制，完成小规模试运行并交付河童自动化型温室方案；只登记方案，不施工、不选定当前形态、不扣资源、不推进时间。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.nitoriAutomationProposal, fixedPresentation: true },
      ));
    }
    const proposalsReady = Boolean(
      completed[GREENHOUSE_EVENTS.freeGrowthProposal]
      && completed[GREENHOUSE_EVENTS.aliceMaintenanceProposal]
      && completed[GREENHOUSE_EVENTS.nitoriAutomationProposal],
    );
    if (proposalsReady && !completed[GREENHOUSE_EVENTS.selectForm]) {
      result.push(
        greenhouseAction(
          target,
          state,
          'select_free_growth',
          '选择自由生长型',
          '魔理沙方案：保留可控野性与魔法实验空间；风险是异常生长需要持续观察。首次改造消耗 4 物资。',
          '我在三套方案的比较页确认首次选择自由生长型温室。请只演绎魔理沙方案的施工、风险边界与验收；不得改成其他形态。',
          'gal',
          { eventId: GREENHOUSE_EVENTS.selectForm, fixedPresentation: true, mayAdvanceTime: true, cost: { materials: 4 } },
        ),
        greenhouseAction(
          target,
          state,
          'select_doll_maintenance',
          '选择人偶维护型',
          '爱丽丝方案：精细维护、异常隔离与人偶协作；限制是责任分工和维护边界必须清晰。首次改造消耗 4 物资。',
          '我在三套方案的比较页确认首次选择人偶维护型温室。请只演绎爱丽丝方案的施工、责任边界与验收；不得改成其他形态。',
          'gal',
          { eventId: GREENHOUSE_EVENTS.selectForm, fixedPresentation: true, mayAdvanceTime: true, cost: { materials: 4 } },
        ),
        greenhouseAction(
          target,
          state,
          'select_kappa_automation',
          '选择河童自动化型',
          '荷取方案：仪表监测、自动巡检与可复现故障；限制是依赖明确验收和安全条件。首次改造消耗 4 物资。',
          '我在三套方案的比较页确认首次选择河童自动化型温室。请只演绎荷取方案的施工、安全限制与验收；不得改成其他形态。',
          'gal',
          { eventId: GREENHOUSE_EVENTS.selectForm, fixedPresentation: true, mayAdvanceTime: true, cost: { materials: 4 } },
        ),
      );
    } else if (completed[GREENHOUSE_EVENTS.selectForm]) {
      result.push(
        greenhouseAction(
          target,
          state,
          'remodel_to_free_growth',
          '换型：自由生长型',
          '切换到可控野性与生长观察路线；保留其他方案和历史。消耗 3 物资。',
          '我确认把当前温室换型为自由生长型。请只演绎必要拆改、魔理沙方案的风险边界与验收；不得改成其他形态。',
          'gal',
          { eventId: GREENHOUSE_EVENTS.remodelForm, fixedPresentation: true, mayAdvanceTime: true, cost: { materials: 3 } },
        ),
        greenhouseAction(
          target,
          state,
          'remodel_to_doll_maintenance',
          '换型：人偶维护型',
          '切换到精细维护与异常隔离路线；保留其他方案和历史。消耗 3 物资。',
          '我确认把当前温室换型为人偶维护型。请只演绎必要拆改、爱丽丝方案的责任边界与验收；不得改成其他形态。',
          'gal',
          { eventId: GREENHOUSE_EVENTS.remodelForm, fixedPresentation: true, mayAdvanceTime: true, cost: { materials: 3 } },
        ),
        greenhouseAction(
          target,
          state,
          'remodel_to_kappa_automation',
          '换型：河童自动化型',
          '切换到仪表监测与自动巡检路线；保留其他方案和历史。消耗 3 物资。',
          '我确认把当前温室换型为河童自动化型。请只演绎必要拆改、荷取方案的安全条件与验收；不得改成其他形态。',
          'gal',
          { eventId: GREENHOUSE_EVENTS.remodelForm, fixedPresentation: true, mayAdvanceTime: true, cost: { materials: 3 } },
        ),
      );
    }
    const alicePresent = state.presence_snapshot?.present_character_ids?.includes('alice');
    if (alicePresent) {
      result.push(action(
        target,
        'alice_doll_workshop_chat',
        '聊聊人偶维护',
        '与在场的爱丽丝自由讨论人偶协作与温室维护。',
        '我和在场的爱丽丝聊聊人偶协作、隔离维护与温室里的细节观察；这只是独立支线，不解锁方案、不改变资源、不推进主线。',
        'gal',
      ));
    }
    const nitoriPresent = state.presence_snapshot?.present_character_ids?.includes('nitori');
    if (nitoriPresent) {
      result.push(action(
        target,
        'nitori_instrument_calibration_chat',
        '帮忙校准仪表',
        '与在场的荷取自由讨论温室仪表和安全读数。',
        '我和在场的荷取一起校准温室仪表、核对水路和结界读数；这只是独立支线，不解锁方案、不改变资源、不推进主线。',
        'gal',
      ));
    }
    const marisaPresent = state.presence_snapshot?.present_character_ids?.includes('marisa');
    if (state.environment?.time_period === '夜晚' && marisaPresent) {
      result.push(action(
        target,
        'marisa_greenhouse_night_observation',
        '夜间观察',
        '与在场的魔理沙自由观察夜晚温室的残留魔力。',
        '夜晚的温室仍有微弱的魔力起伏。我和在场的魔理沙进行一次自由观察。',
        'gal',
        { eventId: 'marisa_greenhouse_night_observation' },
      ));
    }
    result.push(action(
      target,
      'use_greenhouse',
      '使用温室',
      '进行普通种植、观察或研究，不重复关键事件奖励。',
      '我进入已经稳定下来的魔法温室，选择进行一次普通的照料、观察或研究。请依据当前状态自然回应，不重复结算已经完成的关键事件。',
      'gal',
    ));
  }

  result.push(action(target, 'leave', '离开', '返回庭园。', '', 'close'));
  return result;
}

function waitingEventActions(target: InteractionTarget, state: GardenState): TargetAction[] {
  if (target.type !== 'area' || target.id !== 'central_courtyard') return [];
  const waiting = new Set((state.events?.waiting_events ?? []).map((event) => event.config_id));
  const result: TargetAction[] = [];
  if (waiting.has('fairy_seed_shower')) result.push(action(
    target, 'observe_fairy_seed_shower', '观察妖精种子雨',
    '自由观察落入庭园的发光种子；不承担后续前置。',
    '我留在中央庭院观察异变触发卡引来的妖精种子雨。这是一段自由插曲，不发放资源、不创建长期角色，也不解锁其他事件。',
    'gal', { eventId: 'fairy_seed_shower' },
  ));
  if (waiting.has('wandering_magic_mist')) result.push(action(
    target, 'observe_wandering_magic_mist', '观察游荡魔法雾',
    '自由观察穿过庭园的残留魔法雾；不承担后续前置。',
    '我留在中央庭院观察异变触发卡引来的游荡魔法雾。这是一段自由插曲，不发放资源、不创建未知法术，也不解锁其他事件。',
    'gal', { eventId: 'wandering_magic_mist' },
  ));
  if (waiting.has('clockwork_temporal_ripple')) result.push(action(
    target, 'investigate_clockwork_temporal_ripple', '调查发条时间涟漪',
    '调查怀表痕迹与卡片异变的共振；只确认余波，不回滚状态。',
    '我调查中央庭院里由怀表痕迹和异变卡共同形成的发条时间涟漪。请确认它只是五分钟停顿留下的余波，不撤销任何既有结算或时段。',
    'gal', { eventId: 'clockwork_temporal_ripple', fixedPresentation: true },
  ));
  if (waiting.has('sakuya_temporal_trace_investigation')) result.push(action(
    target, 'investigate_sakuya_temporal_trace', '回应咲夜的调查',
    '咲夜注意到了不属于自己的时间停顿痕迹；本次不强制她常驻。',
    '我回应咲夜对庭园时间痕迹的调查。请只确认她注意到不属于自己的停顿痕迹并完成一次克制接触，不强制她常驻，也不让其他强者同步得知。',
    'gal', { eventId: 'sakuya_temporal_trace_investigation', fixedPresentation: true },
  ));
  return result;
}

export function targetActions(target: InteractionTarget, state: GardenState): TargetAction[] {
  const waitingActions = waitingEventActions(target, state);
  if (waitingActions.length) return [
    action(target, 'inspect', '查看', '观察庭院与等待中的异变。', '我观察中央庭院与当前等待事件。', 'gal'),
    ...waitingActions,
    action(target, 'leave', '离开', '返回庭园。', '', 'close'),
  ];
  if (target.type === 'character') {
    const base = [
      action(
        target,
        'talk',
        '对话',
        `与${target.label}开始一段可以持续多轮的交谈。`,
        `我走近${target.label}，在不替对方决定反应的前提下，自然地开口与其交谈。`,
        'gal',
      ),
    ];
    const duelBlocked = characterDuelBlock(state, target.id);
    base.push(action(
      target,
      'character_duel',
      '符卡对战',
      duelBlocked || `与${target.label}进行一场本地结算的符卡对战。杂鱼标签会影响本次难度。`,
      '',
      'duel',
      { disabled: Boolean(duelBlocked), disabledReason: duelBlocked || undefined },
    ));
    if (target.id === 'reimu') {
      if (!state.events?.completed_key_events?.reimu_boundary_inspection) {
        base.unshift(action(
          target,
          'inspect_boundary',
          '检查结界',
          '与灵梦一起确认结界异常；回复完成后由本地结算器原子记录结果。',
          '我请博丽灵梦和我一起检查庭园边缘的结界异常，并依照她的判断确认当前处置方式。请完整演绎检查、临时许可与指向旧主屋的收束，不要留下继续选择。',
          'gal',
          { eventId: 'reimu_boundary_inspection', fixedPresentation: true },
        ));
      }
    }
    if (target.id === 'marisa'
      && state.events?.completed_key_events?.[GREENHOUSE_EVENTS.firstUse]
      && !state.events?.completed_key_events?.[GREENHOUSE_EVENTS.conversation]) {
      base.push(greenhouseAction(
        target,
        state,
        'greenhouse_research_talk',
        '聊温室研究',
        '与魔理沙进行一段简短的温室研究交流。',
        '我邀请魔理沙进行一段温室研究交流。请按 greenhouse_multiturn_conversation 单轮收束：回复自然收尾，不要求玩家继续输入；正文控制在约 300 个汉字以内；不可提前揭示、命名或激活妖花核心。正式完成标记由本地结算器在回复完成后原子写入。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.conversation },
      ));
    }
    base.push(action(
      target,
      'pat_head',
      '摸摸头',
      `尝试摸摸${target.label}的头；是否允许由角色与当前关系决定。`,
      `我试探着向${target.label}伸出手，想轻轻摸一摸对方的头。我只是尝试，不预设对方会接受。`,
      'gal',
    ));
    base.push(action(target, 'leave', '离开', '不开始新会话。', '', 'close'));
    return base;
  }

  if (target.type === 'area' && target.id === 'main_house') {
    const unavailable = mainHouseRepairAvailability(state);
    return [
      action(
        target,
        'inspect',
        '检查',
        '查看旧主屋当前的损坏情况。',
        '我来到旧主屋前，先仔细检查屋体、结界痕迹和能够安全处理的损坏，不直接宣布维修成功。',
        'facility',
      ),
      action(
        target,
        'repair',
        '维修',
        unavailable || '确认条件后开始维修旧主屋。',
        '我确认现有条件后开始修复旧主屋。请完整演绎检查、施工、灵梦验收和可居住的固定收束，不要留下继续选择；正式状态由本地结算。',
        'facility',
        {
          disabled: Boolean(unavailable),
          disabledReason: unavailable || undefined,
          eventId: 'main_house_repair',
          fixedPresentation: true,
          mayAdvanceTime: true,
        },
      ),
      action(target, 'leave', '离开', '返回庭园，不进行操作。', '', 'close'),
    ];
  }

  if ((target.type === 'area' && target.id === 'greenhouse_plot')
    || (target.type === 'facility' && target.id === 'magic_greenhouse')) {
    return greenhouseActions(target, state);
  }

  return [
    action(
      target,
      'inspect',
      '查看',
      `查看${target.label}当前的状态。`,
      `我前往${target.label}，先观察这里当前的状况，不预设调查结果。`,
      'facility',
    ),
    action(target, 'leave', '离开', '返回庭园。', '', 'close'),
  ];
}

export function buildActionMessage(action: TargetAction, state: GardenState) {
  const marker = {
    version: 'garden-action.v1',
    target_type: action.target.type,
    target_id: action.target.id,
    action_id: action.id,
    event_id: action.eventId ?? null,
    ...(action.eventId ? { settlement_id: `event:${action.eventId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}` } : {}),
  };
  const settlementNotice = action.eventId
    ? `本次 ${action.eventId} 的正式事件、资源、时间、区域、设施与会话字段由本地结算器在回复完成后原子写入。你只负责自然叙事；不要输出 GensokyoEventResult，也不要在 UpdateVariable 中修改这些本地托管字段。`
    : '';
  const eventProjection = action.eventId
    ? buildEventPromptProjection(action.eventId, action.id, state)
    : '';
  return [
    '【庭园行动】',
    action.intent,
    eventProjection,
    settlementNotice,
    '',
    `<GensokyoAction>${JSON.stringify(marker)}</GensokyoAction>`,
  ].join('\n');
}

export function buildSettlementMessage(
  target: InteractionTarget | null,
  participantNames: string[],
  state?: GardenState,
) {
  const label = participantNames.length
    ? participantNames.join('、')
    : target?.label || '当前对象';
  const marker = {
    version: 'garden-action.v1',
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    action_id: 'end_conversation',
    event_id: state?.interaction?.current_session?.event_id ?? null,
  };
  const greenhouseConversation = state?.interaction?.current_session?.event_id === GREENHOUSE_EVENTS.conversation;
  const settlementRule = greenhouseConversation
    ? '这是 greenhouse_multiturn_conversation：请依据当前交流深度自然收尾；正式轮数、完成标记和幂等结算由本地结算器处理，不要在 UpdateVariable 中修改这些字段。'
    : '是否推进时段应依据实际内容或事件配置，普通短暂闲聊不要强制推进。';
  return [
    '【结束当前交互】',
    `我准备结束与${label}的这次互动，向在场者自然说明自己的打算后暂时离开。`,
    `请给出一次简短自然的收尾。${settlementRule}`,
    '',
    `<GensokyoAction>${JSON.stringify(marker)}</GensokyoAction>`,
  ].join('\n');
}

/**
 * 事件参与者属于请求结构化上下文，不再偷偷拼进玩家正文。
 * 调用方须把结果同时交给历史选择器和本轮角色绿灯注入。
 */
export function actionEventParticipantIds(action: TargetAction): string[] {
  if (!action.eventId) return [];
  return [...(eventById.get(action.eventId)?.participants ?? [])];
}

const FIXED_PRESENTATION_ACTION_IDS = new Set([
  'inspect_boundary',
  'repair',
  'investigate_magic_trace',
  'investigate_growth',
  'hear_marisa_plan',
  'study_grandfather_blueprint',
  'clear_greenhouse_foundation',
  'build_basic_magic_greenhouse',
  'greenhouse_first_use',
  'resume_battle_settlement',
  'organize_free_growth_proposal',
  'invite_alice_maintenance_assessment',
  'commission_nitori_engineering_survey',
  'select_free_growth',
  'select_doll_maintenance',
  'select_kappa_automation',
  'remodel_to_free_growth',
  'remodel_to_doll_maintenance',
  'remodel_to_kappa_automation',
  'investigate_clockwork_temporal_ripple',
  'investigate_sakuya_temporal_trace',
]);

/** Fixed progression replies never expose free-chat controls after a reload. */
export function isFixedPresentationAction(actionId: string) {
  return FIXED_PRESENTATION_ACTION_IDS.has(actionId);
}

