import characterRouting from '../lorebook/character-routing.json';
import type { GardenState } from './types';

type CharacterRoute = {
  id: string;
  label: string;
  greenlight: string;
};

const routes = characterRouting.profiles as CharacterRoute[];
const routeById = new Map(routes.map((route) => [route.id, route]));
const allTokens = routes.map((route) => route.greenlight);
const reservedTokenPattern = new RegExp(`(?:${allTokens.join('|')})`, 'giu');

function activeStateCharacterIds(state?: GardenState): string[] {
  if (!state) return [];
  const moonSession = state.garden_activities?.moon_spring_session;
  const banquet = state.garden_activities?.banquet;
  const refitCharacterIds = Object.values(state.facility_runtime ?? {})
    .map((runtime) => runtime.pending_refit?.selected_character_id ?? '');
  const sceneItemCharacterIds = (state.scene_item_context?.status === 'closed' ? [] : (state.scene_item_context?.entries ?? []))
    .map((entry) => entry.initial_target_character_id ?? '');
  return [
    ...(state.presence_snapshot?.present_character_ids ?? []),
    ...(state.interaction?.current_session?.participant_character_ids ?? []),
    ...(state.events?.active_event?.participant_character_ids ?? []),
    ...refitCharacterIds,
    ...(moonSession?.status === 'active' ? moonSession.accepted_character_ids : []),
    ...(banquet?.status === 'active' ? banquet.accepted_character_ids : []),
    ...sceneItemCharacterIds,
  ];
}

export function resolveCharacterGreenlightIds(
  state?: GardenState,
  explicitCharacterIds: readonly string[] = [],
): string[] {
  return Array.from(new Set([
    ...activeStateCharacterIds(state),
    ...explicitCharacterIds,
  ].filter((id) => routeById.has(id))));
}

export function stripCharacterGreenlights(message: string): string {
  return message.replace(reservedTokenPattern, '');
}

export function characterGreenlightTokens(
  state?: GardenState,
  explicitCharacterIds: readonly string[] = [],
): string[] {
  return resolveCharacterGreenlightIds(state, explicitCharacterIds)
    .map((id) => routeById.get(id)!.greenlight);
}

export function characterGreenlightContext(
  state?: GardenState,
  explicitCharacterIds: readonly string[] = [],
): string {
  const tokens = characterGreenlightTokens(state, explicitCharacterIds);
  if (!tokens.length) return '';
  return [
    '【角色档案绿灯】',
    tokens.join(' '),
    '以上保留标记只负责加载本轮相关角色档案，不代表角色抵达、在场或建立关系。',
  ].join('\n');
}

export const registeredCharacterGreenlights = Object.freeze(
  Object.fromEntries(routes.map((route) => [route.id, route.greenlight])),
);
