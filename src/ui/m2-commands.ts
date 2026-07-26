import type { GardenState, M2Command, M2CommandResult } from './types';
import { acknowledgeGraduation } from './open-garden-rules';
import {
  beginFacilityRecovery,
  beginFacilityRemodel,
  buildFacility,
  cancelFacilityRecovery,
  cancelFacilityRemodel,
  chooseSecondFacilityForm,
  commitFacilityRecovery,
  commitFacilityRemodel,
  recordFacilityChatPeriod,
  rollFacilityRisk,
} from './facility-rules';
import {
  clearSceneItemContext,
  endBanquet,
  endConversationLocal,
  endMoonSpringSession,
  queueSceneItemUse,
  scheduleBanquet,
  startDueBanquet,
  startMoonSpringSession,
} from './activity-rules';
import { consumeVisitNotices, inviteCharacter } from './visitor-rules';
import { reconcileM2Runtime } from './m2-runtime';
import { claimPendingTask, releasePendingTask, removePendingTask } from './task-rules';

export function applyM2Command(
  before: GardenState,
  command: M2Command,
  chatId = 'local',
): { state: GardenState; result: M2CommandResult } {
  let state = structuredClone(before);
  let result: M2CommandResult = { message: '操作已完成' };
  switch (command.type) {
    case 'acknowledge_graduation':
      state = acknowledgeGraduation(state);
      result.message = '已确认教程毕业说明';
      break;
    case 'build_facility':
      state = buildFacility(state, command.facilityId, command.formId, command.transactionId);
      state = reconcileM2Runtime(before, state, chatId);
      result.message = '设施已建成并投入使用';
      break;
    case 'choose_second_form':
      state = chooseSecondFacilityForm(state, command.facilityId, command.formId);
      result.message = '第二方案已取得，可以随时装修切换';
      break;
    case 'begin_refit': {
      const started = beginFacilityRemodel(state, command.facilityId, command.formId, command.transactionId, chatId);
      state = started.state;
      result = { message: '装修材料已预留', selectedCharacterId: started.selectedCharacterId };
      break;
    }
    case 'commit_refit':
      state = commitFacilityRemodel(state, command.transactionId);
      state = reconcileM2Runtime(before, state, chatId);
      result.message = '装修完成，设施形态已切换';
      break;
    case 'cancel_refit':
      state = cancelFacilityRemodel(state, command.transactionId);
      result.message = '装修已取消，预留物资已退回';
      break;
    case 'facility_action': {
      const rolled = rollFacilityRisk(state, command.facilityId, command.actionId, command.transactionId);
      state = recordFacilityChatPeriod(rolled.state, command.facilityId);
      result = {
        message: rolled.triggered ? `行动触发设施${rolled.severity === 'damaged' ? '损坏' : '异常'}` : '设施行动已登记',
        risk: { triggered: rolled.triggered, severity: rolled.severity, conditionId: rolled.conditionId },
      };
      break;
    }
    case 'begin_recovery':
      state = beginFacilityRecovery(state, command.facilityId, command.transactionId, command.useRepairKit);
      result.message = '修复资源已预留';
      break;
    case 'commit_recovery':
      state = commitFacilityRecovery(state, command.transactionId);
      state = reconcileM2Runtime(before, state, chatId);
      result.message = '设施已恢复正常';
      break;
    case 'cancel_recovery':
      state = cancelFacilityRecovery(state, command.transactionId);
      result.message = '修复已取消，预留资源已退回';
      break;
    case 'invite_character': {
      const invited = inviteCharacter(state, command.characterId, command.inviteId, chatId);
      state = invited.state;
      result.message = invited.message;
      break;
    }
    case 'consume_visit_notices': {
      const consumed = consumeVisitNotices(state);
      state = consumed.state;
      result.message = consumed.notices.join('；') || '没有新的来访通知';
      break;
    }
    case 'start_moon_session':
      state = startMoonSpringSession(state, command.mode, command.acceptedCharacterIds);
      result.message = '月见温泉会话已开始';
      break;
    case 'end_moon_session':
      state = endMoonSpringSession(state);
      result.message = '月见温泉会话已结束';
      break;
    case 'schedule_banquet':
      state = scheduleBanquet(state, {
        activityId: command.activityId,
        mode: command.mode,
        invitedCharacterIds: command.invitedCharacterIds,
        startOffsetPeriods: command.startOffsetPeriods,
      });
      state = reconcileM2Runtime(before, state, chatId);
      result.message = '宴会安排已登记';
      break;
    case 'start_due_banquet':
      state = startDueBanquet(state, chatId, command.activityId);
      state = removePendingTask(state, 'banquet_start', command.activityId);
      result.message = '宴会已经开始';
      break;
    case 'end_banquet':
      state = endBanquet(state);
      result.message = '宴会已结束';
      break;
    case 'end_conversation_local':
      state = endConversationLocal(state);
      state = reconcileM2Runtime(before, state, chatId);
      state = endConversationLocal(state);
      result.message = '聊天已直接结束';
      break;
    case 'claim_pending_task':
      state = claimPendingTask(state, command.taskId);
      result.message = '待办已锁定处理';
      break;
    case 'release_pending_task':
      state = releasePendingTask(state, command.taskId);
      result.message = '待办已恢复为可处理状态';
      break;
    case 'queue_scene_item':
      state = queueSceneItemUse(state, command.itemId, command.useId, command.sceneId, command.targetCharacterId);
      result.message = '道具已加入当前场景并完成本地消费';
      break;
    case 'clear_scene_items':
      state = clearSceneItemContext(state);
      result.message = '场景道具上下文已清理';
      break;
  }
  return { state, result };
}
