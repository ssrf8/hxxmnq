import type { ChatMessageView } from './types';

/**
 * Selects only the assistant floor belonging to the current user turn.
 * A pending user floor must never borrow an older assistant reply.
 */
export function assistantForCurrentTurn(
  messages: ChatMessageView[],
  preferredUserMessageId?: number,
): ChatMessageView | null {
  if (!messages.length) return null;
  let userIndex = Number.isInteger(preferredUserMessageId)
    ? messages.findIndex((message) => message.role === 'user' && message.id === preferredUserMessageId)
    : -1;
  if (userIndex < 0) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') {
        userIndex = index;
        break;
      }
    }
  }
  if (userIndex < 0) {
    return [...messages].reverse().find((message) => (
      message.role === 'assistant' && message.text.trim()
    )) ?? null;
  }
  for (let index = userIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role === 'user') return null;
    if (message.role === 'assistant' && message.text.trim()) return message;
  }
  return null;
}
