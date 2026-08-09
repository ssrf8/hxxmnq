// 第二批 B2-T06 —— 合成历史投影器（synthetic-history）。
//
// 职责边界（runbook §3.5–3.6）：
//   - 纯投影器，不可能接触真实楼层：签名只接收 GardenState、冻结 relevant IDs、
//     冻结 visit map、角色登记信息；绝不接收 chat messages / SillyTavern context / 宿主 getter；
//   - 输出恰好一条 system 消息；无任何可投影内容时返回固定边界消息；
//   - 真实楼层是状态承载，不等于模型历史（database-rolecards floor/UI binding）。
// 禁止：把过去摘要伪装成 assistant 原话；用现实日期猜游戏内昨天/今天；
//       按正文角色名猜参与者；legacy_unassigned 投影给错误角色。

import type { GardenState, RelationshipMemory, VisitTurn } from './types';

export const SYNTHETIC_HISTORY_REVISION = 'gal-synthetic-history.v1';
export const HISTORY_BOUNDARY_MESSAGE = '【历史边界】本请求不读取 SillyTavern 真实聊天楼层；当前没有可投影的角色入场记忆。';
/** 过去块边界句：禁止模型把旧入场当作当前现场续接。 */
export const PAST_BOUNDARY_LINE = '不可续接旧地点、姿势、动作进行态、未完台词或即时意图；当前在场状态与本轮场景事实优先。';
/** 本次块提示句。 */
export const CURRENT_CONTINUITY_LINE = '以下属于角色当前这次在场，可用于维持本次场景连续性；当前在场状态与本轮场景事实优先。';
/** 旧版遗留记忆提示句。 */
export const LEGACY_BOUNDARY_LINE = '没有可靠入场和时间，只能作为模糊长期记忆，不得视为当前场景。';

/** §3.6 预算常量。 */
export const PER_CHARACTER_BUDGET = 900;
export const TOTAL_BUDGET = 2800;
export const CURRENT_VISIT_MAX_TURNS = 6;
export const PAST_VISIT_MAX_COUNT = 2;
export const PAST_VISIT_MAX_TURNS = 6;
export const RELATIONSHIP_MAX_ITEMS = 6;

export interface SyntheticHistoryInput {
  /** 只读状态；投影器不修改它。 */
  state: GardenState;
  /** 请求时冻结的相关角色（稳定顺序、已去重）。 */
  relevantCharacterIds: readonly string[];
  /** 请求时冻结的 visit map（characterId → visit_id | null）。 */
  visitIdsByCharacter: Record<string, string | null>;
  /** 角色登记信息：characterId → 显示名（缺省回退 characterId）。 */
  characterNames?: Record<string, string>;
}

export interface SyntheticHistoryResult {
  /** 恰好一条 system 消息。 */
  history: Array<{ role: 'system'; content: string }>;
  content: string;
  /** 实际投影了内容的角色（无内容角色不在内）。 */
  characters: string[];
}

const NO_TIME = '时间未记录';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function visitMemoryOf(state: GardenState): Record<string, unknown> | undefined {
  const root = state?.interaction?.visit_memory;
  return isRecord(root) && isRecord(root.by_character) ? root.by_character : undefined;
}

function characterMemoryOf(state: GardenState, characterId: string): Record<string, unknown> | null {
  const byCharacter = visitMemoryOf(state);
  if (!byCharacter) return null;
  const entry = byCharacter[characterId];
  return isRecord(entry) ? entry : null;
}

function asTurns(value: unknown): VisitTurn[] {
  return Array.isArray(value) ? value.filter((item): item is VisitTurn => isRecord(item)) : [];
}

function asRelationships(value: unknown): RelationshipMemory[] {
  return Array.isArray(value) ? value.filter((item): item is RelationshipMemory => isRecord(item)) : [];
}

function turnTime(turn: VisitTurn): string {
  const day = turn.day == null ? null : String(turn.day);
  const period = turn.time_period ? String(turn.time_period) : null;
  if (day == null && period == null) return NO_TIME;
  if (day == null) return `时间未记录·${period}`;
  if (period == null) return `第${day}日`;
  return `第${day}日·${period}`;
}

/** 过去入场排序键：ended serial → ended day → 原数组顺序。 */
function pastVisitSortKey(visit: { ended_period_serial?: number | null; ended_day?: number | string | null }, index: number) {
  const serial = typeof visit.ended_period_serial === 'number' ? visit.ended_period_serial : -1;
  const day = visit.ended_day == null ? -1 : Number(visit.ended_day);
  return [serial, day, index];
}

/** 关系排序：active state 最前，active boundary/conflict 次之，其余 significance 降序 → period_serial 降序。 */
function relationshipSortKey(rel: RelationshipMemory, index: number) {
  const priority =
    rel.kind === 'relationship_state' && rel.active ? 0
    : (rel.kind === 'boundary' || rel.kind === 'conflict') && rel.active ? 1
    : 2;
  const significance = 4 - rel.significance; // 3 → 1（最前），1 → 3
  const serial = typeof rel.period_serial === 'number' ? -rel.period_serial : 0;
  return [priority, significance, serial, index];
}

function relationshipLine(rel: RelationshipMemory): string {
  const when = rel.day == null && !rel.time_period ? NO_TIME
    : `${rel.day == null ? '时间未记录' : `第${rel.day}日`}${rel.time_period ? `·${rel.time_period}` : ''}`;
  return `- ${when}：${String(rel.summary ?? '').trim()}`;
}

/** 时间稳定比较：null 排后；period_serial 优先，其次 day，最后 index。 */
function turnSortKey(turn: VisitTurn, index: number) {
  const serial = typeof turn.period_serial === 'number' ? turn.period_serial : -1;
  const day = turn.day == null ? -1 : Number(turn.day);
  return [serial, day, index];
}

interface CharacterBlockParts {
  header: string;
  relationshipLines: string[];
  pastVisitBlocks: string[]; // 每块已含标题与边界句；内部旧到新
  currentLines: string[];
  legacyLines: string[];
}

/**
 * 构建单个角色的块（不含本次入场行：当前 visit 由调用方按冻结 visit ID 定位）。
 * `excludeVisitId`：冻结的当前 visit ID；它在 closed 中也可能出现（生成结算期间离场），
 * 必须从过去候选排除，防止同一 visit 同时出现在过去块与本次块。
 */
function buildCharacterBlock(
  characterId: string,
  displayName: string,
  memory: Record<string, unknown>,
  excludeVisitId: string | null,
): CharacterBlockParts {
  const activeVisit = isRecord(memory.active_visit) ? memory.active_visit : null;
  const closedVisits = Array.isArray(memory.closed_visits)
    ? memory.closed_visits.filter(isRecord)
    : [];
  const legacy = asTurns(memory.legacy_memories);
  const relationships = asRelationships(memory.relationship_memories);
  const header = `【角色：${displayName}（${characterId}）】`;

  const relationshipLines: string[] = [];
  const sortedRelationships = relationships
    .map((rel, index) => ({ rel, index }))
    .sort((a, b) => {
      const ka = relationshipSortKey(a.rel, a.index);
      const kb = relationshipSortKey(b.rel, b.index);
      for (let i = 0; i < ka.length; i += 1) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i];
      }
      return 0;
    })
    .slice(0, RELATIONSHIP_MAX_ITEMS)
    .map(({ rel }) => rel);
  for (const rel of sortedRelationships) {
    if (rel.kind === 'relationship_state' && rel.active) {
      const label = rel.relationship_label ?? '未知';
      relationshipLines.push(`当前明确关系：${label}`);
    } else {
      relationshipLines.push(relationshipLine(rel));
    }
  }

  // 过去入场：排除冻结的当前 visit（按 visit_id 精确排除），选最近 2 次，显示旧到新
  const pastCandidates = closedVisits
    .filter((visit) => visit.visit_id !== excludeVisitId)
    .map((visit, index) => ({ visit, index }))
    .sort((a, b) => {
      const ka = pastVisitSortKey(a.visit, a.index);
      const kb = pastVisitSortKey(b.visit, b.index);
      for (let i = 0; i < ka.length; i += 1) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i];
      }
      return 0;
    });
  const pastVisitBlocks: string[] = [];
  for (const { visit } of pastCandidates.slice(-PAST_VISIT_MAX_COUNT)) {
    const turns = asTurns(visit.turns)
      .map((turn, index) => ({ turn, index }))
      .sort((a, b) => {
        const ka = turnSortKey(a.turn, a.index);
        const kb = turnSortKey(b.turn, b.index);
        for (let i = 0; i < ka.length; i += 1) {
          if (ka[i] !== kb[i]) return ka[i] - kb[i];
        }
        return 0;
      })
      .map(({ turn }) => turn)
      .slice(-PAST_VISIT_MAX_TURNS);
    if (!turns.length) continue;
    const startDay = visit.started_day == null ? '时间未记录' : `第${visit.started_day}日`;
    const blockLines = [
      '【过去入场：只能作背景，不得续接现场】',
      PAST_BOUNDARY_LINE,
      ...turns.map((turn) => `- ${turnTime(turn)}：${String(turn.summary ?? '').trim()}`),
    ];
    // 起始日附在标题行（若可确定）
    blockLines[0] = `${blockLines[0]}（${startDay} 起）`;
    pastVisitBlocks.push(blockLines.join('\n'));
  }

  // 旧版遗留记忆：只投影该角色自己的
  const legacyLines: string[] = [];
  for (const item of legacy) {
    const text = String(item.text ?? item.summary ?? '').trim();
    if (!text) continue;
    legacyLines.push(`- ${NO_TIME}：${text}`);
  }

  return { header, relationshipLines, pastVisitBlocks, currentLines: [], legacyLines };
}

/** 把角色块各部分拼成单块文本（未裁剪）。 */
function renderCharacterBlock(parts: CharacterBlockParts): string {
  const sections: string[] = [parts.header];
  if (parts.relationshipLines.length) sections.push(`【当前关系】\n${parts.relationshipLines.join('\n')}`);
  if (parts.pastVisitBlocks.length) sections.push(parts.pastVisitBlocks.join('\n'));
  if (parts.currentLines.length) sections.push(`【本次入场：可维持当前连续性】\n${CURRENT_CONTINUITY_LINE}\n${parts.currentLines.join('\n')}`);
  if (parts.legacyLines.length) sections.push(`【旧版遗留记忆：时间不明】\n${LEGACY_BOUNDARY_LINE}\n${parts.legacyLines.join('\n')}`);
  return sections.join('\n\n');
}

/**
 * 预算裁剪（§3.6）：先删 legacy → 更早过去 visit → 最近过去 visit → 关系依据 →
 * 当前 visit 尾部 turns；边界文本与 active state/boundary/conflict 最后才删。
 * 实现为对 parts 的重组重渲染，保证裁剪后仍是结构完整文本。
 */
function trimCharacterBlockToBudget(parts: CharacterBlockParts, budget: number): string {
  let current = renderCharacterBlock(parts);
  if (current.length <= budget) return current;

  // 从“最先删除”到“最不应删除”的削减阶梯
  const trimmed = {
    ...parts,
    legacyLines: [] as string[],
    pastVisitBlocks: [] as string[],
    relationshipLines: [] as string[],
    currentLines: [] as string[],
  };

  // 阶段 1：删 legacy
  current = renderCharacterBlock({ ...trimmed });
  if (current.length > budget) {
    // 阶段 2：删更早过去 visit（保留最近 1 次）
    trimmed.pastVisitBlocks = parts.pastVisitBlocks.slice(-1);
    current = renderCharacterBlock({ ...trimmed });
  }
  if (current.length > budget) {
    // 阶段 3：删最近过去 visit
    trimmed.pastVisitBlocks = [];
    current = renderCharacterBlock({ ...trimmed });
  }
  if (current.length > budget) {
    // 阶段 4：关系依据只保留 active state / boundary / conflict
    const keep = parts.relationshipLines.filter((line) => line.startsWith('当前明确关系：') || line.includes('边界') || line.includes('冲突'));
    trimmed.relationshipLines = keep;
    current = renderCharacterBlock({ ...trimmed });
  }
  if (current.length > budget) {
    // 阶段 5：当前 visit 只保留尾部 3 条
    trimmed.currentLines = parts.currentLines.slice(-3);
    current = renderCharacterBlock({ ...trimmed });
  }
  if (current.length > budget) {
    // 阶段 6：只剩角色头与当前关系边界句；若仍超，返回角色头（保证非空）
    current = parts.header;
  }
  return current;
}

/**
 * 纯投影器：从版本化每角色记忆确定性拼装恰好一条 system 合成历史。
 * - 角色块按冻结 relevantCharacterIds 顺序；
 * - 当前 visit 精确按冻结 visit ID 定位（不因后来重入改投新 visit）；
 * - 关系记忆只读，不修改 active；
 * - legacy_unassigned 永不投影；
 * - 每角色 ≤900、全部 ≤2800（字符）；无内容返回固定边界消息；
 * - 返回新对象，不污染 state。
 */
export function buildSyntheticHistory(input: SyntheticHistoryInput): SyntheticHistoryResult {
  const byCharacter = visitMemoryOf(input.state);
  const blocks: string[] = [];
  const characters: string[] = [];

  for (const characterId of input.relevantCharacterIds) {
    const memory = byCharacter ? characterMemoryOf(input.state, characterId) : null;
    const displayName = input.characterNames?.[characterId] ?? characterId;
    if (!memory) continue;

    // 冻结的当前 visit ID：过去候选排除它；本次块精确按它定位
    const frozenVisitId = input.visitIdsByCharacter[characterId];
    const parts = buildCharacterBlock(characterId, displayName, memory, frozenVisitId);

    // 本次入场：精确按冻结 visit ID 找（active 或 closed 恰好一处）
    const currentLines: string[] = [];
    if (frozenVisitId != null) {
      let currentVisit: Record<string, unknown> | null = null;
      if (isRecord(memory.active_visit) && memory.active_visit.visit_id === frozenVisitId) {
        currentVisit = memory.active_visit;
      }
      if (!currentVisit) {
        for (const visit of Array.isArray(memory.closed_visits) ? memory.closed_visits : []) {
          if (isRecord(visit) && visit.visit_id === frozenVisitId) {
            currentVisit = visit;
            break;
          }
        }
      }
      if (currentVisit) {
        const turns = asTurns(currentVisit.turns)
          .map((turn, index) => ({ turn, index }))
          .sort((a, b) => {
            const ka = turnSortKey(a.turn, a.index);
            const kb = turnSortKey(b.turn, b.index);
            for (let i = 0; i < ka.length; i += 1) {
              if (ka[i] !== kb[i]) return ka[i] - kb[i];
            }
            return 0;
          })
          .map(({ turn }) => turn)
          .slice(-CURRENT_VISIT_MAX_TURNS);
        for (const turn of turns) {
          currentLines.push(`- ${turnTime(turn)}：${String(turn.summary ?? '').trim()}`);
        }
      }
    }

    const currentParts: CharacterBlockParts = {
      header: parts.header,
      relationshipLines: parts.relationshipLines,
      pastVisitBlocks: parts.pastVisitBlocks,
      currentLines,
      legacyLines: parts.legacyLines,
    };

    const block = trimCharacterBlockToBudget(currentParts, PER_CHARACTER_BUDGET);
    if (!block.trim() || block === parts.header) continue;
    blocks.push(block);
    characters.push(characterId);
  }

  let content = blocks.join('\n\n');
  if (!content.trim()) {
    content = HISTORY_BOUNDARY_MESSAGE;
  } else if (content.length > TOTAL_BUDGET) {
    // 全局预算：从末尾（优先删更早/legacy 多的角色）向前裁，保持每角色块完整
    const kept: string[] = [];
    let total = 0;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const block = blocks[i];
      if (total + block.length <= TOTAL_BUDGET) {
        kept.unshift(block);
        total += block.length;
      }
    }
    content = kept.join('\n\n');
    if (!content.trim()) content = HISTORY_BOUNDARY_MESSAGE;
  }

  return { history: [{ role: 'system', content }], content, characters };
}
