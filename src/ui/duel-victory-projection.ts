import { getDuelProfile } from './duel-card-rules';
import { characterGreenlightContext } from './character-greenlights';
import { gardenNarrativeContract } from './target-actions';
import type { GardenState } from './types';

export function buildDuelVictoryMessage(state: GardenState, requestText: string): string {
  const pending = state.inventory?.card_runtime?.duel?.pending_victory_dialogue;
  if (!pending) throw new Error('没有待处理的对战胜利要求');
  const value = requestText.trim();
  if (!value || value.length > 240) throw new Error('胜利要求应为 1–240 个字符');
  const profile = getDuelProfile(pending.target_character_id);
  if (!profile) throw new Error('胜利对手没有登记角色档案');
  return [
    [
      '【角色对战胜利剧情】',
      `可信胜利结算：玩家已在符卡对战中战胜 ${profile.display_name}（${profile.character_id}）。`,
      `玩家锁定的要求：${value}`,
      `${profile.display_name}必须承认本次对战结果并答应这个要求，不再进行成功率、说服、反悔或第二次胜负判定。`,
      '只演绎对手听到要求后的自然反应、确认与必要追问；不要替玩家追加要求，不要开始另一场战斗。',
      '这是独立的对战后场景，对手无需原本就在庭院；本轮出现不代表其抵达庭院，也不得据此改变庭园在场状态。',
      '本剧情只产生叙事承诺与自然关系事实，不得增加金币、物资、卡片、标签、设施、事件或角色在场状态。',
      '不要输出或改写 inventory.card_runtime、battle、resources、facilities、events、presence_snapshot。',
    ].join('\n'),
    gardenNarrativeContract,
    characterGreenlightContext(state, [profile.character_id]),
  ].filter(Boolean).join('\n\n');
}
