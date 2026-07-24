import type { GardenState, InteractionTarget, TargetAction } from './types';
import { GREENHOUSE_EVENTS, greenhouseActionBlock } from './greenhouse-rules';

const action = (
  target: InteractionTarget,
  id: string,
  label: string,
  description: string,
  intent: string,
  mode: TargetAction['mode'],
  extra: Partial<TargetAction> = {},
): TargetAction => ({ id, label, description, intent, mode, target, ...extra });

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
      { eventId: GREENHOUSE_EVENTS.rumor },
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
        { eventId: GREENHOUSE_EVENTS.inspiration },
      ),
      greenhouseAction(
        target,
        state,
        'hear_marisa_plan',
        '听魔理沙的方案',
        '和魔理沙讨论一个大胆但可落地的温室方案。',
        '我请魔理沙讲讲她设想的温室方案，并一起辨别哪些部分能安全实现。请按 gain_second_inspiration 结算；三个灵感入口共享同一事件，只能奖励一次。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.inspiration },
      ),
      greenhouseAction(
        target,
        state,
        'study_grandfather_blueprint',
        '研究祖父图纸',
        '从祖父留下的旧图纸中整理温室设计思路。',
        '我把祖父留下的图纸带到温室旧址，对照残存地基逐项研究。请按 gain_second_inspiration 结算；三个灵感入口共享同一事件，只能奖励一次。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.inspiration },
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
      { eventId: GREENHOUSE_EVENTS.clear, mayAdvanceTime: true },
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
      { eventId: GREENHOUSE_EVENTS.firstUse },
    ));
  } else if (!completed[GREENHOUSE_EVENTS.conversation]) {
    result.push(greenhouseAction(
      target,
      state,
      'greenhouse_research_talk',
      '持续研究交流',
      '在温室里与魔理沙展开至少两轮有效交流。',
      '我邀请魔理沙在温室里继续研究和交谈。请创建或延续 event_id 为 greenhouse_multiturn_conversation 的真实会话；每次完整有效的助手回复只增加一轮 effective_rounds，至少两轮后结束会话才能结算完成。',
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
        { eventId: GREENHOUSE_EVENTS.flowerCore },
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

export function targetActions(target: InteractionTarget, state: GardenState): TargetAction[] {
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
    if (target.id === 'reimu') {
      if (!state.events?.completed_key_events?.reimu_boundary_inspection) {
        base.unshift(action(
          target,
          'inspect_boundary',
          '检查结界',
          '与灵梦一起确认结界异常；回复完成后由本地结算器原子记录结果。',
          '我请博丽灵梦和我一起检查庭园边缘的结界异常，并依照她的判断确认当前处置方式。请自然演绎本次检查；正式结果会由第二次预设解析请求判断，再由本地结算器写入。',
          'gal',
          { eventId: 'reimu_boundary_inspection' },
        ));
      }
      base.push(action(
        target,
        'pat_head',
        '摸摸头',
        '尝试摸摸她的头；是否允许由角色与当前关系决定。',
        '我试探着向博丽灵梦伸出手，想轻轻摸一摸她的头。我只是尝试，不预设她会接受。',
        'gal',
      ));
    }
    if (target.id === 'marisa'
      && state.events?.completed_key_events?.[GREENHOUSE_EVENTS.firstUse]
      && !state.events?.completed_key_events?.[GREENHOUSE_EVENTS.conversation]) {
      base.push(greenhouseAction(
        target,
        state,
        'greenhouse_research_talk',
        '聊温室研究',
        '和魔理沙在温室里展开至少两轮有效交流。',
        '我邀请魔理沙去温室继续研究和交谈。请创建或延续 event_id 为 greenhouse_multiturn_conversation 的真实会话；每次完整有效的助手回复只增加一轮 effective_rounds，至少两轮后结束会话才能结算完成。',
        'gal',
        { eventId: GREENHOUSE_EVENTS.conversation },
      ));
    }
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
        '我确认现有条件后开始修复旧主屋。请按照 main_house_repair 的前置、阻断、参与者和允许结果演绎；在回复与 MVU 结算完成前，不要提前扣除资源或推进时间。',
        'facility',
        {
          disabled: Boolean(unavailable),
          disabledReason: unavailable || undefined,
          eventId: 'main_house_repair',
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

export function buildActionMessage(action: TargetAction) {
  const marker = {
    version: 'garden-action.v1',
    target_type: action.target.type,
    target_id: action.target.id,
    action_id: action.id,
    event_id: action.eventId ?? null,
  };
  const settlementNotice = action.eventId
    ? `本次 ${action.eventId} 的正式事件、资源、时间、区域、设施与会话字段由第二次带预设的结算解析请求和本地结算器在回复完成后原子写入。你只负责自然叙事与 GensokyoScene；不要输出 GensokyoEventResult，也不要在 UpdateVariable 中修改这些本地托管字段。`
    : '';
  return [
    '【庭园行动】',
    action.intent,
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

