import type { GardenBridge, GardenState, OpeningContext, OpeningDraft, OpeningProgress } from './types';

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
    this.button('gg-opening-retry').addEventListener('click', () => void this.retry());
    this.button('gg-opening-enter').addEventListener('click', () => void this.enterGarden());
    this.button('gg-opening-repair').addEventListener('click', () => void this.repair());
    this.button('gg-opening-native').addEventListener('click', () => void this.showNative());
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
    document.getElementById('gg-opening-progress')!.textContent = this.progress.assistantResponded
      ? '开场消息和首轮正文已经存在，但 MVU 未确认开场。可以直接从原始玩家消息恢复开场字段并进入庭院。'
      : '开场消息已经提交，但尚未收到完整回复。可以安全地再次触发生成。';
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
      const result = await this.bridge.initializeOpening(draft, frozenChatId);
      sessionStorage.removeItem(storageKey(frozenChatId));
      this.setStatus(result.alreadyCommitted
        ? '这组开场资料已经写入，正在进入庭院'
        : result.initializedFromDefaults
          ? '已载入完整初始状态并确认开场资料，正在进入庭院'
          : '开场资料已写入并复读确认，正在进入庭院');
      this.requestRefresh();
    } catch (error) {
      this.setStatus(`开局初始化失败：${error instanceof Error ? error.message : String(error)}。没有调用 LLM，草稿仍在。`, true);
    } finally {
      this.busy = false;
      this.button('gg-opening-commit').disabled = false;
      this.form.setAttribute('aria-busy', 'false');
    }
  }

  private async retry() {
    if (!this.context || this.busy) return;
    this.busy = true;
    try {
      if (this.progress.assistantResponded) {
        await this.bridge.regenerateLatest();
        this.setStatus('已请求重新生成首轮回复；等待 MVU 完成开场变量写入');
      } else {
        const draft = this.readDraft();
        await this.bridge.commitOpening(draft, buildOpeningMessage(draft), this.context.chatId);
        this.setStatus('已安全地再次触发首轮生成');
      }
      this.requestRefresh();
    } catch (error) {
      this.setStatus(`重新生成失败：${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      this.busy = false;
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
      this.setStatus(result.initializedFromDefaults
        ? '已补齐完整初始状态，并从原始玩家消息确认开场字段'
        : '已从原始玩家消息确认开场字段，正在进入庭院');
      this.requestRefresh();
    } catch (error) {
      this.setStatus(`进入庭院失败：${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      this.busy = false;
      this.button('gg-opening-enter').disabled = false;
    }
  }

  private async showNative() {
    const restored = await this.bridge.showNativeChat();
    this.setStatus(restored ? '已请求显示原生聊天' : '离线预览没有原生聊天');
  }
}
