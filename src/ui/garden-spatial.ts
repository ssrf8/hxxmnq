import type { GardenState } from './types';

export interface GardenPoint { x: number; y: number }

/** Stable Chinese display names for built-in map areas. */
export const GARDEN_AREA_LABELS: Readonly<Record<string, string>> = Object.freeze({
  main_house: '主屋',
  central_courtyard: '中央庭院',
  greenhouse_plot: '魔法温室',
  fairy_garden_plot: '妖精花园',
  moon_spring_plot: '月见温泉',
  banquet_plaza_plot: '宴会广场',
});

/** Shared logical map coordinates used by both rendering and local proximity rules. */
export const GARDEN_AREA_POSITIONS: Readonly<Record<string, GardenPoint>> = Object.freeze({
  // v4（2026-08-08 拼接：v3 底图 + 下段新图）画布 1672×1722；
  // 以下 y 为按旧 941 高归一化坐标乘 941/1722 重算，视觉位置未变。
  main_house: { x: 0.50, y: 0.235 },
  central_courtyard: { x: 0.50, y: 0.317 },
  greenhouse_plot: { x: 0.19, y: 0.148 },
  fairy_garden_plot: { x: 0.81, y: 0.197 },
  moon_spring_plot: { x: 0.22, y: 0.383 },
  banquet_plaza_plot: { x: 0.78, y: 0.377 },
});

/**
 * 空庭园底图不再画死建筑。设施贴图接入前，所有区域统一使用贴地光环；
 * 后续轮廓应由独立设施 sprite 的透明边界或登记 hit polygon 提供，禁止复用旧底图描点。
 */
export const GARDEN_AREA_OUTLINES: Readonly<Record<string, readonly GardenPoint[]>> = Object.freeze({});

const REFITTABLE_FACILITY_AREAS = [
  ['fairy_garden', 'fairy_garden_plot'],
  ['moon_spring', 'moon_spring_plot'],
  ['banquet_plaza', 'banquet_plaza_plot'],
] as const;

export function gardenAreaPoint(areaId: string | undefined | null): GardenPoint {
  return GARDEN_AREA_POSITIONS[areaId ?? 'central_courtyard']
    ?? GARDEN_AREA_POSITIONS.central_courtyard;
}

export function gardenAreaLabel(areaId: string, fallbackName?: string): string {
  return GARDEN_AREA_LABELS[areaId] ?? fallbackName ?? '未知区域';
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
