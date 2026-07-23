import type {
  ChatMessageView,
  GalBeat,
  GalBeatKind,
  GalReaction,
  GalSceneProjection,
  GardenState,
  SuggestedReply,
} from './types';

const SCENE_PATTERN = /<GensokyoScene\b[^>]*>([\s\S]*?)<\/GensokyoScene>/iu;
const UPDATE_PATTERN = /<UpdateVariable>[\s\S]*?<\/UpdateVariable>/giu;
const ALLOWED_KINDS = new Set<GalBeatKind>(['narration', 'speech', 'action']);
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
  const reactionId = ALLOWED_REACTIONS.has(value.reaction_id as GalReaction)
    ? value.reaction_id as GalReaction
    : 'neutral';
  const poseId = /^[a-z0-9_-]{1,40}$/iu.test(String(value.pose_id ?? ''))
    ? String(value.pose_id)
    : 'default';
  return { kind, speakerId, reactionId, poseId, text };
}

function normalizeReply(value: unknown, index: number): SuggestedReply | null {
  if (!isRecord(value)) return null;
  const label = compactText(value.label, 80);
  const intent = compactText(value.intent, 1000);
  if (!label || !intent) return null;
  const rawId = compactText(value.id, 48);
  const id = /^[a-z0-9_-]{1,48}$/iu.test(rawId) ? rawId : `reply-${index + 1}`;
  return { id, label, intent };
}

export function cleanNarrativeText(text: string) {
  return text
    .replace(SCENE_PATTERN, '')
    .replace(UPDATE_PATTERN, '')
    .replace(/<JSONPatch>[\s\S]*?<\/JSONPatch>/giu, '')
    .trim();
}

function fallbackBeats(text: string, speakerId: string | null): GalBeat[] {
  const cleaned = cleanNarrativeText(text);
  const chunks = cleaned
    .split(/\n{2,}|(?<=[。！？!?])\s*\n/gu)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  const values = chunks.length ? chunks : ['对方暂时没有给出可显示的回应。'];
  return values.map((chunk) => ({
    kind: speakerId ? 'speech' : 'narration',
    speakerId,
    reactionId: 'neutral',
    poseId: 'default',
    text: chunk.slice(0, 1800),
  }));
}

export function projectGalScene(
  message: ChatMessageView,
  state: GardenState,
  fallbackSpeakerId: string | null,
): GalSceneProjection {
  const knownCharacters = new Set(Object.keys(state.characters ?? {}));
  const sceneMatch = message.text.match(SCENE_PATTERN);
  if (sceneMatch) {
    try {
      const parsed = JSON.parse(sceneMatch[1]);
      if (!isRecord(parsed)) throw new Error('scene.v1 不是对象');
      const beats = Array.isArray(parsed.beats)
        ? parsed.beats.map((value) => normalizeBeat(value, knownCharacters)).filter((value): value is GalBeat => Boolean(value)).slice(0, 6)
        : [];
      const suggestedReplies = Array.isArray(parsed.suggested_replies)
        ? parsed.suggested_replies
          .map((value, index) => normalizeReply(value, index))
          .filter((value): value is SuggestedReply => Boolean(value))
          .slice(0, 4)
        : [];
      if (beats.length) {
        return {
          version: 'scene.v1',
          beats,
          suggestedReplies,
          sourceMessageId: message.id,
          swipeId: message.swipeId ?? 0,
        };
      }
    } catch {
      return {
        version: 'fallback',
        beats: fallbackBeats(message.text, fallbackSpeakerId),
        suggestedReplies: [],
        sourceMessageId: message.id,
        swipeId: message.swipeId ?? 0,
        malformed: true,
      };
    }
  }
  return {
    version: 'fallback',
    beats: fallbackBeats(message.text, fallbackSpeakerId),
    suggestedReplies: [],
    sourceMessageId: message.id,
    swipeId: message.swipeId ?? 0,
  };
}

