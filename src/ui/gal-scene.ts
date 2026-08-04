import type {
  ChatMessageView,
  GalBeat,
  GalBeatKind,
  GalReaction,
  GalSexualAct,
  GalSceneProjection,
  GalVisualMode,
  GardenState,
  SuggestedReply,
} from './types';
import { normalizeGalPortraitCue } from './gal-portrait-registry';

const SCENE_PATTERN = /<GensokyoScene\b[^>]*>([\s\S]*?)<\/GensokyoScene>/iu;
const UPDATE_PATTERN = /<UpdateVariable>[\s\S]*?<\/UpdateVariable>/giu;
const EVENT_RESULT_PATTERN = /<GensokyoEventResult>[\s\S]*?<\/GensokyoEventResult>/giu;
const GARDEN_BODY_START = /[【\[]\s*庭园正文开始\s*[】\]]/gu;
const GARDEN_BODY_END = /[【\[]\s*庭园正文结束\s*[】\]]/u;
// LLM 自指纠错 CoT 泄漏：如“（注意：这句话是我说的…）修正：”。带“修正：”重写段时整体剥离，
// 只带“（注意/思考/纠错：…）”时剥离括号段本身；两者都要求括号内含自指信号词
// （应该/这句话/标签/规则/协议等），避免误伤正文台词里的“（注意：…）”陈述。
const COT_LEAK_PATTERN = /（\s*(?:注意|思考|纠错|提醒)[^）]*?(?:应该|不应该|不能|不要|必须|这句话|标签|规则|协议|规定|所以|修正)[^）]*）\s*修正：\s*(?=<narration\b|<dialogue\b|$)/giu;
const COT_LEAK_NOTE_ONLY_PATTERN = /（\s*(?:注意|思考|纠错|提醒)[^）]*?(?:应该|不应该|不能|不要|必须|这句话|标签|规则|协议|规定|所以|修正)[^）]*）(?:\s*修正：)?/giu;
const ALLOWED_KINDS = new Set<GalBeatKind>(['narration', 'speech', 'action']);
const ALLOWED_VISUAL_MODES = new Set<GalVisualMode>(['normal', 'nude', 'sexual']);
const ALLOWED_SEXUAL_ACTS = new Set<GalSexualAct>(['vaginal', 'anal', 'none']);
const ALLOWED_REACTIONS = new Set<GalReaction>([
  'neutral',
  'smile',
  'annoyed',
  'surprised',
  'serious',
  'shy',
  'sad',
  'angry',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compactText(value: unknown, maxLength: number) {
  return String(value ?? '').replace(/\r\n?/gu, '\n').trim().slice(0, maxLength);
}

function normalizeBeat(value: unknown, knownCharacters: Set<string>): GalBeat | null {
  if (!isRecord(value)) return null;
  const text = compactText(value.text, 1800);
  if (!text) return null;
  const kind = ALLOWED_KINDS.has(value.kind as GalBeatKind)
    ? value.kind as GalBeatKind
    : 'narration';
  const requestedSpeaker = compactText(value.speaker_id, 48);
  const speakerId = requestedSpeaker && knownCharacters.has(requestedSpeaker)
    ? requestedSpeaker
    : null;
  const visualMode = ALLOWED_VISUAL_MODES.has(value.visual_mode as GalVisualMode)
    ? value.visual_mode as GalVisualMode
    : 'normal';
  const reactionId = ALLOWED_REACTIONS.has(value.reaction_id as GalReaction)
    ? value.reaction_id as GalReaction
    : 'neutral';
  const requestedPoseId = String(value.pose_id ?? '');
  const poseId = visualMode === 'sexual' && /^[a-z0-9_-]{1,40}$/iu.test(requestedPoseId)
    ? requestedPoseId
    : 'default';
  const requestedActId = String(value.act_id ?? 'none');
  const actId = visualMode === 'sexual' && ALLOWED_SEXUAL_ACTS.has(requestedActId as GalSexualAct)
    ? requestedActId as GalSexualAct
    : 'none';
  const portraitCue = normalizeGalPortraitCue(speakerId, {
    visualMode,
    reactionId,
    poseId,
    actId,
  });
  return { kind, speakerId, ...portraitCue, text };
}

function normalizeReply(value: unknown, index: number): SuggestedReply | null {
  if (!isRecord(value)) return null;
  const label = compactText(value.label, 80);
  const intent = compactText(value.intent, 1000)
    || compactText(value.thought, 1000)
    || label;
  if (!label || !intent) return null;
  const rawId = compactText(value.id, 48) || compactText(value.action_id, 48);
  const id = /^[a-z0-9_-]{1,48}$/iu.test(rawId) ? rawId : ('reply-' + (index + 1));
  return { id, label, intent };
}

function gardenBodySection(value: string) {
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

/** 剥离 LLM 自指纠错 CoT 泄漏，防止“（注意：…）修正：”等思考痕迹混入玩家可见正文。 */
export function stripCotLeakage(value: string) {
  return String(value ?? '')
    .replace(COT_LEAK_PATTERN, '')
    .replace(COT_LEAK_NOTE_ONLY_PATTERN, '');
}

function attribute(value: string, name: string) {
  const match = value.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'iu'));
  return match?.[1] ?? '';
}

function gardenProtocolBeats(value: string, knownCharacters: Set<string>) {
  const section = gardenBodySection(value);
  if (!section.present || section.malformed) return { ...section, beats: [] as GalBeat[] };
  const beats: GalBeat[] = [];
  const pattern = /<(narration|dialogue)\b([^>]*)>([\s\S]*?)<\/\1\s*>/giu;
  for (const match of section.body.matchAll(pattern)) {
    const tag = match[1].toLowerCase();
    const attributes = match[2] ?? '';
    const text = compactText(String(match[3] ?? '').replace(/<[^>]+>/gu, ''), 1800);
    if (!text) continue;
    const beat = normalizeBeat({
      kind: tag === 'dialogue' ? 'speech' : 'narration',
      speaker_id: tag === 'dialogue' ? attribute(attributes, 'char') : null,
      visual_mode: tag === 'dialogue' ? attribute(attributes, 'visual_mode') || 'normal' : 'normal',
      reaction_id: attribute(attributes, 'reaction') || 'neutral',
      pose_id: attribute(attributes, 'pose') || 'default',
      act_id: attribute(attributes, 'act') || 'none',
      text,
    }, knownCharacters);
    if (beat) beats.push(beat);
  }
  return { ...section, beats: beats.slice(0, 24) };
}

function stripNarrativeNoise(text: string) {
  return stripCotLeakage(String(text ?? ''))
    .replace(SCENE_PATTERN, '')
    .replace(UPDATE_PATTERN, '')
    .replace(EVENT_RESULT_PATTERN, '')
    .replace(/<JSONPatch>[\s\S]*?<\/JSONPatch>/giu, '')
    .replace(/<draft>[\s\S]*?<\/draft>/giu, '')
    .replace(/<draft_notes>[\s\S]*?<\/draft_notes>/giu, '')
    .replace(/<w2g>[\s\S]*?<\/w2g>/giu, '')
    .replace(/<catsay>[\s\S]*?<\/catsay>/giu, '')
    .replace(/<details>[\s\S]*?<\/details>/giu, '')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<StatusPlaceHolderImpl\s*\/>/giu, '')
    .replace(/<\/?bginfor\b[^>]*>/giu, '')
    .replace(/<[^>]+>/gu, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

/**
 * LLM narrative lives in different places depending on prompt packs:
 * - often after `</bginfor>` and before `<GensokyoScene>`
 * - sometimes inside `<bginfor>` itself
 * Preferring a short bginfor meta block alone would drop 700+ chars of story.
 */
export function cleanNarrativeText(text: string) {
  const value = String(text ?? '');
  const afterBginfor = value.match(
    /<\/bginfor>\s*([\s\S]*?)(?=<GensokyoScene\b|<UpdateVariable\b|<w2g\b|<catsay\b|$)/iu,
  )?.[1] ?? '';
  const insideBginfor = value.match(
    /<bginfor\b[^>]*>([\s\S]*?)(?:<\/bginfor>|(?=<GensokyoScene\b|<UpdateVariable\b|<w2g\b|<catsay\b|$))/iu,
  )?.[1] ?? '';
  const candidates = [afterBginfor, insideBginfor, value]
    .map((item) => stripNarrativeNoise(item))
    .filter(Boolean);
  if (!candidates.length) return '';
  return candidates.reduce((best, item) => (item.length > best.length ? item : best));
}

function splitNarrativeChunks(cleaned: string): string[] {
  if (!cleaned) return [];
  const paragraphs = cleaned
    .split(/\n{2,}/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= 900) {
      chunks.push(paragraph);
      continue;
    }
    const sentences = paragraph
      .split(/(?<=[。！？!?…])\s*/u)
      .map((item) => item.trim())
      .filter(Boolean);
    let bucket = '';
    for (const sentence of sentences) {
      if (!bucket) {
        bucket = sentence;
        continue;
      }
      if ((bucket + sentence).length <= 900) {
        bucket += sentence;
      } else {
        chunks.push(bucket);
        bucket = sentence;
      }
    }
    if (bucket) chunks.push(bucket);
  }
  if (chunks.length <= 6) return chunks.map((item) => item.slice(0, 1800));
  const target = 6;
  const merged: string[] = [];
  const size = Math.ceil(chunks.length / target);
  for (let index = 0; index < chunks.length; index += size) {
    merged.push(chunks.slice(index, index + size).join('\n\n').slice(0, 1800));
  }
  return merged.slice(0, target);
}

function narrativeBeats(
  text: string,
  speakerId: string | null,
  visualMode: GalVisualMode = 'normal',
  reactionId: GalReaction = 'neutral',
  poseId = 'default',
  actId: GalSexualAct = 'none',
): GalBeat[] {
  const cleaned = cleanNarrativeText(text);
  const chunks = splitNarrativeChunks(cleaned);
  const values = chunks.length ? chunks : ['对方暂时没有给出可显示的回应。'];
  return values.map((chunk) => ({
    kind: 'narration' as const,
    speakerId,
    visualMode,
    reactionId,
    poseId,
    actId,
    text: chunk,
  }));
}

function beatTextLength(beats: GalBeat[]) {
  return beats.reduce((sum, beat) => sum + beat.text.length, 0);
}

export function projectGalScene(
  message: ChatMessageView,
  state: GardenState,
  fallbackSpeakerId: string | null,
): GalSceneProjection {
  const knownCharacters = new Set(Object.keys(state.characters ?? {}));
  const gardenProtocol = gardenProtocolBeats(message.text, knownCharacters);
  if (gardenProtocol.present) {
    return {
      version: 'garden.v1',
      beats: gardenProtocol.beats.length
        ? gardenProtocol.beats
        : [{
          kind: 'narration',
          speakerId: null,
          visualMode: 'normal',
          reactionId: 'neutral',
          poseId: 'default',
          actId: 'none',
          text: '这次回复没有提供可播放的庭园正文。',
        }],
      suggestedReplies: [],
      sourceMessageId: message.id,
      swipeId: message.swipeId ?? 0,
      malformed: gardenProtocol.malformed || !gardenProtocol.beats.length || undefined,
    };
  }
  let suggestedReplies: SuggestedReply[] = [];
  let sceneBeats: GalBeat[] = [];
  let malformed = false;
  let portraitSpeaker = fallbackSpeakerId;
  let visualMode: GalVisualMode = 'normal';
  let reactionId: GalReaction = 'neutral';
  let poseId = 'default';
  let actId: GalSexualAct = 'none';

  const sceneMatch = message.text.match(SCENE_PATTERN);
  if (sceneMatch) {
    try {
      const parsed = JSON.parse(sceneMatch[1]);
      if (!isRecord(parsed)) throw new Error('scene.v1 不是对象');
      sceneBeats = Array.isArray(parsed.beats)
        ? parsed.beats
          .map((value) => normalizeBeat(value, knownCharacters))
          .filter((value): value is GalBeat => Boolean(value))
          .slice(0, 6)
        : [];
      suggestedReplies = Array.isArray(parsed.suggested_replies)
        ? parsed.suggested_replies
          .map((value, index) => normalizeReply(value, index))
          .filter((value): value is SuggestedReply => Boolean(value))
          .slice(0, 4)
        : [];
      const speech = [...sceneBeats].reverse().find((beat) => beat.speakerId);
      if (speech) {
        portraitSpeaker = speech.speakerId;
        visualMode = speech.visualMode;
        reactionId = speech.reactionId;
        poseId = speech.poseId;
        actId = speech.actId;
      }
    } catch {
      malformed = true;
    }
  }

  // Prefer full LLM narrative body for player-facing pages. scene.v1 beats are short
  // performance hints and must not replace the readable story.
  const bodyBeats = narrativeBeats(message.text, portraitSpeaker, visualMode, reactionId, poseId, actId);
  const bodyChars = beatTextLength(bodyBeats);
  const sceneChars = beatTextLength(sceneBeats);
  const preferBody = bodyChars >= 80 && bodyChars >= Math.max(sceneChars * 1.15, sceneChars + 30);

  if (preferBody) {
    return {
      version: sceneBeats.length ? 'scene.v1+body' : 'body',
      beats: bodyBeats,
      suggestedReplies,
      sourceMessageId: message.id,
      swipeId: message.swipeId ?? 0,
      malformed: malformed || undefined,
    };
  }
  if (sceneBeats.length) {
    return {
      version: 'scene.v1',
      beats: sceneBeats,
      suggestedReplies,
      sourceMessageId: message.id,
      swipeId: message.swipeId ?? 0,
    };
  }
  return {
    version: malformed ? 'fallback' : 'body',
    beats: bodyBeats,
    suggestedReplies,
    sourceMessageId: message.id,
    swipeId: message.swipeId ?? 0,
    malformed: malformed || undefined,
  };
}
