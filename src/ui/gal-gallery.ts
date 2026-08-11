import { parseGardenAction } from './event-settlement';
import { projectGalScene } from './gal-scene';
import type { ChatMessageView, GalSceneProjection, GardenState } from './types';

export interface GalGalleryEntry {
  messageId: number;
  userText: string;
  scene: GalSceneProjection;
}

function visibleUserText(message: ChatMessageView) {
  if (message.extra && Object.hasOwn(message.extra, 'gensokyoUserVisibleText')) {
    const explicit = message.extra.gensokyoUserVisibleText;
    return typeof explicit === 'string' ? explicit.trim() : '';
  }
  return message.text
    .split(/【(?:庭园正文协议|庭园在场快照|场景事实)[^】]*】/u)[0]
    .replace(/<GensokyoAction>[\s\S]*?<\/GensokyoAction>/giu, '')
    .replace(/^【庭园行动】\s*/u, '')
    .trim();
}

export function buildGalGalleryEntries(messages: ChatMessageView[], state: GardenState): GalGalleryEntry[] {
  const entries: GalGalleryEntry[] = [];
  let userText = '';
  let fallbackSpeakerId: string | null = null;
  for (const message of messages) {
    if (message.role === 'user') {
      userText = visibleUserText(message);
      const action = parseGardenAction(message.text);
      fallbackSpeakerId = action?.target_type === 'character' ? action.target_id ?? null : null;
      continue;
    }
    if (message.role !== 'assistant' || !message.text.trim()) continue;
    entries.push({
      messageId: message.id,
      userText,
      scene: projectGalScene(message, state, fallbackSpeakerId),
    });
    userText = '';
  }
  return entries;
}

export function filterGalGalleryEntries(entries: GalGalleryEntry[], startFloor: number, endFloor: number) {
  const lower = Math.min(Math.trunc(startFloor), Math.trunc(endFloor));
  const upper = Math.max(Math.trunc(startFloor), Math.trunc(endFloor));
  return entries.filter((entry) => entry.messageId >= lower && entry.messageId <= upper);
}
