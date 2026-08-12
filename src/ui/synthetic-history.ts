// 第二批 B2-T06 —— 合成历史投影器（synthetic-history）。
//
// 职责边界（runbook §3.5–3.6）：
//   - 纯投影器，不可能接触真实楼层：签名只接收 GardenState、冻结 relevant IDs、
//     冻结 visit map、角色登记信息；绝不接收 chat messages / SillyTavern context / 宿主 getter；
//   - 输出恰好一条 system 消息；无任何可投影内容时返回固定边界消息；
//   - 真实楼层是状态承载，不等于模型历史（database-rolecards floor/UI binding）。
// 禁止：把过去摘要伪装成 assistant 原话；用现实日期猜游戏内昨天/今天；
//       按正文角色名猜参与者；legacy_unassigned 投影给错误角色。

import type { GardenState, VisitTurn } from './types';

export const SYNTHETIC_HISTORY_REVISION = 'gal-synthetic-history.v1';
export const HISTORY_BOUNDARY_MESSAGE = '【历史边界】本请求不读取 SillyTavern 真实聊天楼层；当前没有可投影的角色入场记忆。';
/** 过去块边界句：禁止模型把旧入场当作当前现场续接。 */
export const PAST_BOUNDARY_LINE = '不可续接旧地点、姿势、动作进行态、未完台词或即时意图；当前在场状态与本轮场景事实优先。';
/** 本次块提示句。 */
export const CURRENT_CONTINUITY_LINE = '以下属于角色当前这次在场，可用于维持本次场景连续性；当前在场状态与本轮场景事实优先。';
export const CURRENT_OTHER_SCENE_LINE = '以下发生在角色本次入场的其他场景，只能作为已发生的背景；不得续接旧地点、动作进行态或未完台词。';
/** 旧版遗留记忆提示句。 */
export const LEGACY_BOUNDARY_LINE = '没有可靠入场和时间，只能作为模糊长期记忆，不得视为当前场景。';

export interface SyntheticHistoryInput {
  /** 只读状态；投影器不修改它。 */
  state: GardenState;
  /** 请求时冻结的相关角色（稳定顺序、已去重）。 */
  relevantCharacterIds: readonly string[];
  /** 请求时冻结的 visit map（characterId → visit_id | null）。 */
  visitIdsByCharacter: Record<string, string | null>;
  /** 角色登记信息：characterId → 显示名（缺省回退 characterId）。 */
  characterNames?: Record<string, string>;
  /** 当前请求的场景边界；提供后，只有同 scene_id 的回合可作为即时连续性。 */
  sceneId?: string | null;
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

/** 时间稳定比较：null 排后；period_serial 优先，其次 day，最后 index。 */
function turnSortKey(turn: VisitTurn, index: number) {
  const serial = typeof turn.period_serial === 'number' ? turn.period_serial : -1;
  const day = turn.day == null ? -1 : Number(turn.day);
  return [serial, day, index];
}

interface CharacterBlockParts {
  header: string;
  pastVisitBlocks: string[]; // 每块已含标题与边界句；内部旧到新
  currentLines: string[];
  currentOtherSceneLines: string[];
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
  const header = `【角色：${displayName}（${characterId}）】`;

  // 过去入场：排除冻结的当前 visit（按 visit_id 精确排除），其余全部按旧到新显示
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
  for (const { visit } of pastCandidates) {
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
      .map(({ turn }) => turn);
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

  return { header, pastVisitBlocks, currentLines: [], currentOtherSceneLines: [], legacyLines };
}

/** 把角色块各部分拼成单块文本（未裁剪）。 */
function renderCharacterBlock(parts: CharacterBlockParts): string {
  const sections: string[] = [parts.header];
  if (parts.pastVisitBlocks.length) sections.push(parts.pastVisitBlocks.join('\n'));
  if (parts.currentOtherSceneLines.length) sections.push(`【本次入场：其他场景背景】\n${CURRENT_OTHER_SCENE_LINE}\n${parts.currentOtherSceneLines.join('\n')}`);
  if (parts.currentLines.length) sections.push(`【本次入场：可维持当前连续性】\n${CURRENT_CONTINUITY_LINE}\n${parts.currentLines.join('\n')}`);
  if (parts.legacyLines.length) sections.push(`【旧版遗留记忆：时间不明】\n${LEGACY_BOUNDARY_LINE}\n${parts.legacyLines.join('\n')}`);
  return sections.join('\n\n');
}

/**
 * 纯投影器：从版本化每角色记忆确定性拼装恰好一条 system 合成历史。
 * - 角色块按冻结 relevantCharacterIds 顺序；
 * - 当前 visit 精确按冻结 visit ID 定位（不因后来重入改投新 visit）；
 * - legacy_unassigned 永不投影；
 * - 相关角色的当前、过去与 legacy 记忆全部投影，不做条数或字符预算裁剪；
 * - 无内容返回固定边界消息；
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
    const currentOtherSceneLines: string[] = [];
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
          .map(({ turn }) => turn);
        for (const turn of turns) {
          const line = `- ${turnTime(turn)}：${String(turn.summary ?? '').trim()}`;
          if (input.sceneId != null && turn.scene_id !== input.sceneId) currentOtherSceneLines.push(line);
          else currentLines.push(line);
        }
      }
    }

    const currentParts: CharacterBlockParts = {
      header: parts.header,
      pastVisitBlocks: parts.pastVisitBlocks,
      currentLines,
      currentOtherSceneLines,
      legacyLines: parts.legacyLines,
    };

    const block = renderCharacterBlock(currentParts);
    if (!block.trim() || block === parts.header) continue;
    blocks.push(block);
    characters.push(characterId);
  }

  const content = blocks.join('\n\n') || HISTORY_BOUNDARY_MESSAGE;

  return { history: [{ role: 'system', content }], content, characters };
}
