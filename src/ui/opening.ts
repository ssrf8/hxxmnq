import type { GardenBridge, GardenState, OpeningContext, OpeningDraft } from './types';

const DRAFT_VERSION = 1;

export function buildOpeningMessage(draft: OpeningDraft): string {
  const appearance = draft.playerAppearance.trim() || '未作特别说明';
  const appearanceSentence = /[。！？.!?]$/u.test(appearance) ? appearance : `${appearance}。`;
  return `我叫「${draft.playerName.trim()}」，希望他人使用「${draft.playerPronouns.trim()}」称呼我。我的外貌大致是：${appearanceSentence}\n\n我依照祖父留下的安排，带着那件被称为“庭守钥”的遗物，从外界穿过一道不稳定的结界，来到这座已经荒废许久的庭园。我暂时把它称作「${draft.gardenName.trim()}」。\n\n这是我第一次真正踏入庭园。我还不了解这里的规则，也没有预设自己拥有成熟的超自然能力。请从我穿过结界、站在荒废庭园入口后的自由观察开始；不要替我决定接下来调查哪里、相信谁或说什么。`;
}

function storageKey(chatId: string) {
  return `gensokyo-garden:opening-draft:v${DRAFT_VERSION}:${encodeURIComponent(chatId || 'unknown')}`;
}

function normalizedDraft(value: Partial<OpeningDraft>): OpeningDraft {
  return {
    playerName: String(value.playerName ?? '').slice(0, 40),
    playerPronouns: String(value.playerPronouns ?? '中性称谓').slice(0, 40),
    playerAppearance: String(value.playerAppearance ?? '').slice(0, 500),
    gardenName: String(value.gardenName ?? '无名庭园').slice(0, 60),
  };
}

export class OpeningController {
  private context?: OpeningContext;
  private busy = false;

  constructor(
    private readonly bridge: GardenBridge,
    private readonly root: HTMLElement,
    private readonly runtimeShell: HTMLElement,
    private readonly setStatus: (text: string, error?: boolean) => void,
    private readonly requestRefresh: () => void,
  ) {
    this.form.addEventListener('input', () => { this.saveDraft(); this.renderPreview(); });
    this.form.addEventListener('submit', (event) => { event.preventDefault(); void this.commit(); });
    this.button('gg-opening-quick').addEventListener('click', () => this.applyPersona());
  }

  async render(state: GardenState) {
    const committed = Boolean(state.meta?.opening_committed);
    this.root.hidden = committed;
    this.runtimeShell.hidden = !committed;
    if (committed || this.context) return;
    this.context = await this.bridge.getOpeningContext();
    const saved = this.loadDraft();
    this.writeDraft(saved ?? normalizedDraft({
      playerName: this.context.personaName,
      playerPronouns: '中性称谓',
      playerAppearance: this.context.personaDescription,
      gardenName: '无名庭园',
    }));
    this.renderPreview();
  }

  private get form() { return document.getElementById('gg-opening-form') as HTMLFormElement; }
  private input(id: string) { return document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement; }
  private button(id: string) { return document.getElementById(id) as HTMLButtonElement; }

  private readDraft(): OpeningDraft {
    return normalizedDraft({
      playerName: this.input('gg-opening-name').value,
      playerPronouns: this.input('gg-opening-pronouns').value,
      playerAppearance: this.input('gg-opening-appearance').value,
      gardenName: this.input('gg-opening-garden').value,
    });
  }

  private writeDraft(draft: OpeningDraft) {
    this.input('gg-opening-name').value = draft.playerName;
    this.input('gg-opening-pronouns').value = draft.playerPronouns;
    this.input('gg-opening-appearance').value = draft.playerAppearance;
    this.input('gg-opening-garden').value = draft.gardenName;
  }

  private loadDraft(): OpeningDraft | undefined {
    if (!this.context) return undefined;
    try {
      const raw = sessionStorage.getItem(storageKey(this.context.chatId));
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as { version?: number; draft?: Partial<OpeningDraft> };
      return parsed.version === DRAFT_VERSION ? normalizedDraft(parsed.draft ?? {}) : undefined;
    } catch { return undefined; }
  }

  private saveDraft() {
    if (!this.context) return;
    sessionStorage.setItem(storageKey(this.context.chatId), JSON.stringify({ version: DRAFT_VERSION, draft: this.readDraft() }));
  }

  private renderPreview() {
    document.getElementById('gg-opening-preview')!.textContent = buildOpeningMessage(this.readDraft());
  }

  private applyPersona() {
    if (!this.context) return;
    const draft = this.readDraft();
    draft.playerName = this.context.personaName || draft.playerName;
    draft.playerAppearance = this.context.personaDescription || draft.playerAppearance;
    this.writeDraft(draft);
    this.saveDraft();
    this.renderPreview();
    this.setStatus(this.context.personaName ? '已读取当前 Persona，可继续修改' : '当前没有可读取的 Persona，保留现有草稿');
  }

  private async commit() {
    if (!this.context || this.busy) return;
    const draft = this.readDraft();
    if (!draft.playerName.trim()) return this.setStatus('请先填写玩家姓名', true);
    if (!draft.playerPronouns.trim()) return this.setStatus('请填写称谓或代词', true);
    if (!draft.gardenName.trim()) return this.setStatus('庭园总得有个暂用名吧', true);
    this.busy = true;
    this.button('gg-opening-commit').disabled = true;
    const frozenChatId = this.context.chatId;
    try {
      const result = await this.bridge.commitOpening(draft, buildOpeningMessage(draft), frozenChatId);
      this.setStatus(result.messageCreated ? '真实开场消息已提交，等待首轮回复与变量初始化' : '已找到先前的开场消息，正在安全重试生成');
      this.requestRefresh();
    } catch (error) {
      this.setStatus(`开局提交失败：${error instanceof Error ? error.message : String(error)}。草稿仍在。`, true);
    } finally {
      this.busy = false;
      this.button('gg-opening-commit').disabled = false;
    }
  }
}
