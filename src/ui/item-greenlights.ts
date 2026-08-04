import itemRouting from '../lorebook/item-routing.json';
import type { GardenState } from './types';

type ItemRoute = {
  id: string;
  label: string;
  greenlight: string;
};

const routes = itemRouting.profiles as ItemRoute[];
const routeById = new Map(routes.map((route) => [route.id, route]));
const allTokens = routes.map((route) => route.greenlight);
const reservedTokenPattern = new RegExp(`(?:${allTokens.join('|')})`, 'giu');

function activeStateItemIds(state?: GardenState): string[] {
  if (!state) return [];
  return (state.scene_item_context?.entries ?? [])
    .map((entry) => entry.item_id)
    .filter((id): id is string => Boolean(id));
}

export function resolveItemGreenlightIds(
  state?: GardenState,
  explicitItemIds: readonly string[] = [],
): string[] {
  return Array.from(new Set([
    ...activeStateItemIds(state),
    ...explicitItemIds,
  ].filter((id) => routeById.has(id))));
}

export function stripItemGreenlights(message: string): string {
  return message.replace(reservedTokenPattern, '');
}

export function itemGreenlightContext(
  state?: GardenState,
  explicitItemIds: readonly string[] = [],
): string {
  const ids = resolveItemGreenlightIds(state, explicitItemIds);
  if (!ids.length) return '';
  return [
    '【道具档案绿灯】',
    ids.map((id) => routeById.get(id)!.greenlight).join(' '),
    '以上保留标记只负责加载本轮相关道具条目，不代表道具在场、已使用或必然生效；道具的实际使用仍以【本轮道具授权】为准。',
  ].join('\n');
}

export const registeredItemGreenlights = Object.freeze(
  Object.fromEntries(routes.map((route) => [route.id, route.greenlight])),
);
