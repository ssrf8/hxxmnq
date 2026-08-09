// 第二批 B2-T05 —— VisitTurn 确定性构造器（visit-turn-commit）。
//
// 职责边界（runbook §3.7）：
//   - 从已接受的回复构造每角色最多一条、可复算、无模型自由裁定的 VisitTurn；
//   - 只放纯函数：不写 state、不接 bridge、不写楼层、不读现实时间；
//   - 输入必须显式包含 request、attempt、assistant 身份、最终游戏时间、accepted raw output；
//   - 摘要由 accepted response 确定性生成，不调用摘要模型。
// 禁止：解析 UpdateVariable 作为剧情摘要；创建 RelationshipMemory；扫描正文角色名猜参与者。

import { cleanNarrativeText, stripCotLeakage } from './gal-scene';
import type { GardenState, VisitTurn } from './types';

const GARDEN_BODY_START = /[【\[]\s*庭园正文开始\s*[】\]]/gu;
const GARDEN_BODY_END = /[【\[]\s*庭园正文结束\s*[】\]]/u;
const DIALOGUE_PATTERN = /<dialogue\b([^>]*)>([\s\S]*?)<\/dialogue\s*>/giu;
const UPDATE_PATTERN = /<UpdateVariable>[\s\S]*?<\/UpdateVariable>/giu;
const PRESENCE_PATTERN = /<GensokyoPresence>[\s\S]*?<\/GensokyoPresence>/giu;
const SCENE_PATTERN = /<GensokyoScene\b[^>]*>([\s\S]*?)<\/GensokyoScene>/giu;
const HTML_TAG_PATTERN = /<[^>]+>/gu;

/** 新 VisitTurn 摘要目标：足够召回，但不把整段正文重新塞回状态。 */
export const TURN_SUMMARY_MIN_CHARS = 80;
export const TURN_SUMMARY_CHARS = 100;
export const TURN_PLAYER_PART_CHARS = 36;
export const TURN_ROLE_PART_CHARS = 48;

export interface VisitTurnCommitRequestRef {
  requestId: string;
  sceneId: string | null;
  relevantCharacterIds: readonly string[];
  visitIdsByCharacter: Record<string, string | null>;
  visibleUserText: string;
}

export interface VisitTurnCommitAttemptRef {
  attemptId: string;
  commitKey: string;
  assistantMessageId: number | null;
  assistantSwipeId: number | null;
}

export interface VisitTurnCommitClockRef {
  day: number | string | null;
  time_period: string | null;
  period_serial: number | null;
}

export interface VisitTurnCommitInput {
  request: VisitTurnCommitRequestRef;
  attempt: VisitTurnCommitAttemptRef;
  /** 最终游戏时间（来自 state，不用现实时间猜）。 */
  clock: VisitTurnCommitClockRef;
  /** 已接受的 assistant 原始输出（含协议标签，构造器负责清洗）。 */
  acceptedOutput: string;
  /** 角色显示名（用于摘要 "角色名：" 前缀；缺省回退 characterId）。 */
  characterNames?: Record<string, string>;
}

export type VisitTurnCommitResult =
  | {
      ok: true;
      turns: VisitTurn[];
      diagnostics: {
        bodyPresent: boolean;
        bodyMalformed: boolean;
        dialogueCharacters: string[];
        charactersWithoutDialogue: string[];
        skippedCharacters: string[];
      };
    }
  | {
      ok: false;
      code: 'empty-output' | 'malformed-output';
      turns: [];
      diagnostics: {
        bodyPresent: boolean;
        bodyMalformed: boolean;
        dialogueCharacters: string[];
        charactersWithoutDialogue: string[];
        skippedCharacters: string[];
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function attribute(value: string, name: string) {
  const match = value.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'iu'));
  return match?.[1] ?? '';
}

function extractGardenBody(value: string): { present: boolean; malformed: boolean; body: string } {
  const source = String(value ?? '')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&amp;/giu, '&')
    .replace(/\u200b/gu, '');
  const starts = [...source.matchAll(GARDEN_BODY_START)];
  if (!starts.length) return { present: false, malformed: false, body: '' };
  const start = starts.at(-1)!;
  const bodyStart = (start.index ?? 0) + start[0].length;
  const tail = source.slice(bodyStart);
  const end = tail.match(GARDEN_BODY_END);
  if (!end) return { present: true, malformed: true, body: '' };
  return { present: true, malformed: false, body: stripCotLeakage(tail.slice(0, end.index)) };
}

/** 从正文块提取每个角色的可见台词（属性顺序无关；多条按出现顺序合并）。 */
function extractDialogueByCharacter(body: string): Map<string, string> {
  const byCharacter = new Map<string, string>();
  for (const match of body.matchAll(DIALOGUE_PATTERN)) {
    const attributes = match[1] ?? '';
    const characterId = attribute(attributes, 'char');
    if (!characterId) continue;
    const text = String(match[2] ?? '')
      .replace(HTML_TAG_PATTERN, '')
      .replace(/\s+/gu, ' ')
      .trim();
    if (!text) continue;
    byCharacter.set(characterId, [byCharacter.get(characterId), text].filter(Boolean).join('；'));
  }
  return byCharacter;
}

/** 统一空白、去协议/状态标签后的可见正文摘要（供无台词角色兜底）。 */
function cleanVisibleSummary(raw: string, body: string): string {
  const bodyCleaned = cleanNarrativeText(body);
  const fallback = cleanNarrativeText(raw);
  const best = (bodyCleaned || fallback)
    .replace(PRESENCE_PATTERN, '')
    .replace(SCENE_PATTERN, '')
    .replace(UPDATE_PATTERN, '')
    .replace(HTML_TAG_PATTERN, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return best;
}

function truncate(value: string, maximum: number): string {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, maximum);
}

function buildRecallSummary(input: VisitTurnCommitInput, displayName: string, line: string | undefined, body: string) {
  const player = truncate(input.request.visibleUserText, TURN_PLAYER_PART_CHARS) || '未记录明确发言';
  const clock = [input.clock.day == null ? '' : `第${input.clock.day}日`, input.clock.time_period ?? '']
    .filter(Boolean)
    .join('·');
  const parts = [
    `${clock ? `${clock}，` : ''}玩家行动：${player}`,
    line
      ? `${displayName}回应：${truncate(line, TURN_ROLE_PART_CHARS)}`
      : `现场经过：${truncate(body, TURN_ROLE_PART_CHARS) || '未记录更多可见经过'}`,
  ];
  if (line && body) parts.push(`现场经过：${truncate(body, TURN_ROLE_PART_CHARS)}`);
  let summary = parts.join('；');
  if (summary.length < TURN_SUMMARY_MIN_CHARS) {
    summary += '；只把上述行动、现场经过和角色明确回应作为后续回忆依据，不额外推断未发生的关系变化、道具得失、任务结果或隐藏动机。';
  }
  return truncate(summary, TURN_SUMMARY_CHARS);
}

/**
 * 从已接受的回复构造每角色最多一条 VisitTurn（纯函数，可复算）。
 * - 只处理 request 冻结的 relevantCharacterIds 且 visit ID 非 null 的角色；
 * - 有台词：`玩家：{输入}；{角色名}：{台词摘要}`；无台词（主目标/显式参与者）：`玩家：{输入}；本轮：{正文摘要}`；
 * - turn_id 严格等于 `requestId:characterId`；
 * - 空/空白输出、正文缺失或 malformed、无合格角色：返回空 turns 与明确错误，不写 turn。
 */
export function buildVisitTurnCommit(input: VisitTurnCommitInput): VisitTurnCommitResult {
  const raw = String(input.acceptedOutput ?? '');
  const diagnostics = {
    bodyPresent: false,
    bodyMalformed: false,
    dialogueCharacters: [] as string[],
    charactersWithoutDialogue: [] as string[],
    skippedCharacters: [] as string[],
  };
  const empty = (code: 'empty-output' | 'malformed-output'): VisitTurnCommitResult => ({
    ok: false,
    code,
    turns: [],
    diagnostics,
  });

  if (!raw.trim()) return empty('empty-output');

  const section = extractGardenBody(raw);
  diagnostics.bodyPresent = section.present;
  diagnostics.bodyMalformed = section.malformed;
  if (section.present && section.malformed) return empty('malformed-output');
  if (!section.present) return empty('malformed-output');
  if (!section.body.trim()) return empty('empty-output');

  const dialogue = extractDialogueByCharacter(section.body);
  diagnostics.dialogueCharacters = [...dialogue.keys()];

  const eligible = input.request.relevantCharacterIds.filter((id) => (
    input.request.visitIdsByCharacter[id] != null
  ));
  // R0 裁定：空相关角色/无 eligible visit 是“本轮无可提交 turn”的正常结果，
  // 不是生成失败；返回 ok:true + 空 turns，供 T10 settlement 无记忆提交路径使用。
  if (eligible.length === 0) return { ok: true, turns: [], diagnostics };

  const names = input.characterNames ?? {};
  const bodySummary = truncate(cleanVisibleSummary(raw, section.body), TURN_ROLE_PART_CHARS);

  const turns: VisitTurn[] = [];
  const withoutDialogue: string[] = [];
  const skipped: string[] = [];
  for (const characterId of eligible) {
    const line = dialogue.get(characterId);
    const displayName = names[characterId] ?? characterId;
    if (line) {
      turns.push(makeTurn(input, characterId, buildRecallSummary(input, displayName, line, bodySummary)));
    } else {
      // 无台词但属主目标/显式参与者：用清洗后的可见正文兜底
      withoutDialogue.push(characterId);
      turns.push(makeTurn(input, characterId, buildRecallSummary(input, displayName, undefined, bodySummary)));
    }
  }
  // 记录被跳过（有台词但不相关）的角色：不在 turns 中，仅诊断
  for (const characterId of dialogue.keys()) {
    if (!input.request.relevantCharacterIds.includes(characterId)) skipped.push(characterId);
  }
  diagnostics.charactersWithoutDialogue = withoutDialogue;
  diagnostics.skippedCharacters = skipped;

  // eligible 存在但最终无 turn（防御性兜底）：同样按“无可提交”正常结果处理。
  if (turns.length === 0) return { ok: true, turns: [], diagnostics };
  return { ok: true, turns, diagnostics };
}

function makeTurn(
  input: VisitTurnCommitInput,
  characterId: string,
  summary: string,
): VisitTurn {
  return {
    turn_id: `${input.request.requestId}:${characterId}`,
    character_id: characterId,
    day: input.clock.day,
    time_period: input.clock.time_period,
    summary: truncate(summary, TURN_SUMMARY_CHARS),
  };
}

/** 便捷构造：从 V2 request 与 attempt 映射构造 commit 输入引用（纯函数，不读宿主）。 */
export function visitTurnCommitRefs(
  request: {
    requestId: string;
    sceneId: string | null;
    relevantCharacterIds: readonly string[];
    visitIdsByCharacter: Record<string, string | null>;
    visibleUserText: string;
  },
  attempt: {
    attemptId: string;
    commitKey: string;
    assistantMessageId: number | null;
    assistantSwipeId: number | null;
  },
): { request: VisitTurnCommitRequestRef; attempt: VisitTurnCommitAttemptRef } {
  return {
    request: {
      requestId: request.requestId,
      sceneId: request.sceneId,
      relevantCharacterIds: request.relevantCharacterIds,
      visitIdsByCharacter: request.visitIdsByCharacter,
      visibleUserText: request.visibleUserText,
    },
    attempt: {
      attemptId: attempt.attemptId,
      commitKey: attempt.commitKey,
      assistantMessageId: attempt.assistantMessageId,
      assistantSwipeId: attempt.assistantSwipeId,
    },
  };
}

// ---------------------------------------------------------------------------
// B2-T10：把冻结请求的 VisitTurn 精确写入最终结算 state（纯函数）。
// 合同（runbook §3.7 / 冻结顺序 5-8）：
//   - 只用 request 冻结的 visitIdsByCharacter（不用 settlement 后 active visit 猜目标）；
//   - visitId 为 null 的角色由构造器跳过（不伪造 visit）；
//   - buildVisitTurnCommit 失败（empty/malformed）或 upsert not-found/conflict 时抛错，
//     调用方（bridge settlement）保留 pending，不写邻近楼层、不标 settled；
//   - 同 turn_id retry/recovery 由 upsert 覆盖审计字段，不追加重复记录。
// 禁止：直接调 host/MVU；读现实时间；按“最后一层 assistant”模糊定位。
// ---------------------------------------------------------------------------

import { upsertVisitTurnByVisitId } from './character-memory';

export interface VisitTurnCommitFinalStateInput {
  /** 最终结算 GardenState（已含本地 settlement 结果，未含 turn）。 */
  finalState: GardenState;
  request: VisitTurnCommitRequestRef;
  attempt: VisitTurnCommitAttemptRef;
  clock: VisitTurnCommitClockRef;
  /** 已接受的 assistant 原始输出（含协议标签，构造器负责清洗）。 */
  acceptedOutput: string;
  characterNames?: Record<string, string>;
}

export type VisitTurnCommitFinalStateResult =
  | { ok: true; state: GardenState; turns: VisitTurn[] }
  | { ok: false; code: 'empty-output' | 'malformed-output' | 'not-found' | 'conflict'; state: GardenState };

export type VisitTurnVerificationResult =
  | { ok: true }
  | {
      ok: false;
      code: 'unexpected-turn' | 'missing-visit' | 'duplicate-visit' | 'missing-turn' | 'duplicate-turn' | 'turn-mismatch';
      characterId?: string;
      turnId?: string;
    };

const visitTurnFields: ReadonlyArray<keyof VisitTurn> = [
  'turn_id',
  'character_id',
  'day',
  'time_period',
  'summary',
];

function allVisitRecords(state: GardenState) {
  const records: Array<{ characterId: string; visitId: string; turns: VisitTurn[] }> = [];
  const byCharacter = state.interaction?.visit_memory?.by_character ?? {};
  for (const [characterId, memory] of Object.entries(byCharacter)) {
    if (memory?.active_visit) {
      records.push({
        characterId,
        visitId: memory.active_visit.visit_id,
        turns: memory.active_visit.turns ?? [],
      });
    }
    for (const visit of memory?.closed_visits ?? []) {
      records.push({ characterId, visitId: visit.visit_id, turns: visit.turns ?? [] });
    }
  }
  return records;
}

/**
 * 精确验证本次提交的 VisitTurn：
 * - expected 为空是合法零 turn，但不得残留同 requestId 的意外 turn；
 * - 每条 expected 必须只出现在冻结 character+visit 中一次；
 * - 全部审计、时钟和摘要字段必须与本次确定性构造结果一致。
 */
export function verifyCommittedVisitTurns(
  state: GardenState,
  request: Pick<VisitTurnCommitRequestRef, 'requestId' | 'visitIdsByCharacter'>,
  expectedTurns: readonly VisitTurn[],
): VisitTurnVerificationResult {
  const visits = allVisitRecords(state);
  if (expectedTurns.length === 0) {
    const unexpected = visits
      .flatMap((visit) => visit.turns)
      .find((turn) => turn.turn_id.startsWith(`${request.requestId}:`));
    return unexpected
      ? { ok: false, code: 'unexpected-turn', characterId: unexpected.character_id, turnId: unexpected.turn_id }
      : { ok: true };
  }

  for (const expected of expectedTurns) {
    const visitId = request.visitIdsByCharacter[expected.character_id];
    const targetVisits = visits.filter((visit) => (
      visit.characterId === expected.character_id && visit.visitId === visitId
    ));
    if (targetVisits.length === 0) {
      return { ok: false, code: 'missing-visit', characterId: expected.character_id, turnId: expected.turn_id };
    }
    if (targetVisits.length > 1) {
      return { ok: false, code: 'duplicate-visit', characterId: expected.character_id, turnId: expected.turn_id };
    }
    const occurrences = visits.flatMap((visit) => visit.turns).filter((turn) => turn.turn_id === expected.turn_id);
    if (occurrences.length === 0) {
      return { ok: false, code: 'missing-turn', characterId: expected.character_id, turnId: expected.turn_id };
    }
    if (occurrences.length > 1) {
      return { ok: false, code: 'duplicate-turn', characterId: expected.character_id, turnId: expected.turn_id };
    }
    const actual = targetVisits[0].turns.find((turn) => turn.turn_id === expected.turn_id);
    if (!actual || visitTurnFields.some((field) => actual[field] !== expected[field])) {
      return { ok: false, code: 'turn-mismatch', characterId: expected.character_id, turnId: expected.turn_id };
    }
  }
  return { ok: true };
}

/** 恢复分析只需要的精确审计引用验证；合法零 eligible visit 返回 true。 */
export function verifyVisitTurnAuditRefs(
  state: GardenState,
  request: Pick<VisitTurnCommitRequestRef, 'requestId' | 'relevantCharacterIds' | 'visitIdsByCharacter'>,
  _attempt: Pick<VisitTurnCommitAttemptRef, 'attemptId' | 'commitKey' | 'assistantMessageId' | 'assistantSwipeId'>,
): boolean {
  const expectedCharacters = request.relevantCharacterIds.filter((characterId) => (
    request.visitIdsByCharacter[characterId] != null
  ));
  if (expectedCharacters.length === 0) return true;
  const visits = allVisitRecords(state);
  return expectedCharacters.every((characterId) => {
    const visitId = request.visitIdsByCharacter[characterId];
    const expectedTurnId = `${request.requestId}:${characterId}`;
    const targetVisits = visits.filter((visit) => visit.characterId === characterId && visit.visitId === visitId);
    const occurrences = visits.flatMap((visit) => visit.turns).filter((turn) => turn.turn_id === expectedTurnId);
    if (targetVisits.length !== 1 || occurrences.length !== 1) return false;
    const turn = targetVisits[0].turns.find((entry) => entry.turn_id === expectedTurnId);
    return Boolean(turn && turn.character_id === characterId);
  });
}

/**
 * 构造 VisitTurn 并按冻结 visit map 精确 upsert 到最终 state。
 * 失败返回原 state 引用（未变）；成功返回新 state（含 turns）。
 * 纯函数：不写宿主、不读现实时间。
 */
export function applyVisitTurnsToFinalState(
  input: VisitTurnCommitFinalStateInput,
): VisitTurnCommitFinalStateResult {
  const built = buildVisitTurnCommit(input);
  if (!built.ok) return { ok: false, code: built.code, state: input.finalState };
  let next = input.finalState;
  for (const turn of built.turns) {
    const visitId = input.request.visitIdsByCharacter[turn.character_id];
    if (visitId == null) continue; // R0：null visit 只跳过该角色，不伪造
    const result = upsertVisitTurnByVisitId(next, turn.character_id, visitId, turn);
    if (!result.ok) return { ok: false, code: result.code, state: next };
    next = result.state;
  }
  return { ok: true, state: next, turns: built.turns };
}
