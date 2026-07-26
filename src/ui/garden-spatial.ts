import type { GardenState } from './types';

export interface GardenPoint { x: number; y: number }

/** Shared logical map coordinates used by both rendering and local proximity rules. */
export const GARDEN_AREA_POSITIONS: Readonly<Record<string, GardenPoint>> = Object.freeze({
  main_house: { x: 0.25, y: 0.28 },
  central_courtyard: { x: 0.48, y: 0.55 },
  greenhouse_plot: { x: 0.72, y: 0.35 },
  fairy_garden_plot: { x: 0.76, y: 0.68 },
  moon_spring_plot: { x: 0.28, y: 0.76 },
  banquet_plaza_plot: { x: 0.50, y: 0.82 },
});

/**
 * 按 garden-base-spring-v1 底图手描的建筑/地块轮廓（底图宽高的比例坐标）。
 * 仅用于悬停/选中时的描边发光渲染；没有条目的区域回退贴地光环。
 * 换底图素材时需要重描。
 */
export const GARDEN_AREA_OUTLINES: Readonly<Record<string, readonly GardenPoint[]>> = Object.freeze({
  main_house: [
    { x: 0.235, y: 0.185 },
    { x: 0.30, y: 0.115 },
    { x: 0.345, y: 0.075 },
    { x: 0.46, y: 0.062 },
    { x: 0.525, y: 0.155 },
    { x: 0.525, y: 0.25 },
    { x: 0.475, y: 0.30 },
    { x: 0.435, y: 0.335 },
    { x: 0.30, y: 0.315 },
    { x: 0.218, y: 0.26 },
  ],
  central_courtyard: [
    { x: 0.457, y: 0.47 },
    { x: 0.47, y: 0.415 },
    { x: 0.503, y: 0.40 },
    { x: 0.536, y: 0.415 },
    { x: 0.549, y: 0.47 },
    { x: 0.536, y: 0.525 },
    { x: 0.503, y: 0.545 },
    { x: 0.47, y: 0.525 },
  ],
  greenhouse_plot: [
    { x: 0.672, y: 0.48 },
    { x: 0.78, y: 0.375 },
    { x: 0.945, y: 0.45 },
    { x: 0.93, y: 0.615 },
    { x: 0.78, y: 0.675 },
  ],
  banquet_plaza_plot: [
    { x: 0.30, y: 0.79 },
    { x: 0.42, y: 0.735 },
    { x: 0.49, y: 0.705 },
    { x: 0.585, y: 0.735 },
    { x: 0.655, y: 0.79 },
    { x: 0.63, y: 0.855 },
    { x: 0.325, y: 0.855 },
  ],
});

const REFITTABLE_FACILITY_AREAS = [
  ['fairy_garden', 'fairy_garden_plot'],
  ['moon_spring', 'moon_spring_plot'],
  ['banquet_plaza', 'banquet_plaza_plot'],
] as const;

export function gardenAreaPoint(areaId: string | undefined | null): GardenPoint {
  return GARDEN_AREA_POSITIONS[areaId ?? 'central_courtyard']
    ?? GARDEN_AREA_POSITIONS.central_courtyard;
}

/** Returns the one M2 facility whose map anchor is nearest to the supplied area. */
export function nearestRefittableFacilityId(areaId: string | undefined | null): string {
  const point = gardenAreaPoint(areaId);
  let nearestId: string = REFITTABLE_FACILITY_AREAS[0][0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const [facilityId, facilityAreaId] of REFITTABLE_FACILITY_AREAS) {
    const facilityPoint = gardenAreaPoint(facilityAreaId);
    const dx = point.x - facilityPoint.x;
    const dy = point.y - facilityPoint.y;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearestId = facilityId;
      nearestDistance = distance;
    }
  }
  return nearestId;
}

export function charactersNearestToFacility(state: GardenState, facilityId: string): string[] {
  const present = state.presence_snapshot?.present_character_ids ?? [];
  const views = state.presence_snapshot?.character_views ?? {};
  return present.filter((characterId) => (
    nearestRefittableFacilityId(views[characterId]?.area_id) === facilityId
  ));
}
