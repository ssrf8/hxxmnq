import { buildFacilitySystemContext } from './facility-system-context';
import {
  buildSyntheticHistory,
  type SyntheticHistoryInput,
  type SyntheticHistoryResult,
} from './synthetic-history';

/** 把角色剧情梗概与当前设施事实合并为唯一、冻结的 system 历史消息。 */
export function buildGalSystemHistory(input: SyntheticHistoryInput): SyntheticHistoryResult {
  const memory = buildSyntheticHistory(input);
  const facilityContext = buildFacilitySystemContext(input.state);
  const content = [memory.content, facilityContext].filter(Boolean).join('\n\n');
  return {
    ...memory,
    content,
    history: [{ role: 'system', content }],
  };
}
