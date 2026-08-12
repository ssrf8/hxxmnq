export const CARD_RECALL_STORAGE_KEY = 'gensokyo-garden:card-recall-enabled.v1';
let fallbackEnabled = true;

export function isCardRecallEnabled(): boolean {
  try {
    const stored = globalThis.localStorage?.getItem(CARD_RECALL_STORAGE_KEY);
    return stored == null ? fallbackEnabled : stored !== '0';
  } catch {
    return fallbackEnabled;
  }
}

export function setCardRecallEnabled(enabled: boolean): void {
  fallbackEnabled = enabled;
  try {
    globalThis.localStorage?.setItem(CARD_RECALL_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // The preference remains active only until this frame is recreated.
  }
}
