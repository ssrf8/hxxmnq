// 第三批 B3-T04 —— 冻结 baseline reader 的纯解析部分。
//
// 合同：project/gal-character-memory-batch-3-regeneration-runbook.md §4.3、T04
//   - 从调用方传入的 all-swipes message fixture 精确提取 frozen MvuData，不直接调宿主；
//   - request floor ID 精确、frozen swipe ID 精确；返回完整 MvuData 深克隆；
//   - 保留 stat/display/delta/schema/initialized_lorebooks/unknown；
//   - 不从"最近有效 state"兜底；不共享引用（mutation 不影响原 fixture）；
//   - null baseline 仅按 V2 builder 已定义的开场边界处理（stateMessageIdBeforeGeneration=null →
//     返回 baseline null），不擅自造默认状态；
//   - 数组越界、data 缺失、floor 不存在立即失败。
// 禁止：给 Mvu.getMvuData 增加 swipe 参数；读宿主；写楼层。

import type { GalRegenerationSwipeArraysViewV1 } from './gal-regeneration-locator';

export interface FrozenBaselineReadInputV1 {
  /** 冻结的 state message floor ID（V2 builder 冻结；null = 开场边界）。 */
  stateMessageIdBeforeGeneration: number | null;
  /** 冻结的 state swipe ID。 */
  stateSwipeIdBeforeGeneration: number | null;
  /** 目标 message floor 的 all-swipes 视图；floor 不存在时为 null。 */
  message: GalRegenerationSwipeArraysViewV1 | null;
}

export type FrozenBaselineReadResultV1 =
  | { ok: true; baseline: Record<string, unknown> | null }
  | { ok: false; code: 'floor-not-found' | 'swipe-not-found' | 'data-missing' | 'malformed'; detail?: string };

/**
 * 精确读取 frozen MvuData（纯函数）：
 * - stateMessageIdBeforeGeneration === null → 开场边界，返回 { ok:true, baseline:null }（调用方按 V2 开场处理）；
 * - floor 视图缺失或 message_id 与冻结 ID 不一致 → floor-not-found；
 * - swipes_data 非数组 → malformed；swipe 越界 → swipe-not-found；
 * - swipes_data[swipe] 缺/null/非对象 → data-missing；
 * - 成功 → 深克隆（structuredClone），保留全部字段与未知字段。
 */
export function readFrozenBaselineV1(input: FrozenBaselineReadInputV1): FrozenBaselineReadResultV1 {
  if (input.stateMessageIdBeforeGeneration === null) {
    return { ok: true, baseline: null };
  }
  if (input.message === null || input.message === undefined) {
    return { ok: false, code: 'floor-not-found', detail: `floor ${input.stateMessageIdBeforeGeneration} 不存在` };
  }
  const messageId = typeof input.message.message_id === 'number' ? input.message.message_id : Number(input.message.message_id);
  if (!Number.isInteger(messageId) || messageId !== input.stateMessageIdBeforeGeneration) {
    return {
      ok: false,
      code: 'floor-not-found',
      detail: `message_id ${String(input.message.message_id)} !== frozen ${input.stateMessageIdBeforeGeneration}`,
    };
  }
  if (!Array.isArray(input.message.swipes_data)) {
    return { ok: false, code: 'malformed', detail: 'swipes_data 不是数组' };
  }
  const swipeId = input.stateSwipeIdBeforeGeneration;
  if (swipeId === null || swipeId < 0 || swipeId >= input.message.swipes_data.length) {
    return { ok: false, code: 'swipe-not-found', detail: `swipe ${String(swipeId)} 越界 count=${input.message.swipes_data.length}` };
  }
  const data = input.message.swipes_data[swipeId];
  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, code: 'data-missing', detail: `swipes_data[${swipeId}] 缺少有效 data` };
  }
  // 深克隆：不共享引用，调用方 mutation 不影响原 fixture；未知字段一并保留。
  return { ok: true, baseline: structuredClone(data) };
}
