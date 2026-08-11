import { characterGreenlightTokens, stripCharacterGreenlights } from './character-greenlights';
import { itemGreenlightTokens, stripItemGreenlights } from './item-greenlights';
import { buildPromptContext } from './prompt-context';
import {
  gardenNarrativeContract,
  presenceNarrativeContext,
  sceneItemAuthorizationContext,
} from './target-actions';
import type { GardenState } from './types';

export const GAL_PROMPT_REVISION = 'gal-prompt.v7' as const;
export const PREVIOUS_USER_FLOOR_GAL_PROMPT_REVISION = 'gal-prompt.v6' as const;
export const MESSAGE_SCOPE_GAL_PROMPT_REVISION = 'gal-prompt.v5' as const;
export const REQUEST_BODY_GAL_PROMPT_REVISION = 'gal-prompt.v4' as const;
export const SYSTEM_TAIL_GAL_PROMPT_REVISION = 'gal-prompt.v3' as const;
export const PREVIOUS_GAL_PROMPT_REVISION = 'gal-prompt.v2' as const;
export const LEGACY_GAL_PROMPT_REVISION = 'gal-prompt.v1' as const;
export const OPENING_GUIDANCE_GREENLIGHT = 'GSK_OPENING_GUIDANCE_ACTIVE' as const;
export const EMPTY_ROUTE_GREENLIGHT = 'GSK_ROUTE_NONE' as const;

export interface GalPromptContextTailInjection {
  position: 'in_chat';
  depth: 0;
  role: 'system';
  content: string;
  should_scan: false;
}

export interface GalPromptRouteScanInjection {
  position: 'none';
  depth: 0;
  role: 'system';
  content: string;
  should_scan: true;
}

export interface PreviousGalPromptInjection {
  position: 'in_chat';
  depth: 1;
  role: 'system';
  content: string;
  should_scan: false;
}

export type GalPromptInjection =
  | GalPromptContextTailInjection
  | GalPromptRouteScanInjection
  | PreviousGalPromptInjection;

/** 只清理项目保留绿灯；不会把玩家伪造的协议标题当成真实系统注入。 */
export function sanitizeGalPlayerInput(text: string): string {
  const withoutReservedTaskProjection = String(text ?? '')
    .replace(/<GensokyoVariableAnalysisTask>[\s\S]*?<\/GensokyoVariableAnalysisTask>/giu, '')
    .replace(/<\/?GensokyoVariableAnalysisTask>/giu, '');
  return stripCharacterGreenlights(stripItemGreenlights(withoutReservedTaskProjection)).trim();
}

function openingGuidanceActive(state: GardenState): boolean {
  const completed = state.events?.completed_key_events ?? {};
  return state.meta?.opening_committed === true
    && !completed.reimu_boundary_inspection
    && !state.interaction?.current_session
    && (state.presence_snapshot?.present_character_ids ?? []).length === 0;
}

export function buildGalCurrentTurnContext(state: GardenState, narrativeCharacterIds?: readonly string[]): string {
  return [
    gardenNarrativeContract,
    presenceNarrativeContext(state, narrativeCharacterIds),
    buildPromptContext(state, { kind: 'ordinary', narrativeCharacterIds }),
    sceneItemAuthorizationContext(state),
  ].filter((part) => part.trim().length > 0).join('\n\n');
}

/**
 * 构造要持久化到真实 user 楼层的完整正文。
 * v5 的生成配置只能逐字复用该楼层正文，禁止在 generate 阶段重新追加上下文。
 */
export function buildGalStoredUserMessage(input: {
  playerInput: string;
  state: GardenState;
  narrativeCharacterIds?: readonly string[];
  variableAnalysisTaskProjection?: string;
}): string {
  const playerInput = sanitizeGalPlayerInput(input.playerInput);
  if (!playerInput) return '';
  const context = buildGalCurrentTurnContext(input.state, input.narrativeCharacterIds);
  return [playerInput, context, input.variableAnalysisTaskProjection ?? '']
    .filter((part) => part.trim().length > 0)
    .join('\n\n');
}

/** v4 维护 API：内容形状与 v5 的真实楼层正文相同，保留给旧测试/调用方。 */
export const buildGalModelUserInput = buildGalStoredUserMessage;

/** 新请求只保留不进入模型提示的世界书扫描胶囊。 */
export function buildGalCurrentTurnInjections(input: {
  state: GardenState;
  explicitCharacterIds?: readonly string[];
  narrativeCharacterIds?: readonly string[];
}): [GalPromptRouteScanInjection] {
  const routeTokens = [
    ...(openingGuidanceActive(input.state) ? [OPENING_GUIDANCE_GREENLIGHT] : []),
    ...characterGreenlightTokens(input.state, input.explicitCharacterIds, input.narrativeCharacterIds),
    ...itemGreenlightTokens(input.state),
  ];

  return [{
    position: 'none',
    depth: 0,
    role: 'system',
    content: routeTokens.join(' ') || EMPTY_ROUTE_GREENLIGHT,
    should_scan: true,
  }];
}

export function isValidPreviousGalPromptInjection(value: unknown): value is PreviousGalPromptInjection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return item.position === 'in_chat'
    && item.depth === 1
    && item.role === 'system'
    && item.should_scan === false
    && typeof item.content === 'string'
    && item.content.trim().length > 0;
}

function isValidSystemTailGalPromptInjectionSet(value: unknown): value is GalPromptInjection[] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [context, route] = value as Array<Record<string, unknown>>;
  return context?.position === 'in_chat'
    && context.depth === 0
    && context.role === 'system'
    && context.should_scan === false
    && typeof context.content === 'string'
    && context.content.trim().length > 0
    && route?.position === 'none'
    && route.depth === 0
    && route.role === 'system'
    && route.should_scan === true
    && typeof route.content === 'string'
    && route.content.trim().length > 0
    && !/[【】\n]/u.test(route.content)
    && route.content.split(/\s+/u).every((token) => /^GSK_[A-Z0-9_]+$/u.test(token));
}

export function isValidGalPromptInjectionSet(value: unknown): value is GalPromptInjection[] {
  if (!Array.isArray(value) || value.length !== 1) return false;
  const [route] = value as Array<Record<string, unknown>>;
  return route?.position === 'none'
    && route.depth === 0
    && route.role === 'system'
    && route.should_scan === true
    && typeof route.content === 'string'
    && route.content.trim().length > 0
    && !/[【】\n]/u.test(route.content)
    && route.content.split(/\s+/u).every((token) => /^GSK_[A-Z0-9_]+$/u.test(token));
}

export function isSupportedGalPromptRevision(revision: unknown): revision is
  | typeof LEGACY_GAL_PROMPT_REVISION
  | typeof PREVIOUS_GAL_PROMPT_REVISION
  | typeof SYSTEM_TAIL_GAL_PROMPT_REVISION
  | typeof REQUEST_BODY_GAL_PROMPT_REVISION
  | typeof MESSAGE_SCOPE_GAL_PROMPT_REVISION
  | typeof PREVIOUS_USER_FLOOR_GAL_PROMPT_REVISION
  | typeof GAL_PROMPT_REVISION {
  return revision === LEGACY_GAL_PROMPT_REVISION
    || revision === PREVIOUS_GAL_PROMPT_REVISION
    || revision === SYSTEM_TAIL_GAL_PROMPT_REVISION
    || revision === REQUEST_BODY_GAL_PROMPT_REVISION
    || revision === MESSAGE_SCOPE_GAL_PROMPT_REVISION
    || revision === PREVIOUS_USER_FLOOR_GAL_PROMPT_REVISION
    || revision === GAL_PROMPT_REVISION;
}

export function isValidGalPromptInjectsForRevision(revision: unknown, value: unknown): value is GalPromptInjection[] {
  if (revision === GAL_PROMPT_REVISION
    || revision === PREVIOUS_USER_FLOOR_GAL_PROMPT_REVISION
    || revision === MESSAGE_SCOPE_GAL_PROMPT_REVISION
    || revision === REQUEST_BODY_GAL_PROMPT_REVISION) {
    return isValidGalPromptInjectionSet(value);
  }
  if (revision === SYSTEM_TAIL_GAL_PROMPT_REVISION) return isValidSystemTailGalPromptInjectionSet(value);
  if (revision === PREVIOUS_GAL_PROMPT_REVISION) {
    return Array.isArray(value) && value.length === 1 && isValidPreviousGalPromptInjection(value[0]);
  }
  return revision === LEGACY_GAL_PROMPT_REVISION && value === undefined;
}

/** v2 保持旧 content hash；v3–v7 覆盖全部注入公开字段与顺序。 */
export function galPromptInjectsFingerprintInput(
  revision: string,
  injects: readonly GalPromptInjection[],
): string {
  if (revision === PREVIOUS_GAL_PROMPT_REVISION) return injects[0]?.content ?? '';
  return JSON.stringify(injects.map((item) => ({
    position: item.position,
    depth: item.depth,
    role: item.role,
    content: item.content,
    should_scan: item.should_scan,
  })));
}
