// B4-T05 召回纯管线。只消费经过 T03 normalizer 的候选，不触碰请求、host 或 MVU。
import type { RelationshipRecallCandidate, StoryRecallCandidate } from './memory-archive-schema';
import {
  RELATIONSHIP_RECALL_PER_CHARACTER,
  STORY_RECALL_PER_CHARACTER,
  relationshipRowToCandidate,
  stableSerializeRecord,
  storyRowToCandidate,
} from './memory-archive-schema';

export type RecallDiagnosticStatus =
  | 'disabled-by-build'
  | 'unavailable'
  | 'ready'
  | 'recall-empty'
  | 'recall-partial'
  | 'recall-failed';

export const STORY_BUDGET_PER_CHARACTER = STORY_RECALL_PER_CHARACTER;
export const RELATIONSHIP_BUDGET_PER_CHARACTER = RELATIONSHIP_RECALL_PER_CHARACTER;
export const RECALL_TOTAL_BUDGET_CHARS = 2800;
export const RECALL_PER_CHARACTER_BUDGET_CHARS = 900;
export const RECALL_MAX_RELEVANT_CHARACTERS = 4;

export interface LocalMvuIdSet {
  storyIds: ReadonlySet<string>;
  relationshipIds: ReadonlySet<string>;
}

export interface LocalActiveRelationships {
  byCharacter: Record<string, ReadonlySet<string>>;
}

/** 数据库只能吃基础 MVU synthetic history 之后剩余的预算。缺省/非法值按 0 处理。 */
export interface RecallRemainingBudget {
  globalChars: number;
  perCharacterChars: Readonly<Record<string, number>>;
}

export interface RecallPipelineInput {
  archiveScopeId: string;
  relevantCharacterIds: readonly string[];
  storyRows: readonly unknown[];
  relationshipRows: readonly unknown[];
  localMvu: LocalMvuIdSet;
  localActiveRelationships: LocalActiveRelationships;
  remainingBudget: RecallRemainingBudget;
}

export type StoryRecallItem = StoryRecallCandidate;
export type RelationshipRecallItem = RelationshipRecallCandidate;

export interface RecallPipelineOutput {
  status: RecallDiagnosticStatus;
  story: StoryRecallItem[];
  relationship: RelationshipRecallItem[];
  rejected: {
    wrongScope: number;
    nonRelevant: number;
    duplicateDb: number;
    mvuDuplicate: number;
    invalid: number;
    budget: number;
  };
}

const MAX_INPUT_ROWS = 10000;

function clampBudget(value: unknown, max: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value as number))) : 0;
}

function compareStory(a: StoryRecallItem, b: StoryRecallItem): number {
  const period = (b.periodSerial ?? -1) - (a.periodSerial ?? -1);
  if (period !== 0) return period;
  const day = (b.day ?? '').localeCompare(a.day ?? '');
  if (day !== 0) return day;
  return a.memoryId.localeCompare(b.memoryId);
}

function compareRelationship(a: RelationshipRecallItem, b: RelationshipRecallItem): number {
  const period = (b.periodSerial ?? -1) - (a.periodSerial ?? -1);
  if (period !== 0) return period;
  const day = (b.day ?? '').localeCompare(a.day ?? '');
  if (day !== 0) return day;
  return a.relationshipMemoryId.localeCompare(b.relationshipMemoryId);
}

/** 按未来模型可见字段做保守计费；内部 ID/source 不进入 prompt，因此不占模型预算。 */
export function estimateRecallItemChars(item: StoryRecallItem | RelationshipRecallItem): number {
  const common = item.summary.length + (item.day?.length ?? 0) + (item.timePeriod?.length ?? 0) + 24;
  if ('memoryId' in item) return common;
  return common
    + item.kind.length
    + (item.relationshipLabel?.length ?? 0)
    + (item.eventKind?.length ?? 0)
    + 24;
}

function dedupeDeterministically<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): { items: T[]; rejected: number } {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const kept: T[] = [];
  let rejected = 0;
  for (const key of [...groups.keys()].sort()) {
    const group = groups.get(key)!;
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    const serialized = group.map((item) => stableSerializeRecord(item as unknown as Record<string, unknown>));
    if (serialized.every((value) => value === serialized[0])) {
      kept.push(group[0]);
      rejected += group.length - 1;
    } else {
      // 唯一键内容冲突时拒绝整组，不能让数据库输入顺序决定哪条进入 prompt。
      rejected += group.length;
    }
  }
  return { items: kept, rejected };
}

function capPerCharacter<T>(
  items: readonly T[],
  characterOf: (item: T) => string,
  limit: number,
): { items: T[]; rejected: number } {
  const counts = new Map<string, number>();
  const kept: T[] = [];
  let rejected = 0;
  for (const item of items) {
    const characterId = characterOf(item);
    const count = counts.get(characterId) ?? 0;
    if (count >= limit) {
      rejected += 1;
      continue;
    }
    counts.set(characterId, count + 1);
    kept.push(item);
  }
  return { items: kept, rejected };
}

export function runRecallPipeline(input: RecallPipelineInput): RecallPipelineOutput {
  const rejected = { wrongScope: 0, nonRelevant: 0, duplicateDb: 0, mvuDuplicate: 0, invalid: 0, budget: 0 };
  if (input.storyRows.length > MAX_INPUT_ROWS || input.relationshipRows.length > MAX_INPUT_ROWS) {
    return {
      status: 'recall-failed',
      story: [],
      relationship: [],
      rejected: { ...rejected, invalid: input.storyRows.length + input.relationshipRows.length },
    };
  }

  const relevant: string[] = [];
  const seenRelevant = new Set<string>();
  for (const rawId of input.relevantCharacterIds) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id || seenRelevant.has(id)) continue;
    seenRelevant.add(id);
    if (relevant.length < RECALL_MAX_RELEVANT_CHARACTERS) relevant.push(id);
  }
  const relevantSet = new Set(relevant);

  const normalizedStory: StoryRecallItem[] = [];
  for (const row of input.storyRows) {
    const normalized = storyRowToCandidate(row, input.archiveScopeId);
    if (!normalized.ok) {
      if (normalized.error.code === 'invalid-scope') rejected.wrongScope += 1;
      else rejected.invalid += 1;
      continue;
    }
    if (!relevantSet.has(normalized.value.characterId)) {
      rejected.nonRelevant += 1;
      continue;
    }
    normalizedStory.push(normalized.value);
  }

  const normalizedRelationship: RelationshipRecallItem[] = [];
  for (const row of input.relationshipRows) {
    const normalized = relationshipRowToCandidate(row, input.archiveScopeId);
    if (!normalized.ok) {
      if (normalized.error.code === 'invalid-scope') rejected.wrongScope += 1;
      else rejected.invalid += 1;
      continue;
    }
    if (!relevantSet.has(normalized.value.characterId)) {
      rejected.nonRelevant += 1;
      continue;
    }
    normalizedRelationship.push(normalized.value);
  }

  const storyDeduped = dedupeDeterministically(normalizedStory, (item) => item.memoryId);
  const relationshipDeduped = dedupeDeterministically(normalizedRelationship, (item) => item.relationshipMemoryId);
  rejected.duplicateDb += storyDeduped.rejected + relationshipDeduped.rejected;

  const storyWithoutLocal = storyDeduped.items.filter((item) => {
    if (!input.localMvu.storyIds.has(item.memoryId)) return true;
    rejected.mvuDuplicate += 1;
    return false;
  });
  const relationshipWithoutLocal = relationshipDeduped.items.filter((item) => {
    if (!input.localMvu.relationshipIds.has(item.relationshipMemoryId)) return true;
    rejected.mvuDuplicate += 1;
    return false;
  }).map((item) => ({
    ...item,
    // 数据库只能描述历史；当前 active 状态只由 MVU 的显式集合决定。
    active: input.localActiveRelationships.byCharacter[item.characterId]?.has(item.relationshipMemoryId) === true,
  }));

  storyWithoutLocal.sort(compareStory);
  relationshipWithoutLocal.sort(compareRelationship);
  const storyCapped = capPerCharacter(storyWithoutLocal, (item) => item.characterId, STORY_BUDGET_PER_CHARACTER);
  const relationshipCapped = capPerCharacter(relationshipWithoutLocal, (item) => item.characterId, RELATIONSHIP_BUDGET_PER_CHARACTER);
  rejected.budget += storyCapped.rejected + relationshipCapped.rejected;

  type Selection = { kind: 'story'; item: StoryRecallItem } | { kind: 'relationship'; item: RelationshipRecallItem };
  const highRelationship: Selection[] = relationshipCapped.items
    .filter((item) => item.significance === 3)
    .map((item) => ({ kind: 'relationship', item }));
  const stories: Selection[] = storyCapped.items.map((item) => ({ kind: 'story', item }));
  const ordinaryRelationship: Selection[] = relationshipCapped.items
    .filter((item) => item.significance !== 3)
    .map((item) => ({ kind: 'relationship', item }));
  const selection = [...highRelationship, ...stories, ...ordinaryRelationship];

  const globalLimit = clampBudget(input.remainingBudget?.globalChars, RECALL_TOTAL_BUDGET_CHARS);
  const perCharacterLimit = new Map(relevant.map((characterId) => [
    characterId,
    clampBudget(input.remainingBudget?.perCharacterChars?.[characterId], RECALL_PER_CHARACTER_BUDGET_CHARS),
  ]));
  const perCharacterUsed = new Map<string, number>();
  let globalUsed = 0;
  const storyFinal: StoryRecallItem[] = [];
  const relationshipFinal: RelationshipRecallItem[] = [];
  for (const entry of selection) {
    const item = entry.item;
    const characterId = item.characterId;
    const cost = estimateRecallItemChars(item);
    const characterUsed = perCharacterUsed.get(characterId) ?? 0;
    const characterLimit = perCharacterLimit.get(characterId) ?? 0;
    if (globalUsed + cost > globalLimit || characterUsed + cost > characterLimit) {
      rejected.budget += 1;
      continue;
    }
    globalUsed += cost;
    perCharacterUsed.set(characterId, characterUsed + cost);
    if (entry.kind === 'story') storyFinal.push(entry.item);
    else relationshipFinal.push(entry.item);
  }

  storyFinal.sort(compareStory);
  relationshipFinal.sort(compareRelationship);
  return {
    status: storyFinal.length + relationshipFinal.length === 0 ? 'recall-empty' : 'recall-partial',
    story: storyFinal,
    relationship: relationshipFinal,
    rejected,
  };
}
