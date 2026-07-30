import type { GardenBridge, GardenState, OpeningContext, OpeningDraft, OpeningProgress } from './types';

const DRAFT_VERSION = 1;

export function buildOpeningMessage(draft: OpeningDraft): string {
  const appearance = draft.playerAppearance.trim() || '未作特别说明';
  const appearanceSentence = /[。！？.!?]$/u.test(appearance) ? appearance : `${appearance}。`;
  return `我叫「${draft.playerName.trim()}」，希望他人使用「${draft.playerPronouns.trim()}」称呼我。我的外貌大致是：${appearanceSentence}\n\n我依照祖父留下的安排，收到一个没有寄件地址的旧木匣。匣中有一封写给我的遗信，以及一件被称为“庭守钥”的沉睡遗物；信里提到一座会在结界间移动、已经荒废许久的庭园，我暂时把它称作「${draft.gardenName.trim()}」。\n\n我尚未正式继承这座庭园，也还没有穿过它的结界。请用一段沉浸式聊天序章介绍祖父留下庭园的缘由、这份遗产的边界与代价，以及庭守钥将如何带我抵达移动庭园。不要替我接受继承，不要提前写成继承成功，也不要让其他角色闯入；请把故事停在庭守钥于我面前苏醒、等待我亲手接过的时刻。`;
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
  private progress: OpeningProgress = { messageSubmitted: false, assistantResponded: false };

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
    this.button('gg-opening-enter').addEventListener('click', () => void this.enterGarden());
    this.button('gg-opening-repair').addEventListener('click', () => void this.repair());
  }

  async render(state: GardenState) {
    const committed = Boolean(state.meta?.opening_committed);
    this.root.hidden = committed;
    this.runtimeShell.hidden = !committed;
    if (committed) return;
    if (!this.context) {
      this.context = await this.bridge.getOpeningContext();
      const saved = this.loadDraft();
      this.writeDraft(saved ?? normalizedDraft({
        playerName: this.context.personaName,
        playerPronouns: '中性称谓',
        playerAppearance: this.context.personaDescription,
        gardenName: '无名庭园',
      }));
    }
    this.progress = await this.bridge.getOpeningProgress();
    this.renderProgress();
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

  private renderProgress() {
    const recovery = document.getElementById('gg-opening-recovery') as HTMLElement;
    recovery.hidden = !this.progress.messageSubmitted;
    this.form.hidden = this.progress.messageSubmitted;
    const story = document.getElementById('gg-opening-story') as HTMLElement;
    story.textContent = this.progress.storyText || '旧木匣已经打开。祖父留下的文字正在从泛黄信纸上浮现……';
    document.getElementById('gg-opening-progress')!.textContent = this.progress.assistantResponded
      ? '故事已经来到选择的门前。继承尚未完成，是否接过庭守钥由你决定。'
      : '祖父留下的故事仍在展开。若长时间没有回应，可以重新尝试生成。';
    this.button('gg-opening-enter').disabled = !this.progress.assistantResponded;
    this.button('gg-opening-repair').disabled = !this.progress.assistantResponded;
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
    this.form.setAttribute('aria-busy', 'true');
    const frozenChatId = this.context.chatId;
    try {
      this.saveDraft();
      await this.bridge.commitOpening(draft, buildOpeningMessage(draft), frozenChatId);
      this.setStatus('祖父留下的序章已经展开，读完后再决定是否继承庭园');
      this.requestRefresh();
    } catch (error) {
      this.setStatus(`序章载入失败：${error instanceof Error ? error.message : String(error)}。草稿仍在，可以安全重试。`, true);
    } finally {
      this.busy = false;
      this.button('gg-opening-commit').disabled = false;
      this.form.setAttribute('aria-busy', 'false');
    }
  }

  private async repair() {
    if (!this.context || this.busy || !this.progress.assistantResponded) return;
    this.busy = true;
    try {
      const result = await this.bridge.repairOpening(this.context.chatId);
      this.setStatus(result.messageCreated ? '已发送受限的开场变量修复请求' : '已找到先前的修复请求，正在安全重试生成');
      this.requestRefresh();
    } catch (error) {
      this.setStatus(`修复请求失败：${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      this.busy = false;
    }
  }

  private async enterGarden() {
    if (!this.context || this.busy || !this.progress.assistantResponded) return;
    this.busy = true;
    this.button('gg-opening-enter').disabled = true;
    try {
      const result = await this.bridge.enterGarden(this.context.chatId);
      sessionStorage.removeItem(storageKey(this.context.chatId));
      this.setStatus(result.initializedFromDefaults
        ? '你接过了庭守钥。初始状态已经补齐，移动庭园正在回应'
        : '你接过了庭守钥，移动庭园的结界已经开启');
      this.requestRefresh();
    } catch (error) {
      this.setStatus(`进入庭院失败：${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      this.busy = false;
      this.button('gg-opening-enter').disabled = false;
    }
  }

}
