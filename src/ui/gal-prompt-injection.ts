import { characterGreenlightContext, stripCharacterGreenlights } from './character-greenlights';
import { itemGreenlightContext, stripItemGreenlights } from './item-greenlights';
import { buildPromptContext } from './prompt-context';
import {
  gardenNarrativeContract,
  presenceNarrativeContext,
  sceneItemAuthorizationContext,
} from './target-actions';
import type { GardenState } from './types';

export const GAL_PROMPT_REVISION = 'gal-prompt.v2' as const;
export const LEGACY_GAL_PROMPT_REVISION = 'gal-prompt.v1' as const;

export interface GalPromptInjection {
  position: 'in_chat';
  depth: 1;
  role: 'system';
  content: string;
  should_scan: false;
}

/** 只清理项目保留绿灯；不会把玩家伪造的协议标题当成真实系统注入。 */
export function sanitizeGalPlayerInput(text: string): string {
  return stripCharacterGreenlights(stripItemGreenlights(String(text ?? ''))).trim();
}

/** 本轮唯一 system inject。纯函数：不读宿主、不写状态、不创建真实聊天楼层。 */
export function buildGalCurrentTurnInjection(input: {
  state: GardenState;
  explicitCharacterIds?: readonly string[];
}): GalPromptInjection {
  const content = [
    gardenNarrativeContract,
    presenceNarrativeContext(input.state),
    buildPromptContext(input.state, { kind: 'ordinary' }),
    sceneItemAuthorizationContext(input.state),
    characterGreenlightContext(input.state, input.explicitCharacterIds),
    itemGreenlightContext(input.state),
  ].filter((part) => part.trim().length > 0).join('\n\n');
  return {
    position: 'in_chat',
    depth: 1,
    role: 'system',
    content,
    should_scan: false,
  };
}

export function isValidGalPromptInjection(value: unknown): value is GalPromptInjection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return item.position === 'in_chat'
    && item.depth === 1
    && item.role === 'system'
    && item.should_scan === false
    && typeof item.content === 'string'
    && item.content.trim().length > 0;
}
