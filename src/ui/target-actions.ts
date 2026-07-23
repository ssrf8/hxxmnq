import type { GardenState, InteractionTarget, TargetAction } from './types';

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
      base.push(action(
        target,
        'pat_head',
        '摸摸头',
        '尝试摸摸她的头；是否允许由角色与当前关系决定。',
        '我试探着向博丽灵梦伸出手，想轻轻摸一摸她的头。我只是尝试，不预设她会接受。',
        'gal',
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
  return [
    '【庭园行动】',
    action.intent,
    '',
    `<GensokyoAction>${JSON.stringify(marker)}</GensokyoAction>`,
  ].join('\n');
}

export function buildSettlementMessage(target: InteractionTarget | null, participantNames: string[]) {
  const label = participantNames.length
    ? participantNames.join('、')
    : target?.label || '当前对象';
  const marker = {
    version: 'garden-action.v1',
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    action_id: 'end_conversation',
  };
  return [
    '【结束当前交互】',
    `我准备结束与${label}的这次互动，向在场者自然说明自己的打算后暂时离开。`,
    '请给出一次简短自然的收尾；随后更新覆盖式会话摘要，使用当前会话 UID 形成唯一结算 ID，只有未结算时才追加到 interaction.settled_ids，最后清空 interaction.current_session。是否推进时段应依据实际内容或事件配置，普通短暂闲聊不要强制推进。',
    '',
    `<GensokyoAction>${JSON.stringify(marker)}</GensokyoAction>`,
  ].join('\n');
}

